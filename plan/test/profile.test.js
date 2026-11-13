import {alignmentFixture, alignments, designArgs, expected, plain, planePlan} from './roadFixtures.js';
import assert from 'node:assert/strict';
import {designProfile} from '../lib/profile.js';
import test from 'node:test';


// Design a named alignment's profile - returns the alignment and its profile
function profileFixture(name) {
    const alignment = alignmentFixture(...alignments[name]);
    const {topo, design, x, y, stations, existing} = alignment;
    return {alignment, 'designed': designProfile(topo, design, x, y, stations, existing)};
}


// Compute a profile's grades
function grades(profile, interval) {
    return Array.from(profile.slice(1), (z, ix) => Math.abs(z - profile[ix]) / interval);
}


test('designProfile, the Python planning tools\' profiles', () => {
    for (const name of Object.keys(alignments)) {
        const {designed} = profileFixture(name);
        const {profile, ground, sideSlope} = expected[name];
        assert.deepEqual(plain(designed), {profile, ground, sideSlope}, name);
    }
});


test('designProfile, the grade limit', () => {
    // A road straight up a 30% plane is held to the design grade (11%) - it starts at the ground, and cuts to climb
    const {alignment, designed} = profileFixture('profile-grade');
    const {profile, ground, sideSlope} = designed;
    assert.equal(profile.length, 21);
    assert.ok(Math.max(...grades(profile, 5)) <= alignment.design.grade + 1e-9);
    assert.ok(Math.abs(profile[0] - ground[0]) <= 1);
    assert.deepEqual(plain(ground.slice(0, 3)), [100, 101.5, 103]);
    assert.equal(profile[20], 110.9958333333348);
    assert.ok(sideSlope.every((slope) => Math.abs(slope) < 1e-12));
});


test('designProfile, the depth limit', () => {
    // A profile is designed within 60 feet of the ground - or, where the grade limit can't keep it there, within 240
    // feet, or without a limit. A road straight up a plane climbs 11 feet in 100 at the design grade - so at its end
    // it's the plane's rise less 11 feet below the ground.
    for (const [rise, endDepth] of [[0.3, 19], [0.7, 59], [0.75, 64], [2.5, 239], [2.6, 249], [8, 789]]) {
        const {topo, design, x, y, stations} = alignmentFixture(planePlan({rise}), designArgs(), [[50, 0], [50, 100]], 5);
        const {profile, ground} = designProfile(topo, design, x, y, stations, null);
        assert.ok(Math.max(...grades(profile, 5)) <= design.grade + 1e-9, `${rise}`);
        assert.ok(Math.abs(profile[0] - ground[0]) <= 1, `${rise}`);
        assert.ok(Math.abs(ground[20] - profile[20] - endDepth) < 0.1, `${rise}: ${ground[20] - profile[20]}`);
    }
});


test('designProfile, an existing road', () => {
    // The existing road's second half follows the ground (no grade limit) - the new road's first half is held to the
    // design grade, and breaks grade to meet the existing road at the junction
    const {alignment, designed} = profileFixture('profile-existing');
    const {profile, ground} = designed;
    assert.equal(alignment.existing.reduce((sum, mask) => sum + mask, 0), 11);
    assert.deepEqual(plain(profile.slice(10)), plain(ground.slice(10)));
    assert.ok(Math.max(...grades(profile.slice(0, 10), 5)) <= alignment.design.grade + 1e-9);
    assert.ok(Math.abs(profile[0] - ground[0]) <= 1);
    assert.ok(grades(profile, 5)[9] > 1);

    // An existing road at the start, and one the grade limit can reach
    const start = profileFixture('profile-existing-start').designed;
    assert.deepEqual(plain(start.profile.slice(0, 7)), plain(start.ground.slice(0, 7)));
    assert.deepEqual(plain(start.profile.slice(14, 17)), plain(start.ground.slice(14, 17)));

    // All of the road is an existing road
    const all = profileFixture('profile-existing-all').designed;
    assert.deepEqual(plain(all.profile), plain(all.ground));
});


test('designProfile, a short meters road', () => {
    // The road is too short for vertical curves - its profile is its elevation levels
    const {alignment, designed} = profileFixture('profile-short');
    assert.equal(alignment.x.length, 9);
    assert.equal(alignment.design.feet, false);
    assert.equal(designed.profile.length, 9);
    assert.ok(Math.abs(designed.profile[0] - designed.ground[0]) < 0.01);
    assert.ok(Math.abs(designed.profile[8] - designed.ground[8]) < 0.01);
});


test('designProfile, rock, curves, and side slopes', () => {
    // A road over a hill - through a rock outcrop, with tight curves
    const {alignment, designed} = profileFixture('profile-hill');
    const {profile, ground, sideSlope} = designed;
    assert.equal(profile.length, alignment.x.length);
    assert.ok(Math.max(...grades(profile, alignment.stations[1])) <= alignment.design.grade + 1e-9);
    assert.ok(Math.max(...sideSlope) > 0.25 && Math.min(...sideSlope) < 0);
    assert.ok(Math.abs(profile[0] - ground[0]) <= 0.3);
});
