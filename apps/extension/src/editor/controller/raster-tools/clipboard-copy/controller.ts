import type { ClipboardControllerLike } from '../clipboard-types';
import { resolveClipboardPayload } from './payload';
import { writeClipboardPayload } from './write';

export async function copyRasterSelectionToClipboard(
  controller: ClipboardControllerLike
): Promise<boolean> {
  const payload = await resolveClipboardPayload(controller.rasterToolSession, controller.canvas);
  if (!payload) {
    return false;
  }

  await writeClipboardPayload(payload);
  controller.rasterToolSession.clipboard = {
    dataUrl: payload.dataUrl,
    sceneBounds: payload.sceneBounds,
    source: payload.reference,
  };
  return true;
}
