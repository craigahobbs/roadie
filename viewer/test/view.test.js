import {planTopo, validatePlan} from '../lib/model.js';
import {projection, smoothLimitsCanvas, visibleCells} from '../lib/view3d.js';
import {Explorer} from '../lib/explore.js';
import {PlanData} from '../lib/planData.js';
import {argsParse} from '../lib/args.js';
import assert from 'node:assert/strict';
import {buildDoc} from '../lib/doc.js';
import {buildReport} from '../lib/report.js';
import {fixturePlan} from './fixture.js';
import {opsToSvg} from '../lib/canvas.js';
import test from 'node:test';


function fixtureData() {
    return new PlanData(validatePlan(fixturePlan()).plan, 'plans/fixture.json');
}


test('buildReport', () => {
    const data = fixtureData();
    const globals = {'vFile': 'plans/fixture.json'};
    const report = buildReport(data, globals, argsParse(globals), 976);
    assert.equal(report.title, 'Fixture Plan');
    const {html} = report;
    assert.ok(html.startsWith('<h1 id="fixture-plan">Fixture Plan</h1>\n<p>A synthetic plan for the <strong>tests</strong>.</p>'));
    assert.ok(html.includes('<a href="#var.vFile=&#039;plans%2Ffixture.json&#039;&amp;var.vOption=1">Bridge - East</a>'));
    assert.ok(html.includes(
        '<svg width="976" height="737" viewBox="0 0 976 737" role="img" aria-label="Plan view of the Direct road plan option"'
    ));
    assert.ok(html.includes('aria-label="Profile of the Direct road plan option"'));
    assert.ok(html.includes('<li><p>Grade 20.9% exceeds the maximum grade (12%) from 2+11 to 3+11</p></li>'));
    assert.ok(html.includes('<td style="text-align: left">Creek culvert</td>'));
    // The SVG report's 3D views are drawn in place
    assert.equal(report.views.length, 0);
    assert.match(
        html,
        /<svg width="976" height="\d+" viewBox="[^"]*" role="img" aria-label="3D view of the Direct road plan option"[^>]*><polygon /
    );

    assert.ok(!html.includes('Terrain:'));

    // The canvas report's 3D views are empty canvases until drawn - smoothed where the canvas limits allow
    const canvasReport = buildReport(data, globals, argsParse(globals), 976, true);
    const canvases = canvasReport.html.match(
        new RegExp(
            '<canvas width="976" height="\\d+" role="img" aria-label="3D view of the Direct road plan option" style="[^"]*" ' +
            'data-view="\\d+"></canvas>',
            'g'
        )
    );
    assert.equal(canvases.length, canvasReport.views.length);
    const drawing = canvasReport.views[0].render({...smoothLimitsCanvas, 'points': 1e6});
    // The overview's 14.7 pixel grid cells are divided into 5 x 5 cells (at least 3 pixels) - all 40 x 30 grid cells
    assert.equal(drawing.step, 1);
    assert.equal(drawing.smooth, 5);
    assert.equal(drawing.elements.filter((op) => op.t === 0).length, 5 * 5 * 1200);

    // A small point limit coarsens the grid step
    const coarse = canvasReport.views[0].render({...smoothLimitsCanvas, 'points': 300});
    assert.equal(coarse.step, 3);
    assert.equal(coarse.pointLimited, true);
});


test('the explorer canvas drawing matches its SVG drawing', () => {
    const data = fixtureData();
    for (const globals of [{}, {'vZoom': 4, 'vX': 200, 'vY': 150, 'vAzimuth': 120}, {'vZoom': 8, 'vOption': 1}]) {
        const explorer = new Explorer(data, globals, argsParse(globals));
        const svg = explorer.render(800, 600);
        const svgElements = svg.slice(svg.indexOf('>') + 1, -'</svg>'.length).replace(/<a href="[^"]*">.*?<\/a>/, '');
        assert.equal(opsToSvg(explorer.render(800, 600, true).ops), svgElements);
    }
});


