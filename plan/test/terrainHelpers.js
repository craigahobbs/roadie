// terrainHelpers.js - synthetic elevation models and the tools' input and output functions for the tests

import {project, unproject, utmFalseEasting, utmZone} from '../../viewer/lib/geo.js';


// A road site near Boulder, Colorado (UTM zone 13) - its start and end points are about 380 meters apart
export function testSite(members = {}) {
    return {
        'title': 'Test Site',
        'units': 'meters',
        'start': {'latitude': 40, 'longitude': -105.28},
        'end': {'latitude': 40.002, 'longitude': -105.2765},
        ...members
    };
}


// The UTM zone 13 coordinates of the test site's center, about
export const siteEast = 476250;
export const siteNorth = 4427900;


// Get a layout grid point's UTM coordinates ([east, north]) in a zone
export function gridUtm(layout, zone, col, row) {
    const east = layout.west + col * layout.spacing * layout.scale;
    const north = layout.south + (layout.nRows - 1 - row) * layout.spacing * layout.scale;
    const [latitude, longitude] = unproject(layout.projection, east, north);
    const [zoneEast, zoneNorth] = project(utmZone(zone), latitude, longitude);
    return [zoneEast + utmFalseEasting, zoneNorth];
}


// A plane of elevations, in meters, of UTM coordinates - it rises to the east and to the north of the site's center
export function plane(east, north) {
    return 1700 + 0.1 * (east - siteEast) + 0.05 * (north - siteNorth);
}


// Create a synthetic elevation image - a 1 meter elevation model of an elevation function of UTM coordinates.
// "holes" is a function of pixel coordinates that returns true where the model has no elevation. The image counts
// its "reads".
export function testImage({
    zone = 13, east = siteEast - 1000, north = siteNorth + 1000, width = 2000, height = 2000, resolution = 1, noData = -999999,
    elevation = plane, holes = () => false
} = {}) {
    const image = {
        'georeference': {zone, east, north, resolution, width, height, noData},
        'reads': [],
        'read': (window) => {
            image.reads.push(window);
            const [x1, y1, x2, y2] = window;
            const data = new Float32Array((x2 - x1) * (y2 - y1));
            for (let y = y1; y < y2; y++) {
                for (let x = x1; x < x2; x++) {
                    // A pixel's elevation is at its center
                    data[(y - y1) * (x2 - x1) + (x - x1)] = holes(x, y) ? noData :
                        elevation(east + (x + 0.5) * resolution, north - (y + 0.5) * resolution);
                }
            }
            return Promise.resolve(data);
        }
    };
    return image;
}


// Create the tools' input and output functions - "files" is an object of the files' text (or bytes) by path,
// "images" is an object of the elevation images by URL, "pages" is the services' JSON responses - an array of each
// request's (a function of the request's URL, or the response), or a function of a request's URL - and "mapImage" is
// the topographic map image's bytes (null if it can't be fetched). The functions record the "output" text, the
// "written" paths, the "opened" image URLs, and the requested "urls".
export function testIo({files = {}, images = {}, pages = [], mapImage = null} = {}) {
    const io = {
        files,
        'output': [],
        'written': [],
        'opened': [],
        'urls': [],
        'readFile': (path) => {
            if (!(path in files) || typeof files[path] !== 'string') {
                throw new Error(`No such file "${path}"`);
            }
            return files[path];
        },
        'readBytes': (path) => {
            if (!(path in files)) {
                throw new Error(`No such file "${path}"`);
            }
            return files[path];
        },
        'writeFile': (path, text) => {
            io.written.push(path);
            files[path] = text;
        },
        'writeBytes': (path, bytes) => {
            io.written.push(path);
            files[path] = bytes.slice();
        },
        'write': (text) => io.output.push(text),
        'getJson': (url) => {
            const page = typeof pages === 'function' ? pages : pages[io.urls.length];
            io.urls.push(url);
            return Promise.resolve(typeof page === 'function' ? page(url) : page);
        },
        'getBytes': (url) => {
            io.urls.push(url);
            return mapImage !== null ? Promise.resolve(mapImage) : Promise.reject(new Error(`Could not fetch "${url}" (status 500)`));
        },
        'openImage': (url) => {
            io.opened.push(url);
            if (!(url in images)) {
                return Promise.reject(new Error(`Could not open "${url}"`));
            }
            return Promise.resolve(images[url]);
        }
    };
    return io;
}


// Create an elevation model's product service item
export function testItem(survey, tile, date, format = 'GeoTIFF') {
    return {
        'title': `USGS 1 Meter 13 ${tile} ${survey}`,
        'publicationDate': date,
        format,
        'downloadURL': `https://example.com/Elevation/1m/Projects/${survey}/TIFF/USGS_1M_13_${tile}_${survey}.tif`
    };
}


// Create the services' JSON responses function (testIo's "pages") - "items" are the product service's elevation model
// items, and "streams" and "roads" are the hydrography and transportation services' GeoJSON features (the roads are
// the local roads layer's). A service whose response is an Error fails.
export function testPages({items = [], streams = [], roads = []} = {}) {
    return (url) => {
        let response;
        if (url.startsWith('https://tnmaccess.nationalmap.gov/')) {
            response = Array.isArray(items) ? {'total': items.length, items} : items;
        } else if (url.startsWith('https://hydro.nationalmap.gov/')) {
            response = Array.isArray(streams) ? {'type': 'FeatureCollection', 'features': streams} : streams;
        } else {
            const features = url.includes('/MapServer/32/') ? roads : [];
            response = Array.isArray(roads) ? {'type': 'FeatureCollection', features} : roads;
        }
        return response instanceof Error ? Promise.reject(response) : response;
    };
}


// Create a GeoJSON line feature - "points" are [longitude, latitude] arrays
export function testLine(properties, points) {
    return {'type': 'Feature', properties, 'geometry': {'type': 'LineString', 'coordinates': points}};
}
