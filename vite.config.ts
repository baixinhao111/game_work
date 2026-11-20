import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** 构建经典 IIFE 产物后生成小工具规范入口 dist/index.html（无 type="module"、纯相对路径） */
function emitMiniToolHtml(): Plugin {
  return {
    name: 'emit-minitool-html',
    apply: 'build',
    closeBundle() {
      const srcHtmlPath = resolve(__dirname, 'index.html');
      const distHtmlPath = resolve(__dirname, 'dist/index.html');
      let html = readFileSync(srcHtmlPath, 'utf-8');
      html = html.replace(/<link[^>]*href="\/src\/styles\/main\.css"[^>]*>\s*/g, '');
      html = html.replace(/\s+crossorigin(?:="[^"]*")?/g, '');
      html = html.replace('</head>', '    <link rel="stylesheet" href="./style.css" />\n  </head>');
      html = html.replace(
        /<script[^>]*src="\/src\/main\.ts"[^>]*><\/script>/,
        '<script defer src="./app.js"></script>'
      );
      writeFileSync(distHtmlPath, html, 'utf-8');
    }
  };
}

export default defineConfig(({ command }) => {
  if (command === 'build') {
    return {
      base: './',
      build: {
        emptyOutDir: true,
        target: ['es2017', 'chrome61'],
        cssTarget: 'chrome61',
        sourcemap: false,
        minify: 'esbuild',
        lib: {
          entry: 'src/main.ts',
          formats: ['iife'],
          name: 'MondayBreakoutApp',
          fileName: () => 'app.js',
          cssFileName: 'style'
        }
      },
      plugins: [emitMiniToolHtml()]
    };
  }

  return {
    base: './',
    server: {
      host: true,
      port: 5173
    }
  };
});
