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
  acceptProjectTextVoice,
  captureProjectTextVoice,
  cleanupProjectTextVoicePreview,
  generateProjectTextVoice,
  type ProjectTextVoiceApplyAccess,
} from '../../../workflows/video/project-text-voice';
import {
  getCurrentVideoEditorCurrentTime,
  getCurrentVideoEditorProjectSnapshot,
  useVideoEditorHistoryPort,
  useVideoEditorTimelineEditingPort,
} from '../controller/store';
import { waitForVideoEditorSave } from './save-readiness';

type VoicePreview = Awaited<ReturnType<typeof generateProjectTextVoice>>;
type VoiceCapture = Awaited<ReturnType<typeof captureProjectTextVoice>>;
interface VoiceState {
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
  update: ProjectTextVoiceApplyAccess['update'];
  history: {
    begin: HistoryPort['beginProjectHistoryTransaction'];
    end: HistoryPort['endProjectHistoryTransaction'];
  };
}

function createVoiceAccess(
  owner: { current: VoiceLifetime },
  lifetime: VoiceLifetime,
  ports: { current: VoicePorts }
): ProjectTextVoiceApplyAccess {
  const access: ProjectTextVoiceApplyAccess = {
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
  work: (signal: AbortSignal) => Promise<void>,
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
      await Promise.race([work(controller.signal), cancelled]);
    } catch (error) {
      if (current() && !controller.signal.aborted)
        setState((value) => ({ ...value, error: voiceError(error) }));
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
  if (!life.mounted || life.active || life.preview || latest.current.consent) return;
  const attempt = ++life.catalogAttempt;
  try {
    const catalog = await requestAIModelSelectionBootstrap('speech');
    if (owner.current !== life || !life.mounted || attempt !== life.catalogAttempt) return;
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
    if (owner.current === life && life.mounted && attempt === life.catalogAttempt)
      setState((value) => ({ ...value, error: 'model-unavailable' }));
  }
}

/** One mounted inspector owns consent, audition resources, placement and acceptance lifetime. */
export function useVideoProjectTextVoice(project: VideoProject) {
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
        void cleanupProjectTextVoicePreview(lifetime.preview).catch(() => undefined);
    };
  }, [lifetime]);
  const loadModels = useCallback(() => loadVoiceCatalog(owner, latest, setState), []);
  const run = (work: (signal: AbortSignal) => Promise<void>, applying = false) =>
    runVoiceAttempt(owner, lifetime, setState, work, applying);
  return {
    ...state,
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
      await run(async () => {
        if (lifetime.preview) await cleanupProjectTextVoicePreview(lifetime.preview);
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
      const model = catalog?.models.find((entry) => entry.id === profile.modelId);
      const provider = catalog?.providers.find((entry) => entry.id === model?.providerId);
      if (!provider) {
        if (current()) setState((value) => ({ ...value, error: 'model-unavailable' }));
        return;
      }
      await run(async (signal) => {
        const capture = await captureProjectTextVoice(
          access,
          target.documentId,
          target.fragmentId,
          profile,
          signal
        );
        signal.throwIfAborted();
        if (current())
          setState((value) => ({
            ...value,
            consent: { capture, providerId: provider.id, providerName: provider.name },
          }));
      });
    },
    async start() {
      const consent = latest.current.consent;
      if (!consent || lifetime.preview) return;
      await run(async (signal) => {
        setState((value) => ({ ...value, consent: null }));
        const preview = await generateProjectTextVoice(
          access,
          consent.capture,
          consent.providerId,
          signal
        );
        if (signal.aborted || !current()) {
          await cleanupProjectTextVoicePreview(preview);
          return;
        }
        lifetime.preview = preview;
        setState((value) => ({ ...value, preview }));
      });
    },
    async apply() {
      const preview = lifetime.preview;
      if (!preview || latest.current.accepted) return;
      const placement = latest.current.placement;
      await run(async (signal) => {
        await acceptProjectTextVoice(access, preview, placement, signal);
        signal.throwIfAborted();
        if (current()) setState((value) => ({ ...value, accepted: true }));
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
