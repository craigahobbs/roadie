import {
    analyzeOption, centerlineAt, culvertDiameter, elevation, gradient, outsideBox, planCriteria, planTopo, sampleAt, unitLength,
    validatePlan
} from '../lib/model.js';
import {planComplex, planExistingRoad, planSimple} from './planFixtures.js';
import assert from 'node:assert/strict';
import {fixturePlan} from './fixture.js';
import {round} from '../lib/format.js';
import test from 'node:test';


// Validate a road plan model and analyze one of its options
function analyze(planValue, ixOption = 0) {
    const {plan} = validatePlan(planValue);
    return analyzeOption(plan, ixOption, planTopo(plan));
}


// Get a plan analysis's stream crossing warnings
function crossingWarnings(analysis) {
    return analysis.warnings.filter((warning) => warning.includes('crossing'));
}


// Get the middle cross section sample of a road running east across a plane - "slope" is the plane's rise to the north
// (the road's left) and "depth" is the ground elevation minus the grade elevation at the centerline
function planeSample({slope = 0, depth = 0, width = 10, section = {}, structures = []}) {
    const plan = planSimple();
    plan.topography.elevations = plan.topography.elevations.map((row, ixRow) => row.map(() => 100 + slope * 10 * (4 - ixRow)));
    const z = 100 + slope * 20 - depth;
    const [option] = plan.options;
    option.section = {width, ...section};
    option.alignment = [{'x': 0, 'y': 20, z}, {'x': 40, 'y': 20, z}];
    option.structures = structures;
    return analyze(plan).samples[6];
}


// Retaining walls along the whole plane road
const wallLeft = [{'type': 'retainingWall', 'station': 0, 'endStation': 40, 'side': 'left'}];
const wallRight = [{'type': 'retainingWall', 'station': 0, 'endStation': 40, 'side': 'right'}];
const wallBoth = [{'type': 'retainingWall', 'station': 0, 'endStation': 40}];


//
// Validation
//


test('validatePlan', () => {
    assert.ok('plan' in validatePlan(fixturePlan()));

    const missing = fixturePlan();
    delete missing.title;
    assert.deepEqual(validatePlan(missing), {'error': 'Required member "title" missing'});

    const badType = fixturePlan();
    badType.topography.spacing = 0;
    assert.deepEqual(validatePlan(badType),
        {'error': 'Invalid value 0 (type "number") for member "topography.spacing", expected type "float" [> 0]'});

    const unknown = fixturePlan();
    unknown.options[0].extra = 1;
    assert.deepEqual(validatePlan(unknown), {'error': 'Unknown member "options.0.extra"'});

    const badEnum = fixturePlan();
    badEnum.units = 'yards';
    assert.deepEqual(validatePlan(badEnum), {'error': 'Invalid value "yards" (type "string") for member "units", expected type "Units"'});

    const ragged = fixturePlan();
    ragged.topography.elevations[3].pop();
    assert.deepEqual(validatePlan(ragged), {'error': 'Elevation row 3 has 40 elevations, expected 41'});

    const noEnd = fixturePlan();
    delete noEnd.options[0].structures[1].endStation;
    assert.deepEqual(
        validatePlan(noEnd),
        {'error': 'Option "Direct" turnout at station 100 requires an endStation greater than its station'}
    );

    // A road has length - a repeated alignment point is fine, but not all of them
    const noLength = fixturePlan();
    noLength.options[0].alignment = [{'x': 20, 'y': 30}, {'x': 20, 'y': 30, 'z': 110}, {'x': 20, 'y': 30}];
    assert.deepEqual(
        validatePlan(noLength),
        {'error': 'Option "Direct" alignment has no length - its points are all the same point'}
    );
    noLength.options[0].alignment[2].x = 21;
    assert.ok('plan' in validatePlan(noLength));

    const shortRow = fixturePlan();
    shortRow.topography.elevations = [[1, 2]];
    assert.equal(validatePlan(shortRow).error,
        'Invalid value [[1,2]] (type "object") for member "topography.elevations", expected type "array" [len > 1]');

    const numericString = fixturePlan();
    numericString.start.x = '20';
    assert.equal(validatePlan(numericString).plan.start.x, 20);
});


test('validatePlan, the test plans', () => {
    assert.deepEqual(validatePlan(planSimple()), {'plan': planSimple()});
    assert.deepEqual(validatePlan(planComplex()), {'plan': planComplex()});
    assert.deepEqual(validatePlan(planExistingRoad()), {'plan': planExistingRoad()});
});


test('validatePlan, schema error', () => {
    const plan = planSimple();
    delete plan.title;
    assert.deepEqual(validatePlan(plan), {'error': 'Required member "title" missing'});
});


test('validatePlan, not a plan object', () => {
    assert.deepEqual(validatePlan(null), {'error': 'Invalid value null (type "object"), expected type "RoadPlan"'});
    assert.deepEqual(validatePlan([]), {'error': 'Invalid value [] (type "object"), expected type "RoadPlan"'});
    assert.deepEqual(validatePlan('plan'), {'error': 'Invalid value "plan" (type "string"), expected type "RoadPlan"'});
});


test('validatePlan, ragged rows', () => {
    const plan = planSimple();
    plan.topography.elevations[2].pop();
    assert.deepEqual(validatePlan(plan), {'error': 'Elevation row 2 has 4 elevations, expected 5'});
});


