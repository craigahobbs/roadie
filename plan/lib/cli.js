// cli.js - the Roadie planning tools' command line (see bin/plan.js)

import {describeCommand, describeUsage, keepCommand, keepUsage} from './options.js';
import {featureCommand, featureUsage} from './featureCommand.js';
import {locateCommand, locateUsage} from './locate.js';
import {plotCommand, plotUsage} from './plot.js';
import {routeCommands, routeUsage} from './routeCli.js';
import {siteCommand, siteUsage} from './siteCommand.js';
import {cliMain as roadieMain} from '../../viewer/lib/cli.js';
import {roadieTypes} from '../../viewer/lib/model.js';
import {schemaDocMarkdown} from '../../viewer/lib/schemaDoc.js';
import {siteTypes} from './site.js';


// The command line's usage text lines
const usage = [
    'usage: plan site <site.json> <plan.json>',
    '       plan plot <plan.json> <plot.png> [--box X1,Y1,X2,Y2]',
    '       plan locate <plan.json> [--xy] <latitude,longitude | x,y>...',
    '       plan feature <plan.json> TYPE [-n NAME] X,Y X,Y...',
    '       plan route <plan.json> -n NAME [-v X,Y]... [options]',
    '       plan profile <plan.json> -n NAME [options]',
    '       plan evaluate <plan.json> [--detail]',
    '       plan keep <plan.json> NAME...',
    '       plan describe <plan.json> <descriptions.md>',
    '       plan doc [site | plan]',
    '',
    '  site      Create a road plan model\'s site from a road site model - its topography (USGS lidar terrain),',
    '            georeference, start and end points, features, and topographic map image',
    '  plot      Plot a road plan model - its terrain, features, and options',
    '  locate    Convert latitudes and longitudes to a road plan model\'s coordinates, and back',
    '  feature   Add a topographic feature to a road plan model, or remove its features of a name',
    '  route     Engineer a road option - its alignment (following existing roads where that costs less), profile,',
    '            and structures',
    '  profile   Re-design an existing option\'s profile and structures',
    '  evaluate  Print a road plan model\'s analysis and cost (--detail adds each option\'s station table)',
    '  keep      Keep a road plan model\'s named options, in cost score order, and remove its others',
    '  describe  Set a road plan model\'s and its options\' descriptions from a Markdown file',
    '  doc       Print the road site model documentation - or the road plan model documentation',
    '',
    'Each command\'s usage is its "-h" argument\'s output.'
];


// The "evaluate" command - a road plan model's analysis and cost (the Roadie command line's)
function evaluateCommand(args, io) {
    const files = args.filter((arg) => arg !== '--detail');
    if (files.length !== 1 || files[0].startsWith('-')) {
        return null;
    }
    const output = [];
    const code = roadieMain(['evaluate', ...args], {'readFile': io.readFile, 'write': (text) => output.push(text)});
    return {code, 'lines': output.join('').replace(/\n$/, '').split('\n')};
}


// The "doc" command - the road site model's documentation, or the road plan model's
function docCommand(args) {
    const [model = 'site'] = args;
    if (args.length > 1 || (model !== 'site' && model !== 'plan')) {
        return null;
    }
    return {'code': 0, 'lines': model === 'site' ? schemaDocMarkdown(siteTypes, 'RoadSite') : schemaDocMarkdown(roadieTypes, 'RoadPlan')};
}


// The commands - each is a function of the command's arguments and the command line's input and output functions
// (see bin/plan.js) that returns the command's exit code and its output text lines, or null if the arguments are
// invalid - and each command's usage text lines
const commands = {
    'site': [siteCommand, siteUsage],
    'plot': [plotCommand, plotUsage],
    'locate': [locateCommand, locateUsage],
    'feature': [featureCommand, featureUsage],
    'route': [routeCommands.route, routeUsage],
    'profile': [routeCommands.profile, routeUsage],
    'evaluate': [evaluateCommand, usage],
    'keep': [keepCommand, keepUsage],
    'describe': [describeCommand, describeUsage],
    'doc': [docCommand, usage]
};


// The command line's main entry point - "io" is the command line's input and output functions. Its "write" function
// writes the output text. Returns the process exit code.
export async function cliMain(argv, io) {
    const [name, ...args] = argv;
    const [command, commandUsage] = Object.hasOwn(commands, name) ? commands[name] : [() => null, usage];
    const help = argv.includes('-h') || argv.includes('--help');
    const result = help ? {'code': 0, 'lines': commandUsage} : await command(args, io) ?? {'code': 1, 'lines': commandUsage};
    io.write(`${result.lines.join('\n')}\n`);
    return result.code;
}
