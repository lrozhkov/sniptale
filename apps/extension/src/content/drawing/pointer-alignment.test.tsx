// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DrawingObject } from '../../features/drawing/public';
import { updateDrawingMarqueeDraft } from './pointer-update';
import type { PointerDraft } from './interaction';
import { setupAlignmentSurface } from './pointer-runtime.test-support';

vi.mock('../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/dom-host')>()),
  toggleContentHostClass: vi.fn(),
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['move', 'resize'] as const)(
  'commits an aligned blur %s through the surface and supports Alt bypass',
  (kind) => {
    const scene = setupAlignmentSurface(true, 'blur');
    const start = kind === 'move' ? { x: 120, y: 110 } : { x: 160, y: 140 };
    const end = kind === 'move' ? { x: 344, y: 234 } : { x: 296, y: 196 };
    scene.event('pointerdown', start.x, start.y);
    scene.event('pointermove', end.x, end.y, { altKey: true });
    expect(scene.host.querySelector('[data-ui="content.drawing.alignment-guides"]')).toBeNull();
    scene.event('pointermove', end.x, end.y);
    expect(
      scene.host.querySelectorAll('[data-ui="content.drawing.alignment-guides"] line')
    ).toHaveLength(2);
    expect(scene.commit).not.toHaveBeenCalled();
    scene.event('pointerup', end.x, end.y);
    expect(scene.moving()).toMatchObject({
      bounds:
        kind === 'move'
          ? { x: 300, y: 200, width: 80, height: 60 }
          : { x: 80, y: 80, width: 220, height: 120 },
    });
    expect(scene.commit).toHaveBeenCalledOnce();
    scene.dispose();
  }
);

it.each([false, true])(
  'constrains a Shift move to its dominant axis and keeps the magnet off the locked axis with group=%s',
  (group) => {
    const scene = setupAlignmentSurface(true, 'rectangle', {
      x: 300,
      y: 83,
      width: 200,
      height: 160,
    });
    if (group) {
      act(() => {
        scene.session.commitObject({
          id: 'member',
          kind: 'blur',
          bounds: { x: 180, y: 80, width: 40, height: 20 },
        });
        scene.session.setSelection(['moving', 'member']);
      });
      scene.commit.mockClear();
    }
    scene.event('pointerdown', 120, 110, { shiftKey: true });
    scene.event('pointermove', 344, 114, { shiftKey: true });
    const guides = () =>
      scene.host.querySelectorAll('[data-ui="content.drawing.alignment-guides"] line');
    expect(guides()).toHaveLength(1);
    expect(guides()[0]?.getAttribute('y1')).toBe('72');
    scene.event('pointerup', 344, 114, { shiftKey: true });
    expect(scene.moving()).toMatchObject({ bounds: { x: 300, y: 80 } });
    if (group)
      expect(
        scene.session.getSnapshot().document.objects.find((object) => object.id === 'member')
      ).toMatchObject({ bounds: { x: 400, y: 80 } });
    expect(scene.commit).toHaveBeenCalledOnce();
    scene.dispose();
  }
);
it('releases Shift back to raw movement from the original without accumulating corrections', () => {
  const scene = setupAlignmentSurface();
  scene.event('pointerdown', 120, 110);
  scene.event('pointermove', 144, 234, { shiftKey: true, altKey: true });
  scene.event('pointermove', 144, 234, { altKey: true });
  scene.event('pointerup', 144, 234, { altKey: true });
  expect(scene.moving()).toMatchObject({ bounds: { x: 104, y: 204 } });
  expect(scene.commit).toHaveBeenCalledOnce();
  scene.dispose();
});

it('constrains a vertical Shift move and suppresses horizontal magnet corrections', () => {
  const scene = setupAlignmentSurface(true, 'rectangle', {
    x: 83,
    y: 300,
    width: 200,
    height: 160,
  });
  scene.event('pointerdown', 120, 110);
  scene.event('pointermove', 124, 334, { shiftKey: true });
  const guides = scene.host.querySelectorAll('[data-ui="content.drawing.alignment-guides"] line');
  expect(guides).toHaveLength(1);
  expect(guides[0]?.getAttribute('data-axis')).toBe('y');
  scene.event('pointerup', 124, 334, { shiftKey: true });
  expect(scene.moving()).toMatchObject({ bounds: { x: 80, y: 300 } });
  expect(scene.commit).toHaveBeenCalledOnce();
  scene.dispose();
});
it.each([1, 2])(
  'constrains deferred marquee conversion to a Shift move for %s members',
  (count) => {
    const moveObjects: DrawingObject[] = Array.from({ length: count }, (_, index) => ({
      id: `member-${index}`,
      kind: 'blur',
      bounds: { x: 20 + index * 40, y: 30, width: 20, height: 20 },
    }));
    const draft: Extract<PointerDraft, { kind: 'marquee' }> = {
      kind: 'marquee',
      start: { x: 30, y: 40 },
      current: { x: 30, y: 40 },
      initialSelectionIds: [],
      clickObjectId: 'member-0',
      moveObjects,
      mode: 'replace',
    };
    const result = updateDrawingMarqueeDraft(draft, { x: 54, y: 44 }, moveObjects, true).draft;
    if (result.kind === 'move') expect(result.object).toMatchObject({ bounds: { x: 44, y: 30 } });
    else if (result.kind === 'move-selection')
      expect(result.objects.map((object) => ('bounds' in object ? object.bounds : null))).toEqual([
        { x: 44, y: 30, width: 20, height: 20 },
        { x: 84, y: 30, width: 20, height: 20 },
      ]);
    else throw new Error('Expected a move draft');
  }
);
