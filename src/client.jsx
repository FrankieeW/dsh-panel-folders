import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useModalLayer } from '@deepseek-ai/dsh-client-ui-primitives';
import native from 'native-sidebar';
import { assignEntry, createGroupStore } from './groups.js';
import css from './style.css';

export const inject = native.inject;

function FolderIcon({ size = 16, open = false }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={open ? 'M3 9V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2M3 9h18l-3 11H5L3 9Z' : 'M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3V7Z'} /></svg>;
}

function GroupEditor({ group, store }) {
  const [name, setName] = useState(group.name);
  useEffect(() => setName(group.name), [group.name]);
  return <form className="df-group-editor" onSubmit={event => {
    event.preventDefault();
    if (name.trim()) store.update(state => ({ ...state, groups: state.groups.map(item => item.id === group.id ? { ...item, name: name.trim() } : item) }));
  }}>
    <input aria-label={`分组名称：${group.name}`} value={name} maxLength={60} required onChange={event => setName(event.target.value)} />
    <button type="submit" disabled={!name.trim() || name.trim() === group.name}>重命名</button>
    <button type="button" onClick={() => store.update(state => ({ ...state, groups: state.groups.filter(item => item.id !== group.id) }))}>删除分组 <span className="df-sr">{group.name}</span></button>
  </form>;
}

function GroupManager({ panels, store, snapshot, onClose }) {
  const dialog = useRef(null);
  const heading = useId();
  const [name, setName] = useState('');
  const { state, warning } = snapshot;
  useModalLayer(dialog, true, () => dialog.current?.close());
  useEffect(() => { dialog.current.showModal(); }, []);
  const membership = new Map(state.groups.flatMap(group => group.entries.map(id => [id, group.id])));
  const known = new Set(panels.map(panel => panel.id));
  const missing = [...membership.keys()].filter(id => !known.has(id)).map(id => ({ id, label: `${id}（未加载）` }));
  return createPortal(<dialog ref={dialog} className="df-dialog" role="dialog" aria-modal="true" data-shortcut-modal="dsh-finder-groups" aria-labelledby={heading} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) dialog.current.close(); }}>
    <header><div><h2 id={heading}>管理侧栏分组</h2><p>把工具入口收进文件夹，平时折叠起来。</p></div><button type="button" aria-label="关闭分组管理" onClick={() => dialog.current.close()}>×</button></header>
    {warning && <p role="alert" className="df-warning">{warning}</p>}
    <form className="df-create" onSubmit={event => {
      event.preventDefault();
      if (!name.trim()) return;
      store.update(value => ({ ...value, groups: [...value.groups, { id: crypto.randomUUID(), name: name.trim(), collapsed: true, entries: [] }] }));
      setName('');
    }}>
      <label htmlFor={`${heading}-new`}>新建分组</label>
      <div><input autoFocus data-modal-autofocus id={`${heading}-new`} placeholder="例如：摸鱼工具" value={name} maxLength={60} required onChange={event => setName(event.target.value)} /><button type="submit" disabled={!name.trim()}>创建分组</button></div>
    </form>
    {state.groups.length > 0 && <section aria-label="已有分组"><h3>已有分组</h3>{state.groups.map(group => <GroupEditor key={group.id} group={group} store={store} />)}<p className="df-hint">删除分组只还原侧栏入口，不会卸载工具。</p></section>}
    <section aria-label="入口归属"><h3>入口归属</h3>
      {panels.length === 0 && <p className="df-hint">暂无已注册的面板入口。</p>}
      {[...panels, ...missing].filter(panel => panel.id !== 'plugins').map(panel => <label className="df-assignment" key={panel.id}><span title={panel.id}>{panel.label}</span><select aria-label={`${panel.label}的分组`} value={membership.get(panel.id) ?? ''} onChange={event => store.update(value => assignEntry(value, panel.id, event.target.value))}><option value="">不分组</option>{state.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>)}
      <p className="df-hint">插件管理保留在原位置；这里只管理左侧全局面板入口，不包含会话与右侧栏。</p>
    </section>
  </dialog>, document.body);
}

