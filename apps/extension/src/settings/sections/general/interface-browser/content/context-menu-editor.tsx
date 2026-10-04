import './context-menu-editor.css';
import { useContextMenuTreeDrop } from './context-menu-tree-drop';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type ContextMenuTree,
  createRecommendedContextMenuTree,
  parseContextMenuTree,
  resolveContextMenuTree,
} from '../../../../../contracts/settings/context-menu-layout';
import { translate } from '../../../../../platform/i18n';
import type { AppearanceSectionState } from './types';
import { buildContextMenuCatalog } from './context-menu-catalog';
import { ContextMenuCatalogPanel } from './context-menu-catalog-panel';
import { ContextMenuTreeView } from './context-menu-tree';
import { findContextMenuNode, removeContextMenuNode } from './context-menu-tree-model';
import { useContextMenuDraftPersistence } from './use-context-menu-draft-persistence';

const buttonClass = [
  'inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg',
  'border border-[var(--sniptale-color-border-soft)] px-3 py-1.5 text-sm',
  'hover:bg-[var(--sniptale-color-surface-hover)] focus-visible:outline-none',
  'focus-visible:ring-2 ',
  'disabled:cursor-not-allowed disabled:opacity-45',
].join(' ');

/** Disposable tree draft. Legacy projection is delayed until its dynamic inventories have loaded. */
type ContextMenuEditorState = Pick<
  AppearanceSectionState,
  | 'contextMenu'
  | 'contextMenuCatalogStatus'
  | 'contextMenuSettingsStatus'
  | 'contextMenuQuickActions'
  | 'contextMenuViewportPresets'
  | 'retryContextMenuCatalog'
  | 'retryContextMenuSettings'
  | 'locale'
  | 'updateContextMenu'
>;

function useContextMenuDraft(state: ContextMenuEditorState) {
  const { tree, loadTree, changeTree, status, announcement, setAnnouncement, save } =
    useContextMenuDraftPersistence(state);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const projectedSource = useRef<{
    settings: ContextMenuEditorState['contextMenu'];
    actions: ContextMenuEditorState['contextMenuQuickActions'];
    presets: ContextMenuEditorState['contextMenuViewportPresets'];
  } | null>(null);
  const actions = state.contextMenuQuickActions;
  const presets = state.contextMenuViewportPresets;
  const catalog = useMemo(
    () => buildContextMenuCatalog(actions, presets, state.locale),
    [actions, presets, state.locale]
  );
  useEffect(() => {
    if (
      state.contextMenuCatalogStatus !== 'ready' ||
      state.contextMenuSettingsStatus !== 'ready' ||
      (status !== 'ready' && status !== 'saved')
    )
      return;
    const source = projectedSource.current;
    if (
      !tree ||
      source?.settings !== state.contextMenu ||
      source.actions !== actions ||
      source.presets !== presets
    ) {
      const stored = resolveContextMenuTree(state.contextMenu, actions, presets);
      const next = loadTree(stored);
      setSelectedKey((current) => (current && findContextMenuNode(next, current) ? current : null));
      projectedSource.current = { settings: state.contextMenu, actions, presets };
    }
  }, [
    state.contextMenuCatalogStatus,
    state.contextMenuSettingsStatus,
    state.contextMenu,
    actions,
    presets,
    status,
    tree,
    loadTree,
  ]);
  const restore = () => {
    changeTree(createRecommendedContextMenuTree(actions, presets));
    setSelectedKey(null);
    setExpanded(new Set());
  };
  return {
    tree,
    setTree: changeTree,
    selectedKey,
    setSelectedKey,
    expanded,
    setExpanded,
    status,
    announcement,
    setAnnouncement,
    catalog,
    restore,
    save,
  };
}

function useContextMenuTransfers(
  draft: ReturnType<typeof useContextMenuDraft>,
  locale: ContextMenuEditorState['locale']
) {
  const { tree, catalog, expanded, setTree, setExpanded, setSelectedKey, setAnnouncement } = draft;
  const [focusRequest, setFocusRequest] = useState<{ key: string } | null>(null);
  const [removed, setRemoved] = useState<{
    before: ContextMenuTree;
    after: string;
    key: string;
    expanded: Set<string>;
  } | null>(null);
  const drag = useContextMenuTreeDrop({
    tree,
    catalog,
    locale: locale,
    expanded,
    onExpanded: setExpanded,
    onAnnounce: setAnnouncement,
    apply: (next, key) => {
      setTree(next);
      setSelectedKey(key);
      setFocusRequest({ key });
    },
    remove: (key) => {
      if (!tree) return;
      const next = removeContextMenuNode(tree, key, { preserveChildren: false });
      if (next === tree) return;
      setRemoved({ before: tree, after: JSON.stringify(next), key, expanded: new Set(expanded) });
      setTree(next);
      setSelectedKey(null);
      setAnnouncement(translate('settings.appearance.contextMenuReturned', locale));
    },
  });
  const undoRemoval = () => {
    if (!removed || JSON.stringify(tree) !== removed.after) return;
    setTree(removed.before);
    setExpanded(removed.expanded);
    setSelectedKey(removed.key);
    setFocusRequest({ key: removed.key });
    setRemoved(null);
    setAnnouncement(translate('settings.appearance.contextMenuReturnUndone', locale));
  };
  return {
    drag,
    focusRequest,
    setFocusRequest,
    undoRemoval,
    canUndo: !!removed && JSON.stringify(tree) === removed.after,
  };
}

