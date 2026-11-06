import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);

/** Bundle actual public components in memory; never load auth or network data. */
export async function openDialogFixture(t, fixture, width = 640, { now } = {}) {
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  const files = new Map();
  const compiler = webpack({
    mode: 'development', devtool: false, cache: false,
    entry: path.resolve(fixture),
    output: { path: path.resolve('node_modules/.cache/whatsapp-review'), filename: 'dialog-in-memory.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
    module: { rules: [
      { test: /\.tsx?$/, exclude: /node_modules/, use: path.resolve('tests/helpers/whatsapp-header-loader.cjs') },
      { test: /\.module\.css$/, use: path.resolve('tests/helpers/whatsapp-dialog-style.cjs') },
    ] },
    optimization: { minimize: false },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) })],
  });
  compiler.outputFileSystem = {
    mkdir: (_path, options, callback) => (callback || options)(null),
    writeFile: (name, data, callback) => { files.set(name, data.toString()); callback(null); },
    stat: (_path, callback) => callback(Object.assign(new Error('Not emitted'), { code: 'ENOENT' })),
  };
  try {
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      if (error) reject(error);
      else if (stats.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
      else resolve();
    }));
  } finally { await new Promise(resolve => compiler.close(resolve)); }
  const globals = path.resolve('app/globals.css');
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(readFileSync(globals, 'utf8'), { from: globals })).css.replace(/@font-face\s*\{[^}]*\}/g, '');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  page.setDefaultTimeout(2500);
  if (now !== undefined) await page.clock.install({ time: now });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { external.push(route.request().url()); return route.abort(); });
  const assets = [...files];
  await page.setContent(`<!doctype html><html lang="es"><head><style>${css}\n${assets.filter(([name]) => name.endsWith('.css')).map(([, text]) => text).join('\n')}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: assets.filter(([name]) => name.endsWith('.js')).map(([, text]) => text).join('\n') });
  return { page, errors, external };
}
