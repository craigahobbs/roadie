import {
    elevationDataset, elevationModels, fetchBytes, fetchJson, productsUrl, roadLines, roadsUrl, streamLines, streamsUrl, topoMapImageUrl,
    topoMapUrl, trailLines
} from '../lib/usgs.js';
import {testItem, testLine} from './terrainHelpers.js';
import assert from 'node:assert/strict';
import test from 'node:test';


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


test('fetchBytes', async () => {
    // An image's bytes
    const image = (type, bytes = [1, 2, 3]) => ({
        'ok': true,
        'headers': {'get': (name) => (name === 'content-type' ? type : null)},
        'arrayBuffer': () => Promise.resolve(Uint8Array.from(bytes).buffer)
    });
    const sleeps = [];
    const sleep = (milliseconds) => {
        sleeps.push(milliseconds);
        return Promise.resolve();
    };
    const bytes = await fetchBytes(() => Promise.resolve(image('image/png')), sleep, 'https://example.com/map');
    assert.deepEqual([bytes.constructor, [...bytes], sleeps], [Uint8Array, [1, 2, 3], []]);

    // A response that isn't an image is a failed request - the map service's errors are JSON, with an OK status
    const responses = [image('application/json'), {'ok': false, 'status': 500}, image('image/png', [4, 5])];
    assert.deepEqual([...await fetchBytes(() => Promise.resolve(responses.shift()), sleep, 'https://example.com/map')], [4, 5]);
    assert.deepEqual(sleeps, [1000, 2000]);
    await assert.rejects(
        fetchBytes(() => Promise.resolve(image(null)), sleep, 'https://example.com/map', 1),
        {'message': 'Could not fetch "https://example.com/map" (content type "")'}
    );
});


