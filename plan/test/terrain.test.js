import {
    fillHoles, gridLimit, gridSurvey, layoutBox, layoutGeoreference, layoutLatLong, layoutPoint, metersPerFoot, readTile, round,
    siteLayout, siteTerrain, tileWindow
} from '../lib/terrain.js';
import {gridUtm, plane, siteEast, siteNorth, testImage, testIo, testSite} from './terrainHelpers.js';
import {project, transverseMercator} from '../../viewer/lib/geo.js';
import assert from 'node:assert/strict';
import test from 'node:test';


// Get a layout's members, less its projection, rounded to millimeters
function layoutMembers(layout) {
    const {projection, ...members} = layout;
    assert.deepEqual(projection, transverseMercator(layout.latitude, layout.longitude));
    return {...members, 'west': round(members.west, 3), 'south': round(members.south, 3)};
}


// Create a tile of an elevation image - all of the image's elevations
async function imageTile(image) {
    const {width, height} = image.georeference;
    const window = [0, 0, width, height];
    return {'url': 'https://example.com/tile.tif', 'image': image.georeference, window, 'data': await image.read(window)};
}


// Create a layout's grid of elevations, without any
function emptyGrid(layout) {
    return new Float64Array(layout.nCols * layout.nRows).fill(NaN);
}


// A small layout of the test site - 86 x 67 points, 4 meters apart
function smallLayout(members = {}) {
    return siteLayout(testSite({'margin': 20, 'spacing': 4, ...members}));
}


test('siteLayout', () => {
    // The plan's projection is centered between the start and end points. The site extends its margin beyond them - 30%
    // of the 372 meters between them, but at least 150 meters - and its grid is the finest that's within the limit
    assert.equal(gridLimit, 1000000);
    assert.equal(metersPerFoot, 0.3048);
    assert.deepEqual(layoutMembers(siteLayout(testSite())), {
        'units': 'meters',
        'scale': 1,
        'latitude': 40.001,
        'longitude': -105.27825,
        'west': -299.439,
        'south': -261.033,
        'spacing': 1,
        'nCols': 600,
        'nRows': 524,
        'start': {'x': 150, 'y': 150, 'label': 'Start'},
        'end': {'x': 448.87, 'y': 372.07, 'label': 'End'}
    });

    // The start and end points are their projections, from the grid's southwest corner
    const projection = transverseMercator(40.001, -105.27825);
    const [startEast, startNorth] = project(projection, 40, -105.28);
    const [endEast, endNorth] = project(projection, 40.002, -105.2765);
    assert.deepEqual(
        [round(startEast + 299.439, 2), round(startNorth + 261.033, 2), round(endEast + 299.439, 2), round(endNorth + 261.033, 2)],
        [150, 150, 448.87, 372.07]
    );
});


test('siteLayout, feet', () => {
    // The margin is at least 500 feet, and the points' labels are the site's
    const site = testSite({'units': 'feet', 'start': {'latitude': 40, 'longitude': -105.28, 'label': 'Gate'}});
    assert.deepEqual(layoutMembers(siteLayout(site)), {
        'units': 'feet',
        'scale': 0.3048,
        'latitude': 40.001,
        'longitude': -105.27825,
        'west': -301.839,
        'south': -263.433,
        'spacing': 5,
        'nCols': 398,
        'nRows': 347,
        'start': {'x': 500, 'y': 500, 'label': 'Gate'},
        'end': {'x': 1480.56, 'y': 1228.57, 'label': 'End'}
    });

    // A smaller grid limit is a coarser grid - the coarsest, if none is within the limit
    assert.deepEqual(
        [20000, 16000, 15678, 15677, 10].map((limit) => {
            const {spacing, nCols, nRows} = siteLayout(site, limit);
            return [spacing, nCols, nRows];
        }),
        [[15, 134, 117], [15, 134, 117], [15, 134, 117], [20, 101, 88], [200, 11, 10]]
    );
});


