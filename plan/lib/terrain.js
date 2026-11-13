// terrain.js - a road site's topography grid, from the USGS 3D Elevation Program's 1 meter elevation models

import {project, transverseMercator, unproject, utmFalseEasting, utmZone} from '../../viewer/lib/geo.js';


// The meters per foot
export const metersPerFoot = 0.3048;


// The topography grid's size limit, in grid points - the default grid spacing is the finest that's within it
export const gridLimit = 1000000;


// The topography grid spacings, in plan units, finest first - the elevation models are 1 meter grids
const gridSpacings = {
    'feet': [5, 10, 15, 20, 25, 30, 40, 50, 100, 200],
    'meters': [1, 2, 3, 5, 10, 15, 20, 30, 50]
};


// The site's default margin beyond its start and end points, as a fraction of the distance between them, and its
// minimum and maximum, in feet and meters
const marginFraction = 0.3;
const marginMinimum = {'feet': 500, 'meters': 150};
const marginMaximum = {'feet': 2000, 'meters': 600};


// Lay out a road site's topography grid - the plan's coordinate system and its grid. The plan's coordinates are a
// transverse Mercator projection centered between the start and end points; the grid's southwest corner is the
// plan's origin. Returns the layout object - the projection and its "latitude" and "longitude", the grid's southwest
// corner ("west" and "south", in meters east and north of the projection's center), the meters per plan unit
// ("scale"), the grid "spacing" (in plan units), "nCols", and "nRows", and the plan's "start" and "end" points.
export function siteLayout(site, limit = gridLimit) {
    const {units, start, end} = site;
    const scale = units === 'feet' ? metersPerFoot : 1;

    // The projection - its center is rounded, to about a tenth of a meter, so it's exactly the plan's georeference
    const latitude = round((start.latitude + end.latitude) / 2, 6);
    const longitude = round((start.longitude + end.longitude) / 2, 6);
    const projection = transverseMercator(latitude, longitude);
    const [startEast, startNorth] = project(projection, start.latitude, start.longitude);
    const [endEast, endNorth] = project(projection, end.latitude, end.longitude);

    // The site's extent
    const distance = Math.hypot(endEast - startEast, endNorth - startNorth);
    const margin = 'margin' in site ? site.margin * scale :
        Math.max(marginMinimum[units] * scale, Math.min(marginMaximum[units] * scale, marginFraction * distance));
    const west = Math.min(startEast, endEast) - margin;
    const south = Math.min(startNorth, endNorth) - margin;
    const width = (Math.max(startEast, endEast) + margin - west) / scale;
    const height = (Math.max(startNorth, endNorth) + margin - south) / scale;

    // The grid - the finest spacing that's within the grid's size limit. The grid covers the site's extent.
    const gridCount = (length, spacing) => Math.ceil(length / spacing - 1e-9) + 1;
    const candidates = gridSpacings[units];
    const spacing = site.spacing ??
        candidates.find((candidate) => gridCount(width, candidate) * gridCount(height, candidate) <= limit) ?? candidates.at(-1);

    const planPoint = (east, north, point, label) => ({
        'x': round((east - west) / scale, 2), 'y': round((north - south) / scale, 2), 'label': point.label ?? label
    });
    return {
        units,
        scale,
        projection,
        latitude,
        longitude,
        west,
        south,
        spacing,
        'nCols': gridCount(width, spacing),
        'nRows': gridCount(height, spacing),
        'start': planPoint(startEast, startNorth, start, 'Start'),
        'end': planPoint(endEast, endNorth, end, 'End')
    };
}


// Round a number to a number of decimal places
export function round(value, digits) {
    return Math.round(value * 10 ** digits) / 10 ** digits;
}


// Get a layout's road plan georeference - the plan coordinates of the projection's center
export function layoutGeoreference(layout) {
    return {
        'latitude': layout.latitude,
        'longitude': layout.longitude,
        'x': round(-layout.west / layout.scale, 3),
        'y': round(-layout.south / layout.scale, 3)
    };
}


