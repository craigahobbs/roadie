import {fakeBrowser, fakeContext, fire, flush, startApp} from './appHelpers.js';
import {Explorer} from '../lib/explore.js';
import {PlanData} from '../lib/planData.js';
import {argsParse} from '../lib/args.js';
import assert from 'node:assert/strict';
import {fixturePlan} from './fixture.js';
import {paintOps} from '../lib/canvas.js';
import {smoothLimitsCanvas} from '../lib/view3d.js';
import test from 'node:test';
import {validatePlan} from '../lib/model.js';


// The 3D explorer page's URL hash
const exploreHash = "#var.vFile='plans/fixture.json'&var.vExplore=true";


// Create a browser at the fixture plan's 3D explorer - "cellCost" is the measured terrain cell cost in local storage
function exploreBrowser(testContext, {cellCost = '1', search = '', hash = exploreHash} = {}) {
    return fakeBrowser(testContext, {
        search, hash,
        'files': {'plans/fixture.json': JSON.stringify(fixturePlan())},
        'storage': cellCost !== null ? {'roadieCellCost': cellCost} : {}
    });
}


// The calls that paint the fixture plan's 3D explorer drawing, at a size and terrain point limit
function paintCalls(width, height, points) {
    const data = new PlanData(validatePlan(fixturePlan()).plan, 'plans/fixture.json');
    const globals = {'vFile': 'plans/fixture.json', 'vExplore': true};
    const drawing = new Explorer(data, globals, argsParse(globals)).render(width, height, true, {...smoothLimitsCanvas, points});
    const calls = [['getContext', '2d'], ['setTransform', 1, 0, 0, 1, 0, 0], ['fillStyle', '#f4f1ea'], ['fillRect', 0, 0, width, height]];
    paintOps(fakeContext(calls), drawing.ops);
    return calls;
}


// The number of times a canvas has been painted
function paintCount(canvas) {
    return canvas.calls.filter(([name]) => name === 'getContext').length;
}


// The text of the canvas's last painting, in order
function paintedText(canvas) {
    const calls = canvas.calls.slice(canvas.calls.findLastIndex(([name]) => name === 'getContext'));
    return calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
}


// The explorer's view status - the last text of the canvas's last painting
function viewStatus(canvas) {
    return paintedText(canvas).at(-1);
}


// Press a key - returns whether its default action was prevented
function keyDown(browser, code, key = '', modifiers = {}) {
    return fire(browser, browser.document, 'keydown', {code, key, ...modifiers}).defaultPrevented;
}


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


