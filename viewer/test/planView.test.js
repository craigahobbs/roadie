import {analyzeOption, planTopo, validatePlan} from '../lib/model.js';
import {complexPlan, countOf, simplePlan, svgElements} from './viewFixtures.js';
import {planPad, planView, profileView} from '../lib/planView.js';
import assert from 'node:assert/strict';
import {fixturePlan} from './fixture.js';
import {projection} from '../lib/view3d.js';
import test from 'node:test';


// The drawing style, and the text and line element attributes
const style = 'background: #f4f1ea; border: 1px solid #ccc; display: block; max-width: 100%; height: auto; break-inside: avoid; ' +
    'margin: 0.75em 0 1.5em 0;';
const textAttr = 'font-family="sans-serif" text-anchor="middle" dominant-baseline="middle"';
const textStroke = 'stroke="white" stroke-width="3" paint-order="stroke"';
const lineAttr = 'stroke-linejoin="round" stroke-linecap="round"';


// Create a plan's plan view and profile view drawings of an option - returns the plan view (planView), the drawings'
// elements, the profile view's markup, and the validated plan's topography
function drawings(planValue, ixOption, width, outlines = []) {
    const {plan} = validatePlan(planValue);
    const topo = planTopo(plan);
    const analyses = plan.options.map((option, ixAnalysis) => analyzeOption(plan, ixAnalysis, topo));
    const planDrawing = planView(plan, topo, analyses, ixOption, width, typeof outlines === 'function' ? outlines(topo) : outlines);
    const profile = profileView(plan, plan.options[ixOption], analyses[ixOption], width, 320);
    return {planDrawing, 'planElements': svgElements(planDrawing.svg), profile, 'profileElements': svgElements(profile)};
}


// Get the elements with an attribute value
function withAttr(elements, name, value) {
    return elements.filter((element) => element.includes(` ${name}="${value}"`));
}


// Get the text of the elements with an attribute value
function texts(elements, name, value) {
    return withAttr(elements, name, value).map((element) => element.slice(element.indexOf('>') + 1, element.lastIndexOf('<')));
}


