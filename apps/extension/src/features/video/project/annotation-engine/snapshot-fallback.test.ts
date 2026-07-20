import { describe, expect, it } from 'vitest';
import { createProjectAndClip, createSceneTemplate } from './resolver.test-support.ts';
import { createVideoAnnotationTemplateSnapshot } from './registry';
import { resolveClipAnnotationScene } from './resolver';
import { VideoOverlayTemplateKind } from '../types/index';

describe('annotation template snapshot fallback', () => {
  registerSnapshotRenderFallbackTests();
  registerSnapshotLegacyFallbackTests();
});

function registerSnapshotRenderFallbackTests() {
  it('renders deleted custom pack templates from the clip snapshot and captured theme', () => {
    const { clip, project } = createProjectAndClip();
    const template = createSceneTemplate();
    const theme = {
      defaults: { accent: '#13c2c2', panel: '#101828', text: '#f8fafc' },
      tokens: [
        { id: 'accent', type: 'color', value: '#13c2c2' },
        { id: 'panel', type: 'color', value: '#101828' },
        { id: 'text', type: 'color', value: '#f8fafc' },
      ],
    } as const;
    const missingRef = { packId: 'deleted.user-pack', templateId: template.id };

    const scene = resolveClipAnnotationScene({
      clip: {
        ...clip,
        templateControlValues: { headline: 'Snapshot headline' },
        templateRef: missingRef,
        templateSnapshot: createVideoAnnotationTemplateSnapshot(
          missingRef,
          { headline: 'Snapshot headline' },
          template,
          { label: { fallback: 'Deleted pack' }, theme }
        ),
      },
      currentTime: 1.25,
      project,
    });

    expect(scene.nodes.find((node) => node.id === 'card')?.style['fill']).toBe('#101828');
    expect(scene.nodes.find((node) => node.id === 'headline')?.style['fill']).toBe('#f8fafc');
  });
}

function registerSnapshotLegacyFallbackTests() {
  it('omits optional snapshot pack metadata and keeps legacy registry theme fallback', () => {
    const { clip, project } = createProjectAndClip();
    const ref = { packId: 'missing.user-pack', templateId: 'missing-template' };
    const snapshot = createVideoAnnotationTemplateSnapshot(ref, {});

    const scene = resolveClipAnnotationScene({
      clip: {
        ...clip,
        templateKind: VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
        templateRef: ref,
        templateSnapshot: snapshot,
      },
      currentTime: 1.25,
      project,
    });

    expect(snapshot).not.toHaveProperty('packLabel');
    expect(snapshot).not.toHaveProperty('packTheme');
    expect(scene.renderTree.id).toBe('root');
    expect(scene.nodes.length).toBeGreaterThan(1);
  });
}
