import {buildReport, planImageURL} from '../lib/report.js';
import {complexPlan, countOf, planData, simplePlan} from './viewFixtures.js';
import {PlanData} from '../lib/planData.js';
import {argsParse} from '../lib/args.js';
import assert from 'node:assert/strict';
import {fixturePlan} from './fixture.js';
import {opsToSvg} from '../lib/canvas.js';
import {smoothLimitsCanvas} from '../lib/view3d.js';
import test from 'node:test';
import {validatePlan} from '../lib/model.js';


// The cost score explanation paragraph
const scoreNote = '<p>The cost score is the estimated construction cost in thousands of nominal US dollars, computed from typical ' +
    'unit rates. Use it to compare plan options, not as a bid estimate.</p>';


// Build a plan's (or a plan data's) report
function report(planValue, globals = {'vFile': 'plans/fixture.json'}, width = 976, canvasViews = false) {
    const data = planValue instanceof PlanData ? planValue : planData(planValue, globals.vFile);
    return buildReport(data, globals, argsParse(globals), width, canvasViews);
}


// Get a report's outline - its HTML lines, with each drawing replaced by its element name and label and each table by "<table>"
function outline(html) {
    return html.split('\n').map((line) => {
        const drawing = line.match(/^<(svg|canvas) [^>]* aria-label="([^"]*)"/);
        if (drawing !== null) {
            return `<${drawing[1]}: ${drawing[2]}>`;
        }
        return line.startsWith('<table>') ? '<table>' : line;
    });
}


// Get a report's tables - each an array of rows of cell HTML (the header row first)
function tables(html) {
    return html.match(/<table>.*?<\/table>/g).map((table) => table.match(/<tr>.*?<\/tr>/g).map(
        (row) => Array.from(row.matchAll(/<t[hd] [^>]*>(.*?)<\/t[hd]>/g), (match) => match[1])
    ));
}


// Get a report's 3D view captions, without their "Explore this view" links
function captions(html) {
    return html.split('\n').filter((line) => line.startsWith('<p><strong>View ')).map(
        (line) => line.slice('<p>'.length, line.indexOf(' <a href='))
    );
}


