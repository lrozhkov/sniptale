// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import {
  ChromeAiRuntimeError,
  createChromeAiSession,
  createChromeAiSystemPromptMessage,
  loadChromeAiAvailability,
  prepareChromeAiSession,
} from './chrome-ai';

type MockSession = {
  destroy: ReturnType<typeof vi.fn>;
  prompt: ReturnType<typeof vi.fn>;
};

function createLanguageModel(args: {
  availability?: ReturnType<typeof vi.fn>;
  create?: ReturnType<typeof vi.fn>;
}) {
  return {
    availability: args.availability ?? vi.fn().mockResolvedValue('available'),
    create:
      args.create ??
      vi.fn().mockResolvedValue({
        destroy: vi.fn(),
        prompt: vi.fn(),
      } satisfies MockSession),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('uses a supported output language for Prompt API availability and create options', async () => {
  const create = vi.fn().mockResolvedValue({
    destroy: vi.fn(),
    prompt: vi.fn(),
  });
  const availability = vi.fn().mockResolvedValue('available');
  vi.stubGlobal('LanguageModel', createLanguageModel({ availability, create }));

  await expect(loadChromeAiAvailability()).resolves.toBe('available');
  await expect(createChromeAiSession({})).resolves.toMatchObject({
    destroy: expect.any(Function),
    prompt: expect.any(Function),
  });

  expect(availability).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    })
  );
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    })
  );
});

it('returns unsupported when Prompt API is unavailable', async () => {
  await expect(loadChromeAiAvailability()).resolves.toBe('unsupported');
  await expect(createChromeAiSession({})).rejects.toMatchObject(
    new ChromeAiRuntimeError('unsupported')
  );
});

it('normalizes availability values and system-prompt bootstrap messages', async () => {
  const languageModel = createLanguageModel({
    availability: vi
      .fn()
      .mockResolvedValueOnce('downloadable')
      .mockResolvedValueOnce('mystery-state'),
  });
  vi.stubGlobal('LanguageModel', languageModel);

  await expect(loadChromeAiAvailability()).resolves.toBe('downloadable');
  await expect(loadChromeAiAvailability()).resolves.toBe('unsupported');
  expect(createChromeAiSystemPromptMessage('  System prompt  ')).toEqual([
    { role: 'system', content: 'System prompt' },
  ]);
  expect(createChromeAiSystemPromptMessage('   ')).toEqual([]);
});

it('creates and tears down a setup session while reporting download progress', async () => {
  const destroy = vi.fn();
  const create = vi
    .fn()
    .mockImplementation(async (options: { monitor?: (monitor: never) => void }) => {
      options.monitor?.({
        addEventListener: (
          _eventName: 'downloadprogress',
          listener: (event: { loaded: number }) => void
        ) => {
          listener({ loaded: 0.42 });
        },
      } as never);
      return {
        destroy,
        prompt: vi.fn(),
      };
    });
  vi.stubGlobal('LanguageModel', createLanguageModel({ create }));
  const onDownloadProgress = vi.fn();

  await prepareChromeAiSession({ onDownloadProgress });

  expect(onDownloadProgress).toHaveBeenCalledWith(0.42);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedInputs: [{ type: 'text' }, { type: 'image' }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      monitor: expect.any(Function),
    })
  );
  expect(destroy).toHaveBeenCalledTimes(1);
});

it('passes prompt-session options through to LanguageModel.create', async () => {
  const session = {
    destroy: vi.fn(),
    prompt: vi.fn(),
  };
  const create = vi.fn().mockResolvedValue(session);
  const signal = new AbortController().signal;
  vi.stubGlobal('LanguageModel', createLanguageModel({ create }));

  await expect(
    createChromeAiSession({
      initialPrompts: [{ role: 'system', content: 'Rules' }],
      signal,
    })
  ).resolves.toBe(session);

  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedInputs: [{ type: 'text' }, { type: 'image' }],
      initialPrompts: [{ role: 'system', content: 'Rules' }],
      signal,
    })
  );
});

it('normalizes non-Error create failures into browser-owned typed errors', async () => {
  vi.stubGlobal(
    'LanguageModel',
    createLanguageModel({
      create: vi.fn().mockRejectedValue('broken'),
    })
  );

  await expect(createChromeAiSession({})).rejects.toMatchObject(
    new ChromeAiRuntimeError('unexpected')
  );
});
