// featureCommand.js - the "feature" command - add a topographic feature to a road plan model, or remove its features
// of a name

import {orderPlan, planText, readPlan} from './planFile.js';
import {parseArgs} from 'node:util';
import {planTopo} from '../../viewer/lib/model.js';


// The "feature" command's usage text lines
export const featureUsage = [
    'usage: plan feature <plan.json> TYPE [-n NAME] X,Y X,Y...',
    '       plan feature <plan.json> --remove NAME',
    '',
    '  Add a topographic feature to a road plan model - a "stream", "road", or "trail" line, or a "rock" or "exclusion"',
    '  area polygon, of points in the plan\'s coordinates - or remove its features of a name. To correct a feature,',
    '  remove it and add it again.'
];


// The feature types, and whether each is an area
const featureTypes = {'stream': false, 'road': false, 'trail': false, 'rock': true, 'exclusion': true};


// A point argument - two numbers
const rPoint = /^\d+(\.\d+)?,\d+(\.\d+)?$/;


// The "feature" command - "io" is the tools' input and output functions. Returns the command's exit code and its
// output text lines, or null if its arguments are invalid.
export function featureCommand(args, io) {
    let parsed;
    try {
        const options = {'name': {'type': 'string', 'short': 'n'}, 'remove': {'type': 'string'}};
        parsed = parseArgs({args, options, 'allowPositionals': true});
    } catch {
        return null;
    }
    const {'values': {name = null, remove = null}, 'positionals': [planPath, type, ...pointArgs]} = parsed;
    const isArea = type !== undefined && Object.hasOwn(featureTypes, type) ? featureTypes[type] : null;
    const isRemove = remove !== null && remove !== '' && name === null && type === undefined;
    const isAdd = remove === null && name !== '' && isArea !== null && pointArgs.length >= (isArea ? 3 : 2) &&
        pointArgs.every((arg) => rPoint.test(arg));
    if (planPath === undefined || !(isRemove || isAdd)) {
        return null;
    }

    // Read the road plan model
    const {plan, error} = readPlan(io, planPath);
    if (error !== undefined) {
        return {'code': 1, 'lines': error};
    }
    const features = plan.topography.features ?? [];
    const lines = [];
    if (isRemove) {
        // Remove the name's features
        const kept = features.filter((feature) => feature.name !== remove);
        if (kept.length === features.length) {
            return {'code': 1, 'lines': [`error: no feature named "${remove}"`]};
        }
        plan.topography.features = kept;
        lines.push(`Removed ${features.length - kept.length} feature${features.length - kept.length === 1 ? '' : 's'} named "${remove}"`);
    } else {
        // Add the feature - its size is reported, to check it against the site
        const points = pointArgs.map((arg) => {
            const [x, y] = arg.split(',').map(Number);
            return {x, y};
        });
        plan.topography.features = [...features, {type, ...(name !== null ? {name} : {}), points}];
        const {units} = plan;
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        let size = 0;
        for (let ix = isArea ? 0 : 1; ix < points.length; ix++) {
            const prev = points.at(ix - 1);
            const point = points[ix];
            size += isArea ? (prev.x * point.y - point.x * prev.y) * 0.5 : Math.hypot(point.x - prev.x, point.y - prev.y);
        }
        const sizeText = isArea ?
            `${(Math.abs(size) / (units === 'feet' ? 43560 : 10000)).toFixed(2)} ${units === 'feet' ? 'acres' : 'hectares'}` :
            `${Math.round(size)} ${units} long`;
        lines.push(
            `Added ${type}${name !== null ? ` "${name}"` : ''}: ${points.length} points, ${sizeText}, ` +
            `x ${Math.min(...xs)} to ${Math.max(...xs)}, y ${Math.min(...ys)} to ${Math.max(...ys)}`
        );
        const topo = planTopo(plan);
        const outside = points.filter(({x, y}) => x > topo.width || y > topo.height).length;
        if (outside > 0) {
            lines.push(
                `WARNING: ${outside} of its points ${outside === 1 ? 'is' : 'are'} outside the topography ` +
                `(${Math.round(topo.width)} x ${Math.round(topo.height)} ${units})`
            );
        }
    }
    io.writeFile(planPath, planText(orderPlan(plan)));
    lines.push(`Wrote ${planPath} - plot it to check the feature against the terrain`);
    return {'code': 0, lines};
}
