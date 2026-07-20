import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createAnnotationClip } from '../../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { VideoOverlayTemplateKind } from '../../../../../features/video/project/types';
import { AnnotationStyleControls } from './style-controls';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

function createProps() {
  const project = createEmptyVideoProject('Annotation style controls');
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.LOWER_THIRD_BADGE
  );
  clip.style.padding = 28;
  clip.style.borderRadius = 26;
  clip.style.depthAmount = 0.44;
  clip.style.shimmerAmount = 0.62;

  return {
    clip,
    controls: {
      showBadgeTextColor: true,
      showBorderRadius: true,
      showDepthAmount: true,
      showHeadlineColor: true,
      showPadding: true,
      showShimmerAmount: true,
      showSublineColor: true,
    },
    disabled: false,
    onUpdateAnnotationClipStyle: vi.fn(),
  } as const;
}

describe('annotation-style-controls', () => {
  it('renders safe style controls for annotation templates', () => {
    const markup = renderToStaticMarkup(<AnnotationStyleControls {...createProps()} />);

    expect(markup).toContain('videoEditor.sidebar.annotationHeadlineColorLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationSublineColorLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationBadgeTextColorLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationPaddingLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationBorderRadiusLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationDepthAmountLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationShimmerAmountLabel');
  });
});