test('validatePlan, structure endStation', () => {
    const plan = planSimple();
    const [option] = plan.options;
    option.structures = [{'type': 'culvert', 'station': 5}, {'type': 'bridge', 'station': 10, 'endStation': 10}];
    assert.deepEqual(validatePlan(plan),
        {'error': 'Option "Flat" bridge at station 10 requires an endStation greater than its station'});
    option.structures = [{'type': 'retainingWall', 'station': 10}];
    assert.deepEqual(validatePlan(plan),
        {'error': 'Option "Flat" retainingWall at station 10 requires an endStation greater than its station'});

    // A culvert doesn't have an ending station
    option.structures = [{'type': 'culvert', 'station': 5}, {'type': 'bridge', 'station': 10, 'endStation': 11}];
    assert.deepEqual(validatePlan(plan), {plan});
});


test('planCriteria', () => {
    assert.deepEqual(planCriteria(planSimple()), {'maxGrade': 12, 'minRadius': 15, 'rockCutSlope': 0.5, 'maxWallHeight': 6});
    assert.deepEqual(planCriteria(planComplex()), {'maxGrade': 10, 'minRadius': 50, 'rockCutSlope': 0.5, 'maxWallHeight': 3});

    const plan = planComplex();
    plan.criteria = {'minRadius': 30, 'rockCutSlope': 0.25};
    assert.deepEqual(planCriteria(plan), {'maxGrade': 12, 'minRadius': 30, 'rockCutSlope': 0.25, 'maxWallHeight': 20});
});


// The cost rates are the default rates, with the plan's overrides
test('analyzeOption, cost rates', () => {
    const plan = planSimple();
    assert.deepEqual(analyze(plan).costs[7], {'name': 'Surfacing (gravel)', 'quantity': 400, 'type': 'area', 'cost': 400 * 19});
    plan.costRates = {'gravel': 25};
    assert.deepEqual(analyze(plan).costs[7], {'name': 'Surfacing (gravel)', 'quantity': 400, 'type': 'area', 'cost': 400 * 25});
    plan.options[0].section.surface = 'asphalt';
    assert.deepEqual(analyze(plan).costs[7], {'name': 'Surfacing (asphalt)', 'quantity': 400, 'type': 'area', 'cost': 400 * 40});

    // The overrides don't change the default rates
    assert.deepEqual(analyze(planSimple()).costs[7], {'name': 'Surfacing (gravel)', 'quantity': 400, 'type': 'area', 'cost': 400 * 19});

    // The mobilization rate is a fraction of the other costs
    plan.costRates = {'mobilization': 0.5};
    const {costs, total} = analyze(plan);
    const subtotal = costs.slice(0, 14).reduce((sum, cost) => sum + cost.cost, 0);
    assert.deepEqual(costs[14], {'name': 'Mobilization', 'quantity': null, 'type': null, 'cost': subtotal * 0.5});
    assert.equal(total, subtotal + subtotal * 0.5);
});


test('unitLength and culvertDiameter', () => {
    assert.equal(unitLength(planSimple(), 3, 10), 3);
    assert.equal(unitLength(planComplex(), 3, 10), 10);
    assert.equal(culvertDiameter('meters', {'type': 'culvert'}), 0.45);
    assert.equal(culvertDiameter('feet', {'type': 'culvert'}), 1.5);
    assert.equal(culvertDiameter('feet', {'type': 'culvert', 'diameter': 3}), 3);
});


// The costs are computed in metric units - a feet plan's quantities are scaled by 0.3048 meters per foot
test('analyzeOption, unit scale', () => {
    const meters = planSimple();
    const feet = planSimple();
    feet.units = 'feet';
    assert.deepEqual(analyze(meters).costs[8], {'name': 'Ditches and cross drains', 'quantity': 40, 'type': 'length', 'cost': 40 * 45});
    assert.deepEqual(analyze(feet).costs[8],
        {'name': 'Ditches and cross drains', 'quantity': 40, 'type': 'length', 'cost': 40 * 0.3048 * 45});
    assert.deepEqual(analyze(feet).costs[7],
        {'name': 'Surfacing (gravel)', 'quantity': 400, 'type': 'area', 'cost': 400 * (0.3048 * 0.3048) * 19});
});


//
// Topography
//


test('planTopo', () => {
    const plan = planSimple();
    assert.deepEqual(planTopo(plan), {
        'rows': plan.topography.elevations,
        'spacing': 10,
        'nRows': 5,
        'nCols': 5,
        'width': 40,
        'height': 40,
        'minZ': 100,
        'maxZ': 104,
        'features': []
    });
    assert.deepEqual(plan.topography.elevations.map((row) => row[0]), [104, 103, 102, 101, 100]);

    const complex = planComplex();
    const topo = planTopo(complex);
    assert.equal(topo.features, complex.topography.features);
    assert.equal(topo.features.length, 5);
    assert.deepEqual([topo.nRows, topo.nCols, topo.width, topo.height, topo.minZ, topo.maxZ], [9, 9, 80, 80, 100, 164]);
});


test('planTopo, the elevation range', () => {
    const plan = planSimple();
    plan.topography.elevations = [[5, 7, 3], [9, 1, 4]];
    const topo = planTopo(plan);
    assert.deepEqual([topo.nRows, topo.nCols, topo.width, topo.height, topo.minZ, topo.maxZ], [2, 3, 20, 10, 1, 9]);
});


test('elevation', () => {
    const plan = planSimple();
    plan.topography.elevations[0][4] = 110;
    const topo = planTopo(plan);

    // Grid points and interpolation
    assert.equal(elevation(topo, 0, 0), 100);
    assert.equal(elevation(topo, 0, 40), 104);
    assert.equal(elevation(topo, 40, 40), 110);
    assert.equal(round(elevation(topo, 15, 25), 6), 102.5);
    assert.equal(round(elevation(topo, 35, 35), 6), 105);

    // Outside
    assert.equal(elevation(topo, -1, 10), null);
    assert.equal(elevation(topo, 10, -1), null);
    assert.equal(elevation(topo, 41, 10), null);
    assert.equal(elevation(topo, 10, 41), null);

    // Within the tolerance of the edge
    assert.equal(elevation(topo, -1e-6, 40 + 1e-6), 104);
    assert.equal(elevation(topo, 40 + 1e-6, -1e-6), 100);
});


