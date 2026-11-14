// numeric.js - the road engineering's arithmetic. The road engineering is a port of the Python planning tools', and
// it computes the same roads they do - so its arithmetic is theirs (numpy's), to the last bit: fused multiply-adds
// where numpy's compiled code has them, numpy's hypotenuse and pairwise sum, and Python's rounding and number text.


// A float's bits
const floatValue = new Float64Array(1);
const floatBits = new BigUint64Array(floatValue.buffer);


// The splitter of a float into two 26-bit halves (Dekker)
const splitter = 134217729;


// Compute factor1 * factor2 + addend with a single rounding (a fused multiply-add), as numpy's compiled code does in
// its "interp", "arange", and "convolve" loops and its hypotenuse. The product and the sum's errors are computed
// exactly, and their sum is rounded to odd so the final sum rounds correctly (Boldo and Melquiond).
export function fma(factor1, factor2, addend) {
    // factor1 * factor2 = high + low, exactly
    const high = factor1 * factor2;
    let split = splitter * factor1;
    const high1 = split - (split - factor1);
    const low1 = factor1 - high1;
    split = splitter * factor2;
    const high2 = split - (split - factor2);
    const low2 = factor2 - high2;
    const low = ((high1 * high2 - high) + high1 * low2 + low1 * high2) + low1 * low2;

    // high + addend = sum + sumError, exactly
    const sum = high + addend;
    let part = sum - high;
    const sumError = (high - (sum - part)) + (addend - part);

    // The errors' sum, rounded to odd
    let errors = sumError + low;
    part = errors - sumError;
    const errorsError = (sumError - (errors - part)) + (low - part);
    if (errorsError !== 0) {
        floatValue[0] = errors;
        if ((floatBits[0] & 1n) === 0n) {
            floatBits[0] += (errorsError > 0) === (errors > 0) ? 1n : -1n;
            [errors] = floatValue;
        }
    }
    return sum + errors;
}


// Compute a hypotenuse, as numpy's "hypot" does
export function hypot(x, y) {
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const small = Math.min(absX, absY);
    const large = Math.max(absX, absY);
    return Math.sqrt(fma(small, small, large * large));
}


// Compute the sum of an array's values, as numpy's "sum" does - a pairwise sum of blocks of eight running sums
export function pairwiseSum(values, first = 0, count = values.length) {
    if (count < 8) {
        let sum = 0;
        for (let ix = 0; ix < count; ix++) {
            sum += values[first + ix];
        }
        return sum;
    } else if (count <= 128) {
        const sums = [];
        for (let ix = 0; ix < 8; ix++) {
            sums.push(values[first + ix]);
        }
        let ixValue = 8;
        for (; ixValue < count - (count % 8); ixValue += 8) {
            for (let ix = 0; ix < 8; ix++) {
                sums[ix] += values[first + ixValue + ix];
            }
        }
        let sum = ((sums[0] + sums[1]) + (sums[2] + sums[3])) + ((sums[4] + sums[5]) + (sums[6] + sums[7]));
        for (; ixValue < count; ixValue++) {
            sum += values[first + ixValue];
        }
        return sum;
    }
    let half = Math.floor(count / 2);
    half -= half % 8;
    return pairwiseSum(values, first, half) + pairwiseSum(values, first + half, count - half);
}


// Interpolate a value at x from the points (xs[i], ys[i]), as numpy's "interp" does. The xs are in order, and x is
// at or beyond the first of them.
export function interp(x, xs, ys) {
    // Find the last point at or before x
    let low = 0;
    let high = xs.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (xs[middle] <= x) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    const ix = low - 1;
    if (ix >= xs.length - 1 || xs[ix] === x) {
        return ys[ix];
    }
    return fma((ys[ix + 1] - ys[ix]) / (xs[ix + 1] - xs[ix]), x - xs[ix], ys[ix]);
}


// Create an array of evenly spaced values from zero to a stop value, as numpy's "linspace" does
export function linspace(stop, count) {
    const values = new Float64Array(count);
    const step = stop / (count - 1);
    for (let ix = 0; ix < count - 1; ix++) {
        values[ix] = ix * step;
    }
    values[count - 1] = stop;
    return values;
}


// Create an array of evenly spaced values from a start value to less than a stop value, as numpy's "arange" does
export function arange(start, stop, step) {
    const count = Math.ceil((stop - start) / step);
    const values = new Float64Array(count);
    const second = start + step;
    const delta = second - start;
    for (let ix = 0; ix < count; ix++) {
        values[ix] = fma(ix, delta, start);
    }
    values[0] = start;
    values[1] = second;
    return values;
}


// Compute an array's moving average over a window of 2 * half + 1 values, as numpy's "convolve" (of the valid values)
// does for windows of at most 11 values. numpy averages a longer window with its linear algebra library's dot
// product, which sums in an order of its own - so a longer window's averages can differ from numpy's in their last bit.
export function movingAverage(values, half) {
    const window = 2 * half + 1;
    const weight = 1 / window;
    const averages = new Float64Array(values.length - window + 1);
    for (let ix = 0; ix < averages.length; ix++) {
        let average = 0;
        for (let ixValue = 0; ixValue < window; ixValue++) {
            average = fma(values[ix + ixValue], weight, average);
        }
        averages[ix] = average;
    }
    return averages;
}


// Determine if a number is halfway between two numbers of a number of decimal places - they're the odd multiples of
// 1 / 2 ** (digits + 1), the only halves a float can be
function isHalfway(value, digits) {
    const scaled = value * 2 ** (digits + 1);
    return Number.isInteger(scaled) && scaled % 2 !== 0;
}


// Round a number to a number of decimal places, as Python's "round" does - a number halfway between two rounds to
// the even one
export function pyRound(value, digits = 0) {
    if (isHalfway(value, digits)) {
        const below = (value * 2 ** (digits + 1) * 5 ** digits - 1) / 2;
        return (below % 2 === 0 ? below : below + 1) / 10 ** digits;
    }
    return Number(value.toFixed(digits));
}


// Round a number to a number of decimal places, as numpy's "round" does - the number's multiple of the decimal place
// is rounded, so it can round differently than Python's "round" (0.35 is less than thirty-five hundredths, but ten
// times it is 3.5)
export function npRound(value, digits) {
    return pyRound(value * 10 ** digits) / 10 ** digits;
}


// Format a number with a number of decimal places, as Python's "f" format does
export function pyFixed(value, digits) {
    if (isHalfway(value, digits)) {
        const text = pyRound(value, digits).toFixed(digits);
        return value < 0 && !text.startsWith('-') ? `-${text}` : text;
    }
    return value.toFixed(digits);
}

