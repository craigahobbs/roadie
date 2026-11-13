import {FakeIndexedDB, fakeBrowser, fire, flush, startApp} from './appHelpers.js';
import assert from 'node:assert/strict';
import {fixturePlan} from './fixture.js';
import test from 'node:test';


// The fixture plan's JSON text, and the files of a server with it
const fixtureText = JSON.stringify(fixturePlan());
const fixtureFiles = {'plans/fixture.json': fixtureText};


// A measured terrain cell cost, in local storage, that keeps the 3D drawings small
const storage = {'roadieCellCost': '1'};


// The home page's HTML, with its recent plans' HTML and its documentation link's URL
function homeHtml(recentHtml = '', docURL = '#var.vDoc=true') {
    return [
        '<h1>Roadie</h1>',
        '<p>Roadie is a 3D viewer for road grading plan models. A road grading plan model contains the site topography, ' +
            'the road start and end points, and one or more road plan options.</p>',
        '<div class="roadie-open">',
        '<p><label class="roadie-button">Open a road plan<input type="file" id="roadie-file" multiple="" ' +
            'accept=".json,application/json,image/*,application/pdf" hidden=""></label></p>',
        '<p>Select or drop a road plan model JSON file - and its source map image, to show it in the report. ' +
            'The files stay on your computer.</p>',
        '</div>',
        `<div id="roadie-recent">${recentHtml}</div>`,
        '<p>To view a road plan model URL, use the "file" argument: <code>#var.vFile=\'plan.json\'</code></p>',
        '<hr>',
        `<p><a href="${docURL}">Road plan model documentation</a></p>`
    ].join('\n');
}


// An error page's HTML
function errorHtml(messageHtml) {
    return `<h1>Roadie</h1><p>${messageHtml}</p><p><a href="#var=">Open another road plan</a></p>`;
}


// The loading page's HTML
const loadingHtml = '<h1>Roadie</h1><p class="roadie-loading">Loading the road plan…</p>';


// Create a local file
function localFile(browser, name, text, type = 'application/json') {
    return new browser.window.File([text], name, {type});
}


// Select files with the home page's file input
async function selectFiles(browser, files) {
    const input = browser.document.getElementById('roadie-file');
    Object.defineProperty(input, 'files', {'value': files, 'configurable': true});
    fire(browser, input, 'change');
    await flush();
}


// Drop files on the page
async function dropFiles(browser, files) {
    const event = fire(browser, browser.document.body, 'drop', {'dataTransfer': {files}});
    await flush();
    return event;
}


// The report page's headings' text
function headings(browser) {
    return [...browser.main.querySelectorAll('h1, h2, h3')].map((heading) => heading.textContent);
}


// The report page's headings of the fixture plan's first option
const directHeadings = [
    'Fixture Plan', 'Plan Options', 'Direct', 'Plan View', 'Profile', '3D Views', 'Cost', 'Design Warnings', 'Structures'
];


test('the home page', async (context) => {
    const browser = fakeBrowser(context);
    const {document, indexedDB, main} = browser;
    const app = await startApp(browser);
    assert.equal(document.title, 'Roadie');
    assert.equal(main.innerHTML, homeHtml());
    assert.deepEqual(browser.scrolls, [['scrollTo', 0, 0]]);
    assert.equal(app.page, null);

    // The local files database is created, and its files are listed - there are none
    assert.equal(indexedDB.name, 'roadie-viewer');
    assert.equal(indexedDB.version, 1);
    assert.deepEqual([...indexedDB.stores], [['files', {'keyPath': 'name', 'records': new Map()}]]);
    assert.deepEqual(indexedDB.requests, [['files', 'readonly', 'getAll', null]]);

    // Nothing is fetched, logged, or drawn
    assert.deepEqual(browser.fetches, []);
    assert.deepEqual(browser.logs, []);
    assert.equal(browser.clock.timeouts.size, 0);
    assert.equal(browser.clock.frames.size, 0);

    // The page has no keys, and nothing to draw when the window is resized or printed
    assert.equal(fire(browser, document, 'keydown', {'code': 'KeyQ', 'key': 'q'}).defaultPrevented, false);
    assert.equal(fire(browser, document, 'keydown', {'code': 'Escape', 'key': 'Escape'}).defaultPrevented, false);
    browser.window.innerWidth = 800;
    fire(browser, browser.window, 'resize');
    fire(browser, browser.window, 'beforeprint');
    fire(browser, browser.window, 'afterprint');
    assert.equal(browser.window.location.hash, '');
    assert.equal(main.innerHTML, homeHtml());
    assert.deepEqual(browser.scrolls, [['scrollTo', 0, 0]]);
    assert.equal(browser.clock.timeouts.size, 0);
    assert.equal(browser.clock.frames.size, 0);
});


