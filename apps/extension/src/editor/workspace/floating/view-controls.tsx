import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ContentToolbarDivider } from '@sniptale/ui/content-toolbar';
import { FloatingChromeToolbar, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { useEditorStore } from '../../state/useEditorStore';
import type { EditorToolbarContentProps } from '../toolbar/types';
import type { EditorFloatingDocumentController } from './document-bar';
import { ViewSettingsControls, type ViewPopoverId } from './view-controls-parts';
import { ViewZoomControls } from './view-controls-zoom';

const VIEW_CONTROLS_STACK_CLASS_NAME = floatingChromeClassNames(
  [
    'absolute right-[calc(0.75rem+var(--editor-floating-edge-right,0px))] top-3 z-50 flex',
    'max-w-[calc(100vw-1.5rem-var(--editor-floating-edge-right,0px))]',
  ].join(' '),
  'flex-col items-end gap-3',
  'overflow-visible'
);

const VIEW_CONTROLS_CLASS_NAME = floatingChromeClassNames(
  'relative max-w-[calc(100vw-1.5rem-var(--editor-floating-edge-right,0px))] overflow-visible'
);

function useDismissViewPopover(
  activePopover: ViewPopoverId | null,
  closeAny: () => void,
  closeTransient: () => void
) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const restoreFocus = () => {
      if (activePopover) {
        rootRef.current
          ?.querySelector<HTMLButtonElement>(
            `[data-ui="editor.floating.view-controls.${activePopover}"]`
          )
          ?.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (activePopover !== 'map' && !rootRef.current?.contains(event.target as Node)) {
        closeTransient();
        restoreFocus();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && activePopover) {
        event.stopPropagation();
        closeAny();
        restoreFocus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePopover, closeAny, closeTransient]);

  return rootRef;
}

function useMeasuredToolbarWidth() {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarWidth, setToolbarWidth] = useState(0);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) {
      return undefined;
    }

    const updateToolbarWidth = () => {
      setToolbarWidth(Math.round(toolbar.getBoundingClientRect().width));
    };
    updateToolbarWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateToolbarWidth);
      return () => window.removeEventListener('resize', updateToolbarWidth);
    }

    const resizeObserver = new ResizeObserver(updateToolbarWidth);
    resizeObserver.observe(toolbar);
    window.addEventListener('resize', updateToolbarWidth);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateToolbarWidth);
    };
  }, []);

  return { toolbarRef, toolbarWidth };
}

export function EditorFloatingViewControls(
  props: EditorToolbarContentProps & { documentController: EditorFloatingDocumentController }
) {
  const [activePopover, setActivePopover] = useState<ViewPopoverId | null>(null);
  const magnetEnabled = useEditorStore((state) => state.workspace.magnetEnabled);
  const showOutsideCanvas = useEditorStore((state) => state.showOutsideCanvas);
  const setShowOutsideCanvas = useEditorStore((state) => state.setShowOutsideCanvas);
  const updateWorkspace = useEditorStore((state) => state.updateWorkspace);
  const { toolbarRef, toolbarWidth } = useMeasuredToolbarWidth();
  const rootRef = useDismissViewPopover(
    activePopover,
    () => setActivePopover(null),
    () => setActivePopover((current) => (current === 'map' ? current : null))
  );
  const togglePopover = (id: ViewPopoverId) =>
    setActivePopover((current) => (current === id ? null : id));

  return (
    <div
      ref={rootRef}
      data-ui="editor.floating.view-controls.stack"
      className={VIEW_CONTROLS_STACK_CLASS_NAME}
    >
      <FloatingChromeToolbar
        ref={toolbarRef}
        dataUi="editor.floating.view-controls"
        className={VIEW_CONTROLS_CLASS_NAME}
        style={
          {
            '--editor-view-toolbar-width':
              toolbarWidth > 0 ? `${toolbarWidth}px` : 'min(18rem,calc(100vw-1.5rem))',
          } as CSSProperties
        }
      >
        <ViewSettingsControls
          activePopover={activePopover}
          documentController={props.documentController}
          gridEnabled={props.gridEnabled}
          hasImage={props.hasImage}
          mapWidth={toolbarWidth}
          magnetEnabled={magnetEnabled}
          showOutsideCanvas={showOutsideCanvas}
          onToggle={togglePopover}
          onToggleMagnet={() => updateWorkspace({ magnetEnabled: !magnetEnabled })}
          onToggleShowOutsideCanvas={() => setShowOutsideCanvas(!showOutsideCanvas)}
        />
        <ContentToolbarDivider />
        <ViewZoomControls hasImage={props.hasImage} zoomPercent={props.zoomPercent} />
      </FloatingChromeToolbar>
    </div>
  );
}
