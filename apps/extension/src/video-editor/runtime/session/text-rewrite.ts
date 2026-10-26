import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { ReviewTextProposal } from '../../../contracts/ai/review-text';
import type { AIModelSelectionBootstrapPayload } from '../../../contracts/messaging/ai-settings-runtime';
import type { VideoProject } from '../../../features/video/project/types/model';
import { requestAIModelSelectionBootstrap } from '../../../workflows/ai-settings/query';
import {
  applyProjectTextRewrite,
  captureProjectTextRewrite,
  generateProjectTextRewrite,
  type ProjectTextRewriteAccess,
  type ProjectTextRewritePreview,
} from '../../../workflows/video/project-text-rewrite';
import {
  getCurrentVideoEditorProjectSnapshot,
  useVideoEditorHistoryPort,
  useVideoEditorTimelineEditingPort,
} from '../controller/store';
import { saveVideoEditorTextSession, waitForVideoEditorSave } from './save-readiness';

type RewriteOptions = Parameters<typeof captureProjectTextRewrite>[3];
interface RewriteTarget {
  documentId: string;
  ids: readonly string[];
  wholeDocument: boolean;
}
interface RewriteState {
  running: boolean;
  applying: boolean;
  accepted: boolean;
  elapsed: number;
  preview: ProjectTextRewritePreview | null;
  error: string | null;
}
type RewriteWork = (signal: AbortSignal) => Promise<void>;
type RewriteStateSetter = Dispatch<SetStateAction<RewriteState>>;
interface RewriteLifetime {
  projectId: string;
  projectCreatedAt: number;
  mounted: boolean;
  active: { controller: AbortController; applying: boolean } | null;
  preview: ProjectTextRewritePreview | null;
  accepted: boolean;
  catalogAttempt: number;
}
const initialState: RewriteState = {
  running: false,
  applying: false,
  accepted: false,
  elapsed: 0,
  preview: null,
  error: null,
};
const defaultOptions = (wholeDocument = false): RewriteOptions => ({
  prompt: '',
  mode: 'phrases',
  wholeDocument,
  changeIntervals: false,
  resegment: false,
});

function errorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  return [
    'stale',
    'too-large',
    'model-unavailable',
    'invalid',
    'invalid-request',
    'invalid-response',
    'storage-failed',
  ].includes(code)
    ? code
    : 'failed';
}

function useRewriteCatalog(owner: { current: RewriteLifetime }, setState: RewriteStateSetter) {
  const [catalog, setCatalog] = useState<AIModelSelectionBootstrapPayload | null>(null);
  const [modelId, setModelIdState] = useState('');
  const lifetime = owner.current;
  useEffect(() => {
    setCatalog(null);
    setModelIdState('');
  }, [lifetime]);
  const loadModels = useCallback(async () => {
    const lifetime = owner.current;
    const attempt = ++lifetime.catalogAttempt;
    try {
      const data = await requestAIModelSelectionBootstrap('text');
      if (owner.current !== lifetime || !lifetime.mounted || attempt !== lifetime.catalogAttempt)
        return;
      const providers = data.providers.filter(
        (provider) => provider.connectionType === 'openai-compatible' && provider.destinationBinding
      );
      const models = data.models.filter(
        (model) =>
          (model.operation === undefined || model.operation === 'text') &&
          providers.some((provider) => provider.id === model.providerId)
      );
      setCatalog({ ...data, models, providers });
      setModelIdState(
        (current) =>
          current ||
          (models.some((model) => model.id === data.defaultModelId)
            ? data.defaultModelId!
            : (models[0]?.id ?? ''))
      );
    } catch {
      if (owner.current === lifetime && lifetime.mounted && attempt === lifetime.catalogAttempt)
        setState((value) => ({ ...value, error: 'model-unavailable' }));
    }
  }, [owner, setState]);
  const setModelId = useCallback<typeof setModelIdState>(
    (next) => {
      if (!owner.current.active && !owner.current.preview) setModelIdState(next);
    },
    [owner]
  );
  return { catalog, modelId, setModelId, loadModels };
}

