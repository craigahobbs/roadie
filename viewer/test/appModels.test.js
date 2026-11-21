import {downloadProgress, ollamaMissingHtml} from '../lib/modelsPage.js';
import {fakeBrowser, fire, flush, startApp} from './appHelpers.js';
import assert from 'node:assert/strict';
import {availableModelsURL} from '../lib/models.js';
import test from 'node:test';


// Ollama's URLs
const tagsURL = 'http://127.0.0.1:11434/api/tags';
const showURL = 'http://127.0.0.1:11434/api/show';
const deleteURL = 'http://127.0.0.1:11434/api/delete';
const pullURL = 'http://127.0.0.1:11434/api/pull';


// Ollama's models - one reads images
const gemma = {'name': 'gemma3:27b', 'size': 17000000000, 'modified_at': '2026-10-01T09:00:00Z', 'details': {'parameter_size': '27.4B'}};
const qwen = {'name': 'qwen3:8b', 'size': 5200000000, 'modified_at': '2026-11-02T10:00:00Z', 'details': {'parameter_size': '8.2B'}};


// Ollama's answer to a model's capabilities - an MLX model's aren't said
function showText({body}) {
    const {model} = JSON.parse(body);
    if (model.startsWith('mlx')) {
        return '{}';
    }
    return JSON.stringify({'capabilities': model.startsWith('gemma3') ? ['completion', 'vision'] : ['completion']});
}


// The models to download - Ollama Chat's list - most read images, one doesn't say, and one doesn't answer questions
const available = [
    {'name': 'gemma3', 'description': 'Gemma <3>', 'modified': '2026-10-01', 'downloads': 3000000, 'capabilities': ['vision', 'tools'],
        'variants': [
            {'id': 'gemma3:4b', 'size': '4b', 'parameters': 4000000000},
            {'id': 'gemma3:27b-cloud', 'size': '27b-cloud', 'parameters': 27000000000, 'cloud': true}
        ]},
    {'name': 'qwen3-vl', 'description': 'Qwen 3 VL', 'modified': '2026-11-10', 'downloads': 1000, 'capabilities': ['vision'], 'variants': [
        {'id': 'qwen3-vl:8b-mlx', 'size': '8b-mlx', 'parameters': 8000000000, 'mlx': true}
    ]},
    {'name': 'llama3.2-vision', 'description': 'Llama 3.2 Vision', 'modified': '2026-09-01', 'downloads': 5000, 'capabilities': ['vision'],
        'variants': [
            {'id': 'llama3.2-vision:11b', 'size': '11b', 'parameters': 11000000000},
            {'id': 'llama3.2-vision:90b', 'size': '90b', 'parameters': 90000000000}
        ]},
    {'name': 'qwen3', 'description': 'Qwen 3', 'modified': '2026-11-01', 'downloads': 2000, 'capabilities': [],
        'variants': [{'id': 'qwen3:8b', 'size': '8b', 'parameters': 8000000000}]},
    {'name': 'nomic-embed-text', 'description': 'Nomic Embed', 'modified': '2026-11-01', 'downloads': 100, 'capabilities': ['embedding'],
        'variants': [{'id': 'nomic-embed-text:latest', 'size': 'latest', 'parameters': 137000000}]}
];


// This computer's system information - a Mac with Apple silicon and 16 GB of memory
const systemText = JSON.stringify({'memory': 17179869184, 'mlx': true});


// A model download's response - the test writes its progress reports, and ends it. Aborting the download errors it.
function pullStream(options) {
    const encoder = new TextEncoder();
    let streamController;
    const body = new ReadableStream({
        start(controller) {
            streamController = controller;
        }
    });
    options.signal.addEventListener('abort', () => streamController.error(new DOMException('The download was aborted', 'AbortError')));
    return {
        'model': JSON.parse(options.body).model,
        'response': {'ok': true, body},
        'write': (report) => streamController.enqueue(encoder.encode(`${JSON.stringify(report)}\n`)),
        'end': () => streamController.close()
    };
}


