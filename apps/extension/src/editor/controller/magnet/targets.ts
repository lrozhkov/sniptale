import { ActiveSelection, Group, type FabricObject } from 'fabric';
import { isBackgroundObject, isEditableObject, isSourceObject } from '../../document/model';
import { createWorkspaceGuideTarget } from './workspace-guides';

function isEditableMagnetSibling(object: FabricObject): boolean {
  return isEditableObject(object) && !isSourceObject(object) && !isBackgroundObject(object);
}

function getTargetHierarchy(target: FabricObject): FabricObject[] {
  return target instanceof Group
    ? [target, ...target.getObjects().flatMap(getTargetHierarchy)]
    : [target];
}

export function isMagnetTarget(target: FabricObject): boolean {
  if (target instanceof ActiveSelection || target instanceof Group) {
    const children = target.getObjects();
    return children.length > 0 && isEditableMagnetSibling(target) && children.every(isMagnetTarget);
  }

  return isEditableMagnetSibling(target);
}

/** External point/rectangle proxies carry the document identity, but no Fabric ownership. */
function resolveAuthoritativeTarget(target: FabricObject): FabricObject {
  if (!target.sniptaleId) return target;
  let authoritative = target;
  target.canvas?.forEachObject((candidate) => {
    const match = getTargetHierarchy(candidate).find(
      (object) => object.sniptaleId === target.sniptaleId
    );
    if (match) authoritative = match;
  });
  return authoritative;
}

export function collectMagnetTargets(
  target: FabricObject,
  canvasSize: { width: number; height: number }
): Set<FabricObject> {
  const targets = new Set<FabricObject>();
  const authoritative = resolveAuthoritativeTarget(target);
  const selectedChildren = new Set(getTargetHierarchy(authoritative));

  const siblings =
    authoritative instanceof ActiveSelection
      ? authoritative.getObjects()[0]?.parent
      : (authoritative.parent ?? authoritative.group);
  const visit = (candidate: FabricObject) => {
    if (!candidate.visible || !candidate.isOnScreen()) {
      return;
    }

    if (getTargetHierarchy(candidate).some((object) => selectedChildren.has(object))) return;

    if (target.sniptaleId && candidate.sniptaleId === target.sniptaleId) return;

    if (isMagnetTarget(candidate)) {
      targets.add(candidate);
    }
  };
  if (siblings?.sniptaleType === 'group') siblings.forEachObject(visit);
  else target.canvas?.forEachObject(visit);

  targets.add(createWorkspaceGuideTarget(canvasSize));
  return targets;
}
