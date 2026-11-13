// serve.js - serve a directory's files to this computer's web browser - the viewer application and a road plan
//
// usage: node tools/serve.js <directory> [port] [--plan <plan.json>] [--open]
//
//   --plan <plan.json>   also serve the road plan's directory, as "plan/" - the plan and its map image
//   --open               open the application (and the road plan) in the web browser

import {basename, dirname, extname, join, normalize, sep} from 'node:path';
import {createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {stat} from 'node:fs/promises';


// The files' content types
const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.md': 'text/markdown; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};


// The road plan's directory's URL path
const planUrl = '/plan/';


// The web browser's command, by platform - the URL is its last argument. Windows' is its file explorer, which opens a
// URL in the web browser - it's run without a shell, so the URL's characters need no quoting.
const browsers = {'darwin': ['open'], 'win32': ['explorer.exe']};
const defaultBrowser = ['xdg-open'];


function main(argv) {
    // The arguments
    const args = [];
    let plan = null;
    let open = false;
    for (let ixArg = 0; ixArg < argv.length; ixArg++) {
        const arg = argv[ixArg];
        if (arg === '--plan' && ixArg + 1 < argv.length) {
            plan = argv[ixArg + 1];
            ixArg += 1;
        } else if (arg === '--open') {
            open = true;
        } else {
            args.push(arg);
        }
    }
    const [directory, port = '8080'] = args;
    if (directory === undefined || args.length > 2 || directory.startsWith('-') || !/^\d+$/.test(port)) {
        process.stderr.write('usage: node tools/serve.js <directory> [port] [--plan <plan.json>] [--open]\n');
        return 1;
    }

    const server = createServer(async (request, response) => {
        // The file's path - within the directory (its links to other directories are followed), or within the road
        // plan's directory
        let urlPath;
        try {
            urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        } catch {
            urlPath = null;
        }
        const isPlan = plan !== null && urlPath !== null && urlPath.startsWith(planUrl);
        const base = isPlan ? dirname(plan) : directory;
        const path = urlPath !== null ? normalize(join(base, isPlan ? urlPath.slice(planUrl.length) : urlPath)) : null;
        const root = normalize(base + sep);
        let file = null;
        if (path !== null && (path + sep).startsWith(root) && (request.method === 'GET' || request.method === 'HEAD')) {
            try {
                file = (await stat(path)).isDirectory() ? join(path, 'index.html') : path;
                await stat(file);
            } catch {
                file = null;
            }
        }
        if (file === null) {
            response.writeHead(404, {'Content-Type': 'text/plain'});
            response.end('Not found\n');
            return;
        }

        // A plan is viewed again after it's changed, so its files aren't cached
        response.writeHead(200, {
            'Content-Type': contentTypes[extname(file).toLowerCase()] ?? 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        if (request.method === 'HEAD') {
            response.end();
        } else {
            createReadStream(file).pipe(response);
        }
    });
    server.listen(Number(port), '127.0.0.1', () => {
        // The application's URL - with the road plan to view, if there is one
        const planFile = plan !== null ? encodeURIComponent(basename(plan)).replace(/'/g, '%27') : null;
        const url = `http://127.0.0.1:${port}/${planFile !== null ? `#var.vFile='plan%2F${planFile}'` : ''}`;
        process.stdout.write(`Serving "${directory}" at ${url} (Ctrl-C to stop)\n`);

        // Open it in the web browser - if the browser's command can't be run, the URL above is opened by hand
        if (open) {
            const [command, ...commandArgs] = browsers[process.platform] ?? defaultBrowser;
            const browser = spawn(command, [...commandArgs, url], {'stdio': 'ignore', 'detached': true});
            browser.on('error', () => {
                process.stdout.write(`Could not run "${command}" - open ${url} in your web browser\n`);
            });
            browser.unref();
        }
    });
    return 0;
}


process.exitCode = main(process.argv.slice(2));
