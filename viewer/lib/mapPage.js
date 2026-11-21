// mapPage.js - the map page: the loaded plan's site, to draw its config's marks on - the areas the road must avoid, the
// existing roads that the USGS doesn't map, and the places the road must pass through

import {cellContours, contourInterval, contourLevel, planMarkers, roadColor, roadFeatureColor, streamColor, terrainShade} from './draw.js';
import {escapeHtml, px, round} from './format.js';
import {planLatLong, planPoint} from './geo.js';
import {planTopo, siteMarkFeatures, siteMarkNames, siteMarkPrefixes, validateSite} from './model.js';
import {argsURL} from './args.js';


// The marks' kinds - each one's plan config member, and its name
const markKinds = {
    'area': {'member': 'exclusions', 'name': 'Area to avoid'},
    'road': {'member': 'roads', 'name': 'Existing road'},
    'place': {'member': 'passThrough', 'name': 'Place to pass through'}
};


// The tools' hints - the select tool's, and each kind of mark's
const toolHints = {
    'select': 'Select a mark to rename or delete it, or drag its points. Drag the map to move it, and scroll to zoom.',
    'area': 'Click the area\'s corners - double-click or press Enter to finish it, Backspace removes its last corner, and Escape ' +
        'cancels it.',
    'road': 'Click the road\'s points - double-click or press Enter to finish it, Backspace removes its last point, and Escape ' +
        'cancels it.',
    'place': 'Click the place.'
};


// The backdrops
const backdrops = {'contours': 'Contours', 'map': 'Topographic map', 'relief': 'Shaded relief'};


// The marks' colors
const markColors = {'area': '#d0312d', 'road': '#7a5a1e', 'place': '#7b3fc4'};


// The map's size, in pixels, when its element has none (its height is a proportion of its width), and its smallest
// size, the distance within which a point is hit, the movement that's a drag (not a click), the most shaded relief
// pixels on a side, and the most a map is zoomed out and in (multiples of the zoom that fits the site)
const defaultWidth = 1000;
const defaultProportion = 0.65;
const minSize = [320, 240];
const hitPixels = 8;
const dragPixels = 4;
const reliefPixels = 1500;
const zoomLimits = [0.5, 64];


// The selection panel's text when no mark is selected
const noSelectionHtml = '<p class="sageroad-map-hint">Select a mark to rename or delete it.</p>';


// The map page - the loaded plan's site, and its config's marks. Its "Done" sets the loaded plan's config's marks. The
// page fills the window - its controls are above the map, and the selected mark's panel is beside it - so the map is
// the window's room that's left, and it doesn't change size as a mark is selected.
export class MapPage {
    constructor(app, globals) {
        this.app = app;
        this.globals = globals;
        this.closed = false;
        this.load();
    }


    close() {
        this.closed = true;
        this.app.document.body.classList.toggle('sageroad-map-window', false);
    }


