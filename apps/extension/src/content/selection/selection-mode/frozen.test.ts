// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  captureFrozenSelectionGeometry,
  mountFrozenSelectionFrame,
  prepareFrozenSelectionFrame,
  watchFrozenSelectionViewport,
} from './frozen';
import { resolveSelectionModePointerTarget } from './events/pointer-handlers/target';

function box(element: HTMLElement, x: number, y: number, width: number, height: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(x, y, width, height));
  return element;
}

function page() {
  const background = box(document.body, 0, 0, window.innerWidth, window.innerHeight);
  const menu = box(document.createElement('div'), 20, 30, 150, 90);
  const item = box(document.createElement('button'), 30, 40, 80, 20);
  document.body.append(menu);
  menu.append(item);
  const hitTest = vi.fn((x: number, y: number) => {
    if (x >= 30 && x < 110 && y >= 40 && y < 60) return [item, menu, background];
    if (x >= 20 && x < 170 && y >= 30 && y < 120) return [menu, background];
    return [background];
  });
  vi.stubGlobal('document', document);
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: hitTest });
  return { background, menu, item, hitTest };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('retains browser overlap order and element bounds after menu removal and page movement', () => {
  const { menu, item, hitTest } = page();
  const geometry = captureFrozenSelectionGeometry();
  menu.remove();
  vi.mocked(item.getBoundingClientRect).mockReturnValue(new DOMRect(400, 500, 1, 1));
  hitTest.mockReturnValue([document.body]);
  expect(geometry.targetAt(40, 45)).toBe(item);
  expect(geometry.targetAt(25, 35)).toBe(menu);
  expect(geometry.getRect(item)).toEqual({ x: 30, y: 40, width: 80, height: 20 });
  expect(geometry.targetAt(-1, -1)).toBeNull();
  const rect = geometry.getRect(item);
  rect.width = 500;
  expect(geometry.getRect(item).width).toBe(80);
});

it('mounts a pointer shield under the selection controls and resolves through its saved hit map', () => {
  const { item } = page();
  const frame = {
    dataUrl: 'data:image/png;base64,frame',
    geometry: captureFrozenSelectionGeometry(),
  };
  const container = document.createElement('div');
  const control = document.createElement('button');
  control.className = 'sniptale-selection-confirm';
  container.append(control);
  document.body.append(container);
  mountFrozenSelectionFrame(container, frame);
  const image = container.querySelector<HTMLElement>('.sniptale-selection-frozen-frame')!;
  expect(container.firstChild).toBe(image);
  expect(image.style.pointerEvents).toBe('auto');
  let selected: HTMLElement | null = null;
  container.addEventListener('click', (event) => {
    selected = resolveSelectionModePointerTarget(event, undefined, frame);
  });
  image.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 40, clientY: 45 }));
  expect(selected).toBe(item);
  control.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 40, clientY: 45 }));
  expect(selected).toBe(control);
});

it('invalidates changed viewport coordinates and removes its resize watcher on cleanup', () => {
  page();
  const geometry = captureFrozenSelectionGeometry();
  const cancel = vi.fn();
  const stop = watchFrozenSelectionViewport(geometry, cancel);
  window.dispatchEvent(new Event('resize'));
  expect(cancel).not.toHaveBeenCalled();
  vi.stubGlobal('innerWidth', window.innerWidth + 10);
  window.dispatchEvent(new Event('resize'));
  expect(cancel).toHaveBeenCalledOnce();
  expect(() => geometry.assertViewport()).toThrow('Selection viewport changed');
  stop();
  window.dispatchEvent(new Event('resize'));
  expect(cancel).toHaveBeenCalledOnce();
});

it('does not activate an undecodable raster', async () => {
  page();
  const image = document.createElement('img');
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        return image;
      }
    }
  );
  const pending = prepareFrozenSelectionFrame({
    dataUrl: 'invalid',
    geometry: captureFrozenSelectionGeometry(),
  });
  image.dispatchEvent(new Event('error'));
  await expect(pending).rejects.toThrow('Failed to load selection frame');
});

it('preserves accessible iframe targets in top viewport coordinates', () => {
  const { hitTest } = page();
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  box(iframe, 200, 100, 300, 200);
  const childDocument = iframe.contentDocument!;
  const child = childDocument.createElement('button');
  childDocument.body.append(child);
  box(child, 20, 30, 80, 40);
  Object.defineProperty(childDocument, 'elementsFromPoint', {
    configurable: true,
    value: () => [child],
  });
  hitTest.mockImplementation((x, y) =>
    x >= 200 && x < 500 && y >= 100 && y < 300 ? [iframe] : [document.body]
  );
  const geometry = captureFrozenSelectionGeometry();
  iframe.remove();
  expect(geometry.targetAt(230, 140)).toBe(child);
  expect(geometry.getRect(child)).toEqual({ x: 220, y: 130, width: 80, height: 40 });
});