test('buildReport, a meters plan without descriptions, warnings, structures, or a map image', () => {
    const {title, html, views, plan} = report(simplePlan(), {'vFile': 'simple.json'});
    assert.equal(title, 'Simple Plan');
    assert.deepEqual(views, []);

    // The plan view's scale (pixels per meter), height, and width, for the plan view's click handler
    assert.deepEqual(plan, {'scale': 23.9, 'height': 976, 'width': 976});

    // The page - the 3D links are the overview's view arguments
    const exploreURL = '#var.vAzimuth=0&amp;var.vExplore=true&amp;var.vFile=&#039;simple.json&#039;&amp;var.vTilt=55&amp;var.vX=20&amp;' +
        'var.vY=20&amp;var.vZ=102&amp;var.vZoom=1.32';
    assert.deepEqual(outline(html), [
        '<h1 id="simple-plan">Simple Plan</h1>',
        '<h2 id="plan-options">Plan Options</h2>',
        '<table>',
        '<h2 id="flat">Flat</h2>',
        '<p><strong>Cost score: 14</strong> - 40 m, 0.0% maximum grade, 0 design warnings</p>',
        '<h3 id="plan-view">Plan View</h3>',
        '<svg: Plan view of the Flat road plan option>',
        '<h3 id="profile">Profile</h3>',
        '<svg: Profile of the Flat road plan option>',
        '<h3 id="3d-views">3D Views</h3>',
        `<p><a href="${exploreURL}">Explore the plan in 3D</a> (full window, with keyboard controls)</p>`,
        '<p><strong>View 1 of 1: Overview</strong> - the whole site, looking north (0°) from 55° above the horizon. ' +
            `The road runs left to right from its start to its end. <a href="${exploreURL}">Explore this view</a></p>`,
        '<svg: 3D view of the Flat road plan option>',
        '<h3 id="cost">Cost</h3>',
        scoreNote,
        '<table>',
        '<h3 id="design-warnings">Design Warnings</h3>',
        '<p>No design warnings.</p>',
        '<hr>',
        '<p><a href="#var.vDoc=true&amp;var.vFile=&#039;simple.json&#039;">Road plan model documentation</a></p>'
    ]);

    // The drawings' sizes - the plan view is the report's width, the profile is 320 pixels high, and the overview fits the site
    const drawings = html.match(/<svg [^>]*>/g).map((svg) => svg.slice(0, svg.indexOf(' role=')));
    assert.deepEqual(drawings, [
        '<svg width="976" height="976" viewBox="0 0 976 976"',
        '<svg width="976" height="320" viewBox="0 0 976 320"',
        '<svg width="976" height="675" viewBox="0 0 976 675"'
    ]);

    // The options and cost tables, in meters - the only option is the selected option, in bold
    assert.deepEqual(tables(html), [
        [
            [
                'Option', 'Length (m)', 'Max Grade', 'Cut (m³)', 'Fill (m³)', 'Net (m³)', 'Walls (m²)', 'Warnings', 'Cost Score',
                'Relative'
            ],
            ['<strong>Flat</strong>', '40', '0.0%', '56', '59', '10 import', '0', '0', '<strong>14</strong>', '+0%']
        ],
        [
            ['Item', 'Quantity', 'Cost Score', 'Share'],
            ['Clearing and grubbing', '458 m²', '0.9', '6.7%'],
            ['Common excavation', '56 m³', '1.1', '8.1%'],
            ['Embankment', '59 m³', '0.4', '2.8%'],
            ['Borrow (import)', '10 m³', '0.3', '2.0%'],
            ['Surfacing (gravel)', '400 m²', '7.6', '55.6%'],
            ['Ditches and cross drains', '40 m', '1.8', '13.2%'],
            ['Erosion control', '458 m²', '0.3', '2.5%'],
            ['Mobilization', '', '1.2', '9.1%'],
            ['<strong>Total</strong>', '', '<strong>13.7</strong>', '']
        ]
    ]);

    // The cost score column is right-aligned
    assert.ok(html.includes(
        '<th style="text-align: left">Warnings</th><th style="text-align: right">Cost Score</th><th style="text-align: left">Relative</th>'
    ));
    assert.ok(html.includes('<td style="text-align: left">0</td><td style="text-align: right"><strong>14</strong></td>'));
});


