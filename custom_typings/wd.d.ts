

declare module 'wd' {
  interface NodeCB<T> {
    (err: any, value: T):void;
  }
  export interface Browser {
    configureHttp(options: {
      retries: number
    });
    attach(sessionId: string, callback: NodeCB<Capabilities>);
    init(capabilities: Capabilities, callback: NodeCB<string>);

    get(url: string, callback: NodeCB<void>);
    quit(callback: NodeCB<void>);

    on(eventName: string, handler: Function);
  }
  export interface Capabilities {
    /** The name of the browser being used */
    browserName: 'android'|'chrome'|'firefox'|'htmlunit'|'internet explorer'|'iPhone'|'iPad'|'opera'|'safari';
    /** The browser version, or the empty string if unknown. */
    version: string;
    /** A key specifying which platform the browser should be running on. */
    platform: 'WINDOWS'|'XP'|'VISTA'|'MAC'|'LINUX'|'UNIX'|'ANDROID'|'ANY';

    /** Whether the session can interact with modal popups,
     *  such as window.alert and window.confirm. */
    handlesAlerts: boolean;
    /** Whether the session supports CSS selectors when searching for elements. */
    cssSelectorsEnabled: boolean;

    webdriver: {
      remote: {
        quietExceptions: boolean;
      }
    }

    selenium: {
      server: {
        url: string;
      }
    }
  }

  export function remote(
      hostnameOrUrl: string, port?: number,
      username?: string, password?: string): Browser;
  export function remote(
      options: {hostname: string, port?: number,
                auth?: string, path?: string,}
      ): Browser;
  export function remote(
      options: {host: string, port?: number,
                username?: string, accesskey?: string, path?: string,}
      ): Browser;
}
