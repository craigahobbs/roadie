import {blockedPlan, expected, hillPlan, planePlan, roadPlan} from './roadFixtures.js';
import {routeCommands, routeUsage} from '../lib/routeCli.js';
import assert from 'node:assert/strict';
import {planText} from '../lib/planFile.js';
import test from 'node:test';
import {validatePlan} from '../../viewer/lib/model.js';


// Run a route or profile command on a plan ("plan.json") - returns the command's result (null for a usage error) and
// the written plan (null if it wasn't written)
function run(plan, argv) {
    const files = {'plan.json': typeof plan === 'string' ? plan : JSON.stringify(plan)};
    const written = [];
    const result = routeCommands[argv[0]](argv.slice(1), {
        'readFile': (path) => {
            if (!(path in files)) {
                throw new Error(`No such file "${path}"`);
            }
            return files[path];
        },
        'writeFile': (path, text) => written.push([path, text])
    });
    assert.ok(written.length <= 1);
    return {result, 'written': written.length === 1 ? written[0] : null, 'plan': written.length === 1 ? JSON.parse(written[0][1]) : null};
}


// Run one of the Python planning tools' commands on a plan - returns the command's result and the written plan
function runExpected(plan, name) {
    const [command, ...args] = expected.commands[name].argv;
    return run(plan, [command, 'plan.json', ...args]);
}


// Get a plan's options as the Python planning tools' results have them - every "step"th alignment point, and the last
function summarize(options, step) {
    return options.map((option) => ({
        ...option,
        'alignment': option.alignment.filter((point, ix) => ix % step === 0 || ix === option.alignment.length - 1),
        'alignmentCount': option.alignment.length
    }));
}


// A plan of a 30% plane with three hand-made options - one with an existing road
function profilePlan() {
    const plan = planePlan({'rise': 0.3});
    plan.start = {'x': 50, 'y': 0};
    plan.end = {'x': 50, 'y': 100};
    plan.options = [
        {
            'name': 'Test',
            'description': ['Kept'],
            'section': {'width': 14},
            'alignment': [{'x': 50, 'y': 0}, {'x': 50, 'y': 100}],
            'structures': [{'type': 'existingRoad', 'station': 50.5, 'endStation': 100}]
        },
        {
            'name': 'Curve',
            'description': [],
            'section': {'width': 14},
            'alignment': [{'x': 10, 'y': 10}, {'x': 60, 'y': 20}, {'x': 80, 'y': 50}, {'x': 40, 'y': 70}, {'x': 60, 'y': 95}]
        },
        {'name': 'Down', 'section': {'width': 14}, 'alignment': [{'x': 50, 'y': 100}, {'x': 50, 'y': 0}]}
    ];
    return plan;
}


// A plan of a 20% plane, without options
function switchbackPlan() {
    const plan = planePlan({'rise': 0.2, 'size': 61});
    plan.start = {'x': 100, 'y': 100};
    plan.end = {'x': 300, 'y': 500};
    delete plan.options;
    return plan;
}


test('routeUsage', () => {
    assert.deepEqual(routeUsage.slice(0, 2), [
        'usage: plan route <plan.json> -n NAME [-v X,Y]... [options]',
        '       plan profile <plan.json> -n NAME [options]'
    ]);
    assert.ok(routeUsage.every((line) => line.length <= 120));
    assert.deepEqual(Object.keys(routeCommands), ['route', 'profile']);
});


