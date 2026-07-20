import { defineMessageSource } from '../source';
import { sharedBytesMessages } from './bytes';
import { sharedDefaultsMessages } from './defaults';
import { sharedDisplayMediaMessages } from './display-media';
import { sharedMediaHubMessages } from './media-hub';
import { sharedMediaMetadataMessages } from './media-metadata';
import { sharedProjectActionsMessages } from './project-actions';
import { sharedRuntimeMessages } from './runtime';
import { sharedStorageMessages } from './storage';
import { sharedUiMessages } from './ui';
import { sharedVideoProjectMessages } from './video-project';
import { sharedWebSnapshotMessages } from './web-snapshot';

export const sharedMessages = defineMessageSource({
  runtime: sharedRuntimeMessages,
  mediaHub: sharedMediaHubMessages,
  webSnapshot: sharedWebSnapshotMessages,
  videoProject: sharedVideoProjectMessages,
  displayMedia: sharedDisplayMediaMessages,
  bytes: sharedBytesMessages,
  storage: sharedStorageMessages,
  mediaMetadata: sharedMediaMetadataMessages,
  projectActions: sharedProjectActionsMessages,
  ui: sharedUiMessages,
  defaults: sharedDefaultsMessages,
});
