import { translate } from '../../../platform/i18n';
import { AspectToggle } from '../sidebar-shared';
import { SizeControlInput } from './input';

interface SizeControlsRowProps {
  width: number;
  height: number;
  locked: boolean;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onToggleLock: () => void;
  widthInputDataUi?: string;
  heightInputDataUi?: string;
  dataUi?: string;
  dataSizePanelDimensions?: boolean;
  className?: string;
}

/**
 * Canonical editor-owned size row. It keeps the visual/layout contract aligned across file menu,
 * expanded inspector, and compact popovers while leaving commit semantics to the owning surface.
 */
export function SizeControlsRow(props: SizeControlsRowProps) {
  const sizePanelProps = props.dataSizePanelDimensions ? { 'data-size-panel-dimensions': '' } : {};
  const widthInputProps =
    props.widthInputDataUi === undefined ? {} : { dataUi: props.widthInputDataUi };
  const heightInputProps =
    props.heightInputDataUi === undefined ? {} : { dataUi: props.heightInputDataUi };

  return (
    <div
      {...sizePanelProps}
      data-ui={props.dataUi}
      className={[
        'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2',
        props.className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <SizeControlInput
        {...widthInputProps}
        label={translate('editor.compact.widthDimension')}
        value={props.width}
        onChange={props.onWidthChange}
      />
      <AspectToggle compact checked={props.locked} onClick={props.onToggleLock} />
      <SizeControlInput
        {...heightInputProps}
        label={translate('editor.compact.heightDimension')}
        value={props.height}
        onChange={props.onHeightChange}
      />
    </div>
  );
}
