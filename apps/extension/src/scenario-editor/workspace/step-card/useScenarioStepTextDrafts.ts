import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ScenarioStep,
  ScenarioStepPatch,
} from '../../../features/scenario/contracts/types/project';

type ScenarioStepTextDraft = { body: string; title: string };

function createStepTextDraft(step: ScenarioStep): ScenarioStepTextDraft {
  return { body: step.body, title: step.title };
}

function buildTextPatch(step: ScenarioStep, draft: { body: string; title: string }) {
  const patch: ScenarioStepPatch = {};
  if (draft.title !== step.title) {
    patch.title = draft.title;
  }
  if (draft.body !== step.body) {
    patch.body = draft.body;
  }
  return patch;
}

function scheduleDraftCommit(args: {
  commitDraft: () => void;
  draft: ScenarioStepTextDraft;
  draftRef: React.MutableRefObject<ScenarioStepTextDraft>;
  timerRef: React.MutableRefObject<number | null>;
}) {
  args.draftRef.current = args.draft;
  if (args.timerRef.current !== null) {
    window.clearTimeout(args.timerRef.current);
  }
  args.timerRef.current = window.setTimeout(args.commitDraft, 650);
}

function useScenarioStepDraftState(step: ScenarioStep) {
  const [draft, setDraft] = useState(() => createStepTextDraft(step));
  const stepRef = useRef(step);
  const draftRef = useRef(draft);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    stepRef.current = step;
    const nextDraft = createStepTextDraft(step);
    if (nextDraft.title !== draftRef.current.title || nextDraft.body !== draftRef.current.body) {
      setDraft(nextDraft);
    }
  }, [step]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  return { draft, draftRef, setDraft, stepRef, timerRef };
}

function useScenarioStepDraftCommit(args: {
  draftRef: React.MutableRefObject<ScenarioStepTextDraft>;
  onCommitPatch: (patch: ScenarioStepPatch) => void;
  stepRef: React.MutableRefObject<ScenarioStep>;
  timerRef: React.MutableRefObject<number | null>;
}) {
  const onCommitPatchRef = useRef(args.onCommitPatch);
  const commitDraftRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    onCommitPatchRef.current = args.onCommitPatch;
  }, [args.onCommitPatch]);

  const commitDraft = useCallback(() => {
    if (args.timerRef.current !== null) {
      window.clearTimeout(args.timerRef.current);
      args.timerRef.current = null;
    }
    const patch = buildTextPatch(args.stepRef.current, args.draftRef.current);
    if (Object.keys(patch).length > 0) {
      onCommitPatchRef.current(patch);
    }
  }, [args.draftRef, args.stepRef, args.timerRef]);

  useEffect(() => {
    commitDraftRef.current = commitDraft;
  }, [commitDraft]);

  useEffect(
    () => () => {
      commitDraftRef.current();
    },
    []
  );

  return commitDraft;
}

export function useScenarioStepTextDrafts(args: {
  onCommitPatch: (patch: ScenarioStepPatch) => void;
  step: ScenarioStep;
}) {
  const { onCommitPatch, step } = args;
  const { draft, draftRef, setDraft, stepRef, timerRef } = useScenarioStepDraftState(step);
  const commitDraft = useScenarioStepDraftCommit({
    draftRef,
    onCommitPatch,
    stepRef,
    timerRef,
  });

  const updateDraft = (key: 'body' | 'title', value: string) => {
    setDraft((current) => {
      const nextDraft = { ...current, [key]: value };
      scheduleDraftCommit({
        commitDraft,
        draft: nextDraft,
        draftRef,
        timerRef,
      });
      return nextDraft;
    });
  };

  return {
    body: draft.body,
    commitDraft,
    title: draft.title,
    updateBody: (body: string) => updateDraft('body', body),
    updateTitle: (title: string) => updateDraft('title', title),
  };
}
