// model.js - the road grading plan model: schema, validation, earthwork, and cost analysis

import {fixed, fixedTrim, station as formatStation, unitLabel} from './format.js';
import {schemaParse, schemaValidate} from './schema.js';


// The road grading plan model's Schema Markdown type model
export const roadieTypes = schemaParse([
    '# A road grading plan model. A plan contains the site topography, the road start and end points, and',
    '# one or more road plan options. All lengths and elevations are in the plan\'s units.',
    'struct RoadPlan',
    '',
    '    # The plan title',
    '    string(len > 0) title',
    '',
    '    # The plan description Markdown text lines',
    '    optional string[] description',
    '',
    '    # The source topographic map image URL, relative to the plan JSON file',
    '    optional string(len > 0) image',
    '',
    '    # The unit of all lengths and elevations',
    '    Units units',
    '',
    '    # The site topography',
    '    Topography topography',
    '',
    '    # The road start point',
    '    Point start',
    '',
    '    # The road end point',
    '    Point end',
    '',
    '    # The road design criteria',
    '    optional DesignCriteria criteria',
    '',
    '    # The cost rate overrides',
    '    optional CostRates costRates',
    '',
    '    # The road plan options',
    '    RoadOption[len > 0] options',
    '',
    '',
    '# A linear unit',
    'enum Units',
    '    feet',
    '    meters',
    '',
    '',
    '# A site topography elevation grid. The grid\'s southwest corner is the origin of the plan\'s',
    '# coordinate system - "x" increases to the east and "y" increases to the north.',
    'struct Topography',
    '',
    '    # The distance between adjacent grid points',
    '    float(> 0) spacing',
    '',
    '    # The elevation grid rows, ordered north to south (top to bottom of the map). Each row\'s',
    '    # elevations are ordered west to east. The elevation at row "r" and column "c" is located at',
    '    # x = c * spacing and y = (rowCount - 1 - r) * spacing.',
    '    ElevationRow[len > 1] elevations',
    '',
    '    # The contour interval for display (default is computed from the elevation range)',
    '    optional float(> 0) contourInterval',
    '',
    '    # The site\'s topographic features',
    '    optional Feature[] features',
    '',
    '',
    '# A row of grid elevations, west to east',
    'typedef float[len > 1] ElevationRow',
    '',
    '',
    '# A point in plan coordinates',
    'struct Point',
    '',
    '    # The east coordinate',
    '    float x',
    '',
    '    # The north coordinate',
    '    float y',
    '',
    '    # The point label',
    '    optional string(len > 0) label',
    '',
    '',
    '# A topographic feature',
    'struct Feature',
    '',
    '    # The feature type',
    '    FeatureType type',
    '',
    '    # The feature\'s polyline (stream) or polygon (rock, exclusion) points',
    '    Point[len > 1] points',
    '',
    '    # The feature name',
    '    optional string(len > 0) name',
    '',
    '',
    '# A topographic feature type',
    'enum FeatureType',
    '',
    '    # A stream, drainage, or water course polyline - road crossings need a culvert or bridge',
    '    stream',
    '',
    '    # A rock outcrop polygon - excavation within it is rock excavation',
    '    rock',
    '',
    '    # An area polygon the road must avoid (building, wetland, property line, etc.)',
    '    exclusion',
    '',
    '',
    '# The road design criteria',
    'struct DesignCriteria',
    '',
    '    # The maximum road grade, in percent (default is 12)',
    '    optional float(> 0) maxGrade',
    '',
    '    # The minimum centerline curve radius (default is 50 feet / 15 meters)',
    '    optional float(> 0) minRadius',
    '',
    '    # The rock cut slope ratio, horizontal run per unit of vertical rise (default is 0.5)',
    '    optional float(> 0) rockCutSlope',
    '',
    '    # The maximum retaining wall height (default is 20 feet / 6 meters)',
    '    optional float(> 0) maxWallHeight',
    '',
    '',
    '# Cost rate overrides, in nominal US dollars per metric unit',
    'struct CostRates',
    '',
    '    # Clearing and grubbing, per square meter of disturbed area',
    '    optional float(>= 0) clearing',
    '',
    '    # Common excavation, per cubic meter (bank measure)',
    '    optional float(>= 0) excavation',
    '',
    '    # Rock excavation, per cubic meter (bank measure)',
    '    optional float(>= 0) rockExcavation',
    '',
    '    # Embankment placement and compaction, per cubic meter',
    '    optional float(>= 0) embankment',
    '',
    '    # Imported borrow fill, per cubic meter',
    '    optional float(>= 0) borrow',
    '',
    '    # Excess excavation disposal, per cubic meter',
    '    optional float(>= 0) waste',
    '',
    '    # Overhaul beyond the free haul distance, per cubic meter-kilometer',
    '    optional float(>= 0) overhaul',
    '',
    '    # The free haul distance, in meters',
    '    optional float(>= 0) freeHaul',
    '',
    '    # The compacted fill volume per unit of common excavation (shrinkage)',
    '    optional float(> 0) shrink',
    '',
    '    # The compacted fill volume per unit of rock excavation (swell)',
    '    optional float(> 0) swell',
    '',
    '    # Native surface finish grading, per square meter',
    '    optional float(>= 0) native',
    '',
    '    # Aggregate surfacing, per square meter',
    '    optional float(>= 0) gravel',
    '',
    '    # Asphalt paving, per square meter',
    '    optional float(>= 0) asphalt',
    '',
    '    # Concrete paving, per square meter',
    '    optional float(>= 0) concrete',
    '',
    '    # Roadside ditches and cross drains, per meter of road',
    '    optional float(>= 0) drainage',
    '',
    '    # Culvert pipe, per meter of length per meter of diameter',
    '    optional float(>= 0) culvert',
    '',
    '    # Culvert inlet and outlet treatment, per culvert',
    '    optional float(>= 0) culvertEnds',
    '',
    '    # Retaining wall, per square meter of wall face',
    '    optional float(>= 0) retainingWall',
    '',
    '    # Bridge, per square meter of deck',
    '    optional float(>= 0) bridge',
    '',
    '    # Existing road upgrade (reshaping, a gravel lift, ditch cleaning, and minor widening), per square meter of road',
    '    optional float(>= 0) existingRoad',
    '',
    '    # Erosion control and revegetation, per square meter of disturbed area',
    '    optional float(>= 0) erosionControl',
    '',
    '    # Mobilization, as a fraction of the other costs',
    '    optional float(>= 0) mobilization',
    '',
    '',
    '# A road plan option',
    'struct RoadOption',
    '',
    '    # The option name',
    '    string(len > 0) name',
    '',
    '    # The option description Markdown text lines',
    '    optional string[] description',
    '',
    '    # The road cross section',
    '    RoadSection section',
    '',
    '    # The road centerline alignment points, from the start point to the end point. Curves are',
    '    # represented by closely-spaced points.',
    '    AlignmentPoint[len > 1] alignment',
    '',
    '    # The special engineering structures',
    '    optional Structure[] structures',
    '',
    '',
    '# A road cross section',
    'struct RoadSection',
    '',
    '    # The finished road width, including shoulders',
    '    float(> 0) width',
    '',
    '    # The cut slope ratio, horizontal run per unit of vertical rise (default is 1)',
    '    optional float(> 0) cutSlope',
    '',
    '    # The fill slope ratio, horizontal run per unit of vertical drop (default is 1.5)',
    '    optional float(> 0) fillSlope',
    '',
    '    # The road surface (default is "gravel")',
    '    optional Surface surface',
    '',
    '',
    '# A road surface type',
    'enum Surface',
    '    native',
    '    gravel',
    '    asphalt',
    '    concrete',
    '',
    '',
    '# A road centerline alignment point',
    'struct AlignmentPoint',
    '',
    '    # The east coordinate',
    '    float x',
    '',
    '    # The north coordinate',
    '    float y',
    '',
    '    # The finished grade elevation of the centerline (default is the ground elevation)',
    '    optional float z',
    '',
    '',
    '# A special engineering structure. Stations are distances along the road centerline from the',
    '# first alignment point.',
    'struct Structure',
    '',
    '    # The structure type',
    '    StructureType type',
    '',
    '    # The structure\'s station (starting station for walls, bridges, turnouts, and existing roads)',
    '    float(>= 0) station',
    '',
    '    # The structure\'s ending station (required for walls, bridges, turnouts, and existing roads)',
    '    optional float(>= 0) endStation',
    '',
    '    # The side of the road, facing from the start toward the end (walls and turnouts, default',
    '    # is "both" for walls and "right" for turnouts)',
    '    optional Side side',
    '',
    '    # The culvert pipe diameter (default is 1.5 feet / 0.45 meters)',
    '    optional float(> 0) diameter',
    '',
    '    # The structure name',
    '    optional string(len > 0) name',
    '',
    '',
    '# A special engineering structure type',
    'enum StructureType',
    '',
    '    # A retaining wall supports a fill or cut where the side slope is too steep to daylight',
    '    retainingWall',
    '',
    '    # A bridge spans a stream or ravine - there is no earthwork within the span',
    '    bridge',
    '',
    '    # A culvert carries a stream or ditch water under the road',
    '    culvert',
    '',
    '    # A turnout widens a single-lane road for passing (10 feet / 3 meters)',
    '    turnout',
    '',
    '    # The option follows an existing road - it\'s costed at the existing road upgrade rate, with no earthwork or',
    '    # clearing. Its as-built grade follows the ground (alignment elevations within it are ignored), and its grade,',
    '    # curves, and stream crossings aren\'t checked.',
    '    existingRoad',
    '',
    '',
    '# A side of the road',
    'enum Side',
    '    left',
    '    right',
    '    both'
]);