// A browser of Ollama with models ("models" - its tags' models, which the test may change) and model downloads (the
// browser's "pulls"). The window's confirmations are recorded ("confirms"), and answered with "confirmAnswer".
function ollamaBrowser(context, hash, {models = [gemma, qwen], files = {}} = {}) {
    const ollama = {models, 'pulls': [], 'confirms': [], 'confirmAnswer': true};
    const browser = fakeBrowser(context, {hash, 'files': {
        [tagsURL]: () => (ollama.models === null ? null : JSON.stringify({'models': ollama.models})),
        [showURL]: showText,
        [pullURL]: (options) => {
            const pull = pullStream(options);
            ollama.pulls.push(pull);
            return pull.response;
        },
        ...files
    }});
    browser.window.confirm = (message) => {
        ollama.confirms.push(message);
        return ollama.confirmAnswer;
    };
    return {browser, ollama};
}


// The rows of a table's cells' text
function tableRows(table) {
    return [...table.querySelectorAll('tr')].map((row) => [...row.children].map((cell) => cell.textContent));
}


// Click a button
function click(browser, selector) {
    fire(browser, browser.document.querySelector(selector), 'click');
}


test('downloadProgress and ollamaMissingHtml', () => {
    assert.deepEqual([
        downloadProgress({'completed': 0, 'total': null}),
        downloadProgress({'completed': 5, 'total': 0}),
        downloadProgress({'completed': 268435456, 'total': 1073741824})
    ], ['0%', '0%', '25% of 1.0 GB']);
    assert.equal(ollamaMissingHtml('its models can\'t be listed'), 'Ollama isn\'t running on this computer, so its models can\'t be ' +
        'listed - <a href="https://ollama.com/download" target="_blank" rel="noopener">install Ollama</a>, or start it, and then ' +
        'reload this page.');
});


test('the models page', async (context) => {
    // The models on this computer - whether they read images, their parameters, sizes, and modified dates
    const {browser, ollama} = ollamaBrowser(context, '#var.vModels=true');
    const {document} = browser;
    await startApp(browser);
    await flush();
    assert.equal(document.title, 'Ollama Models');
    assert.deepEqual([...document.querySelectorAll('h1, h2')].map((heading) => heading.textContent),
        ['Ollama Models', 'Downloaded Models']);
    assert.equal(document.querySelector('#sageroad p a').getAttribute('href'), '#var=');
    assert.equal(document.getElementById('sageroad-download').getAttribute('href'), '#var.vDownload=true');
    const table = () => document.querySelector('#sageroad-models table');
    assert.deepEqual(tableRows(table()), [
        ['Model', 'Reads Images', 'Parameters', 'Size', 'Modified', ''],
        ['gemma3:27b', 'Yes', '27.4B', '15.8 GB', '2026-10-01', 'DeleteUpdateInfo'],
        ['qwen3:8b', 'No', '8.2B', '4.8 GB', '2026-11-02', 'DeleteUpdateInfo']
    ]);
    assert.deepEqual([...table().querySelectorAll('a')].map((link) => [link.href, link.target]), [
        ['https://ollama.com/library/gemma3', '_blank'], ['https://ollama.com/library/qwen3', '_blank']
    ]);

    // Delete a model - the user is asked first
    ollama.confirmAnswer = false;
    click(browser, 'button[data-delete="qwen3:8b"]');
    await flush();
    assert.deepEqual(ollama.confirms, ['Delete the model "qwen3:8b"?']);
    assert.equal(browser.fetches.includes(deleteURL), false);
    const deletes = [];
    const {window} = browser;
    const {fetch} = window;
    window.fetch = (url, options) => {
        if (url === deleteURL) {
            deletes.push(JSON.parse(options.body).model);
            ollama.models = [gemma];
            return Promise.resolve({'ok': true});
        }
        return fetch(url, options);
    };
    ollama.confirmAnswer = true;
    click(browser, 'button[data-delete="qwen3:8b"]');
    await flush();
    assert.deepEqual(deletes, ['qwen3:8b']);
    assert.deepEqual(tableRows(table()).map(([id]) => id), ['Model', 'gemma3:27b']);

    // A model that can't be deleted
    window.fetch = (url, options) => (url === deleteURL ? Promise.resolve({
        'ok': false, 'status': 404, 'text': () => Promise.resolve('{"error": "model \'gemma3:27b\' not found"}')
    }) : fetch(url, options));
    click(browser, 'button[data-delete="gemma3:27b"]');
    await flush();
    assert.equal(document.getElementById('sageroad-models-error').textContent,
        'Could not delete the model "gemma3:27b" - model \'gemma3:27b\' not found');
    assert.deepEqual(tableRows(table()).map(([id]) => id), ['Model', 'gemma3:27b']);
});


