import { el } from '../shared/dom.js';
import { Checkbox, Switch } from '../shared/selection.js';
import { ActionButton, AsyncCommand } from '../shared/buttons.js';
import { TextField } from '../shared/fields.js';
import { Tabs } from '../shared/navigation.js';
import { status, note } from '../shared/composition-layout.js';

export function SettingsComposition(parent) {
  const immediate = Switch({ label: 'Показывать подсказки', checked: true }),
    name = TextField({
      label: 'Название профиля',
      value: 'Рабочий',
      validate: (value) => (value.trim() ? '' : 'Введите название.'),
    }),
    include = Checkbox({
      layout: 'parameter',
      label: 'Включать метаданные при следующем экспорте',
      checked: true,
    }),
    accepted = { name: 'Рабочий', include: true },
    result = status('Сохранено: Рабочий · метаданные включены');
  let attempts = 0;
  const cancel = ActionButton({
    label: 'Отменить изменения',
    onClick: () => {
      name.setValue(accepted.name);
      include.setState({ checked: accepted.include });
      result.textContent = 'Черновик отменён. Сохранено: ' + accepted.name;
    },
  });
  const save = AsyncCommand({
    label: 'Сохранить профиль',
    action: async () => {
      if (!name.validate()) {
        name.input.focus();
        throw Error('invalid');
      }
      const draft = { name: name.draft, include: include.value };
      name.input.disabled = include.input.disabled = cancel.disabled = true;
      try {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (++attempts === 1) throw Error('demo failure');
        accepted.name = draft.name;
        accepted.include = draft.include;
        name.setValue(draft.name);
        result.textContent =
          'Сохранено: ' +
          accepted.name +
          ' · метаданные ' +
          (accepted.include ? 'включены' : 'выключены');
      } finally {
        name.input.disabled = include.input.disabled = cancel.disabled = false;
      }
    },
  });
  const form = el('div', { class: 'composition-form' }, [
    name.element,
    include.element,
    el('div', { class: 'action-row' }, [save.element, cancel]),
    result,
  ]);
  parent.append(
    immediate.element,
    Tabs({
      label: 'Раздел настроек',
      items: [
        { id: 'profile', label: 'Профиль', content: form },
        {
          id: 'help',
          label: 'Справка',
          content: el('p', {
            text: 'Настройки профиля применяются отдельной командой. Черновик сохраняется при смене вкладки.',
          }),
        },
      ],
    }).element
  );
  note(
    parent,
    'Подсказки меняются сразу. Профиль — отдельный черновик с сохранением и ' +
      'отменой. Первая валидная попытка сохранения намеренно завершается ошибкой ' +
      'для проверки восстановления.'
  );
}
