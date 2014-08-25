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

function CliReporter(reporter, stream, verbose) {
  this.reporter = reporter;
  this.stream   = stream;
  this.verbose  = verbose;

  this.browsers = {};

  this.write('\n');
  reporter.on('run-end', this.flush.bind(this));

  reporter.on('log', this.write.bind(this));
  reporter.on('debug', this.debug.bind(this));

  reporter.on('run-init', function(config) {
    this.debug('Initialized with configuration', config);
  }.bind(this));

  reporter.on('browser-init', function(data) {
    var browser = this.setBrowser(data.browser);
    browser.status = 'initializing';
    this.updateStatus();
  }.bind(this));

  reporter.on('browser-start', function(event) {
    this.getBrowser(event.browserId).total = event.data.total;
    this.updateStatus();
  }.bind(this));

  reporter.on('test-end', function(event) {
    var state   = event.data.state;
    var browser = this.getBrowser(event.browserId);
    browser[state] = browser[state] + 1;
    if (event.data.error) {
      this.writeTestError(event);
    }
    this.updateStatus();
  }.bind(this));

  reporter.on('browser-end', function(event) {
    this.debug('browser-end', event);
    if (event.error) {
      var browser = this.getBrowser(event.browserId);
      browser.status = chalk.red('error');
      this.write(browser.pretty + ': ' + chalk.red(event.error));
    }
    this.updateStatus();
  }.bind(this));

  reporter.on('run-end', function(error) {
    this.debug('run-end', error);
    if (error) {
      this.write(chalk.red(error));
    }
  }.bind(this));
}

CliReporter.prototype.debug = function debug() {
  if (!this.verbose) return;
  this.write(chalk.dim(util.format.apply(util, arguments)));
};

function browserString(browser) {
  return chalk.blue((browser.platform ? (browser.platform + ' ') : '') +
    browser.browserName +
    (browser.version ? (' ' + browser.version) : ''));
}

CliReporter.prototype.setBrowser = function setBrowser(data) {
  this.browsers[data.id] = {
    pretty:  browserString(data),
    running: 0,
    passing: 0,
    pending: 0,
    failing: 0,
  };
  return this.browsers[data.id];
};

CliReporter.prototype.getBrowser = function getBrowser(id) {
  return this.browsers[id] || {pretty: chalk.red('unknown browser')};
}

CliReporter.prototype.writeTestError = function(event) {
  var parts = [];
  var path  = event.data.test.slice(0, event.data.test.length - 1);
  path = path.map(function(part) { return chalk.dim.blue(part); });
  path.push(chalk.yellow(event.data.test[event.data.test.length - 1]));
  this.write(this.getBrowser(event.browserId).pretty);
  this.write(chalk.red('Test Failure: ') + path.join(' » '));

  this.write(chalk.red('  ' + event.data.error.message));
  this.write(stacky.pretty(event.data.error.stack, STACKY_CONFIG));
  this.write('\n');
};

CliReporter.prototype.updateStatus = function() {
  var statuses = Object.keys(this.browsers).map(function(browserId) {
    var browser = this.browsers[browserId];
    var status;
    if (browser.total) {
      var counts = [browser.passing, browser.pending, browser.failing];
      if (counts[0] > 0) counts[0] = chalk.green(counts[0]);
      if (counts[1] > 0) counts[1] = chalk.yellow(counts[1]);
      if (counts[2] > 0) counts[2] = chalk.red(counts[2]);
      status = counts.join('/') + ' of ' + browser.total;
    } else {
      status = browser.status;
    }

    return browser.pretty + ' (' + status + ')';
  }.bind(this));

  this.writeWrapped(statuses, ',   ');
};

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

  this.writeLines(lines);

  this.stream.write('\r');
  this.stream.write('\033[' + lines.length + 'A');
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
