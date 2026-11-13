// routeCli.js - the "route" and "profile" commands: engineer a road option, or re-design an existing option's profile
// and structures (a port of the Python planning tools')

import {designStructures, existingMask} from './structures.js';
import {hypot, pairwiseSum, pyFixed, pyRepr, pyRound} from './numeric.js';
import {orderPlan, planText} from './planFile.js';
import {resamplePolyline, routeSearch, smoothCurves} from './route.js';
import {createDesign} from './design.js';
import {designProfile} from './profile.js';
import {parseArgs} from 'node:util';
import {planTopo} from '../../viewer/lib/model.js';


// The route and profile commands' usage text lines
export const routeUsage = [
    'usage: plan route <plan.json> -n NAME [-v X,Y]... [options]',
    '       plan profile <plan.json> -n NAME [options]',
    '',
    '  route      Engineer a road option - a least-cost horizontal alignment search (through the via points), a',
    '             vertical profile design, and structures - and add it to the road plan model (or replace it)',
    '  profile    Re-design an existing option\'s vertical profile and structures (after its alignment is edited)',
    '',
    'options:',
    '  -n, --name NAME                the option name (an existing option is replaced)',
    '  -d, --description TEXT         an option description line (may be repeated)',
    '  -w, --width WIDTH              the road width (default is 14 feet / 4.3 meters)',
    '  -s, --surface SURFACE          the road surface - native, gravel, asphalt, or concrete (default is gravel)',
    '  --cut-slope SLOPE              the cut slope ratio H:V (default is 1)',
    '  --fill-slope SLOPE             the fill slope ratio H:V (default is 1.5)',
    '  -g, --grade GRADE              the design grade, in percent (default is 1 less than the maximum grade)',
    '  --switchback-grade GRADE       the maximum grade on tight curves, in percent (default is 8)',
    '  --turnouts SPACING             the turnout spacing, 0 for none (default is 400 feet / 120 meters for roads',
    '                                 under 16 feet wide)',
    '  --bridge-fill DEPTH            replace stream crossing fills deeper than this with a bridge, up to 150 feet /',
    '                                 45 meters long (default is no bridges)',
    '  --existing-road STATION,END    a station range where the road follows an existing road - its grade follows',
    '                                 the ground, with no earthwork or structures (may be repeated; profile keeps',
    '                                 the option\'s existing roads by default)',
    '  -v, --via X,Y                  a via point (route only; may be repeated)',
    '  --grade-weight WEIGHT          the excess grade penalty weight (route only; default is 1)',
    '  --slope-weight WEIGHT          the side slope earthwork weight (route only; default is 1)'
];


// The route and profile commands - each is a function of the command's arguments and the command line's input and
// output functions that returns the command's exit code and its output text lines, or null if the arguments are invalid
export const routeCommands = {
    'route': (args, io) => routeCommand('route', args, io),
    'profile': (args, io) => routeCommand('profile', args, io)
};


// The commands' options, and the route command's
const commandOptions = {
    'name': {'type': 'string', 'short': 'n'},
    'description': {'type': 'string', 'short': 'd', 'multiple': true},
    'width': {'type': 'string', 'short': 'w'},
    'surface': {'type': 'string', 'short': 's', 'default': 'gravel'},
    'cut-slope': {'type': 'string', 'default': '1'},
    'fill-slope': {'type': 'string', 'default': '1.5'},
    'grade': {'type': 'string', 'short': 'g'},
    'switchback-grade': {'type': 'string', 'default': '8'},
    'turnouts': {'type': 'string'},
    'bridge-fill': {'type': 'string'},
    'existing-road': {'type': 'string', 'multiple': true}
};
const routeOptions = {
    'via': {'type': 'string', 'short': 'v', 'multiple': true},
    'grade-weight': {'type': 'string', 'default': '1'},
    'slope-weight': {'type': 'string', 'default': '1'}
};


// The road surfaces
const surfaces = ['native', 'gravel', 'asphalt', 'concrete'];


