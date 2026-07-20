// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { createDomHelpersTextResolverController } from './dom-helpers-text-resolver.controller';

it('assigns sniptale ids to the resolved original element when the resolver returns a mapped node', () => {
  const controller = createDomHelpersTextResolverController();
  const original = document.createElement('div');
  const virtual = document.createElement('div');
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

  controller.setResolver(() => original);
  controller.assignSniptaleId(virtual, 'field-1');

  expect(original.dataset['sniptaleId']).toBe('field-1');
  expect(virtual.dataset['sniptaleId']).toBeUndefined();
  expect(logSpy).toHaveBeenCalledWith(
    '[ContentDomTextResolver]',
    'Mapping virtual to original',
    expect.objectContaining({ id: 'field-1' })
  );
});

it('falls back to the provided element when no resolver is registered', () => {
  const controller = createDomHelpersTextResolverController();
  const element = document.createElement('div');
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  controller.assignSniptaleId(element, 'field-2');

  expect(element.dataset['sniptaleId']).toBe('field-2');
  expect(warnSpy).toHaveBeenCalledWith(
    '[ContentDomTextResolver]',
    'Original element resolver is not set'
  );
});

it('warns for disconnected virtual elements without an original match and keeps the fallback assignment', () => {
  const controller = createDomHelpersTextResolverController();
  const element = document.createElement('div');
  element.id = 'virtual-field';
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  controller.setResolver(() => null);
  controller.assignSniptaleId(element, 'field-3');

  expect(element.dataset['sniptaleId']).toBe('field-3');
  expect(warnSpy).toHaveBeenCalledWith(
    '[ContentDomTextResolver]',
    'No original element found for virtual element',
    expect.objectContaining({
      elementId: 'virtual-field',
      id: 'field-3',
    })
  );
});