test('planView, a meters plan', () => {
    const {planDrawing, planElements} = drawings(simplePlan(), 0, 420);

    // The plan view fits the topography (40 x 40 meters) in the width, less the padding
    assert.equal(planPad, 10);
    assert.equal(planDrawing.scale, 10);
    assert.equal(planDrawing.height, 420);
    assert.ok(planDrawing.svg.startsWith(
        '<svg width="420" height="420" viewBox="0 0 420 420" role="img" aria-label="Plan view of the Flat road plan option" ' +
        `style="${style} cursor: crosshair;" class="roadie-plan"><path d="M`
    ));
    assert.ok(planDrawing.svg.endsWith('</svg>'));

    // The first elements are the minor and index contour paths - the plane's 0.2 meter contours cross each grid cell four times
    assert.equal(planElements.length, 61);
    assert.ok(planElements[0].startsWith('<path d="M110 90L10 90M110 70L10 70M110 50L10 50M110 30L10 30M210 90L110 90M'));
    assert.ok(planElements[0].endsWith('" fill="none" stroke="#b89a72" stroke-width="0.6"/>'));
    assert.equal(countOf(planElements[0], 'M'), 4 * 16);

    // Each grid row is at a whole meter - its index contour is along the north side of the grid cells below it
    assert.ok(planElements[1].startsWith('<path d="M110 10L10 10M210 10L110 10M310 10L210 10M410 10L310 10M110 110L10 110M'));
    assert.ok(planElements[1].endsWith('M410 310L310 310" fill="none" stroke="#8a6a45" stroke-width="1.3"/>'));
    assert.equal(countOf(planElements[1], 'M'), 16);

    // The road's footprint - its 12 sample intervals' cut slopes (uphill), fill slopes (downhill), and gravel surface. The
    // road is 10 meters wide, from 5 meters either side of its centerline
    const cuts = withAttr(planElements, 'fill', 'rgb(196,120,64)');
    const fills = withAttr(planElements, 'fill', 'rgb(218,184,96)');
    const surfaces = withAttr(planElements, 'fill', 'rgb(150,146,136)');
    assert.deepEqual([cuts.length, fills.length, surfaces.length], [12, 12, 12]);
    assert.equal(
        surfaces[0],
        '<polygon points="10,160 43.3,160 43.3,260 10,260" fill="rgb(150,146,136)" stroke="rgb(150,146,136)" stroke-width="0.5"/>'
    );
    assert.equal(
        cuts[0],
        '<polygon points="10,160 10,154.4 43.3,154.4 43.3,160" fill="rgb(196,120,64)" stroke="rgb(196,120,64)" stroke-width="0.5"/>'
    );
    assert.equal(
        fills[0],
        '<polygon points="10,260 10,268.8 43.3,268.8 43.3,260" fill="rgb(218,184,96)" stroke="rgb(218,184,96)" stroke-width="0.5"/>'
    );

    // The road is wide enough to see, so it has no highlighted centerline
    assert.deepEqual(withAttr(planElements, 'stroke', '#d6246e'), []);

    // The station ticks, 5 meters apart, in meters stations - the 15 meter tick is between the road's samples either side
    // of it (13.3 and 16.7 meters)
    assert.deepEqual(texts(planElements, 'font-size', '10').slice(0, -1), ['0+005', '0+010', '0+015', '0+020', '0+025', '0+030', '0+035']);
    assert.deepEqual(withAttr(planElements, 'r', '2.5').slice(1, 3), [
        '<circle cx="110" cy="210" r="2.5" fill="#222"/>',
        '<circle cx="160" cy="210" r="2.5" fill="#222"/>'
    ]);
    assert.equal(
        withAttr(planElements, 'font-size', '10')[1],
        `<text x="116" y="202" font-size="10" ${textAttr.replace('middle', 'start')} fill="#222" ${textStroke}>0+010</text>`
    );

    // The start and end markers and their default labels, kept within the drawing
    assert.deepEqual(planElements.slice(-9, -5), [
        '<circle cx="10" cy="210" r="6" fill="#1a8f3c" stroke="white" stroke-width="2"/>',
        `<text x="24.8" y="196" font-size="13" ${textAttr} fill="#1a8f3c" ${textStroke} font-weight="bold">Start</text>`,
        '<circle cx="410" cy="210" r="6" fill="#c0392b" stroke="white" stroke-width="2"/>',
        `<text x="403.5" y="196" font-size="13" ${textAttr} fill="#c0392b" ${textStroke} font-weight="bold">End</text>`
    ]);

    // The scale bar (10 meters is 100 pixels), with the contour interval, and the north arrow
    assert.deepEqual(planElements.slice(-5), [
        '<rect x="18" y="384" width="116" height="26" fill="white" fill-opacity="0.8"/>',
        `<polyline points="26,398 126,398" fill="none" stroke="#222" stroke-width="3" ${lineAttr}/>`,
        `<text x="26" y="391" font-size="10" ${textAttr.replace('middle', 'start')} fill="#222" ${textStroke}>` +
            '10 m — contours 0.20 m</text>',
        '<polygon points="390,18 383,38 397,38" fill="#222" stroke="#222" stroke-width="1"/>',
        `<text x="390" y="48" font-size="11" ${textAttr} fill="#222" ${textStroke} font-weight="bold">N</text>`
    ]);
});


