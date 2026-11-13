// planFile.js - the road plan model file's text


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
