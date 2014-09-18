`web-component-tester` makes testing your web components a breeze!

You get a browser-based testing environment, configured out of the box with:

* [Mocha][mocha] as a test framework.
* [Chai][chai] assertions.

Additionally, `web-component-tester` provides integration with `selenium` via
`gulp` or `grunt`, so that you can easily run your test suites across multiple
browsers. 


# Writing Tests

All tests are driven by `.html` files. At the top of each test file, you will
need to load `browser.js`:

```html
<script src="../../web-component-tester/browser.js"></script>
```

Then, you just need to write your [Mocha][mocha] tests normally (either
[TDD](http://visionmedia.github.io/mocha/#tdd-interface) or
[BDD](http://visionmedia.github.io/mocha/#bdd-interface)).

```html
<script>
  suite('<awesome-element>', function() {
    test('is awesome', function() {
      assert.isTrue(document.createElement('awesome-element').awesome);
    });
  });
</script>
```

You can use either the [TDD](http://visionmedia.github.io/mocha/#tdd-interface)
or [BDD](http://visionmedia.github.io/mocha/#bdd-interface) interfaces.


## Suites of Suites

To run multiple test files together, you can use the `WCT.loadSuites` helper to
load and concurrently run all your tests:

```html
<script>
  WCT.loadSuites([
    'awesome-element.html',
    'awesomesauce.js',
  ]);
</script>
```


# Command Line Interface

## Gulp

`gulpfile.js`:

```js
var gulp = require('gulp');
require('web-component-tester').initGulp(gulp);
```

### gulp test:local

Aliased to `gulp test` for convenience.

Runs tests locally against all [configured browsers](default-browsers.json).

Flags:

`--browsers BROWSER,BROWSER`: Override the browsers that will be run.

`--persistent`: Doesn't close the browsers after their first run. Refresh the
browser windows to re-run tests.

`--expanded`: Lists each test as it passes/fails/pends.

### gulp test:remote

Runs tests remotely against [configured browsers](default-browsers.json).
Requires that `SAUCE_USERNAME` and `SAUCE_ACCESS_KEY` are set in your 
environment.


### gulp wct:sauce-tunnel

Starts a Sauce Connect tunnel, and keeps it open.


<!-- References -->
[mocha]: http://visionmedia.github.io/mocha/ "Mocha Test Framework"
[chai]:  http://chaijs.com/                  "Chai Assertion Library"
