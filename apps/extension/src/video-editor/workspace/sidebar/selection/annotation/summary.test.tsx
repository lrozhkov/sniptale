import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createAnnotationClip } from '../../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { VideoOverlayTemplateKind } from '../../../../../features/video/project/types';
import { AnnotationSummarySection } from './summary';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.stubGlobal('HTMLElement', class HTMLElement {});
vi.stubGlobal('ShadowRoot', class ShadowRoot {});

function createProps() {
  const project = createEmptyVideoProject('Annotation summary');
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.THREE_D_REVEAL_CARD
  );
  clip.direction = 'RIGHT';
  clip.introDurationMs = 480;
  clip.outroDurationMs = 360;

  return {
    clip,
    disabled: false,
    onUpdateAnnotationClipStyle: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
  } as const;
}

describe('annotation-summary', () => {
  it('renders compact template summary metadata for annotation overlays', () => {
    const markup = renderToStaticMarkup(<AnnotationSummarySection {...createProps()} />);

    expect(markup).toContain('videoEditor.sidebar.annotationTemplateThreeDRevealCard');
    expect(markup).toContain('videoEditor.templates.overlayGroupSceneReveals');
    expect(markup).toContain('videoEditor.templates.overlayUseCaseThreeDRevealCard');
    expect(markup).toContain('videoEditor.templates.overlayDescriptionThreeDRevealCard');
    expect(markup).toContain('videoEditor.templates.catalogStatusOptional');
    expect(markup).toContain('videoEditor.sidebar.annotationSwapStyleLabel');
    expect(markup).toContain('videoEditor.sidebar.annotationRecommendedDefaultsLabel');
    expect(markup).toContain('hover:bg-[color:color-mix');
    expect(markup).toContain('rounded-[12px]');
  });
});
