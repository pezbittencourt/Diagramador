const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

// Ícones técnicos provisórios para validar o pipeline. Não constituem a identidade final.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const outputDirectory = path.resolve(__dirname, "../build");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function encodePng(size, paint) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (stride + 1);
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint((x + 0.5) / size, (y + 0.5) / size);
      const offset = row + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const nearestX = Math.max(left + radius, Math.min(x, right - radius));
  const nearestY = Math.max(top + radius, Math.min(y, bottom - radius));
  return x >= left && x <= right && y >= top && y <= bottom
    && (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
}

function appPaint(x, y) {
  if (!insideRoundedRect(x, y, 0.055, 0.055, 0.945, 0.945, 0.17)) return [0, 0, 0, 0];
  const green = [25, 47, 39, 255];
  const paper = [244, 238, 219, 255];
  const gold = [177, 132, 66, 255];
  if (y > 0.19 && y < 0.79 && x > 0.18 && x < 0.48) return paper;
  if (y > 0.19 && y < 0.79 && x > 0.52 && x < 0.82) return paper;
  if (y > 0.23 && y < 0.75 && (Math.abs(x - 0.48) < 0.025 || Math.abs(x - 0.52) < 0.025)) return gold;
  if (y > 0.82 && y < 0.86 && x > 0.22 && x < 0.78) return gold;
  return green;
}

function documentPaint(x, y) {
  if (!insideRoundedRect(x, y, 0.14, 0.07, 0.86, 0.93, 0.09)) return [0, 0, 0, 0];
  if (x < 0.25) return [25, 47, 39, 255];
  if (x > 0.67 && y < 0.26 && y > x - 0.67) return [208, 195, 162, 255];
  if (y > 0.39 && y < 0.44 && x > 0.34 && x < 0.72) return [177, 132, 66, 255];
  if (y > 0.53 && y < 0.57 && x > 0.34 && x < 0.74) return [103, 112, 105, 255];
  if (y > 0.65 && y < 0.69 && x > 0.34 && x < 0.66) return [103, 112, 105, 255];
  return [244, 238, 219, 255];
}

function encodeIco(pngs) {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let dataOffset = header.length;
  pngs.forEach(({ size, buffer }, index) => {
    const offset = 6 + index * 16;
    header[offset] = size === 256 ? 0 : size;
    header[offset + 1] = size === 256 ? 0 : size;
    header[offset + 2] = 0;
    header[offset + 3] = 0;
    header.writeUInt16LE(1, offset + 4);
    header.writeUInt16LE(32, offset + 6);
    header.writeUInt32LE(buffer.length, offset + 8);
    header.writeUInt32LE(dataOffset, offset + 12);
    dataOffset += buffer.length;
  });
  return Buffer.concat([header, ...pngs.map(({ buffer }) => buffer)]);
}

fs.mkdirSync(outputDirectory, { recursive: true });
for (const [name, paint] of [["app.ico", appPaint], ["livro.ico", documentPaint]]) {
  const pngs = sizes.map((size) => ({ size, buffer: encodePng(size, paint) }));
  fs.writeFileSync(path.join(outputDirectory, name), encodeIco(pngs));
}
console.log(`Ícones provisórios gerados em ${outputDirectory}`);

