import { el } from './dom.js';
import { RadioGroup } from './selection.js';
import { CommandMenu } from './command-menu.js';
import { ModalDialog } from './modal-dialog.js';

export function ResourceField({
  parent,
  label = 'Изображение',
  value = { name: 'Текущий фон', color: '#678598' },
}) {
  let accepted = { ...value },
    candidate = 'paper',
    busy = false;
  const name = el('span', { class: 'resource-name', 'data-no-localize': '', text: accepted.name }),
    preview = el('div', {
      class: 'resource-preview',
      'data-no-localize': '',
      role: 'img',
      'aria-label': accepted.name,
    }),
    status = el('p', { class: 'collection-feedback', role: 'status' }),
    file = el('input', { type: 'file', accept: 'image/*', hidden: true }),
    element = el('div', { class: 'resource-field' }, [
      el('span', { class: 'resource-label', text: label }),
      preview,
      name,
      status,
      file,
    ]);
  parent.append(element);
  function paint() {
    name.textContent = accepted.name;
    preview.setAttribute('aria-label', accepted.name);
    preview.style.background = accepted.color || 'transparent';
    preview.replaceChildren();
    if (accepted.url) preview.append(el('img', { src: accepted.url, alt: accepted.name }));
  }
  paint();
  const options = [
      { value: 'paper', label: 'Бумага' },
      { value: 'graphite', label: 'Графит' },
    ],
    choice = RadioGroup({
      label: 'Изображение из библиотеки',
      value: 'paper',
      options,
      onChange: (next) => (candidate = next),
    });
  const dialog = ModalDialog({
    theme: parent.closest('.theme'),
    title: 'Выбрать изображение',
    content: choice.element,
    onAccept: () => {
      if (accepted.url) URL.revokeObjectURL(accepted.url);
      accepted = {
        name: candidate === 'paper' ? 'Бумага' : 'Графит',
        color: candidate === 'paper' ? '#cfac94' : '#444656',
      };
      paint();
      status.textContent = 'Изображение принято.';
    },
    onCancel: () => {
      candidate = 'paper';
      choice.setValue('paper');
    },
  });
  const menu = CommandMenu({
    label: 'Заменить изображение',
    items: [
      {
        label: 'Из библиотеки',
        action: () => {
          candidate = 'paper';
          choice.setValue('paper');
          queueMicrotask(() => dialog.open(menu.trigger));
        },
      },
      { label: 'С компьютера', action: () => file.click() },
    ],
  });
  element.insertBefore(menu.trigger, status);
  menu.mount();
  file.addEventListener('cancel', () => {
    status.textContent = 'Импорт отменён. Принятое изображение сохранено.';
  });
  file.addEventListener('change', async () => {
    if (busy) return;
    const selected = file.files[0];
    if (!selected) {
      status.textContent = 'Импорт отменён. Принятое изображение сохранено.';
      return;
    }
    const restoreFocus = [menu.trigger, file, document.body].includes(document.activeElement);
    busy = true;
    menu.trigger.disabled = true;
    menu.trigger.setAttribute('aria-busy', 'true');
    status.setAttribute('role', 'status');
    status.textContent = 'Импорт изображения…';
    let url;
    try {
      if (!selected.type.startsWith('image/')) throw Error('unsupported');
      url = URL.createObjectURL(selected);
      const image = new Image();
      image.src = url;
      await image.decode();
      if (accepted.url) URL.revokeObjectURL(accepted.url);
      accepted = { name: selected.name, url };
      url = null;
      paint();
      status.textContent = 'Изображение принято.';
    } catch {
      if (url) URL.revokeObjectURL(url);
      status.setAttribute('role', 'alert');
      status.textContent =
        'Не удалось открыть изображение. Принятое изображение сохранено; выберите другой файл.';
    } finally {
      busy = false;
      menu.trigger.disabled = false;
      menu.trigger.removeAttribute('aria-busy');
      file.value = '';
      if (restoreFocus && document.activeElement === document.body)
        menu.trigger.focus({ preventScroll: true });
    }
  });
  return {
    element,
    menu,
    file,
    dialog,
    get value() {
      return { ...accepted };
    },
  };
}
