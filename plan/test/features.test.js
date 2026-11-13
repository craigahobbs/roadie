import {exclusionFeatures, lineFeatures, snapStreams} from '../lib/features.js';
import {layoutLatLong, siteLayout} from '../lib/terrain.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {testSite} from './terrainHelpers.js';


// The test site's layout - its grid is 340 x 264 meters
const layout = siteLayout(testSite({'margin': 20, 'spacing': 4}));


// Get a plan point's [longitude, latitude]
function lonLat(x, y) {
    const [latitude, longitude] = layoutLatLong(layout, x, y);
    return [longitude, latitude];
}


// Create a line object of plan points
function line(name, ...points) {
    return {...(name !== null ? {name} : {}), 'points': points.map(([x, y]) => lonLat(x, y))};
}


// Get line features' names and points
function featureLines(features) {
    return features.map(({name = null, points}) => [name, ...points.map(({x, y}) => [x, y])]);
}


test('lineFeatures', () => {
    // A stream across the site, from beyond it - the feature is the stream's line within the site's grid
    const streams = lineFeatures(layout, 'stream', [line('Mill Creek', [-50, 100], [100, 100], [200, 150], [400, 150])]);
    assert.deepEqual(streams, [
        {
            'type': 'stream',
            'name': 'Mill Creek',
            'points': [{'x': 0, 'y': 100}, {'x': 100, 'y': 100}, {'x': 200, 'y': 150}, {'x': 340, 'y': 150}]
        }
    ]);

    // A line without a name, and its feature's type
    assert.deepEqual(lineFeatures(layout, 'road', [line(null, [10, 20], [30, 40.04])]), [
        {'type': 'road', 'points': [{'x': 10, 'y': 20}, {'x': 30, 'y': 40}]}
    ]);

    // No lines
    assert.deepEqual(lineFeatures(layout, 'road', []), []);
});


test('lineFeatures, the lines are clipped to the site', () => {
    // A line that leaves the site and returns is two features
    const loop = line('Loop Rd', [100, 250], [100, 300], [200, 300], [200, 250], [200, 200]);
    assert.deepEqual(featureLines(lineFeatures(layout, 'road', [loop])), [
        ['Loop Rd', [100, 250], [100, 264]], ['Loop Rd', [200, 264], [200, 200]]
    ]);

    // Each side of the site, and a corner
    assert.deepEqual(featureLines(lineFeatures(layout, 'road', [
        line('West', [-20, 50], [20, 50]), line('East', [320, 50], [360, 50]), line('South', [50, -20], [50, 20]),
        line('North', [50, 244], [50, 284]), line('Corner', [-10, 10], [10, -10]), line('Across', [-34, 132], [374, 132])
    ])), [
        ['West', [0, 50], [20, 50]], ['East', [320, 50], [340, 50]], ['South', [50, 0], [50, 20]], ['North', [50, 244], [50, 264]],
        ['Across', [0, 132], [340, 132]]
    ]);

    // Lines outside the site - beside it, along its side, and through its corner's point - aren't features
    assert.deepEqual(lineFeatures(layout, 'road', [
        line('Beside', [-50, -50], [-10, 400]), line('Above', [50, 300], [100, 300]), line('Along', [-10, 10], [-10, 200]),
        line('Below', [50, -10], [100, -10]), line('Beyond', [350, 10], [350, 200])
    ]), []);
});


test('lineFeatures, the lines are simplified', () => {
    // A line's points within half a meter of the line between the points kept are removed
    assert.deepEqual(featureLines(lineFeatures(layout, 'stream', [
        line(null, [10, 10], [20, 10.4], [30, 10], [40, 11], [50, 10], [50, 10], [60, 10.2], [70, 30], [80, 50], [90, 70.3], [100, 90])
    ])), [
        [null, [10, 10], [30, 10], [40, 11], [50, 10], [60, 10.2], [100, 90]]
    ]);

    // A line that isn't a line - its points are a point - isn't a feature
    assert.deepEqual(lineFeatures(layout, 'stream', [line(null, [100, 100]), line(null, [100, 100], [100.1, 100.1], [100, 100.2])]), []);

    // A line that returns to its start is kept
    assert.deepEqual(featureLines(lineFeatures(layout, 'road', [line('Out and Back', [100, 100], [150, 100], [100, 100])])), [
        ['Out and Back', [100, 100], [150, 100], [100, 100]]
    ]);

    // A plan in feet - half a meter is 1.6 feet. The point 2 feet from the line between the line's ends is kept - the
    // others are within 1.6 feet of the lines to it.
    const feet = siteLayout(testSite({'units': 'feet', 'margin': 60, 'spacing': 10}));
    const points = [[100, 100], [150, 101.5], [200, 100], [250, 102], [300, 100]].map(([x, y]) => {
        const [latitude, longitude] = layoutLatLong(feet, x, y);
        return [longitude, latitude];
    });
    assert.deepEqual(featureLines(lineFeatures(feet, 'road', [{points}])), [[null, [100, 100], [250, 102], [300, 100]]]);
});


