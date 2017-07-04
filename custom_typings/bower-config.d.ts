declare module 'bower-config' {
  interface Config {
    directory: string;
  }
  function read(cwd: string, overrides?: boolean): Config;
}
