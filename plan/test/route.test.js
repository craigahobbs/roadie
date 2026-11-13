import {blockedPlan, designArgs, expected, hillPlan, plain, planePlan} from './roadFixtures.js';
import {polylineStations, resamplePolyline, routeSearch, smoothCurves, turnRadius} from '../lib/route.js';
import assert from 'node:assert/strict';
import {createDesign} from '../lib/design.js';
import {planTopo} from '../../viewer/lib/model.js';
import test from 'node:test';


// Search for a plan's route
function search(plan, args, ...searchArgs) {
    return routeSearch(planTopo(plan), createDesign(plan, args), ...searchArgs);
}


test('polylineStations', () => {
    assert.deepEqual(plain(polylineStations([0, 3, 3, 10], [0, 4, 4, 4])), [0, 5, 5, 12]);
    assert.deepEqual(plain(polylineStations(expected.arc.x, expected.arc.y)), expected.arc.stations);
    assert.deepEqual(plain(polylineStations([5], [5])), [0]);
});


test('resamplePolyline', () => {
    // 120 feet of polyline at a 7 foot interval is 19 points, 6.67 feet apart - a repeated point is fine
    const {x, y, stations} = resamplePolyline([0, 30, 30, 100], [0, 40, 40, 40], 7);
    assert.deepEqual(plain({x, y, stations}), expected.resample);
    assert.equal(stations.length, 19);
    assert.deepEqual([x[0], y[0], stations[0], x[18], y[18], stations[18]], [0, 0, 0, 100, 40, 120]);
    assert.ok(Math.abs(stations[1] - 120 / 18) < 1e-12);

    // A polyline shorter than the interval is its end points
    assert.deepEqual(plain(resamplePolyline([0, 3], [0, 4], 10)), {'x': [0, 3], 'y': [0, 4], 'stations': [0, 5]});
});


test('turnRadius', () => {
    // A quarter circle arc of radius 100 - the ends have no radius
    const radius = turnRadius(expected.arc.x, expected.arc.y);
    assert.deepEqual(plain(radius), expected.arc.radius);
    assert.deepEqual([radius[0], radius[19]], [Infinity, Infinity]);
    assert.ok(radius.slice(1, -1).every((value) => Math.abs(value - 100) < 1e-4));

    // A straight run has no radius
    assert.deepEqual(plain(turnRadius([0, 1, 2, 3], [0, 1, 2, 3])), [null, null, null, null]);
    assert.deepEqual(plain(turnRadius([0, 10, 10], [0, 0, 10])), [null, 7.0710678118654755, null]);
});


test('smoothCurves', () => {
    // A right angle is smoothed to the minimum radius (and 10% more) - the end points are kept
    const {x, y} = smoothCurves([[0, 0], [100, 0], [100, 100]], 5, 30);
    assert.deepEqual(plain({x, y}), {'x': expected.smooth.x, 'y': expected.smooth.y});
    assert.deepEqual([x.length, x[0], y[0], x.at(-1), y.at(-1)], [41, 0, 0, 100, 100]);
    const radiusMin = Math.min(...turnRadius(x, y).slice(2, -2));
    assert.equal(radiusMin, expected.smooth.minRadius);
    assert.ok(radiusMin >= 33 && radiusMin < 34);

    // A polyline that needs no smoothing is only resampled
    const resampled = smoothCurves([[0, 0], [50, 0], [60, 30]], 10, 5);
    assert.deepEqual(plain(resampled), expected['smooth-none']);
    const polyline = resamplePolyline([0, 50, 60], [0, 0, 30], 10);
    assert.deepEqual(plain(resampled), plain({'x': polyline.x, 'y': polyline.y}));
});


test('routeSearch', () => {
    // A 20% plane needs a switchback route to climb at the design grade - the route starts and ends at the points
    const plane = planePlan({'rise': 0.2, 'size': 31});
    let route = search(plane, designArgs(), [50, 50], [150, 250], 1, 1);
    assert.deepEqual(route, expected['route-plane']);
    assert.equal(route.lattice, 23.5);
    assert.deepEqual([route.path[0], route.path.at(-1)], [[50, 50], [150, 250]]);

    // A start heading (a previous leg's), and stricter grades
    route = search(plane, designArgs(), [50, 50], [150, 250], 1, 1, 4, 0.01, 0.005);
    assert.deepEqual(route, expected['route-plane-heading']);
    assert.notDeepEqual(route.path, expected['route-plane'].path);

    // The grade and side slope weights
    route = search(plane, designArgs({'grade': 8}), [50, 50], [250, 250], 3, 0.25, null, 0, 0.03);
    assert.deepEqual(route, expected['route-plane-weights']);
});


test('routeSearch, streams, rock, and an exclusion area', () => {
    const route = search(hillPlan(), designArgs(), [20, 20], [180, 185], 1, 1);
    assert.deepEqual(route, expected['route-hill']);

    // The route is around the exclusion area
    assert.ok(route.path.every(([x, y]) => !(x > 70 && x < 90 && y > 30 && y < 60)));

    // The other way, with a wider road
    assert.deepEqual(search(hillPlan(), designArgs({'width': 6}), [180, 185], [20, 20], 1, 1), expected['route-hill-west']);
});


test('routeSearch, no route', () => {
    // An exclusion area across the site
    assert.equal(expected['route-blocked'].error, 'error: no route found (blocked by exclusion areas or the topography boundary?)');
    assert.equal(search(blockedPlan(), designArgs(), [20, 20], [180, 180], 1, 1), null);
});