test('the home page lists the recent local plans', async (context) => {
    // Open local plans, a second apart - the last with its map image
    const indexedDB = new FakeIndexedDB();
    let browser = fakeBrowser(context, {indexedDB, storage});
    await startApp(browser);
    browser.clock.time = 1000;
    await selectFiles(browser, [localFile(browser, 'older.json', fixtureText)]);
    browser.clock.time = 2000;
    await dropFiles(browser, [localFile(browser, 'topo.png', 'PNG', 'image/png'), localFile(browser, 'Newer.JSON', fixtureText)]);
    assert.deepEqual(
        indexedDB.records('files').map(({name, type, time}) => [name, type, time]),
        [['older.json', 'application/json', 1000], ['topo.png', 'image/png', 2000], ['Newer.JSON', 'application/json', 2000]]
    );

    // The home page, later - the plans are listed, newest first, with the page's other arguments
    browser = fakeBrowser(context, {indexedDB, 'hash': '#var.vOption=1'});
    await startApp(browser);
    assert.equal(browser.document.title, 'Roadie');
    assert.equal(
        browser.main.innerHTML,
        homeHtml(
            '<h2 id="recent-plans">Recent Plans</h2><ul>' +
                '<li><p><a href="#var.vFile=\'local%3ANewer.JSON\'&amp;var.vOption=1">Newer.JSON</a></p></li>' +
                '<li><p><a href="#var.vFile=\'local%3Aolder.json\'&amp;var.vOption=1">older.json</a></p></li>' +
                '</ul>',
            '#var.vDoc=true&amp;var.vOption=1'
        )
    );

    // A recent plan's link opens it from the database
    browser.window.location.hash = browser.main.querySelector('#roadie-recent a').getAttribute('href');
    await flush();
    assert.equal(browser.document.title, 'Fixture Plan');
    assert.equal(browser.main.querySelector('h2:nth-of-type(2)').textContent, 'Bridge - East');
    assert.deepEqual(indexedDB.requests.slice(-2), [['files', 'readonly', 'getAll', null], ['files', 'readonly', 'get', 'Newer.JSON']]);
});


test('the home page without recent local plans', async (context) => {
    // Only a map image has been opened
    const indexedDB = new FakeIndexedDB();
    let browser = fakeBrowser(context, {indexedDB});
    await startApp(browser);
    await selectFiles(browser, [localFile(browser, 'topo.png', 'PNG', 'image/png')]);
    assert.deepEqual(indexedDB.records('files').map(({name}) => name), ['topo.png']);

    browser = fakeBrowser(context, {indexedDB});
    await startApp(browser);
    assert.equal(browser.main.innerHTML, homeHtml());
});


test('the home page, left before its recent local plans are listed', async (context) => {
    const indexedDB = new FakeIndexedDB();
    let browser = fakeBrowser(context, {indexedDB, storage});
    await startApp(browser);
    await selectFiles(browser, [localFile(browser, 'plan.json', fixtureText)]);

    // Navigate from the home page to the documentation before the database answers
    browser = fakeBrowser(context, {indexedDB});
    const {document, main, window} = browser;
    const started = startApp(browser);
    assert.equal(main.innerHTML, homeHtml());
    window.location.hash = '#var.vDoc=true';
    fire(browser, window, 'hashchange');
    await started;
    assert.equal(document.title, 'Roadie Road Plan Model');
    assert.equal(document.getElementById('recent-plans'), null);
    assert.equal(main.querySelector('h1').textContent, 'struct RoadPlan');
});


