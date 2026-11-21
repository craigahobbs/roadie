import {
    availableModels, availableModelsURL, countText, filterModels, modelCapable, modelInfoURL, ollamaDelete, ollamaHost, ollamaModels,
    ollamaPull, parameterCount, sizeText, systemInfo, variantCompatible, variantType
} from '../lib/models.js';
import assert from 'node:assert/strict';
import test from 'node:test';


// A fake fetch of URLs' responses - a response, or a function of the fetch's options that returns one, or an error to
// throw. The fetches are recorded ("calls").
function fakeFetch(responses) {
    const calls = [];
    const fetchFn = async (url, options) => {
        calls.push([url, options]);
        const response = typeof responses[url] === 'function' ? await responses[url](options) : responses[url];
        if (response instanceof Error) {
            throw response;
        }
        return response;
    };
    return {fetchFn, calls};
}


// A response of text, and a not-OK response
function textResponse(text) {
    return {'ok': true, 'text': () => Promise.resolve(text)};
}

function errorResponse(status, text) {
    return {'ok': false, status, 'text': () => Promise.resolve(text)};
}


// A streamed response of text chunks
function streamResponse(chunks) {
    const encoder = new TextEncoder();
    return {'ok': true, 'body': new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        }
    })};
}


test('model URLs', () => {
    assert.equal(ollamaHost, 'http://127.0.0.1:11434');
    assert.equal(availableModelsURL, 'https://craigahobbs.github.io/ollama-chat/models/models.json');
    assert.equal(modelInfoURL('gemma3:27b'), 'https://ollama.com/library/gemma3');
    assert.equal(modelInfoURL('a b'), 'https://ollama.com/library/a%20b');
});


test('parameterCount', () => {
    assert.deepEqual(['27.4B', '270M', '1.5k', '2T', '8b'].map(parameterCount), [27400000000, 270000000, 1500, 2000000000000, 8000000000]);

    // An unknown parameter size is 0 - an MLX model's is empty
    assert.deepEqual(['', 'B', '27.4', '27.4X', null, 27].map(parameterCount), [0, 0, 0, 0, 0, 0]);
});


test('countText and sizeText', () => {
    assert.deepEqual([0, 1500, 270000000, 27400000000, 2810000000000].map(countText), ['', '1.5K', '270.0M', '27.4B', '2.8T']);
    assert.deepEqual([512, 1536 * 1024, 4.9 * 1024 ** 3].map(sizeText), ['0.5 KB', '1.5 MB', '4.9 GB']);
});


