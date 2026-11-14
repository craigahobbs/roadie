// usgs.js - the USGS National Map services - the 3D Elevation Program's 1 meter elevation models, the National
// Hydrography Dataset's streams, the transportation dataset's roads and trails, and the topographic base map


// The National Map's product service
export const productsUrl = 'https://tnmaccess.nationalmap.gov/api/v1/products';


// The 3D Elevation Program's 1 meter elevation model dataset - lidar ground elevations, gridded by the USGS
export const elevationDataset = 'Digital Elevation Model (DEM) 1 meter';


// The number of products in a page of the product service's results
const pageSize = 100;


// Fetch a URL's JSON - "fetchFn" is the fetch function, and "sleep" is a function that waits a number of
// milliseconds. The National Map's services fail now and then, so a failed request is tried again, a few times.
export function fetchJson(fetchFn, sleep, url, tries = 4) {
    return fetchRetry(fetchFn, sleep, url, tries, (response) => response.json());
}


// Fetch a URL's bytes (a Uint8Array) - an image's
export function fetchBytes(fetchFn, sleep, url, tries = 4) {
    return fetchRetry(fetchFn, sleep, url, tries, async (response) => {
        const type = response.headers.get('content-type') ?? '';
        if (!type.startsWith('image/')) {
            throw new Error(`content type "${type}"`);
        }
        return new Uint8Array(await response.arrayBuffer());
    });
}


// Fetch a URL - "read" is a function that reads the response
async function fetchRetry(fetchFn, sleep, url, tries, read) {
    let error = null;
    for (let ixTry = 0; ixTry < tries; ixTry++) {
        if (ixTry > 0) {
            await sleep(1000 * 2 ** (ixTry - 1));
        }
        try {
            const response = await fetchFn(url);
            if (response.ok) {
                return await read(response);
            }
            error = `status ${response.status}`;
        } catch ({message}) {
            error = message;
        }
    }
    throw new Error(`Could not fetch "${url}" (${error})`);
}


// Find the 1 meter elevation models of a box of the Earth ([west, south, east, north], in degrees) - "getJson" is a
// function that fetches a URL's JSON. Returns the elevation model objects ("name", "survey", "date", and "url"),
// the newest first. A model is one of a survey's tiles - a tile's box isn't always full of its survey's elevations.
export async function elevationModels(getJson, box) {
    const models = [];
    for (let offset = 0, total = 1; offset < total; offset += pageSize) {
        const query = `datasets=${encodeURIComponent(elevationDataset)}&bbox=${box.join(',')}&max=${pageSize}&offset=${offset}`;
        const page = await getJson(`${productsUrl}?${query}`);
        if (!Array.isArray(page.items) || typeof page.total !== 'number') {
            throw new Error('The USGS National Map product service\'s response is not a product list');
        }
        ({total} = page);
        for (const item of page.items) {
            const url = item.downloadURL ?? null;
            if (item.format === 'GeoTIFF' && url !== null) {
                models.push({'name': item.title, 'survey': modelSurvey(url), 'date': item.publicationDate ?? '', url});
            }
        }
        if (page.items.length === 0) {
            break;
        }
    }
    return models.sort((model1, model2) => (
        model2.date.localeCompare(model1.date) || model1.survey.localeCompare(model2.survey) || model1.name.localeCompare(model2.name)
    ));
}


// Get an elevation model's survey name from its URL - the name of its project's directory
// (".../1m/Projects/<survey>/TIFF/<tile>.tif"), or the URL's file name
function modelSurvey(url) {
    const match = url.match(/\/Projects\/([^/]+)\//);
    return match !== null ? match[1] : url.slice(url.lastIndexOf('/') + 1);
}


// The National Hydrography Dataset's flowlines - its streams and rivers, canals and ditches, and the paths through its
// water bodies (the feature type codes 460, 336, and 558). Pipelines and underground conduits aren't crossed.
export const streamsUrl = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6';
const streamTypes = new Set([460, 336, 558]);


// The National Map's transportation dataset's roads (its highways, local roads, and four-wheel-drive roads) and its
// trails
export const roadsUrl = 'https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer';
const roadLayers = [29, 30, 31, 32, 35];
const trailLayers = [37];


// Find the streams of a box of the Earth ([west, south, east, north], in degrees) - "getJson" is a function that
// fetches a URL's JSON. Returns the stream line objects - each has an optional "name" and its "points" ([longitude,
// latitude] arrays), downstream.
export async function streamLines(getJson, box) {
    const lines = await layerLines(getJson, streamsUrl, box, 'gnis_name,ftype');
    return lines.filter(({properties}) => streamTypes.has(properties.ftype)).
        map(({properties, points}) => lineObject(properties.gnis_name, points));
}


// Find the roads of a box of the Earth - returns the road line objects (like streamLines')
export function roadLines(getJson, box) {
    return transportationLines(getJson, box, roadLayers);
}


// Find the trails of a box of the Earth - returns the trail line objects (like streamLines')
export function trailLines(getJson, box) {
    return transportationLines(getJson, box, trailLayers);
}


// Find the lines of the transportation dataset's layers, a layer at a time
async function transportationLines(getJson, box, layers) {
    const lines = [];
    for (const layer of layers) {
        for (const {properties, points} of await layerLines(getJson, `${roadsUrl}/${layer}`, box, 'name')) {
            lines.push(lineObject(properties.name, points));
        }
    }
    return lines;
}


// Create a line object - a line's name may be missing, or blank
function lineObject(name, points) {
    const lineName = typeof name === 'string' ? name.trim() : '';
    return lineName !== '' ? {'name': lineName, points} : {points};
}


// Query a map service layer's line features of a box - returns the lines' "properties" and "points"
async function layerLines(getJson, layerUrl, box, fields) {
    const lines = [];
    const query = `where=1%3D1&geometry=${box.join(',')}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
        `&outFields=${fields}&outSR=4326&f=geojson`;
    for (let offset = 0, more = true; more;) {
        const page = await getJson(`${layerUrl}/query?${query}&resultOffset=${offset}`);
        if (!Array.isArray(page.features)) {
            throw new Error(`The USGS National Map service's response is not a feature list ("${layerUrl}")`);
        }
        for (const feature of page.features) {
            // A feature is a line, or lines
            const {type, coordinates} = feature.geometry ?? {};
            const properties = feature.properties ?? {};
            for (const points of type === 'LineString' ? [coordinates] : (type === 'MultiLineString' ? coordinates : [])) {
                lines.push({properties, points});
            }
        }
        offset += page.features.length;
        more = page.exceededTransferLimit === true && page.features.length > 0;
    }
    return lines;
}


// The National Map's topographic base map
export const topoMapUrl = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/export';


// Get the URL of the topographic base map image (a PNG) of a box of the Earth, "width" by "height" pixels
export function topoMapImageUrl(box, width, height) {
    return `${topoMapUrl}?bbox=${box.join(',')}&bboxSR=4326&imageSR=4326&size=${width},${height}&format=png&f=image`;
}
