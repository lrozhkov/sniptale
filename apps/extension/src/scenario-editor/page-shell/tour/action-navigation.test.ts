import { expect, it } from 'vitest';
import {
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { tourActionTarget } from './action-navigation';

it('walks mixed actions and empty slides in both directions without modifying the tour', () => {
  const tour = createTourDocument();
  const first = createTourImageSlide('first');
  first.actions = [
    ...first.actions.filter((entry) => entry.type !== 'annotation'),
    ...['one', 'two']
      .map((id) => ({
        id,
        text: id,
        anchor: null,
        appearance: null,
      }))
      .map((object) => ({ type: 'annotation' as const, object })),
  ];
  first.masks = [
    {
      id: 'mask',
      kind: 'blur',
      color: '#000000',
      opacity: 1,
      rect: { x: 0, y: 0, width: 1, height: 1 },
    },
  ];
  const last = createTourImageSlide('last');
  last.actions = [
    ...last.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'three', text: 'Three', anchor: null, appearance: null }].map((object) => ({
      type: 'annotation' as const,
      object,
    })),
  ];
  tour.slides = [first, createTourImageSlide('empty'), last];
  const original = structuredClone(tour);
  const at = (slideId: string, objectId: string | null) => ({
    kind: 'slide' as const,
    slideId,
    objectId,
  });
  expect(tourActionTarget(tour, at('first', 'one'), -1)).toBeNull();
  expect(tourActionTarget(tour, at('first', 'one'), 1)).toEqual(at('first', 'two'));
  expect(tourActionTarget(tour, at('first', 'two'), 1)).toEqual(at('empty', null));
  expect(tourActionTarget(tour, at('empty', null), 1)).toEqual(at('last', 'three'));
  expect(tourActionTarget(tour, at('last', 'three'), 1)).toBeNull();
  expect(tourActionTarget(tour, at('last', 'three'), -1)).toEqual(at('empty', null));
  expect(tourActionTarget(tour, at('empty', null), -1)).toEqual(at('first', 'two'));
  expect(tourActionTarget(tour, at('first', 'two'), -1)).toEqual(at('first', 'one'));
  expect(tour).toEqual(original);
  first.actions.sort(
    (left, right) =>
      ['two', 'mask', 'one'].indexOf(left.object.id) -
      ['two', 'mask', 'one'].indexOf(right.object.id)
  );
  expect(tourActionTarget(tour, at('first', 'two'), 1)).toEqual(at('first', 'one'));
  expect(tourActionTarget(tour, at('first', 'one'), -1)).toEqual(at('first', 'two'));
  first.actions.reverse();
  tour.slides.reverse();
  expect(tourActionTarget(tour, at('empty', null), 1)).toEqual(at('first', 'one'));
  expect(tourActionTarget(tour, at('empty', null), -1)).toEqual(at('last', 'three'));
  expect(tourActionTarget(tour, at('missing', null), 1)).toBeNull();
  expect(tourActionTarget(tour, { kind: 'end' }, 1)).toBeNull();
});

it('includes navigation-slide buttons and resolves manual slide selection to its visible first action', () => {
  const tour = createTourDocument();
  tour.slides = [
    {
      kind: 'navigation',
      id: 'menu',
      title: '',
      description: '',
      background: { color: '#000000', image: null },
      narration: null,
      timing: createTourImageSlide().timing,
      buttons: ['first', 'second'].map((id) => ({ id, label: id, action: { kind: 'none' } })),
    },
  ];
  const at = (objectId: string | null) => ({ kind: 'slide' as const, slideId: 'menu', objectId });
  expect(tourActionTarget(tour, at(null), 1)).toEqual(at('second'));
  expect(tourActionTarget(tour, at('second'), -1)).toEqual(at('first'));
  expect(tourActionTarget(tour, at('second'), 1)).toBeNull();
});
