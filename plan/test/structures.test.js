import {alignmentFixture, alignments, designArgs, expected, plain, planePlan} from './roadFixtures.js';
import {designStructures, existingMask} from '../lib/structures.js';
import assert from 'node:assert/strict';
import {createDesign} from '../lib/design.js';
import {designProfile} from '../lib/profile.js';
import {planTopo} from '../../viewer/lib/model.js';
import {resamplePolyline} from '../lib/route.js';
import test from 'node:test';


// Design a named alignment's profile and structures - returns the structures
function structuresFixture(name) {
    const [, , , , existingRoads = []] = alignments[name];
    const {topo, design, x, y, stations, existing} = alignmentFixture(...alignments[name]);
    const {profile, sideSlope} = designProfile(topo, design, x, y, stations, existing);
    return designStructures(topo, design, x, y, stations, profile, sideSlope, existingRoads);
}


// A level plan with two streams across it, and a road north across them - its topography, design, and alignment
function levelFixture(args = designArgs()) {
    const plan = planePlan({'rise': 0, 'size': 41});
    plan.topography.features = [
        {'type': 'stream', 'points': [{'x': 0, 'y': 102}, {'x': 400, 'y': 102}]},
        {'type': 'stream', 'points': [{'x': 0, 'y': 302}, {'x': 400, 'y': 302}]}
    ];
    return {'topo': planTopo(plan), 'design': createDesign(plan, args), ...resamplePolyline([200, 200], [0, 400], 5)};
}


// Design the level plan's structures for a profile of depths below the ground (by station index) and a side slope
// function - "name" is the name of the Python planning tools' result for them, which the structures match
function levelStructures(name, {depths = {}, sideSlopeFn = () => 0, existingRoads = [], args = designArgs()} = {}) {
    const {topo, design, x, y, stations} = levelFixture(args);
    const profile = stations.map((stationValue, ix) => 100 - (depths[ix] ?? 0));
    const structures = designStructures(topo, design, x, y, stations, profile, stations.map(sideSlopeFn), existingRoads);
    assert.deepEqual(plain(structures), expected['structures-cases'][name], name);
    return structures;
}


