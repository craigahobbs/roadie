// design.js - the road engineering's design parameters and unit costs, ground model, and cross sections (a port of the
// Python planning tools')

import {defaultRates, elevation, linearAreas, pointInPolygon, polygonIndex, unitScale} from '../../viewer/lib/model.js';


// Create the road design parameters and unit costs (per plan unit) of a plan and the route and profile commands'
// arguments: "grade" and "switchbackGrade" (percent), "width", "surface", "cutSlope", "fillSlope", "turnouts", and
// "bridgeFill". The grade, width, turnouts, and bridge fill arguments may be null.
export function createDesign(plan, args) {
    const feet = plan.units === 'feet';
    const criteria = plan.criteria ?? {};
    const maxGrade = (criteria.maxGrade ?? 12) / 100;
    const grade = args.grade ? args.grade / 100 : Math.max(maxGrade - 0.01, maxGrade * 0.9);
    const width = args.width ? args.width : (feet ? 14 : 4.3);
    const rates = {...defaultRates, ...plan.costRates};
    const scale = unitScale(plan);
    const scale2 = scale * scale;
    const scale3 = scale2 * scale;
    const clearing = rates.clearing + rates.erosionControl;

    return {
        feet,
        grade,
        'switchbackGrade': Math.min(args.switchbackGrade / 100, grade),
        'minRadius': criteria.minRadius ?? (feet ? 50 : 15),
        'rockCutSlope': criteria.rockCutSlope ?? 0.5,
        width,
        'halfWidth': width * 0.5,
        'surface': args.surface,
        'cutSlope': args.cutSlope,
        'fillSlope': args.fillSlope,

        // The least distance between an alignment's stations - a fine topography grid's alignment isn't finer
        'stationInterval': feet ? 5 : 1.5,

        // Unit costs per plan unit
        'costCut': rates.excavation * scale3,
        'costRock': rates.rockExcavation * scale3,
        'costFill': rates.embankment * scale3,
        'costBorrow': rates.borrow * scale3,
        'costWaste': rates.waste * scale3,
        'costArea': clearing * scale2,
        'costWall': rates.retainingWall * scale2,
        'costLength': width * (rates[args.surface] + rates.clearing + rates.erosionControl) * scale2 + rates.drainage * scale,
        'costCulvert': rates.culvertEnds + rates.culvert * (feet ? 1.5 * scale : 0.45) * scale * width * 3,
        'costExisting': width * rates.existingRoad * scale2,
        'shrink': rates.shrink,

        // Turnouts - a single-lane road has them
        'turnoutSpacing': args.turnouts ?? (width < (feet ? 16 : 4.9) ? (feet ? 400 : 120) : 0),
        'bridgeFill': args.bridgeFill,
        'tieTolerance': feet ? 1 : 0.3
    };
}


// Get the ground elevation at a point - a point outside the topography grid has the elevation of the grid's nearest
// point
export function groundElevation(topo, x, y) {
    return elevation(topo, Math.max(0, Math.min(topo.width, x)), Math.max(0, Math.min(topo.height, y)));
}


// Get the ground elevation gradient [dz/dx, dz/dy] at a point
export function groundGradient(topo, x, y) {
    const half = topo.spacing * 0.5;
    const x1 = Math.max(0, x - half);
    const x2 = Math.min(topo.width, x + half);
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(topo.height, y + half);
    return [
        (groundElevation(topo, x2, y) - groundElevation(topo, x1, y)) / Math.max(x2 - x1, 1e-9),
        (groundElevation(topo, x, y2) - groundElevation(topo, x, y1)) / Math.max(y2 - y1, 1e-9)
    ];
}


// Get the topography's polygon features of a type, indexed for point-in-polygon tests (see pointInPolygons)
export function featurePolygons(topo, featureType) {
    return topo.features.filter((feature) => feature.type === featureType).map((feature) => polygonIndex(feature.points));
}


