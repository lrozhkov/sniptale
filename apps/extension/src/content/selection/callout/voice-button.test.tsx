import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CalloutVoiceButton, resolveCalloutVoiceButtonLeftOffset } from './voice-button';

it('renders the microphone substrate only while the callout is being edited', () => {
  const voice = {
    actions: { start: () => undefined, stop: () => undefined },
    state: { active: false, audioLevel: 0, errorCode: null, phase: 'idle' as const },
  };

  expect(
    renderToStaticMarkup(<CalloutVoiceButton isEditing={false} leftOffset={48} voice={voice} />)
  ).toBe('');
  const markup = renderToStaticMarkup(
    <CalloutVoiceButton isEditing leftOffset={48} visualScale={0.5} voice={voice} />
  );
  expect(markup).toContain('content.highlighter.callout-voice-input');
  expect(markup).toContain('surface-contrast');
  expect(markup).toContain('text-inverse');
  expect(markup).toContain('scale:0.5');
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
