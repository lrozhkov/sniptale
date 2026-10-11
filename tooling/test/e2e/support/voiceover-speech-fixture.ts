import { readNativeReviewWorkspace } from './native-review-workspace';
import type { Page } from '@playwright/test';
import { aiSettingsQueryResponseSchema } from '../../../../apps/extension/src/contracts/messaging/contracts/ai-settings-schemas';
import type {
  AudioJobClientMessage,
  AudioJobServerMessage,
  AudioJobStart,
} from '../../../../apps/extension/src/contracts/ai/audio';
import { AUDIO_JOB_PORT_NAME } from '../../../../apps/extension/src/contracts/ai/audio';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import { buildReviewTimeMap } from '../../../../apps/extension/src/features/video/review/timeline';
import { projectReviewVoiceover } from '../../../../apps/extension/src/features/video/review/voiceover-edits';
import { buildQuickEditAudioPlan } from '../../../../apps/extension/src/features/video/review/advanced/audio-plan';

export const speechModelResponse = aiSettingsQueryResponseSchema.parse({
  success: true,
  modelSelection: {
    chromeAiEnabled: false,
    defaultModelId: null,
    globalSystemPrompt: '',
    providers: [
      {
        id: '00000000-0000-4000-8000-000000000101',
        name: 'Local speech fixture',
        connectionType: 'openai-compatible',
        destinationKind: 'external',
        hasStoredApiKey: true,
        createdAt: 1,
      },
    ],
    models: [
      {
        id: '00000000-0000-4000-8000-000000000102',
        providerId: '00000000-0000-4000-8000-000000000101',
        modelCode: 'fixture-stt',
        displayName: 'Fixture recognition',
        operation: 'transcription',
        audio: { transcription: { responseFormat: 'verbose_json', timestampGranularity: 'word' } },
      },
      {
        id: '00000000-0000-4000-8000-000000000103',
        providerId: '00000000-0000-4000-8000-000000000101',
        modelCode: 'fixture-tts',
        displayName: 'Fixture speech',
        operation: 'speech',
        audio: { speech: { voiceId: 'fixture', responseFormat: 'wav', speed: 1 } },
      },
    ],
  },
});

/** Generated locally: no speech recording, credentials or provider fixtures. */
export function syntheticSpeechWav(duration: number, frequency = 220): Buffer {
  const rate = 16_000;
  const count = Math.round(duration * rate);
  const bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(count * 2, 40);
  for (let index = 0; index < count; index++)
    bytes.writeInt16LE(
      Math.round(2000 * Math.sin((2 * Math.PI * frequency * index) / rate)),
      44 + index * 2
    );
  return bytes;
}

