// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Teleprompter } from './teleprompter';

vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));
let container: HTMLDivElement;
let root: Root;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

beforeEach(() => {
  container = document.createElement('div');
  container.setAttribute('data-recording-surface', '');
  document.body.append(container);
  root = createRoot(container);
  frames = new Map();
  nextFrame = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  act(() => root.render(<Teleprompter paused={false} />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
function button(key: string) {
  const element =
    container.querySelector<HTMLButtonElement>(`button[aria-label="popup.video.${key}"]`) ??
    [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === `popup.video.${key}`
    );
  if (!element) throw new Error(`Missing button ${key}`);
  return element;
}
function click(key: string) {
  act(() => button(key).click());
}
function start() {
  const resume = container.querySelector<HTMLButtonElement>(
    'button[aria-label="popup.video.teleprompterResume"]'
  );
  act(() => (resume ?? button('teleprompterPlay')).click());
}
function input(element: HTMLTextAreaElement | HTMLInputElement | undefined, text: string) {
  if (!element) throw new Error('Missing input');
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function read(script = 'Script\n'.repeat(100)) {
  const editor = container.querySelector('textarea');
  if (!editor) throw new Error('Missing script editor');
  input(editor, script);
  click('teleprompterRead');
  const reader = container.querySelector<HTMLDivElement>('[role="region"]');
  if (!reader) throw new Error('Missing script reader');
  Object.defineProperties(reader, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 200 },
  });
  setColumnHeight(reader, 1200);
  return reader;
}

it('puts playback in the header and keeps editing before settings without a visible title', () => {
  read();
  const header = container.querySelector('.camera-teleprompter-header')!;
  expect(header.querySelector('h2')).toBeNull();
  const names = [...header.querySelectorAll('button')].map((node) =>
    node.getAttribute('aria-label')
  );
  expect(names).toEqual([
    'popup.video.teleprompterPlay',
    'popup.video.teleprompterReset',
    'popup.video.teleprompterEdit',
    'popup.video.teleprompterSettings',
  ]);
  click('teleprompterSettings');
  expect(container.querySelectorAll('[role=switch]')).toHaveLength(1);
});
function setColumnHeight(reader: HTMLElement, height: number) {
  const column = reader.querySelector<HTMLElement>('[data-teleprompter-column]');
  if (!column) throw new Error('Missing reading column');
  Object.defineProperty(column, 'scrollHeight', { configurable: true, value: height });
}
function frame(timestamp: number) {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(timestamp);
  });
}
it('keeps the script as plain text and retains the editable draft', () => {
  expect(button('teleprompterRead').disabled).toBe(true);
  const script = '<img src=x onerror=alert(1)>\nSecond line';
  const reader = read(script);
  expect(reader.textContent).toBe(script);
  expect(reader.querySelector('img')).toBeNull();
  click('teleprompterEdit');
  expect(container.querySelector('textarea')?.value).toBe(script);
});
it('scrolls by elapsed time at the selected speed, stops at the end and resets', () => {
  const reader = read();
  start();
  frame(100);
  frame(1100);
  expect(reader.scrollTop).toBe(28);
  frame(1600);
  expect(reader.scrollTop).toBe(42);
  frame(30100);
  expect(reader.scrollTop).toBe(800);
  expect(frames.size).toBe(0);
  expect(button('teleprompterPlay').disabled).toBe(false);
  click('teleprompterReset');
  expect(reader.scrollTop).toBe(0);
  start();
  frame(31000);
  frame(32000);
  expect(reader.scrollTop).toBe(28);
});
it.each(['wheel', 'touchstart', 'pointerdown', 'keydown'])(
  'pauses for manual %s interaction and resumes from the new reading position',
  (eventType) => {
    const reader = read();
    start();
    frame(0);
    frame(1000);
    act(() =>
      reader.dispatchEvent(
        eventType === 'keydown'
          ? new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true })
          : new Event(eventType, { bubbles: true })
      )
    );
    expect(frames.size).toBe(0);
    reader.scrollTop = 200;
    start();
    frame(2000);
    frame(3000);
    expect(reader.scrollTop).toBe(228);
  }
);
it('suspends active reading with the recording and continues after record resume', () => {
  const reader = read();
  start();
  frame(0);
  frame(1000);
  act(() => root.render(<Teleprompter paused />));
  expect(frames.size).toBe(0);
  expect(button('teleprompterPlay').disabled).toBe(true);
  act(() => root.render(<Teleprompter paused={false} />));
  expect(button('teleprompterPause').disabled).toBe(false);
  frame(2000);
  frame(3000);
  expect(reader.scrollTop).toBe(56);
});
it('uses bounded speed and text size controls and stops while editing', () => {
  const reader = read();
  click('teleprompterSettings');
  const ranges = container.querySelectorAll('input');
  if (!ranges[0] || !ranges[1]) throw new Error('Missing reading range controls');
  input(ranges[0], '300');
  input(ranges[1], '72');
  expect(reader.style.fontSize).toBe('72px');
  start();
  frame(0);
  frame(1000);
  expect(reader.scrollTop).toBe(60);
  click('teleprompterEdit');
  expect(frames.size).toBe(0);
});
it('stops hidden readers without discarding the script', () => {
  read();
  start();
  container.hidden = true;
  frame(0);
  expect(frames.size).toBe(0);
  container.hidden = false;
  expect(button('teleprompterResume').disabled).toBe(false);
  expect(container.querySelector('[role="region"]')?.textContent).toContain('Script');
});
it('cancels outstanding frames when unmounted', () => {
  read();
  start();
  expect(frames.size).toBe(1);
  act(() => root.render(null));
  expect(frames.size).toBe(0);
});

