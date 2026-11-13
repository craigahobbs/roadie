import {siteTypes, validateSite} from '../lib/site.js';
import assert from 'node:assert/strict';
import test from 'node:test';


// A road site with only its required members
function siteMinimal() {
    return {
        'title': 'Hillside Driveway',
        'units': 'feet',
        'start': {'latitude': 44, 'longitude': -115},
        'end': {'latitude': 44.003, 'longitude': -114.996}
    };
}


// A road site with every member
function siteComplete() {
    return {
        'title': 'Hillside Driveway',
        'units': 'meters',
        'start': {'latitude': 44, 'longitude': -115, 'label': 'County Rd', 'description': 'At the gate on the county road'},
        'end': {'latitude': 44.003, 'longitude': -114.996, 'label': 'House site', 'description': 'The bench above the creek'},
        'notes': ['A single-lane gravel driveway.', 'Stay off the creek\'s east bank.'],
        'exclusions': [
            {
                'name': 'Neighbor',
                'points': [
                    {'latitude': 44.001, 'longitude': -114.995}, {'latitude': 44.002, 'longitude': -114.995},
                    {'latitude': 44.002, 'longitude': -114.994}
                ]
            },
            {
                'points': [
                    {'latitude': 44.001, 'longitude': -114.999}, {'latitude': 44.002, 'longitude': -114.999},
                    {'latitude': 44.002, 'longitude': -114.998}
                ]
            }
        ],
        'criteria': {'maxGrade': 10, 'minRadius': 15},
        'costRates': {'gravel': 22},
        'margin': 200,
        'spacing': 2
    };
}


test('validateSite', () => {
    assert.deepEqual(validateSite(siteMinimal()), {'site': siteMinimal()});
    assert.deepEqual(validateSite(siteComplete()), {'site': siteComplete()});

    // Numbers may be numeric strings
    const numericString = siteMinimal();
    numericString.start.latitude = '44.5';
    assert.equal(validateSite(numericString).site.start.latitude, 44.5);
});


test('validateSite, invalid sites', () => {
    assert.deepEqual(validateSite(null), {'error': 'Invalid value null (type "object"), expected type "RoadSite"'});

    const untitled = siteMinimal();
    delete untitled.title;
    assert.deepEqual(validateSite(untitled), {'error': 'Required member "title" missing'});

    const unknown = siteMinimal();
    unknown.start.elevation = 1000;
    assert.deepEqual(validateSite(unknown), {'error': 'Unknown member "start.elevation"'});

    const badUnits = siteMinimal();
    badUnits.units = 'yards';
    assert.deepEqual(
        validateSite(badUnits),
        {'error': 'Invalid value "yards" (type "string") for member "units", expected type "Units"'}
    );

    // Latitudes and longitudes are degrees - the error is the limit that isn't met
    const badLatitude = siteMinimal();
    badLatitude.start.latitude = 91;
    assert.deepEqual(
        validateSite(badLatitude),
        {'error': 'Invalid value 91 (type "number") for member "start.latitude", expected type "float" [<= 90]'}
    );
    const badLongitude = siteMinimal();
    badLongitude.end.longitude = -181;
    assert.deepEqual(
        validateSite(badLongitude),
        {'error': 'Invalid value -181 (type "number") for member "end.longitude", expected type "float" [>= -180]'}
    );

    // An area is a polygon
    const line = siteComplete();
    line.exclusions[0].points.pop();
    assert.equal(
        validateSite(line).error.replace(/Invalid value .* \(type/, 'Invalid value ... (type'),
        'Invalid value ... (type "object") for member "exclusions.0.points", expected type "array" [len > 2]'
    );

    // The design criteria and cost rates are the road plan model's
    const badCriteria = siteComplete();
    badCriteria.criteria.maxGrade = 0;
    assert.deepEqual(
        validateSite(badCriteria),
        {'error': 'Invalid value 0 (type "number") for member "criteria.maxGrade", expected type "float" [> 0]'}
    );
    const badRate = siteComplete();
    badRate.costRates.gold = 1;
    assert.deepEqual(validateSite(badRate), {'error': 'Unknown member "costRates.gold"'});

    // A road has length
    const noLength = siteMinimal();
    noLength.end = {...noLength.start, 'label': 'End'};
    assert.deepEqual(validateSite(noLength), {'error': 'The start and end points are the same point'});
});


test('siteTypes', () => {
    // The road site model, and the road plan model's types it shares
    assert.deepEqual(
        ['RoadSite', 'SitePoint', 'SiteArea', 'LatLong', 'Units', 'DesignCriteria', 'CostRates'].filter((name) => !(name in siteTypes)),
        []
    );
    assert.deepEqual(
        siteTypes.RoadSite.struct.members.map((member) => `${member.name}${member.optional ? '?' : ''}`),
        ['title', 'units', 'start', 'end', 'notes?', 'exclusions?', 'criteria?', 'costRates?', 'margin?', 'spacing?']
    );
});
