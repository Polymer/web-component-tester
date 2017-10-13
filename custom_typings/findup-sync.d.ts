declare module 'findup-sync' {
  import * as minimatch from 'minimatch';

  interface IOptions extends minimatch.IOptions {
    cwd?: string;
  }

  function mod(pattern: string[]|string, opts?: IOptions): string;
  namespace mod {}
  export = mod;
}
