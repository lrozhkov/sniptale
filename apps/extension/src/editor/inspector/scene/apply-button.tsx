import { translate } from '../../../platform/i18n';
import {
  INSPECTOR_PRIMARY_BUTTON_CLASS_NAME,
  INSPECTOR_SECONDARY_BUTTON_CLASS_NAME,
} from '../chrome';

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
          className={INSPECTOR_SECONDARY_BUTTON_CLASS_NAME}
          onClick={props.onCancelFrame}
          type="button"
        >
          {translate('common.actions.cancel')}
        </button>
      ) : null}
      <button
        className={INSPECTOR_PRIMARY_BUTTON_CLASS_NAME}
        onClick={props.onApplyFrame}
        type="button"
      >
        {translate('editor.scene.applyButton')}
      </button>
    </div>
  );
}
