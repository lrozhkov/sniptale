import { expect, it } from 'vitest';
import { createTranslator, translate } from './popup';

it('resolves every popup-owned message domain without loading unrelated dictionaries', () => {
  const translateEn = createTranslator('en');

  expect(translateEn('popup.tabs.home')).toBe('Screenshots');
  expect(translateEn('common.states.error')).toBe('Error');
  expect(translateEn('settings.quickActions.delayNone')).toBe('No delay');
  expect(translateEn('viewportPresets.section.nativeOption')).toBe('Current size');
  expect(translateEn('shared.ui.commandPaletteActionsSection')).not.toContain('.');
  expect(translateEn('content.runtime.exportCancelled')).not.toContain('.');
  expect(translateEn('background.runtime.recordingUnavailable')).not.toContain('.');
  expect(translateEn('exportModal.phaseScanning')).toBe('Scanning...');
  expect(translate('popup.tabs.export', 'ru')).toBe('Экспорт');
});

it('resolves every content toolbar key used by popup Tools', () => {
  const translateRu = createTranslator('ru');
  const toolKeys = [
    'content.toolbar.drawingLabel',
    'content.toolbar.drawingEnable',
    'content.toolbar.highlighterLabel',
    'content.toolbar.highlighterEnable',
    'content.toolbar.quickEditLabel',
    'content.toolbar.quickEditEnable',
    'content.toolbar.designReviewLabel',
    'content.toolbar.designReviewEnable',
    'content.toolbar.videoRecordingLabel',
    'content.toolbar.videoRecordingEnable',
  ] as const;

  for (const key of toolKeys) expect(translateRu(key)).not.toBe(key);
});

it('returns the key when a non-popup message is requested', () => {
  expect(translate('settings.navigation.ai', 'en')).toBe('settings.navigation.ai');
});
