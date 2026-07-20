import { describe, expect, it } from 'vitest';
import {
  APPLE_GLASS_ANNOTATION_PACK,
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlType,
  VideoAnnotationElementKind,
  VideoAnnotationTargetBindingKind,
  type VideoAnnotationTemplate,
} from '../annotation-engine';
import { createEmptyVideoProject } from '../factories/creation';
import { VideoOverlayTemplateKind } from '../types/index';
import { createAnnotationClip } from './template';
import {
  createTemplateRefAnnotationClip,
  isAnnotationTemplateCreateInput,
  type VideoAnnotationTemplateCreateInput,
} from './template-input';

describe('annotation template-ref creation input', () => {
  registerTemplateInputGuardTests();
  registerTemplateInputMappingTests();
  registerTemplateInputSnapshotTests();
});

function registerTemplateInputGuardTests() {
  it('narrows template create inputs without accepting legacy template kinds', () => {
    const template = APPLE_GLASS_ANNOTATION_PACK.templates.title[0]!;
    const input = createInput(template);

    expect(isAnnotationTemplateCreateInput(input)).toBe(true);
    expect(isAnnotationTemplateCreateInput(VideoOverlayTemplateKind.CALLOUT_CARD)).toBe(false);
  });
}

function registerTemplateInputMappingTests() {
  it('maps declarative targets and element kinds to compatible legacy geometry', () => {
    expect(createClipFor(APPLE_GLASS_ANNOTATION_PACK.templates.callout[0]!).templateKind).toBe(
      VideoOverlayTemplateKind.CALLOUT_CONNECTOR
    );
    expect(createClipFor(APPLE_GLASS_ANNOTATION_PACK.templates.focus[0]!).templateKind).toBe(
      VideoOverlayTemplateKind.FOCUS_SCAN_FRAME
    );
    expect(createClipFor(rectCalloutTemplate()).templateKind).toBe(
      VideoOverlayTemplateKind.CALLOUT_CARD
    );
    expect(createClipFor(APPLE_GLASS_ANNOTATION_PACK.templates.title[0]!).templateKind).toBe(
      VideoOverlayTemplateKind.TITLE_REVEAL
    );
    expect(createClipFor(APPLE_GLASS_ANNOTATION_PACK.templates.scene[0]!).templateKind).toBe(
      VideoOverlayTemplateKind.SCENE_PROGRESS_CARD
    );
    expect(createClipFor(noneCalloutTemplate()).templateKind).toBe(
      VideoOverlayTemplateKind.SIDE_NOTE
    );
    expect(createClipFor(noneFocusTemplate()).templateKind).toBe(
      VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD
    );
    expect(createClipFor(APPLE_GLASS_ANNOTATION_PACK.templates.lowerThird[0]!).templateKind).toBe(
      VideoOverlayTemplateKind.LOWER_THIRD_BASIC
    );
  });

  it('uses modern template geometry instead of inheriting right-edge legacy fallback frames', () => {
    const clip = createClipFor(APPLE_GLASS_ANNOTATION_PACK.templates.callout[0]!);

    expect(clip.transform.x).toBeLessThan(1280 * 0.25);
    expect(clip.transform.width).toBeGreaterThan(1280 * 0.5);
    expect(clip.transform.width).toBeLessThan(1280 * 0.72);
    expect(clip.targetPoint).toEqual({
      x: Math.round(clip.transform.x + clip.transform.width * 0.18),
      y: Math.round(clip.transform.y + clip.transform.height * 0.5),
    });
  });
}

function registerTemplateInputSnapshotTests() {
  it('applies content and style field defaults into the created clip snapshot', () => {
    const clip = createClipFor(fieldDefaultsTemplate());

    expect(clip.content).toMatchObject({
      badge: null,
      headline: 'Field headline',
      subline: 'Field subline',
    });
    expect(clip.style).toMatchObject({
      accentColor: '#0284c7',
      backgroundColor: '#f8fafc',
      borderRadius: 18,
      headlineColor: '#0f172a',
      padding: 24,
      sublineColor: '#475569',
    });
    expect(clip.templateSnapshot?.controls).toEqual(clip.templateControlValues);
    expect(clip.templateSnapshot?.packTheme).toBe(APPLE_GLASS_ANNOTATION_PACK.theme);
  });
}

