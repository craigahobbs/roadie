import {Explorer, exploreStyle} from '../lib/explore.js';
import {planData, simplePlan} from './viewFixtures.js';
import {projection, smoothLimitsCanvas, view3DParts} from '../lib/view3d.js';
import {argsParse} from '../lib/args.js';
import assert from 'node:assert/strict';
import {fixturePlan} from './fixture.js';
import test from 'node:test';


// The overlay text element attributes
const textAttr = 'font-family="sans-serif" text-anchor="start" dominant-baseline="middle"';
const textStroke = 'stroke="white" stroke-width="3" paint-order="stroke"';


// The keyboard help lines
const helpLines = [
    'Arrows or W A S D - move',
    '+ / - - zoom in / out',
    'Q / E or Shift+Left / Right - rotate',
    'Shift+Up / Down - tilt (view from above / from the side)',
    'R / F or Page Up / Down - raise / lower',
    '[ / ] - less / more vertical exaggeration',
    'T - top view, N - face north, 0 - reset',
    'H - hide this help, Esc - back to the report'
];


// Create a plan's 3D explorer
function explore(planValue, globals = {'vFile': 'plans/fixture.json', 'vExplore': true}) {
    return new Explorer(planData(planValue), globals, argsParse(globals));
}


// Press a key
function press(explorer, code, key = '', shiftKey = false) {
    return explorer.keyDown({code, key, shiftKey, 'ctrlKey': false, 'metaKey': false, 'altKey': false});
}


// Press keys and get the explorer's view state values after each
function pressAll(explorer, names, keys) {
    return keys.map(([code, key, shiftKey]) => {
        assert.equal(press(explorer, code, key, shiftKey), 'render');
        return names.map((name) => explorer.state[name]);
    });
}


test('Explorer, the view arguments', () => {
    // The default view
    let explorer = explore(fixturePlan());
    assert.equal(explorer.ixOption, 0);
    assert.equal(explorer.view, null);
    assert.deepEqual(explorer.state, {
        'help': true, 'azimuth': 30, 'tilt': 35, 'exaggeration': 1.5, 'zoom': 1, 'x': null, 'y': null, 'z': null
    });
    assert.equal(explorer.backURL(), "#var.vFile='plans%2Ffixture.json'");

    // The view arguments - the report link keeps the plan and its option, but not the view
    const globals = {
        'vFile': 'plans/fixture.json', 'vExplore': true, 'vOption': 1, 'vAzimuth': 120, 'vTilt': 50, 'vExaggeration': 2, 'vZoom': 2,
        'vX': 100, 'vY': 50, 'vZ': 510
    };
    explorer = explore(fixturePlan(), globals);
    assert.equal(explorer.ixOption, 1);
    assert.deepEqual(explorer.state, {
        'help': true, 'azimuth': 120, 'tilt': 50, 'exaggeration': 2, 'zoom': 2, 'x': 100, 'y': 50, 'z': 510
    });
    assert.equal(explorer.backURL(), "#var.vFile='plans%2Ffixture.json'&var.vOption=1");
    assert.equal(explorer.analysis.name, 'Bridge - East');

    // An option index beyond the options is the last option, and a negative index is the first
    assert.equal(explore(fixturePlan(), {'vOption': 5}).ixOption, 1);
    assert.equal(explore(fixturePlan(), {'vOption': -1}).ixOption, 0);
    assert.equal(explore(fixturePlan(), {}).backURL(), '#var=');
});