test('existingMask', () => {
    const stations = [0, 5, 10, 15, 20, 25, 30];
    assert.deepEqual(plain(existingMask(stations, [])), [0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(plain(existingMask(stations, [[5, 15]])), [0, 1, 1, 1, 0, 0, 0]);
    assert.deepEqual(plain(existingMask(stations, [[0, 4], [20, 100]])), [1, 0, 0, 0, 1, 1, 1]);

    // The ranges have a tolerance for the stations' rounding
    assert.deepEqual(plain(existingMask(stations, [[10.0000001, 19.9999999]])), [0, 0, 1, 1, 1, 0, 0]);
    assert.deepEqual(plain(existingMask(stations, [[10.00001, 19.99999]])), [0, 0, 0, 1, 0, 0, 0]);
});


test('designStructures, the Python planning tools\' structures', () => {
    for (const name of Object.keys(alignments)) {
        assert.deepEqual(plain(structuresFixture(name)), expected[name].structures, name);
    }
});


test('designStructures, culverts and turnouts', () => {
    // A stream crossing has a culvert, and a single-lane road has turnouts - none are within an existing road, which
    // is a structure itself
    const {topo, design, x, y, stations} = levelFixture();
    const structures = designStructures(topo, design, x, y, stations, stations.map(() => 100), stations.map(() => 0), [[200, 400]]);
    assert.deepEqual(plain(structures), expected['structures-level']);
    assert.deepEqual(structures, [
        {'type': 'culvert', 'station': 102, 'diameter': 3, 'name': 'stream culvert'},
        {'type': 'existingRoad', 'station': 200, 'endStation': 400, 'name': 'Existing road'}
    ]);

    // The road's length, measured along its points, is less than its last station - the existing road ends at the
    // road's end, and there's no culvert where it crosses the stream beyond it
    const level = stations.map(() => 100);
    const flat = stations.map(() => 0);
    assert.deepEqual(designStructures(topo, design, x, y, stations, level, flat, [[200, 400]], 300), [
        {'type': 'culvert', 'station': 102, 'diameter': 3, 'name': 'stream culvert'},
        {'type': 'existingRoad', 'station': 200, 'endStation': 300, 'name': 'Existing road'}
    ]);

    // A new road's culvert beyond the road's end is at its end
    assert.deepEqual(designStructures(topo, design, x, y, stations, level, flat, [], 300), [
        {'type': 'culvert', 'station': 102, 'diameter': 3, 'name': 'stream culvert'},
        {'type': 'turnout', 'station': 175, 'endStation': 225, 'side': 'right'},
        {'type': 'culvert', 'station': 300, 'diameter': 3, 'name': 'stream culvert'}
    ]);

    // Without the existing road - a turnout at the road's middle, on the right of level ground
    assert.deepEqual(levelStructures('none'), [
        {'type': 'culvert', 'station': 102, 'diameter': 3, 'name': 'stream culvert'},
        {'type': 'turnout', 'station': 175, 'endStation': 225, 'side': 'right'},
        {'type': 'culvert', 'station': 302, 'diameter': 3, 'name': 'stream culvert'}
    ]);

    // Turnouts are on the uphill side, at their spacing - and none on a wide road
    const turnouts = levelStructures('turnouts', {
        'sideSlopeFn': (stationValue) => (stationValue < 150 ? 0.2 : -0.2),
        'args': designArgs({'turnouts': 150})
    });
    assert.deepEqual(turnouts.filter((structure) => structure.type === 'turnout'), [
        {'type': 'turnout', 'station': 108.3, 'endStation': 158.3, 'side': 'left'},
        {'type': 'turnout', 'station': 241.7, 'endStation': 291.7, 'side': 'right'}
    ]);
    const types = (models) => models.map((structure) => structure.type);
    assert.deepEqual(types(levelStructures('wide', {'args': designArgs({'width': 20})})), ['culvert', 'culvert']);

    // A road too short for its turnout spacing has none
    assert.deepEqual(types(levelStructures('far', {'args': designArgs({'turnouts': 1200})})), ['culvert', 'culvert']);
});


test('designStructures, sags', () => {
    // A sag in the profile has a cross drain - at the first of its lowest stations, unless a culvert is near
    const depths = {'30': 1, '31': 2, '32': 3, '33': 3, '34': 2, '35': 1, '50': -2, '51': -2, '52': -2};
    const {topo, design, x, y, stations} = levelFixture();
    const profile = stations.map((stationValue, ix) => 100 - (depths[ix] ?? 0));
    const sideSlope = stations.map((stationValue) => (stationValue < 150 ? 0.2 : -0.2));
    const structures = designStructures(topo, design, x, y, stations, profile, sideSlope, []);
    assert.deepEqual(plain(structures), expected['structures-sags']);
    assert.deepEqual(structures.filter((structure) => structure.type === 'culvert'), [
        {'type': 'culvert', 'station': 102, 'diameter': 3, 'name': 'stream culvert'},
        {'type': 'culvert', 'station': 160, 'name': 'Sag cross drain'},
        {'type': 'culvert', 'station': 265, 'name': 'Sag cross drain'},
        {'type': 'culvert', 'station': 302, 'diameter': 3, 'name': 'stream culvert'}
    ]);

    // A sag near a stream's culvert, within an existing road, or under a bridge has none
    const near = levelStructures('near', {'depths': {'21': 1, '22': 2, '23': 1, '45': 1, '46': 2, '47': 1}, 'existingRoads': [[220, 240]]});
    assert.deepEqual(near.map((structure) => [structure.type, structure.station]), [
        ['culvert', 102], ['turnout', 175], ['existingRoad', 220], ['culvert', 302]
    ]);
});


test('designStructures, bridges', () => {
    // A stream crossing fill deeper than the bridge fill is bridged - over the fill deeper than half the bridge fill,
    // at most 150 feet. The fill's end is a sag.
    const depths = {};
    for (let ix = 14; ix <= 28; ix++) {
        depths[ix] = -Math.max(0, 12 - 2 * Math.abs(ix - 20));
    }
    const args = designArgs({'bridgeFill': 6});
    assert.deepEqual(levelStructures('bridge', {depths, args}), [
        {'type': 'bridge', 'station': 80, 'endStation': 120, 'name': 'stream bridge'},
        {'type': 'culvert', 'station': 130, 'name': 'Sag cross drain'},
        {'type': 'turnout', 'station': 175, 'endStation': 225, 'side': 'right'},
        {'type': 'culvert', 'station': 302, 'diameter': 3, 'name': 'stream culvert'}
    ]);

    // A long fill's bridges are the maximum span - from the road's start, and to the fill's end
    const long = {};
    for (let ix = 0; ix <= 60; ix++) {
        long[ix] = -10;
    }
    assert.deepEqual(levelStructures('bridge-long', {'depths': long, args}).filter((structure) => structure.type === 'bridge'), [
        {'type': 'bridge', 'station': 0, 'endStation': 145, 'name': 'stream bridge'},
        {'type': 'bridge', 'station': 155, 'endStation': 300, 'name': 'stream bridge'}
    ]);

    // A fill that deepens to the road's end is bridged to the end
    const end = {};
    for (let ix = 56; ix <= 80; ix++) {
        end[ix] = -(ix - 55);
    }
    assert.deepEqual(levelStructures('bridge-end', {'depths': end, 'args': designArgs({'bridgeFill': 4})}).at(-1), {
        'type': 'bridge', 'station': 290, 'endStation': 400, 'name': 'stream bridge'
    });

    // A shallower fill has a culvert
    assert.deepEqual(levelStructures('bridge-shallow', {depths, 'args': designArgs({'bridgeFill': 13})})[0].type, 'culvert');
});


test('designStructures, retaining walls', () => {
    // A slope that doesn't daylight is a wall - from the station before it to the station after, on its side. A side
    // slope of 0.8 is steeper than the fill slope, so its downhill side is a wall.
    const walls = levelStructures('walls', {
        'sideSlopeFn': (stationValue) => (stationValue >= 50 && stationValue <= 60 ? 0.8 : (stationValue >= 395 ? -0.8 : 0))
    });
    assert.deepEqual(walls.filter((structure) => structure.type === 'retainingWall'), [
        {'type': 'retainingWall', 'station': 45, 'endStation': 65, 'side': 'right'},
        {'type': 'retainingWall', 'station': 390, 'endStation': 400, 'side': 'left'}
    ]);

    // A wall from the road's start, and none within an existing road
    const start = levelStructures('walls-start', {
        'sideSlopeFn': (stationValue) => (stationValue <= 10 || stationValue === 100 ? 0.8 : 0),
        'existingRoads': [[90, 110]]
    });
    assert.deepEqual(start.filter((structure) => structure.type === 'retainingWall'), [
        {'type': 'retainingWall', 'station': 0, 'endStation': 15, 'side': 'right'}
    ]);
});