// Parse the commands' arguments - returns the arguments object, or null if they're invalid
function parseCommandArgs(command, args) {
    let parsed;
    try {
        parsed = parseArgs({args, 'options': {...commandOptions, ...(command === 'route' ? routeOptions : {})}, 'allowPositionals': true});
    } catch {
        return null;
    }
    const {values, positionals} = parsed;
    const parseNumber = (text) => (text.trim() === '' ? NaN : Number(text));
    const number = (name) => (name in values ? parseNumber(values[name]) : null);
    const numbers = (name) => (values[name] ?? []).map((text) => text.split(',').map(parseNumber));
    const commandArgs = {
        'plan': positionals[0],
        'name': values.name,
        'description': values.description ?? null,
        'width': number('width'),
        'surface': values.surface,
        'cutSlope': number('cut-slope'),
        'fillSlope': number('fill-slope'),
        'grade': number('grade'),
        'switchbackGrade': number('switchback-grade'),
        'turnouts': number('turnouts'),
        'bridgeFill': number('bridge-fill'),
        'existingRoads': 'existing-road' in values ? numbers('existing-road') : null,
        'via': numbers('via'),
        'gradeWeight': number('grade-weight'),
        'slopeWeight': number('slope-weight')
    };

    // The plan, the option name, and valid numbers are required
    if (positionals.length !== 1 || commandArgs.name === undefined || !surfaces.includes(commandArgs.surface) ||
        Object.values(commandArgs).some(Number.isNaN) ||
        [...commandArgs.existingRoads ?? [], ...commandArgs.via].some((pair) => pair.length !== 2 || pair.some(Number.isNaN))) {
        return null;
    }
    return commandArgs;
}


// The route search's soft grade bands and grade margins - if the profile can't reach the end elevation within the grade
// limits, the route is searched again with stricter grade penalties
const routeSearches = [[0.03, 0], [0.01, 0.005], [0, 0.015], [0, 0.03]];