test('siteLayout, the site\'s margin and spacing', () => {
    assert.deepEqual(layoutMembers(smallLayout()), {
        'units': 'meters',
        'scale': 1,
        'latitude': 40.001,
        'longitude': -105.27825,
        'west': -169.439,
        'south': -131.033,
        'spacing': 4,
        'nCols': 86,
        'nRows': 67,
        'start': {'x': 20, 'y': 20, 'label': 'Start'},
        'end': {'x': 318.87, 'y': 242.07, 'label': 'End'}
    });

    // The grid covers the site (339 x 262 meters) - its last points are at, or beyond, the margin
    const coarse = siteLayout(testSite({'margin': 20, 'spacing': 50}));
    assert.deepEqual([coarse.nCols, coarse.nRows], [8, 7]);

    // A longer road's margin is 30% of its length - here, 4,201 meters
    const long = siteLayout(testSite({'end': {'latitude': 40.03, 'longitude': -105.25, 'label': 'Summit'}}));
    assert.deepEqual([long.start, long.end, long.spacing, long.nCols, long.nRows], [
        {'x': 1260.57, 'y': 1260.57, 'label': 'Start'}, {'x': 3821.82, 'y': 4591.62, 'label': 'Summit'}, 10, 510, 587
    ]);
    assert.equal(round(Math.hypot(3821.82 - 1260.57, 4591.62 - 1260.57) * 0.3, 2), 1260.57);
});


test('layoutGeoreference, layoutLatLong, layoutPoint, and layoutBox', () => {
    // The georeference is the plan coordinates of the projection's center
    const layout = siteLayout(testSite());
    assert.deepEqual(layoutGeoreference(layout), {'latitude': 40.001, 'longitude': -105.27825, 'x': 299.439, 'y': 261.033});
    assert.deepEqual(layoutLatLong(layout, 299.4392496795282, 261.0331752239598).map((degrees) => round(degrees, 7)), [40.001, -105.27825]);

    // The start and end points' latitudes and longitudes are the site's
    assert.deepEqual(layoutLatLong(layout, 150, 150).map((degrees) => round(degrees, 7)), [40, -105.28]);
    assert.deepEqual(layoutPoint(layout, 40.002, -105.2765).map((value) => round(value, 2)), [448.87, 372.07]);

    // In feet
    const feet = siteLayout(testSite({'units': 'feet'}));
    assert.deepEqual(layoutGeoreference(feet), {'latitude': 40.001, 'longitude': -105.27825, 'x': 990.286, 'y': 864.282});
    assert.deepEqual(layoutLatLong(feet, 500, 500).map((degrees) => round(degrees, 7)), [40, -105.28]);
    assert.deepEqual(layoutPoint(feet, 40.002, -105.2765).map((value) => round(value, 2)), [1480.56, 1228.57]);

    // The grid's box of the Earth - west, south, east, and north
    assert.deepEqual(layoutBox(layout), [-105.281757, 39.998649, -105.274742, 40.003359]);
});


