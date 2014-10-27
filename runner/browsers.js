/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var _         = require('lodash');
var launchpad = require('launchpad');

var DEFAULT_SAUCE_BROWSERS = require('../default-sauce-browsers.json');

var LAUNCHPAD_TO_SELENIUM = {
  chrome:  chrome,
  canary:  chrome,
  firefox: firefox,
  aurora:  firefox,
  ie:      internetExplorer,
  // Until https://code.google.com/p/selenium/issues/detail?id=7933
  safari:  safari,
};

var REMOTE_BROWSER = /^([^\/@]+)\/([^\/@]+)(?:@(.*))?$/;

/**
 * Expands an array of browser identifiers, supporting varying forms:
 *
 *  * Objects are considered to be a selenium capabilities dictionary.
 *  * Strings can either be of the form "<PLATFORM>/<BROWSER>[@<VERSION>]" to
 *    indicate a remote browser (see https://saucelabs.com/platforms)...
 *  * ...or they can be a launchpad short name to indicate a local browser.
 *
 * browsers is expanded into selenium capabilities and returned via callback.
 *
 * If browsers is empty, the default set of local or remote (if remote is true)
 * browsers will be used.
 *
 * @param {!Array.<string|!Object>} browsers
 * @param {boolean} remote
 * @param {function(*, Array.<!Object>)} callback
 */
function expand(browsers, remote, callback) {
  var results = [];
  var local   = [];

  browsers.forEach(function(browser) {
    var match;
    // Capabilities
    if (_.isObject(browser)) {
      results.push(browser);

    // Remote
    } else if (match = browser.match(REMOTE_BROWSER)) {
      var capabilities = {
        platform:    match[1],
        browserName: match[2],
      };
      if (match[3]) {
        capabilities.version = match[3];
      }
      results.push(capabilities);

    // Local
    } else {
      local.push(browser);
    }
  });

  if (results.length > 0 && local.length === 0) {
    return callback(null, results);
  }

  if (results.length === 0 && remote) {
    return callback(null, DEFAULT_SAUCE_BROWSERS);
  }

  detect(function(error, localBrowsers) {
    if (results.length === 0 && local.length === 0) {
      return callback(null, _.values(localBrowsers));
    }

    var missingBrowsers = _.difference(local, _.keys(localBrowsers));
    if (missingBrowsers.length > 0) {
      return callback('Unknown/unsupported local browsers: ' + missingBrowsers.join(', '));
    }

    results = results.concat(_.values(_.pick(localBrowsers, local)));
    callback(null, results);
  });
}

/**
 * Detects any locally installed browsers that we support.
 *
 * @param {function(*, Object.<string, !Object>)} callback
 */
function detect(callback) {
  launchpad.local(function(error, launcher) {
    if (error) return callback(error);
    launcher.browsers(function(error, browsers) {
      if (error) return callback(error);

      var results = {};
      for (var i = 0, browser; browser = browsers[i]; i++) {
        if (!LAUNCHPAD_TO_SELENIUM[browser.name]) continue;
        results[browser.name] = LAUNCHPAD_TO_SELENIUM[browser.name](browser);
      }

      callback(null, results);
    });
  });
}

/**
 * @return {!Array.<string>} A list of local browser names that are present in
 *     the current environment.
 */
function present() {
  var allKnown  = _.keys(launchpad.local.platform);
  var supported = _.keys(LAUNCHPAD_TO_SELENIUM);
  return _.intersection(allKnown, supported);
}

// Launchpad -> Selenium

/**
 * @param {!Object} browser A launchpad browser definition.
 * @return {!Object} A selenium capabilities object.
 */
function chrome(browser) {
  return {
    'browserName': 'chrome',
    'version':     browser.version.match(/\d+/)[0],
    'chromeOptions': {
      'binary': browser.binPath,
    },
  };
}

/**
 * @param {!Object} browser A launchpad browser definition.
 * @return {!Object} A selenium capabilities object.
 */
function firefox(browser) {
  return {
    'browserName':    'firefox',
    'version':        browser.version.match(/\d+/)[0],
    'firefox_binary': browser.binPath,
  };
}

/**
 * @param {!Object} browser A launchpad browser definition.
 * @return {!Object} A selenium capabilities object.
 */
function safari(browser) {
  // SafariDriver doesn't appear to support custom binary paths. Does Safari?
  return {
    'browserName': 'safari',
    'version':     browser.version,
    // TODO(nevir): TEMPORARY. https://github.com/Polymer/web-component-tester/issues/51
    'safari.options': {
      'skipExtensionInstallation': true,
    },
  };
}

/**
 * @param {!Object} browser A launchpad browser definition.
 * @return {!Object} A selenium capabilities object.
 */
function internetExplorer(browser) {
  return {
    'browserName': 'ie',
    'version':     browser.version,
  };
}

module.exports = {
  detect:  detect,
  expand:  expand,
  present: present,
};
