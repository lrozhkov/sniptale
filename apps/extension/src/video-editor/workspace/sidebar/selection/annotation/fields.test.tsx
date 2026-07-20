import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  APPLE_GLASS_ANNOTATION_PACK,
  CURSOR_OPS_ANNOTATION_PACK,
  type VideoAnnotationPack,
  type VideoAnnotationTemplate,
} from '../../../../../features/video/project/annotation-engine';
import { createAnnotationClip } from '../../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { VideoOverlayTemplateKind } from '../../../../../features/video/project/types';
import { AnnotationFields } from './fields';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

vi.stubGlobal('HTMLElement', class HTMLElement {});
vi.stubGlobal('ShadowRoot', class ShadowRoot {});

function createProps() {
  const project = createEmptyVideoProject('Annotation fields');
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR
  );
  clip.direction = 'DOWN';
  clip.introDurationMs = 550;
  clip.outroDurationMs = 700;

  return {
    clip,
    disabled: false,
    onUpdateAnnotationClipContent: vi.fn(),
    onUpdateAnnotationClipStyle: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
  } as const;
}

describe('annotation-fields', () => {
  registerModernAnnotationFieldTests();
  registerLegacyAnnotationFieldTests();
});

function registerModernAnnotationFieldTests() {
  it('renders modern Apple Glass controls through schema-driven inspector groups', () => {
    const markup = renderToStaticMarkup(
      <AnnotationFields
        {...createModernProps(
          APPLE_GLASS_ANNOTATION_PACK,
          APPLE_GLASS_ANNOTATION_PACK.templates.callout[0]!
        )}
      />
    );

    expect(markup).toContain('videoEditor.sidebar.annotationInspectorSectionBasic');
    expect(markup).toContain('videoEditor.sidebar.annotationInspectorSectionContent');
    expect(markup).toContain('videoEditor.sidebar.annotationInspectorSectionPlacement');
    expect(markup).toContain('videoEditor.sidebar.annotationInspectorSectionAppearance');
    expect(markup).toContain('videoEditor.sidebar.annotationInspectorSectionMotion');
    expect(markup).not.toContain('videoEditor.sidebar.inspectorGroupContent');
    expect(markup).not.toContain('videoEditor.sidebar.inspectorGroupStyle');
    expect(markup).not.toContain('videoEditor.sidebar.annotationIntroLabel');
    expect(markup).not.toContain('Headline');
  });

  it('renders modern Cursor Ops controls without stale legacy groups', () => {
    const markup = renderToStaticMarkup(
      <AnnotationFields
        {...createModernProps(
          CURSOR_OPS_ANNOTATION_PACK,
          CURSOR_OPS_ANNOTATION_PACK.templates.focus[0]!
        )}
      />
    );

    expect(markup).toContain('videoEditor.sidebar.annotationInspectorSectionPlacement');
    expect(markup).toContain('videoEditor.sidebar.annotationInspectorSectionAppearance');
    expect(markup).not.toContain('videoEditor.sidebar.inspectorGroupMotion');
    expect(markup).not.toContain('videoEditor.sidebar.annotationDirectionLabel');
  });
}

function registerLegacyAnnotationFieldTests() {
  it('renders grouped annotation controls for target-aware templates', () => {
    const markup = renderToStaticMarkup(<AnnotationFields {...createProps()} />);

    expect(markup).toContain('videoEditor.sidebar.inspectorGroupGeneral');
    expect(markup).toContain('videoEditor.sidebar.annotationLegacyComparisonLabel');
    expect(markup).toContain('videoEditor.sidebar.inspectorGroupContent');
    expect(markup).toContain('videoEditor.sidebar.inspectorGroupTarget');
    expect(markup).toContain('videoEditor.sidebar.inspectorGroupMotion');
    expect(markup).not.toContain('videoEditor.sidebar.inspectorGroupStyle');
    expect(markup).toContain('videoEditor.sidebar.annotationHeadlineColorLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationPaddingLabel');
    expect(markup).not.toContain('videoEditor.sidebar.annotationDirectionLabel');
    expect(markup).not.toContain('videoEditor.sidebar.annotationTargetLabel');
  });

  it('uses shared template capability controls to hide subline-only fields for pointer labels', () => {
    const project = createEmptyVideoProject('Pointer annotation fields');
    const clip = createAnnotationClip(
      project.tracks[2]!.id,
      project.width,
      project.height,
      0,
      VideoOverlayTemplateKind.POINTER_LABEL
    );

    const markup = renderToStaticMarkup(
      <AnnotationFields
        clip={clip}
        disabled={false}
        onUpdateAnnotationClipContent={vi.fn()}
        onUpdateAnnotationClipStyle={vi.fn()}
        onUpdateAnnotationClipTemplate={vi.fn()}
      />
    );

    expect(markup).toContain('videoEditor.sidebar.inspectorGroupTarget');
    expect(markup).not.toContain('videoEditor.sidebar.annotationSublineLabel');
    expect(markup).not.toContain('videoEditor.sidebar.annotationBadgeLabel');
  });
}

function createModernProps(pack: VideoAnnotationPack, template: VideoAnnotationTemplate) {
  const project = createEmptyVideoProject('Modern annotation fields');
  const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 0, {
    pack,
    packLabel: pack.label,
    packTheme: pack.theme,
    template,
    templateRef: { packId: pack.packId, templateId: template.id },
  });

  return {
    clip,
    disabled: false,
    onUpdateAnnotationClipContent: vi.fn(),
    onUpdateAnnotationClipStyle: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
  } as const;
}
