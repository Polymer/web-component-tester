declare module 'server-destroy' {
  import * as http from 'http';

  interface DestroyableServer extends http.Server {
    destroy(): void;
  }
  /**
   * Monkey-patches the destroy() method onto the given server.
   *
   * It only accepts DestroyableServers as parameters to remind the user
   * to update their type annotations elsewhere, as we can't express the
   * mutation in the type system directly.
   */
  function enableDestroy(server: DestroyableServer): void;
  namespace enableDestroy {}
  export = enableDestroy;
}
