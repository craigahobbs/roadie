// route.js - the road's horizontal alignment: the least-cost route search (which follows the plan's existing roads
// where that's cheaper than a new road), curve smoothing, and polyline utilities (a port of the Python planning
// tools', but for the existing roads)

import {
    crossSection, featurePolygons, featureStreams, groundElevation, groundGradient, pointInPolygons, sectionCut, sectionFill,
    sectionSlopeWidth, sectionWall, segmentIntersection
} from './design.js';
import {hypot, interp, linspace, pyRound} from './numeric.js';
import {nearestLine, segmentNearest} from './roads.js';


// The route search's 16 move directions ([dx, dy] lattice steps), in angle order
const moves = [
    [1, 0], [2, 1], [1, 1], [1, 2], [0, 1], [-1, 2], [-1, 1], [-2, 1],
    [-1, 0], [-2, -1], [-1, -1], [-1, -2], [0, -1], [1, -2], [1, -1], [2, -1]
];


// The number of heading states of a route search node - the 16 move directions, and no heading (the start)
const headingCount = moves.length + 1;


// Search for the least-cost horizontal alignment from a start point to an end point ([x, y] arrays) on a lattice with
// heading states (so its turns have a radius). A move's cost is its length's road and its earthwork on the ground's
// side slope, weighted by "slopeWeight", and its climb beyond the design grade, weighted by "gradeWeight" - the climb
// must be absorbed by earthwork (soft, up to "softBand" over the design grade, less "gradeMargin") or it makes the end
// unreachable (hard). "startHeading" is the heading at the start (the previous leg's final heading), or null.
//
// "roads" is the index of the plan's existing roads (roads.js), or null for an all-new road. A move along an existing
// road costs its length's upgrade - there's no earthwork, grade limit, or culvert, and the road turns as it does - so
// the route follows the existing roads where that's cheaper than a new road, and joins and leaves them where it's
// cheapest.
//
// Returns the route's "path" (an array of [x, y] points), its points' "existing" flags (the move to the point is along
// an existing road), the "lattice" spacing, and the final "heading" - or null if there's no route.
export function routeSearch(
    topo, design, start, end, gradeWeight, slopeWeight, startHeading = null, softBand = 0.03, gradeMargin = 0, roads = null
) {
    // The lattice is as fine as the minimum radius' turns allow (a turn is 22.5 degrees a step) - a finer lattice finds
    // a cheaper road, on gentler ground
    const lattice = Math.max(topo.spacing * 0.75, design.minRadius * 0.47);
    const nX = Math.trunc(topo.width / lattice) + 1;
    const nY = Math.trunc(topo.height / lattice) + 1;
    const nodeCount = nX * nY;
    const exclusions = featurePolygons(topo, 'exclusion');
    const rocks = featurePolygons(topo, 'rock');
    const streams = featureStreams(topo);

    // The nodes' elevations, and the nodes within the exclusion areas
    const nodeZ = new Float64Array(nodeCount);
    const blocked = new Uint8Array(nodeCount);
    for (let row = 0; row < nY; row++) {
        for (let col = 0; col < nX; col++) {
            const node = row * nX + col;
            nodeZ[node] = groundElevation(topo, col * lattice, row * lattice);
            blocked[node] = pointInPolygons(col * lattice, row * lattice, exclusions) ? 1 : 0;
        }
    }

    // The nodes on the existing roads - those within the tolerance of a road's line. A move is along an existing road
    // if it's between two of them and it's on the road in between, too (so it isn't a move from one road to another, or
    // across a switchback).
    const roadTolerance = lattice * roadToleranceLattice;
    const roadNodes = new Uint8Array(nodeCount);
    for (const segment of roads?.segments ?? []) {
        const rowEnd = Math.min(nY - 1, Math.floor((Math.max(segment.y1, segment.y2) + roadTolerance) / lattice));
        const colEnd = Math.min(nX - 1, Math.floor((Math.max(segment.x1, segment.x2) + roadTolerance) / lattice));
        for (let row = Math.max(0, Math.ceil((Math.min(segment.y1, segment.y2) - roadTolerance) / lattice)); row <= rowEnd; row++) {
            for (let col = Math.max(0, Math.ceil((Math.min(segment.x1, segment.x2) - roadTolerance) / lattice)); col <= colEnd; col++) {
                if (segmentNearest(segment, col * lattice, row * lattice)[0] <= roadTolerance) {
                    roadNodes[row * nX + col] = 1;
                }
            }
        }
    }
    const isRoadMove = (x1, y1, x2, y2) => [0.25, 0.5, 0.75].every(
        (fraction) => nearestLine(roads, x1 + fraction * (x2 - x1), y1 + fraction * (y2 - y1), roadTolerance) !== null
    );

    // A move is at most two lattice steps, so only the nodes near a stream segment can cross it
    const margin = 3 * lattice;
    const latticeFirst = (v1, v2) => Math.max(0, Math.floor((Math.min(v1, v2) - margin) / lattice));
    const latticeEnd = (v1, v2, count) => Math.min(count, Math.ceil((Math.max(v1, v2) + margin) / lattice) + 1);

    // Precompute each move's cost from every node - a turning move is limited to the switchback grade
    const moveCosts = [];
    const moveTurnCosts = [];
    const moveRoads = [];
    const section = new Float64Array(6);
    for (const [dx, dy] of moves) {
        const length = Math.sqrt(dx * dx + dy * dy) * lattice;
        const ux = dx * lattice / length;
        const uy = dy * lattice / length;
        const costs = new Float64Array(nodeCount).fill(Infinity);
        const turnCosts = new Float64Array(nodeCount).fill(Infinity);
        const roadMoves = new Uint8Array(nodeCount);
        const excessCost = (groundGrade, limitGrade) => {
            const excess = Math.max(0, groundGrade - (limitGrade - gradeMargin)) * length;
            const soft = Math.min(excess, softBand * length);
            return gradeWeight * (soft * design.costLength * 15 + (excess - soft) * design.costLength * 300);
        };
        for (let row = 0; row < nY; row++) {
            for (let col = 0; col < nX; col++) {
                // The move's end is within the topography, and neither it nor the node is within an exclusion area?
                const x1 = col * lattice;
                const y1 = row * lattice;
                const x2 = x1 + dx * lattice;
                const y2 = y1 + dy * lattice;
                const row2 = row + dy;
                const col2 = col + dx;
                const node = row * nX + col;
                const inside = x2 >= 0 && y2 >= 0 && x2 <= topo.width && y2 <= topo.height;
                const inLattice = row2 >= 0 && row2 < nY && col2 >= 0 && col2 < nX;
                if (!inside || !inLattice || blocked[node] || blocked[row2 * nX + col2]) {
                    continue;
                }

                // A move along an existing road is the road's upgrade
                if (roadNodes[node] && roadNodes[row2 * nX + col2] && isRoadMove(x1, y1, x2, y2)) {
                    roadMoves[node] = 1;
                    costs[node] = length * design.costExisting;
                    turnCosts[node] = costs[node];
                    continue;
                }

                // Bench section earthwork at the ground line, with walls where the side slope is too steep
                const midX = (x1 + x2) * 0.5;
                const midY = (y1 + y2) * 0.5;
                const [gradientX, gradientY] = groundGradient(topo, midX, midY);
                const sideSlope = -uy * gradientX + ux * gradientY;
                crossSection(0, sideSlope, design.halfWidth, design.cutSlope, design.fillSlope, section);
                const cutCost = pointInPolygons(midX, midY, rocks) ? design.costRock : design.costCut;
                const cost = length * (design.costLength + slopeWeight * (
                    section[sectionCut] * cutCost + section[sectionFill] * design.costFill +
                    section[sectionSlopeWidth] * design.costArea + section[sectionWall] * design.costWall
                ));

                // The climb beyond the design grade
                const groundGrade = Math.abs(groundElevation(topo, x2, y2) - nodeZ[node]) / length;
                turnCosts[node] = cost + excessCost(groundGrade, design.switchbackGrade);
                costs[node] = cost + excessCost(groundGrade, design.grade);
            }
        }

        // Stream crossings need a culvert (a turning move's cost doesn't include it, and an existing road has its own)
        for (const {points} of streams) {
            for (let ixPoint = 1; ixPoint < points.length; ixPoint++) {
                const point1 = points[ixPoint - 1];
                const point2 = points[ixPoint];
                const rowEnd = latticeEnd(point1.y, point2.y, nY);
                const colEnd = latticeEnd(point1.x, point2.x, nX);
                for (let row = latticeFirst(point1.y, point2.y); row < rowEnd; row++) {
                    for (let col = latticeFirst(point1.x, point2.x); col < colEnd; col++) {
                        const x1 = col * lattice;
                        const y1 = row * lattice;
                        const x2 = x1 + dx * lattice;
                        const y2 = y1 + dy * lattice;
                        if (!roadMoves[row * nX + col] &&
                            segmentIntersection(x1, y1, x2, y2, point1.x, point1.y, point2.x, point2.y) !== null) {
                            costs[row * nX + col] += design.costCulvert;
                        }
                    }
                }
            }
        }
        moveCosts.push(costs);
        moveTurnCosts.push(turnCosts);
        moveRoads.push(roadMoves);
    }

    // The nearest nodes to the start and end points
    const nearestNode = ([x, y]) => (
        Math.min(nY - 1, Math.max(0, pyRound(y / lattice))) * nX + Math.min(nX - 1, Math.max(0, pyRound(x / lattice)))
    );
    const startNode = nearestNode(start);
    const endNode = nearestNode(end);

    // Dijkstra over the (node, heading) states - equal-cost states are taken in state order (row, column, heading)
    const best = new Float64Array(nodeCount * headingCount).fill(Infinity);
    const parent = new Int32Array(nodeCount * headingCount).fill(-1);
    const heap = new StateHeap();
    const startState = startNode * headingCount + (startHeading ?? moves.length);
    const turnPenalty = design.costLength * lattice * 0.15;
    let finalState = null;
    best[startState] = 0;
    heap.push(0, startState);
    while (heap.count > 0) {
        const [cost, state] = heap.pop();
        if (cost > best[state]) {
            continue;
        }
        const node = Math.floor(state / headingCount);
        const heading = state % headingCount;
        if (node === endNode) {
            finalState = state;
            break;
        }

        // Straight ahead and one direction either side - or from the start, any direction. On an existing road (the
        // move to the node was along it), the next move along it is in any direction - the road turns as it does.
        const noHeading = heading === moves.length;
        const onRoad = !noHeading && moveRoads[heading][node - moves[heading][1] * nX - moves[heading][0]] === 1;
        const headings = noHeading || onRoad ? moves.keys() :
            [(heading + moves.length - 1) % moves.length, heading, (heading + 1) % moves.length];
        for (const nextHeading of headings) {
            const turn = noHeading ? 0 : Math.min(
                (nextHeading - heading + moves.length) % moves.length, (heading - nextHeading + moves.length) % moves.length
            );
            const roadMove = moveRoads[nextHeading][node] === 1;
            if (turn > 1 && !roadMove) {
                continue;
            }
            const moveCost = turn === 0 ? moveCosts[nextHeading][node] : moveTurnCosts[nextHeading][node] + (roadMove ? 0 : turnPenalty);
            if (moveCost === Infinity) {
                continue;
            }
            const [dx, dy] = moves[nextHeading];
            const nextState = (node + dy * nX + dx) * headingCount + nextHeading;
            const nextCost = cost + moveCost;
            if (nextCost < best[nextState]) {
                best[nextState] = nextCost;
                parent[nextState] = state;
                heap.push(nextCost, nextState);
            }
        }
    }
    if (finalState === null) {
        return null;
    }

    // Trace the path - it starts and ends at the start and end points
    const path = [];
    const existing = [];
    for (let state = finalState; state !== -1; state = parent[state]) {
        const node = Math.floor(state / headingCount);
        path.push([(node % nX) * lattice, Math.floor(node / nX) * lattice]);
        existing.push(parent[state] !== -1 && moveRoads[state % headingCount][Math.floor(parent[state] / headingCount)] === 1);
    }
    path.reverse();
    existing.reverse();
    path[0] = [start[0], start[1]];
    path[path.length - 1] = [end[0], end[1]];
    return {path, existing, lattice, 'heading': finalState % headingCount};
}


