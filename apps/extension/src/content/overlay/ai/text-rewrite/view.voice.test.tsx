// @vitest-environment jsdom
import { click, fill, mocks, selectTarget, shadow, submit, ui } from './view.test-support';
import { voiceFixture } from './voice.test-support';
import { expect, it } from 'vitest';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';

it('uses the public voice session at the captured caret and sends its completed instruction', async () => {
  await selectTarget();
  await fill('Before after');
  ui<HTMLTextAreaElement>('content.ai-text.prompt').setSelectionRange(7, 7);
  await click(ui('content.ai-text.voice'));
  expect(voiceFixture.client.start).toHaveBeenCalledOnce();
  voiceFixture.emit({
    type: VoiceInputPortMessageType.TRANSCRIPT,
    sessionId: 'session-1',
    text: 'spoken',
    sequence: 0,
    confidence: 0.9,
    isFinal: true,
  });
  expect(ui<HTMLTextAreaElement>('content.ai-text.prompt').value).toBe('Before spoken after');
  voiceFixture.emit({
    type: VoiceInputPortMessageType.SNAPSHOT,
    snapshot: {
      apiFlavor: 'standard',
      busyOwner: null,
      effectiveMode: 'browser-managed',
      errorCode: null,
      fallbackReason: null,
      language: 'en-US',
      localAvailability: 'unknown',
      phase: 'ended',
      quality: 'dictation',
      qualitySupported: false,
      requestedMode: 'browser-managed',
      sessionId: 'session-1',
    },
  });
  await submit();
  expect(mocks.request).toHaveBeenCalledWith(
    expect.objectContaining({ prompt: 'Before spoken after' })
  );
});

it('cancels voice ownership when the selected element changes and rejects later transcripts', async () => {
  await selectTarget();
  await fill('Draft');
  await click(ui('content.ai-text.voice'));
  const second = document.createElement('p');
  second.textContent = 'Second source';
  document.body.append(second);
  await click(second);
  expect(voiceFixture.client.cancel).toHaveBeenCalledWith('session-1');
  voiceFixture.emit({
    type: VoiceInputPortMessageType.TRANSCRIPT,
    sessionId: 'session-1',
    text: 'Late speech',
    sequence: 0,
    confidence: null,
    isFinal: true,
  });
  expect(ui<HTMLTextAreaElement>('content.ai-text.prompt').value).toBe('Draft');
  await click(ui('content.ai-text.close'));
  expect(voiceFixture.client.disconnect).toHaveBeenCalled();
});

it('replaces dictation with a chosen ready prompt and rejects a late transcript', async () => {
  await selectTarget();
  await fill('Draft');
  await click(ui('content.ai-text.voice'));
  const picker = ui('ai-modal.template-picker');
  const trigger = picker.querySelector<HTMLButtonElement>('button');
  expect(trigger?.disabled).toBe(false);
  await click(trigger!);
  const selected = Array.from(shadow.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (node) => node.textContent?.includes('Shorten')
  );
  if (!selected) throw new Error('The ready prompt option is missing');
  await click(selected);
  expect(voiceFixture.client.cancel).toHaveBeenCalledWith('session-1');
  voiceFixture.emit({
    type: VoiceInputPortMessageType.TRANSCRIPT,
    sessionId: 'session-1',
    text: 'Late speech',
    sequence: 0,
    confidence: null,
    isFinal: true,
  });
  expect(ui<HTMLTextAreaElement>('content.ai-text.prompt').value).toBe(
    'Make the selected text concise.'
  );
});