test('the models page without Ollama, or its models', async (context) => {
    // Ollama isn't running
    const {browser, ollama} = ollamaBrowser(context, '#var.vModels=true', {'models': null});
    const app = await startApp(browser);
    await flush();
    const modelsElement = browser.document.getElementById('sageroad-models');
    assert.equal(modelsElement.innerHTML, `<p>${ollamaMissingHtml('its models can\'t be listed')}</p>`);

    // Ollama has no models
    ollama.models = [];
    await app.route();
    await flush();
    assert.equal(browser.document.getElementById('sageroad-models').textContent,
        'There are no downloaded models - download a model that reads images.');

    // A model that Ollama says little about - whether it reads images, its parameters, and when it was modified - and a
    // cloud model
    ollama.models = [{'name': 'mlx:e2b', 'size': 300}, {'name': 'glm:cloud', 'size': 293, 'remote_host': 'https://ollama.com'}];
    await app.route();
    await flush();
    assert.deepEqual(tableRows(browser.document.querySelector('#sageroad-models table')).slice(1), [
        ['glm:cloud', 'No', '', 'Cloud', '', 'DeleteUpdateInfo'],
        ['mlx:e2b', '', '', '0.3 KB', '', 'DeleteUpdateInfo']
    ]);
});


test('the models page is left before Ollama answers', async (context) => {
    // The models page is left before Ollama lists its models - and before it deletes a model
    const tags = Promise.withResolvers();
    const {browser} = ollamaBrowser(context, '#var.vModels=true', {'files': {[tagsURL]: () => tags.promise}});
    await startApp(browser);
    browser.window.location.hash = '#var.vDoc=true';
    await flush();
    tags.resolve(JSON.stringify({'models': [gemma]}));
    await flush();
    assert.equal(browser.document.title, 'SageRoad Road Plan Model');
    assert.equal(browser.document.getElementById('sageroad-models'), null);

    // The page is left while a model is deleted - its error isn't shown
    const deleted = Promise.withResolvers();
    const {browser: deleteBrowser} = ollamaBrowser(context, '#var.vModels=true', {'files': {[deleteURL]: () => deleted.promise}});
    await startApp(deleteBrowser);
    await flush();
    click(deleteBrowser, 'button[data-delete="gemma3:27b"]');
    deleteBrowser.window.location.hash = '#var.vDoc=true';
    await flush();
    deleted.resolve(undefined);
    await flush();
    assert.equal(deleteBrowser.document.title, 'SageRoad Road Plan Model');
});


