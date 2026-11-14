import { FabricImage, Group, type FabricObject } from 'fabric';
import type { RasterSessionSnapshot } from '../../../../apps/extension/src/editor/raster-editing/session';
import type { EditorDocument } from '../../../../apps/extension/src/features/editor/document/types';
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { InspectorLayout } from '../../../../apps/extension/src/ui/compact-inspector-controls/layout';
import '../../../../apps/extension/src/ui/compact-inspector-controls/inspector-surface.css';
import '../../../../apps/extension/src/editor/image-surface.css';
import '../../../../apps/extension/src/features/highlighter/frame-annotation/callout/font.css';
import { harnessReady } from '../browser-mocks/browser-mocks';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import '../../../../apps/extension/src/features/highlighter/frame-annotation/interaction/styles.css';
import '../../../../apps/extension/src/composition/frame-annotation-controls/popover/styles.css';
import '../../../../apps/extension/src/composition/frame-annotation-controls/frame/styles.css';
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
      applyBrowserFrameMutation: () => Promise<void>;
      clearSelection: () => void;
      getCanvasObjects: () => Array<Record<string, unknown>>;
      renderImage: () => Promise<string>;
      exportDocument: () => EditorDocument;
      loadDocument: (document: EditorDocument) => Promise<void>;
      getRasterSnapshot: () => RasterSessionSnapshot | null;
      getSceneProjection: () => {
        viewport: number[];
        width: number;
        height: number;
        rect: { left: number; top: number; width: number; height: number };
      } | null;
      getInteractionState: () => {
        historyIndex: number;
        historyRevision: number;
        historyReady: boolean;
        historyMuted: number;
        frame: ReturnType<typeof useEditorStore.getState>['frame'];
        framePreviewActive: boolean;
        transform: { action: string; actionPerformed: boolean; corner: string } | null;
      };
      setZoomLevel: (value: number) => void;
    };
  }
}

type HarnessCanvasObjectSnapshot = Record<string, unknown>;
type HarnessCanvasLike = {
  getObjects?: () => FabricObject[];
};

function snapshotCanvasObject(object: FabricObject): HarnessCanvasObjectSnapshot {
  const original = object instanceof FabricImage ? object.getOriginalSize() : null;

  return {
    type: object.type ?? null,
    sniptaleType: object.sniptaleType ?? null,
    sniptaleId: object.sniptaleId ?? null,
    visible: object.visible,
    active: object.canvas?.getActiveObjects().includes(object) ?? false,
    contentLocked: object.sniptaleContentLocked ?? null,
    positionLocked: object.sniptaleLocked ?? false,
    left: object.left ?? null,
    top: object.top ?? null,
    width: object.width ?? null,
    height: object.height ?? null,
    scaledWidth: typeof object.getScaledWidth === 'function' ? object.getScaledWidth() : null,
    scaledHeight: typeof object.getScaledHeight === 'function' ? object.getScaledHeight() : null,
    scaleX: object.scaleX ?? null,
    scaleY: object.scaleY ?? null,
    matrix: [...object.calcTransformMatrix()],
    cropX: object instanceof FabricImage ? object.cropX : null,
    cropY: object instanceof FabricImage ? object.cropY : null,
    sourceWidth: original?.width ?? null,
    sourceHeight: original?.height ?? null,
    src: object instanceof FabricImage ? object.getSrc() : null,
    children: object instanceof Group ? object.getObjects().map(snapshotCanvasObject) : [],
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
  const mutationSequenceRef = useRef(0);

  useEffect(() => {
    window.__sniptaleEditorHarness = {
      applyBrowserFrameMutation: async () => {
        mutationSequenceRef.current += 1;
        const current = useEditorStore.getState().browserFrame;
        await controller.applyBrowserFrame(
          normalizeBrowserFrameState({
            ...current,
            title: `${current.title} · change-${mutationSequenceRef.current}`,
          })
        );
      },
      clearSelection: () => {
        controller.clearSelection();
      },
      getCanvasObjects: () => {
        return getCanvasObjects(controller).map(snapshotCanvasObject);
      },
      renderImage: () => controller.renderForExport({ format: 'png', quality: 1 }, 'committed'),
      exportDocument: () => structuredClone(controller.exportDocument()),
      loadDocument: (document) => controller.loadDocument(document),
      getRasterSnapshot: () => {
        const snapshot = controller.getRasterRuntime()?.getSnapshot();
        return snapshot ? structuredClone(snapshot) : null;
      },
      getSceneProjection: () => {
        const canvas = controller.canvas;
        if (!canvas) return null;
        const rect = canvas.upperCanvasEl.getBoundingClientRect();
        return {
          viewport: [...canvas.viewportTransform],
          width: canvas.width,
          height: canvas.height,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        };
      },
      getInteractionState: () => {
        const transform = controller.canvas?._currentTransform;
        return {
          historyIndex: useEditorStore.getState().history.index,
          historyRevision: controller.history?.getRevision() ?? 0,
          historyReady: controller.history !== null,
          historyMuted: controller.historyMuted,
          frame: useEditorStore.getState().frame,
          framePreviewActive: useEditorStore.getState().framePreviewActive,
          transform: transform
            ? {
                action: transform.action,
                actionPerformed: transform.actionPerformed,
                corner: transform.corner,
              }
            : null,
        };
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
  const dispatchBootstrapPayload =
    window.__sniptaleHarnessBootstrap?.editorDispatchBootstrapPayload !== false;
  const harnessBrowserFrame = autoApplyBrowserFrame
    ? resolveHarnessBrowserFrame(bootstrapPayload)
    : null;

  createRoot(document.getElementById('root')!).render(
    <CommandPressScope value={true}>
      <InspectorLayout>
        <div className="sniptale-compact-workspace sniptale-image-workspace sniptale-image-page">
          <EditorPage
            afterLayout={
              <>
                {dispatchBootstrapPayload ? (
                  <HarnessEditorBootstrapDispatch payload={bootstrapPayload} />
                ) : null}
                <HarnessEditorDebugBridge />
                {autoApplyBrowserFrame ? (
                  <HarnessBrowserFrameAutoApply browserFrame={harnessBrowserFrame} />
                ) : null}
              </>
            }
          />
        </div>
      </InspectorLayout>
    </CommandPressScope>
  );
});
