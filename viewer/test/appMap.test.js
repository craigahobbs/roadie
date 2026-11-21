import {fakeBrowser, fire, flush, startApp} from './appHelpers.js';
import assert from 'node:assert/strict';
import {fixturePlan} from './fixture.js';
import {planLatLong} from '../lib/geo.js';
import test from 'node:test';


// The fixture plan, placed on the Earth - 400 x 300 feet - with an existing road and a trail, and the plan config's road
const placedPlan = {...fixturePlan(), 'georeference': {'latitude': 46.15, 'longitude': -119.15, 'x': 200, 'y': 150}};
placedPlan.topography = {...placedPlan.topography, 'features': [
    ...placedPlan.topography.features,
    {'type': 'road', 'name': 'Mill Rd', 'points': [{'x': 0, 'y': 10}, {'x': 400, 'y': 10}]},
    {'type': 'trail', 'name': 'Mill Trail', 'points': [{'x': 10, 'y': 0}, {'x': 10, 'y': 300}]},
    {'type': 'road', 'name': 'Track', 'points': [{'x': 20, 'y': 280}, {'x': 380, 'y': 280}], 'added': true},
    {'type': 'exclusion', 'name': 'Lot', 'points': [{'x': 350, 'y': 200}, {'x': 390, 'y': 200}, {'x': 390, 'y': 240}], 'added': true}
]};


// A plan point's latitude and longitude, as a plan config's mark has them
function latLong(x, y) {
    const [latitude, longitude] = planLatLong(placedPlan, x, y);
    return {'latitude': Math.round(latitude * 1e7) / 1e7, 'longitude': Math.round(longitude * 1e7) / 1e7};
}


// The plan config - an area the model found, an existing road, and a place to pass through
const barn = {
    'name': 'Barn', 'points': [[100, 100], [160, 100], [160, 150], [100, 150]].map(([x, y]) => latLong(x, y)),
    'found': {'place': 'Barn', 'model': 'test-model', 'why': 'A block.'}
};
const track = {'name': 'Track', 'points': [[20, 280], [380, 280]].map(([x, y]) => latLong(x, y))};
const gate = {'name': 'Gate', ...latLong(300, 50)};
const siteConfig = {
    'title': 'Hill Road',
    'units': 'feet',
    'start': {'latitude': 46.149, 'longitude': -119.151},
    'end': {'latitude': 46.151, 'longitude': -119.149},
    'exclusions': [barn],
    'roads': [track],
    'passThrough': [gate]
};


// Start the application with a plan opened from a file (and its map image's file, if "imageName" isn't null), and open
// its map
async function startMap(context, plan = {...placedPlan, 'site': siteConfig}, imageName = null) {
    const browser = fakeBrowser(context, {'storage': {'sageRoadCellCost': '1'}});
    const app = await startApp(browser);
    const input = browser.document.getElementById('sageroad-file');
    const files = [new browser.window.File([JSON.stringify(plan)], 'road.json', {'type': 'application/json'})];
    if (imageName !== null) {
        files.push(new browser.window.File(['png'], imageName, {'type': 'image/png'}));
    }
    Object.defineProperty(input, 'files', {'value': files, 'configurable': true});
    fire(browser, input, 'change');
    for (let count = 0; count < 20 && browser.document.getElementById('sageroad-map')?.disabled !== false; count++) {
        await flush();
    }
    fire(browser, browser.document.getElementById('sageroad-map'), 'click');
    for (let count = 0; count < 20 && browser.document.getElementById('sageroad-map-svg') === null; count++) {
        await flush();
    }
    const svg = browser.document.getElementById('sageroad-map-svg');
    svg.getBoundingClientRect = () => ({'left': 10, 'top': 20, 'width': 1000, 'height': 650});
    return {browser, app, 'page': app.page, svg};
}


// Fire a pointer event at a plan point (or a map point, "[x, y]" pixels in the map) - returns the map point
function pointer(browser, page, type, planPoint = null, mapPoint = null) {
    const [x, y] = mapPoint ?? page.toScreen(planPoint);
    fire(browser, page.svg, type, {'clientX': x + 10, 'clientY': y + 20, 'pointerId': 1, 'button': 0});
    return [x, y];
}


// Click a plan point (or a map point)
function clickMap(browser, page, planPoint = null, mapPoint = null) {
    pointer(browser, page, 'pointerdown', planPoint, mapPoint);
    pointer(browser, page, 'pointerup', planPoint, mapPoint);
}