test('Explorer.render, the SVG drawing', () => {
    const globals = {'vFile': 'plans/fixture.json', 'vExplore': true, 'vOption': 1, 'vAzimuth': 120, 'vZoom': 2, 'vX': 100, 'vY': 50};
    const explorer = explore(fixturePlan(), globals);
    const svg = explorer.render(800, 600);

    // The drawing fills the width and height, without margins
    assert.equal(
        exploreStyle,
        'background: #f4f1ea; border: 1px solid #ccc; display: block; max-width: 100%; height: auto; break-inside: avoid; margin: 0;'
    );
    const svgOpen = '<svg width="800" height="600" viewBox="0 0 800 600" role="img" ' +
        `aria-label="3D view of the Bridge - East road plan option" style="${exploreStyle}">`;
    assert.ok(svg.startsWith(`${svgOpen}<polygon points="`));

    // The view is the view arguments' fill view, with smooth terrain
    const {view, data} = explorer;
    assert.deepEqual(view, projection(data.topo, {...explorer.state, 'fill': true, 'smooth': true}, 800, 600));
    assert.deepEqual([view.width, view.height, view.cy, view.zoom, view.smooth, view.xc, view.yc], [800, 600, 300, 2, true, 100, 50]);
    const parts = view3DParts(data.plan, data.topo, data.rows(1), 1, data.analysis(1), view);
    assert.equal(parts.smooth, 3);

    // The overlays - the report link, the keyboard help, and the view status (the view center is on the ground)
    const helpTexts = helpLines.map((line, ixLine) => (
        `<text x="16" y="${427 + 18 * ixLine}" font-size="12" ${textAttr} fill="#222" ${textStroke}>${line}</text>`
    ));
    const status = `<text x="12" y="586" font-size="12" ${textAttr} fill="#222" ${textStroke}>Center x 100, y 50, z 506 ft - zoom 2x, ` +
        'rotation 120, tilt 35, exaggeration 1.5x</text>';
    const backLink = '<a href="#var.vFile=&#039;plans%2Ffixture.json&#039;&amp;var.vOption=1">' +
        `<text x="12" y="20" font-size="14" ${textAttr} fill="#1f4e8c" ${textStroke} font-weight="bold">Back to the report</text></a>`;
    assert.equal(
        svg,
        `${svgOpen}${parts.elements.join('')}${backLink}` +
            `<rect x="8" y="414" width="380" height="152" rx="4" fill="white" fill-opacity="0.75"/>${helpTexts.join('')}${status}</svg>`
    );

    // Without the help, there's a line on how to show it
    assert.equal(press(explorer, 'KeyH'), 'render');
    assert.equal(explorer.state.help, false);
    assert.equal(
        explorer.render(800, 600),
        `${svgOpen}${parts.elements.join('')}${backLink}` +
            '<rect x="8" y="540" width="380" height="26" rx="4" fill="white" fill-opacity="0.75"/>' +
            `<text x="16" y="553" font-size="12" ${textAttr} fill="#222" ${textStroke}>H - keyboard help</text>${status}</svg>`
    );
    assert.equal(press(explorer, 'Slash', '?'), 'render');
    assert.equal(explorer.state.help, true);
    assert.equal(explorer.render(800, 600), svg);

    // The drawing with other terrain limits
    const limited = explorer.render(800, 600, false, {...smoothLimitsCanvas, 'points': 300});
    const limitedParts = view3DParts(
        data.plan, data.topo, data.rows(1), 1, data.analysis(1), view, false, {...smoothLimitsCanvas, 'points': 300}
    );
    assert.deepEqual([limitedParts.step, limitedParts.smooth, limitedParts.pointLimited], [2, 1, true]);
    assert.ok(limited.startsWith(`${svgOpen}${limitedParts.elements.join('')}${backLink}`));
});


