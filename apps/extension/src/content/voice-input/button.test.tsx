// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

vi.mock('../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/trusted-events')>()),
  isTrustedMouseEvent: vi.fn(() => true),
}));

import { ContentVoiceInputButton } from './button';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

function renderButton(active: boolean, onStart = vi.fn(), onStop = vi.fn()) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ContentVoiceInputButton
        dataUi="voice-test"
        disabled={false}
        labels={{ error: 'Error', start: 'Start', stop: 'Stop' }}
        onStart={onStart}
        onStop={onStop}
        state={{
          active,
          audioLevel: active ? 0.5 : 0,
          errorCode: null,
          phase: active ? 'listening' : 'idle',
        }}
      />
    );
  });
  return { button: container.querySelector('button')!, onStart, onStop };
}

it('exposes the click toggle and renders audio-level feedback while active', () => {
  const idle = renderButton(false);
  act(() => idle.button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
  expect(idle.onStart).toHaveBeenCalledOnce();

  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  const active = renderButton(true);
  expect(active.button.getAttribute('aria-pressed')).toBe('true');
  expect(active.button.querySelector('span')).not.toBeNull();
  act(() => active.button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
  expect(active.onStop).toHaveBeenCalledOnce();
});

it('uses the contrast surface and inverse icon treatment above arbitrary page content', () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ContentVoiceInputButton
        appearance="contrast"
        dataUi="voice-contrast-test"
        disabled={false}
        labels={{ error: 'Error', start: 'Start', stop: 'Stop' }}
        onStart={vi.fn()}
        onStop={vi.fn()}
        state={{ active: false, audioLevel: 0, errorCode: null, phase: 'idle' }}
      />
    );
  });

  const className = container.querySelector('button')?.className;
  expect(className).toContain('surface-contrast');
  expect(className).toContain('text-inverse');
});
