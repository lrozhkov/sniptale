import { el } from '../shared/dom.js';
import { Checkbox } from '../shared/selection.js';
import { createDropdown } from '../shared/choices.js';
import { PropertyChoice } from '../shared/property-choice.js';
import { InlineCurtain } from '../shared/inline-curtain.js';
import { note } from '../shared/composition-layout.js';

export function RecordingSettingsComposition(parent) {
  const popup = el('div', { class: 'recording-probe' });
  parent.append(popup);
  let previous = 'tab',
    webcamValue = false;
  const webcam = Checkbox({ layout: 'parameter', label: 'Камера в записи', checked: false }),
    reason = el('p', { class: 'field-description', text: 'В режиме камеры источник обязателен.' });
  reason.hidden = true;
  const sizing = el('div', { class: 'field' }),
    screenCount = el('div', { class: 'field' }),
    area = el('div', { class: 'field' });
  popup.append(sizing, screenCount, area);
  createDropdown(
    sizing,
    'Размер записи',
    [
      { value: 'source', label: 'Исходный размер' },
      { value: 'hd', label: '1920 × 1080' },
    ],
    'source'
  );
  createDropdown(
    screenCount,
    'Количество источников',
    [
      { value: 'one', label: 'Один' },
      { value: 'multiple', label: 'Несколько' },
    ],
    'one'
  );
  createDropdown(
    area,
    'Область вкладки',
    [
      { value: 'full', label: 'Вся вкладка' },
      { value: 'area', label: 'Выбрать область' },
    ],
    'full'
  );
  const codecField = el('div', { class: 'field' }),
    codecNotice = el('p', { class: 'field-description' }),
    settings = el('div', { class: 'composition-group' }, codecField),
    fpsField = el('div', { class: 'field' });
  settings.append(fpsField, codecNotice);
  const settingsHost = el('div', { hidden: true }, settings);
  popup.append(settingsHost);
  let codec,
    formatValue = 'webm';
  function paintCodecNotice() {
    codecNotice.textContent =
      formatValue === 'mp4' && codec.getValue() === 'vp9'
        ? 'Выбранный VP9 недоступен для MP4. Выберите другой кодек.'
        : '';
  }
  const format = PropertyChoice({
    label: 'Формат файла',
    value: 'webm',
    options: [
      { value: 'webm', label: 'WebM' },
      { value: 'mp4', label: 'MP4' },
    ],
    onChange: (value) => {
      formatValue = value;
      codec.setOptions([
        {
          value: 'vp9',
          label: 'VP9',
          disabled: value === 'mp4',
          description: value === 'mp4' ? 'Недоступен для MP4' : '',
        },
        { value: 'h264', label: 'H.264' },
      ]);
      paintCodecNotice();
    },
  });
  settings.prepend(format.element);
  const quality = InlineCurtain({
    label: 'Качество',
    value: 'high',
    options: [
      { value: 'high', label: 'Высокое' },
      { value: 'balanced', label: 'Сбалансированное' },
    ],
    settings: [settings],
  });
  popup.append(quality.element);
  codec = createDropdown(
    codecField,
    'Кодек',
    [
      { value: 'vp9', label: 'VP9' },
      { value: 'h264', label: 'H.264' },
    ],
    'vp9',
    { onChange: paintCodecNotice }
  );
  createDropdown(
    fpsField,
    'Частота кадров',
    [
      { value: '30', label: '30 кадров/с' },
      {
        value: '60',
        label: '60 кадров/с',
        disabled: true,
        description: 'Не поддерживается текущим источником',
      },
    ],
    '30'
  );
  quality.element.append(el('div', { class: 'curtain-context' }, [webcam.element, reason]));
  function change(mode) {
    if (mode === 'camera') {
      if (previous !== 'camera') webcamValue = webcam.value;
      webcam.setState({ checked: true, disabled: true });
    } else if (previous === 'camera') webcam.setState({ checked: webcamValue, disabled: false });
    previous = mode;
    sizing.hidden = mode === 'camera';
    screenCount.hidden = mode !== 'screen';
    area.hidden = mode !== 'tab';
    reason.hidden = mode !== 'camera';
  }
  popup.prepend(
    PropertyChoice({
      label: 'Режим записи',
      value: 'tab',
      options: [
        { value: 'tab', label: 'Вкладка' },
        { value: 'screen', label: 'Экран' },
        { value: 'camera', label: 'Камера' },
      ],
      onChange: change,
    }).element
  );
  change('tab');
  note(
    parent,
    'Поведенческая проба зависимостей popup. Реальные размеры и оформление popup ' +
      'сохраняют его собственные паттерны; общие desktop-правила не переносятся ' +
      'автоматически.'
  );
}
