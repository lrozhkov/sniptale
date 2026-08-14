type RouteResourceState<TComponent> =
  | { status: 'idle' }
  | { status: 'pending'; promise: Promise<TComponent> }
  | { status: 'resolved'; component: TComponent };

type PreloadableRouteResource<TComponent> = {
  getResolved(): TComponent | null;
  preload(): Promise<TComponent>;
};

export function createPreloadableRouteResource<TComponent>(
  loader: () => Promise<TComponent>
): PreloadableRouteResource<TComponent> {
  let state: RouteResourceState<TComponent> = { status: 'idle' };

  return {
    getResolved() {
      return state.status === 'resolved' ? state.component : null;
    },
    preload() {
      if (state.status === 'resolved') {
        return Promise.resolve(state.component);
      }
      if (state.status === 'pending') {
        return state.promise;
      }

      const promise = loader().then(
        (component) => {
          state = { status: 'resolved', component };
          return component;
        },
        (error: unknown) => {
          state = { status: 'idle' };
          throw error;
        }
      );
      state = { status: 'pending', promise };
      return promise;
    },
  };
}
