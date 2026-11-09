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

export function collectMagnetTargets(
  target: FabricObject,
  canvasSize: { width: number; height: number }
): Set<FabricObject> {
  const targets = new Set<FabricObject>();
  const selectedChildren = new Set(getTargetHierarchy(target));

  target.canvas?.forEachObject((candidate) => {
    if (!candidate.visible || !candidate.isOnScreen()) {
      return;
    }

    if (getTargetHierarchy(candidate).some((object) => selectedChildren.has(object))) return;

    if (target.sniptaleId && candidate.sniptaleId === target.sniptaleId) return;

    if (isMagnetTarget(candidate)) {
      targets.add(candidate);
    }
  });

  targets.add(createWorkspaceGuideTarget(canvasSize));
  return targets;
}
