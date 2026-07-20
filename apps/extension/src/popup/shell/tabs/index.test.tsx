// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ActiveTabCapabilities,
  CapabilityState,
} from '@sniptale/runtime-contracts/tab-capabilities/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const localeMocks = vi.hoisted(() => ({
  currentLocale: 'ru' as 'en' | 'ru',
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string, locale?: string) => `${locale ?? localeMocks.currentLocale}:${key}`,
  useAppLocale: () => localeMocks.currentLocale,
}));

import { PopupTabs } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSupportedCapability(): CapabilityState {
  return {
    supported: true,
    reason: null,
  };
}

function createActiveTabCapabilities(): ActiveTabCapabilities {
  return {
    tabId: 1,
    url: 'https://example.test',
    title: 'Example',
    isRestrictedPage: false,
    restrictedPageLabel: null,
    screenshotMode: createSupportedCapability(),
    quickActions: createSupportedCapability(),
    export: createSupportedCapability(),
    videoByMode: {
      [CaptureMode.TAB]: createSupportedCapability(),
      [CaptureMode.TAB_CROP]: createSupportedCapability(),
      [CaptureMode.CAMERA]: createSupportedCapability(),
      [CaptureMode.VIEWPORT_EMULATION]: createSupportedCapability(),
      [CaptureMode.SCREEN]: createSupportedCapability(),
    },
  };
}

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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localeMocks.currentLocale = 'ru';
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

describe('PopupShellViews', () => {
  it('renders popup tabs and changes the active page on click', () => {
    const onChange = vi.fn();

    renderNode(
      <PopupTabs
        page="video"
        activeTabCapabilities={createActiveTabCapabilities()}
        onChange={onChange}
      />
    );

    const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

    expect(buttons).toHaveLength(3);
    expect(buttons[1]?.dataset['active']).toBe('true');
    expect(buttons[0]?.dataset['active']).toBe('false');
    expect(container?.textContent).toContain('ru:popup.tabs.home');
    expect(container?.textContent).toContain('ru:popup.tabs.video');
    expect(container?.textContent).toContain('ru:popup.tabs.export');

    act(() => {
      buttons[2]?.click();
    });

    expect(onChange).toHaveBeenCalledWith('export');
  });

  it('rebuilds popup tab labels when the active locale changes', () => {
    const onChange = vi.fn();
    const activeTabCapabilities = createActiveTabCapabilities();

    renderNode(
      <PopupTabs page="home" activeTabCapabilities={activeTabCapabilities} onChange={onChange} />
    );
    expect(container?.textContent).toContain('ru:popup.tabs.home');

    localeMocks.currentLocale = 'en';
    renderNode(
      <PopupTabs page="home" activeTabCapabilities={activeTabCapabilities} onChange={onChange} />
    );

    expect(container?.textContent).toContain('en:popup.tabs.home');
    expect(container?.textContent).toContain('en:popup.tabs.video');
    expect(container?.textContent).toContain('en:popup.tabs.export');
    expect(container?.textContent).not.toContain('ru:popup.tabs.home');
  });
});
