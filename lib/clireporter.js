var _     = require('lodash');
var chalk = require('chalk');
var util  = require('util');

var stacky = require('./stacky');

var STACKY_CONFIG = {
  indent: '    ',
  strip: [
    /^https?:\/\/[^\/]+\//,
  ],
  unimportant: [
    /^polymer-test-tools\//,
  ],
};

var STATE_ICONS = {
  passing: '✓',
  pending: '✖',
  failing: '✖',
  unknown: '?',
};

var STATE_COLORS = {
  passing: chalk.green,
  pending: chalk.yellow,
  failing: chalk.red,
  unknown: chalk.red,
};

var SHORT = {
  'internet explorer': 'IE',
};

var BROWSER_PAD = 24;
var STATUS_PAD  = 38;

function CliReporter(emitter, stream, options) {
  this.emitter = emitter;
  this.stream  = stream;
  this.options = options;

  this.browsers = {};

  emitter.on('log:info',  this.log.bind(this));
  emitter.on('log:warn',  this.log.bind(this, chalk.yellow));
  emitter.on('log:error', this.log.bind(this, chalk.red));

  if (this.options.verbose) {
    emitter.on('log:debug', this.log.bind(this, chalk.dim));
  }

  emitter.on('browser-init', function(browser) {
    this.setBrowser(browser).status = 'initializing';
    this.updateStatus();
  }.bind(this));

  emitter.on('browser-start', function(browser, data) {
    this.log(browser, 'Beginning tests via', chalk.magenta(data.url));
    // To handle re-runs (no browser-init).
    this.setBrowser(browser).total = data.total;
    this.updateStatus();
  }.bind(this));

  emitter.on('test-end', function(browser, data) {
    if (data.state === 'failing') {
      this.writeTestError(browser, data);
    } else if (this.options.expanded || this.options.verbose) {
      this.log(browser, this.prettyState(data.state), this.prettyTest(data));
    }
    var stats = this.getBrowser(browser.id);
    stats[data.state] = stats[data.state] + 1;
    this.updateStatus();
  }.bind(this));

  emitter.on('browser-end', function(browser, error) {
    if (error) {
      this.log(chalk.red, browser, 'Tests failed:', error);
      this.getBrowser(browser.id).status = chalk.red('errored');
    } else {
      this.log(chalk.green, browser, 'Tests passed');
    }
  }.bind(this));

  emitter.on('run-end', function(error) {
    if (error) {
      this.log(chalk.red, 'Test run ended in failure:', error);
    } else {
      this.log(chalk.green, 'Test run ended with great success');
    }
    this.flush();
  }.bind(this));
}

// Browser Tracking

CliReporter.prototype.setBrowser = function setBrowser(browser) {
  this.browsers[browser.id] = {
    pretty:  this.prettyBrowser(browser),
    running: 0,
    passing: 0,
    pending: 0,
    failing: 0,
  };
  return this.browsers[browser.id];
};

CliReporter.prototype.getBrowser = function getBrowser(id) {
  return this.browsers[id] || {pretty: chalk.red('unknown browser')};
}

// Specialized Reporting

CliReporter.prototype.updateStatus = function() {
  var statuses = Object.keys(this.browsers).map(function(browserId) {
    var stats = this.browsers[browserId];
    var status;
    if (stats.total) {
      var counts = [stats.passing, stats.pending, stats.failing];
      if (counts[0] > 0) counts[0] = chalk.green(counts[0]);
      if (counts[1] > 0) counts[1] = chalk.yellow(counts[1]);
      if (counts[2] > 0) counts[2] = chalk.red(counts[2]);
      status = counts.join('/') + ' of ' + stats.total;
    } else {
      status = stats.status;
    }

    return padRight(stats.pretty + ' (' + status + ')', STATUS_PAD);
  }.bind(this));

  this.writeWrapped(statuses, '  ');
};

CliReporter.prototype.writeTestError = function(browser, data) {
  this.log(browser, this.prettyState(data.state), this.prettyTest(data, chalk.yellow));
  this.write('\n');
  this.write(chalk.red('  ' + data.error.message));
  this.write(stacky.pretty(data.error.stack, STACKY_CONFIG));
  this.write('\n');
};

// Object Formatting

CliReporter.prototype.prettyState = function prettyState(state) {
  var color = STATE_COLORS[state] || STATE_COLORS.unknown;
  return color(STATE_ICONS[state] || STATE_ICONS.unknown);
}

CliReporter.prototype.prettyTest = function prettyTest(data) {
  var color = STATE_COLORS[data.state] || STATE_COLORS.unknown;
  return color(data.test.join(' » ') || '<unknown test>');
}

CliReporter.prototype.prettyBrowser = function prettyBrowser(browser) {
  parts = [];

  if (browser.platform && !browser.deviceName) {
    parts.push(browser.platform);
  }

  var name = browser.deviceName || browser.browserName;
  parts.push(SHORT[name] || name);

  if (browser.version) {
    parts.push(browser.version);
  }

  return chalk.blue(parts.join(' '));
}

// Yeah, yeah.
function padRight(string, length) {
  var currLength = chalk.stripColor(string).length;
  while (currLength < length) {
    currLength = currLength + 1;
    string = string + ' ';
  }
  return string;
}

// General Output Formatting

CliReporter.prototype.log = function log(maybeFormat) {
  var values = _.toArray(arguments);
  var format;
  if (_.isFunction(maybeFormat)) {
    values = values.slice(1);
    format = maybeFormat;
  }
  if (values[0].platform) {
    values[0] = padRight(this.prettyBrowser(values[0]), BROWSER_PAD);
  }

  var line = _.toArray(values).map(function(value) {
    if (value instanceof Buffer) return value.toString();
    return _.isString(value) ? value : util.inspect(value);
  }).join(' ');
  line = line.replace(/[\s\n\r]+$/, '');
  if (format) line = format(line);
  this.write(line);
}

CliReporter.prototype.writeWrapped = function writeWrapped(blocks, separator) {
  if (blocks.length === 0) return;

  var lines = [''];
  var width = this.stream.columns || 0;
  for (var i = 0, block; block = blocks[i]; i++) {
    var line     = lines[lines.length - 1];
    var combined = line + separator + block;
    if (line === '') {
      lines[lines.length - 1] = block;
    } else if (chalk.stripColor(combined).length <= width) {
      lines[lines.length - 1] = combined;
    } else {
      lines.push(block);
    }
  }

  this.stream.write('\033[J\n');
  this.writeLines(lines);
  this.stream.write('\r');
  this.stream.write('\033[' + (lines.length + 1) + 'A');
};

CliReporter.prototype.write = function write(line) {
  this.writeLines([line]);
  this.updateStatus();
};

CliReporter.prototype.writeLines = function writeLines(lines) {
  for (var i = 0, line; line = lines[i]; i++) {
    if (line[line.length - 1] !== '\n') {
      line = line + '\n';
    }
    this.stream.write('\033[J' + line);
  }
  this.linesWritten = lines.length;
};

CliReporter.prototype.flush = function flush() {
  // Add an extra line for padding.
  for (var i = 0; i <= this.linesWritten; i++) {
    this.stream.write('\n');
  }
};

module.exports = CliReporter;