// The default cost rates, in nominal US dollars per metric unit
const defaultRates = {
    'clearing': 2,
    'excavation': 20,
    'rockExcavation': 100,
    'embankment': 6.5,
    'borrow': 26,
    'waste': 10,
    'overhaul': 2.5,
    'freeHaul': 150,
    'shrink': 0.87,
    'swell': 1.1,
    'native': 1.5,
    'gravel': 19,
    'asphalt': 40,
    'concrete': 90,
    'drainage': 45,
    'culvert': 875,
    'culvertEnds': 6000,
    'retainingWall': 650,
    'bridge': 2700,
    'existingRoad': 13,
    'erosionControl': 0.75,
    'mobilization': 0.1
};


// The meters per foot
const metersPerFoot = 0.3048


// Get the meters per plan unit
function unitScale(plan) {
    return plan.units === 'feet' ? metersPerFoot : 1;
}


// Get a length in plan units from a length in meters ("feet" value for feet plans)
export function unitLength(plan, meters, feet) {
    return plan.units === 'feet' ? feet : meters;
}


// Get a culvert structure's pipe diameter (default is 1.5 feet / 0.45 meters)
export function culvertDiameter(units, structure) {
    return structure.diameter ?? (units === 'feet' ? 1.5 : 0.45);
}


