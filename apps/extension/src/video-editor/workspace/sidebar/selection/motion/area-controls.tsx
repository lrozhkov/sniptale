import { translate, type TranslationKey } from '../../../../../platform/i18n';
import type { VideoProjectMotionArea } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { NumberInput } from '../inputs/number';

function MotionAreaNumberField(props: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <NumberInput
      label={props.label}
      value={props.value}
      min={props.min}
      max={props.max}
      step={1}
      onChange={props.onChange}
    />
  );
}

type MotionAreaBoundField = {
  key: keyof VideoProjectMotionArea;
  labelKey: TranslationKey;
  max: number;
  min: number;
  value: number;
};

function createMotionAreaBoundFields(
  area: VideoProjectMotionArea,
  panel: WorkspaceSidebarSelectionPanelProps
): MotionAreaBoundField[] {
  return [
    {
      key: 'x',
      labelKey: 'videoEditor.sidebar.motionAreaXLabel',
      value: area.x,
      min: 0,
      max: Math.max(0, panel.project.width - area.width),
    },
    {
      key: 'y',
      labelKey: 'videoEditor.sidebar.motionAreaYLabel',
      value: area.y,
      min: 0,
      max: Math.max(0, panel.project.height - area.height),
    },
    {
      key: 'width',
      labelKey: 'videoEditor.sidebar.motionAreaWidthLabel',
      value: area.width,
      min: 48,
      max: panel.project.width,
    },
    {
      key: 'height',
      labelKey: 'videoEditor.sidebar.motionAreaHeightLabel',
      value: area.height,
      min: 48,
      max: panel.project.height,
    },
  ];
}

export function MotionAreaBoundsFields(props: {
  area: VideoProjectMotionArea;
  onUpdateArea: (patch: Partial<VideoProjectMotionArea>) => void;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  const fields = createMotionAreaBoundFields(props.area, props.panel);

  return (
    <>
      {fields.map((field) => (
        <MotionAreaNumberField
          key={field.key}
          label={translate(field.labelKey)}
          value={field.value}
          min={field.min}
          max={field.max}
          onChange={(value) => props.onUpdateArea({ [field.key]: value })}
        />
      ))}
    </>
  );
}
