;(function(){

// CommonJS require()

function require(p){
    var path = require.resolve(p)
      , mod = require.modules[path];
    if (!mod) throw new Error('failed to require "' + p + '"');
    if (!mod.exports) {
      mod.exports = {};
      mod.call(mod.exports, mod, mod.exports, require.relative(path));
    }
    return mod.exports;
  }

require.modules = {};

require.resolve = function (path){
    var orig = path
      , reg = path + '.js'
      , index = path + '/index.js';
    return require.modules[reg] && reg
      || require.modules[index] && index
      || orig;
  };

require.register = function (path, fn){
    require.modules[path] = fn;
  };

require.relative = function (parent) {
    return function(p){
      if ('.' != p.charAt(0)) return require(p);

      var path = parent.split('/')
        , segs = p.split('/');
      path.pop();

      for (var i = 0; i < segs.length; i++) {
        var seg = segs[i];
        if ('..' == seg) path.pop();
        else if ('.' != seg) path.push(seg);
      }

      return require(path.join('/'));
    };
  };


require.register("browser/debug.js", function(module, exports, require){

module.exports = function(type){
  return function(){
  }
};

}); // module: browser/debug.js

require.register("browser/diff.js", function(module, exports, require){
/* See LICENSE file for terms of use */

/*
 * Text diff implementation.
 *
 * This library supports the following APIS:
 * JsDiff.diffChars: Character by character diff
 * JsDiff.diffWords: Word (as defined by \b regex) diff which ignores whitespace
 * JsDiff.diffLines: Line based diff
 *
 * JsDiff.diffCss: Diff targeted at CSS content
 *
 * These methods are based on the implementation proposed in
 * "An O(ND) Difference Algorithm and its Variations" (Myers, 1986).
 * http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.4.6927
 */
var JsDiff = (function() {
  /*jshint maxparams: 5*/
  function clonePath(path) {
    return { newPos: path.newPos, components: path.components.slice(0) };
  }
  function removeEmpty(array) {
    var ret = [];
    for (var i = 0; i < array.length; i++) {
      if (array[i]) {
        ret.push(array[i]);
      }
    }
    return ret;
  }
  function escapeHTML(s) {
    var n = s;
    n = n.replace(/&/g, '&amp;');
    n = n.replace(/</g, '&lt;');
    n = n.replace(/>/g, '&gt;');
    n = n.replace(/"/g, '&quot;');

    return n;
  }

  var Diff = function(ignoreWhitespace) {
    this.ignoreWhitespace = ignoreWhitespace;
  };
  Diff.prototype = {
      diff: function(oldString, newString) {
        // Handle the identity case (this is due to unrolling editLength == 0
        if (newString === oldString) {
          return [{ value: newString }];
        }
        if (!newString) {
          return [{ value: oldString, removed: true }];
        }
        if (!oldString) {
          return [{ value: newString, added: true }];
        }

        newString = this.tokenize(newString);
        oldString = this.tokenize(oldString);

        var newLen = newString.length, oldLen = oldString.length;
        var maxEditLength = newLen + oldLen;
        var bestPath = [{ newPos: -1, components: [] }];

        // Seed editLength = 0
        var oldPos = this.extractCommon(bestPath[0], newString, oldString, 0);
        if (bestPath[0].newPos+1 >= newLen && oldPos+1 >= oldLen) {
          return bestPath[0].components;
        }

        for (var editLength = 1; editLength <= maxEditLength; editLength++) {
          for (var diagonalPath = -1*editLength; diagonalPath <= editLength; diagonalPath+=2) {
            var basePath;
            var addPath = bestPath[diagonalPath-1],
                removePath = bestPath[diagonalPath+1];
            oldPos = (removePath ? removePath.newPos : 0) - diagonalPath;
            if (addPath) {
              // No one else is going to attempt to use this value, clear it
              bestPath[diagonalPath-1] = undefined;
            }

            var canAdd = addPath && addPath.newPos+1 < newLen;
            var canRemove = removePath && 0 <= oldPos && oldPos < oldLen;
            if (!canAdd && !canRemove) {
              bestPath[diagonalPath] = undefined;
              continue;
            }

            // Select the diagonal that we want to branch from. We select the prior
            // path whose position in the new string is the farthest from the origin
            // and does not pass the bounds of the diff graph
            if (!canAdd || (canRemove && addPath.newPos < removePath.newPos)) {
              basePath = clonePath(removePath);
              this.pushComponent(basePath.components, oldString[oldPos], undefined, true);
            } else {
              basePath = clonePath(addPath);
              basePath.newPos++;
              this.pushComponent(basePath.components, newString[basePath.newPos], true, undefined);
            }

            var oldPos = this.extractCommon(basePath, newString, oldString, diagonalPath);

            if (basePath.newPos+1 >= newLen && oldPos+1 >= oldLen) {
              return basePath.components;
            } else {
              bestPath[diagonalPath] = basePath;
            }
          }
        }
      },

      pushComponent: function(components, value, added, removed) {
        var last = components[components.length-1];
        if (last && last.added === added && last.removed === removed) {
          // We need to clone here as the component clone operation is just
          // as shallow array clone
          components[components.length-1] =
            {value: this.join(last.value, value), added: added, removed: removed };
        } else {
          components.push({value: value, added: added, removed: removed });
        }
      },
      extractCommon: function(basePath, newString, oldString, diagonalPath) {
        var newLen = newString.length,
            oldLen = oldString.length,
            newPos = basePath.newPos,
            oldPos = newPos - diagonalPath;
        while (newPos+1 < newLen && oldPos+1 < oldLen && this.equals(newString[newPos+1], oldString[oldPos+1])) {
          newPos++;
          oldPos++;

          this.pushComponent(basePath.components, newString[newPos], undefined, undefined);
        }
        basePath.newPos = newPos;
        return oldPos;
      },

      equals: function(left, right) {
        var reWhitespace = /\S/;
        if (this.ignoreWhitespace && !reWhitespace.test(left) && !reWhitespace.test(right)) {
          return true;
        } else {
          return left === right;
        }
      },
      join: function(left, right) {
        return left + right;
      },
      tokenize: function(value) {
        return value;
      }
  };

  var CharDiff = new Diff();

  var WordDiff = new Diff(true);
  var WordWithSpaceDiff = new Diff();
  WordDiff.tokenize = WordWithSpaceDiff.tokenize = function(value) {
    return removeEmpty(value.split(/(\s+|\b)/));
  };

  var CssDiff = new Diff(true);
  CssDiff.tokenize = function(value) {
    return removeEmpty(value.split(/([{}:;,]|\s+)/));
  };

  var LineDiff = new Diff();
  LineDiff.tokenize = function(value) {
    return value.split(/^/m);
  };

  return {
    Diff: Diff,

    diffChars: function(oldStr, newStr) { return CharDiff.diff(oldStr, newStr); },
    diffWords: function(oldStr, newStr) { return WordDiff.diff(oldStr, newStr); },
    diffWordsWithSpace: function(oldStr, newStr) { return WordWithSpaceDiff.diff(oldStr, newStr); },
    diffLines: function(oldStr, newStr) { return LineDiff.diff(oldStr, newStr); },

    diffCss: function(oldStr, newStr) { return CssDiff.diff(oldStr, newStr); },

    createPatch: function(fileName, oldStr, newStr, oldHeader, newHeader) {
      var ret = [];

      ret.push('Index: ' + fileName);
      ret.push('===================================================================');
      ret.push('--- ' + fileName + (typeof oldHeader === 'undefined' ? '' : '\t' + oldHeader));
      ret.push('+++ ' + fileName + (typeof newHeader === 'undefined' ? '' : '\t' + newHeader));

      var diff = LineDiff.diff(oldStr, newStr);
      if (!diff[diff.length-1].value) {
        diff.pop();   // Remove trailing newline add
      }
      diff.push({value: '', lines: []});   // Append an empty value to make cleanup easier

      function contextLines(lines) {
        return lines.map(function(entry) { return ' ' + entry; });
      }
      function eofNL(curRange, i, current) {
        var last = diff[diff.length-2],
            isLast = i === diff.length-2,
            isLastOfType = i === diff.length-3 && (current.added !== last.added || current.removed !== last.removed);

        // Figure out if this is the last line for the given file and missing NL
        if (!/\n$/.test(current.value) && (isLast || isLastOfType)) {
          curRange.push('\\ No newline at end of file');
        }
      }

      var oldRangeStart = 0, newRangeStart = 0, curRange = [],
          oldLine = 1, newLine = 1;
      for (var i = 0; i < diff.length; i++) {
        var current = diff[i],
            lines = current.lines || current.value.replace(/\n$/, '').split('\n');
        current.lines = lines;

        if (current.added || current.removed) {
          if (!oldRangeStart) {
            var prev = diff[i-1];
            oldRangeStart = oldLine;
            newRangeStart = newLine;

            if (prev) {
              curRange = contextLines(prev.lines.slice(-4));
              oldRangeStart -= curRange.length;
              newRangeStart -= curRange.length;
            }
          }
          curRange.push.apply(curRange, lines.map(function(entry) { return (current.added?'+':'-') + entry; }));
          eofNL(curRange, i, current);

          if (current.added) {
            newLine += lines.length;
          } else {
            oldLine += lines.length;
          }
        } else {
          if (oldRangeStart) {
            // Close out any changes that have been output (or join overlapping)
            if (lines.length <= 8 && i < diff.length-2) {
              // Overlapping
              curRange.push.apply(curRange, contextLines(lines));
            } else {
              // end the range and output
              var contextSize = Math.min(lines.length, 4);
              ret.push(
                  '@@ -' + oldRangeStart + ',' + (oldLine-oldRangeStart+contextSize)
                  + ' +' + newRangeStart + ',' + (newLine-newRangeStart+contextSize)
                  + ' @@');
              ret.push.apply(ret, curRange);
              ret.push.apply(ret, contextLines(lines.slice(0, contextSize)));
              if (lines.length <= 4) {
                eofNL(ret, i, current);
              }

              oldRangeStart = 0;  newRangeStart = 0; curRange = [];
            }
          }
          oldLine += lines.length;
          newLine += lines.length;
        }
      }

      return ret.join('\n') + '\n';
    },

    applyPatch: function(oldStr, uniDiff) {
      var diffstr = uniDiff.split('\n');
      var diff = [];
      var remEOFNL = false,
          addEOFNL = false;

      for (var i = (diffstr[0][0]==='I'?4:0); i < diffstr.length; i++) {
        if(diffstr[i][0] === '@') {
          var meh = diffstr[i].split(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
          diff.unshift({
            start:meh[3],
            oldlength:meh[2],
            oldlines:[],
            newlength:meh[4],
            newlines:[]
          });
        } else if(diffstr[i][0] === '+') {
          diff[0].newlines.push(diffstr[i].substr(1));
        } else if(diffstr[i][0] === '-') {
          diff[0].oldlines.push(diffstr[i].substr(1));
        } else if(diffstr[i][0] === ' ') {
          diff[0].newlines.push(diffstr[i].substr(1));
          diff[0].oldlines.push(diffstr[i].substr(1));
        } else if(diffstr[i][0] === '\\') {
          if (diffstr[i-1][0] === '+') {
            remEOFNL = true;
          } else if(diffstr[i-1][0] === '-') {
            addEOFNL = true;
          }
        }
      }

      var str = oldStr.split('\n');
      for (var i = diff.length - 1; i >= 0; i--) {
        var d = diff[i];
        for (var j = 0; j < d.oldlength; j++) {
          if(str[d.start-1+j] !== d.oldlines[j]) {
            return false;
          }
        }
        Array.prototype.splice.apply(str,[d.start-1,+d.oldlength].concat(d.newlines));
      }

      if (remEOFNL) {
        while (!str[str.length-1]) {
          str.pop();
        }
      } else if (addEOFNL) {
        str.push('');
      }
      return str.join('\n');
    },

    convertChangesToXML: function(changes){
      var ret = [];
      for ( var i = 0; i < changes.length; i++) {
        var change = changes[i];
        if (change.added) {
          ret.push('<ins>');
        } else if (change.removed) {
          ret.push('<del>');
        }

        ret.push(escapeHTML(change.value));

        if (change.added) {
          ret.push('</ins>');
        } else if (change.removed) {
          ret.push('</del>');
        }
      }
      return ret.join('');
    },

    // See: http://code.google.com/p/google-diff-match-patch/wiki/API
    convertChangesToDMP: function(changes){
      var ret = [], change;
      for ( var i = 0; i < changes.length; i++) {
        change = changes[i];
        ret.push([(change.added ? 1 : change.removed ? -1 : 0), change.value]);
      }
      return ret;
    }
  };
})();

if (typeof module !== 'undefined') {
    module.exports = JsDiff;
}

}); // module: browser/diff.js

require.register("browser/events.js", function(module, exports, require){

/**
 * Module exports.
 */

exports.EventEmitter = EventEmitter;

/**
 * Check if `obj` is an array.
 */

function isArray(obj) {
  return '[object Array]' == {}.toString.call(obj);
}

/**
 * Event emitter constructor.
 *
 * @api public
 */

function EventEmitter(){};

/**
 * Adds a listener.
 *
 * @api public
 */

EventEmitter.prototype.on = function (name, fn) {
  if (!this.$events) {
    this.$events = {};
  }

  if (!this.$events[name]) {
    this.$events[name] = fn;
  } else if (isArray(this.$events[name])) {
    this.$events[name].push(fn);
  } else {
    this.$events[name] = [this.$events[name], fn];
  }

  return this;
};

EventEmitter.prototype.addListener = EventEmitter.prototype.on;

/**
 * Adds a volatile listener.
 *
 * @api public
 */

EventEmitter.prototype.once = function (name, fn) {
  var self = this;

  function on () {
    self.removeListener(name, on);
    fn.apply(this, arguments);
  };

  on.listener = fn;
  this.on(name, on);

  return this;
};

/**
 * Removes a listener.
 *
 * @api public
 */

EventEmitter.prototype.removeListener = function (name, fn) {
  if (this.$events && this.$events[name]) {
    var list = this.$events[name];

    if (isArray(list)) {
      var pos = -1;

      for (var i = 0, l = list.length; i < l; i++) {
        if (list[i] === fn || (list[i].listener && list[i].listener === fn)) {
          pos = i;
          break;
        }
      }

      if (pos < 0) {
        return this;
      }

      list.splice(pos, 1);

      if (!list.length) {
        delete this.$events[name];
      }
    } else if (list === fn || (list.listener && list.listener === fn)) {
      delete this.$events[name];
    }
  }

  return this;
};

/**
 * Removes all listeners for an event.
 *
 * @api public
 */

EventEmitter.prototype.removeAllListeners = function (name) {
  if (name === undefined) {
    this.$events = {};
    return this;
  }

  if (this.$events && this.$events[name]) {
    this.$events[name] = null;
  }

  return this;
};

/**
 * Gets all listeners for a certain event.
 *
 * @api public
 */

EventEmitter.prototype.listeners = function (name) {
  if (!this.$events) {
    this.$events = {};
  }

  if (!this.$events[name]) {
    this.$events[name] = [];
  }

  if (!isArray(this.$events[name])) {
    this.$events[name] = [this.$events[name]];
  }

  return this.$events[name];
};

/**
 * Emits an event.
 *
 * @api public
 */

EventEmitter.prototype.emit = function (name) {
  if (!this.$events) {
    return false;
  }

  var handler = this.$events[name];

  if (!handler) {
    return false;
  }

  var args = [].slice.call(arguments, 1);

  if ('function' == typeof handler) {
    handler.apply(this, args);
  } else if (isArray(handler)) {
    var listeners = handler.slice();

    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
  } else {
    return false;
  }

  return true;
};
}); // module: browser/events.js

require.register("browser/fs.js", function(module, exports, require){

}); // module: browser/fs.js

require.register("browser/path.js", function(module, exports, require){

}); // module: browser/path.js

require.register("browser/progress.js", function(module, exports, require){
/**
 * Expose `Progress`.
 */

module.exports = Progress;

/**
 * Initialize a new `Progress` indicator.
 */

function Progress() {
  this.percent = 0;
  this.size(0);
  this.fontSize(11);
  this.font('helvetica, arial, sans-serif');
}

/**
 * Set progress size to `n`.
 *
 * @param {Number} n
 * @return {Progress} for chaining
 * @api public
 */

Progress.prototype.size = function(n){
  this._size = n;
  return this;
};

/**
 * Set text to `str`.
 *
 * @param {String} str
 * @return {Progress} for chaining
 * @api public
 */

Progress.prototype.text = function(str){
  this._text = str;
  return this;
};

/**
 * Set font size to `n`.
 *
 * @param {Number} n
 * @return {Progress} for chaining
 * @api public
 */

Progress.prototype.fontSize = function(n){
  this._fontSize = n;
  return this;
};

/**
 * Set font `family`.
 *
 * @param {String} family
 * @return {Progress} for chaining
 */

Progress.prototype.font = function(family){
  this._font = family;
  return this;
};

/**
 * Update percentage to `n`.
 *
 * @param {Number} n
 * @return {Progress} for chaining
 */

Progress.prototype.update = function(n){
  this.percent = n;
  return this;
};

/**
 * Draw on `ctx`.
 *
 * @param {CanvasRenderingContext2d} ctx
 * @return {Progress} for chaining
 */

Progress.prototype.draw = function(ctx){
  try {
    var percent = Math.min(this.percent, 100)
      , size = this._size
      , half = size / 2
      , x = half
      , y = half
      , rad = half - 1
      , fontSize = this._fontSize;
  
    ctx.font = fontSize + 'px ' + this._font;
  
    var angle = Math.PI * 2 * (percent / 100);
    ctx.clearRect(0, 0, size, size);
  
    // outer circle
    ctx.strokeStyle = '#9f9f9f';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, angle, false);
    ctx.stroke();
  
    // inner circle
    ctx.strokeStyle = '#eee';
    ctx.beginPath();
    ctx.arc(x, y, rad - 1, 0, angle, true);
    ctx.stroke();
  
    // text
    var text = this._text || (percent | 0) + '%'
      , w = ctx.measureText(text).width;
  
    ctx.fillText(
        text
      , x - w / 2 + 1
      , y + fontSize / 2 - 1);
  } catch (ex) {} //don't fail if we can't render progress
  return this;
};

}); // module: browser/progress.js

require.register("browser/tty.js", function(module, exports, require){

exports.isatty = function(){
  return true;
};

exports.getWindowSize = function(){
  if ('innerHeight' in global) {
    return [global.innerHeight, global.innerWidth];
  } else {
    // In a Web Worker, the DOM Window is not available.
    return [640, 480];
  }
};

}); // module: browser/tty.js

require.register("context.js", function(module, exports, require){

/**
 * Expose `Context`.
 */

module.exports = Context;

/**
 * Initialize a new `Context`.
 *
 * @api private
 */

function Context(){}

/**
 * Set or get the context `Runnable` to `runnable`.
 *
 * @param {Runnable} runnable
 * @return {Context}
 * @api private
 */

Context.prototype.runnable = function(runnable){
  if (0 == arguments.length) return this._runnable;
  this.test = this._runnable = runnable;
  return this;
};

/**
 * Set test timeout `ms`.
 *
 * @param {Number} ms
 * @return {Context} self
 * @api private
 */

Context.prototype.timeout = function(ms){
  if (arguments.length === 0) return this.runnable().timeout();
  this.runnable().timeout(ms);
  return this;
};

/**
 * Set test timeout `enabled`.
 *
 * @param {Boolean} enabled
 * @return {Context} self
 * @api private
 */

Context.prototype.enableTimeouts = function (enabled) {
  this.runnable().enableTimeouts(enabled);
  return this;
};


/**
 * Set test slowness threshold `ms`.
 *
 * @param {Number} ms
 * @return {Context} self
 * @api private
 */

Context.prototype.slow = function(ms){
  this.runnable().slow(ms);
  return this;
};

/**
 * Inspect the context void of `._runnable`.
 *
 * @return {String}
 * @api private
 */

Context.prototype.inspect = function(){
  return JSON.stringify(this, function(key, val){
    if ('_runnable' == key) return;
    if ('test' == key) return;
    return val;
  }, 2);
};

}); // module: context.js

require.register("hook.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Runnable = require('./runnable');

/**
 * Expose `Hook`.
 */

module.exports = Hook;

/**
 * Initialize a new `Hook` with the given `title` and callback `fn`.
 *
 * @param {String} title
 * @param {Function} fn
 * @api private
 */

function Hook(title, fn) {
  Runnable.call(this, title, fn);
  this.type = 'hook';
}

/**
 * Inherit from `Runnable.prototype`.
 */

function F(){};
F.prototype = Runnable.prototype;
Hook.prototype = new F;
Hook.prototype.constructor = Hook;


/**
 * Get or set the test `err`.
 *
 * @param {Error} err
 * @return {Error}
 * @api public
 */

Hook.prototype.error = function(err){
  if (0 == arguments.length) {
    var err = this._error;
    this._error = null;
    return err;
  }

  this._error = err;
};

}); // module: hook.js

require.register("interfaces/bdd.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Suite = require('../suite')
  , Test = require('../test')
  , utils = require('../utils');

/**
 * BDD-style interface:
 *
 *      describe('Array', function(){
 *        describe('#indexOf()', function(){
 *          it('should return -1 when not present', function(){
 *
 *          });
 *
 *          it('should return the index when present', function(){
 *
 *          });
 *        });
 *      });
 *
 */

module.exports = function(suite){
  var suites = [suite];

  suite.on('pre-require', function(context, file, mocha){

    /**
     * Execute before running tests.
     */

    context.before = function(name, fn){
      suites[0].beforeAll(name, fn);
    };

    /**
     * Execute after running tests.
     */

    context.after = function(name, fn){
      suites[0].afterAll(name, fn);
    };

    /**
     * Execute before each test case.
     */

    context.beforeEach = function(name, fn){
      suites[0].beforeEach(name, fn);
    };

    /**
     * Execute after each test case.
     */

    context.afterEach = function(name, fn){
      suites[0].afterEach(name, fn);
    };

    /**
     * Describe a "suite" with the given `title`
     * and callback `fn` containing nested suites
     * and/or tests.
     */

    context.describe = context.context = function(title, fn){
      var suite = Suite.create(suites[0], title);
      suite.file = file;
      suites.unshift(suite);
      fn.call(suite);
      suites.shift();
      return suite;
    };

    /**
     * Pending describe.
     */

    context.xdescribe =
    context.xcontext =
    context.describe.skip = function(title, fn){
      var suite = Suite.create(suites[0], title);
      suite.pending = true;
      suites.unshift(suite);
      fn.call(suite);
      suites.shift();
    };

    /**
     * Exclusive suite.
     */

    context.describe.only = function(title, fn){
      var suite = context.describe(title, fn);
      mocha.grep(suite.fullTitle());
      return suite;
    };

    /**
     * Describe a specification or test-case
     * with the given `title` and callback `fn`
     * acting as a thunk.
     */

    context.it = context.specify = function(title, fn){
      var suite = suites[0];
      if (suite.pending) var fn = null;
      var test = new Test(title, fn);
      test.file = file;
      suite.addTest(test);
      return test;
    };

    /**
     * Exclusive test-case.
     */

    context.it.only = function(title, fn){
      var test = context.it(title, fn);
      var reString = '^' + utils.escapeRegexp(test.fullTitle()) + '$';
      mocha.grep(new RegExp(reString));
      return test;
    };

    /**
     * Pending test case.
     */

    context.xit =
    context.xspecify =
    context.it.skip = function(title){
      context.it(title);
    };
  });
};

}); // module: interfaces/bdd.js

require.register("interfaces/exports.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Suite = require('../suite')
  , Test = require('../test');

/**
 * TDD-style interface:
 *
 *     exports.Array = {
 *       '#indexOf()': {
 *         'should return -1 when the value is not present': function(){
 *
 *         },
 *
 *         'should return the correct index when the value is present': function(){
 *
 *         }
 *       }
 *     };
 *
 */

module.exports = function(suite){
  var suites = [suite];

  suite.on('require', visit);

  function visit(obj, file) {
    var suite;
    for (var key in obj) {
      if ('function' == typeof obj[key]) {
        var fn = obj[key];
        switch (key) {
          case 'before':
            suites[0].beforeAll(fn);
            break;
          case 'after':
            suites[0].afterAll(fn);
            break;
          case 'beforeEach':
            suites[0].beforeEach(fn);
            break;
          case 'afterEach':
            suites[0].afterEach(fn);
            break;
          default:
            var test = new Test(key, fn);
            test.file = file;
            suites[0].addTest(test);
        }
      } else {
        var suite = Suite.create(suites[0], key);
        suites.unshift(suite);
        visit(obj[key]);
        suites.shift();
      }
    }
  }
};

}); // module: interfaces/exports.js

require.register("interfaces/index.js", function(module, exports, require){

exports.bdd = require('./bdd');
exports.tdd = require('./tdd');
exports.qunit = require('./qunit');
exports.exports = require('./exports');

}); // module: interfaces/index.js

require.register("interfaces/qunit.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Suite = require('../suite')
  , Test = require('../test')
  , utils = require('../utils');

/**
 * QUnit-style interface:
 *
 *     suite('Array');
 *
 *     test('#length', function(){
 *       var arr = [1,2,3];
 *       ok(arr.length == 3);
 *     });
 *
 *     test('#indexOf()', function(){
 *       var arr = [1,2,3];
 *       ok(arr.indexOf(1) == 0);
 *       ok(arr.indexOf(2) == 1);
 *       ok(arr.indexOf(3) == 2);
 *     });
 *
 *     suite('String');
 *
 *     test('#length', function(){
 *       ok('foo'.length == 3);
 *     });
 *
 */

module.exports = function(suite){
  var suites = [suite];

  suite.on('pre-require', function(context, file, mocha){

    /**
     * Execute before running tests.
     */

    context.before = function(name, fn){
      suites[0].beforeAll(name, fn);
    };

    /**
     * Execute after running tests.
     */

    context.after = function(name, fn){
      suites[0].afterAll(name, fn);
    };

    /**
     * Execute before each test case.
     */

    context.beforeEach = function(name, fn){
      suites[0].beforeEach(name, fn);
    };

    /**
     * Execute after each test case.
     */

    context.afterEach = function(name, fn){
      suites[0].afterEach(name, fn);
    };

    /**
     * Describe a "suite" with the given `title`.
     */

    context.suite = function(title){
      if (suites.length > 1) suites.shift();
      var suite = Suite.create(suites[0], title);
      suite.file = file;
      suites.unshift(suite);
      return suite;
    };

    /**
     * Exclusive test-case.
     */

    context.suite.only = function(title, fn){
      var suite = context.suite(title, fn);
      mocha.grep(suite.fullTitle());
    };

    /**
     * Describe a specification or test-case
     * with the given `title` and callback `fn`
     * acting as a thunk.
     */

    context.test = function(title, fn){
      var test = new Test(title, fn);
      test.file = file;
      suites[0].addTest(test);
      return test;
    };

    /**
     * Exclusive test-case.
     */

    context.test.only = function(title, fn){
      var test = context.test(title, fn);
      var reString = '^' + utils.escapeRegexp(test.fullTitle()) + '$';
      mocha.grep(new RegExp(reString));
    };

    /**
     * Pending test case.
     */

    context.test.skip = function(title){
      context.test(title);
    };
  });
};

}); // module: interfaces/qunit.js

require.register("interfaces/tdd.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Suite = require('../suite')
  , Test = require('../test')
  , utils = require('../utils');;

/**
 * TDD-style interface:
 *
 *      suite('Array', function(){
 *        suite('#indexOf()', function(){
 *          suiteSetup(function(){
 *
 *          });
 *
 *          test('should return -1 when not present', function(){
 *
 *          });
 *
 *          test('should return the index when present', function(){
 *
 *          });
 *
 *          suiteTeardown(function(){
 *
 *          });
 *        });
 *      });
 *
 */

module.exports = function(suite){
  var suites = [suite];

  suite.on('pre-require', function(context, file, mocha){

    /**
     * Execute before each test case.
     */

    context.setup = function(name, fn){
      suites[0].beforeEach(name, fn);
    };

    /**
     * Execute after each test case.
     */

    context.teardown = function(name, fn){
      suites[0].afterEach(name, fn);
    };

    /**
     * Execute before the suite.
     */

    context.suiteSetup = function(name, fn){
      suites[0].beforeAll(name, fn);
    };

    /**
     * Execute after the suite.
     */

    context.suiteTeardown = function(name, fn){
      suites[0].afterAll(name, fn);
    };

    /**
     * Describe a "suite" with the given `title`
     * and callback `fn` containing nested suites
     * and/or tests.
     */

    context.suite = function(title, fn){
      var suite = Suite.create(suites[0], title);
      suite.file = file;
      suites.unshift(suite);
      fn.call(suite);
      suites.shift();
      return suite;
    };

    /**
     * Pending suite.
     */
    context.suite.skip = function(title, fn) {
      var suite = Suite.create(suites[0], title);
      suite.pending = true;
      suites.unshift(suite);
      fn.call(suite);
      suites.shift();
    };

    /**
     * Exclusive test-case.
     */

    context.suite.only = function(title, fn){
      var suite = context.suite(title, fn);
      mocha.grep(suite.fullTitle());
    };

    /**
     * Describe a specification or test-case
     * with the given `title` and callback `fn`
     * acting as a thunk.
     */

    context.test = function(title, fn){
      var suite = suites[0];
      if (suite.pending) var fn = null;
      var test = new Test(title, fn);
      test.file = file;
      suite.addTest(test);
      return test;
    };

    /**
     * Exclusive test-case.
     */

    context.test.only = function(title, fn){
      var test = context.test(title, fn);
      var reString = '^' + utils.escapeRegexp(test.fullTitle()) + '$';
      mocha.grep(new RegExp(reString));
    };

    /**
     * Pending test case.
     */

    context.test.skip = function(title){
      context.test(title);
    };
  });
};

}); // module: interfaces/tdd.js

require.register("mocha.js", function(module, exports, require){
/*!
 * mocha
 * Copyright(c) 2011 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var path = require('browser/path')
  , utils = require('./utils');

/**
 * Expose `Mocha`.
 */

exports = module.exports = Mocha;

/**
 * To require local UIs and reporters when running in node.
 */

if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
  var join = path.join
    , cwd = process.cwd();
  module.paths.push(cwd, join(cwd, 'node_modules'));
}

/**
 * Expose internals.
 */

exports.utils = utils;
exports.interfaces = require('./interfaces');
exports.reporters = require('./reporters');
exports.Runnable = require('./runnable');
exports.Context = require('./context');
exports.Runner = require('./runner');
exports.Suite = require('./suite');
exports.Hook = require('./hook');
exports.Test = require('./test');

/**
 * Return image `name` path.
 *
 * @param {String} name
 * @return {String}
 * @api private
 */

function image(name) {
  return __dirname + '/../images/' + name + '.png';
}

/**
 * Setup mocha with `options`.
 *
 * Options:
 *
 *   - `ui` name "bdd", "tdd", "exports" etc
 *   - `reporter` reporter instance, defaults to `mocha.reporters.spec`
 *   - `globals` array of accepted globals
 *   - `timeout` timeout in milliseconds
 *   - `bail` bail on the first test failure
 *   - `slow` milliseconds to wait before considering a test slow
 *   - `ignoreLeaks` ignore global leaks
 *   - `grep` string or regexp to filter tests with
 *
 * @param {Object} options
 * @api public
 */

function Mocha(options) {
  options = options || {};
  this.files = [];
  this.options = options;
  this.grep(options.grep);
  this.suite = new exports.Suite('', new exports.Context);
  this.ui(options.ui);
  this.bail(options.bail);
  this.reporter(options.reporter);
  if (null != options.timeout) this.timeout(options.timeout);
  this.useColors(options.useColors)
  if (options.enableTimeouts !== null) this.enableTimeouts(options.enableTimeouts);
  if (options.slow) this.slow(options.slow);

  this.suite.on('pre-require', function (context) {
    exports.afterEach = context.afterEach || context.teardown;
    exports.after = context.after || context.suiteTeardown;
    exports.beforeEach = context.beforeEach || context.setup;
    exports.before = context.before || context.suiteSetup;
    exports.describe = context.describe || context.suite;
    exports.it = context.it || context.test;
    exports.setup = context.setup || context.beforeEach;
    exports.suiteSetup = context.suiteSetup || context.before;
    exports.suiteTeardown = context.suiteTeardown || context.after;
    exports.suite = context.suite || context.describe;
    exports.teardown = context.teardown || context.afterEach;
    exports.test = context.test || context.it;
  });
}

/**
 * Enable or disable bailing on the first failure.
 *
 * @param {Boolean} [bail]
 * @api public
 */

Mocha.prototype.bail = function(bail){
  if (0 == arguments.length) bail = true;
  this.suite.bail(bail);
  return this;
};

/**
 * Add test `file`.
 *
 * @param {String} file
 * @api public
 */

Mocha.prototype.addFile = function(file){
  this.files.push(file);
  return this;
};

/**
 * Set reporter to `reporter`, defaults to "spec".
 *
 * @param {String|Function} reporter name or constructor
 * @api public
 */

Mocha.prototype.reporter = function(reporter){
  if ('function' == typeof reporter) {
    this._reporter = reporter;
  } else {
    reporter = reporter || 'spec';
    var _reporter;
    try { _reporter = require('./reporters/' + reporter); } catch (err) {};
    if (!_reporter) try { _reporter = require(reporter); } catch (err) {};
    if (!_reporter && reporter === 'teamcity')
      console.warn('The Teamcity reporter was moved to a package named ' +
        'mocha-teamcity-reporter ' +
        '(https://npmjs.org/package/mocha-teamcity-reporter).');
    if (!_reporter) throw new Error('invalid reporter "' + reporter + '"');
    this._reporter = _reporter;
  }
  return this;
};

/**
 * Set test UI `name`, defaults to "bdd".
 *
 * @param {String} bdd
 * @api public
 */

Mocha.prototype.ui = function(name){
  name = name || 'bdd';
  this._ui = exports.interfaces[name];
  if (!this._ui) try { this._ui = require(name); } catch (err) {};
  if (!this._ui) throw new Error('invalid interface "' + name + '"');
  this._ui = this._ui(this.suite);
  return this;
};

/**
 * Load registered files.
 *
 * @api private
 */

Mocha.prototype.loadFiles = function(fn){
  var self = this;
  var suite = this.suite;
  var pending = this.files.length;
  this.files.forEach(function(file){
    file = path.resolve(file);
    suite.emit('pre-require', global, file, self);
    suite.emit('require', require(file), file, self);
    suite.emit('post-require', global, file, self);
    --pending || (fn && fn());
  });
};

/**
 * Enable growl support.
 *
 * @api private
 */

Mocha.prototype._growl = function(runner, reporter) {
  var notify = require('growl');

  runner.on('end', function(){
    var stats = reporter.stats;
    if (stats.failures) {
      var msg = stats.failures + ' of ' + runner.total + ' tests failed';
      notify(msg, { name: 'mocha', title: 'Failed', image: image('error') });
    } else {
      notify(stats.passes + ' tests passed in ' + stats.duration + 'ms', {
          name: 'mocha'
        , title: 'Passed'
        , image: image('ok')
      });
    }
  });
};

/**
 * Add regexp to grep, if `re` is a string it is escaped.
 *
 * @param {RegExp|String} re
 * @return {Mocha}
 * @api public
 */

Mocha.prototype.grep = function(re){
  this.options.grep = 'string' == typeof re
    ? new RegExp(utils.escapeRegexp(re))
    : re;
  return this;
};

/**
 * Invert `.grep()` matches.
 *
 * @return {Mocha}
 * @api public
 */

Mocha.prototype.invert = function(){
  this.options.invert = true;
  return this;
};

/**
 * Ignore global leaks.
 *
 * @param {Boolean} ignore
 * @return {Mocha}
 * @api public
 */

Mocha.prototype.ignoreLeaks = function(ignore){
  this.options.ignoreLeaks = !!ignore;
  return this;
};

/**
 * Enable global leak checking.
 *
 * @return {Mocha}
 * @api public
 */

Mocha.prototype.checkLeaks = function(){
  this.options.ignoreLeaks = false;
  return this;
};

/**
 * Enable growl support.
 *
 * @return {Mocha}
 * @api public
 */

Mocha.prototype.growl = function(){
  this.options.growl = true;
  return this;
};

/**
 * Ignore `globals` array or string.
 *
 * @param {Array|String} globals
 * @return {Mocha}
 * @api public
 */

Mocha.prototype.globals = function(globals){
  this.options.globals = (this.options.globals || []).concat(globals);
  return this;
};

/**
 * Emit color output.
 *
 * @param {Boolean} colors
 * @return {Mocha}
 * @api public
 */

Mocha.prototype.useColors = function(colors){
  this.options.useColors = arguments.length && colors != undefined
    ? colors
    : true;
  return this;
};

/**
 * Use inline diffs rather than +/-.
 *
 * @param {Boolean} inlineDiffs
 * @return {Mocha}
 * @api public
 */

Mocha.prototype.useInlineDiffs = function(inlineDiffs) {
  this.options.useInlineDiffs = arguments.length && inlineDiffs != undefined
  ? inlineDiffs
  : false;
  return this;
};

/**
 * Set the timeout in milliseconds.
 *
 * @param {Number} timeout
 * @return {Mocha}
 * @api public
 */

Mocha.prototype.timeout = function(timeout){
  this.suite.timeout(timeout);
  return this;
};

/**
 * Set slowness threshold in milliseconds.
 *
 * @param {Number} slow
 * @return {Mocha}
 * @api public
 */

Mocha.prototype.slow = function(slow){
  this.suite.slow(slow);
  return this;
};

/**
 * Enable timeouts.
 *
 * @param {Boolean} enabled
 * @return {Mocha}
 * @api public
 */

Mocha.prototype.enableTimeouts = function(enabled) {
  this.suite.enableTimeouts(arguments.length && enabled !== undefined
    ? enabled
    : true);
  return this
};

/**
 * Makes all tests async (accepting a callback)
 *
 * @return {Mocha}
 * @api public
 */

Mocha.prototype.asyncOnly = function(){
  this.options.asyncOnly = true;
  return this;
};

/**
 * Run tests and invoke `fn()` when complete.
 *
 * @param {Function} fn
 * @return {Runner}
 * @api public
 */

Mocha.prototype.run = function(fn){
  if (this.files.length) this.loadFiles();
  var suite = this.suite;
  var options = this.options;
  options.files = this.files;
  var runner = new exports.Runner(suite);
  var reporter = new this._reporter(runner, options);
  runner.ignoreLeaks = false !== options.ignoreLeaks;
  runner.asyncOnly = options.asyncOnly;
  if (options.grep) runner.grep(options.grep, options.invert);
  if (options.globals) runner.globals(options.globals);
  if (options.growl) this._growl(runner, reporter);
  exports.reporters.Base.useColors = options.useColors;
  exports.reporters.Base.inlineDiffs = options.useInlineDiffs;
  return runner.run(fn);
};

}); // module: mocha.js

require.register("ms.js", function(module, exports, require){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long ? longFormat(val) : shortFormat(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  var match = /^((?:\d+)?\.?\d+) *(ms|seconds?|s|minutes?|m|hours?|h|days?|d|years?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 's':
      return n * s;
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function shortFormat(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function longFormat(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

}); // module: ms.js

require.register("reporters/base.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var tty = require('browser/tty')
  , diff = require('browser/diff')
  , ms = require('../ms')
  , utils = require('../utils');

/**
 * Save timer references to avoid Sinon interfering (see GH-237).
 */

var Date = global.Date
  , setTimeout = global.setTimeout
  , setInterval = global.setInterval
  , clearTimeout = global.clearTimeout
  , clearInterval = global.clearInterval;

/**
 * Check if both stdio streams are associated with a tty.
 */

var isatty = tty.isatty(1) && tty.isatty(2);

/**
 * Expose `Base`.
 */

exports = module.exports = Base;

/**
 * Enable coloring by default.
 */

exports.useColors = isatty || (process.env.MOCHA_COLORS !== undefined);

/**
 * Inline diffs instead of +/-
 */

exports.inlineDiffs = false;

/**
 * Default color map.
 */

exports.colors = {
    'pass': 90
  , 'fail': 31
  , 'bright pass': 92
  , 'bright fail': 91
  , 'bright yellow': 93
  , 'pending': 36
  , 'suite': 0
  , 'error title': 0
  , 'error message': 31
  , 'error stack': 90
  , 'checkmark': 32
  , 'fast': 90
  , 'medium': 33
  , 'slow': 31
  , 'green': 32
  , 'light': 90
  , 'diff gutter': 90
  , 'diff added': 42
  , 'diff removed': 41
};

/**
 * Default symbol map.
 */

exports.symbols = {
  ok: '✓',
  err: '✖',
  dot: '․'
};

// With node.js on Windows: use symbols available in terminal default fonts
if ('win32' == process.platform) {
  exports.symbols.ok = '\u221A';
  exports.symbols.err = '\u00D7';
  exports.symbols.dot = '.';
}

/**
 * Color `str` with the given `type`,
 * allowing colors to be disabled,
 * as well as user-defined color
 * schemes.
 *
 * @param {String} type
 * @param {String} str
 * @return {String}
 * @api private
 */

var color = exports.color = function(type, str) {
  if (!exports.useColors) return str;
  return '\u001b[' + exports.colors[type] + 'm' + str + '\u001b[0m';
};

/**
 * Expose term window size, with some
 * defaults for when stderr is not a tty.
 */

exports.window = {
  width: isatty
    ? process.stdout.getWindowSize
      ? process.stdout.getWindowSize(1)[0]
      : tty.getWindowSize()[1]
    : 75
};

/**
 * Expose some basic cursor interactions
 * that are common among reporters.
 */

exports.cursor = {
  hide: function(){
    isatty && process.stdout.write('\u001b[?25l');
  },

  show: function(){
    isatty && process.stdout.write('\u001b[?25h');
  },

  deleteLine: function(){
    isatty && process.stdout.write('\u001b[2K');
  },

  beginningOfLine: function(){
    isatty && process.stdout.write('\u001b[0G');
  },

  CR: function(){
    if (isatty) {
      exports.cursor.deleteLine();
      exports.cursor.beginningOfLine();
    } else {
      process.stdout.write('\r');
    }
  }
};

/**
 * Outut the given `failures` as a list.
 *
 * @param {Array} failures
 * @api public
 */

exports.list = function(failures){
  console.error();
  failures.forEach(function(test, i){
    // format
    var fmt = color('error title', '  %s) %s:\n')
      + color('error message', '     %s')
      + color('error stack', '\n%s\n');

    // msg
    var err = test.err
      , message = err.message || ''
      , stack = err.stack || message
      , index = stack.indexOf(message) + message.length
      , msg = stack.slice(0, index)
      , actual = err.actual
      , expected = err.expected
      , escape = true;

    // uncaught
    if (err.uncaught) {
      msg = 'Uncaught ' + msg;
    }

    // explicitly show diff
    if (err.showDiff && sameType(actual, expected)) {
      escape = false;
      err.actual = actual = utils.stringify(actual);
      err.expected = expected = utils.stringify(expected);
    }

    // actual / expected diff
    if ('string' == typeof actual && 'string' == typeof expected) {
      fmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
      var match = message.match(/^([^:]+): expected/);
      msg = '\n      ' + color('error message', match ? match[1] : msg);

      if (exports.inlineDiffs) {
        msg += inlineDiff(err, escape);
      } else {
        msg += unifiedDiff(err, escape);
      }
    }

    // indent stack trace without msg
    stack = stack.slice(index ? index + 1 : index)
      .replace(/^/gm, '  ');

    console.error(fmt, (i + 1), test.fullTitle(), msg, stack);
  });
};

/**
 * Initialize a new `Base` reporter.
 *
 * All other reporters generally
 * inherit from this reporter, providing
 * stats such as test duration, number
 * of tests passed / failed etc.
 *
 * @param {Runner} runner
 * @api public
 */

function Base(runner) {
  var self = this
    , stats = this.stats = { suites: 0, tests: 0, passes: 0, pending: 0, failures: 0 }
    , failures = this.failures = [];

  if (!runner) return;
  this.runner = runner;

  runner.stats = stats;

  runner.on('start', function(){
    stats.start = new Date;
  });

  runner.on('suite', function(suite){
    stats.suites = stats.suites || 0;
    suite.root || stats.suites++;
  });

  runner.on('test end', function(test){
    stats.tests = stats.tests || 0;
    stats.tests++;
  });

  runner.on('pass', function(test){
    stats.passes = stats.passes || 0;

    var medium = test.slow() / 2;
    test.speed = test.duration > test.slow()
      ? 'slow'
      : test.duration > medium
        ? 'medium'
        : 'fast';

    stats.passes++;
  });

  runner.on('fail', function(test, err){
    stats.failures = stats.failures || 0;
    stats.failures++;
    test.err = err;
    failures.push(test);
  });

  runner.on('end', function(){
    stats.end = new Date;
    stats.duration = new Date - stats.start;
  });

  runner.on('pending', function(){
    stats.pending++;
  });
}

/**
 * Output common epilogue used by many of
 * the bundled reporters.
 *
 * @api public
 */

Base.prototype.epilogue = function(){
  var stats = this.stats;
  var tests;
  var fmt;

  console.log();

  // passes
  fmt = color('bright pass', ' ')
    + color('green', ' %d passing')
    + color('light', ' (%s)');

  console.log(fmt,
    stats.passes || 0,
    ms(stats.duration));

  // pending
  if (stats.pending) {
    fmt = color('pending', ' ')
      + color('pending', ' %d pending');

    console.log(fmt, stats.pending);
  }

  // failures
  if (stats.failures) {
    fmt = color('fail', '  %d failing');

    console.error(fmt,
      stats.failures);

    Base.list(this.failures);
    console.error();
  }

  console.log();
};

/**
 * Pad the given `str` to `len`.
 *
 * @param {String} str
 * @param {String} len
 * @return {String}
 * @api private
 */

function pad(str, len) {
  str = String(str);
  return Array(len - str.length + 1).join(' ') + str;
}


/**
 * Returns an inline diff between 2 strings with coloured ANSI output
 *
 * @param {Error} Error with actual/expected
 * @return {String} Diff
 * @api private
 */

function inlineDiff(err, escape) {
  var msg = errorDiff(err, 'WordsWithSpace', escape);

  // linenos
  var lines = msg.split('\n');
  if (lines.length > 4) {
    var width = String(lines.length).length;
    msg = lines.map(function(str, i){
      return pad(++i, width) + ' |' + ' ' + str;
    }).join('\n');
  }

  // legend
  msg = '\n'
    + color('diff removed', 'actual')
    + ' '
    + color('diff added', 'expected')
    + '\n\n'
    + msg
    + '\n';

  // indent
  msg = msg.replace(/^/gm, '      ');
  return msg;
}

/**
 * Returns a unified diff between 2 strings
 *
 * @param {Error} Error with actual/expected
 * @return {String} Diff
 * @api private
 */

function unifiedDiff(err, escape) {
  var indent = '      ';
  function cleanUp(line) {
    if (escape) {
      line = escapeInvisibles(line);
    }
    if (line[0] === '+') return indent + colorLines('diff added', line);
    if (line[0] === '-') return indent + colorLines('diff removed', line);
    if (line.match(/\@\@/)) return null;
    if (line.match(/\\ No newline/)) return null;
    else return indent + line;
  }
  function notBlank(line) {
    return line != null;
  }
  msg = diff.createPatch('string', err.actual, err.expected);
  var lines = msg.split('\n').splice(4);
  return '\n      '
         + colorLines('diff added',   '+ expected') + ' '
         + colorLines('diff removed', '- actual')
         + '\n\n'
         + lines.map(cleanUp).filter(notBlank).join('\n');
}

/**
 * Return a character diff for `err`.
 *
 * @param {Error} err
 * @return {String}
 * @api private
 */

function errorDiff(err, type, escape) {
  var actual   = escape ? escapeInvisibles(err.actual)   : err.actual;
  var expected = escape ? escapeInvisibles(err.expected) : err.expected;
  return diff['diff' + type](actual, expected).map(function(str){
    if (str.added) return colorLines('diff added', str.value);
    if (str.removed) return colorLines('diff removed', str.value);
    return str.value;
  }).join('');
}

/**
 * Returns a string with all invisible characters in plain text
 *
 * @param {String} line
 * @return {String}
 * @api private
 */
function escapeInvisibles(line) {
    return line.replace(/\t/g, '<tab>')
               .replace(/\r/g, '<CR>')
               .replace(/\n/g, '<LF>\n');
}

/**
 * Color lines for `str`, using the color `name`.
 *
 * @param {String} name
 * @param {String} str
 * @return {String}
 * @api private
 */

function colorLines(name, str) {
  return str.split('\n').map(function(str){
    return color(name, str);
  }).join('\n');
}

/**
 * Check that a / b have the same type.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {Boolean}
 * @api private
 */

function sameType(a, b) {
  a = Object.prototype.toString.call(a);
  b = Object.prototype.toString.call(b);
  return a == b;
}

}); // module: reporters/base.js

require.register("reporters/doc.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Base = require('./base')
  , utils = require('../utils');

/**
 * Expose `Doc`.
 */

exports = module.exports = Doc;

/**
 * Initialize a new `Doc` reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function Doc(runner) {
  Base.call(this, runner);

  var self = this
    , stats = this.stats
    , total = runner.total
    , indents = 2;

  function indent() {
    return Array(indents).join('  ');
  }

  runner.on('suite', function(suite){
    if (suite.root) return;
    ++indents;
    console.log('%s<section class="suite">', indent());
    ++indents;
    console.log('%s<h1>%s</h1>', indent(), utils.escape(suite.title));
    console.log('%s<dl>', indent());
  });

  runner.on('suite end', function(suite){
    if (suite.root) return;
    console.log('%s</dl>', indent());
    --indents;
    console.log('%s</section>', indent());
    --indents;
  });

  runner.on('pass', function(test){
    console.log('%s  <dt>%s</dt>', indent(), utils.escape(test.title));
    var code = utils.escape(utils.clean(test.fn.toString()));
    console.log('%s  <dd><pre><code>%s</code></pre></dd>', indent(), code);
  });

  runner.on('fail', function(test, err){
    console.log('%s  <dt class="error">%s</dt>', indent(), utils.escape(test.title));
    var code = utils.escape(utils.clean(test.fn.toString()));
    console.log('%s  <dd class="error"><pre><code>%s</code></pre></dd>', indent(), code);
    console.log('%s  <dd class="error">%s</dd>', indent(), utils.escape(err));
  });
}

}); // module: reporters/doc.js

require.register("reporters/dot.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Base = require('./base')
  , color = Base.color;

/**
 * Expose `Dot`.
 */

exports = module.exports = Dot;

/**
 * Initialize a new `Dot` matrix test reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function Dot(runner) {
  Base.call(this, runner);

  var self = this
    , stats = this.stats
    , width = Base.window.width * .75 | 0
    , n = -1;

  runner.on('start', function(){
    process.stdout.write('\n  ');
  });

  runner.on('pending', function(test){
    if (++n % width == 0) process.stdout.write('\n  ');
    process.stdout.write(color('pending', Base.symbols.dot));
  });

  runner.on('pass', function(test){
    if (++n % width == 0) process.stdout.write('\n  ');
    if ('slow' == test.speed) {
      process.stdout.write(color('bright yellow', Base.symbols.dot));
    } else {
      process.stdout.write(color(test.speed, Base.symbols.dot));
    }
  });

  runner.on('fail', function(test, err){
    if (++n % width == 0) process.stdout.write('\n  ');
    process.stdout.write(color('fail', Base.symbols.dot));
  });

  runner.on('end', function(){
    console.log();
    self.epilogue();
  });
}

/**
 * Inherit from `Base.prototype`.
 */

function F(){};
F.prototype = Base.prototype;
Dot.prototype = new F;
Dot.prototype.constructor = Dot;


}); // module: reporters/dot.js

require.register("reporters/html-cov.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var JSONCov = require('./json-cov')
  , fs = require('browser/fs');

/**
 * Expose `HTMLCov`.
 */

exports = module.exports = HTMLCov;

/**
 * Initialize a new `JsCoverage` reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function HTMLCov(runner) {
  var jade = require('jade')
    , file = __dirname + '/templates/coverage.jade'
    , str = fs.readFileSync(file, 'utf8')
    , fn = jade.compile(str, { filename: file })
    , self = this;

  JSONCov.call(this, runner, false);

  runner.on('end', function(){
    process.stdout.write(fn({
        cov: self.cov
      , coverageClass: coverageClass
    }));
  });
}

/**
 * Return coverage class for `n`.
 *
 * @return {String}
 * @api private
 */

function coverageClass(n) {
  if (n >= 75) return 'high';
  if (n >= 50) return 'medium';
  if (n >= 25) return 'low';
  return 'terrible';
}
}); // module: reporters/html-cov.js

require.register("reporters/html.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Base = require('./base')
  , utils = require('../utils')
  , Progress = require('../browser/progress')
  , escape = utils.escape;

/**
 * Save timer references to avoid Sinon interfering (see GH-237).
 */

var Date = global.Date
  , setTimeout = global.setTimeout
  , setInterval = global.setInterval
  , clearTimeout = global.clearTimeout
  , clearInterval = global.clearInterval;

/**
 * Expose `HTML`.
 */

exports = module.exports = HTML;

/**
 * Stats template.
 */

var statsTemplate = '<ul id="mocha-stats">'
  + '<li class="progress"><canvas width="40" height="40"></canvas></li>'
  + '<li class="passes"><a href="#">passes:</a> <em>0</em></li>'
  + '<li class="failures"><a href="#">failures:</a> <em>0</em></li>'
  + '<li class="duration">duration: <em>0</em>s</li>'
  + '</ul>';

/**
 * Initialize a new `HTML` reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function HTML(runner) {
  Base.call(this, runner);

  var self = this
    , stats = this.stats
    , total = runner.total
    , stat = fragment(statsTemplate)
    , items = stat.getElementsByTagName('li')
    , passes = items[1].getElementsByTagName('em')[0]
    , passesLink = items[1].getElementsByTagName('a')[0]
    , failures = items[2].getElementsByTagName('em')[0]
    , failuresLink = items[2].getElementsByTagName('a')[0]
    , duration = items[3].getElementsByTagName('em')[0]
    , canvas = stat.getElementsByTagName('canvas')[0]
    , report = fragment('<ul id="mocha-report"></ul>')
    , stack = [report]
    , progress
    , ctx
    , root = document.getElementById('mocha');

  if (canvas.getContext) {
    var ratio = window.devicePixelRatio || 1;
    canvas.style.width = canvas.width;
    canvas.style.height = canvas.height;
    canvas.width *= ratio;
    canvas.height *= ratio;
    ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    progress = new Progress;
  }

  if (!root) return error('#mocha div missing, add it to your document');

  // pass toggle
  on(passesLink, 'click', function(){
    unhide();
    var name = /pass/.test(report.className) ? '' : ' pass';
    report.className = report.className.replace(/fail|pass/g, '') + name;
    if (report.className.trim()) hideSuitesWithout('test pass');
  });

  // failure toggle
  on(failuresLink, 'click', function(){
    unhide();
    var name = /fail/.test(report.className) ? '' : ' fail';
    report.className = report.className.replace(/fail|pass/g, '') + name;
    if (report.className.trim()) hideSuitesWithout('test fail');
  });

  root.appendChild(stat);
  root.appendChild(report);

  if (progress) progress.size(40);

  runner.on('suite', function(suite){
    if (suite.root) return;

    // suite
    var url = self.suiteURL(suite);
    var el = fragment('<li class="suite"><h1><a href="%s">%s</a></h1></li>', url, escape(suite.title));

    // container
    stack[0].appendChild(el);
    stack.unshift(document.createElement('ul'));
    el.appendChild(stack[0]);
  });

  runner.on('suite end', function(suite){
    if (suite.root) return;
    stack.shift();
  });

  runner.on('fail', function(test, err){
    if ('hook' == test.type) runner.emit('test end', test);
  });

  runner.on('test end', function(test){
    // TODO: add to stats
    var percent = stats.tests / this.total * 100 | 0;
    if (progress) progress.update(percent).draw(ctx);

    // update stats
    var ms = new Date - stats.start;
    text(passes, stats.passes);
    text(failures, stats.failures);
    text(duration, (ms / 1000).toFixed(2));

    // test
    if ('passed' == test.state) {
      var url = self.testURL(test);
      var el = fragment('<li class="test pass %e"><h2>%e<span class="duration">%ems</span> <a href="%s" class="replay">‣</a></h2></li>', test.speed, test.title, test.duration, url);
    } else if (test.pending) {
      var el = fragment('<li class="test pass pending"><h2>%e</h2></li>', test.title);
    } else {
      var el = fragment('<li class="test fail"><h2>%e <a href="?grep=%e" class="replay">‣</a></h2></li>', test.title, encodeURIComponent(test.fullTitle()));
      var str = test.err.stack || test.err.toString();

      // FF / Opera do not add the message
      if (!~str.indexOf(test.err.message)) {
        str = test.err.message + '\n' + str;
      }

      // <=IE7 stringifies to [Object Error]. Since it can be overloaded, we
      // check for the result of the stringifying.
      if ('[object Error]' == str) str = test.err.message;

      // Safari doesn't give you a stack. Let's at least provide a source line.
      if (!test.err.stack && test.err.sourceURL && test.err.line !== undefined) {
        str += "\n(" + test.err.sourceURL + ":" + test.err.line + ")";
      }

      el.appendChild(fragment('<pre class="error">%e</pre>', str));
    }

    // toggle code
    // TODO: defer
    if (!test.pending) {
      var h2 = el.getElementsByTagName('h2')[0];

      on(h2, 'click', function(){
        pre.style.display = 'none' == pre.style.display
          ? 'block'
          : 'none';
      });

      var pre = fragment('<pre><code>%e</code></pre>', utils.clean(test.fn.toString()));
      el.appendChild(pre);
      pre.style.display = 'none';
    }

    // Don't call .appendChild if #mocha-report was already .shift()'ed off the stack.
    if (stack[0]) stack[0].appendChild(el);
  });
}

/**
 * Provide suite URL
 *
 * @param {Object} [suite]
 */

HTML.prototype.suiteURL = function(suite){
  return '?grep=' + encodeURIComponent(suite.fullTitle());
};

/**
 * Provide test URL
 *
 * @param {Object} [test]
 */

HTML.prototype.testURL = function(test){
  return '?grep=' + encodeURIComponent(test.fullTitle());
};

/**
 * Display error `msg`.
 */

function error(msg) {
  document.body.appendChild(fragment('<div id="mocha-error">%s</div>', msg));
}

/**
 * Return a DOM fragment from `html`.
 */

function fragment(html) {
  var args = arguments
    , div = document.createElement('div')
    , i = 1;

  div.innerHTML = html.replace(/%([se])/g, function(_, type){
    switch (type) {
      case 's': return String(args[i++]);
      case 'e': return escape(args[i++]);
    }
  });

  return div.firstChild;
}

/**
 * Check for suites that do not have elements
 * with `classname`, and hide them.
 */

function hideSuitesWithout(classname) {
  var suites = document.getElementsByClassName('suite');
  for (var i = 0; i < suites.length; i++) {
    var els = suites[i].getElementsByClassName(classname);
    if (0 == els.length) suites[i].className += ' hidden';
  }
}

/**
 * Unhide .hidden suites.
 */

function unhide() {
  var els = document.getElementsByClassName('suite hidden');
  for (var i = 0; i < els.length; ++i) {
    els[i].className = els[i].className.replace('suite hidden', 'suite');
  }
}

/**
 * Set `el` text to `str`.
 */

function text(el, str) {
  if (el.textContent) {
    el.textContent = str;
  } else {
    el.innerText = str;
  }
}

/**
 * Listen on `event` with callback `fn`.
 */

function on(el, event, fn) {
  if (el.addEventListener) {
    el.addEventListener(event, fn, false);
  } else {
    el.attachEvent('on' + event, fn);
  }
}

}); // module: reporters/html.js

require.register("reporters/index.js", function(module, exports, require){

exports.Base = require('./base');
exports.Dot = require('./dot');
exports.Doc = require('./doc');
exports.TAP = require('./tap');
exports.JSON = require('./json');
exports.HTML = require('./html');
exports.List = require('./list');
exports.Min = require('./min');
exports.Spec = require('./spec');
exports.Nyan = require('./nyan');
exports.XUnit = require('./xunit');
exports.Markdown = require('./markdown');
exports.Progress = require('./progress');
exports.Landing = require('./landing');
exports.JSONCov = require('./json-cov');
exports.HTMLCov = require('./html-cov');
exports.JSONStream = require('./json-stream');

}); // module: reporters/index.js

require.register("reporters/json-cov.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Base = require('./base');

/**
 * Expose `JSONCov`.
 */

exports = module.exports = JSONCov;

/**
 * Initialize a new `JsCoverage` reporter.
 *
 * @param {Runner} runner
 * @param {Boolean} output
 * @api public
 */

function JSONCov(runner, output) {
  var self = this
    , output = 1 == arguments.length ? true : output;

  Base.call(this, runner);

  var tests = []
    , failures = []
    , passes = [];

  runner.on('test end', function(test){
    tests.push(test);
  });

  runner.on('pass', function(test){
    passes.push(test);
  });

  runner.on('fail', function(test){
    failures.push(test);
  });

  runner.on('end', function(){
    var cov = global._$jscoverage || {};
    var result = self.cov = map(cov);
    result.stats = self.stats;
    result.tests = tests.map(clean);
    result.failures = failures.map(clean);
    result.passes = passes.map(clean);
    if (!output) return;
    process.stdout.write(JSON.stringify(result, null, 2 ));
  });
}

/**
 * Map jscoverage data to a JSON structure
 * suitable for reporting.
 *
 * @param {Object} cov
 * @return {Object}
 * @api private
 */

function map(cov) {
  var ret = {
      instrumentation: 'node-jscoverage'
    , sloc: 0
    , hits: 0
    , misses: 0
    , coverage: 0
    , files: []
  };

  for (var filename in cov) {
    var data = coverage(filename, cov[filename]);
    ret.files.push(data);
    ret.hits += data.hits;
    ret.misses += data.misses;
    ret.sloc += data.sloc;
  }

  ret.files.sort(function(a, b) {
    return a.filename.localeCompare(b.filename);
  });

  if (ret.sloc > 0) {
    ret.coverage = (ret.hits / ret.sloc) * 100;
  }

  return ret;
};

/**
 * Map jscoverage data for a single source file
 * to a JSON structure suitable for reporting.
 *
 * @param {String} filename name of the source file
 * @param {Object} data jscoverage coverage data
 * @return {Object}
 * @api private
 */

function coverage(filename, data) {
  var ret = {
    filename: filename,
    coverage: 0,
    hits: 0,
    misses: 0,
    sloc: 0,
    source: {}
  };

  data.source.forEach(function(line, num){
    num++;

    if (data[num] === 0) {
      ret.misses++;
      ret.sloc++;
    } else if (data[num] !== undefined) {
      ret.hits++;
      ret.sloc++;
    }

    ret.source[num] = {
        source: line
      , coverage: data[num] === undefined
        ? ''
        : data[num]
    };
  });

  ret.coverage = ret.hits / ret.sloc * 100;

  return ret;
}

/**
 * Return a plain-object representation of `test`
 * free of cyclic properties etc.
 *
 * @param {Object} test
 * @return {Object}
 * @api private
 */

function clean(test) {
  return {
      title: test.title
    , fullTitle: test.fullTitle()
    , duration: test.duration
  }
}

}); // module: reporters/json-cov.js

require.register("reporters/json-stream.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Base = require('./base')
  , color = Base.color;

/**
 * Expose `List`.
 */

exports = module.exports = List;

/**
 * Initialize a new `List` test reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function List(runner) {
  Base.call(this, runner);

  var self = this
    , stats = this.stats
    , total = runner.total;

  runner.on('start', function(){
    console.log(JSON.stringify(['start', { total: total }]));
  });

  runner.on('pass', function(test){
    console.log(JSON.stringify(['pass', clean(test)]));
  });

  runner.on('fail', function(test, err){
    console.log(JSON.stringify(['fail', clean(test)]));
  });

  runner.on('end', function(){
    process.stdout.write(JSON.stringify(['end', self.stats]));
  });
}

/**
 * Return a plain-object representation of `test`
 * free of cyclic properties etc.
 *
 * @param {Object} test
 * @return {Object}
 * @api private
 */

function clean(test) {
  return {
      title: test.title
    , fullTitle: test.fullTitle()
    , duration: test.duration
  }
}
}); // module: reporters/json-stream.js

require.register("reporters/json.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Base = require('./base')
  , cursor = Base.cursor
  , color = Base.color;

/**
 * Expose `JSON`.
 */

exports = module.exports = JSONReporter;

/**
 * Initialize a new `JSON` reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function JSONReporter(runner) {
  var self = this;
  Base.call(this, runner);

  var tests = []
    , failures = []
    , passes = [];

  runner.on('test end', function(test){
    tests.push(test);
  });

  runner.on('pass', function(test){
    passes.push(test);
  });

  runner.on('fail', function(test, err){
    failures.push(test);
    if (err === Object(err)) {
      test.errMsg = err.message;
      test.errStack = err.stack;
    }
  });

  runner.on('end', function(){
    var obj = {
      stats: self.stats,
      tests: tests.map(clean),
      failures: failures.map(clean),
      passes: passes.map(clean)
    };
    runner.testResults = obj;

    process.stdout.write(JSON.stringify(obj, null, 2));
  });
}

/**
 * Return a plain-object representation of `test`
 * free of cyclic properties etc.
 *
 * @param {Object} test
 * @return {Object}
 * @api private
 */

function clean(test) {
  return {
    title: test.title,
    fullTitle: test.fullTitle(),
    duration: test.duration,
    err: test.err,
    errStack: test.err.stack,
    errMessage: test.err.message
  }
}

}); // module: reporters/json.js

require.register("reporters/landing.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Base = require('./base')
  , cursor = Base.cursor
  , color = Base.color;

/**
 * Expose `Landing`.
 */

exports = module.exports = Landing;

/**
 * Airplane color.
 */

Base.colors.plane = 0;

/**
 * Airplane crash color.
 */

Base.colors['plane crash'] = 31;

/**
 * Runway color.
 */

Base.colors.runway = 90;

/**
 * Initialize a new `Landing` reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function Landing(runner) {
  Base.call(this, runner);

  var self = this
    , stats = this.stats
    , width = Base.window.width * .75 | 0
    , total = runner.total
    , stream = process.stdout
    , plane = color('plane', '✈')
    , crashed = -1
    , n = 0;

  function runway() {
    var buf = Array(width).join('-');
    return '  ' + color('runway', buf);
  }

  runner.on('start', function(){
    stream.write('\n  ');
    cursor.hide();
  });

  runner.on('test end', function(test){
    // check if the plane crashed
    var col = -1 == crashed
      ? width * ++n / total | 0
      : crashed;

    // show the crash
    if ('failed' == test.state) {
      plane = color('plane crash', '✈');
      crashed = col;
    }

    // render landing strip
    stream.write('\u001b[4F\n\n');
    stream.write(runway());
    stream.write('\n  ');
    stream.write(color('runway', Array(col).join('⋅')));
    stream.write(plane)
    stream.write(color('runway', Array(width - col).join('⋅') + '\n'));
    stream.write(runway());
    stream.write('\u001b[0m');
  });

  runner.on('end', function(){
    cursor.show();
    console.log();
    self.epilogue();
  });
}

/**
 * Inherit from `Base.prototype`.
 */

function F(){};
F.prototype = Base.prototype;
Landing.prototype = new F;
Landing.prototype.constructor = Landing;

}); // module: reporters/landing.js

require.register("reporters/list.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Base = require('./base')
  , cursor = Base.cursor
  , color = Base.color;

/**
 * Expose `List`.
 */

exports = module.exports = List;

/**
 * Initialize a new `List` test reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function List(runner) {
  Base.call(this, runner);

  var self = this
    , stats = this.stats
    , n = 0;

  runner.on('start', function(){
    console.log();
  });

  runner.on('test', function(test){
    process.stdout.write(color('pass', '    ' + test.fullTitle() + ': '));
  });

  runner.on('pending', function(test){
    var fmt = color('checkmark', '  -')
      + color('pending', ' %s');
    console.log(fmt, test.fullTitle());
  });

  runner.on('pass', function(test){
    var fmt = color('checkmark', '  '+Base.symbols.dot)
      + color('pass', ' %s: ')
      + color(test.speed, '%dms');
    cursor.CR();
    console.log(fmt, test.fullTitle(), test.duration);
  });

  runner.on('fail', function(test, err){
    cursor.CR();
    console.log(color('fail', '  %d) %s'), ++n, test.fullTitle());
  });

  runner.on('end', self.epilogue.bind(self));
}

/**
 * Inherit from `Base.prototype`.
 */

function F(){};
F.prototype = Base.prototype;
List.prototype = new F;
List.prototype.constructor = List;


}); // module: reporters/list.js

require.register("reporters/markdown.js", function(module, exports, require){
/**
 * Module dependencies.
 */

var Base = require('./base')
  , utils = require('../utils');

/**
 * Expose `Markdown`.
 */

exports = module.exports = Markdown;

/**
 * Initialize a new `Markdown` reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function Markdown(runner) {
  Base.call(this, runner);

  var self = this
    , stats = this.stats
    , level = 0
    , buf = '';

  function title(str) {
    return Array(level).join('#') + ' ' + str;
  }

  function indent() {
    return Array(level).join('  ');
  }

  function mapTOC(suite, obj) {
    var ret = obj;
    obj = obj[suite.title] = obj[suite.title] || { suite: suite };
    suite.suites.forEach(function(suite){
      mapTOC(suite, obj);
    });
    return ret;
  }

  function stringifyTOC(obj, level) {
    ++level;
    var buf = '';
    var link;
    for (var key in obj) {
      if ('suite' == key) continue;
      if (key) link = ' - [' + key + '](#' + utils.slug(obj[key].suite.fullTitle()) + ')\n';
      if (key) buf += Array(level).join('  ') + link;
      buf += stringifyTOC(obj[key], level);
    }
    --level;
    return buf;
  }

  function generateTOC(suite) {
    var obj = mapTOC(suite, {});
    return stringifyTOC(obj, 0);
  }

  generateTOC(runner.suite);

  runner.on('suite', function(suite){
    ++level;
    var slug = utils.slug(suite.fullTitle());
    buf += '<a name="' + slug + '"></a>' + '\n';
    buf += title(suite.title) + '\n';
  });

  runner.on('suite end', function(suite){
    --level;
  });

  runner.on('pass', function(test){
    var code = utils.clean(test.fn.toString());
    buf += test.title + '.\n';
    buf += '\n```js\n';
    buf += code + '\n';
    buf += '```\n\n';
  });

  runner.on('end', function(){
    process.stdout.write('# TOC\n');
    process.stdout.write(generateTOC(runner.suite));
    process.stdout.write(buf);
  });
}
}); // module: reporters/markdown.js

require.register("reporters/min.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Base = require('./base');

/**
 * Expose `Min`.
 */

exports = module.exports = Min;

/**
 * Initialize a new `Min` minimal test reporter (best used with --watch).
 *
 * @param {Runner} runner
 * @api public
 */

function Min(runner) {
  Base.call(this, runner);

  runner.on('start', function(){
    // clear screen
    process.stdout.write('\u001b[2J');
    // set cursor position
    process.stdout.write('\u001b[1;3H');
  });

  runner.on('end', this.epilogue.bind(this));
}

/**
 * Inherit from `Base.prototype`.
 */

function F(){};
F.prototype = Base.prototype;
Min.prototype = new F;
Min.prototype.constructor = Min;


}); // module: reporters/min.js

require.register("reporters/nyan.js", function(module, exports, require){
/**
 * Module dependencies.
 */

var Base = require('./base')
  , color = Base.color;

/**
 * Expose `Dot`.
 */

exports = module.exports = NyanCat;

/**
 * Initialize a new `Dot` matrix test reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function NyanCat(runner) {
  Base.call(this, runner);
  var self = this
    , stats = this.stats
    , width = Base.window.width * .75 | 0
    , rainbowColors = this.rainbowColors = self.generateColors()
    , colorIndex = this.colorIndex = 0
    , numerOfLines = this.numberOfLines = 4
    , trajectories = this.trajectories = [[], [], [], []]
    , nyanCatWidth = this.nyanCatWidth = 11
    , trajectoryWidthMax = this.trajectoryWidthMax = (width - nyanCatWidth)
    , scoreboardWidth = this.scoreboardWidth = 5
    , tick = this.tick = 0
    , n = 0;

  runner.on('start', function(){
    Base.cursor.hide();
    self.draw();
  });

  runner.on('pending', function(test){
    self.draw();
  });

  runner.on('pass', function(test){
    self.draw();
  });

  runner.on('fail', function(test, err){
    self.draw();
  });

  runner.on('end', function(){
    Base.cursor.show();
    for (var i = 0; i < self.numberOfLines; i++) write('\n');
    self.epilogue();
  });
}

/**
 * Draw the nyan cat
 *
 * @api private
 */

NyanCat.prototype.draw = function(){
  this.appendRainbow();
  this.drawScoreboard();
  this.drawRainbow();
  this.drawNyanCat();
  this.tick = !this.tick;
};

/**
 * Draw the "scoreboard" showing the number
 * of passes, failures and pending tests.
 *
 * @api private
 */

NyanCat.prototype.drawScoreboard = function(){
  var stats = this.stats;
  var colors = Base.colors;

  function draw(color, n) {
    write(' ');
    write('\u001b[' + color + 'm' + n + '\u001b[0m');
    write('\n');
  }

  draw(colors.green, stats.passes);
  draw(colors.fail, stats.failures);
  draw(colors.pending, stats.pending);
  write('\n');

  this.cursorUp(this.numberOfLines);
};

/**
 * Append the rainbow.
 *
 * @api private
 */

NyanCat.prototype.appendRainbow = function(){
  var segment = this.tick ? '_' : '-';
  var rainbowified = this.rainbowify(segment);

  for (var index = 0; index < this.numberOfLines; index++) {
    var trajectory = this.trajectories[index];
    if (trajectory.length >= this.trajectoryWidthMax) trajectory.shift();
    trajectory.push(rainbowified);
  }
};

/**
 * Draw the rainbow.
 *
 * @api private
 */

NyanCat.prototype.drawRainbow = function(){
  var self = this;

  this.trajectories.forEach(function(line, index) {
    write('\u001b[' + self.scoreboardWidth + 'C');
    write(line.join(''));
    write('\n');
  });

  this.cursorUp(this.numberOfLines);
};

/**
 * Draw the nyan cat
 *
 * @api private
 */

NyanCat.prototype.drawNyanCat = function() {
  var self = this;
  var startWidth = this.scoreboardWidth + this.trajectories[0].length;
  var color = '\u001b[' + startWidth + 'C';
  var padding = '';

  write(color);
  write('_,------,');
  write('\n');

  write(color);
  padding = self.tick ? '  ' : '   ';
  write('_|' + padding + '/\\_/\\ ');
  write('\n');

  write(color);
  padding = self.tick ? '_' : '__';
  var tail = self.tick ? '~' : '^';
  var face;
  write(tail + '|' + padding + this.face() + ' ');
  write('\n');

  write(color);
  padding = self.tick ? ' ' : '  ';
  write(padding + '""  "" ');
  write('\n');

  this.cursorUp(this.numberOfLines);
};

/**
 * Draw nyan cat face.
 *
 * @return {String}
 * @api private
 */

NyanCat.prototype.face = function() {
  var stats = this.stats;
  if (stats.failures) {
    return '( x .x)';
  } else if (stats.pending) {
    return '( o .o)';
  } else if(stats.passes) {
    return '( ^ .^)';
  } else {
    return '( - .-)';
  }
}

/**
 * Move cursor up `n`.
 *
 * @param {Number} n
 * @api private
 */

NyanCat.prototype.cursorUp = function(n) {
  write('\u001b[' + n + 'A');
};

/**
 * Move cursor down `n`.
 *
 * @param {Number} n
 * @api private
 */

NyanCat.prototype.cursorDown = function(n) {
  write('\u001b[' + n + 'B');
};

/**
 * Generate rainbow colors.
 *
 * @return {Array}
 * @api private
 */

NyanCat.prototype.generateColors = function(){
  var colors = [];

  for (var i = 0; i < (6 * 7); i++) {
    var pi3 = Math.floor(Math.PI / 3);
    var n = (i * (1.0 / 6));
    var r = Math.floor(3 * Math.sin(n) + 3);
    var g = Math.floor(3 * Math.sin(n + 2 * pi3) + 3);
    var b = Math.floor(3 * Math.sin(n + 4 * pi3) + 3);
    colors.push(36 * r + 6 * g + b + 16);
  }

  return colors;
};

/**
 * Apply rainbow to the given `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

NyanCat.prototype.rainbowify = function(str){
  var color = this.rainbowColors[this.colorIndex % this.rainbowColors.length];
  this.colorIndex += 1;
  return '\u001b[38;5;' + color + 'm' + str + '\u001b[0m';
};

/**
 * Stdout helper.
 */

function write(string) {
  process.stdout.write(string);
}

/**
 * Inherit from `Base.prototype`.
 */

function F(){};
F.prototype = Base.prototype;
NyanCat.prototype = new F;
NyanCat.prototype.constructor = NyanCat;


}); // module: reporters/nyan.js

require.register("reporters/progress.js", function(module, exports, require){
/**
 * Module dependencies.
 */

var Base = require('./base')
  , cursor = Base.cursor
  , color = Base.color;

/**
 * Expose `Progress`.
 */

exports = module.exports = Progress;

/**
 * General progress bar color.
 */

Base.colors.progress = 90;

/**
 * Initialize a new `Progress` bar test reporter.
 *
 * @param {Runner} runner
 * @param {Object} options
 * @api public
 */

function Progress(runner, options) {
  Base.call(this, runner);

  var self = this
    , options = options || {}
    , stats = this.stats
    , width = Base.window.width * .50 | 0
    , total = runner.total
    , complete = 0
    , max = Math.max
    , lastN = -1;

  // default chars
  options.open = options.open || '[';
  options.complete = options.complete || '▬';
  options.incomplete = options.incomplete || Base.symbols.dot;
  options.close = options.close || ']';
  options.verbose = false;

  // tests started
  runner.on('start', function(){
    console.log();
    cursor.hide();
  });

  // tests complete
  runner.on('test end', function(){
    complete++;
    var incomplete = total - complete
      , percent = complete / total
      , n = width * percent | 0
      , i = width - n;

    if (lastN === n && !options.verbose) {
      // Don't re-render the line if it hasn't changed
      return;
    }
    lastN = n;

    cursor.CR();
    process.stdout.write('\u001b[J');
    process.stdout.write(color('progress', '  ' + options.open));
    process.stdout.write(Array(n).join(options.complete));
    process.stdout.write(Array(i).join(options.incomplete));
    process.stdout.write(color('progress', options.close));
    if (options.verbose) {
      process.stdout.write(color('progress', ' ' + complete + ' of ' + total));
    }
  });

  // tests are complete, output some stats
  // and the failures if any
  runner.on('end', function(){
    cursor.show();
    console.log();
    self.epilogue();
  });
}

/**
 * Inherit from `Base.prototype`.
 */

function F(){};
F.prototype = Base.prototype;
Progress.prototype = new F;
Progress.prototype.constructor = Progress;


}); // module: reporters/progress.js

require.register("reporters/spec.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Base = require('./base')
  , cursor = Base.cursor
  , color = Base.color;

/**
 * Expose `Spec`.
 */

exports = module.exports = Spec;

/**
 * Initialize a new `Spec` test reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function Spec(runner) {
  Base.call(this, runner);

  var self = this
    , stats = this.stats
    , indents = 0
    , n = 0;

  function indent() {
    return Array(indents).join('  ')
  }

  runner.on('start', function(){
    console.log();
  });

  runner.on('suite', function(suite){
    ++indents;
    console.log(color('suite', '%s%s'), indent(), suite.title);
  });

  runner.on('suite end', function(suite){
    --indents;
    if (1 == indents) console.log();
  });

  runner.on('pending', function(test){
    var fmt = indent() + color('pending', '  - %s');
    console.log(fmt, test.title);
  });

  runner.on('pass', function(test){
    if ('fast' == test.speed) {
      var fmt = indent()
        + color('checkmark', '  ' + Base.symbols.ok)
        + color('pass', ' %s ');
      cursor.CR();
      console.log(fmt, test.title);
    } else {
      var fmt = indent()
        + color('checkmark', '  ' + Base.symbols.ok)
        + color('pass', ' %s ')
        + color(test.speed, '(%dms)');
      cursor.CR();
      console.log(fmt, test.title, test.duration);
    }
  });

  runner.on('fail', function(test, err){
    cursor.CR();
    console.log(indent() + color('fail', '  %d) %s'), ++n, test.title);
  });

  runner.on('end', self.epilogue.bind(self));
}

/**
 * Inherit from `Base.prototype`.
 */

function F(){};
F.prototype = Base.prototype;
Spec.prototype = new F;
Spec.prototype.constructor = Spec;


}); // module: reporters/spec.js

require.register("reporters/tap.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Base = require('./base')
  , cursor = Base.cursor
  , color = Base.color;

/**
 * Expose `TAP`.
 */

exports = module.exports = TAP;

/**
 * Initialize a new `TAP` reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function TAP(runner) {
  Base.call(this, runner);

  var self = this
    , stats = this.stats
    , n = 1
    , passes = 0
    , failures = 0;

  runner.on('start', function(){
    var total = runner.grepTotal(runner.suite);
    console.log('%d..%d', 1, total);
  });

  runner.on('test end', function(){
    ++n;
  });

  runner.on('pending', function(test){
    console.log('ok %d %s # SKIP -', n, title(test));
  });

  runner.on('pass', function(test){
    passes++;
    console.log('ok %d %s', n, title(test));
  });

  runner.on('fail', function(test, err){
    failures++;
    console.log('not ok %d %s', n, title(test));
    if (err.stack) console.log(err.stack.replace(/^/gm, '  '));
  });

  runner.on('end', function(){
    console.log('# tests ' + (passes + failures));
    console.log('# pass ' + passes);
    console.log('# fail ' + failures);
  });
}

/**
 * Return a TAP-safe title of `test`
 *
 * @param {Object} test
 * @return {String}
 * @api private
 */

function title(test) {
  return test.fullTitle().replace(/#/g, '');
}

}); // module: reporters/tap.js

require.register("reporters/xunit.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Base = require('./base')
  , utils = require('../utils')
  , escape = utils.escape;

/**
 * Save timer references to avoid Sinon interfering (see GH-237).
 */

var Date = global.Date
  , setTimeout = global.setTimeout
  , setInterval = global.setInterval
  , clearTimeout = global.clearTimeout
  , clearInterval = global.clearInterval;

/**
 * Expose `XUnit`.
 */

exports = module.exports = XUnit;

/**
 * Initialize a new `XUnit` reporter.
 *
 * @param {Runner} runner
 * @api public
 */

function XUnit(runner) {
  Base.call(this, runner);
  var stats = this.stats
    , tests = []
    , self = this;

  runner.on('pending', function(test){
    tests.push(test);
  });

  runner.on('pass', function(test){
    tests.push(test);
  });

  runner.on('fail', function(test){
    tests.push(test);
  });

  runner.on('end', function(){
    console.log(tag('testsuite', {
        name: 'Mocha Tests'
      , tests: stats.tests
      , failures: stats.failures
      , errors: stats.failures
      , skipped: stats.tests - stats.failures - stats.passes
      , timestamp: (new Date).toUTCString()
      , time: (stats.duration / 1000) || 0
    }, false));

    tests.forEach(test);
    console.log('</testsuite>');
  });
}

/**
 * Inherit from `Base.prototype`.
 */

function F(){};
F.prototype = Base.prototype;
XUnit.prototype = new F;
XUnit.prototype.constructor = XUnit;


/**
 * Output tag for the given `test.`
 */

function test(test) {
  var attrs = {
      classname: test.parent.fullTitle()
    , name: test.title
    , time: (test.duration / 1000) || 0
  };

  if ('failed' == test.state) {
    var err = test.err;
    console.log(tag('testcase', attrs, false, tag('failure', {}, false, cdata(escape(err.message) + "\n" + err.stack))));
  } else if (test.pending) {
    console.log(tag('testcase', attrs, false, tag('skipped', {}, true)));
  } else {
    console.log(tag('testcase', attrs, true) );
  }
}

/**
 * HTML tag helper.
 */

function tag(name, attrs, close, content) {
  var end = close ? '/>' : '>'
    , pairs = []
    , tag;

  for (var key in attrs) {
    pairs.push(key + '="' + escape(attrs[key]) + '"');
  }

  tag = '<' + name + (pairs.length ? ' ' + pairs.join(' ') : '') + end;
  if (content) tag += content + '</' + name + end;
  return tag;
}

/**
 * Return cdata escaped CDATA `str`.
 */

function cdata(str) {
  return '<![CDATA[' + escape(str) + ']]>';
}

}); // module: reporters/xunit.js

require.register("runnable.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var EventEmitter = require('browser/events').EventEmitter
  , debug = require('browser/debug')('mocha:runnable')
  , milliseconds = require('./ms');

/**
 * Save timer references to avoid Sinon interfering (see GH-237).
 */

var Date = global.Date
  , setTimeout = global.setTimeout
  , setInterval = global.setInterval
  , clearTimeout = global.clearTimeout
  , clearInterval = global.clearInterval;

/**
 * Object#toString().
 */

var toString = Object.prototype.toString;

/**
 * Expose `Runnable`.
 */

module.exports = Runnable;

/**
 * Initialize a new `Runnable` with the given `title` and callback `fn`.
 *
 * @param {String} title
 * @param {Function} fn
 * @api private
 */

function Runnable(title, fn) {
  this.title = title;
  this.fn = fn;
  this.async = fn && fn.length;
  this.sync = ! this.async;
  this._timeout = 2000;
  this._slow = 75;
  this._enableTimeouts = true;
  this.timedOut = false;
}

/**
 * Inherit from `EventEmitter.prototype`.
 */

function F(){};
F.prototype = EventEmitter.prototype;
Runnable.prototype = new F;
Runnable.prototype.constructor = Runnable;


/**
 * Set & get timeout `ms`.
 *
 * @param {Number|String} ms
 * @return {Runnable|Number} ms or self
 * @api private
 */

Runnable.prototype.timeout = function(ms){
  if (0 == arguments.length) return this._timeout;
  if ('string' == typeof ms) ms = milliseconds(ms);
  debug('timeout %d', ms);
  this._timeout = ms;
  if (this.timer) this.resetTimeout();
  return this;
};

/**
 * Set & get slow `ms`.
 *
 * @param {Number|String} ms
 * @return {Runnable|Number} ms or self
 * @api private
 */

Runnable.prototype.slow = function(ms){
  if (0 === arguments.length) return this._slow;
  if ('string' == typeof ms) ms = milliseconds(ms);
  debug('timeout %d', ms);
  this._slow = ms;
  return this;
};

/**
 * Set and & get timeout `enabled`.
 *
 * @param {Boolean} enabled
 * @return {Runnable|Boolean} enabled or self
 * @api private
 */

Runnable.prototype.enableTimeouts = function(enabled){
  if (arguments.length === 0) return this._enableTimeouts;
  debug('enableTimeouts %s', enabled);
  this._enableTimeouts = enabled;
  return this;
};

/**
 * Return the full title generated by recursively
 * concatenating the parent's full title.
 *
 * @return {String}
 * @api public
 */

Runnable.prototype.fullTitle = function(){
  return this.parent.fullTitle() + ' ' + this.title;
};

/**
 * Clear the timeout.
 *
 * @api private
 */

Runnable.prototype.clearTimeout = function(){
  clearTimeout(this.timer);
};

/**
 * Inspect the runnable void of private properties.
 *
 * @return {String}
 * @api private
 */

Runnable.prototype.inspect = function(){
  return JSON.stringify(this, function(key, val){
    if ('_' == key[0]) return;
    if ('parent' == key) return '#<Suite>';
    if ('ctx' == key) return '#<Context>';
    return val;
  }, 2);
};

/**
 * Reset the timeout.
 *
 * @api private
 */

Runnable.prototype.resetTimeout = function(){
  var self = this;
  var ms = this.timeout() || 1e9;

  if (!this._enableTimeouts) return;
  this.clearTimeout();
  this.timer = setTimeout(function(){
    self.callback(new Error('timeout of ' + ms + 'ms exceeded'));
    self.timedOut = true;
  }, ms);
};

/**
 * Whitelist these globals for this test run
 *
 * @api private
 */
Runnable.prototype.globals = function(arr){
  var self = this;
  this._allowedGlobals = arr;
};

/**
 * Run the test and invoke `fn(err)`.
 *
 * @param {Function} fn
 * @api private
 */

Runnable.prototype.run = function(fn){
  var self = this
    , start = new Date
    , ctx = this.ctx
    , finished
    , emitted;

  // Some times the ctx exists but it is not runnable
  if (ctx && ctx.runnable) ctx.runnable(this);

  // called multiple times
  function multiple(err) {
    if (emitted) return;
    emitted = true;
    self.emit('error', err || new Error('done() called multiple times'));
  }

  // finished
  function done(err) {
    var ms = self.timeout();
    if (self.timedOut) return;
    if (finished) return multiple(err);
    self.clearTimeout();
    self.duration = new Date - start;
    finished = true;
    if (!err && self.duration > ms && self._enableTimeouts) err = new Error('timeout of ' + ms + 'ms exceeded');
    fn(err);
  }

  // for .resetTimeout()
  this.callback = done;

  // explicit async with `done` argument
  if (this.async) {
    this.resetTimeout();

    try {
      this.fn.call(ctx, function(err){
        if (err instanceof Error || toString.call(err) === "[object Error]") return done(err);
        if (null != err) {
          if (Object.prototype.toString.call(err) === '[object Object]') {
            return done(new Error('done() invoked with non-Error: ' + JSON.stringify(err)));
          } else {
            return done(new Error('done() invoked with non-Error: ' + err));
          }
        }
        done();
      });
    } catch (err) {
      done(err);
    }
    return;
  }

  if (this.asyncOnly) {
    return done(new Error('--async-only option in use without declaring `done()`'));
  }

  // sync or promise-returning
  try {
    if (this.pending) {
      done();
    } else {
      callFn(this.fn);
    }
  } catch (err) {
    done(err);
  }

  function callFn(fn) {
    var result = fn.call(ctx);
    if (result && typeof result.then === 'function') {
      self.resetTimeout();
      result
        .then(function() {
          done()
        },
        function(reason) {
          done(reason || new Error('Promise rejected with no or falsy reason'))
        });
    } else {
      done();
    }
  }
};

}); // module: runnable.js

require.register("runner.js", function(module, exports, require){
/**
 * Module dependencies.
 */

var EventEmitter = require('browser/events').EventEmitter
  , debug = require('browser/debug')('mocha:runner')
  , Test = require('./test')
  , utils = require('./utils')
  , filter = utils.filter
  , keys = utils.keys;

/**
 * Non-enumerable globals.
 */

var globals = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'XMLHttpRequest',
  'Date'
];

/**
 * Expose `Runner`.
 */

module.exports = Runner;

/**
 * Initialize a `Runner` for the given `suite`.
 *
 * Events:
 *
 *   - `start`  execution started
 *   - `end`  execution complete
 *   - `suite`  (suite) test suite execution started
 *   - `suite end`  (suite) all tests (and sub-suites) have finished
 *   - `test`  (test) test execution started
 *   - `test end`  (test) test completed
 *   - `hook`  (hook) hook execution started
 *   - `hook end`  (hook) hook complete
 *   - `pass`  (test) test passed
 *   - `fail`  (test, err) test failed
 *   - `pending`  (test) test pending
 *
 * @api public
 */

function Runner(suite) {
  var self = this;
  this._globals = [];
  this._abort = false;
  this.suite = suite;
  this.total = suite.total();
  this.failures = 0;
  this.on('test end', function(test){ self.checkGlobals(test); });
  this.on('hook end', function(hook){ self.checkGlobals(hook); });
  this.grep(/.*/);
  this.globals(this.globalProps().concat(extraGlobals()));
}

/**
 * Wrapper for setImmediate, process.nextTick, or browser polyfill.
 *
 * @param {Function} fn
 * @api private
 */

Runner.immediately = global.setImmediate || process.nextTick;

/**
 * Inherit from `EventEmitter.prototype`.
 */

function F(){};
F.prototype = EventEmitter.prototype;
Runner.prototype = new F;
Runner.prototype.constructor = Runner;


/**
 * Run tests with full titles matching `re`. Updates runner.total
 * with number of tests matched.
 *
 * @param {RegExp} re
 * @param {Boolean} invert
 * @return {Runner} for chaining
 * @api public
 */

Runner.prototype.grep = function(re, invert){
  debug('grep %s', re);
  this._grep = re;
  this._invert = invert;
  this.total = this.grepTotal(this.suite);
  return this;
};

/**
 * Returns the number of tests matching the grep search for the
 * given suite.
 *
 * @param {Suite} suite
 * @return {Number}
 * @api public
 */

Runner.prototype.grepTotal = function(suite) {
  var self = this;
  var total = 0;

  suite.eachTest(function(test){
    var match = self._grep.test(test.fullTitle());
    if (self._invert) match = !match;
    if (match) total++;
  });

  return total;
};

/**
 * Return a list of global properties.
 *
 * @return {Array}
 * @api private
 */

Runner.prototype.globalProps = function() {
  var props = utils.keys(global);

  // non-enumerables
  for (var i = 0; i < globals.length; ++i) {
    if (~utils.indexOf(props, globals[i])) continue;
    props.push(globals[i]);
  }

  return props;
};

/**
 * Allow the given `arr` of globals.
 *
 * @param {Array} arr
 * @return {Runner} for chaining
 * @api public
 */

Runner.prototype.globals = function(arr){
  if (0 == arguments.length) return this._globals;
  debug('globals %j', arr);
  this._globals = this._globals.concat(arr);
  return this;
};

/**
 * Check for global variable leaks.
 *
 * @api private
 */

Runner.prototype.checkGlobals = function(test){
  if (this.ignoreLeaks) return;
  var ok = this._globals;

  var globals = this.globalProps();
  var leaks;

  if (test) {
    ok = ok.concat(test._allowedGlobals || []);
  }

  if(this.prevGlobalsLength == globals.length) return;
  this.prevGlobalsLength = globals.length;

  leaks = filterLeaks(ok, globals);
  this._globals = this._globals.concat(leaks);

  if (leaks.length > 1) {
    this.fail(test, new Error('global leaks detected: ' + leaks.join(', ') + ''));
  } else if (leaks.length) {
    this.fail(test, new Error('global leak detected: ' + leaks[0]));
  }
};

/**
 * Fail the given `test`.
 *
 * @param {Test} test
 * @param {Error} err
 * @api private
 */

Runner.prototype.fail = function(test, err){
  ++this.failures;
  test.state = 'failed';

  if ('string' == typeof err) {
    err = new Error('the string "' + err + '" was thrown, throw an Error :)');
  }

  this.emit('fail', test, err);
};

/**
 * Fail the given `hook` with `err`.
 *
 * Hook failures work in the following pattern:
 * - If bail, then exit
 * - Failed `before` hook skips all tests in a suite and subsuites,
 *   but jumps to corresponding `after` hook
 * - Failed `before each` hook skips remaining tests in a
 *   suite and jumps to corresponding `after each` hook,
 *   which is run only once
 * - Failed `after` hook does not alter
 *   execution order
 * - Failed `after each` hook skips remaining tests in a
 *   suite and subsuites, but executes other `after each`
 *   hooks
 *
 * @param {Hook} hook
 * @param {Error} err
 * @api private
 */

Runner.prototype.failHook = function(hook, err){
  this.fail(hook, err);
  if (this.suite.bail()) {
    this.emit('end');
  }
};

/**
 * Run hook `name` callbacks and then invoke `fn()`.
 *
 * @param {String} name
 * @param {Function} function
 * @api private
 */

Runner.prototype.hook = function(name, fn){
  var suite = this.suite
    , hooks = suite['_' + name]
    , self = this
    , timer;

  function next(i) {
    var hook = hooks[i];
    if (!hook) return fn();
    if (self.failures && suite.bail()) return fn();
    self.currentRunnable = hook;

    hook.ctx.currentTest = self.test;

    self.emit('hook', hook);

    hook.on('error', function(err){
      self.failHook(hook, err);
    });

    hook.run(function(err){
      hook.removeAllListeners('error');
      var testError = hook.error();
      if (testError) self.fail(self.test, testError);
      if (err) {
        self.failHook(hook, err);

        // stop executing hooks, notify callee of hook err
        return fn(err);
      }
      self.emit('hook end', hook);
      delete hook.ctx.currentTest;
      next(++i);
    });
  }

  Runner.immediately(function(){
    next(0);
  });
};

/**
 * Run hook `name` for the given array of `suites`
 * in order, and callback `fn(err, errSuite)`.
 *
 * @param {String} name
 * @param {Array} suites
 * @param {Function} fn
 * @api private
 */

Runner.prototype.hooks = function(name, suites, fn){
  var self = this
    , orig = this.suite;

  function next(suite) {
    self.suite = suite;

    if (!suite) {
      self.suite = orig;
      return fn();
    }

    self.hook(name, function(err){
      if (err) {
        var errSuite = self.suite;
        self.suite = orig;
        return fn(err, errSuite);
      }

      next(suites.pop());
    });
  }

  next(suites.pop());
};

/**
 * Run hooks from the top level down.
 *
 * @param {String} name
 * @param {Function} fn
 * @api private
 */

Runner.prototype.hookUp = function(name, fn){
  var suites = [this.suite].concat(this.parents()).reverse();
  this.hooks(name, suites, fn);
};

/**
 * Run hooks from the bottom up.
 *
 * @param {String} name
 * @param {Function} fn
 * @api private
 */

Runner.prototype.hookDown = function(name, fn){
  var suites = [this.suite].concat(this.parents());
  this.hooks(name, suites, fn);
};

/**
 * Return an array of parent Suites from
 * closest to furthest.
 *
 * @return {Array}
 * @api private
 */

Runner.prototype.parents = function(){
  var suite = this.suite
    , suites = [];
  while (suite = suite.parent) suites.push(suite);
  return suites;
};

/**
 * Run the current test and callback `fn(err)`.
 *
 * @param {Function} fn
 * @api private
 */

Runner.prototype.runTest = function(fn){
  var test = this.test
    , self = this;

  if (this.asyncOnly) test.asyncOnly = true;

  try {
    test.on('error', function(err){
      self.fail(test, err);
    });
    test.run(fn);
  } catch (err) {
    fn(err);
  }
};

/**
 * Run tests in the given `suite` and invoke
 * the callback `fn()` when complete.
 *
 * @param {Suite} suite
 * @param {Function} fn
 * @api private
 */

Runner.prototype.runTests = function(suite, fn){
  var self = this
    , tests = suite.tests.slice()
    , test;


  function hookErr(err, errSuite, after) {
    // before/after Each hook for errSuite failed:
    var orig = self.suite;

    // for failed 'after each' hook start from errSuite parent,
    // otherwise start from errSuite itself
    self.suite = after ? errSuite.parent : errSuite;

    if (self.suite) {
      // call hookUp afterEach
      self.hookUp('afterEach', function(err2, errSuite2) {
        self.suite = orig;
        // some hooks may fail even now
        if (err2) return hookErr(err2, errSuite2, true);
        // report error suite
        fn(errSuite);
      });
    } else {
      // there is no need calling other 'after each' hooks
      self.suite = orig;
      fn(errSuite);
    }
  }

  function next(err, errSuite) {
    // if we bail after first err
    if (self.failures && suite._bail) return fn();

    if (self._abort) return fn();

    if (err) return hookErr(err, errSuite, true);

    // next test
    test = tests.shift();

    // all done
    if (!test) return fn();

    // grep
    var match = self._grep.test(test.fullTitle());
    if (self._invert) match = !match;
    if (!match) return next();

    // pending
    if (test.pending) {
      self.emit('pending', test);
      self.emit('test end', test);
      return next();
    }

    // execute test and hook(s)
    self.emit('test', self.test = test);
    self.hookDown('beforeEach', function(err, errSuite){

      if (err) return hookErr(err, errSuite, false);

      self.currentRunnable = self.test;
      self.runTest(function(err){
        test = self.test;

        if (err) {
          self.fail(test, err);
          self.emit('test end', test);
          return self.hookUp('afterEach', next);
        }

        test.state = 'passed';
        self.emit('pass', test);
        self.emit('test end', test);
        self.hookUp('afterEach', next);
      });
    });
  }

  this.next = next;
  next();
};

/**
 * Run the given `suite` and invoke the
 * callback `fn()` when complete.
 *
 * @param {Suite} suite
 * @param {Function} fn
 * @api private
 */

Runner.prototype.runSuite = function(suite, fn){
  var total = this.grepTotal(suite)
    , self = this
    , i = 0;

  debug('run suite %s', suite.fullTitle());

  if (!total) return fn();

  this.emit('suite', this.suite = suite);

  function next(errSuite) {
    if (errSuite) {
      // current suite failed on a hook from errSuite
      if (errSuite == suite) {
        // if errSuite is current suite
        // continue to the next sibling suite
        return done();
      } else {
        // errSuite is among the parents of current suite
        // stop execution of errSuite and all sub-suites
        return done(errSuite);
      }
    }

    if (self._abort) return done();

    var curr = suite.suites[i++];
    if (!curr) return done();
    self.runSuite(curr, next);
  }

  function done(errSuite) {
    self.suite = suite;
    self.hook('afterAll', function(){
      self.emit('suite end', suite);
      fn(errSuite);
    });
  }

  this.hook('beforeAll', function(err){
    if (err) return done();
    self.runTests(suite, next);
  });
};

/**
 * Handle uncaught exceptions.
 *
 * @param {Error} err
 * @api private
 */

Runner.prototype.uncaught = function(err){
  if (err) {
    debug('uncaught exception %s', err.message);
  } else {
    debug('uncaught undefined exception');
    err = new Error('Catched undefined error, did you throw without specifying what?');
  }
  
  var runnable = this.currentRunnable;
  if (!runnable || 'failed' == runnable.state) return;
  runnable.clearTimeout();
  err.uncaught = true;
  this.fail(runnable, err);

  // recover from test
  if ('test' == runnable.type) {
    this.emit('test end', runnable);
    this.hookUp('afterEach', this.next);
    return;
  }

  // bail on hooks
  this.emit('end');
};

/**
 * Run the root suite and invoke `fn(failures)`
 * on completion.
 *
 * @param {Function} fn
 * @return {Runner} for chaining
 * @api public
 */

Runner.prototype.run = function(fn){
  var self = this
    , fn = fn || function(){};

  function uncaught(err){
    self.uncaught(err);
  }

  debug('start');

  // callback
  this.on('end', function(){
    debug('end');
    process.removeListener('uncaughtException', uncaught);
    fn(self.failures);
  });

  // run suites
  this.emit('start');
  this.runSuite(this.suite, function(){
    debug('finished running');
    self.emit('end');
  });

  // uncaught exception
  process.on('uncaughtException', uncaught);

  return this;
};

/**
 * Cleanly abort execution
 *
 * @return {Runner} for chaining
 * @api public
 */
Runner.prototype.abort = function(){
  debug('aborting');
  this._abort = true;
}

/**
 * Filter leaks with the given globals flagged as `ok`.
 *
 * @param {Array} ok
 * @param {Array} globals
 * @return {Array}
 * @api private
 */

function filterLeaks(ok, globals) {
  return filter(globals, function(key){
    // Firefox and Chrome exposes iframes as index inside the window object
    if (/^d+/.test(key)) return false;

    // in firefox
    // if runner runs in an iframe, this iframe's window.getInterface method not init at first
    // it is assigned in some seconds
    if (global.navigator && /^getInterface/.test(key)) return false;

    // an iframe could be approached by window[iframeIndex]
    // in ie6,7,8 and opera, iframeIndex is enumerable, this could cause leak
    if (global.navigator && /^\d+/.test(key)) return false;

    // Opera and IE expose global variables for HTML element IDs (issue #243)
    if (/^mocha-/.test(key)) return false;

    var matched = filter(ok, function(ok){
      if (~ok.indexOf('*')) return 0 == key.indexOf(ok.split('*')[0]);
      return key == ok;
    });
    return matched.length == 0 && (!global.navigator || 'onerror' !== key);
  });
}

/**
 * Array of globals dependent on the environment.
 *
 * @return {Array}
 * @api private
 */

 function extraGlobals() {
  if (typeof(process) === 'object' &&
      typeof(process.version) === 'string') {

    var nodeVersion = process.version.split('.').reduce(function(a, v) {
      return a << 8 | v;
    });

    // 'errno' was renamed to process._errno in v0.9.11.

    if (nodeVersion < 0x00090B) {
      return ['errno'];
    }
  }

  return [];
 }

}); // module: runner.js

require.register("suite.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var EventEmitter = require('browser/events').EventEmitter
  , debug = require('browser/debug')('mocha:suite')
  , milliseconds = require('./ms')
  , utils = require('./utils')
  , Hook = require('./hook');

/**
 * Expose `Suite`.
 */

exports = module.exports = Suite;

/**
 * Create a new `Suite` with the given `title`
 * and parent `Suite`. When a suite with the
 * same title is already present, that suite
 * is returned to provide nicer reporter
 * and more flexible meta-testing.
 *
 * @param {Suite} parent
 * @param {String} title
 * @return {Suite}
 * @api public
 */

exports.create = function(parent, title){
  var suite = new Suite(title, parent.ctx);
  suite.parent = parent;
  if (parent.pending) suite.pending = true;
  title = suite.fullTitle();
  parent.addSuite(suite);
  return suite;
};

/**
 * Initialize a new `Suite` with the given
 * `title` and `ctx`.
 *
 * @param {String} title
 * @param {Context} ctx
 * @api private
 */

function Suite(title, parentContext) {
  this.title = title;
  var context = function() {};
  context.prototype = parentContext;
  this.ctx = new context();
  this.suites = [];
  this.tests = [];
  this.pending = false;
  this._beforeEach = [];
  this._beforeAll = [];
  this._afterEach = [];
  this._afterAll = [];
  this.root = !title;
  this._timeout = 2000;
  this._enableTimeouts = true;
  this._slow = 75;
  this._bail = false;
}

/**
 * Inherit from `EventEmitter.prototype`.
 */

function F(){};
F.prototype = EventEmitter.prototype;
Suite.prototype = new F;
Suite.prototype.constructor = Suite;


/**
 * Return a clone of this `Suite`.
 *
 * @return {Suite}
 * @api private
 */

Suite.prototype.clone = function(){
  var suite = new Suite(this.title);
  debug('clone');
  suite.ctx = this.ctx;
  suite.timeout(this.timeout());
  suite.enableTimeouts(this.enableTimeouts());
  suite.slow(this.slow());
  suite.bail(this.bail());
  return suite;
};

/**
 * Set timeout `ms` or short-hand such as "2s".
 *
 * @param {Number|String} ms
 * @return {Suite|Number} for chaining
 * @api private
 */

Suite.prototype.timeout = function(ms){
  if (0 == arguments.length) return this._timeout;
  if ('string' == typeof ms) ms = milliseconds(ms);
  debug('timeout %d', ms);
  this._timeout = parseInt(ms, 10);
  return this;
};

/**
  * Set timeout `enabled`.
  *
  * @param {Boolean} enabled
  * @return {Suite|Boolean} self or enabled
  * @api private
  */

Suite.prototype.enableTimeouts = function(enabled){
  if (arguments.length === 0) return this._enableTimeouts;
  debug('enableTimeouts %s', enabled);
  this._enableTimeouts = enabled;
  return this;
}

/**
 * Set slow `ms` or short-hand such as "2s".
 *
 * @param {Number|String} ms
 * @return {Suite|Number} for chaining
 * @api private
 */

Suite.prototype.slow = function(ms){
  if (0 === arguments.length) return this._slow;
  if ('string' == typeof ms) ms = milliseconds(ms);
  debug('slow %d', ms);
  this._slow = ms;
  return this;
};

/**
 * Sets whether to bail after first error.
 *
 * @parma {Boolean} bail
 * @return {Suite|Number} for chaining
 * @api private
 */

Suite.prototype.bail = function(bail){
  if (0 == arguments.length) return this._bail;
  debug('bail %s', bail);
  this._bail = bail;
  return this;
};

/**
 * Run `fn(test[, done])` before running tests.
 *
 * @param {Function} fn
 * @return {Suite} for chaining
 * @api private
 */

Suite.prototype.beforeAll = function(title, fn){
  if (this.pending) return this;
  if ('function' === typeof title) {
    fn = title;
    title = fn.name;
  }
  title = '"before all" hook' + (title ? ': ' + title : '');

  var hook = new Hook(title, fn);
  hook.parent = this;
  hook.timeout(this.timeout());
  hook.enableTimeouts(this.enableTimeouts());
  hook.slow(this.slow());
  hook.ctx = this.ctx;
  this._beforeAll.push(hook);
  this.emit('beforeAll', hook);
  return this;
};

/**
 * Run `fn(test[, done])` after running tests.
 *
 * @param {Function} fn
 * @return {Suite} for chaining
 * @api private
 */

Suite.prototype.afterAll = function(title, fn){
  if (this.pending) return this;
  if ('function' === typeof title) {
    fn = title;
    title = fn.name;
  }
  title = '"after all" hook' + (title ? ': ' + title : '');

  var hook = new Hook(title, fn);
  hook.parent = this;
  hook.timeout(this.timeout());
  hook.enableTimeouts(this.enableTimeouts());
  hook.slow(this.slow());
  hook.ctx = this.ctx;
  this._afterAll.push(hook);
  this.emit('afterAll', hook);
  return this;
};

/**
 * Run `fn(test[, done])` before each test case.
 *
 * @param {Function} fn
 * @return {Suite} for chaining
 * @api private
 */

Suite.prototype.beforeEach = function(title, fn){
  if (this.pending) return this;
  if ('function' === typeof title) {
    fn = title;
    title = fn.name;
  }
  title = '"before each" hook' + (title ? ': ' + title : '');

  var hook = new Hook(title, fn);
  hook.parent = this;
  hook.timeout(this.timeout());
  hook.enableTimeouts(this.enableTimeouts());
  hook.slow(this.slow());
  hook.ctx = this.ctx;
  this._beforeEach.push(hook);
  this.emit('beforeEach', hook);
  return this;
};

/**
 * Run `fn(test[, done])` after each test case.
 *
 * @param {Function} fn
 * @return {Suite} for chaining
 * @api private
 */

Suite.prototype.afterEach = function(title, fn){
  if (this.pending) return this;
  if ('function' === typeof title) {
    fn = title;
    title = fn.name;
  }
  title = '"after each" hook' + (title ? ': ' + title : '');

  var hook = new Hook(title, fn);
  hook.parent = this;
  hook.timeout(this.timeout());
  hook.enableTimeouts(this.enableTimeouts());
  hook.slow(this.slow());
  hook.ctx = this.ctx;
  this._afterEach.push(hook);
  this.emit('afterEach', hook);
  return this;
};

/**
 * Add a test `suite`.
 *
 * @param {Suite} suite
 * @return {Suite} for chaining
 * @api private
 */

Suite.prototype.addSuite = function(suite){
  suite.parent = this;
  suite.timeout(this.timeout());
  suite.enableTimeouts(this.enableTimeouts());
  suite.slow(this.slow());
  suite.bail(this.bail());
  this.suites.push(suite);
  this.emit('suite', suite);
  return this;
};

/**
 * Add a `test` to this suite.
 *
 * @param {Test} test
 * @return {Suite} for chaining
 * @api private
 */

Suite.prototype.addTest = function(test){
  test.parent = this;
  test.timeout(this.timeout());
  test.enableTimeouts(this.enableTimeouts());
  test.slow(this.slow());
  test.ctx = this.ctx;
  this.tests.push(test);
  this.emit('test', test);
  return this;
};

/**
 * Return the full title generated by recursively
 * concatenating the parent's full title.
 *
 * @return {String}
 * @api public
 */

Suite.prototype.fullTitle = function(){
  if (this.parent) {
    var full = this.parent.fullTitle();
    if (full) return full + ' ' + this.title;
  }
  return this.title;
};

/**
 * Return the total number of tests.
 *
 * @return {Number}
 * @api public
 */

Suite.prototype.total = function(){
  return utils.reduce(this.suites, function(sum, suite){
    return sum + suite.total();
  }, 0) + this.tests.length;
};

/**
 * Iterates through each suite recursively to find
 * all tests. Applies a function in the format
 * `fn(test)`.
 *
 * @param {Function} fn
 * @return {Suite}
 * @api private
 */

Suite.prototype.eachTest = function(fn){
  utils.forEach(this.tests, fn);
  utils.forEach(this.suites, function(suite){
    suite.eachTest(fn);
  });
  return this;
};

}); // module: suite.js

require.register("test.js", function(module, exports, require){

/**
 * Module dependencies.
 */

var Runnable = require('./runnable');

/**
 * Expose `Test`.
 */

module.exports = Test;

/**
 * Initialize a new `Test` with the given `title` and callback `fn`.
 *
 * @param {String} title
 * @param {Function} fn
 * @api private
 */

function Test(title, fn) {
  Runnable.call(this, title, fn);
  this.pending = !fn;
  this.type = 'test';
}

/**
 * Inherit from `Runnable.prototype`.
 */

function F(){};
F.prototype = Runnable.prototype;
Test.prototype = new F;
Test.prototype.constructor = Test;


}); // module: test.js

require.register("utils.js", function(module, exports, require){
/**
 * Module dependencies.
 */

var fs = require('browser/fs')
  , path = require('browser/path')
  , join = path.join
  , debug = require('browser/debug')('mocha:watch');

/**
 * Ignored directories.
 */

var ignore = ['node_modules', '.git'];

/**
 * Escape special characters in the given string of html.
 *
 * @param  {String} html
 * @return {String}
 * @api private
 */

exports.escape = function(html){
  return String(html)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/**
 * Array#forEach (<=IE8)
 *
 * @param {Array} array
 * @param {Function} fn
 * @param {Object} scope
 * @api private
 */

exports.forEach = function(arr, fn, scope){
  for (var i = 0, l = arr.length; i < l; i++)
    fn.call(scope, arr[i], i);
};

/**
 * Array#map (<=IE8)
 *
 * @param {Array} array
 * @param {Function} fn
 * @param {Object} scope
 * @api private
 */

exports.map = function(arr, fn, scope){
  var result = [];
  for (var i = 0, l = arr.length; i < l; i++)
    result.push(fn.call(scope, arr[i], i));
  return result;
};

/**
 * Array#indexOf (<=IE8)
 *
 * @parma {Array} arr
 * @param {Object} obj to find index of
 * @param {Number} start
 * @api private
 */

exports.indexOf = function(arr, obj, start){
  for (var i = start || 0, l = arr.length; i < l; i++) {
    if (arr[i] === obj)
      return i;
  }
  return -1;
};

/**
 * Array#reduce (<=IE8)
 *
 * @param {Array} array
 * @param {Function} fn
 * @param {Object} initial value
 * @api private
 */

exports.reduce = function(arr, fn, val){
  var rval = val;

  for (var i = 0, l = arr.length; i < l; i++) {
    rval = fn(rval, arr[i], i, arr);
  }

  return rval;
};

/**
 * Array#filter (<=IE8)
 *
 * @param {Array} array
 * @param {Function} fn
 * @api private
 */

exports.filter = function(arr, fn){
  var ret = [];

  for (var i = 0, l = arr.length; i < l; i++) {
    var val = arr[i];
    if (fn(val, i, arr)) ret.push(val);
  }

  return ret;
};

/**
 * Object.keys (<=IE8)
 *
 * @param {Object} obj
 * @return {Array} keys
 * @api private
 */

exports.keys = Object.keys || function(obj) {
  var keys = []
    , has = Object.prototype.hasOwnProperty // for `window` on <=IE8

  for (var key in obj) {
    if (has.call(obj, key)) {
      keys.push(key);
    }
  }

  return keys;
};

/**
 * Watch the given `files` for changes
 * and invoke `fn(file)` on modification.
 *
 * @param {Array} files
 * @param {Function} fn
 * @api private
 */

exports.watch = function(files, fn){
  var options = { interval: 100 };
  files.forEach(function(file){
    debug('file %s', file);
    fs.watchFile(file, options, function(curr, prev){
      if (prev.mtime < curr.mtime) fn(file);
    });
  });
};

/**
 * Ignored files.
 */

function ignored(path){
  return !~ignore.indexOf(path);
}

/**
 * Lookup files in the given `dir`.
 *
 * @return {Array}
 * @api private
 */

exports.files = function(dir, ext, ret){
  ret = ret || [];
  ext = ext || ['js'];

  var re = new RegExp('\\.(' + ext.join('|') + ')$');

  fs.readdirSync(dir)
  .filter(ignored)
  .forEach(function(path){
    path = join(dir, path);
    if (fs.statSync(path).isDirectory()) {
      exports.files(path, ext, ret);
    } else if (path.match(re)) {
      ret.push(path);
    }
  });

  return ret;
};

/**
 * Compute a slug from the given `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

exports.slug = function(str){
  return str
    .toLowerCase()
    .replace(/ +/g, '-')
    .replace(/[^-\w]/g, '');
};

/**
 * Strip the function definition from `str`,
 * and re-indent for pre whitespace.
 */

exports.clean = function(str) {
  str = str
    .replace(/\r\n?|[\n\u2028\u2029]/g, "\n").replace(/^\uFEFF/, '')
    .replace(/^function *\(.*\) *{|\(.*\) *=> *{?/, '')
    .replace(/\s+\}$/, '');

  var spaces = str.match(/^\n?( *)/)[1].length
    , tabs = str.match(/^\n?(\t*)/)[1].length
    , re = new RegExp('^\n?' + (tabs ? '\t' : ' ') + '{' + (tabs ? tabs : spaces) + '}', 'gm');

  str = str.replace(re, '');

  return exports.trim(str);
};

/**
 * Escape regular expression characters in `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

exports.escapeRegexp = function(str){
  return str.replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&");
};

/**
 * Trim the given `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

exports.trim = function(str){
  return str.replace(/^\s+|\s+$/g, '');
};

/**
 * Parse the given `qs`.
 *
 * @param {String} qs
 * @return {Object}
 * @api private
 */

exports.parseQuery = function(qs){
  return exports.reduce(qs.replace('?', '').split('&'), function(obj, pair){
    var i = pair.indexOf('=')
      , key = pair.slice(0, i)
      , val = pair.slice(++i);

    obj[key] = decodeURIComponent(val);
    return obj;
  }, {});
};

/**
 * Highlight the given string of `js`.
 *
 * @param {String} js
 * @return {String}
 * @api private
 */

function highlight(js) {
  return js
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\/\/(.*)/gm, '<span class="comment">//$1</span>')
    .replace(/('.*?')/gm, '<span class="string">$1</span>')
    .replace(/(\d+\.\d+)/gm, '<span class="number">$1</span>')
    .replace(/(\d+)/gm, '<span class="number">$1</span>')
    .replace(/\bnew[ \t]+(\w+)/gm, '<span class="keyword">new</span> <span class="init">$1</span>')
    .replace(/\b(function|new|throw|return|var|if|else)\b/gm, '<span class="keyword">$1</span>')
}

/**
 * Highlight the contents of tag `name`.
 *
 * @param {String} name
 * @api private
 */

exports.highlightTags = function(name) {
  var code = document.getElementsByTagName(name);
  for (var i = 0, len = code.length; i < len; ++i) {
    code[i].innerHTML = highlight(code[i].innerHTML);
  }
};


/**
 * Stringify `obj`.
 *
 * @param {Object} obj
 * @return {String}
 * @api private
 */

exports.stringify = function(obj) {
  if (obj instanceof RegExp) return obj.toString();
  return JSON.stringify(exports.canonicalize(obj), null, 2).replace(/,(\n|$)/g, '$1');
}

/**
 * Return a new object that has the keys in sorted order.
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

exports.canonicalize = function(obj, stack) {
   stack = stack || [];

   if (exports.indexOf(stack, obj) !== -1) return '[Circular]';

   var canonicalizedObj;

   if ({}.toString.call(obj) === '[object Array]') {
     stack.push(obj);
     canonicalizedObj = exports.map(obj, function(item) {
       return exports.canonicalize(item, stack);
     });
     stack.pop();
   } else if (typeof obj === 'object' && obj !== null) {
     stack.push(obj);
     canonicalizedObj = {};
     exports.forEach(exports.keys(obj).sort(), function(key) {
       canonicalizedObj[key] = exports.canonicalize(obj[key], stack);
     });
     stack.pop();
   } else {
     canonicalizedObj = obj;
   }

   return canonicalizedObj;
 }

}); // module: utils.js
// The global object is "self" in Web Workers.
var global = (function() { return this; })();

/**
 * Save timer references to avoid Sinon interfering (see GH-237).
 */

var Date = global.Date;
var setTimeout = global.setTimeout;
var setInterval = global.setInterval;
var clearTimeout = global.clearTimeout;
var clearInterval = global.clearInterval;

/**
 * Node shims.
 *
 * These are meant only to allow
 * mocha.js to run untouched, not
 * to allow running node code in
 * the browser.
 */

var process = {};
process.exit = function(status){};
process.stdout = {};

var uncaughtExceptionHandlers = [];

var originalOnerrorHandler = global.onerror;

/**
 * Remove uncaughtException listener.
 * Revert to original onerror handler if previously defined.
 */

process.removeListener = function(e, fn){
  if ('uncaughtException' == e) {
    if (originalOnerrorHandler) {
      global.onerror = originalOnerrorHandler;
    } else {
      global.onerror = function() {};
    }
    var i = Mocha.utils.indexOf(uncaughtExceptionHandlers, fn);
    if (i != -1) { uncaughtExceptionHandlers.splice(i, 1); }
  }
};

/**
 * Implements uncaughtException listener.
 */

process.on = function(e, fn){
  if ('uncaughtException' == e) {
    global.onerror = function(err, url, line){
      fn(new Error(err + ' (' + url + ':' + line + ')'));
      return true;
    };
    uncaughtExceptionHandlers.push(fn);
  }
};

/**
 * Expose mocha.
 */

var Mocha = global.Mocha = require('mocha'),
    mocha = global.mocha = new Mocha({ reporter: 'html' });

// The BDD UI is registered by default, but no UI will be functional in the
// browser without an explicit call to the overridden `mocha.ui` (see below).
// Ensure that this default UI does not expose its methods to the global scope.
mocha.suite.removeAllListeners('pre-require');

var immediateQueue = []
  , immediateTimeout;

function timeslice() {
  var immediateStart = new Date().getTime();
  while (immediateQueue.length && (new Date().getTime() - immediateStart) < 100) {
    immediateQueue.shift()();
  }
  if (immediateQueue.length) {
    immediateTimeout = setTimeout(timeslice, 0);
  } else {
    immediateTimeout = null;
  }
}

/**
 * High-performance override of Runner.immediately.
 */

Mocha.Runner.immediately = function(callback) {
  immediateQueue.push(callback);
  if (!immediateTimeout) {
    immediateTimeout = setTimeout(timeslice, 0);
  }
};

/**
 * Function to allow assertion libraries to throw errors directly into mocha.
 * This is useful when running tests in a browser because window.onerror will
 * only receive the 'message' attribute of the Error.
 */
mocha.throwError = function(err) {
  Mocha.utils.forEach(uncaughtExceptionHandlers, function (fn) {
    fn(err);
  });
  throw err;
};

/**
 * Override ui to ensure that the ui functions are initialized.
 * Normally this would happen in Mocha.prototype.loadFiles.
 */

mocha.ui = function(ui){
  Mocha.prototype.ui.call(this, ui);
  this.suite.emit('pre-require', global, null, this);
  return this;
};

/**
 * Setup mocha with the given setting options.
 */

mocha.setup = function(opts){
  if ('string' == typeof opts) opts = { ui: opts };
  for (var opt in opts) this[opt](opts[opt]);
  return this;
};

/**
 * Run mocha, returning the Runner.
 */

mocha.run = function(fn){
  var options = mocha.options;
  mocha.globals('location');

  var query = Mocha.utils.parseQuery(global.location.search || '');
  if (query.grep) mocha.grep(query.grep);
  if (query.invert) mocha.invert();

  return Mocha.prototype.run.call(mocha, function(err){
    // The DOM Document is not available in Web Workers.
    if (global.document) {
      Mocha.utils.highlightTags('code');
    }
    if (fn) fn(err);
  });
};

/**
 * Expose the process shim.
 */

Mocha.process = process;
})();
(function() {
var style = document.createElement('style');
style.textContent = '@charset "utf-8";\n\nbody {\n  margin:0;\n}\n\n#mocha {\n  font: 20px/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif;\n  margin: 60px 50px;\n}\n\n#mocha ul,\n#mocha li {\n  margin: 0;\n  padding: 0;\n}\n\n#mocha ul {\n  list-style: none;\n}\n\n#mocha h1,\n#mocha h2 {\n  margin: 0;\n}\n\n#mocha h1 {\n  margin-top: 15px;\n  font-size: 1em;\n  font-weight: 200;\n}\n\n#mocha h1 a {\n  text-decoration: none;\n  color: inherit;\n}\n\n#mocha h1 a:hover {\n  text-decoration: underline;\n}\n\n#mocha .suite .suite h1 {\n  margin-top: 0;\n  font-size: .8em;\n}\n\n#mocha .hidden {\n  display: none;\n}\n\n#mocha h2 {\n  font-size: 12px;\n  font-weight: normal;\n  cursor: pointer;\n}\n\n#mocha .suite {\n  margin-left: 15px;\n}\n\n#mocha .test {\n  margin-left: 15px;\n  overflow: hidden;\n}\n\n#mocha .test.pending:hover h2::after {\n  content: \'(pending)\';\n  font-family: arial, sans-serif;\n}\n\n#mocha .test.pass.medium .duration {\n  background: #c09853;\n}\n\n#mocha .test.pass.slow .duration {\n  background: #b94a48;\n}\n\n#mocha .test.pass::before {\n  content: \'✓\';\n  font-size: 12px;\n  display: block;\n  float: left;\n  margin-right: 5px;\n  color: #00d6b2;\n}\n\n#mocha .test.pass .duration {\n  font-size: 9px;\n  margin-left: 5px;\n  padding: 2px 5px;\n  color: #fff;\n  -webkit-box-shadow: inset 0 1px 1px rgba(0,0,0,.2);\n  -moz-box-shadow: inset 0 1px 1px rgba(0,0,0,.2);\n  box-shadow: inset 0 1px 1px rgba(0,0,0,.2);\n  -webkit-border-radius: 5px;\n  -moz-border-radius: 5px;\n  -ms-border-radius: 5px;\n  -o-border-radius: 5px;\n  border-radius: 5px;\n}\n\n#mocha .test.pass.fast .duration {\n  display: none;\n}\n\n#mocha .test.pending {\n  color: #0b97c4;\n}\n\n#mocha .test.pending::before {\n  content: \'◦\';\n  color: #0b97c4;\n}\n\n#mocha .test.fail {\n  color: #c00;\n}\n\n#mocha .test.fail pre {\n  color: black;\n}\n\n#mocha .test.fail::before {\n  content: \'✖\';\n  font-size: 12px;\n  display: block;\n  float: left;\n  margin-right: 5px;\n  color: #c00;\n}\n\n#mocha .test pre.error {\n  color: #c00;\n  max-height: 300px;\n  overflow: auto;\n}\n\n/**\n * (1): approximate for browsers not supporting calc\n * (2): 42 = 2*15 + 2*10 + 2*1 (padding + margin + border)\n *      ^^ seriously\n */\n#mocha .test pre {\n  display: block;\n  float: left;\n  clear: left;\n  font: 12px/1.5 monaco, monospace;\n  margin: 5px;\n  padding: 15px;\n  border: 1px solid #eee;\n  max-width: 85%; /*(1)*/\n  max-width: calc(100% - 42px); /*(2)*/\n  word-wrap: break-word;\n  border-bottom-color: #ddd;\n  -webkit-border-radius: 3px;\n  -webkit-box-shadow: 0 1px 3px #eee;\n  -moz-border-radius: 3px;\n  -moz-box-shadow: 0 1px 3px #eee;\n  border-radius: 3px;\n}\n\n#mocha .test h2 {\n  position: relative;\n}\n\n#mocha .test a.replay {\n  position: absolute;\n  top: 3px;\n  right: 0;\n  text-decoration: none;\n  vertical-align: middle;\n  display: block;\n  width: 15px;\n  height: 15px;\n  line-height: 15px;\n  text-align: center;\n  background: #eee;\n  font-size: 15px;\n  -moz-border-radius: 15px;\n  border-radius: 15px;\n  -webkit-transition: opacity 200ms;\n  -moz-transition: opacity 200ms;\n  transition: opacity 200ms;\n  opacity: 0.3;\n  color: #888;\n}\n\n#mocha .test:hover a.replay {\n  opacity: 1;\n}\n\n#mocha-report.pass .test.fail {\n  display: none;\n}\n\n#mocha-report.fail .test.pass {\n  display: none;\n}\n\n#mocha-report.pending .test.pass,\n#mocha-report.pending .test.fail {\n  display: none;\n}\n#mocha-report.pending .test.pass.pending {\n  display: block;\n}\n\n#mocha-error {\n  color: #c00;\n  font-size: 1.5em;\n  font-weight: 100;\n  letter-spacing: 1px;\n}\n\n#mocha-stats {\n  position: fixed;\n  top: 15px;\n  right: 10px;\n  font-size: 12px;\n  margin: 0;\n  color: #888;\n  z-index: 1;\n}\n\n#mocha-stats .progress {\n  float: right;\n  padding-top: 0;\n}\n\n#mocha-stats em {\n  color: black;\n}\n\n#mocha-stats a {\n  text-decoration: none;\n  color: inherit;\n}\n\n#mocha-stats a:hover {\n  border-bottom: 1px solid #eee;\n}\n\n#mocha-stats li {\n  display: inline-block;\n  margin: 0 5px;\n  list-style: none;\n  padding-top: 11px;\n}\n\n#mocha-stats canvas {\n  width: 40px;\n  height: 40px;\n}\n\n#mocha code .comment { color: #ddd; }\n#mocha code .init { color: #2f6fad; }\n#mocha code .string { color: #5890ad; }\n#mocha code .keyword { color: #8a6343; }\n#mocha code .number { color: #2f6fad; }\n\n@media screen and (max-device-width: 480px) {\n  #mocha {\n    margin: 60px 0px;\n  }\n\n  #mocha #stats {\n    position: absolute;\n  }\n}\n';
document.head.appendChild(style);
})();
// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
//
// This code may only be used under the BSD style license found at polymer.github.io/LICENSE.txt
// The complete set of authors may be found at polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also subject to
// an additional IP rights grant found at polymer.github.io/PATENTS.txt
(function(scope) {
'use strict';

function parse(stack) {
  var rawLines = stack.split('\n');

  var stackyLines = compact(rawLines.map(parseStackyLine));
  if (stackyLines.length === rawLines.length) return stackyLines;

  var v8Lines = compact(rawLines.map(parseV8Line));
  if (v8Lines.length > 0) return v8Lines;

  var geckoLines = compact(rawLines.map(parseGeckoLine));
  if (geckoLines.length > 0) return geckoLines;

  throw new Error('Unknown stack format: ' + stack);
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/Stack
var GECKO_LINE = /^(?:([^@]*)@)?(.*?):(\d+)(?::(\d+))?$/;

function parseGeckoLine(line) {
  var match = line.match(GECKO_LINE);
  if (!match) return null;
  return {
    method:   match[1] || '',
    location: match[2] || '',
    line:     parseInt(match[3]) || 0,
    column:   parseInt(match[4]) || 0,
  };
}

// https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
var V8_OUTER1 = /^\s*(eval )?at (.*) \((.*)\)$/;
var V8_OUTER2 = /^\s*at()() (\S+)$/;
var V8_INNER  = /^\(?([^\(]+):(\d+):(\d+)\)?$/;

function parseV8Line(line) {
  var outer = line.match(V8_OUTER1) || line.match(V8_OUTER2);
  if (!outer) return null;
  var inner = outer[3].match(V8_INNER);
  if (!inner) return null;

  var method = outer[2] || '';
  if (outer[1]) method = 'eval at ' + method;
  return {
    method:   method,
    location: inner[1] || '',
    line:     parseInt(inner[2]) || 0,
    column:   parseInt(inner[3]) || 0,
  };
}

// Stacky.formatting.pretty

var STACKY_LINE = /^\s*(.+) at (.+):(\d+):(\d+)$/;

function parseStackyLine(line) {
  var match = line.match(STACKY_LINE);
  if (!match) return null;
  return {
    method:   match[1] || '',
    location: match[2] || '',
    line:     parseInt(match[3]) || 0,
    column:   parseInt(match[4]) || 0,
  };
}

// Helpers

function compact(array) {
  var result = [];
  array.forEach(function(value) {
    if (value) {
      result.push(value);
    }
  });
  return result;
}

scope.parse           = parse;
scope.parseGeckoLine  = parseGeckoLine;
scope.parseV8Line     = parseV8Line;
scope.parseStackyLine = parseStackyLine;
})(typeof module !== 'undefined' ? module.exports : (this.Stacky = this.Stacky || {}));

// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
//
// This code may only be used under the BSD style license found at polymer.github.io/LICENSE.txt
// The complete set of authors may be found at polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also subject to
// an additional IP rights grant found at polymer.github.io/PATENTS.txt
(function(scope) {
'use strict';

var parse = scope.parse || require('./parsing').parse;

scope.defaults = {
  // Methods are aligned up to this much padding.
  maxMethodPadding: 40,
  // A string to prefix each line with.
  indent: '',
  // A string to show for stack lines that are missing a method.
  methodPlaceholder: '<unknown>',
  // A list of Strings/RegExps that will be stripped from `location` values on
  // each line (via `String#replace`).
  locationStrip: [],
  // A list of Strings/RegExps that indicate that a line is *not* important, and
  // should be styled as such.
  unimportantLocation: [],
  // A filter function to completely remove lines
  filter: function() { return false; },
  // styles are functions that take a string and return that string when styled.
  styles: {
    method:      passthrough,
    location:    passthrough,
    line:        passthrough,
    column:      passthrough,
    unimportant: passthrough,
  },
};

// For Stacky-in-Node, we default to colored stacks.
if (typeof require === 'function') {
  var chalk = require('chalk');

  scope.defaults.styles = {
    method:      chalk.magenta,
    location:    chalk.blue,
    line:        chalk.cyan,
    column:      chalk.cyan,
    unimportant: chalk.dim,
  };
}

function pretty(stackOrParsed, options) {
  options = mergeDefaults(options || {}, scope.defaults);
  var lines = Array.isArray(stackOrParsed) ? stackOrParsed : parse(stackOrParsed);
  lines = clean(lines, options);

  var padSize = methodPadding(lines, options);
  var parts = lines.map(function(line) {
    var method   = line.method || options.methodPlaceholder;
    var pad      = options.indent + padding(padSize - method.length);
    var location = [
      options.styles.location(line.location),
      options.styles.line(line.line),
      options.styles.column(line.column),
    ].join(':');

    var text = pad + options.styles.method(method) + ' at ' + location;
    if (!line.important) {
      text = options.styles.unimportant(text);
    }
    return text;
  });

  return parts.join('\n');
}

function clean(lines, options) {
  var result = [];
  for (var i = 0, line; line = lines[i]; i++) {
    if (options.filter(line)) continue;
    line.location  = cleanLocation(line.location, options);
    line.important = isImportant(line, options);
    result.push(line);
  }

  return result;
}

// Utility

function passthrough(string) {
  return string;
}

function mergeDefaults(options, defaults) {
  var result = Object.create(defaults);
  Object.keys(options).forEach(function(key) {
    var value = options[key];
    if (typeof value === 'object' && !Array.isArray(value)) {
      value = mergeDefaults(value, defaults[key]);
    }
    result[key] = value;
  });
  return result;
}

function methodPadding(lines, options) {
  var size = options.methodPlaceholder.length;
  for (var i = 0, line; line = lines[i]; i++) {
    size = Math.min(options.maxMethodPadding, Math.max(size, line.method.length));
  }
  return size;
}

function padding(length) {
  var result = '';
  for (var i = 0; i < length; i++) {
    result = result + ' ';
  }
  return result;
}

function cleanLocation(location, options) {
  if (options.locationStrip) {
    for (var i = 0, matcher; matcher = options.locationStrip[i]; i++) {
      location = location.replace(matcher, '');
    }
  }

  return location;
}

function isImportant(line, options) {
  if (options.unimportantLocation) {
    for (var i = 0, matcher; matcher = options.unimportantLocation[i]; i++) {
      if (line.location.match(matcher)) return false;
    }
  }

  return true;
}

scope.clean  = clean;
scope.pretty = pretty;
})(typeof module !== 'undefined' ? module.exports : (this.Stacky = this.Stacky || {}));


// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
//
// This code may only be used under the BSD style license found at polymer.github.io/LICENSE.txt
// The complete set of authors may be found at polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also subject to
// an additional IP rights grant found at polymer.github.io/PATENTS.txt
(function(scope) {
'use strict';

var parse  = scope.parse  || require('./parsing').parse;
var pretty = scope.pretty || require('./formatting').pretty;

function normalize(error, prettyOptions) {
  if (error.parsedStack) return error;
  var message = error.message || error.description || error || '<unknown error>';
  var parsedStack = [];
  try {
    parsedStack = parse(error.stack || error.toString());
  } catch (error) {
    // Ah well.
  }

  if (parsedStack.length === 0 && error.fileName) {
    parsedStack.push({
      method:   '',
      location: error.fileName,
      line:     error.lineNumber,
      column:   error.columnNumber,
    });
  }

  var prettyStack = message;
  if (parsedStack.length > 0) {
    prettyStack = prettyStack + '\n' + pretty(parsedStack, prettyOptions);
  }

  return {
    message:     message,
    stack:       prettyStack,
    parsedStack: parsedStack,
  };
}

scope.normalize = normalize;
})(typeof module !== 'undefined' ? module.exports : (this.Stacky = this.Stacky || {}));


/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
/**
 * @fileoverview
 *
 * Your entry point into `web-component-tester`'s environment and configuration.
 */
(function() {

var WCT = window.WCT = {
  reporters: {},
};

// Configuration

/** By default, we wait for any web component frameworks to load. */
WCT.waitForFrameworks = true;

/** How many `.html` suites that can be concurrently loaded & run. */
WCT.numConcurrentSuites = 1;

// Helpers

// Evaluated in mocha/run.js.
WCT._suitesToLoad = [];
WCT._dependencies = [];

// Used to share data between subSuites on client and reporters on server
WCT.share = {};

/**
 * Loads suites of tests, supporting `.js` as well as `.html` files.
 *
 * @param {!Array.<string>} files The files to load.
 */
WCT.loadSuites = function loadSuites(files) {
  files.forEach(function(file) {
    if (file.slice(-3) === '.js') {
      WCT._dependencies.push(file);
    } else if (file.slice(-5) === '.html') {
      WCT._suitesToLoad.push(file);
    } else {
      throw new Error('Unknown resource type: ' + file);
    }
  });
};

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.util = {};

/**
 * @param {function()} callback A function to call when the active web component
 *     frameworks have loaded.
 */
WCT.util.whenFrameworksReady = function(callback) {
  WCT.util.debug(window.location.pathname, 'WCT.util.whenFrameworksReady');
  var done = function() {
    WCT.util.debug(window.location.pathname, 'WCT.util.whenFrameworksReady done');
    callback();
  };

  function importsReady() {
    window.removeEventListener('HTMLImportsLoaded', importsReady);
    WCT.util.debug(window.location.pathname, 'HTMLImportsLoaded');

    if (window.Polymer && Polymer.whenReady) {
      Polymer.whenReady(function() {
        WCT.util.debug(window.location.pathname, 'polymer-ready');
        done();
      });
    } else {
      done();
    }
  }

  // All our supported framework configurations depend on imports.
  if (!window.HTMLImports) {
    done();
  } else if (HTMLImports.ready) {
    importsReady();
  } else {
    window.addEventListener('HTMLImportsLoaded', importsReady);
  }
};

/**
 * @param {number} count
 * @param {string} kind
 * @return {string} '<count> <kind> tests' or '<count> <kind> test'.
 */
WCT.util.pluralizedStat = function pluralizedStat(count, kind) {
  if (count === 1) {
    return count + ' ' + kind + ' test';
  } else {
    return count + ' ' + kind + ' tests';
  }
};

/**
 * @param {string} path The URI of the script to load.
 * @param {function} done
 */
WCT.util.loadScript = function loadScript(path, done) {
  var script = document.createElement('script');
  script.src = path + '?' + Math.random();
  script.onload = done.bind(null, null);
  script.onerror = done.bind(null, 'Failed to load script ' + script.src);
  document.head.appendChild(script);
};

/**
 * @param {...*} var_args Logs values to the console when `WCT.debug` is true.
 */
WCT.util.debug = function debug(var_args) {
  if (!WCT.debug) return;
  console.debug.apply(console, arguments);
};

// URL Processing

/**
 * @param {string} opt_query A query string to parse.
 * @return {!Object.<string, !Array.<string>>} All params on the URL's query.
 */
WCT.util.getParams = function getParams(opt_query) {
  var query = opt_query || window.location.search;
  if (query.substring(0, 1) === '?') {
    query = query.substring(1);
  }
  // python's SimpleHTTPServer tacks a `/` on the end of query strings :(
  if (query.slice(-1) === '/') {
    query = query.substring(0, query.length - 1);
  }
  if (query === '') return {};

  var result = {};
  query.split('&').forEach(function(part) {
    var pair = part.split('=');
    if (pair.length !== 2) {
      console.warn('Invalid URL query part:', part);
      return;
    }
    var key   = decodeURIComponent(pair[0]);
    var value = decodeURIComponent(pair[1]);

    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(value);
  });

  return result;
};

/**
 * @param {string} param The param to return a value for.
 * @return {?string} The first value for `param`, if found.
 */
WCT.util.getParam = function getParam(param) {
  var params = WCT.util.getParams();
  return params[param] ? params[param][0] : null;
};

/**
 * @param {!Object.<string, !Array.<string>>} params
 * @return {string} `params` encoded as a URI query.
 */
WCT.util.paramsToQuery = function paramsToQuery(params) {
  var pairs = [];
  Object.keys(params).forEach(function(key) {
    params[key].forEach(function(value) {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
  });
  return '?' + pairs.join('&');
};

/** @return {string} `location` relative to the current window. */
WCT.util.relativeLocation = function relativeLocation(location) {
  var path = location.pathname;
  var basePath = window.location.pathname.match(/^.*\//)[0];
  if (path.indexOf(basePath) === 0) {
    path = path.substring(basePath.length);
  }
  return path;
};

/**
 * Like `async.parallelLimit`, but our own so that we don't force a dependency
 * on downstream code.
 *
 * @param {!Array.<function(function(*))>} runners Runners that call their given
 *     Node-style callback when done.
 * @param {number|function(*)} limit Maximum number of concurrent runners.
 *     (optional).
 * @param {?function(*)} done Callback that should be triggered once all runners
 *     have completed, or encountered an error.
 */
WCT.util.parallel = function parallel(runners, limit, done) {
  if (typeof limit !== 'number') {
    done  = limit;
    limit = 0;
  }
  if (!runners.length) return done();

  var called    = false;
  var total     = runners.length;
  var numActive = 0;
  var numDone   = 0;

  function runnerDone(error) {
    if (called) return;
    numDone = numDone + 1;
    numActive = numActive - 1;

    if (error || numDone >= total) {
      called = true;
      done(error);
    } else {
      runOne();
    }
  }

  function runOne() {
    if (limit && numActive >= limit) return;
    if (!runners.length) return;
    numActive = numActive + 1;
    runners.shift()(runnerDone);
  }
  runners.forEach(runOne);
};

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.CLISocket = CLISocket;

var SOCKETIO_ENDPOINT = window.location.protocol + '//' + window.location.host;
var SOCKETIO_LIBRARY  = SOCKETIO_ENDPOINT + '/socket.io/socket.io.js';

/**
 * A socket for communication between the CLI and browser runners.
 *
 * @param {string} browserId An ID generated by the CLI runner.
 * @param {!io.Socket} socket The socket.io `Socket` to communicate over.
 */
function CLISocket(browserId, socket) {
  this.browserId = browserId;
  this.socket    = socket;
}

/**
 * @param {!Mocha.Runner} runner The Mocha `Runner` to observe, reporting
 *     interesting events back to the CLI runner.
 */
CLISocket.prototype.observe = function observe(runner) {
  this.emitEvent('browser-start', {
    url: window.location.toString(),
  });

  // We only emit a subset of events that we care about, and follow a more
  // general event format that is hopefully applicable to test runners beyond
  // mocha.
  //
  // For all possible mocha events, see:
  // https://github.com/visionmedia/mocha/blob/master/lib/runner.js#L36
  runner.on('test', function(test) {
    this.emitEvent('test-start', {test: getTitles(test)});
  }.bind(this));

  runner.on('test end', function(test) {
    this.emitEvent('test-end', {
      state:    getState(test),
      test:     getTitles(test),
      duration: test.duration,
      error:    test.err,
    });
  }.bind(this));

  runner.on('subSuite start', function(subSuite) {
    this.emitEvent('sub-suite-start', subSuite.share);
  }.bind(this));

  runner.on('subSuite end', function(subSuite) {
    this.emitEvent('sub-suite-end', subSuite.share);
  }.bind(this));

  runner.on('end', function() {
    this.emitEvent('browser-end');
  }.bind(this));
};

/**
 * @param {string} event The name of the event to fire.
 * @param {*} data Additional data to pass with the event.
 */
CLISocket.prototype.emitEvent = function emitEvent(event, data) {
  this.socket.emit('client-event', {
    browserId: this.browserId,
    event:     event,
    data:      data,
  });
};

/**
 * Builds a `CLISocket` if we are within a CLI-run environment; short-circuits
 * otherwise.
 *
 * @param {function(*, CLISocket)} done Node-style callback.
 */
CLISocket.init = function init(done) {
  var browserId = WCT.util.getParam('cli_browser_id');
  if (!browserId) return done();

  WCT.util.loadScript(SOCKETIO_LIBRARY, function(error) {
    if (error) return done(error);

    var socket = io(SOCKETIO_ENDPOINT);
    socket.on('error', function(error) {
      socket.off();
      done(error);
    });

    socket.on('connect', function() {
      socket.off();
      done(null, new CLISocket(browserId, socket));
    });
  });
};

// Misc Utility

/**
 * @param {!Mocha.Runnable} runnable The test or suite to extract titles from.
 * @return {!Array.<string>} The titles of the runnable and its parents.
 */
function getTitles(runnable) {
  var titles = [];
  while (runnable && !runnable.root && runnable.title) {
    titles.unshift(runnable.title);
    runnable = runnable.parent;
  }
  return titles;
}

/**
 * @param {!Mocha.Runnable} runnable
 * @return {string}
 */
function getState(runnable) {
  if (runnable.state === 'passed') {
    return 'passing';
  } else if (runnable.state == 'failed') {
    return 'failing';
  } else if (runnable.pending) {
    return 'pending';
  } else {
    return 'unknown';
  }
}

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

// TODO(thedeeno): Consider renaming subsuite. IIRC, subSuite is entirely
// distinct from mocha suite, which tripped me up badly when trying to add
// plugin support. Perhaps something like 'batch', or 'bundle'. Something that
// has no mocha correlate. This may also eliminate the need for root/non-root
// suite distinctions.

/**
 * A Mocha suite (or suites) run within a child iframe, but reported as if they
 * are part of the current context.
 */
function SubSuite(url, parentScope) {
  var params = WCT.util.getParams(parentScope.location.search);
  delete params.cli_browser_id;
  params.bust = [Math.random()];

  this.url         = url + WCT.util.paramsToQuery(params);
  this.parentScope = parentScope;

  this.state = 'initializing';
}
WCT.SubSuite = SubSuite;

// SubSuites get a pretty generous load timeout by default.
SubSuite.loadTimeout = 30000;

// We can't maintain properties on iframe elements in Firefox/Safari/???, so we
// track subSuites by URL.
SubSuite._byUrl = {};

/**
 * @return {SubSuite} The `SubSuite` that was registered for this window.
 */
SubSuite.current = function() {
  return SubSuite.get(window);
};

/**
 * @param {!Window} target A window to find the SubSuite of.
 * @param {boolean} traversal Whether this is a traversal from a child window.
 * @return {SubSuite} The `SubSuite` that was registered for `target`.
 */
SubSuite.get = function(target, traversal) {
  var subSuite = SubSuite._byUrl[target.location.href];
  if (subSuite) return subSuite;
  if (window.parent === window) {
    if (traversal) {
      // I really hope there's no legit case for this. Infinite reloads are no good.
      console.warn('Subsuite loaded but was never registered. This most likely is due to wonky history behavior. Reloading...');
      window.location.reload();
    } else {
      return null;
    }
  }
  // Otherwise, traverse.
  return window.parent.WCT.SubSuite.get(target, true);
};

/**
 * Hangs a reference to the SubSuite's iframe-local wct object
 *
 * TODO(thedeeno): This method is odd to document so the achitecture might need
 * a little rework here. Maybe another named concept? Seeing WCT everywhere is
 * pretty confusing. Also, I don't think we need the parentScope.WCT; to limit
 * confusion I didn't include it.
 *
 * @param {object} wct The SubSuite's iframe-local wct object
 */
SubSuite.prototype.prepare = function(wct) {
  this.share = wct.share;
};

/**
 * Loads and runs the subsuite.
 *
 * @param {function} done Node-style callback.
 */
SubSuite.prototype.run = function(done) {
  WCT.util.debug('SubSuite#run', this.url);
  this.state = 'loading';
  this.onRunComplete = done;

  this.iframe = document.createElement('iframe');
  this.iframe.src = this.url;
  this.iframe.classList.add('subsuite');

  var container = document.getElementById('subsuites');
  if (!container) {
    container = document.createElement('div');
    container.id = 'subsuites';
    document.body.appendChild(container);
  }
  container.appendChild(this.iframe);

  // let the iframe expand the URL for us.
  this.url = this.iframe.src;
  SubSuite._byUrl[this.url] = this;

  this.timeoutId = setTimeout(
      this.loaded.bind(this, new Error('Timed out loading ' + this.url)), SubSuite.loadTimeout);

  this.iframe.addEventListener('error',
      this.loaded.bind(this, new Error('Failed to load document ' + this.url)));

  this.iframe.contentWindow.addEventListener('DOMContentLoaded', this.loaded.bind(this, null));
};

/**
 * Called when the sub suite's iframe has loaded (or errored during load).
 *
 * @param {*} error The error that occured, if any.
 */
SubSuite.prototype.loaded = function(error) {
  WCT.util.debug('SubSuite#loaded', this.url, error);
  if (this.timeoutId) {
    clearTimeout(this.timeoutId);
  }
  if (error) {
    this.signalRunComplete(error);
    this.done();
  }
};

/** Called when the sub suite's tests are complete, so that it can clean up. */
SubSuite.prototype.done = function done() {
  WCT.util.debug('SubSuite#done', this.url, arguments);

  this.signalRunComplete();

  if (!this.iframe) return;
  this.iframe.parentNode.removeChild(this.iframe);
};

SubSuite.prototype.signalRunComplete = function signalRunComplete(error) {
  if (!this.onRunComplete) return;
  this.state = 'complete';
  this.onRunComplete(error);
  this.onRunComplete = null;
};

})();

(function() {
var style = document.createElement('style');
style.textContent = '/**\n * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.\n * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt\n * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt\n * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt\n * Code distributed by Google as part of the polymer project is also\n * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt\n */\nhtml, body {\n  height: 100%;\n  width:  100%;\n}\n\n#mocha, #subsuites {\n  height: 100%;\n  position: absolute;\n  top: 0;\n  width: 50%;\n}\n\n#mocha {\n  box-sizing: border-box;\n  margin: 0 !important;\n  overflow-y: auto;\n  padding: 60px 50px;\n  right: 0;\n}\n\n#subsuites {\n  -ms-flex-direction: column;\n  -webkit-flex-direction: column;\n  display: -ms-flexbox;\n  display: -webkit-flex;\n  display: flex;\n  flex-direction: column;\n  left: 0;\n}\n\n#subsuites .subsuite {\n  border: 0;\n  width: 100%;\n  height: 100%;\n}\n\n#mocha .test.pass .duration {\n  color: #555;\n}\n';
document.head.appendChild(style);
})();
/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

// polymer-test-tools (and Polymer/tools) support HTML tests where each file is
// expected to call `done()`, which posts a message to the parent window.
window.addEventListener('message', function(event) {
  if (!event.data || (event.data !== 'ok' && !event.data.error)) return;
  var subSuite = WCT.SubSuite.get(event.source);
  if (!subSuite) return;

  // The name of the suite as exposed to the user.
  var path = WCT.util.relativeLocation(event.source.location);
  var parentRunner = subSuite.parentScope.WCT._multiRunner;
  parentRunner.emitOutOfBandTest('page-wide tests via global done()', event.data.error, path, true);

  subSuite.done();
});

// Attempt to ensure that we complete a test suite if it is interrupted by a
// document unload.
window.addEventListener('unload', function(event) {
  // Mocha's hook queue is asynchronous; but we want synchronous behavior if
  // we've gotten to the point of unloading the document.
  Mocha.Runner.immediately = function(callback) { callback(); };
});

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

/**
 * Runs `stepFn`, catching any error and passing it to `callback` (Node-style).
 * Otherwise, calls `callback` with no arguments on success.
 *
 * @param {function()} callback
 * @param {function()} stepFn
 */
window.safeStep = function safeStep(callback, stepFn) {
  var err;
  try {
    stepFn();
  } catch (error) {
    err = error;
  }
  callback(err);
};

/**
 * Runs your test at declaration time (before Mocha has begun tests). Handy for
 * when you need to test document initialization.
 *
 * Be aware that any errors thrown asynchronously cannot be tied to your test.
 * You may want to catch them and pass them to the done event, instead. See
 * `safeStep`.
 *
 * @param {string} name The name of the test.
 * @param {function(?function())} testFn The test function. If an argument is
 *     accepted, the test will be treated as async, just like Mocha tests.
 */
window.testImmediate = function testImmediate(name, testFn) {
  if (testFn.length > 0) {
    return testImmediateAsync(name, testFn);
  }

  var err;
  try {
    testFn();
  } catch (error) {
    err = error;
  }

  test(name, function(done) {
    done(err);
  });
};

/**
 * An async-only variant of `testImmediate`.
 *
 * @param {string} name
 * @param {function(?function())} testFn
 */
window.testImmediateAsync = function testImmediateAsync(name, testFn) {
  var testComplete = false;
  var err;

  test(name, function(done) {
    var intervalId = setInterval(function() {
      if (!testComplete) return;
      clearInterval(intervalId);
      done(err);
    }, 10);
  });

  try {
    testFn(function(error) {
      if (error) err = error;
      testComplete = true;
    });
  } catch (error) {
    err = error;
  }
};

/**
 * Triggers a flush of any pending events, observations, etc and calls you back
 * after they have been processed.
 *
 * @param {function()} callback
 */
window.flush = function flush(callback) {
  // Ideally, this function would be a call to Polymer.flush, but that doesn't
  // support a callback yet (https://github.com/Polymer/polymer-dev/issues/115),
  // ...and there's cross-browser flakiness to deal with.

  // Make sure that we're invoking the callback with no arguments so that the
  // caller can pass Mocha callbacks, etc.
  var done = function done() { callback(); };

  // Because endOfMicrotask is flaky for IE, we perform microtask checkpoints
  // ourselves (https://github.com/Polymer/polymer-dev/issues/114):
  var isIE = navigator.appName == 'Microsoft Internet Explorer';
  if (isIE && window.Platform && window.Platform.performMicrotaskCheckpoint) {
    var reallyDone = done;
    done = function doneIE() {
      Platform.performMicrotaskCheckpoint();
      setTimeout(reallyDone, 0);
    };
  }

  // Everyone else gets a regular flush.
  var scope = window.Polymer || window.WebComponents;
  if (scope && scope.flush) {
    scope.flush();
  }

  // Ensure that we are creating a new _task_ to allow all active microtasks to
  // finish (the code you're testing may be using endOfMicrotask, too).
  setTimeout(done, 0);
};

/**
 * DEPRECATED: Use `flush`.
 * @param {function} callback
 */
window.asyncPlatformFlush = function asyncPlatformFlush(callback) {
  console.warn('asyncPlatformFlush is deprecated in favor of the more terse flush()');
  return window.flush(callback);
};

/**
 *
 */
window.waitFor = function waitFor(fn, next, intervalOrMutationEl, timeout, timeoutTime) {
  timeoutTime = timeoutTime || Date.now() + (timeout || 1000);
  intervalOrMutationEl = intervalOrMutationEl || 32;
  try {
    fn();
  } catch (e) {
    if (Date.now() > timeoutTime) {
      throw e;
    } else {
      if (isNaN(intervalOrMutationEl)) {
        intervalOrMutationEl.onMutation(intervalOrMutationEl, function() {
          waitFor(fn, next, intervalOrMutationEl, timeout, timeoutTime);
        });
      } else {
        setTimeout(function() {
          waitFor(fn, next, intervalOrMutationEl, timeout, timeoutTime);
        }, intervalOrMutationEl);
      }
      return;
    }
  }
  next();
};

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.MultiRunner = MultiRunner;

var STACKY_CONFIG = {
  indent: '  ',
  locationStrip: [
    /^https?:\/\/[^\/]+/,
    /\?[\d\.]+$/,
  ],
  filter: function(line) {
    return line.location.match(/web-component-tester\/browser.js/);
  },
};

// https://github.com/visionmedia/mocha/blob/master/lib/runner.js#L36-46
var MOCHA_EVENTS = [
  'start',
  'end',
  'suite',
  'suite end',
  'test',
  'test end',
  'hook',
  'hook end',
  'pass',
  'fail',
  'pending',
];

// Until a suite has loaded, we assume this many tests in it.
var ESTIMATED_TESTS_PER_SUITE = 3;

/**
 * A Mocha-like runner that combines the output of multiple Mocha suites.
 *
 * @param {number} numSuites The number of suites that will be run, in order to
 *     estimate the total number of tests that will be performed.
 * @param {!Array.<!Mocha.reporters.Base>} reporters The set of reporters that
 *     should receive the unified event stream.
 */
function MultiRunner(numSuites, reporters) {
  this.reporters = reporters.map(function(reporter) {
    return new reporter(this);
  }.bind(this));

  this.total = numSuites * ESTIMATED_TESTS_PER_SUITE;
  // Mocha reporters assume a stream of events, so we have to be careful to only
  // report on one runner at a time...
  this.currentRunner = null;
  // ...while we buffer events for any other active runners.
  this.pendingEvents = [];

  this.emit('start');
}
// Mocha doesn't expose its `EventEmitter` shim directly, so:
MultiRunner.prototype = Object.create(Object.getPrototypeOf(Mocha.Runner.prototype));

/**
 * @return {!Mocha.reporters.Base} A reporter-like "class" for each child suite
 *     that should be passed to `mocha.run`.
 */
MultiRunner.prototype.childReporter = function childReporter(name) {
  // The reporter is used as a constructor, so we can't depend on `this` being
  // properly bound.
  var self = this;
  function reporter(runner) {
    runner.name = name;
    self.bindChildRunner(runner);
  }
  reporter.title = name;
  return reporter;
};

/** Must be called once all runners have finished. */
MultiRunner.prototype.done = function done() {
  this.complete = true;
  this.emit('end');
  this.flushPendingEvents();
};

/**
 * Emit a top level test that is not part of any suite managed by this runner.
 *
 * Helpful for reporting on global errors, loading issues, etc.
 *
 * @param {string} title The title of the test.
 * @param {*} opt_error An error associated with this test. If falsy, test is
 *     considered to be passing.
 * @param {string} opt_suiteTitle Title for the suite that's wrapping the test.
 * @param {?boolean} opt_estimated If this test was included in the original
 *     estimate of `numSuites`.
 */
MultiRunner.prototype.emitOutOfBandTest = function emitOutOfBandTest(title, opt_error, opt_suiteTitle, opt_estimated) {
  WCT.util.debug('MultiRunner#emitOutOfBandTest(', arguments, ')');
  var root = new Mocha.Suite();
  root.title = opt_suiteTitle;
  var test = new Mocha.Test(title, function() {
  });
  test.parent = root;
  test.state  = opt_error ? 'failed' : 'passed';
  test.err    = opt_error;

  if (!opt_estimated) {
    this.total = this.total + ESTIMATED_TESTS_PER_SUITE;
  }

  var runner = {total: 1};
  this.proxyEvent('start', runner);
  this.proxyEvent('suite', runner, root);
  this.proxyEvent('test', runner, test);
  if (opt_error) {
    this.proxyEvent('fail', runner, test, opt_error);
  } else {
    this.proxyEvent('pass', runner, test);
  }
  this.proxyEvent('test end', runner, test);
  this.proxyEvent('suite end', runner, root);
  this.proxyEvent('end', runner);
};

// Internal Interface

/** @param {!Mocha.runners.Base} runner The runner to listen to events for. */
MultiRunner.prototype.bindChildRunner = function bindChildRunner(runner) {
  MOCHA_EVENTS.forEach(function(eventName) {
    runner.on(eventName, this.proxyEvent.bind(this, eventName, runner));
  }.bind(this));
};

/**
 * Evaluates an event fired by `runner`, proxying it forward or buffering it.
 *
 * @param {string} eventName
 * @param {!Mocha.runners.Base} runner The runner that emitted this event.
 * @param {...*} var_args Any additional data passed as part of the event.
 */
MultiRunner.prototype.proxyEvent = function proxyEvent(eventName, runner, var_args) {
  var extraArgs = Array.prototype.slice.call(arguments, 2);
  if (this.complete) {
    console.warn('out of order Mocha event for ' + runner.name + ':', eventName, extraArgs);
    return;
  }

  if (this.currentRunner && runner !== this.currentRunner) {
    this.pendingEvents.push(arguments);
    return;
  }
  WCT.util.debug('MultiRunner#proxyEvent(', arguments, ')');

  // This appears to be a Mocha bug: Tests failed by passing an error to their
  // done function don't set `err` properly.
  //
  // TODO(nevir): Track down.
  if (eventName === 'fail' && !extraArgs[0].err) {
    extraArgs[0].err = extraArgs[1];
  }

  if (eventName === 'start') {
    this.onRunnerStart(runner);
  } else if (eventName === 'end') {
    this.onRunnerEnd(runner);
  } else {
    this.cleanEvent(eventName, runner, extraArgs);
    this.emit.apply(this, [eventName].concat(extraArgs));
  }
};

/**
 * Cleans or modifies an event if needed.
 *
 * @param {string} eventName
 * @param {!Mocha.runners.Base} runner The runner that emitted this event.
 * @param {!Array.<*>} extraArgs
 */
MultiRunner.prototype.cleanEvent = function cleanEvent(eventName, runner, extraArgs) {
  // Suite hierarchy
  if (extraArgs[0]) {
    extraArgs[0] = this.showRootSuite(extraArgs[0]);
  }

  // Normalize errors
  if (eventName === 'fail') {
    extraArgs[1] = Stacky.normalize(extraArgs[1], STACKY_CONFIG);
  }
  if (extraArgs[0] && extraArgs[0].err) {
    extraArgs[0].err = Stacky.normalize(extraArgs[0].err, STACKY_CONFIG);
  }
};

/**
 * We like to show the root suite's title, which requires a little bit of
 * trickery in the suite hierarchy.
 *
 * @param {!Mocha.Runnable} node
 */
MultiRunner.prototype.showRootSuite = function showRootSuite(node) {
  var leaf = node = Object.create(node);
  while (node && !node.root) {
    var wrappedParent = Object.create(node.parent);
    node.parent = wrappedParent;
    node = wrappedParent;
  }
  node.root = false;

  return leaf;
};

/** @param {!Mocha.runners.Base} runner */
MultiRunner.prototype.onRunnerStart = function onRunnerStart(runner) {
  WCT.util.debug('MultiRunner#onRunnerStart:', runner.name);
  this.total = this.total - ESTIMATED_TESTS_PER_SUITE + runner.total;
  this.currentRunner = runner;
};

/** @param {!Mocha.runners.Base} runner */
MultiRunner.prototype.onRunnerEnd = function onRunnerEnd(runner) {
  WCT.util.debug('MultiRunner#onRunnerEnd:', runner.name);
  this.currentRunner = null;
  this.flushPendingEvents();
};

/**
 * Flushes any buffered events and runs them through `proxyEvent`. This will
 * loop until all buffered runners are complete, or we have run out of buffered
 * events.
 */
MultiRunner.prototype.flushPendingEvents = function flushPendingEvents() {
  var events = this.pendingEvents;
  this.pendingEvents = [];
  events.forEach(function(eventArgs) {
    this.proxyEvent.apply(this, eventArgs);
  }.bind(this));
};

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
/**
 * @fileoverview
 *
 * Runs all tests described by this document, after giving the document a chance
 * to load.
 *
 * If `WCT.waitForFrameworks` is true (the default), we will also wait for any
 * present web component frameworks to have fully initialized as well.
 */
(function() {

// We do a bit of our own grep processing to speed things up.
var grep = WCT.util.getParam('grep');

// environment.js is optional; we need to take a look at our script's URL in
// order to determine how (or not) to load it.
var prefix  = window.WCTPrefix;
var loadEnv = !window.WCTSkipEnvironment;

var scripts = document.querySelectorAll('script[src*="browser.js"]');
if (scripts.length !== 1 && !prefix) {
  throw new Error('Unable to detect root URL for WCT. Please set WCTPrefix before including browser.js');
}
if (scripts[0]) {
  var thisScript = scripts[0].src;
  prefix  = thisScript.substring(0, thisScript.indexOf('browser.js'));
  // You can tack ?skipEnv onto the browser URL to skip the default environment.
  loadEnv = thisScript.indexOf('skipEnv') === -1;
}
if (loadEnv) {
  // Synchronous load so that we can guarantee it is set up for early tests.
  document.write('<script src="' + prefix + 'environment.js"></script>'); // jshint ignore:line
}

// Give any scripts on the page a chance to twiddle the environment.
document.addEventListener('DOMContentLoaded', function() {
  WCT.util.debug('run stage: DOMContentLoaded');
  var subSuite = WCT.SubSuite.current();
  if (subSuite) {
    WCT.util.debug('run stage: subsuite');
    // Give the subsuite time to complete its load (see `SubSuite.load`).
    setTimeout(runSubSuite.bind(null, subSuite), 0);
    return;
  }

  // Before anything else, we need to ensure our communication channel with the
  // CLI runner is established (if we're running in that context). Less
  // buffering to deal with.
  WCT.CLISocket.init(function(error, socket) {
    WCT.util.debug('run stage: WCT.CLISocket.init done', error);
    if (error) throw error;
    var subsuites = WCT._suitesToLoad;
    if (grep) {
      var cleanSubsuites = [];
      for (var i = 0, subsuite; subsuite = subsuites[i]; i++) {
        if (subsuite.indexOf(grep) === 0) {
          cleanSubsuites.push(subsuite);
        }
      }
      subsuites = cleanSubsuites;
    }

    var runner = newMultiSuiteRunner(subsuites, determineReporters(socket));

    loadDependencies(runner, function(error) {
      WCT.util.debug('run stage: loadDependencies done', error);
      if (error) throw error;

      runMultiSuite(runner, subsuites);
    });
  });
});

/**
 * Loads any dependencies of the _current_ suite (e.g. `.js` sources).
 *
 * @param {!WCT.MultiRunner} runner The runner where errors should be reported.
 * @param {function} done A node style callback.
 */
function loadDependencies(runner, done) {
  WCT.util.debug('loadDependencies:', WCT._dependencies);

  function onError(event) {
    runner.emitOutOfBandTest('Test Suite Initialization', event.error);
  }
  window.addEventListener('error', onError);

  var loaders = WCT._dependencies.map(function(file) {
    // We only support `.js` dependencies for now.
    return WCT.util.loadScript.bind(WCT.util, file);
  });

  WCT.util.parallel(loaders, function(error) {
    window.removeEventListener('error', onError);
    done(error);
  });
}

/**
 * @param {!WCT.SubSuite} subSuite The `SubSuite` for this frame, that `mocha`
 *     should be run for.
 */
function runSubSuite(subSuite) {
  WCT.util.debug('runSubSuite', window.location.pathname);
  // Not very pretty.
  var parentWCT = subSuite.parentScope.WCT;
  subSuite.prepare(WCT);

  var suiteName = parentWCT.util.relativeLocation(window.location);
  var reporter  = parentWCT._multiRunner.childReporter(suiteName);
  runMocha(reporter, subSuite.done.bind(subSuite));
}

/**
 * @param {!Array.<string>} subsuites The subsuites that will be run.
 * @param {!Array.<!Mocha.reporters.Base>} reporters The reporters that should
 *     consume the output of this `MultiRunner`.
 * @return {!WCT.MultiRunner} The runner for our root suite.
 */
function newMultiSuiteRunner(subsuites, reporters) {
  WCT.util.debug('newMultiSuiteRunner', window.location.pathname);
  WCT._multiRunner = new WCT.MultiRunner(subsuites.length + 1, reporters);
  return WCT._multiRunner;
}

/**
 * @param {!WCT.MultiRunner} The runner built via `newMultiSuiteRunner`.
 * @param {!Array.<string>} subsuites The subsuites to run.
 */
function runMultiSuite(runner, subsuites) {
  WCT.util.debug('runMultiSuite', window.location.pathname);
  var rootName = WCT.util.relativeLocation(window.location);

  var suiteRunners = [
    // Run the local tests (if any) first, not stopping on error;
    runMocha.bind(null, runner.childReporter(rootName)),
  ];

  // As well as any sub suites. Again, don't stop on error.
  subsuites.forEach(function(file) {
    suiteRunners.push(function(next) {
      var subSuite = new WCT.SubSuite(file, window);
      runner.emit('subSuite start', subSuite);
      subSuite.run(function(error) {
        runner.emit('subSuite end', subSuite);

        if (error) runner.emitOutOfBandTest(file, error);
        next();
      });
    });
  });

  WCT.util.parallel(suiteRunners, WCT.numConcurrentSuites, function(error) {
    WCT.util.debug('runMultiSuite done', error);
    runner.done();
  });
}

/**
 * Kicks off a mocha run, waiting for frameworks to load if necessary.
 *
 * @param {!Mocha.reporters.Base} reporter The reporter to pass to `mocha.run`.
 * @param {function} done A callback fired, _no error is passed_.
 */
function runMocha(reporter, done, waited) {
  if (WCT.waitForFrameworks && !waited) {
    WCT.util.whenFrameworksReady(runMocha.bind(null, reporter, done, true));
    return;
  }
  WCT.util.debug('runMocha', window.location.pathname);

  mocha.reporter(reporter);
  mocha.suite.title = reporter.title;
  mocha.grep(grep);

  // We can't use `mocha.run` because it bashes over grep, invert, and friends.
  // See https://github.com/visionmedia/mocha/blob/master/support/tail.js#L137
  var runner = Mocha.prototype.run.call(mocha, function(error) {
    Mocha.utils.highlightTags('code');
    done();  // We ignore the Mocha failure count.
  });

  // Mocha's default `onerror` handling strips the stack (to support really old
  // browsers). We upgrade this to get better stacks for async errors.
  //
  // TODO(nevir): Can we expand support to other browsers?
  if (navigator.userAgent.match(/chrome/i)) {
    window.onerror = null;
    window.addEventListener('error', function(event) {
      if (!event.error) return;
      if (event.error.ignore) return;
      runner.uncaught(event.error);
    });
  }
}

/**
 * Figure out which reporters should be used for the current `window`.
 *
 * @param {WCT.CLISocket} socket The CLI socket, if present.
 */
function determineReporters(socket) {
  var reporters = [
    WCT.reporters.Title,
    WCT.reporters.Console,
  ];

  if (socket) {
    reporters.push(function(runner) {
      socket.observe(runner);
    });
  }

  if (WCT._suitesToLoad.length > 0 || WCT._dependencies.length > 0) {
    reporters.push(WCT.reporters.HTML);
  }

  return reporters;
}

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
/**
 * @fileoverview
 *
 * Provides automatic configuration of Mocha by stubbing out potential Mocha
 * methods, and configuring Mocha appropriately once you call them.
 *
 * Just call `suite`, `describe`, etc normally, and everything should Just Work.
 */
(function() {

// Mocha global helpers, broken out by testing method.
var MOCHA_EXPORTS = {
  // https://github.com/visionmedia/mocha/blob/master/lib/interfaces/tdd.js
  tdd: [
    'setup',
    'teardown',
    'suiteSetup',
    'suiteTeardown',
    'suite',
    'test',
  ],
  // https://github.com/visionmedia/mocha/blob/master/lib/interfaces/tdd.js
  bdd: [
    'before',
    'after',
    'beforeEach',
    'afterEach',
    'describe',
    'xdescribe',
    'xcontext',
    'it',
    'xit',
    'xspecify',
  ],
};

// We expose all Mocha methods up front, configuring and running mocha
// automatically when you call them.
//
// The assumption is that it is a one-off (sub-)suite of tests being run.
Object.keys(MOCHA_EXPORTS).forEach(function(ui) {
  MOCHA_EXPORTS[ui].forEach(function(key) {
    window[key] = function wrappedMochaFunction() {
      WCT.setupMocha(ui);
      if (!window[key] || window[key] === wrappedMochaFunction) {
        throw new Error('Expected mocha.setup to define ' + key);
      }
      window[key].apply(window, arguments);
    };
  });
});

/**
 * @param {string} ui Sets up mocha to run `ui`-style tests.
 */
WCT.setupMocha = function setupMocha(ui) {
  if (WCT._mochaUI && WCT._mochaUI === ui) return;
  if (WCT._mochaUI && WCT._mochaUI !== ui) {
    throw new Error('Mixing ' + WCT._mochaUI + ' and ' + ui + ' Mocha styles is not supported.');
  }
  mocha.setup({ui: ui, timeout: 60 * 1000});  // Note that the reporter is configured in run.js.
  WCT.mochaIsSetup = true;
};

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.reporters.Console = Console;

// We capture console events when running tests; so make sure we have a
// reference to the original one.
var console = window.console;

var FONT = ';font: normal 13px "Roboto", "Helvetica Neue", "Helvetica", sans-serif;';
var STYLES = {
  plain:   FONT,
  suite:   'color: #5c6bc0' + FONT,
  test:    FONT,
  passing: 'color: #259b24' + FONT,
  pending: 'color: #e65100' + FONT,
  failing: 'color: #c41411' + FONT,
  stack:   'color: #c41411',
  results: FONT + 'font-size: 16px',
};

// I don't think we can feature detect this one...
var userAgent = navigator.userAgent.toLowerCase();
var CAN_STYLE_LOG   = userAgent.match('firefox') || userAgent.match('webkit');
var CAN_STYLE_GROUP = userAgent.match('webkit');
// Track the indent for faked `console.group`
var logIndent = '';

function log(text, style) {
  text = text.split('\n').map(function(l) { return logIndent + l; }).join('\n');
  if (CAN_STYLE_LOG) {
    console.log('%c' + text, STYLES[style] || STYLES.plain);
  } else {
    console.log(text);
  }
}

function logGroup(text, style) {
  if (CAN_STYLE_GROUP) {
    console.group('%c' + text, STYLES[style] || STYLES.plain);
  } else if (console.group) {
    console.group(text);
  } else {
    logIndent = logIndent + '  ';
    log(text, style);
  }
}

function logGroupEnd() {
  if (console.groupEnd) {
    console.groupEnd();
  } else {
    logIndent = logIndent.substr(0, logIndent.length - 2);
  }
}

function logException(error) {
  log(error.stack || error.message || error, 'stack');
}

/**
 * A Mocha reporter that logs results out to the web `console`.
 *
 * @param {!Mocha.Runner} runner The runner that is being reported on.
 */
function Console(runner) {
  Mocha.reporters.Base.call(this, runner);

  runner.on('suite', function(suite) {
    if (suite.root) return;
    logGroup(suite.title, 'suite');
  }.bind(this));

  runner.on('suite end', function(suite) {
    if (suite.root) return;
    logGroupEnd();
  }.bind(this));

  runner.on('test', function(test) {
    logGroup(test.title, 'test');
  }.bind(this));

  runner.on('pending', function(test) {
    logGroup(test.title, 'pending');
  }.bind(this));

  runner.on('fail', function(test, error) {
    logException(error);
  }.bind(this));

  runner.on('test end', function(test) {
    logGroupEnd();
  }.bind(this));

  runner.on('end', this.logSummary.bind(this));
}
Console.prototype = Object.create(Mocha.reporters.Base.prototype);

/** Prints out a final summary of test results. */
Console.prototype.logSummary = function logSummary() {
  logGroup('Test Results', 'results');

  if (this.stats.failures > 0) {
    log(WCT.util.pluralizedStat(this.stats.failures, 'failing'), 'failing');
  }
  if (this.stats.pending > 0) {
    log(WCT.util.pluralizedStat(this.stats.pending, 'pending'), 'pending');
  }
  log(WCT.util.pluralizedStat(this.stats.passes, 'passing'));

  if (!this.stats.failures) {
    log('test suite passed', 'passing');
  }
  log('Evaluated ' + this.stats.tests + ' tests in ' + this.stats.duration + 'ms.');
  logGroupEnd();
};

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.reporters.HTML = HTML;

/**
 * WCT-specific behavior on top of Mocha's default HTML reporter.
 *
 * @param {!Mocha.Runner} runner The runner that is being reported on.
 */
function HTML(runner) {
  var output = document.createElement('div');
  output.id = 'mocha';
  document.body.appendChild(output);

  runner.on('suite', function(test) {
    this.total = runner.total;
  }.bind(this));

  Mocha.reporters.HTML.call(this, runner);
}
HTML.prototype = Object.create(Mocha.reporters.HTML.prototype);

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.reporters.Title = Title;

var ARC_OFFSET = 0; // start at the right.
var ARC_WIDTH  = 6;

/**
 * A Mocha reporter that updates the document's title and favicon with
 * at-a-glance stats.
 *
 * @param {!Mocha.Runner} runner The runner that is being reported on.
 */
function Title(runner) {
  Mocha.reporters.Base.call(this, runner);

  runner.on('test end', this.report.bind(this));
}

/** Reports current stats via the page title and favicon. */
Title.prototype.report = function report() {
  this.updateTitle();
  this.updateFavicon();
};

/** Updates the document title with a summary of current stats. */
Title.prototype.updateTitle = function updateTitle() {
  if (this.stats.failures > 0) {
    document.title = WCT.util.pluralizedStat(this.stats.failures, 'failing');
  } else {
    document.title = WCT.util.pluralizedStat(this.stats.passes, 'passing');
  }
};

/**
 * Draws an arc for the favicon status, relative to the total number of tests.
 *
 * @param {!CanvasRenderingContext2D} context
 * @param {number} total
 * @param {number} start
 * @param {number} length
 * @param {string} color
 */
function drawFaviconArc(context, total, start, length, color) {
  var arcStart = ARC_OFFSET + Math.PI * 2 * (start / total);
  var arcEnd   = ARC_OFFSET + Math.PI * 2 * ((start + length) / total);

  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth   = ARC_WIDTH;
  context.arc(16, 16, 16 - ARC_WIDTH / 2, arcStart, arcEnd);
  context.stroke();
}

/** Updates the document's favicon w/ a summary of current stats. */
Title.prototype.updateFavicon = function updateFavicon() {
  var canvas = document.createElement('canvas');
  canvas.height = canvas.width = 32;
  var context = canvas.getContext('2d');

  var passing = this.stats.passes;
  var pending = this.stats.pending;
  var failing = this.stats.failures;
  var total   = Math.max(this.runner.total, passing + pending + failing);
  drawFaviconArc(context, total, 0,                 passing, '#0e9c57');
  drawFaviconArc(context, total, passing,           pending, '#f3b300');
  drawFaviconArc(context, total, pending + passing, failing, '#ff5621');

  this.setFavicon(canvas.toDataURL());
};

/** Sets the current favicon by URL. */
Title.prototype.setFavicon = function setFavicon(url) {
  var current = document.head.querySelector('link[rel="icon"]');
  if (current) {
    document.head.removeChild(current);
  }

  var link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/x-icon';
  link.href = url;
  link.setAttribute('sizes', '32x32');
  document.head.appendChild(link);
};

})();

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1vY2hhLmpzIiwibW9jaGEuY3NzIiwicGFyc2luZy5qcyIsImZvcm1hdHRpbmcuanMiLCJub3JtYWxpemF0aW9uLmpzIiwiaW5kZXguanMiLCJ1dGlsLmpzIiwiY2xpc29ja2V0LmpzIiwic3Vic3VpdGUuanMiLCJyZXBvcnRlcnMvaHRtbC5jc3MiLCJlbnZpcm9ubWVudC9jb21wYXRhYmlsaXR5LmpzIiwiZW52aXJvbm1lbnQvaGVscGVycy5qcyIsIm1vY2hhL211bHRpcnVubmVyLmpzIiwibW9jaGEvcnVuLmpzIiwibW9jaGEvc2V0dXAuanMiLCJyZXBvcnRlcnMvY29uc29sZS5qcyIsInJlcG9ydGVycy9odG1sLmpzIiwicmVwb3J0ZXJzL3RpdGxlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDOTFMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNqSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDL0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3BNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDdkpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMvSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDclBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3RPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUM5SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImJyb3dzZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyI7KGZ1bmN0aW9uKCl7XG5cbi8vIENvbW1vbkpTIHJlcXVpcmUoKVxuXG5mdW5jdGlvbiByZXF1aXJlKHApe1xuICAgIHZhciBwYXRoID0gcmVxdWlyZS5yZXNvbHZlKHApXG4gICAgICAsIG1vZCA9IHJlcXVpcmUubW9kdWxlc1twYXRoXTtcbiAgICBpZiAoIW1vZCkgdGhyb3cgbmV3IEVycm9yKCdmYWlsZWQgdG8gcmVxdWlyZSBcIicgKyBwICsgJ1wiJyk7XG4gICAgaWYgKCFtb2QuZXhwb3J0cykge1xuICAgICAgbW9kLmV4cG9ydHMgPSB7fTtcbiAgICAgIG1vZC5jYWxsKG1vZC5leHBvcnRzLCBtb2QsIG1vZC5leHBvcnRzLCByZXF1aXJlLnJlbGF0aXZlKHBhdGgpKTtcbiAgICB9XG4gICAgcmV0dXJuIG1vZC5leHBvcnRzO1xuICB9XG5cbnJlcXVpcmUubW9kdWxlcyA9IHt9O1xuXG5yZXF1aXJlLnJlc29sdmUgPSBmdW5jdGlvbiAocGF0aCl7XG4gICAgdmFyIG9yaWcgPSBwYXRoXG4gICAgICAsIHJlZyA9IHBhdGggKyAnLmpzJ1xuICAgICAgLCBpbmRleCA9IHBhdGggKyAnL2luZGV4LmpzJztcbiAgICByZXR1cm4gcmVxdWlyZS5tb2R1bGVzW3JlZ10gJiYgcmVnXG4gICAgICB8fCByZXF1aXJlLm1vZHVsZXNbaW5kZXhdICYmIGluZGV4XG4gICAgICB8fCBvcmlnO1xuICB9O1xuXG5yZXF1aXJlLnJlZ2lzdGVyID0gZnVuY3Rpb24gKHBhdGgsIGZuKXtcbiAgICByZXF1aXJlLm1vZHVsZXNbcGF0aF0gPSBmbjtcbiAgfTtcblxucmVxdWlyZS5yZWxhdGl2ZSA9IGZ1bmN0aW9uIChwYXJlbnQpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ocCl7XG4gICAgICBpZiAoJy4nICE9IHAuY2hhckF0KDApKSByZXR1cm4gcmVxdWlyZShwKTtcblxuICAgICAgdmFyIHBhdGggPSBwYXJlbnQuc3BsaXQoJy8nKVxuICAgICAgICAsIHNlZ3MgPSBwLnNwbGl0KCcvJyk7XG4gICAgICBwYXRoLnBvcCgpO1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlZ3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHNlZyA9IHNlZ3NbaV07XG4gICAgICAgIGlmICgnLi4nID09IHNlZykgcGF0aC5wb3AoKTtcbiAgICAgICAgZWxzZSBpZiAoJy4nICE9IHNlZykgcGF0aC5wdXNoKHNlZyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXF1aXJlKHBhdGguam9pbignLycpKTtcbiAgICB9O1xuICB9O1xuXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJicm93c2VyL2RlYnVnLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odHlwZSl7XG4gIHJldHVybiBmdW5jdGlvbigpe1xuICB9XG59O1xuXG59KTsgLy8gbW9kdWxlOiBicm93c2VyL2RlYnVnLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJicm93c2VyL2RpZmYuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qIFNlZSBMSUNFTlNFIGZpbGUgZm9yIHRlcm1zIG9mIHVzZSAqL1xuXG4vKlxuICogVGV4dCBkaWZmIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIFRoaXMgbGlicmFyeSBzdXBwb3J0cyB0aGUgZm9sbG93aW5nIEFQSVM6XG4gKiBKc0RpZmYuZGlmZkNoYXJzOiBDaGFyYWN0ZXIgYnkgY2hhcmFjdGVyIGRpZmZcbiAqIEpzRGlmZi5kaWZmV29yZHM6IFdvcmQgKGFzIGRlZmluZWQgYnkgXFxiIHJlZ2V4KSBkaWZmIHdoaWNoIGlnbm9yZXMgd2hpdGVzcGFjZVxuICogSnNEaWZmLmRpZmZMaW5lczogTGluZSBiYXNlZCBkaWZmXG4gKlxuICogSnNEaWZmLmRpZmZDc3M6IERpZmYgdGFyZ2V0ZWQgYXQgQ1NTIGNvbnRlbnRcbiAqXG4gKiBUaGVzZSBtZXRob2RzIGFyZSBiYXNlZCBvbiB0aGUgaW1wbGVtZW50YXRpb24gcHJvcG9zZWQgaW5cbiAqIFwiQW4gTyhORCkgRGlmZmVyZW5jZSBBbGdvcml0aG0gYW5kIGl0cyBWYXJpYXRpb25zXCIgKE15ZXJzLCAxOTg2KS5cbiAqIGh0dHA6Ly9jaXRlc2VlcnguaXN0LnBzdS5lZHUvdmlld2RvYy9zdW1tYXJ5P2RvaT0xMC4xLjEuNC42OTI3XG4gKi9cbnZhciBKc0RpZmYgPSAoZnVuY3Rpb24oKSB7XG4gIC8qanNoaW50IG1heHBhcmFtczogNSovXG4gIGZ1bmN0aW9uIGNsb25lUGF0aChwYXRoKSB7XG4gICAgcmV0dXJuIHsgbmV3UG9zOiBwYXRoLm5ld1BvcywgY29tcG9uZW50czogcGF0aC5jb21wb25lbnRzLnNsaWNlKDApIH07XG4gIH1cbiAgZnVuY3Rpb24gcmVtb3ZlRW1wdHkoYXJyYXkpIHtcbiAgICB2YXIgcmV0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGFycmF5W2ldKSB7XG4gICAgICAgIHJldC5wdXNoKGFycmF5W2ldKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuICBmdW5jdGlvbiBlc2NhcGVIVE1MKHMpIHtcbiAgICB2YXIgbiA9IHM7XG4gICAgbiA9IG4ucmVwbGFjZSgvJi9nLCAnJmFtcDsnKTtcbiAgICBuID0gbi5yZXBsYWNlKC88L2csICcmbHQ7Jyk7XG4gICAgbiA9IG4ucmVwbGFjZSgvPi9nLCAnJmd0OycpO1xuICAgIG4gPSBuLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKTtcblxuICAgIHJldHVybiBuO1xuICB9XG5cbiAgdmFyIERpZmYgPSBmdW5jdGlvbihpZ25vcmVXaGl0ZXNwYWNlKSB7XG4gICAgdGhpcy5pZ25vcmVXaGl0ZXNwYWNlID0gaWdub3JlV2hpdGVzcGFjZTtcbiAgfTtcbiAgRGlmZi5wcm90b3R5cGUgPSB7XG4gICAgICBkaWZmOiBmdW5jdGlvbihvbGRTdHJpbmcsIG5ld1N0cmluZykge1xuICAgICAgICAvLyBIYW5kbGUgdGhlIGlkZW50aXR5IGNhc2UgKHRoaXMgaXMgZHVlIHRvIHVucm9sbGluZyBlZGl0TGVuZ3RoID09IDBcbiAgICAgICAgaWYgKG5ld1N0cmluZyA9PT0gb2xkU3RyaW5nKSB7XG4gICAgICAgICAgcmV0dXJuIFt7IHZhbHVlOiBuZXdTdHJpbmcgfV07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFuZXdTdHJpbmcpIHtcbiAgICAgICAgICByZXR1cm4gW3sgdmFsdWU6IG9sZFN0cmluZywgcmVtb3ZlZDogdHJ1ZSB9XTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIW9sZFN0cmluZykge1xuICAgICAgICAgIHJldHVybiBbeyB2YWx1ZTogbmV3U3RyaW5nLCBhZGRlZDogdHJ1ZSB9XTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5ld1N0cmluZyA9IHRoaXMudG9rZW5pemUobmV3U3RyaW5nKTtcbiAgICAgICAgb2xkU3RyaW5nID0gdGhpcy50b2tlbml6ZShvbGRTdHJpbmcpO1xuXG4gICAgICAgIHZhciBuZXdMZW4gPSBuZXdTdHJpbmcubGVuZ3RoLCBvbGRMZW4gPSBvbGRTdHJpbmcubGVuZ3RoO1xuICAgICAgICB2YXIgbWF4RWRpdExlbmd0aCA9IG5ld0xlbiArIG9sZExlbjtcbiAgICAgICAgdmFyIGJlc3RQYXRoID0gW3sgbmV3UG9zOiAtMSwgY29tcG9uZW50czogW10gfV07XG5cbiAgICAgICAgLy8gU2VlZCBlZGl0TGVuZ3RoID0gMFxuICAgICAgICB2YXIgb2xkUG9zID0gdGhpcy5leHRyYWN0Q29tbW9uKGJlc3RQYXRoWzBdLCBuZXdTdHJpbmcsIG9sZFN0cmluZywgMCk7XG4gICAgICAgIGlmIChiZXN0UGF0aFswXS5uZXdQb3MrMSA+PSBuZXdMZW4gJiYgb2xkUG9zKzEgPj0gb2xkTGVuKSB7XG4gICAgICAgICAgcmV0dXJuIGJlc3RQYXRoWzBdLmNvbXBvbmVudHM7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKHZhciBlZGl0TGVuZ3RoID0gMTsgZWRpdExlbmd0aCA8PSBtYXhFZGl0TGVuZ3RoOyBlZGl0TGVuZ3RoKyspIHtcbiAgICAgICAgICBmb3IgKHZhciBkaWFnb25hbFBhdGggPSAtMSplZGl0TGVuZ3RoOyBkaWFnb25hbFBhdGggPD0gZWRpdExlbmd0aDsgZGlhZ29uYWxQYXRoKz0yKSB7XG4gICAgICAgICAgICB2YXIgYmFzZVBhdGg7XG4gICAgICAgICAgICB2YXIgYWRkUGF0aCA9IGJlc3RQYXRoW2RpYWdvbmFsUGF0aC0xXSxcbiAgICAgICAgICAgICAgICByZW1vdmVQYXRoID0gYmVzdFBhdGhbZGlhZ29uYWxQYXRoKzFdO1xuICAgICAgICAgICAgb2xkUG9zID0gKHJlbW92ZVBhdGggPyByZW1vdmVQYXRoLm5ld1BvcyA6IDApIC0gZGlhZ29uYWxQYXRoO1xuICAgICAgICAgICAgaWYgKGFkZFBhdGgpIHtcbiAgICAgICAgICAgICAgLy8gTm8gb25lIGVsc2UgaXMgZ29pbmcgdG8gYXR0ZW1wdCB0byB1c2UgdGhpcyB2YWx1ZSwgY2xlYXIgaXRcbiAgICAgICAgICAgICAgYmVzdFBhdGhbZGlhZ29uYWxQYXRoLTFdID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgY2FuQWRkID0gYWRkUGF0aCAmJiBhZGRQYXRoLm5ld1BvcysxIDwgbmV3TGVuO1xuICAgICAgICAgICAgdmFyIGNhblJlbW92ZSA9IHJlbW92ZVBhdGggJiYgMCA8PSBvbGRQb3MgJiYgb2xkUG9zIDwgb2xkTGVuO1xuICAgICAgICAgICAgaWYgKCFjYW5BZGQgJiYgIWNhblJlbW92ZSkge1xuICAgICAgICAgICAgICBiZXN0UGF0aFtkaWFnb25hbFBhdGhdID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gU2VsZWN0IHRoZSBkaWFnb25hbCB0aGF0IHdlIHdhbnQgdG8gYnJhbmNoIGZyb20uIFdlIHNlbGVjdCB0aGUgcHJpb3JcbiAgICAgICAgICAgIC8vIHBhdGggd2hvc2UgcG9zaXRpb24gaW4gdGhlIG5ldyBzdHJpbmcgaXMgdGhlIGZhcnRoZXN0IGZyb20gdGhlIG9yaWdpblxuICAgICAgICAgICAgLy8gYW5kIGRvZXMgbm90IHBhc3MgdGhlIGJvdW5kcyBvZiB0aGUgZGlmZiBncmFwaFxuICAgICAgICAgICAgaWYgKCFjYW5BZGQgfHwgKGNhblJlbW92ZSAmJiBhZGRQYXRoLm5ld1BvcyA8IHJlbW92ZVBhdGgubmV3UG9zKSkge1xuICAgICAgICAgICAgICBiYXNlUGF0aCA9IGNsb25lUGF0aChyZW1vdmVQYXRoKTtcbiAgICAgICAgICAgICAgdGhpcy5wdXNoQ29tcG9uZW50KGJhc2VQYXRoLmNvbXBvbmVudHMsIG9sZFN0cmluZ1tvbGRQb3NdLCB1bmRlZmluZWQsIHRydWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgYmFzZVBhdGggPSBjbG9uZVBhdGgoYWRkUGF0aCk7XG4gICAgICAgICAgICAgIGJhc2VQYXRoLm5ld1BvcysrO1xuICAgICAgICAgICAgICB0aGlzLnB1c2hDb21wb25lbnQoYmFzZVBhdGguY29tcG9uZW50cywgbmV3U3RyaW5nW2Jhc2VQYXRoLm5ld1Bvc10sIHRydWUsIHVuZGVmaW5lZCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBvbGRQb3MgPSB0aGlzLmV4dHJhY3RDb21tb24oYmFzZVBhdGgsIG5ld1N0cmluZywgb2xkU3RyaW5nLCBkaWFnb25hbFBhdGgpO1xuXG4gICAgICAgICAgICBpZiAoYmFzZVBhdGgubmV3UG9zKzEgPj0gbmV3TGVuICYmIG9sZFBvcysxID49IG9sZExlbikge1xuICAgICAgICAgICAgICByZXR1cm4gYmFzZVBhdGguY29tcG9uZW50cztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGJlc3RQYXRoW2RpYWdvbmFsUGF0aF0gPSBiYXNlUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIHB1c2hDb21wb25lbnQ6IGZ1bmN0aW9uKGNvbXBvbmVudHMsIHZhbHVlLCBhZGRlZCwgcmVtb3ZlZCkge1xuICAgICAgICB2YXIgbGFzdCA9IGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGgtMV07XG4gICAgICAgIGlmIChsYXN0ICYmIGxhc3QuYWRkZWQgPT09IGFkZGVkICYmIGxhc3QucmVtb3ZlZCA9PT0gcmVtb3ZlZCkge1xuICAgICAgICAgIC8vIFdlIG5lZWQgdG8gY2xvbmUgaGVyZSBhcyB0aGUgY29tcG9uZW50IGNsb25lIG9wZXJhdGlvbiBpcyBqdXN0XG4gICAgICAgICAgLy8gYXMgc2hhbGxvdyBhcnJheSBjbG9uZVxuICAgICAgICAgIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGgtMV0gPVxuICAgICAgICAgICAge3ZhbHVlOiB0aGlzLmpvaW4obGFzdC52YWx1ZSwgdmFsdWUpLCBhZGRlZDogYWRkZWQsIHJlbW92ZWQ6IHJlbW92ZWQgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb21wb25lbnRzLnB1c2goe3ZhbHVlOiB2YWx1ZSwgYWRkZWQ6IGFkZGVkLCByZW1vdmVkOiByZW1vdmVkIH0pO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgZXh0cmFjdENvbW1vbjogZnVuY3Rpb24oYmFzZVBhdGgsIG5ld1N0cmluZywgb2xkU3RyaW5nLCBkaWFnb25hbFBhdGgpIHtcbiAgICAgICAgdmFyIG5ld0xlbiA9IG5ld1N0cmluZy5sZW5ndGgsXG4gICAgICAgICAgICBvbGRMZW4gPSBvbGRTdHJpbmcubGVuZ3RoLFxuICAgICAgICAgICAgbmV3UG9zID0gYmFzZVBhdGgubmV3UG9zLFxuICAgICAgICAgICAgb2xkUG9zID0gbmV3UG9zIC0gZGlhZ29uYWxQYXRoO1xuICAgICAgICB3aGlsZSAobmV3UG9zKzEgPCBuZXdMZW4gJiYgb2xkUG9zKzEgPCBvbGRMZW4gJiYgdGhpcy5lcXVhbHMobmV3U3RyaW5nW25ld1BvcysxXSwgb2xkU3RyaW5nW29sZFBvcysxXSkpIHtcbiAgICAgICAgICBuZXdQb3MrKztcbiAgICAgICAgICBvbGRQb3MrKztcblxuICAgICAgICAgIHRoaXMucHVzaENvbXBvbmVudChiYXNlUGF0aC5jb21wb25lbnRzLCBuZXdTdHJpbmdbbmV3UG9zXSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgICAgIGJhc2VQYXRoLm5ld1BvcyA9IG5ld1BvcztcbiAgICAgICAgcmV0dXJuIG9sZFBvcztcbiAgICAgIH0sXG5cbiAgICAgIGVxdWFsczogZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgICAgdmFyIHJlV2hpdGVzcGFjZSA9IC9cXFMvO1xuICAgICAgICBpZiAodGhpcy5pZ25vcmVXaGl0ZXNwYWNlICYmICFyZVdoaXRlc3BhY2UudGVzdChsZWZ0KSAmJiAhcmVXaGl0ZXNwYWNlLnRlc3QocmlnaHQpKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGxlZnQgPT09IHJpZ2h0O1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgam9pbjogZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgICAgcmV0dXJuIGxlZnQgKyByaWdodDtcbiAgICAgIH0sXG4gICAgICB0b2tlbml6ZTogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfVxuICB9O1xuXG4gIHZhciBDaGFyRGlmZiA9IG5ldyBEaWZmKCk7XG5cbiAgdmFyIFdvcmREaWZmID0gbmV3IERpZmYodHJ1ZSk7XG4gIHZhciBXb3JkV2l0aFNwYWNlRGlmZiA9IG5ldyBEaWZmKCk7XG4gIFdvcmREaWZmLnRva2VuaXplID0gV29yZFdpdGhTcGFjZURpZmYudG9rZW5pemUgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiByZW1vdmVFbXB0eSh2YWx1ZS5zcGxpdCgvKFxccyt8XFxiKS8pKTtcbiAgfTtcblxuICB2YXIgQ3NzRGlmZiA9IG5ldyBEaWZmKHRydWUpO1xuICBDc3NEaWZmLnRva2VuaXplID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gcmVtb3ZlRW1wdHkodmFsdWUuc3BsaXQoLyhbe306OyxdfFxccyspLykpO1xuICB9O1xuXG4gIHZhciBMaW5lRGlmZiA9IG5ldyBEaWZmKCk7XG4gIExpbmVEaWZmLnRva2VuaXplID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWUuc3BsaXQoL14vbSk7XG4gIH07XG5cbiAgcmV0dXJuIHtcbiAgICBEaWZmOiBEaWZmLFxuXG4gICAgZGlmZkNoYXJzOiBmdW5jdGlvbihvbGRTdHIsIG5ld1N0cikgeyByZXR1cm4gQ2hhckRpZmYuZGlmZihvbGRTdHIsIG5ld1N0cik7IH0sXG4gICAgZGlmZldvcmRzOiBmdW5jdGlvbihvbGRTdHIsIG5ld1N0cikgeyByZXR1cm4gV29yZERpZmYuZGlmZihvbGRTdHIsIG5ld1N0cik7IH0sXG4gICAgZGlmZldvcmRzV2l0aFNwYWNlOiBmdW5jdGlvbihvbGRTdHIsIG5ld1N0cikgeyByZXR1cm4gV29yZFdpdGhTcGFjZURpZmYuZGlmZihvbGRTdHIsIG5ld1N0cik7IH0sXG4gICAgZGlmZkxpbmVzOiBmdW5jdGlvbihvbGRTdHIsIG5ld1N0cikgeyByZXR1cm4gTGluZURpZmYuZGlmZihvbGRTdHIsIG5ld1N0cik7IH0sXG5cbiAgICBkaWZmQ3NzOiBmdW5jdGlvbihvbGRTdHIsIG5ld1N0cikgeyByZXR1cm4gQ3NzRGlmZi5kaWZmKG9sZFN0ciwgbmV3U3RyKTsgfSxcblxuICAgIGNyZWF0ZVBhdGNoOiBmdW5jdGlvbihmaWxlTmFtZSwgb2xkU3RyLCBuZXdTdHIsIG9sZEhlYWRlciwgbmV3SGVhZGVyKSB7XG4gICAgICB2YXIgcmV0ID0gW107XG5cbiAgICAgIHJldC5wdXNoKCdJbmRleDogJyArIGZpbGVOYW1lKTtcbiAgICAgIHJldC5wdXNoKCc9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09Jyk7XG4gICAgICByZXQucHVzaCgnLS0tICcgKyBmaWxlTmFtZSArICh0eXBlb2Ygb2xkSGVhZGVyID09PSAndW5kZWZpbmVkJyA/ICcnIDogJ1xcdCcgKyBvbGRIZWFkZXIpKTtcbiAgICAgIHJldC5wdXNoKCcrKysgJyArIGZpbGVOYW1lICsgKHR5cGVvZiBuZXdIZWFkZXIgPT09ICd1bmRlZmluZWQnID8gJycgOiAnXFx0JyArIG5ld0hlYWRlcikpO1xuXG4gICAgICB2YXIgZGlmZiA9IExpbmVEaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpO1xuICAgICAgaWYgKCFkaWZmW2RpZmYubGVuZ3RoLTFdLnZhbHVlKSB7XG4gICAgICAgIGRpZmYucG9wKCk7ICAgLy8gUmVtb3ZlIHRyYWlsaW5nIG5ld2xpbmUgYWRkXG4gICAgICB9XG4gICAgICBkaWZmLnB1c2goe3ZhbHVlOiAnJywgbGluZXM6IFtdfSk7ICAgLy8gQXBwZW5kIGFuIGVtcHR5IHZhbHVlIHRvIG1ha2UgY2xlYW51cCBlYXNpZXJcblxuICAgICAgZnVuY3Rpb24gY29udGV4dExpbmVzKGxpbmVzKSB7XG4gICAgICAgIHJldHVybiBsaW5lcy5tYXAoZnVuY3Rpb24oZW50cnkpIHsgcmV0dXJuICcgJyArIGVudHJ5OyB9KTtcbiAgICAgIH1cbiAgICAgIGZ1bmN0aW9uIGVvZk5MKGN1clJhbmdlLCBpLCBjdXJyZW50KSB7XG4gICAgICAgIHZhciBsYXN0ID0gZGlmZltkaWZmLmxlbmd0aC0yXSxcbiAgICAgICAgICAgIGlzTGFzdCA9IGkgPT09IGRpZmYubGVuZ3RoLTIsXG4gICAgICAgICAgICBpc0xhc3RPZlR5cGUgPSBpID09PSBkaWZmLmxlbmd0aC0zICYmIChjdXJyZW50LmFkZGVkICE9PSBsYXN0LmFkZGVkIHx8IGN1cnJlbnQucmVtb3ZlZCAhPT0gbGFzdC5yZW1vdmVkKTtcblxuICAgICAgICAvLyBGaWd1cmUgb3V0IGlmIHRoaXMgaXMgdGhlIGxhc3QgbGluZSBmb3IgdGhlIGdpdmVuIGZpbGUgYW5kIG1pc3NpbmcgTkxcbiAgICAgICAgaWYgKCEvXFxuJC8udGVzdChjdXJyZW50LnZhbHVlKSAmJiAoaXNMYXN0IHx8IGlzTGFzdE9mVHlwZSkpIHtcbiAgICAgICAgICBjdXJSYW5nZS5wdXNoKCdcXFxcIE5vIG5ld2xpbmUgYXQgZW5kIG9mIGZpbGUnKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgb2xkUmFuZ2VTdGFydCA9IDAsIG5ld1JhbmdlU3RhcnQgPSAwLCBjdXJSYW5nZSA9IFtdLFxuICAgICAgICAgIG9sZExpbmUgPSAxLCBuZXdMaW5lID0gMTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGlmZi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY3VycmVudCA9IGRpZmZbaV0sXG4gICAgICAgICAgICBsaW5lcyA9IGN1cnJlbnQubGluZXMgfHwgY3VycmVudC52YWx1ZS5yZXBsYWNlKC9cXG4kLywgJycpLnNwbGl0KCdcXG4nKTtcbiAgICAgICAgY3VycmVudC5saW5lcyA9IGxpbmVzO1xuXG4gICAgICAgIGlmIChjdXJyZW50LmFkZGVkIHx8IGN1cnJlbnQucmVtb3ZlZCkge1xuICAgICAgICAgIGlmICghb2xkUmFuZ2VTdGFydCkge1xuICAgICAgICAgICAgdmFyIHByZXYgPSBkaWZmW2ktMV07XG4gICAgICAgICAgICBvbGRSYW5nZVN0YXJ0ID0gb2xkTGluZTtcbiAgICAgICAgICAgIG5ld1JhbmdlU3RhcnQgPSBuZXdMaW5lO1xuXG4gICAgICAgICAgICBpZiAocHJldikge1xuICAgICAgICAgICAgICBjdXJSYW5nZSA9IGNvbnRleHRMaW5lcyhwcmV2LmxpbmVzLnNsaWNlKC00KSk7XG4gICAgICAgICAgICAgIG9sZFJhbmdlU3RhcnQgLT0gY3VyUmFuZ2UubGVuZ3RoO1xuICAgICAgICAgICAgICBuZXdSYW5nZVN0YXJ0IC09IGN1clJhbmdlLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgY3VyUmFuZ2UucHVzaC5hcHBseShjdXJSYW5nZSwgbGluZXMubWFwKGZ1bmN0aW9uKGVudHJ5KSB7IHJldHVybiAoY3VycmVudC5hZGRlZD8nKyc6Jy0nKSArIGVudHJ5OyB9KSk7XG4gICAgICAgICAgZW9mTkwoY3VyUmFuZ2UsIGksIGN1cnJlbnQpO1xuXG4gICAgICAgICAgaWYgKGN1cnJlbnQuYWRkZWQpIHtcbiAgICAgICAgICAgIG5ld0xpbmUgKz0gbGluZXMubGVuZ3RoO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBvbGRMaW5lICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKG9sZFJhbmdlU3RhcnQpIHtcbiAgICAgICAgICAgIC8vIENsb3NlIG91dCBhbnkgY2hhbmdlcyB0aGF0IGhhdmUgYmVlbiBvdXRwdXQgKG9yIGpvaW4gb3ZlcmxhcHBpbmcpXG4gICAgICAgICAgICBpZiAobGluZXMubGVuZ3RoIDw9IDggJiYgaSA8IGRpZmYubGVuZ3RoLTIpIHtcbiAgICAgICAgICAgICAgLy8gT3ZlcmxhcHBpbmdcbiAgICAgICAgICAgICAgY3VyUmFuZ2UucHVzaC5hcHBseShjdXJSYW5nZSwgY29udGV4dExpbmVzKGxpbmVzKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBlbmQgdGhlIHJhbmdlIGFuZCBvdXRwdXRcbiAgICAgICAgICAgICAgdmFyIGNvbnRleHRTaXplID0gTWF0aC5taW4obGluZXMubGVuZ3RoLCA0KTtcbiAgICAgICAgICAgICAgcmV0LnB1c2goXG4gICAgICAgICAgICAgICAgICAnQEAgLScgKyBvbGRSYW5nZVN0YXJ0ICsgJywnICsgKG9sZExpbmUtb2xkUmFuZ2VTdGFydCtjb250ZXh0U2l6ZSlcbiAgICAgICAgICAgICAgICAgICsgJyArJyArIG5ld1JhbmdlU3RhcnQgKyAnLCcgKyAobmV3TGluZS1uZXdSYW5nZVN0YXJ0K2NvbnRleHRTaXplKVxuICAgICAgICAgICAgICAgICAgKyAnIEBAJyk7XG4gICAgICAgICAgICAgIHJldC5wdXNoLmFwcGx5KHJldCwgY3VyUmFuZ2UpO1xuICAgICAgICAgICAgICByZXQucHVzaC5hcHBseShyZXQsIGNvbnRleHRMaW5lcyhsaW5lcy5zbGljZSgwLCBjb250ZXh0U2l6ZSkpKTtcbiAgICAgICAgICAgICAgaWYgKGxpbmVzLmxlbmd0aCA8PSA0KSB7XG4gICAgICAgICAgICAgICAgZW9mTkwocmV0LCBpLCBjdXJyZW50KTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIG9sZFJhbmdlU3RhcnQgPSAwOyAgbmV3UmFuZ2VTdGFydCA9IDA7IGN1clJhbmdlID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIG9sZExpbmUgKz0gbGluZXMubGVuZ3RoO1xuICAgICAgICAgIG5ld0xpbmUgKz0gbGluZXMubGVuZ3RoO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXQuam9pbignXFxuJykgKyAnXFxuJztcbiAgICB9LFxuXG4gICAgYXBwbHlQYXRjaDogZnVuY3Rpb24ob2xkU3RyLCB1bmlEaWZmKSB7XG4gICAgICB2YXIgZGlmZnN0ciA9IHVuaURpZmYuc3BsaXQoJ1xcbicpO1xuICAgICAgdmFyIGRpZmYgPSBbXTtcbiAgICAgIHZhciByZW1FT0ZOTCA9IGZhbHNlLFxuICAgICAgICAgIGFkZEVPRk5MID0gZmFsc2U7XG5cbiAgICAgIGZvciAodmFyIGkgPSAoZGlmZnN0clswXVswXT09PSdJJz80OjApOyBpIDwgZGlmZnN0ci5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZihkaWZmc3RyW2ldWzBdID09PSAnQCcpIHtcbiAgICAgICAgICB2YXIgbWVoID0gZGlmZnN0cltpXS5zcGxpdCgvQEAgLShcXGQrKSwoXFxkKykgXFwrKFxcZCspLChcXGQrKSBAQC8pO1xuICAgICAgICAgIGRpZmYudW5zaGlmdCh7XG4gICAgICAgICAgICBzdGFydDptZWhbM10sXG4gICAgICAgICAgICBvbGRsZW5ndGg6bWVoWzJdLFxuICAgICAgICAgICAgb2xkbGluZXM6W10sXG4gICAgICAgICAgICBuZXdsZW5ndGg6bWVoWzRdLFxuICAgICAgICAgICAgbmV3bGluZXM6W11cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIGlmKGRpZmZzdHJbaV1bMF0gPT09ICcrJykge1xuICAgICAgICAgIGRpZmZbMF0ubmV3bGluZXMucHVzaChkaWZmc3RyW2ldLnN1YnN0cigxKSk7XG4gICAgICAgIH0gZWxzZSBpZihkaWZmc3RyW2ldWzBdID09PSAnLScpIHtcbiAgICAgICAgICBkaWZmWzBdLm9sZGxpbmVzLnB1c2goZGlmZnN0cltpXS5zdWJzdHIoMSkpO1xuICAgICAgICB9IGVsc2UgaWYoZGlmZnN0cltpXVswXSA9PT0gJyAnKSB7XG4gICAgICAgICAgZGlmZlswXS5uZXdsaW5lcy5wdXNoKGRpZmZzdHJbaV0uc3Vic3RyKDEpKTtcbiAgICAgICAgICBkaWZmWzBdLm9sZGxpbmVzLnB1c2goZGlmZnN0cltpXS5zdWJzdHIoMSkpO1xuICAgICAgICB9IGVsc2UgaWYoZGlmZnN0cltpXVswXSA9PT0gJ1xcXFwnKSB7XG4gICAgICAgICAgaWYgKGRpZmZzdHJbaS0xXVswXSA9PT0gJysnKSB7XG4gICAgICAgICAgICByZW1FT0ZOTCA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIGlmKGRpZmZzdHJbaS0xXVswXSA9PT0gJy0nKSB7XG4gICAgICAgICAgICBhZGRFT0ZOTCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHZhciBzdHIgPSBvbGRTdHIuc3BsaXQoJ1xcbicpO1xuICAgICAgZm9yICh2YXIgaSA9IGRpZmYubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgdmFyIGQgPSBkaWZmW2ldO1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGQub2xkbGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBpZihzdHJbZC5zdGFydC0xK2pdICE9PSBkLm9sZGxpbmVzW2pdKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIEFycmF5LnByb3RvdHlwZS5zcGxpY2UuYXBwbHkoc3RyLFtkLnN0YXJ0LTEsK2Qub2xkbGVuZ3RoXS5jb25jYXQoZC5uZXdsaW5lcykpO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVtRU9GTkwpIHtcbiAgICAgICAgd2hpbGUgKCFzdHJbc3RyLmxlbmd0aC0xXSkge1xuICAgICAgICAgIHN0ci5wb3AoKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChhZGRFT0ZOTCkge1xuICAgICAgICBzdHIucHVzaCgnJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RyLmpvaW4oJ1xcbicpO1xuICAgIH0sXG5cbiAgICBjb252ZXJ0Q2hhbmdlc1RvWE1MOiBmdW5jdGlvbihjaGFuZ2VzKXtcbiAgICAgIHZhciByZXQgPSBbXTtcbiAgICAgIGZvciAoIHZhciBpID0gMDsgaSA8IGNoYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoYW5nZSA9IGNoYW5nZXNbaV07XG4gICAgICAgIGlmIChjaGFuZ2UuYWRkZWQpIHtcbiAgICAgICAgICByZXQucHVzaCgnPGlucz4nKTtcbiAgICAgICAgfSBlbHNlIGlmIChjaGFuZ2UucmVtb3ZlZCkge1xuICAgICAgICAgIHJldC5wdXNoKCc8ZGVsPicpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0LnB1c2goZXNjYXBlSFRNTChjaGFuZ2UudmFsdWUpKTtcblxuICAgICAgICBpZiAoY2hhbmdlLmFkZGVkKSB7XG4gICAgICAgICAgcmV0LnB1c2goJzwvaW5zPicpO1xuICAgICAgICB9IGVsc2UgaWYgKGNoYW5nZS5yZW1vdmVkKSB7XG4gICAgICAgICAgcmV0LnB1c2goJzwvZGVsPicpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0LmpvaW4oJycpO1xuICAgIH0sXG5cbiAgICAvLyBTZWU6IGh0dHA6Ly9jb2RlLmdvb2dsZS5jb20vcC9nb29nbGUtZGlmZi1tYXRjaC1wYXRjaC93aWtpL0FQSVxuICAgIGNvbnZlcnRDaGFuZ2VzVG9ETVA6IGZ1bmN0aW9uKGNoYW5nZXMpe1xuICAgICAgdmFyIHJldCA9IFtdLCBjaGFuZ2U7XG4gICAgICBmb3IgKCB2YXIgaSA9IDA7IGkgPCBjaGFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNoYW5nZSA9IGNoYW5nZXNbaV07XG4gICAgICAgIHJldC5wdXNoKFsoY2hhbmdlLmFkZGVkID8gMSA6IGNoYW5nZS5yZW1vdmVkID8gLTEgOiAwKSwgY2hhbmdlLnZhbHVlXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH1cbiAgfTtcbn0pKCk7XG5cbmlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gSnNEaWZmO1xufVxuXG59KTsgLy8gbW9kdWxlOiBicm93c2VyL2RpZmYuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImJyb3dzZXIvZXZlbnRzLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGV4cG9ydHMuXG4gKi9cblxuZXhwb3J0cy5FdmVudEVtaXR0ZXIgPSBFdmVudEVtaXR0ZXI7XG5cbi8qKlxuICogQ2hlY2sgaWYgYG9iamAgaXMgYW4gYXJyYXkuXG4gKi9cblxuZnVuY3Rpb24gaXNBcnJheShvYmopIHtcbiAgcmV0dXJuICdbb2JqZWN0IEFycmF5XScgPT0ge30udG9TdHJpbmcuY2FsbChvYmopO1xufVxuXG4vKipcbiAqIEV2ZW50IGVtaXR0ZXIgY29uc3RydWN0b3IuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBFdmVudEVtaXR0ZXIoKXt9O1xuXG4vKipcbiAqIEFkZHMgYSBsaXN0ZW5lci5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBmdW5jdGlvbiAobmFtZSwgZm4pIHtcbiAgaWYgKCF0aGlzLiRldmVudHMpIHtcbiAgICB0aGlzLiRldmVudHMgPSB7fTtcbiAgfVxuXG4gIGlmICghdGhpcy4kZXZlbnRzW25hbWVdKSB7XG4gICAgdGhpcy4kZXZlbnRzW25hbWVdID0gZm47XG4gIH0gZWxzZSBpZiAoaXNBcnJheSh0aGlzLiRldmVudHNbbmFtZV0pKSB7XG4gICAgdGhpcy4kZXZlbnRzW25hbWVdLnB1c2goZm4pO1xuICB9IGVsc2Uge1xuICAgIHRoaXMuJGV2ZW50c1tuYW1lXSA9IFt0aGlzLiRldmVudHNbbmFtZV0sIGZuXTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUub247XG5cbi8qKlxuICogQWRkcyBhIHZvbGF0aWxlIGxpc3RlbmVyLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24gKG5hbWUsIGZuKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBmdW5jdGlvbiBvbiAoKSB7XG4gICAgc2VsZi5yZW1vdmVMaXN0ZW5lcihuYW1lLCBvbik7XG4gICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfTtcblxuICBvbi5saXN0ZW5lciA9IGZuO1xuICB0aGlzLm9uKG5hbWUsIG9uKTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmVtb3ZlcyBhIGxpc3RlbmVyLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uIChuYW1lLCBmbikge1xuICBpZiAodGhpcy4kZXZlbnRzICYmIHRoaXMuJGV2ZW50c1tuYW1lXSkge1xuICAgIHZhciBsaXN0ID0gdGhpcy4kZXZlbnRzW25hbWVdO1xuXG4gICAgaWYgKGlzQXJyYXkobGlzdCkpIHtcbiAgICAgIHZhciBwb3MgPSAtMTtcblxuICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBsaXN0Lmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBpZiAobGlzdFtpXSA9PT0gZm4gfHwgKGxpc3RbaV0ubGlzdGVuZXIgJiYgbGlzdFtpXS5saXN0ZW5lciA9PT0gZm4pKSB7XG4gICAgICAgICAgcG9zID0gaTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAocG9zIDwgMCkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cblxuICAgICAgbGlzdC5zcGxpY2UocG9zLCAxKTtcblxuICAgICAgaWYgKCFsaXN0Lmxlbmd0aCkge1xuICAgICAgICBkZWxldGUgdGhpcy4kZXZlbnRzW25hbWVdO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAobGlzdCA9PT0gZm4gfHwgKGxpc3QubGlzdGVuZXIgJiYgbGlzdC5saXN0ZW5lciA9PT0gZm4pKSB7XG4gICAgICBkZWxldGUgdGhpcy4kZXZlbnRzW25hbWVdO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZW1vdmVzIGFsbCBsaXN0ZW5lcnMgZm9yIGFuIGV2ZW50LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbiAobmFtZSkge1xuICBpZiAobmFtZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdGhpcy4kZXZlbnRzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBpZiAodGhpcy4kZXZlbnRzICYmIHRoaXMuJGV2ZW50c1tuYW1lXSkge1xuICAgIHRoaXMuJGV2ZW50c1tuYW1lXSA9IG51bGw7XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogR2V0cyBhbGwgbGlzdGVuZXJzIGZvciBhIGNlcnRhaW4gZXZlbnQuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gIGlmICghdGhpcy4kZXZlbnRzKSB7XG4gICAgdGhpcy4kZXZlbnRzID0ge307XG4gIH1cblxuICBpZiAoIXRoaXMuJGV2ZW50c1tuYW1lXSkge1xuICAgIHRoaXMuJGV2ZW50c1tuYW1lXSA9IFtdO1xuICB9XG5cbiAgaWYgKCFpc0FycmF5KHRoaXMuJGV2ZW50c1tuYW1lXSkpIHtcbiAgICB0aGlzLiRldmVudHNbbmFtZV0gPSBbdGhpcy4kZXZlbnRzW25hbWVdXTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLiRldmVudHNbbmFtZV07XG59O1xuXG4vKipcbiAqIEVtaXRzIGFuIGV2ZW50LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgaWYgKCF0aGlzLiRldmVudHMpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICB2YXIgaGFuZGxlciA9IHRoaXMuJGV2ZW50c1tuYW1lXTtcblxuICBpZiAoIWhhbmRsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblxuICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2YgaGFuZGxlcikge1xuICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XG4gIH0gZWxzZSBpZiAoaXNBcnJheShoYW5kbGVyKSkge1xuICAgIHZhciBsaXN0ZW5lcnMgPSBoYW5kbGVyLnNsaWNlKCk7XG5cbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IGxpc3RlbmVycy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIGxpc3RlbmVyc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xufSk7IC8vIG1vZHVsZTogYnJvd3Nlci9ldmVudHMuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImJyb3dzZXIvZnMuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxufSk7IC8vIG1vZHVsZTogYnJvd3Nlci9mcy5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiYnJvd3Nlci9wYXRoLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbn0pOyAvLyBtb2R1bGU6IGJyb3dzZXIvcGF0aC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiYnJvd3Nlci9wcm9ncmVzcy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyoqXG4gKiBFeHBvc2UgYFByb2dyZXNzYC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IFByb2dyZXNzO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFByb2dyZXNzYCBpbmRpY2F0b3IuXG4gKi9cblxuZnVuY3Rpb24gUHJvZ3Jlc3MoKSB7XG4gIHRoaXMucGVyY2VudCA9IDA7XG4gIHRoaXMuc2l6ZSgwKTtcbiAgdGhpcy5mb250U2l6ZSgxMSk7XG4gIHRoaXMuZm9udCgnaGVsdmV0aWNhLCBhcmlhbCwgc2Fucy1zZXJpZicpO1xufVxuXG4vKipcbiAqIFNldCBwcm9ncmVzcyBzaXplIHRvIGBuYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gblxuICogQHJldHVybiB7UHJvZ3Jlc3N9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Qcm9ncmVzcy5wcm90b3R5cGUuc2l6ZSA9IGZ1bmN0aW9uKG4pe1xuICB0aGlzLl9zaXplID0gbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCB0ZXh0IHRvIGBzdHJgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1Byb2dyZXNzfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUHJvZ3Jlc3MucHJvdG90eXBlLnRleHQgPSBmdW5jdGlvbihzdHIpe1xuICB0aGlzLl90ZXh0ID0gc3RyO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IGZvbnQgc2l6ZSB0byBgbmAuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG5cbiAqIEByZXR1cm4ge1Byb2dyZXNzfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUHJvZ3Jlc3MucHJvdG90eXBlLmZvbnRTaXplID0gZnVuY3Rpb24obil7XG4gIHRoaXMuX2ZvbnRTaXplID0gbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCBmb250IGBmYW1pbHlgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmYW1pbHlcbiAqIEByZXR1cm4ge1Byb2dyZXNzfSBmb3IgY2hhaW5pbmdcbiAqL1xuXG5Qcm9ncmVzcy5wcm90b3R5cGUuZm9udCA9IGZ1bmN0aW9uKGZhbWlseSl7XG4gIHRoaXMuX2ZvbnQgPSBmYW1pbHk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBVcGRhdGUgcGVyY2VudGFnZSB0byBgbmAuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG5cbiAqIEByZXR1cm4ge1Byb2dyZXNzfSBmb3IgY2hhaW5pbmdcbiAqL1xuXG5Qcm9ncmVzcy5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24obil7XG4gIHRoaXMucGVyY2VudCA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBEcmF3IG9uIGBjdHhgLlxuICpcbiAqIEBwYXJhbSB7Q2FudmFzUmVuZGVyaW5nQ29udGV4dDJkfSBjdHhcbiAqIEByZXR1cm4ge1Byb2dyZXNzfSBmb3IgY2hhaW5pbmdcbiAqL1xuXG5Qcm9ncmVzcy5wcm90b3R5cGUuZHJhdyA9IGZ1bmN0aW9uKGN0eCl7XG4gIHRyeSB7XG4gICAgdmFyIHBlcmNlbnQgPSBNYXRoLm1pbih0aGlzLnBlcmNlbnQsIDEwMClcbiAgICAgICwgc2l6ZSA9IHRoaXMuX3NpemVcbiAgICAgICwgaGFsZiA9IHNpemUgLyAyXG4gICAgICAsIHggPSBoYWxmXG4gICAgICAsIHkgPSBoYWxmXG4gICAgICAsIHJhZCA9IGhhbGYgLSAxXG4gICAgICAsIGZvbnRTaXplID0gdGhpcy5fZm9udFNpemU7XG4gIFxuICAgIGN0eC5mb250ID0gZm9udFNpemUgKyAncHggJyArIHRoaXMuX2ZvbnQ7XG4gIFxuICAgIHZhciBhbmdsZSA9IE1hdGguUEkgKiAyICogKHBlcmNlbnQgLyAxMDApO1xuICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgc2l6ZSwgc2l6ZSk7XG4gIFxuICAgIC8vIG91dGVyIGNpcmNsZVxuICAgIGN0eC5zdHJva2VTdHlsZSA9ICcjOWY5ZjlmJztcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LmFyYyh4LCB5LCByYWQsIDAsIGFuZ2xlLCBmYWxzZSk7XG4gICAgY3R4LnN0cm9rZSgpO1xuICBcbiAgICAvLyBpbm5lciBjaXJjbGVcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSAnI2VlZSc7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMoeCwgeSwgcmFkIC0gMSwgMCwgYW5nbGUsIHRydWUpO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgXG4gICAgLy8gdGV4dFxuICAgIHZhciB0ZXh0ID0gdGhpcy5fdGV4dCB8fCAocGVyY2VudCB8IDApICsgJyUnXG4gICAgICAsIHcgPSBjdHgubWVhc3VyZVRleHQodGV4dCkud2lkdGg7XG4gIFxuICAgIGN0eC5maWxsVGV4dChcbiAgICAgICAgdGV4dFxuICAgICAgLCB4IC0gdyAvIDIgKyAxXG4gICAgICAsIHkgKyBmb250U2l6ZSAvIDIgLSAxKTtcbiAgfSBjYXRjaCAoZXgpIHt9IC8vZG9uJ3QgZmFpbCBpZiB3ZSBjYW4ndCByZW5kZXIgcHJvZ3Jlc3NcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG59KTsgLy8gbW9kdWxlOiBicm93c2VyL3Byb2dyZXNzLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJicm93c2VyL3R0eS5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG5leHBvcnRzLmlzYXR0eSA9IGZ1bmN0aW9uKCl7XG4gIHJldHVybiB0cnVlO1xufTtcblxuZXhwb3J0cy5nZXRXaW5kb3dTaXplID0gZnVuY3Rpb24oKXtcbiAgaWYgKCdpbm5lckhlaWdodCcgaW4gZ2xvYmFsKSB7XG4gICAgcmV0dXJuIFtnbG9iYWwuaW5uZXJIZWlnaHQsIGdsb2JhbC5pbm5lcldpZHRoXTtcbiAgfSBlbHNlIHtcbiAgICAvLyBJbiBhIFdlYiBXb3JrZXIsIHRoZSBET00gV2luZG93IGlzIG5vdCBhdmFpbGFibGUuXG4gICAgcmV0dXJuIFs2NDAsIDQ4MF07XG4gIH1cbn07XG5cbn0pOyAvLyBtb2R1bGU6IGJyb3dzZXIvdHR5LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJjb250ZXh0LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogRXhwb3NlIGBDb250ZXh0YC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IENvbnRleHQ7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgQ29udGV4dGAuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gQ29udGV4dCgpe31cblxuLyoqXG4gKiBTZXQgb3IgZ2V0IHRoZSBjb250ZXh0IGBSdW5uYWJsZWAgdG8gYHJ1bm5hYmxlYC5cbiAqXG4gKiBAcGFyYW0ge1J1bm5hYmxlfSBydW5uYWJsZVxuICogQHJldHVybiB7Q29udGV4dH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkNvbnRleHQucHJvdG90eXBlLnJ1bm5hYmxlID0gZnVuY3Rpb24ocnVubmFibGUpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fcnVubmFibGU7XG4gIHRoaXMudGVzdCA9IHRoaXMuX3J1bm5hYmxlID0gcnVubmFibGU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGVzdCB0aW1lb3V0IGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtDb250ZXh0fSBzZWxmXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Db250ZXh0LnByb3RvdHlwZS50aW1lb3V0ID0gZnVuY3Rpb24obXMpe1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHRoaXMucnVubmFibGUoKS50aW1lb3V0KCk7XG4gIHRoaXMucnVubmFibGUoKS50aW1lb3V0KG1zKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCB0ZXN0IHRpbWVvdXQgYGVuYWJsZWRgLlxuICpcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlZFxuICogQHJldHVybiB7Q29udGV4dH0gc2VsZlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQ29udGV4dC5wcm90b3R5cGUuZW5hYmxlVGltZW91dHMgPSBmdW5jdGlvbiAoZW5hYmxlZCkge1xuICB0aGlzLnJ1bm5hYmxlKCkuZW5hYmxlVGltZW91dHMoZW5hYmxlZCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuXG4vKipcbiAqIFNldCB0ZXN0IHNsb3duZXNzIHRocmVzaG9sZCBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7Q29udGV4dH0gc2VsZlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQ29udGV4dC5wcm90b3R5cGUuc2xvdyA9IGZ1bmN0aW9uKG1zKXtcbiAgdGhpcy5ydW5uYWJsZSgpLnNsb3cobXMpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogSW5zcGVjdCB0aGUgY29udGV4dCB2b2lkIG9mIGAuX3J1bm5hYmxlYC5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Db250ZXh0LnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24oKXtcbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHRoaXMsIGZ1bmN0aW9uKGtleSwgdmFsKXtcbiAgICBpZiAoJ19ydW5uYWJsZScgPT0ga2V5KSByZXR1cm47XG4gICAgaWYgKCd0ZXN0JyA9PSBrZXkpIHJldHVybjtcbiAgICByZXR1cm4gdmFsO1xuICB9LCAyKTtcbn07XG5cbn0pOyAvLyBtb2R1bGU6IGNvbnRleHQuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImhvb2suanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBSdW5uYWJsZSA9IHJlcXVpcmUoJy4vcnVubmFibGUnKTtcblxuLyoqXG4gKiBFeHBvc2UgYEhvb2tgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gSG9vaztcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBIb29rYCB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgIGFuZCBjYWxsYmFjayBgZm5gLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0aXRsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIEhvb2sodGl0bGUsIGZuKSB7XG4gIFJ1bm5hYmxlLmNhbGwodGhpcywgdGl0bGUsIGZuKTtcbiAgdGhpcy50eXBlID0gJ2hvb2snO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgUnVubmFibGUucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gUnVubmFibGUucHJvdG90eXBlO1xuSG9vay5wcm90b3R5cGUgPSBuZXcgRjtcbkhvb2sucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gSG9vaztcblxuXG4vKipcbiAqIEdldCBvciBzZXQgdGhlIHRlc3QgYGVycmAuXG4gKlxuICogQHBhcmFtIHtFcnJvcn0gZXJyXG4gKiBAcmV0dXJuIHtFcnJvcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuSG9vay5wcm90b3R5cGUuZXJyb3IgPSBmdW5jdGlvbihlcnIpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgdmFyIGVyciA9IHRoaXMuX2Vycm9yO1xuICAgIHRoaXMuX2Vycm9yID0gbnVsbDtcbiAgICByZXR1cm4gZXJyO1xuICB9XG5cbiAgdGhpcy5fZXJyb3IgPSBlcnI7XG59O1xuXG59KTsgLy8gbW9kdWxlOiBob29rLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJpbnRlcmZhY2VzL2JkZC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIFN1aXRlID0gcmVxdWlyZSgnLi4vc3VpdGUnKVxuICAsIFRlc3QgPSByZXF1aXJlKCcuLi90ZXN0JylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbi8qKlxuICogQkRELXN0eWxlIGludGVyZmFjZTpcbiAqXG4gKiAgICAgIGRlc2NyaWJlKCdBcnJheScsIGZ1bmN0aW9uKCl7XG4gKiAgICAgICAgZGVzY3JpYmUoJyNpbmRleE9mKCknLCBmdW5jdGlvbigpe1xuICogICAgICAgICAgaXQoJ3Nob3VsZCByZXR1cm4gLTEgd2hlbiBub3QgcHJlc2VudCcsIGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICAgfSk7XG4gKlxuICogICAgICAgICAgaXQoJ3Nob3VsZCByZXR1cm4gdGhlIGluZGV4IHdoZW4gcHJlc2VudCcsIGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICAgfSk7XG4gKiAgICAgICAgfSk7XG4gKiAgICAgIH0pO1xuICpcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHN1aXRlKXtcbiAgdmFyIHN1aXRlcyA9IFtzdWl0ZV07XG5cbiAgc3VpdGUub24oJ3ByZS1yZXF1aXJlJywgZnVuY3Rpb24oY29udGV4dCwgZmlsZSwgbW9jaGEpe1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBiZWZvcmUgcnVubmluZyB0ZXN0cy5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYmVmb3JlID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmJlZm9yZUFsbChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYWZ0ZXIgcnVubmluZyB0ZXN0cy5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYWZ0ZXIgPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYWZ0ZXJBbGwobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGJlZm9yZSBlYWNoIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYmVmb3JlRWFjaCA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5iZWZvcmVFYWNoKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBhZnRlciBlYWNoIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYWZ0ZXJFYWNoID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmFmdGVyRWFjaChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIERlc2NyaWJlIGEgXCJzdWl0ZVwiIHdpdGggdGhlIGdpdmVuIGB0aXRsZWBcbiAgICAgKiBhbmQgY2FsbGJhY2sgYGZuYCBjb250YWluaW5nIG5lc3RlZCBzdWl0ZXNcbiAgICAgKiBhbmQvb3IgdGVzdHMuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmRlc2NyaWJlID0gY29udGV4dC5jb250ZXh0ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IFN1aXRlLmNyZWF0ZShzdWl0ZXNbMF0sIHRpdGxlKTtcbiAgICAgIHN1aXRlLmZpbGUgPSBmaWxlO1xuICAgICAgc3VpdGVzLnVuc2hpZnQoc3VpdGUpO1xuICAgICAgZm4uY2FsbChzdWl0ZSk7XG4gICAgICBzdWl0ZXMuc2hpZnQoKTtcbiAgICAgIHJldHVybiBzdWl0ZTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUGVuZGluZyBkZXNjcmliZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQueGRlc2NyaWJlID1cbiAgICBjb250ZXh0Lnhjb250ZXh0ID1cbiAgICBjb250ZXh0LmRlc2NyaWJlLnNraXAgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHN1aXRlID0gU3VpdGUuY3JlYXRlKHN1aXRlc1swXSwgdGl0bGUpO1xuICAgICAgc3VpdGUucGVuZGluZyA9IHRydWU7XG4gICAgICBzdWl0ZXMudW5zaGlmdChzdWl0ZSk7XG4gICAgICBmbi5jYWxsKHN1aXRlKTtcbiAgICAgIHN1aXRlcy5zaGlmdCgpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGNsdXNpdmUgc3VpdGUuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmRlc2NyaWJlLm9ubHkgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHN1aXRlID0gY29udGV4dC5kZXNjcmliZSh0aXRsZSwgZm4pO1xuICAgICAgbW9jaGEuZ3JlcChzdWl0ZS5mdWxsVGl0bGUoKSk7XG4gICAgICByZXR1cm4gc3VpdGU7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIERlc2NyaWJlIGEgc3BlY2lmaWNhdGlvbiBvciB0ZXN0LWNhc2VcbiAgICAgKiB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgIGFuZCBjYWxsYmFjayBgZm5gXG4gICAgICogYWN0aW5nIGFzIGEgdGh1bmsuXG4gICAgICovXG5cbiAgICBjb250ZXh0Lml0ID0gY29udGV4dC5zcGVjaWZ5ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IHN1aXRlc1swXTtcbiAgICAgIGlmIChzdWl0ZS5wZW5kaW5nKSB2YXIgZm4gPSBudWxsO1xuICAgICAgdmFyIHRlc3QgPSBuZXcgVGVzdCh0aXRsZSwgZm4pO1xuICAgICAgdGVzdC5maWxlID0gZmlsZTtcbiAgICAgIHN1aXRlLmFkZFRlc3QodGVzdCk7XG4gICAgICByZXR1cm4gdGVzdDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhjbHVzaXZlIHRlc3QtY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuaXQub25seSA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gICAgICB2YXIgdGVzdCA9IGNvbnRleHQuaXQodGl0bGUsIGZuKTtcbiAgICAgIHZhciByZVN0cmluZyA9ICdeJyArIHV0aWxzLmVzY2FwZVJlZ2V4cCh0ZXN0LmZ1bGxUaXRsZSgpKSArICckJztcbiAgICAgIG1vY2hhLmdyZXAobmV3IFJlZ0V4cChyZVN0cmluZykpO1xuICAgICAgcmV0dXJuIHRlc3Q7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFBlbmRpbmcgdGVzdCBjYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC54aXQgPVxuICAgIGNvbnRleHQueHNwZWNpZnkgPVxuICAgIGNvbnRleHQuaXQuc2tpcCA9IGZ1bmN0aW9uKHRpdGxlKXtcbiAgICAgIGNvbnRleHQuaXQodGl0bGUpO1xuICAgIH07XG4gIH0pO1xufTtcblxufSk7IC8vIG1vZHVsZTogaW50ZXJmYWNlcy9iZGQuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImludGVyZmFjZXMvZXhwb3J0cy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIFN1aXRlID0gcmVxdWlyZSgnLi4vc3VpdGUnKVxuICAsIFRlc3QgPSByZXF1aXJlKCcuLi90ZXN0Jyk7XG5cbi8qKlxuICogVERELXN0eWxlIGludGVyZmFjZTpcbiAqXG4gKiAgICAgZXhwb3J0cy5BcnJheSA9IHtcbiAqICAgICAgICcjaW5kZXhPZigpJzoge1xuICogICAgICAgICAnc2hvdWxkIHJldHVybiAtMSB3aGVuIHRoZSB2YWx1ZSBpcyBub3QgcHJlc2VudCc6IGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICB9LFxuICpcbiAqICAgICAgICAgJ3Nob3VsZCByZXR1cm4gdGhlIGNvcnJlY3QgaW5kZXggd2hlbiB0aGUgdmFsdWUgaXMgcHJlc2VudCc6IGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICB9XG4gKiAgICAgICB9XG4gKiAgICAgfTtcbiAqXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzdWl0ZSl7XG4gIHZhciBzdWl0ZXMgPSBbc3VpdGVdO1xuXG4gIHN1aXRlLm9uKCdyZXF1aXJlJywgdmlzaXQpO1xuXG4gIGZ1bmN0aW9uIHZpc2l0KG9iaiwgZmlsZSkge1xuICAgIHZhciBzdWl0ZTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2Ygb2JqW2tleV0pIHtcbiAgICAgICAgdmFyIGZuID0gb2JqW2tleV07XG4gICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgY2FzZSAnYmVmb3JlJzpcbiAgICAgICAgICAgIHN1aXRlc1swXS5iZWZvcmVBbGwoZm4pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnYWZ0ZXInOlxuICAgICAgICAgICAgc3VpdGVzWzBdLmFmdGVyQWxsKGZuKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2JlZm9yZUVhY2gnOlxuICAgICAgICAgICAgc3VpdGVzWzBdLmJlZm9yZUVhY2goZm4pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnYWZ0ZXJFYWNoJzpcbiAgICAgICAgICAgIHN1aXRlc1swXS5hZnRlckVhY2goZm4pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHZhciB0ZXN0ID0gbmV3IFRlc3Qoa2V5LCBmbik7XG4gICAgICAgICAgICB0ZXN0LmZpbGUgPSBmaWxlO1xuICAgICAgICAgICAgc3VpdGVzWzBdLmFkZFRlc3QodGVzdCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBzdWl0ZSA9IFN1aXRlLmNyZWF0ZShzdWl0ZXNbMF0sIGtleSk7XG4gICAgICAgIHN1aXRlcy51bnNoaWZ0KHN1aXRlKTtcbiAgICAgICAgdmlzaXQob2JqW2tleV0pO1xuICAgICAgICBzdWl0ZXMuc2hpZnQoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbn0pOyAvLyBtb2R1bGU6IGludGVyZmFjZXMvZXhwb3J0cy5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiaW50ZXJmYWNlcy9pbmRleC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG5leHBvcnRzLmJkZCA9IHJlcXVpcmUoJy4vYmRkJyk7XG5leHBvcnRzLnRkZCA9IHJlcXVpcmUoJy4vdGRkJyk7XG5leHBvcnRzLnF1bml0ID0gcmVxdWlyZSgnLi9xdW5pdCcpO1xuZXhwb3J0cy5leHBvcnRzID0gcmVxdWlyZSgnLi9leHBvcnRzJyk7XG5cbn0pOyAvLyBtb2R1bGU6IGludGVyZmFjZXMvaW5kZXguanNcblxucmVxdWlyZS5yZWdpc3RlcihcImludGVyZmFjZXMvcXVuaXQuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBTdWl0ZSA9IHJlcXVpcmUoJy4uL3N1aXRlJylcbiAgLCBUZXN0ID0gcmVxdWlyZSgnLi4vdGVzdCcpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4vKipcbiAqIFFVbml0LXN0eWxlIGludGVyZmFjZTpcbiAqXG4gKiAgICAgc3VpdGUoJ0FycmF5Jyk7XG4gKlxuICogICAgIHRlc3QoJyNsZW5ndGgnLCBmdW5jdGlvbigpe1xuICogICAgICAgdmFyIGFyciA9IFsxLDIsM107XG4gKiAgICAgICBvayhhcnIubGVuZ3RoID09IDMpO1xuICogICAgIH0pO1xuICpcbiAqICAgICB0ZXN0KCcjaW5kZXhPZigpJywgZnVuY3Rpb24oKXtcbiAqICAgICAgIHZhciBhcnIgPSBbMSwyLDNdO1xuICogICAgICAgb2soYXJyLmluZGV4T2YoMSkgPT0gMCk7XG4gKiAgICAgICBvayhhcnIuaW5kZXhPZigyKSA9PSAxKTtcbiAqICAgICAgIG9rKGFyci5pbmRleE9mKDMpID09IDIpO1xuICogICAgIH0pO1xuICpcbiAqICAgICBzdWl0ZSgnU3RyaW5nJyk7XG4gKlxuICogICAgIHRlc3QoJyNsZW5ndGgnLCBmdW5jdGlvbigpe1xuICogICAgICAgb2soJ2ZvbycubGVuZ3RoID09IDMpO1xuICogICAgIH0pO1xuICpcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHN1aXRlKXtcbiAgdmFyIHN1aXRlcyA9IFtzdWl0ZV07XG5cbiAgc3VpdGUub24oJ3ByZS1yZXF1aXJlJywgZnVuY3Rpb24oY29udGV4dCwgZmlsZSwgbW9jaGEpe1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBiZWZvcmUgcnVubmluZyB0ZXN0cy5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYmVmb3JlID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmJlZm9yZUFsbChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYWZ0ZXIgcnVubmluZyB0ZXN0cy5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYWZ0ZXIgPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYWZ0ZXJBbGwobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGJlZm9yZSBlYWNoIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYmVmb3JlRWFjaCA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5iZWZvcmVFYWNoKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBhZnRlciBlYWNoIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYWZ0ZXJFYWNoID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmFmdGVyRWFjaChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIERlc2NyaWJlIGEgXCJzdWl0ZVwiIHdpdGggdGhlIGdpdmVuIGB0aXRsZWAuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnN1aXRlID0gZnVuY3Rpb24odGl0bGUpe1xuICAgICAgaWYgKHN1aXRlcy5sZW5ndGggPiAxKSBzdWl0ZXMuc2hpZnQoKTtcbiAgICAgIHZhciBzdWl0ZSA9IFN1aXRlLmNyZWF0ZShzdWl0ZXNbMF0sIHRpdGxlKTtcbiAgICAgIHN1aXRlLmZpbGUgPSBmaWxlO1xuICAgICAgc3VpdGVzLnVuc2hpZnQoc3VpdGUpO1xuICAgICAgcmV0dXJuIHN1aXRlO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGNsdXNpdmUgdGVzdC1jYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zdWl0ZS5vbmx5ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IGNvbnRleHQuc3VpdGUodGl0bGUsIGZuKTtcbiAgICAgIG1vY2hhLmdyZXAoc3VpdGUuZnVsbFRpdGxlKCkpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZSBhIHNwZWNpZmljYXRpb24gb3IgdGVzdC1jYXNlXG4gICAgICogd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYCBhbmQgY2FsbGJhY2sgYGZuYFxuICAgICAqIGFjdGluZyBhcyBhIHRodW5rLlxuICAgICAqL1xuXG4gICAgY29udGV4dC50ZXN0ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciB0ZXN0ID0gbmV3IFRlc3QodGl0bGUsIGZuKTtcbiAgICAgIHRlc3QuZmlsZSA9IGZpbGU7XG4gICAgICBzdWl0ZXNbMF0uYWRkVGVzdCh0ZXN0KTtcbiAgICAgIHJldHVybiB0ZXN0O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGNsdXNpdmUgdGVzdC1jYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC50ZXN0Lm9ubHkgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHRlc3QgPSBjb250ZXh0LnRlc3QodGl0bGUsIGZuKTtcbiAgICAgIHZhciByZVN0cmluZyA9ICdeJyArIHV0aWxzLmVzY2FwZVJlZ2V4cCh0ZXN0LmZ1bGxUaXRsZSgpKSArICckJztcbiAgICAgIG1vY2hhLmdyZXAobmV3IFJlZ0V4cChyZVN0cmluZykpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBQZW5kaW5nIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQudGVzdC5za2lwID0gZnVuY3Rpb24odGl0bGUpe1xuICAgICAgY29udGV4dC50ZXN0KHRpdGxlKTtcbiAgICB9O1xuICB9KTtcbn07XG5cbn0pOyAvLyBtb2R1bGU6IGludGVyZmFjZXMvcXVuaXQuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImludGVyZmFjZXMvdGRkLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgU3VpdGUgPSByZXF1aXJlKCcuLi9zdWl0ZScpXG4gICwgVGVzdCA9IHJlcXVpcmUoJy4uL3Rlc3QnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTs7XG5cbi8qKlxuICogVERELXN0eWxlIGludGVyZmFjZTpcbiAqXG4gKiAgICAgIHN1aXRlKCdBcnJheScsIGZ1bmN0aW9uKCl7XG4gKiAgICAgICAgc3VpdGUoJyNpbmRleE9mKCknLCBmdW5jdGlvbigpe1xuICogICAgICAgICAgc3VpdGVTZXR1cChmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgIH0pO1xuICpcbiAqICAgICAgICAgIHRlc3QoJ3Nob3VsZCByZXR1cm4gLTEgd2hlbiBub3QgcHJlc2VudCcsIGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICAgfSk7XG4gKlxuICogICAgICAgICAgdGVzdCgnc2hvdWxkIHJldHVybiB0aGUgaW5kZXggd2hlbiBwcmVzZW50JywgZnVuY3Rpb24oKXtcbiAqXG4gKiAgICAgICAgICB9KTtcbiAqXG4gKiAgICAgICAgICBzdWl0ZVRlYXJkb3duKGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICAgfSk7XG4gKiAgICAgICAgfSk7XG4gKiAgICAgIH0pO1xuICpcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHN1aXRlKXtcbiAgdmFyIHN1aXRlcyA9IFtzdWl0ZV07XG5cbiAgc3VpdGUub24oJ3ByZS1yZXF1aXJlJywgZnVuY3Rpb24oY29udGV4dCwgZmlsZSwgbW9jaGEpe1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBiZWZvcmUgZWFjaCB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnNldHVwID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmJlZm9yZUVhY2gobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGFmdGVyIGVhY2ggdGVzdCBjYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC50ZWFyZG93biA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5hZnRlckVhY2gobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGJlZm9yZSB0aGUgc3VpdGUuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnN1aXRlU2V0dXAgPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYmVmb3JlQWxsKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBhZnRlciB0aGUgc3VpdGUuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnN1aXRlVGVhcmRvd24gPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYWZ0ZXJBbGwobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZSBhIFwic3VpdGVcIiB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgXG4gICAgICogYW5kIGNhbGxiYWNrIGBmbmAgY29udGFpbmluZyBuZXN0ZWQgc3VpdGVzXG4gICAgICogYW5kL29yIHRlc3RzLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zdWl0ZSA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gICAgICB2YXIgc3VpdGUgPSBTdWl0ZS5jcmVhdGUoc3VpdGVzWzBdLCB0aXRsZSk7XG4gICAgICBzdWl0ZS5maWxlID0gZmlsZTtcbiAgICAgIHN1aXRlcy51bnNoaWZ0KHN1aXRlKTtcbiAgICAgIGZuLmNhbGwoc3VpdGUpO1xuICAgICAgc3VpdGVzLnNoaWZ0KCk7XG4gICAgICByZXR1cm4gc3VpdGU7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFBlbmRpbmcgc3VpdGUuXG4gICAgICovXG4gICAgY29udGV4dC5zdWl0ZS5za2lwID0gZnVuY3Rpb24odGl0bGUsIGZuKSB7XG4gICAgICB2YXIgc3VpdGUgPSBTdWl0ZS5jcmVhdGUoc3VpdGVzWzBdLCB0aXRsZSk7XG4gICAgICBzdWl0ZS5wZW5kaW5nID0gdHJ1ZTtcbiAgICAgIHN1aXRlcy51bnNoaWZ0KHN1aXRlKTtcbiAgICAgIGZuLmNhbGwoc3VpdGUpO1xuICAgICAgc3VpdGVzLnNoaWZ0KCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4Y2x1c2l2ZSB0ZXN0LWNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnN1aXRlLm9ubHkgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHN1aXRlID0gY29udGV4dC5zdWl0ZSh0aXRsZSwgZm4pO1xuICAgICAgbW9jaGEuZ3JlcChzdWl0ZS5mdWxsVGl0bGUoKSk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIERlc2NyaWJlIGEgc3BlY2lmaWNhdGlvbiBvciB0ZXN0LWNhc2VcbiAgICAgKiB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgIGFuZCBjYWxsYmFjayBgZm5gXG4gICAgICogYWN0aW5nIGFzIGEgdGh1bmsuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnRlc3QgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHN1aXRlID0gc3VpdGVzWzBdO1xuICAgICAgaWYgKHN1aXRlLnBlbmRpbmcpIHZhciBmbiA9IG51bGw7XG4gICAgICB2YXIgdGVzdCA9IG5ldyBUZXN0KHRpdGxlLCBmbik7XG4gICAgICB0ZXN0LmZpbGUgPSBmaWxlO1xuICAgICAgc3VpdGUuYWRkVGVzdCh0ZXN0KTtcbiAgICAgIHJldHVybiB0ZXN0O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGNsdXNpdmUgdGVzdC1jYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC50ZXN0Lm9ubHkgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHRlc3QgPSBjb250ZXh0LnRlc3QodGl0bGUsIGZuKTtcbiAgICAgIHZhciByZVN0cmluZyA9ICdeJyArIHV0aWxzLmVzY2FwZVJlZ2V4cCh0ZXN0LmZ1bGxUaXRsZSgpKSArICckJztcbiAgICAgIG1vY2hhLmdyZXAobmV3IFJlZ0V4cChyZVN0cmluZykpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBQZW5kaW5nIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQudGVzdC5za2lwID0gZnVuY3Rpb24odGl0bGUpe1xuICAgICAgY29udGV4dC50ZXN0KHRpdGxlKTtcbiAgICB9O1xuICB9KTtcbn07XG5cbn0pOyAvLyBtb2R1bGU6IGludGVyZmFjZXMvdGRkLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJtb2NoYS5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyohXG4gKiBtb2NoYVxuICogQ29weXJpZ2h0KGMpIDIwMTEgVEogSG9sb3dheWNodWsgPHRqQHZpc2lvbi1tZWRpYS5jYT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgcGF0aCA9IHJlcXVpcmUoJ2Jyb3dzZXIvcGF0aCcpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbi8qKlxuICogRXhwb3NlIGBNb2NoYWAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gTW9jaGE7XG5cbi8qKlxuICogVG8gcmVxdWlyZSBsb2NhbCBVSXMgYW5kIHJlcG9ydGVycyB3aGVuIHJ1bm5pbmcgaW4gbm9kZS5cbiAqL1xuXG5pZiAodHlwZW9mIHByb2Nlc3MgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBwcm9jZXNzLmN3ZCA9PT0gJ2Z1bmN0aW9uJykge1xuICB2YXIgam9pbiA9IHBhdGguam9pblxuICAgICwgY3dkID0gcHJvY2Vzcy5jd2QoKTtcbiAgbW9kdWxlLnBhdGhzLnB1c2goY3dkLCBqb2luKGN3ZCwgJ25vZGVfbW9kdWxlcycpKTtcbn1cblxuLyoqXG4gKiBFeHBvc2UgaW50ZXJuYWxzLlxuICovXG5cbmV4cG9ydHMudXRpbHMgPSB1dGlscztcbmV4cG9ydHMuaW50ZXJmYWNlcyA9IHJlcXVpcmUoJy4vaW50ZXJmYWNlcycpO1xuZXhwb3J0cy5yZXBvcnRlcnMgPSByZXF1aXJlKCcuL3JlcG9ydGVycycpO1xuZXhwb3J0cy5SdW5uYWJsZSA9IHJlcXVpcmUoJy4vcnVubmFibGUnKTtcbmV4cG9ydHMuQ29udGV4dCA9IHJlcXVpcmUoJy4vY29udGV4dCcpO1xuZXhwb3J0cy5SdW5uZXIgPSByZXF1aXJlKCcuL3J1bm5lcicpO1xuZXhwb3J0cy5TdWl0ZSA9IHJlcXVpcmUoJy4vc3VpdGUnKTtcbmV4cG9ydHMuSG9vayA9IHJlcXVpcmUoJy4vaG9vaycpO1xuZXhwb3J0cy5UZXN0ID0gcmVxdWlyZSgnLi90ZXN0Jyk7XG5cbi8qKlxuICogUmV0dXJuIGltYWdlIGBuYW1lYCBwYXRoLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBpbWFnZShuYW1lKSB7XG4gIHJldHVybiBfX2Rpcm5hbWUgKyAnLy4uL2ltYWdlcy8nICsgbmFtZSArICcucG5nJztcbn1cblxuLyoqXG4gKiBTZXR1cCBtb2NoYSB3aXRoIGBvcHRpb25zYC5cbiAqXG4gKiBPcHRpb25zOlxuICpcbiAqICAgLSBgdWlgIG5hbWUgXCJiZGRcIiwgXCJ0ZGRcIiwgXCJleHBvcnRzXCIgZXRjXG4gKiAgIC0gYHJlcG9ydGVyYCByZXBvcnRlciBpbnN0YW5jZSwgZGVmYXVsdHMgdG8gYG1vY2hhLnJlcG9ydGVycy5zcGVjYFxuICogICAtIGBnbG9iYWxzYCBhcnJheSBvZiBhY2NlcHRlZCBnbG9iYWxzXG4gKiAgIC0gYHRpbWVvdXRgIHRpbWVvdXQgaW4gbWlsbGlzZWNvbmRzXG4gKiAgIC0gYGJhaWxgIGJhaWwgb24gdGhlIGZpcnN0IHRlc3QgZmFpbHVyZVxuICogICAtIGBzbG93YCBtaWxsaXNlY29uZHMgdG8gd2FpdCBiZWZvcmUgY29uc2lkZXJpbmcgYSB0ZXN0IHNsb3dcbiAqICAgLSBgaWdub3JlTGVha3NgIGlnbm9yZSBnbG9iYWwgbGVha3NcbiAqICAgLSBgZ3JlcGAgc3RyaW5nIG9yIHJlZ2V4cCB0byBmaWx0ZXIgdGVzdHMgd2l0aFxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIE1vY2hhKG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIHRoaXMuZmlsZXMgPSBbXTtcbiAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgdGhpcy5ncmVwKG9wdGlvbnMuZ3JlcCk7XG4gIHRoaXMuc3VpdGUgPSBuZXcgZXhwb3J0cy5TdWl0ZSgnJywgbmV3IGV4cG9ydHMuQ29udGV4dCk7XG4gIHRoaXMudWkob3B0aW9ucy51aSk7XG4gIHRoaXMuYmFpbChvcHRpb25zLmJhaWwpO1xuICB0aGlzLnJlcG9ydGVyKG9wdGlvbnMucmVwb3J0ZXIpO1xuICBpZiAobnVsbCAhPSBvcHRpb25zLnRpbWVvdXQpIHRoaXMudGltZW91dChvcHRpb25zLnRpbWVvdXQpO1xuICB0aGlzLnVzZUNvbG9ycyhvcHRpb25zLnVzZUNvbG9ycylcbiAgaWYgKG9wdGlvbnMuZW5hYmxlVGltZW91dHMgIT09IG51bGwpIHRoaXMuZW5hYmxlVGltZW91dHMob3B0aW9ucy5lbmFibGVUaW1lb3V0cyk7XG4gIGlmIChvcHRpb25zLnNsb3cpIHRoaXMuc2xvdyhvcHRpb25zLnNsb3cpO1xuXG4gIHRoaXMuc3VpdGUub24oJ3ByZS1yZXF1aXJlJywgZnVuY3Rpb24gKGNvbnRleHQpIHtcbiAgICBleHBvcnRzLmFmdGVyRWFjaCA9IGNvbnRleHQuYWZ0ZXJFYWNoIHx8IGNvbnRleHQudGVhcmRvd247XG4gICAgZXhwb3J0cy5hZnRlciA9IGNvbnRleHQuYWZ0ZXIgfHwgY29udGV4dC5zdWl0ZVRlYXJkb3duO1xuICAgIGV4cG9ydHMuYmVmb3JlRWFjaCA9IGNvbnRleHQuYmVmb3JlRWFjaCB8fCBjb250ZXh0LnNldHVwO1xuICAgIGV4cG9ydHMuYmVmb3JlID0gY29udGV4dC5iZWZvcmUgfHwgY29udGV4dC5zdWl0ZVNldHVwO1xuICAgIGV4cG9ydHMuZGVzY3JpYmUgPSBjb250ZXh0LmRlc2NyaWJlIHx8IGNvbnRleHQuc3VpdGU7XG4gICAgZXhwb3J0cy5pdCA9IGNvbnRleHQuaXQgfHwgY29udGV4dC50ZXN0O1xuICAgIGV4cG9ydHMuc2V0dXAgPSBjb250ZXh0LnNldHVwIHx8IGNvbnRleHQuYmVmb3JlRWFjaDtcbiAgICBleHBvcnRzLnN1aXRlU2V0dXAgPSBjb250ZXh0LnN1aXRlU2V0dXAgfHwgY29udGV4dC5iZWZvcmU7XG4gICAgZXhwb3J0cy5zdWl0ZVRlYXJkb3duID0gY29udGV4dC5zdWl0ZVRlYXJkb3duIHx8IGNvbnRleHQuYWZ0ZXI7XG4gICAgZXhwb3J0cy5zdWl0ZSA9IGNvbnRleHQuc3VpdGUgfHwgY29udGV4dC5kZXNjcmliZTtcbiAgICBleHBvcnRzLnRlYXJkb3duID0gY29udGV4dC50ZWFyZG93biB8fCBjb250ZXh0LmFmdGVyRWFjaDtcbiAgICBleHBvcnRzLnRlc3QgPSBjb250ZXh0LnRlc3QgfHwgY29udGV4dC5pdDtcbiAgfSk7XG59XG5cbi8qKlxuICogRW5hYmxlIG9yIGRpc2FibGUgYmFpbGluZyBvbiB0aGUgZmlyc3QgZmFpbHVyZS5cbiAqXG4gKiBAcGFyYW0ge0Jvb2xlYW59IFtiYWlsXVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuYmFpbCA9IGZ1bmN0aW9uKGJhaWwpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSBiYWlsID0gdHJ1ZTtcbiAgdGhpcy5zdWl0ZS5iYWlsKGJhaWwpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQWRkIHRlc3QgYGZpbGVgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS5hZGRGaWxlID0gZnVuY3Rpb24oZmlsZSl7XG4gIHRoaXMuZmlsZXMucHVzaChmaWxlKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCByZXBvcnRlciB0byBgcmVwb3J0ZXJgLCBkZWZhdWx0cyB0byBcInNwZWNcIi5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xGdW5jdGlvbn0gcmVwb3J0ZXIgbmFtZSBvciBjb25zdHJ1Y3RvclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUucmVwb3J0ZXIgPSBmdW5jdGlvbihyZXBvcnRlcil7XG4gIGlmICgnZnVuY3Rpb24nID09IHR5cGVvZiByZXBvcnRlcikge1xuICAgIHRoaXMuX3JlcG9ydGVyID0gcmVwb3J0ZXI7XG4gIH0gZWxzZSB7XG4gICAgcmVwb3J0ZXIgPSByZXBvcnRlciB8fCAnc3BlYyc7XG4gICAgdmFyIF9yZXBvcnRlcjtcbiAgICB0cnkgeyBfcmVwb3J0ZXIgPSByZXF1aXJlKCcuL3JlcG9ydGVycy8nICsgcmVwb3J0ZXIpOyB9IGNhdGNoIChlcnIpIHt9O1xuICAgIGlmICghX3JlcG9ydGVyKSB0cnkgeyBfcmVwb3J0ZXIgPSByZXF1aXJlKHJlcG9ydGVyKTsgfSBjYXRjaCAoZXJyKSB7fTtcbiAgICBpZiAoIV9yZXBvcnRlciAmJiByZXBvcnRlciA9PT0gJ3RlYW1jaXR5JylcbiAgICAgIGNvbnNvbGUud2FybignVGhlIFRlYW1jaXR5IHJlcG9ydGVyIHdhcyBtb3ZlZCB0byBhIHBhY2thZ2UgbmFtZWQgJyArXG4gICAgICAgICdtb2NoYS10ZWFtY2l0eS1yZXBvcnRlciAnICtcbiAgICAgICAgJyhodHRwczovL25wbWpzLm9yZy9wYWNrYWdlL21vY2hhLXRlYW1jaXR5LXJlcG9ydGVyKS4nKTtcbiAgICBpZiAoIV9yZXBvcnRlcikgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlcG9ydGVyIFwiJyArIHJlcG9ydGVyICsgJ1wiJyk7XG4gICAgdGhpcy5fcmVwb3J0ZXIgPSBfcmVwb3J0ZXI7XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCB0ZXN0IFVJIGBuYW1lYCwgZGVmYXVsdHMgdG8gXCJiZGRcIi5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gYmRkXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS51aSA9IGZ1bmN0aW9uKG5hbWUpe1xuICBuYW1lID0gbmFtZSB8fCAnYmRkJztcbiAgdGhpcy5fdWkgPSBleHBvcnRzLmludGVyZmFjZXNbbmFtZV07XG4gIGlmICghdGhpcy5fdWkpIHRyeSB7IHRoaXMuX3VpID0gcmVxdWlyZShuYW1lKTsgfSBjYXRjaCAoZXJyKSB7fTtcbiAgaWYgKCF0aGlzLl91aSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGludGVyZmFjZSBcIicgKyBuYW1lICsgJ1wiJyk7XG4gIHRoaXMuX3VpID0gdGhpcy5fdWkodGhpcy5zdWl0ZSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBMb2FkIHJlZ2lzdGVyZWQgZmlsZXMuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmxvYWRGaWxlcyA9IGZ1bmN0aW9uKGZuKXtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB2YXIgc3VpdGUgPSB0aGlzLnN1aXRlO1xuICB2YXIgcGVuZGluZyA9IHRoaXMuZmlsZXMubGVuZ3RoO1xuICB0aGlzLmZpbGVzLmZvckVhY2goZnVuY3Rpb24oZmlsZSl7XG4gICAgZmlsZSA9IHBhdGgucmVzb2x2ZShmaWxlKTtcbiAgICBzdWl0ZS5lbWl0KCdwcmUtcmVxdWlyZScsIGdsb2JhbCwgZmlsZSwgc2VsZik7XG4gICAgc3VpdGUuZW1pdCgncmVxdWlyZScsIHJlcXVpcmUoZmlsZSksIGZpbGUsIHNlbGYpO1xuICAgIHN1aXRlLmVtaXQoJ3Bvc3QtcmVxdWlyZScsIGdsb2JhbCwgZmlsZSwgc2VsZik7XG4gICAgLS1wZW5kaW5nIHx8IChmbiAmJiBmbigpKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEVuYWJsZSBncm93bCBzdXBwb3J0LlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk1vY2hhLnByb3RvdHlwZS5fZ3Jvd2wgPSBmdW5jdGlvbihydW5uZXIsIHJlcG9ydGVyKSB7XG4gIHZhciBub3RpZnkgPSByZXF1aXJlKCdncm93bCcpO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICB2YXIgc3RhdHMgPSByZXBvcnRlci5zdGF0cztcbiAgICBpZiAoc3RhdHMuZmFpbHVyZXMpIHtcbiAgICAgIHZhciBtc2cgPSBzdGF0cy5mYWlsdXJlcyArICcgb2YgJyArIHJ1bm5lci50b3RhbCArICcgdGVzdHMgZmFpbGVkJztcbiAgICAgIG5vdGlmeShtc2csIHsgbmFtZTogJ21vY2hhJywgdGl0bGU6ICdGYWlsZWQnLCBpbWFnZTogaW1hZ2UoJ2Vycm9yJykgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5vdGlmeShzdGF0cy5wYXNzZXMgKyAnIHRlc3RzIHBhc3NlZCBpbiAnICsgc3RhdHMuZHVyYXRpb24gKyAnbXMnLCB7XG4gICAgICAgICAgbmFtZTogJ21vY2hhJ1xuICAgICAgICAsIHRpdGxlOiAnUGFzc2VkJ1xuICAgICAgICAsIGltYWdlOiBpbWFnZSgnb2snKVxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8qKlxuICogQWRkIHJlZ2V4cCB0byBncmVwLCBpZiBgcmVgIGlzIGEgc3RyaW5nIGl0IGlzIGVzY2FwZWQuXG4gKlxuICogQHBhcmFtIHtSZWdFeHB8U3RyaW5nfSByZVxuICogQHJldHVybiB7TW9jaGF9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS5ncmVwID0gZnVuY3Rpb24ocmUpe1xuICB0aGlzLm9wdGlvbnMuZ3JlcCA9ICdzdHJpbmcnID09IHR5cGVvZiByZVxuICAgID8gbmV3IFJlZ0V4cCh1dGlscy5lc2NhcGVSZWdleHAocmUpKVxuICAgIDogcmU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBJbnZlcnQgYC5ncmVwKClgIG1hdGNoZXMuXG4gKlxuICogQHJldHVybiB7TW9jaGF9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS5pbnZlcnQgPSBmdW5jdGlvbigpe1xuICB0aGlzLm9wdGlvbnMuaW52ZXJ0ID0gdHJ1ZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIElnbm9yZSBnbG9iYWwgbGVha3MuXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBpZ25vcmVcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuaWdub3JlTGVha3MgPSBmdW5jdGlvbihpZ25vcmUpe1xuICB0aGlzLm9wdGlvbnMuaWdub3JlTGVha3MgPSAhIWlnbm9yZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEVuYWJsZSBnbG9iYWwgbGVhayBjaGVja2luZy5cbiAqXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmNoZWNrTGVha3MgPSBmdW5jdGlvbigpe1xuICB0aGlzLm9wdGlvbnMuaWdub3JlTGVha3MgPSBmYWxzZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEVuYWJsZSBncm93bCBzdXBwb3J0LlxuICpcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuZ3Jvd2wgPSBmdW5jdGlvbigpe1xuICB0aGlzLm9wdGlvbnMuZ3Jvd2wgPSB0cnVlO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogSWdub3JlIGBnbG9iYWxzYCBhcnJheSBvciBzdHJpbmcuXG4gKlxuICogQHBhcmFtIHtBcnJheXxTdHJpbmd9IGdsb2JhbHNcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuZ2xvYmFscyA9IGZ1bmN0aW9uKGdsb2JhbHMpe1xuICB0aGlzLm9wdGlvbnMuZ2xvYmFscyA9ICh0aGlzLm9wdGlvbnMuZ2xvYmFscyB8fCBbXSkuY29uY2F0KGdsb2JhbHMpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogRW1pdCBjb2xvciBvdXRwdXQuXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBjb2xvcnNcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUudXNlQ29sb3JzID0gZnVuY3Rpb24oY29sb3JzKXtcbiAgdGhpcy5vcHRpb25zLnVzZUNvbG9ycyA9IGFyZ3VtZW50cy5sZW5ndGggJiYgY29sb3JzICE9IHVuZGVmaW5lZFxuICAgID8gY29sb3JzXG4gICAgOiB0cnVlO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogVXNlIGlubGluZSBkaWZmcyByYXRoZXIgdGhhbiArLy0uXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBpbmxpbmVEaWZmc1xuICogQHJldHVybiB7TW9jaGF9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS51c2VJbmxpbmVEaWZmcyA9IGZ1bmN0aW9uKGlubGluZURpZmZzKSB7XG4gIHRoaXMub3B0aW9ucy51c2VJbmxpbmVEaWZmcyA9IGFyZ3VtZW50cy5sZW5ndGggJiYgaW5saW5lRGlmZnMgIT0gdW5kZWZpbmVkXG4gID8gaW5saW5lRGlmZnNcbiAgOiBmYWxzZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCB0aGUgdGltZW91dCBpbiBtaWxsaXNlY29uZHMuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVvdXRcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUudGltZW91dCA9IGZ1bmN0aW9uKHRpbWVvdXQpe1xuICB0aGlzLnN1aXRlLnRpbWVvdXQodGltZW91dCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgc2xvd25lc3MgdGhyZXNob2xkIGluIG1pbGxpc2Vjb25kcy5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gc2xvd1xuICogQHJldHVybiB7TW9jaGF9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS5zbG93ID0gZnVuY3Rpb24oc2xvdyl7XG4gIHRoaXMuc3VpdGUuc2xvdyhzbG93KTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEVuYWJsZSB0aW1lb3V0cy5cbiAqXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZWRcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuZW5hYmxlVGltZW91dHMgPSBmdW5jdGlvbihlbmFibGVkKSB7XG4gIHRoaXMuc3VpdGUuZW5hYmxlVGltZW91dHMoYXJndW1lbnRzLmxlbmd0aCAmJiBlbmFibGVkICE9PSB1bmRlZmluZWRcbiAgICA/IGVuYWJsZWRcbiAgICA6IHRydWUpO1xuICByZXR1cm4gdGhpc1xufTtcblxuLyoqXG4gKiBNYWtlcyBhbGwgdGVzdHMgYXN5bmMgKGFjY2VwdGluZyBhIGNhbGxiYWNrKVxuICpcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuYXN5bmNPbmx5ID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5vcHRpb25zLmFzeW5jT25seSA9IHRydWU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSdW4gdGVzdHMgYW5kIGludm9rZSBgZm4oKWAgd2hlbiBjb21wbGV0ZS5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UnVubmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24oZm4pe1xuICBpZiAodGhpcy5maWxlcy5sZW5ndGgpIHRoaXMubG9hZEZpbGVzKCk7XG4gIHZhciBzdWl0ZSA9IHRoaXMuc3VpdGU7XG4gIHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuICBvcHRpb25zLmZpbGVzID0gdGhpcy5maWxlcztcbiAgdmFyIHJ1bm5lciA9IG5ldyBleHBvcnRzLlJ1bm5lcihzdWl0ZSk7XG4gIHZhciByZXBvcnRlciA9IG5ldyB0aGlzLl9yZXBvcnRlcihydW5uZXIsIG9wdGlvbnMpO1xuICBydW5uZXIuaWdub3JlTGVha3MgPSBmYWxzZSAhPT0gb3B0aW9ucy5pZ25vcmVMZWFrcztcbiAgcnVubmVyLmFzeW5jT25seSA9IG9wdGlvbnMuYXN5bmNPbmx5O1xuICBpZiAob3B0aW9ucy5ncmVwKSBydW5uZXIuZ3JlcChvcHRpb25zLmdyZXAsIG9wdGlvbnMuaW52ZXJ0KTtcbiAgaWYgKG9wdGlvbnMuZ2xvYmFscykgcnVubmVyLmdsb2JhbHMob3B0aW9ucy5nbG9iYWxzKTtcbiAgaWYgKG9wdGlvbnMuZ3Jvd2wpIHRoaXMuX2dyb3dsKHJ1bm5lciwgcmVwb3J0ZXIpO1xuICBleHBvcnRzLnJlcG9ydGVycy5CYXNlLnVzZUNvbG9ycyA9IG9wdGlvbnMudXNlQ29sb3JzO1xuICBleHBvcnRzLnJlcG9ydGVycy5CYXNlLmlubGluZURpZmZzID0gb3B0aW9ucy51c2VJbmxpbmVEaWZmcztcbiAgcmV0dXJuIHJ1bm5lci5ydW4oZm4pO1xufTtcblxufSk7IC8vIG1vZHVsZTogbW9jaGEuanNcblxucmVxdWlyZS5yZWdpc3RlcihcIm1zLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG4vKipcbiAqIEhlbHBlcnMuXG4gKi9cblxudmFyIHMgPSAxMDAwO1xudmFyIG0gPSBzICogNjA7XG52YXIgaCA9IG0gKiA2MDtcbnZhciBkID0gaCAqIDI0O1xudmFyIHkgPSBkICogMzY1LjI1O1xuXG4vKipcbiAqIFBhcnNlIG9yIGZvcm1hdCB0aGUgZ2l2ZW4gYHZhbGAuXG4gKlxuICogT3B0aW9uczpcbiAqXG4gKiAgLSBgbG9uZ2AgdmVyYm9zZSBmb3JtYXR0aW5nIFtmYWxzZV1cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHZhbFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge1N0cmluZ3xOdW1iZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odmFsLCBvcHRpb25zKXtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgdmFsKSByZXR1cm4gcGFyc2UodmFsKTtcbiAgcmV0dXJuIG9wdGlvbnMubG9uZyA/IGxvbmdGb3JtYXQodmFsKSA6IHNob3J0Rm9ybWF0KHZhbCk7XG59O1xuXG4vKipcbiAqIFBhcnNlIHRoZSBnaXZlbiBgc3RyYCBhbmQgcmV0dXJuIG1pbGxpc2Vjb25kcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYXJzZShzdHIpIHtcbiAgdmFyIG1hdGNoID0gL14oKD86XFxkKyk/XFwuP1xcZCspICoobXN8c2Vjb25kcz98c3xtaW51dGVzP3xtfGhvdXJzP3xofGRheXM/fGR8eWVhcnM/fHkpPyQvaS5leGVjKHN0cik7XG4gIGlmICghbWF0Y2gpIHJldHVybjtcbiAgdmFyIG4gPSBwYXJzZUZsb2F0KG1hdGNoWzFdKTtcbiAgdmFyIHR5cGUgPSAobWF0Y2hbMl0gfHwgJ21zJykudG9Mb3dlckNhc2UoKTtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAneWVhcnMnOlxuICAgIGNhc2UgJ3llYXInOlxuICAgIGNhc2UgJ3knOlxuICAgICAgcmV0dXJuIG4gKiB5O1xuICAgIGNhc2UgJ2RheXMnOlxuICAgIGNhc2UgJ2RheSc6XG4gICAgY2FzZSAnZCc6XG4gICAgICByZXR1cm4gbiAqIGQ7XG4gICAgY2FzZSAnaG91cnMnOlxuICAgIGNhc2UgJ2hvdXInOlxuICAgIGNhc2UgJ2gnOlxuICAgICAgcmV0dXJuIG4gKiBoO1xuICAgIGNhc2UgJ21pbnV0ZXMnOlxuICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgY2FzZSAnbSc6XG4gICAgICByZXR1cm4gbiAqIG07XG4gICAgY2FzZSAnc2Vjb25kcyc6XG4gICAgY2FzZSAnc2Vjb25kJzpcbiAgICBjYXNlICdzJzpcbiAgICAgIHJldHVybiBuICogcztcbiAgICBjYXNlICdtcyc6XG4gICAgICByZXR1cm4gbjtcbiAgfVxufVxuXG4vKipcbiAqIFNob3J0IGZvcm1hdCBmb3IgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNob3J0Rm9ybWF0KG1zKSB7XG4gIGlmIChtcyA+PSBkKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGQpICsgJ2QnO1xuICBpZiAobXMgPj0gaCkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBoKSArICdoJztcbiAgaWYgKG1zID49IG0pIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gbSkgKyAnbSc7XG4gIGlmIChtcyA+PSBzKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIHMpICsgJ3MnO1xuICByZXR1cm4gbXMgKyAnbXMnO1xufVxuXG4vKipcbiAqIExvbmcgZm9ybWF0IGZvciBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbG9uZ0Zvcm1hdChtcykge1xuICByZXR1cm4gcGx1cmFsKG1zLCBkLCAnZGF5JylcbiAgICB8fCBwbHVyYWwobXMsIGgsICdob3VyJylcbiAgICB8fCBwbHVyYWwobXMsIG0sICdtaW51dGUnKVxuICAgIHx8IHBsdXJhbChtcywgcywgJ3NlY29uZCcpXG4gICAgfHwgbXMgKyAnIG1zJztcbn1cblxuLyoqXG4gKiBQbHVyYWxpemF0aW9uIGhlbHBlci5cbiAqL1xuXG5mdW5jdGlvbiBwbHVyYWwobXMsIG4sIG5hbWUpIHtcbiAgaWYgKG1zIDwgbikgcmV0dXJuO1xuICBpZiAobXMgPCBuICogMS41KSByZXR1cm4gTWF0aC5mbG9vcihtcyAvIG4pICsgJyAnICsgbmFtZTtcbiAgcmV0dXJuIE1hdGguY2VpbChtcyAvIG4pICsgJyAnICsgbmFtZSArICdzJztcbn1cblxufSk7IC8vIG1vZHVsZTogbXMuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9iYXNlLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgdHR5ID0gcmVxdWlyZSgnYnJvd3Nlci90dHknKVxuICAsIGRpZmYgPSByZXF1aXJlKCdicm93c2VyL2RpZmYnKVxuICAsIG1zID0gcmVxdWlyZSgnLi4vbXMnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcblxuLyoqXG4gKiBTYXZlIHRpbWVyIHJlZmVyZW5jZXMgdG8gYXZvaWQgU2lub24gaW50ZXJmZXJpbmcgKHNlZSBHSC0yMzcpLlxuICovXG5cbnZhciBEYXRlID0gZ2xvYmFsLkRhdGVcbiAgLCBzZXRUaW1lb3V0ID0gZ2xvYmFsLnNldFRpbWVvdXRcbiAgLCBzZXRJbnRlcnZhbCA9IGdsb2JhbC5zZXRJbnRlcnZhbFxuICAsIGNsZWFyVGltZW91dCA9IGdsb2JhbC5jbGVhclRpbWVvdXRcbiAgLCBjbGVhckludGVydmFsID0gZ2xvYmFsLmNsZWFySW50ZXJ2YWw7XG5cbi8qKlxuICogQ2hlY2sgaWYgYm90aCBzdGRpbyBzdHJlYW1zIGFyZSBhc3NvY2lhdGVkIHdpdGggYSB0dHkuXG4gKi9cblxudmFyIGlzYXR0eSA9IHR0eS5pc2F0dHkoMSkgJiYgdHR5LmlzYXR0eSgyKTtcblxuLyoqXG4gKiBFeHBvc2UgYEJhc2VgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEJhc2U7XG5cbi8qKlxuICogRW5hYmxlIGNvbG9yaW5nIGJ5IGRlZmF1bHQuXG4gKi9cblxuZXhwb3J0cy51c2VDb2xvcnMgPSBpc2F0dHkgfHwgKHByb2Nlc3MuZW52Lk1PQ0hBX0NPTE9SUyAhPT0gdW5kZWZpbmVkKTtcblxuLyoqXG4gKiBJbmxpbmUgZGlmZnMgaW5zdGVhZCBvZiArLy1cbiAqL1xuXG5leHBvcnRzLmlubGluZURpZmZzID0gZmFsc2U7XG5cbi8qKlxuICogRGVmYXVsdCBjb2xvciBtYXAuXG4gKi9cblxuZXhwb3J0cy5jb2xvcnMgPSB7XG4gICAgJ3Bhc3MnOiA5MFxuICAsICdmYWlsJzogMzFcbiAgLCAnYnJpZ2h0IHBhc3MnOiA5MlxuICAsICdicmlnaHQgZmFpbCc6IDkxXG4gICwgJ2JyaWdodCB5ZWxsb3cnOiA5M1xuICAsICdwZW5kaW5nJzogMzZcbiAgLCAnc3VpdGUnOiAwXG4gICwgJ2Vycm9yIHRpdGxlJzogMFxuICAsICdlcnJvciBtZXNzYWdlJzogMzFcbiAgLCAnZXJyb3Igc3RhY2snOiA5MFxuICAsICdjaGVja21hcmsnOiAzMlxuICAsICdmYXN0JzogOTBcbiAgLCAnbWVkaXVtJzogMzNcbiAgLCAnc2xvdyc6IDMxXG4gICwgJ2dyZWVuJzogMzJcbiAgLCAnbGlnaHQnOiA5MFxuICAsICdkaWZmIGd1dHRlcic6IDkwXG4gICwgJ2RpZmYgYWRkZWQnOiA0MlxuICAsICdkaWZmIHJlbW92ZWQnOiA0MVxufTtcblxuLyoqXG4gKiBEZWZhdWx0IHN5bWJvbCBtYXAuXG4gKi9cblxuZXhwb3J0cy5zeW1ib2xzID0ge1xuICBvazogJ+KckycsXG4gIGVycjogJ+KclicsXG4gIGRvdDogJ+KApCdcbn07XG5cbi8vIFdpdGggbm9kZS5qcyBvbiBXaW5kb3dzOiB1c2Ugc3ltYm9scyBhdmFpbGFibGUgaW4gdGVybWluYWwgZGVmYXVsdCBmb250c1xuaWYgKCd3aW4zMicgPT0gcHJvY2Vzcy5wbGF0Zm9ybSkge1xuICBleHBvcnRzLnN5bWJvbHMub2sgPSAnXFx1MjIxQSc7XG4gIGV4cG9ydHMuc3ltYm9scy5lcnIgPSAnXFx1MDBENyc7XG4gIGV4cG9ydHMuc3ltYm9scy5kb3QgPSAnLic7XG59XG5cbi8qKlxuICogQ29sb3IgYHN0cmAgd2l0aCB0aGUgZ2l2ZW4gYHR5cGVgLFxuICogYWxsb3dpbmcgY29sb3JzIHRvIGJlIGRpc2FibGVkLFxuICogYXMgd2VsbCBhcyB1c2VyLWRlZmluZWQgY29sb3JcbiAqIHNjaGVtZXMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbnZhciBjb2xvciA9IGV4cG9ydHMuY29sb3IgPSBmdW5jdGlvbih0eXBlLCBzdHIpIHtcbiAgaWYgKCFleHBvcnRzLnVzZUNvbG9ycykgcmV0dXJuIHN0cjtcbiAgcmV0dXJuICdcXHUwMDFiWycgKyBleHBvcnRzLmNvbG9yc1t0eXBlXSArICdtJyArIHN0ciArICdcXHUwMDFiWzBtJztcbn07XG5cbi8qKlxuICogRXhwb3NlIHRlcm0gd2luZG93IHNpemUsIHdpdGggc29tZVxuICogZGVmYXVsdHMgZm9yIHdoZW4gc3RkZXJyIGlzIG5vdCBhIHR0eS5cbiAqL1xuXG5leHBvcnRzLndpbmRvdyA9IHtcbiAgd2lkdGg6IGlzYXR0eVxuICAgID8gcHJvY2Vzcy5zdGRvdXQuZ2V0V2luZG93U2l6ZVxuICAgICAgPyBwcm9jZXNzLnN0ZG91dC5nZXRXaW5kb3dTaXplKDEpWzBdXG4gICAgICA6IHR0eS5nZXRXaW5kb3dTaXplKClbMV1cbiAgICA6IDc1XG59O1xuXG4vKipcbiAqIEV4cG9zZSBzb21lIGJhc2ljIGN1cnNvciBpbnRlcmFjdGlvbnNcbiAqIHRoYXQgYXJlIGNvbW1vbiBhbW9uZyByZXBvcnRlcnMuXG4gKi9cblxuZXhwb3J0cy5jdXJzb3IgPSB7XG4gIGhpZGU6IGZ1bmN0aW9uKCl7XG4gICAgaXNhdHR5ICYmIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHUwMDFiWz8yNWwnKTtcbiAgfSxcblxuICBzaG93OiBmdW5jdGlvbigpe1xuICAgIGlzYXR0eSAmJiBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFx1MDAxYls/MjVoJyk7XG4gIH0sXG5cbiAgZGVsZXRlTGluZTogZnVuY3Rpb24oKXtcbiAgICBpc2F0dHkgJiYgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1xcdTAwMWJbMksnKTtcbiAgfSxcblxuICBiZWdpbm5pbmdPZkxpbmU6IGZ1bmN0aW9uKCl7XG4gICAgaXNhdHR5ICYmIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHUwMDFiWzBHJyk7XG4gIH0sXG5cbiAgQ1I6IGZ1bmN0aW9uKCl7XG4gICAgaWYgKGlzYXR0eSkge1xuICAgICAgZXhwb3J0cy5jdXJzb3IuZGVsZXRlTGluZSgpO1xuICAgICAgZXhwb3J0cy5jdXJzb3IuYmVnaW5uaW5nT2ZMaW5lKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHInKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogT3V0dXQgdGhlIGdpdmVuIGBmYWlsdXJlc2AgYXMgYSBsaXN0LlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGZhaWx1cmVzXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMubGlzdCA9IGZ1bmN0aW9uKGZhaWx1cmVzKXtcbiAgY29uc29sZS5lcnJvcigpO1xuICBmYWlsdXJlcy5mb3JFYWNoKGZ1bmN0aW9uKHRlc3QsIGkpe1xuICAgIC8vIGZvcm1hdFxuICAgIHZhciBmbXQgPSBjb2xvcignZXJyb3IgdGl0bGUnLCAnICAlcykgJXM6XFxuJylcbiAgICAgICsgY29sb3IoJ2Vycm9yIG1lc3NhZ2UnLCAnICAgICAlcycpXG4gICAgICArIGNvbG9yKCdlcnJvciBzdGFjaycsICdcXG4lc1xcbicpO1xuXG4gICAgLy8gbXNnXG4gICAgdmFyIGVyciA9IHRlc3QuZXJyXG4gICAgICAsIG1lc3NhZ2UgPSBlcnIubWVzc2FnZSB8fCAnJ1xuICAgICAgLCBzdGFjayA9IGVyci5zdGFjayB8fCBtZXNzYWdlXG4gICAgICAsIGluZGV4ID0gc3RhY2suaW5kZXhPZihtZXNzYWdlKSArIG1lc3NhZ2UubGVuZ3RoXG4gICAgICAsIG1zZyA9IHN0YWNrLnNsaWNlKDAsIGluZGV4KVxuICAgICAgLCBhY3R1YWwgPSBlcnIuYWN0dWFsXG4gICAgICAsIGV4cGVjdGVkID0gZXJyLmV4cGVjdGVkXG4gICAgICAsIGVzY2FwZSA9IHRydWU7XG5cbiAgICAvLyB1bmNhdWdodFxuICAgIGlmIChlcnIudW5jYXVnaHQpIHtcbiAgICAgIG1zZyA9ICdVbmNhdWdodCAnICsgbXNnO1xuICAgIH1cblxuICAgIC8vIGV4cGxpY2l0bHkgc2hvdyBkaWZmXG4gICAgaWYgKGVyci5zaG93RGlmZiAmJiBzYW1lVHlwZShhY3R1YWwsIGV4cGVjdGVkKSkge1xuICAgICAgZXNjYXBlID0gZmFsc2U7XG4gICAgICBlcnIuYWN0dWFsID0gYWN0dWFsID0gdXRpbHMuc3RyaW5naWZ5KGFjdHVhbCk7XG4gICAgICBlcnIuZXhwZWN0ZWQgPSBleHBlY3RlZCA9IHV0aWxzLnN0cmluZ2lmeShleHBlY3RlZCk7XG4gICAgfVxuXG4gICAgLy8gYWN0dWFsIC8gZXhwZWN0ZWQgZGlmZlxuICAgIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgYWN0dWFsICYmICdzdHJpbmcnID09IHR5cGVvZiBleHBlY3RlZCkge1xuICAgICAgZm10ID0gY29sb3IoJ2Vycm9yIHRpdGxlJywgJyAgJXMpICVzOlxcbiVzJykgKyBjb2xvcignZXJyb3Igc3RhY2snLCAnXFxuJXNcXG4nKTtcbiAgICAgIHZhciBtYXRjaCA9IG1lc3NhZ2UubWF0Y2goL14oW146XSspOiBleHBlY3RlZC8pO1xuICAgICAgbXNnID0gJ1xcbiAgICAgICcgKyBjb2xvcignZXJyb3IgbWVzc2FnZScsIG1hdGNoID8gbWF0Y2hbMV0gOiBtc2cpO1xuXG4gICAgICBpZiAoZXhwb3J0cy5pbmxpbmVEaWZmcykge1xuICAgICAgICBtc2cgKz0gaW5saW5lRGlmZihlcnIsIGVzY2FwZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtc2cgKz0gdW5pZmllZERpZmYoZXJyLCBlc2NhcGUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGluZGVudCBzdGFjayB0cmFjZSB3aXRob3V0IG1zZ1xuICAgIHN0YWNrID0gc3RhY2suc2xpY2UoaW5kZXggPyBpbmRleCArIDEgOiBpbmRleClcbiAgICAgIC5yZXBsYWNlKC9eL2dtLCAnICAnKTtcblxuICAgIGNvbnNvbGUuZXJyb3IoZm10LCAoaSArIDEpLCB0ZXN0LmZ1bGxUaXRsZSgpLCBtc2csIHN0YWNrKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYEJhc2VgIHJlcG9ydGVyLlxuICpcbiAqIEFsbCBvdGhlciByZXBvcnRlcnMgZ2VuZXJhbGx5XG4gKiBpbmhlcml0IGZyb20gdGhpcyByZXBvcnRlciwgcHJvdmlkaW5nXG4gKiBzdGF0cyBzdWNoIGFzIHRlc3QgZHVyYXRpb24sIG51bWJlclxuICogb2YgdGVzdHMgcGFzc2VkIC8gZmFpbGVkIGV0Yy5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIEJhc2UocnVubmVyKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzID0geyBzdWl0ZXM6IDAsIHRlc3RzOiAwLCBwYXNzZXM6IDAsIHBlbmRpbmc6IDAsIGZhaWx1cmVzOiAwIH1cbiAgICAsIGZhaWx1cmVzID0gdGhpcy5mYWlsdXJlcyA9IFtdO1xuXG4gIGlmICghcnVubmVyKSByZXR1cm47XG4gIHRoaXMucnVubmVyID0gcnVubmVyO1xuXG4gIHJ1bm5lci5zdGF0cyA9IHN0YXRzO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIHN0YXRzLnN0YXJ0ID0gbmV3IERhdGU7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignc3VpdGUnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgc3RhdHMuc3VpdGVzID0gc3RhdHMuc3VpdGVzIHx8IDA7XG4gICAgc3VpdGUucm9vdCB8fCBzdGF0cy5zdWl0ZXMrKztcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHN0YXRzLnRlc3RzID0gc3RhdHMudGVzdHMgfHwgMDtcbiAgICBzdGF0cy50ZXN0cysrO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Bhc3MnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBzdGF0cy5wYXNzZXMgPSBzdGF0cy5wYXNzZXMgfHwgMDtcblxuICAgIHZhciBtZWRpdW0gPSB0ZXN0LnNsb3coKSAvIDI7XG4gICAgdGVzdC5zcGVlZCA9IHRlc3QuZHVyYXRpb24gPiB0ZXN0LnNsb3coKVxuICAgICAgPyAnc2xvdydcbiAgICAgIDogdGVzdC5kdXJhdGlvbiA+IG1lZGl1bVxuICAgICAgICA/ICdtZWRpdW0nXG4gICAgICAgIDogJ2Zhc3QnO1xuXG4gICAgc3RhdHMucGFzc2VzKys7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgc3RhdHMuZmFpbHVyZXMgPSBzdGF0cy5mYWlsdXJlcyB8fCAwO1xuICAgIHN0YXRzLmZhaWx1cmVzKys7XG4gICAgdGVzdC5lcnIgPSBlcnI7XG4gICAgZmFpbHVyZXMucHVzaCh0ZXN0KTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIHN0YXRzLmVuZCA9IG5ldyBEYXRlO1xuICAgIHN0YXRzLmR1cmF0aW9uID0gbmV3IERhdGUgLSBzdGF0cy5zdGFydDtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwZW5kaW5nJywgZnVuY3Rpb24oKXtcbiAgICBzdGF0cy5wZW5kaW5nKys7XG4gIH0pO1xufVxuXG4vKipcbiAqIE91dHB1dCBjb21tb24gZXBpbG9ndWUgdXNlZCBieSBtYW55IG9mXG4gKiB0aGUgYnVuZGxlZCByZXBvcnRlcnMuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5CYXNlLnByb3RvdHlwZS5lcGlsb2d1ZSA9IGZ1bmN0aW9uKCl7XG4gIHZhciBzdGF0cyA9IHRoaXMuc3RhdHM7XG4gIHZhciB0ZXN0cztcbiAgdmFyIGZtdDtcblxuICBjb25zb2xlLmxvZygpO1xuXG4gIC8vIHBhc3Nlc1xuICBmbXQgPSBjb2xvcignYnJpZ2h0IHBhc3MnLCAnICcpXG4gICAgKyBjb2xvcignZ3JlZW4nLCAnICVkIHBhc3NpbmcnKVxuICAgICsgY29sb3IoJ2xpZ2h0JywgJyAoJXMpJyk7XG5cbiAgY29uc29sZS5sb2coZm10LFxuICAgIHN0YXRzLnBhc3NlcyB8fCAwLFxuICAgIG1zKHN0YXRzLmR1cmF0aW9uKSk7XG5cbiAgLy8gcGVuZGluZ1xuICBpZiAoc3RhdHMucGVuZGluZykge1xuICAgIGZtdCA9IGNvbG9yKCdwZW5kaW5nJywgJyAnKVxuICAgICAgKyBjb2xvcigncGVuZGluZycsICcgJWQgcGVuZGluZycpO1xuXG4gICAgY29uc29sZS5sb2coZm10LCBzdGF0cy5wZW5kaW5nKTtcbiAgfVxuXG4gIC8vIGZhaWx1cmVzXG4gIGlmIChzdGF0cy5mYWlsdXJlcykge1xuICAgIGZtdCA9IGNvbG9yKCdmYWlsJywgJyAgJWQgZmFpbGluZycpO1xuXG4gICAgY29uc29sZS5lcnJvcihmbXQsXG4gICAgICBzdGF0cy5mYWlsdXJlcyk7XG5cbiAgICBCYXNlLmxpc3QodGhpcy5mYWlsdXJlcyk7XG4gICAgY29uc29sZS5lcnJvcigpO1xuICB9XG5cbiAgY29uc29sZS5sb2coKTtcbn07XG5cbi8qKlxuICogUGFkIHRoZSBnaXZlbiBgc3RyYCB0byBgbGVuYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcGFyYW0ge1N0cmluZ30gbGVuXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYWQoc3RyLCBsZW4pIHtcbiAgc3RyID0gU3RyaW5nKHN0cik7XG4gIHJldHVybiBBcnJheShsZW4gLSBzdHIubGVuZ3RoICsgMSkuam9pbignICcpICsgc3RyO1xufVxuXG5cbi8qKlxuICogUmV0dXJucyBhbiBpbmxpbmUgZGlmZiBiZXR3ZWVuIDIgc3RyaW5ncyB3aXRoIGNvbG91cmVkIEFOU0kgb3V0cHV0XG4gKlxuICogQHBhcmFtIHtFcnJvcn0gRXJyb3Igd2l0aCBhY3R1YWwvZXhwZWN0ZWRcbiAqIEByZXR1cm4ge1N0cmluZ30gRGlmZlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaW5saW5lRGlmZihlcnIsIGVzY2FwZSkge1xuICB2YXIgbXNnID0gZXJyb3JEaWZmKGVyciwgJ1dvcmRzV2l0aFNwYWNlJywgZXNjYXBlKTtcblxuICAvLyBsaW5lbm9zXG4gIHZhciBsaW5lcyA9IG1zZy5zcGxpdCgnXFxuJyk7XG4gIGlmIChsaW5lcy5sZW5ndGggPiA0KSB7XG4gICAgdmFyIHdpZHRoID0gU3RyaW5nKGxpbmVzLmxlbmd0aCkubGVuZ3RoO1xuICAgIG1zZyA9IGxpbmVzLm1hcChmdW5jdGlvbihzdHIsIGkpe1xuICAgICAgcmV0dXJuIHBhZCgrK2ksIHdpZHRoKSArICcgfCcgKyAnICcgKyBzdHI7XG4gICAgfSkuam9pbignXFxuJyk7XG4gIH1cblxuICAvLyBsZWdlbmRcbiAgbXNnID0gJ1xcbidcbiAgICArIGNvbG9yKCdkaWZmIHJlbW92ZWQnLCAnYWN0dWFsJylcbiAgICArICcgJ1xuICAgICsgY29sb3IoJ2RpZmYgYWRkZWQnLCAnZXhwZWN0ZWQnKVxuICAgICsgJ1xcblxcbidcbiAgICArIG1zZ1xuICAgICsgJ1xcbic7XG5cbiAgLy8gaW5kZW50XG4gIG1zZyA9IG1zZy5yZXBsYWNlKC9eL2dtLCAnICAgICAgJyk7XG4gIHJldHVybiBtc2c7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIHVuaWZpZWQgZGlmZiBiZXR3ZWVuIDIgc3RyaW5nc1xuICpcbiAqIEBwYXJhbSB7RXJyb3J9IEVycm9yIHdpdGggYWN0dWFsL2V4cGVjdGVkXG4gKiBAcmV0dXJuIHtTdHJpbmd9IERpZmZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHVuaWZpZWREaWZmKGVyciwgZXNjYXBlKSB7XG4gIHZhciBpbmRlbnQgPSAnICAgICAgJztcbiAgZnVuY3Rpb24gY2xlYW5VcChsaW5lKSB7XG4gICAgaWYgKGVzY2FwZSkge1xuICAgICAgbGluZSA9IGVzY2FwZUludmlzaWJsZXMobGluZSk7XG4gICAgfVxuICAgIGlmIChsaW5lWzBdID09PSAnKycpIHJldHVybiBpbmRlbnQgKyBjb2xvckxpbmVzKCdkaWZmIGFkZGVkJywgbGluZSk7XG4gICAgaWYgKGxpbmVbMF0gPT09ICctJykgcmV0dXJuIGluZGVudCArIGNvbG9yTGluZXMoJ2RpZmYgcmVtb3ZlZCcsIGxpbmUpO1xuICAgIGlmIChsaW5lLm1hdGNoKC9cXEBcXEAvKSkgcmV0dXJuIG51bGw7XG4gICAgaWYgKGxpbmUubWF0Y2goL1xcXFwgTm8gbmV3bGluZS8pKSByZXR1cm4gbnVsbDtcbiAgICBlbHNlIHJldHVybiBpbmRlbnQgKyBsaW5lO1xuICB9XG4gIGZ1bmN0aW9uIG5vdEJsYW5rKGxpbmUpIHtcbiAgICByZXR1cm4gbGluZSAhPSBudWxsO1xuICB9XG4gIG1zZyA9IGRpZmYuY3JlYXRlUGF0Y2goJ3N0cmluZycsIGVyci5hY3R1YWwsIGVyci5leHBlY3RlZCk7XG4gIHZhciBsaW5lcyA9IG1zZy5zcGxpdCgnXFxuJykuc3BsaWNlKDQpO1xuICByZXR1cm4gJ1xcbiAgICAgICdcbiAgICAgICAgICsgY29sb3JMaW5lcygnZGlmZiBhZGRlZCcsICAgJysgZXhwZWN0ZWQnKSArICcgJ1xuICAgICAgICAgKyBjb2xvckxpbmVzKCdkaWZmIHJlbW92ZWQnLCAnLSBhY3R1YWwnKVxuICAgICAgICAgKyAnXFxuXFxuJ1xuICAgICAgICAgKyBsaW5lcy5tYXAoY2xlYW5VcCkuZmlsdGVyKG5vdEJsYW5rKS5qb2luKCdcXG4nKTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBjaGFyYWN0ZXIgZGlmZiBmb3IgYGVycmAuXG4gKlxuICogQHBhcmFtIHtFcnJvcn0gZXJyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBlcnJvckRpZmYoZXJyLCB0eXBlLCBlc2NhcGUpIHtcbiAgdmFyIGFjdHVhbCAgID0gZXNjYXBlID8gZXNjYXBlSW52aXNpYmxlcyhlcnIuYWN0dWFsKSAgIDogZXJyLmFjdHVhbDtcbiAgdmFyIGV4cGVjdGVkID0gZXNjYXBlID8gZXNjYXBlSW52aXNpYmxlcyhlcnIuZXhwZWN0ZWQpIDogZXJyLmV4cGVjdGVkO1xuICByZXR1cm4gZGlmZlsnZGlmZicgKyB0eXBlXShhY3R1YWwsIGV4cGVjdGVkKS5tYXAoZnVuY3Rpb24oc3RyKXtcbiAgICBpZiAoc3RyLmFkZGVkKSByZXR1cm4gY29sb3JMaW5lcygnZGlmZiBhZGRlZCcsIHN0ci52YWx1ZSk7XG4gICAgaWYgKHN0ci5yZW1vdmVkKSByZXR1cm4gY29sb3JMaW5lcygnZGlmZiByZW1vdmVkJywgc3RyLnZhbHVlKTtcbiAgICByZXR1cm4gc3RyLnZhbHVlO1xuICB9KS5qb2luKCcnKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgc3RyaW5nIHdpdGggYWxsIGludmlzaWJsZSBjaGFyYWN0ZXJzIGluIHBsYWluIHRleHRcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbGluZVxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGVzY2FwZUludmlzaWJsZXMobGluZSkge1xuICAgIHJldHVybiBsaW5lLnJlcGxhY2UoL1xcdC9nLCAnPHRhYj4nKVxuICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcci9nLCAnPENSPicpXG4gICAgICAgICAgICAgICAucmVwbGFjZSgvXFxuL2csICc8TEY+XFxuJyk7XG59XG5cbi8qKlxuICogQ29sb3IgbGluZXMgZm9yIGBzdHJgLCB1c2luZyB0aGUgY29sb3IgYG5hbWVgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBjb2xvckxpbmVzKG5hbWUsIHN0cikge1xuICByZXR1cm4gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24oc3RyKXtcbiAgICByZXR1cm4gY29sb3IobmFtZSwgc3RyKTtcbiAgfSkuam9pbignXFxuJyk7XG59XG5cbi8qKlxuICogQ2hlY2sgdGhhdCBhIC8gYiBoYXZlIHRoZSBzYW1lIHR5cGUuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGFcbiAqIEBwYXJhbSB7T2JqZWN0fSBiXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2FtZVR5cGUoYSwgYikge1xuICBhID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGEpO1xuICBiID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGIpO1xuICByZXR1cm4gYSA9PSBiO1xufVxuXG59KTsgLy8gbW9kdWxlOiByZXBvcnRlcnMvYmFzZS5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL2RvYy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcblxuLyoqXG4gKiBFeHBvc2UgYERvY2AuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gRG9jO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYERvY2AgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBEb2MocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCB0b3RhbCA9IHJ1bm5lci50b3RhbFxuICAgICwgaW5kZW50cyA9IDI7XG5cbiAgZnVuY3Rpb24gaW5kZW50KCkge1xuICAgIHJldHVybiBBcnJheShpbmRlbnRzKS5qb2luKCcgICcpO1xuICB9XG5cbiAgcnVubmVyLm9uKCdzdWl0ZScsIGZ1bmN0aW9uKHN1aXRlKXtcbiAgICBpZiAoc3VpdGUucm9vdCkgcmV0dXJuO1xuICAgICsraW5kZW50cztcbiAgICBjb25zb2xlLmxvZygnJXM8c2VjdGlvbiBjbGFzcz1cInN1aXRlXCI+JywgaW5kZW50KCkpO1xuICAgICsraW5kZW50cztcbiAgICBjb25zb2xlLmxvZygnJXM8aDE+JXM8L2gxPicsIGluZGVudCgpLCB1dGlscy5lc2NhcGUoc3VpdGUudGl0bGUpKTtcbiAgICBjb25zb2xlLmxvZygnJXM8ZGw+JywgaW5kZW50KCkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3N1aXRlIGVuZCcsIGZ1bmN0aW9uKHN1aXRlKXtcbiAgICBpZiAoc3VpdGUucm9vdCkgcmV0dXJuO1xuICAgIGNvbnNvbGUubG9nKCclczwvZGw+JywgaW5kZW50KCkpO1xuICAgIC0taW5kZW50cztcbiAgICBjb25zb2xlLmxvZygnJXM8L3NlY3Rpb24+JywgaW5kZW50KCkpO1xuICAgIC0taW5kZW50cztcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgY29uc29sZS5sb2coJyVzICA8ZHQ+JXM8L2R0PicsIGluZGVudCgpLCB1dGlscy5lc2NhcGUodGVzdC50aXRsZSkpO1xuICAgIHZhciBjb2RlID0gdXRpbHMuZXNjYXBlKHV0aWxzLmNsZWFuKHRlc3QuZm4udG9TdHJpbmcoKSkpO1xuICAgIGNvbnNvbGUubG9nKCclcyAgPGRkPjxwcmU+PGNvZGU+JXM8L2NvZGU+PC9wcmU+PC9kZD4nLCBpbmRlbnQoKSwgY29kZSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgY29uc29sZS5sb2coJyVzICA8ZHQgY2xhc3M9XCJlcnJvclwiPiVzPC9kdD4nLCBpbmRlbnQoKSwgdXRpbHMuZXNjYXBlKHRlc3QudGl0bGUpKTtcbiAgICB2YXIgY29kZSA9IHV0aWxzLmVzY2FwZSh1dGlscy5jbGVhbih0ZXN0LmZuLnRvU3RyaW5nKCkpKTtcbiAgICBjb25zb2xlLmxvZygnJXMgIDxkZCBjbGFzcz1cImVycm9yXCI+PHByZT48Y29kZT4lczwvY29kZT48L3ByZT48L2RkPicsIGluZGVudCgpLCBjb2RlKTtcbiAgICBjb25zb2xlLmxvZygnJXMgIDxkZCBjbGFzcz1cImVycm9yXCI+JXM8L2RkPicsIGluZGVudCgpLCB1dGlscy5lc2NhcGUoZXJyKSk7XG4gIH0pO1xufVxuXG59KTsgLy8gbW9kdWxlOiByZXBvcnRlcnMvZG9jLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvZG90LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgRG90YC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBEb3Q7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgRG90YCBtYXRyaXggdGVzdCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIERvdChydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIHdpZHRoID0gQmFzZS53aW5kb3cud2lkdGggKiAuNzUgfCAwXG4gICAgLCBuID0gLTE7XG5cbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1xcbiAgJyk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGVuZGluZycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGlmICgrK24gJSB3aWR0aCA9PSAwKSBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFxuICAnKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb2xvcigncGVuZGluZycsIEJhc2Uuc3ltYm9scy5kb3QpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgaWYgKCsrbiAlIHdpZHRoID09IDApIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXG4gICcpO1xuICAgIGlmICgnc2xvdycgPT0gdGVzdC5zcGVlZCkge1xuICAgICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29sb3IoJ2JyaWdodCB5ZWxsb3cnLCBCYXNlLnN5bWJvbHMuZG90KSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbG9yKHRlc3Quc3BlZWQsIEJhc2Uuc3ltYm9scy5kb3QpKTtcbiAgICB9XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgaWYgKCsrbiAlIHdpZHRoID09IDApIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXG4gICcpO1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbG9yKCdmYWlsJywgQmFzZS5zeW1ib2xzLmRvdCkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2coKTtcbiAgICBzZWxmLmVwaWxvZ3VlKCk7XG4gIH0pO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcbkRvdC5wcm90b3R5cGUgPSBuZXcgRjtcbkRvdC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBEb3Q7XG5cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2RvdC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL2h0bWwtY292LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgSlNPTkNvdiA9IHJlcXVpcmUoJy4vanNvbi1jb3YnKVxuICAsIGZzID0gcmVxdWlyZSgnYnJvd3Nlci9mcycpO1xuXG4vKipcbiAqIEV4cG9zZSBgSFRNTENvdmAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gSFRNTENvdjtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBKc0NvdmVyYWdlYCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIEhUTUxDb3YocnVubmVyKSB7XG4gIHZhciBqYWRlID0gcmVxdWlyZSgnamFkZScpXG4gICAgLCBmaWxlID0gX19kaXJuYW1lICsgJy90ZW1wbGF0ZXMvY292ZXJhZ2UuamFkZSdcbiAgICAsIHN0ciA9IGZzLnJlYWRGaWxlU3luYyhmaWxlLCAndXRmOCcpXG4gICAgLCBmbiA9IGphZGUuY29tcGlsZShzdHIsIHsgZmlsZW5hbWU6IGZpbGUgfSlcbiAgICAsIHNlbGYgPSB0aGlzO1xuXG4gIEpTT05Db3YuY2FsbCh0aGlzLCBydW5uZXIsIGZhbHNlKTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoZm4oe1xuICAgICAgICBjb3Y6IHNlbGYuY292XG4gICAgICAsIGNvdmVyYWdlQ2xhc3M6IGNvdmVyYWdlQ2xhc3NcbiAgICB9KSk7XG4gIH0pO1xufVxuXG4vKipcbiAqIFJldHVybiBjb3ZlcmFnZSBjbGFzcyBmb3IgYG5gLlxuICpcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNvdmVyYWdlQ2xhc3Mobikge1xuICBpZiAobiA+PSA3NSkgcmV0dXJuICdoaWdoJztcbiAgaWYgKG4gPj0gNTApIHJldHVybiAnbWVkaXVtJztcbiAgaWYgKG4gPj0gMjUpIHJldHVybiAnbG93JztcbiAgcmV0dXJuICd0ZXJyaWJsZSc7XG59XG59KTsgLy8gbW9kdWxlOiByZXBvcnRlcnMvaHRtbC1jb3YuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9odG1sLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpXG4gICwgUHJvZ3Jlc3MgPSByZXF1aXJlKCcuLi9icm93c2VyL3Byb2dyZXNzJylcbiAgLCBlc2NhcGUgPSB1dGlscy5lc2NhcGU7XG5cbi8qKlxuICogU2F2ZSB0aW1lciByZWZlcmVuY2VzIHRvIGF2b2lkIFNpbm9uIGludGVyZmVyaW5nIChzZWUgR0gtMjM3KS5cbiAqL1xuXG52YXIgRGF0ZSA9IGdsb2JhbC5EYXRlXG4gICwgc2V0VGltZW91dCA9IGdsb2JhbC5zZXRUaW1lb3V0XG4gICwgc2V0SW50ZXJ2YWwgPSBnbG9iYWwuc2V0SW50ZXJ2YWxcbiAgLCBjbGVhclRpbWVvdXQgPSBnbG9iYWwuY2xlYXJUaW1lb3V0XG4gICwgY2xlYXJJbnRlcnZhbCA9IGdsb2JhbC5jbGVhckludGVydmFsO1xuXG4vKipcbiAqIEV4cG9zZSBgSFRNTGAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gSFRNTDtcblxuLyoqXG4gKiBTdGF0cyB0ZW1wbGF0ZS5cbiAqL1xuXG52YXIgc3RhdHNUZW1wbGF0ZSA9ICc8dWwgaWQ9XCJtb2NoYS1zdGF0c1wiPidcbiAgKyAnPGxpIGNsYXNzPVwicHJvZ3Jlc3NcIj48Y2FudmFzIHdpZHRoPVwiNDBcIiBoZWlnaHQ9XCI0MFwiPjwvY2FudmFzPjwvbGk+J1xuICArICc8bGkgY2xhc3M9XCJwYXNzZXNcIj48YSBocmVmPVwiI1wiPnBhc3Nlczo8L2E+IDxlbT4wPC9lbT48L2xpPidcbiAgKyAnPGxpIGNsYXNzPVwiZmFpbHVyZXNcIj48YSBocmVmPVwiI1wiPmZhaWx1cmVzOjwvYT4gPGVtPjA8L2VtPjwvbGk+J1xuICArICc8bGkgY2xhc3M9XCJkdXJhdGlvblwiPmR1cmF0aW9uOiA8ZW0+MDwvZW0+czwvbGk+J1xuICArICc8L3VsPic7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgSFRNTGAgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBIVE1MKHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgdG90YWwgPSBydW5uZXIudG90YWxcbiAgICAsIHN0YXQgPSBmcmFnbWVudChzdGF0c1RlbXBsYXRlKVxuICAgICwgaXRlbXMgPSBzdGF0LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdsaScpXG4gICAgLCBwYXNzZXMgPSBpdGVtc1sxXS5nZXRFbGVtZW50c0J5VGFnTmFtZSgnZW0nKVswXVxuICAgICwgcGFzc2VzTGluayA9IGl0ZW1zWzFdLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdhJylbMF1cbiAgICAsIGZhaWx1cmVzID0gaXRlbXNbMl0uZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2VtJylbMF1cbiAgICAsIGZhaWx1cmVzTGluayA9IGl0ZW1zWzJdLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdhJylbMF1cbiAgICAsIGR1cmF0aW9uID0gaXRlbXNbM10uZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2VtJylbMF1cbiAgICAsIGNhbnZhcyA9IHN0YXQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2NhbnZhcycpWzBdXG4gICAgLCByZXBvcnQgPSBmcmFnbWVudCgnPHVsIGlkPVwibW9jaGEtcmVwb3J0XCI+PC91bD4nKVxuICAgICwgc3RhY2sgPSBbcmVwb3J0XVxuICAgICwgcHJvZ3Jlc3NcbiAgICAsIGN0eFxuICAgICwgcm9vdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2NoYScpO1xuXG4gIGlmIChjYW52YXMuZ2V0Q29udGV4dCkge1xuICAgIHZhciByYXRpbyA9IHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvIHx8IDE7XG4gICAgY2FudmFzLnN0eWxlLndpZHRoID0gY2FudmFzLndpZHRoO1xuICAgIGNhbnZhcy5zdHlsZS5oZWlnaHQgPSBjYW52YXMuaGVpZ2h0O1xuICAgIGNhbnZhcy53aWR0aCAqPSByYXRpbztcbiAgICBjYW52YXMuaGVpZ2h0ICo9IHJhdGlvO1xuICAgIGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuICAgIGN0eC5zY2FsZShyYXRpbywgcmF0aW8pO1xuICAgIHByb2dyZXNzID0gbmV3IFByb2dyZXNzO1xuICB9XG5cbiAgaWYgKCFyb290KSByZXR1cm4gZXJyb3IoJyNtb2NoYSBkaXYgbWlzc2luZywgYWRkIGl0IHRvIHlvdXIgZG9jdW1lbnQnKTtcblxuICAvLyBwYXNzIHRvZ2dsZVxuICBvbihwYXNzZXNMaW5rLCAnY2xpY2snLCBmdW5jdGlvbigpe1xuICAgIHVuaGlkZSgpO1xuICAgIHZhciBuYW1lID0gL3Bhc3MvLnRlc3QocmVwb3J0LmNsYXNzTmFtZSkgPyAnJyA6ICcgcGFzcyc7XG4gICAgcmVwb3J0LmNsYXNzTmFtZSA9IHJlcG9ydC5jbGFzc05hbWUucmVwbGFjZSgvZmFpbHxwYXNzL2csICcnKSArIG5hbWU7XG4gICAgaWYgKHJlcG9ydC5jbGFzc05hbWUudHJpbSgpKSBoaWRlU3VpdGVzV2l0aG91dCgndGVzdCBwYXNzJyk7XG4gIH0pO1xuXG4gIC8vIGZhaWx1cmUgdG9nZ2xlXG4gIG9uKGZhaWx1cmVzTGluaywgJ2NsaWNrJywgZnVuY3Rpb24oKXtcbiAgICB1bmhpZGUoKTtcbiAgICB2YXIgbmFtZSA9IC9mYWlsLy50ZXN0KHJlcG9ydC5jbGFzc05hbWUpID8gJycgOiAnIGZhaWwnO1xuICAgIHJlcG9ydC5jbGFzc05hbWUgPSByZXBvcnQuY2xhc3NOYW1lLnJlcGxhY2UoL2ZhaWx8cGFzcy9nLCAnJykgKyBuYW1lO1xuICAgIGlmIChyZXBvcnQuY2xhc3NOYW1lLnRyaW0oKSkgaGlkZVN1aXRlc1dpdGhvdXQoJ3Rlc3QgZmFpbCcpO1xuICB9KTtcblxuICByb290LmFwcGVuZENoaWxkKHN0YXQpO1xuICByb290LmFwcGVuZENoaWxkKHJlcG9ydCk7XG5cbiAgaWYgKHByb2dyZXNzKSBwcm9ncmVzcy5zaXplKDQwKTtcblxuICBydW5uZXIub24oJ3N1aXRlJywgZnVuY3Rpb24oc3VpdGUpe1xuICAgIGlmIChzdWl0ZS5yb290KSByZXR1cm47XG5cbiAgICAvLyBzdWl0ZVxuICAgIHZhciB1cmwgPSBzZWxmLnN1aXRlVVJMKHN1aXRlKTtcbiAgICB2YXIgZWwgPSBmcmFnbWVudCgnPGxpIGNsYXNzPVwic3VpdGVcIj48aDE+PGEgaHJlZj1cIiVzXCI+JXM8L2E+PC9oMT48L2xpPicsIHVybCwgZXNjYXBlKHN1aXRlLnRpdGxlKSk7XG5cbiAgICAvLyBjb250YWluZXJcbiAgICBzdGFja1swXS5hcHBlbmRDaGlsZChlbCk7XG4gICAgc3RhY2sudW5zaGlmdChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd1bCcpKTtcbiAgICBlbC5hcHBlbmRDaGlsZChzdGFja1swXSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignc3VpdGUgZW5kJywgZnVuY3Rpb24oc3VpdGUpe1xuICAgIGlmIChzdWl0ZS5yb290KSByZXR1cm47XG4gICAgc3RhY2suc2hpZnQoKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdmYWlsJywgZnVuY3Rpb24odGVzdCwgZXJyKXtcbiAgICBpZiAoJ2hvb2snID09IHRlc3QudHlwZSkgcnVubmVyLmVtaXQoJ3Rlc3QgZW5kJywgdGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigndGVzdCBlbmQnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICAvLyBUT0RPOiBhZGQgdG8gc3RhdHNcbiAgICB2YXIgcGVyY2VudCA9IHN0YXRzLnRlc3RzIC8gdGhpcy50b3RhbCAqIDEwMCB8IDA7XG4gICAgaWYgKHByb2dyZXNzKSBwcm9ncmVzcy51cGRhdGUocGVyY2VudCkuZHJhdyhjdHgpO1xuXG4gICAgLy8gdXBkYXRlIHN0YXRzXG4gICAgdmFyIG1zID0gbmV3IERhdGUgLSBzdGF0cy5zdGFydDtcbiAgICB0ZXh0KHBhc3Nlcywgc3RhdHMucGFzc2VzKTtcbiAgICB0ZXh0KGZhaWx1cmVzLCBzdGF0cy5mYWlsdXJlcyk7XG4gICAgdGV4dChkdXJhdGlvbiwgKG1zIC8gMTAwMCkudG9GaXhlZCgyKSk7XG5cbiAgICAvLyB0ZXN0XG4gICAgaWYgKCdwYXNzZWQnID09IHRlc3Quc3RhdGUpIHtcbiAgICAgIHZhciB1cmwgPSBzZWxmLnRlc3RVUkwodGVzdCk7XG4gICAgICB2YXIgZWwgPSBmcmFnbWVudCgnPGxpIGNsYXNzPVwidGVzdCBwYXNzICVlXCI+PGgyPiVlPHNwYW4gY2xhc3M9XCJkdXJhdGlvblwiPiVlbXM8L3NwYW4+IDxhIGhyZWY9XCIlc1wiIGNsYXNzPVwicmVwbGF5XCI+4oCjPC9hPjwvaDI+PC9saT4nLCB0ZXN0LnNwZWVkLCB0ZXN0LnRpdGxlLCB0ZXN0LmR1cmF0aW9uLCB1cmwpO1xuICAgIH0gZWxzZSBpZiAodGVzdC5wZW5kaW5nKSB7XG4gICAgICB2YXIgZWwgPSBmcmFnbWVudCgnPGxpIGNsYXNzPVwidGVzdCBwYXNzIHBlbmRpbmdcIj48aDI+JWU8L2gyPjwvbGk+JywgdGVzdC50aXRsZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBlbCA9IGZyYWdtZW50KCc8bGkgY2xhc3M9XCJ0ZXN0IGZhaWxcIj48aDI+JWUgPGEgaHJlZj1cIj9ncmVwPSVlXCIgY2xhc3M9XCJyZXBsYXlcIj7igKM8L2E+PC9oMj48L2xpPicsIHRlc3QudGl0bGUsIGVuY29kZVVSSUNvbXBvbmVudCh0ZXN0LmZ1bGxUaXRsZSgpKSk7XG4gICAgICB2YXIgc3RyID0gdGVzdC5lcnIuc3RhY2sgfHwgdGVzdC5lcnIudG9TdHJpbmcoKTtcblxuICAgICAgLy8gRkYgLyBPcGVyYSBkbyBub3QgYWRkIHRoZSBtZXNzYWdlXG4gICAgICBpZiAoIX5zdHIuaW5kZXhPZih0ZXN0LmVyci5tZXNzYWdlKSkge1xuICAgICAgICBzdHIgPSB0ZXN0LmVyci5tZXNzYWdlICsgJ1xcbicgKyBzdHI7XG4gICAgICB9XG5cbiAgICAgIC8vIDw9SUU3IHN0cmluZ2lmaWVzIHRvIFtPYmplY3QgRXJyb3JdLiBTaW5jZSBpdCBjYW4gYmUgb3ZlcmxvYWRlZCwgd2VcbiAgICAgIC8vIGNoZWNrIGZvciB0aGUgcmVzdWx0IG9mIHRoZSBzdHJpbmdpZnlpbmcuXG4gICAgICBpZiAoJ1tvYmplY3QgRXJyb3JdJyA9PSBzdHIpIHN0ciA9IHRlc3QuZXJyLm1lc3NhZ2U7XG5cbiAgICAgIC8vIFNhZmFyaSBkb2Vzbid0IGdpdmUgeW91IGEgc3RhY2suIExldCdzIGF0IGxlYXN0IHByb3ZpZGUgYSBzb3VyY2UgbGluZS5cbiAgICAgIGlmICghdGVzdC5lcnIuc3RhY2sgJiYgdGVzdC5lcnIuc291cmNlVVJMICYmIHRlc3QuZXJyLmxpbmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBzdHIgKz0gXCJcXG4oXCIgKyB0ZXN0LmVyci5zb3VyY2VVUkwgKyBcIjpcIiArIHRlc3QuZXJyLmxpbmUgKyBcIilcIjtcbiAgICAgIH1cblxuICAgICAgZWwuYXBwZW5kQ2hpbGQoZnJhZ21lbnQoJzxwcmUgY2xhc3M9XCJlcnJvclwiPiVlPC9wcmU+Jywgc3RyKSk7XG4gICAgfVxuXG4gICAgLy8gdG9nZ2xlIGNvZGVcbiAgICAvLyBUT0RPOiBkZWZlclxuICAgIGlmICghdGVzdC5wZW5kaW5nKSB7XG4gICAgICB2YXIgaDIgPSBlbC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaDInKVswXTtcblxuICAgICAgb24oaDIsICdjbGljaycsIGZ1bmN0aW9uKCl7XG4gICAgICAgIHByZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnID09IHByZS5zdHlsZS5kaXNwbGF5XG4gICAgICAgICAgPyAnYmxvY2snXG4gICAgICAgICAgOiAnbm9uZSc7XG4gICAgICB9KTtcblxuICAgICAgdmFyIHByZSA9IGZyYWdtZW50KCc8cHJlPjxjb2RlPiVlPC9jb2RlPjwvcHJlPicsIHV0aWxzLmNsZWFuKHRlc3QuZm4udG9TdHJpbmcoKSkpO1xuICAgICAgZWwuYXBwZW5kQ2hpbGQocHJlKTtcbiAgICAgIHByZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIH1cblxuICAgIC8vIERvbid0IGNhbGwgLmFwcGVuZENoaWxkIGlmICNtb2NoYS1yZXBvcnQgd2FzIGFscmVhZHkgLnNoaWZ0KCknZWQgb2ZmIHRoZSBzdGFjay5cbiAgICBpZiAoc3RhY2tbMF0pIHN0YWNrWzBdLmFwcGVuZENoaWxkKGVsKTtcbiAgfSk7XG59XG5cbi8qKlxuICogUHJvdmlkZSBzdWl0ZSBVUkxcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gW3N1aXRlXVxuICovXG5cbkhUTUwucHJvdG90eXBlLnN1aXRlVVJMID0gZnVuY3Rpb24oc3VpdGUpe1xuICByZXR1cm4gJz9ncmVwPScgKyBlbmNvZGVVUklDb21wb25lbnQoc3VpdGUuZnVsbFRpdGxlKCkpO1xufTtcblxuLyoqXG4gKiBQcm92aWRlIHRlc3QgVVJMXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IFt0ZXN0XVxuICovXG5cbkhUTUwucHJvdG90eXBlLnRlc3RVUkwgPSBmdW5jdGlvbih0ZXN0KXtcbiAgcmV0dXJuICc/Z3JlcD0nICsgZW5jb2RlVVJJQ29tcG9uZW50KHRlc3QuZnVsbFRpdGxlKCkpO1xufTtcblxuLyoqXG4gKiBEaXNwbGF5IGVycm9yIGBtc2dgLlxuICovXG5cbmZ1bmN0aW9uIGVycm9yKG1zZykge1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGZyYWdtZW50KCc8ZGl2IGlkPVwibW9jaGEtZXJyb3JcIj4lczwvZGl2PicsIG1zZykpO1xufVxuXG4vKipcbiAqIFJldHVybiBhIERPTSBmcmFnbWVudCBmcm9tIGBodG1sYC5cbiAqL1xuXG5mdW5jdGlvbiBmcmFnbWVudChodG1sKSB7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzXG4gICAgLCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuICAgICwgaSA9IDE7XG5cbiAgZGl2LmlubmVySFRNTCA9IGh0bWwucmVwbGFjZSgvJShbc2VdKS9nLCBmdW5jdGlvbihfLCB0eXBlKXtcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgIGNhc2UgJ3MnOiByZXR1cm4gU3RyaW5nKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICdlJzogcmV0dXJuIGVzY2FwZShhcmdzW2krK10pO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGRpdi5maXJzdENoaWxkO1xufVxuXG4vKipcbiAqIENoZWNrIGZvciBzdWl0ZXMgdGhhdCBkbyBub3QgaGF2ZSBlbGVtZW50c1xuICogd2l0aCBgY2xhc3NuYW1lYCwgYW5kIGhpZGUgdGhlbS5cbiAqL1xuXG5mdW5jdGlvbiBoaWRlU3VpdGVzV2l0aG91dChjbGFzc25hbWUpIHtcbiAgdmFyIHN1aXRlcyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ3N1aXRlJyk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3VpdGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGVscyA9IHN1aXRlc1tpXS5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKGNsYXNzbmFtZSk7XG4gICAgaWYgKDAgPT0gZWxzLmxlbmd0aCkgc3VpdGVzW2ldLmNsYXNzTmFtZSArPSAnIGhpZGRlbic7XG4gIH1cbn1cblxuLyoqXG4gKiBVbmhpZGUgLmhpZGRlbiBzdWl0ZXMuXG4gKi9cblxuZnVuY3Rpb24gdW5oaWRlKCkge1xuICB2YXIgZWxzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSgnc3VpdGUgaGlkZGVuJyk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgZWxzW2ldLmNsYXNzTmFtZSA9IGVsc1tpXS5jbGFzc05hbWUucmVwbGFjZSgnc3VpdGUgaGlkZGVuJywgJ3N1aXRlJyk7XG4gIH1cbn1cblxuLyoqXG4gKiBTZXQgYGVsYCB0ZXh0IHRvIGBzdHJgLlxuICovXG5cbmZ1bmN0aW9uIHRleHQoZWwsIHN0cikge1xuICBpZiAoZWwudGV4dENvbnRlbnQpIHtcbiAgICBlbC50ZXh0Q29udGVudCA9IHN0cjtcbiAgfSBlbHNlIHtcbiAgICBlbC5pbm5lclRleHQgPSBzdHI7XG4gIH1cbn1cblxuLyoqXG4gKiBMaXN0ZW4gb24gYGV2ZW50YCB3aXRoIGNhbGxiYWNrIGBmbmAuXG4gKi9cblxuZnVuY3Rpb24gb24oZWwsIGV2ZW50LCBmbikge1xuICBpZiAoZWwuYWRkRXZlbnRMaXN0ZW5lcikge1xuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsIGZuLCBmYWxzZSk7XG4gIH0gZWxzZSB7XG4gICAgZWwuYXR0YWNoRXZlbnQoJ29uJyArIGV2ZW50LCBmbik7XG4gIH1cbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2h0bWwuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9pbmRleC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG5leHBvcnRzLkJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKTtcbmV4cG9ydHMuRG90ID0gcmVxdWlyZSgnLi9kb3QnKTtcbmV4cG9ydHMuRG9jID0gcmVxdWlyZSgnLi9kb2MnKTtcbmV4cG9ydHMuVEFQID0gcmVxdWlyZSgnLi90YXAnKTtcbmV4cG9ydHMuSlNPTiA9IHJlcXVpcmUoJy4vanNvbicpO1xuZXhwb3J0cy5IVE1MID0gcmVxdWlyZSgnLi9odG1sJyk7XG5leHBvcnRzLkxpc3QgPSByZXF1aXJlKCcuL2xpc3QnKTtcbmV4cG9ydHMuTWluID0gcmVxdWlyZSgnLi9taW4nKTtcbmV4cG9ydHMuU3BlYyA9IHJlcXVpcmUoJy4vc3BlYycpO1xuZXhwb3J0cy5OeWFuID0gcmVxdWlyZSgnLi9ueWFuJyk7XG5leHBvcnRzLlhVbml0ID0gcmVxdWlyZSgnLi94dW5pdCcpO1xuZXhwb3J0cy5NYXJrZG93biA9IHJlcXVpcmUoJy4vbWFya2Rvd24nKTtcbmV4cG9ydHMuUHJvZ3Jlc3MgPSByZXF1aXJlKCcuL3Byb2dyZXNzJyk7XG5leHBvcnRzLkxhbmRpbmcgPSByZXF1aXJlKCcuL2xhbmRpbmcnKTtcbmV4cG9ydHMuSlNPTkNvdiA9IHJlcXVpcmUoJy4vanNvbi1jb3YnKTtcbmV4cG9ydHMuSFRNTENvdiA9IHJlcXVpcmUoJy4vaHRtbC1jb3YnKTtcbmV4cG9ydHMuSlNPTlN0cmVhbSA9IHJlcXVpcmUoJy4vanNvbi1zdHJlYW0nKTtcblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2luZGV4LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvanNvbi1jb3YuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJyk7XG5cbi8qKlxuICogRXhwb3NlIGBKU09OQ292YC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBKU09OQ292O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYEpzQ292ZXJhZ2VgIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3V0cHV0XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIEpTT05Db3YocnVubmVyLCBvdXRwdXQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBvdXRwdXQgPSAxID09IGFyZ3VtZW50cy5sZW5ndGggPyB0cnVlIDogb3V0cHV0O1xuXG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciB0ZXN0cyA9IFtdXG4gICAgLCBmYWlsdXJlcyA9IFtdXG4gICAgLCBwYXNzZXMgPSBbXTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24odGVzdCl7XG4gICAgdGVzdHMucHVzaCh0ZXN0KTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgcGFzc2VzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGZhaWx1cmVzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICB2YXIgY292ID0gZ2xvYmFsLl8kanNjb3ZlcmFnZSB8fCB7fTtcbiAgICB2YXIgcmVzdWx0ID0gc2VsZi5jb3YgPSBtYXAoY292KTtcbiAgICByZXN1bHQuc3RhdHMgPSBzZWxmLnN0YXRzO1xuICAgIHJlc3VsdC50ZXN0cyA9IHRlc3RzLm1hcChjbGVhbik7XG4gICAgcmVzdWx0LmZhaWx1cmVzID0gZmFpbHVyZXMubWFwKGNsZWFuKTtcbiAgICByZXN1bHQucGFzc2VzID0gcGFzc2VzLm1hcChjbGVhbik7XG4gICAgaWYgKCFvdXRwdXQpIHJldHVybjtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShKU09OLnN0cmluZ2lmeShyZXN1bHQsIG51bGwsIDIgKSk7XG4gIH0pO1xufVxuXG4vKipcbiAqIE1hcCBqc2NvdmVyYWdlIGRhdGEgdG8gYSBKU09OIHN0cnVjdHVyZVxuICogc3VpdGFibGUgZm9yIHJlcG9ydGluZy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gY292XG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBtYXAoY292KSB7XG4gIHZhciByZXQgPSB7XG4gICAgICBpbnN0cnVtZW50YXRpb246ICdub2RlLWpzY292ZXJhZ2UnXG4gICAgLCBzbG9jOiAwXG4gICAgLCBoaXRzOiAwXG4gICAgLCBtaXNzZXM6IDBcbiAgICAsIGNvdmVyYWdlOiAwXG4gICAgLCBmaWxlczogW11cbiAgfTtcblxuICBmb3IgKHZhciBmaWxlbmFtZSBpbiBjb3YpIHtcbiAgICB2YXIgZGF0YSA9IGNvdmVyYWdlKGZpbGVuYW1lLCBjb3ZbZmlsZW5hbWVdKTtcbiAgICByZXQuZmlsZXMucHVzaChkYXRhKTtcbiAgICByZXQuaGl0cyArPSBkYXRhLmhpdHM7XG4gICAgcmV0Lm1pc3NlcyArPSBkYXRhLm1pc3NlcztcbiAgICByZXQuc2xvYyArPSBkYXRhLnNsb2M7XG4gIH1cblxuICByZXQuZmlsZXMuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgcmV0dXJuIGEuZmlsZW5hbWUubG9jYWxlQ29tcGFyZShiLmZpbGVuYW1lKTtcbiAgfSk7XG5cbiAgaWYgKHJldC5zbG9jID4gMCkge1xuICAgIHJldC5jb3ZlcmFnZSA9IChyZXQuaGl0cyAvIHJldC5zbG9jKSAqIDEwMDtcbiAgfVxuXG4gIHJldHVybiByZXQ7XG59O1xuXG4vKipcbiAqIE1hcCBqc2NvdmVyYWdlIGRhdGEgZm9yIGEgc2luZ2xlIHNvdXJjZSBmaWxlXG4gKiB0byBhIEpTT04gc3RydWN0dXJlIHN1aXRhYmxlIGZvciByZXBvcnRpbmcuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVuYW1lIG5hbWUgb2YgdGhlIHNvdXJjZSBmaWxlXG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YSBqc2NvdmVyYWdlIGNvdmVyYWdlIGRhdGFcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNvdmVyYWdlKGZpbGVuYW1lLCBkYXRhKSB7XG4gIHZhciByZXQgPSB7XG4gICAgZmlsZW5hbWU6IGZpbGVuYW1lLFxuICAgIGNvdmVyYWdlOiAwLFxuICAgIGhpdHM6IDAsXG4gICAgbWlzc2VzOiAwLFxuICAgIHNsb2M6IDAsXG4gICAgc291cmNlOiB7fVxuICB9O1xuXG4gIGRhdGEuc291cmNlLmZvckVhY2goZnVuY3Rpb24obGluZSwgbnVtKXtcbiAgICBudW0rKztcblxuICAgIGlmIChkYXRhW251bV0gPT09IDApIHtcbiAgICAgIHJldC5taXNzZXMrKztcbiAgICAgIHJldC5zbG9jKys7XG4gICAgfSBlbHNlIGlmIChkYXRhW251bV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0LmhpdHMrKztcbiAgICAgIHJldC5zbG9jKys7XG4gICAgfVxuXG4gICAgcmV0LnNvdXJjZVtudW1dID0ge1xuICAgICAgICBzb3VyY2U6IGxpbmVcbiAgICAgICwgY292ZXJhZ2U6IGRhdGFbbnVtXSA9PT0gdW5kZWZpbmVkXG4gICAgICAgID8gJydcbiAgICAgICAgOiBkYXRhW251bV1cbiAgICB9O1xuICB9KTtcblxuICByZXQuY292ZXJhZ2UgPSByZXQuaGl0cyAvIHJldC5zbG9jICogMTAwO1xuXG4gIHJldHVybiByZXQ7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgcGxhaW4tb2JqZWN0IHJlcHJlc2VudGF0aW9uIG9mIGB0ZXN0YFxuICogZnJlZSBvZiBjeWNsaWMgcHJvcGVydGllcyBldGMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHRlc3RcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNsZWFuKHRlc3QpIHtcbiAgcmV0dXJuIHtcbiAgICAgIHRpdGxlOiB0ZXN0LnRpdGxlXG4gICAgLCBmdWxsVGl0bGU6IHRlc3QuZnVsbFRpdGxlKClcbiAgICAsIGR1cmF0aW9uOiB0ZXN0LmR1cmF0aW9uXG4gIH1cbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2pzb24tY292LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvanNvbi1zdHJlYW0uanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBMaXN0YC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBMaXN0O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYExpc3RgIHRlc3QgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBMaXN0KHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgdG90YWwgPSBydW5uZXIudG90YWw7XG5cbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoWydzdGFydCcsIHsgdG90YWw6IHRvdGFsIH1dKSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KFsncGFzcycsIGNsZWFuKHRlc3QpXSkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KFsnZmFpbCcsIGNsZWFuKHRlc3QpXSkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoSlNPTi5zdHJpbmdpZnkoWydlbmQnLCBzZWxmLnN0YXRzXSkpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBwbGFpbi1vYmplY3QgcmVwcmVzZW50YXRpb24gb2YgYHRlc3RgXG4gKiBmcmVlIG9mIGN5Y2xpYyBwcm9wZXJ0aWVzIGV0Yy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gdGVzdFxuICogQHJldHVybiB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gY2xlYW4odGVzdCkge1xuICByZXR1cm4ge1xuICAgICAgdGl0bGU6IHRlc3QudGl0bGVcbiAgICAsIGZ1bGxUaXRsZTogdGVzdC5mdWxsVGl0bGUoKVxuICAgICwgZHVyYXRpb246IHRlc3QuZHVyYXRpb25cbiAgfVxufVxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2pzb24tc3RyZWFtLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvanNvbi5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIGN1cnNvciA9IEJhc2UuY3Vyc29yXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgSlNPTmAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gSlNPTlJlcG9ydGVyO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYEpTT05gIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gSlNPTlJlcG9ydGVyKHJ1bm5lcikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciB0ZXN0cyA9IFtdXG4gICAgLCBmYWlsdXJlcyA9IFtdXG4gICAgLCBwYXNzZXMgPSBbXTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24odGVzdCl7XG4gICAgdGVzdHMucHVzaCh0ZXN0KTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgcGFzc2VzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgZmFpbHVyZXMucHVzaCh0ZXN0KTtcbiAgICBpZiAoZXJyID09PSBPYmplY3QoZXJyKSkge1xuICAgICAgdGVzdC5lcnJNc2cgPSBlcnIubWVzc2FnZTtcbiAgICAgIHRlc3QuZXJyU3RhY2sgPSBlcnIuc3RhY2s7XG4gICAgfVxuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgdmFyIG9iaiA9IHtcbiAgICAgIHN0YXRzOiBzZWxmLnN0YXRzLFxuICAgICAgdGVzdHM6IHRlc3RzLm1hcChjbGVhbiksXG4gICAgICBmYWlsdXJlczogZmFpbHVyZXMubWFwKGNsZWFuKSxcbiAgICAgIHBhc3NlczogcGFzc2VzLm1hcChjbGVhbilcbiAgICB9O1xuICAgIHJ1bm5lci50ZXN0UmVzdWx0cyA9IG9iajtcblxuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKEpTT04uc3RyaW5naWZ5KG9iaiwgbnVsbCwgMikpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBwbGFpbi1vYmplY3QgcmVwcmVzZW50YXRpb24gb2YgYHRlc3RgXG4gKiBmcmVlIG9mIGN5Y2xpYyBwcm9wZXJ0aWVzIGV0Yy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gdGVzdFxuICogQHJldHVybiB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gY2xlYW4odGVzdCkge1xuICByZXR1cm4ge1xuICAgIHRpdGxlOiB0ZXN0LnRpdGxlLFxuICAgIGZ1bGxUaXRsZTogdGVzdC5mdWxsVGl0bGUoKSxcbiAgICBkdXJhdGlvbjogdGVzdC5kdXJhdGlvbixcbiAgICBlcnI6IHRlc3QuZXJyLFxuICAgIGVyclN0YWNrOiB0ZXN0LmVyci5zdGFjayxcbiAgICBlcnJNZXNzYWdlOiB0ZXN0LmVyci5tZXNzYWdlXG4gIH1cbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2pzb24uanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9sYW5kaW5nLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY3Vyc29yID0gQmFzZS5jdXJzb3JcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBMYW5kaW5nYC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBMYW5kaW5nO1xuXG4vKipcbiAqIEFpcnBsYW5lIGNvbG9yLlxuICovXG5cbkJhc2UuY29sb3JzLnBsYW5lID0gMDtcblxuLyoqXG4gKiBBaXJwbGFuZSBjcmFzaCBjb2xvci5cbiAqL1xuXG5CYXNlLmNvbG9yc1sncGxhbmUgY3Jhc2gnXSA9IDMxO1xuXG4vKipcbiAqIFJ1bndheSBjb2xvci5cbiAqL1xuXG5CYXNlLmNvbG9ycy5ydW53YXkgPSA5MDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBMYW5kaW5nYCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIExhbmRpbmcocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCB3aWR0aCA9IEJhc2Uud2luZG93LndpZHRoICogLjc1IHwgMFxuICAgICwgdG90YWwgPSBydW5uZXIudG90YWxcbiAgICAsIHN0cmVhbSA9IHByb2Nlc3Muc3Rkb3V0XG4gICAgLCBwbGFuZSA9IGNvbG9yKCdwbGFuZScsICfinIgnKVxuICAgICwgY3Jhc2hlZCA9IC0xXG4gICAgLCBuID0gMDtcblxuICBmdW5jdGlvbiBydW53YXkoKSB7XG4gICAgdmFyIGJ1ZiA9IEFycmF5KHdpZHRoKS5qb2luKCctJyk7XG4gICAgcmV0dXJuICcgICcgKyBjb2xvcigncnVud2F5JywgYnVmKTtcbiAgfVxuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIHN0cmVhbS53cml0ZSgnXFxuICAnKTtcbiAgICBjdXJzb3IuaGlkZSgpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24odGVzdCl7XG4gICAgLy8gY2hlY2sgaWYgdGhlIHBsYW5lIGNyYXNoZWRcbiAgICB2YXIgY29sID0gLTEgPT0gY3Jhc2hlZFxuICAgICAgPyB3aWR0aCAqICsrbiAvIHRvdGFsIHwgMFxuICAgICAgOiBjcmFzaGVkO1xuXG4gICAgLy8gc2hvdyB0aGUgY3Jhc2hcbiAgICBpZiAoJ2ZhaWxlZCcgPT0gdGVzdC5zdGF0ZSkge1xuICAgICAgcGxhbmUgPSBjb2xvcigncGxhbmUgY3Jhc2gnLCAn4pyIJyk7XG4gICAgICBjcmFzaGVkID0gY29sO1xuICAgIH1cblxuICAgIC8vIHJlbmRlciBsYW5kaW5nIHN0cmlwXG4gICAgc3RyZWFtLndyaXRlKCdcXHUwMDFiWzRGXFxuXFxuJyk7XG4gICAgc3RyZWFtLndyaXRlKHJ1bndheSgpKTtcbiAgICBzdHJlYW0ud3JpdGUoJ1xcbiAgJyk7XG4gICAgc3RyZWFtLndyaXRlKGNvbG9yKCdydW53YXknLCBBcnJheShjb2wpLmpvaW4oJ+KLhScpKSk7XG4gICAgc3RyZWFtLndyaXRlKHBsYW5lKVxuICAgIHN0cmVhbS53cml0ZShjb2xvcigncnVud2F5JywgQXJyYXkod2lkdGggLSBjb2wpLmpvaW4oJ+KLhScpICsgJ1xcbicpKTtcbiAgICBzdHJlYW0ud3JpdGUocnVud2F5KCkpO1xuICAgIHN0cmVhbS53cml0ZSgnXFx1MDAxYlswbScpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgY3Vyc29yLnNob3coKTtcbiAgICBjb25zb2xlLmxvZygpO1xuICAgIHNlbGYuZXBpbG9ndWUoKTtcbiAgfSk7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBCYXNlLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEJhc2UucHJvdG90eXBlO1xuTGFuZGluZy5wcm90b3R5cGUgPSBuZXcgRjtcbkxhbmRpbmcucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gTGFuZGluZztcblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2xhbmRpbmcuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9saXN0LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY3Vyc29yID0gQmFzZS5jdXJzb3JcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBMaXN0YC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBMaXN0O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYExpc3RgIHRlc3QgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBMaXN0KHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgbiA9IDA7XG5cbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2coKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCd0ZXN0JywgZnVuY3Rpb24odGVzdCl7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29sb3IoJ3Bhc3MnLCAnICAgICcgKyB0ZXN0LmZ1bGxUaXRsZSgpICsgJzogJykpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB2YXIgZm10ID0gY29sb3IoJ2NoZWNrbWFyaycsICcgIC0nKVxuICAgICAgKyBjb2xvcigncGVuZGluZycsICcgJXMnKTtcbiAgICBjb25zb2xlLmxvZyhmbXQsIHRlc3QuZnVsbFRpdGxlKCkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Bhc3MnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB2YXIgZm10ID0gY29sb3IoJ2NoZWNrbWFyaycsICcgICcrQmFzZS5zeW1ib2xzLmRvdClcbiAgICAgICsgY29sb3IoJ3Bhc3MnLCAnICVzOiAnKVxuICAgICAgKyBjb2xvcih0ZXN0LnNwZWVkLCAnJWRtcycpO1xuICAgIGN1cnNvci5DUigpO1xuICAgIGNvbnNvbGUubG9nKGZtdCwgdGVzdC5mdWxsVGl0bGUoKSwgdGVzdC5kdXJhdGlvbik7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgY3Vyc29yLkNSKCk7XG4gICAgY29uc29sZS5sb2coY29sb3IoJ2ZhaWwnLCAnICAlZCkgJXMnKSwgKytuLCB0ZXN0LmZ1bGxUaXRsZSgpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBzZWxmLmVwaWxvZ3VlLmJpbmQoc2VsZikpO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcbkxpc3QucHJvdG90eXBlID0gbmV3IEY7XG5MaXN0LnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IExpc3Q7XG5cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2xpc3QuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9tYXJrZG93bi5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbi8qKlxuICogRXhwb3NlIGBNYXJrZG93bmAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gTWFya2Rvd247XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgTWFya2Rvd25gIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gTWFya2Rvd24ocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCBsZXZlbCA9IDBcbiAgICAsIGJ1ZiA9ICcnO1xuXG4gIGZ1bmN0aW9uIHRpdGxlKHN0cikge1xuICAgIHJldHVybiBBcnJheShsZXZlbCkuam9pbignIycpICsgJyAnICsgc3RyO1xuICB9XG5cbiAgZnVuY3Rpb24gaW5kZW50KCkge1xuICAgIHJldHVybiBBcnJheShsZXZlbCkuam9pbignICAnKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG1hcFRPQyhzdWl0ZSwgb2JqKSB7XG4gICAgdmFyIHJldCA9IG9iajtcbiAgICBvYmogPSBvYmpbc3VpdGUudGl0bGVdID0gb2JqW3N1aXRlLnRpdGxlXSB8fCB7IHN1aXRlOiBzdWl0ZSB9O1xuICAgIHN1aXRlLnN1aXRlcy5mb3JFYWNoKGZ1bmN0aW9uKHN1aXRlKXtcbiAgICAgIG1hcFRPQyhzdWl0ZSwgb2JqKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgZnVuY3Rpb24gc3RyaW5naWZ5VE9DKG9iaiwgbGV2ZWwpIHtcbiAgICArK2xldmVsO1xuICAgIHZhciBidWYgPSAnJztcbiAgICB2YXIgbGluaztcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoJ3N1aXRlJyA9PSBrZXkpIGNvbnRpbnVlO1xuICAgICAgaWYgKGtleSkgbGluayA9ICcgLSBbJyArIGtleSArICddKCMnICsgdXRpbHMuc2x1ZyhvYmpba2V5XS5zdWl0ZS5mdWxsVGl0bGUoKSkgKyAnKVxcbic7XG4gICAgICBpZiAoa2V5KSBidWYgKz0gQXJyYXkobGV2ZWwpLmpvaW4oJyAgJykgKyBsaW5rO1xuICAgICAgYnVmICs9IHN0cmluZ2lmeVRPQyhvYmpba2V5XSwgbGV2ZWwpO1xuICAgIH1cbiAgICAtLWxldmVsO1xuICAgIHJldHVybiBidWY7XG4gIH1cblxuICBmdW5jdGlvbiBnZW5lcmF0ZVRPQyhzdWl0ZSkge1xuICAgIHZhciBvYmogPSBtYXBUT0Moc3VpdGUsIHt9KTtcbiAgICByZXR1cm4gc3RyaW5naWZ5VE9DKG9iaiwgMCk7XG4gIH1cblxuICBnZW5lcmF0ZVRPQyhydW5uZXIuc3VpdGUpO1xuXG4gIHJ1bm5lci5vbignc3VpdGUnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgKytsZXZlbDtcbiAgICB2YXIgc2x1ZyA9IHV0aWxzLnNsdWcoc3VpdGUuZnVsbFRpdGxlKCkpO1xuICAgIGJ1ZiArPSAnPGEgbmFtZT1cIicgKyBzbHVnICsgJ1wiPjwvYT4nICsgJ1xcbic7XG4gICAgYnVmICs9IHRpdGxlKHN1aXRlLnRpdGxlKSArICdcXG4nO1xuICB9KTtcblxuICBydW5uZXIub24oJ3N1aXRlIGVuZCcsIGZ1bmN0aW9uKHN1aXRlKXtcbiAgICAtLWxldmVsO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Bhc3MnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB2YXIgY29kZSA9IHV0aWxzLmNsZWFuKHRlc3QuZm4udG9TdHJpbmcoKSk7XG4gICAgYnVmICs9IHRlc3QudGl0bGUgKyAnLlxcbic7XG4gICAgYnVmICs9ICdcXG5gYGBqc1xcbic7XG4gICAgYnVmICs9IGNvZGUgKyAnXFxuJztcbiAgICBidWYgKz0gJ2BgYFxcblxcbic7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnIyBUT0NcXG4nKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShnZW5lcmF0ZVRPQyhydW5uZXIuc3VpdGUpKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShidWYpO1xuICB9KTtcbn1cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9tYXJrZG93bi5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL21pbi5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKTtcblxuLyoqXG4gKiBFeHBvc2UgYE1pbmAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gTWluO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYE1pbmAgbWluaW1hbCB0ZXN0IHJlcG9ydGVyIChiZXN0IHVzZWQgd2l0aCAtLXdhdGNoKS5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIE1pbihydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgLy8gY2xlYXIgc2NyZWVuXG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1xcdTAwMWJbMkonKTtcbiAgICAvLyBzZXQgY3Vyc29yIHBvc2l0aW9uXG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1xcdTAwMWJbMTszSCcpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIHRoaXMuZXBpbG9ndWUuYmluZCh0aGlzKSk7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBCYXNlLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEJhc2UucHJvdG90eXBlO1xuTWluLnByb3RvdHlwZSA9IG5ldyBGO1xuTWluLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IE1pbjtcblxuXG59KTsgLy8gbW9kdWxlOiByZXBvcnRlcnMvbWluLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvbnlhbi5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBEb3RgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IE55YW5DYXQ7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgRG90YCBtYXRyaXggdGVzdCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIE55YW5DYXQocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgd2lkdGggPSBCYXNlLndpbmRvdy53aWR0aCAqIC43NSB8IDBcbiAgICAsIHJhaW5ib3dDb2xvcnMgPSB0aGlzLnJhaW5ib3dDb2xvcnMgPSBzZWxmLmdlbmVyYXRlQ29sb3JzKClcbiAgICAsIGNvbG9ySW5kZXggPSB0aGlzLmNvbG9ySW5kZXggPSAwXG4gICAgLCBudW1lck9mTGluZXMgPSB0aGlzLm51bWJlck9mTGluZXMgPSA0XG4gICAgLCB0cmFqZWN0b3JpZXMgPSB0aGlzLnRyYWplY3RvcmllcyA9IFtbXSwgW10sIFtdLCBbXV1cbiAgICAsIG55YW5DYXRXaWR0aCA9IHRoaXMubnlhbkNhdFdpZHRoID0gMTFcbiAgICAsIHRyYWplY3RvcnlXaWR0aE1heCA9IHRoaXMudHJhamVjdG9yeVdpZHRoTWF4ID0gKHdpZHRoIC0gbnlhbkNhdFdpZHRoKVxuICAgICwgc2NvcmVib2FyZFdpZHRoID0gdGhpcy5zY29yZWJvYXJkV2lkdGggPSA1XG4gICAgLCB0aWNrID0gdGhpcy50aWNrID0gMFxuICAgICwgbiA9IDA7XG5cbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgQmFzZS5jdXJzb3IuaGlkZSgpO1xuICAgIHNlbGYuZHJhdygpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBzZWxmLmRyYXcoKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgc2VsZi5kcmF3KCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgc2VsZi5kcmF3KCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICBCYXNlLmN1cnNvci5zaG93KCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLm51bWJlck9mTGluZXM7IGkrKykgd3JpdGUoJ1xcbicpO1xuICAgIHNlbGYuZXBpbG9ndWUoKTtcbiAgfSk7XG59XG5cbi8qKlxuICogRHJhdyB0aGUgbnlhbiBjYXRcbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5kcmF3ID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5hcHBlbmRSYWluYm93KCk7XG4gIHRoaXMuZHJhd1Njb3JlYm9hcmQoKTtcbiAgdGhpcy5kcmF3UmFpbmJvdygpO1xuICB0aGlzLmRyYXdOeWFuQ2F0KCk7XG4gIHRoaXMudGljayA9ICF0aGlzLnRpY2s7XG59O1xuXG4vKipcbiAqIERyYXcgdGhlIFwic2NvcmVib2FyZFwiIHNob3dpbmcgdGhlIG51bWJlclxuICogb2YgcGFzc2VzLCBmYWlsdXJlcyBhbmQgcGVuZGluZyB0ZXN0cy5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5kcmF3U2NvcmVib2FyZCA9IGZ1bmN0aW9uKCl7XG4gIHZhciBzdGF0cyA9IHRoaXMuc3RhdHM7XG4gIHZhciBjb2xvcnMgPSBCYXNlLmNvbG9ycztcblxuICBmdW5jdGlvbiBkcmF3KGNvbG9yLCBuKSB7XG4gICAgd3JpdGUoJyAnKTtcbiAgICB3cml0ZSgnXFx1MDAxYlsnICsgY29sb3IgKyAnbScgKyBuICsgJ1xcdTAwMWJbMG0nKTtcbiAgICB3cml0ZSgnXFxuJyk7XG4gIH1cblxuICBkcmF3KGNvbG9ycy5ncmVlbiwgc3RhdHMucGFzc2VzKTtcbiAgZHJhdyhjb2xvcnMuZmFpbCwgc3RhdHMuZmFpbHVyZXMpO1xuICBkcmF3KGNvbG9ycy5wZW5kaW5nLCBzdGF0cy5wZW5kaW5nKTtcbiAgd3JpdGUoJ1xcbicpO1xuXG4gIHRoaXMuY3Vyc29yVXAodGhpcy5udW1iZXJPZkxpbmVzKTtcbn07XG5cbi8qKlxuICogQXBwZW5kIHRoZSByYWluYm93LlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk55YW5DYXQucHJvdG90eXBlLmFwcGVuZFJhaW5ib3cgPSBmdW5jdGlvbigpe1xuICB2YXIgc2VnbWVudCA9IHRoaXMudGljayA/ICdfJyA6ICctJztcbiAgdmFyIHJhaW5ib3dpZmllZCA9IHRoaXMucmFpbmJvd2lmeShzZWdtZW50KTtcblxuICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgdGhpcy5udW1iZXJPZkxpbmVzOyBpbmRleCsrKSB7XG4gICAgdmFyIHRyYWplY3RvcnkgPSB0aGlzLnRyYWplY3Rvcmllc1tpbmRleF07XG4gICAgaWYgKHRyYWplY3RvcnkubGVuZ3RoID49IHRoaXMudHJhamVjdG9yeVdpZHRoTWF4KSB0cmFqZWN0b3J5LnNoaWZ0KCk7XG4gICAgdHJhamVjdG9yeS5wdXNoKHJhaW5ib3dpZmllZCk7XG4gIH1cbn07XG5cbi8qKlxuICogRHJhdyB0aGUgcmFpbmJvdy5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5kcmF3UmFpbmJvdyA9IGZ1bmN0aW9uKCl7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICB0aGlzLnRyYWplY3Rvcmllcy5mb3JFYWNoKGZ1bmN0aW9uKGxpbmUsIGluZGV4KSB7XG4gICAgd3JpdGUoJ1xcdTAwMWJbJyArIHNlbGYuc2NvcmVib2FyZFdpZHRoICsgJ0MnKTtcbiAgICB3cml0ZShsaW5lLmpvaW4oJycpKTtcbiAgICB3cml0ZSgnXFxuJyk7XG4gIH0pO1xuXG4gIHRoaXMuY3Vyc29yVXAodGhpcy5udW1iZXJPZkxpbmVzKTtcbn07XG5cbi8qKlxuICogRHJhdyB0aGUgbnlhbiBjYXRcbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5kcmF3TnlhbkNhdCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHZhciBzdGFydFdpZHRoID0gdGhpcy5zY29yZWJvYXJkV2lkdGggKyB0aGlzLnRyYWplY3Rvcmllc1swXS5sZW5ndGg7XG4gIHZhciBjb2xvciA9ICdcXHUwMDFiWycgKyBzdGFydFdpZHRoICsgJ0MnO1xuICB2YXIgcGFkZGluZyA9ICcnO1xuXG4gIHdyaXRlKGNvbG9yKTtcbiAgd3JpdGUoJ18sLS0tLS0tLCcpO1xuICB3cml0ZSgnXFxuJyk7XG5cbiAgd3JpdGUoY29sb3IpO1xuICBwYWRkaW5nID0gc2VsZi50aWNrID8gJyAgJyA6ICcgICAnO1xuICB3cml0ZSgnX3wnICsgcGFkZGluZyArICcvXFxcXF8vXFxcXCAnKTtcbiAgd3JpdGUoJ1xcbicpO1xuXG4gIHdyaXRlKGNvbG9yKTtcbiAgcGFkZGluZyA9IHNlbGYudGljayA/ICdfJyA6ICdfXyc7XG4gIHZhciB0YWlsID0gc2VsZi50aWNrID8gJ34nIDogJ14nO1xuICB2YXIgZmFjZTtcbiAgd3JpdGUodGFpbCArICd8JyArIHBhZGRpbmcgKyB0aGlzLmZhY2UoKSArICcgJyk7XG4gIHdyaXRlKCdcXG4nKTtcblxuICB3cml0ZShjb2xvcik7XG4gIHBhZGRpbmcgPSBzZWxmLnRpY2sgPyAnICcgOiAnICAnO1xuICB3cml0ZShwYWRkaW5nICsgJ1wiXCIgIFwiXCIgJyk7XG4gIHdyaXRlKCdcXG4nKTtcblxuICB0aGlzLmN1cnNvclVwKHRoaXMubnVtYmVyT2ZMaW5lcyk7XG59O1xuXG4vKipcbiAqIERyYXcgbnlhbiBjYXQgZmFjZS5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5mYWNlID0gZnVuY3Rpb24oKSB7XG4gIHZhciBzdGF0cyA9IHRoaXMuc3RhdHM7XG4gIGlmIChzdGF0cy5mYWlsdXJlcykge1xuICAgIHJldHVybiAnKCB4IC54KSc7XG4gIH0gZWxzZSBpZiAoc3RhdHMucGVuZGluZykge1xuICAgIHJldHVybiAnKCBvIC5vKSc7XG4gIH0gZWxzZSBpZihzdGF0cy5wYXNzZXMpIHtcbiAgICByZXR1cm4gJyggXiAuXiknO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiAnKCAtIC4tKSc7XG4gIH1cbn1cblxuLyoqXG4gKiBNb3ZlIGN1cnNvciB1cCBgbmAuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk55YW5DYXQucHJvdG90eXBlLmN1cnNvclVwID0gZnVuY3Rpb24obikge1xuICB3cml0ZSgnXFx1MDAxYlsnICsgbiArICdBJyk7XG59O1xuXG4vKipcbiAqIE1vdmUgY3Vyc29yIGRvd24gYG5gLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5jdXJzb3JEb3duID0gZnVuY3Rpb24obikge1xuICB3cml0ZSgnXFx1MDAxYlsnICsgbiArICdCJyk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHJhaW5ib3cgY29sb3JzLlxuICpcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuZ2VuZXJhdGVDb2xvcnMgPSBmdW5jdGlvbigpe1xuICB2YXIgY29sb3JzID0gW107XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCAoNiAqIDcpOyBpKyspIHtcbiAgICB2YXIgcGkzID0gTWF0aC5mbG9vcihNYXRoLlBJIC8gMyk7XG4gICAgdmFyIG4gPSAoaSAqICgxLjAgLyA2KSk7XG4gICAgdmFyIHIgPSBNYXRoLmZsb29yKDMgKiBNYXRoLnNpbihuKSArIDMpO1xuICAgIHZhciBnID0gTWF0aC5mbG9vcigzICogTWF0aC5zaW4obiArIDIgKiBwaTMpICsgMyk7XG4gICAgdmFyIGIgPSBNYXRoLmZsb29yKDMgKiBNYXRoLnNpbihuICsgNCAqIHBpMykgKyAzKTtcbiAgICBjb2xvcnMucHVzaCgzNiAqIHIgKyA2ICogZyArIGIgKyAxNik7XG4gIH1cblxuICByZXR1cm4gY29sb3JzO1xufTtcblxuLyoqXG4gKiBBcHBseSByYWluYm93IHRvIHRoZSBnaXZlbiBgc3RyYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5yYWluYm93aWZ5ID0gZnVuY3Rpb24oc3RyKXtcbiAgdmFyIGNvbG9yID0gdGhpcy5yYWluYm93Q29sb3JzW3RoaXMuY29sb3JJbmRleCAlIHRoaXMucmFpbmJvd0NvbG9ycy5sZW5ndGhdO1xuICB0aGlzLmNvbG9ySW5kZXggKz0gMTtcbiAgcmV0dXJuICdcXHUwMDFiWzM4OzU7JyArIGNvbG9yICsgJ20nICsgc3RyICsgJ1xcdTAwMWJbMG0nO1xufTtcblxuLyoqXG4gKiBTdGRvdXQgaGVscGVyLlxuICovXG5cbmZ1bmN0aW9uIHdyaXRlKHN0cmluZykge1xuICBwcm9jZXNzLnN0ZG91dC53cml0ZShzdHJpbmcpO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcbk55YW5DYXQucHJvdG90eXBlID0gbmV3IEY7XG5OeWFuQ2F0LnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IE55YW5DYXQ7XG5cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL255YW4uanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9wcm9ncmVzcy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCBjdXJzb3IgPSBCYXNlLmN1cnNvclxuICAsIGNvbG9yID0gQmFzZS5jb2xvcjtcblxuLyoqXG4gKiBFeHBvc2UgYFByb2dyZXNzYC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBQcm9ncmVzcztcblxuLyoqXG4gKiBHZW5lcmFsIHByb2dyZXNzIGJhciBjb2xvci5cbiAqL1xuXG5CYXNlLmNvbG9ycy5wcm9ncmVzcyA9IDkwO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFByb2dyZXNzYCBiYXIgdGVzdCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBQcm9ncmVzcyhydW5uZXIsIG9wdGlvbnMpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCB3aWR0aCA9IEJhc2Uud2luZG93LndpZHRoICogLjUwIHwgMFxuICAgICwgdG90YWwgPSBydW5uZXIudG90YWxcbiAgICAsIGNvbXBsZXRlID0gMFxuICAgICwgbWF4ID0gTWF0aC5tYXhcbiAgICAsIGxhc3ROID0gLTE7XG5cbiAgLy8gZGVmYXVsdCBjaGFyc1xuICBvcHRpb25zLm9wZW4gPSBvcHRpb25zLm9wZW4gfHwgJ1snO1xuICBvcHRpb25zLmNvbXBsZXRlID0gb3B0aW9ucy5jb21wbGV0ZSB8fCAn4pasJztcbiAgb3B0aW9ucy5pbmNvbXBsZXRlID0gb3B0aW9ucy5pbmNvbXBsZXRlIHx8IEJhc2Uuc3ltYm9scy5kb3Q7XG4gIG9wdGlvbnMuY2xvc2UgPSBvcHRpb25zLmNsb3NlIHx8ICddJztcbiAgb3B0aW9ucy52ZXJib3NlID0gZmFsc2U7XG5cbiAgLy8gdGVzdHMgc3RhcnRlZFxuICBydW5uZXIub24oJ3N0YXJ0JywgZnVuY3Rpb24oKXtcbiAgICBjb25zb2xlLmxvZygpO1xuICAgIGN1cnNvci5oaWRlKCk7XG4gIH0pO1xuXG4gIC8vIHRlc3RzIGNvbXBsZXRlXG4gIHJ1bm5lci5vbigndGVzdCBlbmQnLCBmdW5jdGlvbigpe1xuICAgIGNvbXBsZXRlKys7XG4gICAgdmFyIGluY29tcGxldGUgPSB0b3RhbCAtIGNvbXBsZXRlXG4gICAgICAsIHBlcmNlbnQgPSBjb21wbGV0ZSAvIHRvdGFsXG4gICAgICAsIG4gPSB3aWR0aCAqIHBlcmNlbnQgfCAwXG4gICAgICAsIGkgPSB3aWR0aCAtIG47XG5cbiAgICBpZiAobGFzdE4gPT09IG4gJiYgIW9wdGlvbnMudmVyYm9zZSkge1xuICAgICAgLy8gRG9uJ3QgcmUtcmVuZGVyIHRoZSBsaW5lIGlmIGl0IGhhc24ndCBjaGFuZ2VkXG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxhc3ROID0gbjtcblxuICAgIGN1cnNvci5DUigpO1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHUwMDFiW0onKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb2xvcigncHJvZ3Jlc3MnLCAnICAnICsgb3B0aW9ucy5vcGVuKSk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoQXJyYXkobikuam9pbihvcHRpb25zLmNvbXBsZXRlKSk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoQXJyYXkoaSkuam9pbihvcHRpb25zLmluY29tcGxldGUpKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb2xvcigncHJvZ3Jlc3MnLCBvcHRpb25zLmNsb3NlKSk7XG4gICAgaWYgKG9wdGlvbnMudmVyYm9zZSkge1xuICAgICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29sb3IoJ3Byb2dyZXNzJywgJyAnICsgY29tcGxldGUgKyAnIG9mICcgKyB0b3RhbCkpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gdGVzdHMgYXJlIGNvbXBsZXRlLCBvdXRwdXQgc29tZSBzdGF0c1xuICAvLyBhbmQgdGhlIGZhaWx1cmVzIGlmIGFueVxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgY3Vyc29yLnNob3coKTtcbiAgICBjb25zb2xlLmxvZygpO1xuICAgIHNlbGYuZXBpbG9ndWUoKTtcbiAgfSk7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBCYXNlLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEJhc2UucHJvdG90eXBlO1xuUHJvZ3Jlc3MucHJvdG90eXBlID0gbmV3IEY7XG5Qcm9ncmVzcy5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBQcm9ncmVzcztcblxuXG59KTsgLy8gbW9kdWxlOiByZXBvcnRlcnMvcHJvZ3Jlc3MuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9zcGVjLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY3Vyc29yID0gQmFzZS5jdXJzb3JcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBTcGVjYC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBTcGVjO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFNwZWNgIHRlc3QgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBTcGVjKHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgaW5kZW50cyA9IDBcbiAgICAsIG4gPSAwO1xuXG4gIGZ1bmN0aW9uIGluZGVudCgpIHtcbiAgICByZXR1cm4gQXJyYXkoaW5kZW50cykuam9pbignICAnKVxuICB9XG5cbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2coKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZScsIGZ1bmN0aW9uKHN1aXRlKXtcbiAgICArK2luZGVudHM7XG4gICAgY29uc29sZS5sb2coY29sb3IoJ3N1aXRlJywgJyVzJXMnKSwgaW5kZW50KCksIHN1aXRlLnRpdGxlKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZSBlbmQnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgLS1pbmRlbnRzO1xuICAgIGlmICgxID09IGluZGVudHMpIGNvbnNvbGUubG9nKCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGVuZGluZycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHZhciBmbXQgPSBpbmRlbnQoKSArIGNvbG9yKCdwZW5kaW5nJywgJyAgLSAlcycpO1xuICAgIGNvbnNvbGUubG9nKGZtdCwgdGVzdC50aXRsZSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGlmICgnZmFzdCcgPT0gdGVzdC5zcGVlZCkge1xuICAgICAgdmFyIGZtdCA9IGluZGVudCgpXG4gICAgICAgICsgY29sb3IoJ2NoZWNrbWFyaycsICcgICcgKyBCYXNlLnN5bWJvbHMub2spXG4gICAgICAgICsgY29sb3IoJ3Bhc3MnLCAnICVzICcpO1xuICAgICAgY3Vyc29yLkNSKCk7XG4gICAgICBjb25zb2xlLmxvZyhmbXQsIHRlc3QudGl0bGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZm10ID0gaW5kZW50KClcbiAgICAgICAgKyBjb2xvcignY2hlY2ttYXJrJywgJyAgJyArIEJhc2Uuc3ltYm9scy5vaylcbiAgICAgICAgKyBjb2xvcigncGFzcycsICcgJXMgJylcbiAgICAgICAgKyBjb2xvcih0ZXN0LnNwZWVkLCAnKCVkbXMpJyk7XG4gICAgICBjdXJzb3IuQ1IoKTtcbiAgICAgIGNvbnNvbGUubG9nKGZtdCwgdGVzdC50aXRsZSwgdGVzdC5kdXJhdGlvbik7XG4gICAgfVxuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGN1cnNvci5DUigpO1xuICAgIGNvbnNvbGUubG9nKGluZGVudCgpICsgY29sb3IoJ2ZhaWwnLCAnICAlZCkgJXMnKSwgKytuLCB0ZXN0LnRpdGxlKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBzZWxmLmVwaWxvZ3VlLmJpbmQoc2VsZikpO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcblNwZWMucHJvdG90eXBlID0gbmV3IEY7XG5TcGVjLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFNwZWM7XG5cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL3NwZWMuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy90YXAuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCBjdXJzb3IgPSBCYXNlLmN1cnNvclxuICAsIGNvbG9yID0gQmFzZS5jb2xvcjtcblxuLyoqXG4gKiBFeHBvc2UgYFRBUGAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gVEFQO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFRBUGAgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBUQVAocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCBuID0gMVxuICAgICwgcGFzc2VzID0gMFxuICAgICwgZmFpbHVyZXMgPSAwO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIHZhciB0b3RhbCA9IHJ1bm5lci5ncmVwVG90YWwocnVubmVyLnN1aXRlKTtcbiAgICBjb25zb2xlLmxvZygnJWQuLiVkJywgMSwgdG90YWwpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24oKXtcbiAgICArK247XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGVuZGluZycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGNvbnNvbGUubG9nKCdvayAlZCAlcyAjIFNLSVAgLScsIG4sIHRpdGxlKHRlc3QpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgcGFzc2VzKys7XG4gICAgY29uc29sZS5sb2coJ29rICVkICVzJywgbiwgdGl0bGUodGVzdCkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGZhaWx1cmVzKys7XG4gICAgY29uc29sZS5sb2coJ25vdCBvayAlZCAlcycsIG4sIHRpdGxlKHRlc3QpKTtcbiAgICBpZiAoZXJyLnN0YWNrKSBjb25zb2xlLmxvZyhlcnIuc3RhY2sucmVwbGFjZSgvXi9nbSwgJyAgJykpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2coJyMgdGVzdHMgJyArIChwYXNzZXMgKyBmYWlsdXJlcykpO1xuICAgIGNvbnNvbGUubG9nKCcjIHBhc3MgJyArIHBhc3Nlcyk7XG4gICAgY29uc29sZS5sb2coJyMgZmFpbCAnICsgZmFpbHVyZXMpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBUQVAtc2FmZSB0aXRsZSBvZiBgdGVzdGBcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gdGVzdFxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gdGl0bGUodGVzdCkge1xuICByZXR1cm4gdGVzdC5mdWxsVGl0bGUoKS5yZXBsYWNlKC8jL2csICcnKTtcbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL3RhcC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL3h1bml0LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpXG4gICwgZXNjYXBlID0gdXRpbHMuZXNjYXBlO1xuXG4vKipcbiAqIFNhdmUgdGltZXIgcmVmZXJlbmNlcyB0byBhdm9pZCBTaW5vbiBpbnRlcmZlcmluZyAoc2VlIEdILTIzNykuXG4gKi9cblxudmFyIERhdGUgPSBnbG9iYWwuRGF0ZVxuICAsIHNldFRpbWVvdXQgPSBnbG9iYWwuc2V0VGltZW91dFxuICAsIHNldEludGVydmFsID0gZ2xvYmFsLnNldEludGVydmFsXG4gICwgY2xlYXJUaW1lb3V0ID0gZ2xvYmFsLmNsZWFyVGltZW91dFxuICAsIGNsZWFySW50ZXJ2YWwgPSBnbG9iYWwuY2xlYXJJbnRlcnZhbDtcblxuLyoqXG4gKiBFeHBvc2UgYFhVbml0YC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBYVW5pdDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBYVW5pdGAgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBYVW5pdChydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG4gIHZhciBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIHRlc3RzID0gW11cbiAgICAsIHNlbGYgPSB0aGlzO1xuXG4gIHJ1bm5lci5vbigncGVuZGluZycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHRlc3RzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHRlc3RzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHRlc3RzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICBjb25zb2xlLmxvZyh0YWcoJ3Rlc3RzdWl0ZScsIHtcbiAgICAgICAgbmFtZTogJ01vY2hhIFRlc3RzJ1xuICAgICAgLCB0ZXN0czogc3RhdHMudGVzdHNcbiAgICAgICwgZmFpbHVyZXM6IHN0YXRzLmZhaWx1cmVzXG4gICAgICAsIGVycm9yczogc3RhdHMuZmFpbHVyZXNcbiAgICAgICwgc2tpcHBlZDogc3RhdHMudGVzdHMgLSBzdGF0cy5mYWlsdXJlcyAtIHN0YXRzLnBhc3Nlc1xuICAgICAgLCB0aW1lc3RhbXA6IChuZXcgRGF0ZSkudG9VVENTdHJpbmcoKVxuICAgICAgLCB0aW1lOiAoc3RhdHMuZHVyYXRpb24gLyAxMDAwKSB8fCAwXG4gICAgfSwgZmFsc2UpKTtcblxuICAgIHRlc3RzLmZvckVhY2godGVzdCk7XG4gICAgY29uc29sZS5sb2coJzwvdGVzdHN1aXRlPicpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEJhc2UucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gQmFzZS5wcm90b3R5cGU7XG5YVW5pdC5wcm90b3R5cGUgPSBuZXcgRjtcblhVbml0LnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFhVbml0O1xuXG5cbi8qKlxuICogT3V0cHV0IHRhZyBmb3IgdGhlIGdpdmVuIGB0ZXN0LmBcbiAqL1xuXG5mdW5jdGlvbiB0ZXN0KHRlc3QpIHtcbiAgdmFyIGF0dHJzID0ge1xuICAgICAgY2xhc3NuYW1lOiB0ZXN0LnBhcmVudC5mdWxsVGl0bGUoKVxuICAgICwgbmFtZTogdGVzdC50aXRsZVxuICAgICwgdGltZTogKHRlc3QuZHVyYXRpb24gLyAxMDAwKSB8fCAwXG4gIH07XG5cbiAgaWYgKCdmYWlsZWQnID09IHRlc3Quc3RhdGUpIHtcbiAgICB2YXIgZXJyID0gdGVzdC5lcnI7XG4gICAgY29uc29sZS5sb2codGFnKCd0ZXN0Y2FzZScsIGF0dHJzLCBmYWxzZSwgdGFnKCdmYWlsdXJlJywge30sIGZhbHNlLCBjZGF0YShlc2NhcGUoZXJyLm1lc3NhZ2UpICsgXCJcXG5cIiArIGVyci5zdGFjaykpKSk7XG4gIH0gZWxzZSBpZiAodGVzdC5wZW5kaW5nKSB7XG4gICAgY29uc29sZS5sb2codGFnKCd0ZXN0Y2FzZScsIGF0dHJzLCBmYWxzZSwgdGFnKCdza2lwcGVkJywge30sIHRydWUpKSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2codGFnKCd0ZXN0Y2FzZScsIGF0dHJzLCB0cnVlKSApO1xuICB9XG59XG5cbi8qKlxuICogSFRNTCB0YWcgaGVscGVyLlxuICovXG5cbmZ1bmN0aW9uIHRhZyhuYW1lLCBhdHRycywgY2xvc2UsIGNvbnRlbnQpIHtcbiAgdmFyIGVuZCA9IGNsb3NlID8gJy8+JyA6ICc+J1xuICAgICwgcGFpcnMgPSBbXVxuICAgICwgdGFnO1xuXG4gIGZvciAodmFyIGtleSBpbiBhdHRycykge1xuICAgIHBhaXJzLnB1c2goa2V5ICsgJz1cIicgKyBlc2NhcGUoYXR0cnNba2V5XSkgKyAnXCInKTtcbiAgfVxuXG4gIHRhZyA9ICc8JyArIG5hbWUgKyAocGFpcnMubGVuZ3RoID8gJyAnICsgcGFpcnMuam9pbignICcpIDogJycpICsgZW5kO1xuICBpZiAoY29udGVudCkgdGFnICs9IGNvbnRlbnQgKyAnPC8nICsgbmFtZSArIGVuZDtcbiAgcmV0dXJuIHRhZztcbn1cblxuLyoqXG4gKiBSZXR1cm4gY2RhdGEgZXNjYXBlZCBDREFUQSBgc3RyYC5cbiAqL1xuXG5mdW5jdGlvbiBjZGF0YShzdHIpIHtcbiAgcmV0dXJuICc8IVtDREFUQVsnICsgZXNjYXBlKHN0cikgKyAnXV0+Jztcbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL3h1bml0LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJydW5uYWJsZS5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2Jyb3dzZXIvZXZlbnRzJykuRXZlbnRFbWl0dGVyXG4gICwgZGVidWcgPSByZXF1aXJlKCdicm93c2VyL2RlYnVnJykoJ21vY2hhOnJ1bm5hYmxlJylcbiAgLCBtaWxsaXNlY29uZHMgPSByZXF1aXJlKCcuL21zJyk7XG5cbi8qKlxuICogU2F2ZSB0aW1lciByZWZlcmVuY2VzIHRvIGF2b2lkIFNpbm9uIGludGVyZmVyaW5nIChzZWUgR0gtMjM3KS5cbiAqL1xuXG52YXIgRGF0ZSA9IGdsb2JhbC5EYXRlXG4gICwgc2V0VGltZW91dCA9IGdsb2JhbC5zZXRUaW1lb3V0XG4gICwgc2V0SW50ZXJ2YWwgPSBnbG9iYWwuc2V0SW50ZXJ2YWxcbiAgLCBjbGVhclRpbWVvdXQgPSBnbG9iYWwuY2xlYXJUaW1lb3V0XG4gICwgY2xlYXJJbnRlcnZhbCA9IGdsb2JhbC5jbGVhckludGVydmFsO1xuXG4vKipcbiAqIE9iamVjdCN0b1N0cmluZygpLlxuICovXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKlxuICogRXhwb3NlIGBSdW5uYWJsZWAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBSdW5uYWJsZTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBSdW5uYWJsZWAgd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYCBhbmQgY2FsbGJhY2sgYGZuYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdGl0bGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBSdW5uYWJsZSh0aXRsZSwgZm4pIHtcbiAgdGhpcy50aXRsZSA9IHRpdGxlO1xuICB0aGlzLmZuID0gZm47XG4gIHRoaXMuYXN5bmMgPSBmbiAmJiBmbi5sZW5ndGg7XG4gIHRoaXMuc3luYyA9ICEgdGhpcy5hc3luYztcbiAgdGhpcy5fdGltZW91dCA9IDIwMDA7XG4gIHRoaXMuX3Nsb3cgPSA3NTtcbiAgdGhpcy5fZW5hYmxlVGltZW91dHMgPSB0cnVlO1xuICB0aGlzLnRpbWVkT3V0ID0gZmFsc2U7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBFdmVudEVtaXR0ZXIucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZTtcblJ1bm5hYmxlLnByb3RvdHlwZSA9IG5ldyBGO1xuUnVubmFibGUucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gUnVubmFibGU7XG5cblxuLyoqXG4gKiBTZXQgJiBnZXQgdGltZW91dCBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfFN0cmluZ30gbXNcbiAqIEByZXR1cm4ge1J1bm5hYmxlfE51bWJlcn0gbXMgb3Igc2VsZlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmFibGUucHJvdG90eXBlLnRpbWVvdXQgPSBmdW5jdGlvbihtcyl7XG4gIGlmICgwID09IGFyZ3VtZW50cy5sZW5ndGgpIHJldHVybiB0aGlzLl90aW1lb3V0O1xuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIG1zKSBtcyA9IG1pbGxpc2Vjb25kcyhtcyk7XG4gIGRlYnVnKCd0aW1lb3V0ICVkJywgbXMpO1xuICB0aGlzLl90aW1lb3V0ID0gbXM7XG4gIGlmICh0aGlzLnRpbWVyKSB0aGlzLnJlc2V0VGltZW91dCgpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0ICYgZ2V0IHNsb3cgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcnxTdHJpbmd9IG1zXG4gKiBAcmV0dXJuIHtSdW5uYWJsZXxOdW1iZXJ9IG1zIG9yIHNlbGZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5hYmxlLnByb3RvdHlwZS5zbG93ID0gZnVuY3Rpb24obXMpe1xuICBpZiAoMCA9PT0gYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX3Nsb3c7XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgbXMpIG1zID0gbWlsbGlzZWNvbmRzKG1zKTtcbiAgZGVidWcoJ3RpbWVvdXQgJWQnLCBtcyk7XG4gIHRoaXMuX3Nsb3cgPSBtcztcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCBhbmQgJiBnZXQgdGltZW91dCBgZW5hYmxlZGAuXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVkXG4gKiBAcmV0dXJuIHtSdW5uYWJsZXxCb29sZWFufSBlbmFibGVkIG9yIHNlbGZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5hYmxlLnByb3RvdHlwZS5lbmFibGVUaW1lb3V0cyA9IGZ1bmN0aW9uKGVuYWJsZWQpe1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHRoaXMuX2VuYWJsZVRpbWVvdXRzO1xuICBkZWJ1ZygnZW5hYmxlVGltZW91dHMgJXMnLCBlbmFibGVkKTtcbiAgdGhpcy5fZW5hYmxlVGltZW91dHMgPSBlbmFibGVkO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmV0dXJuIHRoZSBmdWxsIHRpdGxlIGdlbmVyYXRlZCBieSByZWN1cnNpdmVseVxuICogY29uY2F0ZW5hdGluZyB0aGUgcGFyZW50J3MgZnVsbCB0aXRsZS5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJ1bm5hYmxlLnByb3RvdHlwZS5mdWxsVGl0bGUgPSBmdW5jdGlvbigpe1xuICByZXR1cm4gdGhpcy5wYXJlbnQuZnVsbFRpdGxlKCkgKyAnICcgKyB0aGlzLnRpdGxlO1xufTtcblxuLyoqXG4gKiBDbGVhciB0aGUgdGltZW91dC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uYWJsZS5wcm90b3R5cGUuY2xlYXJUaW1lb3V0ID0gZnVuY3Rpb24oKXtcbiAgY2xlYXJUaW1lb3V0KHRoaXMudGltZXIpO1xufTtcblxuLyoqXG4gKiBJbnNwZWN0IHRoZSBydW5uYWJsZSB2b2lkIG9mIHByaXZhdGUgcHJvcGVydGllcy5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uYWJsZS5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uKCl7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeSh0aGlzLCBmdW5jdGlvbihrZXksIHZhbCl7XG4gICAgaWYgKCdfJyA9PSBrZXlbMF0pIHJldHVybjtcbiAgICBpZiAoJ3BhcmVudCcgPT0ga2V5KSByZXR1cm4gJyM8U3VpdGU+JztcbiAgICBpZiAoJ2N0eCcgPT0ga2V5KSByZXR1cm4gJyM8Q29udGV4dD4nO1xuICAgIHJldHVybiB2YWw7XG4gIH0sIDIpO1xufTtcblxuLyoqXG4gKiBSZXNldCB0aGUgdGltZW91dC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uYWJsZS5wcm90b3R5cGUucmVzZXRUaW1lb3V0ID0gZnVuY3Rpb24oKXtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB2YXIgbXMgPSB0aGlzLnRpbWVvdXQoKSB8fCAxZTk7XG5cbiAgaWYgKCF0aGlzLl9lbmFibGVUaW1lb3V0cykgcmV0dXJuO1xuICB0aGlzLmNsZWFyVGltZW91dCgpO1xuICB0aGlzLnRpbWVyID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgIHNlbGYuY2FsbGJhY2sobmV3IEVycm9yKCd0aW1lb3V0IG9mICcgKyBtcyArICdtcyBleGNlZWRlZCcpKTtcbiAgICBzZWxmLnRpbWVkT3V0ID0gdHJ1ZTtcbiAgfSwgbXMpO1xufTtcblxuLyoqXG4gKiBXaGl0ZWxpc3QgdGhlc2UgZ2xvYmFscyBmb3IgdGhpcyB0ZXN0IHJ1blxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5SdW5uYWJsZS5wcm90b3R5cGUuZ2xvYmFscyA9IGZ1bmN0aW9uKGFycil7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdGhpcy5fYWxsb3dlZEdsb2JhbHMgPSBhcnI7XG59O1xuXG4vKipcbiAqIFJ1biB0aGUgdGVzdCBhbmQgaW52b2tlIGBmbihlcnIpYC5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmFibGUucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uKGZuKXtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGFydCA9IG5ldyBEYXRlXG4gICAgLCBjdHggPSB0aGlzLmN0eFxuICAgICwgZmluaXNoZWRcbiAgICAsIGVtaXR0ZWQ7XG5cbiAgLy8gU29tZSB0aW1lcyB0aGUgY3R4IGV4aXN0cyBidXQgaXQgaXMgbm90IHJ1bm5hYmxlXG4gIGlmIChjdHggJiYgY3R4LnJ1bm5hYmxlKSBjdHgucnVubmFibGUodGhpcyk7XG5cbiAgLy8gY2FsbGVkIG11bHRpcGxlIHRpbWVzXG4gIGZ1bmN0aW9uIG11bHRpcGxlKGVycikge1xuICAgIGlmIChlbWl0dGVkKSByZXR1cm47XG4gICAgZW1pdHRlZCA9IHRydWU7XG4gICAgc2VsZi5lbWl0KCdlcnJvcicsIGVyciB8fCBuZXcgRXJyb3IoJ2RvbmUoKSBjYWxsZWQgbXVsdGlwbGUgdGltZXMnKSk7XG4gIH1cblxuICAvLyBmaW5pc2hlZFxuICBmdW5jdGlvbiBkb25lKGVycikge1xuICAgIHZhciBtcyA9IHNlbGYudGltZW91dCgpO1xuICAgIGlmIChzZWxmLnRpbWVkT3V0KSByZXR1cm47XG4gICAgaWYgKGZpbmlzaGVkKSByZXR1cm4gbXVsdGlwbGUoZXJyKTtcbiAgICBzZWxmLmNsZWFyVGltZW91dCgpO1xuICAgIHNlbGYuZHVyYXRpb24gPSBuZXcgRGF0ZSAtIHN0YXJ0O1xuICAgIGZpbmlzaGVkID0gdHJ1ZTtcbiAgICBpZiAoIWVyciAmJiBzZWxmLmR1cmF0aW9uID4gbXMgJiYgc2VsZi5fZW5hYmxlVGltZW91dHMpIGVyciA9IG5ldyBFcnJvcigndGltZW91dCBvZiAnICsgbXMgKyAnbXMgZXhjZWVkZWQnKTtcbiAgICBmbihlcnIpO1xuICB9XG5cbiAgLy8gZm9yIC5yZXNldFRpbWVvdXQoKVxuICB0aGlzLmNhbGxiYWNrID0gZG9uZTtcblxuICAvLyBleHBsaWNpdCBhc3luYyB3aXRoIGBkb25lYCBhcmd1bWVudFxuICBpZiAodGhpcy5hc3luYykge1xuICAgIHRoaXMucmVzZXRUaW1lb3V0KCk7XG5cbiAgICB0cnkge1xuICAgICAgdGhpcy5mbi5jYWxsKGN0eCwgZnVuY3Rpb24oZXJyKXtcbiAgICAgICAgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yIHx8IHRvU3RyaW5nLmNhbGwoZXJyKSA9PT0gXCJbb2JqZWN0IEVycm9yXVwiKSByZXR1cm4gZG9uZShlcnIpO1xuICAgICAgICBpZiAobnVsbCAhPSBlcnIpIHtcbiAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGVycikgPT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICAgICAgICByZXR1cm4gZG9uZShuZXcgRXJyb3IoJ2RvbmUoKSBpbnZva2VkIHdpdGggbm9uLUVycm9yOiAnICsgSlNPTi5zdHJpbmdpZnkoZXJyKSkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZG9uZShuZXcgRXJyb3IoJ2RvbmUoKSBpbnZva2VkIHdpdGggbm9uLUVycm9yOiAnICsgZXJyKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGRvbmUoKTtcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgZG9uZShlcnIpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5hc3luY09ubHkpIHtcbiAgICByZXR1cm4gZG9uZShuZXcgRXJyb3IoJy0tYXN5bmMtb25seSBvcHRpb24gaW4gdXNlIHdpdGhvdXQgZGVjbGFyaW5nIGBkb25lKClgJykpO1xuICB9XG5cbiAgLy8gc3luYyBvciBwcm9taXNlLXJldHVybmluZ1xuICB0cnkge1xuICAgIGlmICh0aGlzLnBlbmRpbmcpIHtcbiAgICAgIGRvbmUoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY2FsbEZuKHRoaXMuZm4pO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgZG9uZShlcnIpO1xuICB9XG5cbiAgZnVuY3Rpb24gY2FsbEZuKGZuKSB7XG4gICAgdmFyIHJlc3VsdCA9IGZuLmNhbGwoY3R4KTtcbiAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgc2VsZi5yZXNldFRpbWVvdXQoKTtcbiAgICAgIHJlc3VsdFxuICAgICAgICAudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICBkb25lKClcbiAgICAgICAgfSxcbiAgICAgICAgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgICAgZG9uZShyZWFzb24gfHwgbmV3IEVycm9yKCdQcm9taXNlIHJlamVjdGVkIHdpdGggbm8gb3IgZmFsc3kgcmVhc29uJykpXG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBkb25lKCk7XG4gICAgfVxuICB9XG59O1xuXG59KTsgLy8gbW9kdWxlOiBydW5uYWJsZS5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicnVubmVyLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2Jyb3dzZXIvZXZlbnRzJykuRXZlbnRFbWl0dGVyXG4gICwgZGVidWcgPSByZXF1aXJlKCdicm93c2VyL2RlYnVnJykoJ21vY2hhOnJ1bm5lcicpXG4gICwgVGVzdCA9IHJlcXVpcmUoJy4vdGVzdCcpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcbiAgLCBmaWx0ZXIgPSB1dGlscy5maWx0ZXJcbiAgLCBrZXlzID0gdXRpbHMua2V5cztcblxuLyoqXG4gKiBOb24tZW51bWVyYWJsZSBnbG9iYWxzLlxuICovXG5cbnZhciBnbG9iYWxzID0gW1xuICAnc2V0VGltZW91dCcsXG4gICdjbGVhclRpbWVvdXQnLFxuICAnc2V0SW50ZXJ2YWwnLFxuICAnY2xlYXJJbnRlcnZhbCcsXG4gICdYTUxIdHRwUmVxdWVzdCcsXG4gICdEYXRlJ1xuXTtcblxuLyoqXG4gKiBFeHBvc2UgYFJ1bm5lcmAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBSdW5uZXI7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIGBSdW5uZXJgIGZvciB0aGUgZ2l2ZW4gYHN1aXRlYC5cbiAqXG4gKiBFdmVudHM6XG4gKlxuICogICAtIGBzdGFydGAgIGV4ZWN1dGlvbiBzdGFydGVkXG4gKiAgIC0gYGVuZGAgIGV4ZWN1dGlvbiBjb21wbGV0ZVxuICogICAtIGBzdWl0ZWAgIChzdWl0ZSkgdGVzdCBzdWl0ZSBleGVjdXRpb24gc3RhcnRlZFxuICogICAtIGBzdWl0ZSBlbmRgICAoc3VpdGUpIGFsbCB0ZXN0cyAoYW5kIHN1Yi1zdWl0ZXMpIGhhdmUgZmluaXNoZWRcbiAqICAgLSBgdGVzdGAgICh0ZXN0KSB0ZXN0IGV4ZWN1dGlvbiBzdGFydGVkXG4gKiAgIC0gYHRlc3QgZW5kYCAgKHRlc3QpIHRlc3QgY29tcGxldGVkXG4gKiAgIC0gYGhvb2tgICAoaG9vaykgaG9vayBleGVjdXRpb24gc3RhcnRlZFxuICogICAtIGBob29rIGVuZGAgIChob29rKSBob29rIGNvbXBsZXRlXG4gKiAgIC0gYHBhc3NgICAodGVzdCkgdGVzdCBwYXNzZWRcbiAqICAgLSBgZmFpbGAgICh0ZXN0LCBlcnIpIHRlc3QgZmFpbGVkXG4gKiAgIC0gYHBlbmRpbmdgICAodGVzdCkgdGVzdCBwZW5kaW5nXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBSdW5uZXIoc3VpdGUpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB0aGlzLl9nbG9iYWxzID0gW107XG4gIHRoaXMuX2Fib3J0ID0gZmFsc2U7XG4gIHRoaXMuc3VpdGUgPSBzdWl0ZTtcbiAgdGhpcy50b3RhbCA9IHN1aXRlLnRvdGFsKCk7XG4gIHRoaXMuZmFpbHVyZXMgPSAwO1xuICB0aGlzLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3QpeyBzZWxmLmNoZWNrR2xvYmFscyh0ZXN0KTsgfSk7XG4gIHRoaXMub24oJ2hvb2sgZW5kJywgZnVuY3Rpb24oaG9vayl7IHNlbGYuY2hlY2tHbG9iYWxzKGhvb2spOyB9KTtcbiAgdGhpcy5ncmVwKC8uKi8pO1xuICB0aGlzLmdsb2JhbHModGhpcy5nbG9iYWxQcm9wcygpLmNvbmNhdChleHRyYUdsb2JhbHMoKSkpO1xufVxuXG4vKipcbiAqIFdyYXBwZXIgZm9yIHNldEltbWVkaWF0ZSwgcHJvY2Vzcy5uZXh0VGljaywgb3IgYnJvd3NlciBwb2x5ZmlsbC5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLmltbWVkaWF0ZWx5ID0gZ2xvYmFsLnNldEltbWVkaWF0ZSB8fCBwcm9jZXNzLm5leHRUaWNrO1xuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgRXZlbnRFbWl0dGVyLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGU7XG5SdW5uZXIucHJvdG90eXBlID0gbmV3IEY7XG5SdW5uZXIucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gUnVubmVyO1xuXG5cbi8qKlxuICogUnVuIHRlc3RzIHdpdGggZnVsbCB0aXRsZXMgbWF0Y2hpbmcgYHJlYC4gVXBkYXRlcyBydW5uZXIudG90YWxcbiAqIHdpdGggbnVtYmVyIG9mIHRlc3RzIG1hdGNoZWQuXG4gKlxuICogQHBhcmFtIHtSZWdFeHB9IHJlXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGludmVydFxuICogQHJldHVybiB7UnVubmVyfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ncmVwID0gZnVuY3Rpb24ocmUsIGludmVydCl7XG4gIGRlYnVnKCdncmVwICVzJywgcmUpO1xuICB0aGlzLl9ncmVwID0gcmU7XG4gIHRoaXMuX2ludmVydCA9IGludmVydDtcbiAgdGhpcy50b3RhbCA9IHRoaXMuZ3JlcFRvdGFsKHRoaXMuc3VpdGUpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIHRlc3RzIG1hdGNoaW5nIHRoZSBncmVwIHNlYXJjaCBmb3IgdGhlXG4gKiBnaXZlbiBzdWl0ZS5cbiAqXG4gKiBAcGFyYW0ge1N1aXRlfSBzdWl0ZVxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLmdyZXBUb3RhbCA9IGZ1bmN0aW9uKHN1aXRlKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIHRvdGFsID0gMDtcblxuICBzdWl0ZS5lYWNoVGVzdChmdW5jdGlvbih0ZXN0KXtcbiAgICB2YXIgbWF0Y2ggPSBzZWxmLl9ncmVwLnRlc3QodGVzdC5mdWxsVGl0bGUoKSk7XG4gICAgaWYgKHNlbGYuX2ludmVydCkgbWF0Y2ggPSAhbWF0Y2g7XG4gICAgaWYgKG1hdGNoKSB0b3RhbCsrO1xuICB9KTtcblxuICByZXR1cm4gdG90YWw7XG59O1xuXG4vKipcbiAqIFJldHVybiBhIGxpc3Qgb2YgZ2xvYmFsIHByb3BlcnRpZXMuXG4gKlxuICogQHJldHVybiB7QXJyYXl9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLmdsb2JhbFByb3BzID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwcm9wcyA9IHV0aWxzLmtleXMoZ2xvYmFsKTtcblxuICAvLyBub24tZW51bWVyYWJsZXNcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBnbG9iYWxzLmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKH51dGlscy5pbmRleE9mKHByb3BzLCBnbG9iYWxzW2ldKSkgY29udGludWU7XG4gICAgcHJvcHMucHVzaChnbG9iYWxzW2ldKTtcbiAgfVxuXG4gIHJldHVybiBwcm9wcztcbn07XG5cbi8qKlxuICogQWxsb3cgdGhlIGdpdmVuIGBhcnJgIG9mIGdsb2JhbHMuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJyXG4gKiBAcmV0dXJuIHtSdW5uZXJ9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLmdsb2JhbHMgPSBmdW5jdGlvbihhcnIpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fZ2xvYmFscztcbiAgZGVidWcoJ2dsb2JhbHMgJWonLCBhcnIpO1xuICB0aGlzLl9nbG9iYWxzID0gdGhpcy5fZ2xvYmFscy5jb25jYXQoYXJyKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIENoZWNrIGZvciBnbG9iYWwgdmFyaWFibGUgbGVha3MuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5jaGVja0dsb2JhbHMgPSBmdW5jdGlvbih0ZXN0KXtcbiAgaWYgKHRoaXMuaWdub3JlTGVha3MpIHJldHVybjtcbiAgdmFyIG9rID0gdGhpcy5fZ2xvYmFscztcblxuICB2YXIgZ2xvYmFscyA9IHRoaXMuZ2xvYmFsUHJvcHMoKTtcbiAgdmFyIGxlYWtzO1xuXG4gIGlmICh0ZXN0KSB7XG4gICAgb2sgPSBvay5jb25jYXQodGVzdC5fYWxsb3dlZEdsb2JhbHMgfHwgW10pO1xuICB9XG5cbiAgaWYodGhpcy5wcmV2R2xvYmFsc0xlbmd0aCA9PSBnbG9iYWxzLmxlbmd0aCkgcmV0dXJuO1xuICB0aGlzLnByZXZHbG9iYWxzTGVuZ3RoID0gZ2xvYmFscy5sZW5ndGg7XG5cbiAgbGVha3MgPSBmaWx0ZXJMZWFrcyhvaywgZ2xvYmFscyk7XG4gIHRoaXMuX2dsb2JhbHMgPSB0aGlzLl9nbG9iYWxzLmNvbmNhdChsZWFrcyk7XG5cbiAgaWYgKGxlYWtzLmxlbmd0aCA+IDEpIHtcbiAgICB0aGlzLmZhaWwodGVzdCwgbmV3IEVycm9yKCdnbG9iYWwgbGVha3MgZGV0ZWN0ZWQ6ICcgKyBsZWFrcy5qb2luKCcsICcpICsgJycpKTtcbiAgfSBlbHNlIGlmIChsZWFrcy5sZW5ndGgpIHtcbiAgICB0aGlzLmZhaWwodGVzdCwgbmV3IEVycm9yKCdnbG9iYWwgbGVhayBkZXRlY3RlZDogJyArIGxlYWtzWzBdKSk7XG4gIH1cbn07XG5cbi8qKlxuICogRmFpbCB0aGUgZ2l2ZW4gYHRlc3RgLlxuICpcbiAqIEBwYXJhbSB7VGVzdH0gdGVzdFxuICogQHBhcmFtIHtFcnJvcn0gZXJyXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLmZhaWwgPSBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICArK3RoaXMuZmFpbHVyZXM7XG4gIHRlc3Quc3RhdGUgPSAnZmFpbGVkJztcblxuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIGVycikge1xuICAgIGVyciA9IG5ldyBFcnJvcigndGhlIHN0cmluZyBcIicgKyBlcnIgKyAnXCIgd2FzIHRocm93biwgdGhyb3cgYW4gRXJyb3IgOiknKTtcbiAgfVxuXG4gIHRoaXMuZW1pdCgnZmFpbCcsIHRlc3QsIGVycik7XG59O1xuXG4vKipcbiAqIEZhaWwgdGhlIGdpdmVuIGBob29rYCB3aXRoIGBlcnJgLlxuICpcbiAqIEhvb2sgZmFpbHVyZXMgd29yayBpbiB0aGUgZm9sbG93aW5nIHBhdHRlcm46XG4gKiAtIElmIGJhaWwsIHRoZW4gZXhpdFxuICogLSBGYWlsZWQgYGJlZm9yZWAgaG9vayBza2lwcyBhbGwgdGVzdHMgaW4gYSBzdWl0ZSBhbmQgc3Vic3VpdGVzLFxuICogICBidXQganVtcHMgdG8gY29ycmVzcG9uZGluZyBgYWZ0ZXJgIGhvb2tcbiAqIC0gRmFpbGVkIGBiZWZvcmUgZWFjaGAgaG9vayBza2lwcyByZW1haW5pbmcgdGVzdHMgaW4gYVxuICogICBzdWl0ZSBhbmQganVtcHMgdG8gY29ycmVzcG9uZGluZyBgYWZ0ZXIgZWFjaGAgaG9vayxcbiAqICAgd2hpY2ggaXMgcnVuIG9ubHkgb25jZVxuICogLSBGYWlsZWQgYGFmdGVyYCBob29rIGRvZXMgbm90IGFsdGVyXG4gKiAgIGV4ZWN1dGlvbiBvcmRlclxuICogLSBGYWlsZWQgYGFmdGVyIGVhY2hgIGhvb2sgc2tpcHMgcmVtYWluaW5nIHRlc3RzIGluIGFcbiAqICAgc3VpdGUgYW5kIHN1YnN1aXRlcywgYnV0IGV4ZWN1dGVzIG90aGVyIGBhZnRlciBlYWNoYFxuICogICBob29rc1xuICpcbiAqIEBwYXJhbSB7SG9va30gaG9va1xuICogQHBhcmFtIHtFcnJvcn0gZXJyXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLmZhaWxIb29rID0gZnVuY3Rpb24oaG9vaywgZXJyKXtcbiAgdGhpcy5mYWlsKGhvb2ssIGVycik7XG4gIGlmICh0aGlzLnN1aXRlLmJhaWwoKSkge1xuICAgIHRoaXMuZW1pdCgnZW5kJyk7XG4gIH1cbn07XG5cbi8qKlxuICogUnVuIGhvb2sgYG5hbWVgIGNhbGxiYWNrcyBhbmQgdGhlbiBpbnZva2UgYGZuKClgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jdGlvblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ob29rID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICB2YXIgc3VpdGUgPSB0aGlzLnN1aXRlXG4gICAgLCBob29rcyA9IHN1aXRlWydfJyArIG5hbWVdXG4gICAgLCBzZWxmID0gdGhpc1xuICAgICwgdGltZXI7XG5cbiAgZnVuY3Rpb24gbmV4dChpKSB7XG4gICAgdmFyIGhvb2sgPSBob29rc1tpXTtcbiAgICBpZiAoIWhvb2spIHJldHVybiBmbigpO1xuICAgIGlmIChzZWxmLmZhaWx1cmVzICYmIHN1aXRlLmJhaWwoKSkgcmV0dXJuIGZuKCk7XG4gICAgc2VsZi5jdXJyZW50UnVubmFibGUgPSBob29rO1xuXG4gICAgaG9vay5jdHguY3VycmVudFRlc3QgPSBzZWxmLnRlc3Q7XG5cbiAgICBzZWxmLmVtaXQoJ2hvb2snLCBob29rKTtcblxuICAgIGhvb2sub24oJ2Vycm9yJywgZnVuY3Rpb24oZXJyKXtcbiAgICAgIHNlbGYuZmFpbEhvb2soaG9vaywgZXJyKTtcbiAgICB9KTtcblxuICAgIGhvb2sucnVuKGZ1bmN0aW9uKGVycil7XG4gICAgICBob29rLnJlbW92ZUFsbExpc3RlbmVycygnZXJyb3InKTtcbiAgICAgIHZhciB0ZXN0RXJyb3IgPSBob29rLmVycm9yKCk7XG4gICAgICBpZiAodGVzdEVycm9yKSBzZWxmLmZhaWwoc2VsZi50ZXN0LCB0ZXN0RXJyb3IpO1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBzZWxmLmZhaWxIb29rKGhvb2ssIGVycik7XG5cbiAgICAgICAgLy8gc3RvcCBleGVjdXRpbmcgaG9va3MsIG5vdGlmeSBjYWxsZWUgb2YgaG9vayBlcnJcbiAgICAgICAgcmV0dXJuIGZuKGVycik7XG4gICAgICB9XG4gICAgICBzZWxmLmVtaXQoJ2hvb2sgZW5kJywgaG9vayk7XG4gICAgICBkZWxldGUgaG9vay5jdHguY3VycmVudFRlc3Q7XG4gICAgICBuZXh0KCsraSk7XG4gICAgfSk7XG4gIH1cblxuICBSdW5uZXIuaW1tZWRpYXRlbHkoZnVuY3Rpb24oKXtcbiAgICBuZXh0KDApO1xuICB9KTtcbn07XG5cbi8qKlxuICogUnVuIGhvb2sgYG5hbWVgIGZvciB0aGUgZ2l2ZW4gYXJyYXkgb2YgYHN1aXRlc2BcbiAqIGluIG9yZGVyLCBhbmQgY2FsbGJhY2sgYGZuKGVyciwgZXJyU3VpdGUpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtBcnJheX0gc3VpdGVzXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ob29rcyA9IGZ1bmN0aW9uKG5hbWUsIHN1aXRlcywgZm4pe1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIG9yaWcgPSB0aGlzLnN1aXRlO1xuXG4gIGZ1bmN0aW9uIG5leHQoc3VpdGUpIHtcbiAgICBzZWxmLnN1aXRlID0gc3VpdGU7XG5cbiAgICBpZiAoIXN1aXRlKSB7XG4gICAgICBzZWxmLnN1aXRlID0gb3JpZztcbiAgICAgIHJldHVybiBmbigpO1xuICAgIH1cblxuICAgIHNlbGYuaG9vayhuYW1lLCBmdW5jdGlvbihlcnIpe1xuICAgICAgaWYgKGVycikge1xuICAgICAgICB2YXIgZXJyU3VpdGUgPSBzZWxmLnN1aXRlO1xuICAgICAgICBzZWxmLnN1aXRlID0gb3JpZztcbiAgICAgICAgcmV0dXJuIGZuKGVyciwgZXJyU3VpdGUpO1xuICAgICAgfVxuXG4gICAgICBuZXh0KHN1aXRlcy5wb3AoKSk7XG4gICAgfSk7XG4gIH1cblxuICBuZXh0KHN1aXRlcy5wb3AoKSk7XG59O1xuXG4vKipcbiAqIFJ1biBob29rcyBmcm9tIHRoZSB0b3AgbGV2ZWwgZG93bi5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUuaG9va1VwID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICB2YXIgc3VpdGVzID0gW3RoaXMuc3VpdGVdLmNvbmNhdCh0aGlzLnBhcmVudHMoKSkucmV2ZXJzZSgpO1xuICB0aGlzLmhvb2tzKG5hbWUsIHN1aXRlcywgZm4pO1xufTtcblxuLyoqXG4gKiBSdW4gaG9va3MgZnJvbSB0aGUgYm90dG9tIHVwLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ob29rRG93biA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgdmFyIHN1aXRlcyA9IFt0aGlzLnN1aXRlXS5jb25jYXQodGhpcy5wYXJlbnRzKCkpO1xuICB0aGlzLmhvb2tzKG5hbWUsIHN1aXRlcywgZm4pO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYW4gYXJyYXkgb2YgcGFyZW50IFN1aXRlcyBmcm9tXG4gKiBjbG9zZXN0IHRvIGZ1cnRoZXN0LlxuICpcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5wYXJlbnRzID0gZnVuY3Rpb24oKXtcbiAgdmFyIHN1aXRlID0gdGhpcy5zdWl0ZVxuICAgICwgc3VpdGVzID0gW107XG4gIHdoaWxlIChzdWl0ZSA9IHN1aXRlLnBhcmVudCkgc3VpdGVzLnB1c2goc3VpdGUpO1xuICByZXR1cm4gc3VpdGVzO1xufTtcblxuLyoqXG4gKiBSdW4gdGhlIGN1cnJlbnQgdGVzdCBhbmQgY2FsbGJhY2sgYGZuKGVycilgLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLnJ1blRlc3QgPSBmdW5jdGlvbihmbil7XG4gIHZhciB0ZXN0ID0gdGhpcy50ZXN0XG4gICAgLCBzZWxmID0gdGhpcztcblxuICBpZiAodGhpcy5hc3luY09ubHkpIHRlc3QuYXN5bmNPbmx5ID0gdHJ1ZTtcblxuICB0cnkge1xuICAgIHRlc3Qub24oJ2Vycm9yJywgZnVuY3Rpb24oZXJyKXtcbiAgICAgIHNlbGYuZmFpbCh0ZXN0LCBlcnIpO1xuICAgIH0pO1xuICAgIHRlc3QucnVuKGZuKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgZm4oZXJyKTtcbiAgfVxufTtcblxuLyoqXG4gKiBSdW4gdGVzdHMgaW4gdGhlIGdpdmVuIGBzdWl0ZWAgYW5kIGludm9rZVxuICogdGhlIGNhbGxiYWNrIGBmbigpYCB3aGVuIGNvbXBsZXRlLlxuICpcbiAqIEBwYXJhbSB7U3VpdGV9IHN1aXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ydW5UZXN0cyA9IGZ1bmN0aW9uKHN1aXRlLCBmbil7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgdGVzdHMgPSBzdWl0ZS50ZXN0cy5zbGljZSgpXG4gICAgLCB0ZXN0O1xuXG5cbiAgZnVuY3Rpb24gaG9va0VycihlcnIsIGVyclN1aXRlLCBhZnRlcikge1xuICAgIC8vIGJlZm9yZS9hZnRlciBFYWNoIGhvb2sgZm9yIGVyclN1aXRlIGZhaWxlZDpcbiAgICB2YXIgb3JpZyA9IHNlbGYuc3VpdGU7XG5cbiAgICAvLyBmb3IgZmFpbGVkICdhZnRlciBlYWNoJyBob29rIHN0YXJ0IGZyb20gZXJyU3VpdGUgcGFyZW50LFxuICAgIC8vIG90aGVyd2lzZSBzdGFydCBmcm9tIGVyclN1aXRlIGl0c2VsZlxuICAgIHNlbGYuc3VpdGUgPSBhZnRlciA/IGVyclN1aXRlLnBhcmVudCA6IGVyclN1aXRlO1xuXG4gICAgaWYgKHNlbGYuc3VpdGUpIHtcbiAgICAgIC8vIGNhbGwgaG9va1VwIGFmdGVyRWFjaFxuICAgICAgc2VsZi5ob29rVXAoJ2FmdGVyRWFjaCcsIGZ1bmN0aW9uKGVycjIsIGVyclN1aXRlMikge1xuICAgICAgICBzZWxmLnN1aXRlID0gb3JpZztcbiAgICAgICAgLy8gc29tZSBob29rcyBtYXkgZmFpbCBldmVuIG5vd1xuICAgICAgICBpZiAoZXJyMikgcmV0dXJuIGhvb2tFcnIoZXJyMiwgZXJyU3VpdGUyLCB0cnVlKTtcbiAgICAgICAgLy8gcmVwb3J0IGVycm9yIHN1aXRlXG4gICAgICAgIGZuKGVyclN1aXRlKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyB0aGVyZSBpcyBubyBuZWVkIGNhbGxpbmcgb3RoZXIgJ2FmdGVyIGVhY2gnIGhvb2tzXG4gICAgICBzZWxmLnN1aXRlID0gb3JpZztcbiAgICAgIGZuKGVyclN1aXRlKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBuZXh0KGVyciwgZXJyU3VpdGUpIHtcbiAgICAvLyBpZiB3ZSBiYWlsIGFmdGVyIGZpcnN0IGVyclxuICAgIGlmIChzZWxmLmZhaWx1cmVzICYmIHN1aXRlLl9iYWlsKSByZXR1cm4gZm4oKTtcblxuICAgIGlmIChzZWxmLl9hYm9ydCkgcmV0dXJuIGZuKCk7XG5cbiAgICBpZiAoZXJyKSByZXR1cm4gaG9va0VycihlcnIsIGVyclN1aXRlLCB0cnVlKTtcblxuICAgIC8vIG5leHQgdGVzdFxuICAgIHRlc3QgPSB0ZXN0cy5zaGlmdCgpO1xuXG4gICAgLy8gYWxsIGRvbmVcbiAgICBpZiAoIXRlc3QpIHJldHVybiBmbigpO1xuXG4gICAgLy8gZ3JlcFxuICAgIHZhciBtYXRjaCA9IHNlbGYuX2dyZXAudGVzdCh0ZXN0LmZ1bGxUaXRsZSgpKTtcbiAgICBpZiAoc2VsZi5faW52ZXJ0KSBtYXRjaCA9ICFtYXRjaDtcbiAgICBpZiAoIW1hdGNoKSByZXR1cm4gbmV4dCgpO1xuXG4gICAgLy8gcGVuZGluZ1xuICAgIGlmICh0ZXN0LnBlbmRpbmcpIHtcbiAgICAgIHNlbGYuZW1pdCgncGVuZGluZycsIHRlc3QpO1xuICAgICAgc2VsZi5lbWl0KCd0ZXN0IGVuZCcsIHRlc3QpO1xuICAgICAgcmV0dXJuIG5leHQoKTtcbiAgICB9XG5cbiAgICAvLyBleGVjdXRlIHRlc3QgYW5kIGhvb2socylcbiAgICBzZWxmLmVtaXQoJ3Rlc3QnLCBzZWxmLnRlc3QgPSB0ZXN0KTtcbiAgICBzZWxmLmhvb2tEb3duKCdiZWZvcmVFYWNoJywgZnVuY3Rpb24oZXJyLCBlcnJTdWl0ZSl7XG5cbiAgICAgIGlmIChlcnIpIHJldHVybiBob29rRXJyKGVyciwgZXJyU3VpdGUsIGZhbHNlKTtcblxuICAgICAgc2VsZi5jdXJyZW50UnVubmFibGUgPSBzZWxmLnRlc3Q7XG4gICAgICBzZWxmLnJ1blRlc3QoZnVuY3Rpb24oZXJyKXtcbiAgICAgICAgdGVzdCA9IHNlbGYudGVzdDtcblxuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgc2VsZi5mYWlsKHRlc3QsIGVycik7XG4gICAgICAgICAgc2VsZi5lbWl0KCd0ZXN0IGVuZCcsIHRlc3QpO1xuICAgICAgICAgIHJldHVybiBzZWxmLmhvb2tVcCgnYWZ0ZXJFYWNoJywgbmV4dCk7XG4gICAgICAgIH1cblxuICAgICAgICB0ZXN0LnN0YXRlID0gJ3Bhc3NlZCc7XG4gICAgICAgIHNlbGYuZW1pdCgncGFzcycsIHRlc3QpO1xuICAgICAgICBzZWxmLmVtaXQoJ3Rlc3QgZW5kJywgdGVzdCk7XG4gICAgICAgIHNlbGYuaG9va1VwKCdhZnRlckVhY2gnLCBuZXh0KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgdGhpcy5uZXh0ID0gbmV4dDtcbiAgbmV4dCgpO1xufTtcblxuLyoqXG4gKiBSdW4gdGhlIGdpdmVuIGBzdWl0ZWAgYW5kIGludm9rZSB0aGVcbiAqIGNhbGxiYWNrIGBmbigpYCB3aGVuIGNvbXBsZXRlLlxuICpcbiAqIEBwYXJhbSB7U3VpdGV9IHN1aXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ydW5TdWl0ZSA9IGZ1bmN0aW9uKHN1aXRlLCBmbil7XG4gIHZhciB0b3RhbCA9IHRoaXMuZ3JlcFRvdGFsKHN1aXRlKVxuICAgICwgc2VsZiA9IHRoaXNcbiAgICAsIGkgPSAwO1xuXG4gIGRlYnVnKCdydW4gc3VpdGUgJXMnLCBzdWl0ZS5mdWxsVGl0bGUoKSk7XG5cbiAgaWYgKCF0b3RhbCkgcmV0dXJuIGZuKCk7XG5cbiAgdGhpcy5lbWl0KCdzdWl0ZScsIHRoaXMuc3VpdGUgPSBzdWl0ZSk7XG5cbiAgZnVuY3Rpb24gbmV4dChlcnJTdWl0ZSkge1xuICAgIGlmIChlcnJTdWl0ZSkge1xuICAgICAgLy8gY3VycmVudCBzdWl0ZSBmYWlsZWQgb24gYSBob29rIGZyb20gZXJyU3VpdGVcbiAgICAgIGlmIChlcnJTdWl0ZSA9PSBzdWl0ZSkge1xuICAgICAgICAvLyBpZiBlcnJTdWl0ZSBpcyBjdXJyZW50IHN1aXRlXG4gICAgICAgIC8vIGNvbnRpbnVlIHRvIHRoZSBuZXh0IHNpYmxpbmcgc3VpdGVcbiAgICAgICAgcmV0dXJuIGRvbmUoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGVyclN1aXRlIGlzIGFtb25nIHRoZSBwYXJlbnRzIG9mIGN1cnJlbnQgc3VpdGVcbiAgICAgICAgLy8gc3RvcCBleGVjdXRpb24gb2YgZXJyU3VpdGUgYW5kIGFsbCBzdWItc3VpdGVzXG4gICAgICAgIHJldHVybiBkb25lKGVyclN1aXRlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc2VsZi5fYWJvcnQpIHJldHVybiBkb25lKCk7XG5cbiAgICB2YXIgY3VyciA9IHN1aXRlLnN1aXRlc1tpKytdO1xuICAgIGlmICghY3VycikgcmV0dXJuIGRvbmUoKTtcbiAgICBzZWxmLnJ1blN1aXRlKGN1cnIsIG5leHQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZG9uZShlcnJTdWl0ZSkge1xuICAgIHNlbGYuc3VpdGUgPSBzdWl0ZTtcbiAgICBzZWxmLmhvb2soJ2FmdGVyQWxsJywgZnVuY3Rpb24oKXtcbiAgICAgIHNlbGYuZW1pdCgnc3VpdGUgZW5kJywgc3VpdGUpO1xuICAgICAgZm4oZXJyU3VpdGUpO1xuICAgIH0pO1xuICB9XG5cbiAgdGhpcy5ob29rKCdiZWZvcmVBbGwnLCBmdW5jdGlvbihlcnIpe1xuICAgIGlmIChlcnIpIHJldHVybiBkb25lKCk7XG4gICAgc2VsZi5ydW5UZXN0cyhzdWl0ZSwgbmV4dCk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBIYW5kbGUgdW5jYXVnaHQgZXhjZXB0aW9ucy5cbiAqXG4gKiBAcGFyYW0ge0Vycm9yfSBlcnJcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUudW5jYXVnaHQgPSBmdW5jdGlvbihlcnIpe1xuICBpZiAoZXJyKSB7XG4gICAgZGVidWcoJ3VuY2F1Z2h0IGV4Y2VwdGlvbiAlcycsIGVyci5tZXNzYWdlKTtcbiAgfSBlbHNlIHtcbiAgICBkZWJ1ZygndW5jYXVnaHQgdW5kZWZpbmVkIGV4Y2VwdGlvbicpO1xuICAgIGVyciA9IG5ldyBFcnJvcignQ2F0Y2hlZCB1bmRlZmluZWQgZXJyb3IsIGRpZCB5b3UgdGhyb3cgd2l0aG91dCBzcGVjaWZ5aW5nIHdoYXQ/Jyk7XG4gIH1cbiAgXG4gIHZhciBydW5uYWJsZSA9IHRoaXMuY3VycmVudFJ1bm5hYmxlO1xuICBpZiAoIXJ1bm5hYmxlIHx8ICdmYWlsZWQnID09IHJ1bm5hYmxlLnN0YXRlKSByZXR1cm47XG4gIHJ1bm5hYmxlLmNsZWFyVGltZW91dCgpO1xuICBlcnIudW5jYXVnaHQgPSB0cnVlO1xuICB0aGlzLmZhaWwocnVubmFibGUsIGVycik7XG5cbiAgLy8gcmVjb3ZlciBmcm9tIHRlc3RcbiAgaWYgKCd0ZXN0JyA9PSBydW5uYWJsZS50eXBlKSB7XG4gICAgdGhpcy5lbWl0KCd0ZXN0IGVuZCcsIHJ1bm5hYmxlKTtcbiAgICB0aGlzLmhvb2tVcCgnYWZ0ZXJFYWNoJywgdGhpcy5uZXh0KTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBiYWlsIG9uIGhvb2tzXG4gIHRoaXMuZW1pdCgnZW5kJyk7XG59O1xuXG4vKipcbiAqIFJ1biB0aGUgcm9vdCBzdWl0ZSBhbmQgaW52b2tlIGBmbihmYWlsdXJlcylgXG4gKiBvbiBjb21wbGV0aW9uLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtSdW5uZXJ9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uKGZuKXtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBmbiA9IGZuIHx8IGZ1bmN0aW9uKCl7fTtcblxuICBmdW5jdGlvbiB1bmNhdWdodChlcnIpe1xuICAgIHNlbGYudW5jYXVnaHQoZXJyKTtcbiAgfVxuXG4gIGRlYnVnKCdzdGFydCcpO1xuXG4gIC8vIGNhbGxiYWNrXG4gIHRoaXMub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgZGVidWcoJ2VuZCcpO1xuICAgIHByb2Nlc3MucmVtb3ZlTGlzdGVuZXIoJ3VuY2F1Z2h0RXhjZXB0aW9uJywgdW5jYXVnaHQpO1xuICAgIGZuKHNlbGYuZmFpbHVyZXMpO1xuICB9KTtcblxuICAvLyBydW4gc3VpdGVzXG4gIHRoaXMuZW1pdCgnc3RhcnQnKTtcbiAgdGhpcy5ydW5TdWl0ZSh0aGlzLnN1aXRlLCBmdW5jdGlvbigpe1xuICAgIGRlYnVnKCdmaW5pc2hlZCBydW5uaW5nJyk7XG4gICAgc2VsZi5lbWl0KCdlbmQnKTtcbiAgfSk7XG5cbiAgLy8gdW5jYXVnaHQgZXhjZXB0aW9uXG4gIHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgdW5jYXVnaHQpO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBDbGVhbmx5IGFib3J0IGV4ZWN1dGlvblxuICpcbiAqIEByZXR1cm4ge1J1bm5lcn0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5SdW5uZXIucHJvdG90eXBlLmFib3J0ID0gZnVuY3Rpb24oKXtcbiAgZGVidWcoJ2Fib3J0aW5nJyk7XG4gIHRoaXMuX2Fib3J0ID0gdHJ1ZTtcbn1cblxuLyoqXG4gKiBGaWx0ZXIgbGVha3Mgd2l0aCB0aGUgZ2l2ZW4gZ2xvYmFscyBmbGFnZ2VkIGFzIGBva2AuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gb2tcbiAqIEBwYXJhbSB7QXJyYXl9IGdsb2JhbHNcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gZmlsdGVyTGVha3Mob2ssIGdsb2JhbHMpIHtcbiAgcmV0dXJuIGZpbHRlcihnbG9iYWxzLCBmdW5jdGlvbihrZXkpe1xuICAgIC8vIEZpcmVmb3ggYW5kIENocm9tZSBleHBvc2VzIGlmcmFtZXMgYXMgaW5kZXggaW5zaWRlIHRoZSB3aW5kb3cgb2JqZWN0XG4gICAgaWYgKC9eZCsvLnRlc3Qoa2V5KSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgLy8gaW4gZmlyZWZveFxuICAgIC8vIGlmIHJ1bm5lciBydW5zIGluIGFuIGlmcmFtZSwgdGhpcyBpZnJhbWUncyB3aW5kb3cuZ2V0SW50ZXJmYWNlIG1ldGhvZCBub3QgaW5pdCBhdCBmaXJzdFxuICAgIC8vIGl0IGlzIGFzc2lnbmVkIGluIHNvbWUgc2Vjb25kc1xuICAgIGlmIChnbG9iYWwubmF2aWdhdG9yICYmIC9eZ2V0SW50ZXJmYWNlLy50ZXN0KGtleSkpIHJldHVybiBmYWxzZTtcblxuICAgIC8vIGFuIGlmcmFtZSBjb3VsZCBiZSBhcHByb2FjaGVkIGJ5IHdpbmRvd1tpZnJhbWVJbmRleF1cbiAgICAvLyBpbiBpZTYsNyw4IGFuZCBvcGVyYSwgaWZyYW1lSW5kZXggaXMgZW51bWVyYWJsZSwgdGhpcyBjb3VsZCBjYXVzZSBsZWFrXG4gICAgaWYgKGdsb2JhbC5uYXZpZ2F0b3IgJiYgL15cXGQrLy50ZXN0KGtleSkpIHJldHVybiBmYWxzZTtcblxuICAgIC8vIE9wZXJhIGFuZCBJRSBleHBvc2UgZ2xvYmFsIHZhcmlhYmxlcyBmb3IgSFRNTCBlbGVtZW50IElEcyAoaXNzdWUgIzI0MylcbiAgICBpZiAoL15tb2NoYS0vLnRlc3Qoa2V5KSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgdmFyIG1hdGNoZWQgPSBmaWx0ZXIob2ssIGZ1bmN0aW9uKG9rKXtcbiAgICAgIGlmICh+b2suaW5kZXhPZignKicpKSByZXR1cm4gMCA9PSBrZXkuaW5kZXhPZihvay5zcGxpdCgnKicpWzBdKTtcbiAgICAgIHJldHVybiBrZXkgPT0gb2s7XG4gICAgfSk7XG4gICAgcmV0dXJuIG1hdGNoZWQubGVuZ3RoID09IDAgJiYgKCFnbG9iYWwubmF2aWdhdG9yIHx8ICdvbmVycm9yJyAhPT0ga2V5KTtcbiAgfSk7XG59XG5cbi8qKlxuICogQXJyYXkgb2YgZ2xvYmFscyBkZXBlbmRlbnQgb24gdGhlIGVudmlyb25tZW50LlxuICpcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuIGZ1bmN0aW9uIGV4dHJhR2xvYmFscygpIHtcbiAgaWYgKHR5cGVvZihwcm9jZXNzKSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHR5cGVvZihwcm9jZXNzLnZlcnNpb24pID09PSAnc3RyaW5nJykge1xuXG4gICAgdmFyIG5vZGVWZXJzaW9uID0gcHJvY2Vzcy52ZXJzaW9uLnNwbGl0KCcuJykucmVkdWNlKGZ1bmN0aW9uKGEsIHYpIHtcbiAgICAgIHJldHVybiBhIDw8IDggfCB2O1xuICAgIH0pO1xuXG4gICAgLy8gJ2Vycm5vJyB3YXMgcmVuYW1lZCB0byBwcm9jZXNzLl9lcnJubyBpbiB2MC45LjExLlxuXG4gICAgaWYgKG5vZGVWZXJzaW9uIDwgMHgwMDA5MEIpIHtcbiAgICAgIHJldHVybiBbJ2Vycm5vJ107XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIFtdO1xuIH1cblxufSk7IC8vIG1vZHVsZTogcnVubmVyLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJzdWl0ZS5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2Jyb3dzZXIvZXZlbnRzJykuRXZlbnRFbWl0dGVyXG4gICwgZGVidWcgPSByZXF1aXJlKCdicm93c2VyL2RlYnVnJykoJ21vY2hhOnN1aXRlJylcbiAgLCBtaWxsaXNlY29uZHMgPSByZXF1aXJlKCcuL21zJylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKVxuICAsIEhvb2sgPSByZXF1aXJlKCcuL2hvb2snKTtcblxuLyoqXG4gKiBFeHBvc2UgYFN1aXRlYC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBTdWl0ZTtcblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgYFN1aXRlYCB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgXG4gKiBhbmQgcGFyZW50IGBTdWl0ZWAuIFdoZW4gYSBzdWl0ZSB3aXRoIHRoZVxuICogc2FtZSB0aXRsZSBpcyBhbHJlYWR5IHByZXNlbnQsIHRoYXQgc3VpdGVcbiAqIGlzIHJldHVybmVkIHRvIHByb3ZpZGUgbmljZXIgcmVwb3J0ZXJcbiAqIGFuZCBtb3JlIGZsZXhpYmxlIG1ldGEtdGVzdGluZy5cbiAqXG4gKiBAcGFyYW0ge1N1aXRlfSBwYXJlbnRcbiAqIEBwYXJhbSB7U3RyaW5nfSB0aXRsZVxuICogQHJldHVybiB7U3VpdGV9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMuY3JlYXRlID0gZnVuY3Rpb24ocGFyZW50LCB0aXRsZSl7XG4gIHZhciBzdWl0ZSA9IG5ldyBTdWl0ZSh0aXRsZSwgcGFyZW50LmN0eCk7XG4gIHN1aXRlLnBhcmVudCA9IHBhcmVudDtcbiAgaWYgKHBhcmVudC5wZW5kaW5nKSBzdWl0ZS5wZW5kaW5nID0gdHJ1ZTtcbiAgdGl0bGUgPSBzdWl0ZS5mdWxsVGl0bGUoKTtcbiAgcGFyZW50LmFkZFN1aXRlKHN1aXRlKTtcbiAgcmV0dXJuIHN1aXRlO1xufTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBTdWl0ZWAgd2l0aCB0aGUgZ2l2ZW5cbiAqIGB0aXRsZWAgYW5kIGBjdHhgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0aXRsZVxuICogQHBhcmFtIHtDb250ZXh0fSBjdHhcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIFN1aXRlKHRpdGxlLCBwYXJlbnRDb250ZXh0KSB7XG4gIHRoaXMudGl0bGUgPSB0aXRsZTtcbiAgdmFyIGNvbnRleHQgPSBmdW5jdGlvbigpIHt9O1xuICBjb250ZXh0LnByb3RvdHlwZSA9IHBhcmVudENvbnRleHQ7XG4gIHRoaXMuY3R4ID0gbmV3IGNvbnRleHQoKTtcbiAgdGhpcy5zdWl0ZXMgPSBbXTtcbiAgdGhpcy50ZXN0cyA9IFtdO1xuICB0aGlzLnBlbmRpbmcgPSBmYWxzZTtcbiAgdGhpcy5fYmVmb3JlRWFjaCA9IFtdO1xuICB0aGlzLl9iZWZvcmVBbGwgPSBbXTtcbiAgdGhpcy5fYWZ0ZXJFYWNoID0gW107XG4gIHRoaXMuX2FmdGVyQWxsID0gW107XG4gIHRoaXMucm9vdCA9ICF0aXRsZTtcbiAgdGhpcy5fdGltZW91dCA9IDIwMDA7XG4gIHRoaXMuX2VuYWJsZVRpbWVvdXRzID0gdHJ1ZTtcbiAgdGhpcy5fc2xvdyA9IDc1O1xuICB0aGlzLl9iYWlsID0gZmFsc2U7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBFdmVudEVtaXR0ZXIucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZTtcblN1aXRlLnByb3RvdHlwZSA9IG5ldyBGO1xuU3VpdGUucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gU3VpdGU7XG5cblxuLyoqXG4gKiBSZXR1cm4gYSBjbG9uZSBvZiB0aGlzIGBTdWl0ZWAuXG4gKlxuICogQHJldHVybiB7U3VpdGV9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbigpe1xuICB2YXIgc3VpdGUgPSBuZXcgU3VpdGUodGhpcy50aXRsZSk7XG4gIGRlYnVnKCdjbG9uZScpO1xuICBzdWl0ZS5jdHggPSB0aGlzLmN0eDtcbiAgc3VpdGUudGltZW91dCh0aGlzLnRpbWVvdXQoKSk7XG4gIHN1aXRlLmVuYWJsZVRpbWVvdXRzKHRoaXMuZW5hYmxlVGltZW91dHMoKSk7XG4gIHN1aXRlLnNsb3codGhpcy5zbG93KCkpO1xuICBzdWl0ZS5iYWlsKHRoaXMuYmFpbCgpKTtcbiAgcmV0dXJuIHN1aXRlO1xufTtcblxuLyoqXG4gKiBTZXQgdGltZW91dCBgbXNgIG9yIHNob3J0LWhhbmQgc3VjaCBhcyBcIjJzXCIuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ8U3RyaW5nfSBtc1xuICogQHJldHVybiB7U3VpdGV8TnVtYmVyfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblN1aXRlLnByb3RvdHlwZS50aW1lb3V0ID0gZnVuY3Rpb24obXMpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fdGltZW91dDtcbiAgaWYgKCdzdHJpbmcnID09IHR5cGVvZiBtcykgbXMgPSBtaWxsaXNlY29uZHMobXMpO1xuICBkZWJ1ZygndGltZW91dCAlZCcsIG1zKTtcbiAgdGhpcy5fdGltZW91dCA9IHBhcnNlSW50KG1zLCAxMCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gICogU2V0IHRpbWVvdXQgYGVuYWJsZWRgLlxuICAqXG4gICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVkXG4gICogQHJldHVybiB7U3VpdGV8Qm9vbGVhbn0gc2VsZiBvciBlbmFibGVkXG4gICogQGFwaSBwcml2YXRlXG4gICovXG5cblN1aXRlLnByb3RvdHlwZS5lbmFibGVUaW1lb3V0cyA9IGZ1bmN0aW9uKGVuYWJsZWQpe1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHRoaXMuX2VuYWJsZVRpbWVvdXRzO1xuICBkZWJ1ZygnZW5hYmxlVGltZW91dHMgJXMnLCBlbmFibGVkKTtcbiAgdGhpcy5fZW5hYmxlVGltZW91dHMgPSBlbmFibGVkO1xuICByZXR1cm4gdGhpcztcbn1cblxuLyoqXG4gKiBTZXQgc2xvdyBgbXNgIG9yIHNob3J0LWhhbmQgc3VjaCBhcyBcIjJzXCIuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ8U3RyaW5nfSBtc1xuICogQHJldHVybiB7U3VpdGV8TnVtYmVyfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblN1aXRlLnByb3RvdHlwZS5zbG93ID0gZnVuY3Rpb24obXMpe1xuICBpZiAoMCA9PT0gYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX3Nsb3c7XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgbXMpIG1zID0gbWlsbGlzZWNvbmRzKG1zKTtcbiAgZGVidWcoJ3Nsb3cgJWQnLCBtcyk7XG4gIHRoaXMuX3Nsb3cgPSBtcztcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldHMgd2hldGhlciB0byBiYWlsIGFmdGVyIGZpcnN0IGVycm9yLlxuICpcbiAqIEBwYXJtYSB7Qm9vbGVhbn0gYmFpbFxuICogQHJldHVybiB7U3VpdGV8TnVtYmVyfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblN1aXRlLnByb3RvdHlwZS5iYWlsID0gZnVuY3Rpb24oYmFpbCl7XG4gIGlmICgwID09IGFyZ3VtZW50cy5sZW5ndGgpIHJldHVybiB0aGlzLl9iYWlsO1xuICBkZWJ1ZygnYmFpbCAlcycsIGJhaWwpO1xuICB0aGlzLl9iYWlsID0gYmFpbDtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJ1biBgZm4odGVzdFssIGRvbmVdKWAgYmVmb3JlIHJ1bm5pbmcgdGVzdHMuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1N1aXRlfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblN1aXRlLnByb3RvdHlwZS5iZWZvcmVBbGwgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICBpZiAodGhpcy5wZW5kaW5nKSByZXR1cm4gdGhpcztcbiAgaWYgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0aXRsZSkge1xuICAgIGZuID0gdGl0bGU7XG4gICAgdGl0bGUgPSBmbi5uYW1lO1xuICB9XG4gIHRpdGxlID0gJ1wiYmVmb3JlIGFsbFwiIGhvb2snICsgKHRpdGxlID8gJzogJyArIHRpdGxlIDogJycpO1xuXG4gIHZhciBob29rID0gbmV3IEhvb2sodGl0bGUsIGZuKTtcbiAgaG9vay5wYXJlbnQgPSB0aGlzO1xuICBob29rLnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICBob29rLmVuYWJsZVRpbWVvdXRzKHRoaXMuZW5hYmxlVGltZW91dHMoKSk7XG4gIGhvb2suc2xvdyh0aGlzLnNsb3coKSk7XG4gIGhvb2suY3R4ID0gdGhpcy5jdHg7XG4gIHRoaXMuX2JlZm9yZUFsbC5wdXNoKGhvb2spO1xuICB0aGlzLmVtaXQoJ2JlZm9yZUFsbCcsIGhvb2spO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUnVuIGBmbih0ZXN0WywgZG9uZV0pYCBhZnRlciBydW5uaW5nIHRlc3RzLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtTdWl0ZX0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYWZ0ZXJBbGwgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICBpZiAodGhpcy5wZW5kaW5nKSByZXR1cm4gdGhpcztcbiAgaWYgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0aXRsZSkge1xuICAgIGZuID0gdGl0bGU7XG4gICAgdGl0bGUgPSBmbi5uYW1lO1xuICB9XG4gIHRpdGxlID0gJ1wiYWZ0ZXIgYWxsXCIgaG9vaycgKyAodGl0bGUgPyAnOiAnICsgdGl0bGUgOiAnJyk7XG5cbiAgdmFyIGhvb2sgPSBuZXcgSG9vayh0aXRsZSwgZm4pO1xuICBob29rLnBhcmVudCA9IHRoaXM7XG4gIGhvb2sudGltZW91dCh0aGlzLnRpbWVvdXQoKSk7XG4gIGhvb2suZW5hYmxlVGltZW91dHModGhpcy5lbmFibGVUaW1lb3V0cygpKTtcbiAgaG9vay5zbG93KHRoaXMuc2xvdygpKTtcbiAgaG9vay5jdHggPSB0aGlzLmN0eDtcbiAgdGhpcy5fYWZ0ZXJBbGwucHVzaChob29rKTtcbiAgdGhpcy5lbWl0KCdhZnRlckFsbCcsIGhvb2spO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUnVuIGBmbih0ZXN0WywgZG9uZV0pYCBiZWZvcmUgZWFjaCB0ZXN0IGNhc2UuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1N1aXRlfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblN1aXRlLnByb3RvdHlwZS5iZWZvcmVFYWNoID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgaWYgKHRoaXMucGVuZGluZykgcmV0dXJuIHRoaXM7XG4gIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGl0bGUpIHtcbiAgICBmbiA9IHRpdGxlO1xuICAgIHRpdGxlID0gZm4ubmFtZTtcbiAgfVxuICB0aXRsZSA9ICdcImJlZm9yZSBlYWNoXCIgaG9vaycgKyAodGl0bGUgPyAnOiAnICsgdGl0bGUgOiAnJyk7XG5cbiAgdmFyIGhvb2sgPSBuZXcgSG9vayh0aXRsZSwgZm4pO1xuICBob29rLnBhcmVudCA9IHRoaXM7XG4gIGhvb2sudGltZW91dCh0aGlzLnRpbWVvdXQoKSk7XG4gIGhvb2suZW5hYmxlVGltZW91dHModGhpcy5lbmFibGVUaW1lb3V0cygpKTtcbiAgaG9vay5zbG93KHRoaXMuc2xvdygpKTtcbiAgaG9vay5jdHggPSB0aGlzLmN0eDtcbiAgdGhpcy5fYmVmb3JlRWFjaC5wdXNoKGhvb2spO1xuICB0aGlzLmVtaXQoJ2JlZm9yZUVhY2gnLCBob29rKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJ1biBgZm4odGVzdFssIGRvbmVdKWAgYWZ0ZXIgZWFjaCB0ZXN0IGNhc2UuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1N1aXRlfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblN1aXRlLnByb3RvdHlwZS5hZnRlckVhY2ggPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICBpZiAodGhpcy5wZW5kaW5nKSByZXR1cm4gdGhpcztcbiAgaWYgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0aXRsZSkge1xuICAgIGZuID0gdGl0bGU7XG4gICAgdGl0bGUgPSBmbi5uYW1lO1xuICB9XG4gIHRpdGxlID0gJ1wiYWZ0ZXIgZWFjaFwiIGhvb2snICsgKHRpdGxlID8gJzogJyArIHRpdGxlIDogJycpO1xuXG4gIHZhciBob29rID0gbmV3IEhvb2sodGl0bGUsIGZuKTtcbiAgaG9vay5wYXJlbnQgPSB0aGlzO1xuICBob29rLnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICBob29rLmVuYWJsZVRpbWVvdXRzKHRoaXMuZW5hYmxlVGltZW91dHMoKSk7XG4gIGhvb2suc2xvdyh0aGlzLnNsb3coKSk7XG4gIGhvb2suY3R4ID0gdGhpcy5jdHg7XG4gIHRoaXMuX2FmdGVyRWFjaC5wdXNoKGhvb2spO1xuICB0aGlzLmVtaXQoJ2FmdGVyRWFjaCcsIGhvb2spO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQWRkIGEgdGVzdCBgc3VpdGVgLlxuICpcbiAqIEBwYXJhbSB7U3VpdGV9IHN1aXRlXG4gKiBAcmV0dXJuIHtTdWl0ZX0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYWRkU3VpdGUgPSBmdW5jdGlvbihzdWl0ZSl7XG4gIHN1aXRlLnBhcmVudCA9IHRoaXM7XG4gIHN1aXRlLnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICBzdWl0ZS5lbmFibGVUaW1lb3V0cyh0aGlzLmVuYWJsZVRpbWVvdXRzKCkpO1xuICBzdWl0ZS5zbG93KHRoaXMuc2xvdygpKTtcbiAgc3VpdGUuYmFpbCh0aGlzLmJhaWwoKSk7XG4gIHRoaXMuc3VpdGVzLnB1c2goc3VpdGUpO1xuICB0aGlzLmVtaXQoJ3N1aXRlJywgc3VpdGUpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQWRkIGEgYHRlc3RgIHRvIHRoaXMgc3VpdGUuXG4gKlxuICogQHBhcmFtIHtUZXN0fSB0ZXN0XG4gKiBAcmV0dXJuIHtTdWl0ZX0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYWRkVGVzdCA9IGZ1bmN0aW9uKHRlc3Qpe1xuICB0ZXN0LnBhcmVudCA9IHRoaXM7XG4gIHRlc3QudGltZW91dCh0aGlzLnRpbWVvdXQoKSk7XG4gIHRlc3QuZW5hYmxlVGltZW91dHModGhpcy5lbmFibGVUaW1lb3V0cygpKTtcbiAgdGVzdC5zbG93KHRoaXMuc2xvdygpKTtcbiAgdGVzdC5jdHggPSB0aGlzLmN0eDtcbiAgdGhpcy50ZXN0cy5wdXNoKHRlc3QpO1xuICB0aGlzLmVtaXQoJ3Rlc3QnLCB0ZXN0KTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJldHVybiB0aGUgZnVsbCB0aXRsZSBnZW5lcmF0ZWQgYnkgcmVjdXJzaXZlbHlcbiAqIGNvbmNhdGVuYXRpbmcgdGhlIHBhcmVudCdzIGZ1bGwgdGl0bGUuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuZnVsbFRpdGxlID0gZnVuY3Rpb24oKXtcbiAgaWYgKHRoaXMucGFyZW50KSB7XG4gICAgdmFyIGZ1bGwgPSB0aGlzLnBhcmVudC5mdWxsVGl0bGUoKTtcbiAgICBpZiAoZnVsbCkgcmV0dXJuIGZ1bGwgKyAnICcgKyB0aGlzLnRpdGxlO1xuICB9XG4gIHJldHVybiB0aGlzLnRpdGxlO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gdGhlIHRvdGFsIG51bWJlciBvZiB0ZXN0cy5cbiAqXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblN1aXRlLnByb3RvdHlwZS50b3RhbCA9IGZ1bmN0aW9uKCl7XG4gIHJldHVybiB1dGlscy5yZWR1Y2UodGhpcy5zdWl0ZXMsIGZ1bmN0aW9uKHN1bSwgc3VpdGUpe1xuICAgIHJldHVybiBzdW0gKyBzdWl0ZS50b3RhbCgpO1xuICB9LCAwKSArIHRoaXMudGVzdHMubGVuZ3RoO1xufTtcblxuLyoqXG4gKiBJdGVyYXRlcyB0aHJvdWdoIGVhY2ggc3VpdGUgcmVjdXJzaXZlbHkgdG8gZmluZFxuICogYWxsIHRlc3RzLiBBcHBsaWVzIGEgZnVuY3Rpb24gaW4gdGhlIGZvcm1hdFxuICogYGZuKHRlc3QpYC5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7U3VpdGV9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuZWFjaFRlc3QgPSBmdW5jdGlvbihmbil7XG4gIHV0aWxzLmZvckVhY2godGhpcy50ZXN0cywgZm4pO1xuICB1dGlscy5mb3JFYWNoKHRoaXMuc3VpdGVzLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgc3VpdGUuZWFjaFRlc3QoZm4pO1xuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG59KTsgLy8gbW9kdWxlOiBzdWl0ZS5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwidGVzdC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIFJ1bm5hYmxlID0gcmVxdWlyZSgnLi9ydW5uYWJsZScpO1xuXG4vKipcbiAqIEV4cG9zZSBgVGVzdGAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBUZXN0O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFRlc3RgIHdpdGggdGhlIGdpdmVuIGB0aXRsZWAgYW5kIGNhbGxiYWNrIGBmbmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHRpdGxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gVGVzdCh0aXRsZSwgZm4pIHtcbiAgUnVubmFibGUuY2FsbCh0aGlzLCB0aXRsZSwgZm4pO1xuICB0aGlzLnBlbmRpbmcgPSAhZm47XG4gIHRoaXMudHlwZSA9ICd0ZXN0Jztcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYFJ1bm5hYmxlLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IFJ1bm5hYmxlLnByb3RvdHlwZTtcblRlc3QucHJvdG90eXBlID0gbmV3IEY7XG5UZXN0LnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFRlc3Q7XG5cblxufSk7IC8vIG1vZHVsZTogdGVzdC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwidXRpbHMuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgZnMgPSByZXF1aXJlKCdicm93c2VyL2ZzJylcbiAgLCBwYXRoID0gcmVxdWlyZSgnYnJvd3Nlci9wYXRoJylcbiAgLCBqb2luID0gcGF0aC5qb2luXG4gICwgZGVidWcgPSByZXF1aXJlKCdicm93c2VyL2RlYnVnJykoJ21vY2hhOndhdGNoJyk7XG5cbi8qKlxuICogSWdub3JlZCBkaXJlY3Rvcmllcy5cbiAqL1xuXG52YXIgaWdub3JlID0gWydub2RlX21vZHVsZXMnLCAnLmdpdCddO1xuXG4vKipcbiAqIEVzY2FwZSBzcGVjaWFsIGNoYXJhY3RlcnMgaW4gdGhlIGdpdmVuIHN0cmluZyBvZiBodG1sLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gaHRtbFxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5lc2NhcGUgPSBmdW5jdGlvbihodG1sKXtcbiAgcmV0dXJuIFN0cmluZyhodG1sKVxuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpO1xufTtcblxuLyoqXG4gKiBBcnJheSNmb3JFYWNoICg8PUlFOClcbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBwYXJhbSB7T2JqZWN0fSBzY29wZVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5mb3JFYWNoID0gZnVuY3Rpb24oYXJyLCBmbiwgc2NvcGUpe1xuICBmb3IgKHZhciBpID0gMCwgbCA9IGFyci5sZW5ndGg7IGkgPCBsOyBpKyspXG4gICAgZm4uY2FsbChzY29wZSwgYXJyW2ldLCBpKTtcbn07XG5cbi8qKlxuICogQXJyYXkjbWFwICg8PUlFOClcbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBwYXJhbSB7T2JqZWN0fSBzY29wZVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5tYXAgPSBmdW5jdGlvbihhcnIsIGZuLCBzY29wZSl7XG4gIHZhciByZXN1bHQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBhcnIubGVuZ3RoOyBpIDwgbDsgaSsrKVxuICAgIHJlc3VsdC5wdXNoKGZuLmNhbGwoc2NvcGUsIGFycltpXSwgaSkpO1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBBcnJheSNpbmRleE9mICg8PUlFOClcbiAqXG4gKiBAcGFybWEge0FycmF5fSBhcnJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogdG8gZmluZCBpbmRleCBvZlxuICogQHBhcmFtIHtOdW1iZXJ9IHN0YXJ0XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLmluZGV4T2YgPSBmdW5jdGlvbihhcnIsIG9iaiwgc3RhcnQpe1xuICBmb3IgKHZhciBpID0gc3RhcnQgfHwgMCwgbCA9IGFyci5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBpZiAoYXJyW2ldID09PSBvYmopXG4gICAgICByZXR1cm4gaTtcbiAgfVxuICByZXR1cm4gLTE7XG59O1xuXG4vKipcbiAqIEFycmF5I3JlZHVjZSAoPD1JRTgpXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJyYXlcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcGFyYW0ge09iamVjdH0gaW5pdGlhbCB2YWx1ZVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5yZWR1Y2UgPSBmdW5jdGlvbihhcnIsIGZuLCB2YWwpe1xuICB2YXIgcnZhbCA9IHZhbDtcblxuICBmb3IgKHZhciBpID0gMCwgbCA9IGFyci5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBydmFsID0gZm4ocnZhbCwgYXJyW2ldLCBpLCBhcnIpO1xuICB9XG5cbiAgcmV0dXJuIHJ2YWw7XG59O1xuXG4vKipcbiAqIEFycmF5I2ZpbHRlciAoPD1JRTgpXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJyYXlcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLmZpbHRlciA9IGZ1bmN0aW9uKGFyciwgZm4pe1xuICB2YXIgcmV0ID0gW107XG5cbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBhcnIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgdmFyIHZhbCA9IGFycltpXTtcbiAgICBpZiAoZm4odmFsLCBpLCBhcnIpKSByZXQucHVzaCh2YWwpO1xuICB9XG5cbiAgcmV0dXJuIHJldDtcbn07XG5cbi8qKlxuICogT2JqZWN0LmtleXMgKDw9SUU4KVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge0FycmF5fSBrZXlzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLmtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbihvYmopIHtcbiAgdmFyIGtleXMgPSBbXVxuICAgICwgaGFzID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSAvLyBmb3IgYHdpbmRvd2Agb24gPD1JRThcblxuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKGhhcy5jYWxsKG9iaiwga2V5KSkge1xuICAgICAga2V5cy5wdXNoKGtleSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGtleXM7XG59O1xuXG4vKipcbiAqIFdhdGNoIHRoZSBnaXZlbiBgZmlsZXNgIGZvciBjaGFuZ2VzXG4gKiBhbmQgaW52b2tlIGBmbihmaWxlKWAgb24gbW9kaWZpY2F0aW9uLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGZpbGVzXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy53YXRjaCA9IGZ1bmN0aW9uKGZpbGVzLCBmbil7XG4gIHZhciBvcHRpb25zID0geyBpbnRlcnZhbDogMTAwIH07XG4gIGZpbGVzLmZvckVhY2goZnVuY3Rpb24oZmlsZSl7XG4gICAgZGVidWcoJ2ZpbGUgJXMnLCBmaWxlKTtcbiAgICBmcy53YXRjaEZpbGUoZmlsZSwgb3B0aW9ucywgZnVuY3Rpb24oY3VyciwgcHJldil7XG4gICAgICBpZiAocHJldi5tdGltZSA8IGN1cnIubXRpbWUpIGZuKGZpbGUpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogSWdub3JlZCBmaWxlcy5cbiAqL1xuXG5mdW5jdGlvbiBpZ25vcmVkKHBhdGgpe1xuICByZXR1cm4gIX5pZ25vcmUuaW5kZXhPZihwYXRoKTtcbn1cblxuLyoqXG4gKiBMb29rdXAgZmlsZXMgaW4gdGhlIGdpdmVuIGBkaXJgLlxuICpcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5maWxlcyA9IGZ1bmN0aW9uKGRpciwgZXh0LCByZXQpe1xuICByZXQgPSByZXQgfHwgW107XG4gIGV4dCA9IGV4dCB8fCBbJ2pzJ107XG5cbiAgdmFyIHJlID0gbmV3IFJlZ0V4cCgnXFxcXC4oJyArIGV4dC5qb2luKCd8JykgKyAnKSQnKTtcblxuICBmcy5yZWFkZGlyU3luYyhkaXIpXG4gIC5maWx0ZXIoaWdub3JlZClcbiAgLmZvckVhY2goZnVuY3Rpb24ocGF0aCl7XG4gICAgcGF0aCA9IGpvaW4oZGlyLCBwYXRoKTtcbiAgICBpZiAoZnMuc3RhdFN5bmMocGF0aCkuaXNEaXJlY3RvcnkoKSkge1xuICAgICAgZXhwb3J0cy5maWxlcyhwYXRoLCBleHQsIHJldCk7XG4gICAgfSBlbHNlIGlmIChwYXRoLm1hdGNoKHJlKSkge1xuICAgICAgcmV0LnB1c2gocGF0aCk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gcmV0O1xufTtcblxuLyoqXG4gKiBDb21wdXRlIGEgc2x1ZyBmcm9tIHRoZSBnaXZlbiBgc3RyYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLnNsdWcgPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyXG4gICAgLnRvTG93ZXJDYXNlKClcbiAgICAucmVwbGFjZSgvICsvZywgJy0nKVxuICAgIC5yZXBsYWNlKC9bXi1cXHddL2csICcnKTtcbn07XG5cbi8qKlxuICogU3RyaXAgdGhlIGZ1bmN0aW9uIGRlZmluaXRpb24gZnJvbSBgc3RyYCxcbiAqIGFuZCByZS1pbmRlbnQgZm9yIHByZSB3aGl0ZXNwYWNlLlxuICovXG5cbmV4cG9ydHMuY2xlYW4gPSBmdW5jdGlvbihzdHIpIHtcbiAgc3RyID0gc3RyXG4gICAgLnJlcGxhY2UoL1xcclxcbj98W1xcblxcdTIwMjhcXHUyMDI5XS9nLCBcIlxcblwiKS5yZXBsYWNlKC9eXFx1RkVGRi8sICcnKVxuICAgIC5yZXBsYWNlKC9eZnVuY3Rpb24gKlxcKC4qXFwpICp7fFxcKC4qXFwpICo9PiAqez8vLCAnJylcbiAgICAucmVwbGFjZSgvXFxzK1xcfSQvLCAnJyk7XG5cbiAgdmFyIHNwYWNlcyA9IHN0ci5tYXRjaCgvXlxcbj8oICopLylbMV0ubGVuZ3RoXG4gICAgLCB0YWJzID0gc3RyLm1hdGNoKC9eXFxuPyhcXHQqKS8pWzFdLmxlbmd0aFxuICAgICwgcmUgPSBuZXcgUmVnRXhwKCdeXFxuPycgKyAodGFicyA/ICdcXHQnIDogJyAnKSArICd7JyArICh0YWJzID8gdGFicyA6IHNwYWNlcykgKyAnfScsICdnbScpO1xuXG4gIHN0ciA9IHN0ci5yZXBsYWNlKHJlLCAnJyk7XG5cbiAgcmV0dXJuIGV4cG9ydHMudHJpbShzdHIpO1xufTtcblxuLyoqXG4gKiBFc2NhcGUgcmVndWxhciBleHByZXNzaW9uIGNoYXJhY3RlcnMgaW4gYHN0cmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5lc2NhcGVSZWdleHAgPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1stXFxcXF4kKis/LigpfFtcXF17fV0vZywgXCJcXFxcJCZcIik7XG59O1xuXG4vKipcbiAqIFRyaW0gdGhlIGdpdmVuIGBzdHJgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMudHJpbSA9IGZ1bmN0aW9uKHN0cil7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpO1xufTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gYHFzYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gcXNcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMucGFyc2VRdWVyeSA9IGZ1bmN0aW9uKHFzKXtcbiAgcmV0dXJuIGV4cG9ydHMucmVkdWNlKHFzLnJlcGxhY2UoJz8nLCAnJykuc3BsaXQoJyYnKSwgZnVuY3Rpb24ob2JqLCBwYWlyKXtcbiAgICB2YXIgaSA9IHBhaXIuaW5kZXhPZignPScpXG4gICAgICAsIGtleSA9IHBhaXIuc2xpY2UoMCwgaSlcbiAgICAgICwgdmFsID0gcGFpci5zbGljZSgrK2kpO1xuXG4gICAgb2JqW2tleV0gPSBkZWNvZGVVUklDb21wb25lbnQodmFsKTtcbiAgICByZXR1cm4gb2JqO1xuICB9LCB7fSk7XG59O1xuXG4vKipcbiAqIEhpZ2hsaWdodCB0aGUgZ2l2ZW4gc3RyaW5nIG9mIGBqc2AuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGpzXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBoaWdobGlnaHQoanMpIHtcbiAgcmV0dXJuIGpzXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAucmVwbGFjZSgvXFwvXFwvKC4qKS9nbSwgJzxzcGFuIGNsYXNzPVwiY29tbWVudFwiPi8vJDE8L3NwYW4+JylcbiAgICAucmVwbGFjZSgvKCcuKj8nKS9nbSwgJzxzcGFuIGNsYXNzPVwic3RyaW5nXCI+JDE8L3NwYW4+JylcbiAgICAucmVwbGFjZSgvKFxcZCtcXC5cXGQrKS9nbSwgJzxzcGFuIGNsYXNzPVwibnVtYmVyXCI+JDE8L3NwYW4+JylcbiAgICAucmVwbGFjZSgvKFxcZCspL2dtLCAnPHNwYW4gY2xhc3M9XCJudW1iZXJcIj4kMTwvc3Bhbj4nKVxuICAgIC5yZXBsYWNlKC9cXGJuZXdbIFxcdF0rKFxcdyspL2dtLCAnPHNwYW4gY2xhc3M9XCJrZXl3b3JkXCI+bmV3PC9zcGFuPiA8c3BhbiBjbGFzcz1cImluaXRcIj4kMTwvc3Bhbj4nKVxuICAgIC5yZXBsYWNlKC9cXGIoZnVuY3Rpb258bmV3fHRocm93fHJldHVybnx2YXJ8aWZ8ZWxzZSlcXGIvZ20sICc8c3BhbiBjbGFzcz1cImtleXdvcmRcIj4kMTwvc3Bhbj4nKVxufVxuXG4vKipcbiAqIEhpZ2hsaWdodCB0aGUgY29udGVudHMgb2YgdGFnIGBuYW1lYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5oaWdobGlnaHRUYWdzID0gZnVuY3Rpb24obmFtZSkge1xuICB2YXIgY29kZSA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKG5hbWUpO1xuICBmb3IgKHZhciBpID0gMCwgbGVuID0gY29kZS5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgIGNvZGVbaV0uaW5uZXJIVE1MID0gaGlnaGxpZ2h0KGNvZGVbaV0uaW5uZXJIVE1MKTtcbiAgfVxufTtcblxuXG4vKipcbiAqIFN0cmluZ2lmeSBgb2JqYC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLnN0cmluZ2lmeSA9IGZ1bmN0aW9uKG9iaikge1xuICBpZiAob2JqIGluc3RhbmNlb2YgUmVnRXhwKSByZXR1cm4gb2JqLnRvU3RyaW5nKCk7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShleHBvcnRzLmNhbm9uaWNhbGl6ZShvYmopLCBudWxsLCAyKS5yZXBsYWNlKC8sKFxcbnwkKS9nLCAnJDEnKTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBuZXcgb2JqZWN0IHRoYXQgaGFzIHRoZSBrZXlzIGluIHNvcnRlZCBvcmRlci5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuY2Fub25pY2FsaXplID0gZnVuY3Rpb24ob2JqLCBzdGFjaykge1xuICAgc3RhY2sgPSBzdGFjayB8fCBbXTtcblxuICAgaWYgKGV4cG9ydHMuaW5kZXhPZihzdGFjaywgb2JqKSAhPT0gLTEpIHJldHVybiAnW0NpcmN1bGFyXSc7XG5cbiAgIHZhciBjYW5vbmljYWxpemVkT2JqO1xuXG4gICBpZiAoe30udG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBBcnJheV0nKSB7XG4gICAgIHN0YWNrLnB1c2gob2JqKTtcbiAgICAgY2Fub25pY2FsaXplZE9iaiA9IGV4cG9ydHMubWFwKG9iaiwgZnVuY3Rpb24oaXRlbSkge1xuICAgICAgIHJldHVybiBleHBvcnRzLmNhbm9uaWNhbGl6ZShpdGVtLCBzdGFjayk7XG4gICAgIH0pO1xuICAgICBzdGFjay5wb3AoKTtcbiAgIH0gZWxzZSBpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiYgb2JqICE9PSBudWxsKSB7XG4gICAgIHN0YWNrLnB1c2gob2JqKTtcbiAgICAgY2Fub25pY2FsaXplZE9iaiA9IHt9O1xuICAgICBleHBvcnRzLmZvckVhY2goZXhwb3J0cy5rZXlzKG9iaikuc29ydCgpLCBmdW5jdGlvbihrZXkpIHtcbiAgICAgICBjYW5vbmljYWxpemVkT2JqW2tleV0gPSBleHBvcnRzLmNhbm9uaWNhbGl6ZShvYmpba2V5XSwgc3RhY2spO1xuICAgICB9KTtcbiAgICAgc3RhY2sucG9wKCk7XG4gICB9IGVsc2Uge1xuICAgICBjYW5vbmljYWxpemVkT2JqID0gb2JqO1xuICAgfVxuXG4gICByZXR1cm4gY2Fub25pY2FsaXplZE9iajtcbiB9XG5cbn0pOyAvLyBtb2R1bGU6IHV0aWxzLmpzXG4vLyBUaGUgZ2xvYmFsIG9iamVjdCBpcyBcInNlbGZcIiBpbiBXZWIgV29ya2Vycy5cbnZhciBnbG9iYWwgPSAoZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzOyB9KSgpO1xuXG4vKipcbiAqIFNhdmUgdGltZXIgcmVmZXJlbmNlcyB0byBhdm9pZCBTaW5vbiBpbnRlcmZlcmluZyAoc2VlIEdILTIzNykuXG4gKi9cblxudmFyIERhdGUgPSBnbG9iYWwuRGF0ZTtcbnZhciBzZXRUaW1lb3V0ID0gZ2xvYmFsLnNldFRpbWVvdXQ7XG52YXIgc2V0SW50ZXJ2YWwgPSBnbG9iYWwuc2V0SW50ZXJ2YWw7XG52YXIgY2xlYXJUaW1lb3V0ID0gZ2xvYmFsLmNsZWFyVGltZW91dDtcbnZhciBjbGVhckludGVydmFsID0gZ2xvYmFsLmNsZWFySW50ZXJ2YWw7XG5cbi8qKlxuICogTm9kZSBzaGltcy5cbiAqXG4gKiBUaGVzZSBhcmUgbWVhbnQgb25seSB0byBhbGxvd1xuICogbW9jaGEuanMgdG8gcnVuIHVudG91Y2hlZCwgbm90XG4gKiB0byBhbGxvdyBydW5uaW5nIG5vZGUgY29kZSBpblxuICogdGhlIGJyb3dzZXIuXG4gKi9cblxudmFyIHByb2Nlc3MgPSB7fTtcbnByb2Nlc3MuZXhpdCA9IGZ1bmN0aW9uKHN0YXR1cyl7fTtcbnByb2Nlc3Muc3Rkb3V0ID0ge307XG5cbnZhciB1bmNhdWdodEV4Y2VwdGlvbkhhbmRsZXJzID0gW107XG5cbnZhciBvcmlnaW5hbE9uZXJyb3JIYW5kbGVyID0gZ2xvYmFsLm9uZXJyb3I7XG5cbi8qKlxuICogUmVtb3ZlIHVuY2F1Z2h0RXhjZXB0aW9uIGxpc3RlbmVyLlxuICogUmV2ZXJ0IHRvIG9yaWdpbmFsIG9uZXJyb3IgaGFuZGxlciBpZiBwcmV2aW91c2x5IGRlZmluZWQuXG4gKi9cblxucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uKGUsIGZuKXtcbiAgaWYgKCd1bmNhdWdodEV4Y2VwdGlvbicgPT0gZSkge1xuICAgIGlmIChvcmlnaW5hbE9uZXJyb3JIYW5kbGVyKSB7XG4gICAgICBnbG9iYWwub25lcnJvciA9IG9yaWdpbmFsT25lcnJvckhhbmRsZXI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGdsb2JhbC5vbmVycm9yID0gZnVuY3Rpb24oKSB7fTtcbiAgICB9XG4gICAgdmFyIGkgPSBNb2NoYS51dGlscy5pbmRleE9mKHVuY2F1Z2h0RXhjZXB0aW9uSGFuZGxlcnMsIGZuKTtcbiAgICBpZiAoaSAhPSAtMSkgeyB1bmNhdWdodEV4Y2VwdGlvbkhhbmRsZXJzLnNwbGljZShpLCAxKTsgfVxuICB9XG59O1xuXG4vKipcbiAqIEltcGxlbWVudHMgdW5jYXVnaHRFeGNlcHRpb24gbGlzdGVuZXIuXG4gKi9cblxucHJvY2Vzcy5vbiA9IGZ1bmN0aW9uKGUsIGZuKXtcbiAgaWYgKCd1bmNhdWdodEV4Y2VwdGlvbicgPT0gZSkge1xuICAgIGdsb2JhbC5vbmVycm9yID0gZnVuY3Rpb24oZXJyLCB1cmwsIGxpbmUpe1xuICAgICAgZm4obmV3IEVycm9yKGVyciArICcgKCcgKyB1cmwgKyAnOicgKyBsaW5lICsgJyknKSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9O1xuICAgIHVuY2F1Z2h0RXhjZXB0aW9uSGFuZGxlcnMucHVzaChmbik7XG4gIH1cbn07XG5cbi8qKlxuICogRXhwb3NlIG1vY2hhLlxuICovXG5cbnZhciBNb2NoYSA9IGdsb2JhbC5Nb2NoYSA9IHJlcXVpcmUoJ21vY2hhJyksXG4gICAgbW9jaGEgPSBnbG9iYWwubW9jaGEgPSBuZXcgTW9jaGEoeyByZXBvcnRlcjogJ2h0bWwnIH0pO1xuXG4vLyBUaGUgQkREIFVJIGlzIHJlZ2lzdGVyZWQgYnkgZGVmYXVsdCwgYnV0IG5vIFVJIHdpbGwgYmUgZnVuY3Rpb25hbCBpbiB0aGVcbi8vIGJyb3dzZXIgd2l0aG91dCBhbiBleHBsaWNpdCBjYWxsIHRvIHRoZSBvdmVycmlkZGVuIGBtb2NoYS51aWAgKHNlZSBiZWxvdykuXG4vLyBFbnN1cmUgdGhhdCB0aGlzIGRlZmF1bHQgVUkgZG9lcyBub3QgZXhwb3NlIGl0cyBtZXRob2RzIHRvIHRoZSBnbG9iYWwgc2NvcGUuXG5tb2NoYS5zdWl0ZS5yZW1vdmVBbGxMaXN0ZW5lcnMoJ3ByZS1yZXF1aXJlJyk7XG5cbnZhciBpbW1lZGlhdGVRdWV1ZSA9IFtdXG4gICwgaW1tZWRpYXRlVGltZW91dDtcblxuZnVuY3Rpb24gdGltZXNsaWNlKCkge1xuICB2YXIgaW1tZWRpYXRlU3RhcnQgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgd2hpbGUgKGltbWVkaWF0ZVF1ZXVlLmxlbmd0aCAmJiAobmV3IERhdGUoKS5nZXRUaW1lKCkgLSBpbW1lZGlhdGVTdGFydCkgPCAxMDApIHtcbiAgICBpbW1lZGlhdGVRdWV1ZS5zaGlmdCgpKCk7XG4gIH1cbiAgaWYgKGltbWVkaWF0ZVF1ZXVlLmxlbmd0aCkge1xuICAgIGltbWVkaWF0ZVRpbWVvdXQgPSBzZXRUaW1lb3V0KHRpbWVzbGljZSwgMCk7XG4gIH0gZWxzZSB7XG4gICAgaW1tZWRpYXRlVGltZW91dCA9IG51bGw7XG4gIH1cbn1cblxuLyoqXG4gKiBIaWdoLXBlcmZvcm1hbmNlIG92ZXJyaWRlIG9mIFJ1bm5lci5pbW1lZGlhdGVseS5cbiAqL1xuXG5Nb2NoYS5SdW5uZXIuaW1tZWRpYXRlbHkgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICBpbW1lZGlhdGVRdWV1ZS5wdXNoKGNhbGxiYWNrKTtcbiAgaWYgKCFpbW1lZGlhdGVUaW1lb3V0KSB7XG4gICAgaW1tZWRpYXRlVGltZW91dCA9IHNldFRpbWVvdXQodGltZXNsaWNlLCAwKTtcbiAgfVxufTtcblxuLyoqXG4gKiBGdW5jdGlvbiB0byBhbGxvdyBhc3NlcnRpb24gbGlicmFyaWVzIHRvIHRocm93IGVycm9ycyBkaXJlY3RseSBpbnRvIG1vY2hhLlxuICogVGhpcyBpcyB1c2VmdWwgd2hlbiBydW5uaW5nIHRlc3RzIGluIGEgYnJvd3NlciBiZWNhdXNlIHdpbmRvdy5vbmVycm9yIHdpbGxcbiAqIG9ubHkgcmVjZWl2ZSB0aGUgJ21lc3NhZ2UnIGF0dHJpYnV0ZSBvZiB0aGUgRXJyb3IuXG4gKi9cbm1vY2hhLnRocm93RXJyb3IgPSBmdW5jdGlvbihlcnIpIHtcbiAgTW9jaGEudXRpbHMuZm9yRWFjaCh1bmNhdWdodEV4Y2VwdGlvbkhhbmRsZXJzLCBmdW5jdGlvbiAoZm4pIHtcbiAgICBmbihlcnIpO1xuICB9KTtcbiAgdGhyb3cgZXJyO1xufTtcblxuLyoqXG4gKiBPdmVycmlkZSB1aSB0byBlbnN1cmUgdGhhdCB0aGUgdWkgZnVuY3Rpb25zIGFyZSBpbml0aWFsaXplZC5cbiAqIE5vcm1hbGx5IHRoaXMgd291bGQgaGFwcGVuIGluIE1vY2hhLnByb3RvdHlwZS5sb2FkRmlsZXMuXG4gKi9cblxubW9jaGEudWkgPSBmdW5jdGlvbih1aSl7XG4gIE1vY2hhLnByb3RvdHlwZS51aS5jYWxsKHRoaXMsIHVpKTtcbiAgdGhpcy5zdWl0ZS5lbWl0KCdwcmUtcmVxdWlyZScsIGdsb2JhbCwgbnVsbCwgdGhpcyk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXR1cCBtb2NoYSB3aXRoIHRoZSBnaXZlbiBzZXR0aW5nIG9wdGlvbnMuXG4gKi9cblxubW9jaGEuc2V0dXAgPSBmdW5jdGlvbihvcHRzKXtcbiAgaWYgKCdzdHJpbmcnID09IHR5cGVvZiBvcHRzKSBvcHRzID0geyB1aTogb3B0cyB9O1xuICBmb3IgKHZhciBvcHQgaW4gb3B0cykgdGhpc1tvcHRdKG9wdHNbb3B0XSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSdW4gbW9jaGEsIHJldHVybmluZyB0aGUgUnVubmVyLlxuICovXG5cbm1vY2hhLnJ1biA9IGZ1bmN0aW9uKGZuKXtcbiAgdmFyIG9wdGlvbnMgPSBtb2NoYS5vcHRpb25zO1xuICBtb2NoYS5nbG9iYWxzKCdsb2NhdGlvbicpO1xuXG4gIHZhciBxdWVyeSA9IE1vY2hhLnV0aWxzLnBhcnNlUXVlcnkoZ2xvYmFsLmxvY2F0aW9uLnNlYXJjaCB8fCAnJyk7XG4gIGlmIChxdWVyeS5ncmVwKSBtb2NoYS5ncmVwKHF1ZXJ5LmdyZXApO1xuICBpZiAocXVlcnkuaW52ZXJ0KSBtb2NoYS5pbnZlcnQoKTtcblxuICByZXR1cm4gTW9jaGEucHJvdG90eXBlLnJ1bi5jYWxsKG1vY2hhLCBmdW5jdGlvbihlcnIpe1xuICAgIC8vIFRoZSBET00gRG9jdW1lbnQgaXMgbm90IGF2YWlsYWJsZSBpbiBXZWIgV29ya2Vycy5cbiAgICBpZiAoZ2xvYmFsLmRvY3VtZW50KSB7XG4gICAgICBNb2NoYS51dGlscy5oaWdobGlnaHRUYWdzKCdjb2RlJyk7XG4gICAgfVxuICAgIGlmIChmbikgZm4oZXJyKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEV4cG9zZSB0aGUgcHJvY2VzcyBzaGltLlxuICovXG5cbk1vY2hhLnByb2Nlc3MgPSBwcm9jZXNzO1xufSkoKTsiLCJAY2hhcnNldCBcInV0Zi04XCI7XG5cbmJvZHkge1xuICBtYXJnaW46MDtcbn1cblxuI21vY2hhIHtcbiAgZm9udDogMjBweC8xLjUgXCJIZWx2ZXRpY2EgTmV1ZVwiLCBIZWx2ZXRpY2EsIEFyaWFsLCBzYW5zLXNlcmlmO1xuICBtYXJnaW46IDYwcHggNTBweDtcbn1cblxuI21vY2hhIHVsLFxuI21vY2hhIGxpIHtcbiAgbWFyZ2luOiAwO1xuICBwYWRkaW5nOiAwO1xufVxuXG4jbW9jaGEgdWwge1xuICBsaXN0LXN0eWxlOiBub25lO1xufVxuXG4jbW9jaGEgaDEsXG4jbW9jaGEgaDIge1xuICBtYXJnaW46IDA7XG59XG5cbiNtb2NoYSBoMSB7XG4gIG1hcmdpbi10b3A6IDE1cHg7XG4gIGZvbnQtc2l6ZTogMWVtO1xuICBmb250LXdlaWdodDogMjAwO1xufVxuXG4jbW9jaGEgaDEgYSB7XG4gIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcbiAgY29sb3I6IGluaGVyaXQ7XG59XG5cbiNtb2NoYSBoMSBhOmhvdmVyIHtcbiAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XG59XG5cbiNtb2NoYSAuc3VpdGUgLnN1aXRlIGgxIHtcbiAgbWFyZ2luLXRvcDogMDtcbiAgZm9udC1zaXplOiAuOGVtO1xufVxuXG4jbW9jaGEgLmhpZGRlbiB7XG4gIGRpc3BsYXk6IG5vbmU7XG59XG5cbiNtb2NoYSBoMiB7XG4gIGZvbnQtc2l6ZTogMTJweDtcbiAgZm9udC13ZWlnaHQ6IG5vcm1hbDtcbiAgY3Vyc29yOiBwb2ludGVyO1xufVxuXG4jbW9jaGEgLnN1aXRlIHtcbiAgbWFyZ2luLWxlZnQ6IDE1cHg7XG59XG5cbiNtb2NoYSAudGVzdCB7XG4gIG1hcmdpbi1sZWZ0OiAxNXB4O1xuICBvdmVyZmxvdzogaGlkZGVuO1xufVxuXG4jbW9jaGEgLnRlc3QucGVuZGluZzpob3ZlciBoMjo6YWZ0ZXIge1xuICBjb250ZW50OiAnKHBlbmRpbmcpJztcbiAgZm9udC1mYW1pbHk6IGFyaWFsLCBzYW5zLXNlcmlmO1xufVxuXG4jbW9jaGEgLnRlc3QucGFzcy5tZWRpdW0gLmR1cmF0aW9uIHtcbiAgYmFja2dyb3VuZDogI2MwOTg1Mztcbn1cblxuI21vY2hhIC50ZXN0LnBhc3Muc2xvdyAuZHVyYXRpb24ge1xuICBiYWNrZ3JvdW5kOiAjYjk0YTQ4O1xufVxuXG4jbW9jaGEgLnRlc3QucGFzczo6YmVmb3JlIHtcbiAgY29udGVudDogJ+Kckyc7XG4gIGZvbnQtc2l6ZTogMTJweDtcbiAgZGlzcGxheTogYmxvY2s7XG4gIGZsb2F0OiBsZWZ0O1xuICBtYXJnaW4tcmlnaHQ6IDVweDtcbiAgY29sb3I6ICMwMGQ2YjI7XG59XG5cbiNtb2NoYSAudGVzdC5wYXNzIC5kdXJhdGlvbiB7XG4gIGZvbnQtc2l6ZTogOXB4O1xuICBtYXJnaW4tbGVmdDogNXB4O1xuICBwYWRkaW5nOiAycHggNXB4O1xuICBjb2xvcjogI2ZmZjtcbiAgLXdlYmtpdC1ib3gtc2hhZG93OiBpbnNldCAwIDFweCAxcHggcmdiYSgwLDAsMCwuMik7XG4gIC1tb3otYm94LXNoYWRvdzogaW5zZXQgMCAxcHggMXB4IHJnYmEoMCwwLDAsLjIpO1xuICBib3gtc2hhZG93OiBpbnNldCAwIDFweCAxcHggcmdiYSgwLDAsMCwuMik7XG4gIC13ZWJraXQtYm9yZGVyLXJhZGl1czogNXB4O1xuICAtbW96LWJvcmRlci1yYWRpdXM6IDVweDtcbiAgLW1zLWJvcmRlci1yYWRpdXM6IDVweDtcbiAgLW8tYm9yZGVyLXJhZGl1czogNXB4O1xuICBib3JkZXItcmFkaXVzOiA1cHg7XG59XG5cbiNtb2NoYSAudGVzdC5wYXNzLmZhc3QgLmR1cmF0aW9uIHtcbiAgZGlzcGxheTogbm9uZTtcbn1cblxuI21vY2hhIC50ZXN0LnBlbmRpbmcge1xuICBjb2xvcjogIzBiOTdjNDtcbn1cblxuI21vY2hhIC50ZXN0LnBlbmRpbmc6OmJlZm9yZSB7XG4gIGNvbnRlbnQ6ICfil6YnO1xuICBjb2xvcjogIzBiOTdjNDtcbn1cblxuI21vY2hhIC50ZXN0LmZhaWwge1xuICBjb2xvcjogI2MwMDtcbn1cblxuI21vY2hhIC50ZXN0LmZhaWwgcHJlIHtcbiAgY29sb3I6IGJsYWNrO1xufVxuXG4jbW9jaGEgLnRlc3QuZmFpbDo6YmVmb3JlIHtcbiAgY29udGVudDogJ+Kclic7XG4gIGZvbnQtc2l6ZTogMTJweDtcbiAgZGlzcGxheTogYmxvY2s7XG4gIGZsb2F0OiBsZWZ0O1xuICBtYXJnaW4tcmlnaHQ6IDVweDtcbiAgY29sb3I6ICNjMDA7XG59XG5cbiNtb2NoYSAudGVzdCBwcmUuZXJyb3Ige1xuICBjb2xvcjogI2MwMDtcbiAgbWF4LWhlaWdodDogMzAwcHg7XG4gIG92ZXJmbG93OiBhdXRvO1xufVxuXG4vKipcbiAqICgxKTogYXBwcm94aW1hdGUgZm9yIGJyb3dzZXJzIG5vdCBzdXBwb3J0aW5nIGNhbGNcbiAqICgyKTogNDIgPSAyKjE1ICsgMioxMCArIDIqMSAocGFkZGluZyArIG1hcmdpbiArIGJvcmRlcilcbiAqICAgICAgXl4gc2VyaW91c2x5XG4gKi9cbiNtb2NoYSAudGVzdCBwcmUge1xuICBkaXNwbGF5OiBibG9jaztcbiAgZmxvYXQ6IGxlZnQ7XG4gIGNsZWFyOiBsZWZ0O1xuICBmb250OiAxMnB4LzEuNSBtb25hY28sIG1vbm9zcGFjZTtcbiAgbWFyZ2luOiA1cHg7XG4gIHBhZGRpbmc6IDE1cHg7XG4gIGJvcmRlcjogMXB4IHNvbGlkICNlZWU7XG4gIG1heC13aWR0aDogODUlOyAvKigxKSovXG4gIG1heC13aWR0aDogY2FsYygxMDAlIC0gNDJweCk7IC8qKDIpKi9cbiAgd29yZC13cmFwOiBicmVhay13b3JkO1xuICBib3JkZXItYm90dG9tLWNvbG9yOiAjZGRkO1xuICAtd2Via2l0LWJvcmRlci1yYWRpdXM6IDNweDtcbiAgLXdlYmtpdC1ib3gtc2hhZG93OiAwIDFweCAzcHggI2VlZTtcbiAgLW1vei1ib3JkZXItcmFkaXVzOiAzcHg7XG4gIC1tb3otYm94LXNoYWRvdzogMCAxcHggM3B4ICNlZWU7XG4gIGJvcmRlci1yYWRpdXM6IDNweDtcbn1cblxuI21vY2hhIC50ZXN0IGgyIHtcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xufVxuXG4jbW9jaGEgLnRlc3QgYS5yZXBsYXkge1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHRvcDogM3B4O1xuICByaWdodDogMDtcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xuICB2ZXJ0aWNhbC1hbGlnbjogbWlkZGxlO1xuICBkaXNwbGF5OiBibG9jaztcbiAgd2lkdGg6IDE1cHg7XG4gIGhlaWdodDogMTVweDtcbiAgbGluZS1oZWlnaHQ6IDE1cHg7XG4gIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgYmFja2dyb3VuZDogI2VlZTtcbiAgZm9udC1zaXplOiAxNXB4O1xuICAtbW96LWJvcmRlci1yYWRpdXM6IDE1cHg7XG4gIGJvcmRlci1yYWRpdXM6IDE1cHg7XG4gIC13ZWJraXQtdHJhbnNpdGlvbjogb3BhY2l0eSAyMDBtcztcbiAgLW1vei10cmFuc2l0aW9uOiBvcGFjaXR5IDIwMG1zO1xuICB0cmFuc2l0aW9uOiBvcGFjaXR5IDIwMG1zO1xuICBvcGFjaXR5OiAwLjM7XG4gIGNvbG9yOiAjODg4O1xufVxuXG4jbW9jaGEgLnRlc3Q6aG92ZXIgYS5yZXBsYXkge1xuICBvcGFjaXR5OiAxO1xufVxuXG4jbW9jaGEtcmVwb3J0LnBhc3MgLnRlc3QuZmFpbCB7XG4gIGRpc3BsYXk6IG5vbmU7XG59XG5cbiNtb2NoYS1yZXBvcnQuZmFpbCAudGVzdC5wYXNzIHtcbiAgZGlzcGxheTogbm9uZTtcbn1cblxuI21vY2hhLXJlcG9ydC5wZW5kaW5nIC50ZXN0LnBhc3MsXG4jbW9jaGEtcmVwb3J0LnBlbmRpbmcgLnRlc3QuZmFpbCB7XG4gIGRpc3BsYXk6IG5vbmU7XG59XG4jbW9jaGEtcmVwb3J0LnBlbmRpbmcgLnRlc3QucGFzcy5wZW5kaW5nIHtcbiAgZGlzcGxheTogYmxvY2s7XG59XG5cbiNtb2NoYS1lcnJvciB7XG4gIGNvbG9yOiAjYzAwO1xuICBmb250LXNpemU6IDEuNWVtO1xuICBmb250LXdlaWdodDogMTAwO1xuICBsZXR0ZXItc3BhY2luZzogMXB4O1xufVxuXG4jbW9jaGEtc3RhdHMge1xuICBwb3NpdGlvbjogZml4ZWQ7XG4gIHRvcDogMTVweDtcbiAgcmlnaHQ6IDEwcHg7XG4gIGZvbnQtc2l6ZTogMTJweDtcbiAgbWFyZ2luOiAwO1xuICBjb2xvcjogIzg4ODtcbiAgei1pbmRleDogMTtcbn1cblxuI21vY2hhLXN0YXRzIC5wcm9ncmVzcyB7XG4gIGZsb2F0OiByaWdodDtcbiAgcGFkZGluZy10b3A6IDA7XG59XG5cbiNtb2NoYS1zdGF0cyBlbSB7XG4gIGNvbG9yOiBibGFjaztcbn1cblxuI21vY2hhLXN0YXRzIGEge1xuICB0ZXh0LWRlY29yYXRpb246IG5vbmU7XG4gIGNvbG9yOiBpbmhlcml0O1xufVxuXG4jbW9jaGEtc3RhdHMgYTpob3ZlciB7XG4gIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlO1xufVxuXG4jbW9jaGEtc3RhdHMgbGkge1xuICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gIG1hcmdpbjogMCA1cHg7XG4gIGxpc3Qtc3R5bGU6IG5vbmU7XG4gIHBhZGRpbmctdG9wOiAxMXB4O1xufVxuXG4jbW9jaGEtc3RhdHMgY2FudmFzIHtcbiAgd2lkdGg6IDQwcHg7XG4gIGhlaWdodDogNDBweDtcbn1cblxuI21vY2hhIGNvZGUgLmNvbW1lbnQgeyBjb2xvcjogI2RkZDsgfVxuI21vY2hhIGNvZGUgLmluaXQgeyBjb2xvcjogIzJmNmZhZDsgfVxuI21vY2hhIGNvZGUgLnN0cmluZyB7IGNvbG9yOiAjNTg5MGFkOyB9XG4jbW9jaGEgY29kZSAua2V5d29yZCB7IGNvbG9yOiAjOGE2MzQzOyB9XG4jbW9jaGEgY29kZSAubnVtYmVyIHsgY29sb3I6ICMyZjZmYWQ7IH1cblxuQG1lZGlhIHNjcmVlbiBhbmQgKG1heC1kZXZpY2Utd2lkdGg6IDQ4MHB4KSB7XG4gICNtb2NoYSB7XG4gICAgbWFyZ2luOiA2MHB4IDBweDtcbiAgfVxuXG4gICNtb2NoYSAjc3RhdHMge1xuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgfVxufVxuIiwiLy8gQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbi8vXG4vLyBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbi8vIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbi8vIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBwb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4vLyBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzbyBzdWJqZWN0IHRvXG4vLyBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBwb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuKGZ1bmN0aW9uKHNjb3BlKSB7XG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIHBhcnNlKHN0YWNrKSB7XG4gIHZhciByYXdMaW5lcyA9IHN0YWNrLnNwbGl0KCdcXG4nKTtcblxuICB2YXIgc3RhY2t5TGluZXMgPSBjb21wYWN0KHJhd0xpbmVzLm1hcChwYXJzZVN0YWNreUxpbmUpKTtcbiAgaWYgKHN0YWNreUxpbmVzLmxlbmd0aCA9PT0gcmF3TGluZXMubGVuZ3RoKSByZXR1cm4gc3RhY2t5TGluZXM7XG5cbiAgdmFyIHY4TGluZXMgPSBjb21wYWN0KHJhd0xpbmVzLm1hcChwYXJzZVY4TGluZSkpO1xuICBpZiAodjhMaW5lcy5sZW5ndGggPiAwKSByZXR1cm4gdjhMaW5lcztcblxuICB2YXIgZ2Vja29MaW5lcyA9IGNvbXBhY3QocmF3TGluZXMubWFwKHBhcnNlR2Vja29MaW5lKSk7XG4gIGlmIChnZWNrb0xpbmVzLmxlbmd0aCA+IDApIHJldHVybiBnZWNrb0xpbmVzO1xuXG4gIHRocm93IG5ldyBFcnJvcignVW5rbm93biBzdGFjayBmb3JtYXQ6ICcgKyBzdGFjayk7XG59XG5cbi8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL0Vycm9yL1N0YWNrXG52YXIgR0VDS09fTElORSA9IC9eKD86KFteQF0qKUApPyguKj8pOihcXGQrKSg/OjooXFxkKykpPyQvO1xuXG5mdW5jdGlvbiBwYXJzZUdlY2tvTGluZShsaW5lKSB7XG4gIHZhciBtYXRjaCA9IGxpbmUubWF0Y2goR0VDS09fTElORSk7XG4gIGlmICghbWF0Y2gpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIG1ldGhvZDogICBtYXRjaFsxXSB8fCAnJyxcbiAgICBsb2NhdGlvbjogbWF0Y2hbMl0gfHwgJycsXG4gICAgbGluZTogICAgIHBhcnNlSW50KG1hdGNoWzNdKSB8fCAwLFxuICAgIGNvbHVtbjogICBwYXJzZUludChtYXRjaFs0XSkgfHwgMCxcbiAgfTtcbn1cblxuLy8gaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC92OC93aWtpL0phdmFTY3JpcHRTdGFja1RyYWNlQXBpXG52YXIgVjhfT1VURVIxID0gL15cXHMqKGV2YWwgKT9hdCAoLiopIFxcKCguKilcXCkkLztcbnZhciBWOF9PVVRFUjIgPSAvXlxccyphdCgpKCkgKFxcUyspJC87XG52YXIgVjhfSU5ORVIgID0gL15cXCg/KFteXFwoXSspOihcXGQrKTooXFxkKylcXCk/JC87XG5cbmZ1bmN0aW9uIHBhcnNlVjhMaW5lKGxpbmUpIHtcbiAgdmFyIG91dGVyID0gbGluZS5tYXRjaChWOF9PVVRFUjEpIHx8IGxpbmUubWF0Y2goVjhfT1VURVIyKTtcbiAgaWYgKCFvdXRlcikgcmV0dXJuIG51bGw7XG4gIHZhciBpbm5lciA9IG91dGVyWzNdLm1hdGNoKFY4X0lOTkVSKTtcbiAgaWYgKCFpbm5lcikgcmV0dXJuIG51bGw7XG5cbiAgdmFyIG1ldGhvZCA9IG91dGVyWzJdIHx8ICcnO1xuICBpZiAob3V0ZXJbMV0pIG1ldGhvZCA9ICdldmFsIGF0ICcgKyBtZXRob2Q7XG4gIHJldHVybiB7XG4gICAgbWV0aG9kOiAgIG1ldGhvZCxcbiAgICBsb2NhdGlvbjogaW5uZXJbMV0gfHwgJycsXG4gICAgbGluZTogICAgIHBhcnNlSW50KGlubmVyWzJdKSB8fCAwLFxuICAgIGNvbHVtbjogICBwYXJzZUludChpbm5lclszXSkgfHwgMCxcbiAgfTtcbn1cblxuLy8gU3RhY2t5LmZvcm1hdHRpbmcucHJldHR5XG5cbnZhciBTVEFDS1lfTElORSA9IC9eXFxzKiguKykgYXQgKC4rKTooXFxkKyk6KFxcZCspJC87XG5cbmZ1bmN0aW9uIHBhcnNlU3RhY2t5TGluZShsaW5lKSB7XG4gIHZhciBtYXRjaCA9IGxpbmUubWF0Y2goU1RBQ0tZX0xJTkUpO1xuICBpZiAoIW1hdGNoKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBtZXRob2Q6ICAgbWF0Y2hbMV0gfHwgJycsXG4gICAgbG9jYXRpb246IG1hdGNoWzJdIHx8ICcnLFxuICAgIGxpbmU6ICAgICBwYXJzZUludChtYXRjaFszXSkgfHwgMCxcbiAgICBjb2x1bW46ICAgcGFyc2VJbnQobWF0Y2hbNF0pIHx8IDAsXG4gIH07XG59XG5cbi8vIEhlbHBlcnNcblxuZnVuY3Rpb24gY29tcGFjdChhcnJheSkge1xuICB2YXIgcmVzdWx0ID0gW107XG4gIGFycmF5LmZvckVhY2goZnVuY3Rpb24odmFsdWUpIHtcbiAgICBpZiAodmFsdWUpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5zY29wZS5wYXJzZSAgICAgICAgICAgPSBwYXJzZTtcbnNjb3BlLnBhcnNlR2Vja29MaW5lICA9IHBhcnNlR2Vja29MaW5lO1xuc2NvcGUucGFyc2VWOExpbmUgICAgID0gcGFyc2VWOExpbmU7XG5zY29wZS5wYXJzZVN0YWNreUxpbmUgPSBwYXJzZVN0YWNreUxpbmU7XG59KSh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyA/IG1vZHVsZS5leHBvcnRzIDogKHRoaXMuU3RhY2t5ID0gdGhpcy5TdGFja3kgfHwge30pKTtcbiIsIi8vIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vL1xuLy8gVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4vLyBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4vLyBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuLy8gQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc28gc3ViamVjdCB0b1xuLy8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbihmdW5jdGlvbihzY29wZSkge1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgcGFyc2UgPSBzY29wZS5wYXJzZSB8fCByZXF1aXJlKCcuL3BhcnNpbmcnKS5wYXJzZTtcblxuc2NvcGUuZGVmYXVsdHMgPSB7XG4gIC8vIE1ldGhvZHMgYXJlIGFsaWduZWQgdXAgdG8gdGhpcyBtdWNoIHBhZGRpbmcuXG4gIG1heE1ldGhvZFBhZGRpbmc6IDQwLFxuICAvLyBBIHN0cmluZyB0byBwcmVmaXggZWFjaCBsaW5lIHdpdGguXG4gIGluZGVudDogJycsXG4gIC8vIEEgc3RyaW5nIHRvIHNob3cgZm9yIHN0YWNrIGxpbmVzIHRoYXQgYXJlIG1pc3NpbmcgYSBtZXRob2QuXG4gIG1ldGhvZFBsYWNlaG9sZGVyOiAnPHVua25vd24+JyxcbiAgLy8gQSBsaXN0IG9mIFN0cmluZ3MvUmVnRXhwcyB0aGF0IHdpbGwgYmUgc3RyaXBwZWQgZnJvbSBgbG9jYXRpb25gIHZhbHVlcyBvblxuICAvLyBlYWNoIGxpbmUgKHZpYSBgU3RyaW5nI3JlcGxhY2VgKS5cbiAgbG9jYXRpb25TdHJpcDogW10sXG4gIC8vIEEgbGlzdCBvZiBTdHJpbmdzL1JlZ0V4cHMgdGhhdCBpbmRpY2F0ZSB0aGF0IGEgbGluZSBpcyAqbm90KiBpbXBvcnRhbnQsIGFuZFxuICAvLyBzaG91bGQgYmUgc3R5bGVkIGFzIHN1Y2guXG4gIHVuaW1wb3J0YW50TG9jYXRpb246IFtdLFxuICAvLyBBIGZpbHRlciBmdW5jdGlvbiB0byBjb21wbGV0ZWx5IHJlbW92ZSBsaW5lc1xuICBmaWx0ZXI6IGZ1bmN0aW9uKCkgeyByZXR1cm4gZmFsc2U7IH0sXG4gIC8vIHN0eWxlcyBhcmUgZnVuY3Rpb25zIHRoYXQgdGFrZSBhIHN0cmluZyBhbmQgcmV0dXJuIHRoYXQgc3RyaW5nIHdoZW4gc3R5bGVkLlxuICBzdHlsZXM6IHtcbiAgICBtZXRob2Q6ICAgICAgcGFzc3Rocm91Z2gsXG4gICAgbG9jYXRpb246ICAgIHBhc3N0aHJvdWdoLFxuICAgIGxpbmU6ICAgICAgICBwYXNzdGhyb3VnaCxcbiAgICBjb2x1bW46ICAgICAgcGFzc3Rocm91Z2gsXG4gICAgdW5pbXBvcnRhbnQ6IHBhc3N0aHJvdWdoLFxuICB9LFxufTtcblxuLy8gRm9yIFN0YWNreS1pbi1Ob2RlLCB3ZSBkZWZhdWx0IHRvIGNvbG9yZWQgc3RhY2tzLlxuaWYgKHR5cGVvZiByZXF1aXJlID09PSAnZnVuY3Rpb24nKSB7XG4gIHZhciBjaGFsayA9IHJlcXVpcmUoJ2NoYWxrJyk7XG5cbiAgc2NvcGUuZGVmYXVsdHMuc3R5bGVzID0ge1xuICAgIG1ldGhvZDogICAgICBjaGFsay5tYWdlbnRhLFxuICAgIGxvY2F0aW9uOiAgICBjaGFsay5ibHVlLFxuICAgIGxpbmU6ICAgICAgICBjaGFsay5jeWFuLFxuICAgIGNvbHVtbjogICAgICBjaGFsay5jeWFuLFxuICAgIHVuaW1wb3J0YW50OiBjaGFsay5kaW0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHByZXR0eShzdGFja09yUGFyc2VkLCBvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBtZXJnZURlZmF1bHRzKG9wdGlvbnMgfHwge30sIHNjb3BlLmRlZmF1bHRzKTtcbiAgdmFyIGxpbmVzID0gQXJyYXkuaXNBcnJheShzdGFja09yUGFyc2VkKSA/IHN0YWNrT3JQYXJzZWQgOiBwYXJzZShzdGFja09yUGFyc2VkKTtcbiAgbGluZXMgPSBjbGVhbihsaW5lcywgb3B0aW9ucyk7XG5cbiAgdmFyIHBhZFNpemUgPSBtZXRob2RQYWRkaW5nKGxpbmVzLCBvcHRpb25zKTtcbiAgdmFyIHBhcnRzID0gbGluZXMubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICB2YXIgbWV0aG9kICAgPSBsaW5lLm1ldGhvZCB8fCBvcHRpb25zLm1ldGhvZFBsYWNlaG9sZGVyO1xuICAgIHZhciBwYWQgICAgICA9IG9wdGlvbnMuaW5kZW50ICsgcGFkZGluZyhwYWRTaXplIC0gbWV0aG9kLmxlbmd0aCk7XG4gICAgdmFyIGxvY2F0aW9uID0gW1xuICAgICAgb3B0aW9ucy5zdHlsZXMubG9jYXRpb24obGluZS5sb2NhdGlvbiksXG4gICAgICBvcHRpb25zLnN0eWxlcy5saW5lKGxpbmUubGluZSksXG4gICAgICBvcHRpb25zLnN0eWxlcy5jb2x1bW4obGluZS5jb2x1bW4pLFxuICAgIF0uam9pbignOicpO1xuXG4gICAgdmFyIHRleHQgPSBwYWQgKyBvcHRpb25zLnN0eWxlcy5tZXRob2QobWV0aG9kKSArICcgYXQgJyArIGxvY2F0aW9uO1xuICAgIGlmICghbGluZS5pbXBvcnRhbnQpIHtcbiAgICAgIHRleHQgPSBvcHRpb25zLnN0eWxlcy51bmltcG9ydGFudCh0ZXh0KTtcbiAgICB9XG4gICAgcmV0dXJuIHRleHQ7XG4gIH0pO1xuXG4gIHJldHVybiBwYXJ0cy5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gY2xlYW4obGluZXMsIG9wdGlvbnMpIHtcbiAgdmFyIHJlc3VsdCA9IFtdO1xuICBmb3IgKHZhciBpID0gMCwgbGluZTsgbGluZSA9IGxpbmVzW2ldOyBpKyspIHtcbiAgICBpZiAob3B0aW9ucy5maWx0ZXIobGluZSkpIGNvbnRpbnVlO1xuICAgIGxpbmUubG9jYXRpb24gID0gY2xlYW5Mb2NhdGlvbihsaW5lLmxvY2F0aW9uLCBvcHRpb25zKTtcbiAgICBsaW5lLmltcG9ydGFudCA9IGlzSW1wb3J0YW50KGxpbmUsIG9wdGlvbnMpO1xuICAgIHJlc3VsdC5wdXNoKGxpbmUpO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLy8gVXRpbGl0eVxuXG5mdW5jdGlvbiBwYXNzdGhyb3VnaChzdHJpbmcpIHtcbiAgcmV0dXJuIHN0cmluZztcbn1cblxuZnVuY3Rpb24gbWVyZ2VEZWZhdWx0cyhvcHRpb25zLCBkZWZhdWx0cykge1xuICB2YXIgcmVzdWx0ID0gT2JqZWN0LmNyZWF0ZShkZWZhdWx0cyk7XG4gIE9iamVjdC5rZXlzKG9wdGlvbnMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgdmFyIHZhbHVlID0gb3B0aW9uc1trZXldO1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgdmFsdWUgPSBtZXJnZURlZmF1bHRzKHZhbHVlLCBkZWZhdWx0c1trZXldKTtcbiAgICB9XG4gICAgcmVzdWx0W2tleV0gPSB2YWx1ZTtcbiAgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIG1ldGhvZFBhZGRpbmcobGluZXMsIG9wdGlvbnMpIHtcbiAgdmFyIHNpemUgPSBvcHRpb25zLm1ldGhvZFBsYWNlaG9sZGVyLmxlbmd0aDtcbiAgZm9yICh2YXIgaSA9IDAsIGxpbmU7IGxpbmUgPSBsaW5lc1tpXTsgaSsrKSB7XG4gICAgc2l6ZSA9IE1hdGgubWluKG9wdGlvbnMubWF4TWV0aG9kUGFkZGluZywgTWF0aC5tYXgoc2l6ZSwgbGluZS5tZXRob2QubGVuZ3RoKSk7XG4gIH1cbiAgcmV0dXJuIHNpemU7XG59XG5cbmZ1bmN0aW9uIHBhZGRpbmcobGVuZ3RoKSB7XG4gIHZhciByZXN1bHQgPSAnJztcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHJlc3VsdCA9IHJlc3VsdCArICcgJztcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBjbGVhbkxvY2F0aW9uKGxvY2F0aW9uLCBvcHRpb25zKSB7XG4gIGlmIChvcHRpb25zLmxvY2F0aW9uU3RyaXApIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbWF0Y2hlcjsgbWF0Y2hlciA9IG9wdGlvbnMubG9jYXRpb25TdHJpcFtpXTsgaSsrKSB7XG4gICAgICBsb2NhdGlvbiA9IGxvY2F0aW9uLnJlcGxhY2UobWF0Y2hlciwgJycpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBsb2NhdGlvbjtcbn1cblxuZnVuY3Rpb24gaXNJbXBvcnRhbnQobGluZSwgb3B0aW9ucykge1xuICBpZiAob3B0aW9ucy51bmltcG9ydGFudExvY2F0aW9uKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIG1hdGNoZXI7IG1hdGNoZXIgPSBvcHRpb25zLnVuaW1wb3J0YW50TG9jYXRpb25baV07IGkrKykge1xuICAgICAgaWYgKGxpbmUubG9jYXRpb24ubWF0Y2gobWF0Y2hlcikpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxuc2NvcGUuY2xlYW4gID0gY2xlYW47XG5zY29wZS5wcmV0dHkgPSBwcmV0dHk7XG59KSh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyA/IG1vZHVsZS5leHBvcnRzIDogKHRoaXMuU3RhY2t5ID0gdGhpcy5TdGFja3kgfHwge30pKTtcblxuIiwiLy8gQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbi8vXG4vLyBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbi8vIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbi8vIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBwb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4vLyBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzbyBzdWJqZWN0IHRvXG4vLyBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBwb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuKGZ1bmN0aW9uKHNjb3BlKSB7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBwYXJzZSAgPSBzY29wZS5wYXJzZSAgfHwgcmVxdWlyZSgnLi9wYXJzaW5nJykucGFyc2U7XG52YXIgcHJldHR5ID0gc2NvcGUucHJldHR5IHx8IHJlcXVpcmUoJy4vZm9ybWF0dGluZycpLnByZXR0eTtcblxuZnVuY3Rpb24gbm9ybWFsaXplKGVycm9yLCBwcmV0dHlPcHRpb25zKSB7XG4gIGlmIChlcnJvci5wYXJzZWRTdGFjaykgcmV0dXJuIGVycm9yO1xuICB2YXIgbWVzc2FnZSA9IGVycm9yLm1lc3NhZ2UgfHwgZXJyb3IuZGVzY3JpcHRpb24gfHwgZXJyb3IgfHwgJzx1bmtub3duIGVycm9yPic7XG4gIHZhciBwYXJzZWRTdGFjayA9IFtdO1xuICB0cnkge1xuICAgIHBhcnNlZFN0YWNrID0gcGFyc2UoZXJyb3Iuc3RhY2sgfHwgZXJyb3IudG9TdHJpbmcoKSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gQWggd2VsbC5cbiAgfVxuXG4gIGlmIChwYXJzZWRTdGFjay5sZW5ndGggPT09IDAgJiYgZXJyb3IuZmlsZU5hbWUpIHtcbiAgICBwYXJzZWRTdGFjay5wdXNoKHtcbiAgICAgIG1ldGhvZDogICAnJyxcbiAgICAgIGxvY2F0aW9uOiBlcnJvci5maWxlTmFtZSxcbiAgICAgIGxpbmU6ICAgICBlcnJvci5saW5lTnVtYmVyLFxuICAgICAgY29sdW1uOiAgIGVycm9yLmNvbHVtbk51bWJlcixcbiAgICB9KTtcbiAgfVxuXG4gIHZhciBwcmV0dHlTdGFjayA9IG1lc3NhZ2U7XG4gIGlmIChwYXJzZWRTdGFjay5sZW5ndGggPiAwKSB7XG4gICAgcHJldHR5U3RhY2sgPSBwcmV0dHlTdGFjayArICdcXG4nICsgcHJldHR5KHBhcnNlZFN0YWNrLCBwcmV0dHlPcHRpb25zKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgbWVzc2FnZTogICAgIG1lc3NhZ2UsXG4gICAgc3RhY2s6ICAgICAgIHByZXR0eVN0YWNrLFxuICAgIHBhcnNlZFN0YWNrOiBwYXJzZWRTdGFjayxcbiAgfTtcbn1cblxuc2NvcGUubm9ybWFsaXplID0gbm9ybWFsaXplO1xufSkodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgPyBtb2R1bGUuZXhwb3J0cyA6ICh0aGlzLlN0YWNreSA9IHRoaXMuU3RhY2t5IHx8IHt9KSk7XG5cbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuLyoqXG4gKiBAZmlsZW92ZXJ2aWV3XG4gKlxuICogWW91ciBlbnRyeSBwb2ludCBpbnRvIGB3ZWItY29tcG9uZW50LXRlc3RlcmAncyBlbnZpcm9ubWVudCBhbmQgY29uZmlndXJhdGlvbi5cbiAqL1xuKGZ1bmN0aW9uKCkge1xuXG52YXIgV0NUID0gd2luZG93LldDVCA9IHtcbiAgcmVwb3J0ZXJzOiB7fSxcbn07XG5cbi8vIENvbmZpZ3VyYXRpb25cblxuLyoqIEJ5IGRlZmF1bHQsIHdlIHdhaXQgZm9yIGFueSB3ZWIgY29tcG9uZW50IGZyYW1ld29ya3MgdG8gbG9hZC4gKi9cbldDVC53YWl0Rm9yRnJhbWV3b3JrcyA9IHRydWU7XG5cbi8qKiBIb3cgbWFueSBgLmh0bWxgIHN1aXRlcyB0aGF0IGNhbiBiZSBjb25jdXJyZW50bHkgbG9hZGVkICYgcnVuLiAqL1xuV0NULm51bUNvbmN1cnJlbnRTdWl0ZXMgPSAxO1xuXG4vLyBIZWxwZXJzXG5cbi8vIEV2YWx1YXRlZCBpbiBtb2NoYS9ydW4uanMuXG5XQ1QuX3N1aXRlc1RvTG9hZCA9IFtdO1xuV0NULl9kZXBlbmRlbmNpZXMgPSBbXTtcblxuLy8gVXNlZCB0byBzaGFyZSBkYXRhIGJldHdlZW4gc3ViU3VpdGVzIG9uIGNsaWVudCBhbmQgcmVwb3J0ZXJzIG9uIHNlcnZlclxuV0NULnNoYXJlID0ge307XG5cbi8qKlxuICogTG9hZHMgc3VpdGVzIG9mIHRlc3RzLCBzdXBwb3J0aW5nIGAuanNgIGFzIHdlbGwgYXMgYC5odG1sYCBmaWxlcy5cbiAqXG4gKiBAcGFyYW0geyFBcnJheS48c3RyaW5nPn0gZmlsZXMgVGhlIGZpbGVzIHRvIGxvYWQuXG4gKi9cbldDVC5sb2FkU3VpdGVzID0gZnVuY3Rpb24gbG9hZFN1aXRlcyhmaWxlcykge1xuICBmaWxlcy5mb3JFYWNoKGZ1bmN0aW9uKGZpbGUpIHtcbiAgICBpZiAoZmlsZS5zbGljZSgtMykgPT09ICcuanMnKSB7XG4gICAgICBXQ1QuX2RlcGVuZGVuY2llcy5wdXNoKGZpbGUpO1xuICAgIH0gZWxzZSBpZiAoZmlsZS5zbGljZSgtNSkgPT09ICcuaHRtbCcpIHtcbiAgICAgIFdDVC5fc3VpdGVzVG9Mb2FkLnB1c2goZmlsZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biByZXNvdXJjZSB0eXBlOiAnICsgZmlsZSk7XG4gICAgfVxuICB9KTtcbn07XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuV0NULnV0aWwgPSB7fTtcblxuLyoqXG4gKiBAcGFyYW0ge2Z1bmN0aW9uKCl9IGNhbGxiYWNrIEEgZnVuY3Rpb24gdG8gY2FsbCB3aGVuIHRoZSBhY3RpdmUgd2ViIGNvbXBvbmVudFxuICogICAgIGZyYW1ld29ya3MgaGF2ZSBsb2FkZWQuXG4gKi9cbldDVC51dGlsLndoZW5GcmFtZXdvcmtzUmVhZHkgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICBXQ1QudXRpbC5kZWJ1Zyh3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUsICdXQ1QudXRpbC53aGVuRnJhbWV3b3Jrc1JlYWR5Jyk7XG4gIHZhciBkb25lID0gZnVuY3Rpb24oKSB7XG4gICAgV0NULnV0aWwuZGVidWcod2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLCAnV0NULnV0aWwud2hlbkZyYW1ld29ya3NSZWFkeSBkb25lJyk7XG4gICAgY2FsbGJhY2soKTtcbiAgfTtcblxuICBmdW5jdGlvbiBpbXBvcnRzUmVhZHkoKSB7XG4gICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0hUTUxJbXBvcnRzTG9hZGVkJywgaW1wb3J0c1JlYWR5KTtcbiAgICBXQ1QudXRpbC5kZWJ1Zyh3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUsICdIVE1MSW1wb3J0c0xvYWRlZCcpO1xuXG4gICAgaWYgKHdpbmRvdy5Qb2x5bWVyICYmIFBvbHltZXIud2hlblJlYWR5KSB7XG4gICAgICBQb2x5bWVyLndoZW5SZWFkeShmdW5jdGlvbigpIHtcbiAgICAgICAgV0NULnV0aWwuZGVidWcod2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLCAncG9seW1lci1yZWFkeScpO1xuICAgICAgICBkb25lKCk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgZG9uZSgpO1xuICAgIH1cbiAgfVxuXG4gIC8vIEFsbCBvdXIgc3VwcG9ydGVkIGZyYW1ld29yayBjb25maWd1cmF0aW9ucyBkZXBlbmQgb24gaW1wb3J0cy5cbiAgaWYgKCF3aW5kb3cuSFRNTEltcG9ydHMpIHtcbiAgICBkb25lKCk7XG4gIH0gZWxzZSBpZiAoSFRNTEltcG9ydHMucmVhZHkpIHtcbiAgICBpbXBvcnRzUmVhZHkoKTtcbiAgfSBlbHNlIHtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignSFRNTEltcG9ydHNMb2FkZWQnLCBpbXBvcnRzUmVhZHkpO1xuICB9XG59O1xuXG4vKipcbiAqIEBwYXJhbSB7bnVtYmVyfSBjb3VudFxuICogQHBhcmFtIHtzdHJpbmd9IGtpbmRcbiAqIEByZXR1cm4ge3N0cmluZ30gJzxjb3VudD4gPGtpbmQ+IHRlc3RzJyBvciAnPGNvdW50PiA8a2luZD4gdGVzdCcuXG4gKi9cbldDVC51dGlsLnBsdXJhbGl6ZWRTdGF0ID0gZnVuY3Rpb24gcGx1cmFsaXplZFN0YXQoY291bnQsIGtpbmQpIHtcbiAgaWYgKGNvdW50ID09PSAxKSB7XG4gICAgcmV0dXJuIGNvdW50ICsgJyAnICsga2luZCArICcgdGVzdCc7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGNvdW50ICsgJyAnICsga2luZCArICcgdGVzdHMnO1xuICB9XG59O1xuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBwYXRoIFRoZSBVUkkgb2YgdGhlIHNjcmlwdCB0byBsb2FkLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gZG9uZVxuICovXG5XQ1QudXRpbC5sb2FkU2NyaXB0ID0gZnVuY3Rpb24gbG9hZFNjcmlwdChwYXRoLCBkb25lKSB7XG4gIHZhciBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgc2NyaXB0LnNyYyA9IHBhdGggKyAnPycgKyBNYXRoLnJhbmRvbSgpO1xuICBzY3JpcHQub25sb2FkID0gZG9uZS5iaW5kKG51bGwsIG51bGwpO1xuICBzY3JpcHQub25lcnJvciA9IGRvbmUuYmluZChudWxsLCAnRmFpbGVkIHRvIGxvYWQgc2NyaXB0ICcgKyBzY3JpcHQuc3JjKTtcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzY3JpcHQpO1xufTtcblxuLyoqXG4gKiBAcGFyYW0gey4uLip9IHZhcl9hcmdzIExvZ3MgdmFsdWVzIHRvIHRoZSBjb25zb2xlIHdoZW4gYFdDVC5kZWJ1Z2AgaXMgdHJ1ZS5cbiAqL1xuV0NULnV0aWwuZGVidWcgPSBmdW5jdGlvbiBkZWJ1Zyh2YXJfYXJncykge1xuICBpZiAoIVdDVC5kZWJ1ZykgcmV0dXJuO1xuICBjb25zb2xlLmRlYnVnLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7XG59O1xuXG4vLyBVUkwgUHJvY2Vzc2luZ1xuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBvcHRfcXVlcnkgQSBxdWVyeSBzdHJpbmcgdG8gcGFyc2UuXG4gKiBAcmV0dXJuIHshT2JqZWN0LjxzdHJpbmcsICFBcnJheS48c3RyaW5nPj59IEFsbCBwYXJhbXMgb24gdGhlIFVSTCdzIHF1ZXJ5LlxuICovXG5XQ1QudXRpbC5nZXRQYXJhbXMgPSBmdW5jdGlvbiBnZXRQYXJhbXMob3B0X3F1ZXJ5KSB7XG4gIHZhciBxdWVyeSA9IG9wdF9xdWVyeSB8fCB3aW5kb3cubG9jYXRpb24uc2VhcmNoO1xuICBpZiAocXVlcnkuc3Vic3RyaW5nKDAsIDEpID09PSAnPycpIHtcbiAgICBxdWVyeSA9IHF1ZXJ5LnN1YnN0cmluZygxKTtcbiAgfVxuICAvLyBweXRob24ncyBTaW1wbGVIVFRQU2VydmVyIHRhY2tzIGEgYC9gIG9uIHRoZSBlbmQgb2YgcXVlcnkgc3RyaW5ncyA6KFxuICBpZiAocXVlcnkuc2xpY2UoLTEpID09PSAnLycpIHtcbiAgICBxdWVyeSA9IHF1ZXJ5LnN1YnN0cmluZygwLCBxdWVyeS5sZW5ndGggLSAxKTtcbiAgfVxuICBpZiAocXVlcnkgPT09ICcnKSByZXR1cm4ge307XG5cbiAgdmFyIHJlc3VsdCA9IHt9O1xuICBxdWVyeS5zcGxpdCgnJicpLmZvckVhY2goZnVuY3Rpb24ocGFydCkge1xuICAgIHZhciBwYWlyID0gcGFydC5zcGxpdCgnPScpO1xuICAgIGlmIChwYWlyLmxlbmd0aCAhPT0gMikge1xuICAgICAgY29uc29sZS53YXJuKCdJbnZhbGlkIFVSTCBxdWVyeSBwYXJ0OicsIHBhcnQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIga2V5ICAgPSBkZWNvZGVVUklDb21wb25lbnQocGFpclswXSk7XG4gICAgdmFyIHZhbHVlID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhaXJbMV0pO1xuXG4gICAgaWYgKCFyZXN1bHRba2V5XSkge1xuICAgICAgcmVzdWx0W2tleV0gPSBbXTtcbiAgICB9XG4gICAgcmVzdWx0W2tleV0ucHVzaCh2YWx1ZSk7XG4gIH0pO1xuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBwYXJhbSBUaGUgcGFyYW0gdG8gcmV0dXJuIGEgdmFsdWUgZm9yLlxuICogQHJldHVybiB7P3N0cmluZ30gVGhlIGZpcnN0IHZhbHVlIGZvciBgcGFyYW1gLCBpZiBmb3VuZC5cbiAqL1xuV0NULnV0aWwuZ2V0UGFyYW0gPSBmdW5jdGlvbiBnZXRQYXJhbShwYXJhbSkge1xuICB2YXIgcGFyYW1zID0gV0NULnV0aWwuZ2V0UGFyYW1zKCk7XG4gIHJldHVybiBwYXJhbXNbcGFyYW1dID8gcGFyYW1zW3BhcmFtXVswXSA6IG51bGw7XG59O1xuXG4vKipcbiAqIEBwYXJhbSB7IU9iamVjdC48c3RyaW5nLCAhQXJyYXkuPHN0cmluZz4+fSBwYXJhbXNcbiAqIEByZXR1cm4ge3N0cmluZ30gYHBhcmFtc2AgZW5jb2RlZCBhcyBhIFVSSSBxdWVyeS5cbiAqL1xuV0NULnV0aWwucGFyYW1zVG9RdWVyeSA9IGZ1bmN0aW9uIHBhcmFtc1RvUXVlcnkocGFyYW1zKSB7XG4gIHZhciBwYWlycyA9IFtdO1xuICBPYmplY3Qua2V5cyhwYXJhbXMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgcGFyYW1zW2tleV0uZm9yRWFjaChmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgcGFpcnMucHVzaChlbmNvZGVVUklDb21wb25lbnQoa2V5KSArICc9JyArIGVuY29kZVVSSUNvbXBvbmVudCh2YWx1ZSkpO1xuICAgIH0pO1xuICB9KTtcbiAgcmV0dXJuICc/JyArIHBhaXJzLmpvaW4oJyYnKTtcbn07XG5cbi8qKiBAcmV0dXJuIHtzdHJpbmd9IGBsb2NhdGlvbmAgcmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgd2luZG93LiAqL1xuV0NULnV0aWwucmVsYXRpdmVMb2NhdGlvbiA9IGZ1bmN0aW9uIHJlbGF0aXZlTG9jYXRpb24obG9jYXRpb24pIHtcbiAgdmFyIHBhdGggPSBsb2NhdGlvbi5wYXRobmFtZTtcbiAgdmFyIGJhc2VQYXRoID0gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLm1hdGNoKC9eLipcXC8vKVswXTtcbiAgaWYgKHBhdGguaW5kZXhPZihiYXNlUGF0aCkgPT09IDApIHtcbiAgICBwYXRoID0gcGF0aC5zdWJzdHJpbmcoYmFzZVBhdGgubGVuZ3RoKTtcbiAgfVxuICByZXR1cm4gcGF0aDtcbn07XG5cbi8qKlxuICogTGlrZSBgYXN5bmMucGFyYWxsZWxMaW1pdGAsIGJ1dCBvdXIgb3duIHNvIHRoYXQgd2UgZG9uJ3QgZm9yY2UgYSBkZXBlbmRlbmN5XG4gKiBvbiBkb3duc3RyZWFtIGNvZGUuXG4gKlxuICogQHBhcmFtIHshQXJyYXkuPGZ1bmN0aW9uKGZ1bmN0aW9uKCopKT59IHJ1bm5lcnMgUnVubmVycyB0aGF0IGNhbGwgdGhlaXIgZ2l2ZW5cbiAqICAgICBOb2RlLXN0eWxlIGNhbGxiYWNrIHdoZW4gZG9uZS5cbiAqIEBwYXJhbSB7bnVtYmVyfGZ1bmN0aW9uKCopfSBsaW1pdCBNYXhpbXVtIG51bWJlciBvZiBjb25jdXJyZW50IHJ1bm5lcnMuXG4gKiAgICAgKG9wdGlvbmFsKS5cbiAqIEBwYXJhbSB7P2Z1bmN0aW9uKCopfSBkb25lIENhbGxiYWNrIHRoYXQgc2hvdWxkIGJlIHRyaWdnZXJlZCBvbmNlIGFsbCBydW5uZXJzXG4gKiAgICAgaGF2ZSBjb21wbGV0ZWQsIG9yIGVuY291bnRlcmVkIGFuIGVycm9yLlxuICovXG5XQ1QudXRpbC5wYXJhbGxlbCA9IGZ1bmN0aW9uIHBhcmFsbGVsKHJ1bm5lcnMsIGxpbWl0LCBkb25lKSB7XG4gIGlmICh0eXBlb2YgbGltaXQgIT09ICdudW1iZXInKSB7XG4gICAgZG9uZSAgPSBsaW1pdDtcbiAgICBsaW1pdCA9IDA7XG4gIH1cbiAgaWYgKCFydW5uZXJzLmxlbmd0aCkgcmV0dXJuIGRvbmUoKTtcblxuICB2YXIgY2FsbGVkICAgID0gZmFsc2U7XG4gIHZhciB0b3RhbCAgICAgPSBydW5uZXJzLmxlbmd0aDtcbiAgdmFyIG51bUFjdGl2ZSA9IDA7XG4gIHZhciBudW1Eb25lICAgPSAwO1xuXG4gIGZ1bmN0aW9uIHJ1bm5lckRvbmUoZXJyb3IpIHtcbiAgICBpZiAoY2FsbGVkKSByZXR1cm47XG4gICAgbnVtRG9uZSA9IG51bURvbmUgKyAxO1xuICAgIG51bUFjdGl2ZSA9IG51bUFjdGl2ZSAtIDE7XG5cbiAgICBpZiAoZXJyb3IgfHwgbnVtRG9uZSA+PSB0b3RhbCkge1xuICAgICAgY2FsbGVkID0gdHJ1ZTtcbiAgICAgIGRvbmUoZXJyb3IpO1xuICAgIH0gZWxzZSB7XG4gICAgICBydW5PbmUoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBydW5PbmUoKSB7XG4gICAgaWYgKGxpbWl0ICYmIG51bUFjdGl2ZSA+PSBsaW1pdCkgcmV0dXJuO1xuICAgIGlmICghcnVubmVycy5sZW5ndGgpIHJldHVybjtcbiAgICBudW1BY3RpdmUgPSBudW1BY3RpdmUgKyAxO1xuICAgIHJ1bm5lcnMuc2hpZnQoKShydW5uZXJEb25lKTtcbiAgfVxuICBydW5uZXJzLmZvckVhY2gocnVuT25lKTtcbn07XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuV0NULkNMSVNvY2tldCA9IENMSVNvY2tldDtcblxudmFyIFNPQ0tFVElPX0VORFBPSU5UID0gd2luZG93LmxvY2F0aW9uLnByb3RvY29sICsgJy8vJyArIHdpbmRvdy5sb2NhdGlvbi5ob3N0O1xudmFyIFNPQ0tFVElPX0xJQlJBUlkgID0gU09DS0VUSU9fRU5EUE9JTlQgKyAnL3NvY2tldC5pby9zb2NrZXQuaW8uanMnO1xuXG4vKipcbiAqIEEgc29ja2V0IGZvciBjb21tdW5pY2F0aW9uIGJldHdlZW4gdGhlIENMSSBhbmQgYnJvd3NlciBydW5uZXJzLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBicm93c2VySWQgQW4gSUQgZ2VuZXJhdGVkIGJ5IHRoZSBDTEkgcnVubmVyLlxuICogQHBhcmFtIHshaW8uU29ja2V0fSBzb2NrZXQgVGhlIHNvY2tldC5pbyBgU29ja2V0YCB0byBjb21tdW5pY2F0ZSBvdmVyLlxuICovXG5mdW5jdGlvbiBDTElTb2NrZXQoYnJvd3NlcklkLCBzb2NrZXQpIHtcbiAgdGhpcy5icm93c2VySWQgPSBicm93c2VySWQ7XG4gIHRoaXMuc29ja2V0ICAgID0gc29ja2V0O1xufVxuXG4vKipcbiAqIEBwYXJhbSB7IU1vY2hhLlJ1bm5lcn0gcnVubmVyIFRoZSBNb2NoYSBgUnVubmVyYCB0byBvYnNlcnZlLCByZXBvcnRpbmdcbiAqICAgICBpbnRlcmVzdGluZyBldmVudHMgYmFjayB0byB0aGUgQ0xJIHJ1bm5lci5cbiAqL1xuQ0xJU29ja2V0LnByb3RvdHlwZS5vYnNlcnZlID0gZnVuY3Rpb24gb2JzZXJ2ZShydW5uZXIpIHtcbiAgdGhpcy5lbWl0RXZlbnQoJ2Jyb3dzZXItc3RhcnQnLCB7XG4gICAgdXJsOiB3aW5kb3cubG9jYXRpb24udG9TdHJpbmcoKSxcbiAgfSk7XG5cbiAgLy8gV2Ugb25seSBlbWl0IGEgc3Vic2V0IG9mIGV2ZW50cyB0aGF0IHdlIGNhcmUgYWJvdXQsIGFuZCBmb2xsb3cgYSBtb3JlXG4gIC8vIGdlbmVyYWwgZXZlbnQgZm9ybWF0IHRoYXQgaXMgaG9wZWZ1bGx5IGFwcGxpY2FibGUgdG8gdGVzdCBydW5uZXJzIGJleW9uZFxuICAvLyBtb2NoYS5cbiAgLy9cbiAgLy8gRm9yIGFsbCBwb3NzaWJsZSBtb2NoYSBldmVudHMsIHNlZTpcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3Zpc2lvbm1lZGlhL21vY2hhL2Jsb2IvbWFzdGVyL2xpYi9ydW5uZXIuanMjTDM2XG4gIHJ1bm5lci5vbigndGVzdCcsIGZ1bmN0aW9uKHRlc3QpIHtcbiAgICB0aGlzLmVtaXRFdmVudCgndGVzdC1zdGFydCcsIHt0ZXN0OiBnZXRUaXRsZXModGVzdCl9KTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24odGVzdCkge1xuICAgIHRoaXMuZW1pdEV2ZW50KCd0ZXN0LWVuZCcsIHtcbiAgICAgIHN0YXRlOiAgICBnZXRTdGF0ZSh0ZXN0KSxcbiAgICAgIHRlc3Q6ICAgICBnZXRUaXRsZXModGVzdCksXG4gICAgICBkdXJhdGlvbjogdGVzdC5kdXJhdGlvbixcbiAgICAgIGVycm9yOiAgICB0ZXN0LmVycixcbiAgICB9KTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ3N1YlN1aXRlIHN0YXJ0JywgZnVuY3Rpb24oc3ViU3VpdGUpIHtcbiAgICB0aGlzLmVtaXRFdmVudCgnc3ViLXN1aXRlLXN0YXJ0Jywgc3ViU3VpdGUuc2hhcmUpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIHJ1bm5lci5vbignc3ViU3VpdGUgZW5kJywgZnVuY3Rpb24oc3ViU3VpdGUpIHtcbiAgICB0aGlzLmVtaXRFdmVudCgnc3ViLXN1aXRlLWVuZCcsIHN1YlN1aXRlLnNoYXJlKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuZW1pdEV2ZW50KCdicm93c2VyLWVuZCcpO1xuICB9LmJpbmQodGhpcykpO1xufTtcblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gZXZlbnQgVGhlIG5hbWUgb2YgdGhlIGV2ZW50IHRvIGZpcmUuXG4gKiBAcGFyYW0geyp9IGRhdGEgQWRkaXRpb25hbCBkYXRhIHRvIHBhc3Mgd2l0aCB0aGUgZXZlbnQuXG4gKi9cbkNMSVNvY2tldC5wcm90b3R5cGUuZW1pdEV2ZW50ID0gZnVuY3Rpb24gZW1pdEV2ZW50KGV2ZW50LCBkYXRhKSB7XG4gIHRoaXMuc29ja2V0LmVtaXQoJ2NsaWVudC1ldmVudCcsIHtcbiAgICBicm93c2VySWQ6IHRoaXMuYnJvd3NlcklkLFxuICAgIGV2ZW50OiAgICAgZXZlbnQsXG4gICAgZGF0YTogICAgICBkYXRhLFxuICB9KTtcbn07XG5cbi8qKlxuICogQnVpbGRzIGEgYENMSVNvY2tldGAgaWYgd2UgYXJlIHdpdGhpbiBhIENMSS1ydW4gZW52aXJvbm1lbnQ7IHNob3J0LWNpcmN1aXRzXG4gKiBvdGhlcndpc2UuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbigqLCBDTElTb2NrZXQpfSBkb25lIE5vZGUtc3R5bGUgY2FsbGJhY2suXG4gKi9cbkNMSVNvY2tldC5pbml0ID0gZnVuY3Rpb24gaW5pdChkb25lKSB7XG4gIHZhciBicm93c2VySWQgPSBXQ1QudXRpbC5nZXRQYXJhbSgnY2xpX2Jyb3dzZXJfaWQnKTtcbiAgaWYgKCFicm93c2VySWQpIHJldHVybiBkb25lKCk7XG5cbiAgV0NULnV0aWwubG9hZFNjcmlwdChTT0NLRVRJT19MSUJSQVJZLCBmdW5jdGlvbihlcnJvcikge1xuICAgIGlmIChlcnJvcikgcmV0dXJuIGRvbmUoZXJyb3IpO1xuXG4gICAgdmFyIHNvY2tldCA9IGlvKFNPQ0tFVElPX0VORFBPSU5UKTtcbiAgICBzb2NrZXQub24oJ2Vycm9yJywgZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgIHNvY2tldC5vZmYoKTtcbiAgICAgIGRvbmUoZXJyb3IpO1xuICAgIH0pO1xuXG4gICAgc29ja2V0Lm9uKCdjb25uZWN0JywgZnVuY3Rpb24oKSB7XG4gICAgICBzb2NrZXQub2ZmKCk7XG4gICAgICBkb25lKG51bGwsIG5ldyBDTElTb2NrZXQoYnJvd3NlcklkLCBzb2NrZXQpKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vLyBNaXNjIFV0aWxpdHlcblxuLyoqXG4gKiBAcGFyYW0geyFNb2NoYS5SdW5uYWJsZX0gcnVubmFibGUgVGhlIHRlc3Qgb3Igc3VpdGUgdG8gZXh0cmFjdCB0aXRsZXMgZnJvbS5cbiAqIEByZXR1cm4geyFBcnJheS48c3RyaW5nPn0gVGhlIHRpdGxlcyBvZiB0aGUgcnVubmFibGUgYW5kIGl0cyBwYXJlbnRzLlxuICovXG5mdW5jdGlvbiBnZXRUaXRsZXMocnVubmFibGUpIHtcbiAgdmFyIHRpdGxlcyA9IFtdO1xuICB3aGlsZSAocnVubmFibGUgJiYgIXJ1bm5hYmxlLnJvb3QgJiYgcnVubmFibGUudGl0bGUpIHtcbiAgICB0aXRsZXMudW5zaGlmdChydW5uYWJsZS50aXRsZSk7XG4gICAgcnVubmFibGUgPSBydW5uYWJsZS5wYXJlbnQ7XG4gIH1cbiAgcmV0dXJuIHRpdGxlcztcbn1cblxuLyoqXG4gKiBAcGFyYW0geyFNb2NoYS5SdW5uYWJsZX0gcnVubmFibGVcbiAqIEByZXR1cm4ge3N0cmluZ31cbiAqL1xuZnVuY3Rpb24gZ2V0U3RhdGUocnVubmFibGUpIHtcbiAgaWYgKHJ1bm5hYmxlLnN0YXRlID09PSAncGFzc2VkJykge1xuICAgIHJldHVybiAncGFzc2luZyc7XG4gIH0gZWxzZSBpZiAocnVubmFibGUuc3RhdGUgPT0gJ2ZhaWxlZCcpIHtcbiAgICByZXR1cm4gJ2ZhaWxpbmcnO1xuICB9IGVsc2UgaWYgKHJ1bm5hYmxlLnBlbmRpbmcpIHtcbiAgICByZXR1cm4gJ3BlbmRpbmcnO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiAndW5rbm93bic7XG4gIH1cbn1cblxufSkoKTtcbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuKGZ1bmN0aW9uKCkge1xuXG4vLyBUT0RPKHRoZWRlZW5vKTogQ29uc2lkZXIgcmVuYW1pbmcgc3Vic3VpdGUuIElJUkMsIHN1YlN1aXRlIGlzIGVudGlyZWx5XG4vLyBkaXN0aW5jdCBmcm9tIG1vY2hhIHN1aXRlLCB3aGljaCB0cmlwcGVkIG1lIHVwIGJhZGx5IHdoZW4gdHJ5aW5nIHRvIGFkZFxuLy8gcGx1Z2luIHN1cHBvcnQuIFBlcmhhcHMgc29tZXRoaW5nIGxpa2UgJ2JhdGNoJywgb3IgJ2J1bmRsZScuIFNvbWV0aGluZyB0aGF0XG4vLyBoYXMgbm8gbW9jaGEgY29ycmVsYXRlLiBUaGlzIG1heSBhbHNvIGVsaW1pbmF0ZSB0aGUgbmVlZCBmb3Igcm9vdC9ub24tcm9vdFxuLy8gc3VpdGUgZGlzdGluY3Rpb25zLlxuXG4vKipcbiAqIEEgTW9jaGEgc3VpdGUgKG9yIHN1aXRlcykgcnVuIHdpdGhpbiBhIGNoaWxkIGlmcmFtZSwgYnV0IHJlcG9ydGVkIGFzIGlmIHRoZXlcbiAqIGFyZSBwYXJ0IG9mIHRoZSBjdXJyZW50IGNvbnRleHQuXG4gKi9cbmZ1bmN0aW9uIFN1YlN1aXRlKHVybCwgcGFyZW50U2NvcGUpIHtcbiAgdmFyIHBhcmFtcyA9IFdDVC51dGlsLmdldFBhcmFtcyhwYXJlbnRTY29wZS5sb2NhdGlvbi5zZWFyY2gpO1xuICBkZWxldGUgcGFyYW1zLmNsaV9icm93c2VyX2lkO1xuICBwYXJhbXMuYnVzdCA9IFtNYXRoLnJhbmRvbSgpXTtcblxuICB0aGlzLnVybCAgICAgICAgID0gdXJsICsgV0NULnV0aWwucGFyYW1zVG9RdWVyeShwYXJhbXMpO1xuICB0aGlzLnBhcmVudFNjb3BlID0gcGFyZW50U2NvcGU7XG5cbiAgdGhpcy5zdGF0ZSA9ICdpbml0aWFsaXppbmcnO1xufVxuV0NULlN1YlN1aXRlID0gU3ViU3VpdGU7XG5cbi8vIFN1YlN1aXRlcyBnZXQgYSBwcmV0dHkgZ2VuZXJvdXMgbG9hZCB0aW1lb3V0IGJ5IGRlZmF1bHQuXG5TdWJTdWl0ZS5sb2FkVGltZW91dCA9IDMwMDAwO1xuXG4vLyBXZSBjYW4ndCBtYWludGFpbiBwcm9wZXJ0aWVzIG9uIGlmcmFtZSBlbGVtZW50cyBpbiBGaXJlZm94L1NhZmFyaS8/Pz8sIHNvIHdlXG4vLyB0cmFjayBzdWJTdWl0ZXMgYnkgVVJMLlxuU3ViU3VpdGUuX2J5VXJsID0ge307XG5cbi8qKlxuICogQHJldHVybiB7U3ViU3VpdGV9IFRoZSBgU3ViU3VpdGVgIHRoYXQgd2FzIHJlZ2lzdGVyZWQgZm9yIHRoaXMgd2luZG93LlxuICovXG5TdWJTdWl0ZS5jdXJyZW50ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBTdWJTdWl0ZS5nZXQod2luZG93KTtcbn07XG5cbi8qKlxuICogQHBhcmFtIHshV2luZG93fSB0YXJnZXQgQSB3aW5kb3cgdG8gZmluZCB0aGUgU3ViU3VpdGUgb2YuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IHRyYXZlcnNhbCBXaGV0aGVyIHRoaXMgaXMgYSB0cmF2ZXJzYWwgZnJvbSBhIGNoaWxkIHdpbmRvdy5cbiAqIEByZXR1cm4ge1N1YlN1aXRlfSBUaGUgYFN1YlN1aXRlYCB0aGF0IHdhcyByZWdpc3RlcmVkIGZvciBgdGFyZ2V0YC5cbiAqL1xuU3ViU3VpdGUuZ2V0ID0gZnVuY3Rpb24odGFyZ2V0LCB0cmF2ZXJzYWwpIHtcbiAgdmFyIHN1YlN1aXRlID0gU3ViU3VpdGUuX2J5VXJsW3RhcmdldC5sb2NhdGlvbi5ocmVmXTtcbiAgaWYgKHN1YlN1aXRlKSByZXR1cm4gc3ViU3VpdGU7XG4gIGlmICh3aW5kb3cucGFyZW50ID09PSB3aW5kb3cpIHtcbiAgICBpZiAodHJhdmVyc2FsKSB7XG4gICAgICAvLyBJIHJlYWxseSBob3BlIHRoZXJlJ3Mgbm8gbGVnaXQgY2FzZSBmb3IgdGhpcy4gSW5maW5pdGUgcmVsb2FkcyBhcmUgbm8gZ29vZC5cbiAgICAgIGNvbnNvbGUud2FybignU3Vic3VpdGUgbG9hZGVkIGJ1dCB3YXMgbmV2ZXIgcmVnaXN0ZXJlZC4gVGhpcyBtb3N0IGxpa2VseSBpcyBkdWUgdG8gd29ua3kgaGlzdG9yeSBiZWhhdmlvci4gUmVsb2FkaW5nLi4uJyk7XG4gICAgICB3aW5kb3cubG9jYXRpb24ucmVsb2FkKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuICAvLyBPdGhlcndpc2UsIHRyYXZlcnNlLlxuICByZXR1cm4gd2luZG93LnBhcmVudC5XQ1QuU3ViU3VpdGUuZ2V0KHRhcmdldCwgdHJ1ZSk7XG59O1xuXG4vKipcbiAqIEhhbmdzIGEgcmVmZXJlbmNlIHRvIHRoZSBTdWJTdWl0ZSdzIGlmcmFtZS1sb2NhbCB3Y3Qgb2JqZWN0XG4gKlxuICogVE9ETyh0aGVkZWVubyk6IFRoaXMgbWV0aG9kIGlzIG9kZCB0byBkb2N1bWVudCBzbyB0aGUgYWNoaXRlY3R1cmUgbWlnaHQgbmVlZFxuICogYSBsaXR0bGUgcmV3b3JrIGhlcmUuIE1heWJlIGFub3RoZXIgbmFtZWQgY29uY2VwdD8gU2VlaW5nIFdDVCBldmVyeXdoZXJlIGlzXG4gKiBwcmV0dHkgY29uZnVzaW5nLiBBbHNvLCBJIGRvbid0IHRoaW5rIHdlIG5lZWQgdGhlIHBhcmVudFNjb3BlLldDVDsgdG8gbGltaXRcbiAqIGNvbmZ1c2lvbiBJIGRpZG4ndCBpbmNsdWRlIGl0LlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSB3Y3QgVGhlIFN1YlN1aXRlJ3MgaWZyYW1lLWxvY2FsIHdjdCBvYmplY3RcbiAqL1xuU3ViU3VpdGUucHJvdG90eXBlLnByZXBhcmUgPSBmdW5jdGlvbih3Y3QpIHtcbiAgdGhpcy5zaGFyZSA9IHdjdC5zaGFyZTtcbn07XG5cbi8qKlxuICogTG9hZHMgYW5kIHJ1bnMgdGhlIHN1YnN1aXRlLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRvbmUgTm9kZS1zdHlsZSBjYWxsYmFjay5cbiAqL1xuU3ViU3VpdGUucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uKGRvbmUpIHtcbiAgV0NULnV0aWwuZGVidWcoJ1N1YlN1aXRlI3J1bicsIHRoaXMudXJsKTtcbiAgdGhpcy5zdGF0ZSA9ICdsb2FkaW5nJztcbiAgdGhpcy5vblJ1bkNvbXBsZXRlID0gZG9uZTtcblxuICB0aGlzLmlmcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuICB0aGlzLmlmcmFtZS5zcmMgPSB0aGlzLnVybDtcbiAgdGhpcy5pZnJhbWUuY2xhc3NMaXN0LmFkZCgnc3Vic3VpdGUnKTtcblxuICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N1YnN1aXRlcycpO1xuICBpZiAoIWNvbnRhaW5lcikge1xuICAgIGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvbnRhaW5lci5pZCA9ICdzdWJzdWl0ZXMnO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcbiAgfVxuICBjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5pZnJhbWUpO1xuXG4gIC8vIGxldCB0aGUgaWZyYW1lIGV4cGFuZCB0aGUgVVJMIGZvciB1cy5cbiAgdGhpcy51cmwgPSB0aGlzLmlmcmFtZS5zcmM7XG4gIFN1YlN1aXRlLl9ieVVybFt0aGlzLnVybF0gPSB0aGlzO1xuXG4gIHRoaXMudGltZW91dElkID0gc2V0VGltZW91dChcbiAgICAgIHRoaXMubG9hZGVkLmJpbmQodGhpcywgbmV3IEVycm9yKCdUaW1lZCBvdXQgbG9hZGluZyAnICsgdGhpcy51cmwpKSwgU3ViU3VpdGUubG9hZFRpbWVvdXQpO1xuXG4gIHRoaXMuaWZyYW1lLmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJyxcbiAgICAgIHRoaXMubG9hZGVkLmJpbmQodGhpcywgbmV3IEVycm9yKCdGYWlsZWQgdG8gbG9hZCBkb2N1bWVudCAnICsgdGhpcy51cmwpKSk7XG5cbiAgdGhpcy5pZnJhbWUuY29udGVudFdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgdGhpcy5sb2FkZWQuYmluZCh0aGlzLCBudWxsKSk7XG59O1xuXG4vKipcbiAqIENhbGxlZCB3aGVuIHRoZSBzdWIgc3VpdGUncyBpZnJhbWUgaGFzIGxvYWRlZCAob3IgZXJyb3JlZCBkdXJpbmcgbG9hZCkuXG4gKlxuICogQHBhcmFtIHsqfSBlcnJvciBUaGUgZXJyb3IgdGhhdCBvY2N1cmVkLCBpZiBhbnkuXG4gKi9cblN1YlN1aXRlLnByb3RvdHlwZS5sb2FkZWQgPSBmdW5jdGlvbihlcnJvcikge1xuICBXQ1QudXRpbC5kZWJ1ZygnU3ViU3VpdGUjbG9hZGVkJywgdGhpcy51cmwsIGVycm9yKTtcbiAgaWYgKHRoaXMudGltZW91dElkKSB7XG4gICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dElkKTtcbiAgfVxuICBpZiAoZXJyb3IpIHtcbiAgICB0aGlzLnNpZ25hbFJ1bkNvbXBsZXRlKGVycm9yKTtcbiAgICB0aGlzLmRvbmUoKTtcbiAgfVxufTtcblxuLyoqIENhbGxlZCB3aGVuIHRoZSBzdWIgc3VpdGUncyB0ZXN0cyBhcmUgY29tcGxldGUsIHNvIHRoYXQgaXQgY2FuIGNsZWFuIHVwLiAqL1xuU3ViU3VpdGUucHJvdG90eXBlLmRvbmUgPSBmdW5jdGlvbiBkb25lKCkge1xuICBXQ1QudXRpbC5kZWJ1ZygnU3ViU3VpdGUjZG9uZScsIHRoaXMudXJsLCBhcmd1bWVudHMpO1xuXG4gIHRoaXMuc2lnbmFsUnVuQ29tcGxldGUoKTtcblxuICBpZiAoIXRoaXMuaWZyYW1lKSByZXR1cm47XG4gIHRoaXMuaWZyYW1lLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5pZnJhbWUpO1xufTtcblxuU3ViU3VpdGUucHJvdG90eXBlLnNpZ25hbFJ1bkNvbXBsZXRlID0gZnVuY3Rpb24gc2lnbmFsUnVuQ29tcGxldGUoZXJyb3IpIHtcbiAgaWYgKCF0aGlzLm9uUnVuQ29tcGxldGUpIHJldHVybjtcbiAgdGhpcy5zdGF0ZSA9ICdjb21wbGV0ZSc7XG4gIHRoaXMub25SdW5Db21wbGV0ZShlcnJvcik7XG4gIHRoaXMub25SdW5Db21wbGV0ZSA9IG51bGw7XG59O1xuXG59KSgpO1xuIiwiLyoqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbmh0bWwsIGJvZHkge1xuICBoZWlnaHQ6IDEwMCU7XG4gIHdpZHRoOiAgMTAwJTtcbn1cblxuI21vY2hhLCAjc3Vic3VpdGVzIHtcbiAgaGVpZ2h0OiAxMDAlO1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHRvcDogMDtcbiAgd2lkdGg6IDUwJTtcbn1cblxuI21vY2hhIHtcbiAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbiAgbWFyZ2luOiAwICFpbXBvcnRhbnQ7XG4gIG92ZXJmbG93LXk6IGF1dG87XG4gIHBhZGRpbmc6IDYwcHggNTBweDtcbiAgcmlnaHQ6IDA7XG59XG5cbiNzdWJzdWl0ZXMge1xuICAtbXMtZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgLXdlYmtpdC1mbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICBkaXNwbGF5OiAtbXMtZmxleGJveDtcbiAgZGlzcGxheTogLXdlYmtpdC1mbGV4O1xuICBkaXNwbGF5OiBmbGV4O1xuICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICBsZWZ0OiAwO1xufVxuXG4jc3Vic3VpdGVzIC5zdWJzdWl0ZSB7XG4gIGJvcmRlcjogMDtcbiAgd2lkdGg6IDEwMCU7XG4gIGhlaWdodDogMTAwJTtcbn1cblxuI21vY2hhIC50ZXN0LnBhc3MgLmR1cmF0aW9uIHtcbiAgY29sb3I6ICM1NTU7XG59XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuLy8gcG9seW1lci10ZXN0LXRvb2xzIChhbmQgUG9seW1lci90b29scykgc3VwcG9ydCBIVE1MIHRlc3RzIHdoZXJlIGVhY2ggZmlsZSBpc1xuLy8gZXhwZWN0ZWQgdG8gY2FsbCBgZG9uZSgpYCwgd2hpY2ggcG9zdHMgYSBtZXNzYWdlIHRvIHRoZSBwYXJlbnQgd2luZG93Llxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbihldmVudCkge1xuICBpZiAoIWV2ZW50LmRhdGEgfHwgKGV2ZW50LmRhdGEgIT09ICdvaycgJiYgIWV2ZW50LmRhdGEuZXJyb3IpKSByZXR1cm47XG4gIHZhciBzdWJTdWl0ZSA9IFdDVC5TdWJTdWl0ZS5nZXQoZXZlbnQuc291cmNlKTtcbiAgaWYgKCFzdWJTdWl0ZSkgcmV0dXJuO1xuXG4gIC8vIFRoZSBuYW1lIG9mIHRoZSBzdWl0ZSBhcyBleHBvc2VkIHRvIHRoZSB1c2VyLlxuICB2YXIgcGF0aCA9IFdDVC51dGlsLnJlbGF0aXZlTG9jYXRpb24oZXZlbnQuc291cmNlLmxvY2F0aW9uKTtcbiAgdmFyIHBhcmVudFJ1bm5lciA9IHN1YlN1aXRlLnBhcmVudFNjb3BlLldDVC5fbXVsdGlSdW5uZXI7XG4gIHBhcmVudFJ1bm5lci5lbWl0T3V0T2ZCYW5kVGVzdCgncGFnZS13aWRlIHRlc3RzIHZpYSBnbG9iYWwgZG9uZSgpJywgZXZlbnQuZGF0YS5lcnJvciwgcGF0aCwgdHJ1ZSk7XG5cbiAgc3ViU3VpdGUuZG9uZSgpO1xufSk7XG5cbi8vIEF0dGVtcHQgdG8gZW5zdXJlIHRoYXQgd2UgY29tcGxldGUgYSB0ZXN0IHN1aXRlIGlmIGl0IGlzIGludGVycnVwdGVkIGJ5IGFcbi8vIGRvY3VtZW50IHVubG9hZC5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCd1bmxvYWQnLCBmdW5jdGlvbihldmVudCkge1xuICAvLyBNb2NoYSdzIGhvb2sgcXVldWUgaXMgYXN5bmNocm9ub3VzOyBidXQgd2Ugd2FudCBzeW5jaHJvbm91cyBiZWhhdmlvciBpZlxuICAvLyB3ZSd2ZSBnb3R0ZW4gdG8gdGhlIHBvaW50IG9mIHVubG9hZGluZyB0aGUgZG9jdW1lbnQuXG4gIE1vY2hhLlJ1bm5lci5pbW1lZGlhdGVseSA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7IGNhbGxiYWNrKCk7IH07XG59KTtcblxufSkoKTtcbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuKGZ1bmN0aW9uKCkge1xuXG4vKipcbiAqIFJ1bnMgYHN0ZXBGbmAsIGNhdGNoaW5nIGFueSBlcnJvciBhbmQgcGFzc2luZyBpdCB0byBgY2FsbGJhY2tgIChOb2RlLXN0eWxlKS5cbiAqIE90aGVyd2lzZSwgY2FsbHMgYGNhbGxiYWNrYCB3aXRoIG5vIGFyZ3VtZW50cyBvbiBzdWNjZXNzLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb24oKX0gY2FsbGJhY2tcbiAqIEBwYXJhbSB7ZnVuY3Rpb24oKX0gc3RlcEZuXG4gKi9cbndpbmRvdy5zYWZlU3RlcCA9IGZ1bmN0aW9uIHNhZmVTdGVwKGNhbGxiYWNrLCBzdGVwRm4pIHtcbiAgdmFyIGVycjtcbiAgdHJ5IHtcbiAgICBzdGVwRm4oKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBlcnIgPSBlcnJvcjtcbiAgfVxuICBjYWxsYmFjayhlcnIpO1xufTtcblxuLyoqXG4gKiBSdW5zIHlvdXIgdGVzdCBhdCBkZWNsYXJhdGlvbiB0aW1lIChiZWZvcmUgTW9jaGEgaGFzIGJlZ3VuIHRlc3RzKS4gSGFuZHkgZm9yXG4gKiB3aGVuIHlvdSBuZWVkIHRvIHRlc3QgZG9jdW1lbnQgaW5pdGlhbGl6YXRpb24uXG4gKlxuICogQmUgYXdhcmUgdGhhdCBhbnkgZXJyb3JzIHRocm93biBhc3luY2hyb25vdXNseSBjYW5ub3QgYmUgdGllZCB0byB5b3VyIHRlc3QuXG4gKiBZb3UgbWF5IHdhbnQgdG8gY2F0Y2ggdGhlbSBhbmQgcGFzcyB0aGVtIHRvIHRoZSBkb25lIGV2ZW50LCBpbnN0ZWFkLiBTZWVcbiAqIGBzYWZlU3RlcGAuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIHRlc3QuXG4gKiBAcGFyYW0ge2Z1bmN0aW9uKD9mdW5jdGlvbigpKX0gdGVzdEZuIFRoZSB0ZXN0IGZ1bmN0aW9uLiBJZiBhbiBhcmd1bWVudCBpc1xuICogICAgIGFjY2VwdGVkLCB0aGUgdGVzdCB3aWxsIGJlIHRyZWF0ZWQgYXMgYXN5bmMsIGp1c3QgbGlrZSBNb2NoYSB0ZXN0cy5cbiAqL1xud2luZG93LnRlc3RJbW1lZGlhdGUgPSBmdW5jdGlvbiB0ZXN0SW1tZWRpYXRlKG5hbWUsIHRlc3RGbikge1xuICBpZiAodGVzdEZuLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gdGVzdEltbWVkaWF0ZUFzeW5jKG5hbWUsIHRlc3RGbik7XG4gIH1cblxuICB2YXIgZXJyO1xuICB0cnkge1xuICAgIHRlc3RGbigpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGVyciA9IGVycm9yO1xuICB9XG5cbiAgdGVzdChuYW1lLCBmdW5jdGlvbihkb25lKSB7XG4gICAgZG9uZShlcnIpO1xuICB9KTtcbn07XG5cbi8qKlxuICogQW4gYXN5bmMtb25seSB2YXJpYW50IG9mIGB0ZXN0SW1tZWRpYXRlYC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtmdW5jdGlvbig/ZnVuY3Rpb24oKSl9IHRlc3RGblxuICovXG53aW5kb3cudGVzdEltbWVkaWF0ZUFzeW5jID0gZnVuY3Rpb24gdGVzdEltbWVkaWF0ZUFzeW5jKG5hbWUsIHRlc3RGbikge1xuICB2YXIgdGVzdENvbXBsZXRlID0gZmFsc2U7XG4gIHZhciBlcnI7XG5cbiAgdGVzdChuYW1lLCBmdW5jdGlvbihkb25lKSB7XG4gICAgdmFyIGludGVydmFsSWQgPSBzZXRJbnRlcnZhbChmdW5jdGlvbigpIHtcbiAgICAgIGlmICghdGVzdENvbXBsZXRlKSByZXR1cm47XG4gICAgICBjbGVhckludGVydmFsKGludGVydmFsSWQpO1xuICAgICAgZG9uZShlcnIpO1xuICAgIH0sIDEwKTtcbiAgfSk7XG5cbiAgdHJ5IHtcbiAgICB0ZXN0Rm4oZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvcikgZXJyID0gZXJyb3I7XG4gICAgICB0ZXN0Q29tcGxldGUgPSB0cnVlO1xuICAgIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGVyciA9IGVycm9yO1xuICB9XG59O1xuXG4vKipcbiAqIFRyaWdnZXJzIGEgZmx1c2ggb2YgYW55IHBlbmRpbmcgZXZlbnRzLCBvYnNlcnZhdGlvbnMsIGV0YyBhbmQgY2FsbHMgeW91IGJhY2tcbiAqIGFmdGVyIHRoZXkgaGF2ZSBiZWVuIHByb2Nlc3NlZC5cbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9uKCl9IGNhbGxiYWNrXG4gKi9cbndpbmRvdy5mbHVzaCA9IGZ1bmN0aW9uIGZsdXNoKGNhbGxiYWNrKSB7XG4gIC8vIElkZWFsbHksIHRoaXMgZnVuY3Rpb24gd291bGQgYmUgYSBjYWxsIHRvIFBvbHltZXIuZmx1c2gsIGJ1dCB0aGF0IGRvZXNuJ3RcbiAgLy8gc3VwcG9ydCBhIGNhbGxiYWNrIHlldCAoaHR0cHM6Ly9naXRodWIuY29tL1BvbHltZXIvcG9seW1lci1kZXYvaXNzdWVzLzExNSksXG4gIC8vIC4uLmFuZCB0aGVyZSdzIGNyb3NzLWJyb3dzZXIgZmxha2luZXNzIHRvIGRlYWwgd2l0aC5cblxuICAvLyBNYWtlIHN1cmUgdGhhdCB3ZSdyZSBpbnZva2luZyB0aGUgY2FsbGJhY2sgd2l0aCBubyBhcmd1bWVudHMgc28gdGhhdCB0aGVcbiAgLy8gY2FsbGVyIGNhbiBwYXNzIE1vY2hhIGNhbGxiYWNrcywgZXRjLlxuICB2YXIgZG9uZSA9IGZ1bmN0aW9uIGRvbmUoKSB7IGNhbGxiYWNrKCk7IH07XG5cbiAgLy8gQmVjYXVzZSBlbmRPZk1pY3JvdGFzayBpcyBmbGFreSBmb3IgSUUsIHdlIHBlcmZvcm0gbWljcm90YXNrIGNoZWNrcG9pbnRzXG4gIC8vIG91cnNlbHZlcyAoaHR0cHM6Ly9naXRodWIuY29tL1BvbHltZXIvcG9seW1lci1kZXYvaXNzdWVzLzExNCk6XG4gIHZhciBpc0lFID0gbmF2aWdhdG9yLmFwcE5hbWUgPT0gJ01pY3Jvc29mdCBJbnRlcm5ldCBFeHBsb3Jlcic7XG4gIGlmIChpc0lFICYmIHdpbmRvdy5QbGF0Zm9ybSAmJiB3aW5kb3cuUGxhdGZvcm0ucGVyZm9ybU1pY3JvdGFza0NoZWNrcG9pbnQpIHtcbiAgICB2YXIgcmVhbGx5RG9uZSA9IGRvbmU7XG4gICAgZG9uZSA9IGZ1bmN0aW9uIGRvbmVJRSgpIHtcbiAgICAgIFBsYXRmb3JtLnBlcmZvcm1NaWNyb3Rhc2tDaGVja3BvaW50KCk7XG4gICAgICBzZXRUaW1lb3V0KHJlYWxseURvbmUsIDApO1xuICAgIH07XG4gIH1cblxuICAvLyBFdmVyeW9uZSBlbHNlIGdldHMgYSByZWd1bGFyIGZsdXNoLlxuICB2YXIgc2NvcGUgPSB3aW5kb3cuUG9seW1lciB8fCB3aW5kb3cuV2ViQ29tcG9uZW50cztcbiAgaWYgKHNjb3BlICYmIHNjb3BlLmZsdXNoKSB7XG4gICAgc2NvcGUuZmx1c2goKTtcbiAgfVxuXG4gIC8vIEVuc3VyZSB0aGF0IHdlIGFyZSBjcmVhdGluZyBhIG5ldyBfdGFza18gdG8gYWxsb3cgYWxsIGFjdGl2ZSBtaWNyb3Rhc2tzIHRvXG4gIC8vIGZpbmlzaCAodGhlIGNvZGUgeW91J3JlIHRlc3RpbmcgbWF5IGJlIHVzaW5nIGVuZE9mTWljcm90YXNrLCB0b28pLlxuICBzZXRUaW1lb3V0KGRvbmUsIDApO1xufTtcblxuLyoqXG4gKiBERVBSRUNBVEVEOiBVc2UgYGZsdXNoYC5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrXG4gKi9cbndpbmRvdy5hc3luY1BsYXRmb3JtRmx1c2ggPSBmdW5jdGlvbiBhc3luY1BsYXRmb3JtRmx1c2goY2FsbGJhY2spIHtcbiAgY29uc29sZS53YXJuKCdhc3luY1BsYXRmb3JtRmx1c2ggaXMgZGVwcmVjYXRlZCBpbiBmYXZvciBvZiB0aGUgbW9yZSB0ZXJzZSBmbHVzaCgpJyk7XG4gIHJldHVybiB3aW5kb3cuZmx1c2goY2FsbGJhY2spO1xufTtcblxuLyoqXG4gKlxuICovXG53aW5kb3cud2FpdEZvciA9IGZ1bmN0aW9uIHdhaXRGb3IoZm4sIG5leHQsIGludGVydmFsT3JNdXRhdGlvbkVsLCB0aW1lb3V0LCB0aW1lb3V0VGltZSkge1xuICB0aW1lb3V0VGltZSA9IHRpbWVvdXRUaW1lIHx8IERhdGUubm93KCkgKyAodGltZW91dCB8fCAxMDAwKTtcbiAgaW50ZXJ2YWxPck11dGF0aW9uRWwgPSBpbnRlcnZhbE9yTXV0YXRpb25FbCB8fCAzMjtcbiAgdHJ5IHtcbiAgICBmbigpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgaWYgKERhdGUubm93KCkgPiB0aW1lb3V0VGltZSkge1xuICAgICAgdGhyb3cgZTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGlzTmFOKGludGVydmFsT3JNdXRhdGlvbkVsKSkge1xuICAgICAgICBpbnRlcnZhbE9yTXV0YXRpb25FbC5vbk11dGF0aW9uKGludGVydmFsT3JNdXRhdGlvbkVsLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICB3YWl0Rm9yKGZuLCBuZXh0LCBpbnRlcnZhbE9yTXV0YXRpb25FbCwgdGltZW91dCwgdGltZW91dFRpbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgd2FpdEZvcihmbiwgbmV4dCwgaW50ZXJ2YWxPck11dGF0aW9uRWwsIHRpbWVvdXQsIHRpbWVvdXRUaW1lKTtcbiAgICAgICAgfSwgaW50ZXJ2YWxPck11dGF0aW9uRWwpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuICBuZXh0KCk7XG59O1xuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbldDVC5NdWx0aVJ1bm5lciA9IE11bHRpUnVubmVyO1xuXG52YXIgU1RBQ0tZX0NPTkZJRyA9IHtcbiAgaW5kZW50OiAnICAnLFxuICBsb2NhdGlvblN0cmlwOiBbXG4gICAgL15odHRwcz86XFwvXFwvW15cXC9dKy8sXG4gICAgL1xcP1tcXGRcXC5dKyQvLFxuICBdLFxuICBmaWx0ZXI6IGZ1bmN0aW9uKGxpbmUpIHtcbiAgICByZXR1cm4gbGluZS5sb2NhdGlvbi5tYXRjaCgvd2ViLWNvbXBvbmVudC10ZXN0ZXJcXC9icm93c2VyLmpzLyk7XG4gIH0sXG59O1xuXG4vLyBodHRwczovL2dpdGh1Yi5jb20vdmlzaW9ubWVkaWEvbW9jaGEvYmxvYi9tYXN0ZXIvbGliL3J1bm5lci5qcyNMMzYtNDZcbnZhciBNT0NIQV9FVkVOVFMgPSBbXG4gICdzdGFydCcsXG4gICdlbmQnLFxuICAnc3VpdGUnLFxuICAnc3VpdGUgZW5kJyxcbiAgJ3Rlc3QnLFxuICAndGVzdCBlbmQnLFxuICAnaG9vaycsXG4gICdob29rIGVuZCcsXG4gICdwYXNzJyxcbiAgJ2ZhaWwnLFxuICAncGVuZGluZycsXG5dO1xuXG4vLyBVbnRpbCBhIHN1aXRlIGhhcyBsb2FkZWQsIHdlIGFzc3VtZSB0aGlzIG1hbnkgdGVzdHMgaW4gaXQuXG52YXIgRVNUSU1BVEVEX1RFU1RTX1BFUl9TVUlURSA9IDM7XG5cbi8qKlxuICogQSBNb2NoYS1saWtlIHJ1bm5lciB0aGF0IGNvbWJpbmVzIHRoZSBvdXRwdXQgb2YgbXVsdGlwbGUgTW9jaGEgc3VpdGVzLlxuICpcbiAqIEBwYXJhbSB7bnVtYmVyfSBudW1TdWl0ZXMgVGhlIG51bWJlciBvZiBzdWl0ZXMgdGhhdCB3aWxsIGJlIHJ1biwgaW4gb3JkZXIgdG9cbiAqICAgICBlc3RpbWF0ZSB0aGUgdG90YWwgbnVtYmVyIG9mIHRlc3RzIHRoYXQgd2lsbCBiZSBwZXJmb3JtZWQuXG4gKiBAcGFyYW0geyFBcnJheS48IU1vY2hhLnJlcG9ydGVycy5CYXNlPn0gcmVwb3J0ZXJzIFRoZSBzZXQgb2YgcmVwb3J0ZXJzIHRoYXRcbiAqICAgICBzaG91bGQgcmVjZWl2ZSB0aGUgdW5pZmllZCBldmVudCBzdHJlYW0uXG4gKi9cbmZ1bmN0aW9uIE11bHRpUnVubmVyKG51bVN1aXRlcywgcmVwb3J0ZXJzKSB7XG4gIHRoaXMucmVwb3J0ZXJzID0gcmVwb3J0ZXJzLm1hcChmdW5jdGlvbihyZXBvcnRlcikge1xuICAgIHJldHVybiBuZXcgcmVwb3J0ZXIodGhpcyk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgdGhpcy50b3RhbCA9IG51bVN1aXRlcyAqIEVTVElNQVRFRF9URVNUU19QRVJfU1VJVEU7XG4gIC8vIE1vY2hhIHJlcG9ydGVycyBhc3N1bWUgYSBzdHJlYW0gb2YgZXZlbnRzLCBzbyB3ZSBoYXZlIHRvIGJlIGNhcmVmdWwgdG8gb25seVxuICAvLyByZXBvcnQgb24gb25lIHJ1bm5lciBhdCBhIHRpbWUuLi5cbiAgdGhpcy5jdXJyZW50UnVubmVyID0gbnVsbDtcbiAgLy8gLi4ud2hpbGUgd2UgYnVmZmVyIGV2ZW50cyBmb3IgYW55IG90aGVyIGFjdGl2ZSBydW5uZXJzLlxuICB0aGlzLnBlbmRpbmdFdmVudHMgPSBbXTtcblxuICB0aGlzLmVtaXQoJ3N0YXJ0Jyk7XG59XG4vLyBNb2NoYSBkb2Vzbid0IGV4cG9zZSBpdHMgYEV2ZW50RW1pdHRlcmAgc2hpbSBkaXJlY3RseSwgc286XG5NdWx0aVJ1bm5lci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKE9iamVjdC5nZXRQcm90b3R5cGVPZihNb2NoYS5SdW5uZXIucHJvdG90eXBlKSk7XG5cbi8qKlxuICogQHJldHVybiB7IU1vY2hhLnJlcG9ydGVycy5CYXNlfSBBIHJlcG9ydGVyLWxpa2UgXCJjbGFzc1wiIGZvciBlYWNoIGNoaWxkIHN1aXRlXG4gKiAgICAgdGhhdCBzaG91bGQgYmUgcGFzc2VkIHRvIGBtb2NoYS5ydW5gLlxuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUuY2hpbGRSZXBvcnRlciA9IGZ1bmN0aW9uIGNoaWxkUmVwb3J0ZXIobmFtZSkge1xuICAvLyBUaGUgcmVwb3J0ZXIgaXMgdXNlZCBhcyBhIGNvbnN0cnVjdG9yLCBzbyB3ZSBjYW4ndCBkZXBlbmQgb24gYHRoaXNgIGJlaW5nXG4gIC8vIHByb3Blcmx5IGJvdW5kLlxuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGZ1bmN0aW9uIHJlcG9ydGVyKHJ1bm5lcikge1xuICAgIHJ1bm5lci5uYW1lID0gbmFtZTtcbiAgICBzZWxmLmJpbmRDaGlsZFJ1bm5lcihydW5uZXIpO1xuICB9XG4gIHJlcG9ydGVyLnRpdGxlID0gbmFtZTtcbiAgcmV0dXJuIHJlcG9ydGVyO1xufTtcblxuLyoqIE11c3QgYmUgY2FsbGVkIG9uY2UgYWxsIHJ1bm5lcnMgaGF2ZSBmaW5pc2hlZC4gKi9cbk11bHRpUnVubmVyLnByb3RvdHlwZS5kb25lID0gZnVuY3Rpb24gZG9uZSgpIHtcbiAgdGhpcy5jb21wbGV0ZSA9IHRydWU7XG4gIHRoaXMuZW1pdCgnZW5kJyk7XG4gIHRoaXMuZmx1c2hQZW5kaW5nRXZlbnRzKCk7XG59O1xuXG4vKipcbiAqIEVtaXQgYSB0b3AgbGV2ZWwgdGVzdCB0aGF0IGlzIG5vdCBwYXJ0IG9mIGFueSBzdWl0ZSBtYW5hZ2VkIGJ5IHRoaXMgcnVubmVyLlxuICpcbiAqIEhlbHBmdWwgZm9yIHJlcG9ydGluZyBvbiBnbG9iYWwgZXJyb3JzLCBsb2FkaW5nIGlzc3VlcywgZXRjLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSB0aXRsZSBUaGUgdGl0bGUgb2YgdGhlIHRlc3QuXG4gKiBAcGFyYW0geyp9IG9wdF9lcnJvciBBbiBlcnJvciBhc3NvY2lhdGVkIHdpdGggdGhpcyB0ZXN0LiBJZiBmYWxzeSwgdGVzdCBpc1xuICogICAgIGNvbnNpZGVyZWQgdG8gYmUgcGFzc2luZy5cbiAqIEBwYXJhbSB7c3RyaW5nfSBvcHRfc3VpdGVUaXRsZSBUaXRsZSBmb3IgdGhlIHN1aXRlIHRoYXQncyB3cmFwcGluZyB0aGUgdGVzdC5cbiAqIEBwYXJhbSB7P2Jvb2xlYW59IG9wdF9lc3RpbWF0ZWQgSWYgdGhpcyB0ZXN0IHdhcyBpbmNsdWRlZCBpbiB0aGUgb3JpZ2luYWxcbiAqICAgICBlc3RpbWF0ZSBvZiBgbnVtU3VpdGVzYC5cbiAqL1xuTXVsdGlSdW5uZXIucHJvdG90eXBlLmVtaXRPdXRPZkJhbmRUZXN0ID0gZnVuY3Rpb24gZW1pdE91dE9mQmFuZFRlc3QodGl0bGUsIG9wdF9lcnJvciwgb3B0X3N1aXRlVGl0bGUsIG9wdF9lc3RpbWF0ZWQpIHtcbiAgV0NULnV0aWwuZGVidWcoJ011bHRpUnVubmVyI2VtaXRPdXRPZkJhbmRUZXN0KCcsIGFyZ3VtZW50cywgJyknKTtcbiAgdmFyIHJvb3QgPSBuZXcgTW9jaGEuU3VpdGUoKTtcbiAgcm9vdC50aXRsZSA9IG9wdF9zdWl0ZVRpdGxlO1xuICB2YXIgdGVzdCA9IG5ldyBNb2NoYS5UZXN0KHRpdGxlLCBmdW5jdGlvbigpIHtcbiAgfSk7XG4gIHRlc3QucGFyZW50ID0gcm9vdDtcbiAgdGVzdC5zdGF0ZSAgPSBvcHRfZXJyb3IgPyAnZmFpbGVkJyA6ICdwYXNzZWQnO1xuICB0ZXN0LmVyciAgICA9IG9wdF9lcnJvcjtcblxuICBpZiAoIW9wdF9lc3RpbWF0ZWQpIHtcbiAgICB0aGlzLnRvdGFsID0gdGhpcy50b3RhbCArIEVTVElNQVRFRF9URVNUU19QRVJfU1VJVEU7XG4gIH1cblxuICB2YXIgcnVubmVyID0ge3RvdGFsOiAxfTtcbiAgdGhpcy5wcm94eUV2ZW50KCdzdGFydCcsIHJ1bm5lcik7XG4gIHRoaXMucHJveHlFdmVudCgnc3VpdGUnLCBydW5uZXIsIHJvb3QpO1xuICB0aGlzLnByb3h5RXZlbnQoJ3Rlc3QnLCBydW5uZXIsIHRlc3QpO1xuICBpZiAob3B0X2Vycm9yKSB7XG4gICAgdGhpcy5wcm94eUV2ZW50KCdmYWlsJywgcnVubmVyLCB0ZXN0LCBvcHRfZXJyb3IpO1xuICB9IGVsc2Uge1xuICAgIHRoaXMucHJveHlFdmVudCgncGFzcycsIHJ1bm5lciwgdGVzdCk7XG4gIH1cbiAgdGhpcy5wcm94eUV2ZW50KCd0ZXN0IGVuZCcsIHJ1bm5lciwgdGVzdCk7XG4gIHRoaXMucHJveHlFdmVudCgnc3VpdGUgZW5kJywgcnVubmVyLCByb290KTtcbiAgdGhpcy5wcm94eUV2ZW50KCdlbmQnLCBydW5uZXIpO1xufTtcblxuLy8gSW50ZXJuYWwgSW50ZXJmYWNlXG5cbi8qKiBAcGFyYW0geyFNb2NoYS5ydW5uZXJzLkJhc2V9IHJ1bm5lciBUaGUgcnVubmVyIHRvIGxpc3RlbiB0byBldmVudHMgZm9yLiAqL1xuTXVsdGlSdW5uZXIucHJvdG90eXBlLmJpbmRDaGlsZFJ1bm5lciA9IGZ1bmN0aW9uIGJpbmRDaGlsZFJ1bm5lcihydW5uZXIpIHtcbiAgTU9DSEFfRVZFTlRTLmZvckVhY2goZnVuY3Rpb24oZXZlbnROYW1lKSB7XG4gICAgcnVubmVyLm9uKGV2ZW50TmFtZSwgdGhpcy5wcm94eUV2ZW50LmJpbmQodGhpcywgZXZlbnROYW1lLCBydW5uZXIpKTtcbiAgfS5iaW5kKHRoaXMpKTtcbn07XG5cbi8qKlxuICogRXZhbHVhdGVzIGFuIGV2ZW50IGZpcmVkIGJ5IGBydW5uZXJgLCBwcm94eWluZyBpdCBmb3J3YXJkIG9yIGJ1ZmZlcmluZyBpdC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gZXZlbnROYW1lXG4gKiBAcGFyYW0geyFNb2NoYS5ydW5uZXJzLkJhc2V9IHJ1bm5lciBUaGUgcnVubmVyIHRoYXQgZW1pdHRlZCB0aGlzIGV2ZW50LlxuICogQHBhcmFtIHsuLi4qfSB2YXJfYXJncyBBbnkgYWRkaXRpb25hbCBkYXRhIHBhc3NlZCBhcyBwYXJ0IG9mIHRoZSBldmVudC5cbiAqL1xuTXVsdGlSdW5uZXIucHJvdG90eXBlLnByb3h5RXZlbnQgPSBmdW5jdGlvbiBwcm94eUV2ZW50KGV2ZW50TmFtZSwgcnVubmVyLCB2YXJfYXJncykge1xuICB2YXIgZXh0cmFBcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgaWYgKHRoaXMuY29tcGxldGUpIHtcbiAgICBjb25zb2xlLndhcm4oJ291dCBvZiBvcmRlciBNb2NoYSBldmVudCBmb3IgJyArIHJ1bm5lci5uYW1lICsgJzonLCBldmVudE5hbWUsIGV4dHJhQXJncyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuY3VycmVudFJ1bm5lciAmJiBydW5uZXIgIT09IHRoaXMuY3VycmVudFJ1bm5lcikge1xuICAgIHRoaXMucGVuZGluZ0V2ZW50cy5wdXNoKGFyZ3VtZW50cyk7XG4gICAgcmV0dXJuO1xuICB9XG4gIFdDVC51dGlsLmRlYnVnKCdNdWx0aVJ1bm5lciNwcm94eUV2ZW50KCcsIGFyZ3VtZW50cywgJyknKTtcblxuICAvLyBUaGlzIGFwcGVhcnMgdG8gYmUgYSBNb2NoYSBidWc6IFRlc3RzIGZhaWxlZCBieSBwYXNzaW5nIGFuIGVycm9yIHRvIHRoZWlyXG4gIC8vIGRvbmUgZnVuY3Rpb24gZG9uJ3Qgc2V0IGBlcnJgIHByb3Blcmx5LlxuICAvL1xuICAvLyBUT0RPKG5ldmlyKTogVHJhY2sgZG93bi5cbiAgaWYgKGV2ZW50TmFtZSA9PT0gJ2ZhaWwnICYmICFleHRyYUFyZ3NbMF0uZXJyKSB7XG4gICAgZXh0cmFBcmdzWzBdLmVyciA9IGV4dHJhQXJnc1sxXTtcbiAgfVxuXG4gIGlmIChldmVudE5hbWUgPT09ICdzdGFydCcpIHtcbiAgICB0aGlzLm9uUnVubmVyU3RhcnQocnVubmVyKTtcbiAgfSBlbHNlIGlmIChldmVudE5hbWUgPT09ICdlbmQnKSB7XG4gICAgdGhpcy5vblJ1bm5lckVuZChydW5uZXIpO1xuICB9IGVsc2Uge1xuICAgIHRoaXMuY2xlYW5FdmVudChldmVudE5hbWUsIHJ1bm5lciwgZXh0cmFBcmdzKTtcbiAgICB0aGlzLmVtaXQuYXBwbHkodGhpcywgW2V2ZW50TmFtZV0uY29uY2F0KGV4dHJhQXJncykpO1xuICB9XG59O1xuXG4vKipcbiAqIENsZWFucyBvciBtb2RpZmllcyBhbiBldmVudCBpZiBuZWVkZWQuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IGV2ZW50TmFtZVxuICogQHBhcmFtIHshTW9jaGEucnVubmVycy5CYXNlfSBydW5uZXIgVGhlIHJ1bm5lciB0aGF0IGVtaXR0ZWQgdGhpcyBldmVudC5cbiAqIEBwYXJhbSB7IUFycmF5LjwqPn0gZXh0cmFBcmdzXG4gKi9cbk11bHRpUnVubmVyLnByb3RvdHlwZS5jbGVhbkV2ZW50ID0gZnVuY3Rpb24gY2xlYW5FdmVudChldmVudE5hbWUsIHJ1bm5lciwgZXh0cmFBcmdzKSB7XG4gIC8vIFN1aXRlIGhpZXJhcmNoeVxuICBpZiAoZXh0cmFBcmdzWzBdKSB7XG4gICAgZXh0cmFBcmdzWzBdID0gdGhpcy5zaG93Um9vdFN1aXRlKGV4dHJhQXJnc1swXSk7XG4gIH1cblxuICAvLyBOb3JtYWxpemUgZXJyb3JzXG4gIGlmIChldmVudE5hbWUgPT09ICdmYWlsJykge1xuICAgIGV4dHJhQXJnc1sxXSA9IFN0YWNreS5ub3JtYWxpemUoZXh0cmFBcmdzWzFdLCBTVEFDS1lfQ09ORklHKTtcbiAgfVxuICBpZiAoZXh0cmFBcmdzWzBdICYmIGV4dHJhQXJnc1swXS5lcnIpIHtcbiAgICBleHRyYUFyZ3NbMF0uZXJyID0gU3RhY2t5Lm5vcm1hbGl6ZShleHRyYUFyZ3NbMF0uZXJyLCBTVEFDS1lfQ09ORklHKTtcbiAgfVxufTtcblxuLyoqXG4gKiBXZSBsaWtlIHRvIHNob3cgdGhlIHJvb3Qgc3VpdGUncyB0aXRsZSwgd2hpY2ggcmVxdWlyZXMgYSBsaXR0bGUgYml0IG9mXG4gKiB0cmlja2VyeSBpbiB0aGUgc3VpdGUgaGllcmFyY2h5LlxuICpcbiAqIEBwYXJhbSB7IU1vY2hhLlJ1bm5hYmxlfSBub2RlXG4gKi9cbk11bHRpUnVubmVyLnByb3RvdHlwZS5zaG93Um9vdFN1aXRlID0gZnVuY3Rpb24gc2hvd1Jvb3RTdWl0ZShub2RlKSB7XG4gIHZhciBsZWFmID0gbm9kZSA9IE9iamVjdC5jcmVhdGUobm9kZSk7XG4gIHdoaWxlIChub2RlICYmICFub2RlLnJvb3QpIHtcbiAgICB2YXIgd3JhcHBlZFBhcmVudCA9IE9iamVjdC5jcmVhdGUobm9kZS5wYXJlbnQpO1xuICAgIG5vZGUucGFyZW50ID0gd3JhcHBlZFBhcmVudDtcbiAgICBub2RlID0gd3JhcHBlZFBhcmVudDtcbiAgfVxuICBub2RlLnJvb3QgPSBmYWxzZTtcblxuICByZXR1cm4gbGVhZjtcbn07XG5cbi8qKiBAcGFyYW0geyFNb2NoYS5ydW5uZXJzLkJhc2V9IHJ1bm5lciAqL1xuTXVsdGlSdW5uZXIucHJvdG90eXBlLm9uUnVubmVyU3RhcnQgPSBmdW5jdGlvbiBvblJ1bm5lclN0YXJ0KHJ1bm5lcikge1xuICBXQ1QudXRpbC5kZWJ1ZygnTXVsdGlSdW5uZXIjb25SdW5uZXJTdGFydDonLCBydW5uZXIubmFtZSk7XG4gIHRoaXMudG90YWwgPSB0aGlzLnRvdGFsIC0gRVNUSU1BVEVEX1RFU1RTX1BFUl9TVUlURSArIHJ1bm5lci50b3RhbDtcbiAgdGhpcy5jdXJyZW50UnVubmVyID0gcnVubmVyO1xufTtcblxuLyoqIEBwYXJhbSB7IU1vY2hhLnJ1bm5lcnMuQmFzZX0gcnVubmVyICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUub25SdW5uZXJFbmQgPSBmdW5jdGlvbiBvblJ1bm5lckVuZChydW5uZXIpIHtcbiAgV0NULnV0aWwuZGVidWcoJ011bHRpUnVubmVyI29uUnVubmVyRW5kOicsIHJ1bm5lci5uYW1lKTtcbiAgdGhpcy5jdXJyZW50UnVubmVyID0gbnVsbDtcbiAgdGhpcy5mbHVzaFBlbmRpbmdFdmVudHMoKTtcbn07XG5cbi8qKlxuICogRmx1c2hlcyBhbnkgYnVmZmVyZWQgZXZlbnRzIGFuZCBydW5zIHRoZW0gdGhyb3VnaCBgcHJveHlFdmVudGAuIFRoaXMgd2lsbFxuICogbG9vcCB1bnRpbCBhbGwgYnVmZmVyZWQgcnVubmVycyBhcmUgY29tcGxldGUsIG9yIHdlIGhhdmUgcnVuIG91dCBvZiBidWZmZXJlZFxuICogZXZlbnRzLlxuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUuZmx1c2hQZW5kaW5nRXZlbnRzID0gZnVuY3Rpb24gZmx1c2hQZW5kaW5nRXZlbnRzKCkge1xuICB2YXIgZXZlbnRzID0gdGhpcy5wZW5kaW5nRXZlbnRzO1xuICB0aGlzLnBlbmRpbmdFdmVudHMgPSBbXTtcbiAgZXZlbnRzLmZvckVhY2goZnVuY3Rpb24oZXZlbnRBcmdzKSB7XG4gICAgdGhpcy5wcm94eUV2ZW50LmFwcGx5KHRoaXMsIGV2ZW50QXJncyk7XG4gIH0uYmluZCh0aGlzKSk7XG59O1xuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4vKipcbiAqIEBmaWxlb3ZlcnZpZXdcbiAqXG4gKiBSdW5zIGFsbCB0ZXN0cyBkZXNjcmliZWQgYnkgdGhpcyBkb2N1bWVudCwgYWZ0ZXIgZ2l2aW5nIHRoZSBkb2N1bWVudCBhIGNoYW5jZVxuICogdG8gbG9hZC5cbiAqXG4gKiBJZiBgV0NULndhaXRGb3JGcmFtZXdvcmtzYCBpcyB0cnVlICh0aGUgZGVmYXVsdCksIHdlIHdpbGwgYWxzbyB3YWl0IGZvciBhbnlcbiAqIHByZXNlbnQgd2ViIGNvbXBvbmVudCBmcmFtZXdvcmtzIHRvIGhhdmUgZnVsbHkgaW5pdGlhbGl6ZWQgYXMgd2VsbC5cbiAqL1xuKGZ1bmN0aW9uKCkge1xuXG4vLyBXZSBkbyBhIGJpdCBvZiBvdXIgb3duIGdyZXAgcHJvY2Vzc2luZyB0byBzcGVlZCB0aGluZ3MgdXAuXG52YXIgZ3JlcCA9IFdDVC51dGlsLmdldFBhcmFtKCdncmVwJyk7XG5cbi8vIGVudmlyb25tZW50LmpzIGlzIG9wdGlvbmFsOyB3ZSBuZWVkIHRvIHRha2UgYSBsb29rIGF0IG91ciBzY3JpcHQncyBVUkwgaW5cbi8vIG9yZGVyIHRvIGRldGVybWluZSBob3cgKG9yIG5vdCkgdG8gbG9hZCBpdC5cbnZhciBwcmVmaXggID0gd2luZG93LldDVFByZWZpeDtcbnZhciBsb2FkRW52ID0gIXdpbmRvdy5XQ1RTa2lwRW52aXJvbm1lbnQ7XG5cbnZhciBzY3JpcHRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnc2NyaXB0W3NyYyo9XCJicm93c2VyLmpzXCJdJyk7XG5pZiAoc2NyaXB0cy5sZW5ndGggIT09IDEgJiYgIXByZWZpeCkge1xuICB0aHJvdyBuZXcgRXJyb3IoJ1VuYWJsZSB0byBkZXRlY3Qgcm9vdCBVUkwgZm9yIFdDVC4gUGxlYXNlIHNldCBXQ1RQcmVmaXggYmVmb3JlIGluY2x1ZGluZyBicm93c2VyLmpzJyk7XG59XG5pZiAoc2NyaXB0c1swXSkge1xuICB2YXIgdGhpc1NjcmlwdCA9IHNjcmlwdHNbMF0uc3JjO1xuICBwcmVmaXggID0gdGhpc1NjcmlwdC5zdWJzdHJpbmcoMCwgdGhpc1NjcmlwdC5pbmRleE9mKCdicm93c2VyLmpzJykpO1xuICAvLyBZb3UgY2FuIHRhY2sgP3NraXBFbnYgb250byB0aGUgYnJvd3NlciBVUkwgdG8gc2tpcCB0aGUgZGVmYXVsdCBlbnZpcm9ubWVudC5cbiAgbG9hZEVudiA9IHRoaXNTY3JpcHQuaW5kZXhPZignc2tpcEVudicpID09PSAtMTtcbn1cbmlmIChsb2FkRW52KSB7XG4gIC8vIFN5bmNocm9ub3VzIGxvYWQgc28gdGhhdCB3ZSBjYW4gZ3VhcmFudGVlIGl0IGlzIHNldCB1cCBmb3IgZWFybHkgdGVzdHMuXG4gIGRvY3VtZW50LndyaXRlKCc8c2NyaXB0IHNyYz1cIicgKyBwcmVmaXggKyAnZW52aXJvbm1lbnQuanNcIj48L3NjcmlwdD4nKTsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG59XG5cbi8vIEdpdmUgYW55IHNjcmlwdHMgb24gdGhlIHBhZ2UgYSBjaGFuY2UgdG8gdHdpZGRsZSB0aGUgZW52aXJvbm1lbnQuXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgZnVuY3Rpb24oKSB7XG4gIFdDVC51dGlsLmRlYnVnKCdydW4gc3RhZ2U6IERPTUNvbnRlbnRMb2FkZWQnKTtcbiAgdmFyIHN1YlN1aXRlID0gV0NULlN1YlN1aXRlLmN1cnJlbnQoKTtcbiAgaWYgKHN1YlN1aXRlKSB7XG4gICAgV0NULnV0aWwuZGVidWcoJ3J1biBzdGFnZTogc3Vic3VpdGUnKTtcbiAgICAvLyBHaXZlIHRoZSBzdWJzdWl0ZSB0aW1lIHRvIGNvbXBsZXRlIGl0cyBsb2FkIChzZWUgYFN1YlN1aXRlLmxvYWRgKS5cbiAgICBzZXRUaW1lb3V0KHJ1blN1YlN1aXRlLmJpbmQobnVsbCwgc3ViU3VpdGUpLCAwKTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBCZWZvcmUgYW55dGhpbmcgZWxzZSwgd2UgbmVlZCB0byBlbnN1cmUgb3VyIGNvbW11bmljYXRpb24gY2hhbm5lbCB3aXRoIHRoZVxuICAvLyBDTEkgcnVubmVyIGlzIGVzdGFibGlzaGVkIChpZiB3ZSdyZSBydW5uaW5nIGluIHRoYXQgY29udGV4dCkuIExlc3NcbiAgLy8gYnVmZmVyaW5nIHRvIGRlYWwgd2l0aC5cbiAgV0NULkNMSVNvY2tldC5pbml0KGZ1bmN0aW9uKGVycm9yLCBzb2NrZXQpIHtcbiAgICBXQ1QudXRpbC5kZWJ1ZygncnVuIHN0YWdlOiBXQ1QuQ0xJU29ja2V0LmluaXQgZG9uZScsIGVycm9yKTtcbiAgICBpZiAoZXJyb3IpIHRocm93IGVycm9yO1xuICAgIHZhciBzdWJzdWl0ZXMgPSBXQ1QuX3N1aXRlc1RvTG9hZDtcbiAgICBpZiAoZ3JlcCkge1xuICAgICAgdmFyIGNsZWFuU3Vic3VpdGVzID0gW107XG4gICAgICBmb3IgKHZhciBpID0gMCwgc3Vic3VpdGU7IHN1YnN1aXRlID0gc3Vic3VpdGVzW2ldOyBpKyspIHtcbiAgICAgICAgaWYgKHN1YnN1aXRlLmluZGV4T2YoZ3JlcCkgPT09IDApIHtcbiAgICAgICAgICBjbGVhblN1YnN1aXRlcy5wdXNoKHN1YnN1aXRlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgc3Vic3VpdGVzID0gY2xlYW5TdWJzdWl0ZXM7XG4gICAgfVxuXG4gICAgdmFyIHJ1bm5lciA9IG5ld011bHRpU3VpdGVSdW5uZXIoc3Vic3VpdGVzLCBkZXRlcm1pbmVSZXBvcnRlcnMoc29ja2V0KSk7XG5cbiAgICBsb2FkRGVwZW5kZW5jaWVzKHJ1bm5lciwgZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgIFdDVC51dGlsLmRlYnVnKCdydW4gc3RhZ2U6IGxvYWREZXBlbmRlbmNpZXMgZG9uZScsIGVycm9yKTtcbiAgICAgIGlmIChlcnJvcikgdGhyb3cgZXJyb3I7XG5cbiAgICAgIHJ1bk11bHRpU3VpdGUocnVubmVyLCBzdWJzdWl0ZXMpO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuXG4vKipcbiAqIExvYWRzIGFueSBkZXBlbmRlbmNpZXMgb2YgdGhlIF9jdXJyZW50XyBzdWl0ZSAoZS5nLiBgLmpzYCBzb3VyY2VzKS5cbiAqXG4gKiBAcGFyYW0geyFXQ1QuTXVsdGlSdW5uZXJ9IHJ1bm5lciBUaGUgcnVubmVyIHdoZXJlIGVycm9ycyBzaG91bGQgYmUgcmVwb3J0ZWQuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBkb25lIEEgbm9kZSBzdHlsZSBjYWxsYmFjay5cbiAqL1xuZnVuY3Rpb24gbG9hZERlcGVuZGVuY2llcyhydW5uZXIsIGRvbmUpIHtcbiAgV0NULnV0aWwuZGVidWcoJ2xvYWREZXBlbmRlbmNpZXM6JywgV0NULl9kZXBlbmRlbmNpZXMpO1xuXG4gIGZ1bmN0aW9uIG9uRXJyb3IoZXZlbnQpIHtcbiAgICBydW5uZXIuZW1pdE91dE9mQmFuZFRlc3QoJ1Rlc3QgU3VpdGUgSW5pdGlhbGl6YXRpb24nLCBldmVudC5lcnJvcik7XG4gIH1cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgb25FcnJvcik7XG5cbiAgdmFyIGxvYWRlcnMgPSBXQ1QuX2RlcGVuZGVuY2llcy5tYXAoZnVuY3Rpb24oZmlsZSkge1xuICAgIC8vIFdlIG9ubHkgc3VwcG9ydCBgLmpzYCBkZXBlbmRlbmNpZXMgZm9yIG5vdy5cbiAgICByZXR1cm4gV0NULnV0aWwubG9hZFNjcmlwdC5iaW5kKFdDVC51dGlsLCBmaWxlKTtcbiAgfSk7XG5cbiAgV0NULnV0aWwucGFyYWxsZWwobG9hZGVycywgZnVuY3Rpb24oZXJyb3IpIHtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignZXJyb3InLCBvbkVycm9yKTtcbiAgICBkb25lKGVycm9yKTtcbiAgfSk7XG59XG5cbi8qKlxuICogQHBhcmFtIHshV0NULlN1YlN1aXRlfSBzdWJTdWl0ZSBUaGUgYFN1YlN1aXRlYCBmb3IgdGhpcyBmcmFtZSwgdGhhdCBgbW9jaGFgXG4gKiAgICAgc2hvdWxkIGJlIHJ1biBmb3IuXG4gKi9cbmZ1bmN0aW9uIHJ1blN1YlN1aXRlKHN1YlN1aXRlKSB7XG4gIFdDVC51dGlsLmRlYnVnKCdydW5TdWJTdWl0ZScsIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSk7XG4gIC8vIE5vdCB2ZXJ5IHByZXR0eS5cbiAgdmFyIHBhcmVudFdDVCA9IHN1YlN1aXRlLnBhcmVudFNjb3BlLldDVDtcbiAgc3ViU3VpdGUucHJlcGFyZShXQ1QpO1xuXG4gIHZhciBzdWl0ZU5hbWUgPSBwYXJlbnRXQ1QudXRpbC5yZWxhdGl2ZUxvY2F0aW9uKHdpbmRvdy5sb2NhdGlvbik7XG4gIHZhciByZXBvcnRlciAgPSBwYXJlbnRXQ1QuX211bHRpUnVubmVyLmNoaWxkUmVwb3J0ZXIoc3VpdGVOYW1lKTtcbiAgcnVuTW9jaGEocmVwb3J0ZXIsIHN1YlN1aXRlLmRvbmUuYmluZChzdWJTdWl0ZSkpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7IUFycmF5LjxzdHJpbmc+fSBzdWJzdWl0ZXMgVGhlIHN1YnN1aXRlcyB0aGF0IHdpbGwgYmUgcnVuLlxuICogQHBhcmFtIHshQXJyYXkuPCFNb2NoYS5yZXBvcnRlcnMuQmFzZT59IHJlcG9ydGVycyBUaGUgcmVwb3J0ZXJzIHRoYXQgc2hvdWxkXG4gKiAgICAgY29uc3VtZSB0aGUgb3V0cHV0IG9mIHRoaXMgYE11bHRpUnVubmVyYC5cbiAqIEByZXR1cm4geyFXQ1QuTXVsdGlSdW5uZXJ9IFRoZSBydW5uZXIgZm9yIG91ciByb290IHN1aXRlLlxuICovXG5mdW5jdGlvbiBuZXdNdWx0aVN1aXRlUnVubmVyKHN1YnN1aXRlcywgcmVwb3J0ZXJzKSB7XG4gIFdDVC51dGlsLmRlYnVnKCduZXdNdWx0aVN1aXRlUnVubmVyJywgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lKTtcbiAgV0NULl9tdWx0aVJ1bm5lciA9IG5ldyBXQ1QuTXVsdGlSdW5uZXIoc3Vic3VpdGVzLmxlbmd0aCArIDEsIHJlcG9ydGVycyk7XG4gIHJldHVybiBXQ1QuX211bHRpUnVubmVyO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7IVdDVC5NdWx0aVJ1bm5lcn0gVGhlIHJ1bm5lciBidWlsdCB2aWEgYG5ld011bHRpU3VpdGVSdW5uZXJgLlxuICogQHBhcmFtIHshQXJyYXkuPHN0cmluZz59IHN1YnN1aXRlcyBUaGUgc3Vic3VpdGVzIHRvIHJ1bi5cbiAqL1xuZnVuY3Rpb24gcnVuTXVsdGlTdWl0ZShydW5uZXIsIHN1YnN1aXRlcykge1xuICBXQ1QudXRpbC5kZWJ1ZygncnVuTXVsdGlTdWl0ZScsIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSk7XG4gIHZhciByb290TmFtZSA9IFdDVC51dGlsLnJlbGF0aXZlTG9jYXRpb24od2luZG93LmxvY2F0aW9uKTtcblxuICB2YXIgc3VpdGVSdW5uZXJzID0gW1xuICAgIC8vIFJ1biB0aGUgbG9jYWwgdGVzdHMgKGlmIGFueSkgZmlyc3QsIG5vdCBzdG9wcGluZyBvbiBlcnJvcjtcbiAgICBydW5Nb2NoYS5iaW5kKG51bGwsIHJ1bm5lci5jaGlsZFJlcG9ydGVyKHJvb3ROYW1lKSksXG4gIF07XG5cbiAgLy8gQXMgd2VsbCBhcyBhbnkgc3ViIHN1aXRlcy4gQWdhaW4sIGRvbid0IHN0b3Agb24gZXJyb3IuXG4gIHN1YnN1aXRlcy5mb3JFYWNoKGZ1bmN0aW9uKGZpbGUpIHtcbiAgICBzdWl0ZVJ1bm5lcnMucHVzaChmdW5jdGlvbihuZXh0KSB7XG4gICAgICB2YXIgc3ViU3VpdGUgPSBuZXcgV0NULlN1YlN1aXRlKGZpbGUsIHdpbmRvdyk7XG4gICAgICBydW5uZXIuZW1pdCgnc3ViU3VpdGUgc3RhcnQnLCBzdWJTdWl0ZSk7XG4gICAgICBzdWJTdWl0ZS5ydW4oZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgICAgcnVubmVyLmVtaXQoJ3N1YlN1aXRlIGVuZCcsIHN1YlN1aXRlKTtcblxuICAgICAgICBpZiAoZXJyb3IpIHJ1bm5lci5lbWl0T3V0T2ZCYW5kVGVzdChmaWxlLCBlcnJvcik7XG4gICAgICAgIG5leHQoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBXQ1QudXRpbC5wYXJhbGxlbChzdWl0ZVJ1bm5lcnMsIFdDVC5udW1Db25jdXJyZW50U3VpdGVzLCBmdW5jdGlvbihlcnJvcikge1xuICAgIFdDVC51dGlsLmRlYnVnKCdydW5NdWx0aVN1aXRlIGRvbmUnLCBlcnJvcik7XG4gICAgcnVubmVyLmRvbmUoKTtcbiAgfSk7XG59XG5cbi8qKlxuICogS2lja3Mgb2ZmIGEgbW9jaGEgcnVuLCB3YWl0aW5nIGZvciBmcmFtZXdvcmtzIHRvIGxvYWQgaWYgbmVjZXNzYXJ5LlxuICpcbiAqIEBwYXJhbSB7IU1vY2hhLnJlcG9ydGVycy5CYXNlfSByZXBvcnRlciBUaGUgcmVwb3J0ZXIgdG8gcGFzcyB0byBgbW9jaGEucnVuYC5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRvbmUgQSBjYWxsYmFjayBmaXJlZCwgX25vIGVycm9yIGlzIHBhc3NlZF8uXG4gKi9cbmZ1bmN0aW9uIHJ1bk1vY2hhKHJlcG9ydGVyLCBkb25lLCB3YWl0ZWQpIHtcbiAgaWYgKFdDVC53YWl0Rm9yRnJhbWV3b3JrcyAmJiAhd2FpdGVkKSB7XG4gICAgV0NULnV0aWwud2hlbkZyYW1ld29ya3NSZWFkeShydW5Nb2NoYS5iaW5kKG51bGwsIHJlcG9ydGVyLCBkb25lLCB0cnVlKSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIFdDVC51dGlsLmRlYnVnKCdydW5Nb2NoYScsIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSk7XG5cbiAgbW9jaGEucmVwb3J0ZXIocmVwb3J0ZXIpO1xuICBtb2NoYS5zdWl0ZS50aXRsZSA9IHJlcG9ydGVyLnRpdGxlO1xuICBtb2NoYS5ncmVwKGdyZXApO1xuXG4gIC8vIFdlIGNhbid0IHVzZSBgbW9jaGEucnVuYCBiZWNhdXNlIGl0IGJhc2hlcyBvdmVyIGdyZXAsIGludmVydCwgYW5kIGZyaWVuZHMuXG4gIC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vdmlzaW9ubWVkaWEvbW9jaGEvYmxvYi9tYXN0ZXIvc3VwcG9ydC90YWlsLmpzI0wxMzdcbiAgdmFyIHJ1bm5lciA9IE1vY2hhLnByb3RvdHlwZS5ydW4uY2FsbChtb2NoYSwgZnVuY3Rpb24oZXJyb3IpIHtcbiAgICBNb2NoYS51dGlscy5oaWdobGlnaHRUYWdzKCdjb2RlJyk7XG4gICAgZG9uZSgpOyAgLy8gV2UgaWdub3JlIHRoZSBNb2NoYSBmYWlsdXJlIGNvdW50LlxuICB9KTtcblxuICAvLyBNb2NoYSdzIGRlZmF1bHQgYG9uZXJyb3JgIGhhbmRsaW5nIHN0cmlwcyB0aGUgc3RhY2sgKHRvIHN1cHBvcnQgcmVhbGx5IG9sZFxuICAvLyBicm93c2VycykuIFdlIHVwZ3JhZGUgdGhpcyB0byBnZXQgYmV0dGVyIHN0YWNrcyBmb3IgYXN5bmMgZXJyb3JzLlxuICAvL1xuICAvLyBUT0RPKG5ldmlyKTogQ2FuIHdlIGV4cGFuZCBzdXBwb3J0IHRvIG90aGVyIGJyb3dzZXJzP1xuICBpZiAobmF2aWdhdG9yLnVzZXJBZ2VudC5tYXRjaCgvY2hyb21lL2kpKSB7XG4gICAgd2luZG93Lm9uZXJyb3IgPSBudWxsO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICBpZiAoIWV2ZW50LmVycm9yKSByZXR1cm47XG4gICAgICBpZiAoZXZlbnQuZXJyb3IuaWdub3JlKSByZXR1cm47XG4gICAgICBydW5uZXIudW5jYXVnaHQoZXZlbnQuZXJyb3IpO1xuICAgIH0pO1xuICB9XG59XG5cbi8qKlxuICogRmlndXJlIG91dCB3aGljaCByZXBvcnRlcnMgc2hvdWxkIGJlIHVzZWQgZm9yIHRoZSBjdXJyZW50IGB3aW5kb3dgLlxuICpcbiAqIEBwYXJhbSB7V0NULkNMSVNvY2tldH0gc29ja2V0IFRoZSBDTEkgc29ja2V0LCBpZiBwcmVzZW50LlxuICovXG5mdW5jdGlvbiBkZXRlcm1pbmVSZXBvcnRlcnMoc29ja2V0KSB7XG4gIHZhciByZXBvcnRlcnMgPSBbXG4gICAgV0NULnJlcG9ydGVycy5UaXRsZSxcbiAgICBXQ1QucmVwb3J0ZXJzLkNvbnNvbGUsXG4gIF07XG5cbiAgaWYgKHNvY2tldCkge1xuICAgIHJlcG9ydGVycy5wdXNoKGZ1bmN0aW9uKHJ1bm5lcikge1xuICAgICAgc29ja2V0Lm9ic2VydmUocnVubmVyKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChXQ1QuX3N1aXRlc1RvTG9hZC5sZW5ndGggPiAwIHx8IFdDVC5fZGVwZW5kZW5jaWVzLmxlbmd0aCA+IDApIHtcbiAgICByZXBvcnRlcnMucHVzaChXQ1QucmVwb3J0ZXJzLkhUTUwpO1xuICB9XG5cbiAgcmV0dXJuIHJlcG9ydGVycztcbn1cblxufSkoKTtcbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuLyoqXG4gKiBAZmlsZW92ZXJ2aWV3XG4gKlxuICogUHJvdmlkZXMgYXV0b21hdGljIGNvbmZpZ3VyYXRpb24gb2YgTW9jaGEgYnkgc3R1YmJpbmcgb3V0IHBvdGVudGlhbCBNb2NoYVxuICogbWV0aG9kcywgYW5kIGNvbmZpZ3VyaW5nIE1vY2hhIGFwcHJvcHJpYXRlbHkgb25jZSB5b3UgY2FsbCB0aGVtLlxuICpcbiAqIEp1c3QgY2FsbCBgc3VpdGVgLCBgZGVzY3JpYmVgLCBldGMgbm9ybWFsbHksIGFuZCBldmVyeXRoaW5nIHNob3VsZCBKdXN0IFdvcmsuXG4gKi9cbihmdW5jdGlvbigpIHtcblxuLy8gTW9jaGEgZ2xvYmFsIGhlbHBlcnMsIGJyb2tlbiBvdXQgYnkgdGVzdGluZyBtZXRob2QuXG52YXIgTU9DSEFfRVhQT1JUUyA9IHtcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3Zpc2lvbm1lZGlhL21vY2hhL2Jsb2IvbWFzdGVyL2xpYi9pbnRlcmZhY2VzL3RkZC5qc1xuICB0ZGQ6IFtcbiAgICAnc2V0dXAnLFxuICAgICd0ZWFyZG93bicsXG4gICAgJ3N1aXRlU2V0dXAnLFxuICAgICdzdWl0ZVRlYXJkb3duJyxcbiAgICAnc3VpdGUnLFxuICAgICd0ZXN0JyxcbiAgXSxcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3Zpc2lvbm1lZGlhL21vY2hhL2Jsb2IvbWFzdGVyL2xpYi9pbnRlcmZhY2VzL3RkZC5qc1xuICBiZGQ6IFtcbiAgICAnYmVmb3JlJyxcbiAgICAnYWZ0ZXInLFxuICAgICdiZWZvcmVFYWNoJyxcbiAgICAnYWZ0ZXJFYWNoJyxcbiAgICAnZGVzY3JpYmUnLFxuICAgICd4ZGVzY3JpYmUnLFxuICAgICd4Y29udGV4dCcsXG4gICAgJ2l0JyxcbiAgICAneGl0JyxcbiAgICAneHNwZWNpZnknLFxuICBdLFxufTtcblxuLy8gV2UgZXhwb3NlIGFsbCBNb2NoYSBtZXRob2RzIHVwIGZyb250LCBjb25maWd1cmluZyBhbmQgcnVubmluZyBtb2NoYVxuLy8gYXV0b21hdGljYWxseSB3aGVuIHlvdSBjYWxsIHRoZW0uXG4vL1xuLy8gVGhlIGFzc3VtcHRpb24gaXMgdGhhdCBpdCBpcyBhIG9uZS1vZmYgKHN1Yi0pc3VpdGUgb2YgdGVzdHMgYmVpbmcgcnVuLlxuT2JqZWN0LmtleXMoTU9DSEFfRVhQT1JUUykuZm9yRWFjaChmdW5jdGlvbih1aSkge1xuICBNT0NIQV9FWFBPUlRTW3VpXS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIHdpbmRvd1trZXldID0gZnVuY3Rpb24gd3JhcHBlZE1vY2hhRnVuY3Rpb24oKSB7XG4gICAgICBXQ1Quc2V0dXBNb2NoYSh1aSk7XG4gICAgICBpZiAoIXdpbmRvd1trZXldIHx8IHdpbmRvd1trZXldID09PSB3cmFwcGVkTW9jaGFGdW5jdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIG1vY2hhLnNldHVwIHRvIGRlZmluZSAnICsga2V5KTtcbiAgICAgIH1cbiAgICAgIHdpbmRvd1trZXldLmFwcGx5KHdpbmRvdywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9KTtcbn0pO1xuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSB1aSBTZXRzIHVwIG1vY2hhIHRvIHJ1biBgdWlgLXN0eWxlIHRlc3RzLlxuICovXG5XQ1Quc2V0dXBNb2NoYSA9IGZ1bmN0aW9uIHNldHVwTW9jaGEodWkpIHtcbiAgaWYgKFdDVC5fbW9jaGFVSSAmJiBXQ1QuX21vY2hhVUkgPT09IHVpKSByZXR1cm47XG4gIGlmIChXQ1QuX21vY2hhVUkgJiYgV0NULl9tb2NoYVVJICE9PSB1aSkge1xuICAgIHRocm93IG5ldyBFcnJvcignTWl4aW5nICcgKyBXQ1QuX21vY2hhVUkgKyAnIGFuZCAnICsgdWkgKyAnIE1vY2hhIHN0eWxlcyBpcyBub3Qgc3VwcG9ydGVkLicpO1xuICB9XG4gIG1vY2hhLnNldHVwKHt1aTogdWksIHRpbWVvdXQ6IDYwICogMTAwMH0pOyAgLy8gTm90ZSB0aGF0IHRoZSByZXBvcnRlciBpcyBjb25maWd1cmVkIGluIHJ1bi5qcy5cbiAgV0NULm1vY2hhSXNTZXR1cCA9IHRydWU7XG59O1xuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbldDVC5yZXBvcnRlcnMuQ29uc29sZSA9IENvbnNvbGU7XG5cbi8vIFdlIGNhcHR1cmUgY29uc29sZSBldmVudHMgd2hlbiBydW5uaW5nIHRlc3RzOyBzbyBtYWtlIHN1cmUgd2UgaGF2ZSBhXG4vLyByZWZlcmVuY2UgdG8gdGhlIG9yaWdpbmFsIG9uZS5cbnZhciBjb25zb2xlID0gd2luZG93LmNvbnNvbGU7XG5cbnZhciBGT05UID0gJztmb250OiBub3JtYWwgMTNweCBcIlJvYm90b1wiLCBcIkhlbHZldGljYSBOZXVlXCIsIFwiSGVsdmV0aWNhXCIsIHNhbnMtc2VyaWY7JztcbnZhciBTVFlMRVMgPSB7XG4gIHBsYWluOiAgIEZPTlQsXG4gIHN1aXRlOiAgICdjb2xvcjogIzVjNmJjMCcgKyBGT05ULFxuICB0ZXN0OiAgICBGT05ULFxuICBwYXNzaW5nOiAnY29sb3I6ICMyNTliMjQnICsgRk9OVCxcbiAgcGVuZGluZzogJ2NvbG9yOiAjZTY1MTAwJyArIEZPTlQsXG4gIGZhaWxpbmc6ICdjb2xvcjogI2M0MTQxMScgKyBGT05ULFxuICBzdGFjazogICAnY29sb3I6ICNjNDE0MTEnLFxuICByZXN1bHRzOiBGT05UICsgJ2ZvbnQtc2l6ZTogMTZweCcsXG59O1xuXG4vLyBJIGRvbid0IHRoaW5rIHdlIGNhbiBmZWF0dXJlIGRldGVjdCB0aGlzIG9uZS4uLlxudmFyIHVzZXJBZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKTtcbnZhciBDQU5fU1RZTEVfTE9HICAgPSB1c2VyQWdlbnQubWF0Y2goJ2ZpcmVmb3gnKSB8fCB1c2VyQWdlbnQubWF0Y2goJ3dlYmtpdCcpO1xudmFyIENBTl9TVFlMRV9HUk9VUCA9IHVzZXJBZ2VudC5tYXRjaCgnd2Via2l0Jyk7XG4vLyBUcmFjayB0aGUgaW5kZW50IGZvciBmYWtlZCBgY29uc29sZS5ncm91cGBcbnZhciBsb2dJbmRlbnQgPSAnJztcblxuZnVuY3Rpb24gbG9nKHRleHQsIHN0eWxlKSB7XG4gIHRleHQgPSB0ZXh0LnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obCkgeyByZXR1cm4gbG9nSW5kZW50ICsgbDsgfSkuam9pbignXFxuJyk7XG4gIGlmIChDQU5fU1RZTEVfTE9HKSB7XG4gICAgY29uc29sZS5sb2coJyVjJyArIHRleHQsIFNUWUxFU1tzdHlsZV0gfHwgU1RZTEVTLnBsYWluKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZyh0ZXh0KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBsb2dHcm91cCh0ZXh0LCBzdHlsZSkge1xuICBpZiAoQ0FOX1NUWUxFX0dST1VQKSB7XG4gICAgY29uc29sZS5ncm91cCgnJWMnICsgdGV4dCwgU1RZTEVTW3N0eWxlXSB8fCBTVFlMRVMucGxhaW4pO1xuICB9IGVsc2UgaWYgKGNvbnNvbGUuZ3JvdXApIHtcbiAgICBjb25zb2xlLmdyb3VwKHRleHQpO1xuICB9IGVsc2Uge1xuICAgIGxvZ0luZGVudCA9IGxvZ0luZGVudCArICcgICc7XG4gICAgbG9nKHRleHQsIHN0eWxlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBsb2dHcm91cEVuZCgpIHtcbiAgaWYgKGNvbnNvbGUuZ3JvdXBFbmQpIHtcbiAgICBjb25zb2xlLmdyb3VwRW5kKCk7XG4gIH0gZWxzZSB7XG4gICAgbG9nSW5kZW50ID0gbG9nSW5kZW50LnN1YnN0cigwLCBsb2dJbmRlbnQubGVuZ3RoIC0gMik7XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9nRXhjZXB0aW9uKGVycm9yKSB7XG4gIGxvZyhlcnJvci5zdGFjayB8fCBlcnJvci5tZXNzYWdlIHx8IGVycm9yLCAnc3RhY2snKTtcbn1cblxuLyoqXG4gKiBBIE1vY2hhIHJlcG9ydGVyIHRoYXQgbG9ncyByZXN1bHRzIG91dCB0byB0aGUgd2ViIGBjb25zb2xlYC5cbiAqXG4gKiBAcGFyYW0geyFNb2NoYS5SdW5uZXJ9IHJ1bm5lciBUaGUgcnVubmVyIHRoYXQgaXMgYmVpbmcgcmVwb3J0ZWQgb24uXG4gKi9cbmZ1bmN0aW9uIENvbnNvbGUocnVubmVyKSB7XG4gIE1vY2hhLnJlcG9ydGVycy5CYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICBydW5uZXIub24oJ3N1aXRlJywgZnVuY3Rpb24oc3VpdGUpIHtcbiAgICBpZiAoc3VpdGUucm9vdCkgcmV0dXJuO1xuICAgIGxvZ0dyb3VwKHN1aXRlLnRpdGxlLCAnc3VpdGUnKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ3N1aXRlIGVuZCcsIGZ1bmN0aW9uKHN1aXRlKSB7XG4gICAgaWYgKHN1aXRlLnJvb3QpIHJldHVybjtcbiAgICBsb2dHcm91cEVuZCgpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIHJ1bm5lci5vbigndGVzdCcsIGZ1bmN0aW9uKHRlc3QpIHtcbiAgICBsb2dHcm91cCh0ZXN0LnRpdGxlLCAndGVzdCcpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIHJ1bm5lci5vbigncGVuZGluZycsIGZ1bmN0aW9uKHRlc3QpIHtcbiAgICBsb2dHcm91cCh0ZXN0LnRpdGxlLCAncGVuZGluZycpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycm9yKSB7XG4gICAgbG9nRXhjZXB0aW9uKGVycm9yKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24odGVzdCkge1xuICAgIGxvZ0dyb3VwRW5kKCk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCB0aGlzLmxvZ1N1bW1hcnkuYmluZCh0aGlzKSk7XG59XG5Db25zb2xlLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoTW9jaGEucmVwb3J0ZXJzLkJhc2UucHJvdG90eXBlKTtcblxuLyoqIFByaW50cyBvdXQgYSBmaW5hbCBzdW1tYXJ5IG9mIHRlc3QgcmVzdWx0cy4gKi9cbkNvbnNvbGUucHJvdG90eXBlLmxvZ1N1bW1hcnkgPSBmdW5jdGlvbiBsb2dTdW1tYXJ5KCkge1xuICBsb2dHcm91cCgnVGVzdCBSZXN1bHRzJywgJ3Jlc3VsdHMnKTtcblxuICBpZiAodGhpcy5zdGF0cy5mYWlsdXJlcyA+IDApIHtcbiAgICBsb2coV0NULnV0aWwucGx1cmFsaXplZFN0YXQodGhpcy5zdGF0cy5mYWlsdXJlcywgJ2ZhaWxpbmcnKSwgJ2ZhaWxpbmcnKTtcbiAgfVxuICBpZiAodGhpcy5zdGF0cy5wZW5kaW5nID4gMCkge1xuICAgIGxvZyhXQ1QudXRpbC5wbHVyYWxpemVkU3RhdCh0aGlzLnN0YXRzLnBlbmRpbmcsICdwZW5kaW5nJyksICdwZW5kaW5nJyk7XG4gIH1cbiAgbG9nKFdDVC51dGlsLnBsdXJhbGl6ZWRTdGF0KHRoaXMuc3RhdHMucGFzc2VzLCAncGFzc2luZycpKTtcblxuICBpZiAoIXRoaXMuc3RhdHMuZmFpbHVyZXMpIHtcbiAgICBsb2coJ3Rlc3Qgc3VpdGUgcGFzc2VkJywgJ3Bhc3NpbmcnKTtcbiAgfVxuICBsb2coJ0V2YWx1YXRlZCAnICsgdGhpcy5zdGF0cy50ZXN0cyArICcgdGVzdHMgaW4gJyArIHRoaXMuc3RhdHMuZHVyYXRpb24gKyAnbXMuJyk7XG4gIGxvZ0dyb3VwRW5kKCk7XG59O1xuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbldDVC5yZXBvcnRlcnMuSFRNTCA9IEhUTUw7XG5cbi8qKlxuICogV0NULXNwZWNpZmljIGJlaGF2aW9yIG9uIHRvcCBvZiBNb2NoYSdzIGRlZmF1bHQgSFRNTCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0geyFNb2NoYS5SdW5uZXJ9IHJ1bm5lciBUaGUgcnVubmVyIHRoYXQgaXMgYmVpbmcgcmVwb3J0ZWQgb24uXG4gKi9cbmZ1bmN0aW9uIEhUTUwocnVubmVyKSB7XG4gIHZhciBvdXRwdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgb3V0cHV0LmlkID0gJ21vY2hhJztcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdXRwdXQpO1xuXG4gIHJ1bm5lci5vbignc3VpdGUnLCBmdW5jdGlvbih0ZXN0KSB7XG4gICAgdGhpcy50b3RhbCA9IHJ1bm5lci50b3RhbDtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBNb2NoYS5yZXBvcnRlcnMuSFRNTC5jYWxsKHRoaXMsIHJ1bm5lcik7XG59XG5IVE1MLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoTW9jaGEucmVwb3J0ZXJzLkhUTUwucHJvdG90eXBlKTtcblxufSkoKTtcbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuKGZ1bmN0aW9uKCkge1xuXG5XQ1QucmVwb3J0ZXJzLlRpdGxlID0gVGl0bGU7XG5cbnZhciBBUkNfT0ZGU0VUID0gMDsgLy8gc3RhcnQgYXQgdGhlIHJpZ2h0LlxudmFyIEFSQ19XSURUSCAgPSA2O1xuXG4vKipcbiAqIEEgTW9jaGEgcmVwb3J0ZXIgdGhhdCB1cGRhdGVzIHRoZSBkb2N1bWVudCdzIHRpdGxlIGFuZCBmYXZpY29uIHdpdGhcbiAqIGF0LWEtZ2xhbmNlIHN0YXRzLlxuICpcbiAqIEBwYXJhbSB7IU1vY2hhLlJ1bm5lcn0gcnVubmVyIFRoZSBydW5uZXIgdGhhdCBpcyBiZWluZyByZXBvcnRlZCBvbi5cbiAqL1xuZnVuY3Rpb24gVGl0bGUocnVubmVyKSB7XG4gIE1vY2hhLnJlcG9ydGVycy5CYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgdGhpcy5yZXBvcnQuYmluZCh0aGlzKSk7XG59XG5cbi8qKiBSZXBvcnRzIGN1cnJlbnQgc3RhdHMgdmlhIHRoZSBwYWdlIHRpdGxlIGFuZCBmYXZpY29uLiAqL1xuVGl0bGUucHJvdG90eXBlLnJlcG9ydCA9IGZ1bmN0aW9uIHJlcG9ydCgpIHtcbiAgdGhpcy51cGRhdGVUaXRsZSgpO1xuICB0aGlzLnVwZGF0ZUZhdmljb24oKTtcbn07XG5cbi8qKiBVcGRhdGVzIHRoZSBkb2N1bWVudCB0aXRsZSB3aXRoIGEgc3VtbWFyeSBvZiBjdXJyZW50IHN0YXRzLiAqL1xuVGl0bGUucHJvdG90eXBlLnVwZGF0ZVRpdGxlID0gZnVuY3Rpb24gdXBkYXRlVGl0bGUoKSB7XG4gIGlmICh0aGlzLnN0YXRzLmZhaWx1cmVzID4gMCkge1xuICAgIGRvY3VtZW50LnRpdGxlID0gV0NULnV0aWwucGx1cmFsaXplZFN0YXQodGhpcy5zdGF0cy5mYWlsdXJlcywgJ2ZhaWxpbmcnKTtcbiAgfSBlbHNlIHtcbiAgICBkb2N1bWVudC50aXRsZSA9IFdDVC51dGlsLnBsdXJhbGl6ZWRTdGF0KHRoaXMuc3RhdHMucGFzc2VzLCAncGFzc2luZycpO1xuICB9XG59O1xuXG4vKipcbiAqIERyYXdzIGFuIGFyYyBmb3IgdGhlIGZhdmljb24gc3RhdHVzLCByZWxhdGl2ZSB0byB0aGUgdG90YWwgbnVtYmVyIG9mIHRlc3RzLlxuICpcbiAqIEBwYXJhbSB7IUNhbnZhc1JlbmRlcmluZ0NvbnRleHQyRH0gY29udGV4dFxuICogQHBhcmFtIHtudW1iZXJ9IHRvdGFsXG4gKiBAcGFyYW0ge251bWJlcn0gc3RhcnRcbiAqIEBwYXJhbSB7bnVtYmVyfSBsZW5ndGhcbiAqIEBwYXJhbSB7c3RyaW5nfSBjb2xvclxuICovXG5mdW5jdGlvbiBkcmF3RmF2aWNvbkFyYyhjb250ZXh0LCB0b3RhbCwgc3RhcnQsIGxlbmd0aCwgY29sb3IpIHtcbiAgdmFyIGFyY1N0YXJ0ID0gQVJDX09GRlNFVCArIE1hdGguUEkgKiAyICogKHN0YXJ0IC8gdG90YWwpO1xuICB2YXIgYXJjRW5kICAgPSBBUkNfT0ZGU0VUICsgTWF0aC5QSSAqIDIgKiAoKHN0YXJ0ICsgbGVuZ3RoKSAvIHRvdGFsKTtcblxuICBjb250ZXh0LmJlZ2luUGF0aCgpO1xuICBjb250ZXh0LnN0cm9rZVN0eWxlID0gY29sb3I7XG4gIGNvbnRleHQubGluZVdpZHRoICAgPSBBUkNfV0lEVEg7XG4gIGNvbnRleHQuYXJjKDE2LCAxNiwgMTYgLSBBUkNfV0lEVEggLyAyLCBhcmNTdGFydCwgYXJjRW5kKTtcbiAgY29udGV4dC5zdHJva2UoKTtcbn1cblxuLyoqIFVwZGF0ZXMgdGhlIGRvY3VtZW50J3MgZmF2aWNvbiB3LyBhIHN1bW1hcnkgb2YgY3VycmVudCBzdGF0cy4gKi9cblRpdGxlLnByb3RvdHlwZS51cGRhdGVGYXZpY29uID0gZnVuY3Rpb24gdXBkYXRlRmF2aWNvbigpIHtcbiAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuICBjYW52YXMuaGVpZ2h0ID0gY2FudmFzLndpZHRoID0gMzI7XG4gIHZhciBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cbiAgdmFyIHBhc3NpbmcgPSB0aGlzLnN0YXRzLnBhc3NlcztcbiAgdmFyIHBlbmRpbmcgPSB0aGlzLnN0YXRzLnBlbmRpbmc7XG4gIHZhciBmYWlsaW5nID0gdGhpcy5zdGF0cy5mYWlsdXJlcztcbiAgdmFyIHRvdGFsICAgPSBNYXRoLm1heCh0aGlzLnJ1bm5lci50b3RhbCwgcGFzc2luZyArIHBlbmRpbmcgKyBmYWlsaW5nKTtcbiAgZHJhd0Zhdmljb25BcmMoY29udGV4dCwgdG90YWwsIDAsICAgICAgICAgICAgICAgICBwYXNzaW5nLCAnIzBlOWM1NycpO1xuICBkcmF3RmF2aWNvbkFyYyhjb250ZXh0LCB0b3RhbCwgcGFzc2luZywgICAgICAgICAgIHBlbmRpbmcsICcjZjNiMzAwJyk7XG4gIGRyYXdGYXZpY29uQXJjKGNvbnRleHQsIHRvdGFsLCBwZW5kaW5nICsgcGFzc2luZywgZmFpbGluZywgJyNmZjU2MjEnKTtcblxuICB0aGlzLnNldEZhdmljb24oY2FudmFzLnRvRGF0YVVSTCgpKTtcbn07XG5cbi8qKiBTZXRzIHRoZSBjdXJyZW50IGZhdmljb24gYnkgVVJMLiAqL1xuVGl0bGUucHJvdG90eXBlLnNldEZhdmljb24gPSBmdW5jdGlvbiBzZXRGYXZpY29uKHVybCkge1xuICB2YXIgY3VycmVudCA9IGRvY3VtZW50LmhlYWQucXVlcnlTZWxlY3RvcignbGlua1tyZWw9XCJpY29uXCJdJyk7XG4gIGlmIChjdXJyZW50KSB7XG4gICAgZG9jdW1lbnQuaGVhZC5yZW1vdmVDaGlsZChjdXJyZW50KTtcbiAgfVxuXG4gIHZhciBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGluaycpO1xuICBsaW5rLnJlbCA9ICdpY29uJztcbiAgbGluay50eXBlID0gJ2ltYWdlL3gtaWNvbic7XG4gIGxpbmsuaHJlZiA9IHVybDtcbiAgbGluay5zZXRBdHRyaWJ1dGUoJ3NpemVzJywgJzMyeDMyJyk7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQobGluayk7XG59O1xuXG59KSgpO1xuIl0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9