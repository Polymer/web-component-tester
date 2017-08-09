declare module 'server-destroy' {
  import * as http from 'http';

  /**
   * Monkey-patches the destroy() method onto the given server.
   *
   * It only accepts DestroyableServers as parameters to remind the user
   * to update their type annotations elsewhere, as we can't express the
   * mutation in the type system directly.
   */
  function enableDestroy(server: enableDestroy.DestroyableServer): void;
  namespace enableDestroy {
    interface DestroyableServer extends http.Server {
      destroy(): void;
    }
  }
  export = enableDestroy;
}
