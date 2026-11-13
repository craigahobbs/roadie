import {hitTitle, opCell, opCircle, opPolygon, opPolyline, opRect, opTerrainCell, opText, opsToSvg, paintOps} from '../lib/canvas.js';
import assert from 'node:assert/strict';
import {fakeContext} from './appHelpers.js';
import test from 'node:test';


// Paint drawing operations on a fake canvas 2D context - returns its calls
function paintCalls(ops) {
    const calls = [];
    paintOps(fakeContext(calls), ops);
    return calls;
}


// The calls that reset the context's state before any drawing
const resetCalls = [['miterLimit', 4], ['setLineDash', []], ['globalAlpha', 1]];


// The contour color
const contourColor = 'rgba(70,50,30,0.45)';


test('the drawing operations', () => {
    const coords = [0, 0, 10, 0, 10, 10, 0, 10];
    assert.equal(opCell, 0);
    assert.deepEqual(
        opTerrainCell(coords, 0, '#abc', null, [1, 2, 3, 4]),
        {'t': 0, 'c': coords, 'o': 0, 'f': '#abc', 'm': null, 'i': [1, 2, 3, 4]}
    );
    assert.deepEqual(
        opPolygon(coords, 'red', 'black', 2),
        {'t': 1, 'c': coords, 'f': 'red', 's': 'black', 'w': 2, 'title': null, 'd': null}
    );
    assert.deepEqual(
        opPolygon(coords, 'red', 'black', 2, 'The title', '4 2'),
        {'t': 1, 'c': coords, 'f': 'red', 's': 'black', 'w': 2, 'title': 'The title', 'd': '4 2'}
    );
    assert.deepEqual(opPolyline(coords, 'blue', 3), {'t': 2, 'c': coords, 's': 'blue', 'w': 3, 'd': null});
    assert.deepEqual(opPolyline(coords, 'blue', 3, '6 3'), {'t': 2, 'c': coords, 's': 'blue', 'w': 3, 'd': '6 3'});
    assert.deepEqual(
        opText('Label', 5, 6, 12, 'middle', '#222', true),
        {'t': 3, 'text': 'Label', 'x': 5, 'y': 6, 'size': 12, 'anchor': 'middle', 'f': '#222', 'bold': true}
    );
    assert.deepEqual(
        opCircle(5, 6, 4, 'white', 'black'),
        {'t': 4, 'x': 5, 'y': 6, 'r': 4, 'f': 'white', 's': 'black', 'w': null, 'o': null}
    );
    assert.deepEqual(
        opCircle(5, 6, 4, 'white', 'black', 2, 0.5),
        {'t': 4, 'x': 5, 'y': 6, 'r': 4, 'f': 'white', 's': 'black', 'w': 2, 'o': 0.5}
    );
    assert.deepEqual(
        opRect(1, 2, 30, 40, 4, 'white', 0.75),
        {'t': 5, 'x': 1, 'y': 2, 'width': 30, 'height': 40, 'rx': 4, 'f': 'white', 'o': 0.75}
    );
});


test('paintOps resets the context state', () => {
    assert.deepEqual(paintCalls([]), resetCalls);
});


