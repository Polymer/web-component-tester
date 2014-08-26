`web-component-tester` tests your web components; ohmygosh.

It is a wrapper around WebDriver endpoints (via [`wd`](https://github.com/admc/wd)), supporting local selenium testing, as well as remote tests via Sauce.



# Getting Started

    npm install web-component-tester --save

You will also need to install a client library to communicate with the runner.
For Polymer web components:

    bower install Polymer/polymer-test-tools --save
    

# Gulp Configuration

`web-component-tester` provides several handy gulp tasks that you may want to
take advantage of:

`gulpfile.js`:

    var gulp = require('gulp');
    require('gulp-web-component-tester').initGulp(gulp);


## gulp test:local

Aliased to `gulp test` for convenience.

Runs tests locally against all [configured browsers](default-browsers.json).

Flags:

`--browsers BROWSER,BROWSER`: Override the browsers that will be run.

`--persistent`: Doesn't close the browsers after their first run. Refresh the
browser windows to re-run tests.


## gulp test:remote

Runs tests remotely against [configured browsers](default-browsers.json).
Requires that `SAUCE_USERNAME` and `SAUCE_ACCESS_KEY` are set in your 
environment.


## gulp wc:sauce-tunnel

Starts a Sauce Connect tunnel, and keeps it open.
