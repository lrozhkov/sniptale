import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { useRef, useState } from 'react';
import type { SurfaceStyle } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { translate } from '../../platform/i18n';
import { CompactPaintSelector } from '../paint-selector';
import type { useSurfaceStyleSelectorController } from './controller';
import { SurfaceStylePresetGrid } from './preset-grid';
import type { SurfaceStyleSelectorProps } from './types';

type SurfaceStyleSelectorController = ReturnType<typeof useSurfaceStyleSelectorController>;
const MODE_HEADER_CLASS_NAME = [
  'border-b pb-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_54%,transparent)]',
].join(' ');

export function SurfaceStyleSelectionPanel(props: {
  controller: SurfaceStyleSelectorController;
  selector: SurfaceStyleSelectorProps;
}) {
  const { controller, selector } = props;
  const [mode, setMode] = useState<'color' | 'surface'>(() =>
    controller.state.active ? 'surface' : 'color'
  );
  const paintStartRef = useRef<SurfaceStyle | null>(null);

  return (
    <>
      <div className={MODE_HEADER_CLASS_NAME}>
        <SegmentedSwitch
          activeId={mode}
          ariaLabel={translate('content.callout.surfaceStyle.backgroundType')}
          density="compact"
          options={[
            { id: 'color', label: translate('content.callout.surfaceStyle.color') },
            { id: 'surface', label: translate('content.callout.surfaceStyle.surface') },
          ]}
          onChange={setMode}
        />
      </div>
      <div className="min-w-0">
        {mode === 'color' ? (
          <CompactPaintSelector
            label={translate('content.callout.surfaceStyle.color')}
            palette={selector.palette ?? []}
            title={translate('content.callout.surfaceStyle.color')}
            value={controller.state.draft.fillPaint}
            onOpenChange={(open) => {
              if (open) paintStartRef.current = structuredClone(selector.value);
              else paintStartRef.current = null;
            }}
            onPreviewChange={(fillPaint) => {
              selector.onChange({ fillPaint, surfaceCss: '' });
            }}
            onPreviewReset={() => {
              if (paintStartRef.current) selector.onChange(paintStartRef.current);
            }}
            onChange={(fillPaint) => {
              selector.onChange({ fillPaint, surfaceCss: '' });
            }}
          />
        ) : (
          <SurfaceStylePresetGrid
            actions={selector.actions}
            draft={controller.state.draft}
            name={controller.state.name}
            selectionOnly
            onDraftChange={(surface) => {
              selector.onChange(surface);
            }}
            presets={selector.presets}
          />
        )}
      </div>
    </>
  );
}
