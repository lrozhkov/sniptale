// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import { buildPreparedSnapshotDocument } from './builder';
import { PreparedSnapshotWarningKind } from './types';
import { registerDrawingSnapshotSource } from '../../../drawing/frame';
vi.mock('../../../drawing/render', () => ({ renderDrawingObject: vi.fn() }));

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

it.each([true, false])(
  'exports independent ink with anchor availability %s and a bounded static layer',
  async (hasAnchor) => {
    const target = document.createElement('p');
    target.textContent = 'Anchor paragraph';
    document.body.append(target);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 100, 400, 80));
    const root = createContentOverlayRoot();
    const surface = document.createElement('div');
    surface.dataset['ui'] = 'content.drawing.surface';
    const canvas = document.createElement('canvas');
    canvas.className = 'sniptale-drawing-canvas';
    surface.append(canvas);
    const blur = document.createElement('div');
    blur.setAttribute('data-sniptale-drawing-object-id', 'blur');
    blur.style.cssText =
      'position:fixed;left:310px;top:110px;width:20px;height:100px;transform:rotate(90deg)';
    surface.append(blur);
    root.getRootNode().appendChild(surface);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,cG5n'
    );
    const unregister = registerDrawingSnapshotSource(canvas, () => ({
      root: { kind: 'document', element: document.documentElement },
      objects: [
        {
          id: 'one',
          kind: 'rectangle',
          bounds: { x: 310, y: 110, width: 30, height: 20 },
          color: '#000',
          width: 2,
        },
        {
          id: 'two',
          kind: 'rectangle',
          bounds: { x: 320, y: 120, width: 30, height: 20 },
          color: '#000',
          width: 2,
        },
        {
          id: 'blur',
          kind: 'blur',
          bounds: { x: 310, y: 110, width: 20, height: 100 },
          rotation: 90,
        },
      ],
      getObjectAnchor: () => (hasAnchor ? target : null),
    }));
    try {
      const result = await buildPreparedSnapshotDocument({ preserveAssetUrls: true });
      expect(result.document.querySelectorAll('[data-sniptale-drawing-anchor]')).toHaveLength(
        hasAnchor ? 3 : 0
      );
      expect(result.document.querySelectorAll('[data-sniptale-canvas-rasterized]')).toHaveLength(2);
      for (const anchor of result.document.querySelectorAll<HTMLElement>(
        '[data-sniptale-drawing-anchor]'
      )) {
        expect(anchor.style.overflowX).toBe('clip');
        expect(anchor.style.right).toBe('0px');
        const ink = anchor.querySelector('canvas');
        if (ink) expect(ink.style.width).toBe('34px');
        else {
          const rotated = anchor.querySelector<HTMLElement>(
            '[data-sniptale-drawing-object-id=blur]'
          );
          expect(rotated?.style.left).toBe('40px');
          expect(rotated?.style.transform).toBe('rotate(90deg)');
        }
      }
      if (hasAnchor) expect(result.html).toContain('anchor(');
      else expect(result.html).not.toContain('anchor(');
      expect(result.html).not.toContain('<script');
      const layer = result.document.querySelector<HTMLElement>(
        '[data-sniptale-static-overlay-layer]'
      );
      expect(layer?.style.width).toBe('100%');
      expect(layer?.style.overflowX).toBe('clip');
      expect(target.style.getPropertyValue('anchor-name')).toBe('');
    } finally {
      unregister();
    }
  }
);
