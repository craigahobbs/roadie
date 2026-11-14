import {blockedPlan, designArgs, expected, hillPlan, plain, planePlan, roadPlan} from './roadFixtures.js';
import {followRoads, polylineStations, resamplePolyline, routeSearch, smoothCurves, turnRadius} from '../lib/route.js';
import assert from 'node:assert/strict';
import {createDesign} from '../lib/design.js';
import {lineIndex} from '../lib/roads.js';
import {planTopo} from '../../viewer/lib/model.js';
import test from 'node:test';


// Search for a plan's route - without existing roads, none of the path is one
function search(plan, args, ...searchArgs) {
    const route = routeSearch(planTopo(plan), createDesign(plan, args), ...searchArgs);
    if (route === null) {
        return null;
    }
    const {existing, ...pathRoute} = route;
    assert.deepEqual(existing, new Array(route.path.length).fill(false));
    return pathRoute;
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
    const {x, y, ranges} = smoothCurves([[0, 0], [100, 0], [100, 100]], 5, 30);
    assert.deepEqual(ranges, []);
    assert.deepEqual(plain({x, y}), {'x': expected.smooth.x, 'y': expected.smooth.y});
    assert.deepEqual([x.length, x[0], y[0], x.at(-1), y.at(-1)], [41, 0, 0, 100, 100]);
    const radiusMin = Math.min(...turnRadius(x, y).slice(2, -2));
    assert.equal(radiusMin, expected.smooth.minRadius);
    assert.ok(radiusMin >= 33 && radiusMin < 34);

    // A polyline that needs no smoothing is only resampled
    const resampled = smoothCurves([[0, 0], [50, 0], [60, 30]], 10, 5);
    assert.deepEqual(plain(resampled), {...expected['smooth-none'], 'ranges': []});
    const polyline = resamplePolyline([0, 50, 60], [0, 0, 30], 10);
    assert.deepEqual(plain(resampled), plain({'x': polyline.x, 'y': polyline.y, 'ranges': []}));
});


// Search for a plan's route from its start point to its end point, following its existing roads - returns the route
// and the roads' index
function searchRoads(plan) {
    const topo = planTopo(plan);
    const roads = lineIndex(topo.features, 'road', 100);
    const route = routeSearch(
        topo, createDesign(plan, designArgs()), [plan.start.x, plan.start.y], [plan.end.x, plan.end.y], 1, 1, null, 0.03, 0, roads
    );
    return {route, roads};
}


// A path's points along a line of the lattice - "count" points from a point, "dx" and "dy" lattice steps apart
function latticeLine(x, y, dx, dy, count) {
    return Array.from({'length': count}, (unused, ix) => [x + ix * dx * 23.5, y + ix * dy * 23.5]);
}


test('smoothCurves, existing roads', () => {
    // A right angle within an existing road is the road's - the right angle after it is smoothed. The existing road's
    // last point is smoothed, too - it's where the road meets the new road's curve.
    const points = [[0, 0], [100, 0], [100, 100], [200, 100]];
    const {x, y, ranges} = smoothCurves(points, 5, 30, [[20, 150]]);
    assert.equal(x.length, 61);
    assert.deepEqual(plain({'x': x.slice(4, 30), 'y': y.slice(4, 30)}), {
        'x': [...Array.from({'length': 17}, (unused, ix) => 20 + 5 * ix), ...new Array(9).fill(100)],
        'y': [...new Array(17).fill(0), ...Array.from({'length': 9}, (unused, ix) => 5 + 5 * ix)]
    });
    assert.deepEqual([x[30], y[30], x[40], y[40]].map((value) => Math.round(value * 10) / 10), [100.6, 49.4, 114.5, 85.5]);
    assert.ok(Math.min(...turnRadius(x, y).slice(29, -2)) >= 33);

    // The existing road's stations are the smoothed polyline's
    assert.deepEqual(ranges, [[20, 145]]);

    // The smoothed polyline is shorter - an existing road to its end is to its new end
    const toEnd = smoothCurves(points, 5, 30, [[250, 300]]);
    assert.ok(toEnd.ranges[0][1] < 297 && toEnd.ranges[0][1] === polylineStations(toEnd.x, toEnd.y).at(-1));
    assert.deepEqual([toEnd.x.at(-10), toEnd.y.at(-10)], [155, 100]);

    // An existing road that's less than two of the polyline's points isn't kept
    assert.deepEqual(smoothCurves(points, 5, 30, [[21, 24], [400, 500], [52, 49]]).ranges, []);
});


