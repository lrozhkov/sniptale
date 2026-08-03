// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../../platform/i18n';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { PageStyleCommentField } from './comment';

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedMouseEvent: vi.fn(() => true),
  isTrustedPointerEvent: vi.fn(() => true),
}));

vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal()),
  isTrustedMouseEvent: trustedEventMocks.isTrustedMouseEvent,
  isTrustedPointerEvent: trustedEventMocks.isTrustedPointerEvent,
}));

let host: HTMLDivElement;
let root: Root;

interface ColorChannels {
  alpha: number;
  blue: number;
  green: number;
  red: number;
}

const designTokensStylesheet = readFileSync('packages/ui/src/styles/design-tokens.css', 'utf8');

function readTokenValues(token: string): string[] {
  const prefix = `${token}:`;
  return designTokensStylesheet.split('\n').flatMap((line) => {
    const declaration = line.trim();
    return declaration.startsWith(prefix)
      ? [declaration.slice(prefix.length).trim().replace(/;$/, '')]
      : [];
  });
}

function parseColor(value: string): ColorChannels {
  if (value.startsWith('#')) {
    const channels = value
      .slice(1)
      .match(/.{2}/g)!
      .map((channel) => Number.parseInt(channel, 16));
    return { alpha: 1, blue: channels[2]!, green: channels[1]!, red: channels[0]! };
  }
  const [red, green, blue, alpha] = value
    .slice(value.indexOf('(') + 1, value.lastIndexOf(')'))
    .split(',')
    .map((channel) => Number.parseFloat(channel.trim()));
  return { alpha: alpha!, blue: blue!, green: green!, red: red! };
}

function composite(foreground: ColorChannels, background: ColorChannels): ColorChannels {
  return {
    alpha: 1,
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
  };
}

function relativeLuminance(color: ColorChannels): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return channel(color.red) * 0.2126 + channel(color.green) * 0.7152 + channel(color.blue) * 0.0722;
}

function contrastRatio(left: ColorChannels, right: ColorChannels): number {
  const [lighter, darker] = [relativeLuminance(left), relativeLuminance(right)].sort(
    (first, second) => second - first
  );
  return (lighter! + 0.05) / (darker! + 0.05);
}

function createActions(): DesignReviewActions['comment'] & {
  close: () => void;
  voice: DesignReviewActions['voice'];
} {
  return {
    close: vi.fn(),
    commit: vi.fn(() => true),
    endComposition: vi.fn(),
    startComposition: vi.fn(),
    updateDraft: vi.fn(),
    voice: { start: vi.fn(), stop: vi.fn() },
  };
}

function createState(
  overrides: Partial<DesignReviewViewState['comment']> = {}
): DesignReviewViewState['comment'] {
  return {
    commitFailed: false,
    draft: 'Review this',
    marker: 3,
    ...overrides,
  };
}

const idleVoiceState: DesignReviewViewState['voice'] = {
  active: false,
  audioLevel: 0,
  caretPosition: null,
  errorCode: null,
  phase: 'idle',
};

