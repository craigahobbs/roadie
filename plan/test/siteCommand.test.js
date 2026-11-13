import {gridUtm, plane, siteEast, siteNorth, testImage, testIo, testItem, testLine, testPages, testSite} from './terrainHelpers.js';
import {layoutGeoreference, layoutLatLong, siteLayout} from '../lib/terrain.js';
import assert from 'node:assert/strict';
import {cliMain} from '../lib/cli.js';
import test from 'node:test';
import {validatePlan} from '../../viewer/lib/model.js';


// The test site's elevation model, and the topographic map image's bytes
const item = testItem('CO_New_2020', 'x47y443', '2022-02-10');
const mapBytes = Uint8Array.from([137, 80, 78, 71]);


// Run the "site" command for a site and the tools' input and output function arguments (testIo) - returns the
// functions object, with the command's exit "code"
async function runSite(
    site, {files = {}, images = {[item.downloadURL]: testImage()}, pages = testPages({'items': [item]}), mapImage = mapBytes} = {},
    planPath = 'plans/road.json'
) {
    const io = testIo({'files': {...files, 'site.json': JSON.stringify(site)}, images, pages, mapImage});
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
Features: 0 streams, 0 roads, 0 exclusion areas
Topographic map image: plans/road.png
start: "Start" (20, 20) at 40.00000, -105.28000, ground 1679.7
end: "End" (318.87, 242.07) at 40.00200, -105.27650, ground 1720.7
Wrote plans/road.json
`);

    // The elevation models, streams, and roads are the site's box's - and the topographic map image is the site's grid's
    const box = '-105.280234,39.99982,-105.276135,40.002522';
    const query = `/query?where=1%3D1&geometry=${box}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`;
    assert.deepEqual(io.urls, [
        `https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter&bbox=${box}` +
            '&max=100&offset=0',
        `https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6${query}&outFields=gnis_name,ftype&outSR=4326&f=geojson` +
            '&resultOffset=0',
        ...[29, 30, 31, 32, 35, 37].map((layer) => (
            `https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer/${layer}${query}&outFields=name&outSR=4326` +
                '&f=geojson&resultOffset=0'
        )),
        'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/export?bbox=-105.280234,39.99982,-105.276135,40.002522' +
            '&bboxSR=4326&imageSR=4326&size=2000,1714&format=png&f=image'
    ]);

    // The elevation models' tiles are cached in the plan's work directory, and the image is beside the plan
    assert.deepEqual(io.opened, [item.downloadURL]);
    assert.deepEqual(io.written, [
        'plans/road.work/terrain/USGS_1M_13_x47y443_CO_New_2020.json',
        'plans/road.work/terrain/USGS_1M_13_x47y443_CO_New_2020.f32',
        'plans/road.png',
        'plans/road.json'
    ]);
    assert.deepEqual(io.files['plans/road.png'], mapBytes);

    // The plan - the elevation model is a plane that rises 5 meters per grid column to the east and 2.5 meters per grid
    // row to the north
    assert.equal(io.files['plans/road.json'], `\
{
  "title": "Test Site",
  "image": "road.png",
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
    ],
    "features": []
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
        'pages': testPages({'items': [undated]})
    }, 'road.JSON');
    assert.equal(io.code, 0);
    assert.equal(io.output.join(''), `\
Grid: 24 x 18 at 50 feet spacing (1150 x 850 feet)
Elevations: 5501.7 to 5659.2 feet, contours every 5 feet
Elevation model: CO_New_2020
Grid points without an elevation, filled from the points around them: 1
Features: 0 streams, 0 roads, 0 exclusion areas
Topographic map image: road.png
start: "Gate" (60, 60) at 40.00000, -105.28000, ground 5510.7
end: "House" (1040.56, 788.57) at 40.00200, -105.27650, ground 5645.2
Wrote road.JSON
`);
    assert.deepEqual(io.written.slice(-4, -2), [
        'road.work/terrain/USGS_1M_13_x47y443_CO_New_2020.json', 'road.work/terrain/USGS_1M_13_x47y443_CO_New_2020.f32'
    ]);
    assert.deepEqual(io.written.slice(-2), ['road.png', 'road.JSON']);
    const plan = JSON.parse(io.files['road.JSON']);
    assert.deepEqual(Object.keys(plan), [
        'title', 'image', 'units', 'georeference', 'topography', 'start', 'end', 'criteria', 'costRates', 'options'
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


test('site, the features', async () => {
    // The site's streams, roads and trails, and exclusion areas, in the plan's coordinates
    const site = coarseSite();
    const layout = siteLayout(site);
    const lonLat = (x, y) => {
        const [latitude, longitude] = layoutLatLong(layout, x, y);
        return [longitude, latitude];
    };
    site.exclusions = [{'points': [[100, 50], [150, 50], [150, 100]].map(([x, y]) => {
        const [longitude, latitude] = lonLat(x, y);
        return {latitude, longitude};
    })}];
    const io = await runSite(site, {'pages': testPages({
        'items': [item],
        'streams': [
            testLine({'gnis_name': 'Mill Creek', 'ftype': 460}, [lonLat(-50, 200), lonLat(100, 200)]),
            testLine({'gnis_name': 'Mill Creek', 'ftype': 460}, [lonLat(100, 200), lonLat(200, 100), lonLat(200, -50)]),
            testLine({'gnis_name': 'Pipe', 'ftype': 428}, [lonLat(0, 0), lonLat(100, 100)])
        ],
        'roads': [testLine({'name': 'Ridge Rd'}, [lonLat(0, 250), lonLat(350, 250)])]
    })});
    assert.equal(io.code, 0);
    assert.equal(io.output.join('').split('\n')[3], 'Features: 1 stream, 1 road, 1 exclusion area');
    assert.deepEqual(JSON.parse(io.files['plans/road.json']).topography.features, [
        {
            'type': 'stream',
            'name': 'Mill Creek',
            'points': [{'x': 0, 'y': 200}, {'x': 100, 'y': 200}, {'x': 200, 'y': 100}, {'x': 200, 'y': 0}]
        },
        {'type': 'road', 'name': 'Ridge Rd', 'points': [{'x': 0, 'y': 250}, {'x': 350, 'y': 250}]},
        {'type': 'exclusion', 'name': 'Exclusion 1', 'points': [{'x': 100, 'y': 50}, {'x': 150, 'y': 50}, {'x': 150, 'y': 100}]}
    ]);
});


test('site, a site without roads or a topographic map image', async () => {
    // The roads and the image are for reference - the plan is made without them
    const failed = new Error('Could not fetch "https://example.com/roads" (status 503)');
    const io = await runSite(coarseSite(), {'pages': testPages({'items': [item], 'roads': failed}), 'mapImage': null});
    assert.equal(io.code, 0);
    assert.deepEqual(io.output.join('').split('\n').slice(3, 6), [
        'Features: 0 streams, 0 roads, 0 exclusion areas',
        'warning: The site has no roads - Could not fetch "https://example.com/roads" (status 503)',
        'warning: The site has no topographic map image - Could not fetch "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/' +
            'MapServer/export?bbox=-105.280234,39.99982,-105.276135,40.002522&bboxSR=4326&imageSR=4326&size=2000,1714&format=png' +
            '&f=image" (status 500)'
    ]);
    const plan = JSON.parse(io.files['plans/road.json']);
    assert.deepEqual(['image' in plan, plan.topography.features, io.written.includes('plans/road.png')], [false, [], false]);

    // An existing plan's image is kept
    plan.image = 'old.png';
    const io2 = await runSite(coarseSite(), {'files': {...io.files, 'plans/road.json': JSON.stringify(plan)}, 'mapImage': null});
    assert.equal(JSON.parse(io2.files['plans/road.json']).image, 'old.png');

    // A tall site's image - its grid is 150 x 500 meters
    const tall = await runSite(coarseSite({'end': {'latitude': 40.004, 'longitude': -105.279}}));
    assert.ok(tall.urls.at(-1).endsWith('&size=600,2000&format=png&f=image'), tall.urls.at(-1));
});


test('site, an existing plan', async () => {
    // Plan the site, then add a description, a feature, and an option to the plan
    const first = await runSite(coarseSite());
    const plan = JSON.parse(first.files['plans/road.json']);
    plan.description = ['A road.'];
    plan.criteria = {'maxGrade': 8};
    plan.topography.features = [
        {'type': 'stream', 'name': 'Old Creek', 'points': [{'x': 100, 'y': 0}, {'x': 120.5, 'y': 300}]},
        {'type': 'road', 'name': 'Old Rd', 'points': [{'x': 0, 'y': 100}, {'x': 300, 'y': 100}]},
        {'type': 'rock', 'name': 'Outcrop', 'points': [{'x': 100, 'y': 100}, {'x': 120.5, 'y': 100}, {'x': 120, 'y': 130}]},
        {'type': 'exclusion', 'name': 'Barn', 'points': [{'x': 10, 'y': 10}, {'x': 20, 'y': 10}, {'x': 20, 'y': 20}]},
        {'type': 'exclusion', 'name': 'Pond', 'points': [{'x': 200, 'y': 200}, {'x': 220, 'y': 200}, {'x': 220, 'y': 220}]},
        {'type': 'exclusion', 'points': [{'x': 300, 'y': 200}, {'x': 320, 'y': 200}, {'x': 320, 'y': 220}]}
    ];
    plan.options = [
        {'name': 'Road', 'section': {'width': 4}, 'alignment': [{'x': 20, 'y': 20, 'z': 1680}, {'x': 318.87, 'y': 242.07}]}
    ];

    // The site, with a wider margin and an exclusion area - the plan's topography is the new grid's, and its features
    // and options are moved to its coordinates (20 meters to the east and north). The plan's description and criteria
    // are kept.
    const files = {...first.files, 'plans/road.json': JSON.stringify(plan)};
    const widerLayout = siteLayout(coarseSite({'margin': 40}));
    const barn = [[25, 25], [45, 25], [45, 45]].map(([x, y]) => {
        const [latitude, longitude] = layoutLatLong(widerLayout, x, y);
        return {latitude, longitude};
    });
    const [creekLatitude, creekLongitude] = layoutLatLong(widerLayout, 150, 100);
    const [creekLatitude2, creekLongitude2] = layoutLatLong(widerLayout, 150, 200);
    const io = await runSite(coarseSite({'margin': 40, 'title': 'Wider Site', 'exclusions': [{'name': 'Barn', 'points': barn}]}), {
        files,
        'pages': testPages({'items': [item], 'streams': [
            testLine({'gnis_name': 'New Creek', 'ftype': 460}, [[creekLongitude, creekLatitude], [creekLongitude2, creekLatitude2]])
        ]})
    });
    assert.equal(io.code, 0);
    assert.deepEqual(io.output.join('').split('\n').slice(0, 1), ['Grid: 9 x 8 at 50 meters spacing (400 x 350 meters)']);
    const wider = JSON.parse(io.files['plans/road.json']);
    assert.deepEqual(Object.keys(wider), [
        'title', 'description', 'image', 'units', 'georeference', 'topography', 'start', 'end', 'criteria', 'options'
    ]);
    assert.deepEqual([wider.title, wider.description, wider.criteria], ['Wider Site', ['A road.'], {'maxGrade': 8}]);
    assert.deepEqual(wider.georeference, {'latitude': 40.001, 'longitude': -105.27825, 'x': 189.439, 'y': 151.033});
    assert.deepEqual([wider.start, wider.end], [{'x': 40, 'y': 40, 'label': 'Start'}, {'x': 338.87, 'y': 262.07, 'label': 'End'}]);
    assert.deepEqual(Object.keys(wider.topography), ['spacing', 'elevations', 'contourInterval', 'sources', 'features']);
    assert.deepEqual([wider.topography.elevations.length, wider.topography.elevations[0].length], [8, 9]);

    // The streams, roads, and the site's exclusion areas are the site's - the plan's rock outcrops and its other
    // exclusion areas are kept, in the new grid's coordinates
    assert.deepEqual(wider.topography.features, [
        {'type': 'stream', 'name': 'New Creek', 'points': [{'x': 150, 'y': 100}, {'x': 150, 'y': 200}]},
        {'type': 'exclusion', 'name': 'Barn', 'points': [{'x': 25, 'y': 25}, {'x': 45, 'y': 25}, {'x': 45, 'y': 45}]},
        {'type': 'rock', 'name': 'Outcrop', 'points': [{'x': 120, 'y': 120}, {'x': 140.5, 'y': 120}, {'x': 140, 'y': 150}]},
        {'type': 'exclusion', 'name': 'Pond', 'points': [{'x': 220, 'y': 220}, {'x': 240, 'y': 220}, {'x': 240, 'y': 240}]},
        {'type': 'exclusion', 'points': [{'x': 320, 'y': 220}, {'x': 340, 'y': 220}, {'x': 340, 'y': 240}]}
    ]);
    assert.deepEqual(wider.options, [
        {'name': 'Road', 'section': {'width': 4}, 'alignment': [{'x': 40, 'y': 40, 'z': 1680}, {'x': 338.87, 'y': 262.07}]}
    ]);

    // The cached tile is too small for the wider site - the elevation model is read again
    assert.deepEqual(io.opened, [item.downloadURL]);

    // The site's design criteria replace the plan's - and a plan without features or options has only the site's
    delete wider.topography.features;
    delete wider.options;
    const io2 = await runSite(coarseSite({'margin': 40, 'criteria': {'maxGrade': 12}}), {
        'files': {...io.files, 'plans/road.json': JSON.stringify(wider)}
    });
    const plan2 = JSON.parse(io2.files['plans/road.json']);
    assert.deepEqual([io2.code, io2.opened, plan2.criteria, plan2.options, plan2.topography.features], [0, [], {'maxGrade': 12}, [], []]);

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
    let io = await runSite(coarseSite(), {'pages': testPages()});
    assert.deepEqual([io.code, io.output.join(''), io.written], [1, 'error: The USGS has no 1 meter elevation models of the site\n', []]);

    // The site is outside its elevation models
    io = await runSite(coarseSite(), {'images': {[item.downloadURL]: testImage({'east': siteEast + 5000})}});
    assert.deepEqual([io.code, io.output.join('')], [
        1, 'error: The USGS 1 meter elevation models have no elevations for 100% of the site\n'
    ]);
    assert.deepEqual(io.written, ['plans/road.work/terrain/USGS_1M_13_x47y443_CO_New_2020.json']);

    // The product service, an elevation model, or the stream service fails - a road crosses streams, so the plan needs
    // them
    const failed = new Error('Could not fetch "https://example.com" (status 503)');
    io = await runSite(coarseSite(), {'pages': testPages({'items': failed})});
    assert.deepEqual([io.code, io.output.join('')], [1, 'error: Could not fetch "https://example.com" (status 503)\n']);
    io = await runSite(coarseSite(), {'images': {}});
    assert.deepEqual([io.code, io.output.join('')], [1, `error: Could not open "${item.downloadURL}"\n`]);
    io = await runSite(coarseSite(), {'pages': testPages({'items': [item], 'streams': failed})});
    assert.deepEqual([io.code, io.output.join(''), io.written.includes('plans/road.json')], [
        1, 'error: Could not fetch "https://example.com" (status 503)\n', false
    ]);
});


test('site, usage', async () => {
    const usage = `\
usage: plan site <site.json> <plan.json>

  Create a road plan model's site from a road site model - its topography, from the USGS 3D Elevation Program's
  1 meter elevation models, its georeference, its start and end points, its streams, roads, and exclusion areas,
  and its topographic map image ("<plan>.png"). An existing plan's options are kept.
`;
    for (const args of [[], ['site.json'], ['site.json', 'road.json', 'extra'], ['-h', 'road.json'], ['site.json', '--plan']]) {
        const io = testIo();
        assert.deepEqual([await cliMain(['site', ...args], io), io.output.join('')], [1, usage]);
    }
});
