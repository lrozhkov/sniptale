import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createRecommendedContextMenuTree,
  parseContextMenuTree,
  resolveContextMenuTree,
  type ContextMenuTree,
} from '../../../../../contracts/settings/context-menu-layout';
import { translate } from '../../../../../platform/i18n';
import type { AppearanceSectionState } from './types';
import { buildContextMenuCatalog } from './context-menu-catalog';
import { ContextMenuCatalogPanel } from './context-menu-catalog-panel';
import { ContextMenuPreview } from './context-menu-preview';
import { ContextMenuTreeView } from './context-menu-tree';
import { findContextMenuNode } from './context-menu-tree-model';

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
  const [tree, setTree] = useState<ContextMenuTree | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<'ready' | 'editing' | 'saving' | 'failed' | 'saved'>(
    'ready'
  );
  const [announcement, setAnnouncement] = useState('');
  const saving = useRef(false);
  const draftRevision = useRef(0);
  const projectedSource = useRef<{
    settings: ContextMenuEditorState['contextMenu'];
    actions: ContextMenuEditorState['contextMenuQuickActions'];
    presets: ContextMenuEditorState['contextMenuViewportPresets'];
  } | null>(null);
  const t = (key: Parameters<typeof translate>[0]) => translate(key, state.locale);
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
      const next = resolveContextMenuTree(state.contextMenu, actions, presets);
      setTree(next);
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
  ]);
  const reset = () => {
    if (state.contextMenuCatalogStatus !== 'ready' || state.contextMenuSettingsStatus !== 'ready')
      return;
    setTree(resolveContextMenuTree(state.contextMenu, actions, presets));
    projectedSource.current = { settings: state.contextMenu, actions, presets };
    setSelectedKey(null);
    setExpanded(new Set());
    setStatus('ready');
  };
  const restore = () => {
    setTree(createRecommendedContextMenuTree(actions, presets));
    setSelectedKey(null);
    setExpanded(new Set());
    setStatus('editing');
  };
  const changeTree = (next: ContextMenuTree) => {
    draftRevision.current += 1;
    setTree(next);
    if (!saving.current) setStatus('editing');
  };
  const save = async () => {
    if (saving.current || !tree || !parseContextMenuTree(tree)) return;
    saving.current = true;
    const submittedRevision = draftRevision.current;
    setStatus('saving');
    try {
      await state.updateContextMenu({ layout: tree });
      const stillCurrent = draftRevision.current === submittedRevision;
      setStatus(stillCurrent ? 'saved' : 'editing');
      setAnnouncement(
        t(
          stillCurrent
            ? 'settings.appearance.contextMenuSaved'
            : 'settings.appearance.contextMenuUnsaved'
        )
      );
    } catch {
      setStatus('failed');
    } finally {
      saving.current = false;
    }
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
    reset,
    restore,
    save,
  };
}

export function ContextMenuEditor({
  state,
  visible = true,
}: {
  state: ContextMenuEditorState;
  visible?: boolean;
}) {
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
    reset,
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
    <div className="min-w-0 space-y-4 pb-2 text-[var(--sniptale-color-text-primary)]">
      <p className="max-w-[65rem] text-sm leading-6 text-[var(--sniptale-color-text-muted)]">
        {t('settings.appearance.contextMenuEditorHelp')}
      </p>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,1fr)]">
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
        <div className="min-w-0 space-y-4">
          <ContextMenuCatalogPanel
            tree={tree}
            catalog={catalog}
            locale={state.locale}
            selectedKey={selectedKey}
            visible={visible}
            onChange={setTree}
            onSelect={(key) => {
              setSelectedKey(key);
              setFocusRequest({ key });
            }}
            onAnnounce={setAnnouncement}
            expanded={expanded}
            onExpanded={setExpanded}
          />
          <ContextMenuPreview tree={tree} catalog={catalog} locale={state.locale} />
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
                : status === 'ready'
                  ? 'settings.appearance.contextMenuReady'
                  : 'settings.appearance.contextMenuUnsaved'
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={status === 'saving' || status === 'saved' || !parseContextMenuTree(tree)}
          onClick={() => void save()}
        >
          {t('settings.appearance.contextMenuSave')}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={status === 'saving'}
          onClick={reset}
        >
          {t('settings.appearance.contextMenuResetDraft')}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={status === 'saving'}
          onClick={restore}
        >
          {t('settings.appearance.contextMenuRestore')}
        </button>
      </div>
    </div>
  );
}
