import { translate } from '../../../../../platform/i18n';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { NumberInput } from '../inputs/number';
import { SelectInput } from '../shared/controls';
import { InspectorDetails } from '../shared/details';

const FORMATS = [
  { id: 'wide', x: 16, y: 9, labelKey: 'canvasFormatWide' },
  { id: 'vertical', x: 9, y: 16, labelKey: 'canvasFormatVertical' },
  { id: 'square', x: 1, y: 1, labelKey: 'canvasFormatSquare' },
  { id: 'portrait', x: 4, y: 5, labelKey: 'canvasFormatPortrait' },
  { id: 'classic', x: 4, y: 3, labelKey: 'canvasFormatClassic' },
] as const;
const RESOLUTIONS = [720, 1080, 1440, 2160] as const;

function dimensions(x: number, y: number, shortEdge: number) {
  const unit = Math.min(
    7680 / Math.max(x, y),
    Math.max(320 / x, 180 / y, shortEdge / Math.min(x, y))
  );
  return { width: Math.round(x * unit), height: Math.round(y * unit) };
}

export function SceneCanvasFields(props: {
  width: number;
  height: number;
  onResizeProject: WorkspaceSidebarSelectionPanelProps['onResizeProject'];
}) {
  const { width, height, onResizeProject } = props;
  const format = FORMATS.find((item) => Math.abs(width / height - item.x / item.y) < 0.001);
  const shortEdge = Math.min(width, height);
  const resolutions = RESOLUTIONS.map((edge) => {
    const size = dimensions(format?.x ?? width, format?.y ?? height, edge);
    return { value: String(edge), label: `${size.width} × ${size.height}`, ...size };
  });
  const uniqueResolutions = resolutions.filter(
    (item, index) =>
      resolutions.findIndex(
        (candidate) => candidate.width === item.width && candidate.height === item.height
      ) === index
  );
  const resolution = uniqueResolutions.find(
    (item) => item.width === width && item.height === height
  );
  return (
    <div className="space-y-3" data-ui="video-editor.scene.canvas">
      <SelectInput
        label={translate('videoEditor.sidebar.canvasFormatLabel')}
        value={format?.id ?? 'custom'}
        options={[
          ...FORMATS.map((item) => ({
            value: item.id,
            label: `${item.x}:${item.y} · ${translate(`videoEditor.sidebar.${item.labelKey}`)}`,
          })),
          ...(!format
            ? [{ value: 'custom', label: translate('videoEditor.sidebar.canvasCustom') }]
            : []),
        ]}
        onChange={(id) => {
          const next = FORMATS.find((item) => item.id === id);
          if (!next) return;
          const size = dimensions(next.x, next.y, shortEdge);
          onResizeProject(size.width, size.height);
        }}
      />
      <SelectInput
        label={translate('videoEditor.sidebar.canvasResolutionLabel')}
        value={resolution?.value ?? 'custom'}
        options={[
          ...uniqueResolutions,
          ...(!resolution ? [{ value: 'custom', label: `${width} × ${height}` }] : []),
        ]}
        onChange={(value) => {
          const next = resolutions.find((item) => item.value === value);
          if (next) onResizeProject(next.width, next.height);
        }}
      />
      <InspectorDetails label={translate('videoEditor.sidebar.canvasExactSize')}>
        <NumberInput
          label={translate('videoEditor.sidebar.canvasWidthLabel')}
          value={width}
          min={320}
          max={7680}
          scrub={false}
          unit="px"
          onChange={(value) => onResizeProject(value, height)}
        />
        <NumberInput
          label={translate('videoEditor.sidebar.canvasHeightLabel')}
          value={height}
          min={180}
          max={7680}
          scrub={false}
          unit="px"
          onChange={(value) => onResizeProject(width, value)}
        />
      </InspectorDetails>
    </div>
  );
}
