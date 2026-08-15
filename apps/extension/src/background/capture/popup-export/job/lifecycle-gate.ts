// policyStateId: popup-export-erasure-exclusion
import {
  createMutationExclusion,
  type MutationExclusionReservation,
  type MutationPermit,
} from '../../../mutation-exclusion/gate';

type PopupExportMutationPermit = MutationPermit;
type PopupExportErasureExclusion = MutationExclusionReservation;

const popupExportMutationExclusion = createMutationExclusion();

export function acquirePopupExportMutationPermit(): PopupExportMutationPermit | null {
  return popupExportMutationExclusion.acquirePermit();
}

export function reservePopupExportErasureExclusion(): PopupExportErasureExclusion {
  return popupExportMutationExclusion.reserveExclusion();
}
