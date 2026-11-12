import {AdaptiveSmoothing, motionBudget, reportBudget, stillBudget} from '../lib/smoothing.js';
import assert from 'node:assert/strict';
import test from 'node:test';


test('AdaptiveSmoothing starts from the initial cell cost estimate', () => {
    const smoothing = new AdaptiveSmoothing();
    assert.equal(smoothing.points(false), 53125);
    assert.equal(smoothing.points(true), 265625);
});


test('AdaptiveSmoothing raises the point cap on a fast computer', () => {
    const smoothing = new AdaptiveSmoothing();

    // Frames at a quarter of the initial cost estimate - well under the budget, so the cap follows the estimate up
    for (let frame = 0; frame < 10; frame++) {
        smoothing.record(motionBudget * 0.2, 50000, false);
    }
    assert.equal(Math.round(smoothing.cellCost * 1e6), 434);
    assert.equal(smoothing.points(false), 195899);

    // The still cap hasn't been measured yet, so it stays
    assert.equal(smoothing.points(true), 265625);
});


test('AdaptiveSmoothing lowers the point cap on a slow computer', () => {
    const smoothing = new AdaptiveSmoothing();
    smoothing.record(stillBudget * 2, 50000, true);
    assert.equal(smoothing.points(true), 59691);
    assert.equal(smoothing.points(false), 53125);
});


test('AdaptiveSmoothing keeps the point cap for frames near the budget', () => {
    const smoothing = new AdaptiveSmoothing();
    const cap = smoothing.points(false);

    // A frame a little over the budget and one a little under - the cost estimate moves, but the cap doesn't
    smoothing.record(motionBudget * 1.1, 40000, false);
    assert.equal(smoothing.points(false), cap);
    smoothing.record(motionBudget * 0.7, 60000, false);
    assert.equal(smoothing.points(false), cap);

    // A small drawing's cost is measured over the minimum cell count
    const before = smoothing.cellCost;
    smoothing.record(10, 0, false);
    assert.equal(smoothing.cellCost, before * 0.7 + (10 / 2000) * 0.3);
});


test('AdaptiveSmoothing starts from a previously measured cell cost', () => {
    assert.equal(new AdaptiveSmoothing(0.0005).points(false), 170000);
    assert.equal(new AdaptiveSmoothing(null).points(false), 53125);
    assert.equal(new AdaptiveSmoothing('bad').points(false), 53125);
    assert.equal(new AdaptiveSmoothing(-1).points(false), 53125);
});


test('AdaptiveSmoothing budgets a one-off drawing', () => {
    const smoothing = new AdaptiveSmoothing(0.001);
    assert.equal(smoothing.targetPoints(reportBudget), 212500);

    // A report view's drawing updates the cost estimate, but not the explorer's caps
    smoothing.recordCost(400, 100000);
    assert.equal(smoothing.cellCost, 0.001 * 0.7 + 0.004 * 0.3);
    assert.equal(smoothing.points(false), 85000);
});
