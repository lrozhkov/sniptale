// @vitest-environment jsdom
import { act, useEffect, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewTextVoiceForm } from './text-voice-panel';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
import {
  addReviewTextFragment,
  createReviewTextDocument,
} from '../../features/video/review/text-document';
import type { ReviewTextVoicePreview } from '../../workflows/video-review/text-voice';
import type { SpeechProfileFields } from './speech-profile';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  apply: vi.fn(),
  batch: vi.fn(),
  pendingPublication: false,
  cleanup: vi.fn(),
  reload: vi.fn(),
  failCatalog: false,
  job: vi.fn(),
  staging: vi.fn(),
  discard: vi.fn(),
  decode: vi.fn(),
}));
vi.mock('../../workflows/video-review/speech-client', () => ({ runReviewSpeechJob: mocks.job }));
vi.mock('../../workflows/video-review/speech-audio', () => ({
  decodeReviewSpeechDuration: mocks.decode,
}));
vi.mock('../../composition/persistence/assets/audio-staging', () => ({
  readAudioStaging: mocks.staging,
  discardAudioStaging: mocks.discard,
}));
vi.mock('../../workflows/video-review/text-voice', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/text-voice')>()),
  generateReviewTextVoice: mocks.generate,
  applyReviewTextVoice: mocks.apply,
  applyReviewTextVoiceBatch: mocks.batch,
  cleanupReviewTextVoicePreview: mocks.cleanup,
}));
vi.mock('../../workflows/video-review/text-take-batch', async (original) => ({
  ...(await original<typeof import('../../workflows/video-review/text-take-batch')>()),
  reviewTextTakeBatchPending: () => mocks.pendingPublication,
}));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) =>
    key === 'gallery.videoReview.textVoiceWaiting'
      ? 'elapsed {seconds}'
      : key === 'gallery.videoReview.speechConsentText'
        ? 'Send phrase text and voice parameters to {provider}'
        : key,
}));
vi.mock('./use-speech', () => ({
  useReviewSpeechCatalog: (_setModel: unknown, onError: () => void) => {
    useEffect(() => {
      if (mocks.failCatalog) onError();
    }, [onError]);
    return {
      catalogs: mocks.failCatalog
        ? null
        : {
            transcription: { models: [], providers: [], defaultModelId: null },
            speech: {
              defaultModelId: 'model1',
              providers: [
                { id: 'provider1', name: 'Provider One' },
                { id: 'provider2', name: 'Provider Two' },
              ],
              models: ['1', '2'].map((id) => ({
                id: `model${id}`,
                providerId: `provider${id}`,
                displayName: `Model ${id}`,
                audio: { speech: { voiceId: 'voice', responseFormat: 'mp3' } },
              })),
            },
          },
      reloadModels: mocks.reload,
    };
  },
}));
vi.mock('./speech-profile', () => ({
  SpeechProfileFields: ({ speech }: ComponentProps<typeof SpeechProfileFields>) => (
    <div>
      {(['mp3', 'wav', 'pcm'] as const).map((responseFormat) => (
        <button
          key={responseFormat}
          onClick={() => {
            if (speech.profile) speech.changeProfile({ ...speech.profile, responseFormat });
          }}
        >
          {responseFormat}
        </button>
      ))}
      <button
        onClick={() => {
          if (speech.profile) speech.changeProfile({ ...speech.profile, modelId: 'model2' });
        }}
      >
        Provider Two
      </button>
      <input
        aria-label="instructions"
        value={speech.profile?.instructions ?? ''}
        onChange={(event) => {
          if (speech.profile)
            speech.changeProfile({ ...speech.profile, instructions: event.target.value });
        }}
      />
    </div>
  ),
}));
let host: HTMLDivElement;
let root: Root;