test('paintOps paints terrain cells', () => {
    // Two cells of a shared coordinate array - the first has minor and index contour segments
    const coords = [0, 0, 10, 0, 10, 10, 0, 10, 10, 0, 20, 0, 20, 10, 10, 10];
    const calls = paintCalls([
        opTerrainCell(coords, 0, '#a0b0c0', [1, 2, 3, 4, 5, 6, 7, 8], [2, 9, 8, 9]),
        opTerrainCell(coords, 8, '#a0b0c0', null, null)
    ]);
    assert.deepEqual(calls, [
        ...resetCalls,

        // The first cell - filled and outlined with its color
        ['beginPath'], ['moveTo', 0, 0], ['lineTo', 10, 0], ['lineTo', 10, 10], ['lineTo', 0, 10], ['closePath'],
        ['fillStyle', '#a0b0c0'], ['fill'],
        ['strokeStyle', '#a0b0c0'], ['lineWidth', 0.6], ['lineCap', 'butt'], ['lineJoin', 'miter'], ['stroke'],

        // Its minor contour segments, then its index contour segments - only the changed stroke state is set
        ['beginPath'], ['moveTo', 1, 2], ['lineTo', 3, 4], ['moveTo', 5, 6], ['lineTo', 7, 8],
        ['strokeStyle', contourColor], ['lineWidth', 0.5], ['lineCap', 'round'], ['stroke'],
        ['beginPath'], ['moveTo', 2, 9], ['lineTo', 8, 9],
        ['lineWidth', 1.2], ['stroke'],

        // The second cell, at its offset - its fill is the first's, so it isn't set again
        ['beginPath'], ['moveTo', 10, 0], ['lineTo', 20, 0], ['lineTo', 20, 10], ['lineTo', 10, 10], ['closePath'],
        ['fill'],
        ['strokeStyle', '#a0b0c0'], ['lineWidth', 0.6], ['lineCap', 'butt'], ['stroke']
    ]);
});


test('paintOps paints polygons and polylines', () => {
    const triangle = [0, 0, 10, 0, 5, 8];
    const calls = paintCalls([
        opPolygon(triangle, 'red', 'black', 2, 'The title'),
        opPolygon(triangle, 'none', 'black', 2, null, '4 2.5'),
        opPolyline([0, 0, 10, 10, 20, 0], 'blue', 3),
        opPolyline([0, 5, 20, 5], 'blue', 3, '6 3')
    ]);
    assert.deepEqual(calls, [
        ...resetCalls,

        // A filled polygon
        ['beginPath'], ['moveTo', 0, 0], ['lineTo', 10, 0], ['lineTo', 5, 8], ['closePath'],
        ['fillStyle', 'red'], ['fill'],
        ['strokeStyle', 'black'], ['lineWidth', 2], ['lineCap', 'butt'], ['lineJoin', 'miter'], ['stroke'],

        // An unfilled, dashed polygon - the dash is reset
        ['beginPath'], ['moveTo', 0, 0], ['lineTo', 10, 0], ['lineTo', 5, 8], ['closePath'],
        ['setLineDash', [4, 2.5]], ['stroke'], ['setLineDash', []],

        // A polyline - open, with round caps and joins
        ['beginPath'], ['moveTo', 0, 0], ['lineTo', 10, 10], ['lineTo', 20, 0],
        ['strokeStyle', 'blue'], ['lineWidth', 3], ['lineCap', 'round'], ['lineJoin', 'round'], ['stroke'],

        // A dashed polyline
        ['beginPath'], ['moveTo', 0, 5], ['lineTo', 20, 5],
        ['setLineDash', [6, 3]], ['stroke'], ['setLineDash', []]
    ]);
});


test('paintOps paints text', () => {
    const calls = paintCalls([
        opText('Start', 5, 6, 12, 'start', '#222', false),
        opText('Middle', 50, 6, 14, 'middle', '#222', true),
        opText('End', 95, 6, 12, 'end', 'blue', false)
    ]);
    assert.deepEqual(calls, [
        ...resetCalls,

        // The text is outlined in white, then filled
        ['font', '12px sans-serif'], ['textAlign', 'left'], ['textBaseline', 'middle'],
        ['strokeStyle', 'white'], ['lineWidth', 3], ['lineCap', 'butt'], ['lineJoin', 'miter'], ['strokeText', 'Start', 5, 6],
        ['fillStyle', '#222'], ['fillText', 'Start', 5, 6],

        // Bold, centered text
        ['font', 'bold 14px sans-serif'], ['textAlign', 'center'], ['textBaseline', 'middle'],
        ['strokeText', 'Middle', 50, 6], ['fillText', 'Middle', 50, 6],

        // Right-aligned text of another color
        ['font', '12px sans-serif'], ['textAlign', 'right'], ['textBaseline', 'middle'],
        ['strokeText', 'End', 95, 6], ['fillStyle', 'blue'], ['fillText', 'End', 95, 6]
    ]);
});