    // Load the loaded plan's site, and render the page
    async load() {
        const {app, globals} = this;
        const backHtml = `<p><a href="${escapeHtml(argsURL(globals))}">Back</a></p>`;
        const site = app.loaded?.site ?? null;
        const plan = site !== null ? await app.loadedPlan() : null;
        if (this.closed) {
            return;
        }
        if (plan === null || !('topography' in plan) || !('georeference' in plan)) {
            app.render(
                'Edit Map', `<h1>Edit Map</h1>\n<p>The loaded plan has no site yet - run it, and then draw on its map.</p>\n${backHtml}`
            );
            return;
        }
        this.site = site;
        this.plan = plan;
        this.topo = planTopo(plan);
        this.marks = siteMarks(plan, site);
        this.tool = 'select';
        this.backdrop = 'contours';
        this.drawing = null;
        this.selected = null;
        this.drag = null;
        this.imageURL = 'image' in plan ? (await app.imageURL(null, plan.image)).url : null;
        this.reliefURL = null;
        if (this.closed) {
            return;
        }

        // The page
        const toolButtons = Object.keys(toolHints).map((tool) => (
            `<button type="button" class="sageroad-button" data-tool="${tool}">${escapeHtml(markKinds[tool]?.name ?? 'Select')}</button>`
        ));
        const backdropOptions = Object.entries(backdrops).map(([backdrop, name]) => (
            `<option value="${backdrop}"${backdrop === 'map' && this.imageURL === null ? ' disabled' : ''}>${escapeHtml(name)}</option>`
        ));
        app.render('Edit Map', [
            '<div class="sageroad-map-page">',
            '<div class="sageroad-map-header"><h1>Edit Map</h1>' +
                '<p class="sageroad-actions"><button type="button" id="sageroad-map-done" class="sageroad-button">Done</button>' +
                `<a class="sageroad-button" href="${escapeHtml(argsURL(globals))}">Cancel</a></p></div>`,
            '<p>The plan config\'s marks - the areas the road must avoid, the existing roads that the USGS doesn\'t map (a track, a ' +
                'driveway), and the places the road must pass through. A dashed mark is one a run found for the notes - edit it ' +
                'to correct it. Run the plan again to engineer its road options with the marks.</p>',
            '<p class="sageroad-actions sageroad-map-tools">' +
                `<label>Backdrop: <select id="sageroad-map-backdrop">${backdropOptions.join('')}</select></label>` +
                `${toolButtons.join('')}</p>`,
            '<p id="sageroad-map-hint" class="sageroad-map-hint"></p>',
            '<div class="sageroad-map-main">',
            '<div id="sageroad-map" class="sageroad-map">' +
                '<svg id="sageroad-map-svg" class="sageroad-map-svg" xmlns="http://www.w3.org/2000/svg">' +
                '<g id="sageroad-map-view"><g id="sageroad-map-backdrop-layer"></g><g id="sageroad-map-features"></g></g>' +
                '<g id="sageroad-map-marks"></g></svg></div>',
            `<div id="sageroad-map-selection" class="sageroad-map-selection">${noSelectionHtml}</div>`,
            '</div>',
            '</div>'
        ].join('\n'));
        const {document} = app;
        document.body.classList.toggle('sageroad-map-window', true);

        // The controls
        this.svg = document.getElementById('sageroad-map-svg');
        document.getElementById('sageroad-map-backdrop').addEventListener('change', (event) => this.setBackdrop(event.target.value));
        for (const button of document.querySelectorAll('[data-tool]')) {
            button.addEventListener('click', () => this.setTool(button.dataset.tool));
        }
        document.getElementById('sageroad-map-done').addEventListener('click', () => this.done());
        this.svg.addEventListener('pointerdown', (event) => this.pointerDown(event));
        this.svg.addEventListener('pointermove', (event) => this.pointerMove(event));
        this.svg.addEventListener('pointerup', (event) => this.pointerUp(event));
        this.svg.addEventListener('pointercancel', () => {
            this.drag = null;
        });
        this.svg.addEventListener('dblclick', () => this.finishDrawing());
        this.svg.addEventListener('wheel', (event) => this.wheel(event), {'passive': false});

        // The map - it fits the site
        this.resize();
        this.fit();
        this.renderFeatures();
        this.setBackdrop('contours');
        this.setTool('select');
        this.renderView();
    }


    // The map's size, in pixels - its element's (or the default width, and a height of its proportion). A map that
    // fits the site (it isn't moved or zoomed) fits it again.
    resize() {
        if (this.closed || this.svg === undefined) {
            return;
        }
        const element = this.app.document.getElementById('sageroad-map');
        const width = Math.max(minSize[0], element.clientWidth || defaultWidth);
        const height = Math.max(minSize[1], element.clientHeight || Math.round(width * defaultProportion));
        this.size = [width, height];
        this.svg.setAttribute('width', `${width}`);
        this.svg.setAttribute('height', `${height}`);
        if (this.view !== undefined) {
            if (this.view.isFit) {
                this.fit();
            }
            this.renderView();
        }
    }


    // Fit the site in the map - its center is the map's
    fit() {
        this.view = {'x': this.topo.width / 2, 'y': this.topo.height / 2, 'scale': this.fitScale(), 'isFit': true};
    }