test('ollamaModels', async () => {
    // Ollama's models - sorted by ID, with their parameters, sizes, and modified times, whether they answer questions and
    // read images (the model list's capabilities, or an older Ollama's model's), and whether they're cloud models
    const tags = {'models': [
        {'name': 'qwen3:8b', 'size': 5200000000, 'modified_at': '2026-11-02T10:00:00Z', 'details': {'parameter_size': '8.2B'}},
        {'name': 'gemma3:27b', 'size': 17000000000, 'modified_at': '2026-10-01T09:00:00Z', 'details': {'parameter_size': '27.4B'}},
        {'name': 'mlx:e2b'},
        {'name': 'glm:cloud', 'size': 293, 'remote_host': 'https://ollama.com', 'capabilities': ['completion', 'thinking']},
        {'name': 'phonon:latest', 'size': 1000, 'capabilities': ['speech']},
        {'name': 7},
        null
    ]};
    const capabilities = {'gemma3:27b': ['completion', 'vision'], 'qwen3:8b': ['completion']};
    const {fetchFn, calls} = fakeFetch({
        'http://127.0.0.1:11434/api/tags': textResponse(JSON.stringify(tags)),
        'http://127.0.0.1:11434/api/show': ({body}) => {
            const {model} = JSON.parse(body);
            return model === 'mlx:e2b' ? new Error('Failed to fetch') : textResponse(JSON.stringify({'capabilities': capabilities[model]}));
        }
    });
    const gemmaModel = {
        'id': 'gemma3:27b', 'parameters': 27400000000, 'size': 17000000000, 'modified': '2026-10-01T09:00:00Z', 'isChat': true,
        'isVision': true, 'isCloud': false
    };
    assert.deepEqual(await ollamaModels(fetchFn), [
        gemmaModel,
        {'id': 'glm:cloud', 'parameters': 0, 'size': 293, 'modified': null, 'isChat': true, 'isVision': false, 'isCloud': true},
        {'id': 'mlx:e2b', 'parameters': 0, 'size': 0, 'modified': null, 'isChat': null, 'isVision': null, 'isCloud': false},
        {'id': 'phonon:latest', 'parameters': 0, 'size': 1000, 'modified': null, 'isChat': false, 'isVision': false, 'isCloud': false},
        {
            ...gemmaModel, 'id': 'qwen3:8b', 'parameters': 8200000000, 'size': 5200000000, 'modified': '2026-11-02T10:00:00Z',
            'isVision': false
        }
    ]);
    assert.deepEqual(calls.map(([url, options]) => (options === undefined ? url : JSON.parse(options.body).model)), [
        'http://127.0.0.1:11434/api/tags', 'qwen3:8b', 'gemma3:27b', 'mlx:e2b'
    ]);
    assert.deepEqual(calls[1], ['http://127.0.0.1:11434/api/show', {
        'method': 'POST', 'headers': {'content-type': 'application/json'}, 'body': '{"model":"qwen3:8b"}'
    }]);

    // A model whose capabilities aren't a list doesn't say if it reads images - and models of the same ID keep their order
    const twins = {'models': [{'name': 'twin', 'size': 1}, {'name': 'twin', 'size': 2}]};
    const {fetchFn: twinsFetch} = fakeFetch({
        'http://127.0.0.1:11434/api/tags': textResponse(JSON.stringify(twins)),
        'http://127.0.0.1:11434/api/show': textResponse('{"capabilities": "vision"}')
    });
    assert.deepEqual((await ollamaModels(twinsFetch)).map(({size, isVision}) => [size, isVision]), [[1, null], [2, null]]);

    // Ollama doesn't answer, or its answer isn't a model list
    for (const response of [new TypeError('Failed to fetch'), errorResponse(500, ''), textResponse('{'), textResponse('{"models": 5}')]) {
        assert.equal(await ollamaModels(fakeFetch({'http://127.0.0.1:11434/api/tags': response}).fetchFn), null);
    }
});


test('ollamaDelete', async () => {
    const {fetchFn, calls} = fakeFetch({'http://127.0.0.1:11434/api/delete': {'ok': true}});
    await ollamaDelete(fetchFn, 'gemma3:27b');
    assert.deepEqual(calls, [['http://127.0.0.1:11434/api/delete', {
        'method': 'DELETE', 'headers': {'content-type': 'application/json'}, 'body': '{"model":"gemma3:27b"}'
    }]]);

    // An error is Ollama's message, or the response's status
    for (const [response, message] of [
        [errorResponse(404, '{"error": "model \'x\' not found"}'), 'model \'x\' not found'],
        [errorResponse(500, 'oops'), 'status 500'],
        [errorResponse(500, '{"error": 5}'), 'status 500']
    ]) {
        await assert.rejects(ollamaDelete(fakeFetch({'http://127.0.0.1:11434/api/delete': response}).fetchFn, 'x'), {message});
    }
});


