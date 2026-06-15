/**
 * Minimal, dependency-free PNG decode/encode for 8-bit RGBA, non-interlaced
 * images. Just enough to read the spritesheet, composite new sprites onto a
 * larger canvas, and write it back. Uses only Node's built-in zlib.
 *
 * Not a general PNG library — it asserts colorType 6 (RGBA) / bitDepth 8.
 */
import zlib from "node:zlib";

// ---- CRC32 (PNG chunk checksum) -------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode a PNG buffer to { width, height, data } where data is RGBA bytes.
 */
export function decodePNG(buffer) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== sig[i]) throw new Error("not a PNG");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  let off = 8;
  while (off < buffer.length) {
    const len = buffer.readUInt32BE(off);
    const type = buffer.toString("ascii", off + 4, off + 8);
    const data = buffer.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNG unsupported");
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(
      `unsupported PNG (bitDepth ${bitDepth}, colorType ${colorType})`,
    );
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4; // RGBA
  const stride = width * bpp;
  const out = new Uint8Array(width * height * bpp);

  // Reverse the per-scanline filters.
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[pos++];
      const a = x >= bpp ? out[rowStart + x - bpp] : 0;
      const b = y > 0 ? out[rowStart - stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[rowStart - stride + x - bpp] : 0;
      let recon;
      switch (filter) {
        case 0:
          recon = value;
          break;
        case 1:
          recon = value + a;
          break;
        case 2:
          recon = value + b;
          break;
        case 3:
          recon = value + ((a + b) >> 1);
          break;
        case 4:
          recon = value + paeth(a, b, c);
          break;
        default:
          throw new Error(`bad PNG filter ${filter}`);
      }
      out[rowStart + x] = recon & 0xff;
    }
  }

  return { width, height, data: out };
}

/**
 * Encode RGBA bytes to a PNG buffer (filter 0 / None on every scanline).
 */
export function encodePNG(width, height, data) {
  const bpp = 4;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, body])), 0);
    return Buffer.concat([len, typeBuf, body, crcBuf]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
