import assert from 'node:assert/strict';
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
