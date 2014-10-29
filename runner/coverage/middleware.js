var minimatch = require('minimatch');

/**
 * Middleware that serves an instrumented asset based on user
 * configuration of coverage
 *
 * TODO: should probably emit debug events to help with troubleshooting failing tests. It's
 * very possible for consumers to accidentally instrument files that should be served raw and
 * that can create problems.
 * (thedeeno)
 *
 */
exports = module.exports = function coverageMiddleware(root, options) {
  return function(req, res, next) {
    // cache the webserver root for user supplied instrumenter
    this.root = root;

    // always ignore platform files in addition to user's blacklist
    var blacklist = ['/web-component-tester/*'].concat(options.blacklist);

    // instrument unfiltered assets
    if ( allowed(req.url, options.whitelist, blacklist) ) {
      return options.instrumenter.call(this, req, res, next);
    } else {
      return next();
    }
  };
};

/**
 * Return true if the supplied path is whitelisted and also not blacklisted
 */
function allowed(path, whitelist, blacklist) {
  if ( !match(path, whitelist) ) {
    return false;
  }

  if ( match(path, blacklist) ) {
    return false;
  }

  return true;
}

/**
 * Returns true if the supplied string mini-matches any of the supplied patterns
 */
function match(str, rules) {
  var match = false;

  rules.forEach(function(rule) {
    if( minimatch(str, rule) ) {
        match =  true;
    }
  });

  return match;
}
