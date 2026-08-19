#!/usr/bin/env node
// ========== Build Script ==========
// Simple build process for code splitting, minification, and optimization

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { applyCspToHtml } from './csp-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWatch = process.argv.includes('--watch');
const shouldMinify = process.argv.includes('--minify') || process.env.NODE_ENV === 'production';

const buildOptions = {
  entryPoints: [
    'src/app.js',
    'src/js/modules/search.js',
    'src/js/modules/empty-state.js',
    'src/js/modules/storage.js',
    'src/js/utils/helpers.js',
    'src/js/utils/location-match.js',
    'src/js/config/constants.js',
    'src/js/config/validation-schema.js',
    'src/js/state-manager.js',
    'src/js/data-validator.js'
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
    // HTML files from src/html
    const includeAdmin = process.env.INCLUDE_ADMIN === '1';
    const htmlFiles = [
      { src: 'src/html/index.html', dest: 'index.html', csp: 'standard' },
      ...(includeAdmin ? [{ src: 'src/html/admin.html', dest: 'admin.html', csp: 'admin' }] : []),
      { src: 'src/html/program.html', dest: 'program.html', csp: 'eval' },
      { src: 'src/html/submit.html', dest: 'submit.html', csp: 'submit' },
      { src: 'src/html/guides.html', dest: 'guides.html', csp: 'standard' },
      { src: 'src/html/directory.html', dest: 'directory.html', csp: 'standard' },
      { src: 'src/html/about.html', dest: 'about.html', csp: 'eval' },
      { src: 'src/html/privacy.html', dest: 'privacy.html', csp: 'eval' },
      { src: 'src/html/terms.html', dest: 'terms.html', csp: 'eval' },
      { src: 'src/html/professionals.html', dest: 'professionals.html', csp: 'standard' },
      { src: 'src/html/boards.html', dest: 'boards.html', csp: 'standard' },
      { src: 'src/html/report-outdated.html', dest: 'report-outdated.html', csp: 'standard' },
      { src: 'src/html/regional-snapshot.html', dest: 'regional-snapshot.html', csp: 'standard' },
      { src: 'src/html/changelog.html', dest: 'changelog.html', csp: 'standard' },
      { src: 'src/html/export.html', dest: 'export.html', csp: 'standard' },
      { src: 'src/html/handoff.html', dest: 'handoff.html', csp: 'standard' },
      { src: 'src/html/404.html', dest: '404.html', csp: 'standard' }
    ];
    if (!includeAdmin) {
      const adminDist = join('dist', 'admin.html');
      if (existsSync(adminDist)) {
        unlinkSync(adminDist);
      }
      console.log('Note: admin.html excluded from build (set INCLUDE_ADMIN=1 to include)');
    }
    
    // Static assets from public
    const staticFiles = [
      { src: 'public/styles.css', dest: 'styles.css' },
      { src: 'public/phase1-design.css', dest: 'phase1-design.css' },
      { src: 'public/security.js', dest: 'security.js' },
      { src: 'public/sw.js', dest: 'sw.js' },
      { src: 'public/site.webmanifest', dest: 'site.webmanifest' },
      { src: 'public/favicon.ico', dest: 'favicon.ico' },
      { src: 'public/icon.png', dest: 'icon.png' },
      { src: 'public/icon-192.png', dest: 'icon-192.png' },
      { src: 'public/icon.svg', dest: 'icon.svg' },
      { src: 'public/brand-mark.svg', dest: 'brand-mark.svg' },
      { src: 'public/robots.txt', dest: 'robots.txt' },
      { src: 'public/sitemap.xml', dest: 'sitemap.xml' },
      { src: 'public/data/programs.json', dest: 'programs.json' },
      { src: 'public/data/programs.geocoded.json', dest: 'programs.geocoded.json' },
      // Keep dist/data in sync for any legacy paths or tooling that reference it
      { src: 'public/data/programs.json', dest: 'data/programs.json' },
      { src: 'public/data/programs.geocoded.json', dest: 'data/programs.geocoded.json' },
      // Professional navigator layer data
      { src: 'public/data/resource_boards.json', dest: 'data/resource_boards.json' },
      { src: 'public/data/handoff_copy.json', dest: 'data/handoff_copy.json' },
      { src: 'public/data/regional_gap_snapshot.json', dest: 'data/regional_gap_snapshot.json' },
      { src: 'public/data/verification_changelog.json', dest: 'data/verification_changelog.json' },
      { src: 'public/data/export_schema.json', dest: 'data/export_schema.json' },
      { src: 'public/data/pro_gate.json', dest: 'data/pro_gate.json' },
      { src: 'public/data/pro_gate.json', dest: 'pro_gate.json' },
      // Phase 9B data files
      { src: 'public/data/scenario_taxonomy.json', dest: 'data/scenario_taxonomy.json' },
      { src: 'public/data/handoff_readiness_rules.json', dest: 'data/handoff_readiness_rules.json' },
      { src: '_redirects', dest: '_redirects' },
      { src: '_headers', dest: '_headers' }
    ];
    
    // Ensure dist directory exists
    if (!existsSync('dist')) {
      mkdirSync('dist', { recursive: true });
    }

    // Collected so a failed copy fails the build instead of silently shipping
    // an incomplete dist.
    const copyErrors = [];

    // Copy HTML files
    let copiedCount = 0;
    htmlFiles.forEach(({ src, dest, csp }) => {
      if (existsSync(src)) {
        try {
          let html = readFileSync(src, 'utf8');
          html = applyCspToHtml(html, csp || 'standard');
          const destPath = join('dist', dest);
          mkdirSync(dirname(destPath), { recursive: true });
          writeFileSync(destPath, html);
          copiedCount++;
        } catch (error) {
          console.error(`Error copying ${src}:`, error.message);
          copyErrors.push(`${src} -> ${dest}: ${error.message}`);
        }
      } else {
        console.warn(`Warning: ${src} not found, skipping`);
      }
    });
    
    // Copy static files
    staticFiles.forEach(({ src, dest }) => {
      if (existsSync(src)) {
        try {
          // Nested destinations (data/*.json) need their directory created first.
          // Without this every data/ copy fails with ENOENT on a clean build,
          // and because the error was only logged the build still exited 0 —
          // shipping a dist with no data files.
          const destPath = join('dist', dest);
          mkdirSync(dirname(destPath), { recursive: true });
          writeFileSync(destPath, readFileSync(src, 'utf8'));
          copiedCount++;
        } catch (error) {
          console.error(`Error copying ${src}:`, error.message);
          copyErrors.push(`${src} -> ${dest}: ${error.message}`);
        }
      } else {
        console.warn(`Warning: ${src} not found, skipping`);
      }
    });
    
    // Copy js directory files
    const jsFiles = [
      'src/js/program-detail.js',
      'src/js/submit.js',
      'src/js/modules/distance.js',
      'src/js/modules/filters.js',
      'src/js/modules/sort.js',
      'src/js/modules/performance.js',
      'src/js/modules/product-metrics.js',
      'src/js/modules/render.js',
      'src/js/modules/events.js',
      'src/js/modules/home-phase1.js',
      'src/js/modules/flow-motion.js',
      'src/js/modules/flow-scroll.js',
      // Professional Navigator Layer modules
      'src/js/modules/pro-gate.js',
      'src/js/modules/pro-events.js',
      'src/js/modules/navigator-mode.js',
      'src/js/modules/navigator-presets.js',
      'src/js/modules/match-explain.js',
      'src/js/modules/friction-flags.js',
      'src/js/modules/handoff-completeness.js',
      'src/js/modules/handoff-print.js',
      // Phase 9C/9D modules
      'src/js/modules/scenario-state.js',
      'src/js/modules/handoff-builder.js',
      'src/js/modules/handoff-workspace.js',
      'src/js/modules/handoff-readiness.js',
      'src/js/modules/intake-confidence.js',
      'src/js/modules/handoff-catalog.js',
      'src/js/modules/export-center.js',
      'src/js/modules/report-outdated.js',
      'src/js/utils/location-match.js'
    ];
    
    jsFiles.forEach(file => {
      if (existsSync(file)) {
        // Create dist/js structure matching source (remove src/js/ prefix)
        const relativePath = file.replace(/^src\/js\//, '');
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
    
    // Copy data/regions directory if it exists
    const regionsDir = 'public/data/regions';
    if (existsSync(regionsDir)) {
      const distRegionsDir = join('dist', 'data', 'regions');
      if (!existsSync(distRegionsDir)) {
        mkdirSync(distRegionsDir, { recursive: true });
      }
      
      const regionFiles = readdirSync(regionsDir);
      regionFiles.forEach(file => {
        const srcPath = join(regionsDir, file);
        const distPath = join(distRegionsDir, file);
        if (statSync(srcPath).isFile()) {
          try {
            copyFileSync(srcPath, distPath);
            copiedCount++;
          } catch (error) {
            console.error(`Error copying ${srcPath}:`, error.message);
          }
        }
      });
    }
    
    console.log(`Static assets copied (${copiedCount} files)`);

    // A copy failure means the deployed site is missing a file it fetches at
    // runtime. Previously these were logged and ignored, so the build exited 0
    // and shipped a dist whose pro pages could never render.
    if (copyErrors.length > 0) {
      throw new Error(
        `${copyErrors.length} static asset(s) failed to copy:\n  ${copyErrors.join('\n  ')}`,
      );
    }
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
    
    // Run filter validation in dev mode (non-production)
    if (!shouldMinify) {
      console.log('\nRunning filter validation...');
      try {
        const { spawn } = await import('child_process');
        
        const validationProcess = spawn('node', ['validate-filters.js'], {
          cwd: __dirname,
          stdio: 'inherit',
          shell: false
        });
        
        await new Promise((resolve, reject) => {
          validationProcess.on('close', (code) => {
            if (code === 0) {
              console.log('✓ Filter validation passed\n');
              resolve();
            } else {
              console.warn(`⚠ Filter validation failed with code ${code}`);
              console.warn('Continuing with build (validation is non-blocking in dev mode)...\n');
              resolve(); // Don't fail the build, just warn
            }
          });
          validationProcess.on('error', (err) => {
            console.warn('Warning: Filter validation could not run:', err.message);
            console.warn('Continuing with build...\n');
            resolve(); // Don't fail the build if validation script doesn't exist
          });
        });
      } catch (validationError) {
        console.warn('Warning: Filter validation failed or could not run:', validationError.message);
        console.warn('Continuing with build...\n');
      }
    }
    
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

// Main execution with proper error handling
build()
  .then(async () => {
    if (!isWatch) {
      // Intentionally NOT wrapped in a warn-and-continue try/catch: a thrown
      // error here (e.g. a missing head/body marker in dist/program.html)
      // means program pages would ship broken or unrendered, so it must fail
      // the build rather than silently regress to the old loading-shell pages.
      const { generateProgramPages } = await import('./generate-program-pages.js');
      generateProgramPages();
    }
    console.log('Build process completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Build process failed:', error);
    process.exit(1);
  });



