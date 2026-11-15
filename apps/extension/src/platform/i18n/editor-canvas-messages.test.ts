import { describe, expect, it } from 'vitest';
import { getCatalogFixture } from './catalog-fixture.test-support';

describe('editor empty image intake copy', () => {
  it('keeps the empty editor copy user-friendly and action-oriented', () => {
    expect(getCatalogFixture('ru').editor.canvas.emptyTitle).toBe('Добавьте первое изображение');
    expect(getCatalogFixture('ru').editor.canvas.emptyDescription).toBe(
      'Выберите файл, перетащите изображение в окно или вставьте его из буфера.'
    );
    expect(getCatalogFixture('ru').editor.canvas.openImage).toBe('Выбрать файл');
    expect(getCatalogFixture('ru').editor.canvas.emptyDropzoneHint).toBe('Ctrl+V тоже работает');
    expect(getCatalogFixture('ru').editor.page.title).toBe('Добавьте изображение');
    expect(getCatalogFixture('ru').editor.page.title.toLowerCase()).not.toContain(
      'редактор изображений'
    );
    expect(getCatalogFixture('ru').editor.page.subtitle).toBe(
      'Выберите файл, перетащите его на холст или вставьте из буфера'
    );
    expect(getCatalogFixture('ru').editor.page.subtitle).not.toMatch(/[А-ЯЁ]{4,}/u);
  });
});