function createProjectTextRewriteAccess(
  owner: { current: RewriteLifetime },
  lifetime: RewriteLifetime,
  updateProject: ProjectTextRewriteAccess['update']
): ProjectTextRewriteAccess {
  const access: ProjectTextRewriteAccess = {
    getProject: () => {
      const current = getCurrentVideoEditorProjectSnapshot();
      return owner.current === lifetime &&
        lifetime.mounted &&
        current?.id === lifetime.projectId &&
        current.createdAt === lifetime.projectCreatedAt
        ? current
        : null;
    },
    save: () =>
      saveVideoEditorTextSession(lifetime.projectId, access.getProject, waitForVideoEditorSave),
    update: (updater) => {
      if (!access.getProject()) throw new Error('stale');
      updateProject(updater);
    },
  };
  return access;
}

function runProjectTextRewriteAttempt(
  owner: { current: RewriteLifetime },
  lifetime: RewriteLifetime,
  setState: RewriteStateSetter,
  work: RewriteWork,
  applying = false
): void {
  if (owner.current !== lifetime || !lifetime.mounted || lifetime.active) return;
  const attempt = { controller: new AbortController(), applying };
  lifetime.active = attempt;
  const signal = attempt.controller.signal;
  const current = () =>
    owner.current === lifetime && lifetime.mounted && lifetime.active === attempt;
  const started = performance.now();
  setState((value) => ({ ...value, running: true, applying, elapsed: 0, error: null }));
  const timer = setInterval(() => {
    if (current())
      setState((value) => ({
        ...value,
        elapsed: Math.floor((performance.now() - started) / 1000),
      }));
  }, 250);
  let onAbort = () => {};
  const cancelled = new Promise<void>((_resolve, reject) => {
    onAbort = () => reject(new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  void Promise.race([work(signal), cancelled])
    .catch((error: unknown) => {
      if (current() && !signal.aborted)
        setState((value) => ({ ...value, error: errorCode(error) }));
    })
    .finally(() => {
      clearInterval(timer);
      signal.removeEventListener('abort', onAbort);
      if (!current()) return;
      lifetime.active = null;
      setState((value) => ({ ...value, running: false, applying: false }));
    });
}

function captureRewriteDisclosure(
  access: ProjectTextRewriteAccess,
  target: RewriteTarget | null,
  options: RewriteOptions
) {
  let disclosure: ProjectTextRewritePreview | null = null;
  let disclosureError: string | null = null;
  if (target && options.prompt.trim()) {
    try {
      disclosure = captureProjectTextRewrite(access, target.documentId, target.ids, {
        ...options,
        wholeDocument: target.wholeDocument,
      });
    } catch (error) {
      disclosureError = errorCode(error);
    }
  }
  return { disclosure, disclosureError };
}

/** The mounted inspector retains disposable settings and proposals across section navigation. */
export function useVideoProjectTextRewrite(project: VideoProject) {
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const history = useVideoEditorHistoryPort((port) => ({
    begin: port.beginProjectHistoryTransaction,
    end: port.endProjectHistoryTransaction,
  }));
  const [state, setState] = useState<RewriteState>(initialState);
  const [target, setTarget] = useState<RewriteTarget | null>(null);
  const [options, setOptionsState] = useState<RewriteOptions>(defaultOptions);
  const lifetime = useMemo<RewriteLifetime>(
    () => ({
      projectId: project.id,
      projectCreatedAt: project.createdAt,
      mounted: true,
      active: null,
      preview: null,
      accepted: false,
      catalogAttempt: 0,
    }),
    [project.id, project.createdAt]
  );
  const owner = useRef(lifetime);
  owner.current = lifetime;
  useEffect(() => {
    lifetime.mounted = true;
    setState(initialState);
    setTarget(null);
    setOptionsState(defaultOptions());
    return () => {
      lifetime.mounted = false;
      lifetime.active?.controller.abort();
    };
  }, [lifetime]);
  const currentLifetime = () => owner.current === lifetime && lifetime.mounted;
  const access = createProjectTextRewriteAccess(owner, lifetime, updateProject);
  const { catalog, modelId, setModelId, loadModels } = useRewriteCatalog(owner, setState);
  const setOptions = useCallback<typeof setOptionsState>((next) => {
    if (!owner.current.active && !owner.current.preview) setOptionsState(next);
  }, []);
  const remember = (preview: ProjectTextRewritePreview | null) => {
    if (!currentLifetime()) return;
    lifetime.preview = preview;
    lifetime.accepted = false;
    setState((value) => ({ ...value, preview, accepted: false, error: null }));
  };
  const command = (work: RewriteWork, applying = false) =>
    runProjectTextRewriteAttempt(owner, lifetime, setState, work, applying);
  const { disclosure, disclosureError } = captureRewriteDisclosure(access, target, options);
  return {
    ...state,
    target,
    options,
    setOptions,
    catalog,
    modelId,
    setModelId,
    loadModels,
    disclosure,
    disclosureError,
    resultDuration: project.duration,
    open(documentId: string, ids: readonly string[], wholeDocument: boolean) {
      if (!currentLifetime() || lifetime.active) return;
      remember(null);
      setTarget({ documentId, ids: [...ids], wholeDocument });
      setOptionsState(defaultOptions(wholeDocument));
    },
    close() {
      if (!currentLifetime() || lifetime.active) return;
      remember(null);
      setTarget(null);
      setOptionsState(defaultOptions());
    },
    start() {
      if (!currentLifetime() || lifetime.active || lifetime.preview) return;
      const model = catalog?.models.find((entry) => entry.id === modelId);
      const provider = catalog?.providers.find((entry) => entry.id === model?.providerId);
      if (!model || !provider?.destinationBinding) {
        setState((value) => ({ ...value, error: 'model-unavailable' }));
        return;
      }
      if (!disclosure) {
        setState((value) => ({ ...value, error: disclosureError ?? 'invalid-request' }));
        return;
      }
      const captured = structuredClone(disclosure);
      const selected = {
        modelId: model.id,
        approvedProviderId: provider.id,
        approvedDestination: provider.destinationBinding,
        approvedModelCode: model.modelCode,
      };
      command(async (signal) => {
        const preview = await generateProjectTextRewrite(access, captured, selected, signal);
        signal.throwIfAborted();
        remember(preview);
      });
    },
    apply(mode: 'replace' | 'variant') {
      const preview = lifetime.preview;
      if (!currentLifetime() || lifetime.active || !preview || lifetime.accepted) return;
      command(async (signal) => {
        const lease = history.begin({ onlyIfIdle: true });
        if (!lease) throw new Error('stale');
        const applyAccess: ProjectTextRewriteAccess = {
          ...access,
          update: (updater) => {
            try {
              access.update(updater);
            } finally {
              // Seal the local action before storage waits can admit unrelated gestures.
              history.end(lease);
            }
          },
        };
        try {
          await applyProjectTextRewrite(applyAccess, preview, signal, mode);
          signal.throwIfAborted();
          if (currentLifetime()) {
            lifetime.accepted = true;
            setState((value) => ({ ...value, accepted: true }));
          }
        } finally {
          history.end(lease);
        }
      }, true);
    },
    edit(update: (proposal: ReviewTextProposal) => ReviewTextProposal) {
      const preview = lifetime.preview;
      if (
        !currentLifetime() ||
        lifetime.active ||
        !preview?.proposal ||
        preview.receipt ||
        lifetime.accepted
      )
        return;
      remember({ ...preview, proposal: update(preview.proposal) });
    },
    discard() {
      if (!lifetime.active) remember(null);
    },
    cancel() {
      const active = lifetime.active;
      if (!currentLifetime() || !active || active.applying) return;
      lifetime.active = null;
      active.controller.abort();
      setState((value) => ({ ...value, running: false, applying: false }));
    },
  };
}

export type VideoProjectTextRewriteController = ReturnType<typeof useVideoProjectTextRewrite>;