function renderField(
  state = createState(),
  actions = createActions(),
  voice = idleVoiceState,
  footer?: ReactNode
) {
  act(() => {
    root.render(
      <PageStyleCommentField
        actions={actions}
        disabled={false}
        footer={footer}
        state={state}
        voice={voice}
      />
    );
  });
  return { actions };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  trustedEventMocks.isTrustedMouseEvent.mockReturnValue(true);
  trustedEventMocks.isTrustedPointerEvent.mockReturnValue(true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  vi.useRealTimers();
  act(() => root.unmount());
  host.remove();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('binds the comment draft, marker number, blur commit, and IME lifecycle actions', () => {
  const { actions } = renderField();
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea');

  expect(textarea?.value).toBe('Review this');
  expect(textarea?.rows).toBe(2);
  expect(document.activeElement).toBe(textarea);
  expect(document.body.textContent).toContain('Замечание №3');

  act(() => {
    if (!textarea) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    setter?.call(textarea, 'Changed');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(actions.updateDraft).toHaveBeenCalledWith('Changed');

  act(() => {
    root.render(
      <PageStyleCommentField
        actions={actions}
        disabled={false}
        state={createState({ draft: 'Changed' })}
        voice={idleVoiceState}
      />
    );
  });
  const updatedTextarea = document.querySelector<HTMLTextAreaElement>('textarea');
  act(() => {
    updatedTextarea?.focus();
    updatedTextarea?.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    updatedTextarea?.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    updatedTextarea?.blur();
  });

  expect(actions.startComposition).toHaveBeenCalledOnce();
  expect(actions.endComposition).toHaveBeenCalledWith('Changed');
  expect(actions.commit).toHaveBeenCalledOnce();
});

it('grows from two lines with the draft and caps long comments inside the composer', () => {
  const { actions } = renderField(createState({ draft: '' }));
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
  if (!textarea) throw new Error('Expected Design Review comment field');
  let scrollHeight = 104;
  Object.defineProperty(textarea, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });

  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    setter?.call(textarea, 'A comment that wraps onto several lines');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(textarea.style.height).toBe('104px');
  expect(textarea.style.overflowY).toBe('hidden');

  scrollHeight = 240;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    setter?.call(textarea, 'A much longer comment');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(textarea.style.height).toBe('160px');
  expect(textarea.style.overflowY).toBe('auto');
  expect(actions.updateDraft).toHaveBeenCalledTimes(2);
});

it('closes on Enter while preserving Shift+Enter for a new line', () => {
  const { actions } = renderField();
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
  if (!textarea) throw new Error('Expected Design Review comment field');

  act(() => {
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        shiftKey: true,
      })
    );
  });
  expect(actions.close).not.toHaveBeenCalled();

  act(() => {
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })
    );
  });
  expect(actions.close).toHaveBeenCalledOnce();
});

it('starts at the current caret, supports push-to-talk, and renders before the Enter hint', () => {
  vi.useFakeTimers();
  const actions = createActions();
  renderField(
    createState({ draft: 'Keep this text' }),
    actions,
    idleVoiceState,
    <span>Action</span>
  );
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
  const button = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.design-review.comment-voice-input"]'
  );
  const footer = document.querySelector('[data-ui="content.design-review.comment-footer"]');
  if (!textarea || !button || !footer) throw new Error('Expected comment voice controls');
  textarea.setSelectionRange(5, 5);
  const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
  Object.defineProperty(down, 'pointerId', { value: 9 });

  act(() => button.dispatchEvent(down));
  act(() => vi.advanceTimersByTime(450));
  const up = new MouseEvent('pointerup', { bubbles: true, button: 0 });
  Object.defineProperty(up, 'pointerId', { value: 9 });
  act(() => button.dispatchEvent(up));

  expect(actions.voice.start).toHaveBeenCalledWith(5);
  expect(actions.voice.stop).toHaveBeenCalledOnce();
  expect(
    button.compareDocumentPosition(
      footer.querySelector('[data-ui="content.design-review.comment-submit-hint"]')!
    ) & Node.DOCUMENT_POSITION_FOLLOWING
  ).not.toBe(0);
  vi.useRealTimers();
});

it('keeps listening after a short microphone click until the same control is used again', () => {
  vi.useFakeTimers();
  const actions = createActions();
  renderField(createState(), actions, idleVoiceState, <span>Action</span>);
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
  const button = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.design-review.comment-voice-input"]'
  );
  if (!textarea || !button) throw new Error('Expected comment voice controls');
  textarea.setSelectionRange(3, 3);
  const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
  const up = new MouseEvent('pointerup', { bubbles: true, button: 0 });
  Object.defineProperty(down, 'pointerId', { value: 11 });
  Object.defineProperty(up, 'pointerId', { value: 11 });

  act(() => button.dispatchEvent(down));
  act(() => vi.advanceTimersByTime(200));
  act(() => button.dispatchEvent(up));

  expect(actions.voice.start).toHaveBeenCalledWith(3);
  expect(actions.voice.stop).not.toHaveBeenCalled();
  vi.useRealTimers();
});

it('rejects synthetic pointer and keyboard-style click starts from the host page', () => {
  const actions = createActions();
  trustedEventMocks.isTrustedMouseEvent.mockReturnValue(false);
  trustedEventMocks.isTrustedPointerEvent.mockReturnValue(false);
  renderField(createState(), actions, idleVoiceState, <span>Action</span>);
  const button = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.design-review.comment-voice-input"]'
  );
  if (!button) throw new Error('Expected comment voice control');
  const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
  Object.defineProperty(down, 'pointerId', { value: 12 });

  act(() => button.dispatchEvent(down));
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));

  expect(actions.voice.start).not.toHaveBeenCalled();
});