// The distance from an existing road's line that the route search's nodes are on the road within, in lattice spacings
const roadToleranceLattice = 0.75;


// Follow the existing roads of a route search's path (an array of [x, y] points, and its points' "existing" flags) -
// the path's runs along existing roads are moved onto the roads' lines ("roads" is the existing roads' index, and
// "lattice" is the search's lattice spacing). A run is an existing road where it's "minLength" long, at least, less
// the "transition" at each end where it joins a new road - the junction's curve is new road. Returns the path's
// "points" and its existing roads' "ranges" ([station, end station] arrays, along the points).
export function followRoads(path, existing, roads, lattice, minLength, transition) {
    const points = path.map(([x, y]) => [x, y]);
    const last = path.length - 1;
    const runs = [];
    for (let ix = 1; ix <= last; ix++) {
        if (existing[ix]) {
            // The run of moves along an existing road - from the point before the first to the last's point
            const ixStart = ix - 1;
            while (ix < last && existing[ix + 1]) {
                ix += 1;
            }
            const run = path.slice(ixStart, ix + 1);
            const runLength = polylineStations(run.map((point) => point[0]), run.map((point) => point[1])).at(-1);
            const trimStart = ixStart === 0 ? 0 : transition;
            const trimEnd = ix === last ? 0 : transition;
            if (runLength - trimStart - trimEnd >= minLength) {
                runs.push([ixStart, ix, trimStart, trimEnd]);

                // The run's points are the road's - but for the path's start and end points
                for (let ixPoint = Math.max(1, ixStart); ixPoint <= Math.min(last - 1, ix); ixPoint++) {
                    const nearest = nearestLine(roads, path[ixPoint][0], path[ixPoint][1], lattice);
                    points[ixPoint] = [nearest.x, nearest.y];
                }
            }
        }
    }
    const stations = polylineStations(points.map((point) => point[0]), points.map((point) => point[1]));
    return {
        points,
        'ranges': runs.map(([ixStart, ixEnd, trimStart, trimEnd]) => [stations[ixStart] + trimStart, stations[ixEnd] - trimEnd])
    };
}


