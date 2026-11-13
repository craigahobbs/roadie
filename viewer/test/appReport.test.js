import {fakeBrowser, fakeContext, fire, flush, startApp} from './appHelpers.js';
import {PlanData} from '../lib/planData.js';
import {argsParse} from '../lib/args.js';
import assert from 'node:assert/strict';
import {buildReport} from '../lib/report.js';
import {fixturePlan} from './fixture.js';
import {paintOps} from '../lib/canvas.js';
import {smoothLimitsCanvas} from '../lib/view3d.js';
import test from 'node:test';
import {validatePlan} from '../lib/model.js';


// The fixture plan - with a road so narrow that the report has 3D views of its segments, too
function narrowPlan() {
    const plan = fixturePlan();
    plan.options[0].section.width = 1;
    return plan;
}


// The report page's URL hash and its hash variables
const reportHash = "#var.vFile='plans/fixture.json'";
const reportGlobals = {'vFile': 'plans/fixture.json'};


// Build a plan's report, as the page does
function expectedReport(plan, width, globals = reportGlobals) {
    const data = new PlanData(validatePlan(plan).plan, 'plans/fixture.json');
    return buildReport(data, globals, argsParse(globals), width, true);
}


// The calls that paint a 3D view's drawing on its canvas, at a pixel ratio
function paintCalls(drawing, ratio = 1) {
    const calls = [
        ['getContext', '2d'],
        ['setTransform', ratio, 0, 0, ratio, 0, 0],
        ['fillStyle', '#f4f1ea'],
        ['fillRect', 0, 0, drawing.width, drawing.height]
    ];
    paintOps(fakeContext(calls), drawing.elements);
    return calls;
}


// Create a browser at a plan's report - "cellCost" is the measured terrain cell cost in local storage
function reportBrowser(testContext, plan, {cellCost = '1', search = '', hash = reportHash} = {}) {
    return fakeBrowser(testContext, {
        search, hash,
        'files': {'plans/fixture.json': JSON.stringify(plan)},
        'storage': cellCost !== null ? {'roadieCellCost': cellCost} : {}
    });
}


// The report's 3D view canvases
function viewCanvases(browser) {
    return [...browser.main.querySelectorAll('canvas')];
}


// The number of times each of the canvases has been painted
function paintCounts(canvases) {
    return canvases.map((canvas) => (canvas.calls ?? []).filter(([name]) => name === 'getContext').length);
}


// The 3D view drawing style
const viewStyle = 'background: #f4f1ea; border: 1px solid #ccc; display: block; max-width: 100%; height: auto; ' +
    'break-inside: avoid; margin: 0.75em 0 1.5em 0;';


test('the report page', async (context) => {
    const browser = reportBrowser(context, fixturePlan());
    const {clock, document, main} = browser;
    const app = await startApp(browser);
    assert.equal(document.title, 'Fixture Plan');

    // The report's HTML - for the window's width, less the page's margins
    const report = expectedReport(fixturePlan(), 976);
    const expected = document.createElement('div');
    expected.innerHTML = report.html;
    assert.equal(main.innerHTML, expected.innerHTML);
    assert.equal(main.querySelector('h1').outerHTML, '<h1 id="fixture-plan">Fixture Plan</h1>');
    assert.equal(main.querySelector('svg.roadie-plan').getAttribute('width'), '976');
    assert.equal(main.querySelector('svg.roadie-plan').getAttribute('aria-label'), 'Plan view of the Direct road plan option');
    assert.equal(
        main.querySelector('a[href*="vExplore"]').outerHTML,
        '<a href="#var.vAzimuth=328.6&amp;var.vExplore=true&amp;var.vFile=\'plans%2Ffixture.json\'&amp;var.vTilt=55&amp;var.vX=202&amp;' +
            'var.vY=146.7&amp;var.vZ=522.2">Explore the plan in 3D</a>'
    );

    // The 3D view is an empty canvas, watched for when it's visible, and drawn in a later task
    const canvases = viewCanvases(browser);
    assert.deepEqual(canvases.map((canvas) => canvas.outerHTML), [
        '<canvas width="976" height="666" role="img" aria-label="3D view of the Direct road plan option" ' +
            `style="${viewStyle}" data-view="0"></canvas>`
    ]);
    assert.deepEqual(paintCounts(canvases), [0]);
    assert.equal(browser.observers.length, 1);
    assert.deepEqual(browser.observers[0].options, {'rootMargin': '50% 0px'});
    assert.deepEqual([...browser.observers[0].targets], canvases);
    assert.deepEqual([...clock.timeouts.values()].map(({time}) => time), [0]);
    assert.equal(clock.frames.size, 0);

    // The page has no keys, and resizing the window without changing the report's width does nothing
    assert.equal(fire(browser, document, 'keydown', {'code': 'KeyQ', 'key': 'q'}).defaultPrevented, false);
    fire(browser, browser.window, 'resize');
    assert.equal(clock.timeouts.size, 1);
    assert.equal(app.page.report.title, 'Fixture Plan');
    assert.equal(main.innerHTML, expected.innerHTML);
});


