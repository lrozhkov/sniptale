import { browserAnnotationSession } from '../session';
import { formatBrowserAnnotationSnapshot } from './formatter';

/** Captures one immutable session snapshot before any asynchronous export preparation. */
export async function prepareBrowserAnnotationsExportText(): Promise<string> {
  const snapshot = browserAnnotationSession.captureSnapshot();
  await Promise.resolve();
  return formatBrowserAnnotationSnapshot(snapshot);
}
