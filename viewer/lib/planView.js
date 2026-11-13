// planView.js - the plan view and profile view drawings

import {
    cellContours, colors, contourInterval, contourLevel, labelX, minRoadPx, niceStep, rgb, roadColor, samplePoints, svgOpen, svgPolygon,
    svgPolyline, svgStyle, svgText
} from './draw.js';
import {fixedTrim, station as formatStation, number, px, unitLabel} from './format.js';
import {planCriteria, sampleAt} from './model.js';
import {unproject} from './view3d.js';


// The plan view's padding, in pixels
export const planPad = 10;


// Create the plan view SVG markup - "outlines" is an array of [number, view, [x, y]] arrays of 3D views (projection)
// whose visible areas are outlined, with their numbers marked on the road at [x, y]. Returns the markup and the plan
// view's scale and height (for the click handler).
export function planView(plan, topo, analyses, ixOption, width, outlines) {
    const {units} = plan;
    const {spacing, nRows, nCols} = topo;
    const topoHeight = topo.height;
    const pad = planPad;
    const scale = (width - 2 * pad) / topo.width;
    const height = Math.round(topoHeight * scale + 2 * pad);
    const elements = [];

    // Contours
    const interval = contourInterval(plan, topo);
    const {rows} = topo;
    const segments = new Float64Array(8);
    const minorPath = [];
    const indexPath = [];
    for (let row = 0; row < nRows - 1; row++) {
        const rowTop = rows[row];
        const rowBottom = rows[row + 1];
        for (let col = 0; col < nCols - 1; col++) {
            const zNW = rowTop[col];
            const zNE = rowTop[col + 1];
            const zSE = rowBottom[col + 1];
            const zSW = rowBottom[col];
            const zMax = Math.max(zNW, zNE, zSE, zSW);
            for (let ixLevel = Math.ceil(Math.min(zNW, zNE, zSE, zSW) / interval); ; ixLevel++) {
                const level = contourLevel(ixLevel, interval);
                if (level > zMax) {
                    break;
                }
                const isIndex = ixLevel % 5 === 0;
                const segmentCount = cellContours(zNW, zNE, zSE, zSW, level, segments);
                for (let ixSegment = 0; ixSegment < segmentCount; ixSegment++) {
                    const ix = ixSegment * 4;
                    (isIndex ? indexPath : minorPath).push(
                        `M${px(pad + (col + segments[ix]) * spacing * scale)} ${px(pad + (row + segments[ix + 1]) * spacing * scale)}` +
                        `L${px(pad + (col + segments[ix + 2]) * spacing * scale)} ${px(pad + (row + segments[ix + 3]) * spacing * scale)}`
                    );
                }
            }
        }
    }
    elements.push(`<path d="${minorPath.join('')}" fill="none" stroke="#b89a72" stroke-width="0.6"/>`);
    elements.push(`<path d="${indexPath.join('')}" fill="none" stroke="#8a6a45" stroke-width="1.3"/>`);

    // Features
    for (const feature of topo.features) {
        const {type} = feature;
        const coords = [];
        let sumX = 0;
        let sumY = 0;
        for (const point of feature.points) {
            const pxValue = pad + point.x * scale;
            const pyValue = pad + (topoHeight - point.y) * scale;
            coords.push(pxValue, pyValue);
            sumX += pxValue;
            sumY += pyValue;
        }
        if (type === 'stream') {
            elements.push(svgPolyline(coords, '#2a6fdb', 2.5));
        } else if (type === 'rock') {
            elements.push(svgPolygon(coords, 'rgba(110,110,110,0.35)', '#555555', 1));
        } else {
            elements.push(svgPolygon(coords, 'rgba(208,49,45,0.12)', '#d0312d', 1.5));
        }
        const name = feature.name ?? null;
        if (name !== null) {
            const count = feature.points.length;
            elements.push(svgText(name, sumX / count, sumY / count, 11, 'middle', type === 'stream' ? '#1d4f9e' : '#444', false));
        }
    }

    // Other options' centerlines
    for (let ixAnalysis = 0; ixAnalysis < analyses.length; ixAnalysis++) {
        if (ixAnalysis !== ixOption) {
            const coords = [];
            for (const point of analyses[ixAnalysis].alignment) {
                coords.push(pad + point.x * scale, pad + (topoHeight - point.y) * scale);
            }
            elements.push(svgPolyline(coords, '#777777', 1.5, '6 4'));
        }
    }

    // The selected option's footprint
    const analysis = analyses[ixOption];
    const option = plan.options[ixOption];
    const {section} = option;
    const halfWidth = section.width * 0.5;
    const {samples} = analysis;
    const surfaceFill = rgb(colors[section.surface ?? 'gravel']);
    const bridgeFill = rgb(colors.bridge);
    const existingFill = rgb(colors.existing);
    let prevCoords = null;
    for (let ixSample = 0; ixSample < samples.length; ixSample++) {
        const sample = samples[ixSample];
        const coords = [];
        for (const point of samplePoints(sample, halfWidth)) {
            coords.push(pad + point[0] * scale, pad + (topoHeight - point[1]) * scale);
        }
        if (ixSample > 0) {
            const prev = samples[ixSample - 1];
            for (const [sideName, ixDay, ixEdge] of [['left', 0, 1], ['right', 3, 2]]) {
                const {kind} = sample[sideName];
                const kindPrev = prev[sideName].kind;
                if (kind === 'wall' || kindPrev === 'wall') {
                    elements.push(svgPolyline([
                        prevCoords[ixEdge * 2], prevCoords[ixEdge * 2 + 1], coords[ixEdge * 2], coords[ixEdge * 2 + 1]
                    ], '#333333', 3));
                } else if (kind === 'cut' || kind === 'fill') {
                    const color = rgb(colors[kind]);
                    elements.push(svgPolygon([
                        prevCoords[ixEdge * 2], prevCoords[ixEdge * 2 + 1],
                        prevCoords[ixDay * 2], prevCoords[ixDay * 2 + 1],
                        coords[ixDay * 2], coords[ixDay * 2 + 1],
                        coords[ixEdge * 2], coords[ixEdge * 2 + 1]
                    ], color, color, 0.5));
                }
            }
            let fill = surfaceFill;
            if (prev.bridge && sample.bridge) {
                fill = bridgeFill;
            } else if (prev.existing && sample.existing) {
                fill = existingFill;
            }
            elements.push(svgPolygon([
                prevCoords[2], prevCoords[3], coords[2], coords[3], coords[4], coords[5], prevCoords[4], prevCoords[5]
            ], fill, fill, 0.5));
        }
        prevCoords = coords;
    }

    // A road narrower than the minimum drawn width is also drawn as a highlighted centerline
    if (2 * halfWidth * scale < minRoadPx) {
        const coords = [];
        for (const sample of samples) {
            coords.push(pad + sample.x * scale, pad + (topoHeight - sample.y) * scale);
        }
        elements.push(svgPolyline(coords, 'white', 6));
        elements.push(svgPolyline(coords, roadColor, 3));
    }

    // Culverts
    for (const structure of option.structures ?? []) {
        if (structure.type === 'culvert') {
            const sample = sampleAt(samples, structure.station);
            const points = samplePoints(sample, halfWidth);
            const [pointLeft, , , pointRight] = points;
            elements.push(svgPolyline([
                pad + pointLeft[0] * scale, pad + (topoHeight - pointLeft[1]) * scale,
                pad + pointRight[0] * scale, pad + (topoHeight - pointRight[1]) * scale
            ], '#2a6fdb', 3));
        }
    }

    // Station ticks
    const {length} = analysis;
    const tickStep = niceStep(length, 8);
    for (let stationValue = tickStep; stationValue < length; stationValue += tickStep) {
        const sample = sampleAt(samples, stationValue);
        const pxValue = pad + sample.x * scale;
        const pyValue = pad + (topoHeight - sample.y) * scale;
        elements.push(`<circle cx="${px(pxValue)}" cy="${px(pyValue)}" r="2.5" fill="#222"/>`);
        elements.push(svgText(formatStation(stationValue, units), pxValue + 6, pyValue - 8, 10, 'start', '#222', false));
    }

    // Start and end markers
    for (const [point, defaultLabel, color] of [[plan.start, 'Start', '#1a8f3c'], [plan.end, 'End', '#c0392b']]) {
        const pxValue = pad + point.x * scale;
        const pyValue = pad + (topoHeight - point.y) * scale;
        elements.push(`<circle cx="${px(pxValue)}" cy="${px(pyValue)}" r="6" fill="${color}" stroke="white" stroke-width="2"/>`);
        const label = point.label ?? defaultLabel;
        elements.push(svgText(label, labelX(label, 13, pxValue, width), pyValue - 14, 13, 'middle', color, true));
    }

    // Scale bar
    const barLength = niceStep(topo.width, 5);
    const barPx = barLength * scale;
    const barY = height - pad - 12;
    elements.push(`<rect x="${pad + 8}" y="${barY - 14}" width="${px(barPx + 16)}" height="26" fill="white" fill-opacity="0.8"/>`);
    elements.push(svgPolyline([pad + 16, barY, pad + 16 + barPx, barY], '#222', 3));
    elements.push(svgText(`${number(barLength, 0)} ${unitLabel(units, 'length')} — contours ${fixedTrim(interval, 2)} ` +
        `${unitLabel(units, 'length')}`, pad + 16, barY - 7, 10, 'start', '#222', false));

    // North arrow
    elements.push(svgPolygon([width - 30, pad + 8, width - 37, pad + 28, width - 23, pad + 28], '#222', '#222', 1));
    elements.push(svgText('N', width - 30, pad + 38, 11, 'middle', '#222', true));

    // The 3D views' visible areas - their corners projected onto the ground - as light dashed outlines, then their
    // numbers marked on the road (on top of the outlines)
    for (const [outlineNumber, view] of outlines) {
        const coords = [];
        const viewWidth = view.width;
        const viewHeight = view.height;
        for (const [cornerX, cornerY] of [[0, 0], [viewWidth, 0], [viewWidth, viewHeight], [0, viewHeight]]) {
            const point = unproject(view, topo, cornerX, cornerY);
            coords.push(pad + point[0] * scale, pad + (topoHeight - point[1]) * scale);
        }
        elements.push(svgPolygon(coords, 'none', 'rgba(31,78,140,0.55)', 1, `3D view ${outlineNumber} area`, ' stroke-dasharray="5 4"'));
    }
    for (const [outlineNumber, , marker] of outlines) {
        const pxValue = pad + marker[0] * scale;
        const pyValue = pad + (topoHeight - marker[1]) * scale;
        elements.push(`<circle cx="${px(pxValue)}" cy="${px(pyValue)}" r="9" fill="#1f4e8c" stroke="white" stroke-width="1.5"/>`);
        elements.push(`<text x="${px(pxValue)}" y="${px(pyValue)}" font-size="11" font-family="sans-serif" font-weight="bold" ` +
            `text-anchor="middle" dominant-baseline="central" fill="white">${outlineNumber}</text>`);
    }

    const svgElement = svgOpen(
        width, height, `Plan view of the ${option.name} road plan option`, `${svgStyle} cursor: crosshair;`, ' class="roadie-plan"'
    );
    const svg = `${svgElement}${elements.join('')}</svg>`;
    return {svg, scale, height};
}