    // The scale that fits the site in the map, in pixels per plan unit
    fitScale() {
        const [width, height] = this.size;
        return Math.min(width / this.topo.width, height / this.topo.height) * 0.95;
    }


    // Convert plan coordinates to the map's pixels, and back
    toScreen([x, y]) {
        const [width, height] = this.size;
        const {view} = this;
        return [(x - view.x) * view.scale + width / 2, (view.y - y) * view.scale + height / 2];
    }

    toPlan([screenX, screenY]) {
        const [width, height] = this.size;
        const {view} = this;
        return [view.x + (screenX - width / 2) / view.scale, view.y - (screenY - height / 2) / view.scale];
    }


    // An event's point on the map, in pixels
    eventPoint(event) {
        const rect = this.svg.getBoundingClientRect();
        return [event.clientX - rect.left, event.clientY - rect.top];
    }


    // Set the tool - a drawing that isn't done is cancelled
    setTool(tool) {
        this.tool = tool;
        this.drawing = null;
        this.placed = null;
        for (const button of this.app.document.querySelectorAll('[data-tool]')) {
            button.setAttribute('aria-pressed', `${button.dataset.tool === tool}`);
        }
        this.app.document.getElementById('sageroad-map-hint').textContent = toolHints[tool];
        this.renderMarks();
    }


    // Set the backdrop - the site's contours, its topographic map, or its shaded relief
    setBackdrop(backdrop) {
        this.backdrop = backdrop;
        this.app.document.getElementById('sageroad-map-backdrop').value = backdrop;
        const {topo} = this;
        const layer = this.app.document.getElementById('sageroad-map-backdrop-layer');
        if (backdrop === 'contours') {
            layer.innerHTML = contoursHtml(this.plan, topo);
        } else {
            if (backdrop === 'relief') {
                this.reliefURL ??= reliefURL(this.app.document, topo);
            }
            const url = backdrop === 'map' ? this.imageURL : this.reliefURL;
            layer.innerHTML = `<g transform="translate(0 ${px(topo.height)}) scale(1 -1)"><image href="${escapeHtml(url)}" x="0" y="0" ` +
                `width="${px(topo.width)}" height="${px(topo.height)}" preserveAspectRatio="none"/></g>`;
        }
    }


    // Render the site's features - its streams, roads, and trails, its rock outcrops and its exclusion areas that aren't
    // marks, its road options' centerlines, and its start and end points (the marks are drawn by themselves)
    renderFeatures() {
        const {plan, topo} = this;
        const isMark = siteMarkFeatures(plan.site);
        const lines = [];
        const pointsText = (points) => points.map(({x, y}) => `${px(x)},${px(y)}`).join(' ');
        const line = (points, stroke, width, dash = null) => (
            `<polyline points="${pointsText(points)}" fill="none" stroke="${stroke}" stroke-width="${width}"` +
            `${dash !== null ? ` stroke-dasharray="${dash}"` : ''} vector-effect="non-scaling-stroke"/>`
        );
        for (const feature of topo.features.filter((topoFeature) => !isMark(topoFeature))) {
            if (feature.type === 'stream') {
                lines.push(line(feature.points, streamColor, 2));
            } else if (feature.type === 'road') {
                lines.push(line(feature.points, roadFeatureColor, 2.5));
            } else if (feature.type === 'trail') {
                lines.push(line(feature.points, roadFeatureColor, 1.5, '5 4'));
            } else {
                const color = feature.type === 'rock' ? '#8a6a45' : '#555555';
                lines.push(`<polygon points="${pointsText(feature.points)}" fill="${color}" fill-opacity="0.12" stroke="${color}" ` +
                    'stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>');
            }
        }
        for (const option of plan.options) {
            lines.push(line(option.alignment, roadColor, 2));
        }
        for (const [point, , color] of planMarkers(plan)) {
            lines.push(`<polyline points="${px(point.x)},${px(point.y)} ${px(point.x)},${px(point.y)}" stroke="${color}" ` +
                'stroke-width="12" stroke-linecap="round" vector-effect="non-scaling-stroke"/>');
        }
        this.app.document.getElementById('sageroad-map-features').innerHTML = lines.join('');
    }


