// profile.js - the road's vertical profile design (a port of the Python planning tools')

import {arange, hypot, movingAverage, pairwiseSum, pyRound} from './numeric.js';
import {crossSection, groundElevation, groundGradient, sectionCut, sectionFill, sectionSlopeWidth, sectionWall} from './design.js';
import {featureIndexes, pointInPolygons} from '../../lib/model.js';
import {turnRadius} from './route.js';


// Find the index of an array's minimum value - the first of equal minimums
function argMin(values) {
    let ixMin = 0;
    for (let ix = 1; ix < values.length; ix++) {
        if (values[ix] < values[ixMin]) {
            ixMin = ix;
        }
    }
    return ixMin;
}


// Find the index of the minimum of a station's total costs - they're within the station's levels ("first" up to "end")
// and infinite at its other levels, so only its levels are searched. It's the first of equal minimums, as argMin
// finds - the first level, if the station's costs are all infinite.
function argMinLevels(totals, first, end) {
    let ixMin = first;
    for (let ix = first + 1; ix < end; ix++) {
        if (totals[ix] < totals[ixMin]) {
            ixMin = ix;
        }
    }
    return totals[ixMin] === Infinity ? 0 : ixMin;
}


// The profile's depth limits, as multiples of the design's maximum depth - the profile is designed within the first
// limit of the ground that the grade limits can meet (the last is no limit)
const depthLimits = [1, 4, Infinity];


// The most station level cells whose cross sections a profile's design keeps (four numbers each - 192 MB, for a
// road of about a mile)
const sectionCellLimit = 6000000;


// Design the vertical profile of an alignment (its "x" and "y" coordinate arrays and their evenly-spaced "stations") by
// dynamic programming - the minimum earthwork cost within the grade limits. Within an existing road (the "existing"
// station mask, or null), the profile follows the ground. Returns the "profile" (the grade elevations), the "ground"
// elevations, and the ground's "sideSlope" (its rise per unit of offset to the left) at the stations - and the index
// of the first existing road station that the grade limits can't reach ("unreachable"), or null. A profile that can't
// reach an existing road isn't a road's, so its design stops there: its "profile" is null (the rest of its design is
// most of its work, and nothing's made of it). A profile that the grade limits can't take to the end's ground ends at
// the nearest level they can, and a profile that they can't keep within the design's maximum depth of the ground is
// "deep" (it isn't a road's) - unless "isDeep" is false: there's then no profile (null), which is much less work to
// find than how deep it is.
// "cellLimit" is the most station level cells whose cross sections the design keeps (it's faster, and the same).
export function designProfile(topo, design, x, y, stations, existing = null, cellLimit = sectionCellLimit, isDeep = true) {
    // The profile is within the maximum cut and fill depth of the ground - its design's work is the stations times the
    // depth, not times the site's relief. Where the grade limits can't keep it there, it's designed with a deeper limit
    // - it's deep.
    let result = null;
    for (const depthLimit of (isDeep ? depthLimits : depthLimits.slice(0, 1))) {
        result = designProfileDepth(topo, design, x, y, stations, existing, depthLimit, cellLimit);
        if (result !== null) {
            result.deep = depthLimit !== depthLimits[0];
            break;
        }
    }
    return result;
}


