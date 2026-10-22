import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { MotionAreaBoundsFields } from './area-controls';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('renders motion area bounds through shared numeric fields', () => {
  const markup = renderToStaticMarkup(
    <MotionAreaBoundsFields
      area={{ height: 120, width: 160, x: 20, y: 30 }}
      onUpdateArea={vi.fn()}
      panel={{ project: { height: 720, width: 1280 } } as never}
    />
  );

  expect(markup).toContain('videoEditor.sidebar.motionAreaXLabel');
  expect(markup).toContain('videoEditor.sidebar.motionAreaHeightLabel');
  expect(markup).toContain('value="160"');
});

it('shows retained off-canvas coordinates and small converted edge lengths', () => {
  const markup = renderToStaticMarkup(
    <MotionAreaBoundsFields
      area={{
        x: -20,
        y: -30,
        width: 20,
        height: 10,
        axes: { x: { x: 0, y: 1 }, y: { x: -1, y: 0 } },
      }}
      onUpdateArea={vi.fn()}
      panel={{ project: { width: 1280, height: 720 } } as never}
    />
  );
  expect(markup).toContain('value="-20"');
  expect(markup).toContain('value="-30"');
  expect(markup).toContain('value="10"');
});
