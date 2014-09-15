// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
// This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
// The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also
// subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
(function() {

/**
 * Load and run a set of Mocha suites. This is the entry point you're looking
 * for.
 *
 * @param {!Array.<string>} tests An array of test files to load. They can be
 *     either `.js` or `.html` files.
 * @param {Object} mochaOptions Custom options to pass to Mocha.
 */
WCT.runSuites = function(files, mochaOptions) {
  mocha.setup({ui: 'tdd', reporter: WCT.HTMLReporter})
  this.loadSuites(files, function(error) {
    if (error) throw error;
    mocha.run();
  });
}

// File Loading

/**
 * Loads suites of tests, supporting `.js` as well as `.html` files.
 *
 * @param {!Array.<string>} files The files to load.
 * @param {function} done A callback that fires once all files have loaded.
 */
WCT.loadSuites = function loadSuites(files, done) {
  var loaders = files.map(function(file) {
    if (file.slice(-3) === '.js') {
      return this.loadScriptSuite.bind(this, file);
    } else if (file.slice(-5) === '.html') {
      return this.loadDocumentSuite.bind(this, file);
    } else {
      throw new Error('Unknown resource type ' + file);
    }
  }.bind(this));

  async.parallel(loaders, done);
};

// Individual File Loading

/**
 * Loads a script relative to the main document.
 *
 * @param {string} path
 * @param {function} done
 */
WCT.loadScriptSuite = function loadScriptSuite(path, done) {
  var script = document.createElement('script');
  script.src = path;
  script.onload = done.bind(null, null);
  script.onerror = done.bind(null, 'Failed to load script ' + script.src);
  document.head.appendChild(script);
}

/**
 * Imports a document relative to the main document.
 *
 * @param {string} path
 * @param {function} done
 */
WCT.loadDocumentSuite = function loadDocumentSuite(path, done) {
  var iframe = document.createElement('iframe');
  WCT.SubSuite.register(path, iframe);
  iframe.src = path;
  iframe.classList.add('subsuite');
  // TODO(nevir): also defer for polymer ready, if configured.
  iframe.onload = done.bind(null, null);
  iframe.onerror = done.bind(null, 'Failed to load document ' + iframe.src);
  document.body.appendChild(iframe);
}

})();
