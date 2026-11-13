// siteCommand.js - the "site" command - create a road plan's site from a road site model: its topography, from the
// USGS 3D Elevation Program's 1 meter elevation models, its georeference, and its start and end points

import {layoutBox, layoutGeoreference, layoutLatLong, readTile, round, siteLayout, siteTerrain} from './terrain.js';
import {orderPlan, planText} from './planFile.js';
import {elevation as planElevation, planTopo} from '../../viewer/lib/model.js';
import {elevationModels} from './usgs.js';
import {latLongText} from '../../viewer/lib/geo.js';
import {validateSite} from './site.js';


// The "site" command's usage text lines
export const siteUsage = [
    'usage: plan site <site.json> <plan.json>',
    '',
    '  Create a road plan model\'s site from a road site model - its topography, from the USGS 3D Elevation Program\'s',
    '  1 meter elevation models, its georeference, and its start and end points. An existing plan\'s options are kept.'
];


// The elevations' decimal places - a hundredth of a meter, or a tenth of a foot
const elevationDigits = {'feet': 1, 'meters': 2};


// The "site" command - "io" is the tools' input and output functions. Returns the command's exit code and its
// output text lines, or null if its arguments are invalid.
export async function siteCommand(args, io) {
    if (args.length !== 2 || args.some((arg) => arg.startsWith('-'))) {
        return null;
    }
    const [sitePath, planPath] = args;
    const error = (lines) => ({'code': 1, 'lines': lines});

    // Load and validate the road site model
    let siteValue;
    try {
        siteValue = JSON.parse(io.readFile(sitePath));
    } catch {
        return error([`error: Could not load the road site "${sitePath}"`]);
    }
    const validated = validateSite(siteValue);
    if ('error' in validated) {
        return error([`error: The road site "${sitePath}" is invalid:`, '', validated.error]);
    }
    const {site} = validated;
    const {units} = site;

    // The existing plan, if any
    let plan = {};
    let planFile = null;
    try {
        planFile = io.readFile(planPath);
    } catch {
        // There is no plan yet
    }
    if (planFile !== null) {
        try {
            plan = JSON.parse(planFile);
        } catch {
            return error([`error: Could not load the road plan "${planPath}"`]);
        }
    }

    // The topography - the site's elevation model tiles are cached in the plan's work directory
    const layout = siteLayout(site);
    const directory = `${planPath.replace(/\.json$/i, '')}.work/terrain`;
    let terrain;
    try {
        const models = await elevationModels(io.getJson, layoutBox(layout));
        terrain = await siteTerrain(layout, models, (model) => readTile(io, directory, model, layout));
    } catch ({message}) {
        return error([`error: ${message}`]);
    }

    // The elevation rows, in plan units
    const {nCols, nRows, spacing} = layout;
    const digits = elevationDigits[units];
    const elevations = [];
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let row = 0; row < nRows; row++) {
        const values = [];
        for (let col = 0; col < nCols; col++) {
            const elevation = round(terrain.elevations[row * nCols + col] / layout.scale, digits);
            minZ = Math.min(minZ, elevation);
            maxZ = Math.max(maxZ, elevation);
            values.push(elevation);
        }
        elevations.push(values);
    }

    // An existing plan's options and features are in its coordinates - they're moved to the new grid's
    const georeference = layoutGeoreference(layout);
    const shifted = shiftPlan(plan, georeference);
    if (shifted === null) {
        return error([
            `error: The road plan "${planPath}" isn't a plan of this site - its georeference's center isn't the site's. ` +
                'Plan the site again (remove the plan), or restore its start and end points.'
        ]);
    }

    // Update the plan
    const {start, end} = layout;
    const topography = {
        ...shifted.topography,
        spacing,
        elevations,
        'contourInterval': contourInterval(maxZ - minZ, units),
        'sources': terrain.surveys.map(({name, date, url}) => ({
            'name': `USGS 3D Elevation Program 1 meter elevation model ${name}`, ...(date !== '' ? {date} : {}), url
        }))
    };
    plan = orderPlan({
        ...shifted,
        'title': site.title,
        units,
        georeference,
        topography,
        start,
        end,
        ...('criteria' in site ? {'criteria': site.criteria} : {}),
        ...('costRates' in site ? {'costRates': site.costRates} : {}),
        'options': shifted.options ?? []
    });
    io.writeFile(planPath, planText(plan));

    // Report
    const lines = [
        `Grid: ${nCols} x ${nRows} at ${spacing} ${units} spacing ` +
            `(${Math.round((nCols - 1) * spacing)} x ${Math.round((nRows - 1) * spacing)} ${units})`,
        `Elevations: ${minZ.toFixed(1)} to ${maxZ.toFixed(1)} ${units}, contours every ${topography.contourInterval} ${units}`
    ];
    for (const {name, date} of terrain.surveys) {
        lines.push(`Elevation model: ${name}${date !== '' ? ` (${date})` : ''}`);
    }
    if (terrain.filled > 0) {
        lines.push(`Grid points without an elevation, filled from the points around them: ${terrain.filled}`);
    }
    const topo = planTopo(plan);
    for (const [name, point] of [['start', start], ['end', end]]) {
        const ground = planElevation(topo, point.x, point.y);
        lines.push(`${name}: "${point.label}" (${point.x}, ${point.y}) at ${latLongText(layoutLatLong(layout, point.x, point.y))}, ` +
            `ground ${ground.toFixed(1)}`);
    }
    lines.push(`Wrote ${planPath}`);
    return {'code': 0, lines};
}


// The contour intervals, in feet and meters
const contourIntervals = {'feet': [1, 2, 5, 10, 20, 40, 100, 200], 'meters': [0.5, 1, 2, 5, 10, 20, 50, 100]};


// Choose a topography's contour interval for its elevation range - about 40 contours, at most
function contourInterval(range, units) {
    const intervals = contourIntervals[units];
    return intervals.find((interval) => range / interval <= 40) ?? intervals.at(-1);
}


// Move an existing plan to a new grid's coordinates - its features' and options' points are shifted by the grids'
// origins' difference. Returns the plan, or null if its georeference's center isn't the new georeference's.
function shiftPlan(plan, georeference) {
    const planGeoreference = plan.georeference ?? null;
    if (planGeoreference === null) {
        return 'topography' in plan ? null : plan;
    }
    if (planGeoreference.latitude !== georeference.latitude || planGeoreference.longitude !== georeference.longitude) {
        return null;
    }
    const dx = georeference.x - planGeoreference.x;
    const dy = georeference.y - planGeoreference.y;
    const shift = (point) => ({...point, 'x': round(point.x + dx, 2), 'y': round(point.y + dy, 2)});
    const shifted = {...plan};
    if ('features' in plan.topography) {
        shifted.topography = {
            ...plan.topography,
            'features': plan.topography.features.map((feature) => ({...feature, 'points': feature.points.map(shift)}))
        };
    }
    if ('options' in plan) {
        shifted.options = plan.options.map((option) => ({...option, 'alignment': option.alignment.map(shift)}));
    }
    return shifted;
}
