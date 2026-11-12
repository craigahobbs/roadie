// checkCanvas.js - check that the canvas 3D drawings' operations (the 3D explorer's and the report's 3D views) draw
// exactly what the SVG drawing does with the same terrain limits - the operations are converted to SVG markup and
// compared with the SVG drawing's elements
//
// usage: node tools/checkCanvas.js <plan.json> ...

import {argsParse} from '../lib/args.js';
import {Explorer} from '../lib/explore.js';
import {PlanData} from '../lib/planData.js';
import {smoothLimitsCanvas, view3DParts} from '../lib/view3d.js';
import {buildReport} from '../lib/report.js';
import {opsToSvg} from '../lib/canvas.js';
import {readFileSync} from 'node:fs';
import {validatePlan} from '../lib/model.js';


const views = [
    {},
    {'vZoom': 4, 'vX': 300, 'vY': 400, 'vAzimuth': 200, 'vTilt': 45},
    {'vZoom': 8},
    {'vTilt': 90, 'vAzimuth': 0},
    {'vZoom': 16, 'vTilt': 10, 'vExaggeration': 3}
];


let failures = 0;
for (const planPath of process.argv.slice(2)) {
    const data = new PlanData(validatePlan(JSON.parse(readFileSync(planPath, 'utf-8'))).plan, planPath);
    for (const viewGlobals of views) {
        const globals = {'vFile': planPath, 'vExplore': true, ...viewGlobals};
        for (let ixOption = 0; ixOption < data.plan.options.length; ixOption++) {
            for (const smoothLimits of [undefined, smoothLimitsCanvas]) {
                const explorer = new Explorer(data, globals, argsParse({...globals, 'vOption': ixOption}));
                const svg = explorer.render(1052, 852, false, smoothLimits);
                const svgElements = svg.slice(svg.indexOf('>') + 1, -'</svg>'.length).replace(/<a href="[^"]*">.*?<\/a>/, '');
                const canvasElements = opsToSvg(explorer.render(1052, 852, true, smoothLimits).ops);
                const name = `${planPath} option ${ixOption} ${JSON.stringify(viewGlobals)}${smoothLimits ? ' (canvas smooth limits)' : ''}`;
                if (canvasElements === svgElements) {
                    process.stdout.write(`ok   ${name}\n`);
                } else {
                    failures += 1;
                    let ix = 0;
                    while (canvasElements[ix] === svgElements[ix]) {
                        ix += 1;
                    }
                    process.stdout.write(`FAIL ${name} at ${ix}:\n  svg:    ${svgElements.slice(ix - 80, ix + 120)}\n` +
                        `  canvas: ${canvasElements.slice(ix - 80, ix + 120)}\n`);
                }
            }
        }
    }
}
// The report's canvas 3D views
for (const planPath of process.argv.slice(2)) {
    const data = new PlanData(validatePlan(JSON.parse(readFileSync(planPath, 'utf-8'))).plan, planPath);
    for (let ixOption = 0; ixOption < data.plan.options.length; ixOption++) {
        const globals = {'vFile': planPath, 'vOption': ixOption};
        const report = buildReport(data, globals, argsParse(globals), 976, true);
        for (const [ixView, reportView] of report.views.entries()) {
            for (const points of [40000, smoothLimitsCanvas.points]) {
                const limits = {...smoothLimitsCanvas, points};
                const canvasElements = opsToSvg(reportView.render(limits).elements);
                const svgElements = view3DParts(data.plan, data.topo, data.rows(ixOption), ixOption, data.analysis(ixOption),
                    {...reportView.view, 'smooth': true}, false, limits).elements.join('');
                const name = `${planPath} option ${ixOption} report view ${ixView + 1} (${points} points)`;
                if (canvasElements === svgElements) {
                    process.stdout.write(`ok   ${name}\n`);
                } else {
                    failures += 1;
                    process.stdout.write(`FAIL ${name}\n`);
                }
            }
        }
    }
}
process.stdout.write(failures === 0 ? 'All identical\n' : `${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
