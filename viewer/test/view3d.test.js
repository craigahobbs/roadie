import {analyzeOption, elevation, planTopo, validatePlan} from '../lib/model.js';
import {complexPlan, countOf, ridgesPlan, simplePlan} from './viewFixtures.js';
import {
    finishedRows, maxZoom, project, projection, reportViews, smoothLimitsCanvas, unproject, view3D, view3DParts
} from '../lib/view3d.js';
import assert from 'node:assert/strict';
import {fixturePlan} from './fixture.js';
import {opsToSvg} from '../lib/canvas.js';
import test from 'node:test';


// The view arguments of most of the tests' views
const baseArgs = {'azimuth': 30, 'tilt': 35, 'exaggeration': 1.5};


// The text and line element attributes
const textAttr = 'font-family="sans-serif" text-anchor="middle" dominant-baseline="middle"';
const textStroke = 'stroke="white" stroke-width="3" paint-order="stroke"';
const lineAttr = 'stroke-linejoin="round" stroke-linecap="round"';


// Round a number, or an array's numbers, to six decimal places
function round6(value) {
    return Array.isArray(value) ? value.map(round6) : Math.round(value * 1e6) / 1e6;
}


// Create a plan option's scene - its validated plan, topography, analysis, half road width, and finished grade rows
function scene(planValue, ixOption = 0) {
    const {plan} = validatePlan(planValue);
    const topo = planTopo(plan);
    const analysis = analyzeOption(plan, ixOption, topo);
    const halfWidth = plan.options[ixOption].section.width * 0.5;
    return {plan, topo, ixOption, analysis, halfWidth, 'rows': finishedRows(topo, analysis.samples, halfWidth)};
}


// Create a scene's 3D drawing for view arguments
function draw({plan, topo, rows, ixOption, analysis}, viewArgs, width = 400, maxHeight = 300, canvas = false, limits = undefined) {
    return view3DParts(plan, topo, rows, ixOption, analysis, projection(topo, viewArgs, width, maxHeight), canvas, limits);
}


// Count an SVG 3D drawing's depth-sorted elements - the terrain cells and their minor and index contour paths, the road's
// quadrilaterals (those with titles are its surface), the lines by stroke color and width, and the station labels
function elementCounts(elements) {
    const counts = {'cells': 0, 'minor': 0, 'index': 0, 'quads': 0, 'titles': 0, 'lines': {}, 'labels': []};
    for (const element of elements) {
        const line = element.match(/^<polyline [^>]* stroke="([^"]*)" stroke-width="([^"]*)"/);
        if (element.includes('stroke-width="0.6"')) {
            counts.cells += 1;
            counts.minor += countOf(element, 'stroke-width="0.5"');
            counts.index += countOf(element, 'stroke-width="1.2"');
        } else if (element.startsWith('<circle')) {
            counts.labels.push(element.slice(element.indexOf('>', element.indexOf('<text')) + 1, element.lastIndexOf('<')));
        } else if (line !== null) {
            const key = `${line[1]} ${line[2]}`;
            counts.lines[key] = (counts.lines[key] ?? 0) + 1;
        } else {
            counts.quads += 1;
            counts.titles += countOf(element, '<title>');
        }
    }
    return counts;
}


// Get the report views of a plan option, with their stations rounded
function planReportViews(planValue, ixOption = 0, width = 976, smooth = false) {
    const {topo, rows, analysis, halfWidth} = scene(planValue, ixOption);
    return reportViews(topo, rows, analysis, halfWidth, width, smooth).map((reportView) => (
        {...reportView, 'station': Math.round(reportView.station), 'endStation': Math.round(reportView.endStation)}
    ));
}


// Get report views' azimuths, tilts, station ranges, and road directions
function viewpoints(views) {
    return views.map(({args, station, endStation, leftToRight}) => [args.azimuth, args.tilt, station, endStation, leftToRight]);
}


test('projection', () => {
    const {topo} = scene(simplePlan());

    // A top view - the site's center is the view's center, and higher points are nearer
    let view = projection(topo, {'azimuth': 0, 'tilt': 90, 'exaggeration': 1}, 100, 100);
    assert.equal(round6(view.scale), 1.244486);
    assert.deepEqual([view.width, view.height, view.cy, view.fullHeight, view.zoom, view.smooth], [100, 100, 50, 100, 1, false]);
    assert.deepEqual(round6(project(view, 20, 20, 102)), [50, 50, 5.3]);
    assert.deepEqual(round6(project(view, 40, 40, 104)), [74.889727, 25.110273, 3.3]);

    // A side view from the east (looking west) - north is screen right, farther west is deeper. The tilt is at least 5 degrees.
    view = projection(topo, {'azimuth': 270, 'tilt': 0, 'exaggeration': 2}, 100, 100);
    assert.deepEqual(round6(project(view, 0, 40, 102)), [74.889727, 47.60015, 20.821598]);
    assert.deepEqual(round6([view.sinTilt, view.cosTilt]), round6([Math.sin(5 * Math.PI / 180), Math.cos(5 * Math.PI / 180)]));

    // The tilt is at most 90 degrees
    view = projection(topo, {'azimuth': 0, 'tilt': 120, 'exaggeration': 1}, 100, 100);
    assert.deepEqual(round6([view.sinTilt, view.cosTilt]), [1, 0]);

    // The scale doesn't change as the view rotates
    for (const azimuth of [0, 30, 45, 60, 90, 135, 210, 330]) {
        view = projection(topo, {azimuth, 'tilt': 35, 'exaggeration': 1.5}, 100, 100);
        assert.equal(round6(view.scale), 1.244486);
        assert.deepEqual(round6([view.sinAz, view.cosAz]), round6([Math.sin(azimuth * Math.PI / 180), Math.cos(azimuth * Math.PI / 180)]));
    }

    // The view's height fits the topography (a low tilt), up to the maximum height (a top view) - the view's center is raised
    // half the marker poles' height
    view = projection(topo, {'azimuth': 30, 'tilt': 10, 'exaggeration': 1.5}, 400, 300);
    assert.deepEqual([view.height, view.cy, view.fullHeight], [240, 120, 300]);
    assert.deepEqual(round6([view.xc, view.yc, view.zc]), [20, 20, 107.2]);
    view = projection(topo, {'azimuth': 30, 'tilt': 90, 'exaggeration': 1.5}, 400, 300);
    assert.equal(view.height, 300);
    assert.equal(round6(view.scale), 4.90474);
});