test('tileWindow', () => {
    // The grid's pixels in a 1 meter elevation model - the grid's 599 x 523 meters, half a grid cell beyond its points,
    // and two pixels more. The model's northwest corner is 1,000 meters northwest of the site's center.
    const layout = siteLayout(testSite());
    assert.deepEqual(tileWindow(layout, testImage().georeference), [696, 729, 1302, 1260]);

    // The grid's corners' pixels - the plan's north is a fifth of a degree from the zone's, so the grid is turned
    assert.deepEqual(
        [[0, 0], [599, 0], [0, 523], [599, 523]].map(([col, row]) => {
            const [east, north] = gridUtm(layout, 13, col, row);
            return [round(east - (siteEast - 1000), 1), round(siteNorth + 1000 - north, 1)];
        }),
        [[700.5, 731.9], [1299.3, 733.8], [698.9, 1254.7], [1297.6, 1256.6]]
    );

    // A model the grid is partly within
    assert.deepEqual(tileWindow(layout, testImage({'east': siteEast - 100, 'north': siteNorth + 100}).georeference), [0, 0, 402, 360]);
    assert.deepEqual(tileWindow(layout, testImage({'width': 1000, 'height': 1000}).georeference), [696, 729, 1000, 1000]);

    // A model the grid is outside of
    assert.equal(tileWindow(layout, testImage({'east': siteEast + 5000}).georeference), null);
    assert.equal(tileWindow(layout, testImage({'north': siteNorth - 5000}).georeference), null);
    assert.equal(tileWindow(layout, testImage({'width': 690}).georeference), null);
    assert.equal(tileWindow(layout, testImage({'height': 720}).georeference), null);

    // A coarser grid's window - and a 2 meter model's
    const small = smallLayout();
    assert.deepEqual(tileWindow(small, testImage().georeference), [825, 857, 1174, 1131]);
    assert.deepEqual(tileWindow(small, testImage({'resolution': 2}).georeference), [411, 427, 588, 567]);

    // Another zone's model - the site is far to the east of zone 12's center, so the grid is turned 4 degrees there
    const zone12 = testImage({'zone': 12, 'east': 988000, 'north': 4444000, 'width': 1000, 'height': 1000}).georeference;
    assert.deepEqual(tileWindow(small, zone12), [359, 274, 725, 570]);
});


test('gridSurvey', async () => {
    // A plane's grid elevations are the plane's - a grid point's elevation is the mean of the 4 x 4 samples in its cell
    const layout = smallLayout();
    const tile = await imageTile(testImage());
    const elevations = emptyGrid(layout);
    assert.equal(gridSurvey(layout, [tile], elevations), 86 * 67);
    let worst = 0;
    for (let row = 0; row < layout.nRows; row++) {
        for (let col = 0; col < layout.nCols; col++) {
            worst = Math.max(worst, Math.abs(elevations[row * layout.nCols + col] - plane(...gridUtm(layout, 13, col, row))));
        }
    }
    assert.ok(worst < 0.001, `${worst}`);

    // The grid's rows are from the north, and its columns are from the west - the plane rises to the north and east
    assert.deepEqual(
        [0, 85, 66 * 86, 66 * 86 + 85].map((index) => round(elevations[index], 1)),
        [1689.9, 1723.9, 1676.7, 1710.6]
    );

    // A 1 meter grid's elevations, and a 2 meter model's
    for (const [members, image] of [[{'spacing': 1}, testImage()], [{}, testImage({'resolution': 2})]]) {
        const layout2 = smallLayout(members);
        const elevations2 = emptyGrid(layout2);
        assert.equal(gridSurvey(layout2, [await imageTile(image)], elevations2), layout2.nCols * layout2.nRows);
        for (const [col, row] of [[0, 0], [layout2.nCols - 1, 0], [7, 11], [layout2.nCols - 1, layout2.nRows - 1]]) {
            assert.ok(Math.abs(elevations2[row * layout2.nCols + col] - plane(...gridUtm(layout2, 13, col, row))) < 0.001);
        }
    }

    // Another zone's model
    const plane12 = (east, north) => 1700 + 0.1 * (east - 988500) + 0.05 * (north - 4443500);
    const zone12 = await imageTile(testImage({
        'zone': 12, 'east': 988200, 'north': 4443900, 'width': 800, 'height': 800, 'elevation': plane12
    }));
    const elevations12 = emptyGrid(layout);
    assert.equal(gridSurvey(layout, [zone12], elevations12), 86 * 67);
    for (const [col, row] of [[0, 0], [85, 0], [40, 30], [0, 66], [85, 66]]) {
        assert.ok(Math.abs(elevations12[row * 86 + col] - plane12(...gridUtm(layout, 12, col, row))) < 0.001);
    }
});


