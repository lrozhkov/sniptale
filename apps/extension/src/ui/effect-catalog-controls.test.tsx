import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { EffectCatalogControls, EffectImportSummary } from './effect-catalog-controls';
it('escapes untrusted filenames and exposes partial import failures as a status', () => {
  const html = renderToStaticMarkup(
    <EffectImportSummary
      results={[
        { filename: 'good.json', status: 'imported' },
        { filename: '<img src=x>.json', status: 'failed' },
      ]}
    />
  );
  expect(html).toContain('role="status"');
  expect(html).toContain('1 из 2');
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<img');
  expect(renderToStaticMarkup(<EffectImportSummary results={[]} />)).toBe('');
});
it('keeps filter controls disabled during a catalog operation', () => {
  const html = renderToStaticMarkup(
    <EffectCatalogControls
      disabled
      filter={{ query: '', kind: 'all', theme: 'all' }}
      onChange={vi.fn()}
    />
  );
  expect(html).toContain('disabled=""');
  expect(html).toContain('Найти эффект');
});
