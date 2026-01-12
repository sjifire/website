/**
 * Image perceptual hashing utilities
 * Uses blockhash algorithm to compare images visually rather than byte-by-byte
 */

import jpeg from 'jpeg-js';
import { bmvbhash } from 'blockhash-core';

/**
 * Decode a JPEG buffer to raw pixel data
 * @param {Buffer} buffer - JPEG image buffer
 * @returns {{ data: Uint8Array, width: number, height: number }}
 */
export function decodeJpeg(buffer) {
  const decoded = jpeg.decode(buffer, { useTArray: true });
  return {
    data: decoded.data,
    width: decoded.width,
    height: decoded.height,
  };
}

/**
 * Encode raw pixel data to JPEG buffer
 * @param {{ data: Uint8Array, width: number, height: number }} imageData
 * @param {number} quality - JPEG quality 0-100
 * @returns {Buffer}
 */
export function encodeJpeg(imageData, quality = 80) {
  const encoded = jpeg.encode({
    data: imageData.data,
    width: imageData.width,
    height: imageData.height,
  }, quality);
  return encoded.data;
}

/**
 * Resize image using simple bilinear interpolation
 * @param {{ data: Uint8Array, width: number, height: number }} imageData
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {{ data: Uint8Array, width: number, height: number }}
 */
export function resizeImage(imageData, targetWidth, targetHeight) {
  const { data, width, height } = imageData;
  const newData = new Uint8Array(targetWidth * targetHeight * 4);

  const xRatio = width / targetWidth;
  const yRatio = height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      // Map to source coordinates
      const srcX = x * xRatio;
      const srcY = y * yRatio;

      // Get the four nearest pixels
      const x1 = Math.floor(srcX);
      const y1 = Math.floor(srcY);
      const x2 = Math.min(x1 + 1, width - 1);
      const y2 = Math.min(y1 + 1, height - 1);

      // Bilinear interpolation weights
      const xWeight = srcX - x1;
      const yWeight = srcY - y1;

      const destIdx = (y * targetWidth + x) * 4;

      for (let c = 0; c < 4; c++) {
        const p11 = data[(y1 * width + x1) * 4 + c];
        const p21 = data[(y1 * width + x2) * 4 + c];
        const p12 = data[(y2 * width + x1) * 4 + c];
        const p22 = data[(y2 * width + x2) * 4 + c];

        const value =
          p11 * (1 - xWeight) * (1 - yWeight) +
          p21 * xWeight * (1 - yWeight) +
          p12 * (1 - xWeight) * yWeight +
          p22 * xWeight * yWeight;

        newData[destIdx + c] = Math.round(value);
      }
    }
  }

  return { data: newData, width: targetWidth, height: targetHeight };
}

/**
 * Resize image maintaining aspect ratio
 * @param {{ data: Uint8Array, width: number, height: number }} imageData
 * @param {number} maxDimension - Maximum width or height
 * @returns {{ data: Uint8Array, width: number, height: number }}
 */
export function resizeToMax(imageData, maxDimension) {
  const { width, height } = imageData;

  // Don't upscale
  if (width <= maxDimension && height <= maxDimension) {
    return imageData;
  }

  const ratio = Math.min(maxDimension / width, maxDimension / height);
  const newWidth = Math.round(width * ratio);
  const newHeight = Math.round(height * ratio);

  return resizeImage(imageData, newWidth, newHeight);
}

/**
 * Compute perceptual hash of image data
 * @param {{ data: Uint8Array, width: number, height: number }} imageData
 * @param {number} bits - Hash size (default 16 = 256 bit hash)
 * @returns {string} Hex string hash
 */
export function computeHash(imageData, bits = 16) {
  const { data, width, height } = imageData;
  return bmvbhash({ data, width, height }, bits);
}

/**
 * Compute perceptual hash directly from JPEG buffer
 * @param {Buffer} buffer - JPEG image buffer
 * @param {number} bits - Hash size
 * @returns {string} Hex string hash
 */
export function hashJpegBuffer(buffer, bits = 16) {
  const imageData = decodeJpeg(buffer);
  return computeHash(imageData, bits);
}

/**
 * Calculate hamming distance between two hex hash strings
 * @param {string} hash1
 * @param {string} hash2
 * @returns {number} Number of differing bits
 */
export function hammingDistance(hash1, hash2) {
  if (hash1.length !== hash2.length) {
    throw new Error('Hash lengths must match');
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const n1 = parseInt(hash1[i], 16);
    const n2 = parseInt(hash2[i], 16);
    // Count differing bits using XOR and popcount
    let xor = n1 ^ n2;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Check if two images are visually similar
 * @param {string} hash1
 * @param {string} hash2
 * @param {number} threshold - Max allowed hamming distance (default 10)
 * @returns {boolean}
 */
export function isSimilar(hash1, hash2, threshold = 10) {
  return hammingDistance(hash1, hash2) <= threshold;
}

/**
 * Process a JPEG buffer: resize and re-encode
 * @param {Buffer} buffer - Original JPEG buffer
 * @param {number} maxDimension - Maximum width/height
 * @param {number} quality - JPEG quality 0-100
 * @returns {{ buffer: Buffer, hash: string, width: number, height: number }}
 */
export function processImage(buffer, maxDimension = 500, quality = 80) {
  const imageData = decodeJpeg(buffer);
  const resized = resizeToMax(imageData, maxDimension);
  const hash = computeHash(resized);
  const outputBuffer = encodeJpeg(resized, quality);

  return {
    buffer: Buffer.from(outputBuffer),
    hash,
    width: resized.width,
    height: resized.height,
  };
}