test('downloading a model', async (context) => {
    // Update (download again) a model - its download's progress is shown as it goes
    const {browser, ollama} = ollamaBrowser(context, '#var.vModels=true');
    const {document, window} = browser;
    const app = await startApp(browser);
    await flush();
    click(browser, 'button[data-update="qwen3:8b"]');
    await flush();
    assert.deepEqual(ollama.pulls.map(({model}) => model), ['qwen3:8b']);
    const downloading = () => document.querySelector('#sageroad-downloading table');
    assert.deepEqual([...document.querySelectorAll('h2')].map((heading) => heading.textContent), ['Downloading', 'Downloaded Models']);
    assert.deepEqual(tableRows(downloading()), [['Model', 'Progress', 'Status', ''], ['qwen3:8b', '0%', 'starting', 'Stop']]);
    const [pull] = ollama.pulls;
    pull.write({'status': 'pulling 8eeb', 'total': 1073741824, 'completed': 268435456});
    await flush();
    assert.deepEqual(tableRows(downloading())[1], ['qwen3:8b', '25% of 1.0 GB', 'pulling 8eeb', 'Stop']);

    // Progress that doesn't change the text doesn't draw it again
    const table = downloading();
    pull.write({'status': 'pulling 8eeb', 'total': 1073741824, 'completed': 268435457});
    await flush();
    assert.equal(downloading(), table);
    assert.equal(app.downloads.get('qwen3:8b').completed, 268435457);

    // A model that's downloading isn't downloaded again - and leaving the page asks first
    click(browser, 'button[data-update="qwen3:8b"]');
    await flush();
    assert.equal(ollama.pulls.length, 1);
    assert.equal(fire(browser, window, 'beforeunload').defaultPrevented, true);

    // The download is done - the models are listed again
    const tagsCount = browser.fetches.filter((url) => url === tagsURL).length;
    pull.write({'status': 'success'});
    pull.end();
    await flush();
    assert.equal(document.getElementById('sageroad-downloading').innerHTML, '');
    assert.equal(browser.fetches.filter((url) => url === tagsURL).length, tagsCount + 1);
    assert.equal(fire(browser, window, 'beforeunload').defaultPrevented, false);
    assert.equal(document.getElementById('sageroad-models-error').textContent, '');

    // Stop a download - it isn't an error
    click(browser, 'button[data-update="gemma3:27b"]');
    await flush();
    click(browser, 'button[data-stop="gemma3:27b"]');
    await flush();
    assert.deepEqual([app.downloads.size, document.getElementById('sageroad-downloading').innerHTML], [0, '']);
    assert.equal(document.getElementById('sageroad-models-error').textContent, '');

    // A download that fails while another page is shown - its error is the models page's, once
    click(browser, 'button[data-update="gemma3:27b"]');
    await flush();
    window.location.hash = '#var.vDoc=true';
    await flush();
    ollama.pulls.at(-1).write({'error': 'pull model manifest: file does not exist'});
    await flush();
    assert.equal(app.downloadError, 'Could not download the model "gemma3:27b" - pull model manifest: file does not exist');
    window.location.hash = '#var.vModels=true';
    await flush();
    assert.equal(document.getElementById('sageroad-models-error').textContent,
        'Could not download the model "gemma3:27b" - pull model manifest: file does not exist');
    assert.equal(app.downloadError, null);
});


