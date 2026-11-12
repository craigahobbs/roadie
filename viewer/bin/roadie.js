#!/usr/bin/env node
// roadie.js - the Roadie command line (see lib/cli.js)
//
// usage: node bin/roadie.js evaluate <plan.json> [--detail]
//        node bin/roadie.js doc

import {cliMain} from '../lib/cli.js';
import process from 'node:process';
import {readFileSync} from 'node:fs';


process.exitCode = cliMain(process.argv.slice(2), {
    'readFile': (path) => readFileSync(path, 'utf-8'),
    'write': (text) => process.stdout.write(text)
});