// Get a plan point's latitude and longitude, in degrees ([latitude, longitude])
export function layoutLatLong(layout, x, y) {
    return unproject(layout.projection, layout.west + x * layout.scale, layout.south + y * layout.scale);
}


// Get a latitude and longitude's plan point ([x, y])
export function layoutPoint(layout, latitude, longitude) {
    const [east, north] = project(layout.projection, latitude, longitude);
    return [(east - layout.west) / layout.scale, (north - layout.south) / layout.scale];
}


// Get the box of the Earth that contains a layout's grid - [west, south, east, north], in degrees
export function layoutBox(layout) {
    const width = (layout.nCols - 1) * layout.spacing;
    const height = (layout.nRows - 1) * layout.spacing;
    let box = null;
    for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height], [width / 2, 0], [width / 2, height]]) {
        const [latitude, longitude] = layoutLatLong(layout, x, y);
        box = box === null ? [longitude, latitude, longitude, latitude] : [
            Math.min(box[0], longitude), Math.min(box[1], latitude), Math.max(box[2], longitude), Math.max(box[3], latitude)
        ];
    }
    return box.map((degrees) => round(degrees, 6));
}


// The distance between the points of an elevation model's pixel mapping, in meters - the mapping from the plan's
// projection to a model's UTM zone is so nearly linear that between them it's interpolated (to within millimeters)
const mappingDistance = 250;


// Compute a layout's mapping to an elevation model's pixels - "image" is the model image's georeference object: its
// UTM "zone", its northwest corner's UTM "east" and "north", its pixel "resolution" (in meters), and its "width" and
// "height" (in pixels). Returns the mapping object for the mapPixel function.
function pixelMapping(layout, image) {
    const {scale, spacing, nCols, nRows, projection} = layout;
    const zone = utmZone(image.zone);
    const step = Math.max(1, Math.floor(mappingDistance / (spacing * scale)));
    const count = (gridCount) => Math.ceil((gridCount - 1) / step) + 1;
    const mapCols = count(nCols);
    const mapRows = count(nRows);
    const pixelX = new Float64Array(mapCols * mapRows);
    const pixelY = new Float64Array(mapCols * mapRows);
    for (let mapRow = 0; mapRow < mapRows; mapRow++) {
        for (let mapCol = 0; mapCol < mapCols; mapCol++) {
            // The mapping point's grid row is from the grid's north
            const east = layout.west + mapCol * step * spacing * scale;
            const north = layout.south + (nRows - 1 - mapRow * step) * spacing * scale;
            const [latitude, longitude] = unproject(projection, east, north);
            const [zoneEast, zoneNorth] = project(zone, latitude, longitude);
            const index = mapRow * mapCols + mapCol;
            pixelX[index] = (zoneEast + utmFalseEasting - image.east) / image.resolution;
            pixelY[index] = (image.north - zoneNorth) / image.resolution;
        }
    }
    return {step, mapCols, mapRows, pixelX, pixelY};
}


// Map a grid position (fractional grid column and row, from the grid's northwest corner) to an elevation model's
// pixel position - the result is written to "out" ([x, y])
function mapPixel(mapping, col, row, out) {
    const {step, mapCols, mapRows, pixelX, pixelY} = mapping;
    const mapCol = Math.max(0, Math.min(mapCols - 2, Math.floor(col / step)));
    const mapRow = Math.max(0, Math.min(mapRows - 2, Math.floor(row / step)));
    const fx = col / step - mapCol;
    const fy = row / step - mapRow;
    const index = mapRow * mapCols + mapCol;
    const index2 = index + mapCols;
    out[0] = (pixelX[index] * (1 - fx) + pixelX[index + 1] * fx) * (1 - fy) + (pixelX[index2] * (1 - fx) + pixelX[index2 + 1] * fx) * fy;
    out[1] = (pixelY[index] * (1 - fx) + pixelY[index + 1] * fx) * (1 - fy) + (pixelY[index2] * (1 - fx) + pixelY[index2 + 1] * fx) * fy;
}


