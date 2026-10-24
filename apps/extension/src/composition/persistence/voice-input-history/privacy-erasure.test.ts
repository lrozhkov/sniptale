import { expect, it, vi } from 'vitest';
import { createVoiceHistoryPrivacyErasure } from './privacy-erasure';
import { createHistoryFixture, publish } from './test-support';

it('erases private OPFS without recreating erased database metadata', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  await publish(history);
  fixture.replace(null);
  fixture.catalog.read.mockClear();
  fixture.catalog.write.mockClear();
  const participant = createVoiceHistoryPrivacyErasure(fixture.audio);
  expect(await participant.verifyEmpty()).toBe(false);
  await participant.erase();
  expect(await participant.verifyEmpty()).toBe(true);
  expect(fixture.catalog.read).not.toHaveBeenCalled();
  expect(fixture.catalog.write).not.toHaveBeenCalled();
});

it('propagates physical erasure failure so the required participant cannot claim success', async () => {
  const fixture = createHistoryFixture();
  fixture.files.set('audio', new File(['bytes'], 'audio'));
  fixture.audio.erase = vi.fn().mockRejectedValue(new Error('storage'));
  const participant = createVoiceHistoryPrivacyErasure(fixture.audio);
  await expect(participant.erase()).rejects.toThrow('storage');
  expect(await participant.verifyEmpty()).toBe(false);
});
