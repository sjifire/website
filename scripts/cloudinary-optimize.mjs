/**
 * Cloudinary image optimization for scripts (ESM)
 * Uploads image to Cloudinary, applies transforms, downloads optimized result
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load site config for cloud name
const siteConfigPath = join(__dirname, '..', 'api', 'site-config.json');
const siteConfig = JSON.parse(readFileSync(siteConfigPath, 'utf-8'));
const CLOUD_NAME = siteConfig.cloudinaryRootUrl.split('/').pop();

/**
 * Get Cloudinary API credentials from environment
 */
export function getCloudinaryConfig() {
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!apiKey || !apiSecret) {
    return null;
  }

  return { apiKey, apiSecret, cloudName: CLOUD_NAME };
}

/**
 * Generate Cloudinary API signature
 */
function generateSignature(params, apiSecret) {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(sortedParams + apiSecret)
    .digest('hex');
}

/**
 * Optimize an image buffer via Cloudinary Upload API
 * @param {Buffer} buffer - Image buffer
 * @param {Object} options - Options
 * @param {string} options.transform - Cloudinary transformation string (default: 'w_500,h_500,c_limit,q_auto')
 * @param {string} options.format - Output format (default: 'jpg')
 * @returns {Promise<{buffer: Buffer, optimized: boolean, reason?: string}>}
 */
export async function optimizeImageBuffer(buffer, options = {}) {
  const {
    transform = 'w_1000,h_1000,c_limit,q_auto',
    format = 'jpg',
  } = options;

  const config = getCloudinaryConfig();

  if (!config) {
    return { buffer, optimized: false, reason: 'no_credentials' };
  }

  try {
    const base64Content = buffer.toString('base64');
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    const dataUri = `data:${mimeType};base64,${base64Content}`;

    // Prepare signed upload params
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      timestamp,
      transformation: transform,
    };

    const signature = generateSignature(params, config.apiSecret);

    // Build form data
    const formData = new FormData();
    formData.append('file', dataUri);
    formData.append('timestamp', timestamp.toString());
    formData.append('transformation', transform);
    formData.append('signature', signature);
    formData.append('api_key', config.apiKey);

    // Upload to Cloudinary
    const uploadUrl = `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Cloudinary upload failed:', error);
      return { buffer, optimized: false, reason: 'upload_failed' };
    }

    const result = await response.json();

    // Fetch the optimized image
    const optimizedUrl = result.secure_url;
    const imageResponse = await fetch(optimizedUrl);

    if (!imageResponse.ok) {
      console.error('Failed to fetch optimized image');
      return { buffer, optimized: false, reason: 'fetch_failed' };
    }

    const optimizedBuffer = Buffer.from(await imageResponse.arrayBuffer());

    return {
      buffer: optimizedBuffer,
      optimized: true,
      originalSize: buffer.length,
      optimizedSize: optimizedBuffer.length,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    console.error('Cloudinary optimization error:', error.message);
    return { buffer, optimized: false, reason: 'error' };
  }
}
