// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ modeIconButton: vi.fn() }));

vi.mock('../../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n/popup')>()),
  translate: (key: string) => `t:${key}`,
}));
vi.mock('../primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../primitives')>()),
  ModeIconButton: (props: {
    disabled: boolean;
    hint: string;
    label: string;
    onClick: () => void;
  }) => {
    mocks.modeIconButton(props);
    return (
      <button type="button" disabled={props.disabled} onClick={props.onClick}>
        {props.label} {props.hint}
      </button>
    );
  },
}));

import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { CaptureModeSelector } from './capture-mode-selector';

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

function createCapabilities(): ActiveTabCapabilities {
  return {
    tabId: 1,
    url: 'https://example.com',
    title: 'Example',
    isRestrictedPage: false,
    restrictedPageLabel: null,
    screenshotMode: { supported: true, reason: null },
    quickActions: { supported: true, reason: null },
    export: { supported: true, reason: null },
    videoByMode: {
      [CaptureMode.TAB]: { supported: true, reason: null },
      [CaptureMode.TAB_CROP]: { supported: false, reason: 'blocked area' },
      [CaptureMode.CAMERA]: { supported: true, reason: null },
      [CaptureMode.SCREEN]: { supported: true, reason: null },
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.modeIconButton.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('shows three top-level modes and keeps area selection out of the header', () => {
  const onCaptureModeChange = vi.fn();

  renderNode(
    <CaptureModeSelector
      captureMode={CaptureMode.TAB}
      activeTabCapabilities={createCapabilities()}
      onCaptureModeChange={onCaptureModeChange}
    />
  );

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  act(() => {
    buttons[0]?.click();
    buttons[1]?.click();
    buttons[2]?.click();
  });

  expect(container?.textContent).toContain('t:popup.video.modeTabLabel');
  expect(container?.textContent).not.toContain('t:popup.video.modePresetLabel');
  expect(container?.textContent).not.toContain('t:popup.video.modeAreaLabel');
  expect(buttons).toHaveLength(3);
  expect(mocks.modeIconButton).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ label: 't:popup.video.modeScreenLabel' })
  );
  expect(mocks.modeIconButton).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({ label: 't:popup.video.modeCameraLabel' })
  );
  expect(onCaptureModeChange).not.toHaveBeenCalledWith(CaptureMode.TAB);
  expect(onCaptureModeChange).toHaveBeenCalledWith(CaptureMode.CAMERA);
  expect(onCaptureModeChange).toHaveBeenCalledWith(CaptureMode.SCREEN);
  expect(onCaptureModeChange).not.toHaveBeenCalledWith(CaptureMode.TAB_CROP);
});

it('represents a persisted cropped-tab mode as the active Tab section', () => {
  renderNode(
    <CaptureModeSelector
      captureMode={CaptureMode.TAB_CROP}
      activeTabCapabilities={createCapabilities()}
      onCaptureModeChange={() => undefined}
    />
  );

  expect(mocks.modeIconButton).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ active: true, label: 't:popup.video.modeTabLabel' })
  );
  expect(mocks.modeIconButton).toHaveBeenCalledTimes(3);
});
