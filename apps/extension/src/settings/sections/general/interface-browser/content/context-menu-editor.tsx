import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createRecommendedContextMenuTree,
  parseContextMenuTree,
  resolveContextMenuTree,
} from '../../../../../contracts/settings/context-menu-layout';
import { translate } from '../../../../../platform/i18n';
import type { AppearanceSectionState } from './types';
import { buildContextMenuCatalog } from './context-menu-catalog';
import { ContextMenuCatalogPanel } from './context-menu-catalog-panel';
import { ContextMenuTreeView } from './context-menu-tree';
import { findContextMenuNode } from './context-menu-tree-model';
import { useContextMenuDraftPersistence } from './use-context-menu-draft-persistence';

const buttonClass = [
  'inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg',
  'border border-[var(--sniptale-color-border-soft)] px-3 py-1.5 text-sm',
  'hover:bg-[var(--sniptale-color-surface-hover)] focus-visible:outline-none',
  'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
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

export function ContextMenuEditor({ state }: { state: ContextMenuEditorState; visible?: boolean }) {
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
  } = useContextMenuDraft(state);
  const [focusRequest, setFocusRequest] = useState<{ key: string } | null>(null);
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
    <div className="min-w-0 space-y-3 pb-2 text-[var(--sniptale-color-text-primary)]">
      <p className="max-w-[65rem] text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
        {t('settings.appearance.contextMenuEditorHelp')}{' '}
        {t('settings.appearance.contextMenuMoveHelp')}
      </p>
      <div
        className={[
          'grid min-w-0 overflow-hidden rounded-xl border border-[var(--sniptale-color-border-soft)]',
          'lg:grid-cols-[minmax(0,1.6fr)_minmax(15rem,0.9fr)]',
        ].join(' ')}
      >
        <ContextMenuTreeView
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
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {!parseContextMenuTree(tree) ? (
        <p role="alert" className="text-sm text-[var(--sniptale-color-danger)]">
          {t('settings.appearance.contextMenuInvalidName')}
        </p>
      ) : null}
      {status !== 'ready' ? (
        <p
          role={status === 'failed' ? 'alert' : 'status'}
          className="text-sm text-[var(--sniptale-color-text-muted)]"
        >
          {t(
            status === 'failed'
              ? 'settings.appearance.contextMenuSaveFailed'
              : status === 'saving'
                ? 'settings.appearance.contextMenuSaving'
                : status === 'saved'
                  ? 'settings.appearance.contextMenuSaved'
                  : 'settings.appearance.contextMenuUnsaved'
          )}
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