it('accepts a trusted keyboard-style click start', () => {
  const actions = createActions();
  renderField(createState(), actions, idleVoiceState, <span>Action</span>);
  const button = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.design-review.comment-voice-input"]'
  );
  if (!button) throw new Error('Expected comment voice control');

  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));

  expect(actions.voice.start).toHaveBeenCalledOnce();
});

it('shows an audio-reactive active ring and stops from the same microphone button', () => {
  const actions = createActions();
  renderField(
    createState(),
    actions,
    {
      active: true,
      audioLevel: 0.5,
      caretPosition: 4,
      errorCode: null,
      phase: 'listening',
    },
    <span>Action</span>
  );
  const button = document.querySelector<HTMLButtonElement>(
    '[data-ui="content.design-review.comment-voice-input"]'
  );
  const ring = button?.querySelector<HTMLSpanElement>('span[aria-hidden="true"]');
  if (!button) throw new Error('Expected active voice button');

  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(ring?.style.transform).toBe('scale(1.2)');
  const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
  Object.defineProperty(down, 'pointerId', { value: 10 });
  act(() => button.dispatchEvent(down));

  expect(actions.voice.stop).toHaveBeenCalledOnce();
});

it('surfaces a localized voice failure without discarding the comment draft', () => {
  renderField(
    createState({ draft: 'Still here' }),
    createActions(),
    {
      active: false,
      audioLevel: 0,
      caretPosition: null,
      errorCode: 'permission-denied',
      phase: 'error',
    },
    <span>Action</span>
  );

  expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Still here');
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Проверьте микрофон');
});

it('keeps the recoverable localized error associated with the textarea', () => {
  renderField(createState({ commitFailed: true }));
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
  const alert = document.querySelector<HTMLElement>('[role="alert"]');

  expect(alert?.textContent).toContain('Текст сохранён в поле');
  expect(textarea?.getAttribute('aria-describedby')?.split(' ')).toContain(alert?.id);
});

it('uses AA secondary text pairs for marker, placeholder, and hint copy in both themes', () => {
  renderField();
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
  const marker = document.querySelector<HTMLElement>('section div span');
  const hintId = textarea?.getAttribute('aria-describedby')?.split(' ')[0];
  const hint = hintId ? document.getElementById(hintId) : null;

  expect(marker?.className).toContain('text-[var(--sniptale-color-text-secondary)]');
  expect(textarea?.className).toContain('placeholder:text-[var(--sniptale-color-text-secondary)]');
  expect(hint?.className).toContain('sr-only');

  const canvasValues = readTokenValues('--sniptale-color-surface-canvas');
  const panelValues = readTokenValues('--sniptale-color-surface-panel');
  const inputValues = readTokenValues('--sniptale-color-surface-input');
  const secondaryValues = readTokenValues('--sniptale-color-text-secondary');
  expect(canvasValues).toHaveLength(2);
  canvasValues.forEach((canvasValue, index) => {
    const canvas = parseColor(canvasValue);
    const panel = composite(parseColor(panelValues[index]!), canvas);
    const input = composite(parseColor(inputValues[index]!), panel);
    const secondary = parseColor(secondaryValues[index]!);
    expect(contrastRatio(secondary, panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(secondary, input)).toBeGreaterThanOrEqual(4.5);
  });
});

it('disables editing when no page target is selected', () => {
  const actions = createActions();
  act(() => {
    root.render(
      <PageStyleCommentField
        actions={actions}
        disabled
        state={createState({ draft: '', marker: null })}
        voice={idleVoiceState}
      />
    );
  });

  expect(document.querySelector<HTMLTextAreaElement>('textarea')?.disabled).toBe(true);
});

it('ships the comment field and marker copy in both supported locales', () => {
  expect(translate('content.designReview.commentLabel', 'ru')).toBe('Комментарий к элементу');
  expect(translate('content.designReview.commentLabel', 'en')).toBe('Element comment');
  expect(translate('content.designReview.commentCommitFailed', 'en')).toContain(
    'draft is still here'
  );
  expect(translate('content.designReview.voiceInputStart', 'ru')).toContain('Удерживайте');
  expect(translate('content.designReview.voiceInputError', 'en')).toContain('voice input settings');
});
