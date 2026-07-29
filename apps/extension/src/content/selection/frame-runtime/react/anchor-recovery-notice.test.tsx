// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLOATING_INTERACTION_CAPTURE_TRANSIENT_ATTRIBUTE } from '@sniptale/ui/floating-interactions/ownership';

const locale = vi.hoisted(() => ({ current: 'ru' as 'ru' | 'en' }));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  useAppLocale: () => locale.current,
  translate: (key: string) => {
    const messages = {
      ru: {
        'content.interactiveFrame.anchorMissing': 'Связанный элемент больше не найден.',
        'content.interactiveFrame.anchorAmbiguous': 'Найдено несколько возможных элементов.',
        'content.interactiveFrame.anchorPin': 'Закрепить на прежнем месте',
        'content.interactiveFrame.anchorDelete': 'Удалить',
        'content.interactiveFrame.anchorRecoveryCounter': '{current} из {total}',
      },
      en: {
        'content.interactiveFrame.anchorMissing': 'The linked element can no longer be found.',
        'content.interactiveFrame.anchorAmbiguous': 'Several possible elements were found.',
        'content.interactiveFrame.anchorPin': 'Pin at previous position',
        'content.interactiveFrame.anchorDelete': 'Delete',
        'content.interactiveFrame.anchorRecoveryCounter': '{current} of {total}',
      },
    } as const;
    return messages[locale.current][key as keyof (typeof messages)['ru']] ?? key;
  },
}));

import { AnchorRecoveryNotice } from './anchor-recovery-notice';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  locale.current = 'ru';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('anchor recovery notice', () => {
  it('keeps focus, exposes capture exclusion, and routes the oldest queued actions', () => {
    const onPin = vi.fn(() => true);
    const onDelete = vi.fn();
    act(() => {
      root.render(
        <AnchorRecoveryNotice
          snapshot={{
            presentations: new Map(),
            recoveries: [
              { frameId: 'oldest', status: 'missing' },
              { frameId: 'newer', status: 'ambiguous' },
            ],
            version: 1,
          }}
          onDelete={onDelete}
          onPin={onPin}
        />
      );
    });

    const notice = container.querySelector('[data-testid="anchor-recovery-notice"]');
    expect(notice?.getAttribute(FLOATING_INTERACTION_CAPTURE_TRANSIENT_ATTRIBUTE)).toBe('true');
    expect(notice?.textContent).toContain('1 из 2');
    expect(document.activeElement).toBe(document.body);
    const buttons = container.querySelectorAll('button');
    act(() => buttons[0]?.focus());
    expect(document.activeElement).toBe(buttons[0]);
    act(() => buttons[0]?.click());
    act(() => buttons[1]?.click());
    expect(onPin).toHaveBeenCalledWith('oldest');
    expect(onDelete).toHaveBeenCalledWith('oldest');
  });

  it('reacts to locale changes on rerender', () => {
    const snapshot = {
      presentations: new Map(),
      recoveries: [{ frameId: 'frame-1', status: 'ambiguous' as const }],
      version: 1,
    };
    act(() => {
      root.render(<AnchorRecoveryNotice snapshot={snapshot} onDelete={vi.fn()} onPin={vi.fn()} />);
    });
    expect(container.textContent).toContain('Закрепить на прежнем месте');

    locale.current = 'en';
    act(() => {
      root.render(<AnchorRecoveryNotice snapshot={snapshot} onDelete={vi.fn()} onPin={vi.fn()} />);
    });
    expect(container.textContent).toContain('Pin at previous position');
    expect(container.textContent).toContain('1 of 1');
  });
});
