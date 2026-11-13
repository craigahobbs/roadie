import {gridUtm, plane, siteEast, siteNorth, testImage, testIo, testItem, testSite} from './terrainHelpers.js';
import {layoutGeoreference, siteLayout} from '../lib/terrain.js';
import assert from 'node:assert/strict';
import {cliMain} from '../lib/cli.js';
import test from 'node:test';
import {validatePlan} from '../../viewer/lib/model.js';


// The test site's elevation model, and its product service response
const item = testItem('CO_New_2020', 'x47y443', '2022-02-10');
const page = {'total': 1, 'items': [item]};


// Run the "site" command for a site and the tools' input and output function arguments (testIo) - returns the
// functions object, with the command's exit "code"
async function runSite(site, {files = {}, images = {[item.downloadURL]: testImage()}, pages = [page]} = {}, planPath = 'plans/road.json') {
    const io = testIo({'files': {...files, 'site.json': JSON.stringify(site)}, images, pages});
    io.code = await cliMain(['site', 'site.json', planPath], io);
    return io;
}


// A coarse test site - its grid is 8 x 7 points, 50 meters apart
function coarseSite(members = {}) {
    return testSite({'margin': 20, 'spacing': 50, ...members});
}


test('site', async () => {
    const io = await runSite(coarseSite());
    assert.equal(io.code, 0);
    assert.equal(io.output.join(''), `\
Grid: 8 x 7 at 50 meters spacing (350 x 300 meters)
Elevations: 1676.7 to 1726.7 meters, contours every 2 meters
Elevation model: CO_New_2020 (2022-02-10)
start: "Start" (20, 20) at 40.00000, -105.28000, ground 1679.7
end: "End" (318.87, 242.07) at 40.00200, -105.27650, ground 1720.7
Wrote plans/road.json
`);

    // The elevation models are the site's box's, and their tiles are cached in the plan's work directory
    assert.deepEqual(io.urls, [
        'https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter' +
            '&bbox=-105.280234,39.99982,-105.276135,40.002522&max=100&offset=0'
    ]);
    assert.deepEqual(io.opened, [item.downloadURL]);
    assert.deepEqual(io.written, [
        'plans/road.work/terrain/USGS_1M_13_x47y443_CO_New_2020.json',
        'plans/road.work/terrain/USGS_1M_13_x47y443_CO_New_2020.f32',
        'plans/road.json'
    ]);

    // The plan - the elevation model is a plane that rises 5 meters per grid column to the east and 2.5 meters per grid
    // row to the north
    assert.equal(io.files['plans/road.json'], `\
{
  "title": "Test Site",
  "units": "meters",
  "georeference": {
    "latitude": 40.001,
    "longitude": -105.27825,
    "x": 169.439,
    "y": 131.033
  },
  "topography": {
    "spacing": 50,
    "elevations": [
      [1691.75, 1696.74, 1701.73, 1706.72, 1711.71, 1716.7, 1721.69, 1726.68],
      [1689.24, 1694.23, 1699.22, 1704.21, 1709.2, 1714.19, 1719.18, 1724.17],
      [1686.72, 1691.71, 1696.7, 1701.69, 1706.68, 1711.67, 1716.66, 1721.65],
      [1684.21, 1689.2, 1694.19, 1699.18, 1704.17, 1709.16, 1714.15, 1719.14],
      [1681.69, 1686.68, 1691.67, 1696.66, 1701.65, 1706.64, 1711.63, 1716.62],
      [1679.18, 1684.17, 1689.16, 1694.15, 1699.14, 1704.13, 1709.12, 1714.11],
      [1676.66, 1681.65, 1686.64, 1691.63, 1696.62, 1701.61, 1706.6, 1711.59]
    ],
    "contourInterval": 2,
    "sources": [
      {
        "name": "USGS 3D Elevation Program 1 meter elevation model CO_New_2020",
        "date": "2022-02-10",
        "url": "https://example.com/Elevation/1m/Projects/CO_New_2020/TIFF/USGS_1M_13_x47y443_CO_New_2020.tif"
      }
    ]
  },
  "start": {
    "x": 20,
    "y": 20,
    "label": "Start"
  },
  "end": {
    "x": 318.87,
    "y": 242.07,
    "label": "End"
  },
  "options": []
}
`);

    // The elevations are the plane's at the grid's points
    const layout = siteLayout(coarseSite());
    const plan = JSON.parse(io.files['plans/road.json']);
    for (const [col, row] of [[0, 0], [7, 0], [3, 4], [0, 6], [7, 6]]) {
        assert.ok(Math.abs(plan.topography.elevations[row][col] - plane(...gridUtm(layout, 13, col, row))) < 0.006);
    }

    // The plan is a road plan, but for its options
    assert.deepEqual(validatePlan(plan), {
        'error': 'Invalid value [] (type "object") for member "options", expected type "array" [len > 0]'
    });
    plan.options.push({'name': 'Road', 'section': {'width': 4}, 'alignment': [{'x': 20, 'y': 20}, {'x': 318.87, 'y': 242.07}]});
    assert.deepEqual(validatePlan(plan), {plan});
});


