/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

import * as chalk from 'chalk';
import * as cleankill from 'cleankill';
import * as fs from 'fs';
import * as http from 'http';
import * as _ from 'lodash';
import * as path from 'path';
import {RequestHandler, ServerInfo, startServers} from 'polyserve';
import * as send from 'send';
import * as serverDestroy from 'server-destroy';

import {Context} from './context';
import * as httpbin from './httpbin';
import {findPort} from './port-scanner';

// Template for generated indexes.
const INDEX_TEMPLATE = _.template(fs.readFileSync(
    path.resolve(__dirname, '../data/index.html'), {encoding: 'utf-8'}));

// We prefer serving local assets over bower assets.
const WCT_ROOT = path.resolve(__dirname, '..');

const DEFAULT_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

// Sauce Labs compatible ports
// taken from
// https://docs.saucelabs.com/reference/sauce-connect/#can-i-access-applications-on-localhost-
// - 80, 443, 888: these ports must have root access
// - 5555, 8080: not forwarded on Android
const SAUCE_PORTS = [
  2000, 2001, 2020, 2109, 2222, 2310, 3000, 3001, 3030, 3210, 3333,  4000,
  4001, 4040, 4321, 4502, 4503, 4567, 5000, 5001, 5050, 5432, 6000,  6001,
  6060, 6666, 6543, 7000, 7070, 7774, 7777, 8000, 8001, 8003, 8031,  8081,
  8765, 8777, 8888, 9000, 9001, 9080, 9090, 9876, 9877, 9999, 49221, 55001
];

/**
 * The webserver module is a quasi-plugin. This ensures that it is hooked in a
 * sane way (for other plugins), and just follows the same flow.
 *
 * It provides a static HTTP server for serving the desired tests and WCT's
 * `browser.js`/`environment.js`.
 */
export function webserver(wct: Context): void {
  const options = wct.options;

  wct.hook('configure', async function() {
    // For now, you should treat all these options as an implementation detail
    // of WCT. They may be opened up for public configuration, but we need to
    // spend some time rationalizing interactions with external webservers.
    options.webserver = _.merge(options.webserver, {
      // The URL path that each test run should target.
      webRunnerPath: undefined,
      // If present, HTML content that should be served at `webRunner`.
      webRunnerContent: undefined,
      // Map of route expressions (regular expressions) to local file paths that
      // should be served by the webserver.
      staticContent: [],
    });

    if (options.verbose) {
      options.clientOptions.verbose = true;
    }

    // Prefix our web runner URL with the base path.
    let urlPrefix = options.webserver.urlPrefix;
    urlPrefix = urlPrefix.replace('<basename>', path.basename(options.root));
    options.webserver.webRunnerPath = urlPrefix + '/generated-index.html';

    // Hacky workaround for Firefox + Windows issue where FF screws up pathing.
    // Bug: https://github.com/Polymer/web-component-tester/issues/194
    options.suites = options.suites.map((cv) => cv.replace(/\\/g, '/'));

    options.webserver.webRunnerContent = INDEX_TEMPLATE(options);
  });

  wct.hook('prepare', async function() {
    const wsOptions = options.webserver;
    const additionalRoutes = new Map<string, RequestHandler>();

    let hasWarnedBrowserJs = false;
    additionalRoutes.set('/browser.js', function(request, response) {
      if (!hasWarnedBrowserJs) {
        console.warn(`

          WARNING:
          Loading WCT's browser.js from /browser.js is deprecated.

          Instead load it from ../web-component-tester/browser.js
          (or with the absolute url /components/web-component-tester/browser.js)

          Also be sure to \`bower install web-component-tester\`

        `);
        hasWarnedBrowserJs = true;
      }
      send(request, path.join(options.root, 'bower_components', 'web-component-tester', 'browser.js')).pipe(response);
    });
    // TODO(rictic): detect that the user hasn't bower installed wct and die.

    // Mapped static content (overriding files served at the root).
    if (wsOptions.webRunnerContent) {
      additionalRoutes.set(
          wsOptions.webRunnerPath, function(request, response) {
            response.set(DEFAULT_HEADERS);
            response.send(wsOptions.webRunnerContent);
          });
    }
    _.each(wsOptions.staticContent, function(file, url) {
      additionalRoutes.set(url, function(request, response) {
        response.set(DEFAULT_HEADERS);
        send(request, file).pipe(response);
      });
    });

    // Serve up project & dependencies via polyserve
    const polyserveServers = await startServers({
      root: options.root,
      headers: DEFAULT_HEADERS,
      packageName: path.basename(options.root),
      additionalRoutes: additionalRoutes,
    });
    if (polyserveServers.kind !== 'mainline') {
      throw new Error('Internal Error: got multiple servers back from polyserve');
    }
    const app = polyserveServers.app;
    // enableDestroy monkeypatches a destroy() method onto the server.
    type DestroyableServer = typeof polyserveServers.server & {destroy(): void};
    const server = polyserveServers.server as DestroyableServer;
    wsOptions.port = server.address().port;

    wct._httpServer = server as any;

    // At this point, we allow other plugins to hook and configure the
    // webserver as they please.
    await wct.emitHook('prepare:webserver', app);

    app.use('/httpbin', httpbin.httpbin);

    app.get('/favicon.ico', function(request, response) {
      response.end();
    });

    app.use(function(request, response, next) {
      wct.emit('log:warn', '404', chalk.magenta(request.method), request.url);
      next();
    });

    serverDestroy(server as any);

    cleankill.onInterrupt(function(done) {
      // close the socket IO server directly if it is spun up
      const io = wct._socketIOServer;
      if (io) {
        // we will close the underlying server ourselves
        (<any>io).httpServer = null;
        io.close();
      }
      server.destroy();
      server.on('close', done);
    });

    wct.emit(
        'log:info', 'Web server running on port', chalk.yellow(server.address().port.toString()),
        'and serving from', chalk.magenta(options.root));
  });
};

// HACK(rictic): remove this ES6-compat hack and export webserver itself
webserver['webserver'] = webserver;

module.exports = webserver;
