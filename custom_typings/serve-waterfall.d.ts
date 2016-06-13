declare module 'serve-waterfall' {
  import * as express from 'express';
  import * as core from 'express-serve-static-core';
  import {Options as SendOptions} from 'send';

  /** Maps url paths to disk paths */
  interface MappingDefinition {
    [urlPath: string]: string;
  }
  interface Options {
    root?: string;
    headers?: Object;
    sendOpts?: SendOptions;
    log?: (msg: any) => void;
  }
  function serveWaterfall(mapping: MappingDefinition[], options?: Options): core.RequestHandler;
  namespace serveWaterfall {
    export var mappings: {
      STATIC: MappingDefinition[];
      WEB_COMPONENT: MappingDefinition[];
    };
  }
  export = serveWaterfall;
}
