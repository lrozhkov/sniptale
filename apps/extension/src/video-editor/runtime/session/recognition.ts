import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { VideoProject } from '../../../features/video/project/types/model';
import { editReviewTextFragment } from '../../../features/video/review/text-document';
import { useAIScenarioModelSelection } from '../../../workflows/ai-settings/use-scenario-model-selection';
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
      jobBinding: '',
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
  const selection = useAIScenarioModelSelection('video-transcription');
  const catalog = selection.configuration;
  const access = {
    getProject: getCurrentVideoEditorProjectSnapshot,
    save: () => waitForVideoEditorSave(lifetime.projectId),
    update: updateProject,
  };
  const recognize = (options: ProjectRecognitionOptions) => {
    if (owner.current.proposal?.receipt && !state.accepted) return;
    runRecognitionCommand(owner, setState, async (signal) => {
      const lifetime = owner.current;
      const admitted = await selection.prepareModelSelection(signal);
      const model = admitted.catalog.models.find((entry) => entry.id === admitted.modelId);
      const provider = admitted.catalog.providers.find((entry) => entry.id === model?.providerId);
      if (
        !model ||
        !provider?.destinationBinding ||
        admitted.modelId !== options.modelId ||
        provider.id !== options.approvedProviderId ||
        (model.audio?.transcription?.transport === 'audio-chat') !== !!options.recognition
      )
        throw new Error('model');
      const approvedSelection = {
        modelId: model.id,
        approvedProviderId: provider.id,
        approvedModelCode: model.modelCode,
        approvedDestination: provider.destinationBinding,
      };
      const binding = JSON.stringify([
        approvedSelection,
        model.audio?.transcription,
        model.capabilities?.features['word-timestamps'],
        model.capabilities?.features['segment-timestamps'],
      ]);
      const job = await prepareProjectRecognition(
        access,
        { ...options, approvedSelection },
        signal,
        !lifetime.proposal && lifetime.jobBinding === binding ? lifetime.job : undefined
      );
      lifetime.job = job;
      lifetime.jobBinding = binding;
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
    owner.current.jobBinding = '';
    setState(initial);
  };
  return {
    ...state,
    catalog,
    modelId: selection.modelId ?? '',
    configurationFailed: selection.configurationFailed,
    selectionFailed: selection.selectionFailed,
    selectionUnavailable: selection.selectionUnavailable,
    selectionPending: selection.selectionPending,
    setModelId(id: string | null) {
      if (!owner.current.mounted || owner.current.active || selection.selectionPending) return;
      selection.chooseModel(id);
    },
    loadModels: selection.retryConfiguration,
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