function createClipFor(template: VideoAnnotationTemplate) {
  const project = createEmptyVideoProject('Template input', 1280, 720);
  return createTemplateRefAnnotationClip(createInput(template), (templateKind) =>
    createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 0, templateKind)
  );
}

function createInput(template: VideoAnnotationTemplate): VideoAnnotationTemplateCreateInput {
  return {
    pack: APPLE_GLASS_ANNOTATION_PACK,
    packLabel: APPLE_GLASS_ANNOTATION_PACK.label,
    packTheme: APPLE_GLASS_ANNOTATION_PACK.theme,
    template,
    templateRef: { packId: APPLE_GLASS_ANNOTATION_PACK.packId, templateId: template.id },
  };
}

function rectCalloutTemplate(): VideoAnnotationTemplate {
  return {
    ...APPLE_GLASS_ANNOTATION_PACK.templates.callout[0]!,
    id: 'rect-callout-test',
    target: { kind: VideoAnnotationTargetBindingKind.RECT, required: true },
  };
}

function noneCalloutTemplate(): VideoAnnotationTemplate {
  return {
    ...APPLE_GLASS_ANNOTATION_PACK.templates.callout[0]!,
    id: 'none-callout-test',
    target: { kind: VideoAnnotationTargetBindingKind.NONE, required: false },
  };
}

function noneFocusTemplate(): VideoAnnotationTemplate {
  return {
    ...APPLE_GLASS_ANNOTATION_PACK.templates.focus[0]!,
    id: 'none-focus-test',
    target: { kind: VideoAnnotationTargetBindingKind.NONE, required: false },
  };
}

function fieldDefaultsTemplate(): VideoAnnotationTemplate {
  return {
    controls: [
      fieldControl('headline', 'content.headline', 'Field headline'),
      fieldControl('subline', 'content.subline', 'Field subline'),
      fieldControl('badge', 'content.badge', 12),
      fieldControl('accent', 'style.accentColor', '#0284c7'),
      fieldControl('background', 'style.backgroundColor', '#f8fafc'),
      fieldControl('headlineColor', 'style.headlineColor', '#0f172a'),
      fieldControl('sublineColor', 'style.sublineColor', '#475569'),
      fieldControl('radius', 'style.borderRadius', 18),
      fieldControl('padding', 'style.padding', 24),
      fieldControl('badgeText', 'style.badgeTextColor', '#ffffff'),
      {
        binding: { kind: VideoAnnotationControlBindingKind.THEME_TOKEN, tokenId: 'accent' },
        defaultValue: '#f97316',
        id: 'themeOnly',
        label: { fallback: 'Theme' },
        type: VideoAnnotationControlType.COLOR,
      },
    ],
    description: { fallback: 'Field defaults' },
    elementKind: VideoAnnotationElementKind.TITLE,
    id: 'field-defaults-test',
    label: { fallback: 'Field defaults' },
    renderTree: { id: 'root', nodeType: 'group' },
    target: { kind: VideoAnnotationTargetBindingKind.NONE, required: false },
    timeline: {
      durationMs: 1200,
      labels: [],
      phases: [{ durationMs: 1200, id: 'intro', startMs: 0 }],
      tracks: [],
    },
  };
}

type TemplateField =
  | 'content.badge'
  | 'content.headline'
  | 'content.subline'
  | 'style.accentColor'
  | 'style.backgroundColor'
  | 'style.badgeTextColor'
  | 'style.borderRadius'
  | 'style.headlineColor'
  | 'style.padding'
  | 'style.sublineColor';

function fieldControl(id: string, field: TemplateField, defaultValue: number | string) {
  return {
    binding: { field, kind: VideoAnnotationControlBindingKind.TEMPLATE_FIELD },
    defaultValue,
    id,
    label: { fallback: id },
    type:
      typeof defaultValue === 'number'
        ? VideoAnnotationControlType.NUMBER
        : VideoAnnotationControlType.TEXT,
  };
}
