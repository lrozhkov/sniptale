import { ActiveSelection, Group, type FabricObject } from 'fabric';
import { isBackgroundObject, isEditableObject, isSourceObject } from '../../document/model';
import { createWorkspaceGuideTarget } from './workspace-guides';

function isEditableMagnetSibling(object: FabricObject): boolean {
  return isEditableObject(object) && !isSourceObject(object) && !isBackgroundObject(object);
}

function getTargetChildren(target: FabricObject): FabricObject[] {
  if (target instanceof ActiveSelection || target instanceof Group) {
    return target.getObjects();
  }

  return [target];
}

function collectEditableChildren(
  targets: Set<FabricObject>,
  group: Group,
  selectedChildren: Set<FabricObject>
) {
  for (const child of group.getObjects()) {
    if (child instanceof Group) {
      collectEditableChildren(targets, child, selectedChildren);
      continue;
    }

    if (child.visible && isEditableMagnetSibling(child) && !selectedChildren.has(child)) {
      targets.add(child);
    }
  }
}

export function isMagnetTarget(target: FabricObject): boolean {
  if (target instanceof ActiveSelection || target instanceof Group) {
    const children = target.getObjects();
    return children.length > 0 && children.every(isEditableMagnetSibling);
  }

  return isEditableMagnetSibling(target);
}

export function collectMagnetTargets(
  target: FabricObject,
  canvasSize: { width: number; height: number }
): Set<FabricObject> {
  const targets = new Set<FabricObject>();
  const selectedChildren = new Set(getTargetChildren(target));

  target.canvas?.forEachObject((candidate) => {
    if (!candidate.visible || !candidate.isOnScreen()) {
      return;
    }

    if (candidate instanceof Group) {
      collectEditableChildren(targets, candidate, selectedChildren);
      return;
    }

    if (isEditableMagnetSibling(candidate) && !selectedChildren.has(candidate)) {
      targets.add(candidate);
    }
  });

  targets.add(createWorkspaceGuideTarget(canvasSize));
  return targets;
}
