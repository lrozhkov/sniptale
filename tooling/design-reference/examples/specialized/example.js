import { el, exampleCase } from '../shared/dom.js';
import { TimelineProbe, CanvasProbe, InspectorFrameProbe } from '../shared/specialized.js';
export function render(root, { manifest }) {
  const add = (key, component, note) =>
    root.append(
      exampleCase(
        manifest.cases.find((c) => c.id === 'specialized.' + key),
        [
          el('div', { class: 'case-stage' }, component.element),
          el('p', { class: 'gesture-note', text: note }),
        ]
      )
    );
  add(
    'timeline',
    TimelineProbe(),
    'Ограниченная примерка: 20 секунд, равномерная сетка 30 fps. Линейка меняет позицию; края диапазона поддерживают стрелки и Shift. Ctrl+wheel меняет масштаб по исходной логарифмической формуле.'
  );
  add(
    'canvas',
    CanvasProbe(),
    'Проба координат: холст 100×100 условных единиц, объект 20×20. Масштаб и прокрутка не меняют координаты. Числовые поля дают точный ввод.'
  );
  add(
    'inspector',
    InspectorFrameProbe(),
    'Проба оболочки: сворачивание сохраняет значения. Прокрутка принадлежит содержимому, действия остаются доступны при малой высоте.'
  );
  add(
    'recovery',
    TimelineProbe(),
    'Проверка жеста: Escape, pointercancel, потеря захвата и уход из окна отменяют предпросмотр. Второй указатель не перехватывает активный жест. Это не воспроизведение всего редактора.'
  );
}