test('gridSurvey, a grid point\'s elevation is the mean of its cell\'s', async () => {
    // A valley along a grid point's meridian - its sides rise a meter per meter. The point's 4 meter cell's mean
    // elevation is about a meter - the mean of its samples, half a meter and a meter and a half either side of it.
    const layout = smallLayout();
    const [valleyEast] = gridUtm(layout, 13, 40, 30);
    const valley = (east) => Math.abs(east - valleyEast);
    const elevations = emptyGrid(layout);
    gridSurvey(layout, [await imageTile(testImage({'elevation': valley}))], elevations);
    const mean = elevations[30 * 86 + 40];
    assert.ok(mean > 0.95 && mean < 1.2, `${mean}`);

    // The cells either side are 4 meters up the valley's sides
    assert.deepEqual([round(elevations[30 * 86 + 39], 2), round(elevations[30 * 86 + 41], 2)], [4, 4]);

    // A 1 meter grid's point there is the valley's bottom, about
    const fine = smallLayout({'spacing': 1});
    const fineElevations = emptyGrid(fine);
    gridSurvey(fine, [await imageTile(testImage({'elevation': valley}))], fineElevations);
    assert.ok(fineElevations[120 * fine.nCols + 160] < 0.6);
});


test('gridSurvey, a model without elevations', async () => {
    // The model has no elevations in a 40 x 20 meter block - the grid points there have none, nor do the points whose
    // cells are beside it (their samples' interpolations need its pixels)
    const layout = smallLayout();
    const [east, north] = gridUtm(layout, 13, 40, 30);
    const pixelX = Math.round(east - (siteEast - 1000));
    const pixelY = Math.round(siteNorth + 1000 - north);
    const holes = (x, y) => x >= pixelX - 20 && x < pixelX + 20 && y >= pixelY - 10 && y < pixelY + 10;
    const elevations = emptyGrid(layout);
    const count = gridSurvey(layout, [await imageTile(testImage({holes}))], elevations);
    const empty = [];
    for (let index = 0; index < elevations.length; index++) {
        if (Number.isNaN(elevations[index])) {
            empty.push([index % 86, Math.floor(index / 86)]);
        }
    }
    assert.equal(count, 86 * 67 - empty.length);
    assert.deepEqual(empty, [
        [36, 28], [37, 28], [38, 28], [39, 28], [40, 28], [41, 28], [42, 28], [43, 28], [44, 28],
        [36, 29], [37, 29], [38, 29], [39, 29], [40, 29], [41, 29], [42, 29], [43, 29], [44, 29],
        [36, 30], [37, 30], [38, 30], [39, 30], [40, 30], [41, 30], [42, 30], [43, 30], [44, 30],
        [36, 31], [37, 31], [38, 31], [39, 31], [40, 31], [41, 31], [42, 31], [43, 31], [44, 31],
        [36, 32], [37, 32], [38, 32], [39, 32], [40, 32], [41, 32], [42, 32], [43, 32], [44, 32]
    ]);

    // A point at the block's edge is the mean of its cell's samples that have elevations
    assert.ok(Math.abs(elevations[30 * 86 + 35] - plane(...gridUtm(layout, 13, 35, 30))) < 0.2);

    // Elevations that aren't numbers are no elevation, too - and the grid's points that have elevations are kept
    const nan = await imageTile(testImage({'noData': null}));
    nan.data.fill(NaN, 0, nan.data.length / 2);
    const kept = emptyGrid(layout);
    kept[0] = 1234;
    kept[66 * 86 + 85] = 5678;
    const keptCount = gridSurvey(layout, [nan], kept);
    assert.ok(keptCount > 0 && keptCount < 86 * 67 / 2);
    assert.deepEqual([kept[0], Number.isNaN(kept[1]), kept[66 * 86 + 85]], [1234, true, 5678]);
    assert.ok(Math.abs(kept[66 * 86 + 84] - plane(...gridUtm(layout, 13, 84, 66))) < 0.001);
});


