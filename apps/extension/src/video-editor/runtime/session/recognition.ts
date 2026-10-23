import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { AIModelSelectionBootstrapPayload } from '../../../contracts/messaging/ai-settings-runtime';
import type { VideoProject } from '../../../features/video/project/types/model';
import { editReviewTextFragment } from '../../../features/video/review/text-document';
import { requestAIModelSelectionBootstrap } from '../../../workflows/ai-settings/query';
import {
  prepareProjectRecognition,
  runProjectRecognition,
  applyProjectRecognition,
  type ProjectRecognitionJob,
  type ProjectRecognitionOptions,
  type ProjectRecognitionProposal,
} from '../../../workflows/video/project-recognition';
import { waitForVideoEditorSave } from './save-readiness';
import {
  getCurrentVideoEditorProjectSnapshot,
  useVideoEditorHistoryPort,
  useVideoEditorTimelineEditingPort,
} from '../controller/store';

interface RecognitionState {
  running: boolean;
  applying: boolean;
  accepted: boolean;
  error: string | null;
  completed: number;
  total: number;
  proposal: ProjectRecognitionProposal | null;
}
const initial: RecognitionState = {
  running: false,
  applying: false,
  accepted: false,
  error: null,
  completed: 0,
  total: 0,
  proposal: null,
};

function useRecognitionCatalog(lifetime: { mounted: boolean }, onError: () => void) {
  const [catalog, setCatalog] = useState<AIModelSelectionBootstrapPayload | null>(null);
  const owner = useRef(lifetime);
  owner.current = lifetime;
  const latestAttempt = useRef(0);
  const loadModels = useCallback(async () => {
    const lifetime = owner.current;
    const attempt = ++latestAttempt.current;
    try {
      const result = await requestAIModelSelectionBootstrap('transcription');
      if (owner.current === lifetime && lifetime.mounted && latestAttempt.current === attempt)
        setCatalog(result);
    } catch {
      if (owner.current === lifetime && lifetime.mounted && latestAttempt.current === attempt)
        onError();
    }
  }, [onError]);
  return { catalog, loadModels };
}

function runRecognitionCommand(
  owner: { current: { mounted: boolean; active: AbortController | null } },
  setState: Dispatch<SetStateAction<RecognitionState>>,
  work: (signal: AbortSignal) => Promise<void>,
  applying = false
) {
  const lifetime = owner.current;
  if (lifetime.active) return;
  const controller = new AbortController();
  lifetime.active = controller;
  setState((value) => ({ ...value, running: true, applying, error: null }));
  void work(controller.signal)
    .catch((error: unknown) => {
      if (owner.current === lifetime && lifetime.mounted && !controller.signal.aborted)
        setState((value) => ({
          ...value,
          error: error instanceof Error ? error.message : 'failed',
        }));
    })
    .finally(() => {
      if (lifetime.active === controller) lifetime.active = null;
      if (owner.current === lifetime && lifetime.mounted)
        setState((value) => ({ ...value, running: false, applying: false }));
    });
}

/** The sidebar lifetime retains completed work independently from the selected inspector section. */
export function useVideoProjectRecognition(project: VideoProject) {
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const history = useVideoEditorHistoryPort((port) => ({
    begin: port.beginProjectHistoryTransaction,
    end: port.endProjectHistoryTransaction,
  }));
  const [state, setState] = useState<RecognitionState>(initial);
  const lifetime = useMemo(
    () => ({
      projectId: project.id,
      mounted: true,
      active: null as AbortController | null,
      job: undefined as ProjectRecognitionJob | undefined,
      proposal: null as ProjectRecognitionProposal | null,
    }),
    [project.id]
  );
  const owner = useRef(lifetime);
  owner.current = lifetime;
  useEffect(() => {
    lifetime.mounted = true;
    setState(initial);
    return () => {
      lifetime.mounted = false;
      lifetime.active?.abort();
    };
  }, [lifetime]);
  const reportCatalogError = useCallback(() => {
    setState((value) => ({ ...value, error: 'model' }));
  }, []);
  const { catalog, loadModels } = useRecognitionCatalog(lifetime, reportCatalogError);
  const access = {
    getProject: getCurrentVideoEditorProjectSnapshot,
    save: () => waitForVideoEditorSave(lifetime.projectId),
    update: updateProject,
  };
  const recognize = (options: ProjectRecognitionOptions) => {
    const model = catalog?.models.find((entry) => entry.id === options.modelId);
    if (
      !model ||
      model.providerId !== options.approvedProviderId ||
      (model.audio?.transcription?.transport === 'audio-chat') !== !!options.recognition
    ) {
      setState((value) => ({ ...value, error: 'model' }));
      return;
    }
    if (owner.current.proposal?.receipt && !state.accepted) return;
    runRecognitionCommand(owner, setState, async (signal) => {
      const lifetime = owner.current;
      const job = await prepareProjectRecognition(
        access,
        options,
        signal,
        lifetime.proposal ? undefined : lifetime.job
      );
      lifetime.job = job;
      lifetime.proposal = null;
      setState((value) => ({
        ...value,
        proposal: null,
        accepted: false,
        completed: 0,
        total: job.chunks.length,
      }));
      const proposal = await runProjectRecognition(access, job, signal, (completed, total) => {
        if (owner.current === lifetime && lifetime.mounted)
          setState((value) => ({ ...value, completed, total }));
      });
      signal.throwIfAborted();
      if (owner.current !== lifetime) return;
      lifetime.proposal = proposal;
      setState((value) => ({ ...value, proposal }));
    });
  };
  const apply = (mode: 'add' | 'replace') => {
    const proposal = owner.current.proposal;
    if (!proposal || state.accepted) return;
    runRecognitionCommand(
      owner,
      setState,
      async (signal) => {
        const lease = history.begin({ onlyIfIdle: true });
        if (!lease) throw new Error('stale');
        // Seal one local edit before awaiting storage; unrelated gestures must not join this action.
        const applyAccess = {
          ...access,
          update: (updater: Parameters<typeof updateProject>[0]) => {
            try {
              updateProject(updater);
            } finally {
              history.end(lease);
            }
          },
        };
        try {
          await applyProjectRecognition(applyAccess, proposal, signal, mode);
          setState((value) => ({ ...value, accepted: true }));
        } finally {
          history.end(lease);
        }
      },
      true
    );
  };
  const edit = (id: string, text: string) => {
    const proposal = owner.current.proposal;
    if (!proposal || proposal.receipt || state.running || state.accepted) return;
    const result = editReviewTextFragment(proposal.entry.document, id, { text });
    if (!result.ok) return;
    const edited = { ...proposal, entry: { ...proposal.entry, document: result.document } };
    owner.current.proposal = edited;
    setState((value) => ({ ...value, proposal: edited }));
  };
  const discard = () => {
    if (owner.current.active) return;
    owner.current.proposal = null;
    owner.current.job = undefined;
    setState(initial);
  };
  return {
    ...state,
    catalog,
    loadModels,
    recognize,
    apply,
    edit,
    discard,
    cancel: () => {
      if (!state.applying) owner.current.active?.abort();
    },
  };
}
export type VideoProjectRecognitionController = ReturnType<typeof useVideoProjectRecognition>;
