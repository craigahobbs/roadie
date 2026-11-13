// cli.js - the Roadie command line - a road plan model's analysis and cost, and the model's documentation, as Markdown
// text (see bin/roadie.js)

import {analyzeOption, planCriteria, elevation as planElevation, planTopo, roadieTypes, sampleAt, validatePlan} from './model.js';
import {costTable, structuresTable} from './tables.js';
import {displayQuantity, fixed, fixedTrim, station as formatStation, number, unitLabel} from './format.js';
import {latLongText, planLatLong} from './geo.js';
import {markdownTable} from './markdown.js';
import {niceStep} from './draw.js';
import {schemaDocMarkdown} from './schemaDoc.js';


// The command line's usage text lines
const usage = [
    'usage: roadie evaluate <plan.json> [--detail]',
    '       roadie doc',
    '',
    '  evaluate    Print a road plan model\'s analysis and cost (--detail adds each option\'s station table)',
    '  doc         Print the road plan model documentation'
];


// The command line's main entry point - "readFile" is a function that returns a file's text (or throws), and "write"
// is a function that writes the output text. Returns the process exit code.
export function cliMain(argv, {readFile, write}) {
    const [command, ...args] = argv;
    const files = args.filter((arg) => arg !== '--detail');
    let result;
    if (command === 'doc' && args.length === 0) {
        result = {'code': 0, 'lines': schemaDocMarkdown(roadieTypes, 'RoadPlan')};
    } else if (command === 'evaluate' && files.length === 1 && !files[0].startsWith('--')) {
        result = evaluate(files[0], args.includes('--detail'), readFile);
    } else {
        result = {'code': 1, 'lines': usage};
    }
    write(`${result.lines.join('\n')}\n`);
    return result.code;
}


// Evaluate a road plan model file - returns the exit code and the output text lines
function evaluate(file, detail, readFile) {
    // Load and validate the road plan model
    let planValue;
    try {
        planValue = JSON.parse(readFile(file));
    } catch {
        return {'code': 1, 'lines': [`**Error:** Could not load the road plan "${file}"`]};
    }
    const validated = validatePlan(planValue);
    if ('error' in validated) {
        return {'code': 1, 'lines': [`**Error:** The road plan "${file}" is invalid:`, '', validated.error]};
    }
    const {plan} = validated;
    const {units} = plan;
    const lengthUnit = unitLabel(units, 'length');
    const volumeUnit = unitLabel(units, 'volume');
    const topo = planTopo(plan);
    const criteria = planCriteria(plan);

    // Plan summary
    const lines = [
        `# ${plan.title}`,
        '',
        `Topography: ${topo.nCols} x ${topo.nRows} grid, ${fixedTrim(topo.spacing, 2)} ${lengthUnit} spacing, ` +
            `${number(topo.width, 0)} x ${number(topo.height, 0)} ${lengthUnit}, elevations ${number(topo.minZ, 1)} to ` +
            `${number(topo.maxZ, 1)} ${lengthUnit}`,
        ''
    ];
    for (const endpoint of ['start', 'end']) {
        const point = plan[endpoint];
        const ground = planElevation(topo, point.x, point.y);
        const latLong = planLatLong(plan, point.x, point.y);
        lines.push(`- ${endpoint} (${fixed(point.x, 1)}, ${fixed(point.y, 1)}): ground elevation ` +
            `${ground !== null ? fixed(ground, 1) : 'outside the topography'}` +
            `${latLong !== null ? ` - latitude and longitude ${latLongText(latLong)}` : ''}`);
    }
    const sources = plan.topography.sources ?? [];
    if (sources.length > 0) {
        const names = sources.map((source) => source.name + ('date' in source ? ` (${source.date})` : ''));
        lines.push(`- Topography sources: ${names.join(', ')}`);
    }
    lines.push(
        `- Design criteria: maximum grade ${fixedTrim(criteria.maxGrade, 1)}%, minimum radius ` +
            `${fixedTrim(criteria.minRadius, 1)} ${lengthUnit}, maximum wall height ${fixedTrim(criteria.maxWallHeight, 1)} ${lengthUnit}`,
        ''
    );

    // Options comparison
    const analyses = plan.options.map((option, ixOption) => analyzeOption(plan, ixOption, topo));
    const volume = (quantity) => number(displayQuantity(units, 'volume', quantity), 0);
    lines.push(`## Options (lengths in ${lengthUnit}, volumes in ${volumeUnit})`, '');
    lines.push(...leftTable(
        ['Option', 'Length', 'Max Grade', 'Cut', 'Fill', 'Borrow', 'Waste', 'Warnings', 'Cost Score'],
        analyses.map((analysis) => [
            analysis.name,
            number(analysis.length, 0),
            `${fixed(analysis.maxGrade, 1)}%`,
            volume(analysis.cut),
            volume(analysis.fill),
            volume(analysis.borrow),
            volume(analysis.waste),
            `${analysis.warnings.length}`,
            number(analysis.score, 1)
        ])
    ), '');

    // Option details
    for (const [ixOption, analysis] of analyses.entries()) {
        const option = plan.options[ixOption];
        lines.push(`## Option ${ixOption}: ${analysis.name}`, '');
        lines.push(...tableLines(costTable(units, analysis)), '');
        lines.push('### Design Warnings', '');
        lines.push(...(analysis.warnings.length === 0 ? ['None'] : analysis.warnings.map((warning) => `- ${warning}`)), '');
        if ((option.structures ?? []).length > 0) {
            lines.push('### Structures', '');
            lines.push(...tableLines(structuresTable(units, option, analysis)), '');
        }
        if (detail) {
            lines.push('### Stations', '');
            lines.push(...stationTable(units, analysis), '');
        }
    }
    return {'code': 0, lines};
}


