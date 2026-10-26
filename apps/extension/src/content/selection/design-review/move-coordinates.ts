type Point = { x: number; y: number };
interface MoveCoordinates {
  coefficients: number[];
  ancestors: Element[];
  toLocal(point: Point): Point;
  matches(next: MoveCoordinates | null): boolean;
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in node;
}

function composedParent(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return isShadowRoot(root) ? root.host : null;
}

function readZoom(styles: CSSStyleDeclaration): number {
  const value = styles.zoom;
  const zoom = !value || value === 'normal' ? 1 : Number(value);
  if (!Number.isFinite(zoom) || zoom <= 0) throw new Error('Unsupported CSS zoom');
  return zoom;
}

function readRotation(value: string): number {
  if (!value || value === 'none') return 0;
  const parts = value.trim().split(/\s+/u);
  const angle = parts.pop()!;
  const unit = ['deg', 'grad', 'rad', 'turn'].find((suffix) => angle.endsWith(suffix));
  if (!unit) throw new Error('Unsupported rotation');
  const token = angle.slice(0, -unit.length);
  const unsigned = token.startsWith('-') ? token.slice(1) : token;
  const digits = unsigned.split('.');
  if (
    digits.length > 2 ||
    !digits.some((part) => part.length > 0) ||
    !digits.every((part) => [...part].every((character) => character >= '0' && character <= '9'))
  )
    throw new Error('Unsupported rotation');
  const numericAngle = Number(token);
  if (!Number.isFinite(numericAngle)) throw new Error('Unsupported rotation');
  let sign = 1;
  if (parts.length && parts.join(' ') !== 'z') {
    if (
      parts.length !== 3 ||
      Number(parts[0]) !== 0 ||
      Number(parts[1]) !== 0 ||
      !Number.isFinite(Number(parts[2])) ||
      Number(parts[2]) === 0
    )
      throw new Error('Unsupported 3D rotation');
    sign = Math.sign(Number(parts[2]));
  }
  const factor = unit === 'rad' ? 180 / Math.PI : unit === 'grad' ? 0.9 : unit === 'turn' ? 360 : 1;
  return numericAngle * factor * sign;
}

function readLinearStyles(styles: CSSStyleDeclaration): DOMMatrix {
  if (
    (styles.perspective && styles.perspective !== 'none') ||
    (styles.offsetPath && styles.offsetPath !== 'none')
  )
    throw new Error('Unsupported projected geometry');
  let matrix = new DOMMatrix().scale(readZoom(styles)).rotate(readRotation(styles.rotate));
  if (styles.scale && styles.scale !== 'none') {
    const scale = styles.scale.trim().split(/\s+/u).map(Number);
    if (
      !scale.length ||
      scale.length > 3 ||
      !scale.every(Number.isFinite) ||
      (scale[2] !== undefined && scale[2] !== 1)
    )
      throw new Error('Unsupported scale');
    matrix = matrix.scale(scale[0]!, scale[1] ?? scale[0]!);
  }
  if (styles.transform && styles.transform !== 'none') {
    const transform = new DOMMatrix(styles.transform);
    if (
      transform.m13 ||
      transform.m14 ||
      transform.m23 ||
      transform.m24 ||
      transform.m31 ||
      transform.m32 ||
      transform.m34 ||
      transform.m43 ||
      transform.m33 !== 1 ||
      transform.m44 !== 1
    )
      throw new Error('Unsupported 3D transform');
    matrix = matrix.multiply(
      new DOMMatrix([transform.a, transform.b, transform.c, transform.d, 0, 0])
    );
  }
  return matrix;
}

function readDocumentMap(target: Element, includeTarget: boolean, ancestors: Element[]): DOMMatrix {
  const view = target.ownerDocument.defaultView;
  if (!view) throw new Error('Unavailable document');
  let matrix = includeTarget
    ? readLinearStyles(view.getComputedStyle(target))
    : new DOMMatrix().scale(readZoom(view.getComputedStyle(target)));
  let ancestor = composedParent(target);
  for (let depth = 0; ancestor; depth += 1) {
    if (depth >= 128) throw new Error('Unsupported ancestor depth');
    ancestors.push(ancestor);
    matrix = readLinearStyles(view.getComputedStyle(ancestor)).multiply(matrix);
    ancestor = composedParent(ancestor);
  }
  return matrix;
}

/** Maps top-viewport pointer deltas to individual translate units without writing source styles. */
export function readDesignReviewMoveCoordinates(target: Element): MoveCoordinates | null {
  try {
    if (!target.isConnected) return null;
    const ancestors: Element[] = [];
    let matrix = readDocumentMap(target, false, ancestors);
    let doc = target.ownerDocument;
    for (let depth = 0; doc !== document; depth += 1) {
      if (depth >= 10) return null;
      const frame = doc.defaultView?.frameElement;
      if (
        !frame ||
        frame.tagName.toLowerCase() !== 'iframe' ||
        !('offsetWidth' in frame) ||
        !('offsetHeight' in frame)
      )
        return null;
      const width = frame.offsetWidth;
      const height = frame.offsetHeight;
      if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0)
        return null;
      const frameMap = readDocumentMap(frame, true, ancestors);
      if (
        Math.abs(frameMap.b) > 0.000001 ||
        Math.abs(frameMap.c) > 0.000001 ||
        frameMap.a <= 0 ||
        frameMap.d <= 0
      )
        return null;
      const rect = frame.getBoundingClientRect();
      matrix = new DOMMatrix().scale(rect.width / width, rect.height / height).multiply(matrix);
      ancestors.push(frame);
      doc = frame.ownerDocument;
    }
    const coefficients = [matrix.a, matrix.b, matrix.c, matrix.d];
    if (!coefficients.every(Number.isFinite) || matrix.a * matrix.d - matrix.b * matrix.c === 0)
      return null;
    const inverse = matrix.inverse();
    if (![inverse.a, inverse.b, inverse.c, inverse.d].every(Number.isFinite)) return null;
    return {
      coefficients,
      ancestors,
      toLocal: (point: Point): Point => ({
        x: inverse.a * point.x + inverse.c * point.y,
        y: inverse.b * point.x + inverse.d * point.y,
      }),
      matches: (next: MoveCoordinates | null): boolean =>
        Boolean(
          next &&
          ancestors.length === next.ancestors.length &&
          ancestors.every((ancestor, index) => ancestor === next.ancestors[index]) &&
          coefficients.every(
            (value, index) => Math.abs(value - next.coefficients[index]!) < 0.000001
          )
        ),
    };
  } catch {
    return null;
  }
}
