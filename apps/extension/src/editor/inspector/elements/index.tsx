import { useEffect, useRef, useState } from 'react';
import { useAppLocale } from '../../../platform/i18n';
import {
  EditorVectorLibraryProvider,
  useEditorVectorLibrarySession,
  useEditorVectorLibrarySnapshot,
  useOptionalEditorVectorLibrarySession,
} from '../../application/vector-elements/context';
import { EditorElementsManagement } from './management';
import { useElementsScrollLayout } from './use-scroll-layout';
import { useElementsPlacement, EditorElementsPlacementGhost } from './placement-view';
import { EditorElementsControls, EditorElementsSelected } from './catalog-controls';
import { EditorElementsResults } from './catalog-results';

function EditorElementsContent() {
  useAppLocale();
  const session = useEditorVectorLibrarySession(),
    state = useEditorVectorLibrarySnapshot();
  const [manage, setManage] = useState(false),
    [dark, setDark] = useState(false),
    [importCollection, setImportCollection] = useState('');
  const layout = useElementsScrollLayout(manage, state.entries.length, state, (top) =>
    session.setScroll(top)
  );
  const placement = useElementsPlacement();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void session.refresh();
    return () => {
      mounted.current = false;
    };
  }, [session]);
  const collectionSource = useRef<string | null>(null);
  useEffect(() => {
    if (!state.settings?.networkEnabled) return;
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
  ]);
  const openManagement = () => {
    if (mounted.current) setManage(true);
  };
  if (manage) return <EditorElementsManagement onBack={() => setManage(false)} />;
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
      <EditorElementsControls
        headerRef={layout.header}
        dark={dark}
        onDarkChange={setDark}
        onManage={openManagement}
        importCollection={importCollection}
        setImportCollection={setImportCollection}
      />
      <EditorElementsResults
        resultsRef={layout.results}
        scrollRootRef={layout.whole ? layout.panel : layout.results}
        whole={layout.whole}
        dark={dark}
        error={placement.error}
        onClearError={placement.clearError}
        onAdd={placement.add}
        onPointerDown={placement.beginPlacement}
        onManage={openManagement}
        onScroll={layout.onResultsScroll}
      />
      <EditorElementsSelected
        footerRef={layout.footer}
        inserting={placement.inserting}
        onAdd={placement.add}
      />
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
