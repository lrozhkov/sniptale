import { el } from './dom.js';
import { ActionButton } from './buttons.js';
import { NativeHint } from './layers.js';
export function AdaptiveActions() {
  const status = el('p', {
      class: 'reference-status',
      role: 'status',
      text: 'Сначала сокращаются интервалы, затем подписи с установленными иконками.',
    }),
    row = el('div', {
      class: 'adaptive-actions',
      role: 'group',
      'aria-label': 'Команды адаптивной панели',
    }),
    frame = el('div', { class: 'adaptive-action-frame' }, row),
    element = el('div', {}, [frame, status]);
  const commands = [
    { label: 'Добавить сцену', iconPath: 'M12 5v14 M5 12h14', priority: 2 },
    { label: 'Импортировать файл', iconPath: 'M3 6h7l2 3h9v12H3z', priority: 1 },
    { label: 'Применить', kind: 'primary' },
  ];
  const entries = [];
  for (const spec of commands) {
    const button = ActionButton({
        ...spec,
        onClick: () => (status.textContent = 'Выполнено: ' + spec.label),
      }),
      caption = button.querySelector('span');
    row.append(button);
    entries.push({ button, caption, priority: spec.priority });
    if (spec.iconPath)
      queueMicrotask(() =>
        NativeHint({ trigger: button, text: spec.label, shouldShow: () => caption.hidden })
      );
  }
  let armed = false;
  function layout() {
    if (armed) return;
    armed = true;
    requestAnimationFrame(() => {
      armed = false;
      if (row.matches(':has(:active),:has([data-down=true]),:has([aria-expanded=true])')) return;
      row.dataset.compact = 'false';
      row.dataset.stacked = 'false';
      for (const entry of entries) entry.caption.hidden = false;
      if (row.scrollWidth > row.clientWidth) {
        row.dataset.compact = 'true';
        for (const entry of entries
          .filter((e) => e.priority)
          .sort((a, b) => a.priority - b.priority)) {
          if (row.scrollWidth <= row.clientWidth) break;
          entry.caption.hidden = true;
        }
      }
      if (row.scrollWidth > row.clientWidth) row.dataset.stacked = 'true';
    });
  }
  new ResizeObserver(layout).observe(frame);
  new MutationObserver((records) => {
    if (records.some((record) => record.type === 'characterData' || record.type === 'childList'))
      layout();
  }).observe(row, { subtree: true, childList: true, characterData: true });
  document.fonts.ready.then(layout);
  window.addEventListener('pointerup', layout);
  window.addEventListener('keyup', layout);
  window.addEventListener('blur', layout);
  window.addEventListener('pointercancel', layout);
  window.addEventListener('lostpointercapture', layout);
  return { element, frame, row, layout };
}
