import {planPlot, plotCommand} from '../lib/plot.js';
import {planTopo, validatePlan} from '../../viewer/lib/model.js';
import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import {cliMain} from '../lib/cli.js';
import {fixturePlan} from '../../viewer/test/fixture.js';
import {inflateSync} from 'node:zlib';
import test from 'node:test';
import {testIo} from './terrainHelpers.js';


// The elements' attributes
const lineAttr = 'stroke-linejoin="round" stroke-linecap="round"';
const textAttr = 'font-family="sans-serif" text-anchor="middle" dominant-baseline="middle"';
const textStroke = 'stroke="white" stroke-width="3" paint-order="stroke"';


// Plot a plan - returns the plot, and its SVG's elements
function plot(planValue, width = 880) {
    const {plan} = validatePlan(planValue);
    const result = planPlot(plan, planTopo(plan), width);
    return {...result, 'elements': result.svg.slice(result.svg.indexOf('>') + 1, -'</svg>'.length).replace(/></g, '>\n<').split('\n')};
}


// Count the occurrences of a part in a text
function countOf(text, part) {
    return text.split(part).length - 1;
}


// Get the elements' text
function texts(elements) {
    return elements.filter((element) => element.startsWith('<text')).map(
        (element) => element.slice(element.indexOf('>') + 1, element.lastIndexOf('<'))
    );
}


// Get a plot's shaded terrain image - its width, height, and pixels
function shadeImage(element) {
    const bytes = Buffer.from(element.match(/href="data:image\/png;base64,([^"]*)"/)[1], 'base64');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    const rows = inflateSync(bytes.subarray(41, 41 + view.getUint32(33)));
    const pixels = [];
    for (let row = 0; row < height; row++) {
        pixels.push([...rows.subarray(row * (width + 1) + 1, (row + 1) * (width + 1))]);
    }
    return {width, height, pixels};
}