test('projection, zoomed and moved views', () => {
    const {topo} = scene(simplePlan());
    const fit = projection(topo, baseArgs, 400, 300);
    let view = projection(topo, {...baseArgs, 'zoom': 4, 'x': 30, 'y': 10}, 400, 300);
    assert.equal(view.zoom, 4);
    assert.equal(round6(view.scale / fit.scale), 4);
    assert.equal(view.height, 300);

    // The view center point is on the ground, at the view center
    assert.deepEqual([view.xc, view.yc, view.zc], [30, 10, 101]);
    assert.deepEqual(round6(project(view, 30, 10, elevation(topo, 30, 10))), [200, view.cy, 0]);

    // A view center with only one coordinate is at the site's center in the other
    view = projection(topo, {...baseArgs, 'y': 10}, 400, 300);
    assert.deepEqual([view.xc, view.yc, view.zc], [20, 10, 101]);
    view = projection(topo, {...baseArgs, 'x': 30}, 400, 300);
    assert.deepEqual([view.xc, view.yc, view.zc], [30, 20, 102]);

    // A low view's fit height is short - a zoomed or moved view is up to the maximum height, trimmed to its landscape (and the
    // marker poles), so the landscape isn't surrounded by empty bands
    const lowArgs = {'azimuth': 80, 'tilt': 10, 'exaggeration': 1.5};
    assert.equal(projection(topo, lowArgs, 400, 300).height, 240);
    assert.equal(projection(topo, {...lowArgs, 'zoom': 1.414}, 400, 300).height, 271);
    assert.equal(projection(topo, {...lowArgs, 'z': 110}, 400, 300).height, 238);

    // A landscape out of view is the maximum height, with the view center at its middle
    view = projection(topo, {...lowArgs, 'z': 10000}, 400, 300);
    assert.deepEqual([view.height, view.cy], [300, 150]);

    // A view center off the topography is moved to its edge, on the ground - the zoom is at least 1
    view = projection(topo, {...baseArgs, 'zoom': 0.5, 'x': 100, 'y': 100}, 400, 300);
    assert.equal(view.zoom, 1);
    assert.equal(view.scale, fit.scale);
    assert.deepEqual([view.xc, view.yc, view.zc], [40, 40, 104]);
    view = projection(topo, {...baseArgs, 'x': -5, 'y': -5}, 400, 300);
    assert.deepEqual([view.xc, view.yc, view.zc], [0, 0, 100]);

    // An explicit elevation is kept, and the zoom is at most the maximum zoom
    view = projection(topo, {...baseArgs, 'zoom': 100, 'z': 90}, 400, 300);
    assert.equal(maxZoom, 64);
    assert.equal(view.zoom, 64);
    assert.deepEqual([view.xc, view.yc, view.zc], [20, 20, 90]);

    // A fill view (the 3D explorer's) is the maximum height, with the view center at its middle - zoomed or not
    view = projection(topo, {...lowArgs, 'fill': true, 'smooth': true}, 400, 300);
    assert.deepEqual([view.height, view.cy, view.zoom, view.smooth], [300, 150, 1, true]);
    view = projection(topo, {...lowArgs, 'zoom': 2, 'x': 30, 'y': 10, 'fill': true}, 400, 300);
    assert.deepEqual([view.height, view.cy, view.zoom, view.smooth], [300, 150, 2, false]);
});


test('unproject', () => {
    const {topo} = scene(simplePlan());
    const view = projection(topo, {...baseArgs, 'zoom': 2}, 400, 300);

    // Unprojecting a projected ground point finds the ground point
    for (const [x, y] of [[30, 10], [5, 35], [20, 20]]) {
        const [pxValue, pyValue] = project(view, x, y, elevation(topo, x, y));
        const ground = unproject(view, topo, pxValue, pyValue);
        assert.deepEqual([Math.round(ground[0] * 1000) / 1000, Math.round(ground[1] * 1000) / 1000], [x, y]);
    }

    // Pixels off the topography are clamped to it
    assert.deepEqual(unproject(view, topo, -10000, 150), [0, 40]);
    assert.deepEqual(unproject(view, topo, 10000, 150), [40, 0]);

    // A top view's pixels are a plan view's
    const top = projection(topo, {'azimuth': 0, 'tilt': 90, 'exaggeration': 1}, 100, 100);
    assert.deepEqual(round6(unproject(top, topo, 50, 50)), [20, 20]);
    assert.deepEqual(round6(unproject(top, topo, 50 + 10 * top.scale, 50 - 5 * top.scale)), [30, 25]);
});


test('finishedRows', () => {
    // An 18 meter wide road, a meter below the ground at its centerline
    const planValue = simplePlan();
    planValue.options[0].section.width = 18;
    for (const point of planValue.options[0].alignment) {
        point.z = 101;
    }
    const {topo, rows} = scene(planValue);

    // The grid points within the road (10 meters either side of its centerline) are at its grade - the uphill slope's
    // points are on the cut slope
    assert.deepEqual(rows.map((row) => round6(Array.from(row))), [
        [104, 104, 104, 104, 104],
        [102, 102, 102, 102, 102],
        [101, 101, 101, 101, 101],
        [101, 101, 101, 101, 101],
        [100, 100, 100, 100, 100]
    ]);

    // The original rows are unchanged
    assert.deepEqual(topo.rows[1], [103, 103, 103, 103, 103]);
    assert.deepEqual(topo.rows[3], [101, 101, 101, 101, 101]);

    // The ground under a bridge is unchanged - the bridge is over the grid points from 180 to 250 feet east, 60 feet north
    const bridge = scene(fixturePlan(), 1);
    const changed = [];
    for (let col = 14; col <= 27; col++) {
        if (bridge.rows[24][col] !== bridge.topo.rows[24][col]) {
            changed.push([col * 10, bridge.topo.rows[24][col], Math.round(bridge.rows[24][col] * 100) / 100]);
        }
    }
    assert.deepEqual(changed, [[140, 507.2, 506.81], [150, 507.1, 507.08], [160, 506.7, 507.99], [170, 505.5, 508.97]]);
});


