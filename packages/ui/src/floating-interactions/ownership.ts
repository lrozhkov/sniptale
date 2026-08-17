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

  const candidates = [
    ...composedRoot.querySelectorAll<HTMLElement>(FLOATING_INTERACTION_OWNED_LAYER_SELECTOR),
  ];
  const ownedLayers: HTMLElement[] = [];
  const visitedLayers = new Set<HTMLElement>();
  let foundNestedOwner = true;

  while (foundNestedOwner) {
    foundNestedOwner = false;
    for (const layer of candidates) {
      if (
        visitedLayers.has(layer) ||
        !ownerIds.has(layer.getAttribute(FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE)!)
      ) {
        continue;
      }
      visitedLayers.add(layer);
      ownedLayers.push(layer);
      for (const owner of layer.querySelectorAll<HTMLElement>(
        FLOATING_INTERACTION_OWNER_SELECTOR
      )) {
        const ownerId = owner.getAttribute(FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE);
        if (ownerId && !ownerIds.has(ownerId)) {
          ownerIds.add(ownerId);
          foundNestedOwner = true;
        }
      }
    }
  }

  return ownedLayers;
}
