import { describe, expect, it } from 'vitest';

import * as platformServices from '../../platform/runtime-services/services';
import * as applicationServices from './services';

describe('content application runtime-services facade', () => {
  it('keeps the application facade bound to the canonical platform service owner', () => {
    expect(applicationServices.createContentRuntimeServices).toBe(
      platformServices.createContentRuntimeServices
    );
    expect(applicationServices.getContentRuntimeServices).toBe(
      platformServices.getContentRuntimeServices
    );
    expect(applicationServices.setContentRuntimeServicesForTests).toBe(
      platformServices.setContentRuntimeServicesForTests
    );
    expect(applicationServices.resetContentRuntimeServicesForTests).toBe(
      platformServices.resetContentRuntimeServicesForTests
    );
  });
});
