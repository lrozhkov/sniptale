// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
import { DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoAutoProcessingAction } from '@sniptale/runtime-contracts/video/types/types';
import { VideoTrackKind } from '../../../../../features/video/project/types';
import { ProjectTimelineToolbarLeadingControls } from './leading';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function renderLeadingControls(options?: {
  canAutoTransformRecording?: boolean;
  selectedClip?: boolean;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const handlers = {
    onAddMotionRegion: vi.fn(),
    onAddTrack: vi.fn(),
    onToggleTelemetryLaneVisibility: vi.fn(),
    onZoomChange: vi.fn(),
  };

  act(() => {
    root?.render(
      <ProjectTimelineToolbarLeadingControls
        canAutoTransformRecording={options?.canAutoTransformRecording ?? false}
        insertion={{
          onAddActionEvent: vi.fn(),
          onAddMotionRegion: handlers.onAddMotionRegion,
          onAddShapeOverlay: vi.fn(),
          onAddTextOverlay: vi.fn(),
          onAddTrack: handlers.onAddTrack,
          onEnableCursorTrack: vi.fn(),
          onImport: {
            audio: vi.fn(),
            image: vi.fn(),
            video: vi.fn(),
          },
          onUnsupportedFileDrop: vi.fn(),
        }}
        selectedClip={options?.selectedClip ?? false}
        onAutoTransformRecording={handlers.onToggleTelemetryLaneVisibility}
        onDeleteSelectedClip={vi.fn()}
        onDuplicateSelectedClip={vi.fn()}
        onSplitSelectedClip={handlers.onZoomChange}
      />
    );
  });

  return handlers;
}

function getButtonByText(label: string): HTMLButtonElement {
  const button = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (item) => item.textContent?.includes(label)
  );

  if (!button) {
    throw new Error(`Missing button: ${label}`);
  }

  return button;
}

it('renders timeline-specific actions on the leading side without the shared insert menu', () => {
  renderLeadingControls({ canAutoTransformRecording: true });

  expect(container?.textContent).not.toContain('videoEditor.timeline.addButton');
  expect(container?.textContent).toContain('videoEditor.timeline.addTrack');
  expect(container?.textContent).toContain('videoEditor.timeline.autoTransform');
  expect(container?.textContent).toContain('videoEditor.timeline.split');
});

it('opens the auto-transform wizard before applying transform settings', () => {
  const handlers = renderLeadingControls({
    canAutoTransformRecording: true,
    selectedClip: true,
  });

  act(() => {
    getButtonByText('videoEditor.timeline.autoTransform').click();
  });

  expect(container?.textContent).toContain('videoEditor.timeline.autoTransformWizardTitle');
  expect(
    container?.querySelectorAll('[data-ui="shared.ui.compact-inspector.option-row"]')
  ).toHaveLength(3);
  expect(
    container?.querySelectorAll('[data-ui="shared.ui.compact-inspector.numeric-row"]')
  ).toHaveLength(2);
  expect(handlers.onToggleTelemetryLaneVisibility).not.toHaveBeenCalled();

  act(() => {
    getButtonByText('videoEditor.timeline.autoTransformActionRemove').click();
  });

  act(() => {
    getButtonByText('videoEditor.timeline.autoTransformApply').click();
  });

  expect(handlers.onToggleTelemetryLaneVisibility).toHaveBeenCalledWith({
    ...DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS,
    enabled: true,
    stableSegments: {
      ...DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS.stableSegments,
      action: VideoAutoProcessingAction.REMOVE,
    },
  });
  expect(container?.textContent).not.toContain('videoEditor.timeline.autoTransformWizardTitle');
});

it('does not transform when the auto-transform wizard is cancelled or skipped', () => {
  const handlers = renderLeadingControls({ canAutoTransformRecording: true });

  act(() => {
    getButtonByText('videoEditor.timeline.autoTransform').click();
  });

  act(() => {
    getButtonByText('common.actions.cancel').click();
  });

  expect(handlers.onToggleTelemetryLaneVisibility).not.toHaveBeenCalled();

  act(() => {
    getButtonByText('videoEditor.timeline.autoTransform').click();
  });

  act(() => {
    getButtonByText('videoEditor.timeline.autoTransformActionSkip').click();
  });

  act(() => {
    getButtonByText('videoEditor.timeline.autoTransformApply').click();
  });

  expect(handlers.onToggleTelemetryLaneVisibility).not.toHaveBeenCalled();
});

it('wires clip actions from the leading side', () => {
  const handlers = renderLeadingControls({
    canAutoTransformRecording: true,
    selectedClip: true,
  });

  act(() => {
    getButtonByText('videoEditor.timeline.split').click();
  });

  expect(handlers.onZoomChange).toHaveBeenCalledTimes(1);
});

it('wires track creation from the leading side', () => {
  const handlers = renderLeadingControls();

  act(() => {
    getButtonByText('videoEditor.timeline.addTrack').click();
  });

  expect(handlers.onAddTrack).not.toHaveBeenCalled();
  expect(container?.querySelector('.sniptale-toolbar-menu')).not.toBeNull();
  expect(container?.textContent).toContain('videoEditor.timeline.addVideoTrack');
  expect(container?.textContent).toContain('videoEditor.timeline.addAudioTrack');
  expect(container?.textContent).toContain('videoEditor.timeline.addOverlayTrack');
  expect(container?.textContent).toContain('videoEditor.timeline.addSubtitleTrack');

  act(() => {
    getButtonByText('videoEditor.timeline.addAudioTrack').click();
  });

  expect(handlers.onAddTrack).toHaveBeenCalledWith(VideoTrackKind.AUDIO);
});

it('keeps zoom region creation out of the toolbar action cluster', () => {
  renderLeadingControls();

  expect(container?.textContent).not.toContain('videoEditor.timeline.addZoomRegion');
});
