// plot.js - a road plan model's plot - its terrain (shaded, with contours), features, and options, with the plan's
// coordinates along its sides - for the planning session to study the site and its options with

import {cellContours, contourInterval, contourLevel, niceStep, svgPoints, svgPolyline, svgText} from '../../viewer/lib/draw.js';
import {escapeHtml, px} from '../../viewer/lib/format.js';
import {Buffer} from 'node:buffer';
import {grayPng} from './png.js';
import {planTopo} from '../../viewer/lib/model.js';
import {readPlan} from './planFile.js';


// The plot's margins, in pixels - the left and bottom margins have the plan's coordinates
const marginLeft = 64;
const marginRight = 16;
const marginTop = 34;
const marginBottom = 34;


// The options' colors
const optionColors = ['#d6246e', '#e07b00', '#7b3fc4', '#0a8f8f', '#7a8a00', '#1f3f9e'];


// The features' colors
const featureColors = {'stream': '#2a6fdb', 'road': '#6e675f', 'rock': '#555555', 'exclusion': '#d0312d'};


// The smallest terrain cell that's drawn, in pixels - a finer grid's cells are drawn several together
const cellPixels = 1.5;


// Create a road plan model's plot - "topo" is the plan's topography grid object (the viewer's planTopo) and "width"
// is the plot's width, in pixels. Returns the plot's SVG markup, and its "width" and "height".
export function planPlot(plan, topo, width = 1400) {
    const {units} = plan;
    const {spacing, nCols, nRows} = topo;
    const scale = (width - marginLeft - marginRight) / topo.width;
    const plotWidth = topo.width * scale;
    const plotHeight = topo.height * scale;
    const height = Math.round(plotHeight + marginTop + marginBottom);
    const planX = (x) => marginLeft + x * scale;
    const planY = (y) => marginTop + (topo.height - y) * scale;
    const elements = [];

    // The terrain's cells - a fine grid's cells are drawn "step" grid cells together. The last cells are to the
    // grid's edge.
    const step = Math.max(1, Math.floor(cellPixels / (spacing * scale)));
    const cols = gridSteps(nCols, step);
    const rows = gridSteps(nRows, step);

    // The shaded terrain - lit from the northwest
    const shade = terrainShade(topo, cols, rows);
    const image = Buffer.from(grayPng(cols.length, rows.length, shade)).toString('base64');
    elements.push(
        `<rect x="${marginLeft}" y="${marginTop}" width="${px(plotWidth)}" height="${px(plotHeight)}" fill="#f4f1ea"/>`,
        `<image x="${marginLeft}" y="${marginTop}" width="${px(plotWidth)}" height="${px(plotHeight)}" preserveAspectRatio="none" ` +
            `opacity="0.55" href="data:image/png;base64,${image}"/>`
    );

    // The contours - the index contours are labeled
    const interval = contourInterval(plan, topo);
    const segments = new Float64Array(8);
    const minorPath = [];
    const indexPath = [];
    const labels = new Map();
    for (let ixRow = 0; ixRow < rows.length - 1; ixRow++) {
        const rowTop = topo.rows[rows[ixRow]];
        const rowBottom = topo.rows[rows[ixRow + 1]];
        const yTop = marginTop + rows[ixRow] * spacing * scale;
        const cellHeight = (rows[ixRow + 1] - rows[ixRow]) * spacing * scale;
        for (let ixCol = 0; ixCol < cols.length - 1; ixCol++) {
            const zNW = rowTop[cols[ixCol]];
            const zNE = rowTop[cols[ixCol + 1]];
            const zSE = rowBottom[cols[ixCol + 1]];
            const zSW = rowBottom[cols[ixCol]];
            const zMax = Math.max(zNW, zNE, zSE, zSW);
            const xLeft = marginLeft + cols[ixCol] * spacing * scale;
            const cellWidth = (cols[ixCol + 1] - cols[ixCol]) * spacing * scale;
            for (let ixLevel = Math.ceil(Math.min(zNW, zNE, zSE, zSW) / interval); ; ixLevel++) {
                const level = contourLevel(ixLevel, interval);
                if (level > zMax) {
                    break;
                }
                const isIndex = ixLevel % 5 === 0;
                const segmentCount = cellContours(zNW, zNE, zSE, zSW, level, segments);
                for (let ixSegment = 0; ixSegment < segmentCount; ixSegment++) {
                    const ix = ixSegment * 4;
                    const x1 = xLeft + segments[ix] * cellWidth;
                    const y1 = yTop + segments[ix + 1] * cellHeight;
                    (isIndex ? indexPath : minorPath).push(
                        `M${px(x1)} ${px(y1)}L${px(xLeft + segments[ix + 2] * cellWidth)} ${px(yTop + segments[ix + 3] * cellHeight)}`
                    );

                    // An index contour's label - one in each block of the plot, so they're spread over it
                    if (isIndex) {
                        const key = `${level}/${Math.floor(x1 / labelBlock)}/${Math.floor(y1 / labelBlock)}`;
                        if (!labels.has(key)) {
                            labels.set(key, [level, x1, y1]);
                        }
                    }
                }
            }
        }
    }
    elements.push(
        `<path d="${minorPath.join('')}" fill="none" stroke="#8f6f45" stroke-width="0.6"/>`,
        `<path d="${indexPath.join('')}" fill="none" stroke="#7a5a35" stroke-width="1.1"/>`
    );
    for (const [level, x, y] of labels.values()) {
        elements.push(svgText(`${level}`, x, y, 9, 'middle', '#5a4020', false));
    }

    // The features - a stream or a road is a line, and a rock outcrop or an exclusion area is a dashed outline
    for (const feature of topo.features) {
        const {type, points} = feature;
        const line = type === 'stream' || type === 'road';
        const coords = [];
        for (const point of line ? points : [...points, points[0]]) {
            coords.push(planX(point.x), planY(point.y));
        }
        elements.push(svgPolyline(coords, featureColors[type], type === 'stream' ? 2 : 1.2, line ? null : '5 3'));
        if ('name' in feature) {
            // A line's name is at its middle point, and an area's is at its first
            const ixName = line ? Math.floor(points.length / 2) * 2 : 0;
            const [x, y] = [coords[ixName], coords[ixName + 1]];
            elements.push(svgText(feature.name, x, y - 6, type === 'road' ? 9 : 11, 'middle', featureColors[type], false));
        }
    }

    // The options - each in its color, with its stations, existing roads (dashed), and structures
    const legend = [];
    for (let ixOption = 0; ixOption < plan.options.length; ixOption++) {
        const option = plan.options[ixOption];
        const color = optionColors[ixOption % optionColors.length];
        const {alignment} = option;
        const stations = [0];
        const coords = [planX(alignment[0].x), planY(alignment[0].y)];
        for (let ix = 1; ix < alignment.length; ix++) {
            stations.push(stations[ix - 1] + Math.hypot(alignment[ix].x - alignment[ix - 1].x, alignment[ix].y - alignment[ix - 1].y));
            coords.push(planX(alignment[ix].x), planY(alignment[ix].y));
        }
        const length = stations[stations.length - 1];
        elements.push(svgPolyline(coords, 'white', 4.5), svgPolyline(coords, color, 2.5));
        legend.push([`${ixOption}: ${option.name}`, color]);

        // Find the alignment's pixel at a station
        const stationPixel = (stationValue) => {
            let ix = 1;
            while (ix < stations.length - 1 && stations[ix] < stationValue) {
                ix += 1;
            }
            const run = stations[ix] - stations[ix - 1];
            const fraction = run > 0 ? Math.max(0, Math.min(1, (stationValue - stations[ix - 1]) / run)) : 0;
            return [
                coords[ix * 2 - 2] + (coords[ix * 2] - coords[ix * 2 - 2]) * fraction,
                coords[ix * 2 - 1] + (coords[ix * 2 + 1] - coords[ix * 2 - 1]) * fraction
            ];
        };

        // The structures
        for (const structure of option.structures ?? []) {
            const {type} = structure;
            const [x, y] = stationPixel(structure.station);
            if (type === 'existingRoad') {
                // The existing road's line - from its station to its end station, through the alignment's points between
                const existing = [x, y];
                for (let ix = 0; ix < stations.length; ix++) {
                    if (stations[ix] > structure.station && stations[ix] < structure.endStation) {
                        existing.push(coords[ix * 2], coords[ix * 2 + 1]);
                    }
                }
                existing.push(...stationPixel(structure.endStation));
                elements.push(svgPolyline(existing, '#111111', 1.5, '4 3'));
            } else if (type === 'culvert') {
                elements.push(`<circle cx="${px(x)}" cy="${px(y)}" r="4" fill="${color}" stroke="#111111"/>`);
            } else {
                // A wall is a square, a bridge is a triangle, and a turnout is a diamond
                const marker = structureMarkers[type].map(([dx, dy]) => [x + dx, y + dy]).flat();
                elements.push(`<polygon points="${svgPoints(marker)}" fill="${color}" stroke="#111111"/>`);
            }
        }

        // The stations
        const tick = niceStep(length, 8);
        for (let stationValue = tick; stationValue < length; stationValue += tick) {
            const [x, y] = stationPixel(stationValue);
            elements.push(svgText(`${Math.round(stationValue)}`, x + 5, y - 6, 9, 'start', color, false));
        }
    }

    // The start and end points
    for (const [point, defaultLabel, color] of [[plan.start, 'Start', '#1a8f3c'], [plan.end, 'End', '#c0392b']]) {
        const x = planX(point.x);
        const y = planY(point.y);
        elements.push(
            `<circle cx="${px(x)}" cy="${px(y)}" r="6" fill="${color}" stroke="white" stroke-width="2"/>`,
            svgText(point.label ?? defaultLabel, x + 9, y - 9, 13, 'start', color, true)
        );
    }

    // The frame and the plan's coordinates
    const right = marginLeft + plotWidth;
    const bottom = marginTop + plotHeight;
    elements.push(
        `<rect x="${marginLeft}" y="${marginTop}" width="${px(plotWidth)}" height="${px(plotHeight)}" fill="none" stroke="#333333"/>`
    );
    const tick = niceStep(Math.max(topo.width, topo.height), 10);
    for (let x = 0; x <= topo.width + 1e-9; x += tick) {
        elements.push(
            svgPolyline([planX(x), bottom, planX(x), bottom + 5], '#333333', 1),
            svgText(`${Math.round(x)}`, planX(x), bottom + 15, 11, 'middle', '#333333', false)
        );
    }
    for (let y = 0; y <= topo.height + 1e-9; y += tick) {
        elements.push(
            svgPolyline([marginLeft - 5, planY(y), marginLeft, planY(y)], '#333333', 1),
            svgText(`${Math.round(y)}`, marginLeft - 8, planY(y), 11, 'end', '#333333', false)
        );
    }

    // The title and the options' legend
    const title = `${plan.title} - contours every ${interval} ${units}, coordinates in ${units}`;
    elements.push(svgText(title, marginLeft, 16, 14, 'start', '#222222', true));
    for (let ixLegend = 0; ixLegend < legend.length; ixLegend++) {
        const [name, color] = legend[ixLegend];
        const y = marginTop + 14 + ixLegend * 16;
        elements.push(svgPolyline([right - 190, y, right - 170, y], color, 2.5), svgText(name, right - 164, y, 11, 'start', color, true));
    }

    return {
        'svg': `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" ` +
            `aria-label="${escapeHtml(plan.title)}">${elements.join('')}</svg>`,
        width,
        height
    };
}


