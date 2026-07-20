// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { createViewerScenarioAutoClickListenerRegistry } from './listeners';

function createIframe(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  return iframe;
}

afterEach(() => {
  document.body.replaceChildren();
});

it('registers by-click listeners only on the snapshot iframe window', () => {
  const iframe = createIframe();
  const pointerDownHandler = vi.fn();
  const cleanup = createViewerScenarioAutoClickListenerRegistry(iframe)({
    clickReplayHandler: vi.fn(),
    keyboardCaptureHandler: vi.fn(),
    pointerDownHandler,
    pointerMoveHandler: vi.fn(),
    pointerUpHandler: vi.fn(),
  });

  const iframeTarget = iframe.contentDocument!.createElement('button');
  iframe.contentDocument!.body.appendChild(iframeTarget);
  iframeTarget.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));

  expect(pointerDownHandler).toHaveBeenCalledTimes(1);
  expect(pointerDownHandler).toHaveBeenCalledWith(expect.any(MouseEvent), iframe);

  cleanup();
});
