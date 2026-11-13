// app.js - the Roadie viewer web application

import {AdaptiveSmoothing, reportBudget} from './smoothing.js';
import {Explorer, exploreStyle} from './explore.js';
import {argsLink, argsParse, argsURL, parseHash} from './args.js';
import {buildReport, planImageURL} from './report.js';
import {escapeHtml, round} from './format.js';
import {hitTitle, opCell, paintOps} from './canvas.js';
import {PlanData} from './planData.js';
import {buildDoc} from './doc.js';
import {planPad} from './planView.js';
import {smoothLimitsCanvas} from './view3d.js';
import {validatePlan} from './model.js';


// The document font size, in pixels (12pt)
const fontSize = 16;


// The maximum report view width, in pixels
const maxWidth = 1200;


// The canvas 3D drawings' print resolution, as a multiple of the drawing's size in CSS pixels, and their background color
// (the SVG drawings' style background)
const printRatio = 2;
const canvasBackground = '#f4f1ea';


// Paint a canvas 3D drawing (a report view's "elements" or the explorer's "ops") at a pixel ratio - the canvas bitmap is
// the drawing's size times the ratio. The canvas's CSS size is the drawing's - its width, and with "fixedHeight", its
// height (otherwise, its height follows its width).
function paintCanvas(canvas, drawing, ratio, fixedHeight) {
    const {width, height} = drawing;
    const bitmapWidth = Math.round(width * ratio);
    const bitmapHeight = Math.round(height * ratio);
    if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
        canvas.width = bitmapWidth;
        canvas.height = bitmapHeight;
        canvas.style.width = `${width}px`;
        if (fixedHeight) {
            canvas.style.height = `${height}px`;
        }
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(bitmapWidth / width, 0, 0, bitmapHeight / height, 0, 0);

    // The drawing's background is painted, not left to the canvas's style, so it prints (printing omits backgrounds)
    ctx.fillStyle = canvasBackground;
    ctx.fillRect(0, 0, width, height);
    paintOps(ctx, drawing.ops ?? drawing.elements);
}


// Count a canvas 3D drawing's terrain cells
function countCells(drawing) {
    let cells = 0;
    for (const op of drawing.ops ?? drawing.elements) {
        if (op.t === opCell) {
            cells += 1;
        }
    }
    return cells;
}


// Show the title (tooltip) of a canvas 3D drawing's shape under the mouse
function showCanvasTitle(canvas, drawing, event) {
    if (drawing !== null) {
        const rect = canvas.getBoundingClientRect();
        const scale = drawing.width / rect.width;
        const title = hitTitle(
            drawing.ops ?? drawing.elements, (event.clientX - rect.left - 1) * scale, (event.clientY - rect.top - 1) * scale
        );
        if ((canvas.title || null) !== title) {
            canvas.title = title ?? '';
        }
    }
}


// The delay after the last key press before the 3D explorer draws its still view, in milliseconds
const refineDelay = 250;


// The local storage key of the 3D explorer's measured terrain cell drawing cost (smoothing.js)
const cellCostKey = 'roadieCellCost';


// The local file URL argument prefix - local files are opened from the user's computer and kept in IndexedDB
const localPrefix = 'local:';


// Compute the report view width for the window width, in pixels
function viewWidth(window) {
    return Math.max(400, Math.min(maxWidth, window.innerWidth - 3 * fontSize));
}


//
// Local files - kept in memory and in IndexedDB, so a local plan survives reloads
//


const dbName = 'roadie-viewer';
const dbStore = 'files';


