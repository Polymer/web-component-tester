declare module 'promisify-node' {
  interface NodeCallback<T> {
    (err: any, value: T): void;
  }
  function promisify<T>(f: (cb: NodeCallback<T>) => void): () => Promise<T>;
  function promisify<A1, T>(f: (a: A1, cb: NodeCallback<T>) => void): (a: A1) =>
      Promise<T>;
  function promisify<A1, A2, T>(
      f: (a: A1, a2: A2, cb: NodeCallback<T>) => void): (a: A1, a2: A2) =>
      Promise<T>;
  function promisify<A1, A2, A3, T>(
      f: (a: A1, a2: A2, a3: A3, cb: NodeCallback<T>) =>
          void): (a: A1, a2: A2, a3: A3) => Promise<T>;
  module promisify {}
  export = promisify;
}