test('planView, features, structures, and the other options', () => {
    const {planDrawing, planElements} = drawings(complexPlan(), 0, 420);
    assert.equal(planDrawing.scale, 5);
    assert.equal(planDrawing.height, 420);
    assert.equal(planElements.length, 101);

    // The 4 foot contours of the 80% slope cross each of the 64 grid cells twice (within it and along its top) - every fifth
    // contour (120, 140, and 160 feet) is an index contour
    assert.equal(countOf(planElements[0], 'M'), 104);
    assert.equal(countOf(planElements[1], 'M'), 24);
    assert.ok(planElements[1].startsWith('<path d="M60 35L10 35M110 35L60 35M'));
    assert.ok(planElements[1].includes('M60 160L10 160M'));
    assert.ok(planElements[1].endsWith('M410 285L360 285" fill="none" stroke="#8a6a45" stroke-width="1.3"/>'));

    // The features - streams (one unnamed, one from beyond the topography), a rock outcrop, and an exclusion area - with their
    // names at their centers
    const nameAttr = `font-size="11" ${textAttr}`;
    assert.deepEqual(planElements.slice(2, 11), [
        `<polyline points="70,435 70,-40" fill="none" stroke="#2a6fdb" stroke-width="2.5" ${lineAttr}/>`,
        `<text x="70" y="197.5" ${nameAttr} fill="#1d4f9e" ${textStroke}>Creek A</text>`,
        `<polyline points="235,410 235,10" fill="none" stroke="#2a6fdb" stroke-width="2.5" ${lineAttr}/>`,
        `<polyline points="250,410 250,10" fill="none" stroke="#2a6fdb" stroke-width="2.5" ${lineAttr}/>`,
        `<text x="250" y="210" ${nameAttr} fill="#1d4f9e" ${textStroke}>Creek C</text>`,
        '<polygon points="85,360 135,360 135,260 85,260" fill="rgba(110,110,110,0.35)" stroke="#555555" stroke-width="1"/>',
        `<text x="110" y="310" ${nameAttr} fill="#444" ${textStroke}>Ledge</text>`,
        '<polygon points="320,360 350,360 350,260 320,260" fill="rgba(208,49,45,0.12)" stroke="#d0312d" stroke-width="1.5"/>',
        `<text x="335" y="310" ${nameAttr} fill="#444" ${textStroke}>Shed</text>`
    ]);

    // The other option's centerline is dashed
    assert.equal(
        planElements[11],
        `<polyline points="10,210 210,210 460,210" fill="none" stroke="#777777" stroke-width="1.5" ${lineAttr} stroke-dasharray="6 4"/>`
    );
    assert.equal(withAttr(planElements, 'stroke-dasharray', '6 4').length, 1);

    // The road's footprint - 26 sample intervals of asphalt, but for the bridge deck. The retaining walls (both sides from 0+00
    // to 0+05, and the right side from 0+30 to 0+38) are lines along the road edge in place of the side slopes
    assert.equal(withAttr(planElements, 'fill', 'rgb(70,72,76)').length, 25);
    assert.deepEqual(withAttr(planElements, 'fill', 'rgb(120,104,88)'), [
        '<polygon points="242.2,285 258.8,285 258.8,335 242.2,335" fill="rgb(120,104,88)" stroke="rgb(120,104,88)" stroke-width="0.5"/>'
    ]);
    assert.deepEqual(withAttr(planElements, 'stroke', '#333333').map((element) => element.slice(0, element.indexOf(' fill='))), [
        '<polyline points="10,285 26.6,285"',
        '<polyline points="10,335 26.6,335"',
        '<polyline points="26.6,285 43.2,285"',
        '<polyline points="26.6,335 43.2,335"',
        '<polyline points="159.3,335 175.8,335"',
        '<polyline points="175.8,335 192.4,335"',
        '<polyline points="192.4,335 209,335"'
    ]);
    assert.equal(withAttr(planElements, 'fill', 'rgb(196,120,64)').length, 18);
    assert.equal(withAttr(planElements, 'fill', 'rgb(218,184,96)').length, 19);

    // The culverts cross the road and its slopes - the culvert beyond the end of the road is at its end
    assert.deepEqual(withAttr(planElements, 'stroke-width', '3').filter((element) => element.includes('stroke="#2a6fdb"')), [
        `<polyline points="76.3,150 76.3,380" fill="none" stroke="#2a6fdb" stroke-width="3" ${lineAttr}/>`,
        `<polyline points="435,275 435,325" fill="none" stroke="#2a6fdb" stroke-width="3" ${lineAttr}/>`
    ]);

    // The station ticks, in feet stations, and the scale bar with the plan's contour interval
    assert.deepEqual(texts(planElements, 'font-size', '10'), ['0+20', '0+40', '0+60', '0+80', '20 ft — contours 4 ft']);

    // The start marker is beyond the topography, with its label (the start point's) kept within the drawing
    assert.deepEqual(planElements.slice(-9, -5), [
        '<circle cx="-65" cy="310" r="6" fill="#1a8f3c" stroke="white" stroke-width="2"/>',
        `<text x="20.6" y="296" font-size="13" ${textAttr} fill="#1a8f3c" ${textStroke} font-weight="bold">Road</text>`,
        '<circle cx="385" cy="110" r="6" fill="#c0392b" stroke="white" stroke-width="2"/>',
        `<text x="385" y="96" font-size="13" ${textAttr} fill="#c0392b" ${textStroke} font-weight="bold">End</text>`
    ]);

    // The other option - no structures, a gravel surface, and the first option's centerline
    const other = drawings(complexPlan(), 1, 420).planElements;
    assert.ok(other[11].startsWith('<polyline points="10,310 110,310 110,310 210,310 260,310 310,310 360,310 365,300 435,300" '));
    assert.equal(withAttr(other, 'stroke-dasharray', '6 4').length, 1);
    assert.equal(withAttr(other, 'fill', 'rgb(150,146,136)').length, 27);
    assert.deepEqual(withAttr(other, 'stroke-width', '3').filter((element) => element.includes('stroke="#2a6fdb"')), []);
    assert.deepEqual(withAttr(other, 'stroke', '#333333'), []);
});