test('view3DParts and view3D', () => {
    const simple = scene(simplePlan());
    const parts = draw(simple, baseArgs);
    assert.deepEqual(
        [parts.width, parts.height, parts.label, parts.smooth, parts.step, parts.pointLimited],
        [400, 300, '3D view of the Flat road plan option', 1, 1, false]
    );

    // 16 terrain cells (each with its minor and index contours), 12 road intervals of surface and two side slopes, and a
    // station label (20 m), depth-sorted, then two markers and the compass
    const {elements} = parts;
    assert.equal(elements.length, 16 + 12 * 3 + 1 + 4 + 1);
    assert.deepEqual(elementCounts(elements.slice(0, -5)), {
        'cells': 16, 'minor': 16, 'index': 16, 'quads': 36, 'titles': 12, 'lines': {}, 'labels': ['0+020']
    });

    // The farthest terrain cell (the northeast corner's) is first - its contours are two paths. The contour interval is
    // 0.2 m, and the cell's north grid points are at 104 m - so their index contour is the cell's north edge.
    assert.equal(
        elements[0],
        '<polygon points="192.7,101.5 240,85.8 267.3,119.7 220,135.4" fill="rgb(155,132,93)" stroke="rgb(155,132,93)" ' +
            'stroke-width="0.6"/><path d="M261.9 112.9L214.5 128.6M256.4 106.2L209.1 121.8M250.9 99.4L203.6 115.1M245.5 92.6L198.1 ' +
            '108.3" fill="none" stroke="rgba(70,50,30,0.45)" stroke-width="0.5" stroke-linecap="round"/>' +
            '<path d="M240 85.8L192.7 101.5" fill="none" stroke="rgba(70,50,30,0.45)" stroke-width="1.2" stroke-linecap="round"/>'
    );

    // The road surface's intervals have their end station's grade and ground elevations
    const titles = elements.filter((element) => element.includes('<title>'));
    assert.deepEqual(titles.map((element) => element.slice(element.indexOf('<title>') + 7, element.indexOf('</title>'))).sort(), [
        '0+003: grade 102.0, ground 102.0, cut 0.0', '0+007: grade 102.0, ground 102.0, cut 0.0',
        '0+010: grade 102.0, ground 102.0, cut 0.0', '0+013: grade 102.0, ground 102.0, cut 0.0',
        '0+017: grade 102.0, ground 102.0, cut 0.0', '0+020: grade 102.0, ground 102.0, cut 0.0',
        '0+023: grade 102.0, ground 102.0, cut 0.0', '0+027: grade 102.0, ground 102.0, cut 0.0',
        '0+030: grade 102.0, ground 102.0, cut 0.0', '0+033: grade 102.0, ground 102.0, cut 0.0',
        '0+037: grade 102.0, ground 102.0, cut 0.0', '0+040: grade 102.0, ground 102.0, cut 0.0'
    ]);
    assert.ok(titles.includes(
        '<polygon points="265.2,145.2 281,140 308.3,167.1 292.6,172.4" fill="rgb(139,135,126)" stroke="rgb(139,135,126)" ' +
        'stroke-width="0.5"><title>0+040: grade 102.0, ground 102.0, cut 0.0</title></polygon>'
    ));

    // The station label
    assert.equal(
        elements.find((element) => element.startsWith('<circle')),
        '<circle cx="200" cy="184.9" r="3" fill="#222" stroke="white"/><text x="206" y="175.9" font-size="11" ' +
            `${textAttr.replace('middle', 'start')} fill="#222" ${textStroke}>0+020</text>`
    );

    // The start and end markers and their default labels, then the compass - north is up and to the left
    assert.deepEqual(elements.slice(-5), [
        `<polyline points="105.3,216.3 105.3,146.4" fill="none" stroke="#1a8f3c" stroke-width="2.5" ${lineAttr}/>`,
        `<text x="105.3" y="137.4" font-size="13" ${textAttr} fill="#1a8f3c" ${textStroke} font-weight="bold">Start</text>`,
        `<polyline points="294.7,153.6 294.7,83.7" fill="none" stroke="#c0392b" stroke-width="2.5" ${lineAttr}/>`,
        `<text x="294.7" y="74.7" font-size="13" ${textAttr} fill="#c0392b" ${textStroke} font-weight="bold">End</text>`,
        '<circle cx="364" cy="36" r="22" fill="white" fill-opacity="0.8" stroke="#888"/>' +
            '<polygon points="351.2,23.3 368.2,31.7 359.8,40.3" fill="#c0392b" stroke="#c0392b" stroke-width="1"/>' +
            `<text x="372.5" y="44.5" font-size="11" ${textAttr} fill="#333" ${textStroke} font-weight="bold">N</text>`
    ]);

    // The 3D view's markup is its drawing's elements
    const {plan, topo, rows, analysis} = simple;
    assert.equal(
        view3D(plan, topo, rows, 0, analysis, projection(topo, baseArgs, 400, 300)),
        '<svg width="400" height="300" viewBox="0 0 400 300" role="img" aria-label="3D view of the Flat road plan option" ' +
            'style="background: #f4f1ea; border: 1px solid #ccc; display: block; max-width: 100%; height: auto; break-inside: avoid; ' +
            `margin: 0.75em 0 1.5em 0;">${elements.join('')}</svg>`
    );
});