test('gridSurvey, a survey\'s tiles', async () => {
    // Two tiles, side by side, that overlap by 12 meters about a grid column (40) - the west tile is 10 meters higher. A
    // grid point's samples are the first tile's that has an elevation there.
    const layout = smallLayout();
    const [east] = gridUtm(layout, 13, 40, 30);
    const split = Math.round(east - (siteEast - 1000));
    const higher = (zoneEast, zoneNorth) => plane(zoneEast, zoneNorth) + 10;
    const west = await imageTile(testImage({'width': split + 6, 'elevation': higher}));
    const eastTile = await imageTile(testImage({'east': siteEast - 1000 + split - 6, 'width': 2000 - split + 6}));
    const elevations = emptyGrid(layout);
    assert.equal(gridSurvey(layout, [west, eastTile], elevations), 86 * 67);
    const difference = (col) => round(elevations[30 * 86 + col] - plane(...gridUtm(layout, 13, col, 30)), 2) + 0;
    assert.deepEqual([0, 39, 40, 41, 42, 85].map(difference), [10, 10, 10, 10, 0, 0]);

    // The other order - the east tile's elevations are used in the tiles' overlap. A quarter of column 39's samples
    // are the west tile's.
    const elevations2 = emptyGrid(layout);
    assert.equal(gridSurvey(layout, [eastTile, west], elevations2), 86 * 67);
    const difference2 = (col) => round(elevations2[30 * 86 + col] - plane(...gridUtm(layout, 13, col, 30)), 2) + 0;
    assert.deepEqual([0, 38, 39, 40, 41, 85].map(difference2), [10, 10, 2.5, 0, 0, 0]);
});


test('fillHoles', () => {
    // A grid's points without an elevation are the mean of the points around them that have one - a pass at a time:
    // the points filled in a pass are those beside the points that had elevations before it
    const layout = {'nCols': 5, 'nRows': 4};
    const hole = NaN;
    const elevations = Float64Array.from([
        hole, 10, 20, 30, 40,
        10, 20, hole, hole, hole,
        20, 30, hole, hole, hole,
        30, 40, hole, hole, hole
    ]);
    assert.equal(fillHoles(layout, elevations), 10);
    assert.deepEqual([...elevations].map((elevation) => round(elevation, 2)), [
        13.33, 10, 20, 30, 40,
        10, 20, 22, 30, 35,
        20, 30, 30, 30.4, 32.5,
        30, 40, 35, 32.5, 31.8
    ]);

    // A grid without holes
    const full = Float64Array.from([1, 2, 3, 4]);
    assert.equal(fillHoles({'nCols': 2, 'nRows': 2}, full), 0);
    assert.deepEqual([...full], [1, 2, 3, 4]);
});


