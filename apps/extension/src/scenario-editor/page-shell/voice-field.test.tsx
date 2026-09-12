// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VoiceInputServerEvent } from '@sniptale/runtime-contracts/voice-input';
const io = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  change: vi.fn(),
  transcript: null as
    | null
    | ((event: Extract<VoiceInputServerEvent, { type: 'VOICE_INPUT_TRANSCRIPT' }>) => void),
}));
vi.mock('../../composition/voice-input/session', () => ({
  useVoiceInputSession: (args: { onTranscript: typeof io.transcript }) => {
    io.transcript = args.onTranscript;
    return {
      actions: { start: io.start, stop: io.stop },
      state: { active: false, audioLevel: 0, phase: 'idle', errorCode: null },
    };
  },
}));
vi.mock('../../composition/voice-input/button', () => ({
  VoiceInputButton: (props: { disabled: boolean; onStart(): void; onStop(): void }) => (
    <>
      <button disabled={props.disabled} onClick={props.onStart}>
        Start
      </button>
      <button disabled={props.disabled} onClick={props.onStop}>
        Stop
      </button>
    </>
  ),
}));
import { GuideVoiceField } from './voice-field';
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function Editor({
  disabled = false,
  clearable = false,
  maxLength = 100,
  singleLine = false,
  initialValue = 'hello world',
}: {
  disabled?: boolean;
  clearable?: boolean;
  maxLength?: number;
  singleLine?: boolean;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <GuideVoiceField
      aria-label="Body"
      value={value}
      clearable={clearable}
      disabled={disabled}
      maxLength={maxLength}
      singleLine={singleLine}
      onValueChange={(next) => {
        io.change(next);
        setValue(next);
      }}
    />
  );
}
async function mount(props = {}) {
  await act(async () => root.render(<Editor {...props} />));
}
function field() {
  return host.querySelector('textarea, input') as HTMLTextAreaElement;
}
async function click(label: string) {
  await act(async () =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === label)!.click()
  );
}
async function transcript(text: string, sequence = 1, isFinal = true) {
  await act(async () =>
    io.transcript?.({
      type: 'VOICE_INPUT_TRANSCRIPT',
      sessionId: 'session',
      confidence: 1,
      text,
      sequence,
      isFinal,
    })
  );
}
it('replaces the captured selection and appends final segments through the controlled change callback', async () => {
  await mount();
  field().setSelectionRange(6, 11);
  await click('Start');
  expect(document.activeElement).toBe(field());
  await transcript('voice');
  expect(field().value).toBe('hello voice');
  expect(field().selectionStart).toBe(11);
  await transcript(' text', 2);
  expect(field().value).toBe('hello voice text');
  expect(io.start).toHaveBeenCalledOnce();
  expect(io.change).toHaveBeenCalledTimes(2);
});
it('ignores interim and duplicate transcripts and respects the field limit', async () => {
  await mount({ maxLength: 12 });
  field().setSelectionRange(6, 11);
  await click('Start');
  await transcript('draft', 1, false);
  expect(io.change).not.toHaveBeenCalled();
  await transcript('long transcript', 1);
  expect(field().value).toBe('hello long t');
  await transcript('duplicate', 1);
  expect(io.change).toHaveBeenCalledOnce();
});
it('stops on leaving the field and rejects late final text', async () => {
  await mount();
  await act(async () => field().focus());
  await click('Start');
  await act(async () => field().blur());
  await transcript('late');
  expect(io.stop).toHaveBeenCalled();
  expect(io.change).not.toHaveBeenCalled();
});
it('stops when disabled and prevents new text or recording', async () => {
  await mount();
  await click('Start');
  await mount({ disabled: true });
  await transcript('late');
  expect(io.stop).toHaveBeenCalled();
  expect(io.change).not.toHaveBeenCalled();
  await click('Start');
  expect(io.start).toHaveBeenCalledOnce();
});
it('honors explicit stop and collapses newlines in the project name', async () => {
  await mount({ singleLine: true });
  field().setSelectionRange(0, 11);
  await click('Start');
  await transcript('New\nname');
  expect(field().value).toBe('New name');
  await click('Stop');
  await transcript('late', 2);
  expect(field().value).toBe('New name');
});
it('tracks an explicitly moved caret during dictation', async () => {
  await mount();
  await click('Start');
  await act(async () => {
    field().focus();
    field().setSelectionRange(0, 5);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await transcript('Hi');
  expect(field().value).toBe('Hi world');
});

it.each([false, true])(
  'separates unspaced final chunks from existing text (singleLine=%s)',
  async (singleLine) => {
    await mount({ singleLine, initialValue: 'Привет' });
    field().setSelectionRange(6, 6);
    await click('Start');
    await transcript('мир');
    expect(field().value).toBe('Привет мир');
    await transcript('снова', 2);
    expect(field().value).toBe('Привет мир снова');
    expect(field().selectionStart).toBe(field().value.length);
  }
);
it.each([
  ['Hello ', 'world', 'Hello world'],
  ['Hello', ' world', 'Hello world'],
  ['Hello\n', 'world', 'Hello\nworld'],
  ['Hello.', 'World', 'Hello. World'],
  ['Hello', ', world', 'Hello, world'],
  ['(', 'word', '(word'],
])('preserves whitespace and punctuation for %j + %j', async (initialValue, spoken, expected) => {
  await mount({ initialValue });
  field().setSelectionRange(initialValue.length, initialValue.length);
  await click('Start');
  await transcript(spoken);
  expect(field().value).toBe(expected);
});
it('separates dictated words from both sides while keeping the caret before the following text', async () => {
  await mount({ initialValue: 'HelloWorld' });
  field().setSelectionRange(5, 5);
  await click('Start');
  await transcript('new');
  expect(field().value).toBe('Hello new World');
  expect(field().selectionStart).toBe(9);
  await transcript('beautiful', 2);
  expect(field().value).toBe('Hello new beautiful World');
});
it('counts inserted spaces toward the field limit and avoids a whitespace-only append', async () => {
  await mount({ initialValue: 'Hello', maxLength: 6 });
  field().setSelectionRange(5, 5);
  await click('Start');
  await transcript('world');
  expect(field().value).toBe('Hello');
  expect(io.change).not.toHaveBeenCalled();
  await mount({ initialValue: 'Hello', maxLength: 8 });
  await transcript('world', 2);
  expect(field().value).toBe('Hello wo');
});

it('clears the draft, restores focus and ignores late dictation', async () => {
  await mount({ clearable: true });
  await click('Start');
  const clear = host.querySelector('button[title]') as HTMLButtonElement;
  await act(async () => clear.click());
  expect(field().value).toBe('');
  expect(document.activeElement).toBe(field());
  expect(field().selectionStart).toBe(0);
  expect(io.stop).toHaveBeenCalled();
  await transcript('late result');
  expect(field().value).toBe('');
  expect(clear.disabled).toBe(true);
});
it('does not clear a disabled draft', async () => {
  await mount({ clearable: true, disabled: true });
  const clear = host.querySelector('button[title]') as HTMLButtonElement;
  expect(clear.disabled).toBe(true);
  await act(async () => clear.click());
  expect(field().value).toBe('hello world');
});
