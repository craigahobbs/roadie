// compare.js - compare two rendered HTML pages element by element, ignoring attribute order, whitespace, header IDs, and
// classes - for checking the viewer's output against the MarkdownUp Roadie viewer's ("bare -l" HTML)
//
// usage: node tools/compare.js <reference.html> <new.html> [--max <n>]

import process from 'node:process';
import {readFileSync} from 'node:fs';


const voidElements = new Set(['br', 'hr', 'img', 'link', 'meta', 'input']);
const ignoreElements = new Set(['html', 'head', 'body', 'link', 'meta', '!DOCTYPE']);
const ignoreAttrs = new Set(['xmlns', 'class', 'id', 'data-view']);


function decodeEntities(text) {
    return text.replace(/&(amp|lt|gt|quot|#039|#39|apos);/g, (match, name) => (
        {'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', '#039': "'", '#39': "'", 'apos': "'"}[name]
    ));
}


// Tokenize HTML into an array of normalized token strings
export function tokenize(html) {
    const tokens = [];
    const rToken = /<(\/?)([!\w-]+)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
    for (const match of html.matchAll(rToken)) {
        const [, closing, tag, attrText, selfClosing, text] = match;
        if (text !== undefined) {
            const normalized = decodeEntities(text).replace(/\s+/g, ' ').trim();
            if (normalized !== '') {
                tokens.push(`text: ${normalized}`);
            }
            continue;
        }
        if (ignoreElements.has(tag)) {
            continue;
        }
        if (closing === '/') {
            if (!voidElements.has(tag)) {
                tokens.push(`</${tag}>`);
            }
            continue;
        }
        const attrs = [];
        for (const attrMatch of attrText.matchAll(/([^\s=>/]+)(?:="([^"]*)")?/g)) {
            if (!ignoreAttrs.has(attrMatch[1])) {
                attrs.push(`${attrMatch[1]}="${decodeEntities(attrMatch[2] ?? '')}"`);
            }
        }
        attrs.sort();
        tokens.push(`<${tag}${attrs.length ? ' ' : ''}${attrs.join(' ')}>`);
        if (selfClosing === '/' || voidElements.has(tag)) {
            if (!voidElements.has(tag)) {
                tokens.push(`</${tag}>`);
            }
        }
    }
    return tokens;
}


function main(argv) {
    const [refPath, newPath] = argv;
    const ixMax = argv.indexOf('--max');
    const maxDiffs = ixMax !== -1 ? parseInt(argv[ixMax + 1], 10) : 10;
    const refTokens = tokenize(readFileSync(refPath, 'utf-8'));
    const newTokens = tokenize(readFileSync(newPath, 'utf-8'));
    let diffs = 0;
    const count = Math.max(refTokens.length, newTokens.length);
    for (let ix = 0; ix < count && diffs < maxDiffs; ix++) {
        if (refTokens[ix] !== newTokens[ix]) {
            diffs += 1;
            process.stdout.write(`token ${ix}:\n  ref: ${(refTokens[ix] ?? '<end>').slice(0, 400)}\n` +
                `  new: ${(newTokens[ix] ?? '<end>').slice(0, 400)}\n`);
        }
    }
    process.stdout.write(`${refTokens.length} reference tokens, ${newTokens.length} new tokens - ` +
        `${diffs === 0 ? 'identical' : `${diffs}${diffs >= maxDiffs ? '+' : ''} differences`}\n`);
    process.exit(diffs === 0 ? 0 : 1);
}


if (process.argv[1].endsWith('compare.js')) {
    main(process.argv.slice(2));
}
