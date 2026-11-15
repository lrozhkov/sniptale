/** Exactly one streaming or final batch payload enters the offscreen history owner. */
export type RecordingBlockObservationPayload =
  | {
      cursorPacket: import('./cursor-observations').RecordingCursorObservationPacket;
      telemetry?: never;
      eventPacket?: never;
      cursorPackets?: never;
      eventPackets?: never;
    }
  | {
      eventPacket: import('./event-observations').RecordingEventObservationPacket;
      telemetry?: never;
      cursorPacket?: never;
      cursorPackets?: never;
      eventPackets?: never;
    }
  | {
      cursorPackets: import('./cursor-observations').RecordingCursorObservationPacket[];
      telemetry?: never;
      cursorPacket?: never;
      eventPacket?: never;
      eventPackets?: never;
    }
  | {
      eventPackets: import('./event-observations').RecordingEventObservationPacket[];
      telemetry?: never;
      cursorPacket?: never;
      eventPacket?: never;
      cursorPackets?: never;
    };
