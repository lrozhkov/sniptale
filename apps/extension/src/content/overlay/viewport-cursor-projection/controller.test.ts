// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createViewportCursorProjectionController } from './controller';

let nextFrameId = 1;
let requestFrame: ReturnType<typeof vi.fn>;
let scheduledFrames = new Map<number, FrameRequestCallback>();
let activeControllers: Array<ReturnType<typeof createViewportCursorProjectionController>> = [];

function flushAnimationFrames(): void {
  const callbacks = [...scheduledFrames.values()];
  scheduledFrames.clear();
  callbacks.forEach((callback) => callback(16));
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  nextFrameId = 1;
  scheduledFrames = new Map();
  activeControllers = [];
  requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const frameId = nextFrameId;
    nextFrameId += 1;
    scheduledFrames.set(frameId, callback);
    return frameId;
  });
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((frameId: number) => scheduledFrames.delete(frameId))
  );
});

afterEach(() => {
  activeControllers.forEach((controller) => controller.dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createHarness() {
  const addListener = vi.spyOn(document, 'addEventListener');
  const removeListener = vi.spyOn(document, 'removeEventListener');
  const controller = createViewportCursorProjectionController({
    addOverlayNode: (node) => document.body.appendChild(node),
    addPageStyle: (node) => document.head.appendChild(node),
    applyRootStyle: (node, styleText) => {
      node.style.cssText = styleText;
    },
    document,
  });
  activeControllers.push(controller);
  return { addListener, controller, removeListener };
}

const authority = { generation: 1, recordingId: 'recording-1' };

it('projects a system-size fixed cursor at the exact pointer hotspot', () => {
  const { controller } = createHarness();

  controller.enable(authority);
  document.dispatchEvent(
    new MouseEvent('pointermove', { bubbles: true, clientX: 200, clientY: 120 })
  );
  flushAnimationFrames();

  const root = document.querySelector<HTMLElement>('[data-sniptale-viewport-cursor]');
  expect(root).not.toBeNull();
  expect(root?.style.position).toBe('fixed');
  expect(root?.style.width).toBe('24px');
  expect(root?.style.height).toBe('24px');
  expect(root?.style.transform).toBe('translate3d(199px, 119px, 0)');
  expect(root?.style.visibility).toBe('visible');
  expect(root?.dataset['cursorKind']).toBe('default');
  expect(root?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24');
  expect(document.head.textContent).toContain('cursor: none !important');
});

it('switches between standard pointer, text, and blocked cursor roles', () => {
  const { controller } = createHarness();
  const link = document.createElement('a');
  link.href = '#target';
  const input = document.createElement('input');
  const blocked = document.createElement('button');
  blocked.style.cursor = 'not-allowed';
  document.body.append(link, input, blocked);
  controller.enable(authority);
  const root = document.querySelector<HTMLElement>('[data-sniptale-viewport-cursor]');

  link.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 50 }));
  flushAnimationFrames();
  expect(root?.dataset['cursorKind']).toBe('pointer');
  expect(root?.querySelector('svg')?.dataset['cursorGlyph']).toBe('pointer');

  input.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 70 }));
  flushAnimationFrames();
  expect(root?.dataset['cursorKind']).toBe('text');
  expect(root?.querySelector('svg')?.dataset['cursorGlyph']).toBe('text');

  blocked.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 80, clientY: 90 }));
  flushAnimationFrames();
  expect(root?.dataset['cursorKind']).toBe('not-allowed');
  expect(root?.querySelector('svg')?.dataset['cursorGlyph']).toBe('not-allowed');
});

it('keeps hyperlink semantics when the projection hiding rule is the computed cursor', () => {
  const { controller } = createHarness();
  const link = document.createElement('a');
  link.href = '#target';
  document.body.append(link);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    cursor: 'none',
    userSelect: 'auto',
  } as CSSStyleDeclaration);
  controller.enable(authority);

  link.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 50 }));
  flushAnimationFrames();

  const root = document.querySelector<HTMLElement>('[data-sniptale-viewport-cursor]');
  expect(root?.dataset['cursorKind']).toBe('pointer');
  expect(root?.querySelector('svg')?.dataset['cursorGlyph']).toBe('pointer');
});

