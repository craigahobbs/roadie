// route.js - the road's horizontal alignment: the least-cost route search, curve smoothing, and polyline utilities
// (a port of the Python planning tools')

import {
    crossSection, featurePolygons, featureStreams, groundElevation, groundGradient, pointInPolygons, sectionCut, sectionFill,
    sectionSlopeWidth, sectionWall, segmentIntersection
} from './design.js';
import {hypot, interp, linspace, pyRound} from './numeric.js';


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
// unreachable (hard). "startHeading" is the heading at the start (the previous leg's final heading), or null. Returns
// the route's "path" (an array of [x, y] points), the "lattice" spacing, and the final "heading" - or null if there's
// no route.
export function routeSearch(topo, design, start, end, gradeWeight, slopeWeight, startHeading = null, softBand = 0.03, gradeMargin = 0) {
    const lattice = Math.max(topo.spacing * 0.75, design.minRadius * 0.47, Math.max(topo.width, topo.height) / 160);
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

    // A move is at most two lattice steps, so only the nodes near a stream segment can cross it
    const margin = 3 * lattice;
    const latticeFirst = (v1, v2) => Math.max(0, Math.floor((Math.min(v1, v2) - margin) / lattice));
    const latticeEnd = (v1, v2, count) => Math.min(count, Math.ceil((Math.max(v1, v2) + margin) / lattice) + 1);

    // Precompute each move's cost from every node - a turning move is limited to the switchback grade
    const moveCosts = [];
    const moveTurnCosts = [];
    const section = new Float64Array(6);
    for (const [dx, dy] of moves) {
        const length = Math.sqrt(dx * dx + dy * dy) * lattice;
        const ux = dx * lattice / length;
        const uy = dy * lattice / length;
        const costs = new Float64Array(nodeCount).fill(Infinity);
        const turnCosts = new Float64Array(nodeCount).fill(Infinity);
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

        // Stream crossings need a culvert (a turning move's cost doesn't include it)
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
                        if (segmentIntersection(x1, y1, x2, y2, point1.x, point1.y, point2.x, point2.y) !== null) {
                            costs[row * nX + col] += design.costCulvert;
                        }
                    }
                }
            }
        }
        moveCosts.push(costs);
        moveTurnCosts.push(turnCosts);
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

        // Straight ahead and one direction either side - or from the start, any direction
        const noHeading = heading === moves.length;
        const headings = noHeading ? moves.keys() : [(heading + moves.length - 1) % moves.length, heading, (heading + 1) % moves.length];
        for (const nextHeading of headings) {
            const straight = noHeading || heading === nextHeading;
            const moveCost = straight ? moveCosts[nextHeading][node] : moveTurnCosts[nextHeading][node] + turnPenalty;
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
    for (let state = finalState; state !== -1; state = parent[state]) {
        const node = Math.floor(state / headingCount);
        path.push([(node % nX) * lattice, Math.floor(node / nX) * lattice]);
    }
    path.reverse();
    path[0] = [start[0], start[1]];
    path[path.length - 1] = [end[0], end[1]];
    return {path, lattice, 'heading': finalState % headingCount};
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
// minimum radius - returns the smoothed polyline's "x" and "y" coordinate arrays
export function smoothCurves(points, interval, minRadius) {
    let {x, y} = resamplePolyline(points.map((point) => point[0]), points.map((point) => point[1]), interval);
    for (let ixSmooth = 0; ixSmooth < 400; ixSmooth++) {
        const radius = turnRadius(x, y);
        let radiusMin = Infinity;
        for (let ix = 2; ix < radius.length - 2; ix++) {
            radiusMin = Math.min(radiusMin, radius[ix]);
        }
        if (radiusMin >= minRadius * 1.1) {
            break;
        }
        const smooth = (values) => values.map(
            (value, ix) => (ix === 0 || ix === values.length - 1 ? value : (values[ix - 1] + 2 * value + values[ix + 1]) * 0.25)
        );
        x = smooth(x);
        y = smooth(y);
    }
    return {x, y};
}
