const EDITOR_CANVAS_TIMEOUT_MS = 5_000;

type CanvasReadyWaiter = {
  reject(error: Error): void;
  resolve(): void;
};

type CanvasReadyState =
  | { generation: number; status: 'pending'; waiters: Set<CanvasReadyWaiter> }
  | { generation: number; status: 'ready' }
  | { generation: number; status: 'torn-down' };

const handoffs = new WeakMap<object, EditorCanvasReadyHandoff>();

function createCanvasReadyError(message: string): Error {
  return new Error(message);
}

export class EditorCanvasReadyHandoff {
  private state: CanvasReadyState = {
    generation: 0,
    status: 'pending',
    waiters: new Set(),
  };

  beginMount(): number {
    if (this.state.status === 'pending') {
      return this.state.generation;
    }

    const generation = this.state.generation + 1;
    this.state = { generation, status: 'pending', waiters: new Set() };
    return generation;
  }

  markReady(generation: number): void {
    if (this.state.generation !== generation || this.state.status !== 'pending') {
      return;
    }

    const waiters = this.state.waiters;
    this.state = { generation, status: 'ready' };
    for (const waiter of waiters) {
      waiter.resolve();
    }
  }

  tearDown(): void {
    if (this.state.status === 'torn-down') {
      return;
    }

    const { generation } = this.state;
    if (this.state.status === 'pending') {
      const error = createCanvasReadyError('Editor canvas was disposed before it became ready');
      for (const waiter of this.state.waiters) {
        waiter.reject(error);
      }
    }

    this.state = { generation, status: 'torn-down' };
  }

  wait(timeoutMs = EDITOR_CANVAS_TIMEOUT_MS): Promise<void> {
    if (this.state.status === 'ready') {
      return Promise.resolve();
    }
    if (this.state.status === 'torn-down') {
      return Promise.reject(createCanvasReadyError('Editor canvas is disposed'));
    }

    const pendingState = this.state;
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const waiter: CanvasReadyWaiter = {
        reject: (error) => {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }
          reject(error);
        },
        resolve: () => {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }
          resolve();
        },
      };

      pendingState.waiters.add(waiter);
      timeoutId = setTimeout(() => {
        pendingState.waiters.delete(waiter);
        reject(
          createCanvasReadyError(`Timed out waiting for the editor canvas after ${timeoutMs}ms`)
        );
      }, timeoutMs);
    });
  }
}

export function ensureEditorCanvasReadyHandoff(owner: object): EditorCanvasReadyHandoff {
  const existing = handoffs.get(owner);
  if (existing) {
    return existing;
  }

  const handoff = new EditorCanvasReadyHandoff();
  handoffs.set(owner, handoff);
  return handoff;
}
