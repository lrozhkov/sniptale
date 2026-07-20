import { describe, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { backgroundRuntimeTypes } from '../../../../contracts/messaging/parsers/supported-types.data.ts';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { actionRouteMetadata } from './routes';

type NonActionBackgroundRuntimeClassification =
  | 'content-runtime-event'
  | 'internal-signal'
  | 'outbound-offscreen-command';

const nonActionBackgroundRuntimeMessageTypes = new Map<
  string,
  NonActionBackgroundRuntimeClassification
>([
  ['AREA_SELECTED', 'content-runtime-event'],
  ['KEEP_ALIVE', 'internal-signal'],
  ['REGION_CAPTURE_ERROR', 'content-runtime-event'],
  ['REGION_CAPTURE_STARTED', 'content-runtime-event'],
  ['REGION_CAPTURE_STOPPED', 'content-runtime-event'],
  [MessageType.EXPORT_POPUP_PROGRESS, 'internal-signal'],
  [MessageType.EXPORT_POPUP_RESULT, 'internal-signal'],
  [VideoMessageType.COUNTDOWN_COMPLETE, 'internal-signal'],
  [VideoMessageType.DISPOSE_DESKTOP_MEDIA, 'outbound-offscreen-command'],
  [VideoMessageType.REGION_SELECTED, 'content-runtime-event'],
  [VideoMessageType.REGION_SELECTION_CANCELLED, 'content-runtime-event'],
]);

function collectMissingRuntimeRouteClassifications(args: {
  backgroundRuntimeMessageTypes: readonly string[];
  routeMessageTypes: ReadonlySet<string>;
  nonActionMessageTypes: ReadonlyMap<string, NonActionBackgroundRuntimeClassification>;
}): readonly string[] {
  return args.backgroundRuntimeMessageTypes
    .filter(
      (messageType) =>
        !args.routeMessageTypes.has(messageType) && !args.nonActionMessageTypes.has(messageType)
    )
    .sort();
}

function parserSupportedActionMessageTypes(): ReadonlySet<string> {
  return new Set(
    actionRouteMetadata
      .filter((entry) => entry.support === 'parser-supported' && entry.messageType !== null)
      .map((entry) => entry.messageType as string)
  );
}

describe('background runtime route completeness', () => {
  it('classifies every background runtime parser contract as routed or explicitly non-action', () => {
    expect(
      collectMissingRuntimeRouteClassifications({
        backgroundRuntimeMessageTypes: [...backgroundRuntimeTypes],
        nonActionMessageTypes: nonActionBackgroundRuntimeMessageTypes,
        routeMessageTypes: parserSupportedActionMessageTypes(),
      })
    ).toEqual([]);
  });

  it('fails when a background runtime contract has no route or explicit classification', () => {
    expect(
      collectMissingRuntimeRouteClassifications({
        backgroundRuntimeMessageTypes: [...backgroundRuntimeTypes, 'CONTRACT_ONLY_TEST_MESSAGE'],
        nonActionMessageTypes: nonActionBackgroundRuntimeMessageTypes,
        routeMessageTypes: parserSupportedActionMessageTypes(),
      })
    ).toEqual(['CONTRACT_ONLY_TEST_MESSAGE']);
  });
});
