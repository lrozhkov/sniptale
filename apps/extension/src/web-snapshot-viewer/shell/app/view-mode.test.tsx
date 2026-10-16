// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  WebSnapshotViewerModeSwitch,
  WebSnapshotVisualSurface,
  type WebSnapshotViewerMode,
} from './view-mode';

const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);

afterEach(async () => {
  await act(async () => root.render(<></>));
});

async function renderSurface(coverage: 'full-page' | 'viewport'): Promise<void> {
  await act(async () => {
    root.render(
      <WebSnapshotVisualSurface
        locale="ru"
        screenshotCoverage={coverage}
        screenshotUrl="blob:test-screenshot"
        sourceTitle="Test"
        zoom={1}
      />
    );
  });
}

it('shows a localized warning only for an explicit visible-area preview', async () => {
  await renderSurface('viewport');
  expect(container.textContent).toContain(
    translate('webSnapshotViewer.app.partialScreenshotNotice', 'ru')
  );

  await renderSurface('full-page');
  expect(container.textContent).not.toContain(
    translate('webSnapshotViewer.app.partialScreenshotNotice', 'ru')
  );
});

it('retains the accepted mode during a canceled pointer press and activates on the next click', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const accepted = vi.fn();
  function Modes() {
    const [mode, setMode] = useState<WebSnapshotViewerMode>('static-document');
    return (
      <WebSnapshotViewerModeSwitch
        locale="en"
        mode={mode}
        onModeChange={(next) => {
          setMode(next);
          accepted(next);
        }}
      />
    );
  }
  act(() => root.render(<Modes />));
  const files = container.querySelector<HTMLButtonElement>('#web-snapshot-mode-assets-tab');
  if (!files) throw new Error('Files tab is required');
  const pointer = (type: string) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    act(() => files.dispatchEvent(event));
  };
  pointer('pointerdown');
  expect(files.dataset['pressing']).toBe('true');
  expect(files.getAttribute('aria-selected')).toBe('false');
  expect(accepted).not.toHaveBeenCalled();
  pointer('pointercancel');
  pointer('pointerup');
  act(() => files.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
  expect(accepted).not.toHaveBeenCalled();
  pointer('pointerdown');
  pointer('pointerup');
  act(() => files.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
  expect(accepted).toHaveBeenCalledExactlyOnceWith('assets');
  expect(files.getAttribute('aria-selected')).toBe('true');
  vi.unstubAllGlobals();
});
