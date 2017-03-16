/**
 * @license
 * Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

(function(Mocha, chai, axs) {
  Object.keys(Mocha.interfaces).forEach(function(iface) {
    var orig = Mocha.interfaces[iface];

    Mocha.interfaces[iface] = function(suite) {
      orig.apply(this, arguments);

      var Suite = Mocha.Suite;
      var Test = Mocha.Test;

      suite.on('pre-require', function(context, file, mocha) {

        /**
          * Runs the Chrome Accessibility Developer Tools Audit against a test-fixture
          *
          * @param {String} fixtureId ID of the fixture element in the document to use
          * @param {Array?} ignoredRules Array of rules to ignore for this suite
          * @param {?{beforeEach: ?function(?function()), afterEach: ?function(?function())}}
          *     hooks An object which can contain beforeEach and afterEach hooks to be run
          *     before and after each test is run. Use these hooks if you need to perform
          *     (potentially asynchronous) work to set up or tear down your test. If this
          *     object is passed, the normal setup / teardown of generating a fixture with ID
          *     `fixtureId` will not be performed - `fixtureId` will still be shown in the
          *     test title.
          */
        context.a11ySuite = function(fixtureId, ignoredRules, hooks) {
          ignoredRules = ignoredRules || [];

          var beforeEach;
          var afterEach;

          if (!hooks) {
            var fixtureElement = document.getElementById(fixtureId);
            if (!fixtureElement) {
              return;
            }

            beforeEach = function() {
              fixtureElement.create();
            };

            afterEach = function() {
              fixtureElement.restore();
            };
          } else if (typeof hooks === "object" && hooks !== null) {
            beforeEach = hooks.beforeEach;
            afterEach = hooks.afterEach;
          } else {
            return;
          }

          var a11ySuite = Suite.create(suite, 'A11y Audit - Fixture: ' + fixtureId);
          if (beforeEach) {
            a11ySuite.beforeEach(beforeEach);
          }
          if (afterEach) {
            a11ySuite.afterEach(afterEach);
          }

          axs.AuditRules.getRules(true).forEach(function(ruleName) {
            if (ignoredRules.indexOf(ruleName) >= 0) return;

            var rule = axs.AuditRules.getRule(ruleName);

            // Build an AuditConfiguration that runs only this rule.
            var axsConfig = new axs.AuditConfiguration();
            axsConfig.scope = document.body;
            axsConfig.showUnsupportedRulesWarning = false;
            axsConfig.auditRulesToRun = [ruleName];

            var test = new Test(rule.heading, function() {
              axs.Audit.run(axsConfig).forEach(function(result) {
                if (result.result === 'FAIL') {
                  throw new Error(axs.Audit.accessibilityErrorMessage(result));
                }
              });
            });
            test.file = file;

            a11ySuite.addTest(test);
          });

          return a11ySuite;
        };
      });
    };
  });

  chai.use(function(chai, util) {
    var Assertion = chai.Assertion;

    // assert
    chai.assert.a11yLabel = function(node, exp, msg){
      new Assertion(node).to.have.a11yLabel(exp, msg);
    };

    // expect / should
    Assertion.addMethod('a11yLabel', function(str, msg) {
      if (msg) {
        util.flag(this, 'message', msg);
      }

      var node = this._obj;

      // obj must be a Node
      new Assertion(node).to.be.instanceOf(Node);

      // vind the text alternative with the help of accessibility dev tools
      var textAlternative = axs.properties.findTextAlternatives(node, {});

      this.assert(
        textAlternative === str,
        'expected #{this} to have text alternative #{exp} but got #{act}',
        'expected #{this} to not have text alternative #{act}',
        str,
        textAlternative,
        true
      );
    });
  });
})(window.Mocha, window.chai, window.axs);
