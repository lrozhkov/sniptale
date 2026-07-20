import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => (key === 'content.stepBadge.tooltipPrefix' ? 'Step' : key),
}));

import { StepBadge } from '.';

it('renders the tooltip label through the shared i18n seam', () => {
  const markup = renderToStaticMarkup(
    <StepBadge
      settings={{ enabled: true, value: '7' } as never}
      borderColor="#000"
      borderWidth={2}
      zIndex={10}
    />
  );

  expect(markup).toContain('title="Step 7"');
});
