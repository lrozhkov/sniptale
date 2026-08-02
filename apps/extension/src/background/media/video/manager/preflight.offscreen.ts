import {
  ensureOffscreenDocument,
  hasOffscreenDocument,
  waitForOffscreenReady,
} from '../../../offscreen-document/service';

type OffscreenDocumentDeps = {
  ensureOffscreenDocument: typeof ensureOffscreenDocument;
  hasOffscreenDocument: typeof hasOffscreenDocument;
  waitForOffscreenReady: typeof waitForOffscreenReady;
};

const defaultOffscreenDocumentDeps: OffscreenDocumentDeps = {
  ensureOffscreenDocument,
  hasOffscreenDocument,
  waitForOffscreenReady,
};

export async function ensureOffscreenDocumentReady(
  reason: string,
  deps: OffscreenDocumentDeps = defaultOffscreenDocumentDeps
): Promise<void> {
  const created = await deps.ensureOffscreenDocument(reason);
  if (!created && !deps.hasOffscreenDocument()) {
    return;
  }

  await deps.waitForOffscreenReady();
}