test('the report page width', async (context) => {
    // The report is at most 1200 pixels wide, and at least 400
    for (const [innerWidth, width, height] of [[2000, 1200, 817], [1248, 1200, 817], [1247, 1199, 816], [448, 400, 286], [300, 400, 286]]) {
        const browser = reportBrowser(context, fixturePlan());
        browser.window.innerWidth = innerWidth;
        await startApp(browser);
        const [canvas] = viewCanvases(browser);
        assert.equal(browser.main.querySelector('svg.roadie-plan').getAttribute('width'), `${width}`);
        assert.equal(canvas.getAttribute('width'), `${width}`);
        assert.equal(canvas.getAttribute('height'), `${height}`);
    }
});


test('the report page draws its 3D views one per task', async (context) => {
    const browser = reportBrowser(context, narrowPlan(), {'search': '?debug'});
    const {clock, window} = browser;
    await startApp(browser);
    const canvases = viewCanvases(browser);
    const [observer] = browser.observers;
    assert.deepEqual(canvases.map((canvas) => [canvas.width, canvas.height, canvas.dataset.view]), [
        [976, 666, '0'], [976, 732, '1'], [976, 732, '2']
    ]);
    assert.deepEqual(paintCounts(canvases), [0, 0, 0]);
    assert.deepEqual([...observer.targets], canvases);
    assert.deepEqual(browser.logs, ['Roadie: render in 0.0 ms']);

    // The first task draws the first view - with the terrain points that fit the view's time budget (250 milliseconds)
    // at the measured cell cost (1 millisecond) - and it's no longer watched
    const {views} = expectedReport(narrowPlan(), 976);
    clock.runTimeout();
    assert.deepEqual(paintCounts(canvases), [1, 0, 0]);
    const drawing1 = views[0].render({...smoothLimitsCanvas, 'points': 213});
    assert.equal(drawing1.pointLimited, true);
    assert.deepEqual(canvases[0].calls, paintCalls(drawing1));
    assert.deepEqual(canvases[0].calls.slice(0, 20), [
        ['getContext', '2d'],
        ['setTransform', 1, 0, 0, 1, 0, 0],
        ['fillStyle', '#f4f1ea'],
        ['fillRect', 0, 0, 976, 666],
        ['miterLimit', 4],
        ['setLineDash', []],
        ['globalAlpha', 1],
        ['beginPath'],
        ['moveTo', 351.52176277493373, 44.65572482512647],
        ['lineTo', 389.2836860413062, 63.53716011899695],
        ['lineTo', 366.23370963520546, 99.03752175711523],
        ['lineTo', 328.47178636883297, 80.15608646324472],
        ['closePath'],
        ['fillStyle', 'rgb(153,144,95)'],
        ['fill'],
        ['strokeStyle', 'rgb(153,144,95)'],
        ['lineWidth', 0.6],
        ['lineCap', 'butt'],
        ['lineJoin', 'miter'],
        ['stroke']
    ]);
    assert.deepEqual(canvases[0].calls.slice(-8), [
        ['font', 'bold 11px sans-serif'],
        ['textAlign', 'center'],
        ['textBaseline', 'middle'],
        ['strokeStyle', 'white'],
        ['lineWidth', 3],
        ['strokeText', 'N', 932.8298160702712, 45.6222898737182],
        ['fillStyle', '#333'],
        ['fillText', 'N', 932.8298160702712, 45.6222898737182]
    ]);
    assert.deepEqual([...observer.targets], [canvases[1], canvases[2]]);

    // The canvas keeps its size and style
    assert.equal(canvases[0].width, 976);
    assert.equal(canvases[0].height, 666);
    assert.equal(canvases[0].getAttribute('style'), viewStyle);

    // The drawing is measured through the next animation frame - 400 milliseconds, over at least 2000 cells, is 0.2
    // milliseconds a cell, which moves the cell cost estimate 30% of the way from 1 - and the estimate is kept in local
    // storage
    assert.equal(clock.frames.size, 1);
    assert.equal(clock.timeouts.size, 1);
    clock.time = 400;
    clock.runFrame();
    assert.equal(window.localStorage.getItem('roadieCellCost'), '0.76');
    assert.deepEqual(browser.logs.slice(1), [
        'Roadie: 3D view 1 - 858 operations, 140 cells, step 3, smooth 1 (213 point limit) - drawn in 400.0 ms'
    ]);

    // The next task draws the second view - with more terrain points, for the lower cell cost
    clock.runTimeout();
    assert.deepEqual(paintCounts(canvases), [1, 1, 0]);
    assert.deepEqual(canvases[1].calls, paintCalls(views[1].render({...smoothLimitsCanvas, 'points': 280})));
    assert.deepEqual(canvases[1].calls[3], ['fillRect', 0, 0, 976, 732]);
    assert.deepEqual([...observer.targets], [canvases[2]]);

    // The next, the third view - before the second view's animation frame
    clock.runTimeout();
    assert.deepEqual(paintCounts(canvases), [1, 1, 1]);
    assert.deepEqual(canvases[2].calls, paintCalls(views[2].render({...smoothLimitsCanvas, 'points': 280})));
    assert.deepEqual([...observer.targets], []);
    assert.equal(clock.frames.size, 2);
    clock.time = 410;
    clock.runFrame();
    assert.equal(window.localStorage.getItem('roadieCellCost'), '0.3749499999999999');
    assert.deepEqual(browser.logs.slice(2), [
        'Roadie: 3D view 2 - 570 operations, 164 cells, step 2, smooth 1 (280 point limit) - drawn in 10.0 ms',
        'Roadie: 3D view 3 - 591 operations, 160 cells, step 2, smooth 1 (280 point limit) - drawn in 10.0 ms'
    ]);

    // The last task finds every view drawn
    assert.equal(clock.timeouts.size, 1);
    clock.runTimeout();
    assert.deepEqual(paintCounts(canvases), [1, 1, 1]);
    assert.equal(clock.timeouts.size, 0);
    assert.equal(clock.frames.size, 0);
});


