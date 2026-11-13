// viewFixtures.js - road plans and helpers for the report, plan view, 3D view, and 3D explorer tests

import {PlanData} from '../lib/planData.js';
import assert from 'node:assert/strict';
import {validatePlan} from '../lib/model.js';


// A simple plan - a road running east across a plane rising 10% to the north, on grade at the centerline
export function simplePlan() {
    const elevations = [0, 1, 2, 3, 4].map((row) => [0, 1, 2, 3, 4].map(() => 100 + 0.1 * (4 - row) * 10));
    return {
        'title': 'Simple Plan',
        'units': 'meters',
        'topography': {'spacing': 10, elevations},
        'start': {'x': 0, 'y': 20},
        'end': {'x': 40, 'y': 20},
        'options': [
            {'name': 'Flat', 'section': {'width': 10}, 'alignment': [{'x': 0, 'y': 20, 'z': 102}, {'x': 40, 'y': 20, 'z': 102}]}
        ]
    };
}


// The simple plan with tall ridges on both sides of its road (which hide the road from low viewpoints)
export function ridgesPlan() {
    const plan = simplePlan();
    for (const row of [1, 3]) {
        plan.topography.elevations[row].fill(150);
    }
    return plan;
}


// A complex plan - a steep 80% north-rising slope that triggers every warning and structure
export function complexPlan() {
    const elevations = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((row) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map(() => 100 + 8 * (8 - row)));
    return {
        'title': 'Complex Plan',
        'description': ['A complex plan.'],
        'image': 'map.png',
        'units': 'feet',
        'topography': {
            'spacing': 10,
            elevations,
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


// Validate a road plan and create its plan data
export function planData(planValue, file = 'plans/fixture.json') {
    const {plan, error} = validatePlan(planValue);
    assert.equal(error, undefined);
    return new PlanData(plan, file);
}


// Count the occurrences of a substring
export function countOf(text, part) {
    return text.split(part).length - 1;
}


// Get the top-level elements' markup of an SVG drawing's markup
export function svgElements(svg) {
    return svg.slice(svg.indexOf('>') + 1, -'</svg>'.length).match(/<(\w+)[^>]*?(?:\/>|>.*?<\/\1>)/g);
}
