/*
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

var chalk = require('chalk');

var V8_LINE = /(?:(.*)@)?(.*):(\d+):(\d+)/;

// Public Interface

function parse(stack, options) {
  return stack.split('\n').map(function(line) {
    var match;
    if (match = line.match(V8_LINE)) {
      return {
        method: match[1] || '<unknown>',
        file:   cleanFile(match[2], options),
        line:   match[3],
        column: match[4],
      };
    } else {
      throw new Error('Unknown stack line format: ' + line);
    }
  });
}

function pretty(stack, options) {
  var parsed = parse(stack, options);
  var maxMethodWidth = 0;
  for (var i = 0, line; line = parsed[i]; i++) {
    maxMethodWidth = Math.max(maxMethodWidth, line.method.length);
  }

  var lines = parsed.map(function(line) {
    var pad    = (options.indent || '') + padding(maxMethodWidth - line.method.length);
    var source = [line.file, line.line, line.column].join(':');
    var text   = pad + chalk.cyan(line.method) + ' at ' + chalk.blue(source);
    if (!isImportant(line.file, options)) {
      text = chalk.dim(text);
    }
    return text;
  });

  return lines.join('\n');
}

// Utility

function cleanFile(file, options) {
  if (options.strip) {
    for (var i = 0, matcher; matcher = options.strip[i]; i++) {
      file = file.replace(matcher, '');
    }
  }

  return file;
}

function isImportant(file, options) {
  if (options.unimportant) {
    for (var i = 0, matcher; matcher = options.unimportant[i]; i++) {
      if (file.match(matcher)) return false;
    }
  }

  return true;
}

function padding(length) {
  var result = '';
  for (var i = 0; i < length; i++) {
    result = result + ' ';
  }
  return result;
}

module.exports.parse  = parse;
module.exports.pretty = pretty;
