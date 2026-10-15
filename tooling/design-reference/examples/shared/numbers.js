import { bindSelectAllOnFocus } from './input-selection.js';
import './button-press.js';
import { el } from './dom.js';
import { bindFieldLabel } from './field-label.js';
let serial = 0;
export function NumericField({
  label,
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  precision = 0,
  unit = '',
  variant = 'contextual',
  disabled = false,
  stepper = false,
  onPreview,
  onCommit,
  onComplete,
  enterBehavior = 'next',
  scrubMin = min,
  scrubMax = max,
  editable = true,
}) {
  const id = 'reference-number-' + ++serial,
    abort = new AbortController();
  let accepted = value,
    lastValid = value,
    timer = null,
    interval = null,
    dragStart = value;
  const input = el('input', {
    id,
    type: 'text',
    inputmode: 'decimal',
    role: 'spinbutton',
    'data-numeric-value': '',
    'aria-label': label,
    'aria-valuemin': String(min),
    'aria-valuemax': String(max),
    'aria-describedby': id + '-error',
  });
  input.disabled = disabled;
  input.readOnly = !editable;
  if (!editable) {
    input.tabIndex = -1;
    input.setAttribute('aria-readonly', 'true');
  }
  input.placeholder = 'Разные значения';
  const units = el('span', { class: 'number-unit', text: unit }),
    valueShell = el('div', { class: 'number-value-shell' }, [input, units]),
    row = el('div', { class: 'number-row' }, [
      el('label', { class: 'number-label', for: id, text: label }),
      valueShell,
    ]),
    wrap = el('div', { class: 'number-row-wrap' }, row),
    error = el('div', { id: id + '-error', class: 'number-error', role: 'alert' });
  bindFieldLabel(row.querySelector('label'), input);
  if (editable) bindSelectAllOnFocus(input);
  const range = el('input', {
    type: 'range',
    min: String(scrubMin),
    max: String(scrubMax),
    step: 'any',
    class:
      'sniptale-range number-range' + (variant === 'contextual' ? ' sniptale-range--edge' : ''),
    'aria-label': label + ' — слайдер',
  });
  range.disabled = disabled;
  const track = el('span', { class: 'context-track', 'aria-hidden': 'true' }),
    rangeShell =
      variant === 'contextual'
        ? el('div', { class: 'context-range-shell' }, [track, range])
        : range;
  const rangeNote = el('p', { class: 'range-domain-note', id: id + '-domain' });
  range.setAttribute('aria-describedby', rangeNote.id);
  wrap.append(rangeShell);
  const element = el(
    'div',
    {
      class: 'ref-number',
      'data-variant': variant,
      'data-disabled': String(disabled),
      'data-stepper': String(stepper),
    },
    [wrap, rangeNote, error]
  );
  const format = (number) => (number === null ? '' : String(Number(number.toFixed(precision))));
  const parse = () => {
    const text = input.value.trim().replace(',', '.');
    if (!/^[+-]?\d+$/.test(text) && !/^[+-]?\d+\.\d*$/.test(text) && !/^[+-]?\.\d+$/.test(text))
      return null;
    const number = Number(text);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  };
  function paintRange(next) {
    const mixed = next === null;
    element.dataset.mixed = String(mixed);
    range.hidden = mixed;
    if (next !== null) {
      range.value = String(next);
      const outside = next < scrubMin || next > scrubMax;
      element.dataset.outsideRange = String(outside);
      rangeNote.textContent = outside
        ? 'Вне шкалы слайдера: ' + scrubMin + '–' + scrubMax + (unit ? ' ' + unit : '')
        : '';
      const ratio = (outside ? 0 : ((next - scrubMin) / (scrubMax - scrubMin || 1)) * 100) + '%';
      element.style.setProperty('--sniptale-range-fill-ratio', ratio);
      range.style.setProperty('--sniptale-range-fill-ratio', ratio);
      input.setAttribute('aria-valuenow', String(next));
      range.setAttribute('aria-valuetext', format(next) + (unit ? ' ' + unit : ''));
      input.setAttribute('aria-valuetext', format(next) + (unit ? ' ' + unit : ''));
    } else {
      input.removeAttribute('aria-valuenow');
      input.setAttribute('aria-valuetext', 'Разные значения');
    }
  }
  function clearError() {
    input.removeAttribute('aria-invalid');
    error.textContent = '';
  }
  function commit() {
    if (accepted === null && input.value.trim() === '') {
      clearError();
      onComplete?.(accepted, { reason: 'commit' });
      return true;
    }
    const next = parse();
    if (next === null) {
      input.setAttribute('aria-invalid', 'true');
      error.textContent =
        'Введите число от ' +
        min +
        ' до ' +
        max +
        (unit ? ' ' + unit : '') +
        '. Введённый текст сохранён.';
      return false;
    }
    const normalized = Number(next.toFixed(precision)),
      changed = accepted !== normalized;
    accepted = lastValid = normalized;
    input.value = format(normalized);
    paintRange(normalized);
    clearError();
    if (changed) onCommit?.(normalized);
    onComplete?.(normalized, { reason: 'commit' });
    return true;
  }
  function restore() {
    rangeEdited = false;
    input.value = format(accepted);
    lastValid = accepted;
    paintRange(accepted);
    clearError();
    onPreview?.(accepted);
    onComplete?.(accepted, { reason: 'cancel' });
  }
  function setEditing(next) {
    element.dataset.editing = String(next);
    if (variant === 'contextual') {
      range.tabIndex = next ? -1 : 0;
      if (next) rangeShell.setAttribute('aria-hidden', 'true');
      else rangeShell.removeAttribute('aria-hidden');
    }
  }
  function applyStep(direction, lower = min, upper = max) {
    if (disabled) return;
    const current = parse() ?? accepted ?? min,
      next = Number(
        Math.min(upper, Math.max(lower, current + direction * step)).toFixed(precision)
      );
    input.value = format(next);
    onPreview?.(next);
    commit();
  }
  function stopRepeat() {
    clearTimeout(timer);
    clearInterval(interval);
    timer = interval = null;
  }
  function arrow(up) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', up ? 'M3 10 L8 5 L13 10' : 'M3 6 L8 11 L13 6');
    svg.append(path);
    svg.setAttribute('aria-hidden', 'true');
    return svg;
  }
  if (stepper) {
    const controls = el('span', { class: 'number-stepper' });
    for (const direction of [1, -1]) {
      const button = el(
        'button',
        {
          type: 'button',
          'data-repeat-command': '',
          'aria-label': label + (direction === 1 ? ' — увеличить' : ' — уменьшить'),
        },
        arrow(direction === 1)
      );
      button.disabled = disabled;
      button.addEventListener('pointerdown', (event) => {
        if (disabled) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        stopRepeat();
        applyStep(direction);
        timer = setTimeout(() => {
          interval = setInterval(() => applyStep(direction), 70);
        }, 220);
      });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
        button.addEventListener(event, stopRepeat);
      button.addEventListener('click', (event) => {
        if (event.detail === 0) applyStep(direction);
      });
      controls.append(button);
    }
    valueShell.append(controls);
  }
  window.addEventListener('pointerup', stopRepeat, { signal: abort.signal });
  window.addEventListener('blur', stopRepeat, { signal: abort.signal });
  input.addEventListener('focus', () => setEditing(editable));
  input.addEventListener('blur', () => {
    setEditing(false);
    commit();
  });
  input.addEventListener('input', () => {
    const next = parse();
    if (next !== null) {
      lastValid = next;
      paintRange(next);
      clearError();
      onPreview?.(next);
    }
  });
  input.addEventListener('keydown', (event) => {
    if (event.isComposing || !editable) return;
    if (
      event.key === 'Tab' &&
      !event.shiftKey &&
      variant === 'contextual' &&
      !stepper &&
      !range.hidden &&
      parse() !== null
    ) {
      event.preventDefault();
      input.blur();
      range.focus({ preventScroll: true });
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      restore();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (commit()) {
        if (enterBehavior === 'next') {
          const fields = [
              ...element
                .closest('.theme')
                .querySelectorAll('[data-numeric-value]:not(:disabled):not([readonly])'),
            ],
            index = fields.indexOf(input);
          if (fields[index + 1]) fields[index + 1].focus();
          else input.blur();
        } else input.blur();
      }
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      applyStep(event.key === 'ArrowUp' ? 1 : -1);
    }
  });
  wrap.addEventListener('pointerenter', () => (element.dataset.hot = 'true'));
  wrap.addEventListener('pointerleave', () => (element.dataset.hot = 'false'));
  let rangeEdited = false;
  range.addEventListener('focus', () => {
    element.dataset.rangeFocused = 'true';
    rangeEdited = false;
  });
  range.addEventListener('blur', () => {
    element.dataset.rangeFocused = 'false';
    if (rangeEdited && !range.hidden && !disabled) {
      input.value = format(Number(range.value));
      commit();
    }
  });
  range.addEventListener('pointerdown', (event) => {
    dragStart = accepted;
    element.dataset.dragging = 'true';
    range.setPointerCapture(event.pointerId);
  });
  range.addEventListener('input', () => {
    rangeEdited = true;
    const raw = Number(range.value),
      next = Number(
        Math.min(
          scrubMax,
          Math.max(scrubMin, scrubMin + Math.round((raw - scrubMin) / step) * step)
        ).toFixed(precision)
      );
    lastValid = next;
    input.value = format(next);
    paintRange(next);
    clearError();
    onPreview?.(next);
  });
  range.addEventListener('change', () => {
    element.dataset.dragging = 'false';
    input.value = format(Number(range.value));
    commit();
  });
  range.addEventListener('pointerup', () => (element.dataset.dragging = 'false'));
  range.addEventListener('pointercancel', () => {
    element.dataset.dragging = 'false';
    accepted = dragStart;
    restore();
  });
  range.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Home' || event.key === 'End') {
        rangeEdited = true;
        input.value = format(event.key === 'Home' ? scrubMin : scrubMax);
        paintRange(Number(input.value));
        onPreview?.(Number(input.value));
        commit();
      } else {
        rangeEdited = true;
        applyStep(
          event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : -1,
          scrubMin,
          scrubMax
        );
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      element.dataset.dragging = 'false';
      restore();
    }
  });
  input.value = format(value);
  paintRange(value);
  return {
    element,
    input,
    range,
    commit,
    cancel: restore,
    get value() {
      return accepted;
    },
    get preview() {
      return lastValid;
    },
    setValue(next) {
      accepted = lastValid = next;
      input.value = format(next);
      paintRange(next);
      clearError();
    },
    destroy() {
      stopRepeat();
      abort.abort();
    },
  };
}
