import {argsLink, argsParse, argsURL, parseHash, parseLiteral, roadieArguments} from '../lib/args.js';
import assert from 'node:assert/strict';
import test from 'node:test';


test('roadieArguments', () => {
    assert.deepEqual(
        roadieArguments.map((argument) => [argument.name, argument.type, argument.default ?? null, argument.explicit ?? false]),
        [
            ['file', 'string', null, false],
            ['option', 'int', 0, false],
            ['azimuth', 'float', 30, false],
            ['tilt', 'float', 35, false],
            ['exaggeration', 'float', 1.5, false],
            ['zoom', 'float', 1, false],
            ['x', 'float', null, false],
            ['y', 'float', null, false],
            ['z', 'float', null, false],
            ['explore', 'bool', false, true],
            ['doc', 'bool', false, true]
        ]
    );
});


test('parseHash', () => {
    const {globals, headerId} = parseHash("#var.vFile='plans%2Fa%20b.json'&var.vOption=2&var.vSmooth=true&cost");
    assert.deepEqual(globals, {'vFile': 'plans/a b.json', 'vOption': 2, 'vSmooth': true});
    assert.equal(headerId, 'cost');
    assert.deepEqual(parseHash('#var=').globals, {});
    assert.deepEqual(parseHash('#var.vX=bogus(1)&var.vY=-1.5e2').globals, {'vY': -150});
    assert.deepEqual(parseHash('#url=plans%2Fsite.json&var.vOption=1').globals, {'vFile': 'plans/site.json', 'vOption': 1});
    assert.deepEqual(parseHash("#url=a.json&var.vFile='b.json'").globals, {'vFile': 'b.json'});
    assert.deepEqual(parseHash('#url=').globals, {});
});


test('parseHash, no hash character, empty parts, and no arguments', () => {
    assert.deepEqual(parseHash('var.vOption=1'), {'globals': {'vOption': 1}, 'headerId': null});
    assert.deepEqual(parseHash('#&var.vOption=1&&cost&'), {'globals': {'vOption': 1}, 'headerId': 'cost'});
    assert.deepEqual(parseHash(''), {'globals': {}, 'headerId': null});
    assert.deepEqual(parseHash('#'), {'globals': {}, 'headerId': null});
});


test('parseHash, decoding', () => {
    // A plus is a space, and only the first equals sign separates the key and the value
    assert.deepEqual(parseHash("#a+b&var.vFile='a+b=c.json'&other=1&var.vTilt=+50"),
        {'globals': {'vFile': 'a b=c.json', 'vTilt': 50}, 'headerId': 'a b'});

    // Invalid percent-encoding isn't decoded
    assert.deepEqual(parseHash('#%zz'), {'globals': {}, 'headerId': '%zz'});
    assert.deepEqual(parseHash("#var.vFile='a%zz'"), {'globals': {'vFile': 'a%zz'}, 'headerId': null});
});


test('parseLiteral', () => {
    assert.equal(parseLiteral("'it\\'s'"), "it's");
    assert.equal(parseLiteral('"a\\\\b"'), 'a\\b');
    assert.equal(parseLiteral('null'), null);
    assert.equal(parseLiteral('false'), false);
    assert.equal(parseLiteral('x'), undefined);
});


test('parseLiteral, numbers and booleans', () => {
    assert.equal(parseLiteral(' 12 '), 12);
    assert.equal(parseLiteral('.5'), 0.5);
    assert.equal(parseLiteral('5.'), 5);
    assert.equal(parseLiteral('-1.5e-2'), -0.015);
    assert.equal(parseLiteral('+1E2'), 100);
    assert.equal(parseLiteral('true'), true);
    assert.equal(parseLiteral('1e'), undefined);
    assert.equal(parseLiteral('0x10'), undefined);
    assert.equal(parseLiteral(''), undefined);
});


test('parseLiteral, strings', () => {
    assert.equal(parseLiteral("''"), '');
    assert.equal(parseLiteral('"say \\"hi\\""'), 'say "hi"');
    assert.equal(parseLiteral("'a\"b'"), 'a"b');

    // Escapes - a Unicode character, a newline, a carriage return, a tab, and any other character
    assert.equal(parseLiteral("'\\u0041b\\n\\r\\t\\q'"), 'Ab\n\r\tq');

    // An unescaped quote and an unterminated string are invalid
    assert.equal(parseLiteral("'a'b'"), undefined);
    assert.equal(parseLiteral("'unterminated"), undefined);
});


