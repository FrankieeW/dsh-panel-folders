import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// DSH publishes its client as a module-loader factory, not an ESM module.
// Capture that factory at build time; retain the upstream shell and shared React.
let factory;
const upstream = await readFile(new URL(import.meta.resolve('@deepseek-ai/dsh-client-ui-sidebar/client')), 'utf8');
runInNewContext(upstream, { window: { __ModuleLoader__: { load: entry => { factory = entry.factory; } } } });
if (!factory) throw new Error('Unsupported DSH sidebar client format');
// The original shell tags its CSS as belonging to ui-sidebar. That plugin is
// disabled by our patch, and its style cleanup must not remove our copy. Give
// the embedded styles their own owner and IDs, without changing the CSS itself.
const nativeOwner = '@deepseek-ai/dsh-client-ui-sidebar';
const finderOwner = '@frankieew/dsh-finder';
const nativeFactory = factory.toString();
const occurrences = nativeFactory.split(nativeOwner).length - 1;
if (occurrences !== 4) throw new Error(`Unsupported DSH sidebar CSS ownership: found ${occurrences} references`);
const ownedFactory = nativeFactory.replaceAll(nativeOwner, finderOwner);
const result = await build({
  entryPoints: ['src/client.jsx'], bundle: true, write: false,
  platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic',
  loader: { '.css': 'text' },
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@deepseek-ai/*'],
  plugins: [{
    name: 'native-sidebar',
    setup(builder) {
      builder.onResolve({ filter: /^native-sidebar$/ }, () => ({ path: 'native-sidebar', namespace: 'native' }));
      builder.onLoad({ filter: /.*/, namespace: 'native' }, () => ({ contents: `module.exports = (${ownedFactory})(require);`, loader: 'js' }));
    },
  }],
});
await mkdir('lib', { recursive: true });
await writeFile('lib/client.js', `window.__ModuleLoader__.load({id:'@frankieew/dsh-finder',factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`);
console.log('Built dsh-finder with the DSH 0.2.2-rc.1 sidebar shell.');
