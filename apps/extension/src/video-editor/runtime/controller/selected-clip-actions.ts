interface SelectedClipActionStore {
  currentTime: number;
  selectedClipId: string | null;
  deleteClip: (clipId: string) => void;
  duplicateClip: (clipId: string) => void;
  splitClipAt: (clipId: string, time: number) => void;
}

export function createSelectedClipActions(store: SelectedClipActionStore) {
  return {
    deleteSelectedClip() {
      if (store.selectedClipId) store.deleteClip(store.selectedClipId);
    },
    duplicateSelectedClip() {
      if (store.selectedClipId) store.duplicateClip(store.selectedClipId);
    },
    splitSelectedClip() {
      if (store.selectedClipId) store.splitClipAt(store.selectedClipId, store.currentTime);
    },
  };
}
