# 3.x

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
