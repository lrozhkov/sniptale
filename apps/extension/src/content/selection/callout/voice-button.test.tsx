// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('../../../composition/persistence/settings', () => ({
  loadSettings: async () => ({ voiceInput: { enabled: true } }),
  subscribeToVoiceInputPreferencesChanges: () => () => undefined,
}));
import { CalloutVoiceButton, resolveCalloutVoiceButtonLeftOffset } from './voice-button';

it('renders the microphone substrate only while the callout is being edited', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  const voice = {
    actions: { start: () => undefined, stop: () => undefined, cancel: () => undefined },
    state: {
      active: false,
      pending: false,
      audioLevel: 0,
      errorCode: null,
      phase: 'idle' as const,
    },
  };

  await act(async () =>
    root.render(<CalloutVoiceButton isEditing={false} leftOffset={48} voice={voice} />)
  );
  expect(container.innerHTML).toBe('');
  await act(async () =>
    root.render(<CalloutVoiceButton isEditing leftOffset={48} visualScale={0.5} voice={voice} />)
  );
  const markup = container.innerHTML;
  expect(markup).toContain('content.highlighter.callout-voice-input');
  expect(markup).toContain('surface-contrast');
  expect(markup).toContain('text-inverse');
  expect(markup).toContain('scale: 0.5');
  expect(markup).toContain('transform: translateY(-50%)');
  expect(markup).not.toContain('-translate-y-1/2');
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

it('moves the microphone to the left when the callout is clamped at the right viewport edge', () => {
  const offset = resolveCalloutVoiceButtonLeftOffset({
    calloutLeft: 252,
    calloutWidth: 40,
    viewportWidth: 300,
  });

  expect(offset).toBe(-36);
  expect(252 + offset).toBeGreaterThanOrEqual(8);
});

it('keeps the microphone inside the viewport when neither outside edge has room', () => {
  const offset = resolveCalloutVoiceButtonLeftOffset({
    calloutLeft: 8,
    calloutWidth: 284,
    viewportWidth: 300,
  });

  expect(8 + offset).toBe(264);
  expect(8 + offset + 28).toBeLessThanOrEqual(292);
});
