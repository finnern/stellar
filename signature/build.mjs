// Bundles the app's pass prediction (with satellite.js) for Apps Script and assembles build/ for clasp push.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'build');

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
cpSync(join(here, 'src'), out, { recursive: true });

await build({
  stdin: {
    contents: "export { predictPasses, nextVisiblePass } from '../src/services/passPrediction';",
    resolveDir: here,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  globalName: 'Stellar', // Apps Script has no modules: exposed as a global to Code.js
  target: 'es2019',
  outfile: join(out, 'stellar.js'),
  legalComments: 'inline',
  plugins: [
    {
      // satellite.js re-exports its WebAssembly build (Node/browser only); the pure JS API is all we need
      name: 'no-satellite-wasm',
      setup(b) {
        b.onResolve({ filter: /\/wasm\/index\.js$/ }, () => ({ path: 'wasm', namespace: 'empty' }));
        b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
      },
    },
  ],
});
console.log('Built', out);
