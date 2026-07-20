/* eslint-disable max-lines-per-function */
// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  qualityCardMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: mocks.translateMock,
}));

vi.mock('./quality-card/view', () => ({
  QualityCard: (props: unknown) => {
    mocks.qualityCardMock(props);
    return <div data-testid="quality-card">quality</div>;
  },
}));

import { CounterCard } from './counter-card';
import { VideoSettingsGrid } from './layout';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function clickButtonContaining(text: string) {
  const button = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (candidate) => candidate.textContent?.includes(text)
  );

  expect(button, `Expected button containing ${text}`).toBeTruthy();
  act(() => {
    button?.click();
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe('popup video settings grid', () => {
  it('renders the grid and patches countdown settings through the curtain', () => {
    const onSettingsChange = vi.fn();

    render(
      <VideoSettingsGrid
        settings={{ ...DEFAULT_VIDEO_SETTINGS, autoFadeDelay: 5, countdownSeconds: 3 }}
        onSettingsChange={onSettingsChange}
      />
    );

    expect(container?.textContent).toContain('popup.video.countdownDelayedValue');
    clickButtonContaining('popup.video.countdownLabel');
    clickButtonContaining('popup.video.countdownFewOption');

    expect(mocks.qualityCardMock).toHaveBeenCalled();
    expect(onSettingsChange).toHaveBeenCalledWith({ countdownSeconds: 2 });
    expect(onSettingsChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ autoFadeDelay: 6 })
    );
  });

  it('renders counter-card curtain options', () => {
    const onChange = vi.fn();

    render(
      <CounterCard label="Countdown" value={0} min={0} max={1} suffix="s" onChange={onChange} />
    );

    clickButtonContaining('Countdown');
    clickButtonContaining('1s');

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('renders immediate countdown copy for a zero second start', () => {
    render(
      <VideoSettingsGrid
        settings={{ ...DEFAULT_VIDEO_SETTINGS, countdownSeconds: 0 }}
        onSettingsChange={() => undefined}
      />
    );

    expect(container?.textContent).toContain('popup.video.countdownImmediateValue');
  });

  it('shows source count controls only for screen capture', () => {
    const onSettingsChange = vi.fn();

    render(
      <VideoSettingsGrid
        captureMode={CaptureMode.SCREEN}
        settings={{
          ...DEFAULT_VIDEO_SETTINGS,
          autoFadeDelay: 5,
          countdownSeconds: 3,
          sourceCount: 2,
        }}
        onSettingsChange={onSettingsChange}
      />
    );

    expect(container?.textContent).toContain('popup.video.sourceCountLabel');
    clickButtonContaining('popup.video.sourceCountLabel');
    expect(container?.textContent).toContain('popup.video.sourceCountNotice');
    clickButtonContaining('popup.video.sourceCountOne');

    expect(onSettingsChange).toHaveBeenCalledWith({ sourceCount: 1 });
  });
});
