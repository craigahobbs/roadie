import {analyzeOption, planTopo, validatePlan} from '../lib/model.js';
import {
    cellContours, colors, contourInterval, contourLevel, labelX, minRoadPx, niceStep, quadBrightness, rgb, roadColor, samplePoints, svgOpen,
    svgPoints, svgPolygon, svgPolyline, svgStyle, svgText, terrainFill
} from '../lib/draw.js';
import {planComplex, planSimple} from './planFixtures.js';
import assert from 'node:assert/strict';
import test from 'node:test';


// Compute a cell's contour segments - returns the segment count and the segment coordinates
function contours(zNW, zNE, zSE, zSW, level) {
    const out = [];
    const count = cellContours(zNW, zNE, zSE, zSW, level, out);
    return [count, out];
}


test('colors', () => {
    assert.deepEqual(Object.keys(colors), ['asphalt', 'bridge', 'concrete', 'cut', 'existing', 'fill', 'gravel', 'native', 'wall']);
    assert.deepEqual(colors.asphalt, [70, 72, 76]);
    assert.equal(roadColor, '#d6246e');
    assert.equal(minRoadPx, 4);
});


test('rgb', () => {
    assert.equal(rgb([70, 72, 76]), 'rgb(70,72,76)');
    assert.equal(rgb([70, 72, 76], null), 'rgb(70,72,76)');

    // The brightness factor - the components are rounded and limited to 0 to 255
    assert.equal(rgb([70, 72, 76], 0.5), 'rgb(35,36,38)');
    assert.equal(rgb([70, 72, 76], 2), 'rgb(140,144,152)');
    assert.equal(rgb([70, 72, 76], 4), 'rgb(255,255,255)');
    assert.equal(rgb(colors.cut, 0), 'rgb(0,0,0)');
    assert.equal(rgb([-5, 0.5, 255.4]), 'rgb(0,1,255)');
    assert.equal(rgb([1.5, 2.49, 2.5]), 'rgb(2,2,3)');
});


test('terrainFill', () => {
    // Level ground's brightness is 0.5 + 0.6 * 0.7071 - the low, middle, and high colors, and the colors between
    assert.equal(terrainFill(0, 0, 0), 'rgb(89,137,78)');
    assert.equal(terrainFill(0.25, 0, 0), 'rgb(126,151,91)');
    assert.equal(terrainFill(0.5, 0, 0), 'rgb(163,165,104)');
    assert.equal(terrainFill(0.75, 0, 0), 'rgb(164,148,100)');
    assert.equal(terrainFill(1, 0, 0), 'rgb(165,131,96)');

    // The elevation fraction is limited to 0 to 1
    assert.equal(terrainFill(-1, 0, 0), 'rgb(89,137,78)');
    assert.equal(terrainFill(2, 0, 0), 'rgb(165,131,96)');

    // Ground facing the light is brighter, ground facing away is at half brightness, and nearly vertical ground is lit from
    // either side
    assert.equal(terrainFill(0.5, -1, 1), 'rgb(192,194,122)');
    assert.equal(terrainFill(0.5, 2, 0), 'rgb(88,89,56)');
    assert.equal(terrainFill(0.5, 20, 0), 'rgb(137,139,87)');
    assert.equal(terrainFill(0.5, -20, 0), 'rgb(144,146,92)');
});


// The terrain color strings are cached, by red and green, then blue
test('terrainFill, cached colors', () => {
    for (let count = 0; count < 2; count++) {
        assert.equal(terrainFill(0, -0.85, 0), 'rgb(98,151,85)');
        assert.equal(terrainFill(0, -0.8, 0), 'rgb(98,151,86)');
    }
});


test('quadBrightness', () => {
    // A level quadrilateral, in either point order
    assert.equal(quadBrightness([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]), 0.5 + 0.6 * 0.7071);
    assert.equal(quadBrightness([0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]), 0.5 + 0.6 * 0.7071);

    // A degenerate quadrilateral
    assert.equal(quadBrightness([1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]), 1);

    // A vertical quadrilateral facing south is lit as if it faced north
    assert.equal(quadBrightness([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]), 0.8);

    // A slope facing east, away from the light, and a slope facing west, toward the light, in either point order
    assert.equal(quadBrightness([0, 0, 0], [1, 0, -2], [1, 1, -2], [0, 1, 0]), 0.5);
    assert.equal(quadBrightness([0, 0, 0], [1, 0, 2], [1, 1, 2], [0, 1, 0]).toFixed(6), (0.5 + 0.6 * 1.7071 / Math.sqrt(5)).toFixed(6));
    assert.equal(quadBrightness([0, 1, 0], [1, 1, 2], [1, 0, 2], [0, 0, 0]).toFixed(6), (0.5 + 0.6 * 1.7071 / Math.sqrt(5)).toFixed(6));
});