function preview(id: string): ReviewTextVoicePreview {
  return {
    clipId: `clip-${id}`,
    scope: {
      workspaceId: 'video',
      workspaceRevision: 1,
      target: { kind: 'text', fragmentId: id },
      textRevision: 0,
      timingRevision: 0,
      start: 1,
      end: 2,
      timeDomain: 'result',
    },
    textSnapshot: {
      kind: 'ai',
      textId: id,
      revision: 0,
      timingRevision: 0,
      text: `Script ${id}`,
      start: 1,
      end: 2,
      timeDomain: 'result',
      profile: { modelId: 'model1', voiceId: 'voice', responseFormat: 'mp3' },
    },
    geometry: 'geometry',
    duration: 1,
    resultStart: 1,
    blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    url: `blob:${id}`,
    staged: { id: 'staged', mimeType: 'audio/mpeg', size: 5 },
    expiresAt: Date.now() + 600000,
  };
}
async function render(
  ids = ['first'],
  deps?: Parameters<typeof createVideoReviewSession>[1],
  sourceAudioAvailable?: () => boolean
) {
  const advanced = createQuickEditAdvancedState();
  let text = createReviewTextDocument();
  for (const id of ids) {
    const added = addReviewTextFragment(text, {
      id,
      text: `Script ${id}`,
      start: 1,
      end: 2,
      timeDomain: 'result',
    });
    if (!added.ok) throw new Error('fixture');
    text = added.document;
  }
  advanced.text = text;
  const session = createVideoReviewSession(
    {
      workspace: {
        aggregateId: 'video',
        sourceAssetId: 'source',
        formatVersion: 1,
        revision: 1,
        source: { duration: 10, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
        advanced,
        history: [],
        cursor: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      draft: null,
    },
    deps
  );
  session.setAutosaveEnabled(false);
  const beforeRequest = vi.fn(async () => undefined);
  const props = {
    access: { session, beforeRequest, ...(sourceAudioAvailable ? { sourceAudioAvailable } : {}) },
    ids,
    onClose: vi.fn(),
  };
  await act(async () => root.render(<ReviewTextVoiceForm {...props} />));
  return { session, beforeRequest, props };
}
async function click(label: string) {
  const button = Array.from(
    host.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input[type=checkbox]')
  ).find(
    (element) => element.getAttribute('aria-label') === label || element.textContent === label
  );
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => button.click());
}
const start = () => click('gallery.videoReview.textVoiceSaveStart');
const approve = () => click('gallery.videoReview.speechConsentContinue');
beforeEach(() => {
  vi.resetAllMocks();
  mocks.failCatalog = false;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  mocks.generate.mockImplementation(async (_session, id: string) => preview(id));
  mocks.apply.mockResolvedValue(undefined);
  mocks.batch.mockResolvedValue(undefined);
  mocks.pendingPublication = false;
  mocks.cleanup.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('opens without Save or provider request, discloses the whole buffer, and declines without egress', async () => {
  const { beforeRequest, session } = await render();
  expect(host.textContent).toContain('gallery.videoReview.textVoiceSaveDisclosure');
  expect(mocks.generate).not.toHaveBeenCalled();
  await start();
  expect(host.textContent).toContain('Provider One');
  expect(host.textContent).toContain('gallery.videoReview.textVoiceNoPrompt');
  await click('common.actions.cancel');
  expect(beforeRequest).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(session.getSnapshot().autosaveEnabled).toBe(false);
});

it('generates after consent and preparation, keeps a preview, and only applies on acceptance', async () => {
  const { beforeRequest } = await render();
  await start();
  await approve();
  expect(beforeRequest).toHaveBeenCalledOnce();
  expect(mocks.generate).toHaveBeenCalledWith(
    expect.anything(),
    'first',
    expect.objectContaining({ modelId: 'model1' }),
    expect.any(AbortSignal),
    'provider1',
    expect.objectContaining({ fragment: expect.objectContaining({ id: 'first' }) })
  );
  expect(host.querySelector('audio')?.getAttribute('src')).toBe('blob:first');
  expect(mocks.apply).not.toHaveBeenCalled();
  await click('gallery.videoReview.speechApply');
  expect(mocks.apply).toHaveBeenCalledOnce();
  expect(mocks.apply.mock.calls[0]?.[3]).toMatchObject({ muteSource: false });
  expect(host.textContent).toContain('gallery.videoReview.textVoiceAccepted');
});

it.each([
  ['pcm', 'wav'],
  ['wav', 'pcm'],
] as const)(
  'invalidates an unaccepted %s preview on %s selection without automatic generation',
  async (from, to) => {
    mocks.generate.mockImplementation(async (_session, id, profile) => ({
      ...preview(id),
      textSnapshot: { ...preview(id).textSnapshot, profile },
    }));
    await render();
    await click(from);
    await start();
    await approve();
    await click(from);
    expect(host.querySelectorAll('audio')).toHaveLength(1);
    expect(mocks.cleanup).not.toHaveBeenCalled();
    await click(to);
    expect(host.querySelectorAll('audio')).toHaveLength(0);
    expect(host.querySelector('[aria-label="gallery.videoReview.speechApply"]')).toBeNull();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.generate).toHaveBeenCalledOnce();
    await start();
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[1]?.[2].responseFormat).toBe(to);
  }
);

it('preserves an accepted PCM neighbor while discarding only a pending batch take', async () => {
  mocks.generate.mockImplementation(async (_session, id, profile) => ({
    ...preview(id),
    textSnapshot: { ...preview(id).textSnapshot, profile },
  }));
  await render(['first', 'second']);
  await click('pcm');
  await start();
  await approve();
  await click('gallery.videoReview.speechApply');
  await click('wav');
  expect(host.querySelectorAll('audio')).toHaveLength(1);
  expect(host.querySelector('audio')?.getAttribute('src')).toBe('blob:first');
  expect(mocks.cleanup).toHaveBeenCalledOnce();
  expect(mocks.cleanup.mock.calls[0]?.[1].clipId).toBe('clip-second');
  expect(mocks.apply.mock.calls[0]?.[1].textSnapshot.profile.responseFormat).toBe('pcm');
  await start();
  expect(mocks.generate).toHaveBeenCalledTimes(3);
  expect(mocks.generate.mock.calls[2]?.[1]).toBe('second');
});

it('keeps source attenuation off and unavailable for silent/unknown media, and captures it only at Apply', async () => {
  const mutedLabel = 'gallery.videoReview.textVoiceMuteSource';
  await render();
  expect(
    host.querySelector<HTMLButtonElement>(`button[role=switch][aria-label="${mutedLabel}"]`)
      ?.disabled
  ).toBe(true);
  expect(host.textContent).toContain('gallery.videoReview.textVoiceMuteUnavailable');
  const { beforeRequest } = await render(['first'], undefined, () => true);
  const toggle = host.querySelector<HTMLButtonElement>(
    `button[role=switch][aria-label="${mutedLabel}"]`
  )!;
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  await click(mutedLabel);
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  expect(beforeRequest).not.toHaveBeenCalled();
  expect(mocks.apply).not.toHaveBeenCalled();
  await start();
  await approve();
  expect(mocks.apply).not.toHaveBeenCalled();
  await click('gallery.videoReview.speechApply');
  expect(mocks.apply.mock.calls[0]?.[3]).toMatchObject({ muteSource: true });
});

it('aborts a two-phrase command after a failed real buffer Save and requests only after explicit retry', async () => {
  const actual = await vi.importActual<typeof import('../../workflows/video-review/text-voice')>(
    '../../workflows/video-review/text-voice'
  );
  mocks.generate.mockImplementation(actual.generateReviewTextVoice);
  const save =
    vi.fn<
      NonNullable<Parameters<typeof createVideoReviewSession>[1]>['saveVideoWorkspaceSnapshot']
    >();
  save.mockRejectedValueOnce(new Error('storage')).mockImplementation(async (args) => {
    const workspace = parseVideoWorkspace(args.workspace);
    if (!workspace) throw new Error('invalid');
    return {
      workspace: { ...workspace, revision: args.expectedRevision + 1 },
      draft:
        args.draft == null ? null : parseVideoWorkspaceDraft(args.draft, workspace.source.duration),
    };
  });
  const { session } = await render(['first', 'second'], {
    saveVideoWorkspaceSnapshot: save,
    commitVideoWorkspace: vi.fn(),
    readVideoWorkspace: vi.fn(),
    saveVideoWorkspaceDraft: vi.fn(),
    saveVideoWorkspaceAdvanced: vi.fn(),
    moveVideoWorkspaceHistory: vi.fn(),
  });
  await session.saveDraft(
    { id: 'draft', text: 'Unsaved', anchor: { kind: 'point', time: 0 } },
    null
  );
  mocks.job.mockResolvedValue({
    type: 'audio',
    staged: { id: 'staged', mimeType: 'audio/mpeg', size: 5 },
  });
  mocks.staging.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }));
  mocks.decode.mockResolvedValue(1);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:preview');
      static revokeObjectURL = vi.fn();
    }
  );
  await start();
  await approve();
  expect(save).toHaveBeenCalledOnce();
  expect(mocks.job).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toMatchObject({
    dirty: true,
    autosaveEnabled: false,
    error: 'storage',
  });
  await start();
  expect(save).toHaveBeenCalledTimes(2);
  expect(mocks.job).toHaveBeenCalledTimes(2);
  expect(session.getSnapshot()).toMatchObject({
    dirty: false,
    autosaveEnabled: false,
    error: null,
  });
});

