// @vitest-environment jsdom

import { hideAllToasts } from '@sniptale/ui/product-feedback/toast-service';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import { translate } from '../../../../platform/i18n';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';
import { EditorInspectorFrameBackgroundFillEditor } from './';

vi.mock('../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../chrome/ui')>()),
}));

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

for (const accept of [false, true]) {
  it(`previews paint and ${accept ? 'accepts it once on Apply' : 'restores the baseline on Escape'}`, async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    const commit = vi.fn();
    function StatefulBackground() {
      const [frame, setFrame] = useState<EditorFrameSettings>({
        ...DEFAULT_EDITOR_FRAME_SETTINGS,
        backgroundColor: '#ffffffff',
        backgroundMode: 'color',
      });
      const [accepted, setAccepted] = useState('#ffffffff');
      const applyPatch = (patch: Partial<EditorFrameSettings>) =>
        setFrame((current) => ({ ...current, ...patch }));
      return (
        <div>
          <output data-testid="accepted-color">{accepted}</output>
          <output data-testid="background-color">{frame.backgroundColor}</output>
          <EditorInspectorFrameBackgroundFillEditor
            applyFramePatch={(patch) => {
              commit(patch);
              applyPatch(patch);
              if (patch.backgroundColor) setAccepted(patch.backgroundColor);
            }}
            applyGradientPreset={vi.fn()}
            frameBackgroundImageFitOptions={[]}
            frameBackgroundPalette={['#123456']}
            frameDraft={frame}
            gradientPresets={[]}
            onClearBackgroundImage={vi.fn()}
            onPickBackgroundImage={vi.fn()}
            previewFramePatch={applyPatch}
            recentColors={[]}
            toNumber={Number}
          />
        </div>
      );
    }

    await act(async () => root.render(<StatefulBackground />));
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-ui="shared.ui.paint-selector.trigger"]')?.click()
    );
    await act(nextFrame);
    const paletteColor = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '[data-ui="shared.ui.paint-selector.popup"] button'
      )
    ).find((button) => button.getAttribute('aria-label')?.endsWith('#123456'));
    expect(paletteColor).toBeDefined();
    act(() => paletteColor?.click());
    expect(host.querySelector('[data-testid="background-color"]')?.textContent).toBe('#123456ff');
    expect(host.querySelector('[data-testid="accepted-color"]')?.textContent).toBe('#ffffffff');
    expect(commit).not.toHaveBeenCalled();

    if (accept) {
      const apply = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          '[data-ui="shared.ui.paint-selector.popup"] button'
        )
      ).find((button) => button.textContent?.includes(translate('shared.ui.colorSelectorApply')));
      expect(apply).toBeDefined();
      act(() => apply?.click());
    } else {
      act(() =>
        document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
      );
    }
    await act(nextFrame);
    expect(host.querySelector('[data-testid="background-color"]')?.textContent).toBe(
      accept ? '#123456ff' : '#ffffffff'
    );
    expect(host.querySelector('[data-testid="accepted-color"]')?.textContent).toBe(
      accept ? '#123456ff' : '#ffffffff'
    );
    expect(commit).toHaveBeenCalledTimes(accept ? 1 : 0);

    await act(async () => {
      root.unmount();
      hideAllToasts();
    });
    expect(document.querySelectorAll('[data-ui="shared.toast.host"]')).toHaveLength(0);
    host.remove();
  });
}