test('buildReport, a feet plan with descriptions, warnings, structures, and a map image', () => {
    const globals = {'vFile': 'plans/complex (1).json'};
    const data = planData(complexPlan(), globals.vFile);
    data.imageURL = planImageURL(globals.vFile, data.plan.image);
    const {title, html} = report(data, globals);
    assert.equal(title, 'Complex Plan');

    // The page's headings and paragraphs
    const fileArg = 'var.vFile=&#039;plans%2Fcomplex%20%281%29.json&#039;';
    const exploreURL = `#var.vAzimuth=358.7&amp;var.vExplore=true&amp;${fileArg}&amp;var.vTilt=55&amp;var.vX=40&amp;var.vY=40.8&amp;` +
        'var.vZ=131.6&amp;var.vZoom=1.093';
    assert.deepEqual(outline(html).filter((line) => !line.startsWith('<ul>')), [
        '<h1 id="complex-plan">Complex Plan</h1>',
        '<p>A complex plan.</p>',
        '<h2 id="plan-options">Plan Options</h2>',
        '<table>',
        '<h2 id="main">Main</h2>',
        '<p>The main option.</p>',
        '<p><strong>Cost score: 48</strong> - 86 ft, 100.0% maximum grade, 18 design warnings</p>',
        '<h3 id="plan-view">Plan View</h3>',
        '<svg: Plan view of the Main road plan option>',
        '<h3 id="profile">Profile</h3>',
        '<svg: Profile of the Main road plan option>',
        '<h3 id="3d-views">3D Views</h3>',
        `<p><a href="${exploreURL}">Explore the plan in 3D</a> (full window, with keyboard controls)</p>`,
        '<p><strong>View 1 of 1: Overview</strong> - the whole site, looking north (359°) from 55° above the horizon. ' +
            `The road runs left to right from its start to its end. <a href="${exploreURL}">Explore this view</a></p>`,
        '<svg: 3D view of the Main road plan option>',
        '<h3 id="cost">Cost</h3>',
        scoreNote,
        '<table>',
        '<h3 id="design-warnings">Design Warnings</h3>',
        '<h3 id="structures">Structures</h3>',
        '<table>',
        '<h3 id="source-map">Source Map</h3>',
        '<p><img src="plans/map.png" alt="The source topographic map" style="max-width: 100%; height: auto;"></p>',
        '<hr>',
        `<p><a href="#var.vDoc=true&amp;${fileArg}">Road plan model documentation</a></p>`
    ]);

    // The options, cost, and structures tables, in feet and cubic yards - the other option is a link, and the options'
    // cost scores are relative to the lowest
    const [optionsTable, costTable, structuresTable] = tables(html);
    assert.deepEqual(optionsTable, [
        ['Option', 'Length (ft)', 'Max Grade', 'Cut (cy)', 'Fill (cy)', 'Net (cy)', 'Walls (sf)', 'Warnings', 'Cost Score', 'Relative'],
        ['<strong>Main</strong>', '86', '100.0%', '353', '299', '11 export', '53', '18', '<strong>48</strong>', '+0%'],
        [
            `<a href="#${fileArg}&amp;var.vOption=1">Alt</a>`, '90', '264.0%', '19,237', '102', '16,634 export', '0', '8',
            '<strong>471</strong>', '+890%'
        ]
    ]);
    assert.deepEqual(costTable, [
        ['Item', 'Quantity', 'Cost Score', 'Share'],
        ['Clearing and grubbing', '3,351 sf', '0.6', '1.3%'],
        ['Common excavation', '339 cy', '5.2', '10.9%'],
        ['Rock excavation', '14 cy', '1.1', '2.2%'],
        ['Embankment', '299 cy', '1.5', '3.1%'],
        ['Waste (export)', '11 cy', '0.1', '0.2%'],
        ['Surfacing (asphalt)', '1,049 sf', '3.9', '8.2%'],
        ['Ditches and cross drains', '83 ft', '1.1', '2.4%'],
        ['Culverts (2)', '29 ft', '16.3', '34.3%'],
        ['Retaining walls', '53 sf', '3.2', '6.7%'],
        ['Bridges', '40 sf', '10.0', '21.1%'],
        ['Erosion control', '3,351 sf', '0.2', '0.5%'],
        ['Mobilization', '', '4.3', '9.1%'],
        ['<strong>Total</strong>', '', '<strong>47.6</strong>', '']
    ]);
    assert.deepEqual(structuresTable, [
        ['Type', 'Name', 'Station', 'Side', 'Detail'],
        ['Retaining wall', '', '0+00 to 0+05', 'both', 'Maximum height 6.0 ft'],
        ['Culvert', 'Creek A culvert', '0+12', '', 'Diameter 2 ft'],
        ['Turnout', '', '0+20 to 0+28', 'both', ''],
        ['Retaining wall', '', '0+30 to 0+38', 'right', 'Maximum height 2.0 ft'],
        ['Bridge', '', '0+46 to 0+50', '', 'Span 4 ft'],
        ['Turnout', '', '0+52 to 0+58', 'right', ''],
        ['Culvert', '', '2+00', '', 'Diameter 1.5 ft']
    ]);

    // The design warnings list
    const warnings = html.split('\n').find((line) => line.startsWith('<ul>'));
    assert.equal(countOf(warnings, '<li><p>'), 18);
    assert.ok(warnings.startsWith('<ul><li><p>Grade 20.0% exceeds the maximum grade (10%) from 0+40 to 0+50</p></li><li><p>Grade 100.0% '));
    assert.ok(warnings.endsWith('<li><p>The culvert at 2+00 is beyond the end of the road</p></li></ul>'));
});


