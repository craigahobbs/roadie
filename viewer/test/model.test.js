import {analyzeOption, planTopo, validatePlan} from '../lib/model.js';
import assert from 'node:assert/strict';
import {fixturePlan} from './fixture.js';
import test from 'node:test';


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
    assert.deepEqual(validatePlan(noEnd), {'error': 'Option "Direct" turnout at station 100 requires an endStation greater than its station'});

    const shortRow = fixturePlan();
    shortRow.topography.elevations = [[1, 2]];
    assert.equal(validatePlan(shortRow).error,
        'Invalid value [[1,2]] (type "object") for member "topography.elevations", expected type "array" [len > 1]');

    const numericString = fixturePlan();
    numericString.start.x = '20';
    assert.equal(validatePlan(numericString).plan.start.x, 20);
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