test('planPlot', () => {
    // The fixture plan is 400 x 300 feet - the plot is 2 pixels per foot, within its margins
    const {svg, width, height, elements} = plot(fixturePlan());
    assert.deepEqual([width, height, elements.length], [880, 668, 76]);
    assert.ok(svg.startsWith(
        '<svg xmlns="http://www.w3.org/2000/svg" width="880" height="668" viewBox="0 0 880 668" role="img" aria-label="Fixture Plan">'
    ));
    assert.ok(svg.endsWith('</svg>'));

    // The shaded terrain - a pixel for each of the grid's 41 x 31 points
    assert.equal(elements[0], '<rect x="64" y="34" width="800" height="600" fill="#f4f1ea"/>');
    assert.ok(elements[1].startsWith(
        '<image x="64" y="34" width="800" height="600" preserveAspectRatio="none" opacity="0.55" href="data:image/png;base64,'
    ));
    const shade = shadeImage(elements[1]);
    assert.deepEqual([shade.width, shade.height], [41, 31]);

    // The contours - a path of the minor contours, a path of the index contours, and the index contours' labels
    assert.ok(elements[2].startsWith('<path d="M84 50.7L64 50.7M104 50.7L84 50.7M'));
    assert.ok(elements[2].endsWith('" fill="none" stroke="#8f6f45" stroke-width="0.6"/>'));
    assert.ok(elements[3].endsWith('" fill="none" stroke="#7a5a35" stroke-width="1.1"/>'));
    assert.deepEqual([countOf(elements[2], 'M'), countOf(elements[3], 'M')], [481, 120]);
    assert.deepEqual(texts(elements.slice(4, 12)), ['550', '525', '525', '525', '525', '525', '500', '525']);
    assert.equal(elements[4], `<text x="592.6" y="34" font-size="9" ${textAttr} fill="#5a4020" ${textStroke}>550</text>`);

    // The features - a stream, a rock outcrop, and an exclusion area
    assert.deepEqual(elements.slice(12, 17), [
        `<polyline points="464,634 464,34" fill="none" stroke="#2a6fdb" stroke-width="2" ${lineAttr}/>`,
        `<text x="464" y="28" font-size="11" ${textAttr} fill="#2a6fdb" ${textStroke}>Test Creek</text>`,
        `<polyline points="584,434 704,434 704,314 584,314 584,434" fill="none" stroke="#555555" stroke-width="1.2" ${lineAttr} ` +
            'stroke-dasharray="5 3"/>',
        `<polyline points="144,154 224,154 224,74 144,74 144,154" fill="none" stroke="#d0312d" stroke-width="1.2" ${lineAttr} ` +
            'stroke-dasharray="5 3"/>',
        `<text x="144" y="148" font-size="11" ${textAttr} fill="#d0312d" ${textStroke}>Barn</text>`
    ]);

    // The first option - its line, its culvert (a circle), turnout (a diamond), and wall (a square), and its stations
    const startAttr = textAttr.replace('middle', 'start');
    assert.deepEqual(elements.slice(17, 23), [
        `<polyline points="104,574 464,354 664,334 824,134" fill="none" stroke="white" stroke-width="4.5" ${lineAttr}/>`,
        `<polyline points="104,574 464,354 664,334 824,134" fill="none" stroke="#d6246e" stroke-width="2.5" ${lineAttr}/>`,
        '<circle cx="464.1" cy="354" r="4" fill="#d6246e" stroke="#111111"/>',
        '<polygon points="274.7,464.7 279.7,469.7 274.7,474.7 269.7,469.7" fill="#d6246e" stroke="#111111"/>',
        '<polygon points="557.6,340.2 565.6,340.2 565.6,348.2 557.6,348.2" fill="#d6246e" stroke="#111111"/>',
        `<text x="279.7" y="463.7" font-size="9" ${startAttr} fill="#d6246e" ${textStroke}>100</text>`
    ]);
    assert.deepEqual(texts(elements.slice(22, 26)), ['100', '200', '300', '400']);

    // The second option - its bridge (a triangle) and its existing road, dashed, from its station through the
    // alignment's points to its end station
    assert.deepEqual(elements.slice(26, 30), [
        `<polyline points="104,574 364,514 564,514 824,134" fill="none" stroke="white" stroke-width="4.5" ${lineAttr}/>`,
        `<polyline points="104,574 364,514 564,514 824,134" fill="none" stroke="#e07b00" stroke-width="2.5" ${lineAttr}/>`,
        '<polygon points="417.2,509 422.2,518 412.2,518" fill="#e07b00" stroke="#111111"/>',
        `<polyline points="639.2,404.1 752.1,239" fill="none" stroke="#111111" stroke-width="1.5" ${lineAttr} stroke-dasharray="4 3"/>`
    ]);

    // The start and end points
    assert.deepEqual(elements.slice(34, 38), [
        '<circle cx="104" cy="574" r="6" fill="#1a8f3c" stroke="white" stroke-width="2"/>',
        `<text x="113" y="565" font-size="13" ${startAttr} fill="#1a8f3c" ${textStroke} font-weight="bold">Road</text>`,
        '<circle cx="824" cy="134" r="6" fill="#c0392b" stroke="white" stroke-width="2"/>',
        `<text x="833" y="125" font-size="13" ${startAttr} fill="#c0392b" ${textStroke} font-weight="bold">End</text>`
    ]);

    // The frame, and the plan's coordinates along the bottom and the left - every 50 feet
    assert.equal(elements[38], '<rect x="64" y="34" width="800" height="600" fill="none" stroke="#333333"/>');
    assert.deepEqual(elements.slice(39, 41), [
        `<polyline points="64,634 64,639" fill="none" stroke="#333333" stroke-width="1" ${lineAttr}/>`,
        `<text x="64" y="649" font-size="11" ${textAttr} fill="#333333" ${textStroke}>0</text>`
    ]);
    assert.deepEqual(texts(elements.slice(39, 57)), ['0', '50', '100', '150', '200', '250', '300', '350', '400']);
    assert.deepEqual(elements.slice(69, 71), [
        `<polyline points="59,34 64,34" fill="none" stroke="#333333" stroke-width="1" ${lineAttr}/>`,
        `<text x="56" y="34" font-size="11" ${textAttr.replace('middle', 'end')} fill="#333333" ${textStroke}>300</text>`
    ]);
    assert.deepEqual(texts(elements.slice(57, 71)), ['0', '50', '100', '150', '200', '250', '300']);

    // The title, and the options' legend
    assert.deepEqual(elements.slice(71), [
        `<text x="64" y="16" font-size="14" ${startAttr} fill="#222222" ${textStroke} font-weight="bold">` +
            'Fixture Plan - contours every 5 feet, coordinates in feet</text>',
        `<polyline points="674,48 694,48" fill="none" stroke="#d6246e" stroke-width="2.5" ${lineAttr}/>`,
        `<text x="700" y="48" font-size="11" ${startAttr} fill="#d6246e" ${textStroke} font-weight="bold">0: Direct</text>`,
        `<polyline points="674,64 694,64" fill="none" stroke="#e07b00" stroke-width="2.5" ${lineAttr}/>`,
        `<text x="700" y="64" font-size="11" ${startAttr} fill="#e07b00" ${textStroke} font-weight="bold">1: Bridge - East</text>`
    ]);
});


