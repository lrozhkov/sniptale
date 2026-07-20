import { expectTypeOf, it } from 'vitest';

import type { RuntimeAckResponse, RuntimeMessageResponse } from './response';

type ExampleResponse = RuntimeMessageResponse<{ result: string; status: number }>;

it('keeps runtime response success and failure branches distinct', () => {
  expectTypeOf<Extract<ExampleResponse, { success: true }>['success']>().toEqualTypeOf<true>();
  expectTypeOf<Extract<ExampleResponse, { success: true }>['result']>().toEqualTypeOf<string>();
  expectTypeOf<Extract<ExampleResponse, { success: true }>['status']>().toEqualTypeOf<number>();
  expectTypeOf<Exclude<ExampleResponse, { success: true }>>().toMatchTypeOf<{
    success?: false;
    error?: string;
    result?: string;
    status?: number;
  }>();
  expectTypeOf<undefined>().toMatchTypeOf<RuntimeAckResponse>();
});
