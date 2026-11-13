// markdown.js - a small Markdown renderer for plan and option descriptions and the model documentation: paragraphs,
// headings, lists, block quotes, code blocks, horizontal rules, tables, and inline code, emphasis, strikethrough, links,
// images, and line breaks - and Markdown text generation: escaping and tables

import {escapeHtml, headerId} from './format.js';


// Render Markdown text lines as HTML
export function markdownHtml(lines) {
    const textLines = lines.join('\n').split(/\r?\n/);
    const html = [];
    let ix = 0;
    while (ix < textLines.length) {
        const line = textLines[ix];

        // Blank line
        if (line.trim() === '') {
            ix += 1;
            continue;
        }

        // Fenced code block
        const mFence = line.match(/^\s*(```|~~~)/);
        if (mFence !== null) {
            const codeLines = [];
            ix += 1;
            while (ix < textLines.length && !textLines[ix].trim().startsWith(mFence[1])) {
                codeLines.push(textLines[ix]);
                ix += 1;
            }
            ix += 1;
            html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
            continue;
        }

        // Heading
        const mHeading = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
        if (mHeading !== null) {
            const level = mHeading[1].length;
            html.push(`<h${level} id="${escapeHtml(headerId(mHeading[2]))}">${inlineHtml(mHeading[2])}</h${level}>`);
            ix += 1;
            continue;
        }

        // Horizontal rule
        if (rRule.test(line)) {
            html.push('<hr>');
            ix += 1;
            continue;
        }

        // Table
        if (rTableRow.test(line) && ix + 1 < textLines.length && rTableSeparator.test(textLines[ix + 1])) {
            const aligns = tableCells(textLines[ix + 1]).map((cell) => (
                cell.endsWith(':') ? (cell.startsWith(':') ? 'center' : 'right') : 'left'
            ));
            const cellsHtml = (tag, cells) => aligns.map((align, ixCell) => (
                `<${tag} style="text-align: ${align}">${inlineHtml(cells[ixCell] ?? '')}</${tag}>`
            )).join('');
            const header = cellsHtml('th', tableCells(line));
            const rows = [];
            ix += 2;
            while (ix < textLines.length && rTableRow.test(textLines[ix])) {
                rows.push(`<tr>${cellsHtml('td', tableCells(textLines[ix]))}</tr>`);
                ix += 1;
            }
            html.push(`<table><thead><tr>${header}</tr></thead><tbody>${rows.join('')}</tbody></table>`);
            continue;
        }

        // List
        const mList = line.match(rListItem);
        if (mList !== null) {
            const ordered = /\d/.test(mList[2]);
            const items = [];
            while (ix < textLines.length) {
                const mItem = textLines[ix].match(rListItem);
                if (mItem !== null && /\d/.test(mItem[2]) === ordered) {
                    items.push([mItem[3]]);
                } else if (textLines[ix].trim() !== '' && /^\s/.test(textLines[ix]) && items.length > 0) {
                    items[items.length - 1].push(textLines[ix].trim());
                } else {
                    break;
                }
                ix += 1;
            }
            const tag = ordered ? 'ol' : 'ul';
            html.push(`<${tag}>${items.map((item) => `<li><p>${inlineHtml(item.join('\n'))}</p></li>`).join('')}</${tag}>`);
            continue;
        }

        // Block quote
        if (/^\s*>/.test(line)) {
            const quoteLines = [];
            while (ix < textLines.length && /^\s*>/.test(textLines[ix])) {
                quoteLines.push(textLines[ix].replace(/^\s*>\s?/, ''));
                ix += 1;
            }
            html.push(`<blockquote>${markdownHtml(quoteLines)}</blockquote>`);
            continue;
        }

        // Paragraph - a line of "=" or "-" under it makes it a heading, and a horizontal rule ends it
        const paragraphLines = [];
        let level = null;
        while (ix < textLines.length && textLines[ix].trim() !== '' && !rBlockStart.test(textLines[ix])) {
            const mUnderline = paragraphLines.length > 0 ? textLines[ix].match(rHeadingUnderline) : null;
            if (mUnderline !== null) {
                level = mUnderline[1].startsWith('=') ? 1 : 2;
                ix += 1;
                break;
            }
            if (paragraphLines.length > 0 && rRule.test(textLines[ix])) {
                break;
            }
            paragraphLines.push(textLines[ix].trim());
            ix += 1;
        }
        if (paragraphLines.length === 0) {
            paragraphLines.push(line.trim());
            ix += 1;
        }
        const text = paragraphLines.join('\n');
        html.push(
            level !== null ? `<h${level} id="${escapeHtml(headerId(text))}">${inlineHtml(text)}</h${level}>` : `<p>${inlineHtml(text)}</p>`
        );
    }
    return html.join('\n');
}

const rRule = /^\s*([-*_])(\s*\1){2,}\s*$/;
const rHeadingUnderline = /^\s*(=+|-+)\s*$/;
const rListItem = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const rTableRow = /^\s*\|.*\|\s*$/;
const rTableSeparator = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;


// Split a Markdown table row into its trimmed cell texts - an escaped pipe ("\|") doesn't end a cell
function tableCells(line) {
    return line.trim().slice(1, -1).split(/(?<!\\)\|/).map((cell) => cell.trim());
}
const rBlockStart = /^\s*(```|~~~|#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/;


// Render Markdown inline text as HTML
export function inlineHtml(text) {
    let html = '';
    let ix = 0;
    while (ix < text.length) {
        const ch = text[ix];

        // Backslash escape
        if (ch === '\\' && ix + 1 < text.length && rEscapable.test(text[ix + 1])) {
            html += escapeHtml(text[ix + 1]);
            ix += 2;
            continue;
        }

        // Inline code
        if (ch === '`') {
            const mCode = text.slice(ix).match(/^(`+)([\s\S]*?[^`])\1(?!`)/);
            if (mCode !== null) {
                html += `<code>${escapeHtml(mCode[2].trim())}</code>`;
                ix += mCode[0].length;
                continue;
            }
        }

        // Link or image
        if (ch === '[' || (ch === '!' && text[ix + 1] === '[')) {
            const mLink = text.slice(ix).match(/^(!?)\[((?:\\.|[^\]\\])*)\]\(\s*([^)\s]*)(?:\s+"([^"]*)")?\s*\)/);
            if (mLink !== null) {
                const [linkText, isImage, label, href] = mLink;
                if (isImage !== '') {
                    html += `<img src="${escapeHtml(href)}" alt="${escapeHtml(label)}">`;
                } else {
                    html += `<a href="${escapeHtml(href)}">${inlineHtml(label)}</a>`;
                }
                ix += linkText.length;
                continue;
            }
        }

        // Emphasis and strikethrough
        if (ch === '*' || ch === '_' || ch === '~') {
            const mRun = text.slice(ix).match(/^(\*\*|__|\*|_|~~|~)(?=\S)([\s\S]*?\S)\1/);
            if (mRun !== null) {
                const [runText, delim, inner] = mRun;
                const tag = delim[0] === '~' ? 'del' : (delim.length === 2 ? 'strong' : 'em');
                html += `<${tag}>${inlineHtml(inner)}</${tag}>`;
                ix += runText.length;
                continue;
            }
        }

        // Line break element
        if (ch === '<') {
            const mBreak = text.slice(ix).match(/^<br\s*\/?>/i);
            if (mBreak !== null) {
                html += '<br>';
                ix += mBreak[0].length;
                continue;
            }
        }

        // Line break
        if (ch === '\n') {
            html += '\n';
            ix += 1;
            continue;
        }

        html += escapeHtml(ch);
        ix += 1;
    }
    return html;
}

const rEscapable = /[\\`*_{}[\]()#+\-.!<>"'~|=]/;


// Escape text for Markdown
export function markdownEscape(text) {
    return text.replace(/([\\[\]()<>"'*_~`#=+|-])/g, '\\$1');
}


// Create a Markdown table's text lines - "fields" is an array of [name, align] ("left", "right", or "center") and the
// rows are arrays of cell text. A cell's line breaks become spaces, and its blank lines become line break elements.
export function markdownTable(fields, rows) {
    // Format the cells and compute the column widths
    const widths = fields.map(([name]) => name.length);
    const rowsFormat = rows.map((row) => row.map((cell, ixCell) => {
        const cellFormat = cell.trim().replace(/\r?\n(?:\r?\n)+/g, '<br><br>').replace(/\r?\n/g, ' ');
        widths[ixCell] = Math.max(widths[ixCell], cellFormat.length);
        return cellFormat;
    }));

    // The header and its separator, then the rows
    const lines = [
        `| ${fields.map(([name, align], ixField) => tableField(name, widths[ixField], align, ' ')).join(' | ')} |`,
        `|${fields.map(([, align], ixField) => (
            (align === 'center' ? ':' : '-') + tableField('', widths[ixField], align, '-') + (align === 'left' ? '-' : ':')
        )).join('|')}|`
    ];
    for (const row of rowsFormat) {
        lines.push(`| ${row.map((cell, ixCell) => tableField(cell, widths[ixCell], fields[ixCell][1], ' ')).join(' | ')} |`);
    }
    return lines;
}


// Pad a Markdown table cell's text to its column's width
function tableField(text, width, align, fill) {
    const spaces = width - text.length;
    if (align === 'right') {
        return fill.repeat(spaces) + text;
    } else if (align === 'center') {
        const spacesLeft = Math.floor(spaces / 2);
        return fill.repeat(spacesLeft) + text + fill.repeat(spaces - spacesLeft);
    }
    return text + fill.repeat(spaces);
}