test('Explorer.render, the canvas drawing', () => {
    const explorer = explore(simplePlan(), {'vFile': 'simple.json', 'vExplore': true});
    const drawing = explorer.render(400, 300, true);
    const {view, data} = explorer;
    const parts = view3DParts(data.plan, data.topo, data.rows(0), 0, data.analysis(0), view, true);

    // The drawing's size, label, and terrain - the 55 pixel grid cells are divided in four (the SVG drawing's limit)
    assert.deepEqual(
        {...drawing, 'ops': null},
        {
            'width': 400, 'height': 300, 'label': '3D view of the Flat road plan option', 'ops': null, 'smooth': 4, 'step': 1,
            'pointLimited': false
        }
    );
    assert.equal(drawing.ops.filter((op) => op.t === 0).length, 16 * 16);

    // The drawing's operations, then the overlays' - the keyboard help and the view status, in meters (the report link is left
    // to the page)
    assert.equal(drawing.ops.length, parts.elements.length + 10);
    assert.deepEqual(drawing.ops.slice(0, -10).map((op) => op.t), parts.elements.map((op) => op.t));
    assert.deepEqual(drawing.ops.slice(-10), [
        {'t': 5, 'x': 8, 'y': 114, 'width': 380, 'height': 152, 'rx': 4, 'f': 'white', 'o': 0.75},
        ...helpLines.map((text, ixLine) => (
            {'t': 3, text, 'x': 16, 'y': 127 + 18 * ixLine, 'size': 12, 'anchor': 'start', 'f': '#222', 'bold': false}
        )),
        {
            't': 3,
            'text': 'Center x 20, y 20, z 107 m - zoom 1x, rotation 30, tilt 35, exaggeration 1.5x',
            'x': 12,
            'y': 286,
            'size': 12,
            'anchor': 'start',
            'f': '#222',
            'bold': false
        }
    ]);

    // Without the help
    press(explorer, 'KeyH');
    assert.deepEqual(explorer.render(400, 300, true).ops.slice(-3, -1), [
        {'t': 5, 'x': 8, 'y': 240, 'width': 380, 'height': 26, 'rx': 4, 'f': 'white', 'o': 0.75},
        {'t': 3, 'text': 'H - keyboard help', 'x': 16, 'y': 253, 'size': 12, 'anchor': 'start', 'f': '#222', 'bold': false}
    ]);

    // The view status - the zoom and exaggeration to two decimal places
    pressAll(explorer, [], [['Equal', '+'], ['BracketLeft', '['], ['KeyQ'], ['ArrowUp', '', true], ['KeyD'], ['KeyR']]);
    assert.equal(
        explorer.render(400, 300, true).ops.at(-1).text,
        'Center x 26, y 18, z 111 m - zoom 1.41x, rotation 20, tilt 40, exaggeration 1.25x'
    );

    // The canvas terrain limits - the cells are at least 3 pixels, or as small as the point limit allows
    press(explorer, 'Home');
    let canvas = explorer.render(400, 300, true, smoothLimitsCanvas);
    assert.deepEqual([canvas.smooth, canvas.step, canvas.pointLimited], [8, 1, false]);
    canvas = explorer.render(400, 300, true, {...smoothLimitsCanvas, 'points': 400});
    assert.deepEqual([canvas.smooth, canvas.step, canvas.pointLimited], [4, 1, true]);
});


