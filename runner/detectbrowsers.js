/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var launchpad = require('launchpad');

var LAUNCHPAD_TO_SELENIUM = {
  chrome:  chrome,
  canary:  chrome,
  firefox: firefox,
  aurora:  firefox,
  ie:      internetExplorer,
  // Until https://code.google.com/p/selenium/issues/detail?id=7933
  // safari:  safari,
};

/**
 * Detects any locally installed browsers that we support.
 */
module.exports = function detectBrowsers(emitter, callback) {
  launchpad.local(function(error, launcher) {
    if (error) return callback(error);
    launcher.browsers(function(error, browsers) {
      if (error) return callback(error);

      var capabilities = [];
      for (var i = 0, browser; browser = browsers[i]; i++) {
        if (!LAUNCHPAD_TO_SELENIUM[browser.name]) {
          emitter.emit('log:debug', 'Unknown launchpad browser config:', browser);
          continue;
        }
        capabilities.push(LAUNCHPAD_TO_SELENIUM[browser.name](browser));
      }
      emitter.emit('log:debug', 'Using local browsers:', capabilities);

      callback(null, capabilities);
    });
  });
};

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
