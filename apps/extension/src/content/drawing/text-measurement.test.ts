// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  measureContentDrawingText,
  measureContentDrawingTextLayout,
  ContentDrawingTextProjection,
} from './text-measurement';
import { resolveDrawingTextInkLayout, type DrawingObject } from '../../features/drawing/public';

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'fonts');
});

it('uses the same measured rows, ink bounds and backgrounds as the common layout', () => {
  const context = document.createElement('canvas').getContext('2d')!;
  context.font = '24px sans-serif';
  const args = { text: 'Any font\n123   \n', fontSize: 24, wrapWidth: 140, autoWidth: true };
  expect(measureContentDrawingTextLayout({ ...args, fontFamilyCss: 'sans-serif' })).toEqual(
    resolveDrawingTextInkLayout({ ...args, measure: (text) => context.measureText(text) })
  );
});
it('keeps editable source geometry when canvas resources are unavailable', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  expect(
    measureContentDrawingText({ fontFamily: 'handwritten', fontSize: 24, line: 'Text' })
  ).toBeCloseTo(52.8);
  const layout = measureContentDrawingTextLayout({
    text: 'Keep me',
    fontSize: 24,
    wrapWidth: 300,
    autoWidth: true,
  });
  expect(layout.lines.join('\n')).toBe('Keep me');
  expect(Number.isFinite(layout.height)).toBe(true);
});
it('caches derived geometry without changing source identity or authored data', () => {
  const object: DrawingObject = {
    id: 'projected',
    kind: 'text',
    text: 'Word',
    fontSize: 24,
    bounds: { x: 10, y: 20, width: 200, height: 90 },
    color: '#111111',
    backgroundColor: null,
    autoWidth: true,
    wrapWidth: 400,
  };
  const projection = new ContentDrawingTextProjection();
  const before = JSON.stringify(object);
  const fitted = projection.resolve(object);
  expect(fitted).not.toBe(object);
  expect(fitted.id).toBe(object.id);
  expect(fitted.kind === 'text' && fitted.bounds.height).toBeLessThan(90);
  expect(projection.resolve(object)).toBe(fitted);
  expect(JSON.stringify(object)).toBe(before);
  projection.dispose();
});
it('does not publish late font completion after disposal', async () => {
  let finish!: (faces: unknown[]) => void;
  const pending = new Promise<unknown[]>((resolve) => {
    finish = resolve;
  });
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { check: () => false, load: () => pending },
  });
  const changed = vi.fn();
  const projection = new ContentDrawingTextProjection(changed);
  projection.resolve({
    id: 'late',
    kind: 'text',
    text: 'Text',
    fontSize: 24,
    color: '#111',
    backgroundColor: null,
    bounds: { x: 0, y: 0, width: 100, height: 30 },
  });
  projection.dispose();
  finish([{}]);
  await pending;
  await Promise.resolve();
  expect(changed).not.toHaveBeenCalled();
});

it('publishes font geometry without an authored commit or recreating a deleted identity', async () => {
  const { createDrawingSession } = await import('../../features/drawing/public');
  let ready = false;
  let finish!: (faces: unknown[]) => void;
  const pending = new Promise<unknown[]>((resolve) => {
    finish = resolve;
  });
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { check: () => ready, load: () => pending },
  });
  const projection = new ContentDrawingTextProjection();
  const commit = vi.fn(() => true);
  const session = createDrawingSession({
    objectProjection: projection,
    onDocumentCommit: commit,
    onDispose: () => projection.dispose(),
  });
  const listener = vi.fn();
  session.subscribe(listener);
  session.commitObject({
    id: 'font-pending',
    kind: 'text',
    text: 'Text',
    fontSize: 24,
    color: '#111111',
    backgroundColor: null,
    autoWidth: true,
    wrapWidth: 300,
    bounds: { x: 10, y: 20, width: 200, height: 90 },
  });
  const source = commit.mock.calls.length;
  const notifications = listener.mock.calls.length;
  ready = true;
  finish([{}]);
  await pending;
  await Promise.resolve();
  expect(listener.mock.calls.length).toBeGreaterThan(notifications);
  expect(commit).toHaveBeenCalledTimes(source);
  session.deleteObjects(['font-pending']);
  expect(session.getSnapshot().document.objects).toEqual([]);
  session.dispose();
});