test('the report page draws its visible 3D views first', async (context) => {
    const browser = reportBrowser(context, narrowPlan());
    const {clock} = browser;
    await startApp(browser);
    const canvases = viewCanvases(browser);
    const [observer] = browser.observers;

    // The third view is near the viewport, and the second isn't
    observer.callback([{'target': canvases[1], 'isIntersecting': false}, {'target': canvases[2], 'isIntersecting': true}]);
    assert.deepEqual(paintCounts(canvases), [0, 0, 1]);
    const {views} = expectedReport(narrowPlan(), 976);
    assert.deepEqual(canvases[2].calls, paintCalls(views[2].render({...smoothLimitsCanvas, 'points': 213})));
    assert.deepEqual([...observer.targets], [canvases[0], canvases[1]]);

    // A drawn view isn't drawn again
    observer.callback([{'target': canvases[2], 'isIntersecting': true}]);
    assert.deepEqual(paintCounts(canvases), [0, 0, 1]);

    // The tasks draw the rest, in order
    clock.runTimeout();
    assert.deepEqual(paintCounts(canvases), [1, 0, 1]);
    clock.runTimeout();
    assert.deepEqual(paintCounts(canvases), [1, 1, 1]);
    clock.runTimeout();
    assert.deepEqual(paintCounts(canvases), [1, 1, 1]);
    assert.equal(clock.timeouts.size, 0);
    assert.equal(clock.frames.size, 3);
});


