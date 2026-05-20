// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { existsSync, cpSync, mkdirSync, readdirSync } from 'fs';

// Auto-discover all page HTML files (single + nested)
function discoverPages(root) {
  const pages = { main: resolve(root, 'index.html') };

  // Top-level page directories (each has index.html). Add new dirs here so
  // their JS gets bundled (and import.meta.env.VITE_* is substituted).
  const pageDirs = [
    'admin',
    'donacion',
    'eventos',
    'linktree',
    'poliza-de-privacidad',
    'proximos-pasos',
    'quienes-somos',
    'sermones',
    'visitanos',
    'discipulado',
    'galeria',
  ];

  // Nested page directories: <parent>/<child>/index.html
  const nestedPages = {
    discipulado: ['grupo'],
    galeria:     ['album'],
  };

  for (const dir of pageDirs) {
    const htmlPath = resolve(root, dir, 'index.html');
    if (existsSync(htmlPath)) {
      pages[dir] = htmlPath;
    }
    const children = nestedPages[dir] || [];
    for (const child of children) {
      const childPath = resolve(root, dir, child, 'index.html');
      if (existsSync(childPath)) {
        pages[`${dir}-${child}`] = childPath;
      }
    }
  }

  return pages;
}

// Copy static directories that Vite doesn't see in import graphs
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

// Plugin to rewrite /pagename → /pagename/index.html for MPA dev server
function mpaFallback() {
  return {
    name: 'mpa-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || '';

        if (url.includes('.')) return next();
        if (url === '/') return next();

        const clean = url.replace(/\/+$/, '');
        const indexPath = resolve('.', clean.slice(1), 'index.html');
        if (existsSync(indexPath)) {
          req.url = `${clean}/index.html`;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  root: '.',
  appType: 'mpa',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: discoverPages('.'),
    },
    cssMinify: true,
    minify: 'terser',
    sourcemap: true,
  },

  plugins: [
    mpaFallback(),
    copyStaticDirs([
      'src',
      'resources',
      'seo',
      // NOTE: 'admin', 'discipulado', 'galeria' are NOT copied here — they are
      // processed as Vite build inputs (see discoverPages) so their JS gets
      // bundled and import.meta.env.VITE_* values are substituted correctly.
    ]),
  ],

  server: {
    port: 3000,
    open: true,
    fs: {
      deny: [],
    },
  },

  resolve: {
    alias: {
      '/css': resolve(process.cwd(), 'css'),
      '/js': resolve(process.cwd(), 'js'),
      '/src': resolve(process.cwd(), 'src'),
    },
  },
});