test('the download page', async (context) => {
    // The models to download - by default, the local models that read images, modified in the last 6 months, that this
    // computer runs, the most recently modified first
    const {browser, ollama} = ollamaBrowser(context, '#var.vDownload=true', {
        'models': [{...gemma, 'name': 'gemma3:4b'}], 'files': {[availableModelsURL]: JSON.stringify(available), 'getSystemInfo': systemText}
    });
    browser.clock.time = Date.parse('2026-11-19T12:00:00Z');
    const {document, window} = browser;
    const app = await startApp(browser);
    await flush();
    assert.equal(document.title, 'Download Models');
    assert.equal(document.querySelector('#sageroad p a').getAttribute('href'), '#var.vModels=true');
    const filters = () => document.querySelector('.sageroad-filters');
    const filterLinks = () => [...filters().querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href')]);
    assert.equal(filters().innerHTML.split('<br>').length, 5);
    assert.equal(filters().textContent, 'Recent: 1 month | 3 months | 6 months | AllShow: Compatible | All - this computer has 16.0 GB ' +
        'of memoryType: All | Local | Cloud | MLXCapability: Vision | Chat | AllSort: Downloads | Modified | Name');
    assert.deepEqual(filterLinks(), [
        ['1 month', '#var.vDownload=true&var.vRecent=1'],
        ['3 months', '#var.vDownload=true&var.vRecent=3'],
        ['All', '#var.vDownload=true&var.vRecent=0'],
        ['All', '#var.vCompatible=false&var.vDownload=true'],
        ['All', '#var.vDownload=true&var.vModelType=\'All\''],
        ['Cloud', '#var.vDownload=true&var.vModelType=\'Cloud\''],
        ['MLX', '#var.vDownload=true&var.vModelType=\'MLX\''],
        ['Chat', '#var.vCapability=\'Chat\'&var.vDownload=true'],
        ['All', '#var.vCapability=\'All\'&var.vDownload=true'],
        ['Downloads', '#var.vDownload=true&var.vModelSort=\'Downloads\''],
        ['Name', '#var.vDownload=true&var.vModelSort=\'Name\'']
    ]);
    const availableElement = () => document.getElementById('sageroad-available');
    assert.deepEqual([...availableElement().querySelectorAll('p:not(.sageroad-filters), h2')].map((element) => element.textContent), [
        '2 models',
        'gemma3', 'Gemma <3>', 'Downloads: 3.0M - Modified: 2026-10-01 - Capabilities: vision, tools', '4bInfo',
        'llama3.2-vision', 'Llama 3.2 Vision', 'Downloads: 5.0K - Modified: 2026-09-01 - Capabilities: vision', '11bInfo'
    ]);
    const buttons = () => [...availableElement().querySelectorAll('button')].map((button) => (
        [button.dataset.download, button.title, button.disabled]
    ));
    assert.deepEqual(buttons(), [
        ['gemma3:4b', 'It\'s downloaded', true],
        ['llama3.2-vision:11b', 'Download llama3.2-vision:11b', false]
    ]);
    assert.equal(availableElement().querySelector('.sageroad-actions a').href, 'https://ollama.com/library/gemma3');

    // Download a model - it's shown on the models page
    click(browser, 'button[data-download="llama3.2-vision:11b"]');
    await flush();
    assert.equal(window.location.hash, '#var.vModels=true');
    assert.equal(document.title, 'Ollama Models');
    assert.deepEqual(ollama.pulls.map(({model}) => model), ['llama3.2-vision:11b']);

    // A model that's downloading can't be downloaded again
    window.location.hash = '#var.vDownload=true';
    await flush();
    assert.deepEqual(buttons()[1], ['llama3.2-vision:11b', 'It\'s downloading', true]);
    assert.equal(app.downloads.size, 1);

    // All the models - each filter's links keep the others
    window.location.hash = '#var.vDownload=true&var.vRecent=0&var.vCompatible=false&var.vModelType=\'All\'&var.vCapability=\'All\'&' +
        'var.vModelSort=\'Name\'';
    await flush();
    const allArgs = 'var.vCapability=\'All\'&var.vCompatible=false&var.vDownload=true&var.vModelSort=\'Name\'&var.vModelType=\'All\'';
    assert.deepEqual(filterLinks().slice(0, 4), [
        ['1 month', `#${allArgs}&var.vRecent=1`],
        ['3 months', `#${allArgs}&var.vRecent=3`],
        ['6 months', `#${allArgs}`],
        ['Compatible', '#var.vCapability=\'All\'&var.vDownload=true&var.vModelSort=\'Name\'&var.vModelType=\'All\'&var.vRecent=0']
    ]);
    assert.deepEqual(buttons().map(([id]) => id), [
        'gemma3:4b', 'gemma3:27b-cloud', 'llama3.2-vision:11b', 'llama3.2-vision:90b', 'nomic-embed-text:latest', 'qwen3:8b',
        'qwen3-vl:8b-mlx'
    ]);
    const nomic = [...availableElement().querySelectorAll('h2')].find((element) => element.textContent === 'nomic-embed-text');
    assert.equal(nomic.nextElementSibling.nextElementSibling.textContent,
        'Downloads: 0.1K - Modified: 2026-11-01 - Capabilities: embedding');

    // The models that answer questions - those that don't read images, too, but not an embedding model
    window.location.hash = '#var.vDownload=true&var.vCapability=\'Chat\'';
    await flush();
    assert.deepEqual([...availableElement().querySelectorAll('p:not(.sageroad-filters), h2')].map((element) => element.textContent), [
        '3 models',
        'qwen3', 'Qwen 3', 'Downloads: 2.0K - Modified: 2026-11-01', '8bInfo',
        'gemma3', 'Gemma <3>', 'Downloads: 3.0M - Modified: 2026-10-01 - Capabilities: vision, tools', '4bInfo',
        'llama3.2-vision', 'Llama 3.2 Vision', 'Downloads: 5.0K - Modified: 2026-09-01 - Capabilities: vision', '11bInfo'
    ]);

    // The recent month's models - one
    window.location.hash = '#var.vDownload=true&var.vRecent=1&var.vModelType=\'All\'';
    await flush();
    assert.deepEqual([...availableElement().querySelectorAll('p:not(.sageroad-filters), h2')].map((element) => element.textContent).
        slice(0, 2), ['1 model', 'qwen3-vl']);

    // Invalid filters are the defaults
    window.location.hash = '#var.vDownload=true&var.vRecent=2&var.vModelType=\'Big\'&var.vCapability=\'Smart\'&var.vModelSort=\'Size\'';
    await flush();
    assert.deepEqual(filterLinks().map(([text]) => text),
        ['1 month', '3 months', 'All', 'All', 'All', 'Cloud', 'MLX', 'Chat', 'All', 'Downloads', 'Name']);
});


test('the download page without the system information', async (context) => {
    // There's no back end - the models aren't filtered by whether this computer runs them
    const {browser} = ollamaBrowser(context, '#var.vDownload=true', {'files': {[availableModelsURL]: JSON.stringify(available)}});
    browser.clock.time = Date.parse('2026-11-19T12:00:00Z');
    await startApp(browser);
    await flush();
    const filters = browser.document.querySelector('.sageroad-filters');
    assert.equal(filters.textContent, 'Recent: 1 month | 3 months | 6 months | AllType: All | Local | Cloud | MLXCapability: Vision | ' +
        'Chat | AllSort: Downloads | Modified | Name');
    assert.deepEqual([...browser.document.querySelectorAll('#sageroad-available button')].map((button) => button.dataset.download),
        ['gemma3:4b', 'llama3.2-vision:11b', 'llama3.2-vision:90b']);

    // The computer's memory is unknown - any local model is compatible
    const {browser: unknown} = ollamaBrowser(context, '#var.vDownload=true', {
        'files': {[availableModelsURL]: JSON.stringify(available), 'getSystemInfo': '{"memory": -1, "mlx": false}'}
    });
    unknown.clock.time = Date.parse('2026-11-19T12:00:00Z');
    await startApp(unknown);
    await flush();
    assert.equal(unknown.document.querySelector('.sageroad-filters').textContent, 'Recent: 1 month | 3 months | 6 months | AllShow: ' +
        'Compatible | AllType: All | Local | Cloud | MLXCapability: Vision | Chat | AllSort: Downloads | Modified | Name');
    assert.deepEqual([...unknown.document.querySelectorAll('#sageroad-available button')].map((button) => button.dataset.download),
        ['gemma3:4b', 'llama3.2-vision:11b', 'llama3.2-vision:90b']);
});


test('the download page without the list, or Ollama', async (context) => {
    // The list of models can't be fetched
    const {browser} = ollamaBrowser(context, '#var.vDownload=true', {'files': {[availableModelsURL]: null}});
    await startApp(browser);
    await flush();
    assert.equal(browser.document.getElementById('sageroad-available').textContent, 'The list of Ollama\'s models couldn\'t be ' +
        'fetched - it\'s on the internet. Check your connection, and reload this page.');

    // Ollama isn't running - its models can't be downloaded
    const {browser: noOllama} = ollamaBrowser(context, '#var.vDownload=true&var.vRecent=0', {
        'models': null, 'files': {[availableModelsURL]: JSON.stringify(available), 'getSystemInfo': systemText}
    });
    await startApp(noOllama);
    await flush();
    const element = noOllama.document.getElementById('sageroad-available');
    assert.equal(element.querySelector('.sageroad-notice').innerHTML, ollamaMissingHtml('its models can\'t be downloaded'));
    assert.deepEqual([...element.querySelectorAll('button')].map((button) => button.disabled), [true, true]);

    // The page is left before the list is fetched
    const list = Promise.withResolvers();
    const {browser: leftBrowser} = ollamaBrowser(context, '#var.vDownload=true', {'files': {[availableModelsURL]: () => list.promise}});
    await startApp(leftBrowser);
    leftBrowser.window.location.hash = '#var.vDoc=true';
    await flush();
    list.resolve(JSON.stringify(available));
    await flush();
    assert.equal(leftBrowser.document.getElementById('sageroad-available'), null);
});
