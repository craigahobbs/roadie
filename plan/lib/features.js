// features.js - a road site's topographic features - its streams, its existing roads and trails, and its exclusion
// areas, in the plan's coordinates

import {layoutPoint, round} from './terrain.js';


// The distance, in meters, that a line's points are simplified within, and that lines' ends are joined within
const simplifyDistance = 0.5;
const joinDistance = 0.5;


// Create a site's line features - "type" is the features' type ("stream" or "road") and "lines" are the line objects
// (usgs.js - an optional "name" and "points", [longitude, latitude] arrays). The lines are clipped to the layout's
// grid and simplified, and the lines of a name that meet end to end are joined - a stream's or a road's reaches
// are one feature.
export function lineFeatures(layout, type, lines) {
    const width = (layout.nCols - 1) * layout.spacing;
    const height = (layout.nRows - 1) * layout.spacing;
    const tolerance = simplifyDistance / layout.scale;
    const joinTolerance = joinDistance / layout.scale;

    // The lines' parts within the grid, in plan coordinates
    const parts = [];
    for (const line of lines) {
        const points = line.points.map(([longitude, latitude]) => layoutPoint(layout, latitude, longitude));
        for (const part of clipLine(points, width, height)) {
            const simple = simplifyLine(part, tolerance);
            if (simple.length > 1) {
                parts.push({'name': line.name ?? null, 'points': simple});
            }
        }
    }

    // Join the parts of a name that meet - a part's end at another's start
    const joined = [];
    for (const part of parts) {
        joined.push(part);
        for (let merged = true; merged;) {
            merged = false;
            for (let ix = 0; ix < joined.length && !merged; ix++) {
                for (let ix2 = 0; ix2 < joined.length && !merged; ix2++) {
                    const first = joined[ix];
                    const second = joined[ix2];
                    if (ix !== ix2 && first.name === second.name && pointsMeet(first.points.at(-1), second.points[0], joinTolerance)) {
                        first.points = [...first.points, ...second.points.slice(1)];
                        joined.splice(ix2, 1);
                        merged = true;
                    }
                }
            }
        }
    }

    return joined.map(({name, points}) => ({
        type,
        ...(name !== null ? {name} : {}),
        'points': points.map(([x, y]) => ({'x': round(x, 1), 'y': round(y, 1)}))
    }));
}


// Determine if two points are within a distance of each other
function pointsMeet(point1, point2, distance) {
    return Math.hypot(point1[0] - point2[0], point1[1] - point2[1]) <= distance;
}


// Clip a line ([x, y] point arrays) to the box from the origin to (width, height) - returns its parts within the box
function clipLine(points, width, height) {
    const parts = [];
    let part = null;
    for (let ix = 1; ix < points.length; ix++) {
        const [x1, y1] = points[ix - 1];
        const [x2, y2] = points[ix];

        // The segment's part within the box - from "start" to "end", as fractions of the segment (Liang-Barsky)
        const dx = x2 - x1;
        const dy = y2 - y1;
        let start = 0;
        let end = 1;
        for (const [delta, distance] of [[-dx, x1], [dx, width - x1], [-dy, y1], [dy, height - y1]]) {
            if (delta === 0) {
                if (distance < 0) {
                    start = 2;
                }
            } else if (delta < 0) {
                start = Math.max(start, distance / delta);
            } else {
                end = Math.min(end, distance / delta);
            }
        }
        if (start > end) {
            part = null;
            continue;
        }
        const point1 = [x1 + start * dx, y1 + start * dy];
        const point2 = [x1 + end * dx, y1 + end * dy];
        if (part === null || start > 0) {
            part = [point1];
            parts.push(part);
        }
        part.push(point2);
        if (end < 1) {
            part = null;
        }
    }
    return parts;
}


// Simplify a line - remove its points that are within a distance of the line between the points kept
// (Douglas-Peucker), and its repeated points
function simplifyLine(points, tolerance) {
    const keep = new Array(points.length).fill(false);
    keep[0] = true;
    keep[points.length - 1] = true;
    const ranges = [[0, points.length - 1]];
    while (ranges.length > 0) {
        const [first, last] = ranges.pop();
        const [x1, y1] = points[first];
        const [x2, y2] = points[last];
        const length = Math.hypot(x2 - x1, y2 - y1);
        let farthest = -1;
        let farthestDistance = tolerance;
        for (let ix = first + 1; ix < last; ix++) {
            const [x, y] = points[ix];
            const distance = length > 0 ? Math.abs((x2 - x1) * (y1 - y) - (x1 - x) * (y2 - y1)) / length : Math.hypot(x - x1, y - y1);
            if (distance > farthestDistance) {
                farthest = ix;
                farthestDistance = distance;
            }
        }
        if (farthest !== -1) {
            keep[farthest] = true;
            ranges.push([first, farthest], [farthest, last]);
        }
    }
    const simple = points.filter((point, ix) => keep[ix]);
    return simple.length === 2 && pointsMeet(simple[0], simple[1], tolerance) ? [] : simple;
}


