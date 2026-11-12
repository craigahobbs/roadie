// canvas.js - canvas drawing operations for the 3D explorer - the same drawing as the SVG 3D view, painted directly,
// without building and parsing SVG markup and laying out its elements

import {px} from './format.js';
import {svgPolygon, svgPolyline, svgText} from './draw.js';


// The drawing operation types
export const opCell = 0;
const opPolygonType = 1;
const opPolylineType = 2;
const opTextType = 3;
const opCircleType = 4;
const opRectType = 5;


// A terrain cell - a quadrilateral filled and outlined with the same color - its corners are the 8 coordinates at an
// offset in a coordinate array shared by the drawing's cells - with its minor and index contour segments (flat
// [x1, y1, x2, y2, ...] arrays, or null)
export function opTerrainCell(coords, offset, fill, minor, index) {
    return {'t': opCell, 'c': coords, 'o': offset, 'f': fill, 'm': minor, 'i': index};
}


export function opPolygon(coords, fill, stroke, strokeWidth, title = null, dashArray = null) {
    return {'t': opPolygonType, 'c': coords, 'f': fill, 's': stroke, 'w': strokeWidth, title, 'd': dashArray};
}


export function opPolyline(coords, stroke, strokeWidth, dashArray = null) {
    return {'t': opPolylineType, 'c': coords, 's': stroke, 'w': strokeWidth, 'd': dashArray};
}


export function opText(text, x, y, size, anchor, fill, bold) {
    return {'t': opTextType, text, x, y, size, anchor, 'f': fill, bold};
}


export function opCircle(x, y, r, fill, stroke, strokeWidth = null, fillOpacity = null) {
    return {'t': opCircleType, x, y, r, 'f': fill, 's': stroke, 'w': strokeWidth, 'o': fillOpacity};
}


export function opRect(x, y, width, height, rx, fill, fillOpacity) {
    return {'t': opRectType, x, y, width, height, rx, 'f': fill, 'o': fillOpacity};
}


// The 3D view contour style
const contourColor = 'rgba(70,50,30,0.45)';
const textAlign = {'start': 'left', 'middle': 'center', 'end': 'right'};


function tracePath(ctx, coords, close) {
    ctx.beginPath();
    ctx.moveTo(coords[0], coords[1]);
    for (let ix = 2; ix < coords.length; ix += 2) {
        ctx.lineTo(coords[ix], coords[ix + 1]);
    }
    if (close) {
        ctx.closePath();
    }
}


// A canvas 2D context wrapper that skips redundant state changes - setting a color re-parses it, even if unchanged
class Painter {
    constructor(ctx) {
        this.ctx = ctx;
        this.fill = null;
        this.stroke = null;
        this.width = null;
        this.cap = null;
        this.join = null;
        ctx.miterLimit = 4;
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }

    fillStyle(value) {
        if (value !== this.fill) {
            this.fill = value;
            this.ctx.fillStyle = value;
        }
    }

    strokeStyle(value, width, cap, join) {
        const {ctx} = this;
        if (value !== this.stroke) {
            this.stroke = value;
            ctx.strokeStyle = value;
        }
        if (width !== this.width) {
            this.width = width;
            ctx.lineWidth = width;
        }
        if (cap !== this.cap) {
            this.cap = cap;
            ctx.lineCap = cap;
        }
        if (join !== this.join) {
            this.join = join;
            ctx.lineJoin = join;
        }
    }
}


function strokeSegments(painter, segments, width) {
    const {ctx} = painter;
    ctx.beginPath();
    for (let ix = 0; ix < segments.length; ix += 4) {
        ctx.moveTo(segments[ix], segments[ix + 1]);
        ctx.lineTo(segments[ix + 2], segments[ix + 3]);
    }
    painter.strokeStyle(contourColor, width, 'round', 'miter');
    ctx.stroke();
}


