import { el, exampleCase } from '../shared/dom.js';
import { NumericField } from '../shared/numbers.js';
export function render(root, { manifest }) {
  const meta = (key) => manifest.cases.find((c) => c.id === 'numbers.' + key);
  const add = (key, props, note) => {
    const state = el('p', {
      class: 'reference-status',
      role: 'status',
      text:
        'Принято: ' +
        (props.value === null ? 'разные значения' : props.value + ' ' + (props.unit || '')),
    });
    const field = NumericField({
      ...props,
      onPreview: (value) =>
        (state.textContent =
          'Предпросмотр: ' +
          (value === null ? 'разные значения' : value + ' ' + (props.unit || ''))),
      onComplete: (value) =>
        (state.textContent =
          'Принято: ' + (value === null ? 'разные значения' : value + ' ' + (props.unit || ''))),
    });
    root.append(
      exampleCase(meta(key), [
        el('div', { class: 'case-stage' }, [field.element, state]),
        el('p', { text: note }),
      ])
    );
    return field;
  };
  add(
    'contextual-editing',
    { label: 'Размер', value: 32, min: 10, max: 60, unit: 'px' },
    'Наведите на строку или перейдите к slider клавишей Tab. Во время ввода числа ' +
      'slider скрывается. Escape отменяет черновик.'
  );
  add(
    'ordinary',
    { label: 'Непрозрачность', value: 64, min: 0, max: 100, unit: '%', variant: 'ordinary' },
    'Обычная дорожка остаётся видимой. Точное поле и slider используют одно значение и один акцент темы.'
  );
  add(
    'limits-step',
    { label: 'Радиус', value: 20, min: 0, max: 100, step: 5, unit: 'px', stepper: true },
    'Стрелки меняют значение на 5. Удержание повторяет шаг. Увеличенные цели ' +
      'stepper — вариант для проверки, не утверждённый размер.'
  );
  add(
    'mixed',
    { label: 'Смещение выбранных объектов', value: null, min: -50, max: 50, unit: 'px' },
    'Для разных значений не показывается выдуманная позиция бегунка. Введите число, чтобы явно применить одно значение.'
  );
  add(
    'invalid',
    { label: 'Ширина', value: 320, min: 100, max: 800, unit: 'px' },
    'Попробуйте значение вне диапазона или текст. Ошибка не уничтожает ввод. ' +
      'Исправление принимает корректное число; Escape возвращает принятое.'
  );
  add(
    'disabled',
    { label: 'Высота', value: 240, min: 100, max: 800, unit: 'px', disabled: true },
    'Значение сохранено. Редактирование недоступно в текущем примере.'
  );
  add(
    'precision-units',
    { label: 'Длительность', value: 1.25, min: 0, max: 5, step: 0.25, precision: 2, unit: 'с' },
    'Точный ввод допускает десятичную точку или запятую. Шаг применяется к ' +
      'стрелкам и перетаскиванию; точное значение может находиться между шагами.'
  );
  add(
    'separate-bounds',
    {
      label: 'Отступ фона',
      value: 640,
      min: 0,
      max: 4096,
      scrubMin: 0,
      scrubMax: 200,
      unit: 'px',
      variant: 'contextual',
    },
    'Ввод: 0–4096 px. Слайдер: 0–200 px. Принятое значение вне шкалы сохраняется; ' +
      'вход и выход из слайдера его не меняет.'
  );
  add(
    'range-only',
    {
      label: 'Усиление микрофона',
      value: 75,
      min: 0,
      max: 100,
      unit: '%',
      variant: 'ordinary',
      editable: false,
    },
    'Значение доступно для чтения. Изменение только слайдером — существующая механика настройки устройства.'
  );
}
