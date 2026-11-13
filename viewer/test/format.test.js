import {
    displayQuantity, encodeComponent, encodeUrl, escapeHtml, fixed, fixedTrim, headerId, number, px, round, station, unitLabel
} from '../lib/format.js';
import assert from 'node:assert/strict';
import test from 'node:test';


test('round', () => {
    assert.equal(round(2.4), 2);
    assert.equal(round(2.5), 3);
    assert.equal(round(-2.5), -2);
    assert.equal(round(1234.5678, 2), 1234.57);
    assert.equal(round(0.125, 2), 0.13);
    assert.equal(round(1234.5678, -2), 1200);
});


test('fixed', () => {
    assert.equal(fixed(2.345, 0), '2');
    assert.equal(fixed(2.5, 0), '3');
    assert.equal(fixed(12, 2), '12.00');
    assert.equal(fixed(-1.25, 1), '-1.3');
});


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


test('px', () => {
    // Whole numbers have no fraction
    assert.equal(px(0), '0');
    assert.equal(px(12), '12');
    assert.equal(px(0.04), '0');
    assert.equal(px(99.96), '100');

    // One decimal digit
    assert.equal(px(12.34), '12.3');
    assert.equal(px(-12.36), '-12.4');
    assert.equal(px(123456.789), '123456.8');

    // Tenths within a rounding error of a half
    assert.equal(px(0.05), '0.1');
    assert.equal(px(0.25), '0.3');
    assert.equal(px(1.45), '1.4');
    assert.equal(px(2.675), '2.7');

    // Large values
    assert.equal(px(1e7), '10000000');
    assert.equal(px(12345678.25), '12345678.3');
});


test('fixedTrim', () => {
    assert.equal(fixedTrim(12, 1), '12');
    assert.equal(fixedTrim(12.5, 1), '12.5');
    assert.equal(fixedTrim(1.5, 2), '1.50');
    assert.equal(fixedTrim(12.004, 2), '12');
    assert.equal(fixedTrim(-0.01, 1), '-0');
    assert.equal(fixed(2.345, 0), '2');
});


test('station', () => {
    assert.equal(station(0, 'feet'), '0+00');
    assert.equal(station(1250.4, 'feet'), '12+50');
    assert.equal(station(1205, 'feet'), '12+05');
    assert.equal(station(99.6, 'feet'), '1+00');
    assert.equal(station(1250, 'meters'), '1+250');
    assert.equal(station(1005, 'meters'), '1+005');
    assert.equal(station(1250.6, 'meters'), '1+251');
    assert.equal(station(7, 'meters'), '0+007');
});


test('number', () => {
    assert.equal(number(0, 0), '0');
    assert.equal(number(999, 0), '999');
    assert.equal(number(1000, 0), '1,000');
    assert.equal(number(1234567.891, 0), '1,234,568');
    assert.equal(number(1234.5, 1), '1,234.5');
    assert.equal(number(-1234.5, 1), '-1,234.5');
    assert.equal(number(-1234.56, 1), '-1,234.6');
    assert.equal(number(1e6, 2), '1,000,000.00');

    // A negative number that rounds to zero has no sign
    assert.equal(number(-0.01, 1), '0.0');
    assert.equal(number(-0.04, 1), '0.0');
    assert.equal(number(-0.06, 1), '-0.1');
});


test('unitLabel', () => {
    assert.equal(unitLabel('feet', 'length'), 'ft');
    assert.equal(unitLabel('meters', 'length'), 'm');
    assert.equal(unitLabel('feet', 'area'), 'sf');
    assert.equal(unitLabel('meters', 'area'), 'm²');
    assert.equal(unitLabel('feet', 'volume'), 'cy');
    assert.equal(unitLabel('meters', 'volume'), 'm³');
    assert.equal(unitLabel('feet', 'haul'), 'cy-mi');
    assert.equal(unitLabel('meters', 'haul'), 'm³-km');
});


test('displayQuantity', () => {
    assert.equal(displayQuantity('feet', 'volume', 54), 2);
    assert.equal(displayQuantity('meters', 'volume', 54), 54);
    assert.equal(displayQuantity('feet', 'haul', 27 * 5280 * 3), 3);
    assert.equal(displayQuantity('meters', 'haul', 3000), 3);
    assert.equal(displayQuantity('feet', 'area', 10), 10);
    assert.equal(displayQuantity('meters', 'length', 10), 10);
});


test('escapeHtml', () => {
    assert.equal(escapeHtml('plain text'), 'plain text');
    assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#039;&lt;/a&gt;');

    // Consecutive calls are independent
    assert.equal(escapeHtml('a&b'), 'a&amp;b');
    assert.equal(escapeHtml('a&b'), 'a&amp;b');
    assert.equal(escapeHtml(''), '');
});


test('encodeComponent and encodeUrl', () => {
    assert.equal(encodeComponent("a b(1)/c?d=e&f'"), "a%20b%281%29%2Fc%3Fd%3De%26f'");
    assert.equal(encodeUrl("plans/a b(1).json?x=1&y='2'#h"), "plans/a%20b%281%29.json?x=1&y='2'#h");
});


test('headerId', () => {
    assert.equal(headerId('struct RoadPlan'), 'struct-roadplan');
    assert.equal(headerId('  Option 0: Bridge - East!'), 'option-0-bridge-east');
    assert.equal(headerId('It\'s "quoted"'), 'its-quoted');
    assert.equal(headerId('Cost (ft)'), 'cost-ft');
    assert.equal(headerId('--'), '');
});
