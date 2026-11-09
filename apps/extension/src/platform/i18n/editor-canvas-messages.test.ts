import { describe, expect, it } from 'vitest';
import { getDictionary } from './index';

describe('editor empty image intake copy', () => {
  it('keeps the empty editor copy user-friendly and action-oriented', () => {
    expect(getDictionary('ru').editor.canvas.emptyTitle).toBe('Добавьте первое изображение');
    expect(getDictionary('ru').editor.canvas.emptyDescription).toBe(
      'Выберите файл, перетащите изображение в окно или вставьте его из буфера.'
    );
    expect(getDictionary('ru').editor.canvas.openImage).toBe('Выбрать файл');
    expect(getDictionary('ru').editor.canvas.emptyDropzoneHint).toBe('Ctrl+V тоже работает');
    expect(getDictionary('ru').editor.page.title).toBe('Добавьте изображение');
    expect(getDictionary('ru').editor.page.title.toLowerCase()).not.toContain(
      'редактор изображений'
    );
    expect(getDictionary('ru').editor.page.subtitle).toBe(
      'Выберите файл, перетащите его на холст или вставьте из буфера'
    );
    expect(getDictionary('ru').editor.page.subtitle).not.toMatch(/[А-ЯЁ]{4,}/u);
  });
});
