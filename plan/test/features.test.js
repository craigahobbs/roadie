import {exclusionFeatures, lineFeatures} from '../lib/features.js';
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
        'exclusions': [area('Barn', [10, 10], [20, 10], [20, 20]), area(null, [30, 10], [40, 10], [40, 20.04], [-5, 300])]
    });
    assert.deepEqual(exclusionFeatures(layout, site), [
        {'type': 'exclusion', 'name': 'Barn', 'points': [{'x': 10, 'y': 10}, {'x': 20, 'y': 10}, {'x': 20, 'y': 20}]},
        {
            'type': 'exclusion',
            'name': 'Exclusion 2',
            'points': [{'x': 30, 'y': 10}, {'x': 40, 'y': 10}, {'x': 40, 'y': 20}, {'x': -5, 'y': 300}]
        }
    ]);

    // A site without exclusion areas
    assert.deepEqual(exclusionFeatures(layout, testSite()), []);
});
