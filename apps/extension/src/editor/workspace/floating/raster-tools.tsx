import editIcon from '@iconify-icons/tabler/edit';
import editOffIcon from '@iconify-icons/tabler/edit-off';
import arrowsTransferIcon from '@iconify-icons/tabler/arrows-transfer-up-down';
import arrowsMaximizeIcon from '@iconify-icons/tabler/arrows-maximize';
import aspectRatioIcon from '@iconify-icons/tabler/aspect-ratio';
import { Icon } from '@iconify/react';
import { CanvasToolButtons } from '@sniptale/ui/canvas-tools';
import { ContentToolbarDivider } from '@sniptale/ui/content-toolbar';
import {
  createContext,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  Check,
  MousePointer2,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  SlidersHorizontal,
  SquareDashedX,
  X,
} from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate, useAppLocale } from '../../../platform/i18n';
import type { EditorRasterRuntime } from '../../raster-editing/runtime';
import {
  rasterParameterIcons,
  rasterSelectionIcons,
  rasterToolIcons,
} from '../../raster-editing/tool-icons';
import { NumericValueField } from '../../chrome/ui';
import { InspectorSurface } from '../../../ui/compact-inspector-controls/layout';
import './raster-tools.css';
import { CompactColorSelector } from '../../../ui/color-selector';

type RasterSnapshot = ReturnType<EditorRasterRuntime['getSnapshot']>;
type RasterMessage =
  keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['raster'];
const message = (key: RasterMessage) => translate(`editor.raster.${key}`);
const BUTTON_CLASS = 'aspect-square !h-7 !min-h-7 !w-7 !min-w-7 shrink-0 !p-0';

const RasterPropertiesDisclosure = createContext<{
  collapsedTool: RasterSnapshot['tool'];
  setCollapsedTool: (tool: RasterSnapshot['tool']) => void;
} | null>(null);

/** Keep property disclosure separate from the canvas editing mode. */
export function RasterToolPropertiesProvider({ children }: { children: ReactNode }) {
  const [collapsedTool, setCollapsedTool] = useState<RasterSnapshot['tool']>(null);
  return (
    <RasterPropertiesDisclosure.Provider value={{ collapsedTool, setCollapsedTool }}>
      {children}
    </RasterPropertiesDisclosure.Provider>
  );
}

/** Read presentation-only disclosure shared by the primary and property rails. */
export function useRasterToolPropertiesDisclosure() {
  return useContext(RasterPropertiesDisclosure);
}

function RasterButton(props: {
  name: RasterMessage;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <ContentToolbarButton
      type="button"
      tone="property"
      className={BUTTON_CLASS}
      title={[message(props.name), props.hint].filter(Boolean).join('\n')}
      aria-label={message(props.name)}
      aria-pressed={props.active}
      active={props.active ?? false}
      disabled={props.disabled ?? false}
      onClick={props.onClick}
      dataUi={`editor.raster.${props.name}`}
    >
      {props.children}
    </ContentToolbarButton>
  );
}

function RasterGlyph({
  icon,
  size,
}: {
  icon: (typeof rasterToolIcons)[keyof typeof rasterToolIcons];
  size: number;
}) {
  return (
    <Icon
      icon={icon}
      ssr
      aria-hidden
      width={size}
      height={size}
      className="tabler-icon shrink-0"
      style={{ display: 'block' }}
    />
  );
}