// A binary min-heap of route search states, by cost and then by state
class StateHeap {
    constructor() {
        this.costs = [];
        this.states = [];
        this.count = 0;
    }

    // Determine if the item at an index is less than a cost and state
    less(ix, cost, state) {
        return this.costs[ix] < cost || (this.costs[ix] === cost && this.states[ix] < state);
    }

    push(cost, state) {
        // Sift the new item up from the end
        const {costs, states} = this;
        let ix = this.count;
        this.count += 1;
        while (ix > 0) {
            const ixParent = (ix - 1) >> 1;
            if (this.less(ixParent, cost, state)) {
                break;
            }
            costs[ix] = costs[ixParent];
            states[ix] = states[ixParent];
            ix = ixParent;
        }
        costs[ix] = cost;
        states[ix] = state;
    }

    pop() {
        // Remove the first item, and sift the last item down from the top
        const {costs, states} = this;
        const first = [costs[0], states[0]];
        this.count -= 1;
        const {count} = this;
        const cost = costs[count];
        const state = states[count];
        let ix = 0;
        for (;;) {
            let ixChild = 2 * ix + 1;
            if (ixChild >= count) {
                break;
            }
            if (ixChild + 1 < count && this.less(ixChild + 1, costs[ixChild], states[ixChild])) {
                ixChild += 1;
            }
            if (!this.less(ixChild, cost, state)) {
                break;
            }
            costs[ix] = costs[ixChild];
            states[ix] = states[ixChild];
            ix = ixChild;
        }
        costs[ix] = cost;
        states[ix] = state;
        return first;
    }
}


