// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  openSettingsPage: vi.fn().mockResolvedValue(undefined),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => `t:${key}`,
}));
vi.mock('../../../../runtime-services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../runtime-services')>()),
  getPopupRuntimeServices: () => ({
    messaging: {
      sendRuntimeMessage: runtimeMocks.sendRuntimeMessage,
    },
  }),
}));
vi.mock('../../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/navigation/extension-pages')>()),
  openSettingsPage: runtimeMocks.openSettingsPage,
}));

import { VideoPresetSelector } from './preset-selector';
import { getVideoPresetAvailabilityDescription } from './preset-availability';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

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

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  runtimeMocks.sendRuntimeMessage.mockResolvedValue({
    success: true,
    availabilities: [
      {
        status: 'requires-start-validation',
        presetId: 'preset-1',
        target: 'viewport',
        required: { width: 1280, height: 720 },
      },
    ],
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('describes loading, pending, available, and unavailable availability states', () => {
  expect(getVideoPresetAvailabilityDescription(undefined, 'viewport')).toBe(
    't:viewportPresets.availability.checking'
  );
  expect(
    getVideoPresetAvailabilityDescription(
      {
        status: 'requires-start-validation',
        presetId: 'viewport-1',
        target: 'viewport',
        required: { width: 1280, height: 720 },
      },
      'viewport'
    )
  ).toBe('t:viewportPresets.availability.pendingVideo');
  expect(
    getVideoPresetAvailabilityDescription(
      {
        status: 'available',
        presetId: 'window-1',
        target: 'window',
        required: { width: 1280, height: 720 },
      },
      'window'
    )
  ).toBe('t:viewportPresets.hints.window');
  expect(
    getVideoPresetAvailabilityDescription(
      {
        status: 'unavailable',
        presetId: 'viewport-1',
        target: 'viewport',
        reason: 'viewport-too-large',
      },
      'viewport'
    )
  ).toBe('t:viewportPresets.availability.viewportTooLarge');
});

it('shows native size and viewport presets in an inline curtain', async () => {
  const onPresetChange = vi.fn();

  renderNode(
    <VideoPresetSelector
      captureMode={CaptureMode.TAB}
      viewportPresets={[
        {
          kind: 'user',
          id: 'preset-1',
          name: 'Preset',
          target: 'viewport',
          width: 1280,
          height: 720,
          enabled: true,
          order: 0,
        },
      ]}
      selectedPresetId={null}
      onPresetChange={onPresetChange}
    />
  );
  await flushEffects();

  const buttons = () => Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  expect(container?.textContent).toContain('t:popup.video.presetRowLabel');
  expect(container?.textContent).toContain('t:viewportPresets.section.nativeOption');

  await act(async () => {
    buttons()[0]?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(container?.textContent).toContain('Preset');
  expect(container?.textContent).toContain('1\u00a0280 × 720');
  expect(container?.textContent).not.toContain('t:popup.video.presetNativeDescription');
  expect(container?.textContent?.split('t:viewportPresets.availability.pendingVideo').length).toBe(
    2
  );
  expect(runtimeMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'GET_VIEWPORT_PRESET_AVAILABILITY',
    context: 'video',
    presetIds: ['preset-1'],
  });
  expect(runtimeMocks.sendRuntimeMessage).toHaveBeenCalledOnce();

  act(() => {
    container?.querySelector<HTMLElement>('[title="Preset"]')?.closest('button')?.click();
  });
  expect(onPresetChange).toHaveBeenCalledWith('preset-1');
});

it('opens the size-preset settings section from the selector management action', async () => {
  renderNode(
    <VideoPresetSelector
      captureMode={CaptureMode.TAB}
      viewportPresets={[]}
      selectedPresetId={null}
      onPresetChange={vi.fn()}
    />
  );

  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const manageButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).find((button) => button.textContent === 't:popup.video.manageSizePresets');
  const nativeOption = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).find((button) => button.textContent === 't:viewportPresets.section.nativeOption');
  expect(manageButton).toBeTruthy();
  expect(container?.querySelectorAll('[aria-controls]')).toHaveLength(1);
  expect(manageButton?.closest('[id]')).not.toBeNull();
  expect(
    nativeOption && manageButton
      ? Boolean(
          nativeOption.compareDocumentPosition(manageButton) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      : false
  ).toBe(true);

  act(() => manageButton?.click());
  expect(runtimeMocks.openSettingsPage).toHaveBeenCalledWith({
    route: { section: 'screen-sizes' },
  });
});

it('selects native size when the native curtain option is clicked', async () => {
  const onPresetChange = vi.fn();

  renderNode(
    <VideoPresetSelector
      captureMode={CaptureMode.TAB}
      viewportPresets={[
        {
          kind: 'user',
          id: 'preset-1',
          name: 'Preset',
          target: 'viewport',
          width: 1280,
          height: 720,
          enabled: true,
          order: 0,
        },
      ]}
      selectedPresetId="preset-1"
      onPresetChange={onPresetChange}
    />
  );
  await flushEffects();

  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  act(() => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent === 't:viewportPresets.section.nativeOption')
      ?.click();
  });

  expect(onPresetChange).toHaveBeenCalledWith(null);
});

