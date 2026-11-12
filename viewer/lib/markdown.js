// markdown.js - a small Markdown renderer for plan and option descriptions: paragraphs, headings, lists, block quotes,
// code blocks, horizontal rules, and inline code, emphasis, strikethrough, links, and images

import {escapeHtml, headerId} from './format.js';


// Render Markdown text lines as HTML
export function markdownHtml(lines) {
    const textLines = lines.join('\n').split('\n');
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
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
            html.push('<hr>');
            ix += 1;
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

        // Paragraph
        const paragraphLines = [];
        while (ix < textLines.length && textLines[ix].trim() !== '' && !rBlockStart.test(textLines[ix])) {
            paragraphLines.push(textLines[ix].trim());
            ix += 1;
        }
        if (paragraphLines.length === 0) {
            paragraphLines.push(line.trim());
            ix += 1;
        }
        html.push(`<p>${inlineHtml(paragraphLines.join('\n'))}</p>`);
    }
    return html.join('\n');
}

const rListItem = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
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
