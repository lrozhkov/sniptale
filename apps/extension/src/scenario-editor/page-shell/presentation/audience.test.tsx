// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadSessionMock, subscribeSessionMock } = vi.hoisted(() => ({
  loadSessionMock: vi.fn(),
  subscribeSessionMock: vi.fn(),
}));

vi.mock('./session', () => ({
  ScenarioPresentationSessionPosition: undefined,
  ScenarioPresentationSessionState: undefined,
  ScenarioPresentationSessionStatus: undefined,
  SCENARIO_PRESENTATION_SESSION_STATUS: {
    active: 'active',
    ended: 'ended',
  },
  createScenarioPresentationSession: vi.fn(),
  endScenarioPresentationSession: vi.fn(),
  loadScenarioPresentationSession: loadSessionMock,
  subscribeToScenarioPresentationSession: subscribeSessionMock,
  updateScenarioPresentationPosition: vi.fn(),
}));

import {
  createScenarioProjectV3,
  createScenarioSlide,
} from '../../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioAudiencePresentationPage } from './audience';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let sessionListener: ((state: Awaited<ReturnType<typeof createSession>>) => void) | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  sessionListener = null;
  loadSessionMock.mockReset();
  subscribeSessionMock.mockReset();
  subscribeSessionMock.mockImplementation((_sessionId, listener) => {
    sessionListener = listener;
    return vi.fn();
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('ScenarioAudiencePresentationPage', () => {
  it('renders a clean read-only play surface for the active session', async () => {
    const project = createProject();
    loadSessionMock.mockResolvedValue(createSession({ slideId: 'slide-1', clickIndex: 1 }));

    await renderAudience(project, 'session-1');

    expect(container?.querySelector('[data-ui="scenario.editor.v3.audience"]')).not.toBeNull();
    expect(container?.querySelector('button')).toBeNull();
    expect(container?.textContent).not.toContain('scenario.editor.notes');
    expect(container?.querySelector('[data-click-index="1"]')).not.toBeNull();
  });

  it('updates the visible slide and click step from session storage changes', async () => {
    const project = createProject();
    loadSessionMock.mockResolvedValue(createSession({ slideId: 'slide-1', clickIndex: 0 }));

    await renderAudience(project, 'session-1');
    expect(container?.querySelector('[data-click-index="0"]')).not.toBeNull();

    await act(async () => {
      sessionListener?.(createSession({ slideId: 'slide-2', clickIndex: 2, revision: 2 }));
      await flushEffects();
    });

    expect(container?.querySelector('[data-click-index="2"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="scenario.editor.v3.audience-waiting"]')).toBeNull();
  });

  it('shows the waiting state for a missing or ended session', async () => {
    const project = createProject();
    loadSessionMock.mockResolvedValue(null);

    await renderAudience(project, 'missing-session');

    expect(
      container?.querySelector('[data-ui="scenario.editor.v3.audience-waiting"]')
    ).not.toBeNull();

    await act(async () => {
      sessionListener?.(createSession({ status: 'ended' }));
      await flushEffects();
    });

    expect(
      container?.querySelector('[data-ui="scenario.editor.v3.audience-waiting"]')
    ).not.toBeNull();
  });
});

async function renderAudience(project: ScenarioProjectV3, sessionId: string | null) {
  await act(async () => {
    root?.render(
      <ScenarioAudiencePresentationPage
        project={project}
        reloadProject={vi.fn()}
        sessionId={sessionId}
      />
    );
    await flushEffects();
  });
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function createProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Audience deck');
  return {
    ...project,
    id: 'project-1',
    slides: [
      createScenarioSlide({
        clicks: { count: 2, initialIndex: 0 },
        id: 'slide-1',
        title: 'First',
      }),
      createScenarioSlide({
        clicks: { count: 2, initialIndex: 0 },
        id: 'slide-2',
        title: 'Second',
      }),
    ],
  };
}

function createSession(
  patch: Partial<{
    clickIndex: number;
    projectId: string;
    projectUpdatedAt: number;
    revision: number;
    sessionId: string;
    slideId: string;
    status: 'active' | 'ended';
  }> = {}
) {
  return {
    clickIndex: 0,
    projectId: 'project-1',
    projectUpdatedAt: 1,
    revision: 1,
    sessionId: 'session-1',
    slideId: 'slide-1',
    status: 'active' as const,
    ...patch,
  };
}
