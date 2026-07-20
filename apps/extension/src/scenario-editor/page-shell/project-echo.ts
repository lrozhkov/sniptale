import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioV3EditorSession } from './types';
import { createInitialEditorSession, keepReachableSelection } from './selection';

export interface ScenarioProjectEchoState {
  latestSequence: number;
  nextSequence: number;
  sequencesByKey: Map<string, number>;
}

export function createScenarioProjectEchoState(): ScenarioProjectEchoState {
  return {
    latestSequence: 0,
    nextSequence: 0,
    sequencesByKey: new Map(),
  };
}

export function rememberScenarioProjectEcho(
  state: ScenarioProjectEchoState,
  project: ScenarioProjectV3
) {
  const nextSequence = state.nextSequence + 1;
  state.nextSequence = nextSequence;
  state.latestSequence = nextSequence;
  state.sequencesByKey.set(createScenarioProjectEchoKey(project), nextSequence);
  trimScenarioProjectEchoState(state);
}

export function reconcileIncomingScenarioProject(args: {
  currentSession: ScenarioV3EditorSession;
  emittedProjectEchoState: ScenarioProjectEchoState;
  initialProject: ScenarioProjectV3;
  initialSlideId: string | null;
  previousInitialSlideId: string | null;
}): ScenarioV3EditorSession {
  const initialSlideChanged = args.previousInitialSlideId !== args.initialSlideId;
  if (initialSlideChanged && hasScenarioProjectSlide(args.initialProject, args.initialSlideId)) {
    return createInitialEditorSession(args.initialProject, args.initialSlideId);
  }
  if (args.currentSession.project === args.initialProject) {
    return args.currentSession;
  }
  const echoSequence = args.emittedProjectEchoState.sequencesByKey.get(
    createScenarioProjectEchoKey(args.initialProject)
  );
  if (echoSequence !== undefined) {
    if (
      echoSequence < args.emittedProjectEchoState.latestSequence &&
      args.currentSession.project !== args.initialProject
    ) {
      return args.currentSession;
    }
    return {
      ...args.currentSession,
      ...keepReachableSelection(args.currentSession, args.initialProject),
      project: args.initialProject,
    };
  }
  if (args.currentSession.project.id === args.initialProject.id) {
    return {
      ...args.currentSession,
      ...keepReachableSelection(args.currentSession, args.initialProject),
      project: args.initialProject,
    };
  }

  return createInitialEditorSession(args.initialProject, args.initialSlideId);
}

function trimScenarioProjectEchoState(state: ScenarioProjectEchoState): void {
  if (state.sequencesByKey.size <= 40) {
    return;
  }
  const minimumSequence = state.latestSequence - 20;
  for (const [key, sequence] of state.sequencesByKey) {
    if (sequence < minimumSequence) {
      state.sequencesByKey.delete(key);
    }
  }
}

function hasScenarioProjectSlide(project: ScenarioProjectV3, slideId: string | null): boolean {
  return slideId ? project.slides.some((slide) => slide.id === slideId) : false;
}

function createScenarioProjectEchoKey(project: ScenarioProjectV3): string {
  const slideFingerprint = project.slides
    .map((slide) => `${slide.id}:${slide.updatedAt}:${slide.elements.length}`)
    .join('|');
  return [
    project.id,
    project.updatedAt,
    project.slides.length,
    project.presentation.themeId,
    project.presentation.defaultLayoutId,
    slideFingerprint,
  ].join(':');
}
