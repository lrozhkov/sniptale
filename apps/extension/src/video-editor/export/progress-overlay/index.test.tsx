// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoProjectExportPhase } from '../../../features/video/project/types';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: vi.fn(),
}));

import { ExportProgressOverlay } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderOverlay(onCancel = vi.fn()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <ExportProgressOverlay
        onCancel={onCancel}
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
    const progressFill = container?.querySelector<HTMLElement>('.h-3.rounded-full');

    expect(dialog).not.toBeNull();
    expect(container?.textContent).toContain('videoEditor.progress.title');
    expect(container?.textContent).toContain('Muxing project output');
    expect(container?.textContent).toContain('60%');
    expect(progressFill?.style.width).toBe('60%');
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
