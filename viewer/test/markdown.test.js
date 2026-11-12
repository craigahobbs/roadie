import {inlineHtml, markdownEscape, markdownHtml, markdownTable} from '../lib/markdown.js';
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


test('inlineHtml line break elements', () => {
    assert.equal(inlineHtml('one<br>two<BR/>three<br />four <b>'), 'one<br>two<br>three<br>four &lt;b&gt;');
});


test('markdownHtml tables', () => {
    assert.equal(
        markdownHtml([
            'Before',
            '',
            '| Name | Count | Share |',
            '|------|------:|:-----:|',
            '| **a** \\| b | 1 | 50% |',
            '| [c](c.html) | 2<br>3 |',
            'After'
        ]),
        '<p>Before</p>\n' +
        '<table><thead><tr><th style="text-align: left">Name</th><th style="text-align: right">Count</th>' +
        '<th style="text-align: center">Share</th></tr></thead><tbody>' +
        '<tr><td style="text-align: left"><strong>a</strong> | b</td><td style="text-align: right">1</td>' +
        '<td style="text-align: center">50%</td></tr>' +
        '<tr><td style="text-align: left"><a href="c.html">c</a></td><td style="text-align: right">2<br>3</td>' +
        '<td style="text-align: center"></td></tr></tbody></table>\n' +
        '<p>After</p>'
    );

    // A table row without a separator row is a paragraph
    assert.equal(markdownHtml(['| a | b |']), '<p>| a | b |</p>');
    assert.equal(markdownHtml(['| a | b |', 'text']), '<p>| a | b |\ntext</p>');
});


test('markdownEscape', () => {
    assert.equal(markdownEscape('a*b_c [d](e) <f> #g | h-i'), 'a\\*b\\_c \\[d\\]\\(e\\) \\<f\\> \\#g \\| h\\-i');
    assert.equal(inlineHtml(markdownEscape('a*b*c [d](e)')), 'a*b*c [d](e)');
});


test('markdownTable', () => {
    assert.deepEqual(
        markdownTable(
            [['Item', 'left'], ['Quantity', 'right'], ['Mid', 'center'], ['X', 'left']],
            [['Clearing', '1,000 sf', 'a', 'wide value'], ['  B  ', '', 'abcd', 'two\nlines\n\nparagraph']]
        ),
        [
            '| Item     | Quantity | Mid  | X                          |',
            '|----------|---------:|:----:|----------------------------|',
            '| Clearing | 1,000 sf |  a   | wide value                 |',
            '| B        |          | abcd | two lines<br><br>paragraph |'
        ]
    );
    assert.deepEqual(markdownTable([['A', 'left']], []), ['| A |', '|---|']);
});
