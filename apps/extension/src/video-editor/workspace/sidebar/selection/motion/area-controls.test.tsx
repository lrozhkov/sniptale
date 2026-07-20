import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { MotionAreaBoundsFields } from './area-controls';

vi.mock('../../../../../platform/i18n', () => ({
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
