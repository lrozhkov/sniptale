import { vi } from 'vitest';

interface ScenarioEditorSessionUrlMocks {
  readScenarioEditorProjectIdMock: ReturnType<typeof vi.fn>;
  readScenarioEditorStepIdMock: ReturnType<typeof vi.fn>;
}

const scenarioEditorSessionUrlMocks = vi.hoisted(() => {
  const mocks = {
    readScenarioEditorProjectIdMock: vi.fn(),
    readScenarioEditorStepIdMock: vi.fn(),
  };
  (
    globalThis as unknown as {
      __scenarioEditorSessionUrlMocks: ScenarioEditorSessionUrlMocks;
    }
  ).__scenarioEditorSessionUrlMocks = mocks;
  return mocks;
});

vi.mock('@sniptale/runtime-contracts/scenario-editor/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/runtime-contracts/scenario-editor/session')>()),
  readScenarioEditorPresentationSessionId: vi.fn(() => null),
  readScenarioEditorPresentationView: vi.fn(() => null),
  readScenarioEditorProjectId: scenarioEditorSessionUrlMocks.readScenarioEditorProjectIdMock,
  readScenarioEditorStepId: scenarioEditorSessionUrlMocks.readScenarioEditorStepIdMock,
}));

vi.mock('../../../platform/navigation/extension-pages/scenario-editor', () => ({
  buildScenarioEditorUrl: vi.fn(() => 'chrome-extension://test/scenario-editor?projectId=&stepId='),
}));

export function getScenarioEditorSessionUrlMocks(): ScenarioEditorSessionUrlMocks {
  return (
    globalThis as unknown as {
      __scenarioEditorSessionUrlMocks: ScenarioEditorSessionUrlMocks;
    }
  ).__scenarioEditorSessionUrlMocks;
}