test('the report page draws its 3D views at the device pixel ratio', async (context) => {
    const browser = reportBrowser(context, fixturePlan());
    const {clock, window} = browser;
    window.devicePixelRatio = 1.5;
    await startApp(browser);
    const [canvas] = viewCanvases(browser);
    clock.runTimeout();

    // The canvas's bitmap is the drawing's size times the ratio - its style keeps its width, and its height follows
    assert.equal(canvas.width, 1464);
    assert.equal(canvas.height, 999);
    assert.equal(canvas.style.width, '976px');
    assert.equal(canvas.style.height, 'auto');
    const drawing = expectedReport(fixturePlan(), 976).views[0].render({...smoothLimitsCanvas, 'points': 213});
    assert.deepEqual(canvas.calls, paintCalls(drawing, 1.5));
    assert.deepEqual(canvas.calls.slice(0, 4), [
        ['getContext', '2d'], ['setTransform', 1.5, 0, 0, 1.5, 0, 0], ['fillStyle', '#f4f1ea'], ['fillRect', 0, 0, 976, 666]
    ]);

    // A browser without a device pixel ratio draws the views at their size - and at twice their size for printing
    const plainBrowser = reportBrowser(context, fixturePlan());
    plainBrowser.window.devicePixelRatio = undefined;
    await startApp(plainBrowser);
    const [plainCanvas] = viewCanvases(plainBrowser);
    plainBrowser.clock.runTimeout();
    assert.deepEqual([plainCanvas.width, plainCanvas.height, plainCanvas.style.width], [976, 666, '']);
    assert.deepEqual(plainCanvas.calls, paintCalls(drawing));
    fire(plainBrowser, plainBrowser.window, 'beforeprint');
    assert.deepEqual([plainCanvas.width, plainCanvas.height, plainCanvas.style.width], [1952, 1332, '976px']);
    assert.deepEqual(plainCanvas.calls, [...paintCalls(drawing), ...paintCalls(drawing, 2)]);
});


test('the report page draws its 3D views without a measured cell cost', async (context) => {
    // No cell cost in local storage, an invalid one, and no local storage at all
    for (const cellCost of [null, '{', 'unavailable']) {
        const browser = reportBrowser(context, fixturePlan(), {cellCost, 'search': '?debug'});
        const {clock, window} = browser;
        if (cellCost === 'unavailable') {
            Object.defineProperty(window, 'localStorage', {
                get() {
                    throw new Error('Local storage is unavailable');
                }
            });
        }
        await startApp(browser);
        const [canvas] = viewCanvases(browser);
        clock.runTimeout();

        // The view is drawn with the points that fit its time budget at the initial cell cost estimate - every grid
        // cell, smoothed
        const drawing = expectedReport(fixturePlan(), 976).views[0].render({...smoothLimitsCanvas, 'points': 132813});
        assert.equal(drawing.pointLimited, false);
        assert.equal(canvas.calls.length, 333987);
        assert.deepEqual(canvas.calls, paintCalls(drawing));
        assert.deepEqual(canvas.calls.slice(0, 4), [
            ['getContext', '2d'], ['setTransform', 1, 0, 0, 1, 0, 0], ['fillStyle', '#f4f1ea'], ['fillRect', 0, 0, 976, 666]
        ]);

        // The measured cell cost is kept, if there's local storage
        clock.time = 120;
        clock.runFrame();
        assert.deepEqual(browser.logs, [
            'Roadie: render in 0.0 ms',
            'Roadie: 3D view 1 - 30546 operations, 30000 cells, step 1, smooth 5 - drawn in 120.0 ms'
        ]);
        if (cellCost !== 'unavailable') {
            assert.equal(window.localStorage.getItem('roadieCellCost'), '0.00232');
        }
    }
});


