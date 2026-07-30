// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../../platform/i18n';
import type { DesignReviewActions, DesignReviewViewState } from '../types';
import { PageStyleCommentField } from './comment';

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

function createActions(): DesignReviewActions['comment'] & { close: () => void } {
  return {
    close: vi.fn(),
    commit: vi.fn(() => true),
    endComposition: vi.fn(),
    startComposition: vi.fn(),
    updateDraft: vi.fn(),
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

function renderField(state = createState(), actions = createActions()) {
  act(() => {
    root.render(<PageStyleCommentField actions={actions} disabled={false} state={state} />);
  });
  return { actions };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('binds the comment draft, marker number, blur commit, and IME lifecycle actions', () => {
  const { actions } = renderField();
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea');

  expect(textarea?.value).toBe('Review this');
  expect(document.body.textContent).toContain('Комментарий №3');

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
});