test('the 3D explorer page', async (context) => {
    const browser = exploreBrowser(context);
    const {clock, document, main} = browser;
    const app = await startApp(browser);
    assert.equal(document.title, 'Fixture Plan - 3D');
    assert.equal(document.body.className, 'roadie-explore');
    assert.deepEqual(browser.scrolls, [['scrollTo', 0, 0], ['scrollTo', 0, 0]]);
    assert.deepEqual(browser.fetches, ['plans/fixture.json']);
    assert.deepEqual(browser.logs, []);
    assert.equal(app.page.explorer.data.file, 'plans/fixture.json');

    // The page is a canvas that fills the window, less the page's margins, and a link back to the report
    assert.deepEqual([...main.querySelectorAll('*')].map((element) => element.tagName), ['DIV', 'CANVAS', 'A']);
    assert.equal(main.firstElementChild.className, 'roadie-explorer');
    const canvas = main.querySelector('canvas');
    assert.equal(canvas.getAttribute('role'), 'img');
    assert.equal(canvas.getAttribute('aria-label'), '3D view of the Direct road plan option');
    assert.equal(canvas.width, 976);
    assert.equal(canvas.height, 720);
    assert.equal(canvas.style.width, '976px');
    assert.equal(canvas.style.height, '720px');
    assert.equal(canvas.style.margin, '0px');
    assert.equal(canvas.style.display, 'block');
    assert.equal(canvas.dataset.frame, '1');
    assert.equal(
        main.querySelector('a').outerHTML,
        '<a class="roadie-explorer-back" href="#var.vFile=\'plans%2Ffixture.json\'">Back to the report</a>'
    );

    // The canvas is painted with the view's drawing - with the terrain points that fit a moving view's time budget (100
    // milliseconds) at the measured cell cost (1 millisecond)
    assert.equal(paintCount(canvas), 1);
    assert.deepEqual(canvas.calls, paintCalls(976, 720, 85));
    assert.deepEqual(canvas.calls.slice(0, 20), [
        ['getContext', '2d'],
        ['setTransform', 1, 0, 0, 1, 0, 0],
        ['fillStyle', '#f4f1ea'],
        ['fillRect', 0, 0, 976, 720],
        ['miterLimit', 4],
        ['setLineDash', []],
        ['globalAlpha', 1],
        ['beginPath'],
        ['moveTo', 602.5127559220302, 119.50594458497434],
        ['lineTo', 664.9196874493437, 112.56389106025097],
        ['lineTo', 700.9503461659366, 158.98428803741066],
        ['lineTo', 638.5434146386232, 165.9263415621338],
        ['closePath'],
        ['fillStyle', 'rgb(135,124,83)'],
        ['fill'],
        ['strokeStyle', 'rgb(135,124,83)'],
        ['lineWidth', 0.6],
        ['lineCap', 'butt'],
        ['lineJoin', 'miter'],
        ['stroke']
    ]);

    // The drawing ends with the keyboard help panel and the view's status
    assert.deepEqual(canvas.calls.slice(-52, -39), [
        ['beginPath'],
        ['roundRect', 8, 534, 380, 152, 4],
        ['globalAlpha', 0.75],
        ['fillStyle', 'white'],
        ['fill'],
        ['globalAlpha', 1],
        ['font', '12px sans-serif'],
        ['textAlign', 'left'],
        ['textBaseline', 'middle'],
        ['strokeText', 'Arrows or W A S D - move', 16, 547],
        ['fillStyle', '#222'],
        ['fillText', 'Arrows or W A S D - move', 16, 547],
        ['font', '12px sans-serif']
    ]);
    assert.deepEqual(canvas.calls.slice(-5), [
        ['font', '12px sans-serif'],
        ['textAlign', 'left'],
        ['textBaseline', 'middle'],
        ['strokeText', 'Center x 200, y 150, z 533 ft - zoom 1x, rotation 30, tilt 35, exaggeration 1.5x', 12, 706],
        ['fillText', 'Center x 200, y 150, z 533 ft - zoom 1x, rotation 30, tilt 35, exaggeration 1.5x', 12, 706]
    ]);
    assert.deepEqual(paintedText(canvas), [
        '2+00', 'Road', 'End', 'N', ...helpLines, 'Center x 200, y 150, z 533 ft - zoom 1x, rotation 30, tilt 35, exaggeration 1.5x'
    ]);

    // The frame is measured in the next animation frame, and the still view is drawn a quarter second later
    assert.equal(clock.frames.size, 1);
    assert.deepEqual([...clock.timeouts.values()].map(({time}) => time), [250]);

    // Printing doesn't paint the explorer
    fire(browser, browser.window, 'beforeprint');
    fire(browser, browser.window, 'afterprint');
    assert.equal(paintCount(canvas), 1);
});


test('the 3D explorer page of a plan option and view', async (context) => {
    const browser = exploreBrowser(context, {'hash': `${exploreHash}&var.vOption=1&var.vAzimuth=100&var.vZoom=2&var.vX=120&var.vY=80`});
    const {document, main, window} = browser;
    await startApp(browser);
    const canvas = main.querySelector('canvas');
    assert.equal(document.title, 'Fixture Plan - 3D');
    assert.equal(canvas.getAttribute('aria-label'), '3D view of the Bridge - East road plan option');
    assert.equal(viewStatus(canvas), 'Center x 120, y 80, z 510 ft - zoom 2x, rotation 100, tilt 35, exaggeration 1.5x');

    // The link back to the report keeps the option
    assert.equal(main.querySelector('a').getAttribute('href'), "#var.vFile='plans%2Ffixture.json'&var.vOption=1");

    // So does the escape key - the report isn't the explorer's full-window page
    assert.equal(keyDown(browser, 'Escape', 'Escape'), false);
    assert.equal(window.location.hash, "#var.vFile='plans%2Ffixture.json'&var.vOption=1");
    await flush();
    assert.equal(document.title, 'Fixture Plan');
    assert.equal(document.body.className, '');
    assert.equal(main.querySelector('h2:nth-of-type(2)').textContent, 'Bridge - East');
});


