import { el, exampleCase, paramRow } from '../shared/dom.js';
import { ActionButton } from '../shared/buttons.js';
import { TextField } from '../shared/fields.js';
import { createDropdown } from '../shared/choices.js';
import { AnchoredLayer, CommandMenu, ModalDialog, NativeHint } from '../shared/layers.js';
import { ColorEditor } from '../shared/color-editor.js';
export function render(root, { manifest }) {
  const add = (key) => {
    const stage = el('div', { class: 'case-stage' });
    root.append(
      exampleCase(
        manifest.cases.find((c) => c.id === 'layers.' + key),
        [stage]
      )
    );
    return stage;
  };
  const menuStage = add('commands'),
    status = el('p', { class: 'layer-feedback', role: 'status', text: 'Команда не выбрана' }),
    menu = CommandMenu({
      label: 'Добавить',
      items: [
        { label: 'Добавить сцену', action: () => (status.textContent = 'Сцена добавлена') },
        { label: 'Импортировать файл', disabled: true },
        { label: 'Создать копию', action: () => (status.textContent = 'Копия создана') },
      ],
    });
  menuStage.append(menu.trigger, status);
  menu.mount();
  const popStage = add('popover'),
    trigger = ActionButton({ label: 'Изменить подпись' }),
    feedback = el('p', { class: 'layer-feedback', role: 'status', text: 'Принято: Вступление' });
  popStage.append(trigger, feedback);
  const text = TextField({ label: 'Подпись', value: 'Вступление' });
  let accepted = 'Вступление',
    popover;
  const actions = el('div', { class: 'layer-actions' }, [
    ActionButton({ label: 'Отмена', onClick: () => popover.close('cancel') }),
    ActionButton({
      label: 'Применить',
      kind: 'primary',
      onClick: () => {
        text.commit();
        accepted = text.value;
        feedback.textContent = 'Принято: ' + accepted;
        popover.close('accept');
      },
    }),
  ]);
  popover = AnchoredLayer({
    trigger,
    content: [text.element, actions],
    label: 'Редактирование подписи',
    onDismiss: (reason) => {
      if (reason !== 'accept') text.setValue(accepted);
    },
  });
  const modalStage = add('modal'),
    open = ActionButton({ label: 'Открыть параметры экспорта' }),
    modalStatus = el('p', {
      class: 'layer-feedback',
      role: 'status',
      text: 'Параметры не изменены',
    });
  modalStage.append(open, modalStatus);
  const title = TextField({
      label: 'Название экспорта',
      value: 'Проект',
      validate: (v) => (v.trim() ? '' : 'Введите название.'),
    }),
    formatField = el('div', { class: 'field' });
  let acceptedFormat = 'mp4',
    format;
  const modal = ModalDialog({
    theme: root,
    title: 'Параметры экспорта',
    content: [
      title.element,
      formatField,
      el('h4', { text: 'Состав экспорта · демонстрационный проект' }),
      ...Array.from({ length: 22 }, (_, i) => paramRow('Сцена ' + (i + 1), '00:12 · включена')),
    ],
    onAccept: () => {
      if (!title.validate()) {
        title.input.focus();
        return false;
      }
      title.commit();
      acceptedFormat = format.getValue();
      modalStatus.textContent = 'Применено: ' + title.value;
      return true;
    },
    onCancel: () => {
      title.cancel();
      format.setValue(acceptedFormat);
    },
  });
  format = createDropdown(
    formatField,
    'Формат файла',
    [
      { value: 'mp4', label: 'MP4' },
      { value: 'webm', label: 'WebM' },
    ],
    'mp4'
  );
  open.addEventListener('click', () => modal.open(open));
  const innerStage = add('inner-escape'),
    innerOpen = ActionButton({ label: 'Открыть проверку Escape' }),
    inner = TextField({
      label: 'Внутренний редактор',
      value: 'Принятый текст',
      context: 'inspector',
    });
  innerStage.append(innerOpen);
  const innerModal = ModalDialog({
    theme: root,
    title: 'Вложенная отмена',
    content: [
      inner.element,
      el('p', { text: 'Первый Escape отменяет ввод. Следующий закрывает окно.' }),
    ],
    onCancel: () => inner.cancel(),
  });
  innerOpen.addEventListener('click', () => innerModal.open(innerOpen));
  ColorEditor({ parent: add('color') });
  const tooltipStage = add('tooltip'),
    tipTrigger = ActionButton({
      label: 'Сведения о горячей клавише',
      kind: 'utility',
      iconOnly: true,
      iconPath: 'M12 11 V17 M12 7 H12.01 M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3',
    });
  tooltipStage.append(tipTrigger, el('p', { text: 'Подсказка дополняет понятное имя команды.' }));
  NativeHint({ trigger: tipTrigger, text: 'Горячая клавиша: F1' });
  const anchorStage = add('anchor'),
    scroll = el('div', { class: 'anchor-scroll', tabindex: '0', 'aria-label': 'Прокрутка якоря' }),
    anchor = ActionButton({ label: 'Открыть у края области' });
  anchorStage.append(scroll);
  scroll.append(anchor, el('div', { class: 'anchor-space' }));
  AnchoredLayer({
    trigger: anchor,
    content: el('p', { text: 'Слой закрывается, когда якорь выходит из видимой области.' }),
    label: 'Проверка якоря',
    width: 300,
  });
  const feedbackStage = add('feedback'),
    normal = el(
      'div',
      { class: 'feedback-message', role: 'status' },
      el('p', { text: 'Экспорт завершён. Файл доступен в выбранной папке.' })
    ),
    error = el(
      'div',
      { class: 'feedback-message', role: 'alert' },
      el('p', { text: 'Не удалось сохранить файл. Выберите другую папку и повторите.' })
    );
  feedbackStage.append(
    normal,
    error,
    ActionButton({
      label: 'Выбрать другую папку',
      onClick: () => {
        error.removeAttribute('role');
        error.textContent = 'В примере выбрана другая папка. Можно повторить сохранение.';
      },
    })
  );
}
