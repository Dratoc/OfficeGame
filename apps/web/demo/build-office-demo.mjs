// Bundles the offline Office Battle practice into one self-contained HTML file.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, 'office-practice.html');
const res = await build({ entryPoints: [join(here, 'office-practice.ts')], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020' });
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const html = readFileSync(join(here, 'office-practice.html.tpl'), 'utf8').replace('/*BUNDLE*/', () => js);
writeFileSync(out, html);
console.log(`${out} (${Math.round(html.length / 1024)} KB)`);
