// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { AspectToggle, getAspectRatio, getFramePaddingSummary, updateLockedDraft } from './frame';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createFrame() {
  return {
    backgroundColor: '#fff',
    backgroundGradientAngle: 0,
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#000',
    backgroundImageData: null,
    backgroundImageFit: 'cover',
    backgroundMode: 'color',
    browserMode: false,
    browserTitle: '',
    browserUrl: '',
    layoutMode: 'expand-canvas',
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
  };
}

function renderAspectToggle(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

it('computes aspect ratios', () => {
  expect(getAspectRatio(400, 200)).toBe(2);
  expect(getAspectRatio(0, 200)).toBeNull();
});

it('updates locked drafts when width changes', () => {
  expect(updateLockedDraft({ height: 100, width: 200 }, 'width', 300, false, 2)).toEqual({
    height: 100,
    width: 300,
  });
  expect(updateLockedDraft({ height: 100, width: 200 }, 'width', 300, true, 2)).toEqual({
    height: 150,
    width: 300,
  });
});

it('updates locked drafts when height changes', () => {
  expect(updateLockedDraft({ height: 100, width: 200 }, 'height', 180, true, 2)).toEqual({
    height: 180,
    width: 360,
  });
  expect(updateLockedDraft({ height: 100, width: 200 }, 'height', 0, true, 2)).toEqual({
    height: 1,
    width: 2,
  });
  expect(updateLockedDraft({ height: 100, width: 200 }, 'width', 220, true, null)).toEqual({
    height: 100,
    width: 220,
  });
});

it('formats explicit top-right-bottom-left padding summaries', () => {
  expect(
    getFramePaddingSummary({
      ...createFrame(),
      paddingBottom: 10,
      paddingLeft: 12,
      paddingRight: 8,
      paddingTop: 6,
    } as never)
  ).toBe('6 / 8 / 10 / 12');
});

it('renders the aspect toggle and reflects checked state in the status text', () => {
  const onClick = vi.fn();
  renderAspectToggle(<AspectToggle checked={false} onClick={onClick} />);

  act(() => {
    (container?.querySelector('button') as HTMLButtonElement | null)?.click();
  });
  expect(container?.textContent).toContain('editor.compact.unlocked');

  act(() => root?.render(<AspectToggle checked onClick={onClick} />));
  expect(container?.textContent).toContain('editor.compact.linked');
  const status = Array.from(container?.querySelectorAll('span') ?? []).find((item) =>
    item.textContent?.includes('editor.compact.linked')
  );
  expect(status?.className).toContain('text-[12px] font-semibold uppercase');
  expect(status?.className).not.toContain('tracking-');
  expect(onClick).toHaveBeenCalledOnce();
});

it('renders a compact aspect toggle for inline size controls', () => {
  const onClick = vi.fn();
  renderAspectToggle(<AspectToggle checked compact onClick={onClick} />);

  const button = container?.querySelector('button');
  act(() => {
    (button as HTMLButtonElement | null)?.click();
  });

  expect(button?.title).toBe('editor.compact.keepAspectRatio');
  expect(button?.getAttribute('aria-pressed')).toBe('true');
  expect(container?.textContent).not.toContain('editor.compact.linked');
  expect(onClick).toHaveBeenCalledOnce();
});