// Validate a road plan model - returns an object with "plan" on success, or "error" on failure
export function validatePlan(planValue) {
    const validated = schemaValidate(roadieTypes, 'RoadPlan', planValue);
    if ('error' in validated) {
        return {'error': validated.error};
    }
    const plan = validated.result;

    // Elevation rows must all be the same length
    const rows = plan.topography.elevations;
    const nCols = rows[0].length;
    for (let ixRow = 0; ixRow < rows.length; ixRow++) {
        if (rows[ixRow].length !== nCols) {
            return {'error': `Elevation row ${ixRow} has ${rows[ixRow].length} elevations, expected ${nCols}`};
        }
    }

    // Structure ranges
    for (const option of plan.options) {
        for (const structure of option.structures ?? []) {
            const {type} = structure;
            if (type !== 'culvert') {
                const endStation = structure.endStation ?? null;
                if (endStation === null || endStation <= structure.station) {
                    return {'error': `Option "${option.name}" ${type} at station ${structure.station} ` +
                        'requires an endStation greater than its station'};
                }
            }
        }
    }

    return {plan};
}


// Get the plan's design criteria, with defaults, in plan units
export function planCriteria(plan) {
    const criteria = plan.criteria ?? {};
    return {
        'maxGrade': criteria.maxGrade ?? 12,
        'minRadius': criteria.minRadius ?? unitLength(plan, 15, 50),
        'rockCutSlope': criteria.rockCutSlope ?? 0.5,
        'maxWallHeight': criteria.maxWallHeight ?? unitLength(plan, 6, 20)
    };
}


// Get the plan's cost rates, with defaults
function planRates(plan) {
    return {...defaultRates, ...plan.costRates};
}


//
// Topography
//


// Create a topography grid object from a plan
export function planTopo(plan) {
    const {topography} = plan;
    const rows = topography.elevations;
    const {spacing} = topography;
    const nRows = rows.length;
    const nCols = rows[0].length;

    // Compute the elevation range
    let minZ = rows[0][0];
    let maxZ = minZ;
    for (const row of rows) {
        for (const z of row) {
            if (z < minZ) {
                minZ = z;
            } else if (z > maxZ) {
                maxZ = z;
            }
        }
    }

    return {
        rows,
        spacing,
        nRows,
        nCols,
        'width': (nCols - 1) * spacing,
        'height': (nRows - 1) * spacing,
        minZ,
        maxZ,
        'features': topography.features ?? []
    };
}


// Get the ground elevation at a point (bilinear interpolation), or null if outside the grid
export function elevation(topo, x, y) {
    const {spacing} = topo;
    const tolerance = spacing * 1e-6;
    if (x < -tolerance || y < -tolerance || x > topo.width + tolerance || y > topo.height + tolerance) {
        return null;
    }
    const {nRows, nCols} = topo;
    const fCol = x / spacing;
    const fRow = (nRows - 1) - y / spacing;
    const col = Math.max(0, Math.min(nCols - 2, Math.floor(fCol)));
    const row = Math.max(0, Math.min(nRows - 2, Math.floor(fRow)));
    const tx = Math.max(0, Math.min(1, fCol - col));
    const ty = Math.max(0, Math.min(1, fRow - row));
    const rowTop = topo.rows[row];
    const rowBottom = topo.rows[row + 1];
    const zTop = rowTop[col] * (1 - tx) + rowTop[col + 1] * tx;
    const zBottom = rowBottom[col] * (1 - tx) + rowBottom[col + 1] * tx;
    return zTop * (1 - ty) + zBottom * ty;
}


// Get the ground elevation gradient [dz/dx, dz/dy] at a point within the grid
export function gradient(topo, x, y) {
    const h = topo.spacing * 0.5;
    const {width, height} = topo;
    const x1 = Math.max(0, x - h);
    const x2 = Math.min(width, x + h);
    const y1 = Math.max(0, y - h);
    const y2 = Math.min(height, y + h);
    const yc = Math.max(0, Math.min(height, y));
    const xc = Math.max(0, Math.min(width, x));
    const dzdx = (elevation(topo, x2, yc) - elevation(topo, x1, yc)) / (x2 - x1);
    const dzdy = (elevation(topo, xc, y2) - elevation(topo, xc, y1)) / (y2 - y1);
    return [dzdx, dzdy];
}


// The number of horizontal bands of a polygon index
const polygonBands = 32;


// Create a polygon index for repeated point-in-polygon tests - the polygon's edges, as flat [x1, y1, x2, y2, ...]
// arrays, in the horizontal bands they span
function polygonIndex(points) {
    let minY = points[0].y;
    let maxY = minY;
    for (const point of points) {
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }
    const bandHeight = Math.max((maxY - minY) / polygonBands, 1e-9);
    const bands = [];
    while (bands.length < polygonBands) {
        bands.push([]);
    }
    let j = points.length - 1;
    for (let i = 0; i < points.length; i++) {
        const xi = points[i].x;
        const yi = points[i].y;
        const xj = points[j].x;
        const yj = points[j].y;
        let band = Math.min(polygonBands - 1, Math.floor((Math.min(yi, yj) - minY) / bandHeight));
        const bandLast = Math.min(polygonBands - 1, Math.floor((Math.max(yi, yj) - minY) / bandHeight));
        while (band <= bandLast) {
            bands[band].push(xi, yi, xj, yj);
            band += 1;
        }
        j = i;
    }
    return {minY, maxY, bandHeight, bands};
}