test('view3DParts, a top view', () => {
    const {elements} = draw(scene(simplePlan()), {'azimuth': 0, 'tilt': 90, 'exaggeration': 1}, 100, 100);
    assert.equal(elements.length, 58);

    // The elements are sorted by depth, farthest (lowest) first - the terrain cells from the south row to the north row. Cells
    // of equal depth keep their order, west to east.
    const cells = elements.filter((element) => element.includes('stroke-width="0.6"'));
    assert.deepEqual(cells.map((element) => element.slice(element.indexOf('"') + 1, element.indexOf(' ', 10))), [
        '25.1,62.4', '37.6,62.4', '50,62.4', '62.4,62.4',
        '25.1,50', '37.6,50', '50,50', '62.4,50',
        '25.1,37.6', '37.6,37.6', '50,37.6', '62.4,37.6',
        '25.1,25.1', '37.6,25.1', '50,25.1', '62.4,25.1'
    ]);
    assert.deepEqual(elements.slice(0, 4), cells.slice(0, 4));
    assert.equal(
        elements[0],
        '<polygon points="25.1,62.4 37.6,62.4 37.6,74.9 25.1,74.9" fill="rgb(104,139,81)" stroke="rgb(104,139,81)" ' +
            'stroke-width="0.6"/><path d="M37.6 72.4L25.1 72.4M37.6 69.9L25.1 69.9M37.6 67.4L25.1 67.4M37.6 64.9L25.1 64.9" ' +
            'fill="none" stroke="rgba(70,50,30,0.45)" stroke-width="0.5" stroke-linecap="round"/>' +
            '<path d="M37.6 62.4L25.1 62.4" fill="none" stroke="rgba(70,50,30,0.45)" stroke-width="1.2" stroke-linecap="round"/>'
    );

    // The marker poles are vertical, so they're points - and the compass points up
    assert.deepEqual(elements.slice(-5).map((element) => element.slice(0, element.indexOf(' fill='))), [
        '<polyline points="25.1,50 25.1,50"',
        `<text x="25.1" y="41" font-size="13" ${textAttr}`,
        '<polyline points="74.9,50 74.9,50"',
        `<text x="74.9" y="41" font-size="13" ${textAttr}`,
        '<circle cx="64" cy="36" r="22"'
    ]);
    assert.ok(elements[57].includes('<polygon points="64,18 70,36 58,36" fill="#c0392b" stroke="#c0392b" stroke-width="1"/>'));
    const north = `<text x="64" y="48" font-size="11" ${textAttr} fill="#333" ${textStroke} font-weight="bold">N</text>`;
    assert.ok(elements[57].endsWith(north));

    // The canvas drawing's markers and compass
    const canvas = draw(scene(simplePlan()), {'azimuth': 0, 'tilt': 90, 'exaggeration': 1}, 100, 100, true);
    assert.equal(canvas.elements.length, 16 + 36 + 2 + 7);
    assert.deepEqual(canvas.elements.slice(-3), [
        {'t': 4, 'x': 64, 'y': 36, 'r': 22, 'f': 'white', 's': '#888', 'w': null, 'o': 0.8},
        {'t': 1, 'c': [64, 18, 70, 36, 58, 36], 'f': '#c0392b', 's': '#c0392b', 'w': 1, 'title': null, 'd': null},
        {'t': 3, 'text': 'N', 'x': 64, 'y': 48, 'size': 11, 'anchor': 'middle', 'f': '#333', 'bold': true}
    ]);
    assert.deepEqual(
        canvas.elements.slice(-7, -3).map((op) => [op.t, op.text ?? op.s, op.x ?? Array.from(op.c, Math.round)]),
        [
            [2, '#1a8f3c', [25, 50, 25, 50]], [3, 'Start', 25.110272542658173],
            [2, '#c0392b', [75, 50, 75, 50]], [3, 'End', 74.88972745734182]
        ]
    );
});


test('view3DParts, a zoomed view', () => {
    // Only the terrain cells (8), road polygons (12 of 36), and station label within the zoomed view are drawn - the markers
    // and the compass are always drawn
    const zoomArgs = {...baseArgs, 'zoom': 4, 'x': 30, 'y': 10};
    const {elements, height} = draw(scene(simplePlan()), zoomArgs);
    assert.equal(height, 300);
    assert.equal(elements.length, 8 + 12 + 1 + 4 + 1);
    assert.deepEqual(elementCounts(elements.slice(0, -5)), {
        'cells': 8, 'minor': 8, 'index': 8, 'quads': 12, 'titles': 6, 'lines': {}, 'labels': ['0+030']
    });

    // The marker poles are the same height on screen as the unzoomed view's
    const poleHeights = [-5, -3].map((ixElement) => {
        const [, y1, , y2] = elements.at(ixElement).match(/points="([^"]*)"/)[1].split(/[, ]/);
        return Math.round(y1 - y2);
    });
    assert.deepEqual(poleHeights, [70, 70]);

    // Only the near stream, within the zoomed view, is drawn - the far stream is outside its ground area
    const planValue = simplePlan();
    planValue.topography.features = [
        {'type': 'stream', 'name': 'Far Creek', 'points': [{'x': 0, 'y': 40}, {'x': 2, 'y': 30}]},
        {'type': 'stream', 'name': 'Near Creek', 'points': [{'x': 30, 'y': 0}, {'x': 30, 'y': 20}]}
    ];
    const streams = scene(planValue);
    assert.deepEqual(elementCounts(draw(streams, zoomArgs).elements.slice(0, -5)), {
        'cells': 8, 'minor': 8, 'index': 8, 'quads': 12, 'titles': 6, 'lines': {'#2a6fdb 2.5': 4}, 'labels': ['0+030']
    });

    // The unzoomed view draws both streams - in steps of half a terrain cell
    assert.deepEqual(elementCounts(draw(streams, baseArgs).elements.slice(0, -5)).lines, {'#2a6fdb 2.5': 3 + 4});
});