test('planView, a road feature', () => {
    // An existing road or trail is a cased line, with its name
    const planValue = simplePlan();
    planValue.topography.features = [
        {'type': 'road', 'name': 'Mill Rd', 'points': [{'x': 0, 'y': 10}, {'x': 20, 'y': 30}, {'x': 40, 'y': 30}]},
        {'type': 'road', 'points': [{'x': 10, 'y': 0}, {'x': 10, 'y': 40}]}
    ];
    const {planElements} = drawings(planValue, 0, 420);
    const lineAttr2 = 'fill="none" stroke="white" stroke-width="3.5"';
    assert.deepEqual(planElements.slice(2, 7), [
        `<polyline points="10,310 210,110 410,110" ${lineAttr2} ${lineAttr}/>`,
        `<polyline points="10,310 210,110 410,110" fill="none" stroke="#6e675f" stroke-width="1.5" ${lineAttr}/>`,
        `<text x="210" y="176.7" font-size="11" ${textAttr} fill="#444" ${textStroke}>Mill Rd</text>`,
        `<polyline points="110,410 110,10" ${lineAttr2} ${lineAttr}/>`,
        `<polyline points="110,410 110,10" fill="none" stroke="#6e675f" stroke-width="1.5" ${lineAttr}/>`
    ]);

    // A road has no effect on the plan's analysis
    const {plan} = validatePlan(planValue);
    const topo = planTopo(plan);
    assert.deepEqual(analyzeOption(plan, 0, topo), analyzeOption(validatePlan(simplePlan()).plan, 0, topo));
});


test('planView, a bridge and an existing road', () => {
    const {planDrawing, planElements} = drawings(fixturePlan(), 1, 976);
    assert.equal(planDrawing.scale, 2.39);
    assert.equal(planDrawing.height, 737);

    // The road's 140 sample intervals - the bridge's deck, the existing road, and asphalt elsewhere
    assert.equal(withAttr(planElements, 'fill', 'rgb(120,104,88)').length, 26);
    assert.equal(withAttr(planElements, 'fill', 'rgb(112,110,104)').length, 29);
    assert.equal(withAttr(planElements, 'fill', 'rgb(70,72,76)').length, 85);

    // The stream is named at its middle, and the exclusion area at its center - the rock outcrop has no name
    assert.deepEqual(texts(planElements, 'font-size', '11'), ['Test Creek', 'Barn', 'N']);
    assert.equal(withAttr(planElements, 'fill', 'rgba(110,110,110,0.35)').length, 1);

    // The station ticks, 100 feet apart, and the scale bar
    assert.deepEqual(texts(planElements, 'font-size', '10'), ['1+00', '2+00', '3+00', '4+00', '100 ft — contours 5 ft']);
    assert.deepEqual(withAttr(planElements, 'fill-opacity', '0.8'), [
        '<rect x="18" y="701" width="255" height="26" fill="white" fill-opacity="0.8"/>'
    ]);

    // The start point's label and the default end label
    assert.deepEqual(texts(planElements, 'font-size', '13'), ['Road', 'End']);
});