// Determine if a point is inside any of the indexed polygons
export function pointInPolygons(x, y, polygons) {
    for (const polygon of polygons) {
        if (pointInPolygon(x, y, polygon)) {
            return true;
        }
    }
    return false;
}


// Get the topography's stream features - objects with the stream's "name" and "points"
export function featureStreams(topo) {
    return topo.features.filter((feature) => feature.type === 'stream').map(
        (feature) => ({'name': feature.name ?? 'stream', 'points': feature.points})
    );
}


// Determine if the segments from (x1, y1) to (x2, y2) and from (x3, y3) to (x4, y4) intersect - returns the fraction
// along the first segment, or null
export function segmentIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const ex = x4 - x3;
    const ey = y4 - y3;
    const denom = dx * ey - dy * ex;
    const fraction1 = ((x3 - x1) * ey - (y3 - y1) * ex) / denom;
    const fraction2 = ((x3 - x1) * dy - (y3 - y1) * dx) / denom;
    return denom !== 0 && fraction1 >= 0 && fraction1 <= 1 && fraction2 >= 0 && fraction2 <= 1 ? fraction1 : null;
}


// Compute one side of a road cross section beyond the road edge - "depth" is the ground elevation minus the grade
// elevation at the road edge (positive is cut), and "rise" is the ground's rise per unit of outward offset. A slope
// that doesn't daylight (meet the ground) is a retaining wall. The side's cut area, fill area, slope width, and wall
// height are written to the "out" array from the "offset" index.
function sideSection(depth, rise, cutSlope, fillSlope, out, offset) {
    const cutApproach = 1 / cutSlope - rise;
    const fillApproach = rise + 1 / fillSlope;
    const cutDaylight = depth > 0 && cutApproach > 1e-6;
    const fillDaylight = depth < 0 && fillApproach > 1e-6;
    const cutOffset = cutDaylight ? depth / cutApproach : 0;
    const fillOffset = fillDaylight ? -depth / fillApproach : 0;
    out[offset] = cutDaylight ? depth * cutOffset * 0.5 : 0;
    out[offset + 1] = fillDaylight ? -depth * fillOffset * 0.5 : 0;
    out[offset + 2] = cutOffset + fillOffset;
    out[offset + 3] = (depth > 0 && !cutDaylight) || (depth < 0 && !fillDaylight) ? Math.abs(depth) : 0;
}


// The road cross section's values' indexes in its array (see crossSection)
export const sectionCut = 0;
export const sectionFill = 1;
export const sectionSlopeWidth = 2;
export const sectionWall = 3;
export const sectionWallLeft = 4;
export const sectionWallRight = 5;


// The sides of a road cross section - each side's cut area, fill area, slope width, and wall height
const sides = new Float64Array(8);
const sideWall = 3;


// Compute a road cross section - "depth" is the ground elevation minus the grade elevation at the centerline (positive
// is cut), and "slope" is the ground's rise per unit of offset to the left. The cross section's cut area, fill area,
// slope width, wall height, left wall height, and right wall height are written to the "out" array. This is the
// viewer's cross section, except that a slope that doesn't daylight is a retaining wall.
export function crossSection(depth, slope, halfWidth, cutSlope, fillSlope, out) {
    const depthLeft = depth + slope * halfWidth;
    const depthRight = depth - slope * halfWidth;
    const roadAreas = linearAreas(depthRight, depthLeft, 2 * halfWidth);
    sideSection(depthLeft, slope, cutSlope, fillSlope, sides, 0);
    sideSection(depthRight, -slope, cutSlope, fillSlope, sides, 4);
    out[sectionCut] = roadAreas[0] + sides[0] + sides[4];
    out[sectionFill] = roadAreas[1] + sides[1] + sides[5];
    out[sectionSlopeWidth] = sides[2] + sides[6];
    out[sectionWall] = sides[3] + sides[7];
    out[sectionWallLeft] = sides[sideWall];
    out[sectionWallRight] = sides[sideWall + 4];
    return out;
}
