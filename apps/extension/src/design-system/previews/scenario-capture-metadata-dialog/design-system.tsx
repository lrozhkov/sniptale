import type { AppLocale } from '../../../platform/i18n';
import type { ScenarioCaptureMetadataView } from '../../../features/scenario/capture-metadata-dialog/index';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../support/provider';
import { ScenarioCaptureMetadataDialog } from '../../../features/scenario/capture-metadata-dialog/index';

const previewView: ScenarioCaptureMetadataView = {
  captureMetadata: {
    pointerRange: {
      start: { x: 424, y: 218 },
      end: { x: 458, y: 244 },
      minX: 424,
      minY: 218,
      maxX: 458,
      maxY: 244,
      distance: 43,
      durationMs: 186,
    },
    scroll: {
      startX: 0,
      startY: 320,
      endX: 0,
      endY: 480,
      deltaX: 0,
      deltaY: 160,
    },
    trigger: 'pointer-up',
  },
  captureSurface: 'visible',
  cursorPoint: { x: 458, y: 244 },
  interactionPoint: { x: 452, y: 238 },
  page: {
    title: 'Release dashboard',
    url: 'https://example.test/releases',
    viewport: { x: 0, y: 0, width: 1440, height: 900 },
    scrollX: 0,
    scrollY: 480,
    devicePixelRatio: 2,
  },
  sourceKind: 'auto-click',
  target: {
    selector: '[data-testid="publish-button"]',
    iframeSelector: null,
    tagName: 'button',
    role: 'button',
    text: 'Publish release',
    ariaLabel: 'Publish release',
    title: null,
    rect: { x: 388, y: 194, width: 140, height: 52 },
    framePadding: { top: 4, left: 4, right: 4, bottom: 4 },
  },
};

const PREVIEW_STEP_TITLE = 'Опубликовать релиз';
const handlePreviewClose = () => undefined;

export function buildScenarioCaptureMetadataDialogPreviews(
  _locale: AppLocale
): DesignSystemVariantPreview[] {
  return [
    designSystemPreview(
      'shared.ui.scenario-capture-metadata-dialog',
      'default',
      <DesignSystemFloatingPreviewFrame minHeight={480}>
        <ScenarioCaptureMetadataDialog
          onClose={handlePreviewClose}
          stepTitle={PREVIEW_STEP_TITLE}
          view={previewView}
        />
      </DesignSystemFloatingPreviewFrame>
    ),
  ];
}