test('readTile', async () => {
    const url = 'https://example.com/Projects/CO_New_2020/TIFF/USGS_1M_13_x47y443_CO_New_2020.tif';
    const model = {'name': 'Model', 'survey': 'CO_New_2020', 'date': '2022-02-10', url};
    const image = testImage();
    const io = testIo({'images': {[url]: image}});
    const layout = smallLayout();

    // The tile is the window of the model that the grid needs - it's cached in the directory
    const tile = await readTile(io, 'plan.work/terrain', model, layout);
    const window = [825, 857, 1174, 1131];
    assert.deepEqual([tile.url, tile.image, tile.window], [url, image.georeference, window]);
    assert.deepEqual([tile.data.constructor, tile.data.length], [Float32Array, 349 * 274]);
    assert.ok(Math.abs(tile.data[0] - plane(siteEast - 1000 + 825.5, siteNorth + 1000 - 857.5)) < 0.001);
    assert.deepEqual([io.opened, image.reads], [[url], [window]]);
    assert.deepEqual(io.written, [
        'plan.work/terrain/USGS_1M_13_x47y443_CO_New_2020.json', 'plan.work/terrain/USGS_1M_13_x47y443_CO_New_2020.f32'
    ]);
    assert.deepEqual(JSON.parse(io.files['plan.work/terrain/USGS_1M_13_x47y443_CO_New_2020.json']), {
        url, 'image': image.georeference, window
    });
    assert.equal(io.files['plan.work/terrain/USGS_1M_13_x47y443_CO_New_2020.f32'].length, 4 * 349 * 274);

    // The cached tile is read - the model isn't opened again
    const cached = await readTile(io, 'plan.work/terrain', model, layout);
    assert.deepEqual([cached.url, cached.image, cached.window], [url, image.georeference, window]);
    assert.deepEqual(cached.data, tile.data);
    assert.deepEqual([io.opened.length, image.reads.length, io.written.length], [1, 1, 2]);

    // A smaller grid's tile is the cached tile, too
    const smaller = await readTile(io, 'plan.work/terrain', model, smallLayout({'margin': 10}));
    assert.deepEqual([smaller.window, io.opened.length], [window, 1]);

    // A larger grid's tile is read from the model
    const larger = await readTile(io, 'plan.work/terrain', model, smallLayout({'margin': 40}));
    assert.deepEqual([larger.window, io.opened.length, image.reads.length], [[805, 837, 1194, 1151], 2, 2]);
    assert.deepEqual(JSON.parse(io.files['plan.work/terrain/USGS_1M_13_x47y443_CO_New_2020.json']).window, [805, 837, 1194, 1151]);
    assert.equal(io.files['plan.work/terrain/USGS_1M_13_x47y443_CO_New_2020.f32'].length, 4 * 389 * 314);

    // A cached tile of another URL's model isn't this model's
    const other = await readTile(io, 'plan.work/terrain', {...model, 'url': `https://example.org${url.slice(19)}`}, layout).catch(
        ({message}) => message
    );
    assert.equal(other, `Could not open "https://example.org${url.slice(19)}"`);
});


test('readTile, a model the grid is outside of', async () => {
    const url = 'https://example.com/far.TIFF';
    const model = {'name': 'Far', 'survey': 'far.TIFF', 'date': '', url};
    const image = testImage({'east': siteEast + 5000});
    const io = testIo({'images': {[url]: image}, 'files': {'cache/far.json': 'Not JSON'}});
    const layout = smallLayout();

    // There's no tile - that's cached, so the model isn't opened again
    assert.equal(await readTile(io, 'cache', model, layout), null);
    assert.deepEqual([io.opened, image.reads, io.written], [[url], [], ['cache/far.json']]);
    assert.deepEqual(JSON.parse(io.files['cache/far.json']), {url, 'image': image.georeference, 'window': null});
    assert.equal(await readTile(io, 'cache', model, layout), null);
    assert.deepEqual([io.opened.length, io.written.length], [1, 1]);

    // A grid that the model is within has a tile - it's read
    const near = siteLayout(testSite({'margin': 5000, 'spacing': 50}));
    const tile = await readTile(io, 'cache', model, near);
    assert.deepEqual([tile.window, io.opened.length, image.reads], [[0, 0, 191, 2000], 2, [[0, 0, 191, 2000]]]);
});


