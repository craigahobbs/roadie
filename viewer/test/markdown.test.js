import {inlineHtml, markdownHtml} from '../lib/markdown.js';
import assert from 'node:assert/strict';
import test from 'node:test';


test('markdownHtml blocks', () => {
    assert.equal(markdownHtml(['First line', 'second line', '', '- one', '- two', '', '## Head']),
        '<p>First line\nsecond line</p>\n<ul><li><p>one</p></li><li><p>two</p></li></ul>\n<h2 id="head">Head</h2>');
    assert.equal(markdownHtml(['1. a', '2. b']), '<ol><li><p>a</p></li><li><p>b</p></li></ol>');
    assert.equal(markdownHtml(['~~~', '<x>', '~~~']), '<pre><code>&lt;x&gt;</code></pre>');
});


test('inlineHtml spans', () => {
    assert.equal(inlineHtml('**Bold:** `code` and *em*, [link](a.html) \\* <tag>'),
        '<strong>Bold:</strong> <code>code</code> and <em>em</em>, <a href="a.html">link</a> * &lt;tag&gt;');
    assert.equal(inlineHtml('20-30% grades, 5 * 3'), '20-30% grades, 5 * 3');
    assert.equal(inlineHtml('~struck~'), '<del>struck</del>');
});
