// modelsPage.js - the SageRoad application's Ollama model pages - the models on this computer (delete or update them,
// and the downloads in progress), and the models to download

import {argsLink, argsURL} from './args.js';
import {
    availableModels, countText, filterModels, modelCapabilities, modelInfoURL, modelSorts, modelTypes, ollamaDelete, ollamaDownloadURL,
    sizeText, systemInfo
} from './models.js';
import {escapeHtml, number} from './format.js';


// The text about the models - what a plan's run asks a model
const aboutHtml = '<p>A plan\'s run asks an Ollama model what the plan\'s notes ask for, and where their places are on the ' +
    'site\'s map - a model that reads images can do both. Without a model, the notes aren\'t read. Download a model here, ' +
    'and choose it when you run a plan.</p>';


// Create an external link's HTML - it opens in a new tab
function externalLink(url, text) {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
}


// Create Ollama's "isn't running" message HTML
export function ollamaMissingHtml(what) {
    return `Ollama isn't running on this computer, so ${what} - ${externalLink(ollamaDownloadURL, 'install Ollama')}, or start ` +
        'it, and then reload this page.';
}


// Get a download's progress text ("42% of 4.9 GB")
export function downloadProgress({completed, total}) {
    return total === null || total <= 0 ? '0%' : `${Math.round(100 * completed / total)}% of ${sizeText(total)}`;
}


// The models page - the models on this computer, and the downloads in progress
export class ModelsPage {
    constructor(app, globals) {
        this.app = app;
        this.globals = globals;
        this.closed = false;
        this.downloadingHtml = null;
        app.render('Ollama Models', [
            `<p>${argsLink(globals, 'Back')}</p>`,
            '<h1>Ollama Models</h1>',
            aboutHtml,
            `<p class="sageroad-actions"><a id="sageroad-download" class="sageroad-button" ` +
                `href="${escapeHtml(argsURL(globals, {'download': true}))}">Download Models</a></p>`,
            '<p id="sageroad-models-error" class="sageroad-error"></p>',
            '<div id="sageroad-downloading"></div>',
            '<h2 id="downloaded">Downloaded Models</h2>',
            '<div id="sageroad-models"><p>Asking Ollama for its models…</p></div>'
        ].join('\n'));
        this.renderDownloading();
        this.renderModels();
    }


    close() {
        this.closed = true;
    }


    // The application's downloads changed - "isDone" is true if one ended. The application tells only its page.
    downloadsChanged(isDone) {
        this.renderDownloading();
        if (isDone) {
            this.renderModels();
        }
    }


    // Render the downloads in progress - they're drawn again only if their text changed - and a download's error
    renderDownloading() {
        const {app} = this;
        const {document} = app;
        if (app.downloadError !== null) {
            document.getElementById('sageroad-models-error').textContent = app.downloadError;
            app.downloadError = null;
        }
        const downloads = [...app.downloads.values()].sort((download1, download2) => (download1.id < download2.id ? -1 : 1));
        const html = downloads.length === 0 ? '' : [
            '<h2 id="downloading">Downloading</h2>',
            '<p>A download stops if this page is closed or reloaded - download the model again to finish it.</p>',
            '<table class="sageroad-models"><tr><th>Model</th><th>Progress</th><th>Status</th><th></th></tr>',
            ...downloads.map((download) => (
                `<tr><td>${escapeHtml(download.id)}</td><td>${escapeHtml(downloadProgress(download))}</td>` +
                    `<td>${escapeHtml(download.status)}</td><td><button type="button" class="sageroad-link" ` +
                    `data-stop="${escapeHtml(download.id)}">Stop</button></td></tr>`
            )),
            '</table>'
        ].join('\n');
        if (html === this.downloadingHtml) {
            return;
        }
        this.downloadingHtml = html;
        const element = document.getElementById('sageroad-downloading');
        element.innerHTML = html;
        for (const button of element.querySelectorAll('button[data-stop]')) {
            button.addEventListener('click', () => app.stopDownload(button.dataset.stop));
        }
    }