test('gradient', () => {
    const topo = planTopo(planSimple());
    assert.deepEqual(gradient(topo, 20, 20), [0, 0.1]);
    assert.deepEqual(gradient(topo, 0, 0), [0, 0.1]);
    assert.deepEqual(gradient(topo, 40, 40), [0, 0.1]);

    // A plane rising 30% to the east
    assert.deepEqual(gradient(planTopo(planExistingRoad()), 20, 20), [0.3, 0]);
});


// A road sample is rock when it's inside a rock polygon
test('analyzeOption, point in polygon', () => {
    const plan = planSimple();
    plan.topography.features = [
        {'type': 'rock', 'points': [{'x': 0, 'y': 0}, {'x': 10, 'y': 0}, {'x': 10, 'y': 10}, {'x': 0, 'y': 10}]}
    ];
    const rocks = [];
    for (const [x, y] of [[5, 5], [15, 5], [5, -5]]) {
        plan.options[0].alignment = [{x, y}, {'x': x + 1, y}];
        const [sample] = analyze(plan).samples;
        assert.deepEqual([sample.x, sample.y], [x, y]);
        rocks.push(sample.rock);
    }
    assert.deepEqual(rocks, [true, false, false]);
});


// A stream crossing is the intersection of an alignment segment and a stream segment
test('analyzeOption, segment intersections', () => {
    // A crossing halfway along the road, a parallel stream, and a stream beyond the end of the road
    const plan = planSimple();
    plan.options[0].alignment = [{'x': 0, 'y': 0}, {'x': 10, 'y': 0}];
    plan.topography.features = [
        {'type': 'stream', 'name': 'Cross', 'points': [{'x': 5, 'y': -5}, {'x': 5, 'y': 5}]},
        {'type': 'stream', 'name': 'Parallel', 'points': [{'x': 0, 'y': 1}, {'x': 10, 'y': 1}]},
        {'type': 'stream', 'name': 'Beyond', 'points': [{'x': 15, 'y': -5}, {'x': 15, 'y': 5}]}
    ];
    assert.deepEqual(crossingWarnings(analyze(plan)), ['The Cross crossing at 0+005 has no culvert or bridge']);

    // Streams within a diagonal road's bounding box - a parallel stream, streams that would cross the road's line
    // before its start and after its end, stream segments that end before the road, and a crossing
    plan.options[0].alignment = [{'x': 10, 'y': 10}, {'x': 30, 'y': 30}];
    plan.topography.features = [
        {'type': 'stream', 'name': 'Parallel', 'points': [{'x': 10, 'y': 12}, {'x': 28, 'y': 30}]},
        {'type': 'stream', 'name': 'After', 'points': [{'x': 28, 'y': 36}, {'x': 40, 'y': 24}]},
        {'type': 'stream', 'name': 'Before', 'points': [{'x': 0, 'y': 16}, {'x': 12, 'y': 4}]},
        {'type': 'stream', 'name': 'Short', 'points': [{'x': 20, 'y': 10}, {'x': 18, 'y': 14}]},
        {'type': 'stream', 'name': 'Short reversed', 'points': [{'x': 18, 'y': 14}, {'x': 20, 'y': 10}]},
        {'type': 'stream', 'name': 'Cross', 'points': [{'x': 15, 'y': 25}, {'x': 25, 'y': 15}]}
    ];
    assert.deepEqual(crossingWarnings(analyze(plan)), ['The Cross crossing at 0+014 has no culvert or bridge']);
});


test('outsideBox', () => {
    const box = [-2, 3, -1, 4];
    assert.equal(outsideBox(box, 0, 1, 0, 1), false);
    assert.equal(outsideBox(box, 3, 5, 0, 1), false);
    assert.equal(outsideBox(box, 3.5, 5, 0, 1), true);
    assert.equal(outsideBox(box, -5, -3, 0, 1), true);
    assert.equal(outsideBox(box, 0, 1, 5, 6), true);
    assert.equal(outsideBox(box, 0, 1, -3, -2), true);
});


//
// Cross sections
//


// With walls on both sides, a sample's cut and fill areas are the road's - the positive and negative areas of the depth,
// which varies linearly from the right edge to the left edge
test('analyzeOption, linear areas', () => {
    // Depths 1 to 3 over 10
    let sample = planeSample({'slope': 0.2, 'depth': 2, 'structures': wallBoth});
    assert.deepEqual([sample.cut, sample.fill], [20, 0]);

    // Depths -1 to -3 over 10
    sample = planeSample({'slope': -0.2, 'depth': -2, 'structures': wallBoth});
    assert.deepEqual([sample.cut, sample.fill], [0, 20]);

    // Depths -1 to 3 over 8
    sample = planeSample({'slope': 0.5, 'depth': 1, 'width': 8, 'structures': wallBoth});
    assert.deepEqual([sample.cut, sample.fill], [9, 1]);

    // Depths 0 to 0 over 8
    sample = planeSample({'width': 8, 'structures': wallBoth});
    assert.deepEqual([sample.cut, sample.fill], [0, 0]);
});