it('pauses on host relocation and resumes from the retained reading position', () => {
  const reader = read();
  start();
  frame(0);
  frame(1000);
  expect(reader.scrollTop).toBe(28);

  act(() => container.dispatchEvent(new Event('sniptale-recording-surface-change')));

  expect(frames.size).toBe(0);
  expect(button('teleprompterResume').disabled).toBe(false);
  expect(reader.scrollTop).toBe(28);
  start();
  frame(2000);
  frame(3000);
  expect(reader.scrollTop).toBe(56);
});

it('keeps settings transient, retains chosen values and returns Escape focus to its trigger', () => {
  const reader = read();
  reader.scrollTop = 150;
  expect(container.querySelector('input[type="range"]')).toBeNull();
  const settings = button('teleprompterSettings');
  expect(settings.getAttribute('aria-expanded')).toBe('false');
  click('teleprompterSettings');
  expect(settings.getAttribute('aria-expanded')).toBe('true');
  const ranges = container.querySelectorAll('input');
  input(ranges[0], '65');
  input(ranges[1], '48');
  expect(reader.style.fontSize).toBe('48px');
  const panel = container.querySelector<HTMLElement>('[popover]');
  expect(panel?.style.width).toBe('280px');
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.activeElement).toBe(settings);
  expect(container.querySelector('input[type=range]')).toBeNull();
  expect(reader.scrollTop).toBe(150);
  click('teleprompterSettings');
  expect(
    [...container.querySelectorAll<HTMLInputElement>('input[type=range]')]
      .slice(0, 2)
      .map((element) => element.value)
  ).toEqual(['65', '48']);
  click('teleprompterSettings');
  expect(container.querySelector('[popover]')).toBeNull();
});
it('closes settings after native light dismissal without moving destination focus', () => {
  click('teleprompterSettings');
  const panel = container.querySelector<HTMLElement>('[popover]');
  const destination = document.createElement('button');
  document.body.append(destination);
  destination.focus();
  act(() => {
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', { value: 'closed' });
    panel?.dispatchEvent(event);
  });
  expect(container.querySelector('[popover]')).toBeNull();
  expect(document.activeElement).toBe(destination);
  destination.remove();
});