test('smoothCurves, a junction with an existing road', () => {
    // A new road meets an existing road at a right angle - the corner is the junction's curve, so the existing road
    // starts where the curve ends (the curve is new road, 33 feet of it along the existing road)
    const corner = [[0, 0], [100, 0], [100, 300]];
    const {x, y, ranges} = smoothCurves(corner, 5, 30, [[100, 400]]);
    assert.deepEqual(ranges.map(([start, end]) => [Math.round(start * 10) / 10, Math.round(end * 10) / 10]), [[132.8, 377.8]]);
    assert.ok(Math.min(...turnRadius(x, y).slice(2, -2)) >= 33);
    assert.deepEqual([x[31], y[31], x.at(-1), y.at(-1)], [100, 55, 100, 300]);
    assert.equal(ranges[0][1], polylineStations(x, y).at(-1));

    // An existing road from the polyline's start - its end at the corner is the junction's curve
    const fromStart = smoothCurves(corner, 5, 30, [[0, 100]]);
    assert.deepEqual(fromStart.ranges, [[0, 45]]);
    assert.ok(Math.min(...turnRadius(fromStart.x, fromStart.y).slice(2, -2)) >= 33);

    // An existing road with a corner of its own, away from its ends, keeps it
    const within = smoothCurves(corner, 5, 30, [[95, 110]]);
    assert.deepEqual(within.ranges, [[95, 110]]);
    assert.deepEqual([within.x[20], within.y[20]], [100, 0]);

    // A short existing road at the corner is all the junction's curve - it's new road
    const short = smoothCurves(corner, 5, 30, [[100, 110]]);
    assert.deepEqual(short.ranges, []);
    assert.ok(Math.min(...turnRadius(short.x, short.y).slice(2, -2)) >= 33);

    // An existing road that's all tight curves - the junction's curve is at most four of the minimum radius (24 points)
    const zigzag = [[0, 0], [100, 0], ...Array.from({'length': 40}, (unused, ix) => [110 + ix * 10, ix % 2 === 0 ? 10 : 0])];
    const tight = smoothCurves(zigzag, 5, 30, [[100, 1000]]);
    const stations = polylineStations(tight.x, tight.y);
    assert.equal(tight.x.length, 135);
    assert.deepEqual(tight.ranges, [[stations[21 + 24], stations[134]]]);
    assert.ok(Math.min(...turnRadius(tight.x, tight.y).slice(47, -2)) < 10);
});


test('routeSearch, existing roads', () => {
    // An existing road, east and then north to the end point, is cheaper than a new road straight there - the route is
    // a new road east to the existing road, and then it follows it around its corner (the trail isn't a road)
    const {route} = searchRoads(roadPlan());
    assert.deepEqual(route.path, [...latticeLine(47, 47, 1, 0, 12), ...latticeLine(329, 94, 0, 1, 12)]);
    assert.deepEqual(route.existing, [...new Array(5).fill(false), ...new Array(19).fill(true)]);
    assert.deepEqual([route.lattice, route.heading], [23.5, 4]);

    // An all-new road is straight there
    const plan = roadPlan();
    const args = [[plan.start.x, plan.start.y], [plan.end.x, plan.end.y], 1, 1];
    const allNew = routeSearch(planTopo(plan), createDesign(plan, designArgs()), ...args);
    assert.deepEqual(allNew.path, [[47, 47], ...latticeLine(70.5, 94, 1, 1, 12)]);
    assert.deepEqual(allNew.existing, new Array(13).fill(false));

    // An exclusion area over the existing road - the route is a new road around it, to the road beyond it
    plan.topography.features.push(
        {'type': 'exclusion', 'points': [{'x': 200, 'y': 20}, {'x': 260, 'y': 20}, {'x': 260, 'y': 80}, {'x': 200, 'y': 80}]}
    );
    const excluded = searchRoads(plan).route;
    assert.deepEqual(excluded.existing, [...new Array(8).fill(false), ...new Array(5).fill(true)]);
    assert.deepEqual(excluded.path.slice(7), latticeLine(329, 235, 0, 1, 6));
    assert.ok(excluded.path.every(([x, y]) => !(x >= 200 && x <= 260 && y >= 20 && y <= 80)));
});