// The left side's depth at the road edge is the centerline depth plus the slope times the half width (5)
test('analyzeOption, side sections', () => {
    // Wall
    assert.deepEqual(planeSample({'depth': -2, 'structures': wallLeft}).left,
        {'kind': 'wall', 'offset': 0, 'drop': -2, 'wall': 2, 'cut': 0, 'fill': 0, 'daylight': true});

    // Cut on flat ground
    assert.deepEqual(planeSample({'depth': 2}).left,
        {'kind': 'cut', 'offset': 2, 'drop': 2, 'wall': 0, 'cut': 2, 'fill': 0, 'daylight': true});

    // Cut on ground steeper than the cut slope
    assert.deepEqual(planeSample({'slope': 2, 'depth': 2 - 2 * 5}).left,
        {'kind': 'cut', 'offset': 6, 'drop': 6, 'wall': 0, 'cut': 30, 'fill': 0, 'daylight': false});

    // Fill on flat ground
    assert.deepEqual(planeSample({'depth': -2, 'section': {'fillSlope': 2}}).left,
        {'kind': 'fill', 'offset': 4, 'drop': -2, 'wall': 0, 'cut': 0, 'fill': 4, 'daylight': true});

    // Fill on ground steeper than the fill slope
    assert.deepEqual(planeSample({'slope': -1, 'depth': -2 + 1 * 5, 'section': {'fillSlope': 2}}).left,
        {'kind': 'fill', 'offset': 12, 'drop': -6, 'wall': 0, 'cut': 0, 'fill': 60, 'daylight': false});

    // At grade
    assert.deepEqual(planeSample({'slope': 0.5, 'depth': -0.5 * 5}).left,
        {'kind': 'none', 'offset': 0, 'drop': 0, 'wall': 0, 'cut': 0, 'fill': 0, 'daylight': true});
});


test('analyzeOption, cross section', () => {
    const sample = planeSample({'slope': 0.5, 'width': 4, 'section': {'cutSlope': 1, 'fillSlope': 1}, 'structures': wallRight});
    assert.deepEqual(
        {'cut': sample.cut, 'fill': sample.fill, 'left': sample.left, 'right': sample.right},
        {
            'cut': 2,
            'fill': 1,
            'left': {'kind': 'cut', 'offset': 2, 'drop': 2, 'wall': 0, 'cut': 1, 'fill': 0, 'daylight': true},
            'right': {'kind': 'wall', 'offset': 0, 'drop': -1, 'wall': 1, 'cut': 0, 'fill': 0, 'daylight': true}
        }
    );
});


//
// Road analysis
//


test('analyzeOption, alignment', () => {
    // The ground elevation is the default elevation - zero outside the topography
    assert.deepEqual(analyze(planComplex(), 1).alignment, [
        {'x': 0, 'y': 40, 'z': 132, 'station': 0},
        {'x': 40, 'y': 40, 'z': 132, 'station': 40},
        {'x': 90, 'y': 40, 'z': 0, 'station': 90}
    ]);

    // An existing road follows the ground - outside the topography it keeps its alignment elevation
    const plan = planExistingRoad();
    const [option] = plan.options;
    option.alignment = [{'x': 0, 'y': 20}, {'x': 20, 'y': 20}, {'x': 40, 'y': 20, 'z': 150}, {'x': 60, 'y': 20, 'z': 150}];
    option.structures[0].endStation = 60;
    assert.deepEqual(analyze(plan).alignment, [
        {'x': 0, 'y': 20, 'z': 100, 'station': 0},
        {'x': 20, 'y': 20, 'z': 106, 'station': 20},
        {'x': 40, 'y': 20, 'z': 112, 'station': 40},
        {'x': 60, 'y': 20, 'z': 150, 'station': 60}
    ]);
});


// A repeated alignment point is a zero-length segment - the sample at its station is at the point, heading east
test('analyzeOption, repeated alignment point', () => {
    const plan = planSimple();
    plan.start = {'x': 20, 'y': 20};
    plan.options[0].alignment = [{'x': 20, 'y': 20}, {'x': 20, 'y': 20}, {'x': 20, 'y': 30}];
    const analysis = analyze(plan);
    assert.equal(analysis.length, 10);
    assert.deepEqual(analysis.alignment, [
        {'x': 20, 'y': 20, 'z': 102, 'station': 0}, {'x': 20, 'y': 20, 'z': 102, 'station': 0}, {'x': 20, 'y': 30, 'z': 103, 'station': 10}
    ]);
    assert.deepEqual(
        analysis.samples.map(({station, x, y, z, dx, dy}) => [station, x, y, z, dx, dy].map((value) => Math.round(value * 1000) / 1000)),
        [[0, 20, 20, 102, 1, 0], [3.333, 20, 23.333, 102.333, 0, 1], [6.667, 20, 26.667, 102.667, 0, 1], [10, 20, 30, 103, 0, 1]]
    );
    assert.deepEqual(analysis.grades, [{'station': 0, 'endStation': 10, 'grade': 10, 'existing': false}]);
});


// The road centerline's point at a station is between the samples either side of the station
test('centerlineAt', () => {
    const plan = planSimple();
    plan.options[0].alignment = [{'x': 0, 'y': 20, 'z': 102}, {'x': 20, 'y': 20, 'z': 104}, {'x': 20, 'y': 40, 'z': 104}];
    const {samples, length} = analyze(plan);
    assert.deepEqual([length, samples.length], [40, 13]);
    const point = (stationValue) => centerlineAt(samples, stationValue).map((value) => Math.round(value * 1000) / 1000);
    assert.deepEqual(point(0), [0, 20, 102]);
    assert.deepEqual(point(5), [5, 20, 102.5]);
    assert.deepEqual(point(7 * 40 / 12), [20, 23.333, 104]);
    assert.deepEqual(point(35), [20, 35, 104]);
    assert.deepEqual(point(40), [20, 40, 104]);

    // The nearest sample to station 5 is 1.7 meters from it
    assert.equal(Math.round(sampleAt(samples, 5).x * 1000) / 1000, 6.667);

    // A station before the start or beyond the end is the start or the end
    assert.deepEqual(point(-5), [0, 20, 102]);
    assert.deepEqual(point(45), [20, 40, 104]);
});


