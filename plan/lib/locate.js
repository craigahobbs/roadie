// locate.js - the "locate" command - convert latitudes and longitudes to a road plan's coordinates, and back

import {elevation, planTopo} from '../../viewer/lib/model.js';
import {latLongText, planLatLong, project, transverseMercator} from '../../viewer/lib/geo.js';
import {metersPerFoot} from './terrain.js';
import {readPlan} from './planFile.js';


// The "locate" command's usage text lines
export const locateUsage = [
    'usage: plan locate <plan.json> [--xy] <latitude,longitude | x,y>...',
    '',
    '  Convert latitudes and longitudes to a road plan model\'s coordinates - or, with --xy, the plan\'s coordinates to',
    '  latitudes and longitudes - with the ground elevation there'
];


// A point argument - two numbers
const rPoint = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;


// The "locate" command - "io" is the tools' input and output functions. Returns the command's exit code and its
// output text lines, or null if its arguments are invalid.
export function locateCommand(args, io) {
    const [planPath, ...rest] = args;
    const isXY = rest[0] === '--xy';
    const points = (isXY ? rest.slice(1) : rest).map((arg) => (rPoint.test(arg) ? arg.split(',').map(Number) : null));
    if (planPath === undefined || planPath.startsWith('-') || points.length === 0 || points.includes(null)) {
        return null;
    }

    // Read the road plan model
    const {plan, error} = readPlan(io, planPath);
    if (error !== undefined) {
        return {'code': 1, 'lines': error};
    }
    const georeference = plan.georeference ?? null;
    if (georeference === null) {
        return {'code': 1, 'lines': [`error: The road plan "${planPath}" has no georeference`]};
    }

    // Convert the points
    const topo = planTopo(plan);
    const scale = plan.units === 'feet' ? metersPerFoot : 1;
    const projection = transverseMercator(georeference.latitude, georeference.longitude);
    const lines = [];
    for (const [first, second] of points) {
        let x = first;
        let y = second;
        let latLong = [first, second];
        if (isXY) {
            latLong = planLatLong(plan, x, y);
        } else {
            const [east, north] = project(projection, first, second);
            x = Math.round((georeference.x + east / scale) * 10) / 10;
            y = Math.round((georeference.y + north / scale) * 10) / 10;
        }
        const ground = elevation(topo, x, y);
        lines.push(`latitude and longitude ${latLongText(latLong)} - x ${x}, y ${y} - ` +
            `${ground !== null ? `ground elevation ${ground.toFixed(1)}` : 'outside the topography'}`);
    }
    return {'code': 0, lines};
}
