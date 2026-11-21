import {alignmentFixture, alignments, designArgs, expected, plain, planePlan, valleyPlan} from './roadFixtures.js';
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


// The alignments' existing road stations that the grade limit can't reach - the Python planning tools' profiles broke
// grade there. A road's doesn't, so there's no profile.
const unreachables = {'profile-existing': 10, 'profile-existing-start': 14};


test('designProfile, the Python planning tools\' profiles', () => {
    for (const name of Object.keys(alignments)) {
        const {designed} = profileFixture(name);
        const {profile, ground, sideSlope} = expected[name];
        // (the profiles that the grade limits can't keep within the design's maximum depth of the ground are deep - the
        // profiles across the valley's 80 foot fill, and those that can't reach their existing roads' ground)
        const unreachable = unreachables[name] ?? null;
        const deep = unreachable !== null || name.startsWith('profile-valley');
        assert.deepEqual(plain(designed), {'profile': unreachable !== null ? null : profile, ground, sideSlope, unreachable, deep}, name);
    }
});


test('designProfile, the cross sections that are kept', () => {
    // A design keeps its stations' cross sections, to cost them once for every balance price - a design that's too
    // large to keep them computes them each time, and its profile is the same
    for (const name of Object.keys(alignments)) {
        const {topo, design, x, y, stations, existing} = alignmentFixture(...alignments[name]);
        const kept = designProfile(topo, design, x, y, stations, existing);
        const computed = designProfile(topo, design, x, y, stations, existing, 0);
        assert.deepEqual(plain(computed), plain(kept), name);
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
    // design grade, which can't reach the existing road: the junction is its unreachable station. It isn't a road's
    // profile, so its design stops there - there's no profile, but its ground and side slopes are every station's.
    const {alignment, designed} = profileFixture('profile-existing');
    assert.equal(alignment.existing.reduce((sum, mask) => sum + mask, 0), 11);
    assert.equal(designed.unreachable, 10);
    assert.equal(designed.profile, null);
    assert.equal(designed.deep, true);
    assert.equal(designed.ground.length, 21);
    assert.equal(designed.sideSlope.length, 21);
    assert.deepEqual(plain([designed.ground[0], designed.ground[10], designed.ground[20]]), [100, 115, 130]);

    // An existing road at the start, and one the grade limit can't reach from it - its first station
    const start = profileFixture('profile-existing-start').designed;
    assert.equal(start.unreachable, 14);
    assert.equal(start.profile, null);

    // All of the road is an existing road
    const all = profileFixture('profile-existing-all').designed;
    assert.equal(all.unreachable, null);
    assert.deepEqual(plain(all.profile), plain(all.ground));

    // A new road up a slope too steep for the depth limit, then an existing road - the grade limit can't reach the
    // existing road within a depth limit, or without one: the junction is its unreachable station
    for (const rise of [2.6, 8]) {
        const steep = alignmentFixture(planePlan({rise}), designArgs(), [[50, 0], [50, 100]], 5, [[50, 100]]);
        const steepDesigned = designProfile(steep.topo, steep.design, steep.x, steep.y, steep.stations, steep.existing);
        assert.equal(plain(steep.existing).join(''), '000000000011111111111');
        assert.equal(steepDesigned.unreachable, 10);
        assert.equal(steepDesigned.deep, true);
        assert.equal(steepDesigned.profile, null);

        // Unless a deep profile isn't designed - there's none
        assert.equal(designProfile(steep.topo, steep.design, steep.x, steep.y, steep.stations, steep.existing, undefined, false), null);
    }

    // A profile that's within the depth limit is the same, whether or not a deep profile is designed
    const {topo, design, x, y, stations, existing} = profileFixture('profile-hill').alignment;
    const shallow = designProfile(topo, design, x, y, stations, existing, undefined, false);
    assert.equal(shallow.deep, false);
    assert.deepEqual(shallow, designProfile(topo, design, x, y, stations, existing));
});


test('designProfile, an existing road has no earthwork', () => {
    // A new road up a 40% slope from the end of an existing road along it. The existing road's bench has no earthwork
    // for the new road's cut and fill to balance, so the new road's deepest cut and fill are its own - they don't
    // depend on the existing road's length.
    const newDepths = (size) => {
        const far = (size - 1) * 10;
        const {topo, design, x, y, stations, existing} = alignmentFixture(
            planePlan({'rise': 0.4, size}), designArgs(), [[0, 100], [far - 150, 100], [far - 10, 130]], 5, [[0, far - 160]]
        );
        const {profile, ground} = designProfile(topo, design, x, y, stations, existing);
        const depths = Array.from(ground, (z, ix) => z - profile[ix]).filter((depth, ix) => !existing[ix]);
        return [existing.reduce((sum, mask) => sum + mask, 0), Math.max(...depths), -Math.min(...depths)].map(
            (value) => Math.round(value * 100) / 100
        );
    };
    assert.deepEqual(newDepths(41), [49, 1.51, 0.36]);
    assert.deepEqual(newDepths(61), [89, 1.51, 0.35]);
});


test('designProfile, a new section between existing roads', () => {
    // The road's ends are existing roads - the new section between them has vertical curves of its own, so it meets
    // the existing roads' ground within the grade limit
    const alignment = alignmentFixture(valleyPlan(), designArgs(), [[60, 100], [200, 180], [340, 300]], 10, [[0, 60], [250, 400]]);
    const {topo, design, x, y, stations, existing} = alignment;
    const {profile, ground} = designProfile(topo, design, x, y, stations, existing);
    assert.equal(plain(existing).join(''), '111111100000000000000000001111111111');
    assert.deepEqual(plain(profile.slice(0, 7)), plain(ground.slice(0, 7)));
    assert.deepEqual(plain(profile.slice(26)), plain(ground.slice(26)));
    const newGrades = grades(profile.slice(6, 27), 10);
    assert.equal(newGrades.length, 20);
    assert.ok(Math.max(...newGrades) <= design.grade + 1e-9);
    assert.ok(newGrades[0] > 0.1 && newGrades[19] > 0.1);

    // The section's elevations aren't its ground's - it's a designed profile
    assert.ok(profile.slice(7, 26).some((z, ix) => Math.abs(z - ground[7 + ix]) > 1));
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