    // Render the models on this computer - each is deleted, updated (downloaded again), or its library page is opened
    async renderModels() {
        const {app} = this;
        const models = await app.modelList();
        if (this.closed) {
            return;
        }
        const {document, window} = app;
        const element = document.getElementById('sageroad-models');
        if (models === null) {
            element.innerHTML = `<p>${ollamaMissingHtml('its models can\'t be listed')}</p>`;
            return;
        } else if (models.length === 0) {
            element.innerHTML = '<p>There are no downloaded models - download a model that reads images.</p>';
            return;
        }
        const visionText = (isVision) => (isVision === null ? '' : (isVision ? 'Yes' : 'No'));
        element.innerHTML = [
            '<table class="sageroad-models"><tr><th>Model</th><th>Reads Images</th><th class="sageroad-number">Parameters</th>' +
                '<th class="sageroad-number">Size</th><th>Modified</th><th></th></tr>',
            ...models.map(({id, parameters, size, modified, isVision, isCloud}) => {
                const idHtml = escapeHtml(id);
                return `<tr><td>${idHtml}</td><td>${visionText(isVision)}</td>` +
                    `<td class="sageroad-number">${countText(parameters)}</td>` +
                    `<td class="sageroad-number">${isCloud ? 'Cloud' : sizeText(size)}</td>` +
                    `<td>${escapeHtml(modified?.slice(0, 10) ?? '')}</td><td class="sageroad-model-actions">` +
                    `<button type="button" class="sageroad-link" data-delete="${idHtml}">Delete</button>` +
                    `<button type="button" class="sageroad-link" data-update="${idHtml}">Update</button>` +
                    `${externalLink(modelInfoURL(id), 'Info')}</td></tr>`;
            }),
            '</table>'
        ].join('\n');
        for (const button of element.querySelectorAll('button[data-delete]')) {
            button.addEventListener('click', async () => {
                const id = button.dataset.delete;
                if (!window.confirm(`Delete the model "${id}"?`)) {
                    return;
                }
                try {
                    await ollamaDelete(app.fetchFn, id);
                } catch ({message}) {
                    if (!this.closed) {
                        document.getElementById('sageroad-models-error').textContent = `Could not delete the model "${id}" - ${message}`;
                    }
                    return;
                }
                await this.renderModels();
            });
        }
        for (const button of element.querySelectorAll('button[data-update]')) {
            button.addEventListener('click', () => app.downloadModel(button.dataset.update));
        }
    }
}


// The models to download page - Ollama's library's models, filtered by how recent they are, whether this computer runs
// them, their type, and their capability, and sorted
export class DownloadPage {
    constructor(app, globals, args) {
        this.app = app;
        this.globals = globals;
        this.closed = false;
        this.filters = {
            'recent': [0, 1, 3, 6].includes(args.recent) ? args.recent : 6,
            'compatible': args.compatible,
            'type': modelTypes.includes(args.modelType) ? args.modelType : 'Local',
            'capability': modelCapabilities.includes(args.capability) ? args.capability : 'Vision',
            'sort': modelSorts.includes(args.modelSort) ? args.modelSort : 'Modified'
        };
        app.render('Download Models', [
            `<p>${argsLink(globals, 'Back', {'models': true})}</p>`,
            '<h1>Download Models</h1>',
            '<p>The models of Ollama\'s library. A model that reads images (Vision) can find the notes\' places on the site\'s ' +
                'map, and a model that answers questions (Chat) can read the notes - an embedding or decision model can\'t. A ' +
                'local model runs on this computer, and needs about a byte of memory for each of its parameters - a compatible ' +
                'model is one this computer runs. A cloud model runs on Ollama\'s servers - sign in to Ollama to use one. An MLX ' +
                'model needs a Mac with Apple silicon.</p>',
            '<div id="sageroad-available"><p>Getting the list of Ollama\'s models…</p></div>'
        ].join('\n'));
        this.renderAvailable();
    }


    close() {
        this.closed = true;
    }


