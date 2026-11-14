import {
    createDesign, crossSection, featurePolygons, featureStreams, groundElevation, groundGradient, pointInPolygons, sectionCut, sectionFill,
    sectionSlopeWidth, sectionWall, sectionWallLeft, sectionWallRight, segmentIntersection
} from '../lib/design.js';
import {designArgs, expected, hillPlan, planePlan} from './roadFixtures.js';
import assert from 'node:assert/strict';
import {planTopo} from '../../viewer/lib/model.js';
import test from 'node:test';


// Get the Python planning tools' design as a design object
function pythonDesign(design) {
    return {
        'feet': design.feet,
        'grade': design.grade,
        'switchbackGrade': design.switchback_grade,
        'minRadius': design.min_radius,
        'rockCutSlope': design.rock_cut_slope,
        'width': design.width,
        'halfWidth': design.half_width,
        'surface': design.surface,
        'cutSlope': design.cut_slope,
        'fillSlope': design.fill_slope,

        // The planning tools' stations are at least 5 feet (1.5 meters) apart - the Python tools' had no least interval
        'stationInterval': design.feet ? 5 : 1.5,
        'costCut': design.cost_cut,
        'costRock': design.cost_rock,
        'costFill': design.cost_fill,
        'costBorrow': design.cost_borrow,
        'costWaste': design.cost_waste,
        'costArea': design.cost_area,
        'costWall': design.cost_wall,
        'costLength': design.cost_length,
        'costCulvert': design.cost_culvert,

        // An existing road's upgrade - the Python tools' route search didn't follow existing roads
        'costExisting': design.width * (design.feet ? 13 * 0.3048 * 0.3048 : 13),
        'shrink': design.shrink,
        'turnoutSpacing': design.turnout_spacing,
        'bridgeFill': design.bridge_fill,
        'tieTolerance': design.tie_tolerance
    };
}


test('createDesign', () => {
    // A feet plan's defaults - the design grade is 1% less than the maximum grade, and the unit costs are per foot
    const design = createDesign(planePlan(), designArgs());
    assert.deepEqual(design, pythonDesign(expected['design-feet']));
    assert.deepEqual(
        [design.feet, design.grade, design.switchbackGrade, design.minRadius, design.width, design.turnoutSpacing, design.tieTolerance],
        [true, 0.11, 0.08, 50, 14, 400, 1]
    );
    assert.equal(design.costCut, 20 * (0.3048 * 0.3048 * 0.3048));
    assert.equal(design.costArea, 2.75 * (0.3048 * 0.3048));

    // A meters plan with design criteria and cost rates
    const meters = createDesign(hillPlan(), designArgs());
    assert.deepEqual(meters, pythonDesign(expected['design-meters']));
    assert.deepEqual(
        [meters.feet, meters.grade, meters.minRadius, meters.rockCutSlope, meters.width, meters.turnoutSpacing, meters.tieTolerance],
        [false, 0.1 - 0.01, 12, 0.25, 4.3, 120, 0.3]
    );
    assert.equal(meters.costLength, 4.3 * (25 + 2 + 0.75) + 45);
    assert.equal(meters.costCulvert, 6000 + 1000 * 0.45 * 4.3 * 3);

    // The arguments - a wide road has no turnouts, and the switchback grade is at most the design grade
    const args = designArgs({
        'grade': 9, 'width': 16, 'surface': 'asphalt', 'cutSlope': 0.75, 'fillSlope': 2, 'switchbackGrade': 12, 'turnouts': 0,
        'bridgeFill': 6
    });
    const custom = createDesign(planePlan(), args);
    assert.deepEqual(custom, pythonDesign(expected['design-custom']));
    assert.deepEqual(
        [custom.grade, custom.switchbackGrade, custom.width, custom.surface, custom.cutSlope, custom.fillSlope, custom.turnoutSpacing,
            custom.bridgeFill],
        [0.09, 0.09, 16, 'asphalt', 0.75, 2, 0, 6]
    );
    assert.equal(createDesign(planePlan(), designArgs({'width': 16})).turnoutSpacing, 0);
    assert.equal(createDesign(planePlan({'units': 'meters'}), designArgs({'width': 5})).turnoutSpacing, 0);
    assert.equal(createDesign(planePlan(), designArgs({'turnouts': 250})).turnoutSpacing, 250);
});


test('groundElevation and groundGradient', () => {
    // A plane rising 10% to the north - outside the grid, the ground is the grid's nearest point's
    const plane = planTopo(planePlan());
    assert.equal(groundElevation(plane, 50, 50), 105);
    assert.equal(groundElevation(plane, -10, 120), 110);
    assert.equal(groundElevation(plane, 150, -5), 100);
    const [gradientX, gradientY] = groundGradient(plane, 50, 50);
    assert.equal(gradientX, 0);
    assert.ok(Math.abs(gradientY - 0.1) < 1e-12);

    // A hill - within, at the edges of, and outside the grid
    const hill = planTopo(hillPlan());
    assert.deepEqual(
        expected.topo.map(({x, y}) => ({x, y, 'z': groundElevation(hill, x, y), 'gradient': groundGradient(hill, x, y)})),
        expected.topo
    );
    assert.deepEqual(groundGradient(hill, 250, -30), [0, 0]);
});