test('argsParse validates types and applies defaults', () => {
    const args = argsParse({'vFile': 'a.json', 'vOption': 1.5, 'vTilt': 50, 'vExplore': 1, 'vX': 'bad'});
    assert.deepEqual(args, {
        'file': 'a.json', 'option': 0, 'azimuth': 30, 'tilt': 50, 'exaggeration': 1.5, 'zoom': 1, 'explore': true, 'doc': false
    });

    // The MarkdownUp viewer's "smooth" argument is ignored, and dropped from links
    assert.equal(argsURL({'vFile': 'a.json', 'vSmooth': true}), "#var.vFile='a.json'");
});


test('argsParse', () => {
    // The defaults
    assert.deepEqual(argsParse({}),
        {'option': 0, 'azimuth': 30, 'tilt': 35, 'exaggeration': 1.5, 'zoom': 1, 'explore': false, 'doc': false});

    // Valid values
    assert.deepEqual(
        argsParse({
            'vFile': 'plans/a.json', 'vOption': 3, 'vAzimuth': 120.5, 'vTilt': 60, 'vExaggeration': 2.5, 'vZoom': 4, 'vX': 1.5, 'vY': -2,
            'vZ': 0, 'vExplore': true, 'vDoc': 0
        }),
        {
            'file': 'plans/a.json', 'option': 3, 'azimuth': 120.5, 'tilt': 60, 'exaggeration': 2.5, 'zoom': 4, 'x': 1.5, 'y': -2, 'z': 0,
            'explore': true, 'doc': false
        }
    );

    // Invalid values - a number file, a string option, non-boolean and non-0/1 flags, a null azimuth, and a boolean zoom
    assert.deepEqual(
        argsParse({'vFile': 5, 'vOption': '1', 'vExplore': 'yes', 'vDoc': 2, 'vAzimuth': null, 'vZoom': true}),
        {'option': 0, 'azimuth': 30, 'tilt': 35, 'exaggeration': 1.5, 'zoom': 1, 'explore': false, 'doc': false}
    );
});


test('argsURL keeps the current arguments, omits defaults and explicit arguments, and sorts', () => {
    const globals = {'vFile': "it's.json", 'vOption': 1, 'vExplore': true, 'vZoom': 1};
    assert.equal(argsURL(globals), "#var.vFile='it%5C's.json'&var.vOption=1");
    assert.equal(argsURL(globals, {'option': 0, 'explore': true, 'x': 10.5}),
        "#var.vExplore=true&var.vFile='it%5C's.json'&var.vX=10.5");
    assert.equal(argsURL({}, {'doc': null}), '#var=');
    assert.equal(argsURL({'vFile': 'a (1).json'}), "#var.vFile='a%20%281%29.json'");
    assert.equal(argsLink({}, 'A & B', {'option': 2}), '<a href="#var.vOption=2">A &amp; B</a>');
});


test('argsURL', () => {
    // Boolean arguments - 1 is true, and false is the default
    assert.equal(argsURL({'vExplore': 0}, {'explore': 1}), '#var.vExplore=true');
    assert.equal(argsURL({}, {'explore': false, 'doc': 0}), '#var=');
    assert.equal(argsURL({'vDoc': true}), '#var=');
    assert.equal(argsURL({'vDoc': true}, {'doc': true}), '#var.vDoc=true');

    // A backslash is escaped, default values are omitted, and a zero isn't a default
    assert.equal(argsURL({'vFile': 'a\\b.json', 'vAzimuth': 30, 'vTilt': 35.5, 'vZ': 0}),
        "#var.vFile='a%5C%5Cb.json'&var.vTilt=35.5&var.vZ=0");

    // A null link argument removes the argument, and invalid values are omitted
    assert.equal(argsURL({'vFile': 'a.json', 'vOption': 2}, {'file': null, 'option': 'bad'}), '#var=');
    assert.equal(argsURL({'vOption': 1.5, 'vFile': 7}), '#var=');

    // The URL's string arguments parse back to their values
    const globals = {'vFile': "a\\b 'c'.json"};
    assert.equal(argsURL(globals), "#var.vFile='a%5C%5Cb%20%5C'c%5C'.json'");
    assert.deepEqual(parseHash(argsURL(globals)).globals, globals);
});


test('argsLink', () => {
    assert.equal(argsLink({'vFile': 'a&b.json'}, '<3D>'), '<a href="#var.vFile=&#039;a%26b.json&#039;">&lt;3D&gt;</a>');
    assert.equal(argsLink({'vFile': "it's.json"}, 'Explore', {'explore': true}),
        '<a href="#var.vExplore=true&amp;var.vFile=&#039;it%5C&#039;s.json&#039;">Explore</a>');
});