function openDb(window) {
    return new Promise((resolve) => {
        try {
            const request = window.indexedDB.open(dbName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(dbStore, {'keyPath': 'name'});
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}


function dbRequest(db, mode, fn) {
    return new Promise((resolve) => {
        if (db === null) {
            resolve(null);
            return;
        }
        try {
            const request = fn(db.transaction(dbStore, mode).objectStore(dbStore));
            request.onsuccess = () => resolve(request.result ?? null);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}


export class RoadieApp {
    constructor(window) {
        this.window = window;
        this.document = window.document;
        this.main = this.document.getElementById('roadie');
        this.plans = new Map();
        this.localFiles = new Map();
        this.dbPromise = null;
        this.page = null;
        this.routeCount = 0;
        this.printing = false;
        this.debug = window.location.search.includes('debug');
    }


    // Start the application
    start() {
        const {window} = this;
        window.addEventListener('hashchange', () => this.route());
        // A resize while printing is the print layout - the pages keep their screen layout, scaled to the paper
        window.addEventListener('resize', () => {
            if (!this.printing) {
                this.page?.resize?.();
            }
        });
        window.addEventListener('beforeprint', () => {
            this.printing = true;
            this.page?.print?.();
        });
        window.addEventListener('afterprint', () => {
            this.printing = false;
        });
        this.document.addEventListener('keydown', (event) => this.page?.keyDown?.(event));

        // Open dropped plan files anywhere
        this.document.addEventListener('dragover', (event) => {
            event.preventDefault();
            this.document.body.classList.add('roadie-drop');
        });
        this.document.addEventListener('dragleave', (event) => {
            if (event.relatedTarget === null) {
                this.document.body.classList.remove('roadie-drop');
            }
        });
        this.document.addEventListener('drop', (event) => {
            event.preventDefault();
            this.document.body.classList.remove('roadie-drop');
            this.openFiles(event.dataTransfer.files);
        });

        this.route();
    }


    db() {
        if (this.dbPromise === null) {
            this.dbPromise = openDb(this.window);
        }
        return this.dbPromise;
    }


    // Open local files - the first plan JSON file is viewed; other files (e.g. the plan's map image) are kept for it
    async openFiles(fileList) {
        const files = [...fileList];
        const db = await this.db();
        let planName = null;
        for (const file of files) {
            this.localFiles.set(file.name, file);
            const record = {'name': file.name, 'type': file.type, 'blob': file, 'time': Date.now()};
            await dbRequest(db, 'readwrite', (store) => store.put(record));
            if (planName === null && file.name.toLowerCase().endsWith('.json')) {
                planName = file.name;
            }
        }

        // The opened files replace the cached local plans - a plan's own file, or its map image
        if (files.length > 0) {
            for (const file of [...this.plans.keys()].filter((planFile) => planFile.startsWith(localPrefix))) {
                this.plans.delete(file);
            }
        }
        if (planName !== null) {
            const hash = argsURL({}, {'file': `${localPrefix}${planName}`});
            if (this.window.location.hash === hash) {
                this.route();
            } else {
                this.window.location.hash = hash;
            }
        } else if (files.length > 0) {
            this.route();
        }
    }


    // Get a local file (a Blob), or null
    async localFile(name) {
        if (this.localFiles.has(name)) {
            return this.localFiles.get(name);
        }
        const record = await dbRequest(await this.db(), 'readonly', (store) => store.get(name));
        if (record !== null) {
            this.localFiles.set(name, record.blob);
            return record.blob;
        }
        return null;
    }


    // The local files kept in IndexedDB - [{name, time}]
    async localFileList() {
        const records = await dbRequest(await this.db(), 'readonly', (store) => store.getAll());
        return (records ?? []).map(({name, time}) => ({name, time})).sort((file1, file2) => file2.time - file1.time);
    }


    // Load a plan - returns a PlanData object or an error message string
    loadPlan(file) {
        let promise = this.plans.get(file);
        if (promise === undefined) {
            promise = this.loadPlanHelper(file);
            this.plans.set(file, promise);
            promise.then((result) => {
                if (typeof result === 'string') {
                    this.plans.delete(file);
                }
            });
        }
        return promise;
    }


    async loadPlanHelper(file) {
        const isLocal = file.startsWith(localPrefix);
        let text;
        try {
            if (isLocal) {
                const blob = await this.localFile(file.slice(localPrefix.length));
                text = blob !== null ? await blob.text() : null;
            } else {
                const response = await this.window.fetch(file);
                text = response.ok ? await response.text() : null;
            }
        } catch {
            text = null;
        }
        let planValue;
        try {
            planValue = text !== null ? JSON.parse(text) : null;
        } catch {
            planValue = null;
        }
        if (planValue === null) {
            return `**Error:** Could not load the road plan "${file}"`;
        }
        const validated = validatePlan(planValue);
        if ('error' in validated) {
            return `**Error:** The road plan "${file}" is invalid:\n\n${validated.error}`;
        }
        const data = new PlanData(validated.plan, file);

        // The source map image - a local plan's image is a local file of the same name
        const {image} = validated.plan;
        if (image !== undefined) {
            if (isLocal) {
                const imageBlob = await this.localFile(image.slice(image.lastIndexOf('/') + 1));
                data.imageURL = imageBlob !== null ? this.window.URL.createObjectURL(imageBlob) : null;
                data.imageMissing = imageBlob === null ? image : null;
            } else {
                data.imageURL = planImageURL(file, image);
            }
        }
        return data;
    }


    // Render the page for the current URL hash
    async route() {
        this.routeCount += 1;
        const {routeCount} = this;
        const {globals, headerId} = parseHash(this.window.location.hash);
        const args = argsParse(globals);
        this.setPage(null);

        // Model documentation?
        if (args.doc) {
            const doc = buildDoc(globals);
            this.render(doc.title, doc.html, headerId);
            return;
        }

        // No plan file? Show the home page.
        const file = args.file ?? null;
        if (file === null) {
            this.renderHome(globals);
            return;
        }

        // Load the road plan
        const timeBegin = performance.now();
        if (!this.plans.has(file)) {
            this.render('Roadie', '<h1>Roadie</h1><p class="roadie-loading">Loading the road plan…</p>');
        }
        const data = await this.loadPlan(file);
        if (routeCount !== this.routeCount) {
            return;
        }
        if (typeof data === 'string') {
            const [message, error] = data.split('\n\n');
            const errorHtml = error !== undefined ? `<p>${escapeHtml(error)}</p>` : '';
            this.render(
                'Roadie',
                `<h1>Roadie</h1><p>${markdownStrong(message)}</p>${errorHtml}<p><a href="#var=">Open another road plan</a></p>`
            );
            return;
        }

        // Render the road plan report, or the 3D explorer
        if (args.explore) {
            this.setPage(new ExplorePage(this, data, globals, args));
        } else {
            this.setPage(new ReportPage(this, data, globals, args, headerId));
        }
        this.logTime('render', timeBegin);
    }


    setPage(page) {
        this.page?.close?.();
        this.page = page;
    }


    // Get a local storage JSON value - null if it's missing, invalid, or local storage is unavailable
    storageGet(key) {
        try {
            return JSON.parse(this.window.localStorage.getItem(key));
        } catch {
            return null;
        }
    }


    // Set a local storage JSON value, if local storage is available
    storageSet(key, value) {
        try {
            this.window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Local storage is unavailable
        }
    }


    logTime(name, timeBegin) {
        if (this.debug) {
            this.window.console.log(`Roadie: ${name} in ${(performance.now() - timeBegin).toFixed(1)} ms`);
        }
    }


    // Render a page's HTML
    render(title, html, headerId = null) {
        this.document.title = title;
        this.document.body.classList.toggle('roadie-explore', false);
        this.main.innerHTML = html;
        if (headerId !== null) {
            this.document.getElementById(headerId)?.scrollIntoView();
        } else {
            this.window.scrollTo(0, 0);
        }
    }


    // Render the home page - the recent local plans are added when IndexedDB answers
    renderHome(globals) {
        const {routeCount} = this;
        const html = [
            '<h1>Roadie</h1>',
            '<p>Roadie is a 3D viewer for road grading plan models. A road grading plan model contains the site topography, ' +
                'the road start and end points, and one or more road plan options.</p>',
            '<div class="roadie-open">',
            '<p><label class="roadie-button">Open a road plan<input type="file" id="roadie-file" multiple ' +
                'accept=".json,application/json,image/*,application/pdf" hidden></label></p>',
            '<p>Select or drop a road plan model JSON file - and its source map image, to show it in the report. ' +
                'The files stay on your computer.</p>',
            '</div>',
            '<div id="roadie-recent"></div>',
            '<p>To view a road plan model URL, use the "file" argument: <code>#var.vFile=\'plan.json\'</code></p>',
            '<hr>',
            `<p>${argsLink(globals, 'Road plan model documentation', {'doc': true})}</p>`
        ];
        this.render('Roadie', html.join('\n'));
        this.document.getElementById('roadie-file').addEventListener('change', (event) => this.openFiles(event.target.files));
        this.localFileList().then((recent) => {
            const recentPlans = recent.filter(({name}) => name.toLowerCase().endsWith('.json'));
            const element = this.document.getElementById('roadie-recent');
            if (routeCount === this.routeCount && element !== null && recentPlans.length > 0) {
                const items = recentPlans.map(({name}) => `<li><p>${argsLink(globals, name, {'file': `${localPrefix}${name}`})}</p></li>`);
                element.innerHTML = `<h2 id="recent-plans">Recent Plans</h2><ul>${items.join('')}</ul>`;
            }
        });
    }
}


// Render a "**bold:** text" error message as HTML
function markdownStrong(message) {
    const match = message.match(/^\*\*(.*?)\*\*(.*)$/);
    return match !== null ? `<strong>${escapeHtml(match[1])}</strong>${escapeHtml(match[2])}` : escapeHtml(message);
}


// The report page - the 3D views are drawn progressively after the page renders, nearest the viewport first
class ReportPage {
    constructor(app, data, globals, args, headerId) {
        this.app = app;
        this.data = data;
        this.globals = globals;
        this.args = args;
        this.closed = false;
        this.timeoutId = null;
        this.observer = null;
        this.width = viewWidth(app.window);
        this.renderReport(headerId);
    }


    renderReport(headerId = null) {
        const {app, data} = this;
        const {window} = app;
        const scrollY = headerId === null && this.report !== undefined ? window.scrollY : null;
        const report = buildReport(data, this.globals, this.args, this.width, true);
        this.report = report;
        let {html} = report;
        if (data.imageMissing) {
            html = html.replace('<hr>', `<h3 id="source-map">Source Map</h3><p>Open the map image ("${escapeHtml(data.imageMissing)}") ` +
                'with the road plan to show it here.</p>\n<hr>');
        }
        app.render(report.title, html, headerId);
        if (scrollY !== null) {
            window.scrollTo(0, scrollY);
        }

        // The plan view click handler - open the 3D explorer centered on the clicked ground point, zoomed in 4x
        const planSvg = app.main.querySelector('svg.roadie-plan');
        planSvg?.addEventListener('click', (event) => {
            const rect = planSvg.getBoundingClientRect();
            const {topo} = data;
            const {scale, height, width} = report.plan;
            const pxValue = event.clientX - rect.left;
            const pyValue = event.clientY - rect.top;
            const x = Math.max(0, Math.min(topo.width, (pxValue * width / rect.width - planPad) / scale));
            const y = Math.max(0, Math.min(topo.height, topo.height - (pyValue * height / rect.height - planPad) / scale));
            window.location.hash = argsURL(this.globals, {'explore': true, 'x': round(x, 1), 'y': round(y, 1), 'z': null, 'zoom': 4});
        });

        // Draw the 3D views - the visible ones first, then the rest, one per task so the page stays responsive
        this.canvases = [...app.main.querySelectorAll('canvas[data-view]')];
        this.drawings = this.canvases.map(() => null);
        this.pending = new Set(this.canvases.keys());
        this.observer?.disconnect();
        this.observer = new window.IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    this.drawView(parseInt(entry.target.dataset.view, 10));
                }
            }
        }, {'rootMargin': '50% 0px'});
        for (const [ixView, canvas] of this.canvases.entries()) {
            this.observer.observe(canvas);
            canvas.addEventListener('mousemove', (event) => showCanvasTitle(canvas, this.drawings[ixView], event));
        }
        this.scheduleViews();
    }


    // Draw a 3D view as finely as fits its time budget
    drawView(ixView) {
        if (this.closed || !this.pending.has(ixView)) {
            return;
        }
        this.pending.delete(ixView);
        this.observer.unobserve(this.canvases[ixView]);
        const {app} = this;
        app.smoothing ??= new AdaptiveSmoothing(app.storageGet(cellCostKey));
        const {smoothing, window} = app;
        const timeBegin = performance.now();
        const points = smoothing.targetPoints(reportBudget);
        const drawing = this.report.views[ixView].render({...smoothLimitsCanvas, points});
        this.drawings[ixView] = drawing;
        paintCanvas(this.canvases[ixView], drawing, window.devicePixelRatio || 1, false);

        // Measure the drawing - through the next animation frame, so the canvas's rasterization counts
        const cells = countCells(drawing);
        window.requestAnimationFrame(() => {
            smoothing.recordCost(performance.now() - timeBegin, cells);
            app.storageSet(cellCostKey, smoothing.cellCost);
            app.logTime(`3D view ${ixView + 1} - ${drawing.elements.length} operations, ${cells} cells, step ${drawing.step}, ` +
                `smooth ${drawing.smooth}${drawing.pointLimited ? ` (${points} point limit)` : ''} - drawn`, timeBegin);
        });
    }


    scheduleViews() {
        this.app.window.clearTimeout(this.timeoutId);
        this.timeoutId = this.app.window.setTimeout(() => {
            const [ixView] = this.pending;
            if (ixView !== undefined) {
                this.drawView(ixView);
                this.scheduleViews();
            }
        }, 0);
    }


    resize() {
        const width = viewWidth(this.app.window);
        if (width !== this.width) {
            this.width = width;
            this.app.window.clearTimeout(this.resizeId);
            this.resizeId = this.app.window.setTimeout(() => this.renderReport(), 100);
        }
    }


    // Draw every 3D view before printing - at print resolution (at least twice the screen's, about 300 dots per inch for a
    // report-width view)
    print() {
        for (const ixView of [...this.pending]) {
            this.drawView(ixView);
        }
        const ratio = Math.max(printRatio, this.app.window.devicePixelRatio || 1);
        for (const [ixView, canvas] of this.canvases.entries()) {
            if (this.drawings[ixView] !== null) {
                paintCanvas(canvas, this.drawings[ixView], ratio, false);
            }
        }
    }


    close() {
        this.closed = true;
        this.app.window.clearTimeout(this.timeoutId);
        this.app.window.clearTimeout(this.resizeId);
        this.observer?.disconnect();
    }
}


// The 3D explorer page - drawn on a canvas, redrawn once per animation frame as the keys change the view. Smooth terrain
// is drawn as finely as fits the moving view's frame time budget, then, once the keys stop, as finely as fits the still
// view's budget (smoothing.js). The road segments' tooltips (the SVG drawing's titles) are found by hit-testing the
// drawing operations.
class ExplorePage {
    constructor(app, data, globals, args) {
        this.app = app;
        this.explorer = new Explorer(data, globals, args);
        this.frameId = null;
        this.refineId = null;
        this.drawing = null;
        app.smoothing ??= new AdaptiveSmoothing(app.storageGet(cellCostKey));
        app.document.title = `${data.plan.title} - 3D`;
        app.document.body.classList.toggle('roadie-explore', true);
        app.window.scrollTo(0, 0);
        app.main.innerHTML = '<div class="roadie-explorer"><canvas role="img"></canvas>' +
            `<a class="roadie-explorer-back" href="${escapeHtml(this.explorer.backURL())}">Back to the report</a></div>`;
        this.canvas = app.main.querySelector('canvas');
        this.canvas.setAttribute('style', exploreStyle);
        this.back = app.main.querySelector('a');
        this.canvas.addEventListener('mousemove', (event) => showCanvasTitle(this.canvas, this.drawing, event));
        this.draw(false);
    }


    size() {
        const {window} = this.app;
        return [Math.max(320, window.innerWidth - 3 * fontSize), Math.max(240, window.innerHeight - 3 * fontSize)];
    }


    // Draw the view - "still" draws the smooth terrain for the still view's frame time budget
    draw(still) {
        this.frameId = null;
        const {app, canvas} = this;
        const {smoothing, window} = app;
        const timeBegin = performance.now();
        const [width, height] = this.size();
        const points = smoothing.points(still);
        const drawing = this.explorer.render(width, height, true, {...smoothLimitsCanvas, points});
        this.drawing = drawing;
        const timeBuilt = performance.now();
        canvas.setAttribute('aria-label', drawing.label);
        paintCanvas(canvas, drawing, window.devicePixelRatio || 1, true);
        const timePainted = performance.now();
        this.back.href = this.explorer.backURL();
        canvas.dataset.frame = `${parseInt(canvas.dataset.frame ?? '0', 10) + 1}`;

        // Measure the frame - through the next animation frame, so the canvas's rasterization counts
        const cells = countCells(drawing);
        window.requestAnimationFrame(() => {
            const frameTime = performance.now() - timeBegin;
            smoothing.record(frameTime, cells, still);
            if (still) {
                app.storageSet(cellCostKey, smoothing.cellCost);
            }
            app.logTime(`3D explorer ${still ? 'still' : 'moving'} frame - ${drawing.ops.length} operations, ${cells} cells, ` +
                `step ${drawing.step}, smooth ${drawing.smooth}${drawing.pointLimited ? ` (${points} point limit)` : ''} - built in ` +
                `${(timeBuilt - timeBegin).toFixed(1)} ms, painted in ${(timePainted - timeBuilt).toFixed(1)} ms, frame`, timeBegin);
        });

        // Once the keys stop, draw the still view, if its larger budget draws the terrain more finely
        window.clearTimeout(this.refineId);
        this.refineId = null;
        if (!still && drawing.pointLimited) {
            this.refineId = window.setTimeout(() => {
                this.refineId = null;
                if (smoothing.points(true) > points) {
                    this.draw(true);
                }
            }, refineDelay);
        }
    }


    scheduleDraw() {
        this.app.window.clearTimeout(this.refineId);
        this.refineId = null;
        if (this.frameId === null) {
            this.frameId = this.app.window.requestAnimationFrame(() => this.draw(false));
        }
    }


    resize() {
        this.scheduleDraw();
    }


    keyDown(event) {
        // Leave the keys of focused inputs alone
        const {activeElement} = this.app.document;
        if (activeElement !== null && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'SELECT' || activeElement.isContentEditable)) {
            return;
        }
        const [width, height] = this.size();
        const result = this.explorer.keyDown(event, width, height);
        if (result === 'back') {
            this.app.window.location.hash = this.explorer.backURL();
        } else if (result === 'render') {
            event.preventDefault();
            this.scheduleDraw();
        }
    }


    close() {
        if (this.frameId !== null) {
            this.app.window.cancelAnimationFrame(this.frameId);
        }
        this.app.window.clearTimeout(this.refineId);
        this.app.document.body.classList.toggle('roadie-explore', false);
        this.app.storageSet(cellCostKey, this.app.smoothing.cellCost);
    }
}
