import type { FabricObject } from 'fabric';
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { harnessReady } from '../browser-mocks';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { EDITOR_BOOTSTRAP_EVENT } from '@sniptale/ui/branding';
import type { EditorBootstrapPayload } from '../../../../apps/extension/src/workflows/editor/bootstrap';
import { initializeAppTheme } from '../../../../apps/extension/src/ui/theme/index';
import { useEditorController } from '../../../../apps/extension/src/editor/application/controller-context';
import { EditorPage } from '../../../../apps/extension/src/editor/shell/page';
import { normalizeBrowserFrameState } from '../../../../apps/extension/src/features/editor/document/constants';
import { type BrowserFrameState } from '../../../../apps/extension/src/features/editor/document/types';
import { useEditorStore } from '../../../../apps/extension/src/editor/state/useEditorStore';
import { createExactBrowserFrameHarnessPayload } from './scenarios/browser-frame-exact';

declare global {
  interface Window {
    __sniptaleEditorHarness?: {
      clearSelection: () => void;
      getCanvasObjects: () => Array<Record<string, unknown>>;
      setZoomLevel: (value: number) => void;
    };
  }
}

type HarnessCanvasObjectSnapshot = Record<string, unknown>;
type HarnessCanvasLike = {
  getObjects?: () => FabricObject[];
};

function getObjectElement(object: FabricObject): HTMLImageElement | SVGImageElement | null {
  const imageObject = object as FabricObject & {
    getElement?: () => Element | null;
  };
  const element = imageObject.getElement?.() ?? null;

  return element instanceof HTMLImageElement || element instanceof SVGImageElement ? element : null;
}

function snapshotCanvasObject(object: FabricObject): HarnessCanvasObjectSnapshot {
  const element = getObjectElement(object);

  return {
    type: object.type ?? null,
    sniptaleType: object.sniptaleType ?? null,
    left: object.left ?? null,
    top: object.top ?? null,
    width: object.width ?? null,
    height: object.height ?? null,
    scaledWidth: typeof object.getScaledWidth === 'function' ? object.getScaledWidth() : null,
    scaledHeight: typeof object.getScaledHeight === 'function' ? object.getScaledHeight() : null,
    scaleX: object.scaleX ?? null,
    scaleY: object.scaleY ?? null,
    src: element ? (element.getAttribute('src') ?? element.getAttribute('href')) : null,
  };
}

function getCanvasObjects(controller: ReturnType<typeof useEditorController>): FabricObject[] {
  const canvas = controller.canvas as HarnessCanvasLike | null;
  return canvas?.getObjects?.() ?? [];
}

function resolveHarnessBrowserFrame(
  payload: EditorBootstrapPayload | undefined
): BrowserFrameState {
  return normalizeBrowserFrameState({
    ...payload?.document?.browserFrame,
    title: payload?.document?.browserFrame?.title ?? payload?.title ?? '',
    url: payload?.document?.browserFrame?.url ?? payload?.url ?? '',
  });
}

function HarnessBrowserFrameAutoApply(props: { browserFrame: BrowserFrameState | null }) {
  const controller = useEditorController();
  const imageData = useEditorStore((state) => state.imageData);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!props.browserFrame || !imageData || appliedRef.current) {
      return;
    }

    const browserFrame = props.browserFrame;
    const applyTimeout = window.setTimeout(() => {
      appliedRef.current = true;
      void controller.applyBrowserFrame(browserFrame);
    }, 0);

    return () => window.clearTimeout(applyTimeout);
  }, [controller, imageData, props.browserFrame]);

  return null;
}

function HarnessEditorBootstrapDispatch({ payload }: { payload: EditorBootstrapPayload }) {
  useEffect(() => {
    const bootstrapTimeout = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(EDITOR_BOOTSTRAP_EVENT, {
          detail: payload,
        })
      );
    }, 0);

    return () => window.clearTimeout(bootstrapTimeout);
  }, [payload]);

  return null;
}

function HarnessEditorDebugBridge() {
  const controller = useEditorController();

  useEffect(() => {
    window.__sniptaleEditorHarness = {
      clearSelection: () => {
        controller.clearSelection();
      },
      getCanvasObjects: () => {
        return getCanvasObjects(controller).map(snapshotCanvasObject);
      },
      setZoomLevel: (value) => {
        controller.setZoom(value);
      },
    };

    return () => {
      Reflect.deleteProperty(window, '__sniptaleEditorHarness');
    };
  }, [controller]);

  return null;
}

void harnessReady.then(() => {
  initializeAppTheme();
  const bootstrapPayload =
    window.__sniptaleHarnessBootstrap?.editorBootstrapPayload ??
    createExactBrowserFrameHarnessPayload();
  const autoApplyBrowserFrame =
    window.__sniptaleHarnessBootstrap?.editorAutoApplyBrowserFrame === true;
  const harnessBrowserFrame = autoApplyBrowserFrame
    ? resolveHarnessBrowserFrame(bootstrapPayload)
    : null;

  createRoot(document.getElementById('root')!).render(
    <EditorPage
      afterLayout={
        <>
          <HarnessEditorBootstrapDispatch payload={bootstrapPayload} />
          <HarnessEditorDebugBridge />
          {autoApplyBrowserFrame ? (
            <HarnessBrowserFrameAutoApply browserFrame={harnessBrowserFrame} />
          ) : null}
        </>
      }
    />
  );
});