// A retaining wall is on its side of the road (default is both), within its stations
test('analyzeOption, retaining wall sides', () => {
    const plan = planSimple();
    const [option] = plan.options;
    option.alignment = [{'x': 0, 'y': 20, 'z': 103}, {'x': 40, 'y': 20, 'z': 103}];
    option.structures = [
        {'type': 'retainingWall', 'station': 10, 'endStation': 20, 'side': 'left'},
        {'type': 'retainingWall', 'station': 30, 'endStation': 40},
        {'type': 'culvert', 'station': 5}
    ];
    const analysis = analyze(plan);
    const sides = (stationValue) => {
        const sample = sampleAt(analysis.samples, stationValue);
        return [sample.station, sample.left.kind, sample.right.kind, sample.bridge];
    };
    assert.deepEqual(sides(0), [0, 'fill', 'fill', false]);
    assert.deepEqual(sides(10), [10, 'wall', 'fill', false]);
    assert.deepEqual(sides(20), [20, 'wall', 'fill', false]);
    assert.deepEqual(sides(23), [23.333333333333336, 'fill', 'fill', false]);
    assert.deepEqual(sides(30), [30, 'wall', 'wall', false]);
    assert.deepEqual(sides(40), [40, 'wall', 'wall', false]);

    // The grade is 1 above the centerline ground, which rises 10% to the left - the left wall is 0.5 high and the right 1.5
    assert.deepEqual(analysis.samples[4].left,
        {'kind': 'wall', 'offset': 0, 'drop': -0.5, 'wall': 0.5, 'cut': 0, 'fill': 0, 'daylight': true});
    assert.deepEqual(analysis.samples[10].right,
        {'kind': 'wall', 'offset': 0, 'drop': -1.5, 'wall': 1.5, 'cut': 0, 'fill': 0, 'daylight': true});
});


test('analyzeOption, the simple plan', () => {
    const analysis = analyze(planSimple());
    const {samples} = analysis;
    assert.equal(samples.length, 13);
    assert.deepEqual(samples[6], {
        'station': 20,
        'x': 20,
        'y': 20,
        'z': 102,
        'ground': 102,
        'dx': 1,
        'dy': 0,
        'slope': 0.1,
        'outside': false,
        'rock': false,
        'bridge': false,
        'existing': false,
        'cut': 1.3888888888888888,
        'fill': 1.4705882352941178,
        'left': {
            'kind': 'cut', 'offset': 0.5555555555555556, 'drop': 0.5555555555555556, 'wall': 0, 'cut': 0.1388888888888889, 'fill': 0,
            'daylight': true
        },
        'right': {
            'kind': 'fill', 'offset': 0.8823529411764706, 'drop': -0.5882352941176471, 'wall': 0, 'cut': 0, 'fill': 0.22058823529411767,
            'daylight': true
        }
    });

    // Plane cross section: road 1.25 cut and 1.25 fill, left cut slope 0.5 * 0.5 / 0.9, right fill slope
    // 0.5 * 0.5 / (2 / 3 - 0.1)
    assert.equal(round(samples[6].cut, 6), round(1.25 + 0.25 / 1.8, 6));
    assert.equal(round(samples[6].fill, 6), round(1.25 + 0.25 / (2 * (2 / 3 - 0.1)), 6));
    assert.equal(analysis.name, 'Flat');
    assert.equal(analysis.length, 40);
    assert.equal(round(analysis.cut, 4), round(40 * (1.25 + 0.25 / 1.8), 4));
    assert.equal(round(analysis.fill, 4), round(40 * (1.25 + 0.25 / (2 * (2 / 3 - 0.1))), 4));
    assert.equal(round(analysis.borrow, 4), round(analysis.fill - 0.87 * analysis.cut, 4));
    assert.equal(analysis.waste, 0);
    assert.equal(analysis.maxGrade, 0);
    assert.equal(analysis.minRadius, null);
    assert.equal(analysis.wallArea, 0);
    assert.equal(analysis.bridgeLength, 0);
    assert.equal(analysis.existingLength, 0);
    assert.equal(analysis.culvertCount, 0);
    assert.deepEqual(analysis.alignment, [{'x': 0, 'y': 20, 'z': 102, 'station': 0}, {'x': 40, 'y': 20, 'z': 102, 'station': 40}]);
    assert.deepEqual(analysis.grades, [{'station': 0, 'endStation': 40, 'grade': 0, 'existing': false}]);
    assert.deepEqual(analysis.warnings, []);

    // Costs
    const {costs} = analysis;
    assert.deepEqual(costs.map((cost) => [cost.name, cost.type, round(cost.quantity ?? 0, 2), round(cost.cost, 2)]), [
        ['Clearing and grubbing', 'area', 457.52, 915.03],
        ['Common excavation', 'volume', 55.56, 1111.11],
        ['Rock excavation', 'volume', 0, 0],
        ['Embankment', 'volume', 58.82, 382.35],
        ['Borrow (import)', 'volume', 10.49, 272.75],
        ['Waste (export)', 'volume', 0, 0],
        ['Overhaul', 'haul', 0, 0],
        ['Surfacing (gravel)', 'area', 400, 7600],
        ['Ditches and cross drains', 'length', 40, 1800],
        ['Existing road upgrade', 'area', 0, 0],
        ['Culverts (0)', 'length', 0, 0],
        ['Retaining walls', 'area', 0, 0],
        ['Bridges', 'area', 0, 0],
        ['Erosion control', 'area', 457.52, 343.14],
        ['Mobilization', null, 0, 1242.44]
    ]);
    assert.deepEqual(costs[7], {'name': 'Surfacing (gravel)', 'quantity': 400, 'type': 'area', 'cost': 7600});
    assert.deepEqual(costs[8], {'name': 'Ditches and cross drains', 'quantity': 40, 'type': 'length', 'cost': 1800});
    assert.deepEqual(costs[9], {'name': 'Existing road upgrade', 'quantity': 0, 'type': 'area', 'cost': 0});
    const subtotal = costs.slice(0, 14).reduce((sum, cost) => sum + cost.cost, 0);
    assert.deepEqual(costs[14], {'name': 'Mobilization', 'quantity': null, 'type': null, 'cost': subtotal * 0.1});
    assert.equal(round(analysis.total, 6), round(subtotal * 1.1, 6));
    assert.equal(analysis.score, analysis.total / 1000);
    assert.equal(round(analysis.score, 3), 13.667);
});


