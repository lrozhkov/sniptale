import type { ImageEditorController } from '../controller';
import { runEditorDocumentTransition } from '../controller/history/transition-queue';
import { useEditorStore } from '../state/useEditorStore';

type RenameImageController = Pick<
  ImageEditorController,
  'autosaveService' | 'exportDocument' | 'canvas' | 'history' | 'commitHistory'
>;

/** Persists one caption edit, then commits it in the same history order as undo and redo. */
export async function renameEditorImage(
  controller: RenameImageController,
  aggregateId: string | null,
  name: string
): Promise<void> {
  const title = name.trim();
  const store = useEditorStore.getState();
  if (!title || store.sessionId !== aggregateId || title === store.pageTitle) return;
  const autosave = controller.autosaveService;
  if (!aggregateId || !autosave) throw new Error('Image autosave is unavailable.');
  let current = true;
  const unsubscribe = useEditorStore.subscribe((next) => {
    if (next.sessionId !== aggregateId) current = false;
  });
  const isCurrent = () => current && useEditorStore.getState().sessionId === aggregateId;
  try {
    await runEditorDocumentTransition(controller.canvas ?? controller.history, async () => {
      if (!isCurrent() || title === useEditorStore.getState().pageTitle) return;
      await autosave.saveNow(() => ({ ...controller.exportDocument(), displayName: title }));
      if (isCurrent()) {
        useEditorStore.getState().setPageTitle(title);
        controller.commitHistory();
      }
    });
  } finally {
    unsubscribe();
  }
}