test('streamLines', async () => {
    assert.equal(streamsUrl, 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6');

    // The streams are the box's streams and rivers (460), canals and ditches (336), and paths through water (558) -
    // not its pipelines (428) or underground conduits (420)
    const urls = [];
    const features = [
        testLine({'gnis_name': 'Mill Creek', 'ftype': 460}, [[-105.28, 40], [-105.279, 40.001]]),
        testLine({'gnis_name': ' ', 'ftype': 460}, [[-105.27, 40], [-105.269, 40.001]]),
        testLine({'gnis_name': null, 'ftype': 336}, [[-105.26, 40], [-105.259, 40.001]]),
        testLine({'gnis_name': 'Aqueduct', 'ftype': 428}, [[-105.25, 40], [-105.249, 40.001]]),
        testLine({'gnis_name': 'Culvert', 'ftype': 420}, [[-105.25, 40], [-105.249, 40.001]]),
        testLine({'gnis_name': ' Long Lake ', 'ftype': 558}, [[-105.24, 40], [-105.239, 40.001]]),
        {'type': 'Feature', 'properties': {'gnis_name': 'Braided', 'ftype': 460}, 'geometry': {
            'type': 'MultiLineString', 'coordinates': [[[-105.23, 40], [-105.229, 40.001]], [[-105.22, 40], [-105.219, 40.001]]]
        }},
        {'type': 'Feature', 'properties': {'ftype': 460}, 'geometry': {'type': 'Point', 'coordinates': [-105.2, 40]}},
        {'type': 'Feature', 'properties': {'ftype': 460}, 'geometry': null},
        {'type': 'Feature', 'geometry': {'type': 'LineString', 'coordinates': [[-105.21, 40], [-105.209, 40.001]]}}
    ];
    const lines = await streamLines((url) => {
        urls.push(url);
        return Promise.resolve({'type': 'FeatureCollection', features});
    }, [-105.29, 39.99, -105.2, 40.01]);
    assert.deepEqual(urls, [
        'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6/query?where=1%3D1&geometry=-105.29,39.99,-105.2,40.01' +
            '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=gnis_name,ftype&outSR=4326' +
            '&f=geojson&resultOffset=0'
    ]);
    assert.deepEqual(lines, [
        {'name': 'Mill Creek', 'points': [[-105.28, 40], [-105.279, 40.001]]},
        {'points': [[-105.27, 40], [-105.269, 40.001]]},
        {'points': [[-105.26, 40], [-105.259, 40.001]]},
        {'name': 'Long Lake', 'points': [[-105.24, 40], [-105.239, 40.001]]},
        {'name': 'Braided', 'points': [[-105.23, 40], [-105.229, 40.001]]},
        {'name': 'Braided', 'points': [[-105.22, 40], [-105.219, 40.001]]}
    ]);
});


test('streamLines, pages', async () => {
    // The service's features are requested until it has no more
    const offsets = [];
    const page = (count, exceededTransferLimit) => (url) => {
        offsets.push(Number(url.match(/&resultOffset=(\d+)$/)[1]));
        const features = [];
        for (let ix = 0; ix < count; ix++) {
            features.push(testLine({'gnis_name': `Creek ${offsets.at(-1) + ix}`, 'ftype': 460}, [[-105, 40], [-105, 40.1]]));
        }
        return Promise.resolve({features, exceededTransferLimit});
    };
    const pages = [page(3, true), page(3, true), page(2, false)];
    const lines = await streamLines((url) => pages.shift()(url), [0, 0, 1, 1]);
    assert.deepEqual([offsets, lines.map(({name}) => name).join(', ')], [
        [0, 3, 6], 'Creek 0, Creek 1, Creek 2, Creek 3, Creek 4, Creek 5, Creek 6, Creek 7'
    ]);

    // A page without features is the last
    offsets.length = 0;
    const empty = [page(2, true), page(0, true), page(2, true)];
    assert.equal((await streamLines((url) => empty.shift()(url), [0, 0, 1, 1])).length, 2);
    assert.deepEqual(offsets, [0, 2]);

    // A response that isn't a feature list
    await assert.rejects(streamLines(() => Promise.resolve({'error': {'code': 400}}), [0, 0, 1, 1]), {
        'message': 'The USGS National Map service\'s response is not a feature list ' +
            '("https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6")'
    });
});


test('roadLines', async () => {
    assert.equal(roadsUrl, 'https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer');

    // The roads are the box's highways, local roads, and four-wheel-drive roads - a layer at a time
    const layers = [];
    const getJson = (url) => {
        const [, layer] = url.match(/\/MapServer\/(\d+)\/query\?/);
        layers.push(layer);
        assert.ok(url.endsWith(
            '/query?where=1%3D1&geometry=-105.29,39.99,-105.2,40.01&geometryType=esriGeometryEnvelope&inSR=4326' +
                '&spatialRel=esriSpatialRelIntersects&outFields=name&outSR=4326&f=geojson&resultOffset=0'
        ));
        return Promise.resolve({'features': layer === '31' ? [] : [
            testLine({'name': `Road ${layer}`}, [[-105.28, 40], [-105.279, 40.001]]),
            ...(layer === '37' ? [testLine({'name': null}, [[-105.27, 40], [-105.269, 40.001]])] : [])
        ]});
    };
    const box = [-105.29, 39.99, -105.2, 40.01];
    assert.deepEqual(await roadLines(getJson, box), [
        {'name': 'Road 29', 'points': [[-105.28, 40], [-105.279, 40.001]]},
        {'name': 'Road 30', 'points': [[-105.28, 40], [-105.279, 40.001]]},
        {'name': 'Road 32', 'points': [[-105.28, 40], [-105.279, 40.001]]},
        {'name': 'Road 35', 'points': [[-105.28, 40], [-105.279, 40.001]]}
    ]);
    assert.deepEqual(layers, ['29', '30', '31', '32', '35']);

    // The trails are their own lines - a road option doesn't follow them
    assert.deepEqual(await trailLines(getJson, box), [
        {'name': 'Road 37', 'points': [[-105.28, 40], [-105.279, 40.001]]},
        {'points': [[-105.27, 40], [-105.269, 40.001]]}
    ]);
    assert.deepEqual(layers, ['29', '30', '31', '32', '35', '37']);
});


test('topoMapImageUrl', () => {
    assert.equal(topoMapUrl, 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/export');
    assert.equal(
        topoMapImageUrl([-105.29, 39.99, -105.27, 40.01], 2000, 1500),
        'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/export?bbox=-105.29,39.99,-105.27,40.01' +
            '&bboxSR=4326&imageSR=4326&size=2000,1500&format=png&f=image'
    );
});