test('route, a switchback road', () => {
    // A 20% plane needs a switchback road to climb at the design grade - the first search's profile can't reach the end,
    // so the route is searched again with stricter grades
    const {result, written, plan} = runExpected(switchbackPlan(), 'route-plane');
    const {code, lines, options} = expected.commands['route-plane'];
    assert.deepEqual(result, {code, lines});
    assert.equal(code, 0);
    assert.deepEqual(lines, [
        'The profile ends 17.6 feet below the end point - searching with stricter grades',
        'Option "Switchbacks": 783 feet long, 158 alignment points, max grade 11.0%, max cut 8.8, max fill 3.9',
        'Structures: 1 turnout',
        'Cost score: 73.0, design warnings: 0',
        'Wrote plan.json - run "plan evaluate plan.json" for the full analysis and cost'
    ]);

    // The option is added to the plan - its alignment is from the start point to the end point, on the ground at both
    assert.deepEqual(summarize(plan.options, 10), options);
    const [option] = plan.options;
    assert.deepEqual(Object.keys(plan), ['title', 'units', 'topography', 'start', 'end', 'options']);
    assert.deepEqual(Object.keys(option), ['name', 'section', 'alignment', 'structures']);
    assert.deepEqual(option.section, {'width': 14, 'cutSlope': 1, 'fillSlope': 1.5, 'surface': 'gravel'});
    assert.equal(option.alignment.length, 158);
    assert.deepEqual(option.alignment[0], {'x': 100, 'y': 100, 'z': 120});
    assert.deepEqual(option.alignment.at(-1), {'x': 300, 'y': 500, 'z': 200});
    assert.deepEqual(option.structures, [{'type': 'turnout', 'station': 366.6, 'endStation': 416.6, 'side': 'left'}]);

    // The road is longer than the climb at the design grade, and no steeper than it
    const grades = option.alignment.slice(1).map((point, ix) => {
        const prev = option.alignment[ix];
        return Math.abs(point.z - prev.z) / Math.hypot(point.x - prev.x, point.y - prev.y);
    });
    assert.ok(Math.max(...grades) <= 0.11 + 0.002);
    assert.ok(80 / 0.11 < 783);

    // The plan is written as the plan file's text, and it's a valid road plan model
    assert.equal(written[0], 'plan.json');
    assert.equal(written[1], planText(plan));
    assert.ok('plan' in validatePlan(plan));
});


test('route, via points, streams, rock, and an exclusion area', () => {
    const {result, plan} = runExpected(hillPlan(), 'route-hill');
    const {code, lines, options} = expected.commands['route-hill'];
    assert.deepEqual(result, {code, lines});
    assert.deepEqual(summarize(plan.options, 10), options);
    const [option] = plan.options;
    assert.deepEqual(option.description, ['A road', 'Second line']);
    assert.deepEqual(option.section, {'width': 4.3, 'cutSlope': 1, 'fillSlope': 1.5, 'surface': 'gravel'});
    assert.equal(lines[0], 'Option "Hill Road": 900 meters long, 241 alignment points, max grade 9.0%, max cut 2.9, max fill 4.2');
    assert.deepEqual(lines.slice(1, 3), ['Structures: 1 bridge, 7 culverts, 7 turnouts', 'Cost score: 545.8, design warnings: 0']);
    assert.deepEqual([...new Set(option.structures.map(({type}) => type))].sort(), ['bridge', 'culvert', 'turnout']);
    assert.ok('plan' in validatePlan(plan));
});


test('route, the design arguments', () => {
    const {result, plan} = runExpected(hillPlan(), 'route-hill-custom');
    const {code, lines, options} = expected.commands['route-hill-custom'];
    assert.deepEqual(result, {code, lines});
    assert.deepEqual(summarize(plan.options, 10), options);
    const [option] = plan.options;
    assert.deepEqual(option.section, {'width': 6, 'cutSlope': 0.75, 'fillSlope': 2, 'surface': 'asphalt'});
    assert.deepEqual(option.structures[0], {'type': 'existingRoad', 'station': 0, 'endStation': 30, 'name': 'Existing road'});
    assert.ok(option.structures.every(({type}) => type !== 'turnout'));
    // (The Python planning tools broke grade where this road leaves its existing road - their vertical curves weren't
    // held to the existing road's ground - so its maximum grade was 7.7%)
    assert.deepEqual(lines, [
        'Option "Wide": 304 meters long, 83 alignment points, max grade 7.0%, max cut 1.9, max fill 3.0',
        'Existing road: stations 0.0 to 30.0',
        'Structures: 1 existing road, 3 culverts',
        'Cost score: 176.2, design warnings: 0',
        'Wrote plan.json - run "plan evaluate plan.json" for the full analysis and cost'
    ]);
});


