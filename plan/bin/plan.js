#!/usr/bin/env node
// plan.js - the Roadie planning tools' command line (see lib/cli.js)
//
// usage: node bin/plan.js site <site.json> <plan.json>
//        node bin/plan.js doc

import {fetchBytes, fetchJson} from '../lib/usgs.js';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {cliMain} from '../lib/cli.js';
import {dirname} from 'node:path';
import {elevationImage} from '../lib/elevationImage.js';
import {fromUrl} from 'geotiff';
import process from 'node:process';
import {setTimeout as sleep} from 'node:timers/promises';


// Write a file, creating its directory
function writeFile(path, data) {
    mkdirSync(dirname(path), {'recursive': true});
    writeFileSync(path, data);
}


// Open a remote elevation model image - only the parts of the file that are read are fetched
async function openImage(url) {
    const tiff = await fromUrl(url);
    return elevationImage(await tiff.getImage());
}


// The command line's input and output functions
process.exitCode = await cliMain(process.argv.slice(2), {
    'readFile': (path) => readFileSync(path, 'utf-8'),
    'readBytes': (path) => readFileSync(path),
    writeFile,
    'writeBytes': writeFile,
    'write': (text) => process.stdout.write(text),
    'getJson': (url) => fetchJson(fetch, sleep, url),
    'getBytes': (url) => fetchBytes(fetch, sleep, url),
    openImage
});
