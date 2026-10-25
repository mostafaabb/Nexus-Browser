/**
 * Generates the application icons.
 *
 * The icon is drawn programmatically so that the repository does not have to
 * carry binary assets that nobody can review. The output is a Windows `.ico`
 * file (with real DIB entries for the small sizes and PNG entries for the
 * large ones) plus a 256Ã—256 PNG for the other platforms.
 *
 * Usage: `node scripts/generate-icons.mjs`
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const buildDirectory = join(here, '..', 'build')

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/* -------------------------------------------------------------- drawing --- */

function mix(a, b, t) {
  return a + (b - a) * t
}

/** Signed distance to a rounded rectangle (negative inside). */
function roundedRectDistance(px, py, size, radius) {
  const half = size / 2
  const dx = Math.abs(px - half) - (half - radius)
  const dy = Math.abs(py - half) - (half - radius)
  const outsideX = Math.max(dx, 0)
  const outsideY = Math.max(dy, 0)
  return (
    Math.sqrt(outsideX * outsideX + outsideY * outsideY) + Math.min(Math.max(dx, dy), 0) - radius
  )
}

/** True when the point is inside the "N" glyph. */
function insideGlyph(px, py, size) {
  const x = px / size
  const y = py / size
  const x0 = 0.28
  const x1 = 0.72
  const y0 = 0.24
  const y1 = 0.76
  const stroke = 0.1

  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  if (x <= x0 + stroke) return true
  if (x >= x1 - stroke) return true

  const slope = (x1 - x0) / (y1 - y0)
  const diagonal = x0 + (y - y0) * slope
  return Math.abs(x - diagonal) <= stroke * 1.05
}

/**
 * Renders the icon into an RGBA buffer.
 *
 * Four times four supersampling is used so that the rounded corners and the
 * glyph edges are smooth.
 */
function renderIcon(size) {
  const pixels = new Uint8Array(size * size * 4)
  const samples = 4
  const radius = size * 0.22

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let coverage = 0
      let glyph = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples
          const py = y + (sy + 0.5) / samples
          if (roundedRectDistance(px, py, size, radius) <= 0) coverage += 1
          if (insideGlyph(px, py, size)) glyph += 1
        }
      }

      const total = samples * samples
      const alpha = coverage / total
      const glyphAlpha = glyph / total

      // Vertical gradient from violet to indigo.
      const t = y / size
      let r = mix(0x8b, 0x63, t)
      let g = mix(0x5c, 0x66, t)
      let b = mix(0xf6, 0xf1, t)

      // Blend the white glyph over the gradient.
      r = mix(r, 255, glyphAlpha)
      g = mix(g, 255, glyphAlpha)
      b = mix(b, 255, glyphAlpha)

      const offset = (y * size + x) * 4
      pixels[offset] = Math.round(r)
      pixels[offset + 1] = Math.round(g)
      pixels[offset + 2] = Math.round(b)
      pixels[offset + 3] = Math.round(alpha * 255)
    }
  }

  return pixels
}

/* ------------------------------------------------------------ encoding --- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

/** Encodes an RGBA buffer as a PNG file. */
function encodePng(pixels, size) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.writeUInt8(8, 8) // bit depth
  header.writeUInt8(6, 9) // colour type: RGBA
  header.writeUInt8(0, 10)
  header.writeUInt8(0, 11)
  header.writeUInt8(0, 12)

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

/** Encodes an RGBA buffer as an ICO compatible DIB (BITMAPINFOHEADER). */
function encodeDib(pixels, size) {
  const headerSize = 40
  const maskStride = Math.ceil(size / 32) * 4
  const xorSize = size * size * 4
  const andSize = maskStride * size

  const header = Buffer.alloc(headerSize)
  header.writeUInt32LE(headerSize, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8) // height includes the AND mask
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16) // BI_RGB
  header.writeUInt32LE(xorSize + andSize, 20)

  const body = Buffer.alloc(xorSize + andSize)

  // The XOR bitmap is stored bottom-up in BGRA order.
  for (let y = 0; y < size; y++) {
    const sourceRow = size - 1 - y
    for (let x = 0; x < size; x++) {
      const source = (sourceRow * size + x) * 4
      const target = (y * size + x) * 4
      body[target] = pixels[source + 2]
      body[target + 1] = pixels[source + 1]
      body[target + 2] = pixels[source]
      body[target + 3] = pixels[source + 3]
    }
  }

  // The AND mask is fully opaque wherever the image is visible.
  const andOffset = xorSize
  for (let y = 0; y < size; y++) {
    const sourceRow = size - 1 - y
    for (let x = 0; x < size; x++) {
      const alpha = pixels[(sourceRow * size + x) * 4 + 3]
      if (alpha < 128) {
        body[andOffset + y * maskStride + (x >> 3)] |= 0x80 >> (x & 7)
      }
    }
  }

  return Buffer.concat([header, body])
}

/** Packs the images into a Windows icon file. */
function buildIco(images) {
  const directory = Buffer.alloc(6 + images.length * 16)
  directory.writeUInt16LE(0, 0)
  directory.writeUInt16LE(1, 2) // type: icon
  directory.writeUInt16LE(images.length, 4)

  let offset = directory.length
  const payloads = []

  images.forEach((image, index) => {
    const entry = 6 + index * 16
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry)
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1)
    directory.writeUInt8(0, entry + 2)
    directory.writeUInt8(0, entry + 3)
    directory.writeUInt16LE(1, entry + 4)
    directory.writeUInt16LE(32, entry + 6)
    directory.writeUInt32LE(image.data.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += image.data.length
    payloads.push(image.data)
  })

  return Buffer.concat([directory, ...payloads])
}

/* ---------------------------------------------------------------- main --- */

mkdirSync(buildDirectory, { recursive: true })

const images = []
for (const size of ICO_SIZES) {
  const pixels = renderIcon(size)
  // Small sizes use a DIB so that every Windows version understands them,
  // large sizes use PNG which keeps the file small.
  const data = size <= 48 ? encodeDib(pixels, size) : encodePng(pixels, size)
  images.push({ size, data })
}

const icoPath = join(buildDirectory, 'icon.ico')
writeFileSync(icoPath, buildIco(images))

const pngPixels = renderIcon(256)
const pngPath = join(buildDirectory, 'icon.png')
writeFileSync(pngPath, encodePng(pngPixels, 256))

process.stdout.write(`Wrote ${icoPath} (${ICO_SIZES.join(', ')}) and ${pngPath} (256x256).\n`)
