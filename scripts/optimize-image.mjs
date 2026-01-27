#!/usr/bin/env node
/**
 * Optimize images via Cloudinary
 *
 * Usage:
 *   node scripts/optimize-image.mjs <input> <output>   # Single file, different output
 *   node scripts/optimize-image.mjs <file> [file...]   # One or more files, in-place
 *   node scripts/optimize-image.mjs <directory>        # All images in directory (recursive)
 *
 * Behavior:
 *   - Skips files smaller than 500KB (already optimized)
 *   - Skips if optimized result isn't smaller than original
 *   - Resizes to max 2000x2000, auto quality
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, relative, extname, basename } from 'node:path';
import { optimizeImageBuffer } from './cloudinary-optimize.mjs';

const MIN_SIZE_BYTES = 500 * 1024; // 500KB
const OPTIMIZABLE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const TRANSFORM = 'w_2000,h_2000,c_limit,q_auto:good';

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function isOptimizable(filePath) {
  const ext = extname(filePath).toLowerCase();
  return OPTIMIZABLE_EXTENSIONS.includes(ext);
}

function getFilesRecursive(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      getFilesRecursive(fullPath, files);
    } else if (isOptimizable(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function optimizeFile(inputPath, outputPath, inPlace = false) {
  const inputBuffer = readFileSync(inputPath);
  const inputSize = inputBuffer.length;
  const displayName = basename(inputPath);

  // Skip small files
  if (inputSize < MIN_SIZE_BYTES) {
    console.log(`[SKIP] ${displayName} (${formatBytes(inputSize)} < ${formatBytes(MIN_SIZE_BYTES)})`);
    return { status: 'skipped', reason: 'too_small' };
  }

  process.stdout.write(`[OPTIMIZING] ${displayName} (${formatBytes(inputSize)})... `);

  const result = await optimizeImageBuffer(inputBuffer, {
    transform: TRANSFORM,
    format: extname(inputPath).toLowerCase() === '.png' ? 'png' : 'jpg'
  });

  if (!result.optimized) {
    console.log(`failed: ${result.reason}`);
    if (!inPlace) {
      // For single-file mode with different output, copy original on failure
      writeFileSync(outputPath, inputBuffer);
      console.log(`  Copied original to: ${outputPath}`);
    }
    return { status: 'error', reason: result.reason };
  }

  const outputSize = result.buffer.length;

  // Skip if not smaller (for in-place optimization)
  if (inPlace && outputSize >= inputSize) {
    console.log(`skipped (optimized not smaller: ${formatBytes(outputSize)})`);
    return { status: 'skipped', reason: 'not_smaller' };
  }

  writeFileSync(outputPath, result.buffer);
  const savings = ((1 - outputSize / inputSize) * 100).toFixed(1);
  console.log(`${formatBytes(inputSize)} → ${formatBytes(outputSize)} (${savings}% smaller)`);

  return {
    status: 'optimized',
    inputSize,
    outputSize,
    savedBytes: inputSize - outputSize
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage:');
    console.error('  node scripts/optimize-image.mjs <input> <output>   # Single file');
    console.error('  node scripts/optimize-image.mjs <file> [file...]   # In-place');
    console.error('  node scripts/optimize-image.mjs <directory>        # Batch');
    process.exit(1);
  }

  // Detect mode: single file with output, or batch/in-place
  let files = [];
  let singleFileMode = false;
  let outputPath = null;

  if (args.length === 2) {
    const [first, second] = args;
    const firstStat = statSync(first, { throwIfNoEntry: false });
    const secondStat = statSync(second, { throwIfNoEntry: false });

    // If first is a file and second doesn't exist or is a file, treat as single-file mode
    if (firstStat?.isFile() && (!secondStat || secondStat.isFile())) {
      // Check if second looks like an output path (has image extension)
      if (isOptimizable(second) || !secondStat) {
        singleFileMode = true;
        files = [resolve(first)];
        outputPath = resolve(second);
      }
    }
  }

  if (!singleFileMode) {
    // Batch mode: collect all files
    for (const arg of args) {
      const fullPath = resolve(arg);
      const stat = statSync(fullPath, { throwIfNoEntry: false });

      if (!stat) {
        console.error(`Not found: ${arg}`);
        continue;
      }

      if (stat.isDirectory()) {
        files.push(...getFilesRecursive(fullPath));
      } else if (isOptimizable(fullPath)) {
        files.push(fullPath);
      } else {
        console.error(`Not an optimizable image: ${arg}`);
      }
    }
  }

  if (files.length === 0) {
    console.error('No optimizable images found');
    process.exit(1);
  }

  console.log(`Transform: ${TRANSFORM}`);
  console.log(`Min size: ${formatBytes(MIN_SIZE_BYTES)}\n`);

  if (singleFileMode) {
    // Single file mode
    await optimizeFile(files[0], outputPath, false);
  } else {
    // Batch mode
    console.log(`Processing ${files.length} image(s)\n`);

    let totalOriginal = 0;
    let totalSaved = 0;
    let optimizedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const filePath of files) {
      try {
        const result = await optimizeFile(filePath, filePath, true);

        if (result.status === 'optimized') {
          optimizedCount++;
          totalOriginal += result.inputSize;
          totalSaved += result.savedBytes;
        } else if (result.status === 'skipped') {
          skippedCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.log(`[ERROR] ${basename(filePath)}: ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('Summary:');
    console.log(`  Optimized: ${optimizedCount} files`);
    console.log(`  Skipped: ${skippedCount} files`);
    console.log(`  Errors: ${errorCount} files`);
    if (optimizedCount > 0) {
      const savedPercent = Math.round((totalSaved / totalOriginal) * 100);
      console.log(`  Space saved: ${formatBytes(totalSaved)} (${savedPercent}%)`);
    }
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
