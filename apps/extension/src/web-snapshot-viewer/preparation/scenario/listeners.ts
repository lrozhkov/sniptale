import type { PreparationHostPorts } from '../../../content/public/preparation-surface';

type ListenerCleanup = () => void;

function addViewerListener<K extends keyof WindowEventMap>(
  iframe: HTMLIFrameElement,
  type: K,
  listener: (event: WindowEventMap[K]) => void
): ListenerCleanup {
  const target = iframe.contentWindow ?? iframe.contentDocument;
  if (!target) {
    return () => undefined;
  }

  target.addEventListener(type, listener as EventListener, { capture: true });
  return () => target.removeEventListener(type, listener as EventListener, { capture: true });
}

export function createViewerScenarioAutoClickListenerRegistry(
  iframe: HTMLIFrameElement | null
): ReturnType<PreparationHostPorts['createScenarioAutoClickListenerRegistry']> {
  return (args) => {
    if (!iframe?.contentDocument) {
      return () => undefined;
    }

    const cleanups = [
      addViewerListener(iframe, 'pointerdown', (event) => args.pointerDownHandler(event, iframe)),
      addViewerListener(iframe, 'click', args.clickReplayHandler),
      addViewerListener(iframe, 'pointermove', (event) => args.pointerMoveHandler(event, iframe)),
      addViewerListener(iframe, 'pointerup', (event) => args.pointerUpHandler(event, iframe)),
      addViewerListener(iframe, 'keyup', (event) => args.keyboardCaptureHandler(event, iframe)),
    ];

    return () => cleanups.forEach((cleanup) => cleanup());
  };
}