    // Create the filters' HTML - each is a link, but for the current one. Without the system information, the models
    // aren't filtered by whether this computer runs them.
    filtersHtml(info) {
        const {filters, globals} = this;
        const filterLinks = (name, values, texts = values) => values.map((value, ixValue) => {
            const text = texts[ixValue];
            if (value === filters[name]) {
                return escapeHtml(text);
            }
            const linkFilters = {...filters, [name]: value};
            return argsLink(globals, text, {
                'download': true, 'recent': linkFilters.recent, 'compatible': linkFilters.compatible, 'modelType': linkFilters.type,
                'capability': linkFilters.capability, 'modelSort': linkFilters.sort
            });
        }).join(' | ');
        const memoryText = info !== null && info.memory > 0 ? ` - this computer has ${sizeText(info.memory)} of memory` : '';
        const showHtml = info !== null ? `<strong>Show:</strong> ${filterLinks('compatible', [true, false], ['Compatible', 'All'])}` : null;
        return [
            `<strong>Recent:</strong> ${filterLinks('recent', [1, 3, 6, 0], ['1 month', '3 months', '6 months', 'All'])}`,
            ...(showHtml !== null ? [`${showHtml}${memoryText}`] : []),
            `<strong>Type:</strong> ${filterLinks('type', modelTypes)}`,
            `<strong>Capability:</strong> ${filterLinks('capability', modelCapabilities)}`,
            `<strong>Sort:</strong> ${filterLinks('sort', modelSorts)}`
        ].join('<br>');
    }


    // Render the filters and the models to download - a variant that's downloaded, or downloading, can't be downloaded
    async renderAvailable() {
        const {app, globals} = this;
        const {fetchFn, window} = app;
        const [models, downloaded, info] = await Promise.all([availableModels(fetchFn), app.modelList(), systemInfo(fetchFn)]);
        if (this.closed) {
            return;
        }
        const element = app.document.getElementById('sageroad-available');
        if (models === null) {
            element.innerHTML = '<p class="sageroad-error">The list of Ollama\'s models couldn\'t be fetched - it\'s on the ' +
                'internet. Check your connection, and reload this page.</p>';
            return;
        }
        const downloadedIds = new Set((downloaded ?? []).map(({id}) => id));
        const filtered = filterModels(models, this.filters, new Date(Date.now()), info);
        const html = [
            `<p class="sageroad-filters">${this.filtersHtml(info)}</p>`,
            ...(downloaded === null ? [`<p class="sageroad-notice">${ollamaMissingHtml('its models can\'t be downloaded')}</p>`] : []),
            `<p>${number(filtered.length, 0)} model${filtered.length === 1 ? '' : 's'}</p>`
        ];
        for (const {name, description, modified, downloads, capabilities, variants} of filtered) {
            const buttons = variants.map(({id, size}) => {
                const isDownloaded = downloadedIds.has(id);
                const isDownloading = app.downloads.has(id);
                const title = isDownloaded ? 'It\'s downloaded' : (isDownloading ? 'It\'s downloading' : `Download ${id}`);
                const disabled = downloaded === null || isDownloaded || isDownloading ? ' disabled' : '';
                return `<button type="button" class="sageroad-button" data-download="${escapeHtml(id)}" ` +
                    `title="${escapeHtml(title)}"${disabled}>${escapeHtml(size)}</button>`;
            });
            html.push(
                `<h2>${escapeHtml(name)}</h2>`,
                `<p>${escapeHtml(description)}</p>`,
                `<p><strong>Downloads:</strong> ${countText(downloads)} - <strong>Modified:</strong> ${escapeHtml(modified)}` +
                    `${capabilities.length === 0 ? '' : ` - <strong>Capabilities:</strong> ${escapeHtml(capabilities.join(', '))}`}</p>`,
                `<p class="sageroad-actions">${buttons.join('')}${externalLink(modelInfoURL(name), 'Info')}</p>`
            );
        }
        element.innerHTML = html.join('\n');

        // A download is shown on the models page
        for (const button of element.querySelectorAll('button[data-download]')) {
            button.addEventListener('click', () => {
                app.downloadModel(button.dataset.download);
                window.location.hash = argsURL(globals, {'models': true});
            });
        }
    }
}
