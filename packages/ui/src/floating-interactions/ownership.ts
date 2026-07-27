export const FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE = 'data-floating-ui-owner-id';
export const FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE = 'data-floating-ui-owned-by';
export const FLOATING_INTERACTION_CAPTURE_TRANSIENT_ATTRIBUTE =
  'data-floating-ui-capture-transient';

const FLOATING_INTERACTION_OWNER_SELECTOR = `[${FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE}]`;
const FLOATING_INTERACTION_OWNED_LAYER_SELECTOR = `[${FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE}]`;

export function getOwnedFloatingInteractionLayers(
  ownerScope: Element,
  composedRoot: ParentNode
): HTMLElement[] {
  const ownerIds = new Set(
    [...ownerScope.querySelectorAll<HTMLElement>(FLOATING_INTERACTION_OWNER_SELECTOR)]
      .map((owner) => owner.getAttribute(FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE))
      .filter((ownerId): ownerId is string => Boolean(ownerId))
  );
  if (ownerIds.size === 0) return [];

  return [
    ...composedRoot.querySelectorAll<HTMLElement>(FLOATING_INTERACTION_OWNED_LAYER_SELECTOR),
  ].filter((layer) => ownerIds.has(layer.getAttribute(FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE)!));
}
