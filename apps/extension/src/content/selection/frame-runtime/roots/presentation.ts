import type { AnchorPresentation } from '../host-layout/service';

/** Keeps a frame mounted through viewport loss and transient layout suspension. */
export function isFramePresentationRenderable(presentation: AnchorPresentation | undefined) {
  return presentation !== 'missing' && presentation !== 'ambiguous';
}