it('keeps one fixed projection across scroll and restores page cursor ownership on disable', () => {
  const { addListener, controller, removeListener } = createHarness();

  controller.enable(authority);
  controller.enable(authority);
  const root = document.querySelector<HTMLElement>('[data-sniptale-viewport-cursor]');
  const style = document.querySelector<HTMLStyleElement>('[data-sniptale-viewport-cursor-style]');

  expect(document.querySelectorAll('[data-sniptale-viewport-cursor]')).toHaveLength(1);
  expect(document.querySelectorAll('[data-sniptale-viewport-cursor-style]')).toHaveLength(1);
  expect(addListener).toHaveBeenCalledWith('pointermove', expect.any(Function), true);

  window.scrollTo = vi.fn();
  window.scrollTo(0, 500);
  window.dispatchEvent(new Event('scroll'));
  expect(root?.style.position).toBe('fixed');

  controller.disable(authority);
  expect(root?.isConnected).toBe(false);
  expect(style?.isConnected).toBe(false);
  expect(removeListener).toHaveBeenCalledWith('pointermove', expect.any(Function), true);
});

it('hides the projection when the pointer leaves the document', () => {
  const { controller } = createHarness();
  controller.enable(authority);
  document.dispatchEvent(new MouseEvent('pointermove', { clientX: 20, clientY: 30 }));
  flushAnimationFrames();

  const root = document.querySelector<HTMLElement>('[data-sniptale-viewport-cursor]');
  document.dispatchEvent(new MouseEvent('pointerout', { relatedTarget: null }));

  expect(root?.style.visibility).toBe('hidden');
});

it('cancels a queued pointer sample when the pointer leaves before the frame', () => {
  const { controller } = createHarness();
  const readStyle = vi.spyOn(window, 'getComputedStyle');
  controller.enable(authority);
  document.dispatchEvent(new MouseEvent('pointermove', { clientX: 20, clientY: 30 }));

  expect(scheduledFrames.size).toBe(1);
  document.dispatchEvent(new MouseEvent('pointerout', { relatedTarget: null }));
  flushAnimationFrames();

  const root = document.querySelector<HTMLElement>('[data-sniptale-viewport-cursor]');
  expect(scheduledFrames.size).toBe(0);
  expect(readStyle).not.toHaveBeenCalled();
  expect(root?.style.visibility).toBe('hidden');
});

it('does not replay an authority after its terminal disable', () => {
  const { controller } = createHarness();

  controller.enable(authority);
  controller.disable(authority);
  controller.enable(authority);

  expect(controller.isEnabled()).toBe(false);
  expect(document.querySelector('[data-sniptale-viewport-cursor]')).toBeNull();
});

it('does not let a stale authority disable a newer projection', () => {
  const { controller } = createHarness();
  const newerAuthority = { generation: 1, recordingId: 'recording-2' };

  controller.disable(authority);
  controller.enable(newerAuthority);
  controller.disable(authority);

  expect(controller.isEnabled()).toBe(true);
  expect(document.querySelector('[data-sniptale-viewport-cursor]')).not.toBeNull();
});

it('removes unbound page effects on runtime disposal and can initialize again', () => {
  const { controller, removeListener } = createHarness();

  controller.enable(authority);
  const firstRoot = document.querySelector('[data-sniptale-viewport-cursor]');
  const firstStyle = document.querySelector('[data-sniptale-viewport-cursor-style]');

  controller.dispose();
  controller.dispose();

  expect(firstRoot?.isConnected).toBe(false);
  expect(firstStyle?.isConnected).toBe(false);
  expect(removeListener).toHaveBeenCalledWith('pointermove', expect.any(Function), true);
  expect(removeListener).toHaveBeenCalledWith('pointerout', expect.any(Function), true);
  expect(controller.isEnabled()).toBe(false);

  expect(controller.enable(authority)).toBe(true);
  expect(document.querySelectorAll('[data-sniptale-viewport-cursor]')).toHaveLength(1);
  expect(document.querySelectorAll('[data-sniptale-viewport-cursor-style]')).toHaveLength(1);
});

it('coalesces rapid pointer samples into the latest animation-frame projection', () => {
  const readStyle = vi.spyOn(window, 'getComputedStyle');
  const { controller } = createHarness();
  const link = document.createElement('a');
  link.href = '#target';
  document.body.append(link);
  controller.enable(authority);

  link.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 20, clientY: 30 }));
  link.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 50 }));
  link.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 80, clientY: 90 }));

  const root = document.querySelector<HTMLElement>('[data-sniptale-viewport-cursor]');
  expect(requestFrame).toHaveBeenCalledOnce();
  expect(readStyle).not.toHaveBeenCalled();
  expect(root?.style.visibility).toBe('hidden');

  flushAnimationFrames();

  expect(readStyle).toHaveBeenCalledOnce();
  expect(root?.dataset['cursorKind']).toBe('pointer');
  expect(root?.style.transform).toBe('translate3d(72px, 88px, 0)');
  expect(root?.style.visibility).toBe('visible');
});