test('planPlot, the shaded terrain', () => {
    // A plane that rises to the northwest faces away from the light - one that rises to the southeast faces it. The
    // plane's slope to the west and to the north is "slope" - the grid's points are 10 feet apart.
    const shades = [];
    for (const [rise, slope] of [[0, 0], [1, 0.5], [-1, 0.5], [1, 0.1], [-1, 0.1], [1, 5], [-1, 5]]) {
        const planValue = fixturePlan();
        planValue.topography.features = [];
        planValue.topography.elevations = planValue.topography.elevations.map(
            (row, ixRow) => row.map((elevation, ixCol) => 500 - rise * slope * 10 * (ixCol + ixRow))
        );
        const {pixels} = shadeImage(plot(planValue).elements[1]);
        assert.deepEqual([...new Set(pixels.flat())].length, 1);
        shades.push(pixels[0][0]);
    }

    // Level ground is lit at 45 degrees (the cosine of 45 degrees is 0.707, or 180 of 255). The slopes are shaded as if
    // twice as steep as they are - a slope's brightness is (0.707 -/+ 2 slope) / sqrt(1 + 8 slope^2). A slope that faces
    // the light is brighter - the brightest that's nearly square to it - and one that faces away from it is in shadow.
    assert.deepEqual(shades, [180, 0, 251, 124, 223, 0, 193]);
});


test('planPlot, a fine grid', () => {
    // The plot is 0.05 pixels per foot, so the grid's cells are half a pixel - they're drawn three together (the last, to
    // the grid's edge, are one together)
    const {width, height, elements} = plot(fixturePlan(), 100);
    assert.deepEqual([width, height], [100, 83]);
    const shade = shadeImage(elements[1]);
    assert.deepEqual([shade.width, shade.height], [15, 11]);
    assert.deepEqual([countOf(elements[2], 'M'), countOf(elements[3], 'M')], [157, 40]);
});


