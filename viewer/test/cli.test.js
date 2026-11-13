import {planComplex, planSimple} from './planFixtures.js';
import assert from 'node:assert/strict';
import {cliMain} from '../lib/cli.js';
import {fileURLToPath} from 'node:url';
import {fixturePlan} from './fixture.js';
import {readFileSync} from 'node:fs';
import test from 'node:test';


// Read an expected output file
function expected(name) {
    return readFileSync(fileURLToPath(new URL(`expected/${name}`, import.meta.url)), 'utf-8');
}


// Run the command line with files, an object of file name to text - returns the exit code and the output
function run(argv, files = {}) {
    const output = [];
    const code = cliMain(argv, {
        'readFile': (path) => {
            if (!(path in files)) {
                throw new Error(`No such file "${path}"`);
            }
            return files[path];
        },
        'write': (text) => output.push(text)
    });
    return {code, 'output': output.join('')};
}


// The example plan's text
const examplePlan = readFileSync(fileURLToPath(new URL('../../example/example.json', import.meta.url)), 'utf-8');


test('cliMain evaluate, the example plan', () => {
    assert.deepEqual(
        run(['evaluate', 'example.json'], {'example.json': examplePlan}),
        {'code': 0, 'output': expected('example.evaluate.md')}
    );
});


test('cliMain evaluate, the example plan with detail', () => {
    const result = {'code': 0, 'output': expected('example.evaluate-detail.md')};
    assert.deepEqual(run(['evaluate', 'example.json', '--detail'], {'example.json': examplePlan}), result);
    assert.deepEqual(run(['evaluate', '--detail', 'example.json'], {'example.json': examplePlan}), result);
});


test('cliMain evaluate, warnings, walls, and a bridge', () => {
    const {code, output} = run(['evaluate', 'fixture.json', '--detail'], {'fixture.json': JSON.stringify(fixturePlan())});
    assert.equal(code, 0);
    const lines = output.split('\n');

    // The plan summary and the options comparison
    assert.deepEqual(lines.slice(0, 14), [
        '# Fixture Plan',
        '',
        'Topography: 41 x 31 grid, 10 ft spacing, 400 x 300 ft, elevations 493.2 to 556.0 ft',
        '',
        '- start (20.0, 30.0): ground elevation 503.6',
        '- end (380.0, 250.0): ground elevation 533.4',
        '- Design criteria: maximum grade 12%, minimum radius 50 ft, maximum wall height 20 ft',
        '',
        '## Options (lengths in ft, volumes in cy)',
        '',
        '| Option        | Length | Max Grade | Cut | Fill | Borrow | Waste | Warnings | Cost Score |',
        '|---------------|--------|-----------|-----|------|--------|-------|----------|------------|',
        '| Direct        | 440    | 20.9%     | 108 | 338  | 237    | 0     | 1        | 48.6       |',
        '| Bridge - East | 464    | 9.9%      | 448 | 67   | 0      | 350   | 1        | 390.2      |'
    ]);

    // The cost table - right-aligned quantities, scores, and shares, and a bold total
    const ixCost = lines.indexOf('## Option 0: Direct');
    assert.deepEqual(lines.slice(ixCost + 2, ixCost + 5), [
        '| Item                     | Quantity | Cost Score | Share |',
        '|--------------------------|---------:|-----------:|------:|',
        '| Clearing and grubbing    | 7,995 sf |        1.5 |  3.1% |'
    ]);
    assert.equal(lines[ixCost + 15], '| **Total**                |          |   **48.6** |       |');

    // The design warnings are a list
    const ixWarnings = lines.indexOf('### Design Warnings');
    assert.deepEqual(lines.slice(ixWarnings + 2, ixWarnings + 4), ['- Grade 20.9% exceeds the maximum grade (12%) from 2+11 to 3+11', '']);

    // The structures - a default culvert diameter, a turnout's side, and a wall's maximum height
    const ixStructures = lines.indexOf('### Structures');
    assert.deepEqual(lines.slice(ixStructures + 2, ixStructures + 7), [
        '| Type           | Name          | Station      | Side | Detail                |',
        '|----------------|---------------|--------------|------|-----------------------|',
        '| Culvert        | Creek culvert | 2+11         |      | Diameter 1.5 ft       |',
        '| Turnout        |               | 1+00 to 1+50 | left |                       |',
        '| Retaining wall |               | 2+60 to 3+00 | both | Maximum height 2.4 ft |'
    ]);

    // The second option's structures - a bridge's span and an existing road's length
    const ixBridge = lines.indexOf('| Bridge        |      | 1+60 to 2+50 |      | Span 90 ft     |');
    assert.notEqual(ixBridge, -1);
    assert.equal(lines[ixBridge + 1], '| Existing road |      | 3+00 to 4+00 |      | Upgrade 100 ft |');

    // The station tables - fills and cuts, walls, rock, a bridge, and an existing road (its grade is the ground)
    const ixStations = lines.indexOf('### Stations');
    assert.deepEqual(lines.slice(ixStations + 2, ixStations + 5), [
        '| Station | X     | Y     | Ground | Grade | Cut/Fill | Side Slope | Left     | Right     | Notes |',
        '|---------|-------|-------|--------|-------|----------|------------|----------|-----------|-------|',
        '| 0+00    | 20.0  | 30.0  | 503.6  | 503.6 | C 0.0    | 10%        | cut 0.7  | fill 1.1  |       |'
    ]);
    for (const line of [
        '| 2+00    | 190.5 | 134.2 | 510.0  | 516.3 | F 6.3    | 17%        | fill 6.3 | fill 15.0 |       |',
        '| 2+80    | 268.4 | 146.8 | 532.8  | 531.4 | C 1.4    | 9%         | wall 2.0 | wall 0.8  | rock  |',
        '| 4+40    | 380.0 | 250.0 | 533.4  | 533.4 | C 0.0    | 19%        | cut 1.4  | fill 2.4  |       |',
        '| 1+79    | 195.4 | 60.0  | 500.7  | 511.6 | F 10.9   | 12%        |          |           | bridge              |',
        '| 3+01    | 288.4 | 116.1 | 533.2  | 533.2 | C 0.0    | 3%         |          |           | existing road, rock |'
    ]) {
        assert.ok(lines.includes(line), line);
    }
});