// Create a site's exclusion area features - an area without a name is named for its place in the site's areas
export function exclusionFeatures(layout, site) {
    return (site.exclusions ?? []).map((area, ixArea) => ({
        'type': 'exclusion',
        'name': area.name ?? `Exclusion ${ixArea + 1}`,
        'points': area.points.map(({latitude, longitude}) => {
            const [x, y] = layoutPoint(layout, latitude, longitude);
            return {'x': round(x, 1), 'y': round(y, 1)};
        })
    }));
}


// The distance, in meters, that a stream is moved within to its valley's bottom, and the height, in meters, of the
// valley's bottom - a stream is moved to the nearest ground within that height of the lowest
const snapDistance = 30;
const snapHeight = 0.15;


// Move stream features to their valleys' bottoms. The USGS streams were mapped at a coarser scale than the terrain, so
// a stream's line is often tens of feet from the bottom of its valley - where a road's culvert belongs. Each point
// along a stream is moved, across the stream, to the lowest ground within the snap distance - the nearest of the
// ground that low. A point isn't moved if that ground is at the snap distance: the ground is still falling there, so
// it isn't a valley's bottom. "elevation" is a function of a plan point (x, y) that returns the ground elevation
// there, or null outside the topography. Returns the moved streams and the "median" distance their points were
// moved, in plan units.
export function snapStreams(layout, streams, elevation) {
    const {scale, spacing} = layout;
    const width = (layout.nCols - 1) * spacing;
    const height = (layout.nRows - 1) * spacing;
    const reach = snapDistance / scale;
    const tolerance = snapHeight / scale;
    const step = Math.max(2 * spacing, 3 / scale);
    const distances = [];
    const snapped = [];
    for (const stream of streams) {
        // The stream's points, a step apart
        const points = [];
        for (let ix = 1; ix < stream.points.length; ix++) {
            const point1 = stream.points[ix - 1];
            const point2 = stream.points[ix];
            const count = Math.max(1, Math.round(Math.hypot(point2.x - point1.x, point2.y - point1.y) / step));
            for (let ixStep = ix === 1 ? 0 : 1; ixStep <= count; ixStep++) {
                points.push([point1.x + (point2.x - point1.x) * ixStep / count, point1.y + (point2.y - point1.y) * ixStep / count]);
            }
        }

        // Each point's offset across the stream (to the left of its direction) to the lowest ground
        const offsets = points.map(([x, y], ix) => {
            const [prevX, prevY] = points[Math.max(0, ix - 1)];
            const [nextX, nextY] = points[Math.min(points.length - 1, ix + 1)];
            const length = Math.hypot(nextX - prevX, nextY - prevY);
            const acrossX = -(nextY - prevY) / length;
            const acrossY = (nextX - prevX) / length;
            // The ground across the stream, nearest first - and its lowest
            const grounds = [[0, elevation(x, y) ?? Infinity]];
            for (let across = spacing / 2; across <= reach; across += spacing / 2) {
                for (const side of [across, -across]) {
                    grounds.push([side, elevation(x + acrossX * side, y + acrossY * side) ?? Infinity]);
                }
            }
            const lowest = grounds.reduce((low, ground) => (ground[1] < low[1] ? ground : low));

            // The nearest ground that's about that low - unless the lowest ground is at the snap distance
            const offset = Math.abs(lowest[0]) > reach - spacing / 2 ? 0 : grounds.find(([, ground]) => ground <= lowest[1] + tolerance)[0];
            return [offset, acrossX, acrossY];
        });

        // The offsets along the stream are smoothed, so the stream doesn't zigzag - each is the median of the five about
        // it, then the mean of it (twice) and the offsets either side of it. Then the points are moved.
        const medians = offsets.map((unused, ix) => {
            const nearby = offsets.slice(Math.max(0, ix - 2), ix + 3).map(([offset]) => offset);
            return nearby.sort((offset1, offset2) => offset1 - offset2)[Math.floor(nearby.length / 2)];
        });
        const moved = points.map(([x, y], ix) => {
            const offset = (medians[Math.max(0, ix - 1)] + 2 * medians[ix] + medians[Math.min(medians.length - 1, ix + 1)]) / 4;
            distances.push(Math.abs(offset));
            return [x + offsets[ix][1] * offset, y + offsets[ix][2] * offset];
        });

        // The moved stream's parts within the grid
        for (const part of clipLine(moved, width, height)) {
            const simple = simplifyLine(part, simplifyDistance / scale);
            if (simple.length > 1) {
                snapped.push({...stream, 'points': simple.map(([x, y]) => ({'x': round(x, 1), 'y': round(y, 1)}))});
            }
        }
    }
    distances.sort((distance1, distance2) => distance1 - distance2);
    return {'streams': snapped, 'median': distances.length > 0 ? distances[Math.floor(distances.length / 2)] : 0};
}