test('the model documentation page', async (context) => {
    const browser = fakeBrowser(context, {'hash': '#var.vDoc=true'});
    const {document, main, window} = browser;
    const app = await startApp(browser);
    assert.equal(document.title, 'Roadie Road Plan Model');
    assert.ok(main.innerHTML.startsWith('<p><a href="#var=">Back</a></p>\n<h1 id="struct-roadplan">struct RoadPlan</h1>'));
    assert.equal(document.getElementById('enum-units').textContent, 'enum Units');
    assert.deepEqual(browser.scrolls, [['scrollTo', 0, 0]]);
    assert.equal(app.page, null);
    assert.deepEqual(browser.fetches, []);
    assert.deepEqual(browser.indexedDB.requests, []);

    // A header link scrolls to its header
    window.location.hash = '#var.vDoc=true&enum-units';
    await flush();
    assert.equal(document.title, 'Roadie Road Plan Model');
    assert.deepEqual(browser.scrolls, [['scrollTo', 0, 0], ['scrollIntoView', 'enum-units']]);

    // An unknown header doesn't scroll
    window.location.hash = '#var.vDoc=true&unknown-header';
    await flush();
    assert.equal(main.querySelector('h1').textContent, 'struct RoadPlan');
    assert.deepEqual(browser.scrolls, [['scrollTo', 0, 0], ['scrollIntoView', 'enum-units']]);

    // The back link is the home page
    window.location.hash = main.querySelector('a').getAttribute('href');
    await flush();
    assert.equal(window.location.hash, '#var=');
    assert.equal(document.title, 'Roadie');
    assert.equal(main.innerHTML, homeHtml());
    assert.deepEqual(browser.scrolls, [['scrollTo', 0, 0], ['scrollIntoView', 'enum-units'], ['scrollTo', 0, 0]]);
});


test('a plan URL', async (context) => {
    const browser = fakeBrowser(context, {'hash': '#url=plans/fixture.json', 'files': fixtureFiles, storage});
    const {document, main, window} = browser;

    // The plan is loading
    const started = startApp(browser);
    assert.equal(document.title, 'Roadie');
    assert.equal(main.innerHTML, loadingHtml);
    assert.deepEqual(browser.fetches, ['plans/fixture.json']);

    // The plan's report
    const app = await started;
    assert.equal(document.title, 'Fixture Plan');
    assert.deepEqual(headings(browser), directHeadings);
    assert.equal(app.page.data.file, 'plans/fixture.json');
    assert.equal(app.page.data.plan.title, 'Fixture Plan');
    assert.equal(document.body.classList.contains('roadie-explore'), false);
    assert.deepEqual(browser.scrolls, [['scrollTo', 0, 0], ['scrollTo', 0, 0]]);
    assert.deepEqual(browser.logs, []);

    // The plan has no map image
    assert.equal(main.querySelector('img'), null);
    assert.equal(document.getElementById('source-map'), null);

    // The loaded plan is kept - another of its pages doesn't load it again, or show that it's loading
    window.location.hash = "#var.vFile='plans%2Ffixture.json'&var.vOption=1";
    fire(browser, window, 'hashchange');
    assert.equal(document.title, 'Fixture Plan');
    assert.deepEqual(headings(browser), directHeadings);
    await flush();
    assert.deepEqual(
        headings(browser),
        ['Fixture Plan', 'Plan Options', 'Bridge - East', 'Plan View', 'Profile', '3D Views', 'Cost', 'Design Warnings', 'Structures']
    );
    assert.deepEqual(browser.fetches, ['plans/fixture.json']);

    // A header link scrolls to the report's header
    window.location.hash = "#var.vFile='plans%2Ffixture.json'&cost";
    await flush();
    assert.deepEqual(headings(browser), directHeadings);
    assert.deepEqual(browser.scrolls.at(-1), ['scrollIntoView', 'cost']);
});


