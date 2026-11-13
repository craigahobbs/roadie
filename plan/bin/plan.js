#!/usr/bin/env node
// plan.js - the Roadie planning tools' command line (see lib/cli.js)
//
// usage: node bin/plan.js doc

import {cliMain} from '../lib/cli.js';
import process from 'node:process';


process.exitCode = await cliMain(process.argv.slice(2), {
    'write': (text) => process.stdout.write(text)
});
