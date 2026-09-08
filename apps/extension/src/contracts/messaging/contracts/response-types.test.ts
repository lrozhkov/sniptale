import { expect, expectTypeOf, it } from 'vitest';
import type { RecordingActionEvent } from '../../../features/video/project/types';
import type { NativeRecordingTelemetrySnapshot } from '../../native-app/telemetry-types';
import type { RecordingTelemetrySnapshot } from './response-types';

import { recordingStateHealthValues } from './response-types';

it('keeps recording state health values stable for runtime contracts', () => {
  expect(recordingStateHealthValues).toEqual(['healthy', 'degraded', 'failed']);
});

it('keeps browser and native telemetry contracts on the raw action DTO', () => {
  expectTypeOf<
    RecordingTelemetrySnapshot['actionEvents'][number]
  >().toEqualTypeOf<RecordingActionEvent>();
  expectTypeOf<
    NativeRecordingTelemetrySnapshot['actionEvents'][number]
  >().toEqualTypeOf<RecordingActionEvent>();
});
