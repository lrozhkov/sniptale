import type { FabricObject, Group } from 'fabric';

type TextObj = FabricObject & {
  fontSize?: number;
  scaleX?: number;
  scaleY?: number;
  top?: number;
  width?: number;
  set?: (values: Record<string, unknown>) => unknown;
};

type CircleObj = FabricObject & {
  radius?: number;
  strokeUniform?: boolean;
  set?: (values: Record<string, unknown>) => unknown;
};

type ScaledGroup = Group & {
  scaleX?: number;
  scaleY?: number;
  triggerLayout?: () => void;
};

function resolveStepScale(value: number | undefined): number {
  return Number.isFinite(value) && value && value > 0 ? value : 1;
}

function setStepCircleGeometry(circle: CircleObj, radius: number): void {
  const payload = {
    radius,
    strokeUniform: true,
  };
  if (typeof circle.set === 'function') {
    circle.set(payload);
    return;
  }

  circle.radius = radius;
  circle.strokeUniform = true;
}

function setStepTextGeometry(
  text: TextObj,
  args: { fontSize: number; top: number; width: number }
): void {
  const payload = {
    fontSize: args.fontSize,
    scaleX: 1,
    scaleY: 1,
    top: args.top,
    width: args.width,
  };
  if (typeof text.set === 'function') {
    text.set(payload);
    return;
  }

  text.fontSize = args.fontSize;
  text.scaleX = 1;
  text.scaleY = 1;
  text.top = args.top;
  text.width = args.width;
}

function resetStepGroupScale(group: ScaledGroup): void {
  const payload = {
    scaleX: 1,
    scaleY: 1,
  };
  if (typeof group.set === 'function') {
    group.set(payload);
    return;
  }

  group.scaleX = 1;
  group.scaleY = 1;
}

export function normalizeScaledStepGroup(group: Group): boolean {
  if (typeof group.getObjects !== 'function') {
    return false;
  }

  const [circle, text] = group.getObjects() as [CircleObj | undefined, TextObj | undefined];
  if (!circle || !text) {
    return false;
  }

  const scaleX = resolveStepScale(group.scaleX);
  const scaleY = resolveStepScale(group.scaleY);
  const uniformScale = Math.sqrt(scaleX * scaleY);
  const nextRadius = Math.max(1, (circle.radius ?? 0) * uniformScale);
  const nextFontSize = Math.max(1, (text.fontSize ?? 0) * uniformScale);
  const nextWidth = Math.max(1, (text.width ?? 0) * scaleX);
  const nextTop = (text.top ?? 0) * scaleY;

  setStepCircleGeometry(circle, nextRadius);
  setStepTextGeometry(text, {
    fontSize: nextFontSize,
    top: nextTop,
    width: nextWidth,
  });
  const scaledGroup = group as ScaledGroup;
  resetStepGroupScale(scaledGroup);
  scaledGroup.triggerLayout?.();
  group.setCoords();
  group.dirty = true;
  return true;
}
