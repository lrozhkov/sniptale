import { useEffect, useRef, useState } from 'react';
import { useAppLocale, translate } from '../../../platform/i18n';
import { openSettingsPage } from '../../../platform/navigation/extension-pages';
import {
  EditorVectorLibraryProvider,
  useEditorVectorLibrarySession,
  useEditorVectorLibrarySnapshot,
  useOptionalEditorVectorLibrarySession,
} from '../../application/vector-elements/context';
import { EditorIconAppearancePanel } from './appearance-panel';
import { createEditorIconAppearance } from './presentation';
import { useElementsScrollLayout } from './use-scroll-layout';
import { useElementsPlacement, EditorElementsPlacementGhost } from './placement-view';
import { EditorElementsControls, EditorElementsSelected } from './catalog-controls';
import { EditorElementsResults } from './catalog-results';

function EditorElementsContent() {
  useAppLocale();
  const session = useEditorVectorLibrarySession(),
    state = useEditorVectorLibrarySnapshot();
  const [appearance, setAppearance] = useState(() =>
    createEditorIconAppearance(
      typeof document !== 'undefined' && document.documentElement.dataset['theme'] === 'dark'
    )
  );
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const layout = useElementsScrollLayout(false, state.entries.length, state, (top) =>
    session.setScroll(top)
  );
  const placement = useElementsPlacement(appearance);
  useEffect(() => {
    const refresh = () => void session.refresh();
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [session]);
  const collectionSource = useRef<string | null>(null);
  useEffect(() => {
    if (!state.settings?.networkEnabled || state.tab !== 'catalog') return;
    const source = JSON.stringify([
      state.settings.baseUrl,
      state.settings.incarnation,
      state.settings.sourceGeneration,
    ]);
    if (collectionSource.current === source) return;
    collectionSource.current = source;
    void session.loadCollections();
  }, [
    session,
    state.settings?.baseUrl,
    state.settings?.incarnation,
    state.settings?.sourceGeneration,
    state.settings?.networkEnabled,
    state.tab,
  ]);
  const openSettings = () =>
    void openSettingsPage({ route: { section: 'editor-resources', view: 'icons' } });
  return (
    <div
      ref={layout.panel}
      className={[
        'flex min-h-0 flex-1 flex-col',
        layout.whole
          ? 'overflow-x-hidden overflow-y-auto [scrollbar-width:thin]'
          : 'overflow-hidden',
      ].join(' ')}
      data-ui="editor.elements.panel"
      onScroll={layout.onPanelScroll}
    >
      <div ref={layout.header} className="shrink-0">
        <EditorElementsControls
          headerRef={null}
          appearanceOpen={appearanceOpen}
          onAppearance={() => setAppearanceOpen((open) => !open)}
        />
        {state.imports.length ? (
          <p
            role="status"
            className="px-3 pb-3 text-xs text-[var(--sniptale-color-text-secondary)]"
          >
            {translate('editor.elements.accepted')}:{' '}
            {state.imports.reduce((sum, row) => sum + row.accepted, 0)}
            {' · '}
            {translate('editor.elements.declined')}:{' '}
            {state.imports.reduce((sum, row) => sum + row.declined, 0)}
          </p>
        ) : null}
      </div>
      <EditorElementsResults
        resultsRef={layout.results}
        scrollRootRef={layout.whole ? layout.panel : layout.results}
        whole={layout.whole}
        appearance={appearance}
        error={placement.error}
        onClearError={placement.clearError}
        onAdd={placement.add}
        onPointerDown={placement.beginPlacement}
        onOpenSettings={openSettings}
        onScroll={layout.onResultsScroll}
      />
      <EditorElementsSelected
        footerRef={layout.footer}
        inserting={placement.inserting}
        onAdd={placement.add}
      />
      {appearanceOpen ? (
        <EditorIconAppearancePanel
          anchor={layout.panel}
          value={appearance}
          definition={
            state.entries.find((entry) => entry.key === state.selectedKey)?.definition ??
            state.entries.find((entry) => entry.definition)?.definition ??
            undefined
          }
          onClose={() => setAppearanceOpen(false)}
          onApply={(value) => {
            setAppearance(value);
            setAppearanceOpen(false);
          }}
        />
      ) : null}
      <EditorElementsPlacementGhost ghost={placement.ghost} anchor={layout.panel.current} />
    </div>
  );
}
/** The legacy inspector receives the same application lifetime as the floating workspace. */
export function EditorElementsPanel() {
  return useOptionalEditorVectorLibrarySession() ? (
    <EditorElementsContent />
  ) : (
    <EditorVectorLibraryProvider>
      <EditorElementsContent />
    </EditorVectorLibraryProvider>
  );
}
