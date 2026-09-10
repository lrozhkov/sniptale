// @vitest-environment jsdom
import type React from 'react';
import { expect, it, vi } from 'vitest';
import { createTrackEffectDropHandlers } from './effect-drop';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { createTimelineProjection } from '../../interaction-state/projection';
import { VIDEO_EDITOR_EFFECT_DOCUMENT_DRAG_MIME } from '../../../../contracts/effect-document-drag';

function event(kind: 'standalone' | 'targetEffect' | 'transition') {
  const lane = document.createElement('div');
  lane.getBoundingClientRect = () => ({ left: 100 }) as DOMRect;
  return {
    clientX: 200,
    currentTarget: lane,
    target: lane,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      types: [VIDEO_EDITOR_EFFECT_DOCUMENT_DRAG_MIME],
      getData: () => JSON.stringify({ packId: 'pack', documentId: 'doc', kind }),
    },
  } as unknown as React.DragEvent<HTMLDivElement>;
}
it('routes an annotation to its hovered track and scrolled time without seeking', () => {
  const project = createEmptyVideoProject('drop');
  const onDrop = vi.fn();
  const handlers = createTrackEffectDropHandlers({
    project,
    track: project.tracks[0]!,
    pixelsPerSecond: 50,
    projection: createTimelineProjection({
      extentSeconds: 50,
      pixelsPerSecond: 50,
      viewportWidth: 500,
      startTime: 10,
    }),
    onDrop,
    onHighlight: vi.fn(),
  });
  const e = event('standalone');
  expect(handlers.onDragOver(e)).toBe(true);
  handlers.onDrop(e);
  expect(onDrop).toHaveBeenCalledWith(
    { packId: 'pack', documentId: 'doc', kind: 'standalone' },
    { kind: 'scene' },
    12,
    project.tracks[0]!.id,
    null
  );
});
it('rejects locked/audio tracks and transitions on blank lanes; blank video lanes target their track', () => {
  const project = createEmptyVideoProject('drop');
  const onDrop = vi.fn();
  for (const patch of [{ locked: true }, { kind: 'AUDIO' as const }]) {
    const h = createTrackEffectDropHandlers({
      project,
      track: { ...project.tracks[0]!, ...patch },
      pixelsPerSecond: 50,
      onDrop,
      onHighlight: vi.fn(),
    });
    h.onDrop(event('standalone'));
  }
  const h = createTrackEffectDropHandlers({
    project,
    track: project.tracks[0]!,
    pixelsPerSecond: 50,
    onDrop,
    onHighlight: vi.fn(),
  });
  h.onDrop(event('transition'));
  expect(onDrop).not.toHaveBeenCalled();
  h.onDrop(event('targetEffect'));
  expect(onDrop).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'targetEffect' }),
    { kind: 'track', trackId: project.tracks[0]!.id },
    2
  );
});

it('applies video effects to the actual clip under the pointer', async () => {
  const { createVideoClip } =
    await import('../../../../../features/video/project/timeline/project-meta.test.helpers');
  const project = createEmptyVideoProject('FX');
  project.clips = [createVideoClip({ id: 'video', trackId: project.tracks[0]!.id, startTime: 2 })];
  const onDrop = vi.fn();
  const h = createTrackEffectDropHandlers({
    project,
    track: project.tracks[0]!,
    pixelsPerSecond: 50,
    onDrop,
    onHighlight: vi.fn(),
  });
  const e = event('targetEffect');
  const clip = document.createElement('div');
  clip.setAttribute('data-project-timeline-clip', 'video');
  Object.defineProperty(e, 'target', { value: clip });
  h.onDrop(e);
  expect(onDrop).toHaveBeenCalledWith(
    { packId: 'pack', documentId: 'doc', kind: 'targetEffect' },
    { kind: 'clip', clipId: 'video' },
    2
  );
});
