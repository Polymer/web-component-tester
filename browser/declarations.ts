declare global {
  interface Window {
    __wctUseNpm?: boolean;
    WebComponents?: WebComponentsStatic;
  }
  interface WebComponentsStatic {
    ready?(): void;
  }
}

export {};
