import assert from 'node:assert/strict';
import {cliMain} from '../lib/cli.js';
import {fixturePlan} from '../../viewer/test/fixture.js';
import test from 'node:test';
import {testIo} from './terrainHelpers.js';


// A georeferenced plan - the fixture plan (400 x 300 feet), with its center at a latitude and longitude
function locatedPlan(members = {}) {
    return {...fixturePlan(), 'georeference': {'latitude': 44, 'longitude': -115, 'x': 200, 'y': 150}, ...members};
}


// Run the "locate" command on a plan - returns its exit code and output
async function locate(plan, ...args) {
    const io = testIo({'files': {'road.json': typeof plan === 'string' ? plan : JSON.stringify(plan)}});
    const code = await cliMain(['locate', 'road.json', ...args], io);
    return [code, io.output.join('')];
}


test('locate', async () => {
    // The plan's center, and a point 100 feet to its east and 50 feet to its north - a foot is 0.3048 meters, a
    // degree of latitude is 111,120 meters there, and a degree of longitude is 80,210 meters there. The fixture plan's
    // ground is 500 + 0.12 y feet, less its valley (8 feet deep at x = 200) and plus its ridge (20 feet high at x = 300).
    // Its stream is down its valley.
    assert.deepEqual(await locate(locatedPlan(), '44,-115', '44.000137,-114.99962'), [0, `\
latitude and longitude 44.00000, -115.00000 - x 200, y 150 - ground elevation 511.2, nearest stream "Test Creek" 0 feet away
latitude and longitude 44.00014, -114.99962 - x 300, y 199.9 - ground elevation 544.0, nearest stream "Test Creek" 100 feet away
`]);

    // A latitude and longitude outside the plan's topography
    assert.deepEqual(await locate(locatedPlan(), '44.01,-115'), [
        0, 'latitude and longitude 44.01000, -115.00000 - x 200, y 3795.4 - outside the topography, ' +
            'nearest stream "Test Creek" 3495 feet away\n'
    ]);

    // A plan in meters, and a site's plan (it has no options yet)
    assert.deepEqual(await locate(locatedPlan({'units': 'meters', 'options': []}), '44.000137,-114.99962'), [
        0, 'latitude and longitude 44.00014, -114.99962 - x 230.5, y 165.2 - ground elevation 523.2, ' +
            'nearest stream "Test Creek" 31 meters away\n'
    ]);

    // A plan with a road and a stream without a name, and a plan without features
    const features = [
        {'type': 'road', 'name': 'Mill Rd', 'points': [{'x': 0, 'y': 140}, {'x': 400, 'y': 140}]},
        {'type': 'stream', 'points': [{'x': 230, 'y': 0}, {'x': 230, 'y': 300}]}
    ];
    assert.deepEqual(await locate(locatedPlan({'topography': {...fixturePlan().topography, features}}), '--xy', '200,150'), [
        0, 'latitude and longitude 44.00000, -115.00000 - x 200, y 150 - ground elevation 511.2, ' +
            'nearest road "Mill Rd" 10 feet away, nearest stream 30 feet away\n'
    ]);
    assert.deepEqual(await locate(locatedPlan({'topography': {...fixturePlan().topography, 'features': []}}), '--xy', '200,150'), [
        0, 'latitude and longitude 44.00000, -115.00000 - x 200, y 150 - ground elevation 511.2\n'
    ]);
});


test('locate, the plan\'s coordinates', async () => {
    // The latitudes and longitudes of the plan's center, its start point, and a point outside its topography
    assert.deepEqual(await locate(locatedPlan(), '--xy', '200,150', '20,30', '-10.5,0'), [0, `\
latitude and longitude 44.00000, -115.00000 - x 200, y 150 - ground elevation 511.2, nearest stream "Test Creek" 0 feet away
latitude and longitude 43.99967, -115.00068 - x 20, y 30 - ground elevation 503.6, nearest stream "Test Creek" 180 feet away
latitude and longitude 43.99959, -115.00080 - x -10.5, y 0 - outside the topography, nearest stream "Test Creek" 211 feet away
`]);
});


test('locate, a plan that cannot be loaded, is invalid, or has no georeference', async () => {
    let io = testIo();
    assert.deepEqual([await cliMain(['locate', 'road.json', '44,-115'], io), io.output.join('')], [
        1, 'error: Could not load the road plan "road.json"\n'
    ]);
    assert.deepEqual(await locate('Not JSON', '44,-115'), [1, 'error: Could not load the road plan "road.json"\n']);
    assert.deepEqual(await locate({...locatedPlan(), 'units': 'yards'}, '44,-115'), [
        1,
        'error: The road plan "road.json" is invalid:\n\nInvalid value "yards" (type "string") for member "units", expected type "Units"\n'
    ]);
    assert.deepEqual(await locate('null', '44,-115'), [
        1, 'error: The road plan "road.json" is invalid:\n\nInvalid value null (type "object"), expected type "RoadPlan"\n'
    ]);
    assert.deepEqual(await locate(fixturePlan(), '44,-115'), [1, 'error: The road plan "road.json" has no georeference\n']);

    // The usage
    const usage = `\
usage: plan locate <plan.json> [--xy] <latitude,longitude | x,y>...

  Convert latitudes and longitudes to a road plan model's coordinates - or, with --xy, the plan's coordinates to
  latitudes and longitudes - with the ground elevation there, and the nearest road and stream
`;
    for (const args of [[], ['road.json'], ['road.json', '--xy'], ['--xy', '1,2'], ['road.json', '44'], ['road.json', '44,-115', 'x,y']]) {
        io = testIo({'files': {'road.json': JSON.stringify(locatedPlan())}});
        assert.deepEqual([await cliMain(['locate', ...args], io), io.output.join('')], [1, usage]);
    }
});
