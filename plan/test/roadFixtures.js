// roadFixtures.js - the road engineering tests' plans, and the Python planning tools' results for them. The road
// engineering is a port of the Python planning tools': "expected/pythonTools.json" is what they computed for these
// plans, and the port computes the same. (The commands' report lines are the JavaScript tools' - they report the
// structures' counts, the existing roads, and the option's cost score.)

import {createDesign} from '../lib/design.js';
import {existingMask} from '../lib/structures.js';
import {fileURLToPath} from 'node:url';
import {planTopo} from '../../viewer/lib/model.js';
import {readFileSync} from 'node:fs';
import {resamplePolyline} from '../lib/route.js';


// The Python planning tools' results
export const expected = JSON.parse(readFileSync(fileURLToPath(new URL('expected/pythonTools.json', import.meta.url)), 'utf-8'));


// Create the route and profile commands' design arguments - the defaults, with overrides
export function designArgs(overrides = {}) {
    return {
        'grade': null, 'switchbackGrade': 8, 'width': null, 'surface': 'gravel', 'cutSlope': 1, 'fillSlope': 1.5, 'turnouts': null,
        'bridgeFill': null, ...overrides
    };
}


// Create a plan of a plane rising to the north
export function planePlan({units = 'feet', rise = 0.1, size = 11, spacing = 10} = {}) {
    const elevations = [];
    for (let row = 0; row < size; row++) {
        elevations.push(new Array(size).fill(100 + rise * (size - 1 - row) * spacing));
    }
    return {
        'title': 'Plane',
        units,
        'topography': {spacing, elevations},
        'start': {'x': 10, 'y': 10},
        'end': {'x': 90, 'y': 90},
        'options': []
    };
}


// Create a plan's elevation grid from a function of x and y - the elevations are rounded to hundredths
function elevationGrid(size, spacing, elevationFn) {
    const elevations = [];
    for (let row = 0; row < size; row++) {
        const rowElevations = [];
        for (let col = 0; col < size; col++) {
            rowElevations.push(Math.round(elevationFn(col * spacing, (size - 1 - row) * spacing) * 100) / 100);
        }
        elevations.push(rowElevations);
    }
    return elevations;
}


// Create a meters plan of a slope with a hill and a draw - with two streams, a rock outcrop, an exclusion area, design
// criteria, and cost rates
export function hillPlan() {
    const hill = (x, y) => 50 + 0.08 * y + 12 * Math.exp(-((x - 110) ** 2 + (y - 90) ** 2) / 1800) - 6 * Math.exp(-((x - 60) ** 2) / 150);
    return {
        'title': 'Hill',
        'units': 'meters',
        'criteria': {'maxGrade': 10, 'minRadius': 12, 'rockCutSlope': 0.25},
        'costRates': {'gravel': 25, 'culvert': 1000},
        'topography': {
            'spacing': 10,
            'elevations': elevationGrid(21, 10, hill),
            'features': [
                {'type': 'stream', 'name': 'West Creek', 'points': [{'x': 60, 'y': 0}, {'x': 61, 'y': 100}, {'x': 60, 'y': 200}]},
                {'type': 'stream', 'points': [{'x': 0, 'y': 150}, {'x': 200, 'y': 151}]},
                {'type': 'rock', 'points': [{'x': 95, 'y': 70}, {'x': 130, 'y': 70}, {'x': 130, 'y': 110}, {'x': 95, 'y': 110}]},
                {
                    'type': 'exclusion',
                    'name': 'Lot',
                    'points': [{'x': 70, 'y': 30}, {'x': 90, 'y': 30}, {'x': 90, 'y': 60}, {'x': 70, 'y': 60}]
                }
            ]
        },
        'start': {'x': 20, 'y': 20},
        'end': {'x': 180, 'y': 185},
        'options': []
    };
}


