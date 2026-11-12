// render.js - render a road plan report (or the 3D explorer, or the model documentation) as HTML from the command line
//
// usage: node tools/render.js <plan.json> [--file <file arg>] [--option <n>] [--width <px>]
//            [--explore [--height <px>] [--azimuth <deg>] [--tilt <deg>] [--zoom <n>] [--x <x>] [--y <y>] [--z <z>]]
//            [--doc] [--time]
//
// The "--file" value is the plan's "file" URL argument for the report's links and image (default is the plan path).

import {buildReport, planImageURL} from '../lib/report.js';
import {Explorer} from '../lib/explore.js';
import {PlanData} from '../lib/planData.js';
import {argsParse} from '../lib/args.js';
import {buildDoc} from '../lib/doc.js';
import process from 'node:process';
import {readFileSync} from 'node:fs';
import {validatePlan} from '../lib/model.js';


const valueOptions = new Set(['--file', '--option', '--width', '--height', '--azimuth', '--tilt', '--zoom', '--x', '--y', '--z']);
const viewOptions = ['option', 'azimuth', 'tilt', 'zoom', 'x', 'y', 'z'];


function main(argv) {
    const options = {'width': 976, 'height': 720};
    const positional = [];
    for (let ix = 0; ix < argv.length; ix++) {
        const arg = argv[ix];
        if (valueOptions.has(arg)) {
            options[arg.slice(2)] = argv[++ix];
        } else if (arg === '--explore' || arg === '--doc' || arg === '--time') {
            options[arg.slice(2)] = true;
        } else {
            positional.push(arg);
        }
    }

    const globals = {};
    if (options.doc) {
        globals.vDoc = true;
        process.stdout.write(`${buildDoc(globals).html}\n`);
        return;
    }

    const [planPath] = positional;
    const file = options.file ?? planPath;
    globals.vFile = file;
    for (const name of viewOptions) {
        if (options[name] !== undefined) {
            globals[`v${name.charAt(0).toUpperCase()}${name.slice(1)}`] = parseFloat(options[name]);
        }
    }
    const args = argsParse(globals);

    const timeBegin = performance.now();
    const validated = validatePlan(JSON.parse(readFileSync(planPath, 'utf-8')));
    if ('error' in validated) {
        process.stderr.write(`error: ${validated.error}\n`);
        process.exit(1);
    }
    const data = new PlanData(validated.plan, file);
    if ('image' in validated.plan) {
        data.imageURL = planImageURL(file, validated.plan.image);
    }
    const timeValidate = performance.now();
    let html;
    if (options.explore) {
        globals.vExplore = true;
        const explorer = new Explorer(data, globals, argsParse(globals));
        html = `<div style="display: none;"></div>${explorer.render(parseInt(options.width, 10), parseInt(options.height, 10))}`;
    } else {
        ({html} = buildReport(data, globals, args, parseInt(options.width, 10)));
    }
    const timeEnd = performance.now();
    process.stdout.write(`${html}\n`);
    if (options.time) {
        const timeLoad = (timeValidate - timeBegin).toFixed(1);
        process.stderr.write(`load/validate ${timeLoad} ms, render ${(timeEnd - timeValidate).toFixed(1)} ms, ` +
            `${html.length} characters\n`);
    }
}


main(process.argv.slice(2));
