import { expect, it, vi } from 'vitest';

import { collectSecurityStep } from './check.mjs';

it('projects the HTML sanitizer owner without receipt indirection', async () => {
  const securityRunner = vi.fn(async () => ({
    files: ['src/example.ts'],
    violations: [],
  }));

  const step = await collectSecurityStep({
    files: ['src/example.ts'],
    securityRunner,
  });

  expect(securityRunner).toHaveBeenCalledWith(['src/example.ts']);
  expect(step).toMatchObject({
    label: 'HTML sanitizer ownership',
    status: 'ok',
  });
});

it('keeps an HTML sanitizer violation blocking in the build lane', async () => {
  const securityRunner = vi.fn(async () => ({
    files: ['src/example.ts'],
    violations: [{ file: 'src/example.ts', rule: 'security-inner-html-owner' }],
  }));

  const step = await collectSecurityStep({
    files: ['src/example.ts'],
    securityRunner,
  });

  expect(step).toMatchObject({ label: 'HTML sanitizer ownership', status: 'failed' });
});
