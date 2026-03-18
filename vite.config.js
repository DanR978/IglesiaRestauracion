// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { existsSync, cpSync, mkdirSync } from 'fs';

// Auto-discover all page HTML files
function discoverPages(root) {
  const pages = { main: resolve(root, 'index.html') };

  const pageDirs = [
    'donacion', 'eventos', 'linktree', 'poliza-de-privacidad',
    'proximos-pasos', 'quienes-somos', 'visitanos'
  ];

  for (const dir of pageDirs) {
    const htmlPath = resolve(root, dir, 'index.html');
    if (existsSync(htmlPath)) {
      pages[dir] = htmlPath;
    }
  }

  return pages;
}

// Simple plugin to copy static directories that are fetched at runtime
// (HTML partials, images, etc. that Vite doesn't see in import graphs)
function copyStaticDirs(dirs) {
  return {
    name: 'copy-static-dirs',
    closeBundle() {
      for (const dir of dirs) {
        const src = resolve('.', dir);
        const dest = resolve('dist', dir);
        if (existsSync(src)) {
          mkdirSync(dest, { recursive: true });
          cpSync(src, dest, { recursive: true });
          console.log(`  Copied ${dir}/ → dist/${dir}/`);
        }
      }
    },
  };
}

export default defineConfig({
  root: '.',

  build: {
    outDir: 'dist',
    emptyOutDir: true,

    rollupOptions: {
      input: discoverPages('.'),
    },

    // CSS @imports are automatically resolved, concatenated, and minified
    cssMinify: true,
    minify: 'terser',
    sourcemap: true,
  },

  plugins: [
    // These dirs are loaded at runtime via fetch(), not import — Vite
    // doesn't see them in the dependency graph, so we copy them manually.
    copyStaticDirs([
      'src',           // HTML partials (header.html, footer.html, etc.)
      'resources',     // images, verses JSON, icons
      'admin',         // admin panel if any
      'seo',           // SEO files
    ]),
  ],

  server: {
    port: 3000,
    open: true,
  },

  resolve: {
    alias: {
      '/css': resolve(process.cwd(), 'css'),
      '/js': resolve(process.cwd(), 'js'),
      '/src': resolve(process.cwd(), 'src'),
    },
  },
});