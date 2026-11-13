// planFixtures.js - road plan model test fixtures (the MarkdownUp viewer's test plans) - their tests are in model.test.js


// A simple plan - a road running east across a plane rising 10% to the north, on grade at the centerline
export function planSimple() {
    const rows = [];
    for (let row = 0; row < 5; row++) {
        const elevations = [];
        for (let col = 0; col < 5; col++) {
            elevations.push(100 + 0.1 * (4 - row) * 10);
        }
        rows.push(elevations);
    }
    return {
        'title': 'Simple Plan',
        'units': 'meters',
        'topography': {'spacing': 10, 'elevations': rows},
        'start': {'x': 0, 'y': 20},
        'end': {'x': 40, 'y': 20},
        'options': [
            {
                'name': 'Flat',
                'section': {'width': 10},
                'alignment': [{'x': 0, 'y': 20, 'z': 102}, {'x': 40, 'y': 20, 'z': 102}]
            }
        ]
    };
}


// A complex plan - a steep 80% north-rising slope that triggers every warning and structure
export function planComplex() {
    const rows = [];
    for (let row = 0; row < 9; row++) {
        const elevations = [];
        for (let col = 0; col < 9; col++) {
            elevations.push(100 + 8 * (8 - row));
        }
        rows.push(elevations);
    }
    return {
        'title': 'Complex Plan',
        'description': ['A complex plan.'],
        'image': 'map.png',
        'units': 'feet',
        'topography': {
            'spacing': 10,
            'elevations': rows,
            'contourInterval': 4,
            'features': [
                {'type': 'stream', 'name': 'Creek A', 'points': [{'x': 12, 'y': -5}, {'x': 12, 'y': 90}]},
                {'type': 'stream', 'points': [{'x': 45, 'y': 0}, {'x': 45, 'y': 80}]},
                {'type': 'stream', 'name': 'Creek C', 'points': [{'x': 48, 'y': 0}, {'x': 48, 'y': 80}]},
                {
                    'type': 'rock',
                    'name': 'Ledge',
                    'points': [{'x': 15, 'y': 10}, {'x': 25, 'y': 10}, {'x': 25, 'y': 30}, {'x': 15, 'y': 30}]
                },
                {
                    'type': 'exclusion',
                    'name': 'Shed',
                    'points': [{'x': 62, 'y': 10}, {'x': 68, 'y': 10}, {'x': 68, 'y': 30}, {'x': 62, 'y': 30}]
                }
            ]
        },
        'start': {'x': -15, 'y': 20, 'label': 'Road'},
        'end': {'x': 75, 'y': 60},
        'criteria': {'maxGrade': 10, 'maxWallHeight': 3},
        'options': [
            {
                'name': 'Main',
                'description': ['The main option.'],
                'section': {'width': 10, 'cutSlope': 1.5, 'surface': 'asphalt'},
                'alignment': [
                    {'x': 0, 'y': 20, 'z': 114},
                    {'x': 20, 'y': 20, 'z': 114},
                    {'x': 20, 'y': 20, 'z': 114},
                    {'x': 40, 'y': 20, 'z': 114},
                    {'x': 50, 'y': 20, 'z': 116},
                    {'x': 60, 'y': 20, 'z': 116},
                    {'x': 70, 'y': 20, 'z': 116},
                    {'x': 71, 'y': 22, 'z': 118},
                    {'x': 85, 'y': 22, 'z': 132}
                ],
                'structures': [
                    {'type': 'retainingWall', 'station': 0, 'endStation': 5},
                    {'type': 'culvert', 'station': 12, 'diameter': 2, 'name': 'Creek A culvert'},
                    {'type': 'turnout', 'station': 20, 'endStation': 28, 'side': 'both'},
                    {'type': 'retainingWall', 'station': 30, 'endStation': 38, 'side': 'right'},
                    {'type': 'bridge', 'station': 46, 'endStation': 50},
                    {'type': 'turnout', 'station': 52, 'endStation': 58},
                    {'type': 'culvert', 'station': 200}
                ]
            },
            {
                'name': 'Alt',
                'section': {'width': 8},
                'alignment': [{'x': 0, 'y': 40}, {'x': 40, 'y': 40}, {'x': 90, 'y': 40}]
            }
        ]
    };
}


// A road east up a 30% plane, crossing two creeks - its second half follows an existing road
export function planExistingRoad() {
    const rows = [];
    while (rows.length < 5) {
        rows.push([100, 103, 106, 109, 112]);
    }
    return {
        'title': 'Existing Road',
        'units': 'feet',
        'topography': {
            'spacing': 10,
            'elevations': rows,
            'features': [
                {'type': 'stream', 'name': 'West Creek', 'points': [{'x': 10, 'y': 0}, {'x': 10, 'y': 40}]},
                {'type': 'stream', 'name': 'East Creek', 'points': [{'x': 30, 'y': 0}, {'x': 30, 'y': 40}]}
            ]
        },
        'start': {'x': 0, 'y': 20},
        'end': {'x': 40, 'y': 20},
        'options': [
            {
                'name': 'Join',
                'section': {'width': 10},
                'alignment': [{'x': 0, 'y': 20}, {'x': 20, 'y': 20}, {'x': 30, 'y': 20}, {'x': 40, 'y': 20, 'z': 150}],
                'structures': [{'type': 'existingRoad', 'station': 20, 'endStation': 40}]
            }
        ]
    };
}