test('planView, a narrow road and 3D view outlines', () => {
    const planValue = simplePlan();
    planValue.options[0].section.width = 0.1;
    const {planElements} = drawings(planValue, 0, 420, (topo) => [
        ['2', projection(topo, {'azimuth': 30, 'tilt': 35, 'exaggeration': 1.5, 'zoom': 4, 'x': 30, 'y': 10}, 420, 315), [20, 20]],
        ['3', projection(topo, {'azimuth': 0, 'tilt': 90, 'exaggeration': 1, 'zoom': 2, 'x': 10, 'y': 30}, 420, 315), [10, 30]]
    ]);

    // The road, 1 pixel wide, is also drawn as a highlighted centerline through its samples - a white halo under a colored line
    const centerline = '10,210 43.3,210 76.7,210 110,210 143.3,210 176.7,210 210,210 243.3,210 276.7,210 310,210 343.3,210 376.7,210 ' +
        '410,210';
    assert.deepEqual(planElements.filter((element) => element.includes(centerline)), [
        `<polyline points="${centerline}" fill="none" stroke="white" stroke-width="6" ${lineAttr}/>`,
        `<polyline points="${centerline}" fill="none" stroke="#d6246e" stroke-width="3" ${lineAttr}/>`
    ]);

    // The 3D views' areas are dashed outlines of the ground within their views - the top view's area is a rectangle, cut off at
    // the topography's edge - then their numbers are marked on the road, on top of the outlines
    const outlineAttr = 'fill="none" stroke="rgba(31,78,140,0.55)" stroke-width="1" stroke-dasharray="5 4"';
    const markerAttr = 'font-size="11" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="central"';
    assert.deepEqual(planElements.slice(-6), [
        `<polygon points="277.3,184.7 410,261.5 340,410 176.9,358.5" ${outlineAttr}><title>3D view 2 area</title></polygon>`,
        `<polygon points="10,10 312.7,10 312.7,262.9 10,262.9" ${outlineAttr}><title>3D view 3 area</title></polygon>`,
        '<circle cx="210" cy="210" r="9" fill="#1f4e8c" stroke="white" stroke-width="1.5"/>',
        `<text x="210" y="210" ${markerAttr} fill="white">2</text>`,
        '<circle cx="110" cy="110" r="9" fill="#1f4e8c" stroke="white" stroke-width="1.5"/>',
        `<text x="110" y="110" ${markerAttr} fill="white">3</text>`
    ]);
});


test('profileView, a steep meters road', () => {
    // The road climbs 20% from 2 meters below the ground to 6 meters above it
    const planValue = simplePlan();
    planValue.options[0].alignment[0].z = 100;
    planValue.options[0].alignment[1].z = 108;
    const {profile, profileElements} = drawings(planValue, 0, 420);
    assert.ok(profile.startsWith(
        '<svg width="420" height="320" viewBox="0 0 420 320" role="img" aria-label="Profile of the Flat road plan option" ' +
        `style="${style}"><polyline points="64,280 404,280" fill="none" stroke="#dddddd" stroke-width="1" ${lineAttr}/>`
    ));
    assert.ok(profile.endsWith('</svg>'));

    // The elevation grid, from a step below the lowest elevation, and the station grid
    assert.deepEqual(texts(profileElements, 'text-anchor', 'end'), ['98', '100', '102', '104', '106', '108']);
    assert.deepEqual(withAttr(profileElements, 'stroke', '#dddddd').slice(0, 7).map((element) => element.match(/points="([^"]*)"/)[1]), [
        '64,280 404,280', '64,227.2 404,227.2', '64,174.4 404,174.4', '64,121.6 404,121.6', '64,68.8 404,68.8', '64,16 404,16',
        '64,16 64,280'
    ]);
    const gridTexts = texts(profileElements, 'font-size', '10');
    assert.deepEqual(gridTexts.slice(6, 15), ['0+000', '0+005', '0+010', '0+015', '0+020', '0+025', '0+030', '0+035', '0+040']);
    assert.equal(
        withAttr(profileElements, 'y', '294')[1],
        `<text x="106.5" y="294" font-size="10" ${textAttr} fill="#444" ${textStroke}>0+005</text>`
    );

    // The axis titles - 26.4 pixels per meter of elevation and 8.5 pixels per meter of station
    assert.deepEqual(texts(profileElements, 'font-size', '11'), ['Station', 'Elevation (m) — vertical exaggeration 3.1x']);

    // The cut area, where the grade is below the ground (to 0+010, through the next sample), then the fill area
    const cutAttr = 'fill="rgb(196,120,64)" stroke="rgb(196,120,64)" stroke-width="0.5"';
    const fillAttr = 'fill="rgb(218,184,96)" stroke="rgb(218,184,96)" stroke-width="0.5"';
    assert.deepEqual(profileElements.filter((element) => element.startsWith('<polygon')), [
        '<polygon points="64,227.2 92.3,209.6 120.7,192 149,174.4 177.3,156.8 177.3,174.4 149,174.4 120.7,174.4 92.3,174.4 64,174.4" ' +
            `${cutAttr}/>`,
        '<polygon points="177.3,156.8 205.7,139.2 234,121.6 262.3,104 290.7,86.4 319,68.8 347.3,51.2 375.7,33.6 404,16 404,174.4 ' +
            `375.7,174.4 347.3,174.4 319,174.4 290.7,174.4 262.3,174.4 234,174.4 205.7,174.4 177.3,174.4" ${fillAttr}/>`
    ]);

    // The ground line (level at 102 meters), and the grade line - highlighted, as it's steeper than the maximum grade
    assert.deepEqual(profileElements.slice(-12, -10), [
        '<polyline points="64,174.4 92.3,174.4 120.7,174.4 149,174.4 177.3,174.4 205.7,174.4 234,174.4 262.3,174.4 290.7,174.4 ' +
            `319,174.4 347.3,174.4 375.7,174.4 404,174.4" fill="none" stroke="#6b4a2b" stroke-width="1.5" ${lineAttr}/>`,
        `<polyline points="64,227.2 404,16" fill="none" stroke="#e01e1e" stroke-width="3" ${lineAttr}/>`
    ]);

    // The legend
    assert.deepEqual(profileElements.slice(-10).filter((element) => element.startsWith('<rect')), [
        '<rect x="154" y="18" width="10" height="10" fill="rgb(196,120,64)"/>',
        '<rect x="204" y="18" width="10" height="10" fill="rgb(218,184,96)"/>',
        '<rect x="254" y="18" width="10" height="10" fill="#6b4a2b"/>',
        '<rect x="304" y="18" width="10" height="10" fill="#1f2d3d"/>',
        '<rect x="354" y="18" width="10" height="10" fill="#e01e1e"/>'
    ]);
    assert.deepEqual(gridTexts.slice(-5), ['Cut', 'Fill', 'Ground', 'Grade', 'Over 12%']);
    assert.equal(
        profileElements[profileElements.length - 1],
        `<text x="367" y="24" font-size="10" ${textAttr.replace('middle', 'start')} fill="#444" ${textStroke}>Over 12%</text>`
    );
});


