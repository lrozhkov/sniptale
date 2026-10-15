import { el } from './dom.js';
import { TextField } from './fields.js';
import { NumericField } from './numbers.js';
import { ActionButton } from './buttons.js';
import { AnchoredLayer } from './layers.js';
export function ColorEditor({ parent, label = 'Цвет', value = '#c2410cff' }) {
  let accepted = value,
    draft = value,
    layer;
  const swatch = ActionButton({ label: 'Открыть выбор цвета', kind: 'utility', iconOnly: true });
  swatch.classList.add('color-swatch');
  const summary = el('p', {
      class: 'layer-feedback',
      role: 'status',
      text: 'Принято: ' + accepted,
    }),
    preview = el('div', { class: 'color-preview', 'aria-hidden': 'true' });
  const valid = (v) => /^#[0-9a-f]{6}$|^#[0-9a-f]{8}$/i.test(v);
  const direct = TextField({
    label,
    value,
    clearable: false,
    selectOnFocus: true,
    context: 'inspector',
    validate: (v) => (valid(v) ? '' : 'Введите HEX: #RRGGBB или #RRGGBBAA.'),
    onPreview: (v) => {
      if (valid(v)) {
        draft = v;
        paint();
      }
    },
    onCommit: (v) => {
      accepted = draft = v;
      paint();
      summary.textContent = 'Принято: ' + accepted;
    },
  });
  const element = el('div', { class: 'color-parameter' }, [
    el('div', { class: 'color-entry' }, [direct.element, swatch]),
    summary,
  ]);
  parent.append(element);
  const hex = TextField({
    label: 'Цвет HEX',
    value,
    clearable: false,
    selectOnFocus: true,
    validate: (v) => (valid(v) ? '' : 'Введите HEX: #RRGGBB или #RRGGBBAA.'),
    onPreview: (v) => {
      if (valid(v)) {
        draft = v;
        alpha.setValue(Math.round((parseInt(v.length === 9 ? v.slice(7) : 'ff', 16) / 255) * 100));
        paint();
      }
    },
  });
  const alpha = NumericField({
    label: 'Непрозрачность цвета',
    value: 100,
    min: 0,
    max: 100,
    unit: '%',
    variant: 'ordinary',
    onPreview: (opacity) => setAlpha(opacity),
    onCommit: (opacity) => setAlpha(opacity),
    onComplete: (_value, { reason }) => {
      if (reason === 'cancel') alpha.input.blur();
    },
  });
  function setAlpha(opacity) {
    draft =
      draft.slice(0, 7) +
      Math.round((opacity / 100) * 255)
        .toString(16)
        .padStart(2, '0');
    hex.input.value = draft;
    hex.validate();
    paint();
  }
  const palette = el('div', { class: 'color-palette', role: 'group', 'aria-label': 'Палитра' });
  for (const color of ['#c2410c', '#4f6377', '#547354', '#b0905d', '#7a5974']) {
    const button = ActionButton({
      label: color,
      kind: 'utility',
      iconOnly: true,
      onClick: () => {
        draft = color + (draft.length === 9 ? draft.slice(7) : '');
        hex.input.value = draft;
        hex.validate();
        paint();
      },
    });
    button.style.setProperty('--swatch', color);
    palette.append(button);
  }
  const eyeStatus = el('p', { class: 'field-description' }),
    eye = ActionButton({
      label: 'Выбрать цвет с экрана',
      kind: 'utility',
      disabled: typeof window.EyeDropper !== 'function',
    });
  if (eye.disabled) eyeStatus.textContent = 'Пипетка недоступна в этом браузере.';
  eye.addEventListener('click', async () => {
    if (layer.suspended) return;
    layer.suspended = true;
    eye.setAttribute('aria-disabled', 'true');
    eyeStatus.textContent = 'Выберите цвет в окне браузера. Escape отменяет пипетку.';
    try {
      const result = await new window.EyeDropper().open();
      draft = result.sRGBHex + (draft.length === 9 ? draft.slice(7) : '');
      hex.input.value = draft;
      hex.validate();
      paint();
      eyeStatus.textContent = 'Цвет получен из браузера.';
    } catch {
      eyeStatus.textContent = 'Пипетка отменена. Цвет сохранён.';
    } finally {
      layer.suspended = false;
      eye.removeAttribute('aria-disabled');
    }
  });
  const cancel = ActionButton({ label: 'Отмена', onClick: () => layer.close('cancel') }),
    apply = ActionButton({
      label: 'Применить',
      kind: 'primary',
      onClick: () => {
        if (!hex.validate()) {
          hex.input.focus();
          return;
        }
        if (!alpha.commit()) {
          alpha.input.focus();
          return;
        }
        draft = hex.draft;
        accepted = draft;
        direct.setValue(accepted);
        summary.textContent = 'Принято: ' + accepted;
        layer.close('accept');
      },
    });
  const body = el('div', {}, [
    preview,
    palette,
    hex.element,
    alpha.element,
    eye,
    eyeStatus,
    el('div', { class: 'layer-actions' }, [cancel, apply]),
  ]);
  layer = AnchoredLayer({
    trigger: swatch,
    content: body,
    label: 'Выбор цвета',
    width: 320,
    onDismiss: (reason) => {
      if (reason !== 'accept') {
        draft = accepted;
        direct.setValue(accepted);
        paint();
      }
    },
  });
  swatch.addEventListener('click', () => {
    if (layer.visible) {
      draft = accepted;
      hex.setValue(accepted);
      alpha.setValue(
        Math.round((parseInt(accepted.length === 9 ? accepted.slice(7) : 'ff', 16) / 255) * 100)
      );
      paint();
    }
  });
  function paint() {
    swatch.style.setProperty('--swatch', draft);
    preview.style.setProperty('--preview', draft);
  }
  paint();
  return {
    element,
    layer,
    direct,
    get value() {
      return accepted;
    },
  };
}
