// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createVideoProjectSceneEdges } from '../../project/scene/edge-fades';
import { drawVideoProjectSceneEdges } from './scene-edges';

afterEach(() => vi.restoreAllMocks());
function fixture() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d')!;
  const sceneEdges = createVideoProjectSceneEdges();
  sceneEdges.intro = { enabled: true, duration: 2, color: '#ff0000ff' };
  sceneEdges.outro = { enabled: true, duration: 2, color: '#0000ffff' };
  return { context, project: { duration: 10, sceneEdges } };
}

it('keeps missing and disabled scene edges neutral without touching the output context', () => {
  const { context } = fixture();
  const fill = vi.spyOn(context, 'fillRect');
  const save = vi.spyOn(context, 'save');
  drawVideoProjectSceneEdges(context, { duration: 10 }, 0);
  drawVideoProjectSceneEdges(
    context,
    { duration: 10, sceneEdges: createVideoProjectSceneEdges() },
    10
  );
  expect(fill).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

it('paints independent colors in backing space after camera and shadow state', () => {
  const { context, project } = fixture();
  const states: unknown[] = [];
  const fill = vi.spyOn(context, 'fillRect').mockImplementation((...bounds) => {
    states.push({
      bounds,
      alpha: context.globalAlpha,
      color: context.fillStyle,
      filter: context.filter,
      shadow: context.shadowBlur,
      composite: context.globalCompositeOperation,
    });
  });
  const transform = vi.spyOn(context, 'setTransform');
  context.shadowBlur = 20;
  context.filter = 'blur(8px)';
  drawVideoProjectSceneEdges(context, project, 1, { x: 10, y: 20, width: 200, height: 100 });
  drawVideoProjectSceneEdges(context, project, 9);
  expect(transform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  expect(fill).toHaveBeenCalledTimes(2);
  expect(states).toEqual([
    {
      bounds: [10, 20, 200, 100],
      alpha: 0.5,
      color: '#ff0000',
      filter: 'none',
      shadow: 0,
      composite: 'source-over',
    },
    {
      bounds: [0, 0, 640, 360],
      alpha: 0.5,
      color: '#0000ff',
      filter: 'none',
      shadow: 0,
      composite: 'source-over',
    },
  ]);
});

it('restores the owning context when final painting fails', () => {
  const { context, project } = fixture();
  const restore = vi.spyOn(context, 'restore');
  vi.spyOn(context, 'fillRect').mockImplementation(() => {
    throw new Error('Context lost');
  });
  expect(() => drawVideoProjectSceneEdges(context, project, 0)).toThrow('Context lost');
  expect(restore).toHaveBeenCalledOnce();
});
