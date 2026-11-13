import {latLongText, planLatLong, project, transverseMercator, unproject, utmFalseEasting, utmZone} from '../lib/geo.js';
import assert from 'node:assert/strict';
import {fixturePlan} from './fixture.js';
import test from 'node:test';


// Assert that an array's numbers are within a tolerance of the expected numbers
function assertClose(actual, expected, tolerance) {
    assert.equal(actual.length, expected.length);
    for (let ix = 0; ix < actual.length; ix++) {
        assert.ok(Math.abs(actual[ix] - expected[ix]) <= tolerance, `${actual[ix]} is not within ${tolerance} of ${expected[ix]}`);
    }
}


// The expected coordinates are the PROJ library's (proj4js, GRS 80) - they agree to a tenth of a millimeter
test('project, a transverse Mercator projection', () => {
    for (const [latitude0, longitude0, latitude, longitude, expected] of [
        [39.9965, -105.2755, 40.0065, -105.2655, [853.8576, 1110.3945]],
        [39.9965, -105.2755, 40.1965, -105.5755, [-25544.5934, 22250.46]],
        [44, -115, 44.01, -114.99, [801.9272, 1111.172]],
        [44, -115, 44.2, -115.3, [-23980.8858, 22266.6084]],
        [25.8, -80.2, 26, -80.5, [-30035.3995, 22191.7631]],
        [64.8, -147.7, 65, -148, [-14152.6178, 22331.8007]],
        [0, 3, 0.2, 2.7, [-33395.7988, 22115.1613]]
    ]) {
        const projection = transverseMercator(latitude0, longitude0);
        assertClose(project(projection, latitude, longitude), expected, 0.001);

        // The projection's center is its origin
        assertClose(project(projection, latitude0, longitude0), [0, 0], 1e-9);
    }
});


test('project, UTM zones', () => {
    for (const [zone, latitude, longitude, expected] of [
        [13, 39.9965, -105.2755, [476482.1862, 4427405.0945]],
        [11, 43.6, -116.2, [564568.7289, 4827758.1563]],
        [10, 47.6, -122.3, [552619.0969, 5272080.8106]],
        [15, 30, -90.5, [741157.7554, 3321417.0305]],
        [12, 44.5, -108, [738495.2972, 4931787.5415]]
    ]) {
        const [east, north] = project(utmZone(zone), latitude, longitude);
        assertClose([east + utmFalseEasting, north], expected, 0.001);
    }
    assert.equal(utmFalseEasting, 500000);

    // A zone's central meridian - zone 13's is 105 degrees west
    assertClose(project(utmZone(13), 0, -105), [0, 0], 1e-9);
});


test('unproject', () => {
    // The inverse of project
    for (const [latitude0, longitude0, scale] of [[39.9965, -105.2755, 1], [64.8, -147.7, 1], [0, -105, 0.9996]]) {
        const projection = transverseMercator(latitude0, longitude0, scale);
        for (const [latitude, longitude] of [[0, 0], [0.01, 0.01], [-0.05, 0.08], [0.2, -0.3], [1, 2.5], [-0.7, -3]]) {
            const [east, north] = project(projection, latitude0 + latitude, longitude0 + longitude);
            assertClose(unproject(projection, east, north), [latitude0 + latitude, longitude0 + longitude], 1e-8);
        }
    }

    // A point a kilometer north of the center is nine thousandths of a degree of latitude north of it
    assertClose(unproject(transverseMercator(44, -115), 0, 1000), [44.008999, -115], 1e-6);
});


test('planLatLong', () => {
    // A plan without a georeference has no latitudes and longitudes
    const plan = fixturePlan();
    assert.equal(planLatLong(plan, 20, 30), null);

    // The georeference is the latitude and longitude of a plan point - here, of the plan's center (to a millimeter)
    plan.georeference = {'latitude': 44, 'longitude': -115, 'x': 200, 'y': 150};
    assertClose(planLatLong(plan, 200, 150), [44, -115], 1e-8);

    // The plan is in feet - 1,000 feet north and east
    const [latitude, longitude] = planLatLong(plan, 1200, 1150);
    const [east, north] = project(transverseMercator(44, -115), latitude, longitude);
    assertClose([east, north], [304.8, 304.8], 0.001);

    // A plan in meters
    plan.units = 'meters';
    const meters = planLatLong(plan, 1200, 1150);
    assertClose(project(transverseMercator(44, -115), meters[0], meters[1]), [1000, 1000], 0.001);
});


test('latLongText', () => {
    assert.equal(latLongText([44.0089994, -115]), '44.00900, -115.00000');
    assert.equal(latLongText([-0.000004, 3.123456789]), '-0.00000, 3.12346');
});
