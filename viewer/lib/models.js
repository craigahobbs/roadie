// models.js - Ollama's models on this computer - list, download, and delete them - and the models to download (Ollama's
// library's, from Ollama Chat's list). The application's page asks Ollama itself: Ollama answers this computer's pages.

import {fixed} from './format.js';


// The Ollama host - this computer's
export const ollamaHost = 'http://127.0.0.1:11434';


// Ollama's download page
export const ollamaDownloadURL = 'https://ollama.com/download';


// The models to download - Ollama Chat's list of the models in Ollama's library (it answers other sites' pages)
export const availableModelsURL = 'https://craigahobbs.github.io/ollama-chat/models/models.json';


// Get a model's page in Ollama's library - "id" is the model's ID ("gemma3:27b") or name
export function modelInfoURL(id) {
    return `https://ollama.com/library/${encodeURIComponent(id.split(':')[0])}`;
}


// Get a model's parameter count from Ollama's parameter size text ("27.4B") - 0 if it's unknown
export function parameterCount(text) {
    const match = typeof text === 'string' ? text.match(/^(\d+(?:\.\d+)?)([KMBT])$/i) : null;
    if (match === null) {
        return 0;
    }
    const scale = {'K': 1e3, 'M': 1e6, 'B': 1e9, 'T': 1e12}[match[2].toUpperCase()];
    return Math.round(parseFloat(match[1]) * scale);
}


// Format a count ("27.4B") - an unknown (0) count is empty
export function countText(count) {
    if (count <= 0) {
        return '';
    } else if (count < 1e6) {
        return `${fixed(count / 1e3, 1)}K`;
    } else if (count < 1e9) {
        return `${fixed(count / 1e6, 1)}M`;
    } else if (count < 1e12) {
        return `${fixed(count / 1e9, 1)}B`;
    }
    return `${fixed(count / 1e12, 1)}T`;
}


// Format a size in bytes ("16.2 GB")
export function sizeText(bytes) {
    if (bytes < 1024 ** 2) {
        return `${fixed(bytes / 1024, 1)} KB`;
    } else if (bytes < 1024 ** 3) {
        return `${fixed(bytes / 1024 ** 2, 1)} MB`;
    }
    return `${fixed(bytes / 1024 ** 3, 1)} GB`;
}


// Get a response's error message - its JSON "error" member, or its status
async function responseError(response) {
    try {
        const {error} = JSON.parse(await response.text());
        if (typeof error === 'string') {
            return error;
        }
    } catch {
        // The response isn't JSON
    }
    return `status ${response.status}`;
}


// Get Ollama's models - "fetchFn" is the fetch function. Returns null if Ollama doesn't answer. Each model has its ID,
// its parameter count (0 if it's unknown), its size in bytes, its modified time's text (null if it's unknown), whether
// it answers questions ("isChat" - its capabilities have "completion") and reads images ("isVision" - "vision") - each
// null if Ollama doesn't say - and whether it runs in Ollama's cloud ("isCloud"). The models are sorted by ID.
export async function ollamaModels(fetchFn) {
    let models;
    try {
        const response = await fetchFn(`${ollamaHost}/api/tags`);
        if (!response.ok) {
            return null;
        }
        ({models} = JSON.parse(await response.text()));
    } catch {
        return null;
    }
    if (!Array.isArray(models)) {
        return null;
    }
    const valid = models.filter((model) => typeof model?.name === 'string');
    const result = await Promise.all(valid.map(async (model) => {
        // An older Ollama's model list doesn't have the models' capabilities
        const capabilities = Array.isArray(model.capabilities) ? model.capabilities : await ollamaModelCapabilities(fetchFn, model.name);
        return {
            'id': model.name,
            'parameters': parameterCount(model.details?.parameter_size),
            'size': typeof model.size === 'number' ? model.size : 0,
            'modified': typeof model.modified_at === 'string' ? model.modified_at : null,
            'isChat': capabilities === null ? null : capabilities.includes('completion'),
            'isVision': capabilities === null ? null : capabilities.includes('vision'),
            'isCloud': typeof model.remote_host === 'string'
        };
    }));
    return result.sort((model1, model2) => (model1.id < model2.id ? -1 : (model1.id > model2.id ? 1 : 0)));
}


