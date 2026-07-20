import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from 'lucide-react';
import type React from 'react';
import {
  isDynamicRichShapeCallout,
  resetRichShapeCalloutTail,
  switchRichShapeCalloutSide,
  type EditorRichShapeCalloutSide,
} from '../../../../features/editor/document/rich-shape';
import { translate } from '../../../../platform/i18n';
import { FileActionRow, ToggleGrid } from '../../../chrome/ui';
import { CollapsibleSection, PanelSection } from './fields';
import type { RichShapeControlsProps } from './types';

type TailSideOption = {
  icon: React.ReactNode;
  label: string;
  value: EditorRichShapeCalloutSide;
};

const TAIL_SIDE_OPTIONS: TailSideOption[] = [
  {
    icon: <ArrowUp size={16} />,
    label: translate('editor.compact.richShapeTailTop'),
    value: 'top',
  },
  {
    icon: <ArrowRight size={16} />,
    label: translate('editor.compact.richShapeTailRight'),
    value: 'right',
  },
  {
    icon: <ArrowDown size={16} />,
    label: translate('editor.compact.richShapeTailBottom'),
    value: 'bottom',
  },
  {
    icon: <ArrowLeft size={16} />,
    label: translate('editor.compact.richShapeTailLeft'),
    value: 'left',
  },
];

const TAIL_SIDE_LABEL_KEYS = {
  top: 'editor.compact.richShapeTailTop',
  right: 'editor.compact.richShapeTailRight',
  bottom: 'editor.compact.richShapeTailBottom',
  left: 'editor.compact.richShapeTailLeft',
} as const;

function RichShapeTailBody(props: RichShapeControlsProps) {
  const callout = props.shape.callout;
  if (!callout) {
    return null;
  }

  return (
    <div className="space-y-2">
      <PanelSection
        label={translate('editor.compact.richShapeTailSide')}
        value={translate(TAIL_SIDE_LABEL_KEYS[callout.tail.side])}
      >
        <ToggleGrid
          ariaLabel={translate('editor.compact.richShapeTailSide')}
          options={TAIL_SIDE_OPTIONS.map((option) => ({
            active: option.value === callout.tail.side,
            icon: option.icon,
            label: option.label,
            onToggle: () =>
              props.applyRichShapePatch({
                callout: switchRichShapeCalloutSide(props.shape, option.value),
              }),
          }))}
        />
      </PanelSection>
      <FileActionRow
        aria-label={translate('editor.compact.richShapeTailReset')}
        title={translate('editor.compact.richShapeTailReset')}
        onClick={() =>
          props.applyRichShapePatch({
            callout: resetRichShapeCalloutTail(props.shape),
          })
        }
        icon={<RotateCcw aria-hidden="true" size={15} />}
      >
        {translate('editor.compact.richShapeTailReset')}
      </FileActionRow>
    </div>
  );
}

export function RichShapeTailSection(props: RichShapeControlsProps & { compact?: boolean }) {
  if (!isDynamicRichShapeCallout(props.shape)) {
    return null;
  }

  const body = <RichShapeTailBody {...props} />;
  if (props.compact) {
    return body;
  }

  return (
    <CollapsibleSection label={translate('editor.compact.richShapeTail')}>
      {body}
    </CollapsibleSection>
  );
}