// The map's marks - each one's SVG element names, and its text
function marks(browser) {
    return [...browser.document.querySelectorAll('#sageroad-map-marks .sageroad-map-mark')].map((mark) => (
        [[...mark.children].map((child) => child.tagName).join(' '), mark.textContent]
    ));
}


// Round a mark's points, for comparing
function rounded(points) {
    return points.map((point) => point.map((value) => Math.round(value * 10) / 10));
}


test('the map page', async (context) => {
    // The loaded plan's map - its marks, over its contours. The found mark is dashed.
    const {browser, app, page, svg} = await startMap(context);
    const {document, window} = browser;
    assert.equal(window.location.hash, '#var.vMap=true');
    assert.equal(document.title, 'Edit Map');
    assert.equal(document.body.classList.contains('sageroad-map-window'), true);
    assert.deepEqual([...document.querySelectorAll('.sageroad-map-header h1, .sageroad-map-header .sageroad-button')].map(
        (element) => element.textContent
    ), ['Edit Map', 'Done', 'Cancel']);
    assert.equal(document.getElementById('sageroad-map-selection').textContent, 'Select a mark to rename or delete it.');
    assert.deepEqual([svg.getAttribute('width'), svg.getAttribute('height')], ['1000', '650']);
    assert.deepEqual(marks(browser), [['polygon text', 'Barn'], ['polyline text', 'Track'], ['circle text', 'Gate']]);
    assert.ok(document.querySelector('#sageroad-map-marks polygon').getAttribute('stroke-dasharray') === '6 4');
    assert.equal(document.querySelector('#sageroad-map-marks polyline').getAttribute('stroke-dasharray'), null);
    const toolStates = [...document.querySelectorAll('[data-tool]')].map(
        (button) => [button.textContent, button.getAttribute('aria-pressed')]
    );
    assert.deepEqual(toolStates, [
        ['Select', 'true'], ['Area to avoid', 'false'], ['Existing road', 'false'], ['Place to pass through', 'false']
    ]);
    assert.ok(document.getElementById('sageroad-map-hint').textContent.startsWith('Select a mark'));
    assert.equal(document.querySelectorAll('#sageroad-map-backdrop-layer path').length, 2);
    assert.equal(document.getElementById('sageroad-map-view').getAttribute('transform'), 'matrix(2.0583 0 0 -2.0583 88.3333 633.75)');

    // The site's features - its stream, road, and trail, its rock outcrop and its own exclusion area, and its road
    // options, but not its exclusion area or its road that are the config's marks - and its start and end points
    const features = [...document.querySelectorAll('#sageroad-map-features polyline')].map(
        (line) => [line.getAttribute('stroke'), line.getAttribute('stroke-dasharray')]
    );
    assert.deepEqual(features, [
        ['#2a6fdb', null], ['#6e675f', null], ['#6e675f', '5 4'], ['#d6246e', null], ['#d6246e', null], ['#1a8f3c', null],
        ['#c0392b', null]
    ]);
    assert.deepEqual([...document.querySelectorAll('#sageroad-map-features polygon')].map((polygon) => polygon.getAttribute('stroke')), [
        '#8a6a45', '#555555'
    ]);

    // Select the found area - its panel says how it was found
    clickMap(browser, page, [130, 125]);
    assert.equal(document.querySelector('#sageroad-map-selection h2').textContent, 'Area to avoid');
    assert.equal(document.getElementById('sageroad-map-name').value, 'Barn');
    assert.ok(document.getElementById('sageroad-map-found').textContent.startsWith(
        'A run found it for the notes\' place "Barn". The model "test-model" found it on the site\'s map - "A block."'
    ));
    assert.equal(document.querySelectorAll('#sageroad-map-marks circle').length, 4 + 1);

    // Drag its corner - it's the author's, then
    pointer(browser, page, 'pointerdown', [160, 150]);
    const [cornerX, cornerY] = page.toScreen([160, 150]);
    pointer(browser, page, 'pointermove', null, [cornerX + 2, cornerY]);
    pointer(browser, page, 'pointermove', null, [cornerX + 20.6, cornerY - 20.6]);
    pointer(browser, page, 'pointerup', null, [cornerX + 20.6, cornerY - 20.6]);
    assert.deepEqual(rounded(page.marks[0].points), [[100, 100], [160, 100], [170, 160], [100, 150]]);
    assert.deepEqual([page.marks[0].found, page.marks[0].source], [null, null]);
    assert.equal(document.getElementById('sageroad-map-found'), null);
    assert.equal(document.querySelector('#sageroad-map-marks polygon').getAttribute('stroke-dasharray'), null);

    // A click on a point that doesn't move keeps the selection - and a pointer that moves before it's down does nothing
    clickMap(browser, page, [100, 100]);
    pointer(browser, page, 'pointermove', [50, 50]);
    assert.equal(page.selected, 0);

    // Select the place, and rename it - a name that's empty isn't one
    clickMap(browser, page, [300, 50]);
    assert.equal(document.querySelector('#sageroad-map-selection h2').textContent, 'Place to pass through');
    assert.equal(document.getElementById('sageroad-map-found'), null);
    const name = document.getElementById('sageroad-map-name');
    name.value = '  ';
    fire(browser, name, 'input');
    assert.equal(page.marks[2].name, 'Gate');
    name.value = 'North Gate';
    fire(browser, name, 'input');
    assert.deepEqual(marks(browser)[2], ['circle text', 'North Gate']);

    // Select the road by its line, and nothing - the map's empty ground
    clickMap(browser, page, [200, 280]);
    assert.equal(document.querySelector('#sageroad-map-selection h2').textContent, 'Existing road');
    clickMap(browser, page, [250, 200]);
    assert.equal(document.getElementById('sageroad-map-selection').textContent, 'Select a mark to rename or delete it.');

    // Draw an area - a click near the last corner (a double-click's) isn't another, Backspace removes the last, and a
    // double-click finishes it
    fire(browser, document.querySelector('[data-tool="area"]'), 'click');
    assert.ok(document.getElementById('sageroad-map-hint').textContent.startsWith('Click the area\'s corners'));
    clickMap(browser, page, [20, 20]);
    clickMap(browser, page, [60, 20]);
    clickMap(browser, page, [60.5, 20]);
    clickMap(browser, page, [90, 90]);
    assert.equal(page.drawing.length, 3);
    fire(browser, document, 'keydown', {'key': 'Backspace'});
    assert.equal(page.drawing.length, 2);
    fire(browser, svg, 'dblclick');
    assert.equal(page.drawing.length, 2);
    clickMap(browser, page, [60, 60]);
    fire(browser, svg, 'dblclick');
    assert.deepEqual([page.marks.length, page.marks[3].name, page.marks[3].kind, page.drawing], [4, 'Exclusion 2', 'area', null]);
    assert.deepEqual(rounded(page.marks[3].points), [[20, 20], [60, 20], [60, 60]]);
    assert.equal(document.querySelector('#sageroad-map-selection h2').textContent, 'Area to avoid');

    // Draw a road - Enter finishes it - and a road that's cancelled
    fire(browser, document.querySelector('[data-tool="road"]'), 'click');
    clickMap(browser, page, [20, 200]);
    assert.deepEqual(marks(browser).at(-1), ['polyline circle', '']);
    clickMap(browser, page, [100, 220]);
    fire(browser, document, 'keydown', {'key': 'Enter'});
    assert.deepEqual([page.marks.length, page.marks[4].name], [5, 'Road 2']);
    clickMap(browser, page, [20, 240]);
    fire(browser, document, 'keydown', {'key': 'Escape'});
    assert.deepEqual([page.drawing, page.selected, page.marks.length], [null, null, 5]);

    // Draw places - each click is one, named for its count. A double-click is one place, not two.
    fire(browser, document.querySelector('[data-tool="place"]'), 'click');
    clickMap(browser, page, [200, 100]);
    clickMap(browser, page, [200.5, 100]);
    fire(browser, svg, 'dblclick');
    clickMap(browser, page, [220, 100]);
    assert.deepEqual(page.marks.slice(5).map((mark) => mark.name), ['Place 2', 'Place 3']);

    // Delete the last place - a click where it was adds it again
    document.getElementById('sageroad-map-delete').click();
    assert.deepEqual([page.marks.length, page.selected, document.getElementById('sageroad-map-selection').textContent],
        [6, null, 'Select a mark to rename or delete it.']);
    clickMap(browser, page, [220, 100]);
    assert.deepEqual([page.marks.length, page.marks[6].name, page.selected], [7, 'Place 3', 6]);
    document.getElementById('sageroad-map-delete').click();
    assert.deepEqual([page.marks.length, page.selected], [6, null]);

    // The keys of the selection's name are its own - and keys without a drawing do nothing
    fire(browser, document.querySelector('[data-tool="select"]'), 'click');
    clickMap(browser, page, [200, 100]);
    document.getElementById('sageroad-map-name').focus();
    fire(browser, document.getElementById('sageroad-map-name'), 'keydown', {'key': 'Escape'});
    assert.equal(page.selected, 5);
    document.getElementById('sageroad-map-name').blur();
    fire(browser, document, 'keydown', {'key': 'Backspace'});
    fire(browser, document, 'keydown', {'key': 'Enter'});
    assert.deepEqual([page.selected, page.marks.length], [5, 6]);

    // Another button's pointer (a context menu's has no pointer up) doesn't drag the map - nor does a cancelled pointer
    const viewBefore = {...page.view};
    fire(browser, svg, 'pointerdown', {'clientX': 510, 'clientY': 320, 'pointerId': 1, 'button': 2});
    pointer(browser, page, 'pointermove', null, [600, 350]);
    pointer(browser, page, 'pointerdown', null, [500, 300]);
    fire(browser, svg, 'pointercancel');
    pointer(browser, page, 'pointermove', null, [600, 350]);
    assert.deepEqual(page.view, viewBefore);

    // Drag the map to move it, and scroll to zoom it around the pointer - within its limits
    pointer(browser, page, 'pointerdown', null, [500, 300]);
    pointer(browser, page, 'pointermove', null, [600, 350]);
    pointer(browser, page, 'pointerup', null, [600, 350]);
    assert.deepEqual(rounded([[page.view.x, page.view.y]]), [[151.4, 174.3]]);
    const anchor = page.toPlan([300, 200]);
    const wheel = fire(browser, svg, 'wheel', {'clientX': 310, 'clientY': 220, 'deltaY': -100});
    assert.equal(wheel.defaultPrevented, true);
    assert.equal(Math.round(page.view.scale * 100) / 100, 2.51);
    assert.deepEqual(rounded([page.toPlan([300, 200])]), rounded([anchor]));
    fire(browser, svg, 'wheel', {'clientX': 310, 'clientY': 220, 'deltaY': -10000});
    fire(browser, svg, 'wheel', {'clientX': 310, 'clientY': 220, 'deltaY': 10000});
    assert.equal(Math.round(page.view.scale * 100) / 100, 1.03);

    // The map is resized with its window - it's its element's size (its height is a proportion of its width, if its
    // element has none), and the moved and zoomed map keeps its view
    const mapElement = document.getElementById('sageroad-map');
    const viewMoved = {...page.view};
    Object.defineProperty(mapElement, 'clientWidth', {'value': 800, 'configurable': true});
    fire(browser, window, 'resize');
    assert.deepEqual([svg.getAttribute('width'), svg.getAttribute('height')], ['800', '520']);
    Object.defineProperty(mapElement, 'clientHeight', {'value': 500, 'configurable': true});
    fire(browser, window, 'resize');
    assert.deepEqual([svg.getAttribute('width'), svg.getAttribute('height')], ['800', '500']);
    assert.deepEqual(page.view, viewMoved);

    // A map smaller than the smallest is the smallest
    Object.defineProperty(mapElement, 'clientWidth', {'value': 200, 'configurable': true});
    Object.defineProperty(mapElement, 'clientHeight', {'value': 100, 'configurable': true});
    fire(browser, window, 'resize');
    assert.deepEqual([svg.getAttribute('width'), svg.getAttribute('height')], ['320', '240']);

    // Done - the marks are the loaded plan's config's: the author's edits, the unchanged road as it was, and the new marks
    document.getElementById('sageroad-map-done').click();
    await flush();
    assert.equal(window.location.hash, '#var=');
    assert.equal(document.body.classList.contains('sageroad-map-window'), false);
    const {site} = app.loaded;
    assert.deepEqual([app.loaded.changed, app.loaded.saved], [true, false]);
    assert.deepEqual(site.exclusions.map((area) => [area.name, area.found]), [['Barn', undefined], ['Exclusion 2', undefined]]);
    assert.deepEqual(site.exclusions[0].points.slice(0, 2), barn.points.slice(0, 2));
    assert.notDeepEqual(site.exclusions[0].points[2], barn.points[2]);
    assert.deepEqual(site.roads, [track, {'name': 'Road 2', 'points': site.roads[1].points}]);
    assert.deepEqual(site.passThrough, [
        {'name': 'North Gate', ...latLong(300, 50)}, {'name': 'Place 2', ...site.passThrough[1]}
    ]);
    assert.ok(document.getElementById('sageroad-loaded').innerHTML.includes(
        '<strong>Exclusion areas:</strong> 2. <strong>Existing roads:</strong> 2. <strong>Places to pass through:</strong> 2.'
    ));
});