test('routeSearch, between existing roads', () => {
    // Two existing roads, two lattice rows apart - the route from one to the other is a new road between them (a move
    // from a road to another isn't along a road)
    const plan = roadPlan([[47, 47], [329, 47]]);
    plan.topography.features.push({'type': 'road', 'points': [{'x': 47, 'y': 94}, {'x': 329, 'y': 94}]});
    plan.end = {'x': 329, 'y': 94};
    const {route} = searchRoads(plan);
    assert.deepEqual(route.path, [[47, 47], [70.5, 70.5], ...latticeLine(117.5, 94, 1, 0, 10)]);
    assert.deepEqual(route.existing, [false, false, false, ...new Array(9).fill(true)]);
});


test('routeSearch, an existing road\'s stream crossing', () => {
    // An existing road the long way around - a new road straight to the end point is cheaper
    const plan = roadPlan([[47, 188], [47, 329], [141, 329], [141, 188]]);
    plan.start = {'x': 47, 'y': 188};
    plan.end = {'x': 141, 'y': 188};
    let {route} = searchRoads(plan);
    assert.deepEqual(route.path, latticeLine(47, 188, 1, 0, 5));
    assert.deepEqual(route.existing, new Array(5).fill(false));

    // A stream between the points, with costly culverts - the existing road has its own crossing, so the route follows
    // it, around its corners
    plan.topography.features.push({'type': 'stream', 'points': [{'x': 94, 'y': 0}, {'x': 94, 'y': 400}]});
    plan.costRates = {'culvertEnds': 100000};
    ({route} = searchRoads(plan));
    assert.deepEqual(route.path, [
        ...latticeLine(47, 188, 0, 1, 5), [70.5, 329], [94, 329], ...latticeLine(141, 305.5, 0, -1, 6)
    ]);
    assert.deepEqual(route.existing, [false, ...new Array(12).fill(true)]);
});


test('followRoads', () => {
    // An existing road that isn't on the route search's lattice - the route's points along it are moved onto it, and
    // it's an existing road from a transition's length after the route joins it, to the route's end
    const plan = roadPlan([[100, 60], [340, 60], [340, 340]]);
    const {route, roads} = searchRoads(plan);
    assert.deepEqual(route.path, [...latticeLine(47, 47, 1, 0, 12), ...latticeLine(329, 94, 0, 1, 12)]);
    assert.deepEqual(route.existing, [false, false, false, ...new Array(21).fill(true)]);
    const {points, ranges} = followRoads(route.path, route.existing, roads, 23.5, 100, 50);
    assert.deepEqual(points, [
        [47, 47], [70.5, 47], [100, 60], ...latticeLine(117.5, 60, 1, 0, 9), ...latticeLine(340, 94, 0, 1, 11), [329, 352.5]
    ]);
    assert.deepEqual(ranges.map(([start, end]) => [Math.round(start * 10) / 10, Math.round(end * 10) / 10]), [[105.7, 570.6]]);
    assert.equal(ranges[0][1], polylineStations(points.map((point) => point[0]), points.map((point) => point[1])).at(-1));

    // The path isn't changed
    assert.deepEqual(route.path[2], [94, 47]);

    // Runs along existing roads - from the path's start, between new roads, and to the path's end. A run shorter than
    // the minimum length, less its transitions, isn't an existing road - it's a new road, where the path is.
    const path = latticeLine(94, 47, 1, 0, 11);
    const flags = (text) => Array.from(text, (flag) => flag === '1');
    const followed = followRoads(path, flags('01110011101'), roads, 23.5, 40, 10);
    assert.deepEqual(followed.points, [
        [94, 47], [117.5, 60], [141, 60], [164.5, 60], [188, 47], [211.5, 60], [235, 60], [258.5, 60], [282, 60], [305.5, 47], [329, 47]
    ]);
    assert.deepEqual(
        followed.ranges.map(([start, end]) => [Math.round(start * 10) / 10, Math.round(end * 10) / 10]),
        [[0, 63.9], [137.6, 188.1]]
    );

    // A path without existing roads
    assert.deepEqual(followRoads(path, flags('00000000000'), roads, 23.5, 40, 10), {'points': path, 'ranges': []});
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