it('preserves targets inside open shadow roots after their host disappears', () => {
  const { hitTest } = page();
  const host = box(document.createElement('div'), 200, 100, 300, 200);
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const child = box(document.createElement('button'), 220, 130, 80, 40);
  shadow.append(child);
  Object.defineProperty(shadow, 'elementsFromPoint', { configurable: true, value: () => [child] });
  hitTest.mockImplementation((x, y) =>
    x >= 200 && x < 500 && y >= 100 && y < 300 ? [host] : [document.body]
  );
  const geometry = captureFrozenSelectionGeometry();
  host.remove();
  expect(geometry.targetAt(230, 140)).toBe(child);
  expect(geometry.getRect(child)).toEqual({ x: 220, y: 130, width: 80, height: 40 });
});

it('keeps screenshot bytes out of the page-readable DOM and retargets input through an inert host', () => {
  page();
  const container = document.createElement('div');
  document.body.append(container);
  const dataUrl = 'data:image/png;base64,private-viewport';
  mountFrozenSelectionFrame(container, { dataUrl, geometry: captureFrozenSelectionGeometry() });
  const host = container.querySelector('.sniptale-selection-frozen-frame');
  expect(host?.shadowRoot).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.outerHTML).not.toContain(dataUrl);
});

it.each(['circle', 'clip'] as const)(
  'retains exposed background and visible pixels of a %s target',
  (shape) => {
    const { hitTest } = page();
    const button = box(document.createElement('button'), 200, 100, 100, 100);
    document.body.append(button);
    if (shape === 'circle') {
      button.style.borderTopLeftRadius = '50%';
      button.style.borderTopRightRadius = '50%';
      button.style.borderBottomRightRadius = '50%';
      button.style.borderBottomLeftRadius = '50%';
    } else button.style.clipPath = 'polygon(0 0, 30% 0, 0 30%)';
    const isInside = (x: number, y: number) =>
      shape === 'circle'
        ? (x - 250) ** 2 + (y - 150) ** 2 < 2500
        : x >= 200 && y >= 100 && x - 200 + (y - 100) < 30;
    hitTest.mockImplementation((x, y) =>
      isInside(x, y) ? [button, document.body] : [document.body]
    );
    const geometry = captureFrozenSelectionGeometry();
    button.remove();
    expect(geometry.targetAt(201, 101)).toBe(shape === 'circle' ? document.body : button);
    expect(geometry.targetAt(250, 150)).toBe(shape === 'circle' ? button : document.body);
    expect(geometry.getRect(button)).toEqual({ x: 200, y: 100, width: 100, height: 100 });
  }
);

it('retains wrapped inline fragments and the background between lines', () => {
  const { background, hitTest } = page();
  const link = box(document.createElement('a'), 200, 100, 140, 62);
  document.body.append(link);
  vi.spyOn(link, 'getClientRects').mockReturnValue([
    new DOMRect(200, 100, 140, 22),
    new DOMRect(200, 140, 30, 22),
  ] as unknown as DOMRectList);
  hitTest.mockImplementation((x: number, y: number) => {
    const first = x >= 200 && x < 340 && y >= 100 && y < 122;
    const second = x >= 200 && x < 230 && y >= 140 && y < 162;
    return first || second ? [link, background] : [background];
  });
  const geometry = captureFrozenSelectionGeometry();
  link.remove();
  expect(geometry.targetAt(210, 110)).toBe(link);
  expect(geometry.targetAt(210, 130)).toBe(background);
  expect(geometry.targetAt(210, 150)).toBe(link);
  expect(geometry.targetAt(250, 150)).toBe(background);
  expect(geometry.getRect(link)).toEqual({ x: 200, y: 100, width: 140, height: 62 });
});

it('resolves nested SVG icon hits to the retained HTML button for selection and drag start', () => {
  const { item, hitTest } = page();
  item.innerHTML = '<svg><g><path /></g></svg>';
  const icon = item.querySelector('path')!;
  hitTest.mockReturnValue([icon, item, document.body] as unknown as HTMLElement[]);
  const geometry = captureFrozenSelectionGeometry();
  item.remove();
  expect(geometry.targetAt(40, 45)).toBe(item);
  const event = new MouseEvent('mousedown', { clientX: 40, clientY: 45 });
  expect(resolveSelectionModePointerTarget(event, undefined, { dataUrl: '', geometry })).toBe(item);
});
