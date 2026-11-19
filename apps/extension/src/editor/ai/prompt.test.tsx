// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ImagePrompt } from './prompt';

const voice = vi.hoisted(() => ({
  transcript: (_: { text: string; sequence: number; isFinal: boolean }) => {},
  state: {
    active: false,
    pending: false,
    audioLevel: 0,
    phase: 'idle',
    errorCode: null as 'runtime' | null,
  },
  actions: { start: vi.fn(async () => {}), stop: vi.fn(), cancel: vi.fn() },
  start: () => {},
}));
vi.mock('../../composition/voice-input/session', () => ({
  useVoiceInputSession: (options: { onTranscript: typeof voice.transcript }) => {
    voice.transcript = options.onTranscript;
    return voice;
  },
}));
vi.mock('../../composition/voice-input/button', () => ({
  VoiceInputButton: (props: {
    onStart(): void;
    onStop(): void;
    onCancel(): void;
    disabled: boolean;
  }) => {
    voice.start = props.onStart;
    return (
      <>
        <button disabled={props.disabled} onClick={props.onStart}>
          start
        </button>
        <button data-voice-command="stop" onClick={props.onStop}>
          stop
        </button>
        <button data-voice-command="cancel" onClick={props.onCancel}>
          cancel
        </button>
      </>
    );
  },
}));
let host: HTMLDivElement, root: Root;
let value: string, operationId: string, disabled: boolean;
const change = vi.fn((next: string) => {
  value = next;
  draw();
});
function draw() {
  root.render(
    <ImagePrompt
      operationId={operationId}
      value={value}
      refining={false}
      voiceDisabled={disabled}
      onChange={change}
    />
  );
}
const field = () => host.querySelector('textarea')!;
async function render() {
  await act(async () => draw());
}
async function start(start = 0, end = start) {
  field().focus();
  field().setSelectionRange(start, end);
  await act(async () => voice.start());
}
async function transcript(text: string, sequence: number, isFinal = true) {
  await act(async () => voice.transcript({ text, sequence, isFinal }));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  Object.assign(voice.state, { active: false, pending: false, errorCode: null });
  value = '';
  operationId = 'first';
  disabled = false;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('inserts dictated text at the selection and rejects duplicate or interim chunks', async () => {
  value = 'leftOLDright';
  await render();
  await start(4, 7);
  await transcript('ignored interim', 1, false);
  expect(value).toBe('leftOLDright');
  await transcript('  spoken  ', 2);
  expect(value).toBe('left spoken right');
  expect(field().selectionStart).toBe(11);
  await transcript('duplicate', 2);
  expect(value).toBe('left spoken right');
  await transcript('next', 3);
  expect(value).toBe('left spoken next right');
  await transcript('   ', 4);
  expect(value).toBe('left spoken next right');
});

it('retains the 4000-character limit and inserts without unnecessary edge spaces', async () => {
  value = ' x ';
  await render();
  await start(0);
  await transcript('first', 0);
  expect(value).toBe('first x ');
  value = 'a'.repeat(3998);
  await render();
  await start(3998);
  await transcript('bcdef', 1);
  expect(value).toHaveLength(4000);
  expect(value.endsWith(' b')).toBe(true);
  await transcript('more', 2);
  expect(value).toHaveLength(4000);
  value = '';
  await render();
  await start();
  await transcript('empty', 0);
  expect(value).toBe('empty');
});

it('ignores late text after manual edits, task changes, disabling, cancellation and leaving the field', async () => {
  await render();
  await start();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      field(),
      'manual'
    );
    field().dispatchEvent(new Event('input', { bubbles: true }));
  });
  await transcript('late', 1);
  expect(value).toBe('manual');
  await start();
  operationId = 'second';
  await render();
  await transcript('old task', 2);
  expect(value).toBe('manual');
  await start();
  disabled = true;
  await render();
  await transcript('disabled', 3);
  expect(value).toBe('manual');
  await act(async () => voice.start());
  expect(voice.actions.start).toHaveBeenCalledTimes(3);
  disabled = false;
  await render();
  await start();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-voice-command="cancel"]')!.click()
  );
  await transcript('cancelled', 4);
  expect(value).toBe('manual');
  await start();
  await act(async () => field().blur());
  await transcript('blurred', 5);
  expect(value).toBe('manual');
  expect(voice.actions.cancel).toHaveBeenCalled();
});

it('clears the prompt and cancels the current insertion before accepting new dictation', async () => {
  value = 'draft';
  await render();
  await start();
  const cancellations = voice.actions.cancel.mock.calls.length;
  await act(async () => host.querySelector<HTMLButtonElement>('.sniptale-field-clear')!.click());
  expect(voice.actions.cancel).toHaveBeenCalledTimes(cancellations + 1);
  expect(value).toBe('');
  expect(document.activeElement).toBe(field());
  await transcript('late', 1);
  expect(value).toBe('');
  await start();
  await transcript('new dictation', 2);
  expect(value).toBe('new dictation');
});

it('does not restart an active or pending session and reports the shared voice failure', async () => {
  await render();
  voice.state.active = true;
  await render();
  await start();
  voice.state.active = false;
  voice.state.pending = true;
  await render();
  await start();
  expect(voice.actions.start).not.toHaveBeenCalled();
  voice.state.pending = false;
  voice.state.errorCode = 'runtime';
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-voice-command="stop"]')!.click()
  );
  expect(voice.actions.stop).toHaveBeenCalledOnce();
});
