// report.js - the road plan report page

import {costTable, structuresTable} from './tables.js';
import {displayQuantity, encodeUrl, escapeHtml, fixed, station as formatStation, headerId, number, unitLabel} from './format.js';
import {planView, profileView} from './planView.js';
import {svgOpen, svgStyle} from './draw.js';
import {argsLink} from './args.js';
import {markdownHtml} from './markdown.js';
import {sampleAt} from './model.js';
import {view3DParts} from './view3d.js';


// The cost score explanation
const scoreNote = 'The cost score is the estimated construction cost in thousands of nominal US dollars, ' +
    'computed from typical unit rates. Use it to compare plan options, not as a bid estimate.';


// The compass point names, clockwise from north
const compassPoints = [
    'north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast',
    'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest'
];


// Create a heading's HTML
function heading(level, text) {
    return `<h${level} id="${escapeHtml(headerId(text))}">${escapeHtml(text)}</h${level}>`;
}


// Create a text table's HTML (see tables.js) - strong cells are bold
function textTable({fields, rows}) {
    return table(fields, rows.map((row) => row.map((cell) => (
        typeof cell === 'string' ? escapeHtml(cell) : `<strong>${escapeHtml(cell.strong)}</strong>`
    ))));
}


// Create a table's HTML - "fields" is an array of [name, align] and rows are arrays of cell HTML
function table(fields, rows) {
    const header = fields.map(([name, align]) => `<th style="text-align: ${align}">${escapeHtml(name)}</th>`).join('');
    const body = rows.map((row) => `<tr>${row.map((cell, ix) => `<td style="text-align: ${fields[ix][1]}">${cell}</td>`).join('')}</tr>`);
    return `<table><thead><tr>${header}</tr></thead><tbody>${body.join('')}</tbody></table>`;
}


// Build the report page for a road plan option - returns the page title, its HTML, and its 3D views. With "canvasViews",
// the 3D views are empty canvas elements (with a "data-view" attribute of the view index) - draw each with its view's
// render function, which takes the canvas terrain limits (smoothLimitsCanvas, with a point limit) and returns the
// drawing (view3DParts). Otherwise, they're SVG drawings with the SVG terrain limits (smoothLimits).
export function buildReport(data, globals, args, width, canvasViews = false) {
    const {plan, topo} = data;
    const {units, options} = plan;
    const ixOption = Math.max(0, Math.min(options.length - 1, args.option));
    const option = options[ixOption];
    const analyses = data.analyses();
    const analysis = analyses[ixOption];
    const html = [];

    // Title and description
    html.push(heading(1, plan.title));
    if ('description' in plan) {
        html.push(markdownHtml(plan.description));
    }

    // Options comparison
    html.push(heading(2, 'Plan Options'));
    html.push(optionsTable(plan, analyses, ixOption, globals));

    // The selected option
    html.push(heading(2, option.name));
    if ('description' in option) {
        html.push(markdownHtml(option.description));
    }
    const {warnings} = analysis;
    html.push(`<p><strong>Cost score: ${number(analysis.score, 0)}</strong> - ${number(analysis.length, 0)} ` +
        `${unitLabel(units, 'length')}, ${fixed(analysis.maxGrade, 1)}% maximum grade, ${warnings.length} design ` +
        `warning${warnings.length === 1 ? '' : 's'}</p>`);

    // The 3D views - the whole site, then views along the road from its start to its end, as needed
    const views = data.reportViews(ixOption, width);
    const outlines = [];
    for (let ixView = 1; ixView < views.length; ixView++) {
        const reportView = views[ixView];
        const middle = sampleAt(analysis.samples, (reportView.station + reportView.endStation) * 0.5);
        outlines.push([`${ixView + 1}`, reportView.view, [middle.x, middle.y]]);
    }

    // Plan view
    html.push(heading(3, 'Plan View'));
    if (outlines.length > 0) {
        html.push(`<p>The numbered markers show the road segments of 3D views 2 through ${views.length}, below - the dashed ` +
            'outlines show the areas they cover.</p>');
    }
    const plan2D = data.drawing(`plan/${ixOption}/${width}`, () => planView(plan, topo, analyses, ixOption, width, outlines));
    html.push(plan2D.svg);

    // Profile
    html.push(heading(3, 'Profile'));
    html.push(data.drawing(`profile/${ixOption}/${width}`, () => profileView(plan, option, analysis, width, 320)));

    // 3D views
    const exploreArgs = {...views[0].args, 'explore': true};
    html.push(heading(3, '3D Views'));
    html.push(`<p>${argsLink(globals, 'Explore the plan in 3D', exploreArgs)} (full window, with keyboard controls)</p>`);
    const views3D = [];
    for (let ixView = 0; ixView < views.length; ixView++) {
        const reportView = views[ixView];
        html.push(`<p>${viewCaption(globals, units, reportView, ixView, views.length)}</p>`);
        const {view} = reportView;
        const label = `3D view of the ${option.name} road plan option`;
        if (canvasViews) {
            // A canvas 3D view, drawn later (render) - smoothed wherever the canvas terrain limits allow
            const smoothView = {...view, 'smooth': true};
            html.push(`<canvas width="${view.width}" height="${view.height}" role="img" aria-label="${escapeHtml(label)}" ` +
                `style="${svgStyle}" data-view="${ixView}"></canvas>`);
            views3D.push({
                view,
                'render': (limits) => data.drawing(
                    `3d/${ixOption}/${width}/${ixView}/${limits.points}`,
                    () => view3DParts(plan, topo, data.rows(ixOption), ixOption, analysis, smoothView, true, limits)
                )
            });
        } else {
            const {elements} = view3DParts(plan, topo, data.rows(ixOption), ixOption, analysis, view);
            html.push(`${svgOpen(view.width, view.height, label)}${elements.join('')}</svg>`);
        }
    }

    // Cost breakdown
    html.push(heading(3, 'Cost'));
    html.push(`<p>${escapeHtml(scoreNote)}</p>`);
    html.push(textTable(costTable(units, analysis)));

    // Design warnings
    html.push(heading(3, 'Design Warnings'));
    if (warnings.length === 0) {
        html.push('<p>No design warnings.</p>');
    } else {
        html.push(`<ul>${warnings.map((warning) => `<li><p>${escapeHtml(warning)}</p></li>`).join('')}</ul>`);
    }

    // Structures
    if ((option.structures ?? []).length > 0) {
        html.push(heading(3, 'Structures'));
        html.push(textTable(structuresTable(units, option, analysis)));
    }

    // Source topographic map image
    const imageURL = data.imageURL ?? null;
    if (imageURL !== null) {
        html.push(heading(3, 'Source Map'));
        html.push(`<p><img src="${escapeHtml(imageURL)}" alt="The source topographic map" style="max-width: 100%; height: auto;"></p>`);
    }

    // Footer
    html.push('<hr>');
    html.push(`<p>${argsLink(globals, 'Road plan model documentation', {'doc': true})}</p>`);

    return {
        'title': plan.title,
        'html': html.join('\n'),
        'views': views3D,
        'plan': {'scale': plan2D.scale, 'height': plan2D.height, width}
    };
}


