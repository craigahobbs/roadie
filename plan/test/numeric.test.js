import {arange, fma, hypot, interp, linspace, movingAverage, npRound, pairwiseSum, pyFixed, pyRound} from '../lib/numeric.js';
import {expected, plain} from './roadFixtures.js';
import assert from 'node:assert/strict';
import test from 'node:test';


// The Python planning tools' (numpy's and Python's) results
const {numeric} = expected;


// The values of the pairwise sum and moving average tests
function series(count, scale = 1) {
    return Array.from({'length': count}, (unused, ix) => ((ix * 37) % 101) / 7 * scale - 5);
}


test('fma', () => {
    // A fused multiply-add rounds once - the product isn't rounded before the addend is added
    assert.equal(0.1 * 10 - 1, 0);
    assert.equal(fma(0.1, 10, -1), 5.551115123125783e-17);
    assert.equal(0.3333333333333333 * 0.09090909090909091 - 0.030303030302930304, 9.999986949615902e-14);
    assert.equal(fma(0.3333333333333333, 0.09090909090909091, -0.030303030302930304), 9.999818734006111e-14);

    // The product's and the sum's errors don't add exactly - their sum is odd, or it's made odd (up or down)
    assert.equal(0.1 * 1.5714285714285714 - 2.1538461538461537, -1.9967032967032967);
    assert.equal(fma(0.1, 1.5714285714285714, -2.1538461538461537), -1.9967032967032965);
    assert.equal(0.2 * 6.857142857142857 + 4.384615384615385, 5.756043956043957);
    assert.equal(fma(0.2, 6.857142857142857, 4.384615384615385), 5.756043956043956);
    assert.equal(fma(0.3, 3.142857142857143, 2.0769230769230766), 3.0197802197802193);
    assert.equal(0.1 * 2.142857142857143 - 1.8461538461538463, -1.6318681318681318);
    assert.equal(fma(0.1, 2.142857142857143, -1.8461538461538463), -1.631868131868132);
    assert.equal(fma(0.3, 3.5714285714285716, 2.769230769230769), 3.840659340659341);

    // Exact products and sums
    assert.equal(fma(3, 4, 5), 17);
    assert.equal(fma(-2.5, 4, 10), 0);
    assert.equal(fma(0, 7, 1.5), 1.5);
});


test('hypot', () => {
    assert.deepEqual(numeric.hypot.map(([x, y]) => [x, y, hypot(x, y)]), numeric.hypot);
    assert.equal(hypot(3, 4), 5);
    assert.equal(hypot(4, -3), 5);

    // It isn't the square root of the squares' sum, or the JavaScript hypotenuse
    assert.equal(hypot(8.3, 17.1), 19.007893097342482);
    assert.equal(Math.sqrt(8.3 * 8.3 + 17.1 * 17.1), 19.007893097342485);
    assert.equal(hypot(19.99, 3.01), 20.215345656208797);
    assert.equal(Math.hypot(19.99, 3.01), 20.2153456562088);
});


test('pairwiseSum', () => {
    assert.deepEqual(numeric.sum.map(([count]) => [count, pairwiseSum(series(count))]), numeric.sum);

    // The pairwise sum isn't the running sum
    const values = series(1000);
    assert.equal(pairwiseSum(values), 2144.285714285714);
    assert.equal(values.reduce((sum, value) => sum + value, 0), 2144.2857142857138);

    // A part of an array
    assert.equal(pairwiseSum([1, 2, 3, 4, 5], 1, 3), 9);
});


test('interp', () => {
    const {xp, fp, xs, out} = numeric.interp;
    assert.deepEqual(xs.map((x) => interp(x, xp, fp)), out);

    // At a point, at the last of equal points, between points, and beyond the last point
    assert.equal(interp(0, xp, fp), 1);
    assert.equal(interp(3, xp, fp), -4);
    assert.equal(interp(1.5, xp, fp), 1.75);
    assert.equal(interp(25, xp, fp), 9.9);
});