test('the report page 3D view titles', async (context) => {
    const browser = reportBrowser(context, fixturePlan());
    const {clock} = browser;
    await startApp(browser);
    const [canvas] = viewCanvases(browser);

    // The canvas is shown at half its size, 20 pixels from the left and 30 from the top, with a 1 pixel border
    canvas.getBoundingClientRect = () => ({'left': 20, 'top': 30, 'width': 488, 'height': 333});
    const mouseMove = (x, y) => {
        fire(browser, canvas, 'mousemove', {'clientX': 21 + x / 2, 'clientY': 31 + y / 2});
        return canvas.title;
    };

    // The view isn't drawn yet
    assert.equal(mouseMove(466, 360), '');

    // The road's segments have titles - the terrain doesn't
    clock.runTimeout();
    assert.equal(mouseMove(466, 360), '2+03: grade 516.5, ground 510.0, fill 6.5');
    assert.equal(mouseMove(467, 361), '2+03: grade 516.5, ground 510.0, fill 6.5');
    assert.equal(mouseMove(319, 368), '1+03: grade 510.2, ground 510.1, fill 0.1');
    assert.equal(mouseMove(319, 300), '');
    assert.equal(mouseMove(5, 5), '');
    assert.equal(mouseMove(6, 5), '');
    assert.equal(mouseMove(614, 385), '3+13: grade 537.9, ground 538.1, cut 0.2');
});


test('the report page plan view opens the 3D explorer', async (context) => {
    const browser = reportBrowser(context, fixturePlan(), {'hash': `${reportHash}&var.vOption=1&var.vZ=500&var.vZoom=2`});
    const {document, main, window} = browser;
    await startApp(browser);

    // Click the plan view - shown at half its size, 20 pixels from the left and 30 from the top - at a point of the
    // site (400 by 300 feet, 2.39 pixels a foot, inside 10 pixels of padding)
    const clickPlan = async (x, y) => {
        const planSvg = main.querySelector('svg.roadie-plan');
        assert.equal(planSvg.getAttribute('width'), '976');
        assert.equal(planSvg.getAttribute('height'), '737');
        planSvg.getBoundingClientRect = () => ({'left': 20, 'top': 30, 'width': 488, 'height': 368.5});
        const position = {'clientX': 20 + (10 + 2.39 * x) / 2, 'clientY': 30 + (10 + 2.39 * (300 - y)) / 2};
        fire(browser, planSvg.firstElementChild, 'click', position);
        const {hash} = window.location;
        await flush();
        return hash;
    };

    // The explorer is centered on the point, on the ground, zoomed in 4 times - it keeps the report's option
    assert.equal(
        await clickPlan(100, 200),
        "#var.vExplore=true&var.vFile='plans%2Ffixture.json'&var.vOption=1&var.vX=100&var.vY=200&var.vZoom=4"
    );
    assert.equal(document.title, 'Fixture Plan - 3D');

    // Points in the padding are the site's edges, and the point's coordinates are rounded to a tenth
    for (const [x, y, expectedX, expectedY] of [[-3, 303, 0, 300], [403, -3, 400, 0], [250.32, 149.78, 250.3, 149.8]]) {
        window.location.hash = `${reportHash}&var.vOption=1`;
        await flush();
        assert.equal(document.title, 'Fixture Plan');
        assert.equal(
            await clickPlan(x, y),
            `#var.vExplore=true&var.vFile='plans%2Ffixture.json'&var.vOption=1&var.vX=${expectedX}&var.vY=${expectedY}&var.vZoom=4`
        );
        assert.equal(document.title, 'Fixture Plan - 3D');
    }
});


