import { ParameterRow } from './parameter-row.js';
import { el } from './dom.js';
import { Disclosure } from './navigation.js';

export function propertyRow(label, choice) {
  return ParameterRow({
    label,
    content: choice.element,
  }).element;
}
export const status = (text) => el('p', { class: 'composition-status', role: 'status', text });
export const note = (parent, text) => {
  const disclosure = Disclosure({
    label: 'Об образце',
    kind: 'information',
    namespace: 'sandbox-notes-' + parent.closest('.theme').dataset.theme,
    preferenceKey: [parent.closest('[data-case]').dataset.case],
    initiallyOpen: false,
    content: el('p', { class: 'composition-note', text }),
  });
  disclosure.element.classList.add('composition-notes');
  parent.append(disclosure.element);
};
export function inspector(parent) {
  const column = el('div', {
    class: 'composition-inspector narrow-settings inspector-controls',
    'data-menu-bounds': '',
  });
  parent.append(column);
  return column;
}
