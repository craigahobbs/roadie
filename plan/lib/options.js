// options.js - the "describe" and "keep" commands - set a plan's and its options' descriptions, and keep its best
// options

import {analyzeOption, planTopo} from '../../viewer/lib/model.js';
import {orderPlan, planText, readPlan} from './planFile.js';
import {number} from '../../viewer/lib/format.js';


// The "describe" command's usage text lines
export const describeUsage = [
    'usage: plan describe <plan.json> <descriptions.md>',
    '',
    '  Set a road plan model\'s descriptions from a Markdown file - the text under its "# Plan" heading is the plan\'s',
    '  description, and the text under each "# Option: NAME" heading is that option\'s. A description that isn\'t in',
    '  the file is kept.'
];


// A description heading - the plan's, or an option's
const rHeading = /^# +(?:(?<plan>Plan)|Option: +(?<option>.*\S))\s*$/;


// The "describe" command - "io" is the tools' input and output functions. Returns the command's exit code and its
// output text lines, or null if its arguments are invalid.
export function describeCommand(args, io) {
    const [planPath, textPath] = args;
    if (args.length !== 2 || planPath.startsWith('-') || textPath.startsWith('-')) {
        return null;
    }

    // Read the road plan model and the descriptions
    const {plan, error} = readPlan(io, planPath);
    if (error !== undefined) {
        return {'code': 1, 'lines': error};
    }
    let text;
    try {
        text = io.readFile(textPath);
    } catch {
        return {'code': 1, 'lines': [`error: Could not load the descriptions "${textPath}"`]};
    }

    // The descriptions' sections - a heading and its text lines, without the blank lines around them
    const sections = [];
    for (const line of text.split(/\r?\n/)) {
        const heading = line.match(rHeading);
        if (heading !== null) {
            sections.push({'option': heading.groups.option ?? null, 'lines': []});
        } else if (sections.length > 0) {
            sections.at(-1).lines.push(line.trimEnd());
        } else if (line.trim() !== '') {
            return {'code': 1, 'lines': [`error: The descriptions "${textPath}" don't start with a "# Plan" or "# Option: NAME" heading`]};
        }
    }

    // Set the descriptions
    const lines = [];
    for (const section of sections) {
        const first = section.lines.findIndex((line) => line !== '');
        const description = first === -1 ? [] : section.lines.slice(first, section.lines.findLastIndex((line) => line !== '') + 1);
        const target = section.option === null ? plan : plan.options.find((option) => option.name === section.option);
        const name = section.option === null ? 'The plan\'s' : `Option "${section.option}"'s`;
        if (target === undefined) {
            const names = plan.options.map((option) => `"${option.name}"`).join(', ');
            return {'code': 1, 'lines': [`error: no option named "${section.option}" (the plan's options are ${names})`]};
        }
        if (description.length === 0) {
            return {'code': 1, 'lines': [`error: ${name} description has no text`]};
        }
        target.description = description;
        lines.push(`${name} description: ${description.length} line${description.length === 1 ? '' : 's'}`);
        if (description.some((line) => line.includes('~'))) {
            lines.push(`WARNING: ${name} description has a "~" - the viewer's Markdown renders "~...~" as strikethrough`);
        }
    }
    if (sections.length === 0) {
        return {'code': 1, 'lines': [`error: The descriptions "${textPath}" have no "# Plan" or "# Option: NAME" heading`]};
    }
    io.writeFile(planPath, planText(orderPlan(plan)));
    lines.push(`Wrote ${planPath}`);
    return {'code': 0, lines};
}


// The "keep" command's usage text lines
export const keepUsage = [
    'usage: plan keep <plan.json> NAME...',
    '',
    '  Keep a road plan model\'s named options, and remove its others - the options are put in cost score order, the',
    '  lowest (the best) first'
];


// The "keep" command - "io" is the tools' input and output functions. Returns the command's exit code and its
// output text lines, or null if its arguments are invalid.
export function keepCommand(args, io) {
    const [planPath, ...names] = args;
    if (names.length === 0 || args.some((arg) => arg.startsWith('-'))) {
        return null;
    }

    // Read the road plan model
    const {plan, error} = readPlan(io, planPath);
    if (error !== undefined) {
        return {'code': 1, 'lines': error};
    }
    const optionNames = plan.options.map((option) => option.name);
    const unknown = names.find((name) => !optionNames.includes(name));
    if (unknown !== undefined) {
        const planNames = optionNames.map((name) => `"${name}"`).join(', ');
        return {'code': 1, 'lines': [`error: no option named "${unknown}" (the plan's options are ${planNames || 'none'})`]};
    }

    // The kept options, in cost score order
    const topo = planTopo(plan);
    const kept = plan.options.map((option, ixOption) => ({option, 'analysis': analyzeOption(plan, ixOption, topo)})).
        filter(({option}) => names.includes(option.name)).
        sort((first, second) => first.analysis.score - second.analysis.score);
    const removed = optionNames.filter((name) => !names.includes(name));
    plan.options = kept.map(({option}) => option);
    io.writeFile(planPath, planText(orderPlan(plan)));
    return {
        'code': 0,
        'lines': [
            ...kept.map(({option, analysis}, ixOption) => (
                `Option ${ixOption}: "${option.name}" - cost score ${number(analysis.score, 1)}, ` +
                    `design warnings: ${analysis.warnings.length}`
            )),
            ...(removed.length > 0 ? [`Removed: ${removed.map((name) => `"${name}"`).join(', ')}`] : []),
            `Wrote ${planPath}`
        ]
    };
}
