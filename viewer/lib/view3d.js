// view3d.js - the 3D views: projection, finished grade, terrain, road, and the report's 3D view choices

import {
    cellContours, colors, contourInterval, labelX, minRoadPx, niceStep, quadBrightness, rgb, roadColor, samplePoints,
    svgOpen, svgPolygon, svgPolyline, svgText, terrainFill
} from './draw.js';
import {elevation, gradient, outsideBox, sampleAt, unitLength} from './model.js';
import {fixed, station as formatStation, px, round} from './format.js';
import {opCircle, opPolygon, opPolyline, opTerrainCell, opText} from './canvas.js';


// The maximum 3D view zoom factor
export const maxZoom = 64;


// The minimum terrain cell size, in pixels, for drawing the minor contours in a 3D view
const minorContourPx = 6;


// The 3D terrain limits - the maximum number of terrain cells per side of a view ("sideCells"), and the smooth terrain's
// maximum number of interpolated grid points ("points"), minimum elevation grid cell size to smooth, in pixels
// ("facetPx"), minimum smooth cell size, in pixels ("cellPx"), and maximum number of cells per elevation grid cell side
// ("count"). These are the SVG drawing's limits (the command line's reports).
const smoothLimits = {'sideCells': 240, 'points': 40000, 'facetPx': 0, 'cellPx': 12, 'count': 4};


// The canvas drawings' terrain limits (the 3D explorer and the report's 3D views) - painting a canvas has far more
// headroom than building, laying out, and painting the SVG drawing's elements. There's no limit per side - the point
// limit sets the grid step, too - and the terrain is smoothed where its grid cells are large enough for their facets
// to show. The pages choose the point limit for their time budgets (smoothing.js); this one is for checking the drawing.
export const smoothLimitsCanvas = {'sideCells': null, 'points': 174000, 'facetPx': 8, 'cellPx': 3, 'count': 8};


// The 3D view's padding around the topography, in pixels (room for the start and end labels)
const pad3D = 16;


// Compute the finished grade topography rows - the original grid with the road and its slopes applied
export function finishedRows(topo, samples, halfWidth) {
    const rows = topo.rows.map((row) => row.slice());
    const {spacing, nRows, nCols} = topo;
    const interval = samples[1].station - samples[0].station;
    for (const sample of samples) {
        if (sample.bridge || sample.outside) {
            continue;
        }
        const {x, y, z, dx, dy, left, right} = sample;
        const extentLeft = halfWidth + left.offset;
        const extentRight = halfWidth + right.offset;
        const radius = Math.max(extentLeft, extentRight) + interval;
        const colMin = Math.max(0, Math.ceil((x - radius) / spacing));
        const colMax = Math.min(nCols - 1, Math.floor((x + radius) / spacing));
        const rowMin = Math.max(0, Math.ceil((nRows - 1) - (y + radius) / spacing));
        const rowMax = Math.min(nRows - 1, Math.floor((nRows - 1) - (y - radius) / spacing));
        for (let row = rowMin; row <= rowMax; row++) {
            const gy = (nRows - 1 - row) * spacing;
            const rowZ = rows[row];
            for (let col = colMin; col <= colMax; col++) {
                const gx = col * spacing;
                const along = (gx - x) * dx + (gy - y) * dy;
                const offset = (gx - x) * -dy + (gy - y) * dx;
                if (Math.abs(along) <= interval * 0.5 && offset <= extentLeft && offset >= -extentRight) {
                    if (Math.abs(offset) <= halfWidth) {
                        rowZ[col] = z;
                    } else {
                        const side = offset > 0 ? left : right;
                        const fraction = (Math.abs(offset) - halfWidth) / side.offset;
                        rowZ[col] = z + side.drop * fraction;
                    }
                }
            }
        }
    }
    return rows;
}


// Compute the height of the 3D view's start and end marker poles (unexaggerated)
function poleHeight3D(topo, exaggeration) {
    return (topo.maxZ - topo.minZ) * 0.15 / exaggeration + topo.spacing;
}


// Create a 3D view projection object from the view arguments ("azimuth", "tilt", "exaggeration", and the optional
// "zoom", "x", "y", "z", "smooth", and "fill"). The view's height is the maximum height for a fill view, the topography's
// height at the fit scale for an unzoomed view of the whole site, and otherwise the maximum height trimmed to the
// landscape.
export function projection(topo, args, width, maxHeight) {
    const azimuth = args.azimuth * Math.PI / 180;
    const tilt = Math.max(5, Math.min(90, args.tilt)) * Math.PI / 180;
    const {exaggeration} = args;
    const view = {
        'cosAz': Math.cos(azimuth),
        'sinAz': Math.sin(azimuth),
        'cosTilt': Math.cos(tilt),
        'sinTilt': Math.sin(tilt),
        exaggeration,
        width
    };

    // Fit the topography's bounding box as viewed from 30 degrees off its axes, with the marker poles above it.
    // The scale doesn't change as the view rotates - views near the diagonals clip the topography's corners
    // slightly.
    const topoWidth = topo.width;
    const topoHeight = topo.height;
    const poleHeight = poleHeight3D(topo, exaggeration);
    const halfZ = (topo.maxZ - topo.minZ) * 0.5 * exaggeration;
    const cos30 = Math.sqrt(3) * 0.5;
    const halfXY = Math.max(topoWidth * cos30 + topoHeight * 0.5, topoWidth * 0.5 + topoHeight * cos30) * 0.5;
    const vSpan = 2 * halfXY * view.sinTilt + (2 * halfZ + poleHeight * exaggeration) * view.cosTilt;
    const scale = Math.min((width - 2 * pad3D) / Math.max(2 * halfXY, 1e-9), (maxHeight - 2 * pad3D) / Math.max(vSpan, 1e-9));
    const zoom = Math.max(1, Math.min(maxZoom, args.zoom ?? 1));
    view.zoom = zoom;
    view.smooth = !!args.smooth;
    view.scale = scale * zoom;

    // The view center point - the default is the topography's center, raised half the marker pole height to fit the
    // poles. A view center x, y without z is on the ground.
    const centerX = args.x ?? null;
    const centerY = args.y ?? null;
    const xc = Math.max(0, Math.min(topoWidth, centerX !== null ? centerX : topoWidth * 0.5));
    const yc = Math.max(0, Math.min(topoHeight, centerY !== null ? centerY : topoHeight * 0.5));
    const centerZ = args.z ?? null;
    let zc;
    if (centerZ !== null) {
        zc = centerZ;
    } else if (centerX !== null || centerY !== null) {
        zc = elevation(topo, xc, yc);
    } else {
        zc = (topo.minZ + topo.maxZ) * 0.5 + poleHeight * 0.5;
    }
    view.xc = xc;
    view.yc = yc;
    view.zc = zc;
    view.fullHeight = maxHeight;

    // A fill view (the 3D explorer) is the maximum height, with the view center at its middle
    if (args.fill) {
        view.height = maxHeight;
        view.cy = maxHeight * 0.5;
        return view;
    }

    // The fit view's height fits the topography, with the view center at the view's middle
    if (zoom === 1 && centerX === null && centerY === null && centerZ === null) {
        const height = Math.min(maxHeight, Math.ceil(vSpan * scale + 2 * pad3D));
        view.height = height;
        view.cy = height * 0.5;
        return view;
    }

    // A zoomed or moved view is the maximum height with the view center at its middle, less the empty bands above and
    // below the landscape (the marker poles above the landscape and padding are kept)
    const upRange = viewUpRange(view, topo);
    const viewScale = view.scale;
    const poleMargin = poleHeight / zoom * exaggeration * view.cosTilt * viewScale + 24;
    let top = Math.max(0, maxHeight * 0.5 - upRange[1] * viewScale - poleMargin);
    let bottom = Math.min(maxHeight, maxHeight * 0.5 - upRange[0] * viewScale + pad3D);
    if (bottom - top < 1) {
        // The landscape is out of view
        top = 0;
        bottom = maxHeight;
    }
    view.height = Math.ceil(bottom - top);
    view.cy = maxHeight * 0.5 - top;
    return view;
}