test('the map page, its backdrops', async (context) => {
    // The plan's topographic map image (a data URL), and its shaded relief - drawn on a canvas
    const image = 'data:image/png;base64,iVBORw==';
    const {browser, page} = await startMap(context, {...placedPlan, image, 'site': siteConfig});
    const {document} = browser;
    const backdrop = document.getElementById('sageroad-map-backdrop');
    assert.deepEqual([...backdrop.options].map((option) => [option.value, option.disabled]), [
        ['contours', false], ['map', false], ['relief', false]
    ]);
    backdrop.value = 'map';
    fire(browser, backdrop, 'change');
    const imageElement = () => document.querySelector('#sageroad-map-backdrop-layer image');
    assert.deepEqual([imageElement().getAttribute('href'), imageElement().getAttribute('width')], [image, '400']);
    assert.equal(imageElement().parentElement.getAttribute('transform'), 'translate(0 300) scale(1 -1)');
    backdrop.value = 'relief';
    fire(browser, backdrop, 'change');
    assert.equal(imageElement().getAttribute('href'), 'data:image/png;base64,41x31');
    const {reliefURL} = page;
    backdrop.value = 'contours';
    fire(browser, backdrop, 'change');
    assert.equal(imageElement(), null);
    backdrop.value = 'relief';
    fire(browser, backdrop, 'change');
    assert.equal(page.reliefURL, reliefURL);

    // A plan without a map image has no map backdrop - nor does a plan whose map image's file is missing
    const noImage = await startMap(context);
    assert.equal(noImage.browser.document.querySelector('#sageroad-map-backdrop option[value="map"]').disabled, true);
    const missing = await startMap(context, {...placedPlan, 'image': 'road.png', 'site': siteConfig});
    assert.equal(missing.browser.document.querySelector('#sageroad-map-backdrop option[value="map"]').disabled, true);

    // A plan's map image file is a local file - its object URL is made once
    const fileImage = await startMap(context, {...placedPlan, 'image': 'plans/road.png', 'site': siteConfig}, 'road.png');
    assert.equal(fileImage.page.imageURL, 'blob:http://localhost/1');
    assert.equal(fileImage.browser.document.querySelector('#sageroad-map-backdrop option[value="map"]').disabled, false);
    assert.deepEqual(await fileImage.app.imageURL(null, 'plans/road.png'), {'url': 'blob:http://localhost/1', 'missing': false});
    assert.equal(fileImage.browser.objectURLs.length, 1);
});