test('view3DParts, a narrow road', () => {
    const planValue = simplePlan();
    planValue.options[0].section.width = 0.1;
    const narrow = scene(planValue);

    // The narrow road is also drawn as a highlighted centerline - a halo and a line for each of the 12 road intervals
    const {elements} = draw(narrow, baseArgs);
    assert.equal(elements.length, 16 + 12 * 3 + 12 * 2 + 1 + 4 + 1);
    assert.deepEqual(elementCounts(elements.slice(0, -5)), {
        'cells': 16, 'minor': 16, 'index': 16, 'quads': 36, 'titles': 12, 'lines': {'white 6': 12, '#d6246e 3': 12}, 'labels': ['0+020']
    });

    // Each interval's line is drawn after (nearer than) its halo and its neighbors' halos
    const halos = elements.filter((element) => element.includes('stroke="white" stroke-width="6"'));
    const lineAttrs = 'stroke="#d6246e" stroke-width="3"';
    const lines = elements.filter((element) => element.includes(lineAttrs));
    assert.deepEqual(lines.map((line) => line.replace(lineAttrs, 'stroke="white" stroke-width="6"')).sort(), halos.toSorted());
    for (const line of lines) {
        const [start, end] = line.slice(line.indexOf('"') + 1, line.indexOf('" ')).split(' ');
        const nearHalos = halos.filter((halo) => halo.includes(start) || halo.includes(end));
        assert.ok(nearHalos.length >= 2);
        assert.ok(nearHalos.every((halo) => elements.indexOf(halo) < elements.indexOf(line)));
    }

    // Zoomed in until the road is at least 4 pixels wide, it has no centerline - a zoomed view has only the centerline of the
    // intervals within it (those of its two station labels' samples)
    assert.deepEqual(elementCounts(draw(narrow, {...baseArgs, 'zoom': 8}, 1200, 900).elements.slice(0, -5)).lines, {});
    assert.deepEqual(
        elementCounts(draw(narrow, {...baseArgs, 'zoom': 4, 'x': 30, 'y': 10}).elements.slice(0, -5)).lines,
        {'white 6': 3, '#d6246e 3': 3}
    );
});


test('view3DParts, features and structures', () => {
    const complex = scene(complexPlan());
    const {elements} = draw(complex, baseArgs);
    assert.equal(elements.length, 220);

    // The 64 terrain cells' contours - an index contour crosses three of every eight rows of cells. The streams are solid lines
    // (the first begins beyond the topography), and the rock outcrop's and exclusion area's outlines are dashed. Each culvert is
    // a line across the road - the culvert beyond the end of the road is at its end
    assert.deepEqual(elementCounts(elements.slice(0, -5)), {
        'cells': 64,
        'minor': 63,
        'index': 36,
        'quads': 76,
        'titles': 26,
        'lines': {'#2a6fdb 2.5': 48, '#555555 1': 12, 'rgba(208,49,45,0.55) 1': 12, '#2a6fdb 4': 2},
        'labels': ['0+50']
    });
    const dashed = elements.filter((element) => element.includes('stroke-dasharray'));
    assert.equal(dashed.length, 24);
    assert.ok(dashed.every((element) => element.endsWith(` ${lineAttr} stroke-dasharray="4 3"/>`)));

    // The road's quadrilaterals - 26 intervals of surface (one is the bridge's deck), the bridge's two sides, seven wall
    // intervals, and the side slopes (there are none outside the topography)
    const quads = elements.slice(0, -5).filter((element) => element.startsWith('<polygon') && !element.includes('stroke-width="0.6"'));
    const fills = quads.map((element) => element.match(/ fill="([^"]*)"/)[1]);
    assert.equal(fills.filter((fill) => fill === 'rgb(128,128,126)').length, 7);
    assert.equal(fills.filter((fill) => fill === 'rgb(96,83,70)').length, 2);
    assert.equal(fills.filter((fill) => fill === 'rgb(119,103,87)').length, 1);
    const titles = quads.filter((element) => element.includes('<title>')).map(
        (element) => element.slice(element.indexOf('<title>') + 7, element.indexOf('</title>'))
    );
    assert.ok(titles.includes('0+40: grade 114.0, ground 116.0, cut 2.0'));
    assert.ok(titles.includes('0+80: grade 125.4, ground 117.6, fill 7.8'));
    assert.ok(quads.some((element) => element.includes('fill="rgb(119,103,87)"') && element.includes('<title>0+50: grade 116.0, ')));

    // The start point is beyond the topography, so its marker pole is at the lowest elevation - with the start point's label
    const [startX, startY] = project(projection(complex.topo, baseArgs, 400, 300), -15, 20, 100);
    assert.deepEqual([Math.round(startX * 10) / 10, Math.round(startY * 10) / 10], [137.5, 274.7]);
    assert.deepEqual(elements.slice(-5, -1), [
        `<polyline points="137.5,274.7 137.5,241.2" fill="none" stroke="#1a8f3c" stroke-width="2.5" ${lineAttr}/>`,
        `<text x="137.5" y="232.2" font-size="13" ${textAttr} fill="#1a8f3c" ${textStroke} font-weight="bold">Road</text>`,
        `<polyline points="233.7,100.9 233.7,67.5" fill="none" stroke="#c0392b" stroke-width="2.5" ${lineAttr}/>`,
        `<text x="233.7" y="58.5" font-size="13" ${textAttr} fill="#c0392b" ${textStroke} font-weight="bold">End</text>`
    ]);

    // The option without structures has no culverts, walls, or bridge
    const other = draw(scene(complexPlan(), 1), baseArgs);
    assert.equal(other.label, '3D view of the Alt road plan option');
    const otherCounts = elementCounts(other.elements.slice(0, -5));
    assert.deepEqual(otherCounts.lines, {'#2a6fdb 2.5': 48, '#555555 1': 12, 'rgba(208,49,45,0.55) 1': 12});
    assert.deepEqual([otherCounts.quads, otherCounts.titles], [71, 21]);
    assert.ok(!other.elements.some((element) => element.includes('fill="rgb(128,128,126)"')));
});


