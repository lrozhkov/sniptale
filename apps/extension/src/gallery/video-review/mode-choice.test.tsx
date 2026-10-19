// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewModeChoice } from './mode-choice';
import { translate } from '../../platform/i18n';

it('offers two named choices with balanced descriptions and a later-switch hint', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onSelect = vi.fn();
  const onBack = vi.fn();
  try {
    await act(async () =>
      root.render(
        <ReviewModeChoice filename="recording.webm" onSelect={onSelect} onBack={onBack} />
      )
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      host.querySelector('[data-ui="gallery.videoReview.modeChoice.basic"]')
    );
    expect(host.textContent).toContain(translate('gallery.videoReview.modeChoiceSwitchHint'));
    for (const mode of ['basic', 'advanced'] as const) {
      const button = host.querySelector<HTMLButtonElement>(
        `[data-ui="gallery.videoReview.modeChoice.${mode}"]`
      )!;
      expect(button.getAttribute('aria-describedby')).toBe(`review-mode-${mode}-description`);
      expect(button.classList.contains('review-mode-choice')).toBe(true);
      expect(button.className).not.toContain('focus-visible:ring-');
      await act(async () => button.click());
      expect(onSelect).toHaveBeenLastCalledWith(mode);
    }
    const back = host.querySelector<HTMLButtonElement>(
      `[aria-label="${translate('gallery.videoReview.back')}"]`
    )!;
    await act(async () => back.click());
    expect(onBack).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
