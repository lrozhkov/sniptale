type RetryableModuleLoader<T> = {
  getLoaded: () => T | null;
  load: () => Promise<T>;
};

export function createRetryableModuleLoader<T>(
  loadModule: () => Promise<T>
): RetryableModuleLoader<T> {
  let loadedModule: T | null = null;
  let modulePromise: Promise<T> | null = null;

  return {
    getLoaded: () => loadedModule,
    load: () => {
      if (loadedModule) {
        return Promise.resolve(loadedModule);
      }

      if (!modulePromise) {
        modulePromise = loadModule()
          .then((module) => {
            loadedModule = module;
            return module;
          })
          .catch((error) => {
            modulePromise = null;
            throw error;
          });
      }

      return modulePromise;
    },
  };
}

export function preloadModule<T>(loader: RetryableModuleLoader<T>): Promise<void> {
  return loader.load().then(() => undefined);
}