test('site, a site in feet', async () => {
    // The site's labels, design criteria, and cost rates are the plan's. The survey has no date, and its elevation
    // model has no elevations in a few pixels.
    const site = coarseSite({
        'units': 'feet',
        'start': {'latitude': 40, 'longitude': -105.28, 'label': 'Gate', 'description': 'The gate'},
        'end': {'latitude': 40.002, 'longitude': -105.2765, 'label': 'House'},
        'notes': ['A driveway'],
        'criteria': {'maxGrade': 10},
        'costRates': {'gravel': 22},
        'margin': 60,
        'spacing': 50
    });
    const layout = siteLayout(site);
    const [east, north] = gridUtm(layout, 13, 3, 2);
    const holeX = Math.round(east - (siteEast - 1000));
    const holeY = Math.round(siteNorth + 1000 - north);
    const undated = {...item, 'publicationDate': undefined};
    const io = await runSite(site, {
        'images': {[item.downloadURL]: testImage({'holes': (x, y) => Math.abs(x - holeX) < 10 && Math.abs(y - holeY) < 10})},
        'pages': [{'total': 1, 'items': [undated]}]
    }, 'road.JSON');
    assert.equal(io.code, 0);
    assert.equal(io.output.join(''), `\
Grid: 24 x 18 at 50 feet spacing (1150 x 850 feet)
Elevations: 5501.7 to 5659.2 feet, contours every 5 feet
Elevation model: CO_New_2020
Grid points without an elevation, filled from the points around them: 1
start: "Gate" (60, 60) at 40.00000, -105.28000, ground 5510.7
end: "House" (1040.56, 788.57) at 40.00200, -105.27650, ground 5645.2
Wrote road.JSON
`);
    assert.equal(io.written.at(-3), 'road.work/terrain/USGS_1M_13_x47y443_CO_New_2020.json');
    const plan = JSON.parse(io.files['road.JSON']);
    assert.deepEqual(Object.keys(plan), [
        'title', 'units', 'georeference', 'topography', 'start', 'end', 'criteria', 'costRates', 'options'
    ]);
    assert.deepEqual([plan.units, plan.georeference], ['feet', layoutGeoreference(layout)]);
    assert.deepEqual([plan.start, plan.end], [{'x': 60, 'y': 60, 'label': 'Gate'}, {'x': 1040.56, 'y': 788.57, 'label': 'House'}]);
    assert.deepEqual([plan.criteria, plan.costRates], [{'maxGrade': 10}, {'gravel': 22}]);
    assert.deepEqual(plan.topography.sources, [
        {'name': 'USGS 3D Elevation Program 1 meter elevation model CO_New_2020', 'url': item.downloadURL}
    ]);

    // The elevations are in feet, to a tenth of a foot - the filled point's is the mean of the points around it
    const {elevations} = plan.topography;
    assert.deepEqual([elevations.length, elevations[0].length, plan.topography.contourInterval], [18, 24, 5]);
    assert.equal(elevations[0][0], Math.round(plane(...gridUtm(layout, 13, 0, 0)) / 0.3048 * 10) / 10);
    assert.equal(elevations[17][23], Math.round(plane(...gridUtm(layout, 13, 23, 17)) / 0.3048 * 10) / 10);
    assert.ok(Math.abs(elevations[2][3] - plane(...gridUtm(layout, 13, 3, 2)) / 0.3048) < 0.1);
});