it('requires a new provider consent and preserves parameters after a failed attempt', async () => {
  mocks.generate.mockRejectedValueOnce(new Error('provider-failed'));
  await render();
  await start();
  await approve();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await click('Provider Two');
  await start();
  expect(host.textContent).toContain('Provider Two');
  expect(mocks.generate).toHaveBeenCalledOnce();
  await approve();
  expect(mocks.generate).toHaveBeenLastCalledWith(
    expect.anything(),
    'first',
    expect.objectContaining({ modelId: 'model2' }),
    expect.any(AbortSignal),
    'provider2',
    expect.objectContaining({ fragment: expect.objectContaining({ id: 'first' }) })
  );
});

it('preparation failure has zero remote calls and retains the form for explicit retry', async () => {
  const { beforeRequest } = await render();
  beforeRequest.mockRejectedValueOnce(new Error('storage'));
  await start();
  await approve();
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await start();
  expect(mocks.generate).toHaveBeenCalledOnce();
});

it('keeps successful batch results and retries only failed phrases through an explicit action', async () => {
  mocks.generate.mockImplementation(async (_session, id: string) => {
    if (id === 'second') throw new Error('provider-failed');
    return preview(id);
  });
  await render(['first', 'second']);
  await start();
  await approve();
  expect(host.querySelectorAll('audio')).toHaveLength(1);
  expect(mocks.generate).toHaveBeenCalledTimes(2);
  mocks.generate.mockImplementation(async (_session, id: string) => preview(id));
  await start();
  expect(mocks.generate).toHaveBeenCalledTimes(3);
  expect(mocks.generate.mock.calls[2]?.[1]).toBe('second');
  await click('gallery.videoReview.speechApplySelected');
  expect(mocks.batch).toHaveBeenCalledOnce();
  expect(
    mocks.batch.mock.calls[0]?.[1].map((entry: ReviewTextVoicePreview) => entry.clipId)
  ).toEqual(['clip-first', 'clip-second']);
});

