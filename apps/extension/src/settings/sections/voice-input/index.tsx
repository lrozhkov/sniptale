import { VoiceInputSettingsContent } from './content';
import { useVoiceInputSettings } from './use-voice-input';

export function VoiceInputSettingsSection() {
  return <VoiceInputSettingsContent {...useVoiceInputSettings()} />;
}