test('planPlot, a site without options', () => {
    // A site's plan has no options yet - its features are a stream without a name, a road, and a trail
    const planValue = fixturePlan();
    planValue.topography.features = [
        {'type': 'stream', 'points': [{'x': 0, 'y': 100}, {'x': 100, 'y': 150}, {'x': 200, 'y': 150}]},
        {
            'type': 'road',
            'name': 'Mill Rd',
            'points': [{'x': 0, 'y': 200}, {'x': 100, 'y': 250}, {'x': 200, 'y': 250}, {'x': 300, 'y': 300}]
        },
        {'type': 'trail', 'name': 'Mill Trail', 'points': [{'x': 0, 'y': 50}, {'x': 200, 'y': 50}]}
    ];
    delete planValue.start.label;
    planValue.end.label = 'House';
    const {plan} = validatePlan(planValue);
    plan.options = [];
    const {svg} = planPlot(plan, planTopo(plan), 880);
    const elements = svg.slice(svg.indexOf('>') + 1, -'</svg>'.length).replace(/></g, '>\n<').split('\n');
    assert.deepEqual(elements.slice(12, 17), [
        `<polyline points="64,434 264,334 464,334" fill="none" stroke="#2a6fdb" stroke-width="2" ${lineAttr}/>`,
        `<polyline points="64,234 264,134 464,134 664,34" fill="none" stroke="#6e675f" stroke-width="1.2" ${lineAttr}/>`,
        `<text x="464" y="128" font-size="9" ${textAttr} fill="#6e675f" ${textStroke}>Mill Rd</text>`,
        `<polyline points="64,534 464,534" fill="none" stroke="#6e675f" stroke-width="1.2" ${lineAttr} stroke-dasharray="2 3"/>`,
        `<text x="464" y="528" font-size="9" ${textAttr} fill="#6e675f" ${textStroke}>Mill Trail</text>`
    ]);
    assert.deepEqual(texts(elements.slice(17, 21)), ['Start', 'House']);
    assert.ok(elements.at(-1).endsWith('>Fixture Plan - contours every 5 feet, coordinates in feet</text>'));
    assert.equal(elements.length, 12 + 5 + 4 + 1 + 18 + 14 + 1);
});


test('planPlot, the options', () => {
    // Seven options - the seventh's color is the first's. An option's alignment may repeat a point, and its structures
    // may be beyond its end.
    const options = [];
    for (let ixOption = 0; ixOption < 7; ixOption++) {
        options.push({
            'name': `Option ${ixOption}`,
            'section': {'width': 12},
            'alignment': [{'x': 20, 'y': 30}, {'x': 20, 'y': 30}, {'x': 380, 'y': 30 + 30 * ixOption}, {'x': 380, 'y': 250}]
        });
    }
    options[0].structures = [
        {'type': 'culvert', 'station': 0}, {'type': 'culvert', 'station': 5000}, {'type': 'existingRoad', 'station': 0, 'endStation': 400}
    ];
    const {elements} = plot(fixturePlan(options));
    const strokes = elements.
        filter((element) => element.includes('stroke-width="2.5"') && element.includes('points="104,574 104,574 824,')).
        map((element) => element.match(/stroke="([^"]*)"/)[1]);
    assert.deepEqual(strokes, ['#d6246e', '#e07b00', '#7b3fc4', '#0a8f8f', '#7a8a00', '#1f3f9e', '#d6246e']);
    assert.deepEqual(elements.filter((element) => element.startsWith('<circle') && element.includes('r="4"')), [
        '<circle cx="104" cy="574" r="4" fill="#d6246e" stroke="#111111"/>',
        '<circle cx="824" cy="134" r="4" fill="#d6246e" stroke="#111111"/>'
    ]);
    assert.deepEqual(elements.filter((element) => element.includes('stroke-dasharray="4 3"')), [
        `<polyline points="104,574 824,574 824,494" fill="none" stroke="#111111" stroke-width="1.5" ${lineAttr} stroke-dasharray="4 3"/>`
    ]);
    assert.deepEqual(texts(elements.slice(-14)), [
        '0: Option 0', '1: Option 1', '2: Option 2', '3: Option 3', '4: Option 4', '5: Option 5', '6: Option 6'
    ]);
});


