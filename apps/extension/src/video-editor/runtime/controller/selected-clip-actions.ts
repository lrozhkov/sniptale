import type { VideoEditorSelection } from '../../contracts/selection';
interface SelectedClipActionStore {
  currentTime: number;
  selection?: VideoEditorSelection;
  selectedClipId: string | null;
  deleteClip: (clipId: string | readonly string[]) => void;
  duplicateClip: (clipId: string) => void;
  splitClipAt: (clipId: string, time: number) => void;
}

export function createSelectedClipActions(store: SelectedClipActionStore) {
  return {
    deleteSelectedClip() {
      if (store.selection?.kind === 'clip-group') store.deleteClip(store.selection.clipIds);
      else if (store.selectedClipId) store.deleteClip(store.selectedClipId);
    },
    duplicateSelectedClip() {
      if (store.selectedClipId) store.duplicateClip(store.selectedClipId);
    },
    splitSelectedClip() {
      if (store.selectedClipId) store.splitClipAt(store.selectedClipId, store.currentTime);
    },
  };
}