test('the 3D explorer page fills the window', async (context) => {
    // A small window's explorer is at least 320 by 240 pixels - without a device pixel ratio, so is its canvas's bitmap
    const browser = exploreBrowser(context);
    const {clock, main, window} = browser;
    window.innerWidth = 300;
    window.innerHeight = 200;
    window.devicePixelRatio = undefined;
    await startApp(browser);
    const canvas = main.querySelector('canvas');
    assert.deepEqual([canvas.width, canvas.height, canvas.style.width, canvas.style.height], [320, 240, '320px', '240px']);
    assert.deepEqual(canvas.calls.slice(0, 4), [
        ['getContext', '2d'], ['setTransform', 1, 0, 0, 1, 0, 0], ['fillStyle', '#f4f1ea'], ['fillRect', 0, 0, 320, 240]
    ]);

    // Resizing the window draws the view again, in the next animation frame
    clock.runFrame();
    window.innerWidth = 1224;
    window.innerHeight = 848;
    fire(browser, window, 'resize');
    fire(browser, window, 'resize');
    assert.equal(clock.frames.size, 1);
    assert.equal(paintCount(canvas), 1);
    clock.runFrame();
    assert.equal(paintCount(canvas), 2);
    assert.equal(canvas.dataset.frame, '2');
    assert.deepEqual([canvas.width, canvas.height, canvas.style.width, canvas.style.height], [1176, 800, '1176px', '800px']);
    assert.deepEqual(canvas.calls.slice(-paintCalls(1176, 800, 85).length), paintCalls(1176, 800, 85));

    // The canvas's bitmap is the drawing's size times the device pixel ratio
    window.devicePixelRatio = 2;
    fire(browser, window, 'resize');
    clock.runFrame();
    assert.equal(paintCount(canvas), 3);
    assert.deepEqual([canvas.width, canvas.height, canvas.style.width, canvas.style.height], [2352, 1600, '1176px', '800px']);
    assert.deepEqual(canvas.calls.filter(([name]) => name === 'setTransform' || name === 'fillRect').slice(-2), [
        ['setTransform', 2, 0, 0, 2, 0, 0], ['fillRect', 0, 0, 1176, 800]
    ]);

    // A view of the same size keeps the canvas's bitmap
    canvas.style.width = '100%';
    fire(browser, window, 'resize');
    clock.runFrame();
    assert.equal(paintCount(canvas), 4);
    assert.deepEqual([canvas.width, canvas.height, canvas.style.width, canvas.style.height], [2352, 1600, '100%', '800px']);
});


