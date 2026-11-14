// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DrawingObject } from '../../features/drawing/public';
import { updateDrawingMarqueeDraft, updateDrawingPointerDraft } from './pointer-update';
import type { PointerEvent as ReactPointerEvent } from 'react';
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

it.each(['pointercancel', 'lostpointercapture', 'blur', 'release'] as const)(
  'clears relation-only feedback on %s and commits only a released native move',
  (ending) => {
    const scene = setupAlignmentSurface(true, 'rectangle', {
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });
    act(() =>
      scene.session.commitObject(
        {
          id: 'right',
          kind: 'rectangle',
          bounds: { x: 680, y: 100, width: 100, height: 100 },
          color: '#f00',
          width: 2,
        },
        { select: false }
      )
    );
    act(() => scene.session.select('moving'));
    scene.commit.mockClear();
    scene.event('pointerdown', 120, 110);
    scene.event('pointermove', 436, 140);
    const relations = () => scene.host.querySelectorAll('[data-relation-kind="gap"]');
    expect(relations()).toHaveLength(2);
    expect(scene.host.querySelectorAll('[data-axis]')).toHaveLength(0);
    expect(scene.moving()).toMatchObject({ bounds: { x: 80, y: 80 } });
    scene.event('pointermove', 436, 140, { altKey: true });
    expect(relations()).toHaveLength(0);
    scene.event('pointermove', 436, 140);
    expect(relations()).toHaveLength(2);
    scene.render(true);
    expect(relations()).toHaveLength(0);
    scene.render();
    expect(relations()).toHaveLength(2);
    if (ending === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    else scene.event(ending === 'release' ? 'pointerup' : ending, 436, 140);
    scene.event('pointerup', 436, 140);
    expect(scene.host.querySelector('[data-ui="content.drawing.alignment-guides"]')).toBeNull();
    expect(scene.moving()).toMatchObject({
      bounds: { x: ending === 'release' ? 400 : 80, y: ending === 'release' ? 110 : 80 },
    });
    expect(scene.commit).toHaveBeenCalledTimes(ending === 'release' ? 1 : 0);
    expect(scene.session.getSnapshot().selectedObjectIds).toEqual(['moving']);
    scene.dispose();
  }
);

it('commits an unaligned sibling width through the real native resize entry', () => {
  const scene = setupAlignmentSurface(true, 'rectangle', {
    x: 700,
    y: 300,
    width: 120,
    height: 120,
  });
  scene.event('pointerdown', 160, 110);
  scene.event('pointermove', 196, 110);
  expect(scene.host.querySelectorAll('[data-relation-kind="dimension"]')).toHaveLength(2);
  expect(scene.host.querySelectorAll('[data-axis]')).toHaveLength(0);
  scene.event('pointerup', 196, 110);
  expect(scene.moving()).toMatchObject({ bounds: { x: 80, y: 80, width: 120, height: 60 } });
  expect(scene.commit).toHaveBeenCalledOnce();
  expect(scene.host.querySelector('[data-ui="content.drawing.alignment-guides"]')).toBeNull();
  scene.dispose();
});

it('does not admit offscreen sibling relations after removing the old96px cutoff', () => {
  const scene = setupAlignmentSurface(true, 'rectangle', {
    x: 100,
    y: 100,
    width: 100,
    height: 100,
  });
  act(() =>
    scene.session.commitObject(
      {
        id: 'offscreen',
        kind: 'rectangle',
        bounds: { x: 1680, y: 100, width: 100, height: 100 },
        color: '#f00',
        width: 2,
      },
      { select: false }
    )
  );
  scene.commit.mockClear();
  scene.event('pointerdown', 120, 110);
  scene.event('pointermove', 936, 140);
  expect(scene.host.querySelectorAll('[data-relation-kind]')).toHaveLength(0);
  scene.event('pointercancel', 936, 140);
  expect(scene.commit).not.toHaveBeenCalled();
  scene.dispose();
});

it('clips relation eligibility to the real internal scroll root while preserving raw movement', () => {
  const element = document.createElement('div');
  document.body.append(element);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 300));
  const object: DrawingObject = {
    id: 'source',
    kind: 'rectangle',
    bounds: { x: 80, y: 80, width: 80, height: 60 },
    color: '#000',
    width: 2,
  };
  const peers: DrawingObject[] = [
    { ...object, id: 'left', bounds: { x: 100, y: 100, width: 100, height: 100 } },
    { ...object, id: 'clipped', bounds: { x: 680, y: 100, width: 100, height: 100 } },
  ];
  const event = {
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
  } as ReactPointerEvent<HTMLCanvasElement>;
  const result = updateDrawingPointerDraft({
    documentObjects: [object, ...peers],
    draft: { kind: 'move', original: object, object, start: { x: 120, y: 110 } },
    point: { x: 436, y: 140 },
    root: { kind: 'element', element },
    event,
    alignToPage: true,
  });
  expect(result.feedback?.relations).toEqual([]);
  expect(result.draft).toMatchObject({ kind: 'move', object: { bounds: { x: 396, y: 110 } } });
});