export function ContextMenuEditor({ state }: { state: ContextMenuEditorState; visible?: boolean }) {
  const draft = useContextMenuDraft(state);
  const {
    tree,
    setTree,
    selectedKey,
    setSelectedKey,
    expanded,
    setExpanded,
    status,
    announcement,
    setAnnouncement,
    catalog,
    restore,
    save,
  } = draft;
  const { drag, focusRequest, setFocusRequest, undoRemoval, canUndo } = useContextMenuTransfers(
    draft,
    state.locale
  );
  const t = (key: Parameters<typeof translate>[0]) => translate(key, state.locale);
  if (
    state.contextMenuCatalogStatus !== 'ready' ||
    state.contextMenuSettingsStatus !== 'ready' ||
    !tree
  ) {
    const catalogFailed = state.contextMenuCatalogStatus === 'failed';
    const settingsFailed = state.contextMenuSettingsStatus === 'failed';
    const failed = catalogFailed || settingsFailed;
    return (
      <div className="py-4 text-sm" role={failed ? 'alert' : 'status'}>
        {t(
          catalogFailed
            ? 'settings.appearance.contextMenuCatalogFailed'
            : settingsFailed
              ? 'settings.appearance.contextMenuSettingsFailed'
              : 'settings.appearance.contextMenuCatalogLoading'
        )}
        {failed ? (
          <button
            type="button"
            className={`${buttonClass} ml-3`}
            onClick={catalogFailed ? state.retryContextMenuCatalog : state.retryContextMenuSettings}
          >
            {t('settings.appearance.contextMenuCatalogRetry')}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className="context-menu-editor min-w-0 space-y-3 pb-2 text-[var(--sniptale-color-text-primary)]"
      aria-busy={status === 'editing' || status === 'saving'}
    >
      <div
        ref={drag.rootRef}
        className={[
          'context-menu-workspace grid min-w-0 overflow-hidden rounded-xl border',
          'border-[var(--sniptale-color-border-soft)]',
          'lg:grid-cols-[minmax(0,1.6fr)_minmax(15rem,0.9fr)]',
        ].join(' ')}
      >
        <ContextMenuTreeView
          drop={drag.drop}
          tree={tree}
          catalog={catalog}
          locale={state.locale}
          selectedKey={selectedKey}
          focusRequest={focusRequest}
          onSelect={setSelectedKey}
          onChange={setTree}
          expanded={expanded}
          onExpanded={setExpanded}
          onAnnounce={setAnnouncement}
        />
        <div className="min-w-0 border-t border-[var(--sniptale-color-border-soft)] lg:border-l lg:border-t-0">
          <ContextMenuCatalogPanel
            dropActive={drag.catalogTarget}
            tree={tree}
            catalog={catalog}
            locale={state.locale}
            selectedKey={selectedKey}
            onChange={setTree}
            onSelect={(key) => {
              setSelectedKey(key);
              setFocusRequest({ key });
            }}
            onAnnounce={setAnnouncement}
            expanded={expanded}
            onExpanded={setExpanded}
          />
        </div>
      </div>
      {canUndo ? (
        <div className="flex items-center gap-3 text-sm" role="status">
          <span>{t('settings.appearance.contextMenuReturned')}</span>
          <button type="button" className={buttonClass} onClick={undoRemoval}>
            {t('settings.appearance.contextMenuUndoReturn')}
          </button>
        </div>
      ) : null}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {!parseContextMenuTree(tree) ? (
        <p role="alert" className="text-sm text-[var(--sniptale-color-danger)]">
          {t('settings.appearance.contextMenuInvalidName')}
        </p>
      ) : null}
      {status === 'failed' ? (
        <p role="alert" className="text-sm text-[var(--sniptale-color-danger)]">
          {t('settings.appearance.contextMenuSaveFailed')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {status === 'failed' ? (
          <button type="button" className={buttonClass} onClick={() => void save()}>
            {t('settings.appearance.contextMenuRetrySave')}
          </button>
        ) : null}
        <button type="button" className={buttonClass} onClick={restore}>
          {t('settings.appearance.contextMenuRestore')}
        </button>
      </div>
    </div>
  );
}
