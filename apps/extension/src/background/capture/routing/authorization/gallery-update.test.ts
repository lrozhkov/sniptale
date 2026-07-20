import { expect, it } from 'vitest';

import {
  hasPreauthorizedGalleryUpdateRouteMessage,
  markPreauthorizedGalleryUpdateRouteMessage,
} from './gallery-update';

it('tracks gallery update preauthorization per message object', () => {
  const authorizedMessage = {};
  const otherMessage = {};

  markPreauthorizedGalleryUpdateRouteMessage(authorizedMessage);

  expect(hasPreauthorizedGalleryUpdateRouteMessage(authorizedMessage)).toBe(true);
  expect(hasPreauthorizedGalleryUpdateRouteMessage(otherMessage)).toBe(false);
});
