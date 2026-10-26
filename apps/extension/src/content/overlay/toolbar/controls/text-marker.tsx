import { PageControlVisibility } from './control-visibility';
import { PageToolbarControlsContext } from '../state/page-controls';
import { useContext, useEffect, useState, useRef, type RefObject } from 'react';
import { Highlighter, Eraser } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductToolbarMenu } from '@sniptale/ui/product-menus/toolbar';
import { getColorAlpha, setColorAlpha } from '@sniptale/foundation/color';
import {
  DrawingColorOptions,
  DrawingOptionsDivider,
  MarkerOpacityOptions,
} from '../../../../ui/drawing-tools/options';
import { useDrawingOptionsLayout } from './drawing-options-layout';
import { translate } from '../../../../platform/i18n';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import {
  createTextMarkerController,
  startTextMarkerSelection,
} from '../../../selection/quick-edit-runtime';
import { finalizeQuickEditElementChanges } from '../../../selection/quick-edit';
import { setNavigationInputShieldSuspended } from '../../../selection/locker';

const DEFAULT_MARKER_COLOR = '#ffdf0066';
const MARKER_PALETTE = ['#ffdf0066', '#ff3b3066', '#30d15866', '#50bfff66', '#000000'];

function useTextMarkerSession(active: boolean, onActiveChange: (active: boolean) => void) {
  const [controller, setController] = useState<ReturnType<
    typeof createTextMarkerController
  > | null>(null);
  const [color, setColor] = useState(DEFAULT_MARKER_COLOR);
  const [error, setError] = useState(false);
  useEffect(() => {
    const next = createTextMarkerController({
      annotations: browserAnnotationSession,
      history: pagePreparationHistory,
    });
    setController(next);
    return () => next.dispose();
  }, []);
  useEffect(() => {
    if (!active || !controller || !controller.supported()) return;
    finalizeQuickEditElementChanges();
    setNavigationInputShieldSuspended(true);
    const cleanup = startTextMarkerSelection({
      onRange: (range) => {
        const accepted = controller.add(range, color);
        setError(!accepted);
      },
      onFinish: () => onActiveChange(false),
    });
    return () => {
      cleanup();
      setNavigationInputShieldSuspended(false);
    };
  }, [active, color, controller, onActiveChange]);
  return {
    error,
    supported: controller?.supported() ?? false,
    color,
    changeColor: setColor,
  };
}

function TextMarkerOptions(props: {
  session: ReturnType<typeof useTextMarkerSession>;
  panelRef: RefObject<HTMLDivElement | null>;
  vertical: boolean;
}) {
  return (
    <>
      {!props.session.supported ? (
        <p role="status" className="text-xs">
          {translate('content.toolbar.textMarkerUnsupported')}
        </p>
      ) : (
        <>
          <div
            className={
              props.vertical ? 'flex flex-col items-center gap-2' : 'flex items-center gap-2'
            }
          >
            <DrawingColorOptions
              allowAlpha
              preservePaletteAlpha
              colors={MARKER_PALETTE}
              floatingBoundaryRef={props.panelRef}
              floatingPlacement={props.vertical ? 'side' : 'auto'}
              label={translate('content.toolbar.textMarkerColor')}
              vertical={props.vertical}
              value={props.session.color}
              onSelect={props.session.changeColor}
            />
            <DrawingOptionsDivider vertical={props.vertical} />
            <div className={props.vertical ? 'flex flex-col gap-1' : 'flex gap-1'}>
              <MarkerOpacityOptions
                value={getColorAlpha(props.session.color) ?? 0.4}
                onChange={(alpha) =>
                  props.session.changeColor(
                    setColorAlpha(props.session.color, alpha) ?? props.session.color
                  )
                }
              />
            </div>
            <DrawingOptionsDivider vertical={props.vertical} />
            <ContentToolbarButton
              aria-label={translate('content.toolbar.textMarkerErase')}
              title={translate('content.toolbar.textMarkerErase')}
              aria-pressed={getColorAlpha(props.session.color) === 0}
              active={getColorAlpha(props.session.color) === 0}
              dataUi="content.toolbar.text-marker-eraser"
              onClick={() =>
                props.session.changeColor(setColorAlpha(props.session.color, 0) ?? '#00000000')
              }
            >
              <Eraser size={16} />
            </ContentToolbarButton>
          </div>
          {props.session.error ? (
            <p role="alert" className="max-w-64 text-xs">
              {translate('content.toolbar.textMarkerError')}
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

/** A text-editing submode; its accepted highlights remain when the controls close. */
export function TextMarkerControl(props: {
  active: boolean;
  displayMode: 'horizontal' | 'vertical';
  visible: boolean;
  onActiveChange: (active: boolean) => void;
}) {
  const { onActiveChange } = props;
  const preferences = useContext(PageToolbarControlsContext);
  const active =
    props.active && !preferences?.editing && preferences?.isVisible('editing-marker') !== false;
  const session = useTextMarkerSession(active, onActiveChange);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [optionsOpen, setOptionsOpen] = useState(true);
  const layout = useDrawingOptionsLayout({
    displayMode: props.displayMode,
    hasSelection: false,
    panelRef,
    tool: 'marker',
    triggerRef,
    open: active && optionsOpen,
  });
  useEffect(() => {
    if (active) setOptionsOpen(true);
  }, [active]);
  const vertical = props.displayMode === 'vertical';
  if (!props.visible) return null;
  return (
    <PageControlVisibility control="editing-marker" label={translate('content.toolbar.textMarker')}>
      <div className="relative flex">
        <ContentToolbarButton
          ref={triggerRef}
          aria-label={translate('content.toolbar.textMarker')}
          title={translate('content.toolbar.textMarkerHint')}
          aria-pressed={active}
          aria-expanded={active && optionsOpen}
          active={active}
          menuIndicator
          data-menu-side={layout.placement}
          data-menu-open={String(active && optionsOpen)}
          dataUi="content.toolbar.text-marker"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (active ? setOptionsOpen(!optionsOpen) : onActiveChange(true))}
        >
          <Highlighter size={18} />
        </ContentToolbarButton>
        {active && optionsOpen ? (
          <ProductToolbarMenu
            compact
            variant="drawing"
            placement={layout.placement}
            style={layout.style}
            className="sniptale-drawing-options-popover sniptale-drawing-options-adopted"
          >
            <div
              ref={panelRef}
              role="group"
              aria-label={translate('content.toolbar.textMarker')}
              data-ui="content.toolbar.text-marker-panel"
              className="flex min-w-0 flex-col gap-2"
            >
              <TextMarkerOptions session={session} panelRef={panelRef} vertical={vertical} />
            </div>
          </ProductToolbarMenu>
        ) : null}
      </div>
    </PageControlVisibility>
  );
}