it('keeps a preset disabled when runtime availability fails', async () => {
  runtimeMocks.sendRuntimeMessage.mockRejectedValue(new Error('worker unavailable'));
  const onPresetChange = vi.fn();
  renderNode(
    <VideoPresetSelector
      captureMode={CaptureMode.TAB}
      viewportPresets={[
        {
          kind: 'user',
          id: 'preset-1',
          name: 'Preset',
          target: 'viewport',
          width: 1280,
          height: 720,
          enabled: true,
          order: 0,
        },
      ]}
      selectedPresetId={null}
      onPresetChange={onPresetChange}
    />
  );
  await flushEffects();

  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const presetButton = container
    ?.querySelector<HTMLElement>('[title="Preset"]')
    ?.closest<HTMLButtonElement>('button');
  expect(presetButton?.disabled).toBe(false);
  expect(presetButton?.getAttribute('aria-disabled')).toBe('true');
  expect(container?.textContent).toContain('t:viewportPresets.availability.platformRejected');
  const notification = container?.querySelector('[role="status"]');
  expect(
    notification && presetButton
      ? Boolean(
          notification.compareDocumentPosition(presetButton) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      : false
  ).toBe(true);
  act(() => presetButton?.click());
  expect(onPresetChange).not.toHaveBeenCalled();
});

it('shows availability progress only when the batch request takes at least 400ms', async () => {
  let resolveAvailability!: (value: {
    success: true;
    availabilities: Array<{
      status: 'requires-start-validation';
      presetId: string;
      target: 'viewport';
      required: { width: number; height: number };
    }>;
  }) => void;
  const availability = new Promise<Parameters<typeof resolveAvailability>[0]>((resolve) => {
    resolveAvailability = resolve;
  });
  runtimeMocks.sendRuntimeMessage.mockReturnValue(availability);
  renderNode(
    <VideoPresetSelector
      captureMode={CaptureMode.TAB}
      viewportPresets={[
        {
          kind: 'user',
          id: 'preset-1',
          name: 'Preset',
          target: 'viewport',
          width: 1280,
          height: 720,
          enabled: true,
          order: 0,
        },
      ]}
      selectedPresetId={null}
      onPresetChange={vi.fn()}
    />
  );
  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
    await Promise.resolve();
  });

  expect(container?.textContent).not.toContain('t:viewportPresets.availability.checking');
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 410));
  });
  expect(container?.textContent).toContain('t:viewportPresets.availability.checking');
  expect(container?.textContent?.split('t:viewportPresets.availability.checking')).toHaveLength(2);

  await act(async () => {
    resolveAvailability({
      success: true,
      availabilities: [
        {
          status: 'requires-start-validation',
          presetId: 'preset-1',
          target: 'viewport',
          required: { width: 1280, height: 720 },
        },
      ],
    });
    await Promise.resolve();
  });
  expect(container?.textContent).not.toContain('t:viewportPresets.availability.checking');
});

