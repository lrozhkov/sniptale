import type { DrawingToolDefaults } from './model';

export type DrawingToolPreferencesPatch = {
  [Tool in keyof DrawingToolDefaults]?: Partial<DrawingToolDefaults[Tool]>;
};

export interface DrawingToolPreferencesSynchronizationPort {
  getDefaults(): DrawingToolDefaults;
  load(fallback: DrawingToolDefaults): Promise<DrawingToolDefaults>;
  reportSaveFailure(): void;
  save(
    patch: DrawingToolPreferencesPatch,
    fallback: DrawingToolDefaults
  ): Promise<'applied' | 'rejected'>;
  setDefaults(defaults: DrawingToolDefaults): void;
  subscribeAuthoritative(
    fallback: DrawingToolDefaults,
    listener: (defaults: DrawingToolDefaults) => void
  ): () => void;
  subscribeDefaults(listener: () => void): () => void;
}

function samePreference(left: object, right: object): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffPreferences(
  before: DrawingToolDefaults,
  after: DrawingToolDefaults
): DrawingToolPreferencesPatch {
  return {
    ...(samePreference(before.pencil, after.pencil) ? {} : { pencil: after.pencil }),
    ...(samePreference(before.marker, after.marker) ? {} : { marker: after.marker }),
    ...(samePreference(before.shape, after.shape) ? {} : { shape: after.shape }),
    ...(samePreference(before.arrow, after.arrow) ? {} : { arrow: after.arrow }),
    ...(samePreference(before.text, after.text) ? {} : { text: after.text }),
  };
}

function mergePreferences(
  defaults: DrawingToolDefaults,
  patch: DrawingToolPreferencesPatch
): DrawingToolDefaults {
  return {
    pencil: { ...defaults.pencil, ...patch.pencil },
    marker: { ...defaults.marker, ...patch.marker },
    shape: { ...defaults.shape, ...patch.shape },
    arrow: { ...defaults.arrow, ...patch.arrow },
    text: { ...defaults.text, ...patch.text },
  };
}

function hasPatch(patch: DrawingToolPreferencesPatch): boolean {
  return Boolean(patch.pencil || patch.marker || patch.shape || patch.arrow || patch.text);
}

function removeAcknowledged(
  patch: DrawingToolPreferencesPatch,
  authoritative: DrawingToolDefaults
): DrawingToolPreferencesPatch {
  return {
    ...(patch.pencil && !samePreference(patch.pencil, authoritative.pencil)
      ? { pencil: patch.pencil }
      : {}),
    ...(patch.marker && !samePreference(patch.marker, authoritative.marker)
      ? { marker: patch.marker }
      : {}),
    ...(patch.shape && !samePreference(patch.shape, authoritative.shape)
      ? { shape: patch.shape }
      : {}),
    ...(patch.arrow && !samePreference(patch.arrow, authoritative.arrow)
      ? { arrow: patch.arrow }
      : {}),
    ...(patch.text && !samePreference(patch.text, authoritative.text) ? { text: patch.text } : {}),
  };
}

function removeApplied(
  pending: DrawingToolPreferencesPatch,
  applied: DrawingToolPreferencesPatch
): DrawingToolPreferencesPatch {
  return {
    ...(pending.pencil && (!applied.pencil || !samePreference(pending.pencil, applied.pencil))
      ? { pencil: pending.pencil }
      : {}),
    ...(pending.marker && (!applied.marker || !samePreference(pending.marker, applied.marker))
      ? { marker: pending.marker }
      : {}),
    ...(pending.shape && (!applied.shape || !samePreference(pending.shape, applied.shape))
      ? { shape: pending.shape }
      : {}),
    ...(pending.arrow && (!applied.arrow || !samePreference(pending.arrow, applied.arrow))
      ? { arrow: pending.arrow }
      : {}),
    ...(pending.text && (!applied.text || !samePreference(pending.text, applied.text))
      ? { text: pending.text }
      : {}),
  };
}

export function synchronizeDrawingToolPreferences(
  port: DrawingToolPreferencesSynchronizationPort
): () => void {
  let active = true;
  let hydrated = false;
  let applyingAuthoritative = false;
  let pendingPatch: DrawingToolPreferencesPatch = {};
  let pendingFallback = port.getDefaults();
  let saveFailureVisible = false;
  let observedAuthoritativeChange = false;
  let observedDefaults = port.getDefaults();

  const reportSaveFailure = () => {
    if (saveFailureVisible || !active) return;
    saveFailureVisible = true;
    port.reportSaveFailure();
  };
  const persist = (patch: DrawingToolPreferencesPatch, fallback: DrawingToolDefaults) => {
    if (!hasPatch(patch)) return;
    void port
      .save(patch, fallback)
      .then((result) => {
        if (result === 'rejected') reportSaveFailure();
        else {
          pendingPatch = removeApplied(pendingPatch, patch);
          saveFailureVisible = false;
        }
      })
      .catch(reportSaveFailure);
  };
  const applyAuthoritative = (defaults: DrawingToolDefaults) => {
    applyingAuthoritative = true;
    port.setDefaults(defaults);
    observedDefaults = port.getDefaults();
    applyingAuthoritative = false;
  };
  const reconcile = (defaults: DrawingToolDefaults, persistPending: boolean) => {
    pendingPatch = removeAcknowledged(pendingPatch, defaults);
    applyAuthoritative(mergePreferences(defaults, pendingPatch));
    hydrated = true;
    if (persistPending) persist(pendingPatch, defaults);
  };

  const unsubscribeDefaults = port.subscribeDefaults(() => {
    const next = port.getDefaults();
    if (next === observedDefaults) return;
    const previous = observedDefaults;
    observedDefaults = next;
    if (applyingAuthoritative) return;
    const patch = diffPreferences(previous, next);
    if (!hasPatch(pendingPatch)) pendingFallback = previous;
    pendingPatch = { ...pendingPatch, ...patch };
    if (hydrated) persist(patch, previous);
  });
  const fallback = port.getDefaults();
  const unsubscribeAuthoritative = port.subscribeAuthoritative(fallback, (defaults) => {
    if (!active) return;
    observedAuthoritativeChange = true;
    reconcile(defaults, !hydrated);
  });

  void port
    .load(fallback)
    .then((defaults) => {
      if (active && !observedAuthoritativeChange) reconcile(defaults, true);
    })
    .catch(() => undefined)
    .finally(() => {
      if (!active || observedAuthoritativeChange) return;
      if (!hydrated) {
        hydrated = true;
        persist(pendingPatch, pendingFallback);
      }
    });

  return () => {
    active = false;
    unsubscribeAuthoritative();
    unsubscribeDefaults();
  };
}
