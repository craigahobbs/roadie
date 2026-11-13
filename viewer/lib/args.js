// args.js - the viewer's URL hash arguments
//
// The URL hash's "var" arguments are the original MarkdownUp Roadie viewer's - "#var.vFile='plan.json'&var.vOption=1" -
// so links to it still work.

import {encodeComponent, escapeHtml} from './format.js';


// The viewer's URL arguments
export const roadieArguments = [
    {'name': 'file', 'type': 'string', 'description': 'The road plan model JSON file URL'},
    {'name': 'option', 'type': 'int', 'default': 0, 'description': 'The selected road plan option index'},
    {'name': 'azimuth', 'type': 'float', 'default': 30, 'description': 'The 3D explorer view direction, in compass degrees'},
    {'name': 'tilt', 'type': 'float', 'default': 35, 'description': 'The 3D explorer view elevation angle, in degrees'},
    {'name': 'exaggeration', 'type': 'float', 'default': 1.5, 'description': 'The 3D explorer vertical exaggeration'},
    {'name': 'zoom', 'type': 'float', 'default': 1, 'description': 'The 3D explorer zoom factor (1 fits the site)'},
    {'name': 'x', 'type': 'float', 'description': 'The 3D explorer view center east coordinate (default is the site center)'},
    {'name': 'y', 'type': 'float', 'description': 'The 3D explorer view center north coordinate (default is the site center)'},
    {'name': 'z', 'type': 'float', 'description': 'The 3D explorer view center elevation (default is the ground elevation)'},
    {'name': 'explore', 'type': 'bool', 'default': false, 'explicit': true, 'description': 'Show the full-window 3D explorer'},
    {'name': 'doc', 'type': 'bool', 'default': false, 'explicit': true, 'description': 'Show the model documentation'}
];


// Get an argument's global variable name (e.g. "vFile")
function globalName(argument) {
    return `v${argument.name.charAt(0).toUpperCase()}${argument.name.slice(1)}`;
}


// Parse a URL hash - returns the hash variables object (global name to value) and the header ID, if any. A plain
// "url" argument (e.g. "#url=plans/site.json") is the plan file URL, unless "var.vFile" is given.
export function parseHash(hash) {
    const globals = {};
    let headerId = null;
    let url = null;
    const text = hash.startsWith('#') ? hash.slice(1) : hash;
    for (const part of text.split('&')) {
        if (part === '') {
            continue;
        }
        const ixEquals = part.indexOf('=');
        if (ixEquals === -1) {
            headerId = decode(part);
            continue;
        }
        const key = decode(part.slice(0, ixEquals));
        if (key.startsWith('var.')) {
            const value = parseLiteral(decode(part.slice(ixEquals + 1)));
            if (value !== undefined) {
                globals[key.slice(4)] = value;
            }
        } else if (key === 'url') {
            url = decode(part.slice(ixEquals + 1));
        }
    }
    if (url !== null && url !== '' && !('vFile' in globals)) {
        globals.vFile = url;
    }
    return {globals, headerId};
}


function decode(text) {
    try {
        return decodeURIComponent(text.replace(/\+/g, ' '));
    } catch {
        return text;
    }
}


// Parse a hash variable's expression - a number, string, boolean, or null literal (undefined if invalid)
const rNumber = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
const rString = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/;

export function parseLiteral(text) {
    const expr = text.trim();
    if (expr === 'true' || expr === 'false') {
        return expr === 'true';
    } else if (expr === 'null') {
        return null;
    } else if (rNumber.test(expr)) {
        return parseFloat(expr);
    }
    const mString = expr.match(rString);
    if (mString !== null) {
        return mString[2].replace(/\\(u[0-9a-fA-F]{4}|.)/g, (match, escape) => {
            if (escape.length === 5) {
                return String.fromCharCode(parseInt(escape.slice(1), 16));
            }
            return {'n': '\n', 'r': '\r', 't': '\t'}[escape] ?? escape;
        });
    }
    return undefined;
}


// Validate an argument value's type - an invalid value is null
function validateValue(value, type) {
    if (value === null || value === undefined) {
        return null;
    }
    if (type === 'bool') {
        if (typeof value === 'number' && (value === 0 || value === 1)) {
            return value === 1;
        }
        return typeof value === 'boolean' ? value : null;
    } else if (type === 'float') {
        return typeof value === 'number' ? value : null;
    } else if (type === 'int') {
        return typeof value === 'number' && Math.floor(value) === value ? value : null;
    }
    return typeof value === 'string' ? value : null;
}


// Parse the arguments from the hash variables - returns the arguments object (argument name to value, with defaults)
export function argsParse(globals) {
    const args = {};
    for (const argument of roadieArguments) {
        const value = validateValue(globals[globalName(argument)], argument.type) ?? argument.default ?? null;
        if (value !== null) {
            args[argument.name] = value;
        }
    }
    return args;
}


// Format an argument value for the URL
function formatValue(value, type) {
    if (type === 'string') {
        return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    }
    return `${value}`;
}


// Create a viewer URL (a hash) - the link arguments override the current hash variables (a null value removes it), and
// arguments with default values are omitted
export function argsURL(globals, linkArgs = null) {
    const urlVars = [];
    for (const argument of roadieArguments) {
        const global = globalName(argument);
        let value = null;
        if (linkArgs !== null && Object.hasOwn(linkArgs, argument.name)) {
            value = validateValue(linkArgs[argument.name], argument.type);
        } else if (!argument.explicit) {
            value = validateValue(globals[global], argument.type);
        }
        if (value !== null && (argument.default === undefined || value !== argument.default)) {
            urlVars.push(`var.${global}=${encodeComponent(formatValue(value, argument.type))}`);
        }
    }
    urlVars.sort();
    return `#${urlVars.length > 0 ? urlVars.join('&') : 'var='}`;
}


// Create a viewer link's HTML
export function argsLink(globals, text, linkArgs = null) {
    return `<a href="${escapeHtml(argsURL(globals, linkArgs))}">${escapeHtml(text)}</a>`;
}