test('Explorer.keyDown, moving', () => {
    const explorer = explore(fixturePlan());
    explorer.render(800, 600, true);
    const {scale} = explorer.view;
    assert.equal(Math.round(100 / scale * 10) / 10, 67.2);

    // Facing north, the view center moves an eighth of the view's width east (right), north (forward), west, and south - on
    // the unmoved view's center elevation (above the ground, to fit the marker poles)
    assert.equal(press(explorer, 'KeyN'), 'render');
    assert.equal(Math.round(explorer.view.zc * 100) / 100, 532.74);
    const position = ['x', 'y', 'z'];
    assert.deepEqual(pressAll(explorer, position, [['ArrowRight'], ['ArrowUp'], ['ArrowLeft'], ['ArrowDown']]), [
        [267.2, 150, 532.7], [267.2, 217.2, 532.7], [200, 217.2, 532.7], [200, 150, 532.7]
    ]);
    assert.deepEqual(pressAll(explorer, position, [['KeyD'], ['KeyW'], ['KeyA'], ['KeyS']]), [
        [267.2, 150, 532.7], [267.2, 217.2, 532.7], [200, 217.2, 532.7], [200, 150, 532.7]
    ]);

    // The view is updated, so the next key moves from the moved view
    assert.deepEqual([explorer.view.xc, explorer.view.yc, explorer.view.zc], [200, 150, 532.7]);

    // The view center is raised and lowered an eighth of the view's height (in exaggerated elevation)
    assert.equal(Math.round(75 / (scale * 1.5) * 10) / 10, 33.6);
    assert.deepEqual(pressAll(explorer, position, [['KeyR'], ['PageUp'], ['KeyF'], ['PageDown'], ['KeyF']]), [
        [200, 150, 566.3], [200, 150, 599.9], [200, 150, 566.3], [200, 150, 532.7], [200, 150, 499.1]
    ]);

    // The view center stays within the topography (400 x 300 feet)
    assert.deepEqual(pressAll(explorer, position, [['KeyD'], ['KeyD'], ['KeyD'], ['KeyD'], ['KeyW'], ['KeyW'], ['KeyW']]).slice(1), [
        [334.4, 150, 499.1], [400, 150, 499.1], [400, 150, 499.1], [400, 217.2, 499.1], [400, 284.4, 499.1], [400, 300, 499.1]
    ]);
    press(explorer, 'Home');
    assert.deepEqual(pressAll(explorer, position, [['KeyN'], ['KeyA'], ['KeyA'], ['KeyA'], ['KeyS'], ['KeyS'], ['KeyS']]).slice(3), [
        [0, 150, 532.7], [0, 82.8, 532.7], [0, 15.6, 532.7], [0, 0, 532.7]
    ]);

    // Facing east, forward is east and right is south
    press(explorer, 'Home');
    assert.deepEqual(pressAll(explorer, ['azimuth'], [['KeyN'], ...Array.from({'length': 9}, () => ['KeyE'])]).slice(-2), [[80], [90]]);
    assert.deepEqual(pressAll(explorer, position, [['KeyW'], ['KeyD']]), [[267.2, 150, 532.7], [267.2, 82.8, 532.7]]);

    // A zoomed view moves less
    press(explorer, 'Home');
    assert.deepEqual(pressAll(explorer, position, [['KeyN'], ['Equal', '+'], ['Equal', '+'], ['KeyD']]).at(-1), [233.6, 150, 532.7]);
});


test('Explorer.keyDown, zooming, rotating, tilting, and exaggerating', () => {
    const explorer = explore(fixturePlan());
    explorer.render(800, 600, true);

    // Zoom in and out by the square root of two - from 1 to 64
    assert.deepEqual(pressAll(explorer, ['zoom'], [['Equal', '+'], ['Equal', '='], ['Minus', '-'], ['Minus', '_'], ['Minus', '-']]), [
        [1.414], [2], [1.414], [1], [1]
    ]);
    assert.deepEqual(pressAll(explorer, ['zoom'], Array.from({'length': 13}, () => ['NumpadAdd', '+'])).flat(), [
        1.414, 2, 2.828, 4, 5.657, 8, 11.314, 16, 22.627, 32, 45.255, 64, 64
    ]);
    assert.equal(explorer.view.zoom, 64);
    assert.deepEqual(pressAll(explorer, ['zoom'], [['Minus', '-']]), [[45.255]]);

    // A zoom between steps zooms to the nearest step's next step
    const between = explore(fixturePlan(), {'vZoom': 3});
    between.render(800, 600, true);
    assert.deepEqual(pressAll(between, ['zoom'], [['Equal', '+'], ['Home'], ['Minus', '-']]), [[4], [3], [2]]);

    // Rotate 10 degrees left and right - Q and E, or shift and the left and right arrows
    press(explorer, 'Home');
    assert.deepEqual(
        pressAll(explorer, ['azimuth'], [['KeyQ'], ['ArrowLeft', '', true], ['KeyE'], ['ArrowRight', '', true], ['ArrowRight', '', true]]),
        [[20], [10], [20], [30], [40]]
    );
    assert.deepEqual(pressAll(explorer, ['azimuth'], [['KeyN'], ['KeyQ'], ['KeyQ'], ['KeyE'], ['KeyE'], ['KeyE']]), [
        [0], [350], [340], [350], [0], [10]
    ]);
    assert.equal(Math.round(explorer.view.sinAz * 1e6) / 1e6, Math.round(Math.sin(10 * Math.PI / 180) * 1e6) / 1e6);

    // Tilt 5 degrees up and down with shift and the up and down arrows - from 5 to 90 degrees
    const tiltUp = ['ArrowUp', '', true];
    const tiltDown = ['ArrowDown', '', true];
    assert.deepEqual(pressAll(explorer, ['tilt'], [tiltUp, tiltUp, tiltDown]), [[40], [45], [40]]);
    assert.deepEqual(pressAll(explorer, ['tilt'], [['KeyT'], tiltUp, tiltDown]), [[90], [90], [85]]);
    assert.deepEqual(pressAll(explorer, ['tilt'], Array.from({'length': 17}, () => tiltDown)).flat().slice(-3), [10, 5, 5]);

    // The shifted arrows don't move the view
    assert.deepEqual([explorer.state.x, explorer.state.y, explorer.state.z], [null, null, null]);

    // The vertical exaggeration - a quarter less or more, from 1 to 5
    assert.deepEqual(pressAll(explorer, ['exaggeration'], [['BracketLeft', '['], ['BracketLeft', '['], ['BracketLeft', '[']]), [
        [1.25], [1], [1]
    ]);
    assert.deepEqual(pressAll(explorer, ['exaggeration'], Array.from({'length': 17}, () => ['BracketRight', ']'])).flat().slice(-3), [
        4.75, 5, 5
    ]);
    assert.equal(explorer.view.exaggeration, 5);
});


