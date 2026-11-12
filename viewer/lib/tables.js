// tables.js - an option's cost breakdown and structures tables, for the report and the command line
//
// A table is an object with "fields", an array of [name, align], and "rows", arrays of cells - a cell is its text, or
// an object with a "strong" text member.

import {displayQuantity, fixed, station as formatStation, number, round, unitLabel} from './format.js';
import {culvertDiameter} from './model.js';


// The structure type display names
const structureNames = {
    'retainingWall': 'Retaining wall',
    'bridge': 'Bridge',
    'culvert': 'Culvert',
    'turnout': 'Turnout',
    'existingRoad': 'Existing road'
};


// Create an option's cost breakdown table
export function costTable(units, analysis) {
    const {total} = analysis;
    const rows = [];
    for (const cost of analysis.costs) {
        if (cost.cost > 0) {
            const {type} = cost;
            rows.push([
                cost.name,
                type !== null ? `${number(displayQuantity(units, type, cost.quantity), 0)} ${unitLabel(units, type)}` : '',
                number(cost.cost / 1000, 1),
                `${fixed(100 * cost.cost / total, 1)}%`
            ]);
        }
    }
    rows.push([{'strong': 'Total'}, '', {'strong': number(total / 1000, 1)}, '']);
    return {'fields': [['Item', 'left'], ['Quantity', 'right'], ['Cost Score', 'right'], ['Share', 'right']], rows};
}


// Create an option's structures table
export function structuresTable(units, option, analysis) {
    const {samples} = analysis;
    const lengthUnit = unitLabel(units, 'length');
    const rows = [];
    for (const structure of option.structures) {
        const {type} = structure;
        const stationValue = structure.station;
        const endStation = structure.endStation ?? null;
        let detail = '';
        let side = '';
        if (type === 'retainingWall') {
            let maxHeight = 0;
            for (const sample of samples) {
                if (sample.station >= stationValue && sample.station <= endStation) {
                    maxHeight = Math.max(maxHeight, sample.left.wall, sample.right.wall);
                }
            }
            detail = `Maximum height ${fixed(maxHeight, 1)} ${lengthUnit}`;
            side = 'both';
        } else if (type === 'culvert') {
            detail = `Diameter ${round(culvertDiameter(units, structure), 2)} ${lengthUnit}`;
        } else if (type === 'bridge') {
            detail = `Span ${fixed(endStation - stationValue, 0)} ${lengthUnit}`;
        } else if (type === 'existingRoad') {
            detail = `Upgrade ${number(endStation - stationValue, 0)} ${lengthUnit}`;
        } else {
            side = 'right';
        }
        rows.push([
            structureNames[type],
            structure.name ?? '',
            formatStation(stationValue, units) + (endStation !== null ? ` to ${formatStation(endStation, units)}` : ''),
            structure.side ?? side,
            detail
        ]);
    }
    return {'fields': [['Type', 'left'], ['Name', 'left'], ['Station', 'left'], ['Side', 'left'], ['Detail', 'left']], rows};
}