test('a plan URL with a source map image', async (context) => {
    const plan = fixturePlan();
    plan.image = 'maps/topo map.png';
    const files = {'plans/site.json': JSON.stringify(plan)};
    const browser = fakeBrowser(context, {'hash': "#var.vFile='plans/site.json'", files, storage});
    await startApp(browser);

    // The image is relative to the plan
    assert.deepEqual(headings(browser), [...directHeadings, 'Source Map']);
    assert.equal(
        browser.document.getElementById('source-map').nextElementSibling.outerHTML,
        '<p><img src="plans/maps/topo%20map.png" alt="The source topographic map" style="max-width: 100%; height: auto;"></p>'
    );
    assert.deepEqual(browser.objectURLs, []);
});


test('a plan that cannot be loaded', async (context) => {
    const browser = fakeBrowser(context, {
        'hash': "#var.vFile='missing.json'",
        'files': {'network.json': null, 'text.json': 'Not JSON', 'null.json': 'null'}
    });
    const {document, main, window} = browser;

    // A plan that isn't found
    const started = startApp(browser);
    assert.equal(main.innerHTML, loadingHtml);
    const app = await started;
    assert.equal(document.title, 'Roadie');
    assert.equal(main.innerHTML, errorHtml('<strong>Error:</strong> Could not load the road plan "missing.json"'));
    assert.equal(app.page, null);

    // A network error, a plan that isn't JSON, and a null plan
    for (const file of ['network.json', 'text.json', 'null.json']) {
        window.location.hash = `#var.vFile='${file}'`;
        await flush();
        assert.equal(document.title, 'Roadie');
        assert.equal(main.innerHTML, errorHtml(`<strong>Error:</strong> Could not load the road plan "${file}"`));
    }
    assert.deepEqual(browser.fetches, ['missing.json', 'network.json', 'text.json', 'null.json']);

    // The plan's URL is text, not HTML
    window.location.hash = `#var.vFile='${encodeURIComponent('<b>&.json')}'`;
    await flush();
    assert.equal(main.innerHTML, errorHtml('<strong>Error:</strong> Could not load the road plan "&lt;b&gt;&amp;.json"'));
    window.location.hash = `#var.vFile='${encodeURIComponent('line1\\n<b>line2</b>.json')}'`;
    await flush();
    assert.deepEqual(browser.fetches.at(-1), 'line1\n<b>line2</b>.json');
    assert.equal(main.querySelector('b'), null);
    assert.ok(main.querySelector('p').textContent.endsWith('Could not load the road plan "line1\n<b>line2</b>.json"'));

    // The error page's link is the home page
    window.location.hash = main.querySelector('a').getAttribute('href');
    await flush();
    assert.equal(main.innerHTML, homeHtml());
});


test('an invalid plan', async (context) => {
    const untitled = fixturePlan();
    delete untitled.title;
    const browser = fakeBrowser(context, {
        'hash': "#var.vFile='plans/untitled.json'",
        'files': {'plans/untitled.json': JSON.stringify(untitled), 'plans/empty.json': JSON.stringify(fixturePlan([]))}
    });
    const {document, main, window} = browser;
    const app = await startApp(browser);
    assert.equal(document.title, 'Roadie');
    assert.equal(
        main.innerHTML,
        errorHtml('<strong>Error:</strong> The road plan "plans/untitled.json" is invalid:</p><p>Required member "title" missing')
    );
    assert.equal(app.page, null);

    // The validation error is text, not HTML
    window.location.hash = "#var.vFile='plans/empty.json'";
    await flush();
    assert.equal(
        main.innerHTML,
        errorHtml(
            '<strong>Error:</strong> The road plan "plans/empty.json" is invalid:</p>' +
                '<p>Invalid value [] (type "object") for member "options", expected type "array" [len &gt; 0]'
        )
    );
});


test('a plan that failed to load is loaded again', async (context) => {
    const files = {};
    const browser = fakeBrowser(context, {'hash': "#var.vFile='plans/fixture.json'", files, storage});
    const {document, main, window} = browser;
    await startApp(browser);
    assert.equal(main.innerHTML, errorHtml('<strong>Error:</strong> Could not load the road plan "plans/fixture.json"'));

    // The plan is there now
    files['plans/fixture.json'] = fixtureText;
    window.location.hash = "#var.vFile='plans/fixture.json'&var.vOption=0";
    fire(browser, window, 'hashchange');
    assert.equal(main.innerHTML, loadingHtml);
    await flush();
    assert.equal(document.title, 'Fixture Plan');
    assert.deepEqual(headings(browser), directHeadings);
    assert.deepEqual(browser.fetches, ['plans/fixture.json', 'plans/fixture.json']);
});