test('analyzeOption, the complex plan', () => {
    const analysis = analyze(planComplex());
    assert.equal(analysis.name, 'Main');
    assert.equal(round(analysis.length, 4), round(70 + Math.sqrt(5) + 14, 4));
    assert.equal(analysis.samples.length, 27);
    assert.equal(analysis.maxGrade, 100);
    assert.equal(round(analysis.minRadius, 4), 6.25);
    assert.equal(analysis.bridgeLength, 4);
    assert.equal(analysis.culvertCount, 2);
    assert.equal(analysis.borrow, 0);
    assert.equal(round(analysis.waste, 2), 305.59);
    assert.equal(round(analysis.wallArea, 2), 53.07);
    assert.equal(round(analysis.score, 2), 47.58);
    assert.deepEqual(analysis.warnings, [
        'Grade 20.0% exceeds the maximum grade (10%) from 0+40 to 0+50',
        'Grade 100.0% exceeds the maximum grade (10%) from 0+70 to 0+86',
        'Curve radius 6 ft at 0+70 is less than the minimum radius (50 ft)',
        'The alignment start is 15 ft from the plan start point',
        'The road grade at the start is 2.0 ft below the ground',
        'The alignment end is 39 ft from the plan end point',
        'The road is outside the topography from 0+83 to 0+86',
        'The road crosses an exclusion area from 0+63 to 0+66',
        'The fill slope does not daylight (retaining wall needed) from 0+07 to 0+30',
        'The fill slope does not daylight (retaining wall needed) from 0+40 to 0+43',
        'The fill slope does not daylight (retaining wall needed) from 0+53 to 0+80',
        'The cut slope does not daylight (retaining wall needed) from 0+07 to 0+13',
        'The cut slope does not daylight (retaining wall needed) from 0+27 to 0+43',
        'The cut slope does not daylight (retaining wall needed) from 0+53 to 0+73',
        'The retaining wall exceeds the maximum wall height from 0+00 to 0+03',
        'The bridge deck is below the ground from 0+46 to 0+50',
        'The stream crossing at 0+45 has no culvert or bridge',
        'The culvert at 2+00 is beyond the end of the road'
    ]);

    // The segment grades - a zero-length segment has no grade
    assert.deepEqual(analysis.grades.map((grade) => [round(grade.station, 2), round(grade.endStation, 2), round(grade.grade, 2)]), [
        [0, 20, 0], [20, 40, 0], [40, 50, 20], [50, 60, 0], [60, 70, 0], [70, 72.24, 89.44], [72.24, 86.24, 100]
    ]);

    // Rock, bridge, outside, and wall samples
    const {samples} = analysis;
    assert.equal(samples[6].rock, true);
    assert.equal(samples[14].bridge, true);
    assert.equal(samples[26].outside, true);
    assert.equal(samples[11].right.kind, 'wall');
    assert.deepEqual(samples.filter((sample) => sample.rock).map((sample) => round(sample.station, 2)), [16.58, 19.9, 23.22]);
    assert.deepEqual(samples.filter((sample) => sample.bridge).map((sample) => round(sample.station, 2)), [46.43, 49.75]);
    assert.deepEqual(samples.filter((sample) => sample.outside).map((sample) => round(sample.station, 2)), [82.92, 86.24]);

    // A bridge sample has no earthwork, and an outside sample's ground is at grade
    assert.deepEqual([samples[14].cut, samples[14].fill, samples[14].left.kind, samples[14].right.kind], [0, 0, 'none', 'none']);
    assert.deepEqual([samples[26].ground, samples[26].z, samples[26].slope], [132, 132, 0]);

    // A rock sample's cut slope is the rock cut slope (0.5) - the 6 ft cut daylights
    assert.deepEqual(samples[6].left, {'kind': 'cut', 'offset': 5, 'drop': 10, 'wall': 0, 'cut': 15, 'fill': 0, 'daylight': true});

    // Quantities
    const {costs} = analysis;
    assert.deepEqual(costs[10], {'name': 'Culverts (2)', 'quantity': 29, 'type': 'length', 'cost': 16308.37848});
    assert.deepEqual(costs[12], {'name': 'Bridges', 'quantity': 40, 'type': 'area', 'cost': 40 * 0.3048 * 0.3048 * 2700});

    // The culverts - a 19 ft pipe (the road and its 9 ft fill slope) with a 2 ft diameter and a 10 ft pipe with the default
    // 1.5 ft diameter
    assert.equal(round(costs[10].cost, 6),
        round(19 * 0.3048 * 2 * 0.3048 * 875 + 6000 + 10 * 0.3048 * 1.5 * 0.3048 * 875 + 6000, 6));

    // The surfacing is the road outside the bridge plus the turnouts (10 ft wide, one on both sides)
    const surfaceLength = costs[8].quantity;
    assert.equal(round(surfaceLength, 4), round(analysis.length - analysis.length / 26, 4));
    assert.equal(costs[7].name, 'Surfacing (asphalt)');
    assert.equal(round(costs[7].quantity, 6), round(surfaceLength * 10 + 8 * 10 * 2 + 6 * 10, 6));
    assert.equal(round(costs[7].cost, 6), round(costs[7].quantity * 0.3048 * 0.3048 * 40, 6));
});


