import { useEffect, useRef, useState } from 'react';
import type { GuideProject, GuideStep } from '@sniptale/runtime-contracts/scenario/types/guide';
import { applyGuideAiProposal, type GuideAiScope } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import {
  GuideAiStaleError,
  loadGuideAiConfiguration,
  requestGuideAiProposal,
  verifyGuideAiBasis,
} from './runtime/ai-request';

type GuideAiMode = 'block' | 'step' | 'steps' | 'all';

type Proposal = Awaited<ReturnType<typeof requestGuideAiProposal>> & {
  project: GuideProject;
  scope: GuideAiScope;
};

type GuideAiSessionInput = {
  project: GuideProject;
  selectedStepId: string | null;
  selectedBlockId: string | null;
  onChange: (project: GuideProject) => void;
  onClose: () => void;
  t: Translate;
};

/** Owns one disposable AI request and its explicitly accepted proposal. */
export function useGuideAiSession(input: GuideAiSessionInput) {
  const { project, selectedStepId, selectedBlockId, onChange, onClose, t } = input;
  const latest = useRef(project);
  latest.current = project;
  const job = useRef<AbortController | null>(null);
  const { configuration, configurationFailed, modelId, setModelId, retryConfiguration } =
    useAiConfiguration();
  const [instruction, setInstruction] = useState(t('scenario.editor.guideAiClarifyInstruction'));
  const selection = useAiSelection({
    project,
    selectedStepId,
    selectedBlockId,
    isLocked: () => job.current !== null,
  });
  const { scope, imageCount } = selection;
  const [includeImages, setIncludeImages] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<'request' | 'stale' | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  useEffect(
    () => () => {
      job.current?.abort();
      job.current = null;
    },
    []
  );
  const run = async (apply: boolean) => {
    if (job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setPending(true);
    setFailure(null);
    const basis = apply && proposal ? proposal.project : project;
    try {
      if (apply && proposal) {
        await verifyGuideAiBasis(basis, controller.signal, proposal.baseRevision);
        controller.signal.throwIfAborted();
        if (job.current !== controller) return;
        if (latest.current !== basis) throw new GuideAiStaleError();
        const next = applyGuideAiProposal(
          basis,
          proposal.scope,
          proposal.changes
            .filter((_, index) => accepted.has(index))
            .map((change) => change.operation)
        );
        onChange(next);
        onClose();
      } else {
        if (!modelId || !instruction.trim()) return;
        const result = await requestGuideAiProposal({
          project: basis,
          scope,
          instruction,
          modelId,
          includeImages: includeImages && imageCount > 0,
          signal: controller.signal,
        });
        if (job.current !== controller) return;
        if (latest.current !== basis) throw new GuideAiStaleError();
        const changes = result.changes.filter((change) => change.before !== change.after);
        setProposal({ ...result, changes, project: basis, scope });
        setAccepted(new Set(changes.map((_, index) => index)));
      }
    } catch (error) {
      if (job.current === controller && !controller.signal.aborted)
        setFailure(error instanceof GuideAiStaleError ? 'stale' : 'request');
    } finally {
      if (job.current === controller) {
        job.current = null;
        setPending(false);
      }
    }
  };
  const cancel = () => {
    job.current?.abort();
    job.current = null;
    setPending(false);
  };
  const chooseChange = (index: number, checked: boolean) => {
    if (job.current) return;
    setAccepted((current) => {
      const next = new Set(current);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  };
  const editRequest = () => {
    setProposal(null);
    setFailure(null);
  };
  return {
    ...selection,
    configuration,
    configurationFailed,
    modelId,
    instruction,
    includeImages,
    pending,
    failure,
    proposal,
    accepted,
    run,
    cancel,
    chooseChange,
    editRequest,
    retryConfiguration,
    chooseModel: (value: string | null) => setModelId(value),
    writeInstruction: (value: string) => setInstruction(value),
    chooseImages: (value: boolean) => setIncludeImages(value),
  };
}

function useAiConfiguration() {
  const [configuration, setConfiguration] = useState<Awaited<
    ReturnType<typeof loadGuideAiConfiguration>
  > | null>(null);
  const [configurationFailed, setConfigurationFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [modelId, setModelId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setConfigurationFailed(false);
    void loadGuideAiConfiguration()
      .then((value) => {
        if (active) {
          setConfiguration(value);
          setModelId(value.defaultModelId);
        }
      })
      .catch(() => {
        if (active) setConfigurationFailed(true);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  return {
    configuration,
    configurationFailed,
    modelId,
    setModelId,
    retryConfiguration: () => setReload((value) => value + 1),
  };
}

/** Resolves the explicit selection in document order before either counting images or dispatching. */
function resolveScope({
  mode,
  steps,
  stepIds,
  selectedStepId,
  selectedBlockId,
}: {
  mode: GuideAiMode;
  steps: GuideStep[];
  stepIds: string[];
  selectedStepId: string | null;
  selectedBlockId: string | null;
}): GuideAiScope {
  if (mode === 'all')
    return { stepIds: steps.map((step) => step.id), blockIds: [], document: true };
  if (mode === 'steps')
    return {
      stepIds: steps.filter((step) => stepIds.includes(step.id)).map((step) => step.id),
      blockIds: [],
    };
  return {
    stepIds: selectedStepId ? [selectedStepId] : [],
    blockIds: mode === 'block' && selectedBlockId ? [selectedBlockId] : [],
  };
}

/** Owns the picker selection separately from request execution; the live lock fences pending changes. */
function useAiSelection({
  project,
  selectedStepId,
  selectedBlockId,
  isLocked,
}: {
  project: GuideProject;
  selectedStepId: string | null;
  selectedBlockId: string | null;
  isLocked: () => boolean;
}) {
  const [mode, setMode] = useState<GuideAiMode>(
    selectedBlockId ? 'block' : selectedStepId ? 'step' : 'all'
  );
  const steps = project.items.filter((item) => item.kind === 'step');
  const [stepIds, setStepIds] = useState<string[]>(
    selectedStepId ? [selectedStepId] : steps[0] ? [steps[0].id] : []
  );
  const scope = resolveScope({ mode, steps, stepIds, selectedStepId, selectedBlockId });
  const imageCount = steps
    .filter((step) => scope.stepIds.includes(step.id))
    .flatMap((step) => step.blocks)
    .filter(
      (block) =>
        block.kind === 'image' && (!scope.blockIds.length || scope.blockIds.includes(block.id))
    ).length;
  const chooseSteps = (ids: string[], checked: boolean) => {
    if (isLocked()) return;
    setStepIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked && steps.some((step) => step.id === id)) next.add(id);
        else if (!checked) next.delete(id);
      }
      return steps.filter((step) => next.has(step.id)).map((step) => step.id);
    });
  };
  const chooseStep = (id: string, checked: boolean) => chooseSteps([id], checked);
  return {
    mode,
    steps,
    stepIds,
    scope,
    imageCount,
    chooseStep,
    chooseSteps,
    chooseMode: (value: GuideAiMode) => {
      if (!isLocked()) setMode(value);
    },
  };
}