// Find the window of an elevation model's pixels that a layout's grid needs - [x1, y1, x2, y2] (the pixel columns x1
// up to x2, and rows y1 up to y2), or null if the grid is outside the model. "region" is the part of the grid that's
// needed - its points' [first column, first row, column end, row end] - or null for all of it.
export function tileWindow(layout, image, region = null) {
    // The region's edges, half a grid cell beyond its points, and a pixel more for the elevations' interpolation
    const mapping = pixelMapping(layout, image);
    const [colFirst, rowFirst, colEnd, rowEnd] = region ?? [0, 0, layout.nCols, layout.nRows];
    const out = [0, 0];
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    const edge = (col, row) => {
        mapPixel(mapping, col, row, out);
        x1 = Math.min(x1, out[0]);
        y1 = Math.min(y1, out[1]);
        x2 = Math.max(x2, out[0]);
        y2 = Math.max(y2, out[1]);
    };
    for (let col = colFirst; col < colEnd; col += mapping.step) {
        edge(col, rowFirst - 0.5);
        edge(col, rowEnd - 0.5);
    }
    for (let row = rowFirst; row < rowEnd; row += mapping.step) {
        edge(colFirst - 0.5, row);
        edge(colEnd - 0.5, row);
    }
    for (const col of [colFirst - 0.5, colEnd - 0.5]) {
        for (const row of [rowFirst - 0.5, rowEnd - 0.5]) {
            edge(col, row);
        }
    }
    const window = [
        Math.max(0, Math.floor(x1) - 2), Math.max(0, Math.floor(y1) - 2),
        Math.min(image.width, Math.ceil(x2) + 2), Math.min(image.height, Math.ceil(y2) + 2)
    ];
    return window[0] < window[2] && window[1] < window[3] ? window : null;
}


// The most pixels of an elevation model that are read at once, and the number of times a failed read is tried
const readPixels = 4000000;
const readTries = 4;


