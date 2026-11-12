// format.js - number, station, text, and URL formatting
//
// The number formatting matches the Roadie viewer's exactly, so the viewer's drawings are identical.


// Round a number to a number of decimal digits (half away from zero rounds up, like Math.round)
export function round(value, digits = 0) {
    const multiplier = 10 ** digits;
    return Math.round(value * multiplier) / multiplier;
}


// Format a number with a fixed number of decimal digits
export function fixed(value, digits) {
    return value.toFixed(digits);
}


// Format a number with a fixed number of decimal digits, without an all-zero fraction (e.g. "12" not "12.0")
export function fixedTrim(value, digits) {
    const text = value.toFixed(digits);
    const ixDot = text.length - digits - 1;
    for (let ix = ixDot + 1; ix < text.length; ix++) {
        if (text.charCodeAt(ix) !== 48) {
            return text;
        }
    }
    return text.slice(0, ixDot);
}


// Format a pixel coordinate - one decimal digit, without an all-zero fraction. This is called for every drawn
// point, so the common case is computed with integer math: when the value's tenths aren't within a rounding
// error of a half, rounding the scaled value is exactly toFixed's result.
export function px(value) {
    const negative = value < 0;
    const absolute = negative ? -value : value;
    const scaled = absolute * 10;
    if (scaled < 1e8) {
        const floor = Math.floor(scaled);
        const fraction = scaled - floor;
        if (fraction < 0.4999999 || fraction > 0.5000001) {
            const tenths = fraction < 0.5 ? floor : floor + 1;
            const whole = Math.floor(tenths / 10);
            const tenth = tenths - whole * 10;
            return (negative ? '-' : '') + (tenth === 0 ? whole : `${whole}.${tenth}`);
        }
    }
    return fixedTrim(value, 1);
}


// Format a station - distance along the road centerline (e.g. "12+50" feet or "1+250" meters)
export function station(value, units) {
    const base = units === 'feet' ? 100 : 1000;
    const digits = units === 'feet' ? 2 : 3;
    const rounded = Math.round(value);
    const major = Math.floor(rounded / base);
    const minor = `${rounded - major * base}`;
    return `${major}+${'0'.repeat(Math.max(0, digits - minor.length))}${minor}`;
}


// Format a number with thousands separators
export function number(value, digits) {
    const text = Math.abs(value).toFixed(digits);
    const ixDot = text.indexOf('.');
    let intText = ixDot === -1 ? text : text.slice(0, ixDot);
    const fracText = ixDot === -1 ? '' : text.slice(ixDot);
    const groups = [];
    while (intText.length > 3) {
        groups.push(intText.slice(intText.length - 3));
        intText = intText.slice(0, intText.length - 3);
    }
    groups.push(intText);
    const sign = value < 0 && round(value, digits) !== 0 ? '-' : '';
    return sign + groups.reverse().join(',') + fracText;
}


// Get a quantity type's display unit label
export function unitLabel(units, quantityType) {
    if (quantityType === 'length') {
        return units === 'feet' ? 'ft' : 'm';
    } else if (quantityType === 'area') {
        return units === 'feet' ? 'sf' : 'm²';
    } else if (quantityType === 'volume') {
        return units === 'feet' ? 'cy' : 'm³';
    }
    return units === 'feet' ? 'cy-mi' : 'm³-km';
}


// Convert a quantity from plan units to display units
export function displayQuantity(units, quantityType, quantity) {
    if (quantityType === 'volume') {
        return units === 'feet' ? quantity / 27 : quantity;
    } else if (quantityType === 'haul') {
        return units === 'feet' ? quantity / 27 / 5280 : quantity / 1000;
    }
    return quantity;
}


// Escape text for HTML (element text and attribute values)
const rHtmlEscape = /[&<>"']/g;
const htmlEscapes = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'};

export function escapeHtml(text) {
    return rHtmlEscape.test(text) ? text.replace(rHtmlEscape, (ch) => htmlEscapes[ch]) : text;
}


// Percent-encode a URL component - parentheses are encoded, too
export function encodeComponent(text) {
    return encodeURIComponent(text).replace(/\(/g, '%28').replace(/\)/g, '%29');
}


// Percent-encode a URL - parentheses are encoded, too
export function encodeUrl(text) {
    return encodeURI(text).replace(/\(/g, '%28').replace(/\)/g, '%29');
}


// Generate a header element ID from header text
export function headerId(text) {
    return text.toLowerCase().replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9]+$/, '').replace(/['"]/g, '').
        replace(/[^a-z0-9]+/g, '-');
}