test('site, the contour interval', async () => {
    // The contour interval is the finest of at most 40 contours over the site's elevations - or the coarsest
    const intervals = [];
    for (const rise of [0.001, 0.05, 0.4, 2, 40]) {
        const image = testImage({'elevation': (east) => 1700 + rise * (east - siteEast)});
        const io = await runSite(coarseSite(), {'images': {[item.downloadURL]: image}});
        const {topography} = JSON.parse(io.files['plans/road.json']);
        intervals.push([topography.contourInterval, io.output.join('').split('\n')[1]]);
    }
    assert.deepEqual(intervals, [
        [0.5, 'Elevations: 1699.8 to 1700.2 meters, contours every 0.5 meters'],
        [0.5, 'Elevations: 1691.5 to 1709.0 meters, contours every 0.5 meters'],
        [5, 'Elevations: 1631.7 to 1772.0 meters, contours every 5 meters'],
        [20, 'Elevations: 1358.4 to 2060.0 meters, contours every 20 meters'],
        [100, 'Elevations: -5131.5 to 8900.4 meters, contours every 100 meters']
    ]);
});


test('site, an existing plan', async () => {
    // Plan the site, then add a description, a feature, and an option to the plan
    const first = await runSite(coarseSite());
    const plan = JSON.parse(first.files['plans/road.json']);
    plan.description = ['A road.'];
    plan.criteria = {'maxGrade': 8};
    plan.topography.features = [{'type': 'stream', 'name': 'Creek', 'points': [{'x': 100, 'y': 0}, {'x': 120.5, 'y': 300}]}];
    plan.options = [
        {'name': 'Road', 'section': {'width': 4}, 'alignment': [{'x': 20, 'y': 20, 'z': 1680}, {'x': 318.87, 'y': 242.07}]}
    ];

    // The site, with a wider margin - the plan's topography is the new grid's, and its features and options are moved
    // to its coordinates (20 meters to the east and north). The plan's description and criteria are kept.
    const files = {...first.files, 'plans/road.json': JSON.stringify(plan)};
    const io = await runSite(coarseSite({'margin': 40, 'title': 'Wider Site'}), {files});
    assert.equal(io.code, 0);
    assert.deepEqual(io.output.join('').split('\n').slice(0, 1), ['Grid: 9 x 8 at 50 meters spacing (400 x 350 meters)']);
    const wider = JSON.parse(io.files['plans/road.json']);
    assert.deepEqual(Object.keys(wider), [
        'title', 'description', 'units', 'georeference', 'topography', 'start', 'end', 'criteria', 'options'
    ]);
    assert.deepEqual([wider.title, wider.description, wider.criteria], ['Wider Site', ['A road.'], {'maxGrade': 8}]);
    assert.deepEqual(wider.georeference, {'latitude': 40.001, 'longitude': -105.27825, 'x': 189.439, 'y': 151.033});
    assert.deepEqual([wider.start, wider.end], [{'x': 40, 'y': 40, 'label': 'Start'}, {'x': 338.87, 'y': 262.07, 'label': 'End'}]);
    assert.deepEqual(Object.keys(wider.topography), ['spacing', 'elevations', 'contourInterval', 'sources', 'features']);
    assert.deepEqual([wider.topography.elevations.length, wider.topography.elevations[0].length], [8, 9]);
    assert.deepEqual(wider.topography.features, [
        {'type': 'stream', 'name': 'Creek', 'points': [{'x': 120, 'y': 20}, {'x': 140.5, 'y': 320}]}
    ]);
    assert.deepEqual(wider.options, [
        {'name': 'Road', 'section': {'width': 4}, 'alignment': [{'x': 40, 'y': 40, 'z': 1680}, {'x': 338.87, 'y': 262.07}]}
    ]);

    // The cached tile is too small for the wider site - the elevation model is read again
    assert.deepEqual(io.opened, [item.downloadURL]);

    // The site's design criteria replace the plan's - and a plan without features or options has none
    delete wider.topography.features;
    delete wider.options;
    const io2 = await runSite(coarseSite({'margin': 40, 'criteria': {'maxGrade': 12}}), {
        'files': {...io.files, 'plans/road.json': JSON.stringify(wider)}
    });
    const plan2 = JSON.parse(io2.files['plans/road.json']);
    assert.deepEqual(
        [io2.code, io2.opened, plan2.criteria, plan2.options, 'features' in plan2.topography],
        [0, [], {'maxGrade': 12}, [], false]
    );

    // A plan file that isn't a plan yet
    const io3 = await runSite(coarseSite(), {'files': {'plans/road.json': '{"description": ["A new road."]}'}});
    const plan3 = JSON.parse(io3.files['plans/road.json']);
    assert.deepEqual([io3.code, plan3.title, plan3.description, plan3.options], [0, 'Test Site', ['A new road.'], []]);
});


