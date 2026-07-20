import { useEffect, useRef, type MutableRefObject } from 'react';
import { appendToContentOverlayRoot, getContentUiElementById } from '../../../platform/dom-host';
import { translate } from '../../../../platform/i18n';

interface UseShowToolbarButtonParams {
  countdownActive: boolean;
  isCompletelyHidden: boolean;
  isToolbarVisible: boolean;
  onShowToolbar: () => void;
  screenshotMode: boolean;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function createShowToolbarIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const rect = document.createElementNS(SVG_NAMESPACE, 'rect');
  rect.setAttribute('x', '3');
  rect.setAttribute('y', '3');
  rect.setAttribute('width', '18');
  rect.setAttribute('height', '18');
  rect.setAttribute('rx', '2');

  const line = document.createElementNS(SVG_NAMESPACE, 'line');
  line.setAttribute('x1', '9');
  line.setAttribute('y1', '3');
  line.setAttribute('x2', '9');
  line.setAttribute('y2', '21');

  svg.append(rect, line);
  return svg;
}

function removeShowToolbarButton(button: HTMLButtonElement | null): null {
  button?.remove();
  return null;
}

function ensureShowToolbarButton(button: HTMLButtonElement | null): HTMLButtonElement {
  if (button) {
    return button;
  }

  const nextButton = document.createElement('button');
  nextButton.id = 'sniptale-show-toolbar-btn';
  nextButton.className = 'sniptale-show-toolbar-button';
  nextButton.title = translate('content.runtime.showToolbarTitle');
  nextButton.appendChild(createShowToolbarIcon());
  appendToContentOverlayRoot(nextButton);
  return nextButton;
}

function useShowToolbarButtonElement(
  shouldShow: boolean,
  buttonRef: MutableRefObject<HTMLButtonElement | null>
): void {
  useEffect(() => {
    if (!shouldShow) {
      buttonRef.current = removeShowToolbarButton(
        buttonRef.current ?? getContentUiElementById<HTMLButtonElement>('sniptale-show-toolbar-btn')
      );
      return;
    }

    buttonRef.current = ensureShowToolbarButton(
      buttonRef.current ?? getContentUiElementById<HTMLButtonElement>('sniptale-show-toolbar-btn')
    );

    return () => {
      if (shouldShow) {
        buttonRef.current = removeShowToolbarButton(buttonRef.current);
      }
    };
  }, [buttonRef, shouldShow]);
}

function useShowToolbarButtonClick(
  shouldShow: boolean,
  buttonRef: MutableRefObject<HTMLButtonElement | null>,
  onShowToolbarRef: MutableRefObject<() => void>
): void {
  useEffect(() => {
    if (!shouldShow) {
      return;
    }

    const button =
      buttonRef.current ?? getContentUiElementById<HTMLButtonElement>('sniptale-show-toolbar-btn');
    if (!button) {
      return;
    }

    const handleClick = () => {
      onShowToolbarRef.current();
    };

    button.addEventListener('click', handleClick);

    return () => {
      button.removeEventListener('click', handleClick);
    };
  }, [buttonRef, onShowToolbarRef, shouldShow]);
}

export function useShowToolbarButton({
  countdownActive,
  isCompletelyHidden,
  isToolbarVisible,
  onShowToolbar,
  screenshotMode,
}: UseShowToolbarButtonParams): void {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const onShowToolbarRef = useRef(onShowToolbar);
  onShowToolbarRef.current = onShowToolbar;

  const shouldShow = screenshotMode && !isToolbarVisible && !isCompletelyHidden && !countdownActive;

  useShowToolbarButtonElement(shouldShow, buttonRef);
  useShowToolbarButtonClick(shouldShow, buttonRef, onShowToolbarRef);
}