test('paintOps paints circles and rectangles', () => {
    const calls = paintCalls([
        opCircle(5, 6, 4, 'white', 'black'),
        opCircle(15, 16, 8, 'red', 'black', 2, 0.5),
        opRect(1, 2, 30, 40, 4, 'white', 0.75)
    ]);
    assert.deepEqual(calls, [
        ...resetCalls,

        // A circle - opaque, with a one pixel outline
        ['beginPath'], ['arc', 5, 6, 4, 0, 2 * Math.PI], ['globalAlpha', 1], ['fillStyle', 'white'], ['fill'], ['globalAlpha', 1],
        ['strokeStyle', 'black'], ['lineWidth', 1], ['lineCap', 'butt'], ['lineJoin', 'miter'], ['stroke'],

        // A circle with a translucent fill and an outline width
        ['beginPath'], ['arc', 15, 16, 8, 0, 2 * Math.PI], ['globalAlpha', 0.5], ['fillStyle', 'red'], ['fill'], ['globalAlpha', 1],
        ['lineWidth', 2], ['stroke'],

        // A translucent rounded rectangle - filled only
        ['beginPath'], ['roundRect', 1, 2, 30, 40, 4], ['globalAlpha', 0.75], ['fillStyle', 'white'], ['fill'], ['globalAlpha', 1]
    ]);
});


test('hitTitle', () => {
    // A terrain cell (at an offset of its coordinate array), under a titled road polygon, under an unfilled outline, a
    // line, a label, a marker, and a panel
    const cellCoords = [100, 100, 110, 100, 110, 110, 100, 110, 0, 0, 40, 0, 40, 40, 0, 40];
    const ops = [
        opTerrainCell(cellCoords, 8, '#abc', null, null),
        opPolygon([10, 10, 30, 10, 30, 30, 10, 30], 'gray', 'black', 1, 'Station 1+00'),
        opPolygon([15, 15, 25, 15, 25, 25, 15, 25], 'gray', 'black', 1),
        opPolygon([0, 0, 60, 0, 60, 60, 0, 60], 'none', 'black', 1, 'The outline'),
        opPolyline([0, 20, 60, 20], 'blue', 3),
        opText('Label', 20, 20, 12, 'middle', '#222', false),
        opCircle(20, 20, 30, 'white', 'black'),
        opRect(0, 0, 60, 60, 4, 'white', 0.75)
    ];

    // The titled polygon - only filled shapes are hit
    assert.equal(hitTitle(ops, 12, 12), 'Station 1+00');
    assert.equal(hitTitle(ops, 28, 20), 'Station 1+00');

    // The untitled polygon above it
    assert.equal(hitTitle(ops, 20, 20), null);

    // The terrain cell has no title - neither does the cell outside its 8 coordinates of the array
    assert.equal(hitTitle(ops, 5, 5), null);
    assert.equal(hitTitle(ops, 105, 105), null);

    // Only the unfilled outline, and nothing at all
    assert.equal(hitTitle(ops, 50, 50), null);
    assert.equal(hitTitle(ops, 200, 200), null);
    assert.equal(hitTitle([], 5, 5), null);

    // The topmost filled shape wins - a terrain cell hides a titled polygon beneath it
    assert.equal(hitTitle([ops[1], ops[0]], 12, 12), null);
    assert.equal(hitTitle([ops[1], opTerrainCell(cellCoords, 0, '#abc', null, null)], 12, 12), 'Station 1+00');

    // A concave polygon - the notch is outside
    const concave = [opPolygon([0, 0, 40, 0, 40, 40, 20, 10, 0, 40], 'gray', 'black', 1, 'Concave')];
    assert.equal(hitTitle(concave, 5, 20), 'Concave');
    assert.equal(hitTitle(concave, 35, 20), 'Concave');
    assert.equal(hitTitle(concave, 20, 30), null);
});


