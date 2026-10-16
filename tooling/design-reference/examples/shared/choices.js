import { NativeHint } from './layers.js';
import { claimFloating, releaseFloating, anchorVisible } from './floating-owner.js';
import { checkGlyph } from './selection.js';
let serial = 0;
const dropdowns = [];
import './input-modality.js';
let opened = null;
export function createDropdown(field, label, initialOptions, initialValue, config = {}) {
  field.classList.add('choice-field');
  let options = [...initialOptions],
    value = initialValue,
    active = -1,
    query = '',
    visible = false,
    typing = '',
    lastType = 0,
    pointerInside = false;
  const theme = field.closest('.theme');
  const uid = 'choice-' + ++serial;
  const labelEl = document.createElement('label');
  labelEl.className = 'field-label';
  labelEl.id = uid + '-label';
  labelEl.htmlFor = uid;
  labelEl.textContent = label;
  const trigger = document.createElement(config.search ? 'input' : 'button');
  trigger.id = uid;
  trigger.className = config.search ? 'search' : 'control';
  if (config.search) {
    trigger.type = 'text';
    trigger.autocomplete = 'off';
    trigger.spellcheck = false;
    trigger.setAttribute('aria-autocomplete', 'list');
  } else trigger.type = 'button';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-labelledby', labelEl.id);
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', uid + '-list');
  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.hidden = true;
  const list = document.createElement('div');
  list.className = 'options';
  list.id = uid + '-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-labelledby', labelEl.id);
  popup.append(list);
  popup.addEventListener('pointerdown', () => (pointerInside = true));
  popup.addEventListener('mousedown', () => (pointerInside = true));
  (field.closest('dialog') || theme).append(popup);
  field.append(labelEl, trigger);
  const valueDisplay = config.search ? document.createElement('span') : null;
  if (valueDisplay) {
    valueDisplay.className = 'search-display';
    valueDisplay.setAttribute('aria-hidden', 'true');
    field.classList.add('search-field');
    field.append(valueDisplay);
  }
  window.addEventListener('mouseup', () => {
    if (pointerInside) {
      pointerInside = false;
      if (visible && document.activeElement === document.body)
        trigger.focus({ preventScroll: true });
    }
  });
  const status = document.createElement('p');
  status.className = 'sr-status';
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  field.append(status);
  const labelFor = () =>
    options.find((o) => o.value === value)?.label || config.emptyLabel || 'Выберите значение';
  function paintTrigger() {
    if (config.search) {
      if (!visible) trigger.value = value === null ? '' : labelFor();
      trigger.placeholder = value === null ? config.emptyLabel || 'Найти пресет' : labelFor();
      if (valueDisplay)
        valueDisplay.textContent = value === null ? trigger.placeholder : labelFor();
    } else {
      trigger.replaceChildren();
      const text = document.createElement('span');
      text.className = 'value';
      text.textContent = labelFor();
      const arrow = document.createElement('span');
      arrow.className = 'chevron';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
        path = document.createElementNS(svg.namespaceURI, 'path');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('focusable', 'false');
      path.setAttribute('d', 'M3 6 L8 10 L13 6');
      svg.append(path);
      arrow.append(svg);
      arrow.setAttribute('aria-hidden', 'true');
      trigger.append(text, arrow);
    }
  }
  const indices = () =>
    options
      .map((o, i) => ({ o, i }))
      .filter(
        ({ o }) =>
          !config.search || o.label.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))
      )
      .map(({ i }) => i);
  const enabled = () => indices().filter((i) => !options[i].disabled);
  function render() {
    list.replaceChildren();
    const shown = indices();
    for (const i of shown) {
      const o = options[i],
        row = document.createElement('div');
      row.className = 'option';
      row.id = uid + '-option-' + i;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(o.value === value));
      if (o.disabled) row.setAttribute('aria-disabled', 'true');
      row.classList.toggle('active', i === active);
      const symbol = document.createElement('span');
      symbol.className = 'symbol';
      symbol.setAttribute('aria-hidden', 'true');
      if (o.symbol && o.symbol.includes(':')) {
        const glyph = document.createElement('span');
        glyph.className =
          'ratio-glyph' +
          (o.symbol === '9:16' || o.symbol === '4:5'
            ? ' vertical'
            : o.symbol === '1:1'
              ? ' square'
              : '');
        symbol.append(glyph);
      }
      const body = document.createElement('span'),
        text = document.createElement('span');
      text.textContent = o.label;
      body.append(text);
      if (o.description) {
        const description = document.createElement('span');
        description.className = 'secondary';
        description.textContent = o.description;
        body.append(description);
      }
      const tick = document.createElement('span');
      tick.className = 'check choice-check';
      tick.setAttribute('aria-hidden', 'true');
      tick.append(checkGlyph());
      row.append(symbol, body, tick);
      row.addEventListener('pointermove', () => {
        popup.dataset.navigation = 'pointer';
        const next = o.disabled ? -1 : i;
        if (active !== next) {
          active = next;
          updateActive(false);
        }
      });
      row.addEventListener('pointerdown', (e) => e.preventDefault());
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!o.disabled) commit(i);
      });
      list.append(row);
    }
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.setAttribute('role', 'status');
      empty.textContent = query
        ? 'Ничего не найдено. Измените запрос.'
        : 'Нет доступных вариантов.';
      list.append(empty);
    }
    updateActive(false);
    if (visible) position();
  }
  popup.addEventListener('pointermove', (event) => {
    if (!event.target.closest('.option')) clearPointerActive();
  });
  popup.addEventListener('pointerleave', clearPointerActive);
  function clearPointerActive() {
    popup.dataset.navigation = 'pointer';
    active = -1;
    updateActive(false);
  }
  function updateActive(scroll = true) {
    for (const row of list.querySelectorAll('.option'))
      row.classList.toggle('active', row.id === uid + '-option-' + active);
    const row = list.querySelector('#' + uid + '-option-' + active);
    if (row) {
      trigger.setAttribute('aria-activedescendant', row.id);
      if (scroll) {
        const r = row.getBoundingClientRect(),
          l = list.getBoundingClientRect();
        if (r.top < l.top) list.scrollTop -= l.top - r.top;
        if (r.bottom > l.bottom) list.scrollTop += r.bottom - l.bottom;
      }
    } else trigger.removeAttribute('aria-activedescendant');
  }
  function contentWidth() {
    const ctx = document.createElement('canvas').getContext('2d'),
      row = list.querySelector('.option'),
      r = row ? getComputedStyle(row) : null,
      f = getComputedStyle(popup),
      px = (v) => parseFloat(v) || 0;
    ctx.font = r?.font || '500 13px Inter';
    const primary = Math.max(0, ...options.map((o) => ctx.measureText(o.label).width));
    ctx.font = '400 12px Inter';
    const secondary = Math.max(
      0,
      ...options.map((o) => ctx.measureText(o.description || '').width)
    );
    const hasSymbols = options.some((o) => o.symbol);
    popup.classList.toggle('has-symbols', hasSymbols);
    const frame =
        px(f.paddingLeft) + px(f.paddingRight) + px(f.borderLeftWidth) + px(f.borderRightWidth),
      rowSpace = r
        ? px(r.paddingLeft) +
          px(r.paddingRight) +
          (hasSymbols ? 36 : 18) +
          px(r.columnGap) * (hasSymbols ? 2 : 1)
        : 0;
    return Math.min(480, Math.ceil(Math.max(primary, secondary) + frame + rowSpace));
  }
  function position() {
    if (!visible) return;
    const rect = trigger.getBoundingClientRect();
    if (!anchorVisible(trigger)) {
      close();
      return;
    }
    const below = innerHeight - rect.bottom - 12,
      above = rect.top - 12,
      up = below < Math.min(260, above),
      room = Math.max(60, up ? above : below),
      owner = field.closest('[data-menu-bounds]'),
      box = owner?.getBoundingClientRect(),
      style = owner ? getComputedStyle(owner) : null,
      px = (v) => parseFloat(v) || 0;
    const leftBound = Math.max(10, box ? box.left + owner.clientLeft + px(style.paddingLeft) : 10),
      rightBound = Math.min(
        innerWidth - 10,
        box
          ? box.left + owner.clientLeft + owner.clientWidth - px(style.paddingRight)
          : innerWidth - 10
      ),
      limit = Math.max(0, rightBound - leftBound),
      column =
        !!owner && config.menuWidth !== 'content' && (config.menuWidth !== 'auto' || limit <= 360),
      preferred = contentWidth();
    popup.dataset.widthMode = column ? 'column' : 'content';
    let width = Math.min(column ? limit : Math.max(rect.width, preferred), limit);
    popup.style.width = width + 'px';
    list.style.maxHeight = Math.max(30, Math.min(250, room - 14)) + 'px';
    const overflowing = list.scrollHeight > list.clientHeight;
    list.classList.toggle('has-scroll', overflowing);
    const gutter = overflowing ? list.offsetWidth - list.clientWidth + 6 : 0;
    width = Math.min(
      column ? limit : Math.max(rect.width, Math.min(480, preferred + gutter)),
      limit
    );
    popup.style.width = width + 'px';
    const desired = column ? leftBound : config.align === 'end' ? rect.right - width : rect.left;
    popup.style.left = Math.max(leftBound, Math.min(desired, rightBound - width)) + 'px';
    popup.dataset.direction = up ? 'up' : 'down';
    popup.style.top =
      (up ? Math.max(10, rect.top - popup.offsetHeight - 6) : rect.bottom + 6) + 'px';
  }
  function open() {
    popup.dataset.navigation = document.documentElement.dataset.inputMode;
    if (trigger.disabled) return;
    if (visible) return;
    if (opened) opened.close();
    visible = true;
    opened = api;
    claimFloating(api);
    query = '';
    active = options.findIndex((o) => o.value === value && !o.disabled);
    if (active < 0) active = enabled()[0] ?? -1;
    popup.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    if (config.search) trigger.value = '';
    render();
    position();
    if (visible) updateActive();
  }
  function close() {
    if (!visible) return;
    visible = false;
    pointerInside = false;
    popup.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    if (opened === api) opened = null;
    releaseFloating(api);
    paintTrigger();
  }
  function commit(index) {
    const option = options[index];
    if (!option || option.disabled) return;
    value = option.value;
    close();
    paintTrigger();
    trigger.focus({ preventScroll: true });
    status.hidden = false;
    status.textContent = 'Выбрано: ' + option.label;
    config.onChange?.(value);
  }
  function navigate(delta, edge) {
    const valid = enabled();
    if (!valid.length) {
      active = -1;
      updateActive();
      return;
    }
    const current = valid.indexOf(active);
    active =
      edge === 'first'
        ? valid[0]
        : edge === 'last'
          ? valid.at(-1)
          : valid[
              current < 0
                ? delta < 0
                  ? valid.length - 1
                  : 0
                : (current + delta + valid.length) % valid.length
            ];
    updateActive();
  }
  labelEl.addEventListener('pointerdown', (event) => event.preventDefault());
  function toggleFromField(event) {
    event.preventDefault();
    if (trigger.disabled) return;
    const wasOpen = visible;
    if (wasOpen) {
      trigger.focus({ preventScroll: true });
      close();
    } else {
      trigger.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      trigger.focus({ preventScroll: true });
      open();
    }
  }
  labelEl.addEventListener('click', toggleFromField);
  field.addEventListener('pointerdown', (event) => {
    if (event.target === field) event.preventDefault();
  });
  field.addEventListener('click', (event) => {
    if (event.target === field) toggleFromField(event);
  });
  trigger.addEventListener('click', () => (config.search ? open() : visible ? close() : open()));
  if (config.search) {
    trigger.addEventListener('focus', open);
    trigger.addEventListener('input', () => {
      const typed = trigger.value;
      if (!visible) {
        open();
        trigger.value = typed;
      }
      query = typed;
      active = enabled()[0] ?? -1;
      render();
      updateActive();
    });
  }
  trigger.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    popup.dataset.navigation = 'keyboard';
    if (event.key === 'Escape' && visible) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Tab') {
      if (visible) {
        if (active >= 0) commit(active);
        else close();
      }
      return;
    }
    if (
      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) &&
      (!config.search || event.key.startsWith('Arrow'))
    ) {
      event.preventDefault();
      if (!visible) {
        open();
        if (event.key === 'Home') navigate(0, 'first');
        if (event.key === 'End') navigate(0, 'last');
      } else
        navigate(
          event.key === 'ArrowUp' ? -1 : 1,
          event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : undefined
        );
      return;
    }
    if (event.key === 'Enter' || (event.key === ' ' && !config.search)) {
      event.preventDefault();
      if (visible) commit(active);
      else open();
      return;
    }
    if (
      !config.search &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      if (!visible) open();
      const now = performance.now(),
        char = event.key.toLocaleLowerCase('ru');
      typing = now - lastType < 700 ? typing + char : char;
      lastType = now;
      const repeated = [...typing].every((c) => c === char);
      const term = repeated ? char : typing;
      const valid = enabled(),
        start = repeated ? valid.indexOf(active) + 1 : 0;
      for (let j = 0; j < valid.length; j++) {
        const i = valid[(start + j) % valid.length];
        if (options[i].label.toLocaleLowerCase('ru').startsWith(term)) {
          active = i;
          updateActive();
          break;
        }
      }
    }
  });
  trigger.addEventListener('blur', () => {
    if (visible && !pointerInside) close();
  });
  const api = {
    trigger,
    dismiss: (reason) => {
      close();
      if (reason === 'escape') trigger.focus({ preventScroll: true });
    },
    popup,
    list,
    close,
    position,
    contains: (target) => popup.contains(target) || field.contains(target),
    getLabel: labelFor,
    getValue: () => value,
    setValue: (next) => {
      value = next;
      paintTrigger();
      if (visible) render();
    },
    setOptions: (next) => {
      options = [...next];
      if (visible) {
        active = options.findIndex((o) => o.value === value && !o.disabled);
        if (active < 0) active = enabled()[0] ?? -1;
        render();
      }
      paintTrigger();
    },
  };
  dropdowns.push(api);
  paintTrigger();
  return api;
}
window.addEventListener('resize', () => opened?.position());
window.addEventListener(
  'scroll',
  (event) => {
    if (opened && !opened.popup.contains(event.target)) opened.position();
  },
  true
);

