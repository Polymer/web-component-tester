## Unreleased

### Breaking change

* In an effort to reduce magical behavior and make `wct` easier to understand, it no longer will automatically serve some resources from its own `npm` dependencies and some resources from the project under test. Instead, all resources are served out of the project under test. This gives the project under test control over its testing dependencies and their versions.
  * As part of this, wct will also require that the project under test have an installation of the client side web-component-tester bower package. We recommend that all projects also have a dependency on the npm web-component-tester node module, and in a future release will will require it. This is to makes results more reproducible, and ensures that they'll be protected from future breaking changes.
  * This release also unifies the behavior of `wct` and `polyserve`, so if your code works without warnings in one it should work in the other.
  * Calling `replace(...)` will use sinon to stub `document.importNode` until `teardown` is called.

### Added

* Added first pass of _variants_. Variants different configurations of testing the same code.
  * Add support for _variant dependencies_.
    * wct already supports loading dependencies from your `bower_components` directory, mapping them to `../` in your code. You can now add variant dependency directories named like `bower_components-foo`. When these are detected, tests will then run separately for each such dependency directory, mapping `../` appropriately. See README for more details.

### Removed

* `webserver.webRunnerPath`, `webserver.webRunnerContent`, and `webserver.urlPrefix`, `webserver.staticContent` were internal properties that were exposed on the `config` object. They have been refactored and their replacement has been prefixed with an underscore to clarify that they're internal implementation details.
* `test-fixture`-mocha integration is no longer included in web-component-tester by default. See [here](https://github.com/PolymerElements/test-fixture#even-simpler-usage-in-mocha) for `test-fixture`-mocha integration.

### Fixed
* Fixed #373 and #383 which were caused by `emitHook` not handling argumnts correctly.

## 5.0.0
* Mocha upgraded to `v3.1.2`. This shouldn't require any new code, but make sure your tests still pass as there were some more subtle changes made to Mocha behavior for v3 (Add IE7 support, update dependencies). See https://github.com/mochajs/mocha/pull/2350 for more info.

## 4.2.2
* Update bower dependencies to match node dependencies
* Update rollup to 0.25
* Update README to point to webcomponents-lite.js

## 4.2.1
* Fix `grep` for upstream mocha bug

## 4.2.0
* Add `httpbin` functionality to check `POST` requests
  * `POST` to `/httpbin`, response will be contents of `POST`

## 4.1.0
* Add `ignoreRules` option to `a11ySuite`
    * Array of a11ySuite rules to ignore for that suite
    * Example: https://github.com/PolymerElements/paper-tooltip/commit/bf22b1dfaf7f47312ddb7f5415f75ae81fa467bf

## 4.0.3
* Fix npm 3 serving for lodash and sinon

## 4.0.2
* Fix serving from `node_modules` for npm 3

## 4.0.1
* Fix Polymer 0.5 testing

## 4.0.0
* Remove `bower` as a dependency, serve testing files out of `node_modules`
* Upgrade to `wct-local` 2.0, which needs node 0.12+ for `launchpad` 0.5
* Replace esperanto with rollup for building browser bundle

# 3.x

## 3.4.0
* Integrate [test-fixture](https://github.com/PolymerElements/test-fixture)

## 3.3.0
* Add ability to cancel running tests from library

## 3.2.0
* Add accessibility testing with `a11ySuite` and
    [accessibility-developer-tools](https://github.com/GoogleChrome/accessibility-developer-tools)

## 3.1.3

* `.bowerrc` included in the package to ensure that packages don't get placed in
  unexpected locations.

## 3.1.2

* `--verbose` now includes logging from [`serve-waterfall`](https://github.com/PolymerLabs/serve-waterfall).

## 3.1.1

* WCT now depends on `wct-sauce ^1.5.0`

## 3.1.0

* WCT proper no longer periodically executes webdriver commands to ensure remote
  keepalive. Logic has moved into `wct-sauce`.

* Fix for verbose mode breaking IE10.

## 3.0.7

* Mixing TDD & BDD Mocha interfaces is now an error.

* Calls to `console.error` now generate an error.

* Errors that occur during WCT's initialization are more reliably reported.

* WCT now treats dependencies installed into `bower_components/` as if they are
  siblings of the current repo (much like polyserve).

* Browser libraries are no longer bundled with WCT.

  * They are now bower-managed, and by default installed to `bower_components/`
    within `web-component-tester`.

  * The libraries loaded can be configured via `WCT = {environmentScripts: []}`.

  * Massive overhaul of `browser.js` to support this & `environment.js` no
    longer exists.

* Support for newer versions of webcomponents.js (also Polymer 0.8).

* Mocha configuration can be specified by the `mochaOptions` key in client
  options (i.e. `<script>WCT = {mochaOptions: {}};</script>`).

* Browser options can be specified in `wct.conf.js` via the `clientOptions` key.

* WCT now always generates an index when run via the command line.

* `wct.conf.json` can be used as an alternative to `wct.conf.js`.

## 3.0.0-3.0.6

Yanked. See `3.0.7` for rolled up notes.


# 2.x

There were changes made, and @nevir failed to annotate them. What a slacker.


# 1.x

What are you, an archaeologist?
