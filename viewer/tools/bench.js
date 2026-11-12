// bench.js - time a viewer page in headless Chrome, from navigation to a condition (e.g. every drawing rendered) and the
// next painted frame, with the Chrome DevTools Protocol
//
// usage: node tools/bench.js <url> <condition expression> [--runs <n>] [--chrome <path>] [--console] [--window <w,h>]
//
// "--console" prints the page's console messages of the last run. "--key <code>" times a key press (e.g. "ArrowLeft") after
// the condition - until the 3D view is replaced and painted.

import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';


const keyCodes = {'ArrowLeft': 37, 'ArrowUp': 38, 'ArrowRight': 39, 'ArrowDown': 40, 'KeyQ': 81, 'KeyG': 71};
const defaultChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';


// Wait for a number of milliseconds
function sleep(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}


async function connect(port) {
    for (let ix = 0; ix < 100; ix++) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/list`);
            const [target] = (await response.json()).filter((item) => item.type === 'page');
            const socket = new WebSocket(target.webSocketDebuggerUrl);
            await new Promise((resolve, reject) => {
                socket.onopen = resolve;
                socket.onerror = reject;
            });
            return socket;
        } catch {
            await sleep(100);
        }
    }
    throw new Error('Could not connect to Chrome');
}


function client(socket) {
    let id = 0;
    const pending = new Map();
    const messages = [];
    const loadWaiters = [];
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.method === 'Page.loadEventFired') {
            loadWaiters.splice(0).forEach((resolve) => resolve());
        }
        if (message.method === 'Runtime.consoleAPICalled') {
            messages.push(message.params.args.map((arg) => arg.value).join(' '));
        }
        if (pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        }
    };
    const send = (method, params = {}) => new Promise((resolve) => {
        id += 1;
        pending.set(id, resolve);
        socket.send(JSON.stringify({id, method, params}));
    });
    const waitLoad = () => new Promise((resolve) => {
        loadWaiters.push(resolve);
    });
    return [send, messages, waitLoad];
}


async function main(argv) {
    const [url, condition] = argv;
    const ixRuns = argv.indexOf('--runs');
    const runs = ixRuns !== -1 ? parseInt(argv[ixRuns + 1], 10) : 3;
    const ixChrome = argv.indexOf('--chrome');
    const chrome = ixChrome !== -1 ? argv[ixChrome + 1] : defaultChrome;
    const ixWindow = argv.indexOf('--window');
    const windowSize = ixWindow !== -1 ? argv[ixWindow + 1] : '1100,900';
    const port = 9300 + Math.floor(Math.random() * 500);
    const userDir = mkdtempSync(join(tmpdir(), 'roadie-bench-'));
    const timeoutId = setTimeout(() => {
        process.stderr.write('error: timed out\n');
        proc.kill();
        process.exit(1);
    }, 180000);
    const proc = spawn(chrome, [
        '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, `--window-size=${windowSize}`,
        '--no-first-run', '--disable-extensions', 'about:blank'
    ], {'stdio': 'ignore'});
    try {
        const socket = await connect(port);
        const [send, messages, waitLoad] = client(socket);
        await send('Page.enable');
        await send('Runtime.enable');
        await send('Network.enable');
        await send('Network.setCacheDisabled', {'cacheDisabled': false});
        const times = [];
        for (let ixRun = 0; ixRun <= runs; ixRun++) {
            await send('Page.navigate', {'url': 'about:blank'});
            await sleep(200);
            if (process.env.BENCH_DEBUG) { process.stderr.write(`run ${ixRun}\n`); }
            messages.length = 0;
            const loaded = waitLoad();
            await send('Page.navigate', {url});
            await loaded;
            const expression = `new Promise((resolve) => {
                const check = () => {
                    let done = false;
                    try { done = !!(${condition}); } catch { done = false; }
                    if (done) {
                        requestAnimationFrame(() => setTimeout(() => resolve(performance.now()), 0));
                    } else {
                        setTimeout(check, 5);
                    }
                };
                check();
            })`;
            let result = null;
            for (let ixTry = 0; ixTry < 100 && result === null; ixTry++) {
                const response = await send('Runtime.evaluate', {expression, 'awaitPromise': true, 'returnByValue': true});
                if (response.result?.result?.type === 'number') {
                    result = response.result.result.value;
                } else {
                    if (process.env.BENCH_DEBUG) { process.stderr.write(`${JSON.stringify(response).slice(0, 300)}\n`); }
                    await sleep(50);
                }
            }
            // Time a key press?
            const ixKey = argv.indexOf('--key');
            if (ixKey !== -1) {
                const code = argv[ixKey + 1];
                const start = await send('Runtime.evaluate', {'expression': `(() => {
                    window.benchOld = document.querySelector('svg[aria-label^="3D"]');
                    window.benchFrame = document.querySelector('canvas')?.dataset.frame;
                    return performance.now();
                })()`, 'returnByValue': true});
                await send('Input.dispatchKeyEvent', {'type': 'rawKeyDown', code, 'key': code, 'windowsVirtualKeyCode': keyCodes[code]});
                await send('Input.dispatchKeyEvent', {'type': 'keyUp', code, 'key': code, 'windowsVirtualKeyCode': keyCodes[code]});
                const end = await send('Runtime.evaluate', {'expression': `new Promise((resolve) => {
                    const check = () => {
                        const svg = document.querySelector('svg[aria-label^="3D"]');
                        const frame = document.querySelector('canvas')?.dataset.frame;
                        if ((svg !== null && svg !== window.benchOld) || (frame !== undefined && frame !== window.benchFrame)) {
                            requestAnimationFrame(() => setTimeout(() => resolve(performance.now()), 0));
                        } else {
                            setTimeout(check, 2);
                        }
                    };
                    check();
                })`, 'awaitPromise': true, 'returnByValue': true});
                result = end.result.result.value - start.result.result.value;
            }

            // The first run warms the cache
            if (ixRun > 0) {
                times.push(result);
            }
        }
        times.sort((time1, time2) => time1 - time2);
        const median = times[Math.floor(times.length / 2)];
        process.stdout.write(`median ${median.toFixed(0)} ms (runs: ${times.map((time) => time.toFixed(0)).join(', ')})\n`);
        if (argv.includes('--console')) {
            process.stdout.write(`${messages.join('\n')}\n`);
        }
        socket.close();
    } finally {
        const exited = new Promise((resolve) => {
            proc.once('exit', resolve);
        });
        proc.kill();
        await exited;
        rmSync(userDir, {'recursive': true, 'force': true, 'maxRetries': 10});
        clearTimeout(timeoutId);
    }
}


await main(process.argv.slice(2));