test('lineFeatures, a name\'s lines that meet are joined', () => {
    // A stream's reaches are one feature - a reach's end is the next reach's start. Reaches of other names aren't
    // joined to it, and reaches without names are joined to each other.
    assert.deepEqual(featureLines(lineFeatures(layout, 'stream', [
        line('Mill Creek', [100, 100], [200, 100]),
        line('Mill Creek', [10, 50], [100, 100]),
        line('Bear Creek', [200, 100], [300, 100]),
        line(null, [200, 100], [250, 200]),
        line(null, [250, 200.3], [300, 250]),
        line('Mill Creek', [5, 10], [10, 50]),
        line('Bear Creek', [300, 101], [320, 120])
    ])), [
        ['Bear Creek', [200, 100], [300, 100]],
        [null, [200, 100], [250, 200], [300, 250]],
        ['Mill Creek', [5, 10], [10, 50], [100, 100], [200, 100]],
        ['Bear Creek', [300, 101], [320, 120]]
    ]);

    // Lines that meet start to start, or end to end, aren't joined - a stream's line is downstream
    assert.deepEqual(featureLines(lineFeatures(layout, 'stream', [
        line('Mill Creek', [100, 100], [200, 100]), line('Mill Creek', [100, 100], [10, 50]), line('Mill Creek', [300, 150], [200, 100])
    ])), [
        ['Mill Creek', [100, 100], [200, 100]], ['Mill Creek', [100, 100], [10, 50]], ['Mill Creek', [300, 150], [200, 100]]
    ]);
});


test('exclusionFeatures', () => {
    // The site's exclusion areas - an area without a name is named for its place
    const area = (name, ...points) => ({
        ...(name !== null ? {name} : {}),
        'points': points.map(([x, y]) => {
            const [latitude, longitude] = layoutLatLong(layout, x, y);
            return {latitude, longitude};
        })
    });
    const site = testSite({
        'exclusions': [area('Barn', [10, 10], [20, 10], [20, 20]), area(null, [30, 10], [40, 10], [40, 20.04], [5, 200])]
    });
    assert.deepEqual(exclusionFeatures(layout, site), [
        {'type': 'exclusion', 'name': 'Barn', 'points': [{'x': 10, 'y': 10}, {'x': 20, 'y': 10}, {'x': 20, 'y': 20}]},
        {
            'type': 'exclusion',
            'name': 'Exclusion 2',
            'points': [{'x': 30, 'y': 10}, {'x': 40, 'y': 10}, {'x': 40, 'y': 20}, {'x': 5, 'y': 200}]
        }
    ]);

    // A site without exclusion areas
    assert.deepEqual(exclusionFeatures(layout, testSite()), []);
});


test('exclusionFeatures, the areas are clipped to the site', () => {
    // The grid is 340 x 264 meters
    const area = (name, ...points) => ({
        name,
        'points': points.map(([x, y]) => {
            const [latitude, longitude] = layoutLatLong(layout, x, y);
            return {latitude, longitude};
        })
    });
    const features = exclusionFeatures(layout, testSite({'exclusions': [
        // An area over the grid's northeast corner, and one over all of the grid
        area('Corner', [300, 200], [400, 200], [400, 300], [300, 300]),
        area('All', [-100, -100], [500, -100], [500, 400], [-100, 400]),

        // The land north of a line across the grid, and a triangle over its west side
        area('North', [-1000, 100], [1000, 200], [1000, 2000], [-1000, 2000]),
        area('West', [-50, 100], [50, 50], [50, 150]),

        // Areas outside the grid - beside it, and with a point on its side - aren't features
        area('Outside', [400, 100], [500, 100], [500, 200]),
        area('Beside', [340, 100], [500, 50], [500, 150])
    ]}));
    assert.deepEqual(features.map(({type, name, points}) => [type, name, ...points.map(({x, y}) => [x, y])]), [
        ['exclusion', 'Corner', [300, 264], [300, 200], [340, 200], [340, 264]],
        ['exclusion', 'All', [0, 264], [0, 0], [340, 0], [340, 264]],
        ['exclusion', 'North', [0, 264], [0, 150], [340, 167], [340, 264]],
        ['exclusion', 'West', [0, 125], [0, 75], [50, 50], [50, 150]]
    ]);
});


// A valley's ground - the valley's bottom is along x = 100, its sides rise 20%, and it falls 1% to the south. There's
// no ground outside the layout's grid.
function valley(x, y) {
    return x < 0 || y < 0 || x > 340 || y > 264 ? null : 100 + 0.2 * Math.abs(x - 100) + 0.01 * y;
}


// Create a stream feature of plan points
function stream(name, ...points) {
    return {'type': 'stream', ...(name !== null ? {name} : {}), 'points': points.map(([x, y]) => ({x, y}))};
}