// The size of an index contour label's block of the plot, in pixels - a contour has one label in a block
const labelBlock = 260;


// The structures' markers - their polygons' points, in pixels from the structure
const structureMarkers = {
    'retainingWall': [[-4, -4], [4, -4], [4, 4], [-4, 4]],
    'bridge': [[0, -5], [5, 4], [-5, 4]],
    'turnout': [[0, -5], [5, 0], [0, 5], [-5, 0]]
};


// Get a grid dimension's indexes at a step - the last index is the dimension's last
function gridSteps(count, step) {
    const indexes = [];
    for (let index = 0; index < count - 1; index += step) {
        indexes.push(index);
    }
    indexes.push(count - 1);
    return indexes;
}


// Shade the terrain - a gray pixel for each of the grid's points at the columns and rows, lit from the northwest
// (its slopes that face northwest are light). Returns the pixels (a Uint8Array of its rows, north to south).
function terrainShade(topo, cols, rows) {
    const {spacing} = topo;
    const pixels = new Uint8Array(cols.length * rows.length);

    // The light's direction - from the northwest, 45 degrees above the horizon. The terrain's relief is exaggerated.
    const light = Math.SQRT1_2;
    const lightEast = -0.5;
    const lightNorth = 0.5;
    const exaggeration = 2;
    for (let ixRow = 0; ixRow < rows.length; ixRow++) {
        const rowNorth = topo.rows[rows[Math.max(0, ixRow - 1)]];
        const rowSouth = topo.rows[rows[Math.min(rows.length - 1, ixRow + 1)]];
        const row = topo.rows[rows[ixRow]];
        const distanceNorth = (rows[Math.min(rows.length - 1, ixRow + 1)] - rows[Math.max(0, ixRow - 1)]) * spacing;
        for (let ixCol = 0; ixCol < cols.length; ixCol++) {
            const colWest = cols[Math.max(0, ixCol - 1)];
            const colEast = cols[Math.min(cols.length - 1, ixCol + 1)];
            const slopeEast = exaggeration * (row[colEast] - row[colWest]) / ((colEast - colWest) * spacing);
            const slopeNorth = exaggeration * (rowNorth[cols[ixCol]] - rowSouth[cols[ixCol]]) / distanceNorth;

            // The surface's normal is (-slopeEast, -slopeNorth, 1) - its brightness is the cosine of its angle to the light
            const brightness = (light - slopeEast * lightEast - slopeNorth * lightNorth) /
                Math.sqrt(1 + slopeEast * slopeEast + slopeNorth * slopeNorth);
            pixels[ixRow * cols.length + ixCol] = Math.round(255 * Math.max(0, Math.min(1, brightness)));
        }
    }
    return pixels;
}


// The "plot" command's usage text lines
export const plotUsage = [
    'usage: plan plot <plan.json> <plot.png>',
    '',
    '  Plot a road plan model - its terrain (shaded, with contours), features, and options, with the plan\'s',
    '  coordinates along its sides'
];


// The "plot" command - "io" is the tools' input and output functions. Returns the command's exit code and its
// output text lines, or null if its arguments are invalid.
export function plotCommand(args, io) {
    if (args.length !== 2 || args.some((arg) => arg.startsWith('-'))) {
        return null;
    }
    const [planPath, plotPath] = args;

    // Read the road plan model - a plan without options yet (a site) is plotted, too
    const {plan, error} = readPlan(io, planPath);
    if (error !== undefined) {
        return {'code': 1, 'lines': error};
    }

    // Plot the plan
    const {svg, width, height} = planPlot(plan, planTopo(plan));
    io.writeBytes(plotPath, io.renderPng(svg));
    return {'code': 0, 'lines': [`Wrote ${plotPath} (${width} x ${height} pixels)`]};
}
