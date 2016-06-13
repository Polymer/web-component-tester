declare module 'send' {
  import * as http from 'http';
  import * as events from 'events';


  function send(req: http.IncomingMessage, path: string, options?: send.Options): send.SendStream;
  namespace send {
    export interface SendStream extends events.EventEmitter {
      pipe(res: http.ServerResponse): void;
    }

    export interface Options {
      dotfiles?: 'allow' | 'deny' | 'ignore';
      end?: number;
      etag?: boolean;
      extensions?: string[];
      index?: boolean|string|string[];
      lastModified?: boolean;
      maxAge?: number;
      root?: string;
      start?: number;
    }
  }
  export = send;
}
