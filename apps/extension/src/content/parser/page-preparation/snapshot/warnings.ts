import type { PreparedSnapshotWarning } from './types';
import { PreparedSnapshotWarningKind } from './types';

function stripSensitiveUrlParts(value: string, baseUrl: string): string {
  try {
    const url = new URL(value, baseUrl);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return value.slice(0, 80);
  }
}

export function describeIframeTarget(iframe: HTMLIFrameElement, baseUrl: string): string {
  if (iframe.id) {
    return `#${iframe.id}`;
  }

  const src = iframe.getAttribute('src') ?? iframe.src;
  if (src) {
    return stripSensitiveUrlParts(src, baseUrl);
  }

  return '<iframe>';
}

export function createIframeTimeoutWarning(
  iframe: HTMLIFrameElement,
  baseUrl: string
): PreparedSnapshotWarning {
  const target = describeIframeTarget(iframe, baseUrl);
  return {
    kind: PreparedSnapshotWarningKind.IframeTimeout,
    message: `Iframe snapshot timed out before content was ready: ${target}`,
    target,
  };
}

export function createIframeUnreadableWarning(
  iframe: HTMLIFrameElement,
  baseUrl: string
): PreparedSnapshotWarning {
  const target = describeIframeTarget(iframe, baseUrl);
  return {
    kind: PreparedSnapshotWarningKind.IframeUnreadable,
    message: `Iframe content was not readable and was saved as a static placeholder: ${target}`,
    target,
  };
}

export function createSanitizerDropWarning(target: string): PreparedSnapshotWarning {
  return {
    kind: PreparedSnapshotWarningKind.SanitizerDrop,
    message: `Unsafe snapshot content was removed: ${target}`,
    target,
  };
}
