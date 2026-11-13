// appHelpers.js - the application tests' browser - a jsdom window with fakes of the browser APIs jsdom doesn't have

import {JSDOM, VirtualConsole} from 'jsdom';
import {RoadieApp} from '../lib/app.js';
import {setImmediate as nextTask} from 'node:timers/promises';


// The canvas 2D context methods the drawings call
const contextMethods = [
    'arc', 'beginPath', 'closePath', 'fill', 'fillRect', 'fillText', 'lineTo', 'moveTo', 'roundRect', 'setLineDash', 'setTransform',
    'stroke', 'strokeText'
];


// Create a fake canvas 2D context that adds its method calls (["name", ...args]) and property sets (["name", value]) to
// the "calls" array, in order
export function fakeContext(calls) {
    const methods = {};
    for (const name of contextMethods) {
        methods[name] = (...args) => {
            calls.push([name, ...args]);
        };
    }
    return new Proxy(methods, {
        set(target, name, value) {
            calls.push([name, value]);
            return true;
        }
    });
}


// A fake clock - the time, in milliseconds, and the window's timeouts and animation frame requests, which run only when
// the test runs them
export class FakeClock {
    constructor() {
        this.time = 0;
        this.nextId = 1;
        this.timeouts = new Map();
        this.frames = new Map();
    }

    setTimeout(callback, delay) {
        const id = this.nextId++;
        this.timeouts.set(id, {callback, 'time': this.time + delay});
        return id;
    }

    clearTimeout(id) {
        this.timeouts.delete(id);
    }

    requestAnimationFrame(callback) {
        const id = this.nextId++;
        this.frames.set(id, callback);
        return id;
    }

    cancelAnimationFrame(id) {
        this.frames.delete(id);
    }

    // Run the next timeout (the earliest - of those, the first set), advancing the time to it
    runTimeout() {
        const [[id, timeout]] = [...this.timeouts].sort(([, timeout1], [, timeout2]) => timeout1.time - timeout2.time);
        this.timeouts.delete(id);
        this.time = Math.max(this.time, timeout.time);
        timeout.callback();
    }

    // Run the requested animation frames
    runFrame() {
        const callbacks = [...this.frames.values()];
        this.frames.clear();
        for (const callback of callbacks) {
            callback();
        }
    }
}


// Create a fake IndexedDB request that completes as a microtask - it fails, or succeeds with the result function's
// result (after its "upgrade needed" event, for a new database)
function fakeRequest(fail, resultFn, upgrade = false) {
    const request = {};
    queueMicrotask(() => {
        if (fail) {
            request.onerror();
        } else {
            request.result = resultFn();
            if (upgrade) {
                request.onupgradeneeded();
            }
            request.onsuccess();
        }
    });
    return request;
}


// A fake IndexedDB factory of one in-memory database, with what the application uses - object stores with a key path,
// and their put, get, and getAll requests. The requests complete as microtasks. Set "failure" to fail opening the
// database ("open"), its transactions ("transaction"), or its requests ("request"). The database outlives the window, as
// a browser's does a page reload.
export class FakeIndexedDB {
    constructor() {
        this.name = null;
        this.version = null;
        this.stores = new Map();
        this.requests = [];
        this.failure = null;
    }

    // Get a store's records
    records(storeName) {
        return [...this.stores.get(storeName).records.values()];
    }

    open(name, version) {
        const isNew = this.name === null;
        return fakeRequest(this.failure === 'open', () => {
            this.name = name;
            this.version = version;
            return {
                'createObjectStore': (storeName, {keyPath}) => {
                    this.stores.set(storeName, {keyPath, 'records': new Map()});
                },
                'transaction': (storeName, mode) => this.transaction(storeName, mode)
            };
        }, isNew);
    }

    transaction(storeName, mode) {
        if (this.failure === 'transaction') {
            throw new Error('The transaction failed');
        }
        const {keyPath, records} = this.stores.get(storeName);
        const request = (method, key, resultFn) => {
            this.requests.push([storeName, mode, method, key]);
            return fakeRequest(this.failure === 'request', resultFn);
        };
        return {
            'objectStore': () => ({
                'put': (record) => request('put', record[keyPath], () => {
                    records.set(record[keyPath], record);
                    return record[keyPath];
                }),
                'get': (key) => request('get', key, () => records.get(key)),
                'getAll': () => request('getAll', null, () => [...records.values()])
            })
        };
    }
}


