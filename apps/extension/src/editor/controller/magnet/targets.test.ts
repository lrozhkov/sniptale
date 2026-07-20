import { Group, Rect, type FabricObject } from 'fabric';
import { describe, expect, it } from 'vitest';
import type { EditorObjectType } from '../../../features/editor/document/types';
import { collectMagnetTargets, isMagnetTarget } from './targets';

function createRect(options: {
  height: number;
  left: number;
  top: number;
  width: number;
  role?: Rect['sniptaleRole'];
  type?: EditorObjectType;
}) {
  const rect = new Rect({
    left: options.left,
    top: options.top,
    width: options.width,
    height: options.height,
    strokeWidth: 0,
  });
  if (options.role !== undefined) {
    rect.sniptaleRole = options.role;
  }
  rect.sniptaleType = options.type ?? 'rectangle';
  rect.isOnScreen = () => true;
  rect.setCoords();
  return rect;
}

function createCanvas(objects: FabricObject[]) {
  const canvas = {
    forEachObject(callback: (object: FabricObject) => void) {
      objects.forEach(callback);
    },
  };

  for (const object of objects) {
    object.canvas = canvas as never;
  }

  return canvas;
}

function createWorkspaceTargetSet(selected: Rect, ...objects: Rect[]) {
  createCanvas([selected, ...objects]);
  return Array.from(collectMagnetTargets(selected, { width: 120, height: 80 }));
}

function createMixedTargetFixtures() {
  const selected = createRect({ left: 40, top: 40, width: 20, height: 20 });
  const editableSibling = createRect({ left: 70, top: 40, width: 20, height: 20 });
  const sourceImage = createRect({
    left: 50,
    top: 50,
    width: 100,
    height: 80,
    role: 'source',
    type: 'source-image',
  });
  const cropGuide = createRect({
    left: 50,
    top: 50,
    width: 100,
    height: 80,
    role: 'crop-guide',
  });

  return { selected, editableSibling, sourceImage, cropGuide };
}

function createGroupTargetFixtures() {
  const selectedChild = createRect({ left: 40, top: 40, width: 20, height: 20 });
  const siblingChild = createRect({ left: 70, top: 40, width: 20, height: 20 });
  const nestedEditable = new Rect({
    left: 88,
    top: 40,
    width: 18,
    height: 18,
    strokeWidth: 0,
  });
  nestedEditable.sniptaleType = 'rectangle';
  const selectedGroup = new Group([selectedChild]);
  const nestedGroup = new Group([nestedEditable]);
  const siblingGroup = new Group([siblingChild, nestedGroup]);
  const sourceChild = createRect({
    left: 100,
    top: 40,
    width: 20,
    height: 20,
    role: 'source',
    type: 'source-image',
  });
  const mixedGroup = new Group([siblingChild, sourceChild]);
  nestedGroup.isOnScreen = () => true;
  selectedGroup.isOnScreen = () => true;
  siblingGroup.isOnScreen = () => true;
  mixedGroup.isOnScreen = () => true;

  return {
    mixedGroup,
    nestedEditable,
    selectedChild,
    selectedGroup,
    siblingChild,
    siblingGroup,
    sourceChild,
  };
}

describe('editor magnet targets', () => {
  registerEditableSiblingTargetTest();
  registerPlainTargetAcceptanceTest();
  registerVisibilityFilterTest();
  registerGroupedTargetHandlingTest();
});

function registerEditableSiblingTargetTest() {
  it('keeps only editable sibling targets and always adds the workspace guide', () => {
    const { selected, editableSibling, sourceImage, cropGuide } = createMixedTargetFixtures();
    const targets = createWorkspaceTargetSet(selected, editableSibling, sourceImage, cropGuide);

    expect(targets).toContain(editableSibling);
    expect(targets).not.toContain(selected);
    expect(targets).not.toContain(sourceImage);
    expect(targets).not.toContain(cropGuide);
    expect(targets.some((target) => target.width === 120 && target.height === 80)).toBe(true);
  });
}

function registerPlainTargetAcceptanceTest() {
  it('accepts editable layers and rejects crop/source-owned objects as magnet targets', () => {
    expect(isMagnetTarget(createRect({ left: 40, top: 40, width: 20, height: 20 }))).toBe(true);
    expect(
      isMagnetTarget(
        createRect({
          left: 40,
          top: 40,
          width: 20,
          height: 20,
          role: 'crop-guide',
        })
      )
    ).toBe(false);
    expect(
      isMagnetTarget(
        createRect({
          left: 40,
          top: 40,
          width: 20,
          height: 20,
          role: 'source',
          type: 'source-image',
        })
      )
    ).toBe(false);
  });
}

function registerVisibilityFilterTest() {
  it('skips hidden and off-screen candidates while keeping workspace alignment available', () => {
    const selected = createRect({ left: 40, top: 40, width: 20, height: 20 });
    const hiddenSibling = createRect({ left: 70, top: 40, width: 20, height: 20 });
    const offscreenSibling = createRect({ left: 85, top: 40, width: 20, height: 20 });
    hiddenSibling.visible = false;
    offscreenSibling.isOnScreen = () => false;

    const targets = createWorkspaceTargetSet(selected, hiddenSibling, offscreenSibling);

    expect(targets).not.toContain(hiddenSibling);
    expect(targets).not.toContain(offscreenSibling);
    expect(targets).toHaveLength(1);
  });
}

function registerGroupedTargetHandlingTest() {
  it('keeps nested editable group children, excludes selected group children, and rejects mixed groups', () => {
    const {
      mixedGroup,
      nestedEditable,
      selectedChild,
      selectedGroup,
      siblingChild,
      siblingGroup,
      sourceChild,
    } = createGroupTargetFixtures();

    createCanvas([selectedGroup, siblingGroup, mixedGroup]);

    const targets = Array.from(collectMagnetTargets(selectedGroup, { width: 120, height: 80 }));

    expect(targets).toContain(siblingChild);
    expect(targets).toContain(nestedEditable);
    expect(targets).not.toContain(selectedChild);
    expect(targets).not.toContain(sourceChild);
    expect(isMagnetTarget(selectedGroup)).toBe(true);
    expect(isMagnetTarget(mixedGroup)).toBe(false);
  });
}