    // Render the map's view - its backdrop's and features' transform, and the marks
    renderView() {
        const [width, height] = this.size;
        const {view} = this;
        const value = (number) => `${round(number, 4) + 0}`;
        const translate = `${value(width / 2 - view.x * view.scale)} ${value(height / 2 + view.y * view.scale)}`;
        this.app.document.getElementById('sageroad-map-view').setAttribute(
            'transform', `matrix(${value(view.scale)} 0 0 ${value(-view.scale)} ${translate})`
        );
        this.renderMarks();
    }


    // Render the marks, and the drawing
    renderMarks() {
        const elements = [];
        for (const [ixMark, mark] of this.marks.entries()) {
            elements.push(markHtml(mark.kind, mark.points.map((point) => this.toScreen(point)), mark.name, mark.found !== null,
                ixMark === this.selected));
        }
        if (this.drawing !== null && this.drawing.length > 0) {
            elements.push(markHtml(this.tool, this.drawing.map((point) => this.toScreen(point)), null, false, true));
        }
        this.app.document.getElementById('sageroad-map-marks').innerHTML = elements.join('');
    }


    // Render the selected mark's panel - its kind, its name, how it was found, and its delete button
    renderSelection() {
        const {document} = this.app;
        const element = document.getElementById('sageroad-map-selection');
        const mark = this.selected !== null ? this.marks[this.selected] : null;
        if (mark === null) {
            element.innerHTML = noSelectionHtml;
            return;
        }
        const {found} = mark;
        let foundHtml = '';
        if (found !== null) {
            const how = (found.model ?? null) !== null ?
                `The model "${found.model}" found it on the site's map${(found.why ?? '') !== '' ? ` - "${found.why}"` : ''}.` :
                'Its coordinates are the notes\'.';
            foundHtml = `<p id="sageroad-map-found">A run found it for the notes' place "${escapeHtml(found.place)}". ${escapeHtml(how)} ` +
                'Edit it to correct it - it\'s yours then. If it\'s deleted, a run finds it again while the notes name it.</p>';
        }
        element.innerHTML = [
            `<h2>${escapeHtml(markKinds[mark.kind].name)}</h2>`,
            '<p class="sageroad-actions"><label>Name: <input type="text" id="sageroad-map-name" ' +
                `value="${escapeHtml(mark.name)}"></label>` +
                '<button type="button" id="sageroad-map-delete" class="sageroad-button">Delete</button></p>',
            foundHtml
        ].join('\n');
        document.getElementById('sageroad-map-name').addEventListener('input', (event) => {
            const name = event.target.value.trim();
            if (name !== '') {
                this.editMark(this.selected, {name});
                document.getElementById('sageroad-map-found')?.remove();
            }
        });
        document.getElementById('sageroad-map-delete').addEventListener('click', () => {
            this.marks.splice(this.selected, 1);
            this.placed = null;
            this.select(null);
        });
    }


    // Select a mark (its index), or none (null)
    select(ixMark) {
        this.selected = ixMark;
        this.renderMarks();
        this.renderSelection();
    }


    // Edit a mark - it's the author's, then (it isn't found)
    editMark(ixMark, members) {
        this.marks[ixMark] = {...this.marks[ixMark], ...members, 'found': null, 'source': null};
        this.renderMarks();
    }


    // Find the mark, or the selected mark's point, at a map point - returns the mark's index and its point's index (null
    // for the mark itself), or null
    hit(screenPoint) {
        const near = (point) => Math.hypot(point[0] - screenPoint[0], point[1] - screenPoint[1]) <= hitPixels;
        if (this.selected !== null) {
            const ixPoint = this.marks[this.selected].points.findIndex((point) => near(this.toScreen(point)));
            if (ixPoint !== -1) {
                return [this.selected, ixPoint];
            }
        }
        for (let ixMark = this.marks.length - 1; ixMark >= 0; ixMark--) {
            const {kind, points} = this.marks[ixMark];
            const screen = points.map((point) => this.toScreen(point));
            const segments = screen.map((point, ix) => [point, screen[(ix + 1) % screen.length]]).
                slice(0, kind === 'road' ? -1 : undefined);
            if (screen.some(near) || segments.some(([point1, point2]) => segmentDistance(screenPoint, point1, point2) <= hitPixels) ||
                (kind === 'area' && pointInPolygon(screenPoint, screen))) {
                return [ixMark, null];
            }
        }
        return null;
    }