test('niceStep', () => {
    assert.equal(niceStep(25, 25), 1);
    assert.equal(niceStep(40, 25), 2);
    assert.equal(niceStep(64, 25), 5);
    assert.equal(niceStep(100, 25), 5);
    assert.equal(niceStep(4, 25), 0.2);
    assert.equal(niceStep(0.03, 1), 0.05);
    assert.equal(niceStep(86.2, 40), 5);

    // More than five times a power of ten is the next power of ten
    assert.equal(niceStep(70, 10), 10);
    assert.equal(niceStep(3000, 4), 1000);

    // An empty range
    assert.equal(niceStep(0, 25), 5 * 10 ** -11);
});


test('contourInterval', () => {
    // The plan's contour interval, or about 25 contours over the elevation range
    const complex = planComplex();
    assert.equal(contourInterval(complex, planTopo(complex)), 4);
    delete complex.topography.contourInterval;
    assert.equal(contourInterval(complex, planTopo(complex)), 5);
    const simple = planSimple();
    assert.equal(contourInterval(simple, planTopo(simple)), 0.2);
});


test('contourLevel', () => {
    // A level is a whole number of contour intervals
    assert.equal(contourLevel(7, 5), 35);
    assert.equal(contourLevel(3, 0.25), 0.75);
    assert.equal(contourLevel(-2, 20), -40);

    // A level is the same number as an elevation of its value - the product of the level and the interval may not be
    assert.equal(3 * 0.2, 0.6000000000000001);
    assert.equal(contourLevel(3, 0.2), 0.6);
    assert.equal(-3 * 0.1, -0.30000000000000004);
    assert.equal(contourLevel(-3, 0.1), -0.3);
    assert.equal(contourLevel(1234567, 0.001), 1234.567);

    // So a contour along grid points at its level is drawn - it's along the north side of the cell below them
    assert.deepEqual(contours(0.6, 0.6, 0.4, 0.4, contourLevel(3, 0.2)), [1, [1, -0, 0, 0]]);
    assert.deepEqual(contours(0.6, 0.6, 0.4, 0.4, 3 * 0.2), [0, []]);
});


test('cellContours', () => {
    // A contour from the east side to the west side
    assert.deepEqual(contours(10, 10, 0, 0, 5), [1, [1, 0.5, 0, 0.5]]);
    assert.deepEqual(contours(4, 8, 2, 0, 3), [1, [1, 0.8333333333333334, 0, 0.25]]);

    // A contour around the northwest corner
    assert.deepEqual(contours(0, 10, 10, 10, 5), [1, [0.5, 0, 0, 0.5]]);

    // A saddle has two contours
    assert.deepEqual(contours(10, 0, 10, 0, 5), [2, [0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5]]);

    // A cell above or below the level has none
    assert.deepEqual(contours(10, 10, 10, 10, 5), [0, []]);
    assert.deepEqual(contours(0, 0, 0, 0, 5), [0, []]);

    // A corner at the level is above it - the contour is along the cell's south side
    assert.deepEqual(contours(0, 0, 5, 5, 5), [1, [1, 1, 0, 1]]);
});


test('svgPoints', () => {
    assert.equal(svgPoints([]), '');
    assert.equal(svgPoints([1, 2]), '1,2');
    assert.equal(svgPoints([0, 1.25, 10.04, -3]), '0,1.3 10,-3');
});


