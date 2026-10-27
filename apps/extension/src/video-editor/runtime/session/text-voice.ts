import { hasCurrentOriginalAudioTargets } from '../../../features/video/project/timeline/original-audio';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { HistoryPort } from '../../contracts/controller-store';
import type { AIModelCatalogPayload } from '../../../contracts/messaging/ai-settings-runtime';
import type { ReviewSpeechProfile } from '../../../features/video/review/speech-transcript';
import type { VideoProject } from '../../../features/video/project/types/model';
import type { VideoProjectVoicePlacement } from '../../../features/video/project/text/authoring';
import { useAIScenarioModelSelection } from '../../../workflows/ai-settings/use-scenario-model-selection';
import {
  captureProjectTextVoiceQueue,
  runProjectTextVoiceQueue,
} from '../../../workflows/video/project-text-voice';
import {
  acceptProjectVoiceTakes,
  prepareProjectLocalTextVoice,
  cleanupProjectVoiceTakePreview,
  type ProjectVoiceTakeAccess,
  type ProjectVoiceTakePreview,
} from '../../../workflows/video/project-voice-take';
import {
  getCurrentVideoEditorCurrentTime,
  getCurrentVideoEditorProjectSnapshot,
  useVideoEditorHistoryPort,
  useVideoEditorTimelineEditingPort,
} from '../controller/store';
import { useProjectTextVoiceRecording } from './text-voice-recording';
import { saveVideoEditorTextSession, waitForVideoEditorSave } from './save-readiness';

type VoicePreview = ProjectVoiceTakePreview;
type VoiceQueue = Awaited<ReturnType<typeof captureProjectTextVoiceQueue>>;
type VoiceCapture = VoiceQueue['items'][number]['capture'];
interface VoiceTarget {
  documentId: string;
  fragmentId: string;
}
interface VoiceItem extends VoiceTarget {
  placement: VideoProjectVoicePlacement;
  preview: VoicePreview | null;
  selected: boolean;
  accepted: boolean;
}
interface VoiceState {
  source: 'ai' | 'microphone' | 'gallery';
  profile: ReviewSpeechProfile | undefined;
  consent: {
    capture: VoiceCapture;
    queue: VoiceQueue;
    providerId: string;
    providerName: string;
  } | null;
  activeId: string;
  progress: { completed: number; total: number } | null;
  running: boolean;
  applying: boolean;
  error: string | null;
}
interface VoiceLifetime {
  projectId: string;
  createdAt: number;
  mounted: boolean;
  active: AbortController | null;
  items: VoiceItem[];
  batch: boolean;
  profileReset: string | null;
  pendingApply: { preview: VoicePreview; placement: VideoProjectVoicePlacement }[] | null;
}
const initialState: VoiceState = {
  source: 'ai',
  profile: undefined,
  consent: null,
  activeId: '',
  progress: null,
  running: false,
  applying: false,
  error: null,
};
function voiceError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  return [
    'stale',
    'invalid-request',
    'invalid-response',
    'model-unavailable',
    'selection',
    'storage-failed',
    'busy',
  ].includes(code)
    ? code
    : 'failed';
}

interface VoicePorts {
  update: ProjectVoiceTakeAccess['update'];
  history: {
    begin: HistoryPort['beginProjectHistoryTransaction'];
    end: HistoryPort['endProjectHistoryTransaction'];
  };
}

function createVoiceAccess(
  owner: { current: VoiceLifetime },
  lifetime: VoiceLifetime,
  ports: { current: VoicePorts }
): ProjectVoiceTakeAccess {
  const access: ProjectVoiceTakeAccess = {
    getProject: () => {
      const value = getCurrentVideoEditorProjectSnapshot();
      return owner.current === lifetime &&
        lifetime.mounted &&
        value?.id === lifetime.projectId &&
        value.createdAt === lifetime.createdAt
        ? value
        : null;
    },
    save: () =>
      saveVideoEditorTextSession(lifetime.projectId, access.getProject, waitForVideoEditorSave),
    update: (updater) => {
      if (!access.getProject()) throw new Error('stale');
      const lease = ports.current.history.begin({ onlyIfIdle: true });
      if (!lease) throw new Error('busy');
      try {
        ports.current.update(updater);
      } finally {
        ports.current.history.end(lease);
      }
    },
  };
  return access;
}

