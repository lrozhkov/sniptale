// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../features/scenario/project/v3';
import { translate } from '../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioV3EditorShell } from './view';

const aiSelectionMock = vi.hoisted(() => ({
  requestAIModelSelectionBootstrap: vi.fn(),
}));
const runtimeMessagingMock = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn(),
}));
const legacyAiApplyMock = vi.hoisted(() => ({
  applyScenarioEditorAIResponse: vi.fn(),
}));

vi.mock('../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/ai-settings/query')>()),
  requestAIModelSelectionBootstrap: aiSelectionMock.requestAIModelSelectionBootstrap,
}));
vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  createRuntimeMessagingTransport: vi.fn(() => ({
    sendRuntimeMessage: runtimeMessagingMock.sendRuntimeMessage,
  })),
  sendRuntimeMessage: runtimeMessagingMock.sendRuntimeMessage,
}));
vi.mock('../project/ai/response-apply/response/apply', () => ({
  applyScenarioEditorAIResponse: legacyAiApplyMock.applyScenarioEditorAIResponse,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createShellProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Demo scenario');
  return {
    ...project,
    slides: [{ ...project.slides[0]!, id: 'slide-1', title: 'Intro' }],
  };
}

function renderShell(project = createShellProject()) {
  const onProjectChange = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ScenarioV3EditorShell project={project} onProjectChange={onProjectChange} />);
  });

  return { onProjectChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  aiSelectionMock.requestAIModelSelectionBootstrap.mockResolvedValue({
    defaultModelId: 'model-1',
    models: [],
    providers: [],
  });
});

function mockLlmRuntimeResponse(response: unknown) {
  runtimeMessagingMock.sendRuntimeMessage.mockImplementation(async (message: { type: string }) =>
    message.type === MessageType.REQUEST_LLM_SESSION
      ? { success: true, token: 'llm-session-token-1' }
      : response
  );
}

async function expectSuccessfulAiEdit(onProjectChange: ReturnType<typeof vi.fn>) {
  await vi.waitFor(() => {
    expect(runtimeMessagingMock.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [],
        contractVersion: 3,
        selectedSlideCodeJson: expect.any(String),
        toolManifestJson: expect.any(String),
      })
    );
  });
  expect(legacyAiApplyMock.applyScenarioEditorAIResponse).not.toHaveBeenCalled();
  await vi.waitFor(() => {
    expect(onProjectChange).toHaveBeenCalledWith(
      expect.objectContaining({
        slides: [expect.objectContaining({ title: 'AI title' })],
      })
    );
    expect(container?.textContent).toContain(translate('scenario.editor.aiOperationSlideTitle'));
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('scenario v3 editor shell AI panel', () => {
  it('applies v3 operations without using legacy step patches', async () => {
    const project = createShellProject();
    const { onProjectChange } = renderShell(project);
    mockLlmRuntimeResponse({
      operations: [{ slideId: 'slide-1', title: 'AI title', type: 'setSlideTitle' }],
      success: true,
    });

    clickButton(translate('scenario.editor.aiEditorTool'));
    await enterAiInstruction('Make this slide tighter');
    await clickButtonText(translate('scenario.editor.aiEditorSend'));

    await expectSuccessfulAiEdit(onProjectChange);
  });

  it('surfaces invalid AI operations and leaves the v3 project unchanged', async () => {
    const { onProjectChange } = renderShell();
    mockLlmRuntimeResponse({
      operations: [{ slideId: 'missing', title: 'Nope', type: 'setSlideTitle' }],
      success: true,
    });

    clickButton(translate('scenario.editor.aiEditorTool'));
    await enterAiInstruction('Use a missing slide');
    await clickButtonText(translate('scenario.editor.aiEditorSend'));

    expect(onProjectChange).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
        translate('scenario.editor.aiEditorInvalidResponse')
      );
    });
  });
});

function clickButton(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  act(() => {
    button?.click();
  });
}

async function clickButtonText(text: string) {
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const button = buttons.find((candidate) => candidate.textContent?.trim() === text);
  expect(button).not.toBeNull();
  await act(async () => button?.click());
}

async function enterAiInstruction(value: string) {
  const textarea = container?.querySelector<HTMLTextAreaElement>(
    '[data-ui="scenario.editor.ai-panel"] textarea'
  );
  expect(textarea).not.toBeNull();
  await act(async () => {
    if (!textarea) {
      throw new Error('Expected AI instruction field');
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}
