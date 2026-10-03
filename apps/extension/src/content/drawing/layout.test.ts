// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { DrawingSurface } from './surface';
import { renderDrawingObject } from './render';
vi.mock('./render', () => ({ renderDrawingObject: vi.fn() }));
import { afterEach, expect, it, vi } from 'vitest';
import { createContentDrawingController } from './controller';
import { createDrawingLayout } from './layout';
import { createDrawingSession, type DrawingDocumentCommit } from '../../features/drawing/public';

vi.mock('../parser/page-preparation/history', () => ({
  pagePreparationHistory: { commitEntry: () => true, subscribeToClear: () => () => undefined },
}));

const controllers: ReturnType<typeof createContentDrawingController>[] = [];
afterEach(() => {
  controllers.forEach((controller) => controller.session.dispose());
  controllers.length = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture() {
  const target = document.createElement('p');
  target.textContent = 'Page text';
  document.body.append(target);
  let rect = new DOMRect(300, 100, 400, 80);
  vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => rect);
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: () => [target, document.body],
  });
  const controller = createContentDrawingController();
  controllers.push(controller);
  controller.session.commitObject({
    id: 'ink',
    kind: 'rectangle',
    bounds: { x: 310, y: 110, width: 30, height: 20 },
    color: '#000',
    width: 2,
  });
  return {
    controller,
    target,
    move: (x: number, y: number) => {
      rect = new DOMRect(x, y, 400, 80);
    },
  };
}

it('moves ink with its page element after reflow without stretching or a history commit', () => {
  const { controller, move } = fixture();
  const revision = controller.session.getSnapshot().revision;
  move(100, 150);
  expect(controller.session.getSnapshot().document.objects[0]).toMatchObject({
    bounds: { x: 110, y: 160, width: 30, height: 20 },
  });
  expect(controller.session.getSnapshot().revision).toBe(revision);
});

it('keeps the latest position when the target disappears', () => {
  const { controller, move, target } = fixture();
  move(100, 150);
  controller.session.getSnapshot();
  target.remove();
  expect(controller.session.getSnapshot().document.objects[0]).toMatchObject({
    bounds: { x: 110, y: 160 },
  });
});

it('duplicates at the displayed position after reflow', () => {
  const { controller, move } = fixture();
  move(100, 150);
  controller.session.duplicateSelected();
  expect(controller.session.getSnapshot().document.objects[1]).toMatchObject({
    bounds: { x: 122, y: 172 },
  });
});

it('replays immutable versions against current layout and returns exactly to the original position', () => {
  const { target, move } = fixture();
  const layout = createDrawingLayout(() => ({
    kind: 'document',
    element: document.documentElement,
  }));
  const commits: DrawingDocumentCommit[] = [];
  const session = createDrawingSession({
    objectProjection: layout.projection,
    onDocumentCommit: (commit) => {
      commits.push(commit);
      return true;
    },
  });
  session.commitObject({
    id: 'box',
    kind: 'rectangle',
    bounds: { x: 310, y: 110, width: 30, height: 20 },
    color: '#000',
    width: 2,
  });
  move(100, 150);
  const object = session.getSnapshot().document.objects[0]!;
  if (object.kind !== 'rectangle') throw new Error('Expected rectangle');
  session.replaceObject({ ...object, bounds: { ...object.bounds, x: 130 } });
  move(200, 200);
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 230, y: 210 } });
  const edit = commits[1]!;
  edit.replay(edit.before);
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 210, y: 210 } });
  edit.replay(edit.after);
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 230, y: 210 } });
  edit.replay(edit.before);
  move(300, 100);
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 310, y: 110 } });
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ bounds: { x: 310, y: 110 } });
  expect(target.isConnected).toBe(true);
  session.dispose();
  layout.dispose();
});

it('does not count vertical document scrolling as scene reflow', () => {
  const { move } = fixture();
  const layout = createDrawingLayout(() => ({
    kind: 'document',
    element: document.documentElement,
  }));
  const object = {
    id: 'box',
    kind: 'blur' as const,
    bounds: { x: 310, y: 110, width: 30, height: 20 },
  };
  layout.projection.capture(object);
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(50);
  move(300, 50);
  expect(layout.projection.resolve(object)).toBe(object);
  layout.dispose();
});

it('retains free drawing coordinates when no page element is under the drawing', () => {
  const { controller } = fixture();
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
  controller.session.commitObject({
    id: 'free',
    kind: 'blur',
    bounds: { x: 900, y: 700, width: 20, height: 20 },
  });
  expect(controller.session.getSnapshot().document.objects[1]).toMatchObject({
    bounds: { x: 900, y: 700 },
  });
});

it('redraws a mounted drawing surface on resize using the projected scene', () => {
  const { controller, move } = fixture();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(createElement(DrawingSurface, { active: false, chromeHidden: true, controller }))
    );
    move(100, 150);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(renderDrawingObject).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ bounds: { x: 110, y: 160, width: 30, height: 20 } }),
      expect.anything(),
      expect.anything()
    );
  } finally {
    act(() => root.unmount());
  }
});

it.each([false, true])(
  'retains the original anchor across edits when it is disconnected: %s',
  (disconnected) => {
    const { controller, target, move } = fixture();
    move(100, 150);
    const original = controller.session.getSnapshot().document.objects[0]!;
    const replacementTarget = document.createElement('p');
    document.body.append(replacementTarget);
    let replacementRect = new DOMRect(100, 150, 400, 80);
    vi.spyOn(replacementTarget, 'getBoundingClientRect').mockImplementation(() => replacementRect);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [replacementTarget],
    });
    if (disconnected) target.remove();
    if (original.kind !== 'rectangle') throw new Error('Expected rectangle');
    const edited = { ...original, color: '#ff0000' };
    controller.session.previewObjects([edited]);
    controller.session.replaceObject(edited);
    replacementRect = new DOMRect(500, 500, 400, 80);
    move(150, 200);
    expect(controller.session.getSnapshot().document.objects[0]).toMatchObject({
      bounds: disconnected ? { x: 110, y: 160 } : { x: 160, y: 210 },
      color: '#ff0000',
    });
  }
);

it('does not attach a previously free object when a page element appears beneath an edit', () => {
  const { controller, target } = fixture();
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
  controller.session.commitObject({
    id: 'free',
    kind: 'blur',
    bounds: { x: 310, y: 110, width: 30, height: 20 },
  });
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: () => [target],
  });
  const object = controller.session.getSnapshot().document.objects[1]!;
  if (object.kind !== 'blur') throw new Error('Expected blur');
  controller.session.replaceObject({ ...object, amount: 20 });
  expect(
    controller.getObjectAnchor?.(controller.session.getSnapshot().document.objects[1]!)
  ).toBeNull();
});
