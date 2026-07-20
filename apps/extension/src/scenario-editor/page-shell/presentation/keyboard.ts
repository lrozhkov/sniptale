import { useEffect } from 'react';

export function useScenarioPresentationKeyboard(args: {
  onExit: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
}) {
  const { onExit, onNext, onPrevious } = args;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isNativeInteractionTarget(event)) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onExit();
        return;
      }
      if (onNext && (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Spacebar')) {
        event.preventDefault();
        onNext();
        return;
      }
      if (onPrevious && event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit, onNext, onPrevious]);
}

function isNativeInteractionTarget(event: KeyboardEvent): boolean {
  const { target } = event;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const selector = 'input, textarea, select, [contenteditable="true"], [role="textbox"]';
  const nativeTextTarget = Boolean(target.closest(selector));
  const nativeButtonSpace = event.key === ' ' && Boolean(target.closest('button'));

  return nativeTextTarget || nativeButtonSpace;
}
