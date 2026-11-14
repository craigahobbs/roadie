import {lineIndex, nearestLine, nearestText, segmentNearest} from '../lib/roads.js';
import assert from 'node:assert/strict';
import test from 'node:test';


// A site's features - two roads (one without a name), a stream, and a trail
const features = [
    {'type': 'road', 'name': 'Mill Rd', 'points': [{'x': 0, 'y': 100}, {'x': 200, 'y': 100}, {'x': 200, 'y': 300}]},
    {'type': 'road', 'points': [{'x': 500, 'y': 0}, {'x': 500, 'y': 50}]},
    {'type': 'stream', 'name': 'Mill Creek', 'points': [{'x': 100, 'y': 0}, {'x': 100, 'y': 400}]},
    {'type': 'trail', 'name': 'Mill Trail', 'points': [{'x': 0, 'y': 10}, {'x': 400, 'y': 10}]}
];


test('lineIndex', () => {
    // The roads' three segments, in the index's cells - a segment is in each cell of its box
    const index = lineIndex(features, 'road', 100);
    assert.deepEqual(index.segments, [
        {'name': 'Mill Rd', 'x1': 0, 'y1': 100, 'x2': 200, 'y2': 100},
        {'name': 'Mill Rd', 'x1': 200, 'y1': 100, 'x2': 200, 'y2': 300},
        {'name': null, 'x1': 500, 'y1': 0, 'x2': 500, 'y2': 50}
    ]);
    assert.equal(index.cellSize, 100);
    assert.deepEqual([...index.cells.keys()], ['0,1', '1,1', '2,1', '2,2', '2,3', '5,0']);
    assert.deepEqual(index.cells.get('2,1'), [index.segments[0], index.segments[1]]);
    assert.deepEqual(index.cells.get('5,0'), [index.segments[2]]);

    // The streams' - and a type the features have none of
    assert.deepEqual(lineIndex(features, 'stream', 1000).segments, [{'name': 'Mill Creek', 'x1': 100, 'y1': 0, 'x2': 100, 'y2': 400}]);
    assert.deepEqual(lineIndex(features, 'rock', 100), {'segments': [], 'cells': new Map(), 'cellSize': 100});
});


test('segmentNearest', () => {
    // The nearest point is along the segment, or one of its ends
    const segment = {'x1': 0, 'y1': 0, 'x2': 100, 'y2': 0};
    assert.deepEqual(segmentNearest(segment, 30, 40), [40, 30, 0]);
    assert.deepEqual(segmentNearest(segment, -30, 40), [50, 0, 0]);
    assert.deepEqual(segmentNearest(segment, 130, -40), [50, 100, 0]);

    // A segment without length
    assert.deepEqual(segmentNearest({'x1': 10, 'y1': 10, 'x2': 10, 'y2': 10}, 13, 14), [5, 10, 10]);
});


test('nearestLine', () => {
    const index = lineIndex(features, 'road', 100);

    // The nearest road of all of them - the road without a name's name is null
    assert.deepEqual(nearestLine(index, 150, 130), {'name': 'Mill Rd', 'distance': 30, 'x': 150, 'y': 100});
    assert.deepEqual(nearestLine(index, 460, 80), {'name': null, 'distance': 50, 'x': 500, 'y': 50});

    // The nearest road within a distance
    assert.deepEqual(nearestLine(index, 150, 130, 30), {'name': 'Mill Rd', 'distance': 30, 'x': 150, 'y': 100});
    assert.equal(nearestLine(index, 150, 130, 29), null);
    assert.deepEqual(nearestLine(index, 190, 110, 20), {'name': 'Mill Rd', 'distance': 10, 'x': 190, 'y': 100});
    assert.deepEqual(nearestLine(index, 210, 250, 20), {'name': 'Mill Rd', 'distance': 10, 'x': 200, 'y': 250});
    assert.equal(nearestLine(index, 800, 800, 50), null);

    // There are no lines
    assert.equal(nearestLine(lineIndex([], 'road', 100), 0, 0), null);
});


test('nearestText', () => {
    assert.equal(
        nearestText(features, 'feet', 150, 130),
        ', nearest road "Mill Rd" 30 feet away, nearest stream "Mill Creek" 50 feet away'
    );
    assert.equal(nearestText(features.slice(1, 2), 'meters', 460, 80.4), ', nearest road 50 meters away');
    assert.equal(nearestText(features.slice(3), 'feet', 0, 0), '');
});
