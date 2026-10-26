export interface DesignReviewMeasureState {
  a: Element | null;
  b: Element | null;
  preview: Element | null;
  slot: 'a' | 'b' | null;
  replacing: boolean;
}

/** Measurement targets are live identities for one review session; previews never replace them. */
export function createDesignReviewMeasureState(): DesignReviewMeasureState {
  return { a: null, b: null, preview: null, slot: 'a', replacing: false };
}

export function chooseMeasureTarget(
  state: DesignReviewMeasureState,
  target: Element
): DesignReviewMeasureState {
  if (!target.isConnected || !state.slot || target === (state.slot === 'a' ? state.b : state.a))
    return state;
  const a = state.slot === 'a' ? target : state.a;
  const b = state.slot === 'b' ? target : state.b;
  return { a, b, preview: null, slot: a && b ? null : a ? 'b' : 'a', replacing: false };
}

export function previewMeasureTarget(
  state: DesignReviewMeasureState,
  target: Element | null
): DesignReviewMeasureState {
  const preview =
    state.slot && target?.isConnected && target !== (state.slot === 'a' ? state.b : state.a)
      ? target
      : null;
  return preview === state.preview ? state : { ...state, preview };
}

export function replaceMeasureTarget(
  state: DesignReviewMeasureState,
  slot: 'a' | 'b'
): DesignReviewMeasureState {
  return { ...state, slot, replacing: Boolean(state[slot]), preview: null };
}

export function cancelMeasurePreview(state: DesignReviewMeasureState): DesignReviewMeasureState {
  return {
    ...state,
    preview: null,
    slot: state.a && state.b ? null : state.a ? 'b' : 'a',
    replacing: false,
  };
}

export function clearMeasureB(state: DesignReviewMeasureState): DesignReviewMeasureState {
  return { ...state, b: null, preview: null, slot: state.a ? 'b' : 'a', replacing: false };
}

export function swapMeasureTargets(state: DesignReviewMeasureState): DesignReviewMeasureState {
  return state.a && state.b
    ? { ...state, a: state.b, b: state.a, preview: null, slot: null, replacing: false }
    : state;
}

/** Returns null only when this tool has no remaining transient or accepted selection to dismiss. */
export function escapeMeasureState(
  state: DesignReviewMeasureState
): DesignReviewMeasureState | null {
  if (state.replacing || state.preview) return cancelMeasurePreview(state);
  if (state.b) return clearMeasureB(state);
  if (state.a) return createDesignReviewMeasureState();
  return null;
}

type MeasureRect = { x: number; y: number; width: number; height: number };

/** Border-box geometry in one CSS viewport, independent from authored margin and padding. */
export function measureBorderBoxes(a: MeasureRect, b: MeasureRect) {
  const rightA = a.x + a.width,
    rightB = b.x + b.width,
    bottomA = a.y + a.height,
    bottomB = b.y + b.height;
  const gapX = Math.max(0, b.x - rightA, a.x - rightB),
    gapY = Math.max(0, b.y - bottomA, a.y - bottomB);
  const overlapX = Math.max(0, Math.min(rightA, rightB) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(bottomA, bottomB) - Math.max(a.y, b.y));
  const aContainsB = a.x <= b.x && a.y <= b.y && rightA >= rightB && bottomA >= bottomB;
  const bContainsA = b.x <= a.x && b.y <= a.y && rightB >= rightA && bottomB >= bottomA;
  const outer = aContainsB ? a : bContainsA ? b : null;
  const inner = aContainsB ? b : bContainsA ? a : null;
  return {
    gapX,
    gapY,
    overlapX,
    overlapY,
    contains: aContainsB ? ('a' as const) : bContainsA ? ('b' as const) : null,
    insets:
      outer && inner
        ? {
            left: inner.x - outer.x,
            top: inner.y - outer.y,
            right: outer.x + outer.width - inner.x - inner.width,
            bottom: outer.y + outer.height - inner.y - inner.height,
          }
        : null,
  };
}