// Get a plan's source map image URL - relative to the plan file
export function planImageURL(file, image) {
    const ixSlash = file.lastIndexOf('/');
    return encodeUrl(ixSlash === -1 ? image : file.slice(0, ixSlash + 1) + image);
}


// Create a report 3D view's caption HTML
function viewCaption(globals, units, reportView, ixView, viewCount) {
    const viewArgs = reportView.args;
    const {azimuth} = viewArgs;
    const direction = compassPoints[Math.round(azimuth / 22.5) % 16];
    let caption;
    if (ixView === 0) {
        caption = `<strong>View 1 of ${viewCount}: Overview</strong> - the whole site`;
    } else {
        caption = `<strong>View ${ixView + 1} of ${viewCount}</strong> - stations ${formatStation(reportView.station, units)} to ` +
            `${formatStation(reportView.endStation, units)}`;
    }
    caption = `${caption}, looking ${direction} (${Math.round(azimuth) % 360}°) from ${fixed(viewArgs.tilt, 0)}° above the horizon. ` +
        `The road runs ${reportView.leftToRight ? 'left to right' : 'right to left'} from its start to its end`;
    return `${caption}. ${argsLink(globals, 'Explore this view', {...viewArgs, 'explore': true})}`;
}


// Create the options comparison table HTML
function optionsTable(plan, analyses, ixOption, globals) {
    const {units} = plan;
    const lengthUnit = unitLabel(units, 'length');
    const volumeUnit = unitLabel(units, 'volume');
    const areaUnit = unitLabel(units, 'area');

    // Find the lowest score
    let minScore = null;
    for (const analysis of analyses) {
        minScore = minScore === null ? analysis.score : Math.min(minScore, analysis.score);
    }

    const rows = analyses.map((analysis, ixAnalysis) => {
        const name = escapeHtml(analysis.name);
        const {borrow, waste} = analysis;
        const net = borrow > 0 ? `${number(displayQuantity(units, 'volume', borrow), 0)} import` :
            `${number(displayQuantity(units, 'volume', waste), 0)} export`;
        return [
            ixAnalysis === ixOption ? `<strong>${name}</strong>` : argsLink(globals, analysis.name, {'option': ixAnalysis}),
            number(analysis.length, 0),
            `${fixed(analysis.maxGrade, 1)}%`,
            number(displayQuantity(units, 'volume', analysis.cut), 0),
            number(displayQuantity(units, 'volume', analysis.fill), 0),
            net,
            number(analysis.wallArea, 0),
            `${analysis.warnings.length}`,
            `<strong>${number(analysis.score, 0)}</strong>`,
            minScore > 0 ? `+${fixed(100 * (analysis.score / minScore - 1), 0)}%` : ''
        ];
    });
    return table([
        ['Option', 'left'], [`Length (${lengthUnit})`, 'left'], ['Max Grade', 'left'], [`Cut (${volumeUnit})`, 'left'],
        [`Fill (${volumeUnit})`, 'left'], [`Net (${volumeUnit})`, 'left'], [`Walls (${areaUnit})`, 'left'], ['Warnings', 'left'],
        ['Cost Score', 'right'], ['Relative', 'left']
    ], rows);
}