function runVoiceAttempt(
  owner: { current: VoiceLifetime },
  lifetime: VoiceLifetime,
  setState: Dispatch<SetStateAction<VoiceState>>,
  work: (signal: AbortSignal) => Promise<void | VoicePreview>,
  applying: boolean
) {
  const current = () => owner.current === lifetime && lifetime.mounted;
  return (async () => {
    if (!current() || lifetime.active) return;
    const controller = new AbortController();
    lifetime.active = controller;
    setState((value) => ({ ...value, running: true, applying, progress: null, error: null }));
    let abort = () => {};
    const cancelled = new Promise<void>((_resolve, reject) => {
      abort = () => reject(new DOMException('Cancelled', 'AbortError'));
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    try {
      const prepared = work(controller.signal).then(async (preview) => {
        if (preview)
          await retainVoicePreview(preview, owner, lifetime, controller.signal, setState);
      });
      await Promise.race([prepared, cancelled]);
      return true;
    } catch (error) {
      if (current() && !controller.signal.aborted)
        setState((value) => ({ ...value, error: voiceError(error) }));
      return false;
    } finally {
      controller.signal.removeEventListener('abort', abort);
      if (current() && lifetime.active === controller) {
        lifetime.active = null;
        setState((value) => ({ ...value, running: false, applying: false }));
      }
    }
  })();
}

function isVoiceCatalogOpen(lifetime: VoiceLifetime, state: Pick<VoiceState, 'source'>) {
  return lifetime.mounted && lifetime.items.length > 0 && state.source === 'ai';
}

async function prepareVoiceConsent(
  access: ProjectVoiceTakeAccess,
  selected: readonly VoiceTarget[],
  profile: ReviewSpeechProfile,
  catalog: AIModelCatalogPayload | null,
  signal: AbortSignal
): Promise<NonNullable<VoiceState['consent']>> {
  const model = catalog?.models.find((entry) => entry.id === profile.modelId);
  const provider = catalog?.providers.find((entry) => entry.id === model?.providerId);
  if (!provider) throw new Error('model-unavailable');
  const queue = await captureProjectTextVoiceQueue(access, selected, profile, signal);
  signal.throwIfAborted();
  const capture = queue.items[0]!.capture;
  return { capture, queue, providerId: provider.id, providerName: provider.name };
}

function voiceItemKey(item: VoiceTarget) {
  return JSON.stringify([item.documentId, item.fragmentId]);
}

function publishVoiceItems(
  lifetime: VoiceLifetime,
  setState: Dispatch<SetStateAction<VoiceState>>,
  items: VoiceItem[]
) {
  lifetime.items = items;
  setState((value) => ({ ...value }));
}

/** The lifetime owns resources immediately; React receives only a presentation update. */
function rememberVoicePreview(
  lifetime: VoiceLifetime,
  setState: Dispatch<SetStateAction<VoiceState>>,
  preview: VoicePreview
) {
  const key = voiceItemKey({
    documentId: preview.textSnapshot.documentId,
    fragmentId: preview.textSnapshot.text.textId,
  });
  const item = lifetime.items.find((entry) => voiceItemKey(entry) === key);
  if (!item || item.preview || !lifetime.mounted) return false;
  publishVoiceItems(
    lifetime,
    setState,
    lifetime.items.map((entry) => (entry === item ? { ...entry, preview } : entry))
  );
  return true;
}

async function retainVoicePreview(
  preview: VoicePreview,
  owner: { current: VoiceLifetime },
  lifetime: VoiceLifetime,
  signal: AbortSignal,
  setState: Dispatch<SetStateAction<VoiceState>>
) {
  if (
    signal.aborted ||
    owner.current !== lifetime ||
    !rememberVoicePreview(lifetime, setState, preview)
  )
    await cleanupProjectVoiceTakePreview(preview);
}

async function generateVoiceBatch(
  access: ProjectVoiceTakeAccess,
  lifetime: VoiceLifetime,
  consent: NonNullable<VoiceState['consent']>,
  signal: AbortSignal,
  setState: Dispatch<SetStateAction<VoiceState>>
) {
  await runProjectTextVoiceQueue(access, consent.queue, consent.providerId, signal, {
    ready: (preview) => {
      if (
        signal.aborted ||
        !access.getProject() ||
        !rememberVoicePreview(lifetime, setState, preview)
      )
        throw new Error('stale');
    },
    progress: ({ completed, total }) => {
      if (!signal.aborted && access.getProject())
        setState((value) => ({ ...value, progress: { completed, total } }));
    },
    failed: (cause) => {
      if (!signal.aborted && access.getProject())
        setState((value) => ({ ...value, error: voiceError(cause) }));
    },
  });
}

function canApplyVoiceItems(project: VideoProject | null, lifetime: VoiceLifetime) {
  if (lifetime.pendingApply) return true;
  const selected = lifetime.items.filter((item) => item.selected && item.preview && !item.accepted);
  return (
    !!project &&
    selected.length > 0 &&
    selected.every(
      (item) =>
        !item.placement.originalAudioMute ||
        hasCurrentOriginalAudioTargets(project, item.placement.originalAudioMute)
    )
  );
}

async function applyVoiceBatch(
  access: ProjectVoiceTakeAccess,
  lifetime: VoiceLifetime,
  signal: AbortSignal,
  setState: Dispatch<SetStateAction<VoiceState>>
) {
  lifetime.pendingApply ??= lifetime.items.flatMap((item) =>
    item.selected && item.preview && !item.accepted
      ? [{ preview: item.preview, placement: structuredClone(item.placement) }]
      : []
  );
  const selected = lifetime.pendingApply;
  try {
    await acceptProjectVoiceTakes(access, selected, signal);
  } catch (cause) {
    if (!selected.some((entry) => entry.preview.attachment)) lifetime.pendingApply = null;
    throw cause;
  }
  signal.throwIfAborted();
  if (!access.getProject()) throw new Error('stale');
  publishVoiceItems(
    lifetime,
    setState,
    lifetime.items.map((item) =>
      selected.some((entry) => entry.preview === item.preview)
        ? { ...item, accepted: true, selected: false }
        : item
    )
  );
  lifetime.pendingApply = null;
}

async function releaseVoiceItems(lifetime: VoiceLifetime) {
  for (const item of lifetime.items)
    if (item.preview) await cleanupProjectVoiceTakePreview(item.preview);
  lifetime.items = [];
  lifetime.batch = false;
  lifetime.pendingApply = null;
}

async function prepareVoiceSelection(
  selection: Parameters<typeof prepareProjectLocalTextVoice>[0]['selection'],
  access: ProjectVoiceTakeAccess,
  state: Pick<VoiceState, 'source' | 'consent'> & { target: VoiceTarget | null },
  run: (work: (signal: AbortSignal) => Promise<VoicePreview>) => ReturnType<typeof runVoiceAttempt>
) {
  const { target, source, consent } = state;
  if (!target || source !== 'gallery' || consent) throw new Error('busy');
  const prepared = await run((signal) =>
    prepareProjectLocalTextVoice({
      access,
      documentId: target.documentId,
      fragmentId: target.fragmentId,
      selection,
      kind: 'gallery',
      signal,
    })
  );
  if (!prepared) throw new Error('failed');
}

function openVoiceSelection(
  lifetime: VoiceLifetime,
  setState: Dispatch<SetStateAction<VoiceState>>,
  documentId: string,
  selection: string | readonly string[]
) {
  if (lifetime.active || lifetime.items.length) return;
  const ids = [...new Set(typeof selection === 'string' ? [selection] : selection)];
  if (!ids.length) return;
  const start = getCurrentVideoEditorCurrentTime();
  lifetime.batch = typeof selection !== 'string';
  lifetime.items = ids.map((fragmentId) => ({
    documentId,
    fragmentId,
    placement: { start },
    preview: null,
    selected: true,
    accepted: false,
  }));
  setState((value) => ({
    ...value,
    activeId: '',
    consent: null,
    error: null,
    source: lifetime.batch ? 'ai' : value.source,
  }));
}

function toggleVoiceItem(
  lifetime: VoiceLifetime,
  setState: Dispatch<SetStateAction<VoiceState>>,
  documentId: string,
  fragmentId: string
) {
  const key = voiceItemKey({ documentId, fragmentId });
  publishVoiceItems(
    lifetime,
    setState,
    lifetime.items.map((item) =>
      voiceItemKey(item) === key && !item.accepted ? { ...item, selected: !item.selected } : item
    )
  );
}

function changeVoicePlacement(
  lifetime: VoiceLifetime,
  setState: Dispatch<SetStateAction<VoiceState>>,
  active: VoiceItem,
  placement: VideoProjectVoicePlacement
) {
  publishVoiceItems(
    lifetime,
    setState,
    lifetime.items.map((item) =>
      item === active ? { ...item, placement: structuredClone(placement) } : item
    )
  );
}

async function prepareVoiceBatch(
  access: ProjectVoiceTakeAccess,
  lifetime: VoiceLifetime,
  state: Pick<VoiceState, 'profile' | 'consent'>,
  prepareSelection: ReturnType<typeof useAIScenarioModelSelection>['prepareModelSelection'],
  signal: AbortSignal,
  setState: Dispatch<SetStateAction<VoiceState>>
) {
  const selected = lifetime.items.filter(
    (item) => item.selected && !item.preview && !item.accepted
  );
  if (!state.profile || !selected.length || state.consent || lifetime.pendingApply) return;
  if (!state.profile.voiceId.trim()) throw new Error('invalid-request');
  const prepared = await prepareSelection(signal);
  if (!access.getProject()) throw new Error('stale');
  if (prepared.modelId !== state.profile.modelId || !state.profile.voiceId.trim())
    throw new Error('model-unavailable');
  const consent = await prepareVoiceConsent(
    access,
    selected,
    state.profile,
    prepared.catalog,
    signal
  );
  if (access.getProject()) setState((value) => ({ ...value, consent }));
}

/** Close owns raw-take admission and complete preview release before resetting the view. */
async function closeVoiceSelection(
  owner: { current: VoiceLifetime },
  lifetime: VoiceLifetime,
  setState: Dispatch<SetStateAction<VoiceState>>,
  source: VoiceState['source'],
  dismiss: ReturnType<typeof useProjectTextVoiceRecording>['dismiss']
) {
  const current = () => owner.current === lifetime && lifetime.mounted;
  if (!current() || lifetime.active) return;
  const discard = () =>
    runVoiceAttempt(
      owner,
      lifetime,
      setState,
      async () => {
        await releaseVoiceItems(lifetime);
        if (current()) setState((value) => ({ ...value, activeId: '', consent: null }));
      },
      false
    );
  if (source === 'microphone')
    dismiss(() => {
      void discard();
    });
  else await discard();
}

/** One mounted inspector owns consent, audition resources, placement and acceptance lifetime. */
export function useVideoProjectTextVoice(project: VideoProject, parentVisible = true) {
  const update = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const history = useVideoEditorHistoryPort((port) => ({
    begin: port.beginProjectHistoryTransaction,
    end: port.endProjectHistoryTransaction,
  }));
  const ports = useRef({ update, history });
  ports.current = { update, history };
  const [state, setState] = useState<VoiceState>(initialState);
  const latest = useRef(state);
  latest.current = state;
  const lifetime = useMemo<VoiceLifetime>(
    () => ({
      projectId: project.id,
      createdAt: project.createdAt,
      mounted: true,
      active: null,
      items: [],
      batch: false,
      profileReset: null,
      pendingApply: null,
    }),
    [project.id, project.createdAt]
  );
  const owner = useRef(lifetime);
  owner.current = lifetime;
  const current = () => owner.current === lifetime && lifetime.mounted;
  const access = useMemo(() => createVoiceAccess(owner, lifetime, ports), [lifetime]);
  useEffect(() => {
    lifetime.mounted = true;
    setState(initialState);
    return () => {
      lifetime.mounted = false;
      lifetime.active?.abort();
      for (const item of lifetime.items)
        if (item.preview) void cleanupProjectVoiceTakePreview(item.preview).catch(() => undefined);
    };
  }, [lifetime]);
  const active =
    lifetime.items.find((item) => voiceItemKey(item) === state.activeId) ?? lifetime.items[0];
  const target = active ? { documentId: active.documentId, fragmentId: active.fragmentId } : null;
  const preview = active?.preview ?? null;
  const recording = useProjectTextVoiceRecording({
    access,
    target,
    enabled: !lifetime.batch && lifetime.items.length === 1 && state.source === 'microphone',
    accepted: active?.accepted ?? false,
    startTime: active?.placement.start ?? 0,
    parentVisible,
    onPrepared(value) {
      return (
        current() &&
        !lifetime.items.some((item) => item.preview) &&
        rememberVoicePreview(lifetime, setState, value)
      );
    },
  });
  const selection = useAIScenarioModelSelection(
    'video-speech',
    isVoiceCatalogOpen(lifetime, state)
  );
  useEffect(() => {
    if (selection.selectionPending) return;
    const replace = lifetime.profileReset === selection.modelId && !selection.selectionFailed;
    lifetime.profileReset = null;
    if (lifetime.active || lifetime.items.some((item) => item.preview) || state.consent) return;
    const model = selection.configuration?.models.find((entry) => entry.id === selection.modelId);
    if (!model || (state.profile?.modelId === model.id && !replace)) return;
    const provider = selection.configuration?.providers.find(
      (entry) => entry.id === model.providerId
    );
    const profile: ReviewSpeechProfile = model.audio?.speech
      ? { modelId: model.id, ...model.audio.speech }
      : {
          modelId: model.id,
          voiceId: '',
          responseFormat: provider?.connectionType === 'google' ? 'wav' : 'mp3',
        };
    setState((value) => ({ ...value, profile }));
  }, [
    lifetime,
    selection.configuration,
    selection.modelId,
    selection.selectionPending,
    selection.selectionFailed,
    state.profile,
    state.consent,
  ]);
  const retryConfiguration = selection.retryConfiguration;
  const loadModels = useCallback(async () => {
    const life = owner.current;
    if (
      !isVoiceCatalogOpen(life, latest.current) ||
      life.active ||
      life.items.some((item) => item.preview) ||
      latest.current.consent
    )
      return;
    await retryConfiguration();
  }, [retryConfiguration]);
  const run = (work: (signal: AbortSignal) => Promise<void | VoicePreview>, applying = false) =>
    runVoiceAttempt(owner, lifetime, setState, work, applying);
  const editable = () => current() && !lifetime.active && !lifetime.pendingApply;
  const acquired = () => lifetime.items.some((item) => item.preview);
  return {
    ...state,
    catalog: selection.configuration,
    modelId: selection.modelId,
    configurationFailed: selection.configurationFailed,
    selectionFailed: selection.selectionFailed,
    selectionUnavailable: selection.selectionUnavailable,
    selectionPending: selection.selectionPending,
    target,
    preview,
    items: lifetime.items,
    batch: lifetime.batch,
    placement: active?.placement ?? { start: 0 },
    accepted: active?.accepted ?? false,
    pendingApply: !!lifetime.pendingApply,
    canApply: canApplyVoiceItems(access.getProject(), lifetime),
    inspectorVisible: parentVisible,
    recording,
    loadModels,
    open(documentId: string, selection: string | readonly string[]) {
      if (current()) openVoiceSelection(lifetime, setState, documentId, selection);
    },
    close: () =>
      closeVoiceSelection(owner, lifetime, setState, latest.current.source, recording.dismiss),
    focusItem(documentId: string, fragmentId: string) {
      if (current())
        setState((value) => ({ ...value, activeId: voiceItemKey({ documentId, fragmentId }) }));
    },
    toggleItem(documentId: string, fragmentId: string) {
      if (editable() && !latest.current.consent)
        toggleVoiceItem(lifetime, setState, documentId, fragmentId);
    },
    changeSource(source: VoiceState['source']) {
      if (source === latest.current.source || lifetime.batch) return;
      if (!editable() || acquired() || latest.current.consent) return;
      const change = () => {
        if (current()) setState((value) => ({ ...value, source, error: null }));
      };
      if (latest.current.source === 'microphone') recording.dismiss(change);
      else change();
    },
    async prepareLocal(selection: Parameters<typeof prepareProjectLocalTextVoice>[0]['selection']) {
      if (acquired() || lifetime.batch || lifetime.items.length !== 1) throw new Error('busy');
      await prepareVoiceSelection(
        selection,
        access,
        {
          source: latest.current.source,
          consent: latest.current.consent,
          target,
        },
        run
      );
    },
    chooseModel(id: string | null) {
      if (
        !editable() ||
        acquired() ||
        latest.current.consent ||
        selection.selectionPending ||
        !id ||
        !selection.configuration?.models.some((entry) => entry.id === id)
      )
        return;
      lifetime.profileReset = id;
      selection.chooseModel(id);
    },
    changeProfile(profile: ReviewSpeechProfile) {
      if (!editable() || acquired() || latest.current.consent) return;
      setState((value) => ({ ...value, profile, error: null }));
    },
    changePlacement(placement: VideoProjectVoicePlacement) {
      if (editable() && active && !active.accepted)
        changeVoicePlacement(lifetime, setState, active, placement);
    },
    async prepare() {
      await run((signal) =>
        prepareVoiceBatch(
          access,
          lifetime,
          latest.current,
          selection.prepareModelSelection,
          signal,
          setState
        )
      );
    },
    async start() {
      const consent = latest.current.consent;
      if (!consent || lifetime.pendingApply) return;
      await run(async (signal) => {
        setState((value) => ({ ...value, consent: null, progress: null }));
        const prepared = await selection.prepareModelSelection(signal);
        const model = prepared.catalog.models.find((entry) => entry.id === prepared.modelId);
        if (!access.getProject()) throw new Error('stale');
        if (
          prepared.modelId !== consent.capture.profile.modelId ||
          model?.providerId !== consent.providerId
        )
          throw new Error('model-unavailable');
        await generateVoiceBatch(access, lifetime, consent, signal, setState);
      });
    },
    async apply() {
      if (!canApplyVoiceItems(access.getProject(), lifetime)) return;
      await run(async (signal) => {
        await applyVoiceBatch(access, lifetime, signal, setState);
        if (current() && latest.current.source === 'microphone') recording.markRetained();
      }, true);
    },
    cancel() {
      if (!current() || latest.current.applying) return;
      lifetime.active?.abort();
      setState((value) => ({ ...value, consent: null }));
    },
  };
}

export type VideoProjectTextVoiceController = ReturnType<typeof useVideoProjectTextVoice>;
