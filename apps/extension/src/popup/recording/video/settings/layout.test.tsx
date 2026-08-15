// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  qualityCard: vi.fn(),
}));

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
  getCurrentLocale: () => 'en',
  translate: (key: string) => (key === 'popup.video.countdownManyOption' ? `${key}:{count}` : key),
}));

vi.mock('./quality-card/view', () => ({
  QualityCard: (props: unknown) => {
    mocks.qualityCard(props);
    return <div data-testid="quality-card">quality</div>;
  },
}));

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoSettingsGrid } from './layout';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function renderGrid(props: Partial<React.ComponentProps<typeof VideoSettingsGrid>> = {}) {
  act(() => {
    root.render(
      <VideoSettingsGrid
        settings={DEFAULT_VIDEO_SETTINGS}
        onSettingsChange={() => undefined}
        {...props}
      />
    );
  });
}

function clickButtonContaining(text: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.includes(text)
  );
  expect(button, `Expected button containing ${text}`).toBeTruthy();
  act(() => button?.click());
}

describe('video settings layout', () => {
  it('does not add a redundant top margin to the settings block', () => {
    renderGrid();

    expect(container.firstElementChild?.className).toBe('flex flex-col');
  });

  it('threads known and unknown output bases to the quality owner', () => {
    renderGrid({ knownOutputBasisDimensions: { height: 900, width: 1440 } });
    expect(mocks.qualityCard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        knownOutputBasisDimensions: { height: 900, width: 1440 },
      })
    );

    renderGrid({ knownOutputBasisDimensions: null });
    expect(mocks.qualityCard).toHaveBeenLastCalledWith(
      expect.objectContaining({ knownOutputBasisDimensions: null })
    );
  });

  it('renders and applies the full countdown option range', () => {
    const onSettingsChange = vi.fn();
    renderGrid({
      onSettingsChange,
      settings: { ...DEFAULT_VIDEO_SETTINGS, countdownSeconds: 3 },
    });

    expect(container.textContent).toContain('popup.video.countdownManyOption:3');
    clickButtonContaining('popup.video.countdownLabel');
    clickButtonContaining('popup.video.countdownManyOption:2');

    expect(onSettingsChange).toHaveBeenCalledWith({ countdownSeconds: 2 });
  });

  it('covers immediate countdown and screen source-count states', () => {
    const onSettingsChange = vi.fn();
    renderGrid({
      captureMode: CaptureMode.SCREEN,
      onSettingsChange,
      settings: { ...DEFAULT_VIDEO_SETTINGS, countdownSeconds: 0, sourceCount: 2 },
    });

    expect(container.textContent).toContain('popup.video.countdownZeroOption');
    expect(container.textContent.indexOf('popup.video.countdownLabel')).toBeLessThan(
      container.textContent.indexOf('popup.video.sourceCountLabel')
    );
    clickButtonContaining('popup.video.sourceCountLabel');
    clickButtonContaining('popup.video.sourceCountOne');

    expect(onSettingsChange).toHaveBeenCalledWith({ sourceCount: 1 });
  });
});
