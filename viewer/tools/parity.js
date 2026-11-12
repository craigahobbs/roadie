// parity.js - check the viewer's output against the MarkdownUp Roadie viewer's, rendered with the BareScript JavaScript
// runtime (the browser's runtime) from a Roadie project directory
//
// usage: node tools/parity.js <roadie directory> <plan.json> ...
//
// Each plan's report is checked for each option (with the 3D views drawn as SVG, with the MarkdownUp viewer's terrain
// limits), and the model documentation page is checked once. The MarkdownUp viewer's "Terrain" (faceted or smooth)
// links are removed before comparing - this viewer smooths its canvas 3D views automatically. (The 3D explorer and the
// report's canvas 3D views are checked against the SVG drawing by tools/checkCanvas.js.)

import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tokenize} from './compare.js';


const viewerDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(viewerDir, 'build', 'parity');


function renderReference(roadieDir, vars) {
    const bare = join(roadieDir, 'build', 'js', 'node_modules', '.bin', 'bare');
    const driver = join(buildDir, 'driver.bare');
    writeFileSync(driver, `include '${join(roadieDir, 'roadie.bare')}'\n\nroadieMain()\n`);
    const varArgs = Object.entries(vars).flatMap(([name, expr]) => ['-v', name, expr]);
    return execFileSync(bare, ['-l', driver, ...varArgs], {'encoding': 'utf-8', 'maxBuffer': 1 << 30});
}


function renderViewer(args) {
    return execFileSync('node', [join(viewerDir, 'tools', 'render.js'), ...args], {'encoding': 'utf-8', 'maxBuffer': 1 << 30});
}


// The MarkdownUp viewer double-escapes the options table's option links (roadieOptionsTable markdown-escapes the name, then
// argsLink escapes it again), so its link text shows the escapes - e.g. "Saddle \- North" - this viewer does not
const rLinkEscapes = /(<a href="[^"]*">\s*)([^<]*)/g;

function unescapeLinks(html) {
    return html.replace(rLinkEscapes, (match, open, text) => open + text.replace(/\\([\\[\]()<>"'*_~`#=+|-])/g, '$1'));
}


function compare(name, refHtmlRaw, newHtml) {
    const refHtml = unescapeLinks(refHtmlRaw).replace(/<p>\s*Terrain:[\s\S]*?<\/p>/, '');
    const refTokens = tokenize(refHtml);
    const newTokens = tokenize(newHtml);
    const count = Math.max(refTokens.length, newTokens.length);
    for (let ix = 0; ix < count; ix++) {
        if (refTokens[ix] !== newTokens[ix]) {
            const safeName = name.replace(/[^\w.-]+/g, '_');
            writeFileSync(join(buildDir, `${safeName}.ref.html`), refHtml);
            writeFileSync(join(buildDir, `${safeName}.new.html`), newHtml);
            process.stdout.write(`FAIL ${name} - token ${ix}:\n  ref: ${(refTokens[ix] ?? '<end>').slice(0, 300)}\n` +
                `  new: ${(newTokens[ix] ?? '<end>').slice(0, 300)}\n`);
            return false;
        }
    }
    process.stdout.write(`ok   ${name} (${refTokens.length} tokens)\n`);
    return true;
}


function main(argv) {
    const [roadieDirArg, ...planPaths] = argv;
    const roadieDir = resolve(roadieDirArg);
    mkdirSync(buildDir, {'recursive': true});
    let failures = 0;

    // The model documentation
    if (!compare('doc', renderReference(roadieDir, {'vDoc': 'true'}), renderViewer(['--doc']))) {
        failures += 1;
    }

    for (const planPathArg of planPaths) {
        const planPath = resolve(planPathArg);
        const plan = JSON.parse(execFileSync('cat', [planPath], {'encoding': 'utf-8', 'maxBuffer': 1 << 30}));
        const fileExpr = `'${planPath}'`;
        const cases = [];
        for (let ixOption = 0; ixOption < plan.options.length; ixOption++) {
            cases.push([`option ${ixOption}`, {'vOption': `${ixOption}`}, ['--option', `${ixOption}`]]);
        }
        for (const [caseName, refVars, viewerArgs] of cases) {
            const refHtml = renderReference(roadieDir, {'vFile': fileExpr, ...refVars});
            const newHtml = renderViewer([planPath, ...viewerArgs]);
            if (!compare(`${planPathArg} ${caseName}`, refHtml, newHtml)) {
                failures += 1;
            }
        }
    }

    process.stdout.write(failures === 0 ? 'All identical\n' : `${failures} failures\n`);
    process.exit(failures === 0 ? 0 : 1);
}


main(process.argv.slice(2));