test('ollamaPull', async () => {
    // The progress reports are a line of JSON each - a line may be split across chunks, and the last may not end the text
    const reports = [];
    const {signal} = new AbortController();
    const {fetchFn, calls} = fakeFetch({'http://127.0.0.1:11434/api/pull': streamResponse([
        '{"status": "pulling manifest"}\n{"status": "pulling 8eeb", "total": 1000, ',
        '"completed": 250}\n\n',
        '{"status": "pulling 8eeb", "total": 1000, "completed": 1000}\n{"status": 5, "completed": "x", "total": null}\n',
        '{"status": "success"}'
    ])});
    await ollamaPull(fetchFn, 'gemma3:27b', signal, (progress) => reports.push(progress));
    assert.deepEqual(reports, [
        {'status': 'pulling manifest', 'completed': 0, 'total': null},
        {'status': 'pulling 8eeb', 'completed': 250, 'total': 1000},
        {'status': 'pulling 8eeb', 'completed': 1000, 'total': 1000},
        {'status': '', 'completed': 0, 'total': null},
        {'status': 'success', 'completed': 0, 'total': null}
    ]);
    assert.deepEqual(calls, [['http://127.0.0.1:11434/api/pull', {
        'method': 'POST', 'headers': {'content-type': 'application/json'}, 'body': '{"model":"gemma3:27b"}', signal
    }]]);

    // A report's error stops the download
    const errorFetch = fakeFetch({'http://127.0.0.1:11434/api/pull': streamResponse([
        '{"status": "pulling manifest"}\n{"error": "pull model manifest: file does not exist"}\n{"status": "success"}\n'
    ])}).fetchFn;
    reports.length = 0;
    await assert.rejects(ollamaPull(errorFetch, 'nope', signal, (progress) => reports.push(progress)), {
        'message': 'pull model manifest: file does not exist'
    });
    assert.deepEqual(reports, [{'status': 'pulling manifest', 'completed': 0, 'total': null}]);

    // A response that isn't OK
    const notFound = fakeFetch({'http://127.0.0.1:11434/api/pull': errorResponse(400, '{"error": "invalid model name"}')}).fetchFn;
    await assert.rejects(ollamaPull(notFound, 'a b', signal, () => null), {'message': 'invalid model name'});
});


// The models to download - Ollama Chat's list
const available = [
    {'name': 'gemma3', 'description': 'Gemma 3', 'modified': '2026-10-01', 'downloads': 3000,
        'capabilities': ['vision', 'tools'], 'variants': [
        {'id': 'gemma3:4b', 'size': '4b', 'parameters': 4000000000},
        {'id': 'gemma3:27b-cloud', 'size': '27b-cloud', 'parameters': 27000000000, 'cloud': true}
    ]},
    {'name': 'qwen3-vl', 'description': 'Qwen 3 VL', 'modified': '2026-11-10', 'downloads': 1000,
        'capabilities': ['vision'], 'variants': [
        {'id': 'qwen3-vl:8b-mlx', 'size': '8b-mlx', 'parameters': 8000000000, 'mlx': true}
    ]},
    {'name': 'alpha', 'description': 'Alpha', 'modified': '2026-11-10', 'downloads': 3000, 'capabilities': [], 'variants': [
        {'id': 'alpha:1b', 'size': '1b', 'parameters': 1000000000}
    ]}
];


test('availableModels', async () => {
    // The models - their variants' cloud and MLX flags are booleans, and their capabilities are strings (none, if the list
    // doesn't say)
    const invalid = [
        5, {'name': 'x', 'description': 'X', 'modified': '2026-01-01', 'downloads': 1, 'variants': [{'id': 'x:1b', 'size': '1b'}]},
        {'name': 'y', 'description': 'Y', 'modified': '2026-01-01', 'downloads': '1', 'variants': []},
        {'name': 'z', 'description': 'Z', 'modified': '2026-01-01', 'downloads': 1, 'variants': {}},
        {'name': 'w', 'description': 7, 'modified': '2026-01-01', 'downloads': 1, 'variants': []},
        {'name': 'v', 'description': 'V', 'modified': 7, 'downloads': 1, 'variants': []},
        {'description': 'U', 'modified': '2026-01-01', 'downloads': 1, 'variants': []}
    ];
    const withInvalid = [
        {...available[0], 'variants': [...available[0].variants, null, {'id': 5, 'size': '5b', 'parameters': 5}, {'id': 's', 'size': 6}]},
        ...invalid, {...available[1], 'capabilities': ['vision', 5, null]}, {...available[2], 'capabilities': 'vision'}
    ];
    const {fetchFn, calls} = fakeFetch({[availableModelsURL]: textResponse(JSON.stringify(withInvalid))});
    const models = await availableModels(fetchFn);
    assert.deepEqual(calls, [[availableModelsURL, undefined]]);
    assert.deepEqual(models.map(({name, variants}) => [name, variants.map(({id, cloud, mlx}) => [id, cloud, mlx])]), [
        ['gemma3', [['gemma3:4b', false, false], ['gemma3:27b-cloud', true, false]]],
        ['qwen3-vl', [['qwen3-vl:8b-mlx', false, true]]],
        ['alpha', [['alpha:1b', false, false]]]
    ]);
    assert.deepEqual(Object.keys(models[0]), ['name', 'description', 'modified', 'downloads', 'capabilities', 'variants']);
    assert.deepEqual(models.map(({capabilities}) => capabilities), [['vision', 'tools'], ['vision'], []]);
    const unsaid = {...available[2]};
    delete unsaid.capabilities;
    const unsaidModels = await availableModels(fakeFetch({[availableModelsURL]: textResponse(JSON.stringify([unsaid]))}).fetchFn);
    assert.deepEqual(unsaidModels.map(({capabilities}) => capabilities), [[]]);

    // The list can't be fetched, or it isn't a list
    for (const response of [new TypeError('Failed to fetch'), errorResponse(404, ''), textResponse('<html>'), textResponse('{}')]) {
        assert.equal(await availableModels(fakeFetch({[availableModelsURL]: response}).fetchFn), null);
    }
});