// A plan with a georeference and elevation sources
test('cliMain evaluate, a georeferenced plan', () => {
    const plan = fixturePlan();
    plan.georeference = {'latitude': 44, 'longitude': -115, 'x': 200, 'y': 150};
    plan.topography.sources = [{'name': 'USGS 1 Meter A', 'date': '2022-02-10'}, {'name': 'Survey'}];
    const {code, output} = run(['evaluate', 'fixture.json'], {'fixture.json': JSON.stringify(plan)});
    assert.equal(code, 0);
    assert.deepEqual(output.split('\n').slice(4, 8), [
        '- start (20.0, 30.0): ground elevation 503.6 - latitude and longitude 43.99967, -115.00068',
        '- end (380.0, 250.0): ground elevation 533.4 - latitude and longitude 44.00027, -114.99932',
        '- Topography sources: USGS 1 Meter A (2022-02-10), Survey',
        '- Design criteria: maximum grade 12%, minimum radius 50 ft, maximum wall height 20 ft'
    ]);
});


// The complex plan has every warning and structure - samples outside the topography and slopes that don't daylight
test('cliMain evaluate, the complex plan with detail', () => {
    assert.deepEqual(
        run(['evaluate', 'complex.json', '--detail'], {'complex.json': JSON.stringify(planComplex())}),
        {'code': 0, 'output': expected('complex.evaluate-detail.md')}
    );
});


test('cliMain evaluate, a meters plan', () => {
    assert.deepEqual(
        run(['evaluate', 'simple.json'], {'simple.json': JSON.stringify(planSimple())}),
        {'code': 0, 'output': expected('simple.evaluate.md')}
    );
});