// Paint drawing operations on a canvas 2D context
export function paintOps(ctx, ops) {
    const painter = new Painter(ctx);
    for (const op of ops) {
        const type = op.t;
        if (type === opCell) {
            const {c, o} = op;
            ctx.beginPath();
            ctx.moveTo(c[o], c[o + 1]);
            ctx.lineTo(c[o + 2], c[o + 3]);
            ctx.lineTo(c[o + 4], c[o + 5]);
            ctx.lineTo(c[o + 6], c[o + 7]);
            ctx.closePath();
            painter.fillStyle(op.f);
            ctx.fill();
            painter.strokeStyle(op.f, 0.6, 'butt', 'miter');
            ctx.stroke();
            if (op.m !== null) {
                strokeSegments(painter, op.m, 0.5);
            }
            if (op.i !== null) {
                strokeSegments(painter, op.i, 1.2);
            }
        } else if (type === opPolygonType || type === opPolylineType) {
            const isPolygon = type === opPolygonType;
            tracePath(ctx, op.c, isPolygon);
            if (isPolygon && op.f !== 'none') {
                painter.fillStyle(op.f);
                ctx.fill();
            }
            if (op.d !== null) {
                ctx.setLineDash(op.d.split(' ').map(Number));
            }
            painter.strokeStyle(op.s, op.w, isPolygon ? 'butt' : 'round', isPolygon ? 'miter' : 'round');
            ctx.stroke();
            if (op.d !== null) {
                ctx.setLineDash([]);
            }
        } else if (type === opTextType) {
            ctx.font = `${op.bold ? 'bold ' : ''}${op.size}px sans-serif`;
            ctx.textAlign = textAlign[op.anchor];
            ctx.textBaseline = 'middle';
            painter.strokeStyle('white', 3, 'butt', 'miter');
            ctx.strokeText(op.text, op.x, op.y);
            painter.fillStyle(op.f);
            ctx.fillText(op.text, op.x, op.y);
        } else if (type === opCircleType) {
            ctx.beginPath();
            ctx.arc(op.x, op.y, op.r, 0, 2 * Math.PI);
            ctx.globalAlpha = op.o ?? 1;
            painter.fillStyle(op.f);
            ctx.fill();
            ctx.globalAlpha = 1;
            painter.strokeStyle(op.s, op.w ?? 1, 'butt', 'miter');
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.roundRect(op.x, op.y, op.width, op.height, op.rx);
            ctx.globalAlpha = op.o;
            painter.fillStyle(op.f);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
}


// Determine if a point is inside a polygon of a flat array of coordinates (from the start index to the end index)
function pointInCoords(x, y, coords, start = 0, end = coords.length) {
    let inside = false;
    for (let ix = start, jx = end - 2; ix < end; jx = ix, ix += 2) {
        const yi = coords[ix + 1];
        const yj = coords[jx + 1];
        if ((yi > y) !== (yj > y) && x < (coords[jx] - coords[ix]) * (y - yi) / (yj - yi) + coords[ix]) {
            inside = !inside;
        }
    }
    return inside;
}


// Find the title of the topmost filled shape at a point (an SVG element's tooltip), or null
export function hitTitle(ops, x, y) {
    for (let ixOp = ops.length - 1; ixOp >= 0; ixOp--) {
        const op = ops[ixOp];
        if (op.t === opCell ? pointInCoords(x, y, op.c, op.o, op.o + 8) : (op.t === opPolygonType && op.f !== 'none' && pointInCoords(x, y, op.c))) {
            return op.title ?? null;
        }
    }
    return null;
}


// Convert drawing operations to SVG markup - the 3D view's SVG elements (for checking the canvas drawing)
export function opsToSvg(ops) {
    let svg = '';
    for (const op of ops) {
        const type = op.t;
        if (type === opCell) {
            const {c, o} = op;
            svg += `<polygon points="${px(c[o])},${px(c[o + 1])} ${px(c[o + 2])},${px(c[o + 3])} ${px(c[o + 4])},${px(c[o + 5])} ` +
                `${px(c[o + 6])},${px(c[o + 7])}" ` +
                `fill="${op.f}" stroke="${op.f}" stroke-width="0.6"/>`;
            for (const [segments, width] of [[op.m, 0.5], [op.i, 1.2]]) {
                if (segments !== null) {
                    let path = '';
                    for (let ix = 0; ix < segments.length; ix += 4) {
                        path += `M${px(segments[ix])} ${px(segments[ix + 1])}L${px(segments[ix + 2])} ${px(segments[ix + 3])}`;
                    }
                    svg += `<path d="${path}" fill="none" stroke="${contourColor}" stroke-width="${width}" stroke-linecap="round"/>`;
                }
            }
        } else if (type === opPolygonType) {
            svg += svgPolygon(op.c, op.f, op.s, op.w, op.title, op.d !== null ? ` stroke-dasharray="${op.d}"` : '');
        } else if (type === opPolylineType) {
            svg += svgPolyline(op.c, op.s, op.w, op.d);
        } else if (type === opTextType) {
            svg += svgText(op.text, op.x, op.y, op.size, op.anchor, op.f, op.bold);
        } else if (type === opCircleType) {
            svg += `<circle cx="${px(op.x)}" cy="${px(op.y)}" r="${op.r}" fill="${op.f}"${op.o !== null ? ` fill-opacity="${op.o}"` : ''} ` +
                `stroke="${op.s}"${op.w !== null ? ` stroke-width="${op.w}"` : ''}/>`;
        } else {
            svg += `<rect x="${op.x}" y="${op.y}" width="${op.width}" height="${op.height}" rx="${op.rx}" fill="${op.f}" fill-opacity="${op.o}"/>`;
        }
    }
    return svg;
}
