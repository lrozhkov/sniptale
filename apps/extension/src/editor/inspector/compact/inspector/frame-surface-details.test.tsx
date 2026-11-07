// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { disableFrameBackground } from '../../scene/background/settings';
import { buildFrameSurfaceCommands } from './frame-surface-details';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';
const resources = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../../../composition/background-resources/catalog', () => ({
  useBackgroundCatalog: () => ({
    status: 'ready',
    presets: [{ id: 'first', enabled: true, available: true }],
  }),
}));
vi.mock('../../../../composition/background-resources/acquisition', () => ({
  readBundledBackground: resources.read,
  readLibraryBackground: vi.fn(),
}));
vi.mock('../../../../platform/media-utils/data-url', () => ({
  blobToDataUrl: async () => 'data:image/png;base64,selected',
}));
it('hides compact Reset in None and preserves image mode through the active reset shortcut', () => {
  const params = {
    ...createInspectorCommandParams(),
    lastFillModeRef: { current: 'color' as const },
    richShapeSelection: null,
  };
  const none = buildFrameSurfaceCommands({
    ...params,
    frameDraft: disableFrameBackground(params.frameDraft),
  } as Parameters<typeof buildFrameSurfaceCommands>[0]);
  expect(none.map((command) => command.id)).toEqual(['frame-background-fill']);
  const image = {
    ...params.frameDraft,
    backgroundMode: 'image' as const,
    backgroundImageData: 'kept',
    backgroundBlurAmount: 20,
  };
  const commands = buildFrameSurfaceCommands({ ...params, frameDraft: image } as Parameters<
    typeof buildFrameSurfaceCommands
  >[0]);
  commands.find((command) => command.id === 'frame-apply')!.onClick!();
  const update = params.setFrameDraft.mock.calls[0]![0] as (
    state: EditorFrameSettings
  ) => EditorFrameSettings;
  expect(update(image)).toMatchObject({
    backgroundMode: 'image',
    backgroundImageData: 'kept',
    backgroundBlurAmount: 0,
  });
});
it('uses shared first-image acquisition, Advanced fit controls and reset through compact content', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  resources.read.mockResolvedValue({ file: new File(['x'], 'background.png') });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const initial = createInspectorCommandParams();
  const updates = vi.fn();
  let currentFrame: EditorFrameSettings = initial.frameDraft;
  function Probe() {
    const [frame, setFrame] = useState(disableFrameBackground(initial.frameDraft));
    currentFrame = frame;
    const params = {
      ...initial,
      lastFillModeRef: { current: 'color' as const },
      richShapeSelection: null,
      frameDraft: frame,
      frameBackgroundImageFitOptions: [
        { value: 'cover' as const, label: 'Cover' },
        { value: 'contain' as const, label: 'Contain' },
      ],
      setFrameDraft: (next: React.SetStateAction<EditorFrameSettings>) => {
        updates();
        setFrame(next);
      },
    };
    return (
      <>
        {
          buildFrameSurfaceCommands(params as Parameters<typeof buildFrameSurfaceCommands>[0])[0]!
            .content
        }
      </>
    );
  }
  try {
    await act(async () => root.render(<Probe />));
    expect(host.querySelector('[data-ui="editor.frame.actions"]')).toBeNull();
    await act(async () =>
      host
        .querySelectorAll<HTMLButtonElement>('[data-ui="editor.frame.background-mode"] button')[2]!
        .click()
    );
    expect(resources.read).toHaveBeenCalledWith('first', expect.any(AbortSignal));
    expect(updates).toHaveBeenCalledOnce();
    expect(
      host.querySelector<HTMLButtonElement>('[data-ui="editor.frame.actions"] button')!.disabled
    ).toBe(true);
    expect(
      host
        .querySelectorAll<HTMLButtonElement>('[data-ui="editor.frame.background-mode"] button')[2]!
        .getAttribute('aria-pressed')
    ).toBe('true');
    const advanced = [...host.querySelectorAll('details')].find((item) =>
      item.textContent?.includes('Дополнительно')
    )!;
    expect(advanced.textContent).toContain('Размещение фона');
    await act(async () =>
      advanced.querySelector<HTMLButtonElement>('button[aria-label="Размещение фона"]')!.click()
    );
    const contain = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
      item.textContent?.includes('Contain')
    )!;
    await act(async () => contain.click());
    expect(currentFrame.backgroundImageFit).toBe('contain');
    expect(
      host.querySelector<HTMLButtonElement>('[data-ui="editor.frame.actions"] button')!.disabled
    ).toBe(false);
    expect(host.querySelector('img.h-28')).toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-ui="editor.frame.actions"] button')!.click()
    );
    expect(
      host
        .querySelectorAll<HTMLButtonElement>('[data-ui="editor.frame.background-mode"] button')[2]!
        .getAttribute('aria-pressed')
    ).toBe('true');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