test('view3DParts, a bridge and an existing road', () => {
    const {elements} = draw(scene(fixturePlan(), 1), baseArgs, 976, 732);
    const counts = elementCounts(elements.slice(0, -5));

    // The road's 140 intervals of surface, the bridge's 26 intervals of two sides, and the side slopes of the 114 other
    // intervals - less the existing road's 29 intervals, which have none
    assert.deepEqual([counts.cells, counts.titles, counts.quads - counts.titles], [1200, 140, 26 * 2 + (114 - 29) * 2]);
    assert.deepEqual(counts.labels, ['4+00', '2+00']);
    assert.deepEqual(counts.lines, {'#2a6fdb 2.5': 60, '#555555 1': 48, 'rgba(208,49,45,0.55) 1': 32});

    // The existing road's intervals - the road is on the ground, whatever its alignment's elevations
    const titles = elements.filter((element) => element.includes('<title>')).map(
        (element) => element.slice(element.indexOf('<title>') + 7, element.indexOf('</title>'))
    );
    const existing = titles.filter((title) => title.includes(' (existing road): '));
    assert.equal(existing.length, 29);
    assert.ok(existing.includes('3+97 (existing road): grade 535.5, ground 535.5, cut 0.0'));
    assert.ok(existing.every((title) => title.endsWith(', cut 0.0')));
    assert.ok(titles.includes('4+64: grade 533.4, ground 533.4, cut 0.0'));

    // Their surface is the existing road's gray, shaded by the ground it follows
    const existingFills = {};
    for (const element of elements.filter((item) => item.includes(' (existing road): '))) {
        const [, fill] = element.match(/fill="([^"]*)"/);
        existingFills[fill] = (existingFills[fill] ?? 0) + 1;
    }
    assert.deepEqual(existingFills, {
        'rgb(104,102,97)': 7, 'rgb(104,102,96)': 5, 'rgb(103,102,96)': 5, 'rgb(103,101,95)': 1, 'rgb(102,100,95)': 5,
        'rgb(101,99,94)': 5, 'rgb(100,98,92)': 1
    });
});


test('view3DParts, a view with nothing in it', () => {
    // High above the terrain, only the markers and the compass are drawn - and a culvert, which is always drawn
    const farArgs = {...baseArgs, 'zoom': 4, 'z': 100000, 'fill': true};
    const bridge = draw(scene(fixturePlan(), 1), farArgs, 976, 732);
    assert.deepEqual(
        bridge.elements.map((element) => element.slice(0, element.indexOf(' '))),
        ['<polyline', '<text', '<polyline', '<text', '<circle']
    );
    assert.deepEqual([bridge.height, bridge.smooth, bridge.step, bridge.pointLimited], [732, 1, 1, false]);
    const culvert = draw(scene(fixturePlan(), 0), farArgs, 976, 732);
    assert.equal(culvert.elements.length, 6);
    assert.ok(culvert.elements[0].endsWith(` fill="none" stroke="#2a6fdb" stroke-width="4" ${lineAttr}/>`));

    // The canvas drawing, too - its terrain isn't limited
    const canvas = draw(scene(fixturePlan(), 1), {...farArgs, 'smooth': true}, 976, 732, true, smoothLimitsCanvas);
    assert.deepEqual(canvas.elements.map((op) => op.t), [2, 3, 2, 3, 4, 1, 3]);
    assert.deepEqual([canvas.smooth, canvas.step, canvas.pointLimited], [1, 1, false]);
});


test('view3DParts, the terrain grid step', () => {
    // A long site - 250 x 3 grid points
    const elevations = [0, 1, 2].map(() => Array.from({'length': 250}, (unused, col) => 100 + col * 0.1));
    const long = scene({
        'title': 'Long Plan',
        'units': 'feet',
        'topography': {'spacing': 10, elevations},
        'start': {'x': 0, 'y': 10},
        'end': {'x': 2490, 'y': 10},
        'options': [{'name': 'Long', 'section': {'width': 12}, 'alignment': [{'x': 0, 'y': 10}, {'x': 2490, 'y': 10}]}]
    });
    const topArgs = {'azimuth': 0, 'tilt': 90, 'exaggeration': 1};

    // The SVG drawing has at most 240 terrain cells per side, so its cells span two grid cells
    const svg = draw(long, topArgs, 1000, 400);
    assert.deepEqual([svg.step, svg.smooth, svg.pointLimited], [2, 1, false]);
    assert.equal(elementCounts(svg.elements.slice(0, -5)).cells, 125);

    // The canvas drawing's terrain is every grid cell, if its point limit allows
    const cellCount = (drawing) => drawing.elements.filter((op) => op.t === 0).length;
    let canvas = draw(long, {...topArgs, 'smooth': true}, 1000, 400, true, smoothLimitsCanvas);
    assert.deepEqual([canvas.step, canvas.smooth, canvas.pointLimited, cellCount(canvas)], [1, 1, false, 498]);
    canvas = draw(long, {...topArgs, 'smooth': true}, 1000, 400, true, {...smoothLimitsCanvas, 'points': 300});
    assert.deepEqual([canvas.step, canvas.smooth, canvas.pointLimited, cellCount(canvas)], [2, 1, true, 125]);
    canvas = draw(long, {...topArgs, 'smooth': true}, 1000, 400, true, {...smoothLimitsCanvas, 'points': 100});
    assert.deepEqual([canvas.step, canvas.smooth, canvas.pointLimited, cellCount(canvas)], [3, 1, true, 83]);
    const svgLimited = draw(long, topArgs, 1000, 400, false, {...smoothLimitsCanvas, 'points': 100});
    assert.equal(opsToSvg(canvas.elements), svgLimited.elements.join(''));
});


