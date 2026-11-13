// geo.js - the transverse Mercator map projection, and a road plan's georeference


// The GRS 80 ellipsoid (NAD 83's - within a millimeter of WGS 84's) - its equatorial radius, in meters, and its
// third flattening
const radius = 6378137;
const flattening = 1 / 298.257222101;
const third = flattening / (2 - flattening);


// The transverse Mercator series' rectifying radius and coefficients (Krueger's series, to the third order - it's
// accurate to a millimeter within a UTM zone)
const third2 = third * third;
const third3 = third2 * third;
const rectifying = radius / (1 + third) * (1 + third2 / 4 + third2 * third2 / 64);
const alpha = [third / 2 - 2 * third2 / 3 + 5 * third3 / 16, 13 * third2 / 48 - 3 * third3 / 5, 61 * third3 / 240];
const beta = [third / 2 - 2 * third2 / 3 + 37 * third3 / 96, third2 / 48 + third3 / 15, 17 * third3 / 480];
const delta = [2 * third - 2 * third2 / 3 - 2 * third3, 7 * third2 / 3 - 8 * third3 / 5, 56 * third3 / 15];
const conformal = 2 * Math.sqrt(third) / (1 + third);
const degrees = Math.PI / 180;


// Compute the tangent of a latitude's conformal latitude
function conformalTangent(latitude) {
    const sinLat = Math.sin(latitude * degrees);
    return Math.sinh(Math.atanh(sinLat) - conformal * Math.atanh(conformal * sinLat));
}


// Create a transverse Mercator projection - its origin's latitude and longitude, in degrees, and its scale factor
// (1 - a UTM zone's is 0.9996). Returns the projection object for the "project" and "unproject" functions.
export function transverseMercator(latitude, longitude, scale = 1) {
    // The origin's northing, on the projection's central meridian
    const xi = Math.atan(conformalTangent(latitude));
    let north = xi;
    for (let ix = 0; ix < 3; ix++) {
        north += alpha[ix] * Math.sin(2 * (ix + 1) * xi);
    }
    return {longitude, 'size': scale * rectifying, north};
}


// Create a UTM zone's projection (the northern hemisphere's - its coordinates are less its 500,000 meter false easting)
export function utmZone(zone) {
    return transverseMercator(0, zone * 6 - 183, 0.9996);
}


// The UTM false easting, in meters
export const utmFalseEasting = 500000;


// Project a latitude and longitude, in degrees - returns [east, north] of the projection's origin, in meters
export function project(projection, latitude, longitude) {
    const tangent = conformalTangent(latitude);
    const turn = (longitude - projection.longitude) * degrees;
    const xi = Math.atan2(tangent, Math.cos(turn));
    const eta = Math.atanh(Math.sin(turn) / Math.sqrt(1 + tangent * tangent));
    let east = eta;
    let north = xi;
    for (let ix = 0; ix < 3; ix++) {
        const angle = 2 * (ix + 1);
        east += alpha[ix] * Math.cos(angle * xi) * Math.sinh(angle * eta);
        north += alpha[ix] * Math.sin(angle * xi) * Math.cosh(angle * eta);
    }
    return [projection.size * east, projection.size * (north - projection.north)];
}


// Unproject a point [east, north] of the projection's origin, in meters - returns [latitude, longitude], in degrees
export function unproject(projection, east, north) {
    const xi = north / projection.size + projection.north;
    const eta = east / projection.size;
    let xi2 = xi;
    let eta2 = eta;
    for (let ix = 0; ix < 3; ix++) {
        const angle = 2 * (ix + 1);
        xi2 -= beta[ix] * Math.sin(angle * xi) * Math.cosh(angle * eta);
        eta2 -= beta[ix] * Math.cos(angle * xi) * Math.sinh(angle * eta);
    }
    const chi = Math.asin(Math.sin(xi2) / Math.cosh(eta2));
    let latitude = chi;
    for (let ix = 0; ix < 3; ix++) {
        latitude += delta[ix] * Math.sin(2 * (ix + 1) * chi);
    }
    return [latitude / degrees, projection.longitude + Math.atan2(Math.sinh(eta2), Math.cos(xi2)) / degrees];
}


// Get a road plan's latitude and longitude at a point, in degrees ([latitude, longitude]) - null if the plan has no
// georeference
export function planLatLong(plan, x, y) {
    const georeference = plan.georeference ?? null;
    if (georeference === null) {
        return null;
    }
    const scale = plan.units === 'feet' ? 0.3048 : 1;
    const projection = transverseMercator(georeference.latitude, georeference.longitude);
    return unproject(projection, (x - georeference.x) * scale, (y - georeference.y) * scale);
}


// Format a latitude and longitude, in degrees, to about a meter
export function latLongText([latitude, longitude]) {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
