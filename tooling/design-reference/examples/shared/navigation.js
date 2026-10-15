import { NativeHint } from './layers.js';
import { el } from './dom.js';
import { icon } from './buttons.js';
let serial = 0;
export function Tabs({ label, items, activation = 'automatic', orientation = 'horizontal' }) {
  const id = 'reference-tabs-' + ++serial,
    tabs = [],
    panels = [],
    tablist = el('div', {
      class: 'content-tabs',
      role: 'tablist',
      'aria-label': label,
      'aria-orientation': orientation,
    }),
    content = el('div', { class: 'tab-content' }),
    element = el('div', { class: 'tab-layout', 'data-orientation': orientation }, [
      tablist,
      content,
    ]);
  let selected = 0;
  function activate(index) {
    selected = index;
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
  }
  items.forEach((item, index) => {
    const tab = el('button', {
      type: 'button',
      id: id + '-tab-' + index,
      role: 'tab',
      'aria-controls': id + '-panel-' + index,
      text: item.label,
    });
    tab.setAttribute('aria-label', item.label);
    queueMicrotask(() =>
      NativeHint({
        trigger: tab,
        text: item.label,
        shouldShow: () => tab.scrollWidth > tab.clientWidth,
      })
    );
    tab.disabled = !!item.disabled;
    const panel = el(
      'div',
      { id: id + '-panel-' + index, role: 'tabpanel', 'aria-labelledby': tab.id, tabindex: '0' },
      item.content
    );
    tabs.push(tab);
    panels.push(panel);
    tablist.append(tab);
    content.append(panel);
    tab.addEventListener('click', () => activate(index));
    tab.addEventListener('keydown', (event) => {
      const previous = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft',
        next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
      let target;
      const enabled = tabs
        .map((t, i) => ({ t, i }))
        .filter((x) => !x.t.disabled)
        .map((x) => x.i);
      if (event.key === 'Home') target = enabled[0];
      else if (event.key === 'End') target = enabled.at(-1);
      else if (event.key === previous || event.key === next) {
        const pos = enabled.indexOf(index);
        target = enabled[(pos + (event.key === next ? 1 : -1) + enabled.length) % enabled.length];
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate(index);
      }
      if (target !== undefined) {
        event.preventDefault();
        tabs.forEach((t, i) => (t.tabIndex = i === target ? 0 : -1));
        tabs[target].focus();
        if (activation === 'automatic') activate(target);
      }
    });
  });
  activate(0);
  return {
    element,
    tabs,
    panels,
    get value() {
      return items[selected].id;
    },
    activate: (id) => {
      const i = items.findIndex((item) => item.id === id);
      if (i >= 0 && !tabs[i].disabled) activate(i);
    },
  };
}
export function Disclosure({
  label,
  preferenceKey,
  namespace = 'reference',
  initiallyOpen = true,
  level = 'group',
  kind = 'group',
  content,
}) {
  const element = el('details', {
      class: 'reference-disclosure',
      'data-level': level,
      'data-kind': kind,
    }),
    summary = el('summary', {}, [
      el(
        'span',
        { class: 'disclosure-label' },
        kind === 'information'
          ? [
              icon('M12 8h.01 M12 11v5 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'),
              el('span', { text: label }),
            ]
          : label
      ),
      icon('M5 9 L12 15 L19 9'),
    ]),
    body = el('div', { class: 'disclosure-body' }, content),
    key = namespace + ':disclosure:' + preferenceKey.join(':');
  let saved;
  try {
    saved = sessionStorage.getItem(key);
  } catch {
    // Unavailable session storage must not prevent disclosure operation.
  }
  element.open = saved === null || saved === undefined ? initiallyOpen : saved === 'true';
  element.append(summary, body);
  const persist = () => {
    try {
      sessionStorage.setItem(key, String(element.open));
    } catch {
      // Disclosure operation does not depend on preference storage.
    }
  };
  element.addEventListener('toggle', persist);
  return {
    element,
    summary,
    body,
    destroy() {
      element.removeEventListener('toggle', persist);
    },
  };
}
export function CategoryNavigation({ label, items }) {
  const nav = el('nav', { class: 'category-rail', 'aria-label': label }),
    content = el('div', { class: 'category-content' }),
    element = el('div', { class: 'category-layout' }, [nav, content]),
    buttons = [],
    panels = [];
  function activate(index) {
    buttons.forEach((button, i) => {
      if (i === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      panels[i].hidden = i !== index;
    });
  }
  items.forEach((item, i) => {
    const button = el('button', { type: 'button', text: item.label });
    button.setAttribute('aria-label', item.label);
    queueMicrotask(() =>
      NativeHint({
        trigger: button,
        text: item.label,
        shouldShow: () => button.scrollWidth > button.clientWidth,
      })
    );
    button.addEventListener('click', () => activate(i));
    button.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = items.length - 1;
      else if (['ArrowDown', 'ArrowRight'].includes(event.key)) next = (i + 1) % items.length;
      else if (['ArrowUp', 'ArrowLeft'].includes(event.key))
        next = (i - 1 + items.length) % items.length;
      if (next !== undefined) {
        event.preventDefault();
        buttons[next].focus();
        activate(next);
      }
    });
    buttons.push(button);
    nav.append(button);
    const panel = el('section', { 'aria-label': item.label }, item.content);
    panels.push(panel);
    content.append(panel);
  });
  activate(0);
  return { element, buttons };
}