test('Explorer.keyDown, the other keys', () => {
    const globals = {'vFile': 'plans/fixture.json', 'vExplore': true, 'vAzimuth': 120, 'vTilt': 50, 'vZoom': 2, 'vX': 100, 'vY': 50};
    const explorer = explore(fixturePlan(), globals);
    explorer.render(800, 600, true);
    const initial = {...explorer.state};

    // Reset the view to the initial view (and show the help) - 0 or Home. The top view's scale fits the site in the view's
    // height, so it moves 43.7 feet (and is raised 21.8 feet from the ground, at 506 feet)
    const names = Object.keys(initial);
    const changes = [['KeyT'], ['KeyN'], ['KeyD'], ['KeyR'], ['Equal', '+'], ['BracketRight', ']'], ['KeyH']];
    assert.deepEqual(
        pressAll(explorer, names, changes).at(-1),
        [false, 0, 90, 1.75, 2.828, 143.7, 50, 527.8]
    );
    assert.deepEqual(pressAll(explorer, names, [['Digit0', '0']]), [Object.values(initial)]);
    pressAll(explorer, names, changes);
    assert.deepEqual(pressAll(explorer, names, [['Home']]), [Object.values(initial)]);
    assert.deepEqual(explorer.view, projection(explorer.data.topo, {...initial, 'fill': true, 'smooth': true}, 800, 600));

    // The view is updated for the key's width and height
    assert.equal(explorer.keyDown({'code': 'KeyN', 'key': 'n'}, 400, 300), 'render');
    assert.deepEqual([explorer.view.width, explorer.view.height, explorer.width, explorer.height], [400, 300, 400, 300]);
    assert.equal(press(explorer, 'KeyE'), 'render');
    assert.deepEqual([explorer.view.width, explorer.view.height], [400, 300]);

    // Escape returns to the report
    assert.equal(press(explorer, 'Escape'), 'back');

    // Other keys, and keys with the control, command, or option key, do nothing
    const state = {...explorer.state};
    for (const [code, key] of [['KeyX', 'x'], ['Space', ' '], ['Enter', 'Enter'], ['Digit1', '1'], ['End', 'End']]) {
        assert.equal(press(explorer, code, key), null);
    }
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
        for (const [code, key] of [['KeyQ', 'q'], ['Escape', 'Escape'], ['Equal', '+'], ['ArrowLeft', 'ArrowLeft']]) {
            assert.equal(explorer.keyDown({code, key, 'shiftKey': false, [modifier]: true}), null);
        }
    }
    assert.deepEqual(explorer.state, state);
});
