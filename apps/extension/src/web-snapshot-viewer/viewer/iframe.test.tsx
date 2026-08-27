// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WebSnapshotFrame } from './iframe';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

it('uses the iframe load event as the navigation-blocking hook', () => {
  const onLoad = vi.fn();

  act(() => {
    root?.render(
      <WebSnapshotFrame
        iframeRef={() => undefined}
        onLoad={onLoad}
        srcDoc="<p>Demo</p>"
        title="Web Snapshot"
      />
    );
  });
  container?.querySelector('iframe')?.dispatchEvent(new Event('load', { bubbles: true }));

  expect(onLoad).toHaveBeenCalledTimes(1);
});

it('keeps srcdoc snapshots no-scripts so about:srcdoc script blocking is expected', () => {
  act(() => {
    root?.render(
      <WebSnapshotFrame
        iframeRef={() => undefined}
        onLoad={() => undefined}
        srcDoc="<script>window.__sniptaleSnapshotScriptRan = true</script>"
        title="Web Snapshot"
      />
    );
  });

  const iframeElement = container?.querySelector('iframe');

  expect(iframeElement?.getAttribute('srcdoc')).toContain('<script>');
  expect(iframeElement?.getAttribute('srcdoc')).toContain("form-action 'none'");
  expect(iframeElement?.getAttribute('srcdoc')).toContain("navigate-to 'none'");
  expect(iframeElement?.getAttribute('srcdoc')).toContain(
    '<style data-sniptale-viewer-baseline>@layer sniptale-viewer-baseline{body{font-size:initial}}</style>'
  );
  expect(iframeElement?.getAttribute('sandbox')).toBe('allow-same-origin');
  expect(iframeElement?.getAttribute('sandbox')).not.toContain('allow-scripts');
  expect(iframeElement?.getAttribute('title')).toBe('Web Snapshot');
});

it('places the extension-environment baseline before captured page styles', () => {
  act(() => {
    root?.render(
      <WebSnapshotFrame
        iframeRef={() => undefined}
        onLoad={() => undefined}
        srcDoc={
          '<!doctype html><html><head data-source="page"><style>body{font-size:20px}</style></head><body></body></html>'
        }
        title="Web Snapshot"
      />
    );
  });

  const srcDoc = container?.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
  expect(srcDoc.indexOf('data-sniptale-viewer-baseline')).toBeLessThan(
    srcDoc.indexOf('body{font-size:20px}')
  );
});