it('positions and dismisses settings in the document that owns the relocated surface', () => {
  const frameElement = document.createElement('iframe');
  document.body.append(frameElement);
  const ownerDocument = frameElement.contentDocument;
  const ownerWindow = frameElement.contentWindow;
  if (!ownerDocument || !ownerWindow) throw new Error('Missing relocated surface window');
  Object.defineProperty(ownerWindow, 'innerWidth', { value: 220 });
  Object.defineProperty(ownerWindow, 'innerHeight', { value: 160 });
  ownerDocument.body.append(container);
  click('teleprompterSettings');
  expect(container.querySelector<HTMLElement>('[popover]')?.style.width).toBe('204px');
  const focusTrigger = vi.spyOn(button('teleprompterSettings'), 'focus');
  act(() =>
    ownerDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(container.querySelector('[popover]')).toBeNull();
  expect(focusTrigger).toHaveBeenCalledWith({ preventScroll: true });
  frameElement.remove();
});

it('closes open settings when the host pauses and allows reopening during a stable pause', () => {
  click('teleprompterSettings');
  expect(container.querySelector('[popover]')).not.toBeNull();
  act(() => root.render(<Teleprompter paused />));
  expect(container.querySelector('[popover]')).toBeNull();
  expect(button('teleprompterSettings').getAttribute('aria-expanded')).toBe('false');
  click('teleprompterSettings');
  expect(container.querySelector('[popover]')).not.toBeNull();
  expect(button('teleprompterSettings').getAttribute('aria-expanded')).toBe('true');
});

function choosePlayback(mode: 'manual' | 'recording') {
  click('teleprompterSettings');
  click(mode === 'recording' ? 'teleprompterWithRecording' : 'teleprompterManual');
  click('teleprompterSettings');
}
function setReaderGeometry(reader: HTMLDivElement, height = 1000) {
  setColumnHeight(reader, 1200);
  Object.defineProperties(reader, {
    scrollHeight: { configurable: true, value: height },
    clientHeight: { configurable: true, value: 200 },
    clientWidth: { configurable: true, value: 900 },
  });
}
it('starts fresh automatic recordings, follows record pause and retains manual hold until Continue', () => {
  input(container.querySelector('textarea') ?? undefined, 'Automatic script\n'.repeat(100));
  choosePlayback('recording');
  act(() => root.render(<Teleprompter paused recordingId="rec-1" />));
  expect(container.querySelector('textarea')).not.toBeNull();
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-1" />));
  const reader = container.querySelector<HTMLDivElement>('[role=region]');
  if (!reader) throw new Error('Missing automatic reader');
  setReaderGeometry(reader);
  frame(0);
  frame(1000);
  expect(reader.scrollTop).toBe(14);
  act(() => root.render(<Teleprompter paused recordingId="rec-1" />));
  expect(frames.size).toBe(0);
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-1" />));
  frame(2000);
  frame(3000);
  expect(reader.scrollTop).toBe(28);
  click('teleprompterPause');
  expect(button('teleprompterResume').disabled).toBe(false);
  act(() => root.render(<Teleprompter paused recordingId="rec-1" />));
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-1" />));
  expect(frames.size).toBe(0);
  click('teleprompterResume');
  frame(4000);
  frame(5000);
  expect(reader.scrollTop).toBe(42);
  act(() => root.render(<Teleprompter paused recordingId="rec-1" />));
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-1" />));
  frame(6000);
  frame(7000);
  expect(reader.scrollTop).toBe(56);
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-2" />));
  expect(reader.scrollTop).toBe(0);
  frame(8000);
  frame(9000);
  expect(reader.scrollTop).toBe(14);
});
it('stops Manual at the current position and re-enables With recording there without rewinding', () => {
  const reader = read();
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-1" />));
  reader.scrollTop = 120;
  choosePlayback('recording');
  expect(reader.scrollTop).toBe(120);
  expect(frames.size).toBe(1);
  frame(0);
  frame(1000);
  expect(reader.scrollTop).toBe(148);
  choosePlayback('manual');
  expect(frames.size).toBe(0);
  expect(reader.scrollTop).toBe(148);
  expect(button('teleprompterResume').disabled).toBe(false);
  act(() => root.render(<Teleprompter paused recordingId="rec-1" />));
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-1" />));
  expect(frames.size).toBe(0);
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-2" />));
  expect(frames.size).toBe(0);
  expect(reader.scrollTop).toBe(148);
  choosePlayback('recording');
  expect(reader.scrollTop).toBe(148);
  frame(2000);
  frame(3000);
  expect(reader.scrollTop).toBe(176);
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-3" />));
  expect(reader.scrollTop).toBe(0);
});
it('keeps manual mode as the default when a recording starts', () => {
  input(container.querySelector('textarea') ?? undefined, 'Manual draft');
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-1" />));
  expect(container.querySelector('textarea')?.value).toBe('Manual draft');
  expect(frames.size).toBe(0);
});
it('centers a bounded start-aligned column and preserves approximate progress after manual reflow', () => {
  const reader = read();
  setReaderGeometry(reader);
  act(() => window.dispatchEvent(new Event('resize')));
  const column = reader.querySelector<HTMLElement>('[data-teleprompter-column]');
  expect(column?.style.maxWidth).toBe('40ch');
  expect(reader.className).toContain('text-start');
  reader.scrollTop = 400;
  click('teleprompterSettings');
  setReaderGeometry(reader, 1800);
  input(container.querySelectorAll<HTMLInputElement>('input[type=range]')[1], '48');
  expect(reader.style.fontSize).toBe('48px');
  expect(reader.scrollTop).toBe(800);
  input(container.querySelectorAll<HTMLInputElement>('input[type=range]')[2], '60');
  expect(column?.style.maxWidth).toBe('60ch');
  click('teleprompterResetLayout');
  expect(column?.style.maxWidth).toBe('40ch');
  expect(reader.style.fontSize).toBe('32px');
});
it('leaves the start/end readable and disables optional effects while text is selected', () => {
  const reader = read();
  setReaderGeometry(reader);
  act(() => window.dispatchEvent(new Event('resize')));
  expect(container.querySelector('[data-teleprompter-fade=top]')).toBeNull();
  expect(container.querySelector('[data-teleprompter-fade=bottom]')).not.toBeNull();
  expect(container.querySelector('[data-teleprompter-guide]')).toBeNull();
  click('teleprompterSettings');
  const guide = container.querySelector<HTMLButtonElement>('[role=switch]');
  act(() => guide?.click());
  expect(container.querySelector('[data-teleprompter-guide]')).not.toBeNull();
  expect(container.querySelector('[data-teleprompter-guide] svg')).not.toBeNull();
  expect(reader.style.paddingTop).toBe('46px');
  expect(reader.style.paddingBottom).toBe('106px');
  input(container.querySelectorAll<HTMLInputElement>('input[type=range]')[1], '72');
  Object.defineProperty(reader, 'clientHeight', { configurable: true, value: 120 });
  act(() => window.dispatchEvent(new Event('resize')));
  expect(reader.style.paddingTop).toBe('0px');
  expect(container.querySelector<HTMLElement>('[data-teleprompter-guide]')?.style.top).toBe('54px');
  click('teleprompterSettings');
  reader.scrollTop = reader.scrollHeight - reader.clientHeight;
  act(() => reader.dispatchEvent(new Event('scroll', { bubbles: true })));
  expect(container.querySelector('[data-teleprompter-fade=bottom]')).toBeNull();
  const selection = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(reader);
  selection?.removeAllRanges();
  selection?.addRange(range);
  act(() => document.dispatchEvent(new Event('selectionchange')));
  expect(container.querySelector('[data-teleprompter-guide]')).toBeNull();
  expect(container.querySelector('[data-teleprompter-fade]')).toBeNull();
  selection?.removeAllRanges();
  act(() => document.dispatchEvent(new Event('selectionchange')));
  expect(container.querySelector('[data-teleprompter-guide]')).not.toBeNull();
});

it('closes draft settings when recording starts and permits explicit reopening while recording', () => {
  act(() => root.render(<Teleprompter paused />));
  click('teleprompterSettings');
  expect(container.querySelector('[popover]')).not.toBeNull();
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-1" />));
  expect(container.querySelector('[popover]')).toBeNull();
  click('teleprompterSettings');
  expect(container.querySelector('[popover]')).not.toBeNull();
});

it('keeps a manual scroll on hold across record pause and resumes following after Continue', () => {
  const reader = read();
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-1" />));
  choosePlayback('recording');
  frame(0);
  frame(1000);
  act(() => reader.dispatchEvent(new Event('wheel', { bubbles: true })));
  reader.scrollTop = 160;
  act(() => root.render(<Teleprompter paused recordingId="rec-1" />));
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-1" />));
  expect(frames.size).toBe(0);
  expect(button('teleprompterResume').disabled).toBe(false);
  click('teleprompterResume');
  frame(2000);
  frame(3000);
  expect(reader.scrollTop).toBe(188);
  act(() => root.render(<Teleprompter paused recordingId="rec-1" />));
  act(() => root.render(<Teleprompter paused={false} recordingId="rec-1" />));
  frame(4000);
  frame(5000);
  expect(reader.scrollTop).toBe(216);
});
it('maps approximate WPM to actual column height and recalculates after text reflow', () => {
  const reader = read();
  click('teleprompterSettings');
  const speed = container.querySelector<HTMLInputElement>('input[type=range]');
  expect(speed?.min).toBe('60');
  expect(speed?.max).toBe('300');
  expect(speed?.value).toBe('140');
  click('teleprompterSettings');
  start();
  frame(0);
  frame(1000);
  expect(reader.scrollTop).toBe(28);
  click('teleprompterSettings');
  setColumnHeight(reader, 2400);
  input(container.querySelectorAll<HTMLInputElement>('input[type=range]')[1], '48');
  expect(frames.size).toBe(0);
  expect(button('teleprompterResume').disabled).toBe(false);
  click('teleprompterSettings');
  click('teleprompterResume');
  frame(2000);
  frame(3000);
  expect(reader.scrollTop).toBe(84);
});
it('keeps automatic and manual column widths in the same character unit', () => {
  const reader = read();
  const column = reader.querySelector<HTMLElement>('[data-teleprompter-column]');
  click('teleprompterSettings');
  const width = container.querySelectorAll<HTMLInputElement>('input[type=range]')[2];
  expect(width?.value).toBe('40');
  expect(width?.min).toBe('20');
  expect(width?.max).toBe('80');
  input(width, '41');
  expect(column?.style.maxWidth).toBe('41ch');
  expect(column?.style.width).toBe('100%');
});

it('dismisses text settings when an already paused live surface leaves for a result', () => {
  act(() => root.render(<Teleprompter paused />));
  click('teleprompterSettings');
  expect(container.querySelector('[popover]')).not.toBeNull();
  act(() => root.render(<Teleprompter paused visible={false} />));
  expect(container.querySelector('[popover]')).toBeNull();
  expect(button('teleprompterSettings').getAttribute('aria-expanded')).toBe('false');
  act(() => root.render(<Teleprompter paused />));
  expect(container.querySelector('[popover]')).toBeNull();
});

it('requires an explicit start for a new recording when startup is Manual', () => {
  const reader = read();
  act(() => root.render(<Teleprompter paused={false} recordingId="manual-1" />));
  start();
  frame(0);
  frame(1000);
  expect(reader.scrollTop).toBeGreaterThan(0);
  act(() => root.render(<Teleprompter paused={false} recordingId="manual-2" />));
  expect(frames.size).toBe(0);
  expect(button('teleprompterPlay').disabled).toBe(false);
});

it('offers Start on the first read before playback has ever run', () => {
  read();
  expect(button('teleprompterPlay').disabled).toBe(false);
  expect(container.querySelector('[aria-label="popup.video.teleprompterResume"]')).toBeNull();
});

it('keeps Start after configuring a reader that has not played yet', () => {
  read();
  click('teleprompterSettings');
  input(container.querySelectorAll<HTMLInputElement>('input[type=range]')[1], '48');
  click('teleprompterSettings');
  expect(button('teleprompterPlay').disabled).toBe(false);
});
it('pauses before hiding the reader and retains its script', () => {
  const onHide = vi.fn();
  act(() => root.render(<Teleprompter paused={false} onHide={onHide} />));
  const reader = read();
  start();
  frame(0);
  frame(1000);
  click('teleprompterHide');
  expect(onHide).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(0);
  expect(reader.textContent).toContain('Script');
});

function installControlledReaderResize() {
  let measure = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  return () => act(() => measure());
}

it('keeps automatic playback running when camera insertion changes only the mounted reader height', () => {
  const resize = installControlledReaderResize();
  try {
    const reader = read();
    setReaderGeometry(reader);
    resize();
    choosePlayback('recording');
    act(() => root.render(<Teleprompter paused={false} recordingId="camera-height" />));
    expect(button('teleprompterPause').disabled).toBe(false);
    frame(0);
    frame(1000);
    expect(reader.scrollTop).toBe(28);
    Object.defineProperty(reader, 'clientHeight', { configurable: true, value: 120 });
    resize();
    expect(button('teleprompterPause').disabled).toBe(false);
    expect(reader.scrollTop).toBe(28);
    frame(2000);
    expect(reader.scrollTop).toBe(56);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('preserves a manual hold and the same text position through automatic height changes', () => {
  const resize = installControlledReaderResize();
  try {
    const reader = read();
    setReaderGeometry(reader);
    resize();
    start();
    frame(0);
    frame(1000);
    click('teleprompterPause');
    Object.defineProperty(reader, 'clientHeight', { configurable: true, value: 120 });
    resize();
    expect(frames.size).toBe(0);
    expect(button('teleprompterResume').disabled).toBe(false);
    expect(reader.scrollTop).toBe(28);
  } finally {
    vi.unstubAllGlobals();
  }
});