// Get the stations (cumulative lengths) of a polyline's points
export function polylineStations(x, y) {
    const stations = new Float64Array(x.length);
    for (let ix = 1; ix < x.length; ix++) {
        stations[ix] = stations[ix - 1] + hypot(x[ix] - x[ix - 1], y[ix] - y[ix - 1]);
    }
    return stations;
}


// Resample a polyline (arrays of x and y coordinates) at an even interval - returns its "x" and "y" coordinate arrays
// and their "stations"
export function resamplePolyline(pointsX, pointsY, interval) {
    const pointStations = polylineStations(pointsX, pointsY);
    const length = pointStations[pointStations.length - 1];
    const stations = linspace(length, Math.max(2, Math.ceil(length / interval) + 1));
    return {
        'x': stations.map((stationValue) => interp(stationValue, pointStations, pointsX)),
        'y': stations.map((stationValue) => interp(stationValue, pointStations, pointsY)),
        stations
    };
}


// Compute the circumradius at each polyline point (infinite at the ends and on straight runs)
export function turnRadius(x, y) {
    const radius = new Float64Array(x.length).fill(Infinity);
    for (let ix = 1; ix < x.length - 1; ix++) {
        const ax = x[ix - 1];
        const ay = y[ix - 1];
        const bx = x[ix];
        const by = y[ix];
        const cx = x[ix + 1];
        const cy = y[ix + 1];
        const cross = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
        if (cross > 1e-9) {
            radius[ix] = hypot(bx - ax, by - ay) * hypot(cx - bx, cy - by) * hypot(cx - ax, cy - ay) / (2 * cross);
        }
    }
    return radius;
}


