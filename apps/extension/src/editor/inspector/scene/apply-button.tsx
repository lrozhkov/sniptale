import { translate } from '../../../platform/i18n';
import {
  getControlPrimaryButtonClassName,
  getControlSecondaryButtonClassName,
} from '@sniptale/ui/control-language';

export function FrameApplyButton(props: { onApplyFrame: () => void; onCancelFrame?: () => void }) {
  return (
    <div
      className={[
        'grid gap-2 border-t border-[color:var(--sniptale-color-border-soft)] pt-3',
        props.onCancelFrame ? 'grid-cols-2' : 'grid-cols-1',
      ].join(' ')}
    >
      {props.onCancelFrame ? (
        <button
          className={getControlSecondaryButtonClassName()}
          onClick={props.onCancelFrame}
          type="button"
        >
          {translate('common.actions.cancel')}
        </button>
      ) : null}
      <button
        className={getControlPrimaryButtonClassName()}
        onClick={props.onApplyFrame}
        type="button"
      >
        {translate('editor.scene.applyButton')}
      </button>
    </div>
  );
}
