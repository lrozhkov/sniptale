import {
  isSafeWebSnapshotCaptureAssetUrl,
  sanitizeWebSnapshotStylesheetText,
} from '../../../features/web-snapshot/public';
import { collectAssetTargets } from './asset-targets';
import type { WebSnapshotAssetEntry } from './types';

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read stylesheet asset.'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(blob);
  });
}

function resolveStylesheetResourceUrl(value: string, baseUrl: string): string | null {
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith('#')) return trimmedValue;
  if (!isSafeWebSnapshotCaptureAssetUrl(trimmedValue, baseUrl)) return null;
  try {
    const url = new URL(trimmedValue, baseUrl);
    return ['data:', 'http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeStylesheetRules(cssText: string, baseUrl: string, style: HTMLStyleElement): void {
  style.textContent = sanitizeWebSnapshotStylesheetText(cssText, (url) =>
    resolveStylesheetResourceUrl(url, baseUrl)
  );
}

interface PreparedStylesheetAsset {
  finish(): void;
  root: Document;
  targets: ReturnType<typeof collectAssetTargets>['targets'];
}

export async function prepareStylesheetAsset(
  asset: WebSnapshotAssetEntry
): Promise<PreparedStylesheetAsset> {
  const stylesheetDocument = document.implementation.createHTMLDocument('snapshot stylesheet');
  const style = stylesheetDocument.createElement('style');
  stylesheetDocument.head.appendChild(style);
  normalizeStylesheetRules(await readBlobText(asset.blob), asset.originalUrl, style);
  const targets = collectAssetTargets(stylesheetDocument, {
    baseUrl: asset.originalUrl,
  }).targets;

  return {
    finish() {
      asset.blob = new Blob([style.textContent ?? ''], { type: 'text/css' });
    },
    root: stylesheetDocument,
    targets,
  };
}
