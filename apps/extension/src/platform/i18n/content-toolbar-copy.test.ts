import { describe, expect, it } from 'vitest';

import { translate, type AppLocale, type TranslationKey } from '.';

type ExpectedCopy = Record<AppLocale, string>;

const FRIENDLY_MAIN_TOOLBAR_COPY = {
  'content.toolbar.captureAskPresetLabel': {
    ru: 'Выбрать папку',
    en: 'Choose a folder',
  },
  'content.toolbar.captureAskPresetHint': {
    ru: 'Выбрать одну из сохранённых папок внутри «Загрузок»',
    en: 'Choose one of your saved folders inside Downloads',
  },
  'content.toolbar.captureCopyLabel': {
    ru: 'Копировать изображение',
    en: 'Copy image',
  },
  'content.toolbar.captureScenarioLabel': {
    ru: 'Добавить в сценарий',
    en: 'Add to scenario',
  },
  'content.toolbar.captureEditLabel': {
    ru: 'Открыть в редакторе',
    en: 'Open in editor',
  },
  'content.toolbar.timerThreeHint': {
    ru: 'Хватит, чтобы открыть меню или подсказку',
    en: 'Enough time to open a menu or tooltip',
  },
  'content.toolbar.timerTenHint': {
    ru: 'Время, чтобы открыть вложенные меню и вернуться к странице',
    en: 'Enough time to open nested menus and return to the page',
  },
  'content.toolbar.visibleArea': {
    ru: 'Снимок видимой области',
    en: 'Capture visible area',
  },
  'content.toolbar.fullPage': {
    ru: 'Снимок всей страницы',
    en: 'Capture full page',
  },
  'content.toolbar.selectionArea': {
    ru: 'Выбрать область для снимка',
    en: 'Select an area to capture',
  },
  'content.toolbar.screenshotDelayTooltip': {
    ru: 'Задержка перед снимком',
    en: 'Delay before screenshot',
  },
  'content.toolbar.delayTitle': {
    ru: 'Задержка перед снимком',
    en: 'Delay before screenshot',
  },
  'content.toolbar.viewportButton': {
    ru: 'Размер окна для снимка',
    en: 'Window size for screenshot',
  },
  'content.toolbar.viewportMenuTitle': {
    ru: 'Размер окна',
    en: 'Window size',
  },
  'content.toolbar.viewportNativeLabel': {
    ru: 'Текущий размер',
    en: 'Current size',
  },
  'content.toolbar.viewportNativeHint': {
    ru: 'Использовать текущий размер окна для снимков',
    en: 'Use the current window size for screenshots',
  },
  'content.toolbar.cursorLabel': {
    ru: 'Навигация',
    en: 'Navigate',
  },
  'content.toolbar.cursorDefault': {
    ru: 'Обычная работа со страницей',
    en: 'Interact with the page normally',
  },
  'content.toolbar.cursorDescription': {
    ru: 'Переходите по ссылкам, прокручивайте страницу и взаимодействуйте с её элементами',
    en: 'Interact with the page normally',
  },
  'content.toolbar.aiEnable': {
    ru: 'Выберите элемент на странице и опишите изменение',
    en: 'Select a page element and describe the change',
  },
  'content.toolbar.quickEditLabel': {
    ru: 'Редактирование контента',
    en: 'Content editing',
  },
  'content.toolbar.quickEditEnable': {
    ru: 'Выбирайте блоки, редактируйте текст напрямую или используйте ИИ',
    en: 'Select blocks, edit text directly, or use AI',
  },
  'content.toolbar.quickEditBlockSelectionLabel': {
    ru: 'Выбор блоков',
    en: 'Select blocks',
  },
  'content.toolbar.quickEditBlockSelectionEnable': {
    ru: 'Выбирать блоки для редактирования',
    en: 'Select blocks to edit',
  },
  'content.toolbar.highlighterEnable': {
    ru: 'Добавляйте рамки, маски, размытие и комментарии',
    en: 'Add frames, masks, blur, and comments',
  },
  'content.toolbar.autoBlur': {
    ru: 'Размытие данных',
    en: 'Sensitive data blur',
  },
  'content.toolbar.modeMenuTitle': {
    ru: 'Режим работы',
    en: 'Working mode',
  },
  'content.toolbar.panelHorizontal': {
    ru: 'Горизонтальный вид',
    en: 'Horizontal view',
  },
  'content.toolbar.panelHorizontalHint': {
    ru: 'Расположить кнопки в одну строку',
    en: 'Arrange buttons in one row',
  },
  'content.toolbar.panelVertical': {
    ru: 'Вертикальный вид',
    en: 'Vertical view',
  },
  'content.toolbar.panelVerticalHint': {
    ru: 'Расположить секции друг под другом',
    en: 'Stack sections vertically',
  },
  'content.toolbar.compactMenusHint': {
    ru: 'Скрыть описания и уменьшить высоту пунктов меню',
    en: 'Hide descriptions and reduce the height of menu items',
  },
  'content.toolbar.pinToTab': {
    ru: 'Закрепить панель во вкладке',
    en: 'Pin toolbar to this tab',
  },
  'content.toolbar.pinToTabLockedHint': {
    ru: 'Панель закреплена, пока включён сценарий',
    en: 'The toolbar stays pinned while scenario mode is on',
  },
  'content.toolbar.pinToTabUnavailableHint': {
    ru: 'Разрешите расширению доступ ко всем сайтам, чтобы панель восстанавливалась после переходов',
    en: 'Allow the extension on all sites so the toolbar can return after navigation',
  },
  'content.toolbar.hideToolbar': {
    ru: 'Свернуть',
    en: 'Collapse',
  },
  'content.toolbar.screenshotDisable': {
    ru: 'Закрыть',
    en: 'Close',
  },
  'content.autoBlur.autoApplyEnableHint': {
    ru: 'Автоматически размывать найденные данные перед каждым снимком',
    en: 'Automatically blur detected data before every screenshot',
  },
  'content.autoBlur.applyOnce': {
    ru: 'Размыть данные сейчас',
    en: 'Blur data now',
  },
  'content.autoBlur.applyOnceSuccess': {
    ru: 'Найденные данные скрыты: {count}',
    en: 'Detected data blurred: {count}',
  },
  'content.autoBlur.applyOnceEmpty': {
    ru: 'Данные для размытия не найдены',
    en: 'No data to blur found',
  },
  'content.autoBlur.applyOnceError': {
    ru: 'Не удалось найти и размыть данные',
    en: 'Could not find and blur data',
  },
  'content.autoBlur.applyOnceHint': {
    ru: 'Найти и размыть данные на текущей странице',
    en: 'Find and blur data on the current page',
  },
  'content.autoBlur.configure': {
    ru: 'Настроить',
    en: 'Configure',
  },
  'content.autoBlur.configureHint': {
    ru: 'Выбрать типы данных, проверить найденное и настроить размытие',
    en: 'Choose data types, review matches, and adjust blur',
  },
  'scenario.content.project': {
    ru: 'Проект сценария',
    en: 'Scenario project',
  },
  'scenario.content.projectButton': {
    ru: 'Выбрать проект',
    en: 'Choose project',
  },
  'scenario.content.projectMenuTitle': {
    ru: 'Выберите проект сценария',
    en: 'Choose a scenario project',
  },
  'scenario.content.modeManual': {
    ru: 'Кнопкой снимка',
    en: 'Screenshot button',
  },
  'scenario.content.modeManualHint': {
    ru: 'Добавлять шаг после нажатия кнопки снимка на панели',
    en: 'Add a step when you use a screenshot button on the toolbar',
  },
  'scenario.content.modeByClick': {
    ru: 'Кликом по странице',
    en: 'Clicking the page',
  },
  'scenario.content.modeByClickHint': {
    ru: 'Добавлять шаг при клике по элементу страницы',
    en: 'Add a step when you click a page element',
  },
  'scenario.content.modeByClickDisabledHint': {
    ru: 'Сначала выключите аннотации и редактирование контента',
    en: 'Turn off annotations and content editing first',
  },
  'scenario.content.captureMode': {
    ru: 'Как добавлять шаги',
    en: 'How to add steps',
  },
  'scenario.content.sidebarShow': {
    ru: 'Показать шаги сценария',
    en: 'Show scenario steps',
  },
  'scenario.content.sidebarHide': {
    ru: 'Скрыть шаги сценария',
    en: 'Hide scenario steps',
  },
  'scenario.content.projectSearchPlaceholder': {
    ru: 'Поиск или название нового проекта',
    en: 'Search or enter a new project name',
  },
} satisfies Partial<Record<TranslationKey, ExpectedCopy>>;

describe('main content toolbar copy', () => {
  it.each(Object.entries(FRIENDLY_MAIN_TOOLBAR_COPY))(
    'keeps %s understandable without implementation jargon',
    (key, expected) => {
      expect(translate(key as TranslationKey, 'ru')).toBe(expected.ru);
      expect(translate(key as TranslationKey, 'en')).toBe(expected.en);
    }
  );
});
