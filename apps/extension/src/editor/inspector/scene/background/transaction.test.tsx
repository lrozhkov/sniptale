// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';
import { EditorInspectorFrameBackgroundFillEditor } from './';

vi.mock('../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../chrome/ui')>()),
}));

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it('restores the pre-open legacy frame value when a preview echo is cancelled', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  function StatefulBackground() {
    const [frame, setFrame] = useState<EditorFrameSettings>({
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      backgroundColor: '#ffffffff',
      backgroundMode: 'color',
    });
    const applyPatch = (patch: Partial<EditorFrameSettings>) =>
      setFrame((current) => ({ ...current, ...patch }));
    return (
      <div>
        <output data-testid="background-color">{frame.backgroundColor}</output>
        <EditorInspectorFrameBackgroundFillEditor
          applyFramePatch={applyPatch}
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
  const paletteColor = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.getAttribute('aria-label')?.endsWith('#123456')
  );
  expect(paletteColor).toBeDefined();
  act(() => paletteColor?.click());
  expect(host.querySelector('[data-testid="background-color"]')?.textContent).toBe('#123456ff');

  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));
  await act(nextFrame);
  expect(host.querySelector('[data-testid="background-color"]')?.textContent).toBe('#ffffffff');

  act(() => root.unmount());
  host.remove();
});