test('a page left while its plan loads', async (context) => {
    // The plan's text arrives when the test resolves it
    const planText = Promise.withResolvers();
    const files = {'plans/fixture.json': planText.promise};
    const browser = fakeBrowser(context, {'hash': "#var.vFile='plans/fixture.json'", files, storage});
    const {document, main, window} = browser;
    const app = await startApp(browser);
    assert.equal(main.innerHTML, loadingHtml);

    // Navigate to the home page before the plan loads
    window.location.hash = '#var=';
    await flush();
    assert.equal(document.title, 'Roadie');
    assert.equal(main.innerHTML, homeHtml());

    // The plan loads - its report isn't rendered
    planText.resolve(fixtureText);
    await flush();
    assert.equal(document.title, 'Roadie');
    assert.equal(main.innerHTML, homeHtml());
    assert.equal(app.page, null);
    assert.equal(browser.clock.timeouts.size, 0);
    assert.equal(browser.observers.length, 0);

    // The loaded plan is kept, though - its report doesn't load it again
    window.location.hash = "#var.vFile='plans/fixture.json'";
    await flush();
    assert.equal(document.title, 'Fixture Plan');
    assert.deepEqual(headings(browser), directHeadings);
    assert.deepEqual(browser.fetches, ['plans/fixture.json']);
});


test('the render time is logged with "?debug"', async (context) => {
    const browser = fakeBrowser(context, {'search': '?debug', 'hash': "#var.vFile='plans/fixture.json'", 'files': fixtureFiles, storage});
    await startApp(browser);
    assert.deepEqual(browser.logs, ['Roadie: render in 0.0 ms']);

    // The plan's pages only
    browser.window.location.hash = '#var.vDoc=true';
    await flush();
    browser.window.location.hash = '#var=';
    await flush();
    assert.deepEqual(browser.logs, ['Roadie: render in 0.0 ms']);
});


test('opening a local plan', async (context) => {
    const browser = fakeBrowser(context, {storage});
    const {document, indexedDB, main, window} = browser;
    const app = await startApp(browser);

    // Select the plan with the home page's file input - the plan's report is its "local:" URL
    const planFile = localFile(browser, 'plan.json', fixtureText);
    browser.clock.time = 1500;
    await selectFiles(browser, [planFile]);
    assert.equal(window.location.hash, "#var.vFile='local%3Aplan.json'");
    assert.equal(document.title, 'Fixture Plan');
    assert.deepEqual(headings(browser), directHeadings);
    assert.equal(app.page.data.file, 'local:plan.json');

    // The file is kept in the database
    assert.deepEqual(indexedDB.records('files'), [{'name': 'plan.json', 'type': 'application/json', 'blob': planFile, 'time': 1500}]);
    assert.equal(indexedDB.records('files')[0].blob, planFile);
    assert.deepEqual(indexedDB.requests, [['files', 'readonly', 'getAll', null], ['files', 'readwrite', 'put', 'plan.json']]);
    assert.deepEqual(browser.fetches, []);

    // The report's links are the local plan's
    assert.equal(main.querySelector('table a').getAttribute('href'), "#var.vFile='local%3Aplan.json'&var.vOption=1");
});