it('shows the screen limitation once instead of repeating it for every preset', async () => {
  renderNode(
    <VideoPresetSelector
      captureMode={CaptureMode.SCREEN}
      viewportPresets={[
        {
          kind: 'user',
          id: 'preset-1',
          name: 'Viewport',
          target: 'viewport',
          width: 1280,
          height: 720,
          enabled: true,
          order: 0,
        },
        {
          kind: 'user',
          id: 'preset-2',
          name: 'Window',
          target: 'window',
          width: 1280,
          height: 720,
          enabled: true,
          order: 0,
        },
      ]}
      selectedPresetId={null}
      onPresetChange={vi.fn()}
    />
  );

  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
  });

  expect(
    container?.textContent?.split('t:viewportPresets.availability.screenUnsupported').length
  ).toBe(2);
  expect(container?.textContent).not.toContain('t:viewportPresets.availability.pendingVideo');
});

it('disables viewport presets but keeps window presets selectable for crop recording', async () => {
  runtimeMocks.sendRuntimeMessage.mockResolvedValue({
    success: true,
    availabilities: [
      {
        status: 'requires-start-validation',
        presetId: 'viewport-1',
        target: 'viewport',
        required: { width: 1280, height: 720 },
      },
      {
        status: 'available',
        presetId: 'window-1',
        target: 'window',
        required: { width: 1280, height: 720 },
      },
    ],
  });
  const onPresetChange = vi.fn();
  renderNode(
    <VideoPresetSelector
      captureMode={CaptureMode.TAB_CROP}
      viewportPresets={[
        {
          kind: 'user',
          id: 'viewport-1',
          name: 'Viewport',
          target: 'viewport',
          width: 1280,
          height: 720,
          enabled: true,
          order: 0,
        },
        {
          kind: 'user',
          id: 'window-1',
          name: 'Window',
          target: 'window',
          width: 1280,
          height: 720,
          enabled: true,
          order: 0,
        },
      ]}
      selectedPresetId={null}
      onPresetChange={onPresetChange}
    />
  );

  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const viewportButton = buttons.find((button) => button.textContent?.includes('Viewport'));
  const windowButton = buttons.find((button) => button.textContent?.includes('Window'));
  expect(viewportButton?.getAttribute('aria-disabled')).toBe('true');
  expect(windowButton?.getAttribute('aria-disabled')).not.toBe('true');
  expect(container?.textContent?.indexOf('t:viewportPresets.groups.window')).toBeLessThan(
    container?.textContent?.indexOf('t:viewportPresets.groups.viewport') ?? -1
  );
  expect(container?.textContent).toContain(
    't:viewportPresets.availability.cropViewportUnsupported'
  );

  act(() => viewportButton?.click());
  expect(onPresetChange).not.toHaveBeenCalled();
  act(() => windowButton?.click());
  expect(onPresetChange).toHaveBeenCalledWith('window-1');
});

it('can hide the preset selector when switching from tab capture to camera', async () => {
  const props = {
    viewportPresets: [
      {
        kind: 'user' as const,
        id: 'preset-1',
        name: 'Preset',
        target: 'viewport' as const,
        width: 1280,
        height: 720,
        enabled: true,
        order: 0,
      },
    ],
    selectedPresetId: null,
    onPresetChange: vi.fn(),
  };

  renderNode(<VideoPresetSelector {...props} captureMode={CaptureMode.TAB} />);
  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
    await Promise.resolve();
  });

  expect(() =>
    renderNode(<VideoPresetSelector {...props} captureMode={CaptureMode.CAMERA} />)
  ).not.toThrow();
  expect(container?.textContent).toBe('');
});
