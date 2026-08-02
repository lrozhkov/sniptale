import type {
  VoiceInputPreferences,
  VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import { createIdleVoiceInputSnapshot, type ActiveVoiceInputSession } from './protocol';

// policyStateId: voice-input-port-session-authority - the worker-local exact owner of
// the active consumer/offscreen identity pair and its last sanitized snapshot.
export class VoiceInputSessionAuthority {
  private activeValue: ActiveVoiceInputSession | null = null;
  private snapshotValue = createIdleVoiceInputSnapshot();

  get active(): ActiveVoiceInputSession | null {
    return this.activeValue;
  }

  get snapshot(): VoiceInputSnapshot {
    return this.snapshotValue;
  }

  begin(session: ActiveVoiceInputSession, snapshot: VoiceInputSnapshot): void {
    this.activeValue = session;
    this.snapshotValue = snapshot;
  }

  clearIf(session: ActiveVoiceInputSession): boolean {
    if (this.activeValue !== session) return false;
    this.activeValue = null;
    return true;
  }

  owns(session: ActiveVoiceInputSession): boolean {
    return this.activeValue === session;
  }

  replaceSnapshot(snapshot: VoiceInputSnapshot): void {
    this.snapshotValue = snapshot;
  }

  reset(preferences?: VoiceInputPreferences): VoiceInputSnapshot {
    this.activeValue = null;
    this.snapshotValue = createIdleVoiceInputSnapshot(preferences);
    return this.snapshotValue;
  }
}
