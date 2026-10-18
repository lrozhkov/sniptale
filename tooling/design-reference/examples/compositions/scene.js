import { ParameterRow } from '../shared/parameter-row.js';
import { el } from '../shared/dom.js';
import { NumericField } from '../shared/numbers.js';
import { createDropdown } from '../shared/choices.js';
import { PropertyChoice } from '../shared/property-choice.js';
import { ActionButton } from '../shared/buttons.js';
import { ModalDialog } from '../shared/modal-dialog.js';
import { propertyRow, status, note, inspector } from '../shared/composition-layout.js';

function dropdown(parent, label, options, value, config = {}) {
  const field = el('div');
  const row = ParameterRow({
    label,
    content: field,
  });
  parent.append(row.element);
  const choice = createDropdown(field, label, options, value, config);
  return choice;
}
export function SceneComposition(parent) {
  const column = inspector(parent),
    result = status('Холст: 1742 × 1098 · свой формат');
  let width = 1742,
    height = 1098,
    crop = 8,
    customSize = { width: 1742, height: 1098 };
  const formats = [
    { value: 'source', label: 'Исходные · 1920 × 1080' },
    { value: 'wide', label: '16:9 · Широкий' },
    { value: 'vertical', label: '9:16 · Вертикальный' },
    { value: 'square', label: '1:1 · Квадрат' },
    { value: 'custom', label: 'Свой · 1742 × 1098' },
  ];
  const format = dropdown(column, 'Пропорции холста', formats, 'custom', {
    onChange: (value) => {
      if (value === 'source') {
        width = 1920;
        height = 1080;
      } else if (value === 'custom') {
        width = customSize.width;
        height = customSize.height;
      } else {
        const r = value === 'wide' ? 16 / 9 : value === 'vertical' ? 9 / 16 : 1;
        [width, height] = r >= 1 ? [Math.round(1080 * r), 1080] : [1080, Math.round(1080 / r)];
      }
      resolution.setOptions(resolutions());
      resolution.setValue('current');
      paint();
    },
  });
  function resolutions() {
    const r = width / height;
    return [
      { value: 'current', label: width + ' × ' + height + ' · текущее' },
      ...[720, 1080, 2160].map((edge) => ({
        value: String(edge),
        label:
          (r >= 1 ? Math.round(edge * r) : edge) + ' × ' + (r >= 1 ? edge : Math.round(edge / r)),
      })),
    ];
  }
  const resolution = dropdown(column, 'Разрешение холста', resolutions(), 'current', {
    onChange: (value) => {
      if (value !== 'current') {
        const r = width / height,
          edge = Number(value);
        [width, height] = r >= 1 ? [Math.round(edge * r), edge] : [edge, Math.round(edge / r)];
        customSize = { width, height };
        format.setOptions(
          formats.map((o) =>
            o.value === 'custom' ? { ...o, label: 'Свой · ' + width + ' × ' + height } : o
          )
        );
        format.setValue('custom');
        resolution.setOptions(resolutions());
        resolution.setValue('current');
        paint();
      }
    },
  });
  function paint() {
    result.textContent = 'Холст: ' + width + ' × ' + height + ' · ' + format.getLabel();
  }
  const cropField = NumericField({
      label: 'Пробный отступ кадра',
      value: crop,
      min: 0,
      max: 40,
      unit: '%',
      variant: 'ordinary',
    }),
    dialog = ModalDialog({
      theme: parent.closest('.theme'),
      title: 'Черновик кадрирования',
      content: [
        cropField.element,
        el('p', {
          text: 'Числовая проба транзакции. Полный crop-инструмент сохраняет своего владельца.',
        }),
      ],
      onAccept: () => {
        if (!cropField.commit()) return false;
        crop = cropField.value;
        result.textContent = 'Кадрирование принято: ' + crop + '%';
      },
      onCancel: () => cropField.setValue(crop),
    }),
    edit = ActionButton({
      label: 'Изменить кадрирование',
      onClick: () => {
        cropField.setValue(crop);
        dialog.open(edit);
      },
    });
  edit.hidden = true;
  const mode = PropertyChoice({
    label: 'Размещение исходника',
    options: [
      { value: 'fit', label: 'Вписать' },
      { value: 'crop', label: 'Обрезать' },
    ],
    value: 'fit',
    onChange: (value) => (edit.hidden = value !== 'crop'),
  });
  column.append(propertyRow('Размещение исходника', mode), edit, result);
  note(
    parent,
    'Меню раскрывается по всей ширине колонки. Исходный и нестандартный размеры остаются явными значениями.'
  );
}
