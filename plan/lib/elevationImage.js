// elevationImage.js - a USGS elevation model image - a GeoTIFF file of elevations, in a UTM zone


// Create an elevation image object from a GeoTIFF image - its "georeference" (its UTM "zone", its northwest corner's
// UTM "east" and "north", its pixel "resolution" in meters, its "width" and "height" in pixels, and its "noData"
// elevation), and its "read" function, which reads a window of its elevations ([x1, y1, x2, y2] - the pixel columns x1
// up to x2 and rows y1 up to y2) as a Float32Array of the window's rows
export function elevationImage(image) {
    const [east, north] = image.getOrigin();
    const [resolution, resolutionY] = image.getResolution();
    if (!(resolution > 0) || Math.abs(resolution + resolutionY) > 1e-9 * resolution) {
        throw new Error(`The elevation model's pixels are ${resolution} x ${resolutionY} - they aren't square, north up`);
    }
    return {
        'georeference': {
            'zone': imageZone(image.getGeoKeys() ?? {}),
            east,
            north,
            resolution,
            'width': image.getWidth(),
            'height': image.getHeight(),
            'noData': image.getGDALNoData()
        },
        'read': async (window) => {
            const [data] = await image.readRasters({window, 'samples': [0]});
            return Float32Array.from(data);
        }
    };
}


// The UTM coordinate systems' EPSG codes - [first zone's code - 1, zone count]
const utmCodes = [
    // NAD83
    [26900, 23],
    // NAD83(2011)
    [6329, 19],
    // WGS 84
    [32600, 60]
];


// Get an elevation model image's UTM zone (north) from its GeoTIFF keys - from its coordinate system's code, or
// its citation
function imageZone(keys) {
    const code = keys.ProjectedCSTypeGeoKey ?? 0;
    for (const [base, count] of utmCodes) {
        if (code > base && code <= base + count) {
            return code - base;
        }
    }
    const citation = `${keys.GTCitationGeoKey ?? ''}`;
    const match = citation.match(/UTM zone (\d+)N/i);
    if (match === null) {
        throw new Error(`The elevation model's coordinate system (${code}, "${citation}") isn't a UTM zone`);
    }
    return Number(match[1]);
}
