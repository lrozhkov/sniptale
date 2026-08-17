// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE,
  FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE,
  getOwnedFloatingInteractionLayers,
} from './ownership';

describe('floating interaction layer registration', () => {
  it('resolves only floating layers registered to owners inside the requested scope', () => {
    const modal = document.createElement('div');
    const selectorOwner = document.createElement('div');
    selectorOwner.setAttribute(FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE, 'selector-a');
    modal.append(selectorOwner);
    const ownedLayer = document.createElement('div');
    ownedLayer.setAttribute(FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE, 'selector-a');
    const unrelatedLayer = document.createElement('div');
    unrelatedLayer.setAttribute(FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE, 'selector-b');
    document.body.append(modal, ownedLayer, unrelatedLayer);

    expect(getOwnedFloatingInteractionLayers(modal, document)).toEqual([ownedLayer]);

    modal.remove();
    ownedLayer.remove();
    unrelatedLayer.remove();
  });

  it('returns no layers when the requested scope has no non-empty owner ids', () => {
    const scope = document.createElement('div');
    const emptyOwner = document.createElement('div');
    emptyOwner.setAttribute(FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE, '');
    scope.append(emptyOwner);

    expect(getOwnedFloatingInteractionLayers(scope, document)).toEqual([]);
    expect(getOwnedFloatingInteractionLayers(document.createElement('div'), document)).toEqual([]);
  });

  it('follows nested floating owners through multiple portal levels', () => {
    const scope = document.createElement('div');
    const paintOwner = document.createElement('div');
    paintOwner.setAttribute(FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE, 'paint');
    scope.append(paintOwner);
    const paintLayer = document.createElement('div');
    paintLayer.setAttribute(FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE, 'paint');
    const selectOwner = document.createElement('div');
    selectOwner.setAttribute(FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE, 'select');
    paintLayer.append(selectOwner);
    const selectLayer = document.createElement('div');
    selectLayer.setAttribute(FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE, 'select');
    document.body.append(scope, paintLayer, selectLayer);

    expect(getOwnedFloatingInteractionLayers(scope, document)).toEqual([paintLayer, selectLayer]);

    scope.remove();
    paintLayer.remove();
    selectLayer.remove();
  });
});