test('the 3D explorer page keys', async (context) => {
    const browser = exploreBrowser(context);
    const {clock, main} = browser;
    await startApp(browser);
    const canvas = main.querySelector('canvas');
    clock.runFrame();
    assert.equal(clock.frames.size, 0);

    // A key changes the view - the view is drawn in the next animation frame, once for all of the keys before it
    assert.equal(keyDown(browser, 'KeyQ', 'q'), true);
    assert.equal(clock.frames.size, 1);
    assert.equal(keyDown(browser, 'KeyQ', 'q'), true);
    assert.equal(keyDown(browser, 'ArrowUp', 'ArrowUp', {'shiftKey': true}), true);
    assert.equal(clock.frames.size, 1);
    assert.equal(paintCount(canvas), 1);
    assert.equal(canvas.dataset.frame, '1');
    clock.runFrame();
    assert.equal(paintCount(canvas), 2);
    assert.equal(canvas.dataset.frame, '2');
    assert.equal(viewStatus(canvas), 'Center x 200, y 150, z 533 ft - zoom 1x, rotation 10, tilt 40, exaggeration 1.5x');

    // Other keys, and keys with a control, command, or option key, are left alone
    assert.equal(keyDown(browser, 'KeyZ', 'z'), false);
    assert.equal(keyDown(browser, 'KeyQ', 'q', {'ctrlKey': true}), false);
    assert.equal(keyDown(browser, 'KeyQ', 'q', {'metaKey': true}), false);
    assert.equal(keyDown(browser, 'KeyQ', 'q', {'altKey': true}), false);
    assert.equal(clock.frames.size, 1);
    clock.runFrame();
    assert.equal(paintCount(canvas), 2);

    // Zoom in, move right, and raise the view
    assert.equal(keyDown(browser, 'Equal', '='), true);
    assert.equal(keyDown(browser, 'KeyD', 'd'), true);
    assert.equal(keyDown(browser, 'PageUp', 'PageUp'), true);
    clock.runFrame();
    assert.equal(paintCount(canvas), 3);
    assert.equal(viewStatus(canvas), 'Center x 251, y 141, z 558 ft - zoom 1.41x, rotation 10, tilt 40, exaggeration 1.5x');
    assert.equal(canvas.getAttribute('aria-label'), '3D view of the Direct road plan option');
    assert.equal(main.querySelector('a').getAttribute('href'), "#var.vFile='plans%2Ffixture.json'");

    // Hide the keyboard help
    assert.deepEqual(paintedText(canvas).slice(-9, -1), helpLines);
    assert.deepEqual(canvas.calls.findLast(([name]) => name === 'roundRect'), ['roundRect', 8, 534, 380, 152, 4]);
    assert.equal(keyDown(browser, 'KeyH', 'h'), true);
    clock.runFrame();
    assert.deepEqual(paintedText(canvas).slice(-2), [
        'H - keyboard help', 'Center x 251, y 141, z 558 ft - zoom 1.41x, rotation 10, tilt 40, exaggeration 1.5x'
    ]);
    assert.deepEqual(canvas.calls.findLast(([name]) => name === 'roundRect'), ['roundRect', 8, 660, 380, 26, 4]);

    // Reset the view - the help stays hidden
    assert.equal(keyDown(browser, 'Digit0', '0'), true);
    clock.runFrame();
    assert.equal(paintCount(canvas), 5);
    assert.deepEqual(paintedText(canvas), [
        '2+00', 'Road', 'End', 'N', 'H - keyboard help',
        'Center x 200, y 150, z 533 ft - zoom 1x, rotation 30, tilt 35, exaggeration 1.5x'
    ]);
});


test('the 3D explorer page leaves the keys of focused inputs alone', async (context) => {
    const browser = exploreBrowser(context);
    const {clock, document, main} = browser;
    await startApp(browser);
    clock.runFrame();

    // An input, a text area, a select, and editable content
    const editable = document.createElement('div');
    editable.tabIndex = 0;
    Object.defineProperty(editable, 'isContentEditable', {'value': true});
    const inputs = ['input', 'textarea', 'select'].map((tagName) => document.createElement(tagName));
    for (const element of [...inputs, editable]) {
        document.body.append(element);
        element.focus();
        assert.equal(document.activeElement, element);
        assert.equal(keyDown(browser, 'KeyQ', 'q'), false);
        assert.equal(keyDown(browser, 'Escape', 'Escape'), false);
        assert.equal(clock.frames.size, 0);
        assert.equal(browser.window.location.hash, exploreHash);
        element.remove();
    }

    // The focused link back to the report doesn't take the keys
    main.querySelector('a').focus();
    assert.equal(document.activeElement, main.querySelector('a'));
    assert.equal(keyDown(browser, 'KeyQ', 'q'), true);
    assert.equal(clock.frames.size, 1);
});


