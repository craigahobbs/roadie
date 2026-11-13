// structures.js - the road's structures: culverts, bridges, retaining walls, and turnouts (a port of the Python planning
// tools')

import {crossSection, featureStreams, groundElevation, sectionWallLeft, sectionWallRight, segmentIntersection} from './design.js';
import {npRound, pyRound} from './numeric.js';


// Get the station mask of the existing roads ([station, end station] ranges), with a tolerance for the stations' rounding
export function existingMask(stations, existingRoads) {
    const mask = new Uint8Array(stations.length);
    for (const [start, end] of existingRoads) {
        for (let ix = 0; ix < stations.length; ix++) {
            if (stations[ix] >= start - 1e-6 && stations[ix] <= end + 1e-6) {
                mask[ix] = 1;
            }
        }
    }
    return mask;
}


// Place an alignment's structures - retaining walls (where a slope doesn't daylight), culverts (at stream crossings and
// profile sags), bridges (over deep stream crossing fills), and turnouts. None are within the existing roads ([station,
// end station] ranges), which are added as existing road structures. The alignment is its "x" and "y" coordinate arrays,
// their evenly-spaced "stations", its "profile" (the grade elevations), and the ground's "sideSlope" at the stations.
// Returns the array of structure models, in station order.
export function designStructures(topo, design, x, y, stations, profile, sideSlope, existingRoads) {
    const count = x.length;
    const ds = stations[1] - stations[0];
    const length = stations[count - 1];
    const existing = existingMask(stations, existingRoads);
    const inExisting = (stationValue) => existingRoads.some(([start, end]) => start - 1e-6 <= stationValue && stationValue <= end + 1e-6);
    const structures = [];

    // The cut (or fill) depth at each station, and the heights of the walls where its slopes don't daylight
    const depth = new Float64Array(count);
    const wallLeft = new Float64Array(count);
    const wallRight = new Float64Array(count);
    const section = new Float64Array(6);
    for (let ix = 0; ix < count; ix++) {
        depth[ix] = groundElevation(topo, x[ix], y[ix]) - profile[ix];
        crossSection(depth[ix], sideSlope[ix], design.halfWidth, design.cutSlope, design.fillSlope, section);
        wallLeft[ix] = section[sectionWallLeft];
        wallRight[ix] = section[sectionWallRight];
    }

    // Stream crossings
    const crossings = [];
    for (const {name, points} of featureStreams(topo)) {
        for (let ixPoint = 1; ixPoint < points.length; ixPoint++) {
            const point1 = points[ixPoint - 1];
            const point2 = points[ixPoint];
            for (let ix = 0; ix < count - 1; ix++) {
                const fraction = segmentIntersection(x[ix], y[ix], x[ix + 1], y[ix + 1], point1.x, point1.y, point2.x, point2.y);
                if (fraction !== null) {
                    const stationValue = stations[ix] + fraction * ds;
                    if (!inExisting(stationValue)) {
                        crossings.push([stationValue, name]);
                    }
                }
            }
        }
    }

    // Bridges for deep stream crossing fills - a single span (at most 150 feet / 45 meters) over the deepest fill
    const bridges = [];
    if (design.bridgeFill) {
        const maxSpan = design.feet ? 150 : 45;
        for (const [stationValue, name] of crossings) {
            const ixCross = pyRound(stationValue / ds);
            if (-depth[ixCross] > design.bridgeFill) {
                let ixStart = ixCross;
                let ixEnd = ixCross;
                while ((ixEnd - ixStart + 1) * ds < maxSpan) {
                    const fillBefore = ixStart > 0 ? -depth[ixStart - 1] : 0;
                    const fillAfter = ixEnd < count - 1 ? -depth[ixEnd + 1] : 0;
                    if (Math.max(fillBefore, fillAfter) <= design.bridgeFill * 0.5) {
                        break;
                    }
                    if (fillBefore >= fillAfter) {
                        ixStart -= 1;
                    } else {
                        ixEnd += 1;
                    }
                }
                bridges.push([stations[ixStart], stations[ixEnd]]);
                structures.push({
                    'type': 'bridge',
                    'station': npRound(stations[ixStart], 1),
                    'endStation': npRound(stations[ixEnd], 1),
                    'name': `${name} bridge`
                });
            }
        }
    }
    const inBridge = (stationValue) => bridges.some(([start, end]) => start <= stationValue && stationValue <= end);

    // Culverts at stream crossings and profile sag points
    const culvertStations = [];
    for (const [stationValue, name] of crossings) {
        if (!inBridge(stationValue)) {
            culvertStations.push(stationValue);
            structures.push({
                'type': 'culvert',
                'station': npRound(stationValue, 1),
                'diameter': design.feet ? 3 : 0.9,
                'name': `${name} culvert`
            });
        }
    }
    const tolerance = Math.max(design.width, topo.spacing) * 2;
    for (let ix = 1; ix < count - 1; ix++) {
        if (profile[ix] < profile[ix - 1] && profile[ix] <= profile[ix + 1]) {
            const stationValue = stations[ix];
            if (!inBridge(stationValue) && !existing[ix] && culvertStations.every((other) => Math.abs(stationValue - other) > tolerance)) {
                culvertStations.push(stationValue);
                structures.push({'type': 'culvert', 'station': npRound(stationValue, 1), 'name': 'Sag cross drain'});
            }
        }
    }

    // Retaining walls where a slope does not daylight
    for (const [side, walls] of [['left', wallLeft], ['right', wallRight]]) {
        const isWall = (ix) => walls[ix] > 0 && !inBridge(stations[ix]) && !existing[ix];
        for (let ix = 0; ix < count; ix++) {
            if (isWall(ix)) {
                let ixEnd = ix;
                while (ixEnd + 1 < count && isWall(ixEnd + 1)) {
                    ixEnd += 1;
                }
                structures.push({
                    'type': 'retainingWall',
                    'station': npRound(Math.max(0, stations[ix] - ds), 1),
                    'endStation': npRound(Math.min(length, stations[ixEnd] + ds), 1),
                    side
                });
                ix = ixEnd;
            }
        }
    }

    // Turnouts on the flatter side (toward the uphill side, where the cut is cheaper)
    if (design.turnoutSpacing > 0 && length > design.turnoutSpacing * 0.375) {
        const turnoutLength = design.feet ? 50 : 15;
        const turnoutCount = Math.max(1, Math.trunc(length / design.turnoutSpacing));
        for (let ixTurnout = 0; ixTurnout < turnoutCount; ixTurnout++) {
            const center = length * (ixTurnout + 1) / (turnoutCount + 1);
            const ixCenter = pyRound(center / ds);
            if (!existing[ixCenter]) {
                structures.push({
                    'type': 'turnout',
                    'station': npRound(center - turnoutLength / 2, 1),
                    'endStation': npRound(center + turnoutLength / 2, 1),
                    'side': sideSlope[ixCenter] > 0 ? 'left' : 'right'
                });
            }
        }
    }

    // Existing roads (their stations are the command's arguments, rounded as Python rounds - the structures' stations
    // above are the alignment's, rounded as numpy rounds)
    for (const [start, end] of existingRoads) {
        structures.push({'type': 'existingRoad', 'station': pyRound(start, 1), 'endStation': pyRound(end, 1), 'name': 'Existing road'});
    }

    return structures.sort((structure1, structure2) => structure1.station - structure2.station);
}
