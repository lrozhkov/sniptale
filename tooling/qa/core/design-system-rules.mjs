import { getFloatingSurfaceBypassRules } from './design-system-rules-floating.mjs';
import { getGlassBypassRules } from './design-system-rules-glass.mjs';
import { getModalBypassRules } from './design-system-rules-modal.mjs';

export function getFamilyClassBypassRules(srcRoot, sharedUiRoot) {
  return [
    ...getFloatingSurfaceBypassRules(sharedUiRoot),
    ...getModalBypassRules(sharedUiRoot),
    ...getGlassBypassRules(srcRoot, sharedUiRoot),
  ];
}