test('view3DParts, minor contours and smooth terrain', () => {
    const fixture = scene(fixturePlan());

    // The minor contours are drawn only where the grid cells are at least 6 pixels
    let counts = elementCounts(draw(fixture, baseArgs, 976, 732).elements.slice(0, -5));
    assert.deepEqual([counts.cells, counts.minor, counts.index], [1200, 488, 120]);
    counts = elementCounts(draw(fixture, baseArgs, 300, 225).elements.slice(0, -5));
    assert.deepEqual([counts.cells, counts.minor, counts.index], [1200, 0, 120]);

    // A smooth SVG view divides each grid cell into cells of at least 12 pixels - at most four per side (a zoomed view draws
    // only the cells within it)
    const smoothArgs = {...baseArgs, 'smooth': true};
    let drawing = draw(fixture, smoothArgs, 976, 732);
    assert.deepEqual([drawing.smooth, drawing.step, drawing.pointLimited], [2, 1, false]);
    assert.equal(elementCounts(drawing.elements.slice(0, -5)).cells, 4 * 1200);
    drawing = draw(fixture, {...smoothArgs, 'zoom': 8}, 976, 732);
    assert.deepEqual([drawing.smooth, drawing.step, drawing.pointLimited], [4, 1, false]);
    assert.equal(elementCounts(drawing.elements.slice(0, -5)).cells, 759);

    // A smooth canvas view's cells are at least 3 pixels (the grid cells are 19 pixels) - at most eight per side
    drawing = draw(fixture, smoothArgs, 976, 732, true, smoothLimitsCanvas);
    assert.deepEqual([drawing.smooth, drawing.step, drawing.pointLimited], [7, 1, false]);
    assert.equal(drawing.elements.filter((op) => op.t === 0).length, 49 * 1200);
    drawing = draw(fixture, {...smoothArgs, 'zoom': 2}, 976, 732, true, smoothLimitsCanvas);
    assert.deepEqual([drawing.smooth, drawing.step, drawing.pointLimited], [8, 1, false]);

    // Grid cells under 8 pixels aren't smoothed in a canvas view - their facets are too small to see
    drawing = draw(fixture, smoothArgs, 300, 225, true, smoothLimitsCanvas);
    assert.deepEqual([drawing.smooth, drawing.step, drawing.pointLimited], [1, 1, false]);
    assert.equal(drawing.elements.filter((op) => op.t === 0).length, 1200);

    // The point limit limits the smoothing
    const faceted = draw(fixture, baseArgs, 976, 732, true, smoothLimitsCanvas);
    const smooth = draw(fixture, smoothArgs, 976, 732, true, {...smoothLimitsCanvas, 'points': 6000});
    assert.deepEqual([faceted.smooth, faceted.step, faceted.pointLimited], [1, 1, false]);
    assert.deepEqual([smooth.smooth, smooth.step, smooth.pointLimited], [2, 1, true]);

    // An SVG view's point limit doesn't set its grid step - a limit under its grid points leaves the grid as it is
    const limited = draw(fixture, smoothArgs, 976, 732, false, {'sideCells': 240, 'points': 1000, 'facetPx': 0, 'cellPx': 12, 'count': 4});
    assert.deepEqual([limited.smooth, limited.step, limited.pointLimited], [1, 1, true]);
    assert.equal(elementCounts(limited.elements.slice(0, -5)).cells, 1200);

    // The smooth terrain passes through the grid's points - every faceted cell corner is a smooth cell corner
    const corners = (drawing2) => {
        const points = new Set();
        for (const op of drawing2.elements.filter((element) => element.t === 0)) {
            for (let ix = 0; ix < 8; ix += 2) {
                points.add(`${op.c[op.o + ix].toFixed(6)},${op.c[op.o + ix + 1].toFixed(6)}`);
            }
        }
        return points;
    };
    const facetedCorners = corners(faceted);
    const smoothCorners = corners(smooth);
    assert.equal(facetedCorners.size, 41 * 31);
    assert.equal(smoothCorners.size, 81 * 61);
    assert.deepEqual(Array.from(facetedCorners).filter((corner) => !smoothCorners.has(corner)), []);
});


test('view3DParts, the canvas drawing is the SVG drawing', () => {
    const views = [
        baseArgs,
        {...baseArgs, 'zoom': 4, 'x': 30, 'y': 20, 'azimuth': 200, 'tilt': 45},
        {...baseArgs, 'zoom': 8, 'smooth': true},
        {'azimuth': 0, 'tilt': 90, 'exaggeration': 1, 'smooth': true},
        {'azimuth': 300, 'tilt': 10, 'exaggeration': 3, 'zoom': 16, 'fill': true}
    ];
    const narrowPlan = complexPlan();
    narrowPlan.options[1].section.width = 0.2;
    for (const drawScene of [scene(complexPlan()), scene(narrowPlan, 1)]) {
        for (const viewArgs of views) {
            for (const limits of [undefined, smoothLimitsCanvas, {...smoothLimitsCanvas, 'points': 50}]) {
                const svg = draw(drawScene, viewArgs, 400, 300, false, limits);
                const canvas = draw(drawScene, viewArgs, 400, 300, true, limits);
                assert.equal(opsToSvg(canvas.elements), svg.elements.join(''));
                assert.deepEqual(
                    [canvas.width, canvas.height, canvas.label, canvas.smooth, canvas.step, canvas.pointLimited],
                    [svg.width, svg.height, svg.label, svg.smooth, svg.step, svg.pointLimited]
                );
            }
        }
    }
});


test('reportViews', () => {
    // The simple plan's road is wide enough to see in its overview - the only view. The road runs east across a plane rising
    // north, so the overview looks north (upslope), at the lowest tilt
    let views = planReportViews(simplePlan());
    assert.deepEqual(views.map((reportView) => ({...reportView, 'view': null})), [{
        'args': {'azimuth': 0, 'tilt': 55, 'exaggeration': 1.5, 'zoom': 1.32, 'x': 20, 'y': 20, 'z': 102, 'smooth': false},
        'view': null,
        'station': 0,
        'endStation': 40,
        'leftToRight': true
    }]);
    assert.deepEqual([views[0].view.width, views[0].view.height, views[0].view.zoom, views[0].view.smooth], [976, 675, 1.32, false]);

    // The view's width is the report's, and its maximum height is three-quarters of it
    views = planReportViews(simplePlan(), 0, 400, true);
    assert.deepEqual([views[0].view.width, views[0].view.height, views[0].view.fullHeight, views[0].view.smooth], [400, 286, 300, true]);
    assert.equal(views[0].args.smooth, true);

    // A narrow road adds views of equal road segments, from the start to the end, in the overview's orientation - each
    // zoomed in on its segment
    const narrowPlan = simplePlan();
    narrowPlan.options[0].section.width = 0.1;
    views = planReportViews(narrowPlan);
    assert.deepEqual(viewpoints(views), [[0, 55, 0, 40, true], [0, 40, 0, 20, true], [0, 40, 20, 40, true]]);
    assert.deepEqual(views.map(({args}) => [args.zoom, args.x, args.y, args.z]), [
        [1.32, 20, 20, 102], [3.062, 10, 20, 102], [3.062, 30, 20, 102]
    ]);
    assert.deepEqual(views.map(({view}) => [view.height, view.zoom]), [[675, 1.32], [732, 3.062], [732, 3.062]]);

    // A segment's footprint is centered in its view, filling 85% of its width
    const [, {view}] = views;
    const [left] = project(view, 0, 20, 102);
    const [right] = project(view, 20, 20, 102);
    assert.ok(Math.abs((left + right) * 0.5 - 488) < 1);
    assert.ok(Math.abs((right - left) - 0.85 * 976) < 2);
});


