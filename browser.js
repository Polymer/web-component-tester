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
;(function(){

/**
 * Require the given path.
 *
 * @param {String} path
 * @return {Object} exports
 * @api public
 */

function require(path, parent, orig) {
  var resolved = require.resolve(path);

  // lookup failed
  if (null == resolved) {
    orig = orig || path;
    parent = parent || 'root';
    var err = new Error('Failed to require "' + orig + '" from "' + parent + '"');
    err.path = orig;
    err.parent = parent;
    err.require = true;
    throw err;
  }

  var module = require.modules[resolved];

  // perform real require()
  // by invoking the module's
  // registered function
  if (!module._resolving && !module.exports) {
    var mod = {};
    mod.exports = {};
    mod.client = mod.component = true;
    module._resolving = true;
    module.call(this, mod.exports, require.relative(resolved), mod);
    delete module._resolving;
    module.exports = mod.exports;
  }

  return module.exports;
}

/**
 * Registered modules.
 */

require.modules = {};

/**
 * Registered aliases.
 */

require.aliases = {};

/**
 * Resolve `path`.
 *
 * Lookup:
 *
 *   - PATH/index.js
 *   - PATH.js
 *   - PATH
 *
 * @param {String} path
 * @return {String} path or null
 * @api private
 */

require.resolve = function(path) {
  if (path.charAt(0) === '/') path = path.slice(1);

  var paths = [
    path,
    path + '.js',
    path + '.json',
    path + '/index.js',
    path + '/index.json'
  ];

  for (var i = 0; i < paths.length; i++) {
    var path = paths[i];
    if (require.modules.hasOwnProperty(path)) return path;
    if (require.aliases.hasOwnProperty(path)) return require.aliases[path];
  }
};

/**
 * Normalize `path` relative to the current path.
 *
 * @param {String} curr
 * @param {String} path
 * @return {String}
 * @api private
 */

require.normalize = function(curr, path) {
  var segs = [];

  if ('.' != path.charAt(0)) return path;

  curr = curr.split('/');
  path = path.split('/');

  for (var i = 0; i < path.length; ++i) {
    if ('..' == path[i]) {
      curr.pop();
    } else if ('.' != path[i] && '' != path[i]) {
      segs.push(path[i]);
    }
  }

  return curr.concat(segs).join('/');
};

/**
 * Register module at `path` with callback `definition`.
 *
 * @param {String} path
 * @param {Function} definition
 * @api private
 */

require.register = function(path, definition) {
  require.modules[path] = definition;
};

/**
 * Alias a module definition.
 *
 * @param {String} from
 * @param {String} to
 * @api private
 */

require.alias = function(from, to) {
  if (!require.modules.hasOwnProperty(from)) {
    throw new Error('Failed to alias "' + from + '", it does not exist');
  }
  require.aliases[to] = from;
};

/**
 * Return a require function relative to the `parent` path.
 *
 * @param {String} parent
 * @return {Function}
 * @api private
 */

require.relative = function(parent) {
  var p = require.normalize(parent, '..');

  /**
   * lastIndexOf helper.
   */

  function lastIndexOf(arr, obj) {
    var i = arr.length;
    while (i--) {
      if (arr[i] === obj) return i;
    }
    return -1;
  }

  /**
   * The relative require() itself.
   */

  function localRequire(path) {
    var resolved = localRequire.resolve(path);
    return require(resolved, parent, path);
  }

  /**
   * Resolve relative to the parent.
   */

  localRequire.resolve = function(path) {
    var c = path.charAt(0);
    if ('/' == c) return path.slice(1);
    if ('.' == c) return require.normalize(p, path);

    // resolve deps by returning
    // the dep in the nearest "deps"
    // directory
    var segs = parent.split('/');
    var i = lastIndexOf(segs, 'deps') + 1;
    if (!i) i = 0;
    path = segs.slice(0, i + 1).join('/') + '/deps/' + path;
    return path;
  };

  /**
   * Check if module is defined at `path`.
   */

  localRequire.exists = function(path) {
    return require.modules.hasOwnProperty(localRequire.resolve(path));
  };

  return localRequire;
};
require.register("chaijs-assertion-error/index.js", function(exports, require, module){
/*!
 * assertion-error
 * Copyright(c) 2013 Jake Luer <jake@qualiancy.com>
 * MIT Licensed
 */

/*!
 * Return a function that will copy properties from
 * one object to another excluding any originally
 * listed. Returned function will create a new `{}`.
 *
 * @param {String} excluded properties ...
 * @return {Function}
 */

function exclude () {
  var excludes = [].slice.call(arguments);

  function excludeProps (res, obj) {
    Object.keys(obj).forEach(function (key) {
      if (!~excludes.indexOf(key)) res[key] = obj[key];
    });
  }

  return function extendExclude () {
    var args = [].slice.call(arguments)
      , i = 0
      , res = {};

    for (; i < args.length; i++) {
      excludeProps(res, args[i]);
    }

    return res;
  };
};

/*!
 * Primary Exports
 */

module.exports = AssertionError;

/**
 * ### AssertionError
 *
 * An extension of the JavaScript `Error` constructor for
 * assertion and validation scenarios.
 *
 * @param {String} message
 * @param {Object} properties to include (optional)
 * @param {callee} start stack function (optional)
 */

function AssertionError (message, _props, ssf) {
  var extend = exclude('name', 'message', 'stack', 'constructor', 'toJSON')
    , props = extend(_props || {});

  // default values
  this.message = message || 'Unspecified AssertionError';
  this.showDiff = false;

  // copy from properties
  for (var key in props) {
    this[key] = props[key];
  }

  // capture stack trace
  ssf = ssf || arguments.callee;
  if (ssf && Error.captureStackTrace) {
    Error.captureStackTrace(this, ssf);
  }
}

/*!
 * Inherit from Error.prototype
 */

AssertionError.prototype = Object.create(Error.prototype);

/*!
 * Statically set name
 */

AssertionError.prototype.name = 'AssertionError';

/*!
 * Ensure correct constructor
 */

AssertionError.prototype.constructor = AssertionError;

/**
 * Allow errors to be converted to JSON for static transfer.
 *
 * @param {Boolean} include stack (default: `true`)
 * @return {Object} object that can be `JSON.stringify`
 */

AssertionError.prototype.toJSON = function (stack) {
  var extend = exclude('constructor', 'toJSON', 'stack')
    , props = extend({ name: this.name }, this);

  // include stack if exists and not turned off
  if (false !== stack && this.stack) {
    props.stack = this.stack;
  }

  return props;
};

});
require.register("chaijs-type-detect/lib/type.js", function(exports, require, module){
/*!
 * type-detect
 * Copyright(c) 2013 jake luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/*!
 * Primary Exports
 */

var exports = module.exports = getType;

/*!
 * Detectable javascript natives
 */

var natives = {
    '[object Array]': 'array'
  , '[object RegExp]': 'regexp'
  , '[object Function]': 'function'
  , '[object Arguments]': 'arguments'
  , '[object Date]': 'date'
};

/**
 * ### typeOf (obj)
 *
 * Use several different techniques to determine
 * the type of object being tested.
 *
 *
 * @param {Mixed} object
 * @return {String} object type
 * @api public
 */

function getType (obj) {
  var str = Object.prototype.toString.call(obj);
  if (natives[str]) return natives[str];
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (obj === Object(obj)) return 'object';
  return typeof obj;
}

exports.Library = Library;

/**
 * ### Library
 *
 * Create a repository for custom type detection.
 *
 * ```js
 * var lib = new type.Library;
 * ```
 *
 */

function Library () {
  this.tests = {};
}

/**
 * #### .of (obj)
 *
 * Expose replacement `typeof` detection to the library.
 *
 * ```js
 * if ('string' === lib.of('hello world')) {
 *   // ...
 * }
 * ```
 *
 * @param {Mixed} object to test
 * @return {String} type
 */

Library.prototype.of = getType;

/**
 * #### .define (type, test)
 *
 * Add a test to for the `.test()` assertion.
 *
 * Can be defined as a regular expression:
 *
 * ```js
 * lib.define('int', /^[0-9]+$/);
 * ```
 *
 * ... or as a function:
 *
 * ```js
 * lib.define('bln', function (obj) {
 *   if ('boolean' === lib.of(obj)) return true;
 *   var blns = [ 'yes', 'no', 'true', 'false', 1, 0 ];
 *   if ('string' === lib.of(obj)) obj = obj.toLowerCase();
 *   return !! ~blns.indexOf(obj);
 * });
 * ```
 *
 * @param {String} type
 * @param {RegExp|Function} test
 * @api public
 */

Library.prototype.define = function (type, test) {
  if (arguments.length === 1) return this.tests[type];
  this.tests[type] = test;
  return this;
};

/**
 * #### .test (obj, test)
 *
 * Assert that an object is of type. Will first
 * check natives, and if that does not pass it will
 * use the user defined custom tests.
 *
 * ```js
 * assert(lib.test('1', 'int'));
 * assert(lib.test('yes', 'bln'));
 * ```
 *
 * @param {Mixed} object
 * @param {String} type
 * @return {Boolean} result
 * @api public
 */

Library.prototype.test = function (obj, type) {
  if (type === getType(obj)) return true;
  var test = this.tests[type];

  if (test && 'regexp' === getType(test)) {
    return test.test(obj);
  } else if (test && 'function' === getType(test)) {
    return test(obj);
  } else {
    throw new ReferenceError('Type test "' + type + '" not defined or invalid.');
  }
};

});
require.register("chaijs-deep-eql/lib/eql.js", function(exports, require, module){
/*!
 * deep-eql
 * Copyright(c) 2013 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/*!
 * Module dependencies
 */

var type = require('type-detect');

/*!
 * Buffer.isBuffer browser shim
 */

var Buffer;
try { Buffer = require('buffer').Buffer; }
catch(ex) {
  Buffer = {};
  Buffer.isBuffer = function() { return false; }
}

/*!
 * Primary Export
 */

module.exports = deepEqual;

/**
 * Assert super-strict (egal) equality between
 * two objects of any type.
 *
 * @param {Mixed} a
 * @param {Mixed} b
 * @param {Array} memoised (optional)
 * @return {Boolean} equal match
 */

function deepEqual(a, b, m) {
  if (sameValue(a, b)) {
    return true;
  } else if ('date' === type(a)) {
    return dateEqual(a, b);
  } else if ('regexp' === type(a)) {
    return regexpEqual(a, b);
  } else if (Buffer.isBuffer(a)) {
    return bufferEqual(a, b);
  } else if ('arguments' === type(a)) {
    return argumentsEqual(a, b, m);
  } else if (!typeEqual(a, b)) {
    return false;
  } else if (('object' !== type(a) && 'object' !== type(b))
  && ('array' !== type(a) && 'array' !== type(b))) {
    return sameValue(a, b);
  } else {
    return objectEqual(a, b, m);
  }
}

/*!
 * Strict (egal) equality test. Ensures that NaN always
 * equals NaN and `-0` does not equal `+0`.
 *
 * @param {Mixed} a
 * @param {Mixed} b
 * @return {Boolean} equal match
 */

function sameValue(a, b) {
  if (a === b) return a !== 0 || 1 / a === 1 / b;
  return a !== a && b !== b;
}

/*!
 * Compare the types of two given objects and
 * return if they are equal. Note that an Array
 * has a type of `array` (not `object`) and arguments
 * have a type of `arguments` (not `array`/`object`).
 *
 * @param {Mixed} a
 * @param {Mixed} b
 * @return {Boolean} result
 */

function typeEqual(a, b) {
  return type(a) === type(b);
}

/*!
 * Compare two Date objects by asserting that
 * the time values are equal using `saveValue`.
 *
 * @param {Date} a
 * @param {Date} b
 * @return {Boolean} result
 */

function dateEqual(a, b) {
  if ('date' !== type(b)) return false;
  return sameValue(a.getTime(), b.getTime());
}

/*!
 * Compare two regular expressions by converting them
 * to string and checking for `sameValue`.
 *
 * @param {RegExp} a
 * @param {RegExp} b
 * @return {Boolean} result
 */

function regexpEqual(a, b) {
  if ('regexp' !== type(b)) return false;
  return sameValue(a.toString(), b.toString());
}

/*!
 * Assert deep equality of two `arguments` objects.
 * Unfortunately, these must be sliced to arrays
 * prior to test to ensure no bad behavior.
 *
 * @param {Arguments} a
 * @param {Arguments} b
 * @param {Array} memoize (optional)
 * @return {Boolean} result
 */

function argumentsEqual(a, b, m) {
  if ('arguments' !== type(b)) return false;
  a = [].slice.call(a);
  b = [].slice.call(b);
  return deepEqual(a, b, m);
}

/*!
 * Get enumerable properties of a given object.
 *
 * @param {Object} a
 * @return {Array} property names
 */

function enumerable(a) {
  var res = [];
  for (var key in a) res.push(key);
  return res;
}

/*!
 * Simple equality for flat iterable objects
 * such as Arrays or Node.js buffers.
 *
 * @param {Iterable} a
 * @param {Iterable} b
 * @return {Boolean} result
 */

function iterableEqual(a, b) {
  if (a.length !==  b.length) return false;

  var i = 0;
  var match = true;

  for (; i < a.length; i++) {
    if (a[i] !== b[i]) {
      match = false;
      break;
    }
  }

  return match;
}

/*!
 * Extension to `iterableEqual` specifically
 * for Node.js Buffers.
 *
 * @param {Buffer} a
 * @param {Mixed} b
 * @return {Boolean} result
 */

function bufferEqual(a, b) {
  if (!Buffer.isBuffer(b)) return false;
  return iterableEqual(a, b);
}

/*!
 * Block for `objectEqual` ensuring non-existing
 * values don't get in.
 *
 * @param {Mixed} object
 * @return {Boolean} result
 */

function isValue(a) {
  return a !== null && a !== undefined;
}

/*!
 * Recursively check the equality of two objects.
 * Once basic sameness has been established it will
 * defer to `deepEqual` for each enumerable key
 * in the object.
 *
 * @param {Mixed} a
 * @param {Mixed} b
 * @return {Boolean} result
 */

function objectEqual(a, b, m) {
  if (!isValue(a) || !isValue(b)) {
    return false;
  }

  if (a.prototype !== b.prototype) {
    return false;
  }

  var i;
  if (m) {
    for (i = 0; i < m.length; i++) {
      if ((m[i][0] === a && m[i][1] === b)
      ||  (m[i][0] === b && m[i][1] === a)) {
        return true;
      }
    }
  } else {
    m = [];
  }

  try {
    var ka = enumerable(a);
    var kb = enumerable(b);
  } catch (ex) {
    return false;
  }

  ka.sort();
  kb.sort();

  if (!iterableEqual(ka, kb)) {
    return false;
  }

  m.push([ a, b ]);

  var key;
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!deepEqual(a[key], b[key], m)) {
      return false;
    }
  }

  return true;
}

});
require.register("chai/index.js", function(exports, require, module){
module.exports = require('./lib/chai');

});
require.register("chai/lib/chai.js", function(exports, require, module){
/*!
 * chai
 * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

var used = []
  , exports = module.exports = {};

/*!
 * Chai version
 */

exports.version = '1.9.1';

/*!
 * Assertion Error
 */

exports.AssertionError = require('assertion-error');

/*!
 * Utils for plugins (not exported)
 */

var util = require('./chai/utils');

/**
 * # .use(function)
 *
 * Provides a way to extend the internals of Chai
 *
 * @param {Function}
 * @returns {this} for chaining
 * @api public
 */

exports.use = function (fn) {
  if (!~used.indexOf(fn)) {
    fn(this, util);
    used.push(fn);
  }

  return this;
};

/*!
 * Configuration
 */

var config = require('./chai/config');
exports.config = config;

/*!
 * Primary `Assertion` prototype
 */

var assertion = require('./chai/assertion');
exports.use(assertion);

/*!
 * Core Assertions
 */

var core = require('./chai/core/assertions');
exports.use(core);

/*!
 * Expect interface
 */

var expect = require('./chai/interface/expect');
exports.use(expect);

/*!
 * Should interface
 */

var should = require('./chai/interface/should');
exports.use(should);

/*!
 * Assert interface
 */

var assert = require('./chai/interface/assert');
exports.use(assert);

});
require.register("chai/lib/chai/assertion.js", function(exports, require, module){
/*!
 * chai
 * http://chaijs.com
 * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

var config = require('./config');

module.exports = function (_chai, util) {
  /*!
   * Module dependencies.
   */

  var AssertionError = _chai.AssertionError
    , flag = util.flag;

  /*!
   * Module export.
   */

  _chai.Assertion = Assertion;

  /*!
   * Assertion Constructor
   *
   * Creates object for chaining.
   *
   * @api private
   */

  function Assertion (obj, msg, stack) {
    flag(this, 'ssfi', stack || arguments.callee);
    flag(this, 'object', obj);
    flag(this, 'message', msg);
  }

  Object.defineProperty(Assertion, 'includeStack', {
    get: function() {
      console.warn('Assertion.includeStack is deprecated, use chai.config.includeStack instead.');
      return config.includeStack;
    },
    set: function(value) {
      console.warn('Assertion.includeStack is deprecated, use chai.config.includeStack instead.');
      config.includeStack = value;
    }
  });

  Object.defineProperty(Assertion, 'showDiff', {
    get: function() {
      console.warn('Assertion.showDiff is deprecated, use chai.config.showDiff instead.');
      return config.showDiff;
    },
    set: function(value) {
      console.warn('Assertion.showDiff is deprecated, use chai.config.showDiff instead.');
      config.showDiff = value;
    }
  });

  Assertion.addProperty = function (name, fn) {
    util.addProperty(this.prototype, name, fn);
  };

  Assertion.addMethod = function (name, fn) {
    util.addMethod(this.prototype, name, fn);
  };

  Assertion.addChainableMethod = function (name, fn, chainingBehavior) {
    util.addChainableMethod(this.prototype, name, fn, chainingBehavior);
  };

  Assertion.overwriteProperty = function (name, fn) {
    util.overwriteProperty(this.prototype, name, fn);
  };

  Assertion.overwriteMethod = function (name, fn) {
    util.overwriteMethod(this.prototype, name, fn);
  };

  Assertion.overwriteChainableMethod = function (name, fn, chainingBehavior) {
    util.overwriteChainableMethod(this.prototype, name, fn, chainingBehavior);
  };

  /*!
   * ### .assert(expression, message, negateMessage, expected, actual)
   *
   * Executes an expression and check expectations. Throws AssertionError for reporting if test doesn't pass.
   *
   * @name assert
   * @param {Philosophical} expression to be tested
   * @param {String} message to display if fails
   * @param {String} negatedMessage to display if negated expression fails
   * @param {Mixed} expected value (remember to check for negation)
   * @param {Mixed} actual (optional) will default to `this.obj`
   * @api private
   */

  Assertion.prototype.assert = function (expr, msg, negateMsg, expected, _actual, showDiff) {
    var ok = util.test(this, arguments);
    if (true !== showDiff) showDiff = false;
    if (true !== config.showDiff) showDiff = false;

    if (!ok) {
      var msg = util.getMessage(this, arguments)
        , actual = util.getActual(this, arguments);
      throw new AssertionError(msg, {
          actual: actual
        , expected: expected
        , showDiff: showDiff
      }, (config.includeStack) ? this.assert : flag(this, 'ssfi'));
    }
  };

  /*!
   * ### ._obj
   *
   * Quick reference to stored `actual` value for plugin developers.
   *
   * @api private
   */

  Object.defineProperty(Assertion.prototype, '_obj',
    { get: function () {
        return flag(this, 'object');
      }
    , set: function (val) {
        flag(this, 'object', val);
      }
  });
};

});
require.register("chai/lib/chai/config.js", function(exports, require, module){
module.exports = {

  /**
   * ### config.includeStack
   *
   * User configurable property, influences whether stack trace
   * is included in Assertion error message. Default of false
   * suppresses stack trace in the error message.
   *
   *     chai.config.includeStack = true;  // enable stack on error
   *
   * @param {Boolean}
   * @api public
   */

   includeStack: false,

  /**
   * ### config.showDiff
   *
   * User configurable property, influences whether or not
   * the `showDiff` flag should be included in the thrown
   * AssertionErrors. `false` will always be `false`; `true`
   * will be true when the assertion has requested a diff
   * be shown.
   *
   * @param {Boolean}
   * @api public
   */

  showDiff: true,

  /**
   * ### config.truncateThreshold
   *
   * User configurable property, sets length threshold for actual and
   * expected values in assertion errors. If this threshold is exceeded,
   * the value is truncated.
   *
   * Set it to zero if you want to disable truncating altogether.
   *
   *     chai.config.truncateThreshold = 0;  // disable truncating
   *
   * @param {Number}
   * @api public
   */

  truncateThreshold: 40

};

});
require.register("chai/lib/chai/core/assertions.js", function(exports, require, module){
/*!
 * chai
 * http://chaijs.com
 * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

module.exports = function (chai, _) {
  var Assertion = chai.Assertion
    , toString = Object.prototype.toString
    , flag = _.flag;

  /**
   * ### Language Chains
   *
   * The following are provided as chainable getters to
   * improve the readability of your assertions. They
   * do not provide testing capabilities unless they
   * have been overwritten by a plugin.
   *
   * **Chains**
   *
   * - to
   * - be
   * - been
   * - is
   * - that
   * - and
   * - has
   * - have
   * - with
   * - at
   * - of
   * - same
   *
   * @name language chains
   * @api public
   */

  [ 'to', 'be', 'been'
  , 'is', 'and', 'has', 'have'
  , 'with', 'that', 'at'
  , 'of', 'same' ].forEach(function (chain) {
    Assertion.addProperty(chain, function () {
      return this;
    });
  });

  /**
   * ### .not
   *
   * Negates any of assertions following in the chain.
   *
   *     expect(foo).to.not.equal('bar');
   *     expect(goodFn).to.not.throw(Error);
   *     expect({ foo: 'baz' }).to.have.property('foo')
   *       .and.not.equal('bar');
   *
   * @name not
   * @api public
   */

  Assertion.addProperty('not', function () {
    flag(this, 'negate', true);
  });

  /**
   * ### .deep
   *
   * Sets the `deep` flag, later used by the `equal` and
   * `property` assertions.
   *
   *     expect(foo).to.deep.equal({ bar: 'baz' });
   *     expect({ foo: { bar: { baz: 'quux' } } })
   *       .to.have.deep.property('foo.bar.baz', 'quux');
   *
   * @name deep
   * @api public
   */

  Assertion.addProperty('deep', function () {
    flag(this, 'deep', true);
  });

  /**
   * ### .a(type)
   *
   * The `a` and `an` assertions are aliases that can be
   * used either as language chains or to assert a value's
   * type.
   *
   *     // typeof
   *     expect('test').to.be.a('string');
   *     expect({ foo: 'bar' }).to.be.an('object');
   *     expect(null).to.be.a('null');
   *     expect(undefined).to.be.an('undefined');
   *
   *     // language chain
   *     expect(foo).to.be.an.instanceof(Foo);
   *
   * @name a
   * @alias an
   * @param {String} type
   * @param {String} message _optional_
   * @api public
   */

  function an (type, msg) {
    if (msg) flag(this, 'message', msg);
    type = type.toLowerCase();
    var obj = flag(this, 'object')
      , article = ~[ 'a', 'e', 'i', 'o', 'u' ].indexOf(type.charAt(0)) ? 'an ' : 'a ';

    this.assert(
        type === _.type(obj)
      , 'expected #{this} to be ' + article + type
      , 'expected #{this} not to be ' + article + type
    );
  }

  Assertion.addChainableMethod('an', an);
  Assertion.addChainableMethod('a', an);

  /**
   * ### .include(value)
   *
   * The `include` and `contain` assertions can be used as either property
   * based language chains or as methods to assert the inclusion of an object
   * in an array or a substring in a string. When used as language chains,
   * they toggle the `contain` flag for the `keys` assertion.
   *
   *     expect([1,2,3]).to.include(2);
   *     expect('foobar').to.contain('foo');
   *     expect({ foo: 'bar', hello: 'universe' }).to.include.keys('foo');
   *
   * @name include
   * @alias contain
   * @param {Object|String|Number} obj
   * @param {String} message _optional_
   * @api public
   */

  function includeChainingBehavior () {
    flag(this, 'contains', true);
  }

  function include (val, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    var expected = false;
    if (_.type(obj) === 'array' && _.type(val) === 'object') {
      for (var i in obj) {
        if (_.eql(obj[i], val)) {
          expected = true;
          break;
        }
      }
    } else if (_.type(val) === 'object') {
      if (!flag(this, 'negate')) {
        for (var k in val) new Assertion(obj).property(k, val[k]);
        return;
      }
      var subset = {}
      for (var k in val) subset[k] = obj[k]
      expected = _.eql(subset, val);
    } else {
      expected = obj && ~obj.indexOf(val)
    }
    this.assert(
        expected
      , 'expected #{this} to include ' + _.inspect(val)
      , 'expected #{this} to not include ' + _.inspect(val));
  }

  Assertion.addChainableMethod('include', include, includeChainingBehavior);
  Assertion.addChainableMethod('contain', include, includeChainingBehavior);

  /**
   * ### .ok
   *
   * Asserts that the target is truthy.
   *
   *     expect('everthing').to.be.ok;
   *     expect(1).to.be.ok;
   *     expect(false).to.not.be.ok;
   *     expect(undefined).to.not.be.ok;
   *     expect(null).to.not.be.ok;
   *
   * @name ok
   * @api public
   */

  Assertion.addProperty('ok', function () {
    this.assert(
        flag(this, 'object')
      , 'expected #{this} to be truthy'
      , 'expected #{this} to be falsy');
  });

  /**
   * ### .true
   *
   * Asserts that the target is `true`.
   *
   *     expect(true).to.be.true;
   *     expect(1).to.not.be.true;
   *
   * @name true
   * @api public
   */

  Assertion.addProperty('true', function () {
    this.assert(
        true === flag(this, 'object')
      , 'expected #{this} to be true'
      , 'expected #{this} to be false'
      , this.negate ? false : true
    );
  });

  /**
   * ### .false
   *
   * Asserts that the target is `false`.
   *
   *     expect(false).to.be.false;
   *     expect(0).to.not.be.false;
   *
   * @name false
   * @api public
   */

  Assertion.addProperty('false', function () {
    this.assert(
        false === flag(this, 'object')
      , 'expected #{this} to be false'
      , 'expected #{this} to be true'
      , this.negate ? true : false
    );
  });

  /**
   * ### .null
   *
   * Asserts that the target is `null`.
   *
   *     expect(null).to.be.null;
   *     expect(undefined).not.to.be.null;
   *
   * @name null
   * @api public
   */

  Assertion.addProperty('null', function () {
    this.assert(
        null === flag(this, 'object')
      , 'expected #{this} to be null'
      , 'expected #{this} not to be null'
    );
  });

  /**
   * ### .undefined
   *
   * Asserts that the target is `undefined`.
   *
   *     expect(undefined).to.be.undefined;
   *     expect(null).to.not.be.undefined;
   *
   * @name undefined
   * @api public
   */

  Assertion.addProperty('undefined', function () {
    this.assert(
        undefined === flag(this, 'object')
      , 'expected #{this} to be undefined'
      , 'expected #{this} not to be undefined'
    );
  });

  /**
   * ### .exist
   *
   * Asserts that the target is neither `null` nor `undefined`.
   *
   *     var foo = 'hi'
   *       , bar = null
   *       , baz;
   *
   *     expect(foo).to.exist;
   *     expect(bar).to.not.exist;
   *     expect(baz).to.not.exist;
   *
   * @name exist
   * @api public
   */

  Assertion.addProperty('exist', function () {
    this.assert(
        null != flag(this, 'object')
      , 'expected #{this} to exist'
      , 'expected #{this} to not exist'
    );
  });


  /**
   * ### .empty
   *
   * Asserts that the target's length is `0`. For arrays, it checks
   * the `length` property. For objects, it gets the count of
   * enumerable keys.
   *
   *     expect([]).to.be.empty;
   *     expect('').to.be.empty;
   *     expect({}).to.be.empty;
   *
   * @name empty
   * @api public
   */

  Assertion.addProperty('empty', function () {
    var obj = flag(this, 'object')
      , expected = obj;

    if (Array.isArray(obj) || 'string' === typeof object) {
      expected = obj.length;
    } else if (typeof obj === 'object') {
      expected = Object.keys(obj).length;
    }

    this.assert(
        !expected
      , 'expected #{this} to be empty'
      , 'expected #{this} not to be empty'
    );
  });

  /**
   * ### .arguments
   *
   * Asserts that the target is an arguments object.
   *
   *     function test () {
   *       expect(arguments).to.be.arguments;
   *     }
   *
   * @name arguments
   * @alias Arguments
   * @api public
   */

  function checkArguments () {
    var obj = flag(this, 'object')
      , type = Object.prototype.toString.call(obj);
    this.assert(
        '[object Arguments]' === type
      , 'expected #{this} to be arguments but got ' + type
      , 'expected #{this} to not be arguments'
    );
  }

  Assertion.addProperty('arguments', checkArguments);
  Assertion.addProperty('Arguments', checkArguments);

  /**
   * ### .equal(value)
   *
   * Asserts that the target is strictly equal (`===`) to `value`.
   * Alternately, if the `deep` flag is set, asserts that
   * the target is deeply equal to `value`.
   *
   *     expect('hello').to.equal('hello');
   *     expect(42).to.equal(42);
   *     expect(1).to.not.equal(true);
   *     expect({ foo: 'bar' }).to.not.equal({ foo: 'bar' });
   *     expect({ foo: 'bar' }).to.deep.equal({ foo: 'bar' });
   *
   * @name equal
   * @alias equals
   * @alias eq
   * @alias deep.equal
   * @param {Mixed} value
   * @param {String} message _optional_
   * @api public
   */

  function assertEqual (val, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    if (flag(this, 'deep')) {
      return this.eql(val);
    } else {
      this.assert(
          val === obj
        , 'expected #{this} to equal #{exp}'
        , 'expected #{this} to not equal #{exp}'
        , val
        , this._obj
        , true
      );
    }
  }

  Assertion.addMethod('equal', assertEqual);
  Assertion.addMethod('equals', assertEqual);
  Assertion.addMethod('eq', assertEqual);

  /**
   * ### .eql(value)
   *
   * Asserts that the target is deeply equal to `value`.
   *
   *     expect({ foo: 'bar' }).to.eql({ foo: 'bar' });
   *     expect([ 1, 2, 3 ]).to.eql([ 1, 2, 3 ]);
   *
   * @name eql
   * @alias eqls
   * @param {Mixed} value
   * @param {String} message _optional_
   * @api public
   */

  function assertEql(obj, msg) {
    if (msg) flag(this, 'message', msg);
    this.assert(
        _.eql(obj, flag(this, 'object'))
      , 'expected #{this} to deeply equal #{exp}'
      , 'expected #{this} to not deeply equal #{exp}'
      , obj
      , this._obj
      , true
    );
  }

  Assertion.addMethod('eql', assertEql);
  Assertion.addMethod('eqls', assertEql);

  /**
   * ### .above(value)
   *
   * Asserts that the target is greater than `value`.
   *
   *     expect(10).to.be.above(5);
   *
   * Can also be used in conjunction with `length` to
   * assert a minimum length. The benefit being a
   * more informative error message than if the length
   * was supplied directly.
   *
   *     expect('foo').to.have.length.above(2);
   *     expect([ 1, 2, 3 ]).to.have.length.above(2);
   *
   * @name above
   * @alias gt
   * @alias greaterThan
   * @param {Number} value
   * @param {String} message _optional_
   * @api public
   */

  function assertAbove (n, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    if (flag(this, 'doLength')) {
      new Assertion(obj, msg).to.have.property('length');
      var len = obj.length;
      this.assert(
          len > n
        , 'expected #{this} to have a length above #{exp} but got #{act}'
        , 'expected #{this} to not have a length above #{exp}'
        , n
        , len
      );
    } else {
      this.assert(
          obj > n
        , 'expected #{this} to be above ' + n
        , 'expected #{this} to be at most ' + n
      );
    }
  }

  Assertion.addMethod('above', assertAbove);
  Assertion.addMethod('gt', assertAbove);
  Assertion.addMethod('greaterThan', assertAbove);

  /**
   * ### .least(value)
   *
   * Asserts that the target is greater than or equal to `value`.
   *
   *     expect(10).to.be.at.least(10);
   *
   * Can also be used in conjunction with `length` to
   * assert a minimum length. The benefit being a
   * more informative error message than if the length
   * was supplied directly.
   *
   *     expect('foo').to.have.length.of.at.least(2);
   *     expect([ 1, 2, 3 ]).to.have.length.of.at.least(3);
   *
   * @name least
   * @alias gte
   * @param {Number} value
   * @param {String} message _optional_
   * @api public
   */

  function assertLeast (n, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    if (flag(this, 'doLength')) {
      new Assertion(obj, msg).to.have.property('length');
      var len = obj.length;
      this.assert(
          len >= n
        , 'expected #{this} to have a length at least #{exp} but got #{act}'
        , 'expected #{this} to have a length below #{exp}'
        , n
        , len
      );
    } else {
      this.assert(
          obj >= n
        , 'expected #{this} to be at least ' + n
        , 'expected #{this} to be below ' + n
      );
    }
  }

  Assertion.addMethod('least', assertLeast);
  Assertion.addMethod('gte', assertLeast);

  /**
   * ### .below(value)
   *
   * Asserts that the target is less than `value`.
   *
   *     expect(5).to.be.below(10);
   *
   * Can also be used in conjunction with `length` to
   * assert a maximum length. The benefit being a
   * more informative error message than if the length
   * was supplied directly.
   *
   *     expect('foo').to.have.length.below(4);
   *     expect([ 1, 2, 3 ]).to.have.length.below(4);
   *
   * @name below
   * @alias lt
   * @alias lessThan
   * @param {Number} value
   * @param {String} message _optional_
   * @api public
   */

  function assertBelow (n, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    if (flag(this, 'doLength')) {
      new Assertion(obj, msg).to.have.property('length');
      var len = obj.length;
      this.assert(
          len < n
        , 'expected #{this} to have a length below #{exp} but got #{act}'
        , 'expected #{this} to not have a length below #{exp}'
        , n
        , len
      );
    } else {
      this.assert(
          obj < n
        , 'expected #{this} to be below ' + n
        , 'expected #{this} to be at least ' + n
      );
    }
  }

  Assertion.addMethod('below', assertBelow);
  Assertion.addMethod('lt', assertBelow);
  Assertion.addMethod('lessThan', assertBelow);

  /**
   * ### .most(value)
   *
   * Asserts that the target is less than or equal to `value`.
   *
   *     expect(5).to.be.at.most(5);
   *
   * Can also be used in conjunction with `length` to
   * assert a maximum length. The benefit being a
   * more informative error message than if the length
   * was supplied directly.
   *
   *     expect('foo').to.have.length.of.at.most(4);
   *     expect([ 1, 2, 3 ]).to.have.length.of.at.most(3);
   *
   * @name most
   * @alias lte
   * @param {Number} value
   * @param {String} message _optional_
   * @api public
   */

  function assertMost (n, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    if (flag(this, 'doLength')) {
      new Assertion(obj, msg).to.have.property('length');
      var len = obj.length;
      this.assert(
          len <= n
        , 'expected #{this} to have a length at most #{exp} but got #{act}'
        , 'expected #{this} to have a length above #{exp}'
        , n
        , len
      );
    } else {
      this.assert(
          obj <= n
        , 'expected #{this} to be at most ' + n
        , 'expected #{this} to be above ' + n
      );
    }
  }

  Assertion.addMethod('most', assertMost);
  Assertion.addMethod('lte', assertMost);

  /**
   * ### .within(start, finish)
   *
   * Asserts that the target is within a range.
   *
   *     expect(7).to.be.within(5,10);
   *
   * Can also be used in conjunction with `length` to
   * assert a length range. The benefit being a
   * more informative error message than if the length
   * was supplied directly.
   *
   *     expect('foo').to.have.length.within(2,4);
   *     expect([ 1, 2, 3 ]).to.have.length.within(2,4);
   *
   * @name within
   * @param {Number} start lowerbound inclusive
   * @param {Number} finish upperbound inclusive
   * @param {String} message _optional_
   * @api public
   */

  Assertion.addMethod('within', function (start, finish, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object')
      , range = start + '..' + finish;
    if (flag(this, 'doLength')) {
      new Assertion(obj, msg).to.have.property('length');
      var len = obj.length;
      this.assert(
          len >= start && len <= finish
        , 'expected #{this} to have a length within ' + range
        , 'expected #{this} to not have a length within ' + range
      );
    } else {
      this.assert(
          obj >= start && obj <= finish
        , 'expected #{this} to be within ' + range
        , 'expected #{this} to not be within ' + range
      );
    }
  });

  /**
   * ### .instanceof(constructor)
   *
   * Asserts that the target is an instance of `constructor`.
   *
   *     var Tea = function (name) { this.name = name; }
   *       , Chai = new Tea('chai');
   *
   *     expect(Chai).to.be.an.instanceof(Tea);
   *     expect([ 1, 2, 3 ]).to.be.instanceof(Array);
   *
   * @name instanceof
   * @param {Constructor} constructor
   * @param {String} message _optional_
   * @alias instanceOf
   * @api public
   */

  function assertInstanceOf (constructor, msg) {
    if (msg) flag(this, 'message', msg);
    var name = _.getName(constructor);
    this.assert(
        flag(this, 'object') instanceof constructor
      , 'expected #{this} to be an instance of ' + name
      , 'expected #{this} to not be an instance of ' + name
    );
  };

  Assertion.addMethod('instanceof', assertInstanceOf);
  Assertion.addMethod('instanceOf', assertInstanceOf);

  /**
   * ### .property(name, [value])
   *
   * Asserts that the target has a property `name`, optionally asserting that
   * the value of that property is strictly equal to  `value`.
   * If the `deep` flag is set, you can use dot- and bracket-notation for deep
   * references into objects and arrays.
   *
   *     // simple referencing
   *     var obj = { foo: 'bar' };
   *     expect(obj).to.have.property('foo');
   *     expect(obj).to.have.property('foo', 'bar');
   *
   *     // deep referencing
   *     var deepObj = {
   *         green: { tea: 'matcha' }
   *       , teas: [ 'chai', 'matcha', { tea: 'konacha' } ]
   *     };

   *     expect(deepObj).to.have.deep.property('green.tea', 'matcha');
   *     expect(deepObj).to.have.deep.property('teas[1]', 'matcha');
   *     expect(deepObj).to.have.deep.property('teas[2].tea', 'konacha');
   *
   * You can also use an array as the starting point of a `deep.property`
   * assertion, or traverse nested arrays.
   *
   *     var arr = [
   *         [ 'chai', 'matcha', 'konacha' ]
   *       , [ { tea: 'chai' }
   *         , { tea: 'matcha' }
   *         , { tea: 'konacha' } ]
   *     ];
   *
   *     expect(arr).to.have.deep.property('[0][1]', 'matcha');
   *     expect(arr).to.have.deep.property('[1][2].tea', 'konacha');
   *
   * Furthermore, `property` changes the subject of the assertion
   * to be the value of that property from the original object. This
   * permits for further chainable assertions on that property.
   *
   *     expect(obj).to.have.property('foo')
   *       .that.is.a('string');
   *     expect(deepObj).to.have.property('green')
   *       .that.is.an('object')
   *       .that.deep.equals({ tea: 'matcha' });
   *     expect(deepObj).to.have.property('teas')
   *       .that.is.an('array')
   *       .with.deep.property('[2]')
   *         .that.deep.equals({ tea: 'konacha' });
   *
   * @name property
   * @alias deep.property
   * @param {String} name
   * @param {Mixed} value (optional)
   * @param {String} message _optional_
   * @returns value of property for chaining
   * @api public
   */

  Assertion.addMethod('property', function (name, val, msg) {
    if (msg) flag(this, 'message', msg);

    var descriptor = flag(this, 'deep') ? 'deep property ' : 'property '
      , negate = flag(this, 'negate')
      , obj = flag(this, 'object')
      , value = flag(this, 'deep')
        ? _.getPathValue(name, obj)
        : obj[name];

    if (negate && undefined !== val) {
      if (undefined === value) {
        msg = (msg != null) ? msg + ': ' : '';
        throw new Error(msg + _.inspect(obj) + ' has no ' + descriptor + _.inspect(name));
      }
    } else {
      this.assert(
          undefined !== value
        , 'expected #{this} to have a ' + descriptor + _.inspect(name)
        , 'expected #{this} to not have ' + descriptor + _.inspect(name));
    }

    if (undefined !== val) {
      this.assert(
          val === value
        , 'expected #{this} to have a ' + descriptor + _.inspect(name) + ' of #{exp}, but got #{act}'
        , 'expected #{this} to not have a ' + descriptor + _.inspect(name) + ' of #{act}'
        , val
        , value
      );
    }

    flag(this, 'object', value);
  });


  /**
   * ### .ownProperty(name)
   *
   * Asserts that the target has an own property `name`.
   *
   *     expect('test').to.have.ownProperty('length');
   *
   * @name ownProperty
   * @alias haveOwnProperty
   * @param {String} name
   * @param {String} message _optional_
   * @api public
   */

  function assertOwnProperty (name, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    this.assert(
        obj.hasOwnProperty(name)
      , 'expected #{this} to have own property ' + _.inspect(name)
      , 'expected #{this} to not have own property ' + _.inspect(name)
    );
  }

  Assertion.addMethod('ownProperty', assertOwnProperty);
  Assertion.addMethod('haveOwnProperty', assertOwnProperty);

  /**
   * ### .length(value)
   *
   * Asserts that the target's `length` property has
   * the expected value.
   *
   *     expect([ 1, 2, 3]).to.have.length(3);
   *     expect('foobar').to.have.length(6);
   *
   * Can also be used as a chain precursor to a value
   * comparison for the length property.
   *
   *     expect('foo').to.have.length.above(2);
   *     expect([ 1, 2, 3 ]).to.have.length.above(2);
   *     expect('foo').to.have.length.below(4);
   *     expect([ 1, 2, 3 ]).to.have.length.below(4);
   *     expect('foo').to.have.length.within(2,4);
   *     expect([ 1, 2, 3 ]).to.have.length.within(2,4);
   *
   * @name length
   * @alias lengthOf
   * @param {Number} length
   * @param {String} message _optional_
   * @api public
   */

  function assertLengthChain () {
    flag(this, 'doLength', true);
  }

  function assertLength (n, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    new Assertion(obj, msg).to.have.property('length');
    var len = obj.length;

    this.assert(
        len == n
      , 'expected #{this} to have a length of #{exp} but got #{act}'
      , 'expected #{this} to not have a length of #{act}'
      , n
      , len
    );
  }

  Assertion.addChainableMethod('length', assertLength, assertLengthChain);
  Assertion.addMethod('lengthOf', assertLength, assertLengthChain);

  /**
   * ### .match(regexp)
   *
   * Asserts that the target matches a regular expression.
   *
   *     expect('foobar').to.match(/^foo/);
   *
   * @name match
   * @param {RegExp} RegularExpression
   * @param {String} message _optional_
   * @api public
   */

  Assertion.addMethod('match', function (re, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    this.assert(
        re.exec(obj)
      , 'expected #{this} to match ' + re
      , 'expected #{this} not to match ' + re
    );
  });

  /**
   * ### .string(string)
   *
   * Asserts that the string target contains another string.
   *
   *     expect('foobar').to.have.string('bar');
   *
   * @name string
   * @param {String} string
   * @param {String} message _optional_
   * @api public
   */

  Assertion.addMethod('string', function (str, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    new Assertion(obj, msg).is.a('string');

    this.assert(
        ~obj.indexOf(str)
      , 'expected #{this} to contain ' + _.inspect(str)
      , 'expected #{this} to not contain ' + _.inspect(str)
    );
  });


  /**
   * ### .keys(key1, [key2], [...])
   *
   * Asserts that the target has exactly the given keys, or
   * asserts the inclusion of some keys when using the
   * `include` or `contain` modifiers.
   *
   *     expect({ foo: 1, bar: 2 }).to.have.keys(['foo', 'bar']);
   *     expect({ foo: 1, bar: 2, baz: 3 }).to.contain.keys('foo', 'bar');
   *
   * @name keys
   * @alias key
   * @param {String...|Array} keys
   * @api public
   */

  function assertKeys (keys) {
    var obj = flag(this, 'object')
      , str
      , ok = true;

    keys = keys instanceof Array
      ? keys
      : Array.prototype.slice.call(arguments);

    if (!keys.length) throw new Error('keys required');

    var actual = Object.keys(obj)
      , len = keys.length;

    // Inclusion
    ok = keys.every(function(key){
      return ~actual.indexOf(key);
    });

    // Strict
    if (!flag(this, 'negate') && !flag(this, 'contains')) {
      ok = ok && keys.length == actual.length;
    }

    // Key string
    if (len > 1) {
      keys = keys.map(function(key){
        return _.inspect(key);
      });
      var last = keys.pop();
      str = keys.join(', ') + ', and ' + last;
    } else {
      str = _.inspect(keys[0]);
    }

    // Form
    str = (len > 1 ? 'keys ' : 'key ') + str;

    // Have / include
    str = (flag(this, 'contains') ? 'contain ' : 'have ') + str;

    // Assertion
    this.assert(
        ok
      , 'expected #{this} to ' + str
      , 'expected #{this} to not ' + str
    );
  }

  Assertion.addMethod('keys', assertKeys);
  Assertion.addMethod('key', assertKeys);

  /**
   * ### .throw(constructor)
   *
   * Asserts that the function target will throw a specific error, or specific type of error
   * (as determined using `instanceof`), optionally with a RegExp or string inclusion test
   * for the error's message.
   *
   *     var err = new ReferenceError('This is a bad function.');
   *     var fn = function () { throw err; }
   *     expect(fn).to.throw(ReferenceError);
   *     expect(fn).to.throw(Error);
   *     expect(fn).to.throw(/bad function/);
   *     expect(fn).to.not.throw('good function');
   *     expect(fn).to.throw(ReferenceError, /bad function/);
   *     expect(fn).to.throw(err);
   *     expect(fn).to.not.throw(new RangeError('Out of range.'));
   *
   * Please note that when a throw expectation is negated, it will check each
   * parameter independently, starting with error constructor type. The appropriate way
   * to check for the existence of a type of error but for a message that does not match
   * is to use `and`.
   *
   *     expect(fn).to.throw(ReferenceError)
   *        .and.not.throw(/good function/);
   *
   * @name throw
   * @alias throws
   * @alias Throw
   * @param {ErrorConstructor} constructor
   * @param {String|RegExp} expected error message
   * @param {String} message _optional_
   * @see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Error#Error_types
   * @returns error for chaining (null if no error)
   * @api public
   */

  function assertThrows (constructor, errMsg, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    new Assertion(obj, msg).is.a('function');

    var thrown = false
      , desiredError = null
      , name = null
      , thrownError = null;

    if (arguments.length === 0) {
      errMsg = null;
      constructor = null;
    } else if (constructor && (constructor instanceof RegExp || 'string' === typeof constructor)) {
      errMsg = constructor;
      constructor = null;
    } else if (constructor && constructor instanceof Error) {
      desiredError = constructor;
      constructor = null;
      errMsg = null;
    } else if (typeof constructor === 'function') {
      name = constructor.prototype.name || constructor.name;
      if (name === 'Error' && constructor !== Error) {
        name = (new constructor()).name;
      }
    } else {
      constructor = null;
    }

    try {
      obj();
    } catch (err) {
      // first, check desired error
      if (desiredError) {
        this.assert(
            err === desiredError
          , 'expected #{this} to throw #{exp} but #{act} was thrown'
          , 'expected #{this} to not throw #{exp}'
          , (desiredError instanceof Error ? desiredError.toString() : desiredError)
          , (err instanceof Error ? err.toString() : err)
        );

        flag(this, 'object', err);
        return this;
      }

      // next, check constructor
      if (constructor) {
        this.assert(
            err instanceof constructor
          , 'expected #{this} to throw #{exp} but #{act} was thrown'
          , 'expected #{this} to not throw #{exp} but #{act} was thrown'
          , name
          , (err instanceof Error ? err.toString() : err)
        );

        if (!errMsg) {
          flag(this, 'object', err);
          return this;
        }
      }

      // next, check message
      var message = 'object' === _.type(err) && "message" in err
        ? err.message
        : '' + err;

      if ((message != null) && errMsg && errMsg instanceof RegExp) {
        this.assert(
            errMsg.exec(message)
          , 'expected #{this} to throw error matching #{exp} but got #{act}'
          , 'expected #{this} to throw error not matching #{exp}'
          , errMsg
          , message
        );

        flag(this, 'object', err);
        return this;
      } else if ((message != null) && errMsg && 'string' === typeof errMsg) {
        this.assert(
            ~message.indexOf(errMsg)
          , 'expected #{this} to throw error including #{exp} but got #{act}'
          , 'expected #{this} to throw error not including #{act}'
          , errMsg
          , message
        );

        flag(this, 'object', err);
        return this;
      } else {
        thrown = true;
        thrownError = err;
      }
    }

    var actuallyGot = ''
      , expectedThrown = name !== null
        ? name
        : desiredError
          ? '#{exp}' //_.inspect(desiredError)
          : 'an error';

    if (thrown) {
      actuallyGot = ' but #{act} was thrown'
    }

    this.assert(
        thrown === true
      , 'expected #{this} to throw ' + expectedThrown + actuallyGot
      , 'expected #{this} to not throw ' + expectedThrown + actuallyGot
      , (desiredError instanceof Error ? desiredError.toString() : desiredError)
      , (thrownError instanceof Error ? thrownError.toString() : thrownError)
    );

    flag(this, 'object', thrownError);
  };

  Assertion.addMethod('throw', assertThrows);
  Assertion.addMethod('throws', assertThrows);
  Assertion.addMethod('Throw', assertThrows);

  /**
   * ### .respondTo(method)
   *
   * Asserts that the object or class target will respond to a method.
   *
   *     Klass.prototype.bar = function(){};
   *     expect(Klass).to.respondTo('bar');
   *     expect(obj).to.respondTo('bar');
   *
   * To check if a constructor will respond to a static function,
   * set the `itself` flag.
   *
   *     Klass.baz = function(){};
   *     expect(Klass).itself.to.respondTo('baz');
   *
   * @name respondTo
   * @param {String} method
   * @param {String} message _optional_
   * @api public
   */

  Assertion.addMethod('respondTo', function (method, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object')
      , itself = flag(this, 'itself')
      , context = ('function' === _.type(obj) && !itself)
        ? obj.prototype[method]
        : obj[method];

    this.assert(
        'function' === typeof context
      , 'expected #{this} to respond to ' + _.inspect(method)
      , 'expected #{this} to not respond to ' + _.inspect(method)
    );
  });

  /**
   * ### .itself
   *
   * Sets the `itself` flag, later used by the `respondTo` assertion.
   *
   *     function Foo() {}
   *     Foo.bar = function() {}
   *     Foo.prototype.baz = function() {}
   *
   *     expect(Foo).itself.to.respondTo('bar');
   *     expect(Foo).itself.not.to.respondTo('baz');
   *
   * @name itself
   * @api public
   */

  Assertion.addProperty('itself', function () {
    flag(this, 'itself', true);
  });

  /**
   * ### .satisfy(method)
   *
   * Asserts that the target passes a given truth test.
   *
   *     expect(1).to.satisfy(function(num) { return num > 0; });
   *
   * @name satisfy
   * @param {Function} matcher
   * @param {String} message _optional_
   * @api public
   */

  Assertion.addMethod('satisfy', function (matcher, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    this.assert(
        matcher(obj)
      , 'expected #{this} to satisfy ' + _.objDisplay(matcher)
      , 'expected #{this} to not satisfy' + _.objDisplay(matcher)
      , this.negate ? false : true
      , matcher(obj)
    );
  });

  /**
   * ### .closeTo(expected, delta)
   *
   * Asserts that the target is equal `expected`, to within a +/- `delta` range.
   *
   *     expect(1.5).to.be.closeTo(1, 0.5);
   *
   * @name closeTo
   * @param {Number} expected
   * @param {Number} delta
   * @param {String} message _optional_
   * @api public
   */

  Assertion.addMethod('closeTo', function (expected, delta, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');
    this.assert(
        Math.abs(obj - expected) <= delta
      , 'expected #{this} to be close to ' + expected + ' +/- ' + delta
      , 'expected #{this} not to be close to ' + expected + ' +/- ' + delta
    );
  });

  function isSubsetOf(subset, superset, cmp) {
    return subset.every(function(elem) {
      if (!cmp) return superset.indexOf(elem) !== -1;

      return superset.some(function(elem2) {
        return cmp(elem, elem2);
      });
    })
  }

  /**
   * ### .members(set)
   *
   * Asserts that the target is a superset of `set`,
   * or that the target and `set` have the same strictly-equal (===) members.
   * Alternately, if the `deep` flag is set, set members are compared for deep
   * equality.
   *
   *     expect([1, 2, 3]).to.include.members([3, 2]);
   *     expect([1, 2, 3]).to.not.include.members([3, 2, 8]);
   *
   *     expect([4, 2]).to.have.members([2, 4]);
   *     expect([5, 2]).to.not.have.members([5, 2, 1]);
   *
   *     expect([{ id: 1 }]).to.deep.include.members([{ id: 1 }]);
   *
   * @name members
   * @param {Array} set
   * @param {String} message _optional_
   * @api public
   */

  Assertion.addMethod('members', function (subset, msg) {
    if (msg) flag(this, 'message', msg);
    var obj = flag(this, 'object');

    new Assertion(obj).to.be.an('array');
    new Assertion(subset).to.be.an('array');

    var cmp = flag(this, 'deep') ? _.eql : undefined;

    if (flag(this, 'contains')) {
      return this.assert(
          isSubsetOf(subset, obj, cmp)
        , 'expected #{this} to be a superset of #{act}'
        , 'expected #{this} to not be a superset of #{act}'
        , obj
        , subset
      );
    }

    this.assert(
        isSubsetOf(obj, subset, cmp) && isSubsetOf(subset, obj, cmp)
        , 'expected #{this} to have the same members as #{act}'
        , 'expected #{this} to not have the same members as #{act}'
        , obj
        , subset
    );
  });
};

});
require.register("chai/lib/chai/interface/assert.js", function(exports, require, module){
/*!
 * chai
 * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */


module.exports = function (chai, util) {

  /*!
   * Chai dependencies.
   */

  var Assertion = chai.Assertion
    , flag = util.flag;

  /*!
   * Module export.
   */

  /**
   * ### assert(expression, message)
   *
   * Write your own test expressions.
   *
   *     assert('foo' !== 'bar', 'foo is not bar');
   *     assert(Array.isArray([]), 'empty arrays are arrays');
   *
   * @param {Mixed} expression to test for truthiness
   * @param {String} message to display on error
   * @name assert
   * @api public
   */

  var assert = chai.assert = function (express, errmsg) {
    var test = new Assertion(null, null, chai.assert);
    test.assert(
        express
      , errmsg
      , '[ negation message unavailable ]'
    );
  };

  /**
   * ### .fail(actual, expected, [message], [operator])
   *
   * Throw a failure. Node.js `assert` module-compatible.
   *
   * @name fail
   * @param {Mixed} actual
   * @param {Mixed} expected
   * @param {String} message
   * @param {String} operator
   * @api public
   */

  assert.fail = function (actual, expected, message, operator) {
    message = message || 'assert.fail()';
    throw new chai.AssertionError(message, {
        actual: actual
      , expected: expected
      , operator: operator
    }, assert.fail);
  };

  /**
   * ### .ok(object, [message])
   *
   * Asserts that `object` is truthy.
   *
   *     assert.ok('everything', 'everything is ok');
   *     assert.ok(false, 'this will fail');
   *
   * @name ok
   * @param {Mixed} object to test
   * @param {String} message
   * @api public
   */

  assert.ok = function (val, msg) {
    new Assertion(val, msg).is.ok;
  };

  /**
   * ### .notOk(object, [message])
   *
   * Asserts that `object` is falsy.
   *
   *     assert.notOk('everything', 'this will fail');
   *     assert.notOk(false, 'this will pass');
   *
   * @name notOk
   * @param {Mixed} object to test
   * @param {String} message
   * @api public
   */

  assert.notOk = function (val, msg) {
    new Assertion(val, msg).is.not.ok;
  };

  /**
   * ### .equal(actual, expected, [message])
   *
   * Asserts non-strict equality (`==`) of `actual` and `expected`.
   *
   *     assert.equal(3, '3', '== coerces values to strings');
   *
   * @name equal
   * @param {Mixed} actual
   * @param {Mixed} expected
   * @param {String} message
   * @api public
   */

  assert.equal = function (act, exp, msg) {
    var test = new Assertion(act, msg, assert.equal);

    test.assert(
        exp == flag(test, 'object')
      , 'expected #{this} to equal #{exp}'
      , 'expected #{this} to not equal #{act}'
      , exp
      , act
    );
  };

  /**
   * ### .notEqual(actual, expected, [message])
   *
   * Asserts non-strict inequality (`!=`) of `actual` and `expected`.
   *
   *     assert.notEqual(3, 4, 'these numbers are not equal');
   *
   * @name notEqual
   * @param {Mixed} actual
   * @param {Mixed} expected
   * @param {String} message
   * @api public
   */

  assert.notEqual = function (act, exp, msg) {
    var test = new Assertion(act, msg, assert.notEqual);

    test.assert(
        exp != flag(test, 'object')
      , 'expected #{this} to not equal #{exp}'
      , 'expected #{this} to equal #{act}'
      , exp
      , act
    );
  };

  /**
   * ### .strictEqual(actual, expected, [message])
   *
   * Asserts strict equality (`===`) of `actual` and `expected`.
   *
   *     assert.strictEqual(true, true, 'these booleans are strictly equal');
   *
   * @name strictEqual
   * @param {Mixed} actual
   * @param {Mixed} expected
   * @param {String} message
   * @api public
   */

  assert.strictEqual = function (act, exp, msg) {
    new Assertion(act, msg).to.equal(exp);
  };

  /**
   * ### .notStrictEqual(actual, expected, [message])
   *
   * Asserts strict inequality (`!==`) of `actual` and `expected`.
   *
   *     assert.notStrictEqual(3, '3', 'no coercion for strict equality');
   *
   * @name notStrictEqual
   * @param {Mixed} actual
   * @param {Mixed} expected
   * @param {String} message
   * @api public
   */

  assert.notStrictEqual = function (act, exp, msg) {
    new Assertion(act, msg).to.not.equal(exp);
  };

  /**
   * ### .deepEqual(actual, expected, [message])
   *
   * Asserts that `actual` is deeply equal to `expected`.
   *
   *     assert.deepEqual({ tea: 'green' }, { tea: 'green' });
   *
   * @name deepEqual
   * @param {Mixed} actual
   * @param {Mixed} expected
   * @param {String} message
   * @api public
   */

  assert.deepEqual = function (act, exp, msg) {
    new Assertion(act, msg).to.eql(exp);
  };

  /**
   * ### .notDeepEqual(actual, expected, [message])
   *
   * Assert that `actual` is not deeply equal to `expected`.
   *
   *     assert.notDeepEqual({ tea: 'green' }, { tea: 'jasmine' });
   *
   * @name notDeepEqual
   * @param {Mixed} actual
   * @param {Mixed} expected
   * @param {String} message
   * @api public
   */

  assert.notDeepEqual = function (act, exp, msg) {
    new Assertion(act, msg).to.not.eql(exp);
  };

  /**
   * ### .isTrue(value, [message])
   *
   * Asserts that `value` is true.
   *
   *     var teaServed = true;
   *     assert.isTrue(teaServed, 'the tea has been served');
   *
   * @name isTrue
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isTrue = function (val, msg) {
    new Assertion(val, msg).is['true'];
  };

  /**
   * ### .isFalse(value, [message])
   *
   * Asserts that `value` is false.
   *
   *     var teaServed = false;
   *     assert.isFalse(teaServed, 'no tea yet? hmm...');
   *
   * @name isFalse
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isFalse = function (val, msg) {
    new Assertion(val, msg).is['false'];
  };

  /**
   * ### .isNull(value, [message])
   *
   * Asserts that `value` is null.
   *
   *     assert.isNull(err, 'there was no error');
   *
   * @name isNull
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isNull = function (val, msg) {
    new Assertion(val, msg).to.equal(null);
  };

  /**
   * ### .isNotNull(value, [message])
   *
   * Asserts that `value` is not null.
   *
   *     var tea = 'tasty chai';
   *     assert.isNotNull(tea, 'great, time for tea!');
   *
   * @name isNotNull
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isNotNull = function (val, msg) {
    new Assertion(val, msg).to.not.equal(null);
  };

  /**
   * ### .isUndefined(value, [message])
   *
   * Asserts that `value` is `undefined`.
   *
   *     var tea;
   *     assert.isUndefined(tea, 'no tea defined');
   *
   * @name isUndefined
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isUndefined = function (val, msg) {
    new Assertion(val, msg).to.equal(undefined);
  };

  /**
   * ### .isDefined(value, [message])
   *
   * Asserts that `value` is not `undefined`.
   *
   *     var tea = 'cup of chai';
   *     assert.isDefined(tea, 'tea has been defined');
   *
   * @name isDefined
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isDefined = function (val, msg) {
    new Assertion(val, msg).to.not.equal(undefined);
  };

  /**
   * ### .isFunction(value, [message])
   *
   * Asserts that `value` is a function.
   *
   *     function serveTea() { return 'cup of tea'; };
   *     assert.isFunction(serveTea, 'great, we can have tea now');
   *
   * @name isFunction
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isFunction = function (val, msg) {
    new Assertion(val, msg).to.be.a('function');
  };

  /**
   * ### .isNotFunction(value, [message])
   *
   * Asserts that `value` is _not_ a function.
   *
   *     var serveTea = [ 'heat', 'pour', 'sip' ];
   *     assert.isNotFunction(serveTea, 'great, we have listed the steps');
   *
   * @name isNotFunction
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isNotFunction = function (val, msg) {
    new Assertion(val, msg).to.not.be.a('function');
  };

  /**
   * ### .isObject(value, [message])
   *
   * Asserts that `value` is an object (as revealed by
   * `Object.prototype.toString`).
   *
   *     var selection = { name: 'Chai', serve: 'with spices' };
   *     assert.isObject(selection, 'tea selection is an object');
   *
   * @name isObject
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isObject = function (val, msg) {
    new Assertion(val, msg).to.be.a('object');
  };

  /**
   * ### .isNotObject(value, [message])
   *
   * Asserts that `value` is _not_ an object.
   *
   *     var selection = 'chai'
   *     assert.isNotObject(selection, 'tea selection is not an object');
   *     assert.isNotObject(null, 'null is not an object');
   *
   * @name isNotObject
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isNotObject = function (val, msg) {
    new Assertion(val, msg).to.not.be.a('object');
  };

  /**
   * ### .isArray(value, [message])
   *
   * Asserts that `value` is an array.
   *
   *     var menu = [ 'green', 'chai', 'oolong' ];
   *     assert.isArray(menu, 'what kind of tea do we want?');
   *
   * @name isArray
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isArray = function (val, msg) {
    new Assertion(val, msg).to.be.an('array');
  };

  /**
   * ### .isNotArray(value, [message])
   *
   * Asserts that `value` is _not_ an array.
   *
   *     var menu = 'green|chai|oolong';
   *     assert.isNotArray(menu, 'what kind of tea do we want?');
   *
   * @name isNotArray
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isNotArray = function (val, msg) {
    new Assertion(val, msg).to.not.be.an('array');
  };

  /**
   * ### .isString(value, [message])
   *
   * Asserts that `value` is a string.
   *
   *     var teaOrder = 'chai';
   *     assert.isString(teaOrder, 'order placed');
   *
   * @name isString
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isString = function (val, msg) {
    new Assertion(val, msg).to.be.a('string');
  };

  /**
   * ### .isNotString(value, [message])
   *
   * Asserts that `value` is _not_ a string.
   *
   *     var teaOrder = 4;
   *     assert.isNotString(teaOrder, 'order placed');
   *
   * @name isNotString
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isNotString = function (val, msg) {
    new Assertion(val, msg).to.not.be.a('string');
  };

  /**
   * ### .isNumber(value, [message])
   *
   * Asserts that `value` is a number.
   *
   *     var cups = 2;
   *     assert.isNumber(cups, 'how many cups');
   *
   * @name isNumber
   * @param {Number} value
   * @param {String} message
   * @api public
   */

  assert.isNumber = function (val, msg) {
    new Assertion(val, msg).to.be.a('number');
  };

  /**
   * ### .isNotNumber(value, [message])
   *
   * Asserts that `value` is _not_ a number.
   *
   *     var cups = '2 cups please';
   *     assert.isNotNumber(cups, 'how many cups');
   *
   * @name isNotNumber
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isNotNumber = function (val, msg) {
    new Assertion(val, msg).to.not.be.a('number');
  };

  /**
   * ### .isBoolean(value, [message])
   *
   * Asserts that `value` is a boolean.
   *
   *     var teaReady = true
   *       , teaServed = false;
   *
   *     assert.isBoolean(teaReady, 'is the tea ready');
   *     assert.isBoolean(teaServed, 'has tea been served');
   *
   * @name isBoolean
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isBoolean = function (val, msg) {
    new Assertion(val, msg).to.be.a('boolean');
  };

  /**
   * ### .isNotBoolean(value, [message])
   *
   * Asserts that `value` is _not_ a boolean.
   *
   *     var teaReady = 'yep'
   *       , teaServed = 'nope';
   *
   *     assert.isNotBoolean(teaReady, 'is the tea ready');
   *     assert.isNotBoolean(teaServed, 'has tea been served');
   *
   * @name isNotBoolean
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.isNotBoolean = function (val, msg) {
    new Assertion(val, msg).to.not.be.a('boolean');
  };

  /**
   * ### .typeOf(value, name, [message])
   *
   * Asserts that `value`'s type is `name`, as determined by
   * `Object.prototype.toString`.
   *
   *     assert.typeOf({ tea: 'chai' }, 'object', 'we have an object');
   *     assert.typeOf(['chai', 'jasmine'], 'array', 'we have an array');
   *     assert.typeOf('tea', 'string', 'we have a string');
   *     assert.typeOf(/tea/, 'regexp', 'we have a regular expression');
   *     assert.typeOf(null, 'null', 'we have a null');
   *     assert.typeOf(undefined, 'undefined', 'we have an undefined');
   *
   * @name typeOf
   * @param {Mixed} value
   * @param {String} name
   * @param {String} message
   * @api public
   */

  assert.typeOf = function (val, type, msg) {
    new Assertion(val, msg).to.be.a(type);
  };

  /**
   * ### .notTypeOf(value, name, [message])
   *
   * Asserts that `value`'s type is _not_ `name`, as determined by
   * `Object.prototype.toString`.
   *
   *     assert.notTypeOf('tea', 'number', 'strings are not numbers');
   *
   * @name notTypeOf
   * @param {Mixed} value
   * @param {String} typeof name
   * @param {String} message
   * @api public
   */

  assert.notTypeOf = function (val, type, msg) {
    new Assertion(val, msg).to.not.be.a(type);
  };

  /**
   * ### .instanceOf(object, constructor, [message])
   *
   * Asserts that `value` is an instance of `constructor`.
   *
   *     var Tea = function (name) { this.name = name; }
   *       , chai = new Tea('chai');
   *
   *     assert.instanceOf(chai, Tea, 'chai is an instance of tea');
   *
   * @name instanceOf
   * @param {Object} object
   * @param {Constructor} constructor
   * @param {String} message
   * @api public
   */

  assert.instanceOf = function (val, type, msg) {
    new Assertion(val, msg).to.be.instanceOf(type);
  };

  /**
   * ### .notInstanceOf(object, constructor, [message])
   *
   * Asserts `value` is not an instance of `constructor`.
   *
   *     var Tea = function (name) { this.name = name; }
   *       , chai = new String('chai');
   *
   *     assert.notInstanceOf(chai, Tea, 'chai is not an instance of tea');
   *
   * @name notInstanceOf
   * @param {Object} object
   * @param {Constructor} constructor
   * @param {String} message
   * @api public
   */

  assert.notInstanceOf = function (val, type, msg) {
    new Assertion(val, msg).to.not.be.instanceOf(type);
  };

  /**
   * ### .include(haystack, needle, [message])
   *
   * Asserts that `haystack` includes `needle`. Works
   * for strings and arrays.
   *
   *     assert.include('foobar', 'bar', 'foobar contains string "bar"');
   *     assert.include([ 1, 2, 3 ], 3, 'array contains value');
   *
   * @name include
   * @param {Array|String} haystack
   * @param {Mixed} needle
   * @param {String} message
   * @api public
   */

  assert.include = function (exp, inc, msg) {
    new Assertion(exp, msg, assert.include).include(inc);
  };

  /**
   * ### .notInclude(haystack, needle, [message])
   *
   * Asserts that `haystack` does not include `needle`. Works
   * for strings and arrays.
   *i
   *     assert.notInclude('foobar', 'baz', 'string not include substring');
   *     assert.notInclude([ 1, 2, 3 ], 4, 'array not include contain value');
   *
   * @name notInclude
   * @param {Array|String} haystack
   * @param {Mixed} needle
   * @param {String} message
   * @api public
   */

  assert.notInclude = function (exp, inc, msg) {
    new Assertion(exp, msg, assert.notInclude).not.include(inc);
  };

  /**
   * ### .match(value, regexp, [message])
   *
   * Asserts that `value` matches the regular expression `regexp`.
   *
   *     assert.match('foobar', /^foo/, 'regexp matches');
   *
   * @name match
   * @param {Mixed} value
   * @param {RegExp} regexp
   * @param {String} message
   * @api public
   */

  assert.match = function (exp, re, msg) {
    new Assertion(exp, msg).to.match(re);
  };

  /**
   * ### .notMatch(value, regexp, [message])
   *
   * Asserts that `value` does not match the regular expression `regexp`.
   *
   *     assert.notMatch('foobar', /^foo/, 'regexp does not match');
   *
   * @name notMatch
   * @param {Mixed} value
   * @param {RegExp} regexp
   * @param {String} message
   * @api public
   */

  assert.notMatch = function (exp, re, msg) {
    new Assertion(exp, msg).to.not.match(re);
  };

  /**
   * ### .property(object, property, [message])
   *
   * Asserts that `object` has a property named by `property`.
   *
   *     assert.property({ tea: { green: 'matcha' }}, 'tea');
   *
   * @name property
   * @param {Object} object
   * @param {String} property
   * @param {String} message
   * @api public
   */

  assert.property = function (obj, prop, msg) {
    new Assertion(obj, msg).to.have.property(prop);
  };

  /**
   * ### .notProperty(object, property, [message])
   *
   * Asserts that `object` does _not_ have a property named by `property`.
   *
   *     assert.notProperty({ tea: { green: 'matcha' }}, 'coffee');
   *
   * @name notProperty
   * @param {Object} object
   * @param {String} property
   * @param {String} message
   * @api public
   */

  assert.notProperty = function (obj, prop, msg) {
    new Assertion(obj, msg).to.not.have.property(prop);
  };

  /**
   * ### .deepProperty(object, property, [message])
   *
   * Asserts that `object` has a property named by `property`, which can be a
   * string using dot- and bracket-notation for deep reference.
   *
   *     assert.deepProperty({ tea: { green: 'matcha' }}, 'tea.green');
   *
   * @name deepProperty
   * @param {Object} object
   * @param {String} property
   * @param {String} message
   * @api public
   */

  assert.deepProperty = function (obj, prop, msg) {
    new Assertion(obj, msg).to.have.deep.property(prop);
  };

  /**
   * ### .notDeepProperty(object, property, [message])
   *
   * Asserts that `object` does _not_ have a property named by `property`, which
   * can be a string using dot- and bracket-notation for deep reference.
   *
   *     assert.notDeepProperty({ tea: { green: 'matcha' }}, 'tea.oolong');
   *
   * @name notDeepProperty
   * @param {Object} object
   * @param {String} property
   * @param {String} message
   * @api public
   */

  assert.notDeepProperty = function (obj, prop, msg) {
    new Assertion(obj, msg).to.not.have.deep.property(prop);
  };

  /**
   * ### .propertyVal(object, property, value, [message])
   *
   * Asserts that `object` has a property named by `property` with value given
   * by `value`.
   *
   *     assert.propertyVal({ tea: 'is good' }, 'tea', 'is good');
   *
   * @name propertyVal
   * @param {Object} object
   * @param {String} property
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.propertyVal = function (obj, prop, val, msg) {
    new Assertion(obj, msg).to.have.property(prop, val);
  };

  /**
   * ### .propertyNotVal(object, property, value, [message])
   *
   * Asserts that `object` has a property named by `property`, but with a value
   * different from that given by `value`.
   *
   *     assert.propertyNotVal({ tea: 'is good' }, 'tea', 'is bad');
   *
   * @name propertyNotVal
   * @param {Object} object
   * @param {String} property
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.propertyNotVal = function (obj, prop, val, msg) {
    new Assertion(obj, msg).to.not.have.property(prop, val);
  };

  /**
   * ### .deepPropertyVal(object, property, value, [message])
   *
   * Asserts that `object` has a property named by `property` with value given
   * by `value`. `property` can use dot- and bracket-notation for deep
   * reference.
   *
   *     assert.deepPropertyVal({ tea: { green: 'matcha' }}, 'tea.green', 'matcha');
   *
   * @name deepPropertyVal
   * @param {Object} object
   * @param {String} property
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.deepPropertyVal = function (obj, prop, val, msg) {
    new Assertion(obj, msg).to.have.deep.property(prop, val);
  };

  /**
   * ### .deepPropertyNotVal(object, property, value, [message])
   *
   * Asserts that `object` has a property named by `property`, but with a value
   * different from that given by `value`. `property` can use dot- and
   * bracket-notation for deep reference.
   *
   *     assert.deepPropertyNotVal({ tea: { green: 'matcha' }}, 'tea.green', 'konacha');
   *
   * @name deepPropertyNotVal
   * @param {Object} object
   * @param {String} property
   * @param {Mixed} value
   * @param {String} message
   * @api public
   */

  assert.deepPropertyNotVal = function (obj, prop, val, msg) {
    new Assertion(obj, msg).to.not.have.deep.property(prop, val);
  };

  /**
   * ### .lengthOf(object, length, [message])
   *
   * Asserts that `object` has a `length` property with the expected value.
   *
   *     assert.lengthOf([1,2,3], 3, 'array has length of 3');
   *     assert.lengthOf('foobar', 5, 'string has length of 6');
   *
   * @name lengthOf
   * @param {Mixed} object
   * @param {Number} length
   * @param {String} message
   * @api public
   */

  assert.lengthOf = function (exp, len, msg) {
    new Assertion(exp, msg).to.have.length(len);
  };

  /**
   * ### .throws(function, [constructor/string/regexp], [string/regexp], [message])
   *
   * Asserts that `function` will throw an error that is an instance of
   * `constructor`, or alternately that it will throw an error with message
   * matching `regexp`.
   *
   *     assert.throw(fn, 'function throws a reference error');
   *     assert.throw(fn, /function throws a reference error/);
   *     assert.throw(fn, ReferenceError);
   *     assert.throw(fn, ReferenceError, 'function throws a reference error');
   *     assert.throw(fn, ReferenceError, /function throws a reference error/);
   *
   * @name throws
   * @alias throw
   * @alias Throw
   * @param {Function} function
   * @param {ErrorConstructor} constructor
   * @param {RegExp} regexp
   * @param {String} message
   * @see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Error#Error_types
   * @api public
   */

  assert.Throw = function (fn, errt, errs, msg) {
    if ('string' === typeof errt || errt instanceof RegExp) {
      errs = errt;
      errt = null;
    }

    var assertErr = new Assertion(fn, msg).to.Throw(errt, errs);
    return flag(assertErr, 'object');
  };

  /**
   * ### .doesNotThrow(function, [constructor/regexp], [message])
   *
   * Asserts that `function` will _not_ throw an error that is an instance of
   * `constructor`, or alternately that it will not throw an error with message
   * matching `regexp`.
   *
   *     assert.doesNotThrow(fn, Error, 'function does not throw');
   *
   * @name doesNotThrow
   * @param {Function} function
   * @param {ErrorConstructor} constructor
   * @param {RegExp} regexp
   * @param {String} message
   * @see https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Error#Error_types
   * @api public
   */

  assert.doesNotThrow = function (fn, type, msg) {
    if ('string' === typeof type) {
      msg = type;
      type = null;
    }

    new Assertion(fn, msg).to.not.Throw(type);
  };

  /**
   * ### .operator(val1, operator, val2, [message])
   *
   * Compares two values using `operator`.
   *
   *     assert.operator(1, '<', 2, 'everything is ok');
   *     assert.operator(1, '>', 2, 'this will fail');
   *
   * @name operator
   * @param {Mixed} val1
   * @param {String} operator
   * @param {Mixed} val2
   * @param {String} message
   * @api public
   */

  assert.operator = function (val, operator, val2, msg) {
    if (!~['==', '===', '>', '>=', '<', '<=', '!=', '!=='].indexOf(operator)) {
      throw new Error('Invalid operator "' + operator + '"');
    }
    var test = new Assertion(eval(val + operator + val2), msg);
    test.assert(
        true === flag(test, 'object')
      , 'expected ' + util.inspect(val) + ' to be ' + operator + ' ' + util.inspect(val2)
      , 'expected ' + util.inspect(val) + ' to not be ' + operator + ' ' + util.inspect(val2) );
  };

  /**
   * ### .closeTo(actual, expected, delta, [message])
   *
   * Asserts that the target is equal `expected`, to within a +/- `delta` range.
   *
   *     assert.closeTo(1.5, 1, 0.5, 'numbers are close');
   *
   * @name closeTo
   * @param {Number} actual
   * @param {Number} expected
   * @param {Number} delta
   * @param {String} message
   * @api public
   */

  assert.closeTo = function (act, exp, delta, msg) {
    new Assertion(act, msg).to.be.closeTo(exp, delta);
  };

  /**
   * ### .sameMembers(set1, set2, [message])
   *
   * Asserts that `set1` and `set2` have the same members.
   * Order is not taken into account.
   *
   *     assert.sameMembers([ 1, 2, 3 ], [ 2, 1, 3 ], 'same members');
   *
   * @name sameMembers
   * @param {Array} superset
   * @param {Array} subset
   * @param {String} message
   * @api public
   */

  assert.sameMembers = function (set1, set2, msg) {
    new Assertion(set1, msg).to.have.same.members(set2);
  }

  /**
   * ### .includeMembers(superset, subset, [message])
   *
   * Asserts that `subset` is included in `superset`.
   * Order is not taken into account.
   *
   *     assert.includeMembers([ 1, 2, 3 ], [ 2, 1 ], 'include members');
   *
   * @name includeMembers
   * @param {Array} superset
   * @param {Array} subset
   * @param {String} message
   * @api public
   */

  assert.includeMembers = function (superset, subset, msg) {
    new Assertion(superset, msg).to.include.members(subset);
  }

  /*!
   * Undocumented / untested
   */

  assert.ifError = function (val, msg) {
    new Assertion(val, msg).to.not.be.ok;
  };

  /*!
   * Aliases.
   */

  (function alias(name, as){
    assert[as] = assert[name];
    return alias;
  })
  ('Throw', 'throw')
  ('Throw', 'throws');
};

});
require.register("chai/lib/chai/interface/expect.js", function(exports, require, module){
/*!
 * chai
 * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

module.exports = function (chai, util) {
  chai.expect = function (val, message) {
    return new chai.Assertion(val, message);
  };
};


});
require.register("chai/lib/chai/interface/should.js", function(exports, require, module){
/*!
 * chai
 * Copyright(c) 2011-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

module.exports = function (chai, util) {
  var Assertion = chai.Assertion;

  function loadShould () {
    // explicitly define this method as function as to have it's name to include as `ssfi`
    function shouldGetter() {
      if (this instanceof String || this instanceof Number) {
        return new Assertion(this.constructor(this), null, shouldGetter);
      } else if (this instanceof Boolean) {
        return new Assertion(this == true, null, shouldGetter);
      }
      return new Assertion(this, null, shouldGetter);
    }
    function shouldSetter(value) {
      // See https://github.com/chaijs/chai/issues/86: this makes
      // `whatever.should = someValue` actually set `someValue`, which is
      // especially useful for `global.should = require('chai').should()`.
      //
      // Note that we have to use [[DefineProperty]] instead of [[Put]]
      // since otherwise we would trigger this very setter!
      Object.defineProperty(this, 'should', {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    // modify Object.prototype to have `should`
    Object.defineProperty(Object.prototype, 'should', {
      set: shouldSetter
      , get: shouldGetter
      , configurable: true
    });

    var should = {};

    should.equal = function (val1, val2, msg) {
      new Assertion(val1, msg).to.equal(val2);
    };

    should.Throw = function (fn, errt, errs, msg) {
      new Assertion(fn, msg).to.Throw(errt, errs);
    };

    should.exist = function (val, msg) {
      new Assertion(val, msg).to.exist;
    }

    // negation
    should.not = {}

    should.not.equal = function (val1, val2, msg) {
      new Assertion(val1, msg).to.not.equal(val2);
    };

    should.not.Throw = function (fn, errt, errs, msg) {
      new Assertion(fn, msg).to.not.Throw(errt, errs);
    };

    should.not.exist = function (val, msg) {
      new Assertion(val, msg).to.not.exist;
    }

    should['throw'] = should['Throw'];
    should.not['throw'] = should.not['Throw'];

    return should;
  };

  chai.should = loadShould;
  chai.Should = loadShould;
};

});
require.register("chai/lib/chai/utils/addChainableMethod.js", function(exports, require, module){
/*!
 * Chai - addChainingMethod utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/*!
 * Module dependencies
 */

var transferFlags = require('./transferFlags');
var flag = require('./flag');
var config = require('../config');

/*!
 * Module variables
 */

// Check whether `__proto__` is supported
var hasProtoSupport = '__proto__' in Object;

// Without `__proto__` support, this module will need to add properties to a function.
// However, some Function.prototype methods cannot be overwritten,
// and there seems no easy cross-platform way to detect them (@see chaijs/chai/issues/69).
var excludeNames = /^(?:length|name|arguments|caller)$/;

// Cache `Function` properties
var call  = Function.prototype.call,
    apply = Function.prototype.apply;

/**
 * ### addChainableMethod (ctx, name, method, chainingBehavior)
 *
 * Adds a method to an object, such that the method can also be chained.
 *
 *     utils.addChainableMethod(chai.Assertion.prototype, 'foo', function (str) {
 *       var obj = utils.flag(this, 'object');
 *       new chai.Assertion(obj).to.be.equal(str);
 *     });
 *
 * Can also be accessed directly from `chai.Assertion`.
 *
 *     chai.Assertion.addChainableMethod('foo', fn, chainingBehavior);
 *
 * The result can then be used as both a method assertion, executing both `method` and
 * `chainingBehavior`, or as a language chain, which only executes `chainingBehavior`.
 *
 *     expect(fooStr).to.be.foo('bar');
 *     expect(fooStr).to.be.foo.equal('foo');
 *
 * @param {Object} ctx object to which the method is added
 * @param {String} name of method to add
 * @param {Function} method function to be used for `name`, when called
 * @param {Function} chainingBehavior function to be called every time the property is accessed
 * @name addChainableMethod
 * @api public
 */

module.exports = function (ctx, name, method, chainingBehavior) {
  if (typeof chainingBehavior !== 'function') {
    chainingBehavior = function () { };
  }

  var chainableBehavior = {
      method: method
    , chainingBehavior: chainingBehavior
  };

  // save the methods so we can overwrite them later, if we need to.
  if (!ctx.__methods) {
    ctx.__methods = {};
  }
  ctx.__methods[name] = chainableBehavior;

  Object.defineProperty(ctx, name,
    { get: function () {
        chainableBehavior.chainingBehavior.call(this);

        var assert = function assert() {
          var old_ssfi = flag(this, 'ssfi');
          if (old_ssfi && config.includeStack === false)
            flag(this, 'ssfi', assert);
          var result = chainableBehavior.method.apply(this, arguments);
          return result === undefined ? this : result;
        };

        // Use `__proto__` if available
        if (hasProtoSupport) {
          // Inherit all properties from the object by replacing the `Function` prototype
          var prototype = assert.__proto__ = Object.create(this);
          // Restore the `call` and `apply` methods from `Function`
          prototype.call = call;
          prototype.apply = apply;
        }
        // Otherwise, redefine all properties (slow!)
        else {
          var asserterNames = Object.getOwnPropertyNames(ctx);
          asserterNames.forEach(function (asserterName) {
            if (!excludeNames.test(asserterName)) {
              var pd = Object.getOwnPropertyDescriptor(ctx, asserterName);
              Object.defineProperty(assert, asserterName, pd);
            }
          });
        }

        transferFlags(this, assert);
        return assert;
      }
    , configurable: true
  });
};

});
require.register("chai/lib/chai/utils/addMethod.js", function(exports, require, module){
/*!
 * Chai - addMethod utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

var config = require('../config');

/**
 * ### .addMethod (ctx, name, method)
 *
 * Adds a method to the prototype of an object.
 *
 *     utils.addMethod(chai.Assertion.prototype, 'foo', function (str) {
 *       var obj = utils.flag(this, 'object');
 *       new chai.Assertion(obj).to.be.equal(str);
 *     });
 *
 * Can also be accessed directly from `chai.Assertion`.
 *
 *     chai.Assertion.addMethod('foo', fn);
 *
 * Then can be used as any other assertion.
 *
 *     expect(fooStr).to.be.foo('bar');
 *
 * @param {Object} ctx object to which the method is added
 * @param {String} name of method to add
 * @param {Function} method function to be used for name
 * @name addMethod
 * @api public
 */
var flag = require('./flag');

module.exports = function (ctx, name, method) {
  ctx[name] = function () {
    var old_ssfi = flag(this, 'ssfi');
    if (old_ssfi && config.includeStack === false)
      flag(this, 'ssfi', ctx[name]);
    var result = method.apply(this, arguments);
    return result === undefined ? this : result;
  };
};

});
require.register("chai/lib/chai/utils/addProperty.js", function(exports, require, module){
/*!
 * Chai - addProperty utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * ### addProperty (ctx, name, getter)
 *
 * Adds a property to the prototype of an object.
 *
 *     utils.addProperty(chai.Assertion.prototype, 'foo', function () {
 *       var obj = utils.flag(this, 'object');
 *       new chai.Assertion(obj).to.be.instanceof(Foo);
 *     });
 *
 * Can also be accessed directly from `chai.Assertion`.
 *
 *     chai.Assertion.addProperty('foo', fn);
 *
 * Then can be used as any other assertion.
 *
 *     expect(myFoo).to.be.foo;
 *
 * @param {Object} ctx object to which the property is added
 * @param {String} name of property to add
 * @param {Function} getter function to be used for name
 * @name addProperty
 * @api public
 */

module.exports = function (ctx, name, getter) {
  Object.defineProperty(ctx, name,
    { get: function () {
        var result = getter.call(this);
        return result === undefined ? this : result;
      }
    , configurable: true
  });
};

});
require.register("chai/lib/chai/utils/flag.js", function(exports, require, module){
/*!
 * Chai - flag utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * ### flag(object ,key, [value])
 *
 * Get or set a flag value on an object. If a
 * value is provided it will be set, else it will
 * return the currently set value or `undefined` if
 * the value is not set.
 *
 *     utils.flag(this, 'foo', 'bar'); // setter
 *     utils.flag(this, 'foo'); // getter, returns `bar`
 *
 * @param {Object} object (constructed Assertion
 * @param {String} key
 * @param {Mixed} value (optional)
 * @name flag
 * @api private
 */

module.exports = function (obj, key, value) {
  var flags = obj.__flags || (obj.__flags = Object.create(null));
  if (arguments.length === 3) {
    flags[key] = value;
  } else {
    return flags[key];
  }
};

});
require.register("chai/lib/chai/utils/getActual.js", function(exports, require, module){
/*!
 * Chai - getActual utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * # getActual(object, [actual])
 *
 * Returns the `actual` value for an Assertion
 *
 * @param {Object} object (constructed Assertion)
 * @param {Arguments} chai.Assertion.prototype.assert arguments
 */

module.exports = function (obj, args) {
  return args.length > 4 ? args[4] : obj._obj;
};

});
require.register("chai/lib/chai/utils/getEnumerableProperties.js", function(exports, require, module){
/*!
 * Chai - getEnumerableProperties utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * ### .getEnumerableProperties(object)
 *
 * This allows the retrieval of enumerable property names of an object,
 * inherited or not.
 *
 * @param {Object} object
 * @returns {Array}
 * @name getEnumerableProperties
 * @api public
 */

module.exports = function getEnumerableProperties(object) {
  var result = [];
  for (var name in object) {
    result.push(name);
  }
  return result;
};

});
require.register("chai/lib/chai/utils/getMessage.js", function(exports, require, module){
/*!
 * Chai - message composition utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/*!
 * Module dependancies
 */

var flag = require('./flag')
  , getActual = require('./getActual')
  , inspect = require('./inspect')
  , objDisplay = require('./objDisplay');

/**
 * ### .getMessage(object, message, negateMessage)
 *
 * Construct the error message based on flags
 * and template tags. Template tags will return
 * a stringified inspection of the object referenced.
 *
 * Message template tags:
 * - `#{this}` current asserted object
 * - `#{act}` actual value
 * - `#{exp}` expected value
 *
 * @param {Object} object (constructed Assertion)
 * @param {Arguments} chai.Assertion.prototype.assert arguments
 * @name getMessage
 * @api public
 */

module.exports = function (obj, args) {
  var negate = flag(obj, 'negate')
    , val = flag(obj, 'object')
    , expected = args[3]
    , actual = getActual(obj, args)
    , msg = negate ? args[2] : args[1]
    , flagMsg = flag(obj, 'message');

  msg = msg || '';
  msg = msg
    .replace(/#{this}/g, objDisplay(val))
    .replace(/#{act}/g, objDisplay(actual))
    .replace(/#{exp}/g, objDisplay(expected));

  return flagMsg ? flagMsg + ': ' + msg : msg;
};

});
require.register("chai/lib/chai/utils/getName.js", function(exports, require, module){
/*!
 * Chai - getName utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * # getName(func)
 *
 * Gets the name of a function, in a cross-browser way.
 *
 * @param {Function} a function (usually a constructor)
 */

module.exports = function (func) {
  if (func.name) return func.name;

  var match = /^\s?function ([^(]*)\(/.exec(func);
  return match && match[1] ? match[1] : "";
};

});
require.register("chai/lib/chai/utils/getPathValue.js", function(exports, require, module){
/*!
 * Chai - getPathValue utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * @see https://github.com/logicalparadox/filtr
 * MIT Licensed
 */

/**
 * ### .getPathValue(path, object)
 *
 * This allows the retrieval of values in an
 * object given a string path.
 *
 *     var obj = {
 *         prop1: {
 *             arr: ['a', 'b', 'c']
 *           , str: 'Hello'
 *         }
 *       , prop2: {
 *             arr: [ { nested: 'Universe' } ]
 *           , str: 'Hello again!'
 *         }
 *     }
 *
 * The following would be the results.
 *
 *     getPathValue('prop1.str', obj); // Hello
 *     getPathValue('prop1.att[2]', obj); // b
 *     getPathValue('prop2.arr[0].nested', obj); // Universe
 *
 * @param {String} path
 * @param {Object} object
 * @returns {Object} value or `undefined`
 * @name getPathValue
 * @api public
 */

var getPathValue = module.exports = function (path, obj) {
  var parsed = parsePath(path);
  return _getPathValue(parsed, obj);
};

/*!
 * ## parsePath(path)
 *
 * Helper function used to parse string object
 * paths. Use in conjunction with `_getPathValue`.
 *
 *      var parsed = parsePath('myobject.property.subprop');
 *
 * ### Paths:
 *
 * * Can be as near infinitely deep and nested
 * * Arrays are also valid using the formal `myobject.document[3].property`.
 *
 * @param {String} path
 * @returns {Object} parsed
 * @api private
 */

function parsePath (path) {
  var str = path.replace(/\[/g, '.[')
    , parts = str.match(/(\\\.|[^.]+?)+/g);
  return parts.map(function (value) {
    var re = /\[(\d+)\]$/
      , mArr = re.exec(value)
    if (mArr) return { i: parseFloat(mArr[1]) };
    else return { p: value };
  });
};

/*!
 * ## _getPathValue(parsed, obj)
 *
 * Helper companion function for `.parsePath` that returns
 * the value located at the parsed address.
 *
 *      var value = getPathValue(parsed, obj);
 *
 * @param {Object} parsed definition from `parsePath`.
 * @param {Object} object to search against
 * @returns {Object|Undefined} value
 * @api private
 */

function _getPathValue (parsed, obj) {
  var tmp = obj
    , res;
  for (var i = 0, l = parsed.length; i < l; i++) {
    var part = parsed[i];
    if (tmp) {
      if ('undefined' !== typeof part.p)
        tmp = tmp[part.p];
      else if ('undefined' !== typeof part.i)
        tmp = tmp[part.i];
      if (i == (l - 1)) res = tmp;
    } else {
      res = undefined;
    }
  }
  return res;
};

});
require.register("chai/lib/chai/utils/getProperties.js", function(exports, require, module){
/*!
 * Chai - getProperties utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * ### .getProperties(object)
 *
 * This allows the retrieval of property names of an object, enumerable or not,
 * inherited or not.
 *
 * @param {Object} object
 * @returns {Array}
 * @name getProperties
 * @api public
 */

module.exports = function getProperties(object) {
  var result = Object.getOwnPropertyNames(subject);

  function addProperty(property) {
    if (result.indexOf(property) === -1) {
      result.push(property);
    }
  }

  var proto = Object.getPrototypeOf(subject);
  while (proto !== null) {
    Object.getOwnPropertyNames(proto).forEach(addProperty);
    proto = Object.getPrototypeOf(proto);
  }

  return result;
};

});
require.register("chai/lib/chai/utils/index.js", function(exports, require, module){
/*!
 * chai
 * Copyright(c) 2011 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/*!
 * Main exports
 */

var exports = module.exports = {};

/*!
 * test utility
 */

exports.test = require('./test');

/*!
 * type utility
 */

exports.type = require('./type');

/*!
 * message utility
 */

exports.getMessage = require('./getMessage');

/*!
 * actual utility
 */

exports.getActual = require('./getActual');

/*!
 * Inspect util
 */

exports.inspect = require('./inspect');

/*!
 * Object Display util
 */

exports.objDisplay = require('./objDisplay');

/*!
 * Flag utility
 */

exports.flag = require('./flag');

/*!
 * Flag transferring utility
 */

exports.transferFlags = require('./transferFlags');

/*!
 * Deep equal utility
 */

exports.eql = require('deep-eql');

/*!
 * Deep path value
 */

exports.getPathValue = require('./getPathValue');

/*!
 * Function name
 */

exports.getName = require('./getName');

/*!
 * add Property
 */

exports.addProperty = require('./addProperty');

/*!
 * add Method
 */

exports.addMethod = require('./addMethod');

/*!
 * overwrite Property
 */

exports.overwriteProperty = require('./overwriteProperty');

/*!
 * overwrite Method
 */

exports.overwriteMethod = require('./overwriteMethod');

/*!
 * Add a chainable method
 */

exports.addChainableMethod = require('./addChainableMethod');

/*!
 * Overwrite chainable method
 */

exports.overwriteChainableMethod = require('./overwriteChainableMethod');


});
require.register("chai/lib/chai/utils/inspect.js", function(exports, require, module){
// This is (almost) directly from Node.js utils
// https://github.com/joyent/node/blob/f8c335d0caf47f16d31413f89aa28eda3878e3aa/lib/util.js

var getName = require('./getName');
var getProperties = require('./getProperties');
var getEnumerableProperties = require('./getEnumerableProperties');

module.exports = inspect;

/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Boolean} showHidden Flag that shows hidden (not enumerable)
 *    properties of objects.
 * @param {Number} depth Depth in which to descend in object. Default is 2.
 * @param {Boolean} colors Flag to turn on ANSI escape codes to color the
 *    output. Default is false (no coloring).
 */
function inspect(obj, showHidden, depth, colors) {
  var ctx = {
    showHidden: showHidden,
    seen: [],
    stylize: function (str) { return str; }
  };
  return formatValue(ctx, obj, (typeof depth === 'undefined' ? 2 : depth));
}

// https://gist.github.com/1044128/
var getOuterHTML = function(element) {
  if ('outerHTML' in element) return element.outerHTML;
  var ns = "http://www.w3.org/1999/xhtml";
  var container = document.createElementNS(ns, '_');
  var elemProto = (window.HTMLElement || window.Element).prototype;
  var xmlSerializer = new XMLSerializer();
  var html;
  if (document.xmlVersion) {
    return xmlSerializer.serializeToString(element);
  } else {
    container.appendChild(element.cloneNode(false));
    html = container.innerHTML.replace('><', '>' + element.innerHTML + '<');
    container.innerHTML = '';
    return html;
  }
};

// Returns true if object is a DOM element.
var isDOMElement = function (object) {
  if (typeof HTMLElement === 'object') {
    return object instanceof HTMLElement;
  } else {
    return object &&
      typeof object === 'object' &&
      object.nodeType === 1 &&
      typeof object.nodeName === 'string';
  }
};

function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (value && typeof value.inspect === 'function' &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes);
    if (typeof ret !== 'string') {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // If it's DOM elem, get outer HTML.
  if (isDOMElement(value)) {
    return getOuterHTML(value);
  }

  // Look up the keys of the object.
  var visibleKeys = getEnumerableProperties(value);
  var keys = ctx.showHidden ? getProperties(value) : visibleKeys;

  // Some type of object without properties can be shortcutted.
  // In IE, errors have a single `stack` property, or if they are vanilla `Error`,
  // a `stack` plus `description` property; ignore those for consistency.
  if (keys.length === 0 || (isError(value) && (
      (keys.length === 1 && keys[0] === 'stack') ||
      (keys.length === 2 && keys[0] === 'description' && keys[1] === 'stack')
     ))) {
    if (typeof value === 'function') {
      var name = getName(value);
      var nameSuffix = name ? ': ' + name : '';
      return ctx.stylize('[Function' + nameSuffix + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toUTCString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (typeof value === 'function') {
    var name = getName(value);
    var nameSuffix = name ? ': ' + name : '';
    base = ' [Function' + nameSuffix + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    return formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  switch (typeof value) {
    case 'undefined':
      return ctx.stylize('undefined', 'undefined');

    case 'string':
      var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                               .replace(/'/g, "\\'")
                                               .replace(/\\"/g, '"') + '\'';
      return ctx.stylize(simple, 'string');

    case 'number':
      return ctx.stylize('' + value, 'number');

    case 'boolean':
      return ctx.stylize('' + value, 'boolean');
  }
  // For some reason typeof null is "object", so special case here.
  if (value === null) {
    return ctx.stylize('null', 'null');
  }
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (Object.prototype.hasOwnProperty.call(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str;
  if (value.__lookupGetter__) {
    if (value.__lookupGetter__(key)) {
      if (value.__lookupSetter__(key)) {
        str = ctx.stylize('[Getter/Setter]', 'special');
      } else {
        str = ctx.stylize('[Getter]', 'special');
      }
    } else {
      if (value.__lookupSetter__(key)) {
        str = ctx.stylize('[Setter]', 'special');
      }
    }
  }
  if (visibleKeys.indexOf(key) < 0) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(value[key]) < 0) {
      if (recurseTimes === null) {
        str = formatValue(ctx, value[key], null);
      } else {
        str = formatValue(ctx, value[key], recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (typeof name === 'undefined') {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}

function isArray(ar) {
  return Array.isArray(ar) ||
         (typeof ar === 'object' && objectToString(ar) === '[object Array]');
}

function isRegExp(re) {
  return typeof re === 'object' && objectToString(re) === '[object RegExp]';
}

function isDate(d) {
  return typeof d === 'object' && objectToString(d) === '[object Date]';
}

function isError(e) {
  return typeof e === 'object' && objectToString(e) === '[object Error]';
}

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

});
require.register("chai/lib/chai/utils/objDisplay.js", function(exports, require, module){
/*!
 * Chai - flag utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/*!
 * Module dependancies
 */

var inspect = require('./inspect');
var config = require('../config');

/**
 * ### .objDisplay (object)
 *
 * Determines if an object or an array matches
 * criteria to be inspected in-line for error
 * messages or should be truncated.
 *
 * @param {Mixed} javascript object to inspect
 * @name objDisplay
 * @api public
 */

module.exports = function (obj) {
  var str = inspect(obj)
    , type = Object.prototype.toString.call(obj);

  if (config.truncateThreshold && str.length >= config.truncateThreshold) {
    if (type === '[object Function]') {
      return !obj.name || obj.name === ''
        ? '[Function]'
        : '[Function: ' + obj.name + ']';
    } else if (type === '[object Array]') {
      return '[ Array(' + obj.length + ') ]';
    } else if (type === '[object Object]') {
      var keys = Object.keys(obj)
        , kstr = keys.length > 2
          ? keys.splice(0, 2).join(', ') + ', ...'
          : keys.join(', ');
      return '{ Object (' + kstr + ') }';
    } else {
      return str;
    }
  } else {
    return str;
  }
};

});
require.register("chai/lib/chai/utils/overwriteMethod.js", function(exports, require, module){
/*!
 * Chai - overwriteMethod utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * ### overwriteMethod (ctx, name, fn)
 *
 * Overwites an already existing method and provides
 * access to previous function. Must return function
 * to be used for name.
 *
 *     utils.overwriteMethod(chai.Assertion.prototype, 'equal', function (_super) {
 *       return function (str) {
 *         var obj = utils.flag(this, 'object');
 *         if (obj instanceof Foo) {
 *           new chai.Assertion(obj.value).to.equal(str);
 *         } else {
 *           _super.apply(this, arguments);
 *         }
 *       }
 *     });
 *
 * Can also be accessed directly from `chai.Assertion`.
 *
 *     chai.Assertion.overwriteMethod('foo', fn);
 *
 * Then can be used as any other assertion.
 *
 *     expect(myFoo).to.equal('bar');
 *
 * @param {Object} ctx object whose method is to be overwritten
 * @param {String} name of method to overwrite
 * @param {Function} method function that returns a function to be used for name
 * @name overwriteMethod
 * @api public
 */

module.exports = function (ctx, name, method) {
  var _method = ctx[name]
    , _super = function () { return this; };

  if (_method && 'function' === typeof _method)
    _super = _method;

  ctx[name] = function () {
    var result = method(_super).apply(this, arguments);
    return result === undefined ? this : result;
  }
};

});
require.register("chai/lib/chai/utils/overwriteProperty.js", function(exports, require, module){
/*!
 * Chai - overwriteProperty utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * ### overwriteProperty (ctx, name, fn)
 *
 * Overwites an already existing property getter and provides
 * access to previous value. Must return function to use as getter.
 *
 *     utils.overwriteProperty(chai.Assertion.prototype, 'ok', function (_super) {
 *       return function () {
 *         var obj = utils.flag(this, 'object');
 *         if (obj instanceof Foo) {
 *           new chai.Assertion(obj.name).to.equal('bar');
 *         } else {
 *           _super.call(this);
 *         }
 *       }
 *     });
 *
 *
 * Can also be accessed directly from `chai.Assertion`.
 *
 *     chai.Assertion.overwriteProperty('foo', fn);
 *
 * Then can be used as any other assertion.
 *
 *     expect(myFoo).to.be.ok;
 *
 * @param {Object} ctx object whose property is to be overwritten
 * @param {String} name of property to overwrite
 * @param {Function} getter function that returns a getter function to be used for name
 * @name overwriteProperty
 * @api public
 */

module.exports = function (ctx, name, getter) {
  var _get = Object.getOwnPropertyDescriptor(ctx, name)
    , _super = function () {};

  if (_get && 'function' === typeof _get.get)
    _super = _get.get

  Object.defineProperty(ctx, name,
    { get: function () {
        var result = getter(_super).call(this);
        return result === undefined ? this : result;
      }
    , configurable: true
  });
};

});
require.register("chai/lib/chai/utils/overwriteChainableMethod.js", function(exports, require, module){
/*!
 * Chai - overwriteChainableMethod utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * ### overwriteChainableMethod (ctx, name, fn)
 *
 * Overwites an already existing chainable method
 * and provides access to the previous function or
 * property.  Must return functions to be used for
 * name.
 *
 *     utils.overwriteChainableMethod(chai.Assertion.prototype, 'length',
 *       function (_super) {
 *       }
 *     , function (_super) {
 *       }
 *     );
 *
 * Can also be accessed directly from `chai.Assertion`.
 *
 *     chai.Assertion.overwriteChainableMethod('foo', fn, fn);
 *
 * Then can be used as any other assertion.
 *
 *     expect(myFoo).to.have.length(3);
 *     expect(myFoo).to.have.length.above(3);
 *
 * @param {Object} ctx object whose method / property is to be overwritten
 * @param {String} name of method / property to overwrite
 * @param {Function} method function that returns a function to be used for name
 * @param {Function} chainingBehavior function that returns a function to be used for property
 * @name overwriteChainableMethod
 * @api public
 */

module.exports = function (ctx, name, method, chainingBehavior) {
  var chainableBehavior = ctx.__methods[name];

  var _chainingBehavior = chainableBehavior.chainingBehavior;
  chainableBehavior.chainingBehavior = function () {
    var result = chainingBehavior(_chainingBehavior).call(this);
    return result === undefined ? this : result;
  };

  var _method = chainableBehavior.method;
  chainableBehavior.method = function () {
    var result = method(_method).apply(this, arguments);
    return result === undefined ? this : result;
  };
};

});
require.register("chai/lib/chai/utils/test.js", function(exports, require, module){
/*!
 * Chai - test utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/*!
 * Module dependancies
 */

var flag = require('./flag');

/**
 * # test(object, expression)
 *
 * Test and object for expression.
 *
 * @param {Object} object (constructed Assertion)
 * @param {Arguments} chai.Assertion.prototype.assert arguments
 */

module.exports = function (obj, args) {
  var negate = flag(obj, 'negate')
    , expr = args[0];
  return negate ? !expr : expr;
};

});
require.register("chai/lib/chai/utils/transferFlags.js", function(exports, require, module){
/*!
 * Chai - transferFlags utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/**
 * ### transferFlags(assertion, object, includeAll = true)
 *
 * Transfer all the flags for `assertion` to `object`. If
 * `includeAll` is set to `false`, then the base Chai
 * assertion flags (namely `object`, `ssfi`, and `message`)
 * will not be transferred.
 *
 *
 *     var newAssertion = new Assertion();
 *     utils.transferFlags(assertion, newAssertion);
 *
 *     var anotherAsseriton = new Assertion(myObj);
 *     utils.transferFlags(assertion, anotherAssertion, false);
 *
 * @param {Assertion} assertion the assertion to transfer the flags from
 * @param {Object} object the object to transfer the flags too; usually a new assertion
 * @param {Boolean} includeAll
 * @name getAllFlags
 * @api private
 */

module.exports = function (assertion, object, includeAll) {
  var flags = assertion.__flags || (assertion.__flags = Object.create(null));

  if (!object.__flags) {
    object.__flags = Object.create(null);
  }

  includeAll = arguments.length === 3 ? includeAll : true;

  for (var flag in flags) {
    if (includeAll ||
        (flag !== 'object' && flag !== 'ssfi' && flag != 'message')) {
      object.__flags[flag] = flags[flag];
    }
  }
};

});
require.register("chai/lib/chai/utils/type.js", function(exports, require, module){
/*!
 * Chai - type utility
 * Copyright(c) 2012-2014 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/*!
 * Detectable javascript natives
 */

var natives = {
    '[object Arguments]': 'arguments'
  , '[object Array]': 'array'
  , '[object Date]': 'date'
  , '[object Function]': 'function'
  , '[object Number]': 'number'
  , '[object RegExp]': 'regexp'
  , '[object String]': 'string'
};

/**
 * ### type(object)
 *
 * Better implementation of `typeof` detection that can
 * be used cross-browser. Handles the inconsistencies of
 * Array, `null`, and `undefined` detection.
 *
 *     utils.type({}) // 'object'
 *     utils.type(null) // `null'
 *     utils.type(undefined) // `undefined`
 *     utils.type([]) // `array`
 *
 * @param {Mixed} object to detect type of
 * @name type
 * @api private
 */

module.exports = function (obj) {
  var str = Object.prototype.toString.call(obj);
  if (natives[str]) return natives[str];
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (obj === Object(obj)) return 'object';
  return typeof obj;
};

});




require.alias("chaijs-assertion-error/index.js", "chai/deps/assertion-error/index.js");
require.alias("chaijs-assertion-error/index.js", "chai/deps/assertion-error/index.js");
require.alias("chaijs-assertion-error/index.js", "assertion-error/index.js");
require.alias("chaijs-assertion-error/index.js", "chaijs-assertion-error/index.js");
require.alias("chaijs-deep-eql/lib/eql.js", "chai/deps/deep-eql/lib/eql.js");
require.alias("chaijs-deep-eql/lib/eql.js", "chai/deps/deep-eql/index.js");
require.alias("chaijs-deep-eql/lib/eql.js", "deep-eql/index.js");
require.alias("chaijs-type-detect/lib/type.js", "chaijs-deep-eql/deps/type-detect/lib/type.js");
require.alias("chaijs-type-detect/lib/type.js", "chaijs-deep-eql/deps/type-detect/index.js");
require.alias("chaijs-type-detect/lib/type.js", "chaijs-type-detect/index.js");
require.alias("chaijs-deep-eql/lib/eql.js", "chaijs-deep-eql/index.js");
require.alias("chai/index.js", "chai/index.js");if (typeof exports == "object") {
  module.exports = require("chai");
} else if (typeof define == "function" && define.amd) {
  define([], function(){ return require("chai"); });
} else {
  this["chai"] = require("chai");
}})();
/*!
 * async
 * https://github.com/caolan/async
 *
 * Copyright 2010-2014 Caolan McMahon
 * Released under the MIT license
 */
/*jshint onevar: false, indent:4 */
/*global setImmediate: false, setTimeout: false, console: false */
(function () {

    var async = {};

    // global on the server, window in the browser
    var root, previous_async;

    root = this;
    if (root != null) {
      previous_async = root.async;
    }

    async.noConflict = function () {
        root.async = previous_async;
        return async;
    };

    function only_once(fn) {
        var called = false;
        return function() {
            if (called) throw new Error("Callback was already called.");
            called = true;
            fn.apply(root, arguments);
        }
    }

    //// cross-browser compatiblity functions ////

    var _toString = Object.prototype.toString;

    var _isArray = Array.isArray || function (obj) {
        return _toString.call(obj) === '[object Array]';
    };

    var _each = function (arr, iterator) {
        if (arr.forEach) {
            return arr.forEach(iterator);
        }
        for (var i = 0; i < arr.length; i += 1) {
            iterator(arr[i], i, arr);
        }
    };

    var _map = function (arr, iterator) {
        if (arr.map) {
            return arr.map(iterator);
        }
        var results = [];
        _each(arr, function (x, i, a) {
            results.push(iterator(x, i, a));
        });
        return results;
    };

    var _reduce = function (arr, iterator, memo) {
        if (arr.reduce) {
            return arr.reduce(iterator, memo);
        }
        _each(arr, function (x, i, a) {
            memo = iterator(memo, x, i, a);
        });
        return memo;
    };

    var _keys = function (obj) {
        if (Object.keys) {
            return Object.keys(obj);
        }
        var keys = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                keys.push(k);
            }
        }
        return keys;
    };

    //// exported async module functions ////

    //// nextTick implementation with browser-compatible fallback ////
    if (typeof process === 'undefined' || !(process.nextTick)) {
        if (typeof setImmediate === 'function') {
            async.nextTick = function (fn) {
                // not a direct alias for IE10 compatibility
                setImmediate(fn);
            };
            async.setImmediate = async.nextTick;
        }
        else {
            async.nextTick = function (fn) {
                setTimeout(fn, 0);
            };
            async.setImmediate = async.nextTick;
        }
    }
    else {
        async.nextTick = process.nextTick;
        if (typeof setImmediate !== 'undefined') {
            async.setImmediate = function (fn) {
              // not a direct alias for IE10 compatibility
              setImmediate(fn);
            };
        }
        else {
            async.setImmediate = async.nextTick;
        }
    }

    async.each = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        _each(arr, function (x) {
            iterator(x, only_once(done) );
        });
        function done(err) {
          if (err) {
              callback(err);
              callback = function () {};
          }
          else {
              completed += 1;
              if (completed >= arr.length) {
                  callback();
              }
          }
        }
    };
    async.forEach = async.each;

    async.eachSeries = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        var iterate = function () {
            iterator(arr[completed], function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed >= arr.length) {
                        callback();
                    }
                    else {
                        iterate();
                    }
                }
            });
        };
        iterate();
    };
    async.forEachSeries = async.eachSeries;

    async.eachLimit = function (arr, limit, iterator, callback) {
        var fn = _eachLimit(limit);
        fn.apply(null, [arr, iterator, callback]);
    };
    async.forEachLimit = async.eachLimit;

    var _eachLimit = function (limit) {

        return function (arr, iterator, callback) {
            callback = callback || function () {};
            if (!arr.length || limit <= 0) {
                return callback();
            }
            var completed = 0;
            var started = 0;
            var running = 0;

            (function replenish () {
                if (completed >= arr.length) {
                    return callback();
                }

                while (running < limit && started < arr.length) {
                    started += 1;
                    running += 1;
                    iterator(arr[started - 1], function (err) {
                        if (err) {
                            callback(err);
                            callback = function () {};
                        }
                        else {
                            completed += 1;
                            running -= 1;
                            if (completed >= arr.length) {
                                callback();
                            }
                            else {
                                replenish();
                            }
                        }
                    });
                }
            })();
        };
    };


    var doParallel = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.each].concat(args));
        };
    };
    var doParallelLimit = function(limit, fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [_eachLimit(limit)].concat(args));
        };
    };
    var doSeries = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [async.eachSeries].concat(args));
        };
    };


    var _asyncMap = function (eachfn, arr, iterator, callback) {
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        if (!callback) {
            eachfn(arr, function (x, callback) {
                iterator(x.value, function (err) {
                    callback(err);
                });
            });
        } else {
            var results = [];
            eachfn(arr, function (x, callback) {
                iterator(x.value, function (err, v) {
                    results[x.index] = v;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };
    async.map = doParallel(_asyncMap);
    async.mapSeries = doSeries(_asyncMap);
    async.mapLimit = function (arr, limit, iterator, callback) {
        return _mapLimit(limit)(arr, iterator, callback);
    };

    var _mapLimit = function(limit) {
        return doParallelLimit(limit, _asyncMap);
    };

    // reduce only has a series version, as doing reduce in parallel won't
    // work in many situations.
    async.reduce = function (arr, memo, iterator, callback) {
        async.eachSeries(arr, function (x, callback) {
            iterator(memo, x, function (err, v) {
                memo = v;
                callback(err);
            });
        }, function (err) {
            callback(err, memo);
        });
    };
    // inject alias
    async.inject = async.reduce;
    // foldl alias
    async.foldl = async.reduce;

    async.reduceRight = function (arr, memo, iterator, callback) {
        var reversed = _map(arr, function (x) {
            return x;
        }).reverse();
        async.reduce(reversed, memo, iterator, callback);
    };
    // foldr alias
    async.foldr = async.reduceRight;

    var _filter = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.filter = doParallel(_filter);
    async.filterSeries = doSeries(_filter);
    // select alias
    async.select = async.filter;
    async.selectSeries = async.filterSeries;

    var _reject = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (!v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    async.reject = doParallel(_reject);
    async.rejectSeries = doSeries(_reject);

    var _detect = function (eachfn, arr, iterator, main_callback) {
        eachfn(arr, function (x, callback) {
            iterator(x, function (result) {
                if (result) {
                    main_callback(x);
                    main_callback = function () {};
                }
                else {
                    callback();
                }
            });
        }, function (err) {
            main_callback();
        });
    };
    async.detect = doParallel(_detect);
    async.detectSeries = doSeries(_detect);

    async.some = function (arr, iterator, main_callback) {
        async.each(arr, function (x, callback) {
            iterator(x, function (v) {
                if (v) {
                    main_callback(true);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(false);
        });
    };
    // any alias
    async.any = async.some;

    async.every = function (arr, iterator, main_callback) {
        async.each(arr, function (x, callback) {
            iterator(x, function (v) {
                if (!v) {
                    main_callback(false);
                    main_callback = function () {};
                }
                callback();
            });
        }, function (err) {
            main_callback(true);
        });
    };
    // all alias
    async.all = async.every;

    async.sortBy = function (arr, iterator, callback) {
        async.map(arr, function (x, callback) {
            iterator(x, function (err, criteria) {
                if (err) {
                    callback(err);
                }
                else {
                    callback(null, {value: x, criteria: criteria});
                }
            });
        }, function (err, results) {
            if (err) {
                return callback(err);
            }
            else {
                var fn = function (left, right) {
                    var a = left.criteria, b = right.criteria;
                    return a < b ? -1 : a > b ? 1 : 0;
                };
                callback(null, _map(results.sort(fn), function (x) {
                    return x.value;
                }));
            }
        });
    };

    async.auto = function (tasks, callback) {
        callback = callback || function () {};
        var keys = _keys(tasks);
        var remainingTasks = keys.length
        if (!remainingTasks) {
            return callback();
        }

        var results = {};

        var listeners = [];
        var addListener = function (fn) {
            listeners.unshift(fn);
        };
        var removeListener = function (fn) {
            for (var i = 0; i < listeners.length; i += 1) {
                if (listeners[i] === fn) {
                    listeners.splice(i, 1);
                    return;
                }
            }
        };
        var taskComplete = function () {
            remainingTasks--
            _each(listeners.slice(0), function (fn) {
                fn();
            });
        };

        addListener(function () {
            if (!remainingTasks) {
                var theCallback = callback;
                // prevent final callback from calling itself if it errors
                callback = function () {};

                theCallback(null, results);
            }
        });

        _each(keys, function (k) {
            var task = _isArray(tasks[k]) ? tasks[k]: [tasks[k]];
            var taskCallback = function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length <= 1) {
                    args = args[0];
                }
                if (err) {
                    var safeResults = {};
                    _each(_keys(results), function(rkey) {
                        safeResults[rkey] = results[rkey];
                    });
                    safeResults[k] = args;
                    callback(err, safeResults);
                    // stop subsequent errors hitting callback multiple times
                    callback = function () {};
                }
                else {
                    results[k] = args;
                    async.setImmediate(taskComplete);
                }
            };
            var requires = task.slice(0, Math.abs(task.length - 1)) || [];
            var ready = function () {
                return _reduce(requires, function (a, x) {
                    return (a && results.hasOwnProperty(x));
                }, true) && !results.hasOwnProperty(k);
            };
            if (ready()) {
                task[task.length - 1](taskCallback, results);
            }
            else {
                var listener = function () {
                    if (ready()) {
                        removeListener(listener);
                        task[task.length - 1](taskCallback, results);
                    }
                };
                addListener(listener);
            }
        });
    };

    async.retry = function(times, task, callback) {
        var DEFAULT_TIMES = 5;
        var attempts = [];
        // Use defaults if times not passed
        if (typeof times === 'function') {
            callback = task;
            task = times;
            times = DEFAULT_TIMES;
        }
        // Make sure times is a number
        times = parseInt(times, 10) || DEFAULT_TIMES;
        var wrappedTask = function(wrappedCallback, wrappedResults) {
            var retryAttempt = function(task, finalAttempt) {
                return function(seriesCallback) {
                    task(function(err, result){
                        seriesCallback(!err || finalAttempt, {err: err, result: result});
                    }, wrappedResults);
                };
            };
            while (times) {
                attempts.push(retryAttempt(task, !(times-=1)));
            }
            async.series(attempts, function(done, data){
                data = data[data.length - 1];
                (wrappedCallback || callback)(data.err, data.result);
            });
        }
        // If a callback is passed, run this as a controll flow
        return callback ? wrappedTask() : wrappedTask
    };

    async.waterfall = function (tasks, callback) {
        callback = callback || function () {};
        if (!_isArray(tasks)) {
          var err = new Error('First argument to waterfall must be an array of functions');
          return callback(err);
        }
        if (!tasks.length) {
            return callback();
        }
        var wrapIterator = function (iterator) {
            return function (err) {
                if (err) {
                    callback.apply(null, arguments);
                    callback = function () {};
                }
                else {
                    var args = Array.prototype.slice.call(arguments, 1);
                    var next = iterator.next();
                    if (next) {
                        args.push(wrapIterator(next));
                    }
                    else {
                        args.push(callback);
                    }
                    async.setImmediate(function () {
                        iterator.apply(null, args);
                    });
                }
            };
        };
        wrapIterator(async.iterator(tasks))();
    };

    var _parallel = function(eachfn, tasks, callback) {
        callback = callback || function () {};
        if (_isArray(tasks)) {
            eachfn.map(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            eachfn.each(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.parallel = function (tasks, callback) {
        _parallel({ map: async.map, each: async.each }, tasks, callback);
    };

    async.parallelLimit = function(tasks, limit, callback) {
        _parallel({ map: _mapLimit(limit), each: _eachLimit(limit) }, tasks, callback);
    };

    async.series = function (tasks, callback) {
        callback = callback || function () {};
        if (_isArray(tasks)) {
            async.mapSeries(tasks, function (fn, callback) {
                if (fn) {
                    fn(function (err) {
                        var args = Array.prototype.slice.call(arguments, 1);
                        if (args.length <= 1) {
                            args = args[0];
                        }
                        callback.call(null, err, args);
                    });
                }
            }, callback);
        }
        else {
            var results = {};
            async.eachSeries(_keys(tasks), function (k, callback) {
                tasks[k](function (err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    results[k] = args;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };

    async.iterator = function (tasks) {
        var makeCallback = function (index) {
            var fn = function () {
                if (tasks.length) {
                    tasks[index].apply(null, arguments);
                }
                return fn.next();
            };
            fn.next = function () {
                return (index < tasks.length - 1) ? makeCallback(index + 1): null;
            };
            return fn;
        };
        return makeCallback(0);
    };

    async.apply = function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        return function () {
            return fn.apply(
                null, args.concat(Array.prototype.slice.call(arguments))
            );
        };
    };

    var _concat = function (eachfn, arr, fn, callback) {
        var r = [];
        eachfn(arr, function (x, cb) {
            fn(x, function (err, y) {
                r = r.concat(y || []);
                cb(err);
            });
        }, function (err) {
            callback(err, r);
        });
    };
    async.concat = doParallel(_concat);
    async.concatSeries = doSeries(_concat);

    async.whilst = function (test, iterator, callback) {
        if (test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.whilst(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.doWhilst = function (iterator, test, callback) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            var args = Array.prototype.slice.call(arguments, 1);
            if (test.apply(null, args)) {
                async.doWhilst(iterator, test, callback);
            }
            else {
                callback();
            }
        });
    };

    async.until = function (test, iterator, callback) {
        if (!test()) {
            iterator(function (err) {
                if (err) {
                    return callback(err);
                }
                async.until(test, iterator, callback);
            });
        }
        else {
            callback();
        }
    };

    async.doUntil = function (iterator, test, callback) {
        iterator(function (err) {
            if (err) {
                return callback(err);
            }
            var args = Array.prototype.slice.call(arguments, 1);
            if (!test.apply(null, args)) {
                async.doUntil(iterator, test, callback);
            }
            else {
                callback();
            }
        });
    };

    async.queue = function (worker, concurrency) {
        if (concurrency === undefined) {
            concurrency = 1;
        }
        function _insert(q, data, pos, callback) {
          if (!q.started){
            q.started = true;
          }
          if (!_isArray(data)) {
              data = [data];
          }
          if(data.length == 0) {
             // call drain immediately if there are no tasks
             return async.setImmediate(function() {
                 if (q.drain) {
                     q.drain();
                 }
             });
          }
          _each(data, function(task) {
              var item = {
                  data: task,
                  callback: typeof callback === 'function' ? callback : null
              };

              if (pos) {
                q.tasks.unshift(item);
              } else {
                q.tasks.push(item);
              }

              if (q.saturated && q.tasks.length === q.concurrency) {
                  q.saturated();
              }
              async.setImmediate(q.process);
          });
        }

        var workers = 0;
        var q = {
            tasks: [],
            concurrency: concurrency,
            saturated: null,
            empty: null,
            drain: null,
            started: false,
            paused: false,
            push: function (data, callback) {
              _insert(q, data, false, callback);
            },
            kill: function () {
              q.drain = null;
              q.tasks = [];
            },
            unshift: function (data, callback) {
              _insert(q, data, true, callback);
            },
            process: function () {
                if (!q.paused && workers < q.concurrency && q.tasks.length) {
                    var task = q.tasks.shift();
                    if (q.empty && q.tasks.length === 0) {
                        q.empty();
                    }
                    workers += 1;
                    var next = function () {
                        workers -= 1;
                        if (task.callback) {
                            task.callback.apply(task, arguments);
                        }
                        if (q.drain && q.tasks.length + workers === 0) {
                            q.drain();
                        }
                        q.process();
                    };
                    var cb = only_once(next);
                    worker(task.data, cb);
                }
            },
            length: function () {
                return q.tasks.length;
            },
            running: function () {
                return workers;
            },
            idle: function() {
                return q.tasks.length + workers === 0;
            },
            pause: function () {
                if (q.paused === true) { return; }
                q.paused = true;
                q.process();
            },
            resume: function () {
                if (q.paused === false) { return; }
                q.paused = false;
                q.process();
            }
        };
        return q;
    };
    
    async.priorityQueue = function (worker, concurrency) {
        
        function _compareTasks(a, b){
          return a.priority - b.priority;
        };
        
        function _binarySearch(sequence, item, compare) {
          var beg = -1,
              end = sequence.length - 1;
          while (beg < end) {
            var mid = beg + ((end - beg + 1) >>> 1);
            if (compare(item, sequence[mid]) >= 0) {
              beg = mid;
            } else {
              end = mid - 1;
            }
          }
          return beg;
        }
        
        function _insert(q, data, priority, callback) {
          if (!q.started){
            q.started = true;
          }
          if (!_isArray(data)) {
              data = [data];
          }
          if(data.length == 0) {
             // call drain immediately if there are no tasks
             return async.setImmediate(function() {
                 if (q.drain) {
                     q.drain();
                 }
             });
          }
          _each(data, function(task) {
              var item = {
                  data: task,
                  priority: priority,
                  callback: typeof callback === 'function' ? callback : null
              };
              
              q.tasks.splice(_binarySearch(q.tasks, item, _compareTasks) + 1, 0, item);

              if (q.saturated && q.tasks.length === q.concurrency) {
                  q.saturated();
              }
              async.setImmediate(q.process);
          });
        }
        
        // Start with a normal queue
        var q = async.queue(worker, concurrency);
        
        // Override push to accept second parameter representing priority
        q.push = function (data, priority, callback) {
          _insert(q, data, priority, callback);
        };
        
        // Remove unshift function
        delete q.unshift;

        return q;
    };

    async.cargo = function (worker, payload) {
        var working     = false,
            tasks       = [];

        var cargo = {
            tasks: tasks,
            payload: payload,
            saturated: null,
            empty: null,
            drain: null,
            drained: true,
            push: function (data, callback) {
                if (!_isArray(data)) {
                    data = [data];
                }
                _each(data, function(task) {
                    tasks.push({
                        data: task,
                        callback: typeof callback === 'function' ? callback : null
                    });
                    cargo.drained = false;
                    if (cargo.saturated && tasks.length === payload) {
                        cargo.saturated();
                    }
                });
                async.setImmediate(cargo.process);
            },
            process: function process() {
                if (working) return;
                if (tasks.length === 0) {
                    if(cargo.drain && !cargo.drained) cargo.drain();
                    cargo.drained = true;
                    return;
                }

                var ts = typeof payload === 'number'
                            ? tasks.splice(0, payload)
                            : tasks.splice(0, tasks.length);

                var ds = _map(ts, function (task) {
                    return task.data;
                });

                if(cargo.empty) cargo.empty();
                working = true;
                worker(ds, function () {
                    working = false;

                    var args = arguments;
                    _each(ts, function (data) {
                        if (data.callback) {
                            data.callback.apply(null, args);
                        }
                    });

                    process();
                });
            },
            length: function () {
                return tasks.length;
            },
            running: function () {
                return working;
            }
        };
        return cargo;
    };

    var _console_fn = function (name) {
        return function (fn) {
            var args = Array.prototype.slice.call(arguments, 1);
            fn.apply(null, args.concat([function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (typeof console !== 'undefined') {
                    if (err) {
                        if (console.error) {
                            console.error(err);
                        }
                    }
                    else if (console[name]) {
                        _each(args, function (x) {
                            console[name](x);
                        });
                    }
                }
            }]));
        };
    };
    async.log = _console_fn('log');
    async.dir = _console_fn('dir');
    /*async.info = _console_fn('info');
    async.warn = _console_fn('warn');
    async.error = _console_fn('error');*/

    async.memoize = function (fn, hasher) {
        var memo = {};
        var queues = {};
        hasher = hasher || function (x) {
            return x;
        };
        var memoized = function () {
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            var key = hasher.apply(null, args);
            if (key in memo) {
                async.nextTick(function () {
                    callback.apply(null, memo[key]);
                });
            }
            else if (key in queues) {
                queues[key].push(callback);
            }
            else {
                queues[key] = [callback];
                fn.apply(null, args.concat([function () {
                    memo[key] = arguments;
                    var q = queues[key];
                    delete queues[key];
                    for (var i = 0, l = q.length; i < l; i++) {
                      q[i].apply(null, arguments);
                    }
                }]));
            }
        };
        memoized.memo = memo;
        memoized.unmemoized = fn;
        return memoized;
    };

    async.unmemoize = function (fn) {
      return function () {
        return (fn.unmemoized || fn).apply(null, arguments);
      };
    };

    async.times = function (count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
            counter.push(i);
        }
        return async.map(counter, iterator, callback);
    };

    async.timesSeries = function (count, iterator, callback) {
        var counter = [];
        for (var i = 0; i < count; i++) {
            counter.push(i);
        }
        return async.mapSeries(counter, iterator, callback);
    };

    async.seq = function (/* functions... */) {
        var fns = arguments;
        return function () {
            var that = this;
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            async.reduce(fns, args, function (newargs, fn, cb) {
                fn.apply(that, newargs.concat([function () {
                    var err = arguments[0];
                    var nextargs = Array.prototype.slice.call(arguments, 1);
                    cb(err, nextargs);
                }]))
            },
            function (err, results) {
                callback.apply(that, [err].concat(results));
            });
        };
    };

    async.compose = function (/* functions... */) {
      return async.seq.apply(null, Array.prototype.reverse.call(arguments));
    };

    var _applyEach = function (eachfn, fns /*args...*/) {
        var go = function () {
            var that = this;
            var args = Array.prototype.slice.call(arguments);
            var callback = args.pop();
            return eachfn(fns, function (fn, cb) {
                fn.apply(that, args.concat([cb]));
            },
            callback);
        };
        if (arguments.length > 2) {
            var args = Array.prototype.slice.call(arguments, 2);
            return go.apply(this, args);
        }
        else {
            return go;
        }
    };
    async.applyEach = doParallel(_applyEach);
    async.applyEachSeries = doSeries(_applyEach);

    async.forever = function (fn, callback) {
        function next(err) {
            if (err) {
                if (callback) {
                    return callback(err);
                }
                throw err;
            }
            fn(next);
        }
        next();
    };

    // Node.js
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = async;
    }
    // AMD / RequireJS
    else if (typeof define !== 'undefined' && define.amd) {
        define([], function () {
            return async;
        });
    }
    // included directly via <script> tag
    else {
        root.async = async;
    }

}());

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
  var message = error.message || error.description || '<unknown error>';
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

  var prettyStack = message + '\n' + pretty(parsedStack, prettyOptions);

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
WCT.numConcurrentSuites = 8;

// Helpers

// Evaluated in mocha/run.js.
WCT._suitesToLoad = [];
WCT._dependencies = [];
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
  }

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
 * @param {string} param The param to return a value for.
 * @return {?string} The first value for `param`, if found.
 */
WCT.util.getParam = function getParam(param) {
  var query = window.location.search.substring(1);
  var vars = query.split('&');
  for (var i=0;i<vars.length;i++) {
    var pair = vars[i].split('=');
    if (decodeURIComponent(pair[0]) === param) {
      return decodeURIComponent(pair[1]);
    }
  }
  return null;
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
}

/** @return {string} `location` relative to the current window. */
WCT.util.relativeLocation = function relativeLocation(location) {
  var path = location.pathname;
  if (path.indexOf(window.location.pathname) === 0) {
    path = path.substr(window.location.pathname.length);
  }
  return path;
}

/**
 *
 */
WCT.util.debug = function debug(var_args) {
  if (!WCT.debug) return;
  console.debug.apply(console, arguments);
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

  runner.on('end', function() {
    this.emitEvent('browser-end');
  }.bind(this));
}

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
};

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

/**
 * A Mocha suite (or suites) run within a child iframe, but reported as if they
 * are part of the current context.
 */
function SubSuite(url, parentScope) {
  this.url         = url + '?' + Math.random();
  this.parentScope = parentScope;

  this.state = 'initializing';
}
WCT.SubSuite = SubSuite;

// SubSuites get a pretty generous load timeout by default.
SubSuite.loadTimeout = 5000;

// We can't maintain properties on iframe elements in Firefox/Safari/???, so we
// track subSuites by URL.
SubSuite._byUrl = {};

/**
 * @return {SubSuite} The `SubSuite` that was registered for this window.
 */
SubSuite.current = function() {
  return SubSuite.get(window);
}

/**
 * @param {!Window} target A window to find the SubSuite of.
 * @return {SubSuite} The `SubSuite` that was registered for `target`.
 */
SubSuite.get = function(target) {
  var subSuite = SubSuite._byUrl[target.location.href];
  if (subSuite || window.parent === window) return subSuite;
  // Otherwise, traverse.
  return window.parent.WCT.SubSuite.get(target);
}

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
    document.body.appendChild(container)
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

var assert = chai.assert;
var expect = chai.expect;

// We prefer to get as much stack information as possible.
chai.config.includeStack = true;

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
  parentRunner.emitOutOfBandTest(path, event.data.error, true);

  subSuite.done();
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

/**
 * It is often useful to trigger a Platform.flush, and perform work on the next
 * run loop tick.
 *
 * @param {function} callback
 */
function asyncPlatformFlush(callback) {
  if (window.Platform && window.Platform.flush) Platform.flush();
  async.nextTick(callback);
}

/**
 *
 */
function waitFor(fn, next, intervalOrMutationEl, timeout, timeoutTime) {
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
  return function childReporter(runner) {
    runner.name = name;
    self.bindChildRunner(runner);
  };
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
 * @param {?boolean} opt_estimated If this test was included in the original
 *     estimate of `numSuites`.
 */
MultiRunner.prototype.emitOutOfBandTest = function emitOutOfBandTest(title, opt_error, opt_estimated) {
  var root = new Mocha.Suite();
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

  if (eventName === 'start') {
    this.onRunnerStart(runner);
  } else if (eventName === 'end') {
    this.onRunnerEnd(runner);
  } else {
    this.cleanEvent(eventName, extraArgs);
    this.emit.apply(this, [eventName].concat(extraArgs));
  }
};

/**
 * Cleans or modifies an event if needed.
 *
 * @param {string} eventName
 * @param {!Array.<*>} extraArgs
 */
MultiRunner.prototype.cleanEvent = function cleanEvent(eventName, extraArgs) {
  if (eventName === 'fail') {
    extraArgs[1] = Stacky.normalize(extraArgs[1], STACKY_CONFIG);
  }
  if (extraArgs[0] && extraArgs[0].err) {
    extraArgs[0].err = Stacky.normalize(extraArgs[0].err, STACKY_CONFIG);
  }

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

// Give any scripts on the page a chance to twiddle the environment.
document.addEventListener('DOMContentLoaded', function() {
  WCT.util.debug('run stage: DOMContentLoaded');
  var subSuite = WCT.SubSuite.current();
  if (subSuite) {
    WCT.util.debug('run stage: subsuite');
    // Give the subsuite time to complete its load (see `SubSuite.load`).
    async.nextTick(runSubSuite.bind(null, subSuite));
    return;
  }

  // Before anything else, we need to ensure our communication channel with the
  // CLI runner is established (if we're running in that context). Less
  // buffering to deal with.
  WCT.CLISocket.init(function(error, socket) {
    WCT.util.debug('run stage: WCT.CLISocket.init done', error);
    if (error) throw error;

    loadDependencies(function(error) {
      WCT.util.debug('run stage: loadDependencies done', error);
      if (error) throw error;

      runMultiSuite(determineReporters(socket));
    });
  });
});

/**
 * Loads any dependencies of the _current_ suite (e.g. `.js` sources).
 *
 * @param {function} done A node style callback.
 */
function loadDependencies(done) {
  WCT.util.debug('loadDependencies:', WCT._dependencies);
  var loaders = WCT._dependencies.map(function(file) {
    // We only support `.js` dependencies for now.
    return WCT.util.loadScript.bind(WCT.util, file);
  });

  async.parallel(loaders, done);
}

/**
 * @param {!WCT.SubSuite} subSuite The `SubSuite` for this frame, that `mocha`
 *     should be run for.
 */
function runSubSuite(subSuite) {
  WCT.util.debug('runSubSuite', window.location.pathname);
  // Not very pretty.
  var parentWCT = subSuite.parentScope.WCT;
  var suiteName = parentWCT.util.relativeLocation(window.location);
  var reporter  = parentWCT._multiRunner.childReporter(suiteName);
  runMocha(reporter, subSuite.done.bind(subSuite));
}

/**
 * @param {!Array.<!Mocha.reporters.Base>} reporters The reporters that should
 *     consume the output of this `MultiRunner`.
 */
function runMultiSuite(reporters) {
  WCT.util.debug('runMultiSuite', window.location.pathname);
  var rootName = WCT.util.relativeLocation(window.location);
  var runner   = new WCT.MultiRunner(WCT._suitesToLoad.length + 1, reporters);
  WCT._multiRunner = runner;

  var suiteRunners = [
    // Run the local tests (if any) first, not stopping on error;
    runMocha.bind(null, runner.childReporter(rootName)),
  ];

  // As well as any sub suites. Again, don't stop on error.
  WCT._suitesToLoad.forEach(function(file) {
    suiteRunners.push(function(next) {
      var subSuite = new WCT.SubSuite(file, window);
      subSuite.run(function(error) {
        if (error) runner.emitOutOfBandTest(file, error);
        next();
      });
    });
  });

  async.parallelLimit(suiteRunners, WCT.numConcurrentSuites, function(error) {
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
  var runner = mocha.run(function(error) {
    done();  // We ignore the Mocha failure count.
  });

  // Mocha's default `onerror` handling strips the stack (to support really old
  // browsers). We upgrade this to get better stacks for async errors.
  //
  // TODO(nevir): Can we expand support to other browsers?
  if (navigator.userAgent.match(/chrome/i)) {
    window.onerror = null;
    window.addEventListener('error', function(event) {
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

  if (WCT._suitesToLoad.length > 0) {
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
    }
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
  mocha.setup({ui: ui, timeout: 5000});  // Note that the reporter is configured in run.js.
  WCT.mochaIsSetup = true;
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

WCT.reporters.Console = Console;

// We capture console events when running tests; so make sure we have a
// reference to the original one.
var console = window.console;

var FONT = ';font: normal 13px "Roboto", "Helvetica Neue", "Helvetica", sans-serif;'
var STYLES = {
  plain:   FONT,
  suite:   'color: #5c6bc0' + FONT,
  test:    FONT,
  passing: 'color: #259b24' + FONT,
  pending: 'color: #e65100' + FONT,
  failing: 'color: #c41411' + FONT,
  stack:   'color: #c41411',
  results: FONT + 'font-size: 16px',
}

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
};
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
};
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
};

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

(function() {
var style = document.createElement('style');
style.textContent = '/* Copyright (c) 2014 The Polymer Project Authors. All rights reserved.\n * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt\n * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt\n * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt\n * Code distributed by Google as part of the polymer project is also\n * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt\n */\nhtml, body {\n  height: 100%;\n  width:  100%;\n}\n\n#mocha, #subsuites {\n  height: 100%;\n  position: absolute;\n  top: 0;\n  width: 50%;\n}\n\n#mocha {\n  box-sizing: border-box;\n  margin: 0 !important;\n  overflow-y: auto;\n  padding: 60px 50px;\n  right: 0;\n}\n\n#subsuites {\n  -ms-flex-direction: column;\n  -webkit-flex-direction: column;\n  display: -ms-flexbox;\n  display: -webkit-flex;\n  display: flex;\n  flex-direction: column;\n  left: 0;\n}\n\n#subsuites .subsuite {\n  border: 0;\n  width: 100%;\n  height: 100%;\n}\n\n/* TODO(nevir): Fix grep support */\n#mocha .replay {\n  display: none !important;\n}\n';
document.head.appendChild(style);
})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1vY2hhLmpzIiwibW9jaGEuY3NzIiwiY2hhaS5qcyIsImFzeW5jLmpzIiwicGFyc2luZy5qcyIsImZvcm1hdHRpbmcuanMiLCJub3JtYWxpemF0aW9uLmpzIiwiaW5kZXguanMiLCJ1dGlsLmpzIiwiY2xpc29ja2V0LmpzIiwic3Vic3VpdGUuanMiLCJlbnZpcm9ubWVudC9jaGFpLmpzIiwiZW52aXJvbm1lbnQvY29tcGF0YWJpbGl0eS5qcyIsImVudmlyb25tZW50L3BsYXRmb3JtLmpzIiwibW9jaGEvbXVsdGlydW5uZXIuanMiLCJtb2NoYS9ydW4uanMiLCJtb2NoYS9zZXR1cC5qcyIsInJlcG9ydGVycy9jb25zb2xlLmpzIiwicmVwb3J0ZXJzL2h0bWwuanMiLCJyZXBvcnRlcnMvdGl0bGUuanMiLCJyZXBvcnRlcnMvaHRtbC5jc3MiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUM5MUxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUM3cUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNubUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzVGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDakpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMzR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2xJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbkhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMvTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNsS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDOUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImJyb3dzZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyI7KGZ1bmN0aW9uKCl7XG5cbi8vIENvbW1vbkpTIHJlcXVpcmUoKVxuXG5mdW5jdGlvbiByZXF1aXJlKHApe1xuICAgIHZhciBwYXRoID0gcmVxdWlyZS5yZXNvbHZlKHApXG4gICAgICAsIG1vZCA9IHJlcXVpcmUubW9kdWxlc1twYXRoXTtcbiAgICBpZiAoIW1vZCkgdGhyb3cgbmV3IEVycm9yKCdmYWlsZWQgdG8gcmVxdWlyZSBcIicgKyBwICsgJ1wiJyk7XG4gICAgaWYgKCFtb2QuZXhwb3J0cykge1xuICAgICAgbW9kLmV4cG9ydHMgPSB7fTtcbiAgICAgIG1vZC5jYWxsKG1vZC5leHBvcnRzLCBtb2QsIG1vZC5leHBvcnRzLCByZXF1aXJlLnJlbGF0aXZlKHBhdGgpKTtcbiAgICB9XG4gICAgcmV0dXJuIG1vZC5leHBvcnRzO1xuICB9XG5cbnJlcXVpcmUubW9kdWxlcyA9IHt9O1xuXG5yZXF1aXJlLnJlc29sdmUgPSBmdW5jdGlvbiAocGF0aCl7XG4gICAgdmFyIG9yaWcgPSBwYXRoXG4gICAgICAsIHJlZyA9IHBhdGggKyAnLmpzJ1xuICAgICAgLCBpbmRleCA9IHBhdGggKyAnL2luZGV4LmpzJztcbiAgICByZXR1cm4gcmVxdWlyZS5tb2R1bGVzW3JlZ10gJiYgcmVnXG4gICAgICB8fCByZXF1aXJlLm1vZHVsZXNbaW5kZXhdICYmIGluZGV4XG4gICAgICB8fCBvcmlnO1xuICB9O1xuXG5yZXF1aXJlLnJlZ2lzdGVyID0gZnVuY3Rpb24gKHBhdGgsIGZuKXtcbiAgICByZXF1aXJlLm1vZHVsZXNbcGF0aF0gPSBmbjtcbiAgfTtcblxucmVxdWlyZS5yZWxhdGl2ZSA9IGZ1bmN0aW9uIChwYXJlbnQpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ocCl7XG4gICAgICBpZiAoJy4nICE9IHAuY2hhckF0KDApKSByZXR1cm4gcmVxdWlyZShwKTtcblxuICAgICAgdmFyIHBhdGggPSBwYXJlbnQuc3BsaXQoJy8nKVxuICAgICAgICAsIHNlZ3MgPSBwLnNwbGl0KCcvJyk7XG4gICAgICBwYXRoLnBvcCgpO1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlZ3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHNlZyA9IHNlZ3NbaV07XG4gICAgICAgIGlmICgnLi4nID09IHNlZykgcGF0aC5wb3AoKTtcbiAgICAgICAgZWxzZSBpZiAoJy4nICE9IHNlZykgcGF0aC5wdXNoKHNlZyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXF1aXJlKHBhdGguam9pbignLycpKTtcbiAgICB9O1xuICB9O1xuXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJicm93c2VyL2RlYnVnLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odHlwZSl7XG4gIHJldHVybiBmdW5jdGlvbigpe1xuICB9XG59O1xuXG59KTsgLy8gbW9kdWxlOiBicm93c2VyL2RlYnVnLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJicm93c2VyL2RpZmYuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qIFNlZSBMSUNFTlNFIGZpbGUgZm9yIHRlcm1zIG9mIHVzZSAqL1xuXG4vKlxuICogVGV4dCBkaWZmIGltcGxlbWVudGF0aW9uLlxuICpcbiAqIFRoaXMgbGlicmFyeSBzdXBwb3J0cyB0aGUgZm9sbG93aW5nIEFQSVM6XG4gKiBKc0RpZmYuZGlmZkNoYXJzOiBDaGFyYWN0ZXIgYnkgY2hhcmFjdGVyIGRpZmZcbiAqIEpzRGlmZi5kaWZmV29yZHM6IFdvcmQgKGFzIGRlZmluZWQgYnkgXFxiIHJlZ2V4KSBkaWZmIHdoaWNoIGlnbm9yZXMgd2hpdGVzcGFjZVxuICogSnNEaWZmLmRpZmZMaW5lczogTGluZSBiYXNlZCBkaWZmXG4gKlxuICogSnNEaWZmLmRpZmZDc3M6IERpZmYgdGFyZ2V0ZWQgYXQgQ1NTIGNvbnRlbnRcbiAqXG4gKiBUaGVzZSBtZXRob2RzIGFyZSBiYXNlZCBvbiB0aGUgaW1wbGVtZW50YXRpb24gcHJvcG9zZWQgaW5cbiAqIFwiQW4gTyhORCkgRGlmZmVyZW5jZSBBbGdvcml0aG0gYW5kIGl0cyBWYXJpYXRpb25zXCIgKE15ZXJzLCAxOTg2KS5cbiAqIGh0dHA6Ly9jaXRlc2VlcnguaXN0LnBzdS5lZHUvdmlld2RvYy9zdW1tYXJ5P2RvaT0xMC4xLjEuNC42OTI3XG4gKi9cbnZhciBKc0RpZmYgPSAoZnVuY3Rpb24oKSB7XG4gIC8qanNoaW50IG1heHBhcmFtczogNSovXG4gIGZ1bmN0aW9uIGNsb25lUGF0aChwYXRoKSB7XG4gICAgcmV0dXJuIHsgbmV3UG9zOiBwYXRoLm5ld1BvcywgY29tcG9uZW50czogcGF0aC5jb21wb25lbnRzLnNsaWNlKDApIH07XG4gIH1cbiAgZnVuY3Rpb24gcmVtb3ZlRW1wdHkoYXJyYXkpIHtcbiAgICB2YXIgcmV0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGFycmF5W2ldKSB7XG4gICAgICAgIHJldC5wdXNoKGFycmF5W2ldKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuICBmdW5jdGlvbiBlc2NhcGVIVE1MKHMpIHtcbiAgICB2YXIgbiA9IHM7XG4gICAgbiA9IG4ucmVwbGFjZSgvJi9nLCAnJmFtcDsnKTtcbiAgICBuID0gbi5yZXBsYWNlKC88L2csICcmbHQ7Jyk7XG4gICAgbiA9IG4ucmVwbGFjZSgvPi9nLCAnJmd0OycpO1xuICAgIG4gPSBuLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKTtcblxuICAgIHJldHVybiBuO1xuICB9XG5cbiAgdmFyIERpZmYgPSBmdW5jdGlvbihpZ25vcmVXaGl0ZXNwYWNlKSB7XG4gICAgdGhpcy5pZ25vcmVXaGl0ZXNwYWNlID0gaWdub3JlV2hpdGVzcGFjZTtcbiAgfTtcbiAgRGlmZi5wcm90b3R5cGUgPSB7XG4gICAgICBkaWZmOiBmdW5jdGlvbihvbGRTdHJpbmcsIG5ld1N0cmluZykge1xuICAgICAgICAvLyBIYW5kbGUgdGhlIGlkZW50aXR5IGNhc2UgKHRoaXMgaXMgZHVlIHRvIHVucm9sbGluZyBlZGl0TGVuZ3RoID09IDBcbiAgICAgICAgaWYgKG5ld1N0cmluZyA9PT0gb2xkU3RyaW5nKSB7XG4gICAgICAgICAgcmV0dXJuIFt7IHZhbHVlOiBuZXdTdHJpbmcgfV07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFuZXdTdHJpbmcpIHtcbiAgICAgICAgICByZXR1cm4gW3sgdmFsdWU6IG9sZFN0cmluZywgcmVtb3ZlZDogdHJ1ZSB9XTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIW9sZFN0cmluZykge1xuICAgICAgICAgIHJldHVybiBbeyB2YWx1ZTogbmV3U3RyaW5nLCBhZGRlZDogdHJ1ZSB9XTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5ld1N0cmluZyA9IHRoaXMudG9rZW5pemUobmV3U3RyaW5nKTtcbiAgICAgICAgb2xkU3RyaW5nID0gdGhpcy50b2tlbml6ZShvbGRTdHJpbmcpO1xuXG4gICAgICAgIHZhciBuZXdMZW4gPSBuZXdTdHJpbmcubGVuZ3RoLCBvbGRMZW4gPSBvbGRTdHJpbmcubGVuZ3RoO1xuICAgICAgICB2YXIgbWF4RWRpdExlbmd0aCA9IG5ld0xlbiArIG9sZExlbjtcbiAgICAgICAgdmFyIGJlc3RQYXRoID0gW3sgbmV3UG9zOiAtMSwgY29tcG9uZW50czogW10gfV07XG5cbiAgICAgICAgLy8gU2VlZCBlZGl0TGVuZ3RoID0gMFxuICAgICAgICB2YXIgb2xkUG9zID0gdGhpcy5leHRyYWN0Q29tbW9uKGJlc3RQYXRoWzBdLCBuZXdTdHJpbmcsIG9sZFN0cmluZywgMCk7XG4gICAgICAgIGlmIChiZXN0UGF0aFswXS5uZXdQb3MrMSA+PSBuZXdMZW4gJiYgb2xkUG9zKzEgPj0gb2xkTGVuKSB7XG4gICAgICAgICAgcmV0dXJuIGJlc3RQYXRoWzBdLmNvbXBvbmVudHM7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKHZhciBlZGl0TGVuZ3RoID0gMTsgZWRpdExlbmd0aCA8PSBtYXhFZGl0TGVuZ3RoOyBlZGl0TGVuZ3RoKyspIHtcbiAgICAgICAgICBmb3IgKHZhciBkaWFnb25hbFBhdGggPSAtMSplZGl0TGVuZ3RoOyBkaWFnb25hbFBhdGggPD0gZWRpdExlbmd0aDsgZGlhZ29uYWxQYXRoKz0yKSB7XG4gICAgICAgICAgICB2YXIgYmFzZVBhdGg7XG4gICAgICAgICAgICB2YXIgYWRkUGF0aCA9IGJlc3RQYXRoW2RpYWdvbmFsUGF0aC0xXSxcbiAgICAgICAgICAgICAgICByZW1vdmVQYXRoID0gYmVzdFBhdGhbZGlhZ29uYWxQYXRoKzFdO1xuICAgICAgICAgICAgb2xkUG9zID0gKHJlbW92ZVBhdGggPyByZW1vdmVQYXRoLm5ld1BvcyA6IDApIC0gZGlhZ29uYWxQYXRoO1xuICAgICAgICAgICAgaWYgKGFkZFBhdGgpIHtcbiAgICAgICAgICAgICAgLy8gTm8gb25lIGVsc2UgaXMgZ29pbmcgdG8gYXR0ZW1wdCB0byB1c2UgdGhpcyB2YWx1ZSwgY2xlYXIgaXRcbiAgICAgICAgICAgICAgYmVzdFBhdGhbZGlhZ29uYWxQYXRoLTFdID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgY2FuQWRkID0gYWRkUGF0aCAmJiBhZGRQYXRoLm5ld1BvcysxIDwgbmV3TGVuO1xuICAgICAgICAgICAgdmFyIGNhblJlbW92ZSA9IHJlbW92ZVBhdGggJiYgMCA8PSBvbGRQb3MgJiYgb2xkUG9zIDwgb2xkTGVuO1xuICAgICAgICAgICAgaWYgKCFjYW5BZGQgJiYgIWNhblJlbW92ZSkge1xuICAgICAgICAgICAgICBiZXN0UGF0aFtkaWFnb25hbFBhdGhdID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gU2VsZWN0IHRoZSBkaWFnb25hbCB0aGF0IHdlIHdhbnQgdG8gYnJhbmNoIGZyb20uIFdlIHNlbGVjdCB0aGUgcHJpb3JcbiAgICAgICAgICAgIC8vIHBhdGggd2hvc2UgcG9zaXRpb24gaW4gdGhlIG5ldyBzdHJpbmcgaXMgdGhlIGZhcnRoZXN0IGZyb20gdGhlIG9yaWdpblxuICAgICAgICAgICAgLy8gYW5kIGRvZXMgbm90IHBhc3MgdGhlIGJvdW5kcyBvZiB0aGUgZGlmZiBncmFwaFxuICAgICAgICAgICAgaWYgKCFjYW5BZGQgfHwgKGNhblJlbW92ZSAmJiBhZGRQYXRoLm5ld1BvcyA8IHJlbW92ZVBhdGgubmV3UG9zKSkge1xuICAgICAgICAgICAgICBiYXNlUGF0aCA9IGNsb25lUGF0aChyZW1vdmVQYXRoKTtcbiAgICAgICAgICAgICAgdGhpcy5wdXNoQ29tcG9uZW50KGJhc2VQYXRoLmNvbXBvbmVudHMsIG9sZFN0cmluZ1tvbGRQb3NdLCB1bmRlZmluZWQsIHRydWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgYmFzZVBhdGggPSBjbG9uZVBhdGgoYWRkUGF0aCk7XG4gICAgICAgICAgICAgIGJhc2VQYXRoLm5ld1BvcysrO1xuICAgICAgICAgICAgICB0aGlzLnB1c2hDb21wb25lbnQoYmFzZVBhdGguY29tcG9uZW50cywgbmV3U3RyaW5nW2Jhc2VQYXRoLm5ld1Bvc10sIHRydWUsIHVuZGVmaW5lZCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBvbGRQb3MgPSB0aGlzLmV4dHJhY3RDb21tb24oYmFzZVBhdGgsIG5ld1N0cmluZywgb2xkU3RyaW5nLCBkaWFnb25hbFBhdGgpO1xuXG4gICAgICAgICAgICBpZiAoYmFzZVBhdGgubmV3UG9zKzEgPj0gbmV3TGVuICYmIG9sZFBvcysxID49IG9sZExlbikge1xuICAgICAgICAgICAgICByZXR1cm4gYmFzZVBhdGguY29tcG9uZW50cztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGJlc3RQYXRoW2RpYWdvbmFsUGF0aF0gPSBiYXNlUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIHB1c2hDb21wb25lbnQ6IGZ1bmN0aW9uKGNvbXBvbmVudHMsIHZhbHVlLCBhZGRlZCwgcmVtb3ZlZCkge1xuICAgICAgICB2YXIgbGFzdCA9IGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGgtMV07XG4gICAgICAgIGlmIChsYXN0ICYmIGxhc3QuYWRkZWQgPT09IGFkZGVkICYmIGxhc3QucmVtb3ZlZCA9PT0gcmVtb3ZlZCkge1xuICAgICAgICAgIC8vIFdlIG5lZWQgdG8gY2xvbmUgaGVyZSBhcyB0aGUgY29tcG9uZW50IGNsb25lIG9wZXJhdGlvbiBpcyBqdXN0XG4gICAgICAgICAgLy8gYXMgc2hhbGxvdyBhcnJheSBjbG9uZVxuICAgICAgICAgIGNvbXBvbmVudHNbY29tcG9uZW50cy5sZW5ndGgtMV0gPVxuICAgICAgICAgICAge3ZhbHVlOiB0aGlzLmpvaW4obGFzdC52YWx1ZSwgdmFsdWUpLCBhZGRlZDogYWRkZWQsIHJlbW92ZWQ6IHJlbW92ZWQgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb21wb25lbnRzLnB1c2goe3ZhbHVlOiB2YWx1ZSwgYWRkZWQ6IGFkZGVkLCByZW1vdmVkOiByZW1vdmVkIH0pO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgZXh0cmFjdENvbW1vbjogZnVuY3Rpb24oYmFzZVBhdGgsIG5ld1N0cmluZywgb2xkU3RyaW5nLCBkaWFnb25hbFBhdGgpIHtcbiAgICAgICAgdmFyIG5ld0xlbiA9IG5ld1N0cmluZy5sZW5ndGgsXG4gICAgICAgICAgICBvbGRMZW4gPSBvbGRTdHJpbmcubGVuZ3RoLFxuICAgICAgICAgICAgbmV3UG9zID0gYmFzZVBhdGgubmV3UG9zLFxuICAgICAgICAgICAgb2xkUG9zID0gbmV3UG9zIC0gZGlhZ29uYWxQYXRoO1xuICAgICAgICB3aGlsZSAobmV3UG9zKzEgPCBuZXdMZW4gJiYgb2xkUG9zKzEgPCBvbGRMZW4gJiYgdGhpcy5lcXVhbHMobmV3U3RyaW5nW25ld1BvcysxXSwgb2xkU3RyaW5nW29sZFBvcysxXSkpIHtcbiAgICAgICAgICBuZXdQb3MrKztcbiAgICAgICAgICBvbGRQb3MrKztcblxuICAgICAgICAgIHRoaXMucHVzaENvbXBvbmVudChiYXNlUGF0aC5jb21wb25lbnRzLCBuZXdTdHJpbmdbbmV3UG9zXSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgICAgIGJhc2VQYXRoLm5ld1BvcyA9IG5ld1BvcztcbiAgICAgICAgcmV0dXJuIG9sZFBvcztcbiAgICAgIH0sXG5cbiAgICAgIGVxdWFsczogZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgICAgdmFyIHJlV2hpdGVzcGFjZSA9IC9cXFMvO1xuICAgICAgICBpZiAodGhpcy5pZ25vcmVXaGl0ZXNwYWNlICYmICFyZVdoaXRlc3BhY2UudGVzdChsZWZ0KSAmJiAhcmVXaGl0ZXNwYWNlLnRlc3QocmlnaHQpKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGxlZnQgPT09IHJpZ2h0O1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgam9pbjogZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgICAgcmV0dXJuIGxlZnQgKyByaWdodDtcbiAgICAgIH0sXG4gICAgICB0b2tlbml6ZTogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfVxuICB9O1xuXG4gIHZhciBDaGFyRGlmZiA9IG5ldyBEaWZmKCk7XG5cbiAgdmFyIFdvcmREaWZmID0gbmV3IERpZmYodHJ1ZSk7XG4gIHZhciBXb3JkV2l0aFNwYWNlRGlmZiA9IG5ldyBEaWZmKCk7XG4gIFdvcmREaWZmLnRva2VuaXplID0gV29yZFdpdGhTcGFjZURpZmYudG9rZW5pemUgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiByZW1vdmVFbXB0eSh2YWx1ZS5zcGxpdCgvKFxccyt8XFxiKS8pKTtcbiAgfTtcblxuICB2YXIgQ3NzRGlmZiA9IG5ldyBEaWZmKHRydWUpO1xuICBDc3NEaWZmLnRva2VuaXplID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gcmVtb3ZlRW1wdHkodmFsdWUuc3BsaXQoLyhbe306OyxdfFxccyspLykpO1xuICB9O1xuXG4gIHZhciBMaW5lRGlmZiA9IG5ldyBEaWZmKCk7XG4gIExpbmVEaWZmLnRva2VuaXplID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWUuc3BsaXQoL14vbSk7XG4gIH07XG5cbiAgcmV0dXJuIHtcbiAgICBEaWZmOiBEaWZmLFxuXG4gICAgZGlmZkNoYXJzOiBmdW5jdGlvbihvbGRTdHIsIG5ld1N0cikgeyByZXR1cm4gQ2hhckRpZmYuZGlmZihvbGRTdHIsIG5ld1N0cik7IH0sXG4gICAgZGlmZldvcmRzOiBmdW5jdGlvbihvbGRTdHIsIG5ld1N0cikgeyByZXR1cm4gV29yZERpZmYuZGlmZihvbGRTdHIsIG5ld1N0cik7IH0sXG4gICAgZGlmZldvcmRzV2l0aFNwYWNlOiBmdW5jdGlvbihvbGRTdHIsIG5ld1N0cikgeyByZXR1cm4gV29yZFdpdGhTcGFjZURpZmYuZGlmZihvbGRTdHIsIG5ld1N0cik7IH0sXG4gICAgZGlmZkxpbmVzOiBmdW5jdGlvbihvbGRTdHIsIG5ld1N0cikgeyByZXR1cm4gTGluZURpZmYuZGlmZihvbGRTdHIsIG5ld1N0cik7IH0sXG5cbiAgICBkaWZmQ3NzOiBmdW5jdGlvbihvbGRTdHIsIG5ld1N0cikgeyByZXR1cm4gQ3NzRGlmZi5kaWZmKG9sZFN0ciwgbmV3U3RyKTsgfSxcblxuICAgIGNyZWF0ZVBhdGNoOiBmdW5jdGlvbihmaWxlTmFtZSwgb2xkU3RyLCBuZXdTdHIsIG9sZEhlYWRlciwgbmV3SGVhZGVyKSB7XG4gICAgICB2YXIgcmV0ID0gW107XG5cbiAgICAgIHJldC5wdXNoKCdJbmRleDogJyArIGZpbGVOYW1lKTtcbiAgICAgIHJldC5wdXNoKCc9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09Jyk7XG4gICAgICByZXQucHVzaCgnLS0tICcgKyBmaWxlTmFtZSArICh0eXBlb2Ygb2xkSGVhZGVyID09PSAndW5kZWZpbmVkJyA/ICcnIDogJ1xcdCcgKyBvbGRIZWFkZXIpKTtcbiAgICAgIHJldC5wdXNoKCcrKysgJyArIGZpbGVOYW1lICsgKHR5cGVvZiBuZXdIZWFkZXIgPT09ICd1bmRlZmluZWQnID8gJycgOiAnXFx0JyArIG5ld0hlYWRlcikpO1xuXG4gICAgICB2YXIgZGlmZiA9IExpbmVEaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpO1xuICAgICAgaWYgKCFkaWZmW2RpZmYubGVuZ3RoLTFdLnZhbHVlKSB7XG4gICAgICAgIGRpZmYucG9wKCk7ICAgLy8gUmVtb3ZlIHRyYWlsaW5nIG5ld2xpbmUgYWRkXG4gICAgICB9XG4gICAgICBkaWZmLnB1c2goe3ZhbHVlOiAnJywgbGluZXM6IFtdfSk7ICAgLy8gQXBwZW5kIGFuIGVtcHR5IHZhbHVlIHRvIG1ha2UgY2xlYW51cCBlYXNpZXJcblxuICAgICAgZnVuY3Rpb24gY29udGV4dExpbmVzKGxpbmVzKSB7XG4gICAgICAgIHJldHVybiBsaW5lcy5tYXAoZnVuY3Rpb24oZW50cnkpIHsgcmV0dXJuICcgJyArIGVudHJ5OyB9KTtcbiAgICAgIH1cbiAgICAgIGZ1bmN0aW9uIGVvZk5MKGN1clJhbmdlLCBpLCBjdXJyZW50KSB7XG4gICAgICAgIHZhciBsYXN0ID0gZGlmZltkaWZmLmxlbmd0aC0yXSxcbiAgICAgICAgICAgIGlzTGFzdCA9IGkgPT09IGRpZmYubGVuZ3RoLTIsXG4gICAgICAgICAgICBpc0xhc3RPZlR5cGUgPSBpID09PSBkaWZmLmxlbmd0aC0zICYmIChjdXJyZW50LmFkZGVkICE9PSBsYXN0LmFkZGVkIHx8IGN1cnJlbnQucmVtb3ZlZCAhPT0gbGFzdC5yZW1vdmVkKTtcblxuICAgICAgICAvLyBGaWd1cmUgb3V0IGlmIHRoaXMgaXMgdGhlIGxhc3QgbGluZSBmb3IgdGhlIGdpdmVuIGZpbGUgYW5kIG1pc3NpbmcgTkxcbiAgICAgICAgaWYgKCEvXFxuJC8udGVzdChjdXJyZW50LnZhbHVlKSAmJiAoaXNMYXN0IHx8IGlzTGFzdE9mVHlwZSkpIHtcbiAgICAgICAgICBjdXJSYW5nZS5wdXNoKCdcXFxcIE5vIG5ld2xpbmUgYXQgZW5kIG9mIGZpbGUnKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgb2xkUmFuZ2VTdGFydCA9IDAsIG5ld1JhbmdlU3RhcnQgPSAwLCBjdXJSYW5nZSA9IFtdLFxuICAgICAgICAgIG9sZExpbmUgPSAxLCBuZXdMaW5lID0gMTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGlmZi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY3VycmVudCA9IGRpZmZbaV0sXG4gICAgICAgICAgICBsaW5lcyA9IGN1cnJlbnQubGluZXMgfHwgY3VycmVudC52YWx1ZS5yZXBsYWNlKC9cXG4kLywgJycpLnNwbGl0KCdcXG4nKTtcbiAgICAgICAgY3VycmVudC5saW5lcyA9IGxpbmVzO1xuXG4gICAgICAgIGlmIChjdXJyZW50LmFkZGVkIHx8IGN1cnJlbnQucmVtb3ZlZCkge1xuICAgICAgICAgIGlmICghb2xkUmFuZ2VTdGFydCkge1xuICAgICAgICAgICAgdmFyIHByZXYgPSBkaWZmW2ktMV07XG4gICAgICAgICAgICBvbGRSYW5nZVN0YXJ0ID0gb2xkTGluZTtcbiAgICAgICAgICAgIG5ld1JhbmdlU3RhcnQgPSBuZXdMaW5lO1xuXG4gICAgICAgICAgICBpZiAocHJldikge1xuICAgICAgICAgICAgICBjdXJSYW5nZSA9IGNvbnRleHRMaW5lcyhwcmV2LmxpbmVzLnNsaWNlKC00KSk7XG4gICAgICAgICAgICAgIG9sZFJhbmdlU3RhcnQgLT0gY3VyUmFuZ2UubGVuZ3RoO1xuICAgICAgICAgICAgICBuZXdSYW5nZVN0YXJ0IC09IGN1clJhbmdlLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgY3VyUmFuZ2UucHVzaC5hcHBseShjdXJSYW5nZSwgbGluZXMubWFwKGZ1bmN0aW9uKGVudHJ5KSB7IHJldHVybiAoY3VycmVudC5hZGRlZD8nKyc6Jy0nKSArIGVudHJ5OyB9KSk7XG4gICAgICAgICAgZW9mTkwoY3VyUmFuZ2UsIGksIGN1cnJlbnQpO1xuXG4gICAgICAgICAgaWYgKGN1cnJlbnQuYWRkZWQpIHtcbiAgICAgICAgICAgIG5ld0xpbmUgKz0gbGluZXMubGVuZ3RoO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBvbGRMaW5lICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKG9sZFJhbmdlU3RhcnQpIHtcbiAgICAgICAgICAgIC8vIENsb3NlIG91dCBhbnkgY2hhbmdlcyB0aGF0IGhhdmUgYmVlbiBvdXRwdXQgKG9yIGpvaW4gb3ZlcmxhcHBpbmcpXG4gICAgICAgICAgICBpZiAobGluZXMubGVuZ3RoIDw9IDggJiYgaSA8IGRpZmYubGVuZ3RoLTIpIHtcbiAgICAgICAgICAgICAgLy8gT3ZlcmxhcHBpbmdcbiAgICAgICAgICAgICAgY3VyUmFuZ2UucHVzaC5hcHBseShjdXJSYW5nZSwgY29udGV4dExpbmVzKGxpbmVzKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBlbmQgdGhlIHJhbmdlIGFuZCBvdXRwdXRcbiAgICAgICAgICAgICAgdmFyIGNvbnRleHRTaXplID0gTWF0aC5taW4obGluZXMubGVuZ3RoLCA0KTtcbiAgICAgICAgICAgICAgcmV0LnB1c2goXG4gICAgICAgICAgICAgICAgICAnQEAgLScgKyBvbGRSYW5nZVN0YXJ0ICsgJywnICsgKG9sZExpbmUtb2xkUmFuZ2VTdGFydCtjb250ZXh0U2l6ZSlcbiAgICAgICAgICAgICAgICAgICsgJyArJyArIG5ld1JhbmdlU3RhcnQgKyAnLCcgKyAobmV3TGluZS1uZXdSYW5nZVN0YXJ0K2NvbnRleHRTaXplKVxuICAgICAgICAgICAgICAgICAgKyAnIEBAJyk7XG4gICAgICAgICAgICAgIHJldC5wdXNoLmFwcGx5KHJldCwgY3VyUmFuZ2UpO1xuICAgICAgICAgICAgICByZXQucHVzaC5hcHBseShyZXQsIGNvbnRleHRMaW5lcyhsaW5lcy5zbGljZSgwLCBjb250ZXh0U2l6ZSkpKTtcbiAgICAgICAgICAgICAgaWYgKGxpbmVzLmxlbmd0aCA8PSA0KSB7XG4gICAgICAgICAgICAgICAgZW9mTkwocmV0LCBpLCBjdXJyZW50KTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIG9sZFJhbmdlU3RhcnQgPSAwOyAgbmV3UmFuZ2VTdGFydCA9IDA7IGN1clJhbmdlID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIG9sZExpbmUgKz0gbGluZXMubGVuZ3RoO1xuICAgICAgICAgIG5ld0xpbmUgKz0gbGluZXMubGVuZ3RoO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXQuam9pbignXFxuJykgKyAnXFxuJztcbiAgICB9LFxuXG4gICAgYXBwbHlQYXRjaDogZnVuY3Rpb24ob2xkU3RyLCB1bmlEaWZmKSB7XG4gICAgICB2YXIgZGlmZnN0ciA9IHVuaURpZmYuc3BsaXQoJ1xcbicpO1xuICAgICAgdmFyIGRpZmYgPSBbXTtcbiAgICAgIHZhciByZW1FT0ZOTCA9IGZhbHNlLFxuICAgICAgICAgIGFkZEVPRk5MID0gZmFsc2U7XG5cbiAgICAgIGZvciAodmFyIGkgPSAoZGlmZnN0clswXVswXT09PSdJJz80OjApOyBpIDwgZGlmZnN0ci5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZihkaWZmc3RyW2ldWzBdID09PSAnQCcpIHtcbiAgICAgICAgICB2YXIgbWVoID0gZGlmZnN0cltpXS5zcGxpdCgvQEAgLShcXGQrKSwoXFxkKykgXFwrKFxcZCspLChcXGQrKSBAQC8pO1xuICAgICAgICAgIGRpZmYudW5zaGlmdCh7XG4gICAgICAgICAgICBzdGFydDptZWhbM10sXG4gICAgICAgICAgICBvbGRsZW5ndGg6bWVoWzJdLFxuICAgICAgICAgICAgb2xkbGluZXM6W10sXG4gICAgICAgICAgICBuZXdsZW5ndGg6bWVoWzRdLFxuICAgICAgICAgICAgbmV3bGluZXM6W11cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIGlmKGRpZmZzdHJbaV1bMF0gPT09ICcrJykge1xuICAgICAgICAgIGRpZmZbMF0ubmV3bGluZXMucHVzaChkaWZmc3RyW2ldLnN1YnN0cigxKSk7XG4gICAgICAgIH0gZWxzZSBpZihkaWZmc3RyW2ldWzBdID09PSAnLScpIHtcbiAgICAgICAgICBkaWZmWzBdLm9sZGxpbmVzLnB1c2goZGlmZnN0cltpXS5zdWJzdHIoMSkpO1xuICAgICAgICB9IGVsc2UgaWYoZGlmZnN0cltpXVswXSA9PT0gJyAnKSB7XG4gICAgICAgICAgZGlmZlswXS5uZXdsaW5lcy5wdXNoKGRpZmZzdHJbaV0uc3Vic3RyKDEpKTtcbiAgICAgICAgICBkaWZmWzBdLm9sZGxpbmVzLnB1c2goZGlmZnN0cltpXS5zdWJzdHIoMSkpO1xuICAgICAgICB9IGVsc2UgaWYoZGlmZnN0cltpXVswXSA9PT0gJ1xcXFwnKSB7XG4gICAgICAgICAgaWYgKGRpZmZzdHJbaS0xXVswXSA9PT0gJysnKSB7XG4gICAgICAgICAgICByZW1FT0ZOTCA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIGlmKGRpZmZzdHJbaS0xXVswXSA9PT0gJy0nKSB7XG4gICAgICAgICAgICBhZGRFT0ZOTCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHZhciBzdHIgPSBvbGRTdHIuc3BsaXQoJ1xcbicpO1xuICAgICAgZm9yICh2YXIgaSA9IGRpZmYubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgdmFyIGQgPSBkaWZmW2ldO1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGQub2xkbGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBpZihzdHJbZC5zdGFydC0xK2pdICE9PSBkLm9sZGxpbmVzW2pdKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIEFycmF5LnByb3RvdHlwZS5zcGxpY2UuYXBwbHkoc3RyLFtkLnN0YXJ0LTEsK2Qub2xkbGVuZ3RoXS5jb25jYXQoZC5uZXdsaW5lcykpO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVtRU9GTkwpIHtcbiAgICAgICAgd2hpbGUgKCFzdHJbc3RyLmxlbmd0aC0xXSkge1xuICAgICAgICAgIHN0ci5wb3AoKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChhZGRFT0ZOTCkge1xuICAgICAgICBzdHIucHVzaCgnJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RyLmpvaW4oJ1xcbicpO1xuICAgIH0sXG5cbiAgICBjb252ZXJ0Q2hhbmdlc1RvWE1MOiBmdW5jdGlvbihjaGFuZ2VzKXtcbiAgICAgIHZhciByZXQgPSBbXTtcbiAgICAgIGZvciAoIHZhciBpID0gMDsgaSA8IGNoYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoYW5nZSA9IGNoYW5nZXNbaV07XG4gICAgICAgIGlmIChjaGFuZ2UuYWRkZWQpIHtcbiAgICAgICAgICByZXQucHVzaCgnPGlucz4nKTtcbiAgICAgICAgfSBlbHNlIGlmIChjaGFuZ2UucmVtb3ZlZCkge1xuICAgICAgICAgIHJldC5wdXNoKCc8ZGVsPicpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0LnB1c2goZXNjYXBlSFRNTChjaGFuZ2UudmFsdWUpKTtcblxuICAgICAgICBpZiAoY2hhbmdlLmFkZGVkKSB7XG4gICAgICAgICAgcmV0LnB1c2goJzwvaW5zPicpO1xuICAgICAgICB9IGVsc2UgaWYgKGNoYW5nZS5yZW1vdmVkKSB7XG4gICAgICAgICAgcmV0LnB1c2goJzwvZGVsPicpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0LmpvaW4oJycpO1xuICAgIH0sXG5cbiAgICAvLyBTZWU6IGh0dHA6Ly9jb2RlLmdvb2dsZS5jb20vcC9nb29nbGUtZGlmZi1tYXRjaC1wYXRjaC93aWtpL0FQSVxuICAgIGNvbnZlcnRDaGFuZ2VzVG9ETVA6IGZ1bmN0aW9uKGNoYW5nZXMpe1xuICAgICAgdmFyIHJldCA9IFtdLCBjaGFuZ2U7XG4gICAgICBmb3IgKCB2YXIgaSA9IDA7IGkgPCBjaGFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNoYW5nZSA9IGNoYW5nZXNbaV07XG4gICAgICAgIHJldC5wdXNoKFsoY2hhbmdlLmFkZGVkID8gMSA6IGNoYW5nZS5yZW1vdmVkID8gLTEgOiAwKSwgY2hhbmdlLnZhbHVlXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH1cbiAgfTtcbn0pKCk7XG5cbmlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gSnNEaWZmO1xufVxuXG59KTsgLy8gbW9kdWxlOiBicm93c2VyL2RpZmYuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImJyb3dzZXIvZXZlbnRzLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGV4cG9ydHMuXG4gKi9cblxuZXhwb3J0cy5FdmVudEVtaXR0ZXIgPSBFdmVudEVtaXR0ZXI7XG5cbi8qKlxuICogQ2hlY2sgaWYgYG9iamAgaXMgYW4gYXJyYXkuXG4gKi9cblxuZnVuY3Rpb24gaXNBcnJheShvYmopIHtcbiAgcmV0dXJuICdbb2JqZWN0IEFycmF5XScgPT0ge30udG9TdHJpbmcuY2FsbChvYmopO1xufVxuXG4vKipcbiAqIEV2ZW50IGVtaXR0ZXIgY29uc3RydWN0b3IuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBFdmVudEVtaXR0ZXIoKXt9O1xuXG4vKipcbiAqIEFkZHMgYSBsaXN0ZW5lci5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBmdW5jdGlvbiAobmFtZSwgZm4pIHtcbiAgaWYgKCF0aGlzLiRldmVudHMpIHtcbiAgICB0aGlzLiRldmVudHMgPSB7fTtcbiAgfVxuXG4gIGlmICghdGhpcy4kZXZlbnRzW25hbWVdKSB7XG4gICAgdGhpcy4kZXZlbnRzW25hbWVdID0gZm47XG4gIH0gZWxzZSBpZiAoaXNBcnJheSh0aGlzLiRldmVudHNbbmFtZV0pKSB7XG4gICAgdGhpcy4kZXZlbnRzW25hbWVdLnB1c2goZm4pO1xuICB9IGVsc2Uge1xuICAgIHRoaXMuJGV2ZW50c1tuYW1lXSA9IFt0aGlzLiRldmVudHNbbmFtZV0sIGZuXTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUub247XG5cbi8qKlxuICogQWRkcyBhIHZvbGF0aWxlIGxpc3RlbmVyLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24gKG5hbWUsIGZuKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBmdW5jdGlvbiBvbiAoKSB7XG4gICAgc2VsZi5yZW1vdmVMaXN0ZW5lcihuYW1lLCBvbik7XG4gICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfTtcblxuICBvbi5saXN0ZW5lciA9IGZuO1xuICB0aGlzLm9uKG5hbWUsIG9uKTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmVtb3ZlcyBhIGxpc3RlbmVyLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uIChuYW1lLCBmbikge1xuICBpZiAodGhpcy4kZXZlbnRzICYmIHRoaXMuJGV2ZW50c1tuYW1lXSkge1xuICAgIHZhciBsaXN0ID0gdGhpcy4kZXZlbnRzW25hbWVdO1xuXG4gICAgaWYgKGlzQXJyYXkobGlzdCkpIHtcbiAgICAgIHZhciBwb3MgPSAtMTtcblxuICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBsaXN0Lmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBpZiAobGlzdFtpXSA9PT0gZm4gfHwgKGxpc3RbaV0ubGlzdGVuZXIgJiYgbGlzdFtpXS5saXN0ZW5lciA9PT0gZm4pKSB7XG4gICAgICAgICAgcG9zID0gaTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAocG9zIDwgMCkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cblxuICAgICAgbGlzdC5zcGxpY2UocG9zLCAxKTtcblxuICAgICAgaWYgKCFsaXN0Lmxlbmd0aCkge1xuICAgICAgICBkZWxldGUgdGhpcy4kZXZlbnRzW25hbWVdO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAobGlzdCA9PT0gZm4gfHwgKGxpc3QubGlzdGVuZXIgJiYgbGlzdC5saXN0ZW5lciA9PT0gZm4pKSB7XG4gICAgICBkZWxldGUgdGhpcy4kZXZlbnRzW25hbWVdO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZW1vdmVzIGFsbCBsaXN0ZW5lcnMgZm9yIGFuIGV2ZW50LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbiAobmFtZSkge1xuICBpZiAobmFtZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdGhpcy4kZXZlbnRzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBpZiAodGhpcy4kZXZlbnRzICYmIHRoaXMuJGV2ZW50c1tuYW1lXSkge1xuICAgIHRoaXMuJGV2ZW50c1tuYW1lXSA9IG51bGw7XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogR2V0cyBhbGwgbGlzdGVuZXJzIGZvciBhIGNlcnRhaW4gZXZlbnQuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gIGlmICghdGhpcy4kZXZlbnRzKSB7XG4gICAgdGhpcy4kZXZlbnRzID0ge307XG4gIH1cblxuICBpZiAoIXRoaXMuJGV2ZW50c1tuYW1lXSkge1xuICAgIHRoaXMuJGV2ZW50c1tuYW1lXSA9IFtdO1xuICB9XG5cbiAgaWYgKCFpc0FycmF5KHRoaXMuJGV2ZW50c1tuYW1lXSkpIHtcbiAgICB0aGlzLiRldmVudHNbbmFtZV0gPSBbdGhpcy4kZXZlbnRzW25hbWVdXTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLiRldmVudHNbbmFtZV07XG59O1xuXG4vKipcbiAqIEVtaXRzIGFuIGV2ZW50LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgaWYgKCF0aGlzLiRldmVudHMpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICB2YXIgaGFuZGxlciA9IHRoaXMuJGV2ZW50c1tuYW1lXTtcblxuICBpZiAoIWhhbmRsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblxuICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2YgaGFuZGxlcikge1xuICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XG4gIH0gZWxzZSBpZiAoaXNBcnJheShoYW5kbGVyKSkge1xuICAgIHZhciBsaXN0ZW5lcnMgPSBoYW5kbGVyLnNsaWNlKCk7XG5cbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IGxpc3RlbmVycy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIGxpc3RlbmVyc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xufSk7IC8vIG1vZHVsZTogYnJvd3Nlci9ldmVudHMuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImJyb3dzZXIvZnMuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxufSk7IC8vIG1vZHVsZTogYnJvd3Nlci9mcy5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiYnJvd3Nlci9wYXRoLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbn0pOyAvLyBtb2R1bGU6IGJyb3dzZXIvcGF0aC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiYnJvd3Nlci9wcm9ncmVzcy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyoqXG4gKiBFeHBvc2UgYFByb2dyZXNzYC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IFByb2dyZXNzO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFByb2dyZXNzYCBpbmRpY2F0b3IuXG4gKi9cblxuZnVuY3Rpb24gUHJvZ3Jlc3MoKSB7XG4gIHRoaXMucGVyY2VudCA9IDA7XG4gIHRoaXMuc2l6ZSgwKTtcbiAgdGhpcy5mb250U2l6ZSgxMSk7XG4gIHRoaXMuZm9udCgnaGVsdmV0aWNhLCBhcmlhbCwgc2Fucy1zZXJpZicpO1xufVxuXG4vKipcbiAqIFNldCBwcm9ncmVzcyBzaXplIHRvIGBuYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gblxuICogQHJldHVybiB7UHJvZ3Jlc3N9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Qcm9ncmVzcy5wcm90b3R5cGUuc2l6ZSA9IGZ1bmN0aW9uKG4pe1xuICB0aGlzLl9zaXplID0gbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCB0ZXh0IHRvIGBzdHJgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1Byb2dyZXNzfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUHJvZ3Jlc3MucHJvdG90eXBlLnRleHQgPSBmdW5jdGlvbihzdHIpe1xuICB0aGlzLl90ZXh0ID0gc3RyO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IGZvbnQgc2l6ZSB0byBgbmAuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG5cbiAqIEByZXR1cm4ge1Byb2dyZXNzfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUHJvZ3Jlc3MucHJvdG90eXBlLmZvbnRTaXplID0gZnVuY3Rpb24obil7XG4gIHRoaXMuX2ZvbnRTaXplID0gbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCBmb250IGBmYW1pbHlgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmYW1pbHlcbiAqIEByZXR1cm4ge1Byb2dyZXNzfSBmb3IgY2hhaW5pbmdcbiAqL1xuXG5Qcm9ncmVzcy5wcm90b3R5cGUuZm9udCA9IGZ1bmN0aW9uKGZhbWlseSl7XG4gIHRoaXMuX2ZvbnQgPSBmYW1pbHk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBVcGRhdGUgcGVyY2VudGFnZSB0byBgbmAuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG5cbiAqIEByZXR1cm4ge1Byb2dyZXNzfSBmb3IgY2hhaW5pbmdcbiAqL1xuXG5Qcm9ncmVzcy5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24obil7XG4gIHRoaXMucGVyY2VudCA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBEcmF3IG9uIGBjdHhgLlxuICpcbiAqIEBwYXJhbSB7Q2FudmFzUmVuZGVyaW5nQ29udGV4dDJkfSBjdHhcbiAqIEByZXR1cm4ge1Byb2dyZXNzfSBmb3IgY2hhaW5pbmdcbiAqL1xuXG5Qcm9ncmVzcy5wcm90b3R5cGUuZHJhdyA9IGZ1bmN0aW9uKGN0eCl7XG4gIHRyeSB7XG4gICAgdmFyIHBlcmNlbnQgPSBNYXRoLm1pbih0aGlzLnBlcmNlbnQsIDEwMClcbiAgICAgICwgc2l6ZSA9IHRoaXMuX3NpemVcbiAgICAgICwgaGFsZiA9IHNpemUgLyAyXG4gICAgICAsIHggPSBoYWxmXG4gICAgICAsIHkgPSBoYWxmXG4gICAgICAsIHJhZCA9IGhhbGYgLSAxXG4gICAgICAsIGZvbnRTaXplID0gdGhpcy5fZm9udFNpemU7XG4gIFxuICAgIGN0eC5mb250ID0gZm9udFNpemUgKyAncHggJyArIHRoaXMuX2ZvbnQ7XG4gIFxuICAgIHZhciBhbmdsZSA9IE1hdGguUEkgKiAyICogKHBlcmNlbnQgLyAxMDApO1xuICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgc2l6ZSwgc2l6ZSk7XG4gIFxuICAgIC8vIG91dGVyIGNpcmNsZVxuICAgIGN0eC5zdHJva2VTdHlsZSA9ICcjOWY5ZjlmJztcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LmFyYyh4LCB5LCByYWQsIDAsIGFuZ2xlLCBmYWxzZSk7XG4gICAgY3R4LnN0cm9rZSgpO1xuICBcbiAgICAvLyBpbm5lciBjaXJjbGVcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSAnI2VlZSc7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMoeCwgeSwgcmFkIC0gMSwgMCwgYW5nbGUsIHRydWUpO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgXG4gICAgLy8gdGV4dFxuICAgIHZhciB0ZXh0ID0gdGhpcy5fdGV4dCB8fCAocGVyY2VudCB8IDApICsgJyUnXG4gICAgICAsIHcgPSBjdHgubWVhc3VyZVRleHQodGV4dCkud2lkdGg7XG4gIFxuICAgIGN0eC5maWxsVGV4dChcbiAgICAgICAgdGV4dFxuICAgICAgLCB4IC0gdyAvIDIgKyAxXG4gICAgICAsIHkgKyBmb250U2l6ZSAvIDIgLSAxKTtcbiAgfSBjYXRjaCAoZXgpIHt9IC8vZG9uJ3QgZmFpbCBpZiB3ZSBjYW4ndCByZW5kZXIgcHJvZ3Jlc3NcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG59KTsgLy8gbW9kdWxlOiBicm93c2VyL3Byb2dyZXNzLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJicm93c2VyL3R0eS5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG5leHBvcnRzLmlzYXR0eSA9IGZ1bmN0aW9uKCl7XG4gIHJldHVybiB0cnVlO1xufTtcblxuZXhwb3J0cy5nZXRXaW5kb3dTaXplID0gZnVuY3Rpb24oKXtcbiAgaWYgKCdpbm5lckhlaWdodCcgaW4gZ2xvYmFsKSB7XG4gICAgcmV0dXJuIFtnbG9iYWwuaW5uZXJIZWlnaHQsIGdsb2JhbC5pbm5lcldpZHRoXTtcbiAgfSBlbHNlIHtcbiAgICAvLyBJbiBhIFdlYiBXb3JrZXIsIHRoZSBET00gV2luZG93IGlzIG5vdCBhdmFpbGFibGUuXG4gICAgcmV0dXJuIFs2NDAsIDQ4MF07XG4gIH1cbn07XG5cbn0pOyAvLyBtb2R1bGU6IGJyb3dzZXIvdHR5LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJjb250ZXh0LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogRXhwb3NlIGBDb250ZXh0YC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IENvbnRleHQ7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgQ29udGV4dGAuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gQ29udGV4dCgpe31cblxuLyoqXG4gKiBTZXQgb3IgZ2V0IHRoZSBjb250ZXh0IGBSdW5uYWJsZWAgdG8gYHJ1bm5hYmxlYC5cbiAqXG4gKiBAcGFyYW0ge1J1bm5hYmxlfSBydW5uYWJsZVxuICogQHJldHVybiB7Q29udGV4dH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkNvbnRleHQucHJvdG90eXBlLnJ1bm5hYmxlID0gZnVuY3Rpb24ocnVubmFibGUpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fcnVubmFibGU7XG4gIHRoaXMudGVzdCA9IHRoaXMuX3J1bm5hYmxlID0gcnVubmFibGU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGVzdCB0aW1lb3V0IGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtDb250ZXh0fSBzZWxmXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Db250ZXh0LnByb3RvdHlwZS50aW1lb3V0ID0gZnVuY3Rpb24obXMpe1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHRoaXMucnVubmFibGUoKS50aW1lb3V0KCk7XG4gIHRoaXMucnVubmFibGUoKS50aW1lb3V0KG1zKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCB0ZXN0IHRpbWVvdXQgYGVuYWJsZWRgLlxuICpcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlZFxuICogQHJldHVybiB7Q29udGV4dH0gc2VsZlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQ29udGV4dC5wcm90b3R5cGUuZW5hYmxlVGltZW91dHMgPSBmdW5jdGlvbiAoZW5hYmxlZCkge1xuICB0aGlzLnJ1bm5hYmxlKCkuZW5hYmxlVGltZW91dHMoZW5hYmxlZCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuXG4vKipcbiAqIFNldCB0ZXN0IHNsb3duZXNzIHRocmVzaG9sZCBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7Q29udGV4dH0gc2VsZlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQ29udGV4dC5wcm90b3R5cGUuc2xvdyA9IGZ1bmN0aW9uKG1zKXtcbiAgdGhpcy5ydW5uYWJsZSgpLnNsb3cobXMpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogSW5zcGVjdCB0aGUgY29udGV4dCB2b2lkIG9mIGAuX3J1bm5hYmxlYC5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Db250ZXh0LnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24oKXtcbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHRoaXMsIGZ1bmN0aW9uKGtleSwgdmFsKXtcbiAgICBpZiAoJ19ydW5uYWJsZScgPT0ga2V5KSByZXR1cm47XG4gICAgaWYgKCd0ZXN0JyA9PSBrZXkpIHJldHVybjtcbiAgICByZXR1cm4gdmFsO1xuICB9LCAyKTtcbn07XG5cbn0pOyAvLyBtb2R1bGU6IGNvbnRleHQuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImhvb2suanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBSdW5uYWJsZSA9IHJlcXVpcmUoJy4vcnVubmFibGUnKTtcblxuLyoqXG4gKiBFeHBvc2UgYEhvb2tgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gSG9vaztcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBIb29rYCB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgIGFuZCBjYWxsYmFjayBgZm5gLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0aXRsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIEhvb2sodGl0bGUsIGZuKSB7XG4gIFJ1bm5hYmxlLmNhbGwodGhpcywgdGl0bGUsIGZuKTtcbiAgdGhpcy50eXBlID0gJ2hvb2snO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgUnVubmFibGUucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gUnVubmFibGUucHJvdG90eXBlO1xuSG9vay5wcm90b3R5cGUgPSBuZXcgRjtcbkhvb2sucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gSG9vaztcblxuXG4vKipcbiAqIEdldCBvciBzZXQgdGhlIHRlc3QgYGVycmAuXG4gKlxuICogQHBhcmFtIHtFcnJvcn0gZXJyXG4gKiBAcmV0dXJuIHtFcnJvcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuSG9vay5wcm90b3R5cGUuZXJyb3IgPSBmdW5jdGlvbihlcnIpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgdmFyIGVyciA9IHRoaXMuX2Vycm9yO1xuICAgIHRoaXMuX2Vycm9yID0gbnVsbDtcbiAgICByZXR1cm4gZXJyO1xuICB9XG5cbiAgdGhpcy5fZXJyb3IgPSBlcnI7XG59O1xuXG59KTsgLy8gbW9kdWxlOiBob29rLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJpbnRlcmZhY2VzL2JkZC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIFN1aXRlID0gcmVxdWlyZSgnLi4vc3VpdGUnKVxuICAsIFRlc3QgPSByZXF1aXJlKCcuLi90ZXN0JylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbi8qKlxuICogQkRELXN0eWxlIGludGVyZmFjZTpcbiAqXG4gKiAgICAgIGRlc2NyaWJlKCdBcnJheScsIGZ1bmN0aW9uKCl7XG4gKiAgICAgICAgZGVzY3JpYmUoJyNpbmRleE9mKCknLCBmdW5jdGlvbigpe1xuICogICAgICAgICAgaXQoJ3Nob3VsZCByZXR1cm4gLTEgd2hlbiBub3QgcHJlc2VudCcsIGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICAgfSk7XG4gKlxuICogICAgICAgICAgaXQoJ3Nob3VsZCByZXR1cm4gdGhlIGluZGV4IHdoZW4gcHJlc2VudCcsIGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICAgfSk7XG4gKiAgICAgICAgfSk7XG4gKiAgICAgIH0pO1xuICpcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHN1aXRlKXtcbiAgdmFyIHN1aXRlcyA9IFtzdWl0ZV07XG5cbiAgc3VpdGUub24oJ3ByZS1yZXF1aXJlJywgZnVuY3Rpb24oY29udGV4dCwgZmlsZSwgbW9jaGEpe1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBiZWZvcmUgcnVubmluZyB0ZXN0cy5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYmVmb3JlID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmJlZm9yZUFsbChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYWZ0ZXIgcnVubmluZyB0ZXN0cy5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYWZ0ZXIgPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYWZ0ZXJBbGwobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGJlZm9yZSBlYWNoIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYmVmb3JlRWFjaCA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5iZWZvcmVFYWNoKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBhZnRlciBlYWNoIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYWZ0ZXJFYWNoID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmFmdGVyRWFjaChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIERlc2NyaWJlIGEgXCJzdWl0ZVwiIHdpdGggdGhlIGdpdmVuIGB0aXRsZWBcbiAgICAgKiBhbmQgY2FsbGJhY2sgYGZuYCBjb250YWluaW5nIG5lc3RlZCBzdWl0ZXNcbiAgICAgKiBhbmQvb3IgdGVzdHMuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmRlc2NyaWJlID0gY29udGV4dC5jb250ZXh0ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IFN1aXRlLmNyZWF0ZShzdWl0ZXNbMF0sIHRpdGxlKTtcbiAgICAgIHN1aXRlLmZpbGUgPSBmaWxlO1xuICAgICAgc3VpdGVzLnVuc2hpZnQoc3VpdGUpO1xuICAgICAgZm4uY2FsbChzdWl0ZSk7XG4gICAgICBzdWl0ZXMuc2hpZnQoKTtcbiAgICAgIHJldHVybiBzdWl0ZTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUGVuZGluZyBkZXNjcmliZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQueGRlc2NyaWJlID1cbiAgICBjb250ZXh0Lnhjb250ZXh0ID1cbiAgICBjb250ZXh0LmRlc2NyaWJlLnNraXAgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHN1aXRlID0gU3VpdGUuY3JlYXRlKHN1aXRlc1swXSwgdGl0bGUpO1xuICAgICAgc3VpdGUucGVuZGluZyA9IHRydWU7XG4gICAgICBzdWl0ZXMudW5zaGlmdChzdWl0ZSk7XG4gICAgICBmbi5jYWxsKHN1aXRlKTtcbiAgICAgIHN1aXRlcy5zaGlmdCgpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGNsdXNpdmUgc3VpdGUuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmRlc2NyaWJlLm9ubHkgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHN1aXRlID0gY29udGV4dC5kZXNjcmliZSh0aXRsZSwgZm4pO1xuICAgICAgbW9jaGEuZ3JlcChzdWl0ZS5mdWxsVGl0bGUoKSk7XG4gICAgICByZXR1cm4gc3VpdGU7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIERlc2NyaWJlIGEgc3BlY2lmaWNhdGlvbiBvciB0ZXN0LWNhc2VcbiAgICAgKiB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgIGFuZCBjYWxsYmFjayBgZm5gXG4gICAgICogYWN0aW5nIGFzIGEgdGh1bmsuXG4gICAgICovXG5cbiAgICBjb250ZXh0Lml0ID0gY29udGV4dC5zcGVjaWZ5ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IHN1aXRlc1swXTtcbiAgICAgIGlmIChzdWl0ZS5wZW5kaW5nKSB2YXIgZm4gPSBudWxsO1xuICAgICAgdmFyIHRlc3QgPSBuZXcgVGVzdCh0aXRsZSwgZm4pO1xuICAgICAgdGVzdC5maWxlID0gZmlsZTtcbiAgICAgIHN1aXRlLmFkZFRlc3QodGVzdCk7XG4gICAgICByZXR1cm4gdGVzdDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhjbHVzaXZlIHRlc3QtY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuaXQub25seSA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gICAgICB2YXIgdGVzdCA9IGNvbnRleHQuaXQodGl0bGUsIGZuKTtcbiAgICAgIHZhciByZVN0cmluZyA9ICdeJyArIHV0aWxzLmVzY2FwZVJlZ2V4cCh0ZXN0LmZ1bGxUaXRsZSgpKSArICckJztcbiAgICAgIG1vY2hhLmdyZXAobmV3IFJlZ0V4cChyZVN0cmluZykpO1xuICAgICAgcmV0dXJuIHRlc3Q7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFBlbmRpbmcgdGVzdCBjYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC54aXQgPVxuICAgIGNvbnRleHQueHNwZWNpZnkgPVxuICAgIGNvbnRleHQuaXQuc2tpcCA9IGZ1bmN0aW9uKHRpdGxlKXtcbiAgICAgIGNvbnRleHQuaXQodGl0bGUpO1xuICAgIH07XG4gIH0pO1xufTtcblxufSk7IC8vIG1vZHVsZTogaW50ZXJmYWNlcy9iZGQuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImludGVyZmFjZXMvZXhwb3J0cy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIFN1aXRlID0gcmVxdWlyZSgnLi4vc3VpdGUnKVxuICAsIFRlc3QgPSByZXF1aXJlKCcuLi90ZXN0Jyk7XG5cbi8qKlxuICogVERELXN0eWxlIGludGVyZmFjZTpcbiAqXG4gKiAgICAgZXhwb3J0cy5BcnJheSA9IHtcbiAqICAgICAgICcjaW5kZXhPZigpJzoge1xuICogICAgICAgICAnc2hvdWxkIHJldHVybiAtMSB3aGVuIHRoZSB2YWx1ZSBpcyBub3QgcHJlc2VudCc6IGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICB9LFxuICpcbiAqICAgICAgICAgJ3Nob3VsZCByZXR1cm4gdGhlIGNvcnJlY3QgaW5kZXggd2hlbiB0aGUgdmFsdWUgaXMgcHJlc2VudCc6IGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICB9XG4gKiAgICAgICB9XG4gKiAgICAgfTtcbiAqXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzdWl0ZSl7XG4gIHZhciBzdWl0ZXMgPSBbc3VpdGVdO1xuXG4gIHN1aXRlLm9uKCdyZXF1aXJlJywgdmlzaXQpO1xuXG4gIGZ1bmN0aW9uIHZpc2l0KG9iaiwgZmlsZSkge1xuICAgIHZhciBzdWl0ZTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2Ygb2JqW2tleV0pIHtcbiAgICAgICAgdmFyIGZuID0gb2JqW2tleV07XG4gICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgY2FzZSAnYmVmb3JlJzpcbiAgICAgICAgICAgIHN1aXRlc1swXS5iZWZvcmVBbGwoZm4pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnYWZ0ZXInOlxuICAgICAgICAgICAgc3VpdGVzWzBdLmFmdGVyQWxsKGZuKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2JlZm9yZUVhY2gnOlxuICAgICAgICAgICAgc3VpdGVzWzBdLmJlZm9yZUVhY2goZm4pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnYWZ0ZXJFYWNoJzpcbiAgICAgICAgICAgIHN1aXRlc1swXS5hZnRlckVhY2goZm4pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHZhciB0ZXN0ID0gbmV3IFRlc3Qoa2V5LCBmbik7XG4gICAgICAgICAgICB0ZXN0LmZpbGUgPSBmaWxlO1xuICAgICAgICAgICAgc3VpdGVzWzBdLmFkZFRlc3QodGVzdCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBzdWl0ZSA9IFN1aXRlLmNyZWF0ZShzdWl0ZXNbMF0sIGtleSk7XG4gICAgICAgIHN1aXRlcy51bnNoaWZ0KHN1aXRlKTtcbiAgICAgICAgdmlzaXQob2JqW2tleV0pO1xuICAgICAgICBzdWl0ZXMuc2hpZnQoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbn0pOyAvLyBtb2R1bGU6IGludGVyZmFjZXMvZXhwb3J0cy5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiaW50ZXJmYWNlcy9pbmRleC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG5leHBvcnRzLmJkZCA9IHJlcXVpcmUoJy4vYmRkJyk7XG5leHBvcnRzLnRkZCA9IHJlcXVpcmUoJy4vdGRkJyk7XG5leHBvcnRzLnF1bml0ID0gcmVxdWlyZSgnLi9xdW5pdCcpO1xuZXhwb3J0cy5leHBvcnRzID0gcmVxdWlyZSgnLi9leHBvcnRzJyk7XG5cbn0pOyAvLyBtb2R1bGU6IGludGVyZmFjZXMvaW5kZXguanNcblxucmVxdWlyZS5yZWdpc3RlcihcImludGVyZmFjZXMvcXVuaXQuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBTdWl0ZSA9IHJlcXVpcmUoJy4uL3N1aXRlJylcbiAgLCBUZXN0ID0gcmVxdWlyZSgnLi4vdGVzdCcpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4vKipcbiAqIFFVbml0LXN0eWxlIGludGVyZmFjZTpcbiAqXG4gKiAgICAgc3VpdGUoJ0FycmF5Jyk7XG4gKlxuICogICAgIHRlc3QoJyNsZW5ndGgnLCBmdW5jdGlvbigpe1xuICogICAgICAgdmFyIGFyciA9IFsxLDIsM107XG4gKiAgICAgICBvayhhcnIubGVuZ3RoID09IDMpO1xuICogICAgIH0pO1xuICpcbiAqICAgICB0ZXN0KCcjaW5kZXhPZigpJywgZnVuY3Rpb24oKXtcbiAqICAgICAgIHZhciBhcnIgPSBbMSwyLDNdO1xuICogICAgICAgb2soYXJyLmluZGV4T2YoMSkgPT0gMCk7XG4gKiAgICAgICBvayhhcnIuaW5kZXhPZigyKSA9PSAxKTtcbiAqICAgICAgIG9rKGFyci5pbmRleE9mKDMpID09IDIpO1xuICogICAgIH0pO1xuICpcbiAqICAgICBzdWl0ZSgnU3RyaW5nJyk7XG4gKlxuICogICAgIHRlc3QoJyNsZW5ndGgnLCBmdW5jdGlvbigpe1xuICogICAgICAgb2soJ2ZvbycubGVuZ3RoID09IDMpO1xuICogICAgIH0pO1xuICpcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHN1aXRlKXtcbiAgdmFyIHN1aXRlcyA9IFtzdWl0ZV07XG5cbiAgc3VpdGUub24oJ3ByZS1yZXF1aXJlJywgZnVuY3Rpb24oY29udGV4dCwgZmlsZSwgbW9jaGEpe1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBiZWZvcmUgcnVubmluZyB0ZXN0cy5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYmVmb3JlID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmJlZm9yZUFsbChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYWZ0ZXIgcnVubmluZyB0ZXN0cy5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYWZ0ZXIgPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYWZ0ZXJBbGwobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGJlZm9yZSBlYWNoIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYmVmb3JlRWFjaCA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5iZWZvcmVFYWNoKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBhZnRlciBlYWNoIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuYWZ0ZXJFYWNoID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmFmdGVyRWFjaChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIERlc2NyaWJlIGEgXCJzdWl0ZVwiIHdpdGggdGhlIGdpdmVuIGB0aXRsZWAuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnN1aXRlID0gZnVuY3Rpb24odGl0bGUpe1xuICAgICAgaWYgKHN1aXRlcy5sZW5ndGggPiAxKSBzdWl0ZXMuc2hpZnQoKTtcbiAgICAgIHZhciBzdWl0ZSA9IFN1aXRlLmNyZWF0ZShzdWl0ZXNbMF0sIHRpdGxlKTtcbiAgICAgIHN1aXRlLmZpbGUgPSBmaWxlO1xuICAgICAgc3VpdGVzLnVuc2hpZnQoc3VpdGUpO1xuICAgICAgcmV0dXJuIHN1aXRlO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGNsdXNpdmUgdGVzdC1jYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zdWl0ZS5vbmx5ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IGNvbnRleHQuc3VpdGUodGl0bGUsIGZuKTtcbiAgICAgIG1vY2hhLmdyZXAoc3VpdGUuZnVsbFRpdGxlKCkpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZSBhIHNwZWNpZmljYXRpb24gb3IgdGVzdC1jYXNlXG4gICAgICogd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYCBhbmQgY2FsbGJhY2sgYGZuYFxuICAgICAqIGFjdGluZyBhcyBhIHRodW5rLlxuICAgICAqL1xuXG4gICAgY29udGV4dC50ZXN0ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciB0ZXN0ID0gbmV3IFRlc3QodGl0bGUsIGZuKTtcbiAgICAgIHRlc3QuZmlsZSA9IGZpbGU7XG4gICAgICBzdWl0ZXNbMF0uYWRkVGVzdCh0ZXN0KTtcbiAgICAgIHJldHVybiB0ZXN0O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGNsdXNpdmUgdGVzdC1jYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC50ZXN0Lm9ubHkgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHRlc3QgPSBjb250ZXh0LnRlc3QodGl0bGUsIGZuKTtcbiAgICAgIHZhciByZVN0cmluZyA9ICdeJyArIHV0aWxzLmVzY2FwZVJlZ2V4cCh0ZXN0LmZ1bGxUaXRsZSgpKSArICckJztcbiAgICAgIG1vY2hhLmdyZXAobmV3IFJlZ0V4cChyZVN0cmluZykpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBQZW5kaW5nIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQudGVzdC5za2lwID0gZnVuY3Rpb24odGl0bGUpe1xuICAgICAgY29udGV4dC50ZXN0KHRpdGxlKTtcbiAgICB9O1xuICB9KTtcbn07XG5cbn0pOyAvLyBtb2R1bGU6IGludGVyZmFjZXMvcXVuaXQuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImludGVyZmFjZXMvdGRkLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgU3VpdGUgPSByZXF1aXJlKCcuLi9zdWl0ZScpXG4gICwgVGVzdCA9IHJlcXVpcmUoJy4uL3Rlc3QnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTs7XG5cbi8qKlxuICogVERELXN0eWxlIGludGVyZmFjZTpcbiAqXG4gKiAgICAgIHN1aXRlKCdBcnJheScsIGZ1bmN0aW9uKCl7XG4gKiAgICAgICAgc3VpdGUoJyNpbmRleE9mKCknLCBmdW5jdGlvbigpe1xuICogICAgICAgICAgc3VpdGVTZXR1cChmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgIH0pO1xuICpcbiAqICAgICAgICAgIHRlc3QoJ3Nob3VsZCByZXR1cm4gLTEgd2hlbiBub3QgcHJlc2VudCcsIGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICAgfSk7XG4gKlxuICogICAgICAgICAgdGVzdCgnc2hvdWxkIHJldHVybiB0aGUgaW5kZXggd2hlbiBwcmVzZW50JywgZnVuY3Rpb24oKXtcbiAqXG4gKiAgICAgICAgICB9KTtcbiAqXG4gKiAgICAgICAgICBzdWl0ZVRlYXJkb3duKGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICAgfSk7XG4gKiAgICAgICAgfSk7XG4gKiAgICAgIH0pO1xuICpcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHN1aXRlKXtcbiAgdmFyIHN1aXRlcyA9IFtzdWl0ZV07XG5cbiAgc3VpdGUub24oJ3ByZS1yZXF1aXJlJywgZnVuY3Rpb24oY29udGV4dCwgZmlsZSwgbW9jaGEpe1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBiZWZvcmUgZWFjaCB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnNldHVwID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmJlZm9yZUVhY2gobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGFmdGVyIGVhY2ggdGVzdCBjYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC50ZWFyZG93biA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5hZnRlckVhY2gobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGJlZm9yZSB0aGUgc3VpdGUuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnN1aXRlU2V0dXAgPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYmVmb3JlQWxsKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBhZnRlciB0aGUgc3VpdGUuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnN1aXRlVGVhcmRvd24gPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYWZ0ZXJBbGwobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZSBhIFwic3VpdGVcIiB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgXG4gICAgICogYW5kIGNhbGxiYWNrIGBmbmAgY29udGFpbmluZyBuZXN0ZWQgc3VpdGVzXG4gICAgICogYW5kL29yIHRlc3RzLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zdWl0ZSA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gICAgICB2YXIgc3VpdGUgPSBTdWl0ZS5jcmVhdGUoc3VpdGVzWzBdLCB0aXRsZSk7XG4gICAgICBzdWl0ZS5maWxlID0gZmlsZTtcbiAgICAgIHN1aXRlcy51bnNoaWZ0KHN1aXRlKTtcbiAgICAgIGZuLmNhbGwoc3VpdGUpO1xuICAgICAgc3VpdGVzLnNoaWZ0KCk7XG4gICAgICByZXR1cm4gc3VpdGU7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFBlbmRpbmcgc3VpdGUuXG4gICAgICovXG4gICAgY29udGV4dC5zdWl0ZS5za2lwID0gZnVuY3Rpb24odGl0bGUsIGZuKSB7XG4gICAgICB2YXIgc3VpdGUgPSBTdWl0ZS5jcmVhdGUoc3VpdGVzWzBdLCB0aXRsZSk7XG4gICAgICBzdWl0ZS5wZW5kaW5nID0gdHJ1ZTtcbiAgICAgIHN1aXRlcy51bnNoaWZ0KHN1aXRlKTtcbiAgICAgIGZuLmNhbGwoc3VpdGUpO1xuICAgICAgc3VpdGVzLnNoaWZ0KCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4Y2x1c2l2ZSB0ZXN0LWNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnN1aXRlLm9ubHkgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHN1aXRlID0gY29udGV4dC5zdWl0ZSh0aXRsZSwgZm4pO1xuICAgICAgbW9jaGEuZ3JlcChzdWl0ZS5mdWxsVGl0bGUoKSk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIERlc2NyaWJlIGEgc3BlY2lmaWNhdGlvbiBvciB0ZXN0LWNhc2VcbiAgICAgKiB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgIGFuZCBjYWxsYmFjayBgZm5gXG4gICAgICogYWN0aW5nIGFzIGEgdGh1bmsuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnRlc3QgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHN1aXRlID0gc3VpdGVzWzBdO1xuICAgICAgaWYgKHN1aXRlLnBlbmRpbmcpIHZhciBmbiA9IG51bGw7XG4gICAgICB2YXIgdGVzdCA9IG5ldyBUZXN0KHRpdGxlLCBmbik7XG4gICAgICB0ZXN0LmZpbGUgPSBmaWxlO1xuICAgICAgc3VpdGUuYWRkVGVzdCh0ZXN0KTtcbiAgICAgIHJldHVybiB0ZXN0O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGNsdXNpdmUgdGVzdC1jYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC50ZXN0Lm9ubHkgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHRlc3QgPSBjb250ZXh0LnRlc3QodGl0bGUsIGZuKTtcbiAgICAgIHZhciByZVN0cmluZyA9ICdeJyArIHV0aWxzLmVzY2FwZVJlZ2V4cCh0ZXN0LmZ1bGxUaXRsZSgpKSArICckJztcbiAgICAgIG1vY2hhLmdyZXAobmV3IFJlZ0V4cChyZVN0cmluZykpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBQZW5kaW5nIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQudGVzdC5za2lwID0gZnVuY3Rpb24odGl0bGUpe1xuICAgICAgY29udGV4dC50ZXN0KHRpdGxlKTtcbiAgICB9O1xuICB9KTtcbn07XG5cbn0pOyAvLyBtb2R1bGU6IGludGVyZmFjZXMvdGRkLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJtb2NoYS5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyohXG4gKiBtb2NoYVxuICogQ29weXJpZ2h0KGMpIDIwMTEgVEogSG9sb3dheWNodWsgPHRqQHZpc2lvbi1tZWRpYS5jYT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgcGF0aCA9IHJlcXVpcmUoJ2Jyb3dzZXIvcGF0aCcpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbi8qKlxuICogRXhwb3NlIGBNb2NoYWAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gTW9jaGE7XG5cbi8qKlxuICogVG8gcmVxdWlyZSBsb2NhbCBVSXMgYW5kIHJlcG9ydGVycyB3aGVuIHJ1bm5pbmcgaW4gbm9kZS5cbiAqL1xuXG5pZiAodHlwZW9mIHByb2Nlc3MgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBwcm9jZXNzLmN3ZCA9PT0gJ2Z1bmN0aW9uJykge1xuICB2YXIgam9pbiA9IHBhdGguam9pblxuICAgICwgY3dkID0gcHJvY2Vzcy5jd2QoKTtcbiAgbW9kdWxlLnBhdGhzLnB1c2goY3dkLCBqb2luKGN3ZCwgJ25vZGVfbW9kdWxlcycpKTtcbn1cblxuLyoqXG4gKiBFeHBvc2UgaW50ZXJuYWxzLlxuICovXG5cbmV4cG9ydHMudXRpbHMgPSB1dGlscztcbmV4cG9ydHMuaW50ZXJmYWNlcyA9IHJlcXVpcmUoJy4vaW50ZXJmYWNlcycpO1xuZXhwb3J0cy5yZXBvcnRlcnMgPSByZXF1aXJlKCcuL3JlcG9ydGVycycpO1xuZXhwb3J0cy5SdW5uYWJsZSA9IHJlcXVpcmUoJy4vcnVubmFibGUnKTtcbmV4cG9ydHMuQ29udGV4dCA9IHJlcXVpcmUoJy4vY29udGV4dCcpO1xuZXhwb3J0cy5SdW5uZXIgPSByZXF1aXJlKCcuL3J1bm5lcicpO1xuZXhwb3J0cy5TdWl0ZSA9IHJlcXVpcmUoJy4vc3VpdGUnKTtcbmV4cG9ydHMuSG9vayA9IHJlcXVpcmUoJy4vaG9vaycpO1xuZXhwb3J0cy5UZXN0ID0gcmVxdWlyZSgnLi90ZXN0Jyk7XG5cbi8qKlxuICogUmV0dXJuIGltYWdlIGBuYW1lYCBwYXRoLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBpbWFnZShuYW1lKSB7XG4gIHJldHVybiBfX2Rpcm5hbWUgKyAnLy4uL2ltYWdlcy8nICsgbmFtZSArICcucG5nJztcbn1cblxuLyoqXG4gKiBTZXR1cCBtb2NoYSB3aXRoIGBvcHRpb25zYC5cbiAqXG4gKiBPcHRpb25zOlxuICpcbiAqICAgLSBgdWlgIG5hbWUgXCJiZGRcIiwgXCJ0ZGRcIiwgXCJleHBvcnRzXCIgZXRjXG4gKiAgIC0gYHJlcG9ydGVyYCByZXBvcnRlciBpbnN0YW5jZSwgZGVmYXVsdHMgdG8gYG1vY2hhLnJlcG9ydGVycy5zcGVjYFxuICogICAtIGBnbG9iYWxzYCBhcnJheSBvZiBhY2NlcHRlZCBnbG9iYWxzXG4gKiAgIC0gYHRpbWVvdXRgIHRpbWVvdXQgaW4gbWlsbGlzZWNvbmRzXG4gKiAgIC0gYGJhaWxgIGJhaWwgb24gdGhlIGZpcnN0IHRlc3QgZmFpbHVyZVxuICogICAtIGBzbG93YCBtaWxsaXNlY29uZHMgdG8gd2FpdCBiZWZvcmUgY29uc2lkZXJpbmcgYSB0ZXN0IHNsb3dcbiAqICAgLSBgaWdub3JlTGVha3NgIGlnbm9yZSBnbG9iYWwgbGVha3NcbiAqICAgLSBgZ3JlcGAgc3RyaW5nIG9yIHJlZ2V4cCB0byBmaWx0ZXIgdGVzdHMgd2l0aFxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIE1vY2hhKG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIHRoaXMuZmlsZXMgPSBbXTtcbiAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgdGhpcy5ncmVwKG9wdGlvbnMuZ3JlcCk7XG4gIHRoaXMuc3VpdGUgPSBuZXcgZXhwb3J0cy5TdWl0ZSgnJywgbmV3IGV4cG9ydHMuQ29udGV4dCk7XG4gIHRoaXMudWkob3B0aW9ucy51aSk7XG4gIHRoaXMuYmFpbChvcHRpb25zLmJhaWwpO1xuICB0aGlzLnJlcG9ydGVyKG9wdGlvbnMucmVwb3J0ZXIpO1xuICBpZiAobnVsbCAhPSBvcHRpb25zLnRpbWVvdXQpIHRoaXMudGltZW91dChvcHRpb25zLnRpbWVvdXQpO1xuICB0aGlzLnVzZUNvbG9ycyhvcHRpb25zLnVzZUNvbG9ycylcbiAgaWYgKG9wdGlvbnMuZW5hYmxlVGltZW91dHMgIT09IG51bGwpIHRoaXMuZW5hYmxlVGltZW91dHMob3B0aW9ucy5lbmFibGVUaW1lb3V0cyk7XG4gIGlmIChvcHRpb25zLnNsb3cpIHRoaXMuc2xvdyhvcHRpb25zLnNsb3cpO1xuXG4gIHRoaXMuc3VpdGUub24oJ3ByZS1yZXF1aXJlJywgZnVuY3Rpb24gKGNvbnRleHQpIHtcbiAgICBleHBvcnRzLmFmdGVyRWFjaCA9IGNvbnRleHQuYWZ0ZXJFYWNoIHx8IGNvbnRleHQudGVhcmRvd247XG4gICAgZXhwb3J0cy5hZnRlciA9IGNvbnRleHQuYWZ0ZXIgfHwgY29udGV4dC5zdWl0ZVRlYXJkb3duO1xuICAgIGV4cG9ydHMuYmVmb3JlRWFjaCA9IGNvbnRleHQuYmVmb3JlRWFjaCB8fCBjb250ZXh0LnNldHVwO1xuICAgIGV4cG9ydHMuYmVmb3JlID0gY29udGV4dC5iZWZvcmUgfHwgY29udGV4dC5zdWl0ZVNldHVwO1xuICAgIGV4cG9ydHMuZGVzY3JpYmUgPSBjb250ZXh0LmRlc2NyaWJlIHx8IGNvbnRleHQuc3VpdGU7XG4gICAgZXhwb3J0cy5pdCA9IGNvbnRleHQuaXQgfHwgY29udGV4dC50ZXN0O1xuICAgIGV4cG9ydHMuc2V0dXAgPSBjb250ZXh0LnNldHVwIHx8IGNvbnRleHQuYmVmb3JlRWFjaDtcbiAgICBleHBvcnRzLnN1aXRlU2V0dXAgPSBjb250ZXh0LnN1aXRlU2V0dXAgfHwgY29udGV4dC5iZWZvcmU7XG4gICAgZXhwb3J0cy5zdWl0ZVRlYXJkb3duID0gY29udGV4dC5zdWl0ZVRlYXJkb3duIHx8IGNvbnRleHQuYWZ0ZXI7XG4gICAgZXhwb3J0cy5zdWl0ZSA9IGNvbnRleHQuc3VpdGUgfHwgY29udGV4dC5kZXNjcmliZTtcbiAgICBleHBvcnRzLnRlYXJkb3duID0gY29udGV4dC50ZWFyZG93biB8fCBjb250ZXh0LmFmdGVyRWFjaDtcbiAgICBleHBvcnRzLnRlc3QgPSBjb250ZXh0LnRlc3QgfHwgY29udGV4dC5pdDtcbiAgfSk7XG59XG5cbi8qKlxuICogRW5hYmxlIG9yIGRpc2FibGUgYmFpbGluZyBvbiB0aGUgZmlyc3QgZmFpbHVyZS5cbiAqXG4gKiBAcGFyYW0ge0Jvb2xlYW59IFtiYWlsXVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuYmFpbCA9IGZ1bmN0aW9uKGJhaWwpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSBiYWlsID0gdHJ1ZTtcbiAgdGhpcy5zdWl0ZS5iYWlsKGJhaWwpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQWRkIHRlc3QgYGZpbGVgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS5hZGRGaWxlID0gZnVuY3Rpb24oZmlsZSl7XG4gIHRoaXMuZmlsZXMucHVzaChmaWxlKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCByZXBvcnRlciB0byBgcmVwb3J0ZXJgLCBkZWZhdWx0cyB0byBcInNwZWNcIi5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xGdW5jdGlvbn0gcmVwb3J0ZXIgbmFtZSBvciBjb25zdHJ1Y3RvclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUucmVwb3J0ZXIgPSBmdW5jdGlvbihyZXBvcnRlcil7XG4gIGlmICgnZnVuY3Rpb24nID09IHR5cGVvZiByZXBvcnRlcikge1xuICAgIHRoaXMuX3JlcG9ydGVyID0gcmVwb3J0ZXI7XG4gIH0gZWxzZSB7XG4gICAgcmVwb3J0ZXIgPSByZXBvcnRlciB8fCAnc3BlYyc7XG4gICAgdmFyIF9yZXBvcnRlcjtcbiAgICB0cnkgeyBfcmVwb3J0ZXIgPSByZXF1aXJlKCcuL3JlcG9ydGVycy8nICsgcmVwb3J0ZXIpOyB9IGNhdGNoIChlcnIpIHt9O1xuICAgIGlmICghX3JlcG9ydGVyKSB0cnkgeyBfcmVwb3J0ZXIgPSByZXF1aXJlKHJlcG9ydGVyKTsgfSBjYXRjaCAoZXJyKSB7fTtcbiAgICBpZiAoIV9yZXBvcnRlciAmJiByZXBvcnRlciA9PT0gJ3RlYW1jaXR5JylcbiAgICAgIGNvbnNvbGUud2FybignVGhlIFRlYW1jaXR5IHJlcG9ydGVyIHdhcyBtb3ZlZCB0byBhIHBhY2thZ2UgbmFtZWQgJyArXG4gICAgICAgICdtb2NoYS10ZWFtY2l0eS1yZXBvcnRlciAnICtcbiAgICAgICAgJyhodHRwczovL25wbWpzLm9yZy9wYWNrYWdlL21vY2hhLXRlYW1jaXR5LXJlcG9ydGVyKS4nKTtcbiAgICBpZiAoIV9yZXBvcnRlcikgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHJlcG9ydGVyIFwiJyArIHJlcG9ydGVyICsgJ1wiJyk7XG4gICAgdGhpcy5fcmVwb3J0ZXIgPSBfcmVwb3J0ZXI7XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCB0ZXN0IFVJIGBuYW1lYCwgZGVmYXVsdHMgdG8gXCJiZGRcIi5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gYmRkXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS51aSA9IGZ1bmN0aW9uKG5hbWUpe1xuICBuYW1lID0gbmFtZSB8fCAnYmRkJztcbiAgdGhpcy5fdWkgPSBleHBvcnRzLmludGVyZmFjZXNbbmFtZV07XG4gIGlmICghdGhpcy5fdWkpIHRyeSB7IHRoaXMuX3VpID0gcmVxdWlyZShuYW1lKTsgfSBjYXRjaCAoZXJyKSB7fTtcbiAgaWYgKCF0aGlzLl91aSkgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGludGVyZmFjZSBcIicgKyBuYW1lICsgJ1wiJyk7XG4gIHRoaXMuX3VpID0gdGhpcy5fdWkodGhpcy5zdWl0ZSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBMb2FkIHJlZ2lzdGVyZWQgZmlsZXMuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmxvYWRGaWxlcyA9IGZ1bmN0aW9uKGZuKXtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB2YXIgc3VpdGUgPSB0aGlzLnN1aXRlO1xuICB2YXIgcGVuZGluZyA9IHRoaXMuZmlsZXMubGVuZ3RoO1xuICB0aGlzLmZpbGVzLmZvckVhY2goZnVuY3Rpb24oZmlsZSl7XG4gICAgZmlsZSA9IHBhdGgucmVzb2x2ZShmaWxlKTtcbiAgICBzdWl0ZS5lbWl0KCdwcmUtcmVxdWlyZScsIGdsb2JhbCwgZmlsZSwgc2VsZik7XG4gICAgc3VpdGUuZW1pdCgncmVxdWlyZScsIHJlcXVpcmUoZmlsZSksIGZpbGUsIHNlbGYpO1xuICAgIHN1aXRlLmVtaXQoJ3Bvc3QtcmVxdWlyZScsIGdsb2JhbCwgZmlsZSwgc2VsZik7XG4gICAgLS1wZW5kaW5nIHx8IChmbiAmJiBmbigpKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEVuYWJsZSBncm93bCBzdXBwb3J0LlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk1vY2hhLnByb3RvdHlwZS5fZ3Jvd2wgPSBmdW5jdGlvbihydW5uZXIsIHJlcG9ydGVyKSB7XG4gIHZhciBub3RpZnkgPSByZXF1aXJlKCdncm93bCcpO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICB2YXIgc3RhdHMgPSByZXBvcnRlci5zdGF0cztcbiAgICBpZiAoc3RhdHMuZmFpbHVyZXMpIHtcbiAgICAgIHZhciBtc2cgPSBzdGF0cy5mYWlsdXJlcyArICcgb2YgJyArIHJ1bm5lci50b3RhbCArICcgdGVzdHMgZmFpbGVkJztcbiAgICAgIG5vdGlmeShtc2csIHsgbmFtZTogJ21vY2hhJywgdGl0bGU6ICdGYWlsZWQnLCBpbWFnZTogaW1hZ2UoJ2Vycm9yJykgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5vdGlmeShzdGF0cy5wYXNzZXMgKyAnIHRlc3RzIHBhc3NlZCBpbiAnICsgc3RhdHMuZHVyYXRpb24gKyAnbXMnLCB7XG4gICAgICAgICAgbmFtZTogJ21vY2hhJ1xuICAgICAgICAsIHRpdGxlOiAnUGFzc2VkJ1xuICAgICAgICAsIGltYWdlOiBpbWFnZSgnb2snKVxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8qKlxuICogQWRkIHJlZ2V4cCB0byBncmVwLCBpZiBgcmVgIGlzIGEgc3RyaW5nIGl0IGlzIGVzY2FwZWQuXG4gKlxuICogQHBhcmFtIHtSZWdFeHB8U3RyaW5nfSByZVxuICogQHJldHVybiB7TW9jaGF9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS5ncmVwID0gZnVuY3Rpb24ocmUpe1xuICB0aGlzLm9wdGlvbnMuZ3JlcCA9ICdzdHJpbmcnID09IHR5cGVvZiByZVxuICAgID8gbmV3IFJlZ0V4cCh1dGlscy5lc2NhcGVSZWdleHAocmUpKVxuICAgIDogcmU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBJbnZlcnQgYC5ncmVwKClgIG1hdGNoZXMuXG4gKlxuICogQHJldHVybiB7TW9jaGF9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS5pbnZlcnQgPSBmdW5jdGlvbigpe1xuICB0aGlzLm9wdGlvbnMuaW52ZXJ0ID0gdHJ1ZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIElnbm9yZSBnbG9iYWwgbGVha3MuXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBpZ25vcmVcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuaWdub3JlTGVha3MgPSBmdW5jdGlvbihpZ25vcmUpe1xuICB0aGlzLm9wdGlvbnMuaWdub3JlTGVha3MgPSAhIWlnbm9yZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEVuYWJsZSBnbG9iYWwgbGVhayBjaGVja2luZy5cbiAqXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmNoZWNrTGVha3MgPSBmdW5jdGlvbigpe1xuICB0aGlzLm9wdGlvbnMuaWdub3JlTGVha3MgPSBmYWxzZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEVuYWJsZSBncm93bCBzdXBwb3J0LlxuICpcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuZ3Jvd2wgPSBmdW5jdGlvbigpe1xuICB0aGlzLm9wdGlvbnMuZ3Jvd2wgPSB0cnVlO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogSWdub3JlIGBnbG9iYWxzYCBhcnJheSBvciBzdHJpbmcuXG4gKlxuICogQHBhcmFtIHtBcnJheXxTdHJpbmd9IGdsb2JhbHNcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuZ2xvYmFscyA9IGZ1bmN0aW9uKGdsb2JhbHMpe1xuICB0aGlzLm9wdGlvbnMuZ2xvYmFscyA9ICh0aGlzLm9wdGlvbnMuZ2xvYmFscyB8fCBbXSkuY29uY2F0KGdsb2JhbHMpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogRW1pdCBjb2xvciBvdXRwdXQuXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBjb2xvcnNcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUudXNlQ29sb3JzID0gZnVuY3Rpb24oY29sb3JzKXtcbiAgdGhpcy5vcHRpb25zLnVzZUNvbG9ycyA9IGFyZ3VtZW50cy5sZW5ndGggJiYgY29sb3JzICE9IHVuZGVmaW5lZFxuICAgID8gY29sb3JzXG4gICAgOiB0cnVlO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogVXNlIGlubGluZSBkaWZmcyByYXRoZXIgdGhhbiArLy0uXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBpbmxpbmVEaWZmc1xuICogQHJldHVybiB7TW9jaGF9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS51c2VJbmxpbmVEaWZmcyA9IGZ1bmN0aW9uKGlubGluZURpZmZzKSB7XG4gIHRoaXMub3B0aW9ucy51c2VJbmxpbmVEaWZmcyA9IGFyZ3VtZW50cy5sZW5ndGggJiYgaW5saW5lRGlmZnMgIT0gdW5kZWZpbmVkXG4gID8gaW5saW5lRGlmZnNcbiAgOiBmYWxzZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCB0aGUgdGltZW91dCBpbiBtaWxsaXNlY29uZHMuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVvdXRcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUudGltZW91dCA9IGZ1bmN0aW9uKHRpbWVvdXQpe1xuICB0aGlzLnN1aXRlLnRpbWVvdXQodGltZW91dCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgc2xvd25lc3MgdGhyZXNob2xkIGluIG1pbGxpc2Vjb25kcy5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gc2xvd1xuICogQHJldHVybiB7TW9jaGF9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS5zbG93ID0gZnVuY3Rpb24oc2xvdyl7XG4gIHRoaXMuc3VpdGUuc2xvdyhzbG93KTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEVuYWJsZSB0aW1lb3V0cy5cbiAqXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZWRcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuZW5hYmxlVGltZW91dHMgPSBmdW5jdGlvbihlbmFibGVkKSB7XG4gIHRoaXMuc3VpdGUuZW5hYmxlVGltZW91dHMoYXJndW1lbnRzLmxlbmd0aCAmJiBlbmFibGVkICE9PSB1bmRlZmluZWRcbiAgICA/IGVuYWJsZWRcbiAgICA6IHRydWUpO1xuICByZXR1cm4gdGhpc1xufTtcblxuLyoqXG4gKiBNYWtlcyBhbGwgdGVzdHMgYXN5bmMgKGFjY2VwdGluZyBhIGNhbGxiYWNrKVxuICpcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuYXN5bmNPbmx5ID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5vcHRpb25zLmFzeW5jT25seSA9IHRydWU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSdW4gdGVzdHMgYW5kIGludm9rZSBgZm4oKWAgd2hlbiBjb21wbGV0ZS5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UnVubmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24oZm4pe1xuICBpZiAodGhpcy5maWxlcy5sZW5ndGgpIHRoaXMubG9hZEZpbGVzKCk7XG4gIHZhciBzdWl0ZSA9IHRoaXMuc3VpdGU7XG4gIHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuICBvcHRpb25zLmZpbGVzID0gdGhpcy5maWxlcztcbiAgdmFyIHJ1bm5lciA9IG5ldyBleHBvcnRzLlJ1bm5lcihzdWl0ZSk7XG4gIHZhciByZXBvcnRlciA9IG5ldyB0aGlzLl9yZXBvcnRlcihydW5uZXIsIG9wdGlvbnMpO1xuICBydW5uZXIuaWdub3JlTGVha3MgPSBmYWxzZSAhPT0gb3B0aW9ucy5pZ25vcmVMZWFrcztcbiAgcnVubmVyLmFzeW5jT25seSA9IG9wdGlvbnMuYXN5bmNPbmx5O1xuICBpZiAob3B0aW9ucy5ncmVwKSBydW5uZXIuZ3JlcChvcHRpb25zLmdyZXAsIG9wdGlvbnMuaW52ZXJ0KTtcbiAgaWYgKG9wdGlvbnMuZ2xvYmFscykgcnVubmVyLmdsb2JhbHMob3B0aW9ucy5nbG9iYWxzKTtcbiAgaWYgKG9wdGlvbnMuZ3Jvd2wpIHRoaXMuX2dyb3dsKHJ1bm5lciwgcmVwb3J0ZXIpO1xuICBleHBvcnRzLnJlcG9ydGVycy5CYXNlLnVzZUNvbG9ycyA9IG9wdGlvbnMudXNlQ29sb3JzO1xuICBleHBvcnRzLnJlcG9ydGVycy5CYXNlLmlubGluZURpZmZzID0gb3B0aW9ucy51c2VJbmxpbmVEaWZmcztcbiAgcmV0dXJuIHJ1bm5lci5ydW4oZm4pO1xufTtcblxufSk7IC8vIG1vZHVsZTogbW9jaGEuanNcblxucmVxdWlyZS5yZWdpc3RlcihcIm1zLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG4vKipcbiAqIEhlbHBlcnMuXG4gKi9cblxudmFyIHMgPSAxMDAwO1xudmFyIG0gPSBzICogNjA7XG52YXIgaCA9IG0gKiA2MDtcbnZhciBkID0gaCAqIDI0O1xudmFyIHkgPSBkICogMzY1LjI1O1xuXG4vKipcbiAqIFBhcnNlIG9yIGZvcm1hdCB0aGUgZ2l2ZW4gYHZhbGAuXG4gKlxuICogT3B0aW9uczpcbiAqXG4gKiAgLSBgbG9uZ2AgdmVyYm9zZSBmb3JtYXR0aW5nIFtmYWxzZV1cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHZhbFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge1N0cmluZ3xOdW1iZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odmFsLCBvcHRpb25zKXtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgdmFsKSByZXR1cm4gcGFyc2UodmFsKTtcbiAgcmV0dXJuIG9wdGlvbnMubG9uZyA/IGxvbmdGb3JtYXQodmFsKSA6IHNob3J0Rm9ybWF0KHZhbCk7XG59O1xuXG4vKipcbiAqIFBhcnNlIHRoZSBnaXZlbiBgc3RyYCBhbmQgcmV0dXJuIG1pbGxpc2Vjb25kcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYXJzZShzdHIpIHtcbiAgdmFyIG1hdGNoID0gL14oKD86XFxkKyk/XFwuP1xcZCspICoobXN8c2Vjb25kcz98c3xtaW51dGVzP3xtfGhvdXJzP3xofGRheXM/fGR8eWVhcnM/fHkpPyQvaS5leGVjKHN0cik7XG4gIGlmICghbWF0Y2gpIHJldHVybjtcbiAgdmFyIG4gPSBwYXJzZUZsb2F0KG1hdGNoWzFdKTtcbiAgdmFyIHR5cGUgPSAobWF0Y2hbMl0gfHwgJ21zJykudG9Mb3dlckNhc2UoKTtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAneWVhcnMnOlxuICAgIGNhc2UgJ3llYXInOlxuICAgIGNhc2UgJ3knOlxuICAgICAgcmV0dXJuIG4gKiB5O1xuICAgIGNhc2UgJ2RheXMnOlxuICAgIGNhc2UgJ2RheSc6XG4gICAgY2FzZSAnZCc6XG4gICAgICByZXR1cm4gbiAqIGQ7XG4gICAgY2FzZSAnaG91cnMnOlxuICAgIGNhc2UgJ2hvdXInOlxuICAgIGNhc2UgJ2gnOlxuICAgICAgcmV0dXJuIG4gKiBoO1xuICAgIGNhc2UgJ21pbnV0ZXMnOlxuICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgY2FzZSAnbSc6XG4gICAgICByZXR1cm4gbiAqIG07XG4gICAgY2FzZSAnc2Vjb25kcyc6XG4gICAgY2FzZSAnc2Vjb25kJzpcbiAgICBjYXNlICdzJzpcbiAgICAgIHJldHVybiBuICogcztcbiAgICBjYXNlICdtcyc6XG4gICAgICByZXR1cm4gbjtcbiAgfVxufVxuXG4vKipcbiAqIFNob3J0IGZvcm1hdCBmb3IgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNob3J0Rm9ybWF0KG1zKSB7XG4gIGlmIChtcyA+PSBkKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGQpICsgJ2QnO1xuICBpZiAobXMgPj0gaCkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBoKSArICdoJztcbiAgaWYgKG1zID49IG0pIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gbSkgKyAnbSc7XG4gIGlmIChtcyA+PSBzKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIHMpICsgJ3MnO1xuICByZXR1cm4gbXMgKyAnbXMnO1xufVxuXG4vKipcbiAqIExvbmcgZm9ybWF0IGZvciBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbG9uZ0Zvcm1hdChtcykge1xuICByZXR1cm4gcGx1cmFsKG1zLCBkLCAnZGF5JylcbiAgICB8fCBwbHVyYWwobXMsIGgsICdob3VyJylcbiAgICB8fCBwbHVyYWwobXMsIG0sICdtaW51dGUnKVxuICAgIHx8IHBsdXJhbChtcywgcywgJ3NlY29uZCcpXG4gICAgfHwgbXMgKyAnIG1zJztcbn1cblxuLyoqXG4gKiBQbHVyYWxpemF0aW9uIGhlbHBlci5cbiAqL1xuXG5mdW5jdGlvbiBwbHVyYWwobXMsIG4sIG5hbWUpIHtcbiAgaWYgKG1zIDwgbikgcmV0dXJuO1xuICBpZiAobXMgPCBuICogMS41KSByZXR1cm4gTWF0aC5mbG9vcihtcyAvIG4pICsgJyAnICsgbmFtZTtcbiAgcmV0dXJuIE1hdGguY2VpbChtcyAvIG4pICsgJyAnICsgbmFtZSArICdzJztcbn1cblxufSk7IC8vIG1vZHVsZTogbXMuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9iYXNlLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgdHR5ID0gcmVxdWlyZSgnYnJvd3Nlci90dHknKVxuICAsIGRpZmYgPSByZXF1aXJlKCdicm93c2VyL2RpZmYnKVxuICAsIG1zID0gcmVxdWlyZSgnLi4vbXMnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcblxuLyoqXG4gKiBTYXZlIHRpbWVyIHJlZmVyZW5jZXMgdG8gYXZvaWQgU2lub24gaW50ZXJmZXJpbmcgKHNlZSBHSC0yMzcpLlxuICovXG5cbnZhciBEYXRlID0gZ2xvYmFsLkRhdGVcbiAgLCBzZXRUaW1lb3V0ID0gZ2xvYmFsLnNldFRpbWVvdXRcbiAgLCBzZXRJbnRlcnZhbCA9IGdsb2JhbC5zZXRJbnRlcnZhbFxuICAsIGNsZWFyVGltZW91dCA9IGdsb2JhbC5jbGVhclRpbWVvdXRcbiAgLCBjbGVhckludGVydmFsID0gZ2xvYmFsLmNsZWFySW50ZXJ2YWw7XG5cbi8qKlxuICogQ2hlY2sgaWYgYm90aCBzdGRpbyBzdHJlYW1zIGFyZSBhc3NvY2lhdGVkIHdpdGggYSB0dHkuXG4gKi9cblxudmFyIGlzYXR0eSA9IHR0eS5pc2F0dHkoMSkgJiYgdHR5LmlzYXR0eSgyKTtcblxuLyoqXG4gKiBFeHBvc2UgYEJhc2VgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEJhc2U7XG5cbi8qKlxuICogRW5hYmxlIGNvbG9yaW5nIGJ5IGRlZmF1bHQuXG4gKi9cblxuZXhwb3J0cy51c2VDb2xvcnMgPSBpc2F0dHkgfHwgKHByb2Nlc3MuZW52Lk1PQ0hBX0NPTE9SUyAhPT0gdW5kZWZpbmVkKTtcblxuLyoqXG4gKiBJbmxpbmUgZGlmZnMgaW5zdGVhZCBvZiArLy1cbiAqL1xuXG5leHBvcnRzLmlubGluZURpZmZzID0gZmFsc2U7XG5cbi8qKlxuICogRGVmYXVsdCBjb2xvciBtYXAuXG4gKi9cblxuZXhwb3J0cy5jb2xvcnMgPSB7XG4gICAgJ3Bhc3MnOiA5MFxuICAsICdmYWlsJzogMzFcbiAgLCAnYnJpZ2h0IHBhc3MnOiA5MlxuICAsICdicmlnaHQgZmFpbCc6IDkxXG4gICwgJ2JyaWdodCB5ZWxsb3cnOiA5M1xuICAsICdwZW5kaW5nJzogMzZcbiAgLCAnc3VpdGUnOiAwXG4gICwgJ2Vycm9yIHRpdGxlJzogMFxuICAsICdlcnJvciBtZXNzYWdlJzogMzFcbiAgLCAnZXJyb3Igc3RhY2snOiA5MFxuICAsICdjaGVja21hcmsnOiAzMlxuICAsICdmYXN0JzogOTBcbiAgLCAnbWVkaXVtJzogMzNcbiAgLCAnc2xvdyc6IDMxXG4gICwgJ2dyZWVuJzogMzJcbiAgLCAnbGlnaHQnOiA5MFxuICAsICdkaWZmIGd1dHRlcic6IDkwXG4gICwgJ2RpZmYgYWRkZWQnOiA0MlxuICAsICdkaWZmIHJlbW92ZWQnOiA0MVxufTtcblxuLyoqXG4gKiBEZWZhdWx0IHN5bWJvbCBtYXAuXG4gKi9cblxuZXhwb3J0cy5zeW1ib2xzID0ge1xuICBvazogJ+KckycsXG4gIGVycjogJ+KclicsXG4gIGRvdDogJ+KApCdcbn07XG5cbi8vIFdpdGggbm9kZS5qcyBvbiBXaW5kb3dzOiB1c2Ugc3ltYm9scyBhdmFpbGFibGUgaW4gdGVybWluYWwgZGVmYXVsdCBmb250c1xuaWYgKCd3aW4zMicgPT0gcHJvY2Vzcy5wbGF0Zm9ybSkge1xuICBleHBvcnRzLnN5bWJvbHMub2sgPSAnXFx1MjIxQSc7XG4gIGV4cG9ydHMuc3ltYm9scy5lcnIgPSAnXFx1MDBENyc7XG4gIGV4cG9ydHMuc3ltYm9scy5kb3QgPSAnLic7XG59XG5cbi8qKlxuICogQ29sb3IgYHN0cmAgd2l0aCB0aGUgZ2l2ZW4gYHR5cGVgLFxuICogYWxsb3dpbmcgY29sb3JzIHRvIGJlIGRpc2FibGVkLFxuICogYXMgd2VsbCBhcyB1c2VyLWRlZmluZWQgY29sb3JcbiAqIHNjaGVtZXMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbnZhciBjb2xvciA9IGV4cG9ydHMuY29sb3IgPSBmdW5jdGlvbih0eXBlLCBzdHIpIHtcbiAgaWYgKCFleHBvcnRzLnVzZUNvbG9ycykgcmV0dXJuIHN0cjtcbiAgcmV0dXJuICdcXHUwMDFiWycgKyBleHBvcnRzLmNvbG9yc1t0eXBlXSArICdtJyArIHN0ciArICdcXHUwMDFiWzBtJztcbn07XG5cbi8qKlxuICogRXhwb3NlIHRlcm0gd2luZG93IHNpemUsIHdpdGggc29tZVxuICogZGVmYXVsdHMgZm9yIHdoZW4gc3RkZXJyIGlzIG5vdCBhIHR0eS5cbiAqL1xuXG5leHBvcnRzLndpbmRvdyA9IHtcbiAgd2lkdGg6IGlzYXR0eVxuICAgID8gcHJvY2Vzcy5zdGRvdXQuZ2V0V2luZG93U2l6ZVxuICAgICAgPyBwcm9jZXNzLnN0ZG91dC5nZXRXaW5kb3dTaXplKDEpWzBdXG4gICAgICA6IHR0eS5nZXRXaW5kb3dTaXplKClbMV1cbiAgICA6IDc1XG59O1xuXG4vKipcbiAqIEV4cG9zZSBzb21lIGJhc2ljIGN1cnNvciBpbnRlcmFjdGlvbnNcbiAqIHRoYXQgYXJlIGNvbW1vbiBhbW9uZyByZXBvcnRlcnMuXG4gKi9cblxuZXhwb3J0cy5jdXJzb3IgPSB7XG4gIGhpZGU6IGZ1bmN0aW9uKCl7XG4gICAgaXNhdHR5ICYmIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHUwMDFiWz8yNWwnKTtcbiAgfSxcblxuICBzaG93OiBmdW5jdGlvbigpe1xuICAgIGlzYXR0eSAmJiBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFx1MDAxYls/MjVoJyk7XG4gIH0sXG5cbiAgZGVsZXRlTGluZTogZnVuY3Rpb24oKXtcbiAgICBpc2F0dHkgJiYgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1xcdTAwMWJbMksnKTtcbiAgfSxcblxuICBiZWdpbm5pbmdPZkxpbmU6IGZ1bmN0aW9uKCl7XG4gICAgaXNhdHR5ICYmIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHUwMDFiWzBHJyk7XG4gIH0sXG5cbiAgQ1I6IGZ1bmN0aW9uKCl7XG4gICAgaWYgKGlzYXR0eSkge1xuICAgICAgZXhwb3J0cy5jdXJzb3IuZGVsZXRlTGluZSgpO1xuICAgICAgZXhwb3J0cy5jdXJzb3IuYmVnaW5uaW5nT2ZMaW5lKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHInKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogT3V0dXQgdGhlIGdpdmVuIGBmYWlsdXJlc2AgYXMgYSBsaXN0LlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGZhaWx1cmVzXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMubGlzdCA9IGZ1bmN0aW9uKGZhaWx1cmVzKXtcbiAgY29uc29sZS5lcnJvcigpO1xuICBmYWlsdXJlcy5mb3JFYWNoKGZ1bmN0aW9uKHRlc3QsIGkpe1xuICAgIC8vIGZvcm1hdFxuICAgIHZhciBmbXQgPSBjb2xvcignZXJyb3IgdGl0bGUnLCAnICAlcykgJXM6XFxuJylcbiAgICAgICsgY29sb3IoJ2Vycm9yIG1lc3NhZ2UnLCAnICAgICAlcycpXG4gICAgICArIGNvbG9yKCdlcnJvciBzdGFjaycsICdcXG4lc1xcbicpO1xuXG4gICAgLy8gbXNnXG4gICAgdmFyIGVyciA9IHRlc3QuZXJyXG4gICAgICAsIG1lc3NhZ2UgPSBlcnIubWVzc2FnZSB8fCAnJ1xuICAgICAgLCBzdGFjayA9IGVyci5zdGFjayB8fCBtZXNzYWdlXG4gICAgICAsIGluZGV4ID0gc3RhY2suaW5kZXhPZihtZXNzYWdlKSArIG1lc3NhZ2UubGVuZ3RoXG4gICAgICAsIG1zZyA9IHN0YWNrLnNsaWNlKDAsIGluZGV4KVxuICAgICAgLCBhY3R1YWwgPSBlcnIuYWN0dWFsXG4gICAgICAsIGV4cGVjdGVkID0gZXJyLmV4cGVjdGVkXG4gICAgICAsIGVzY2FwZSA9IHRydWU7XG5cbiAgICAvLyB1bmNhdWdodFxuICAgIGlmIChlcnIudW5jYXVnaHQpIHtcbiAgICAgIG1zZyA9ICdVbmNhdWdodCAnICsgbXNnO1xuICAgIH1cblxuICAgIC8vIGV4cGxpY2l0bHkgc2hvdyBkaWZmXG4gICAgaWYgKGVyci5zaG93RGlmZiAmJiBzYW1lVHlwZShhY3R1YWwsIGV4cGVjdGVkKSkge1xuICAgICAgZXNjYXBlID0gZmFsc2U7XG4gICAgICBlcnIuYWN0dWFsID0gYWN0dWFsID0gdXRpbHMuc3RyaW5naWZ5KGFjdHVhbCk7XG4gICAgICBlcnIuZXhwZWN0ZWQgPSBleHBlY3RlZCA9IHV0aWxzLnN0cmluZ2lmeShleHBlY3RlZCk7XG4gICAgfVxuXG4gICAgLy8gYWN0dWFsIC8gZXhwZWN0ZWQgZGlmZlxuICAgIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgYWN0dWFsICYmICdzdHJpbmcnID09IHR5cGVvZiBleHBlY3RlZCkge1xuICAgICAgZm10ID0gY29sb3IoJ2Vycm9yIHRpdGxlJywgJyAgJXMpICVzOlxcbiVzJykgKyBjb2xvcignZXJyb3Igc3RhY2snLCAnXFxuJXNcXG4nKTtcbiAgICAgIHZhciBtYXRjaCA9IG1lc3NhZ2UubWF0Y2goL14oW146XSspOiBleHBlY3RlZC8pO1xuICAgICAgbXNnID0gJ1xcbiAgICAgICcgKyBjb2xvcignZXJyb3IgbWVzc2FnZScsIG1hdGNoID8gbWF0Y2hbMV0gOiBtc2cpO1xuXG4gICAgICBpZiAoZXhwb3J0cy5pbmxpbmVEaWZmcykge1xuICAgICAgICBtc2cgKz0gaW5saW5lRGlmZihlcnIsIGVzY2FwZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtc2cgKz0gdW5pZmllZERpZmYoZXJyLCBlc2NhcGUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGluZGVudCBzdGFjayB0cmFjZSB3aXRob3V0IG1zZ1xuICAgIHN0YWNrID0gc3RhY2suc2xpY2UoaW5kZXggPyBpbmRleCArIDEgOiBpbmRleClcbiAgICAgIC5yZXBsYWNlKC9eL2dtLCAnICAnKTtcblxuICAgIGNvbnNvbGUuZXJyb3IoZm10LCAoaSArIDEpLCB0ZXN0LmZ1bGxUaXRsZSgpLCBtc2csIHN0YWNrKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYEJhc2VgIHJlcG9ydGVyLlxuICpcbiAqIEFsbCBvdGhlciByZXBvcnRlcnMgZ2VuZXJhbGx5XG4gKiBpbmhlcml0IGZyb20gdGhpcyByZXBvcnRlciwgcHJvdmlkaW5nXG4gKiBzdGF0cyBzdWNoIGFzIHRlc3QgZHVyYXRpb24sIG51bWJlclxuICogb2YgdGVzdHMgcGFzc2VkIC8gZmFpbGVkIGV0Yy5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIEJhc2UocnVubmVyKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzID0geyBzdWl0ZXM6IDAsIHRlc3RzOiAwLCBwYXNzZXM6IDAsIHBlbmRpbmc6IDAsIGZhaWx1cmVzOiAwIH1cbiAgICAsIGZhaWx1cmVzID0gdGhpcy5mYWlsdXJlcyA9IFtdO1xuXG4gIGlmICghcnVubmVyKSByZXR1cm47XG4gIHRoaXMucnVubmVyID0gcnVubmVyO1xuXG4gIHJ1bm5lci5zdGF0cyA9IHN0YXRzO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIHN0YXRzLnN0YXJ0ID0gbmV3IERhdGU7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignc3VpdGUnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgc3RhdHMuc3VpdGVzID0gc3RhdHMuc3VpdGVzIHx8IDA7XG4gICAgc3VpdGUucm9vdCB8fCBzdGF0cy5zdWl0ZXMrKztcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHN0YXRzLnRlc3RzID0gc3RhdHMudGVzdHMgfHwgMDtcbiAgICBzdGF0cy50ZXN0cysrO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Bhc3MnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBzdGF0cy5wYXNzZXMgPSBzdGF0cy5wYXNzZXMgfHwgMDtcblxuICAgIHZhciBtZWRpdW0gPSB0ZXN0LnNsb3coKSAvIDI7XG4gICAgdGVzdC5zcGVlZCA9IHRlc3QuZHVyYXRpb24gPiB0ZXN0LnNsb3coKVxuICAgICAgPyAnc2xvdydcbiAgICAgIDogdGVzdC5kdXJhdGlvbiA+IG1lZGl1bVxuICAgICAgICA/ICdtZWRpdW0nXG4gICAgICAgIDogJ2Zhc3QnO1xuXG4gICAgc3RhdHMucGFzc2VzKys7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgc3RhdHMuZmFpbHVyZXMgPSBzdGF0cy5mYWlsdXJlcyB8fCAwO1xuICAgIHN0YXRzLmZhaWx1cmVzKys7XG4gICAgdGVzdC5lcnIgPSBlcnI7XG4gICAgZmFpbHVyZXMucHVzaCh0ZXN0KTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIHN0YXRzLmVuZCA9IG5ldyBEYXRlO1xuICAgIHN0YXRzLmR1cmF0aW9uID0gbmV3IERhdGUgLSBzdGF0cy5zdGFydDtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwZW5kaW5nJywgZnVuY3Rpb24oKXtcbiAgICBzdGF0cy5wZW5kaW5nKys7XG4gIH0pO1xufVxuXG4vKipcbiAqIE91dHB1dCBjb21tb24gZXBpbG9ndWUgdXNlZCBieSBtYW55IG9mXG4gKiB0aGUgYnVuZGxlZCByZXBvcnRlcnMuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5CYXNlLnByb3RvdHlwZS5lcGlsb2d1ZSA9IGZ1bmN0aW9uKCl7XG4gIHZhciBzdGF0cyA9IHRoaXMuc3RhdHM7XG4gIHZhciB0ZXN0cztcbiAgdmFyIGZtdDtcblxuICBjb25zb2xlLmxvZygpO1xuXG4gIC8vIHBhc3Nlc1xuICBmbXQgPSBjb2xvcignYnJpZ2h0IHBhc3MnLCAnICcpXG4gICAgKyBjb2xvcignZ3JlZW4nLCAnICVkIHBhc3NpbmcnKVxuICAgICsgY29sb3IoJ2xpZ2h0JywgJyAoJXMpJyk7XG5cbiAgY29uc29sZS5sb2coZm10LFxuICAgIHN0YXRzLnBhc3NlcyB8fCAwLFxuICAgIG1zKHN0YXRzLmR1cmF0aW9uKSk7XG5cbiAgLy8gcGVuZGluZ1xuICBpZiAoc3RhdHMucGVuZGluZykge1xuICAgIGZtdCA9IGNvbG9yKCdwZW5kaW5nJywgJyAnKVxuICAgICAgKyBjb2xvcigncGVuZGluZycsICcgJWQgcGVuZGluZycpO1xuXG4gICAgY29uc29sZS5sb2coZm10LCBzdGF0cy5wZW5kaW5nKTtcbiAgfVxuXG4gIC8vIGZhaWx1cmVzXG4gIGlmIChzdGF0cy5mYWlsdXJlcykge1xuICAgIGZtdCA9IGNvbG9yKCdmYWlsJywgJyAgJWQgZmFpbGluZycpO1xuXG4gICAgY29uc29sZS5lcnJvcihmbXQsXG4gICAgICBzdGF0cy5mYWlsdXJlcyk7XG5cbiAgICBCYXNlLmxpc3QodGhpcy5mYWlsdXJlcyk7XG4gICAgY29uc29sZS5lcnJvcigpO1xuICB9XG5cbiAgY29uc29sZS5sb2coKTtcbn07XG5cbi8qKlxuICogUGFkIHRoZSBnaXZlbiBgc3RyYCB0byBgbGVuYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcGFyYW0ge1N0cmluZ30gbGVuXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYWQoc3RyLCBsZW4pIHtcbiAgc3RyID0gU3RyaW5nKHN0cik7XG4gIHJldHVybiBBcnJheShsZW4gLSBzdHIubGVuZ3RoICsgMSkuam9pbignICcpICsgc3RyO1xufVxuXG5cbi8qKlxuICogUmV0dXJucyBhbiBpbmxpbmUgZGlmZiBiZXR3ZWVuIDIgc3RyaW5ncyB3aXRoIGNvbG91cmVkIEFOU0kgb3V0cHV0XG4gKlxuICogQHBhcmFtIHtFcnJvcn0gRXJyb3Igd2l0aCBhY3R1YWwvZXhwZWN0ZWRcbiAqIEByZXR1cm4ge1N0cmluZ30gRGlmZlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaW5saW5lRGlmZihlcnIsIGVzY2FwZSkge1xuICB2YXIgbXNnID0gZXJyb3JEaWZmKGVyciwgJ1dvcmRzV2l0aFNwYWNlJywgZXNjYXBlKTtcblxuICAvLyBsaW5lbm9zXG4gIHZhciBsaW5lcyA9IG1zZy5zcGxpdCgnXFxuJyk7XG4gIGlmIChsaW5lcy5sZW5ndGggPiA0KSB7XG4gICAgdmFyIHdpZHRoID0gU3RyaW5nKGxpbmVzLmxlbmd0aCkubGVuZ3RoO1xuICAgIG1zZyA9IGxpbmVzLm1hcChmdW5jdGlvbihzdHIsIGkpe1xuICAgICAgcmV0dXJuIHBhZCgrK2ksIHdpZHRoKSArICcgfCcgKyAnICcgKyBzdHI7XG4gICAgfSkuam9pbignXFxuJyk7XG4gIH1cblxuICAvLyBsZWdlbmRcbiAgbXNnID0gJ1xcbidcbiAgICArIGNvbG9yKCdkaWZmIHJlbW92ZWQnLCAnYWN0dWFsJylcbiAgICArICcgJ1xuICAgICsgY29sb3IoJ2RpZmYgYWRkZWQnLCAnZXhwZWN0ZWQnKVxuICAgICsgJ1xcblxcbidcbiAgICArIG1zZ1xuICAgICsgJ1xcbic7XG5cbiAgLy8gaW5kZW50XG4gIG1zZyA9IG1zZy5yZXBsYWNlKC9eL2dtLCAnICAgICAgJyk7XG4gIHJldHVybiBtc2c7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIHVuaWZpZWQgZGlmZiBiZXR3ZWVuIDIgc3RyaW5nc1xuICpcbiAqIEBwYXJhbSB7RXJyb3J9IEVycm9yIHdpdGggYWN0dWFsL2V4cGVjdGVkXG4gKiBAcmV0dXJuIHtTdHJpbmd9IERpZmZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHVuaWZpZWREaWZmKGVyciwgZXNjYXBlKSB7XG4gIHZhciBpbmRlbnQgPSAnICAgICAgJztcbiAgZnVuY3Rpb24gY2xlYW5VcChsaW5lKSB7XG4gICAgaWYgKGVzY2FwZSkge1xuICAgICAgbGluZSA9IGVzY2FwZUludmlzaWJsZXMobGluZSk7XG4gICAgfVxuICAgIGlmIChsaW5lWzBdID09PSAnKycpIHJldHVybiBpbmRlbnQgKyBjb2xvckxpbmVzKCdkaWZmIGFkZGVkJywgbGluZSk7XG4gICAgaWYgKGxpbmVbMF0gPT09ICctJykgcmV0dXJuIGluZGVudCArIGNvbG9yTGluZXMoJ2RpZmYgcmVtb3ZlZCcsIGxpbmUpO1xuICAgIGlmIChsaW5lLm1hdGNoKC9cXEBcXEAvKSkgcmV0dXJuIG51bGw7XG4gICAgaWYgKGxpbmUubWF0Y2goL1xcXFwgTm8gbmV3bGluZS8pKSByZXR1cm4gbnVsbDtcbiAgICBlbHNlIHJldHVybiBpbmRlbnQgKyBsaW5lO1xuICB9XG4gIGZ1bmN0aW9uIG5vdEJsYW5rKGxpbmUpIHtcbiAgICByZXR1cm4gbGluZSAhPSBudWxsO1xuICB9XG4gIG1zZyA9IGRpZmYuY3JlYXRlUGF0Y2goJ3N0cmluZycsIGVyci5hY3R1YWwsIGVyci5leHBlY3RlZCk7XG4gIHZhciBsaW5lcyA9IG1zZy5zcGxpdCgnXFxuJykuc3BsaWNlKDQpO1xuICByZXR1cm4gJ1xcbiAgICAgICdcbiAgICAgICAgICsgY29sb3JMaW5lcygnZGlmZiBhZGRlZCcsICAgJysgZXhwZWN0ZWQnKSArICcgJ1xuICAgICAgICAgKyBjb2xvckxpbmVzKCdkaWZmIHJlbW92ZWQnLCAnLSBhY3R1YWwnKVxuICAgICAgICAgKyAnXFxuXFxuJ1xuICAgICAgICAgKyBsaW5lcy5tYXAoY2xlYW5VcCkuZmlsdGVyKG5vdEJsYW5rKS5qb2luKCdcXG4nKTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBjaGFyYWN0ZXIgZGlmZiBmb3IgYGVycmAuXG4gKlxuICogQHBhcmFtIHtFcnJvcn0gZXJyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBlcnJvckRpZmYoZXJyLCB0eXBlLCBlc2NhcGUpIHtcbiAgdmFyIGFjdHVhbCAgID0gZXNjYXBlID8gZXNjYXBlSW52aXNpYmxlcyhlcnIuYWN0dWFsKSAgIDogZXJyLmFjdHVhbDtcbiAgdmFyIGV4cGVjdGVkID0gZXNjYXBlID8gZXNjYXBlSW52aXNpYmxlcyhlcnIuZXhwZWN0ZWQpIDogZXJyLmV4cGVjdGVkO1xuICByZXR1cm4gZGlmZlsnZGlmZicgKyB0eXBlXShhY3R1YWwsIGV4cGVjdGVkKS5tYXAoZnVuY3Rpb24oc3RyKXtcbiAgICBpZiAoc3RyLmFkZGVkKSByZXR1cm4gY29sb3JMaW5lcygnZGlmZiBhZGRlZCcsIHN0ci52YWx1ZSk7XG4gICAgaWYgKHN0ci5yZW1vdmVkKSByZXR1cm4gY29sb3JMaW5lcygnZGlmZiByZW1vdmVkJywgc3RyLnZhbHVlKTtcbiAgICByZXR1cm4gc3RyLnZhbHVlO1xuICB9KS5qb2luKCcnKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgc3RyaW5nIHdpdGggYWxsIGludmlzaWJsZSBjaGFyYWN0ZXJzIGluIHBsYWluIHRleHRcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbGluZVxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGVzY2FwZUludmlzaWJsZXMobGluZSkge1xuICAgIHJldHVybiBsaW5lLnJlcGxhY2UoL1xcdC9nLCAnPHRhYj4nKVxuICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcci9nLCAnPENSPicpXG4gICAgICAgICAgICAgICAucmVwbGFjZSgvXFxuL2csICc8TEY+XFxuJyk7XG59XG5cbi8qKlxuICogQ29sb3IgbGluZXMgZm9yIGBzdHJgLCB1c2luZyB0aGUgY29sb3IgYG5hbWVgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBjb2xvckxpbmVzKG5hbWUsIHN0cikge1xuICByZXR1cm4gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24oc3RyKXtcbiAgICByZXR1cm4gY29sb3IobmFtZSwgc3RyKTtcbiAgfSkuam9pbignXFxuJyk7XG59XG5cbi8qKlxuICogQ2hlY2sgdGhhdCBhIC8gYiBoYXZlIHRoZSBzYW1lIHR5cGUuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGFcbiAqIEBwYXJhbSB7T2JqZWN0fSBiXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2FtZVR5cGUoYSwgYikge1xuICBhID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGEpO1xuICBiID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGIpO1xuICByZXR1cm4gYSA9PSBiO1xufVxuXG59KTsgLy8gbW9kdWxlOiByZXBvcnRlcnMvYmFzZS5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL2RvYy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcblxuLyoqXG4gKiBFeHBvc2UgYERvY2AuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gRG9jO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYERvY2AgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBEb2MocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCB0b3RhbCA9IHJ1bm5lci50b3RhbFxuICAgICwgaW5kZW50cyA9IDI7XG5cbiAgZnVuY3Rpb24gaW5kZW50KCkge1xuICAgIHJldHVybiBBcnJheShpbmRlbnRzKS5qb2luKCcgICcpO1xuICB9XG5cbiAgcnVubmVyLm9uKCdzdWl0ZScsIGZ1bmN0aW9uKHN1aXRlKXtcbiAgICBpZiAoc3VpdGUucm9vdCkgcmV0dXJuO1xuICAgICsraW5kZW50cztcbiAgICBjb25zb2xlLmxvZygnJXM8c2VjdGlvbiBjbGFzcz1cInN1aXRlXCI+JywgaW5kZW50KCkpO1xuICAgICsraW5kZW50cztcbiAgICBjb25zb2xlLmxvZygnJXM8aDE+JXM8L2gxPicsIGluZGVudCgpLCB1dGlscy5lc2NhcGUoc3VpdGUudGl0bGUpKTtcbiAgICBjb25zb2xlLmxvZygnJXM8ZGw+JywgaW5kZW50KCkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3N1aXRlIGVuZCcsIGZ1bmN0aW9uKHN1aXRlKXtcbiAgICBpZiAoc3VpdGUucm9vdCkgcmV0dXJuO1xuICAgIGNvbnNvbGUubG9nKCclczwvZGw+JywgaW5kZW50KCkpO1xuICAgIC0taW5kZW50cztcbiAgICBjb25zb2xlLmxvZygnJXM8L3NlY3Rpb24+JywgaW5kZW50KCkpO1xuICAgIC0taW5kZW50cztcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgY29uc29sZS5sb2coJyVzICA8ZHQ+JXM8L2R0PicsIGluZGVudCgpLCB1dGlscy5lc2NhcGUodGVzdC50aXRsZSkpO1xuICAgIHZhciBjb2RlID0gdXRpbHMuZXNjYXBlKHV0aWxzLmNsZWFuKHRlc3QuZm4udG9TdHJpbmcoKSkpO1xuICAgIGNvbnNvbGUubG9nKCclcyAgPGRkPjxwcmU+PGNvZGU+JXM8L2NvZGU+PC9wcmU+PC9kZD4nLCBpbmRlbnQoKSwgY29kZSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgY29uc29sZS5sb2coJyVzICA8ZHQgY2xhc3M9XCJlcnJvclwiPiVzPC9kdD4nLCBpbmRlbnQoKSwgdXRpbHMuZXNjYXBlKHRlc3QudGl0bGUpKTtcbiAgICB2YXIgY29kZSA9IHV0aWxzLmVzY2FwZSh1dGlscy5jbGVhbih0ZXN0LmZuLnRvU3RyaW5nKCkpKTtcbiAgICBjb25zb2xlLmxvZygnJXMgIDxkZCBjbGFzcz1cImVycm9yXCI+PHByZT48Y29kZT4lczwvY29kZT48L3ByZT48L2RkPicsIGluZGVudCgpLCBjb2RlKTtcbiAgICBjb25zb2xlLmxvZygnJXMgIDxkZCBjbGFzcz1cImVycm9yXCI+JXM8L2RkPicsIGluZGVudCgpLCB1dGlscy5lc2NhcGUoZXJyKSk7XG4gIH0pO1xufVxuXG59KTsgLy8gbW9kdWxlOiByZXBvcnRlcnMvZG9jLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvZG90LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgRG90YC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBEb3Q7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgRG90YCBtYXRyaXggdGVzdCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIERvdChydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIHdpZHRoID0gQmFzZS53aW5kb3cud2lkdGggKiAuNzUgfCAwXG4gICAgLCBuID0gLTE7XG5cbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1xcbiAgJyk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGVuZGluZycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGlmICgrK24gJSB3aWR0aCA9PSAwKSBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFxuICAnKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb2xvcigncGVuZGluZycsIEJhc2Uuc3ltYm9scy5kb3QpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgaWYgKCsrbiAlIHdpZHRoID09IDApIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXG4gICcpO1xuICAgIGlmICgnc2xvdycgPT0gdGVzdC5zcGVlZCkge1xuICAgICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29sb3IoJ2JyaWdodCB5ZWxsb3cnLCBCYXNlLnN5bWJvbHMuZG90KSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbG9yKHRlc3Quc3BlZWQsIEJhc2Uuc3ltYm9scy5kb3QpKTtcbiAgICB9XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgaWYgKCsrbiAlIHdpZHRoID09IDApIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXG4gICcpO1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbG9yKCdmYWlsJywgQmFzZS5zeW1ib2xzLmRvdCkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2coKTtcbiAgICBzZWxmLmVwaWxvZ3VlKCk7XG4gIH0pO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcbkRvdC5wcm90b3R5cGUgPSBuZXcgRjtcbkRvdC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBEb3Q7XG5cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2RvdC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL2h0bWwtY292LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgSlNPTkNvdiA9IHJlcXVpcmUoJy4vanNvbi1jb3YnKVxuICAsIGZzID0gcmVxdWlyZSgnYnJvd3Nlci9mcycpO1xuXG4vKipcbiAqIEV4cG9zZSBgSFRNTENvdmAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gSFRNTENvdjtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBKc0NvdmVyYWdlYCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIEhUTUxDb3YocnVubmVyKSB7XG4gIHZhciBqYWRlID0gcmVxdWlyZSgnamFkZScpXG4gICAgLCBmaWxlID0gX19kaXJuYW1lICsgJy90ZW1wbGF0ZXMvY292ZXJhZ2UuamFkZSdcbiAgICAsIHN0ciA9IGZzLnJlYWRGaWxlU3luYyhmaWxlLCAndXRmOCcpXG4gICAgLCBmbiA9IGphZGUuY29tcGlsZShzdHIsIHsgZmlsZW5hbWU6IGZpbGUgfSlcbiAgICAsIHNlbGYgPSB0aGlzO1xuXG4gIEpTT05Db3YuY2FsbCh0aGlzLCBydW5uZXIsIGZhbHNlKTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoZm4oe1xuICAgICAgICBjb3Y6IHNlbGYuY292XG4gICAgICAsIGNvdmVyYWdlQ2xhc3M6IGNvdmVyYWdlQ2xhc3NcbiAgICB9KSk7XG4gIH0pO1xufVxuXG4vKipcbiAqIFJldHVybiBjb3ZlcmFnZSBjbGFzcyBmb3IgYG5gLlxuICpcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNvdmVyYWdlQ2xhc3Mobikge1xuICBpZiAobiA+PSA3NSkgcmV0dXJuICdoaWdoJztcbiAgaWYgKG4gPj0gNTApIHJldHVybiAnbWVkaXVtJztcbiAgaWYgKG4gPj0gMjUpIHJldHVybiAnbG93JztcbiAgcmV0dXJuICd0ZXJyaWJsZSc7XG59XG59KTsgLy8gbW9kdWxlOiByZXBvcnRlcnMvaHRtbC1jb3YuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9odG1sLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpXG4gICwgUHJvZ3Jlc3MgPSByZXF1aXJlKCcuLi9icm93c2VyL3Byb2dyZXNzJylcbiAgLCBlc2NhcGUgPSB1dGlscy5lc2NhcGU7XG5cbi8qKlxuICogU2F2ZSB0aW1lciByZWZlcmVuY2VzIHRvIGF2b2lkIFNpbm9uIGludGVyZmVyaW5nIChzZWUgR0gtMjM3KS5cbiAqL1xuXG52YXIgRGF0ZSA9IGdsb2JhbC5EYXRlXG4gICwgc2V0VGltZW91dCA9IGdsb2JhbC5zZXRUaW1lb3V0XG4gICwgc2V0SW50ZXJ2YWwgPSBnbG9iYWwuc2V0SW50ZXJ2YWxcbiAgLCBjbGVhclRpbWVvdXQgPSBnbG9iYWwuY2xlYXJUaW1lb3V0XG4gICwgY2xlYXJJbnRlcnZhbCA9IGdsb2JhbC5jbGVhckludGVydmFsO1xuXG4vKipcbiAqIEV4cG9zZSBgSFRNTGAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gSFRNTDtcblxuLyoqXG4gKiBTdGF0cyB0ZW1wbGF0ZS5cbiAqL1xuXG52YXIgc3RhdHNUZW1wbGF0ZSA9ICc8dWwgaWQ9XCJtb2NoYS1zdGF0c1wiPidcbiAgKyAnPGxpIGNsYXNzPVwicHJvZ3Jlc3NcIj48Y2FudmFzIHdpZHRoPVwiNDBcIiBoZWlnaHQ9XCI0MFwiPjwvY2FudmFzPjwvbGk+J1xuICArICc8bGkgY2xhc3M9XCJwYXNzZXNcIj48YSBocmVmPVwiI1wiPnBhc3Nlczo8L2E+IDxlbT4wPC9lbT48L2xpPidcbiAgKyAnPGxpIGNsYXNzPVwiZmFpbHVyZXNcIj48YSBocmVmPVwiI1wiPmZhaWx1cmVzOjwvYT4gPGVtPjA8L2VtPjwvbGk+J1xuICArICc8bGkgY2xhc3M9XCJkdXJhdGlvblwiPmR1cmF0aW9uOiA8ZW0+MDwvZW0+czwvbGk+J1xuICArICc8L3VsPic7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgSFRNTGAgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBIVE1MKHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgdG90YWwgPSBydW5uZXIudG90YWxcbiAgICAsIHN0YXQgPSBmcmFnbWVudChzdGF0c1RlbXBsYXRlKVxuICAgICwgaXRlbXMgPSBzdGF0LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdsaScpXG4gICAgLCBwYXNzZXMgPSBpdGVtc1sxXS5nZXRFbGVtZW50c0J5VGFnTmFtZSgnZW0nKVswXVxuICAgICwgcGFzc2VzTGluayA9IGl0ZW1zWzFdLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdhJylbMF1cbiAgICAsIGZhaWx1cmVzID0gaXRlbXNbMl0uZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2VtJylbMF1cbiAgICAsIGZhaWx1cmVzTGluayA9IGl0ZW1zWzJdLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdhJylbMF1cbiAgICAsIGR1cmF0aW9uID0gaXRlbXNbM10uZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2VtJylbMF1cbiAgICAsIGNhbnZhcyA9IHN0YXQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2NhbnZhcycpWzBdXG4gICAgLCByZXBvcnQgPSBmcmFnbWVudCgnPHVsIGlkPVwibW9jaGEtcmVwb3J0XCI+PC91bD4nKVxuICAgICwgc3RhY2sgPSBbcmVwb3J0XVxuICAgICwgcHJvZ3Jlc3NcbiAgICAsIGN0eFxuICAgICwgcm9vdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2NoYScpO1xuXG4gIGlmIChjYW52YXMuZ2V0Q29udGV4dCkge1xuICAgIHZhciByYXRpbyA9IHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvIHx8IDE7XG4gICAgY2FudmFzLnN0eWxlLndpZHRoID0gY2FudmFzLndpZHRoO1xuICAgIGNhbnZhcy5zdHlsZS5oZWlnaHQgPSBjYW52YXMuaGVpZ2h0O1xuICAgIGNhbnZhcy53aWR0aCAqPSByYXRpbztcbiAgICBjYW52YXMuaGVpZ2h0ICo9IHJhdGlvO1xuICAgIGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuICAgIGN0eC5zY2FsZShyYXRpbywgcmF0aW8pO1xuICAgIHByb2dyZXNzID0gbmV3IFByb2dyZXNzO1xuICB9XG5cbiAgaWYgKCFyb290KSByZXR1cm4gZXJyb3IoJyNtb2NoYSBkaXYgbWlzc2luZywgYWRkIGl0IHRvIHlvdXIgZG9jdW1lbnQnKTtcblxuICAvLyBwYXNzIHRvZ2dsZVxuICBvbihwYXNzZXNMaW5rLCAnY2xpY2snLCBmdW5jdGlvbigpe1xuICAgIHVuaGlkZSgpO1xuICAgIHZhciBuYW1lID0gL3Bhc3MvLnRlc3QocmVwb3J0LmNsYXNzTmFtZSkgPyAnJyA6ICcgcGFzcyc7XG4gICAgcmVwb3J0LmNsYXNzTmFtZSA9IHJlcG9ydC5jbGFzc05hbWUucmVwbGFjZSgvZmFpbHxwYXNzL2csICcnKSArIG5hbWU7XG4gICAgaWYgKHJlcG9ydC5jbGFzc05hbWUudHJpbSgpKSBoaWRlU3VpdGVzV2l0aG91dCgndGVzdCBwYXNzJyk7XG4gIH0pO1xuXG4gIC8vIGZhaWx1cmUgdG9nZ2xlXG4gIG9uKGZhaWx1cmVzTGluaywgJ2NsaWNrJywgZnVuY3Rpb24oKXtcbiAgICB1bmhpZGUoKTtcbiAgICB2YXIgbmFtZSA9IC9mYWlsLy50ZXN0KHJlcG9ydC5jbGFzc05hbWUpID8gJycgOiAnIGZhaWwnO1xuICAgIHJlcG9ydC5jbGFzc05hbWUgPSByZXBvcnQuY2xhc3NOYW1lLnJlcGxhY2UoL2ZhaWx8cGFzcy9nLCAnJykgKyBuYW1lO1xuICAgIGlmIChyZXBvcnQuY2xhc3NOYW1lLnRyaW0oKSkgaGlkZVN1aXRlc1dpdGhvdXQoJ3Rlc3QgZmFpbCcpO1xuICB9KTtcblxuICByb290LmFwcGVuZENoaWxkKHN0YXQpO1xuICByb290LmFwcGVuZENoaWxkKHJlcG9ydCk7XG5cbiAgaWYgKHByb2dyZXNzKSBwcm9ncmVzcy5zaXplKDQwKTtcblxuICBydW5uZXIub24oJ3N1aXRlJywgZnVuY3Rpb24oc3VpdGUpe1xuICAgIGlmIChzdWl0ZS5yb290KSByZXR1cm47XG5cbiAgICAvLyBzdWl0ZVxuICAgIHZhciB1cmwgPSBzZWxmLnN1aXRlVVJMKHN1aXRlKTtcbiAgICB2YXIgZWwgPSBmcmFnbWVudCgnPGxpIGNsYXNzPVwic3VpdGVcIj48aDE+PGEgaHJlZj1cIiVzXCI+JXM8L2E+PC9oMT48L2xpPicsIHVybCwgZXNjYXBlKHN1aXRlLnRpdGxlKSk7XG5cbiAgICAvLyBjb250YWluZXJcbiAgICBzdGFja1swXS5hcHBlbmRDaGlsZChlbCk7XG4gICAgc3RhY2sudW5zaGlmdChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd1bCcpKTtcbiAgICBlbC5hcHBlbmRDaGlsZChzdGFja1swXSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignc3VpdGUgZW5kJywgZnVuY3Rpb24oc3VpdGUpe1xuICAgIGlmIChzdWl0ZS5yb290KSByZXR1cm47XG4gICAgc3RhY2suc2hpZnQoKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdmYWlsJywgZnVuY3Rpb24odGVzdCwgZXJyKXtcbiAgICBpZiAoJ2hvb2snID09IHRlc3QudHlwZSkgcnVubmVyLmVtaXQoJ3Rlc3QgZW5kJywgdGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigndGVzdCBlbmQnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICAvLyBUT0RPOiBhZGQgdG8gc3RhdHNcbiAgICB2YXIgcGVyY2VudCA9IHN0YXRzLnRlc3RzIC8gdGhpcy50b3RhbCAqIDEwMCB8IDA7XG4gICAgaWYgKHByb2dyZXNzKSBwcm9ncmVzcy51cGRhdGUocGVyY2VudCkuZHJhdyhjdHgpO1xuXG4gICAgLy8gdXBkYXRlIHN0YXRzXG4gICAgdmFyIG1zID0gbmV3IERhdGUgLSBzdGF0cy5zdGFydDtcbiAgICB0ZXh0KHBhc3Nlcywgc3RhdHMucGFzc2VzKTtcbiAgICB0ZXh0KGZhaWx1cmVzLCBzdGF0cy5mYWlsdXJlcyk7XG4gICAgdGV4dChkdXJhdGlvbiwgKG1zIC8gMTAwMCkudG9GaXhlZCgyKSk7XG5cbiAgICAvLyB0ZXN0XG4gICAgaWYgKCdwYXNzZWQnID09IHRlc3Quc3RhdGUpIHtcbiAgICAgIHZhciB1cmwgPSBzZWxmLnRlc3RVUkwodGVzdCk7XG4gICAgICB2YXIgZWwgPSBmcmFnbWVudCgnPGxpIGNsYXNzPVwidGVzdCBwYXNzICVlXCI+PGgyPiVlPHNwYW4gY2xhc3M9XCJkdXJhdGlvblwiPiVlbXM8L3NwYW4+IDxhIGhyZWY9XCIlc1wiIGNsYXNzPVwicmVwbGF5XCI+4oCjPC9hPjwvaDI+PC9saT4nLCB0ZXN0LnNwZWVkLCB0ZXN0LnRpdGxlLCB0ZXN0LmR1cmF0aW9uLCB1cmwpO1xuICAgIH0gZWxzZSBpZiAodGVzdC5wZW5kaW5nKSB7XG4gICAgICB2YXIgZWwgPSBmcmFnbWVudCgnPGxpIGNsYXNzPVwidGVzdCBwYXNzIHBlbmRpbmdcIj48aDI+JWU8L2gyPjwvbGk+JywgdGVzdC50aXRsZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBlbCA9IGZyYWdtZW50KCc8bGkgY2xhc3M9XCJ0ZXN0IGZhaWxcIj48aDI+JWUgPGEgaHJlZj1cIj9ncmVwPSVlXCIgY2xhc3M9XCJyZXBsYXlcIj7igKM8L2E+PC9oMj48L2xpPicsIHRlc3QudGl0bGUsIGVuY29kZVVSSUNvbXBvbmVudCh0ZXN0LmZ1bGxUaXRsZSgpKSk7XG4gICAgICB2YXIgc3RyID0gdGVzdC5lcnIuc3RhY2sgfHwgdGVzdC5lcnIudG9TdHJpbmcoKTtcblxuICAgICAgLy8gRkYgLyBPcGVyYSBkbyBub3QgYWRkIHRoZSBtZXNzYWdlXG4gICAgICBpZiAoIX5zdHIuaW5kZXhPZih0ZXN0LmVyci5tZXNzYWdlKSkge1xuICAgICAgICBzdHIgPSB0ZXN0LmVyci5tZXNzYWdlICsgJ1xcbicgKyBzdHI7XG4gICAgICB9XG5cbiAgICAgIC8vIDw9SUU3IHN0cmluZ2lmaWVzIHRvIFtPYmplY3QgRXJyb3JdLiBTaW5jZSBpdCBjYW4gYmUgb3ZlcmxvYWRlZCwgd2VcbiAgICAgIC8vIGNoZWNrIGZvciB0aGUgcmVzdWx0IG9mIHRoZSBzdHJpbmdpZnlpbmcuXG4gICAgICBpZiAoJ1tvYmplY3QgRXJyb3JdJyA9PSBzdHIpIHN0ciA9IHRlc3QuZXJyLm1lc3NhZ2U7XG5cbiAgICAgIC8vIFNhZmFyaSBkb2Vzbid0IGdpdmUgeW91IGEgc3RhY2suIExldCdzIGF0IGxlYXN0IHByb3ZpZGUgYSBzb3VyY2UgbGluZS5cbiAgICAgIGlmICghdGVzdC5lcnIuc3RhY2sgJiYgdGVzdC5lcnIuc291cmNlVVJMICYmIHRlc3QuZXJyLmxpbmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBzdHIgKz0gXCJcXG4oXCIgKyB0ZXN0LmVyci5zb3VyY2VVUkwgKyBcIjpcIiArIHRlc3QuZXJyLmxpbmUgKyBcIilcIjtcbiAgICAgIH1cblxuICAgICAgZWwuYXBwZW5kQ2hpbGQoZnJhZ21lbnQoJzxwcmUgY2xhc3M9XCJlcnJvclwiPiVlPC9wcmU+Jywgc3RyKSk7XG4gICAgfVxuXG4gICAgLy8gdG9nZ2xlIGNvZGVcbiAgICAvLyBUT0RPOiBkZWZlclxuICAgIGlmICghdGVzdC5wZW5kaW5nKSB7XG4gICAgICB2YXIgaDIgPSBlbC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaDInKVswXTtcblxuICAgICAgb24oaDIsICdjbGljaycsIGZ1bmN0aW9uKCl7XG4gICAgICAgIHByZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnID09IHByZS5zdHlsZS5kaXNwbGF5XG4gICAgICAgICAgPyAnYmxvY2snXG4gICAgICAgICAgOiAnbm9uZSc7XG4gICAgICB9KTtcblxuICAgICAgdmFyIHByZSA9IGZyYWdtZW50KCc8cHJlPjxjb2RlPiVlPC9jb2RlPjwvcHJlPicsIHV0aWxzLmNsZWFuKHRlc3QuZm4udG9TdHJpbmcoKSkpO1xuICAgICAgZWwuYXBwZW5kQ2hpbGQocHJlKTtcbiAgICAgIHByZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIH1cblxuICAgIC8vIERvbid0IGNhbGwgLmFwcGVuZENoaWxkIGlmICNtb2NoYS1yZXBvcnQgd2FzIGFscmVhZHkgLnNoaWZ0KCknZWQgb2ZmIHRoZSBzdGFjay5cbiAgICBpZiAoc3RhY2tbMF0pIHN0YWNrWzBdLmFwcGVuZENoaWxkKGVsKTtcbiAgfSk7XG59XG5cbi8qKlxuICogUHJvdmlkZSBzdWl0ZSBVUkxcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gW3N1aXRlXVxuICovXG5cbkhUTUwucHJvdG90eXBlLnN1aXRlVVJMID0gZnVuY3Rpb24oc3VpdGUpe1xuICByZXR1cm4gJz9ncmVwPScgKyBlbmNvZGVVUklDb21wb25lbnQoc3VpdGUuZnVsbFRpdGxlKCkpO1xufTtcblxuLyoqXG4gKiBQcm92aWRlIHRlc3QgVVJMXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IFt0ZXN0XVxuICovXG5cbkhUTUwucHJvdG90eXBlLnRlc3RVUkwgPSBmdW5jdGlvbih0ZXN0KXtcbiAgcmV0dXJuICc/Z3JlcD0nICsgZW5jb2RlVVJJQ29tcG9uZW50KHRlc3QuZnVsbFRpdGxlKCkpO1xufTtcblxuLyoqXG4gKiBEaXNwbGF5IGVycm9yIGBtc2dgLlxuICovXG5cbmZ1bmN0aW9uIGVycm9yKG1zZykge1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGZyYWdtZW50KCc8ZGl2IGlkPVwibW9jaGEtZXJyb3JcIj4lczwvZGl2PicsIG1zZykpO1xufVxuXG4vKipcbiAqIFJldHVybiBhIERPTSBmcmFnbWVudCBmcm9tIGBodG1sYC5cbiAqL1xuXG5mdW5jdGlvbiBmcmFnbWVudChodG1sKSB7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzXG4gICAgLCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuICAgICwgaSA9IDE7XG5cbiAgZGl2LmlubmVySFRNTCA9IGh0bWwucmVwbGFjZSgvJShbc2VdKS9nLCBmdW5jdGlvbihfLCB0eXBlKXtcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgIGNhc2UgJ3MnOiByZXR1cm4gU3RyaW5nKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICdlJzogcmV0dXJuIGVzY2FwZShhcmdzW2krK10pO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGRpdi5maXJzdENoaWxkO1xufVxuXG4vKipcbiAqIENoZWNrIGZvciBzdWl0ZXMgdGhhdCBkbyBub3QgaGF2ZSBlbGVtZW50c1xuICogd2l0aCBgY2xhc3NuYW1lYCwgYW5kIGhpZGUgdGhlbS5cbiAqL1xuXG5mdW5jdGlvbiBoaWRlU3VpdGVzV2l0aG91dChjbGFzc25hbWUpIHtcbiAgdmFyIHN1aXRlcyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ3N1aXRlJyk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3VpdGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGVscyA9IHN1aXRlc1tpXS5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKGNsYXNzbmFtZSk7XG4gICAgaWYgKDAgPT0gZWxzLmxlbmd0aCkgc3VpdGVzW2ldLmNsYXNzTmFtZSArPSAnIGhpZGRlbic7XG4gIH1cbn1cblxuLyoqXG4gKiBVbmhpZGUgLmhpZGRlbiBzdWl0ZXMuXG4gKi9cblxuZnVuY3Rpb24gdW5oaWRlKCkge1xuICB2YXIgZWxzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSgnc3VpdGUgaGlkZGVuJyk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZWxzLmxlbmd0aDsgKytpKSB7XG4gICAgZWxzW2ldLmNsYXNzTmFtZSA9IGVsc1tpXS5jbGFzc05hbWUucmVwbGFjZSgnc3VpdGUgaGlkZGVuJywgJ3N1aXRlJyk7XG4gIH1cbn1cblxuLyoqXG4gKiBTZXQgYGVsYCB0ZXh0IHRvIGBzdHJgLlxuICovXG5cbmZ1bmN0aW9uIHRleHQoZWwsIHN0cikge1xuICBpZiAoZWwudGV4dENvbnRlbnQpIHtcbiAgICBlbC50ZXh0Q29udGVudCA9IHN0cjtcbiAgfSBlbHNlIHtcbiAgICBlbC5pbm5lclRleHQgPSBzdHI7XG4gIH1cbn1cblxuLyoqXG4gKiBMaXN0ZW4gb24gYGV2ZW50YCB3aXRoIGNhbGxiYWNrIGBmbmAuXG4gKi9cblxuZnVuY3Rpb24gb24oZWwsIGV2ZW50LCBmbikge1xuICBpZiAoZWwuYWRkRXZlbnRMaXN0ZW5lcikge1xuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsIGZuLCBmYWxzZSk7XG4gIH0gZWxzZSB7XG4gICAgZWwuYXR0YWNoRXZlbnQoJ29uJyArIGV2ZW50LCBmbik7XG4gIH1cbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2h0bWwuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9pbmRleC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG5leHBvcnRzLkJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKTtcbmV4cG9ydHMuRG90ID0gcmVxdWlyZSgnLi9kb3QnKTtcbmV4cG9ydHMuRG9jID0gcmVxdWlyZSgnLi9kb2MnKTtcbmV4cG9ydHMuVEFQID0gcmVxdWlyZSgnLi90YXAnKTtcbmV4cG9ydHMuSlNPTiA9IHJlcXVpcmUoJy4vanNvbicpO1xuZXhwb3J0cy5IVE1MID0gcmVxdWlyZSgnLi9odG1sJyk7XG5leHBvcnRzLkxpc3QgPSByZXF1aXJlKCcuL2xpc3QnKTtcbmV4cG9ydHMuTWluID0gcmVxdWlyZSgnLi9taW4nKTtcbmV4cG9ydHMuU3BlYyA9IHJlcXVpcmUoJy4vc3BlYycpO1xuZXhwb3J0cy5OeWFuID0gcmVxdWlyZSgnLi9ueWFuJyk7XG5leHBvcnRzLlhVbml0ID0gcmVxdWlyZSgnLi94dW5pdCcpO1xuZXhwb3J0cy5NYXJrZG93biA9IHJlcXVpcmUoJy4vbWFya2Rvd24nKTtcbmV4cG9ydHMuUHJvZ3Jlc3MgPSByZXF1aXJlKCcuL3Byb2dyZXNzJyk7XG5leHBvcnRzLkxhbmRpbmcgPSByZXF1aXJlKCcuL2xhbmRpbmcnKTtcbmV4cG9ydHMuSlNPTkNvdiA9IHJlcXVpcmUoJy4vanNvbi1jb3YnKTtcbmV4cG9ydHMuSFRNTENvdiA9IHJlcXVpcmUoJy4vaHRtbC1jb3YnKTtcbmV4cG9ydHMuSlNPTlN0cmVhbSA9IHJlcXVpcmUoJy4vanNvbi1zdHJlYW0nKTtcblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2luZGV4LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvanNvbi1jb3YuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJyk7XG5cbi8qKlxuICogRXhwb3NlIGBKU09OQ292YC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBKU09OQ292O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYEpzQ292ZXJhZ2VgIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gb3V0cHV0XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIEpTT05Db3YocnVubmVyLCBvdXRwdXQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBvdXRwdXQgPSAxID09IGFyZ3VtZW50cy5sZW5ndGggPyB0cnVlIDogb3V0cHV0O1xuXG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciB0ZXN0cyA9IFtdXG4gICAgLCBmYWlsdXJlcyA9IFtdXG4gICAgLCBwYXNzZXMgPSBbXTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24odGVzdCl7XG4gICAgdGVzdHMucHVzaCh0ZXN0KTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgcGFzc2VzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGZhaWx1cmVzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICB2YXIgY292ID0gZ2xvYmFsLl8kanNjb3ZlcmFnZSB8fCB7fTtcbiAgICB2YXIgcmVzdWx0ID0gc2VsZi5jb3YgPSBtYXAoY292KTtcbiAgICByZXN1bHQuc3RhdHMgPSBzZWxmLnN0YXRzO1xuICAgIHJlc3VsdC50ZXN0cyA9IHRlc3RzLm1hcChjbGVhbik7XG4gICAgcmVzdWx0LmZhaWx1cmVzID0gZmFpbHVyZXMubWFwKGNsZWFuKTtcbiAgICByZXN1bHQucGFzc2VzID0gcGFzc2VzLm1hcChjbGVhbik7XG4gICAgaWYgKCFvdXRwdXQpIHJldHVybjtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShKU09OLnN0cmluZ2lmeShyZXN1bHQsIG51bGwsIDIgKSk7XG4gIH0pO1xufVxuXG4vKipcbiAqIE1hcCBqc2NvdmVyYWdlIGRhdGEgdG8gYSBKU09OIHN0cnVjdHVyZVxuICogc3VpdGFibGUgZm9yIHJlcG9ydGluZy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gY292XG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBtYXAoY292KSB7XG4gIHZhciByZXQgPSB7XG4gICAgICBpbnN0cnVtZW50YXRpb246ICdub2RlLWpzY292ZXJhZ2UnXG4gICAgLCBzbG9jOiAwXG4gICAgLCBoaXRzOiAwXG4gICAgLCBtaXNzZXM6IDBcbiAgICAsIGNvdmVyYWdlOiAwXG4gICAgLCBmaWxlczogW11cbiAgfTtcblxuICBmb3IgKHZhciBmaWxlbmFtZSBpbiBjb3YpIHtcbiAgICB2YXIgZGF0YSA9IGNvdmVyYWdlKGZpbGVuYW1lLCBjb3ZbZmlsZW5hbWVdKTtcbiAgICByZXQuZmlsZXMucHVzaChkYXRhKTtcbiAgICByZXQuaGl0cyArPSBkYXRhLmhpdHM7XG4gICAgcmV0Lm1pc3NlcyArPSBkYXRhLm1pc3NlcztcbiAgICByZXQuc2xvYyArPSBkYXRhLnNsb2M7XG4gIH1cblxuICByZXQuZmlsZXMuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgcmV0dXJuIGEuZmlsZW5hbWUubG9jYWxlQ29tcGFyZShiLmZpbGVuYW1lKTtcbiAgfSk7XG5cbiAgaWYgKHJldC5zbG9jID4gMCkge1xuICAgIHJldC5jb3ZlcmFnZSA9IChyZXQuaGl0cyAvIHJldC5zbG9jKSAqIDEwMDtcbiAgfVxuXG4gIHJldHVybiByZXQ7XG59O1xuXG4vKipcbiAqIE1hcCBqc2NvdmVyYWdlIGRhdGEgZm9yIGEgc2luZ2xlIHNvdXJjZSBmaWxlXG4gKiB0byBhIEpTT04gc3RydWN0dXJlIHN1aXRhYmxlIGZvciByZXBvcnRpbmcuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVuYW1lIG5hbWUgb2YgdGhlIHNvdXJjZSBmaWxlXG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YSBqc2NvdmVyYWdlIGNvdmVyYWdlIGRhdGFcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNvdmVyYWdlKGZpbGVuYW1lLCBkYXRhKSB7XG4gIHZhciByZXQgPSB7XG4gICAgZmlsZW5hbWU6IGZpbGVuYW1lLFxuICAgIGNvdmVyYWdlOiAwLFxuICAgIGhpdHM6IDAsXG4gICAgbWlzc2VzOiAwLFxuICAgIHNsb2M6IDAsXG4gICAgc291cmNlOiB7fVxuICB9O1xuXG4gIGRhdGEuc291cmNlLmZvckVhY2goZnVuY3Rpb24obGluZSwgbnVtKXtcbiAgICBudW0rKztcblxuICAgIGlmIChkYXRhW251bV0gPT09IDApIHtcbiAgICAgIHJldC5taXNzZXMrKztcbiAgICAgIHJldC5zbG9jKys7XG4gICAgfSBlbHNlIGlmIChkYXRhW251bV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0LmhpdHMrKztcbiAgICAgIHJldC5zbG9jKys7XG4gICAgfVxuXG4gICAgcmV0LnNvdXJjZVtudW1dID0ge1xuICAgICAgICBzb3VyY2U6IGxpbmVcbiAgICAgICwgY292ZXJhZ2U6IGRhdGFbbnVtXSA9PT0gdW5kZWZpbmVkXG4gICAgICAgID8gJydcbiAgICAgICAgOiBkYXRhW251bV1cbiAgICB9O1xuICB9KTtcblxuICByZXQuY292ZXJhZ2UgPSByZXQuaGl0cyAvIHJldC5zbG9jICogMTAwO1xuXG4gIHJldHVybiByZXQ7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgcGxhaW4tb2JqZWN0IHJlcHJlc2VudGF0aW9uIG9mIGB0ZXN0YFxuICogZnJlZSBvZiBjeWNsaWMgcHJvcGVydGllcyBldGMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHRlc3RcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNsZWFuKHRlc3QpIHtcbiAgcmV0dXJuIHtcbiAgICAgIHRpdGxlOiB0ZXN0LnRpdGxlXG4gICAgLCBmdWxsVGl0bGU6IHRlc3QuZnVsbFRpdGxlKClcbiAgICAsIGR1cmF0aW9uOiB0ZXN0LmR1cmF0aW9uXG4gIH1cbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2pzb24tY292LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvanNvbi1zdHJlYW0uanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBMaXN0YC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBMaXN0O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYExpc3RgIHRlc3QgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBMaXN0KHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgdG90YWwgPSBydW5uZXIudG90YWw7XG5cbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoWydzdGFydCcsIHsgdG90YWw6IHRvdGFsIH1dKSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KFsncGFzcycsIGNsZWFuKHRlc3QpXSkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KFsnZmFpbCcsIGNsZWFuKHRlc3QpXSkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoSlNPTi5zdHJpbmdpZnkoWydlbmQnLCBzZWxmLnN0YXRzXSkpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBwbGFpbi1vYmplY3QgcmVwcmVzZW50YXRpb24gb2YgYHRlc3RgXG4gKiBmcmVlIG9mIGN5Y2xpYyBwcm9wZXJ0aWVzIGV0Yy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gdGVzdFxuICogQHJldHVybiB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gY2xlYW4odGVzdCkge1xuICByZXR1cm4ge1xuICAgICAgdGl0bGU6IHRlc3QudGl0bGVcbiAgICAsIGZ1bGxUaXRsZTogdGVzdC5mdWxsVGl0bGUoKVxuICAgICwgZHVyYXRpb246IHRlc3QuZHVyYXRpb25cbiAgfVxufVxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2pzb24tc3RyZWFtLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvanNvbi5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIGN1cnNvciA9IEJhc2UuY3Vyc29yXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgSlNPTmAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gSlNPTlJlcG9ydGVyO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYEpTT05gIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gSlNPTlJlcG9ydGVyKHJ1bm5lcikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciB0ZXN0cyA9IFtdXG4gICAgLCBmYWlsdXJlcyA9IFtdXG4gICAgLCBwYXNzZXMgPSBbXTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24odGVzdCl7XG4gICAgdGVzdHMucHVzaCh0ZXN0KTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgcGFzc2VzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgZmFpbHVyZXMucHVzaCh0ZXN0KTtcbiAgICBpZiAoZXJyID09PSBPYmplY3QoZXJyKSkge1xuICAgICAgdGVzdC5lcnJNc2cgPSBlcnIubWVzc2FnZTtcbiAgICAgIHRlc3QuZXJyU3RhY2sgPSBlcnIuc3RhY2s7XG4gICAgfVxuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgdmFyIG9iaiA9IHtcbiAgICAgIHN0YXRzOiBzZWxmLnN0YXRzLFxuICAgICAgdGVzdHM6IHRlc3RzLm1hcChjbGVhbiksXG4gICAgICBmYWlsdXJlczogZmFpbHVyZXMubWFwKGNsZWFuKSxcbiAgICAgIHBhc3NlczogcGFzc2VzLm1hcChjbGVhbilcbiAgICB9O1xuICAgIHJ1bm5lci50ZXN0UmVzdWx0cyA9IG9iajtcblxuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKEpTT04uc3RyaW5naWZ5KG9iaiwgbnVsbCwgMikpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBwbGFpbi1vYmplY3QgcmVwcmVzZW50YXRpb24gb2YgYHRlc3RgXG4gKiBmcmVlIG9mIGN5Y2xpYyBwcm9wZXJ0aWVzIGV0Yy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gdGVzdFxuICogQHJldHVybiB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gY2xlYW4odGVzdCkge1xuICByZXR1cm4ge1xuICAgIHRpdGxlOiB0ZXN0LnRpdGxlLFxuICAgIGZ1bGxUaXRsZTogdGVzdC5mdWxsVGl0bGUoKSxcbiAgICBkdXJhdGlvbjogdGVzdC5kdXJhdGlvbixcbiAgICBlcnI6IHRlc3QuZXJyLFxuICAgIGVyclN0YWNrOiB0ZXN0LmVyci5zdGFjayxcbiAgICBlcnJNZXNzYWdlOiB0ZXN0LmVyci5tZXNzYWdlXG4gIH1cbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2pzb24uanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9sYW5kaW5nLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY3Vyc29yID0gQmFzZS5jdXJzb3JcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBMYW5kaW5nYC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBMYW5kaW5nO1xuXG4vKipcbiAqIEFpcnBsYW5lIGNvbG9yLlxuICovXG5cbkJhc2UuY29sb3JzLnBsYW5lID0gMDtcblxuLyoqXG4gKiBBaXJwbGFuZSBjcmFzaCBjb2xvci5cbiAqL1xuXG5CYXNlLmNvbG9yc1sncGxhbmUgY3Jhc2gnXSA9IDMxO1xuXG4vKipcbiAqIFJ1bndheSBjb2xvci5cbiAqL1xuXG5CYXNlLmNvbG9ycy5ydW53YXkgPSA5MDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBMYW5kaW5nYCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIExhbmRpbmcocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCB3aWR0aCA9IEJhc2Uud2luZG93LndpZHRoICogLjc1IHwgMFxuICAgICwgdG90YWwgPSBydW5uZXIudG90YWxcbiAgICAsIHN0cmVhbSA9IHByb2Nlc3Muc3Rkb3V0XG4gICAgLCBwbGFuZSA9IGNvbG9yKCdwbGFuZScsICfinIgnKVxuICAgICwgY3Jhc2hlZCA9IC0xXG4gICAgLCBuID0gMDtcblxuICBmdW5jdGlvbiBydW53YXkoKSB7XG4gICAgdmFyIGJ1ZiA9IEFycmF5KHdpZHRoKS5qb2luKCctJyk7XG4gICAgcmV0dXJuICcgICcgKyBjb2xvcigncnVud2F5JywgYnVmKTtcbiAgfVxuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIHN0cmVhbS53cml0ZSgnXFxuICAnKTtcbiAgICBjdXJzb3IuaGlkZSgpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24odGVzdCl7XG4gICAgLy8gY2hlY2sgaWYgdGhlIHBsYW5lIGNyYXNoZWRcbiAgICB2YXIgY29sID0gLTEgPT0gY3Jhc2hlZFxuICAgICAgPyB3aWR0aCAqICsrbiAvIHRvdGFsIHwgMFxuICAgICAgOiBjcmFzaGVkO1xuXG4gICAgLy8gc2hvdyB0aGUgY3Jhc2hcbiAgICBpZiAoJ2ZhaWxlZCcgPT0gdGVzdC5zdGF0ZSkge1xuICAgICAgcGxhbmUgPSBjb2xvcigncGxhbmUgY3Jhc2gnLCAn4pyIJyk7XG4gICAgICBjcmFzaGVkID0gY29sO1xuICAgIH1cblxuICAgIC8vIHJlbmRlciBsYW5kaW5nIHN0cmlwXG4gICAgc3RyZWFtLndyaXRlKCdcXHUwMDFiWzRGXFxuXFxuJyk7XG4gICAgc3RyZWFtLndyaXRlKHJ1bndheSgpKTtcbiAgICBzdHJlYW0ud3JpdGUoJ1xcbiAgJyk7XG4gICAgc3RyZWFtLndyaXRlKGNvbG9yKCdydW53YXknLCBBcnJheShjb2wpLmpvaW4oJ+KLhScpKSk7XG4gICAgc3RyZWFtLndyaXRlKHBsYW5lKVxuICAgIHN0cmVhbS53cml0ZShjb2xvcigncnVud2F5JywgQXJyYXkod2lkdGggLSBjb2wpLmpvaW4oJ+KLhScpICsgJ1xcbicpKTtcbiAgICBzdHJlYW0ud3JpdGUocnVud2F5KCkpO1xuICAgIHN0cmVhbS53cml0ZSgnXFx1MDAxYlswbScpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgY3Vyc29yLnNob3coKTtcbiAgICBjb25zb2xlLmxvZygpO1xuICAgIHNlbGYuZXBpbG9ndWUoKTtcbiAgfSk7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBCYXNlLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEJhc2UucHJvdG90eXBlO1xuTGFuZGluZy5wcm90b3R5cGUgPSBuZXcgRjtcbkxhbmRpbmcucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gTGFuZGluZztcblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2xhbmRpbmcuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9saXN0LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY3Vyc29yID0gQmFzZS5jdXJzb3JcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBMaXN0YC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBMaXN0O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYExpc3RgIHRlc3QgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBMaXN0KHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgbiA9IDA7XG5cbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2coKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCd0ZXN0JywgZnVuY3Rpb24odGVzdCl7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29sb3IoJ3Bhc3MnLCAnICAgICcgKyB0ZXN0LmZ1bGxUaXRsZSgpICsgJzogJykpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB2YXIgZm10ID0gY29sb3IoJ2NoZWNrbWFyaycsICcgIC0nKVxuICAgICAgKyBjb2xvcigncGVuZGluZycsICcgJXMnKTtcbiAgICBjb25zb2xlLmxvZyhmbXQsIHRlc3QuZnVsbFRpdGxlKCkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Bhc3MnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB2YXIgZm10ID0gY29sb3IoJ2NoZWNrbWFyaycsICcgICcrQmFzZS5zeW1ib2xzLmRvdClcbiAgICAgICsgY29sb3IoJ3Bhc3MnLCAnICVzOiAnKVxuICAgICAgKyBjb2xvcih0ZXN0LnNwZWVkLCAnJWRtcycpO1xuICAgIGN1cnNvci5DUigpO1xuICAgIGNvbnNvbGUubG9nKGZtdCwgdGVzdC5mdWxsVGl0bGUoKSwgdGVzdC5kdXJhdGlvbik7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgY3Vyc29yLkNSKCk7XG4gICAgY29uc29sZS5sb2coY29sb3IoJ2ZhaWwnLCAnICAlZCkgJXMnKSwgKytuLCB0ZXN0LmZ1bGxUaXRsZSgpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBzZWxmLmVwaWxvZ3VlLmJpbmQoc2VsZikpO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcbkxpc3QucHJvdG90eXBlID0gbmV3IEY7XG5MaXN0LnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IExpc3Q7XG5cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2xpc3QuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9tYXJrZG93bi5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbi8qKlxuICogRXhwb3NlIGBNYXJrZG93bmAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gTWFya2Rvd247XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgTWFya2Rvd25gIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gTWFya2Rvd24ocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCBsZXZlbCA9IDBcbiAgICAsIGJ1ZiA9ICcnO1xuXG4gIGZ1bmN0aW9uIHRpdGxlKHN0cikge1xuICAgIHJldHVybiBBcnJheShsZXZlbCkuam9pbignIycpICsgJyAnICsgc3RyO1xuICB9XG5cbiAgZnVuY3Rpb24gaW5kZW50KCkge1xuICAgIHJldHVybiBBcnJheShsZXZlbCkuam9pbignICAnKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG1hcFRPQyhzdWl0ZSwgb2JqKSB7XG4gICAgdmFyIHJldCA9IG9iajtcbiAgICBvYmogPSBvYmpbc3VpdGUudGl0bGVdID0gb2JqW3N1aXRlLnRpdGxlXSB8fCB7IHN1aXRlOiBzdWl0ZSB9O1xuICAgIHN1aXRlLnN1aXRlcy5mb3JFYWNoKGZ1bmN0aW9uKHN1aXRlKXtcbiAgICAgIG1hcFRPQyhzdWl0ZSwgb2JqKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgZnVuY3Rpb24gc3RyaW5naWZ5VE9DKG9iaiwgbGV2ZWwpIHtcbiAgICArK2xldmVsO1xuICAgIHZhciBidWYgPSAnJztcbiAgICB2YXIgbGluaztcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoJ3N1aXRlJyA9PSBrZXkpIGNvbnRpbnVlO1xuICAgICAgaWYgKGtleSkgbGluayA9ICcgLSBbJyArIGtleSArICddKCMnICsgdXRpbHMuc2x1ZyhvYmpba2V5XS5zdWl0ZS5mdWxsVGl0bGUoKSkgKyAnKVxcbic7XG4gICAgICBpZiAoa2V5KSBidWYgKz0gQXJyYXkobGV2ZWwpLmpvaW4oJyAgJykgKyBsaW5rO1xuICAgICAgYnVmICs9IHN0cmluZ2lmeVRPQyhvYmpba2V5XSwgbGV2ZWwpO1xuICAgIH1cbiAgICAtLWxldmVsO1xuICAgIHJldHVybiBidWY7XG4gIH1cblxuICBmdW5jdGlvbiBnZW5lcmF0ZVRPQyhzdWl0ZSkge1xuICAgIHZhciBvYmogPSBtYXBUT0Moc3VpdGUsIHt9KTtcbiAgICByZXR1cm4gc3RyaW5naWZ5VE9DKG9iaiwgMCk7XG4gIH1cblxuICBnZW5lcmF0ZVRPQyhydW5uZXIuc3VpdGUpO1xuXG4gIHJ1bm5lci5vbignc3VpdGUnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgKytsZXZlbDtcbiAgICB2YXIgc2x1ZyA9IHV0aWxzLnNsdWcoc3VpdGUuZnVsbFRpdGxlKCkpO1xuICAgIGJ1ZiArPSAnPGEgbmFtZT1cIicgKyBzbHVnICsgJ1wiPjwvYT4nICsgJ1xcbic7XG4gICAgYnVmICs9IHRpdGxlKHN1aXRlLnRpdGxlKSArICdcXG4nO1xuICB9KTtcblxuICBydW5uZXIub24oJ3N1aXRlIGVuZCcsIGZ1bmN0aW9uKHN1aXRlKXtcbiAgICAtLWxldmVsO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Bhc3MnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB2YXIgY29kZSA9IHV0aWxzLmNsZWFuKHRlc3QuZm4udG9TdHJpbmcoKSk7XG4gICAgYnVmICs9IHRlc3QudGl0bGUgKyAnLlxcbic7XG4gICAgYnVmICs9ICdcXG5gYGBqc1xcbic7XG4gICAgYnVmICs9IGNvZGUgKyAnXFxuJztcbiAgICBidWYgKz0gJ2BgYFxcblxcbic7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnIyBUT0NcXG4nKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShnZW5lcmF0ZVRPQyhydW5uZXIuc3VpdGUpKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShidWYpO1xuICB9KTtcbn1cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9tYXJrZG93bi5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL21pbi5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKTtcblxuLyoqXG4gKiBFeHBvc2UgYE1pbmAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gTWluO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYE1pbmAgbWluaW1hbCB0ZXN0IHJlcG9ydGVyIChiZXN0IHVzZWQgd2l0aCAtLXdhdGNoKS5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIE1pbihydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgLy8gY2xlYXIgc2NyZWVuXG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1xcdTAwMWJbMkonKTtcbiAgICAvLyBzZXQgY3Vyc29yIHBvc2l0aW9uXG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1xcdTAwMWJbMTszSCcpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIHRoaXMuZXBpbG9ndWUuYmluZCh0aGlzKSk7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBCYXNlLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEJhc2UucHJvdG90eXBlO1xuTWluLnByb3RvdHlwZSA9IG5ldyBGO1xuTWluLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IE1pbjtcblxuXG59KTsgLy8gbW9kdWxlOiByZXBvcnRlcnMvbWluLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvbnlhbi5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBEb3RgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IE55YW5DYXQ7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgRG90YCBtYXRyaXggdGVzdCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIE55YW5DYXQocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgd2lkdGggPSBCYXNlLndpbmRvdy53aWR0aCAqIC43NSB8IDBcbiAgICAsIHJhaW5ib3dDb2xvcnMgPSB0aGlzLnJhaW5ib3dDb2xvcnMgPSBzZWxmLmdlbmVyYXRlQ29sb3JzKClcbiAgICAsIGNvbG9ySW5kZXggPSB0aGlzLmNvbG9ySW5kZXggPSAwXG4gICAgLCBudW1lck9mTGluZXMgPSB0aGlzLm51bWJlck9mTGluZXMgPSA0XG4gICAgLCB0cmFqZWN0b3JpZXMgPSB0aGlzLnRyYWplY3RvcmllcyA9IFtbXSwgW10sIFtdLCBbXV1cbiAgICAsIG55YW5DYXRXaWR0aCA9IHRoaXMubnlhbkNhdFdpZHRoID0gMTFcbiAgICAsIHRyYWplY3RvcnlXaWR0aE1heCA9IHRoaXMudHJhamVjdG9yeVdpZHRoTWF4ID0gKHdpZHRoIC0gbnlhbkNhdFdpZHRoKVxuICAgICwgc2NvcmVib2FyZFdpZHRoID0gdGhpcy5zY29yZWJvYXJkV2lkdGggPSA1XG4gICAgLCB0aWNrID0gdGhpcy50aWNrID0gMFxuICAgICwgbiA9IDA7XG5cbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgQmFzZS5jdXJzb3IuaGlkZSgpO1xuICAgIHNlbGYuZHJhdygpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBzZWxmLmRyYXcoKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgc2VsZi5kcmF3KCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgc2VsZi5kcmF3KCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICBCYXNlLmN1cnNvci5zaG93KCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLm51bWJlck9mTGluZXM7IGkrKykgd3JpdGUoJ1xcbicpO1xuICAgIHNlbGYuZXBpbG9ndWUoKTtcbiAgfSk7XG59XG5cbi8qKlxuICogRHJhdyB0aGUgbnlhbiBjYXRcbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5kcmF3ID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5hcHBlbmRSYWluYm93KCk7XG4gIHRoaXMuZHJhd1Njb3JlYm9hcmQoKTtcbiAgdGhpcy5kcmF3UmFpbmJvdygpO1xuICB0aGlzLmRyYXdOeWFuQ2F0KCk7XG4gIHRoaXMudGljayA9ICF0aGlzLnRpY2s7XG59O1xuXG4vKipcbiAqIERyYXcgdGhlIFwic2NvcmVib2FyZFwiIHNob3dpbmcgdGhlIG51bWJlclxuICogb2YgcGFzc2VzLCBmYWlsdXJlcyBhbmQgcGVuZGluZyB0ZXN0cy5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5kcmF3U2NvcmVib2FyZCA9IGZ1bmN0aW9uKCl7XG4gIHZhciBzdGF0cyA9IHRoaXMuc3RhdHM7XG4gIHZhciBjb2xvcnMgPSBCYXNlLmNvbG9ycztcblxuICBmdW5jdGlvbiBkcmF3KGNvbG9yLCBuKSB7XG4gICAgd3JpdGUoJyAnKTtcbiAgICB3cml0ZSgnXFx1MDAxYlsnICsgY29sb3IgKyAnbScgKyBuICsgJ1xcdTAwMWJbMG0nKTtcbiAgICB3cml0ZSgnXFxuJyk7XG4gIH1cblxuICBkcmF3KGNvbG9ycy5ncmVlbiwgc3RhdHMucGFzc2VzKTtcbiAgZHJhdyhjb2xvcnMuZmFpbCwgc3RhdHMuZmFpbHVyZXMpO1xuICBkcmF3KGNvbG9ycy5wZW5kaW5nLCBzdGF0cy5wZW5kaW5nKTtcbiAgd3JpdGUoJ1xcbicpO1xuXG4gIHRoaXMuY3Vyc29yVXAodGhpcy5udW1iZXJPZkxpbmVzKTtcbn07XG5cbi8qKlxuICogQXBwZW5kIHRoZSByYWluYm93LlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk55YW5DYXQucHJvdG90eXBlLmFwcGVuZFJhaW5ib3cgPSBmdW5jdGlvbigpe1xuICB2YXIgc2VnbWVudCA9IHRoaXMudGljayA/ICdfJyA6ICctJztcbiAgdmFyIHJhaW5ib3dpZmllZCA9IHRoaXMucmFpbmJvd2lmeShzZWdtZW50KTtcblxuICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgdGhpcy5udW1iZXJPZkxpbmVzOyBpbmRleCsrKSB7XG4gICAgdmFyIHRyYWplY3RvcnkgPSB0aGlzLnRyYWplY3Rvcmllc1tpbmRleF07XG4gICAgaWYgKHRyYWplY3RvcnkubGVuZ3RoID49IHRoaXMudHJhamVjdG9yeVdpZHRoTWF4KSB0cmFqZWN0b3J5LnNoaWZ0KCk7XG4gICAgdHJhamVjdG9yeS5wdXNoKHJhaW5ib3dpZmllZCk7XG4gIH1cbn07XG5cbi8qKlxuICogRHJhdyB0aGUgcmFpbmJvdy5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5kcmF3UmFpbmJvdyA9IGZ1bmN0aW9uKCl7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICB0aGlzLnRyYWplY3Rvcmllcy5mb3JFYWNoKGZ1bmN0aW9uKGxpbmUsIGluZGV4KSB7XG4gICAgd3JpdGUoJ1xcdTAwMWJbJyArIHNlbGYuc2NvcmVib2FyZFdpZHRoICsgJ0MnKTtcbiAgICB3cml0ZShsaW5lLmpvaW4oJycpKTtcbiAgICB3cml0ZSgnXFxuJyk7XG4gIH0pO1xuXG4gIHRoaXMuY3Vyc29yVXAodGhpcy5udW1iZXJPZkxpbmVzKTtcbn07XG5cbi8qKlxuICogRHJhdyB0aGUgbnlhbiBjYXRcbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5kcmF3TnlhbkNhdCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHZhciBzdGFydFdpZHRoID0gdGhpcy5zY29yZWJvYXJkV2lkdGggKyB0aGlzLnRyYWplY3Rvcmllc1swXS5sZW5ndGg7XG4gIHZhciBjb2xvciA9ICdcXHUwMDFiWycgKyBzdGFydFdpZHRoICsgJ0MnO1xuICB2YXIgcGFkZGluZyA9ICcnO1xuXG4gIHdyaXRlKGNvbG9yKTtcbiAgd3JpdGUoJ18sLS0tLS0tLCcpO1xuICB3cml0ZSgnXFxuJyk7XG5cbiAgd3JpdGUoY29sb3IpO1xuICBwYWRkaW5nID0gc2VsZi50aWNrID8gJyAgJyA6ICcgICAnO1xuICB3cml0ZSgnX3wnICsgcGFkZGluZyArICcvXFxcXF8vXFxcXCAnKTtcbiAgd3JpdGUoJ1xcbicpO1xuXG4gIHdyaXRlKGNvbG9yKTtcbiAgcGFkZGluZyA9IHNlbGYudGljayA/ICdfJyA6ICdfXyc7XG4gIHZhciB0YWlsID0gc2VsZi50aWNrID8gJ34nIDogJ14nO1xuICB2YXIgZmFjZTtcbiAgd3JpdGUodGFpbCArICd8JyArIHBhZGRpbmcgKyB0aGlzLmZhY2UoKSArICcgJyk7XG4gIHdyaXRlKCdcXG4nKTtcblxuICB3cml0ZShjb2xvcik7XG4gIHBhZGRpbmcgPSBzZWxmLnRpY2sgPyAnICcgOiAnICAnO1xuICB3cml0ZShwYWRkaW5nICsgJ1wiXCIgIFwiXCIgJyk7XG4gIHdyaXRlKCdcXG4nKTtcblxuICB0aGlzLmN1cnNvclVwKHRoaXMubnVtYmVyT2ZMaW5lcyk7XG59O1xuXG4vKipcbiAqIERyYXcgbnlhbiBjYXQgZmFjZS5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5mYWNlID0gZnVuY3Rpb24oKSB7XG4gIHZhciBzdGF0cyA9IHRoaXMuc3RhdHM7XG4gIGlmIChzdGF0cy5mYWlsdXJlcykge1xuICAgIHJldHVybiAnKCB4IC54KSc7XG4gIH0gZWxzZSBpZiAoc3RhdHMucGVuZGluZykge1xuICAgIHJldHVybiAnKCBvIC5vKSc7XG4gIH0gZWxzZSBpZihzdGF0cy5wYXNzZXMpIHtcbiAgICByZXR1cm4gJyggXiAuXiknO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiAnKCAtIC4tKSc7XG4gIH1cbn1cblxuLyoqXG4gKiBNb3ZlIGN1cnNvciB1cCBgbmAuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk55YW5DYXQucHJvdG90eXBlLmN1cnNvclVwID0gZnVuY3Rpb24obikge1xuICB3cml0ZSgnXFx1MDAxYlsnICsgbiArICdBJyk7XG59O1xuXG4vKipcbiAqIE1vdmUgY3Vyc29yIGRvd24gYG5gLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5jdXJzb3JEb3duID0gZnVuY3Rpb24obikge1xuICB3cml0ZSgnXFx1MDAxYlsnICsgbiArICdCJyk7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlIHJhaW5ib3cgY29sb3JzLlxuICpcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuZ2VuZXJhdGVDb2xvcnMgPSBmdW5jdGlvbigpe1xuICB2YXIgY29sb3JzID0gW107XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCAoNiAqIDcpOyBpKyspIHtcbiAgICB2YXIgcGkzID0gTWF0aC5mbG9vcihNYXRoLlBJIC8gMyk7XG4gICAgdmFyIG4gPSAoaSAqICgxLjAgLyA2KSk7XG4gICAgdmFyIHIgPSBNYXRoLmZsb29yKDMgKiBNYXRoLnNpbihuKSArIDMpO1xuICAgIHZhciBnID0gTWF0aC5mbG9vcigzICogTWF0aC5zaW4obiArIDIgKiBwaTMpICsgMyk7XG4gICAgdmFyIGIgPSBNYXRoLmZsb29yKDMgKiBNYXRoLnNpbihuICsgNCAqIHBpMykgKyAzKTtcbiAgICBjb2xvcnMucHVzaCgzNiAqIHIgKyA2ICogZyArIGIgKyAxNik7XG4gIH1cblxuICByZXR1cm4gY29sb3JzO1xufTtcblxuLyoqXG4gKiBBcHBseSByYWluYm93IHRvIHRoZSBnaXZlbiBgc3RyYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5yYWluYm93aWZ5ID0gZnVuY3Rpb24oc3RyKXtcbiAgdmFyIGNvbG9yID0gdGhpcy5yYWluYm93Q29sb3JzW3RoaXMuY29sb3JJbmRleCAlIHRoaXMucmFpbmJvd0NvbG9ycy5sZW5ndGhdO1xuICB0aGlzLmNvbG9ySW5kZXggKz0gMTtcbiAgcmV0dXJuICdcXHUwMDFiWzM4OzU7JyArIGNvbG9yICsgJ20nICsgc3RyICsgJ1xcdTAwMWJbMG0nO1xufTtcblxuLyoqXG4gKiBTdGRvdXQgaGVscGVyLlxuICovXG5cbmZ1bmN0aW9uIHdyaXRlKHN0cmluZykge1xuICBwcm9jZXNzLnN0ZG91dC53cml0ZShzdHJpbmcpO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcbk55YW5DYXQucHJvdG90eXBlID0gbmV3IEY7XG5OeWFuQ2F0LnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IE55YW5DYXQ7XG5cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL255YW4uanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9wcm9ncmVzcy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCBjdXJzb3IgPSBCYXNlLmN1cnNvclxuICAsIGNvbG9yID0gQmFzZS5jb2xvcjtcblxuLyoqXG4gKiBFeHBvc2UgYFByb2dyZXNzYC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBQcm9ncmVzcztcblxuLyoqXG4gKiBHZW5lcmFsIHByb2dyZXNzIGJhciBjb2xvci5cbiAqL1xuXG5CYXNlLmNvbG9ycy5wcm9ncmVzcyA9IDkwO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFByb2dyZXNzYCBiYXIgdGVzdCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBQcm9ncmVzcyhydW5uZXIsIG9wdGlvbnMpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCB3aWR0aCA9IEJhc2Uud2luZG93LndpZHRoICogLjUwIHwgMFxuICAgICwgdG90YWwgPSBydW5uZXIudG90YWxcbiAgICAsIGNvbXBsZXRlID0gMFxuICAgICwgbWF4ID0gTWF0aC5tYXhcbiAgICAsIGxhc3ROID0gLTE7XG5cbiAgLy8gZGVmYXVsdCBjaGFyc1xuICBvcHRpb25zLm9wZW4gPSBvcHRpb25zLm9wZW4gfHwgJ1snO1xuICBvcHRpb25zLmNvbXBsZXRlID0gb3B0aW9ucy5jb21wbGV0ZSB8fCAn4pasJztcbiAgb3B0aW9ucy5pbmNvbXBsZXRlID0gb3B0aW9ucy5pbmNvbXBsZXRlIHx8IEJhc2Uuc3ltYm9scy5kb3Q7XG4gIG9wdGlvbnMuY2xvc2UgPSBvcHRpb25zLmNsb3NlIHx8ICddJztcbiAgb3B0aW9ucy52ZXJib3NlID0gZmFsc2U7XG5cbiAgLy8gdGVzdHMgc3RhcnRlZFxuICBydW5uZXIub24oJ3N0YXJ0JywgZnVuY3Rpb24oKXtcbiAgICBjb25zb2xlLmxvZygpO1xuICAgIGN1cnNvci5oaWRlKCk7XG4gIH0pO1xuXG4gIC8vIHRlc3RzIGNvbXBsZXRlXG4gIHJ1bm5lci5vbigndGVzdCBlbmQnLCBmdW5jdGlvbigpe1xuICAgIGNvbXBsZXRlKys7XG4gICAgdmFyIGluY29tcGxldGUgPSB0b3RhbCAtIGNvbXBsZXRlXG4gICAgICAsIHBlcmNlbnQgPSBjb21wbGV0ZSAvIHRvdGFsXG4gICAgICAsIG4gPSB3aWR0aCAqIHBlcmNlbnQgfCAwXG4gICAgICAsIGkgPSB3aWR0aCAtIG47XG5cbiAgICBpZiAobGFzdE4gPT09IG4gJiYgIW9wdGlvbnMudmVyYm9zZSkge1xuICAgICAgLy8gRG9uJ3QgcmUtcmVuZGVyIHRoZSBsaW5lIGlmIGl0IGhhc24ndCBjaGFuZ2VkXG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxhc3ROID0gbjtcblxuICAgIGN1cnNvci5DUigpO1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHUwMDFiW0onKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb2xvcigncHJvZ3Jlc3MnLCAnICAnICsgb3B0aW9ucy5vcGVuKSk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoQXJyYXkobikuam9pbihvcHRpb25zLmNvbXBsZXRlKSk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoQXJyYXkoaSkuam9pbihvcHRpb25zLmluY29tcGxldGUpKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb2xvcigncHJvZ3Jlc3MnLCBvcHRpb25zLmNsb3NlKSk7XG4gICAgaWYgKG9wdGlvbnMudmVyYm9zZSkge1xuICAgICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29sb3IoJ3Byb2dyZXNzJywgJyAnICsgY29tcGxldGUgKyAnIG9mICcgKyB0b3RhbCkpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gdGVzdHMgYXJlIGNvbXBsZXRlLCBvdXRwdXQgc29tZSBzdGF0c1xuICAvLyBhbmQgdGhlIGZhaWx1cmVzIGlmIGFueVxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgY3Vyc29yLnNob3coKTtcbiAgICBjb25zb2xlLmxvZygpO1xuICAgIHNlbGYuZXBpbG9ndWUoKTtcbiAgfSk7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBCYXNlLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEJhc2UucHJvdG90eXBlO1xuUHJvZ3Jlc3MucHJvdG90eXBlID0gbmV3IEY7XG5Qcm9ncmVzcy5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBQcm9ncmVzcztcblxuXG59KTsgLy8gbW9kdWxlOiByZXBvcnRlcnMvcHJvZ3Jlc3MuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9zcGVjLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY3Vyc29yID0gQmFzZS5jdXJzb3JcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBTcGVjYC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBTcGVjO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFNwZWNgIHRlc3QgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBTcGVjKHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgaW5kZW50cyA9IDBcbiAgICAsIG4gPSAwO1xuXG4gIGZ1bmN0aW9uIGluZGVudCgpIHtcbiAgICByZXR1cm4gQXJyYXkoaW5kZW50cykuam9pbignICAnKVxuICB9XG5cbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2coKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZScsIGZ1bmN0aW9uKHN1aXRlKXtcbiAgICArK2luZGVudHM7XG4gICAgY29uc29sZS5sb2coY29sb3IoJ3N1aXRlJywgJyVzJXMnKSwgaW5kZW50KCksIHN1aXRlLnRpdGxlKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZSBlbmQnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgLS1pbmRlbnRzO1xuICAgIGlmICgxID09IGluZGVudHMpIGNvbnNvbGUubG9nKCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGVuZGluZycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHZhciBmbXQgPSBpbmRlbnQoKSArIGNvbG9yKCdwZW5kaW5nJywgJyAgLSAlcycpO1xuICAgIGNvbnNvbGUubG9nKGZtdCwgdGVzdC50aXRsZSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGlmICgnZmFzdCcgPT0gdGVzdC5zcGVlZCkge1xuICAgICAgdmFyIGZtdCA9IGluZGVudCgpXG4gICAgICAgICsgY29sb3IoJ2NoZWNrbWFyaycsICcgICcgKyBCYXNlLnN5bWJvbHMub2spXG4gICAgICAgICsgY29sb3IoJ3Bhc3MnLCAnICVzICcpO1xuICAgICAgY3Vyc29yLkNSKCk7XG4gICAgICBjb25zb2xlLmxvZyhmbXQsIHRlc3QudGl0bGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZm10ID0gaW5kZW50KClcbiAgICAgICAgKyBjb2xvcignY2hlY2ttYXJrJywgJyAgJyArIEJhc2Uuc3ltYm9scy5vaylcbiAgICAgICAgKyBjb2xvcigncGFzcycsICcgJXMgJylcbiAgICAgICAgKyBjb2xvcih0ZXN0LnNwZWVkLCAnKCVkbXMpJyk7XG4gICAgICBjdXJzb3IuQ1IoKTtcbiAgICAgIGNvbnNvbGUubG9nKGZtdCwgdGVzdC50aXRsZSwgdGVzdC5kdXJhdGlvbik7XG4gICAgfVxuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGN1cnNvci5DUigpO1xuICAgIGNvbnNvbGUubG9nKGluZGVudCgpICsgY29sb3IoJ2ZhaWwnLCAnICAlZCkgJXMnKSwgKytuLCB0ZXN0LnRpdGxlKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBzZWxmLmVwaWxvZ3VlLmJpbmQoc2VsZikpO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcblNwZWMucHJvdG90eXBlID0gbmV3IEY7XG5TcGVjLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFNwZWM7XG5cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL3NwZWMuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy90YXAuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCBjdXJzb3IgPSBCYXNlLmN1cnNvclxuICAsIGNvbG9yID0gQmFzZS5jb2xvcjtcblxuLyoqXG4gKiBFeHBvc2UgYFRBUGAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gVEFQO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFRBUGAgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBUQVAocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCBuID0gMVxuICAgICwgcGFzc2VzID0gMFxuICAgICwgZmFpbHVyZXMgPSAwO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIHZhciB0b3RhbCA9IHJ1bm5lci5ncmVwVG90YWwocnVubmVyLnN1aXRlKTtcbiAgICBjb25zb2xlLmxvZygnJWQuLiVkJywgMSwgdG90YWwpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24oKXtcbiAgICArK247XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGVuZGluZycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGNvbnNvbGUubG9nKCdvayAlZCAlcyAjIFNLSVAgLScsIG4sIHRpdGxlKHRlc3QpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgcGFzc2VzKys7XG4gICAgY29uc29sZS5sb2coJ29rICVkICVzJywgbiwgdGl0bGUodGVzdCkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGZhaWx1cmVzKys7XG4gICAgY29uc29sZS5sb2coJ25vdCBvayAlZCAlcycsIG4sIHRpdGxlKHRlc3QpKTtcbiAgICBpZiAoZXJyLnN0YWNrKSBjb25zb2xlLmxvZyhlcnIuc3RhY2sucmVwbGFjZSgvXi9nbSwgJyAgJykpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2coJyMgdGVzdHMgJyArIChwYXNzZXMgKyBmYWlsdXJlcykpO1xuICAgIGNvbnNvbGUubG9nKCcjIHBhc3MgJyArIHBhc3Nlcyk7XG4gICAgY29uc29sZS5sb2coJyMgZmFpbCAnICsgZmFpbHVyZXMpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBUQVAtc2FmZSB0aXRsZSBvZiBgdGVzdGBcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gdGVzdFxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gdGl0bGUodGVzdCkge1xuICByZXR1cm4gdGVzdC5mdWxsVGl0bGUoKS5yZXBsYWNlKC8jL2csICcnKTtcbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL3RhcC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL3h1bml0LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpXG4gICwgZXNjYXBlID0gdXRpbHMuZXNjYXBlO1xuXG4vKipcbiAqIFNhdmUgdGltZXIgcmVmZXJlbmNlcyB0byBhdm9pZCBTaW5vbiBpbnRlcmZlcmluZyAoc2VlIEdILTIzNykuXG4gKi9cblxudmFyIERhdGUgPSBnbG9iYWwuRGF0ZVxuICAsIHNldFRpbWVvdXQgPSBnbG9iYWwuc2V0VGltZW91dFxuICAsIHNldEludGVydmFsID0gZ2xvYmFsLnNldEludGVydmFsXG4gICwgY2xlYXJUaW1lb3V0ID0gZ2xvYmFsLmNsZWFyVGltZW91dFxuICAsIGNsZWFySW50ZXJ2YWwgPSBnbG9iYWwuY2xlYXJJbnRlcnZhbDtcblxuLyoqXG4gKiBFeHBvc2UgYFhVbml0YC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBYVW5pdDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBYVW5pdGAgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBYVW5pdChydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG4gIHZhciBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIHRlc3RzID0gW11cbiAgICAsIHNlbGYgPSB0aGlzO1xuXG4gIHJ1bm5lci5vbigncGVuZGluZycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHRlc3RzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHRlc3RzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHRlc3RzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICBjb25zb2xlLmxvZyh0YWcoJ3Rlc3RzdWl0ZScsIHtcbiAgICAgICAgbmFtZTogJ01vY2hhIFRlc3RzJ1xuICAgICAgLCB0ZXN0czogc3RhdHMudGVzdHNcbiAgICAgICwgZmFpbHVyZXM6IHN0YXRzLmZhaWx1cmVzXG4gICAgICAsIGVycm9yczogc3RhdHMuZmFpbHVyZXNcbiAgICAgICwgc2tpcHBlZDogc3RhdHMudGVzdHMgLSBzdGF0cy5mYWlsdXJlcyAtIHN0YXRzLnBhc3Nlc1xuICAgICAgLCB0aW1lc3RhbXA6IChuZXcgRGF0ZSkudG9VVENTdHJpbmcoKVxuICAgICAgLCB0aW1lOiAoc3RhdHMuZHVyYXRpb24gLyAxMDAwKSB8fCAwXG4gICAgfSwgZmFsc2UpKTtcblxuICAgIHRlc3RzLmZvckVhY2godGVzdCk7XG4gICAgY29uc29sZS5sb2coJzwvdGVzdHN1aXRlPicpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEJhc2UucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gQmFzZS5wcm90b3R5cGU7XG5YVW5pdC5wcm90b3R5cGUgPSBuZXcgRjtcblhVbml0LnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFhVbml0O1xuXG5cbi8qKlxuICogT3V0cHV0IHRhZyBmb3IgdGhlIGdpdmVuIGB0ZXN0LmBcbiAqL1xuXG5mdW5jdGlvbiB0ZXN0KHRlc3QpIHtcbiAgdmFyIGF0dHJzID0ge1xuICAgICAgY2xhc3NuYW1lOiB0ZXN0LnBhcmVudC5mdWxsVGl0bGUoKVxuICAgICwgbmFtZTogdGVzdC50aXRsZVxuICAgICwgdGltZTogKHRlc3QuZHVyYXRpb24gLyAxMDAwKSB8fCAwXG4gIH07XG5cbiAgaWYgKCdmYWlsZWQnID09IHRlc3Quc3RhdGUpIHtcbiAgICB2YXIgZXJyID0gdGVzdC5lcnI7XG4gICAgY29uc29sZS5sb2codGFnKCd0ZXN0Y2FzZScsIGF0dHJzLCBmYWxzZSwgdGFnKCdmYWlsdXJlJywge30sIGZhbHNlLCBjZGF0YShlc2NhcGUoZXJyLm1lc3NhZ2UpICsgXCJcXG5cIiArIGVyci5zdGFjaykpKSk7XG4gIH0gZWxzZSBpZiAodGVzdC5wZW5kaW5nKSB7XG4gICAgY29uc29sZS5sb2codGFnKCd0ZXN0Y2FzZScsIGF0dHJzLCBmYWxzZSwgdGFnKCdza2lwcGVkJywge30sIHRydWUpKSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2codGFnKCd0ZXN0Y2FzZScsIGF0dHJzLCB0cnVlKSApO1xuICB9XG59XG5cbi8qKlxuICogSFRNTCB0YWcgaGVscGVyLlxuICovXG5cbmZ1bmN0aW9uIHRhZyhuYW1lLCBhdHRycywgY2xvc2UsIGNvbnRlbnQpIHtcbiAgdmFyIGVuZCA9IGNsb3NlID8gJy8+JyA6ICc+J1xuICAgICwgcGFpcnMgPSBbXVxuICAgICwgdGFnO1xuXG4gIGZvciAodmFyIGtleSBpbiBhdHRycykge1xuICAgIHBhaXJzLnB1c2goa2V5ICsgJz1cIicgKyBlc2NhcGUoYXR0cnNba2V5XSkgKyAnXCInKTtcbiAgfVxuXG4gIHRhZyA9ICc8JyArIG5hbWUgKyAocGFpcnMubGVuZ3RoID8gJyAnICsgcGFpcnMuam9pbignICcpIDogJycpICsgZW5kO1xuICBpZiAoY29udGVudCkgdGFnICs9IGNvbnRlbnQgKyAnPC8nICsgbmFtZSArIGVuZDtcbiAgcmV0dXJuIHRhZztcbn1cblxuLyoqXG4gKiBSZXR1cm4gY2RhdGEgZXNjYXBlZCBDREFUQSBgc3RyYC5cbiAqL1xuXG5mdW5jdGlvbiBjZGF0YShzdHIpIHtcbiAgcmV0dXJuICc8IVtDREFUQVsnICsgZXNjYXBlKHN0cikgKyAnXV0+Jztcbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL3h1bml0LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJydW5uYWJsZS5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2Jyb3dzZXIvZXZlbnRzJykuRXZlbnRFbWl0dGVyXG4gICwgZGVidWcgPSByZXF1aXJlKCdicm93c2VyL2RlYnVnJykoJ21vY2hhOnJ1bm5hYmxlJylcbiAgLCBtaWxsaXNlY29uZHMgPSByZXF1aXJlKCcuL21zJyk7XG5cbi8qKlxuICogU2F2ZSB0aW1lciByZWZlcmVuY2VzIHRvIGF2b2lkIFNpbm9uIGludGVyZmVyaW5nIChzZWUgR0gtMjM3KS5cbiAqL1xuXG52YXIgRGF0ZSA9IGdsb2JhbC5EYXRlXG4gICwgc2V0VGltZW91dCA9IGdsb2JhbC5zZXRUaW1lb3V0XG4gICwgc2V0SW50ZXJ2YWwgPSBnbG9iYWwuc2V0SW50ZXJ2YWxcbiAgLCBjbGVhclRpbWVvdXQgPSBnbG9iYWwuY2xlYXJUaW1lb3V0XG4gICwgY2xlYXJJbnRlcnZhbCA9IGdsb2JhbC5jbGVhckludGVydmFsO1xuXG4vKipcbiAqIE9iamVjdCN0b1N0cmluZygpLlxuICovXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKlxuICogRXhwb3NlIGBSdW5uYWJsZWAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBSdW5uYWJsZTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBSdW5uYWJsZWAgd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYCBhbmQgY2FsbGJhY2sgYGZuYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdGl0bGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBSdW5uYWJsZSh0aXRsZSwgZm4pIHtcbiAgdGhpcy50aXRsZSA9IHRpdGxlO1xuICB0aGlzLmZuID0gZm47XG4gIHRoaXMuYXN5bmMgPSBmbiAmJiBmbi5sZW5ndGg7XG4gIHRoaXMuc3luYyA9ICEgdGhpcy5hc3luYztcbiAgdGhpcy5fdGltZW91dCA9IDIwMDA7XG4gIHRoaXMuX3Nsb3cgPSA3NTtcbiAgdGhpcy5fZW5hYmxlVGltZW91dHMgPSB0cnVlO1xuICB0aGlzLnRpbWVkT3V0ID0gZmFsc2U7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBFdmVudEVtaXR0ZXIucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZTtcblJ1bm5hYmxlLnByb3RvdHlwZSA9IG5ldyBGO1xuUnVubmFibGUucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gUnVubmFibGU7XG5cblxuLyoqXG4gKiBTZXQgJiBnZXQgdGltZW91dCBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfFN0cmluZ30gbXNcbiAqIEByZXR1cm4ge1J1bm5hYmxlfE51bWJlcn0gbXMgb3Igc2VsZlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmFibGUucHJvdG90eXBlLnRpbWVvdXQgPSBmdW5jdGlvbihtcyl7XG4gIGlmICgwID09IGFyZ3VtZW50cy5sZW5ndGgpIHJldHVybiB0aGlzLl90aW1lb3V0O1xuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIG1zKSBtcyA9IG1pbGxpc2Vjb25kcyhtcyk7XG4gIGRlYnVnKCd0aW1lb3V0ICVkJywgbXMpO1xuICB0aGlzLl90aW1lb3V0ID0gbXM7XG4gIGlmICh0aGlzLnRpbWVyKSB0aGlzLnJlc2V0VGltZW91dCgpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0ICYgZ2V0IHNsb3cgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcnxTdHJpbmd9IG1zXG4gKiBAcmV0dXJuIHtSdW5uYWJsZXxOdW1iZXJ9IG1zIG9yIHNlbGZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5hYmxlLnByb3RvdHlwZS5zbG93ID0gZnVuY3Rpb24obXMpe1xuICBpZiAoMCA9PT0gYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX3Nsb3c7XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgbXMpIG1zID0gbWlsbGlzZWNvbmRzKG1zKTtcbiAgZGVidWcoJ3RpbWVvdXQgJWQnLCBtcyk7XG4gIHRoaXMuX3Nsb3cgPSBtcztcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCBhbmQgJiBnZXQgdGltZW91dCBgZW5hYmxlZGAuXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVkXG4gKiBAcmV0dXJuIHtSdW5uYWJsZXxCb29sZWFufSBlbmFibGVkIG9yIHNlbGZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5hYmxlLnByb3RvdHlwZS5lbmFibGVUaW1lb3V0cyA9IGZ1bmN0aW9uKGVuYWJsZWQpe1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHRoaXMuX2VuYWJsZVRpbWVvdXRzO1xuICBkZWJ1ZygnZW5hYmxlVGltZW91dHMgJXMnLCBlbmFibGVkKTtcbiAgdGhpcy5fZW5hYmxlVGltZW91dHMgPSBlbmFibGVkO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmV0dXJuIHRoZSBmdWxsIHRpdGxlIGdlbmVyYXRlZCBieSByZWN1cnNpdmVseVxuICogY29uY2F0ZW5hdGluZyB0aGUgcGFyZW50J3MgZnVsbCB0aXRsZS5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJ1bm5hYmxlLnByb3RvdHlwZS5mdWxsVGl0bGUgPSBmdW5jdGlvbigpe1xuICByZXR1cm4gdGhpcy5wYXJlbnQuZnVsbFRpdGxlKCkgKyAnICcgKyB0aGlzLnRpdGxlO1xufTtcblxuLyoqXG4gKiBDbGVhciB0aGUgdGltZW91dC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uYWJsZS5wcm90b3R5cGUuY2xlYXJUaW1lb3V0ID0gZnVuY3Rpb24oKXtcbiAgY2xlYXJUaW1lb3V0KHRoaXMudGltZXIpO1xufTtcblxuLyoqXG4gKiBJbnNwZWN0IHRoZSBydW5uYWJsZSB2b2lkIG9mIHByaXZhdGUgcHJvcGVydGllcy5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uYWJsZS5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uKCl7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeSh0aGlzLCBmdW5jdGlvbihrZXksIHZhbCl7XG4gICAgaWYgKCdfJyA9PSBrZXlbMF0pIHJldHVybjtcbiAgICBpZiAoJ3BhcmVudCcgPT0ga2V5KSByZXR1cm4gJyM8U3VpdGU+JztcbiAgICBpZiAoJ2N0eCcgPT0ga2V5KSByZXR1cm4gJyM8Q29udGV4dD4nO1xuICAgIHJldHVybiB2YWw7XG4gIH0sIDIpO1xufTtcblxuLyoqXG4gKiBSZXNldCB0aGUgdGltZW91dC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uYWJsZS5wcm90b3R5cGUucmVzZXRUaW1lb3V0ID0gZnVuY3Rpb24oKXtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB2YXIgbXMgPSB0aGlzLnRpbWVvdXQoKSB8fCAxZTk7XG5cbiAgaWYgKCF0aGlzLl9lbmFibGVUaW1lb3V0cykgcmV0dXJuO1xuICB0aGlzLmNsZWFyVGltZW91dCgpO1xuICB0aGlzLnRpbWVyID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgIHNlbGYuY2FsbGJhY2sobmV3IEVycm9yKCd0aW1lb3V0IG9mICcgKyBtcyArICdtcyBleGNlZWRlZCcpKTtcbiAgICBzZWxmLnRpbWVkT3V0ID0gdHJ1ZTtcbiAgfSwgbXMpO1xufTtcblxuLyoqXG4gKiBXaGl0ZWxpc3QgdGhlc2UgZ2xvYmFscyBmb3IgdGhpcyB0ZXN0IHJ1blxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5SdW5uYWJsZS5wcm90b3R5cGUuZ2xvYmFscyA9IGZ1bmN0aW9uKGFycil7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdGhpcy5fYWxsb3dlZEdsb2JhbHMgPSBhcnI7XG59O1xuXG4vKipcbiAqIFJ1biB0aGUgdGVzdCBhbmQgaW52b2tlIGBmbihlcnIpYC5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmFibGUucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uKGZuKXtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGFydCA9IG5ldyBEYXRlXG4gICAgLCBjdHggPSB0aGlzLmN0eFxuICAgICwgZmluaXNoZWRcbiAgICAsIGVtaXR0ZWQ7XG5cbiAgLy8gU29tZSB0aW1lcyB0aGUgY3R4IGV4aXN0cyBidXQgaXQgaXMgbm90IHJ1bm5hYmxlXG4gIGlmIChjdHggJiYgY3R4LnJ1bm5hYmxlKSBjdHgucnVubmFibGUodGhpcyk7XG5cbiAgLy8gY2FsbGVkIG11bHRpcGxlIHRpbWVzXG4gIGZ1bmN0aW9uIG11bHRpcGxlKGVycikge1xuICAgIGlmIChlbWl0dGVkKSByZXR1cm47XG4gICAgZW1pdHRlZCA9IHRydWU7XG4gICAgc2VsZi5lbWl0KCdlcnJvcicsIGVyciB8fCBuZXcgRXJyb3IoJ2RvbmUoKSBjYWxsZWQgbXVsdGlwbGUgdGltZXMnKSk7XG4gIH1cblxuICAvLyBmaW5pc2hlZFxuICBmdW5jdGlvbiBkb25lKGVycikge1xuICAgIHZhciBtcyA9IHNlbGYudGltZW91dCgpO1xuICAgIGlmIChzZWxmLnRpbWVkT3V0KSByZXR1cm47XG4gICAgaWYgKGZpbmlzaGVkKSByZXR1cm4gbXVsdGlwbGUoZXJyKTtcbiAgICBzZWxmLmNsZWFyVGltZW91dCgpO1xuICAgIHNlbGYuZHVyYXRpb24gPSBuZXcgRGF0ZSAtIHN0YXJ0O1xuICAgIGZpbmlzaGVkID0gdHJ1ZTtcbiAgICBpZiAoIWVyciAmJiBzZWxmLmR1cmF0aW9uID4gbXMgJiYgc2VsZi5fZW5hYmxlVGltZW91dHMpIGVyciA9IG5ldyBFcnJvcigndGltZW91dCBvZiAnICsgbXMgKyAnbXMgZXhjZWVkZWQnKTtcbiAgICBmbihlcnIpO1xuICB9XG5cbiAgLy8gZm9yIC5yZXNldFRpbWVvdXQoKVxuICB0aGlzLmNhbGxiYWNrID0gZG9uZTtcblxuICAvLyBleHBsaWNpdCBhc3luYyB3aXRoIGBkb25lYCBhcmd1bWVudFxuICBpZiAodGhpcy5hc3luYykge1xuICAgIHRoaXMucmVzZXRUaW1lb3V0KCk7XG5cbiAgICB0cnkge1xuICAgICAgdGhpcy5mbi5jYWxsKGN0eCwgZnVuY3Rpb24oZXJyKXtcbiAgICAgICAgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yIHx8IHRvU3RyaW5nLmNhbGwoZXJyKSA9PT0gXCJbb2JqZWN0IEVycm9yXVwiKSByZXR1cm4gZG9uZShlcnIpO1xuICAgICAgICBpZiAobnVsbCAhPSBlcnIpIHtcbiAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGVycikgPT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICAgICAgICByZXR1cm4gZG9uZShuZXcgRXJyb3IoJ2RvbmUoKSBpbnZva2VkIHdpdGggbm9uLUVycm9yOiAnICsgSlNPTi5zdHJpbmdpZnkoZXJyKSkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZG9uZShuZXcgRXJyb3IoJ2RvbmUoKSBpbnZva2VkIHdpdGggbm9uLUVycm9yOiAnICsgZXJyKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGRvbmUoKTtcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgZG9uZShlcnIpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5hc3luY09ubHkpIHtcbiAgICByZXR1cm4gZG9uZShuZXcgRXJyb3IoJy0tYXN5bmMtb25seSBvcHRpb24gaW4gdXNlIHdpdGhvdXQgZGVjbGFyaW5nIGBkb25lKClgJykpO1xuICB9XG5cbiAgLy8gc3luYyBvciBwcm9taXNlLXJldHVybmluZ1xuICB0cnkge1xuICAgIGlmICh0aGlzLnBlbmRpbmcpIHtcbiAgICAgIGRvbmUoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY2FsbEZuKHRoaXMuZm4pO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgZG9uZShlcnIpO1xuICB9XG5cbiAgZnVuY3Rpb24gY2FsbEZuKGZuKSB7XG4gICAgdmFyIHJlc3VsdCA9IGZuLmNhbGwoY3R4KTtcbiAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgc2VsZi5yZXNldFRpbWVvdXQoKTtcbiAgICAgIHJlc3VsdFxuICAgICAgICAudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICBkb25lKClcbiAgICAgICAgfSxcbiAgICAgICAgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgICAgZG9uZShyZWFzb24gfHwgbmV3IEVycm9yKCdQcm9taXNlIHJlamVjdGVkIHdpdGggbm8gb3IgZmFsc3kgcmVhc29uJykpXG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBkb25lKCk7XG4gICAgfVxuICB9XG59O1xuXG59KTsgLy8gbW9kdWxlOiBydW5uYWJsZS5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicnVubmVyLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2Jyb3dzZXIvZXZlbnRzJykuRXZlbnRFbWl0dGVyXG4gICwgZGVidWcgPSByZXF1aXJlKCdicm93c2VyL2RlYnVnJykoJ21vY2hhOnJ1bm5lcicpXG4gICwgVGVzdCA9IHJlcXVpcmUoJy4vdGVzdCcpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcbiAgLCBmaWx0ZXIgPSB1dGlscy5maWx0ZXJcbiAgLCBrZXlzID0gdXRpbHMua2V5cztcblxuLyoqXG4gKiBOb24tZW51bWVyYWJsZSBnbG9iYWxzLlxuICovXG5cbnZhciBnbG9iYWxzID0gW1xuICAnc2V0VGltZW91dCcsXG4gICdjbGVhclRpbWVvdXQnLFxuICAnc2V0SW50ZXJ2YWwnLFxuICAnY2xlYXJJbnRlcnZhbCcsXG4gICdYTUxIdHRwUmVxdWVzdCcsXG4gICdEYXRlJ1xuXTtcblxuLyoqXG4gKiBFeHBvc2UgYFJ1bm5lcmAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBSdW5uZXI7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIGBSdW5uZXJgIGZvciB0aGUgZ2l2ZW4gYHN1aXRlYC5cbiAqXG4gKiBFdmVudHM6XG4gKlxuICogICAtIGBzdGFydGAgIGV4ZWN1dGlvbiBzdGFydGVkXG4gKiAgIC0gYGVuZGAgIGV4ZWN1dGlvbiBjb21wbGV0ZVxuICogICAtIGBzdWl0ZWAgIChzdWl0ZSkgdGVzdCBzdWl0ZSBleGVjdXRpb24gc3RhcnRlZFxuICogICAtIGBzdWl0ZSBlbmRgICAoc3VpdGUpIGFsbCB0ZXN0cyAoYW5kIHN1Yi1zdWl0ZXMpIGhhdmUgZmluaXNoZWRcbiAqICAgLSBgdGVzdGAgICh0ZXN0KSB0ZXN0IGV4ZWN1dGlvbiBzdGFydGVkXG4gKiAgIC0gYHRlc3QgZW5kYCAgKHRlc3QpIHRlc3QgY29tcGxldGVkXG4gKiAgIC0gYGhvb2tgICAoaG9vaykgaG9vayBleGVjdXRpb24gc3RhcnRlZFxuICogICAtIGBob29rIGVuZGAgIChob29rKSBob29rIGNvbXBsZXRlXG4gKiAgIC0gYHBhc3NgICAodGVzdCkgdGVzdCBwYXNzZWRcbiAqICAgLSBgZmFpbGAgICh0ZXN0LCBlcnIpIHRlc3QgZmFpbGVkXG4gKiAgIC0gYHBlbmRpbmdgICAodGVzdCkgdGVzdCBwZW5kaW5nXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBSdW5uZXIoc3VpdGUpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB0aGlzLl9nbG9iYWxzID0gW107XG4gIHRoaXMuX2Fib3J0ID0gZmFsc2U7XG4gIHRoaXMuc3VpdGUgPSBzdWl0ZTtcbiAgdGhpcy50b3RhbCA9IHN1aXRlLnRvdGFsKCk7XG4gIHRoaXMuZmFpbHVyZXMgPSAwO1xuICB0aGlzLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3QpeyBzZWxmLmNoZWNrR2xvYmFscyh0ZXN0KTsgfSk7XG4gIHRoaXMub24oJ2hvb2sgZW5kJywgZnVuY3Rpb24oaG9vayl7IHNlbGYuY2hlY2tHbG9iYWxzKGhvb2spOyB9KTtcbiAgdGhpcy5ncmVwKC8uKi8pO1xuICB0aGlzLmdsb2JhbHModGhpcy5nbG9iYWxQcm9wcygpLmNvbmNhdChleHRyYUdsb2JhbHMoKSkpO1xufVxuXG4vKipcbiAqIFdyYXBwZXIgZm9yIHNldEltbWVkaWF0ZSwgcHJvY2Vzcy5uZXh0VGljaywgb3IgYnJvd3NlciBwb2x5ZmlsbC5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLmltbWVkaWF0ZWx5ID0gZ2xvYmFsLnNldEltbWVkaWF0ZSB8fCBwcm9jZXNzLm5leHRUaWNrO1xuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgRXZlbnRFbWl0dGVyLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGU7XG5SdW5uZXIucHJvdG90eXBlID0gbmV3IEY7XG5SdW5uZXIucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gUnVubmVyO1xuXG5cbi8qKlxuICogUnVuIHRlc3RzIHdpdGggZnVsbCB0aXRsZXMgbWF0Y2hpbmcgYHJlYC4gVXBkYXRlcyBydW5uZXIudG90YWxcbiAqIHdpdGggbnVtYmVyIG9mIHRlc3RzIG1hdGNoZWQuXG4gKlxuICogQHBhcmFtIHtSZWdFeHB9IHJlXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGludmVydFxuICogQHJldHVybiB7UnVubmVyfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ncmVwID0gZnVuY3Rpb24ocmUsIGludmVydCl7XG4gIGRlYnVnKCdncmVwICVzJywgcmUpO1xuICB0aGlzLl9ncmVwID0gcmU7XG4gIHRoaXMuX2ludmVydCA9IGludmVydDtcbiAgdGhpcy50b3RhbCA9IHRoaXMuZ3JlcFRvdGFsKHRoaXMuc3VpdGUpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIHRlc3RzIG1hdGNoaW5nIHRoZSBncmVwIHNlYXJjaCBmb3IgdGhlXG4gKiBnaXZlbiBzdWl0ZS5cbiAqXG4gKiBAcGFyYW0ge1N1aXRlfSBzdWl0ZVxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLmdyZXBUb3RhbCA9IGZ1bmN0aW9uKHN1aXRlKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIHRvdGFsID0gMDtcblxuICBzdWl0ZS5lYWNoVGVzdChmdW5jdGlvbih0ZXN0KXtcbiAgICB2YXIgbWF0Y2ggPSBzZWxmLl9ncmVwLnRlc3QodGVzdC5mdWxsVGl0bGUoKSk7XG4gICAgaWYgKHNlbGYuX2ludmVydCkgbWF0Y2ggPSAhbWF0Y2g7XG4gICAgaWYgKG1hdGNoKSB0b3RhbCsrO1xuICB9KTtcblxuICByZXR1cm4gdG90YWw7XG59O1xuXG4vKipcbiAqIFJldHVybiBhIGxpc3Qgb2YgZ2xvYmFsIHByb3BlcnRpZXMuXG4gKlxuICogQHJldHVybiB7QXJyYXl9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLmdsb2JhbFByb3BzID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwcm9wcyA9IHV0aWxzLmtleXMoZ2xvYmFsKTtcblxuICAvLyBub24tZW51bWVyYWJsZXNcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBnbG9iYWxzLmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKH51dGlscy5pbmRleE9mKHByb3BzLCBnbG9iYWxzW2ldKSkgY29udGludWU7XG4gICAgcHJvcHMucHVzaChnbG9iYWxzW2ldKTtcbiAgfVxuXG4gIHJldHVybiBwcm9wcztcbn07XG5cbi8qKlxuICogQWxsb3cgdGhlIGdpdmVuIGBhcnJgIG9mIGdsb2JhbHMuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJyXG4gKiBAcmV0dXJuIHtSdW5uZXJ9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLmdsb2JhbHMgPSBmdW5jdGlvbihhcnIpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fZ2xvYmFscztcbiAgZGVidWcoJ2dsb2JhbHMgJWonLCBhcnIpO1xuICB0aGlzLl9nbG9iYWxzID0gdGhpcy5fZ2xvYmFscy5jb25jYXQoYXJyKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIENoZWNrIGZvciBnbG9iYWwgdmFyaWFibGUgbGVha3MuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5jaGVja0dsb2JhbHMgPSBmdW5jdGlvbih0ZXN0KXtcbiAgaWYgKHRoaXMuaWdub3JlTGVha3MpIHJldHVybjtcbiAgdmFyIG9rID0gdGhpcy5fZ2xvYmFscztcblxuICB2YXIgZ2xvYmFscyA9IHRoaXMuZ2xvYmFsUHJvcHMoKTtcbiAgdmFyIGxlYWtzO1xuXG4gIGlmICh0ZXN0KSB7XG4gICAgb2sgPSBvay5jb25jYXQodGVzdC5fYWxsb3dlZEdsb2JhbHMgfHwgW10pO1xuICB9XG5cbiAgaWYodGhpcy5wcmV2R2xvYmFsc0xlbmd0aCA9PSBnbG9iYWxzLmxlbmd0aCkgcmV0dXJuO1xuICB0aGlzLnByZXZHbG9iYWxzTGVuZ3RoID0gZ2xvYmFscy5sZW5ndGg7XG5cbiAgbGVha3MgPSBmaWx0ZXJMZWFrcyhvaywgZ2xvYmFscyk7XG4gIHRoaXMuX2dsb2JhbHMgPSB0aGlzLl9nbG9iYWxzLmNvbmNhdChsZWFrcyk7XG5cbiAgaWYgKGxlYWtzLmxlbmd0aCA+IDEpIHtcbiAgICB0aGlzLmZhaWwodGVzdCwgbmV3IEVycm9yKCdnbG9iYWwgbGVha3MgZGV0ZWN0ZWQ6ICcgKyBsZWFrcy5qb2luKCcsICcpICsgJycpKTtcbiAgfSBlbHNlIGlmIChsZWFrcy5sZW5ndGgpIHtcbiAgICB0aGlzLmZhaWwodGVzdCwgbmV3IEVycm9yKCdnbG9iYWwgbGVhayBkZXRlY3RlZDogJyArIGxlYWtzWzBdKSk7XG4gIH1cbn07XG5cbi8qKlxuICogRmFpbCB0aGUgZ2l2ZW4gYHRlc3RgLlxuICpcbiAqIEBwYXJhbSB7VGVzdH0gdGVzdFxuICogQHBhcmFtIHtFcnJvcn0gZXJyXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLmZhaWwgPSBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICArK3RoaXMuZmFpbHVyZXM7XG4gIHRlc3Quc3RhdGUgPSAnZmFpbGVkJztcblxuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIGVycikge1xuICAgIGVyciA9IG5ldyBFcnJvcigndGhlIHN0cmluZyBcIicgKyBlcnIgKyAnXCIgd2FzIHRocm93biwgdGhyb3cgYW4gRXJyb3IgOiknKTtcbiAgfVxuXG4gIHRoaXMuZW1pdCgnZmFpbCcsIHRlc3QsIGVycik7XG59O1xuXG4vKipcbiAqIEZhaWwgdGhlIGdpdmVuIGBob29rYCB3aXRoIGBlcnJgLlxuICpcbiAqIEhvb2sgZmFpbHVyZXMgd29yayBpbiB0aGUgZm9sbG93aW5nIHBhdHRlcm46XG4gKiAtIElmIGJhaWwsIHRoZW4gZXhpdFxuICogLSBGYWlsZWQgYGJlZm9yZWAgaG9vayBza2lwcyBhbGwgdGVzdHMgaW4gYSBzdWl0ZSBhbmQgc3Vic3VpdGVzLFxuICogICBidXQganVtcHMgdG8gY29ycmVzcG9uZGluZyBgYWZ0ZXJgIGhvb2tcbiAqIC0gRmFpbGVkIGBiZWZvcmUgZWFjaGAgaG9vayBza2lwcyByZW1haW5pbmcgdGVzdHMgaW4gYVxuICogICBzdWl0ZSBhbmQganVtcHMgdG8gY29ycmVzcG9uZGluZyBgYWZ0ZXIgZWFjaGAgaG9vayxcbiAqICAgd2hpY2ggaXMgcnVuIG9ubHkgb25jZVxuICogLSBGYWlsZWQgYGFmdGVyYCBob29rIGRvZXMgbm90IGFsdGVyXG4gKiAgIGV4ZWN1dGlvbiBvcmRlclxuICogLSBGYWlsZWQgYGFmdGVyIGVhY2hgIGhvb2sgc2tpcHMgcmVtYWluaW5nIHRlc3RzIGluIGFcbiAqICAgc3VpdGUgYW5kIHN1YnN1aXRlcywgYnV0IGV4ZWN1dGVzIG90aGVyIGBhZnRlciBlYWNoYFxuICogICBob29rc1xuICpcbiAqIEBwYXJhbSB7SG9va30gaG9va1xuICogQHBhcmFtIHtFcnJvcn0gZXJyXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLmZhaWxIb29rID0gZnVuY3Rpb24oaG9vaywgZXJyKXtcbiAgdGhpcy5mYWlsKGhvb2ssIGVycik7XG4gIGlmICh0aGlzLnN1aXRlLmJhaWwoKSkge1xuICAgIHRoaXMuZW1pdCgnZW5kJyk7XG4gIH1cbn07XG5cbi8qKlxuICogUnVuIGhvb2sgYG5hbWVgIGNhbGxiYWNrcyBhbmQgdGhlbiBpbnZva2UgYGZuKClgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jdGlvblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ob29rID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICB2YXIgc3VpdGUgPSB0aGlzLnN1aXRlXG4gICAgLCBob29rcyA9IHN1aXRlWydfJyArIG5hbWVdXG4gICAgLCBzZWxmID0gdGhpc1xuICAgICwgdGltZXI7XG5cbiAgZnVuY3Rpb24gbmV4dChpKSB7XG4gICAgdmFyIGhvb2sgPSBob29rc1tpXTtcbiAgICBpZiAoIWhvb2spIHJldHVybiBmbigpO1xuICAgIGlmIChzZWxmLmZhaWx1cmVzICYmIHN1aXRlLmJhaWwoKSkgcmV0dXJuIGZuKCk7XG4gICAgc2VsZi5jdXJyZW50UnVubmFibGUgPSBob29rO1xuXG4gICAgaG9vay5jdHguY3VycmVudFRlc3QgPSBzZWxmLnRlc3Q7XG5cbiAgICBzZWxmLmVtaXQoJ2hvb2snLCBob29rKTtcblxuICAgIGhvb2sub24oJ2Vycm9yJywgZnVuY3Rpb24oZXJyKXtcbiAgICAgIHNlbGYuZmFpbEhvb2soaG9vaywgZXJyKTtcbiAgICB9KTtcblxuICAgIGhvb2sucnVuKGZ1bmN0aW9uKGVycil7XG4gICAgICBob29rLnJlbW92ZUFsbExpc3RlbmVycygnZXJyb3InKTtcbiAgICAgIHZhciB0ZXN0RXJyb3IgPSBob29rLmVycm9yKCk7XG4gICAgICBpZiAodGVzdEVycm9yKSBzZWxmLmZhaWwoc2VsZi50ZXN0LCB0ZXN0RXJyb3IpO1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBzZWxmLmZhaWxIb29rKGhvb2ssIGVycik7XG5cbiAgICAgICAgLy8gc3RvcCBleGVjdXRpbmcgaG9va3MsIG5vdGlmeSBjYWxsZWUgb2YgaG9vayBlcnJcbiAgICAgICAgcmV0dXJuIGZuKGVycik7XG4gICAgICB9XG4gICAgICBzZWxmLmVtaXQoJ2hvb2sgZW5kJywgaG9vayk7XG4gICAgICBkZWxldGUgaG9vay5jdHguY3VycmVudFRlc3Q7XG4gICAgICBuZXh0KCsraSk7XG4gICAgfSk7XG4gIH1cblxuICBSdW5uZXIuaW1tZWRpYXRlbHkoZnVuY3Rpb24oKXtcbiAgICBuZXh0KDApO1xuICB9KTtcbn07XG5cbi8qKlxuICogUnVuIGhvb2sgYG5hbWVgIGZvciB0aGUgZ2l2ZW4gYXJyYXkgb2YgYHN1aXRlc2BcbiAqIGluIG9yZGVyLCBhbmQgY2FsbGJhY2sgYGZuKGVyciwgZXJyU3VpdGUpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtBcnJheX0gc3VpdGVzXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ob29rcyA9IGZ1bmN0aW9uKG5hbWUsIHN1aXRlcywgZm4pe1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIG9yaWcgPSB0aGlzLnN1aXRlO1xuXG4gIGZ1bmN0aW9uIG5leHQoc3VpdGUpIHtcbiAgICBzZWxmLnN1aXRlID0gc3VpdGU7XG5cbiAgICBpZiAoIXN1aXRlKSB7XG4gICAgICBzZWxmLnN1aXRlID0gb3JpZztcbiAgICAgIHJldHVybiBmbigpO1xuICAgIH1cblxuICAgIHNlbGYuaG9vayhuYW1lLCBmdW5jdGlvbihlcnIpe1xuICAgICAgaWYgKGVycikge1xuICAgICAgICB2YXIgZXJyU3VpdGUgPSBzZWxmLnN1aXRlO1xuICAgICAgICBzZWxmLnN1aXRlID0gb3JpZztcbiAgICAgICAgcmV0dXJuIGZuKGVyciwgZXJyU3VpdGUpO1xuICAgICAgfVxuXG4gICAgICBuZXh0KHN1aXRlcy5wb3AoKSk7XG4gICAgfSk7XG4gIH1cblxuICBuZXh0KHN1aXRlcy5wb3AoKSk7XG59O1xuXG4vKipcbiAqIFJ1biBob29rcyBmcm9tIHRoZSB0b3AgbGV2ZWwgZG93bi5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUuaG9va1VwID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICB2YXIgc3VpdGVzID0gW3RoaXMuc3VpdGVdLmNvbmNhdCh0aGlzLnBhcmVudHMoKSkucmV2ZXJzZSgpO1xuICB0aGlzLmhvb2tzKG5hbWUsIHN1aXRlcywgZm4pO1xufTtcblxuLyoqXG4gKiBSdW4gaG9va3MgZnJvbSB0aGUgYm90dG9tIHVwLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ob29rRG93biA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgdmFyIHN1aXRlcyA9IFt0aGlzLnN1aXRlXS5jb25jYXQodGhpcy5wYXJlbnRzKCkpO1xuICB0aGlzLmhvb2tzKG5hbWUsIHN1aXRlcywgZm4pO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYW4gYXJyYXkgb2YgcGFyZW50IFN1aXRlcyBmcm9tXG4gKiBjbG9zZXN0IHRvIGZ1cnRoZXN0LlxuICpcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5wYXJlbnRzID0gZnVuY3Rpb24oKXtcbiAgdmFyIHN1aXRlID0gdGhpcy5zdWl0ZVxuICAgICwgc3VpdGVzID0gW107XG4gIHdoaWxlIChzdWl0ZSA9IHN1aXRlLnBhcmVudCkgc3VpdGVzLnB1c2goc3VpdGUpO1xuICByZXR1cm4gc3VpdGVzO1xufTtcblxuLyoqXG4gKiBSdW4gdGhlIGN1cnJlbnQgdGVzdCBhbmQgY2FsbGJhY2sgYGZuKGVycilgLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLnJ1blRlc3QgPSBmdW5jdGlvbihmbil7XG4gIHZhciB0ZXN0ID0gdGhpcy50ZXN0XG4gICAgLCBzZWxmID0gdGhpcztcblxuICBpZiAodGhpcy5hc3luY09ubHkpIHRlc3QuYXN5bmNPbmx5ID0gdHJ1ZTtcblxuICB0cnkge1xuICAgIHRlc3Qub24oJ2Vycm9yJywgZnVuY3Rpb24oZXJyKXtcbiAgICAgIHNlbGYuZmFpbCh0ZXN0LCBlcnIpO1xuICAgIH0pO1xuICAgIHRlc3QucnVuKGZuKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgZm4oZXJyKTtcbiAgfVxufTtcblxuLyoqXG4gKiBSdW4gdGVzdHMgaW4gdGhlIGdpdmVuIGBzdWl0ZWAgYW5kIGludm9rZVxuICogdGhlIGNhbGxiYWNrIGBmbigpYCB3aGVuIGNvbXBsZXRlLlxuICpcbiAqIEBwYXJhbSB7U3VpdGV9IHN1aXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ydW5UZXN0cyA9IGZ1bmN0aW9uKHN1aXRlLCBmbil7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgdGVzdHMgPSBzdWl0ZS50ZXN0cy5zbGljZSgpXG4gICAgLCB0ZXN0O1xuXG5cbiAgZnVuY3Rpb24gaG9va0VycihlcnIsIGVyclN1aXRlLCBhZnRlcikge1xuICAgIC8vIGJlZm9yZS9hZnRlciBFYWNoIGhvb2sgZm9yIGVyclN1aXRlIGZhaWxlZDpcbiAgICB2YXIgb3JpZyA9IHNlbGYuc3VpdGU7XG5cbiAgICAvLyBmb3IgZmFpbGVkICdhZnRlciBlYWNoJyBob29rIHN0YXJ0IGZyb20gZXJyU3VpdGUgcGFyZW50LFxuICAgIC8vIG90aGVyd2lzZSBzdGFydCBmcm9tIGVyclN1aXRlIGl0c2VsZlxuICAgIHNlbGYuc3VpdGUgPSBhZnRlciA/IGVyclN1aXRlLnBhcmVudCA6IGVyclN1aXRlO1xuXG4gICAgaWYgKHNlbGYuc3VpdGUpIHtcbiAgICAgIC8vIGNhbGwgaG9va1VwIGFmdGVyRWFjaFxuICAgICAgc2VsZi5ob29rVXAoJ2FmdGVyRWFjaCcsIGZ1bmN0aW9uKGVycjIsIGVyclN1aXRlMikge1xuICAgICAgICBzZWxmLnN1aXRlID0gb3JpZztcbiAgICAgICAgLy8gc29tZSBob29rcyBtYXkgZmFpbCBldmVuIG5vd1xuICAgICAgICBpZiAoZXJyMikgcmV0dXJuIGhvb2tFcnIoZXJyMiwgZXJyU3VpdGUyLCB0cnVlKTtcbiAgICAgICAgLy8gcmVwb3J0IGVycm9yIHN1aXRlXG4gICAgICAgIGZuKGVyclN1aXRlKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyB0aGVyZSBpcyBubyBuZWVkIGNhbGxpbmcgb3RoZXIgJ2FmdGVyIGVhY2gnIGhvb2tzXG4gICAgICBzZWxmLnN1aXRlID0gb3JpZztcbiAgICAgIGZuKGVyclN1aXRlKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBuZXh0KGVyciwgZXJyU3VpdGUpIHtcbiAgICAvLyBpZiB3ZSBiYWlsIGFmdGVyIGZpcnN0IGVyclxuICAgIGlmIChzZWxmLmZhaWx1cmVzICYmIHN1aXRlLl9iYWlsKSByZXR1cm4gZm4oKTtcblxuICAgIGlmIChzZWxmLl9hYm9ydCkgcmV0dXJuIGZuKCk7XG5cbiAgICBpZiAoZXJyKSByZXR1cm4gaG9va0VycihlcnIsIGVyclN1aXRlLCB0cnVlKTtcblxuICAgIC8vIG5leHQgdGVzdFxuICAgIHRlc3QgPSB0ZXN0cy5zaGlmdCgpO1xuXG4gICAgLy8gYWxsIGRvbmVcbiAgICBpZiAoIXRlc3QpIHJldHVybiBmbigpO1xuXG4gICAgLy8gZ3JlcFxuICAgIHZhciBtYXRjaCA9IHNlbGYuX2dyZXAudGVzdCh0ZXN0LmZ1bGxUaXRsZSgpKTtcbiAgICBpZiAoc2VsZi5faW52ZXJ0KSBtYXRjaCA9ICFtYXRjaDtcbiAgICBpZiAoIW1hdGNoKSByZXR1cm4gbmV4dCgpO1xuXG4gICAgLy8gcGVuZGluZ1xuICAgIGlmICh0ZXN0LnBlbmRpbmcpIHtcbiAgICAgIHNlbGYuZW1pdCgncGVuZGluZycsIHRlc3QpO1xuICAgICAgc2VsZi5lbWl0KCd0ZXN0IGVuZCcsIHRlc3QpO1xuICAgICAgcmV0dXJuIG5leHQoKTtcbiAgICB9XG5cbiAgICAvLyBleGVjdXRlIHRlc3QgYW5kIGhvb2socylcbiAgICBzZWxmLmVtaXQoJ3Rlc3QnLCBzZWxmLnRlc3QgPSB0ZXN0KTtcbiAgICBzZWxmLmhvb2tEb3duKCdiZWZvcmVFYWNoJywgZnVuY3Rpb24oZXJyLCBlcnJTdWl0ZSl7XG5cbiAgICAgIGlmIChlcnIpIHJldHVybiBob29rRXJyKGVyciwgZXJyU3VpdGUsIGZhbHNlKTtcblxuICAgICAgc2VsZi5jdXJyZW50UnVubmFibGUgPSBzZWxmLnRlc3Q7XG4gICAgICBzZWxmLnJ1blRlc3QoZnVuY3Rpb24oZXJyKXtcbiAgICAgICAgdGVzdCA9IHNlbGYudGVzdDtcblxuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgc2VsZi5mYWlsKHRlc3QsIGVycik7XG4gICAgICAgICAgc2VsZi5lbWl0KCd0ZXN0IGVuZCcsIHRlc3QpO1xuICAgICAgICAgIHJldHVybiBzZWxmLmhvb2tVcCgnYWZ0ZXJFYWNoJywgbmV4dCk7XG4gICAgICAgIH1cblxuICAgICAgICB0ZXN0LnN0YXRlID0gJ3Bhc3NlZCc7XG4gICAgICAgIHNlbGYuZW1pdCgncGFzcycsIHRlc3QpO1xuICAgICAgICBzZWxmLmVtaXQoJ3Rlc3QgZW5kJywgdGVzdCk7XG4gICAgICAgIHNlbGYuaG9va1VwKCdhZnRlckVhY2gnLCBuZXh0KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgdGhpcy5uZXh0ID0gbmV4dDtcbiAgbmV4dCgpO1xufTtcblxuLyoqXG4gKiBSdW4gdGhlIGdpdmVuIGBzdWl0ZWAgYW5kIGludm9rZSB0aGVcbiAqIGNhbGxiYWNrIGBmbigpYCB3aGVuIGNvbXBsZXRlLlxuICpcbiAqIEBwYXJhbSB7U3VpdGV9IHN1aXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ydW5TdWl0ZSA9IGZ1bmN0aW9uKHN1aXRlLCBmbil7XG4gIHZhciB0b3RhbCA9IHRoaXMuZ3JlcFRvdGFsKHN1aXRlKVxuICAgICwgc2VsZiA9IHRoaXNcbiAgICAsIGkgPSAwO1xuXG4gIGRlYnVnKCdydW4gc3VpdGUgJXMnLCBzdWl0ZS5mdWxsVGl0bGUoKSk7XG5cbiAgaWYgKCF0b3RhbCkgcmV0dXJuIGZuKCk7XG5cbiAgdGhpcy5lbWl0KCdzdWl0ZScsIHRoaXMuc3VpdGUgPSBzdWl0ZSk7XG5cbiAgZnVuY3Rpb24gbmV4dChlcnJTdWl0ZSkge1xuICAgIGlmIChlcnJTdWl0ZSkge1xuICAgICAgLy8gY3VycmVudCBzdWl0ZSBmYWlsZWQgb24gYSBob29rIGZyb20gZXJyU3VpdGVcbiAgICAgIGlmIChlcnJTdWl0ZSA9PSBzdWl0ZSkge1xuICAgICAgICAvLyBpZiBlcnJTdWl0ZSBpcyBjdXJyZW50IHN1aXRlXG4gICAgICAgIC8vIGNvbnRpbnVlIHRvIHRoZSBuZXh0IHNpYmxpbmcgc3VpdGVcbiAgICAgICAgcmV0dXJuIGRvbmUoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGVyclN1aXRlIGlzIGFtb25nIHRoZSBwYXJlbnRzIG9mIGN1cnJlbnQgc3VpdGVcbiAgICAgICAgLy8gc3RvcCBleGVjdXRpb24gb2YgZXJyU3VpdGUgYW5kIGFsbCBzdWItc3VpdGVzXG4gICAgICAgIHJldHVybiBkb25lKGVyclN1aXRlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc2VsZi5fYWJvcnQpIHJldHVybiBkb25lKCk7XG5cbiAgICB2YXIgY3VyciA9IHN1aXRlLnN1aXRlc1tpKytdO1xuICAgIGlmICghY3VycikgcmV0dXJuIGRvbmUoKTtcbiAgICBzZWxmLnJ1blN1aXRlKGN1cnIsIG5leHQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZG9uZShlcnJTdWl0ZSkge1xuICAgIHNlbGYuc3VpdGUgPSBzdWl0ZTtcbiAgICBzZWxmLmhvb2soJ2FmdGVyQWxsJywgZnVuY3Rpb24oKXtcbiAgICAgIHNlbGYuZW1pdCgnc3VpdGUgZW5kJywgc3VpdGUpO1xuICAgICAgZm4oZXJyU3VpdGUpO1xuICAgIH0pO1xuICB9XG5cbiAgdGhpcy5ob29rKCdiZWZvcmVBbGwnLCBmdW5jdGlvbihlcnIpe1xuICAgIGlmIChlcnIpIHJldHVybiBkb25lKCk7XG4gICAgc2VsZi5ydW5UZXN0cyhzdWl0ZSwgbmV4dCk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBIYW5kbGUgdW5jYXVnaHQgZXhjZXB0aW9ucy5cbiAqXG4gKiBAcGFyYW0ge0Vycm9yfSBlcnJcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUudW5jYXVnaHQgPSBmdW5jdGlvbihlcnIpe1xuICBpZiAoZXJyKSB7XG4gICAgZGVidWcoJ3VuY2F1Z2h0IGV4Y2VwdGlvbiAlcycsIGVyci5tZXNzYWdlKTtcbiAgfSBlbHNlIHtcbiAgICBkZWJ1ZygndW5jYXVnaHQgdW5kZWZpbmVkIGV4Y2VwdGlvbicpO1xuICAgIGVyciA9IG5ldyBFcnJvcignQ2F0Y2hlZCB1bmRlZmluZWQgZXJyb3IsIGRpZCB5b3UgdGhyb3cgd2l0aG91dCBzcGVjaWZ5aW5nIHdoYXQ/Jyk7XG4gIH1cbiAgXG4gIHZhciBydW5uYWJsZSA9IHRoaXMuY3VycmVudFJ1bm5hYmxlO1xuICBpZiAoIXJ1bm5hYmxlIHx8ICdmYWlsZWQnID09IHJ1bm5hYmxlLnN0YXRlKSByZXR1cm47XG4gIHJ1bm5hYmxlLmNsZWFyVGltZW91dCgpO1xuICBlcnIudW5jYXVnaHQgPSB0cnVlO1xuICB0aGlzLmZhaWwocnVubmFibGUsIGVycik7XG5cbiAgLy8gcmVjb3ZlciBmcm9tIHRlc3RcbiAgaWYgKCd0ZXN0JyA9PSBydW5uYWJsZS50eXBlKSB7XG4gICAgdGhpcy5lbWl0KCd0ZXN0IGVuZCcsIHJ1bm5hYmxlKTtcbiAgICB0aGlzLmhvb2tVcCgnYWZ0ZXJFYWNoJywgdGhpcy5uZXh0KTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBiYWlsIG9uIGhvb2tzXG4gIHRoaXMuZW1pdCgnZW5kJyk7XG59O1xuXG4vKipcbiAqIFJ1biB0aGUgcm9vdCBzdWl0ZSBhbmQgaW52b2tlIGBmbihmYWlsdXJlcylgXG4gKiBvbiBjb21wbGV0aW9uLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtSdW5uZXJ9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uKGZuKXtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBmbiA9IGZuIHx8IGZ1bmN0aW9uKCl7fTtcblxuICBmdW5jdGlvbiB1bmNhdWdodChlcnIpe1xuICAgIHNlbGYudW5jYXVnaHQoZXJyKTtcbiAgfVxuXG4gIGRlYnVnKCdzdGFydCcpO1xuXG4gIC8vIGNhbGxiYWNrXG4gIHRoaXMub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgZGVidWcoJ2VuZCcpO1xuICAgIHByb2Nlc3MucmVtb3ZlTGlzdGVuZXIoJ3VuY2F1Z2h0RXhjZXB0aW9uJywgdW5jYXVnaHQpO1xuICAgIGZuKHNlbGYuZmFpbHVyZXMpO1xuICB9KTtcblxuICAvLyBydW4gc3VpdGVzXG4gIHRoaXMuZW1pdCgnc3RhcnQnKTtcbiAgdGhpcy5ydW5TdWl0ZSh0aGlzLnN1aXRlLCBmdW5jdGlvbigpe1xuICAgIGRlYnVnKCdmaW5pc2hlZCBydW5uaW5nJyk7XG4gICAgc2VsZi5lbWl0KCdlbmQnKTtcbiAgfSk7XG5cbiAgLy8gdW5jYXVnaHQgZXhjZXB0aW9uXG4gIHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgdW5jYXVnaHQpO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBDbGVhbmx5IGFib3J0IGV4ZWN1dGlvblxuICpcbiAqIEByZXR1cm4ge1J1bm5lcn0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5SdW5uZXIucHJvdG90eXBlLmFib3J0ID0gZnVuY3Rpb24oKXtcbiAgZGVidWcoJ2Fib3J0aW5nJyk7XG4gIHRoaXMuX2Fib3J0ID0gdHJ1ZTtcbn1cblxuLyoqXG4gKiBGaWx0ZXIgbGVha3Mgd2l0aCB0aGUgZ2l2ZW4gZ2xvYmFscyBmbGFnZ2VkIGFzIGBva2AuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gb2tcbiAqIEBwYXJhbSB7QXJyYXl9IGdsb2JhbHNcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gZmlsdGVyTGVha3Mob2ssIGdsb2JhbHMpIHtcbiAgcmV0dXJuIGZpbHRlcihnbG9iYWxzLCBmdW5jdGlvbihrZXkpe1xuICAgIC8vIEZpcmVmb3ggYW5kIENocm9tZSBleHBvc2VzIGlmcmFtZXMgYXMgaW5kZXggaW5zaWRlIHRoZSB3aW5kb3cgb2JqZWN0XG4gICAgaWYgKC9eZCsvLnRlc3Qoa2V5KSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgLy8gaW4gZmlyZWZveFxuICAgIC8vIGlmIHJ1bm5lciBydW5zIGluIGFuIGlmcmFtZSwgdGhpcyBpZnJhbWUncyB3aW5kb3cuZ2V0SW50ZXJmYWNlIG1ldGhvZCBub3QgaW5pdCBhdCBmaXJzdFxuICAgIC8vIGl0IGlzIGFzc2lnbmVkIGluIHNvbWUgc2Vjb25kc1xuICAgIGlmIChnbG9iYWwubmF2aWdhdG9yICYmIC9eZ2V0SW50ZXJmYWNlLy50ZXN0KGtleSkpIHJldHVybiBmYWxzZTtcblxuICAgIC8vIGFuIGlmcmFtZSBjb3VsZCBiZSBhcHByb2FjaGVkIGJ5IHdpbmRvd1tpZnJhbWVJbmRleF1cbiAgICAvLyBpbiBpZTYsNyw4IGFuZCBvcGVyYSwgaWZyYW1lSW5kZXggaXMgZW51bWVyYWJsZSwgdGhpcyBjb3VsZCBjYXVzZSBsZWFrXG4gICAgaWYgKGdsb2JhbC5uYXZpZ2F0b3IgJiYgL15cXGQrLy50ZXN0KGtleSkpIHJldHVybiBmYWxzZTtcblxuICAgIC8vIE9wZXJhIGFuZCBJRSBleHBvc2UgZ2xvYmFsIHZhcmlhYmxlcyBmb3IgSFRNTCBlbGVtZW50IElEcyAoaXNzdWUgIzI0MylcbiAgICBpZiAoL15tb2NoYS0vLnRlc3Qoa2V5KSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgdmFyIG1hdGNoZWQgPSBmaWx0ZXIob2ssIGZ1bmN0aW9uKG9rKXtcbiAgICAgIGlmICh+b2suaW5kZXhPZignKicpKSByZXR1cm4gMCA9PSBrZXkuaW5kZXhPZihvay5zcGxpdCgnKicpWzBdKTtcbiAgICAgIHJldHVybiBrZXkgPT0gb2s7XG4gICAgfSk7XG4gICAgcmV0dXJuIG1hdGNoZWQubGVuZ3RoID09IDAgJiYgKCFnbG9iYWwubmF2aWdhdG9yIHx8ICdvbmVycm9yJyAhPT0ga2V5KTtcbiAgfSk7XG59XG5cbi8qKlxuICogQXJyYXkgb2YgZ2xvYmFscyBkZXBlbmRlbnQgb24gdGhlIGVudmlyb25tZW50LlxuICpcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuIGZ1bmN0aW9uIGV4dHJhR2xvYmFscygpIHtcbiAgaWYgKHR5cGVvZihwcm9jZXNzKSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHR5cGVvZihwcm9jZXNzLnZlcnNpb24pID09PSAnc3RyaW5nJykge1xuXG4gICAgdmFyIG5vZGVWZXJzaW9uID0gcHJvY2Vzcy52ZXJzaW9uLnNwbGl0KCcuJykucmVkdWNlKGZ1bmN0aW9uKGEsIHYpIHtcbiAgICAgIHJldHVybiBhIDw8IDggfCB2O1xuICAgIH0pO1xuXG4gICAgLy8gJ2Vycm5vJyB3YXMgcmVuYW1lZCB0byBwcm9jZXNzLl9lcnJubyBpbiB2MC45LjExLlxuXG4gICAgaWYgKG5vZGVWZXJzaW9uIDwgMHgwMDA5MEIpIHtcbiAgICAgIHJldHVybiBbJ2Vycm5vJ107XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIFtdO1xuIH1cblxufSk7IC8vIG1vZHVsZTogcnVubmVyLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJzdWl0ZS5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2Jyb3dzZXIvZXZlbnRzJykuRXZlbnRFbWl0dGVyXG4gICwgZGVidWcgPSByZXF1aXJlKCdicm93c2VyL2RlYnVnJykoJ21vY2hhOnN1aXRlJylcbiAgLCBtaWxsaXNlY29uZHMgPSByZXF1aXJlKCcuL21zJylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMnKVxuICAsIEhvb2sgPSByZXF1aXJlKCcuL2hvb2snKTtcblxuLyoqXG4gKiBFeHBvc2UgYFN1aXRlYC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBTdWl0ZTtcblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgYFN1aXRlYCB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgXG4gKiBhbmQgcGFyZW50IGBTdWl0ZWAuIFdoZW4gYSBzdWl0ZSB3aXRoIHRoZVxuICogc2FtZSB0aXRsZSBpcyBhbHJlYWR5IHByZXNlbnQsIHRoYXQgc3VpdGVcbiAqIGlzIHJldHVybmVkIHRvIHByb3ZpZGUgbmljZXIgcmVwb3J0ZXJcbiAqIGFuZCBtb3JlIGZsZXhpYmxlIG1ldGEtdGVzdGluZy5cbiAqXG4gKiBAcGFyYW0ge1N1aXRlfSBwYXJlbnRcbiAqIEBwYXJhbSB7U3RyaW5nfSB0aXRsZVxuICogQHJldHVybiB7U3VpdGV9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmV4cG9ydHMuY3JlYXRlID0gZnVuY3Rpb24ocGFyZW50LCB0aXRsZSl7XG4gIHZhciBzdWl0ZSA9IG5ldyBTdWl0ZSh0aXRsZSwgcGFyZW50LmN0eCk7XG4gIHN1aXRlLnBhcmVudCA9IHBhcmVudDtcbiAgaWYgKHBhcmVudC5wZW5kaW5nKSBzdWl0ZS5wZW5kaW5nID0gdHJ1ZTtcbiAgdGl0bGUgPSBzdWl0ZS5mdWxsVGl0bGUoKTtcbiAgcGFyZW50LmFkZFN1aXRlKHN1aXRlKTtcbiAgcmV0dXJuIHN1aXRlO1xufTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBTdWl0ZWAgd2l0aCB0aGUgZ2l2ZW5cbiAqIGB0aXRsZWAgYW5kIGBjdHhgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0aXRsZVxuICogQHBhcmFtIHtDb250ZXh0fSBjdHhcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIFN1aXRlKHRpdGxlLCBwYXJlbnRDb250ZXh0KSB7XG4gIHRoaXMudGl0bGUgPSB0aXRsZTtcbiAgdmFyIGNvbnRleHQgPSBmdW5jdGlvbigpIHt9O1xuICBjb250ZXh0LnByb3RvdHlwZSA9IHBhcmVudENvbnRleHQ7XG4gIHRoaXMuY3R4ID0gbmV3IGNvbnRleHQoKTtcbiAgdGhpcy5zdWl0ZXMgPSBbXTtcbiAgdGhpcy50ZXN0cyA9IFtdO1xuICB0aGlzLnBlbmRpbmcgPSBmYWxzZTtcbiAgdGhpcy5fYmVmb3JlRWFjaCA9IFtdO1xuICB0aGlzLl9iZWZvcmVBbGwgPSBbXTtcbiAgdGhpcy5fYWZ0ZXJFYWNoID0gW107XG4gIHRoaXMuX2FmdGVyQWxsID0gW107XG4gIHRoaXMucm9vdCA9ICF0aXRsZTtcbiAgdGhpcy5fdGltZW91dCA9IDIwMDA7XG4gIHRoaXMuX2VuYWJsZVRpbWVvdXRzID0gdHJ1ZTtcbiAgdGhpcy5fc2xvdyA9IDc1O1xuICB0aGlzLl9iYWlsID0gZmFsc2U7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBFdmVudEVtaXR0ZXIucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZTtcblN1aXRlLnByb3RvdHlwZSA9IG5ldyBGO1xuU3VpdGUucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gU3VpdGU7XG5cblxuLyoqXG4gKiBSZXR1cm4gYSBjbG9uZSBvZiB0aGlzIGBTdWl0ZWAuXG4gKlxuICogQHJldHVybiB7U3VpdGV9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbigpe1xuICB2YXIgc3VpdGUgPSBuZXcgU3VpdGUodGhpcy50aXRsZSk7XG4gIGRlYnVnKCdjbG9uZScpO1xuICBzdWl0ZS5jdHggPSB0aGlzLmN0eDtcbiAgc3VpdGUudGltZW91dCh0aGlzLnRpbWVvdXQoKSk7XG4gIHN1aXRlLmVuYWJsZVRpbWVvdXRzKHRoaXMuZW5hYmxlVGltZW91dHMoKSk7XG4gIHN1aXRlLnNsb3codGhpcy5zbG93KCkpO1xuICBzdWl0ZS5iYWlsKHRoaXMuYmFpbCgpKTtcbiAgcmV0dXJuIHN1aXRlO1xufTtcblxuLyoqXG4gKiBTZXQgdGltZW91dCBgbXNgIG9yIHNob3J0LWhhbmQgc3VjaCBhcyBcIjJzXCIuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ8U3RyaW5nfSBtc1xuICogQHJldHVybiB7U3VpdGV8TnVtYmVyfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblN1aXRlLnByb3RvdHlwZS50aW1lb3V0ID0gZnVuY3Rpb24obXMpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fdGltZW91dDtcbiAgaWYgKCdzdHJpbmcnID09IHR5cGVvZiBtcykgbXMgPSBtaWxsaXNlY29uZHMobXMpO1xuICBkZWJ1ZygndGltZW91dCAlZCcsIG1zKTtcbiAgdGhpcy5fdGltZW91dCA9IHBhcnNlSW50KG1zLCAxMCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gICogU2V0IHRpbWVvdXQgYGVuYWJsZWRgLlxuICAqXG4gICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVkXG4gICogQHJldHVybiB7U3VpdGV8Qm9vbGVhbn0gc2VsZiBvciBlbmFibGVkXG4gICogQGFwaSBwcml2YXRlXG4gICovXG5cblN1aXRlLnByb3RvdHlwZS5lbmFibGVUaW1lb3V0cyA9IGZ1bmN0aW9uKGVuYWJsZWQpe1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHRoaXMuX2VuYWJsZVRpbWVvdXRzO1xuICBkZWJ1ZygnZW5hYmxlVGltZW91dHMgJXMnLCBlbmFibGVkKTtcbiAgdGhpcy5fZW5hYmxlVGltZW91dHMgPSBlbmFibGVkO1xuICByZXR1cm4gdGhpcztcbn1cblxuLyoqXG4gKiBTZXQgc2xvdyBgbXNgIG9yIHNob3J0LWhhbmQgc3VjaCBhcyBcIjJzXCIuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ8U3RyaW5nfSBtc1xuICogQHJldHVybiB7U3VpdGV8TnVtYmVyfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblN1aXRlLnByb3RvdHlwZS5zbG93ID0gZnVuY3Rpb24obXMpe1xuICBpZiAoMCA9PT0gYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX3Nsb3c7XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgbXMpIG1zID0gbWlsbGlzZWNvbmRzKG1zKTtcbiAgZGVidWcoJ3Nsb3cgJWQnLCBtcyk7XG4gIHRoaXMuX3Nsb3cgPSBtcztcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldHMgd2hldGhlciB0byBiYWlsIGFmdGVyIGZpcnN0IGVycm9yLlxuICpcbiAqIEBwYXJtYSB7Qm9vbGVhbn0gYmFpbFxuICogQHJldHVybiB7U3VpdGV8TnVtYmVyfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblN1aXRlLnByb3RvdHlwZS5iYWlsID0gZnVuY3Rpb24oYmFpbCl7XG4gIGlmICgwID09IGFyZ3VtZW50cy5sZW5ndGgpIHJldHVybiB0aGlzLl9iYWlsO1xuICBkZWJ1ZygnYmFpbCAlcycsIGJhaWwpO1xuICB0aGlzLl9iYWlsID0gYmFpbDtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJ1biBgZm4odGVzdFssIGRvbmVdKWAgYmVmb3JlIHJ1bm5pbmcgdGVzdHMuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1N1aXRlfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblN1aXRlLnByb3RvdHlwZS5iZWZvcmVBbGwgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICBpZiAodGhpcy5wZW5kaW5nKSByZXR1cm4gdGhpcztcbiAgaWYgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0aXRsZSkge1xuICAgIGZuID0gdGl0bGU7XG4gICAgdGl0bGUgPSBmbi5uYW1lO1xuICB9XG4gIHRpdGxlID0gJ1wiYmVmb3JlIGFsbFwiIGhvb2snICsgKHRpdGxlID8gJzogJyArIHRpdGxlIDogJycpO1xuXG4gIHZhciBob29rID0gbmV3IEhvb2sodGl0bGUsIGZuKTtcbiAgaG9vay5wYXJlbnQgPSB0aGlzO1xuICBob29rLnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICBob29rLmVuYWJsZVRpbWVvdXRzKHRoaXMuZW5hYmxlVGltZW91dHMoKSk7XG4gIGhvb2suc2xvdyh0aGlzLnNsb3coKSk7XG4gIGhvb2suY3R4ID0gdGhpcy5jdHg7XG4gIHRoaXMuX2JlZm9yZUFsbC5wdXNoKGhvb2spO1xuICB0aGlzLmVtaXQoJ2JlZm9yZUFsbCcsIGhvb2spO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUnVuIGBmbih0ZXN0WywgZG9uZV0pYCBhZnRlciBydW5uaW5nIHRlc3RzLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtTdWl0ZX0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYWZ0ZXJBbGwgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICBpZiAodGhpcy5wZW5kaW5nKSByZXR1cm4gdGhpcztcbiAgaWYgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0aXRsZSkge1xuICAgIGZuID0gdGl0bGU7XG4gICAgdGl0bGUgPSBmbi5uYW1lO1xuICB9XG4gIHRpdGxlID0gJ1wiYWZ0ZXIgYWxsXCIgaG9vaycgKyAodGl0bGUgPyAnOiAnICsgdGl0bGUgOiAnJyk7XG5cbiAgdmFyIGhvb2sgPSBuZXcgSG9vayh0aXRsZSwgZm4pO1xuICBob29rLnBhcmVudCA9IHRoaXM7XG4gIGhvb2sudGltZW91dCh0aGlzLnRpbWVvdXQoKSk7XG4gIGhvb2suZW5hYmxlVGltZW91dHModGhpcy5lbmFibGVUaW1lb3V0cygpKTtcbiAgaG9vay5zbG93KHRoaXMuc2xvdygpKTtcbiAgaG9vay5jdHggPSB0aGlzLmN0eDtcbiAgdGhpcy5fYWZ0ZXJBbGwucHVzaChob29rKTtcbiAgdGhpcy5lbWl0KCdhZnRlckFsbCcsIGhvb2spO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUnVuIGBmbih0ZXN0WywgZG9uZV0pYCBiZWZvcmUgZWFjaCB0ZXN0IGNhc2UuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1N1aXRlfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblN1aXRlLnByb3RvdHlwZS5iZWZvcmVFYWNoID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgaWYgKHRoaXMucGVuZGluZykgcmV0dXJuIHRoaXM7XG4gIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGl0bGUpIHtcbiAgICBmbiA9IHRpdGxlO1xuICAgIHRpdGxlID0gZm4ubmFtZTtcbiAgfVxuICB0aXRsZSA9ICdcImJlZm9yZSBlYWNoXCIgaG9vaycgKyAodGl0bGUgPyAnOiAnICsgdGl0bGUgOiAnJyk7XG5cbiAgdmFyIGhvb2sgPSBuZXcgSG9vayh0aXRsZSwgZm4pO1xuICBob29rLnBhcmVudCA9IHRoaXM7XG4gIGhvb2sudGltZW91dCh0aGlzLnRpbWVvdXQoKSk7XG4gIGhvb2suZW5hYmxlVGltZW91dHModGhpcy5lbmFibGVUaW1lb3V0cygpKTtcbiAgaG9vay5zbG93KHRoaXMuc2xvdygpKTtcbiAgaG9vay5jdHggPSB0aGlzLmN0eDtcbiAgdGhpcy5fYmVmb3JlRWFjaC5wdXNoKGhvb2spO1xuICB0aGlzLmVtaXQoJ2JlZm9yZUVhY2gnLCBob29rKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJ1biBgZm4odGVzdFssIGRvbmVdKWAgYWZ0ZXIgZWFjaCB0ZXN0IGNhc2UuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1N1aXRlfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblN1aXRlLnByb3RvdHlwZS5hZnRlckVhY2ggPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICBpZiAodGhpcy5wZW5kaW5nKSByZXR1cm4gdGhpcztcbiAgaWYgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0aXRsZSkge1xuICAgIGZuID0gdGl0bGU7XG4gICAgdGl0bGUgPSBmbi5uYW1lO1xuICB9XG4gIHRpdGxlID0gJ1wiYWZ0ZXIgZWFjaFwiIGhvb2snICsgKHRpdGxlID8gJzogJyArIHRpdGxlIDogJycpO1xuXG4gIHZhciBob29rID0gbmV3IEhvb2sodGl0bGUsIGZuKTtcbiAgaG9vay5wYXJlbnQgPSB0aGlzO1xuICBob29rLnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICBob29rLmVuYWJsZVRpbWVvdXRzKHRoaXMuZW5hYmxlVGltZW91dHMoKSk7XG4gIGhvb2suc2xvdyh0aGlzLnNsb3coKSk7XG4gIGhvb2suY3R4ID0gdGhpcy5jdHg7XG4gIHRoaXMuX2FmdGVyRWFjaC5wdXNoKGhvb2spO1xuICB0aGlzLmVtaXQoJ2FmdGVyRWFjaCcsIGhvb2spO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQWRkIGEgdGVzdCBgc3VpdGVgLlxuICpcbiAqIEBwYXJhbSB7U3VpdGV9IHN1aXRlXG4gKiBAcmV0dXJuIHtTdWl0ZX0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYWRkU3VpdGUgPSBmdW5jdGlvbihzdWl0ZSl7XG4gIHN1aXRlLnBhcmVudCA9IHRoaXM7XG4gIHN1aXRlLnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICBzdWl0ZS5lbmFibGVUaW1lb3V0cyh0aGlzLmVuYWJsZVRpbWVvdXRzKCkpO1xuICBzdWl0ZS5zbG93KHRoaXMuc2xvdygpKTtcbiAgc3VpdGUuYmFpbCh0aGlzLmJhaWwoKSk7XG4gIHRoaXMuc3VpdGVzLnB1c2goc3VpdGUpO1xuICB0aGlzLmVtaXQoJ3N1aXRlJywgc3VpdGUpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQWRkIGEgYHRlc3RgIHRvIHRoaXMgc3VpdGUuXG4gKlxuICogQHBhcmFtIHtUZXN0fSB0ZXN0XG4gKiBAcmV0dXJuIHtTdWl0ZX0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYWRkVGVzdCA9IGZ1bmN0aW9uKHRlc3Qpe1xuICB0ZXN0LnBhcmVudCA9IHRoaXM7XG4gIHRlc3QudGltZW91dCh0aGlzLnRpbWVvdXQoKSk7XG4gIHRlc3QuZW5hYmxlVGltZW91dHModGhpcy5lbmFibGVUaW1lb3V0cygpKTtcbiAgdGVzdC5zbG93KHRoaXMuc2xvdygpKTtcbiAgdGVzdC5jdHggPSB0aGlzLmN0eDtcbiAgdGhpcy50ZXN0cy5wdXNoKHRlc3QpO1xuICB0aGlzLmVtaXQoJ3Rlc3QnLCB0ZXN0KTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJldHVybiB0aGUgZnVsbCB0aXRsZSBnZW5lcmF0ZWQgYnkgcmVjdXJzaXZlbHlcbiAqIGNvbmNhdGVuYXRpbmcgdGhlIHBhcmVudCdzIGZ1bGwgdGl0bGUuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuZnVsbFRpdGxlID0gZnVuY3Rpb24oKXtcbiAgaWYgKHRoaXMucGFyZW50KSB7XG4gICAgdmFyIGZ1bGwgPSB0aGlzLnBhcmVudC5mdWxsVGl0bGUoKTtcbiAgICBpZiAoZnVsbCkgcmV0dXJuIGZ1bGwgKyAnICcgKyB0aGlzLnRpdGxlO1xuICB9XG4gIHJldHVybiB0aGlzLnRpdGxlO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gdGhlIHRvdGFsIG51bWJlciBvZiB0ZXN0cy5cbiAqXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblN1aXRlLnByb3RvdHlwZS50b3RhbCA9IGZ1bmN0aW9uKCl7XG4gIHJldHVybiB1dGlscy5yZWR1Y2UodGhpcy5zdWl0ZXMsIGZ1bmN0aW9uKHN1bSwgc3VpdGUpe1xuICAgIHJldHVybiBzdW0gKyBzdWl0ZS50b3RhbCgpO1xuICB9LCAwKSArIHRoaXMudGVzdHMubGVuZ3RoO1xufTtcblxuLyoqXG4gKiBJdGVyYXRlcyB0aHJvdWdoIGVhY2ggc3VpdGUgcmVjdXJzaXZlbHkgdG8gZmluZFxuICogYWxsIHRlc3RzLiBBcHBsaWVzIGEgZnVuY3Rpb24gaW4gdGhlIGZvcm1hdFxuICogYGZuKHRlc3QpYC5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7U3VpdGV9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuZWFjaFRlc3QgPSBmdW5jdGlvbihmbil7XG4gIHV0aWxzLmZvckVhY2godGhpcy50ZXN0cywgZm4pO1xuICB1dGlscy5mb3JFYWNoKHRoaXMuc3VpdGVzLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgc3VpdGUuZWFjaFRlc3QoZm4pO1xuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG59KTsgLy8gbW9kdWxlOiBzdWl0ZS5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwidGVzdC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIFJ1bm5hYmxlID0gcmVxdWlyZSgnLi9ydW5uYWJsZScpO1xuXG4vKipcbiAqIEV4cG9zZSBgVGVzdGAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBUZXN0O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFRlc3RgIHdpdGggdGhlIGdpdmVuIGB0aXRsZWAgYW5kIGNhbGxiYWNrIGBmbmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHRpdGxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gVGVzdCh0aXRsZSwgZm4pIHtcbiAgUnVubmFibGUuY2FsbCh0aGlzLCB0aXRsZSwgZm4pO1xuICB0aGlzLnBlbmRpbmcgPSAhZm47XG4gIHRoaXMudHlwZSA9ICd0ZXN0Jztcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYFJ1bm5hYmxlLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IFJ1bm5hYmxlLnByb3RvdHlwZTtcblRlc3QucHJvdG90eXBlID0gbmV3IEY7XG5UZXN0LnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFRlc3Q7XG5cblxufSk7IC8vIG1vZHVsZTogdGVzdC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwidXRpbHMuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgZnMgPSByZXF1aXJlKCdicm93c2VyL2ZzJylcbiAgLCBwYXRoID0gcmVxdWlyZSgnYnJvd3Nlci9wYXRoJylcbiAgLCBqb2luID0gcGF0aC5qb2luXG4gICwgZGVidWcgPSByZXF1aXJlKCdicm93c2VyL2RlYnVnJykoJ21vY2hhOndhdGNoJyk7XG5cbi8qKlxuICogSWdub3JlZCBkaXJlY3Rvcmllcy5cbiAqL1xuXG52YXIgaWdub3JlID0gWydub2RlX21vZHVsZXMnLCAnLmdpdCddO1xuXG4vKipcbiAqIEVzY2FwZSBzcGVjaWFsIGNoYXJhY3RlcnMgaW4gdGhlIGdpdmVuIHN0cmluZyBvZiBodG1sLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gaHRtbFxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5lc2NhcGUgPSBmdW5jdGlvbihodG1sKXtcbiAgcmV0dXJuIFN0cmluZyhodG1sKVxuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpO1xufTtcblxuLyoqXG4gKiBBcnJheSNmb3JFYWNoICg8PUlFOClcbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBwYXJhbSB7T2JqZWN0fSBzY29wZVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5mb3JFYWNoID0gZnVuY3Rpb24oYXJyLCBmbiwgc2NvcGUpe1xuICBmb3IgKHZhciBpID0gMCwgbCA9IGFyci5sZW5ndGg7IGkgPCBsOyBpKyspXG4gICAgZm4uY2FsbChzY29wZSwgYXJyW2ldLCBpKTtcbn07XG5cbi8qKlxuICogQXJyYXkjbWFwICg8PUlFOClcbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBwYXJhbSB7T2JqZWN0fSBzY29wZVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5tYXAgPSBmdW5jdGlvbihhcnIsIGZuLCBzY29wZSl7XG4gIHZhciByZXN1bHQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBhcnIubGVuZ3RoOyBpIDwgbDsgaSsrKVxuICAgIHJlc3VsdC5wdXNoKGZuLmNhbGwoc2NvcGUsIGFycltpXSwgaSkpO1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBBcnJheSNpbmRleE9mICg8PUlFOClcbiAqXG4gKiBAcGFybWEge0FycmF5fSBhcnJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogdG8gZmluZCBpbmRleCBvZlxuICogQHBhcmFtIHtOdW1iZXJ9IHN0YXJ0XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLmluZGV4T2YgPSBmdW5jdGlvbihhcnIsIG9iaiwgc3RhcnQpe1xuICBmb3IgKHZhciBpID0gc3RhcnQgfHwgMCwgbCA9IGFyci5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBpZiAoYXJyW2ldID09PSBvYmopXG4gICAgICByZXR1cm4gaTtcbiAgfVxuICByZXR1cm4gLTE7XG59O1xuXG4vKipcbiAqIEFycmF5I3JlZHVjZSAoPD1JRTgpXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJyYXlcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcGFyYW0ge09iamVjdH0gaW5pdGlhbCB2YWx1ZVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5yZWR1Y2UgPSBmdW5jdGlvbihhcnIsIGZuLCB2YWwpe1xuICB2YXIgcnZhbCA9IHZhbDtcblxuICBmb3IgKHZhciBpID0gMCwgbCA9IGFyci5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICBydmFsID0gZm4ocnZhbCwgYXJyW2ldLCBpLCBhcnIpO1xuICB9XG5cbiAgcmV0dXJuIHJ2YWw7XG59O1xuXG4vKipcbiAqIEFycmF5I2ZpbHRlciAoPD1JRTgpXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJyYXlcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLmZpbHRlciA9IGZ1bmN0aW9uKGFyciwgZm4pe1xuICB2YXIgcmV0ID0gW107XG5cbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBhcnIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgdmFyIHZhbCA9IGFycltpXTtcbiAgICBpZiAoZm4odmFsLCBpLCBhcnIpKSByZXQucHVzaCh2YWwpO1xuICB9XG5cbiAgcmV0dXJuIHJldDtcbn07XG5cbi8qKlxuICogT2JqZWN0LmtleXMgKDw9SUU4KVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge0FycmF5fSBrZXlzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLmtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbihvYmopIHtcbiAgdmFyIGtleXMgPSBbXVxuICAgICwgaGFzID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSAvLyBmb3IgYHdpbmRvd2Agb24gPD1JRThcblxuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKGhhcy5jYWxsKG9iaiwga2V5KSkge1xuICAgICAga2V5cy5wdXNoKGtleSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGtleXM7XG59O1xuXG4vKipcbiAqIFdhdGNoIHRoZSBnaXZlbiBgZmlsZXNgIGZvciBjaGFuZ2VzXG4gKiBhbmQgaW52b2tlIGBmbihmaWxlKWAgb24gbW9kaWZpY2F0aW9uLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGZpbGVzXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy53YXRjaCA9IGZ1bmN0aW9uKGZpbGVzLCBmbil7XG4gIHZhciBvcHRpb25zID0geyBpbnRlcnZhbDogMTAwIH07XG4gIGZpbGVzLmZvckVhY2goZnVuY3Rpb24oZmlsZSl7XG4gICAgZGVidWcoJ2ZpbGUgJXMnLCBmaWxlKTtcbiAgICBmcy53YXRjaEZpbGUoZmlsZSwgb3B0aW9ucywgZnVuY3Rpb24oY3VyciwgcHJldil7XG4gICAgICBpZiAocHJldi5tdGltZSA8IGN1cnIubXRpbWUpIGZuKGZpbGUpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8qKlxuICogSWdub3JlZCBmaWxlcy5cbiAqL1xuXG5mdW5jdGlvbiBpZ25vcmVkKHBhdGgpe1xuICByZXR1cm4gIX5pZ25vcmUuaW5kZXhPZihwYXRoKTtcbn1cblxuLyoqXG4gKiBMb29rdXAgZmlsZXMgaW4gdGhlIGdpdmVuIGBkaXJgLlxuICpcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5maWxlcyA9IGZ1bmN0aW9uKGRpciwgZXh0LCByZXQpe1xuICByZXQgPSByZXQgfHwgW107XG4gIGV4dCA9IGV4dCB8fCBbJ2pzJ107XG5cbiAgdmFyIHJlID0gbmV3IFJlZ0V4cCgnXFxcXC4oJyArIGV4dC5qb2luKCd8JykgKyAnKSQnKTtcblxuICBmcy5yZWFkZGlyU3luYyhkaXIpXG4gIC5maWx0ZXIoaWdub3JlZClcbiAgLmZvckVhY2goZnVuY3Rpb24ocGF0aCl7XG4gICAgcGF0aCA9IGpvaW4oZGlyLCBwYXRoKTtcbiAgICBpZiAoZnMuc3RhdFN5bmMocGF0aCkuaXNEaXJlY3RvcnkoKSkge1xuICAgICAgZXhwb3J0cy5maWxlcyhwYXRoLCBleHQsIHJldCk7XG4gICAgfSBlbHNlIGlmIChwYXRoLm1hdGNoKHJlKSkge1xuICAgICAgcmV0LnB1c2gocGF0aCk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gcmV0O1xufTtcblxuLyoqXG4gKiBDb21wdXRlIGEgc2x1ZyBmcm9tIHRoZSBnaXZlbiBgc3RyYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLnNsdWcgPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyXG4gICAgLnRvTG93ZXJDYXNlKClcbiAgICAucmVwbGFjZSgvICsvZywgJy0nKVxuICAgIC5yZXBsYWNlKC9bXi1cXHddL2csICcnKTtcbn07XG5cbi8qKlxuICogU3RyaXAgdGhlIGZ1bmN0aW9uIGRlZmluaXRpb24gZnJvbSBgc3RyYCxcbiAqIGFuZCByZS1pbmRlbnQgZm9yIHByZSB3aGl0ZXNwYWNlLlxuICovXG5cbmV4cG9ydHMuY2xlYW4gPSBmdW5jdGlvbihzdHIpIHtcbiAgc3RyID0gc3RyXG4gICAgLnJlcGxhY2UoL1xcclxcbj98W1xcblxcdTIwMjhcXHUyMDI5XS9nLCBcIlxcblwiKS5yZXBsYWNlKC9eXFx1RkVGRi8sICcnKVxuICAgIC5yZXBsYWNlKC9eZnVuY3Rpb24gKlxcKC4qXFwpICp7fFxcKC4qXFwpICo9PiAqez8vLCAnJylcbiAgICAucmVwbGFjZSgvXFxzK1xcfSQvLCAnJyk7XG5cbiAgdmFyIHNwYWNlcyA9IHN0ci5tYXRjaCgvXlxcbj8oICopLylbMV0ubGVuZ3RoXG4gICAgLCB0YWJzID0gc3RyLm1hdGNoKC9eXFxuPyhcXHQqKS8pWzFdLmxlbmd0aFxuICAgICwgcmUgPSBuZXcgUmVnRXhwKCdeXFxuPycgKyAodGFicyA/ICdcXHQnIDogJyAnKSArICd7JyArICh0YWJzID8gdGFicyA6IHNwYWNlcykgKyAnfScsICdnbScpO1xuXG4gIHN0ciA9IHN0ci5yZXBsYWNlKHJlLCAnJyk7XG5cbiAgcmV0dXJuIGV4cG9ydHMudHJpbShzdHIpO1xufTtcblxuLyoqXG4gKiBFc2NhcGUgcmVndWxhciBleHByZXNzaW9uIGNoYXJhY3RlcnMgaW4gYHN0cmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5lc2NhcGVSZWdleHAgPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL1stXFxcXF4kKis/LigpfFtcXF17fV0vZywgXCJcXFxcJCZcIik7XG59O1xuXG4vKipcbiAqIFRyaW0gdGhlIGdpdmVuIGBzdHJgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMudHJpbSA9IGZ1bmN0aW9uKHN0cil7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpO1xufTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gYHFzYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gcXNcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMucGFyc2VRdWVyeSA9IGZ1bmN0aW9uKHFzKXtcbiAgcmV0dXJuIGV4cG9ydHMucmVkdWNlKHFzLnJlcGxhY2UoJz8nLCAnJykuc3BsaXQoJyYnKSwgZnVuY3Rpb24ob2JqLCBwYWlyKXtcbiAgICB2YXIgaSA9IHBhaXIuaW5kZXhPZignPScpXG4gICAgICAsIGtleSA9IHBhaXIuc2xpY2UoMCwgaSlcbiAgICAgICwgdmFsID0gcGFpci5zbGljZSgrK2kpO1xuXG4gICAgb2JqW2tleV0gPSBkZWNvZGVVUklDb21wb25lbnQodmFsKTtcbiAgICByZXR1cm4gb2JqO1xuICB9LCB7fSk7XG59O1xuXG4vKipcbiAqIEhpZ2hsaWdodCB0aGUgZ2l2ZW4gc3RyaW5nIG9mIGBqc2AuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGpzXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBoaWdobGlnaHQoanMpIHtcbiAgcmV0dXJuIGpzXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAucmVwbGFjZSgvXFwvXFwvKC4qKS9nbSwgJzxzcGFuIGNsYXNzPVwiY29tbWVudFwiPi8vJDE8L3NwYW4+JylcbiAgICAucmVwbGFjZSgvKCcuKj8nKS9nbSwgJzxzcGFuIGNsYXNzPVwic3RyaW5nXCI+JDE8L3NwYW4+JylcbiAgICAucmVwbGFjZSgvKFxcZCtcXC5cXGQrKS9nbSwgJzxzcGFuIGNsYXNzPVwibnVtYmVyXCI+JDE8L3NwYW4+JylcbiAgICAucmVwbGFjZSgvKFxcZCspL2dtLCAnPHNwYW4gY2xhc3M9XCJudW1iZXJcIj4kMTwvc3Bhbj4nKVxuICAgIC5yZXBsYWNlKC9cXGJuZXdbIFxcdF0rKFxcdyspL2dtLCAnPHNwYW4gY2xhc3M9XCJrZXl3b3JkXCI+bmV3PC9zcGFuPiA8c3BhbiBjbGFzcz1cImluaXRcIj4kMTwvc3Bhbj4nKVxuICAgIC5yZXBsYWNlKC9cXGIoZnVuY3Rpb258bmV3fHRocm93fHJldHVybnx2YXJ8aWZ8ZWxzZSlcXGIvZ20sICc8c3BhbiBjbGFzcz1cImtleXdvcmRcIj4kMTwvc3Bhbj4nKVxufVxuXG4vKipcbiAqIEhpZ2hsaWdodCB0aGUgY29udGVudHMgb2YgdGFnIGBuYW1lYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5oaWdobGlnaHRUYWdzID0gZnVuY3Rpb24obmFtZSkge1xuICB2YXIgY29kZSA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKG5hbWUpO1xuICBmb3IgKHZhciBpID0gMCwgbGVuID0gY29kZS5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgIGNvZGVbaV0uaW5uZXJIVE1MID0gaGlnaGxpZ2h0KGNvZGVbaV0uaW5uZXJIVE1MKTtcbiAgfVxufTtcblxuXG4vKipcbiAqIFN0cmluZ2lmeSBgb2JqYC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLnN0cmluZ2lmeSA9IGZ1bmN0aW9uKG9iaikge1xuICBpZiAob2JqIGluc3RhbmNlb2YgUmVnRXhwKSByZXR1cm4gb2JqLnRvU3RyaW5nKCk7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShleHBvcnRzLmNhbm9uaWNhbGl6ZShvYmopLCBudWxsLCAyKS5yZXBsYWNlKC8sKFxcbnwkKS9nLCAnJDEnKTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBuZXcgb2JqZWN0IHRoYXQgaGFzIHRoZSBrZXlzIGluIHNvcnRlZCBvcmRlci5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuY2Fub25pY2FsaXplID0gZnVuY3Rpb24ob2JqLCBzdGFjaykge1xuICAgc3RhY2sgPSBzdGFjayB8fCBbXTtcblxuICAgaWYgKGV4cG9ydHMuaW5kZXhPZihzdGFjaywgb2JqKSAhPT0gLTEpIHJldHVybiAnW0NpcmN1bGFyXSc7XG5cbiAgIHZhciBjYW5vbmljYWxpemVkT2JqO1xuXG4gICBpZiAoe30udG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBBcnJheV0nKSB7XG4gICAgIHN0YWNrLnB1c2gob2JqKTtcbiAgICAgY2Fub25pY2FsaXplZE9iaiA9IGV4cG9ydHMubWFwKG9iaiwgZnVuY3Rpb24oaXRlbSkge1xuICAgICAgIHJldHVybiBleHBvcnRzLmNhbm9uaWNhbGl6ZShpdGVtLCBzdGFjayk7XG4gICAgIH0pO1xuICAgICBzdGFjay5wb3AoKTtcbiAgIH0gZWxzZSBpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiYgb2JqICE9PSBudWxsKSB7XG4gICAgIHN0YWNrLnB1c2gob2JqKTtcbiAgICAgY2Fub25pY2FsaXplZE9iaiA9IHt9O1xuICAgICBleHBvcnRzLmZvckVhY2goZXhwb3J0cy5rZXlzKG9iaikuc29ydCgpLCBmdW5jdGlvbihrZXkpIHtcbiAgICAgICBjYW5vbmljYWxpemVkT2JqW2tleV0gPSBleHBvcnRzLmNhbm9uaWNhbGl6ZShvYmpba2V5XSwgc3RhY2spO1xuICAgICB9KTtcbiAgICAgc3RhY2sucG9wKCk7XG4gICB9IGVsc2Uge1xuICAgICBjYW5vbmljYWxpemVkT2JqID0gb2JqO1xuICAgfVxuXG4gICByZXR1cm4gY2Fub25pY2FsaXplZE9iajtcbiB9XG5cbn0pOyAvLyBtb2R1bGU6IHV0aWxzLmpzXG4vLyBUaGUgZ2xvYmFsIG9iamVjdCBpcyBcInNlbGZcIiBpbiBXZWIgV29ya2Vycy5cbnZhciBnbG9iYWwgPSAoZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzOyB9KSgpO1xuXG4vKipcbiAqIFNhdmUgdGltZXIgcmVmZXJlbmNlcyB0byBhdm9pZCBTaW5vbiBpbnRlcmZlcmluZyAoc2VlIEdILTIzNykuXG4gKi9cblxudmFyIERhdGUgPSBnbG9iYWwuRGF0ZTtcbnZhciBzZXRUaW1lb3V0ID0gZ2xvYmFsLnNldFRpbWVvdXQ7XG52YXIgc2V0SW50ZXJ2YWwgPSBnbG9iYWwuc2V0SW50ZXJ2YWw7XG52YXIgY2xlYXJUaW1lb3V0ID0gZ2xvYmFsLmNsZWFyVGltZW91dDtcbnZhciBjbGVhckludGVydmFsID0gZ2xvYmFsLmNsZWFySW50ZXJ2YWw7XG5cbi8qKlxuICogTm9kZSBzaGltcy5cbiAqXG4gKiBUaGVzZSBhcmUgbWVhbnQgb25seSB0byBhbGxvd1xuICogbW9jaGEuanMgdG8gcnVuIHVudG91Y2hlZCwgbm90XG4gKiB0byBhbGxvdyBydW5uaW5nIG5vZGUgY29kZSBpblxuICogdGhlIGJyb3dzZXIuXG4gKi9cblxudmFyIHByb2Nlc3MgPSB7fTtcbnByb2Nlc3MuZXhpdCA9IGZ1bmN0aW9uKHN0YXR1cyl7fTtcbnByb2Nlc3Muc3Rkb3V0ID0ge307XG5cbnZhciB1bmNhdWdodEV4Y2VwdGlvbkhhbmRsZXJzID0gW107XG5cbnZhciBvcmlnaW5hbE9uZXJyb3JIYW5kbGVyID0gZ2xvYmFsLm9uZXJyb3I7XG5cbi8qKlxuICogUmVtb3ZlIHVuY2F1Z2h0RXhjZXB0aW9uIGxpc3RlbmVyLlxuICogUmV2ZXJ0IHRvIG9yaWdpbmFsIG9uZXJyb3IgaGFuZGxlciBpZiBwcmV2aW91c2x5IGRlZmluZWQuXG4gKi9cblxucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uKGUsIGZuKXtcbiAgaWYgKCd1bmNhdWdodEV4Y2VwdGlvbicgPT0gZSkge1xuICAgIGlmIChvcmlnaW5hbE9uZXJyb3JIYW5kbGVyKSB7XG4gICAgICBnbG9iYWwub25lcnJvciA9IG9yaWdpbmFsT25lcnJvckhhbmRsZXI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGdsb2JhbC5vbmVycm9yID0gZnVuY3Rpb24oKSB7fTtcbiAgICB9XG4gICAgdmFyIGkgPSBNb2NoYS51dGlscy5pbmRleE9mKHVuY2F1Z2h0RXhjZXB0aW9uSGFuZGxlcnMsIGZuKTtcbiAgICBpZiAoaSAhPSAtMSkgeyB1bmNhdWdodEV4Y2VwdGlvbkhhbmRsZXJzLnNwbGljZShpLCAxKTsgfVxuICB9XG59O1xuXG4vKipcbiAqIEltcGxlbWVudHMgdW5jYXVnaHRFeGNlcHRpb24gbGlzdGVuZXIuXG4gKi9cblxucHJvY2Vzcy5vbiA9IGZ1bmN0aW9uKGUsIGZuKXtcbiAgaWYgKCd1bmNhdWdodEV4Y2VwdGlvbicgPT0gZSkge1xuICAgIGdsb2JhbC5vbmVycm9yID0gZnVuY3Rpb24oZXJyLCB1cmwsIGxpbmUpe1xuICAgICAgZm4obmV3IEVycm9yKGVyciArICcgKCcgKyB1cmwgKyAnOicgKyBsaW5lICsgJyknKSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9O1xuICAgIHVuY2F1Z2h0RXhjZXB0aW9uSGFuZGxlcnMucHVzaChmbik7XG4gIH1cbn07XG5cbi8qKlxuICogRXhwb3NlIG1vY2hhLlxuICovXG5cbnZhciBNb2NoYSA9IGdsb2JhbC5Nb2NoYSA9IHJlcXVpcmUoJ21vY2hhJyksXG4gICAgbW9jaGEgPSBnbG9iYWwubW9jaGEgPSBuZXcgTW9jaGEoeyByZXBvcnRlcjogJ2h0bWwnIH0pO1xuXG4vLyBUaGUgQkREIFVJIGlzIHJlZ2lzdGVyZWQgYnkgZGVmYXVsdCwgYnV0IG5vIFVJIHdpbGwgYmUgZnVuY3Rpb25hbCBpbiB0aGVcbi8vIGJyb3dzZXIgd2l0aG91dCBhbiBleHBsaWNpdCBjYWxsIHRvIHRoZSBvdmVycmlkZGVuIGBtb2NoYS51aWAgKHNlZSBiZWxvdykuXG4vLyBFbnN1cmUgdGhhdCB0aGlzIGRlZmF1bHQgVUkgZG9lcyBub3QgZXhwb3NlIGl0cyBtZXRob2RzIHRvIHRoZSBnbG9iYWwgc2NvcGUuXG5tb2NoYS5zdWl0ZS5yZW1vdmVBbGxMaXN0ZW5lcnMoJ3ByZS1yZXF1aXJlJyk7XG5cbnZhciBpbW1lZGlhdGVRdWV1ZSA9IFtdXG4gICwgaW1tZWRpYXRlVGltZW91dDtcblxuZnVuY3Rpb24gdGltZXNsaWNlKCkge1xuICB2YXIgaW1tZWRpYXRlU3RhcnQgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgd2hpbGUgKGltbWVkaWF0ZVF1ZXVlLmxlbmd0aCAmJiAobmV3IERhdGUoKS5nZXRUaW1lKCkgLSBpbW1lZGlhdGVTdGFydCkgPCAxMDApIHtcbiAgICBpbW1lZGlhdGVRdWV1ZS5zaGlmdCgpKCk7XG4gIH1cbiAgaWYgKGltbWVkaWF0ZVF1ZXVlLmxlbmd0aCkge1xuICAgIGltbWVkaWF0ZVRpbWVvdXQgPSBzZXRUaW1lb3V0KHRpbWVzbGljZSwgMCk7XG4gIH0gZWxzZSB7XG4gICAgaW1tZWRpYXRlVGltZW91dCA9IG51bGw7XG4gIH1cbn1cblxuLyoqXG4gKiBIaWdoLXBlcmZvcm1hbmNlIG92ZXJyaWRlIG9mIFJ1bm5lci5pbW1lZGlhdGVseS5cbiAqL1xuXG5Nb2NoYS5SdW5uZXIuaW1tZWRpYXRlbHkgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICBpbW1lZGlhdGVRdWV1ZS5wdXNoKGNhbGxiYWNrKTtcbiAgaWYgKCFpbW1lZGlhdGVUaW1lb3V0KSB7XG4gICAgaW1tZWRpYXRlVGltZW91dCA9IHNldFRpbWVvdXQodGltZXNsaWNlLCAwKTtcbiAgfVxufTtcblxuLyoqXG4gKiBGdW5jdGlvbiB0byBhbGxvdyBhc3NlcnRpb24gbGlicmFyaWVzIHRvIHRocm93IGVycm9ycyBkaXJlY3RseSBpbnRvIG1vY2hhLlxuICogVGhpcyBpcyB1c2VmdWwgd2hlbiBydW5uaW5nIHRlc3RzIGluIGEgYnJvd3NlciBiZWNhdXNlIHdpbmRvdy5vbmVycm9yIHdpbGxcbiAqIG9ubHkgcmVjZWl2ZSB0aGUgJ21lc3NhZ2UnIGF0dHJpYnV0ZSBvZiB0aGUgRXJyb3IuXG4gKi9cbm1vY2hhLnRocm93RXJyb3IgPSBmdW5jdGlvbihlcnIpIHtcbiAgTW9jaGEudXRpbHMuZm9yRWFjaCh1bmNhdWdodEV4Y2VwdGlvbkhhbmRsZXJzLCBmdW5jdGlvbiAoZm4pIHtcbiAgICBmbihlcnIpO1xuICB9KTtcbiAgdGhyb3cgZXJyO1xufTtcblxuLyoqXG4gKiBPdmVycmlkZSB1aSB0byBlbnN1cmUgdGhhdCB0aGUgdWkgZnVuY3Rpb25zIGFyZSBpbml0aWFsaXplZC5cbiAqIE5vcm1hbGx5IHRoaXMgd291bGQgaGFwcGVuIGluIE1vY2hhLnByb3RvdHlwZS5sb2FkRmlsZXMuXG4gKi9cblxubW9jaGEudWkgPSBmdW5jdGlvbih1aSl7XG4gIE1vY2hhLnByb3RvdHlwZS51aS5jYWxsKHRoaXMsIHVpKTtcbiAgdGhpcy5zdWl0ZS5lbWl0KCdwcmUtcmVxdWlyZScsIGdsb2JhbCwgbnVsbCwgdGhpcyk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXR1cCBtb2NoYSB3aXRoIHRoZSBnaXZlbiBzZXR0aW5nIG9wdGlvbnMuXG4gKi9cblxubW9jaGEuc2V0dXAgPSBmdW5jdGlvbihvcHRzKXtcbiAgaWYgKCdzdHJpbmcnID09IHR5cGVvZiBvcHRzKSBvcHRzID0geyB1aTogb3B0cyB9O1xuICBmb3IgKHZhciBvcHQgaW4gb3B0cykgdGhpc1tvcHRdKG9wdHNbb3B0XSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSdW4gbW9jaGEsIHJldHVybmluZyB0aGUgUnVubmVyLlxuICovXG5cbm1vY2hhLnJ1biA9IGZ1bmN0aW9uKGZuKXtcbiAgdmFyIG9wdGlvbnMgPSBtb2NoYS5vcHRpb25zO1xuICBtb2NoYS5nbG9iYWxzKCdsb2NhdGlvbicpO1xuXG4gIHZhciBxdWVyeSA9IE1vY2hhLnV0aWxzLnBhcnNlUXVlcnkoZ2xvYmFsLmxvY2F0aW9uLnNlYXJjaCB8fCAnJyk7XG4gIGlmIChxdWVyeS5ncmVwKSBtb2NoYS5ncmVwKHF1ZXJ5LmdyZXApO1xuICBpZiAocXVlcnkuaW52ZXJ0KSBtb2NoYS5pbnZlcnQoKTtcblxuICByZXR1cm4gTW9jaGEucHJvdG90eXBlLnJ1bi5jYWxsKG1vY2hhLCBmdW5jdGlvbihlcnIpe1xuICAgIC8vIFRoZSBET00gRG9jdW1lbnQgaXMgbm90IGF2YWlsYWJsZSBpbiBXZWIgV29ya2Vycy5cbiAgICBpZiAoZ2xvYmFsLmRvY3VtZW50KSB7XG4gICAgICBNb2NoYS51dGlscy5oaWdobGlnaHRUYWdzKCdjb2RlJyk7XG4gICAgfVxuICAgIGlmIChmbikgZm4oZXJyKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIEV4cG9zZSB0aGUgcHJvY2VzcyBzaGltLlxuICovXG5cbk1vY2hhLnByb2Nlc3MgPSBwcm9jZXNzO1xufSkoKTsiLCJAY2hhcnNldCBcInV0Zi04XCI7XG5cbmJvZHkge1xuICBtYXJnaW46MDtcbn1cblxuI21vY2hhIHtcbiAgZm9udDogMjBweC8xLjUgXCJIZWx2ZXRpY2EgTmV1ZVwiLCBIZWx2ZXRpY2EsIEFyaWFsLCBzYW5zLXNlcmlmO1xuICBtYXJnaW46IDYwcHggNTBweDtcbn1cblxuI21vY2hhIHVsLFxuI21vY2hhIGxpIHtcbiAgbWFyZ2luOiAwO1xuICBwYWRkaW5nOiAwO1xufVxuXG4jbW9jaGEgdWwge1xuICBsaXN0LXN0eWxlOiBub25lO1xufVxuXG4jbW9jaGEgaDEsXG4jbW9jaGEgaDIge1xuICBtYXJnaW46IDA7XG59XG5cbiNtb2NoYSBoMSB7XG4gIG1hcmdpbi10b3A6IDE1cHg7XG4gIGZvbnQtc2l6ZTogMWVtO1xuICBmb250LXdlaWdodDogMjAwO1xufVxuXG4jbW9jaGEgaDEgYSB7XG4gIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcbiAgY29sb3I6IGluaGVyaXQ7XG59XG5cbiNtb2NoYSBoMSBhOmhvdmVyIHtcbiAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XG59XG5cbiNtb2NoYSAuc3VpdGUgLnN1aXRlIGgxIHtcbiAgbWFyZ2luLXRvcDogMDtcbiAgZm9udC1zaXplOiAuOGVtO1xufVxuXG4jbW9jaGEgLmhpZGRlbiB7XG4gIGRpc3BsYXk6IG5vbmU7XG59XG5cbiNtb2NoYSBoMiB7XG4gIGZvbnQtc2l6ZTogMTJweDtcbiAgZm9udC13ZWlnaHQ6IG5vcm1hbDtcbiAgY3Vyc29yOiBwb2ludGVyO1xufVxuXG4jbW9jaGEgLnN1aXRlIHtcbiAgbWFyZ2luLWxlZnQ6IDE1cHg7XG59XG5cbiNtb2NoYSAudGVzdCB7XG4gIG1hcmdpbi1sZWZ0OiAxNXB4O1xuICBvdmVyZmxvdzogaGlkZGVuO1xufVxuXG4jbW9jaGEgLnRlc3QucGVuZGluZzpob3ZlciBoMjo6YWZ0ZXIge1xuICBjb250ZW50OiAnKHBlbmRpbmcpJztcbiAgZm9udC1mYW1pbHk6IGFyaWFsLCBzYW5zLXNlcmlmO1xufVxuXG4jbW9jaGEgLnRlc3QucGFzcy5tZWRpdW0gLmR1cmF0aW9uIHtcbiAgYmFja2dyb3VuZDogI2MwOTg1Mztcbn1cblxuI21vY2hhIC50ZXN0LnBhc3Muc2xvdyAuZHVyYXRpb24ge1xuICBiYWNrZ3JvdW5kOiAjYjk0YTQ4O1xufVxuXG4jbW9jaGEgLnRlc3QucGFzczo6YmVmb3JlIHtcbiAgY29udGVudDogJ+Kckyc7XG4gIGZvbnQtc2l6ZTogMTJweDtcbiAgZGlzcGxheTogYmxvY2s7XG4gIGZsb2F0OiBsZWZ0O1xuICBtYXJnaW4tcmlnaHQ6IDVweDtcbiAgY29sb3I6ICMwMGQ2YjI7XG59XG5cbiNtb2NoYSAudGVzdC5wYXNzIC5kdXJhdGlvbiB7XG4gIGZvbnQtc2l6ZTogOXB4O1xuICBtYXJnaW4tbGVmdDogNXB4O1xuICBwYWRkaW5nOiAycHggNXB4O1xuICBjb2xvcjogI2ZmZjtcbiAgLXdlYmtpdC1ib3gtc2hhZG93OiBpbnNldCAwIDFweCAxcHggcmdiYSgwLDAsMCwuMik7XG4gIC1tb3otYm94LXNoYWRvdzogaW5zZXQgMCAxcHggMXB4IHJnYmEoMCwwLDAsLjIpO1xuICBib3gtc2hhZG93OiBpbnNldCAwIDFweCAxcHggcmdiYSgwLDAsMCwuMik7XG4gIC13ZWJraXQtYm9yZGVyLXJhZGl1czogNXB4O1xuICAtbW96LWJvcmRlci1yYWRpdXM6IDVweDtcbiAgLW1zLWJvcmRlci1yYWRpdXM6IDVweDtcbiAgLW8tYm9yZGVyLXJhZGl1czogNXB4O1xuICBib3JkZXItcmFkaXVzOiA1cHg7XG59XG5cbiNtb2NoYSAudGVzdC5wYXNzLmZhc3QgLmR1cmF0aW9uIHtcbiAgZGlzcGxheTogbm9uZTtcbn1cblxuI21vY2hhIC50ZXN0LnBlbmRpbmcge1xuICBjb2xvcjogIzBiOTdjNDtcbn1cblxuI21vY2hhIC50ZXN0LnBlbmRpbmc6OmJlZm9yZSB7XG4gIGNvbnRlbnQ6ICfil6YnO1xuICBjb2xvcjogIzBiOTdjNDtcbn1cblxuI21vY2hhIC50ZXN0LmZhaWwge1xuICBjb2xvcjogI2MwMDtcbn1cblxuI21vY2hhIC50ZXN0LmZhaWwgcHJlIHtcbiAgY29sb3I6IGJsYWNrO1xufVxuXG4jbW9jaGEgLnRlc3QuZmFpbDo6YmVmb3JlIHtcbiAgY29udGVudDogJ+Kclic7XG4gIGZvbnQtc2l6ZTogMTJweDtcbiAgZGlzcGxheTogYmxvY2s7XG4gIGZsb2F0OiBsZWZ0O1xuICBtYXJnaW4tcmlnaHQ6IDVweDtcbiAgY29sb3I6ICNjMDA7XG59XG5cbiNtb2NoYSAudGVzdCBwcmUuZXJyb3Ige1xuICBjb2xvcjogI2MwMDtcbiAgbWF4LWhlaWdodDogMzAwcHg7XG4gIG92ZXJmbG93OiBhdXRvO1xufVxuXG4vKipcbiAqICgxKTogYXBwcm94aW1hdGUgZm9yIGJyb3dzZXJzIG5vdCBzdXBwb3J0aW5nIGNhbGNcbiAqICgyKTogNDIgPSAyKjE1ICsgMioxMCArIDIqMSAocGFkZGluZyArIG1hcmdpbiArIGJvcmRlcilcbiAqICAgICAgXl4gc2VyaW91c2x5XG4gKi9cbiNtb2NoYSAudGVzdCBwcmUge1xuICBkaXNwbGF5OiBibG9jaztcbiAgZmxvYXQ6IGxlZnQ7XG4gIGNsZWFyOiBsZWZ0O1xuICBmb250OiAxMnB4LzEuNSBtb25hY28sIG1vbm9zcGFjZTtcbiAgbWFyZ2luOiA1cHg7XG4gIHBhZGRpbmc6IDE1cHg7XG4gIGJvcmRlcjogMXB4IHNvbGlkICNlZWU7XG4gIG1heC13aWR0aDogODUlOyAvKigxKSovXG4gIG1heC13aWR0aDogY2FsYygxMDAlIC0gNDJweCk7IC8qKDIpKi9cbiAgd29yZC13cmFwOiBicmVhay13b3JkO1xuICBib3JkZXItYm90dG9tLWNvbG9yOiAjZGRkO1xuICAtd2Via2l0LWJvcmRlci1yYWRpdXM6IDNweDtcbiAgLXdlYmtpdC1ib3gtc2hhZG93OiAwIDFweCAzcHggI2VlZTtcbiAgLW1vei1ib3JkZXItcmFkaXVzOiAzcHg7XG4gIC1tb3otYm94LXNoYWRvdzogMCAxcHggM3B4ICNlZWU7XG4gIGJvcmRlci1yYWRpdXM6IDNweDtcbn1cblxuI21vY2hhIC50ZXN0IGgyIHtcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xufVxuXG4jbW9jaGEgLnRlc3QgYS5yZXBsYXkge1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHRvcDogM3B4O1xuICByaWdodDogMDtcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xuICB2ZXJ0aWNhbC1hbGlnbjogbWlkZGxlO1xuICBkaXNwbGF5OiBibG9jaztcbiAgd2lkdGg6IDE1cHg7XG4gIGhlaWdodDogMTVweDtcbiAgbGluZS1oZWlnaHQ6IDE1cHg7XG4gIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgYmFja2dyb3VuZDogI2VlZTtcbiAgZm9udC1zaXplOiAxNXB4O1xuICAtbW96LWJvcmRlci1yYWRpdXM6IDE1cHg7XG4gIGJvcmRlci1yYWRpdXM6IDE1cHg7XG4gIC13ZWJraXQtdHJhbnNpdGlvbjogb3BhY2l0eSAyMDBtcztcbiAgLW1vei10cmFuc2l0aW9uOiBvcGFjaXR5IDIwMG1zO1xuICB0cmFuc2l0aW9uOiBvcGFjaXR5IDIwMG1zO1xuICBvcGFjaXR5OiAwLjM7XG4gIGNvbG9yOiAjODg4O1xufVxuXG4jbW9jaGEgLnRlc3Q6aG92ZXIgYS5yZXBsYXkge1xuICBvcGFjaXR5OiAxO1xufVxuXG4jbW9jaGEtcmVwb3J0LnBhc3MgLnRlc3QuZmFpbCB7XG4gIGRpc3BsYXk6IG5vbmU7XG59XG5cbiNtb2NoYS1yZXBvcnQuZmFpbCAudGVzdC5wYXNzIHtcbiAgZGlzcGxheTogbm9uZTtcbn1cblxuI21vY2hhLXJlcG9ydC5wZW5kaW5nIC50ZXN0LnBhc3MsXG4jbW9jaGEtcmVwb3J0LnBlbmRpbmcgLnRlc3QuZmFpbCB7XG4gIGRpc3BsYXk6IG5vbmU7XG59XG4jbW9jaGEtcmVwb3J0LnBlbmRpbmcgLnRlc3QucGFzcy5wZW5kaW5nIHtcbiAgZGlzcGxheTogYmxvY2s7XG59XG5cbiNtb2NoYS1lcnJvciB7XG4gIGNvbG9yOiAjYzAwO1xuICBmb250LXNpemU6IDEuNWVtO1xuICBmb250LXdlaWdodDogMTAwO1xuICBsZXR0ZXItc3BhY2luZzogMXB4O1xufVxuXG4jbW9jaGEtc3RhdHMge1xuICBwb3NpdGlvbjogZml4ZWQ7XG4gIHRvcDogMTVweDtcbiAgcmlnaHQ6IDEwcHg7XG4gIGZvbnQtc2l6ZTogMTJweDtcbiAgbWFyZ2luOiAwO1xuICBjb2xvcjogIzg4ODtcbiAgei1pbmRleDogMTtcbn1cblxuI21vY2hhLXN0YXRzIC5wcm9ncmVzcyB7XG4gIGZsb2F0OiByaWdodDtcbiAgcGFkZGluZy10b3A6IDA7XG59XG5cbiNtb2NoYS1zdGF0cyBlbSB7XG4gIGNvbG9yOiBibGFjaztcbn1cblxuI21vY2hhLXN0YXRzIGEge1xuICB0ZXh0LWRlY29yYXRpb246IG5vbmU7XG4gIGNvbG9yOiBpbmhlcml0O1xufVxuXG4jbW9jaGEtc3RhdHMgYTpob3ZlciB7XG4gIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZWVlO1xufVxuXG4jbW9jaGEtc3RhdHMgbGkge1xuICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gIG1hcmdpbjogMCA1cHg7XG4gIGxpc3Qtc3R5bGU6IG5vbmU7XG4gIHBhZGRpbmctdG9wOiAxMXB4O1xufVxuXG4jbW9jaGEtc3RhdHMgY2FudmFzIHtcbiAgd2lkdGg6IDQwcHg7XG4gIGhlaWdodDogNDBweDtcbn1cblxuI21vY2hhIGNvZGUgLmNvbW1lbnQgeyBjb2xvcjogI2RkZDsgfVxuI21vY2hhIGNvZGUgLmluaXQgeyBjb2xvcjogIzJmNmZhZDsgfVxuI21vY2hhIGNvZGUgLnN0cmluZyB7IGNvbG9yOiAjNTg5MGFkOyB9XG4jbW9jaGEgY29kZSAua2V5d29yZCB7IGNvbG9yOiAjOGE2MzQzOyB9XG4jbW9jaGEgY29kZSAubnVtYmVyIHsgY29sb3I6ICMyZjZmYWQ7IH1cblxuQG1lZGlhIHNjcmVlbiBhbmQgKG1heC1kZXZpY2Utd2lkdGg6IDQ4MHB4KSB7XG4gICNtb2NoYSB7XG4gICAgbWFyZ2luOiA2MHB4IDBweDtcbiAgfVxuXG4gICNtb2NoYSAjc3RhdHMge1xuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgfVxufVxuIiwiOyhmdW5jdGlvbigpe1xuXG4vKipcbiAqIFJlcXVpcmUgdGhlIGdpdmVuIHBhdGguXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAqIEByZXR1cm4ge09iamVjdH0gZXhwb3J0c1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiByZXF1aXJlKHBhdGgsIHBhcmVudCwgb3JpZykge1xuICB2YXIgcmVzb2x2ZWQgPSByZXF1aXJlLnJlc29sdmUocGF0aCk7XG5cbiAgLy8gbG9va3VwIGZhaWxlZFxuICBpZiAobnVsbCA9PSByZXNvbHZlZCkge1xuICAgIG9yaWcgPSBvcmlnIHx8IHBhdGg7XG4gICAgcGFyZW50ID0gcGFyZW50IHx8ICdyb290JztcbiAgICB2YXIgZXJyID0gbmV3IEVycm9yKCdGYWlsZWQgdG8gcmVxdWlyZSBcIicgKyBvcmlnICsgJ1wiIGZyb20gXCInICsgcGFyZW50ICsgJ1wiJyk7XG4gICAgZXJyLnBhdGggPSBvcmlnO1xuICAgIGVyci5wYXJlbnQgPSBwYXJlbnQ7XG4gICAgZXJyLnJlcXVpcmUgPSB0cnVlO1xuICAgIHRocm93IGVycjtcbiAgfVxuXG4gIHZhciBtb2R1bGUgPSByZXF1aXJlLm1vZHVsZXNbcmVzb2x2ZWRdO1xuXG4gIC8vIHBlcmZvcm0gcmVhbCByZXF1aXJlKClcbiAgLy8gYnkgaW52b2tpbmcgdGhlIG1vZHVsZSdzXG4gIC8vIHJlZ2lzdGVyZWQgZnVuY3Rpb25cbiAgaWYgKCFtb2R1bGUuX3Jlc29sdmluZyAmJiAhbW9kdWxlLmV4cG9ydHMpIHtcbiAgICB2YXIgbW9kID0ge307XG4gICAgbW9kLmV4cG9ydHMgPSB7fTtcbiAgICBtb2QuY2xpZW50ID0gbW9kLmNvbXBvbmVudCA9IHRydWU7XG4gICAgbW9kdWxlLl9yZXNvbHZpbmcgPSB0cnVlO1xuICAgIG1vZHVsZS5jYWxsKHRoaXMsIG1vZC5leHBvcnRzLCByZXF1aXJlLnJlbGF0aXZlKHJlc29sdmVkKSwgbW9kKTtcbiAgICBkZWxldGUgbW9kdWxlLl9yZXNvbHZpbmc7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBtb2QuZXhwb3J0cztcbiAgfVxuXG4gIHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuLyoqXG4gKiBSZWdpc3RlcmVkIG1vZHVsZXMuXG4gKi9cblxucmVxdWlyZS5tb2R1bGVzID0ge307XG5cbi8qKlxuICogUmVnaXN0ZXJlZCBhbGlhc2VzLlxuICovXG5cbnJlcXVpcmUuYWxpYXNlcyA9IHt9O1xuXG4vKipcbiAqIFJlc29sdmUgYHBhdGhgLlxuICpcbiAqIExvb2t1cDpcbiAqXG4gKiAgIC0gUEFUSC9pbmRleC5qc1xuICogICAtIFBBVEguanNcbiAqICAgLSBQQVRIXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAqIEByZXR1cm4ge1N0cmluZ30gcGF0aCBvciBudWxsXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5yZXF1aXJlLnJlc29sdmUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIGlmIChwYXRoLmNoYXJBdCgwKSA9PT0gJy8nKSBwYXRoID0gcGF0aC5zbGljZSgxKTtcblxuICB2YXIgcGF0aHMgPSBbXG4gICAgcGF0aCxcbiAgICBwYXRoICsgJy5qcycsXG4gICAgcGF0aCArICcuanNvbicsXG4gICAgcGF0aCArICcvaW5kZXguanMnLFxuICAgIHBhdGggKyAnL2luZGV4Lmpzb24nXG4gIF07XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXRocy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBwYXRoID0gcGF0aHNbaV07XG4gICAgaWYgKHJlcXVpcmUubW9kdWxlcy5oYXNPd25Qcm9wZXJ0eShwYXRoKSkgcmV0dXJuIHBhdGg7XG4gICAgaWYgKHJlcXVpcmUuYWxpYXNlcy5oYXNPd25Qcm9wZXJ0eShwYXRoKSkgcmV0dXJuIHJlcXVpcmUuYWxpYXNlc1twYXRoXTtcbiAgfVxufTtcblxuLyoqXG4gKiBOb3JtYWxpemUgYHBhdGhgIHJlbGF0aXZlIHRvIHRoZSBjdXJyZW50IHBhdGguXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGN1cnJcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5yZXF1aXJlLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKGN1cnIsIHBhdGgpIHtcbiAgdmFyIHNlZ3MgPSBbXTtcblxuICBpZiAoJy4nICE9IHBhdGguY2hhckF0KDApKSByZXR1cm4gcGF0aDtcblxuICBjdXJyID0gY3Vyci5zcGxpdCgnLycpO1xuICBwYXRoID0gcGF0aC5zcGxpdCgnLycpO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcGF0aC5sZW5ndGg7ICsraSkge1xuICAgIGlmICgnLi4nID09IHBhdGhbaV0pIHtcbiAgICAgIGN1cnIucG9wKCk7XG4gICAgfSBlbHNlIGlmICgnLicgIT0gcGF0aFtpXSAmJiAnJyAhPSBwYXRoW2ldKSB7XG4gICAgICBzZWdzLnB1c2gocGF0aFtpXSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGN1cnIuY29uY2F0KHNlZ3MpLmpvaW4oJy8nKTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXIgbW9kdWxlIGF0IGBwYXRoYCB3aXRoIGNhbGxiYWNrIGBkZWZpbml0aW9uYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZGVmaW5pdGlvblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxucmVxdWlyZS5yZWdpc3RlciA9IGZ1bmN0aW9uKHBhdGgsIGRlZmluaXRpb24pIHtcbiAgcmVxdWlyZS5tb2R1bGVzW3BhdGhdID0gZGVmaW5pdGlvbjtcbn07XG5cbi8qKlxuICogQWxpYXMgYSBtb2R1bGUgZGVmaW5pdGlvbi5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZnJvbVxuICogQHBhcmFtIHtTdHJpbmd9IHRvXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5yZXF1aXJlLmFsaWFzID0gZnVuY3Rpb24oZnJvbSwgdG8pIHtcbiAgaWYgKCFyZXF1aXJlLm1vZHVsZXMuaGFzT3duUHJvcGVydHkoZnJvbSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBhbGlhcyBcIicgKyBmcm9tICsgJ1wiLCBpdCBkb2VzIG5vdCBleGlzdCcpO1xuICB9XG4gIHJlcXVpcmUuYWxpYXNlc1t0b10gPSBmcm9tO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYSByZXF1aXJlIGZ1bmN0aW9uIHJlbGF0aXZlIHRvIHRoZSBgcGFyZW50YCBwYXRoLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXJlbnRcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxucmVxdWlyZS5yZWxhdGl2ZSA9IGZ1bmN0aW9uKHBhcmVudCkge1xuICB2YXIgcCA9IHJlcXVpcmUubm9ybWFsaXplKHBhcmVudCwgJy4uJyk7XG5cbiAgLyoqXG4gICAqIGxhc3RJbmRleE9mIGhlbHBlci5cbiAgICovXG5cbiAgZnVuY3Rpb24gbGFzdEluZGV4T2YoYXJyLCBvYmopIHtcbiAgICB2YXIgaSA9IGFyci5sZW5ndGg7XG4gICAgd2hpbGUgKGktLSkge1xuICAgICAgaWYgKGFycltpXSA9PT0gb2JqKSByZXR1cm4gaTtcbiAgICB9XG4gICAgcmV0dXJuIC0xO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSByZWxhdGl2ZSByZXF1aXJlKCkgaXRzZWxmLlxuICAgKi9cblxuICBmdW5jdGlvbiBsb2NhbFJlcXVpcmUocGF0aCkge1xuICAgIHZhciByZXNvbHZlZCA9IGxvY2FsUmVxdWlyZS5yZXNvbHZlKHBhdGgpO1xuICAgIHJldHVybiByZXF1aXJlKHJlc29sdmVkLCBwYXJlbnQsIHBhdGgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc29sdmUgcmVsYXRpdmUgdG8gdGhlIHBhcmVudC5cbiAgICovXG5cbiAgbG9jYWxSZXF1aXJlLnJlc29sdmUgPSBmdW5jdGlvbihwYXRoKSB7XG4gICAgdmFyIGMgPSBwYXRoLmNoYXJBdCgwKTtcbiAgICBpZiAoJy8nID09IGMpIHJldHVybiBwYXRoLnNsaWNlKDEpO1xuICAgIGlmICgnLicgPT0gYykgcmV0dXJuIHJlcXVpcmUubm9ybWFsaXplKHAsIHBhdGgpO1xuXG4gICAgLy8gcmVzb2x2ZSBkZXBzIGJ5IHJldHVybmluZ1xuICAgIC8vIHRoZSBkZXAgaW4gdGhlIG5lYXJlc3QgXCJkZXBzXCJcbiAgICAvLyBkaXJlY3RvcnlcbiAgICB2YXIgc2VncyA9IHBhcmVudC5zcGxpdCgnLycpO1xuICAgIHZhciBpID0gbGFzdEluZGV4T2Yoc2VncywgJ2RlcHMnKSArIDE7XG4gICAgaWYgKCFpKSBpID0gMDtcbiAgICBwYXRoID0gc2Vncy5zbGljZSgwLCBpICsgMSkuam9pbignLycpICsgJy9kZXBzLycgKyBwYXRoO1xuICAgIHJldHVybiBwYXRoO1xuICB9O1xuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBtb2R1bGUgaXMgZGVmaW5lZCBhdCBgcGF0aGAuXG4gICAqL1xuXG4gIGxvY2FsUmVxdWlyZS5leGlzdHMgPSBmdW5jdGlvbihwYXRoKSB7XG4gICAgcmV0dXJuIHJlcXVpcmUubW9kdWxlcy5oYXNPd25Qcm9wZXJ0eShsb2NhbFJlcXVpcmUucmVzb2x2ZShwYXRoKSk7XG4gIH07XG5cbiAgcmV0dXJuIGxvY2FsUmVxdWlyZTtcbn07XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaWpzLWFzc2VydGlvbi1lcnJvci9pbmRleC5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBhc3NlcnRpb24tZXJyb3JcbiAqIENvcHlyaWdodChjKSAyMDEzIEpha2UgTHVlciA8amFrZUBxdWFsaWFuY3kuY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyohXG4gKiBSZXR1cm4gYSBmdW5jdGlvbiB0aGF0IHdpbGwgY29weSBwcm9wZXJ0aWVzIGZyb21cbiAqIG9uZSBvYmplY3QgdG8gYW5vdGhlciBleGNsdWRpbmcgYW55IG9yaWdpbmFsbHlcbiAqIGxpc3RlZC4gUmV0dXJuZWQgZnVuY3Rpb24gd2lsbCBjcmVhdGUgYSBuZXcgYHt9YC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZXhjbHVkZWQgcHJvcGVydGllcyAuLi5cbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICovXG5cbmZ1bmN0aW9uIGV4Y2x1ZGUgKCkge1xuICB2YXIgZXhjbHVkZXMgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cbiAgZnVuY3Rpb24gZXhjbHVkZVByb3BzIChyZXMsIG9iaikge1xuICAgIE9iamVjdC5rZXlzKG9iaikuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICBpZiAoIX5leGNsdWRlcy5pbmRleE9mKGtleSkpIHJlc1trZXldID0gb2JqW2tleV07XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gZnVuY3Rpb24gZXh0ZW5kRXhjbHVkZSAoKSB7XG4gICAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cylcbiAgICAgICwgaSA9IDBcbiAgICAgICwgcmVzID0ge307XG5cbiAgICBmb3IgKDsgaSA8IGFyZ3MubGVuZ3RoOyBpKyspIHtcbiAgICAgIGV4Y2x1ZGVQcm9wcyhyZXMsIGFyZ3NbaV0pO1xuICAgIH1cblxuICAgIHJldHVybiByZXM7XG4gIH07XG59O1xuXG4vKiFcbiAqIFByaW1hcnkgRXhwb3J0c1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gQXNzZXJ0aW9uRXJyb3I7XG5cbi8qKlxuICogIyMjIEFzc2VydGlvbkVycm9yXG4gKlxuICogQW4gZXh0ZW5zaW9uIG9mIHRoZSBKYXZhU2NyaXB0IGBFcnJvcmAgY29uc3RydWN0b3IgZm9yXG4gKiBhc3NlcnRpb24gYW5kIHZhbGlkYXRpb24gc2NlbmFyaW9zLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvcGVydGllcyB0byBpbmNsdWRlIChvcHRpb25hbClcbiAqIEBwYXJhbSB7Y2FsbGVlfSBzdGFydCBzdGFjayBmdW5jdGlvbiAob3B0aW9uYWwpXG4gKi9cblxuZnVuY3Rpb24gQXNzZXJ0aW9uRXJyb3IgKG1lc3NhZ2UsIF9wcm9wcywgc3NmKSB7XG4gIHZhciBleHRlbmQgPSBleGNsdWRlKCduYW1lJywgJ21lc3NhZ2UnLCAnc3RhY2snLCAnY29uc3RydWN0b3InLCAndG9KU09OJylcbiAgICAsIHByb3BzID0gZXh0ZW5kKF9wcm9wcyB8fCB7fSk7XG5cbiAgLy8gZGVmYXVsdCB2YWx1ZXNcbiAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZSB8fCAnVW5zcGVjaWZpZWQgQXNzZXJ0aW9uRXJyb3InO1xuICB0aGlzLnNob3dEaWZmID0gZmFsc2U7XG5cbiAgLy8gY29weSBmcm9tIHByb3BlcnRpZXNcbiAgZm9yICh2YXIga2V5IGluIHByb3BzKSB7XG4gICAgdGhpc1trZXldID0gcHJvcHNba2V5XTtcbiAgfVxuXG4gIC8vIGNhcHR1cmUgc3RhY2sgdHJhY2VcbiAgc3NmID0gc3NmIHx8IGFyZ3VtZW50cy5jYWxsZWU7XG4gIGlmIChzc2YgJiYgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UpIHtcbiAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSh0aGlzLCBzc2YpO1xuICB9XG59XG5cbi8qIVxuICogSW5oZXJpdCBmcm9tIEVycm9yLnByb3RvdHlwZVxuICovXG5cbkFzc2VydGlvbkVycm9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoRXJyb3IucHJvdG90eXBlKTtcblxuLyohXG4gKiBTdGF0aWNhbGx5IHNldCBuYW1lXG4gKi9cblxuQXNzZXJ0aW9uRXJyb3IucHJvdG90eXBlLm5hbWUgPSAnQXNzZXJ0aW9uRXJyb3InO1xuXG4vKiFcbiAqIEVuc3VyZSBjb3JyZWN0IGNvbnN0cnVjdG9yXG4gKi9cblxuQXNzZXJ0aW9uRXJyb3IucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gQXNzZXJ0aW9uRXJyb3I7XG5cbi8qKlxuICogQWxsb3cgZXJyb3JzIHRvIGJlIGNvbnZlcnRlZCB0byBKU09OIGZvciBzdGF0aWMgdHJhbnNmZXIuXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBpbmNsdWRlIHN0YWNrIChkZWZhdWx0OiBgdHJ1ZWApXG4gKiBAcmV0dXJuIHtPYmplY3R9IG9iamVjdCB0aGF0IGNhbiBiZSBgSlNPTi5zdHJpbmdpZnlgXG4gKi9cblxuQXNzZXJ0aW9uRXJyb3IucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uIChzdGFjaykge1xuICB2YXIgZXh0ZW5kID0gZXhjbHVkZSgnY29uc3RydWN0b3InLCAndG9KU09OJywgJ3N0YWNrJylcbiAgICAsIHByb3BzID0gZXh0ZW5kKHsgbmFtZTogdGhpcy5uYW1lIH0sIHRoaXMpO1xuXG4gIC8vIGluY2x1ZGUgc3RhY2sgaWYgZXhpc3RzIGFuZCBub3QgdHVybmVkIG9mZlxuICBpZiAoZmFsc2UgIT09IHN0YWNrICYmIHRoaXMuc3RhY2spIHtcbiAgICBwcm9wcy5zdGFjayA9IHRoaXMuc3RhY2s7XG4gIH1cblxuICByZXR1cm4gcHJvcHM7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpanMtdHlwZS1kZXRlY3QvbGliL3R5cGUuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogdHlwZS1kZXRlY3RcbiAqIENvcHlyaWdodChjKSAyMDEzIGpha2UgbHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyohXG4gKiBQcmltYXJ5IEV4cG9ydHNcbiAqL1xuXG52YXIgZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gZ2V0VHlwZTtcblxuLyohXG4gKiBEZXRlY3RhYmxlIGphdmFzY3JpcHQgbmF0aXZlc1xuICovXG5cbnZhciBuYXRpdmVzID0ge1xuICAgICdbb2JqZWN0IEFycmF5XSc6ICdhcnJheSdcbiAgLCAnW29iamVjdCBSZWdFeHBdJzogJ3JlZ2V4cCdcbiAgLCAnW29iamVjdCBGdW5jdGlvbl0nOiAnZnVuY3Rpb24nXG4gICwgJ1tvYmplY3QgQXJndW1lbnRzXSc6ICdhcmd1bWVudHMnXG4gICwgJ1tvYmplY3QgRGF0ZV0nOiAnZGF0ZSdcbn07XG5cbi8qKlxuICogIyMjIHR5cGVPZiAob2JqKVxuICpcbiAqIFVzZSBzZXZlcmFsIGRpZmZlcmVudCB0ZWNobmlxdWVzIHRvIGRldGVybWluZVxuICogdGhlIHR5cGUgb2Ygb2JqZWN0IGJlaW5nIHRlc3RlZC5cbiAqXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gb2JqZWN0XG4gKiBAcmV0dXJuIHtTdHJpbmd9IG9iamVjdCB0eXBlXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGdldFR5cGUgKG9iaikge1xuICB2YXIgc3RyID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaik7XG4gIGlmIChuYXRpdmVzW3N0cl0pIHJldHVybiBuYXRpdmVzW3N0cl07XG4gIGlmIChvYmogPT09IG51bGwpIHJldHVybiAnbnVsbCc7XG4gIGlmIChvYmogPT09IHVuZGVmaW5lZCkgcmV0dXJuICd1bmRlZmluZWQnO1xuICBpZiAob2JqID09PSBPYmplY3Qob2JqKSkgcmV0dXJuICdvYmplY3QnO1xuICByZXR1cm4gdHlwZW9mIG9iajtcbn1cblxuZXhwb3J0cy5MaWJyYXJ5ID0gTGlicmFyeTtcblxuLyoqXG4gKiAjIyMgTGlicmFyeVxuICpcbiAqIENyZWF0ZSBhIHJlcG9zaXRvcnkgZm9yIGN1c3RvbSB0eXBlIGRldGVjdGlvbi5cbiAqXG4gKiBgYGBqc1xuICogdmFyIGxpYiA9IG5ldyB0eXBlLkxpYnJhcnk7XG4gKiBgYGBcbiAqXG4gKi9cblxuZnVuY3Rpb24gTGlicmFyeSAoKSB7XG4gIHRoaXMudGVzdHMgPSB7fTtcbn1cblxuLyoqXG4gKiAjIyMjIC5vZiAob2JqKVxuICpcbiAqIEV4cG9zZSByZXBsYWNlbWVudCBgdHlwZW9mYCBkZXRlY3Rpb24gdG8gdGhlIGxpYnJhcnkuXG4gKlxuICogYGBganNcbiAqIGlmICgnc3RyaW5nJyA9PT0gbGliLm9mKCdoZWxsbyB3b3JsZCcpKSB7XG4gKiAgIC8vIC4uLlxuICogfVxuICogYGBgXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gb2JqZWN0IHRvIHRlc3RcbiAqIEByZXR1cm4ge1N0cmluZ30gdHlwZVxuICovXG5cbkxpYnJhcnkucHJvdG90eXBlLm9mID0gZ2V0VHlwZTtcblxuLyoqXG4gKiAjIyMjIC5kZWZpbmUgKHR5cGUsIHRlc3QpXG4gKlxuICogQWRkIGEgdGVzdCB0byBmb3IgdGhlIGAudGVzdCgpYCBhc3NlcnRpb24uXG4gKlxuICogQ2FuIGJlIGRlZmluZWQgYXMgYSByZWd1bGFyIGV4cHJlc3Npb246XG4gKlxuICogYGBganNcbiAqIGxpYi5kZWZpbmUoJ2ludCcsIC9eWzAtOV0rJC8pO1xuICogYGBgXG4gKlxuICogLi4uIG9yIGFzIGEgZnVuY3Rpb246XG4gKlxuICogYGBganNcbiAqIGxpYi5kZWZpbmUoJ2JsbicsIGZ1bmN0aW9uIChvYmopIHtcbiAqICAgaWYgKCdib29sZWFuJyA9PT0gbGliLm9mKG9iaikpIHJldHVybiB0cnVlO1xuICogICB2YXIgYmxucyA9IFsgJ3llcycsICdubycsICd0cnVlJywgJ2ZhbHNlJywgMSwgMCBdO1xuICogICBpZiAoJ3N0cmluZycgPT09IGxpYi5vZihvYmopKSBvYmogPSBvYmoudG9Mb3dlckNhc2UoKTtcbiAqICAgcmV0dXJuICEhIH5ibG5zLmluZGV4T2Yob2JqKTtcbiAqIH0pO1xuICogYGBgXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGVcbiAqIEBwYXJhbSB7UmVnRXhwfEZ1bmN0aW9ufSB0ZXN0XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkxpYnJhcnkucHJvdG90eXBlLmRlZmluZSA9IGZ1bmN0aW9uICh0eXBlLCB0ZXN0KSB7XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSByZXR1cm4gdGhpcy50ZXN0c1t0eXBlXTtcbiAgdGhpcy50ZXN0c1t0eXBlXSA9IHRlc3Q7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiAjIyMjIC50ZXN0IChvYmosIHRlc3QpXG4gKlxuICogQXNzZXJ0IHRoYXQgYW4gb2JqZWN0IGlzIG9mIHR5cGUuIFdpbGwgZmlyc3RcbiAqIGNoZWNrIG5hdGl2ZXMsIGFuZCBpZiB0aGF0IGRvZXMgbm90IHBhc3MgaXQgd2lsbFxuICogdXNlIHRoZSB1c2VyIGRlZmluZWQgY3VzdG9tIHRlc3RzLlxuICpcbiAqIGBgYGpzXG4gKiBhc3NlcnQobGliLnRlc3QoJzEnLCAnaW50JykpO1xuICogYXNzZXJ0KGxpYi50ZXN0KCd5ZXMnLCAnYmxuJykpO1xuICogYGBgXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gb2JqZWN0XG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZVxuICogQHJldHVybiB7Qm9vbGVhbn0gcmVzdWx0XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkxpYnJhcnkucHJvdG90eXBlLnRlc3QgPSBmdW5jdGlvbiAob2JqLCB0eXBlKSB7XG4gIGlmICh0eXBlID09PSBnZXRUeXBlKG9iaikpIHJldHVybiB0cnVlO1xuICB2YXIgdGVzdCA9IHRoaXMudGVzdHNbdHlwZV07XG5cbiAgaWYgKHRlc3QgJiYgJ3JlZ2V4cCcgPT09IGdldFR5cGUodGVzdCkpIHtcbiAgICByZXR1cm4gdGVzdC50ZXN0KG9iaik7XG4gIH0gZWxzZSBpZiAodGVzdCAmJiAnZnVuY3Rpb24nID09PSBnZXRUeXBlKHRlc3QpKSB7XG4gICAgcmV0dXJuIHRlc3Qob2JqKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgUmVmZXJlbmNlRXJyb3IoJ1R5cGUgdGVzdCBcIicgKyB0eXBlICsgJ1wiIG5vdCBkZWZpbmVkIG9yIGludmFsaWQuJyk7XG4gIH1cbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWlqcy1kZWVwLWVxbC9saWIvZXFsLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIGRlZXAtZXFsXG4gKiBDb3B5cmlnaHQoYykgMjAxMyBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qIVxuICogTW9kdWxlIGRlcGVuZGVuY2llc1xuICovXG5cbnZhciB0eXBlID0gcmVxdWlyZSgndHlwZS1kZXRlY3QnKTtcblxuLyohXG4gKiBCdWZmZXIuaXNCdWZmZXIgYnJvd3NlciBzaGltXG4gKi9cblxudmFyIEJ1ZmZlcjtcbnRyeSB7IEJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlcjsgfVxuY2F0Y2goZXgpIHtcbiAgQnVmZmVyID0ge307XG4gIEJ1ZmZlci5pc0J1ZmZlciA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gZmFsc2U7IH1cbn1cblxuLyohXG4gKiBQcmltYXJ5IEV4cG9ydFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZGVlcEVxdWFsO1xuXG4vKipcbiAqIEFzc2VydCBzdXBlci1zdHJpY3QgKGVnYWwpIGVxdWFsaXR5IGJldHdlZW5cbiAqIHR3byBvYmplY3RzIG9mIGFueSB0eXBlLlxuICpcbiAqIEBwYXJhbSB7TWl4ZWR9IGFcbiAqIEBwYXJhbSB7TWl4ZWR9IGJcbiAqIEBwYXJhbSB7QXJyYXl9IG1lbW9pc2VkIChvcHRpb25hbClcbiAqIEByZXR1cm4ge0Jvb2xlYW59IGVxdWFsIG1hdGNoXG4gKi9cblxuZnVuY3Rpb24gZGVlcEVxdWFsKGEsIGIsIG0pIHtcbiAgaWYgKHNhbWVWYWx1ZShhLCBiKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9IGVsc2UgaWYgKCdkYXRlJyA9PT0gdHlwZShhKSkge1xuICAgIHJldHVybiBkYXRlRXF1YWwoYSwgYik7XG4gIH0gZWxzZSBpZiAoJ3JlZ2V4cCcgPT09IHR5cGUoYSkpIHtcbiAgICByZXR1cm4gcmVnZXhwRXF1YWwoYSwgYik7XG4gIH0gZWxzZSBpZiAoQnVmZmVyLmlzQnVmZmVyKGEpKSB7XG4gICAgcmV0dXJuIGJ1ZmZlckVxdWFsKGEsIGIpO1xuICB9IGVsc2UgaWYgKCdhcmd1bWVudHMnID09PSB0eXBlKGEpKSB7XG4gICAgcmV0dXJuIGFyZ3VtZW50c0VxdWFsKGEsIGIsIG0pO1xuICB9IGVsc2UgaWYgKCF0eXBlRXF1YWwoYSwgYikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH0gZWxzZSBpZiAoKCdvYmplY3QnICE9PSB0eXBlKGEpICYmICdvYmplY3QnICE9PSB0eXBlKGIpKVxuICAmJiAoJ2FycmF5JyAhPT0gdHlwZShhKSAmJiAnYXJyYXknICE9PSB0eXBlKGIpKSkge1xuICAgIHJldHVybiBzYW1lVmFsdWUoYSwgYik7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG9iamVjdEVxdWFsKGEsIGIsIG0pO1xuICB9XG59XG5cbi8qIVxuICogU3RyaWN0IChlZ2FsKSBlcXVhbGl0eSB0ZXN0LiBFbnN1cmVzIHRoYXQgTmFOIGFsd2F5c1xuICogZXF1YWxzIE5hTiBhbmQgYC0wYCBkb2VzIG5vdCBlcXVhbCBgKzBgLlxuICpcbiAqIEBwYXJhbSB7TWl4ZWR9IGFcbiAqIEBwYXJhbSB7TWl4ZWR9IGJcbiAqIEByZXR1cm4ge0Jvb2xlYW59IGVxdWFsIG1hdGNoXG4gKi9cblxuZnVuY3Rpb24gc2FtZVZhbHVlKGEsIGIpIHtcbiAgaWYgKGEgPT09IGIpIHJldHVybiBhICE9PSAwIHx8IDEgLyBhID09PSAxIC8gYjtcbiAgcmV0dXJuIGEgIT09IGEgJiYgYiAhPT0gYjtcbn1cblxuLyohXG4gKiBDb21wYXJlIHRoZSB0eXBlcyBvZiB0d28gZ2l2ZW4gb2JqZWN0cyBhbmRcbiAqIHJldHVybiBpZiB0aGV5IGFyZSBlcXVhbC4gTm90ZSB0aGF0IGFuIEFycmF5XG4gKiBoYXMgYSB0eXBlIG9mIGBhcnJheWAgKG5vdCBgb2JqZWN0YCkgYW5kIGFyZ3VtZW50c1xuICogaGF2ZSBhIHR5cGUgb2YgYGFyZ3VtZW50c2AgKG5vdCBgYXJyYXlgL2BvYmplY3RgKS5cbiAqXG4gKiBAcGFyYW0ge01peGVkfSBhXG4gKiBAcGFyYW0ge01peGVkfSBiXG4gKiBAcmV0dXJuIHtCb29sZWFufSByZXN1bHRcbiAqL1xuXG5mdW5jdGlvbiB0eXBlRXF1YWwoYSwgYikge1xuICByZXR1cm4gdHlwZShhKSA9PT0gdHlwZShiKTtcbn1cblxuLyohXG4gKiBDb21wYXJlIHR3byBEYXRlIG9iamVjdHMgYnkgYXNzZXJ0aW5nIHRoYXRcbiAqIHRoZSB0aW1lIHZhbHVlcyBhcmUgZXF1YWwgdXNpbmcgYHNhdmVWYWx1ZWAuXG4gKlxuICogQHBhcmFtIHtEYXRlfSBhXG4gKiBAcGFyYW0ge0RhdGV9IGJcbiAqIEByZXR1cm4ge0Jvb2xlYW59IHJlc3VsdFxuICovXG5cbmZ1bmN0aW9uIGRhdGVFcXVhbChhLCBiKSB7XG4gIGlmICgnZGF0ZScgIT09IHR5cGUoYikpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIHNhbWVWYWx1ZShhLmdldFRpbWUoKSwgYi5nZXRUaW1lKCkpO1xufVxuXG4vKiFcbiAqIENvbXBhcmUgdHdvIHJlZ3VsYXIgZXhwcmVzc2lvbnMgYnkgY29udmVydGluZyB0aGVtXG4gKiB0byBzdHJpbmcgYW5kIGNoZWNraW5nIGZvciBgc2FtZVZhbHVlYC5cbiAqXG4gKiBAcGFyYW0ge1JlZ0V4cH0gYVxuICogQHBhcmFtIHtSZWdFeHB9IGJcbiAqIEByZXR1cm4ge0Jvb2xlYW59IHJlc3VsdFxuICovXG5cbmZ1bmN0aW9uIHJlZ2V4cEVxdWFsKGEsIGIpIHtcbiAgaWYgKCdyZWdleHAnICE9PSB0eXBlKGIpKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBzYW1lVmFsdWUoYS50b1N0cmluZygpLCBiLnRvU3RyaW5nKCkpO1xufVxuXG4vKiFcbiAqIEFzc2VydCBkZWVwIGVxdWFsaXR5IG9mIHR3byBgYXJndW1lbnRzYCBvYmplY3RzLlxuICogVW5mb3J0dW5hdGVseSwgdGhlc2UgbXVzdCBiZSBzbGljZWQgdG8gYXJyYXlzXG4gKiBwcmlvciB0byB0ZXN0IHRvIGVuc3VyZSBubyBiYWQgYmVoYXZpb3IuXG4gKlxuICogQHBhcmFtIHtBcmd1bWVudHN9IGFcbiAqIEBwYXJhbSB7QXJndW1lbnRzfSBiXG4gKiBAcGFyYW0ge0FycmF5fSBtZW1vaXplIChvcHRpb25hbClcbiAqIEByZXR1cm4ge0Jvb2xlYW59IHJlc3VsdFxuICovXG5cbmZ1bmN0aW9uIGFyZ3VtZW50c0VxdWFsKGEsIGIsIG0pIHtcbiAgaWYgKCdhcmd1bWVudHMnICE9PSB0eXBlKGIpKSByZXR1cm4gZmFsc2U7XG4gIGEgPSBbXS5zbGljZS5jYWxsKGEpO1xuICBiID0gW10uc2xpY2UuY2FsbChiKTtcbiAgcmV0dXJuIGRlZXBFcXVhbChhLCBiLCBtKTtcbn1cblxuLyohXG4gKiBHZXQgZW51bWVyYWJsZSBwcm9wZXJ0aWVzIG9mIGEgZ2l2ZW4gb2JqZWN0LlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBhXG4gKiBAcmV0dXJuIHtBcnJheX0gcHJvcGVydHkgbmFtZXNcbiAqL1xuXG5mdW5jdGlvbiBlbnVtZXJhYmxlKGEpIHtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gYSkgcmVzLnB1c2goa2V5KTtcbiAgcmV0dXJuIHJlcztcbn1cblxuLyohXG4gKiBTaW1wbGUgZXF1YWxpdHkgZm9yIGZsYXQgaXRlcmFibGUgb2JqZWN0c1xuICogc3VjaCBhcyBBcnJheXMgb3IgTm9kZS5qcyBidWZmZXJzLlxuICpcbiAqIEBwYXJhbSB7SXRlcmFibGV9IGFcbiAqIEBwYXJhbSB7SXRlcmFibGV9IGJcbiAqIEByZXR1cm4ge0Jvb2xlYW59IHJlc3VsdFxuICovXG5cbmZ1bmN0aW9uIGl0ZXJhYmxlRXF1YWwoYSwgYikge1xuICBpZiAoYS5sZW5ndGggIT09ICBiLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuXG4gIHZhciBpID0gMDtcbiAgdmFyIG1hdGNoID0gdHJ1ZTtcblxuICBmb3IgKDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoYVtpXSAhPT0gYltpXSkge1xuICAgICAgbWF0Y2ggPSBmYWxzZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtYXRjaDtcbn1cblxuLyohXG4gKiBFeHRlbnNpb24gdG8gYGl0ZXJhYmxlRXF1YWxgIHNwZWNpZmljYWxseVxuICogZm9yIE5vZGUuanMgQnVmZmVycy5cbiAqXG4gKiBAcGFyYW0ge0J1ZmZlcn0gYVxuICogQHBhcmFtIHtNaXhlZH0gYlxuICogQHJldHVybiB7Qm9vbGVhbn0gcmVzdWx0XG4gKi9cblxuZnVuY3Rpb24gYnVmZmVyRXF1YWwoYSwgYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihiKSkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gaXRlcmFibGVFcXVhbChhLCBiKTtcbn1cblxuLyohXG4gKiBCbG9jayBmb3IgYG9iamVjdEVxdWFsYCBlbnN1cmluZyBub24tZXhpc3RpbmdcbiAqIHZhbHVlcyBkb24ndCBnZXQgaW4uXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gb2JqZWN0XG4gKiBAcmV0dXJuIHtCb29sZWFufSByZXN1bHRcbiAqL1xuXG5mdW5jdGlvbiBpc1ZhbHVlKGEpIHtcbiAgcmV0dXJuIGEgIT09IG51bGwgJiYgYSAhPT0gdW5kZWZpbmVkO1xufVxuXG4vKiFcbiAqIFJlY3Vyc2l2ZWx5IGNoZWNrIHRoZSBlcXVhbGl0eSBvZiB0d28gb2JqZWN0cy5cbiAqIE9uY2UgYmFzaWMgc2FtZW5lc3MgaGFzIGJlZW4gZXN0YWJsaXNoZWQgaXQgd2lsbFxuICogZGVmZXIgdG8gYGRlZXBFcXVhbGAgZm9yIGVhY2ggZW51bWVyYWJsZSBrZXlcbiAqIGluIHRoZSBvYmplY3QuXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gYVxuICogQHBhcmFtIHtNaXhlZH0gYlxuICogQHJldHVybiB7Qm9vbGVhbn0gcmVzdWx0XG4gKi9cblxuZnVuY3Rpb24gb2JqZWN0RXF1YWwoYSwgYiwgbSkge1xuICBpZiAoIWlzVmFsdWUoYSkgfHwgIWlzVmFsdWUoYikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoYS5wcm90b3R5cGUgIT09IGIucHJvdG90eXBlKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgdmFyIGk7XG4gIGlmIChtKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IG0ubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmICgobVtpXVswXSA9PT0gYSAmJiBtW2ldWzFdID09PSBiKVxuICAgICAgfHwgIChtW2ldWzBdID09PSBiICYmIG1baV1bMV0gPT09IGEpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBtID0gW107XG4gIH1cblxuICB0cnkge1xuICAgIHZhciBrYSA9IGVudW1lcmFibGUoYSk7XG4gICAgdmFyIGtiID0gZW51bWVyYWJsZShiKTtcbiAgfSBjYXRjaCAoZXgpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBrYS5zb3J0KCk7XG4gIGtiLnNvcnQoKTtcblxuICBpZiAoIWl0ZXJhYmxlRXF1YWwoa2EsIGtiKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIG0ucHVzaChbIGEsIGIgXSk7XG5cbiAgdmFyIGtleTtcbiAgZm9yIChpID0ga2EubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBrZXkgPSBrYVtpXTtcbiAgICBpZiAoIWRlZXBFcXVhbChhW2tleV0sIGJba2V5XSwgbSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9pbmRleC5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2xpYi9jaGFpJyk7XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogY2hhaVxuICogQ29weXJpZ2h0KGMpIDIwMTEtMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbnZhciB1c2VkID0gW11cbiAgLCBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLyohXG4gKiBDaGFpIHZlcnNpb25cbiAqL1xuXG5leHBvcnRzLnZlcnNpb24gPSAnMS45LjEnO1xuXG4vKiFcbiAqIEFzc2VydGlvbiBFcnJvclxuICovXG5cbmV4cG9ydHMuQXNzZXJ0aW9uRXJyb3IgPSByZXF1aXJlKCdhc3NlcnRpb24tZXJyb3InKTtcblxuLyohXG4gKiBVdGlscyBmb3IgcGx1Z2lucyAobm90IGV4cG9ydGVkKVxuICovXG5cbnZhciB1dGlsID0gcmVxdWlyZSgnLi9jaGFpL3V0aWxzJyk7XG5cbi8qKlxuICogIyAudXNlKGZ1bmN0aW9uKVxuICpcbiAqIFByb3ZpZGVzIGEgd2F5IHRvIGV4dGVuZCB0aGUgaW50ZXJuYWxzIG9mIENoYWlcbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufVxuICogQHJldHVybnMge3RoaXN9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLnVzZSA9IGZ1bmN0aW9uIChmbikge1xuICBpZiAoIX51c2VkLmluZGV4T2YoZm4pKSB7XG4gICAgZm4odGhpcywgdXRpbCk7XG4gICAgdXNlZC5wdXNoKGZuKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLyohXG4gKiBDb25maWd1cmF0aW9uXG4gKi9cblxudmFyIGNvbmZpZyA9IHJlcXVpcmUoJy4vY2hhaS9jb25maWcnKTtcbmV4cG9ydHMuY29uZmlnID0gY29uZmlnO1xuXG4vKiFcbiAqIFByaW1hcnkgYEFzc2VydGlvbmAgcHJvdG90eXBlXG4gKi9cblxudmFyIGFzc2VydGlvbiA9IHJlcXVpcmUoJy4vY2hhaS9hc3NlcnRpb24nKTtcbmV4cG9ydHMudXNlKGFzc2VydGlvbik7XG5cbi8qIVxuICogQ29yZSBBc3NlcnRpb25zXG4gKi9cblxudmFyIGNvcmUgPSByZXF1aXJlKCcuL2NoYWkvY29yZS9hc3NlcnRpb25zJyk7XG5leHBvcnRzLnVzZShjb3JlKTtcblxuLyohXG4gKiBFeHBlY3QgaW50ZXJmYWNlXG4gKi9cblxudmFyIGV4cGVjdCA9IHJlcXVpcmUoJy4vY2hhaS9pbnRlcmZhY2UvZXhwZWN0Jyk7XG5leHBvcnRzLnVzZShleHBlY3QpO1xuXG4vKiFcbiAqIFNob3VsZCBpbnRlcmZhY2VcbiAqL1xuXG52YXIgc2hvdWxkID0gcmVxdWlyZSgnLi9jaGFpL2ludGVyZmFjZS9zaG91bGQnKTtcbmV4cG9ydHMudXNlKHNob3VsZCk7XG5cbi8qIVxuICogQXNzZXJ0IGludGVyZmFjZVxuICovXG5cbnZhciBhc3NlcnQgPSByZXF1aXJlKCcuL2NoYWkvaW50ZXJmYWNlL2Fzc2VydCcpO1xuZXhwb3J0cy51c2UoYXNzZXJ0KTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS9hc3NlcnRpb24uanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogY2hhaVxuICogaHR0cDovL2NoYWlqcy5jb21cbiAqIENvcHlyaWdodChjKSAyMDExLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG52YXIgY29uZmlnID0gcmVxdWlyZSgnLi9jb25maWcnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoX2NoYWksIHV0aWwpIHtcbiAgLyohXG4gICAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gICAqL1xuXG4gIHZhciBBc3NlcnRpb25FcnJvciA9IF9jaGFpLkFzc2VydGlvbkVycm9yXG4gICAgLCBmbGFnID0gdXRpbC5mbGFnO1xuXG4gIC8qIVxuICAgKiBNb2R1bGUgZXhwb3J0LlxuICAgKi9cblxuICBfY2hhaS5Bc3NlcnRpb24gPSBBc3NlcnRpb247XG5cbiAgLyohXG4gICAqIEFzc2VydGlvbiBDb25zdHJ1Y3RvclxuICAgKlxuICAgKiBDcmVhdGVzIG9iamVjdCBmb3IgY2hhaW5pbmcuXG4gICAqXG4gICAqIEBhcGkgcHJpdmF0ZVxuICAgKi9cblxuICBmdW5jdGlvbiBBc3NlcnRpb24gKG9iaiwgbXNnLCBzdGFjaykge1xuICAgIGZsYWcodGhpcywgJ3NzZmknLCBzdGFjayB8fCBhcmd1bWVudHMuY2FsbGVlKTtcbiAgICBmbGFnKHRoaXMsICdvYmplY3QnLCBvYmopO1xuICAgIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICB9XG5cbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEFzc2VydGlvbiwgJ2luY2x1ZGVTdGFjaycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgY29uc29sZS53YXJuKCdBc3NlcnRpb24uaW5jbHVkZVN0YWNrIGlzIGRlcHJlY2F0ZWQsIHVzZSBjaGFpLmNvbmZpZy5pbmNsdWRlU3RhY2sgaW5zdGVhZC4nKTtcbiAgICAgIHJldHVybiBjb25maWcuaW5jbHVkZVN0YWNrO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgY29uc29sZS53YXJuKCdBc3NlcnRpb24uaW5jbHVkZVN0YWNrIGlzIGRlcHJlY2F0ZWQsIHVzZSBjaGFpLmNvbmZpZy5pbmNsdWRlU3RhY2sgaW5zdGVhZC4nKTtcbiAgICAgIGNvbmZpZy5pbmNsdWRlU3RhY2sgPSB2YWx1ZTtcbiAgICB9XG4gIH0pO1xuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShBc3NlcnRpb24sICdzaG93RGlmZicsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgY29uc29sZS53YXJuKCdBc3NlcnRpb24uc2hvd0RpZmYgaXMgZGVwcmVjYXRlZCwgdXNlIGNoYWkuY29uZmlnLnNob3dEaWZmIGluc3RlYWQuJyk7XG4gICAgICByZXR1cm4gY29uZmlnLnNob3dEaWZmO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgY29uc29sZS53YXJuKCdBc3NlcnRpb24uc2hvd0RpZmYgaXMgZGVwcmVjYXRlZCwgdXNlIGNoYWkuY29uZmlnLnNob3dEaWZmIGluc3RlYWQuJyk7XG4gICAgICBjb25maWcuc2hvd0RpZmYgPSB2YWx1ZTtcbiAgICB9XG4gIH0pO1xuXG4gIEFzc2VydGlvbi5hZGRQcm9wZXJ0eSA9IGZ1bmN0aW9uIChuYW1lLCBmbikge1xuICAgIHV0aWwuYWRkUHJvcGVydHkodGhpcy5wcm90b3R5cGUsIG5hbWUsIGZuKTtcbiAgfTtcblxuICBBc3NlcnRpb24uYWRkTWV0aG9kID0gZnVuY3Rpb24gKG5hbWUsIGZuKSB7XG4gICAgdXRpbC5hZGRNZXRob2QodGhpcy5wcm90b3R5cGUsIG5hbWUsIGZuKTtcbiAgfTtcblxuICBBc3NlcnRpb24uYWRkQ2hhaW5hYmxlTWV0aG9kID0gZnVuY3Rpb24gKG5hbWUsIGZuLCBjaGFpbmluZ0JlaGF2aW9yKSB7XG4gICAgdXRpbC5hZGRDaGFpbmFibGVNZXRob2QodGhpcy5wcm90b3R5cGUsIG5hbWUsIGZuLCBjaGFpbmluZ0JlaGF2aW9yKTtcbiAgfTtcblxuICBBc3NlcnRpb24ub3ZlcndyaXRlUHJvcGVydHkgPSBmdW5jdGlvbiAobmFtZSwgZm4pIHtcbiAgICB1dGlsLm92ZXJ3cml0ZVByb3BlcnR5KHRoaXMucHJvdG90eXBlLCBuYW1lLCBmbik7XG4gIH07XG5cbiAgQXNzZXJ0aW9uLm92ZXJ3cml0ZU1ldGhvZCA9IGZ1bmN0aW9uIChuYW1lLCBmbikge1xuICAgIHV0aWwub3ZlcndyaXRlTWV0aG9kKHRoaXMucHJvdG90eXBlLCBuYW1lLCBmbik7XG4gIH07XG5cbiAgQXNzZXJ0aW9uLm92ZXJ3cml0ZUNoYWluYWJsZU1ldGhvZCA9IGZ1bmN0aW9uIChuYW1lLCBmbiwgY2hhaW5pbmdCZWhhdmlvcikge1xuICAgIHV0aWwub3ZlcndyaXRlQ2hhaW5hYmxlTWV0aG9kKHRoaXMucHJvdG90eXBlLCBuYW1lLCBmbiwgY2hhaW5pbmdCZWhhdmlvcik7XG4gIH07XG5cbiAgLyohXG4gICAqICMjIyAuYXNzZXJ0KGV4cHJlc3Npb24sIG1lc3NhZ2UsIG5lZ2F0ZU1lc3NhZ2UsIGV4cGVjdGVkLCBhY3R1YWwpXG4gICAqXG4gICAqIEV4ZWN1dGVzIGFuIGV4cHJlc3Npb24gYW5kIGNoZWNrIGV4cGVjdGF0aW9ucy4gVGhyb3dzIEFzc2VydGlvbkVycm9yIGZvciByZXBvcnRpbmcgaWYgdGVzdCBkb2Vzbid0IHBhc3MuXG4gICAqXG4gICAqIEBuYW1lIGFzc2VydFxuICAgKiBAcGFyYW0ge1BoaWxvc29waGljYWx9IGV4cHJlc3Npb24gdG8gYmUgdGVzdGVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIHRvIGRpc3BsYXkgaWYgZmFpbHNcbiAgICogQHBhcmFtIHtTdHJpbmd9IG5lZ2F0ZWRNZXNzYWdlIHRvIGRpc3BsYXkgaWYgbmVnYXRlZCBleHByZXNzaW9uIGZhaWxzXG4gICAqIEBwYXJhbSB7TWl4ZWR9IGV4cGVjdGVkIHZhbHVlIChyZW1lbWJlciB0byBjaGVjayBmb3IgbmVnYXRpb24pXG4gICAqIEBwYXJhbSB7TWl4ZWR9IGFjdHVhbCAob3B0aW9uYWwpIHdpbGwgZGVmYXVsdCB0byBgdGhpcy5vYmpgXG4gICAqIEBhcGkgcHJpdmF0ZVxuICAgKi9cblxuICBBc3NlcnRpb24ucHJvdG90eXBlLmFzc2VydCA9IGZ1bmN0aW9uIChleHByLCBtc2csIG5lZ2F0ZU1zZywgZXhwZWN0ZWQsIF9hY3R1YWwsIHNob3dEaWZmKSB7XG4gICAgdmFyIG9rID0gdXRpbC50ZXN0KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgaWYgKHRydWUgIT09IHNob3dEaWZmKSBzaG93RGlmZiA9IGZhbHNlO1xuICAgIGlmICh0cnVlICE9PSBjb25maWcuc2hvd0RpZmYpIHNob3dEaWZmID0gZmFsc2U7XG5cbiAgICBpZiAoIW9rKSB7XG4gICAgICB2YXIgbXNnID0gdXRpbC5nZXRNZXNzYWdlKHRoaXMsIGFyZ3VtZW50cylcbiAgICAgICAgLCBhY3R1YWwgPSB1dGlsLmdldEFjdHVhbCh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKG1zZywge1xuICAgICAgICAgIGFjdHVhbDogYWN0dWFsXG4gICAgICAgICwgZXhwZWN0ZWQ6IGV4cGVjdGVkXG4gICAgICAgICwgc2hvd0RpZmY6IHNob3dEaWZmXG4gICAgICB9LCAoY29uZmlnLmluY2x1ZGVTdGFjaykgPyB0aGlzLmFzc2VydCA6IGZsYWcodGhpcywgJ3NzZmknKSk7XG4gICAgfVxuICB9O1xuXG4gIC8qIVxuICAgKiAjIyMgLl9vYmpcbiAgICpcbiAgICogUXVpY2sgcmVmZXJlbmNlIHRvIHN0b3JlZCBgYWN0dWFsYCB2YWx1ZSBmb3IgcGx1Z2luIGRldmVsb3BlcnMuXG4gICAqXG4gICAqIEBhcGkgcHJpdmF0ZVxuICAgKi9cblxuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQXNzZXJ0aW9uLnByb3RvdHlwZSwgJ19vYmonLFxuICAgIHsgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBmbGFnKHRoaXMsICdvYmplY3QnKTtcbiAgICAgIH1cbiAgICAsIHNldDogZnVuY3Rpb24gKHZhbCkge1xuICAgICAgICBmbGFnKHRoaXMsICdvYmplY3QnLCB2YWwpO1xuICAgICAgfVxuICB9KTtcbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvY29uZmlnLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG5tb2R1bGUuZXhwb3J0cyA9IHtcblxuICAvKipcbiAgICogIyMjIGNvbmZpZy5pbmNsdWRlU3RhY2tcbiAgICpcbiAgICogVXNlciBjb25maWd1cmFibGUgcHJvcGVydHksIGluZmx1ZW5jZXMgd2hldGhlciBzdGFjayB0cmFjZVxuICAgKiBpcyBpbmNsdWRlZCBpbiBBc3NlcnRpb24gZXJyb3IgbWVzc2FnZS4gRGVmYXVsdCBvZiBmYWxzZVxuICAgKiBzdXBwcmVzc2VzIHN0YWNrIHRyYWNlIGluIHRoZSBlcnJvciBtZXNzYWdlLlxuICAgKlxuICAgKiAgICAgY2hhaS5jb25maWcuaW5jbHVkZVN0YWNrID0gdHJ1ZTsgIC8vIGVuYWJsZSBzdGFjayBvbiBlcnJvclxuICAgKlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59XG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gICBpbmNsdWRlU3RhY2s6IGZhbHNlLFxuXG4gIC8qKlxuICAgKiAjIyMgY29uZmlnLnNob3dEaWZmXG4gICAqXG4gICAqIFVzZXIgY29uZmlndXJhYmxlIHByb3BlcnR5LCBpbmZsdWVuY2VzIHdoZXRoZXIgb3Igbm90XG4gICAqIHRoZSBgc2hvd0RpZmZgIGZsYWcgc2hvdWxkIGJlIGluY2x1ZGVkIGluIHRoZSB0aHJvd25cbiAgICogQXNzZXJ0aW9uRXJyb3JzLiBgZmFsc2VgIHdpbGwgYWx3YXlzIGJlIGBmYWxzZWA7IGB0cnVlYFxuICAgKiB3aWxsIGJlIHRydWUgd2hlbiB0aGUgYXNzZXJ0aW9uIGhhcyByZXF1ZXN0ZWQgYSBkaWZmXG4gICAqIGJlIHNob3duLlxuICAgKlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59XG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIHNob3dEaWZmOiB0cnVlLFxuXG4gIC8qKlxuICAgKiAjIyMgY29uZmlnLnRydW5jYXRlVGhyZXNob2xkXG4gICAqXG4gICAqIFVzZXIgY29uZmlndXJhYmxlIHByb3BlcnR5LCBzZXRzIGxlbmd0aCB0aHJlc2hvbGQgZm9yIGFjdHVhbCBhbmRcbiAgICogZXhwZWN0ZWQgdmFsdWVzIGluIGFzc2VydGlvbiBlcnJvcnMuIElmIHRoaXMgdGhyZXNob2xkIGlzIGV4Y2VlZGVkLFxuICAgKiB0aGUgdmFsdWUgaXMgdHJ1bmNhdGVkLlxuICAgKlxuICAgKiBTZXQgaXQgdG8gemVybyBpZiB5b3Ugd2FudCB0byBkaXNhYmxlIHRydW5jYXRpbmcgYWx0b2dldGhlci5cbiAgICpcbiAgICogICAgIGNoYWkuY29uZmlnLnRydW5jYXRlVGhyZXNob2xkID0gMDsgIC8vIGRpc2FibGUgdHJ1bmNhdGluZ1xuICAgKlxuICAgKiBAcGFyYW0ge051bWJlcn1cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgdHJ1bmNhdGVUaHJlc2hvbGQ6IDQwXG5cbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvY29yZS9hc3NlcnRpb25zLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIGNoYWlcbiAqIGh0dHA6Ly9jaGFpanMuY29tXG4gKiBDb3B5cmlnaHQoYykgMjAxMS0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoY2hhaSwgXykge1xuICB2YXIgQXNzZXJ0aW9uID0gY2hhaS5Bc3NlcnRpb25cbiAgICAsIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ1xuICAgICwgZmxhZyA9IF8uZmxhZztcblxuICAvKipcbiAgICogIyMjIExhbmd1YWdlIENoYWluc1xuICAgKlxuICAgKiBUaGUgZm9sbG93aW5nIGFyZSBwcm92aWRlZCBhcyBjaGFpbmFibGUgZ2V0dGVycyB0b1xuICAgKiBpbXByb3ZlIHRoZSByZWFkYWJpbGl0eSBvZiB5b3VyIGFzc2VydGlvbnMuIFRoZXlcbiAgICogZG8gbm90IHByb3ZpZGUgdGVzdGluZyBjYXBhYmlsaXRpZXMgdW5sZXNzIHRoZXlcbiAgICogaGF2ZSBiZWVuIG92ZXJ3cml0dGVuIGJ5IGEgcGx1Z2luLlxuICAgKlxuICAgKiAqKkNoYWlucyoqXG4gICAqXG4gICAqIC0gdG9cbiAgICogLSBiZVxuICAgKiAtIGJlZW5cbiAgICogLSBpc1xuICAgKiAtIHRoYXRcbiAgICogLSBhbmRcbiAgICogLSBoYXNcbiAgICogLSBoYXZlXG4gICAqIC0gd2l0aFxuICAgKiAtIGF0XG4gICAqIC0gb2ZcbiAgICogLSBzYW1lXG4gICAqXG4gICAqIEBuYW1lIGxhbmd1YWdlIGNoYWluc1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBbICd0bycsICdiZScsICdiZWVuJ1xuICAsICdpcycsICdhbmQnLCAnaGFzJywgJ2hhdmUnXG4gICwgJ3dpdGgnLCAndGhhdCcsICdhdCdcbiAgLCAnb2YnLCAnc2FtZScgXS5mb3JFYWNoKGZ1bmN0aW9uIChjaGFpbikge1xuICAgIEFzc2VydGlvbi5hZGRQcm9wZXJ0eShjaGFpbiwgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8qKlxuICAgKiAjIyMgLm5vdFxuICAgKlxuICAgKiBOZWdhdGVzIGFueSBvZiBhc3NlcnRpb25zIGZvbGxvd2luZyBpbiB0aGUgY2hhaW4uXG4gICAqXG4gICAqICAgICBleHBlY3QoZm9vKS50by5ub3QuZXF1YWwoJ2JhcicpO1xuICAgKiAgICAgZXhwZWN0KGdvb2RGbikudG8ubm90LnRocm93KEVycm9yKTtcbiAgICogICAgIGV4cGVjdCh7IGZvbzogJ2JheicgfSkudG8uaGF2ZS5wcm9wZXJ0eSgnZm9vJylcbiAgICogICAgICAgLmFuZC5ub3QuZXF1YWwoJ2JhcicpO1xuICAgKlxuICAgKiBAbmFtZSBub3RcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgQXNzZXJ0aW9uLmFkZFByb3BlcnR5KCdub3QnLCBmdW5jdGlvbiAoKSB7XG4gICAgZmxhZyh0aGlzLCAnbmVnYXRlJywgdHJ1ZSk7XG4gIH0pO1xuXG4gIC8qKlxuICAgKiAjIyMgLmRlZXBcbiAgICpcbiAgICogU2V0cyB0aGUgYGRlZXBgIGZsYWcsIGxhdGVyIHVzZWQgYnkgdGhlIGBlcXVhbGAgYW5kXG4gICAqIGBwcm9wZXJ0eWAgYXNzZXJ0aW9ucy5cbiAgICpcbiAgICogICAgIGV4cGVjdChmb28pLnRvLmRlZXAuZXF1YWwoeyBiYXI6ICdiYXonIH0pO1xuICAgKiAgICAgZXhwZWN0KHsgZm9vOiB7IGJhcjogeyBiYXo6ICdxdXV4JyB9IH0gfSlcbiAgICogICAgICAgLnRvLmhhdmUuZGVlcC5wcm9wZXJ0eSgnZm9vLmJhci5iYXonLCAncXV1eCcpO1xuICAgKlxuICAgKiBAbmFtZSBkZWVwXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRQcm9wZXJ0eSgnZGVlcCcsIGZ1bmN0aW9uICgpIHtcbiAgICBmbGFnKHRoaXMsICdkZWVwJywgdHJ1ZSk7XG4gIH0pO1xuXG4gIC8qKlxuICAgKiAjIyMgLmEodHlwZSlcbiAgICpcbiAgICogVGhlIGBhYCBhbmQgYGFuYCBhc3NlcnRpb25zIGFyZSBhbGlhc2VzIHRoYXQgY2FuIGJlXG4gICAqIHVzZWQgZWl0aGVyIGFzIGxhbmd1YWdlIGNoYWlucyBvciB0byBhc3NlcnQgYSB2YWx1ZSdzXG4gICAqIHR5cGUuXG4gICAqXG4gICAqICAgICAvLyB0eXBlb2ZcbiAgICogICAgIGV4cGVjdCgndGVzdCcpLnRvLmJlLmEoJ3N0cmluZycpO1xuICAgKiAgICAgZXhwZWN0KHsgZm9vOiAnYmFyJyB9KS50by5iZS5hbignb2JqZWN0Jyk7XG4gICAqICAgICBleHBlY3QobnVsbCkudG8uYmUuYSgnbnVsbCcpO1xuICAgKiAgICAgZXhwZWN0KHVuZGVmaW5lZCkudG8uYmUuYW4oJ3VuZGVmaW5lZCcpO1xuICAgKlxuICAgKiAgICAgLy8gbGFuZ3VhZ2UgY2hhaW5cbiAgICogICAgIGV4cGVjdChmb28pLnRvLmJlLmFuLmluc3RhbmNlb2YoRm9vKTtcbiAgICpcbiAgICogQG5hbWUgYVxuICAgKiBAYWxpYXMgYW5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHR5cGVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBmdW5jdGlvbiBhbiAodHlwZSwgbXNnKSB7XG4gICAgaWYgKG1zZykgZmxhZyh0aGlzLCAnbWVzc2FnZScsIG1zZyk7XG4gICAgdHlwZSA9IHR5cGUudG9Mb3dlckNhc2UoKTtcbiAgICB2YXIgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0JylcbiAgICAgICwgYXJ0aWNsZSA9IH5bICdhJywgJ2UnLCAnaScsICdvJywgJ3UnIF0uaW5kZXhPZih0eXBlLmNoYXJBdCgwKSkgPyAnYW4gJyA6ICdhICc7XG5cbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgdHlwZSA9PT0gXy50eXBlKG9iailcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgJyArIGFydGljbGUgKyB0eXBlXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IG5vdCB0byBiZSAnICsgYXJ0aWNsZSArIHR5cGVcbiAgICApO1xuICB9XG5cbiAgQXNzZXJ0aW9uLmFkZENoYWluYWJsZU1ldGhvZCgnYW4nLCBhbik7XG4gIEFzc2VydGlvbi5hZGRDaGFpbmFibGVNZXRob2QoJ2EnLCBhbik7XG5cbiAgLyoqXG4gICAqICMjIyAuaW5jbHVkZSh2YWx1ZSlcbiAgICpcbiAgICogVGhlIGBpbmNsdWRlYCBhbmQgYGNvbnRhaW5gIGFzc2VydGlvbnMgY2FuIGJlIHVzZWQgYXMgZWl0aGVyIHByb3BlcnR5XG4gICAqIGJhc2VkIGxhbmd1YWdlIGNoYWlucyBvciBhcyBtZXRob2RzIHRvIGFzc2VydCB0aGUgaW5jbHVzaW9uIG9mIGFuIG9iamVjdFxuICAgKiBpbiBhbiBhcnJheSBvciBhIHN1YnN0cmluZyBpbiBhIHN0cmluZy4gV2hlbiB1c2VkIGFzIGxhbmd1YWdlIGNoYWlucyxcbiAgICogdGhleSB0b2dnbGUgdGhlIGBjb250YWluYCBmbGFnIGZvciB0aGUgYGtleXNgIGFzc2VydGlvbi5cbiAgICpcbiAgICogICAgIGV4cGVjdChbMSwyLDNdKS50by5pbmNsdWRlKDIpO1xuICAgKiAgICAgZXhwZWN0KCdmb29iYXInKS50by5jb250YWluKCdmb28nKTtcbiAgICogICAgIGV4cGVjdCh7IGZvbzogJ2JhcicsIGhlbGxvOiAndW5pdmVyc2UnIH0pLnRvLmluY2x1ZGUua2V5cygnZm9vJyk7XG4gICAqXG4gICAqIEBuYW1lIGluY2x1ZGVcbiAgICogQGFsaWFzIGNvbnRhaW5cbiAgICogQHBhcmFtIHtPYmplY3R8U3RyaW5nfE51bWJlcn0gb2JqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gaW5jbHVkZUNoYWluaW5nQmVoYXZpb3IgKCkge1xuICAgIGZsYWcodGhpcywgJ2NvbnRhaW5zJywgdHJ1ZSk7XG4gIH1cblxuICBmdW5jdGlvbiBpbmNsdWRlICh2YWwsIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKTtcbiAgICB2YXIgZXhwZWN0ZWQgPSBmYWxzZTtcbiAgICBpZiAoXy50eXBlKG9iaikgPT09ICdhcnJheScgJiYgXy50eXBlKHZhbCkgPT09ICdvYmplY3QnKSB7XG4gICAgICBmb3IgKHZhciBpIGluIG9iaikge1xuICAgICAgICBpZiAoXy5lcWwob2JqW2ldLCB2YWwpKSB7XG4gICAgICAgICAgZXhwZWN0ZWQgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChfLnR5cGUodmFsKSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGlmICghZmxhZyh0aGlzLCAnbmVnYXRlJykpIHtcbiAgICAgICAgZm9yICh2YXIgayBpbiB2YWwpIG5ldyBBc3NlcnRpb24ob2JqKS5wcm9wZXJ0eShrLCB2YWxba10pO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB2YXIgc3Vic2V0ID0ge31cbiAgICAgIGZvciAodmFyIGsgaW4gdmFsKSBzdWJzZXRba10gPSBvYmpba11cbiAgICAgIGV4cGVjdGVkID0gXy5lcWwoc3Vic2V0LCB2YWwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBleHBlY3RlZCA9IG9iaiAmJiB+b2JqLmluZGV4T2YodmFsKVxuICAgIH1cbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgZXhwZWN0ZWRcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gaW5jbHVkZSAnICsgXy5pbnNwZWN0KHZhbClcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IGluY2x1ZGUgJyArIF8uaW5zcGVjdCh2YWwpKTtcbiAgfVxuXG4gIEFzc2VydGlvbi5hZGRDaGFpbmFibGVNZXRob2QoJ2luY2x1ZGUnLCBpbmNsdWRlLCBpbmNsdWRlQ2hhaW5pbmdCZWhhdmlvcik7XG4gIEFzc2VydGlvbi5hZGRDaGFpbmFibGVNZXRob2QoJ2NvbnRhaW4nLCBpbmNsdWRlLCBpbmNsdWRlQ2hhaW5pbmdCZWhhdmlvcik7XG5cbiAgLyoqXG4gICAqICMjIyAub2tcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaXMgdHJ1dGh5LlxuICAgKlxuICAgKiAgICAgZXhwZWN0KCdldmVydGhpbmcnKS50by5iZS5vaztcbiAgICogICAgIGV4cGVjdCgxKS50by5iZS5vaztcbiAgICogICAgIGV4cGVjdChmYWxzZSkudG8ubm90LmJlLm9rO1xuICAgKiAgICAgZXhwZWN0KHVuZGVmaW5lZCkudG8ubm90LmJlLm9rO1xuICAgKiAgICAgZXhwZWN0KG51bGwpLnRvLm5vdC5iZS5vaztcbiAgICpcbiAgICogQG5hbWUgb2tcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgQXNzZXJ0aW9uLmFkZFByb3BlcnR5KCdvaycsIGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgZmxhZyh0aGlzLCAnb2JqZWN0JylcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgdHJ1dGh5J1xuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSBmYWxzeScpO1xuICB9KTtcblxuICAvKipcbiAgICogIyMjIC50cnVlXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGlzIGB0cnVlYC5cbiAgICpcbiAgICogICAgIGV4cGVjdCh0cnVlKS50by5iZS50cnVlO1xuICAgKiAgICAgZXhwZWN0KDEpLnRvLm5vdC5iZS50cnVlO1xuICAgKlxuICAgKiBAbmFtZSB0cnVlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRQcm9wZXJ0eSgndHJ1ZScsIGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgdHJ1ZSA9PT0gZmxhZyh0aGlzLCAnb2JqZWN0JylcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgdHJ1ZSdcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgZmFsc2UnXG4gICAgICAsIHRoaXMubmVnYXRlID8gZmFsc2UgOiB0cnVlXG4gICAgKTtcbiAgfSk7XG5cbiAgLyoqXG4gICAqICMjIyAuZmFsc2VcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaXMgYGZhbHNlYC5cbiAgICpcbiAgICogICAgIGV4cGVjdChmYWxzZSkudG8uYmUuZmFsc2U7XG4gICAqICAgICBleHBlY3QoMCkudG8ubm90LmJlLmZhbHNlO1xuICAgKlxuICAgKiBAbmFtZSBmYWxzZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkUHJvcGVydHkoJ2ZhbHNlJywgZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICBmYWxzZSA9PT0gZmxhZyh0aGlzLCAnb2JqZWN0JylcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgZmFsc2UnXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIHRydWUnXG4gICAgICAsIHRoaXMubmVnYXRlID8gdHJ1ZSA6IGZhbHNlXG4gICAgKTtcbiAgfSk7XG5cbiAgLyoqXG4gICAqICMjIyAubnVsbFxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBpcyBgbnVsbGAuXG4gICAqXG4gICAqICAgICBleHBlY3QobnVsbCkudG8uYmUubnVsbDtcbiAgICogICAgIGV4cGVjdCh1bmRlZmluZWQpLm5vdC50by5iZS5udWxsO1xuICAgKlxuICAgKiBAbmFtZSBudWxsXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRQcm9wZXJ0eSgnbnVsbCcsIGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgbnVsbCA9PT0gZmxhZyh0aGlzLCAnb2JqZWN0JylcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgbnVsbCdcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gbm90IHRvIGJlIG51bGwnXG4gICAgKTtcbiAgfSk7XG5cbiAgLyoqXG4gICAqICMjIyAudW5kZWZpbmVkXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGlzIGB1bmRlZmluZWRgLlxuICAgKlxuICAgKiAgICAgZXhwZWN0KHVuZGVmaW5lZCkudG8uYmUudW5kZWZpbmVkO1xuICAgKiAgICAgZXhwZWN0KG51bGwpLnRvLm5vdC5iZS51bmRlZmluZWQ7XG4gICAqXG4gICAqIEBuYW1lIHVuZGVmaW5lZFxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkUHJvcGVydHkoJ3VuZGVmaW5lZCcsIGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgdW5kZWZpbmVkID09PSBmbGFnKHRoaXMsICdvYmplY3QnKVxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSB1bmRlZmluZWQnXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IG5vdCB0byBiZSB1bmRlZmluZWQnXG4gICAgKTtcbiAgfSk7XG5cbiAgLyoqXG4gICAqICMjIyAuZXhpc3RcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaXMgbmVpdGhlciBgbnVsbGAgbm9yIGB1bmRlZmluZWRgLlxuICAgKlxuICAgKiAgICAgdmFyIGZvbyA9ICdoaSdcbiAgICogICAgICAgLCBiYXIgPSBudWxsXG4gICAqICAgICAgICwgYmF6O1xuICAgKlxuICAgKiAgICAgZXhwZWN0KGZvbykudG8uZXhpc3Q7XG4gICAqICAgICBleHBlY3QoYmFyKS50by5ub3QuZXhpc3Q7XG4gICAqICAgICBleHBlY3QoYmF6KS50by5ub3QuZXhpc3Q7XG4gICAqXG4gICAqIEBuYW1lIGV4aXN0XG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRQcm9wZXJ0eSgnZXhpc3QnLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgIG51bGwgIT0gZmxhZyh0aGlzLCAnb2JqZWN0JylcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gZXhpc3QnXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBleGlzdCdcbiAgICApO1xuICB9KTtcblxuXG4gIC8qKlxuICAgKiAjIyMgLmVtcHR5XG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0J3MgbGVuZ3RoIGlzIGAwYC4gRm9yIGFycmF5cywgaXQgY2hlY2tzXG4gICAqIHRoZSBgbGVuZ3RoYCBwcm9wZXJ0eS4gRm9yIG9iamVjdHMsIGl0IGdldHMgdGhlIGNvdW50IG9mXG4gICAqIGVudW1lcmFibGUga2V5cy5cbiAgICpcbiAgICogICAgIGV4cGVjdChbXSkudG8uYmUuZW1wdHk7XG4gICAqICAgICBleHBlY3QoJycpLnRvLmJlLmVtcHR5O1xuICAgKiAgICAgZXhwZWN0KHt9KS50by5iZS5lbXB0eTtcbiAgICpcbiAgICogQG5hbWUgZW1wdHlcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgQXNzZXJ0aW9uLmFkZFByb3BlcnR5KCdlbXB0eScsIGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0JylcbiAgICAgICwgZXhwZWN0ZWQgPSBvYmo7XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShvYmopIHx8ICdzdHJpbmcnID09PSB0eXBlb2Ygb2JqZWN0KSB7XG4gICAgICBleHBlY3RlZCA9IG9iai5sZW5ndGg7XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgICAgZXhwZWN0ZWQgPSBPYmplY3Qua2V5cyhvYmopLmxlbmd0aDtcbiAgICB9XG5cbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgIWV4cGVjdGVkXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIGVtcHR5J1xuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSBub3QgdG8gYmUgZW1wdHknXG4gICAgKTtcbiAgfSk7XG5cbiAgLyoqXG4gICAqICMjIyAuYXJndW1lbnRzXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGlzIGFuIGFyZ3VtZW50cyBvYmplY3QuXG4gICAqXG4gICAqICAgICBmdW5jdGlvbiB0ZXN0ICgpIHtcbiAgICogICAgICAgZXhwZWN0KGFyZ3VtZW50cykudG8uYmUuYXJndW1lbnRzO1xuICAgKiAgICAgfVxuICAgKlxuICAgKiBAbmFtZSBhcmd1bWVudHNcbiAgICogQGFsaWFzIEFyZ3VtZW50c1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBmdW5jdGlvbiBjaGVja0FyZ3VtZW50cyAoKSB7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpXG4gICAgICAsIHR5cGUgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqKTtcbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgJ1tvYmplY3QgQXJndW1lbnRzXScgPT09IHR5cGVcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgYXJndW1lbnRzIGJ1dCBnb3QgJyArIHR5cGVcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IGJlIGFyZ3VtZW50cydcbiAgICApO1xuICB9XG5cbiAgQXNzZXJ0aW9uLmFkZFByb3BlcnR5KCdhcmd1bWVudHMnLCBjaGVja0FyZ3VtZW50cyk7XG4gIEFzc2VydGlvbi5hZGRQcm9wZXJ0eSgnQXJndW1lbnRzJywgY2hlY2tBcmd1bWVudHMpO1xuXG4gIC8qKlxuICAgKiAjIyMgLmVxdWFsKHZhbHVlKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBpcyBzdHJpY3RseSBlcXVhbCAoYD09PWApIHRvIGB2YWx1ZWAuXG4gICAqIEFsdGVybmF0ZWx5LCBpZiB0aGUgYGRlZXBgIGZsYWcgaXMgc2V0LCBhc3NlcnRzIHRoYXRcbiAgICogdGhlIHRhcmdldCBpcyBkZWVwbHkgZXF1YWwgdG8gYHZhbHVlYC5cbiAgICpcbiAgICogICAgIGV4cGVjdCgnaGVsbG8nKS50by5lcXVhbCgnaGVsbG8nKTtcbiAgICogICAgIGV4cGVjdCg0MikudG8uZXF1YWwoNDIpO1xuICAgKiAgICAgZXhwZWN0KDEpLnRvLm5vdC5lcXVhbCh0cnVlKTtcbiAgICogICAgIGV4cGVjdCh7IGZvbzogJ2JhcicgfSkudG8ubm90LmVxdWFsKHsgZm9vOiAnYmFyJyB9KTtcbiAgICogICAgIGV4cGVjdCh7IGZvbzogJ2JhcicgfSkudG8uZGVlcC5lcXVhbCh7IGZvbzogJ2JhcicgfSk7XG4gICAqXG4gICAqIEBuYW1lIGVxdWFsXG4gICAqIEBhbGlhcyBlcXVhbHNcbiAgICogQGFsaWFzIGVxXG4gICAqIEBhbGlhcyBkZWVwLmVxdWFsXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gYXNzZXJ0RXF1YWwgKHZhbCwgbXNnKSB7XG4gICAgaWYgKG1zZykgZmxhZyh0aGlzLCAnbWVzc2FnZScsIG1zZyk7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpO1xuICAgIGlmIChmbGFnKHRoaXMsICdkZWVwJykpIHtcbiAgICAgIHJldHVybiB0aGlzLmVxbCh2YWwpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmFzc2VydChcbiAgICAgICAgICB2YWwgPT09IG9ialxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGVxdWFsICN7ZXhwfSdcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgZXF1YWwgI3tleHB9J1xuICAgICAgICAsIHZhbFxuICAgICAgICAsIHRoaXMuX29ialxuICAgICAgICAsIHRydWVcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnZXF1YWwnLCBhc3NlcnRFcXVhbCk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2VxdWFscycsIGFzc2VydEVxdWFsKTtcbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnZXEnLCBhc3NlcnRFcXVhbCk7XG5cbiAgLyoqXG4gICAqICMjIyAuZXFsKHZhbHVlKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBpcyBkZWVwbHkgZXF1YWwgdG8gYHZhbHVlYC5cbiAgICpcbiAgICogICAgIGV4cGVjdCh7IGZvbzogJ2JhcicgfSkudG8uZXFsKHsgZm9vOiAnYmFyJyB9KTtcbiAgICogICAgIGV4cGVjdChbIDEsIDIsIDMgXSkudG8uZXFsKFsgMSwgMiwgMyBdKTtcbiAgICpcbiAgICogQG5hbWUgZXFsXG4gICAqIEBhbGlhcyBlcWxzXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gYXNzZXJ0RXFsKG9iaiwgbXNnKSB7XG4gICAgaWYgKG1zZykgZmxhZyh0aGlzLCAnbWVzc2FnZScsIG1zZyk7XG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgIF8uZXFsKG9iaiwgZmxhZyh0aGlzLCAnb2JqZWN0JykpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGRlZXBseSBlcXVhbCAje2V4cH0nXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBkZWVwbHkgZXF1YWwgI3tleHB9J1xuICAgICAgLCBvYmpcbiAgICAgICwgdGhpcy5fb2JqXG4gICAgICAsIHRydWVcbiAgICApO1xuICB9XG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnZXFsJywgYXNzZXJ0RXFsKTtcbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnZXFscycsIGFzc2VydEVxbCk7XG5cbiAgLyoqXG4gICAqICMjIyAuYWJvdmUodmFsdWUpXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGlzIGdyZWF0ZXIgdGhhbiBgdmFsdWVgLlxuICAgKlxuICAgKiAgICAgZXhwZWN0KDEwKS50by5iZS5hYm92ZSg1KTtcbiAgICpcbiAgICogQ2FuIGFsc28gYmUgdXNlZCBpbiBjb25qdW5jdGlvbiB3aXRoIGBsZW5ndGhgIHRvXG4gICAqIGFzc2VydCBhIG1pbmltdW0gbGVuZ3RoLiBUaGUgYmVuZWZpdCBiZWluZyBhXG4gICAqIG1vcmUgaW5mb3JtYXRpdmUgZXJyb3IgbWVzc2FnZSB0aGFuIGlmIHRoZSBsZW5ndGhcbiAgICogd2FzIHN1cHBsaWVkIGRpcmVjdGx5LlxuICAgKlxuICAgKiAgICAgZXhwZWN0KCdmb28nKS50by5oYXZlLmxlbmd0aC5hYm92ZSgyKTtcbiAgICogICAgIGV4cGVjdChbIDEsIDIsIDMgXSkudG8uaGF2ZS5sZW5ndGguYWJvdmUoMik7XG4gICAqXG4gICAqIEBuYW1lIGFib3ZlXG4gICAqIEBhbGlhcyBndFxuICAgKiBAYWxpYXMgZ3JlYXRlclRoYW5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gYXNzZXJ0QWJvdmUgKG4sIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKTtcbiAgICBpZiAoZmxhZyh0aGlzLCAnZG9MZW5ndGgnKSkge1xuICAgICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykudG8uaGF2ZS5wcm9wZXJ0eSgnbGVuZ3RoJyk7XG4gICAgICB2YXIgbGVuID0gb2JqLmxlbmd0aDtcbiAgICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICAgIGxlbiA+IG5cbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBoYXZlIGEgbGVuZ3RoIGFib3ZlICN7ZXhwfSBidXQgZ290ICN7YWN0fSdcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgaGF2ZSBhIGxlbmd0aCBhYm92ZSAje2V4cH0nXG4gICAgICAgICwgblxuICAgICAgICAsIGxlblxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgb2JqID4gblxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIGFib3ZlICcgKyBuXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgYXQgbW9zdCAnICsgblxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdhYm92ZScsIGFzc2VydEFib3ZlKTtcbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnZ3QnLCBhc3NlcnRBYm92ZSk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2dyZWF0ZXJUaGFuJywgYXNzZXJ0QWJvdmUpO1xuXG4gIC8qKlxuICAgKiAjIyMgLmxlYXN0KHZhbHVlKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBpcyBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gYHZhbHVlYC5cbiAgICpcbiAgICogICAgIGV4cGVjdCgxMCkudG8uYmUuYXQubGVhc3QoMTApO1xuICAgKlxuICAgKiBDYW4gYWxzbyBiZSB1c2VkIGluIGNvbmp1bmN0aW9uIHdpdGggYGxlbmd0aGAgdG9cbiAgICogYXNzZXJ0IGEgbWluaW11bSBsZW5ndGguIFRoZSBiZW5lZml0IGJlaW5nIGFcbiAgICogbW9yZSBpbmZvcm1hdGl2ZSBlcnJvciBtZXNzYWdlIHRoYW4gaWYgdGhlIGxlbmd0aFxuICAgKiB3YXMgc3VwcGxpZWQgZGlyZWN0bHkuXG4gICAqXG4gICAqICAgICBleHBlY3QoJ2ZvbycpLnRvLmhhdmUubGVuZ3RoLm9mLmF0LmxlYXN0KDIpO1xuICAgKiAgICAgZXhwZWN0KFsgMSwgMiwgMyBdKS50by5oYXZlLmxlbmd0aC5vZi5hdC5sZWFzdCgzKTtcbiAgICpcbiAgICogQG5hbWUgbGVhc3RcbiAgICogQGFsaWFzIGd0ZVxuICAgKiBAcGFyYW0ge051bWJlcn0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBmdW5jdGlvbiBhc3NlcnRMZWFzdCAobiwgbXNnKSB7XG4gICAgaWYgKG1zZykgZmxhZyh0aGlzLCAnbWVzc2FnZScsIG1zZyk7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpO1xuICAgIGlmIChmbGFnKHRoaXMsICdkb0xlbmd0aCcpKSB7XG4gICAgICBuZXcgQXNzZXJ0aW9uKG9iaiwgbXNnKS50by5oYXZlLnByb3BlcnR5KCdsZW5ndGgnKTtcbiAgICAgIHZhciBsZW4gPSBvYmoubGVuZ3RoO1xuICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgbGVuID49IG5cbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBoYXZlIGEgbGVuZ3RoIGF0IGxlYXN0ICN7ZXhwfSBidXQgZ290ICN7YWN0fSdcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBoYXZlIGEgbGVuZ3RoIGJlbG93ICN7ZXhwfSdcbiAgICAgICAgLCBuXG4gICAgICAgICwgbGVuXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmFzc2VydChcbiAgICAgICAgICBvYmogPj0gblxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIGF0IGxlYXN0ICcgKyBuXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgYmVsb3cgJyArIG5cbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnbGVhc3QnLCBhc3NlcnRMZWFzdCk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2d0ZScsIGFzc2VydExlYXN0KTtcblxuICAvKipcbiAgICogIyMjIC5iZWxvdyh2YWx1ZSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaXMgbGVzcyB0aGFuIGB2YWx1ZWAuXG4gICAqXG4gICAqICAgICBleHBlY3QoNSkudG8uYmUuYmVsb3coMTApO1xuICAgKlxuICAgKiBDYW4gYWxzbyBiZSB1c2VkIGluIGNvbmp1bmN0aW9uIHdpdGggYGxlbmd0aGAgdG9cbiAgICogYXNzZXJ0IGEgbWF4aW11bSBsZW5ndGguIFRoZSBiZW5lZml0IGJlaW5nIGFcbiAgICogbW9yZSBpbmZvcm1hdGl2ZSBlcnJvciBtZXNzYWdlIHRoYW4gaWYgdGhlIGxlbmd0aFxuICAgKiB3YXMgc3VwcGxpZWQgZGlyZWN0bHkuXG4gICAqXG4gICAqICAgICBleHBlY3QoJ2ZvbycpLnRvLmhhdmUubGVuZ3RoLmJlbG93KDQpO1xuICAgKiAgICAgZXhwZWN0KFsgMSwgMiwgMyBdKS50by5oYXZlLmxlbmd0aC5iZWxvdyg0KTtcbiAgICpcbiAgICogQG5hbWUgYmVsb3dcbiAgICogQGFsaWFzIGx0XG4gICAqIEBhbGlhcyBsZXNzVGhhblxuICAgKiBAcGFyYW0ge051bWJlcn0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBmdW5jdGlvbiBhc3NlcnRCZWxvdyAobiwgbXNnKSB7XG4gICAgaWYgKG1zZykgZmxhZyh0aGlzLCAnbWVzc2FnZScsIG1zZyk7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpO1xuICAgIGlmIChmbGFnKHRoaXMsICdkb0xlbmd0aCcpKSB7XG4gICAgICBuZXcgQXNzZXJ0aW9uKG9iaiwgbXNnKS50by5oYXZlLnByb3BlcnR5KCdsZW5ndGgnKTtcbiAgICAgIHZhciBsZW4gPSBvYmoubGVuZ3RoO1xuICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgbGVuIDwgblxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGhhdmUgYSBsZW5ndGggYmVsb3cgI3tleHB9IGJ1dCBnb3QgI3thY3R9J1xuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBoYXZlIGEgbGVuZ3RoIGJlbG93ICN7ZXhwfSdcbiAgICAgICAgLCBuXG4gICAgICAgICwgbGVuXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmFzc2VydChcbiAgICAgICAgICBvYmogPCBuXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgYmVsb3cgJyArIG5cbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSBhdCBsZWFzdCAnICsgblxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdiZWxvdycsIGFzc2VydEJlbG93KTtcbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnbHQnLCBhc3NlcnRCZWxvdyk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2xlc3NUaGFuJywgYXNzZXJ0QmVsb3cpO1xuXG4gIC8qKlxuICAgKiAjIyMgLm1vc3QodmFsdWUpXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byBgdmFsdWVgLlxuICAgKlxuICAgKiAgICAgZXhwZWN0KDUpLnRvLmJlLmF0Lm1vc3QoNSk7XG4gICAqXG4gICAqIENhbiBhbHNvIGJlIHVzZWQgaW4gY29uanVuY3Rpb24gd2l0aCBgbGVuZ3RoYCB0b1xuICAgKiBhc3NlcnQgYSBtYXhpbXVtIGxlbmd0aC4gVGhlIGJlbmVmaXQgYmVpbmcgYVxuICAgKiBtb3JlIGluZm9ybWF0aXZlIGVycm9yIG1lc3NhZ2UgdGhhbiBpZiB0aGUgbGVuZ3RoXG4gICAqIHdhcyBzdXBwbGllZCBkaXJlY3RseS5cbiAgICpcbiAgICogICAgIGV4cGVjdCgnZm9vJykudG8uaGF2ZS5sZW5ndGgub2YuYXQubW9zdCg0KTtcbiAgICogICAgIGV4cGVjdChbIDEsIDIsIDMgXSkudG8uaGF2ZS5sZW5ndGgub2YuYXQubW9zdCgzKTtcbiAgICpcbiAgICogQG5hbWUgbW9zdFxuICAgKiBAYWxpYXMgbHRlXG4gICAqIEBwYXJhbSB7TnVtYmVyfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGFzc2VydE1vc3QgKG4sIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKTtcbiAgICBpZiAoZmxhZyh0aGlzLCAnZG9MZW5ndGgnKSkge1xuICAgICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykudG8uaGF2ZS5wcm9wZXJ0eSgnbGVuZ3RoJyk7XG4gICAgICB2YXIgbGVuID0gb2JqLmxlbmd0aDtcbiAgICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICAgIGxlbiA8PSBuXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gaGF2ZSBhIGxlbmd0aCBhdCBtb3N0ICN7ZXhwfSBidXQgZ290ICN7YWN0fSdcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBoYXZlIGEgbGVuZ3RoIGFib3ZlICN7ZXhwfSdcbiAgICAgICAgLCBuXG4gICAgICAgICwgbGVuXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmFzc2VydChcbiAgICAgICAgICBvYmogPD0gblxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIGF0IG1vc3QgJyArIG5cbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSBhYm92ZSAnICsgblxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdtb3N0JywgYXNzZXJ0TW9zdCk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2x0ZScsIGFzc2VydE1vc3QpO1xuXG4gIC8qKlxuICAgKiAjIyMgLndpdGhpbihzdGFydCwgZmluaXNoKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBpcyB3aXRoaW4gYSByYW5nZS5cbiAgICpcbiAgICogICAgIGV4cGVjdCg3KS50by5iZS53aXRoaW4oNSwxMCk7XG4gICAqXG4gICAqIENhbiBhbHNvIGJlIHVzZWQgaW4gY29uanVuY3Rpb24gd2l0aCBgbGVuZ3RoYCB0b1xuICAgKiBhc3NlcnQgYSBsZW5ndGggcmFuZ2UuIFRoZSBiZW5lZml0IGJlaW5nIGFcbiAgICogbW9yZSBpbmZvcm1hdGl2ZSBlcnJvciBtZXNzYWdlIHRoYW4gaWYgdGhlIGxlbmd0aFxuICAgKiB3YXMgc3VwcGxpZWQgZGlyZWN0bHkuXG4gICAqXG4gICAqICAgICBleHBlY3QoJ2ZvbycpLnRvLmhhdmUubGVuZ3RoLndpdGhpbigyLDQpO1xuICAgKiAgICAgZXhwZWN0KFsgMSwgMiwgMyBdKS50by5oYXZlLmxlbmd0aC53aXRoaW4oMiw0KTtcbiAgICpcbiAgICogQG5hbWUgd2l0aGluXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBzdGFydCBsb3dlcmJvdW5kIGluY2x1c2l2ZVxuICAgKiBAcGFyYW0ge051bWJlcn0gZmluaXNoIHVwcGVyYm91bmQgaW5jbHVzaXZlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnd2l0aGluJywgZnVuY3Rpb24gKHN0YXJ0LCBmaW5pc2gsIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKVxuICAgICAgLCByYW5nZSA9IHN0YXJ0ICsgJy4uJyArIGZpbmlzaDtcbiAgICBpZiAoZmxhZyh0aGlzLCAnZG9MZW5ndGgnKSkge1xuICAgICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykudG8uaGF2ZS5wcm9wZXJ0eSgnbGVuZ3RoJyk7XG4gICAgICB2YXIgbGVuID0gb2JqLmxlbmd0aDtcbiAgICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICAgIGxlbiA+PSBzdGFydCAmJiBsZW4gPD0gZmluaXNoXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gaGF2ZSBhIGxlbmd0aCB3aXRoaW4gJyArIHJhbmdlXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IGhhdmUgYSBsZW5ndGggd2l0aGluICcgKyByYW5nZVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgb2JqID49IHN0YXJ0ICYmIG9iaiA8PSBmaW5pc2hcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSB3aXRoaW4gJyArIHJhbmdlXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IGJlIHdpdGhpbiAnICsgcmFuZ2VcbiAgICAgICk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogIyMjIC5pbnN0YW5jZW9mKGNvbnN0cnVjdG9yKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBpcyBhbiBpbnN0YW5jZSBvZiBgY29uc3RydWN0b3JgLlxuICAgKlxuICAgKiAgICAgdmFyIFRlYSA9IGZ1bmN0aW9uIChuYW1lKSB7IHRoaXMubmFtZSA9IG5hbWU7IH1cbiAgICogICAgICAgLCBDaGFpID0gbmV3IFRlYSgnY2hhaScpO1xuICAgKlxuICAgKiAgICAgZXhwZWN0KENoYWkpLnRvLmJlLmFuLmluc3RhbmNlb2YoVGVhKTtcbiAgICogICAgIGV4cGVjdChbIDEsIDIsIDMgXSkudG8uYmUuaW5zdGFuY2VvZihBcnJheSk7XG4gICAqXG4gICAqIEBuYW1lIGluc3RhbmNlb2ZcbiAgICogQHBhcmFtIHtDb25zdHJ1Y3Rvcn0gY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAYWxpYXMgaW5zdGFuY2VPZlxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBmdW5jdGlvbiBhc3NlcnRJbnN0YW5jZU9mIChjb25zdHJ1Y3RvciwgbXNnKSB7XG4gICAgaWYgKG1zZykgZmxhZyh0aGlzLCAnbWVzc2FnZScsIG1zZyk7XG4gICAgdmFyIG5hbWUgPSBfLmdldE5hbWUoY29uc3RydWN0b3IpO1xuICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICBmbGFnKHRoaXMsICdvYmplY3QnKSBpbnN0YW5jZW9mIGNvbnN0cnVjdG9yXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIGFuIGluc3RhbmNlIG9mICcgKyBuYW1lXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBiZSBhbiBpbnN0YW5jZSBvZiAnICsgbmFtZVxuICAgICk7XG4gIH07XG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnaW5zdGFuY2VvZicsIGFzc2VydEluc3RhbmNlT2YpO1xuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdpbnN0YW5jZU9mJywgYXNzZXJ0SW5zdGFuY2VPZik7XG5cbiAgLyoqXG4gICAqICMjIyAucHJvcGVydHkobmFtZSwgW3ZhbHVlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaGFzIGEgcHJvcGVydHkgYG5hbWVgLCBvcHRpb25hbGx5IGFzc2VydGluZyB0aGF0XG4gICAqIHRoZSB2YWx1ZSBvZiB0aGF0IHByb3BlcnR5IGlzIHN0cmljdGx5IGVxdWFsIHRvICBgdmFsdWVgLlxuICAgKiBJZiB0aGUgYGRlZXBgIGZsYWcgaXMgc2V0LCB5b3UgY2FuIHVzZSBkb3QtIGFuZCBicmFja2V0LW5vdGF0aW9uIGZvciBkZWVwXG4gICAqIHJlZmVyZW5jZXMgaW50byBvYmplY3RzIGFuZCBhcnJheXMuXG4gICAqXG4gICAqICAgICAvLyBzaW1wbGUgcmVmZXJlbmNpbmdcbiAgICogICAgIHZhciBvYmogPSB7IGZvbzogJ2JhcicgfTtcbiAgICogICAgIGV4cGVjdChvYmopLnRvLmhhdmUucHJvcGVydHkoJ2ZvbycpO1xuICAgKiAgICAgZXhwZWN0KG9iaikudG8uaGF2ZS5wcm9wZXJ0eSgnZm9vJywgJ2JhcicpO1xuICAgKlxuICAgKiAgICAgLy8gZGVlcCByZWZlcmVuY2luZ1xuICAgKiAgICAgdmFyIGRlZXBPYmogPSB7XG4gICAqICAgICAgICAgZ3JlZW46IHsgdGVhOiAnbWF0Y2hhJyB9XG4gICAqICAgICAgICwgdGVhczogWyAnY2hhaScsICdtYXRjaGEnLCB7IHRlYTogJ2tvbmFjaGEnIH0gXVxuICAgKiAgICAgfTtcblxuICAgKiAgICAgZXhwZWN0KGRlZXBPYmopLnRvLmhhdmUuZGVlcC5wcm9wZXJ0eSgnZ3JlZW4udGVhJywgJ21hdGNoYScpO1xuICAgKiAgICAgZXhwZWN0KGRlZXBPYmopLnRvLmhhdmUuZGVlcC5wcm9wZXJ0eSgndGVhc1sxXScsICdtYXRjaGEnKTtcbiAgICogICAgIGV4cGVjdChkZWVwT2JqKS50by5oYXZlLmRlZXAucHJvcGVydHkoJ3RlYXNbMl0udGVhJywgJ2tvbmFjaGEnKTtcbiAgICpcbiAgICogWW91IGNhbiBhbHNvIHVzZSBhbiBhcnJheSBhcyB0aGUgc3RhcnRpbmcgcG9pbnQgb2YgYSBgZGVlcC5wcm9wZXJ0eWBcbiAgICogYXNzZXJ0aW9uLCBvciB0cmF2ZXJzZSBuZXN0ZWQgYXJyYXlzLlxuICAgKlxuICAgKiAgICAgdmFyIGFyciA9IFtcbiAgICogICAgICAgICBbICdjaGFpJywgJ21hdGNoYScsICdrb25hY2hhJyBdXG4gICAqICAgICAgICwgWyB7IHRlYTogJ2NoYWknIH1cbiAgICogICAgICAgICAsIHsgdGVhOiAnbWF0Y2hhJyB9XG4gICAqICAgICAgICAgLCB7IHRlYTogJ2tvbmFjaGEnIH0gXVxuICAgKiAgICAgXTtcbiAgICpcbiAgICogICAgIGV4cGVjdChhcnIpLnRvLmhhdmUuZGVlcC5wcm9wZXJ0eSgnWzBdWzFdJywgJ21hdGNoYScpO1xuICAgKiAgICAgZXhwZWN0KGFycikudG8uaGF2ZS5kZWVwLnByb3BlcnR5KCdbMV1bMl0udGVhJywgJ2tvbmFjaGEnKTtcbiAgICpcbiAgICogRnVydGhlcm1vcmUsIGBwcm9wZXJ0eWAgY2hhbmdlcyB0aGUgc3ViamVjdCBvZiB0aGUgYXNzZXJ0aW9uXG4gICAqIHRvIGJlIHRoZSB2YWx1ZSBvZiB0aGF0IHByb3BlcnR5IGZyb20gdGhlIG9yaWdpbmFsIG9iamVjdC4gVGhpc1xuICAgKiBwZXJtaXRzIGZvciBmdXJ0aGVyIGNoYWluYWJsZSBhc3NlcnRpb25zIG9uIHRoYXQgcHJvcGVydHkuXG4gICAqXG4gICAqICAgICBleHBlY3Qob2JqKS50by5oYXZlLnByb3BlcnR5KCdmb28nKVxuICAgKiAgICAgICAudGhhdC5pcy5hKCdzdHJpbmcnKTtcbiAgICogICAgIGV4cGVjdChkZWVwT2JqKS50by5oYXZlLnByb3BlcnR5KCdncmVlbicpXG4gICAqICAgICAgIC50aGF0LmlzLmFuKCdvYmplY3QnKVxuICAgKiAgICAgICAudGhhdC5kZWVwLmVxdWFscyh7IHRlYTogJ21hdGNoYScgfSk7XG4gICAqICAgICBleHBlY3QoZGVlcE9iaikudG8uaGF2ZS5wcm9wZXJ0eSgndGVhcycpXG4gICAqICAgICAgIC50aGF0LmlzLmFuKCdhcnJheScpXG4gICAqICAgICAgIC53aXRoLmRlZXAucHJvcGVydHkoJ1syXScpXG4gICAqICAgICAgICAgLnRoYXQuZGVlcC5lcXVhbHMoeyB0ZWE6ICdrb25hY2hhJyB9KTtcbiAgICpcbiAgICogQG5hbWUgcHJvcGVydHlcbiAgICogQGFsaWFzIGRlZXAucHJvcGVydHlcbiAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWUgKG9wdGlvbmFsKVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEByZXR1cm5zIHZhbHVlIG9mIHByb3BlcnR5IGZvciBjaGFpbmluZ1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdwcm9wZXJ0eScsIGZ1bmN0aW9uIChuYW1lLCB2YWwsIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuXG4gICAgdmFyIGRlc2NyaXB0b3IgPSBmbGFnKHRoaXMsICdkZWVwJykgPyAnZGVlcCBwcm9wZXJ0eSAnIDogJ3Byb3BlcnR5ICdcbiAgICAgICwgbmVnYXRlID0gZmxhZyh0aGlzLCAnbmVnYXRlJylcbiAgICAgICwgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0JylcbiAgICAgICwgdmFsdWUgPSBmbGFnKHRoaXMsICdkZWVwJylcbiAgICAgICAgPyBfLmdldFBhdGhWYWx1ZShuYW1lLCBvYmopXG4gICAgICAgIDogb2JqW25hbWVdO1xuXG4gICAgaWYgKG5lZ2F0ZSAmJiB1bmRlZmluZWQgIT09IHZhbCkge1xuICAgICAgaWYgKHVuZGVmaW5lZCA9PT0gdmFsdWUpIHtcbiAgICAgICAgbXNnID0gKG1zZyAhPSBudWxsKSA/IG1zZyArICc6ICcgOiAnJztcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1zZyArIF8uaW5zcGVjdChvYmopICsgJyBoYXMgbm8gJyArIGRlc2NyaXB0b3IgKyBfLmluc3BlY3QobmFtZSkpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmFzc2VydChcbiAgICAgICAgICB1bmRlZmluZWQgIT09IHZhbHVlXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gaGF2ZSBhICcgKyBkZXNjcmlwdG9yICsgXy5pbnNwZWN0KG5hbWUpXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IGhhdmUgJyArIGRlc2NyaXB0b3IgKyBfLmluc3BlY3QobmFtZSkpO1xuICAgIH1cblxuICAgIGlmICh1bmRlZmluZWQgIT09IHZhbCkge1xuICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgdmFsID09PSB2YWx1ZVxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGhhdmUgYSAnICsgZGVzY3JpcHRvciArIF8uaW5zcGVjdChuYW1lKSArICcgb2YgI3tleHB9LCBidXQgZ290ICN7YWN0fSdcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgaGF2ZSBhICcgKyBkZXNjcmlwdG9yICsgXy5pbnNwZWN0KG5hbWUpICsgJyBvZiAje2FjdH0nXG4gICAgICAgICwgdmFsXG4gICAgICAgICwgdmFsdWVcbiAgICAgICk7XG4gICAgfVxuXG4gICAgZmxhZyh0aGlzLCAnb2JqZWN0JywgdmFsdWUpO1xuICB9KTtcblxuXG4gIC8qKlxuICAgKiAjIyMgLm93blByb3BlcnR5KG5hbWUpXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGhhcyBhbiBvd24gcHJvcGVydHkgYG5hbWVgLlxuICAgKlxuICAgKiAgICAgZXhwZWN0KCd0ZXN0JykudG8uaGF2ZS5vd25Qcm9wZXJ0eSgnbGVuZ3RoJyk7XG4gICAqXG4gICAqIEBuYW1lIG93blByb3BlcnR5XG4gICAqIEBhbGlhcyBoYXZlT3duUHJvcGVydHlcbiAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBmdW5jdGlvbiBhc3NlcnRPd25Qcm9wZXJ0eSAobmFtZSwgbXNnKSB7XG4gICAgaWYgKG1zZykgZmxhZyh0aGlzLCAnbWVzc2FnZScsIG1zZyk7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpO1xuICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICBvYmouaGFzT3duUHJvcGVydHkobmFtZSlcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gaGF2ZSBvd24gcHJvcGVydHkgJyArIF8uaW5zcGVjdChuYW1lKVxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgaGF2ZSBvd24gcHJvcGVydHkgJyArIF8uaW5zcGVjdChuYW1lKVxuICAgICk7XG4gIH1cblxuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdvd25Qcm9wZXJ0eScsIGFzc2VydE93blByb3BlcnR5KTtcbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnaGF2ZU93blByb3BlcnR5JywgYXNzZXJ0T3duUHJvcGVydHkpO1xuXG4gIC8qKlxuICAgKiAjIyMgLmxlbmd0aCh2YWx1ZSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQncyBgbGVuZ3RoYCBwcm9wZXJ0eSBoYXNcbiAgICogdGhlIGV4cGVjdGVkIHZhbHVlLlxuICAgKlxuICAgKiAgICAgZXhwZWN0KFsgMSwgMiwgM10pLnRvLmhhdmUubGVuZ3RoKDMpO1xuICAgKiAgICAgZXhwZWN0KCdmb29iYXInKS50by5oYXZlLmxlbmd0aCg2KTtcbiAgICpcbiAgICogQ2FuIGFsc28gYmUgdXNlZCBhcyBhIGNoYWluIHByZWN1cnNvciB0byBhIHZhbHVlXG4gICAqIGNvbXBhcmlzb24gZm9yIHRoZSBsZW5ndGggcHJvcGVydHkuXG4gICAqXG4gICAqICAgICBleHBlY3QoJ2ZvbycpLnRvLmhhdmUubGVuZ3RoLmFib3ZlKDIpO1xuICAgKiAgICAgZXhwZWN0KFsgMSwgMiwgMyBdKS50by5oYXZlLmxlbmd0aC5hYm92ZSgyKTtcbiAgICogICAgIGV4cGVjdCgnZm9vJykudG8uaGF2ZS5sZW5ndGguYmVsb3coNCk7XG4gICAqICAgICBleHBlY3QoWyAxLCAyLCAzIF0pLnRvLmhhdmUubGVuZ3RoLmJlbG93KDQpO1xuICAgKiAgICAgZXhwZWN0KCdmb28nKS50by5oYXZlLmxlbmd0aC53aXRoaW4oMiw0KTtcbiAgICogICAgIGV4cGVjdChbIDEsIDIsIDMgXSkudG8uaGF2ZS5sZW5ndGgud2l0aGluKDIsNCk7XG4gICAqXG4gICAqIEBuYW1lIGxlbmd0aFxuICAgKiBAYWxpYXMgbGVuZ3RoT2ZcbiAgICogQHBhcmFtIHtOdW1iZXJ9IGxlbmd0aFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGFzc2VydExlbmd0aENoYWluICgpIHtcbiAgICBmbGFnKHRoaXMsICdkb0xlbmd0aCcsIHRydWUpO1xuICB9XG5cbiAgZnVuY3Rpb24gYXNzZXJ0TGVuZ3RoIChuLCBtc2cpIHtcbiAgICBpZiAobXNnKSBmbGFnKHRoaXMsICdtZXNzYWdlJywgbXNnKTtcbiAgICB2YXIgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG4gICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykudG8uaGF2ZS5wcm9wZXJ0eSgnbGVuZ3RoJyk7XG4gICAgdmFyIGxlbiA9IG9iai5sZW5ndGg7XG5cbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgbGVuID09IG5cbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gaGF2ZSBhIGxlbmd0aCBvZiAje2V4cH0gYnV0IGdvdCAje2FjdH0nXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBoYXZlIGEgbGVuZ3RoIG9mICN7YWN0fSdcbiAgICAgICwgblxuICAgICAgLCBsZW5cbiAgICApO1xuICB9XG5cbiAgQXNzZXJ0aW9uLmFkZENoYWluYWJsZU1ldGhvZCgnbGVuZ3RoJywgYXNzZXJ0TGVuZ3RoLCBhc3NlcnRMZW5ndGhDaGFpbik7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2xlbmd0aE9mJywgYXNzZXJ0TGVuZ3RoLCBhc3NlcnRMZW5ndGhDaGFpbik7XG5cbiAgLyoqXG4gICAqICMjIyAubWF0Y2gocmVnZXhwKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBtYXRjaGVzIGEgcmVndWxhciBleHByZXNzaW9uLlxuICAgKlxuICAgKiAgICAgZXhwZWN0KCdmb29iYXInKS50by5tYXRjaCgvXmZvby8pO1xuICAgKlxuICAgKiBAbmFtZSBtYXRjaFxuICAgKiBAcGFyYW0ge1JlZ0V4cH0gUmVndWxhckV4cHJlc3Npb25cbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdtYXRjaCcsIGZ1bmN0aW9uIChyZSwgbXNnKSB7XG4gICAgaWYgKG1zZykgZmxhZyh0aGlzLCAnbWVzc2FnZScsIG1zZyk7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpO1xuICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICByZS5leGVjKG9iailcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbWF0Y2ggJyArIHJlXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IG5vdCB0byBtYXRjaCAnICsgcmVcbiAgICApO1xuICB9KTtcblxuICAvKipcbiAgICogIyMjIC5zdHJpbmcoc3RyaW5nKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHN0cmluZyB0YXJnZXQgY29udGFpbnMgYW5vdGhlciBzdHJpbmcuXG4gICAqXG4gICAqICAgICBleHBlY3QoJ2Zvb2JhcicpLnRvLmhhdmUuc3RyaW5nKCdiYXInKTtcbiAgICpcbiAgICogQG5hbWUgc3RyaW5nXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzdHJpbmdcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdzdHJpbmcnLCBmdW5jdGlvbiAoc3RyLCBtc2cpIHtcbiAgICBpZiAobXNnKSBmbGFnKHRoaXMsICdtZXNzYWdlJywgbXNnKTtcbiAgICB2YXIgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG4gICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykuaXMuYSgnc3RyaW5nJyk7XG5cbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgfm9iai5pbmRleE9mKHN0cilcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gY29udGFpbiAnICsgXy5pbnNwZWN0KHN0cilcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IGNvbnRhaW4gJyArIF8uaW5zcGVjdChzdHIpXG4gICAgKTtcbiAgfSk7XG5cblxuICAvKipcbiAgICogIyMjIC5rZXlzKGtleTEsIFtrZXkyXSwgWy4uLl0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGhhcyBleGFjdGx5IHRoZSBnaXZlbiBrZXlzLCBvclxuICAgKiBhc3NlcnRzIHRoZSBpbmNsdXNpb24gb2Ygc29tZSBrZXlzIHdoZW4gdXNpbmcgdGhlXG4gICAqIGBpbmNsdWRlYCBvciBgY29udGFpbmAgbW9kaWZpZXJzLlxuICAgKlxuICAgKiAgICAgZXhwZWN0KHsgZm9vOiAxLCBiYXI6IDIgfSkudG8uaGF2ZS5rZXlzKFsnZm9vJywgJ2JhciddKTtcbiAgICogICAgIGV4cGVjdCh7IGZvbzogMSwgYmFyOiAyLCBiYXo6IDMgfSkudG8uY29udGFpbi5rZXlzKCdmb28nLCAnYmFyJyk7XG4gICAqXG4gICAqIEBuYW1lIGtleXNcbiAgICogQGFsaWFzIGtleVxuICAgKiBAcGFyYW0ge1N0cmluZy4uLnxBcnJheX0ga2V5c1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBmdW5jdGlvbiBhc3NlcnRLZXlzIChrZXlzKSB7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpXG4gICAgICAsIHN0clxuICAgICAgLCBvayA9IHRydWU7XG5cbiAgICBrZXlzID0ga2V5cyBpbnN0YW5jZW9mIEFycmF5XG4gICAgICA/IGtleXNcbiAgICAgIDogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblxuICAgIGlmICgha2V5cy5sZW5ndGgpIHRocm93IG5ldyBFcnJvcigna2V5cyByZXF1aXJlZCcpO1xuXG4gICAgdmFyIGFjdHVhbCA9IE9iamVjdC5rZXlzKG9iailcbiAgICAgICwgbGVuID0ga2V5cy5sZW5ndGg7XG5cbiAgICAvLyBJbmNsdXNpb25cbiAgICBvayA9IGtleXMuZXZlcnkoZnVuY3Rpb24oa2V5KXtcbiAgICAgIHJldHVybiB+YWN0dWFsLmluZGV4T2Yoa2V5KTtcbiAgICB9KTtcblxuICAgIC8vIFN0cmljdFxuICAgIGlmICghZmxhZyh0aGlzLCAnbmVnYXRlJykgJiYgIWZsYWcodGhpcywgJ2NvbnRhaW5zJykpIHtcbiAgICAgIG9rID0gb2sgJiYga2V5cy5sZW5ndGggPT0gYWN0dWFsLmxlbmd0aDtcbiAgICB9XG5cbiAgICAvLyBLZXkgc3RyaW5nXG4gICAgaWYgKGxlbiA+IDEpIHtcbiAgICAgIGtleXMgPSBrZXlzLm1hcChmdW5jdGlvbihrZXkpe1xuICAgICAgICByZXR1cm4gXy5pbnNwZWN0KGtleSk7XG4gICAgICB9KTtcbiAgICAgIHZhciBsYXN0ID0ga2V5cy5wb3AoKTtcbiAgICAgIHN0ciA9IGtleXMuam9pbignLCAnKSArICcsIGFuZCAnICsgbGFzdDtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gXy5pbnNwZWN0KGtleXNbMF0pO1xuICAgIH1cblxuICAgIC8vIEZvcm1cbiAgICBzdHIgPSAobGVuID4gMSA/ICdrZXlzICcgOiAna2V5ICcpICsgc3RyO1xuXG4gICAgLy8gSGF2ZSAvIGluY2x1ZGVcbiAgICBzdHIgPSAoZmxhZyh0aGlzLCAnY29udGFpbnMnKSA/ICdjb250YWluICcgOiAnaGF2ZSAnKSArIHN0cjtcblxuICAgIC8vIEFzc2VydGlvblxuICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICBva1xuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byAnICsgc3RyXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCAnICsgc3RyXG4gICAgKTtcbiAgfVxuXG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2tleXMnLCBhc3NlcnRLZXlzKTtcbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgna2V5JywgYXNzZXJ0S2V5cyk7XG5cbiAgLyoqXG4gICAqICMjIyAudGhyb3coY29uc3RydWN0b3IpXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgZnVuY3Rpb24gdGFyZ2V0IHdpbGwgdGhyb3cgYSBzcGVjaWZpYyBlcnJvciwgb3Igc3BlY2lmaWMgdHlwZSBvZiBlcnJvclxuICAgKiAoYXMgZGV0ZXJtaW5lZCB1c2luZyBgaW5zdGFuY2VvZmApLCBvcHRpb25hbGx5IHdpdGggYSBSZWdFeHAgb3Igc3RyaW5nIGluY2x1c2lvbiB0ZXN0XG4gICAqIGZvciB0aGUgZXJyb3IncyBtZXNzYWdlLlxuICAgKlxuICAgKiAgICAgdmFyIGVyciA9IG5ldyBSZWZlcmVuY2VFcnJvcignVGhpcyBpcyBhIGJhZCBmdW5jdGlvbi4nKTtcbiAgICogICAgIHZhciBmbiA9IGZ1bmN0aW9uICgpIHsgdGhyb3cgZXJyOyB9XG4gICAqICAgICBleHBlY3QoZm4pLnRvLnRocm93KFJlZmVyZW5jZUVycm9yKTtcbiAgICogICAgIGV4cGVjdChmbikudG8udGhyb3coRXJyb3IpO1xuICAgKiAgICAgZXhwZWN0KGZuKS50by50aHJvdygvYmFkIGZ1bmN0aW9uLyk7XG4gICAqICAgICBleHBlY3QoZm4pLnRvLm5vdC50aHJvdygnZ29vZCBmdW5jdGlvbicpO1xuICAgKiAgICAgZXhwZWN0KGZuKS50by50aHJvdyhSZWZlcmVuY2VFcnJvciwgL2JhZCBmdW5jdGlvbi8pO1xuICAgKiAgICAgZXhwZWN0KGZuKS50by50aHJvdyhlcnIpO1xuICAgKiAgICAgZXhwZWN0KGZuKS50by5ub3QudGhyb3cobmV3IFJhbmdlRXJyb3IoJ091dCBvZiByYW5nZS4nKSk7XG4gICAqXG4gICAqIFBsZWFzZSBub3RlIHRoYXQgd2hlbiBhIHRocm93IGV4cGVjdGF0aW9uIGlzIG5lZ2F0ZWQsIGl0IHdpbGwgY2hlY2sgZWFjaFxuICAgKiBwYXJhbWV0ZXIgaW5kZXBlbmRlbnRseSwgc3RhcnRpbmcgd2l0aCBlcnJvciBjb25zdHJ1Y3RvciB0eXBlLiBUaGUgYXBwcm9wcmlhdGUgd2F5XG4gICAqIHRvIGNoZWNrIGZvciB0aGUgZXhpc3RlbmNlIG9mIGEgdHlwZSBvZiBlcnJvciBidXQgZm9yIGEgbWVzc2FnZSB0aGF0IGRvZXMgbm90IG1hdGNoXG4gICAqIGlzIHRvIHVzZSBgYW5kYC5cbiAgICpcbiAgICogICAgIGV4cGVjdChmbikudG8udGhyb3coUmVmZXJlbmNlRXJyb3IpXG4gICAqICAgICAgICAuYW5kLm5vdC50aHJvdygvZ29vZCBmdW5jdGlvbi8pO1xuICAgKlxuICAgKiBAbmFtZSB0aHJvd1xuICAgKiBAYWxpYXMgdGhyb3dzXG4gICAqIEBhbGlhcyBUaHJvd1xuICAgKiBAcGFyYW0ge0Vycm9yQ29uc3RydWN0b3J9IGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7U3RyaW5nfFJlZ0V4cH0gZXhwZWN0ZWQgZXJyb3IgbWVzc2FnZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEBzZWUgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4vSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvRXJyb3IjRXJyb3JfdHlwZXNcbiAgICogQHJldHVybnMgZXJyb3IgZm9yIGNoYWluaW5nIChudWxsIGlmIG5vIGVycm9yKVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBmdW5jdGlvbiBhc3NlcnRUaHJvd3MgKGNvbnN0cnVjdG9yLCBlcnJNc2csIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKTtcbiAgICBuZXcgQXNzZXJ0aW9uKG9iaiwgbXNnKS5pcy5hKCdmdW5jdGlvbicpO1xuXG4gICAgdmFyIHRocm93biA9IGZhbHNlXG4gICAgICAsIGRlc2lyZWRFcnJvciA9IG51bGxcbiAgICAgICwgbmFtZSA9IG51bGxcbiAgICAgICwgdGhyb3duRXJyb3IgPSBudWxsO1xuXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGVyck1zZyA9IG51bGw7XG4gICAgICBjb25zdHJ1Y3RvciA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChjb25zdHJ1Y3RvciAmJiAoY29uc3RydWN0b3IgaW5zdGFuY2VvZiBSZWdFeHAgfHwgJ3N0cmluZycgPT09IHR5cGVvZiBjb25zdHJ1Y3RvcikpIHtcbiAgICAgIGVyck1zZyA9IGNvbnN0cnVjdG9yO1xuICAgICAgY29uc3RydWN0b3IgPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoY29uc3RydWN0b3IgJiYgY29uc3RydWN0b3IgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgZGVzaXJlZEVycm9yID0gY29uc3RydWN0b3I7XG4gICAgICBjb25zdHJ1Y3RvciA9IG51bGw7XG4gICAgICBlcnJNc2cgPSBudWxsO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbnN0cnVjdG9yID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBuYW1lID0gY29uc3RydWN0b3IucHJvdG90eXBlLm5hbWUgfHwgY29uc3RydWN0b3IubmFtZTtcbiAgICAgIGlmIChuYW1lID09PSAnRXJyb3InICYmIGNvbnN0cnVjdG9yICE9PSBFcnJvcikge1xuICAgICAgICBuYW1lID0gKG5ldyBjb25zdHJ1Y3RvcigpKS5uYW1lO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdHJ1Y3RvciA9IG51bGw7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIG9iaigpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgLy8gZmlyc3QsIGNoZWNrIGRlc2lyZWQgZXJyb3JcbiAgICAgIGlmIChkZXNpcmVkRXJyb3IpIHtcbiAgICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgICBlcnIgPT09IGRlc2lyZWRFcnJvclxuICAgICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gdGhyb3cgI3tleHB9IGJ1dCAje2FjdH0gd2FzIHRocm93bidcbiAgICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCB0aHJvdyAje2V4cH0nXG4gICAgICAgICAgLCAoZGVzaXJlZEVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBkZXNpcmVkRXJyb3IudG9TdHJpbmcoKSA6IGRlc2lyZWRFcnJvcilcbiAgICAgICAgICAsIChlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci50b1N0cmluZygpIDogZXJyKVxuICAgICAgICApO1xuXG4gICAgICAgIGZsYWcodGhpcywgJ29iamVjdCcsIGVycik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuXG4gICAgICAvLyBuZXh0LCBjaGVjayBjb25zdHJ1Y3RvclxuICAgICAgaWYgKGNvbnN0cnVjdG9yKSB7XG4gICAgICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICAgICAgZXJyIGluc3RhbmNlb2YgY29uc3RydWN0b3JcbiAgICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIHRocm93ICN7ZXhwfSBidXQgI3thY3R9IHdhcyB0aHJvd24nXG4gICAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgdGhyb3cgI3tleHB9IGJ1dCAje2FjdH0gd2FzIHRocm93bidcbiAgICAgICAgICAsIG5hbWVcbiAgICAgICAgICAsIChlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci50b1N0cmluZygpIDogZXJyKVxuICAgICAgICApO1xuXG4gICAgICAgIGlmICghZXJyTXNnKSB7XG4gICAgICAgICAgZmxhZyh0aGlzLCAnb2JqZWN0JywgZXJyKTtcbiAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBuZXh0LCBjaGVjayBtZXNzYWdlXG4gICAgICB2YXIgbWVzc2FnZSA9ICdvYmplY3QnID09PSBfLnR5cGUoZXJyKSAmJiBcIm1lc3NhZ2VcIiBpbiBlcnJcbiAgICAgICAgPyBlcnIubWVzc2FnZVxuICAgICAgICA6ICcnICsgZXJyO1xuXG4gICAgICBpZiAoKG1lc3NhZ2UgIT0gbnVsbCkgJiYgZXJyTXNnICYmIGVyck1zZyBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICB0aGlzLmFzc2VydChcbiAgICAgICAgICAgIGVyck1zZy5leGVjKG1lc3NhZ2UpXG4gICAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byB0aHJvdyBlcnJvciBtYXRjaGluZyAje2V4cH0gYnV0IGdvdCAje2FjdH0nXG4gICAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byB0aHJvdyBlcnJvciBub3QgbWF0Y2hpbmcgI3tleHB9J1xuICAgICAgICAgICwgZXJyTXNnXG4gICAgICAgICAgLCBtZXNzYWdlXG4gICAgICAgICk7XG5cbiAgICAgICAgZmxhZyh0aGlzLCAnb2JqZWN0JywgZXJyKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9IGVsc2UgaWYgKChtZXNzYWdlICE9IG51bGwpICYmIGVyck1zZyAmJiAnc3RyaW5nJyA9PT0gdHlwZW9mIGVyck1zZykge1xuICAgICAgICB0aGlzLmFzc2VydChcbiAgICAgICAgICAgIH5tZXNzYWdlLmluZGV4T2YoZXJyTXNnKVxuICAgICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gdGhyb3cgZXJyb3IgaW5jbHVkaW5nICN7ZXhwfSBidXQgZ290ICN7YWN0fSdcbiAgICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIHRocm93IGVycm9yIG5vdCBpbmNsdWRpbmcgI3thY3R9J1xuICAgICAgICAgICwgZXJyTXNnXG4gICAgICAgICAgLCBtZXNzYWdlXG4gICAgICAgICk7XG5cbiAgICAgICAgZmxhZyh0aGlzLCAnb2JqZWN0JywgZXJyKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvd24gPSB0cnVlO1xuICAgICAgICB0aHJvd25FcnJvciA9IGVycjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgYWN0dWFsbHlHb3QgPSAnJ1xuICAgICAgLCBleHBlY3RlZFRocm93biA9IG5hbWUgIT09IG51bGxcbiAgICAgICAgPyBuYW1lXG4gICAgICAgIDogZGVzaXJlZEVycm9yXG4gICAgICAgICAgPyAnI3tleHB9JyAvL18uaW5zcGVjdChkZXNpcmVkRXJyb3IpXG4gICAgICAgICAgOiAnYW4gZXJyb3InO1xuXG4gICAgaWYgKHRocm93bikge1xuICAgICAgYWN0dWFsbHlHb3QgPSAnIGJ1dCAje2FjdH0gd2FzIHRocm93bidcbiAgICB9XG5cbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgdGhyb3duID09PSB0cnVlXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIHRocm93ICcgKyBleHBlY3RlZFRocm93biArIGFjdHVhbGx5R290XG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCB0aHJvdyAnICsgZXhwZWN0ZWRUaHJvd24gKyBhY3R1YWxseUdvdFxuICAgICAgLCAoZGVzaXJlZEVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBkZXNpcmVkRXJyb3IudG9TdHJpbmcoKSA6IGRlc2lyZWRFcnJvcilcbiAgICAgICwgKHRocm93bkVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyB0aHJvd25FcnJvci50b1N0cmluZygpIDogdGhyb3duRXJyb3IpXG4gICAgKTtcblxuICAgIGZsYWcodGhpcywgJ29iamVjdCcsIHRocm93bkVycm9yKTtcbiAgfTtcblxuICBBc3NlcnRpb24uYWRkTWV0aG9kKCd0aHJvdycsIGFzc2VydFRocm93cyk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ3Rocm93cycsIGFzc2VydFRocm93cyk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ1Rocm93JywgYXNzZXJ0VGhyb3dzKTtcblxuICAvKipcbiAgICogIyMjIC5yZXNwb25kVG8obWV0aG9kKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIG9iamVjdCBvciBjbGFzcyB0YXJnZXQgd2lsbCByZXNwb25kIHRvIGEgbWV0aG9kLlxuICAgKlxuICAgKiAgICAgS2xhc3MucHJvdG90eXBlLmJhciA9IGZ1bmN0aW9uKCl7fTtcbiAgICogICAgIGV4cGVjdChLbGFzcykudG8ucmVzcG9uZFRvKCdiYXInKTtcbiAgICogICAgIGV4cGVjdChvYmopLnRvLnJlc3BvbmRUbygnYmFyJyk7XG4gICAqXG4gICAqIFRvIGNoZWNrIGlmIGEgY29uc3RydWN0b3Igd2lsbCByZXNwb25kIHRvIGEgc3RhdGljIGZ1bmN0aW9uLFxuICAgKiBzZXQgdGhlIGBpdHNlbGZgIGZsYWcuXG4gICAqXG4gICAqICAgICBLbGFzcy5iYXogPSBmdW5jdGlvbigpe307XG4gICAqICAgICBleHBlY3QoS2xhc3MpLml0c2VsZi50by5yZXNwb25kVG8oJ2JheicpO1xuICAgKlxuICAgKiBAbmFtZSByZXNwb25kVG9cbiAgICogQHBhcmFtIHtTdHJpbmd9IG1ldGhvZFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ3Jlc3BvbmRUbycsIGZ1bmN0aW9uIChtZXRob2QsIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKVxuICAgICAgLCBpdHNlbGYgPSBmbGFnKHRoaXMsICdpdHNlbGYnKVxuICAgICAgLCBjb250ZXh0ID0gKCdmdW5jdGlvbicgPT09IF8udHlwZShvYmopICYmICFpdHNlbGYpXG4gICAgICAgID8gb2JqLnByb3RvdHlwZVttZXRob2RdXG4gICAgICAgIDogb2JqW21ldGhvZF07XG5cbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGNvbnRleHRcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gcmVzcG9uZCB0byAnICsgXy5pbnNwZWN0KG1ldGhvZClcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IHJlc3BvbmQgdG8gJyArIF8uaW5zcGVjdChtZXRob2QpXG4gICAgKTtcbiAgfSk7XG5cbiAgLyoqXG4gICAqICMjIyAuaXRzZWxmXG4gICAqXG4gICAqIFNldHMgdGhlIGBpdHNlbGZgIGZsYWcsIGxhdGVyIHVzZWQgYnkgdGhlIGByZXNwb25kVG9gIGFzc2VydGlvbi5cbiAgICpcbiAgICogICAgIGZ1bmN0aW9uIEZvbygpIHt9XG4gICAqICAgICBGb28uYmFyID0gZnVuY3Rpb24oKSB7fVxuICAgKiAgICAgRm9vLnByb3RvdHlwZS5iYXogPSBmdW5jdGlvbigpIHt9XG4gICAqXG4gICAqICAgICBleHBlY3QoRm9vKS5pdHNlbGYudG8ucmVzcG9uZFRvKCdiYXInKTtcbiAgICogICAgIGV4cGVjdChGb28pLml0c2VsZi5ub3QudG8ucmVzcG9uZFRvKCdiYXonKTtcbiAgICpcbiAgICogQG5hbWUgaXRzZWxmXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRQcm9wZXJ0eSgnaXRzZWxmJywgZnVuY3Rpb24gKCkge1xuICAgIGZsYWcodGhpcywgJ2l0c2VsZicsIHRydWUpO1xuICB9KTtcblxuICAvKipcbiAgICogIyMjIC5zYXRpc2Z5KG1ldGhvZClcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgcGFzc2VzIGEgZ2l2ZW4gdHJ1dGggdGVzdC5cbiAgICpcbiAgICogICAgIGV4cGVjdCgxKS50by5zYXRpc2Z5KGZ1bmN0aW9uKG51bSkgeyByZXR1cm4gbnVtID4gMDsgfSk7XG4gICAqXG4gICAqIEBuYW1lIHNhdGlzZnlcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbWF0Y2hlclxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ3NhdGlzZnknLCBmdW5jdGlvbiAobWF0Y2hlciwgbXNnKSB7XG4gICAgaWYgKG1zZykgZmxhZyh0aGlzLCAnbWVzc2FnZScsIG1zZyk7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpO1xuICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICBtYXRjaGVyKG9iailcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gc2F0aXNmeSAnICsgXy5vYmpEaXNwbGF5KG1hdGNoZXIpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBzYXRpc2Z5JyArIF8ub2JqRGlzcGxheShtYXRjaGVyKVxuICAgICAgLCB0aGlzLm5lZ2F0ZSA/IGZhbHNlIDogdHJ1ZVxuICAgICAgLCBtYXRjaGVyKG9iailcbiAgICApO1xuICB9KTtcblxuICAvKipcbiAgICogIyMjIC5jbG9zZVRvKGV4cGVjdGVkLCBkZWx0YSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaXMgZXF1YWwgYGV4cGVjdGVkYCwgdG8gd2l0aGluIGEgKy8tIGBkZWx0YWAgcmFuZ2UuXG4gICAqXG4gICAqICAgICBleHBlY3QoMS41KS50by5iZS5jbG9zZVRvKDEsIDAuNSk7XG4gICAqXG4gICAqIEBuYW1lIGNsb3NlVG9cbiAgICogQHBhcmFtIHtOdW1iZXJ9IGV4cGVjdGVkXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2Nsb3NlVG8nLCBmdW5jdGlvbiAoZXhwZWN0ZWQsIGRlbHRhLCBtc2cpIHtcbiAgICBpZiAobXNnKSBmbGFnKHRoaXMsICdtZXNzYWdlJywgbXNnKTtcbiAgICB2YXIgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgIE1hdGguYWJzKG9iaiAtIGV4cGVjdGVkKSA8PSBkZWx0YVxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSBjbG9zZSB0byAnICsgZXhwZWN0ZWQgKyAnICsvLSAnICsgZGVsdGFcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gbm90IHRvIGJlIGNsb3NlIHRvICcgKyBleHBlY3RlZCArICcgKy8tICcgKyBkZWx0YVxuICAgICk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIGlzU3Vic2V0T2Yoc3Vic2V0LCBzdXBlcnNldCwgY21wKSB7XG4gICAgcmV0dXJuIHN1YnNldC5ldmVyeShmdW5jdGlvbihlbGVtKSB7XG4gICAgICBpZiAoIWNtcCkgcmV0dXJuIHN1cGVyc2V0LmluZGV4T2YoZWxlbSkgIT09IC0xO1xuXG4gICAgICByZXR1cm4gc3VwZXJzZXQuc29tZShmdW5jdGlvbihlbGVtMikge1xuICAgICAgICByZXR1cm4gY21wKGVsZW0sIGVsZW0yKTtcbiAgICAgIH0pO1xuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogIyMjIC5tZW1iZXJzKHNldClcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaXMgYSBzdXBlcnNldCBvZiBgc2V0YCxcbiAgICogb3IgdGhhdCB0aGUgdGFyZ2V0IGFuZCBgc2V0YCBoYXZlIHRoZSBzYW1lIHN0cmljdGx5LWVxdWFsICg9PT0pIG1lbWJlcnMuXG4gICAqIEFsdGVybmF0ZWx5LCBpZiB0aGUgYGRlZXBgIGZsYWcgaXMgc2V0LCBzZXQgbWVtYmVycyBhcmUgY29tcGFyZWQgZm9yIGRlZXBcbiAgICogZXF1YWxpdHkuXG4gICAqXG4gICAqICAgICBleHBlY3QoWzEsIDIsIDNdKS50by5pbmNsdWRlLm1lbWJlcnMoWzMsIDJdKTtcbiAgICogICAgIGV4cGVjdChbMSwgMiwgM10pLnRvLm5vdC5pbmNsdWRlLm1lbWJlcnMoWzMsIDIsIDhdKTtcbiAgICpcbiAgICogICAgIGV4cGVjdChbNCwgMl0pLnRvLmhhdmUubWVtYmVycyhbMiwgNF0pO1xuICAgKiAgICAgZXhwZWN0KFs1LCAyXSkudG8ubm90LmhhdmUubWVtYmVycyhbNSwgMiwgMV0pO1xuICAgKlxuICAgKiAgICAgZXhwZWN0KFt7IGlkOiAxIH1dKS50by5kZWVwLmluY2x1ZGUubWVtYmVycyhbeyBpZDogMSB9XSk7XG4gICAqXG4gICAqIEBuYW1lIG1lbWJlcnNcbiAgICogQHBhcmFtIHtBcnJheX0gc2V0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnbWVtYmVycycsIGZ1bmN0aW9uIChzdWJzZXQsIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKTtcblxuICAgIG5ldyBBc3NlcnRpb24ob2JqKS50by5iZS5hbignYXJyYXknKTtcbiAgICBuZXcgQXNzZXJ0aW9uKHN1YnNldCkudG8uYmUuYW4oJ2FycmF5Jyk7XG5cbiAgICB2YXIgY21wID0gZmxhZyh0aGlzLCAnZGVlcCcpID8gXy5lcWwgOiB1bmRlZmluZWQ7XG5cbiAgICBpZiAoZmxhZyh0aGlzLCAnY29udGFpbnMnKSkge1xuICAgICAgcmV0dXJuIHRoaXMuYXNzZXJ0KFxuICAgICAgICAgIGlzU3Vic2V0T2Yoc3Vic2V0LCBvYmosIGNtcClcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSBhIHN1cGVyc2V0IG9mICN7YWN0fSdcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgYmUgYSBzdXBlcnNldCBvZiAje2FjdH0nXG4gICAgICAgICwgb2JqXG4gICAgICAgICwgc3Vic2V0XG4gICAgICApO1xuICAgIH1cblxuICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICBpc1N1YnNldE9mKG9iaiwgc3Vic2V0LCBjbXApICYmIGlzU3Vic2V0T2Yoc3Vic2V0LCBvYmosIGNtcClcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBoYXZlIHRoZSBzYW1lIG1lbWJlcnMgYXMgI3thY3R9J1xuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBoYXZlIHRoZSBzYW1lIG1lbWJlcnMgYXMgI3thY3R9J1xuICAgICAgICAsIG9ialxuICAgICAgICAsIHN1YnNldFxuICAgICk7XG4gIH0pO1xufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS9pbnRlcmZhY2UvYXNzZXJ0LmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIGNoYWlcbiAqIENvcHlyaWdodChjKSAyMDExLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNoYWksIHV0aWwpIHtcblxuICAvKiFcbiAgICogQ2hhaSBkZXBlbmRlbmNpZXMuXG4gICAqL1xuXG4gIHZhciBBc3NlcnRpb24gPSBjaGFpLkFzc2VydGlvblxuICAgICwgZmxhZyA9IHV0aWwuZmxhZztcblxuICAvKiFcbiAgICogTW9kdWxlIGV4cG9ydC5cbiAgICovXG5cbiAgLyoqXG4gICAqICMjIyBhc3NlcnQoZXhwcmVzc2lvbiwgbWVzc2FnZSlcbiAgICpcbiAgICogV3JpdGUgeW91ciBvd24gdGVzdCBleHByZXNzaW9ucy5cbiAgICpcbiAgICogICAgIGFzc2VydCgnZm9vJyAhPT0gJ2JhcicsICdmb28gaXMgbm90IGJhcicpO1xuICAgKiAgICAgYXNzZXJ0KEFycmF5LmlzQXJyYXkoW10pLCAnZW1wdHkgYXJyYXlzIGFyZSBhcnJheXMnKTtcbiAgICpcbiAgICogQHBhcmFtIHtNaXhlZH0gZXhwcmVzc2lvbiB0byB0ZXN0IGZvciB0cnV0aGluZXNzXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIHRvIGRpc3BsYXkgb24gZXJyb3JcbiAgICogQG5hbWUgYXNzZXJ0XG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIHZhciBhc3NlcnQgPSBjaGFpLmFzc2VydCA9IGZ1bmN0aW9uIChleHByZXNzLCBlcnJtc2cpIHtcbiAgICB2YXIgdGVzdCA9IG5ldyBBc3NlcnRpb24obnVsbCwgbnVsbCwgY2hhaS5hc3NlcnQpO1xuICAgIHRlc3QuYXNzZXJ0KFxuICAgICAgICBleHByZXNzXG4gICAgICAsIGVycm1zZ1xuICAgICAgLCAnWyBuZWdhdGlvbiBtZXNzYWdlIHVuYXZhaWxhYmxlIF0nXG4gICAgKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5mYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIFttZXNzYWdlXSwgW29wZXJhdG9yXSlcbiAgICpcbiAgICogVGhyb3cgYSBmYWlsdXJlLiBOb2RlLmpzIGBhc3NlcnRgIG1vZHVsZS1jb21wYXRpYmxlLlxuICAgKlxuICAgKiBAbmFtZSBmYWlsXG4gICAqIEBwYXJhbSB7TWl4ZWR9IGFjdHVhbFxuICAgKiBAcGFyYW0ge01peGVkfSBleHBlY3RlZFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gb3BlcmF0b3JcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmZhaWwgPSBmdW5jdGlvbiAoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgb3BlcmF0b3IpIHtcbiAgICBtZXNzYWdlID0gbWVzc2FnZSB8fCAnYXNzZXJ0LmZhaWwoKSc7XG4gICAgdGhyb3cgbmV3IGNoYWkuQXNzZXJ0aW9uRXJyb3IobWVzc2FnZSwge1xuICAgICAgICBhY3R1YWw6IGFjdHVhbFxuICAgICAgLCBleHBlY3RlZDogZXhwZWN0ZWRcbiAgICAgICwgb3BlcmF0b3I6IG9wZXJhdG9yXG4gICAgfSwgYXNzZXJ0LmZhaWwpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLm9rKG9iamVjdCwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYG9iamVjdGAgaXMgdHJ1dGh5LlxuICAgKlxuICAgKiAgICAgYXNzZXJ0Lm9rKCdldmVyeXRoaW5nJywgJ2V2ZXJ5dGhpbmcgaXMgb2snKTtcbiAgICogICAgIGFzc2VydC5vayhmYWxzZSwgJ3RoaXMgd2lsbCBmYWlsJyk7XG4gICAqXG4gICAqIEBuYW1lIG9rXG4gICAqIEBwYXJhbSB7TWl4ZWR9IG9iamVjdCB0byB0ZXN0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5vayA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLmlzLm9rO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLm5vdE9rKG9iamVjdCwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYG9iamVjdGAgaXMgZmFsc3kuXG4gICAqXG4gICAqICAgICBhc3NlcnQubm90T2soJ2V2ZXJ5dGhpbmcnLCAndGhpcyB3aWxsIGZhaWwnKTtcbiAgICogICAgIGFzc2VydC5ub3RPayhmYWxzZSwgJ3RoaXMgd2lsbCBwYXNzJyk7XG4gICAqXG4gICAqIEBuYW1lIG5vdE9rXG4gICAqIEBwYXJhbSB7TWl4ZWR9IG9iamVjdCB0byB0ZXN0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5ub3RPayA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLmlzLm5vdC5vaztcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5lcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgbm9uLXN0cmljdCBlcXVhbGl0eSAoYD09YCkgb2YgYGFjdHVhbGAgYW5kIGBleHBlY3RlZGAuXG4gICAqXG4gICAqICAgICBhc3NlcnQuZXF1YWwoMywgJzMnLCAnPT0gY29lcmNlcyB2YWx1ZXMgdG8gc3RyaW5ncycpO1xuICAgKlxuICAgKiBAbmFtZSBlcXVhbFxuICAgKiBAcGFyYW0ge01peGVkfSBhY3R1YWxcbiAgICogQHBhcmFtIHtNaXhlZH0gZXhwZWN0ZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmVxdWFsID0gZnVuY3Rpb24gKGFjdCwgZXhwLCBtc2cpIHtcbiAgICB2YXIgdGVzdCA9IG5ldyBBc3NlcnRpb24oYWN0LCBtc2csIGFzc2VydC5lcXVhbCk7XG5cbiAgICB0ZXN0LmFzc2VydChcbiAgICAgICAgZXhwID09IGZsYWcodGVzdCwgJ29iamVjdCcpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGVxdWFsICN7ZXhwfSdcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IGVxdWFsICN7YWN0fSdcbiAgICAgICwgZXhwXG4gICAgICAsIGFjdFxuICAgICk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAubm90RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIG5vbi1zdHJpY3QgaW5lcXVhbGl0eSAoYCE9YCkgb2YgYGFjdHVhbGAgYW5kIGBleHBlY3RlZGAuXG4gICAqXG4gICAqICAgICBhc3NlcnQubm90RXF1YWwoMywgNCwgJ3RoZXNlIG51bWJlcnMgYXJlIG5vdCBlcXVhbCcpO1xuICAgKlxuICAgKiBAbmFtZSBub3RFcXVhbFxuICAgKiBAcGFyYW0ge01peGVkfSBhY3R1YWxcbiAgICogQHBhcmFtIHtNaXhlZH0gZXhwZWN0ZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0Lm5vdEVxdWFsID0gZnVuY3Rpb24gKGFjdCwgZXhwLCBtc2cpIHtcbiAgICB2YXIgdGVzdCA9IG5ldyBBc3NlcnRpb24oYWN0LCBtc2csIGFzc2VydC5ub3RFcXVhbCk7XG5cbiAgICB0ZXN0LmFzc2VydChcbiAgICAgICAgZXhwICE9IGZsYWcodGVzdCwgJ29iamVjdCcpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBlcXVhbCAje2V4cH0nXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGVxdWFsICN7YWN0fSdcbiAgICAgICwgZXhwXG4gICAgICAsIGFjdFxuICAgICk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHN0cmljdCBlcXVhbGl0eSAoYD09PWApIG9mIGBhY3R1YWxgIGFuZCBgZXhwZWN0ZWRgLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LnN0cmljdEVxdWFsKHRydWUsIHRydWUsICd0aGVzZSBib29sZWFucyBhcmUgc3RyaWN0bHkgZXF1YWwnKTtcbiAgICpcbiAgICogQG5hbWUgc3RyaWN0RXF1YWxcbiAgICogQHBhcmFtIHtNaXhlZH0gYWN0dWFsXG4gICAqIEBwYXJhbSB7TWl4ZWR9IGV4cGVjdGVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5zdHJpY3RFcXVhbCA9IGZ1bmN0aW9uIChhY3QsIGV4cCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbihhY3QsIG1zZykudG8uZXF1YWwoZXhwKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5ub3RTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgc3RyaWN0IGluZXF1YWxpdHkgKGAhPT1gKSBvZiBgYWN0dWFsYCBhbmQgYGV4cGVjdGVkYC5cbiAgICpcbiAgICogICAgIGFzc2VydC5ub3RTdHJpY3RFcXVhbCgzLCAnMycsICdubyBjb2VyY2lvbiBmb3Igc3RyaWN0IGVxdWFsaXR5Jyk7XG4gICAqXG4gICAqIEBuYW1lIG5vdFN0cmljdEVxdWFsXG4gICAqIEBwYXJhbSB7TWl4ZWR9IGFjdHVhbFxuICAgKiBAcGFyYW0ge01peGVkfSBleHBlY3RlZFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQubm90U3RyaWN0RXF1YWwgPSBmdW5jdGlvbiAoYWN0LCBleHAsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24oYWN0LCBtc2cpLnRvLm5vdC5lcXVhbChleHApO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmRlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgYWN0dWFsYCBpcyBkZWVwbHkgZXF1YWwgdG8gYGV4cGVjdGVkYC5cbiAgICpcbiAgICogICAgIGFzc2VydC5kZWVwRXF1YWwoeyB0ZWE6ICdncmVlbicgfSwgeyB0ZWE6ICdncmVlbicgfSk7XG4gICAqXG4gICAqIEBuYW1lIGRlZXBFcXVhbFxuICAgKiBAcGFyYW0ge01peGVkfSBhY3R1YWxcbiAgICogQHBhcmFtIHtNaXhlZH0gZXhwZWN0ZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmRlZXBFcXVhbCA9IGZ1bmN0aW9uIChhY3QsIGV4cCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbihhY3QsIG1zZykudG8uZXFsKGV4cCk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAubm90RGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0IHRoYXQgYGFjdHVhbGAgaXMgbm90IGRlZXBseSBlcXVhbCB0byBgZXhwZWN0ZWRgLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0Lm5vdERlZXBFcXVhbCh7IHRlYTogJ2dyZWVuJyB9LCB7IHRlYTogJ2phc21pbmUnIH0pO1xuICAgKlxuICAgKiBAbmFtZSBub3REZWVwRXF1YWxcbiAgICogQHBhcmFtIHtNaXhlZH0gYWN0dWFsXG4gICAqIEBwYXJhbSB7TWl4ZWR9IGV4cGVjdGVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5ub3REZWVwRXF1YWwgPSBmdW5jdGlvbiAoYWN0LCBleHAsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24oYWN0LCBtc2cpLnRvLm5vdC5lcWwoZXhwKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc1RydWUodmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgaXMgdHJ1ZS5cbiAgICpcbiAgICogICAgIHZhciB0ZWFTZXJ2ZWQgPSB0cnVlO1xuICAgKiAgICAgYXNzZXJ0LmlzVHJ1ZSh0ZWFTZXJ2ZWQsICd0aGUgdGVhIGhhcyBiZWVuIHNlcnZlZCcpO1xuICAgKlxuICAgKiBAbmFtZSBpc1RydWVcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmlzVHJ1ZSA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLmlzWyd0cnVlJ107XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNGYWxzZSh2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBmYWxzZS5cbiAgICpcbiAgICogICAgIHZhciB0ZWFTZXJ2ZWQgPSBmYWxzZTtcbiAgICogICAgIGFzc2VydC5pc0ZhbHNlKHRlYVNlcnZlZCwgJ25vIHRlYSB5ZXQ/IGhtbS4uLicpO1xuICAgKlxuICAgKiBAbmFtZSBpc0ZhbHNlXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pc0ZhbHNlID0gZnVuY3Rpb24gKHZhbCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykuaXNbJ2ZhbHNlJ107XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNOdWxsKHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgIGlzIG51bGwuXG4gICAqXG4gICAqICAgICBhc3NlcnQuaXNOdWxsKGVyciwgJ3RoZXJlIHdhcyBubyBlcnJvcicpO1xuICAgKlxuICAgKiBAbmFtZSBpc051bGxcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmlzTnVsbCA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLmVxdWFsKG51bGwpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmlzTm90TnVsbCh2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBub3QgbnVsbC5cbiAgICpcbiAgICogICAgIHZhciB0ZWEgPSAndGFzdHkgY2hhaSc7XG4gICAqICAgICBhc3NlcnQuaXNOb3ROdWxsKHRlYSwgJ2dyZWF0LCB0aW1lIGZvciB0ZWEhJyk7XG4gICAqXG4gICAqIEBuYW1lIGlzTm90TnVsbFxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNOb3ROdWxsID0gZnVuY3Rpb24gKHZhbCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykudG8ubm90LmVxdWFsKG51bGwpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmlzVW5kZWZpbmVkKHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgIGlzIGB1bmRlZmluZWRgLlxuICAgKlxuICAgKiAgICAgdmFyIHRlYTtcbiAgICogICAgIGFzc2VydC5pc1VuZGVmaW5lZCh0ZWEsICdubyB0ZWEgZGVmaW5lZCcpO1xuICAgKlxuICAgKiBAbmFtZSBpc1VuZGVmaW5lZFxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNVbmRlZmluZWQgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5lcXVhbCh1bmRlZmluZWQpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmlzRGVmaW5lZCh2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBub3QgYHVuZGVmaW5lZGAuXG4gICAqXG4gICAqICAgICB2YXIgdGVhID0gJ2N1cCBvZiBjaGFpJztcbiAgICogICAgIGFzc2VydC5pc0RlZmluZWQodGVhLCAndGVhIGhhcyBiZWVuIGRlZmluZWQnKTtcbiAgICpcbiAgICogQG5hbWUgaXNEZWZpbmVkXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pc0RlZmluZWQgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5ub3QuZXF1YWwodW5kZWZpbmVkKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc0Z1bmN0aW9uKHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgIGlzIGEgZnVuY3Rpb24uXG4gICAqXG4gICAqICAgICBmdW5jdGlvbiBzZXJ2ZVRlYSgpIHsgcmV0dXJuICdjdXAgb2YgdGVhJzsgfTtcbiAgICogICAgIGFzc2VydC5pc0Z1bmN0aW9uKHNlcnZlVGVhLCAnZ3JlYXQsIHdlIGNhbiBoYXZlIHRlYSBub3cnKTtcbiAgICpcbiAgICogQG5hbWUgaXNGdW5jdGlvblxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNGdW5jdGlvbiA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLmJlLmEoJ2Z1bmN0aW9uJyk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNOb3RGdW5jdGlvbih2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBfbm90XyBhIGZ1bmN0aW9uLlxuICAgKlxuICAgKiAgICAgdmFyIHNlcnZlVGVhID0gWyAnaGVhdCcsICdwb3VyJywgJ3NpcCcgXTtcbiAgICogICAgIGFzc2VydC5pc05vdEZ1bmN0aW9uKHNlcnZlVGVhLCAnZ3JlYXQsIHdlIGhhdmUgbGlzdGVkIHRoZSBzdGVwcycpO1xuICAgKlxuICAgKiBAbmFtZSBpc05vdEZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pc05vdEZ1bmN0aW9uID0gZnVuY3Rpb24gKHZhbCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykudG8ubm90LmJlLmEoJ2Z1bmN0aW9uJyk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNPYmplY3QodmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgaXMgYW4gb2JqZWN0IChhcyByZXZlYWxlZCBieVxuICAgKiBgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ2ApLlxuICAgKlxuICAgKiAgICAgdmFyIHNlbGVjdGlvbiA9IHsgbmFtZTogJ0NoYWknLCBzZXJ2ZTogJ3dpdGggc3BpY2VzJyB9O1xuICAgKiAgICAgYXNzZXJ0LmlzT2JqZWN0KHNlbGVjdGlvbiwgJ3RlYSBzZWxlY3Rpb24gaXMgYW4gb2JqZWN0Jyk7XG4gICAqXG4gICAqIEBuYW1lIGlzT2JqZWN0XG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pc09iamVjdCA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLmJlLmEoJ29iamVjdCcpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmlzTm90T2JqZWN0KHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgIGlzIF9ub3RfIGFuIG9iamVjdC5cbiAgICpcbiAgICogICAgIHZhciBzZWxlY3Rpb24gPSAnY2hhaSdcbiAgICogICAgIGFzc2VydC5pc05vdE9iamVjdChzZWxlY3Rpb24sICd0ZWEgc2VsZWN0aW9uIGlzIG5vdCBhbiBvYmplY3QnKTtcbiAgICogICAgIGFzc2VydC5pc05vdE9iamVjdChudWxsLCAnbnVsbCBpcyBub3QgYW4gb2JqZWN0Jyk7XG4gICAqXG4gICAqIEBuYW1lIGlzTm90T2JqZWN0XG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pc05vdE9iamVjdCA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLm5vdC5iZS5hKCdvYmplY3QnKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc0FycmF5KHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgIGlzIGFuIGFycmF5LlxuICAgKlxuICAgKiAgICAgdmFyIG1lbnUgPSBbICdncmVlbicsICdjaGFpJywgJ29vbG9uZycgXTtcbiAgICogICAgIGFzc2VydC5pc0FycmF5KG1lbnUsICd3aGF0IGtpbmQgb2YgdGVhIGRvIHdlIHdhbnQ/Jyk7XG4gICAqXG4gICAqIEBuYW1lIGlzQXJyYXlcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmlzQXJyYXkgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5iZS5hbignYXJyYXknKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc05vdEFycmF5KHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgIGlzIF9ub3RfIGFuIGFycmF5LlxuICAgKlxuICAgKiAgICAgdmFyIG1lbnUgPSAnZ3JlZW58Y2hhaXxvb2xvbmcnO1xuICAgKiAgICAgYXNzZXJ0LmlzTm90QXJyYXkobWVudSwgJ3doYXQga2luZCBvZiB0ZWEgZG8gd2Ugd2FudD8nKTtcbiAgICpcbiAgICogQG5hbWUgaXNOb3RBcnJheVxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNOb3RBcnJheSA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLm5vdC5iZS5hbignYXJyYXknKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc1N0cmluZyh2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBhIHN0cmluZy5cbiAgICpcbiAgICogICAgIHZhciB0ZWFPcmRlciA9ICdjaGFpJztcbiAgICogICAgIGFzc2VydC5pc1N0cmluZyh0ZWFPcmRlciwgJ29yZGVyIHBsYWNlZCcpO1xuICAgKlxuICAgKiBAbmFtZSBpc1N0cmluZ1xuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNTdHJpbmcgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5iZS5hKCdzdHJpbmcnKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc05vdFN0cmluZyh2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBfbm90XyBhIHN0cmluZy5cbiAgICpcbiAgICogICAgIHZhciB0ZWFPcmRlciA9IDQ7XG4gICAqICAgICBhc3NlcnQuaXNOb3RTdHJpbmcodGVhT3JkZXIsICdvcmRlciBwbGFjZWQnKTtcbiAgICpcbiAgICogQG5hbWUgaXNOb3RTdHJpbmdcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmlzTm90U3RyaW5nID0gZnVuY3Rpb24gKHZhbCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykudG8ubm90LmJlLmEoJ3N0cmluZycpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmlzTnVtYmVyKHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgIGlzIGEgbnVtYmVyLlxuICAgKlxuICAgKiAgICAgdmFyIGN1cHMgPSAyO1xuICAgKiAgICAgYXNzZXJ0LmlzTnVtYmVyKGN1cHMsICdob3cgbWFueSBjdXBzJyk7XG4gICAqXG4gICAqIEBuYW1lIGlzTnVtYmVyXG4gICAqIEBwYXJhbSB7TnVtYmVyfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNOdW1iZXIgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5iZS5hKCdudW1iZXInKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc05vdE51bWJlcih2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBfbm90XyBhIG51bWJlci5cbiAgICpcbiAgICogICAgIHZhciBjdXBzID0gJzIgY3VwcyBwbGVhc2UnO1xuICAgKiAgICAgYXNzZXJ0LmlzTm90TnVtYmVyKGN1cHMsICdob3cgbWFueSBjdXBzJyk7XG4gICAqXG4gICAqIEBuYW1lIGlzTm90TnVtYmVyXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pc05vdE51bWJlciA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLm5vdC5iZS5hKCdudW1iZXInKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc0Jvb2xlYW4odmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgaXMgYSBib29sZWFuLlxuICAgKlxuICAgKiAgICAgdmFyIHRlYVJlYWR5ID0gdHJ1ZVxuICAgKiAgICAgICAsIHRlYVNlcnZlZCA9IGZhbHNlO1xuICAgKlxuICAgKiAgICAgYXNzZXJ0LmlzQm9vbGVhbih0ZWFSZWFkeSwgJ2lzIHRoZSB0ZWEgcmVhZHknKTtcbiAgICogICAgIGFzc2VydC5pc0Jvb2xlYW4odGVhU2VydmVkLCAnaGFzIHRlYSBiZWVuIHNlcnZlZCcpO1xuICAgKlxuICAgKiBAbmFtZSBpc0Jvb2xlYW5cbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmlzQm9vbGVhbiA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLmJlLmEoJ2Jvb2xlYW4nKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc05vdEJvb2xlYW4odmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgaXMgX25vdF8gYSBib29sZWFuLlxuICAgKlxuICAgKiAgICAgdmFyIHRlYVJlYWR5ID0gJ3llcCdcbiAgICogICAgICAgLCB0ZWFTZXJ2ZWQgPSAnbm9wZSc7XG4gICAqXG4gICAqICAgICBhc3NlcnQuaXNOb3RCb29sZWFuKHRlYVJlYWR5LCAnaXMgdGhlIHRlYSByZWFkeScpO1xuICAgKiAgICAgYXNzZXJ0LmlzTm90Qm9vbGVhbih0ZWFTZXJ2ZWQsICdoYXMgdGVhIGJlZW4gc2VydmVkJyk7XG4gICAqXG4gICAqIEBuYW1lIGlzTm90Qm9vbGVhblxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNOb3RCb29sZWFuID0gZnVuY3Rpb24gKHZhbCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykudG8ubm90LmJlLmEoJ2Jvb2xlYW4nKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC50eXBlT2YodmFsdWUsIG5hbWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAncyB0eXBlIGlzIGBuYW1lYCwgYXMgZGV0ZXJtaW5lZCBieVxuICAgKiBgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ2AuXG4gICAqXG4gICAqICAgICBhc3NlcnQudHlwZU9mKHsgdGVhOiAnY2hhaScgfSwgJ29iamVjdCcsICd3ZSBoYXZlIGFuIG9iamVjdCcpO1xuICAgKiAgICAgYXNzZXJ0LnR5cGVPZihbJ2NoYWknLCAnamFzbWluZSddLCAnYXJyYXknLCAnd2UgaGF2ZSBhbiBhcnJheScpO1xuICAgKiAgICAgYXNzZXJ0LnR5cGVPZigndGVhJywgJ3N0cmluZycsICd3ZSBoYXZlIGEgc3RyaW5nJyk7XG4gICAqICAgICBhc3NlcnQudHlwZU9mKC90ZWEvLCAncmVnZXhwJywgJ3dlIGhhdmUgYSByZWd1bGFyIGV4cHJlc3Npb24nKTtcbiAgICogICAgIGFzc2VydC50eXBlT2YobnVsbCwgJ251bGwnLCAnd2UgaGF2ZSBhIG51bGwnKTtcbiAgICogICAgIGFzc2VydC50eXBlT2YodW5kZWZpbmVkLCAndW5kZWZpbmVkJywgJ3dlIGhhdmUgYW4gdW5kZWZpbmVkJyk7XG4gICAqXG4gICAqIEBuYW1lIHR5cGVPZlxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQudHlwZU9mID0gZnVuY3Rpb24gKHZhbCwgdHlwZSwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykudG8uYmUuYSh0eXBlKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5ub3RUeXBlT2YodmFsdWUsIG5hbWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAncyB0eXBlIGlzIF9ub3RfIGBuYW1lYCwgYXMgZGV0ZXJtaW5lZCBieVxuICAgKiBgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ2AuXG4gICAqXG4gICAqICAgICBhc3NlcnQubm90VHlwZU9mKCd0ZWEnLCAnbnVtYmVyJywgJ3N0cmluZ3MgYXJlIG5vdCBudW1iZXJzJyk7XG4gICAqXG4gICAqIEBuYW1lIG5vdFR5cGVPZlxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gdHlwZW9mIG5hbWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0Lm5vdFR5cGVPZiA9IGZ1bmN0aW9uICh2YWwsIHR5cGUsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLm5vdC5iZS5hKHR5cGUpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmluc3RhbmNlT2Yob2JqZWN0LCBjb25zdHJ1Y3RvciwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBhbiBpbnN0YW5jZSBvZiBgY29uc3RydWN0b3JgLlxuICAgKlxuICAgKiAgICAgdmFyIFRlYSA9IGZ1bmN0aW9uIChuYW1lKSB7IHRoaXMubmFtZSA9IG5hbWU7IH1cbiAgICogICAgICAgLCBjaGFpID0gbmV3IFRlYSgnY2hhaScpO1xuICAgKlxuICAgKiAgICAgYXNzZXJ0Lmluc3RhbmNlT2YoY2hhaSwgVGVhLCAnY2hhaSBpcyBhbiBpbnN0YW5jZSBvZiB0ZWEnKTtcbiAgICpcbiAgICogQG5hbWUgaW5zdGFuY2VPZlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gICAqIEBwYXJhbSB7Q29uc3RydWN0b3J9IGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pbnN0YW5jZU9mID0gZnVuY3Rpb24gKHZhbCwgdHlwZSwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykudG8uYmUuaW5zdGFuY2VPZih0eXBlKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5ub3RJbnN0YW5jZU9mKG9iamVjdCwgY29uc3RydWN0b3IsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyBgdmFsdWVgIGlzIG5vdCBhbiBpbnN0YW5jZSBvZiBgY29uc3RydWN0b3JgLlxuICAgKlxuICAgKiAgICAgdmFyIFRlYSA9IGZ1bmN0aW9uIChuYW1lKSB7IHRoaXMubmFtZSA9IG5hbWU7IH1cbiAgICogICAgICAgLCBjaGFpID0gbmV3IFN0cmluZygnY2hhaScpO1xuICAgKlxuICAgKiAgICAgYXNzZXJ0Lm5vdEluc3RhbmNlT2YoY2hhaSwgVGVhLCAnY2hhaSBpcyBub3QgYW4gaW5zdGFuY2Ugb2YgdGVhJyk7XG4gICAqXG4gICAqIEBuYW1lIG5vdEluc3RhbmNlT2ZcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICAgKiBAcGFyYW0ge0NvbnN0cnVjdG9yfSBjb25zdHJ1Y3RvclxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQubm90SW5zdGFuY2VPZiA9IGZ1bmN0aW9uICh2YWwsIHR5cGUsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLm5vdC5iZS5pbnN0YW5jZU9mKHR5cGUpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmluY2x1ZGUoaGF5c3RhY2ssIG5lZWRsZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYGhheXN0YWNrYCBpbmNsdWRlcyBgbmVlZGxlYC4gV29ya3NcbiAgICogZm9yIHN0cmluZ3MgYW5kIGFycmF5cy5cbiAgICpcbiAgICogICAgIGFzc2VydC5pbmNsdWRlKCdmb29iYXInLCAnYmFyJywgJ2Zvb2JhciBjb250YWlucyBzdHJpbmcgXCJiYXJcIicpO1xuICAgKiAgICAgYXNzZXJ0LmluY2x1ZGUoWyAxLCAyLCAzIF0sIDMsICdhcnJheSBjb250YWlucyB2YWx1ZScpO1xuICAgKlxuICAgKiBAbmFtZSBpbmNsdWRlXG4gICAqIEBwYXJhbSB7QXJyYXl8U3RyaW5nfSBoYXlzdGFja1xuICAgKiBAcGFyYW0ge01peGVkfSBuZWVkbGVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmluY2x1ZGUgPSBmdW5jdGlvbiAoZXhwLCBpbmMsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24oZXhwLCBtc2csIGFzc2VydC5pbmNsdWRlKS5pbmNsdWRlKGluYyk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAubm90SW5jbHVkZShoYXlzdGFjaywgbmVlZGxlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgaGF5c3RhY2tgIGRvZXMgbm90IGluY2x1ZGUgYG5lZWRsZWAuIFdvcmtzXG4gICAqIGZvciBzdHJpbmdzIGFuZCBhcnJheXMuXG4gICAqaVxuICAgKiAgICAgYXNzZXJ0Lm5vdEluY2x1ZGUoJ2Zvb2JhcicsICdiYXonLCAnc3RyaW5nIG5vdCBpbmNsdWRlIHN1YnN0cmluZycpO1xuICAgKiAgICAgYXNzZXJ0Lm5vdEluY2x1ZGUoWyAxLCAyLCAzIF0sIDQsICdhcnJheSBub3QgaW5jbHVkZSBjb250YWluIHZhbHVlJyk7XG4gICAqXG4gICAqIEBuYW1lIG5vdEluY2x1ZGVcbiAgICogQHBhcmFtIHtBcnJheXxTdHJpbmd9IGhheXN0YWNrXG4gICAqIEBwYXJhbSB7TWl4ZWR9IG5lZWRsZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQubm90SW5jbHVkZSA9IGZ1bmN0aW9uIChleHAsIGluYywgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbihleHAsIG1zZywgYXNzZXJ0Lm5vdEluY2x1ZGUpLm5vdC5pbmNsdWRlKGluYyk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAubWF0Y2godmFsdWUsIHJlZ2V4cCwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBtYXRjaGVzIHRoZSByZWd1bGFyIGV4cHJlc3Npb24gYHJlZ2V4cGAuXG4gICAqXG4gICAqICAgICBhc3NlcnQubWF0Y2goJ2Zvb2JhcicsIC9eZm9vLywgJ3JlZ2V4cCBtYXRjaGVzJyk7XG4gICAqXG4gICAqIEBuYW1lIG1hdGNoXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7UmVnRXhwfSByZWdleHBcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0Lm1hdGNoID0gZnVuY3Rpb24gKGV4cCwgcmUsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24oZXhwLCBtc2cpLnRvLm1hdGNoKHJlKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5ub3RNYXRjaCh2YWx1ZSwgcmVnZXhwLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgIGRvZXMgbm90IG1hdGNoIHRoZSByZWd1bGFyIGV4cHJlc3Npb24gYHJlZ2V4cGAuXG4gICAqXG4gICAqICAgICBhc3NlcnQubm90TWF0Y2goJ2Zvb2JhcicsIC9eZm9vLywgJ3JlZ2V4cCBkb2VzIG5vdCBtYXRjaCcpO1xuICAgKlxuICAgKiBAbmFtZSBub3RNYXRjaFxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1JlZ0V4cH0gcmVnZXhwXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5ub3RNYXRjaCA9IGZ1bmN0aW9uIChleHAsIHJlLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKGV4cCwgbXNnKS50by5ub3QubWF0Y2gocmUpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLnByb3BlcnR5KG9iamVjdCwgcHJvcGVydHksIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBvYmplY3RgIGhhcyBhIHByb3BlcnR5IG5hbWVkIGJ5IGBwcm9wZXJ0eWAuXG4gICAqXG4gICAqICAgICBhc3NlcnQucHJvcGVydHkoeyB0ZWE6IHsgZ3JlZW46ICdtYXRjaGEnIH19LCAndGVhJyk7XG4gICAqXG4gICAqIEBuYW1lIHByb3BlcnR5XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3RcbiAgICogQHBhcmFtIHtTdHJpbmd9IHByb3BlcnR5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5wcm9wZXJ0eSA9IGZ1bmN0aW9uIChvYmosIHByb3AsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24ob2JqLCBtc2cpLnRvLmhhdmUucHJvcGVydHkocHJvcCk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAubm90UHJvcGVydHkob2JqZWN0LCBwcm9wZXJ0eSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYG9iamVjdGAgZG9lcyBfbm90XyBoYXZlIGEgcHJvcGVydHkgbmFtZWQgYnkgYHByb3BlcnR5YC5cbiAgICpcbiAgICogICAgIGFzc2VydC5ub3RQcm9wZXJ0eSh7IHRlYTogeyBncmVlbjogJ21hdGNoYScgfX0sICdjb2ZmZWUnKTtcbiAgICpcbiAgICogQG5hbWUgbm90UHJvcGVydHlcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICAgKiBAcGFyYW0ge1N0cmluZ30gcHJvcGVydHlcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0Lm5vdFByb3BlcnR5ID0gZnVuY3Rpb24gKG9iaiwgcHJvcCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykudG8ubm90LmhhdmUucHJvcGVydHkocHJvcCk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuZGVlcFByb3BlcnR5KG9iamVjdCwgcHJvcGVydHksIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBvYmplY3RgIGhhcyBhIHByb3BlcnR5IG5hbWVkIGJ5IGBwcm9wZXJ0eWAsIHdoaWNoIGNhbiBiZSBhXG4gICAqIHN0cmluZyB1c2luZyBkb3QtIGFuZCBicmFja2V0LW5vdGF0aW9uIGZvciBkZWVwIHJlZmVyZW5jZS5cbiAgICpcbiAgICogICAgIGFzc2VydC5kZWVwUHJvcGVydHkoeyB0ZWE6IHsgZ3JlZW46ICdtYXRjaGEnIH19LCAndGVhLmdyZWVuJyk7XG4gICAqXG4gICAqIEBuYW1lIGRlZXBQcm9wZXJ0eVxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwcm9wZXJ0eVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuZGVlcFByb3BlcnR5ID0gZnVuY3Rpb24gKG9iaiwgcHJvcCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykudG8uaGF2ZS5kZWVwLnByb3BlcnR5KHByb3ApO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLm5vdERlZXBQcm9wZXJ0eShvYmplY3QsIHByb3BlcnR5LCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgb2JqZWN0YCBkb2VzIF9ub3RfIGhhdmUgYSBwcm9wZXJ0eSBuYW1lZCBieSBgcHJvcGVydHlgLCB3aGljaFxuICAgKiBjYW4gYmUgYSBzdHJpbmcgdXNpbmcgZG90LSBhbmQgYnJhY2tldC1ub3RhdGlvbiBmb3IgZGVlcCByZWZlcmVuY2UuXG4gICAqXG4gICAqICAgICBhc3NlcnQubm90RGVlcFByb3BlcnR5KHsgdGVhOiB7IGdyZWVuOiAnbWF0Y2hhJyB9fSwgJ3RlYS5vb2xvbmcnKTtcbiAgICpcbiAgICogQG5hbWUgbm90RGVlcFByb3BlcnR5XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3RcbiAgICogQHBhcmFtIHtTdHJpbmd9IHByb3BlcnR5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5ub3REZWVwUHJvcGVydHkgPSBmdW5jdGlvbiAob2JqLCBwcm9wLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKG9iaiwgbXNnKS50by5ub3QuaGF2ZS5kZWVwLnByb3BlcnR5KHByb3ApO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLnByb3BlcnR5VmFsKG9iamVjdCwgcHJvcGVydHksIHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgb2JqZWN0YCBoYXMgYSBwcm9wZXJ0eSBuYW1lZCBieSBgcHJvcGVydHlgIHdpdGggdmFsdWUgZ2l2ZW5cbiAgICogYnkgYHZhbHVlYC5cbiAgICpcbiAgICogICAgIGFzc2VydC5wcm9wZXJ0eVZhbCh7IHRlYTogJ2lzIGdvb2QnIH0sICd0ZWEnLCAnaXMgZ29vZCcpO1xuICAgKlxuICAgKiBAbmFtZSBwcm9wZXJ0eVZhbFxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwcm9wZXJ0eVxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQucHJvcGVydHlWYWwgPSBmdW5jdGlvbiAob2JqLCBwcm9wLCB2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24ob2JqLCBtc2cpLnRvLmhhdmUucHJvcGVydHkocHJvcCwgdmFsKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5wcm9wZXJ0eU5vdFZhbChvYmplY3QsIHByb3BlcnR5LCB2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYG9iamVjdGAgaGFzIGEgcHJvcGVydHkgbmFtZWQgYnkgYHByb3BlcnR5YCwgYnV0IHdpdGggYSB2YWx1ZVxuICAgKiBkaWZmZXJlbnQgZnJvbSB0aGF0IGdpdmVuIGJ5IGB2YWx1ZWAuXG4gICAqXG4gICAqICAgICBhc3NlcnQucHJvcGVydHlOb3RWYWwoeyB0ZWE6ICdpcyBnb29kJyB9LCAndGVhJywgJ2lzIGJhZCcpO1xuICAgKlxuICAgKiBAbmFtZSBwcm9wZXJ0eU5vdFZhbFxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwcm9wZXJ0eVxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQucHJvcGVydHlOb3RWYWwgPSBmdW5jdGlvbiAob2JqLCBwcm9wLCB2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24ob2JqLCBtc2cpLnRvLm5vdC5oYXZlLnByb3BlcnR5KHByb3AsIHZhbCk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuZGVlcFByb3BlcnR5VmFsKG9iamVjdCwgcHJvcGVydHksIHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgb2JqZWN0YCBoYXMgYSBwcm9wZXJ0eSBuYW1lZCBieSBgcHJvcGVydHlgIHdpdGggdmFsdWUgZ2l2ZW5cbiAgICogYnkgYHZhbHVlYC4gYHByb3BlcnR5YCBjYW4gdXNlIGRvdC0gYW5kIGJyYWNrZXQtbm90YXRpb24gZm9yIGRlZXBcbiAgICogcmVmZXJlbmNlLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LmRlZXBQcm9wZXJ0eVZhbCh7IHRlYTogeyBncmVlbjogJ21hdGNoYScgfX0sICd0ZWEuZ3JlZW4nLCAnbWF0Y2hhJyk7XG4gICAqXG4gICAqIEBuYW1lIGRlZXBQcm9wZXJ0eVZhbFxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwcm9wZXJ0eVxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuZGVlcFByb3BlcnR5VmFsID0gZnVuY3Rpb24gKG9iaiwgcHJvcCwgdmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKG9iaiwgbXNnKS50by5oYXZlLmRlZXAucHJvcGVydHkocHJvcCwgdmFsKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5kZWVwUHJvcGVydHlOb3RWYWwob2JqZWN0LCBwcm9wZXJ0eSwgdmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBvYmplY3RgIGhhcyBhIHByb3BlcnR5IG5hbWVkIGJ5IGBwcm9wZXJ0eWAsIGJ1dCB3aXRoIGEgdmFsdWVcbiAgICogZGlmZmVyZW50IGZyb20gdGhhdCBnaXZlbiBieSBgdmFsdWVgLiBgcHJvcGVydHlgIGNhbiB1c2UgZG90LSBhbmRcbiAgICogYnJhY2tldC1ub3RhdGlvbiBmb3IgZGVlcCByZWZlcmVuY2UuXG4gICAqXG4gICAqICAgICBhc3NlcnQuZGVlcFByb3BlcnR5Tm90VmFsKHsgdGVhOiB7IGdyZWVuOiAnbWF0Y2hhJyB9fSwgJ3RlYS5ncmVlbicsICdrb25hY2hhJyk7XG4gICAqXG4gICAqIEBuYW1lIGRlZXBQcm9wZXJ0eU5vdFZhbFxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwcm9wZXJ0eVxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuZGVlcFByb3BlcnR5Tm90VmFsID0gZnVuY3Rpb24gKG9iaiwgcHJvcCwgdmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKG9iaiwgbXNnKS50by5ub3QuaGF2ZS5kZWVwLnByb3BlcnR5KHByb3AsIHZhbCk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAubGVuZ3RoT2Yob2JqZWN0LCBsZW5ndGgsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBvYmplY3RgIGhhcyBhIGBsZW5ndGhgIHByb3BlcnR5IHdpdGggdGhlIGV4cGVjdGVkIHZhbHVlLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0Lmxlbmd0aE9mKFsxLDIsM10sIDMsICdhcnJheSBoYXMgbGVuZ3RoIG9mIDMnKTtcbiAgICogICAgIGFzc2VydC5sZW5ndGhPZignZm9vYmFyJywgNSwgJ3N0cmluZyBoYXMgbGVuZ3RoIG9mIDYnKTtcbiAgICpcbiAgICogQG5hbWUgbGVuZ3RoT2ZcbiAgICogQHBhcmFtIHtNaXhlZH0gb2JqZWN0XG4gICAqIEBwYXJhbSB7TnVtYmVyfSBsZW5ndGhcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0Lmxlbmd0aE9mID0gZnVuY3Rpb24gKGV4cCwgbGVuLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKGV4cCwgbXNnKS50by5oYXZlLmxlbmd0aChsZW4pO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLnRocm93cyhmdW5jdGlvbiwgW2NvbnN0cnVjdG9yL3N0cmluZy9yZWdleHBdLCBbc3RyaW5nL3JlZ2V4cF0sIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBmdW5jdGlvbmAgd2lsbCB0aHJvdyBhbiBlcnJvciB0aGF0IGlzIGFuIGluc3RhbmNlIG9mXG4gICAqIGBjb25zdHJ1Y3RvcmAsIG9yIGFsdGVybmF0ZWx5IHRoYXQgaXQgd2lsbCB0aHJvdyBhbiBlcnJvciB3aXRoIG1lc3NhZ2VcbiAgICogbWF0Y2hpbmcgYHJlZ2V4cGAuXG4gICAqXG4gICAqICAgICBhc3NlcnQudGhyb3coZm4sICdmdW5jdGlvbiB0aHJvd3MgYSByZWZlcmVuY2UgZXJyb3InKTtcbiAgICogICAgIGFzc2VydC50aHJvdyhmbiwgL2Z1bmN0aW9uIHRocm93cyBhIHJlZmVyZW5jZSBlcnJvci8pO1xuICAgKiAgICAgYXNzZXJ0LnRocm93KGZuLCBSZWZlcmVuY2VFcnJvcik7XG4gICAqICAgICBhc3NlcnQudGhyb3coZm4sIFJlZmVyZW5jZUVycm9yLCAnZnVuY3Rpb24gdGhyb3dzIGEgcmVmZXJlbmNlIGVycm9yJyk7XG4gICAqICAgICBhc3NlcnQudGhyb3coZm4sIFJlZmVyZW5jZUVycm9yLCAvZnVuY3Rpb24gdGhyb3dzIGEgcmVmZXJlbmNlIGVycm9yLyk7XG4gICAqXG4gICAqIEBuYW1lIHRocm93c1xuICAgKiBAYWxpYXMgdGhyb3dcbiAgICogQGFsaWFzIFRocm93XG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7RXJyb3JDb25zdHJ1Y3Rvcn0gY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtSZWdFeHB9IHJlZ2V4cFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAc2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL0Vycm9yI0Vycm9yX3R5cGVzXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5UaHJvdyA9IGZ1bmN0aW9uIChmbiwgZXJydCwgZXJycywgbXNnKSB7XG4gICAgaWYgKCdzdHJpbmcnID09PSB0eXBlb2YgZXJydCB8fCBlcnJ0IGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgICBlcnJzID0gZXJydDtcbiAgICAgIGVycnQgPSBudWxsO1xuICAgIH1cblxuICAgIHZhciBhc3NlcnRFcnIgPSBuZXcgQXNzZXJ0aW9uKGZuLCBtc2cpLnRvLlRocm93KGVycnQsIGVycnMpO1xuICAgIHJldHVybiBmbGFnKGFzc2VydEVyciwgJ29iamVjdCcpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmRvZXNOb3RUaHJvdyhmdW5jdGlvbiwgW2NvbnN0cnVjdG9yL3JlZ2V4cF0sIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBmdW5jdGlvbmAgd2lsbCBfbm90XyB0aHJvdyBhbiBlcnJvciB0aGF0IGlzIGFuIGluc3RhbmNlIG9mXG4gICAqIGBjb25zdHJ1Y3RvcmAsIG9yIGFsdGVybmF0ZWx5IHRoYXQgaXQgd2lsbCBub3QgdGhyb3cgYW4gZXJyb3Igd2l0aCBtZXNzYWdlXG4gICAqIG1hdGNoaW5nIGByZWdleHBgLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LmRvZXNOb3RUaHJvdyhmbiwgRXJyb3IsICdmdW5jdGlvbiBkb2VzIG5vdCB0aHJvdycpO1xuICAgKlxuICAgKiBAbmFtZSBkb2VzTm90VGhyb3dcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuY3Rpb25cbiAgICogQHBhcmFtIHtFcnJvckNvbnN0cnVjdG9yfSBjb25zdHJ1Y3RvclxuICAgKiBAcGFyYW0ge1JlZ0V4cH0gcmVnZXhwXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBzZWUgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4vSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvRXJyb3IjRXJyb3JfdHlwZXNcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmRvZXNOb3RUaHJvdyA9IGZ1bmN0aW9uIChmbiwgdHlwZSwgbXNnKSB7XG4gICAgaWYgKCdzdHJpbmcnID09PSB0eXBlb2YgdHlwZSkge1xuICAgICAgbXNnID0gdHlwZTtcbiAgICAgIHR5cGUgPSBudWxsO1xuICAgIH1cblxuICAgIG5ldyBBc3NlcnRpb24oZm4sIG1zZykudG8ubm90LlRocm93KHR5cGUpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLm9wZXJhdG9yKHZhbDEsIG9wZXJhdG9yLCB2YWwyLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIENvbXBhcmVzIHR3byB2YWx1ZXMgdXNpbmcgYG9wZXJhdG9yYC5cbiAgICpcbiAgICogICAgIGFzc2VydC5vcGVyYXRvcigxLCAnPCcsIDIsICdldmVyeXRoaW5nIGlzIG9rJyk7XG4gICAqICAgICBhc3NlcnQub3BlcmF0b3IoMSwgJz4nLCAyLCAndGhpcyB3aWxsIGZhaWwnKTtcbiAgICpcbiAgICogQG5hbWUgb3BlcmF0b3JcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsMVxuICAgKiBAcGFyYW0ge1N0cmluZ30gb3BlcmF0b3JcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsMlxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQub3BlcmF0b3IgPSBmdW5jdGlvbiAodmFsLCBvcGVyYXRvciwgdmFsMiwgbXNnKSB7XG4gICAgaWYgKCF+Wyc9PScsICc9PT0nLCAnPicsICc+PScsICc8JywgJzw9JywgJyE9JywgJyE9PSddLmluZGV4T2Yob3BlcmF0b3IpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgb3BlcmF0b3IgXCInICsgb3BlcmF0b3IgKyAnXCInKTtcbiAgICB9XG4gICAgdmFyIHRlc3QgPSBuZXcgQXNzZXJ0aW9uKGV2YWwodmFsICsgb3BlcmF0b3IgKyB2YWwyKSwgbXNnKTtcbiAgICB0ZXN0LmFzc2VydChcbiAgICAgICAgdHJ1ZSA9PT0gZmxhZyh0ZXN0LCAnb2JqZWN0JylcbiAgICAgICwgJ2V4cGVjdGVkICcgKyB1dGlsLmluc3BlY3QodmFsKSArICcgdG8gYmUgJyArIG9wZXJhdG9yICsgJyAnICsgdXRpbC5pbnNwZWN0KHZhbDIpXG4gICAgICAsICdleHBlY3RlZCAnICsgdXRpbC5pbnNwZWN0KHZhbCkgKyAnIHRvIG5vdCBiZSAnICsgb3BlcmF0b3IgKyAnICcgKyB1dGlsLmluc3BlY3QodmFsMikgKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5jbG9zZVRvKGFjdHVhbCwgZXhwZWN0ZWQsIGRlbHRhLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGlzIGVxdWFsIGBleHBlY3RlZGAsIHRvIHdpdGhpbiBhICsvLSBgZGVsdGFgIHJhbmdlLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LmNsb3NlVG8oMS41LCAxLCAwLjUsICdudW1iZXJzIGFyZSBjbG9zZScpO1xuICAgKlxuICAgKiBAbmFtZSBjbG9zZVRvXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBhY3R1YWxcbiAgICogQHBhcmFtIHtOdW1iZXJ9IGV4cGVjdGVkXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuY2xvc2VUbyA9IGZ1bmN0aW9uIChhY3QsIGV4cCwgZGVsdGEsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24oYWN0LCBtc2cpLnRvLmJlLmNsb3NlVG8oZXhwLCBkZWx0YSk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuc2FtZU1lbWJlcnMoc2V0MSwgc2V0MiwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHNldDFgIGFuZCBgc2V0MmAgaGF2ZSB0aGUgc2FtZSBtZW1iZXJzLlxuICAgKiBPcmRlciBpcyBub3QgdGFrZW4gaW50byBhY2NvdW50LlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LnNhbWVNZW1iZXJzKFsgMSwgMiwgMyBdLCBbIDIsIDEsIDMgXSwgJ3NhbWUgbWVtYmVycycpO1xuICAgKlxuICAgKiBAbmFtZSBzYW1lTWVtYmVyc1xuICAgKiBAcGFyYW0ge0FycmF5fSBzdXBlcnNldFxuICAgKiBAcGFyYW0ge0FycmF5fSBzdWJzZXRcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LnNhbWVNZW1iZXJzID0gZnVuY3Rpb24gKHNldDEsIHNldDIsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24oc2V0MSwgbXNnKS50by5oYXZlLnNhbWUubWVtYmVycyhzZXQyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiAjIyMgLmluY2x1ZGVNZW1iZXJzKHN1cGVyc2V0LCBzdWJzZXQsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBzdWJzZXRgIGlzIGluY2x1ZGVkIGluIGBzdXBlcnNldGAuXG4gICAqIE9yZGVyIGlzIG5vdCB0YWtlbiBpbnRvIGFjY291bnQuXG4gICAqXG4gICAqICAgICBhc3NlcnQuaW5jbHVkZU1lbWJlcnMoWyAxLCAyLCAzIF0sIFsgMiwgMSBdLCAnaW5jbHVkZSBtZW1iZXJzJyk7XG4gICAqXG4gICAqIEBuYW1lIGluY2x1ZGVNZW1iZXJzXG4gICAqIEBwYXJhbSB7QXJyYXl9IHN1cGVyc2V0XG4gICAqIEBwYXJhbSB7QXJyYXl9IHN1YnNldFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaW5jbHVkZU1lbWJlcnMgPSBmdW5jdGlvbiAoc3VwZXJzZXQsIHN1YnNldCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbihzdXBlcnNldCwgbXNnKS50by5pbmNsdWRlLm1lbWJlcnMoc3Vic2V0KTtcbiAgfVxuXG4gIC8qIVxuICAgKiBVbmRvY3VtZW50ZWQgLyB1bnRlc3RlZFxuICAgKi9cblxuICBhc3NlcnQuaWZFcnJvciA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLm5vdC5iZS5vaztcbiAgfTtcblxuICAvKiFcbiAgICogQWxpYXNlcy5cbiAgICovXG5cbiAgKGZ1bmN0aW9uIGFsaWFzKG5hbWUsIGFzKXtcbiAgICBhc3NlcnRbYXNdID0gYXNzZXJ0W25hbWVdO1xuICAgIHJldHVybiBhbGlhcztcbiAgfSlcbiAgKCdUaHJvdycsICd0aHJvdycpXG4gICgnVGhyb3cnLCAndGhyb3dzJyk7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL2ludGVyZmFjZS9leHBlY3QuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogY2hhaVxuICogQ29weXJpZ2h0KGMpIDIwMTEtMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNoYWksIHV0aWwpIHtcbiAgY2hhaS5leHBlY3QgPSBmdW5jdGlvbiAodmFsLCBtZXNzYWdlKSB7XG4gICAgcmV0dXJuIG5ldyBjaGFpLkFzc2VydGlvbih2YWwsIG1lc3NhZ2UpO1xuICB9O1xufTtcblxuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL2ludGVyZmFjZS9zaG91bGQuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogY2hhaVxuICogQ29weXJpZ2h0KGMpIDIwMTEtMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNoYWksIHV0aWwpIHtcbiAgdmFyIEFzc2VydGlvbiA9IGNoYWkuQXNzZXJ0aW9uO1xuXG4gIGZ1bmN0aW9uIGxvYWRTaG91bGQgKCkge1xuICAgIC8vIGV4cGxpY2l0bHkgZGVmaW5lIHRoaXMgbWV0aG9kIGFzIGZ1bmN0aW9uIGFzIHRvIGhhdmUgaXQncyBuYW1lIHRvIGluY2x1ZGUgYXMgYHNzZmlgXG4gICAgZnVuY3Rpb24gc2hvdWxkR2V0dGVyKCkge1xuICAgICAgaWYgKHRoaXMgaW5zdGFuY2VvZiBTdHJpbmcgfHwgdGhpcyBpbnN0YW5jZW9mIE51bWJlcikge1xuICAgICAgICByZXR1cm4gbmV3IEFzc2VydGlvbih0aGlzLmNvbnN0cnVjdG9yKHRoaXMpLCBudWxsLCBzaG91bGRHZXR0ZXIpO1xuICAgICAgfSBlbHNlIGlmICh0aGlzIGluc3RhbmNlb2YgQm9vbGVhbikge1xuICAgICAgICByZXR1cm4gbmV3IEFzc2VydGlvbih0aGlzID09IHRydWUsIG51bGwsIHNob3VsZEdldHRlcik7XG4gICAgICB9XG4gICAgICByZXR1cm4gbmV3IEFzc2VydGlvbih0aGlzLCBudWxsLCBzaG91bGRHZXR0ZXIpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBzaG91bGRTZXR0ZXIodmFsdWUpIHtcbiAgICAgIC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vY2hhaWpzL2NoYWkvaXNzdWVzLzg2OiB0aGlzIG1ha2VzXG4gICAgICAvLyBgd2hhdGV2ZXIuc2hvdWxkID0gc29tZVZhbHVlYCBhY3R1YWxseSBzZXQgYHNvbWVWYWx1ZWAsIHdoaWNoIGlzXG4gICAgICAvLyBlc3BlY2lhbGx5IHVzZWZ1bCBmb3IgYGdsb2JhbC5zaG91bGQgPSByZXF1aXJlKCdjaGFpJykuc2hvdWxkKClgLlxuICAgICAgLy9cbiAgICAgIC8vIE5vdGUgdGhhdCB3ZSBoYXZlIHRvIHVzZSBbW0RlZmluZVByb3BlcnR5XV0gaW5zdGVhZCBvZiBbW1B1dF1dXG4gICAgICAvLyBzaW5jZSBvdGhlcndpc2Ugd2Ugd291bGQgdHJpZ2dlciB0aGlzIHZlcnkgc2V0dGVyIVxuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsICdzaG91bGQnLCB7XG4gICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZVxuICAgICAgfSk7XG4gICAgfVxuICAgIC8vIG1vZGlmeSBPYmplY3QucHJvdG90eXBlIHRvIGhhdmUgYHNob3VsZGBcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoT2JqZWN0LnByb3RvdHlwZSwgJ3Nob3VsZCcsIHtcbiAgICAgIHNldDogc2hvdWxkU2V0dGVyXG4gICAgICAsIGdldDogc2hvdWxkR2V0dGVyXG4gICAgICAsIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgIH0pO1xuXG4gICAgdmFyIHNob3VsZCA9IHt9O1xuXG4gICAgc2hvdWxkLmVxdWFsID0gZnVuY3Rpb24gKHZhbDEsIHZhbDIsIG1zZykge1xuICAgICAgbmV3IEFzc2VydGlvbih2YWwxLCBtc2cpLnRvLmVxdWFsKHZhbDIpO1xuICAgIH07XG5cbiAgICBzaG91bGQuVGhyb3cgPSBmdW5jdGlvbiAoZm4sIGVycnQsIGVycnMsIG1zZykge1xuICAgICAgbmV3IEFzc2VydGlvbihmbiwgbXNnKS50by5UaHJvdyhlcnJ0LCBlcnJzKTtcbiAgICB9O1xuXG4gICAgc2hvdWxkLmV4aXN0ID0gZnVuY3Rpb24gKHZhbCwgbXNnKSB7XG4gICAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5leGlzdDtcbiAgICB9XG5cbiAgICAvLyBuZWdhdGlvblxuICAgIHNob3VsZC5ub3QgPSB7fVxuXG4gICAgc2hvdWxkLm5vdC5lcXVhbCA9IGZ1bmN0aW9uICh2YWwxLCB2YWwyLCBtc2cpIHtcbiAgICAgIG5ldyBBc3NlcnRpb24odmFsMSwgbXNnKS50by5ub3QuZXF1YWwodmFsMik7XG4gICAgfTtcblxuICAgIHNob3VsZC5ub3QuVGhyb3cgPSBmdW5jdGlvbiAoZm4sIGVycnQsIGVycnMsIG1zZykge1xuICAgICAgbmV3IEFzc2VydGlvbihmbiwgbXNnKS50by5ub3QuVGhyb3coZXJydCwgZXJycyk7XG4gICAgfTtcblxuICAgIHNob3VsZC5ub3QuZXhpc3QgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLm5vdC5leGlzdDtcbiAgICB9XG5cbiAgICBzaG91bGRbJ3Rocm93J10gPSBzaG91bGRbJ1Rocm93J107XG4gICAgc2hvdWxkLm5vdFsndGhyb3cnXSA9IHNob3VsZC5ub3RbJ1Rocm93J107XG5cbiAgICByZXR1cm4gc2hvdWxkO1xuICB9O1xuXG4gIGNoYWkuc2hvdWxkID0gbG9hZFNob3VsZDtcbiAgY2hhaS5TaG91bGQgPSBsb2FkU2hvdWxkO1xufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS91dGlscy9hZGRDaGFpbmFibGVNZXRob2QuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogQ2hhaSAtIGFkZENoYWluaW5nTWV0aG9kIHV0aWxpdHlcbiAqIENvcHlyaWdodChjKSAyMDEyLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKiFcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgdHJhbnNmZXJGbGFncyA9IHJlcXVpcmUoJy4vdHJhbnNmZXJGbGFncycpO1xudmFyIGZsYWcgPSByZXF1aXJlKCcuL2ZsYWcnKTtcbnZhciBjb25maWcgPSByZXF1aXJlKCcuLi9jb25maWcnKTtcblxuLyohXG4gKiBNb2R1bGUgdmFyaWFibGVzXG4gKi9cblxuLy8gQ2hlY2sgd2hldGhlciBgX19wcm90b19fYCBpcyBzdXBwb3J0ZWRcbnZhciBoYXNQcm90b1N1cHBvcnQgPSAnX19wcm90b19fJyBpbiBPYmplY3Q7XG5cbi8vIFdpdGhvdXQgYF9fcHJvdG9fX2Agc3VwcG9ydCwgdGhpcyBtb2R1bGUgd2lsbCBuZWVkIHRvIGFkZCBwcm9wZXJ0aWVzIHRvIGEgZnVuY3Rpb24uXG4vLyBIb3dldmVyLCBzb21lIEZ1bmN0aW9uLnByb3RvdHlwZSBtZXRob2RzIGNhbm5vdCBiZSBvdmVyd3JpdHRlbixcbi8vIGFuZCB0aGVyZSBzZWVtcyBubyBlYXN5IGNyb3NzLXBsYXRmb3JtIHdheSB0byBkZXRlY3QgdGhlbSAoQHNlZSBjaGFpanMvY2hhaS9pc3N1ZXMvNjkpLlxudmFyIGV4Y2x1ZGVOYW1lcyA9IC9eKD86bGVuZ3RofG5hbWV8YXJndW1lbnRzfGNhbGxlcikkLztcblxuLy8gQ2FjaGUgYEZ1bmN0aW9uYCBwcm9wZXJ0aWVzXG52YXIgY2FsbCAgPSBGdW5jdGlvbi5wcm90b3R5cGUuY2FsbCxcbiAgICBhcHBseSA9IEZ1bmN0aW9uLnByb3RvdHlwZS5hcHBseTtcblxuLyoqXG4gKiAjIyMgYWRkQ2hhaW5hYmxlTWV0aG9kIChjdHgsIG5hbWUsIG1ldGhvZCwgY2hhaW5pbmdCZWhhdmlvcilcbiAqXG4gKiBBZGRzIGEgbWV0aG9kIHRvIGFuIG9iamVjdCwgc3VjaCB0aGF0IHRoZSBtZXRob2QgY2FuIGFsc28gYmUgY2hhaW5lZC5cbiAqXG4gKiAgICAgdXRpbHMuYWRkQ2hhaW5hYmxlTWV0aG9kKGNoYWkuQXNzZXJ0aW9uLnByb3RvdHlwZSwgJ2ZvbycsIGZ1bmN0aW9uIChzdHIpIHtcbiAqICAgICAgIHZhciBvYmogPSB1dGlscy5mbGFnKHRoaXMsICdvYmplY3QnKTtcbiAqICAgICAgIG5ldyBjaGFpLkFzc2VydGlvbihvYmopLnRvLmJlLmVxdWFsKHN0cik7XG4gKiAgICAgfSk7XG4gKlxuICogQ2FuIGFsc28gYmUgYWNjZXNzZWQgZGlyZWN0bHkgZnJvbSBgY2hhaS5Bc3NlcnRpb25gLlxuICpcbiAqICAgICBjaGFpLkFzc2VydGlvbi5hZGRDaGFpbmFibGVNZXRob2QoJ2ZvbycsIGZuLCBjaGFpbmluZ0JlaGF2aW9yKTtcbiAqXG4gKiBUaGUgcmVzdWx0IGNhbiB0aGVuIGJlIHVzZWQgYXMgYm90aCBhIG1ldGhvZCBhc3NlcnRpb24sIGV4ZWN1dGluZyBib3RoIGBtZXRob2RgIGFuZFxuICogYGNoYWluaW5nQmVoYXZpb3JgLCBvciBhcyBhIGxhbmd1YWdlIGNoYWluLCB3aGljaCBvbmx5IGV4ZWN1dGVzIGBjaGFpbmluZ0JlaGF2aW9yYC5cbiAqXG4gKiAgICAgZXhwZWN0KGZvb1N0cikudG8uYmUuZm9vKCdiYXInKTtcbiAqICAgICBleHBlY3QoZm9vU3RyKS50by5iZS5mb28uZXF1YWwoJ2ZvbycpO1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBjdHggb2JqZWN0IHRvIHdoaWNoIHRoZSBtZXRob2QgaXMgYWRkZWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIG9mIG1ldGhvZCB0byBhZGRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG1ldGhvZCBmdW5jdGlvbiB0byBiZSB1c2VkIGZvciBgbmFtZWAsIHdoZW4gY2FsbGVkXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjaGFpbmluZ0JlaGF2aW9yIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBldmVyeSB0aW1lIHRoZSBwcm9wZXJ0eSBpcyBhY2Nlc3NlZFxuICogQG5hbWUgYWRkQ2hhaW5hYmxlTWV0aG9kXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGN0eCwgbmFtZSwgbWV0aG9kLCBjaGFpbmluZ0JlaGF2aW9yKSB7XG4gIGlmICh0eXBlb2YgY2hhaW5pbmdCZWhhdmlvciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIGNoYWluaW5nQmVoYXZpb3IgPSBmdW5jdGlvbiAoKSB7IH07XG4gIH1cblxuICB2YXIgY2hhaW5hYmxlQmVoYXZpb3IgPSB7XG4gICAgICBtZXRob2Q6IG1ldGhvZFxuICAgICwgY2hhaW5pbmdCZWhhdmlvcjogY2hhaW5pbmdCZWhhdmlvclxuICB9O1xuXG4gIC8vIHNhdmUgdGhlIG1ldGhvZHMgc28gd2UgY2FuIG92ZXJ3cml0ZSB0aGVtIGxhdGVyLCBpZiB3ZSBuZWVkIHRvLlxuICBpZiAoIWN0eC5fX21ldGhvZHMpIHtcbiAgICBjdHguX19tZXRob2RzID0ge307XG4gIH1cbiAgY3R4Ll9fbWV0aG9kc1tuYW1lXSA9IGNoYWluYWJsZUJlaGF2aW9yO1xuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjdHgsIG5hbWUsXG4gICAgeyBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY2hhaW5hYmxlQmVoYXZpb3IuY2hhaW5pbmdCZWhhdmlvci5jYWxsKHRoaXMpO1xuXG4gICAgICAgIHZhciBhc3NlcnQgPSBmdW5jdGlvbiBhc3NlcnQoKSB7XG4gICAgICAgICAgdmFyIG9sZF9zc2ZpID0gZmxhZyh0aGlzLCAnc3NmaScpO1xuICAgICAgICAgIGlmIChvbGRfc3NmaSAmJiBjb25maWcuaW5jbHVkZVN0YWNrID09PSBmYWxzZSlcbiAgICAgICAgICAgIGZsYWcodGhpcywgJ3NzZmknLCBhc3NlcnQpO1xuICAgICAgICAgIHZhciByZXN1bHQgPSBjaGFpbmFibGVCZWhhdmlvci5tZXRob2QuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0ID09PSB1bmRlZmluZWQgPyB0aGlzIDogcmVzdWx0O1xuICAgICAgICB9O1xuXG4gICAgICAgIC8vIFVzZSBgX19wcm90b19fYCBpZiBhdmFpbGFibGVcbiAgICAgICAgaWYgKGhhc1Byb3RvU3VwcG9ydCkge1xuICAgICAgICAgIC8vIEluaGVyaXQgYWxsIHByb3BlcnRpZXMgZnJvbSB0aGUgb2JqZWN0IGJ5IHJlcGxhY2luZyB0aGUgYEZ1bmN0aW9uYCBwcm90b3R5cGVcbiAgICAgICAgICB2YXIgcHJvdG90eXBlID0gYXNzZXJ0Ll9fcHJvdG9fXyA9IE9iamVjdC5jcmVhdGUodGhpcyk7XG4gICAgICAgICAgLy8gUmVzdG9yZSB0aGUgYGNhbGxgIGFuZCBgYXBwbHlgIG1ldGhvZHMgZnJvbSBgRnVuY3Rpb25gXG4gICAgICAgICAgcHJvdG90eXBlLmNhbGwgPSBjYWxsO1xuICAgICAgICAgIHByb3RvdHlwZS5hcHBseSA9IGFwcGx5O1xuICAgICAgICB9XG4gICAgICAgIC8vIE90aGVyd2lzZSwgcmVkZWZpbmUgYWxsIHByb3BlcnRpZXMgKHNsb3chKVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICB2YXIgYXNzZXJ0ZXJOYW1lcyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKGN0eCk7XG4gICAgICAgICAgYXNzZXJ0ZXJOYW1lcy5mb3JFYWNoKGZ1bmN0aW9uIChhc3NlcnRlck5hbWUpIHtcbiAgICAgICAgICAgIGlmICghZXhjbHVkZU5hbWVzLnRlc3QoYXNzZXJ0ZXJOYW1lKSkge1xuICAgICAgICAgICAgICB2YXIgcGQgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGN0eCwgYXNzZXJ0ZXJOYW1lKTtcbiAgICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGFzc2VydCwgYXNzZXJ0ZXJOYW1lLCBwZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB0cmFuc2ZlckZsYWdzKHRoaXMsIGFzc2VydCk7XG4gICAgICAgIHJldHVybiBhc3NlcnQ7XG4gICAgICB9XG4gICAgLCBjb25maWd1cmFibGU6IHRydWVcbiAgfSk7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL2FkZE1ldGhvZC5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gYWRkTWV0aG9kIHV0aWxpdHlcbiAqIENvcHlyaWdodChjKSAyMDEyLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG52YXIgY29uZmlnID0gcmVxdWlyZSgnLi4vY29uZmlnJyk7XG5cbi8qKlxuICogIyMjIC5hZGRNZXRob2QgKGN0eCwgbmFtZSwgbWV0aG9kKVxuICpcbiAqIEFkZHMgYSBtZXRob2QgdG8gdGhlIHByb3RvdHlwZSBvZiBhbiBvYmplY3QuXG4gKlxuICogICAgIHV0aWxzLmFkZE1ldGhvZChjaGFpLkFzc2VydGlvbi5wcm90b3R5cGUsICdmb28nLCBmdW5jdGlvbiAoc3RyKSB7XG4gKiAgICAgICB2YXIgb2JqID0gdXRpbHMuZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG4gKiAgICAgICBuZXcgY2hhaS5Bc3NlcnRpb24ob2JqKS50by5iZS5lcXVhbChzdHIpO1xuICogICAgIH0pO1xuICpcbiAqIENhbiBhbHNvIGJlIGFjY2Vzc2VkIGRpcmVjdGx5IGZyb20gYGNoYWkuQXNzZXJ0aW9uYC5cbiAqXG4gKiAgICAgY2hhaS5Bc3NlcnRpb24uYWRkTWV0aG9kKCdmb28nLCBmbik7XG4gKlxuICogVGhlbiBjYW4gYmUgdXNlZCBhcyBhbnkgb3RoZXIgYXNzZXJ0aW9uLlxuICpcbiAqICAgICBleHBlY3QoZm9vU3RyKS50by5iZS5mb28oJ2JhcicpO1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBjdHggb2JqZWN0IHRvIHdoaWNoIHRoZSBtZXRob2QgaXMgYWRkZWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIG9mIG1ldGhvZCB0byBhZGRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG1ldGhvZCBmdW5jdGlvbiB0byBiZSB1c2VkIGZvciBuYW1lXG4gKiBAbmFtZSBhZGRNZXRob2RcbiAqIEBhcGkgcHVibGljXG4gKi9cbnZhciBmbGFnID0gcmVxdWlyZSgnLi9mbGFnJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGN0eCwgbmFtZSwgbWV0aG9kKSB7XG4gIGN0eFtuYW1lXSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgb2xkX3NzZmkgPSBmbGFnKHRoaXMsICdzc2ZpJyk7XG4gICAgaWYgKG9sZF9zc2ZpICYmIGNvbmZpZy5pbmNsdWRlU3RhY2sgPT09IGZhbHNlKVxuICAgICAgZmxhZyh0aGlzLCAnc3NmaScsIGN0eFtuYW1lXSk7XG4gICAgdmFyIHJlc3VsdCA9IG1ldGhvZC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIHJldHVybiByZXN1bHQgPT09IHVuZGVmaW5lZCA/IHRoaXMgOiByZXN1bHQ7XG4gIH07XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL2FkZFByb3BlcnR5LmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIENoYWkgLSBhZGRQcm9wZXJ0eSB1dGlsaXR5XG4gKiBDb3B5cmlnaHQoYykgMjAxMi0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyoqXG4gKiAjIyMgYWRkUHJvcGVydHkgKGN0eCwgbmFtZSwgZ2V0dGVyKVxuICpcbiAqIEFkZHMgYSBwcm9wZXJ0eSB0byB0aGUgcHJvdG90eXBlIG9mIGFuIG9iamVjdC5cbiAqXG4gKiAgICAgdXRpbHMuYWRkUHJvcGVydHkoY2hhaS5Bc3NlcnRpb24ucHJvdG90eXBlLCAnZm9vJywgZnVuY3Rpb24gKCkge1xuICogICAgICAgdmFyIG9iaiA9IHV0aWxzLmZsYWcodGhpcywgJ29iamVjdCcpO1xuICogICAgICAgbmV3IGNoYWkuQXNzZXJ0aW9uKG9iaikudG8uYmUuaW5zdGFuY2VvZihGb28pO1xuICogICAgIH0pO1xuICpcbiAqIENhbiBhbHNvIGJlIGFjY2Vzc2VkIGRpcmVjdGx5IGZyb20gYGNoYWkuQXNzZXJ0aW9uYC5cbiAqXG4gKiAgICAgY2hhaS5Bc3NlcnRpb24uYWRkUHJvcGVydHkoJ2ZvbycsIGZuKTtcbiAqXG4gKiBUaGVuIGNhbiBiZSB1c2VkIGFzIGFueSBvdGhlciBhc3NlcnRpb24uXG4gKlxuICogICAgIGV4cGVjdChteUZvbykudG8uYmUuZm9vO1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBjdHggb2JqZWN0IHRvIHdoaWNoIHRoZSBwcm9wZXJ0eSBpcyBhZGRlZFxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgb2YgcHJvcGVydHkgdG8gYWRkXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBnZXR0ZXIgZnVuY3Rpb24gdG8gYmUgdXNlZCBmb3IgbmFtZVxuICogQG5hbWUgYWRkUHJvcGVydHlcbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoY3R4LCBuYW1lLCBnZXR0ZXIpIHtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGN0eCwgbmFtZSxcbiAgICB7IGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gZ2V0dGVyLmNhbGwodGhpcyk7XG4gICAgICAgIHJldHVybiByZXN1bHQgPT09IHVuZGVmaW5lZCA/IHRoaXMgOiByZXN1bHQ7XG4gICAgICB9XG4gICAgLCBjb25maWd1cmFibGU6IHRydWVcbiAgfSk7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL2ZsYWcuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogQ2hhaSAtIGZsYWcgdXRpbGl0eVxuICogQ29weXJpZ2h0KGMpIDIwMTItMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogIyMjIGZsYWcob2JqZWN0ICxrZXksIFt2YWx1ZV0pXG4gKlxuICogR2V0IG9yIHNldCBhIGZsYWcgdmFsdWUgb24gYW4gb2JqZWN0LiBJZiBhXG4gKiB2YWx1ZSBpcyBwcm92aWRlZCBpdCB3aWxsIGJlIHNldCwgZWxzZSBpdCB3aWxsXG4gKiByZXR1cm4gdGhlIGN1cnJlbnRseSBzZXQgdmFsdWUgb3IgYHVuZGVmaW5lZGAgaWZcbiAqIHRoZSB2YWx1ZSBpcyBub3Qgc2V0LlxuICpcbiAqICAgICB1dGlscy5mbGFnKHRoaXMsICdmb28nLCAnYmFyJyk7IC8vIHNldHRlclxuICogICAgIHV0aWxzLmZsYWcodGhpcywgJ2ZvbycpOyAvLyBnZXR0ZXIsIHJldHVybnMgYGJhcmBcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IChjb25zdHJ1Y3RlZCBBc3NlcnRpb25cbiAqIEBwYXJhbSB7U3RyaW5nfSBrZXlcbiAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlIChvcHRpb25hbClcbiAqIEBuYW1lIGZsYWdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaiwga2V5LCB2YWx1ZSkge1xuICB2YXIgZmxhZ3MgPSBvYmouX19mbGFncyB8fCAob2JqLl9fZmxhZ3MgPSBPYmplY3QuY3JlYXRlKG51bGwpKTtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDMpIHtcbiAgICBmbGFnc1trZXldID0gdmFsdWU7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZsYWdzW2tleV07XG4gIH1cbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvdXRpbHMvZ2V0QWN0dWFsLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIENoYWkgLSBnZXRBY3R1YWwgdXRpbGl0eVxuICogQ29weXJpZ2h0KGMpIDIwMTItMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogIyBnZXRBY3R1YWwob2JqZWN0LCBbYWN0dWFsXSlcbiAqXG4gKiBSZXR1cm5zIHRoZSBgYWN0dWFsYCB2YWx1ZSBmb3IgYW4gQXNzZXJ0aW9uXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCAoY29uc3RydWN0ZWQgQXNzZXJ0aW9uKVxuICogQHBhcmFtIHtBcmd1bWVudHN9IGNoYWkuQXNzZXJ0aW9uLnByb3RvdHlwZS5hc3NlcnQgYXJndW1lbnRzXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqLCBhcmdzKSB7XG4gIHJldHVybiBhcmdzLmxlbmd0aCA+IDQgPyBhcmdzWzRdIDogb2JqLl9vYmo7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL2dldEVudW1lcmFibGVQcm9wZXJ0aWVzLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIENoYWkgLSBnZXRFbnVtZXJhYmxlUHJvcGVydGllcyB1dGlsaXR5XG4gKiBDb3B5cmlnaHQoYykgMjAxMi0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyoqXG4gKiAjIyMgLmdldEVudW1lcmFibGVQcm9wZXJ0aWVzKG9iamVjdClcbiAqXG4gKiBUaGlzIGFsbG93cyB0aGUgcmV0cmlldmFsIG9mIGVudW1lcmFibGUgcHJvcGVydHkgbmFtZXMgb2YgYW4gb2JqZWN0LFxuICogaW5oZXJpdGVkIG9yIG5vdC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gKiBAcmV0dXJucyB7QXJyYXl9XG4gKiBAbmFtZSBnZXRFbnVtZXJhYmxlUHJvcGVydGllc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGdldEVudW1lcmFibGVQcm9wZXJ0aWVzKG9iamVjdCkge1xuICB2YXIgcmVzdWx0ID0gW107XG4gIGZvciAodmFyIG5hbWUgaW4gb2JqZWN0KSB7XG4gICAgcmVzdWx0LnB1c2gobmFtZSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvdXRpbHMvZ2V0TWVzc2FnZS5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gbWVzc2FnZSBjb21wb3NpdGlvbiB1dGlsaXR5XG4gKiBDb3B5cmlnaHQoYykgMjAxMi0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyohXG4gKiBNb2R1bGUgZGVwZW5kYW5jaWVzXG4gKi9cblxudmFyIGZsYWcgPSByZXF1aXJlKCcuL2ZsYWcnKVxuICAsIGdldEFjdHVhbCA9IHJlcXVpcmUoJy4vZ2V0QWN0dWFsJylcbiAgLCBpbnNwZWN0ID0gcmVxdWlyZSgnLi9pbnNwZWN0JylcbiAgLCBvYmpEaXNwbGF5ID0gcmVxdWlyZSgnLi9vYmpEaXNwbGF5Jyk7XG5cbi8qKlxuICogIyMjIC5nZXRNZXNzYWdlKG9iamVjdCwgbWVzc2FnZSwgbmVnYXRlTWVzc2FnZSlcbiAqXG4gKiBDb25zdHJ1Y3QgdGhlIGVycm9yIG1lc3NhZ2UgYmFzZWQgb24gZmxhZ3NcbiAqIGFuZCB0ZW1wbGF0ZSB0YWdzLiBUZW1wbGF0ZSB0YWdzIHdpbGwgcmV0dXJuXG4gKiBhIHN0cmluZ2lmaWVkIGluc3BlY3Rpb24gb2YgdGhlIG9iamVjdCByZWZlcmVuY2VkLlxuICpcbiAqIE1lc3NhZ2UgdGVtcGxhdGUgdGFnczpcbiAqIC0gYCN7dGhpc31gIGN1cnJlbnQgYXNzZXJ0ZWQgb2JqZWN0XG4gKiAtIGAje2FjdH1gIGFjdHVhbCB2YWx1ZVxuICogLSBgI3tleHB9YCBleHBlY3RlZCB2YWx1ZVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgKGNvbnN0cnVjdGVkIEFzc2VydGlvbilcbiAqIEBwYXJhbSB7QXJndW1lbnRzfSBjaGFpLkFzc2VydGlvbi5wcm90b3R5cGUuYXNzZXJ0IGFyZ3VtZW50c1xuICogQG5hbWUgZ2V0TWVzc2FnZVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmosIGFyZ3MpIHtcbiAgdmFyIG5lZ2F0ZSA9IGZsYWcob2JqLCAnbmVnYXRlJylcbiAgICAsIHZhbCA9IGZsYWcob2JqLCAnb2JqZWN0JylcbiAgICAsIGV4cGVjdGVkID0gYXJnc1szXVxuICAgICwgYWN0dWFsID0gZ2V0QWN0dWFsKG9iaiwgYXJncylcbiAgICAsIG1zZyA9IG5lZ2F0ZSA/IGFyZ3NbMl0gOiBhcmdzWzFdXG4gICAgLCBmbGFnTXNnID0gZmxhZyhvYmosICdtZXNzYWdlJyk7XG5cbiAgbXNnID0gbXNnIHx8ICcnO1xuICBtc2cgPSBtc2dcbiAgICAucmVwbGFjZSgvI3t0aGlzfS9nLCBvYmpEaXNwbGF5KHZhbCkpXG4gICAgLnJlcGxhY2UoLyN7YWN0fS9nLCBvYmpEaXNwbGF5KGFjdHVhbCkpXG4gICAgLnJlcGxhY2UoLyN7ZXhwfS9nLCBvYmpEaXNwbGF5KGV4cGVjdGVkKSk7XG5cbiAgcmV0dXJuIGZsYWdNc2cgPyBmbGFnTXNnICsgJzogJyArIG1zZyA6IG1zZztcbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvdXRpbHMvZ2V0TmFtZS5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gZ2V0TmFtZSB1dGlsaXR5XG4gKiBDb3B5cmlnaHQoYykgMjAxMi0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyoqXG4gKiAjIGdldE5hbWUoZnVuYylcbiAqXG4gKiBHZXRzIHRoZSBuYW1lIG9mIGEgZnVuY3Rpb24sIGluIGEgY3Jvc3MtYnJvd3NlciB3YXkuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gYSBmdW5jdGlvbiAodXN1YWxseSBhIGNvbnN0cnVjdG9yKVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGZ1bmMpIHtcbiAgaWYgKGZ1bmMubmFtZSkgcmV0dXJuIGZ1bmMubmFtZTtcblxuICB2YXIgbWF0Y2ggPSAvXlxccz9mdW5jdGlvbiAoW14oXSopXFwoLy5leGVjKGZ1bmMpO1xuICByZXR1cm4gbWF0Y2ggJiYgbWF0Y2hbMV0gPyBtYXRjaFsxXSA6IFwiXCI7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL2dldFBhdGhWYWx1ZS5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gZ2V0UGF0aFZhbHVlIHV0aWxpdHlcbiAqIENvcHlyaWdodChjKSAyMDEyLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9sb2dpY2FscGFyYWRveC9maWx0clxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyoqXG4gKiAjIyMgLmdldFBhdGhWYWx1ZShwYXRoLCBvYmplY3QpXG4gKlxuICogVGhpcyBhbGxvd3MgdGhlIHJldHJpZXZhbCBvZiB2YWx1ZXMgaW4gYW5cbiAqIG9iamVjdCBnaXZlbiBhIHN0cmluZyBwYXRoLlxuICpcbiAqICAgICB2YXIgb2JqID0ge1xuICogICAgICAgICBwcm9wMToge1xuICogICAgICAgICAgICAgYXJyOiBbJ2EnLCAnYicsICdjJ11cbiAqICAgICAgICAgICAsIHN0cjogJ0hlbGxvJ1xuICogICAgICAgICB9XG4gKiAgICAgICAsIHByb3AyOiB7XG4gKiAgICAgICAgICAgICBhcnI6IFsgeyBuZXN0ZWQ6ICdVbml2ZXJzZScgfSBdXG4gKiAgICAgICAgICAgLCBzdHI6ICdIZWxsbyBhZ2FpbiEnXG4gKiAgICAgICAgIH1cbiAqICAgICB9XG4gKlxuICogVGhlIGZvbGxvd2luZyB3b3VsZCBiZSB0aGUgcmVzdWx0cy5cbiAqXG4gKiAgICAgZ2V0UGF0aFZhbHVlKCdwcm9wMS5zdHInLCBvYmopOyAvLyBIZWxsb1xuICogICAgIGdldFBhdGhWYWx1ZSgncHJvcDEuYXR0WzJdJywgb2JqKTsgLy8gYlxuICogICAgIGdldFBhdGhWYWx1ZSgncHJvcDIuYXJyWzBdLm5lc3RlZCcsIG9iaik7IC8vIFVuaXZlcnNlXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3RcbiAqIEByZXR1cm5zIHtPYmplY3R9IHZhbHVlIG9yIGB1bmRlZmluZWRgXG4gKiBAbmFtZSBnZXRQYXRoVmFsdWVcbiAqIEBhcGkgcHVibGljXG4gKi9cblxudmFyIGdldFBhdGhWYWx1ZSA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHBhdGgsIG9iaikge1xuICB2YXIgcGFyc2VkID0gcGFyc2VQYXRoKHBhdGgpO1xuICByZXR1cm4gX2dldFBhdGhWYWx1ZShwYXJzZWQsIG9iaik7XG59O1xuXG4vKiFcbiAqICMjIHBhcnNlUGF0aChwYXRoKVxuICpcbiAqIEhlbHBlciBmdW5jdGlvbiB1c2VkIHRvIHBhcnNlIHN0cmluZyBvYmplY3RcbiAqIHBhdGhzLiBVc2UgaW4gY29uanVuY3Rpb24gd2l0aCBgX2dldFBhdGhWYWx1ZWAuXG4gKlxuICogICAgICB2YXIgcGFyc2VkID0gcGFyc2VQYXRoKCdteW9iamVjdC5wcm9wZXJ0eS5zdWJwcm9wJyk7XG4gKlxuICogIyMjIFBhdGhzOlxuICpcbiAqICogQ2FuIGJlIGFzIG5lYXIgaW5maW5pdGVseSBkZWVwIGFuZCBuZXN0ZWRcbiAqICogQXJyYXlzIGFyZSBhbHNvIHZhbGlkIHVzaW5nIHRoZSBmb3JtYWwgYG15b2JqZWN0LmRvY3VtZW50WzNdLnByb3BlcnR5YC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICogQHJldHVybnMge09iamVjdH0gcGFyc2VkXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYXJzZVBhdGggKHBhdGgpIHtcbiAgdmFyIHN0ciA9IHBhdGgucmVwbGFjZSgvXFxbL2csICcuWycpXG4gICAgLCBwYXJ0cyA9IHN0ci5tYXRjaCgvKFxcXFxcXC58W14uXSs/KSsvZyk7XG4gIHJldHVybiBwYXJ0cy5tYXAoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgdmFyIHJlID0gL1xcWyhcXGQrKVxcXSQvXG4gICAgICAsIG1BcnIgPSByZS5leGVjKHZhbHVlKVxuICAgIGlmIChtQXJyKSByZXR1cm4geyBpOiBwYXJzZUZsb2F0KG1BcnJbMV0pIH07XG4gICAgZWxzZSByZXR1cm4geyBwOiB2YWx1ZSB9O1xuICB9KTtcbn07XG5cbi8qIVxuICogIyMgX2dldFBhdGhWYWx1ZShwYXJzZWQsIG9iailcbiAqXG4gKiBIZWxwZXIgY29tcGFuaW9uIGZ1bmN0aW9uIGZvciBgLnBhcnNlUGF0aGAgdGhhdCByZXR1cm5zXG4gKiB0aGUgdmFsdWUgbG9jYXRlZCBhdCB0aGUgcGFyc2VkIGFkZHJlc3MuXG4gKlxuICogICAgICB2YXIgdmFsdWUgPSBnZXRQYXRoVmFsdWUocGFyc2VkLCBvYmopO1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBwYXJzZWQgZGVmaW5pdGlvbiBmcm9tIGBwYXJzZVBhdGhgLlxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCB0byBzZWFyY2ggYWdhaW5zdFxuICogQHJldHVybnMge09iamVjdHxVbmRlZmluZWR9IHZhbHVlXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBfZ2V0UGF0aFZhbHVlIChwYXJzZWQsIG9iaikge1xuICB2YXIgdG1wID0gb2JqXG4gICAgLCByZXM7XG4gIGZvciAodmFyIGkgPSAwLCBsID0gcGFyc2VkLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIHZhciBwYXJ0ID0gcGFyc2VkW2ldO1xuICAgIGlmICh0bXApIHtcbiAgICAgIGlmICgndW5kZWZpbmVkJyAhPT0gdHlwZW9mIHBhcnQucClcbiAgICAgICAgdG1wID0gdG1wW3BhcnQucF07XG4gICAgICBlbHNlIGlmICgndW5kZWZpbmVkJyAhPT0gdHlwZW9mIHBhcnQuaSlcbiAgICAgICAgdG1wID0gdG1wW3BhcnQuaV07XG4gICAgICBpZiAoaSA9PSAobCAtIDEpKSByZXMgPSB0bXA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlcyA9IHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvdXRpbHMvZ2V0UHJvcGVydGllcy5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gZ2V0UHJvcGVydGllcyB1dGlsaXR5XG4gKiBDb3B5cmlnaHQoYykgMjAxMi0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyoqXG4gKiAjIyMgLmdldFByb3BlcnRpZXMob2JqZWN0KVxuICpcbiAqIFRoaXMgYWxsb3dzIHRoZSByZXRyaWV2YWwgb2YgcHJvcGVydHkgbmFtZXMgb2YgYW4gb2JqZWN0LCBlbnVtZXJhYmxlIG9yIG5vdCxcbiAqIGluaGVyaXRlZCBvciBub3QuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICogQHJldHVybnMge0FycmF5fVxuICogQG5hbWUgZ2V0UHJvcGVydGllc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGdldFByb3BlcnRpZXMob2JqZWN0KSB7XG4gIHZhciByZXN1bHQgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhzdWJqZWN0KTtcblxuICBmdW5jdGlvbiBhZGRQcm9wZXJ0eShwcm9wZXJ0eSkge1xuICAgIGlmIChyZXN1bHQuaW5kZXhPZihwcm9wZXJ0eSkgPT09IC0xKSB7XG4gICAgICByZXN1bHQucHVzaChwcm9wZXJ0eSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIHByb3RvID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKHN1YmplY3QpO1xuICB3aGlsZSAocHJvdG8gIT09IG51bGwpIHtcbiAgICBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhwcm90bykuZm9yRWFjaChhZGRQcm9wZXJ0eSk7XG4gICAgcHJvdG8gPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YocHJvdG8pO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvdXRpbHMvaW5kZXguanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogY2hhaVxuICogQ29weXJpZ2h0KGMpIDIwMTEgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKiFcbiAqIE1haW4gZXhwb3J0c1xuICovXG5cbnZhciBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLyohXG4gKiB0ZXN0IHV0aWxpdHlcbiAqL1xuXG5leHBvcnRzLnRlc3QgPSByZXF1aXJlKCcuL3Rlc3QnKTtcblxuLyohXG4gKiB0eXBlIHV0aWxpdHlcbiAqL1xuXG5leHBvcnRzLnR5cGUgPSByZXF1aXJlKCcuL3R5cGUnKTtcblxuLyohXG4gKiBtZXNzYWdlIHV0aWxpdHlcbiAqL1xuXG5leHBvcnRzLmdldE1lc3NhZ2UgPSByZXF1aXJlKCcuL2dldE1lc3NhZ2UnKTtcblxuLyohXG4gKiBhY3R1YWwgdXRpbGl0eVxuICovXG5cbmV4cG9ydHMuZ2V0QWN0dWFsID0gcmVxdWlyZSgnLi9nZXRBY3R1YWwnKTtcblxuLyohXG4gKiBJbnNwZWN0IHV0aWxcbiAqL1xuXG5leHBvcnRzLmluc3BlY3QgPSByZXF1aXJlKCcuL2luc3BlY3QnKTtcblxuLyohXG4gKiBPYmplY3QgRGlzcGxheSB1dGlsXG4gKi9cblxuZXhwb3J0cy5vYmpEaXNwbGF5ID0gcmVxdWlyZSgnLi9vYmpEaXNwbGF5Jyk7XG5cbi8qIVxuICogRmxhZyB1dGlsaXR5XG4gKi9cblxuZXhwb3J0cy5mbGFnID0gcmVxdWlyZSgnLi9mbGFnJyk7XG5cbi8qIVxuICogRmxhZyB0cmFuc2ZlcnJpbmcgdXRpbGl0eVxuICovXG5cbmV4cG9ydHMudHJhbnNmZXJGbGFncyA9IHJlcXVpcmUoJy4vdHJhbnNmZXJGbGFncycpO1xuXG4vKiFcbiAqIERlZXAgZXF1YWwgdXRpbGl0eVxuICovXG5cbmV4cG9ydHMuZXFsID0gcmVxdWlyZSgnZGVlcC1lcWwnKTtcblxuLyohXG4gKiBEZWVwIHBhdGggdmFsdWVcbiAqL1xuXG5leHBvcnRzLmdldFBhdGhWYWx1ZSA9IHJlcXVpcmUoJy4vZ2V0UGF0aFZhbHVlJyk7XG5cbi8qIVxuICogRnVuY3Rpb24gbmFtZVxuICovXG5cbmV4cG9ydHMuZ2V0TmFtZSA9IHJlcXVpcmUoJy4vZ2V0TmFtZScpO1xuXG4vKiFcbiAqIGFkZCBQcm9wZXJ0eVxuICovXG5cbmV4cG9ydHMuYWRkUHJvcGVydHkgPSByZXF1aXJlKCcuL2FkZFByb3BlcnR5Jyk7XG5cbi8qIVxuICogYWRkIE1ldGhvZFxuICovXG5cbmV4cG9ydHMuYWRkTWV0aG9kID0gcmVxdWlyZSgnLi9hZGRNZXRob2QnKTtcblxuLyohXG4gKiBvdmVyd3JpdGUgUHJvcGVydHlcbiAqL1xuXG5leHBvcnRzLm92ZXJ3cml0ZVByb3BlcnR5ID0gcmVxdWlyZSgnLi9vdmVyd3JpdGVQcm9wZXJ0eScpO1xuXG4vKiFcbiAqIG92ZXJ3cml0ZSBNZXRob2RcbiAqL1xuXG5leHBvcnRzLm92ZXJ3cml0ZU1ldGhvZCA9IHJlcXVpcmUoJy4vb3ZlcndyaXRlTWV0aG9kJyk7XG5cbi8qIVxuICogQWRkIGEgY2hhaW5hYmxlIG1ldGhvZFxuICovXG5cbmV4cG9ydHMuYWRkQ2hhaW5hYmxlTWV0aG9kID0gcmVxdWlyZSgnLi9hZGRDaGFpbmFibGVNZXRob2QnKTtcblxuLyohXG4gKiBPdmVyd3JpdGUgY2hhaW5hYmxlIG1ldGhvZFxuICovXG5cbmV4cG9ydHMub3ZlcndyaXRlQ2hhaW5hYmxlTWV0aG9kID0gcmVxdWlyZSgnLi9vdmVyd3JpdGVDaGFpbmFibGVNZXRob2QnKTtcblxuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL2luc3BlY3QuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8vIFRoaXMgaXMgKGFsbW9zdCkgZGlyZWN0bHkgZnJvbSBOb2RlLmpzIHV0aWxzXG4vLyBodHRwczovL2dpdGh1Yi5jb20vam95ZW50L25vZGUvYmxvYi9mOGMzMzVkMGNhZjQ3ZjE2ZDMxNDEzZjg5YWEyOGVkYTM4NzhlM2FhL2xpYi91dGlsLmpzXG5cbnZhciBnZXROYW1lID0gcmVxdWlyZSgnLi9nZXROYW1lJyk7XG52YXIgZ2V0UHJvcGVydGllcyA9IHJlcXVpcmUoJy4vZ2V0UHJvcGVydGllcycpO1xudmFyIGdldEVudW1lcmFibGVQcm9wZXJ0aWVzID0gcmVxdWlyZSgnLi9nZXRFbnVtZXJhYmxlUHJvcGVydGllcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGluc3BlY3Q7XG5cbi8qKlxuICogRWNob3MgdGhlIHZhbHVlIG9mIGEgdmFsdWUuIFRyeXMgdG8gcHJpbnQgdGhlIHZhbHVlIG91dFxuICogaW4gdGhlIGJlc3Qgd2F5IHBvc3NpYmxlIGdpdmVuIHRoZSBkaWZmZXJlbnQgdHlwZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIHByaW50IG91dC5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvd0hpZGRlbiBGbGFnIHRoYXQgc2hvd3MgaGlkZGVuIChub3QgZW51bWVyYWJsZSlcbiAqICAgIHByb3BlcnRpZXMgb2Ygb2JqZWN0cy5cbiAqIEBwYXJhbSB7TnVtYmVyfSBkZXB0aCBEZXB0aCBpbiB3aGljaCB0byBkZXNjZW5kIGluIG9iamVjdC4gRGVmYXVsdCBpcyAyLlxuICogQHBhcmFtIHtCb29sZWFufSBjb2xvcnMgRmxhZyB0byB0dXJuIG9uIEFOU0kgZXNjYXBlIGNvZGVzIHRvIGNvbG9yIHRoZVxuICogICAgb3V0cHV0LiBEZWZhdWx0IGlzIGZhbHNlIChubyBjb2xvcmluZykuXG4gKi9cbmZ1bmN0aW9uIGluc3BlY3Qob2JqLCBzaG93SGlkZGVuLCBkZXB0aCwgY29sb3JzKSB7XG4gIHZhciBjdHggPSB7XG4gICAgc2hvd0hpZGRlbjogc2hvd0hpZGRlbixcbiAgICBzZWVuOiBbXSxcbiAgICBzdHlsaXplOiBmdW5jdGlvbiAoc3RyKSB7IHJldHVybiBzdHI7IH1cbiAgfTtcbiAgcmV0dXJuIGZvcm1hdFZhbHVlKGN0eCwgb2JqLCAodHlwZW9mIGRlcHRoID09PSAndW5kZWZpbmVkJyA/IDIgOiBkZXB0aCkpO1xufVxuXG4vLyBodHRwczovL2dpc3QuZ2l0aHViLmNvbS8xMDQ0MTI4L1xudmFyIGdldE91dGVySFRNTCA9IGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgaWYgKCdvdXRlckhUTUwnIGluIGVsZW1lbnQpIHJldHVybiBlbGVtZW50Lm91dGVySFRNTDtcbiAgdmFyIG5zID0gXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sXCI7XG4gIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMobnMsICdfJyk7XG4gIHZhciBlbGVtUHJvdG8gPSAod2luZG93LkhUTUxFbGVtZW50IHx8IHdpbmRvdy5FbGVtZW50KS5wcm90b3R5cGU7XG4gIHZhciB4bWxTZXJpYWxpemVyID0gbmV3IFhNTFNlcmlhbGl6ZXIoKTtcbiAgdmFyIGh0bWw7XG4gIGlmIChkb2N1bWVudC54bWxWZXJzaW9uKSB7XG4gICAgcmV0dXJuIHhtbFNlcmlhbGl6ZXIuc2VyaWFsaXplVG9TdHJpbmcoZWxlbWVudCk7XG4gIH0gZWxzZSB7XG4gICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGVsZW1lbnQuY2xvbmVOb2RlKGZhbHNlKSk7XG4gICAgaHRtbCA9IGNvbnRhaW5lci5pbm5lckhUTUwucmVwbGFjZSgnPjwnLCAnPicgKyBlbGVtZW50LmlubmVySFRNTCArICc8Jyk7XG4gICAgY29udGFpbmVyLmlubmVySFRNTCA9ICcnO1xuICAgIHJldHVybiBodG1sO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIHRydWUgaWYgb2JqZWN0IGlzIGEgRE9NIGVsZW1lbnQuXG52YXIgaXNET01FbGVtZW50ID0gZnVuY3Rpb24gKG9iamVjdCkge1xuICBpZiAodHlwZW9mIEhUTUxFbGVtZW50ID09PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBIVE1MRWxlbWVudDtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gb2JqZWN0ICYmXG4gICAgICB0eXBlb2Ygb2JqZWN0ID09PSAnb2JqZWN0JyAmJlxuICAgICAgb2JqZWN0Lm5vZGVUeXBlID09PSAxICYmXG4gICAgICB0eXBlb2Ygb2JqZWN0Lm5vZGVOYW1lID09PSAnc3RyaW5nJztcbiAgfVxufTtcblxuZnVuY3Rpb24gZm9ybWF0VmFsdWUoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzKSB7XG4gIC8vIFByb3ZpZGUgYSBob29rIGZvciB1c2VyLXNwZWNpZmllZCBpbnNwZWN0IGZ1bmN0aW9ucy5cbiAgLy8gQ2hlY2sgdGhhdCB2YWx1ZSBpcyBhbiBvYmplY3Qgd2l0aCBhbiBpbnNwZWN0IGZ1bmN0aW9uIG9uIGl0XG4gIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUuaW5zcGVjdCA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgLy8gRmlsdGVyIG91dCB0aGUgdXRpbCBtb2R1bGUsIGl0J3MgaW5zcGVjdCBmdW5jdGlvbiBpcyBzcGVjaWFsXG4gICAgICB2YWx1ZS5pbnNwZWN0ICE9PSBleHBvcnRzLmluc3BlY3QgJiZcbiAgICAgIC8vIEFsc28gZmlsdGVyIG91dCBhbnkgcHJvdG90eXBlIG9iamVjdHMgdXNpbmcgdGhlIGNpcmN1bGFyIGNoZWNrLlxuICAgICAgISh2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGUgPT09IHZhbHVlKSkge1xuICAgIHZhciByZXQgPSB2YWx1ZS5pbnNwZWN0KHJlY3Vyc2VUaW1lcyk7XG4gICAgaWYgKHR5cGVvZiByZXQgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXQgPSBmb3JtYXRWYWx1ZShjdHgsIHJldCwgcmVjdXJzZVRpbWVzKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIC8vIFByaW1pdGl2ZSB0eXBlcyBjYW5ub3QgaGF2ZSBwcm9wZXJ0aWVzXG4gIHZhciBwcmltaXRpdmUgPSBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSk7XG4gIGlmIChwcmltaXRpdmUpIHtcbiAgICByZXR1cm4gcHJpbWl0aXZlO1xuICB9XG5cbiAgLy8gSWYgaXQncyBET00gZWxlbSwgZ2V0IG91dGVyIEhUTUwuXG4gIGlmIChpc0RPTUVsZW1lbnQodmFsdWUpKSB7XG4gICAgcmV0dXJuIGdldE91dGVySFRNTCh2YWx1ZSk7XG4gIH1cblxuICAvLyBMb29rIHVwIHRoZSBrZXlzIG9mIHRoZSBvYmplY3QuXG4gIHZhciB2aXNpYmxlS2V5cyA9IGdldEVudW1lcmFibGVQcm9wZXJ0aWVzKHZhbHVlKTtcbiAgdmFyIGtleXMgPSBjdHguc2hvd0hpZGRlbiA/IGdldFByb3BlcnRpZXModmFsdWUpIDogdmlzaWJsZUtleXM7XG5cbiAgLy8gU29tZSB0eXBlIG9mIG9iamVjdCB3aXRob3V0IHByb3BlcnRpZXMgY2FuIGJlIHNob3J0Y3V0dGVkLlxuICAvLyBJbiBJRSwgZXJyb3JzIGhhdmUgYSBzaW5nbGUgYHN0YWNrYCBwcm9wZXJ0eSwgb3IgaWYgdGhleSBhcmUgdmFuaWxsYSBgRXJyb3JgLFxuICAvLyBhIGBzdGFja2AgcGx1cyBgZGVzY3JpcHRpb25gIHByb3BlcnR5OyBpZ25vcmUgdGhvc2UgZm9yIGNvbnNpc3RlbmN5LlxuICBpZiAoa2V5cy5sZW5ndGggPT09IDAgfHwgKGlzRXJyb3IodmFsdWUpICYmIChcbiAgICAgIChrZXlzLmxlbmd0aCA9PT0gMSAmJiBrZXlzWzBdID09PSAnc3RhY2snKSB8fFxuICAgICAgKGtleXMubGVuZ3RoID09PSAyICYmIGtleXNbMF0gPT09ICdkZXNjcmlwdGlvbicgJiYga2V5c1sxXSA9PT0gJ3N0YWNrJylcbiAgICAgKSkpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICB2YXIgbmFtZSA9IGdldE5hbWUodmFsdWUpO1xuICAgICAgdmFyIG5hbWVTdWZmaXggPSBuYW1lID8gJzogJyArIG5hbWUgOiAnJztcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW0Z1bmN0aW9uJyArIG5hbWVTdWZmaXggKyAnXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfVxuICAgIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoRGF0ZS5wcm90b3R5cGUudG9VVENTdHJpbmcuY2FsbCh2YWx1ZSksICdkYXRlJyk7XG4gICAgfVxuICAgIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgICB9XG4gIH1cblxuICB2YXIgYmFzZSA9ICcnLCBhcnJheSA9IGZhbHNlLCBicmFjZXMgPSBbJ3snLCAnfSddO1xuXG4gIC8vIE1ha2UgQXJyYXkgc2F5IHRoYXQgdGhleSBhcmUgQXJyYXlcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgYXJyYXkgPSB0cnVlO1xuICAgIGJyYWNlcyA9IFsnWycsICddJ107XG4gIH1cblxuICAvLyBNYWtlIGZ1bmN0aW9ucyBzYXkgdGhhdCB0aGV5IGFyZSBmdW5jdGlvbnNcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHZhciBuYW1lID0gZ2V0TmFtZSh2YWx1ZSk7XG4gICAgdmFyIG5hbWVTdWZmaXggPSBuYW1lID8gJzogJyArIG5hbWUgOiAnJztcbiAgICBiYXNlID0gJyBbRnVuY3Rpb24nICsgbmFtZVN1ZmZpeCArICddJztcbiAgfVxuXG4gIC8vIE1ha2UgUmVnRXhwcyBzYXkgdGhhdCB0aGV5IGFyZSBSZWdFeHBzXG4gIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZGF0ZXMgd2l0aCBwcm9wZXJ0aWVzIGZpcnN0IHNheSB0aGUgZGF0ZVxuICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBEYXRlLnByb3RvdHlwZS50b1VUQ1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZXJyb3Igd2l0aCBtZXNzYWdlIGZpcnN0IHNheSB0aGUgZXJyb3JcbiAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCAmJiAoIWFycmF5IHx8IHZhbHVlLmxlbmd0aCA9PSAwKSkge1xuICAgIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgYnJhY2VzWzFdO1xuICB9XG5cbiAgaWYgKHJlY3Vyc2VUaW1lcyA8IDApIHtcbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tPYmplY3RdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cblxuICBjdHguc2Vlbi5wdXNoKHZhbHVlKTtcblxuICB2YXIgb3V0cHV0O1xuICBpZiAoYXJyYXkpIHtcbiAgICBvdXRwdXQgPSBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKTtcbiAgfSBlbHNlIHtcbiAgICBvdXRwdXQgPSBrZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KTtcbiAgICB9KTtcbiAgfVxuXG4gIGN0eC5zZWVuLnBvcCgpO1xuXG4gIHJldHVybiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpIHtcbiAgc3dpdGNoICh0eXBlb2YgdmFsdWUpIHtcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCd1bmRlZmluZWQnLCAndW5kZWZpbmVkJyk7XG5cbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgdmFyIHNpbXBsZSA9ICdcXCcnICsgSlNPTi5zdHJpbmdpZnkodmFsdWUpLnJlcGxhY2UoL15cInxcIiQvZywgJycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKSArICdcXCcnO1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKHNpbXBsZSwgJ3N0cmluZycpO1xuXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnbnVtYmVyJyk7XG5cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnYm9vbGVhbicpO1xuICB9XG4gIC8vIEZvciBzb21lIHJlYXNvbiB0eXBlb2YgbnVsbCBpcyBcIm9iamVjdFwiLCBzbyBzcGVjaWFsIGNhc2UgaGVyZS5cbiAgaWYgKHZhbHVlID09PSBudWxsKSB7XG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCdudWxsJywgJ251bGwnKTtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEVycm9yKHZhbHVlKSB7XG4gIHJldHVybiAnWycgKyBFcnJvci5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSkgKyAnXSc7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cykge1xuICB2YXIgb3V0cHV0ID0gW107XG4gIGZvciAodmFyIGkgPSAwLCBsID0gdmFsdWUubGVuZ3RoOyBpIDwgbDsgKytpKSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgU3RyaW5nKGkpKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBTdHJpbmcoaSksIHRydWUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0cHV0LnB1c2goJycpO1xuICAgIH1cbiAgfVxuICBrZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgaWYgKCFrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIGtleSwgdHJ1ZSkpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvdXRwdXQ7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSkge1xuICB2YXIgbmFtZSwgc3RyO1xuICBpZiAodmFsdWUuX19sb29rdXBHZXR0ZXJfXykge1xuICAgIGlmICh2YWx1ZS5fX2xvb2t1cEdldHRlcl9fKGtleSkpIHtcbiAgICAgIGlmICh2YWx1ZS5fX2xvb2t1cFNldHRlcl9fKGtleSkpIHtcbiAgICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXIvU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAodmFsdWUuX19sb29rdXBTZXR0ZXJfXyhrZXkpKSB7XG4gICAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmICh2aXNpYmxlS2V5cy5pbmRleE9mKGtleSkgPCAwKSB7XG4gICAgbmFtZSA9ICdbJyArIGtleSArICddJztcbiAgfVxuICBpZiAoIXN0cikge1xuICAgIGlmIChjdHguc2Vlbi5pbmRleE9mKHZhbHVlW2tleV0pIDwgMCkge1xuICAgICAgaWYgKHJlY3Vyc2VUaW1lcyA9PT0gbnVsbCkge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIHZhbHVlW2tleV0sIG51bGwpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCB2YWx1ZVtrZXldLCByZWN1cnNlVGltZXMgLSAxKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdHIuaW5kZXhPZignXFxuJykgPiAtMSkge1xuICAgICAgICBpZiAoYXJyYXkpIHtcbiAgICAgICAgICBzdHIgPSBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJykuc3Vic3RyKDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0ciA9ICdcXG4nICsgc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0NpcmN1bGFyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgbmFtZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAoYXJyYXkgJiYga2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgbmFtZSA9IEpTT04uc3RyaW5naWZ5KCcnICsga2V5KTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXlwiKFthLXpBLVpfXVthLXpBLVpfMC05XSopXCIkLykpIHtcbiAgICAgIG5hbWUgPSBuYW1lLnN1YnN0cigxLCBuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICduYW1lJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8oXlwifFwiJCkvZywgXCInXCIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICdzdHJpbmcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmFtZSArICc6ICcgKyBzdHI7XG59XG5cblxuZnVuY3Rpb24gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpIHtcbiAgdmFyIG51bUxpbmVzRXN0ID0gMDtcbiAgdmFyIGxlbmd0aCA9IG91dHB1dC5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3VyKSB7XG4gICAgbnVtTGluZXNFc3QrKztcbiAgICBpZiAoY3VyLmluZGV4T2YoJ1xcbicpID49IDApIG51bUxpbmVzRXN0Kys7XG4gICAgcmV0dXJuIHByZXYgKyBjdXIubGVuZ3RoICsgMTtcbiAgfSwgMCk7XG5cbiAgaWYgKGxlbmd0aCA+IDYwKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArXG4gICAgICAgICAgIChiYXNlID09PSAnJyA/ICcnIDogYmFzZSArICdcXG4gJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBvdXRwdXQuam9pbignLFxcbiAgJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBicmFjZXNbMV07XG4gIH1cblxuICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArICcgJyArIG91dHB1dC5qb2luKCcsICcpICsgJyAnICsgYnJhY2VzWzFdO1xufVxuXG5mdW5jdGlvbiBpc0FycmF5KGFyKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFyKSB8fFxuICAgICAgICAgKHR5cGVvZiBhciA9PT0gJ29iamVjdCcgJiYgb2JqZWN0VG9TdHJpbmcoYXIpID09PSAnW29iamVjdCBBcnJheV0nKTtcbn1cblxuZnVuY3Rpb24gaXNSZWdFeHAocmUpIHtcbiAgcmV0dXJuIHR5cGVvZiByZSA9PT0gJ29iamVjdCcgJiYgb2JqZWN0VG9TdHJpbmcocmUpID09PSAnW29iamVjdCBSZWdFeHBdJztcbn1cblxuZnVuY3Rpb24gaXNEYXRlKGQpIHtcbiAgcmV0dXJuIHR5cGVvZiBkID09PSAnb2JqZWN0JyAmJiBvYmplY3RUb1N0cmluZyhkKSA9PT0gJ1tvYmplY3QgRGF0ZV0nO1xufVxuXG5mdW5jdGlvbiBpc0Vycm9yKGUpIHtcbiAgcmV0dXJuIHR5cGVvZiBlID09PSAnb2JqZWN0JyAmJiBvYmplY3RUb1N0cmluZyhlKSA9PT0gJ1tvYmplY3QgRXJyb3JdJztcbn1cblxuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcobykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pO1xufVxuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL29iakRpc3BsYXkuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogQ2hhaSAtIGZsYWcgdXRpbGl0eVxuICogQ29weXJpZ2h0KGMpIDIwMTItMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qIVxuICogTW9kdWxlIGRlcGVuZGFuY2llc1xuICovXG5cbnZhciBpbnNwZWN0ID0gcmVxdWlyZSgnLi9pbnNwZWN0Jyk7XG52YXIgY29uZmlnID0gcmVxdWlyZSgnLi4vY29uZmlnJyk7XG5cbi8qKlxuICogIyMjIC5vYmpEaXNwbGF5IChvYmplY3QpXG4gKlxuICogRGV0ZXJtaW5lcyBpZiBhbiBvYmplY3Qgb3IgYW4gYXJyYXkgbWF0Y2hlc1xuICogY3JpdGVyaWEgdG8gYmUgaW5zcGVjdGVkIGluLWxpbmUgZm9yIGVycm9yXG4gKiBtZXNzYWdlcyBvciBzaG91bGQgYmUgdHJ1bmNhdGVkLlxuICpcbiAqIEBwYXJhbSB7TWl4ZWR9IGphdmFzY3JpcHQgb2JqZWN0IHRvIGluc3BlY3RcbiAqIEBuYW1lIG9iakRpc3BsYXlcbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciBzdHIgPSBpbnNwZWN0KG9iailcbiAgICAsIHR5cGUgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqKTtcblxuICBpZiAoY29uZmlnLnRydW5jYXRlVGhyZXNob2xkICYmIHN0ci5sZW5ndGggPj0gY29uZmlnLnRydW5jYXRlVGhyZXNob2xkKSB7XG4gICAgaWYgKHR5cGUgPT09ICdbb2JqZWN0IEZ1bmN0aW9uXScpIHtcbiAgICAgIHJldHVybiAhb2JqLm5hbWUgfHwgb2JqLm5hbWUgPT09ICcnXG4gICAgICAgID8gJ1tGdW5jdGlvbl0nXG4gICAgICAgIDogJ1tGdW5jdGlvbjogJyArIG9iai5uYW1lICsgJ10nO1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ1tvYmplY3QgQXJyYXldJykge1xuICAgICAgcmV0dXJuICdbIEFycmF5KCcgKyBvYmoubGVuZ3RoICsgJykgXSc7XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhvYmopXG4gICAgICAgICwga3N0ciA9IGtleXMubGVuZ3RoID4gMlxuICAgICAgICAgID8ga2V5cy5zcGxpY2UoMCwgMikuam9pbignLCAnKSArICcsIC4uLidcbiAgICAgICAgICA6IGtleXMuam9pbignLCAnKTtcbiAgICAgIHJldHVybiAneyBPYmplY3QgKCcgKyBrc3RyICsgJykgfSc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvdXRpbHMvb3ZlcndyaXRlTWV0aG9kLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIENoYWkgLSBvdmVyd3JpdGVNZXRob2QgdXRpbGl0eVxuICogQ29weXJpZ2h0KGMpIDIwMTItMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogIyMjIG92ZXJ3cml0ZU1ldGhvZCAoY3R4LCBuYW1lLCBmbilcbiAqXG4gKiBPdmVyd2l0ZXMgYW4gYWxyZWFkeSBleGlzdGluZyBtZXRob2QgYW5kIHByb3ZpZGVzXG4gKiBhY2Nlc3MgdG8gcHJldmlvdXMgZnVuY3Rpb24uIE11c3QgcmV0dXJuIGZ1bmN0aW9uXG4gKiB0byBiZSB1c2VkIGZvciBuYW1lLlxuICpcbiAqICAgICB1dGlscy5vdmVyd3JpdGVNZXRob2QoY2hhaS5Bc3NlcnRpb24ucHJvdG90eXBlLCAnZXF1YWwnLCBmdW5jdGlvbiAoX3N1cGVyKSB7XG4gKiAgICAgICByZXR1cm4gZnVuY3Rpb24gKHN0cikge1xuICogICAgICAgICB2YXIgb2JqID0gdXRpbHMuZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG4gKiAgICAgICAgIGlmIChvYmogaW5zdGFuY2VvZiBGb28pIHtcbiAqICAgICAgICAgICBuZXcgY2hhaS5Bc3NlcnRpb24ob2JqLnZhbHVlKS50by5lcXVhbChzdHIpO1xuICogICAgICAgICB9IGVsc2Uge1xuICogICAgICAgICAgIF9zdXBlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICogICAgICAgICB9XG4gKiAgICAgICB9XG4gKiAgICAgfSk7XG4gKlxuICogQ2FuIGFsc28gYmUgYWNjZXNzZWQgZGlyZWN0bHkgZnJvbSBgY2hhaS5Bc3NlcnRpb25gLlxuICpcbiAqICAgICBjaGFpLkFzc2VydGlvbi5vdmVyd3JpdGVNZXRob2QoJ2ZvbycsIGZuKTtcbiAqXG4gKiBUaGVuIGNhbiBiZSB1c2VkIGFzIGFueSBvdGhlciBhc3NlcnRpb24uXG4gKlxuICogICAgIGV4cGVjdChteUZvbykudG8uZXF1YWwoJ2JhcicpO1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBjdHggb2JqZWN0IHdob3NlIG1ldGhvZCBpcyB0byBiZSBvdmVyd3JpdHRlblxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgb2YgbWV0aG9kIHRvIG92ZXJ3cml0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gbWV0aG9kIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhIGZ1bmN0aW9uIHRvIGJlIHVzZWQgZm9yIG5hbWVcbiAqIEBuYW1lIG92ZXJ3cml0ZU1ldGhvZFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjdHgsIG5hbWUsIG1ldGhvZCkge1xuICB2YXIgX21ldGhvZCA9IGN0eFtuYW1lXVxuICAgICwgX3N1cGVyID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpczsgfTtcblxuICBpZiAoX21ldGhvZCAmJiAnZnVuY3Rpb24nID09PSB0eXBlb2YgX21ldGhvZClcbiAgICBfc3VwZXIgPSBfbWV0aG9kO1xuXG4gIGN0eFtuYW1lXSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcmVzdWx0ID0gbWV0aG9kKF9zdXBlcikuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICByZXR1cm4gcmVzdWx0ID09PSB1bmRlZmluZWQgPyB0aGlzIDogcmVzdWx0O1xuICB9XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL292ZXJ3cml0ZVByb3BlcnR5LmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIENoYWkgLSBvdmVyd3JpdGVQcm9wZXJ0eSB1dGlsaXR5XG4gKiBDb3B5cmlnaHQoYykgMjAxMi0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyoqXG4gKiAjIyMgb3ZlcndyaXRlUHJvcGVydHkgKGN0eCwgbmFtZSwgZm4pXG4gKlxuICogT3ZlcndpdGVzIGFuIGFscmVhZHkgZXhpc3RpbmcgcHJvcGVydHkgZ2V0dGVyIGFuZCBwcm92aWRlc1xuICogYWNjZXNzIHRvIHByZXZpb3VzIHZhbHVlLiBNdXN0IHJldHVybiBmdW5jdGlvbiB0byB1c2UgYXMgZ2V0dGVyLlxuICpcbiAqICAgICB1dGlscy5vdmVyd3JpdGVQcm9wZXJ0eShjaGFpLkFzc2VydGlvbi5wcm90b3R5cGUsICdvaycsIGZ1bmN0aW9uIChfc3VwZXIpIHtcbiAqICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gKiAgICAgICAgIHZhciBvYmogPSB1dGlscy5mbGFnKHRoaXMsICdvYmplY3QnKTtcbiAqICAgICAgICAgaWYgKG9iaiBpbnN0YW5jZW9mIEZvbykge1xuICogICAgICAgICAgIG5ldyBjaGFpLkFzc2VydGlvbihvYmoubmFtZSkudG8uZXF1YWwoJ2JhcicpO1xuICogICAgICAgICB9IGVsc2Uge1xuICogICAgICAgICAgIF9zdXBlci5jYWxsKHRoaXMpO1xuICogICAgICAgICB9XG4gKiAgICAgICB9XG4gKiAgICAgfSk7XG4gKlxuICpcbiAqIENhbiBhbHNvIGJlIGFjY2Vzc2VkIGRpcmVjdGx5IGZyb20gYGNoYWkuQXNzZXJ0aW9uYC5cbiAqXG4gKiAgICAgY2hhaS5Bc3NlcnRpb24ub3ZlcndyaXRlUHJvcGVydHkoJ2ZvbycsIGZuKTtcbiAqXG4gKiBUaGVuIGNhbiBiZSB1c2VkIGFzIGFueSBvdGhlciBhc3NlcnRpb24uXG4gKlxuICogICAgIGV4cGVjdChteUZvbykudG8uYmUub2s7XG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGN0eCBvYmplY3Qgd2hvc2UgcHJvcGVydHkgaXMgdG8gYmUgb3ZlcndyaXR0ZW5cbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIG9mIHByb3BlcnR5IHRvIG92ZXJ3cml0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZ2V0dGVyIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhIGdldHRlciBmdW5jdGlvbiB0byBiZSB1c2VkIGZvciBuYW1lXG4gKiBAbmFtZSBvdmVyd3JpdGVQcm9wZXJ0eVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjdHgsIG5hbWUsIGdldHRlcikge1xuICB2YXIgX2dldCA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoY3R4LCBuYW1lKVxuICAgICwgX3N1cGVyID0gZnVuY3Rpb24gKCkge307XG5cbiAgaWYgKF9nZXQgJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIF9nZXQuZ2V0KVxuICAgIF9zdXBlciA9IF9nZXQuZ2V0XG5cbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KGN0eCwgbmFtZSxcbiAgICB7IGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gZ2V0dGVyKF9zdXBlcikuY2FsbCh0aGlzKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdCA9PT0gdW5kZWZpbmVkID8gdGhpcyA6IHJlc3VsdDtcbiAgICAgIH1cbiAgICAsIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICB9KTtcbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvdXRpbHMvb3ZlcndyaXRlQ2hhaW5hYmxlTWV0aG9kLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIENoYWkgLSBvdmVyd3JpdGVDaGFpbmFibGVNZXRob2QgdXRpbGl0eVxuICogQ29weXJpZ2h0KGMpIDIwMTItMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogIyMjIG92ZXJ3cml0ZUNoYWluYWJsZU1ldGhvZCAoY3R4LCBuYW1lLCBmbilcbiAqXG4gKiBPdmVyd2l0ZXMgYW4gYWxyZWFkeSBleGlzdGluZyBjaGFpbmFibGUgbWV0aG9kXG4gKiBhbmQgcHJvdmlkZXMgYWNjZXNzIHRvIHRoZSBwcmV2aW91cyBmdW5jdGlvbiBvclxuICogcHJvcGVydHkuICBNdXN0IHJldHVybiBmdW5jdGlvbnMgdG8gYmUgdXNlZCBmb3JcbiAqIG5hbWUuXG4gKlxuICogICAgIHV0aWxzLm92ZXJ3cml0ZUNoYWluYWJsZU1ldGhvZChjaGFpLkFzc2VydGlvbi5wcm90b3R5cGUsICdsZW5ndGgnLFxuICogICAgICAgZnVuY3Rpb24gKF9zdXBlcikge1xuICogICAgICAgfVxuICogICAgICwgZnVuY3Rpb24gKF9zdXBlcikge1xuICogICAgICAgfVxuICogICAgICk7XG4gKlxuICogQ2FuIGFsc28gYmUgYWNjZXNzZWQgZGlyZWN0bHkgZnJvbSBgY2hhaS5Bc3NlcnRpb25gLlxuICpcbiAqICAgICBjaGFpLkFzc2VydGlvbi5vdmVyd3JpdGVDaGFpbmFibGVNZXRob2QoJ2ZvbycsIGZuLCBmbik7XG4gKlxuICogVGhlbiBjYW4gYmUgdXNlZCBhcyBhbnkgb3RoZXIgYXNzZXJ0aW9uLlxuICpcbiAqICAgICBleHBlY3QobXlGb28pLnRvLmhhdmUubGVuZ3RoKDMpO1xuICogICAgIGV4cGVjdChteUZvbykudG8uaGF2ZS5sZW5ndGguYWJvdmUoMyk7XG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGN0eCBvYmplY3Qgd2hvc2UgbWV0aG9kIC8gcHJvcGVydHkgaXMgdG8gYmUgb3ZlcndyaXR0ZW5cbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIG9mIG1ldGhvZCAvIHByb3BlcnR5IHRvIG92ZXJ3cml0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gbWV0aG9kIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhIGZ1bmN0aW9uIHRvIGJlIHVzZWQgZm9yIG5hbWVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNoYWluaW5nQmVoYXZpb3IgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGEgZnVuY3Rpb24gdG8gYmUgdXNlZCBmb3IgcHJvcGVydHlcbiAqIEBuYW1lIG92ZXJ3cml0ZUNoYWluYWJsZU1ldGhvZFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjdHgsIG5hbWUsIG1ldGhvZCwgY2hhaW5pbmdCZWhhdmlvcikge1xuICB2YXIgY2hhaW5hYmxlQmVoYXZpb3IgPSBjdHguX19tZXRob2RzW25hbWVdO1xuXG4gIHZhciBfY2hhaW5pbmdCZWhhdmlvciA9IGNoYWluYWJsZUJlaGF2aW9yLmNoYWluaW5nQmVoYXZpb3I7XG4gIGNoYWluYWJsZUJlaGF2aW9yLmNoYWluaW5nQmVoYXZpb3IgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHJlc3VsdCA9IGNoYWluaW5nQmVoYXZpb3IoX2NoYWluaW5nQmVoYXZpb3IpLmNhbGwodGhpcyk7XG4gICAgcmV0dXJuIHJlc3VsdCA9PT0gdW5kZWZpbmVkID8gdGhpcyA6IHJlc3VsdDtcbiAgfTtcblxuICB2YXIgX21ldGhvZCA9IGNoYWluYWJsZUJlaGF2aW9yLm1ldGhvZDtcbiAgY2hhaW5hYmxlQmVoYXZpb3IubWV0aG9kID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciByZXN1bHQgPSBtZXRob2QoX21ldGhvZCkuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICByZXR1cm4gcmVzdWx0ID09PSB1bmRlZmluZWQgPyB0aGlzIDogcmVzdWx0O1xuICB9O1xufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS91dGlscy90ZXN0LmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIENoYWkgLSB0ZXN0IHV0aWxpdHlcbiAqIENvcHlyaWdodChjKSAyMDEyLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKiFcbiAqIE1vZHVsZSBkZXBlbmRhbmNpZXNcbiAqL1xuXG52YXIgZmxhZyA9IHJlcXVpcmUoJy4vZmxhZycpO1xuXG4vKipcbiAqICMgdGVzdChvYmplY3QsIGV4cHJlc3Npb24pXG4gKlxuICogVGVzdCBhbmQgb2JqZWN0IGZvciBleHByZXNzaW9uLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgKGNvbnN0cnVjdGVkIEFzc2VydGlvbilcbiAqIEBwYXJhbSB7QXJndW1lbnRzfSBjaGFpLkFzc2VydGlvbi5wcm90b3R5cGUuYXNzZXJ0IGFyZ3VtZW50c1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaiwgYXJncykge1xuICB2YXIgbmVnYXRlID0gZmxhZyhvYmosICduZWdhdGUnKVxuICAgICwgZXhwciA9IGFyZ3NbMF07XG4gIHJldHVybiBuZWdhdGUgPyAhZXhwciA6IGV4cHI7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL3RyYW5zZmVyRmxhZ3MuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogQ2hhaSAtIHRyYW5zZmVyRmxhZ3MgdXRpbGl0eVxuICogQ29weXJpZ2h0KGMpIDIwMTItMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogIyMjIHRyYW5zZmVyRmxhZ3MoYXNzZXJ0aW9uLCBvYmplY3QsIGluY2x1ZGVBbGwgPSB0cnVlKVxuICpcbiAqIFRyYW5zZmVyIGFsbCB0aGUgZmxhZ3MgZm9yIGBhc3NlcnRpb25gIHRvIGBvYmplY3RgLiBJZlxuICogYGluY2x1ZGVBbGxgIGlzIHNldCB0byBgZmFsc2VgLCB0aGVuIHRoZSBiYXNlIENoYWlcbiAqIGFzc2VydGlvbiBmbGFncyAobmFtZWx5IGBvYmplY3RgLCBgc3NmaWAsIGFuZCBgbWVzc2FnZWApXG4gKiB3aWxsIG5vdCBiZSB0cmFuc2ZlcnJlZC5cbiAqXG4gKlxuICogICAgIHZhciBuZXdBc3NlcnRpb24gPSBuZXcgQXNzZXJ0aW9uKCk7XG4gKiAgICAgdXRpbHMudHJhbnNmZXJGbGFncyhhc3NlcnRpb24sIG5ld0Fzc2VydGlvbik7XG4gKlxuICogICAgIHZhciBhbm90aGVyQXNzZXJpdG9uID0gbmV3IEFzc2VydGlvbihteU9iaik7XG4gKiAgICAgdXRpbHMudHJhbnNmZXJGbGFncyhhc3NlcnRpb24sIGFub3RoZXJBc3NlcnRpb24sIGZhbHNlKTtcbiAqXG4gKiBAcGFyYW0ge0Fzc2VydGlvbn0gYXNzZXJ0aW9uIHRoZSBhc3NlcnRpb24gdG8gdHJhbnNmZXIgdGhlIGZsYWdzIGZyb21cbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgdGhlIG9iamVjdCB0byB0cmFuc2ZlciB0aGUgZmxhZ3MgdG9vOyB1c3VhbGx5IGEgbmV3IGFzc2VydGlvblxuICogQHBhcmFtIHtCb29sZWFufSBpbmNsdWRlQWxsXG4gKiBAbmFtZSBnZXRBbGxGbGFnc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoYXNzZXJ0aW9uLCBvYmplY3QsIGluY2x1ZGVBbGwpIHtcbiAgdmFyIGZsYWdzID0gYXNzZXJ0aW9uLl9fZmxhZ3MgfHwgKGFzc2VydGlvbi5fX2ZsYWdzID0gT2JqZWN0LmNyZWF0ZShudWxsKSk7XG5cbiAgaWYgKCFvYmplY3QuX19mbGFncykge1xuICAgIG9iamVjdC5fX2ZsYWdzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgfVxuXG4gIGluY2x1ZGVBbGwgPSBhcmd1bWVudHMubGVuZ3RoID09PSAzID8gaW5jbHVkZUFsbCA6IHRydWU7XG5cbiAgZm9yICh2YXIgZmxhZyBpbiBmbGFncykge1xuICAgIGlmIChpbmNsdWRlQWxsIHx8XG4gICAgICAgIChmbGFnICE9PSAnb2JqZWN0JyAmJiBmbGFnICE9PSAnc3NmaScgJiYgZmxhZyAhPSAnbWVzc2FnZScpKSB7XG4gICAgICBvYmplY3QuX19mbGFnc1tmbGFnXSA9IGZsYWdzW2ZsYWddO1xuICAgIH1cbiAgfVxufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS91dGlscy90eXBlLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIENoYWkgLSB0eXBlIHV0aWxpdHlcbiAqIENvcHlyaWdodChjKSAyMDEyLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKiFcbiAqIERldGVjdGFibGUgamF2YXNjcmlwdCBuYXRpdmVzXG4gKi9cblxudmFyIG5hdGl2ZXMgPSB7XG4gICAgJ1tvYmplY3QgQXJndW1lbnRzXSc6ICdhcmd1bWVudHMnXG4gICwgJ1tvYmplY3QgQXJyYXldJzogJ2FycmF5J1xuICAsICdbb2JqZWN0IERhdGVdJzogJ2RhdGUnXG4gICwgJ1tvYmplY3QgRnVuY3Rpb25dJzogJ2Z1bmN0aW9uJ1xuICAsICdbb2JqZWN0IE51bWJlcl0nOiAnbnVtYmVyJ1xuICAsICdbb2JqZWN0IFJlZ0V4cF0nOiAncmVnZXhwJ1xuICAsICdbb2JqZWN0IFN0cmluZ10nOiAnc3RyaW5nJ1xufTtcblxuLyoqXG4gKiAjIyMgdHlwZShvYmplY3QpXG4gKlxuICogQmV0dGVyIGltcGxlbWVudGF0aW9uIG9mIGB0eXBlb2ZgIGRldGVjdGlvbiB0aGF0IGNhblxuICogYmUgdXNlZCBjcm9zcy1icm93c2VyLiBIYW5kbGVzIHRoZSBpbmNvbnNpc3RlbmNpZXMgb2ZcbiAqIEFycmF5LCBgbnVsbGAsIGFuZCBgdW5kZWZpbmVkYCBkZXRlY3Rpb24uXG4gKlxuICogICAgIHV0aWxzLnR5cGUoe30pIC8vICdvYmplY3QnXG4gKiAgICAgdXRpbHMudHlwZShudWxsKSAvLyBgbnVsbCdcbiAqICAgICB1dGlscy50eXBlKHVuZGVmaW5lZCkgLy8gYHVuZGVmaW5lZGBcbiAqICAgICB1dGlscy50eXBlKFtdKSAvLyBgYXJyYXlgXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gb2JqZWN0IHRvIGRldGVjdCB0eXBlIG9mXG4gKiBAbmFtZSB0eXBlXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgdmFyIHN0ciA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmopO1xuICBpZiAobmF0aXZlc1tzdHJdKSByZXR1cm4gbmF0aXZlc1tzdHJdO1xuICBpZiAob2JqID09PSBudWxsKSByZXR1cm4gJ251bGwnO1xuICBpZiAob2JqID09PSB1bmRlZmluZWQpIHJldHVybiAndW5kZWZpbmVkJztcbiAgaWYgKG9iaiA9PT0gT2JqZWN0KG9iaikpIHJldHVybiAnb2JqZWN0JztcbiAgcmV0dXJuIHR5cGVvZiBvYmo7XG59O1xuXG59KTtcblxuXG5cblxucmVxdWlyZS5hbGlhcyhcImNoYWlqcy1hc3NlcnRpb24tZXJyb3IvaW5kZXguanNcIiwgXCJjaGFpL2RlcHMvYXNzZXJ0aW9uLWVycm9yL2luZGV4LmpzXCIpO1xucmVxdWlyZS5hbGlhcyhcImNoYWlqcy1hc3NlcnRpb24tZXJyb3IvaW5kZXguanNcIiwgXCJjaGFpL2RlcHMvYXNzZXJ0aW9uLWVycm9yL2luZGV4LmpzXCIpO1xucmVxdWlyZS5hbGlhcyhcImNoYWlqcy1hc3NlcnRpb24tZXJyb3IvaW5kZXguanNcIiwgXCJhc3NlcnRpb24tZXJyb3IvaW5kZXguanNcIik7XG5yZXF1aXJlLmFsaWFzKFwiY2hhaWpzLWFzc2VydGlvbi1lcnJvci9pbmRleC5qc1wiLCBcImNoYWlqcy1hc3NlcnRpb24tZXJyb3IvaW5kZXguanNcIik7XG5yZXF1aXJlLmFsaWFzKFwiY2hhaWpzLWRlZXAtZXFsL2xpYi9lcWwuanNcIiwgXCJjaGFpL2RlcHMvZGVlcC1lcWwvbGliL2VxbC5qc1wiKTtcbnJlcXVpcmUuYWxpYXMoXCJjaGFpanMtZGVlcC1lcWwvbGliL2VxbC5qc1wiLCBcImNoYWkvZGVwcy9kZWVwLWVxbC9pbmRleC5qc1wiKTtcbnJlcXVpcmUuYWxpYXMoXCJjaGFpanMtZGVlcC1lcWwvbGliL2VxbC5qc1wiLCBcImRlZXAtZXFsL2luZGV4LmpzXCIpO1xucmVxdWlyZS5hbGlhcyhcImNoYWlqcy10eXBlLWRldGVjdC9saWIvdHlwZS5qc1wiLCBcImNoYWlqcy1kZWVwLWVxbC9kZXBzL3R5cGUtZGV0ZWN0L2xpYi90eXBlLmpzXCIpO1xucmVxdWlyZS5hbGlhcyhcImNoYWlqcy10eXBlLWRldGVjdC9saWIvdHlwZS5qc1wiLCBcImNoYWlqcy1kZWVwLWVxbC9kZXBzL3R5cGUtZGV0ZWN0L2luZGV4LmpzXCIpO1xucmVxdWlyZS5hbGlhcyhcImNoYWlqcy10eXBlLWRldGVjdC9saWIvdHlwZS5qc1wiLCBcImNoYWlqcy10eXBlLWRldGVjdC9pbmRleC5qc1wiKTtcbnJlcXVpcmUuYWxpYXMoXCJjaGFpanMtZGVlcC1lcWwvbGliL2VxbC5qc1wiLCBcImNoYWlqcy1kZWVwLWVxbC9pbmRleC5qc1wiKTtcbnJlcXVpcmUuYWxpYXMoXCJjaGFpL2luZGV4LmpzXCIsIFwiY2hhaS9pbmRleC5qc1wiKTtpZiAodHlwZW9mIGV4cG9ydHMgPT0gXCJvYmplY3RcIikge1xuICBtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJjaGFpXCIpO1xufSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kKSB7XG4gIGRlZmluZShbXSwgZnVuY3Rpb24oKXsgcmV0dXJuIHJlcXVpcmUoXCJjaGFpXCIpOyB9KTtcbn0gZWxzZSB7XG4gIHRoaXNbXCJjaGFpXCJdID0gcmVxdWlyZShcImNoYWlcIik7XG59fSkoKTsiLCIvKiFcbiAqIGFzeW5jXG4gKiBodHRwczovL2dpdGh1Yi5jb20vY2FvbGFuL2FzeW5jXG4gKlxuICogQ29weXJpZ2h0IDIwMTAtMjAxNCBDYW9sYW4gTWNNYWhvblxuICogUmVsZWFzZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlXG4gKi9cbi8qanNoaW50IG9uZXZhcjogZmFsc2UsIGluZGVudDo0ICovXG4vKmdsb2JhbCBzZXRJbW1lZGlhdGU6IGZhbHNlLCBzZXRUaW1lb3V0OiBmYWxzZSwgY29uc29sZTogZmFsc2UgKi9cbihmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgYXN5bmMgPSB7fTtcblxuICAgIC8vIGdsb2JhbCBvbiB0aGUgc2VydmVyLCB3aW5kb3cgaW4gdGhlIGJyb3dzZXJcbiAgICB2YXIgcm9vdCwgcHJldmlvdXNfYXN5bmM7XG5cbiAgICByb290ID0gdGhpcztcbiAgICBpZiAocm9vdCAhPSBudWxsKSB7XG4gICAgICBwcmV2aW91c19hc3luYyA9IHJvb3QuYXN5bmM7XG4gICAgfVxuXG4gICAgYXN5bmMubm9Db25mbGljdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcm9vdC5hc3luYyA9IHByZXZpb3VzX2FzeW5jO1xuICAgICAgICByZXR1cm4gYXN5bmM7XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIG9ubHlfb25jZShmbikge1xuICAgICAgICB2YXIgY2FsbGVkID0gZmFsc2U7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChjYWxsZWQpIHRocm93IG5ldyBFcnJvcihcIkNhbGxiYWNrIHdhcyBhbHJlYWR5IGNhbGxlZC5cIik7XG4gICAgICAgICAgICBjYWxsZWQgPSB0cnVlO1xuICAgICAgICAgICAgZm4uYXBwbHkocm9vdCwgYXJndW1lbnRzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vLy8gY3Jvc3MtYnJvd3NlciBjb21wYXRpYmxpdHkgZnVuY3Rpb25zIC8vLy9cblxuICAgIHZhciBfdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nO1xuXG4gICAgdmFyIF9pc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAob2JqKSB7XG4gICAgICAgIHJldHVybiBfdG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgIH07XG5cbiAgICB2YXIgX2VhY2ggPSBmdW5jdGlvbiAoYXJyLCBpdGVyYXRvcikge1xuICAgICAgICBpZiAoYXJyLmZvckVhY2gpIHtcbiAgICAgICAgICAgIHJldHVybiBhcnIuZm9yRWFjaChpdGVyYXRvcik7XG4gICAgICAgIH1cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKGFycltpXSwgaSwgYXJyKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICB2YXIgX21hcCA9IGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yKSB7XG4gICAgICAgIGlmIChhcnIubWFwKSB7XG4gICAgICAgICAgICByZXR1cm4gYXJyLm1hcChpdGVyYXRvcik7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICAgICAgX2VhY2goYXJyLCBmdW5jdGlvbiAoeCwgaSwgYSkge1xuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKGl0ZXJhdG9yKHgsIGksIGEpKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH07XG5cbiAgICB2YXIgX3JlZHVjZSA9IGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yLCBtZW1vKSB7XG4gICAgICAgIGlmIChhcnIucmVkdWNlKSB7XG4gICAgICAgICAgICByZXR1cm4gYXJyLnJlZHVjZShpdGVyYXRvciwgbWVtbyk7XG4gICAgICAgIH1cbiAgICAgICAgX2VhY2goYXJyLCBmdW5jdGlvbiAoeCwgaSwgYSkge1xuICAgICAgICAgICAgbWVtbyA9IGl0ZXJhdG9yKG1lbW8sIHgsIGksIGEpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgfTtcblxuICAgIHZhciBfa2V5cyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKSB7XG4gICAgICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMob2JqKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIga2V5cyA9IFtdO1xuICAgICAgICBmb3IgKHZhciBrIGluIG9iaikge1xuICAgICAgICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShrKSkge1xuICAgICAgICAgICAgICAgIGtleXMucHVzaChrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ga2V5cztcbiAgICB9O1xuXG4gICAgLy8vLyBleHBvcnRlZCBhc3luYyBtb2R1bGUgZnVuY3Rpb25zIC8vLy9cblxuICAgIC8vLy8gbmV4dFRpY2sgaW1wbGVtZW50YXRpb24gd2l0aCBicm93c2VyLWNvbXBhdGlibGUgZmFsbGJhY2sgLy8vL1xuICAgIGlmICh0eXBlb2YgcHJvY2VzcyA9PT0gJ3VuZGVmaW5lZCcgfHwgIShwcm9jZXNzLm5leHRUaWNrKSkge1xuICAgICAgICBpZiAodHlwZW9mIHNldEltbWVkaWF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgYXN5bmMubmV4dFRpY2sgPSBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgICAgICAgICAvLyBub3QgYSBkaXJlY3QgYWxpYXMgZm9yIElFMTAgY29tcGF0aWJpbGl0eVxuICAgICAgICAgICAgICAgIHNldEltbWVkaWF0ZShmbik7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlID0gYXN5bmMubmV4dFRpY2s7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBhc3luYy5uZXh0VGljayA9IGZ1bmN0aW9uIChmbikge1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZSA9IGFzeW5jLm5leHRUaWNrO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBhc3luYy5uZXh0VGljayA9IHByb2Nlc3MubmV4dFRpY2s7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0SW1tZWRpYXRlICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlID0gZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgICAgICAgIC8vIG5vdCBhIGRpcmVjdCBhbGlhcyBmb3IgSUUxMCBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgICAgIHNldEltbWVkaWF0ZShmbik7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlID0gYXN5bmMubmV4dFRpY2s7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhc3luYy5lYWNoID0gZnVuY3Rpb24gKGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgIGlmICghYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNvbXBsZXRlZCA9IDA7XG4gICAgICAgIF9lYWNoKGFyciwgZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgsIG9ubHlfb25jZShkb25lKSApO1xuICAgICAgICB9KTtcbiAgICAgICAgZnVuY3Rpb24gZG9uZShlcnIpIHtcbiAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgfVxuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICBjb21wbGV0ZWQgKz0gMTtcbiAgICAgICAgICAgICAgaWYgKGNvbXBsZXRlZCA+PSBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICBhc3luYy5mb3JFYWNoID0gYXN5bmMuZWFjaDtcblxuICAgIGFzeW5jLmVhY2hTZXJpZXMgPSBmdW5jdGlvbiAoYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgaWYgKCFhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgY29tcGxldGVkID0gMDtcbiAgICAgICAgdmFyIGl0ZXJhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpdGVyYXRvcihhcnJbY29tcGxldGVkXSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBsZXRlZCArPSAxO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcGxldGVkID49IGFyci5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVyYXRlKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcbiAgICAgICAgaXRlcmF0ZSgpO1xuICAgIH07XG4gICAgYXN5bmMuZm9yRWFjaFNlcmllcyA9IGFzeW5jLmVhY2hTZXJpZXM7XG5cbiAgICBhc3luYy5lYWNoTGltaXQgPSBmdW5jdGlvbiAoYXJyLCBsaW1pdCwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBmbiA9IF9lYWNoTGltaXQobGltaXQpO1xuICAgICAgICBmbi5hcHBseShudWxsLCBbYXJyLCBpdGVyYXRvciwgY2FsbGJhY2tdKTtcbiAgICB9O1xuICAgIGFzeW5jLmZvckVhY2hMaW1pdCA9IGFzeW5jLmVhY2hMaW1pdDtcblxuICAgIHZhciBfZWFjaExpbWl0ID0gZnVuY3Rpb24gKGxpbWl0KSB7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgICAgIGlmICghYXJyLmxlbmd0aCB8fCBsaW1pdCA8PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgY29tcGxldGVkID0gMDtcbiAgICAgICAgICAgIHZhciBzdGFydGVkID0gMDtcbiAgICAgICAgICAgIHZhciBydW5uaW5nID0gMDtcblxuICAgICAgICAgICAgKGZ1bmN0aW9uIHJlcGxlbmlzaCAoKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNvbXBsZXRlZCA+PSBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHdoaWxlIChydW5uaW5nIDwgbGltaXQgJiYgc3RhcnRlZCA8IGFyci5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhcnRlZCArPSAxO1xuICAgICAgICAgICAgICAgICAgICBydW5uaW5nICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yKGFycltzdGFydGVkIC0gMV0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21wbGV0ZWQgKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBydW5uaW5nIC09IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBsZXRlZCA+PSBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBsZW5pc2goKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pKCk7XG4gICAgICAgIH07XG4gICAgfTtcblxuXG4gICAgdmFyIGRvUGFyYWxsZWwgPSBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgICAgIHJldHVybiBmbi5hcHBseShudWxsLCBbYXN5bmMuZWFjaF0uY29uY2F0KGFyZ3MpKTtcbiAgICAgICAgfTtcbiAgICB9O1xuICAgIHZhciBkb1BhcmFsbGVsTGltaXQgPSBmdW5jdGlvbihsaW1pdCwgZm4pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgICAgIHJldHVybiBmbi5hcHBseShudWxsLCBbX2VhY2hMaW1pdChsaW1pdCldLmNvbmNhdChhcmdzKSk7XG4gICAgICAgIH07XG4gICAgfTtcbiAgICB2YXIgZG9TZXJpZXMgPSBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgICAgIHJldHVybiBmbi5hcHBseShudWxsLCBbYXN5bmMuZWFjaFNlcmllc10uY29uY2F0KGFyZ3MpKTtcbiAgICAgICAgfTtcbiAgICB9O1xuXG5cbiAgICB2YXIgX2FzeW5jTWFwID0gZnVuY3Rpb24gKGVhY2hmbiwgYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgYXJyID0gX21hcChhcnIsIGZ1bmN0aW9uICh4LCBpKSB7XG4gICAgICAgICAgICByZXR1cm4ge2luZGV4OiBpLCB2YWx1ZTogeH07XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoIWNhbGxiYWNrKSB7XG4gICAgICAgICAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBpdGVyYXRvcih4LnZhbHVlLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciByZXN1bHRzID0gW107XG4gICAgICAgICAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBpdGVyYXRvcih4LnZhbHVlLCBmdW5jdGlvbiAoZXJyLCB2KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHNbeC5pbmRleF0gPSB2O1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgYXN5bmMubWFwID0gZG9QYXJhbGxlbChfYXN5bmNNYXApO1xuICAgIGFzeW5jLm1hcFNlcmllcyA9IGRvU2VyaWVzKF9hc3luY01hcCk7XG4gICAgYXN5bmMubWFwTGltaXQgPSBmdW5jdGlvbiAoYXJyLCBsaW1pdCwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiBfbWFwTGltaXQobGltaXQpKGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgdmFyIF9tYXBMaW1pdCA9IGZ1bmN0aW9uKGxpbWl0KSB7XG4gICAgICAgIHJldHVybiBkb1BhcmFsbGVsTGltaXQobGltaXQsIF9hc3luY01hcCk7XG4gICAgfTtcblxuICAgIC8vIHJlZHVjZSBvbmx5IGhhcyBhIHNlcmllcyB2ZXJzaW9uLCBhcyBkb2luZyByZWR1Y2UgaW4gcGFyYWxsZWwgd29uJ3RcbiAgICAvLyB3b3JrIGluIG1hbnkgc2l0dWF0aW9ucy5cbiAgICBhc3luYy5yZWR1Y2UgPSBmdW5jdGlvbiAoYXJyLCBtZW1vLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgYXN5bmMuZWFjaFNlcmllcyhhcnIsIGZ1bmN0aW9uICh4LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaXRlcmF0b3IobWVtbywgeCwgZnVuY3Rpb24gKGVyciwgdikge1xuICAgICAgICAgICAgICAgIG1lbW8gPSB2O1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyLCBtZW1vKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvLyBpbmplY3QgYWxpYXNcbiAgICBhc3luYy5pbmplY3QgPSBhc3luYy5yZWR1Y2U7XG4gICAgLy8gZm9sZGwgYWxpYXNcbiAgICBhc3luYy5mb2xkbCA9IGFzeW5jLnJlZHVjZTtcblxuICAgIGFzeW5jLnJlZHVjZVJpZ2h0ID0gZnVuY3Rpb24gKGFyciwgbWVtbywgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciByZXZlcnNlZCA9IF9tYXAoYXJyLCBmdW5jdGlvbiAoeCkge1xuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH0pLnJldmVyc2UoKTtcbiAgICAgICAgYXN5bmMucmVkdWNlKHJldmVyc2VkLCBtZW1vLCBpdGVyYXRvciwgY2FsbGJhY2spO1xuICAgIH07XG4gICAgLy8gZm9sZHIgYWxpYXNcbiAgICBhc3luYy5mb2xkciA9IGFzeW5jLnJlZHVjZVJpZ2h0O1xuXG4gICAgdmFyIF9maWx0ZXIgPSBmdW5jdGlvbiAoZWFjaGZuLCBhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgICAgICBhcnIgPSBfbWFwKGFyciwgZnVuY3Rpb24gKHgsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiB7aW5kZXg6IGksIHZhbHVlOiB4fTtcbiAgICAgICAgfSk7XG4gICAgICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uICh4LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaXRlcmF0b3IoeC52YWx1ZSwgZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgICAgICBpZiAodikge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goeCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgY2FsbGJhY2soX21hcChyZXN1bHRzLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYS5pbmRleCAtIGIuaW5kZXg7XG4gICAgICAgICAgICB9KSwgZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geC52YWx1ZTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICBhc3luYy5maWx0ZXIgPSBkb1BhcmFsbGVsKF9maWx0ZXIpO1xuICAgIGFzeW5jLmZpbHRlclNlcmllcyA9IGRvU2VyaWVzKF9maWx0ZXIpO1xuICAgIC8vIHNlbGVjdCBhbGlhc1xuICAgIGFzeW5jLnNlbGVjdCA9IGFzeW5jLmZpbHRlcjtcbiAgICBhc3luYy5zZWxlY3RTZXJpZXMgPSBhc3luYy5maWx0ZXJTZXJpZXM7XG5cbiAgICB2YXIgX3JlamVjdCA9IGZ1bmN0aW9uIChlYWNoZm4sIGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciByZXN1bHRzID0gW107XG4gICAgICAgIGFyciA9IF9tYXAoYXJyLCBmdW5jdGlvbiAoeCwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIHtpbmRleDogaSwgdmFsdWU6IHh9O1xuICAgICAgICB9KTtcbiAgICAgICAgZWFjaGZuKGFyciwgZnVuY3Rpb24gKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcih4LnZhbHVlLCBmdW5jdGlvbiAodikge1xuICAgICAgICAgICAgICAgIGlmICghdikge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goeCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgY2FsbGJhY2soX21hcChyZXN1bHRzLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYS5pbmRleCAtIGIuaW5kZXg7XG4gICAgICAgICAgICB9KSwgZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geC52YWx1ZTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICBhc3luYy5yZWplY3QgPSBkb1BhcmFsbGVsKF9yZWplY3QpO1xuICAgIGFzeW5jLnJlamVjdFNlcmllcyA9IGRvU2VyaWVzKF9yZWplY3QpO1xuXG4gICAgdmFyIF9kZXRlY3QgPSBmdW5jdGlvbiAoZWFjaGZuLCBhcnIsIGl0ZXJhdG9yLCBtYWluX2NhbGxiYWNrKSB7XG4gICAgICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uICh4LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaXRlcmF0b3IoeCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgbWFpbl9jYWxsYmFjayh4KTtcbiAgICAgICAgICAgICAgICAgICAgbWFpbl9jYWxsYmFjayA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgbWFpbl9jYWxsYmFjaygpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIGFzeW5jLmRldGVjdCA9IGRvUGFyYWxsZWwoX2RldGVjdCk7XG4gICAgYXN5bmMuZGV0ZWN0U2VyaWVzID0gZG9TZXJpZXMoX2RldGVjdCk7XG5cbiAgICBhc3luYy5zb21lID0gZnVuY3Rpb24gKGFyciwgaXRlcmF0b3IsIG1haW5fY2FsbGJhY2spIHtcbiAgICAgICAgYXN5bmMuZWFjaChhcnIsIGZ1bmN0aW9uICh4LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaXRlcmF0b3IoeCwgZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgICAgICBpZiAodikge1xuICAgICAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgbWFpbl9jYWxsYmFjayhmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgLy8gYW55IGFsaWFzXG4gICAgYXN5bmMuYW55ID0gYXN5bmMuc29tZTtcblxuICAgIGFzeW5jLmV2ZXJ5ID0gZnVuY3Rpb24gKGFyciwgaXRlcmF0b3IsIG1haW5fY2FsbGJhY2spIHtcbiAgICAgICAgYXN5bmMuZWFjaChhcnIsIGZ1bmN0aW9uICh4LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaXRlcmF0b3IoeCwgZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXYpIHtcbiAgICAgICAgICAgICAgICAgICAgbWFpbl9jYWxsYmFjayhmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBtYWluX2NhbGxiYWNrKHRydWUpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIC8vIGFsbCBhbGlhc1xuICAgIGFzeW5jLmFsbCA9IGFzeW5jLmV2ZXJ5O1xuXG4gICAgYXN5bmMuc29ydEJ5ID0gZnVuY3Rpb24gKGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIGFzeW5jLm1hcChhcnIsIGZ1bmN0aW9uICh4LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaXRlcmF0b3IoeCwgZnVuY3Rpb24gKGVyciwgY3JpdGVyaWEpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCB7dmFsdWU6IHgsIGNyaXRlcmlhOiBjcml0ZXJpYX0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgZm4gPSBmdW5jdGlvbiAobGVmdCwgcmlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGEgPSBsZWZ0LmNyaXRlcmlhLCBiID0gcmlnaHQuY3JpdGVyaWE7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhIDwgYiA/IC0xIDogYSA+IGIgPyAxIDogMDtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIF9tYXAocmVzdWx0cy5zb3J0KGZuKSwgZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHgudmFsdWU7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgYXN5bmMuYXV0byA9IGZ1bmN0aW9uICh0YXNrcywgY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgdmFyIGtleXMgPSBfa2V5cyh0YXNrcyk7XG4gICAgICAgIHZhciByZW1haW5pbmdUYXNrcyA9IGtleXMubGVuZ3RoXG4gICAgICAgIGlmICghcmVtYWluaW5nVGFza3MpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlc3VsdHMgPSB7fTtcblxuICAgICAgICB2YXIgbGlzdGVuZXJzID0gW107XG4gICAgICAgIHZhciBhZGRMaXN0ZW5lciA9IGZ1bmN0aW9uIChmbikge1xuICAgICAgICAgICAgbGlzdGVuZXJzLnVuc2hpZnQoZm4pO1xuICAgICAgICB9O1xuICAgICAgICB2YXIgcmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdGVuZXJzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICAgICAgaWYgKGxpc3RlbmVyc1tpXSA9PT0gZm4pIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdmFyIHRhc2tDb21wbGV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJlbWFpbmluZ1Rhc2tzLS1cbiAgICAgICAgICAgIF9lYWNoKGxpc3RlbmVycy5zbGljZSgwKSwgZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIGFkZExpc3RlbmVyKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICghcmVtYWluaW5nVGFza3MpIHtcbiAgICAgICAgICAgICAgICB2YXIgdGhlQ2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICAgICAgICAgICAgICAvLyBwcmV2ZW50IGZpbmFsIGNhbGxiYWNrIGZyb20gY2FsbGluZyBpdHNlbGYgaWYgaXQgZXJyb3JzXG4gICAgICAgICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7fTtcblxuICAgICAgICAgICAgICAgIHRoZUNhbGxiYWNrKG51bGwsIHJlc3VsdHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBfZWFjaChrZXlzLCBmdW5jdGlvbiAoaykge1xuICAgICAgICAgICAgdmFyIHRhc2sgPSBfaXNBcnJheSh0YXNrc1trXSkgPyB0YXNrc1trXTogW3Rhc2tzW2tdXTtcbiAgICAgICAgICAgIHZhciB0YXNrQ2FsbGJhY2sgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGFyZ3MgPSBhcmdzWzBdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzYWZlUmVzdWx0cyA9IHt9O1xuICAgICAgICAgICAgICAgICAgICBfZWFjaChfa2V5cyhyZXN1bHRzKSwgZnVuY3Rpb24ocmtleSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2FmZVJlc3VsdHNbcmtleV0gPSByZXN1bHRzW3JrZXldO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc2FmZVJlc3VsdHNba10gPSBhcmdzO1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIHNhZmVSZXN1bHRzKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gc3RvcCBzdWJzZXF1ZW50IGVycm9ycyBoaXR0aW5nIGNhbGxiYWNrIG11bHRpcGxlIHRpbWVzXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHRzW2tdID0gYXJncztcbiAgICAgICAgICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlKHRhc2tDb21wbGV0ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHZhciByZXF1aXJlcyA9IHRhc2suc2xpY2UoMCwgTWF0aC5hYnModGFzay5sZW5ndGggLSAxKSkgfHwgW107XG4gICAgICAgICAgICB2YXIgcmVhZHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIF9yZWR1Y2UocmVxdWlyZXMsIGZ1bmN0aW9uIChhLCB4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAoYSAmJiByZXN1bHRzLmhhc093blByb3BlcnR5KHgpKTtcbiAgICAgICAgICAgICAgICB9LCB0cnVlKSAmJiAhcmVzdWx0cy5oYXNPd25Qcm9wZXJ0eShrKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpZiAocmVhZHkoKSkge1xuICAgICAgICAgICAgICAgIHRhc2tbdGFzay5sZW5ndGggLSAxXSh0YXNrQ2FsbGJhY2ssIHJlc3VsdHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGxpc3RlbmVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVhZHkoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlTGlzdGVuZXIobGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFza1t0YXNrLmxlbmd0aCAtIDFdKHRhc2tDYWxsYmFjaywgcmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGFkZExpc3RlbmVyKGxpc3RlbmVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIGFzeW5jLnJldHJ5ID0gZnVuY3Rpb24odGltZXMsIHRhc2ssIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBERUZBVUxUX1RJTUVTID0gNTtcbiAgICAgICAgdmFyIGF0dGVtcHRzID0gW107XG4gICAgICAgIC8vIFVzZSBkZWZhdWx0cyBpZiB0aW1lcyBub3QgcGFzc2VkXG4gICAgICAgIGlmICh0eXBlb2YgdGltZXMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gdGFzaztcbiAgICAgICAgICAgIHRhc2sgPSB0aW1lcztcbiAgICAgICAgICAgIHRpbWVzID0gREVGQVVMVF9USU1FUztcbiAgICAgICAgfVxuICAgICAgICAvLyBNYWtlIHN1cmUgdGltZXMgaXMgYSBudW1iZXJcbiAgICAgICAgdGltZXMgPSBwYXJzZUludCh0aW1lcywgMTApIHx8IERFRkFVTFRfVElNRVM7XG4gICAgICAgIHZhciB3cmFwcGVkVGFzayA9IGZ1bmN0aW9uKHdyYXBwZWRDYWxsYmFjaywgd3JhcHBlZFJlc3VsdHMpIHtcbiAgICAgICAgICAgIHZhciByZXRyeUF0dGVtcHQgPSBmdW5jdGlvbih0YXNrLCBmaW5hbEF0dGVtcHQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oc2VyaWVzQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgdGFzayhmdW5jdGlvbihlcnIsIHJlc3VsdCl7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXJpZXNDYWxsYmFjayghZXJyIHx8IGZpbmFsQXR0ZW1wdCwge2VycjogZXJyLCByZXN1bHQ6IHJlc3VsdH0pO1xuICAgICAgICAgICAgICAgICAgICB9LCB3cmFwcGVkUmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB3aGlsZSAodGltZXMpIHtcbiAgICAgICAgICAgICAgICBhdHRlbXB0cy5wdXNoKHJldHJ5QXR0ZW1wdCh0YXNrLCAhKHRpbWVzLT0xKSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXN5bmMuc2VyaWVzKGF0dGVtcHRzLCBmdW5jdGlvbihkb25lLCBkYXRhKXtcbiAgICAgICAgICAgICAgICBkYXRhID0gZGF0YVtkYXRhLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICh3cmFwcGVkQ2FsbGJhY2sgfHwgY2FsbGJhY2spKGRhdGEuZXJyLCBkYXRhLnJlc3VsdCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiBhIGNhbGxiYWNrIGlzIHBhc3NlZCwgcnVuIHRoaXMgYXMgYSBjb250cm9sbCBmbG93XG4gICAgICAgIHJldHVybiBjYWxsYmFjayA/IHdyYXBwZWRUYXNrKCkgOiB3cmFwcGVkVGFza1xuICAgIH07XG5cbiAgICBhc3luYy53YXRlcmZhbGwgPSBmdW5jdGlvbiAodGFza3MsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgIGlmICghX2lzQXJyYXkodGFza3MpKSB7XG4gICAgICAgICAgdmFyIGVyciA9IG5ldyBFcnJvcignRmlyc3QgYXJndW1lbnQgdG8gd2F0ZXJmYWxsIG11c3QgYmUgYW4gYXJyYXkgb2YgZnVuY3Rpb25zJyk7XG4gICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0YXNrcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgICAgIHZhciB3cmFwSXRlcmF0b3IgPSBmdW5jdGlvbiAoaXRlcmF0b3IpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjay5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbmV4dCA9IGl0ZXJhdG9yLm5leHQoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5leHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3MucHVzaCh3cmFwSXRlcmF0b3IobmV4dCkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJncy5wdXNoKGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBhc3luYy5zZXRJbW1lZGlhdGUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuYXBwbHkobnVsbCwgYXJncyk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH07XG4gICAgICAgIHdyYXBJdGVyYXRvcihhc3luYy5pdGVyYXRvcih0YXNrcykpKCk7XG4gICAgfTtcblxuICAgIHZhciBfcGFyYWxsZWwgPSBmdW5jdGlvbihlYWNoZm4sIHRhc2tzLCBjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICBpZiAoX2lzQXJyYXkodGFza3MpKSB7XG4gICAgICAgICAgICBlYWNoZm4ubWFwKHRhc2tzLCBmdW5jdGlvbiAoZm4sIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGZuKSB7XG4gICAgICAgICAgICAgICAgICAgIGZuKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXJncyA9IGFyZ3NbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKG51bGwsIGVyciwgYXJncyk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciByZXN1bHRzID0ge307XG4gICAgICAgICAgICBlYWNoZm4uZWFjaChfa2V5cyh0YXNrcyksIGZ1bmN0aW9uIChrLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHRhc2tzW2tdKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJncyA9IGFyZ3NbMF07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0c1trXSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyLCByZXN1bHRzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGFzeW5jLnBhcmFsbGVsID0gZnVuY3Rpb24gKHRhc2tzLCBjYWxsYmFjaykge1xuICAgICAgICBfcGFyYWxsZWwoeyBtYXA6IGFzeW5jLm1hcCwgZWFjaDogYXN5bmMuZWFjaCB9LCB0YXNrcywgY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICBhc3luYy5wYXJhbGxlbExpbWl0ID0gZnVuY3Rpb24odGFza3MsIGxpbWl0LCBjYWxsYmFjaykge1xuICAgICAgICBfcGFyYWxsZWwoeyBtYXA6IF9tYXBMaW1pdChsaW1pdCksIGVhY2g6IF9lYWNoTGltaXQobGltaXQpIH0sIHRhc2tzLCBjYWxsYmFjayk7XG4gICAgfTtcblxuICAgIGFzeW5jLnNlcmllcyA9IGZ1bmN0aW9uICh0YXNrcywgY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgaWYgKF9pc0FycmF5KHRhc2tzKSkge1xuICAgICAgICAgICAgYXN5bmMubWFwU2VyaWVzKHRhc2tzLCBmdW5jdGlvbiAoZm4sIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGZuKSB7XG4gICAgICAgICAgICAgICAgICAgIGZuKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXJncyA9IGFyZ3NbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKG51bGwsIGVyciwgYXJncyk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciByZXN1bHRzID0ge307XG4gICAgICAgICAgICBhc3luYy5lYWNoU2VyaWVzKF9rZXlzKHRhc2tzKSwgZnVuY3Rpb24gKGssIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgdGFza3Nba10oZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXN1bHRzW2tdID0gYXJncztcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIHJlc3VsdHMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgYXN5bmMuaXRlcmF0b3IgPSBmdW5jdGlvbiAodGFza3MpIHtcbiAgICAgICAgdmFyIG1ha2VDYWxsYmFjayA9IGZ1bmN0aW9uIChpbmRleCkge1xuICAgICAgICAgICAgdmFyIGZuID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmICh0YXNrcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgdGFza3NbaW5kZXhdLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmbi5uZXh0KCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgZm4ubmV4dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gKGluZGV4IDwgdGFza3MubGVuZ3RoIC0gMSkgPyBtYWtlQ2FsbGJhY2soaW5kZXggKyAxKTogbnVsbDtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gZm47XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBtYWtlQ2FsbGJhY2soMCk7XG4gICAgfTtcblxuICAgIGFzeW5jLmFwcGx5ID0gZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBmbi5hcHBseShcbiAgICAgICAgICAgICAgICBudWxsLCBhcmdzLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfTtcbiAgICB9O1xuXG4gICAgdmFyIF9jb25jYXQgPSBmdW5jdGlvbiAoZWFjaGZuLCBhcnIsIGZuLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgciA9IFtdO1xuICAgICAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbiAoeCwgY2IpIHtcbiAgICAgICAgICAgIGZuKHgsIGZ1bmN0aW9uIChlcnIsIHkpIHtcbiAgICAgICAgICAgICAgICByID0gci5jb25jYXQoeSB8fCBbXSk7XG4gICAgICAgICAgICAgICAgY2IoZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIsIHIpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIGFzeW5jLmNvbmNhdCA9IGRvUGFyYWxsZWwoX2NvbmNhdCk7XG4gICAgYXN5bmMuY29uY2F0U2VyaWVzID0gZG9TZXJpZXMoX2NvbmNhdCk7XG5cbiAgICBhc3luYy53aGlsc3QgPSBmdW5jdGlvbiAodGVzdCwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICh0ZXN0KCkpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhc3luYy53aGlsc3QodGVzdCwgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBhc3luYy5kb1doaWxzdCA9IGZ1bmN0aW9uIChpdGVyYXRvciwgdGVzdCwgY2FsbGJhY2spIHtcbiAgICAgICAgaXRlcmF0b3IoZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgaWYgKHRlc3QuYXBwbHkobnVsbCwgYXJncykpIHtcbiAgICAgICAgICAgICAgICBhc3luYy5kb1doaWxzdChpdGVyYXRvciwgdGVzdCwgY2FsbGJhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIGFzeW5jLnVudGlsID0gZnVuY3Rpb24gKHRlc3QsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAoIXRlc3QoKSkge1xuICAgICAgICAgICAgaXRlcmF0b3IoZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFzeW5jLnVudGlsKHRlc3QsIGl0ZXJhdG9yLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgYXN5bmMuZG9VbnRpbCA9IGZ1bmN0aW9uIChpdGVyYXRvciwgdGVzdCwgY2FsbGJhY2spIHtcbiAgICAgICAgaXRlcmF0b3IoZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgaWYgKCF0ZXN0LmFwcGx5KG51bGwsIGFyZ3MpKSB7XG4gICAgICAgICAgICAgICAgYXN5bmMuZG9VbnRpbChpdGVyYXRvciwgdGVzdCwgY2FsbGJhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIGFzeW5jLnF1ZXVlID0gZnVuY3Rpb24gKHdvcmtlciwgY29uY3VycmVuY3kpIHtcbiAgICAgICAgaWYgKGNvbmN1cnJlbmN5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbmN1cnJlbmN5ID0gMTtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBfaW5zZXJ0KHEsIGRhdGEsIHBvcywgY2FsbGJhY2spIHtcbiAgICAgICAgICBpZiAoIXEuc3RhcnRlZCl7XG4gICAgICAgICAgICBxLnN0YXJ0ZWQgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIV9pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgICAgIGRhdGEgPSBbZGF0YV07XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmKGRhdGEubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgICAvLyBjYWxsIGRyYWluIGltbWVkaWF0ZWx5IGlmIHRoZXJlIGFyZSBubyB0YXNrc1xuICAgICAgICAgICAgIHJldHVybiBhc3luYy5zZXRJbW1lZGlhdGUoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgIGlmIChxLmRyYWluKSB7XG4gICAgICAgICAgICAgICAgICAgICBxLmRyYWluKCk7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgX2VhY2goZGF0YSwgZnVuY3Rpb24odGFzaykge1xuICAgICAgICAgICAgICB2YXIgaXRlbSA9IHtcbiAgICAgICAgICAgICAgICAgIGRhdGE6IHRhc2ssXG4gICAgICAgICAgICAgICAgICBjYWxsYmFjazogdHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nID8gY2FsbGJhY2sgOiBudWxsXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgaWYgKHBvcykge1xuICAgICAgICAgICAgICAgIHEudGFza3MudW5zaGlmdChpdGVtKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBxLnRhc2tzLnB1c2goaXRlbSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBpZiAocS5zYXR1cmF0ZWQgJiYgcS50YXNrcy5sZW5ndGggPT09IHEuY29uY3VycmVuY3kpIHtcbiAgICAgICAgICAgICAgICAgIHEuc2F0dXJhdGVkKCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlKHEucHJvY2Vzcyk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgd29ya2VycyA9IDA7XG4gICAgICAgIHZhciBxID0ge1xuICAgICAgICAgICAgdGFza3M6IFtdLFxuICAgICAgICAgICAgY29uY3VycmVuY3k6IGNvbmN1cnJlbmN5LFxuICAgICAgICAgICAgc2F0dXJhdGVkOiBudWxsLFxuICAgICAgICAgICAgZW1wdHk6IG51bGwsXG4gICAgICAgICAgICBkcmFpbjogbnVsbCxcbiAgICAgICAgICAgIHN0YXJ0ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgcGF1c2VkOiBmYWxzZSxcbiAgICAgICAgICAgIHB1c2g6IGZ1bmN0aW9uIChkYXRhLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICBfaW5zZXJ0KHEsIGRhdGEsIGZhbHNlLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAga2lsbDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICBxLmRyYWluID0gbnVsbDtcbiAgICAgICAgICAgICAgcS50YXNrcyA9IFtdO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHVuc2hpZnQ6IGZ1bmN0aW9uIChkYXRhLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICBfaW5zZXJ0KHEsIGRhdGEsIHRydWUsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwcm9jZXNzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFxLnBhdXNlZCAmJiB3b3JrZXJzIDwgcS5jb25jdXJyZW5jeSAmJiBxLnRhc2tzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGFzayA9IHEudGFza3Muc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHEuZW1wdHkgJiYgcS50YXNrcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHEuZW1wdHkoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB3b3JrZXJzICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIHZhciBuZXh0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd29ya2VycyAtPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRhc2suY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXNrLmNhbGxiYWNrLmFwcGx5KHRhc2ssIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocS5kcmFpbiAmJiBxLnRhc2tzLmxlbmd0aCArIHdvcmtlcnMgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBxLmRyYWluKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBxLnByb2Nlc3MoKTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNiID0gb25seV9vbmNlKG5leHQpO1xuICAgICAgICAgICAgICAgICAgICB3b3JrZXIodGFzay5kYXRhLCBjYik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxlbmd0aDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBxLnRhc2tzLmxlbmd0aDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBydW5uaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHdvcmtlcnM7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgaWRsZTogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHEudGFza3MubGVuZ3RoICsgd29ya2VycyA9PT0gMDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwYXVzZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmIChxLnBhdXNlZCA9PT0gdHJ1ZSkgeyByZXR1cm47IH1cbiAgICAgICAgICAgICAgICBxLnBhdXNlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgcS5wcm9jZXNzKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcmVzdW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHEucGF1c2VkID09PSBmYWxzZSkgeyByZXR1cm47IH1cbiAgICAgICAgICAgICAgICBxLnBhdXNlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHEucHJvY2VzcygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gcTtcbiAgICB9O1xuICAgIFxuICAgIGFzeW5jLnByaW9yaXR5UXVldWUgPSBmdW5jdGlvbiAod29ya2VyLCBjb25jdXJyZW5jeSkge1xuICAgICAgICBcbiAgICAgICAgZnVuY3Rpb24gX2NvbXBhcmVUYXNrcyhhLCBiKXtcbiAgICAgICAgICByZXR1cm4gYS5wcmlvcml0eSAtIGIucHJpb3JpdHk7XG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICBmdW5jdGlvbiBfYmluYXJ5U2VhcmNoKHNlcXVlbmNlLCBpdGVtLCBjb21wYXJlKSB7XG4gICAgICAgICAgdmFyIGJlZyA9IC0xLFxuICAgICAgICAgICAgICBlbmQgPSBzZXF1ZW5jZS5sZW5ndGggLSAxO1xuICAgICAgICAgIHdoaWxlIChiZWcgPCBlbmQpIHtcbiAgICAgICAgICAgIHZhciBtaWQgPSBiZWcgKyAoKGVuZCAtIGJlZyArIDEpID4+PiAxKTtcbiAgICAgICAgICAgIGlmIChjb21wYXJlKGl0ZW0sIHNlcXVlbmNlW21pZF0pID49IDApIHtcbiAgICAgICAgICAgICAgYmVnID0gbWlkO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZW5kID0gbWlkIC0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGJlZztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgZnVuY3Rpb24gX2luc2VydChxLCBkYXRhLCBwcmlvcml0eSwgY2FsbGJhY2spIHtcbiAgICAgICAgICBpZiAoIXEuc3RhcnRlZCl7XG4gICAgICAgICAgICBxLnN0YXJ0ZWQgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIV9pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgICAgIGRhdGEgPSBbZGF0YV07XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmKGRhdGEubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgICAvLyBjYWxsIGRyYWluIGltbWVkaWF0ZWx5IGlmIHRoZXJlIGFyZSBubyB0YXNrc1xuICAgICAgICAgICAgIHJldHVybiBhc3luYy5zZXRJbW1lZGlhdGUoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgIGlmIChxLmRyYWluKSB7XG4gICAgICAgICAgICAgICAgICAgICBxLmRyYWluKCk7XG4gICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgX2VhY2goZGF0YSwgZnVuY3Rpb24odGFzaykge1xuICAgICAgICAgICAgICB2YXIgaXRlbSA9IHtcbiAgICAgICAgICAgICAgICAgIGRhdGE6IHRhc2ssXG4gICAgICAgICAgICAgICAgICBwcmlvcml0eTogcHJpb3JpdHksXG4gICAgICAgICAgICAgICAgICBjYWxsYmFjazogdHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nID8gY2FsbGJhY2sgOiBudWxsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBxLnRhc2tzLnNwbGljZShfYmluYXJ5U2VhcmNoKHEudGFza3MsIGl0ZW0sIF9jb21wYXJlVGFza3MpICsgMSwgMCwgaXRlbSk7XG5cbiAgICAgICAgICAgICAgaWYgKHEuc2F0dXJhdGVkICYmIHEudGFza3MubGVuZ3RoID09PSBxLmNvbmN1cnJlbmN5KSB7XG4gICAgICAgICAgICAgICAgICBxLnNhdHVyYXRlZCgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZShxLnByb2Nlc3MpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBTdGFydCB3aXRoIGEgbm9ybWFsIHF1ZXVlXG4gICAgICAgIHZhciBxID0gYXN5bmMucXVldWUod29ya2VyLCBjb25jdXJyZW5jeSk7XG4gICAgICAgIFxuICAgICAgICAvLyBPdmVycmlkZSBwdXNoIHRvIGFjY2VwdCBzZWNvbmQgcGFyYW1ldGVyIHJlcHJlc2VudGluZyBwcmlvcml0eVxuICAgICAgICBxLnB1c2ggPSBmdW5jdGlvbiAoZGF0YSwgcHJpb3JpdHksIGNhbGxiYWNrKSB7XG4gICAgICAgICAgX2luc2VydChxLCBkYXRhLCBwcmlvcml0eSwgY2FsbGJhY2spO1xuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgLy8gUmVtb3ZlIHVuc2hpZnQgZnVuY3Rpb25cbiAgICAgICAgZGVsZXRlIHEudW5zaGlmdDtcblxuICAgICAgICByZXR1cm4gcTtcbiAgICB9O1xuXG4gICAgYXN5bmMuY2FyZ28gPSBmdW5jdGlvbiAod29ya2VyLCBwYXlsb2FkKSB7XG4gICAgICAgIHZhciB3b3JraW5nICAgICA9IGZhbHNlLFxuICAgICAgICAgICAgdGFza3MgICAgICAgPSBbXTtcblxuICAgICAgICB2YXIgY2FyZ28gPSB7XG4gICAgICAgICAgICB0YXNrczogdGFza3MsXG4gICAgICAgICAgICBwYXlsb2FkOiBwYXlsb2FkLFxuICAgICAgICAgICAgc2F0dXJhdGVkOiBudWxsLFxuICAgICAgICAgICAgZW1wdHk6IG51bGwsXG4gICAgICAgICAgICBkcmFpbjogbnVsbCxcbiAgICAgICAgICAgIGRyYWluZWQ6IHRydWUsXG4gICAgICAgICAgICBwdXNoOiBmdW5jdGlvbiAoZGF0YSwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBpZiAoIV9pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGRhdGEgPSBbZGF0YV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIF9lYWNoKGRhdGEsIGZ1bmN0aW9uKHRhc2spIHtcbiAgICAgICAgICAgICAgICAgICAgdGFza3MucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiB0YXNrLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2s6IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogbnVsbFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgY2FyZ28uZHJhaW5lZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2FyZ28uc2F0dXJhdGVkICYmIHRhc2tzLmxlbmd0aCA9PT0gcGF5bG9hZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FyZ28uc2F0dXJhdGVkKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBhc3luYy5zZXRJbW1lZGlhdGUoY2FyZ28ucHJvY2Vzcyk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJvY2VzczogZnVuY3Rpb24gcHJvY2VzcygpIHtcbiAgICAgICAgICAgICAgICBpZiAod29ya2luZykgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGlmICh0YXNrcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYoY2FyZ28uZHJhaW4gJiYgIWNhcmdvLmRyYWluZWQpIGNhcmdvLmRyYWluKCk7XG4gICAgICAgICAgICAgICAgICAgIGNhcmdvLmRyYWluZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFyIHRzID0gdHlwZW9mIHBheWxvYWQgPT09ICdudW1iZXInXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPyB0YXNrcy5zcGxpY2UoMCwgcGF5bG9hZClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IHRhc2tzLnNwbGljZSgwLCB0YXNrcy5sZW5ndGgpO1xuXG4gICAgICAgICAgICAgICAgdmFyIGRzID0gX21hcCh0cywgZnVuY3Rpb24gKHRhc2spIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRhc2suZGF0YTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGlmKGNhcmdvLmVtcHR5KSBjYXJnby5lbXB0eSgpO1xuICAgICAgICAgICAgICAgIHdvcmtpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHdvcmtlcihkcywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICB3b3JraW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICAgICAgICAgICAgICAgIF9lYWNoKHRzLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhLmNhbGxiYWNrLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICBwcm9jZXNzKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbGVuZ3RoOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRhc2tzLmxlbmd0aDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBydW5uaW5nOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHdvcmtpbmc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBjYXJnbztcbiAgICB9O1xuXG4gICAgdmFyIF9jb25zb2xlX2ZuID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmbikge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgZm4uYXBwbHkobnVsbCwgYXJncy5jb25jYXQoW2Z1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29uc29sZS5lcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChjb25zb2xlW25hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBfZWFjaChhcmdzLCBmdW5jdGlvbiAoeCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGVbbmFtZV0oeCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1dKSk7XG4gICAgICAgIH07XG4gICAgfTtcbiAgICBhc3luYy5sb2cgPSBfY29uc29sZV9mbignbG9nJyk7XG4gICAgYXN5bmMuZGlyID0gX2NvbnNvbGVfZm4oJ2RpcicpO1xuICAgIC8qYXN5bmMuaW5mbyA9IF9jb25zb2xlX2ZuKCdpbmZvJyk7XG4gICAgYXN5bmMud2FybiA9IF9jb25zb2xlX2ZuKCd3YXJuJyk7XG4gICAgYXN5bmMuZXJyb3IgPSBfY29uc29sZV9mbignZXJyb3InKTsqL1xuXG4gICAgYXN5bmMubWVtb2l6ZSA9IGZ1bmN0aW9uIChmbiwgaGFzaGVyKSB7XG4gICAgICAgIHZhciBtZW1vID0ge307XG4gICAgICAgIHZhciBxdWV1ZXMgPSB7fTtcbiAgICAgICAgaGFzaGVyID0gaGFzaGVyIHx8IGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICByZXR1cm4geDtcbiAgICAgICAgfTtcbiAgICAgICAgdmFyIG1lbW9pemVkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJncy5wb3AoKTtcbiAgICAgICAgICAgIHZhciBrZXkgPSBoYXNoZXIuYXBwbHkobnVsbCwgYXJncyk7XG4gICAgICAgICAgICBpZiAoa2V5IGluIG1lbW8pIHtcbiAgICAgICAgICAgICAgICBhc3luYy5uZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrLmFwcGx5KG51bGwsIG1lbW9ba2V5XSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChrZXkgaW4gcXVldWVzKSB7XG4gICAgICAgICAgICAgICAgcXVldWVzW2tleV0ucHVzaChjYWxsYmFjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBxdWV1ZXNba2V5XSA9IFtjYWxsYmFja107XG4gICAgICAgICAgICAgICAgZm4uYXBwbHkobnVsbCwgYXJncy5jb25jYXQoW2Z1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgbWVtb1trZXldID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgICAgICAgICB2YXIgcSA9IHF1ZXVlc1trZXldO1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgcXVldWVzW2tleV07XG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gcS5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICBxW2ldLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBtZW1vaXplZC5tZW1vID0gbWVtbztcbiAgICAgICAgbWVtb2l6ZWQudW5tZW1vaXplZCA9IGZuO1xuICAgICAgICByZXR1cm4gbWVtb2l6ZWQ7XG4gICAgfTtcblxuICAgIGFzeW5jLnVubWVtb2l6ZSA9IGZ1bmN0aW9uIChmbikge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIChmbi51bm1lbW9pemVkIHx8IGZuKS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICB9O1xuXG4gICAgYXN5bmMudGltZXMgPSBmdW5jdGlvbiAoY291bnQsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgY291bnRlciA9IFtdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICAgICAgICAgIGNvdW50ZXIucHVzaChpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXN5bmMubWFwKGNvdW50ZXIsIGl0ZXJhdG9yLCBjYWxsYmFjayk7XG4gICAgfTtcblxuICAgIGFzeW5jLnRpbWVzU2VyaWVzID0gZnVuY3Rpb24gKGNvdW50LCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGNvdW50ZXIgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBjb3VudGVyLnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFzeW5jLm1hcFNlcmllcyhjb3VudGVyLCBpdGVyYXRvciwgY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICBhc3luYy5zZXEgPSBmdW5jdGlvbiAoLyogZnVuY3Rpb25zLi4uICovKSB7XG4gICAgICAgIHZhciBmbnMgPSBhcmd1bWVudHM7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICB2YXIgY2FsbGJhY2sgPSBhcmdzLnBvcCgpO1xuICAgICAgICAgICAgYXN5bmMucmVkdWNlKGZucywgYXJncywgZnVuY3Rpb24gKG5ld2FyZ3MsIGZuLCBjYikge1xuICAgICAgICAgICAgICAgIGZuLmFwcGx5KHRoYXQsIG5ld2FyZ3MuY29uY2F0KFtmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBlcnIgPSBhcmd1bWVudHNbMF07XG4gICAgICAgICAgICAgICAgICAgIHZhciBuZXh0YXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgIGNiKGVyciwgbmV4dGFyZ3MpO1xuICAgICAgICAgICAgICAgIH1dKSlcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suYXBwbHkodGhhdCwgW2Vycl0uY29uY2F0KHJlc3VsdHMpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgIH07XG5cbiAgICBhc3luYy5jb21wb3NlID0gZnVuY3Rpb24gKC8qIGZ1bmN0aW9ucy4uLiAqLykge1xuICAgICAgcmV0dXJuIGFzeW5jLnNlcS5hcHBseShudWxsLCBBcnJheS5wcm90b3R5cGUucmV2ZXJzZS5jYWxsKGFyZ3VtZW50cykpO1xuICAgIH07XG5cbiAgICB2YXIgX2FwcGx5RWFjaCA9IGZ1bmN0aW9uIChlYWNoZm4sIGZucyAvKmFyZ3MuLi4qLykge1xuICAgICAgICB2YXIgZ28gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICB2YXIgY2FsbGJhY2sgPSBhcmdzLnBvcCgpO1xuICAgICAgICAgICAgcmV0dXJuIGVhY2hmbihmbnMsIGZ1bmN0aW9uIChmbiwgY2IpIHtcbiAgICAgICAgICAgICAgICBmbi5hcHBseSh0aGF0LCBhcmdzLmNvbmNhdChbY2JdKSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2FsbGJhY2spO1xuICAgICAgICB9O1xuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICAgICAgICAgIHJldHVybiBnby5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBnbztcbiAgICAgICAgfVxuICAgIH07XG4gICAgYXN5bmMuYXBwbHlFYWNoID0gZG9QYXJhbGxlbChfYXBwbHlFYWNoKTtcbiAgICBhc3luYy5hcHBseUVhY2hTZXJpZXMgPSBkb1NlcmllcyhfYXBwbHlFYWNoKTtcblxuICAgIGFzeW5jLmZvcmV2ZXIgPSBmdW5jdGlvbiAoZm4sIGNhbGxiYWNrKSB7XG4gICAgICAgIGZ1bmN0aW9uIG5leHQoZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmbihuZXh0KTtcbiAgICAgICAgfVxuICAgICAgICBuZXh0KCk7XG4gICAgfTtcblxuICAgIC8vIE5vZGUuanNcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBhc3luYztcbiAgICB9XG4gICAgLy8gQU1EIC8gUmVxdWlyZUpTXG4gICAgZWxzZSBpZiAodHlwZW9mIGRlZmluZSAhPT0gJ3VuZGVmaW5lZCcgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgICBkZWZpbmUoW10sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBhc3luYztcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8vIGluY2x1ZGVkIGRpcmVjdGx5IHZpYSA8c2NyaXB0PiB0YWdcbiAgICBlbHNlIHtcbiAgICAgICAgcm9vdC5hc3luYyA9IGFzeW5jO1xuICAgIH1cblxufSgpKTtcbiIsIi8vIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vL1xuLy8gVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4vLyBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4vLyBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuLy8gQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc28gc3ViamVjdCB0b1xuLy8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbihmdW5jdGlvbihzY29wZSkge1xuJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBwYXJzZShzdGFjaykge1xuICB2YXIgcmF3TGluZXMgPSBzdGFjay5zcGxpdCgnXFxuJyk7XG5cbiAgdmFyIHN0YWNreUxpbmVzID0gY29tcGFjdChyYXdMaW5lcy5tYXAocGFyc2VTdGFja3lMaW5lKSk7XG4gIGlmIChzdGFja3lMaW5lcy5sZW5ndGggPT09IHJhd0xpbmVzLmxlbmd0aCkgcmV0dXJuIHN0YWNreUxpbmVzO1xuXG4gIHZhciB2OExpbmVzID0gY29tcGFjdChyYXdMaW5lcy5tYXAocGFyc2VWOExpbmUpKTtcbiAgaWYgKHY4TGluZXMubGVuZ3RoID4gMCkgcmV0dXJuIHY4TGluZXM7XG5cbiAgdmFyIGdlY2tvTGluZXMgPSBjb21wYWN0KHJhd0xpbmVzLm1hcChwYXJzZUdlY2tvTGluZSkpO1xuICBpZiAoZ2Vja29MaW5lcy5sZW5ndGggPiAwKSByZXR1cm4gZ2Vja29MaW5lcztcblxuICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gc3RhY2sgZm9ybWF0OiAnICsgc3RhY2spO1xufVxuXG4vLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9FcnJvci9TdGFja1xudmFyIEdFQ0tPX0xJTkUgPSAvXig/OihbXkBdKilAKT8oLio/KTooXFxkKykoPzo6KFxcZCspKT8kLztcblxuZnVuY3Rpb24gcGFyc2VHZWNrb0xpbmUobGluZSkge1xuICB2YXIgbWF0Y2ggPSBsaW5lLm1hdGNoKEdFQ0tPX0xJTkUpO1xuICBpZiAoIW1hdGNoKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBtZXRob2Q6ICAgbWF0Y2hbMV0gfHwgJycsXG4gICAgbG9jYXRpb246IG1hdGNoWzJdIHx8ICcnLFxuICAgIGxpbmU6ICAgICBwYXJzZUludChtYXRjaFszXSkgfHwgMCxcbiAgICBjb2x1bW46ICAgcGFyc2VJbnQobWF0Y2hbNF0pIHx8IDAsXG4gIH07XG59XG5cbi8vIGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3Avdjgvd2lraS9KYXZhU2NyaXB0U3RhY2tUcmFjZUFwaVxudmFyIFY4X09VVEVSMSA9IC9eXFxzKihldmFsICk/YXQgKC4qKSBcXCgoLiopXFwpJC87XG52YXIgVjhfT1VURVIyID0gL15cXHMqYXQoKSgpIChcXFMrKSQvO1xudmFyIFY4X0lOTkVSICA9IC9eXFwoPyhbXlxcKF0rKTooXFxkKyk6KFxcZCspXFwpPyQvO1xuXG5mdW5jdGlvbiBwYXJzZVY4TGluZShsaW5lKSB7XG4gIHZhciBvdXRlciA9IGxpbmUubWF0Y2goVjhfT1VURVIxKSB8fCBsaW5lLm1hdGNoKFY4X09VVEVSMik7XG4gIGlmICghb3V0ZXIpIHJldHVybiBudWxsO1xuICB2YXIgaW5uZXIgPSBvdXRlclszXS5tYXRjaChWOF9JTk5FUik7XG4gIGlmICghaW5uZXIpIHJldHVybiBudWxsO1xuXG4gIHZhciBtZXRob2QgPSBvdXRlclsyXSB8fCAnJztcbiAgaWYgKG91dGVyWzFdKSBtZXRob2QgPSAnZXZhbCBhdCAnICsgbWV0aG9kO1xuICByZXR1cm4ge1xuICAgIG1ldGhvZDogICBtZXRob2QsXG4gICAgbG9jYXRpb246IGlubmVyWzFdIHx8ICcnLFxuICAgIGxpbmU6ICAgICBwYXJzZUludChpbm5lclsyXSkgfHwgMCxcbiAgICBjb2x1bW46ICAgcGFyc2VJbnQoaW5uZXJbM10pIHx8IDAsXG4gIH07XG59XG5cbi8vIFN0YWNreS5mb3JtYXR0aW5nLnByZXR0eVxuXG52YXIgU1RBQ0tZX0xJTkUgPSAvXlxccyooLispIGF0ICguKyk6KFxcZCspOihcXGQrKSQvO1xuXG5mdW5jdGlvbiBwYXJzZVN0YWNreUxpbmUobGluZSkge1xuICB2YXIgbWF0Y2ggPSBsaW5lLm1hdGNoKFNUQUNLWV9MSU5FKTtcbiAgaWYgKCFtYXRjaCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgbWV0aG9kOiAgIG1hdGNoWzFdIHx8ICcnLFxuICAgIGxvY2F0aW9uOiBtYXRjaFsyXSB8fCAnJyxcbiAgICBsaW5lOiAgICAgcGFyc2VJbnQobWF0Y2hbM10pIHx8IDAsXG4gICAgY29sdW1uOiAgIHBhcnNlSW50KG1hdGNoWzRdKSB8fCAwLFxuICB9O1xufVxuXG4vLyBIZWxwZXJzXG5cbmZ1bmN0aW9uIGNvbXBhY3QoYXJyYXkpIHtcbiAgdmFyIHJlc3VsdCA9IFtdO1xuICBhcnJheS5mb3JFYWNoKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgaWYgKHZhbHVlKSB7XG4gICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuc2NvcGUucGFyc2UgICAgICAgICAgID0gcGFyc2U7XG5zY29wZS5wYXJzZUdlY2tvTGluZSAgPSBwYXJzZUdlY2tvTGluZTtcbnNjb3BlLnBhcnNlVjhMaW5lICAgICA9IHBhcnNlVjhMaW5lO1xuc2NvcGUucGFyc2VTdGFja3lMaW5lID0gcGFyc2VTdGFja3lMaW5lO1xufSkodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgPyBtb2R1bGUuZXhwb3J0cyA6ICh0aGlzLlN0YWNreSA9IHRoaXMuU3RhY2t5IHx8IHt9KSk7XG4iLCIvLyBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuLy9cbi8vIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBwb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuLy8gVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBwb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuLy8gVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbi8vIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvIHN1YmplY3QgdG9cbi8vIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4oZnVuY3Rpb24oc2NvcGUpIHtcbid1c2Ugc3RyaWN0JztcblxudmFyIHBhcnNlID0gc2NvcGUucGFyc2UgfHwgcmVxdWlyZSgnLi9wYXJzaW5nJykucGFyc2U7XG5cbnNjb3BlLmRlZmF1bHRzID0ge1xuICAvLyBNZXRob2RzIGFyZSBhbGlnbmVkIHVwIHRvIHRoaXMgbXVjaCBwYWRkaW5nLlxuICBtYXhNZXRob2RQYWRkaW5nOiA0MCxcbiAgLy8gQSBzdHJpbmcgdG8gcHJlZml4IGVhY2ggbGluZSB3aXRoLlxuICBpbmRlbnQ6ICcnLFxuICAvLyBBIHN0cmluZyB0byBzaG93IGZvciBzdGFjayBsaW5lcyB0aGF0IGFyZSBtaXNzaW5nIGEgbWV0aG9kLlxuICBtZXRob2RQbGFjZWhvbGRlcjogJzx1bmtub3duPicsXG4gIC8vIEEgbGlzdCBvZiBTdHJpbmdzL1JlZ0V4cHMgdGhhdCB3aWxsIGJlIHN0cmlwcGVkIGZyb20gYGxvY2F0aW9uYCB2YWx1ZXMgb25cbiAgLy8gZWFjaCBsaW5lICh2aWEgYFN0cmluZyNyZXBsYWNlYCkuXG4gIGxvY2F0aW9uU3RyaXA6IFtdLFxuICAvLyBBIGxpc3Qgb2YgU3RyaW5ncy9SZWdFeHBzIHRoYXQgaW5kaWNhdGUgdGhhdCBhIGxpbmUgaXMgKm5vdCogaW1wb3J0YW50LCBhbmRcbiAgLy8gc2hvdWxkIGJlIHN0eWxlZCBhcyBzdWNoLlxuICB1bmltcG9ydGFudExvY2F0aW9uOiBbXSxcbiAgLy8gQSBmaWx0ZXIgZnVuY3Rpb24gdG8gY29tcGxldGVseSByZW1vdmUgbGluZXNcbiAgZmlsdGVyOiBmdW5jdGlvbigpIHsgcmV0dXJuIGZhbHNlOyB9LFxuICAvLyBzdHlsZXMgYXJlIGZ1bmN0aW9ucyB0aGF0IHRha2UgYSBzdHJpbmcgYW5kIHJldHVybiB0aGF0IHN0cmluZyB3aGVuIHN0eWxlZC5cbiAgc3R5bGVzOiB7XG4gICAgbWV0aG9kOiAgICAgIHBhc3N0aHJvdWdoLFxuICAgIGxvY2F0aW9uOiAgICBwYXNzdGhyb3VnaCxcbiAgICBsaW5lOiAgICAgICAgcGFzc3Rocm91Z2gsXG4gICAgY29sdW1uOiAgICAgIHBhc3N0aHJvdWdoLFxuICAgIHVuaW1wb3J0YW50OiBwYXNzdGhyb3VnaCxcbiAgfSxcbn07XG5cbi8vIEZvciBTdGFja3ktaW4tTm9kZSwgd2UgZGVmYXVsdCB0byBjb2xvcmVkIHN0YWNrcy5cbmlmICh0eXBlb2YgcmVxdWlyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICB2YXIgY2hhbGsgPSByZXF1aXJlKCdjaGFsaycpO1xuXG4gIHNjb3BlLmRlZmF1bHRzLnN0eWxlcyA9IHtcbiAgICBtZXRob2Q6ICAgICAgY2hhbGsubWFnZW50YSxcbiAgICBsb2NhdGlvbjogICAgY2hhbGsuYmx1ZSxcbiAgICBsaW5lOiAgICAgICAgY2hhbGsuY3lhbixcbiAgICBjb2x1bW46ICAgICAgY2hhbGsuY3lhbixcbiAgICB1bmltcG9ydGFudDogY2hhbGsuZGltLFxuICB9O1xufVxuXG5mdW5jdGlvbiBwcmV0dHkoc3RhY2tPclBhcnNlZCwgb3B0aW9ucykge1xuICBvcHRpb25zID0gbWVyZ2VEZWZhdWx0cyhvcHRpb25zIHx8IHt9LCBzY29wZS5kZWZhdWx0cyk7XG4gIHZhciBsaW5lcyA9IEFycmF5LmlzQXJyYXkoc3RhY2tPclBhcnNlZCkgPyBzdGFja09yUGFyc2VkIDogcGFyc2Uoc3RhY2tPclBhcnNlZCk7XG4gIGxpbmVzID0gY2xlYW4obGluZXMsIG9wdGlvbnMpO1xuXG4gIHZhciBwYWRTaXplID0gbWV0aG9kUGFkZGluZyhsaW5lcywgb3B0aW9ucyk7XG4gIHZhciBwYXJ0cyA9IGxpbmVzLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgdmFyIG1ldGhvZCAgID0gbGluZS5tZXRob2QgfHwgb3B0aW9ucy5tZXRob2RQbGFjZWhvbGRlcjtcbiAgICB2YXIgcGFkICAgICAgPSBvcHRpb25zLmluZGVudCArIHBhZGRpbmcocGFkU2l6ZSAtIG1ldGhvZC5sZW5ndGgpO1xuICAgIHZhciBsb2NhdGlvbiA9IFtcbiAgICAgIG9wdGlvbnMuc3R5bGVzLmxvY2F0aW9uKGxpbmUubG9jYXRpb24pLFxuICAgICAgb3B0aW9ucy5zdHlsZXMubGluZShsaW5lLmxpbmUpLFxuICAgICAgb3B0aW9ucy5zdHlsZXMuY29sdW1uKGxpbmUuY29sdW1uKSxcbiAgICBdLmpvaW4oJzonKTtcblxuICAgIHZhciB0ZXh0ID0gcGFkICsgb3B0aW9ucy5zdHlsZXMubWV0aG9kKG1ldGhvZCkgKyAnIGF0ICcgKyBsb2NhdGlvbjtcbiAgICBpZiAoIWxpbmUuaW1wb3J0YW50KSB7XG4gICAgICB0ZXh0ID0gb3B0aW9ucy5zdHlsZXMudW5pbXBvcnRhbnQodGV4dCk7XG4gICAgfVxuICAgIHJldHVybiB0ZXh0O1xuICB9KTtcblxuICByZXR1cm4gcGFydHMuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGNsZWFuKGxpbmVzLCBvcHRpb25zKSB7XG4gIHZhciByZXN1bHQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGxpbmU7IGxpbmUgPSBsaW5lc1tpXTsgaSsrKSB7XG4gICAgaWYgKG9wdGlvbnMuZmlsdGVyKGxpbmUpKSBjb250aW51ZTtcbiAgICBsaW5lLmxvY2F0aW9uICA9IGNsZWFuTG9jYXRpb24obGluZS5sb2NhdGlvbiwgb3B0aW9ucyk7XG4gICAgbGluZS5pbXBvcnRhbnQgPSBpc0ltcG9ydGFudChsaW5lLCBvcHRpb25zKTtcbiAgICByZXN1bHQucHVzaChsaW5lKTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8vIFV0aWxpdHlcblxuZnVuY3Rpb24gcGFzc3Rocm91Z2goc3RyaW5nKSB7XG4gIHJldHVybiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIG1lcmdlRGVmYXVsdHMob3B0aW9ucywgZGVmYXVsdHMpIHtcbiAgdmFyIHJlc3VsdCA9IE9iamVjdC5jcmVhdGUoZGVmYXVsdHMpO1xuICBPYmplY3Qua2V5cyhvcHRpb25zKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIHZhciB2YWx1ZSA9IG9wdGlvbnNba2V5XTtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgIHZhbHVlID0gbWVyZ2VEZWZhdWx0cyh2YWx1ZSwgZGVmYXVsdHNba2V5XSk7XG4gICAgfVxuICAgIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBtZXRob2RQYWRkaW5nKGxpbmVzLCBvcHRpb25zKSB7XG4gIHZhciBzaXplID0gb3B0aW9ucy5tZXRob2RQbGFjZWhvbGRlci5sZW5ndGg7XG4gIGZvciAodmFyIGkgPSAwLCBsaW5lOyBsaW5lID0gbGluZXNbaV07IGkrKykge1xuICAgIHNpemUgPSBNYXRoLm1pbihvcHRpb25zLm1heE1ldGhvZFBhZGRpbmcsIE1hdGgubWF4KHNpemUsIGxpbmUubWV0aG9kLmxlbmd0aCkpO1xuICB9XG4gIHJldHVybiBzaXplO1xufVxuXG5mdW5jdGlvbiBwYWRkaW5nKGxlbmd0aCkge1xuICB2YXIgcmVzdWx0ID0gJyc7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICByZXN1bHQgPSByZXN1bHQgKyAnICc7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gY2xlYW5Mb2NhdGlvbihsb2NhdGlvbiwgb3B0aW9ucykge1xuICBpZiAob3B0aW9ucy5sb2NhdGlvblN0cmlwKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIG1hdGNoZXI7IG1hdGNoZXIgPSBvcHRpb25zLmxvY2F0aW9uU3RyaXBbaV07IGkrKykge1xuICAgICAgbG9jYXRpb24gPSBsb2NhdGlvbi5yZXBsYWNlKG1hdGNoZXIsICcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbG9jYXRpb247XG59XG5cbmZ1bmN0aW9uIGlzSW1wb3J0YW50KGxpbmUsIG9wdGlvbnMpIHtcbiAgaWYgKG9wdGlvbnMudW5pbXBvcnRhbnRMb2NhdGlvbikge1xuICAgIGZvciAodmFyIGkgPSAwLCBtYXRjaGVyOyBtYXRjaGVyID0gb3B0aW9ucy51bmltcG9ydGFudExvY2F0aW9uW2ldOyBpKyspIHtcbiAgICAgIGlmIChsaW5lLmxvY2F0aW9uLm1hdGNoKG1hdGNoZXIpKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbnNjb3BlLmNsZWFuICA9IGNsZWFuO1xuc2NvcGUucHJldHR5ID0gcHJldHR5O1xufSkodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgPyBtb2R1bGUuZXhwb3J0cyA6ICh0aGlzLlN0YWNreSA9IHRoaXMuU3RhY2t5IHx8IHt9KSk7XG5cbiIsIi8vIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vL1xuLy8gVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4vLyBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4vLyBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuLy8gQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc28gc3ViamVjdCB0b1xuLy8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbihmdW5jdGlvbihzY29wZSkge1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgcGFyc2UgID0gc2NvcGUucGFyc2UgIHx8IHJlcXVpcmUoJy4vcGFyc2luZycpLnBhcnNlO1xudmFyIHByZXR0eSA9IHNjb3BlLnByZXR0eSB8fCByZXF1aXJlKCcuL2Zvcm1hdHRpbmcnKS5wcmV0dHk7XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZShlcnJvciwgcHJldHR5T3B0aW9ucykge1xuICBpZiAoZXJyb3IucGFyc2VkU3RhY2spIHJldHVybiBlcnJvcjtcbiAgdmFyIG1lc3NhZ2UgPSBlcnJvci5tZXNzYWdlIHx8IGVycm9yLmRlc2NyaXB0aW9uIHx8ICc8dW5rbm93biBlcnJvcj4nO1xuICB2YXIgcGFyc2VkU3RhY2sgPSBbXTtcbiAgdHJ5IHtcbiAgICBwYXJzZWRTdGFjayA9IHBhcnNlKGVycm9yLnN0YWNrIHx8IGVycm9yLnRvU3RyaW5nKCkpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIEFoIHdlbGwuXG4gIH1cblxuICBpZiAocGFyc2VkU3RhY2subGVuZ3RoID09PSAwICYmIGVycm9yLmZpbGVOYW1lKSB7XG4gICAgcGFyc2VkU3RhY2sucHVzaCh7XG4gICAgICBtZXRob2Q6ICAgJycsXG4gICAgICBsb2NhdGlvbjogZXJyb3IuZmlsZU5hbWUsXG4gICAgICBsaW5lOiAgICAgZXJyb3IubGluZU51bWJlcixcbiAgICAgIGNvbHVtbjogICBlcnJvci5jb2x1bW5OdW1iZXIsXG4gICAgfSk7XG4gIH1cblxuICB2YXIgcHJldHR5U3RhY2sgPSBtZXNzYWdlICsgJ1xcbicgKyBwcmV0dHkocGFyc2VkU3RhY2ssIHByZXR0eU9wdGlvbnMpO1xuXG4gIHJldHVybiB7XG4gICAgbWVzc2FnZTogICAgIG1lc3NhZ2UsXG4gICAgc3RhY2s6ICAgICAgIHByZXR0eVN0YWNrLFxuICAgIHBhcnNlZFN0YWNrOiBwYXJzZWRTdGFjayxcbiAgfTtcbn1cblxuc2NvcGUubm9ybWFsaXplID0gbm9ybWFsaXplO1xufSkodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgPyBtb2R1bGUuZXhwb3J0cyA6ICh0aGlzLlN0YWNreSA9IHRoaXMuU3RhY2t5IHx8IHt9KSk7XG5cbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuLyoqXG4gKiBAZmlsZW92ZXJ2aWV3XG4gKlxuICogWW91ciBlbnRyeSBwb2ludCBpbnRvIGB3ZWItY29tcG9uZW50LXRlc3RlcmAncyBlbnZpcm9ubWVudCBhbmQgY29uZmlndXJhdGlvbi5cbiAqL1xuKGZ1bmN0aW9uKCkge1xuXG52YXIgV0NUID0gd2luZG93LldDVCA9IHtcbiAgcmVwb3J0ZXJzOiB7fSxcbn07XG5cbi8vIENvbmZpZ3VyYXRpb25cblxuLyoqIEJ5IGRlZmF1bHQsIHdlIHdhaXQgZm9yIGFueSB3ZWIgY29tcG9uZW50IGZyYW1ld29ya3MgdG8gbG9hZC4gKi9cbldDVC53YWl0Rm9yRnJhbWV3b3JrcyA9IHRydWU7XG5cbi8qKiBIb3cgbWFueSBgLmh0bWxgIHN1aXRlcyB0aGF0IGNhbiBiZSBjb25jdXJyZW50bHkgbG9hZGVkICYgcnVuLiAqL1xuV0NULm51bUNvbmN1cnJlbnRTdWl0ZXMgPSA4O1xuXG4vLyBIZWxwZXJzXG5cbi8vIEV2YWx1YXRlZCBpbiBtb2NoYS9ydW4uanMuXG5XQ1QuX3N1aXRlc1RvTG9hZCA9IFtdO1xuV0NULl9kZXBlbmRlbmNpZXMgPSBbXTtcbi8qKlxuICogTG9hZHMgc3VpdGVzIG9mIHRlc3RzLCBzdXBwb3J0aW5nIGAuanNgIGFzIHdlbGwgYXMgYC5odG1sYCBmaWxlcy5cbiAqXG4gKiBAcGFyYW0geyFBcnJheS48c3RyaW5nPn0gZmlsZXMgVGhlIGZpbGVzIHRvIGxvYWQuXG4gKi9cbldDVC5sb2FkU3VpdGVzID0gZnVuY3Rpb24gbG9hZFN1aXRlcyhmaWxlcykge1xuICBmaWxlcy5mb3JFYWNoKGZ1bmN0aW9uKGZpbGUpIHtcbiAgICBpZiAoZmlsZS5zbGljZSgtMykgPT09ICcuanMnKSB7XG4gICAgICBXQ1QuX2RlcGVuZGVuY2llcy5wdXNoKGZpbGUpO1xuICAgIH0gZWxzZSBpZiAoZmlsZS5zbGljZSgtNSkgPT09ICcuaHRtbCcpIHtcbiAgICAgIFdDVC5fc3VpdGVzVG9Mb2FkLnB1c2goZmlsZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biByZXNvdXJjZSB0eXBlOiAnICsgZmlsZSk7XG4gICAgfVxuICB9KTtcbn07XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuV0NULnV0aWwgPSB7fTtcblxuLyoqXG4gKiBAcGFyYW0ge2Z1bmN0aW9uKCl9IGNhbGxiYWNrIEEgZnVuY3Rpb24gdG8gY2FsbCB3aGVuIHRoZSBhY3RpdmUgd2ViIGNvbXBvbmVudFxuICogICAgIGZyYW1ld29ya3MgaGF2ZSBsb2FkZWQuXG4gKi9cbldDVC51dGlsLndoZW5GcmFtZXdvcmtzUmVhZHkgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICBXQ1QudXRpbC5kZWJ1Zyh3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUsICdXQ1QudXRpbC53aGVuRnJhbWV3b3Jrc1JlYWR5Jyk7XG4gIHZhciBkb25lID0gZnVuY3Rpb24oKSB7XG4gICAgV0NULnV0aWwuZGVidWcod2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLCAnV0NULnV0aWwud2hlbkZyYW1ld29ya3NSZWFkeSBkb25lJyk7XG4gICAgY2FsbGJhY2soKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGltcG9ydHNSZWFkeSgpIHtcbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignSFRNTEltcG9ydHNMb2FkZWQnLCBpbXBvcnRzUmVhZHkpO1xuICAgIFdDVC51dGlsLmRlYnVnKHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSwgJ0hUTUxJbXBvcnRzTG9hZGVkJyk7XG5cbiAgICBpZiAod2luZG93LlBvbHltZXIgJiYgUG9seW1lci53aGVuUmVhZHkpIHtcbiAgICAgIFBvbHltZXIud2hlblJlYWR5KGZ1bmN0aW9uKCkge1xuICAgICAgICBXQ1QudXRpbC5kZWJ1Zyh3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUsICdwb2x5bWVyLXJlYWR5Jyk7XG4gICAgICAgIGRvbmUoKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBkb25lKCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQWxsIG91ciBzdXBwb3J0ZWQgZnJhbWV3b3JrIGNvbmZpZ3VyYXRpb25zIGRlcGVuZCBvbiBpbXBvcnRzLlxuICBpZiAoIXdpbmRvdy5IVE1MSW1wb3J0cykge1xuICAgIGRvbmUoKTtcbiAgfSBlbHNlIGlmIChIVE1MSW1wb3J0cy5yZWFkeSkge1xuICAgIGltcG9ydHNSZWFkeSgpO1xuICB9IGVsc2Uge1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdIVE1MSW1wb3J0c0xvYWRlZCcsIGltcG9ydHNSZWFkeSk7XG4gIH1cbn07XG5cbi8qKlxuICogQHBhcmFtIHtudW1iZXJ9IGNvdW50XG4gKiBAcGFyYW0ge3N0cmluZ30ga2luZFxuICogQHJldHVybiB7c3RyaW5nfSAnPGNvdW50PiA8a2luZD4gdGVzdHMnIG9yICc8Y291bnQ+IDxraW5kPiB0ZXN0Jy5cbiAqL1xuV0NULnV0aWwucGx1cmFsaXplZFN0YXQgPSBmdW5jdGlvbiBwbHVyYWxpemVkU3RhdChjb3VudCwga2luZCkge1xuICBpZiAoY291bnQgPT09IDEpIHtcbiAgICByZXR1cm4gY291bnQgKyAnICcgKyBraW5kICsgJyB0ZXN0JztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gY291bnQgKyAnICcgKyBraW5kICsgJyB0ZXN0cyc7XG4gIH1cbn07XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IHBhcmFtIFRoZSBwYXJhbSB0byByZXR1cm4gYSB2YWx1ZSBmb3IuXG4gKiBAcmV0dXJuIHs/c3RyaW5nfSBUaGUgZmlyc3QgdmFsdWUgZm9yIGBwYXJhbWAsIGlmIGZvdW5kLlxuICovXG5XQ1QudXRpbC5nZXRQYXJhbSA9IGZ1bmN0aW9uIGdldFBhcmFtKHBhcmFtKSB7XG4gIHZhciBxdWVyeSA9IHdpbmRvdy5sb2NhdGlvbi5zZWFyY2guc3Vic3RyaW5nKDEpO1xuICB2YXIgdmFycyA9IHF1ZXJ5LnNwbGl0KCcmJyk7XG4gIGZvciAodmFyIGk9MDtpPHZhcnMubGVuZ3RoO2krKykge1xuICAgIHZhciBwYWlyID0gdmFyc1tpXS5zcGxpdCgnPScpO1xuICAgIGlmIChkZWNvZGVVUklDb21wb25lbnQocGFpclswXSkgPT09IHBhcmFtKSB7XG4gICAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHBhaXJbMV0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbnVsbDtcbn07XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IHBhdGggVGhlIFVSSSBvZiB0aGUgc2NyaXB0IHRvIGxvYWQuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBkb25lXG4gKi9cbldDVC51dGlsLmxvYWRTY3JpcHQgPSBmdW5jdGlvbiBsb2FkU2NyaXB0KHBhdGgsIGRvbmUpIHtcbiAgdmFyIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICBzY3JpcHQuc3JjID0gcGF0aCArICc/JyArIE1hdGgucmFuZG9tKCk7XG4gIHNjcmlwdC5vbmxvYWQgPSBkb25lLmJpbmQobnVsbCwgbnVsbCk7XG4gIHNjcmlwdC5vbmVycm9yID0gZG9uZS5iaW5kKG51bGwsICdGYWlsZWQgdG8gbG9hZCBzY3JpcHQgJyArIHNjcmlwdC5zcmMpO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHNjcmlwdCk7XG59XG5cbi8qKiBAcmV0dXJuIHtzdHJpbmd9IGBsb2NhdGlvbmAgcmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgd2luZG93LiAqL1xuV0NULnV0aWwucmVsYXRpdmVMb2NhdGlvbiA9IGZ1bmN0aW9uIHJlbGF0aXZlTG9jYXRpb24obG9jYXRpb24pIHtcbiAgdmFyIHBhdGggPSBsb2NhdGlvbi5wYXRobmFtZTtcbiAgaWYgKHBhdGguaW5kZXhPZih3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUpID09PSAwKSB7XG4gICAgcGF0aCA9IHBhdGguc3Vic3RyKHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZS5sZW5ndGgpO1xuICB9XG4gIHJldHVybiBwYXRoO1xufVxuXG4vKipcbiAqXG4gKi9cbldDVC51dGlsLmRlYnVnID0gZnVuY3Rpb24gZGVidWcodmFyX2FyZ3MpIHtcbiAgaWYgKCFXQ1QuZGVidWcpIHJldHVybjtcbiAgY29uc29sZS5kZWJ1Zy5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpO1xufVxuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbldDVC5DTElTb2NrZXQgPSBDTElTb2NrZXQ7XG5cbnZhciBTT0NLRVRJT19FTkRQT0lOVCA9IHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCArICcvLycgKyB3aW5kb3cubG9jYXRpb24uaG9zdDtcbnZhciBTT0NLRVRJT19MSUJSQVJZICA9IFNPQ0tFVElPX0VORFBPSU5UICsgJy9zb2NrZXQuaW8vc29ja2V0LmlvLmpzJztcblxuLyoqXG4gKiBBIHNvY2tldCBmb3IgY29tbXVuaWNhdGlvbiBiZXR3ZWVuIHRoZSBDTEkgYW5kIGJyb3dzZXIgcnVubmVycy5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gYnJvd3NlcklkIEFuIElEIGdlbmVyYXRlZCBieSB0aGUgQ0xJIHJ1bm5lci5cbiAqIEBwYXJhbSB7IWlvLlNvY2tldH0gc29ja2V0IFRoZSBzb2NrZXQuaW8gYFNvY2tldGAgdG8gY29tbXVuaWNhdGUgb3Zlci5cbiAqL1xuZnVuY3Rpb24gQ0xJU29ja2V0KGJyb3dzZXJJZCwgc29ja2V0KSB7XG4gIHRoaXMuYnJvd3NlcklkID0gYnJvd3NlcklkO1xuICB0aGlzLnNvY2tldCAgICA9IHNvY2tldDtcbn1cblxuLyoqXG4gKiBAcGFyYW0geyFNb2NoYS5SdW5uZXJ9IHJ1bm5lciBUaGUgTW9jaGEgYFJ1bm5lcmAgdG8gb2JzZXJ2ZSwgcmVwb3J0aW5nXG4gKiAgICAgaW50ZXJlc3RpbmcgZXZlbnRzIGJhY2sgdG8gdGhlIENMSSBydW5uZXIuXG4gKi9cbkNMSVNvY2tldC5wcm90b3R5cGUub2JzZXJ2ZSA9IGZ1bmN0aW9uIG9ic2VydmUocnVubmVyKSB7XG4gIHRoaXMuZW1pdEV2ZW50KCdicm93c2VyLXN0YXJ0Jywge1xuICAgIHVybDogd2luZG93LmxvY2F0aW9uLnRvU3RyaW5nKCksXG4gIH0pO1xuXG4gIC8vIFdlIG9ubHkgZW1pdCBhIHN1YnNldCBvZiBldmVudHMgdGhhdCB3ZSBjYXJlIGFib3V0LCBhbmQgZm9sbG93IGEgbW9yZVxuICAvLyBnZW5lcmFsIGV2ZW50IGZvcm1hdCB0aGF0IGlzIGhvcGVmdWxseSBhcHBsaWNhYmxlIHRvIHRlc3QgcnVubmVycyBiZXlvbmRcbiAgLy8gbW9jaGEuXG4gIC8vXG4gIC8vIEZvciBhbGwgcG9zc2libGUgbW9jaGEgZXZlbnRzLCBzZWU6XG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS92aXNpb25tZWRpYS9tb2NoYS9ibG9iL21hc3Rlci9saWIvcnVubmVyLmpzI0wzNlxuICBydW5uZXIub24oJ3Rlc3QnLCBmdW5jdGlvbih0ZXN0KSB7XG4gICAgdGhpcy5lbWl0RXZlbnQoJ3Rlc3Qtc3RhcnQnLCB7dGVzdDogZ2V0VGl0bGVzKHRlc3QpfSk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3QpIHtcbiAgICB0aGlzLmVtaXRFdmVudCgndGVzdC1lbmQnLCB7XG4gICAgICBzdGF0ZTogICAgZ2V0U3RhdGUodGVzdCksXG4gICAgICB0ZXN0OiAgICAgZ2V0VGl0bGVzKHRlc3QpLFxuICAgICAgZHVyYXRpb246IHRlc3QuZHVyYXRpb24sXG4gICAgICBlcnJvcjogICAgdGVzdC5lcnIsXG4gICAgfSk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmVtaXRFdmVudCgnYnJvd3Nlci1lbmQnKTtcbiAgfS5iaW5kKHRoaXMpKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gZXZlbnQgVGhlIG5hbWUgb2YgdGhlIGV2ZW50IHRvIGZpcmUuXG4gKiBAcGFyYW0geyp9IGRhdGEgQWRkaXRpb25hbCBkYXRhIHRvIHBhc3Mgd2l0aCB0aGUgZXZlbnQuXG4gKi9cbkNMSVNvY2tldC5wcm90b3R5cGUuZW1pdEV2ZW50ID0gZnVuY3Rpb24gZW1pdEV2ZW50KGV2ZW50LCBkYXRhKSB7XG4gIHRoaXMuc29ja2V0LmVtaXQoJ2NsaWVudC1ldmVudCcsIHtcbiAgICBicm93c2VySWQ6IHRoaXMuYnJvd3NlcklkLFxuICAgIGV2ZW50OiAgICAgZXZlbnQsXG4gICAgZGF0YTogICAgICBkYXRhLFxuICB9KTtcbn07XG5cbi8qKlxuICogQnVpbGRzIGEgYENMSVNvY2tldGAgaWYgd2UgYXJlIHdpdGhpbiBhIENMSS1ydW4gZW52aXJvbm1lbnQ7IHNob3J0LWNpcmN1aXRzXG4gKiBvdGhlcndpc2UuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbigqLCBDTElTb2NrZXQpfSBkb25lIE5vZGUtc3R5bGUgY2FsbGJhY2suXG4gKi9cbkNMSVNvY2tldC5pbml0ID0gZnVuY3Rpb24gaW5pdChkb25lKSB7XG4gIHZhciBicm93c2VySWQgPSBXQ1QudXRpbC5nZXRQYXJhbSgnY2xpX2Jyb3dzZXJfaWQnKTtcbiAgaWYgKCFicm93c2VySWQpIHJldHVybiBkb25lKCk7XG5cbiAgV0NULnV0aWwubG9hZFNjcmlwdChTT0NLRVRJT19MSUJSQVJZLCBmdW5jdGlvbihlcnJvcikge1xuICAgIGlmIChlcnJvcikgcmV0dXJuIGRvbmUoZXJyb3IpO1xuXG4gICAgdmFyIHNvY2tldCA9IGlvKFNPQ0tFVElPX0VORFBPSU5UKTtcbiAgICBzb2NrZXQub24oJ2Vycm9yJywgZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgIHNvY2tldC5vZmYoKTtcbiAgICAgIGRvbmUoZXJyb3IpO1xuICAgIH0pO1xuXG4gICAgc29ja2V0Lm9uKCdjb25uZWN0JywgZnVuY3Rpb24oKSB7XG4gICAgICBzb2NrZXQub2ZmKCk7XG4gICAgICBkb25lKG51bGwsIG5ldyBDTElTb2NrZXQoYnJvd3NlcklkLCBzb2NrZXQpKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vLyBNaXNjIFV0aWxpdHlcblxuLyoqXG4gKiBAcGFyYW0geyFNb2NoYS5SdW5uYWJsZX0gcnVubmFibGUgVGhlIHRlc3Qgb3Igc3VpdGUgdG8gZXh0cmFjdCB0aXRsZXMgZnJvbS5cbiAqIEByZXR1cm4geyFBcnJheS48c3RyaW5nPn0gVGhlIHRpdGxlcyBvZiB0aGUgcnVubmFibGUgYW5kIGl0cyBwYXJlbnRzLlxuICovXG5mdW5jdGlvbiBnZXRUaXRsZXMocnVubmFibGUpIHtcbiAgdmFyIHRpdGxlcyA9IFtdO1xuICB3aGlsZSAocnVubmFibGUgJiYgIXJ1bm5hYmxlLnJvb3QgJiYgcnVubmFibGUudGl0bGUpIHtcbiAgICB0aXRsZXMudW5zaGlmdChydW5uYWJsZS50aXRsZSk7XG4gICAgcnVubmFibGUgPSBydW5uYWJsZS5wYXJlbnQ7XG4gIH1cbiAgcmV0dXJuIHRpdGxlcztcbn07XG5cbi8qKlxuICogQHBhcmFtIHshTW9jaGEuUnVubmFibGV9IHJ1bm5hYmxlXG4gKiBAcmV0dXJuIHtzdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIGdldFN0YXRlKHJ1bm5hYmxlKSB7XG4gIGlmIChydW5uYWJsZS5zdGF0ZSA9PT0gJ3Bhc3NlZCcpIHtcbiAgICByZXR1cm4gJ3Bhc3NpbmcnO1xuICB9IGVsc2UgaWYgKHJ1bm5hYmxlLnN0YXRlID09ICdmYWlsZWQnKSB7XG4gICAgcmV0dXJuICdmYWlsaW5nJztcbiAgfSBlbHNlIGlmIChydW5uYWJsZS5wZW5kaW5nKSB7XG4gICAgcmV0dXJuICdwZW5kaW5nJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gJ3Vua25vd24nO1xuICB9XG59O1xuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbi8qKlxuICogQSBNb2NoYSBzdWl0ZSAob3Igc3VpdGVzKSBydW4gd2l0aGluIGEgY2hpbGQgaWZyYW1lLCBidXQgcmVwb3J0ZWQgYXMgaWYgdGhleVxuICogYXJlIHBhcnQgb2YgdGhlIGN1cnJlbnQgY29udGV4dC5cbiAqL1xuZnVuY3Rpb24gU3ViU3VpdGUodXJsLCBwYXJlbnRTY29wZSkge1xuICB0aGlzLnVybCAgICAgICAgID0gdXJsICsgJz8nICsgTWF0aC5yYW5kb20oKTtcbiAgdGhpcy5wYXJlbnRTY29wZSA9IHBhcmVudFNjb3BlO1xuXG4gIHRoaXMuc3RhdGUgPSAnaW5pdGlhbGl6aW5nJztcbn1cbldDVC5TdWJTdWl0ZSA9IFN1YlN1aXRlO1xuXG4vLyBTdWJTdWl0ZXMgZ2V0IGEgcHJldHR5IGdlbmVyb3VzIGxvYWQgdGltZW91dCBieSBkZWZhdWx0LlxuU3ViU3VpdGUubG9hZFRpbWVvdXQgPSA1MDAwO1xuXG4vLyBXZSBjYW4ndCBtYWludGFpbiBwcm9wZXJ0aWVzIG9uIGlmcmFtZSBlbGVtZW50cyBpbiBGaXJlZm94L1NhZmFyaS8/Pz8sIHNvIHdlXG4vLyB0cmFjayBzdWJTdWl0ZXMgYnkgVVJMLlxuU3ViU3VpdGUuX2J5VXJsID0ge307XG5cbi8qKlxuICogQHJldHVybiB7U3ViU3VpdGV9IFRoZSBgU3ViU3VpdGVgIHRoYXQgd2FzIHJlZ2lzdGVyZWQgZm9yIHRoaXMgd2luZG93LlxuICovXG5TdWJTdWl0ZS5jdXJyZW50ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBTdWJTdWl0ZS5nZXQod2luZG93KTtcbn1cblxuLyoqXG4gKiBAcGFyYW0geyFXaW5kb3d9IHRhcmdldCBBIHdpbmRvdyB0byBmaW5kIHRoZSBTdWJTdWl0ZSBvZi5cbiAqIEByZXR1cm4ge1N1YlN1aXRlfSBUaGUgYFN1YlN1aXRlYCB0aGF0IHdhcyByZWdpc3RlcmVkIGZvciBgdGFyZ2V0YC5cbiAqL1xuU3ViU3VpdGUuZ2V0ID0gZnVuY3Rpb24odGFyZ2V0KSB7XG4gIHZhciBzdWJTdWl0ZSA9IFN1YlN1aXRlLl9ieVVybFt0YXJnZXQubG9jYXRpb24uaHJlZl07XG4gIGlmIChzdWJTdWl0ZSB8fCB3aW5kb3cucGFyZW50ID09PSB3aW5kb3cpIHJldHVybiBzdWJTdWl0ZTtcbiAgLy8gT3RoZXJ3aXNlLCB0cmF2ZXJzZS5cbiAgcmV0dXJuIHdpbmRvdy5wYXJlbnQuV0NULlN1YlN1aXRlLmdldCh0YXJnZXQpO1xufVxuXG4vKipcbiAqIExvYWRzIGFuZCBydW5zIHRoZSBzdWJzdWl0ZS5cbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBkb25lIE5vZGUtc3R5bGUgY2FsbGJhY2suXG4gKi9cblN1YlN1aXRlLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbihkb25lKSB7XG4gIFdDVC51dGlsLmRlYnVnKCdTdWJTdWl0ZSNydW4nLCB0aGlzLnVybCk7XG4gIHRoaXMuc3RhdGUgPSAnbG9hZGluZyc7XG4gIHRoaXMub25SdW5Db21wbGV0ZSA9IGRvbmU7XG5cbiAgdGhpcy5pZnJhbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpZnJhbWUnKTtcbiAgdGhpcy5pZnJhbWUuc3JjID0gdGhpcy51cmw7XG4gIHRoaXMuaWZyYW1lLmNsYXNzTGlzdC5hZGQoJ3N1YnN1aXRlJyk7XG5cbiAgdmFyIGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdWJzdWl0ZXMnKTtcbiAgaWYgKCFjb250YWluZXIpIHtcbiAgICBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBjb250YWluZXIuaWQgPSAnc3Vic3VpdGVzJztcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcilcbiAgfVxuICBjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5pZnJhbWUpO1xuXG4gIC8vIGxldCB0aGUgaWZyYW1lIGV4cGFuZCB0aGUgVVJMIGZvciB1cy5cbiAgdGhpcy51cmwgPSB0aGlzLmlmcmFtZS5zcmM7XG4gIFN1YlN1aXRlLl9ieVVybFt0aGlzLnVybF0gPSB0aGlzO1xuXG4gIHRoaXMudGltZW91dElkID0gc2V0VGltZW91dChcbiAgICAgIHRoaXMubG9hZGVkLmJpbmQodGhpcywgbmV3IEVycm9yKCdUaW1lZCBvdXQgbG9hZGluZyAnICsgdGhpcy51cmwpKSwgU3ViU3VpdGUubG9hZFRpbWVvdXQpO1xuXG4gIHRoaXMuaWZyYW1lLmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJyxcbiAgICAgIHRoaXMubG9hZGVkLmJpbmQodGhpcywgbmV3IEVycm9yKCdGYWlsZWQgdG8gbG9hZCBkb2N1bWVudCAnICsgdGhpcy51cmwpKSk7XG5cbiAgdGhpcy5pZnJhbWUuY29udGVudFdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgdGhpcy5sb2FkZWQuYmluZCh0aGlzLCBudWxsKSk7XG59O1xuXG4vKipcbiAqIENhbGxlZCB3aGVuIHRoZSBzdWIgc3VpdGUncyBpZnJhbWUgaGFzIGxvYWRlZCAob3IgZXJyb3JlZCBkdXJpbmcgbG9hZCkuXG4gKlxuICogQHBhcmFtIHsqfSBlcnJvciBUaGUgZXJyb3IgdGhhdCBvY2N1cmVkLCBpZiBhbnkuXG4gKi9cblN1YlN1aXRlLnByb3RvdHlwZS5sb2FkZWQgPSBmdW5jdGlvbihlcnJvcikge1xuICBpZiAodGhpcy50aW1lb3V0SWQpIHtcbiAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0SWQpO1xuICB9XG4gIGlmIChlcnJvcikge1xuICAgIHRoaXMuc2lnbmFsUnVuQ29tcGxldGUoZXJyb3IpO1xuICAgIHRoaXMuZG9uZSgpO1xuICB9XG59O1xuXG4vKiogQ2FsbGVkIHdoZW4gdGhlIHN1YiBzdWl0ZSdzIHRlc3RzIGFyZSBjb21wbGV0ZSwgc28gdGhhdCBpdCBjYW4gY2xlYW4gdXAuICovXG5TdWJTdWl0ZS5wcm90b3R5cGUuZG9uZSA9IGZ1bmN0aW9uIGRvbmUoKSB7XG4gIFdDVC51dGlsLmRlYnVnKCdTdWJTdWl0ZSNkb25lJywgdGhpcy51cmwsIGFyZ3VtZW50cyk7XG4gIHRoaXMuc2lnbmFsUnVuQ29tcGxldGUoKTtcblxuICBpZiAoIXRoaXMuaWZyYW1lKSByZXR1cm47XG4gIHRoaXMuaWZyYW1lLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5pZnJhbWUpO1xufTtcblxuU3ViU3VpdGUucHJvdG90eXBlLnNpZ25hbFJ1bkNvbXBsZXRlID0gZnVuY3Rpb24gc2lnbmFsUnVuQ29tcGxldGUoZXJyb3IpIHtcbiAgaWYgKCF0aGlzLm9uUnVuQ29tcGxldGUpIHJldHVybjtcbiAgdGhpcy5zdGF0ZSA9ICdjb21wbGV0ZSc7XG4gIHRoaXMub25SdW5Db21wbGV0ZShlcnJvcik7XG4gIHRoaXMub25SdW5Db21wbGV0ZSA9IG51bGw7XG59XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cblxudmFyIGFzc2VydCA9IGNoYWkuYXNzZXJ0O1xudmFyIGV4cGVjdCA9IGNoYWkuZXhwZWN0O1xuXG4vLyBXZSBwcmVmZXIgdG8gZ2V0IGFzIG11Y2ggc3RhY2sgaW5mb3JtYXRpb24gYXMgcG9zc2libGUuXG5jaGFpLmNvbmZpZy5pbmNsdWRlU3RhY2sgPSB0cnVlO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbi8vIHBvbHltZXItdGVzdC10b29scyAoYW5kIFBvbHltZXIvdG9vbHMpIHN1cHBvcnQgSFRNTCB0ZXN0cyB3aGVyZSBlYWNoIGZpbGUgaXNcbi8vIGV4cGVjdGVkIHRvIGNhbGwgYGRvbmUoKWAsIHdoaWNoIHBvc3RzIGEgbWVzc2FnZSB0byB0aGUgcGFyZW50IHdpbmRvdy5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgaWYgKCFldmVudC5kYXRhIHx8IChldmVudC5kYXRhICE9PSAnb2snICYmICFldmVudC5kYXRhLmVycm9yKSkgcmV0dXJuO1xuICB2YXIgc3ViU3VpdGUgPSBXQ1QuU3ViU3VpdGUuZ2V0KGV2ZW50LnNvdXJjZSk7XG4gIGlmICghc3ViU3VpdGUpIHJldHVybjtcblxuICAvLyBUaGUgbmFtZSBvZiB0aGUgc3VpdGUgYXMgZXhwb3NlZCB0byB0aGUgdXNlci5cbiAgdmFyIHBhdGggPSBXQ1QudXRpbC5yZWxhdGl2ZUxvY2F0aW9uKGV2ZW50LnNvdXJjZS5sb2NhdGlvbik7XG5cbiAgdmFyIHBhcmVudFJ1bm5lciA9IHN1YlN1aXRlLnBhcmVudFNjb3BlLldDVC5fbXVsdGlSdW5uZXI7XG4gIHBhcmVudFJ1bm5lci5lbWl0T3V0T2ZCYW5kVGVzdChwYXRoLCBldmVudC5kYXRhLmVycm9yLCB0cnVlKTtcblxuICBzdWJTdWl0ZS5kb25lKCk7XG59KTtcblxufSkoKTtcbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuXG4vKipcbiAqIEl0IGlzIG9mdGVuIHVzZWZ1bCB0byB0cmlnZ2VyIGEgUGxhdGZvcm0uZmx1c2gsIGFuZCBwZXJmb3JtIHdvcmsgb24gdGhlIG5leHRcbiAqIHJ1biBsb29wIHRpY2suXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2tcbiAqL1xuZnVuY3Rpb24gYXN5bmNQbGF0Zm9ybUZsdXNoKGNhbGxiYWNrKSB7XG4gIGlmICh3aW5kb3cuUGxhdGZvcm0gJiYgd2luZG93LlBsYXRmb3JtLmZsdXNoKSBQbGF0Zm9ybS5mbHVzaCgpO1xuICBhc3luYy5uZXh0VGljayhjYWxsYmFjayk7XG59XG5cbi8qKlxuICpcbiAqL1xuZnVuY3Rpb24gd2FpdEZvcihmbiwgbmV4dCwgaW50ZXJ2YWxPck11dGF0aW9uRWwsIHRpbWVvdXQsIHRpbWVvdXRUaW1lKSB7XG4gIHRpbWVvdXRUaW1lID0gdGltZW91dFRpbWUgfHwgRGF0ZS5ub3coKSArICh0aW1lb3V0IHx8IDEwMDApO1xuICBpbnRlcnZhbE9yTXV0YXRpb25FbCA9IGludGVydmFsT3JNdXRhdGlvbkVsIHx8IDMyO1xuICB0cnkge1xuICAgIGZuKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBpZiAoRGF0ZS5ub3coKSA+IHRpbWVvdXRUaW1lKSB7XG4gICAgICB0aHJvdyBlO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoaXNOYU4oaW50ZXJ2YWxPck11dGF0aW9uRWwpKSB7XG4gICAgICAgIGludGVydmFsT3JNdXRhdGlvbkVsLm9uTXV0YXRpb24oaW50ZXJ2YWxPck11dGF0aW9uRWwsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHdhaXRGb3IoZm4sIG5leHQsIGludGVydmFsT3JNdXRhdGlvbkVsLCB0aW1lb3V0LCB0aW1lb3V0VGltZSk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICB3YWl0Rm9yKGZuLCBuZXh0LCBpbnRlcnZhbE9yTXV0YXRpb25FbCwgdGltZW91dCwgdGltZW91dFRpbWUpO1xuICAgICAgICB9LCBpbnRlcnZhbE9yTXV0YXRpb25FbCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG4gIG5leHQoKTtcbn07XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuV0NULk11bHRpUnVubmVyID0gTXVsdGlSdW5uZXI7XG5cbnZhciBTVEFDS1lfQ09ORklHID0ge1xuICBpbmRlbnQ6ICcgICcsXG4gIGxvY2F0aW9uU3RyaXA6IFtcbiAgICAvXmh0dHBzPzpcXC9cXC9bXlxcL10rLyxcbiAgICAvXFw/W1xcZFxcLl0rJC8sXG4gIF0sXG4gIGZpbHRlcjogZnVuY3Rpb24obGluZSkge1xuICAgIHJldHVybiBsaW5lLmxvY2F0aW9uLm1hdGNoKC93ZWItY29tcG9uZW50LXRlc3RlclxcL2Jyb3dzZXIuanMvKTtcbiAgfSxcbn07XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS92aXNpb25tZWRpYS9tb2NoYS9ibG9iL21hc3Rlci9saWIvcnVubmVyLmpzI0wzNi00NlxudmFyIE1PQ0hBX0VWRU5UUyA9IFtcbiAgJ3N0YXJ0JyxcbiAgJ2VuZCcsXG4gICdzdWl0ZScsXG4gICdzdWl0ZSBlbmQnLFxuICAndGVzdCcsXG4gICd0ZXN0IGVuZCcsXG4gICdob29rJyxcbiAgJ2hvb2sgZW5kJyxcbiAgJ3Bhc3MnLFxuICAnZmFpbCcsXG4gICdwZW5kaW5nJyxcbl07XG5cbi8vIFVudGlsIGEgc3VpdGUgaGFzIGxvYWRlZCwgd2UgYXNzdW1lIHRoaXMgbWFueSB0ZXN0cyBpbiBpdC5cbnZhciBFU1RJTUFURURfVEVTVFNfUEVSX1NVSVRFID0gMztcblxuLyoqXG4gKiBBIE1vY2hhLWxpa2UgcnVubmVyIHRoYXQgY29tYmluZXMgdGhlIG91dHB1dCBvZiBtdWx0aXBsZSBNb2NoYSBzdWl0ZXMuXG4gKlxuICogQHBhcmFtIHtudW1iZXJ9IG51bVN1aXRlcyBUaGUgbnVtYmVyIG9mIHN1aXRlcyB0aGF0IHdpbGwgYmUgcnVuLCBpbiBvcmRlciB0b1xuICogICAgIGVzdGltYXRlIHRoZSB0b3RhbCBudW1iZXIgb2YgdGVzdHMgdGhhdCB3aWxsIGJlIHBlcmZvcm1lZC5cbiAqIEBwYXJhbSB7IUFycmF5LjwhTW9jaGEucmVwb3J0ZXJzLkJhc2U+fSByZXBvcnRlcnMgVGhlIHNldCBvZiByZXBvcnRlcnMgdGhhdFxuICogICAgIHNob3VsZCByZWNlaXZlIHRoZSB1bmlmaWVkIGV2ZW50IHN0cmVhbS5cbiAqL1xuZnVuY3Rpb24gTXVsdGlSdW5uZXIobnVtU3VpdGVzLCByZXBvcnRlcnMpIHtcbiAgdGhpcy5yZXBvcnRlcnMgPSByZXBvcnRlcnMubWFwKGZ1bmN0aW9uKHJlcG9ydGVyKSB7XG4gICAgcmV0dXJuIG5ldyByZXBvcnRlcih0aGlzKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICB0aGlzLnRvdGFsID0gbnVtU3VpdGVzICogRVNUSU1BVEVEX1RFU1RTX1BFUl9TVUlURTtcbiAgLy8gTW9jaGEgcmVwb3J0ZXJzIGFzc3VtZSBhIHN0cmVhbSBvZiBldmVudHMsIHNvIHdlIGhhdmUgdG8gYmUgY2FyZWZ1bCB0byBvbmx5XG4gIC8vIHJlcG9ydCBvbiBvbmUgcnVubmVyIGF0IGEgdGltZS4uLlxuICB0aGlzLmN1cnJlbnRSdW5uZXIgPSBudWxsO1xuICAvLyAuLi53aGlsZSB3ZSBidWZmZXIgZXZlbnRzIGZvciBhbnkgb3RoZXIgYWN0aXZlIHJ1bm5lcnMuXG4gIHRoaXMucGVuZGluZ0V2ZW50cyA9IFtdO1xuXG4gIHRoaXMuZW1pdCgnc3RhcnQnKTtcbn1cbi8vIE1vY2hhIGRvZXNuJ3QgZXhwb3NlIGl0cyBgRXZlbnRFbWl0dGVyYCBzaGltIGRpcmVjdGx5LCBzbzpcbk11bHRpUnVubmVyLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoT2JqZWN0LmdldFByb3RvdHlwZU9mKE1vY2hhLlJ1bm5lci5wcm90b3R5cGUpKTtcblxuLyoqXG4gKiBAcmV0dXJuIHshTW9jaGEucmVwb3J0ZXJzLkJhc2V9IEEgcmVwb3J0ZXItbGlrZSBcImNsYXNzXCIgZm9yIGVhY2ggY2hpbGQgc3VpdGVcbiAqICAgICB0aGF0IHNob3VsZCBiZSBwYXNzZWQgdG8gYG1vY2hhLnJ1bmAuXG4gKi9cbk11bHRpUnVubmVyLnByb3RvdHlwZS5jaGlsZFJlcG9ydGVyID0gZnVuY3Rpb24gY2hpbGRSZXBvcnRlcihuYW1lKSB7XG4gIC8vIFRoZSByZXBvcnRlciBpcyB1c2VkIGFzIGEgY29uc3RydWN0b3IsIHNvIHdlIGNhbid0IGRlcGVuZCBvbiBgdGhpc2AgYmVpbmdcbiAgLy8gcHJvcGVybHkgYm91bmQuXG4gIHZhciBzZWxmID0gdGhpcztcbiAgcmV0dXJuIGZ1bmN0aW9uIGNoaWxkUmVwb3J0ZXIocnVubmVyKSB7XG4gICAgcnVubmVyLm5hbWUgPSBuYW1lO1xuICAgIHNlbGYuYmluZENoaWxkUnVubmVyKHJ1bm5lcik7XG4gIH07XG59O1xuXG4vKiogTXVzdCBiZSBjYWxsZWQgb25jZSBhbGwgcnVubmVycyBoYXZlIGZpbmlzaGVkLiAqL1xuTXVsdGlSdW5uZXIucHJvdG90eXBlLmRvbmUgPSBmdW5jdGlvbiBkb25lKCkge1xuICB0aGlzLmNvbXBsZXRlID0gdHJ1ZTtcbiAgdGhpcy5lbWl0KCdlbmQnKTtcbiAgdGhpcy5mbHVzaFBlbmRpbmdFdmVudHMoKTtcbn07XG5cbi8qKlxuICogRW1pdCBhIHRvcCBsZXZlbCB0ZXN0IHRoYXQgaXMgbm90IHBhcnQgb2YgYW55IHN1aXRlIG1hbmFnZWQgYnkgdGhpcyBydW5uZXIuXG4gKlxuICogSGVscGZ1bCBmb3IgcmVwb3J0aW5nIG9uIGdsb2JhbCBlcnJvcnMsIGxvYWRpbmcgaXNzdWVzLCBldGMuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHRpdGxlIFRoZSB0aXRsZSBvZiB0aGUgdGVzdC5cbiAqIEBwYXJhbSB7Kn0gb3B0X2Vycm9yIEFuIGVycm9yIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHRlc3QuIElmIGZhbHN5LCB0ZXN0IGlzXG4gKiAgICAgY29uc2lkZXJlZCB0byBiZSBwYXNzaW5nLlxuICogQHBhcmFtIHs/Ym9vbGVhbn0gb3B0X2VzdGltYXRlZCBJZiB0aGlzIHRlc3Qgd2FzIGluY2x1ZGVkIGluIHRoZSBvcmlnaW5hbFxuICogICAgIGVzdGltYXRlIG9mIGBudW1TdWl0ZXNgLlxuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUuZW1pdE91dE9mQmFuZFRlc3QgPSBmdW5jdGlvbiBlbWl0T3V0T2ZCYW5kVGVzdCh0aXRsZSwgb3B0X2Vycm9yLCBvcHRfZXN0aW1hdGVkKSB7XG4gIHZhciByb290ID0gbmV3IE1vY2hhLlN1aXRlKCk7XG4gIHZhciB0ZXN0ID0gbmV3IE1vY2hhLlRlc3QodGl0bGUsIGZ1bmN0aW9uKCkge1xuICB9KTtcbiAgdGVzdC5wYXJlbnQgPSByb290O1xuICB0ZXN0LnN0YXRlICA9IG9wdF9lcnJvciA/ICdmYWlsZWQnIDogJ3Bhc3NlZCc7XG4gIHRlc3QuZXJyICAgID0gb3B0X2Vycm9yO1xuXG4gIGlmICghb3B0X2VzdGltYXRlZCkge1xuICAgIHRoaXMudG90YWwgPSB0aGlzLnRvdGFsICsgRVNUSU1BVEVEX1RFU1RTX1BFUl9TVUlURTtcbiAgfVxuXG4gIHZhciBydW5uZXIgPSB7dG90YWw6IDF9O1xuICB0aGlzLnByb3h5RXZlbnQoJ3N0YXJ0JywgcnVubmVyKTtcbiAgdGhpcy5wcm94eUV2ZW50KCdzdWl0ZScsIHJ1bm5lciwgcm9vdCk7XG4gIHRoaXMucHJveHlFdmVudCgndGVzdCcsIHJ1bm5lciwgdGVzdCk7XG4gIGlmIChvcHRfZXJyb3IpIHtcbiAgICB0aGlzLnByb3h5RXZlbnQoJ2ZhaWwnLCBydW5uZXIsIHRlc3QsIG9wdF9lcnJvcik7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5wcm94eUV2ZW50KCdwYXNzJywgcnVubmVyLCB0ZXN0KTtcbiAgfVxuICB0aGlzLnByb3h5RXZlbnQoJ3Rlc3QgZW5kJywgcnVubmVyLCB0ZXN0KTtcbiAgdGhpcy5wcm94eUV2ZW50KCdzdWl0ZSBlbmQnLCBydW5uZXIsIHJvb3QpO1xuICB0aGlzLnByb3h5RXZlbnQoJ2VuZCcsIHJ1bm5lcik7XG59O1xuXG4vLyBJbnRlcm5hbCBJbnRlcmZhY2VcblxuLyoqIEBwYXJhbSB7IU1vY2hhLnJ1bm5lcnMuQmFzZX0gcnVubmVyIFRoZSBydW5uZXIgdG8gbGlzdGVuIHRvIGV2ZW50cyBmb3IuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUuYmluZENoaWxkUnVubmVyID0gZnVuY3Rpb24gYmluZENoaWxkUnVubmVyKHJ1bm5lcikge1xuICBNT0NIQV9FVkVOVFMuZm9yRWFjaChmdW5jdGlvbihldmVudE5hbWUpIHtcbiAgICBydW5uZXIub24oZXZlbnROYW1lLCB0aGlzLnByb3h5RXZlbnQuYmluZCh0aGlzLCBldmVudE5hbWUsIHJ1bm5lcikpO1xuICB9LmJpbmQodGhpcykpO1xufTtcblxuLyoqXG4gKiBFdmFsdWF0ZXMgYW4gZXZlbnQgZmlyZWQgYnkgYHJ1bm5lcmAsIHByb3h5aW5nIGl0IGZvcndhcmQgb3IgYnVmZmVyaW5nIGl0LlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBldmVudE5hbWVcbiAqIEBwYXJhbSB7IU1vY2hhLnJ1bm5lcnMuQmFzZX0gcnVubmVyIFRoZSBydW5uZXIgdGhhdCBlbWl0dGVkIHRoaXMgZXZlbnQuXG4gKiBAcGFyYW0gey4uLip9IHZhcl9hcmdzIEFueSBhZGRpdGlvbmFsIGRhdGEgcGFzc2VkIGFzIHBhcnQgb2YgdGhlIGV2ZW50LlxuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUucHJveHlFdmVudCA9IGZ1bmN0aW9uIHByb3h5RXZlbnQoZXZlbnROYW1lLCBydW5uZXIsIHZhcl9hcmdzKSB7XG4gIHZhciBleHRyYUFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICBpZiAodGhpcy5jb21wbGV0ZSkge1xuICAgIGNvbnNvbGUud2Fybignb3V0IG9mIG9yZGVyIE1vY2hhIGV2ZW50IGZvciAnICsgcnVubmVyLm5hbWUgKyAnOicsIGV2ZW50TmFtZSwgZXh0cmFBcmdzKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5jdXJyZW50UnVubmVyICYmIHJ1bm5lciAhPT0gdGhpcy5jdXJyZW50UnVubmVyKSB7XG4gICAgdGhpcy5wZW5kaW5nRXZlbnRzLnB1c2goYXJndW1lbnRzKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoZXZlbnROYW1lID09PSAnc3RhcnQnKSB7XG4gICAgdGhpcy5vblJ1bm5lclN0YXJ0KHJ1bm5lcik7XG4gIH0gZWxzZSBpZiAoZXZlbnROYW1lID09PSAnZW5kJykge1xuICAgIHRoaXMub25SdW5uZXJFbmQocnVubmVyKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLmNsZWFuRXZlbnQoZXZlbnROYW1lLCBleHRyYUFyZ3MpO1xuICAgIHRoaXMuZW1pdC5hcHBseSh0aGlzLCBbZXZlbnROYW1lXS5jb25jYXQoZXh0cmFBcmdzKSk7XG4gIH1cbn07XG5cbi8qKlxuICogQ2xlYW5zIG9yIG1vZGlmaWVzIGFuIGV2ZW50IGlmIG5lZWRlZC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gZXZlbnROYW1lXG4gKiBAcGFyYW0geyFBcnJheS48Kj59IGV4dHJhQXJnc1xuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUuY2xlYW5FdmVudCA9IGZ1bmN0aW9uIGNsZWFuRXZlbnQoZXZlbnROYW1lLCBleHRyYUFyZ3MpIHtcbiAgaWYgKGV2ZW50TmFtZSA9PT0gJ2ZhaWwnKSB7XG4gICAgZXh0cmFBcmdzWzFdID0gU3RhY2t5Lm5vcm1hbGl6ZShleHRyYUFyZ3NbMV0sIFNUQUNLWV9DT05GSUcpO1xuICB9XG4gIGlmIChleHRyYUFyZ3NbMF0gJiYgZXh0cmFBcmdzWzBdLmVycikge1xuICAgIGV4dHJhQXJnc1swXS5lcnIgPSBTdGFja3kubm9ybWFsaXplKGV4dHJhQXJnc1swXS5lcnIsIFNUQUNLWV9DT05GSUcpO1xuICB9XG5cbn07XG5cbi8qKiBAcGFyYW0geyFNb2NoYS5ydW5uZXJzLkJhc2V9IHJ1bm5lciAqL1xuTXVsdGlSdW5uZXIucHJvdG90eXBlLm9uUnVubmVyU3RhcnQgPSBmdW5jdGlvbiBvblJ1bm5lclN0YXJ0KHJ1bm5lcikge1xuICBXQ1QudXRpbC5kZWJ1ZygnTXVsdGlSdW5uZXIjb25SdW5uZXJTdGFydDonLCBydW5uZXIubmFtZSk7XG4gIHRoaXMudG90YWwgPSB0aGlzLnRvdGFsIC0gRVNUSU1BVEVEX1RFU1RTX1BFUl9TVUlURSArIHJ1bm5lci50b3RhbDtcbiAgdGhpcy5jdXJyZW50UnVubmVyID0gcnVubmVyO1xufTtcblxuLyoqIEBwYXJhbSB7IU1vY2hhLnJ1bm5lcnMuQmFzZX0gcnVubmVyICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUub25SdW5uZXJFbmQgPSBmdW5jdGlvbiBvblJ1bm5lckVuZChydW5uZXIpIHtcbiAgV0NULnV0aWwuZGVidWcoJ011bHRpUnVubmVyI29uUnVubmVyRW5kOicsIHJ1bm5lci5uYW1lKTtcbiAgdGhpcy5jdXJyZW50UnVubmVyID0gbnVsbDtcbiAgdGhpcy5mbHVzaFBlbmRpbmdFdmVudHMoKTtcbn07XG5cbi8qKlxuICogRmx1c2hlcyBhbnkgYnVmZmVyZWQgZXZlbnRzIGFuZCBydW5zIHRoZW0gdGhyb3VnaCBgcHJveHlFdmVudGAuIFRoaXMgd2lsbFxuICogbG9vcCB1bnRpbCBhbGwgYnVmZmVyZWQgcnVubmVycyBhcmUgY29tcGxldGUsIG9yIHdlIGhhdmUgcnVuIG91dCBvZiBidWZmZXJlZFxuICogZXZlbnRzLlxuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUuZmx1c2hQZW5kaW5nRXZlbnRzID0gZnVuY3Rpb24gZmx1c2hQZW5kaW5nRXZlbnRzKCkge1xuICB2YXIgZXZlbnRzID0gdGhpcy5wZW5kaW5nRXZlbnRzO1xuICB0aGlzLnBlbmRpbmdFdmVudHMgPSBbXTtcbiAgZXZlbnRzLmZvckVhY2goZnVuY3Rpb24oZXZlbnRBcmdzKSB7XG4gICAgdGhpcy5wcm94eUV2ZW50LmFwcGx5KHRoaXMsIGV2ZW50QXJncyk7XG4gIH0uYmluZCh0aGlzKSk7XG59O1xuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4vKipcbiAqIEBmaWxlb3ZlcnZpZXdcbiAqXG4gKiBSdW5zIGFsbCB0ZXN0cyBkZXNjcmliZWQgYnkgdGhpcyBkb2N1bWVudCwgYWZ0ZXIgZ2l2aW5nIHRoZSBkb2N1bWVudCBhIGNoYW5jZVxuICogdG8gbG9hZC5cbiAqXG4gKiBJZiBgV0NULndhaXRGb3JGcmFtZXdvcmtzYCBpcyB0cnVlICh0aGUgZGVmYXVsdCksIHdlIHdpbGwgYWxzbyB3YWl0IGZvciBhbnlcbiAqIHByZXNlbnQgd2ViIGNvbXBvbmVudCBmcmFtZXdvcmtzIHRvIGhhdmUgZnVsbHkgaW5pdGlhbGl6ZWQgYXMgd2VsbC5cbiAqL1xuKGZ1bmN0aW9uKCkge1xuXG4vLyBHaXZlIGFueSBzY3JpcHRzIG9uIHRoZSBwYWdlIGEgY2hhbmNlIHRvIHR3aWRkbGUgdGhlIGVudmlyb25tZW50LlxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGZ1bmN0aW9uKCkge1xuICBXQ1QudXRpbC5kZWJ1ZygncnVuIHN0YWdlOiBET01Db250ZW50TG9hZGVkJyk7XG4gIHZhciBzdWJTdWl0ZSA9IFdDVC5TdWJTdWl0ZS5jdXJyZW50KCk7XG4gIGlmIChzdWJTdWl0ZSkge1xuICAgIFdDVC51dGlsLmRlYnVnKCdydW4gc3RhZ2U6IHN1YnN1aXRlJyk7XG4gICAgLy8gR2l2ZSB0aGUgc3Vic3VpdGUgdGltZSB0byBjb21wbGV0ZSBpdHMgbG9hZCAoc2VlIGBTdWJTdWl0ZS5sb2FkYCkuXG4gICAgYXN5bmMubmV4dFRpY2socnVuU3ViU3VpdGUuYmluZChudWxsLCBzdWJTdWl0ZSkpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEJlZm9yZSBhbnl0aGluZyBlbHNlLCB3ZSBuZWVkIHRvIGVuc3VyZSBvdXIgY29tbXVuaWNhdGlvbiBjaGFubmVsIHdpdGggdGhlXG4gIC8vIENMSSBydW5uZXIgaXMgZXN0YWJsaXNoZWQgKGlmIHdlJ3JlIHJ1bm5pbmcgaW4gdGhhdCBjb250ZXh0KS4gTGVzc1xuICAvLyBidWZmZXJpbmcgdG8gZGVhbCB3aXRoLlxuICBXQ1QuQ0xJU29ja2V0LmluaXQoZnVuY3Rpb24oZXJyb3IsIHNvY2tldCkge1xuICAgIFdDVC51dGlsLmRlYnVnKCdydW4gc3RhZ2U6IFdDVC5DTElTb2NrZXQuaW5pdCBkb25lJywgZXJyb3IpO1xuICAgIGlmIChlcnJvcikgdGhyb3cgZXJyb3I7XG5cbiAgICBsb2FkRGVwZW5kZW5jaWVzKGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICBXQ1QudXRpbC5kZWJ1ZygncnVuIHN0YWdlOiBsb2FkRGVwZW5kZW5jaWVzIGRvbmUnLCBlcnJvcik7XG4gICAgICBpZiAoZXJyb3IpIHRocm93IGVycm9yO1xuXG4gICAgICBydW5NdWx0aVN1aXRlKGRldGVybWluZVJlcG9ydGVycyhzb2NrZXQpKTtcbiAgICB9KTtcbiAgfSk7XG59KTtcblxuLyoqXG4gKiBMb2FkcyBhbnkgZGVwZW5kZW5jaWVzIG9mIHRoZSBfY3VycmVudF8gc3VpdGUgKGUuZy4gYC5qc2Agc291cmNlcykuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gZG9uZSBBIG5vZGUgc3R5bGUgY2FsbGJhY2suXG4gKi9cbmZ1bmN0aW9uIGxvYWREZXBlbmRlbmNpZXMoZG9uZSkge1xuICBXQ1QudXRpbC5kZWJ1ZygnbG9hZERlcGVuZGVuY2llczonLCBXQ1QuX2RlcGVuZGVuY2llcyk7XG4gIHZhciBsb2FkZXJzID0gV0NULl9kZXBlbmRlbmNpZXMubWFwKGZ1bmN0aW9uKGZpbGUpIHtcbiAgICAvLyBXZSBvbmx5IHN1cHBvcnQgYC5qc2AgZGVwZW5kZW5jaWVzIGZvciBub3cuXG4gICAgcmV0dXJuIFdDVC51dGlsLmxvYWRTY3JpcHQuYmluZChXQ1QudXRpbCwgZmlsZSk7XG4gIH0pO1xuXG4gIGFzeW5jLnBhcmFsbGVsKGxvYWRlcnMsIGRvbmUpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7IVdDVC5TdWJTdWl0ZX0gc3ViU3VpdGUgVGhlIGBTdWJTdWl0ZWAgZm9yIHRoaXMgZnJhbWUsIHRoYXQgYG1vY2hhYFxuICogICAgIHNob3VsZCBiZSBydW4gZm9yLlxuICovXG5mdW5jdGlvbiBydW5TdWJTdWl0ZShzdWJTdWl0ZSkge1xuICBXQ1QudXRpbC5kZWJ1ZygncnVuU3ViU3VpdGUnLCB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUpO1xuICAvLyBOb3QgdmVyeSBwcmV0dHkuXG4gIHZhciBwYXJlbnRXQ1QgPSBzdWJTdWl0ZS5wYXJlbnRTY29wZS5XQ1Q7XG4gIHZhciBzdWl0ZU5hbWUgPSBwYXJlbnRXQ1QudXRpbC5yZWxhdGl2ZUxvY2F0aW9uKHdpbmRvdy5sb2NhdGlvbik7XG4gIHZhciByZXBvcnRlciAgPSBwYXJlbnRXQ1QuX211bHRpUnVubmVyLmNoaWxkUmVwb3J0ZXIoc3VpdGVOYW1lKTtcbiAgcnVuTW9jaGEocmVwb3J0ZXIsIHN1YlN1aXRlLmRvbmUuYmluZChzdWJTdWl0ZSkpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7IUFycmF5LjwhTW9jaGEucmVwb3J0ZXJzLkJhc2U+fSByZXBvcnRlcnMgVGhlIHJlcG9ydGVycyB0aGF0IHNob3VsZFxuICogICAgIGNvbnN1bWUgdGhlIG91dHB1dCBvZiB0aGlzIGBNdWx0aVJ1bm5lcmAuXG4gKi9cbmZ1bmN0aW9uIHJ1bk11bHRpU3VpdGUocmVwb3J0ZXJzKSB7XG4gIFdDVC51dGlsLmRlYnVnKCdydW5NdWx0aVN1aXRlJywgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lKTtcbiAgdmFyIHJvb3ROYW1lID0gV0NULnV0aWwucmVsYXRpdmVMb2NhdGlvbih3aW5kb3cubG9jYXRpb24pO1xuICB2YXIgcnVubmVyICAgPSBuZXcgV0NULk11bHRpUnVubmVyKFdDVC5fc3VpdGVzVG9Mb2FkLmxlbmd0aCArIDEsIHJlcG9ydGVycyk7XG4gIFdDVC5fbXVsdGlSdW5uZXIgPSBydW5uZXI7XG5cbiAgdmFyIHN1aXRlUnVubmVycyA9IFtcbiAgICAvLyBSdW4gdGhlIGxvY2FsIHRlc3RzIChpZiBhbnkpIGZpcnN0LCBub3Qgc3RvcHBpbmcgb24gZXJyb3I7XG4gICAgcnVuTW9jaGEuYmluZChudWxsLCBydW5uZXIuY2hpbGRSZXBvcnRlcihyb290TmFtZSkpLFxuICBdO1xuXG4gIC8vIEFzIHdlbGwgYXMgYW55IHN1YiBzdWl0ZXMuIEFnYWluLCBkb24ndCBzdG9wIG9uIGVycm9yLlxuICBXQ1QuX3N1aXRlc1RvTG9hZC5mb3JFYWNoKGZ1bmN0aW9uKGZpbGUpIHtcbiAgICBzdWl0ZVJ1bm5lcnMucHVzaChmdW5jdGlvbihuZXh0KSB7XG4gICAgICB2YXIgc3ViU3VpdGUgPSBuZXcgV0NULlN1YlN1aXRlKGZpbGUsIHdpbmRvdyk7XG4gICAgICBzdWJTdWl0ZS5ydW4oZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yKSBydW5uZXIuZW1pdE91dE9mQmFuZFRlc3QoZmlsZSwgZXJyb3IpO1xuICAgICAgICBuZXh0KCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgYXN5bmMucGFyYWxsZWxMaW1pdChzdWl0ZVJ1bm5lcnMsIFdDVC5udW1Db25jdXJyZW50U3VpdGVzLCBmdW5jdGlvbihlcnJvcikge1xuICAgIFdDVC51dGlsLmRlYnVnKCdydW5NdWx0aVN1aXRlIGRvbmUnLCBlcnJvcik7XG4gICAgcnVubmVyLmRvbmUoKTtcbiAgfSk7XG59XG5cbi8qKlxuICogS2lja3Mgb2ZmIGEgbW9jaGEgcnVuLCB3YWl0aW5nIGZvciBmcmFtZXdvcmtzIHRvIGxvYWQgaWYgbmVjZXNzYXJ5LlxuICpcbiAqIEBwYXJhbSB7IU1vY2hhLnJlcG9ydGVycy5CYXNlfSByZXBvcnRlciBUaGUgcmVwb3J0ZXIgdG8gcGFzcyB0byBgbW9jaGEucnVuYC5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRvbmUgQSBjYWxsYmFjayBmaXJlZCwgX25vIGVycm9yIGlzIHBhc3NlZF8uXG4gKi9cbmZ1bmN0aW9uIHJ1bk1vY2hhKHJlcG9ydGVyLCBkb25lLCB3YWl0ZWQpIHtcbiAgaWYgKFdDVC53YWl0Rm9yRnJhbWV3b3JrcyAmJiAhd2FpdGVkKSB7XG4gICAgV0NULnV0aWwud2hlbkZyYW1ld29ya3NSZWFkeShydW5Nb2NoYS5iaW5kKG51bGwsIHJlcG9ydGVyLCBkb25lLCB0cnVlKSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIFdDVC51dGlsLmRlYnVnKCdydW5Nb2NoYScsIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSk7XG5cbiAgbW9jaGEucmVwb3J0ZXIocmVwb3J0ZXIpO1xuICB2YXIgcnVubmVyID0gbW9jaGEucnVuKGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgZG9uZSgpOyAgLy8gV2UgaWdub3JlIHRoZSBNb2NoYSBmYWlsdXJlIGNvdW50LlxuICB9KTtcblxuICAvLyBNb2NoYSdzIGRlZmF1bHQgYG9uZXJyb3JgIGhhbmRsaW5nIHN0cmlwcyB0aGUgc3RhY2sgKHRvIHN1cHBvcnQgcmVhbGx5IG9sZFxuICAvLyBicm93c2VycykuIFdlIHVwZ3JhZGUgdGhpcyB0byBnZXQgYmV0dGVyIHN0YWNrcyBmb3IgYXN5bmMgZXJyb3JzLlxuICAvL1xuICAvLyBUT0RPKG5ldmlyKTogQ2FuIHdlIGV4cGFuZCBzdXBwb3J0IHRvIG90aGVyIGJyb3dzZXJzP1xuICBpZiAobmF2aWdhdG9yLnVzZXJBZ2VudC5tYXRjaCgvY2hyb21lL2kpKSB7XG4gICAgd2luZG93Lm9uZXJyb3IgPSBudWxsO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICBydW5uZXIudW5jYXVnaHQoZXZlbnQuZXJyb3IpO1xuICAgIH0pO1xuICB9XG59XG5cbi8qKlxuICogRmlndXJlIG91dCB3aGljaCByZXBvcnRlcnMgc2hvdWxkIGJlIHVzZWQgZm9yIHRoZSBjdXJyZW50IGB3aW5kb3dgLlxuICpcbiAqIEBwYXJhbSB7V0NULkNMSVNvY2tldH0gc29ja2V0IFRoZSBDTEkgc29ja2V0LCBpZiBwcmVzZW50LlxuICovXG5mdW5jdGlvbiBkZXRlcm1pbmVSZXBvcnRlcnMoc29ja2V0KSB7XG4gIHZhciByZXBvcnRlcnMgPSBbXG4gICAgV0NULnJlcG9ydGVycy5UaXRsZSxcbiAgICBXQ1QucmVwb3J0ZXJzLkNvbnNvbGUsXG4gIF07XG5cbiAgaWYgKHNvY2tldCkge1xuICAgIHJlcG9ydGVycy5wdXNoKGZ1bmN0aW9uKHJ1bm5lcikge1xuICAgICAgc29ja2V0Lm9ic2VydmUocnVubmVyKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChXQ1QuX3N1aXRlc1RvTG9hZC5sZW5ndGggPiAwKSB7XG4gICAgcmVwb3J0ZXJzLnB1c2goV0NULnJlcG9ydGVycy5IVE1MKTtcbiAgfVxuXG4gIHJldHVybiByZXBvcnRlcnM7XG59XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbi8qKlxuICogQGZpbGVvdmVydmlld1xuICpcbiAqIFByb3ZpZGVzIGF1dG9tYXRpYyBjb25maWd1cmF0aW9uIG9mIE1vY2hhIGJ5IHN0dWJiaW5nIG91dCBwb3RlbnRpYWwgTW9jaGFcbiAqIG1ldGhvZHMsIGFuZCBjb25maWd1cmluZyBNb2NoYSBhcHByb3ByaWF0ZWx5IG9uY2UgeW91IGNhbGwgdGhlbS5cbiAqXG4gKiBKdXN0IGNhbGwgYHN1aXRlYCwgYGRlc2NyaWJlYCwgZXRjIG5vcm1hbGx5LCBhbmQgZXZlcnl0aGluZyBzaG91bGQgSnVzdCBXb3JrLlxuICovXG4oZnVuY3Rpb24oKSB7XG5cbi8vIE1vY2hhIGdsb2JhbCBoZWxwZXJzLCBicm9rZW4gb3V0IGJ5IHRlc3RpbmcgbWV0aG9kLlxudmFyIE1PQ0hBX0VYUE9SVFMgPSB7XG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS92aXNpb25tZWRpYS9tb2NoYS9ibG9iL21hc3Rlci9saWIvaW50ZXJmYWNlcy90ZGQuanNcbiAgdGRkOiBbXG4gICAgJ3NldHVwJyxcbiAgICAndGVhcmRvd24nLFxuICAgICdzdWl0ZVNldHVwJyxcbiAgICAnc3VpdGVUZWFyZG93bicsXG4gICAgJ3N1aXRlJyxcbiAgICAndGVzdCcsXG4gIF0sXG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS92aXNpb25tZWRpYS9tb2NoYS9ibG9iL21hc3Rlci9saWIvaW50ZXJmYWNlcy90ZGQuanNcbiAgYmRkOiBbXG4gICAgJ2JlZm9yZScsXG4gICAgJ2FmdGVyJyxcbiAgICAnYmVmb3JlRWFjaCcsXG4gICAgJ2FmdGVyRWFjaCcsXG4gICAgJ2Rlc2NyaWJlJyxcbiAgICAneGRlc2NyaWJlJyxcbiAgICAneGNvbnRleHQnLFxuICAgICdpdCcsXG4gICAgJ3hpdCcsXG4gICAgJ3hzcGVjaWZ5JyxcbiAgXSxcbn07XG5cbi8vIFdlIGV4cG9zZSBhbGwgTW9jaGEgbWV0aG9kcyB1cCBmcm9udCwgY29uZmlndXJpbmcgYW5kIHJ1bm5pbmcgbW9jaGFcbi8vIGF1dG9tYXRpY2FsbHkgd2hlbiB5b3UgY2FsbCB0aGVtLlxuLy9cbi8vIFRoZSBhc3N1bXB0aW9uIGlzIHRoYXQgaXQgaXMgYSBvbmUtb2ZmIChzdWItKXN1aXRlIG9mIHRlc3RzIGJlaW5nIHJ1bi5cbk9iamVjdC5rZXlzKE1PQ0hBX0VYUE9SVFMpLmZvckVhY2goZnVuY3Rpb24odWkpIHtcbiAgTU9DSEFfRVhQT1JUU1t1aV0uZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICB3aW5kb3dba2V5XSA9IGZ1bmN0aW9uIHdyYXBwZWRNb2NoYUZ1bmN0aW9uKCkge1xuICAgICAgV0NULnNldHVwTW9jaGEodWkpO1xuICAgICAgaWYgKCF3aW5kb3dba2V5XSB8fCB3aW5kb3dba2V5XSA9PT0gd3JhcHBlZE1vY2hhRnVuY3Rpb24pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBtb2NoYS5zZXR1cCB0byBkZWZpbmUgJyArIGtleSk7XG4gICAgICB9XG4gICAgICB3aW5kb3dba2V5XS5hcHBseSh3aW5kb3csIGFyZ3VtZW50cyk7XG4gICAgfVxuICB9KTtcbn0pO1xuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSB1aSBTZXRzIHVwIG1vY2hhIHRvIHJ1biBgdWlgLXN0eWxlIHRlc3RzLlxuICovXG5XQ1Quc2V0dXBNb2NoYSA9IGZ1bmN0aW9uIHNldHVwTW9jaGEodWkpIHtcbiAgaWYgKFdDVC5fbW9jaGFVSSAmJiBXQ1QuX21vY2hhVUkgPT09IHVpKSByZXR1cm47XG4gIGlmIChXQ1QuX21vY2hhVUkgJiYgV0NULl9tb2NoYVVJICE9PSB1aSkge1xuICAgIHRocm93IG5ldyBFcnJvcignTWl4aW5nICcgKyBXQ1QuX21vY2hhVUkgKyAnIGFuZCAnICsgdWkgKyAnIE1vY2hhIHN0eWxlcyBpcyBub3Qgc3VwcG9ydGVkLicpO1xuICB9XG4gIG1vY2hhLnNldHVwKHt1aTogdWksIHRpbWVvdXQ6IDUwMDB9KTsgIC8vIE5vdGUgdGhhdCB0aGUgcmVwb3J0ZXIgaXMgY29uZmlndXJlZCBpbiBydW4uanMuXG4gIFdDVC5tb2NoYUlzU2V0dXAgPSB0cnVlO1xufVxuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbldDVC5yZXBvcnRlcnMuQ29uc29sZSA9IENvbnNvbGU7XG5cbi8vIFdlIGNhcHR1cmUgY29uc29sZSBldmVudHMgd2hlbiBydW5uaW5nIHRlc3RzOyBzbyBtYWtlIHN1cmUgd2UgaGF2ZSBhXG4vLyByZWZlcmVuY2UgdG8gdGhlIG9yaWdpbmFsIG9uZS5cbnZhciBjb25zb2xlID0gd2luZG93LmNvbnNvbGU7XG5cbnZhciBGT05UID0gJztmb250OiBub3JtYWwgMTNweCBcIlJvYm90b1wiLCBcIkhlbHZldGljYSBOZXVlXCIsIFwiSGVsdmV0aWNhXCIsIHNhbnMtc2VyaWY7J1xudmFyIFNUWUxFUyA9IHtcbiAgcGxhaW46ICAgRk9OVCxcbiAgc3VpdGU6ICAgJ2NvbG9yOiAjNWM2YmMwJyArIEZPTlQsXG4gIHRlc3Q6ICAgIEZPTlQsXG4gIHBhc3Npbmc6ICdjb2xvcjogIzI1OWIyNCcgKyBGT05ULFxuICBwZW5kaW5nOiAnY29sb3I6ICNlNjUxMDAnICsgRk9OVCxcbiAgZmFpbGluZzogJ2NvbG9yOiAjYzQxNDExJyArIEZPTlQsXG4gIHN0YWNrOiAgICdjb2xvcjogI2M0MTQxMScsXG4gIHJlc3VsdHM6IEZPTlQgKyAnZm9udC1zaXplOiAxNnB4Jyxcbn1cblxuLy8gSSBkb24ndCB0aGluayB3ZSBjYW4gZmVhdHVyZSBkZXRlY3QgdGhpcyBvbmUuLi5cbnZhciB1c2VyQWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCk7XG52YXIgQ0FOX1NUWUxFX0xPRyAgID0gdXNlckFnZW50Lm1hdGNoKCdmaXJlZm94JykgfHwgdXNlckFnZW50Lm1hdGNoKCd3ZWJraXQnKTtcbnZhciBDQU5fU1RZTEVfR1JPVVAgPSB1c2VyQWdlbnQubWF0Y2goJ3dlYmtpdCcpO1xuLy8gVHJhY2sgdGhlIGluZGVudCBmb3IgZmFrZWQgYGNvbnNvbGUuZ3JvdXBgXG52YXIgbG9nSW5kZW50ID0gJyc7XG5cbmZ1bmN0aW9uIGxvZyh0ZXh0LCBzdHlsZSkge1xuICB0ZXh0ID0gdGV4dC5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGwpIHsgcmV0dXJuIGxvZ0luZGVudCArIGw7IH0pLmpvaW4oJ1xcbicpO1xuICBpZiAoQ0FOX1NUWUxFX0xPRykge1xuICAgIGNvbnNvbGUubG9nKCclYycgKyB0ZXh0LCBTVFlMRVNbc3R5bGVdIHx8IFNUWUxFUy5wbGFpbik7XG4gIH0gZWxzZSB7XG4gICAgY29uc29sZS5sb2codGV4dCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9nR3JvdXAodGV4dCwgc3R5bGUpIHtcbiAgaWYgKENBTl9TVFlMRV9HUk9VUCkge1xuICAgIGNvbnNvbGUuZ3JvdXAoJyVjJyArIHRleHQsIFNUWUxFU1tzdHlsZV0gfHwgU1RZTEVTLnBsYWluKTtcbiAgfSBlbHNlIGlmIChjb25zb2xlLmdyb3VwKSB7XG4gICAgY29uc29sZS5ncm91cCh0ZXh0KTtcbiAgfSBlbHNlIHtcbiAgICBsb2dJbmRlbnQgPSBsb2dJbmRlbnQgKyAnICAnO1xuICAgIGxvZyh0ZXh0LCBzdHlsZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9nR3JvdXBFbmQoKSB7XG4gIGlmIChjb25zb2xlLmdyb3VwRW5kKSB7XG4gICAgY29uc29sZS5ncm91cEVuZCgpO1xuICB9IGVsc2Uge1xuICAgIGxvZ0luZGVudCA9IGxvZ0luZGVudC5zdWJzdHIoMCwgbG9nSW5kZW50Lmxlbmd0aCAtIDIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGxvZ0V4Y2VwdGlvbihlcnJvcikge1xuICBsb2coZXJyb3Iuc3RhY2sgfHwgZXJyb3IubWVzc2FnZSB8fCBlcnJvciwgJ3N0YWNrJyk7XG59XG5cbi8qKlxuICogQSBNb2NoYSByZXBvcnRlciB0aGF0IGxvZ3MgcmVzdWx0cyBvdXQgdG8gdGhlIHdlYiBgY29uc29sZWAuXG4gKlxuICogQHBhcmFtIHshTW9jaGEuUnVubmVyfSBydW5uZXIgVGhlIHJ1bm5lciB0aGF0IGlzIGJlaW5nIHJlcG9ydGVkIG9uLlxuICovXG5mdW5jdGlvbiBDb25zb2xlKHJ1bm5lcikge1xuICBNb2NoYS5yZXBvcnRlcnMuQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZScsIGZ1bmN0aW9uKHN1aXRlKSB7XG4gICAgaWYgKHN1aXRlLnJvb3QpIHJldHVybjtcbiAgICBsb2dHcm91cChzdWl0ZS50aXRsZSwgJ3N1aXRlJyk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZSBlbmQnLCBmdW5jdGlvbihzdWl0ZSkge1xuICAgIGlmIChzdWl0ZS5yb290KSByZXR1cm47XG4gICAgbG9nR3JvdXBFbmQoKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ3Rlc3QnLCBmdW5jdGlvbih0ZXN0KSB7XG4gICAgbG9nR3JvdXAodGVzdC50aXRsZSwgJ3Rlc3QnKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KSB7XG4gICAgbG9nR3JvdXAodGVzdC50aXRsZSwgJ3BlbmRpbmcnKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnJvcikge1xuICAgIGxvZ0V4Y2VwdGlvbihlcnJvcik7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3QpIHtcbiAgICBsb2dHcm91cEVuZCgpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIHJ1bm5lci5vbignZW5kJywgdGhpcy5sb2dTdW1tYXJ5LmJpbmQodGhpcykpO1xufTtcbkNvbnNvbGUucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShNb2NoYS5yZXBvcnRlcnMuQmFzZS5wcm90b3R5cGUpO1xuXG4vKiogUHJpbnRzIG91dCBhIGZpbmFsIHN1bW1hcnkgb2YgdGVzdCByZXN1bHRzLiAqL1xuQ29uc29sZS5wcm90b3R5cGUubG9nU3VtbWFyeSA9IGZ1bmN0aW9uIGxvZ1N1bW1hcnkoKSB7XG4gIGxvZ0dyb3VwKCdUZXN0IFJlc3VsdHMnLCAncmVzdWx0cycpO1xuXG4gIGlmICh0aGlzLnN0YXRzLmZhaWx1cmVzID4gMCkge1xuICAgIGxvZyhXQ1QudXRpbC5wbHVyYWxpemVkU3RhdCh0aGlzLnN0YXRzLmZhaWx1cmVzLCAnZmFpbGluZycpLCAnZmFpbGluZycpO1xuICB9XG4gIGlmICh0aGlzLnN0YXRzLnBlbmRpbmcgPiAwKSB7XG4gICAgbG9nKFdDVC51dGlsLnBsdXJhbGl6ZWRTdGF0KHRoaXMuc3RhdHMucGVuZGluZywgJ3BlbmRpbmcnKSwgJ3BlbmRpbmcnKTtcbiAgfVxuICBsb2coV0NULnV0aWwucGx1cmFsaXplZFN0YXQodGhpcy5zdGF0cy5wYXNzZXMsICdwYXNzaW5nJykpO1xuXG4gIGlmICghdGhpcy5zdGF0cy5mYWlsdXJlcykge1xuICAgIGxvZygndGVzdCBzdWl0ZSBwYXNzZWQnLCAncGFzc2luZycpO1xuICB9XG4gIGxvZygnRXZhbHVhdGVkICcgKyB0aGlzLnN0YXRzLnRlc3RzICsgJyB0ZXN0cyBpbiAnICsgdGhpcy5zdGF0cy5kdXJhdGlvbiArICdtcy4nKTtcbiAgbG9nR3JvdXBFbmQoKTtcbn07XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuV0NULnJlcG9ydGVycy5IVE1MID0gSFRNTDtcblxuLyoqXG4gKiBXQ1Qtc3BlY2lmaWMgYmVoYXZpb3Igb24gdG9wIG9mIE1vY2hhJ3MgZGVmYXVsdCBIVE1MIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7IU1vY2hhLlJ1bm5lcn0gcnVubmVyIFRoZSBydW5uZXIgdGhhdCBpcyBiZWluZyByZXBvcnRlZCBvbi5cbiAqL1xuZnVuY3Rpb24gSFRNTChydW5uZXIpIHtcbiAgdmFyIG91dHB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBvdXRwdXQuaWQgPSAnbW9jaGEnO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG91dHB1dCk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZScsIGZ1bmN0aW9uKHRlc3QpIHtcbiAgICB0aGlzLnRvdGFsID0gcnVubmVyLnRvdGFsO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIE1vY2hhLnJlcG9ydGVycy5IVE1MLmNhbGwodGhpcywgcnVubmVyKTtcbn07XG5IVE1MLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoTW9jaGEucmVwb3J0ZXJzLkhUTUwucHJvdG90eXBlKTtcblxufSkoKTtcbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuKGZ1bmN0aW9uKCkge1xuXG5XQ1QucmVwb3J0ZXJzLlRpdGxlID0gVGl0bGU7XG5cbnZhciBBUkNfT0ZGU0VUID0gMDsgLy8gc3RhcnQgYXQgdGhlIHJpZ2h0LlxudmFyIEFSQ19XSURUSCAgPSA2O1xuXG4vKipcbiAqIEEgTW9jaGEgcmVwb3J0ZXIgdGhhdCB1cGRhdGVzIHRoZSBkb2N1bWVudCdzIHRpdGxlIGFuZCBmYXZpY29uIHdpdGhcbiAqIGF0LWEtZ2xhbmNlIHN0YXRzLlxuICpcbiAqIEBwYXJhbSB7IU1vY2hhLlJ1bm5lcn0gcnVubmVyIFRoZSBydW5uZXIgdGhhdCBpcyBiZWluZyByZXBvcnRlZCBvbi5cbiAqL1xuZnVuY3Rpb24gVGl0bGUocnVubmVyKSB7XG4gIE1vY2hhLnJlcG9ydGVycy5CYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgdGhpcy5yZXBvcnQuYmluZCh0aGlzKSk7XG59XG5cbi8qKiBSZXBvcnRzIGN1cnJlbnQgc3RhdHMgdmlhIHRoZSBwYWdlIHRpdGxlIGFuZCBmYXZpY29uLiAqL1xuVGl0bGUucHJvdG90eXBlLnJlcG9ydCA9IGZ1bmN0aW9uIHJlcG9ydCgpIHtcbiAgdGhpcy51cGRhdGVUaXRsZSgpO1xuICB0aGlzLnVwZGF0ZUZhdmljb24oKTtcbn07XG5cbi8qKiBVcGRhdGVzIHRoZSBkb2N1bWVudCB0aXRsZSB3aXRoIGEgc3VtbWFyeSBvZiBjdXJyZW50IHN0YXRzLiAqL1xuVGl0bGUucHJvdG90eXBlLnVwZGF0ZVRpdGxlID0gZnVuY3Rpb24gdXBkYXRlVGl0bGUoKSB7XG4gIGlmICh0aGlzLnN0YXRzLmZhaWx1cmVzID4gMCkge1xuICAgIGRvY3VtZW50LnRpdGxlID0gV0NULnV0aWwucGx1cmFsaXplZFN0YXQodGhpcy5zdGF0cy5mYWlsdXJlcywgJ2ZhaWxpbmcnKTtcbiAgfSBlbHNlIHtcbiAgICBkb2N1bWVudC50aXRsZSA9IFdDVC51dGlsLnBsdXJhbGl6ZWRTdGF0KHRoaXMuc3RhdHMucGFzc2VzLCAncGFzc2luZycpO1xuICB9XG59O1xuXG4vKipcbiAqIERyYXdzIGFuIGFyYyBmb3IgdGhlIGZhdmljb24gc3RhdHVzLCByZWxhdGl2ZSB0byB0aGUgdG90YWwgbnVtYmVyIG9mIHRlc3RzLlxuICpcbiAqIEBwYXJhbSB7IUNhbnZhc1JlbmRlcmluZ0NvbnRleHQyRH0gY29udGV4dFxuICogQHBhcmFtIHtudW1iZXJ9IHRvdGFsXG4gKiBAcGFyYW0ge251bWJlcn0gc3RhcnRcbiAqIEBwYXJhbSB7bnVtYmVyfSBsZW5ndGhcbiAqIEBwYXJhbSB7c3RyaW5nfSBjb2xvclxuICovXG5mdW5jdGlvbiBkcmF3RmF2aWNvbkFyYyhjb250ZXh0LCB0b3RhbCwgc3RhcnQsIGxlbmd0aCwgY29sb3IpIHtcbiAgdmFyIGFyY1N0YXJ0ID0gQVJDX09GRlNFVCArIE1hdGguUEkgKiAyICogKHN0YXJ0IC8gdG90YWwpO1xuICB2YXIgYXJjRW5kICAgPSBBUkNfT0ZGU0VUICsgTWF0aC5QSSAqIDIgKiAoKHN0YXJ0ICsgbGVuZ3RoKSAvIHRvdGFsKTtcblxuICBjb250ZXh0LmJlZ2luUGF0aCgpO1xuICBjb250ZXh0LnN0cm9rZVN0eWxlID0gY29sb3I7XG4gIGNvbnRleHQubGluZVdpZHRoICAgPSBBUkNfV0lEVEg7XG4gIGNvbnRleHQuYXJjKDE2LCAxNiwgMTYgLSBBUkNfV0lEVEggLyAyLCBhcmNTdGFydCwgYXJjRW5kKTtcbiAgY29udGV4dC5zdHJva2UoKTtcbn07XG5cbi8qKiBVcGRhdGVzIHRoZSBkb2N1bWVudCdzIGZhdmljb24gdy8gYSBzdW1tYXJ5IG9mIGN1cnJlbnQgc3RhdHMuICovXG5UaXRsZS5wcm90b3R5cGUudXBkYXRlRmF2aWNvbiA9IGZ1bmN0aW9uIHVwZGF0ZUZhdmljb24oKSB7XG4gIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcbiAgY2FudmFzLmhlaWdodCA9IGNhbnZhcy53aWR0aCA9IDMyO1xuICB2YXIgY29udGV4dCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuXG4gIHZhciBwYXNzaW5nID0gdGhpcy5zdGF0cy5wYXNzZXM7XG4gIHZhciBwZW5kaW5nID0gdGhpcy5zdGF0cy5wZW5kaW5nO1xuICB2YXIgZmFpbGluZyA9IHRoaXMuc3RhdHMuZmFpbHVyZXM7XG4gIHZhciB0b3RhbCAgID0gTWF0aC5tYXgodGhpcy5ydW5uZXIudG90YWwsIHBhc3NpbmcgKyBwZW5kaW5nICsgZmFpbGluZyk7XG4gIGRyYXdGYXZpY29uQXJjKGNvbnRleHQsIHRvdGFsLCAwLCAgICAgICAgICAgICAgICAgcGFzc2luZywgJyMwZTljNTcnKTtcbiAgZHJhd0Zhdmljb25BcmMoY29udGV4dCwgdG90YWwsIHBhc3NpbmcsICAgICAgICAgICBwZW5kaW5nLCAnI2YzYjMwMCcpO1xuICBkcmF3RmF2aWNvbkFyYyhjb250ZXh0LCB0b3RhbCwgcGVuZGluZyArIHBhc3NpbmcsIGZhaWxpbmcsICcjZmY1NjIxJyk7XG5cbiAgdGhpcy5zZXRGYXZpY29uKGNhbnZhcy50b0RhdGFVUkwoKSk7XG59O1xuXG4vKiogU2V0cyB0aGUgY3VycmVudCBmYXZpY29uIGJ5IFVSTC4gKi9cblRpdGxlLnByb3RvdHlwZS5zZXRGYXZpY29uID0gZnVuY3Rpb24gc2V0RmF2aWNvbih1cmwpIHtcbiAgdmFyIGN1cnJlbnQgPSBkb2N1bWVudC5oZWFkLnF1ZXJ5U2VsZWN0b3IoJ2xpbmtbcmVsPVwiaWNvblwiXScpO1xuICBpZiAoY3VycmVudCkge1xuICAgIGRvY3VtZW50LmhlYWQucmVtb3ZlQ2hpbGQoY3VycmVudCk7XG4gIH1cblxuICB2YXIgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpbmsnKTtcbiAgbGluay5yZWwgPSAnaWNvbic7XG4gIGxpbmsudHlwZSA9ICdpbWFnZS94LWljb24nO1xuICBsaW5rLmhyZWYgPSB1cmw7XG4gIGxpbmsuc2V0QXR0cmlidXRlKCdzaXplcycsICczMngzMicpO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGxpbmspO1xufTtcblxufSkoKTtcbiIsIi8qIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuaHRtbCwgYm9keSB7XG4gIGhlaWdodDogMTAwJTtcbiAgd2lkdGg6ICAxMDAlO1xufVxuXG4jbW9jaGEsICNzdWJzdWl0ZXMge1xuICBoZWlnaHQ6IDEwMCU7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgdG9wOiAwO1xuICB3aWR0aDogNTAlO1xufVxuXG4jbW9jaGEge1xuICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuICBtYXJnaW46IDAgIWltcG9ydGFudDtcbiAgb3ZlcmZsb3cteTogYXV0bztcbiAgcGFkZGluZzogNjBweCA1MHB4O1xuICByaWdodDogMDtcbn1cblxuI3N1YnN1aXRlcyB7XG4gIC1tcy1mbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAtd2Via2l0LWZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gIGRpc3BsYXk6IC1tcy1mbGV4Ym94O1xuICBkaXNwbGF5OiAtd2Via2l0LWZsZXg7XG4gIGRpc3BsYXk6IGZsZXg7XG4gIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gIGxlZnQ6IDA7XG59XG5cbiNzdWJzdWl0ZXMgLnN1YnN1aXRlIHtcbiAgYm9yZGVyOiAwO1xuICB3aWR0aDogMTAwJTtcbiAgaGVpZ2h0OiAxMDAlO1xufVxuXG4vKiBUT0RPKG5ldmlyKTogRml4IGdyZXAgc3VwcG9ydCAqL1xuI21vY2hhIC5yZXBsYXkge1xuICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG59XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=