import { useEditorStore } from '../../../../state/useEditorStore';

export function resetClosedEditorStoreState(): void {
  useEditorStore.getState().resetDocumentState();
}