// The maximum number of topography grid points per side sampled for the 3D view's vertical extent
const maxExtentPoints = 160;


// Compute a view's vertical extent of the topography - [lowest, highest] "up" coordinate (unscaled view units,
// relative to the view center) of the topography's grid points
function viewUpRange(view, topo) {
    const {rows, nRows, nCols, spacing} = topo;
    const step = Math.max(1, Math.ceil(Math.max(nRows, nCols) / maxExtentPoints));
    const {xc, yc, zc} = view;
    const vx = view.sinAz * view.sinTilt;
    const vy = view.cosAz * view.sinTilt;
    const vz = view.exaggeration * view.cosTilt;
    let upMin = null;
    let upMax = null;
    for (let row = 0; row < nRows;) {
        const rowZ = rows[row];
        const upY = ((nRows - 1 - row) * spacing - yc) * vy;
        for (let col = 0; col < nCols;) {
            const up = (col * spacing - xc) * vx + upY + (rowZ[col] - zc) * vz;
            upMin = upMin === null ? up : Math.min(upMin, up);
            upMax = upMax === null ? up : Math.max(upMax, up);
            col = col === nCols - 1 ? nCols : Math.min(nCols - 1, col + step);
        }
        row = row === nRows - 1 ? nRows : Math.min(nRows - 1, row + step);
    }
    return [upMin, upMax];
}


// Find the point ([x, y]) at an elevation under a view pixel - the inverse of project
function unprojectZ(view, pxValue, pyValue, z) {
    const {cosAz, sinAz, scale} = view;
    const across = (pxValue - view.width * 0.5) / scale;
    const up = (view.cy - pyValue) / scale;
    const away = (up - (z - view.zc) * view.exaggeration * view.cosTilt) / view.sinTilt;
    return [view.xc + across * cosAz + away * sinAz, view.yc - across * sinAz + away * cosAz];
}


// Find the ground point ([x, y], within the topography) under a view pixel
export function unproject(view, topo, pxValue, pyValue) {
    // The pixel's view ray is intersected with the ground iteratively - start at the view center elevation
    let z = view.zc;
    let x;
    let y;
    for (let ixIteration = 0; ixIteration < 8; ixIteration++) {
        const point = unprojectZ(view, pxValue, pyValue, z);
        x = Math.max(0, Math.min(topo.width, point[0]));
        y = Math.max(0, Math.min(topo.height, point[1]));
        z = elevation(topo, x, y);
    }
    return [x, y];
}


// Project a world point to the view - returns [px, py, depth] (larger depth is farther away)
export function project(view, x, y, z) {
    const x0 = x - view.xc;
    const y0 = y - view.yc;
    const z0 = (z - view.zc) * view.exaggeration;
    const {cosAz, sinAz} = view;
    const across = x0 * cosAz - y0 * sinAz;
    const away = x0 * sinAz + y0 * cosAz;
    const up = away * view.sinTilt + z0 * view.cosTilt;
    const depth = away * view.cosTilt - z0 * view.sinTilt;
    const {scale} = view;
    return [view.width * 0.5 + across * scale, view.cy - up * scale, depth];
}


// Project a ground point to the view - returns [px, py, depth], or null if the point is outside the topography
function projectGround(view, topo, x, y) {
    const z = elevation(topo, x, y);
    return z !== null ? project(view, x, y, z) : null;
}


// Project world points ([x, y, z] arrays) to a flat pixel coordinate array and the average depth
function projectPoints(view, points) {
    const {xc, yc, zc, exaggeration, cosAz, sinAz, cosTilt, sinTilt, scale, cy} = view;
    const halfWidth = view.width * 0.5;
    const coords = [];
    let depth = 0;
    for (const point of points) {
        const x0 = point[0] - xc;
        const y0 = point[1] - yc;
        const z0 = (point[2] - zc) * exaggeration;
        const away = x0 * sinAz + y0 * cosAz;
        coords.push(halfWidth + (x0 * cosAz - y0 * sinAz) * scale, cy - (away * sinTilt + z0 * cosTilt) * scale);
        depth += (away * cosTilt - z0 * sinTilt);
    }
    return [coords, depth / points.length];
}


// A depth-sorted list of 3D items - each item is an element and its depth (larger is farther away), kept in parallel
// arrays so adding an item allocates nothing
class DepthItems {
    constructor() {
        this.depths = new Float64Array(4096);
        this.elements = [];
        this.count = 0;
    }


    push(depth, element) {
        if (this.count === this.depths.length) {
            const depths = new Float64Array(this.depths.length * 2);
            depths.set(this.depths);
            this.depths = depths;
        }
        this.depths[this.count] = depth;
        this.elements.push(element);
        this.count += 1;
    }


    // Get the elements sorted by depth, farthest first, keeping the order of equal depths - an element array's elements
    // are added in its place. The items are bucketed by depth (a bucket's items are all at least as far as the next
    // bucket's) with a stable counting sort, and only each bucket's few items are sorted - with an insertion sort, which
    // is stable.
    sorted() {
        const {count, depths, elements} = this;
        if (count < 2) {
            return elements.flat();
        }
        let [minDepth] = depths;
        let maxDepth = minDepth;
        for (let ix = 0; ix < count; ix++) {
            minDepth = Math.min(minDepth, depths[ix]);
            maxDepth = Math.max(maxDepth, depths[ix]);
        }
        const bucketCount = Math.max(1, Math.floor(count / 4));
        const bucketScale = (bucketCount - 1) / Math.max(maxDepth - minDepth, 1e-12);
        const itemBuckets = new Int32Array(count);
        const bucketStarts = new Int32Array(bucketCount + 1);
        for (let ix = 0; ix < count; ix++) {
            const ixBucket = Math.min(bucketCount - 1, Math.floor((maxDepth - depths[ix]) * bucketScale));
            itemBuckets[ix] = ixBucket;
            bucketStarts[ixBucket + 1] += 1;
        }
        for (let ixBucket = 0; ixBucket < bucketCount; ixBucket++) {
            bucketStarts[ixBucket + 1] += bucketStarts[ixBucket];
        }
        const order = new Int32Array(count);
        const bucketNext = bucketStarts.slice(0, bucketCount);
        for (let ix = 0; ix < count; ix++) {
            order[bucketNext[itemBuckets[ix]]++] = ix;
        }
        for (let ixBucket = 0; ixBucket < bucketCount; ixBucket++) {
            const ixEnd = bucketStarts[ixBucket + 1];
            for (let ixSort = bucketStarts[ixBucket] + 1; ixSort < ixEnd; ixSort++) {
                const item = order[ixSort];
                const depth = depths[item];
                let ixInsert = ixSort;
                while (ixInsert > bucketStarts[ixBucket] && depths[order[ixInsert - 1]] < depth) {
                    order[ixInsert] = order[ixInsert - 1];
                    ixInsert -= 1;
                }
                order[ixInsert] = item;
            }
        }
        const sorted = [];
        for (let ix = 0; ix < count; ix++) {
            const element = elements[order[ix]];
            if (Array.isArray(element)) {
                for (const subElement of element) {
                    sorted.push(subElement);
                }
            } else {
                sorted.push(element);
            }
        }
        return sorted;
    }
}