    // A pointer is down - a drag of the selected mark's point, a drag of the map, or (if it doesn't move) a click. Only
    // the main button draws - another's (a context menu's, say) has no pointer up.
    pointerDown(event) {
        if (event.button !== 0) {
            return;
        }
        const point = this.eventPoint(event);
        const hit = this.tool === 'select' ? this.hit(point) : null;
        this.svg.setPointerCapture?.(event.pointerId);
        if (hit !== null && hit[1] !== null) {
            this.drag = {'kind': 'point', 'mark': hit[0], 'point': hit[1], 'start': point, 'moved': false};
        } else {
            this.drag = {'kind': 'map', hit, 'start': point, 'view': {...this.view}, 'moved': false};
        }
    }


    pointerMove(event) {
        const {drag} = this;
        if (drag === null) {
            return;
        }
        const point = this.eventPoint(event);
        drag.moved ||= Math.hypot(point[0] - drag.start[0], point[1] - drag.start[1]) > dragPixels;
        if (!drag.moved) {
            return;
        }
        if (drag.kind === 'point') {
            const points = [...this.marks[drag.mark].points];
            points[drag.point] = this.toPlan(point);
            this.editMark(drag.mark, {points});
        } else {
            this.view = {
                ...drag.view,
                'x': drag.view.x - (point[0] - drag.start[0]) / drag.view.scale,
                'y': drag.view.y + (point[1] - drag.start[1]) / drag.view.scale,
                'isFit': false
            };
            this.renderView();
        }
    }


    pointerUp(event) {
        const {drag} = this;
        this.drag = null;
        if (drag === null || drag.moved || drag.kind === 'point') {
            if (drag?.kind === 'point' && drag.moved) {
                this.app.document.getElementById('sageroad-map-found')?.remove();
            }
            return;
        }

        // A click - select a mark, or draw
        const point = this.eventPoint(event);
        if (this.tool === 'select') {
            this.select(drag.hit?.[0] ?? null);
        } else if (this.tool === 'place') {
            // A click where a place was just added is the same place (a double-click's second click)
            if (this.placed === null || !this.isNear(this.placed, point)) {
                this.addMark('place', [this.toPlan(point)]);
                this.placed = this.toPlan(point);
            }
        } else {
            // A point close to the drawing's last is the same point (a double-click's second click)
            this.drawing ??= [];
            const last = this.drawing.at(-1) ?? null;
            if (last === null || !this.isNear(last, point)) {
                this.drawing.push(this.toPlan(point));
            }
            this.renderMarks();
        }
    }


    // Is a plan point at a map point - within a click's movement of it?
    isNear(markPoint, point) {
        return Math.hypot(...this.toScreen(markPoint).map((value, ix) => value - point[ix])) <= dragPixels;
    }


    // Zoom the map around the pointer - its plan point stays under it
    wheel(event) {
        event.preventDefault();
        const point = this.eventPoint(event);
        const [anchorX, anchorY] = this.toPlan(point);
        const fit = this.fitScale();
        const scale = Math.max(fit * zoomLimits[0], Math.min(fit * zoomLimits[1], this.view.scale * Math.exp(-event.deltaY * 0.002)));
        const [width, height] = this.size;
        this.view = {scale, 'x': anchorX - (point[0] - width / 2) / scale, 'y': anchorY + (point[1] - height / 2) / scale, 'isFit': false};
        this.renderView();
    }