// Get a model's capabilities ("completion", "vision", ...) - null if Ollama doesn't say
async function ollamaModelCapabilities(fetchFn, id) {
    try {
        const response = await fetchFn(`${ollamaHost}/api/show`, {
            'method': 'POST', 'headers': {'content-type': 'application/json'}, 'body': JSON.stringify({'model': id})
        });
        const {capabilities} = JSON.parse(await response.text());
        return Array.isArray(capabilities) ? capabilities : null;
    } catch {
        return null;
    }
}


// Delete a model - an error's message says why it couldn't be deleted
export async function ollamaDelete(fetchFn, id) {
    const response = await fetchFn(`${ollamaHost}/api/delete`, {
        'method': 'DELETE', 'headers': {'content-type': 'application/json'}, 'body': JSON.stringify({'model': id})
    });
    if (!response.ok) {
        throw new Error(await responseError(response));
    }
}


// Download (pull) a model - "progressFn" is called with each of its progress reports (its "status" text, and the bytes
// "completed" of the "total" - null if it's unknown - of the part it's downloading). "signal" aborts it. An error's
// message says why it couldn't be downloaded.
export async function ollamaPull(fetchFn, id, signal, progressFn) {
    const response = await fetchFn(`${ollamaHost}/api/pull`, {
        'method': 'POST', 'headers': {'content-type': 'application/json'}, 'body': JSON.stringify({'model': id}), signal
    });
    if (!response.ok) {
        throw new Error(await responseError(response));
    }

    // The progress reports are a line of JSON each
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const report = (line) => {
        if (line.trim() === '') {
            return;
        }
        const progress = JSON.parse(line);
        if (typeof progress.error === 'string') {
            throw new Error(progress.error);
        }
        progressFn({
            'status': typeof progress.status === 'string' ? progress.status : '',
            'completed': typeof progress.completed === 'number' ? progress.completed : 0,
            'total': typeof progress.total === 'number' ? progress.total : null
        });
    };
    for (;;) {
        const {done, value} = await reader.read();
        text += done ? decoder.decode() : decoder.decode(value, {'stream': true});
        const lines = text.split('\n');
        text = lines.pop();
        lines.forEach(report);
        if (done) {
            break;
        }
    }
    report(text);
}


// Get the models to download - null if the list can't be fetched. A model has its name, description, modified date
// ("2025-03-12"), download count, capabilities ("vision", "tools", "thinking", "embedding", "decision", "audio" - none,
// if the list doesn't say), and variants: each has its ID ("gemma3:27b"), its size tag ("27b"), and its parameter count,
// and it may run in Ollama's cloud ("cloud") or need a Mac with Apple silicon ("mlx"). Invalid models and variants are
// left out.
export async function availableModels(fetchFn) {
    let models;
    try {
        const response = await fetchFn(availableModelsURL);
        if (!response.ok) {
            return null;
        }
        models = JSON.parse(await response.text());
    } catch {
        return null;
    }
    if (!Array.isArray(models)) {
        return null;
    }
    const isString = (value) => typeof value === 'string';
    const result = [];
    for (const model of models) {
        if (!isString(model?.name) || !isString(model.description) || !isString(model.modified) ||
            typeof model.downloads !== 'number' || !Array.isArray(model.variants)) {
            continue;
        }
        const variants = model.variants.filter((variant) => (
            isString(variant?.id) && isString(variant.size) && typeof variant.parameters === 'number'
        )).map((variant) => ({
            'id': variant.id, 'size': variant.size, 'parameters': variant.parameters,
            'cloud': variant.cloud === true, 'mlx': variant.mlx === true
        }));
        if (variants.length > 0) {
            const {name, description, modified, downloads} = model;
            const capabilities = Array.isArray(model.capabilities) ? model.capabilities.filter(isString) : [];
            result.push({name, description, modified, downloads, capabilities, variants});
        }
    }
    return result;
}


