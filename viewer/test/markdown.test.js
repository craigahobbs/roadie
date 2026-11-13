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


test('markdownHtml, no text', () => {
    assert.equal(markdownHtml([]), '');
    assert.equal(markdownHtml(['', '  ']), '');
});


test('markdownHtml paragraphs', () => {
    // Lines may contain line breaks, and blank lines separate paragraphs
    assert.equal(markdownHtml(['', 'one\ntwo', '  three  ', '', 'four']), '<p>one\ntwo\nthree</p>\n<p>four</p>');

    // A block ends a paragraph
    assert.equal(
        markdownHtml(['text', '# Head', 'more', '> quote', 'more', '- item', '```', 'code', '```', 'more', '1. one']),
        '<p>text</p>\n<h1 id="head">Head</h1>\n<p>more</p>\n<blockquote><p>quote</p></blockquote>\n<p>more</p>\n' +
        '<ul><li><p>item</p></li></ul>\n<pre><code>code</code></pre>\n<p>more</p>\n<ol><li><p>one</p></li></ol>'
    );
});


test('markdownHtml headings', () => {
    assert.equal(
        markdownHtml(['# One #', '###### Six', '  ## Indented **bold** ##  ', '### Cost (ft)']),
        '<h1 id="one">One</h1>\n<h6 id="six">Six</h6>\n<h2 id="indented-bold">Indented <strong>bold</strong></h2>\n' +
        '<h3 id="cost-ft">Cost (ft)</h3>'
    );

    // More than six hash characters, or no space, isn't a heading
    assert.equal(markdownHtml(['####### Seven', '#NoSpace']), '<p>####### Seven\n#NoSpace</p>');
});


test('markdownHtml horizontal rules', () => {
    assert.equal(markdownHtml(['one', '', '---', '* * *', '_____', 'two']), '<p>one</p>\n<hr>\n<hr>\n<hr>\n<p>two</p>');
    assert.equal(markdownHtml(['--']), '<p>--</p>');
});


test('markdownHtml code blocks', () => {
    assert.equal(
        markdownHtml(['```js', 'const x = 1 < 2;', '', '# not a heading', '```', 'text']),
        '<pre><code>const x = 1 &lt; 2;\n\n# not a heading</code></pre>\n<p>text</p>'
    );

    // An unterminated code block ends at the end of the text
    assert.equal(markdownHtml(['```', 'code']), '<pre><code>code</code></pre>');
});


test('markdownHtml lists', () => {
    // An indented line continues an item, and an item of the other kind begins a new list
    assert.equal(
        markdownHtml(['- one', '  more *text*', '* two', '+ three', '1. four', '2) five', '   more', 'text']),
        '<ul><li><p>one\nmore <em>text</em></p></li><li><p>two</p></li><li><p>three</p></li></ul>\n' +
        '<ol><li><p>four</p></li><li><p>five\nmore</p></li></ol>\n<p>text</p>'
    );
});


test('markdownHtml block quotes', () => {
    assert.equal(
        markdownHtml(['> quote *one*', '> - item', '>', '>> nested', 'after']),
        '<blockquote><p>quote <em>one</em></p>\n<ul><li><p>item</p></li></ul>\n<blockquote><p>nested</p></blockquote></blockquote>\n' +
        '<p>after</p>'
    );
});


// A list item or heading line with a Unicode line separator isn't a list item or heading - it's a paragraph
test('markdownHtml, a block start that is not a block', () => {
    assert.equal(markdownHtml(['- one\u2028two', 'three']), '<p>- one\u2028two</p>\n<p>three</p>');
    assert.equal(markdownHtml(['# one\u2028two']), '<p># one\u2028two</p>');
});


test('markdownHtml tables, header only and extra cells', () => {
    assert.equal(
        markdownHtml(['| a |', '|:-:|', '| 1 | extra |', '', '| x | y |', '| - | - |']),
        '<table><thead><tr><th style="text-align: center">a</th></tr></thead><tbody>' +
        '<tr><td style="text-align: center">1</td></tr></tbody></table>\n' +
        '<table><thead><tr><th style="text-align: left">x</th><th style="text-align: left">y</th></tr></thead><tbody></tbody></table>'
    );
});


test('inlineHtml links and images', () => {
    assert.equal(
        inlineHtml('![alt *text*](img.png "Title") and [a **b**](http://x.com/?a=1&b=2 "Title")'),
        '<img src="img.png" alt="alt *text*"> and <a href="http://x.com/?a=1&amp;b=2">a <strong>b</strong></a>'
    );
    assert.equal(inlineHtml('[link \\] text](url) [](empty) ![](i.png)'),
        '<a href="url">link ] text</a> <a href="empty"></a> <img src="i.png" alt="">');

    // Not links
    assert.equal(inlineHtml('!bang [not a link] [x](y'), '!bang [not a link] [x](y');
});


test('inlineHtml emphasis', () => {
    assert.equal(inlineHtml('__bold__ _em_ ~~del~~ **a *b* c**'),
        '<strong>bold</strong> <em>em</em> <del>del</del> <strong>a <em>b</em> c</strong>');

    // Delimiters followed by a space, and unmatched delimiters, are text
    assert.equal(inlineHtml('* not * _ no_ ** x'), '* not * _ no_ ** x');
});


test('inlineHtml code and escapes', () => {
    assert.equal(inlineHtml('``a ` b`` `<c>` `unterminated'), '<code>a ` b</code> <code>&lt;c&gt;</code> `unterminated');

    // A backslash escapes punctuation only
    assert.equal(inlineHtml('\\`not code\\` \\q \\\\ \\<br> end\\'), '`not code` \\q \\ &lt;br&gt; end\\');
});


test('inlineHtml text', () => {
    assert.equal(inlineHtml(''), '');
    assert.equal(inlineHtml('a\nb 1 < 2 & "q" \'s\''), 'a\nb 1 &lt; 2 &amp; &quot;q&quot; &#039;s&#039;');
});


test('markdownEscape, every escaped character', () => {
    assert.equal(markdownEscape('\\ [ ] ( ) < > " \' * _ ~ ` # = + | - plain.'),
        '\\\\ \\[ \\] \\( \\) \\< \\> \\" \\\' \\* \\_ \\~ \\` \\# \\= \\+ \\| \\- plain.');
});


test('markdownTable, cell line breaks', () => {
    assert.deepEqual(
        markdownTable([['A', 'center'], ['B', 'right']], [['x', 'y'], ['long value', '1\r\n\r\n2\r\n3']]),
        [
            '|     A      |            B |',
            '|:----------:|-------------:|',
            '|     x      |            y |',
            '| long value | 1<br><br>2 3 |'
        ]
    );
});
