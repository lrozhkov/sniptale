// @vitest-environment jsdom

import { act, useState, type Dispatch, type SetStateAction } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  VoiceInputPortMessageType,
  type VoiceInputServerEvent,
} from '@sniptale/runtime-contracts/voice-input';
import type {
  VoiceInputClient,
  VoiceInputClientListener,
} from '../../../../../workflows/voice-input';

vi.mock('../../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../composition/persistence/settings')>()),
  loadSettings: vi.fn(async () => ({
    voiceInput: { language: 'en-US', microphoneDeviceId: null, mode: 'browser-managed' },
  })),
}));

import { useAIModalPromptVoiceInput } from './prompt-voice-input';
import { createTemplateSelectHandler } from './selection';

let container: HTMLDivElement;
let root: Root;
let client: VoiceInputClient;
let listeners: Set<VoiceInputClientListener>;
let latest: ReturnType<typeof useAIModalPromptVoiceInput> | null;
let latestPrompt = '';
let latestSetPrompt: Dispatch<SetStateAction<string>> | null;

function Harness(props: { enabled: boolean }) {
  const [prompt, setPrompt] = useState('Before after');
  latestPrompt = prompt;
  latestSetPrompt = setPrompt;
  latest = useAIModalPromptVoiceInput({
    createClient: () => client,
    enabled: props.enabled,
    setPrompt,
  });
  return null;
}

function renderHarness(enabled: boolean) {
  act(() => root.render(<Harness enabled={enabled} />));
}

function emit(event: VoiceInputServerEvent) {
  act(() => listeners.forEach((listener) => listener(event)));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  listeners = new Set();
  client = {
    disconnect: vi.fn(),
    refresh: vi.fn(() => 'refresh-1'),
    start: vi.fn(() => 'session-1'),
    stop: vi.fn(() => 'stop-1'),
    subscribe: vi.fn((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  latest = null;
  latestPrompt = '';
  latestSetPrompt = null;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  renderHarness(true);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('streams the owning transcript into the prompt at the captured caret', async () => {
  await act(async () => latest?.actions.start('Before after', 7));

  emit({
    confidence: 0.8,
    isFinal: false,
    sequence: 0,
    sessionId: 'session-1',
    text: 'spoken',
    type: VoiceInputPortMessageType.TRANSCRIPT,
  });

  expect(latestPrompt).toBe('Before spoken after');
  expect(latest?.state.caretPosition).toBe(14);
});

it('stops the active session and rejects later transcript when the modal becomes unavailable', async () => {
  await act(async () => latest?.actions.start('Before after', 7));
  renderHarness(false);

  expect(client.stop).toHaveBeenCalledWith('session-1');
  expect(latest?.state.caretPosition).toBeNull();

  emit({
    confidence: 0.8,
    isFinal: true,
    sequence: 0,
    sessionId: 'session-1',
    text: 'ignored',
    type: VoiceInputPortMessageType.TRANSCRIPT,
  });

  expect(latestPrompt).toBe('Before after');
});

it('prevents a session started during template loading from overwriting the resolved template', async () => {
  let resolveTemplate!: (value: string) => void;
  const selection = createTemplateSelectHandler({
    selectTemplate: () =>
      new Promise((resolve) => {
        resolveTemplate = resolve;
      }),
    setPrompt: (nextPrompt) => latestSetPrompt?.(nextPrompt),
    stopVoiceInput: () => latest?.actions.stop(),
    textareaRef: { current: null },
  });
  const pendingSelection = selection({
    content: 'Template',
    id: 'template-1',
    name: 'Template 1',
  });

  await act(async () => latest?.actions.start(latestPrompt, 7));
  await act(async () => {
    resolveTemplate('Resolved template');
    await pendingSelection;
  });
  emit({
    confidence: 0.8,
    isFinal: true,
    sequence: 0,
    sessionId: 'session-1',
    text: 'late transcript',
    type: VoiceInputPortMessageType.TRANSCRIPT,
  });

  expect(client.stop).toHaveBeenCalledWith('session-1');
  expect(latestPrompt).toBe('Resolved template\n\nBefore after');
});