test('route, existing roads', () => {
    // An existing road, east and then north to the end point, costs less than a new road straight there - the route is
    // a new road east to the existing road, and then it follows it. The existing road is from the minimum radius after
    // the route joins it (the junction's curve is new road), to the end point.
    let {result, plan} = run(roadPlan(), ['route', 'plan.json', '-n', 'Road']);
    assert.deepEqual(result, {'code': 0, 'lines': [
        'Option "Road": 569 feet long, 115 alignment points, max grade 0.3%, max cut 0.1, max fill 0.0',
        'Existing road: stations 144.9 to 568.7 (Mill Rd)',
        'Structures: 1 existing road, 1 culvert',
        'Cost score: 23.5, design warnings: 0',
        'Wrote plan.json - run "plan evaluate plan.json" for the full analysis and cost'
    ]});
    let [option] = plan.options;
    assert.deepEqual(option.structures, [
        {'type': 'culvert', 'station': 54.9, 'name': 'Sag cross drain'},
        {'type': 'existingRoad', 'station': 144.9, 'endStation': 568.7, 'name': 'Existing road'}
    ]);
    assert.ok('plan' in validatePlan(plan));

    // The alignment is along the existing road (east at y = 47, then north at x = 329), on the ground - but for the 11
    // points of its corner, which the route's move across it cuts
    const onRoad = option.alignment.filter(({x, y}) => (y === 47 && x >= 141) || (x === 329 && y >= 47));
    assert.equal(onRoad.length, 33 + 52);
    assert.equal(option.alignment.filter(({x, y}) => y !== 47 && x !== 329).length, 11);
    assert.ok(onRoad.every(({x, y, z}) => x < 141 + 50 || Math.abs(z - (100 + 0.05 * y)) < 0.011));
    assert.deepEqual(
        [option.alignment[0], option.alignment.at(-1)],
        [{'x': 47, 'y': 47, 'z': 102.34}, {'x': 329, 'y': 352.5, 'z': 117.62}]
    );

    // Through a via point on the existing road, it's the same road
    assert.deepEqual(run(roadPlan(), ['route', 'plan.json', '-n', 'Road', '-v', '188,47']).plan, plan);

    // An all-new road is straight to the end point
    ({result, plan} = run(roadPlan(), ['route', 'plan.json', '-n', 'Road', '--all-new']));
    assert.deepEqual(result.lines.slice(0, 3), [
        'Option "Road": 418 feet long, 85 alignment points, max grade 4.3%, max cut 0.2, max fill 0.0',
        'Structures: 1 turnout',
        'Cost score: 21.1, design warnings: 0'
    ]);
    ([option] = plan.options);
    assert.deepEqual(option.structures, [{'type': 'turnout', 'station': 184, 'endStation': 234, 'side': 'left'}]);

    // The existing road arguments are the road's existing roads - the route doesn't follow the plan's
    ({result, plan} = run(roadPlan(), ['route', 'plan.json', '-n', 'Road', '--existing-road', '0,30']));
    assert.deepEqual(result.lines.slice(0, 3), [
        'Option "Road": 418 feet long, 85 alignment points, max grade 3.8%, max cut 0.1, max fill 0.0',
        'Existing road: stations 0.0 to 30.0',
        'Structures: 1 existing road, 1 turnout'
    ]);
    assert.equal(plan.options[0].alignment.length, 85);

    // A plan whose existing road has no name
    const unnamed = roadPlan();
    delete unnamed.topography.features[0].name;
    assert.equal(run(unnamed, ['route', 'plan.json', '-n', 'Road']).result.lines[1], 'Existing road: stations 144.9 to 568.7');
});