// The model types - a variant runs on this computer ("Local"), in Ollama's cloud ("Cloud"), or needs a Mac with Apple
// silicon ("MLX")
export const modelTypes = ['All', 'Local', 'Cloud', 'MLX'];


// The model capabilities - a model reads images ("Vision"), answers questions ("Chat" - an embedding or decision model
// doesn't), or any ("All")
export const modelCapabilities = ['Vision', 'Chat', 'All'];


// Get whether a model to download has a capability
export function modelCapable(model, capability) {
    const isChat = !model.capabilities.includes('embedding') && !model.capabilities.includes('decision');
    if (capability === 'Chat') {
        return isChat;
    } else if (capability === 'Vision') {
        return isChat && model.capabilities.includes('vision');
    }
    return true;
}


// The model sorts
export const modelSorts = ['Downloads', 'Modified', 'Name'];


// Get this computer's system information - the SageRoad application's back end's (a browser can't know it): its total
// memory in bytes (0 or less if it's unknown), and whether it runs MLX models. Null if there's no back end (the
// project's web site).
export async function systemInfo(fetchFn) {
    try {
        const response = await fetchFn('getSystemInfo');
        if (!response.ok) {
            return null;
        }
        const {memory, mlx} = JSON.parse(await response.text());
        return typeof memory === 'number' && typeof mlx === 'boolean' ? {memory, mlx} : null;
    } catch {
        return null;
    }
}


// Get whether a model variant runs on this computer - "info" is its system information. A cloud model runs on Ollama's
// servers, and a local model needs about a byte of memory a parameter (any, if the memory is unknown) - and an MLX
// model, a Mac with Apple silicon.
export function variantCompatible(variant, info) {
    if (variant.cloud) {
        return true;
    }
    const isMemory = info.memory <= 0 || variant.parameters <= info.memory;
    return variant.mlx ? info.mlx && isMemory : isMemory;
}


// Get a model variant's type
export function variantType(variant) {
    if (variant.cloud) {
        return 'Cloud';
    }
    return variant.mlx ? 'MLX' : 'Local';
}


// Filter and sort the models to download - "recent" is the months since a model was modified (0 is any), "type" is
// its variants' type, "capability" is its capability, "compatible" is true for the variants this computer runs ("info"
// is its system information - if it's null, they're all compatible), and "sort" is its sort. A model's variants are
// those of the type that are compatible. "today" is today's date.
export function filterModels(models, {recent, type, capability, compatible, sort}, today, info) {
    let minModified = null;
    if (recent > 0) {
        const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - recent, today.getUTCDate()));
        minModified = date.toISOString().slice(0, 10);
    }
    const filtered = [];
    for (const model of models) {
        const variants = model.variants.filter((variant) => (
            (type === 'All' || variantType(variant) === type) && (!compatible || info === null || variantCompatible(variant, info))
        ));
        const isRecent = minModified === null || model.modified >= minModified;
        if (variants.length > 0 && isRecent && modelCapable(model, capability)) {
            filtered.push({...model, variants});
        }
    }
    const compare = (value1, value2) => (value1 < value2 ? -1 : (value1 > value2 ? 1 : 0));
    const compareDownloads = (model1, model2) => compare(model2.downloads, model1.downloads);
    const compareModified = (model1, model2) => compare(model2.modified, model1.modified);
    const compareName = (model1, model2) => compare(model1.name, model2.name);
    const compares = {
        'Downloads': [compareDownloads, compareModified, compareName],
        'Modified': [compareModified, compareDownloads, compareName],
        'Name': [compareName]
    }[sort];
    return filtered.sort((model1, model2) => {
        for (const compareFn of compares) {
            const result = compareFn(model1, model2);
            if (result !== 0) {
                return result;
            }
        }
        return 0;
    });
}
