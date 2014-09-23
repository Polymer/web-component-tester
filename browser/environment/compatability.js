// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
// This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
// The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also
// subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
(function() {

// polymer-test-tools (and Polymer/tools) support HTML tests where each file is
// expected to call `done()`, which posts a message to the parent window.
window.addEventListener('message', function(event) {
  if (!event.data || (event.data !== 'ok' && !event.data.error)) return;
  var subSuite = WCT.SubSuite.get(event.source);
  if (!subSuite) return;
  subSuite.onload();
  var path = relativeLocation(event.source.location);

  // Mocha doesn't expose its `EventEmitter` shim directly, so:
  var runner = Object.create(Object.getPrototypeOf(Mocha.Runner.prototype));
  runner.total = 1;
  subSuite.parentScope.WCT._multiRunner.childReporter()(runner);

  // Fake a Mocha suite (enough to satisfy MultiRunner)...
  var root = new Mocha.Suite();
  var test = new Mocha.Test(path, function() {
  });
  test.parent = root;
  test.state  = event.data === 'ok' ? 'passed' : 'failed'

  // ...and report it.
  // See https://github.com/visionmedia/mocha/blob/master/lib/runner.js#L36-46
  runner.emit('start');
  runner.emit('suite', root);

  runner.emit('test', test);
  if (event.data === 'ok') {
    runner.emit('pass', test);
  } else {
    runner.emit('fail', test, event.data.error);
  }
  runner.emit('test end', test);

  runner.emit('suite end', root);
  runner.emit('end');

  subSuite.done();
});

/** @return {string} `location` relative to the current window. */
function relativeLocation(location) {
  var path = location.pathname;
  if (path.indexOf(window.location.pathname) === 0) {
    path = path.substr(window.location.pathname.length);
  }
  return path;
}

})();
