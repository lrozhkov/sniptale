// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { useReviewSpeech } from './use-speech';
import type { ReviewSpeechSession } from '../../workflows/video-review/speech-publication';
import { translate } from '../../platform/i18n';
const mocks = vi.hoisted(() => ({ hook: vi.fn() }));
vi.mock('./use-speech', () => ({ useReviewSpeech: mocks.hook }));
vi.mock('./controls', () => ({
  ReviewDetails: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReviewButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  reviewTextButtonClassName: '',
}));
vi.mock('../../features/ai/model-selector', () => ({
  AIModelSelector: (props: {
    models: Array<{ id: string; displayName: string }>;
    selectedModelId: string | null;
    onSelect(id: string | null): void;
  }) => (
    <select
      value={props.selectedModelId ?? ''}
      onChange={(event) => props.onSelect(event.target.value || null)}
    >
      {props.models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.displayName}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductSelect: (props: {
    'aria-label'?: string;
    options: Array<{ value: string; label: string }>;
    value: string;
    onChange(value: string): void;
  }) => (
    <select
      aria-label={props['aria-label']}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('@sniptale/ui/product-feedback/confirm-dialog', () => ({
  ProductConfirmDialog: (props: { onConfirm(): void; onCancel(): void }) => (
    <div role="dialog">
      <button onClick={props.onConfirm}>confirm</button>
      <button onClick={props.onCancel}>cancel discard</button>
    </div>
  ),
}));
import { ReviewSpeechPanel } from './speech-panel';
let root: Root;
let host: HTMLDivElement;
function fixture(): ReturnType<typeof useReviewSpeech> {
  const profile = { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' as const };
  const phrase = {
    id: 'phrase',
    start: 0,
    end: 2,
    text: 'Text',
    originalText: 'Text',
    revision: 0,
    alignment: 'range' as const,
  };
  return {
    target: { kind: 'voiceover', clipId: 'clip' },
    resultInterval: (start, end) => ({ start, end }),
    recognitionDuration: 4,
    selectionDuration: 2,
    originalVolume: 0,
    setOriginalVolume: vi.fn(),
    selection: undefined,
    sourceAudioAvailable: undefined,
    patchReplacement: vi.fn(),
    transcript: { version: 1, phrases: [phrase], replacements: [] },
    profile,
    modelId: 'stt',
    catalogs: null,
    error: null,
    running: false,
    saving: false,
    originalUrl: null,
    previews: [
      {
        replacement: {
          ...phrase,
          id: 'replacement',
          phraseId: 'phrase',
          assetId: '',
          duration: 3,
          profile,
          textSignature: '',
        },
        blob: new Blob(),
        url: 'blob:preview',
        scope: {
          workspaceId: 'workspace',
          workspaceRevision: 1,
          target: { kind: 'voiceover' as const, clipId: 'clip' },
          assetId: 'original',
          nativeStart: 0,
          nativeEnd: 2,
        },
        staged: { id: 'preview', mimeType: 'audio/wav', size: 1 },
        geometry: 'geometry',
        createdAt: 0,
        expiresAt: Date.now() + 60000,
      },
    ],
    dirty: false,
    retrySave: vi.fn(),
    discardDraft: vi.fn(),
    reloadModels: vi.fn(),
    setModelId: vi.fn(),
    changeProfile: vi.fn(),
    recognize: vi.fn(),
    generate: vi.fn(),
    apply: vi.fn(),
    cancel: vi.fn(),
    editPhrase: vi.fn(),
    split: vi.fn(),
    merge: vi.fn(),
    restore: vi.fn(),
    isChanged: () => false,
  };
}
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
function render(state: ReturnType<typeof useReviewSpeech>) {
  mocks.hook.mockReturnValue(state);
  act(() =>
    root.render(
      <ReviewSpeechPanel
        session={{} as ReviewSpeechSession}
        target={state.target}
        selection={state.selection}
        sourceAudioAvailable={state.sourceAudioAvailable}
        beforeAction={(action) => action()}
        flushAdvanced={async () => undefined}
        registerSpeechFlush={() => () => undefined}
        tempo={1.5}
      />
    )
  );
}
it('keeps overflow preview listenable and disables Apply', () => {
  render(fixture());
  expect(host.querySelector('textarea')?.getAttribute('aria-label')).toBe(
    translate('gallery.videoReview.speechInstructions')
  );
  expect(host.querySelector('[data-speech-phrase-id] textarea')?.getAttribute('aria-label')).toBe(
    translate('gallery.videoReview.speechText')
  );
  expect(
    Array.from(host.querySelectorAll('input'))
      .filter((input) => input.type !== 'checkbox')
      .every((input) => Boolean(input.getAttribute('aria-label')))
  ).toBe(true);
  expect(host.textContent).toContain(translate('gallery.videoReview.speechOverflow'));
  const apply = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === translate('gallery.videoReview.speechApply')
  );
  expect(apply?.disabled).toBe(true);
  expect(
    host.querySelector('[data-ui="gallery.videoReview.speechPreview"] audio')?.getAttribute('src')
  ).toBe('blob:preview');
});
it('exposes cancellation during a running request and retry for failed retained edits', () => {
  const state = fixture();
  state.running = true;
  state.error = 'failed';
  state.dirty = true;
  render(state);
  const cancel = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === translate('common.actions.cancel')
  );
  act(() => cancel?.click());
  expect(state.cancel).toHaveBeenCalledOnce();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    translate('gallery.videoReview.speechFailed')
  );
  expect(host.textContent).toContain(translate('gallery.videoReview.speechRetrySave'));
});

function withCatalog(state: ReturnType<typeof useReviewSpeech>) {
  const base = {
    chromeAiEnabled: false,
    globalSystemPrompt: '',
    providers: [],
    defaultModelId: 'model',
  };
  state.catalogs = {
    speech: {
      ...base,
      models: [
        {
          id: 'model',
          providerId: 'p',
          displayName: 'Speech',
          modelCode: 'tts',
          operation: 'speech',
          audio: { speech: { voiceId: 'catalog', responseFormat: 'mp3' } },
        },
      ],
    },
    transcription: {
      ...base,
      defaultModelId: 'stt',
      models: [
        {
          id: 'stt',
          providerId: 'p',
          displayName: 'Transcribe',
          modelCode: 'stt',
          operation: 'transcription',
          audio: { transcription: { responseFormat: 'json', timestampGranularity: 'none' } },
        },
      ],
    },
  };
  return state;
}
function button(key: Parameters<typeof translate>[0]) {
  return Array.from(host.querySelectorAll('button')).find(
    (item) => item.textContent === translate(key)
  );
}
function input(key: Parameters<typeof translate>[0], value: string) {
  const element = Array.from(
    host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')
  ).find((item) => item.getAttribute('aria-label') === translate(key));
  if (!element) throw new Error(`Missing field ${key}`);
  act(() => {
    Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value'
    )?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return element;
}
it('edits range-aligned phrase text and native times, splits at explicit time and merges adjacent phrases', () => {
  const state = withCatalog(fixture());
  const phrase = state.transcript.phrases[0]!;
  phrase.text = 'Hello world';
  state.transcript.phrases.push({ ...phrase, id: 'second', start: 2, end: 4 });
  state.previews = [];
  render(state);
  const textarea = input('gallery.videoReview.speechText', 'Updated text');
  expect(state.editPhrase).toHaveBeenCalledWith('phrase', { text: 'Updated text' });
  const start = input('gallery.videoReview.speechStart', '0.25');
  act(() => start.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(state.editPhrase).toHaveBeenCalledWith('phrase', { start: 0.25 });
  input('gallery.videoReview.speechSplitTime', '1.25');
  (textarea as HTMLTextAreaElement).selectionStart = 5;
  act(() => button('gallery.videoReview.speechSplit')?.click());
  expect(state.split).toHaveBeenCalledWith('phrase', 5, 1.25);
  act(() => button('gallery.videoReview.speechMerge')?.click());
  expect(state.merge).toHaveBeenCalledWith('phrase', 'second');
});
it('generates selected and changed phrases, applies fit previews and restores the original', () => {
  const state = withCatalog(fixture());
  state.previews[0]!.replacement.duration = 1;
  state.transcript.replacements = [state.previews[0]!.replacement];
  state.isChanged = () => true;
  render(state);
  act(() => host.querySelector<HTMLInputElement>('input[type=checkbox]')?.click());
  act(() => button('gallery.videoReview.speechGenerateSelected')?.click());
  expect(state.generate).toHaveBeenCalledWith(['phrase']);
  act(() => button('gallery.videoReview.speechGenerateChanged')?.click());
  expect(state.generate).toHaveBeenCalledTimes(2);
  act(() => button('gallery.videoReview.speechApplySelected')?.click());
  expect(state.apply).toHaveBeenCalledWith(state.previews);
  act(() => button('gallery.videoReview.speechApply')?.click());
  expect(state.apply).toHaveBeenCalledTimes(2);
  act(() => button('gallery.videoReview.speechGenerate')?.click());
  expect(state.generate).toHaveBeenCalledTimes(3);
  act(() => button('gallery.videoReview.speechRestore')?.click());
  expect(state.restore).toHaveBeenCalledWith(['replacement']);
  act(() => host.querySelector<HTMLInputElement>('input[type=checkbox]')?.click());
  expect(button('gallery.videoReview.speechGenerateSelected')?.disabled).toBe(true);
});
it('changes voice, speed, format and delivery defaults without starting a paid request', () => {
  const state = withCatalog(fixture());
  render(state);
  input('gallery.videoReview.speechVoice', 'new voice');
  input('gallery.videoReview.speechSpeed', '1.25');
  input('gallery.videoReview.speechInstructions', 'Quietly');
  expect(state.changeProfile).toHaveBeenCalledWith({ ...state.profile, voiceId: 'new voice' });
  expect(state.changeProfile).toHaveBeenCalledWith({ ...state.profile, speed: 1.25 });
  expect(state.changeProfile).toHaveBeenCalledWith({ ...state.profile, instructions: 'Quietly' });
  input('gallery.videoReview.speechSpeed', '');
  input('gallery.videoReview.speechInstructions', '');
  const format = Array.from(host.querySelectorAll('select')).find(
    (item) => item.getAttribute('aria-label') === translate('gallery.videoReview.speechFormat')
  )!;
  act(() => {
    format.value = 'mp3';
    format.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(state.changeProfile).toHaveBeenCalledWith({ ...state.profile, responseFormat: 'mp3' });
  const selectors = host.querySelectorAll('select');
  act(() => selectors[0]?.dispatchEvent(new Event('change', { bubbles: true })));
  expect(state.setModelId).toHaveBeenCalledWith('stt');
  act(() => selectors[1]?.dispatchEvent(new Event('change', { bubbles: true })));
  expect(state.changeProfile).toHaveBeenCalledWith({
    modelId: 'model',
    voiceId: 'catalog',
    responseFormat: 'mp3',
  });
  expect(state.generate).not.toHaveBeenCalled();
});
it('plays native source bounds at clip tempo and keeps generated audition separate', () => {
  const state = fixture();
  state.originalUrl = 'blob:original';
  render(state);
  const original = host.querySelector<HTMLAudioElement>('audio')!;
  const pause = vi.spyOn(original, 'pause').mockImplementation(() => undefined);
  original.currentTime = 3;
  act(() => original.dispatchEvent(new Event('play', { bubbles: true })));
  expect(original.currentTime).toBe(0);
  expect(original.playbackRate).toBe(1.5);
  original.currentTime = 2;
  act(() => original.dispatchEvent(new Event('timeupdate', { bubbles: true })));
  expect(pause).toHaveBeenCalledOnce();
  const generated = host.querySelector<HTMLAudioElement>(
    '[data-ui="gallery.videoReview.speechPreview"] audio'
  )!;
  act(() => generated.dispatchEvent(new Event('play', { bubbles: true })));
  expect(generated.playbackRate).toBe(1.5);
});
it.each([
  'invalid',
  'interrupted',
  'canceled',
  'duration',
  'partial-replacement',
  'stale',
  'failed',
] as const)('shows fixed %s feedback and preserves explicit retry/discard', (error) => {
  const state = fixture();
  state.error = error;
  state.dirty = true;
  render(state);
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  act(() => button('gallery.videoReview.speechRetrySave')?.click());
  expect(state.retrySave).toHaveBeenCalledOnce();
  act(() => button('gallery.videoReview.speechDiscardDraft')?.click());
  act(() =>
    Array.from(host.querySelectorAll('[role=dialog] button'))
      .find((item) => item.textContent === 'confirm')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  );
  expect(state.discardDraft).toHaveBeenCalledOnce();
});
it('offers recognition and model refresh for an empty transcript and names an unavailable saved model', () => {
  const state = withCatalog(fixture());
  state.transcript.phrases = [];
  state.previews = [];
  state.profile = { ...state.profile!, modelId: 'missing' };
  render(state);
  expect(host.textContent).toContain(translate('gallery.videoReview.speechMissingModel'));
  expect(host.textContent).toContain(translate('gallery.videoReview.speechEmpty'));
  act(() => button('gallery.videoReview.speechRecognize')?.click());
  expect(state.recognize).toHaveBeenCalledOnce();
  act(() => button('gallery.videoReview.speechReloadModels')?.click());
  expect(state.reloadModels).toHaveBeenCalledOnce();
});

it.each([
  ['provider-auth', 'gallery.videoReview.speechProviderAuth'],
  ['provider-rate-limit', 'gallery.videoReview.speechProviderRateLimit'],
  ['provider-request', 'gallery.videoReview.speechProviderRequest'],
  ['provider-not-found', 'gallery.videoReview.speechProviderNotFound'],
  ['provider-failed', 'gallery.videoReview.speechProviderFailed'],
  ['network-failed', 'gallery.videoReview.speechNetworkFailed'],
  ['permission-denied', 'gallery.videoReview.speechPermissionDenied'],
  ['model-unavailable', 'gallery.videoReview.speechModelUnavailable'],
  ['secret-unavailable', 'gallery.videoReview.speechSecretUnavailable'],
  ['invalid-response', 'gallery.videoReview.speechInvalidResponse'],
  ['storage-failed', 'gallery.videoReview.speechStorageFailed'],
  ['decode-failed', 'gallery.videoReview.speechDecodeFailed'],
  ['unauthorized', 'gallery.videoReview.speechUnauthorized'],
  ['invalid-request', 'gallery.videoReview.speechInvalidRequest'],
  ['too-large', 'gallery.videoReview.speechTooLarge'],
] as const)('renders an actionable safe message for %s', (code, key) => {
  const state = fixture();
  state.error = code;
  render(state);
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(translate(key));
});

it('shows original selection recognition and addresses accepted controls by replacement identity', () => {
  const state = fixture();
  state.target = { kind: 'original' };
  state.selection = { start: 1, end: 2 };
  state.catalogs = {
    transcription: {
      models: [{ id: 'stt', displayName: 'STT', providerId: 'provider', modelCode: 'stt' }],
      providers: [],
      defaultModelId: 'stt',
      chromeAiEnabled: false,
      globalSystemPrompt: '',
    },
    speech: {
      models: [],
      providers: [],
      defaultModelId: null,
      chromeAiEnabled: false,
      globalSystemPrompt: '',
    },
  };
  state.transcript.replacements = [
    { ...state.previews[0]!.replacement, id: 'accepted-independent', phraseId: 'removed-draft' },
  ];
  render(state);
  const selected = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === translate('gallery.videoReview.speechRecognizeSelection')
  )!;
  expect(selected.disabled).toBe(false);
  act(() => selected.click());
  expect(state.recognize).toHaveBeenCalledWith(true);
  const accepted = host.querySelector('[data-speech-replacement-id="accepted-independent"]')!;
  const restore = Array.from(accepted.querySelectorAll('button')).find(
    (button) => button.textContent === translate('gallery.videoReview.speechRestorePhrase')
  )!;
  act(() => restore.click());
  expect(state.restore).toHaveBeenCalledWith(['accepted-independent']);
  const toggle = accepted.querySelector('button')!;
  act(() => toggle.click());
  expect(state.patchReplacement).toHaveBeenCalledWith('accepted-independent', { enabled: true });
});
it('keeps recognition unavailable when original has no audio', () => {
  const state = fixture();
  state.target = { kind: 'original' };
  state.sourceAudioAvailable = false;
  render(state);
  expect(host.textContent).toContain(translate('gallery.videoReview.speechNoSourceAudio'));
  const recognize = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === translate('gallery.videoReview.speechRecognizeAll')
  )!;
  expect(recognize.disabled).toBe(true);
});