test('siteTerrain', async () => {
    // Two surveys' models - the newer survey has no elevations in the site's west half, or in its other tile
    const layout = smallLayout();
    const [east] = gridUtm(layout, 13, 40, 30);
    const split = Math.round(east - (siteEast - 1000));
    const images = {
        'new1': testImage({'holes': (x) => x < split, 'elevation': (zoneEast, zoneNorth) => plane(zoneEast, zoneNorth) + 10}),
        'new2': testImage({'holes': () => true}),
        'far': testImage({'east': siteEast + 5000}),
        'old': testImage()
    };
    const models = [
        {'name': 'New 1', 'survey': 'CO_New_2020', 'date': '2022-02-10', 'url': 'new1'},
        {'name': 'New 2', 'survey': 'CO_New_2020', 'date': '2022-02-10', 'url': 'new2'},
        {'name': 'Far', 'survey': 'CO_Far_2019', 'date': '2021-01-01', 'url': 'far'},
        {'name': 'Old', 'survey': 'CO_Old_2013', 'date': '2015-07-21', 'url': 'old'},
        {'name': 'Older', 'survey': 'CO_Older_2010', 'date': '2012-01-01', 'url': 'older'}
    ];
    const read = [];
    const readModel = async (model) => {
        read.push(model.url);
        const image = images[model.url];
        const window = tileWindow(layout, image.georeference);
        return window !== null ? {'url': model.url, 'image': image.georeference, window, 'data': await image.read(window)} : null;
    };
    const {elevations, surveys, filled} = await siteTerrain(layout, models, readModel);

    // The newer survey's elevations are the grid's - the older survey's where the newer has none. The oldest survey
    // isn't read - the grid is complete without it.
    assert.deepEqual(read, ['new1', 'new2', 'far', 'old']);
    assert.deepEqual(surveys, [
        {'name': 'CO_New_2020', 'date': '2022-02-10', 'url': 'new1'}, {'name': 'CO_Old_2013', 'date': '2015-07-21', 'url': 'old'}
    ]);
    assert.equal(filled, 0);
    assert.equal(elevations.length, 86 * 67);
    // Column 40 is at the newer survey's edge - its elevation is the mean of its cell's samples that have elevations
    // (its east samples, 1.5 meters to its east)
    const difference = (col) => round(elevations[30 * 86 + col] - plane(...gridUtm(layout, 13, col, 30)), 2) + 0;
    assert.deepEqual([0, 39, 40, 41, 85].map(difference), [0, 0, 10.15, 10, 10]);

    // A survey alone - a few points without an elevation are filled from the points around them
    const [, north] = gridUtm(layout, 13, 40, 30);
    const pixelY = Math.round(siteNorth + 1000 - north);
    images.holes = testImage({'holes': (x, y) => x >= split - 4 && x < split + 4 && y >= pixelY - 4 && y < pixelY + 4});
    const alone = await siteTerrain(layout, [{'name': 'Holes', 'survey': 'CO_Holes_2020', 'date': '', 'url': 'holes'}], readModel);
    assert.deepEqual([alone.surveys, alone.filled], [[{'name': 'CO_Holes_2020', 'date': '', 'url': 'holes'}], 1]);
    assert.ok(Math.abs(alone.elevations[30 * 86 + 40] - plane(...gridUtm(layout, 13, 40, 30))) < 0.01);
});


test('siteTerrain, a site without elevations', async () => {
    const layout = smallLayout();
    const readModel = async (model) => {
        const image = testImage(model.image);
        const window = tileWindow(layout, image.georeference);
        return window !== null ? {'url': model.url, 'image': image.georeference, window, 'data': await image.read(window)} : null;
    };

    // No elevation models
    await assert.rejects(siteTerrain(layout, [], readModel), {'message': 'The USGS has no 1 meter elevation models of the site'});

    // Models that the site is outside of, or that have no elevations there
    const model = (image) => ({'name': 'Model', 'survey': 'CO_New_2020', 'date': '2022-02-10', 'url': 'model', image});
    await assert.rejects(
        siteTerrain(layout, [model({'east': siteEast + 5000})], readModel),
        {'message': 'The USGS 1 meter elevation models have no elevations for 100% of the site'}
    );
    await assert.rejects(
        siteTerrain(layout, [model({'holes': (x) => x < 1000})], readModel),
        {'message': 'The USGS 1 meter elevation models have no elevations for 50% of the site'}
    );

    // More than 1% of the site without elevations is too much to fill
    await assert.rejects(
        siteTerrain(layout, [model({'holes': (x, y) => x < 880 && y < 1000})], readModel),
        {'message': 'The USGS 1 meter elevation models have no elevations for 8% of the site'}
    );
    const few = await siteTerrain(layout, [model({'holes': (x, y) => x < 836 && y < 900})], readModel);
    assert.equal(few.filled, 20);
});
