import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import {
  loadScenarioPresentationSessionStorageValue,
  runScenarioPresentationSessionMutation,
  subscribeToScenarioPresentationSessionStorage,
  writeScenarioPresentationSessionStorageState,
} from './storage';
import { SCENARIO_PRESENTATION_SESSION_STATUS } from './types';
import type {
  ScenarioPresentationSessionPosition,
  ScenarioPresentationSessionState,
} from './types';
export { SCENARIO_PRESENTATION_SESSION_STATUS } from './types';
export type {
  ScenarioPresentationSessionPosition,
  ScenarioPresentationSessionState,
  ScenarioPresentationSessionStatus,
} from './types';

type ScenarioPresentationSessionListener = (state: ScenarioPresentationSessionState | null) => void;

export async function createScenarioPresentationSession(
  projectId: string,
  initialPosition: ScenarioPresentationSessionPosition,
  projectUpdatedAt: number
): Promise<ScenarioPresentationSessionState> {
  const state: ScenarioPresentationSessionState = {
    ...normalizeScenarioPresentationPosition(initialPosition),
    projectId,
    projectUpdatedAt,
    revision: 1,
    sessionId: createScenarioPresentationSessionId(),
    status: SCENARIO_PRESENTATION_SESSION_STATUS.active,
  };

  await writeScenarioPresentationSessionStorageState(state);
  return state;
}

export async function updateScenarioPresentationPosition(
  sessionId: string,
  position: ScenarioPresentationSessionPosition,
  projectUpdatedAt: number
): Promise<ScenarioPresentationSessionState> {
  return runScenarioPresentationSessionMutation(sessionId, async () => {
    const current = await loadScenarioPresentationSession(sessionId);
    if (!current) {
      throw new Error('Scenario presentation session was not found');
    }
    if (current.status === SCENARIO_PRESENTATION_SESSION_STATUS.ended) {
      return current;
    }

    const state: ScenarioPresentationSessionState = {
      ...current,
      ...normalizeScenarioPresentationPosition(position),
      projectUpdatedAt,
      revision: current.revision + 1,
      status: SCENARIO_PRESENTATION_SESSION_STATUS.active,
    };

    await writeScenarioPresentationSessionStorageState(state);
    return state;
  });
}

export async function endScenarioPresentationSession(sessionId: string): Promise<void> {
  await runScenarioPresentationSessionMutation(sessionId, async () => {
    const current = await loadScenarioPresentationSession(sessionId);
    if (!current || current.status === SCENARIO_PRESENTATION_SESSION_STATUS.ended) {
      return;
    }

    await writeScenarioPresentationSessionStorageState({
      ...current,
      revision: current.revision + 1,
      status: SCENARIO_PRESENTATION_SESSION_STATUS.ended,
    });
  });
}

export async function loadScenarioPresentationSession(
  sessionId: string
): Promise<ScenarioPresentationSessionState | null> {
  const value = await loadScenarioPresentationSessionStorageValue(sessionId);
  return parseScenarioPresentationSessionState(value);
}

export function subscribeToScenarioPresentationSession(
  sessionId: string,
  listener: ScenarioPresentationSessionListener
): () => void {
  let latestRevision = -1;

  return subscribeToScenarioPresentationSessionStorage(sessionId, (value) => {
    const nextState = parseScenarioPresentationSessionState(value);
    if (!nextState) {
      listener(null);
      return;
    }

    if (nextState.revision <= latestRevision) {
      return;
    }

    latestRevision = nextState.revision;
    listener(nextState);
  });
}

function createScenarioPresentationSessionId(): string {
  return createSecureRandomUuid(
    'Secure random values are unavailable for scenario presentation sessions'
  );
}

function normalizeScenarioPresentationPosition(
  position: ScenarioPresentationSessionPosition
): ScenarioPresentationSessionPosition {
  return {
    clickIndex: Math.max(0, Math.trunc(position.clickIndex)),
    slideId: position.slideId,
  };
}

function parseScenarioPresentationSessionState(
  value: unknown
): ScenarioPresentationSessionState | null {
  if (!isRecord(value)) {
    return null;
  }

  const status = value['status'];
  if (
    status !== SCENARIO_PRESENTATION_SESSION_STATUS.active &&
    status !== SCENARIO_PRESENTATION_SESSION_STATUS.ended
  ) {
    return null;
  }

  const clickIndex = value['clickIndex'];
  const projectId = value['projectId'];
  const projectUpdatedAt = value['projectUpdatedAt'];
  const revision = value['revision'];
  const sessionId = value['sessionId'];
  const slideId = value['slideId'];
  if (
    typeof clickIndex !== 'number' ||
    !Number.isFinite(clickIndex) ||
    typeof projectId !== 'string' ||
    typeof projectUpdatedAt !== 'number' ||
    !Number.isFinite(projectUpdatedAt) ||
    typeof revision !== 'number' ||
    !Number.isFinite(revision) ||
    typeof sessionId !== 'string' ||
    typeof slideId !== 'string'
  ) {
    return null;
  }

  return {
    clickIndex: Math.max(0, Math.trunc(clickIndex)),
    projectId,
    projectUpdatedAt,
    revision: Math.max(0, Math.trunc(revision)),
    sessionId,
    slideId,
    status,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