// The "route" and "profile" commands
function routeCommand(command, args, io) {
    const commandArgs = parseCommandArgs(command, args);
    if (commandArgs === null) {
        return null;
    }

    // Load the road plan model
    let plan;
    try {
        plan = JSON.parse(io.readFile(commandArgs.plan));
    } catch {
        return {'code': 1, 'lines': [`error: could not load the road plan "${commandArgs.plan}"`]};
    }
    const {units} = plan;
    const topo = planTopo(plan);
    const design = createDesign(plan, commandArgs);
    const options = plan.options ?? [];
    const ixOption = options.findIndex((option) => option.name === commandArgs.name);
    const existingOption = ixOption === -1 ? null : options[ixOption];
    const lines = [];

    // The existing roads - the argument ranges, or for profile, the option's existing road structures
    let existingRoads = [];
    if (commandArgs.existingRoads !== null) {
        ({existingRoads} = commandArgs);
    } else if (command === 'profile' && existingOption !== null) {
        existingRoads = (existingOption.structures ?? []).filter((structure) => structure.type === 'existingRoad').map(
            (structure) => [structure.station, structure.endStation]
        );
    }

    // Design the alignment and its profile
    let alignment;
    let designed;
    if (command === 'route') {
        // Search for the horizontal alignment through the via points - each leg starts with the previous leg's heading
        const waypoints = [[plan.start.x, plan.start.y], ...commandArgs.via, [plan.end.x, plan.end.y]];
        for (const [softBand, gradeMargin] of routeSearches) {
            const path = [];
            let heading = null;
            let lattice;
            for (let ixWaypoint = 1; ixWaypoint < waypoints.length; ixWaypoint++) {
                const leg = routeSearch(
                    topo, design, waypoints[ixWaypoint - 1], waypoints[ixWaypoint], commandArgs.gradeWeight, commandArgs.slopeWeight,
                    heading, softBand, gradeMargin
                );
                if (leg === null) {
                    return {'code': 1, 'lines': ['error: no route found (blocked by exclusion areas or the topography boundary?)']};
                }
                ({heading, lattice} = leg);
                path.push(...(path.length === 0 ? leg.path : leg.path.slice(1)));
            }
            const interval = Math.max(design.stationInterval, Math.min(lattice, topo.spacing) * 0.5);
            const smooth = smoothCurves(path, interval, design.minRadius);
            alignment = resamplePolyline(smooth.x, smooth.y, interval);
            designed = designProfile(
                topo, design, alignment.x, alignment.y, alignment.stations, existingMask(alignment.stations, existingRoads)
            );
            const endDepth = designed.ground.at(-1) - designed.profile.at(-1);
            if (Math.abs(endDepth) <= design.tieTolerance) {
                break;
            }
            lines.push(`The profile ends ${pyFixed(endDepth, 1)} ${units} below the end point - searching with stricter grades`);
        }
    } else {
        if (existingOption === null) {
            return {'code': 1, 'lines': [`error: no option named "${commandArgs.name}"`]};
        }
        const points = existingOption.alignment;
        const interval = Math.max(design.stationInterval, topo.spacing * 0.5);
        alignment = resamplePolyline(points.map((point) => point.x), points.map((point) => point.y), interval);
        designed = designProfile(
            topo, design, alignment.x, alignment.y, alignment.stations, existingMask(alignment.stations, existingRoads)
        );
    }
    const {x, y, stations} = alignment;
    const {profile, ground, sideSlope} = designed;
    const last = x.length - 1;

    // Structures (the existing roads within the road's length, measured along the alignment points as the viewer does -
    // an existing road to the road's end is to its last station, so nothing is placed between them)
    const lengths = new Float64Array(last);
    for (let ix = 0; ix < last; ix++) {
        lengths[ix] = hypot(x[ix + 1] - x[ix], y[ix + 1] - y[ix]);
    }
    const alignmentLength = Math.floor(pairwiseSum(lengths) * 10) / 10;
    existingRoads = existingRoads.filter(([start]) => start < alignmentLength);
    const structures = designStructures(topo, design, x, y, stations, profile, sideSlope, existingRoads, alignmentLength);

    // Create the option
    const description = commandArgs.description ?? existingOption?.description ?? null;
    const option = {
        'name': commandArgs.name,
        ...(description !== null && description.length > 0 ? {description} : {}),
        'section': {'width': design.width, 'cutSlope': design.cutSlope, 'fillSlope': design.fillSlope, 'surface': design.surface},
        'alignment': Array.from(x, (px, ix) => ({'x': pyRound(px, 2), 'y': pyRound(y[ix], 2), 'z': pyRound(profile[ix], 2)})),
        structures
    };
    if (existingOption !== null) {
        options[ixOption] = option;
    } else {
        options.push(option);
    }
    plan.options = options;
    io.writeFile(commandArgs.plan, planText(orderPlan(plan)));

    // Report (the new road's grades)
    const mask = existingMask(stations, existingRoads);
    let maxGrade = -Infinity;
    let maxDepth = -Infinity;
    let minDepth = Infinity;
    for (let ix = 0; ix <= last; ix++) {
        if (ix > 0) {
            const grade = mask[ix] && mask[ix - 1] ? 0 : Math.abs(profile[ix] - profile[ix - 1]) / (stations[ix] - stations[ix - 1]) * 100;
            maxGrade = Math.max(maxGrade, grade);
        }
        maxDepth = Math.max(maxDepth, ground[ix] - profile[ix]);
        minDepth = Math.min(minDepth, ground[ix] - profile[ix]);
    }
    lines.push(
        `Option "${commandArgs.name}": ${pyFixed(stations[last], 0)} ${units} long, ${x.length} alignment points, ` +
        `max grade ${pyFixed(maxGrade, 1)}%, max cut ${pyFixed(Math.max(0, maxDepth), 1)}, max fill ${pyFixed(Math.max(0, -minDepth), 1)}`
    );
    lines.push(`Structures: ${structures.map((structure) => `${structure.type} at ${pyRepr(structure.station)}`).join(', ') || 'none'}`);
    for (const [label, ixEnd] of [['start', 0], ['end', last]]) {
        const tie = profile[ixEnd] - ground[ixEnd];
        if (Math.abs(tie) > design.tieTolerance) {
            lines.push(
                `WARNING: the profile ${label} is ${tie < 0 ? '' : '+'}${pyFixed(tie, 1)} ${units} from the ground - ` +
                'the grade limit can\'t be met on this alignment (try other via points or a longer route)'
            );
        }
    }
    lines.push(`Wrote ${commandArgs.plan} - run "make evaluate FILE=${commandArgs.plan}" for the full analysis and cost`);
    return {'code': 0, lines};
}
