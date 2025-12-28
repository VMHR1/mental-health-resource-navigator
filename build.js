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
  const staticFiles = [
    'index.html',
    'admin.html',
    'program.html',
    'submit.html',
    'styles.css',
    'security.js',
    'sw.js',
    'programs.json'
  ];
  
  // Ensure dist directory exists
  if (!existsSync('dist')) {
    mkdirSync('dist', { recursive: true });
  }
  
  // Copy static files
  staticFiles.forEach(file => {
    if (existsSync(file)) {
      writeFileSync(join('dist', file), readFileSync(file, 'utf8'));
    }
  });
  
  // Copy program-detail.js if it exists
  if (existsSync('js/program-detail.js')) {
    if (!existsSync('dist/js')) {
      mkdirSync('dist/js', { recursive: true });
    }
    writeFileSync(join('dist/js', 'program-detail.js'), readFileSync('js/program-detail.js', 'utf8'));
  }
  
  console.log('Static assets copied');
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
  const files = [
    'js/config/constants.js',
    'js/utils/helpers.js',
    'js/modules/storage.js',
    'js/modules/search.js',
    'js/state-manager.js',
    'js/data-validator.js'
  ];
  
  let bundle = '';
  files.forEach(file => {
    if (existsSync(file)) {
      bundle += readFileSync(file, 'utf8') + '\n\n';
    }
  });
  
  writeFileSync('js/bundle.js', bundle);
  console.log('Legacy bundle created');
}

build().then(() => {
  if (!isWatch) {
    createLegacyBundle();
  }
});



