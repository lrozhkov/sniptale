import { MAX_MOTION_AREA_COORDINATE } from '../../../../../features/video/project/motion/focus-area';
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
  key: 'x' | 'y' | 'width' | 'height';
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
      min: area.axes ? -MAX_MOTION_AREA_COORDINATE : 0,
      max: area.axes ? MAX_MOTION_AREA_COORDINATE : Math.max(0, panel.project.width - area.width),
    },
    {
      key: 'y',
      labelKey: 'videoEditor.sidebar.motionAreaYLabel',
      value: area.y,
      min: area.axes ? -MAX_MOTION_AREA_COORDINATE : 0,
      max: area.axes ? MAX_MOTION_AREA_COORDINATE : Math.max(0, panel.project.height - area.height),
    },
    {
      key: 'width',
      labelKey: 'videoEditor.sidebar.motionAreaWidthLabel',
      value: area.width,
      min: area.axes ? Math.min(1, area.width) : 48,
      max: area.axes ? MAX_MOTION_AREA_COORDINATE : panel.project.width,
    },
    {
      key: 'height',
      labelKey: 'videoEditor.sidebar.motionAreaHeightLabel',
      value: area.height,
      min: area.axes ? Math.min(1, area.height) : 48,
      max: area.axes ? MAX_MOTION_AREA_COORDINATE : panel.project.height,
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