// Design the vertical profile within a depth limit of the ground (a multiple of the design's maximum depth) -
// returns null if the grade limits can't keep the profile within it
function designProfileDepth(topo, design, x, y, stations, existing, depthLimit, cellLimit) {
    const count = x.length;
    const last = count - 1;
    const ds = stations[1] - stations[0];
    const isExisting = existing ?? new Uint8Array(count);
    const rocks = featureIndexes(topo, 'rock');

    // The ground, its side slope, and the cut slope at each station
    const ground = new Float64Array(count);
    const sideSlope = new Float64Array(count);
    const cutSlope = new Float64Array(count);
    const cutUnit = new Float64Array(count);
    for (let ix = 0; ix < count; ix++) {
        // The heading is the alignment's gradient - central differences, one-sided at the ends
        const ixPrev = Math.max(0, ix - 1);
        const ixNext = Math.min(last, ix + 1);
        const divisor = ixNext - ixPrev;
        const headingX = (x[ixNext] - x[ixPrev]) / divisor;
        const headingY = (y[ixNext] - y[ixPrev]) / divisor;
        const headingLength = Math.max(hypot(headingX, headingY), 1e-9);
        const [gradientX, gradientY] = groundGradient(topo, x[ix], y[ix]);
        ground[ix] = groundElevation(topo, x[ix], y[ix]);
        sideSlope[ix] = -(headingY / headingLength) * gradientX + headingX / headingLength * gradientY;
        const rock = pointInPolygons(x[ix], y[ix], rocks);
        cutSlope[ix] = rock ? design.rockCutSlope : design.cutSlope;
        cutUnit[ix] = rock ? design.costRock : design.costCut;
    }

    // Grade limits - tight curves (and the stations next to them) use the switchback grade
    const radius = turnRadius(x, y);
    const isTight = (ix) => ix >= 0 && ix <= last && radius[ix] < 1.5 * design.minRadius;
    const gradeLimit = new Float64Array(count);
    for (let ix = 0; ix < count; ix++) {
        gradeLimit[ix] = isTight(ix - 1) || isTight(ix) || isTight(ix + 1) ? design.switchbackGrade : design.grade;
    }

    // The elevation levels - the resolution makes the design grade's window a whole number of levels
    const resolution = design.grade * ds / 24;
    const {maxDepth} = design;
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const z of ground) {
        zMin = Math.min(zMin, z);
        zMax = Math.max(zMax, z);
    }
    zMin -= maxDepth;
    zMax += maxDepth;
    const levels = arange(zMin, zMax + resolution, resolution);
    const levelCount = levels.length;
    const groundLevel = new Int32Array(count);
    for (let ix = 0; ix < count; ix++) {
        groundLevel[ix] = Math.max(0, Math.min(levelCount - 1, pyRound((ground[ix] - zMin) / resolution)));
    }

    // Each station's levels - those within the depth limit of its ground ("levelFirst" up to "levelEnd"). A station's
    // cost at its other levels is infinite. "cells" is the index of each station's first level's cell.
    const depthLevels = depthLimit === Infinity ? levelCount : Math.ceil(depthLimit * maxDepth / resolution);
    const levelFirst = new Int32Array(count);
    const levelEnd = new Int32Array(count);
    const cells = new Int32Array(count + 1);
    for (let ix = 0; ix < count; ix++) {
        levelFirst[ix] = Math.max(0, groundLevel[ix] - depthLevels);
        levelEnd[ix] = Math.min(levelCount, groundLevel[ix] + depthLevels + 1);
        cells[ix + 1] = cells[ix] + levelEnd[ix] - levelFirst[ix];
    }

    // A station's cross section at a level - the cut and fill areas, and the slope width and wall height
    const section = new Float64Array(6);
    const stationSection = (ix, level) => {
        crossSection(
            ground[ix] - levels[level], sideSlope[ix], design.halfWidth, cutSlope[ix], design.fillSlope, design.maxSlopeHeight, section
        );
    };

    // The stations' cross sections at their levels are the same for every balance price, so they're computed once and
    // kept (a cell's first four section values) - if they fit: the largest profiles' are computed for each price.
    // "sectionValues" are the kept cross sections, or the cross section that was just computed.
    const isKept = cells[count] <= cellLimit;
    const sectionValues = isKept ? new Float64Array(4 * cells[count]) : section;
    if (isKept) {
        for (let ix = 0; ix < count; ix++) {
            if (!isExisting[ix]) {
                for (let level = levelFirst[ix], cell = 4 * cells[ix]; level < levelEnd[ix]; level++, cell += 4) {
                    stationSection(ix, level);
                    sectionValues[cell + sectionCut] = section[sectionCut];
                    sectionValues[cell + sectionFill] = section[sectionFill];
                    sectionValues[cell + sectionSlopeWidth] = section[sectionSlopeWidth];
                    sectionValues[cell + sectionWall] = section[sectionWall];
                }
            }
        }
    }

    // Find the least-cost profile for a cut and fill balance price - a positive balance makes fill more expensive and
    // cut cheaper (to reduce borrow), and a negative balance the reverse. Returns the profile's true cost and its
    // levels' indexes - or null, if the grade limits can't keep the profile within the depth limit, or reach an
    // existing road (within no depth limit, its station is the profile's "unreachable" station).
    const back = new Int32Array(cells[count]);
    const queue = new Int32Array(levelCount);
    const totals = [new Float64Array(levelCount).fill(Infinity), new Float64Array(levelCount).fill(Infinity)];
    let unreachable = null;
    const solve = (balance) => {
        // A station's cost at a level - an existing road is at the ground, with no earthwork
        const stationCost = (ix, level) => {
            if (isExisting[ix]) {
                return level === groundLevel[ix] ? 0 : Infinity;
            }
            let cell = 0;
            if (isKept) {
                cell = 4 * (cells[ix] - levelFirst[ix] + level);
            } else {
                stationSection(ix, level);
            }
            return ds * (
                sectionValues[cell + sectionCut] * (cutUnit[ix] - balance * design.shrink) +
                sectionValues[cell + sectionFill] * (design.costFill + balance) +
                sectionValues[cell + sectionSlopeWidth] * design.costArea + sectionValues[cell + sectionWall] * design.costWall
            );
        };

        // The first station is at the level nearest its ground. A station's total costs are within its levels - they're
        // infinite at its other levels.
        let total = totals[0].fill(Infinity);
        let previous = totals[1].fill(Infinity);
        const startLevel = argMin(levels.map((level) => Math.abs(level - ground[0])));
        total[startLevel] = stationCost(0, startLevel);
        for (let ix = 1; ix < count; ix++) {
            // The station's total costs replace the station before the previous station's
            [previous, total] = [total, previous];
            if (ix > 1) {
                total.fill(Infinity, levelFirst[ix - 2], levelEnd[ix - 2]);
            }
            const first = levelFirst[ix];
            const end = levelEnd[ix];
            const cell = cells[ix] - first;

            // Within an existing road (or where the grade limit can't reach one), any grade
            const ixMin = isExisting[ix] ? argMinLevels(previous, levelFirst[ix - 1], levelEnd[ix - 1]) : 0;
            if (isExisting[ix] && (isExisting[ix - 1] || previous[ixMin] === Infinity)) {
                for (let level = first; level < end; level++) {
                    back[cell + level] = ixMin;
                    total[level] = previous[ixMin] + stationCost(ix, level);
                }
                continue;
            }

            // Each level's least-cost previous level within the grade limit's window - the first of equal costs. The
            // window's least-cost levels are kept in a queue, in level order: their costs increase, so the first is
            // the window's least.
            const window = Math.trunc(gradeLimit[ix] * ds / resolution + 1e-6);
            let queueFirst = 0;
            let queueEnd = 0;
            let levelNext = Math.max(0, first - window);
            for (let level = first; level < end; level++) {
                for (const windowEnd = Math.min(levelCount, level + window + 1); levelNext < windowEnd; levelNext++) {
                    while (queueEnd > queueFirst && previous[queue[queueEnd - 1]] > previous[levelNext]) {
                        queueEnd -= 1;
                    }
                    queue[queueEnd] = levelNext;
                    queueEnd += 1;
                }
                if (queue[queueFirst] < level - window) {
                    queueFirst += 1;
                }
                const levelMin = queue[queueFirst];
                back[cell + level] = previous[levelMin] === Infinity ? level - window : levelMin;
                total[level] = previous[levelMin] + stationCost(ix, level);
            }

            // The grade limit can't reach the existing road's ground? Within a depth limit, a deeper limit may - with no
            // limit, it's the profile's unreachable station, and there's no profile.
            if (isExisting[ix] && total[groundLevel[ix]] === Infinity) {
                unreachable = depthLimit === Infinity ? ix : null;
                return null;
            }
        }

        // The last station is at the level nearest its ground - or, if the grade limits can't reach it, the nearest
        // level they can
        let endLevel = argMin(levels.map((level) => Math.abs(level - ground[last])));
        if (total[endLevel] === Infinity) {
            endLevel = argMin(levels.map((level, ix) => Math.abs((total[ix] === Infinity ? Infinity : level) - ground[last])));
        }

        // The grade limits can't keep the profile within the depth limit?
        if (depthLimit !== Infinity && total[endLevel] === Infinity) {
            return null;
        }

        // Trace the profile's levels, and compute its true cost - the cost of its cut and fill balance
        const path = new Int32Array(count);
        path[last] = endLevel;
        for (let ix = last; ix > 0; ix--) {
            path[ix - 1] = back[cells[ix] - levelFirst[ix] + path[ix]];
        }
        const pathSum = (valueFn) => {
            const values = new Float64Array(count);
            for (let ix = 0; ix < count; ix++) {
                values[ix] = valueFn(ix, path[ix]);
            }
            return pairwiseSum(values);
        };
        const pathSection = (member) => (ix, level) => {
            // An existing road has no earthwork
            if (isExisting[ix]) {
                return 0;
            }
            stationSection(ix, level);
            return section[member];
        };
        const cut = pathSum(pathSection(sectionCut)) * ds;
        const fill = pathSum(pathSection(sectionFill)) * ds;
        const supply = cut * design.shrink;
        const cost = pathSum(stationCost) - balance * (fill - supply) + Math.max(0, fill - supply) * design.costBorrow +
            Math.max(0, supply - fill) * design.costWaste;
        return [cost, path];
    };

    // Balance cut and fill - try several balance prices and keep the lowest true cost
    let best = null;
    for (const balance of [0, design.costBorrow * 0.5, design.costBorrow, -design.costWaste * 0.5, -design.costWaste]) {
        const result = solve(balance);
        if (result === null) {
            return unreachable !== null ? {'profile': null, ground, sideSlope, unreachable} : null;
        }
        if (best === null || result[0] < best[0]) {
            best = result;
        }
    }
    const profile = Float64Array.from(best[1], (level) => levels[level]);
    for (let ix = 0; ix < count; ix++) {
        if (isExisting[ix]) {
            profile[ix] = ground[ix];
        }
    }

    // Vertical curves - a moving average preserves the grade limits (an odd reflection at the ends keeps the end
    // elevations and the grades). Each new section of the road is smoothed by itself, from the existing road's station
    // before it to the existing road's station after it - so it meets the existing road's ground at its junctions.
    const half = pyRound((design.feet ? 50 : 15) / ds);
    for (let first = 0, end = 1; first < count; first = end, end += 1) {
        if (!isExisting[first]) {
            while (end < count && !isExisting[end]) {
                end += 1;
            }
            const curveFirst = Math.max(0, first - 1);
            const curve = profile.subarray(curveFirst, Math.min(count, end + 1));
            const curveLast = curve.length - 1;
            if (half > 0 && curveLast > 2 * half) {
                const padded = new Float64Array(curve.length + 2 * half);
                for (let ix = 0; ix < half; ix++) {
                    padded[ix] = 2 * curve[0] - curve[half - ix];
                    padded[half + curve.length + ix] = 2 * curve[curveLast] - curve[curveLast - 1 - ix];
                }
                padded.set(curve, half);
                profile.set(movingAverage(padded, half), curveFirst);
            }
        }
    }
    for (let ix = 0; ix < count; ix++) {
        if (isExisting[ix]) {
            profile[ix] = ground[ix];
        }
    }
    return {profile, ground, sideSlope, 'unreachable': null};
}
