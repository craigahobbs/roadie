// planFile.js - the road plan model file - reading it, and its text

import {validatePlan} from '../../viewer/lib/model.js';


// Read and validate a road plan model file - "io" is the tools' input and output functions. Returns an object with the
// "plan" or, if it can't be loaded or is invalid, the "error" text lines. A site's plan, without options yet, is a
// plan.
export function readPlan(io, planPath) {
    let planValue;
    try {
        planValue = JSON.parse(io.readFile(planPath));
    } catch {
        return {'error': [`error: Could not load the road plan "${planPath}"`]};
    }
    const siteOnly = Array.isArray(planValue?.options) && planValue.options.length === 0;
    const validated = validatePlan(siteOnly ? {...planValue, 'options': [siteOption]} : planValue);
    if ('error' in validated) {
        return {'error': [`error: The road plan "${planPath}" is invalid:`, '', validated.error]};
    }
    return {'plan': siteOnly ? {...validated.plan, 'options': []} : validated.plan};
}


// An option that stands in for a site's options, to validate the site's plan
const siteOption = {'name': 'Site', 'section': {'width': 1}, 'alignment': [{'x': 0, 'y': 0}, {'x': 1, 'y': 0}]};


// The road plan model's members, in schema order
const planMembers = [
    'title', 'description', 'image', 'units', 'georeference', 'topography', 'start', 'end', 'criteria', 'costRates', 'options'
];


// Order a road plan model's members - the model's members in schema order, then any others
export function orderPlan(plan) {
    const ordered = {};
    for (const member of planMembers) {
        if (member in plan) {
            ordered[member] = plan[member];
        }
    }
    return {...ordered, ...plan};
}


// The elevation rows' placeholder in the plan's JSON text
const elevationsPlaceholder = '__ELEVATIONS__';


// Create a road plan model file's text - the plan's JSON with one elevation row per line, for readability
export function planText(plan) {
    const text = JSON.stringify({...plan, 'topography': {...plan.topography, 'elevations': elevationsPlaceholder}}, null, 2);
    const rows = plan.topography.elevations.map((row) => `      [${row.join(', ')}]`);
    return `${text.replace(`"${elevationsPlaceholder}"`, () => `[\n${rows.join(',\n')}\n    ]`)}\n`;
}
