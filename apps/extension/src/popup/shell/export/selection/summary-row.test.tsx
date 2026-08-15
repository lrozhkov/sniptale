import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SelectionSummaryRow } from './summary-row';

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));

it('uses the shared popup value typography for selection summaries', () => {
  const markup = renderToStaticMarkup(
    <SelectionSummaryRow
      icon={<svg />}
      label="Current page"
      onRemove={() => undefined}
      title="Full current page title"
    />
  );

  expect(markup).toContain('text-[11px] font-medium leading-4');
  expect(markup).toContain('title="Full current page title"');
});

it('uses the visible label as the title fallback', () => {
  const markup = renderToStaticMarkup(
    <SelectionSummaryRow icon={<svg />} label="Images" onRemove={() => undefined} />
  );

  expect(markup).toContain('title="Images"');
});
