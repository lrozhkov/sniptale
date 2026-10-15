// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SpeechBatchWorkspace, type SpeechBatchWorkspaceProps } from './speech-batch';
import { reviewSpeechQueueKey } from '../../workflows/video-review/speech-queue';
import type { ReviewSpeechPreview } from '../../workflows/video-review/speech-publication';
import { reviewSpeechTextSignature } from '../../features/video/review/speech-transcript';
import { translate } from '../../platform/i18n';

let root: Root;
let host: HTMLDivElement;
const profile = { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' as const };
function fixture(): SpeechBatchWorkspaceProps['speech'] {
  return {
    target: { kind: 'voiceover', clipId: 'a' },
    groups: ['a', 'b'].map((clipId) => ({
      target: { kind: 'voiceover', clipId },
      assetId: clipId,
      transcript: {
        version: 1,
        profile,
        replacements: [],
        phrases: [
          {
            id: 'same',
            start: 0,
            end: 2,
            text: `Text ${clipId}`,
            originalText: `Text ${clipId}`,
            revision: 0,
            alignment: 'range',
          },
        ],
      },
    })),
    allPreviews: [],
    profile,
    catalogs: {
      speech: {
        models: [{ id: 'model', providerId: 'provider', modelCode: 'tts', displayName: 'Speech' }],
        providers: [],
        defaultModelId: 'model',
        chromeAiEnabled: false,
        globalSystemPrompt: '',
      },
      transcription: {
        models: [],
        providers: [],
        defaultModelId: null,
        chromeAiEnabled: false,
        globalSystemPrompt: '',
      },
    },
    running: false,
    saving: false,
    dirty: false,
    generateQueue: vi.fn(),
    apply: vi.fn(),
  };
}
function preview(speech: SpeechBatchWorkspaceProps['speech'], index: number): ReviewSpeechPreview {
  const group = speech.groups[index]!;
  const phrase = group.transcript.phrases[0]!;
  return {
    blob: new Blob(),
    url: `blob:${index}`,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60000,
    scope: {
      workspaceId: 'workspace',
      workspaceRevision: 1,
      target: group.target,
      assetId: group.assetId,
      nativeStart: 0,
      nativeEnd: 2,
    },
    staged: { id: `take-${index}`, mimeType: 'audio/wav', size: 1 },
    geometry: 'geometry',
    replacement: {
      ...phrase,
      id: `take-${index}`,
      phraseId: phrase.id,
      assetId: `generated-${index}`,
      duration: 1,
      profile,
      textSignature: reviewSpeechTextSignature(phrase.text, profile),
    },
  };
}
function Harness({ speech }: { speech: SpeechBatchWorkspaceProps['speech'] }) {
  const [selected, select] = useState<string[]>([]);
  return (
    <SpeechBatchWorkspace
      speech={speech}
      selected={selected}
      onSelect={select}
      assetNames={
        new Map([
          ['a', { filename: 'A.wav' }],
          ['b', { filename: 'B.wav' }],
        ])
      }
    />
  );
}
function control(name: string) {
  const node = Array.from(
    host.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button')
  ).find((entry) => entry.getAttribute('aria-label') === name);
  if (!node) throw new Error(`Missing control: ${name}`);
  return node;
}
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

it('selects target/phrase identities independently of folding and never includes an unselected clip', () => {
  const speech = fixture();
  act(() => root.render(<Harness speech={speech} />));
  act(() =>
    control(
      translate('gallery.videoReview.speechBatchSelectClip').replace('{name}', 'A.wav')
    ).click()
  );
  const group = Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')).find(
    (node) => node.title === 'A.wav'
  )!;
  act(() => group.click());
  expect(group.getAttribute('aria-expanded')).toBe('false');
  act(() => control(translate('gallery.videoReview.speechGenerateSelected')).click());
  expect(speech.generateQueue).toHaveBeenCalledExactlyOnceWith([
    { target: { kind: 'voiceover', clipId: 'a' }, phraseId: 'same' },
  ]);
  expect(host.textContent).toContain(
    translate('gallery.videoReview.speechBatchSelected').replace('{count}', '1')
  );
});

it('applies ready partial results without requiring an unfinished selected item', () => {
  const speech = fixture();
  speech.allPreviews = [preview(speech, 0)];
  act(() => root.render(<Harness speech={speech} />));
  act(() => control(translate('gallery.videoReview.speechSelectAll')).click());
  const apply = control(translate('gallery.videoReview.speechApplySelected'));
  expect(apply.disabled).toBe(false);
  act(() => apply.click());
  expect(speech.apply).toHaveBeenCalledExactlyOnceWith(speech.allPreviews);
  expect(host.textContent).toContain(
    translate('gallery.videoReview.speechBatchReady').replace('{count}', '1')
  );
});

it('keeps one audition mounted while switching between ready results with colliding phrase ids', () => {
  const speech = fixture();
  speech.allPreviews = [preview(speech, 0), preview(speech, 1)];
  act(() => root.render(<Harness speech={speech} />));
  for (let index = 0; index < 2; index++) {
    const group = speech.groups[index]!;
    const key = reviewSpeechQueueKey({ target: group.target, phraseId: 'same' });
    const row = Array.from(host.querySelectorAll<HTMLElement>('[data-speech-batch-key]')).find(
      (node) => node.dataset['speechBatchKey'] === key
    )!;
    act(() => row.querySelector('button')!.click());
    expect(host.querySelectorAll('audio')).toHaveLength(1);
    expect(host.querySelector('audio')?.getAttribute('src')).toBe(`blob:${index}`);
  }
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});

it('disables selection and generation while a frozen queue is running', () => {
  const speech = fixture();
  speech.running = true;
  act(() => root.render(<Harness speech={speech} />));
  expect(
    Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')).every(
      (node) => node.disabled
    )
  ).toBe(true);
  expect(control(translate('gallery.videoReview.speechGenerateSelected')).disabled).toBe(true);
});
