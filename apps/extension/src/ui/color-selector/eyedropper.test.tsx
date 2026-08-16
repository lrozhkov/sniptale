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

  it('defers the content activation bridge until the eyedropper press is released', async () => {
    installResolvableEyedropper();
    renderSelector();
    await clickButton('shared.ui.colorSelectorChooseColor');

    expect(
      getButton('shared.ui.colorSelectorEyedropper')?.getAttribute(
        'data-sniptale-activation-bridge'
      )
    ).toBe('defer');
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

  it('starts the native eyedropper only after the complete click transaction', async () => {
    const open = vi.fn(() => new Promise<{ sRGBHex: string }>(() => undefined));
    vi.stubGlobal(
      'EyeDropper',
      class {
        open() {
          return open();
        }
      }
    );

    renderSelector();
    await clickButton('shared.ui.colorSelectorChooseColor');
    await act(async () => {
      const button = getButton('shared.ui.colorSelectorEyedropper');
      button?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      button?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
      button?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      expect(open).not.toHaveBeenCalled();
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
      expect(open).not.toHaveBeenCalled();
      await Promise.resolve();
    });

    expect(open).toHaveBeenCalledOnce();
  });

  it('keeps the root-owned native eyedropper active while the picker rerenders', async () => {
    let resolvePick: ((result: { sRGBHex: string }) => void) | null = null;
    let receivedSignal: AbortSignal | undefined;
    const open = vi.fn(
      (options?: { signal?: AbortSignal }) =>
        new Promise<{ sRGBHex: string }>((resolve) => {
          receivedSignal = options?.signal;
          resolvePick = resolve;
        })
    );
    vi.stubGlobal(
      'EyeDropper',
      class {
        open(options?: { signal?: AbortSignal }) {
          return open(options);
        }
      }
    );
    const onPreviewChange = vi.fn();
    renderSelector({ onPreviewChange });
    await clickButton('shared.ui.colorSelectorChooseColor');
    await clickButton('shared.ui.colorSelectorEyedropper');
    await flushPromises();

    expect(receivedSignal?.aborted).toBe(false);
    expect(getButton('shared.ui.colorSelectorEyedropper')?.disabled).toBe(true);
    await act(async () => resolvePick?.({ sRGBHex: '#14b8a6' }));
    expect(onPreviewChange).toHaveBeenCalledWith('#14b8a6');
  });

  it('marks the native session active before open can synchronously emit an outside event', async () => {
    vi.stubGlobal(
      'EyeDropper',
      class {
        open() {
          document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          return new Promise<{ sRGBHex: string }>(() => undefined);
        }
      }
    );

    renderSelector();
    await clickButton('shared.ui.colorSelectorChooseColor');
    await clickButton('shared.ui.colorSelectorEyedropper');

    expect(getButton('shared.ui.colorSelectorApply')).toBeDefined();
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
