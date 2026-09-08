import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createAnnotationClip } from '../../../../../features/video/project/factories/overlay-clip';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../../../features/video/project/factories/creation';
import {
  VideoTrackKind,
  VideoOverlayTemplateKind,
} from '../../../../../features/video/project/types';
import { AnnotationStyleControls } from './style-controls';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

function createProps() {
  const project = createEmptyVideoProject('Annotation style controls');
  project.tracks.push(createVideoProjectTrack('Annotations', 0, VideoTrackKind.PRIMARY));
  const clip = createAnnotationClip(
    project.tracks[1]!.id,
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
