import {analyzeOption, planTopo, validatePlan} from '../lib/model.js';
import {finishedRows, reportViews} from '../lib/view3d.js';
import {planComplex, planSimple} from './planFixtures.js';
import {PlanData} from '../lib/planData.js';
import assert from 'node:assert/strict';
import test from 'node:test';


// Create the simple plan's data, with its road raised 1 m above the ground
function raisedData() {
    const planValue = planSimple();
    planValue.options[0].alignment = [{'x': 0, 'y': 20, 'z': 103}, {'x': 40, 'y': 20, 'z': 103}];
    return new PlanData(validatePlan(planValue).plan, 'plans/simple.json');
}


test('PlanData', () => {
    const {plan} = validatePlan(planSimple());
    const data = new PlanData(plan, 'plans/simple.json');
    assert.equal(data.plan, plan);
    assert.equal(data.file, 'plans/simple.json');
    assert.deepEqual(data.topo, planTopo(plan));
    assert.deepEqual([data.topo.nRows, data.topo.nCols, data.topo.minZ, data.topo.maxZ], [5, 5, 100, 104]);
});


test('PlanData analysis', () => {
    const {plan} = validatePlan(planComplex());
    const data = new PlanData(plan, 'complex.json');

    // An option's analysis is computed once
    const alt = data.analysis(1);
    assert.equal(alt.name, 'Alt');
    assert.equal(alt.length, 90);
    assert.deepEqual(alt, analyzeOption(plan, 1, data.topo));
    assert.equal(data.analysis(1), alt);

    // Every option's analysis
    const analyses = data.analyses();
    assert.deepEqual(analyses.map((analysis) => analysis.name), ['Main', 'Alt']);
    assert.deepEqual(analyses.map((analysis) => analysis.warnings.length), [18, 8]);
    assert.equal(analyses[1], alt);
    assert.equal(data.analysis(0), analyses[0]);
    assert.deepEqual(analyses[0], analyzeOption(plan, 0, data.topo));
});


test('PlanData rows', () => {
    const data = raisedData();

    // The finished grade is the topography with the road's grid points at the road's grade
    const rows = data.rows(0);
    assert.deepEqual(rows, [
        [104, 104, 104, 104, 104],
        [103, 103, 103, 103, 103],
        [103, 103, 103, 103, 103],
        [101, 101, 101, 101, 101],
        [100, 100, 100, 100, 100]
    ]);
    assert.deepEqual(rows, finishedRows(data.topo, data.analysis(0).samples, 5));

    // The rows are computed once, and the topography is unchanged
    assert.equal(data.rows(0), rows);
    assert.deepEqual(data.topo.rows[2], [102, 102, 102, 102, 102]);
});


test('PlanData reportViews', () => {
    const data = raisedData();

    // The road is wide enough to see in the overview, so it's the only view
    const views = data.reportViews(0, 800);
    assert.equal(views.length, 1);
    assert.deepEqual(
        [views[0].station, views[0].endStation, views[0].leftToRight, views[0].view.width, views[0].args.smooth],
        [0, 40, true, 800, false]
    );
    assert.deepEqual(views, reportViews(data.topo, data.rows(0), data.analysis(0), 5, 800, false));

    // The views are computed once for each width
    assert.equal(data.reportViews(0, 800), views);
    const narrow = data.reportViews(0, 400);
    assert.notEqual(narrow, views);
    assert.equal(narrow[0].view.width, 400);
    assert.deepEqual(narrow, reportViews(data.topo, data.rows(0), data.analysis(0), 5, 400, false));
    assert.equal(data.reportViews(0, 400), narrow);
    assert.equal(data.reportViews(0, 800), views);
});


// The views of each option are cached separately
test('PlanData reportViews, options', () => {
    const {plan} = validatePlan(planComplex());
    const data = new PlanData(plan, 'complex.json');
    const main = data.reportViews(0, 800);
    const alt = data.reportViews(1, 800);
    assert.deepEqual(main.map((view) => view.endStation.toFixed(3)), ['86.236']);
    assert.deepEqual(alt.map((view) => view.endStation), [90]);
    assert.deepEqual(main, reportViews(data.topo, data.rows(0), data.analysis(0), 5, 800, false));
    assert.deepEqual(alt, reportViews(data.topo, data.rows(1), data.analysis(1), 4, 800, false));
    assert.equal(data.reportViews(0, 800), main);
    assert.equal(data.reportViews(1, 800), alt);
});


test('PlanData drawing', () => {
    const data = raisedData();
    const created = [];
    const drawing = (key) => data.drawing(key, () => {
        created.push(key);
        return {key};
    });

    // A drawing is created once
    const first = drawing('key0');
    assert.deepEqual(first, {'key': 'key0'});
    assert.equal(drawing('key0'), first);
    assert.deepEqual(created, ['key0']);

    // The cache holds 48 drawings
    for (let ix = 1; ix < 48; ix++) {
        drawing(`key${ix}`);
    }
    assert.equal(created.length, 48);
    assert.equal(drawing('key0'), first);
    assert.equal(created.length, 48);

    // A new drawing replaces the least-recently used drawing - "key1", since "key0" was just used
    drawing('key48');
    assert.equal(drawing('key0'), first);
    assert.equal(created.length, 49);
    assert.deepEqual(drawing('key1'), {'key': 'key1'});
    assert.deepEqual(created.slice(48), ['key48', 'key1']);

    // Creating "key1" again replaced "key2"
    drawing('key3');
    assert.equal(created.length, 50);
    drawing('key2');
    assert.deepEqual(created.slice(48), ['key48', 'key1', 'key2']);
});
