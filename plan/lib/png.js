// png.js - a PNG image file of gray pixels

import {crc32, deflateSync} from 'node:zlib';


// The PNG file signature
const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);


// Create a PNG image file's bytes - an 8-bit grayscale image of "width" by "height" pixels ("pixels" is a Uint8Array
// of its rows, top to bottom)
export function grayPng(width, height, pixels) {
    // The image's rows, each with its filter type (none)
    const rows = new Uint8Array((width + 1) * height);
    for (let row = 0; row < height; row++) {
        rows.set(pixels.subarray(row * width, (row + 1) * width), row * (width + 1) + 1);
    }
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    header[8] = 8;
    const chunks = [signature, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(rows)), pngChunk('IEND', new Uint8Array(0))];
    const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return bytes;
}


// Create a PNG chunk - its data's length, its type, its data, and their checksum
function pngChunk(type, data) {
    const chunk = new Uint8Array(12 + data.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length);
    chunk.set(new TextEncoder().encode(type), 4);
    chunk.set(data, 8);
    view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
    return chunk;
}