it('shows real elapsed time and cancels without accepting a late response', async () => {
  vi.useFakeTimers();
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  let complete!: (value: ReviewTextVoicePreview) => void;
  mocks.generate.mockImplementation(
    () =>
      new Promise<ReviewTextVoicePreview>((resolve) => {
        complete = resolve;
      })
  );
  await render();
  await start();
  await approve();
  now = 4200;
  await act(async () => vi.advanceTimersByTime(250));
  expect(host.textContent).toContain('elapsed 4');
  const requestSignal: AbortSignal = mocks.generate.mock.calls[0]![3];
  await click('common.actions.cancel');
  expect(requestSignal.aborted).toBe(true);
  await act(async () => complete(preview('first')));
  expect(host.querySelectorAll('audio')).toHaveLength(0);
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.cleanup).toHaveBeenCalledOnce();
});

it('respects the inspector disabled state before any Save or egress', async () => {
  const { props, beforeRequest } = await render();
  await act(async () => root.render(<ReviewTextVoiceForm {...props} disabled />));
  await start();
  expect(host.querySelector('fieldset')?.disabled).toBe(true);
  expect(beforeRequest).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});

it('retains a refused batch and retries its complete Apply without generation or partial accepted items', async () => {
  mocks.pendingPublication = true;
  mocks.batch.mockRejectedValueOnce(new Error('stale'));
  await render(['first', 'second']);
  await start();
  await approve();
  await click('gallery.videoReview.speechApplySelected');
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.videoReview.speechChanged'
  );
  expect(host.querySelectorAll('audio')).toHaveLength(2);
  expect(mocks.batch).toHaveBeenCalledOnce();
  expect(host.textContent?.match(/gallery.videoReview.textVoiceAccepted/g)).toBeNull();
  expect(host.querySelector('fieldset')?.disabled).toBe(true);
  expect(
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .filter((button) => button.textContent === 'gallery.videoReview.speechApply')
      .every((button) => button.disabled)
  ).toBe(true);
  await click('gallery.videoReview.speechApplySelected');
  expect(mocks.batch).toHaveBeenCalledTimes(2);
  expect(
    mocks.batch.mock.calls[1]?.[1].map((entry: ReviewTextVoicePreview) => entry.clipId)
  ).toEqual(['clip-first', 'clip-second']);
  expect(mocks.generate).toHaveBeenCalledTimes(2);
  expect(host.textContent?.match(/gallery.videoReview.textVoiceAccepted/g)).toHaveLength(2);
});

it('unlocks settings after proven stale refusal and regenerates only on an explicit action', async () => {
  mocks.batch.mockRejectedValueOnce(new Error('stale'));
  await render(['first', 'second']);
  await start();
  await approve();
  await click('gallery.videoReview.speechApplySelected');
  expect(host.querySelector('fieldset')?.disabled).toBe(false);
  expect(host.querySelectorAll('audio')).toHaveLength(0);
  expect(mocks.generate).toHaveBeenCalledTimes(2);
  await start();
  expect(mocks.generate).toHaveBeenCalledTimes(4);
});

