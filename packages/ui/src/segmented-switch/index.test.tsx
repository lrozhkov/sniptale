import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SegmentedSwitch } from './index';

it('keeps long segmented labels clipped inside their own cell', () => {
  const markup = renderToStaticMarkup(
    <SegmentedSwitch
      activeId="main"
      ariaLabel="Inspector groups"
      options={[
        { id: 'info', label: 'Сведения' },
        { id: 'main', label: 'Основное' },
        { id: 'frame', label: 'Кадр' },
        { id: 'timing', label: 'Очень длинная вкладка' },
      ]}
      onChange={vi.fn()}
    />
  );

  expect(markup).toContain('overflow-hidden');
  expect(markup).toContain('max-w-full truncate');
});

it('wraps long dense switch groups when requested', () => {
  const markup = renderToStaticMarkup(
    <SegmentedSwitch
      activeId="main"
      ariaLabel="Inspector groups"
      wrap
      options={[
        { id: 'info', label: 'Сведения' },
        { id: 'main', label: 'Основное' },
        { id: 'frame', label: 'Кадр' },
        { id: 'timing', label: 'Время' },
        { id: 'style', label: 'Стиль' },
      ]}
      onChange={vi.fn()}
    />
  );

  expect(markup).toContain('flex-wrap');
  expect(markup).toContain('min-w-[4.25rem]');
  expect(markup).toContain('whitespace-normal');
  expect(markup).not.toContain('gridTemplateColumns');
});