// Project a terrain grid row's points at the given columns - the grid's northwest point is at (xOrigin, yTop). Fills
// the pixel coordinates (and for SVG, the formatted "x,y" point strings), the depths, and the points' view outcodes - 1
// left of the view, 2 right of it, plus 4 above it, 8 below it.
function projectGridRow(view, rows, row, cols, xOrigin, yTop, spacing, points, pxs, pys, depths, codes) {
    const {xc, yc, zc, exaggeration, cosAz, sinAz, cosTilt, sinTilt, scale, width, height, cy} = view;
    const halfWidth = width * 0.5;
    const rowZ = rows[row];
    const y0 = yTop - row * spacing - yc;
    const y0SinAz = y0 * sinAz;
    const y0CosAz = y0 * cosAz;
    for (let ixCol = 0; ixCol < cols.length; ixCol++) {
        const col = cols[ixCol];
        const x0 = xOrigin + col * spacing - xc;
        const z0 = (rowZ[col] - zc) * exaggeration;
        const away = x0 * sinAz + y0CosAz;
        const pxValue = halfWidth + (x0 * cosAz - y0SinAz) * scale;
        const pyValue = cy - (away * sinTilt + z0 * cosTilt) * scale;
        if (points !== null) {
            points[ixCol] = `${px(pxValue)},${px(pyValue)}`;
        }
        pxs[ixCol] = pxValue;
        pys[ixCol] = pyValue;
        depths[ixCol] = away * cosTilt - z0 * sinTilt;
        codes[ixCol] = (pxValue < 0 ? 1 : (pxValue > width ? 2 : 0)) + (pyValue < 0 ? 4 : (pyValue > height ? 8 : 0));
    }
}


// Determine if any of a flat array of pixel coordinates' bounding box is within a view
function coordsVisible(view, coords) {
    let [xMin, yMin] = coords;
    let xMax = xMin;
    let yMax = yMin;
    for (let ix = 2; ix < coords.length; ix += 2) {
        xMin = Math.min(xMin, coords[ix]);
        xMax = Math.max(xMax, coords[ix]);
        yMin = Math.min(yMin, coords[ix + 1]);
        yMax = Math.max(yMax, coords[ix + 1]);
    }
    return xMax >= 0 && xMin <= view.width && yMax >= 0 && yMin <= view.height;
}


// Add a 3D shaded quadrilateral item ([depth, element]) from world points, unless it's outside the view
function pushQuad(items, view, point1, point2, point3, point4, color, bias, title, canvas) {
    const [coords, depth] = projectPoints(view, [point1, point2, point3, point4]);
    if (!coordsVisible(view, coords)) {
        return;
    }
    const {exaggeration} = view;
    const fill = rgb(color, quadBrightness(
        [point1[0], point1[1], point1[2] * exaggeration], [point2[0], point2[1], point2[2] * exaggeration],
        [point3[0], point3[1], point3[2] * exaggeration], [point4[0], point4[1], point4[2] * exaggeration]
    ));
    items.push(depth - bias, canvas ? opPolygon(coords, fill, fill, 0.5, title) : svgPolygon(coords, fill, fill, 0.5, title));
}


// Interpolate a Catmull-Rom spline through four values at a fraction (0 to 1) between the middle two
function cubic(z0, z1, z2, z3, fraction) {
    return z1 + 0.5 * fraction * (z2 - z0 + fraction * (2 * z0 - 5 * z1 + 4 * z2 - z3 + fraction * (3 * (z1 - z2) + z3 - z0)));
}


// Divide an elevation grid's cells (within the given rows and columns) into smaller cells - "count" cells per grid cell
// side. The elevations are interpolated with Catmull-Rom splines, clamped to the elevation range of each grid cell's
// corners so the smooth surface never bulges past the grid (or over the road). Returns the smaller cells' grid rows,
// from the first grid row and column.
function smoothRows(rows, rowFirst, rowLast, colFirst, colLast, count) {
    const nRows = rows.length;
    const nCols = rows[0].length;
    const fineCols = (colLast - colFirst) * count;

    // Interpolate the grid rows along their columns - including a grid row on either side, for the splines
    const colRows = [];
    for (let row = rowFirst - 1; row <= rowLast + 1; row++) {
        const rowZ = rows[Math.max(0, Math.min(nRows - 1, row))];
        const values = new Float64Array(fineCols + 1);
        for (let fineCol = 0; fineCol <= fineCols; fineCol++) {
            const col = colFirst + Math.floor(fineCol / count);
            const fraction = (fineCol % count) / count;
            values[fineCol] = fraction === 0 ? rowZ[col] : cubic(
                rowZ[Math.max(0, col - 1)], rowZ[col], rowZ[col + 1], rowZ[Math.min(nCols - 1, col + 2)], fraction
            );
        }
        colRows.push(values);
    }

    // Interpolate between the column-interpolated rows, clamped to each grid cell's corner elevations
    const fineRows = [];
    for (let fineRow = 0; fineRow <= (rowLast - rowFirst) * count; fineRow++) {
        const row = rowFirst + Math.floor(fineRow / count);
        const fraction = (fineRow % count) / count;
        const ixRow = row - rowFirst + 1;
        const rowTop = rows[row];
        const rowBottom = rows[Math.min(nRows - 1, row + 1)];
        const colRowNorth = colRows[ixRow - 1];
        const colRow = colRows[ixRow];
        const colRowSouth = colRows[ixRow + 1];
        const colRowSouth2 = colRows[ixRow + 2];
        const values = new Float64Array(fineCols + 1);
        for (let fineCol = 0; fineCol <= fineCols; fineCol++) {
            let z;
            if (fraction === 0) {
                z = colRow[fineCol];
            } else {
                z = cubic(colRowNorth[fineCol], colRow[fineCol], colRowSouth[fineCol], colRowSouth2[fineCol], fraction);
            }
            const col = colFirst + Math.floor(fineCol / count);
            const col2 = Math.min(nCols - 1, col + 1);
            const zNW = rowTop[col];
            const zNE = rowTop[col2];
            const zSW = rowBottom[col];
            const zSE = rowBottom[col2];
            values[fineCol] = Math.max(Math.min(zNW, zNE, zSW, zSE), Math.min(Math.max(zNW, zNE, zSW, zSE), z));
        }
        fineRows.push(values);
    }
    return fineRows;
}