test('analyzeOption, ground alignment', () => {
    const analysis = analyze(planComplex(), 1);
    assert.equal(analysis.name, 'Alt');
    assert.equal(analysis.minRadius, null);
    assert.deepEqual(analysis.grades, [
        {'station': 0, 'endStation': 40, 'grade': 0, 'existing': false},
        {'station': 40, 'endStation': 90, 'grade': -264, 'existing': false}
    ]);
    assert.deepEqual(analysis.warnings, [
        'Grade 264.0% exceeds the maximum grade (10%) from 0+40 to 0+90',
        'The alignment start is 25 ft from the plan start point',
        'The alignment end is 25 ft from the plan end point',
        'The road is outside the topography from 0+83 to 0+90',
        'The fill slope does not daylight (retaining wall needed) from 0+00 to 0+40',
        'The Creek A crossing at 0+12 has no culvert or bridge',
        'The stream crossing at 0+45 has no culvert or bridge',
        'The Creek C crossing at 0+48 has no culvert or bridge'
    ]);
});


// A road east up a 30% plane - its second half follows an existing road. The existing road follows the ground (its
// alignment elevation is ignored), with no earthwork, grade or curve checks, or stream crossing structures, and is
// costed at the existing road upgrade rate.
test('analyzeOption, existing road', () => {
    const analysis = analyze(planExistingRoad());
    const {length} = analysis;
    assert.equal(length, 40);

    // The existing road follows the ground - the end tie-in is on the ground
    assert.equal(round(analysis.alignment[3].z, 6), 112);
    assert.deepEqual(
        analysis.samples.map((sample) => [round(sample.station, 2), sample.existing, round(sample.ground - sample.z, 6), sample.cut,
            sample.fill]),
        [
            [0, false, 0, 0, 0],
            [3.33, false, 0, 0, 0],
            [6.67, false, 0, 0, 0],
            [10, false, 0, 0, 0],
            [13.33, false, 0, 0, 0],
            [16.67, false, 0, 0, 0],
            [20, true, 0, 0, 0],
            [23.33, true, 0, 0, 0],
            [26.67, true, 0, 0, 0],
            [30, true, 0, 0, 0],
            [33.33, true, 0, 0, 0],
            [36.67, true, 0, 0, 0],
            [40, true, 0, 0, 0]
        ]
    );

    // Only the new road's grade (30%), curves, and stream crossings are checked
    assert.deepEqual(analysis.grades, [
        {'station': 0, 'endStation': 20, 'grade': 30, 'existing': false},
        {'station': 20, 'endStation': 30, 'grade': 30, 'existing': true},
        {'station': 30, 'endStation': 40, 'grade': 30, 'existing': true}
    ]);
    assert.equal(analysis.maxGrade, 30);
    assert.equal(analysis.minRadius, null);
    assert.deepEqual(analysis.warnings, [
        'Grade 30.0% exceeds the maximum grade (12%) from 0+00 to 0+20',
        'The West Creek crossing at 0+10 has no culvert or bridge'
    ]);

    // The existing road's upgrade replaces its clearing, surfacing, and ditches
    const existingLength = length - 20;
    assert.equal(round(analysis.existingLength, 6), round(existingLength, 6));
    const {costs} = analysis;
    assert.deepEqual(costs[0], {'name': 'Clearing and grubbing', 'quantity': 200, 'type': 'area', 'cost': 200 * 0.3048 * 0.3048 * 2});
    assert.deepEqual(costs[7], {'name': 'Surfacing (gravel)', 'quantity': 200, 'type': 'area', 'cost': 200 * 0.3048 * 0.3048 * 19});
    assert.deepEqual(costs[8], {'name': 'Ditches and cross drains', 'quantity': 20, 'type': 'length', 'cost': 20 * 0.3048 * 45});
    assert.deepEqual(costs[9], {
        'name': 'Existing road upgrade',
        'quantity': existingLength * 10,
        'type': 'area',
        'cost': existingLength * 10 * 0.3048 * 0.3048 * 13
    });
});


// An existing road's curves aren't checked
test('analyzeOption, existing road curves', () => {
    const plan = planExistingRoad();
    const [option] = plan.options;
    option.alignment = [{'x': 0, 'y': 20}, {'x': 10, 'y': 20}, {'x': 20, 'y': 30}, {'x': 30, 'y': 20}, {'x': 40, 'y': 20}];
    option.structures = [];
    const analysis = analyze(plan);
    assert.equal(round(analysis.minRadius, 4), 10);
    assert.deepEqual(analysis.warnings.filter((warning) => warning.startsWith('Curve')),
        ['Curve radius 10 ft at 0+24 is less than the minimum radius (50 ft)']);

    // The sharpest curve is within the existing road
    option.structures = [{'type': 'existingRoad', 'station': 20, 'endStation': 30}];
    const existing = analyze(plan);
    assert.equal(round(existing.minRadius, 4), round(Math.sqrt(10 * 10 + 10 * 10) * 10 * Math.sqrt(20 * 20 + 10 * 10) / (2 * 100), 4));
    assert.deepEqual(existing.warnings.filter((warning) => warning.startsWith('Curve')),
        ['Curve radius 16 ft at 0+10 is less than the minimum radius (50 ft)']);
});


