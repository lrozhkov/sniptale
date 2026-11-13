import { useRef, useSyncExternalStore, type ReactNode } from 'react';
import {
  Check,
  Copy,
  Crop,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Lasso,
  PaintBucket,
  Scan,
  SlidersHorizontal,
  SquareDashed,
  SquarePlus,
  SquareMinus,
  Undo2,
  WandSparkles,
  X,
} from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductRange, ProductSelect } from '@sniptale/ui/product-form-controls';
import { translate, useAppLocale } from '../../../platform/i18n';
import type { EditorRasterRuntime } from '../../raster-editing/runtime';
import { RasterParametersPopover } from './raster-parameters-popover';
import { DrawingColorOptions, DrawingOptionsDivider } from '../../../ui/drawing-tools/options';

type RasterSnapshot = ReturnType<EditorRasterRuntime['getSnapshot']>;
type RasterMessage =
  keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['raster'];
const message = (key: RasterMessage) => translate(`editor.raster.${key}`);
const BUTTON_CLASS = 'aspect-square !h-7 !min-h-7 !w-7 !min-w-7 shrink-0 !p-0';

function RasterButton(props: {
  name: RasterMessage;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <ContentToolbarButton
      type="button"
      tone="outline"
      className={BUTTON_CLASS}
      title={message(props.name)}
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

function RasterRange(props: {
  name: RasterMessage;
  value: number;
  max: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex shrink-0 items-center gap-2 text-xs text-[var(--sniptale-color-text-secondary)]">
      <span>{message(props.name)}</span>
      <ProductRange
        className="!w-20"
        aria-label={message(props.name)}
        data-ui={`editor.raster.${props.name}`}
        min={props.min ?? 0}
        max={props.max}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      />
      <span className="w-8 text-right tabular-nums text-[var(--sniptale-color-text-primary)]">
        {props.value}
      </span>
    </label>
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
    <div ref={boundaryRef} className="flex items-center gap-2">
      {tool === 'select' ? (
        <>
          {(['rectangle', 'lasso', 'wand'] as const).map((method) => (
            <RasterButton
              key={method}
              name={method}
              active={snapshot.selectionMethod === method}
              onClick={() => runtime.setSelectionMethod(method)}
            >
              {method === 'rectangle' ? (
                <SquareDashed size={16} />
              ) : method === 'lasso' ? (
                <Lasso size={16} />
              ) : (
                <WandSparkles size={16} />
              )}
            </RasterButton>
          ))}
          <DrawingOptionsDivider vertical={false} />
          {(['new', 'add', 'subtract'] as const).map((mode) => (
            <ContentToolbarButton
              key={mode}
              dataUi={`editor.raster.selectionMode.${mode}`}
              tone="property"
              className={BUTTON_CLASS}
              aria-label={message(mode)}
              active={snapshot.selectionMode === mode}
              aria-pressed={snapshot.selectionMode === mode}
              title={message(mode)}
              onClick={() => runtime.setSelectionMode(mode)}
            >
              {mode === 'new' ? (
                <SquareDashed aria-hidden size={16} />
              ) : mode === 'add' ? (
                <SquarePlus aria-hidden size={16} />
              ) : (
                <SquareMinus aria-hidden size={16} />
              )}
            </ContentToolbarButton>
          ))}
          <DrawingOptionsDivider vertical={false} />
          <RasterButton name="clearSelection" onClick={() => runtime.clearSelection()}>
            <X size={16} />
          </RasterButton>
          <RasterButton name="invertSelection" onClick={() => runtime.invertSelection()}>
            <Scan size={16} />
          </RasterButton>
          <RasterButton name="selectAll" onClick={() => runtime.selectAll()}>
            <SquareDashed size={16} />
          </RasterButton>
        </>
      ) : null}
      {region ? (
        <>
          <RasterRange
            name="tolerance"
            value={settings.tolerance}
            max={100}
            onChange={(tolerance) => runtime.updateSettings({ tolerance })}
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={settings.contiguous}
              onChange={(event) =>
                runtime.updateSettings({ contiguous: event.currentTarget.checked })
              }
            />
            {message('contiguous')}
          </label>
          <RasterRange
            name="grow"
            value={settings.grow}
            max={32}
            onChange={(grow) => runtime.updateSettings({ grow })}
          />
        </>
      ) : null}
      {tool === 'fill' ? (
        <DrawingColorOptions
          colors={[settings.color]}
          floatingBoundaryRef={boundaryRef}
          floatingPlacement="auto"
          vertical={false}
          allowAlpha
          label={message('color')}
          value={settings.color}
          onSelect={(color) => runtime.updateSettings({ color })}
        />
      ) : null}
      {tool === 'erase' || tool === 'restore' ? (
        <>
          <RasterButton
            name="erase"
            active={tool === 'erase'}
            onClick={() => runtime.setTool('erase')}
          >
            <Eraser size={16} />
          </RasterButton>
          <RasterButton
            name="restore"
            active={tool === 'restore'}
            onClick={() => runtime.setTool('restore')}
          >
            <Undo2 size={16} />
          </RasterButton>
          <RasterRange
            name="brushSize"
            value={settings.brushSize}
            min={1}
            max={512}
            onChange={(brushSize) => runtime.updateSettings({ brushSize })}
          />
          <RasterRange
            name="hardness"
            value={settings.hardness}
            max={100}
            onChange={(hardness) => runtime.updateSettings({ hardness })}
          />
        </>
      ) : null}
      {tool === 'crop' ? (
        <>
          <label className="flex items-center gap-2 text-xs">
            {message('cropRatio')}
            <ProductSelect<RasterSnapshot['cropRatio']>
              dataUi="editor.raster.cropRatio"
              aria-label={message('cropRatio')}
              title={message('cropRatio')}
              value={snapshot.cropRatio}
              onChange={(value) => runtime.setCropRatio(value)}
              controlSize="sm"
              containerClassName="!w-auto shrink-0"
              className="!h-7 !min-h-7 !w-auto"
              options={[
                { value: 'free', label: message('freeRatio') },
                { value: 'original', label: message('originalRatio') },
                { value: '1:1', label: '1:1' },
                { value: '4:3', label: '4:3' },
                { value: '16:9', label: '16:9' },
              ]}
            />
          </label>
          <RasterButton
            name="applyCrop"
            disabled={!snapshot.cropPending}
            onClick={() => {
              void runtime.applyCrop();
            }}
          >
            <Check size={16} />
          </RasterButton>
          <RasterButton name="cancelCrop" onClick={() => runtime.cancelCrop()}>
            <X size={16} />
          </RasterButton>
        </>
      ) : null}
      {snapshot.selection === 'active' ? (
        <>
          <RasterButton
            name="fillSelected"
            onClick={() => {
              void runtime.fillSelected();
            }}
          >
            <PaintBucket size={16} />
          </RasterButton>
          <RasterButton
            name="hideSelected"
            onClick={() => {
              void runtime.hideSelected();
            }}
          >
            <Eraser size={16} />
          </RasterButton>
          <RasterButton
            name="copySelected"
            onClick={() => {
              void runtime.copySelected();
            }}
          >
            <Copy size={16} />
          </RasterButton>
        </>
      ) : null}
    </div>
  );
}

/** Render selected-image controls from the runtime's small immutable snapshot. */
export function EditorRasterTools(props: {
  runtime: EditorRasterRuntime;
  onOpenAdjustments: (targetId: string) => void;
}) {
  useAppLocale();
  const snapshot = useSyncExternalStore(props.runtime.subscribe, props.runtime.getSnapshot);
  if (!snapshot.available) return null;
  const blocked = snapshot.permission !== 'allowed';
  const tools = [
    {
      tool: 'select',
      name: 'select',
      icon:
        snapshot.selectionMethod === 'lasso'
          ? Lasso
          : snapshot.selectionMethod === 'wand'
            ? WandSparkles
            : SquareDashed,
    },
    { tool: 'fill', name: 'fill', icon: PaintBucket },
    { tool: 'remove-color', name: 'removeColor', icon: WandSparkles },
    { tool: 'erase', name: 'erase', icon: Eraser },
    { tool: 'crop', name: 'crop', icon: Crop },
  ] as const;
  return (
    <div
      data-ui="editor.raster.toolbar"
      aria-label={message('title')}
      title={snapshot.targetName}
      className="flex min-w-0 items-center gap-1"
    >
      {blocked ? (
        <>
          <span className="max-w-64 text-xs">{message('contentLocked')}</span>
          <ContentToolbarButton
            dataUi="editor.raster.allowContentEditing"
            onClick={() => props.runtime.allowContentEditing()}
          >
            {message('allowContentEditing')}
          </ContentToolbarButton>
        </>
      ) : (
        <fieldset disabled={snapshot.busy} className="contents">
          {tools.map(({ tool, name, icon: Icon }) => (
            <RasterButton
              key={tool}
              name={name}
              active={snapshot.tool === tool || (tool === 'erase' && snapshot.tool === 'restore')}
              onClick={() => {
                props.runtime.setTool(snapshot.tool === tool ? null : tool);
              }}
            >
              <Icon size={16} />
            </RasterButton>
          ))}
          <span className="hidden min-[1500px]:contents">
            <RasterParameters runtime={props.runtime} snapshot={snapshot} />
          </span>
          <span className="contents min-[1500px]:hidden">
            <RasterParametersPopover
              title={message('parameters')}
              trigger={<SlidersHorizontal size={16} />}
              triggerClassName={BUTTON_CLASS}
            >
              <RasterParameters runtime={props.runtime} snapshot={snapshot} />
            </RasterParametersPopover>
          </span>
          <RasterButton
            name="flipHorizontal"
            onClick={() => {
              void props.runtime.flipHorizontal();
            }}
          >
            <FlipHorizontal2 size={16} />
          </RasterButton>
          <RasterButton
            name="flipVertical"
            onClick={() => {
              void props.runtime.flipVertical();
            }}
          >
            <FlipVertical2 size={16} />
          </RasterButton>
          <RasterButton
            name="adjustments"
            onClick={() => {
              if (snapshot.targetId) props.onOpenAdjustments(snapshot.targetId);
            }}
          >
            <SlidersHorizontal size={16} />
          </RasterButton>
        </fieldset>
      )}
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