// Create the profile view SVG markup
export function profileView(plan, option, analysis, width, height) {
    const {units} = plan;
    const lengthUnit = unitLabel(units, 'length');
    const {samples} = analysis;
    const length = Math.max(analysis.length, 1e-9);
    const {maxGrade} = planCriteria(plan);
    const elements = [];

    // Elevation range
    let minZ = null;
    let maxZ = null;
    for (const sample of samples) {
        const low = Math.min(sample.z, sample.ground);
        const high = Math.max(sample.z, sample.ground);
        minZ = minZ === null ? low : Math.min(minZ, low);
        maxZ = maxZ === null ? high : Math.max(maxZ, high);
    }
    // The elevation grid lines are at least a unit apart (their labels are whole numbers) - so a level road has a range
    const zStep = Math.max(1, niceStep(maxZ - minZ, 6));
    minZ = Math.floor(minZ / zStep) * zStep - zStep;
    maxZ = Math.ceil(maxZ / zStep) * zStep;

    // Plot area
    const left = 64;
    const right = width - 16;
    const top = 16;
    const bottom = height - 40;
    const xScale = (right - left) / length;
    const yScale = (bottom - top) / (maxZ - minZ);

    // Grid and axes
    for (let z = minZ; z <= maxZ + 1e-9; z += zStep) {
        const pyValue = bottom - (z - minZ) * yScale;
        elements.push(svgPolyline([left, pyValue, right, pyValue], '#dddddd', 1));
        elements.push(svgText(number(z, 0), left - 6, pyValue, 10, 'end', '#444', false));
    }
    const stationStep = niceStep(length, 10);
    for (let stationValue = 0; stationValue <= length + 1e-9; stationValue += stationStep) {
        const pxValue = left + stationValue * xScale;
        elements.push(svgPolyline([pxValue, top, pxValue, bottom], '#dddddd', 1));
        elements.push(svgText(formatStation(stationValue, units), pxValue, bottom + 14, 10, 'middle', '#444', false));
    }
    elements.push(svgText('Station', (left + right) * 0.5, height - 10, 11, 'middle', '#444', true));
    elements.push(svgText(`Elevation (${lengthUnit}) — vertical exaggeration ${fixedTrim(yScale / xScale, 1)}x`,
        left + 6, top + 8, 11, 'start', '#444', true));

    // Cut and fill areas
    for (let ixRun = 0; ixRun < samples.length - 1;) {
        const sample = samples[ixRun];
        const isCut = sample.ground >= sample.z;
        const isBridge = sample.bridge;
        let ixEnd = ixRun + 1;
        while (ixEnd < samples.length - 1 && (samples[ixEnd].ground >= samples[ixEnd].z) === isCut && samples[ixEnd].bridge === isBridge) {
            ixEnd += 1;
        }
        if (!isBridge) {
            const gradeCoords = [];
            const groundCoords = [];
            for (let ixSample = ixRun; ixSample <= ixEnd; ixSample++) {
                const runSample = samples[ixSample];
                const pxValue = left + runSample.station * xScale;
                gradeCoords.push(pxValue, bottom - (runSample.z - minZ) * yScale);
                groundCoords.push(bottom - (runSample.ground - minZ) * yScale, pxValue);
            }
            gradeCoords.push(...groundCoords.reverse());
            const color = rgb(colors[isCut ? 'cut' : 'fill']);
            elements.push(svgPolygon(gradeCoords, color, color, 0.5));
        }
        ixRun = ixEnd;
    }

    // Ground line
    const groundCoords = [];
    for (const sample of samples) {
        groundCoords.push(left + sample.station * xScale, bottom - (sample.ground - minZ) * yScale);
    }
    elements.push(svgPolyline(groundCoords, '#6b4a2b', 1.5));

    // Structures - the wall and turnout labels share a row, so a label that would overlap the previous one is omitted
    let labelRight = null;
    for (const structure of option.structures ?? []) {
        const {type} = structure;
        const stationValue = structure.station;
        const endStation = structure.endStation ?? stationValue;
        const px1 = left + stationValue * xScale;
        const px2 = left + endStation * xScale;
        if (type === 'bridge') {
            const sample1 = sampleAt(samples, stationValue);
            const sample2 = sampleAt(samples, endStation);
            const py1 = bottom - (sample1.z - minZ) * yScale;
            const py2 = bottom - (sample2.z - minZ) * yScale;
            elements.push(svgPolygon([px1, py1, px2, py2, px2, py2 + 6, px1, py1 + 6], '#786858', '#786858', 1));
            elements.push(svgText('Bridge', (px1 + px2) * 0.5, Math.min(py1, py2) - 10, 10, 'middle', '#444', true));
        } else if (type === 'culvert') {
            const sample = sampleAt(samples, stationValue);
            const pyValue = bottom - (sample.ground - minZ) * yScale;
            elements.push(`<circle cx="${px(px1)}" cy="${px(pyValue)}" r="5" fill="white" stroke="#2a6fdb" stroke-width="2.5"/>`);
        } else {
            let color = '#2a8f8f';
            if (type === 'retainingWall') {
                color = '#555555';
            } else if (type === 'existingRoad') {
                color = '#706e68';
            }
            if (type === 'existingRoad') {
                // The existing road's (as-built) section is shaded
                elements.push(`<rect x="${px(px1)}" y="${top}" width="${px(Math.max(2, px2 - px1))}" height="${bottom - top}" ` +
                    'fill="rgba(112,110,104,0.12)"/>');
            }
            elements.push(`<rect x="${px(px1)}" y="${bottom - 8}" width="${px(Math.max(2, px2 - px1))}" height="8" fill="${color}"/>`);
            let label = 'Turnout';
            if (type === 'retainingWall') {
                label = 'Wall';
            } else if (type === 'existingRoad') {
                label = 'Existing road';
            }
            const halfLabel = label.length * 10 * 0.32;
            const labelXValue = (px1 + px2) * 0.5;
            if (labelRight === null || labelXValue - halfLabel > labelRight + 4) {
                elements.push(svgText(label, labelXValue, bottom - 16, 10, 'middle', color, true));
                labelRight = labelXValue + halfLabel;
            }
        }
    }

    // Grade line - steep segments are highlighted
    for (const grade of analysis.grades) {
        const steep = !grade.existing && Math.abs(grade.grade) > maxGrade + 1e-6;
        const sample1 = alignmentPointAt(analysis, grade.station);
        const sample2 = alignmentPointAt(analysis, grade.endStation);
        elements.push(svgPolyline([
            left + grade.station * xScale, bottom - (sample1.z - minZ) * yScale,
            left + grade.endStation * xScale, bottom - (sample2.z - minZ) * yScale
        ], steep ? '#e01e1e' : '#1f2d3d', steep ? 3 : 2));
    }

    // Legend
    const legendX = right - 250;
    const legends = [
        ['Cut', rgb(colors.cut)], ['Fill', rgb(colors.fill)], ['Ground', '#6b4a2b'], ['Grade', '#1f2d3d'],
        [`Over ${fixedTrim(maxGrade, 1)}%`, '#e01e1e']
    ];
    for (let ixLegend = 0; ixLegend < legends.length; ixLegend++) {
        const [legend, color] = legends[ixLegend];
        const lx = legendX + ixLegend * 50;
        elements.push(`<rect x="${lx}" y="${top + 2}" width="10" height="10" fill="${color}"/>`);
        elements.push(svgText(legend, lx + 13, top + 8, 10, 'start', '#444', false));
    }

    return `${svgOpen(width, height, `Profile of the ${option.name} road plan option`)}${elements.join('')}</svg>`;
}


// Find the alignment point at a station - a grade's station, which is an alignment point's, so there's always one
function alignmentPointAt(analysis, stationValue) {
    // Binary search for the first point at or beyond the station (alignment stations are non-decreasing)
    const {alignment} = analysis;
    let ixLow = 0;
    let ixHigh = alignment.length;
    while (ixLow < ixHigh) {
        const ixMid = Math.floor((ixLow + ixHigh) / 2);
        if (alignment[ixMid].station >= stationValue - 1e-9) {
            ixHigh = ixMid;
        } else {
            ixLow = ixMid + 1;
        }
    }
    return alignment[ixLow];
}