// A short road's station table has a row for each of its samples - its stations (1 m apart) are closer than its samples
test('cliMain evaluate, a short road with detail', () => {
    const {code, output} = run(['evaluate', 'simple.json', '--detail'], {'simple.json': JSON.stringify(planSimple())});
    assert.equal(code, 0);
    const lines = output.slice(output.indexOf('### Stations')).split('\n').filter((line) => line.startsWith('| 0+'));
    const rows = lines.map((line) => line.split('|').slice(1, 6).map((cell) => cell.trim()));
    assert.deepEqual(rows, [
        ['0+000', '0.0', '20.0', '102.0', '102.0'], ['0+003', '3.3', '20.0', '102.0', '102.0'],
        ['0+007', '6.7', '20.0', '102.0', '102.0'], ['0+010', '10.0', '20.0', '102.0', '102.0'],
        ['0+013', '13.3', '20.0', '102.0', '102.0'], ['0+017', '16.7', '20.0', '102.0', '102.0'],
        ['0+020', '20.0', '20.0', '102.0', '102.0'], ['0+023', '23.3', '20.0', '102.0', '102.0'],
        ['0+027', '26.7', '20.0', '102.0', '102.0'], ['0+030', '30.0', '20.0', '102.0', '102.0'],
        ['0+033', '33.3', '20.0', '102.0', '102.0'], ['0+037', '36.7', '20.0', '102.0', '102.0'],
        ['0+040', '40.0', '20.0', '102.0', '102.0']
    ]);
});


test('cliMain evaluate, endpoints outside the topography and no structures', () => {
    const plan = fixturePlan();
    plan.end = {'x': 1000, 'y': 1000};
    delete plan.options[0].structures;
    plan.options.pop();
    const {code, output} = run(['evaluate', 'fixture.json'], {'fixture.json': JSON.stringify(plan)});
    assert.equal(code, 0);
    assert.ok(output.includes('\n- end (1000.0, 1000.0): ground elevation outside the topography\n'));
    assert.ok(!output.includes('### Structures'));
    assert.ok(!output.includes('### Stations'));
});


test('cliMain evaluate, no design warnings', () => {
    const {output} = run(['evaluate', 'example.json'], {'example.json': examplePlan});
    assert.ok(output.includes('\n### Design Warnings\n\nNone\n\n'));
});


test('cliMain evaluate, could not load the plan', () => {
    const error = {'code': 1, 'output': '**Error:** Could not load the road plan "plan.json"\n'};
    assert.deepEqual(run(['evaluate', 'plan.json']), error);
    assert.deepEqual(run(['evaluate', 'plan.json'], {'plan.json': '{"title": '}), error);
});


test('cliMain evaluate, an invalid plan', () => {
    assert.deepEqual(run(['evaluate', 'plan.json'], {'plan.json': '{"title": ""}'}), {
        'code': 1,
        'output': '**Error:** The road plan "plan.json" is invalid:\n\n' +
            'Invalid value "" (type "string") for member "title", expected type "string" [len > 0]\n'
    });

    // Ragged elevation rows
    const plan = planSimple();
    plan.topography.elevations[2].pop();
    assert.deepEqual(run(['evaluate', 'plan.json', '--detail'], {'plan.json': JSON.stringify(plan)}), {
        'code': 1,
        'output': '**Error:** The road plan "plan.json" is invalid:\n\nElevation row 2 has 4 elevations, expected 5\n'
    });
});


test('cliMain doc', () => {
    assert.deepEqual(run(['doc']), {'code': 0, 'output': expected('doc.md')});
});


test('cliMain usage', () => {
    const usage = {
        'code': 1,
        'output': 'usage: roadie evaluate <plan.json> [--detail]\n' +
            '       roadie doc\n' +
            '\n' +
            "  evaluate    Print a road plan model's analysis and cost (--detail adds each option's station table)\n" +
            '  doc         Print the road plan model documentation\n'
    };
    assert.deepEqual(run([]), usage);
    assert.deepEqual(run(['unknown']), usage);
    assert.deepEqual(run(['doc', 'extra']), usage);
    assert.deepEqual(run(['evaluate']), usage);
    assert.deepEqual(run(['evaluate', '--detail']), usage);
    assert.deepEqual(run(['evaluate', 'a.json', 'b.json']), usage);
    assert.deepEqual(run(['evaluate', 'a.json', '--unknown']), usage);
});
