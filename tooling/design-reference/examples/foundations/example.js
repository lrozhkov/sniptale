import { el, paramRow, exampleCase } from '../shared/dom.js';
import { TextField } from '../shared/fields.js';
import { createDropdown } from '../shared/choices.js';
import { ActionButton } from '../shared/buttons.js';
import { TextFit } from '../shared/text-fit.js';
import { AdaptiveActions } from '../shared/adaptive-actions.js';
export function render(root, { manifest }) {
  const cases = Object.fromEntries(manifest.cases.map((c) => [c.id.split('.').at(-1), c]));
  root.append(
    exampleCase(cases['text-hierarchy'], [
      el('div', { class: 'case-stage' }, [
        paramRow('Непрозрачность', '64%'),
        paramRow('Разрешение холста', '1920 × 1080'),
        paramRow(
          'Очень длинное название параметра для проверки переноса в узкой колонке',
          'Исходное разрешение'
        ),
      ]),
      el('p', {
        text: 'Название приглушено. Текущее значение контрастнее. Это роли текста, а не отдельные варианты поля.',
      }),
    ])
  );
  const densities = el('div', { class: 'case-stage density-comparison' });
  root.append(
    exampleCase(cases.density, [
      densities,
      el('p', {
        text:
          'По умолчанию 32 px: поле, закрытый список и кнопка одной высоты. 40 и 48 px ' +
          '— явные варианты плотности. Подпись отстоит на 4 px, соседние действия — на ' +
          '8 px.',
      }),
    ])
  );
  for (const [density, label, height] of [
    ['compact', 'Компактная · основная', 32],
    ['standard', 'Стандартная · по задаче', 40],
    ['spacious', 'Свободная · по задаче', 48],
  ]) {
    const sample = el('div', {
        class: 'density-comparison-row',
        'data-density': density,
        style:
          '--control-height:' + height + 'px;--control-padding-block:' + (height - 20) / 2 + 'px',
      }),
      fields = el('div', { class: 'density-control-row' }),
      text = TextField({ label: 'Название', value: 'Вступление' }),
      select = el('div', { class: 'field' }),
      action = el('div', { class: 'density-action' }, [
        el('span', { class: 'sample-label', text: 'Команда' }),
        ActionButton({ label: 'Применить', density, kind: 'primary' }),
      ]);
    sample.append(
      el('span', { class: 'sample-label', text: label + ' · ' + height + ' px' }),
      fields
    );
    fields.append(text.element, select, action);
    densities.append(sample);
    createDropdown(
      select,
      'Разрешение',
      [
        { value: 'hd', label: '1280 × 720' },
        { value: 'full', label: '1920 × 1080' },
      ],
      'full'
    );
  }
  root.append(
    exampleCase(cases.radius, [
      el('div', { class: 'sample-grid' }, [
        el('div', {}, [
          el('span', { class: 'sample-label', text: 'Поле и меню: 4 px' }),
          el('div', { class: 'drawing', 'data-radius-role': 'field', text: 'Поле' }),
          el('div', {
            class: 'drawing',
            'data-radius-role': 'menu',
            style: 'margin-top:8px',
            text: 'Поверхность меню',
          }),
        ]),
        el('div', {}, [
          el('span', { class: 'sample-label', text: 'Вложенные поверхности: 4 px' }),
          el(
            'div',
            { class: 'radius-outer' },
            el('div', { class: 'radius-inner', text: 'Внутренняя поверхность · 4 px' })
          ),
        ]),
      ]),
      el(
        'div',
        { class: 'sample-grid', style: 'margin-top:12px' },
        ['structure', 'content', 'dialog'].map((role, i) =>
          el('div', {
            class: 'drawing',
            'data-radius-role': role,
            text: ['Панель · 4 px', 'Превью · 4 px', 'Диалог · 8 px'][i],
          })
        )
      ),
      el('p', {
        text:
          'Структурные панели — 4 px, превью — 4 px, контролы и меню — 4 px, диалоги — ' +
          '8 px. Размер окна не увеличивает радиус.',
      }),
    ])
  );
  root.append(
    exampleCase(cases.material, [
      el(
        'div',
        { class: 'material-scene' },
        el('div', { class: 'material-sample' }, [
          el('strong', { text: 'Лёгкий glass' }),
          el('p', { text: 'Фон просвечивает и размывается. Текст остаётся непрозрачным.' }),
        ])
      ),
      el('p', {
        text: 'Основной материал меню. При reduced transparency и forced colors используется сплошная поверхность.',
      }),
    ])
  );
  const result = el('p', {
    class: 'reference-status',
    role: 'status',
    text: 'Перейдите к кнопке клавишей Tab: фокус виден без наведения.',
  });
  const probe = el('button', {
    type: 'button',
    class: 'focus-probe',
    text: 'Проверить общий фокус',
    onClick: () => {
      result.textContent = 'Действие выполнено. Фокус остаётся на элементе.';
    },
  });
  root.append(exampleCase(cases.focus, [el('div', { class: 'case-stage' }, [probe, result])]));
  const fitting = el('div', { class: 'case-stage text-fit-examples' });
  root.append(exampleCase(cases['text-fitting'], [fitting]));
  fitting.append(
    TextFit({
      text: 'Полное название параметра, которое переносится без потери смысла',
      policy: 'wrap',
    }).element,
    TextFit({
      text: 'Очень длинное название выбранного объекта в фиксированной строке',
      policy: 'end',
    }).element,
    TextFit({ text: 'Project_Introduction_Export_Final_2026_10_15.mp4', policy: 'middle' }).element,
    el('p', {
      text: 'Перенос, сокращение с конца и сокращение имени файла посередине. Полный текст доступен по hover и фокусу.',
    })
  );
  const adaptive = AdaptiveActions(),
    widthField = el('div', { class: 'field' }),
    adaptiveStage = el('div', { class: 'case-stage' }, [widthField, adaptive.element]);
  root.append(exampleCase(cases['responsive-actions'], [adaptiveStage]));
  createDropdown(
    widthField,
    'Доступная ширина',
    [
      { value: '520', label: '520 px' },
      { value: '320', label: '320 px' },
      { value: '220', label: '220 px' },
    ],
    '520',
    {
      onChange: (value) => {
        adaptive.frame.style.width = value + 'px';
        adaptive.layout();
      },
    }
  );
}
