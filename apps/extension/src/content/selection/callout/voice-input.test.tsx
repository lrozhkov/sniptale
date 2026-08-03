// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  VoiceInputPortMessageType,
  type VoiceInputServerEvent,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputClient, VoiceInputClientListener } from '../../../workflows/voice-input';

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: vi.fn(async () => ({
    voiceInput: { language: 'en-US', microphoneDeviceId: null, mode: 'browser-managed' },
  })),
}));

import { useCalloutVoiceInput } from './voice-input';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof useCalloutVoiceInput> | null = null;
let listeners: Set<VoiceInputClientListener>;
let client: VoiceInputClient;
const onContentChange = vi.fn();

function Harness(props: { isEditing: boolean }) {
  const contentEditableRef = React.useRef<HTMLDivElement | null>(null);
  latest = useCalloutVoiceInput({
    contentEditableRef,
    createClient: () => client,
    isEditing: props.isEditing,
    onContentChange,
  });
  return (
    <div
      ref={contentEditableRef}
      contentEditable={props.isEditing}
      data-ui="editable"
      suppressContentEditableWarning
    >
      Before after
    </div>
  );
}

function emit(event: VoiceInputServerEvent): void {
  act(() => {
    for (const listener of listeners) listener(event);
  });
}

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

beforeEach(() => {
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
  onContentChange.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  latest = null;
});

it('streams transcript at the captured caret and stops when editing ends', async () => {
  act(() => root?.render(<Harness isEditing />));
  const editable = container?.querySelector<HTMLDivElement>('[data-ui="editable"]');
  const textNode = editable?.firstChild;
  if (!editable || !textNode) throw new Error('Expected editable fixture');
  const range = document.createRange();
  range.setStart(textNode, 7);
  range.collapse(true);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);

  await act(async () => {
    latest?.actions.start();
    await Promise.resolve();
  });
  emit({
    confidence: 0.8,
    isFinal: false,
    sequence: 0,
    sessionId: 'session-1',
    text: 'spoken',
    type: VoiceInputPortMessageType.TRANSCRIPT,
  });

  expect(editable.textContent).toBe('Before spoken after');
  expect(onContentChange).toHaveBeenLastCalledWith('Before spoken after');

  act(() => root?.render(<Harness isEditing={false} />));
  expect(client.stop).toHaveBeenCalledWith('session-1');
});
