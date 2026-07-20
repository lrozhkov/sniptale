import { isExtensionUIElement, isNonDataInteractiveElement } from '../guards';
import { isAiPickPassThroughUiElement } from './passthrough';

export function resolveAiPickUnderlyingTarget(
  event: MouseEvent,
  target: HTMLElement
): HTMLElement | null {
  const elementsFromPoint = target.ownerDocument.elementsFromPoint?.bind(target.ownerDocument);
  if (!elementsFromPoint) {
    return null;
  }

  return (
    elementsFromPoint(event.clientX, event.clientY).find((candidate): candidate is HTMLElement => {
      if (!candidate || (candidate as Node).nodeType !== Node.ELEMENT_NODE) {
        return false;
      }

      const candidateElement = candidate as HTMLElement;
      return (
        candidateElement !== target &&
        !isAiPickPassThroughUiElement(candidateElement) &&
        !isExtensionUIElement(candidateElement) &&
        !isNonDataInteractiveElement(candidateElement)
      );
    }) ?? null
  );
}