// Find the grid rows and columns of a view's visible terrain cells - [rowFirst, rowLast, colFirst, colLast], the bounds of
// the cells (within the given grid rows and columns) that aren't culled because all of their corners are outside the same
// side of the view, extended by a cell on each side - or null if no cell is visible. The cull box (viewCullBox) spans the
// topography's whole elevation range, so on steep sites it's much larger than the visible terrain.
export function visibleCells(view, topo, rows, rowFirst, rowLast, colFirst, colLast) {
    const {nRows, spacing} = topo;
    const {xc, yc, zc, exaggeration, cosAz, sinAz, cosTilt, sinTilt, scale, width, height, cy} = view;
    const halfWidth = width * 0.5;
    let visible = null;
    let codesPrev = null;
    for (let row = rowFirst; row <= rowLast; row++) {
        // The row's points' view outcodes (projectGridRow)
        const rowZ = rows[row];
        const y0 = (nRows - 1 - row) * spacing - yc;
        const codes = new Int32Array(colLast - colFirst + 1);
        for (let col = colFirst; col <= colLast; col++) {
            const x0 = col * spacing - xc;
            const pxValue = halfWidth + (x0 * cosAz - y0 * sinAz) * scale;
            const pyValue = cy - ((x0 * sinAz + y0 * cosAz) * sinTilt + (rowZ[col] - zc) * exaggeration * cosTilt) * scale;
            codes[col - colFirst] = (pxValue < 0 ? 1 : (pxValue > width ? 2 : 0)) + (pyValue < 0 ? 4 : (pyValue > height ? 8 : 0));
        }

        // The visible cells between the previous row and this row
        if (codesPrev !== null) {
            for (let ixCol = 0; ixCol < codes.length - 1; ixCol++) {
                if (!(codesPrev[ixCol] & codesPrev[ixCol + 1] & codes[ixCol + 1] & codes[ixCol])) {
                    const cellCol = colFirst + ixCol;
                    visible = visible === null ? [row - 1, row, cellCol, cellCol + 1] :
                        [visible[0], row, Math.min(visible[2], cellCol), Math.max(visible[3], cellCol + 1)];
                }
            }
        }
        codesPrev = codes;
    }
    if (visible === null) {
        return null;
    }
    return [
        Math.max(rowFirst, visible[0] - 1), Math.min(rowLast, visible[1] + 1),
        Math.max(colFirst, visible[2] - 1), Math.min(colLast, visible[3] + 1)
    ];
}


// Compute a zoomed view's cull box - [xMin, xMax, yMin, yMax], the bounds of the view's corners on the ground between
// the lowest and highest elevations of the topography and the road samples (their grade and ground - with no samples,
// the topography's alone). A point within those elevations can only be visible within the box.
function viewCullBox(view, topo, samples) {
    let zLow = topo.minZ;
    let zHigh = topo.maxZ;
    for (const sample of samples) {
        zLow = Math.min(zLow, sample.z, sample.ground);
        zHigh = Math.max(zHigh, sample.z, sample.ground);
    }
    const {width, height} = view;
    let box = null;
    for (const [cornerX, cornerY] of [[0, 0], [width, 0], [width, height], [0, height]]) {
        for (const cornerZ of [zLow, zHigh]) {
            const [x, y] = unprojectZ(view, cornerX, cornerY, cornerZ);
            box = box === null ? [x, x, y, y] : [Math.min(box[0], x), Math.max(box[1], x), Math.min(box[2], y), Math.max(box[3], y)];
        }
    }
    return box;
}


// The contour color and the contour segment buffer
const contourColor = 'rgba(70,50,30,0.45)';
const contourSegments = new Float64Array(8);


