import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync, readdirSync} from 'node:fs';
import test from 'node:test';


test('index.html preloads every application module', () => {
    const viewerDir = fileURLToPath(new URL('..', import.meta.url));
    const html = readFileSync(`${viewerDir}index.html`, 'utf-8');
    const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((match) => match[1]);
    const modules = readdirSync(`${viewerDir}lib`).filter((name) => name.endsWith('.js')).map((name) => `lib/${name}`);
    assert.deepEqual(preloads, modules.sort());
});
