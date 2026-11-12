import {fixed, fixedTrim, number, px, station} from '../lib/format.js';
import assert from 'node:assert/strict';
import test from 'node:test';


test('px matches toFixed(1) without an all-zero fraction', () => {
    const values = [0, -0, 0.04, -0.04, 0.05, 0.15, 0.25, 1.45, 1.05, 2.675, 9.95, 99.95, -99.95, 1e7, 123456.789, -0.5, 0.95];
    let seed = 1;
    for (let ix = 0; ix < 100000; ix++) {
        seed = (seed * 16807) % 2147483647;
        values.push((seed / 2147483647 - 0.5) * 4000, Math.round(seed % 100000) / 20 - 2000);
    }
    for (const value of values) {
        assert.equal(px(value), fixedTrim(value, 1), `${value}`);
    }
});


test('fixedTrim', () => {
    assert.equal(fixedTrim(12, 1), '12');
    assert.equal(fixedTrim(12.5, 1), '12.5');
    assert.equal(fixedTrim(1.5, 2), '1.50');
    assert.equal(fixedTrim(-0.01, 1), '-0');
    assert.equal(fixed(2.345, 0), '2');
});


test('station', () => {
    assert.equal(station(0, 'feet'), '0+00');
    assert.equal(station(1250.4, 'feet'), '12+50');
    assert.equal(station(1250.6, 'meters'), '1+251');
    assert.equal(station(7, 'meters'), '0+007');
});


test('number', () => {
    assert.equal(number(1234567.891, 0), '1,234,568');
    assert.equal(number(-1234.56, 1), '-1,234.6');
    assert.equal(number(-0.04, 1), '0.0');
    assert.equal(number(999, 0), '999');
});