test('route, an option is replaced', () => {
    // A road straight up a 30% plane can't climb it within the grade limit - every search's profile ends below the end
    const {result, plan} = runExpected(profilePlan(), 'route-replace');
    const {code, lines, options} = expected.commands['route-replace'];
    assert.deepEqual(result, {code, lines});
    assert.deepEqual(plan.options, options);
    assert.deepEqual(lines, [
        'The profile ends 19.0 feet below the end point - searching with stricter grades',
        'The profile ends 19.0 feet below the end point - searching with stricter grades',
        'The profile ends 19.0 feet below the end point - searching with stricter grades',
        'The profile ends 19.0 feet below the end point - searching with stricter grades',
        'Option "Test": 100 feet long, 22 alignment points, max grade 11.0%, max cut 19.0, max fill 0.0',
        'Structures: none',
        'Cost score: 27.9, design warnings: 1',
        'WARNING: the profile end is -19.0 feet from the ground - the grade limit can\'t be met on this alignment ' +
            '(try other via points or a longer route)',
        'Wrote plan.json - run "plan evaluate plan.json" for the full analysis and cost'
    ]);

    // The option keeps its place and its description - its structures are the new road's
    assert.deepEqual(plan.options.map((option) => option.name), ['Test', 'Curve', 'Down']);
    assert.deepEqual(plan.options[0].description, ['Kept']);
    assert.deepEqual(plan.options[0].structures, []);
});


test('route, no route', () => {
    const {result, written} = runExpected(blockedPlan(), 'route-blocked');
    const {code, lines} = expected.commands['route-blocked'];
    assert.deepEqual(result, {code, lines});
    assert.deepEqual(result, {'code': 1, 'lines': ['error: no route found (blocked by exclusion areas or the topography boundary?)']});
    assert.equal(written, null);
});


test('profile, an option\'s existing roads', () => {
    // profile keeps the option's existing roads
    let {result, plan} = runExpected(profilePlan(), 'profile-keep');
    let {code, lines, options} = expected.commands['profile-keep'];
    assert.deepEqual(result, {code, lines});
    assert.deepEqual(plan.options, options);
    assert.deepEqual(lines, [
        'Option "Test": 100 feet long, 21 alignment points, max grade 220.1%, max cut 9.5, max fill 0.0',
        'Existing road: stations 50.5 to 100.0',
        'Structures: 1 existing road',
        'Cost score: 8.1, design warnings: 1',
        'Wrote plan.json - run "plan evaluate plan.json" for the full analysis and cost'
    ]);
    assert.deepEqual(plan.options[0].structures, [{'type': 'existingRoad', 'station': 50.5, 'endStation': 100, 'name': 'Existing road'}]);
    assert.deepEqual(plan.options[0].description, ['Kept']);
    assert.deepEqual(plan.options[0].alignment.at(-1), {'x': 50, 'y': 100, 'z': 130});
    assert.equal(plan.options[1].name, 'Curve');

    // The existing road arguments set them - they're clamped to the road's length
    ({result, plan} = runExpected(profilePlan(), 'profile-set'));
    ({code, lines, options} = expected.commands['profile-set']);
    assert.deepEqual(result, {code, lines});
    assert.deepEqual(plan.options, options);
    assert.deepEqual(plan.options[0].structures, [
        {'type': 'existingRoad', 'station': 20, 'endStation': 40, 'name': 'Existing road'},
        {'type': 'existingRoad', 'station': 90, 'endStation': 100, 'name': 'Existing road'}
    ]);
    assert.deepEqual(lines.slice(1, 4), [
        'Existing road: stations 20.0 to 40.0', 'Existing road: stations 90.0 to 100.0', 'Structures: 2 existing roads'
    ]);
});


test('profile, an edited alignment', () => {
    // The alignment is resampled at half the topography's spacing - the description argument replaces the option's
    let {result, plan} = runExpected(profilePlan(), 'profile-curve');
    let {code, lines, options} = expected.commands['profile-curve'];
    assert.deepEqual(result, {code, lines});
    assert.deepEqual(plan.options, options);
    assert.deepEqual(plan.options[1].description, ['New']);
    assert.equal(plan.options[1].alignment.length, 34);
    assert.deepEqual(lines.slice(1, 3), ['Structures: 1 turnout', 'Cost score: 17.3, design warnings: 5']);
    assert.equal(lines.length, 5);
    assert.ok(lines[3].startsWith('WARNING: the profile end is -9.4 feet from the ground - '));

    // An option's empty description isn't kept
    ({result, plan} = runExpected(profilePlan(), 'profile-curve-keep'));
    ({code, lines, options} = expected.commands['profile-curve-keep']);
    assert.deepEqual(result, {code, lines});
    assert.deepEqual(plan.options, options);
    assert.deepEqual(Object.keys(plan.options[1]), ['name', 'section', 'alignment', 'structures']);
});


