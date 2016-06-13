declare module 'findup-sync' {
  import * as minimatch from 'minimatch';

  interface IOptions extends minimatch.Options {
    cwd?: string;
  }

  function mod(pattern: string[] | string, opts?: IOptions): string;
  module mod { }
  export = mod;
}