test('planPlot, a box of the plan', () => {
    // The box is 200 x 100 feet of the fixture plan - the plot is 4 pixels per foot
    const {plan} = validatePlan(fixturePlan());
    const {svg, width, height} = planPlot(plan, planTopo(plan), 880, [100, 50, 300, 150]);
    const elements = svg.slice(svg.indexOf('>') + 1, -'</svg>'.length).replace(/></g, '>\n<').split('\n');
    assert.deepEqual([width, height], [880, 468]);

    // The terrain is the box's grid points - 21 columns and 11 rows
    assert.ok(elements[1].startsWith('<image x="64" y="34" width="800" height="400" '));
    const shade = shadeImage(elements[1]);
    assert.deepEqual([shade.width, shade.height], [21, 11]);

    // The contour interval is the box's elevations' - the plan's is 5 feet
    assert.ok(elements.at(-5).endsWith('>Fixture Plan - contours every 1 feet, coordinates in feet</text>'));

    // The features and options are drawn beyond the box, where the plot's margins cover them - a feature without a
    // point in the box has no name, and the start and end points aren't in the box
    assert.ok(elements.includes(`<polyline points="464,634 464,-566" fill="none" stroke="#2a6fdb" stroke-width="2" ${lineAttr}/>`));
    assert.ok(elements.includes(
        `<polyline points="-256,514 464,74 864,34 1184,-366" fill="none" stroke="#d6246e" stroke-width="2.5" ${lineAttr}/>`
    ));
    assert.ok(!svg.includes('>Test Creek<') && !svg.includes('>Barn<') && !svg.includes('>Road<') && !svg.includes('>End<'));
    assert.equal(countOf(svg, 'r="6"'), 0);
    const ixCover = elements.indexOf('<path d="M0 0H880V468H0ZM64 34V434H864V34Z" fill="white"/>');
    assert.equal(elements[ixCover + 1], '<rect x="64" y="34" width="800" height="400" fill="none" stroke="#333333"/>');

    // The plan's coordinates
    assert.deepEqual(texts(elements.slice(ixCover + 2, -5)), [
        '100', '120', '140', '160', '180', '200', '220', '240', '260', '280', '300', '60', '80', '100', '120', '140'
    ]);
    assert.deepEqual(texts(elements.slice(-5)), [
        'Fixture Plan - contours every 1 feet, coordinates in feet', '0: Direct', '1: Bridge - East'
    ]);
});


test('planPlot, a box beyond the plan', () => {
    // The box is limited to the plan's grid - 100 x 200 feet - and its plot is no taller than its width
    const planValue = fixturePlan();
    planValue.topography.features = [
        {
            'type': 'stream',
            'name': 'Creek',
            'points': [{'x': 0, 'y': 200}, {'x': 320, 'y': 200}, {'x': 350, 'y': 220}, {'x': 390, 'y': 260}]
        },
        {'type': 'exclusion', 'name': 'Lot', 'points': [{'x': 280, 'y': 120}, {'x': 360, 'y': 120}, {'x': 360, 'y': 160}]}
    ];
    const {plan} = validatePlan(planValue);
    const {svg, width, height} = planPlot(plan, planTopo(plan), 880, [300, 100, 500, 400]);
    const elements = svg.slice(svg.indexOf('>') + 1, -'</svg>'.length).replace(/></g, '>\n<').split('\n');
    assert.deepEqual([width, height], [880, 880]);
    assert.equal(elements[0], '<rect x="64" y="34" width="406" height="812" fill="#f4f1ea"/>');
    const shade = shadeImage(elements[1]);
    assert.deepEqual([shade.width, shade.height], [11, 21]);

    // A line's name is at the middle of its points in the box, and an area's is at its first point in it - the end
    // point is in the box
    assert.deepEqual(elements.filter((element) => element.includes('>Creek<') || element.includes('>Lot<')), [
        `<text x="267" y="352.8" font-size="11" ${textAttr} fill="#2a6fdb" ${textStroke}>Creek</text>`,
        `<text x="307.6" y="758.8" font-size="11" ${textAttr} fill="#d0312d" ${textStroke}>Lot</text>`
    ]);
    assert.equal(countOf(svg, 'r="6"'), 1);
    assert.ok(svg.includes('>End<') && !svg.includes('>Road<'));
    assert.ok(elements.includes('<path d="M0 0H880V880H0ZM64 34V846H470V34Z" fill="white"/>'));
});


