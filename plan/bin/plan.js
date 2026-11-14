#!/usr/bin/env node
// plan.js - the Roadie planning tools' command line (see lib/cli.js)
//
// usage: node bin/plan.js site <site.json> <plan.json>
//        node bin/plan.js plot <plan.json> <plot.png> [--box X1,Y1,X2,Y2]
//        node bin/plan.js locate <plan.json> [--xy] <latitude,longitude | x,y>...
//        node bin/plan.js feature <plan.json> TYPE [-n NAME] X,Y X,Y...
//        node bin/plan.js route <plan.json> -n NAME [-v X,Y]... [options]
//        node bin/plan.js profile <plan.json> -n NAME [options]
//        node bin/plan.js evaluate <plan.json> [--detail]
//        node bin/plan.js keep <plan.json> NAME...
//        node bin/plan.js describe <plan.json> <descriptions.md>
//        node bin/plan.js doc [site | plan]

import {fetchBytes, fetchJson} from '../lib/usgs.js';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {Resvg} from '@resvg/resvg-js';
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
    sleep,
    'renderPng': (svg) => new Resvg(svg, {'background': 'white', 'font': {'loadSystemFonts': true}}).render().asPng(),
    openImage
});
