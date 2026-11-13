import assert from 'node:assert/strict';
import {buildDoc} from '../lib/doc.js';
import {fileURLToPath} from 'node:url';
import {parseSchemaMarkdown} from 'schema-markdown/lib/parser.js';
import {readFileSync} from 'node:fs';
import {schemaDocMarkdown} from '../lib/schemaDoc.js';
import test from 'node:test';


// Read an expected output file
function expected(name) {
    return readFileSync(fileURLToPath(new URL(`expected/${name}`, import.meta.url)), 'utf-8');
}


// The expected documentation is the BareScript library's "schemaDocMarkdown" output for the same types
test('schemaDocMarkdown', () => {
    const types = parseSchemaMarkdown(expected('schemaDoc.smd'));
    const lines = [];
    for (const typeName of ['Top', 'Thing', 'Score', 'Plain']) {
        lines.push(`==== ${typeName}`, ...schemaDocMarkdown(types, typeName));
    }
    assert.equal(`${lines.join('\n')}\n`, expected('schemaDoc.md'));
});


test('schemaDocMarkdown, a struct', () => {
    const types = parseSchemaMarkdown([
        '# A point',
        'struct Point',
        '',
        '    # The east coordinate',
        '    float x',
        '',
        '    optional Label(len > 0)[len < 3] labels',
        '',
        'typedef string Label'
    ]);
    assert.deepEqual(schemaDocMarkdown(types, 'Point'), [
        '# struct Point',
        '',
        'A point',
        '',
        '| Name   | Type                       | Attributes                                   | Description         |',
        '|--------|----------------------------|----------------------------------------------|---------------------|',
        '| x      | float                      |                                              | The east coordinate |',
        '| labels | [Label](#typedef-label) [] | optional<br>len(array) < 3<br>len(value) > 0 |                     |',
        '',
        '---',
        '',
        '## Referenced Types',
        '',
        '### typedef Label',
        '',
        '| Type   |',
        '|--------|',
        '| string |'
    ]);
});


test('schemaDocMarkdown, no referenced types', () => {
    const types = parseSchemaMarkdown(['enum Side', '    left', '    right']);
    assert.deepEqual(schemaDocMarkdown(types, 'Side'), [
        '# enum Side',
        '',
        '| Value |',
        '|-------|',
        '| left  |',
        '| right |'
    ]);
});


test('schemaDocMarkdown, dicts', () => {
    const types = parseSchemaMarkdown([
        'struct Counts',
        '    int{} counts',
        '    optional string(len > 0){len > 0} names',
        '    Kind : float(>= 0, <= 1){} shares',
        '    string(len == 2) : Kind{len <= 3} kinds',
        '',
        'enum Kind',
        '    one',
        '    two'
    ]);
    assert.deepEqual(schemaDocMarkdown(types, 'Counts'), [
        '# struct Counts',
        '',
        '| Name   | Type                          | Attributes                                  |',
        '|--------|-------------------------------|---------------------------------------------|',
        '| counts | int {}                        |                                             |',
        '| names  | string {}                     | optional<br>len(dict) > 0<br>len(value) > 0 |',
        '| shares | [Kind](#enum-kind) : float {} | value >= 0<br>value <= 1                    |',
        '| kinds  | [Kind](#enum-kind) {}         | len(dict) <= 3<br>len(key) == 2             |',
        '',
        '---',
        '',
        '## Referenced Types',
        '',
        '### enum Kind',
        '',
        '| Value |',
        '|-------|',
        '| one   |',
        '| two   |'
    ]);
});


// The documentation page is the road plan model's documentation, with a link back to the plan
test('buildDoc', () => {
    const {title, html} = buildDoc({'vFile': 'a.json', 'vDoc': true, 'vOption': 1});
    assert.equal(title, 'Roadie Road Plan Model');
    assert.equal(`${html}\n`, expected('doc.html'));
    assert.deepEqual(html.split('\n').slice(0, 2), [
        '<p><a href="#var.vFile=&#039;a.json&#039;&amp;var.vOption=1">Back</a></p>',
        '<h1 id="struct-roadplan">struct RoadPlan</h1>'
    ]);

    // Without a plan, the link is to the empty viewer
    assert.equal(buildDoc({'vDoc': true}).html.split('\n')[0], '<p><a href="#var=">Back</a></p>');
});
