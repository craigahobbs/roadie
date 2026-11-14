import assert from 'node:assert/strict';
import {cliMain} from '../lib/cli.js';
import {fixturePlan} from '../../viewer/test/fixture.js';
import {planText} from '../lib/planFile.js';
import test from 'node:test';
import {testIo} from './terrainHelpers.js';


// Run the "feature" command on a plan ("road.json", the fixture plan - 400 x 300 feet) - returns its exit code, its
// output, and the written plan (null if it wasn't written)
async function feature(args, plan = fixturePlan()) {
    const io = testIo({'files': {'road.json': typeof plan === 'string' ? plan : JSON.stringify(plan)}});
    const code = await cliMain(['feature', 'road.json', ...args], io);
    const written = io.written.includes('road.json') ? io.files['road.json'] : null;
    return {code, 'output': io.output.join(''), written, 'plan': written !== null ? JSON.parse(written) : null};
}


test('feature, an area', async () => {
    // An exclusion area is added after the plan's features - its size and extent are reported
    const {code, output, written, plan} = await feature(['exclusion', '-n', 'Wetland', '100,50', '300,50', '300,150.5', '100,150.5']);
    assert.deepEqual([code, output], [0, `\
Added exclusion "Wetland": 4 points, 0.46 acres, x 100 to 300, y 50 to 150.5
Wrote road.json - plot it to check the feature against the terrain
`]);
    const {features} = fixturePlan().topography;
    const wetland = {
        'type': 'exclusion',
        'name': 'Wetland',
        'points': [{'x': 100, 'y': 50}, {'x': 300, 'y': 50}, {'x': 300, 'y': 150.5}, {'x': 100, 'y': 150.5}]
    };
    assert.deepEqual(plan.topography.features, [...features, wetland]);
    assert.equal(written, planText(plan));
    assert.deepEqual({...plan, 'topography': {...plan.topography, features}}, fixturePlan());

    // A rock outcrop without a name, of a plan in meters, with a point outside its topography
    const rock = await feature(['rock', '0,0', '200,0', '0,400'], {...fixturePlan(), 'units': 'meters'});
    assert.deepEqual([rock.code, rock.output], [0, `\
Added rock: 3 points, 4.00 hectares, x 0 to 200, y 0 to 400
WARNING: 1 of its points is outside the topography (400 x 300 meters)
Wrote road.json - plot it to check the feature against the terrain
`]);
    assert.deepEqual(
        rock.plan.topography.features.at(-1),
        {'type': 'rock', 'points': [{'x': 0, 'y': 0}, {'x': 200, 'y': 0}, {'x': 0, 'y': 400}]}
    );
});


test('feature, a line', async () => {
    // A stream is added to a site's plan, which has no features or options yet - its length is reported
    const site = fixturePlan();
    delete site.topography.features;
    site.options = [];
    const {code, output, plan} = await feature(['stream', '--name', 'North Draw', '30,40', '60,80', '60,180'], site);
    assert.deepEqual([code, output], [0, `\
Added stream "North Draw": 3 points, 150 feet long, x 30 to 60, y 40 to 180
Wrote road.json - plot it to check the feature against the terrain
`]);
    assert.deepEqual(plan.topography.features, [
        {'type': 'stream', 'name': 'North Draw', 'points': [{'x': 30, 'y': 40}, {'x': 60, 'y': 80}, {'x': 60, 'y': 180}]}
    ]);
    assert.deepEqual(plan.options, []);

    // A road and a trail are lines, too - both of a trail's points are outside the topography
    const road = await feature(['road', '0,0', '30,40']);
    assert.equal(road.output.split('\n')[0], 'Added road: 2 points, 50 feet long, x 0 to 30, y 0 to 40');
    const trail = await feature(['trail', '500,0', '500,400']);
    assert.equal(trail.output.split('\n')[1], 'WARNING: 2 of its points are outside the topography (400 x 300 feet)');
});


test('feature, remove', async () => {
    // The fixture plan's features are a stream, a rock outcrop, and an exclusion area ("Barn")
    const {code, output, written, plan} = await feature(['--remove', 'Barn']);
    assert.deepEqual([code, output], [0, `\
Removed 1 feature named "Barn"
Wrote road.json - plot it to check the feature against the terrain
`]);
    assert.deepEqual(plan.topography.features, fixturePlan().topography.features.slice(0, 2));
    assert.equal(written, planText(plan));

    // Every feature of the name is removed
    const twice = fixturePlan();
    twice.topography.features.push({...twice.topography.features[2], 'type': 'rock'});
    const removed = await feature(['--remove', 'Barn'], twice);
    assert.equal(removed.output.split('\n')[0], 'Removed 2 features named "Barn"');
    assert.deepEqual(removed.plan.topography.features, fixturePlan().topography.features.slice(0, 2));

    // There's no feature of the name
    assert.deepEqual(await feature(['--remove', 'House']), {
        'code': 1, 'output': 'error: no feature named "House"\n', 'written': null, 'plan': null
    });
});


test('feature, invalid arguments', async () => {
    // The plan can't be loaded
    assert.deepEqual(await feature(['rock', '0,0', '200,0', '0,400'], 'Not JSON'), {
        'code': 1, 'output': 'error: Could not load the road plan "road.json"\n', 'written': null, 'plan': null
    });

    // The usage
    const usage = `\
usage: plan feature <plan.json> TYPE [-n NAME] X,Y X,Y...
       plan feature <plan.json> --remove NAME

  Add a topographic feature to a road plan model - a "stream", "road", or "trail" line, or a "rock" or "exclusion"
  area polygon, of points in the plan's coordinates - or remove its features of a name. To correct a feature,
  remove it and add it again.
`;
    for (const args of [
        [],
        ['rock'],
        ['rock', '0,0', '200,0'],
        ['stream', '0,0'],
        ['pond', '0,0', '200,0', '0,400'],
        ['toString', '0,0', '200,0', '0,400'],
        ['rock', '0,0', '200,0', '0,north'],
        ['rock', '0,0', '200,0', '0,400,10'],
        ['rock', '-n', '', '0,0', '200,0', '0,400'],
        ['rock', '--points', '0,0', '200,0', '0,400'],
        ['--remove', ''],
        ['--remove', 'Barn', '-n', 'Barn'],
        ['--remove', 'Barn', 'rock'],
        ['rock', '--remove', 'Barn', '0,0', '200,0', '0,400']
    ]) {
        assert.deepEqual(await feature(args), {'code': 1, 'output': usage, 'written': null, 'plan': null}, args.join(' '));
    }
    const io = testIo();
    assert.deepEqual([await cliMain(['feature'], io), io.output.join('')], [1, usage]);
    assert.deepEqual([await cliMain(['feature', '--remove', 'Barn'], io), io.output.join('')], [1, usage + usage]);
});