test('reportViews, the viewpoints', () => {
    // A road running west, down the slope, is viewed looking upslope - from its right, so it runs right to left
    const west = fixturePlan([{'name': 'West', 'section': {'width': 12}, 'alignment': [{'x': 380, 'y': 250}, {'x': 20, 'y': 30}]}]);
    assert.deepEqual(viewpoints(planReportViews(fixturePlan())), [[328.6, 55, 0, 440, true]]);
    assert.deepEqual(viewpoints(planReportViews(west)), [[328.6, 55, 0, 422, false]]);

    // A ridge is viewed from the road's side, looking upslope at it
    const northRidge = simplePlan();
    northRidge.topography.elevations[1].fill(115);
    assert.deepEqual(viewpoints(planReportViews(northRidge)), [[0, 55, 0, 40, true]]);
    const southRidge = simplePlan();
    southRidge.topography.elevations[3].fill(115);
    assert.deepEqual(viewpoints(planReportViews(southRidge)), [[180, 55, 0, 40, false]]);

    // Ridges on both sides hide the road at a low tilt - the lowest tilt that shows all of the road wins. Ridges that
    // hide the road at every tilt are viewed from straight above.
    const lowRidges = simplePlan();
    lowRidges.topography.elevations[1].fill(115);
    lowRidges.topography.elevations[3].fill(115);
    assert.deepEqual(viewpoints(planReportViews(lowRidges)), [[0, 70, 0, 40, true]]);
    assert.deepEqual(viewpoints(planReportViews(ridgesPlan())), [[0, 90, 0, 40, true]]);

    // A narrow road's segment views are from straight above, too, in the overview's orientation
    const narrowRidges = ridgesPlan();
    narrowRidges.options[0].section.width = 0.1;
    assert.deepEqual(viewpoints(planReportViews(narrowRidges)), [[0, 90, 0, 40, true], [0, 90, 0, 20, true], [0, 90, 20, 40, true]]);

    // A loop's overview looks to the left of the road's first direction
    const loopPoints = [{'x': 20, 'y': 30}, {'x': 150, 'y': 30}, {'x': 150, 'y': 120}, {'x': 20, 'y': 120}, {'x': 20, 'y': 30}];
    const loop = fixturePlan([{'name': 'Loop', 'section': {'width': 12}, 'alignment': loopPoints}]);
    assert.deepEqual(viewpoints(planReportViews(loop)), [[0, 55, 0, 440, true]]);
    const loopNorth = fixturePlan([{'name': 'Loop', 'section': {'width': 12}, 'alignment': loopPoints.toReversed()}]);
    assert.deepEqual(viewpoints(planReportViews(loopNorth)), [[270, 55, 0, 440, true]]);
});


test('reportViews, the road segment views', () => {
    // A long, narrow road has at most six road segment views. Each looks across its segment from the overview's side - a
    // steeper view where the terrain hides the road
    const planValue = fixturePlan();
    planValue.options[1].section.width = 0.2;
    let views = planReportViews(planValue, 1);
    assert.deepEqual(viewpoints(views), [
        [328.6, 55, 0, 464, true],
        [347, 40, 0, 77, true],
        [350.4, 40, 77, 155, true],
        [0, 40, 155, 232, true],
        [305.4, 70, 232, 309, true],
        [304.4, 40, 309, 386, true],
        [304.4, 40, 386, 464, true]
    ]);
    assert.deepEqual(views.map(({view}) => [view.zoom, view.height]), [
        [1, 666], [6.379, 732], [6.635, 732], [6.379, 732], [7.952, 732], [6.669, 732], [6.379, 732]
    ]);

    // A wider road has fewer, longer segments
    planValue.options[1].section.width = 1;
    assert.deepEqual(viewpoints(planReportViews(planValue, 1)).map((viewpoint) => viewpoint.slice(2, 4)), [[0, 464], [0, 232], [232, 464]]);

    // A segment's view is turned at most 40 degrees from the overview's direction (looking west) - a segment running back
    // is viewed from the overview's side, so it runs right to left
    const uPoints = [{'x': 20, 'y': 250}, {'x': 180, 'y': 250}, {'x': 180, 'y': 30}, {'x': 20, 'y': 30}];
    views = planReportViews(fixturePlan([{'name': 'U', 'section': {'width': 0.5}, 'alignment': uPoints}]));
    assert.deepEqual(viewpoints(views), [
        [270, 55, 0, 540, false],
        [310, 40, 0, 108, true],
        [230, 40, 108, 216, false],
        [270, 40, 216, 324, false],
        [310, 40, 324, 432, false],
        [230, 40, 432, 540, true]
    ]);
    views = planReportViews(fixturePlan([{'name': 'U', 'section': {'width': 0.5}, 'alignment': uPoints.toReversed()}]));
    assert.deepEqual(viewpoints(views), [
        [270, 55, 0, 540, true],
        [310, 40, 0, 108, true],
        [310, 40, 108, 216, true],
        [270, 40, 216, 324, true],
        [230, 40, 324, 432, true],
        [230, 40, 432, 540, true]
    ]);
});
