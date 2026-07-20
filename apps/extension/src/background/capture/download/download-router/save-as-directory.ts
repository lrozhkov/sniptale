import { browserDownloads } from '@sniptale/platform/browser/downloads';

export async function resolveCompletedSaveAsDirectory(downloadId: number): Promise<string | null> {
  const items = await browserDownloads.search({ id: downloadId });
  const item = items[0];
  if (!item?.filename) return null;

  const raw = item.filename.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\/|^\//.test(raw)) return null;

  const lastSlash = raw.lastIndexOf('/');
  const dir = lastSlash >= 0 ? raw.slice(0, lastSlash) : '';
  return dir || null;
}
