import type { VideoRecordingSurfaceCommand } from '@sniptale/runtime-contracts/video/types/messages.surface';
import { getVideoRecordingProfile } from '@sniptale/runtime-contracts/video/types/types';
import { mutateVideoSettings } from '../../../../composition/persistence/capture-settings';

type OutputSettingsCommand = Extract<
  VideoRecordingSurfaceCommand,
  { kind: 'select-quality-profile' | 'set-output-profile' }
>;

/** Commits output setup against the latest settings under the existing mutation permit. */
export async function updateVideoRecordingOutputSettings(
  command: OutputSettingsCommand,
  requireCurrentIdleAuthority: () => void
): Promise<void> {
  requireCurrentIdleAuthority();
  await mutateVideoSettings((current) => {
    requireCurrentIdleAuthority();
    if (command.kind === 'set-output-profile') {
      return { ...current, outputProfile: { ...command.outputProfile }, qualityProfileId: null };
    }
    const profile = getVideoRecordingProfile(current, command.profileId);
    if (!profile) throw new Error('Video recording quality profile is unavailable');
    return {
      ...current,
      outputProfile: { ...profile.configuration },
      qualityProfileId: profile.id,
    };
  });
}