test('featurePolygons and pointInPolygons', () => {
    const topo = planTopo(hillPlan());
    const rocks = featurePolygons(topo, 'rock');
    const exclusions = featurePolygons(topo, 'exclusion');
    assert.deepEqual([rocks.length, exclusions.length, featurePolygons(topo, 'wetland').length], [1, 1, 0]);
    assert.deepEqual(
        [[100, 100], [94, 100], [100, 111], [80, 45]].map(([x, y]) => [pointInPolygons(x, y, rocks), pointInPolygons(x, y, exclusions)]),
        [[true, false], [false, false], [false, false], [false, true]]
    );
    assert.equal(pointInPolygons(100, 100, []), false);

    // Any of the polygons
    const square = (x) => ({'type': 'rock', 'points': [{x, 'y': 0}, {'x': x + 10, 'y': 0}, {'x': x + 10, 'y': 10}, {x, 'y': 10}]});
    const squares = featurePolygons({'features': [square(0), square(20)]}, 'rock');
    assert.deepEqual([5, 15, 25].map((x) => pointInPolygons(x, 5, squares)), [true, false, true]);
});


test('featureStreams', () => {
    const [stream1, stream2] = featureStreams(planTopo(hillPlan()));
    assert.deepEqual(stream1, {'name': 'West Creek', 'points': [{'x': 60, 'y': 0}, {'x': 61, 'y': 100}, {'x': 60, 'y': 200}]});
    assert.deepEqual(stream2, {'name': 'stream', 'points': [{'x': 0, 'y': 150}, {'x': 200, 'y': 151}]});
    assert.deepEqual(featureStreams(planTopo(planePlan())), []);
});


test('segmentIntersection', () => {
    // The fraction along the first segment
    assert.equal(segmentIntersection(0, 0, 10, 0, 5, -5, 5, 0.5), 0.5);
    assert.equal(segmentIntersection(0, 0, 10, 0, 2.5, -5, 2.5, 5), 0.25);
    assert.equal(segmentIntersection(0, 0, 10, 0, 0, -5, 0, 5), 0);
    assert.equal(segmentIntersection(0, 0, 10, 0, 10, 0, 10, 5), 1);

    // Beyond either segment's ends, and parallel segments
    assert.equal(segmentIntersection(0, 1, 10, 1, 5, -5, 5, 0.5), null);
    assert.equal(segmentIntersection(0, 0, 10, 0, 11, -5, 11, 5), null);
    assert.equal(segmentIntersection(0, 0, 10, 0, -1, -5, -1, 5), null);
    assert.equal(segmentIntersection(0, 0, 10, 0, 5, 1, 5, 5), null);
    assert.equal(segmentIntersection(0, 0, 10, 0, 0, 1, 10, 1), null);
    assert.equal(segmentIntersection(0, 0, 10, 0, 5, 0, 15, 0), null);
});


test('crossSection', () => {
    const section = (...args) => Array.from(crossSection(...args, new Float64Array(6)));
    assert.deepEqual(expected.sections.map(({args}) => ({args, 'out': section(...args)})), expected.sections);

    // A plane cross slope of 0.1 at grade - half the road is cut and half is fill, each with its slope
    let values = section(0, 0.1, 5, 1, 1.5);
    assert.ok(Math.abs(values[sectionCut] - (1.25 + 0.25 / 1.8)) < 1e-12);
    assert.ok(Math.abs(values[sectionFill] - (1.25 + 0.25 / (2 * (2 / 3 - 0.1)))) < 1e-12);
    assert.ok(Math.abs(values[sectionSlopeWidth] - (0.5 / 0.9 + 0.5 / (2 / 3 - 0.1))) < 1e-12);
    assert.deepEqual([values[sectionWall], values[sectionWallLeft], values[sectionWallRight]], [0, 0, 0]);

    // A fill side slope steeper than the fill slope can't daylight - it's a wall (and so is a cut side slope steeper
    // than the cut slope)
    values = section(0, 0.8, 5, 1, 1.5);
    assert.deepEqual([values[sectionWall], values[sectionWallLeft], values[sectionWallRight]], [4, 0, 4]);
    values = section(1.5, 1.2, 6, 1, 1.5);
    assert.deepEqual([values[sectionWallLeft], values[sectionWallRight]], [8.7, 5.699999999999999]);

    // A level cross section at grade has no earthwork
    assert.deepEqual(section(0, 0, 5, 1, 1.5), [0, 0, 0, 0, 0, 0]);
});
