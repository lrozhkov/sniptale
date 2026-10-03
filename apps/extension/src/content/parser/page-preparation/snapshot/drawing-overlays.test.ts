// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import { buildPreparedSnapshotDocument } from './builder';
import { PreparedSnapshotWarningKind } from './types';

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function createContentOverlayRoot(): HTMLElement {
  const host = document.createElement('div');
  host.id = CONTENT_ROOT_ID;
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const { overlayRoot } = initializeContentUiRoots(shadowRoot);
  document.body.append(host);
  return overlayRoot;
}

it('retains drawing pixels and text from the app surface without selection or editing UI', async () => {
  const overlayRoot = createContentOverlayRoot();
  const drawing = document.createElement('div');
  drawing.dataset['ui'] = 'content.drawing.surface';
  drawing.innerHTML = `
      <canvas class="sniptale-drawing-canvas" width="20" height="10"></canvas>
      <div data-ui="content.drawing.text-object">Retained drawing text</div>
      <canvas data-ui="content.drawing.selection-chrome"></canvas>
      <div data-ui="content.drawing.text-editor"><textarea>Uncommitted draft</textarea></div>
      <div aria-label="Drawing objects" style="position: fixed; left: -10000px">
        <button type="button" aria-label="Drawing object 1"></button>
      </div>
    `;
  overlayRoot.getRootNode().appendChild(drawing);
  const canvas = drawing.querySelector('canvas')!;
  vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,cG5n');
  drawing.setAttribute('onclick', 'alert(1)');

  const result = await buildPreparedSnapshotDocument({
    iframeTimeoutMs: 20,
    preserveAssetUrls: true,
  });

  expect(result.html).toContain('Retained drawing text');
  expect(result.html).toContain('data-sniptale-canvas-rasterized="true"');
  expect(result.html).toContain('data:image/png;base64,cG5n');
  expect(result.html).not.toContain('content.drawing.selection-chrome');
  expect(result.html).not.toContain('content.drawing.text-editor');
  expect(result.html).not.toContain('Uncommitted draft');
  expect(result.html).not.toContain('Drawing object 1');
  expect(
    new DOMParser().parseFromString(result.html, 'text/html').querySelector('button')
  ).toBeNull();
  expect(result.html).not.toContain('onclick');
  expect(canvas.hasAttribute('data-sniptale-canvas-rasterized')).toBe(false);
});

it('reports unreadable drawing pixels without publishing an executable fallback', async () => {
  const overlayRoot = createContentOverlayRoot();
  const drawing = document.createElement('div');
  drawing.dataset['ui'] = 'content.drawing.surface';
  const canvas = document.createElement('canvas');
  drawing.append(canvas);
  overlayRoot.getRootNode().appendChild(drawing);
  vi.spyOn(canvas, 'toDataURL').mockImplementation(() => {
    throw new Error('tainted');
  });

  const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

  expect(result.warnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: PreparedSnapshotWarningKind.CanvasUnreadable }),
    ])
  );
  expect(result.html).not.toContain('data-sniptale-canvas-rasterized');
  expect(result.html).not.toContain('<script');
});
