// policyStateId: project-export-capabilities - this queue serializes the registered export lifecycle.
let projectExportLifecycleQueue: Promise<void> = Promise.resolve();

export function coordinateProjectExportLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const run = projectExportLifecycleQueue.then(operation, operation);
  projectExportLifecycleQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
