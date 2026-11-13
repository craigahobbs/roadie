// profile.js - the road's vertical profile design (a port of the Python planning tools')

import {arange, hypot, movingAverage, pairwiseSum, pyRound} from './numeric.js';
import {crossSection, featurePolygons, groundElevation, groundGradient, pointInPolygons, sectionCut, sectionFill, sectionSlopeWidth,
    sectionWall} from './design.js';
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


// Design the vertical profile of an alignment (its "x" and "y" coordinate arrays and their evenly-spaced "stations") by
// dynamic programming - the minimum earthwork cost within the grade limits. Within an existing road (the "existing"
// station mask, or null), the profile follows the ground. Returns the "profile" (the grade elevations), the "ground"
// elevations, and the ground's "sideSlope" (its rise per unit of offset to the left) at the stations.
export function designProfile(topo, design, x, y, stations, existing = null) {
    const count = x.length;
    const last = count - 1;
    const ds = stations[1] - stations[0];
    const isExisting = existing ?? new Uint8Array(count);
    const rocks = featurePolygons(topo, 'rock');

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
    const maxDepth = design.feet ? 60 : 18;
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

    // The cross sections at every station and level - the cut and fill areas, and the slope and wall costs
    const sectionCuts = new Float64Array(count * levelCount);
    const sectionFills = new Float64Array(count * levelCount);
    const slopeCosts = new Float64Array(count * levelCount);
    const wallCosts = new Float64Array(count * levelCount);
    const section = new Float64Array(6);
    for (let ix = 0; ix < count; ix++) {
        for (let level = 0; level < levelCount; level++) {
            const cell = ix * levelCount + level;
            crossSection(ground[ix] - levels[level], sideSlope[ix], design.halfWidth, cutSlope[ix], design.fillSlope, section);
            sectionCuts[cell] = section[sectionCut];
            sectionFills[cell] = section[sectionFill];
            slopeCosts[cell] = section[sectionSlopeWidth] * design.costArea;
            wallCosts[cell] = section[sectionWall] * design.costWall;
        }
    }

    // Find the least-cost profile for a cut and fill balance price - a positive balance makes fill more expensive and
    // cut cheaper (to reduce borrow), and a negative balance the reverse. Returns the profile's true cost and its
    // levels' indexes.
    const back = new Int32Array(count * levelCount);
    const queue = new Int32Array(levelCount);
    const solve = (balance) => {
        // A station's cost at a level - an existing road is at the ground, with no earthwork
        const stationCost = (ix, level) => {
            if (isExisting[ix]) {
                return level === groundLevel[ix] ? 0 : Infinity;
            }
            const cell = ix * levelCount + level;
            return ds * (
                sectionCuts[cell] * (cutUnit[ix] - balance * design.shrink) + sectionFills[cell] * (design.costFill + balance) +
                slopeCosts[cell] + wallCosts[cell]
            );
        };

        // The first station is at the level nearest its ground
        let total = new Float64Array(levelCount).fill(Infinity);
        const startLevel = argMin(levels.map((level) => Math.abs(level - ground[0])));
        total[startLevel] = stationCost(0, startLevel);
        for (let ix = 1; ix < count; ix++) {
            const previous = total;
            total = new Float64Array(levelCount);

            // Within an existing road (or where the grade limit can't reach one), any grade
            if (isExisting[ix] && (isExisting[ix - 1] || previous.every((cost) => cost === Infinity))) {
                const ixMin = argMin(previous);
                for (let level = 0; level < levelCount; level++) {
                    back[ix * levelCount + level] = ixMin;
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
            let levelNext = 0;
            for (let level = 0; level < levelCount; level++) {
                for (const levelEnd = Math.min(levelCount, level + window + 1); levelNext < levelEnd; levelNext++) {
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
                back[ix * levelCount + level] = previous[levelMin] === Infinity ? level - window : levelMin;
                total[level] = previous[levelMin] + stationCost(ix, level);
            }

            // The grade limit can't reach the existing road's ground? Break grade at the junction.
            const level = groundLevel[ix];
            if (isExisting[ix] && total[level] === Infinity) {
                const ixMin = argMin(previous);
                back[ix * levelCount + level] = ixMin;
                total[level] = previous[ixMin] + stationCost(ix, level);
            }
        }

        // The last station is at the level nearest its ground - or, if the grade limits can't reach it, the nearest
        // level they can
        let endLevel = argMin(levels.map((level) => Math.abs(level - ground[last])));
        if (total[endLevel] === Infinity) {
            endLevel = argMin(levels.map((level, ix) => Math.abs((total[ix] === Infinity ? Infinity : level) - ground[last])));
        }

        // Trace the profile's levels, and compute its true cost - the cost of its cut and fill balance
        const path = new Int32Array(count);
        path[last] = endLevel;
        for (let ix = last; ix > 0; ix--) {
            path[ix - 1] = back[ix * levelCount + path[ix]];
        }
        const pathSum = (valueFn) => {
            const values = new Float64Array(count);
            for (let ix = 0; ix < count; ix++) {
                values[ix] = valueFn(ix, path[ix]);
            }
            return pairwiseSum(values);
        };
        const cut = pathSum((ix, level) => sectionCuts[ix * levelCount + level]) * ds;
        const fill = pathSum((ix, level) => sectionFills[ix * levelCount + level]) * ds;
        const supply = cut * design.shrink;
        const cost = pathSum(stationCost) - balance * (fill - supply) + Math.max(0, fill - supply) * design.costBorrow +
            Math.max(0, supply - fill) * design.costWaste;
        return [cost, path];
    };

    // Balance cut and fill - try several balance prices and keep the lowest true cost
    let best = null;
    for (const balance of [0, design.costBorrow * 0.5, design.costBorrow, -design.costWaste * 0.5, -design.costWaste]) {
        const result = solve(balance);
        if (best === null || result[0] < best[0]) {
            best = result;
        }
    }
    let profile = Float64Array.from(best[1], (level) => levels[level]);

    // Vertical curves - a moving average preserves the grade limits (an odd reflection at the ends keeps the end
    // elevations and the grades)
    const half = pyRound((design.feet ? 50 : 15) / ds);
    if (half > 0 && count > 2 * half + 1) {
        const padded = new Float64Array(count + 2 * half);
        for (let ix = 0; ix < half; ix++) {
            padded[ix] = 2 * profile[0] - profile[half - ix];
            padded[half + count + ix] = 2 * profile[last] - profile[last - 1 - ix];
        }
        padded.set(profile, half);
        profile = movingAverage(padded, half);
    }
    for (let ix = 0; ix < count; ix++) {
        if (isExisting[ix]) {
            profile[ix] = ground[ix];
        }
    }
    return {profile, ground, sideSlope};
}
