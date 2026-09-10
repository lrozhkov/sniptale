// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { resolveEffectV1EditorRegion } from '@sniptale/runtime-contracts/effect-v1';
import { beginEditorRegionGesture } from './gesture';
import { mapRegionPoint, resolveEditorRegionModel, resizeEditorRegion } from './model';
import { projectFixture } from './fixture.test-support';
it('maps the fitted clip input through rotation without changing its source clip', () => {
  const project = projectFixture();
  const original = structuredClone(project);
  const model = resolveEditorRegionModel(project, 'fx', 1)!;
  expect(model.size).toEqual({ width: 800, height: 450 });
  const point = { x: 250, y: 180 };
  const mapped = mapRegionPoint(model, mapRegionPoint(model, point), true);
  expect(mapped.x).toBeCloseTo(point.x);
  expect(mapped.y).toBeCloseTo(point.y);
  const controls = resizeEditorRegion(model, 'nw', 100000, 100000);
  const resized = resolveEffectV1EditorRegion(model.document, controls, model.size)!;
  expect(resized.x + resized.width).toBeCloseTo(model.rect.x + model.rect.width);
  expect(resized.y + resized.height).toBeCloseTo(model.rect.y + model.rect.height);
  expect(project).toEqual(original);
});
it.each(['track', 'video-group'] as const)(
  'uses scene dimensions for %s and omits locked/inactive effects',
  (kind) => {
    const project = projectFixture();
    project.effectInstances![0]!.target =
      kind === 'track' ? { kind, trackId: project.tracks[0]!.id } : { kind };
    expect(resolveEditorRegionModel(project, 'fx', 1)?.size).toEqual({ width: 1280, height: 720 });
    expect(resolveEditorRegionModel(project, 'fx', 7)).toBeNull();
    project.tracks[0]!.locked = true;
    expect(resolveEditorRegionModel(project, 'fx', 1)).toBeNull();
  }
);

it('commits one four-control gesture and cancels Escape/unmount without writing', () => {
  const model = resolveEditorRegionModel(projectFixture(), 'fx', 1)!;
  const preview = vi.fn();
  const commit = vi.fn();
  const begin = () =>
    beginEditorRegionGesture({
      model,
      mode: 'move',
      origin: { x: 0, y: 0 },
      pointerId: 1,
      mapPoint: (event) => ({ x: event.clientX, y: event.clientY }),
      preview,
      commit,
    });
  const move = () => {
    const event = new MouseEvent('pointermove', { clientX: 20, clientY: 10 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    window.dispatchEvent(event);
  };
  const cleanup = begin();
  move();
  move();
  window.dispatchEvent(new Event('pointerup'));
  cleanup();
  expect(commit).toHaveBeenCalledTimes(1);
  expect(Object.keys(commit.mock.calls[0]![0])).toHaveLength(4);
  expect(preview).toHaveBeenLastCalledWith(null);
  commit.mockClear();
  const cancel = begin();
  move();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  cancel();
  expect(commit).not.toHaveBeenCalled();
  const unmount = begin();
  move();
  unmount();
  expect(commit).not.toHaveBeenCalled();
  expect(document.querySelector('[data-video-editor-pointer-cursor]')).toBeNull();
});
