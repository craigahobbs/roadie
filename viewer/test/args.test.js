import {argsLink, argsParse, argsURL, parseHash, parseLiteral} from '../lib/args.js';
import assert from 'node:assert/strict';
import test from 'node:test';


test('parseHash', () => {
    const {globals, headerId} = parseHash("#var.vFile='plans%2Fa%20b.json'&var.vOption=2&var.vSmooth=true&cost");
    assert.deepEqual(globals, {'vFile': 'plans/a b.json', 'vOption': 2, 'vSmooth': true});
    assert.equal(headerId, 'cost');
    assert.deepEqual(parseHash('#var=').globals, {});
    assert.deepEqual(parseHash("#var.vX=bogus(1)&var.vY=-1.5e2").globals, {'vY': -150});
    assert.deepEqual(parseHash('#url=plans%2Fsite.json&var.vOption=1').globals, {'vFile': 'plans/site.json', 'vOption': 1});
    assert.deepEqual(parseHash("#url=a.json&var.vFile='b.json'").globals, {'vFile': 'b.json'});
    assert.deepEqual(parseHash('#url=').globals, {});
});


test('parseLiteral', () => {
    assert.equal(parseLiteral("'it\\'s'"), "it's");
    assert.equal(parseLiteral('"a\\\\b"'), 'a\\b');
    assert.equal(parseLiteral('null'), null);
    assert.equal(parseLiteral('false'), false);
    assert.equal(parseLiteral('x'), undefined);
});


test('argsParse validates types and applies defaults', () => {
    const args = argsParse({'vFile': 'a.json', 'vOption': 1.5, 'vTilt': 50, 'vExplore': 1, 'vX': 'bad'});
    assert.deepEqual(args, {
        'file': 'a.json', 'option': 0, 'azimuth': 30, 'tilt': 50, 'exaggeration': 1.5, 'zoom': 1, 'explore': true, 'doc': false
    });

    // The MarkdownUp viewer's "smooth" argument is ignored, and dropped from links
    assert.equal(argsURL({'vFile': 'a.json', 'vSmooth': true}), "#var.vFile='a.json'");
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