// Create a 3D view's drawing of a projection (projection) - "rows" are the finished grade topography rows
// (finishedRows). Returns an object with the drawing's width, height, label, and elements - SVG element markup strings,
// or for a canvas drawing, the drawing operations (canvas.js) - and its terrain's grid step ("step"), its smooth terrain's
// cells per grid cell side ("smooth"), and whether the point limit kept the terrain from being drawn more finely
// ("pointLimited"). "limits" are the terrain's limits (smoothLimits).
export function view3DParts(plan, topo, rows, ixOption, analysis, view, canvas = false, limits = smoothLimits) {
    const polyline = canvas ? opPolyline : svgPolyline;
    const text = canvas ? opText : svgText;
    const {units} = plan;
    const {samples} = analysis;
    const option = plan.options[ixOption];
    const {section} = option;
    const halfWidth = section.width * 0.5;
    const {spacing} = topo;
    const {width, exaggeration} = view;
    const viewHeight = view.height;
    const items = new DepthItems();

    // The view values for the inlined project computation of the cell contours
    const {xc, yc, zc, cosAz, sinAz, cosTilt, sinTilt, cy, scale} = view;
    const viewHalfWidth = width * 0.5;

    // Terrain cells
    const {nRows, nCols} = topo;

    // The visible grid rows and columns - a zoomed view draws only the visible cells, in finer detail. Every visible
    // ground point is on a corner pixel's view ray between the lowest and highest elevations, so the visible area
    // is within the bounds of those eight points.
    let rowFirst = 0;
    let rowLast = nRows - 1;
    let colFirst = 0;
    let colLast = nCols - 1;
    let cullBox = null;
    if (view.zoom > 1) {
        const gridBox = viewCullBox(view, topo, []);
        colFirst = Math.max(0, Math.min(nCols - 2, Math.floor(gridBox[0] / spacing)));
        colLast = Math.min(nCols - 1, Math.max(colFirst + 1, Math.ceil(gridBox[1] / spacing)));
        rowFirst = Math.max(0, Math.min(nRows - 2, Math.floor((nRows - 1) - gridBox[3] / spacing)));
        rowLast = Math.min(nRows - 1, Math.max(rowFirst + 1, Math.ceil((nRows - 1) - gridBox[2] / spacing)));
        cullBox = viewCullBox(view, topo, samples);
    }

    // The grid step - the terrain cells span this many grid cells. With a cell limit per side ("sideCells"), the step
    // keeps the view within it; otherwise, the visible grid cells are found first, and the step keeps them within the
    // point limit, so the grid is drawn whole whenever it fits.
    let step;
    let visible = null;
    let pointLimited = false;
    if (limits.sideCells !== null) {
        step = Math.max(1, Math.ceil(Math.max(rowLast - rowFirst, colLast - colFirst) / limits.sideCells));
    } else {
        visible = visibleCells(view, topo, rows, rowFirst, rowLast, colFirst, colLast);
        if (visible !== null) {
            [rowFirst, rowLast, colFirst, colLast] = visible;
        }
        step = Math.max(1, Math.ceil(Math.sqrt((rowLast - rowFirst + 1) * (colLast - colFirst + 1) / limits.points)));
        pointLimited = step > 1;
    }
    const cellSize = step * spacing;
    const {minZ} = topo;
    const rangeZ = Math.max(topo.maxZ - minZ, 1e-9);
    const interval = contourInterval(plan, topo);

    // The terrain grid - the elevation grid, or for a smooth view drawing every elevation grid cell, the visible grid
    // cells divided into smaller cells interpolated between the grid points
    let drawRows = rows;
    let drawSpacing = spacing;
    let xOrigin = 0;
    let yTop = (nRows - 1) * spacing;
    let smooth = 1;
    if (view.smooth && step === 1) {
        visible ??= visibleCells(view, topo, rows, rowFirst, rowLast, colFirst, colLast);
    } else {
        visible = null;
    }
    if (visible !== null) {
        // The smooth view divides only the visible grid cells, so its point budget is spent on the drawn terrain
        const visiblePoints = (visible[1] - visible[0] + 1) * (visible[3] - visible[2] + 1);
        const cellPx = spacing * scale;
        const smoothQuality = cellPx >= limits.facetPx ? Math.min(limits.count, Math.ceil(cellPx / limits.cellPx)) : 1;
        smooth = Math.min(smoothQuality, Math.floor(Math.sqrt(limits.points / visiblePoints)));
        pointLimited = smooth < smoothQuality;
    }
    if (smooth > 1) {
        [rowFirst, rowLast, colFirst, colLast] = visible;
        drawRows = smoothRows(rows, rowFirst, rowLast, colFirst, colLast, smooth);
        drawSpacing = spacing / smooth;
        xOrigin = colFirst * spacing;
        yTop = (nRows - 1 - rowFirst) * spacing;
        rowLast = (rowLast - rowFirst) * smooth;
        colLast = (colLast - colFirst) * smooth;
        rowFirst = 0;
        colFirst = 0;
    }

    // The minor contours are drawn only where they're far enough apart to read - where a terrain grid cell is at least
    // minorContourPx pixels. A smooth view's cells don't space the contours any farther apart, so its grid cells count
    // (the smooth cells are never under minorContourPx at the SVG drawing's smooth limits).
    const drawMinor = step * spacing * scale >= minorContourPx;

    // The grid columns of the cell corners
    const cols = [colFirst];
    for (let col = colFirst; col < colLast;) {
        col = Math.min(colLast, col + step);
        cols.push(col);
    }

    // Each cell corner is shared by up to four cells, so the corners are projected one grid row at a time
    const colCount = cols.length;
    let pointsTop = canvas ? null : new Array(colCount);
    let pxsTop = new Float64Array(colCount);
    let pysTop = new Float64Array(colCount);
    let depthsTop = new Float64Array(colCount);
    let codesTop = new Int32Array(colCount);
    let pointsBottom = canvas ? null : new Array(colCount);
    let pxsBottom = new Float64Array(colCount);
    let pysBottom = new Float64Array(colCount);
    let depthsBottom = new Float64Array(colCount);
    let codesBottom = new Int32Array(colCount);
    const ixColLast = colCount - 2;

    // A canvas drawing's cell corners are kept in one coordinate array
    const cellCoords = canvas ? new Float64Array(8 * Math.ceil((rowLast - rowFirst) / step) * (colCount - 1)) : null;
    let cellCount = 0;

    let row = rowFirst;
    projectGridRow(view, drawRows, row, cols, xOrigin, yTop, drawSpacing, pointsTop, pxsTop, pysTop, depthsTop, codesTop);
    while (row < rowLast) {
        const row2 = Math.min(rowLast, row + step);
        const y1 = yTop - row * drawSpacing;
        const y2 = yTop - row2 * drawSpacing;
        const cellHeight = y1 - y2;
        const zRow = drawRows[row];
        const zRow2 = drawRows[row2];
        const rowNorth = Math.max(rowFirst, row - step);
        const rowSouth = Math.min(rowLast, row2 + step);
        const zRowNorth = drawRows[rowNorth];
        const zRowSouth = drawRows[rowSouth];
        const dySpan = (rowSouth - rowNorth) * drawSpacing;
        projectGridRow(
            view, drawRows, row2, cols, xOrigin, yTop, drawSpacing, pointsBottom, pxsBottom, pysBottom, depthsBottom, codesBottom
        );
        for (let ixCol = 0; ixCol <= ixColLast; ixCol++) {
            // Skip the cell if its corners' bounding box is outside the view - if all of its corners are outside the same
            // side of the view
            if (codesTop[ixCol] & codesTop[ixCol + 1] & codesBottom[ixCol + 1] & codesBottom[ixCol]) {
                continue;
            }
            const col = cols[ixCol];
            const col2 = cols[ixCol + 1];
            const x1 = xOrigin + col * drawSpacing;
            const x2 = xOrigin + col2 * drawSpacing;
            const zNW = zRow[col];
            const zNE = zRow[col2];
            const zSE = zRow2[col2];
            const zSW = zRow2[col];
            const cellDepth = (depthsTop[ixCol] + depthsTop[ixCol + 1] + depthsBottom[ixCol + 1] + depthsBottom[ixCol]) / 4;

            // Shade the cell by its elevation and slope - the slope spans the neighboring cells, too, so the shading
            // changes gradually from cell to cell
            const cellWidth = x2 - x1;
            const colWest = Math.max(colFirst, col - step);
            const colEast = Math.min(colLast, col2 + step);
            const dzdx = ((zRow[colEast] + zRow2[colEast]) - (zRow[colWest] + zRow2[colWest])) * 0.5 /
                ((colEast - colWest) * drawSpacing) * exaggeration;
            const dzdy = ((zRowNorth[col] + zRowNorth[col2]) - (zRowSouth[col] + zRowSouth[col2])) * 0.5 / dySpan * exaggeration;
            const zAvg = (zNW + zNE + zSE + zSW) * 0.25;
            const fill = terrainFill((zAvg - minZ) / rangeZ, -dzdx, -dzdy);

            // Cell contours - a path of the minor contours and a path of the index contours (for a canvas drawing, arrays
            // of the segments' coordinates)
            let minorPath = '';
            let indexPath = '';
            let minorSegments = null;
            let indexSegments = null;
            let level = Math.ceil(Math.min(zNW, zNE, zSE, zSW) / interval) * interval;
            const zMax = Math.max(zNW, zNE, zSE, zSW);
            while (level <= zMax) {
                const indexLevel = level / interval / 5;
                const isIndex = Math.abs(indexLevel - Math.floor(indexLevel + 0.5)) < 1e-6;
                if (isIndex || drawMinor) {
                    // The segments' end points are projected with the project computation, inlined - the level's
                    // elevation term is the same for every end point
                    const zUp = (level - zc) * exaggeration * cosTilt;
                    const segmentCount = cellContours(zNW, zNE, zSE, zSW, level, contourSegments);
                    for (let ixSegment = 0; ixSegment < segmentCount; ixSegment++) {
                        const ixValue = ixSegment * 4;
                        let x0 = x1 + contourSegments[ixValue] * cellWidth - xc;
                        let y0 = y1 - contourSegments[ixValue + 1] * cellHeight - yc;
                        const sx1 = viewHalfWidth + (x0 * cosAz - y0 * sinAz) * scale;
                        const sy1 = cy - ((x0 * sinAz + y0 * cosAz) * sinTilt + zUp) * scale;
                        x0 = x1 + contourSegments[ixValue + 2] * cellWidth - xc;
                        y0 = y1 - contourSegments[ixValue + 3] * cellHeight - yc;
                        const sx2 = viewHalfWidth + (x0 * cosAz - y0 * sinAz) * scale;
                        const sy2 = cy - ((x0 * sinAz + y0 * cosAz) * sinTilt + zUp) * scale;
                        if (canvas) {
                            if (isIndex) {
                                (indexSegments ??= []).push(sx1, sy1, sx2, sy2);
                            } else {
                                (minorSegments ??= []).push(sx1, sy1, sx2, sy2);
                            }
                        } else {
                            const segment = `M${px(sx1)} ${px(sy1)}L${px(sx2)} ${px(sy2)}`;
                            if (isIndex) {
                                indexPath += segment;
                            } else {
                                minorPath += segment;
                            }
                        }
                    }
                }
                level += interval;
            }
            if (canvas) {
                const offset = cellCount * 8;
                cellCoords[offset] = pxsTop[ixCol];
                cellCoords[offset + 1] = pysTop[ixCol];
                cellCoords[offset + 2] = pxsTop[ixCol + 1];
                cellCoords[offset + 3] = pysTop[ixCol + 1];
                cellCoords[offset + 4] = pxsBottom[ixCol + 1];
                cellCoords[offset + 5] = pysBottom[ixCol + 1];
                cellCoords[offset + 6] = pxsBottom[ixCol];
                cellCoords[offset + 7] = pysBottom[ixCol];
                cellCount += 1;
                items.push(cellDepth, opTerrainCell(cellCoords, offset, fill, minorSegments, indexSegments));
                continue;
            }
            let cell = `<polygon points="${pointsTop[ixCol]} ${pointsTop[ixCol + 1]} ${pointsBottom[ixCol + 1]} ${pointsBottom[ixCol]}" ` +
                `fill="${fill}" stroke="${fill}" stroke-width="0.6"/>`;
            if (minorPath !== '') {
                cell += `<path d="${minorPath}" fill="none" stroke="${contourColor}" stroke-width="0.5" stroke-linecap="round"/>`;
            }
            if (indexPath !== '') {
                cell += `<path d="${indexPath}" fill="none" stroke="${contourColor}" stroke-width="1.2" stroke-linecap="round"/>`;
            }
            items.push(cellDepth, cell);
        }
        row = row2;
        [pointsTop, pointsBottom] = [pointsBottom, pointsTop];
        [pxsTop, pxsBottom] = [pxsBottom, pxsTop];
        [pysTop, pysBottom] = [pysBottom, pysTop];
        [depthsTop, depthsBottom] = [depthsBottom, depthsTop];
        [codesTop, codesBottom] = [codesBottom, codesTop];
    }

    // Features
    for (const feature of topo.features) {
        const {type} = feature;
        let {points} = feature;
        if (type !== 'stream') {
            points = [...points, points[0]];
        }
        const stroke = type === 'stream' ? '#2a6fdb' : (type === 'rock' ? '#555555' : 'rgba(208,49,45,0.55)');
        for (let ixPoint = 1; ixPoint < points.length; ixPoint++) {
            const prev = points[ixPoint - 1];
            const point = points[ixPoint];
            const x1 = prev.x;
            const y1 = prev.y;
            const x2 = point.x;
            const y2 = point.y;

            // Skip the segment if it's outside the view's ground area - with a margin, so its steps are, too
            if (cullBox !== null && outsideBox(cullBox, Math.min(x1, x2) - cellSize, Math.max(x1, x2) + cellSize,
                Math.min(y1, y2) - cellSize, Math.max(y1, y2) + cellSize)) {
                continue;
            }

            const count = Math.max(1, Math.ceil(Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) / (cellSize * 0.5)));
            let pointB = null;
            let ixPointB = -1;
            for (let ixStep = 0; ixStep < count; ixStep++) {
                const xa = x1 + (x2 - x1) * ixStep / count;
                const ya = y1 + (y2 - y1) * ixStep / count;
                const xb = x1 + (x2 - x1) * (ixStep + 1) / count;
                const yb = y1 + (y2 - y1) * (ixStep + 1) / count;
                if (cullBox === null || !outsideBox(cullBox, Math.min(xa, xb), Math.max(xa, xb), Math.min(ya, yb), Math.max(ya, yb))) {
                    // The step's projected end points - its start is the previous step's end, if that was projected
                    const pointA = ixPointB === ixStep ? pointB : projectGround(view, topo, xa, ya);
                    pointB = projectGround(view, topo, xb, yb);
                    ixPointB = ixStep + 1;
                    if (pointA !== null && pointB !== null) {
                        const [pxa, pya] = pointA;
                        const [pxb, pyb] = pointB;
                        if (Math.max(pxa, pxb) >= 0 && Math.min(pxa, pxb) <= width && Math.max(pya, pyb) >= 0 &&
                            Math.min(pya, pyb) <= viewHeight) {
                            items.push((pointA[2] + pointB[2]) / 2 - cellSize * 0.5, polyline([pxa, pya, pxb, pyb], stroke,
                                type === 'stream' ? 2.5 : 1, type === 'stream' ? null : '4 3'));
                        }
                    }
                }
            }
        }
    }

    // Road
    const bias = cellSize;
    const surfaceColor = colors[section.surface ?? 'gravel'];
    const deckDepth = unitLength(plan, 1, 3);
    let prevPoints = null;
    for (let ixSample = 0; ixSample < samples.length; ixSample++) {
        const sample = samples[ixSample];
        const points = samplePoints(sample, halfWidth);
        if (ixSample > 0) {
            const prev = samples[ixSample - 1];

            // Skip the road interval if its footprint is outside the view's ground area
            if (cullBox !== null) {
                const reach = halfWidth + Math.max(prev.left.offset, prev.right.offset, sample.left.offset, sample.right.offset);
                if (outsideBox(cullBox, Math.min(prev.x, sample.x) - reach, Math.max(prev.x, sample.x) + reach,
                    Math.min(prev.y, sample.y) - reach, Math.max(prev.y, sample.y) + reach)) {
                    prevPoints = points;
                    continue;
                }
            }

            const bridge = prev.bridge && sample.bridge;
            const existing = prev.existing && sample.existing;
            const title = `${formatStation(sample.station, units)}${existing ? ' (existing road)' : ''}: grade ${fixed(sample.z, 1)}, ` +
                `ground ${fixed(sample.ground, 1)}, ${sample.ground >= sample.z ? 'cut' : 'fill'} ` +
                `${fixed(Math.abs(sample.ground - sample.z), 1)}`;

            // Road surface (or bridge deck)
            pushQuad(items, view, prevPoints[1], points[1], points[2], prevPoints[2],
                bridge ? colors.bridge : (existing ? colors.existing : surfaceColor), bias, title, canvas);
            if (bridge) {
                for (const ixEdge of [1, 2]) {
                    const edgePrev = prevPoints[ixEdge];
                    const edge = points[ixEdge];
                    pushQuad(items, view, edgePrev, edge, [edge[0], edge[1], edge[2] - deckDepth],
                        [edgePrev[0], edgePrev[1], edgePrev[2] - deckDepth], colors.bridge, bias * 1.1, null, canvas);
                }
                prevPoints = points;
                continue;
            }

            // Side slopes and walls
            for (const [sideName, ixDaylight, ixEdge] of [['left', 0, 1], ['right', 3, 2]]) {
                const side = sample[sideName];
                const sidePrev = prev[sideName];
                const {kind} = side;
                const kindPrev = sidePrev.kind;
                const edgePrev = prevPoints[ixEdge];
                const edge = points[ixEdge];
                if (kind === 'wall' || kindPrev === 'wall') {
                    pushQuad(items, view, edgePrev, edge, [edge[0], edge[1], edge[2] + side.drop],
                        [edgePrev[0], edgePrev[1], edgePrev[2] + sidePrev.drop], colors.wall, bias * 0.9, null, canvas);
                } else if (kind !== 'none' || kindPrev !== 'none') {
                    const slopeKind = kind !== 'none' ? kind : kindPrev;
                    pushQuad(
                        items, view, edgePrev, prevPoints[ixDaylight], points[ixDaylight], edge, colors[slopeKind], bias * 0.9, null, canvas
                    );
                }
            }
        }
        prevPoints = points;
    }

    // A road narrower than the minimum drawn width is also drawn as a highlighted centerline (a white halo under a
    // colored line) - each segment is depth-sorted with the terrain, so hills still hide the road behind them. The
    // colored lines are biased several road sample intervals nearer than the halos, so a neighboring segment's halo
    // never covers them, however small the terrain cells.
    const sampleInterval = samples[1].station - samples[0].station;
    const lineBias = bias * 1.2 + Math.max(bias * 0.3, 4 * sampleInterval);
    const labelBias = lineBias + bias * 0.5;
    if (2 * halfWidth * scale < minRoadPx) {
        for (let ixSample = 1; ixSample < samples.length; ixSample++) {
            const sample = samples[ixSample];
            const prev = samples[ixSample - 1];
            const [coords, depth] = projectPoints(view, [[prev.x, prev.y, prev.z], [sample.x, sample.y, sample.z]]);
            if (coordsVisible(view, coords)) {
                items.push(depth - bias * 1.2, polyline(coords, 'white', 6));
                items.push(depth - lineBias, polyline(coords, roadColor, 3));
            }
        }
    }

    // Culverts
    for (const structure of option.structures ?? []) {
        if (structure.type === 'culvert') {
            const sample = sampleAt(samples, structure.station);
            const points = samplePoints(sample, halfWidth);
            const [coords, depth] = projectPoints(view, [points[0], points[3]]);
            items.push(depth - bias * 1.2, polyline(coords, '#2a6fdb', 4));
        }
    }

    // Station labels, about a fifth of the view's width apart - depth-sorted with the terrain
    const {length} = analysis;
    const labelStep = niceStep(width / scale, 5);
    for (let stationValue = labelStep; stationValue < length - labelStep * 0.25; stationValue += labelStep) {
        const sample = sampleAt(samples, stationValue);
        const [pxValue, pyValue, depth] = project(view, sample.x, sample.y, sample.z);
        if (pxValue >= 0 && pxValue <= width && pyValue >= 0 && pyValue <= viewHeight) {
            const labelText = text(formatStation(stationValue, units), pxValue + 6, pyValue - 9, 11, 'start', '#222', false);
            items.push(depth - labelBias, canvas ? [opCircle(pxValue, pyValue, 3, '#222', 'white'), labelText] :
                `<circle cx="${px(pxValue)}" cy="${px(pyValue)}" r="3" fill="#222" stroke="white"/>${labelText}`);
        }
    }

    // Sort the items by depth, farthest first
    const elements = items.sorted();

    // Start and end markers (always on top) - the poles are the same height on screen at any zoom
    const poleHeight = poleHeight3D(topo, exaggeration) / view.zoom;
    for (const [point, defaultLabel, color] of [[plan.start, 'Start', '#1a8f3c'], [plan.end, 'End', '#c0392b']]) {
        const {x, y} = point;
        let z = elevation(topo, x, y);
        z = z === null ? minZ : z;
        const base = project(view, x, y, z);
        const top = project(view, x, y, z + poleHeight);
        elements.push(polyline([base[0], base[1], top[0], top[1]], color, 2.5));
        const label = point.label ?? defaultLabel;
        elements.push(text(label, labelX(label, 13, top[0], width), top[1] - 9, 13, 'middle', color, true));
    }

    // Compass
    if (canvas) {
        elements.push(...compassOps(view, width - 36, 36));
    } else {
        elements.push(compass(view, width - 36, 36));
    }

    const label = `3D view of the ${option.name} road plan option`;
    return {width, 'height': viewHeight, label, elements, smooth, step, pointLimited};
}


