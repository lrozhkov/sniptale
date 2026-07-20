import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import {
  createLazyVideoManagerSessionFacade,
  createVideoManagerSession,
  type VideoManagerSessionFacade,
} from './session.facade';

const defaultVideoManagerSessionOwner = createLazyDefaultOwner(createVideoManagerSession);
const defaultVideoManagerSession = createLazyVideoManagerSessionFacade(() =>
  defaultVideoManagerSessionOwner.getOwner()
);

export const videoManagerSession: VideoManagerSessionFacade = defaultVideoManagerSession;
