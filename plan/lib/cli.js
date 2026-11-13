// cli.js - the Roadie planning tools' command line (see bin/plan.js)

import {schemaDocMarkdown} from '../../viewer/lib/schemaDoc.js';
import {siteTypes} from './site.js';


// The command line's usage text lines
const usage = [
    'usage: plan doc',
    '',
    '  doc    Print the road site model documentation'
];


// The commands - each is a function of the command's arguments and the command line's input and output functions
// that returns the command's exit code and its output text lines
const commands = {
    'doc': (args) => (args.length === 0 ? {'code': 0, 'lines': schemaDocMarkdown(siteTypes, 'RoadSite')} : null)
};


// The command line's main entry point - "io" is the command line's input and output functions. Its "write" function
// writes the output text. Returns the process exit code.
export async function cliMain(argv, io) {
    const [command, ...args] = argv;
    const result = (Object.hasOwn(commands, command) ? await commands[command](args, io) : null) ?? {'code': 1, 'lines': usage};
    io.write(`${result.lines.join('\n')}\n`);
    return result.code;
}
