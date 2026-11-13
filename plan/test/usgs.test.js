import {elevationDataset, elevationModels, fetchJson, productsUrl} from '../lib/usgs.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {testItem} from './terrainHelpers.js';


// Create a fetch function that responds with each of the responses, in order - a response is an HTTP status (its JSON
// is its status), an error message, or a JSON value. The function records its "urls" and the "sleeps".
function fetcher(responses) {
    const state = {'urls': [], 'sleeps': []};
    state.fetch = (url) => {
        const response = responses[state.urls.length];
        state.urls.push(url);
        if (typeof response === 'string') {
            return Promise.reject(new Error(response));
        }
        if (typeof response === 'number') {
            return Promise.resolve({'ok': false, 'status': response});
        }
        return Promise.resolve({'ok': true, 'status': 200, 'json': () => Promise.resolve(response)});
    };
    state.sleep = (milliseconds) => {
        state.sleeps.push(milliseconds);
        return Promise.resolve();
    };
    return state;
}


test('fetchJson', async () => {
    const state = fetcher([{'total': 1}]);
    assert.deepEqual(await fetchJson(state.fetch, state.sleep, 'https://example.com/a'), {'total': 1});
    assert.deepEqual([state.urls, state.sleeps], [['https://example.com/a'], []]);
});


test('fetchJson, failed requests are tried again', async () => {
    // A failed status, then an error, then a response - the wait doubles
    let state = fetcher([503, 'fetch failed', {'total': 2}]);
    assert.deepEqual(await fetchJson(state.fetch, state.sleep, 'https://example.com/a'), {'total': 2});
    assert.deepEqual([state.urls.length, state.sleeps], [3, [1000, 2000]]);

    // A response that isn't JSON is a failed request, too
    state = fetcher([]);
    state.fetch = (url) => {
        state.urls.push(url);
        return Promise.resolve({
            'ok': true,
            'json': () => (state.urls.length < 2 ? Promise.reject(new Error('Unexpected token')) : Promise.resolve([1]))
        });
    };
    assert.deepEqual(await fetchJson(state.fetch, state.sleep, 'https://example.com/a'), [1]);
    assert.deepEqual([state.urls.length, state.sleeps], [2, [1000]]);

    // After four tries, the request fails - with its last failure
    state = fetcher(['fetch failed', 500, 502, 504, {'total': 3}]);
    await assert.rejects(
        fetchJson(state.fetch, state.sleep, 'https://example.com/a'),
        {'message': 'Could not fetch "https://example.com/a" (status 504)'}
    );
    assert.deepEqual([state.urls.length, state.sleeps], [4, [1000, 2000, 4000]]);
    state = fetcher([500, 'timeout']);
    await assert.rejects(
        fetchJson(state.fetch, state.sleep, 'https://example.com/a', 2),
        {'message': 'Could not fetch "https://example.com/a" (timeout)'}
    );
});


test('elevationModels', async () => {
    assert.equal(productsUrl, 'https://tnmaccess.nationalmap.gov/api/v1/products');
    assert.equal(elevationDataset, 'Digital Elevation Model (DEM) 1 meter');

    // The models are the box's GeoTIFF products - the newest first, then by survey and name
    const urls = [];
    const items = [
        testItem('CO_Old_2013', 'x47y443', '2015-07-21'),
        testItem('CO_New_2020', 'x47y443', '2022-02-10'),
        testItem('CO_New_2020', 'x46y443', '2022-02-10'),
        testItem('CO_Img_2020', 'x47y443', '2023-01-01', 'IMG'),
        testItem('CO_Also_2020', 'x47y443', '2022-02-10'),
        {...testItem('CO_None_2020', 'x47y443', '2024-01-01'), 'downloadURL': null},
        {'title': 'Undated', 'format': 'GeoTIFF', 'downloadURL': 'https://example.com/undated.tif'}
    ];
    const models = await elevationModels((url) => {
        urls.push(url);
        return Promise.resolve({'total': items.length, items});
    }, [-105.29, 39.99, -105.27, 40.01]);
    assert.deepEqual(urls, [
        'https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter' +
            '&bbox=-105.29,39.99,-105.27,40.01&max=100&offset=0'
    ]);
    assert.deepEqual(models.map(({name, survey, date}) => [name, survey, date]), [
        ['USGS 1 Meter 13 x47y443 CO_Also_2020', 'CO_Also_2020', '2022-02-10'],
        ['USGS 1 Meter 13 x46y443 CO_New_2020', 'CO_New_2020', '2022-02-10'],
        ['USGS 1 Meter 13 x47y443 CO_New_2020', 'CO_New_2020', '2022-02-10'],
        ['USGS 1 Meter 13 x47y443 CO_Old_2013', 'CO_Old_2013', '2015-07-21'],
        ['Undated', 'undated.tif', '']
    ]);
    assert.equal(models[1].url, 'https://example.com/Elevation/1m/Projects/CO_New_2020/TIFF/USGS_1M_13_x46y443_CO_New_2020.tif');
});


test('elevationModels, pages', async () => {
    // The products are requested a page at a time, until the total
    const offsets = [];
    const page = (url) => {
        const offset = Number(url.match(/&offset=(\d+)$/)[1]);
        offsets.push(offset);
        const items = [];
        for (let ix = offset; ix < Math.min(offset + 100, 230); ix++) {
            items.push(testItem('CO_New_2020', `x${ix}`, '2022-02-10'));
        }
        return Promise.resolve({'total': 230, items});
    };
    assert.equal((await elevationModels(page, [0, 0, 1, 1])).length, 230);
    assert.deepEqual(offsets, [0, 100, 200]);

    // A page without products is the last
    offsets.length = 0;
    const models = await elevationModels((url) => {
        offsets.push(url.match(/&offset=(\d+)$/)[1]);
        return Promise.resolve({'total': 500, 'items': offsets.length === 1 ? [testItem('CO_New_2020', 'x1', '2022-02-10')] : []});
    }, [0, 0, 1, 1]);
    assert.deepEqual([models.length, offsets], [1, ['0', '100']]);

    // No products
    assert.deepEqual(await elevationModels(() => Promise.resolve({'total': 0, 'items': []}), [0, 0, 1, 1]), []);
});


test('elevationModels, a response that is not a product list', async () => {
    for (const response of [{'errorMessage': 'Service unavailable'}, {'total': 1}, {'items': []}, {'total': '1', 'items': []}]) {
        await assert.rejects(
            elevationModels(() => Promise.resolve(response), [0, 0, 1, 1]),
            {'message': 'The USGS National Map product service\'s response is not a product list'}
        );
    }
});