function GroupNavigation({ panels, props, store, snapshot, managing, setManaging, wide, expandSidebar }) {
  const { state, warning } = snapshot;
  const byId = new Map(panels.map(panel => [panel.id, panel]));
  const active = props.usePanelInfo(info => info.activePanelId);
  const root = useId();
  return <div className={`df-navigation${wide ? '' : ' df-rail'}`}>
    <nav aria-label="工具分组">
      {state.groups.map(group => {
        const entries = group.entries.map(id => byId.get(id)).filter(Boolean);
        const selected = entries.some(entry => entry.id === active);
        const controls = `${root}-${group.id}`;
        return <div key={group.id} className="df-group">
          <button className={`df-row df-folder${selected ? ' df-active' : ''}`} type="button" title={group.name} aria-label={group.name} aria-expanded={wide && !group.collapsed} aria-controls={controls} onClick={() => {
            if (!wide) expandSidebar();
            store.update(value => ({ ...value, groups: value.groups.map(item => item.id === group.id ? { ...item, collapsed: wide ? !item.collapsed : false } : item) }));
          }}>
            <FolderIcon open={wide && !group.collapsed} />{wide && <><span className="df-label">{group.name}</span><span className="df-count">{entries.length}</span><span aria-hidden="true" className="df-chevron">{group.collapsed ? '›' : '⌄'}</span></>}
            {selected && <span className="df-sr">，包含当前面板</span>}
          </button>
          <div id={controls} hidden={!wide || group.collapsed} className="df-children">
            {entries.length === 0 && <p className="df-hint">暂无已加载入口</p>}
            {entries.map(entry => <button type="button" key={entry.id} className={`df-row${entry.id === active ? ' df-active' : ''}`} aria-current={entry.id === active ? 'page' : undefined} title={entry.label} onClick={() => props.selectPanel(entry.id)}>
              <span className="df-glyph" aria-hidden="true">{props.renderSlot('sidebar.panellist', { size: 16, active: entry.id === active }, { only: entry.id })}</span><span className="df-label">{entry.label}</span>
            </button>)}
          </div>
        </div>;
      })}
      <button type="button" className="df-row df-manage" title="管理侧栏分组" aria-label="管理侧栏分组" aria-haspopup="dialog" onClick={() => setManaging(true)}><FolderIcon />{wide && <span className="df-label">管理分组</span>}</button>
    </nav>
    {wide && warning && <p className="df-warning" role="alert">{warning}</p>}
    {managing && <GroupManager panels={panels} store={store} snapshot={snapshot} onClose={() => setManaging(false)} />}
  </div>;
}

function composeSidebar(NativeSidebar, store) {
  return function FinderSidebar(props) {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const panels = props.usePanels(value => value);
    const [managing, setManaging] = useState(false);
    const grouped = new Set(snapshot.state.groups.flatMap(group => group.entries));
    return <NativeSidebar {...props}
      usePanels={selector => props.usePanels(value => selector(value.filter(panel => !grouped.has(panel.id))))}
      renderSlot={(slot, owner, options) => slot === 'sidebar.workspaces'
        ? <><GroupNavigation panels={panels} props={props} store={store} snapshot={snapshot} managing={managing} setManaging={setManaging} wide={owner.wide} expandSidebar={owner.expandSidebar} />{props.renderSlot(slot, owner, options)}</>
        : props.renderSlot(slot, owner, options)} />;
  };
}

export function apply(ctx) {
  // Access to localStorage itself can throw under browser storage policies.
  let storage;
  try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error('Storage unavailable'); }, setItem() { throw new Error('Storage unavailable'); } }; }
  const store = createGroupStore(storage, window);
  ctx.effect(() => () => store.dispose());
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = '@frankieew/dsh-finder'; style.textContent = css;
    document.head.appendChild(style);
    return () => style.remove();
  });
  // Compose at registration time, keeping the upstream slot declarations,
  // inject factories, layout, focus management and lifecycle intact.
  const slots = new Proxy(ctx.slots, {
    get(target, key) {
      if (key === 'register') return (options, Component) => target.register(options, options.name === 'sidebar' ? composeSidebar(Component, store) : Component);
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return native.apply(new Proxy(ctx, { get(target, key) { return key === 'slots' ? slots : Reflect.get(target, key); } }));
}
