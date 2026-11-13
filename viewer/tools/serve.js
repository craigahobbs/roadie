// serve.js - serve a directory's files to this computer's web browser - the viewer application and a road plan
//
// usage: node tools/serve.js <directory> [port]

import {extname, join, normalize, sep} from 'node:path';
import {createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import process from 'node:process';
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


function main(argv) {
    const [directory, port = '8080'] = argv;
    if (directory === undefined || argv.length > 2 || !/^\d+$/.test(port)) {
        process.stderr.write('usage: node tools/serve.js <directory> [port]\n');
        return 1;
    }

    const server = createServer(async (request, response) => {
        // The file's path - within the directory (its links to other directories are followed)
        let urlPath;
        try {
            urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        } catch {
            urlPath = null;
        }
        const path = urlPath !== null ? normalize(join(directory, urlPath)) : null;
        const root = normalize(directory + sep);
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
        process.stdout.write(`Serving "${directory}" at http://127.0.0.1:${port}/ (Ctrl-C to stop)\n`);
    });
    return 0;
}


process.exitCode = main(process.argv.slice(2));