test('the map page, a plan without a site, and Cancel', async (context) => {
    // A plan without a georeference - it's not on the Earth
    const {browser, app} = await startMap(context, {...fixturePlan(), 'site': siteConfig}).catch(() => ({}));
    assert.equal(browser, undefined);
    assert.equal(app, undefined);

    // The map of a loaded plan that has no site - its config, alone
    const config = fakeBrowser(context, {'hash': '#var.vMap=true', 'storage': {'sageRoadLoaded': JSON.stringify({
        'name': null, 'file': null, 'site': siteConfig, 'changed': false, 'saved': false
    })}});
    await startApp(config);
    await flush();
    assert.equal(config.document.title, 'Edit Map');
    assert.ok(config.main.innerHTML.includes('The loaded plan has no site yet - run it, and then draw on its map.'));
    assert.ok(config.main.innerHTML.includes('<a href="#var=">Back</a>'));

    // The map without a loaded plan, and a page that's left before its plan is read
    const none = fakeBrowser(context, {'hash': '#var.vMap=true'});
    const noneApp = await startApp(none);
    assert.ok(none.main.innerHTML.includes('The loaded plan has no site yet'));
    noneApp.page.close();
    await noneApp.page.load();
    noneApp.page.resize();
    noneApp.page.keyDown({'key': 'Enter'});

    // A map that fits the site (it isn't moved or zoomed) fits it again when it's resized - the site's taller than it's
    // wide, so its height fits
    const {browser: fitted, page: fittedPage} = await startMap(context);
    const fittedMap = fitted.document.getElementById('sageroad-map');
    Object.defineProperty(fittedMap, 'clientWidth', {'value': 1200, 'configurable': true});
    Object.defineProperty(fittedMap, 'clientHeight', {'value': 400, 'configurable': true});
    fire(fitted, fitted.window, 'resize');
    const {topo} = fittedPage;
    assert.deepEqual(fittedPage.view, {'x': topo.width / 2, 'y': topo.height / 2, 'scale': 400 / topo.height * 0.95, 'isFit': true});
    assert.deepEqual(fittedPage.toScreen([topo.width / 2, topo.height / 2]), [600, 200]);

    // Cancel - the marks aren't the loaded plan's, and Done without changes doesn't change the loaded plan
    const {browser: cancel, app: cancelApp, page} = await startMap(context);
    clickMap(cancel, page, [300, 50]);
    cancel.document.getElementById('sageroad-map-delete').click();
    cancel.window.location.hash = cancel.document.querySelector('a.sageroad-button').getAttribute('href');
    await flush();
    assert.deepEqual(cancelApp.loaded.site.passThrough, [gate]);
    const {browser: unchanged, app: unchangedApp} = await startMap(context);
    const {loaded} = unchangedApp;
    unchanged.document.getElementById('sageroad-map-done').click();
    await flush();
    assert.equal(unchangedApp.loaded, loaded);

    // A map that's left while its map image is read
    const {browser: left, app: leftApp, page: leftPage} = await startMap(context, {...placedPlan, 'image': 'road.png', 'site': siteConfig});
    const localFile = leftApp.localFile.bind(leftApp);
    let resolveImage = null;
    leftApp.localFile = (fileName) => (
        fileName === 'road.png' ? new Promise((resolve) => {
            resolveImage = resolve;
        }) : localFile(fileName)
    );
    const html = left.main.innerHTML;
    const loading = leftPage.load();
    await flush();
    leftPage.close();
    resolveImage(null);
    await loading;
    assert.equal(left.main.innerHTML, html);
});


