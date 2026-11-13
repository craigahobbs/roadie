// cli.js - the Roadie planning tools' command line (see bin/plan.js)

import {plotCommand, plotUsage} from './plot.js';
import {siteCommand, siteUsage} from './siteCommand.js';
import {schemaDocMarkdown} from '../../viewer/lib/schemaDoc.js';
import {siteTypes} from './site.js';


// The command line's usage text lines
const usage = [
    'usage: plan site <site.json> <plan.json>',
    '       plan plot <plan.json> <plot.png>',
    '       plan doc',
    '',
    '  site    Create a road plan model\'s site from a road site model - its topography (USGS lidar terrain),',
    '          georeference, start and end points, features, and topographic map image',
    '  plot    Plot a road plan model - its terrain, features, and options',
    '  doc     Print the road site model documentation'
];


// The commands - each is a function of the command's arguments and the command line's input and output functions
// (see bin/plan.js) that returns the command's exit code and its output text lines, or null if the arguments are
// invalid - and each command's usage text lines
const commands = {
    'site': [siteCommand, siteUsage],
    'plot': [plotCommand, plotUsage],
    'doc': [(args) => (args.length === 0 ? {'code': 0, 'lines': schemaDocMarkdown(siteTypes, 'RoadSite')} : null), usage]
};


// The command line's main entry point - "io" is the command line's input and output functions. Its "write" function
// writes the output text. Returns the process exit code.
export async function cliMain(argv, io) {
    const [name, ...args] = argv;
    const [command, commandUsage] = Object.hasOwn(commands, name) ? commands[name] : [() => null, usage];
    const result = await command(args, io) ?? {'code': 1, 'lines': commandUsage};
    io.write(`${result.lines.join('\n')}\n`);
    return result.code;
}
