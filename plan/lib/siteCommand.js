// siteCommand.js - the "site" command - create a road plan's site from a road site model: its topography, from the
// USGS 3D Elevation Program's 1 meter elevation models, its georeference, its start and end points, its features
// (the USGS National Map's streams, roads, and trails, and the site's exclusion areas), and its topographic map image

import {elevationModels, roadLines, streamLines, topoMapImageUrl} from './usgs.js';
import {exclusionFeatures, lineFeatures} from './features.js';
import {layoutBox, layoutGeoreference, layoutLatLong, readTile, round, siteLayout, siteTerrain} from './terrain.js';
import {orderPlan, planText} from './planFile.js';
import {elevation as planElevation, planTopo} from '../../viewer/lib/model.js';
import {latLongText} from '../../viewer/lib/geo.js';
import {validateSite} from './site.js';


// The "site" command's usage text lines
export const siteUsage = [
    'usage: plan site <site.json> <plan.json>',
    '',
    '  Create a road plan model\'s site from a road site model - its topography, from the USGS 3D Elevation Program\'s',
    '  1 meter elevation models, its georeference, its start and end points, its streams, roads, and exclusion areas,',
    '  and its topographic map image ("<plan>.png"). An existing plan\'s options are kept.'
];


// The topographic map image's longer side, in pixels
const imageSize = 2000;


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

    // The topography - the site's elevation model tiles are cached in the plan's work directory - and the streams
    const layout = siteLayout(site);
    const planBase = planPath.replace(/\.json$/i, '');
    const directory = `${planBase}.work/terrain`;
    const box = layoutBox(layout);
    let terrain;
    let streams;
    try {
        const models = await elevationModels(io.getJson, box);
        terrain = await siteTerrain(layout, models, (model, region) => readTile(io, directory, model, layout, region));
        streams = lineFeatures(layout, 'stream', await streamLines(io.getJson, box));
    } catch ({message}) {
        return error([`error: ${message}`]);
    }

    // The roads and trails, and the topographic map image, are for reference - the plan is made without them
    const warnings = [];
    let roads = [];
    try {
        roads = lineFeatures(layout, 'road', await roadLines(io.getJson, box));
    } catch ({message}) {
        warnings.push(`warning: The site has no roads - ${message}`);
    }
    const {nCols, nRows, spacing} = layout;
    const imagePath = `${planBase}.png`;
    let image = null;
    try {
        const [south, west] = layoutLatLong(layout, 0, 0);
        const [north, east] = layoutLatLong(layout, (nCols - 1) * spacing, (nRows - 1) * spacing);
        const aspect = (nRows - 1) / (nCols - 1);
        const imageUrl = topoMapImageUrl(
            [west, south, east, north].map((degrees) => round(degrees, 6)),
            Math.round(imageSize * Math.min(1, 1 / aspect)),
            Math.round(imageSize * Math.min(1, aspect))
        );
        io.writeBytes(imagePath, await io.getBytes(imageUrl));
        image = imagePath.slice(imagePath.lastIndexOf('/') + 1);
    } catch ({message}) {
        warnings.push(`warning: The site has no topographic map image - ${message}`);
    }

    // The elevation rows, in plan units
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

    // The features - the site's streams, roads, and exclusion areas, and the plan's other features
    const exclusions = exclusionFeatures(layout, site);
    const exclusionNames = new Set(exclusions.map(({name}) => name));
    const features = [
        ...streams,
        ...roads,
        ...exclusions,
        ...(shifted.topography?.features ?? []).filter(
            ({type, name}) => type === 'rock' || (type === 'exclusion' && !exclusionNames.has(name))
        )
    ];

    // Update the plan
    const {start, end} = layout;
    const topography = {
        ...shifted.topography,
        spacing,
        elevations,
        'contourInterval': contourInterval(maxZ - minZ, units),
        'sources': terrain.surveys.map(({name, date, url}) => ({
            'name': `USGS 3D Elevation Program 1 meter elevation model ${name}`, ...(date !== '' ? {date} : {}), url
        })),
        features
    };
    plan = orderPlan({
        ...shifted,
        'title': site.title,
        ...(image !== null ? {image} : {}),
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
    lines.push(
        `Features: ${featureCount(streams, 'stream')}, ${featureCount(roads, 'road')}, ${featureCount(exclusions, 'exclusion area')}`
    );
    if (image !== null) {
        lines.push(`Topographic map image: ${imagePath}`);
    }
    lines.push(...warnings);
    const topo = planTopo(plan);
    for (const [name, point] of [['start', start], ['end', end]]) {
        const ground = planElevation(topo, point.x, point.y);
        lines.push(`${name}: "${point.label}" (${point.x}, ${point.y}) at ${latLongText(layoutLatLong(layout, point.x, point.y))}, ` +
            `ground ${ground.toFixed(1)}`);
    }
    lines.push(`Wrote ${planPath}`);
    return {'code': 0, lines};
}


// Describe a count of features
function featureCount(features, name) {
    return `${features.length} ${name}${features.length === 1 ? '' : 's'}`;
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