test('opening a local plan and its source map image', async (context) => {
    const plan = fixturePlan();
    plan.image = 'maps/topo.png';
    const planText = JSON.stringify(plan);

    // The plan without its map image - the report says to open it
    const indexedDB = new FakeIndexedDB();
    let browser = fakeBrowser(context, {indexedDB, storage});
    await startApp(browser);
    await selectFiles(browser, [localFile(browser, 'plan.json', planText)]);
    assert.equal(browser.document.title, 'Fixture Plan');
    assert.deepEqual(headings(browser), [...directHeadings, 'Source Map']);
    assert.equal(
        browser.document.getElementById('source-map').nextElementSibling.outerHTML,
        '<p>Open the map image ("maps/topo.png") with the road plan to show it here.</p>'
    );
    assert.equal(browser.main.querySelector('img'), null);
    assert.deepEqual(browser.objectURLs, []);
    assert.deepEqual(indexedDB.requests.slice(-1), [['files', 'readonly', 'get', 'topo.png']]);

    // The plan with its map image (the image's file name is the plan's image's) - the report shows it
    const imageFile = localFile(browser, 'topo.png', 'PNG', 'image/png');
    await dropFiles(browser, [imageFile, localFile(browser, 'plan.json', planText)]);
    assert.equal(browser.window.location.hash, "#var.vFile='local%3Aplan.json'");
    assert.deepEqual(headings(browser), [...directHeadings, 'Source Map']);
    assert.equal(
        browser.document.getElementById('source-map').nextElementSibling.outerHTML,
        '<p><img src="blob:http://localhost/1" alt="The source topographic map" style="max-width: 100%; height: auto;"></p>'
    );
    assert.deepEqual(browser.objectURLs, [imageFile]);
    assert.deepEqual(indexedDB.records('files').map(({name, type}) => [name, type]), [
        ['plan.json', 'application/json'], ['topo.png', 'image/png']
    ]);

    // After a reload, the plan and its image are the database's
    browser = fakeBrowser(context, {indexedDB, storage, 'hash': "#var.vFile='local%3Aplan.json'"});
    await startApp(browser);
    assert.equal(browser.document.title, 'Fixture Plan');
    assert.equal(
        browser.document.getElementById('source-map').nextElementSibling.outerHTML,
        '<p><img src="blob:http://localhost/1" alt="The source topographic map" style="max-width: 100%; height: auto;"></p>'
    );
    assert.deepEqual(browser.objectURLs, [imageFile]);
    assert.deepEqual(indexedDB.requests.slice(-2), [['files', 'readonly', 'get', 'plan.json'], ['files', 'readonly', 'get', 'topo.png']]);
    assert.deepEqual(browser.fetches, []);
});


test('opening a source map image, then its local plan', async (context) => {
    const plan = fixturePlan();
    plan.image = 'topo.png';
    const browser = fakeBrowser(context, {storage});
    const {document, indexedDB, main, window} = browser;
    await startApp(browser);

    // The image alone - the home page stays
    const imageFile = localFile(browser, 'topo.png', 'PNG', 'image/png');
    await selectFiles(browser, [imageFile]);
    assert.equal(window.location.hash, '');
    assert.equal(document.title, 'Roadie');
    assert.equal(main.innerHTML, homeHtml());
    assert.deepEqual(indexedDB.records('files').map(({name}) => name), ['topo.png']);

    // No files at all
    const scrollCount = browser.scrolls.length;
    await selectFiles(browser, []);
    assert.equal(window.location.hash, '');
    assert.equal(main.innerHTML, homeHtml());
    assert.equal(browser.scrolls.length, scrollCount);

    // The plan - the first JSON file is the plan that's viewed
    plan.title = 'First Plan';
    const firstFile = localFile(browser, 'first.json', JSON.stringify(plan));
    plan.title = 'Second Plan';
    const secondFile = localFile(browser, 'second.json', JSON.stringify(plan));
    await selectFiles(browser, [firstFile, secondFile]);
    assert.equal(window.location.hash, "#var.vFile='local%3Afirst.json'");
    assert.equal(document.title, 'First Plan');
    assert.equal(main.querySelector('img').getAttribute('src'), 'blob:http://localhost/1');
    assert.deepEqual(browser.objectURLs, [imageFile]);
    assert.deepEqual(indexedDB.records('files').map(({name}) => name), ['topo.png', 'first.json', 'second.json']);
});


