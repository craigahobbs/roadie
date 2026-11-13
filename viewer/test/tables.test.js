import {analyzeOption, planTopo, validatePlan} from '../lib/model.js';
import {costTable, structuresTable} from '../lib/tables.js';
import {planComplex, planExistingRoad, planSimple} from './planFixtures.js';
import assert from 'node:assert/strict';
import test from 'node:test';


// Validate a road plan model and analyze its first option - returns the plan's units, the option, and its analysis
function analyze(planValue) {
    const {plan} = validatePlan(planValue);
    const [option] = plan.options;
    return {'units': plan.units, option, 'analysis': analyzeOption(plan, 0, planTopo(plan))};
}


test('costTable', () => {
    const {units, analysis} = analyze(planComplex());
    assert.deepEqual(costTable(units, analysis), {
        'fields': [['Item', 'left'], ['Quantity', 'right'], ['Cost Score', 'right'], ['Share', 'right']],
        'rows': [
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
            [{'strong': 'Total'}, '', {'strong': '47.6'}, '']
        ]
    });
});


// A meters plan's quantities are in meters - the zero-cost items are omitted
test('costTable, meters', () => {
    const {units, analysis} = analyze(planSimple());
    assert.deepEqual(costTable(units, analysis).rows, [
        ['Clearing and grubbing', '458 m²', '0.9', '6.7%'],
        ['Common excavation', '56 m³', '1.1', '8.1%'],
        ['Embankment', '59 m³', '0.4', '2.8%'],
        ['Borrow (import)', '10 m³', '0.3', '2.0%'],
        ['Surfacing (gravel)', '400 m²', '7.6', '55.6%'],
        ['Ditches and cross drains', '40 m', '1.8', '13.2%'],
        ['Erosion control', '458 m²', '0.3', '2.5%'],
        ['Mobilization', '', '1.2', '9.1%'],
        [{'strong': 'Total'}, '', {'strong': '13.7'}, '']
    ]);
});


// The overhaul quantity is the earth hauled beyond the free haul distance, in cubic yard-miles or cubic meter-kilometers
test('costTable, overhaul', () => {
    // The new road starts 5 ft below the ground - its surplus cut is hauled along the new road
    const feetPlan = planExistingRoad();
    feetPlan.costRates = {'freeHaul': 0, 'overhaul': 1000};
    feetPlan.options[0].alignment[0].z = 95;
    const feet = analyze(feetPlan);
    assert.equal(feet.analysis.costs[6].quantity.toFixed(2), '7934.72');
    assert.equal(feet.analysis.costs[6].cost.toFixed(2), (7934.72 * 0.3048 ** 3).toFixed(2));
    assert.equal(feet.analysis.total.toFixed(2), '1885.30');
    assert.deepEqual(costTable(feet.units, feet.analysis).rows.find((row) => row[0] === 'Overhaul'),
        ['Overhaul', '0 cy-mi', '0.2', '11.9%']);

    // A road across flat ground, from a 2 m cut to a 2 m fill - the cut is hauled to the fill
    const metersPlan = planSimple();
    metersPlan.costRates = {'freeHaul': 0};
    metersPlan.topography.elevations = metersPlan.topography.elevations.map((row) => row.map(() => 100));
    metersPlan.options[0].alignment = [{'x': 0, 'y': 20, 'z': 98}, {'x': 40, 'y': 20, 'z': 102}];
    const meters = analyze(metersPlan);
    assert.deepEqual(costTable(meters.units, meters.analysis).rows, [
        ['Clearing and grubbing', '500 m²', '1.0', '5.0%'],
        ['Common excavation', '227 m³', '4.5', '22.9%'],
        ['Embankment', '241 m³', '1.6', '7.9%'],
        ['Borrow (import)', '43 m³', '1.1', '5.6%'],
        ['Overhaul', '5 m³-km', '0.0', '0.1%'],
        ['Surfacing (gravel)', '400 m²', '7.6', '38.4%'],
        ['Ditches and cross drains', '40 m', '1.8', '9.1%'],
        ['Erosion control', '500 m²', '0.4', '1.9%'],
        ['Mobilization', '', '1.8', '9.1%'],
        [{'strong': 'Total'}, '', {'strong': '19.8'}, '']
    ]);
});


test('structuresTable', () => {
    const {units, option, analysis} = analyze(planComplex());
    assert.deepEqual(structuresTable(units, option, analysis), {
        'fields': [['Type', 'left'], ['Name', 'left'], ['Station', 'left'], ['Side', 'left'], ['Detail', 'left']],
        'rows': [
            ['Retaining wall', '', '0+00 to 0+05', 'both', 'Maximum height 6.0 ft'],
            ['Culvert', 'Creek A culvert', '0+12', '', 'Diameter 2 ft'],
            ['Turnout', '', '0+20 to 0+28', 'both', ''],
            ['Retaining wall', '', '0+30 to 0+38', 'right', 'Maximum height 2.0 ft'],
            ['Bridge', '', '0+46 to 0+50', '', 'Span 4 ft'],
            ['Turnout', '', '0+52 to 0+58', 'right', ''],
            ['Culvert', '', '2+00', '', 'Diameter 1.5 ft']
        ]
    });
});


test('structuresTable, an existing road and a meters plan', () => {
    const existing = analyze(planExistingRoad());
    assert.deepEqual(structuresTable(existing.units, existing.option, existing.analysis).rows,
        [['Existing road', '', '0+20 to 0+40', '', 'Upgrade 20 ft']]);

    const plan = planSimple();
    plan.options[0].alignment = [{'x': 0, 'y': 20, 'z': 103}, {'x': 40, 'y': 20, 'z': 103}];
    plan.options[0].structures = [
        {'type': 'culvert', 'station': 12.6},
        {'type': 'culvert', 'station': 20, 'diameter': 0.9144, 'name': 'Big'},
        {'type': 'retainingWall', 'station': 30, 'endStation': 40, 'side': 'left', 'name': 'Wall'},
        {'type': 'turnout', 'station': 5, 'endStation': 15, 'side': 'left'}
    ];
    const {units, option, analysis} = analyze(plan);
    assert.deepEqual(structuresTable(units, option, analysis).rows, [
        ['Culvert', '', '0+013', '', 'Diameter 0.45 m'],
        ['Culvert', 'Big', '0+020', '', 'Diameter 0.91 m'],
        ['Retaining wall', 'Wall', '0+030 to 0+040', 'left', 'Maximum height 0.5 m'],
        ['Turnout', '', '0+005 to 0+015', 'left', '']
    ]);
});