function RasterNumberField(props: {
  name: 'tolerance' | 'grow' | 'brushSize' | 'hardness' | 'opacity';
  value: number;
  max: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  const unit = props.name === 'brushSize' || props.name === 'grow' ? 'px' : '%';
  return (
    <InspectorSurface
      data-ui={`editor.raster.${props.name}`}
      title={message(props.name)}
      className="editor-raster-numeric flex h-7 w-[104px] shrink-0 items-center gap-1"
    >
      <RasterGlyph icon={rasterParameterIcons[props.name]} size={16} />
      <NumericValueField
        className="min-w-0 flex-1"
        label={message(props.name)}
        value={props.value}
        min={props.min ?? 0}
        max={props.max}
        unit={unit}
        precision={0}
        step={1}
        enterBehavior="blur"
        onPreviewValue={props.onChange}
        onCommitValue={props.onChange}
      />
    </InspectorSurface>
  );
}

function RasterParameters(props: { runtime: EditorRasterRuntime; snapshot: RasterSnapshot }) {
  const { runtime, snapshot } = props;
  const { tool, settings } = snapshot;
  const boundaryRef = useRef<HTMLDivElement>(null);
  const region =
    tool === 'fill' ||
    tool === 'remove-color' ||
    (tool === 'select' && snapshot.selectionMethod === 'wand');
  return (
    <div ref={boundaryRef} className="flex flex-wrap items-center gap-2">
      {tool === 'select' ? (
        <>
          {(['rectangle', 'lasso', 'wand'] as const).map((method) => (
            <RasterButton
              key={method}
              name={method}
              hint={message('selectionModifierHint')}
              active={snapshot.selectionMethod === method}
              onClick={() => runtime.setSelectionMethod(method)}
            >
              <RasterGlyph icon={rasterSelectionIcons[method]} size={16} />
            </RasterButton>
          ))}
        </>
      ) : null}
      {region ? (
        <>
          <RasterNumberField
            name="tolerance"
            value={settings.tolerance}
            max={100}
            onChange={(tolerance) => runtime.updateSettings({ tolerance })}
          />
          <ContentToolbarButton
            dataUi="editor.raster.contiguous"
            tone="property"
            className={BUTTON_CLASS}
            title={message('contiguous')}
            aria-label={message('contiguous')}
            active={settings.contiguous}
            aria-pressed={settings.contiguous}
            onClick={() => runtime.updateSettings({ contiguous: !settings.contiguous })}
          >
            <RasterGlyph icon={rasterParameterIcons.contiguous} size={16} />
          </ContentToolbarButton>
          <RasterNumberField
            name="grow"
            value={settings.grow}
            max={32}
            onChange={(grow) => runtime.updateSettings({ grow })}
          />
        </>
      ) : null}
      {tool === 'fill' || tool === 'brush' ? (
        <CompactColorSelector
          className="editor-raster-color"
          pickerOnly
          triggerVariant="swatch"
          title={message('color')}
          floatingBoundaryRef={boundaryRef}
          floatingPlacement="auto"
          allowAlpha
          allowTransparent={false}
          label={message('color')}
          value={settings.color}
          onChange={(color) => runtime.updateSettings({ color })}
        />
      ) : null}
      {tool === 'brush' || tool === 'erase' || tool === 'restore' ? (
        <>
          <RasterNumberField
            name="brushSize"
            value={settings.brushSize}
            min={1}
            max={512}
            onChange={(brushSize) => runtime.updateSettings({ brushSize })}
          />
          <RasterNumberField
            name="hardness"
            value={settings.hardness}
            max={100}
            onChange={(hardness) => runtime.updateSettings({ hardness })}
          />
        </>
      ) : null}
      {tool === 'brush' ? (
        <RasterNumberField
          name="opacity"
          value={settings.opacity}
          max={100}
          onChange={(opacity) => runtime.updateSettings({ opacity })}
        />
      ) : null}
      {tool === 'crop' ? (
        <>
          <div
            data-ui="editor.raster.cropRatio"
            role="group"
            aria-label={message('cropRatio')}
            className="flex items-center gap-1"
          >
            <RasterButton
              name="freeRatio"
              active={snapshot.cropRatio === 'free'}
              onClick={() => runtime.setCropRatio('free')}
            >
              <RasterGlyph icon={arrowsMaximizeIcon} size={16} />
            </RasterButton>
            <RasterButton
              name="originalRatio"
              active={snapshot.cropRatio === 'original'}
              onClick={() => runtime.setCropRatio('original')}
            >
              <RasterGlyph icon={aspectRatioIcon} size={16} />
            </RasterButton>
          </div>
          <ContentToolbarDivider className="!my-0 !h-5" />
          <RasterButton
            name="applyCrop"
            hint="Enter"
            disabled={!snapshot.cropPending}
            onClick={() => {
              void runtime.applyCrop();
            }}
          >
            <Check size={16} />
          </RasterButton>
          <RasterButton name="cancelCrop" hint="Esc" onClick={() => runtime.cancelCrop()}>
            <X size={16} />
          </RasterButton>
        </>
      ) : null}
    </div>
  );
}

/** Render exclusive raster tools in the existing primary toolbar. */
export function EditorRasterTools(props: {
  runtime: EditorRasterRuntime;
  onOpenAdjustments?: (targetId: string) => void;
}) {
  useAppLocale();
  const { runtime } = props;
  const disclosure = useRasterToolPropertiesDisclosure();
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  if (!snapshot.editing) return null;
  const tools = [
    { tool: 'brush', name: 'brush' },
    { tool: 'select', name: 'select' },
    { tool: 'fill', name: 'fill' },
    { tool: 'remove-color', name: 'removeColor' },
    { tool: 'erase', name: 'erase' },
    { tool: 'restore', name: 'restore' },
    { tool: 'crop', name: 'crop' },
  ] as const;
  return (
    <div
      data-ui="editor.raster.toolbar"
      title={snapshot.targetName}
      aria-busy={snapshot.busy}
      className="contents"
    >
      <CanvasToolButtons
        dataUi="editor.raster"
        actions={[
          {
            id: 'cursor',
            label: message('cursor'),
            icon: <MousePointer2 size={18} />,
            active: snapshot.tool === null,
            onSelect: () => runtime.selectTool(null),
          },
        ]}
      />
      <ContentToolbarDivider />
      <CanvasToolButtons
        dataUi="editor.raster"
        actions={tools.map(({ tool, name }) => ({
          id: name,
          label:
            tool === 'select'
              ? `${message(name)}\n${message('selectionModifierHint')}`
              : message(name),
          icon: <RasterGlyph icon={rasterToolIcons[tool]} size={18} />,
          active: snapshot.tool === tool,
          onSelect: () => {
            if (snapshot.tool === tool) {
              disclosure?.setCollapsedTool(disclosure.collapsedTool === tool ? null : tool);
              return;
            }
            if (runtime.getSnapshot().busy) return;
            disclosure?.setCollapsedTool(null);
            runtime.selectTool(tool);
          },
        }))}
      />
      <ContentToolbarDivider />
      <CanvasToolButtons
        dataUi="editor.raster"
        actions={[
          {
            id: 'flipHorizontal',
            label: message('flipHorizontal'),
            icon: <FlipHorizontal2 size={18} />,
            onSelect: () => {
              if (!runtime.getSnapshot().busy) void runtime.flipHorizontal();
            },
          },
          {
            id: 'flipVertical',
            label: message('flipVertical'),
            icon: <FlipVertical2 size={18} />,
            onSelect: () => {
              if (!runtime.getSnapshot().busy) void runtime.flipVertical();
            },
          },
          {
            id: 'adjustments',
            label: message('adjustments'),
            icon: <SlidersHorizontal size={18} />,
            onSelect: () => {
              if (!runtime.getSnapshot().busy && snapshot.targetId)
                props.onOpenAdjustments?.(snapshot.targetId);
            },
          },
        ]}
      />
      <ContentToolbarDivider />
      <ContentToolbarButton
        dataUi="editor.raster.exit"
        title={message('exitEditing')}
        aria-label={message('exitEditing')}
        onClick={() => runtime.finishEditing()}
      >
        <Icon icon={editOffIcon} ssr aria-hidden width={18} height={18} />
      </ContentToolbarButton>
    </div>
  );
}

/** Commands for the accepted pixel mask have their own contextual strip. */
export function EditorRasterSelectionActions({ runtime }: { runtime: EditorRasterRuntime }) {
  useAppLocale();
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  if (!snapshot.editing || snapshot.selection === 'none') return null;
  const active = snapshot.selection === 'active';
  return (
    <div
      data-ui="editor.raster.selection-actions"
      aria-busy={snapshot.busy}
      className="flex items-center gap-2"
    >
      <ContentToolbarButton
        dataUi="editor.raster.invertSelection"
        tone="utility"
        className={BUTTON_CLASS}
        title={message('invertSelection')}
        aria-label={message('invertSelection')}
        disabled={!active}
        onClick={() => {
          if (!runtime.getSnapshot().busy) runtime.invertSelection();
        }}
      >
        <Icon icon={arrowsTransferIcon} ssr aria-hidden width={16} height={16} />
      </ContentToolbarButton>
      <ContentToolbarButton
        dataUi="editor.raster.copySelected"
        tone="utility"
        className={BUTTON_CLASS}
        title={message('copySelected')}
        aria-label={message('copySelected')}
        disabled={!active}
        onClick={() => {
          if (!runtime.getSnapshot().busy) void runtime.copySelected();
        }}
      >
        <Copy size={16} />
      </ContentToolbarButton>
      <ContentToolbarButton
        dataUi="editor.raster.clearSelection"
        tone="utility"
        className={BUTTON_CLASS}
        title={message('clearSelection')}
        aria-label={message('clearSelection')}
        onClick={() => {
          if (!runtime.getSnapshot().busy) runtime.clearSelection();
        }}
      >
        <SquareDashedX size={16} />
      </ContentToolbarButton>
    </div>
  );
}

/** Show the entry command or the selected raster tool's properties below the primary rail. */
export function EditorRasterProperties(props: { runtime: EditorRasterRuntime }) {
  useAppLocale();
  const { runtime } = props;
  const disclosure = useRasterToolPropertiesDisclosure();
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  if (!snapshot.available) return null;
  const blocked = snapshot.permission !== 'allowed';
  if (!snapshot.editing)
    return (
      <div className="flex w-64 max-w-full flex-wrap items-center gap-2">
        {blocked ? (
          <>
            <span className="max-w-64 px-2 text-xs">{message('contentLocked')}</span>
            <ContentToolbarButton
              dataUi="editor.raster.allowContentEditing"
              tone="utility"
              className="!h-auto !min-h-7 !w-full !px-3 py-1 text-xs whitespace-normal"
              onClick={() => runtime.allowContentEditing()}
            >
              {message('allowContentEditing')}
            </ContentToolbarButton>
          </>
        ) : (
          <ContentToolbarButton
            dataUi="editor.raster.enter"
            tone="utility"
            className="!h-7 !min-h-7 !w-full !px-3 gap-1.5 text-xs"
            onClick={() => {
              disclosure?.setCollapsedTool(null);
              runtime.enterEditing();
            }}
          >
            <Icon icon={editIcon} ssr aria-hidden width={16} height={16} />
            <span>{message('edit')}</span>
          </ContentToolbarButton>
        )}
      </div>
    );
  if ((!snapshot.tool || disclosure?.collapsedTool === snapshot.tool) && !snapshot.error)
    return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-ui="editor.raster.properties">
      <div role="group" aria-busy={snapshot.busy} className="contents">
        <RasterParameters runtime={runtime} snapshot={snapshot} />
      </div>
      {snapshot.busy ? (
        <span role="status" className="sr-only">
          {message('busy')}
        </span>
      ) : null}
      {snapshot.error ? (
        <span role="alert" className="max-w-52 text-xs">
          {message('failed')}
        </span>
      ) : null}
    </div>
  );
}
