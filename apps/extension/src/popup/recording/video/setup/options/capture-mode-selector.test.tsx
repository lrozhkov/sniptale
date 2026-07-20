// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ modeIconButton: vi.fn() }));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
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
      [CaptureMode.VIEWPORT_EMULATION]: { supported: true, reason: null },
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

it('keeps supported capture modes clickable and leaves blocked ones disabled', () => {
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
  expect(container?.textContent).toContain('blocked area');
  expect(onCaptureModeChange).toHaveBeenCalledWith(CaptureMode.TAB);
  expect(onCaptureModeChange).toHaveBeenCalledWith(CaptureMode.CAMERA);
  expect(onCaptureModeChange).not.toHaveBeenCalledWith(CaptureMode.TAB_CROP);
});
