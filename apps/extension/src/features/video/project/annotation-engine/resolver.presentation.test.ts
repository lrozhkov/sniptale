import { describe, expect, it } from 'vitest';
import type { VideoProject } from '../types/index';
import { VideoOverlayTemplateKind, VideoTemplateDirection } from '../types/index';
import { resolveAnnotationScene } from './resolver';
import { createProjectAndClip, createSceneTemplate } from './resolver.test-support.ts';

describe('annotation scene presentation branches', () => {
  it('uses direct clip opacity when the project has no timeline track arrays', () => {
    const { clip, project } = createProjectAndClip();
    const scene = resolveAnnotationScene({
      clip,
      currentTime: 1.4,
      project: { height: project.height, width: project.width } as VideoProject,
      template: createSceneTemplate(),
    });

    expect(scene.frame.opacity).toBeGreaterThan(0);
  });

  it('resolves side reveal label frames from project direction instead of clip geometry', () => {
    const { clip, project } = createProjectAndClip();
    const template = createSceneTemplate();
    const sidePanelClip = {
      ...clip,
      direction: VideoTemplateDirection.RIGHT,
      templateKind: VideoOverlayTemplateKind.SIDE_REVEAL_PANEL,
    };

    const scene = resolveAnnotationScene({
      clip: sidePanelClip,
      currentTime: 1.4,
      project,
      template,
    });

    expect(scene.presentation.labelFrame).toEqual({
      height: project.height,
      width: Math.round(project.width * 0.34),
      x: project.width - Math.round(project.width * 0.34),
      y: 0,
    });
  });
});