test('profileView, a level road', () => {
    // The road is level, on level ground along it (102 meters) - the elevation grid is the meter below it
    const {profileElements} = drawings(simplePlan(), 0, 420);
    assert.deepEqual(texts(profileElements, 'text-anchor', 'end'), ['101', '102']);
    assert.deepEqual(withAttr(profileElements, 'stroke', '#dddddd').slice(0, 3).map((element) => element.match(/points="([^"]*)"/)[1]), [
        '64,280 404,280', '64,16 404,16', '64,16 64,280'
    ]);

    // 264 pixels per meter of elevation and 8.5 pixels per meter of station
    assert.deepEqual(texts(profileElements, 'font-size', '11'), ['Station', 'Elevation (m) — vertical exaggeration 31.1x']);

    // The ground and grade lines are at the top of the grid
    assert.deepEqual(profileElements.slice(-12, -10).map((element) => element.match(/points="([^"]*)"/)[1]), [
        '64,16 92.3,16 120.7,16 149,16 177.3,16 205.7,16 234,16 262.3,16 290.7,16 319,16 347.3,16 375.7,16 404,16',
        '64,16 404,16'
    ]);
});


test('profileView, a road with little relief', () => {
    // The road climbs 2.5 meters - the elevation grid's lines are a meter apart, not less, so their labels are whole meters
    const planValue = simplePlan();
    planValue.options[0].alignment[1].z = 104.5;
    const {profileElements} = drawings(planValue, 0, 420);
    assert.deepEqual(texts(profileElements, 'text-anchor', 'end'), ['101', '102', '103', '104', '105']);
    assert.deepEqual(texts(profileElements, 'font-size', '11'), ['Station', 'Elevation (m) — vertical exaggeration 7.8x']);
});


