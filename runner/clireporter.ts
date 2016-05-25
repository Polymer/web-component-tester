/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
import * as _ from 'lodash';
import * as chalk from 'chalk';
import * as cleankill from 'cleankill';
import * as stacky from 'stacky';
import * as util from 'util';
import * as events from 'events';
import * as config from './config';
import {BrowserDef, Stats} from './browserrunner';
import * as context from './context';
import * as tty from 'tty';

var STACKY_CONFIG = {
  indent: '    ',
  locationStrip: [
    /^https?:\/\/[^\/]+/,
    /\?[\d\.]+$/,
  ],
  unimportantLocation: [
    /^\/web-component-tester\//,
  ]
};

type State = 'passing' | 'pending' | 'failing' | 'unknown' | 'error';
type Formatter = (value: string)=> string;

var STATE_ICONS = {
  passing: '✓',
  pending: '✖',
  failing: '✖',
  unknown: '?',
};

var STATE_COLORS: {[state: string]: Formatter} = {
  passing: chalk.green,
  pending: chalk.yellow,
  failing: chalk.red,
  unknown: chalk.red,
  error:   chalk.red,
};


var SHORT = {
  'internet explorer': 'IE',
};

var BROWSER_PAD = 24;
var STATUS_PAD  = 38;

interface TestEndData {
  state: 'passing'|'failing'|'pending'|'unknown';
  test: string[];
  duration: number;
  error: any;
}

export class CliReporter {
  prettyBrowsers: {[id: number]: string} = {};
  browserStats: {[id: number]: Stats} = {};

  /**
   * The number of lines written the last time writeLines was called.
   */
  private linesWritten: number;

  constructor(public emitter: events.EventEmitter, public stream: NodeJS.WritableStream, public options: config.Config) {
    cleankill.onInterrupt((done) => {
      this.flush();
      done();
    });

    emitter.on('log:error', this.log.bind(this, chalk.red));

    if (!this.options.quiet) {
      emitter.on('log:warn',  this.log.bind(this, chalk.yellow));
      emitter.on('log:info',  this.log.bind(this));
      if (this.options.verbose) {
        emitter.on('log:debug', this.log.bind(this, chalk.dim));
      }
    }

    emitter.on('browser-init', (browser: BrowserDef, stats: Stats) => {
      this.browserStats[browser.id] = stats;
      this.prettyBrowsers[browser.id] = this.prettyBrowser(browser);
      this.updateStatus();
    });

    emitter.on('browser-start', (browser: BrowserDef, data: {url: string}, stats: Stats) => {
      this.browserStats[browser.id] = stats;
      this.log(browser, 'Beginning tests via', chalk.magenta(data.url));
      this.updateStatus();
    });

    emitter.on('test-end', (browser: BrowserDef, data: TestEndData, stats: Stats) => {
      this.browserStats[browser.id] = stats;
      if (data.state === 'failing') {
        this.writeTestError(browser, data);
      } else if (this.options.expanded || this.options.verbose) {
        this.log(browser, this.stateIcon(data.state), this.prettyTest(data));
      }

      this.updateStatus();
    });

    emitter.on('browser-end', (browser: BrowserDef, error: any, stats: Stats) => {
      this.browserStats[browser.id] = stats;
      if (error) {
        this.log(chalk.red, browser, 'Tests failed:', error);
      } else {
        this.log(chalk.green, browser, 'Tests passed');
      }
    });

    emitter.on('run-end', (error: any) => {
      if (error) {
        this.log(chalk.red, 'Test run ended in failure:', error);
      } else {
        this.log(chalk.green, 'Test run ended with great success');
      }

      if (!this.options.ttyOutput) {
        this.updateStatus(true);
      }
    });
  }