test('opening a local plan again replaces it', async (context) => {
    const browser = fakeBrowser(context, {storage});
    const {document, indexedDB, window} = browser;
    await startApp(browser);
    await selectFiles(browser, [localFile(browser, 'plan.json', fixtureText)]);
    assert.equal(window.location.hash, "#var.vFile='local%3Aplan.json'");
    assert.equal(document.title, 'Fixture Plan');

    // Drop the revised plan on its report
    const plan = fixturePlan();
    plan.title = 'Revised Plan';
    const revisedFile = localFile(browser, 'plan.json', JSON.stringify(plan));
    browser.clock.time = 500;
    await dropFiles(browser, [revisedFile]);
    assert.equal(window.location.hash, "#var.vFile='local%3Aplan.json'");
    assert.equal(document.title, 'Revised Plan');
    assert.equal(browser.main.querySelector('h1').textContent, 'Revised Plan');
    assert.deepEqual(indexedDB.records('files'), [{'name': 'plan.json', 'type': 'application/json', 'blob': revisedFile, 'time': 500}]);
});


test('dragging and dropping files', async (context) => {
    const browser = fakeBrowser(context, {storage});
    const {document, window} = browser;
    const {body} = document;
    await startApp(browser);

    // Dragging over the page marks it as the drop target
    let event = fire(browser, body, 'dragover');
    assert.equal(event.defaultPrevented, true);
    assert.equal(body.className, 'roadie-drop');

    // Dragging from one of the page's elements to another, then out of the page
    event = fire(browser, body, 'dragleave', {'relatedTarget': browser.main});
    assert.equal(event.defaultPrevented, false);
    assert.equal(body.className, 'roadie-drop');
    fire(browser, body, 'dragleave', {'relatedTarget': null});
    assert.equal(body.className, '');

    // Dropping opens the files, not the browser's view of them
    fire(browser, browser.main, 'dragover');
    assert.equal(body.className, 'roadie-drop');
    event = await dropFiles(browser, [localFile(browser, 'plan.json', fixtureText)]);
    assert.equal(event.defaultPrevented, true);
    assert.equal(body.className, '');
    assert.equal(window.location.hash, "#var.vFile='local%3Aplan.json'");
    assert.equal(document.title, 'Fixture Plan');
});


test('a local plan that is not in the database', async (context) => {
    const browser = fakeBrowser(context, {'hash': "#var.vFile='local%3Agone.json'"});
    await startApp(browser);
    assert.equal(browser.document.title, 'Roadie');
    assert.equal(browser.main.innerHTML, errorHtml('<strong>Error:</strong> Could not load the road plan "local:gone.json"'));
    assert.deepEqual(browser.indexedDB.requests, [['files', 'readonly', 'get', 'gone.json']]);
    assert.deepEqual(browser.fetches, []);
});


test('local plans without a working database', async (context) => {
    // No IndexedDB at all, a database that can't be opened, transactions that fail, and requests that fail
    const failures = [
        [null, []],
        ['open', []],
        ['transaction', []],
        ['request', [['files', 'readonly', 'getAll', null], ['files', 'readwrite', 'put', 'plan.json']]]
    ];
    for (const [failure, expectedRequests] of failures) {
        const indexedDB = failure !== null ? new FakeIndexedDB() : null;
        if (indexedDB !== null) {
            indexedDB.failure = failure;
        }

        // The home page has no recent plans
        let browser = fakeBrowser(context, {indexedDB, storage});
        await startApp(browser);
        assert.equal(browser.main.innerHTML, homeHtml());

        // A local plan is viewed from memory
        await selectFiles(browser, [localFile(browser, 'plan.json', fixtureText)]);
        assert.equal(browser.window.location.hash, "#var.vFile='local%3Aplan.json'");
        assert.equal(browser.document.title, 'Fixture Plan');
        assert.deepEqual(headings(browser), directHeadings);
        assert.deepEqual(indexedDB?.requests ?? [], expectedRequests);

        // The home page still has no recent plans
        browser.window.location.hash = '#var=';
        await flush();
        assert.equal(browser.main.innerHTML, homeHtml());

        // After a reload, the plan is gone
        browser = fakeBrowser(context, {indexedDB, storage, 'hash': "#var.vFile='local%3Aplan.json'"});
        await startApp(browser);
        assert.equal(browser.main.innerHTML, errorHtml('<strong>Error:</strong> Could not load the road plan "local:plan.json"'));
    }
});