it('reports a project overrun without a preview and permits explicit corrected generation', async () => {
  mocks.generate.mockRejectedValueOnce(new Error('duration'));
  await render();
  await start();
  await approve();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.videoReview.textVoiceProjectLimit'
  );
  expect(host.querySelector('audio')).toBeNull();
  await start();
  expect(mocks.generate).toHaveBeenCalledTimes(2);
  expect(host.querySelector('audio')).not.toBeNull();
});

it('aborts on leaving the form and releases a late output without applying it', async () => {
  let complete!: (value: ReviewTextVoicePreview) => void;
  mocks.generate.mockImplementation(
    () =>
      new Promise<ReviewTextVoicePreview>((resolve) => {
        complete = resolve;
      })
  );
  await render();
  await start();
  await approve();
  const signal: AbortSignal = mocks.generate.mock.calls[0]![3];
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
  await act(async () => complete(preview('first')));
  expect(mocks.cleanup).toHaveBeenCalledOnce();
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(host.textContent).toBe('');
});

it('stops the loader on failed model discovery and resumes it only for an explicit retry', async () => {
  mocks.failCatalog = true;
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'gallery.videoReview.speechMissingModel'
  );
  expect(host.querySelectorAll('svg.animate-spin')).toHaveLength(0);
  await click('gallery.videoReview.speechReloadModels');
  expect(mocks.reload).toHaveBeenCalledOnce();
  expect(host.querySelectorAll('svg.animate-spin')).toHaveLength(1);
  expect(mocks.generate).not.toHaveBeenCalled();
});

it('preserves the AI profile across Gallery selection and requires no model for the local mode', async () => {
  const { beforeRequest } = await render();
  await click('Provider Two');
  await click('gallery.videoReview.textVoiceGallery');
  expect(host.querySelector('[data-ui="gallery.videoReview.textVoiceGallery"]')).not.toBeNull();
  expect(beforeRequest).not.toHaveBeenCalled();
  await click('gallery.videoReview.textVoiceAI');
  await start();
  await approve();
  expect(mocks.generate.mock.calls[0]?.[2]).toMatchObject({ modelId: 'model2' });
  mocks.failCatalog = true;
  await click('gallery.videoReview.textVoiceGallery');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(
    host
      .querySelector('[data-ui="gallery.videoReview.textVoiceGallery"] button')
      ?.hasAttribute('disabled')
  ).toBe(false);
});

it('keeps batch local modes unavailable and routes Back and mode changes through the existing admission', async () => {
  const batch = await render(['first', 'second']);
  for (const key of [
    'gallery.videoReview.textVoiceMicrophone',
    'gallery.videoReview.textVoiceGallery',
  ]) {
    const button = [
      ...host.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input[type=checkbox]'),
    ].find((node) => node.textContent === key);
    expect(button?.disabled).toBe(true);
  }
  expect(host.textContent).toContain('gallery.videoReview.textVoiceLocalSingle');
  const beforeAction = vi.fn();
  const props = {
    ...batch.props,
    access: {
      ...batch.props.access,
      context: {
        beforeAction,
        registerPending: vi.fn(() => vi.fn()),
        video: { current: null },
        setSilent: vi.fn(),
      },
    },
  };
  await act(async () => root.render(<ReviewTextVoiceForm {...props} ids={['first']} />));
  await click('gallery.videoReview.textVoiceGallery');
  expect(beforeAction).toHaveBeenCalledOnce();
  expect(host.querySelector('[data-ui="gallery.videoReview.textVoiceGallery"]')).toBeNull();
  await act(async () => beforeAction.mock.calls[0]![0]());
  expect(host.querySelector('[data-ui="gallery.videoReview.textVoiceGallery"]')).not.toBeNull();
  await click('gallery.videoReview.textVoiceBack');
  expect(props.onClose).not.toHaveBeenCalled();
  await act(async () => beforeAction.mock.calls[1]![0]());
  expect(props.onClose).toHaveBeenCalledOnce();
});

it('presents one selected phrase as parameters without a redundant count or a permanent refresh action', async () => {
  const { session, props } = await render();
  expect(
    host.querySelector('[role="switch"][aria-label="gallery.videoReview.textVoiceMuteSource"]')
  ).not.toBeNull();
  expect(host.textContent).not.toContain('gallery.videoReview.textVoiceScope');
  expect(host.querySelector('[aria-label="gallery.videoReview.speechReloadModels"]')).toBeNull();
  await act(async () => session.setAutosaveEnabled(true));
  await act(async () => root.render(<ReviewTextVoiceForm {...props} />));
  expect(host.querySelector('[aria-label="gallery.videoReview.speechGenerate"]')).not.toBeNull();
});
