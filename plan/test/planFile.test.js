import {orderPlan, planText} from '../lib/planFile.js';
import assert from 'node:assert/strict';
import test from 'node:test';


test('orderPlan', () => {
    // The model's members are in schema order, then any others in their order
    const plan = orderPlan({
        'options': [], 'end': {'x': 1, 'y': 1}, 'extra': 1, 'topography': {}, 'units': 'feet', 'title': 'Plan', 'other': 2,
        'start': {'x': 0, 'y': 0}, 'costRates': {}, 'criteria': {}, 'image': 'plan.png', 'description': [], 'georeference': {}
    });
    assert.deepEqual(Object.keys(plan), [
        'title', 'description', 'image', 'units', 'georeference', 'topography', 'start', 'end', 'criteria', 'costRates', 'options',
        'extra', 'other'
    ]);
    assert.deepEqual(plan.end, {'x': 1, 'y': 1});

    // Only the members the plan has
    assert.deepEqual(Object.keys(orderPlan({'options': [], 'title': 'Plan'})), ['title', 'options']);
});


test('planText', () => {
    const plan = {
        'title': 'A "$&" Plan',
        'units': 'feet',
        'topography': {'spacing': 10, 'elevations': [[100, 101.5, 103], [99.25, 100, 101]], 'contourInterval': 5},
        'start': {'x': 0, 'y': 0},
        'options': []
    };
    const text = planText(plan);
    assert.equal(text, `\
{
  "title": "A \\"$&\\" Plan",
  "units": "feet",
  "topography": {
    "spacing": 10,
    "elevations": [
      [100, 101.5, 103],
      [99.25, 100, 101]
    ],
    "contourInterval": 5
  },
  "start": {
    "x": 0,
    "y": 0
  },
  "options": []
}
`);
    assert.deepEqual(JSON.parse(text), plan);

    // The plan isn't changed
    assert.deepEqual(plan.topography.elevations, [[100, 101.5, 103], [99.25, 100, 101]]);
});
