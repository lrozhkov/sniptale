import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoClip } from '../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';
import { resolveOrderedVisualPassLayers } from './visual-pass-layers';
it('preserves actions-only projections through ordered export passes without drawing the original video twice', () => {
  const project = createEmptyVideoProject('Composite');
  project.clips = [createVideoClip({ id: 'video', trackId: project.tracks[0]!.id })];
  const layer = resolveVideoCompositionFrame(project, 0).visualLayers[0]!;
  expect(layer).toBeDefined();
  const projected = { ...layer, effectActionsOnly: true };
  expect(resolveOrderedVisualPassLayers([projected], [layer])).toEqual([projected]);
  expect(resolveOrderedVisualPassLayers([layer], [layer])[0]).toBe(layer);
  expect(resolveOrderedVisualPassLayers([projected], [])).toEqual([]);
  expect(layer.effectActionsOnly).toBeUndefined();
});
