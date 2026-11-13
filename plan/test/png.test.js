import assert from 'node:assert/strict';
import {grayPng} from '../lib/png.js';
import {inflateSync} from 'node:zlib';
import test from 'node:test';


// Read a PNG file's chunks - their types and data
function pngChunks(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunks = [];
    for (let offset = 8; offset < bytes.length;) {
        const length = view.getUint32(offset);
        chunks.push([new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8)), bytes.subarray(offset + 8, offset + 8 + length)]);
        offset += 12 + length;
    }
    return chunks;
}


test('grayPng', () => {
    // A 3 x 2 pixel image
    const pixels = Uint8Array.from([0, 128, 255, 10, 20, 30]);
    const bytes = grayPng(3, 2, pixels);
    assert.equal(bytes.constructor, Uint8Array);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

    // The header - the width, the height, 8 bits per pixel, and grayscale
    const chunks = pngChunks(bytes);
    assert.deepEqual(chunks.map(([type]) => type), ['IHDR', 'IDAT', 'IEND']);
    assert.deepEqual([...chunks[0][1]], [0, 0, 0, 3, 0, 0, 0, 2, 8, 0, 0, 0, 0]);

    // The pixels - each row begins with its filter type (none)
    assert.deepEqual([...inflateSync(chunks[1][1])], [0, 0, 128, 255, 0, 10, 20, 30]);
    assert.equal(chunks[2][1].length, 0);

    // The chunks' checksums - a PNG file's last 12 bytes are always these, and the header's is zlib's CRC-32 of its type
    // and data
    assert.deepEqual([...bytes.subarray(-12)], [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
    assert.deepEqual([...bytes.subarray(8, 33)], [
        0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 3, 0, 0, 0, 2, 8, 0, 0, 0, 0, 184, 31, 57, 198
    ]);
});
