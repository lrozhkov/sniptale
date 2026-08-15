// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('../../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n/popup')>()),
  translate: (key: string) => `t:${key}`,
}));
vi.mock('../../../../../ui/popup-shell/inline-curtain/select', () => ({
  InlineCurtainSelect: (props: {
    label: string;
    onChange: (value: string) => void;
    options: Array<{
      description?: string;
      detail?: string;
      disabled?: boolean;
      label: string;
      meta?: string;
      value: string;
    }>;
    value: string;
  }) => {
    mocks.select(props);
    return (
      <div>
        <span>{props.label}</span>
        {props.options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  },
}));

import { VideoRecordingAreaSelector } from './area-selector';

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
});

function renderSelector(
  captureMode: CaptureMode,
  onCaptureModeChange: (mode: CaptureMode) => void
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <VideoRecordingAreaSelector
        captureMode={captureMode}
        modeCapabilities={{
          [CaptureMode.TAB]: { supported: true, reason: null },
          [CaptureMode.TAB_CROP]: { supported: true, reason: null },
          [CaptureMode.CAMERA]: { supported: true, reason: null },
          [CaptureMode.SCREEN]: { supported: true, reason: null },
        }}
        onCaptureModeChange={onCaptureModeChange}
      />
    );
  });
}

it('maps the persisted tab modes to the lower recording-area selector', () => {
  const onCaptureModeChange = vi.fn();
  renderSelector(CaptureMode.TAB_CROP, onCaptureModeChange);

  expect(mocks.select).toHaveBeenCalledWith(
    expect.objectContaining({ value: 'manual-area', label: 't:popup.video.recordingAreaLabel' })
  );
  const options = (
    mocks.select.mock.calls[0]?.[0] as {
      options: Array<{ description?: string; label: string; meta?: string }>;
    }
  ).options;
  expect(options).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 't:popup.video.recordingAreaManualDescription',
        label: 't:popup.video.recordingAreaManual',
      }),
    ])
  );
  expect(options.every((option) => option.meta === undefined)).toBe(true);
  const buttons = container?.querySelectorAll<HTMLButtonElement>('button');
  act(() => buttons?.[0]?.click());
  act(() => buttons?.[1]?.click());

  expect(onCaptureModeChange).toHaveBeenNthCalledWith(1, CaptureMode.TAB);
  expect(onCaptureModeChange).toHaveBeenNthCalledWith(2, CaptureMode.TAB_CROP);
});
