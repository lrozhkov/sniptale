import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createAnnotationClip } from '../../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { VideoOverlayTemplateKind } from '../../../../../features/video/project/types';
import { AnnotationTargetControls } from './target-controls';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

vi.stubGlobal('HTMLElement', class HTMLElement {});
vi.stubGlobal('ShadowRoot', class ShadowRoot {});

function createClip(templateKind: VideoOverlayTemplateKind) {
  const project = createEmptyVideoProject('Annotation target controls');
  return createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    templateKind
  );
}

describe('annotation-target-controls', () => {
  it('renders target-aware controls for connector templates', () => {
    const markup = renderToStaticMarkup(
      <AnnotationTargetControls
        clip={createClip(VideoOverlayTemplateKind.CALLOUT_CONNECTOR)}
        disabled={false}
        onUpdateAnnotationClipTemplate={vi.fn()}
      />
    );

    expect(markup).toContain('videoEditor.sidebar.annotationTargetLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationLeaderLineStyleLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationLeaderLineThicknessLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationMarkerKindLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationArrowKindLabel');
  });

  it('hides target-aware controls for lower-third templates', () => {
    const markup = renderToStaticMarkup(
      <AnnotationTargetControls
        clip={createClip(VideoOverlayTemplateKind.LOWER_THIRD_BASIC)}
        disabled={false}
        onUpdateAnnotationClipTemplate={vi.fn()}
      />
    );

    expect(markup).toBe('');
  });
});