test('profileView, structures', () => {
    const {profile, profileElements} = drawings(complexPlan(), 0, 420);
    assert.ok(profile.includes('aria-label="Profile of the Main road plan option"'));
    assert.deepEqual(texts(profileElements, 'text-anchor', 'end'), ['105', '110', '115', '120', '125', '130', '135']);
    assert.deepEqual(texts(profileElements, 'font-size', '11'), ['Station', 'Elevation (ft) — vertical exaggeration 2.2x']);

    // The structures, in order - a wall, a culvert (on the ground), a turnout, a wall, the bridge's deck (at the grade), a turnout,
    // and the culvert beyond the end of the road - it's drawn at the end
    const labelAttr = `font-size="10" ${textAttr}`;
    const ixStructures = profileElements.indexOf('<rect x="64" y="272" width="19.7" height="8" fill="#555555"/>');
    assert.deepEqual(profileElements.slice(ixStructures, ixStructures + 13), [
        '<rect x="64" y="272" width="19.7" height="8" fill="#555555"/>',
        `<text x="73.9" y="264" ${labelAttr} fill="#555555" ${textStroke} font-weight="bold">Wall</text>`,
        '<circle cx="111.3" cy="183.2" r="5" fill="white" stroke="#2a6fdb" stroke-width="2.5"/>',
        '<rect x="142.9" y="272" width="31.5" height="8" fill="#2a8f8f"/>',
        `<text x="158.6" y="264" ${labelAttr} fill="#2a8f8f" ${textStroke} font-weight="bold">Turnout</text>`,
        '<rect x="182.3" y="272" width="31.5" height="8" fill="#555555"/>',
        `<text x="198.1" y="264" ${labelAttr} fill="#555555" ${textStroke} font-weight="bold">Wall</text>`,
        '<polygon points="245.4,189.5 261.1,183.6 261.1,189.6 245.4,195.5" fill="#786858" stroke="#786858" stroke-width="1"/>',
        `<text x="253.2" y="173.6" ${labelAttr} fill="#444" ${textStroke} font-weight="bold">Bridge</text>`,
        '<rect x="269" y="272" width="23.7" height="8" fill="#2a8f8f"/>',
        `<text x="280.8" y="264" ${labelAttr} fill="#2a8f8f" ${textStroke} font-weight="bold">Turnout</text>`,
        '<circle cx="404" cy="42.4" r="5" fill="white" stroke="#2a6fdb" stroke-width="2.5"/>',
        `<polyline points="64,200.8 142.9,200.8" fill="none" stroke="#1f2d3d" stroke-width="2" ${lineAttr}/>`
    ]);

    // The grade line's segments - those over the maximum grade (10%) are highlighted (the zero-length segment isn't drawn)
    const rGrade = /points="([^"]*)".* stroke="([^"]*)" stroke-width="(\d)"/;
    assert.deepEqual(
        profileElements.slice(ixStructures + 12, -10).map((element) => element.match(rGrade).slice(1)),
        [
            ['64,200.8 142.9,200.8', '#1f2d3d', '2'],
            ['142.9,200.8 221.7,200.8', '#1f2d3d', '2'],
            ['221.7,200.8 261.1,183.2', '#e01e1e', '3'],
            ['261.1,183.2 300.6,183.2', '#1f2d3d', '2'],
            ['300.6,183.2 340,183.2', '#1f2d3d', '2'],
            ['340,183.2 348.8,165.6', '#e01e1e', '3'],
            ['348.8,165.6 404,42.4', '#e01e1e', '3']
        ]
    );
    assert.deepEqual(texts(profileElements, 'font-size', '10').slice(-1), ['Over 10%']);

    // The cut and fill areas - there are none under the bridge
    assert.equal(withAttr(profileElements, 'fill', 'rgb(196,120,64)').filter((element) => element.startsWith('<polygon')).length, 3);
    assert.equal(withAttr(profileElements, 'fill', 'rgb(218,184,96)').filter((element) => element.startsWith('<polygon')).length, 1);

    // In a narrower profile, the second wall's label would overlap the turnout's, so it's omitted
    const narrow = drawings(complexPlan(), 0, 300).profileElements;
    assert.deepEqual(texts(narrow, 'font-weight', 'bold').slice(2), ['Wall', 'Turnout', 'Bridge', 'Turnout']);
    assert.deepEqual(withAttr(narrow, 'height', '8'), [
        '<rect x="64" y="272" width="12.8" height="8" fill="#555555"/>',
        '<rect x="115" y="272" width="20.4" height="8" fill="#2a8f8f"/>',
        '<rect x="140.5" y="272" width="20.4" height="8" fill="#555555"/>',
        '<rect x="196.7" y="272" width="15.3" height="8" fill="#2a8f8f"/>'
    ]);

    // The option without structures has only its legend's rectangles and no structure labels
    const other = drawings(complexPlan(), 1, 420);
    assert.ok(other.profile.includes('aria-label="Profile of the Alt road plan option"'));
    assert.equal(other.profileElements.filter((element) => element.startsWith('<rect')).length, 5);
    assert.deepEqual(texts(other.profileElements, 'font-weight', 'bold'), ['Station', 'Elevation (ft) — vertical exaggeration 0.3x']);
});