test('the report page is rendered again when its width changes', async (context) => {
    const browser = reportBrowser(context, fixturePlan());
    const {clock, document, main, window} = browser;
    await startApp(browser);
    const [canvas] = viewCanvases(browser);
    const [observer] = browser.observers;
    assert.deepEqual(browser.scrolls, [['scrollTo', 0, 0], ['scrollTo', 0, 0]]);

    // Resize the window, and again 50 milliseconds later - the report is rendered 100 milliseconds after the last
    window.innerWidth = 1000;
    fire(browser, window, 'resize');
    assert.deepEqual([...clock.timeouts.values()].map(({time}) => time), [0, 100]);
    clock.time = 50;
    window.innerWidth = 800;
    fire(browser, window, 'resize');
    fire(browser, window, 'resize');
    assert.deepEqual([...clock.timeouts.values()].map(({time}) => time), [0, 150]);

    // The 3D view is drawn meanwhile
    clock.runTimeout();
    clock.runTimeout();
    assert.deepEqual(paintCounts([canvas]), [1]);
    assert.deepEqual([...clock.timeouts.values()].map(({time}) => time), [150]);
    assert.equal(main.querySelector('svg.roadie-plan').getAttribute('width'), '976');

    // The report is rendered at its new width - at its scroll position
    window.scrollY = 300;
    clock.runTimeout();
    assert.equal(clock.time, 150);
    assert.equal(document.title, 'Fixture Plan');
    const expected = document.createElement('div');
    expected.innerHTML = expectedReport(fixturePlan(), 752).html;
    assert.equal(main.innerHTML, expected.innerHTML);
    assert.equal(main.querySelector('svg.roadie-plan').getAttribute('width'), '752');
    assert.deepEqual(browser.scrolls, [['scrollTo', 0, 0], ['scrollTo', 0, 0], ['scrollTo', 0, 0], ['scrollTo', 0, 300]]);

    // Its 3D view is a new canvas, watched by a new observer, and drawn in a later task
    const [newCanvas] = viewCanvases(browser);
    assert.notEqual(newCanvas, canvas);
    assert.equal(newCanvas.width, 752);
    assert.equal(newCanvas.height, 516);
    assert.equal(browser.observers.length, 2);
    assert.deepEqual([...observer.targets], []);
    assert.deepEqual([...browser.observers[1].targets], [newCanvas]);
    assert.deepEqual(paintCounts([newCanvas]), [0]);
    assert.deepEqual([...clock.timeouts.values()].map(({time}) => time), [150]);
    clock.runTimeout();
    const drawing = expectedReport(fixturePlan(), 752).views[0].render({...smoothLimitsCanvas, 'points': 213});
    assert.deepEqual(newCanvas.calls, paintCalls(drawing));
    assert.deepEqual(newCanvas.calls[3], ['fillRect', 0, 0, 752, 516]);

    // The plan view's click handler is the new plan view's
    const planSvg = main.querySelector('svg.roadie-plan');
    planSvg.getBoundingClientRect = () => ({'left': 0, 'top': 0, 'width': 752, 'height': 569});
    fire(browser, planSvg, 'click', {'clientX': 10 + 1.83 * 200, 'clientY': 10 + 1.83 * 150});
    assert.equal(window.location.hash, "#var.vExplore=true&var.vFile='plans%2Ffixture.json'&var.vX=200&var.vY=150&var.vZoom=4");
});