// Determine if a point is inside an indexed polygon (polygonIndex) by the even-odd rule - only the edges in the
// point's band can cross its horizontal ray
function pointInPolygon(x, y, index) {
    const {minY} = index;
    if (y < minY || y >= index.maxY) {
        return false;
    }
    const edges = index.bands[Math.min(polygonBands - 1, Math.floor((y - minY) / index.bandHeight))];
    let inside = false;
    for (let ixEdge = 0; ixEdge < edges.length; ixEdge += 4) {
        const yi = edges[ixEdge + 1];
        const yj = edges[ixEdge + 3];
        if ((yi > y) !== (yj > y)) {
            const xi = edges[ixEdge];
            if (x < (edges[ixEdge + 2] - xi) * (y - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
    }
    return inside;
}


// Compute the intersection of segments p1-p2 and p3-p4 - returns the fraction along p1-p2, or null
function segmentIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
    if (denom === 0) {
        return null;
    }
    const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / denom;
    const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) {
        return null;
    }
    return t;
}


// Compute the bounding box of points - [xMin, xMax, yMin, yMax]
function bounds(points, ixFirst = 0, ixEnd = points.length) {
    let xMin = points[ixFirst].x;
    let xMax = xMin;
    let yMin = points[ixFirst].y;
    let yMax = yMin;
    for (let ix = ixFirst; ix < ixEnd; ix++) {
        const point = points[ix];
        xMin = Math.min(xMin, point.x);
        xMax = Math.max(xMax, point.x);
        yMin = Math.min(yMin, point.y);
        yMax = Math.max(yMax, point.y);
    }
    return [xMin, xMax, yMin, yMax];
}


// Determine if a bounding box is entirely outside a box ([xMin, xMax, yMin, yMax])
export function outsideBox(box, xMin, xMax, yMin, yMax) {
    return xMax < box[0] || xMin > box[1] || yMax < box[2] || yMin > box[3];
}


//
// Cross sections
//


// Compute the positive and negative areas of a linearly-varying depth over a length
function linearAreas(v1, v2, length) {
    if (v1 >= 0 && v2 >= 0) {
        return [(v1 + v2) * 0.5 * length, 0];
    } else if (v1 <= 0 && v2 <= 0) {
        return [0, -(v1 + v2) * 0.5 * length];
    }
    const positive = Math.max(v1, v2);
    const negative = -Math.min(v1, v2);
    const lengthPositive = length * positive / (positive + negative);
    return [0.5 * positive * lengthPositive, 0.5 * negative * (length - lengthPositive)];
}


// Compute one side of a road cross section beyond the road edge.
//
// depth - the ground elevation minus the grade elevation at the road edge (positive is cut)
// rise - the ground's rise per unit of outward offset
//
// Returns the side object: "kind" is 'cut', 'fill', 'wall', or 'none'; "offset" is the slope's
// horizontal width beyond the road edge; "drop" is the slope's elevation change from the road edge to
// the daylight point; "wall" is the retaining wall height; "cut" and "fill" are the side's areas; and
// "daylight" is false if the slope does not meet the ground.
function sideSection(depth, rise, cutSlope, fillSlope, isWall) {
    if (isWall) {
        return {'kind': 'wall', 'offset': 0, 'drop': depth, 'wall': Math.abs(depth), 'cut': 0, 'fill': 0, 'daylight': true};
    } else if (depth > 0) {
        const approach = 1 / cutSlope - rise;
        const daylight = approach > 1e-6;
        const offset = daylight ? depth / approach : 3 * depth * cutSlope;
        const area = depth * offset - approach * offset * offset * 0.5;
        return {'kind': 'cut', offset, 'drop': offset / cutSlope, 'wall': 0, 'cut': area, 'fill': 0, daylight};
    } else if (depth < 0) {
        const approach = rise + 1 / fillSlope;
        const daylight = approach > 1e-6;
        const offset = daylight ? -depth / approach : -3 * depth * fillSlope;
        const area = -depth * offset - approach * offset * offset * 0.5;
        return {'kind': 'fill', offset, 'drop': -offset / fillSlope, 'wall': 0, 'cut': 0, 'fill': area, daylight};
    }
    return {'kind': 'none', 'offset': 0, 'drop': 0, 'wall': 0, 'cut': 0, 'fill': 0, 'daylight': true};
}


// Compute a road cross section.
//
// depth - the ground elevation minus the grade elevation at the centerline (positive is cut)
// slope - the ground's rise per unit of offset to the left
// halfWidth - half of the road width
//
// Returns the cross section object with total "cut" and "fill" areas and the "left" and "right" sides.
function crossSection(depth, slope, halfWidth, cutSlope, fillSlope, wallLeft, wallRight) {
    const depthLeft = depth + slope * halfWidth;
    const depthRight = depth - slope * halfWidth;
    const roadAreas = linearAreas(depthRight, depthLeft, 2 * halfWidth);
    const left = sideSection(depthLeft, slope, cutSlope, fillSlope, wallLeft);
    const right = sideSection(depthRight, -slope, cutSlope, fillSlope, wallRight);
    return {
        'cut': roadAreas[0] + left.cut + right.cut,
        'fill': roadAreas[1] + left.fill + right.fill,
        left,
        right
    };
}


//
// Road analysis
//


// Compute an option's alignment - point objects with "x", "y", "z", and "station". Within an existing road, the
// elevation is the ground's.
function optionAlignment(topo, option) {
    const existingRoads = structuresOfType(option, 'existingRoad');
    const points = [];
    let stationValue = 0;
    let prev = null;
    for (const point of option.alignment) {
        const {x, y} = point;
        if (prev !== null) {
            stationValue = stationValue + Math.sqrt((x - prev.x) ** 2 + (y - prev.y) ** 2);
        }
        let z = point.z ?? null;
        if (z === null || existingAt(existingRoads, stationValue)) {
            const ground = elevation(topo, x, y);
            z = ground !== null ? ground : (z !== null ? z : 0);
        }
        prev = {x, y, z, 'station': stationValue};
        points.push(prev);
    }
    return points;
}


// Get an option's structures of a type
function structuresOfType(option, type) {
    return (option.structures ?? []).filter((structure) => structure.type === type);
}


// Determine if a station is within an existing road (with a tolerance for sample stations' rounding)
function existingAt(existingRoads, stationValue) {
    for (const existingRoad of existingRoads) {
        if (stationValue >= existingRoad.station - 1e-6 && stationValue <= existingRoad.endStation + 1e-6) {
            return true;
        }
    }
    return false;
}


// Find the structures of a type covering a station
function structureAt(structures, type, stationValue, side) {
    for (const structure of structures) {
        if (structure.type === type && stationValue >= structure.station && stationValue <= (structure.endStation ?? structure.station)) {
            const structureSide = structure.side ?? 'both';
            if (side === null || structureSide === 'both' || structureSide === side) {
                return structure;
            }
        }
    }
    return null;
}


// The maximum number of cross section samples
const maxSamples = 2000;


// Compute an option's cross section samples
function optionSamples(plan, topo, option, alignment) {
    const {section} = option;
    const halfWidth = section.width * 0.5;
    const cutSlope = section.cutSlope ?? 1;
    const fillSlope = section.fillSlope ?? 1.5;
    const {rockCutSlope} = planCriteria(plan);
    // The bridges and walls (each sample looks them up, so the other structures are filtered out once)
    const bridges = structuresOfType(option, 'bridge');
    const walls = structuresOfType(option, 'retainingWall');
    const existingRoads = structuresOfType(option, 'existingRoad');
    const rockFeatures = [];
    for (const feature of topo.features) {
        if (feature.type === 'rock') {
            rockFeatures.push(polygonIndex(feature.points));
        }
    }

    // Compute the sample interval
    const length = alignment[alignment.length - 1].station;
    const count = Math.max(1, Math.min(maxSamples, Math.ceil(length / (topo.spacing / 3))));
    const interval = length / count;

    // Compute each sample
    const samples = [];
    let ixSegment = 0;
    for (let ixSample = 0; ixSample <= count; ixSample++) {
        const stationValue = ixSample * interval;

        // Find the alignment segment containing the station
        while (ixSegment < alignment.length - 2 && alignment[ixSegment + 1].station < stationValue) {
            ixSegment += 1;
        }
        const p1 = alignment[ixSegment];
        const p2 = alignment[ixSegment + 1];
        const segmentLength = p2.station - p1.station;
        const t = segmentLength > 0 ? Math.max(0, Math.min(1, (stationValue - p1.station) / segmentLength)) : 0;
        const x = p1.x + (p2.x - p1.x) * t;
        const y = p1.y + (p2.y - p1.y) * t;
        const z = p1.z + (p2.z - p1.z) * t;
        const dx = segmentLength > 0 ? (p2.x - p1.x) / segmentLength : 1;
        const dy = segmentLength > 0 ? (p2.y - p1.y) / segmentLength : 0;

        // Ground elevation and cross slope (outside the grid, the ground is at grade)
        let ground = elevation(topo, x, y);
        const outside = ground === null;
        let slope = 0;
        if (outside) {
            ground = z;
        } else {
            const grad = gradient(topo, x, y);
            slope = -dy * grad[0] + dx * grad[1];
        }

        // Rock?
        let rock = false;
        for (const rockPoints of rockFeatures) {
            if (pointInPolygon(x, y, rockPoints)) {
                rock = true;
                break;
            }
        }

        // Compute the cross section - a bridge or an existing road has no earthwork
        const bridge = bridges.length > 0 && structureAt(bridges, 'bridge', stationValue, null) !== null;
        const existing = existingAt(existingRoads, stationValue);
        let section2;
        if (bridge || existing) {
            section2 = crossSection(0, 0, halfWidth, cutSlope, fillSlope, false, false);
        } else {
            section2 = crossSection(
                ground - z,
                slope,
                halfWidth,
                rock ? rockCutSlope : cutSlope,
                fillSlope,
                walls.length > 0 && structureAt(walls, 'retainingWall', stationValue, 'left') !== null,
                walls.length > 0 && structureAt(walls, 'retainingWall', stationValue, 'right') !== null
            );
        }

        samples.push({
            'station': stationValue,
            x,
            y,
            z,
            ground,
            dx,
            dy,
            slope,
            outside,
            rock,
            bridge,
            existing,
            'cut': section2.cut,
            'fill': section2.fill,
            'left': section2.left,
            'right': section2.right
        });
    }

    return samples;
}


// Add a warning for each run of samples matching a predicate
function runWarnings(warnings, samples, units, predicate, message) {
    let runStart = null;
    let runEnd = null;
    for (const sample of samples) {
        if (predicate(sample)) {
            runStart = runStart === null ? sample.station : runStart;
            runEnd = sample.station;
        } else if (runStart !== null) {
            warnings.push(`${message} from ${formatStation(runStart, units)} to ${formatStation(runEnd, units)}`);
            runStart = null;
        }
    }
    if (runStart !== null) {
        warnings.push(`${message} from ${formatStation(runStart, units)} to ${formatStation(runEnd, units)}`);
    }
}


function sampleNoDaylight(kind, sample) {
    return (sample.left.kind === kind && !sample.left.daylight) || (sample.right.kind === kind && !sample.right.daylight);
}


// The number of alignment segments in a stream crossing chunk (analyzeOption)
const crossingChunk = 16;


// Analyze a road plan option - compute its geometry, earthwork, structures, cost, and warnings
export function analyzeOption(plan, ixOption, topo) {
    const option = plan.options[ixOption];
    const {units} = plan;
    const scale = unitScale(plan);
    const criteria = planCriteria(plan);
    const rates = planRates(plan);
    const {section} = option;
    const {width} = section;
    const structures = option.structures ?? [];
    const existingRoads = structuresOfType(option, 'existingRoad');
    const alignment = optionAlignment(topo, option);
    const samples = optionSamples(plan, topo, option, alignment);
    const length = alignment[alignment.length - 1].station;
    const warnings = [];
    const lengthUnit = unitLabel(units, 'length');

    // Segment grades - an existing road's (as-built) grades aren't part of the maximum grade
    const grades = [];
    let maxGrade = 0;
    for (let ixPoint = 1; ixPoint < alignment.length; ixPoint++) {
        const point = alignment[ixPoint];
        const prev = alignment[ixPoint - 1];
        const run = point.station - prev.station;
        if (run > 0) {
            const grade = 100 * (point.z - prev.z) / run;
            const existing = existingAt(existingRoads, prev.station) && existingAt(existingRoads, point.station);
            grades.push({'station': prev.station, 'endStation': point.station, grade, existing});
            maxGrade = existing ? maxGrade : Math.max(maxGrade, Math.abs(grade));
        }
    }

    // Grade warnings (merge consecutive steep segments)
    let runStart = null;
    let runMax = 0;
    for (let ixGrade = 0; ixGrade < grades.length; ixGrade++) {
        const grade = grades[ixGrade];
        const steep = !grade.existing && Math.abs(grade.grade) > criteria.maxGrade + 1e-6;
        if (steep) {
            runStart = runStart === null ? grade.station : runStart;
            runMax = Math.max(runMax, Math.abs(grade.grade));
        }
        if (runStart !== null && (!steep || ixGrade === grades.length - 1)) {
            const runEnd = steep ? grade.endStation : grade.station;
            warnings.push(`Grade ${fixed(runMax, 1)}% exceeds the maximum grade (${fixedTrim(criteria.maxGrade, 1)}%) from ` +
                `${formatStation(runStart, units)} to ${formatStation(runEnd, units)}`);
            runStart = null;
            runMax = 0;
        }
    }

    // Curve radii
    let minRadius = null;
    let minRadiusStation = null;
    for (let ixPoint = 1; ixPoint < alignment.length - 1; ixPoint++) {
        const point = alignment[ixPoint];
        if (!existingAt(existingRoads, point.station)) {
            const pa = alignment[ixPoint - 1];
            const pc = alignment[ixPoint + 1];
            const ax = pa.x;
            const ay = pa.y;
            const bx = point.x;
            const by = point.y;
            const cx = pc.x;
            const cy = pc.y;
            const cross = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
            if (cross > 1e-9) {
                const lenAB = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
                const lenBC = Math.sqrt((cx - bx) ** 2 + (cy - by) ** 2);
                const lenAC = Math.sqrt((cx - ax) ** 2 + (cy - ay) ** 2);
                const radius = lenAB * lenBC * lenAC / (2 * cross);
                if (minRadius === null || radius < minRadius) {
                    minRadius = radius;
                    minRadiusStation = point.station;
                }
            }
        }
    }
    if (minRadius !== null && minRadius < criteria.minRadius) {
        warnings.push(`Curve radius ${fixed(minRadius, 0)} ${lengthUnit} at ${formatStation(minRadiusStation, units)} ` +
            `is less than the minimum radius (${fixed(criteria.minRadius, 0)} ${lengthUnit})`);
    }

    // Start and end points
    const tolerance = Math.max(width, topo.spacing);
    const first = alignment[0];
    const last = alignment[alignment.length - 1];
    for (const [name, planPoint, alignPoint] of [['start', plan.start, first], ['end', plan.end, last]]) {
        const distance = Math.sqrt((planPoint.x - alignPoint.x) ** 2 + (planPoint.y - alignPoint.y) ** 2);
        if (distance > tolerance) {
            warnings.push(`The alignment ${name} is ${fixed(distance, 0)} ${lengthUnit} from the plan ${name} point`);
        }

        // The road must tie in to the ground at its ends
        const ground = elevation(topo, alignPoint.x, alignPoint.y);
        if (ground !== null && Math.abs(alignPoint.z - ground) > unitLength(plan, 0.3, 1)) {
            warnings.push(`The road grade at the ${name} is ${fixed(Math.abs(alignPoint.z - ground), 1)} ${lengthUnit}` +
                `${alignPoint.z > ground ? ' above' : ' below'} the ground`);
        }
    }

    // Sample warnings
    const exclusions = [];
    for (const feature of topo.features) {
        if (feature.type === 'exclusion') {
            exclusions.push(polygonIndex(feature.points));
        }
    }
    runWarnings(warnings, samples, units, (sample) => sample.outside, 'The road is outside the topography');
    runWarnings(warnings, samples, units, (sample) => exclusions.some((exclusion) => pointInPolygon(sample.x, sample.y, exclusion)),
        'The road crosses an exclusion area');
    runWarnings(warnings, samples, units, (sample) => sampleNoDaylight('fill', sample),
        'The fill slope does not daylight (retaining wall needed)');
    runWarnings(warnings, samples, units, (sample) => sampleNoDaylight('cut', sample),
        'The cut slope does not daylight (retaining wall needed)');
    runWarnings(warnings, samples, units, (sample) => Math.max(sample.left.wall, sample.right.wall) > criteria.maxWallHeight,
        'The retaining wall exceeds the maximum wall height');
    runWarnings(warnings, samples, units, (sample) => sample.bridge && sample.ground > sample.z, 'The bridge deck is below the ground');

    // Stream crossings - an alignment segment outside a stream's bounding box can't cross it, so the alignment's
    // segments are bounded in chunks ([ixPoint, ixPointEnd, bounds] - the segments ending at points ixPoint up to
    // ixPointEnd) to skip the chunks outside the stream's bounding box
    const alignmentCount = alignment.length;
    const chunks = [];
    for (let ixChunk = 1; ixChunk < alignmentCount;) {
        const ixChunkEnd = Math.min(alignmentCount, ixChunk + crossingChunk);
        chunks.push([ixChunk, ixChunkEnd, bounds(alignment, ixChunk - 1, ixChunkEnd)]);
        ixChunk = ixChunkEnd;
    }
    for (const feature of topo.features) {
        if (feature.type === 'stream') {
            const streamPoints = feature.points;
            const streamBounds = bounds(streamPoints);
            const streamCount = streamPoints.length;
            for (const [ixChunk, ixChunkEnd, chunkBounds] of chunks) {
                if (outsideBox(streamBounds, chunkBounds[0], chunkBounds[1], chunkBounds[2], chunkBounds[3])) {
                    continue;
                }
                for (let ixPoint = ixChunk; ixPoint < ixChunkEnd; ixPoint++) {
                    const point = alignment[ixPoint];
                    const prev = alignment[ixPoint - 1];
                    if (outsideBox(streamBounds, Math.min(prev.x, point.x), Math.max(prev.x, point.x),
                        Math.min(prev.y, point.y), Math.max(prev.y, point.y))) {
                        continue;
                    }
                    for (let ixStream = 1; ixStream < streamCount; ixStream++) {
                        const streamPrev = streamPoints[ixStream - 1];
                        const streamPoint = streamPoints[ixStream];
                        const t = segmentIntersect(prev.x, prev.y, point.x, point.y, streamPrev.x, streamPrev.y, streamPoint.x, streamPoint.y);
                        if (t !== null) {
                            const stationValue = prev.station + t * (point.station - prev.station);
                            let crossed = structureAt(structures, 'bridge', stationValue, null) !== null ||
                                existingAt(existingRoads, stationValue);
                            for (const structure of structures) {
                                if (structure.type === 'culvert' && Math.abs(structure.station - stationValue) <= tolerance) {
                                    crossed = true;
                                }
                            }
                            if (!crossed) {
                                warnings.push(`The ${feature.name ?? 'stream'} crossing at ${formatStation(stationValue, units)} ` +
                                    'has no culvert or bridge');
                            }
                        }
                    }
                }
            }
        }
    }

    // Earthwork, area, and mass haul quantities (plan units)
    const {shrink, swell} = rates;
    let cutCommon = 0;
    let cutRock = 0;
    let fillVolume = 0;
    let slopeArea = 0;
    let wallArea = 0;
    let surfaceLength = 0;
    let existingLength = 0;
    let mass = 0;
    let haul = 0;
    for (let ixSample = 1; ixSample < samples.length; ixSample++) {
        const sample = samples[ixSample];
        const prev = samples[ixSample - 1];
        const ds = sample.station - prev.station;
        const intervalCut = (prev.cut + sample.cut) * 0.5 * ds;
        const intervalRock = ((prev.rock ? prev.cut : 0) + (sample.rock ? sample.cut : 0)) * 0.5 * ds;
        const intervalFill = (prev.fill + sample.fill) * 0.5 * ds;
        cutRock = cutRock + intervalRock;
        cutCommon = cutCommon + intervalCut - intervalRock;
        fillVolume = fillVolume + intervalFill;
        const massPrev = mass;
        mass = mass + (intervalCut - intervalRock) * shrink + intervalRock * swell - intervalFill;
        // Surplus or deficit earth isn't hauled along an existing road
        if (!(prev.existing && sample.existing)) {
            haul = haul + Math.abs(massPrev + mass) * 0.5 * ds;
        }

        // Areas
        for (const side of ['left', 'right']) {
            const sidePrev = prev[side];
            const sideCur = sample[side];
            const slopeWidth = (sidePrev.offset + sideCur.offset) * 0.5;
            slopeArea = slopeArea + slopeWidth * ds;
            wallArea = wallArea + (sidePrev.wall + sideCur.wall) * 0.5 * ds;
        }
        if (prev.existing && sample.existing) {
            existingLength = existingLength + ds;
        } else if (!(prev.bridge && sample.bridge)) {
            surfaceLength = surfaceLength + ds;
        }
    }

    // Structures
    let bridgeLength = 0;
    let turnoutArea = 0;
    let culvertCount = 0;
    let culvertLength = 0;
    let culvertCost = 0;
    const turnoutWidth = unitLength(plan, 3, 10);
    for (const structure of structures) {
        const {type} = structure;
        const stationValue = structure.station;
        if (stationValue > length || (structure.endStation ?? stationValue) > length) {
            warnings.push(`The ${type} at ${formatStation(stationValue, units)} is beyond the end of the road`);
        }
        if (type === 'bridge') {
            bridgeLength = bridgeLength + structure.endStation - stationValue;
        } else if (type === 'turnout') {
            const turnoutSides = (structure.side ?? 'right') === 'both' ? 2 : 1;
            turnoutArea = turnoutArea + (structure.endStation - stationValue) * turnoutWidth * turnoutSides;
        } else if (type === 'culvert') {
            // The culvert length spans the road and its fill slopes
            const sample = sampleAt(samples, stationValue);
            let pipeLength = width;
            for (const side of ['left', 'right']) {
                const sideSection2 = sample[side];
                if (sideSection2.kind === 'fill') {
                    pipeLength = pipeLength + sideSection2.offset;
                }
            }
            const diameter = culvertDiameter(plan.units, structure);
            culvertCount = culvertCount + 1;
            culvertLength = culvertLength + pipeLength;
            culvertCost = culvertCost + pipeLength * scale * diameter * scale * rates.culvert + rates.culvertEnds;
        }
    }
    const clearingArea = slopeArea + surfaceLength * width + turnoutArea;
    const surfaceArea = surfaceLength * width + turnoutArea;

    // Mass balance (compacted fill measure)
    const supply = cutCommon * shrink + cutRock * swell;
    const borrow = Math.max(0, fillVolume - supply);
    const waste = Math.max(0, supply - fillVolume);
    const overhaul = Math.max(0, haul - rates.freeHaul / scale * Math.max(supply, fillVolume));

    // Cost items
    const scale2 = scale * scale;
    const scale3 = scale2 * scale;
    const surface = section.surface ?? 'gravel';
    const costs = [
        costItem('Clearing and grubbing', clearingArea, 'area', clearingArea * scale2 * rates.clearing),
        costItem('Common excavation', cutCommon, 'volume', cutCommon * scale3 * rates.excavation),
        costItem('Rock excavation', cutRock, 'volume', cutRock * scale3 * rates.rockExcavation),
        costItem('Embankment', fillVolume, 'volume', fillVolume * scale3 * rates.embankment),
        costItem('Borrow (import)', borrow, 'volume', borrow * scale3 * rates.borrow),
        costItem('Waste (export)', waste, 'volume', waste * scale3 * rates.waste),
        costItem('Overhaul', overhaul, 'haul', overhaul * scale3 * 0.001 * rates.overhaul),
        costItem(`Surfacing (${surface})`, surfaceArea, 'area', surfaceArea * scale2 * rates[surface]),
        costItem('Ditches and cross drains', surfaceLength, 'length', surfaceLength * scale * rates.drainage),
        costItem('Existing road upgrade', existingLength * width, 'area', existingLength * width * scale2 * rates.existingRoad),
        costItem(`Culverts (${culvertCount})`, culvertLength, 'length', culvertCost),
        costItem('Retaining walls', wallArea, 'area', wallArea * scale2 * rates.retainingWall),
        costItem('Bridges', bridgeLength * width, 'area', bridgeLength * width * scale2 * rates.bridge),
        costItem('Erosion control', clearingArea, 'area', clearingArea * scale2 * rates.erosionControl)
    ];
    let subtotal = 0;
    for (const cost of costs) {
        subtotal = subtotal + cost.cost;
    }
    const mobilization = subtotal * rates.mobilization;
    costs.push(costItem('Mobilization', null, null, mobilization));
    const total = subtotal + mobilization;

    return {
        'name': option.name,
        length,
        alignment,
        samples,
        grades,
        maxGrade,
        minRadius,
        'cut': cutCommon + cutRock,
        'fill': fillVolume,
        borrow,
        waste,
        wallArea,
        bridgeLength,
        existingLength,
        culvertCount,
        costs,
        total,
        'score': total / 1000,
        warnings
    };
}


// Find the sample nearest a station
export function sampleAt(samples, stationValue) {
    const last = samples.length - 1;
    const interval = samples[last].station / last;
    const ixSample = Math.max(0, Math.min(last, Math.round(stationValue / interval)));
    return samples[ixSample];
}


// Create a cost item object
function costItem(name, quantity, quantityType, cost) {
    return {name, quantity, 'type': quantityType, cost};
}