// Read an elevation model's tile - the window of its elevations that a layout's grid needs. "io" is the tools'
// input and output functions, "directory" is the tiles' cache directory, "model" is the elevation model object
// (usgs.js), and "region" is the part of the grid that's needed (tileWindow's), or null. Returns the tile object - the
// model's image georeference, its "window", and the window's elevations ("data", a Float32Array of its rows) - or
// null if the region is outside the model. The tile is cached, so a model is only opened (it's a large remote file)
// for elevations that haven't been read yet.
export async function readTile(io, directory, model, layout, region = null) {
    const name = model.url.slice(model.url.lastIndexOf('/') + 1).replace(/\.tiff?$/i, '');
    const path = `${directory}/${name}`;

    // The cached tile - it's used if its window contains the grid's
    let cached = null;
    try {
        cached = JSON.parse(io.readFile(`${path}.json`));
    } catch {
        // The tile isn't cached
    }
    if (cached !== null && cached.url === model.url) {
        const window = tileWindow(layout, cached.image, region);
        if (window === null) {
            return null;
        }
        const cachedWindow = cached.window;
        if (cachedWindow !== null && cachedWindow[0] <= window[0] && cachedWindow[1] <= window[1] &&
            cachedWindow[2] >= window[2] && cachedWindow[3] >= window[3]) {
            return {...cached, 'data': new Float32Array(io.readBytes(`${path}.f32`).slice().buffer)};
        }
    }

    // Read the tile's window, and cache it - a model that the grid is outside of is cached, too. The window is read a
    // band of its rows at a time: a model's file is remote, and a read of it fails now and then, so a failed read is
    // tried again.
    const image = await readRetry(io, () => io.openImage(model.url));
    const window = tileWindow(layout, image.georeference, region);
    const tile = {'url': model.url, 'image': image.georeference, window};
    if (window === null) {
        io.writeFile(`${path}.json`, `${JSON.stringify(tile)}\n`);
        return null;
    }
    const [x1, y1, x2, y2] = window;
    const width = x2 - x1;
    const data = new Float32Array(width * (y2 - y1));
    const bandRows = Math.max(1, Math.floor(readPixels / width));
    for (let row = y1; row < y2; row += bandRows) {
        const band = [x1, row, x2, Math.min(y2, row + bandRows)];
        data.set(await readRetry(io, () => image.read(band)), (row - y1) * width);
    }
    io.writeBytes(`${path}.f32`, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    io.writeFile(`${path}.json`, `${JSON.stringify(tile)}\n`);
    return {...tile, data};
}


// Read a remote file - "read" is the function that reads it. A failed read is tried again, after a wait.
async function readRetry(io, read) {
    let error = null;
    for (let ixTry = 0; ixTry < readTries; ixTry++) {
        if (ixTry > 0) {
            await io.sleep(1000 * 2 ** (ixTry - 1));
        }
        try {
            return await read();
        } catch (readError) {
            error = readError;
        }
    }
    throw error;
}


// Grid a survey's elevations - the grid's points that have no elevation yet (NaN) get the elevation of the survey's
// tiles there. A point's elevation is the mean of the elevations within its grid cell, sampled a model pixel apart -
// so a grid coarser than the models isn't aliased. "elevations" is the grid's elevations, in meters (a Float64Array
// of its rows, north to south). Returns the number of points that got an elevation.
export function gridSurvey(layout, tiles, elevations) {
    const {nCols, nRows} = layout;
    const mappings = tiles.map((tile) => pixelMapping(layout, tile.image));
    const samples = Math.max(1, Math.round(layout.spacing * layout.scale / Math.max(...tiles.map((tile) => tile.image.resolution))));
    const out = [0, 0];
    let count = 0;
    for (let row = 0; row < nRows; row++) {
        for (let col = 0; col < nCols; col++) {
            const index = row * nCols + col;
            if (!Number.isNaN(elevations[index])) {
                continue;
            }

            // The samples within the point's grid cell - each is the first tile's elevation there
            let sum = 0;
            let sumCount = 0;
            for (let sampleY = 0; sampleY < samples; sampleY++) {
                const sampleRow = row + (sampleY + 0.5) / samples - 0.5;
                for (let sampleX = 0; sampleX < samples; sampleX++) {
                    const sampleCol = col + (sampleX + 0.5) / samples - 0.5;
                    for (let ixTile = 0; ixTile < tiles.length; ixTile++) {
                        mapPixel(mappings[ixTile], sampleCol, sampleRow, out);
                        const elevation = tileElevation(tiles[ixTile], out[0], out[1]);
                        if (elevation !== null) {
                            sum += elevation;
                            sumCount += 1;
                            break;
                        }
                    }
                }
            }
            if (sumCount > 0) {
                elevations[index] = sum / sumCount;
                count += 1;
            }
        }
    }
    return count;
}


// Get a tile's elevation at a model pixel position - the bilinear interpolation of the four pixels around it (a
// pixel's elevation is at its center) - or null if the tile has no elevation there
function tileElevation(tile, pixelX, pixelY) {
    const [windowX, windowY, windowX2, windowY2] = tile.window;
    const width = windowX2 - windowX;
    const fx = pixelX - 0.5 - windowX;
    const fy = pixelY - 0.5 - windowY;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    if (x < 0 || y < 0 || x + 1 >= width || y + 1 >= windowY2 - windowY) {
        return null;
    }
    const {data} = tile;
    const {noData} = tile.image;
    const index = y * width + x;
    const z1 = data[index];
    const z2 = data[index + 1];
    const z3 = data[index + width];
    const z4 = data[index + width + 1];
    if (isNoData(z1, noData) || isNoData(z2, noData) || isNoData(z3, noData) || isNoData(z4, noData)) {
        return null;
    }
    const tx = fx - x;
    const ty = fy - y;
    return (z1 * (1 - tx) + z2 * tx) * (1 - ty) + (z3 * (1 - tx) + z4 * tx) * ty;
}


// Determine if a model pixel has no elevation - the model's "no data" value, or one that isn't a number
function isNoData(elevation, noData) {
    return elevation === noData || !Number.isFinite(elevation);
}


// The most of a grid's points that may have no elevation, as a fraction of them - they're filled from the points
// around them
const holeLimit = 0.01;


// Fill a grid's points that have no elevation (NaN) with the mean elevation of the points around them that do - a
// few points at the edge of a survey, or a gap in it. Returns the number of points filled.
export function fillHoles(layout, elevations) {
    const {nCols, nRows} = layout;
    let holes = [];
    for (let index = 0; index < elevations.length; index++) {
        if (Number.isNaN(elevations[index])) {
            holes.push(index);
        }
    }
    const count = holes.length;
    while (holes.length > 0) {
        // Fill the holes that have neighbors with elevations - the filled elevations are set together, afterward
        const filled = [];
        const remaining = [];
        for (const index of holes) {
            const row = Math.floor(index / nCols);
            const col = index - row * nCols;
            let sum = 0;
            let sumCount = 0;
            for (let row2 = Math.max(0, row - 1); row2 <= Math.min(nRows - 1, row + 1); row2++) {
                for (let col2 = Math.max(0, col - 1); col2 <= Math.min(nCols - 1, col + 1); col2++) {
                    const elevation = elevations[row2 * nCols + col2];
                    if (!Number.isNaN(elevation)) {
                        sum += elevation;
                        sumCount += 1;
                    }
                }
            }
            if (sumCount > 0) {
                filled.push(index, sum / sumCount);
            } else {
                remaining.push(index);
            }
        }
        for (let ix = 0; ix < filled.length; ix += 2) {
            elevations[filled[ix]] = filled[ix + 1];
        }
        holes = remaining;
    }
    return count;
}


// Create a site's topography grid from its elevation models (usgs.js - the newest first). "readModel" is a function
// that reads a model's tile for a region of the layout's grid (readTile). The newest survey's elevations are used - an
// older survey's only where the newer surveys have none, so only that region of an older survey's models is read.
// Returns the grid's "elevations" (in meters - a Float64Array of the grid's rows, north to south), the "surveys" used
// (their "name", "date", and "url" - a tile's), and the number of grid points filled from the points around them
// ("filled").
export async function siteTerrain(layout, models, readModel) {
    const {nCols, nRows} = layout;
    const elevations = new Float64Array(nCols * nRows).fill(NaN);
    let holes = elevations.length;

    // The surveys, newest first
    const surveyModels = new Map();
    for (const model of models) {
        surveyModels.set(model.survey, [...(surveyModels.get(model.survey) ?? []), model]);
    }
    const surveys = [];
    for (const [name, surveyTiles] of surveyModels) {
        if (holes === 0) {
            break;
        }
        // The region of the grid's points that have no elevation yet
        let region = null;
        if (holes < elevations.length) {
            region = [nCols, nRows, 0, 0];
            for (let index = 0; index < elevations.length; index++) {
                if (Number.isNaN(elevations[index])) {
                    const row = Math.floor(index / nCols);
                    const col = index - row * nCols;
                    region = [
                        Math.min(region[0], col), Math.min(region[1], row), Math.max(region[2], col + 1), Math.max(region[3], row + 1)
                    ];
                }
            }
        }
        const tiles = [];
        for (const model of surveyTiles) {
            const tile = await readModel(model, region);
            if (tile !== null) {
                tiles.push({...tile, model});
            }
        }
        if (tiles.length > 0) {
            const count = gridSurvey(layout, tiles, elevations);
            if (count > 0) {
                holes -= count;
                surveys.push({name, 'date': tiles[0].model.date, 'url': tiles[0].model.url});
            }
        }
    }

    // The points without an elevation - a few are filled from the points around them
    if (holes > holeLimit * elevations.length) {
        const percent = Math.max(1, Math.round(100 * holes / elevations.length));
        throw new Error(models.length === 0 ?
            'The USGS has no 1 meter elevation models of the site' :
            `The USGS 1 meter elevation models have no elevations for ${percent}% of the site`);
    }
    return {elevations, surveys, 'filled': fillHoles(layout, elevations)};
}