test('the report page draws its 3D views for printing', async (context) => {
    const browser = reportBrowser(context, narrowPlan());
    const {clock, main, window} = browser;
    await startApp(browser);
    const canvases = viewCanvases(browser);
    const {views} = expectedReport(narrowPlan(), 976);

    // The first view is drawn
    clock.runTimeout();
    assert.deepEqual(paintCounts(canvases), [1, 0, 0]);

    // Before printing, the other views are drawn, and every view is painted at twice its size
    fire(browser, window, 'beforeprint');
    assert.deepEqual(paintCounts(canvases), [2, 2, 2]);
    assert.deepEqual(canvases.map((canvas) => [canvas.width, canvas.height]), [[1952, 1332], [1952, 1464], [1952, 1464]]);
    assert.deepEqual(canvases.map((canvas) => canvas.style.width), ['976px', '976px', '976px']);
    assert.deepEqual(canvases.map((canvas) => canvas.style.height), ['auto', 'auto', 'auto']);
    for (const [ixView, canvas] of canvases.entries()) {
        const drawing = views[ixView].render({...smoothLimitsCanvas, 'points': 213});
        assert.deepEqual(canvas.calls, [...paintCalls(drawing), ...paintCalls(drawing, 2)]);
        assert.deepEqual(canvas.calls.filter(([name]) => name === 'setTransform'), [
            ['setTransform', 1, 0, 0, 1, 0, 0], ['setTransform', 2, 0, 0, 2, 0, 0]
        ]);
    }
    assert.deepEqual([...browser.observers[0].targets], []);

    // The print layout's resize doesn't render the report again
    window.innerWidth = 800;
    fire(browser, window, 'resize');
    assert.deepEqual([...clock.timeouts.values()].map(({time}) => time), [0]);
    clock.runTimeout();
    assert.equal(clock.timeouts.size, 0);
    assert.deepEqual(paintCounts(canvases), [2, 2, 2]);

    // After printing, it does
    fire(browser, window, 'afterprint');
    fire(browser, window, 'resize');
    assert.deepEqual([...clock.timeouts.values()].map(({time}) => time), [100]);
    clock.runTimeout();
    assert.equal(main.querySelector('svg.roadie-plan').getAttribute('width'), '752');
    assert.deepEqual(viewCanvases(browser).map((canvas) => [canvas.width, canvas.height]), [
        [752, 516], [752, 564], [752, 564], [752, 564]
    ]);

    // Printing a display with a higher pixel ratio paints the views at its ratio
    window.devicePixelRatio = 3;
    fire(browser, window, 'beforeprint');
    assert.deepEqual(viewCanvases(browser).map((canvas) => [canvas.width, canvas.height]), [
        [2256, 1548], [2256, 1692], [2256, 1692], [2256, 1692]
    ]);
    assert.deepEqual(viewCanvases(browser).map((canvas) => canvas.calls.filter(([name]) => name === 'setTransform')), [
        [['setTransform', 3, 0, 0, 3, 0, 0], ['setTransform', 3, 0, 0, 3, 0, 0]],
        [['setTransform', 3, 0, 0, 3, 0, 0], ['setTransform', 3, 0, 0, 3, 0, 0]],
        [['setTransform', 3, 0, 0, 3, 0, 0], ['setTransform', 3, 0, 0, 3, 0, 0]],
        [['setTransform', 3, 0, 0, 3, 0, 0], ['setTransform', 3, 0, 0, 3, 0, 0]]
    ]);
});


test('the report page stops drawing when it is left', async (context) => {
    const browser = reportBrowser(context, narrowPlan());
    const {clock, document, window} = browser;
    await startApp(browser);
    const canvases = viewCanvases(browser);
    const [observer] = browser.observers;
    clock.runTimeout();
    window.innerWidth = 800;
    fire(browser, window, 'resize');
    assert.deepEqual(paintCounts(canvases), [1, 0, 0]);
    assert.deepEqual([...clock.timeouts.values()].map(({time}) => time), [0, 100]);
    assert.deepEqual([...observer.targets], [canvases[1], canvases[2]]);

    // Leave the report for the documentation - its tasks are canceled, and its views aren't watched
    window.location.hash = '#var.vDoc=true';
    await flush();
    assert.equal(document.title, 'Roadie Road Plan Model');
    assert.equal(clock.timeouts.size, 0);
    assert.deepEqual([...observer.targets], []);

    // An intersection that was already on its way isn't drawn
    observer.callback([{'target': canvases[1], 'isIntersecting': true}]);
    assert.deepEqual(paintCounts(canvases), [1, 0, 0]);

    // The drawn view's measurement is still recorded
    clock.time = 400;
    clock.runFrame();
    assert.equal(window.localStorage.getItem('roadieCellCost'), '0.76');
});
