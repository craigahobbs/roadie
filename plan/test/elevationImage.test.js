import {fromArrayBuffer, writeArrayBuffer} from 'geotiff';
import assert from 'node:assert/strict';
import {elevationImage} from '../lib/elevationImage.js';
import test from 'node:test';


// Create a GeoTIFF image of elevations - 6 x 4 pixels, their elevations 100 and up, a row at a time
async function tiffImage(metadata = {}) {
    const values = new Float32Array(24).map((value, index) => 100 + index);
    values[5] = -999999;
    const tiff = await fromArrayBuffer(writeArrayBuffer(values, {
        'width': 6,
        'height': 4,
        'ModelPixelScale': [1, 1, 0],
        'ModelTiepoint': [0, 0, 0, 476000, 4427000, 0],
        'GTModelTypeGeoKey': 1,
        'GTRasterTypeGeoKey': 1,
        'ProjectedCSTypeGeoKey': 26913,
        'GTCitationGeoKey': 'NAD83 / UTM zone 13N',
        'GDAL_NODATA': '-999999',
        ...metadata
    }));
    return tiff.getImage();
}


test('elevationImage', async () => {
    const image = elevationImage(await tiffImage());
    assert.deepEqual(image.georeference, {
        'zone': 13, 'east': 476000, 'north': 4427000, 'resolution': 1, 'width': 6, 'height': 4, 'noData': -999999
    });

    // Read a window of the image's elevations - the pixel columns 1 up to 4, and rows 1 up to 3
    const data = await image.read([1, 1, 4, 3]);
    assert.equal(data.constructor, Float32Array);
    assert.deepEqual([...data], [107, 108, 109, 113, 114, 115]);
    assert.deepEqual([...await image.read([4, 0, 6, 2])], [104, -999999, 110, 111]);
});


test('elevationImage, the UTM zone', async () => {
    // The zone is the coordinate system's - NAD83, NAD83(2011), and WGS 84 UTM zones
    for (const [code, zone] of [
        [26901, 1], [26911, 11], [26923, 23], [6330, 1], [6339, 10], [6348, 19], [32601, 1], [32613, 13], [32660, 60]
    ]) {
        const image = elevationImage(await tiffImage({'ProjectedCSTypeGeoKey': code, 'GTCitationGeoKey': 'A coordinate system'}));
        assert.equal(image.georeference.zone, zone, `${code}`);
    }

    // Or its citation's
    for (const [code, citation, zone] of [
        [32767, 'NAD83(2011) / UTM zone 11N', 11], [26924, 'NAD83 / utm zone 5n', 5], [undefined, 'UTM Zone 18N', 18]
    ]) {
        const image = elevationImage(await tiffImage({'ProjectedCSTypeGeoKey': code, 'GTCitationGeoKey': citation}));
        assert.equal(image.georeference.zone, zone, citation);
    }

    // Other coordinate systems (a southern UTM zone, too) aren't elevation models'
    for (const [code, citation, message] of [
        [32713, 'WGS 84 / UTM zone 13S', 'The elevation model\'s coordinate system (32713, "WGS 84 / UTM zone 13S") isn\'t a UTM zone'],
        [32761, 'WGS 84 / UPS South', 'The elevation model\'s coordinate system (32761, "WGS 84 / UPS South") isn\'t a UTM zone'],
        [2232, undefined, 'The elevation model\'s coordinate system (2232, "") isn\'t a UTM zone']
    ]) {
        const image = await tiffImage({'ProjectedCSTypeGeoKey': code, 'GTCitationGeoKey': citation});
        assert.throws(() => elevationImage(image), {message});
    }
});


test('elevationImage, an image without keys or a "no data" elevation', () => {
    // An image without GeoTIFF keys isn't an elevation model
    const image = {
        'getOrigin': () => [476000, 4427000, 0],
        'getResolution': () => [2, -2, 0],
        'getGeoKeys': () => null,
        'getWidth': () => 6,
        'getHeight': () => 4,
        'getGDALNoData': () => null
    };
    assert.throws(() => elevationImage(image), {'message': 'The elevation model\'s coordinate system (0, "") isn\'t a UTM zone'});

    // A 2 meter image, without a "no data" elevation
    image.getGeoKeys = () => ({'ProjectedCSTypeGeoKey': 26913});
    assert.deepEqual(elevationImage(image).georeference, {
        'zone': 13, 'east': 476000, 'north': 4427000, 'resolution': 2, 'width': 6, 'height': 4, 'noData': null
    });
});


test('elevationImage, pixels that are not square, north up', () => {
    const image = (resolution) => ({'getOrigin': () => [476000, 4427000, 0], 'getResolution': () => resolution});
    for (const [resolution, message] of [
        [[1, -2, 0], 'The elevation model\'s pixels are 1 x -2 - they aren\'t square, north up'],
        [[1, 1, 0], 'The elevation model\'s pixels are 1 x 1 - they aren\'t square, north up'],
        [[-1, 1, 0], 'The elevation model\'s pixels are -1 x 1 - they aren\'t square, north up'],
        [[0, 0, 0], 'The elevation model\'s pixels are 0 x 0 - they aren\'t square, north up']
    ]) {
        assert.throws(() => elevationImage(image(resolution)), {message});
    }
});
