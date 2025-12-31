#!/usr/bin/env node
// ========== Build Script ==========
// Simple build process for code splitting, minification, and optimization

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWatch = process.argv.includes('--watch');
const shouldMinify = process.argv.includes('--minify') || process.env.NODE_ENV === 'production';

const buildOptions = {
  entryPoints: [
    'app.js',
    'js/modules/search.js',
    'js/modules/storage.js',
    'js/utils/helpers.js',
    'js/config/constants.js',
    'js/state-manager.js',
    'js/data-validator.js'
  ],
  bundle: false,
  minify: shouldMinify,
  sourcemap: !shouldMinify,
  format: 'esm',
  target: 'es2020',
  outdir: 'dist',
  platform: 'browser',
  logLevel: 'info'
};

// Copy static assets to dist directory
function copyStaticAssets() {
  try {
    const staticFiles = [
      'index.html',
      'admin.html', // Protected by Cloudflare Access - safe to include in build
      'program.html',
      'submit.html',
      'styles.css',
      'security.js',
      'sw.js',
      'programs.json',
      'programs.geocoded.json',
      '_redirects',
      '_headers'
    ];
    
    // Ensure dist directory exists
    if (!existsSync('dist')) {
      mkdirSync('dist', { recursive: true });
    }
    
    // Copy static files
    let copiedCount = 0;
    staticFiles.forEach(file => {
      if (existsSync(file)) {
        try {
          writeFileSync(join('dist', file), readFileSync(file, 'utf8'));
          copiedCount++;
        } catch (error) {
          console.error(`Error copying ${file}:`, error.message);
        }
      } else {
        console.warn(`Warning: ${file} not found, skipping`);
      }
    });
    
    // Copy js directory files
    const jsFiles = [
      'js/program-detail.js',
      'js/modules/distance.js'
    ];
    
    jsFiles.forEach(file => {
      if (existsSync(file)) {
        // Create dist/js structure matching source
        const relativePath = file.replace(/^js\//, '');
        const distPath = join('dist', 'js', relativePath);
        const distDir = dirname(distPath);
        
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true });
      }
        
      try {
          writeFileSync(distPath, readFileSync(file, 'utf8'));
        copiedCount++;
      } catch (error) {
          console.error(`Error copying ${file}:`, error.message);
        }
      }
    });
    
    console.log(`Static assets copied (${copiedCount} files)`);
  } catch (error) {
    console.error('Error in copyStaticAssets:', error);
    throw error;
  }
}

async function build() {
  try {
    console.log('Building...');
    
    // Copy static assets first
    copyStaticAssets();
    
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('Watching for changes...');
    } else {
      await esbuild.build(buildOptions);
      console.log('Build complete!');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Also create a simple bundle for non-module environments
async function createLegacyBundle() {
  try {
    const files = [
      'js/config/constants.js',
      'js/utils/helpers.js',
      'js/modules/storage.js',
      'js/modules/search.js',
      'js/state-manager.js',
      'js/data-validator.js'
    ];
    
    let bundle = '';
    let filesFound = 0;
    
    files.forEach(file => {
      if (existsSync(file)) {
        try {
          bundle += readFileSync(file, 'utf8') + '\n\n';
          filesFound++;
        } catch (error) {
          console.error(`Error reading ${file}:`, error.message);
        }
      } else {
        console.warn(`Warning: ${file} not found, skipping`);
      }
    });
    
    if (bundle.length > 0) {
      // Ensure js directory exists in dist
      if (!existsSync('dist/js')) {
        mkdirSync('dist/js', { recursive: true });
      }
      
      // Write bundle to dist directory
      writeFileSync(join('dist/js', 'bundle.js'), bundle);
      console.log(`Legacy bundle created (${filesFound} files)`);
    } else {
      console.warn('Warning: No files found for legacy bundle');
    }
  } catch (error) {
    console.error('Error creating legacy bundle:', error);
    // Don't throw - legacy bundle is optional
    console.warn('Continuing without legacy bundle...');
  }
}

// Main execution with proper error handling
build()
  .then(async () => {
    if (!isWatch) {
      await createLegacyBundle();
    }
    console.log('Build process completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Build process failed:', error);
    process.exit(1);
  });



