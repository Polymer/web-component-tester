declare module 'serve-waterfall' {
  import * as express from 'express';
  import * as core from 'express-serve-static-core';

  /** Maps url paths to disk paths */
  interface MappingDefinition {
    [urlPath: string]: string
  }
  function serveWaterfall(mapping: MappingDefinition[]): core.RequestHandler;
  namespace serveWaterfall {
    export var mappings: {
      STATIC: MappingDefinition[];
      WEB_COMPONENT: MappingDefinition[];
    }
  }
  export = serveWaterfall;
}
