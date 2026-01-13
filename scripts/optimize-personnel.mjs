#!/usr/bin/env node
/**
 * One-time script to optimize all personnel photos via Cloudinary with g_faces
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { optimizeImageBuffer, getCloudinaryConfig } from './cloudinary-optimize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHOTOS_DIR = join(__dirname, '..', 'src', 'assets', 'media', 'personnel_imgs');
const TRANSFORM = 'w_1000,h_1000,c_fill,g_faces,q_auto';

async function main() {
  const config = getCloudinaryConfig();
  if (!config) {
    console.error('Missing CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET');
    process.exit(1);
  }

  console.log('Optimizing personnel photos via Cloudinary');
  console.log('==========================================');
  console.log('Transform:', TRANSFORM);
  console.log('');

  const files = readdirSync(PHOTOS_DIR).filter(f => f.endsWith('.jpg') && !f.startsWith('.'));
  let totalSaved = 0;
  let optimizedCount = 0;

  for (const file of files) {
    const filePath = join(PHOTOS_DIR, file);
    const buffer = readFileSync(filePath);
    const originalSize = buffer.length;

    process.stdout.write(file.padEnd(35) + ' ' + Math.round(originalSize/1024).toString().padStart(6) + 'KB -> ');

    try {
      const result = await optimizeImageBuffer(buffer, { transform: TRANSFORM });

      if (result.optimized && result.buffer.length < originalSize) {
        writeFileSync(filePath, result.buffer);
        const saved = originalSize - result.buffer.length;
        totalSaved += saved;
        optimizedCount++;
        console.log(Math.round(result.buffer.length/1024).toString().padStart(6) + 'KB (saved ' + Math.round(saved/1024) + 'KB)');
      } else {
        console.log('skipped (' + (result.reason || 'not smaller') + ')');
      }
    } catch (err) {
      console.log('error: ' + err.message);
    }
  }

  console.log('');
  console.log('==========================================');
  console.log('Optimized:', optimizedCount, 'files');
  console.log('Total saved:', Math.round(totalSaved/1024) + 'KB');
}

main().catch(console.error);