test('opsToSvg', () => {
    const coords = [100, 100, 110, 100, 110, 110, 100, 110, 0.04, 0.05, 40.25, 0, 40, 39.96, 0, 40];

    // A terrain cell - without and with its minor and index contours
    assert.equal(
        opsToSvg([opTerrainCell(coords, 8, '#a0b0c0', null, null)]),
        '<polygon points="0,0.1 40.3,0 40,40 0,40" fill="#a0b0c0" stroke="#a0b0c0" stroke-width="0.6"/>'
    );
    assert.equal(
        opsToSvg([opTerrainCell(coords, 0, '#a0b0c0', [1, 2, 3, 4, 5, 6, 7, 8.5], null)]),
        '<polygon points="100,100 110,100 110,110 100,110" fill="#a0b0c0" stroke="#a0b0c0" stroke-width="0.6"/>' +
            `<path d="M1 2L3 4M5 6L7 8.5" fill="none" stroke="${contourColor}" stroke-width="0.5" stroke-linecap="round"/>`
    );
    assert.equal(
        opsToSvg([opTerrainCell(coords, 0, '#a0b0c0', [1, 2, 3, 4], [2, 9, 8, 9])]),
        '<polygon points="100,100 110,100 110,110 100,110" fill="#a0b0c0" stroke="#a0b0c0" stroke-width="0.6"/>' +
            `<path d="M1 2L3 4" fill="none" stroke="${contourColor}" stroke-width="0.5" stroke-linecap="round"/>` +
            `<path d="M2 9L8 9" fill="none" stroke="${contourColor}" stroke-width="1.2" stroke-linecap="round"/>`
    );

    // Polygons - plain, titled, and dashed
    const triangle = [0, 0, 10, 0, 5, 8.25];
    assert.equal(
        opsToSvg([opPolygon(triangle, 'red', 'black', 2)]),
        '<polygon points="0,0 10,0 5,8.3" fill="red" stroke="black" stroke-width="2"/>'
    );
    assert.equal(
        opsToSvg([opPolygon(triangle, 'none', 'black', 2, 'Cut & fill', '4 2')]),
        '<polygon points="0,0 10,0 5,8.3" fill="none" stroke="black" stroke-width="2" stroke-dasharray="4 2">' +
            '<title>Cut &amp; fill</title></polygon>'
    );

    // Polylines - plain and dashed
    assert.equal(
        opsToSvg([opPolyline([0, 0, 10, 10], 'blue', 3)]),
        '<polyline points="0,0 10,10" fill="none" stroke="blue" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'
    );
    assert.equal(
        opsToSvg([opPolyline([0, 0, 10, 10], 'blue', 3, '6 3')]),
        '<polyline points="0,0 10,10" fill="none" stroke="blue" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" ' +
            'stroke-dasharray="6 3"/>'
    );

    // Text
    assert.equal(
        opsToSvg([opText('A < B', 5.26, 6, 12, 'middle', '#222', true)]),
        '<text x="5.3" y="6" font-size="12" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle" fill="#222" ' +
            'stroke="white" stroke-width="3" paint-order="stroke" font-weight="bold">A &lt; B</text>'
    );

    // Circles - plain, and with a fill opacity and an outline width
    assert.equal(opsToSvg([opCircle(5.26, 6, 4, 'white', 'black')]), '<circle cx="5.3" cy="6" r="4" fill="white" stroke="black"/>');
    assert.equal(
        opsToSvg([opCircle(5, 6, 4, 'white', 'black', 2, 0.5)]),
        '<circle cx="5" cy="6" r="4" fill="white" fill-opacity="0.5" stroke="black" stroke-width="2"/>'
    );

    // A rectangle
    assert.equal(
        opsToSvg([opRect(1, 2, 30, 40, 4, 'white', 0.75)]),
        '<rect x="1" y="2" width="30" height="40" rx="4" fill="white" fill-opacity="0.75"/>'
    );

    // The operations' elements are in order
    assert.equal(
        opsToSvg([opRect(1, 2, 30, 40, 4, 'white', 0.75), opCircle(5, 6, 4, 'white', 'black')]),
        '<rect x="1" y="2" width="30" height="40" rx="4" fill="white" fill-opacity="0.75"/>' +
            '<circle cx="5" cy="6" r="4" fill="white" stroke="black"/>'
    );
    assert.equal(opsToSvg([]), '');
});
