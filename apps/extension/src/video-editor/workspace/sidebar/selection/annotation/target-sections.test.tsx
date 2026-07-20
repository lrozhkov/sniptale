import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createAnnotationClip } from '../../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { VideoOverlayTemplateKind } from '../../../../../features/video/project/types';
import { renderAnnotationTargetFields } from './target-sections';

type TargetFieldsClip = Parameters<typeof renderAnnotationTargetFields>[0]['clip'];

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

vi.stubGlobal('HTMLElement', class HTMLElement {});
vi.stubGlobal('ShadowRoot', class ShadowRoot {});

function createClip(templateKind: VideoOverlayTemplateKind) {
  const project = createEmptyVideoProject('Annotation target sections');
  return createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    templateKind
  );
}

describe('annotation-target-sections', () => {
  it('renders point and decor fields for pointer labels', verifyPointerLabelFields);
  it('renders rect sizing fields for connector templates in rect mode', verifyRectSizingFields);
  it('returns empty output for non-target templates', verifyEmptyNonTargetOutput);
});

function renderTargetFields(clip: TargetFieldsClip): string {
  return renderToStaticMarkup(
    renderAnnotationTargetFields({
      clip,
      disabled: false,
      onUpdateAnnotationClipTemplate: vi.fn(),
    })
  );
}

function verifyPointerLabelFields(): void {
  const markup = renderTargetFields({
    ...createClip(VideoOverlayTemplateKind.POINTER_LABEL),
    target: 'POINT',
  });

  expect(markup).toContain('videoEditor.sidebar.annotationTargetPointXLabel');
  expect(markup).toContain('videoEditor.sidebar.annotationTargetPointYLabel');
  expect(markup).toContain('videoEditor.sidebar.annotationLeaderLineStyleLabel');
  expect(markup).toContain('videoEditor.sidebar.annotationMarkerKindLabel');
  expect(markup).toContain('videoEditor.sidebar.annotationTargetPointXLabel range');
  expect(markup).toContain('videoEditor.sidebar.annotationLeaderLineThicknessLabel range');
}

function verifyRectSizingFields(): void {
  const markup = renderTargetFields({
    ...createClip(VideoOverlayTemplateKind.CALLOUT_CONNECTOR),
    target: 'RECT',
  });

  expect(markup).toContain('videoEditor.sidebar.annotationTargetRectWidthLabel');
  expect(markup).toContain('videoEditor.sidebar.annotationTargetRectHeightLabel');
}

function verifyEmptyNonTargetOutput(): void {
  const markup = renderTargetFields(createClip(VideoOverlayTemplateKind.LOWER_THIRD_BASIC));

  expect(markup).toBe('');
}
