import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createAnnotationClip } from '../../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { VideoOverlayTemplateKind } from '../../../../../features/video/project/types';
import {
  renderAnnotationAppearanceFields,
  renderAnnotationContentFields,
  renderAnnotationContentMetaFields,
  renderAnnotationMotionFields,
  type AnnotationFieldsSectionProps,
} from './field-sections';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

vi.stubGlobal('HTMLElement', class HTMLElement {});
vi.stubGlobal('ShadowRoot', class ShadowRoot {});

function createProps(templateKind: VideoOverlayTemplateKind): AnnotationFieldsSectionProps {
  const project = createEmptyVideoProject('Annotation section fields');
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    templateKind
  );

  return {
    clip,
    disabled: false,
    onUpdateAnnotationClipContent: vi.fn(),
    onUpdateAnnotationClipStyle: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
  };
}

describe('annotation-field-sections', () => {
  it('renders content and appearance fields only when the shared template controls allow them', () => {
    const lowerThirdContentMarkup = renderToStaticMarkup(
      <>{renderAnnotationContentFields(createProps(VideoOverlayTemplateKind.LOWER_THIRD_BADGE))}</>
    );
    const lowerThirdMetaMarkup = renderToStaticMarkup(
      <>
        {renderAnnotationContentMetaFields(createProps(VideoOverlayTemplateKind.LOWER_THIRD_BADGE))}
      </>
    );
    const pointerContentMarkup = renderToStaticMarkup(
      <>{renderAnnotationContentFields(createProps(VideoOverlayTemplateKind.POINTER_LABEL))}</>
    );
    const pointerAppearanceMarkup = renderToStaticMarkup(
      <>{renderAnnotationAppearanceFields(createProps(VideoOverlayTemplateKind.POINTER_LABEL))}</>
    );
    const sectionDividerAppearanceMarkup = renderToStaticMarkup(
      <>{renderAnnotationAppearanceFields(createProps(VideoOverlayTemplateKind.SECTION_DIVIDER))}</>
    );

    expect(lowerThirdContentMarkup).toContain('videoEditor.sidebar.annotationSublineLabel');
    expect(lowerThirdMetaMarkup).toContain('videoEditor.sidebar.annotationBadgeLabel');
    expect(pointerContentMarkup).not.toContain('videoEditor.sidebar.annotationSublineLabel');
    expect(pointerAppearanceMarkup).not.toContain(
      'videoEditor.sidebar.annotationBadgeTextColorLabel'
    );
    expect(sectionDividerAppearanceMarkup).not.toContain(
      'videoEditor.sidebar.annotationSublineColorLabel'
    );
  });

  it('keeps motion controls in the dedicated motion section', () => {
    const motionMarkup = renderToStaticMarkup(
      <>{renderAnnotationMotionFields(createProps(VideoOverlayTemplateKind.CALLOUT_CONNECTOR))}</>
    );

    expect(motionMarkup).toContain('videoEditor.sidebar.annotationIntensityLabel');
    expect(motionMarkup).toContain('videoEditor.sidebar.annotationDirectionLabel');
    expect(motionMarkup).toContain('videoEditor.sidebar.annotationIntroDurationLabel');
    expect(motionMarkup).toContain('videoEditor.sidebar.annotationOutroDurationLabel');
  });
});
