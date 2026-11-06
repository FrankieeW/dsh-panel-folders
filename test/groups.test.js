import test from 'node:test';
import assert from 'node:assert/strict';
import { assignEntry, createGroupStore, normalizeState, STORAGE_KEY } from '../src/groups.js';

const state = () => ({ version: 1, groups: [
  { id: 'leisure', name: '摸鱼工具', collapsed: true, entries: ['music', 'games'] },
  { id: 'work', name: '工作', collapsed: false, entries: ['terminal'] },
] });
function memory(initial = null) {
  let value = initial;
  return { getItem: () => value, setItem(key, next) { assert.equal(key, STORAGE_KEY); value = next; } };
}

test('moving an entry leaves exactly one owner; ungrouping restores its launcher', () => {
  const moved = assignEntry(state(), 'music', 'work');
  assert.deepEqual(moved.groups.map(group => group.entries), [['games'], ['terminal', 'music']]);
  const removed = assignEntry(moved, 'music', '');
  assert.deepEqual(removed.groups.map(group => group.entries), [['games'], ['terminal']]);
  assert.deepEqual(assignEntry(moved, 'terminal', 'missing'), moved);
});

test('invalid stored memberships cannot duplicate or hide plugin administration', () => {
  const input = state();
  input.groups[0].entries.push('plugins', 'music', null);
  input.groups[1].entries.push('music');
  input.groups.push(null, { id: 'work', name: 'duplicate', entries: ['other'] });
  assert.deepEqual(normalizeState(input), state());
  assert.deepEqual(normalizeState({ version: 2, groups: input.groups }).groups, []);
});

test('group deletion releases membership; persisted folds and missing plugins survive reopening', () => {
  const storage = memory(JSON.stringify(state()));
  const store = createGroupStore(storage);
  store.update(value => ({ ...value, groups: value.groups.filter(group => group.id !== 'leisure') }));
  assert.deepEqual(createGroupStore(storage).getSnapshot().state.groups, [state().groups[1]]);
  store.update(() => state());
  assert.deepEqual(createGroupStore(storage).getSnapshot().state, state());
});

test('malformed and inaccessible storage do not hide launchers or prevent in-memory changes', () => {
  const corrupt = createGroupStore(memory('{'));
  assert.deepEqual(corrupt.getSnapshot().state.groups, []);
  assert.match(corrupt.getSnapshot().warning, /无法读取/);
  const denied = createGroupStore({ getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } });
  denied.update(() => state());
  assert.deepEqual(denied.getSnapshot().state, state());
  assert.match(denied.getSnapshot().warning, /保存失败/);
});

test('other windows update group ownership and clearing storage restores all launchers', () => {
  let listener;
  let detached = false;
  const events = { addEventListener(name, fn) { listener = fn; }, removeEventListener(name, fn) { detached = fn === listener; } };
  const storage = memory();
  const store = createGroupStore(storage, events);
  listener({ key: STORAGE_KEY, newValue: JSON.stringify(state()), storageArea: storage });
  assert.deepEqual(store.getSnapshot().state, state());
  listener({ key: null, newValue: null, storageArea: storage });
  assert.deepEqual(store.getSnapshot().state.groups, []);
  store.dispose();
  assert.equal(detached, true);
});