test('the 3D explorer page draws its still view', async (context) => {
    const browser = exploreBrowser(context, {'search': '?debug'});
    const {clock, main, window} = browser;
    await startApp(browser);
    const canvas = main.querySelector('canvas');
    assert.deepEqual(browser.logs, ['Roadie: render in 0.0 ms']);

    // The moving view's frame is measured - a fast frame (30 milliseconds, over at least 2000 cells, moves the cell cost
    // estimate 30% of the way from 1 millisecond to 0.015) raises the moving view's point limit
    clock.time = 30;
    clock.runFrame();
    assert.deepEqual(browser.logs.slice(1), [
        'Roadie: 3D explorer moving frame - 531 operations, 80 cells, step 4, smooth 1 (85 point limit) - built in 0.0 ms, ' +
            'painted in 0.0 ms, frame in 30.0 ms'
    ]);
    assert.equal(window.localStorage.getItem('roadieCellCost'), '1');

    // A quarter second after the view stops moving, the still view is drawn - with the points that fit its time budget
    // (500 milliseconds)
    assert.deepEqual([...clock.timeouts.values()].map(({time}) => time), [250]);
    clock.runTimeout();
    assert.equal(clock.time, 250);
    assert.equal(paintCount(canvas), 2);
    assert.equal(canvas.dataset.frame, '2');
    assert.deepEqual(canvas.calls.slice(-paintCalls(976, 720, 425).length), paintCalls(976, 720, 425));
    assert.equal(clock.timeouts.size, 0);

    // The still view's frame is measured - and the cell cost estimate is kept in local storage
    clock.time = 900;
    clock.runFrame();
    assert.deepEqual(browser.logs.slice(2), [
        'Roadie: 3D explorer still frame - 786 operations, 300 cells, step 2, smooth 1 (425 point limit) - built in 0.0 ms, ' +
            'painted in 0.0 ms, frame in 650.0 ms'
    ]);
    assert.equal(window.localStorage.getItem('roadieCellCost'), '0.5906499999999999');

    // A key draws the moving view - with its raised point limit
    assert.equal(keyDown(browser, 'KeyE', 'e'), true);
    clock.runFrame();
    assert.equal(paintCount(canvas), 3);
    clock.runFrame();
    assert.deepEqual(browser.logs.slice(3), [
        'Roadie: 3D explorer moving frame - 531 operations, 80 cells, step 4, smooth 1 (121 point limit) - built in 0.0 ms, ' +
            'painted in 0.0 ms, frame in 0.0 ms'
    ]);
    assert.deepEqual([...clock.timeouts.values()].map(({time}) => time), [1150]);

    // Another key, before the still view is drawn, puts it off - the last frame was fast, so this one has more points
    clock.time = 1000;
    assert.equal(keyDown(browser, 'KeyE', 'e'), true);
    assert.equal(clock.timeouts.size, 0);
    clock.runFrame();
    assert.equal(paintCount(canvas), 4);
    assert.deepEqual([...clock.timeouts.values()].map(({time}) => time), [1250]);
    clock.runFrame();
    assert.deepEqual(browser.logs.slice(4), [
        'Roadie: 3D explorer moving frame - 604 operations, 140 cells, step 3, smooth 1 (206 point limit) - built in 0.0 ms, ' +
            'painted in 0.0 ms, frame in 0.0 ms'
    ]);
    clock.runTimeout();
    assert.equal(paintCount(canvas), 5);
    assert.equal(viewStatus(canvas), 'Center x 200, y 150, z 533 ft - zoom 1x, rotation 50, tilt 35, exaggeration 1.5x');

    // A very slow still frame lowers the still view's point limit
    clock.time = 101250;
    clock.runFrame();
    assert.deepEqual(browser.logs.slice(5), [
        'Roadie: 3D explorer still frame - 786 operations, 300 cells, step 2, smooth 1 (425 point limit) - built in 0.0 ms, ' +
            'painted in 0.0 ms, frame in 100000.0 ms'
    ]);

    // The still view isn't drawn when its point limit isn't more than the moving view's (294 points, after its fast frames)
    assert.equal(keyDown(browser, 'KeyE', 'e'), true);
    clock.runFrame();
    assert.equal(paintCount(canvas), 6);
    assert.equal(clock.timeouts.size, 1);
    clock.runTimeout();
    assert.equal(clock.time, 101500);
    assert.equal(paintCount(canvas), 6);
    assert.equal(clock.timeouts.size, 0);
    clock.runFrame();
    assert.deepEqual(browser.logs.slice(6), [
        'Roadie: 3D explorer moving frame - 604 operations, 140 cells, step 3, smooth 1 (294 point limit) - built in 0.0 ms, ' +
            'painted in 0.0 ms, frame in 250.0 ms'
    ]);
});


test('the 3D explorer page draws all of the terrain when it fits the time budget', async (context) => {
    // No measured cell cost - the still view has the points for every grid cell, smoothed - and a fast computer's cell
    // cost - the moving view does, too
    for (const [cellCost, expectedLogs, expectedTimeouts] of [
        [
            null,
            [
                'Roadie: 3D explorer moving frame - 43756 operations, 43200 cells, step 1, smooth 6 (53125 point limit) - ' +
                    'built in 0.0 ms, painted in 0.0 ms, frame in 0.0 ms',
                'Roadie: 3D explorer still frame - 59356 operations, 58800 cells, step 1, smooth 7 - ' +
                    'built in 0.0 ms, painted in 0.0 ms, frame in 0.0 ms'
            ],
            1
        ],
        [
            '0.0001',
            [
                'Roadie: 3D explorer moving frame - 59356 operations, 58800 cells, step 1, smooth 7 - ' +
                    'built in 0.0 ms, painted in 0.0 ms, frame in 0.0 ms'
            ],
            0
        ]
    ]) {
        const browser = exploreBrowser(context, {cellCost, 'search': '?debug'});
        const {clock} = browser;
        await startApp(browser);
        clock.runFrame();
        assert.equal(clock.timeouts.size, expectedTimeouts);
        if (expectedTimeouts > 0) {
            clock.runTimeout();
            clock.runFrame();
        }
        assert.deepEqual(browser.logs.slice(1), expectedLogs);
        assert.equal(clock.timeouts.size, 0);
        assert.equal(clock.frames.size, 0);
    }
});