test('profile, a road down a slope too steep for the grade limit', () => {
    // The profile ends above the ground
    const {result, plan} = runExpected(profilePlan(), 'profile-down');
    const {code, lines, options} = expected.commands['profile-down'];
    assert.deepEqual(result, {code, lines});
    assert.deepEqual(plan.options, options);
    assert.deepEqual(lines, [
        'Option "Down": 100 feet long, 21 alignment points, max grade 11.0%, max cut 0.0, max fill 19.0',
        'Structures: none',
        'Cost score: 37.1, design warnings: 3',
        'WARNING: the profile end is +19.0 feet from the ground - the grade limit can\'t be met on this alignment ' +
            '(try other via points or a longer route)',
        'Wrote plan.json - run "plan evaluate plan.json" for the full analysis and cost'
    ]);
});


test('profile, no option', () => {
    const {result, written} = runExpected(profilePlan(), 'profile-unknown');
    const {code, lines} = expected.commands['profile-unknown'];
    assert.deepEqual(result, {code, lines});
    assert.deepEqual(result, {'code': 1, 'lines': ['error: no option named "Unknown"']});
    assert.equal(written, null);

    // A plan without options
    assert.deepEqual(
        run(switchbackPlan(), ['profile', 'plan.json', '-n', 'Test']).result,
        {'code': 1, 'lines': ['error: no option named "Test"']}
    );
});


test('route and profile, the plan can\'t be loaded', () => {
    const error = {'code': 1, 'lines': ['error: could not load the road plan "missing.json"']};
    assert.deepEqual(run(profilePlan(), ['route', 'missing.json', '-n', 'Test']).result, error);
    assert.deepEqual(run(profilePlan(), ['profile', 'missing.json', '-n', 'Test']).result, error);
    assert.deepEqual(
        run('Not JSON', ['route', 'plan.json', '-n', 'Test']).result,
        {'code': 1, 'lines': ['error: could not load the road plan "plan.json"']}
    );
});


test('route and profile, invalid arguments', () => {
    for (const args of [
        [],
        ['plan.json'],
        ['-n', 'Test'],
        ['plan.json', 'other.json', '-n', 'Test'],
        ['plan.json', '-n', 'Test', '--unknown'],
        ['plan.json', '-n', 'Test', '-s', 'mud'],
        ['plan.json', '-n', 'Test', '-w', 'wide'],
        ['plan.json', '-n', 'Test', '-g', '1o'],
        ['plan.json', '-n', 'Test', '--bridge-fill', 'deep'],
        ['plan.json', '-n', 'Test', '--existing-road', '100'],
        ['plan.json', '-n', 'Test', '--existing-road', '100,end'],
        ['plan.json', '-n', 'Test', '--existing-road', '100,200,300']
    ]) {
        assert.equal(run(profilePlan(), ['route', ...args]).result, null, args.join(' '));
        assert.equal(run(profilePlan(), ['profile', ...args]).result, null, args.join(' '));
    }

    // The via points and weights are the route command's
    for (const args of [['-v', '50'], ['-v', '50,north'], ['--grade-weight', 'heavy'], ['--slope-weight', '']]) {
        assert.equal(run(profilePlan(), ['route', 'plan.json', '-n', 'Test', ...args]).result, null, args.join(' '));
    }
    for (const args of [['-v', '50,50'], ['--grade-weight', '2'], ['--slope-weight', '2'], ['--all-new']]) {
        assert.equal(run(profilePlan(), ['profile', 'plan.json', '-n', 'Test', ...args]).result, null, args.join(' '));
    }
});
