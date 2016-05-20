/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

/**
 * WCT-specific behavior on top of Mocha's default HTML reporter.
 *
 * @param {!Mocha.Runner} runner The runner that is being reported on.
 */
export default function HTML(runner) {
  var output = document.createElement('div');
  output.id = 'mocha';
  document.body.appendChild(output);

  runner.on('suite', function(test) {
    this.total = runner.total;
  }.bind(this));

  Mocha.reporters.HTML.call(this, runner);
}

// Woo! What a hack. This just saves us from adding a bunch of complexity around
// style loading.
var style = document.createElement('style');
style.textContent = 'html, body {' +
                    '  position: relative;' +
                    '  height: 100%;' +
                    '  width:  100%;' +
                    '  min-width: 900px;' +
                    '}' +
                    '#mocha, #subsuites {' +
                    '  height: 100%;' +
                    '  position: absolute;' +
                    '  top: 0;' +
                    '}' +
                    '#mocha {' +
                    '  box-sizing: border-box;' +
                    '  margin: 0 !important;' +
                    '  overflow-y: auto;' +
                    '  padding: 60px 20px;' +
                    '  right: 0;' +
                    '  left: 500px;' +
                    '}' +
                    '#subsuites {' +
                    '  -ms-flex-direction: column;' +
                    '  -webkit-flex-direction: column;' +
                    '  display: -ms-flexbox;' +
                    '  display: -webkit-flex;' +
                    '  display: flex;' +
                    '  flex-direction: column;' +
                    '  left: 0;' +
                    '  width: 500px;' +
                    '}' +
                    '#subsuites .subsuite {' +
                    '  border: 0;' +
                    '  width: 100%;' +
                    '  height: 100%;' +
                    '}' +
                    '#mocha .test.pass .duration {' +
                    '  color: #555 !important;' +
                    '}';
document.head.appendChild(style);