test('snapStreams', () => {
    // A stream 20 to 25 meters up the valley's side is moved to the valley's bottom - within a half of the grid's
    // spacing (2 meters) of it
    const {streams, median} = snapStreams(layout, [stream('Mill Creek', [125, 250], [125, 150], [120, 20])], valley);
    assert.deepEqual(streams, [
        stream('Mill Creek', [101, 250], [101, 150.5], [99.8, 118.4], [100.8, 94], [99.9, 69.6], [101, 45.1], [100, 20.8])
    ]);
    assert.equal(median, 24);

    // Streams either side of the valley's bottom - the second has no name
    assert.deepEqual(snapStreams(layout, [stream('Mill Creek', [128, 10], [128, 60]), stream(null, [72, 60], [72, 10])], valley), {
        'streams': [stream('Mill Creek', [100, 10], [100, 60]), stream(null, [100, 60], [100, 10])], 'median': 28
    });

    // No streams
    assert.deepEqual(snapStreams(layout, [], valley), {'streams': [], 'median': 0});
});


test('snapStreams, a stream that is not moved', () => {
    // A stream at the valley's bottom, or within 0.15 meters of its height - the valley's bottom is 20 meters wide
    assert.deepEqual(snapStreams(layout, [stream(null, [100, 20], [100, 250])], valley), {
        'streams': [stream(null, [100, 20], [100, 250])], 'median': 0
    });
    const wide = (x) => 100 + 0.2 * Math.max(0, Math.abs(x - 100) - 10);
    assert.deepEqual(snapStreams(layout, [stream(null, [104, 10], [104, 60])], wide).streams, [stream(null, [104, 10], [104, 60])]);
    assert.deepEqual(snapStreams(layout, [stream(null, [114, 10], [114, 60])], wide).streams, [stream(null, [110, 10], [110, 60])]);

    // A stream on level ground
    assert.deepEqual(snapStreams(layout, [stream(null, [200, 20], [200, 250])], () => 100).streams, [stream(null, [200, 20], [200, 250])]);

    // A stream farther than 30 meters from its valley's bottom - the lowest ground within 30 meters isn't a valley's
    // bottom (it's still falling), so the stream isn't moved. Nor is a stream that crosses the valley.
    assert.deepEqual(snapStreams(layout, [stream(null, [300, 20], [300, 250])], valley), {
        'streams': [stream(null, [300, 20], [300, 250])], 'median': 0
    });
    assert.deepEqual(snapStreams(layout, [stream(null, [50, 100], [150, 100])], valley).streams, [stream(null, [50, 100], [150, 100])]);

    // A stream at the grid's edge, where the ground falls to it
    assert.deepEqual(snapStreams(layout, [stream(null, [5, 0], [5, 30])], (x) => (x < 0 ? null : 100 - x)).streams, [
        stream(null, [5, 0], [5, 30])
    ]);
});


test('snapStreams, the grid\'s edge and a plan in feet', () => {
    // A valley's bottom beyond the grid's edge - the stream is moved to the edge, the lowest ground there is
    const beyond = (x) => (x > 340 ? null : 100 + 0.2 * Math.abs(x - 350));
    assert.deepEqual(snapStreams(layout, [stream(null, [330, 10], [330, 60])], beyond), {
        'streams': [stream(null, [340, 10], [340, 60])], 'median': 10
    });

    // A stream outside the grid, where there's no ground - it's moved to the valley's bottom, within the grid
    const inside = (x) => (x < 0 ? null : 100 + 0.2 * Math.abs(x - 8));
    assert.deepEqual(snapStreams(layout, [stream(null, [-6, 10], [-6, 60])], inside), {
        'streams': [stream(null, [8, 10], [8, 60])], 'median': 14
    });

    // A valley whose bottom leaves the grid - its bottom is to the west of the grid for its southern half
    const west = (x, y) => (x < 0 ? null : 100 + 0.2 * Math.abs(x - (y < 100 ? -20 : 20)));
    assert.deepEqual(snapStreams(layout, [stream(null, [10, 200], [10, 20])], west).streams, [
        stream(null, [20, 200], [20, 113.9], [15, 106.1], [5, 98.3], [0, 90.4], [0, 20])
    ]);

    // A plan in feet - 30 meters is 98 feet: a stream 90 feet from its valley's bottom is moved, and one 110 feet from
    // it isn't
    const feet = siteLayout(testSite({'units': 'feet', 'margin': 60, 'spacing': 10}));
    const valleyFeet = (x) => 100 + 0.2 * Math.abs(x - 100);
    assert.deepEqual(snapStreams(feet, [stream(null, [190, 100], [190, 400]), stream(null, [210, 100], [210, 400])], valleyFeet), {
        'streams': [stream(null, [100, 100], [100, 400]), stream(null, [210, 100], [210, 400])], 'median': 90
    });
});
