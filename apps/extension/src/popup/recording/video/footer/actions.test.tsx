// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeFooter: vi.fn(),
  openGallery: vi.fn(),
  actionButton: vi.fn(),
}));

vi.mock('../../../../platform/i18n/popup', (_importOriginal) => ({
  translate: (key: string) => `t:${key}`,
}));

vi.mock('../../../../ui/popup-shell/action-button', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../ui/popup-shell/action-button')>()),
  PopupActionButton: (props: {
    dataUi?: string;
    disabled?: boolean;
    iconClassName?: string;
    label: string;
    onClick: () => void;
  }) => {
    mocks.actionButton(props);
    return (
      <button type="button" disabled={props.disabled} onClick={props.onClick}>
        {props.label}
      </button>
    );
  },
}));

vi.mock('../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/navigation/extension-pages')>()),
  openGalleryPage: (options: unknown) => mocks.openGallery(options),
}));

vi.mock('./active-controls', (_importOriginal) => ({
  VideoActiveFooterControls: (props: unknown) => {
    mocks.activeFooter(props);
    return <div data-testid="video-active-footer" />;
  },
}));

import { VideoSetupFooter } from './actions';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function renderVideoSetupFooter(options: {
  duration: number;
  onStart?: () => void;
  status: VideoRecordingStatus;
}): void {
  renderNode(
    <VideoSetupFooter
      canStart
      startButtonLabel="Start recording"
      startDisabledReason={null}
      onStart={options.onStart ?? vi.fn()}
      onPauseResume={vi.fn()}
      onStop={vi.fn()}
      onCancel={vi.fn()}
      recordingState={{
        captureMode: null,
        captureSource: null,
        countdownEndsAt: null,
        duration: options.duration,
        error: null,
        status: options.status,
        viewportPresetId: null,
      }}
      galleryTitle="Gallery title"
    />
  );
}

function clickFooterButtons(): void {
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  act(() => {
    buttons.forEach((button) => button.click());
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.openGallery.mockReset();
  mocks.actionButton.mockReset();
  mocks.activeFooter.mockReset();
  vi.stubGlobal('close', vi.fn());
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('offers only start and the recording library with neutral command icons', () => {
  const onStart = vi.fn();

  renderVideoSetupFooter({ duration: 0, onStart, status: VideoRecordingStatus.IDLE });
  clickFooterButtons();

  expect(container?.textContent).toContain('Start recording');
  expect(container?.textContent).not.toContain('t:popup.video.videoEditorLabel');
  expect(container?.textContent).toContain('t:popup.video.galleryLabel');
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(mocks.openGallery).toHaveBeenCalledTimes(1);
  expect(mocks.openGallery).toHaveBeenCalledWith({ folder: 'recording' });
  expect(window.close).toHaveBeenCalledOnce();
  expect(container?.querySelectorAll('button')).toHaveLength(2);
  expect(container?.querySelector('button')?.parentElement?.className).toContain(
    'grid-cols-[minmax(0,1fr)_48px]'
  );
  expect(mocks.activeFooter).not.toHaveBeenCalled();
  expect(mocks.actionButton).toHaveBeenCalledWith(
    expect.objectContaining({
      iconClassName: 'fill-current text-[var(--sniptale-color-danger)]',
      dataUi: 'popup.video-setup.start-recording-button',
    })
  );
  expect(
    mocks.actionButton.mock.calls.every(
      ([props]) => !String(props.iconClassName).includes('--sniptale-color-accent')
    )
  ).toBe(true);
  expect(mocks.actionButton).toHaveBeenCalledWith(
    expect.objectContaining({
      dataUi: 'popup.video-setup.gallery-button',
      title: 'Gallery title',
      iconClassName: expect.stringContaining(
        'group-hover:text-[var(--sniptale-color-text-primary)]'
      ),
    })
  );
});

it('switches to the active footer controls while recording is in progress', () => {
  renderVideoSetupFooter({ duration: 12, status: VideoRecordingStatus.RECORDING });

  expect(container?.querySelector('[data-testid="video-active-footer"]')).toBeTruthy();
  expect(mocks.actionButton).not.toHaveBeenCalled();
  expect(mocks.activeFooter).toHaveBeenCalledTimes(1);
});
