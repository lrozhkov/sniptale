import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', () => ({
  translate: vi.fn((key: string) => `t:${key}`),
}));
vi.mock('../localization', () => ({
  localize: vi.fn((locale: string, ru: string, en: string) => (locale === 'ru' ? ru : en)),
}));

import { DesignSystemCatalogVariantsSection } from './variants';

function createEntry() {
  return {
    componentId: 'Button',
    variants: [
      {
        descriptionEn: 'Primary button',
        descriptionRu: 'Основная кнопка',
        labelEn: 'Primary',
        labelRu: 'Основная',
        technicalNotesEn: ['Uses accent color'],
        technicalNotesRu: ['Использует акцентный цвет'],
        variantId: 'primary',
      },
    ],
  };
}

it('renders catalog variants with previews and localized notes', () => {
  const markup = renderToStaticMarkup(
    <DesignSystemCatalogVariantsSection
      entry={createEntry() as never}
      locale="ru"
      previewMap={new Map([['Button.primary', <div key="preview">Preview</div>]])}
    />
  );

  expect(markup).toContain('t:designSystem.page.variantsTitle');
  expect(markup).toContain('Основная');
  expect(markup).toContain('Preview');
  expect(markup).toContain('Использует акцентный цвет');
  expect(markup).toContain('primary');
});

it('throws when a variant preview is missing', () => {
  expect(() =>
    renderToStaticMarkup(
      <DesignSystemCatalogVariantsSection
        entry={createEntry() as never}
        locale="en"
        previewMap={new Map()}
      />
    )
  ).toThrow('Missing design-system preview for "Button.primary".');
});
