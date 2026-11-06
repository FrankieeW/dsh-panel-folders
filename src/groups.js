export const STORAGE_KEY = 'dsh-finder:groups:v1';
const empty = () => ({ version: 1, groups: [] });

export function normalizeState(value) {
  if (value?.version !== 1 || !Array.isArray(value.groups)) return empty();
  const groups = [];
  const ids = new Set();
  const entries = new Set(['plugins']); // Keep plugin administration reachable.
  for (const group of value.groups) {
    if (!group || typeof group.id !== 'string' || !group.id || ids.has(group.id) || typeof group.name !== 'string' || !group.name.trim()) continue;
    ids.add(group.id);
    groups.push({
      id: group.id, name: group.name.trim().slice(0, 60), collapsed: group.collapsed !== false,
      entries: (Array.isArray(group.entries) ? group.entries : []).filter(id => {
        if (typeof id !== 'string' || !id || entries.has(id)) return false;
        entries.add(id);
        return true;
      }),
    });
  }
  return { version: 1, groups };
}

export function assignEntry(state, entryId, groupId) {
  if (entryId === 'plugins' || (groupId && !state.groups.some(group => group.id === groupId))) return state;
  return { ...state, groups: state.groups.map(group => ({
    ...group,
    entries: group.id === groupId
      ? [...group.entries.filter(id => id !== entryId), entryId]
      : group.entries.filter(id => id !== entryId),
  })) };
}

export function createGroupStore(storage, events) {
  const listeners = new Set();
  let state = empty();
  let warning = '';
  function load(raw) {
    try { state = raw === null ? empty() : normalizeState(JSON.parse(raw)); }
    catch { state = empty(); warning = '分组配置无法读取，当前显示未分组入口。'; }
  }
  try { load(storage.getItem(STORAGE_KEY)); }
  catch { warning = '本地存储不可用，分组仅在当前页面保留。'; }
  let snapshot = { state, warning };
  function publish() {
    snapshot = { state, warning };
    for (const listener of listeners) listener();
  }
  const onStorage = event => {
    if ((event.key === STORAGE_KEY || event.key === null) && (!event.storageArea || event.storageArea === storage)) {
      warning = '';
      load(event.key === null ? null : event.newValue);
      publish();
    }
  };
  events?.addEventListener('storage', onStorage);
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update(change) {
      state = normalizeState(change(state));
      try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); warning = ''; }
      catch { warning = '保存失败：分组仅在当前页面保留，刷新后可能丢失。'; }
      publish();
    },
    dispose() { events?.removeEventListener('storage', onStorage); listeners.clear(); },
  };
}
