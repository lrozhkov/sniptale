import {
  createContentPort,
  createProcessingSessionFixture,
  createSnapshot,
  createVoiceInputCoordinator,
  flush,
  mocks,
} from './coordinator.test-support';
import { describe, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';

async function expectProcessingCompletes(
  h: Awaited<ReturnType<typeof createProcessingSessionFixture>>
) {
  h.owner.onMessage.emit({
    type: VoiceInputPortMessageType.STATUS,
    requestId: 'observe-processing',
  });
  await flush();
  const observation = h.owner.postMessage.mock.calls.filter(
    ([event]) => event.requestId === 'observe-processing'
  );
  h.complete();
  await flush();
  expect(observation).toEqual([
    [
      expect.objectContaining({
        snapshot: expect.objectContaining({ phase: 'processing-asr', sessionId: 'client' }),
      }),
    ],
  ]);
  expect(
    h.owner.postMessage.mock.calls.filter(
      ([event]) => event.type === VoiceInputPortMessageType.TRANSCRIPT
    )
  ).toEqual([[expect.objectContaining({ text: 'final', isFinal: true })]]);
}

describe('START response after capture transfers to background processing', () => {
  it.each(['starting', 'listening', 'ended', 'error', 'refused', 'rejected'] as const)(
    'preserves processing after delayed START %s',
    async (outcome) => {
      let reply!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      mocks.sendRuntimeMessage.mockImplementation((message) => {
        if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_START)
          return new Promise((resolve, no) => {
            reply = resolve;
            reject = no;
          });
        return Promise.resolve({
          success: true,
          result: 'accepted',
          snapshot: createSnapshot(null, 'idle'),
        });
      });
      const h = await createProcessingSessionFixture();
      await h.transfer();
      if (outcome === 'rejected') reject(new Error('lost acknowledgement'));
      else if (outcome === 'refused') reply({ success: false });
      else
        reply({
          success: true,
          result: 'accepted',
          snapshot: {
            ...createSnapshot('offscreen-session-1', outcome),
            errorCode: outcome === 'error' ? 'offscreen-unavailable' : null,
          },
        });
      await flush();
      await expectProcessingCompletes(h);
      expect(mocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.OFFSCREEN_VOICE_INPUT_STOP, force: true })
      );
      expect(h.owner.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'start', type: VoiceInputPortMessageType.FAILURE })
      );
    }
  );
});

describe('START compensation after capture transfers', () => {
  it.each(['force-terminal', 'force-refused', 'force-rejected', 'fallback-status'] as const)(
    'preserves processing while %s is pending',
    async (boundary) => {
      let reply!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      const pending = new Promise((resolve, no) => {
        reply = resolve;
        reject = no;
      });
      mocks.sendRuntimeMessage.mockImplementation((message) => {
        if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_START)
          return Promise.reject(new Error('lost acknowledgement'));
        if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP)
          return boundary === 'fallback-status' ? Promise.resolve({ success: false }) : pending;
        if (
          message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS &&
          message.requestId.endsWith(':rollback-status')
        )
          return pending;
        return Promise.resolve({
          success: true,
          result: 'accepted',
          snapshot: createSnapshot(null, 'idle'),
        });
      });
      const h = await createProcessingSessionFixture();
      await h.transfer();
      if (boundary === 'force-rejected') reject(new Error('lost compensation acknowledgement'));
      else
        reply(
          boundary === 'force-refused'
            ? { success: false }
            : { success: true, result: 'accepted', snapshot: createSnapshot(null, 'idle') }
        );
      await flush();
      await expectProcessingCompletes(h);
      expect(
        mocks.sendRuntimeMessage.mock.calls.filter(
          ([message]) =>
            message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS &&
            message.requestId.endsWith(':rollback-status')
        )
      ).toHaveLength(boundary === 'fallback-status' ? 1 : 0);
      expect(h.owner.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'start', type: VoiceInputPortMessageType.FAILURE })
      );
    }
  );
  it('does not reset processing when a pending rollback retry resolves', async () => {
    let forceCalls = 0;
    let reply!: (value: unknown) => void;
    mocks.sendRuntimeMessage.mockImplementation((message) => {
      if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_START && message.requestId === 'start')
        return Promise.reject(new Error('lost acknowledgement'));
      if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP) {
        forceCalls += 1;
        if (forceCalls === 2)
          return new Promise((resolve) => {
            reply = resolve;
          });
      }
      return Promise.resolve({
        success: true,
        result: 'accepted',
        snapshot: createSnapshot('offscreen-session-1', 'listening'),
      });
    });
    const h = await createProcessingSessionFixture();
    h.owner.onMessage.emit({
      type: VoiceInputPortMessageType.START,
      requestId: 'retry',
      sessionId: 'retry-client',
      preferences: { language: 'ru-RU', mode: 'local-first' },
    });
    await flush();
    expect(forceCalls).toBe(2);
    await h.transfer();
    reply({ success: true, result: 'accepted', snapshot: createSnapshot(null, 'idle') });
    await flush();
    await expectProcessingCompletes(h);
    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: MessageType.OFFSCREEN_VOICE_INPUT_START, requestId: 'retry' })
    );
  });
});

describe('orphan STATUS acknowledgement after successor admission', () => {
  it('preserves successor processing after the old orphan already stopped but its reply was delayed', async () => {
    let stopped = false;
    let reply!: (value: unknown) => void;
    mocks.sendRuntimeMessage.mockImplementation((message) => {
      if (
        message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS &&
        message.requestId === 'orphan-check'
      )
        return Promise.resolve({
          success: true,
          snapshot: createSnapshot('orphan-session', 'listening'),
        });
      if (
        message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP &&
        message.sessionId === 'orphan-session'
      ) {
        stopped = true;
        return new Promise((resolve) => {
          reply = resolve;
        });
      }
      if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_START) expect(stopped).toBe(true);
      return Promise.resolve({
        success: true,
        result: 'accepted',
        snapshot:
          message.type === MessageType.OFFSCREEN_VOICE_INPUT_START
            ? createSnapshot('offscreen-session-1', 'listening')
            : createSnapshot(null, 'idle'),
      });
    });
    const coordinator = createVoiceInputCoordinator();
    const observer = createContentPort('orphan-observer');
    coordinator.registerPort(observer.port);
    observer.onMessage.emit({ type: VoiceInputPortMessageType.STATUS, requestId: 'orphan-check' });
    await flush();
    expect(stopped).toBe(true);
    const h = await createProcessingSessionFixture(undefined, coordinator);
    await h.transfer();
    reply({ success: true, result: 'accepted', snapshot: createSnapshot(null, 'idle') });
    await flush();
    await expectProcessingCompletes(h);
  });
});
