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