// Create a 3D view SVG element markup
export function view3D(plan, topo, rows, ixOption, analysis, view) {
    const parts = view3DParts(plan, topo, rows, ixOption, analysis, view);
    return `${svgOpen(parts.width, parts.height, parts.label)}${parts.elements.join('')}</svg>`;
}


// Compute a compass's north pointer polygon and label position for a view
function compassGeometry(view, cx, cy) {
    const north = project(view, view.xc, view.yc + 1, view.zc);
    const center = project(view, view.xc, view.yc, view.zc);
    const dx = north[0] - center[0];
    const dy = north[1] - center[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / length;
    const uy = dy / length;
    return [[cx + ux * 18, cy + uy * 18, cx - uy * 6, cy + ux * 6, cx + uy * 6, cy - ux * 6], cx - ux * 12, cy - uy * 12];
}


// Create a compass's drawing operations showing north for a view
function compassOps(view, cx, cy) {
    const [pointer, labelXValue, labelYValue] = compassGeometry(view, cx, cy);
    return [
        opCircle(cx, cy, 22, 'white', '#888', null, 0.8),
        opPolygon(pointer, '#c0392b', '#c0392b', 1),
        opText('N', labelXValue, labelYValue, 11, 'middle', '#333', true)
    ];
}


// Create a compass element showing north for a view
function compass(view, cx, cy) {
    const [pointer, labelXValue, labelYValue] = compassGeometry(view, cx, cy);
    return `<circle cx="${cx}" cy="${cy}" r="22" fill="white" fill-opacity="0.8" stroke="#888"/>` +
        `${svgPolygon(pointer, '#c0392b', '#c0392b', 1)}${svgText('N', labelXValue, labelYValue, 11, 'middle', '#333', true)}`;
}


//
// Report 3D views
//


// The report 3D views' vertical exaggeration
const reportExaggeration = 1.5;


// The road width, in pixels, that the report's road segment views aim to draw
const reportRoadPx = 6;


// The maximum number of report road segment views
const maxSegmentViews = 6;


// The number of road points checked for visibility in each report view
const visibilityPoints = 32;


// The maximum turn of a report segment view from the overview's direction, in degrees
const maxViewTurn = 40;


// Choose the report's 3D views - an overview of the whole site, then, if the road is too narrow to see in the
// overview or the terrain hides parts of it, views of equal road segments from the start to the end. Returns an
// array of report view objects ("args", "view", "station", "endStation", "hidden", and "leftToRight").
export function reportViews(topo, rows, analysis, halfWidth, width, smooth) {
    const maxHeight = Math.round(width * 0.75);
    const {samples, length} = analysis;
    const finishedTopo = {...topo, rows};

    // The overview - the whole site, fit to its terrain
    let viewpoint = chooseViewpoint(topo, finishedTopo, samples, 0, length, [55, 70, 90], null);
    const terrainPoints = [];
    const {nRows, nCols, spacing} = topo;
    const step = Math.max(1, Math.ceil(Math.max(nRows, nCols) / 40));
    const colSteps = gridSteps(nCols, step);
    for (const row of gridSteps(nRows, step)) {
        for (const col of colSteps) {
            terrainPoints.push([col * spacing, (nRows - 1 - row) * spacing, rows[row][col]]);
        }
    }
    const overviewArgs = fitViewpoint(topo, terrainPoints, viewpoint, width, maxHeight);
    overviewArgs.smooth = smooth;
    const views = [reportView(topo, samples, 0, length, viewpoint, overviewArgs, width, maxHeight)];
    const overview = views[0].view;
    if (2 * halfWidth * overview.scale >= reportRoadPx && viewpoint.hidden === 0) {
        return views;
    }

    // The road segment views - each about one and a half view widths of road at the target road width
    const baseAzimuth = viewpoint.azimuth;
    const segmentLength = 1.5 * width * 2 * halfWidth / reportRoadPx;
    const count = Math.max(1, Math.min(maxSegmentViews, Math.ceil(length / segmentLength)));
    for (let ixSegment = 0; ixSegment < count; ixSegment++) {
        const stationValue = length * ixSegment / count;
        const endStation = length * (ixSegment + 1) / count;
        viewpoint = chooseViewpoint(topo, finishedTopo, samples, stationValue, endStation, [40, 55, 70, 90], baseAzimuth);
        const footprint = [];
        for (const sample of segmentSamples(samples, stationValue, endStation)) {
            footprint.push(...samplePoints(sample, halfWidth));
        }
        const viewArgs = fitViewpoint(topo, footprint, viewpoint, width, maxHeight);
        viewArgs.smooth = smooth;
        views.push(reportView(topo, samples, stationValue, endStation, viewpoint, viewArgs, width, maxHeight));
    }
    return views;
}


// Get a grid dimension's indexes at a step, always including the last index
function gridSteps(count, step) {
    const indexes = [];
    for (let index = 0; index < count - 1; index += step) {
        indexes.push(index);
    }
    indexes.push(count - 1);
    return indexes;
}


// Create a report view object - the road runs left to right if its segment's end is right of its start
function reportView(topo, samples, stationValue, endStation, viewpoint, viewArgs, width, maxHeight) {
    const view = projection(topo, viewArgs, width, maxHeight);
    const first = sampleAt(samples, stationValue);
    const last = sampleAt(samples, endStation);
    const firstPoint = project(view, first.x, first.y, first.z);
    const lastPoint = project(view, last.x, last.y, last.z);
    return {
        'args': viewArgs,
        view,
        'station': stationValue,
        endStation,
        'hidden': viewpoint.hidden,
        'leftToRight': lastPoint[0] >= firstPoint[0]
    };
}


// Get the road samples within a station range
function segmentSamples(samples, stationValue, endStation) {
    return samples.filter((sample) => sample.station >= stationValue - 1e-6 && sample.station <= endStation + 1e-6);
}


// Compute the signed difference of two angles, in degrees (-180 to 180)
function angleDifference(angle, otherAngle) {
    return (angle - otherAngle + 540) % 360 - 180;
}


// Choose a road segment's viewpoint - returns an object with the "azimuth" and "tilt" (degrees) and the number of hidden
// road points ("hidden"). The viewpoint looks across the segment's direction of travel. Without a base azimuth (the
// overview), it looks from the side looking upslope (or, on flat ground, the side with the start on the left).
// Otherwise, it looks from the base azimuth's side, turned at most maxViewTurn degrees from the base azimuth - or
// along the base azimuth itself. The lowest tilt that shows all of the road points wins - otherwise, the viewpoint
// hiding the fewest.
function chooseViewpoint(topo, finishedTopo, samples, stationValue, endStation, tilts, baseAzimuth) {
    const segment = segmentSamples(samples, stationValue, endStation);
    const [first] = segment;
    const last = segment[segment.length - 1];
    let travelX = last.x - first.x;
    let travelY = last.y - first.y;
    if (Math.sqrt(travelX * travelX + travelY * travelY) < topo.spacing * 1e-3) {
        travelX = first.dx;
        travelY = first.dy;
    }
    const leftAzimuth = Math.atan2(travelX, travelY) * 180 / Math.PI - 90;

    // The road points to check, and the average uphill direction
    const points = [];
    let uphillX = 0;
    let uphillY = 0;
    const pointStep = Math.max(1, Math.floor(segment.length / visibilityPoints));
    for (let ixSample = 0; ixSample < segment.length; ixSample++) {
        if (ixSample % pointStep === 0 || ixSample === segment.length - 1) {
            const {x, y, z} = segment[ixSample];
            points.push([x, y, z]);
            const grad = gradient(topo, x, y);
            uphillX += grad[0];
            uphillY += grad[1];
        }
    }

    // The candidate azimuths, in order of preference
    let azimuths;
    if (baseAzimuth === null) {
        // Looking to the left of travel puts the start on the left - prefer the side looking upslope
        const leftRadians = leftAzimuth * Math.PI / 180;
        const upslope = (Math.sin(leftRadians) * uphillX + Math.cos(leftRadians) * uphillY) / points.length;
        azimuths = upslope >= -0.02 ? [leftAzimuth, leftAzimuth + 180] : [leftAzimuth + 180, leftAzimuth];
    } else {
        // The crosswise direction on the base azimuth's side, turned at most maxViewTurn degrees from it
        let turn = angleDifference(leftAzimuth, baseAzimuth);
        turn = Math.abs(turn) > 90 ? angleDifference(leftAzimuth + 180, baseAzimuth) : turn;
        turn = Math.max(-maxViewTurn, Math.min(maxViewTurn, turn));
        azimuths = [baseAzimuth + turn, baseAzimuth];
    }

    let best = null;
    for (const tilt of tilts) {
        for (const azimuthCandidate of azimuths) {
            const azimuth = round((azimuthCandidate + 720) % 360, 1);
            const hidden = hiddenPoints(finishedTopo, points, azimuth, tilt, reportExaggeration);
            if (best === null || hidden < best.hidden) {
                best = {azimuth, tilt, hidden};
            }
            if (hidden === 0) {
                break;
            }
        }
        if (best.hidden === 0) {
            break;
        }
    }
    return best;
}


// Count the road points ([x, y, z] arrays) hidden by the terrain from a viewpoint - each point's view ray is followed
// toward the viewer until it rises above the terrain or leaves the topography
function hiddenPoints(topo, points, azimuth, tilt, exaggeration) {
    if (tilt >= 89.9) {
        return 0;
    }
    const radians = azimuth * Math.PI / 180;
    const towardX = -Math.sin(radians);
    const towardY = -Math.cos(radians);
    const rise = Math.tan(tilt * Math.PI / 180) / exaggeration;
    const {spacing, maxZ} = topo;
    const tolerance = spacing * 0.02;
    let hidden = 0;
    for (const [x, y, z] of points) {
        let distance = spacing;
        while (z + distance * rise <= maxZ) {
            const ground = elevation(topo, x + towardX * distance, y + towardY * distance);
            if (ground === null) {
                break;
            }
            if (ground > z + distance * rise + tolerance) {
                hidden += 1;
                break;
            }
            distance += spacing;
        }
    }
    return hidden;
}


// Fit points ([x, y, z] arrays) in a report view - returns the view arguments for a viewpoint that center the points in
// the view, zoomed so they fill most of it
function fitViewpoint(topo, points, viewpoint, width, maxHeight) {
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (const point of points) {
        sumX += point[0];
        sumY += point[1];
        sumZ += point[2];
    }
    const count = points.length;
    const viewArgs = {
        'azimuth': viewpoint.azimuth,
        'tilt': viewpoint.tilt,
        'exaggeration': reportExaggeration,
        'zoom': 1,
        'x': sumX / count,
        'y': sumY / count,
        'z': sumZ / count
    };

    // The points' pixel extent in the unzoomed view
    const view = projection(topo, viewArgs, width, maxHeight);
    const [coords] = projectPoints(view, points);
    let [pxMin, pyMin] = coords;
    let pxMax = pxMin;
    let pyMax = pyMin;
    for (let ix = 2; ix < coords.length; ix += 2) {
        pxMin = Math.min(pxMin, coords[ix]);
        pxMax = Math.max(pxMax, coords[ix]);
        pyMin = Math.min(pyMin, coords[ix + 1]);
        pyMax = Math.max(pyMax, coords[ix + 1]);
    }

    // Move the view center to the points' center - right along the view's x axis, and forward along the ground
    const {scale, cosAz, sinAz} = view;
    const right = ((pxMin + pxMax) * 0.5 - width * 0.5) / scale;
    const forward = (view.cy - (pyMin + pyMax) * 0.5) / scale / view.sinTilt;
    viewArgs.x = round(viewArgs.x + right * cosAz + forward * sinAz, 1);
    viewArgs.y = round(viewArgs.y - right * sinAz + forward * cosAz, 1);
    viewArgs.z = round(viewArgs.z, 1);
    const zoom = Math.min(0.85 * width / Math.max(pxMax - pxMin, 1e-9), 0.8 * maxHeight / Math.max(pyMax - pyMin, 1e-9));
    viewArgs.zoom = round(Math.max(1, Math.min(maxZoom, zoom)), 3);
    return viewArgs;
}
