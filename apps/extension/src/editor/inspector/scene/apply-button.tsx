import { translate } from '../../../platform/i18n';
import {
  getControlPrimaryButtonClassName,
  getControlSecondaryButtonClassName,
} from '@sniptale/ui/control-language';

export function FrameApplyButton(props: { onApplyFrame: () => void; onCancelFrame?: () => void }) {
  return (
    <div
      className={[
        'flex justify-end gap-2 border-t border-[color:var(--sniptale-color-border-soft)] pt-3',
      ].join(' ')}
    >
      {props.onCancelFrame ? (
        <button
          className={`${getControlSecondaryButtonClassName()} min-w-24`}
          onClick={props.onCancelFrame}
          type="button"
        >
          {translate('common.actions.cancel')}
        </button>
      ) : null}
      <button
        className={`${getControlPrimaryButtonClassName()} min-w-24`}
        onClick={props.onApplyFrame}
        type="button"
      >
        {translate('editor.scene.applyButton')}
      </button>
    </div>
  );
}
