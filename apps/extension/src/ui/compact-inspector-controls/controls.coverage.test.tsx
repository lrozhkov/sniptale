import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { SegmentedRow, SelectField, StatusRow } from './index';

it('renders compact control branches for custom menus and non-string labels', () => {
  const markup = renderToStaticMarkup(
    <>
      <SelectField
        label="Line style"
        value="solid"
        onChange={() => undefined}
        options={[{ value: 'solid', label: 'Solid' }]}
        menuClassName="custom-menu"
      />
      <SegmentedRow
        ariaLabel="Weight"
        label={<span>Weight</span>}
        value="regular"
        onChange={() => undefined}
        options={[{ value: 'regular', label: 'Regular' }]}
      />
      <StatusRow label={<span>Status</span>} value={<strong>Ready</strong>} />
    </>
  );

  expect(markup).toContain('shared.ui.compact-inspector.select-field');
  expect(markup).toContain('shared.ui.compact-inspector.segmented-field');
  expect(markup).toContain('<strong>Ready</strong>');
  expect(markup).not.toContain('title="[object Object]"');
});
