/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
import * as suites from './suites.js';
import ConsoleReporter from './reporters/console.js';
import HTMLReporter    from './reporters/html.js';
import MultiReporter   from './reporters/multi.js';
import TitleReporter   from './reporters/title.js';

export var htmlSuites = [];
export var jsSuites   = [];

/**
 * @param {CLISocket} socket The CLI socket, if present.
 * @param {MultiReporter} parent The parent reporter, if present.
 * @return {!Array.<!Mocha.reporters.Base} The reporters that should be used.
 */
export function determineReporters(socket, parent) {
  // Parents are greedy.
  if (parent) {
    return [parent.childReporter(window.location)];
  }

  // Otherwise, we get to run wild without any parental supervision!
  var reporters = [TitleReporter, ConsoleReporter];

  if (socket) {
    reporters.push(function(runner) {
      socket.observe(runner);
    });
  }

  if (suites.htmlSuites.length > 0 || suites.jsSuites.length > 0) {
    reporters.push(HTMLReporter);
  }

  return reporters;
}

/**
 * Yeah, hideous, but this allows us to be loaded before Mocha, which is handy.
 */
export function injectMocha(Mocha) {
  _injectPrototype(ConsoleReporter, Mocha.reporters.Base.prototype);
  _injectPrototype(HTMLReporter,    Mocha.reporters.HTML.prototype);
  // Mocha doesn't expose its `EventEmitter` shim directly, so:
  _injectPrototype(MultiReporter,   Object.getPrototypeOf(Mocha.Runner.prototype));
}

function _injectPrototype(klass, prototype) {
  var newPrototype = Object.create(prototype);
  // Only support
  Object.keys(klass.prototype).forEach(function(key) {
    newPrototype[key] = klass.prototype[key];
  });

  klass.prototype = newPrototype;
}
