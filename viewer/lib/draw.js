// draw.js - drawing utilities: colors, shading, contours, and SVG element markup

import {escapeHtml, px} from './format.js';


// The drawing colors
export const colors = {
    'asphalt': [70, 72, 76],
    'bridge': [120, 104, 88],
    'concrete': [190, 190, 185],
    'cut': [196, 120, 64],
    'existing': [112, 110, 104],
    'fill': [218, 184, 96],
    'gravel': [150, 146, 136],
    'native': [168, 140, 100],
    'wall': [160, 160, 158]
};


// The selected road option's highlighted centerline color
export const roadColor = '#d6246e';


// The minimum drawn road width, in pixels - narrower roads are also drawn as a highlighted centerline
export const minRoadPx = 4;


// Format a color array as a CSS rgb() color, with an optional brightness factor
export function rgb(color, shade = null) {
    const factor = shade !== null ? shade : 1;
    const red = Math.floor(Math.max(0, Math.min(255, color[0] * factor)) + 0.5);
    const green = Math.floor(Math.max(0, Math.min(255, color[1] * factor)) + 0.5);
    const blue = Math.floor(Math.max(0, Math.min(255, color[2] * factor)) + 0.5);
    return `rgb(${red},${green},${blue})`;
}


// The terrain colors at the lowest, middle, and highest elevations
const terrainLow = [96, 148, 84];
const terrainMid = [176, 178, 112];
const terrainHigh = [178, 142, 104];


// The light direction - from the northwest, 45 degrees above the horizon
const light0 = -0.5;
const light1 = 0.5;
const light2 = 0.7071;


// Compute a terrain cell's fill color - the terrain color for a normalized elevation (0 to 1), blended between the low,
// middle, and high colors, shaded by the cell's surface normal (nx, ny, 1)
export function terrainFill(fraction, nx, ny) {
    let blend;
    let colorLow;
    let colorHigh;
    if (fraction < 0.5) {
        blend = Math.max(0, fraction) * 2;
        colorLow = terrainLow;
        colorHigh = terrainMid;
    } else {
        blend = Math.min(1, fraction) * 2 - 1;
        colorLow = terrainMid;
        colorHigh = terrainHigh;
    }
    const length = Math.sqrt(nx * nx + ny * ny + 1);
    let dot = (nx * light0 + ny * light1 + light2) / length;
    if (1 / length < 0.1) {
        dot = Math.abs(dot);
    }
    const factor = 0.5 + 0.6 * Math.max(0, dot);
    const red = Math.floor(Math.max(0, Math.min(255, (colorLow[0] + (colorHigh[0] - colorLow[0]) * blend) * factor)) + 0.5);
    const green = Math.floor(Math.max(0, Math.min(255, (colorLow[1] + (colorHigh[1] - colorLow[1]) * blend) * factor)) + 0.5);
    const blue = Math.floor(Math.max(0, Math.min(255, (colorLow[2] + (colorHigh[2] - colorLow[2]) * blend) * factor)) + 0.5);

    // The terrain colors repeat - a few thousand colors for tens of thousands of cells - so their strings are cached, by
    // red and green, then blue
    let blues = terrainColors[(red << 8) | green];
    if (blues === undefined) {
        blues = new Array(256).fill(null);
        terrainColors[(red << 8) | green] = blues;
    }
    let color = blues[blue];
    if (color === null) {
        color = `rgb(${red},${green},${blue})`;
        blues[blue] = color;
    }
    return color;
}

const terrainColors = new Array(65536).fill(undefined);


// Compute the brightness of a surface normal vector
function brightness(nx, ny, nz) {
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length === 0) {
        return 1;
    }
    let dot = (nx * light0 + ny * light1 + nz * light2) / length;
    if (Math.abs(nz / length) < 0.1) {
        dot = Math.abs(dot);
    } else if (nz < 0) {
        dot = -dot;
    }
    return 0.5 + 0.6 * Math.max(0, dot);
}


