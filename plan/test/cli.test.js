import assert from 'node:assert/strict';
import {cliMain} from '../lib/cli.js';
import {fixturePlan} from '../../viewer/test/fixture.js';
import {cliMain as roadieMain} from '../../viewer/lib/cli.js';
import test from 'node:test';


// Run the command line - returns the exit code and the output
async function run(argv) {
    const output = [];
    const code = await cliMain(argv, {'write': (text) => output.push(text)});
    return {code, 'output': output.join('')};
}


// The command line's usage
const usage = `\
usage: plan site <site.json> <plan.json>
       plan plot <plan.json> <plot.png> [--box X1,Y1,X2,Y2]
       plan locate <plan.json> [--xy] <latitude,longitude | x,y>...
       plan feature <plan.json> TYPE [-n NAME] X,Y X,Y...
       plan route <plan.json> -n NAME [-v X,Y]... [options]
       plan profile <plan.json> -n NAME [options]
       plan evaluate <plan.json> [--detail]
       plan keep <plan.json> NAME...
       plan describe <plan.json> <descriptions.md>
       plan doc [site | plan]

  site      Create a road plan model's site from a road site model - its topography (USGS lidar terrain),
            georeference, start and end points, features, and topographic map image
  plot      Plot a road plan model - its terrain, features, and options
  locate    Convert latitudes and longitudes to a road plan model's coordinates, and back
  feature   Add a topographic feature to a road plan model, or remove its features of a name
  route     Engineer a road option - its alignment (following existing roads where that costs less), profile,
            and structures
  profile   Re-design an existing option's profile and structures
  evaluate  Print a road plan model's analysis and cost (--detail adds each option's station table)
  keep      Keep a road plan model's named options, in cost score order, and remove its others
  describe  Set a road plan model's and its options' descriptions from a Markdown file
  doc       Print the road site model documentation - or the road plan model documentation

Each command's usage is its "-h" argument's output.
`;


test('cliMain usage', async () => {
    assert.deepEqual(await run([]), {'code': 1, 'output': usage});
    assert.deepEqual(await run(['unknown']), {'code': 1, 'output': usage});
    assert.deepEqual(await run(['toString']), {'code': 1, 'output': usage});
    assert.deepEqual(await run(['doc', 'extra']), {'code': 1, 'output': usage});
    assert.deepEqual(await run(['doc', 'site', 'plan']), {'code': 1, 'output': usage});
});


test('cliMain help', async () => {
    // The usage, when it's asked for - the command line's, and a command's
    assert.deepEqual(await run(['-h']), {'code': 0, 'output': usage});
    assert.deepEqual(await run(['doc', '--help']), {'code': 0, 'output': usage});
    const route = await run(['route', '-h']);
    assert.equal(route.code, 0);
    assert.ok(route.output.startsWith('usage: plan route <plan.json> -n NAME [-v X,Y]... [options]\n'));
    assert.deepEqual(await run(['route']), {'code': 1, 'output': route.output});
});


test('cliMain evaluate', async () => {
    // The Roadie command line's analysis and cost of the fixture plan
    const io = (output) => ({'readFile': () => JSON.stringify(fixturePlan()), 'write': (text) => output.push(text)});
    const output = [];
    assert.equal(await cliMain(['evaluate', 'road.json'], io(output)), 0);
    const lines = output.join('').split('\n');
    assert.deepEqual(lines.slice(0, 2), ['# Fixture Plan', '']);
    assert.deepEqual(lines.filter((line) => line.startsWith('## ')), [
        '## Options (lengths in ft, volumes in cy)', '## Option 0: Direct', '## Option 1: Bridge - East'
    ]);
    assert.deepEqual([lines.includes('### Stations'), lines.at(-1), lines.at(-2)], [false, '', '']);
    const viewerOutput = [];
    roadieMain(['evaluate', 'road.json'], io(viewerOutput));
    assert.equal(output.join(''), viewerOutput.join(''));

    // The station tables
    const detail = [];
    assert.equal(await cliMain(['evaluate', '--detail', 'road.json'], io(detail)), 0);
    assert.equal(detail.join('').split('\n').filter((line) => line === '### Stations').length, 2);

    // A plan that can't be loaded
    assert.deepEqual(await run(['evaluate', 'road.json']), {'code': 1, 'output': '**Error:** Could not load the road plan "road.json"\n'});

    // The usage
    assert.deepEqual(await run(['evaluate']), {'code': 1, 'output': usage});
    assert.deepEqual(await run(['evaluate', 'road.json', 'other.json']), {'code': 1, 'output': usage});
    assert.deepEqual(await run(['evaluate', '--detail', '--summary']), {'code': 1, 'output': usage});
});


test('cliMain doc', async () => {
    const {code, output} = await run(['doc']);
    assert.equal(code, 0);
    const lines = output.split('\n');
    assert.deepEqual(lines.slice(0, 4), [
        '# struct RoadSite',
        '',
        'A road site - the start and end points of a road to plan, and its planning instructions. The site\'s',
        'topography is USGS 3D Elevation Program lidar terrain, so the site is in the United States.'
    ]);
    assert.deepEqual(
        lines.filter((line) => line.startsWith('### ')),
        [
            '### struct CostRates', '### struct DesignCriteria', '### struct LatLong', '### struct SiteArea', '### struct SitePoint',
            '### enum Units'
        ]
    );
    assert.equal(lines.filter((line) => line.startsWith('| start ')).length, 1);
    assert.deepEqual(await run(['doc', 'site']), {code, output});

    // The road plan model's documentation
    const plan = await run(['doc', 'plan']);
    assert.equal(plan.code, 0);
    assert.deepEqual(plan.output.split('\n').slice(0, 4), [
        '# struct RoadPlan',
        '',
        'A road grading plan model. A plan contains the site topography, the road start and end points, and',
        'one or more road plan options. All lengths and elevations are in the plan\'s units.'
    ]);
    assert.ok(plan.output.includes('\n### struct Georeference\n'));
});
