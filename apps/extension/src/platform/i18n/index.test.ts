import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  createTranslator,
  formatNumber,
  getDictionary,
  translate,
  type AppLocale,
  type TranslationKey,
} from './index';

describe('i18n runtime contract', () => {
  it('resolves derived dictionaries and keys without changing public lookup APIs', () => {
    const knownKeys: TranslationKey[] = [
      'common.actions.save',
      'common.languages.ru',
      'shared.webSnapshot.productName',
      'videoEditor.app.title',
    ];

    expect(knownKeys).toHaveLength(4);
    expect(createTranslator('en')('common.actions.save')).toBe('Save');
    expect(translate('settings.appearance.title', 'ru')).toBe('Интерфейс');
    expect(translate('common.languages.ru', 'en')).toBe('Russian');
    expect(translate('content.toolbar.quickEditDocumentModeLabel', 'ru')).toBe(
      'Свободное редактирование'
    );
    expect(translate('content.toolbar.quickEditDocumentModeEnable', 'en')).toBe(
      'Edit text directly on the page'
    );
    expect(translate('content.toolbar.quickEditDocumentModeDisable', 'en')).toBe(
      'Turn off free text edit'
    );
    expect(translate('content.toolbar.localHtmlSaveLabel', 'ru')).toBe(
      'Сохранить подготовленную HTML-страницу'
    );
    expect(translate('content.toolbar.localHtmlSaveSaved', 'en')).toBe('Prepared HTML page saved');
  });

  it('falls back to the default locale dictionary for unsupported locale ids', () => {
    const dictionary = getDictionary('fr' as AppLocale);

    expect(dictionary.common.actions.cancel).toBe('Отмена');
    expect(DEFAULT_LOCALE).toBe('ru');
  });

  it('derives locale registry metadata for supported locales and Intl formatting', () => {
    expect(SUPPORTED_LOCALES).toEqual(['ru', 'en']);
    expect(formatNumber(1234.5, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, 'en')).toBe(
      '1,234.5'
    );
    expect(
      formatNumber(1234.5, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, 'ru')
    ).toMatch(/1(?:\s|\u00A0|\u202F)234,5/);
  });
});

describe('Web Snapshot i18n naming', () => {
  it('keeps shared Web Snapshot naming stable across locales', () => {
    expect(translate('shared.webSnapshot.productName', 'ru')).toBe('Sniptale Веб-снимок');
    expect(translate('shared.webSnapshot.singularName', 'ru')).toBe('Веб-снимок');
    expect(translate('shared.webSnapshot.pluralName', 'ru')).toBe('Веб-снимки');
    expect(translate('shared.webSnapshot.productName', 'en')).toBe('Sniptale Web Snapshot');
    expect(translate('shared.webSnapshot.singularName', 'en')).toBe('Web Snapshot');
    expect(translate('shared.webSnapshot.pluralName', 'en')).toBe('Web Snapshots');
    expect(translate('popup.export.saveWebSnapshotTitle', 'ru')).toBe('Сохранить снимок');
    expect(translate('gallery.preview.folderWebSnapshot', 'ru')).toBe('Веб-снимки');
    expect(translate('shared.mediaHub.saveWebSnapshotAction', 'ru')).toBe(
      'сохранение Веб-снимка в Галерею'
    );
    expect(translate('webSnapshotViewer.app.documentTitleFallback', 'en')).toBe(
      'Sniptale Web Snapshot'
    );
    expect(translate('gallery.preview.kindWebSnapshot', 'en')).toBe('Web Snapshot');
    expect(translate('gallery.preview.folderWebSnapshot', 'en')).toBe('Web Snapshots');
  });
});

describe('Video annotation recovery i18n', () => {
  it('keeps built-in template copy user-facing in Russian', () => {
    const russianCopy = [
      translate('videoEditor.sidebar.annotationTemplates.workflow-boot-introLabel', 'ru'),
      translate('videoEditor.sidebar.annotationTemplates.diff-spotlightLabel', 'ru'),
      translate('videoEditor.sidebar.annotationTemplates.workflow-boot-introDescription', 'ru'),
      translate('videoEditor.sidebar.annotationTemplates.diff-spotlightUseCase', 'ru'),
    ].join(' ');

    expect(russianCopy).not.toContain('JSON');
    expect(russianCopy).not.toContain('Workflow Intro');
    expect(russianCopy).not.toContain('Change Spotlight');
    expect(russianCopy).not.toContain('opener');
    expect(russianCopy).not.toContain('before/after');
  });
});
