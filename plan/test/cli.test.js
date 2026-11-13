import assert from 'node:assert/strict';
import {cliMain} from '../lib/cli.js';
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
       plan plot <plan.json> <plot.png>
       plan locate <plan.json> [--xy] <latitude,longitude | x,y>...
       plan doc

  site    Create a road plan model's site from a road site model - its topography (USGS lidar terrain),
          georeference, start and end points, features, and topographic map image
  plot    Plot a road plan model - its terrain, features, and options
  locate  Convert latitudes and longitudes to a road plan model's coordinates, and back
  doc     Print the road site model documentation
`;


test('cliMain usage', async () => {
    assert.deepEqual(await run([]), {'code': 1, 'output': usage});
    assert.deepEqual(await run(['unknown']), {'code': 1, 'output': usage});
    assert.deepEqual(await run(['toString']), {'code': 1, 'output': usage});
    assert.deepEqual(await run(['doc', 'extra']), {'code': 1, 'output': usage});
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
});
