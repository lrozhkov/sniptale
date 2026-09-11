// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  getActionKeyStyle,
  getActionClickStyle,
} from '../../../../../features/video/project/action-style';
import { ActionKeyStyleFields, ActionClickStyleFields } from './action-style-fields';
import { translate } from '../../../../../platform/i18n';

it('keeps typography and placement visible and secondary decoration folded, including a locked event', () => {
  for (const disabled of [false, true]) {
    const markup = renderToStaticMarkup(
      <ActionKeyStyleFields
        value={{ ...getActionKeyStyle(), fontFamily: 'monospace', fontSize: 32 }}
        disabled={disabled}
        onChange={vi.fn()}
      />
    );
    expect(markup).toContain(translate('videoEditor.sidebar.keyMono'));
    expect(markup).toContain('value="32"');
    expect(markup).toContain('<details');
    expect(markup).not.toContain('<details open');
    expect(markup.includes('disabled=""')).toBe(disabled);
  }
});

it('edits each visual property without dropping the other authored values', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const clickStyle = getActionClickStyle();
  const keyStyle = { ...getActionKeyStyle(), fontSize: 32 };
  const onClick = vi.fn();
  const onKey = vi.fn();
  try {
    await act(async () =>
      root.render(
        <>
          <ActionClickStyleFields value={clickStyle} disabled={false} onChange={onClick} />
          <ActionKeyStyleFields value={keyStyle} disabled={false} onChange={onKey} />
        </>
      )
    );
    const number = (key: string, value: string, index = 0) => {
      const input = container.querySelectorAll<HTMLInputElement>(
        `input[type="text"][aria-label="${translate(key as Parameters<typeof translate>[0])}"]`
      )[index]!;
      act(() => {
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    };
    number('videoEditor.sidebar.actionSize', '72');
    expect(onClick).toHaveBeenLastCalledWith({ ...clickStyle, size: 72 });
    number('videoEditor.sidebar.actionOpacity', '50');
    expect(onClick).toHaveBeenLastCalledWith({ ...clickStyle, opacity: 0.5 });
    number('videoEditor.sidebar.actionStroke', '6');
    expect(onClick).toHaveBeenLastCalledWith({ ...clickStyle, strokeWidth: 6 });
    number('videoEditor.sidebar.keyFontSize', '40');
    expect(onKey).toHaveBeenLastCalledWith({ ...keyStyle, fontSize: 40 });
    number('videoEditor.sidebar.actionOpacity', '50', 1);
    expect(onKey).toHaveBeenLastCalledWith({ ...keyStyle, opacity: 0.5 });
    number('videoEditor.sidebar.keyRadius', '12');
    expect(onKey).toHaveBeenLastCalledWith({ ...keyStyle, cornerRadius: 12 });
    number('videoEditor.sidebar.keyMargin', '48');
    expect(onKey).toHaveBeenLastCalledWith({ ...keyStyle, margin: 48 });
    for (const [label, option, patch] of [
      [
        'videoEditor.sidebar.keyPosition',
        'videoEditor.sidebar.keyTopRight',
        { position: 'top-right' },
      ],
      ['videoEditor.sidebar.keyFont', 'videoEditor.sidebar.keyMono', { fontFamily: 'monospace' }],
      ['videoEditor.sidebar.keyEntrance', 'videoEditor.sidebar.keySlide', { entrance: 'slide' }],
    ] as const) {
      await act(async () =>
        container
          .querySelector<HTMLButtonElement>(`button[aria-label="${translate(label)}"]`)!
          .click()
      );
      const target = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
        (el) => el.textContent?.includes(translate(option))
      )!;
      await act(async () => target.click());
      expect(onKey).toHaveBeenLastCalledWith({ ...keyStyle, ...patch });
    }
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
