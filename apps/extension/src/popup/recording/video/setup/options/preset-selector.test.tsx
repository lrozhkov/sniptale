// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));

import { VideoPresetSelector } from './preset-selector';

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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('shows native size and viewport presets in an inline curtain', () => {
  const onPresetChange = vi.fn();

  renderNode(
    <VideoPresetSelector
      viewportPresets={[{ id: 'preset-1', label: 'Preset', width: 1280, height: 720 }]}
      selectedPresetId={null}
      onPresetChange={onPresetChange}
    />
  );

  const buttons = () => Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  expect(container?.textContent).toContain('t:popup.video.presetRowLabel');
  expect(container?.textContent).toContain('t:popup.video.presetNativeLabel');

  act(() => {
    buttons()[0]?.click();
  });
  expect(container?.textContent).toContain('Preset');
  expect(container?.textContent).toContain('1280×720');

  act(() => {
    buttons()[2]?.click();
  });
  expect(onPresetChange).toHaveBeenCalledWith('preset-1');
});

it('selects native size when the native curtain option is clicked', () => {
  const onPresetChange = vi.fn();

  renderNode(
    <VideoPresetSelector
      viewportPresets={[{ id: 'preset-1', label: 'Preset', width: 1280, height: 720 }]}
      selectedPresetId="preset-1"
      onPresetChange={onPresetChange}
    />
  );

  act(() => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
  });
  act(() => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])[1]?.click();
  });

  expect(onPresetChange).toHaveBeenCalledWith(null);
});