/** Mock only the remote boundary; real extraction, staging, decoding and publication run. */
export async function installSpeechPortFixture(page: Page, phraseCount?: number): Promise<void> {
  await page.evaluate(
    ({ portName, shortAudio, longAudio, phraseCount }) => {
      const requests: { operation: string; text?: string; inputBytes?: number; wav?: boolean }[] =
        [];
      Object.assign(window, { speechFixtureRequests: requests });
      const originalConnect = chrome.runtime.connect.bind(chrome.runtime);
      Object.assign(chrome.runtime, {
        connect: (options: { name?: string } = {}) => {
          if (options.name !== portName) return originalConnect(options);
          const listeners = new Set<(message: AudioJobServerMessage) => void>();
          const disconnected = new Set<() => void>();
          let closed = false;
          let start: AudioJobStart | undefined;
          const emit = (message: AudioJobServerMessage) => {
            if (!closed) for (const listener of listeners) listener(message);
          };
          const stage = async (message: AudioJobStart) => {
            const body = Uint8Array.from(
              atob(
                message.operation === 'speech' && message.text.includes('overflow')
                  ? longAudio
                  : shortAudio
              ),
              (character) => character.charCodeAt(0)
            );
            const assets = await (
              await navigator.storage.getDirectory()
            ).getDirectoryHandle('sniptale-assets', { create: true });
            const root = await assets.getDirectoryHandle('audio-jobs', { create: true });
            const id = crypto.randomUUID();
            const writer = await (await root.getFileHandle(id, { create: true })).createWritable();
            await writer.write(body);
            await writer.close();
            const metadata = await (
              await root.getFileHandle(`${id}.json`, { create: true })
            ).createWritable();
            await metadata.write(
              JSON.stringify({
                scope: message.scope,
                mimeType: 'audio/wav',
                size: body.length,
                expiresAt: Date.now() + 600_000,
              })
            );
            await metadata.close();
            emit({
              type: 'audio',
              requestId: message.requestId,
              staged: { id, size: body.length, mimeType: 'audio/wav' },
            });
          };
          const execute = async (message: Extract<AudioJobClientMessage, { type: 'execute' }>) => {
            const assets = await (
              await navigator.storage.getDirectory()
            ).getDirectoryHandle('sniptale-assets');
            const root = await assets.getDirectoryHandle('audio-jobs');
            const file = await (await root.getFileHandle(message.staged.id)).getFile();
            const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
            requests.push({
              operation: 'input',
              inputBytes: file.size,
              wav: new TextDecoder().decode(header.slice(0, 4)) === 'RIFF',
            });
            await root.removeEntry(message.staged.id);
            await root.removeEntry(`${message.staged.id}.json`);
            if (!start || start.operation !== 'transcription' || !('nativeStart' in start.scope))
              throw new Error('Missing transcription source scope');
            const duration = start.scope.nativeEnd - start.scope.nativeStart;
            const scale = Math.min(1, duration / (phraseCount === undefined ? 6 : 11));
            const words =
              phraseCount === undefined
                ? [
                    { text: 'First phrase.', start: 0.5, end: 1.5 },
                    { text: 'Middle phrase.', start: 2, end: 4 },
                    { text: 'Last phrase.', start: 4.5, end: 5.5 },
                  ]
                : Array.from({ length: phraseCount }, (_, index) => ({
                    text: `Длинный пример текста для проверки озвучки и размещения фразы ${index + 1}.`,
                    start: (index * 11) / Math.max(1, phraseCount),
                    end: ((index + 0.9) * 11) / Math.max(1, phraseCount),
                  }));
            const bounded = words.map((word) => ({
              ...word,
              start: word.start * scale,
              end: word.end * scale,
            }));
            emit({
              type: 'transcript',
              requestId: message.requestId,
              result: {
                text: bounded.map((word) => word.text).join(' '),
                words: bounded,
              },
            });
          };
          return {
            name: portName,
            onMessage: {
              addListener: (listener: (message: AudioJobServerMessage) => void) =>
                listeners.add(listener),
              removeListener: (listener: (message: AudioJobServerMessage) => void) =>
                listeners.delete(listener),
              hasListener: (listener: (message: AudioJobServerMessage) => void) =>
                listeners.has(listener),
            },
            onDisconnect: {
              addListener: (listener: () => void) => disconnected.add(listener),
              removeListener: (listener: () => void) => disconnected.delete(listener),
              hasListener: (listener: () => void) => disconnected.has(listener),
            },
            disconnect: () => {
              closed = true;
            },
            postMessage: (message: AudioJobClientMessage) => {
              if (message.type === 'cancel') {
                closed = true;
                return;
              }
              if (message.type === 'start') {
                start = message;
                requests.push({
                  operation: message.operation,
                  ...(message.operation === 'speech' ? { text: message.text } : {}),
                });
                if (message.operation === 'transcription')
                  queueMicrotask(() =>
                    emit({
                      type: 'authorized',
                      requestId: message.requestId,
                      scope: message.scope,
                      ticket: crypto.randomUUID(),
                    })
                  );
                else
                  void stage(message).catch(() =>
                    emit({ type: 'failure', requestId: message.requestId, code: 'storage-failed' })
                  );
              } else if (start)
                void execute(message).catch(() =>
                  emit({ type: 'failure', requestId: message.requestId, code: 'storage-failed' })
                );
            },
          };
        },
      });
    },
    {
      portName: AUDIO_JOB_PORT_NAME,
      shortAudio: syntheticSpeechWav(1, 440).toString('base64'),
      longAudio: syntheticSpeechWav(3, 440).toString('base64'),
      phraseCount,
    }
  );
}

async function persistedReviewState(page: Page) {
  const workspace = await readNativeReviewWorkspace(
    page,
    `recording:${betaV1Fixture.records.recordings[0].id}`
  );
  if (!workspace) return null;
  const document = replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewAdvancedContentBaseline(workspace.advanced)
  );
  return { workspace, document };
}

/** Reads the canonical accepted content; proposals must never appear here before Apply. */
export async function persistedReviewContent(page: Page) {
  return (await persistedReviewState(page))?.document.advancedContent ?? null;
}

export async function persistedSpeech(page: Page) {
  const state = await persistedReviewState(page);
  if (!state) return null;
  const { workspace, document } = state;
  const clip = document.advancedContent.audio.voiceover[0];
  if (!clip) return null;
  const map = buildReviewTimeMap(workspace.source.duration, document.edits);
  return {
    clip,
    clips: document.advancedContent.audio.voiceover,
    plan: buildQuickEditAudioPlan({ voiceover: projectReviewVoiceover([clip], map), music: [] }),
  };
}