test('profileView, a bridge and an existing road', () => {
    const {profileElements} = drawings(fixturePlan(), 1, 976);
    assert.deepEqual(texts(profileElements, 'font-size', '11'), ['Station', 'Elevation (ft) — vertical exaggeration 2.7x']);

    // The bridge's deck and label, and the existing road - its section is shaded, with a bar and a label
    const labelAttr = `font-size="10" ${textAttr}`;
    const ixBridge = profileElements.findIndex((element) => element.includes('fill="#786858"'));
    assert.deepEqual(profileElements.slice(ixBridge, ixBridge + 5), [
        '<polygon points="373.2,176.4 547.1,131.8 547.1,137.8 373.2,182.4" fill="#786858" stroke="#786858" stroke-width="1"/>',
        `<text x="460.2" y="121.8" ${labelAttr} fill="#444" ${textStroke} font-weight="bold">Bridge</text>`,
        '<rect x="643.8" y="16" width="193.3" height="264" fill="rgba(112,110,104,0.12)"/>',
        '<rect x="643.8" y="272" width="193.3" height="8" fill="#706e68"/>',
        `<text x="740.4" y="264" ${labelAttr} fill="#706e68" ${textStroke} font-weight="bold">Existing road</text>`
    ]);

    // The cut and fill areas on either side of the bridge - there are none under it
    const areas = profileElements.filter((element) => element.startsWith('<polygon') && element.includes('stroke-width="0.5"'));
    assert.deepEqual(areas.map((element) => [element.match(/points="([^, ]*),/)[1], element.match(/ fill="([^"]*)"/)[1]]), [
        ['64', 'rgb(196,120,64)'],
        ['326.4', 'rgb(218,184,96)'],
        ['550.4', 'rgb(196,120,64)']
    ]);

    // The grade line's segments are within the maximum grade
    assert.deepEqual(profileElements.slice(ixBridge + 5, -10), [
        `<polyline points="64,208.2 321.8,189.7" fill="none" stroke="#1f2d3d" stroke-width="2" ${lineAttr}/>`,
        `<polyline points="321.8,189.7 515.1,137.4" fill="none" stroke="#1f2d3d" stroke-width="2" ${lineAttr}/>`,
        `<polyline points="515.1,137.4 960,50.8" fill="none" stroke="#1f2d3d" stroke-width="2" ${lineAttr}/>`
    ]);
});


test('profileView, an existing road\'s steep grades aren\'t highlighted', () => {
    // A road east up a 30% plane - its second half follows an existing road
    const elevations = [0, 1, 2, 3, 4].map(() => [100, 103, 106, 109, 112]);
    const planValue = {
        'title': 'Existing Road',
        'units': 'feet',
        'topography': {'spacing': 10, elevations},
        'start': {'x': 0, 'y': 20},
        'end': {'x': 40, 'y': 20},
        'options': [{
            'name': 'Join',
            'section': {'width': 10},
            'alignment': [{'x': 0, 'y': 20}, {'x': 20, 'y': 20}, {'x': 30, 'y': 20}, {'x': 40, 'y': 20, 'z': 150}],
            'structures': [{'type': 'existingRoad', 'station': 20, 'endStation': 40}]
        }]
    };
    const {profileElements} = drawings(planValue, 0, 420);

    // The new road's 30% grade is highlighted - the existing road's (as-built, on the ground) isn't
    const ixGrade = profileElements.findIndex((element) => element.includes('stroke="#e01e1e"'));
    assert.deepEqual(profileElements.slice(ixGrade, -10), [
        `<polyline points="64,242.3 234,129.1" fill="none" stroke="#e01e1e" stroke-width="3" ${lineAttr}/>`,
        `<polyline points="234,129.1 319,72.6" fill="none" stroke="#1f2d3d" stroke-width="2" ${lineAttr}/>`,
        `<polyline points="319,72.6 404,16" fill="none" stroke="#1f2d3d" stroke-width="2" ${lineAttr}/>`
    ]);
    assert.deepEqual(texts(profileElements, 'font-weight', 'bold').slice(2), ['Existing road']);
    assert.deepEqual(withAttr(profileElements, 'fill', 'rgba(112,110,104,0.12)'), [
        '<rect x="234" y="16" width="170" height="264" fill="rgba(112,110,104,0.12)"/>'
    ]);
});
