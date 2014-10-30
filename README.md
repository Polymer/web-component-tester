`web-component-tester` makes testing your web components a breeze!

You get a browser-based testing environment, configured out of the box with:

* [Mocha][mocha] as a test framework.
* [Chai][chai] assertions.
* [Async][async] to keep your sanity.
* [Lodash][lodash] (3.0) to repeat fewer things.

WCT will [run your tests](#running-your-tests) against whatever browsers you have locally installed, or remotely via Sauce Labs.


# Getting Started

There's a bit of setup necessary.

## Bower

You will need to set up WCT as a dependency of your project. Via bower:

```sh
bower install Polymer/web-component-tester --save
```

In the following examples, we assume that you've installed it in `../`, but any
location will do.

## Configuration

You can configure wct via the command line, environment variables, or a
config file located at `./wct.conf.js`.

### Config File

Config Files should be written in the following format:

```js
module.exports = function(options) {
  // options.verbose = true;
  // options.sauce.username = 'boo';
  // ...

  return options;
}
```

## Test Index

WCT will, by default, run tests declared in `test/index.html`. Generally, 
you'll want to use this to load all your test suites:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <script src="../../platform/platform.js"></script>
    <script src="../../web-component-tester/browser.js"></script>
    <script src="../awesome.js"></script>
  </head>
  <body>
    <script>
      WCT.loadSuites([
        'awesome-tests.js',
        'awesomest-tests.html',
      ]);
    </script>
  </body>
</html>
```


## `.js` Suites

Your test suites can either be `.js` sources, which run in the context of your
text index. For example, `test/awesome-tests.js`:

```js
suite('AwesomeLib', function() {
  test('is awesome', function() {
    assert.isTrue(AwesomeLib.awesome);
  });
});
```


## `.html` Suites

Or, you can write tests in separate `.html` documents. For example,
`test/awesomest-tests.html`:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="../../platform/platform.js"></script>
  <script src="../../web-component-tester/browser.js"></script>
  <link rel="import" href="../awesome-element.html">
</head>
<body>
  <awesome-element id="fixture"></awesome-element>
  <script>
    suite('<awesome-element>', function() {
      test('is awesomest', function() {
        assert.isTrue(document.getElementById('fixture').awesomest);
      });
    });
  </script>
</body>
</html>
```


## Running Your Tests

You can run your tests by hosting them via a web server (sorry, `file://` is
not supported), or by using the `wct` command line tool:

```sh
npm install -g web-component-tester
```

If you're on windows, make sure that you also have [Java][java] installed and
available on your `PATH`.

The `wct` tool will run your tests in multiple browsers at once, either on your
machine...

```sh
wct
```

..or remotely via [Sauce Labs][sauce]:

```sh
wct --remote
```


# Nitty Gritty

## Mocha

WCT supports Mocha's [TDD][mocha-tdd] (`suite`/`test`/etc) and [BDD][mocha-bdd]
(`describe`/`it`/etc) interfaces, and will call `mocha.setup`/`mocha.run` for 
you. Just write your tests, and you're set.


## Chai

Similarly, Chai's [`expect`][chai-bdd] and [`assert`][chai-tdd] interfaces are 
exposed for your convenience.


## Command Line

The `wct` tool, and the [gulp](#gulp) and [grunt](#grunt) integration, support
several command line flags:


`--remote`: Uses the [default remote browsers](default-sauce-browsers.json), 
and if omitted uses the default local browsers.

Note that you will need a [valid Sauce Labs account](opensauce) for this. Let
WCT know your credentials via envrionment variables:

```sh
export SAUCE_USERNAME=username
export SAUCE_ACCESS_KEY=abcdef01-abcd-abcd-abcd-abcdef012345
```


`--browsers BROWSER,BROWSER`: Override the browsers that will be run. Browsers
can be specified via local names such as `chrome`, `canary`, `firefox`,
`aurora`, `ie`, etc. Remote browsers can be specified via
`<PLATFORM>/<BROWSER>[@<VERSION>]`.


`--persistent`: Doesn't close the browsers after their first run. Refresh the
browser windows to re-run tests.


## Custom Environments

If you would rather not load WCT's shared environment (everything but Mocha is
optional), you've got a couple options: Set the `WCTSkipEnvironment = true` before loading `browser.js`. Or...

```html
<script src="../../web-component-tester/browser.js?skipEnv"></script>
```


## Gulp

We also provide Gulp tasks for your use. `gulpfile.js`:

```js
var gulp = require('gulp');
require('web-component-tester').gulp.init(gulp);
```

Exposes `gulp test:local` and `gulp test:remote`.


## Grunt

Or, Grunt tasks, if you prefer. `gruntfile.js`:

```js
grunt.initConfig({
  'wct-test': {
    local: {
      options: {remote: false},
    },
    remote: {
      options: {remote: true},
    },
    chrome: {
      options: {browsers: ['chrome']},
    },
  },
});

grunt.loadNpmTasks('web-component-tester');
```

Gives you two grunt tasks: `wct-test:local` and `wct-test:remote`. The 
`options` you can use are specified in [`runner/config.js`](runner/config.js).


<!-- References -->
[async]:     https://github.com/caolan/async     "Async.js"
[chai-bdd]:  http://chaijs.com/api/bdd/          "Chai's BDD Interface"
[chai-tdd]:  http://chaijs.com/api/assert/       "Chai's TDD Interface"
[chai]:      http://chaijs.com/                  "Chai Assertion Library"
[java]:      https://java.com/download           "Java"
[mocha-bdd]: http://visionmedia.github.io/mocha/#bdd-interface "Mocha's BDD Interface"
[mocha-tdd]: http://visionmedia.github.io/mocha/#tdd-interface "Mocha's TDD Interface"
[mocha]:     http://visionmedia.github.io/mocha/ "Mocha Test Framework"
[sauce]:     http://saucelabs.com                "Sauce Labs"
[opensauce]: https://saucelabs.com/opensauce     "Open Sauce Testing"
[lodash]:    https://lodash.com/                 "Lo-Dash"