test('linspace', () => {
    assert.deepEqual(numeric.linspace.map(([stop, count]) => [stop, count, plain(linspace(stop, count))]), numeric.linspace);
    assert.deepEqual(plain(linspace(10, 5)), [0, 2.5, 5, 7.5, 10]);
});


test('arange', () => {
    assert.deepEqual(numeric.arange.map(([start, stop, step]) => [start, stop, step, plain(arange(start, stop, step))]), numeric.arange);
    assert.deepEqual(plain(arange(0, 1, 0.25)), [0, 0.25, 0.5, 0.75]);

    // A single value
    assert.deepEqual(plain(arange(100.1, 100.15, 0.1)), [100.1]);
});


test('movingAverage', () => {
    assert.deepEqual(
        numeric.convolve.map(([half, count]) => [half, count, plain(movingAverage(series(count, 13.7), half))]),
        numeric.convolve
    );
    assert.deepEqual(plain(movingAverage([1, 2, 3, 4, 8], 1)), [2, 3, 5]);

    // A window of more than 11 values
    const values = series(30, 13.7);
    const averages = movingAverage(values, 6);
    assert.equal(averages.length, 18);
    assert.ok(Math.abs(averages[0] - values.slice(0, 13).reduce((sum, value) => sum + value, 0) / 13) < 1e-12);
});


test('pyRound', () => {
    const {'v': values, py0, py1, py2} = numeric.round;
    assert.deepEqual(plain(values.map((value) => pyRound(value))), plain(py0));
    assert.deepEqual(plain(values.map((value) => pyRound(value, 1))), plain(py1));
    assert.deepEqual(plain(values.map((value) => pyRound(value, 2))), plain(py2));

    // A number halfway between two rounds to the even one
    assert.deepEqual([0.5, 1.5, 2.5, -1.5, -2.5].map((value) => pyRound(value)), [0, 2, 2, -2, -2]);
    assert.deepEqual([0.25, 0.75, -0.25].map((value) => pyRound(value, 1)), [0.2, 0.8, -0.2]);
    assert.deepEqual([0.125, 0.375, -0.125].map((value) => pyRound(value, 2)), [0.12, 0.38, -0.12]);

    // A number that isn't halfway rounds to the nearest - 2.675 and 0.35 are less than their decimal numbers
    assert.deepEqual([2.675, 0.35, 8.345].map((value) => pyRound(value, 2)), [2.67, 0.35, 8.35]);
    assert.equal(pyRound(2.675, 2), 2.67);
    assert.equal(pyRound(0.35, 1), 0.3);
});


test('npRound', () => {
    const {'v': values, np1, np2} = numeric.round;
    assert.deepEqual(plain(values.map((value) => npRound(value, 1))), plain(np1));
    assert.deepEqual(plain(values.map((value) => npRound(value, 2))), plain(np2));

    // The number's multiple of the decimal place is rounded - so it rounds differently than Python's "round"
    assert.equal(npRound(0.35, 1), 0.4);
    assert.equal(npRound(117.35, 1), 117.4);
    assert.equal(pyRound(117.35, 1), 117.3);
    assert.equal(npRound(2.675, 2), 2.68);
});


test('pyFixed', () => {
    const {'v': values, f0, f1} = numeric.round;
    assert.deepEqual(values.map((value) => pyFixed(value, 0)), f0);
    assert.deepEqual(values.map((value) => pyFixed(value, 1)), f1);

    // A number halfway between two rounds to the even one - and keeps its sign
    assert.deepEqual([0.5, 2.5, 2126.5, -0.5, -1.5].map((value) => pyFixed(value, 0)), ['0', '2', '2126', '-0', '-2']);
    assert.deepEqual([0.25, 0.75, -0.25, -0.04].map((value) => pyFixed(value, 1)), ['0.2', '0.8', '-0.2', '-0.0']);
});

