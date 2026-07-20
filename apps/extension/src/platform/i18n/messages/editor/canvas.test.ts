import { describe, expect, it } from 'vitest';

import { editorCanvasMessages } from './canvas';
import { editorPageMessages } from './page';

describe('editor empty image intake copy', () => {
  it('keeps the empty editor copy user-friendly and action-oriented', () => {
    expect(editorCanvasMessages.emptyTitle.ru).toBe('Добавьте первое изображение');
    expect(editorCanvasMessages.emptyDescription.ru).toBe(
      'Выберите файл, перетащите изображение в окно или вставьте его из буфера.'
    );
    expect(editorCanvasMessages.openImage.ru).toBe('Выбрать файл');
    expect(editorCanvasMessages.emptyDropzoneHint.ru).toBe('Ctrl+V тоже работает');
    expect(editorPageMessages.title.ru).toBe('Добавьте изображение');
    expect(editorPageMessages.title.ru.toLowerCase()).not.toContain('редактор изображений');
    expect(editorPageMessages.subtitle.ru).toBe(
      'Выберите файл, перетащите его на холст или вставьте из буфера'
    );
    expect(editorPageMessages.subtitle.ru).not.toMatch(/[А-ЯЁ]{4,}/u);
  });
});