// A 21-point alignment spans two stream crossing chunks - a stream away from the road crosses no chunk, and the
// crossing warnings are in feature order
test('analyzeOption, stream crossings', () => {
    const plan = planSimple();
    const alignment = [];
    for (let x = 0; x <= 40; x += 2) {
        alignment.push({x, 'y': 20});
    }
    plan.options[0].alignment = alignment;
    plan.topography.features = [
        {'type': 'stream', 'name': 'Far Creek', 'points': [{'x': 5, 'y': 35}, {'x': 10, 'y': 38}]},
        {'type': 'stream', 'name': 'Late Creek', 'points': [{'x': 37, 'y': 15}, {'x': 37, 'y': 25}]},
        {'type': 'stream', 'name': 'Early Creek', 'points': [{'x': 5, 'y': 15}, {'x': 5, 'y': 25}]}
    ];
    assert.deepEqual(crossingWarnings(analyze(plan)), [
        'The Late Creek crossing at 0+037 has no culvert or bridge',
        'The Early Creek crossing at 0+005 has no culvert or bridge'
    ]);

    // A culvert within the road width (10) of a crossing, and a bridge over a crossing
    plan.options[0].structures = [{'type': 'culvert', 'station': 15}, {'type': 'bridge', 'station': 35, 'endStation': 39}];
    assert.deepEqual(crossingWarnings(analyze(plan)), []);

    // A culvert farther from the crossing, and a bridge that begins after the crossing
    plan.options[0].structures = [{'type': 'culvert', 'station': 16}, {'type': 'bridge', 'station': 38, 'endStation': 39}];
    assert.deepEqual(crossingWarnings(analyze(plan)), [
        'The Late Creek crossing at 0+037 has no culvert or bridge',
        'The Early Creek crossing at 0+005 has no culvert or bridge'
    ]);
});


// The new road starts 5 ft below the ground (cut) - with no free haul, its surplus earth is hauled along the new road
// only, not along the existing road
test('analyzeOption, existing road haul', () => {
    const overhauls = [];
    for (const hasExisting of [true, false]) {
        const plan = planExistingRoad();
        plan.costRates = {'freeHaul': 0};
        const [option] = plan.options;
        option.alignment[0].z = 95;
        if (!hasExisting) {
            option.structures = [];
            option.alignment[3].z = 112;
        }
        overhauls.push(analyze(plan).costs.find((cost) => cost.name === 'Overhaul').quantity);
    }
    assert.equal(overhauls[0] > 0, true);
    assert.equal(overhauls[0] < overhauls[1], true);
    assert.deepEqual(overhauls.map((overhaul) => round(overhaul, 2)), [7934.72, 19575]);
});


test('analyzeOption', () => {
    const {plan} = validatePlan(fixturePlan());
    const topo = planTopo(plan);
    const direct = analyzeOption(plan, 0, topo);
    assert.equal(direct.length.toFixed(3), '439.511');
    assert.equal(direct.samples.length, 133);
    assert.equal(direct.culvertCount, 1);
    assert.deepEqual(direct.warnings, ['Grade 20.9% exceeds the maximum grade (12%) from 2+11 to 3+11']);
    assert.equal(direct.costs.at(-1).name, 'Mobilization');
    assert.ok(Math.abs(direct.total - direct.costs.reduce((sum, cost) => sum + cost.cost, 0)) < 1e-6);

    const bridge = analyzeOption(plan, 1, topo);
    assert.equal(bridge.bridgeLength, 90);
    assert.equal(bridge.existingLength.toFixed(2), '96.04');
    assert.deepEqual(bridge.warnings, ['The bridge deck is below the ground from 2+35 to 2+48']);
});


test('analyzeOption warnings', () => {
    const plan = fixturePlan();
    plan.options[0].structures = [];
    plan.options[0].alignment = [{'x': 20, 'y': 30}, {'x': 60, 'y': 260}, {'x': 200, 'y': 200, 'z': 400}, {'x': 600, 'y': 250}];
    const validated = validatePlan(plan).plan;
    const {warnings} = analyzeOption(validated, 0, planTopo(validated));
    // The crossing is at an alignment point, so both of its segments cross the stream (as in the MarkdownUp viewer)
    assert.deepEqual(warnings, [
        'Grade 99.2% exceeds the maximum grade (12%) from 2+33 to 7+89',
        'The alignment end is 220 ft from the plan end point',
        'The road is outside the topography from 5+89 to 7+89',
        'The road crosses an exclusion area from 2+16 to 2+53',
        'The Test Creek crossing at 3+86 has no culvert or bridge',
        'The Test Creek crossing at 3+86 has no culvert or bridge'
    ]);

    plan.options[0].alignment = [{'x': 20, 'y': 30}, {'x': 40, 'y': 60}, {'x': 20, 'y': 90}];
    plan.end = {'x': 20, 'y': 90};
    const curvy = validatePlan(plan).plan;
    assert.deepEqual(analyzeOption(curvy, 0, planTopo(curvy)).warnings,
        ['Curve radius 33 ft at 0+36 is less than the minimum radius (50 ft)']);
});


test('sampleAt', () => {
    const samples = [{'station': 0}, {'station': 5}, {'station': 10}];
    assert.deepEqual(sampleAt(samples, -3), {'station': 0});
    assert.deepEqual(sampleAt(samples, 6), {'station': 5});
    assert.deepEqual(sampleAt(samples, 8), {'station': 10});
    assert.deepEqual(sampleAt(samples, 30), {'station': 10});
    assert.equal(sampleAt(samples, 6), samples[1]);
});