test('the 3D explorer page titles', async (context) => {
    const browser = exploreBrowser(context);
    const {main} = browser;
    await startApp(browser);
    const canvas = main.querySelector('canvas');

    // The canvas is shown at its size, at the top left of the window, with a 1 pixel border
    canvas.getBoundingClientRect = () => ({'left': 0, 'top': 0, 'width': 976, 'height': 720});
    const mouseMove = (x, y) => {
        fire(browser, canvas, 'mousemove', {'clientX': x + 1, 'clientY': y + 1});
        return canvas.title;
    };

    // The road's segments have titles - the terrain and the drawing's background don't
    assert.equal(mouseMove(537, 375), '2+40: grade 523.0, ground 519.8, fill 3.2');
    assert.equal(mouseMove(538, 380), '2+36: grade 522.3, ground 518.4, fill 3.9');
    assert.equal(mouseMove(538, 300), '');
    assert.equal(mouseMove(651, 272), '3+40: grade 537.0, ground 538.9, cut 1.9');
    assert.equal(mouseMove(652, 272), '3+40: grade 537.0, ground 538.9, cut 1.9');
    assert.equal(mouseMove(5, 5), '');
    assert.equal(mouseMove(6, 5), '');
});


test('the 3D explorer page is left', async (context) => {
    const browser = exploreBrowser(context, {'search': '?debug'});
    const {clock, document, main, window} = browser;
    await startApp(browser);
    const canvas = main.querySelector('canvas');

    // The frame is measured, and a key is pressed
    clock.time = 30;
    clock.runFrame();
    assert.equal(keyDown(browser, 'KeyQ', 'q'), true);
    assert.equal(clock.frames.size, 1);
    assert.equal(clock.timeouts.size, 0);
    assert.equal(window.localStorage.getItem('roadieCellCost'), '1');

    // Leave the explorer for the report - the key's frame is canceled, and the cell cost estimate is kept in local storage
    window.location.hash = "#var.vFile='plans/fixture.json'";
    await flush();
    assert.equal(document.title, 'Fixture Plan');
    assert.equal(document.body.className, '');
    assert.equal(clock.frames.size, 0);
    assert.equal(paintCount(canvas), 1);
    assert.equal(window.localStorage.getItem('roadieCellCost'), '0.7044999999999999');

    // The report's 3D view is drawn with the points that fit its time budget at the explorer's cell cost estimate
    clock.runTimeout();
    clock.runFrame();
    assert.deepEqual(browser.logs.slice(-1), [
        'Roadie: 3D view 1 - 594 operations, 140 cells, step 3, smooth 1 (302 point limit) - drawn in 0.0 ms'
    ]);

    // The explorer, again - it has its moving view's point limit, and the still view is drawn before leaving it again
    window.location.hash = exploreHash;
    await flush();
    assert.equal(document.title, 'Fixture Plan - 3D');
    assert.equal(document.body.className, 'roadie-explore');
    clock.runFrame();
    assert.deepEqual(browser.logs.slice(-2), [
        'Roadie: render in 0.0 ms',
        'Roadie: 3D explorer moving frame - 531 operations, 80 cells, step 4, smooth 1 (121 point limit) - built in 0.0 ms, ' +
            'painted in 0.0 ms, frame in 0.0 ms'
    ]);
    assert.equal(clock.timeouts.size, 1);
    window.location.hash = '#var=';
    await flush();
    assert.equal(document.title, 'Roadie');
    assert.equal(document.body.className, '');
    assert.equal(clock.timeouts.size, 0);
    assert.equal(clock.frames.size, 0);
});
