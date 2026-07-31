import { browserAnnotationSession } from '../session';
import { formatBrowserAnnotationSnapshot } from './formatter';

/** Captures and formats one immutable annotation-session snapshot in the initiating action turn. */
export function captureBrowserAnnotationsExportText(): string {
  const snapshot = browserAnnotationSession.captureSnapshot();
  return formatBrowserAnnotationSnapshot(snapshot);
}

/** Captures one immutable session snapshot before any asynchronous export preparation. */
export async function prepareBrowserAnnotationsExportText(): Promise<string> {
  const text = captureBrowserAnnotationsExportText();
  await Promise.resolve();
  return text;
}
