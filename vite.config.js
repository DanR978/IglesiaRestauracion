// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { existsSync, cpSync, mkdirSync, readdirSync } from 'fs';

// Auto-discover all page HTML files
function discoverPages(root) {
  const pages = { main: resolve(root, 'index.html') };

  const pageDirs = [
    'donacion', 'eventos', 'linktree', 'poliza-de-privacidad',
    'proximos-pasos', 'quienes-somos', 'sermones', 'visitanos'
  ];

  for (const dir of pageDirs) {
    const htmlPath = resolve(root, dir, 'index.html');
    if (existsSync(htmlPath)) {
      pages[dir] = htmlPath;
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
      'admin',
      'seo',
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