test('variantType and filterModels', () => {
    assert.deepEqual(available.flatMap(({variants}) => variants.map(variantType)), ['Local', 'Cloud', 'MLX', 'Local']);
    const today = new Date('2026-11-19T12:00:00Z');
    const names = (filters) => filterModels(available, {'capability': 'All', ...filters}, today).map(({name, variants}) => (
        `${name} ${variants.map(({size}) => size).join(',')}`
    ));

    // The sorts - by downloads (then modified, then name), modified (then downloads, then name), or name
    assert.deepEqual(names({'recent': 0, 'type': 'All', 'sort': 'Downloads'}), ['alpha 1b', 'gemma3 4b,27b-cloud', 'qwen3-vl 8b-mlx']);
    assert.deepEqual(names({'recent': 0, 'type': 'All', 'sort': 'Modified'}), ['alpha 1b', 'qwen3-vl 8b-mlx', 'gemma3 4b,27b-cloud']);
    assert.deepEqual(names({'recent': 0, 'type': 'All', 'sort': 'Name'}), ['alpha 1b', 'gemma3 4b,27b-cloud', 'qwen3-vl 8b-mlx']);

    // A model's variants are the type's - a model without any is left out
    assert.deepEqual(names({'recent': 0, 'type': 'Local', 'sort': 'Name'}), ['alpha 1b', 'gemma3 4b']);
    assert.deepEqual(names({'recent': 0, 'type': 'Cloud', 'sort': 'Name'}), ['gemma3 27b-cloud']);
    assert.deepEqual(names({'recent': 0, 'type': 'MLX', 'sort': 'Name'}), ['qwen3-vl 8b-mlx']);

    // The models modified in the recent months - since a month before today
    assert.deepEqual(names({'recent': 1, 'type': 'All', 'sort': 'Name'}), ['alpha 1b', 'qwen3-vl 8b-mlx']);
    assert.deepEqual(names({'recent': 3, 'type': 'All', 'sort': 'Name'}), ['alpha 1b', 'gemma3 4b,27b-cloud', 'qwen3-vl 8b-mlx']);

    // The models of a capability - that read images, or answer questions
    assert.deepEqual(names({'recent': 0, 'type': 'All', 'capability': 'Vision', 'sort': 'Name'}),
        ['gemma3 4b,27b-cloud', 'qwen3-vl 8b-mlx']);
    assert.deepEqual(names({'recent': 0, 'type': 'Local', 'capability': 'Vision', 'sort': 'Name'}), ['gemma3 4b']);
    assert.deepEqual(names({'recent': 0, 'type': 'All', 'capability': 'Chat', 'sort': 'Name'}),
        ['alpha 1b', 'gemma3 4b,27b-cloud', 'qwen3-vl 8b-mlx']);

    // Models of the same name keep their order
    const twins = [{...available[2], 'description': 'One'}, {...available[2], 'description': 'Two'}];
    const twinFilters = {'recent': 0, 'type': 'All', 'capability': 'All', 'sort': 'Name'};
    assert.deepEqual(filterModels(twins, twinFilters, today).map(({description}) => description), ['One', 'Two']);
});