test('buildReport, the selected option', () => {
    // The other options are links - the first option is the default, so its link has no option argument
    const globals = {'vFile': 'complex.json', 'vOption': 1};
    const {html} = report(complexPlan(), globals);
    const [optionsTable] = tables(html);
    assert.deepEqual(optionsTable.slice(1).map((row) => row[0]), [
        '<a href="#var.vFile=&#039;complex.json&#039;">Main</a>',
        '<strong>Alt</strong>'
    ]);

    // The selected option has no description or structures
    const lines = outline(html);
    assert.deepEqual(lines.slice(4, 7), [
        '<h2 id="alt">Alt</h2>',
        '<p><strong>Cost score: 471</strong> - 90 ft, 264.0% maximum grade, 8 design warnings</p>',
        '<h3 id="plan-view">Plan View</h3>'
    ]);
    assert.deepEqual(lines.filter((line) => line.startsWith('<svg: ')), [
        '<svg: Plan view of the Alt road plan option>',
        '<svg: Profile of the Alt road plan option>',
        '<svg: 3D view of the Alt road plan option>'
    ]);
    assert.ok(!html.includes('Structures'));
    assert.ok(!html.includes('Source Map'));

    // An option index beyond the options is the last option, and a negative index is the first
    assert.equal(report(complexPlan(), {'vFile': 'complex.json', 'vOption': 7}).html.replaceAll('vOption=7', 'vOption=1'), html);
    const first = report(complexPlan(), {'vFile': 'complex.json', 'vOption': -2}).html;
    assert.equal(first.replaceAll('&amp;var.vOption=-2', ''), report(complexPlan(), {'vFile': 'complex.json'}).html);
    assert.ok(first.includes('<h2 id="main">Main</h2>'));
});


test('buildReport, a narrow road has road segment views', () => {
    // The 1 foot wide road is under 6 pixels wide in the overview, so its two halves each have a 3D view
    const planValue = fixturePlan();
    planValue.options[0].section.width = 1;
    const data = planData(planValue);
    const {html, views} = report(data);
    assert.deepEqual(views, []);
    const lines = outline(html);
    assert.deepEqual(lines.slice(lines.indexOf('<h3 id="plan-view">Plan View</h3>'), lines.indexOf('<h3 id="profile">Profile</h3>')), [
        '<h3 id="plan-view">Plan View</h3>',
        '<p>The numbered markers show the road segments of 3D views 2 through 3, below - the dashed outlines show the areas they ' +
            'cover.</p>',
        '<svg: Plan view of the Direct road plan option>'
    ]);
    assert.deepEqual(captions(html), [
        '<strong>View 1 of 3: Overview</strong> - the whole site, looking north-northwest (329°) from 55° above the horizon. ' +
            'The road runs left to right from its start to its end.',
        '<strong>View 2 of 3</strong> - stations 0+00 to 2+20, looking north-northwest (330°) from 40° above the horizon. ' +
            'The road runs left to right from its start to its end.',
        '<strong>View 3 of 3</strong> - stations 2+20 to 4+40, looking north-northwest (328°) from 40° above the horizon. ' +
            'The road runs left to right from its start to its end.'
    ]);

    // Each view's link explores its view - the overview's is also the 3D explorer link
    const links = html.match(/<a href="[^"]*var\.vExplore=true[^"]*">[^<]*<\/a>/g);
    const exploreArgs = 'var.vExplore=true&amp;var.vFile=&#039;plans%2Ffixture.json&#039;';
    assert.deepEqual(links, [
        `<a href="#var.vAzimuth=328.6&amp;${exploreArgs}&amp;var.vTilt=55&amp;var.vX=202&amp;var.vY=146.7&amp;var.vZ=522.2">` +
            'Explore the plan in 3D</a>',
        `<a href="#var.vAzimuth=328.6&amp;${exploreArgs}&amp;var.vTilt=55&amp;var.vX=202&amp;var.vY=146.7&amp;var.vZ=522.2">` +
            'Explore this view</a>',
        `<a href="#var.vAzimuth=329.6&amp;${exploreArgs}&amp;var.vTilt=40&amp;var.vX=115.5&amp;var.vY=87.5&amp;var.vZ=509.9&amp;` +
            'var.vZoom=2.18">Explore this view</a>',
        `<a href="#var.vAzimuth=327.5&amp;${exploreArgs}&amp;var.vTilt=40&amp;var.vX=305&amp;var.vY=173.8&amp;var.vZ=532.6&amp;` +
            'var.vZoom=2.325">Explore this view</a>'
    ]);

    // The plan view outlines the segment views' areas and numbers them at the middle of their road segments (stations 1+10
    // and 3+30)
    const planSvg = html.split('\n').find((line) => line.includes('class="roadie-plan"'));
    assert.deepEqual(planSvg.match(/<title>[^<]*<\/title>/g), ['<title>3D view 2 area</title>', '<title>3D view 3 area</title>']);
    assert.deepEqual(planSvg.match(/<circle [^>]* r="9" [^>]*\/><text [^>]*>[^<]*<\/text>/g), [
        '<circle cx="281.9" cy="518.4" r="9" fill="#1f4e8c" stroke="white" stroke-width="1.5"/><text x="281.9" y="518.4" ' +
            'font-size="11" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="central" ' +
            'fill="white">2</text>',
        '<circle cx="754.2" cy="334.6" r="9" fill="#1f4e8c" stroke="white" stroke-width="1.5"/><text x="754.2" y="334.6" ' +
            'font-size="11" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="central" ' +
            'fill="white">3</text>'
    ]);

    // The 3D views - the overview fits the site, and the zoomed segment views are the maximum height
    const drawings = html.match(/<svg [^>]*>/g).map((svg) => svg.slice(0, svg.indexOf(' style=')));
    assert.deepEqual(drawings.slice(2), [
        '<svg width="976" height="666" viewBox="0 0 976 666" role="img" aria-label="3D view of the Direct road plan option"',
        '<svg width="976" height="732" viewBox="0 0 976 732" role="img" aria-label="3D view of the Direct road plan option"',
        '<svg width="976" height="732" viewBox="0 0 976 732" role="img" aria-label="3D view of the Direct road plan option"'
    ]);

    // The report is the same when it's built again (from the plan data's cached drawings)
    assert.equal(report(data).html, html);
});


