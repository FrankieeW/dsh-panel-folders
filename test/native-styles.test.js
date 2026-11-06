import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

function environment() {
  const styles = [];
  const document = {
    querySelector(selector) {
      const id = JSON.parse(selector.slice('style[data-plugin-css='.length, -1));
      return styles.find(style => style.dataset.pluginCss === id) ?? null;
    },
    createElement() { return { dataset: {}, textContent: '' }; },
    head: { appendChild(style) { styles.push(style); } },
  };
  const window = { __ModuleLoader__: { load(entry) { this.entry = entry; } } };
  return { styles, document, window };
}

function loadFactory(source, env) {
  runInNewContext(source, { document: env.document, window: env.window });
  // The factory defines components without rendering them; its imports are not
  // called until apply/render. A stub is enough to observe its CSS injection.
  env.window.__ModuleLoader__.entry.factory(() => ({}));
}

test('embedded native CSS stays intact when native sidebar styles are removed', () => {
  execFileSync(process.execPath, ['scripts/build.mjs']);
  const upstream = readFileSync(new URL(import.meta.resolve('@deepseek-ai/dsh-client-ui-sidebar/client')), 'utf8');
  const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  const env = environment();
  loadFactory(upstream, env);
  const nativeStyles = env.styles.map(style => style.textContent);
  assert.equal(nativeStyles.length, 2);
  loadFactory(bundle, env);
  const finderStyles = env.styles.filter(style => style.dataset.plugin === 'dsh-panel-folders');
  assert.equal(finderStyles.length, 2);
  assert.deepEqual(finderStyles.map(style => style.textContent), nativeStyles);
  const remaining = env.styles.filter(style => style.dataset.plugin !== '@deepseek-ai/dsh-client-ui-sidebar');
  assert.deepEqual(remaining, finderStyles);
  assert.ok(remaining.some(style => style.textContent.includes('_panelList')));
});
