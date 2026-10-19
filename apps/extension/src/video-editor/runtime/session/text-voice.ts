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
import type { AIModelSelectionBootstrapPayload } from '../../../contracts/messaging/ai-settings-runtime';
import type { ReviewSpeechProfile } from '../../../features/video/review/speech-transcript';
import type { VideoProject } from '../../../features/video/project/types/model';
import type { VideoProjectVoicePlacement } from '../../../features/video/project/text/authoring';
import { requestAIModelSelectionBootstrap } from '../../../workflows/ai-settings/query';
import {
  captureProjectTextVoice,
  generateProjectTextVoice,
} from '../../../workflows/video/project-text-voice';
import {
  acceptProjectVoiceTake,
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
import { waitForVideoEditorSave } from './save-readiness';

type VoicePreview = ProjectVoiceTakePreview;
type VoiceCapture = Awaited<ReturnType<typeof captureProjectTextVoice>>;
interface VoiceState {
  source: 'ai' | 'microphone' | 'gallery';
  target: { documentId: string; fragmentId: string } | null;
  profile: ReviewSpeechProfile | undefined;
  catalog: AIModelSelectionBootstrapPayload | null;
  consent: { capture: VoiceCapture; providerId: string; providerName: string } | null;
  preview: VoicePreview | null;
  placement: VideoProjectVoicePlacement;
  running: boolean;
  applying: boolean;
  accepted: boolean;
  error: string | null;
}
interface VoiceLifetime {
  projectId: string;
  createdAt: number;
  mounted: boolean;
  active: AbortController | null;
  preview: VoicePreview | null;
  catalogAttempt: number;
}
const initialState: VoiceState = {
  source: 'ai',
  target: null,
  profile: undefined,
  catalog: null,
  consent: null,
  preview: null,
  placement: { start: 0 },
  running: false,
  applying: false,
  accepted: false,
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
    save: async () => {
      if (!access.getProject()) throw new Error('stale');
      try {
        await waitForVideoEditorSave(lifetime.projectId);
      } catch {
        throw new Error(access.getProject() ? 'storage-failed' : 'stale');
      }
      if (!access.getProject()) throw new Error('stale');
    },
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
    setState((value) => ({ ...value, running: true, applying, error: null }));
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

async function loadVoiceCatalog(
  owner: { current: VoiceLifetime },
  latest: { current: VoiceState },
  setState: Dispatch<SetStateAction<VoiceState>>
) {
  const life = owner.current;
  if (
    !life.mounted ||
    life.active ||
    life.preview ||
    latest.current.consent ||
    latest.current.source !== 'ai'
  )
    return;
  const attempt = ++life.catalogAttempt;
  try {
    const catalog = await requestAIModelSelectionBootstrap('speech');
    if (
      owner.current !== life ||
      !life.mounted ||
      attempt !== life.catalogAttempt ||
      latest.current.source !== 'ai'
    )
      return;
    const providers = catalog.providers.filter(
      (entry) => entry.connectionType === 'openai-compatible'
    );
    const models = catalog.models.filter(
      (entry) =>
        entry.operation === 'speech' &&
        entry.audio?.speech &&
        providers.some((provider) => provider.id === entry.providerId)
    );
    setState((value) => {
      const model = models.find((entry) => entry.id === catalog.defaultModelId);
      return {
        ...value,
        catalog: { ...catalog, providers, models },
        error: null,
        profile:
          value.profile ??
          (model?.audio?.speech ? { modelId: model.id, ...model.audio.speech } : undefined),
      };
    });
  } catch {
    if (
      owner.current === life &&
      life.mounted &&
      attempt === life.catalogAttempt &&
      latest.current.source === 'ai'
    )
      setState((value) => ({ ...value, error: 'model-unavailable' }));
  }
}

async function prepareVoiceConsent(
  access: ProjectVoiceTakeAccess,
  target: NonNullable<VoiceState['target']>,
  profile: ReviewSpeechProfile,
  catalog: VoiceState['catalog'],
  signal: AbortSignal
): Promise<NonNullable<VoiceState['consent']>> {
  const model = catalog?.models.find((entry) => entry.id === profile.modelId);
  const provider = catalog?.providers.find((entry) => entry.id === model?.providerId);
  if (!provider) throw new Error('model-unavailable');
  const capture = await captureProjectTextVoice(
    access,
    target.documentId,
    target.fragmentId,
    profile,
    signal
  );
  signal.throwIfAborted();
  return { capture, providerId: provider.id, providerName: provider.name };
}

async function retainVoicePreview(
  preview: VoicePreview,
  owner: { current: VoiceLifetime },
  lifetime: VoiceLifetime,
  signal: AbortSignal,
  setState: Dispatch<SetStateAction<VoiceState>>
) {
  if (signal.aborted || owner.current !== lifetime || !lifetime.mounted) {
    await cleanupProjectVoiceTakePreview(preview);
    return;
  }
  lifetime.preview = preview;
  setState((value) => ({ ...value, preview }));
}

async function prepareVoiceSelection(
  selection: Parameters<typeof prepareProjectLocalTextVoice>[0]['selection'],
  access: ProjectVoiceTakeAccess,
  state: Pick<VoiceState, 'target' | 'source' | 'consent'>,
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
      preview: null,
      catalogAttempt: 0,
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
      if (lifetime.preview)
        void cleanupProjectVoiceTakePreview(lifetime.preview).catch(() => undefined);
    };
  }, [lifetime]);
  const recording = useProjectTextVoiceRecording({
    access,
    target: state.target,
    enabled: !!state.target && state.source === 'microphone',
    accepted: state.accepted,
    startTime: state.placement.start,
    parentVisible,
    onPrepared(preview) {
      if (!current() || lifetime.preview) return false;
      lifetime.preview = preview;
      setState((value) => ({ ...value, preview }));
      return true;
    },
  });
  const loadModels = useCallback(() => loadVoiceCatalog(owner, latest, setState), []);
  const run = (work: (signal: AbortSignal) => Promise<void | VoicePreview>, applying = false) =>
    runVoiceAttempt(owner, lifetime, setState, work, applying);
  return {
    ...state,
    inspectorVisible: parentVisible,
    recording,
    loadModels,
    open(documentId: string, fragmentId: string) {
      if (!current() || lifetime.active || lifetime.preview) return;
      setState((value) => ({
        ...value,
        target: { documentId, fragmentId },
        consent: null,
        placement: { start: getCurrentVideoEditorCurrentTime() },
        accepted: false,
        error: null,
      }));
    },
    async close() {
      if (!current() || lifetime.active) return;
      const discard = () =>
        run(async () => {
          if (lifetime.preview) await cleanupProjectVoiceTakePreview(lifetime.preview);
          if (!current()) return;
          lifetime.preview = null;
          setState((value) => ({
            ...value,
            target: null,
            preview: null,
            consent: null,
            accepted: false,
          }));
        });
      if (latest.current.source === 'microphone')
        recording.dismiss(() => {
          void discard();
        });
      else await discard();
    },
    changeSource(source: VoiceState['source']) {
      if (source === latest.current.source) return;
      if (!current() || lifetime.active || lifetime.preview || latest.current.consent) return;
      const change = () => {
        if (current()) setState((value) => ({ ...value, source, error: null }));
      };
      if (latest.current.source === 'microphone') recording.dismiss(change);
      else change();
    },
    async prepareLocal(selection: Parameters<typeof prepareProjectLocalTextVoice>[0]['selection']) {
      if (lifetime.preview) throw new Error('busy');
      await prepareVoiceSelection(selection, access, latest.current, run);
    },
    changeProfile(profile: ReviewSpeechProfile) {
      if (!current() || lifetime.active || lifetime.preview || latest.current.consent) return;
      setState((value) => ({ ...value, profile, error: null }));
    },
    changePlacement(placement: VideoProjectVoicePlacement) {
      if (!current() || lifetime.active || lifetime.preview?.attachment?.receipt) return;
      setState((value) => ({ ...value, placement, error: null }));
    },
    async prepare() {
      const { target, profile, catalog } = latest.current;
      if (!target || !profile || lifetime.preview || latest.current.consent) return;
      await run(async (signal) => {
        const consent = await prepareVoiceConsent(access, target, profile, catalog, signal);
        if (current()) setState((value) => ({ ...value, consent }));
      });
    },
    async start() {
      const consent = latest.current.consent;
      if (!consent || lifetime.preview) return;
      await run(async (signal) => {
        setState((value) => ({ ...value, consent: null }));
        return generateProjectTextVoice(access, consent.capture, consent.providerId, signal);
      });
    },
    async apply() {
      const preview = lifetime.preview;
      if (!preview || latest.current.accepted) return;
      const placement = latest.current.placement;
      await run(async (signal) => {
        await acceptProjectVoiceTake(access, preview, placement, signal);
        signal.throwIfAborted();
        if (current()) {
          if (latest.current.source === 'microphone') recording.markRetained();
          setState((value) => ({ ...value, accepted: true }));
        }
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
