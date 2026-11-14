// roads.js - a plan's existing roads and streams - its line features, indexed to find the line nearest a point


// Create an index of line features' segments - "features" are the topography's features, "type" is the lines' feature
// type ("road" or "stream"), and "cellSize" is the size of the index's cells (about the distance of its searches)
export function lineIndex(features, type, cellSize) {
    const segments = [];
    const cells = new Map();
    for (const feature of features) {
        if (feature.type === type) {
            const name = feature.name ?? null;
            for (let ix = 1; ix < feature.points.length; ix++) {
                const {'x': x1, 'y': y1} = feature.points[ix - 1];
                const {'x': x2, 'y': y2} = feature.points[ix];
                const segment = {name, x1, y1, x2, y2};
                segments.push(segment);
                const colEnd = Math.floor(Math.max(x1, x2) / cellSize);
                const rowEnd = Math.floor(Math.max(y1, y2) / cellSize);
                for (let row = Math.floor(Math.min(y1, y2) / cellSize); row <= rowEnd; row++) {
                    for (let col = Math.floor(Math.min(x1, x2) / cellSize); col <= colEnd; col++) {
                        const key = cellKey(col, row);
                        if (!cells.has(key)) {
                            cells.set(key, []);
                        }
                        cells.get(key).push(segment);
                    }
                }
            }
        }
    }
    return {segments, cells, cellSize};
}


// An index cell's key
function cellKey(col, row) {
    return `${col},${row}`;
}


// Find the point of a segment nearest a point - returns the distance and the point's x and y coordinates
export function segmentNearest(segment, x, y) {
    const {x1, y1, x2, y2} = segment;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared)) : 0;
    const nearX = x1 + fraction * dx;
    const nearY = y1 + fraction * dy;
    return [Math.hypot(x - nearX, y - nearY), nearX, nearY];
}


// Find the indexed line nearest a point, within a distance (the whole index, if it's null) - returns the line's
// "name" (or null), the "distance" to it, and its nearest point's "x" and "y" coordinates, or null if there is none
export function nearestLine(index, x, y, maxDistance = null) {
    let candidates = index.segments;
    if (maxDistance !== null) {
        candidates = [];
        const {cells, cellSize} = index;
        const colEnd = Math.floor((x + maxDistance) / cellSize);
        const rowEnd = Math.floor((y + maxDistance) / cellSize);
        for (let row = Math.floor((y - maxDistance) / cellSize); row <= rowEnd; row++) {
            for (let col = Math.floor((x - maxDistance) / cellSize); col <= colEnd; col++) {
                candidates.push(...cells.get(cellKey(col, row)) ?? []);
            }
        }
    }
    let nearest = null;
    for (const segment of candidates) {
        const [distance, nearX, nearY] = segmentNearest(segment, x, y);
        if ((maxDistance === null || distance <= maxDistance) && (nearest === null || distance < nearest.distance)) {
            nearest = {'name': segment.name, distance, 'x': nearX, 'y': nearY};
        }
    }
    return nearest;
}


// Describe the road and the stream nearest a point, for a report - "" if the features have neither
export function nearestText(features, units, x, y) {
    let text = '';
    for (const type of ['road', 'stream']) {
        const nearest = nearestLine(lineIndex(features, type, Infinity), x, y);
        if (nearest !== null) {
            text += `, nearest ${type} ${nearest.name !== null ? `"${nearest.name}" ` : ''}${Math.round(nearest.distance)} ${units} away`;
        }
    }
    return text;
}
