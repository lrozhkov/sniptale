import type { ImageEditorController } from '../controller';
import { useEditorStore } from '../state/useEditorStore';

/** Commits the display/export name through the active image autosave owner. */
export async function renameEditorImage(
  controller: Pick<ImageEditorController, 'autosaveService' | 'exportDocument'>,
  aggregateId: string | null,
  name: string
): Promise<void> {
  const title = name.trim();
  const store = useEditorStore.getState();
  if (!title || store.sessionId !== aggregateId || title === store.pageTitle) return;
  const autosave = controller.autosaveService;
  if (!aggregateId || !autosave) throw new Error('Image autosave is unavailable.');
  const previousTitle = store.pageTitle;
  let current = true;
  const unsubscribe = useEditorStore.subscribe((next) => {
    if (next.sessionId !== aggregateId) current = false;
  });
  const isCurrent = () => current && useEditorStore.getState().sessionId === aggregateId;
  autosave.updateContext({ sourceTitle: title });
  try {
    await autosave.saveNow(() => controller.exportDocument());
    if (isCurrent()) useEditorStore.getState().setPageTitle(title);
  } catch (error) {
    if (isCurrent()) autosave.updateContext({ sourceTitle: previousTitle });
    throw error;
  } finally {
    unsubscribe();
  }
}