test('the explorer keys', () => {
    const data = fixtureData();
    const globals = {'vFile': 'plans/fixture.json', 'vExplore': true};
    const explorer = new Explorer(data, globals, argsParse(globals));
    explorer.render(800, 600, true);
    const key = (code, keyValue = '', shiftKey = false) => (
        explorer.keyDown({code, 'key': keyValue, shiftKey, 'ctrlKey': false, 'metaKey': false, 'altKey': false})
    );
    assert.equal(key('KeyQ'), 'render');
    assert.equal(explorer.state.azimuth, 20);
    assert.equal(key('ArrowUp', '', true), 'render');
    assert.equal(explorer.state.tilt, 40);
    assert.equal(key('Equal', '='), 'render');
    assert.equal(explorer.state.zoom, 1.414);
    assert.equal(key('KeyD'), 'render');
    assert.equal(explorer.state.x, 248);
    assert.equal(key('KeyD'), 'render');
    assert.equal(explorer.state.x, 296);
    assert.equal(explorer.state.y, 115);
    assert.equal(key('Digit0', '0'), 'render');
    assert.equal(explorer.state.x, null);
    assert.equal(key('KeyZ'), null);
    assert.equal(explorer.keyDown({'code': 'KeyQ', 'ctrlKey': true}), null);
    assert.equal(key('Escape'), 'back');
    assert.equal(explorer.backURL(), "#var.vFile='plans%2Ffixture.json'");
    assert.equal(key('KeyG'), null);
});


test('buildDoc', () => {
    const {title, html} = buildDoc({'vDoc': true});
    assert.equal(title, 'Roadie Road Plan Model');
    assert.ok(html.startsWith('<p><a href="#var=">Back</a></p>\n<h1 id="struct-roadplan">struct RoadPlan</h1>'));
    assert.ok(html.includes('<a href="#enum-units">Units</a>'));
    assert.ok(html.includes('<h3 id="typedef-elevationrow">typedef ElevationRow</h3>'));
});


test('visibleCells', () => {
    // The MarkdownUp viewer's simple test plan - a 5 x 5 grid, 10 meters apart, rising to the north
    const elevations = [0, 1, 2, 3, 4].map((row) => [0, 1, 2, 3, 4].map(() => 100 + 0.1 * (4 - row) * 10));
    const {plan} = validatePlan({
        'title': 'Simple Plan', 'units': 'meters', 'topography': {'spacing': 10, elevations},
        'start': {'x': 0, 'y': 20}, 'end': {'x': 40, 'y': 20},
        'options': [{'name': 'Flat', 'section': {'width': 10}, 'alignment': [{'x': 0, 'y': 20, 'z': 102}, {'x': 40, 'y': 20, 'z': 102}]}]
    });
    const topo = planTopo(plan);

    // The whole site's top view sees every cell
    let view = projection(topo, {'azimuth': 0, 'tilt': 90, 'exaggeration': 1}, 400, 400);
    assert.deepEqual(visibleCells(view, topo, topo.rows, 0, 4, 0, 4), [0, 4, 0, 4]);

    // Zoomed in on the northwest corner, only its cell is visible - extended by a cell on each side
    view = projection(topo, {'azimuth': 0, 'tilt': 90, 'exaggeration': 1, 'zoom': 4, 'x': 0, 'y': 40}, 400, 400);
    assert.deepEqual(visibleCells(view, topo, topo.rows, 0, 4, 0, 4), [0, 2, 0, 2]);

    // High above the terrain, no cell is visible
    view = projection(topo, {'azimuth': 0, 'tilt': 45, 'exaggeration': 1, 'zoom': 4, 'z': 100000, 'fill': true}, 400, 400);
    assert.equal(visibleCells(view, topo, topo.rows, 0, 4, 0, 4), null);
});
