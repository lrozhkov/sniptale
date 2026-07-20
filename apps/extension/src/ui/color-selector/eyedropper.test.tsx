// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompactColorSelector } from './index';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderSelector(props: Partial<React.ComponentProps<typeof CompactColorSelector>> = {}) {
  if (!container) {
    throw new Error('Test container is not initialized');
  }

  act(() => {
    root?.render(
      <CompactColorSelector
        title="Grid color"
        label="Grid color"
        value="#123456"
        recentColors={['#111111']}
        palette={['#abcdef']}
        onChange={() => undefined}
        {...props}
      />
    );
  });
}

function getButton(label: string) {
  return Array.from(document.body.querySelectorAll('button') ?? []).find(
    (button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label
  ) as HTMLButtonElement | undefined;
}

async function clickButton(label: string) {
  await act(async () => {
    getButton(label)?.click();
  });
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function installResolvableEyedropper() {
  let resolvePick: ((result: { sRGBHex: string }) => void) | null = null;

  vi.stubGlobal(
    'EyeDropper',
    class {
      open() {
        return new Promise<{ sRGBHex: string }>((resolve) => {
          resolvePick = resolve;
        });
      }
    }
  );

  return {
    resolvePick: (result: { sRGBHex: string }) => resolvePick?.(result),
  };
}

describe('shared/ui/color-selector eyedropper', () => {
  it('hides the eyedropper affordance when EyeDropper is unavailable', async () => {
    renderSelector();
    await clickButton('shared.ui.colorSelectorChooseColor');
    expect(getButton('shared.ui.colorSelectorEyedropper')).toBeUndefined();
  });

  it('ignores outside-close while eyedropper is active and previews the picked color only', async () => {
    const onChange = vi.fn();
    const onPreviewChange = vi.fn();
    const eyedropper = installResolvableEyedropper();

    renderSelector({ onChange, onPreviewChange });
    await clickButton('shared.ui.colorSelectorChooseColor');
    await clickButton('shared.ui.colorSelectorEyedropper');
    await flushPromises();

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(getButton('shared.ui.colorSelectorApply')).toBeDefined();

    await act(async () => {
      eyedropper.resolvePick({ sRGBHex: '#ff8800' });
    });
    await flushPromises();

    expect(onPreviewChange).toHaveBeenCalledWith('#ff8800');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the picker open when eyedropper is canceled', async () => {
    vi.stubGlobal(
      'EyeDropper',
      class {
        async open() {
          throw new Error('aborted');
        }
      }
    );

    renderSelector();
    await clickButton('shared.ui.colorSelectorChooseColor');
    await clickButton('shared.ui.colorSelectorEyedropper');
    await flushPromises();

    expect(getButton('shared.ui.colorSelectorApply')).toBeDefined();
  });
});