export function PropertyChoice({
  label,
  options,
  value,
  presentation = 'segments',
  fallbackLabel = 'Выберите значение',
  menuWidth,
  align,
  onChange,
}) {
  const name = 'property-' + ++serial,
    element = document.createElement('fieldset');
  element.className = 'property-group';
  const legend = document.createElement('legend');
  legend.textContent = label;
  element.append(legend);
  const group = document.createElement('div');
  group.className = 'property-options';
  group.dataset.presentation = presentation;
  const inputs = [];
  let pill, fallback, fitObserver, textObserver;
  const fallbackHost = document.createElement('div');
  fallbackHost.hidden = true;
  fallbackHost.className = 'property-fallback';
  if (presentation === 'segments') {
    pill = document.createElement('i');
    pill.className = 'property-pill';
    pill.setAttribute('aria-hidden', 'true');
    group.append(pill);
  }
  for (const option of options) {
    const row = document.createElement('label');
    row.className = 'property-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = option.value;
    input.checked = option.value === value;
    input.disabled = !!option.disabled;
    input.setAttribute('aria-label', option.label);
    inputs.push(input);
    const face = document.createElement('span');
    face.className = 'property-face';
    if (presentation === 'tiles') {
      const swatch = document.createElement('span');
      swatch.className = 'property-swatch';
      swatch.style.setProperty('--swatch', option.preview);
      swatch.setAttribute('aria-hidden', 'true');
      face.append(swatch);
      const title = document.createElement('span');
      title.className = 'property-title';
      const text = document.createElement('span');
      text.textContent = option.label;
      const check = document.createElement('span');
      check.className = 'choice-check';
      check.setAttribute('aria-hidden', 'true');
      check.append(checkGlyph());
      title.append(text, check);
      face.append(title);
    } else if (
      presentation === 'tools' ||
      presentation === 'labeled-tools' ||
      presentation === 'icon-segments'
    ) {
      if (option.iconPath) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', option.iconPath);
        svg.append(path);
        face.append(svg);
      }
      const text = document.createElement('span');
      text.textContent = option.label;
      if (!option.iconOnly) face.append(text);
      else {
        row.title = option.label;
        row.dataset.iconOnly = 'true';
        queueMicrotask(() => {
          if (input.isConnected) NativeHint({ trigger: input, text: option.label });
        });
      }
    } else face.textContent = option.label;
    row.append(input, face);
    group.append(row);
    input.addEventListener('change', () => {
      if (input.checked) {
        update();
        fallback?.setValue(input.value);
        onChange?.(input.value);
      }
    });
  }
  element.append(group);
  if (presentation === 'segments') element.append(fallbackHost);
  function update() {
    if (!pill) return;
    const selected = inputs.find((input) => input.checked)?.parentElement;
    if (!selected) return;
    const r = selected.getBoundingClientRect(),
      g = group.getBoundingClientRect();
    pill.style.width = r.width + 'px';
    pill.style.height = r.height + 'px';
    pill.style.transform = 'translate(' + (r.left - g.left) + 'px,' + (r.top - g.top) + 'px)';
  }
  function fit() {
    if (!fallback || !element.isConnected || !element.clientWidth) return;
    if (
      element.contains(document.activeElement) ||
      fallback.trigger.getAttribute('aria-expanded') === 'true'
    )
      return;
    const context = document.createElement('canvas').getContext('2d');
    const faces = [...group.querySelectorAll('.property-face')];
    context.font = getComputedStyle(faces[0]).font;
    const widths = faces.map((face) => {
      const css = getComputedStyle(face);
      return (
        context.measureText(face.textContent).width +
        parseFloat(css.paddingLeft) +
        parseFloat(css.paddingRight) +
        parseFloat(css.borderLeftWidth) +
        parseFloat(css.borderRightWidth)
      );
    });
    const shell = getComputedStyle(group),
      required =
        widths.reduce((total, width) => total + width, 0) +
        parseFloat(shell.paddingLeft) +
        parseFloat(shell.paddingRight) +
        parseFloat(shell.borderLeftWidth) +
        parseFloat(shell.borderRightWidth) +
        (parseFloat(shell.columnGap) || 0) * (inputs.length - 1);
    const row = element.closest('.parameter-row');
    if (row && row.dataset.label !== 'inherited') {
      const width = row.clientWidth,
        inlineWidth = ((width - 8) * 1.15) / 2.15;
      row.dataset.fit = required > inlineWidth ? 'stacked' : 'inline';
    }
    const compact = required > element.clientWidth;
    group.hidden = compact;
    legend.hidden = compact;
    fallbackHost.hidden = !compact;
    element.dataset.presentation = compact ? 'dropdown' : presentation;
    if (!compact) requestAnimationFrame(update);
  }
  const observer = new ResizeObserver(() => {
    group.dataset.motion = 'false';
    update();
    requestAnimationFrame(() => (group.dataset.motion = 'true'));
  });
  observer.observe(group);
  if (presentation === 'segments')
    queueMicrotask(() => {
      if (!element.isConnected) return;
      fallback = createDropdown(
        fallbackHost,
        label,
        options.map((o, i) => ({
          ...o,
          label: inputs[i].getAttribute('aria-label'),
          disabled: inputs[i].disabled,
        })),
        inputs.find((i) => i.checked)?.value,
        {
          emptyLabel: fallbackLabel,
          menuWidth,
          align,
          onChange: (next) => {
            inputs.forEach((i) => (i.checked = i.value === next));
            update();
            onChange?.(next);
          },
        }
      );
      fitObserver = new ResizeObserver(fit);
      fitObserver.observe(element);
      const row = element.closest('.parameter-row');
      if (row) fitObserver.observe(row);
      textObserver = new MutationObserver(() => {
        fallback.setOptions(
          options.map((o, i) => ({
            ...o,
            label: inputs[i].getAttribute('aria-label'),
            disabled: inputs[i].disabled,
          }))
        );
        fit();
      });
      textObserver.observe(group, {
        subtree: true,
        characterData: true,
        childList: true,
        attributes: true,
        attributeFilter: ['disabled', 'aria-label'],
      });
      element.addEventListener('focusout', () => setTimeout(fit, 0));
      document.fonts.ready.then(fit);
      fit();
    });
  requestAnimationFrame(update);
  return {
    element,
    inputs,
    get value() {
      return inputs.find((i) => i.checked)?.value;
    },
    setValue(next) {
      inputs.forEach((i) => (i.checked = i.value === next));
      fallback?.setValue(next);
      update();
    },
    destroy() {
      observer.disconnect();
      fitObserver?.disconnect();
      textObserver?.disconnect();
      fallback?.close();
    },
  };
}