// Create the application's browser - a jsdom window of the application's page with a fake clock (and the time functions
// mocked to it), local storage items ("storage"), IndexedDB, fetch (of the "files" - a URL's text or a promise of it, or
// null for a network error; any other URL isn't found), intersection observer, canvas 2D context, object URLs, and
// scrolling. The browser object has the window and what the fakes record.
export function fakeBrowser(testContext, {hash = '', search = '', files = {}, storage = {}, indexedDB = new FakeIndexedDB()} = {}) {
    const logs = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('log', (message) => logs.push(message));
    const {window} = new JSDOM(
        '<!DOCTYPE html><html><head><title>Roadie</title></head><body><div id="roadie"></div></body></html>',
        {'url': `http://localhost/index.html${search}${hash}`, virtualConsole}
    );
    const browser = {
        window, indexedDB, logs,
        'document': window.document,
        'main': window.document.getElementById('roadie'),
        'clock': new FakeClock(),
        'fetches': [],
        'observers': [],
        'objectURLs': [],
        'scrolls': []
    };
    const {clock, fetches, observers, objectURLs, scrolls} = browser;

    // The time
    testContext.mock.method(performance, 'now', () => clock.time);
    testContext.mock.method(Date, 'now', () => clock.time);
    window.setTimeout = (callback, delay) => clock.setTimeout(callback, delay);
    window.clearTimeout = (id) => clock.clearTimeout(id);
    window.requestAnimationFrame = (callback) => clock.requestAnimationFrame(callback);
    window.cancelAnimationFrame = (id) => clock.cancelAnimationFrame(id);

    // Local storage, IndexedDB, and fetch
    for (const [key, value] of Object.entries(storage)) {
        window.localStorage.setItem(key, value);
    }
    window.indexedDB = indexedDB;
    window.fetch = (url) => {
        fetches.push(url);
        const text = files[url];
        if (text === null) {
            return Promise.reject(new TypeError('Failed to fetch'));
        }
        return Promise.resolve(text !== undefined ? {'ok': true, 'text': () => Promise.resolve(text)} : {'ok': false});
    };

    // The intersection observer - the test reports intersections with its "callback"
    window.IntersectionObserver = class {
        constructor(callback, options) {
            this.callback = callback;
            this.options = options;
            this.targets = new Set();
            observers.push(this);
        }

        observe(target) {
            this.targets.add(target);
        }

        unobserve(target) {
            this.targets.delete(target);
        }

        disconnect() {
            this.targets.clear();
        }
    };

    // The canvas 2D context - each canvas records its contexts' calls
    window.HTMLCanvasElement.prototype.getContext = function getContext(contextType) {
        this.calls ??= [];
        this.calls.push(['getContext', contextType]);
        return fakeContext(this.calls);
    };

    // Object URLs and scrolling
    window.URL.createObjectURL = (blob) => {
        objectURLs.push(blob);
        return `blob:http://localhost/${objectURLs.length}`;
    };
    window.scrollTo = (x, y) => {
        scrolls.push(['scrollTo', x, y]);
    };
    window.Element.prototype.scrollIntoView = function scrollIntoView() {
        scrolls.push(['scrollIntoView', this.id]);
    };

    return browser;
}


// Run the pending tasks and microtasks - the application's promises and the window's hash change events
export async function flush() {
    for (let task = 0; task < 3; task++) {
        await nextTask();
    }
}


// Start the application in a browser and wait for its page - returns the application
export async function startApp(browser) {
    const app = new RoadieApp(browser.window);
    app.start();
    await flush();
    return app;
}


// Dispatch an event with properties (e.g. a key's code, or a mouse position) to a target - returns the event
export function fire(browser, target, type, properties = {}) {
    const event = new browser.window.Event(type, {'bubbles': true, 'cancelable': true});
    Object.assign(event, properties);
    target.dispatchEvent(event);
    return event;
}