test('systemInfo', async () => {
    // The application's back end's system information
    const {fetchFn, calls} = fakeFetch({'getSystemInfo': textResponse('{"memory": 68719476736, "mlx": true}')});
    assert.deepEqual(await systemInfo(fetchFn), {'memory': 68719476736, 'mlx': true});
    assert.deepEqual(calls, [['getSystemInfo', undefined]]);

    // There's no back end (the project's web site), or its answer isn't the system information
    for (const response of [
        new TypeError('Failed to fetch'), errorResponse(404, ''), textResponse('<html>'), textResponse('{"memory": "64GB", "mlx": true}'),
        textResponse('{"memory": 1}')
    ]) {
        assert.equal(await systemInfo(fakeFetch({'getSystemInfo': response}).fetchFn), null);
    }
});


test('variantCompatible', () => {
    // A local model needs about a byte of memory a parameter - any, if the memory is unknown
    const local = {'parameters': 8000000000};
    assert.equal(variantCompatible(local, {'memory': 16000000000, 'mlx': false}), true);
    assert.equal(variantCompatible(local, {'memory': 8000000000, 'mlx': false}), true);
    assert.equal(variantCompatible(local, {'memory': 7999999999, 'mlx': false}), false);
    assert.equal(variantCompatible(local, {'memory': -1, 'mlx': false}), true);

    // A cloud model runs on Ollama's servers
    assert.equal(variantCompatible({'parameters': 1e12, 'cloud': true}, {'memory': 1, 'mlx': false}), true);

    // An MLX model needs a Mac with Apple silicon - and the memory
    const mlx = {'parameters': 8000000000, 'mlx': true};
    assert.equal(variantCompatible(mlx, {'memory': 16000000000, 'mlx': true}), true);
    assert.equal(variantCompatible(mlx, {'memory': 16000000000, 'mlx': false}), false);
    assert.equal(variantCompatible(mlx, {'memory': 4000000000, 'mlx': true}), false);
});


test('filterModels, compatible', () => {
    // The compatible variants - a model without any is left out
    const today = new Date('2026-11-19T12:00:00Z');
    const filters = (compatible) => ({'recent': 0, 'type': 'All', 'capability': 'All', compatible, 'sort': 'Name'});
    const names = (compatible, info) => filterModels(available, filters(compatible), today, info).
        map(({name, variants}) => `${name} ${variants.map(({size}) => size).join(',')}`);
    const small = {'memory': 2000000000, 'mlx': false};
    assert.deepEqual(names(true, small), ['alpha 1b', 'gemma3 27b-cloud']);
    assert.deepEqual(names(true, {'memory': 8000000000, 'mlx': true}), ['alpha 1b', 'gemma3 4b,27b-cloud', 'qwen3-vl 8b-mlx']);

    // All the variants - not filtered, or without the system information
    const all = ['alpha 1b', 'gemma3 4b,27b-cloud', 'qwen3-vl 8b-mlx'];
    assert.deepEqual(names(false, small), all);
    assert.deepEqual(names(true, null), all);
});


test('modelCapable', () => {
    // A model that answers questions - an embedding or decision model doesn't, even if it reads images
    const capable = (capabilities) => ['Vision', 'Chat', 'All'].map((capability) => modelCapable({capabilities}, capability));
    assert.deepEqual(capable([]), [false, true, true]);
    assert.deepEqual(capable(['tools', 'thinking']), [false, true, true]);
    assert.deepEqual(capable(['vision', 'tools']), [true, true, true]);
    assert.deepEqual(capable(['embedding']), [false, false, true]);
    assert.deepEqual(capable(['vision', 'decision']), [false, false, true]);
    assert.deepEqual(capable(['vision', 'embedding']), [false, false, true]);
});
