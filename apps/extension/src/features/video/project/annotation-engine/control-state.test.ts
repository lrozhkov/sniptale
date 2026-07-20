import { describe, expect, it } from 'vitest';
import { resolveAnnotationScene } from './resolver';
import { createProjectAndClip, createSceneTemplate, findNode } from './resolver.test-support.ts';
import {
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlType,
  type VideoAnnotationTemplate,
  type VideoAnnotationTemplateControl,
} from './types';

describe('annotation control state resolution', () => {
  registerControlFallbackTests();
  registerControlBindingTests();
});

function registerControlFallbackTests() {
  it('keeps clip fields as fallback and lets explicit clip values win over snapshot/defaults', () => {
    const { clip, project } = createProjectAndClip();
    clip.content.headline = 'Clip headline';
    clip.templateSnapshot = {
      capturedAtSchemaVersion: 1,
      controls: { headline: 'Snapshot headline' },
      templateRef: { packId: 'test', templateId: 'scene' },
    };
    clip.templateControlValues = { headline: 'Clip control headline' };

    const scene = resolveAnnotationScene({
      clip,
      currentTime: 1.75,
      project,
      template: createSceneTemplate(),
    });

    expect(findNode(scene, 'headline').props['text']).toBe('Clip control headline');
  });

  it('falls back through snapshot values and legacy clip content before control defaults', () => {
    const { clip, project } = createProjectAndClip();
    clip.content.headline = 'Legacy headline';
    clip.templateControlValues = undefined;
    clip.templateSnapshot = {
      capturedAtSchemaVersion: 1,
      controls: { accent: '#059669', headline: 'Snapshot headline' },
      templateRef: { packId: 'test', templateId: 'scene' },
    };

    const snapshotScene = resolveAnnotationScene({
      clip,
      currentTime: 1.75,
      project,
      template: createSceneTemplate(),
    });
    expect(findNode(snapshotScene, 'headline').props['text']).toBe('Snapshot headline');
    expect(findNode(snapshotScene, 'dot').style['fill']).toBe('#059669');

    clip.templateSnapshot = undefined;
    const legacyScene = resolveAnnotationScene({
      clip,
      currentTime: 1.75,
      project,
      template: createSceneTemplate(),
    });
    expect(findNode(legacyScene, 'headline').props['text']).toBe('Legacy headline');
  });
}

function registerControlBindingTests() {
  it('applies node, theme, and template-field control branches as declarative data', () => {
    const { clip, project } = createProjectAndClip();
    clip.templateControlValues = {
      accent: '#e11d48',
      background: '#101010',
      badge: 'Beta',
      badgeText: '#fafafa',
      cardRadius: 18,
      headline: 'Resolved headline',
      headlineColor: '#ffffff',
      padding: 20,
      subline: 'Controlled subline',
      sublineColor: '#d4d4d8',
    };
    const scene = resolveAnnotationScene({
      clip,
      currentTime: 1.75,
      project,
      template: createControlTemplate(),
      theme: {
        defaults: { accent: '#2563eb', panel: '#ffffff', text: '#111111' },
        tokens: [
          { id: 'accent', type: 'color', value: '#2563eb' },
          { id: 'panel', type: 'color', value: '#ffffff' },
          { id: 'text', type: 'color', value: '#111111' },
        ],
      },
    });

    expect(findNode(scene, 'dot').style['fill']).toBe('#e11d48');
    expect(findNode(scene, 'card').style['radius']).toBe(18);
    expect(findNode(scene, 'headline').props['text']).toBe('Resolved headline');
  });
}

function createControlTemplate(): VideoAnnotationTemplate {
  const template = createSceneTemplate();
  return {
    ...template,
    controls: [
      ...template.controls,
      createFieldControl('badge', 'content.badge', 'Badge'),
      createFieldControl('subline', 'content.subline', 'Subline'),
      createFieldControl('background', 'style.backgroundColor', '#101010'),
      createFieldControl('badgeText', 'style.badgeTextColor', '#ffffff'),
      createFieldControl('headlineColor', 'style.headlineColor', '#ffffff'),
      createFieldControl('sublineColor', 'style.sublineColor', '#dddddd'),
      createFieldControl('padding', 'style.padding', 18),
      {
        binding: {
          kind: VideoAnnotationControlBindingKind.NODE_PROPERTY,
          nodeId: 'card',
          property: 'radius',
        },
        defaultValue: 12,
        id: 'cardRadius',
        label: { fallback: 'Radius' },
        type: VideoAnnotationControlType.NUMBER,
      },
    ],
  };
}

function createFieldControl(
  id: string,
  field:
    | 'content.badge'
    | 'content.subline'
    | 'style.backgroundColor'
    | 'style.badgeTextColor'
    | 'style.headlineColor'
    | 'style.padding'
    | 'style.sublineColor',
  defaultValue: number | string
): VideoAnnotationTemplateControl {
  return {
    binding: {
      field,
      kind: VideoAnnotationControlBindingKind.TEMPLATE_FIELD,
    },
    defaultValue,
    id,
    label: { fallback: id },
    type:
      typeof defaultValue === 'number'
        ? VideoAnnotationControlType.NUMBER
        : VideoAnnotationControlType.TEXT,
  };
}