// Create a table's Markdown text lines - strong cells are bold
function tableLines({fields, rows}) {
    return markdownTable(fields, rows.map((row) => row.map((cell) => (typeof cell === 'string' ? cell : `**${cell.strong}**`))));
}


// Create a left-aligned table's Markdown text lines
function leftTable(names, rows) {
    return markdownTable(names.map((name) => [name, 'left']), rows);
}


// Create the station detail table Markdown text lines
function stationTable(units, analysis) {
    const {samples, length} = analysis;
    const step = niceStep(length, 40);
    const rows = [];
    let prev = null;
    for (let stationValue = 0; stationValue <= length + step * 0.5; stationValue += step) {
        // On a short road, the stations are closer than the samples - each sample has one row
        const sample = sampleAt(samples, Math.min(stationValue, length));
        if (sample === prev) {
            continue;
        }
        prev = sample;
        const depth = sample.ground - sample.z;
        rows.push([
            formatStation(sample.station, units),
            fixed(sample.x, 1),
            fixed(sample.y, 1),
            fixed(sample.ground, 1),
            fixed(sample.z, 1),
            `${depth >= 0 ? 'C' : 'F'} ${fixed(Math.abs(depth), 1)}`,
            `${fixed(100 * Math.abs(sample.slope), 0)}%`,
            sideText(sample.left),
            sideText(sample.right),
            [
                ...(sample.bridge ? ['bridge'] : []),
                ...(sample.existing ? ['existing road'] : []),
                ...(sample.rock ? ['rock'] : []),
                ...(sample.outside ? ['outside'] : [])
            ].join(', ')
        ]);
    }
    return leftTable(['Station', 'X', 'Y', 'Ground', 'Grade', 'Cut/Fill', 'Side Slope', 'Left', 'Right', 'Notes'], rows);
}


// Format a cross section side for the station detail table
function sideText(side) {
    const {kind} = side;
    if (kind === 'wall') {
        return `wall ${fixed(side.wall, 1)}`;
    } else if (kind === 'none') {
        return '';
    }
    return `${kind} ${fixed(side.offset, 1)}${side.daylight ? '' : ' (no daylight)'}`;
}