  // Specialized Reporting
  updateStatus(force?: boolean) {
    if (!this.options.ttyOutput && !force) return;
    // EXTREME TERMINOLOGY FAIL, but here's a glossary:
    //
    // stats:  An object containing test stats (total, passing, failing, etc).
    // state:  The state that the run is in (running, etc).
    // status: A string representation of above.
    var statuses = Object.keys(this.browserStats).map((browserIdStr) => {
      const browserId = parseInt(browserIdStr, 10);
      var pretty = this.prettyBrowsers[browserId];
      var stats  = this.browserStats[browserId];

      var status = '';
      var counts = [stats.passing, stats.pending, stats.failing];
      if (counts[0] > 0 || counts[1] > 0 || counts[2] > 0) {
        if (counts[0] > 0) counts[0] = <any>chalk.green(counts[0].toString());
        if (counts[1] > 0) counts[1] = <any>chalk.yellow(counts[1].toString());
        if (counts[2] > 0) counts[2] = <any>chalk.red(counts[2].toString());
        status = counts.join('/');
      }
      if (stats.status === 'error') {
        status = status + (status === '' ? '' : ' ') + chalk.red('error');
      }

      return padRight(pretty + ' (' + status + ')', STATUS_PAD);
    });

    this.writeWrapped(statuses, '  ');
  };

  writeTestError(browser: BrowserDef, data: TestEndData) {
    this.log(browser, this.stateIcon(data.state), this.prettyTest(data));

    var error = data.error || {};
    this.write('\n');

    var prettyMessage = error.message || error;
    if (typeof prettyMessage !== 'string') {
      prettyMessage = util.inspect(prettyMessage);
    }
    this.write(chalk.red('  ' + prettyMessage));

    if (error.stack) {
      try {
        this.write(stacky.pretty(data.error.stack, STACKY_CONFIG));
      } catch (err) {
        // If we couldn't extract a stack (i.e. there was no stack), the message
        // is enough.
      }
    }
    this.write('\n');
  };

  // Object Formatting

  stateIcon(state: State) {
    var color = STATE_COLORS[state] || STATE_COLORS['unknown'];
    return color(STATE_ICONS[state] || STATE_ICONS.unknown);
  };

  prettyTest(data: TestEndData) {
    var color = STATE_COLORS[data.state] || STATE_COLORS['unknown'];
    return color(data.test.join(' » ') || '<unknown test>');
  };

  prettyBrowser(browser: BrowserDef) {
    const parts: string[] = [];

    if (browser.platform && !browser.deviceName) {
      parts.push(browser.platform);
    }

    var name = browser.deviceName || browser.browserName;
    parts.push(SHORT[name] || name);

    if (browser.version) {
      parts.push(browser.version);
    }

    return chalk.blue(parts.join(' '));
  };

  // General Output Formatting

  log(...values: any[]):void;
  log() {
    let values = Array.prototype.slice.call(arguments);
    let format: (line: string)=> string;
    if (_.isFunction(values[0])) {
      format = values[0];
      values = values.slice(1);
    }
    if (values[0] && values[0].browserName) {
      values[0] = padRight(this.prettyBrowser(values[0]), BROWSER_PAD);
    }

    var line = _.toArray(values).map(function(value) {
      return _.isString(value) ? value : util.inspect(value);
    }).join(' ');
    line = line.replace(/[\s\n\r]+$/, '');
    if (format) line = format(line);
    this.write(line);
  };

  writeWrapped(blocks: string[], separator: string) {
    if (blocks.length === 0) return;

    var lines = [''];
    var width = (<tty.WriteStream>this.stream).columns || 0;
    for (const block of blocks) {
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

    this.writeLines(['\n'].concat(lines));
    if (this.options.ttyOutput) {
      this.stream.write('\r');
      this.stream.write('\u001b[' + (lines.length + 1) + 'A');
    }
  };

  write(line: string) {
    this.writeLines([line]);
    this.updateStatus();
  };

  writeLines(lines: string[]) {
    for (let line of lines) {
      if (line[line.length - 1] !== '\n') {
        line = line + '\n';
      }
      if (this.options.ttyOutput) {
        line = '\u001b[J' + line;
      }
      this.stream.write(line);
    }
    this.linesWritten = lines.length;
  };

  flush() {
    if (!this.options.ttyOutput) return;
    // Add an extra line for padding.
    for (var i = 0; i <= this.linesWritten; i++) {
      this.stream.write('\n');
    }
  };

  //HACK
  static CliReporter = CliReporter;
}
// Yeah, yeah.
function padRight(string: string, length: number) {
  var currLength = chalk.stripColor(string).length;
  while (currLength < length) {
    currLength = currLength + 1;
    string = string + ' ';
  }
  return string;
}


module.exports = CliReporter;
