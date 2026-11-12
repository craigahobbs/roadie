// fixture.js - a small synthetic road plan for the tests - a hillside with a stream, a rock outcrop, and an exclusion area


// Create the fixture plan - "options" overrides the plan's options
export function fixturePlan(options = null) {
    const nRows = 31;
    const nCols = 41;
    const spacing = 10;
    const elevations = [];
    for (let row = 0; row < nRows; row++) {
        const y = (nRows - 1 - row) * spacing;
        const values = [];
        for (let col = 0; col < nCols; col++) {
            const x = col * spacing;
            // A slope rising to the north, a ridge to the east, and a stream valley through the middle
            values.push(Math.round((500 + 0.12 * y + 20 * Math.exp(-(((x - 300) / 60) ** 2)) - 8 * Math.exp(-(((x - 200) / 25) ** 2))) * 10) / 10);
        }
        elevations.push(values);
    }
    return {
        'title': 'Fixture Plan',
        'description': ['A synthetic plan for the **tests**.', '', '- One', '- Two'],
        'units': 'feet',
        'topography': {
            spacing,
            elevations,
            'features': [
                {'type': 'stream', 'name': 'Test Creek', 'points': [{'x': 200, 'y': 0}, {'x': 200, 'y': 300}]},
                {'type': 'rock', 'points': [{'x': 260, 'y': 100}, {'x': 320, 'y': 100}, {'x': 320, 'y': 160}, {'x': 260, 'y': 160}]},
                {'type': 'exclusion', 'name': 'Barn', 'points': [{'x': 40, 'y': 240}, {'x': 80, 'y': 240}, {'x': 80, 'y': 280}, {'x': 40, 'y': 280}]}
            ]
        },
        'start': {'x': 20, 'y': 30, 'label': 'Road'},
        'end': {'x': 380, 'y': 250},
        'options': options ?? [
            {
                'name': 'Direct',
                'description': ['The *direct* route.'],
                'section': {'width': 12},
                'alignment': [{'x': 20, 'y': 30}, {'x': 200, 'y': 140, 'z': 517}, {'x': 300, 'y': 150}, {'x': 380, 'y': 250}],
                'structures': [
                    {'type': 'culvert', 'station': 211, 'name': 'Creek culvert'},
                    {'type': 'turnout', 'station': 100, 'endStation': 150, 'side': 'left'},
                    {'type': 'retainingWall', 'station': 260, 'endStation': 300}
                ]
            },
            {
                'name': 'Bridge - East',
                'section': {'width': 14, 'surface': 'asphalt'},
                'alignment': [{'x': 20, 'y': 30}, {'x': 150, 'y': 60}, {'x': 250, 'y': 60}, {'x': 380, 'y': 250}],
                'structures': [
                    {'type': 'bridge', 'station': 160, 'endStation': 250},
                    {'type': 'existingRoad', 'station': 300, 'endStation': 400}
                ]
            }
        ]
    };
}
