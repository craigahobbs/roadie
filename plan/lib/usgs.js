// usgs.js - the USGS National Map services - the 3D Elevation Program's 1 meter elevation models


// The National Map's product service
export const productsUrl = 'https://tnmaccess.nationalmap.gov/api/v1/products';


// The 3D Elevation Program's 1 meter elevation model dataset - lidar ground elevations, gridded by the USGS
export const elevationDataset = 'Digital Elevation Model (DEM) 1 meter';


// The number of products in a page of the product service's results
const pageSize = 100;


// Fetch a URL's JSON - "fetchFn" is the fetch function, and "sleep" is a function that waits a number of
// milliseconds. The National Map's services fail now and then, so a failed request is tried again, a few times.
export async function fetchJson(fetchFn, sleep, url, tries = 4) {
    let error = null;
    for (let ixTry = 0; ixTry < tries; ixTry++) {
        if (ixTry > 0) {
            await sleep(1000 * 2 ** (ixTry - 1));
        }
        try {
            const response = await fetchFn(url);
            if (response.ok) {
                return await response.json();
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