test('site, an existing plan of another site', async () => {
    const first = await runSite(coarseSite());
    const message = 'error: The road plan "plans/road.json" isn\'t a plan of this site - its georeference\'s center isn\'t the site\'s. ' +
        'Plan the site again (remove the plan), or restore its start and end points.\n';

    // The site's start or end point moved - the plan's coordinates aren't the site's
    for (const members of [
        {'start': {'latitude': 40.0001, 'longitude': -105.28}}, {'end': {'latitude': 40.002, 'longitude': -105.2766}}
    ]) {
        const io = await runSite(coarseSite(members), {'files': {...first.files}});
        assert.deepEqual([io.code, io.output.join(''), io.files['plans/road.json']], [1, message, first.files['plans/road.json']]);
    }

    // A plan without a georeference
    const plan = JSON.parse(first.files['plans/road.json']);
    delete plan.georeference;
    const io = await runSite(coarseSite(), {'files': {'plans/road.json': JSON.stringify(plan)}});
    assert.deepEqual([io.code, io.output.join('')], [1, message]);

    // A plan file that isn't JSON
    const io2 = await runSite(coarseSite(), {'files': {'plans/road.json': 'Not JSON'}});
    assert.deepEqual([io2.code, io2.output.join(''), io2.urls], [1, 'error: Could not load the road plan "plans/road.json"\n', []]);
});


test('site, a site that cannot be loaded or is invalid', async () => {
    let io = testIo();
    assert.equal(await cliMain(['site', 'site.json', 'road.json'], io), 1);
    assert.equal(io.output.join(''), 'error: Could not load the road site "site.json"\n');

    io = testIo({'files': {'site.json': 'Not JSON'}});
    assert.equal(await cliMain(['site', 'site.json', 'road.json'], io), 1);
    assert.equal(io.output.join(''), 'error: Could not load the road site "site.json"\n');

    const invalid = testSite();
    delete invalid.units;
    io = await runSite(invalid);
    assert.deepEqual([io.code, io.output.join(''), io.written, io.urls], [
        1, 'error: The road site "site.json" is invalid:\n\nRequired member "units" missing\n', [], []
    ]);
});


test('site, a site without elevation models', async () => {
    // The USGS has no elevation models of the site
    let io = await runSite(coarseSite(), {'pages': [{'total': 0, 'items': []}]});
    assert.deepEqual([io.code, io.output.join(''), io.written], [1, 'error: The USGS has no 1 meter elevation models of the site\n', []]);

    // The site is outside its elevation models
    io = await runSite(coarseSite(), {'images': {[item.downloadURL]: testImage({'east': siteEast + 5000})}});
    assert.deepEqual([io.code, io.output.join('')], [
        1, 'error: The USGS 1 meter elevation models have no elevations for 100% of the site\n'
    ]);
    assert.deepEqual(io.written, ['plans/road.work/terrain/USGS_1M_13_x47y443_CO_New_2020.json']);

    // The product service, or an elevation model, fails
    io = await runSite(coarseSite(), {'pages': [() => Promise.reject(new Error('Could not fetch "https://example.com" (status 503)'))]});
    assert.deepEqual([io.code, io.output.join('')], [1, 'error: Could not fetch "https://example.com" (status 503)\n']);
    io = await runSite(coarseSite(), {'images': {}});
    assert.deepEqual([io.code, io.output.join('')], [1, `error: Could not open "${item.downloadURL}"\n`]);
});


test('site, usage', async () => {
    const usage = `\
usage: plan site <site.json> <plan.json>

  Create a road plan model's site from a road site model - its topography, from the USGS 3D Elevation Program's
  1 meter elevation models, its georeference, and its start and end points. An existing plan's options are kept.
`;
    for (const args of [[], ['site.json'], ['site.json', 'road.json', 'extra'], ['-h', 'road.json'], ['site.json', '--plan']]) {
        const io = testIo();
        assert.deepEqual([await cliMain(['site', ...args], io), io.output.join('')], [1, usage]);
    }
});
