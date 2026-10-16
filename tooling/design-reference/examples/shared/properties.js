import { el } from './dom.js';
import { ActionButton, icon } from './buttons.js';
export function PropertyList({ items }) {
  const status = el('p', { class: 'property-feedback', role: 'status' }),
    list = el('dl', { class: 'display-properties' });
  for (const item of items) {
    const value = el(
        'dd',
        { class: 'display-property-value' },
        el('span', {
          ...(item.copy || item.userContent ? { 'data-no-localize': '' } : {}),
          text: item.value,
        })
      ),
      row = el('div', { class: 'display-property' }, [el('dt', { text: item.label }), value]);
    if (item.copy) {
      const copy = ActionButton({
        label: item.copyLabel,
        kind: 'utility',
        appearance: 'chrome',
        iconOnly: true,
        iconPath: 'M9 9 H20 V20 H9 Z M5 15 H3 V3 H15 V5',
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(item.value);
            status.textContent = 'Значение скопировано';
          } catch {
            status.textContent = 'Не удалось скопировать. Повторите попытку.';
          }
        },
      });
      value.append(copy);
    }
    list.append(row);
  }
  return { element: el('div', {}, [list, status]), list, status };
}
export function RelatedObjects({ items }) {
  const list = el('ul', { class: 'related-objects' });
  for (const item of items) {
    const content = el('span', { text: item.name, 'data-no-localize': '' });
    if (item.unavailable) {
      list.append(
        el('li', { class: 'related-unavailable' }, [
          content,
          el('span', { class: 'field-description', text: item.reason }),
        ])
      );
      continue;
    }
    const link = el('a', { class: 'related-object', href: item.href, title: item.name }, [
      icon('M7 17 L17 7 M7 7 H17 V17'),
      content,
    ]);
    list.append(el('li', {}, link));
  }
  return list;
}