test('the map page, default names and empty marks', async (context) => {
    // A found area without a model's reason, an area without a name, and a place the notes give the coordinates of - and
    // no roads
    const config = {
        ...siteConfig,
        'exclusions': [
            {...barn, 'found': {'place': 'Barn', 'model': 'test-model'}},
            {'points': [[250, 200], [300, 200], [300, 250]].map(([x, y]) => latLong(x, y))}
        ],
        'passThrough': [{...gate, 'found': {'place': 'Gate'}}]
    };
    delete config.roads;
    const {browser, app, page, svg} = await startMap(context, {...placedPlan, 'site': config});
    const {document} = browser;
    const captures = [];
    svg.setPointerCapture = (pointerId) => captures.push(pointerId);
    clickMap(browser, page, [130, 125]);
    assert.deepEqual(captures, [1]);
    assert.ok(document.getElementById('sageroad-map-found').textContent.startsWith(
        'A run found it for the notes\' place "Barn". The model "test-model" found it on the site\'s map. Edit it'
    ));
    clickMap(browser, page, [290, 210]);
    assert.equal(document.getElementById('sageroad-map-name').value, 'Exclusion 2');
    clickMap(browser, page, [300, 50]);
    assert.ok(document.getElementById('sageroad-map-found').textContent.includes(' Its coordinates are the notes\'. '));

    // Rename the place - it's the author's - and a new place's default name is the next that isn't a mark's
    const name = document.getElementById('sageroad-map-name');
    name.value = 'Place 2';
    fire(browser, name, 'input');
    assert.equal(document.getElementById('sageroad-map-found'), null);
    fire(browser, document.querySelector('[data-tool="place"]'), 'click');
    clickMap(browser, page, [200, 100]);
    assert.deepEqual(page.marks.filter((mark) => mark.kind === 'place').map((mark) => mark.name), ['Place 2', 'Place 3']);

    // A kind without marks isn't the plan config's
    fire(browser, document.querySelector('[data-tool="select"]'), 'click');
    for (const point of [[200, 100], [300, 50]]) {
        clickMap(browser, page, point);
        document.getElementById('sageroad-map-delete').click();
    }
    document.getElementById('sageroad-map-done').click();
    await flush();
    const {site} = app.loaded;
    assert.deepEqual(['exclusions' in site, 'roads' in site, 'passThrough' in site], [true, false, false]);
    assert.deepEqual(site.exclusions, config.exclusions);
});