test('svgPolygon', () => {
    assert.equal(svgPolygon([0, 0, 10, 0, 10, 10.5], 'rgb(1,2,3)', 'none', 0),
        '<polygon points="0,0 10,0 10,10.5" fill="rgb(1,2,3)" stroke="none" stroke-width="0"/>');
    assert.equal(
        svgPolygon([0, 0, 1, 1, 2, 0], '#fff', '#000', 1.5, 'Cut & "fill" <1>', ' class="road"'),
        '<polygon points="0,0 1,1 2,0" fill="#fff" stroke="#000" stroke-width="1.5" class="road">' +
        '<title>Cut &amp; &quot;fill&quot; &lt;1&gt;</title></polygon>'
    );
    assert.equal(svgPolygon([0, 0], 'red', 'blue', 1, null, ' opacity="0.5"'),
        '<polygon points="0,0" fill="red" stroke="blue" stroke-width="1" opacity="0.5"/>');
});


test('svgPolyline', () => {
    assert.equal(svgPolyline([0, 0, 5.55, 5], '#d6246e', 2),
        '<polyline points="0,0 5.5,5" fill="none" stroke="#d6246e" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
    assert.equal(
        svgPolyline([0, 0, 5, 5], 'black', 1, '4 2'),
        '<polyline points="0,0 5,5" fill="none" stroke="black" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" ' +
        'stroke-dasharray="4 2"/>'
    );
});


test('svgText', () => {
    assert.equal(
        svgText('A & B', 10.26, 20, 12, 'middle', '#333', false),
        '<text x="10.3" y="20" font-size="12" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle" fill="#333" ' +
        'stroke="white" stroke-width="3" paint-order="stroke">A &amp; B</text>'
    );
    assert.equal(
        svgText('Start', 0, -1.5, 14, 'start', 'black', true),
        '<text x="0" y="-1.5" font-size="14" font-family="sans-serif" text-anchor="start" dominant-baseline="middle" fill="black" ' +
        'stroke="white" stroke-width="3" paint-order="stroke" font-weight="bold">Start</text>'
    );
});


// A five-character label at font size 10 is about 32 wide - its center is kept 20 from the drawing's sides
test('labelX', () => {
    assert.equal(labelX('Label', 10, 2, 200), 20);
    assert.equal(labelX('Label', 10, 100, 200), 100);
    assert.equal(labelX('Label', 10, 199, 200), 180);
    assert.equal(labelX('', 10, 0, 200), 4);
});


test('svgOpen', () => {
    assert.equal(
        svgOpen(640, 480, 'Plan "A" view'),
        '<svg width="640" height="480" viewBox="0 0 640 480" role="img" aria-label="Plan &quot;A&quot; view" ' +
        'style="background: #f4f1ea; border: 1px solid #ccc; display: block; max-width: 100%; height: auto; break-inside: avoid; ' +
        'margin: 0.75em 0 1.5em 0;">'
    );
    assert.equal(svgOpen(640, 480, 'Plan'),
        `<svg width="640" height="480" viewBox="0 0 640 480" role="img" aria-label="Plan" style="${svgStyle}">`);
    assert.equal(svgOpen(10, 20, 'x', 'display: none;', ' data-view="1"'),
        '<svg width="10" height="20" viewBox="0 0 10 20" role="img" aria-label="x" style="display: none;" data-view="1">');
});


test('samplePoints', () => {
    // A road heading east - its left side is to the north
    assert.deepEqual(
        samplePoints(
            {'x': 20, 'y': 30, 'z': 100, 'dx': 1, 'dy': 0, 'left': {'offset': 2, 'drop': 2}, 'right': {'offset': 3, 'drop': -2}},
            5
        ),
        [[20, 37, 102], [20, 35, 100], [20, 25, 100], [20, 22, 98]]
    );

    // A road heading northeast, with no left slope
    assert.deepEqual(
        samplePoints(
            {'x': 20, 'y': 30, 'z': 100, 'dx': 0.6, 'dy': 0.8, 'left': {'offset': 0, 'drop': 0}, 'right': {'offset': 5, 'drop': -4}},
            5
        ),
        [[16, 33, 100], [16, 33, 100], [24, 27, 100], [28, 24, 96]]
    );

    // An analysis sample - a cut slope up to the left and a fill slope down to the right
    const {plan} = validatePlan(planSimple());
    const [, , , , , , sample] = analyzeOption(plan, 0, planTopo(plan)).samples;
    assert.deepEqual(samplePoints(sample, 5), [
        [20, 25.555555555555557, 102.55555555555556],
        [20, 25, 102],
        [20, 15, 102],
        [20, 14.117647058823529, 101.41176470588235]
    ]);
});
