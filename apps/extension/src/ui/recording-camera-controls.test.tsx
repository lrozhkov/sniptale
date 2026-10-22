// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { RecordingCameraControls } from './recording-camera-controls';

vi.mock('../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('uses shared switches and keeps acknowledged values until the caller accepts a patch', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  try {
    await act(async () =>
      root.render(
        <RecordingCameraControls
          presentation={DEFAULT_VIDEO_SETTINGS.webcamPresentation!}
          onChange={onChange}
        />
      )
    );
    const free = host.querySelector<HTMLButtonElement>(
      '[aria-label="popup.video.webcamFreePlacement"]'
    )!;
    expect(free.className).toContain('sniptale-glass-switch');
    await act(async () => free.click());
    expect(onChange).toHaveBeenLastCalledWith({ freePlacement: true });
    expect(free.getAttribute('aria-checked')).toBe('false');
    for (const [label, key, value] of [
      ['Mirror', 'mirror', true],
      ['Shadow', 'shadow', false],
    ] as const) {
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            `[aria-label="popup.video.webcamPresentation${label}"]`
          )!
          .click()
      );
      expect(onChange).toHaveBeenLastCalledWith({
        appearance: expect.objectContaining({ [key]: value }),
      });
    }
    expect(
      host.querySelector('[data-ui="shared.ui.compact-inspector.color-field"]')
    ).not.toBeNull();
    expect(host.textContent).toContain('popup.video.webcamPresentationZoom');
    for (const [field, patch] of [
      ['Size', { sizeFraction: 0.23 }],
      ['Zoom', { appearance: expect.objectContaining({ zoom: 1.01 }) }],
      ['CropHorizontal', { cropOffset: { x: 0.01, y: 0 } }],
      ['CropVertical', { cropOffset: { x: 0, y: 0.01 } }],
    ] as const) {
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            `[aria-label="popup.video.webcamPresentation${field} increase"]`
          )!
          .click()
      );
      expect(onChange).toHaveBeenLastCalledWith(patch);
    }
    await act(async () =>
      root.render(
        <RecordingCameraControls
          presentation={{
            ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
            shape: 'rectangle',
          }}
          onChange={onChange}
        />
      )
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="popup.video.webcamPresentationRoundness increase"]'
        )!
        .click()
    );
    expect(onChange).toHaveBeenLastCalledWith({
      appearance: expect.objectContaining({ roundness: 13 }),
    });
    await act(async () =>
      root.render(
        <RecordingCameraControls
          disabled
          presentation={DEFAULT_VIDEO_SETTINGS.webcamPresentation!}
          onChange={onChange}
        />
      )
    );
    onChange.mockClear();
    await act(async () => free.click());
    expect(onChange).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
