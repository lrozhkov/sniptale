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
});
