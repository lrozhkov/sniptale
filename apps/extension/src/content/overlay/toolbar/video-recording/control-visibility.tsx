import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { useContext, type ReactNode } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { RecordingToolbarControl } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { RecordingToolbarControlsContext } from '../state/recording-controls';

export function RecordingControlVisibility(props: {
  control: RecordingToolbarControl;
  icon: LucideIcon;
  label: string;
  children?: ReactNode;
}) {
  const visibility = useContext(RecordingToolbarControlsContext);
  const visible = visibility?.controls[props.control] !== false;
  if (visibility?.editing) {
    const Icon = props.icon;
    const Indicator = visible ? Eye : EyeOff;
    const label = translate('content.toolbar.recordingControlVisible').replace(
      '{tool}',
      props.label
    );
    return (
      <ContentToolbarButton
        type="button"
        tone="property"
        aria-pressed={visible}
        aria-label={label}
        title={label}
        disabled={visibility.pending}
        dataUi={`content.toolbar.video-recording.visibility.${props.control}`}
        className="relative"
        onClick={() => void visibility.setVisible(props.control, !visible)}
      >
        <Icon size={18} className={visible ? undefined : 'opacity-40'} />
        <Indicator
          size={10}
          style={{ width: 10, height: 10 }}
          className="absolute bottom-0 right-0 text-[var(--sniptale-color-text-secondary)]"
        />
      </ContentToolbarButton>
    );
  }
  return visibility?.active && !visible ? null : props.children;
}