test('plot', async () => {
    const plan = fixturePlan();
    const io = testIo({'files': {'road.json': JSON.stringify(plan)}});
    const svgs = [];
    io.renderPng = (svg) => {
        svgs.push(svg);
        return Uint8Array.from([137, 80, 78, 71]);
    };
    assert.equal(await cliMain(['plot', 'road.json', 'work/plot.png'], io), 0);
    assert.equal(io.output.join(''), 'Wrote work/plot.png (1400 x 1058 pixels)\n');
    assert.deepEqual([io.written, [...io.files['work/plot.png']]], [['work/plot.png'], [137, 80, 78, 71]]);
    assert.equal(svgs.length, 1);
    assert.equal(svgs[0], planPlot(validatePlan(plan).plan, planTopo(plan)).svg);
    assert.ok(svgs[0].includes('>0: Direct</text>'));

    // A site's plan - it has no options yet
    io.files['site.json'] = JSON.stringify({...plan, 'options': []});
    assert.deepEqual(plotCommand(['site.json', 'site.png'], io), {'code': 0, 'lines': ['Wrote site.png (1400 x 1058 pixels)']});
    assert.ok(!svgs[1].includes('>0: '));
    assert.equal(countOf(svgs[1], '<circle'), 2);

    // A box of the plan
    assert.deepEqual(plotCommand(['--box', '100,50,300,150', 'road.json', 'box.png'], io), {
        'code': 0,
        'lines': ['Wrote box.png (1400 x 728 pixels)']
    });
    assert.equal(svgs[2], planPlot(validatePlan(plan).plan, planTopo(plan), 1400, [100, 50, 300, 150]).svg);
    assert.equal(svgs.length, 3);
});


test('plot, a box that is not a part of the plan', () => {
    const io = testIo({'files': {'road.json': JSON.stringify(fixturePlan())}});
    for (const box of ['300,50,100,150', '100,150,300,50', '100,50,100,150', '400,0,500,100', '0,300,100,400']) {
        assert.deepEqual(plotCommand(['road.json', 'box.png', '--box', box], io), {
            'code': 1,
            'lines': [`error: The box "${box}" is not a part of the plan's topography (400 x 300 feet)`]
        });
    }
    assert.deepEqual(io.written, []);
});


test('plot, a plan that cannot be loaded or is invalid', async () => {
    const io = testIo({
        'files': {'text.json': 'Not JSON', 'null.json': 'null', 'invalid.json': JSON.stringify({...fixturePlan(), 'units': 'yards'})}
    });
    io.renderPng = () => assert.fail();
    for (const [file, output] of [
        ['missing.json', 'error: Could not load the road plan "missing.json"\n'],
        ['text.json', 'error: Could not load the road plan "text.json"\n'],
        ['null.json', 'error: The road plan "null.json" is invalid:\n\nInvalid value null (type "object"), expected type "RoadPlan"\n'],
        ['invalid.json', 'error: The road plan "invalid.json" is invalid:\n\n' +
            'Invalid value "yards" (type "string") for member "units", expected type "Units"\n']
    ]) {
        io.output.length = 0;
        assert.deepEqual([await cliMain(['plot', file, 'plot.png'], io), io.output.join(''), io.written], [1, output, []]);
    }
});


test('plot, usage', async () => {
    const usage = `\
usage: plan plot <plan.json> <plot.png> [--box X1,Y1,X2,Y2]

  Plot a road plan model - its terrain (shaded, with contours), features, and options, with the plan's
  coordinates along its sides

options:
  --box X1,Y1,X2,Y2    plot a part of the plan - the box from (X1, Y1) to (X2, Y2), in the plan's coordinates -
                       for a closer look, with the contour interval of its elevations
`;
    const invalid = [
        [], ['road.json'], ['road.json', 'plot.png', 'extra'], ['--width', 'plot.png'], ['road.json', 'plot.png', '--box'],
        ['road.json', 'plot.png', '--box', '1,2,3'], ['road.json', 'plot.png', '--box', '1,2,3,x'],
        ['--box', '-1,2,3,4', 'road.json', 'plot.png']
    ];
    for (const args of invalid) {
        const io = testIo();
        assert.deepEqual([await cliMain(['plot', ...args], io), io.output.join('')], [1, usage]);
    }
});