    // A key - the drawing's: Enter finishes it, Backspace removes its last point, and Escape cancels it (or the selection)
    keyDown(event) {
        if (this.view === undefined) {
            return;
        }
        if (event.key === 'Enter') {
            this.finishDrawing();
        } else if (event.key === 'Backspace' && this.drawing !== null) {
            event.preventDefault();
            this.drawing.pop();
            this.renderMarks();
        } else if (event.key === 'Escape') {
            this.drawing = null;
            this.select(null);
        }
    }


    // Finish the drawing - an area has three points or more, and a road two
    finishDrawing() {
        const {drawing, tool} = this;
        if (drawing !== null && drawing.length >= (tool === 'area' ? 3 : 2)) {
            this.addMark(tool, drawing);
        }
    }


    // Add a mark, named for its kind's count (as the plan config's marks without names are), and select it
    addMark(kind, points) {
        const prefix = siteMarkPrefixes[markKinds[kind].member];
        const names = new Set(this.marks.map(({name}) => name));
        let number = this.marks.filter((mark) => mark.kind === kind).length + 1;
        while (names.has(`${prefix} ${number}`)) {
            number += 1;
        }
        this.marks.push({kind, 'name': `${prefix} ${number}`, points, 'found': null, 'source': null});
        this.drawing = null;
        this.select(this.marks.length - 1);
    }


    // The marks are done - they're the loaded plan's config's
    done() {
        const {app} = this;
        const site = {...this.site};
        for (const [kind, {member}] of Object.entries(markKinds)) {
            const configMarks = this.marks.filter((mark) => mark.kind === kind).map((mark) => configMark(this.plan, mark));
            if (configMarks.length > 0) {
                site[member] = configMarks;
            } else {
                delete site[member];
            }
        }
        const {loaded} = app;
        const validated = validateSite(site).site;
        if (JSON.stringify(validated) !== JSON.stringify(this.site)) {
            app.setLoaded({...loaded, 'site': validated, 'changed': loaded.file !== null, 'saved': false});
        }
        app.goHome(this.globals);
    }
}


// Get a plan config's marks, in the plan's coordinates - each one's "kind", "name", "points" ([x, y] arrays), "found"
// (or null), and "source" (its plan config object - it's written as it was, unless it's edited)
function siteMarks(plan, site) {
    const marks = [];
    for (const [kind, {member}] of Object.entries(markKinds)) {
        const names = siteMarkNames(site, member);
        for (const [ixMark, source] of (site[member] ?? []).entries()) {
            const points = kind === 'place' ? [source] : source.points;
            marks.push({
                kind,
                'name': names[ixMark],
                'points': points.map(({latitude, longitude}) => planPoint(plan, latitude, longitude)),
                'found': source.found ?? null,
                source
            });
        }
    }
    return marks;
}


// Get a mark's plan config object - its source, if it isn't edited
function configMark(plan, mark) {
    if (mark.source !== null) {
        return mark.source;
    }
    const latLongs = mark.points.map(([x, y]) => {
        const [latitude, longitude] = planLatLong(plan, x, y);
        return {'latitude': round(latitude, 7), 'longitude': round(longitude, 7)};
    });
    return mark.kind === 'place' ? {'name': mark.name, ...latLongs[0]} : {'name': mark.name, 'points': latLongs};
}


// Create a mark's SVG markup - "points" are its points, in the map's pixels. A found mark is dashed, and a selected
// mark has its points' handles.
function markHtml(kind, points, name, isFound, isSelected) {
    const color = markColors[kind];
    const pointsText = points.map(([x, y]) => `${px(x)},${px(y)}`).join(' ');
    const dash = isFound ? ' stroke-dasharray="6 4"' : '';
    const width = isSelected ? 3 : 2;
    const elements = [];
    if (kind === 'area' && points.length > 2) {
        elements.push(
            `<polygon points="${pointsText}" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="${width}"${dash}/>`
        );
    } else if (kind !== 'place') {
        elements.push(`<polyline points="${pointsText}" fill="none" stroke="${color}" stroke-width="${width + 1}"${dash}/>`);
    } else {
        elements.push(
            `<circle cx="${px(points[0][0])}" cy="${px(points[0][1])}" r="7" fill="${color}" stroke="white" stroke-width="2"${dash}/>`
        );
    }
    if (isSelected && kind !== 'place') {
        for (const [x, y] of points) {
            elements.push(`<circle cx="${px(x)}" cy="${px(y)}" r="5" fill="white" stroke="${color}" stroke-width="2"/>`);
        }
    }
    if (name !== null) {
        elements.push(`<text x="${px(points[0][0] + 9)}" y="${px(points[0][1] - 9)}" font-size="12" font-family="sans-serif" ` +
            `fill="${color}" stroke="white" stroke-width="3" paint-order="stroke">${escapeHtml(name)}</text>`);
    }
    return `<g class="sageroad-map-mark">${elements.join('')}</g>`;
}