test('buildReport, canvas 3D views', () => {
    const planValue = fixturePlan();
    planValue.options[0].section.width = 1;
    const data = planData(planValue);
    const svgReport = report(data);
    const {html, views} = report(data, {'vFile': 'plans/fixture.json'}, 976, true);

    // The 3D views are empty canvases with their view indexes - the rest of the report is the same
    const style = 'background: #f4f1ea; border: 1px solid #ccc; display: block; max-width: 100%; height: auto; break-inside: avoid; ' +
        'margin: 0.75em 0 1.5em 0;';
    const canvases = [666, 732, 732].map((height, ixView) => (
        `<canvas width="976" height="${height}" role="img" aria-label="3D view of the Direct road plan option" style="${style}" ` +
        `data-view="${ixView}"></canvas>`
    ));
    assert.deepEqual(html.split('\n').filter((line) => line.startsWith('<canvas')), canvases);
    let ixCanvas = 0;
    assert.equal(svgReport.html.replace(/<svg [^>]*aria-label="3D view [^\n]*<\/svg>/g, () => canvases[ixCanvas++]), html);

    // The views' projections are the report views' - the segment views are zoomed
    assert.deepEqual(views.map(({view}) => [view.width, view.height, view.zoom, view.smooth]), [
        [976, 666, 1, false], [976, 732, 2.18, false], [976, 732, 2.325, false]
    ]);

    // A view's drawing is smoothed as far as its point limit allows - a limit under four points per grid point (there are 1271)
    // draws the SVG view's faceted terrain
    const svgViews = svgReport.html.match(/<svg [^>]*aria-label="3D view [^\n]*<\/svg>/g);
    const faceted = views[0].render({...smoothLimitsCanvas, 'points': 2000});
    assert.deepEqual([faceted.width, faceted.height, faceted.smooth, faceted.step, faceted.pointLimited], [976, 666, 1, 1, true]);
    assert.equal(faceted.label, '3D view of the Direct road plan option');
    assert.equal(opsToSvg(faceted.elements), svgViews[0].slice(svgViews[0].indexOf('>') + 1, -'</svg>'.length));

    // Two cells per side of each of the overview's 1200 grid cells
    const smooth = views[0].render({...smoothLimitsCanvas, 'points': 6000});
    assert.deepEqual([smooth.smooth, smooth.step, smooth.pointLimited], [2, 1, true]);
    assert.equal(smooth.elements.filter((op) => op.t === 0).length, 4 * 1200);

    // The drawings are cached by their point limits
    assert.equal(views[0].render({...smoothLimitsCanvas, 'points': 2000}), faceted);
    assert.notEqual(views[0].render({...smoothLimitsCanvas, 'points': 2001}), faceted);
    assert.equal(views[2].render(smoothLimitsCanvas), views[2].render(smoothLimitsCanvas));
});


// A plan data whose report views all have hidden road points
class HiddenRoadData extends PlanData {
    reportViews(ixOption, width) {
        return super.reportViews(ixOption, width).map((reportView) => ({...reportView, 'hidden': 3}));
    }
}


test('buildReport, the 3D view captions', () => {
    // A road running west, down the slope, is viewed looking upslope - so it runs right to left
    const west = fixturePlan([{'name': 'West', 'section': {'width': 12}, 'alignment': [{'x': 380, 'y': 250}, {'x': 20, 'y': 30}]}]);
    assert.deepEqual(captions(report(west).html), [
        '<strong>View 1 of 1: Overview</strong> - the whole site, looking north-northwest (329°) from 55° above the horizon. ' +
            'The road runs right to left from its start to its end.'
    ]);

    // The compass direction of each sixteenth of a turn - an azimuth near 360 is north
    const directions = [
        [0, 'north (0°)'], [22.5, 'north-northeast (23°)'], [45, 'northeast (45°)'], [67.5, 'east-northeast (68°)'],
        [90, 'east (90°)'], [112.5, 'east-southeast (113°)'], [135, 'southeast (135°)'], [157.5, 'south-southeast (158°)'],
        [180, 'south (180°)'], [202.5, 'south-southwest (203°)'], [225, 'southwest (225°)'], [247.5, 'west-southwest (248°)'],
        [270, 'west (270°)'], [292.5, 'west-northwest (293°)'], [315, 'northwest (315°)'], [337.5, 'north-northwest (338°)'],
        [11.2, 'north (11°)'], [11.3, 'north-northeast (11°)'], [348.7, 'north-northwest (349°)'], [348.8, 'north (349°)']
    ];
    for (const [azimuth, direction] of directions) {
        // A road running across the view direction, on level ground, so the overview looks to the road's left
        const radians = (azimuth + 90) * Math.PI / 180;
        const planValue = simplePlan();
        planValue.topography.elevations = planValue.topography.elevations.map((row) => row.map(() => 102));
        planValue.options[0].alignment = [
            {'x': 20 - 15 * Math.sin(radians), 'y': 20 - 15 * Math.cos(radians)},
            {'x': 20 + 15 * Math.sin(radians), 'y': 20 + 15 * Math.cos(radians)}
        ];
        assert.deepEqual(captions(report(planValue).html), [
            `<strong>View 1 of 1: Overview</strong> - the whole site, looking ${direction} from 55° above the horizon. ` +
                'The road runs left to right from its start to its end.'
        ]);
    }

    // A view of a road with points hidden by the terrain says so
    const hiddenPlan = validatePlan(simplePlan()).plan;
    assert.deepEqual(captions(report(new HiddenRoadData(hiddenPlan, 'simple.json')).html), [
        '<strong>View 1 of 1: Overview</strong> - the whole site, looking north (0°) from 55° above the horizon. ' +
            'The road runs left to right from its start to its end - the terrain hides parts of the road.'
    ]);

    // With road segment views, the overview's hidden parts are shown in the views that follow
    hiddenPlan.options[0].section.width = 0.1;
    assert.deepEqual(captions(report(new HiddenRoadData(hiddenPlan, 'simple.json')).html), [
        '<strong>View 1 of 3: Overview</strong> - the whole site, looking north (0°) from 55° above the horizon. ' +
            'The road runs left to right from its start to its end - the terrain hides parts of the road, shown in the views that ' +
            'follow.',
        '<strong>View 2 of 3</strong> - stations 0+000 to 0+020, looking north (0°) from 40° above the horizon. ' +
            'The road runs left to right from its start to its end - the terrain hides parts of the road.',
        '<strong>View 3 of 3</strong> - stations 0+020 to 0+040, looking north (0°) from 40° above the horizon. ' +
            'The road runs left to right from its start to its end - the terrain hides parts of the road.'
    ]);
});


test('buildReport, the options table', () => {
    // An option that needs fill imports it, and an option with surplus cut exports it
    const planValue = fixturePlan();
    const [optionsTable] = tables(report(planValue).html);
    assert.deepEqual(optionsTable.slice(1), [
        ['<strong>Direct</strong>', '440', '20.9%', '108', '338', '237 import', '101', '1', '<strong>49</strong>', '+0%'],
        [
            '<a href="#var.vFile=&#039;plans%2Ffixture.json&#039;&amp;var.vOption=1">Bridge - East</a>', '464', '9.9%', '448', '67',
            '350 export', '0', '1', '<strong>390</strong>', '+703%'
        ]
    ]);

    // Without costs, there are no relative cost scores (and the cost table is only its total)
    planValue.costRates = {
        'clearing': 0, 'excavation': 0, 'rockExcavation': 0, 'embankment': 0, 'borrow': 0, 'waste': 0, 'overhaul': 0, 'gravel': 0,
        'asphalt': 0, 'drainage': 0, 'culvert': 0, 'culvertEnds': 0, 'retainingWall': 0, 'bridge': 0, 'existingRoad': 0,
        'erosionControl': 0
    };
    const {html} = report(planValue);
    const [freeTable, costTable] = tables(html);
    assert.deepEqual(freeTable.slice(1).map((row) => row.slice(-2)), [['<strong>0</strong>', ''], ['<strong>0</strong>', '']]);
    assert.deepEqual(costTable, [
        ['Item', 'Quantity', 'Cost Score', 'Share'],
        ['<strong>Total</strong>', '', '<strong>0.0</strong>', '']
    ]);
    assert.ok(html.includes('<p><strong>Cost score: 0</strong> - 440 ft, 20.9% maximum grade, 1 design warning</p>'));
});


test('buildReport, HTML in the plan title and option names is escaped', () => {
    const planValue = simplePlan();
    planValue.title = 'Cut & Fill';
    planValue.description = ['Use <b>care</b>.'];
    planValue.options[0].name = 'A <B> & "C"';
    planValue.options[0].description = ['It\'s *steep*.'];
    planValue.options.push({
        'name': "Other's",
        'section': {'width': 10},
        'alignment': [{'x': 0, 'y': 10, 'z': 101}, {'x': 40, 'y': 10, 'z': 101}],
        'structures': []
    });
    const {title, html} = report(planValue, {'vFile': 'a.json'}, 400);
    assert.equal(title, 'Cut & Fill');
    const lines = outline(html);
    assert.deepEqual([...lines.slice(0, 2), ...lines.slice(4, 6)], [
        '<h1 id="cut-fill">Cut &amp; Fill</h1>',
        '<p>Use &lt;b&gt;care&lt;/b&gt;.</p>',
        '<h2 id="a-b-c">A &lt;B&gt; &amp; &quot;C&quot;</h2>',
        '<p>It&#039;s <em>steep</em>.</p>'
    ]);
    assert.deepEqual(lines.filter((line) => line.startsWith('<svg: ')), [
        '<svg: Plan view of the A &lt;B&gt; &amp; &quot;C&quot; road plan option>',
        '<svg: Profile of the A &lt;B&gt; &amp; &quot;C&quot; road plan option>',
        '<svg: 3D view of the A &lt;B&gt; &amp; &quot;C&quot; road plan option>'
    ]);
    assert.deepEqual(tables(html)[0].slice(1).map((row) => row[0]), [
        '<strong>A &lt;B&gt; &amp; &quot;C&quot;</strong>',
        '<a href="#var.vFile=&#039;a.json&#039;&amp;var.vOption=1">Other&#039;s</a>'
    ]);

    // An option with an empty structures array has no structures section
    assert.ok(!report(planValue, {'vFile': 'a.json', 'vOption': 1}, 400).html.includes('Structures'));
});


test('planImageURL', () => {
    // The image is relative to the plan file
    assert.equal(planImageURL('plan.json', 'map.png'), 'map.png');
    assert.equal(planImageURL('plans/site/plan.json', 'map.png'), 'plans/site/map.png');
    assert.equal(planImageURL('https://example.com/plans/plan.json', 'images/map.png'), 'https://example.com/plans/images/map.png');

    // The URL is encoded - parentheses, too
    assert.equal(planImageURL('my plans/site (1)/plan.json', 'topo map (2).png'), 'my%20plans/site%20%281%29/topo%20map%20%282%29.png');
});
