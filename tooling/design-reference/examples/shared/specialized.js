import { el, paramRow } from './dom.js';
import { ActionButton } from './buttons.js';
import { NumericField } from './numbers.js';
import { TextField } from './fields.js';
import { bindGesture } from './gestures.js';
let serial = 0;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function TimelineProbe() {
  const duration = 20;
  let accepted = { time: 3, start: 4, end: 12 },
    draft = { ...accepted },
    zoom = 1;
  const labels = el('div', { class: 'timeline-labels' }, [
      el('span', { text: 'Время' }),
      el('span', { text: 'Фокус' }),
    ]),
    ruler = el('div', {
      class: 'timeline-ruler',
      tabindex: '0',
      'aria-label': 'Линейка: перетаскивание позиции',
    }),
    lane = el('div', { class: 'timeline-lane' }),
    plane = el('div', { class: 'timeline-plane' }, [ruler, lane]),
    viewport = el(
      'div',
      { class: 'timeline-viewport', tabindex: '0', 'aria-label': 'Прокрутка таймлайна' },
      plane
    ),
    layout = el('div', { class: 'timeline-layout' }, [labels, viewport]),
    playhead = el('span', { class: 'timeline-playhead', 'aria-hidden': 'true' }),
    clip = el(
      'div',
      { class: 'timeline-clip' },
      el('span', { text: 'Фокус · демонстрационный диапазон' })
    ),
    start = ActionButton({
      label: 'Начало диапазона',
      pressFeedback: false,
      kind: 'utility',
      iconOnly: true,
    }),
    end = ActionButton({
      label: 'Конец диапазона',
      pressFeedback: false,
      kind: 'utility',
      iconOnly: true,
    }),
    status = el('p', { role: 'status', class: 'special-status' }),
    scale = el('span', { class: 'zoom-value', text: '100%' }),
    readout = el('p', { class: 'special-readout' });
  start.dataset.edge = 'start';
  end.dataset.edge = 'end';
  clip.append(start, end);
  lane.append(clip);
  plane.append(playhead);
  for (const time of [0, 5, 10, 15, 20])
    ruler.append(
      el('span', {
        class: 'ruler-label',
        style: 'left:' + (time / duration) * 100 + '%',
        text: String(time) + ' с',
      })
    );
  const timeField = NumericField({
    label: 'Позиция',
    value: 3,
    min: 0,
    max: 20,
    step: 0.1,
    precision: 2,
    unit: 'с',
    onPreview: (v) => {
      draft.time = v;
      paint();
    },
    onCommit: (v) => {
      accepted.time = v;
      draft.time = v;
      complete();
    },
  });
  const element = el('div', { class: 'timeline-probe' }, [
    el('div', { class: 'action-row' }, [
      el('span', { class: 'param-name', text: 'Масштаб' }),
      ActionButton({
        label: 'Уменьшить масштаб',
        kind: 'utility',
        iconOnly: true,
        iconPath: 'M5 12 H19',
        onClick: () => setZoom(zoom / 2),
      }),
      scale,
      ActionButton({
        label: 'Увеличить масштаб',
        kind: 'utility',
        iconOnly: true,
        iconPath: 'M5 12 H19 M12 5 V19',
        onClick: () => setZoom(zoom * 2),
      }),
    ]),
    layout,
    readout,
    timeField.element,
    status,
  ]);
  const map = (event) =>
    clamp(
      ((event.clientX - plane.getBoundingClientRect().left) /
        Math.max(1, plane.getBoundingClientRect().width)) *
        duration,
      0,
      duration
    );
  function paint() {
    playhead.style.left = (draft.time / duration) * 100 + '%';
    clip.style.left = (draft.start / duration) * 100 + '%';
    clip.style.width = ((draft.end - draft.start) / duration) * 100 + '%';
    readout.textContent =
      'Позиция: ' +
      draft.time.toFixed(2) +
      ' с · Диапазон: ' +
      draft.start.toFixed(2) +
      '–' +
      draft.end.toFixed(2) +
      ' с';
  }
  function complete() {
    paint();
    timeField.setValue(accepted.time);
    status.textContent =
      'Принято: ' +
      accepted.time.toFixed(2) +
      ' с · ' +
      accepted.start.toFixed(2) +
      '–' +
      accepted.end.toFixed(2) +
      ' с';
  }
  function rollback() {
    draft = { ...accepted };
    complete();
    status.textContent = 'Отменено. Принятый диапазон сохранён.';
  }
  const gestures = [
    bindGesture(ruler, {
      start: (e) => {
        draft = { ...accepted, time: map(e) };
        paint();
      },
      move: (e) => {
        draft.time = map(e);
        paint();
      },
      commit: () => {
        accepted = { ...draft };
        complete();
      },
      cancel: rollback,
    }),
  ];
  for (const [edge, button] of [
    ['start', start],
    ['end', end],
  ]) {
    const update = (time) => {
      draft[edge] = clamp(
        Math.round(time * 30) / 30,
        edge === 'start' ? 0 : draft.start + 1 / 30,
        edge === 'start' ? draft.end - 1 / 30 : duration
      );
      paint();
    };
    gestures.push(
      bindGesture(button, {
        start: () => (draft = { ...accepted }),
        move: (e) => update(map(e)),
        commit: () => {
          accepted = { ...draft };
          complete();
        },
        cancel: rollback,
      })
    );
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        draft = { ...accepted };
        update(draft[edge] + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 1 : 1 / 30));
        accepted = { ...draft };
        complete();
      }
    });
  }
  function setZoom(next) {
    zoom = clamp(next, 1, 16);
    plane.style.width = zoom * 100 + '%';
    scale.textContent = Math.round(zoom * 100) + '%';
    viewport.scrollLeft = clamp(
      (draft.time / duration) * viewport.clientWidth * zoom - viewport.clientWidth / 2,
      0,
      viewport.clientWidth * (zoom - 1)
    );
  }
  viewport.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey || event.metaKey) return;
      const delta = event.deltaY || event.deltaX;
      if (!Number.isFinite(delta) || !delta) return;
      event.preventDefault();
      event.stopPropagation();
      const pixels = delta * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 100 : 1),
        step = Math.sign(pixels) * Math.max(0.1, Math.min(5, Math.abs(pixels) / 20)),
        value = clamp(Math.round((Math.log2(zoom) * 25 - step) * 10) / 10, 0, 100);
      setZoom(2 ** (value / 25));
    },
    { passive: false }
  );
  complete();
  return {
    element,
    ruler,
    start,
    end,
    viewport,
    get value() {
      return { ...accepted };
    },
    destroy() {
      gestures.forEach((g) => g.destroy());
    },
  };
}
export function CanvasProbe() {
  let accepted = { x: 20, y: 25 },
    draft = { ...accepted },
    origin;
  const viewport = el('div', {
      class: 'canvas-viewport',
      tabindex: '0',
      'aria-label': 'Прокрутка холста',
    }),
    plane = el('div', { class: 'canvas-plane' }),
    object = ActionButton({
      label: 'Объект — перетащить',
      pressFeedback: false,
      kind: 'secondary',
    }),
    status = el('p', { class: 'special-status', role: 'status' });
  object.classList.add('canvas-object');
  plane.append(object);
  viewport.append(plane);
  const update = () => {
    object.style.left = draft.x + '%';
    object.style.top = draft.y + '%';
  };
  const x = NumericField({
      label: 'X',
      value: 20,
      min: 0,
      max: 80,
      precision: 1,
      step: 1,
      unit: '%',
      onPreview: (v) => {
        draft.x = v;
        update();
      },
      onCommit: (v) => {
        accepted.x = v;
        complete();
      },
    }),
    y = NumericField({
      label: 'Y',
      value: 25,
      min: 0,
      max: 80,
      precision: 1,
      step: 1,
      unit: '%',
      onPreview: (v) => {
        draft.y = v;
        update();
      },
      onCommit: (v) => {
        accepted.y = v;
        complete();
      },
    });
  function complete() {
    draft = { ...accepted };
    update();
    status.textContent =
      'Принято: X ' + accepted.x.toFixed(1) + '% · Y ' + accepted.y.toFixed(1) + '%';
  }
  const gesture = bindGesture(object, {
    start: (e) => {
      origin = { x: e.clientX, y: e.clientY, value: { ...accepted } };
    },
    move: (e) => {
      const rect = plane.getBoundingClientRect();
      draft = {
        x: clamp(origin.value.x + ((e.clientX - origin.x) / rect.width) * 100, 0, 80),
        y: clamp(origin.value.y + ((e.clientY - origin.y) / rect.height) * 100, 0, 80),
      };
      update();
      x.setValue(draft.x);
      y.setValue(draft.y);
    },
    commit: () => {
      accepted = { ...draft };
      complete();
    },
    cancel: () => {
      draft = { ...accepted };
      x.setValue(accepted.x);
      y.setValue(accepted.y);
      complete();
      status.textContent = 'Перетаскивание отменено. Координаты сохранены.';
    },
  });
  const zoom = ActionButton({
    label: 'Масштаб холста 200%',
    onClick: () => {
      const expanded = plane.dataset.zoom !== '2';
      plane.dataset.zoom = expanded ? '2' : '1';
      plane.style.width = expanded ? '200%' : '100%';
      plane.style.height = expanded ? '200%' : '100%';
      zoom.setAttribute('aria-label', expanded ? 'Масштаб холста 100%' : 'Масштаб холста 200%');
      zoom.querySelector('span').textContent = expanded
        ? 'Масштаб холста 100%'
        : 'Масштаб холста 200%';
    },
  });
  const element = el('div', {}, [
    zoom,
    viewport,
    el('div', { class: 'coordinate-fields' }, [x.element, y.element]),
    status,
  ]);
  complete();
  return {
    element,
    object,
    viewport,
    plane,
    get value() {
      return { ...accepted };
    },
    destroy() {
      gesture.destroy();
    },
  };
}
export function InspectorFrameProbe() {
  const id = 'inspector-body-' + ++serial,
    name = TextField({ label: 'Название сцены', value: 'Вступление', context: 'inspector' }),
    collapse = ActionButton({
      label: 'Свернуть панель',
      kind: 'utility',
      iconOnly: true,
      iconPath: 'M15 5 L8 12 L15 19',
    }),
    height = ActionButton({
      label: 'Изменить высоту панели',
      kind: 'utility',
      iconOnly: true,
      iconPath: 'M12 3 V21 M8 7 L12 3 L16 7 M8 17 L12 21 L16 17',
    }),
    body = el('div', { class: 'inspector-probe-body', id, tabindex: '0' }, [
      name.element,
      ...Array.from({ length: 12 }, (_, i) => paramRow('Параметр ' + (i + 1), 'Сохранён')),
    ]),
    footer = el(
      'div',
      { class: 'inspector-probe-footer' },
      ActionButton({
        label: 'Применить',
        kind: 'primary',
        onClick: () => (status.textContent = 'Параметры применены'),
      })
    ),
    panel = el('aside', { class: 'inspector-probe' }, [
      el('header', { class: 'action-row' }, [collapse, height]),
      body,
      footer,
    ]),
    canvas = el(
      'div',
      { class: 'inspector-probe-canvas' },
      el('span', { text: 'Рабочая область' })
    ),
    status = el('p', { class: 'special-status', role: 'status', text: 'Панель раскрыта' }),
    element = el('div', {}, [
      el('div', { class: 'inspector-probe-layout' }, [panel, canvas]),
      status,
    ]);
  collapse.setAttribute('aria-controls', id);
  collapse.setAttribute('aria-expanded', 'true');
  collapse.addEventListener('click', () => {
    const collapsed = panel.dataset.collapsed !== 'true';
    panel.dataset.collapsed = String(collapsed);
    body.hidden = footer.hidden = height.hidden = collapsed;
    collapse.setAttribute('aria-expanded', String(!collapsed));
    collapse.setAttribute('aria-label', collapsed ? 'Развернуть панель' : 'Свернуть панель');
    collapse.title = collapsed ? 'Развернуть панель' : 'Свернуть панель';
    status.textContent = collapsed ? 'Панель свёрнута. Значения сохранены.' : 'Панель раскрыта';
  });
  height.addEventListener(
    'click',
    () => (panel.dataset.short = String(panel.dataset.short !== 'true'))
  );
  return { element, panel, body, name };
}
