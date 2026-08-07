import { translate } from '../../../platform/i18n';
import { VoiceInputButton } from '../../voice-input/button';
import type { useCalloutVoiceInput } from './input';

const CONTROL_SIZE = 28;
const CONTROL_GAP = 8;
const VIEWPORT_MARGIN = 8;

export function resolveCalloutVoiceButtonLeftOffset(args: {
  calloutLeft: number;
  calloutWidth: number;
  viewportWidth: number;
}): number {
  const rightOffset = args.calloutWidth + CONTROL_GAP;
  const maxViewportLeft = Math.max(
    VIEWPORT_MARGIN,
    args.viewportWidth - VIEWPORT_MARGIN - CONTROL_SIZE
  );
  if (args.calloutLeft + rightOffset <= maxViewportLeft) return rightOffset;
  const leftOffset = -(CONTROL_SIZE + CONTROL_GAP);
  if (args.calloutLeft + leftOffset >= VIEWPORT_MARGIN) return leftOffset;
  const insetViewportLeft = Math.min(
    Math.max(args.calloutLeft + args.calloutWidth - CONTROL_SIZE, VIEWPORT_MARGIN),
    maxViewportLeft
  );
  return insetViewportLeft - args.calloutLeft;
}

export function CalloutVoiceButton(props: {
  dataUi?: string;
  isEditing: boolean;
  leftOffset: number;
  visualScale?: number;
  voice: ReturnType<typeof useCalloutVoiceInput>;
}) {
  if (!props.isEditing) return null;
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2"
      data-ui={
        props.dataUi ? `${props.dataUi}-control` : 'content.highlighter.callout-voice-control'
      }
      style={{
        left: props.leftOffset,
        scale: props.visualScale ?? 1,
        transformOrigin: 'center left',
      }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.preventDefault()}
    >
      <VoiceInputButton
        appearance="contrast"
        dataUi={props.dataUi ?? 'content.highlighter.callout-voice-input'}
        disabled={false}
        labels={{
          error: translate('content.interactiveFrame.voiceInputError'),
          start: translate('content.interactiveFrame.voiceInputStart'),
          stop: translate('content.interactiveFrame.voiceInputStop'),
        }}
        onStart={props.voice.actions.start}
        onStop={props.voice.actions.stop}
        state={props.voice.state}
      />
    </div>
  );
}