// Create a plan of a steep-sided valley with a stream down it
export function valleyPlan() {
    const plan = planePlan({'size': 41});
    plan.topography.elevations = elevationGrid(41, 10, (x, y) => 100 + 0.7 * Math.abs(x - 200) + 0.03 * y);
    plan.topography.features = [{'type': 'stream', 'name': 'Creek', 'points': [{'x': 200, 'y': 0}, {'x': 200, 'y': 400}]}];
    return plan;
}


// Create a plan of a gentle plane with an exclusion area across it
export function blockedPlan() {
    const plan = planePlan({'rise': 0.05, 'size': 21});
    plan.topography.features = [
        {'type': 'exclusion', 'points': [{'x': -10, 'y': 60}, {'x': 210, 'y': 60}, {'x': 210, 'y': 140}, {'x': -10, 'y': 140}]}
    ];
    plan.start = {'x': 20, 'y': 20};
    plan.end = {'x': 180, 'y': 180};
    return plan;
}


// Create a plan of a gentle plane with an existing road and an existing trail - the road's lines are on its route
// search's lattice (it's 23.5 feet)
export function roadPlan(roadPoints = [[141, 47], [329, 47], [329, 352.5]]) {
    const plan = planePlan({'rise': 0.05, 'size': 41});
    plan.topography.features = [
        {'type': 'road', 'name': 'Mill Rd', 'points': roadPoints.map(([x, y]) => ({x, y}))},
        {'type': 'trail', 'name': 'Mill Trail', 'points': [{'x': 47, 'y': 47}, {'x': 329, 'y': 352.5}]}
    ];
    plan.start = {'x': 47, 'y': 47};
    plan.end = {'x': 329, 'y': 352.5};
    return plan;
}


// Create a plan's alignment of points ([x, y] arrays) resampled at an interval - its topography, design, the alignment's
// "x" and "y" coordinates and "stations", and its existing roads' ([station, end station] ranges) "existing" mask (or
// null)
export function alignmentFixture(plan, args, points, interval, existingRoads = null) {
    return {
        'topo': planTopo(plan),
        'design': createDesign(plan, args),
        ...resamplePolyline(points.map((point) => point[0]), points.map((point) => point[1]), interval),
        get existing() {
            return existingRoads !== null ? existingMask(this.stations, existingRoads) : null;
        }
    };
}


// The alignments of the Python planning tools' profile and structure results - each is alignmentFixture's arguments
export const alignments = {
    'profile-grade': [planePlan({'rise': 0.3}), designArgs(), [[50, 0], [50, 100]], 5],
    'profile-existing': [planePlan({'rise': 0.3}), designArgs(), [[50, 0], [50, 100]], 5, [[50, 100]]],
    'profile-existing-start': [planePlan({'rise': 0.3}), designArgs(), [[50, 0], [50, 100]], 5, [[0, 30], [70, 80]]],
    'profile-existing-all': [planePlan({'rise': 0.3}), designArgs(), [[50, 0], [50, 100]], 5, [[0, 100]]],
    'profile-short': [planePlan({'units': 'meters', 'rise': 0.05, 'spacing': 4}), designArgs(), [[4, 4], [30, 20]], 4],
    'profile-hill': [
        hillPlan(), designArgs({'bridgeFill': 1}), [[20, 20], [60, 60], [100, 60], [130, 100], [100, 160], [180, 185]], 5
    ],
    'profile-hill-wide': [hillPlan(), designArgs({'width': 6, 'bridgeFill': 0.5, 'grade': 6}), [[20, 100], [100, 110], [180, 100]], 5],
    'profile-valley': [
        valleyPlan(), designArgs({'cutSlope': 2, 'fillSlope': 3, 'bridgeFill': 20}), [[60, 100], [200, 180], [340, 300]], 10
    ],
    'profile-valley-culvert': [valleyPlan(), designArgs(), [[60, 100], [200, 180], [340, 300]], 10]
};


// Convert a value's typed arrays to arrays, its infinite numbers to null, and its negative zeros to zero - to compare it
// with the Python planning tools' result (as JSON)
export function plain(value) {
    return JSON.parse(JSON.stringify(value, (key, member) => (ArrayBuffer.isView(member) ? Array.from(member) : member)));
}
