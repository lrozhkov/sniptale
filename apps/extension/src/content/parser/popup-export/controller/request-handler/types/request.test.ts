import { expectTypeOf, it } from 'vitest';

import type { PopupExportRequestHandlerProps as FacadeRequestHandlerProps } from '.';
import type { PopupExportRequestHandlerProps as RoleRequestHandlerProps } from './request';

it('keeps the request role props aligned with the facade', () => {
  expectTypeOf<FacadeRequestHandlerProps>().toMatchTypeOf<RoleRequestHandlerProps>();
});
