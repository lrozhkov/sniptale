// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoProjectExportPhase } from '../../../features/video/project/types';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: vi.fn(),
}));

import { ExportProgressOverlay } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderOverlay(onCancel = vi.fn(), cancellationFailed = false) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <ExportProgressOverlay
        onCancel={onCancel}
        cancellationFailed={cancellationFailed}
        status={{
          message: 'Muxing project output',
          phase: VideoProjectExportPhase.TRANSCODING,
          progress: 60,
        }}
      />
    );
  });

  return onCancel;
}

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

describe('ExportProgressOverlay', () => {
  it('renders inside the shared modal shell with progress details', () => {
    renderOverlay();

    const dialog = container?.querySelector<HTMLElement>('[role="dialog"]');
    const progressFill = container?.querySelector<HTMLElement>('[role="progressbar"] > div');

    expect(dialog).not.toBeNull();
    expect(container?.textContent).toContain('videoEditor.progress.title');
    expect(container?.textContent).not.toContain('Muxing project output');
    expect(container?.textContent).toContain('videoEditor.progress.transcoding');
    expect(container?.textContent).toContain('60%');
    expect(progressFill?.style.width).toBe('60%');
  });

  it('labels the modal, contains Tab focus and restores the opener', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    renderOverlay();
    const dialog = container?.querySelector<HTMLElement>('[role="dialog"]');
    const cancel = container?.querySelector('button');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(
      document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '')?.textContent
    ).toBe('videoEditor.progress.title');
    expect(document.activeElement).toBe(cancel);
    for (const shiftKey of [false, true]) {
      const tab = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      cancel?.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(cancel);
    }
    renderOverlay();
    expect(document.activeElement).toBe(cancel);
    act(() => root?.unmount());
    root = null;
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('keeps the active cancel control and progress when cancellation fails', () => {
    const onCancel = renderOverlay();
    const cancel = container?.querySelector('button');
    renderOverlay(onCancel, true);
    expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
      'videoEditor.progress.cancelFailed'
    );
    expect(container?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(
      '60'
    );
    expect(document.activeElement).toBe(cancel);
    act(() => cancel?.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
    renderOverlay(onCancel, false);
    expect(container?.querySelector('[role="alert"]')).toBeNull();
  });

  it('routes cancel through the shared footer action', () => {
    const onCancel = renderOverlay();
    const cancelButton = Array.from(
      container?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).find((button) => button.textContent?.includes('videoEditor.progress.cancel'));

    act(() => {
      cancelButton?.click();
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