// Resample a polyline (an array of [x, y] points) and smooth it (keeping the endpoints) until its curves meet the
// minimum radius. The polyline's existing roads (the "ranges" of its stations - [station, end station] arrays) are
// kept as they are - an existing road's curves are its own. Where a new road meets an existing road's end at a
// corner, the corner is the junction's curve: the existing road's end is smoothed with the new road, and it's new
// road (up to four of the minimum radius of it). Returns the smoothed polyline's "x" and "y" coordinate arrays, and
// the existing roads' "ranges" of the smoothed polyline's stations.
export function smoothCurves(points, interval, minRadius, ranges = []) {
    const resampled = resamplePolyline(points.map((point) => point[0]), points.map((point) => point[1]), interval);
    let {x, y} = resampled;

    // The existing roads' points - a range's first and last points, and the points between them
    const fixed = new Uint8Array(x.length);
    const fixedRanges = [];
    for (const [start, end] of ranges) {
        const ixStart = resampled.stations.findIndex((stationValue) => stationValue >= start - 1e-6);
        const ixEnd = resampled.stations.findLastIndex((stationValue) => stationValue <= end + 1e-6);
        if (ixStart !== -1 && ixStart < ixEnd) {
            fixed.fill(1, ixStart, ixEnd + 1);
            fixedRanges.push({'ends': [ixStart, ixEnd], 'junctions': [0, 0]});
        }
    }
    const junctionLimit = Math.ceil(4 * minRadius / interval);

    for (let ixSmooth = 0; ixSmooth < 400; ixSmooth++) {
        const radius = turnRadius(x, y);

        // An existing road's end at a corner with the new road is the junction's curve
        for (const {ends, junctions} of fixedRanges) {
            for (const [end, step] of [[0, 1], [1, -1]]) {
                const ix = ends[end];
                if (ends[0] <= ends[1] && ix >= 2 && ix < radius.length - 2 && junctions[end] < junctionLimit &&
                    radius[ix] < minRadius * 1.1) {
                    fixed[ix] = 0;
                    ends[end] += step;
                    junctions[end] += 1;
                }
            }
        }

        let radiusMin = Infinity;
        for (let ix = 2; ix < radius.length - 2; ix++) {
            if (!fixed[ix]) {
                radiusMin = Math.min(radiusMin, radius[ix]);
            }
        }
        if (radiusMin >= minRadius * 1.1) {
            break;
        }
        const smooth = (values) => values.map((value, ix) => (
            ix === 0 || ix === values.length - 1 || fixed[ix] ? value : (values[ix - 1] + 2 * value + values[ix + 1]) * 0.25
        ));
        x = smooth(x);
        y = smooth(y);
    }
    const stations = polylineStations(x, y);
    return {
        x,
        y,
        'ranges': fixedRanges.filter(({ends}) => ends[0] < ends[1]).map(({ends}) => [stations[ends[0]], stations[ends[1]]])
    };
}
