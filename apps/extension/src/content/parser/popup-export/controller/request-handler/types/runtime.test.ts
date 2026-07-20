import { expectTypeOf, it } from 'vitest';

import type {
  PopupExportRequestHandlerRuntime as FacadeRequestHandlerRuntime,
  PopupExportRunner as FacadePopupExportRunner,
} from '.';
import type {
  PopupExportRequestHandlerRuntime as RoleRequestHandlerRuntime,
  PopupExportRunner as RolePopupExportRunner,
} from './runtime';

it('keeps the runtime role types aligned with the facade', () => {
  expectTypeOf<FacadePopupExportRunner>().toMatchTypeOf<RolePopupExportRunner>();
  expectTypeOf<FacadeRequestHandlerRuntime>().toMatchTypeOf<RoleRequestHandlerRuntime>();
});