// Create the site's contours' SVG markup, in the plan's coordinates
function contoursHtml(plan, topo) {
    const interval = contourInterval(plan, topo);
    const {rows, nRows, nCols, spacing} = topo;
    const segments = new Float64Array(8);
    const minorPath = [];
    const indexPath = [];
    for (let row = 0; row < nRows - 1; row++) {
        for (let col = 0; col < nCols - 1; col++) {
            const zNW = rows[row][col];
            const zNE = rows[row][col + 1];
            const zSE = rows[row + 1][col + 1];
            const zSW = rows[row + 1][col];
            const zMax = Math.max(zNW, zNE, zSE, zSW);
            for (let ixLevel = Math.ceil(Math.min(zNW, zNE, zSE, zSW) / interval); contourLevel(ixLevel, interval) <= zMax; ixLevel++) {
                const segmentCount = cellContours(zNW, zNE, zSE, zSW, contourLevel(ixLevel, interval), segments);
                for (let ixSegment = 0; ixSegment < segmentCount; ixSegment++) {
                    const ix = ixSegment * 4;
                    (ixLevel % 5 === 0 ? indexPath : minorPath).push(
                        `M${px((col + segments[ix]) * spacing)} ${px(topo.height - (row + segments[ix + 1]) * spacing)}` +
                        `L${px((col + segments[ix + 2]) * spacing)} ${px(topo.height - (row + segments[ix + 3]) * spacing)}`
                    );
                }
            }
        }
    }
    return `<rect x="0" y="0" width="${px(topo.width)}" height="${px(topo.height)}" fill="#f7f4ee"/>` +
        `<path d="${minorPath.join('')}" fill="none" stroke="#b89a72" stroke-width="0.6" vector-effect="non-scaling-stroke"/>` +
        `<path d="${indexPath.join('')}" fill="none" stroke="#8a6a45" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
}


// Create the site's shaded relief image's data URL - drawn on a canvas
function reliefURL(document, topo) {
    const step = Math.max(1, Math.ceil(Math.max(topo.nCols, topo.nRows) / reliefPixels));
    const steps = (count) => {
        const indexes = [];
        for (let index = 0; index < count - 1; index += step) {
            indexes.push(index);
        }
        indexes.push(count - 1);
        return indexes;
    };
    const cols = steps(topo.nCols);
    const rows = steps(topo.nRows);
    const pixels = terrainShade(topo, cols, rows);
    const canvas = document.createElement('canvas');
    canvas.width = cols.length;
    canvas.height = rows.length;
    const context = canvas.getContext('2d');
    const image = context.createImageData(cols.length, rows.length);
    for (const [ix, shade] of pixels.entries()) {
        image.data.set([shade, shade, shade, 255], ix * 4);
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
}


// Get a point's distance from a segment
function segmentDistance([x, y], [x1, y1], [x2, y2]) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared)) : 0;
    return Math.hypot(x - (x1 + fraction * dx), y - (y1 + fraction * dy));
}


// Is a point in a polygon?
function pointInPolygon([x, y], polygon) {
    let inside = false;
    for (let ix = 0, ixPrev = polygon.length - 1; ix < polygon.length; ixPrev = ix, ix += 1) {
        const [x1, y1] = polygon[ix];
        const [x2, y2] = polygon[ixPrev];
        if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) {
            inside = !inside;
        }
    }
    return inside;
}