// Compute the brightness of a quadrilateral of world points ([x, y, z] arrays, z exaggerated)
export function quadBrightness(point1, point2, point3, point4) {
    const ux = point3[0] - point1[0];
    const uy = point3[1] - point1[1];
    const uz = point3[2] - point1[2];
    const vx = point4[0] - point2[0];
    const vy = point4[1] - point2[1];
    const vz = point4[2] - point2[2];
    return brightness(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}


// Compute a "nice" step size (1, 2, or 5 times a power of ten) for a range and approximate count
export function niceStep(range, count) {
    const rough = Math.max(range, 1e-9) / count;
    const power = 10 ** Math.floor(Math.log(rough) / Math.log(10));
    for (const multiple of [1, 2, 5]) {
        if (multiple * power >= rough) {
            return multiple * power;
        }
    }
    return 10 * power;
}


// Get the topography's contour interval
export function contourInterval(plan, topo) {
    return plan.topography.contourInterval ?? niceStep(topo.maxZ - topo.minZ, 25);
}


// Compute a grid cell's contour segments at a level. The cell's corner elevations are given clockwise from the
// northwest corner. The segments are written to the "out" array as [fx1, fy1, fx2, fy2, ...] in cell fractions, where
// fx increases to the east and fy increases to the south. Returns the number of segments (0, 1, or 2).
export function cellContours(zNW, zNE, zSE, zSW, level, out) {
    let count = 0;
    if ((zNW >= level) !== (zNE >= level)) {
        out[count++] = (level - zNW) / (zNE - zNW);
        out[count++] = 0;
    }
    if ((zNE >= level) !== (zSE >= level)) {
        out[count++] = 1;
        out[count++] = (level - zNE) / (zSE - zNE);
    }
    if ((zSE >= level) !== (zSW >= level)) {
        out[count++] = 1 - (level - zSE) / (zSW - zSE);
        out[count++] = 1;
    }
    if ((zSW >= level) !== (zNW >= level)) {
        out[count++] = 0;
        out[count++] = 1 - (level - zSW) / (zNW - zSW);
    }
    return count === 4 ? 1 : (count === 8 ? 2 : 0);
}


// Format a flat array of pixel coordinates as an SVG "points" attribute value
export function svgPoints(coords) {
    let points = '';
    for (let ix = 0; ix < coords.length; ix += 2) {
        points += `${(ix === 0 ? '' : ' ') + px(coords[ix])},${px(coords[ix + 1])}`;
    }
    return points;
}


// Create an SVG polygon element from a flat array of pixel coordinates
export function svgPolygon(coords, fill, stroke, strokeWidth, title = null, extraAttr = '') {
    const element = `<polygon points="${svgPoints(coords)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${extraAttr}`;
    return title !== null ? `${element}><title>${escapeHtml(title)}</title></polygon>` : `${element}/>`;
}


// Create an SVG polyline element from a flat array of pixel coordinates
export function svgPolyline(coords, stroke, strokeWidth, dashArray = null) {
    return `<polyline points="${svgPoints(coords)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" ` +
        `stroke-linejoin="round" stroke-linecap="round"${dashArray !== null ? ` stroke-dasharray="${dashArray}"` : ''}/>`;
}


// Create an SVG text element
export function svgText(text, x, y, size, anchor, fill, bold) {
    return `<text x="${px(x)}" y="${px(y)}" font-size="${size}" font-family="sans-serif" text-anchor="${anchor}" ` +
        `dominant-baseline="middle" fill="${fill}" stroke="white" stroke-width="3" paint-order="stroke"` +
        `${bold ? ' font-weight="bold"' : ''}>${escapeHtml(text)}</text>`;
}


// Compute a centered label's x coordinate that keeps it within a drawing's width - the label's width is estimated from its
// length and font size
export function labelX(label, fontSize, x, width) {
    const halfLabel = label.length * fontSize * 0.32;
    return Math.max(halfLabel + 4, Math.min(width - halfLabel - 4, x));
}


// The SVG drawing style
export const svgStyle = 'background: #f4f1ea; border: 1px solid #ccc; display: block; max-width: 100%; height: auto; ' +
    'break-inside: avoid; margin: 0.75em 0 1.5em 0;';


// Create an SVG drawing's opening tag
export function svgOpen(width, height, label, style = svgStyle, extraAttr = '') {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" ` +
        `aria-label="${escapeHtml(label)}" style="${style}"${extraAttr}>`;
}


// Get a road sample's points: [left daylight, left edge, right edge, right daylight] as [x, y, z] arrays
export function samplePoints(sample, halfWidth) {
    const {x, y, z} = sample;
    const nx = -sample.dy;
    const ny = sample.dx;
    const {left, right} = sample;
    const offsetLeft = halfWidth + left.offset;
    const offsetRight = halfWidth + right.offset;
    return [
        [x + nx * offsetLeft, y + ny * offsetLeft, z + left.drop],
        [x + nx * halfWidth, y + ny * halfWidth, z],
        [x - nx * halfWidth, y - ny * halfWidth, z],
        [x - nx * offsetRight, y - ny * offsetRight, z + right.drop]
    ];
}
