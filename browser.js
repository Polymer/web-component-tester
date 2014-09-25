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
 * @param {function()} done A function to call when the active web component
 *     frameworks have loaded.
 * @param {Window} opt_scope A scope to check for polymer within.
 */
WCT.util.whenFrameworksReady = function(done, opt_scope) {
  var scope = opt_scope || window;
  // TODO(nevir): Frameworks other than Polymer?
  if (!scope.Polymer) return done();

  // Platform isn't quite ready for IE10.
  // TODO(nevir): Should this be baked into platform ready?
  done = asyncPlatformFlush.bind(null, done);

  if (scope.Polymer.whenReady) {
    scope.Polymer.whenReady(done);
  } else {
    scope.addEventListener('polymer-ready', done);
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
  document.body.appendChild(this.iframe);

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

/**
 *
 */
window.done = function() {
  parent.postMessage('ok', '*');
};

window.addEventListener('error', function(error) {
  parent.postMessage({error: error}, '*');
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
  Platform.flush();
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
    this.emit.apply(this, [eventName].concat(extraArgs));
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
        if (error) runner.emitOutOfBandTest(title, error);
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
  mocha.run(function(error) {
    done();  // We ignore the Mocha failure count.
  });
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
  mocha.setup({ui: ui});  // Note that the reporter is configured in run.js.
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
  if (console.exception) {
    console.exception(error);
  } else {
    log(error.stack || error.message || error, 'stack');
  }
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
style.textContent = '/* Copyright (c) 2014 The Polymer Project Authors. All rights reserved.\n * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt\n * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt\n * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt\n * Code distributed by Google as part of the polymer project is also\n * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt\n */\n#mocha {\n  background: white;\n  box-sizing: border-box;\n  left: 0;\n  margin: 0 !important; /* We convert Mocha\'s margin to padding */\n  min-height: 100%;\n  padding: 60px 50px;\n  position: absolute;\n  top: 0;\n  width: 100%;\n  z-index: 100;\n}\n\n/* TODO(nevir): Fix grep support */\n#mocha .replay {\n  display: none !important;\n}\n\n.subsuite {\n  position: absolute;\n  left: 0;\n  top: 0;\n  /* The size of the iframe directly impacts performance. */\n  height: 400px;\n  width: 250px;\n}\n';
document.head.appendChild(style);
})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1vY2hhLmpzIiwibW9jaGEuY3NzIiwiY2hhaS5qcyIsImFzeW5jLmpzIiwiaW5kZXguanMiLCJ1dGlsLmpzIiwiY2xpc29ja2V0LmpzIiwic3Vic3VpdGUuanMiLCJlbnZpcm9ubWVudC9jaGFpLmpzIiwiZW52aXJvbm1lbnQvY29tcGF0YWJpbGl0eS5qcyIsImVudmlyb25tZW50L3BsYXRmb3JtLmpzIiwibW9jaGEvbXVsdGlydW5uZXIuanMiLCJtb2NoYS9ydW4uanMiLCJtb2NoYS9zZXR1cC5qcyIsInJlcG9ydGVycy9jb25zb2xlLmpzIiwicmVwb3J0ZXJzL2h0bWwuanMiLCJyZXBvcnRlcnMvdGl0bGUuanMiLCJyZXBvcnRlcnMvaHRtbC5jc3MiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUM5MUxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUM3cUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNubUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDN0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNsSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUM1R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbkxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2xJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNoR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJicm93c2VyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiOyhmdW5jdGlvbigpe1xuXG4vLyBDb21tb25KUyByZXF1aXJlKClcblxuZnVuY3Rpb24gcmVxdWlyZShwKXtcbiAgICB2YXIgcGF0aCA9IHJlcXVpcmUucmVzb2x2ZShwKVxuICAgICAgLCBtb2QgPSByZXF1aXJlLm1vZHVsZXNbcGF0aF07XG4gICAgaWYgKCFtb2QpIHRocm93IG5ldyBFcnJvcignZmFpbGVkIHRvIHJlcXVpcmUgXCInICsgcCArICdcIicpO1xuICAgIGlmICghbW9kLmV4cG9ydHMpIHtcbiAgICAgIG1vZC5leHBvcnRzID0ge307XG4gICAgICBtb2QuY2FsbChtb2QuZXhwb3J0cywgbW9kLCBtb2QuZXhwb3J0cywgcmVxdWlyZS5yZWxhdGl2ZShwYXRoKSk7XG4gICAgfVxuICAgIHJldHVybiBtb2QuZXhwb3J0cztcbiAgfVxuXG5yZXF1aXJlLm1vZHVsZXMgPSB7fTtcblxucmVxdWlyZS5yZXNvbHZlID0gZnVuY3Rpb24gKHBhdGgpe1xuICAgIHZhciBvcmlnID0gcGF0aFxuICAgICAgLCByZWcgPSBwYXRoICsgJy5qcydcbiAgICAgICwgaW5kZXggPSBwYXRoICsgJy9pbmRleC5qcyc7XG4gICAgcmV0dXJuIHJlcXVpcmUubW9kdWxlc1tyZWddICYmIHJlZ1xuICAgICAgfHwgcmVxdWlyZS5tb2R1bGVzW2luZGV4XSAmJiBpbmRleFxuICAgICAgfHwgb3JpZztcbiAgfTtcblxucmVxdWlyZS5yZWdpc3RlciA9IGZ1bmN0aW9uIChwYXRoLCBmbil7XG4gICAgcmVxdWlyZS5tb2R1bGVzW3BhdGhdID0gZm47XG4gIH07XG5cbnJlcXVpcmUucmVsYXRpdmUgPSBmdW5jdGlvbiAocGFyZW50KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKHApe1xuICAgICAgaWYgKCcuJyAhPSBwLmNoYXJBdCgwKSkgcmV0dXJuIHJlcXVpcmUocCk7XG5cbiAgICAgIHZhciBwYXRoID0gcGFyZW50LnNwbGl0KCcvJylcbiAgICAgICAgLCBzZWdzID0gcC5zcGxpdCgnLycpO1xuICAgICAgcGF0aC5wb3AoKTtcblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBzZWcgPSBzZWdzW2ldO1xuICAgICAgICBpZiAoJy4uJyA9PSBzZWcpIHBhdGgucG9wKCk7XG4gICAgICAgIGVsc2UgaWYgKCcuJyAhPSBzZWcpIHBhdGgucHVzaChzZWcpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVxdWlyZShwYXRoLmpvaW4oJy8nKSk7XG4gICAgfTtcbiAgfTtcblxuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiYnJvd3Nlci9kZWJ1Zy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHR5cGUpe1xuICByZXR1cm4gZnVuY3Rpb24oKXtcbiAgfVxufTtcblxufSk7IC8vIG1vZHVsZTogYnJvd3Nlci9kZWJ1Zy5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiYnJvd3Nlci9kaWZmLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG4vKiBTZWUgTElDRU5TRSBmaWxlIGZvciB0ZXJtcyBvZiB1c2UgKi9cblxuLypcbiAqIFRleHQgZGlmZiBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBUaGlzIGxpYnJhcnkgc3VwcG9ydHMgdGhlIGZvbGxvd2luZyBBUElTOlxuICogSnNEaWZmLmRpZmZDaGFyczogQ2hhcmFjdGVyIGJ5IGNoYXJhY3RlciBkaWZmXG4gKiBKc0RpZmYuZGlmZldvcmRzOiBXb3JkIChhcyBkZWZpbmVkIGJ5IFxcYiByZWdleCkgZGlmZiB3aGljaCBpZ25vcmVzIHdoaXRlc3BhY2VcbiAqIEpzRGlmZi5kaWZmTGluZXM6IExpbmUgYmFzZWQgZGlmZlxuICpcbiAqIEpzRGlmZi5kaWZmQ3NzOiBEaWZmIHRhcmdldGVkIGF0IENTUyBjb250ZW50XG4gKlxuICogVGhlc2UgbWV0aG9kcyBhcmUgYmFzZWQgb24gdGhlIGltcGxlbWVudGF0aW9uIHByb3Bvc2VkIGluXG4gKiBcIkFuIE8oTkQpIERpZmZlcmVuY2UgQWxnb3JpdGhtIGFuZCBpdHMgVmFyaWF0aW9uc1wiIChNeWVycywgMTk4NikuXG4gKiBodHRwOi8vY2l0ZXNlZXJ4LmlzdC5wc3UuZWR1L3ZpZXdkb2Mvc3VtbWFyeT9kb2k9MTAuMS4xLjQuNjkyN1xuICovXG52YXIgSnNEaWZmID0gKGZ1bmN0aW9uKCkge1xuICAvKmpzaGludCBtYXhwYXJhbXM6IDUqL1xuICBmdW5jdGlvbiBjbG9uZVBhdGgocGF0aCkge1xuICAgIHJldHVybiB7IG5ld1BvczogcGF0aC5uZXdQb3MsIGNvbXBvbmVudHM6IHBhdGguY29tcG9uZW50cy5zbGljZSgwKSB9O1xuICB9XG4gIGZ1bmN0aW9uIHJlbW92ZUVtcHR5KGFycmF5KSB7XG4gICAgdmFyIHJldCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChhcnJheVtpXSkge1xuICAgICAgICByZXQucHVzaChhcnJheVtpXSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH1cbiAgZnVuY3Rpb24gZXNjYXBlSFRNTChzKSB7XG4gICAgdmFyIG4gPSBzO1xuICAgIG4gPSBuLnJlcGxhY2UoLyYvZywgJyZhbXA7Jyk7XG4gICAgbiA9IG4ucmVwbGFjZSgvPC9nLCAnJmx0OycpO1xuICAgIG4gPSBuLnJlcGxhY2UoLz4vZywgJyZndDsnKTtcbiAgICBuID0gbi5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7Jyk7XG5cbiAgICByZXR1cm4gbjtcbiAgfVxuXG4gIHZhciBEaWZmID0gZnVuY3Rpb24oaWdub3JlV2hpdGVzcGFjZSkge1xuICAgIHRoaXMuaWdub3JlV2hpdGVzcGFjZSA9IGlnbm9yZVdoaXRlc3BhY2U7XG4gIH07XG4gIERpZmYucHJvdG90eXBlID0ge1xuICAgICAgZGlmZjogZnVuY3Rpb24ob2xkU3RyaW5nLCBuZXdTdHJpbmcpIHtcbiAgICAgICAgLy8gSGFuZGxlIHRoZSBpZGVudGl0eSBjYXNlICh0aGlzIGlzIGR1ZSB0byB1bnJvbGxpbmcgZWRpdExlbmd0aCA9PSAwXG4gICAgICAgIGlmIChuZXdTdHJpbmcgPT09IG9sZFN0cmluZykge1xuICAgICAgICAgIHJldHVybiBbeyB2YWx1ZTogbmV3U3RyaW5nIH1dO1xuICAgICAgICB9XG4gICAgICAgIGlmICghbmV3U3RyaW5nKSB7XG4gICAgICAgICAgcmV0dXJuIFt7IHZhbHVlOiBvbGRTdHJpbmcsIHJlbW92ZWQ6IHRydWUgfV07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFvbGRTdHJpbmcpIHtcbiAgICAgICAgICByZXR1cm4gW3sgdmFsdWU6IG5ld1N0cmluZywgYWRkZWQ6IHRydWUgfV07XG4gICAgICAgIH1cblxuICAgICAgICBuZXdTdHJpbmcgPSB0aGlzLnRva2VuaXplKG5ld1N0cmluZyk7XG4gICAgICAgIG9sZFN0cmluZyA9IHRoaXMudG9rZW5pemUob2xkU3RyaW5nKTtcblxuICAgICAgICB2YXIgbmV3TGVuID0gbmV3U3RyaW5nLmxlbmd0aCwgb2xkTGVuID0gb2xkU3RyaW5nLmxlbmd0aDtcbiAgICAgICAgdmFyIG1heEVkaXRMZW5ndGggPSBuZXdMZW4gKyBvbGRMZW47XG4gICAgICAgIHZhciBiZXN0UGF0aCA9IFt7IG5ld1BvczogLTEsIGNvbXBvbmVudHM6IFtdIH1dO1xuXG4gICAgICAgIC8vIFNlZWQgZWRpdExlbmd0aCA9IDBcbiAgICAgICAgdmFyIG9sZFBvcyA9IHRoaXMuZXh0cmFjdENvbW1vbihiZXN0UGF0aFswXSwgbmV3U3RyaW5nLCBvbGRTdHJpbmcsIDApO1xuICAgICAgICBpZiAoYmVzdFBhdGhbMF0ubmV3UG9zKzEgPj0gbmV3TGVuICYmIG9sZFBvcysxID49IG9sZExlbikge1xuICAgICAgICAgIHJldHVybiBiZXN0UGF0aFswXS5jb21wb25lbnRzO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgZWRpdExlbmd0aCA9IDE7IGVkaXRMZW5ndGggPD0gbWF4RWRpdExlbmd0aDsgZWRpdExlbmd0aCsrKSB7XG4gICAgICAgICAgZm9yICh2YXIgZGlhZ29uYWxQYXRoID0gLTEqZWRpdExlbmd0aDsgZGlhZ29uYWxQYXRoIDw9IGVkaXRMZW5ndGg7IGRpYWdvbmFsUGF0aCs9Mikge1xuICAgICAgICAgICAgdmFyIGJhc2VQYXRoO1xuICAgICAgICAgICAgdmFyIGFkZFBhdGggPSBiZXN0UGF0aFtkaWFnb25hbFBhdGgtMV0sXG4gICAgICAgICAgICAgICAgcmVtb3ZlUGF0aCA9IGJlc3RQYXRoW2RpYWdvbmFsUGF0aCsxXTtcbiAgICAgICAgICAgIG9sZFBvcyA9IChyZW1vdmVQYXRoID8gcmVtb3ZlUGF0aC5uZXdQb3MgOiAwKSAtIGRpYWdvbmFsUGF0aDtcbiAgICAgICAgICAgIGlmIChhZGRQYXRoKSB7XG4gICAgICAgICAgICAgIC8vIE5vIG9uZSBlbHNlIGlzIGdvaW5nIHRvIGF0dGVtcHQgdG8gdXNlIHRoaXMgdmFsdWUsIGNsZWFyIGl0XG4gICAgICAgICAgICAgIGJlc3RQYXRoW2RpYWdvbmFsUGF0aC0xXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGNhbkFkZCA9IGFkZFBhdGggJiYgYWRkUGF0aC5uZXdQb3MrMSA8IG5ld0xlbjtcbiAgICAgICAgICAgIHZhciBjYW5SZW1vdmUgPSByZW1vdmVQYXRoICYmIDAgPD0gb2xkUG9zICYmIG9sZFBvcyA8IG9sZExlbjtcbiAgICAgICAgICAgIGlmICghY2FuQWRkICYmICFjYW5SZW1vdmUpIHtcbiAgICAgICAgICAgICAgYmVzdFBhdGhbZGlhZ29uYWxQYXRoXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFNlbGVjdCB0aGUgZGlhZ29uYWwgdGhhdCB3ZSB3YW50IHRvIGJyYW5jaCBmcm9tLiBXZSBzZWxlY3QgdGhlIHByaW9yXG4gICAgICAgICAgICAvLyBwYXRoIHdob3NlIHBvc2l0aW9uIGluIHRoZSBuZXcgc3RyaW5nIGlzIHRoZSBmYXJ0aGVzdCBmcm9tIHRoZSBvcmlnaW5cbiAgICAgICAgICAgIC8vIGFuZCBkb2VzIG5vdCBwYXNzIHRoZSBib3VuZHMgb2YgdGhlIGRpZmYgZ3JhcGhcbiAgICAgICAgICAgIGlmICghY2FuQWRkIHx8IChjYW5SZW1vdmUgJiYgYWRkUGF0aC5uZXdQb3MgPCByZW1vdmVQYXRoLm5ld1BvcykpIHtcbiAgICAgICAgICAgICAgYmFzZVBhdGggPSBjbG9uZVBhdGgocmVtb3ZlUGF0aCk7XG4gICAgICAgICAgICAgIHRoaXMucHVzaENvbXBvbmVudChiYXNlUGF0aC5jb21wb25lbnRzLCBvbGRTdHJpbmdbb2xkUG9zXSwgdW5kZWZpbmVkLCB0cnVlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGJhc2VQYXRoID0gY2xvbmVQYXRoKGFkZFBhdGgpO1xuICAgICAgICAgICAgICBiYXNlUGF0aC5uZXdQb3MrKztcbiAgICAgICAgICAgICAgdGhpcy5wdXNoQ29tcG9uZW50KGJhc2VQYXRoLmNvbXBvbmVudHMsIG5ld1N0cmluZ1tiYXNlUGF0aC5uZXdQb3NdLCB0cnVlLCB1bmRlZmluZWQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgb2xkUG9zID0gdGhpcy5leHRyYWN0Q29tbW9uKGJhc2VQYXRoLCBuZXdTdHJpbmcsIG9sZFN0cmluZywgZGlhZ29uYWxQYXRoKTtcblxuICAgICAgICAgICAgaWYgKGJhc2VQYXRoLm5ld1BvcysxID49IG5ld0xlbiAmJiBvbGRQb3MrMSA+PSBvbGRMZW4pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGJhc2VQYXRoLmNvbXBvbmVudHM7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBiZXN0UGF0aFtkaWFnb25hbFBhdGhdID0gYmFzZVBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICBwdXNoQ29tcG9uZW50OiBmdW5jdGlvbihjb21wb25lbnRzLCB2YWx1ZSwgYWRkZWQsIHJlbW92ZWQpIHtcbiAgICAgICAgdmFyIGxhc3QgPSBjb21wb25lbnRzW2NvbXBvbmVudHMubGVuZ3RoLTFdO1xuICAgICAgICBpZiAobGFzdCAmJiBsYXN0LmFkZGVkID09PSBhZGRlZCAmJiBsYXN0LnJlbW92ZWQgPT09IHJlbW92ZWQpIHtcbiAgICAgICAgICAvLyBXZSBuZWVkIHRvIGNsb25lIGhlcmUgYXMgdGhlIGNvbXBvbmVudCBjbG9uZSBvcGVyYXRpb24gaXMganVzdFxuICAgICAgICAgIC8vIGFzIHNoYWxsb3cgYXJyYXkgY2xvbmVcbiAgICAgICAgICBjb21wb25lbnRzW2NvbXBvbmVudHMubGVuZ3RoLTFdID1cbiAgICAgICAgICAgIHt2YWx1ZTogdGhpcy5qb2luKGxhc3QudmFsdWUsIHZhbHVlKSwgYWRkZWQ6IGFkZGVkLCByZW1vdmVkOiByZW1vdmVkIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29tcG9uZW50cy5wdXNoKHt2YWx1ZTogdmFsdWUsIGFkZGVkOiBhZGRlZCwgcmVtb3ZlZDogcmVtb3ZlZCB9KTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIGV4dHJhY3RDb21tb246IGZ1bmN0aW9uKGJhc2VQYXRoLCBuZXdTdHJpbmcsIG9sZFN0cmluZywgZGlhZ29uYWxQYXRoKSB7XG4gICAgICAgIHZhciBuZXdMZW4gPSBuZXdTdHJpbmcubGVuZ3RoLFxuICAgICAgICAgICAgb2xkTGVuID0gb2xkU3RyaW5nLmxlbmd0aCxcbiAgICAgICAgICAgIG5ld1BvcyA9IGJhc2VQYXRoLm5ld1BvcyxcbiAgICAgICAgICAgIG9sZFBvcyA9IG5ld1BvcyAtIGRpYWdvbmFsUGF0aDtcbiAgICAgICAgd2hpbGUgKG5ld1BvcysxIDwgbmV3TGVuICYmIG9sZFBvcysxIDwgb2xkTGVuICYmIHRoaXMuZXF1YWxzKG5ld1N0cmluZ1tuZXdQb3MrMV0sIG9sZFN0cmluZ1tvbGRQb3MrMV0pKSB7XG4gICAgICAgICAgbmV3UG9zKys7XG4gICAgICAgICAgb2xkUG9zKys7XG5cbiAgICAgICAgICB0aGlzLnB1c2hDb21wb25lbnQoYmFzZVBhdGguY29tcG9uZW50cywgbmV3U3RyaW5nW25ld1Bvc10sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgICAgICBiYXNlUGF0aC5uZXdQb3MgPSBuZXdQb3M7XG4gICAgICAgIHJldHVybiBvbGRQb3M7XG4gICAgICB9LFxuXG4gICAgICBlcXVhbHM6IGZ1bmN0aW9uKGxlZnQsIHJpZ2h0KSB7XG4gICAgICAgIHZhciByZVdoaXRlc3BhY2UgPSAvXFxTLztcbiAgICAgICAgaWYgKHRoaXMuaWdub3JlV2hpdGVzcGFjZSAmJiAhcmVXaGl0ZXNwYWNlLnRlc3QobGVmdCkgJiYgIXJlV2hpdGVzcGFjZS50ZXN0KHJpZ2h0KSkge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBsZWZ0ID09PSByaWdodDtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIGpvaW46IGZ1bmN0aW9uKGxlZnQsIHJpZ2h0KSB7XG4gICAgICAgIHJldHVybiBsZWZ0ICsgcmlnaHQ7XG4gICAgICB9LFxuICAgICAgdG9rZW5pemU6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgIH1cbiAgfTtcblxuICB2YXIgQ2hhckRpZmYgPSBuZXcgRGlmZigpO1xuXG4gIHZhciBXb3JkRGlmZiA9IG5ldyBEaWZmKHRydWUpO1xuICB2YXIgV29yZFdpdGhTcGFjZURpZmYgPSBuZXcgRGlmZigpO1xuICBXb3JkRGlmZi50b2tlbml6ZSA9IFdvcmRXaXRoU3BhY2VEaWZmLnRva2VuaXplID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gcmVtb3ZlRW1wdHkodmFsdWUuc3BsaXQoLyhcXHMrfFxcYikvKSk7XG4gIH07XG5cbiAgdmFyIENzc0RpZmYgPSBuZXcgRGlmZih0cnVlKTtcbiAgQ3NzRGlmZi50b2tlbml6ZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIHJlbW92ZUVtcHR5KHZhbHVlLnNwbGl0KC8oW3t9OjssXXxcXHMrKS8pKTtcbiAgfTtcblxuICB2YXIgTGluZURpZmYgPSBuZXcgRGlmZigpO1xuICBMaW5lRGlmZi50b2tlbml6ZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlLnNwbGl0KC9eL20pO1xuICB9O1xuXG4gIHJldHVybiB7XG4gICAgRGlmZjogRGlmZixcblxuICAgIGRpZmZDaGFyczogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIENoYXJEaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpOyB9LFxuICAgIGRpZmZXb3JkczogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIFdvcmREaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpOyB9LFxuICAgIGRpZmZXb3Jkc1dpdGhTcGFjZTogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIFdvcmRXaXRoU3BhY2VEaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpOyB9LFxuICAgIGRpZmZMaW5lczogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIExpbmVEaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpOyB9LFxuXG4gICAgZGlmZkNzczogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIENzc0RpZmYuZGlmZihvbGRTdHIsIG5ld1N0cik7IH0sXG5cbiAgICBjcmVhdGVQYXRjaDogZnVuY3Rpb24oZmlsZU5hbWUsIG9sZFN0ciwgbmV3U3RyLCBvbGRIZWFkZXIsIG5ld0hlYWRlcikge1xuICAgICAgdmFyIHJldCA9IFtdO1xuXG4gICAgICByZXQucHVzaCgnSW5kZXg6ICcgKyBmaWxlTmFtZSk7XG4gICAgICByZXQucHVzaCgnPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PScpO1xuICAgICAgcmV0LnB1c2goJy0tLSAnICsgZmlsZU5hbWUgKyAodHlwZW9mIG9sZEhlYWRlciA9PT0gJ3VuZGVmaW5lZCcgPyAnJyA6ICdcXHQnICsgb2xkSGVhZGVyKSk7XG4gICAgICByZXQucHVzaCgnKysrICcgKyBmaWxlTmFtZSArICh0eXBlb2YgbmV3SGVhZGVyID09PSAndW5kZWZpbmVkJyA/ICcnIDogJ1xcdCcgKyBuZXdIZWFkZXIpKTtcblxuICAgICAgdmFyIGRpZmYgPSBMaW5lRGlmZi5kaWZmKG9sZFN0ciwgbmV3U3RyKTtcbiAgICAgIGlmICghZGlmZltkaWZmLmxlbmd0aC0xXS52YWx1ZSkge1xuICAgICAgICBkaWZmLnBvcCgpOyAgIC8vIFJlbW92ZSB0cmFpbGluZyBuZXdsaW5lIGFkZFxuICAgICAgfVxuICAgICAgZGlmZi5wdXNoKHt2YWx1ZTogJycsIGxpbmVzOiBbXX0pOyAgIC8vIEFwcGVuZCBhbiBlbXB0eSB2YWx1ZSB0byBtYWtlIGNsZWFudXAgZWFzaWVyXG5cbiAgICAgIGZ1bmN0aW9uIGNvbnRleHRMaW5lcyhsaW5lcykge1xuICAgICAgICByZXR1cm4gbGluZXMubWFwKGZ1bmN0aW9uKGVudHJ5KSB7IHJldHVybiAnICcgKyBlbnRyeTsgfSk7XG4gICAgICB9XG4gICAgICBmdW5jdGlvbiBlb2ZOTChjdXJSYW5nZSwgaSwgY3VycmVudCkge1xuICAgICAgICB2YXIgbGFzdCA9IGRpZmZbZGlmZi5sZW5ndGgtMl0sXG4gICAgICAgICAgICBpc0xhc3QgPSBpID09PSBkaWZmLmxlbmd0aC0yLFxuICAgICAgICAgICAgaXNMYXN0T2ZUeXBlID0gaSA9PT0gZGlmZi5sZW5ndGgtMyAmJiAoY3VycmVudC5hZGRlZCAhPT0gbGFzdC5hZGRlZCB8fCBjdXJyZW50LnJlbW92ZWQgIT09IGxhc3QucmVtb3ZlZCk7XG5cbiAgICAgICAgLy8gRmlndXJlIG91dCBpZiB0aGlzIGlzIHRoZSBsYXN0IGxpbmUgZm9yIHRoZSBnaXZlbiBmaWxlIGFuZCBtaXNzaW5nIE5MXG4gICAgICAgIGlmICghL1xcbiQvLnRlc3QoY3VycmVudC52YWx1ZSkgJiYgKGlzTGFzdCB8fCBpc0xhc3RPZlR5cGUpKSB7XG4gICAgICAgICAgY3VyUmFuZ2UucHVzaCgnXFxcXCBObyBuZXdsaW5lIGF0IGVuZCBvZiBmaWxlJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdmFyIG9sZFJhbmdlU3RhcnQgPSAwLCBuZXdSYW5nZVN0YXJ0ID0gMCwgY3VyUmFuZ2UgPSBbXSxcbiAgICAgICAgICBvbGRMaW5lID0gMSwgbmV3TGluZSA9IDE7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRpZmYubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGN1cnJlbnQgPSBkaWZmW2ldLFxuICAgICAgICAgICAgbGluZXMgPSBjdXJyZW50LmxpbmVzIHx8IGN1cnJlbnQudmFsdWUucmVwbGFjZSgvXFxuJC8sICcnKS5zcGxpdCgnXFxuJyk7XG4gICAgICAgIGN1cnJlbnQubGluZXMgPSBsaW5lcztcblxuICAgICAgICBpZiAoY3VycmVudC5hZGRlZCB8fCBjdXJyZW50LnJlbW92ZWQpIHtcbiAgICAgICAgICBpZiAoIW9sZFJhbmdlU3RhcnQpIHtcbiAgICAgICAgICAgIHZhciBwcmV2ID0gZGlmZltpLTFdO1xuICAgICAgICAgICAgb2xkUmFuZ2VTdGFydCA9IG9sZExpbmU7XG4gICAgICAgICAgICBuZXdSYW5nZVN0YXJ0ID0gbmV3TGluZTtcblxuICAgICAgICAgICAgaWYgKHByZXYpIHtcbiAgICAgICAgICAgICAgY3VyUmFuZ2UgPSBjb250ZXh0TGluZXMocHJldi5saW5lcy5zbGljZSgtNCkpO1xuICAgICAgICAgICAgICBvbGRSYW5nZVN0YXJ0IC09IGN1clJhbmdlLmxlbmd0aDtcbiAgICAgICAgICAgICAgbmV3UmFuZ2VTdGFydCAtPSBjdXJSYW5nZS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGN1clJhbmdlLnB1c2guYXBwbHkoY3VyUmFuZ2UsIGxpbmVzLm1hcChmdW5jdGlvbihlbnRyeSkgeyByZXR1cm4gKGN1cnJlbnQuYWRkZWQ/JysnOictJykgKyBlbnRyeTsgfSkpO1xuICAgICAgICAgIGVvZk5MKGN1clJhbmdlLCBpLCBjdXJyZW50KTtcblxuICAgICAgICAgIGlmIChjdXJyZW50LmFkZGVkKSB7XG4gICAgICAgICAgICBuZXdMaW5lICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb2xkTGluZSArPSBsaW5lcy5sZW5ndGg7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChvbGRSYW5nZVN0YXJ0KSB7XG4gICAgICAgICAgICAvLyBDbG9zZSBvdXQgYW55IGNoYW5nZXMgdGhhdCBoYXZlIGJlZW4gb3V0cHV0IChvciBqb2luIG92ZXJsYXBwaW5nKVxuICAgICAgICAgICAgaWYgKGxpbmVzLmxlbmd0aCA8PSA4ICYmIGkgPCBkaWZmLmxlbmd0aC0yKSB7XG4gICAgICAgICAgICAgIC8vIE92ZXJsYXBwaW5nXG4gICAgICAgICAgICAgIGN1clJhbmdlLnB1c2guYXBwbHkoY3VyUmFuZ2UsIGNvbnRleHRMaW5lcyhsaW5lcykpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gZW5kIHRoZSByYW5nZSBhbmQgb3V0cHV0XG4gICAgICAgICAgICAgIHZhciBjb250ZXh0U2l6ZSA9IE1hdGgubWluKGxpbmVzLmxlbmd0aCwgNCk7XG4gICAgICAgICAgICAgIHJldC5wdXNoKFxuICAgICAgICAgICAgICAgICAgJ0BAIC0nICsgb2xkUmFuZ2VTdGFydCArICcsJyArIChvbGRMaW5lLW9sZFJhbmdlU3RhcnQrY29udGV4dFNpemUpXG4gICAgICAgICAgICAgICAgICArICcgKycgKyBuZXdSYW5nZVN0YXJ0ICsgJywnICsgKG5ld0xpbmUtbmV3UmFuZ2VTdGFydCtjb250ZXh0U2l6ZSlcbiAgICAgICAgICAgICAgICAgICsgJyBAQCcpO1xuICAgICAgICAgICAgICByZXQucHVzaC5hcHBseShyZXQsIGN1clJhbmdlKTtcbiAgICAgICAgICAgICAgcmV0LnB1c2guYXBwbHkocmV0LCBjb250ZXh0TGluZXMobGluZXMuc2xpY2UoMCwgY29udGV4dFNpemUpKSk7XG4gICAgICAgICAgICAgIGlmIChsaW5lcy5sZW5ndGggPD0gNCkge1xuICAgICAgICAgICAgICAgIGVvZk5MKHJldCwgaSwgY3VycmVudCk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBvbGRSYW5nZVN0YXJ0ID0gMDsgIG5ld1JhbmdlU3RhcnQgPSAwOyBjdXJSYW5nZSA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBvbGRMaW5lICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgICBuZXdMaW5lICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmV0LmpvaW4oJ1xcbicpICsgJ1xcbic7XG4gICAgfSxcblxuICAgIGFwcGx5UGF0Y2g6IGZ1bmN0aW9uKG9sZFN0ciwgdW5pRGlmZikge1xuICAgICAgdmFyIGRpZmZzdHIgPSB1bmlEaWZmLnNwbGl0KCdcXG4nKTtcbiAgICAgIHZhciBkaWZmID0gW107XG4gICAgICB2YXIgcmVtRU9GTkwgPSBmYWxzZSxcbiAgICAgICAgICBhZGRFT0ZOTCA9IGZhbHNlO1xuXG4gICAgICBmb3IgKHZhciBpID0gKGRpZmZzdHJbMF1bMF09PT0nSSc/NDowKTsgaSA8IGRpZmZzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYoZGlmZnN0cltpXVswXSA9PT0gJ0AnKSB7XG4gICAgICAgICAgdmFyIG1laCA9IGRpZmZzdHJbaV0uc3BsaXQoL0BAIC0oXFxkKyksKFxcZCspIFxcKyhcXGQrKSwoXFxkKykgQEAvKTtcbiAgICAgICAgICBkaWZmLnVuc2hpZnQoe1xuICAgICAgICAgICAgc3RhcnQ6bWVoWzNdLFxuICAgICAgICAgICAgb2xkbGVuZ3RoOm1laFsyXSxcbiAgICAgICAgICAgIG9sZGxpbmVzOltdLFxuICAgICAgICAgICAgbmV3bGVuZ3RoOm1laFs0XSxcbiAgICAgICAgICAgIG5ld2xpbmVzOltdXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSBpZihkaWZmc3RyW2ldWzBdID09PSAnKycpIHtcbiAgICAgICAgICBkaWZmWzBdLm5ld2xpbmVzLnB1c2goZGlmZnN0cltpXS5zdWJzdHIoMSkpO1xuICAgICAgICB9IGVsc2UgaWYoZGlmZnN0cltpXVswXSA9PT0gJy0nKSB7XG4gICAgICAgICAgZGlmZlswXS5vbGRsaW5lcy5wdXNoKGRpZmZzdHJbaV0uc3Vic3RyKDEpKTtcbiAgICAgICAgfSBlbHNlIGlmKGRpZmZzdHJbaV1bMF0gPT09ICcgJykge1xuICAgICAgICAgIGRpZmZbMF0ubmV3bGluZXMucHVzaChkaWZmc3RyW2ldLnN1YnN0cigxKSk7XG4gICAgICAgICAgZGlmZlswXS5vbGRsaW5lcy5wdXNoKGRpZmZzdHJbaV0uc3Vic3RyKDEpKTtcbiAgICAgICAgfSBlbHNlIGlmKGRpZmZzdHJbaV1bMF0gPT09ICdcXFxcJykge1xuICAgICAgICAgIGlmIChkaWZmc3RyW2ktMV1bMF0gPT09ICcrJykge1xuICAgICAgICAgICAgcmVtRU9GTkwgPSB0cnVlO1xuICAgICAgICAgIH0gZWxzZSBpZihkaWZmc3RyW2ktMV1bMF0gPT09ICctJykge1xuICAgICAgICAgICAgYWRkRU9GTkwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgc3RyID0gb2xkU3RyLnNwbGl0KCdcXG4nKTtcbiAgICAgIGZvciAodmFyIGkgPSBkaWZmLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIHZhciBkID0gZGlmZltpXTtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBkLm9sZGxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgaWYoc3RyW2Quc3RhcnQtMStqXSAhPT0gZC5vbGRsaW5lc1tqXSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBBcnJheS5wcm90b3R5cGUuc3BsaWNlLmFwcGx5KHN0cixbZC5zdGFydC0xLCtkLm9sZGxlbmd0aF0uY29uY2F0KGQubmV3bGluZXMpKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlbUVPRk5MKSB7XG4gICAgICAgIHdoaWxlICghc3RyW3N0ci5sZW5ndGgtMV0pIHtcbiAgICAgICAgICBzdHIucG9wKCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoYWRkRU9GTkwpIHtcbiAgICAgICAgc3RyLnB1c2goJycpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0ci5qb2luKCdcXG4nKTtcbiAgICB9LFxuXG4gICAgY29udmVydENoYW5nZXNUb1hNTDogZnVuY3Rpb24oY2hhbmdlcyl7XG4gICAgICB2YXIgcmV0ID0gW107XG4gICAgICBmb3IgKCB2YXIgaSA9IDA7IGkgPCBjaGFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGFuZ2UgPSBjaGFuZ2VzW2ldO1xuICAgICAgICBpZiAoY2hhbmdlLmFkZGVkKSB7XG4gICAgICAgICAgcmV0LnB1c2goJzxpbnM+Jyk7XG4gICAgICAgIH0gZWxzZSBpZiAoY2hhbmdlLnJlbW92ZWQpIHtcbiAgICAgICAgICByZXQucHVzaCgnPGRlbD4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldC5wdXNoKGVzY2FwZUhUTUwoY2hhbmdlLnZhbHVlKSk7XG5cbiAgICAgICAgaWYgKGNoYW5nZS5hZGRlZCkge1xuICAgICAgICAgIHJldC5wdXNoKCc8L2lucz4nKTtcbiAgICAgICAgfSBlbHNlIGlmIChjaGFuZ2UucmVtb3ZlZCkge1xuICAgICAgICAgIHJldC5wdXNoKCc8L2RlbD4nKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJldC5qb2luKCcnKTtcbiAgICB9LFxuXG4gICAgLy8gU2VlOiBodHRwOi8vY29kZS5nb29nbGUuY29tL3AvZ29vZ2xlLWRpZmYtbWF0Y2gtcGF0Y2gvd2lraS9BUElcbiAgICBjb252ZXJ0Q2hhbmdlc1RvRE1QOiBmdW5jdGlvbihjaGFuZ2VzKXtcbiAgICAgIHZhciByZXQgPSBbXSwgY2hhbmdlO1xuICAgICAgZm9yICggdmFyIGkgPSAwOyBpIDwgY2hhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjaGFuZ2UgPSBjaGFuZ2VzW2ldO1xuICAgICAgICByZXQucHVzaChbKGNoYW5nZS5hZGRlZCA/IDEgOiBjaGFuZ2UucmVtb3ZlZCA/IC0xIDogMCksIGNoYW5nZS52YWx1ZV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJldDtcbiAgICB9XG4gIH07XG59KSgpO1xuXG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEpzRGlmZjtcbn1cblxufSk7IC8vIG1vZHVsZTogYnJvd3Nlci9kaWZmLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJicm93c2VyL2V2ZW50cy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBleHBvcnRzLlxuICovXG5cbmV4cG9ydHMuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuXG4vKipcbiAqIENoZWNrIGlmIGBvYmpgIGlzIGFuIGFycmF5LlxuICovXG5cbmZ1bmN0aW9uIGlzQXJyYXkob2JqKSB7XG4gIHJldHVybiAnW29iamVjdCBBcnJheV0nID09IHt9LnRvU3RyaW5nLmNhbGwob2JqKTtcbn1cblxuLyoqXG4gKiBFdmVudCBlbWl0dGVyIGNvbnN0cnVjdG9yLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gRXZlbnRFbWl0dGVyKCl7fTtcblxuLyoqXG4gKiBBZGRzIGEgbGlzdGVuZXIuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gZnVuY3Rpb24gKG5hbWUsIGZuKSB7XG4gIGlmICghdGhpcy4kZXZlbnRzKSB7XG4gICAgdGhpcy4kZXZlbnRzID0ge307XG4gIH1cblxuICBpZiAoIXRoaXMuJGV2ZW50c1tuYW1lXSkge1xuICAgIHRoaXMuJGV2ZW50c1tuYW1lXSA9IGZuO1xuICB9IGVsc2UgaWYgKGlzQXJyYXkodGhpcy4kZXZlbnRzW25hbWVdKSkge1xuICAgIHRoaXMuJGV2ZW50c1tuYW1lXS5wdXNoKGZuKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLiRldmVudHNbbmFtZV0gPSBbdGhpcy4kZXZlbnRzW25hbWVdLCBmbl07XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXIgPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uO1xuXG4vKipcbiAqIEFkZHMgYSB2b2xhdGlsZSBsaXN0ZW5lci5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uIChuYW1lLCBmbikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgZnVuY3Rpb24gb24gKCkge1xuICAgIHNlbGYucmVtb3ZlTGlzdGVuZXIobmFtZSwgb24pO1xuICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgb24ubGlzdGVuZXIgPSBmbjtcbiAgdGhpcy5vbihuYW1lLCBvbik7XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJlbW92ZXMgYSBsaXN0ZW5lci5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbiAobmFtZSwgZm4pIHtcbiAgaWYgKHRoaXMuJGV2ZW50cyAmJiB0aGlzLiRldmVudHNbbmFtZV0pIHtcbiAgICB2YXIgbGlzdCA9IHRoaXMuJGV2ZW50c1tuYW1lXTtcblxuICAgIGlmIChpc0FycmF5KGxpc3QpKSB7XG4gICAgICB2YXIgcG9zID0gLTE7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gbGlzdC5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaWYgKGxpc3RbaV0gPT09IGZuIHx8IChsaXN0W2ldLmxpc3RlbmVyICYmIGxpc3RbaV0ubGlzdGVuZXIgPT09IGZuKSkge1xuICAgICAgICAgIHBvcyA9IGk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHBvcyA8IDApIHtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG5cbiAgICAgIGxpc3Quc3BsaWNlKHBvcywgMSk7XG5cbiAgICAgIGlmICghbGlzdC5sZW5ndGgpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuJGV2ZW50c1tuYW1lXTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGxpc3QgPT09IGZuIHx8IChsaXN0Lmxpc3RlbmVyICYmIGxpc3QubGlzdGVuZXIgPT09IGZuKSkge1xuICAgICAgZGVsZXRlIHRoaXMuJGV2ZW50c1tuYW1lXTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmVtb3ZlcyBhbGwgbGlzdGVuZXJzIGZvciBhbiBldmVudC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgaWYgKG5hbWUgPT09IHVuZGVmaW5lZCkge1xuICAgIHRoaXMuJGV2ZW50cyA9IHt9O1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgaWYgKHRoaXMuJGV2ZW50cyAmJiB0aGlzLiRldmVudHNbbmFtZV0pIHtcbiAgICB0aGlzLiRldmVudHNbbmFtZV0gPSBudWxsO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEdldHMgYWxsIGxpc3RlbmVycyBmb3IgYSBjZXJ0YWluIGV2ZW50LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbiAobmFtZSkge1xuICBpZiAoIXRoaXMuJGV2ZW50cykge1xuICAgIHRoaXMuJGV2ZW50cyA9IHt9O1xuICB9XG5cbiAgaWYgKCF0aGlzLiRldmVudHNbbmFtZV0pIHtcbiAgICB0aGlzLiRldmVudHNbbmFtZV0gPSBbXTtcbiAgfVxuXG4gIGlmICghaXNBcnJheSh0aGlzLiRldmVudHNbbmFtZV0pKSB7XG4gICAgdGhpcy4kZXZlbnRzW25hbWVdID0gW3RoaXMuJGV2ZW50c1tuYW1lXV07XG4gIH1cblxuICByZXR1cm4gdGhpcy4kZXZlbnRzW25hbWVdO1xufTtcblxuLyoqXG4gKiBFbWl0cyBhbiBldmVudC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gIGlmICghdGhpcy4kZXZlbnRzKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgdmFyIGhhbmRsZXIgPSB0aGlzLiRldmVudHNbbmFtZV07XG5cbiAgaWYgKCFoYW5kbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIGhhbmRsZXIpIHtcbiAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9IGVsc2UgaWYgKGlzQXJyYXkoaGFuZGxlcikpIHtcbiAgICB2YXIgbGlzdGVuZXJzID0gaGFuZGxlci5zbGljZSgpO1xuXG4gICAgZm9yICh2YXIgaSA9IDAsIGwgPSBsaXN0ZW5lcnMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICBsaXN0ZW5lcnNbaV0uYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcbn0pOyAvLyBtb2R1bGU6IGJyb3dzZXIvZXZlbnRzLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJicm93c2VyL2ZzLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbn0pOyAvLyBtb2R1bGU6IGJyb3dzZXIvZnMuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImJyb3dzZXIvcGF0aC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG59KTsgLy8gbW9kdWxlOiBicm93c2VyL3BhdGguanNcblxucmVxdWlyZS5yZWdpc3RlcihcImJyb3dzZXIvcHJvZ3Jlc3MuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qKlxuICogRXhwb3NlIGBQcm9ncmVzc2AuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBQcm9ncmVzcztcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBQcm9ncmVzc2AgaW5kaWNhdG9yLlxuICovXG5cbmZ1bmN0aW9uIFByb2dyZXNzKCkge1xuICB0aGlzLnBlcmNlbnQgPSAwO1xuICB0aGlzLnNpemUoMCk7XG4gIHRoaXMuZm9udFNpemUoMTEpO1xuICB0aGlzLmZvbnQoJ2hlbHZldGljYSwgYXJpYWwsIHNhbnMtc2VyaWYnKTtcbn1cblxuLyoqXG4gKiBTZXQgcHJvZ3Jlc3Mgc2l6ZSB0byBgbmAuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG5cbiAqIEByZXR1cm4ge1Byb2dyZXNzfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUHJvZ3Jlc3MucHJvdG90eXBlLnNpemUgPSBmdW5jdGlvbihuKXtcbiAgdGhpcy5fc2l6ZSA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGV4dCB0byBgc3RyYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtQcm9ncmVzc30gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblByb2dyZXNzLnByb3RvdHlwZS50ZXh0ID0gZnVuY3Rpb24oc3RyKXtcbiAgdGhpcy5fdGV4dCA9IHN0cjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCBmb250IHNpemUgdG8gYG5gLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXG4gKiBAcmV0dXJuIHtQcm9ncmVzc30gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblByb2dyZXNzLnByb3RvdHlwZS5mb250U2l6ZSA9IGZ1bmN0aW9uKG4pe1xuICB0aGlzLl9mb250U2l6ZSA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgZm9udCBgZmFtaWx5YC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmFtaWx5XG4gKiBAcmV0dXJuIHtQcm9ncmVzc30gZm9yIGNoYWluaW5nXG4gKi9cblxuUHJvZ3Jlc3MucHJvdG90eXBlLmZvbnQgPSBmdW5jdGlvbihmYW1pbHkpe1xuICB0aGlzLl9mb250ID0gZmFtaWx5O1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogVXBkYXRlIHBlcmNlbnRhZ2UgdG8gYG5gLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXG4gKiBAcmV0dXJuIHtQcm9ncmVzc30gZm9yIGNoYWluaW5nXG4gKi9cblxuUHJvZ3Jlc3MucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKG4pe1xuICB0aGlzLnBlcmNlbnQgPSBuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogRHJhdyBvbiBgY3R4YC5cbiAqXG4gKiBAcGFyYW0ge0NhbnZhc1JlbmRlcmluZ0NvbnRleHQyZH0gY3R4XG4gKiBAcmV0dXJuIHtQcm9ncmVzc30gZm9yIGNoYWluaW5nXG4gKi9cblxuUHJvZ3Jlc3MucHJvdG90eXBlLmRyYXcgPSBmdW5jdGlvbihjdHgpe1xuICB0cnkge1xuICAgIHZhciBwZXJjZW50ID0gTWF0aC5taW4odGhpcy5wZXJjZW50LCAxMDApXG4gICAgICAsIHNpemUgPSB0aGlzLl9zaXplXG4gICAgICAsIGhhbGYgPSBzaXplIC8gMlxuICAgICAgLCB4ID0gaGFsZlxuICAgICAgLCB5ID0gaGFsZlxuICAgICAgLCByYWQgPSBoYWxmIC0gMVxuICAgICAgLCBmb250U2l6ZSA9IHRoaXMuX2ZvbnRTaXplO1xuICBcbiAgICBjdHguZm9udCA9IGZvbnRTaXplICsgJ3B4ICcgKyB0aGlzLl9mb250O1xuICBcbiAgICB2YXIgYW5nbGUgPSBNYXRoLlBJICogMiAqIChwZXJjZW50IC8gMTAwKTtcbiAgICBjdHguY2xlYXJSZWN0KDAsIDAsIHNpemUsIHNpemUpO1xuICBcbiAgICAvLyBvdXRlciBjaXJjbGVcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSAnIzlmOWY5Zic7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMoeCwgeSwgcmFkLCAwLCBhbmdsZSwgZmFsc2UpO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgXG4gICAgLy8gaW5uZXIgY2lyY2xlXG4gICAgY3R4LnN0cm9rZVN0eWxlID0gJyNlZWUnO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHguYXJjKHgsIHksIHJhZCAtIDEsIDAsIGFuZ2xlLCB0cnVlKTtcbiAgICBjdHguc3Ryb2tlKCk7XG4gIFxuICAgIC8vIHRleHRcbiAgICB2YXIgdGV4dCA9IHRoaXMuX3RleHQgfHwgKHBlcmNlbnQgfCAwKSArICclJ1xuICAgICAgLCB3ID0gY3R4Lm1lYXN1cmVUZXh0KHRleHQpLndpZHRoO1xuICBcbiAgICBjdHguZmlsbFRleHQoXG4gICAgICAgIHRleHRcbiAgICAgICwgeCAtIHcgLyAyICsgMVxuICAgICAgLCB5ICsgZm9udFNpemUgLyAyIC0gMSk7XG4gIH0gY2F0Y2ggKGV4KSB7fSAvL2Rvbid0IGZhaWwgaWYgd2UgY2FuJ3QgcmVuZGVyIHByb2dyZXNzXG4gIHJldHVybiB0aGlzO1xufTtcblxufSk7IC8vIG1vZHVsZTogYnJvd3Nlci9wcm9ncmVzcy5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiYnJvd3Nlci90dHkuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuZXhwb3J0cy5pc2F0dHkgPSBmdW5jdGlvbigpe1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmV4cG9ydHMuZ2V0V2luZG93U2l6ZSA9IGZ1bmN0aW9uKCl7XG4gIGlmICgnaW5uZXJIZWlnaHQnIGluIGdsb2JhbCkge1xuICAgIHJldHVybiBbZ2xvYmFsLmlubmVySGVpZ2h0LCBnbG9iYWwuaW5uZXJXaWR0aF07XG4gIH0gZWxzZSB7XG4gICAgLy8gSW4gYSBXZWIgV29ya2VyLCB0aGUgRE9NIFdpbmRvdyBpcyBub3QgYXZhaWxhYmxlLlxuICAgIHJldHVybiBbNjQwLCA0ODBdO1xuICB9XG59O1xuXG59KTsgLy8gbW9kdWxlOiBicm93c2VyL3R0eS5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiY29udGV4dC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIEV4cG9zZSBgQ29udGV4dGAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBDb250ZXh0O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYENvbnRleHRgLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIENvbnRleHQoKXt9XG5cbi8qKlxuICogU2V0IG9yIGdldCB0aGUgY29udGV4dCBgUnVubmFibGVgIHRvIGBydW5uYWJsZWAuXG4gKlxuICogQHBhcmFtIHtSdW5uYWJsZX0gcnVubmFibGVcbiAqIEByZXR1cm4ge0NvbnRleHR9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Db250ZXh0LnByb3RvdHlwZS5ydW5uYWJsZSA9IGZ1bmN0aW9uKHJ1bm5hYmxlKXtcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX3J1bm5hYmxlO1xuICB0aGlzLnRlc3QgPSB0aGlzLl9ydW5uYWJsZSA9IHJ1bm5hYmxlO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IHRlc3QgdGltZW91dCBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7Q29udGV4dH0gc2VsZlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQ29udGV4dC5wcm90b3R5cGUudGltZW91dCA9IGZ1bmN0aW9uKG1zKXtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHJldHVybiB0aGlzLnJ1bm5hYmxlKCkudGltZW91dCgpO1xuICB0aGlzLnJ1bm5hYmxlKCkudGltZW91dChtcyk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGVzdCB0aW1lb3V0IGBlbmFibGVkYC5cbiAqXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZWRcbiAqIEByZXR1cm4ge0NvbnRleHR9IHNlbGZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkNvbnRleHQucHJvdG90eXBlLmVuYWJsZVRpbWVvdXRzID0gZnVuY3Rpb24gKGVuYWJsZWQpIHtcbiAgdGhpcy5ydW5uYWJsZSgpLmVuYWJsZVRpbWVvdXRzKGVuYWJsZWQpO1xuICByZXR1cm4gdGhpcztcbn07XG5cblxuLyoqXG4gKiBTZXQgdGVzdCBzbG93bmVzcyB0aHJlc2hvbGQgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge0NvbnRleHR9IHNlbGZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkNvbnRleHQucHJvdG90eXBlLnNsb3cgPSBmdW5jdGlvbihtcyl7XG4gIHRoaXMucnVubmFibGUoKS5zbG93KG1zKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEluc3BlY3QgdGhlIGNvbnRleHQgdm9pZCBvZiBgLl9ydW5uYWJsZWAuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQ29udGV4dC5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uKCl7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeSh0aGlzLCBmdW5jdGlvbihrZXksIHZhbCl7XG4gICAgaWYgKCdfcnVubmFibGUnID09IGtleSkgcmV0dXJuO1xuICAgIGlmICgndGVzdCcgPT0ga2V5KSByZXR1cm47XG4gICAgcmV0dXJuIHZhbDtcbiAgfSwgMik7XG59O1xuXG59KTsgLy8gbW9kdWxlOiBjb250ZXh0LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJob29rLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgUnVubmFibGUgPSByZXF1aXJlKCcuL3J1bm5hYmxlJyk7XG5cbi8qKlxuICogRXhwb3NlIGBIb29rYC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IEhvb2s7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgSG9va2Agd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYCBhbmQgY2FsbGJhY2sgYGZuYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdGl0bGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBIb29rKHRpdGxlLCBmbikge1xuICBSdW5uYWJsZS5jYWxsKHRoaXMsIHRpdGxlLCBmbik7XG4gIHRoaXMudHlwZSA9ICdob29rJztcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYFJ1bm5hYmxlLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IFJ1bm5hYmxlLnByb3RvdHlwZTtcbkhvb2sucHJvdG90eXBlID0gbmV3IEY7XG5Ib29rLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IEhvb2s7XG5cblxuLyoqXG4gKiBHZXQgb3Igc2V0IHRoZSB0ZXN0IGBlcnJgLlxuICpcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxuICogQHJldHVybiB7RXJyb3J9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkhvb2sucHJvdG90eXBlLmVycm9yID0gZnVuY3Rpb24oZXJyKXtcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkge1xuICAgIHZhciBlcnIgPSB0aGlzLl9lcnJvcjtcbiAgICB0aGlzLl9lcnJvciA9IG51bGw7XG4gICAgcmV0dXJuIGVycjtcbiAgfVxuXG4gIHRoaXMuX2Vycm9yID0gZXJyO1xufTtcblxufSk7IC8vIG1vZHVsZTogaG9vay5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiaW50ZXJmYWNlcy9iZGQuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBTdWl0ZSA9IHJlcXVpcmUoJy4uL3N1aXRlJylcbiAgLCBUZXN0ID0gcmVxdWlyZSgnLi4vdGVzdCcpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4vKipcbiAqIEJERC1zdHlsZSBpbnRlcmZhY2U6XG4gKlxuICogICAgICBkZXNjcmliZSgnQXJyYXknLCBmdW5jdGlvbigpe1xuICogICAgICAgIGRlc2NyaWJlKCcjaW5kZXhPZigpJywgZnVuY3Rpb24oKXtcbiAqICAgICAgICAgIGl0KCdzaG91bGQgcmV0dXJuIC0xIHdoZW4gbm90IHByZXNlbnQnLCBmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgIH0pO1xuICpcbiAqICAgICAgICAgIGl0KCdzaG91bGQgcmV0dXJuIHRoZSBpbmRleCB3aGVuIHByZXNlbnQnLCBmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgIH0pO1xuICogICAgICAgIH0pO1xuICogICAgICB9KTtcbiAqXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzdWl0ZSl7XG4gIHZhciBzdWl0ZXMgPSBbc3VpdGVdO1xuXG4gIHN1aXRlLm9uKCdwcmUtcmVxdWlyZScsIGZ1bmN0aW9uKGNvbnRleHQsIGZpbGUsIG1vY2hhKXtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYmVmb3JlIHJ1bm5pbmcgdGVzdHMuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmJlZm9yZSA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5iZWZvcmVBbGwobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGFmdGVyIHJ1bm5pbmcgdGVzdHMuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmFmdGVyID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmFmdGVyQWxsKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBiZWZvcmUgZWFjaCB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmJlZm9yZUVhY2ggPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYmVmb3JlRWFjaChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYWZ0ZXIgZWFjaCB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmFmdGVyRWFjaCA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5hZnRlckVhY2gobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZSBhIFwic3VpdGVcIiB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgXG4gICAgICogYW5kIGNhbGxiYWNrIGBmbmAgY29udGFpbmluZyBuZXN0ZWQgc3VpdGVzXG4gICAgICogYW5kL29yIHRlc3RzLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5kZXNjcmliZSA9IGNvbnRleHQuY29udGV4dCA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gICAgICB2YXIgc3VpdGUgPSBTdWl0ZS5jcmVhdGUoc3VpdGVzWzBdLCB0aXRsZSk7XG4gICAgICBzdWl0ZS5maWxlID0gZmlsZTtcbiAgICAgIHN1aXRlcy51bnNoaWZ0KHN1aXRlKTtcbiAgICAgIGZuLmNhbGwoc3VpdGUpO1xuICAgICAgc3VpdGVzLnNoaWZ0KCk7XG4gICAgICByZXR1cm4gc3VpdGU7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFBlbmRpbmcgZGVzY3JpYmUuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnhkZXNjcmliZSA9XG4gICAgY29udGV4dC54Y29udGV4dCA9XG4gICAgY29udGV4dC5kZXNjcmliZS5za2lwID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IFN1aXRlLmNyZWF0ZShzdWl0ZXNbMF0sIHRpdGxlKTtcbiAgICAgIHN1aXRlLnBlbmRpbmcgPSB0cnVlO1xuICAgICAgc3VpdGVzLnVuc2hpZnQoc3VpdGUpO1xuICAgICAgZm4uY2FsbChzdWl0ZSk7XG4gICAgICBzdWl0ZXMuc2hpZnQoKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhjbHVzaXZlIHN1aXRlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5kZXNjcmliZS5vbmx5ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IGNvbnRleHQuZGVzY3JpYmUodGl0bGUsIGZuKTtcbiAgICAgIG1vY2hhLmdyZXAoc3VpdGUuZnVsbFRpdGxlKCkpO1xuICAgICAgcmV0dXJuIHN1aXRlO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZSBhIHNwZWNpZmljYXRpb24gb3IgdGVzdC1jYXNlXG4gICAgICogd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYCBhbmQgY2FsbGJhY2sgYGZuYFxuICAgICAqIGFjdGluZyBhcyBhIHRodW5rLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5pdCA9IGNvbnRleHQuc3BlY2lmeSA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gICAgICB2YXIgc3VpdGUgPSBzdWl0ZXNbMF07XG4gICAgICBpZiAoc3VpdGUucGVuZGluZykgdmFyIGZuID0gbnVsbDtcbiAgICAgIHZhciB0ZXN0ID0gbmV3IFRlc3QodGl0bGUsIGZuKTtcbiAgICAgIHRlc3QuZmlsZSA9IGZpbGU7XG4gICAgICBzdWl0ZS5hZGRUZXN0KHRlc3QpO1xuICAgICAgcmV0dXJuIHRlc3Q7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4Y2x1c2l2ZSB0ZXN0LWNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0Lml0Lm9ubHkgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHRlc3QgPSBjb250ZXh0Lml0KHRpdGxlLCBmbik7XG4gICAgICB2YXIgcmVTdHJpbmcgPSAnXicgKyB1dGlscy5lc2NhcGVSZWdleHAodGVzdC5mdWxsVGl0bGUoKSkgKyAnJCc7XG4gICAgICBtb2NoYS5ncmVwKG5ldyBSZWdFeHAocmVTdHJpbmcpKTtcbiAgICAgIHJldHVybiB0ZXN0O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBQZW5kaW5nIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQueGl0ID1cbiAgICBjb250ZXh0LnhzcGVjaWZ5ID1cbiAgICBjb250ZXh0Lml0LnNraXAgPSBmdW5jdGlvbih0aXRsZSl7XG4gICAgICBjb250ZXh0Lml0KHRpdGxlKTtcbiAgICB9O1xuICB9KTtcbn07XG5cbn0pOyAvLyBtb2R1bGU6IGludGVyZmFjZXMvYmRkLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJpbnRlcmZhY2VzL2V4cG9ydHMuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBTdWl0ZSA9IHJlcXVpcmUoJy4uL3N1aXRlJylcbiAgLCBUZXN0ID0gcmVxdWlyZSgnLi4vdGVzdCcpO1xuXG4vKipcbiAqIFRERC1zdHlsZSBpbnRlcmZhY2U6XG4gKlxuICogICAgIGV4cG9ydHMuQXJyYXkgPSB7XG4gKiAgICAgICAnI2luZGV4T2YoKSc6IHtcbiAqICAgICAgICAgJ3Nob3VsZCByZXR1cm4gLTEgd2hlbiB0aGUgdmFsdWUgaXMgbm90IHByZXNlbnQnOiBmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgfSxcbiAqXG4gKiAgICAgICAgICdzaG91bGQgcmV0dXJuIHRoZSBjb3JyZWN0IGluZGV4IHdoZW4gdGhlIHZhbHVlIGlzIHByZXNlbnQnOiBmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgfVxuICogICAgICAgfVxuICogICAgIH07XG4gKlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oc3VpdGUpe1xuICB2YXIgc3VpdGVzID0gW3N1aXRlXTtcblxuICBzdWl0ZS5vbigncmVxdWlyZScsIHZpc2l0KTtcblxuICBmdW5jdGlvbiB2aXNpdChvYmosIGZpbGUpIHtcbiAgICB2YXIgc3VpdGU7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIG9ialtrZXldKSB7XG4gICAgICAgIHZhciBmbiA9IG9ialtrZXldO1xuICAgICAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgICAgIGNhc2UgJ2JlZm9yZSc6XG4gICAgICAgICAgICBzdWl0ZXNbMF0uYmVmb3JlQWxsKGZuKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2FmdGVyJzpcbiAgICAgICAgICAgIHN1aXRlc1swXS5hZnRlckFsbChmbik7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdiZWZvcmVFYWNoJzpcbiAgICAgICAgICAgIHN1aXRlc1swXS5iZWZvcmVFYWNoKGZuKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2FmdGVyRWFjaCc6XG4gICAgICAgICAgICBzdWl0ZXNbMF0uYWZ0ZXJFYWNoKGZuKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB2YXIgdGVzdCA9IG5ldyBUZXN0KGtleSwgZm4pO1xuICAgICAgICAgICAgdGVzdC5maWxlID0gZmlsZTtcbiAgICAgICAgICAgIHN1aXRlc1swXS5hZGRUZXN0KHRlc3QpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgc3VpdGUgPSBTdWl0ZS5jcmVhdGUoc3VpdGVzWzBdLCBrZXkpO1xuICAgICAgICBzdWl0ZXMudW5zaGlmdChzdWl0ZSk7XG4gICAgICAgIHZpc2l0KG9ialtrZXldKTtcbiAgICAgICAgc3VpdGVzLnNoaWZ0KCk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG59KTsgLy8gbW9kdWxlOiBpbnRlcmZhY2VzL2V4cG9ydHMuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImludGVyZmFjZXMvaW5kZXguanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuZXhwb3J0cy5iZGQgPSByZXF1aXJlKCcuL2JkZCcpO1xuZXhwb3J0cy50ZGQgPSByZXF1aXJlKCcuL3RkZCcpO1xuZXhwb3J0cy5xdW5pdCA9IHJlcXVpcmUoJy4vcXVuaXQnKTtcbmV4cG9ydHMuZXhwb3J0cyA9IHJlcXVpcmUoJy4vZXhwb3J0cycpO1xuXG59KTsgLy8gbW9kdWxlOiBpbnRlcmZhY2VzL2luZGV4LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJpbnRlcmZhY2VzL3F1bml0LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgU3VpdGUgPSByZXF1aXJlKCcuLi9zdWl0ZScpXG4gICwgVGVzdCA9IHJlcXVpcmUoJy4uL3Rlc3QnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcblxuLyoqXG4gKiBRVW5pdC1zdHlsZSBpbnRlcmZhY2U6XG4gKlxuICogICAgIHN1aXRlKCdBcnJheScpO1xuICpcbiAqICAgICB0ZXN0KCcjbGVuZ3RoJywgZnVuY3Rpb24oKXtcbiAqICAgICAgIHZhciBhcnIgPSBbMSwyLDNdO1xuICogICAgICAgb2soYXJyLmxlbmd0aCA9PSAzKTtcbiAqICAgICB9KTtcbiAqXG4gKiAgICAgdGVzdCgnI2luZGV4T2YoKScsIGZ1bmN0aW9uKCl7XG4gKiAgICAgICB2YXIgYXJyID0gWzEsMiwzXTtcbiAqICAgICAgIG9rKGFyci5pbmRleE9mKDEpID09IDApO1xuICogICAgICAgb2soYXJyLmluZGV4T2YoMikgPT0gMSk7XG4gKiAgICAgICBvayhhcnIuaW5kZXhPZigzKSA9PSAyKTtcbiAqICAgICB9KTtcbiAqXG4gKiAgICAgc3VpdGUoJ1N0cmluZycpO1xuICpcbiAqICAgICB0ZXN0KCcjbGVuZ3RoJywgZnVuY3Rpb24oKXtcbiAqICAgICAgIG9rKCdmb28nLmxlbmd0aCA9PSAzKTtcbiAqICAgICB9KTtcbiAqXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzdWl0ZSl7XG4gIHZhciBzdWl0ZXMgPSBbc3VpdGVdO1xuXG4gIHN1aXRlLm9uKCdwcmUtcmVxdWlyZScsIGZ1bmN0aW9uKGNvbnRleHQsIGZpbGUsIG1vY2hhKXtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYmVmb3JlIHJ1bm5pbmcgdGVzdHMuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmJlZm9yZSA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5iZWZvcmVBbGwobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGFmdGVyIHJ1bm5pbmcgdGVzdHMuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmFmdGVyID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmFmdGVyQWxsKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBiZWZvcmUgZWFjaCB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmJlZm9yZUVhY2ggPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYmVmb3JlRWFjaChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYWZ0ZXIgZWFjaCB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmFmdGVyRWFjaCA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5hZnRlckVhY2gobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZSBhIFwic3VpdGVcIiB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zdWl0ZSA9IGZ1bmN0aW9uKHRpdGxlKXtcbiAgICAgIGlmIChzdWl0ZXMubGVuZ3RoID4gMSkgc3VpdGVzLnNoaWZ0KCk7XG4gICAgICB2YXIgc3VpdGUgPSBTdWl0ZS5jcmVhdGUoc3VpdGVzWzBdLCB0aXRsZSk7XG4gICAgICBzdWl0ZS5maWxlID0gZmlsZTtcbiAgICAgIHN1aXRlcy51bnNoaWZ0KHN1aXRlKTtcbiAgICAgIHJldHVybiBzdWl0ZTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhjbHVzaXZlIHRlc3QtY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuc3VpdGUub25seSA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gICAgICB2YXIgc3VpdGUgPSBjb250ZXh0LnN1aXRlKHRpdGxlLCBmbik7XG4gICAgICBtb2NoYS5ncmVwKHN1aXRlLmZ1bGxUaXRsZSgpKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRGVzY3JpYmUgYSBzcGVjaWZpY2F0aW9uIG9yIHRlc3QtY2FzZVxuICAgICAqIHdpdGggdGhlIGdpdmVuIGB0aXRsZWAgYW5kIGNhbGxiYWNrIGBmbmBcbiAgICAgKiBhY3RpbmcgYXMgYSB0aHVuay5cbiAgICAgKi9cblxuICAgIGNvbnRleHQudGVzdCA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gICAgICB2YXIgdGVzdCA9IG5ldyBUZXN0KHRpdGxlLCBmbik7XG4gICAgICB0ZXN0LmZpbGUgPSBmaWxlO1xuICAgICAgc3VpdGVzWzBdLmFkZFRlc3QodGVzdCk7XG4gICAgICByZXR1cm4gdGVzdDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhjbHVzaXZlIHRlc3QtY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQudGVzdC5vbmx5ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciB0ZXN0ID0gY29udGV4dC50ZXN0KHRpdGxlLCBmbik7XG4gICAgICB2YXIgcmVTdHJpbmcgPSAnXicgKyB1dGlscy5lc2NhcGVSZWdleHAodGVzdC5mdWxsVGl0bGUoKSkgKyAnJCc7XG4gICAgICBtb2NoYS5ncmVwKG5ldyBSZWdFeHAocmVTdHJpbmcpKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUGVuZGluZyB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnRlc3Quc2tpcCA9IGZ1bmN0aW9uKHRpdGxlKXtcbiAgICAgIGNvbnRleHQudGVzdCh0aXRsZSk7XG4gICAgfTtcbiAgfSk7XG59O1xuXG59KTsgLy8gbW9kdWxlOiBpbnRlcmZhY2VzL3F1bml0LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJpbnRlcmZhY2VzL3RkZC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIFN1aXRlID0gcmVxdWlyZSgnLi4vc3VpdGUnKVxuICAsIFRlc3QgPSByZXF1aXJlKCcuLi90ZXN0JylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7O1xuXG4vKipcbiAqIFRERC1zdHlsZSBpbnRlcmZhY2U6XG4gKlxuICogICAgICBzdWl0ZSgnQXJyYXknLCBmdW5jdGlvbigpe1xuICogICAgICAgIHN1aXRlKCcjaW5kZXhPZigpJywgZnVuY3Rpb24oKXtcbiAqICAgICAgICAgIHN1aXRlU2V0dXAoZnVuY3Rpb24oKXtcbiAqXG4gKiAgICAgICAgICB9KTtcbiAqXG4gKiAgICAgICAgICB0ZXN0KCdzaG91bGQgcmV0dXJuIC0xIHdoZW4gbm90IHByZXNlbnQnLCBmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgIH0pO1xuICpcbiAqICAgICAgICAgIHRlc3QoJ3Nob3VsZCByZXR1cm4gdGhlIGluZGV4IHdoZW4gcHJlc2VudCcsIGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICAgfSk7XG4gKlxuICogICAgICAgICAgc3VpdGVUZWFyZG93bihmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgIH0pO1xuICogICAgICAgIH0pO1xuICogICAgICB9KTtcbiAqXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzdWl0ZSl7XG4gIHZhciBzdWl0ZXMgPSBbc3VpdGVdO1xuXG4gIHN1aXRlLm9uKCdwcmUtcmVxdWlyZScsIGZ1bmN0aW9uKGNvbnRleHQsIGZpbGUsIG1vY2hhKXtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYmVmb3JlIGVhY2ggdGVzdCBjYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zZXR1cCA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5iZWZvcmVFYWNoKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBhZnRlciBlYWNoIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQudGVhcmRvd24gPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYWZ0ZXJFYWNoKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBiZWZvcmUgdGhlIHN1aXRlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zdWl0ZVNldHVwID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmJlZm9yZUFsbChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYWZ0ZXIgdGhlIHN1aXRlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zdWl0ZVRlYXJkb3duID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmFmdGVyQWxsKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRGVzY3JpYmUgYSBcInN1aXRlXCIgd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYFxuICAgICAqIGFuZCBjYWxsYmFjayBgZm5gIGNvbnRhaW5pbmcgbmVzdGVkIHN1aXRlc1xuICAgICAqIGFuZC9vciB0ZXN0cy5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuc3VpdGUgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHN1aXRlID0gU3VpdGUuY3JlYXRlKHN1aXRlc1swXSwgdGl0bGUpO1xuICAgICAgc3VpdGUuZmlsZSA9IGZpbGU7XG4gICAgICBzdWl0ZXMudW5zaGlmdChzdWl0ZSk7XG4gICAgICBmbi5jYWxsKHN1aXRlKTtcbiAgICAgIHN1aXRlcy5zaGlmdCgpO1xuICAgICAgcmV0dXJuIHN1aXRlO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBQZW5kaW5nIHN1aXRlLlxuICAgICAqL1xuICAgIGNvbnRleHQuc3VpdGUuc2tpcCA9IGZ1bmN0aW9uKHRpdGxlLCBmbikge1xuICAgICAgdmFyIHN1aXRlID0gU3VpdGUuY3JlYXRlKHN1aXRlc1swXSwgdGl0bGUpO1xuICAgICAgc3VpdGUucGVuZGluZyA9IHRydWU7XG4gICAgICBzdWl0ZXMudW5zaGlmdChzdWl0ZSk7XG4gICAgICBmbi5jYWxsKHN1aXRlKTtcbiAgICAgIHN1aXRlcy5zaGlmdCgpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGNsdXNpdmUgdGVzdC1jYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zdWl0ZS5vbmx5ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IGNvbnRleHQuc3VpdGUodGl0bGUsIGZuKTtcbiAgICAgIG1vY2hhLmdyZXAoc3VpdGUuZnVsbFRpdGxlKCkpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZSBhIHNwZWNpZmljYXRpb24gb3IgdGVzdC1jYXNlXG4gICAgICogd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYCBhbmQgY2FsbGJhY2sgYGZuYFxuICAgICAqIGFjdGluZyBhcyBhIHRodW5rLlxuICAgICAqL1xuXG4gICAgY29udGV4dC50ZXN0ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IHN1aXRlc1swXTtcbiAgICAgIGlmIChzdWl0ZS5wZW5kaW5nKSB2YXIgZm4gPSBudWxsO1xuICAgICAgdmFyIHRlc3QgPSBuZXcgVGVzdCh0aXRsZSwgZm4pO1xuICAgICAgdGVzdC5maWxlID0gZmlsZTtcbiAgICAgIHN1aXRlLmFkZFRlc3QodGVzdCk7XG4gICAgICByZXR1cm4gdGVzdDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhjbHVzaXZlIHRlc3QtY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQudGVzdC5vbmx5ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciB0ZXN0ID0gY29udGV4dC50ZXN0KHRpdGxlLCBmbik7XG4gICAgICB2YXIgcmVTdHJpbmcgPSAnXicgKyB1dGlscy5lc2NhcGVSZWdleHAodGVzdC5mdWxsVGl0bGUoKSkgKyAnJCc7XG4gICAgICBtb2NoYS5ncmVwKG5ldyBSZWdFeHAocmVTdHJpbmcpKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUGVuZGluZyB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnRlc3Quc2tpcCA9IGZ1bmN0aW9uKHRpdGxlKXtcbiAgICAgIGNvbnRleHQudGVzdCh0aXRsZSk7XG4gICAgfTtcbiAgfSk7XG59O1xuXG59KTsgLy8gbW9kdWxlOiBpbnRlcmZhY2VzL3RkZC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwibW9jaGEuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qIVxuICogbW9jaGFcbiAqIENvcHlyaWdodChjKSAyMDExIFRKIEhvbG93YXljaHVrIDx0akB2aXNpb24tbWVkaWEuY2E+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIHBhdGggPSByZXF1aXJlKCdicm93c2VyL3BhdGgnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG4vKipcbiAqIEV4cG9zZSBgTW9jaGFgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IE1vY2hhO1xuXG4vKipcbiAqIFRvIHJlcXVpcmUgbG9jYWwgVUlzIGFuZCByZXBvcnRlcnMgd2hlbiBydW5uaW5nIGluIG5vZGUuXG4gKi9cblxuaWYgKHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgcHJvY2Vzcy5jd2QgPT09ICdmdW5jdGlvbicpIHtcbiAgdmFyIGpvaW4gPSBwYXRoLmpvaW5cbiAgICAsIGN3ZCA9IHByb2Nlc3MuY3dkKCk7XG4gIG1vZHVsZS5wYXRocy5wdXNoKGN3ZCwgam9pbihjd2QsICdub2RlX21vZHVsZXMnKSk7XG59XG5cbi8qKlxuICogRXhwb3NlIGludGVybmFscy5cbiAqL1xuXG5leHBvcnRzLnV0aWxzID0gdXRpbHM7XG5leHBvcnRzLmludGVyZmFjZXMgPSByZXF1aXJlKCcuL2ludGVyZmFjZXMnKTtcbmV4cG9ydHMucmVwb3J0ZXJzID0gcmVxdWlyZSgnLi9yZXBvcnRlcnMnKTtcbmV4cG9ydHMuUnVubmFibGUgPSByZXF1aXJlKCcuL3J1bm5hYmxlJyk7XG5leHBvcnRzLkNvbnRleHQgPSByZXF1aXJlKCcuL2NvbnRleHQnKTtcbmV4cG9ydHMuUnVubmVyID0gcmVxdWlyZSgnLi9ydW5uZXInKTtcbmV4cG9ydHMuU3VpdGUgPSByZXF1aXJlKCcuL3N1aXRlJyk7XG5leHBvcnRzLkhvb2sgPSByZXF1aXJlKCcuL2hvb2snKTtcbmV4cG9ydHMuVGVzdCA9IHJlcXVpcmUoJy4vdGVzdCcpO1xuXG4vKipcbiAqIFJldHVybiBpbWFnZSBgbmFtZWAgcGF0aC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaW1hZ2UobmFtZSkge1xuICByZXR1cm4gX19kaXJuYW1lICsgJy8uLi9pbWFnZXMvJyArIG5hbWUgKyAnLnBuZyc7XG59XG5cbi8qKlxuICogU2V0dXAgbW9jaGEgd2l0aCBgb3B0aW9uc2AuXG4gKlxuICogT3B0aW9uczpcbiAqXG4gKiAgIC0gYHVpYCBuYW1lIFwiYmRkXCIsIFwidGRkXCIsIFwiZXhwb3J0c1wiIGV0Y1xuICogICAtIGByZXBvcnRlcmAgcmVwb3J0ZXIgaW5zdGFuY2UsIGRlZmF1bHRzIHRvIGBtb2NoYS5yZXBvcnRlcnMuc3BlY2BcbiAqICAgLSBgZ2xvYmFsc2AgYXJyYXkgb2YgYWNjZXB0ZWQgZ2xvYmFsc1xuICogICAtIGB0aW1lb3V0YCB0aW1lb3V0IGluIG1pbGxpc2Vjb25kc1xuICogICAtIGBiYWlsYCBiYWlsIG9uIHRoZSBmaXJzdCB0ZXN0IGZhaWx1cmVcbiAqICAgLSBgc2xvd2AgbWlsbGlzZWNvbmRzIHRvIHdhaXQgYmVmb3JlIGNvbnNpZGVyaW5nIGEgdGVzdCBzbG93XG4gKiAgIC0gYGlnbm9yZUxlYWtzYCBpZ25vcmUgZ2xvYmFsIGxlYWtzXG4gKiAgIC0gYGdyZXBgIHN0cmluZyBvciByZWdleHAgdG8gZmlsdGVyIHRlc3RzIHdpdGhcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBNb2NoYShvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICB0aGlzLmZpbGVzID0gW107XG4gIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gIHRoaXMuZ3JlcChvcHRpb25zLmdyZXApO1xuICB0aGlzLnN1aXRlID0gbmV3IGV4cG9ydHMuU3VpdGUoJycsIG5ldyBleHBvcnRzLkNvbnRleHQpO1xuICB0aGlzLnVpKG9wdGlvbnMudWkpO1xuICB0aGlzLmJhaWwob3B0aW9ucy5iYWlsKTtcbiAgdGhpcy5yZXBvcnRlcihvcHRpb25zLnJlcG9ydGVyKTtcbiAgaWYgKG51bGwgIT0gb3B0aW9ucy50aW1lb3V0KSB0aGlzLnRpbWVvdXQob3B0aW9ucy50aW1lb3V0KTtcbiAgdGhpcy51c2VDb2xvcnMob3B0aW9ucy51c2VDb2xvcnMpXG4gIGlmIChvcHRpb25zLmVuYWJsZVRpbWVvdXRzICE9PSBudWxsKSB0aGlzLmVuYWJsZVRpbWVvdXRzKG9wdGlvbnMuZW5hYmxlVGltZW91dHMpO1xuICBpZiAob3B0aW9ucy5zbG93KSB0aGlzLnNsb3cob3B0aW9ucy5zbG93KTtcblxuICB0aGlzLnN1aXRlLm9uKCdwcmUtcmVxdWlyZScsIGZ1bmN0aW9uIChjb250ZXh0KSB7XG4gICAgZXhwb3J0cy5hZnRlckVhY2ggPSBjb250ZXh0LmFmdGVyRWFjaCB8fCBjb250ZXh0LnRlYXJkb3duO1xuICAgIGV4cG9ydHMuYWZ0ZXIgPSBjb250ZXh0LmFmdGVyIHx8IGNvbnRleHQuc3VpdGVUZWFyZG93bjtcbiAgICBleHBvcnRzLmJlZm9yZUVhY2ggPSBjb250ZXh0LmJlZm9yZUVhY2ggfHwgY29udGV4dC5zZXR1cDtcbiAgICBleHBvcnRzLmJlZm9yZSA9IGNvbnRleHQuYmVmb3JlIHx8IGNvbnRleHQuc3VpdGVTZXR1cDtcbiAgICBleHBvcnRzLmRlc2NyaWJlID0gY29udGV4dC5kZXNjcmliZSB8fCBjb250ZXh0LnN1aXRlO1xuICAgIGV4cG9ydHMuaXQgPSBjb250ZXh0Lml0IHx8IGNvbnRleHQudGVzdDtcbiAgICBleHBvcnRzLnNldHVwID0gY29udGV4dC5zZXR1cCB8fCBjb250ZXh0LmJlZm9yZUVhY2g7XG4gICAgZXhwb3J0cy5zdWl0ZVNldHVwID0gY29udGV4dC5zdWl0ZVNldHVwIHx8IGNvbnRleHQuYmVmb3JlO1xuICAgIGV4cG9ydHMuc3VpdGVUZWFyZG93biA9IGNvbnRleHQuc3VpdGVUZWFyZG93biB8fCBjb250ZXh0LmFmdGVyO1xuICAgIGV4cG9ydHMuc3VpdGUgPSBjb250ZXh0LnN1aXRlIHx8IGNvbnRleHQuZGVzY3JpYmU7XG4gICAgZXhwb3J0cy50ZWFyZG93biA9IGNvbnRleHQudGVhcmRvd24gfHwgY29udGV4dC5hZnRlckVhY2g7XG4gICAgZXhwb3J0cy50ZXN0ID0gY29udGV4dC50ZXN0IHx8IGNvbnRleHQuaXQ7XG4gIH0pO1xufVxuXG4vKipcbiAqIEVuYWJsZSBvciBkaXNhYmxlIGJhaWxpbmcgb24gdGhlIGZpcnN0IGZhaWx1cmUuXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBbYmFpbF1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmJhaWwgPSBmdW5jdGlvbihiYWlsKXtcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkgYmFpbCA9IHRydWU7XG4gIHRoaXMuc3VpdGUuYmFpbChiYWlsKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEFkZCB0ZXN0IGBmaWxlYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuYWRkRmlsZSA9IGZ1bmN0aW9uKGZpbGUpe1xuICB0aGlzLmZpbGVzLnB1c2goZmlsZSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgcmVwb3J0ZXIgdG8gYHJlcG9ydGVyYCwgZGVmYXVsdHMgdG8gXCJzcGVjXCIuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8RnVuY3Rpb259IHJlcG9ydGVyIG5hbWUgb3IgY29uc3RydWN0b3JcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLnJlcG9ydGVyID0gZnVuY3Rpb24ocmVwb3J0ZXIpe1xuICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2YgcmVwb3J0ZXIpIHtcbiAgICB0aGlzLl9yZXBvcnRlciA9IHJlcG9ydGVyO1xuICB9IGVsc2Uge1xuICAgIHJlcG9ydGVyID0gcmVwb3J0ZXIgfHwgJ3NwZWMnO1xuICAgIHZhciBfcmVwb3J0ZXI7XG4gICAgdHJ5IHsgX3JlcG9ydGVyID0gcmVxdWlyZSgnLi9yZXBvcnRlcnMvJyArIHJlcG9ydGVyKTsgfSBjYXRjaCAoZXJyKSB7fTtcbiAgICBpZiAoIV9yZXBvcnRlcikgdHJ5IHsgX3JlcG9ydGVyID0gcmVxdWlyZShyZXBvcnRlcik7IH0gY2F0Y2ggKGVycikge307XG4gICAgaWYgKCFfcmVwb3J0ZXIgJiYgcmVwb3J0ZXIgPT09ICd0ZWFtY2l0eScpXG4gICAgICBjb25zb2xlLndhcm4oJ1RoZSBUZWFtY2l0eSByZXBvcnRlciB3YXMgbW92ZWQgdG8gYSBwYWNrYWdlIG5hbWVkICcgK1xuICAgICAgICAnbW9jaGEtdGVhbWNpdHktcmVwb3J0ZXIgJyArXG4gICAgICAgICcoaHR0cHM6Ly9ucG1qcy5vcmcvcGFja2FnZS9tb2NoYS10ZWFtY2l0eS1yZXBvcnRlcikuJyk7XG4gICAgaWYgKCFfcmVwb3J0ZXIpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCByZXBvcnRlciBcIicgKyByZXBvcnRlciArICdcIicpO1xuICAgIHRoaXMuX3JlcG9ydGVyID0gX3JlcG9ydGVyO1xuICB9XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGVzdCBVSSBgbmFtZWAsIGRlZmF1bHRzIHRvIFwiYmRkXCIuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGJkZFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUudWkgPSBmdW5jdGlvbihuYW1lKXtcbiAgbmFtZSA9IG5hbWUgfHwgJ2JkZCc7XG4gIHRoaXMuX3VpID0gZXhwb3J0cy5pbnRlcmZhY2VzW25hbWVdO1xuICBpZiAoIXRoaXMuX3VpKSB0cnkgeyB0aGlzLl91aSA9IHJlcXVpcmUobmFtZSk7IH0gY2F0Y2ggKGVycikge307XG4gIGlmICghdGhpcy5fdWkpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBpbnRlcmZhY2UgXCInICsgbmFtZSArICdcIicpO1xuICB0aGlzLl91aSA9IHRoaXMuX3VpKHRoaXMuc3VpdGUpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogTG9hZCByZWdpc3RlcmVkIGZpbGVzLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk1vY2hhLnByb3RvdHlwZS5sb2FkRmlsZXMgPSBmdW5jdGlvbihmbil7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIHN1aXRlID0gdGhpcy5zdWl0ZTtcbiAgdmFyIHBlbmRpbmcgPSB0aGlzLmZpbGVzLmxlbmd0aDtcbiAgdGhpcy5maWxlcy5mb3JFYWNoKGZ1bmN0aW9uKGZpbGUpe1xuICAgIGZpbGUgPSBwYXRoLnJlc29sdmUoZmlsZSk7XG4gICAgc3VpdGUuZW1pdCgncHJlLXJlcXVpcmUnLCBnbG9iYWwsIGZpbGUsIHNlbGYpO1xuICAgIHN1aXRlLmVtaXQoJ3JlcXVpcmUnLCByZXF1aXJlKGZpbGUpLCBmaWxlLCBzZWxmKTtcbiAgICBzdWl0ZS5lbWl0KCdwb3N0LXJlcXVpcmUnLCBnbG9iYWwsIGZpbGUsIHNlbGYpO1xuICAgIC0tcGVuZGluZyB8fCAoZm4gJiYgZm4oKSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBFbmFibGUgZ3Jvd2wgc3VwcG9ydC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuX2dyb3dsID0gZnVuY3Rpb24ocnVubmVyLCByZXBvcnRlcikge1xuICB2YXIgbm90aWZ5ID0gcmVxdWlyZSgnZ3Jvd2wnKTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgdmFyIHN0YXRzID0gcmVwb3J0ZXIuc3RhdHM7XG4gICAgaWYgKHN0YXRzLmZhaWx1cmVzKSB7XG4gICAgICB2YXIgbXNnID0gc3RhdHMuZmFpbHVyZXMgKyAnIG9mICcgKyBydW5uZXIudG90YWwgKyAnIHRlc3RzIGZhaWxlZCc7XG4gICAgICBub3RpZnkobXNnLCB7IG5hbWU6ICdtb2NoYScsIHRpdGxlOiAnRmFpbGVkJywgaW1hZ2U6IGltYWdlKCdlcnJvcicpIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBub3RpZnkoc3RhdHMucGFzc2VzICsgJyB0ZXN0cyBwYXNzZWQgaW4gJyArIHN0YXRzLmR1cmF0aW9uICsgJ21zJywge1xuICAgICAgICAgIG5hbWU6ICdtb2NoYSdcbiAgICAgICAgLCB0aXRsZTogJ1Bhc3NlZCdcbiAgICAgICAgLCBpbWFnZTogaW1hZ2UoJ29rJylcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vKipcbiAqIEFkZCByZWdleHAgdG8gZ3JlcCwgaWYgYHJlYCBpcyBhIHN0cmluZyBpdCBpcyBlc2NhcGVkLlxuICpcbiAqIEBwYXJhbSB7UmVnRXhwfFN0cmluZ30gcmVcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuZ3JlcCA9IGZ1bmN0aW9uKHJlKXtcbiAgdGhpcy5vcHRpb25zLmdyZXAgPSAnc3RyaW5nJyA9PSB0eXBlb2YgcmVcbiAgICA/IG5ldyBSZWdFeHAodXRpbHMuZXNjYXBlUmVnZXhwKHJlKSlcbiAgICA6IHJlO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogSW52ZXJ0IGAuZ3JlcCgpYCBtYXRjaGVzLlxuICpcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuaW52ZXJ0ID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5vcHRpb25zLmludmVydCA9IHRydWU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBJZ25vcmUgZ2xvYmFsIGxlYWtzLlxuICpcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gaWdub3JlXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmlnbm9yZUxlYWtzID0gZnVuY3Rpb24oaWdub3JlKXtcbiAgdGhpcy5vcHRpb25zLmlnbm9yZUxlYWtzID0gISFpZ25vcmU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBFbmFibGUgZ2xvYmFsIGxlYWsgY2hlY2tpbmcuXG4gKlxuICogQHJldHVybiB7TW9jaGF9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS5jaGVja0xlYWtzID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5vcHRpb25zLmlnbm9yZUxlYWtzID0gZmFsc2U7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBFbmFibGUgZ3Jvd2wgc3VwcG9ydC5cbiAqXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmdyb3dsID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5vcHRpb25zLmdyb3dsID0gdHJ1ZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIElnbm9yZSBgZ2xvYmFsc2AgYXJyYXkgb3Igc3RyaW5nLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl8U3RyaW5nfSBnbG9iYWxzXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmdsb2JhbHMgPSBmdW5jdGlvbihnbG9iYWxzKXtcbiAgdGhpcy5vcHRpb25zLmdsb2JhbHMgPSAodGhpcy5vcHRpb25zLmdsb2JhbHMgfHwgW10pLmNvbmNhdChnbG9iYWxzKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEVtaXQgY29sb3Igb3V0cHV0LlxuICpcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gY29sb3JzXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLnVzZUNvbG9ycyA9IGZ1bmN0aW9uKGNvbG9ycyl7XG4gIHRoaXMub3B0aW9ucy51c2VDb2xvcnMgPSBhcmd1bWVudHMubGVuZ3RoICYmIGNvbG9ycyAhPSB1bmRlZmluZWRcbiAgICA/IGNvbG9yc1xuICAgIDogdHJ1ZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFVzZSBpbmxpbmUgZGlmZnMgcmF0aGVyIHRoYW4gKy8tLlxuICpcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gaW5saW5lRGlmZnNcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUudXNlSW5saW5lRGlmZnMgPSBmdW5jdGlvbihpbmxpbmVEaWZmcykge1xuICB0aGlzLm9wdGlvbnMudXNlSW5saW5lRGlmZnMgPSBhcmd1bWVudHMubGVuZ3RoICYmIGlubGluZURpZmZzICE9IHVuZGVmaW5lZFxuICA/IGlubGluZURpZmZzXG4gIDogZmFsc2U7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIHRpbWVvdXQgaW4gbWlsbGlzZWNvbmRzLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lb3V0XG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLnRpbWVvdXQgPSBmdW5jdGlvbih0aW1lb3V0KXtcbiAgdGhpcy5zdWl0ZS50aW1lb3V0KHRpbWVvdXQpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IHNsb3duZXNzIHRocmVzaG9sZCBpbiBtaWxsaXNlY29uZHMuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IHNsb3dcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuc2xvdyA9IGZ1bmN0aW9uKHNsb3cpe1xuICB0aGlzLnN1aXRlLnNsb3coc2xvdyk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBFbmFibGUgdGltZW91dHMuXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVkXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmVuYWJsZVRpbWVvdXRzID0gZnVuY3Rpb24oZW5hYmxlZCkge1xuICB0aGlzLnN1aXRlLmVuYWJsZVRpbWVvdXRzKGFyZ3VtZW50cy5sZW5ndGggJiYgZW5hYmxlZCAhPT0gdW5kZWZpbmVkXG4gICAgPyBlbmFibGVkXG4gICAgOiB0cnVlKTtcbiAgcmV0dXJuIHRoaXNcbn07XG5cbi8qKlxuICogTWFrZXMgYWxsIHRlc3RzIGFzeW5jIChhY2NlcHRpbmcgYSBjYWxsYmFjaylcbiAqXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmFzeW5jT25seSA9IGZ1bmN0aW9uKCl7XG4gIHRoaXMub3B0aW9ucy5hc3luY09ubHkgPSB0cnVlO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUnVuIHRlc3RzIGFuZCBpbnZva2UgYGZuKClgIHdoZW4gY29tcGxldGUuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1J1bm5lcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uKGZuKXtcbiAgaWYgKHRoaXMuZmlsZXMubGVuZ3RoKSB0aGlzLmxvYWRGaWxlcygpO1xuICB2YXIgc3VpdGUgPSB0aGlzLnN1aXRlO1xuICB2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcbiAgb3B0aW9ucy5maWxlcyA9IHRoaXMuZmlsZXM7XG4gIHZhciBydW5uZXIgPSBuZXcgZXhwb3J0cy5SdW5uZXIoc3VpdGUpO1xuICB2YXIgcmVwb3J0ZXIgPSBuZXcgdGhpcy5fcmVwb3J0ZXIocnVubmVyLCBvcHRpb25zKTtcbiAgcnVubmVyLmlnbm9yZUxlYWtzID0gZmFsc2UgIT09IG9wdGlvbnMuaWdub3JlTGVha3M7XG4gIHJ1bm5lci5hc3luY09ubHkgPSBvcHRpb25zLmFzeW5jT25seTtcbiAgaWYgKG9wdGlvbnMuZ3JlcCkgcnVubmVyLmdyZXAob3B0aW9ucy5ncmVwLCBvcHRpb25zLmludmVydCk7XG4gIGlmIChvcHRpb25zLmdsb2JhbHMpIHJ1bm5lci5nbG9iYWxzKG9wdGlvbnMuZ2xvYmFscyk7XG4gIGlmIChvcHRpb25zLmdyb3dsKSB0aGlzLl9ncm93bChydW5uZXIsIHJlcG9ydGVyKTtcbiAgZXhwb3J0cy5yZXBvcnRlcnMuQmFzZS51c2VDb2xvcnMgPSBvcHRpb25zLnVzZUNvbG9ycztcbiAgZXhwb3J0cy5yZXBvcnRlcnMuQmFzZS5pbmxpbmVEaWZmcyA9IG9wdGlvbnMudXNlSW5saW5lRGlmZnM7XG4gIHJldHVybiBydW5uZXIucnVuKGZuKTtcbn07XG5cbn0pOyAvLyBtb2R1bGU6IG1vY2hhLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJtcy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyoqXG4gKiBIZWxwZXJzLlxuICovXG5cbnZhciBzID0gMTAwMDtcbnZhciBtID0gcyAqIDYwO1xudmFyIGggPSBtICogNjA7XG52YXIgZCA9IGggKiAyNDtcbnZhciB5ID0gZCAqIDM2NS4yNTtcblxuLyoqXG4gKiBQYXJzZSBvciBmb3JtYXQgdGhlIGdpdmVuIGB2YWxgLlxuICpcbiAqIE9wdGlvbnM6XG4gKlxuICogIC0gYGxvbmdgIHZlcmJvc2UgZm9ybWF0dGluZyBbZmFsc2VdXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSB2YWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtTdHJpbmd8TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHZhbCwgb3B0aW9ucyl7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIHZhbCkgcmV0dXJuIHBhcnNlKHZhbCk7XG4gIHJldHVybiBvcHRpb25zLmxvbmcgPyBsb25nRm9ybWF0KHZhbCkgOiBzaG9ydEZvcm1hdCh2YWwpO1xufTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gYHN0cmAgYW5kIHJldHVybiBtaWxsaXNlY29uZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyc2Uoc3RyKSB7XG4gIHZhciBtYXRjaCA9IC9eKCg/OlxcZCspP1xcLj9cXGQrKSAqKG1zfHNlY29uZHM/fHN8bWludXRlcz98bXxob3Vycz98aHxkYXlzP3xkfHllYXJzP3x5KT8kL2kuZXhlYyhzdHIpO1xuICBpZiAoIW1hdGNoKSByZXR1cm47XG4gIHZhciBuID0gcGFyc2VGbG9hdChtYXRjaFsxXSk7XG4gIHZhciB0eXBlID0gKG1hdGNoWzJdIHx8ICdtcycpLnRvTG93ZXJDYXNlKCk7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ3llYXJzJzpcbiAgICBjYXNlICd5ZWFyJzpcbiAgICBjYXNlICd5JzpcbiAgICAgIHJldHVybiBuICogeTtcbiAgICBjYXNlICdkYXlzJzpcbiAgICBjYXNlICdkYXknOlxuICAgIGNhc2UgJ2QnOlxuICAgICAgcmV0dXJuIG4gKiBkO1xuICAgIGNhc2UgJ2hvdXJzJzpcbiAgICBjYXNlICdob3VyJzpcbiAgICBjYXNlICdoJzpcbiAgICAgIHJldHVybiBuICogaDtcbiAgICBjYXNlICdtaW51dGVzJzpcbiAgICBjYXNlICdtaW51dGUnOlxuICAgIGNhc2UgJ20nOlxuICAgICAgcmV0dXJuIG4gKiBtO1xuICAgIGNhc2UgJ3NlY29uZHMnOlxuICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgY2FzZSAncyc6XG4gICAgICByZXR1cm4gbiAqIHM7XG4gICAgY2FzZSAnbXMnOlxuICAgICAgcmV0dXJuIG47XG4gIH1cbn1cblxuLyoqXG4gKiBTaG9ydCBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzaG9ydEZvcm1hdChtcykge1xuICBpZiAobXMgPj0gZCkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBkKSArICdkJztcbiAgaWYgKG1zID49IGgpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gaCkgKyAnaCc7XG4gIGlmIChtcyA+PSBtKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIG0pICsgJ20nO1xuICBpZiAobXMgPj0gcykgcmV0dXJuIE1hdGgucm91bmQobXMgLyBzKSArICdzJztcbiAgcmV0dXJuIG1zICsgJ21zJztcbn1cblxuLyoqXG4gKiBMb25nIGZvcm1hdCBmb3IgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvbmdGb3JtYXQobXMpIHtcbiAgcmV0dXJuIHBsdXJhbChtcywgZCwgJ2RheScpXG4gICAgfHwgcGx1cmFsKG1zLCBoLCAnaG91cicpXG4gICAgfHwgcGx1cmFsKG1zLCBtLCAnbWludXRlJylcbiAgICB8fCBwbHVyYWwobXMsIHMsICdzZWNvbmQnKVxuICAgIHx8IG1zICsgJyBtcyc7XG59XG5cbi8qKlxuICogUGx1cmFsaXphdGlvbiBoZWxwZXIuXG4gKi9cblxuZnVuY3Rpb24gcGx1cmFsKG1zLCBuLCBuYW1lKSB7XG4gIGlmIChtcyA8IG4pIHJldHVybjtcbiAgaWYgKG1zIDwgbiAqIDEuNSkgcmV0dXJuIE1hdGguZmxvb3IobXMgLyBuKSArICcgJyArIG5hbWU7XG4gIHJldHVybiBNYXRoLmNlaWwobXMgLyBuKSArICcgJyArIG5hbWUgKyAncyc7XG59XG5cbn0pOyAvLyBtb2R1bGU6IG1zLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvYmFzZS5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIHR0eSA9IHJlcXVpcmUoJ2Jyb3dzZXIvdHR5JylcbiAgLCBkaWZmID0gcmVxdWlyZSgnYnJvd3Nlci9kaWZmJylcbiAgLCBtcyA9IHJlcXVpcmUoJy4uL21zJylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbi8qKlxuICogU2F2ZSB0aW1lciByZWZlcmVuY2VzIHRvIGF2b2lkIFNpbm9uIGludGVyZmVyaW5nIChzZWUgR0gtMjM3KS5cbiAqL1xuXG52YXIgRGF0ZSA9IGdsb2JhbC5EYXRlXG4gICwgc2V0VGltZW91dCA9IGdsb2JhbC5zZXRUaW1lb3V0XG4gICwgc2V0SW50ZXJ2YWwgPSBnbG9iYWwuc2V0SW50ZXJ2YWxcbiAgLCBjbGVhclRpbWVvdXQgPSBnbG9iYWwuY2xlYXJUaW1lb3V0XG4gICwgY2xlYXJJbnRlcnZhbCA9IGdsb2JhbC5jbGVhckludGVydmFsO1xuXG4vKipcbiAqIENoZWNrIGlmIGJvdGggc3RkaW8gc3RyZWFtcyBhcmUgYXNzb2NpYXRlZCB3aXRoIGEgdHR5LlxuICovXG5cbnZhciBpc2F0dHkgPSB0dHkuaXNhdHR5KDEpICYmIHR0eS5pc2F0dHkoMik7XG5cbi8qKlxuICogRXhwb3NlIGBCYXNlYC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBCYXNlO1xuXG4vKipcbiAqIEVuYWJsZSBjb2xvcmluZyBieSBkZWZhdWx0LlxuICovXG5cbmV4cG9ydHMudXNlQ29sb3JzID0gaXNhdHR5IHx8IChwcm9jZXNzLmVudi5NT0NIQV9DT0xPUlMgIT09IHVuZGVmaW5lZCk7XG5cbi8qKlxuICogSW5saW5lIGRpZmZzIGluc3RlYWQgb2YgKy8tXG4gKi9cblxuZXhwb3J0cy5pbmxpbmVEaWZmcyA9IGZhbHNlO1xuXG4vKipcbiAqIERlZmF1bHQgY29sb3IgbWFwLlxuICovXG5cbmV4cG9ydHMuY29sb3JzID0ge1xuICAgICdwYXNzJzogOTBcbiAgLCAnZmFpbCc6IDMxXG4gICwgJ2JyaWdodCBwYXNzJzogOTJcbiAgLCAnYnJpZ2h0IGZhaWwnOiA5MVxuICAsICdicmlnaHQgeWVsbG93JzogOTNcbiAgLCAncGVuZGluZyc6IDM2XG4gICwgJ3N1aXRlJzogMFxuICAsICdlcnJvciB0aXRsZSc6IDBcbiAgLCAnZXJyb3IgbWVzc2FnZSc6IDMxXG4gICwgJ2Vycm9yIHN0YWNrJzogOTBcbiAgLCAnY2hlY2ttYXJrJzogMzJcbiAgLCAnZmFzdCc6IDkwXG4gICwgJ21lZGl1bSc6IDMzXG4gICwgJ3Nsb3cnOiAzMVxuICAsICdncmVlbic6IDMyXG4gICwgJ2xpZ2h0JzogOTBcbiAgLCAnZGlmZiBndXR0ZXInOiA5MFxuICAsICdkaWZmIGFkZGVkJzogNDJcbiAgLCAnZGlmZiByZW1vdmVkJzogNDFcbn07XG5cbi8qKlxuICogRGVmYXVsdCBzeW1ib2wgbWFwLlxuICovXG5cbmV4cG9ydHMuc3ltYm9scyA9IHtcbiAgb2s6ICfinJMnLFxuICBlcnI6ICfinJYnLFxuICBkb3Q6ICfigKQnXG59O1xuXG4vLyBXaXRoIG5vZGUuanMgb24gV2luZG93czogdXNlIHN5bWJvbHMgYXZhaWxhYmxlIGluIHRlcm1pbmFsIGRlZmF1bHQgZm9udHNcbmlmICgnd2luMzInID09IHByb2Nlc3MucGxhdGZvcm0pIHtcbiAgZXhwb3J0cy5zeW1ib2xzLm9rID0gJ1xcdTIyMUEnO1xuICBleHBvcnRzLnN5bWJvbHMuZXJyID0gJ1xcdTAwRDcnO1xuICBleHBvcnRzLnN5bWJvbHMuZG90ID0gJy4nO1xufVxuXG4vKipcbiAqIENvbG9yIGBzdHJgIHdpdGggdGhlIGdpdmVuIGB0eXBlYCxcbiAqIGFsbG93aW5nIGNvbG9ycyB0byBiZSBkaXNhYmxlZCxcbiAqIGFzIHdlbGwgYXMgdXNlci1kZWZpbmVkIGNvbG9yXG4gKiBzY2hlbWVzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG52YXIgY29sb3IgPSBleHBvcnRzLmNvbG9yID0gZnVuY3Rpb24odHlwZSwgc3RyKSB7XG4gIGlmICghZXhwb3J0cy51c2VDb2xvcnMpIHJldHVybiBzdHI7XG4gIHJldHVybiAnXFx1MDAxYlsnICsgZXhwb3J0cy5jb2xvcnNbdHlwZV0gKyAnbScgKyBzdHIgKyAnXFx1MDAxYlswbSc7XG59O1xuXG4vKipcbiAqIEV4cG9zZSB0ZXJtIHdpbmRvdyBzaXplLCB3aXRoIHNvbWVcbiAqIGRlZmF1bHRzIGZvciB3aGVuIHN0ZGVyciBpcyBub3QgYSB0dHkuXG4gKi9cblxuZXhwb3J0cy53aW5kb3cgPSB7XG4gIHdpZHRoOiBpc2F0dHlcbiAgICA/IHByb2Nlc3Muc3Rkb3V0LmdldFdpbmRvd1NpemVcbiAgICAgID8gcHJvY2Vzcy5zdGRvdXQuZ2V0V2luZG93U2l6ZSgxKVswXVxuICAgICAgOiB0dHkuZ2V0V2luZG93U2l6ZSgpWzFdXG4gICAgOiA3NVxufTtcblxuLyoqXG4gKiBFeHBvc2Ugc29tZSBiYXNpYyBjdXJzb3IgaW50ZXJhY3Rpb25zXG4gKiB0aGF0IGFyZSBjb21tb24gYW1vbmcgcmVwb3J0ZXJzLlxuICovXG5cbmV4cG9ydHMuY3Vyc29yID0ge1xuICBoaWRlOiBmdW5jdGlvbigpe1xuICAgIGlzYXR0eSAmJiBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFx1MDAxYls/MjVsJyk7XG4gIH0sXG5cbiAgc2hvdzogZnVuY3Rpb24oKXtcbiAgICBpc2F0dHkgJiYgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1xcdTAwMWJbPzI1aCcpO1xuICB9LFxuXG4gIGRlbGV0ZUxpbmU6IGZ1bmN0aW9uKCl7XG4gICAgaXNhdHR5ICYmIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHUwMDFiWzJLJyk7XG4gIH0sXG5cbiAgYmVnaW5uaW5nT2ZMaW5lOiBmdW5jdGlvbigpe1xuICAgIGlzYXR0eSAmJiBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFx1MDAxYlswRycpO1xuICB9LFxuXG4gIENSOiBmdW5jdGlvbigpe1xuICAgIGlmIChpc2F0dHkpIHtcbiAgICAgIGV4cG9ydHMuY3Vyc29yLmRlbGV0ZUxpbmUoKTtcbiAgICAgIGV4cG9ydHMuY3Vyc29yLmJlZ2lubmluZ09mTGluZSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFxyJyk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIE91dHV0IHRoZSBnaXZlbiBgZmFpbHVyZXNgIGFzIGEgbGlzdC5cbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBmYWlsdXJlc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLmxpc3QgPSBmdW5jdGlvbihmYWlsdXJlcyl7XG4gIGNvbnNvbGUuZXJyb3IoKTtcbiAgZmFpbHVyZXMuZm9yRWFjaChmdW5jdGlvbih0ZXN0LCBpKXtcbiAgICAvLyBmb3JtYXRcbiAgICB2YXIgZm10ID0gY29sb3IoJ2Vycm9yIHRpdGxlJywgJyAgJXMpICVzOlxcbicpXG4gICAgICArIGNvbG9yKCdlcnJvciBtZXNzYWdlJywgJyAgICAgJXMnKVxuICAgICAgKyBjb2xvcignZXJyb3Igc3RhY2snLCAnXFxuJXNcXG4nKTtcblxuICAgIC8vIG1zZ1xuICAgIHZhciBlcnIgPSB0ZXN0LmVyclxuICAgICAgLCBtZXNzYWdlID0gZXJyLm1lc3NhZ2UgfHwgJydcbiAgICAgICwgc3RhY2sgPSBlcnIuc3RhY2sgfHwgbWVzc2FnZVxuICAgICAgLCBpbmRleCA9IHN0YWNrLmluZGV4T2YobWVzc2FnZSkgKyBtZXNzYWdlLmxlbmd0aFxuICAgICAgLCBtc2cgPSBzdGFjay5zbGljZSgwLCBpbmRleClcbiAgICAgICwgYWN0dWFsID0gZXJyLmFjdHVhbFxuICAgICAgLCBleHBlY3RlZCA9IGVyci5leHBlY3RlZFxuICAgICAgLCBlc2NhcGUgPSB0cnVlO1xuXG4gICAgLy8gdW5jYXVnaHRcbiAgICBpZiAoZXJyLnVuY2F1Z2h0KSB7XG4gICAgICBtc2cgPSAnVW5jYXVnaHQgJyArIG1zZztcbiAgICB9XG5cbiAgICAvLyBleHBsaWNpdGx5IHNob3cgZGlmZlxuICAgIGlmIChlcnIuc2hvd0RpZmYgJiYgc2FtZVR5cGUoYWN0dWFsLCBleHBlY3RlZCkpIHtcbiAgICAgIGVzY2FwZSA9IGZhbHNlO1xuICAgICAgZXJyLmFjdHVhbCA9IGFjdHVhbCA9IHV0aWxzLnN0cmluZ2lmeShhY3R1YWwpO1xuICAgICAgZXJyLmV4cGVjdGVkID0gZXhwZWN0ZWQgPSB1dGlscy5zdHJpbmdpZnkoZXhwZWN0ZWQpO1xuICAgIH1cblxuICAgIC8vIGFjdHVhbCAvIGV4cGVjdGVkIGRpZmZcbiAgICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIGFjdHVhbCAmJiAnc3RyaW5nJyA9PSB0eXBlb2YgZXhwZWN0ZWQpIHtcbiAgICAgIGZtdCA9IGNvbG9yKCdlcnJvciB0aXRsZScsICcgICVzKSAlczpcXG4lcycpICsgY29sb3IoJ2Vycm9yIHN0YWNrJywgJ1xcbiVzXFxuJyk7XG4gICAgICB2YXIgbWF0Y2ggPSBtZXNzYWdlLm1hdGNoKC9eKFteOl0rKTogZXhwZWN0ZWQvKTtcbiAgICAgIG1zZyA9ICdcXG4gICAgICAnICsgY29sb3IoJ2Vycm9yIG1lc3NhZ2UnLCBtYXRjaCA/IG1hdGNoWzFdIDogbXNnKTtcblxuICAgICAgaWYgKGV4cG9ydHMuaW5saW5lRGlmZnMpIHtcbiAgICAgICAgbXNnICs9IGlubGluZURpZmYoZXJyLCBlc2NhcGUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbXNnICs9IHVuaWZpZWREaWZmKGVyciwgZXNjYXBlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpbmRlbnQgc3RhY2sgdHJhY2Ugd2l0aG91dCBtc2dcbiAgICBzdGFjayA9IHN0YWNrLnNsaWNlKGluZGV4ID8gaW5kZXggKyAxIDogaW5kZXgpXG4gICAgICAucmVwbGFjZSgvXi9nbSwgJyAgJyk7XG5cbiAgICBjb25zb2xlLmVycm9yKGZtdCwgKGkgKyAxKSwgdGVzdC5mdWxsVGl0bGUoKSwgbXNnLCBzdGFjayk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBCYXNlYCByZXBvcnRlci5cbiAqXG4gKiBBbGwgb3RoZXIgcmVwb3J0ZXJzIGdlbmVyYWxseVxuICogaW5oZXJpdCBmcm9tIHRoaXMgcmVwb3J0ZXIsIHByb3ZpZGluZ1xuICogc3RhdHMgc3VjaCBhcyB0ZXN0IGR1cmF0aW9uLCBudW1iZXJcbiAqIG9mIHRlc3RzIHBhc3NlZCAvIGZhaWxlZCBldGMuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBCYXNlKHJ1bm5lcikge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0cyA9IHsgc3VpdGVzOiAwLCB0ZXN0czogMCwgcGFzc2VzOiAwLCBwZW5kaW5nOiAwLCBmYWlsdXJlczogMCB9XG4gICAgLCBmYWlsdXJlcyA9IHRoaXMuZmFpbHVyZXMgPSBbXTtcblxuICBpZiAoIXJ1bm5lcikgcmV0dXJuO1xuICB0aGlzLnJ1bm5lciA9IHJ1bm5lcjtcblxuICBydW5uZXIuc3RhdHMgPSBzdGF0cztcblxuICBydW5uZXIub24oJ3N0YXJ0JywgZnVuY3Rpb24oKXtcbiAgICBzdGF0cy5zdGFydCA9IG5ldyBEYXRlO1xuICB9KTtcblxuICBydW5uZXIub24oJ3N1aXRlJywgZnVuY3Rpb24oc3VpdGUpe1xuICAgIHN0YXRzLnN1aXRlcyA9IHN0YXRzLnN1aXRlcyB8fCAwO1xuICAgIHN1aXRlLnJvb3QgfHwgc3RhdHMuc3VpdGVzKys7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigndGVzdCBlbmQnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBzdGF0cy50ZXN0cyA9IHN0YXRzLnRlc3RzIHx8IDA7XG4gICAgc3RhdHMudGVzdHMrKztcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgc3RhdHMucGFzc2VzID0gc3RhdHMucGFzc2VzIHx8IDA7XG5cbiAgICB2YXIgbWVkaXVtID0gdGVzdC5zbG93KCkgLyAyO1xuICAgIHRlc3Quc3BlZWQgPSB0ZXN0LmR1cmF0aW9uID4gdGVzdC5zbG93KClcbiAgICAgID8gJ3Nsb3cnXG4gICAgICA6IHRlc3QuZHVyYXRpb24gPiBtZWRpdW1cbiAgICAgICAgPyAnbWVkaXVtJ1xuICAgICAgICA6ICdmYXN0JztcblxuICAgIHN0YXRzLnBhc3NlcysrO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIHN0YXRzLmZhaWx1cmVzID0gc3RhdHMuZmFpbHVyZXMgfHwgMDtcbiAgICBzdGF0cy5mYWlsdXJlcysrO1xuICAgIHRlc3QuZXJyID0gZXJyO1xuICAgIGZhaWx1cmVzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICBzdGF0cy5lbmQgPSBuZXcgRGF0ZTtcbiAgICBzdGF0cy5kdXJhdGlvbiA9IG5ldyBEYXRlIC0gc3RhdHMuc3RhcnQ7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGVuZGluZycsIGZ1bmN0aW9uKCl7XG4gICAgc3RhdHMucGVuZGluZysrO1xuICB9KTtcbn1cblxuLyoqXG4gKiBPdXRwdXQgY29tbW9uIGVwaWxvZ3VlIHVzZWQgYnkgbWFueSBvZlxuICogdGhlIGJ1bmRsZWQgcmVwb3J0ZXJzLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuQmFzZS5wcm90b3R5cGUuZXBpbG9ndWUgPSBmdW5jdGlvbigpe1xuICB2YXIgc3RhdHMgPSB0aGlzLnN0YXRzO1xuICB2YXIgdGVzdHM7XG4gIHZhciBmbXQ7XG5cbiAgY29uc29sZS5sb2coKTtcblxuICAvLyBwYXNzZXNcbiAgZm10ID0gY29sb3IoJ2JyaWdodCBwYXNzJywgJyAnKVxuICAgICsgY29sb3IoJ2dyZWVuJywgJyAlZCBwYXNzaW5nJylcbiAgICArIGNvbG9yKCdsaWdodCcsICcgKCVzKScpO1xuXG4gIGNvbnNvbGUubG9nKGZtdCxcbiAgICBzdGF0cy5wYXNzZXMgfHwgMCxcbiAgICBtcyhzdGF0cy5kdXJhdGlvbikpO1xuXG4gIC8vIHBlbmRpbmdcbiAgaWYgKHN0YXRzLnBlbmRpbmcpIHtcbiAgICBmbXQgPSBjb2xvcigncGVuZGluZycsICcgJylcbiAgICAgICsgY29sb3IoJ3BlbmRpbmcnLCAnICVkIHBlbmRpbmcnKTtcblxuICAgIGNvbnNvbGUubG9nKGZtdCwgc3RhdHMucGVuZGluZyk7XG4gIH1cblxuICAvLyBmYWlsdXJlc1xuICBpZiAoc3RhdHMuZmFpbHVyZXMpIHtcbiAgICBmbXQgPSBjb2xvcignZmFpbCcsICcgICVkIGZhaWxpbmcnKTtcblxuICAgIGNvbnNvbGUuZXJyb3IoZm10LFxuICAgICAgc3RhdHMuZmFpbHVyZXMpO1xuXG4gICAgQmFzZS5saXN0KHRoaXMuZmFpbHVyZXMpO1xuICAgIGNvbnNvbGUuZXJyb3IoKTtcbiAgfVxuXG4gIGNvbnNvbGUubG9nKCk7XG59O1xuXG4vKipcbiAqIFBhZCB0aGUgZ2l2ZW4gYHN0cmAgdG8gYGxlbmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHBhcmFtIHtTdHJpbmd9IGxlblxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFkKHN0ciwgbGVuKSB7XG4gIHN0ciA9IFN0cmluZyhzdHIpO1xuICByZXR1cm4gQXJyYXkobGVuIC0gc3RyLmxlbmd0aCArIDEpLmpvaW4oJyAnKSArIHN0cjtcbn1cblxuXG4vKipcbiAqIFJldHVybnMgYW4gaW5saW5lIGRpZmYgYmV0d2VlbiAyIHN0cmluZ3Mgd2l0aCBjb2xvdXJlZCBBTlNJIG91dHB1dFxuICpcbiAqIEBwYXJhbSB7RXJyb3J9IEVycm9yIHdpdGggYWN0dWFsL2V4cGVjdGVkXG4gKiBAcmV0dXJuIHtTdHJpbmd9IERpZmZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGlubGluZURpZmYoZXJyLCBlc2NhcGUpIHtcbiAgdmFyIG1zZyA9IGVycm9yRGlmZihlcnIsICdXb3Jkc1dpdGhTcGFjZScsIGVzY2FwZSk7XG5cbiAgLy8gbGluZW5vc1xuICB2YXIgbGluZXMgPSBtc2cuc3BsaXQoJ1xcbicpO1xuICBpZiAobGluZXMubGVuZ3RoID4gNCkge1xuICAgIHZhciB3aWR0aCA9IFN0cmluZyhsaW5lcy5sZW5ndGgpLmxlbmd0aDtcbiAgICBtc2cgPSBsaW5lcy5tYXAoZnVuY3Rpb24oc3RyLCBpKXtcbiAgICAgIHJldHVybiBwYWQoKytpLCB3aWR0aCkgKyAnIHwnICsgJyAnICsgc3RyO1xuICAgIH0pLmpvaW4oJ1xcbicpO1xuICB9XG5cbiAgLy8gbGVnZW5kXG4gIG1zZyA9ICdcXG4nXG4gICAgKyBjb2xvcignZGlmZiByZW1vdmVkJywgJ2FjdHVhbCcpXG4gICAgKyAnICdcbiAgICArIGNvbG9yKCdkaWZmIGFkZGVkJywgJ2V4cGVjdGVkJylcbiAgICArICdcXG5cXG4nXG4gICAgKyBtc2dcbiAgICArICdcXG4nO1xuXG4gIC8vIGluZGVudFxuICBtc2cgPSBtc2cucmVwbGFjZSgvXi9nbSwgJyAgICAgICcpO1xuICByZXR1cm4gbXNnO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSB1bmlmaWVkIGRpZmYgYmV0d2VlbiAyIHN0cmluZ3NcbiAqXG4gKiBAcGFyYW0ge0Vycm9yfSBFcnJvciB3aXRoIGFjdHVhbC9leHBlY3RlZFxuICogQHJldHVybiB7U3RyaW5nfSBEaWZmXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiB1bmlmaWVkRGlmZihlcnIsIGVzY2FwZSkge1xuICB2YXIgaW5kZW50ID0gJyAgICAgICc7XG4gIGZ1bmN0aW9uIGNsZWFuVXAobGluZSkge1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgIGxpbmUgPSBlc2NhcGVJbnZpc2libGVzKGxpbmUpO1xuICAgIH1cbiAgICBpZiAobGluZVswXSA9PT0gJysnKSByZXR1cm4gaW5kZW50ICsgY29sb3JMaW5lcygnZGlmZiBhZGRlZCcsIGxpbmUpO1xuICAgIGlmIChsaW5lWzBdID09PSAnLScpIHJldHVybiBpbmRlbnQgKyBjb2xvckxpbmVzKCdkaWZmIHJlbW92ZWQnLCBsaW5lKTtcbiAgICBpZiAobGluZS5tYXRjaCgvXFxAXFxALykpIHJldHVybiBudWxsO1xuICAgIGlmIChsaW5lLm1hdGNoKC9cXFxcIE5vIG5ld2xpbmUvKSkgcmV0dXJuIG51bGw7XG4gICAgZWxzZSByZXR1cm4gaW5kZW50ICsgbGluZTtcbiAgfVxuICBmdW5jdGlvbiBub3RCbGFuayhsaW5lKSB7XG4gICAgcmV0dXJuIGxpbmUgIT0gbnVsbDtcbiAgfVxuICBtc2cgPSBkaWZmLmNyZWF0ZVBhdGNoKCdzdHJpbmcnLCBlcnIuYWN0dWFsLCBlcnIuZXhwZWN0ZWQpO1xuICB2YXIgbGluZXMgPSBtc2cuc3BsaXQoJ1xcbicpLnNwbGljZSg0KTtcbiAgcmV0dXJuICdcXG4gICAgICAnXG4gICAgICAgICArIGNvbG9yTGluZXMoJ2RpZmYgYWRkZWQnLCAgICcrIGV4cGVjdGVkJykgKyAnICdcbiAgICAgICAgICsgY29sb3JMaW5lcygnZGlmZiByZW1vdmVkJywgJy0gYWN0dWFsJylcbiAgICAgICAgICsgJ1xcblxcbidcbiAgICAgICAgICsgbGluZXMubWFwKGNsZWFuVXApLmZpbHRlcihub3RCbGFuaykuam9pbignXFxuJyk7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgY2hhcmFjdGVyIGRpZmYgZm9yIGBlcnJgLlxuICpcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gZXJyb3JEaWZmKGVyciwgdHlwZSwgZXNjYXBlKSB7XG4gIHZhciBhY3R1YWwgICA9IGVzY2FwZSA/IGVzY2FwZUludmlzaWJsZXMoZXJyLmFjdHVhbCkgICA6IGVyci5hY3R1YWw7XG4gIHZhciBleHBlY3RlZCA9IGVzY2FwZSA/IGVzY2FwZUludmlzaWJsZXMoZXJyLmV4cGVjdGVkKSA6IGVyci5leHBlY3RlZDtcbiAgcmV0dXJuIGRpZmZbJ2RpZmYnICsgdHlwZV0oYWN0dWFsLCBleHBlY3RlZCkubWFwKGZ1bmN0aW9uKHN0cil7XG4gICAgaWYgKHN0ci5hZGRlZCkgcmV0dXJuIGNvbG9yTGluZXMoJ2RpZmYgYWRkZWQnLCBzdHIudmFsdWUpO1xuICAgIGlmIChzdHIucmVtb3ZlZCkgcmV0dXJuIGNvbG9yTGluZXMoJ2RpZmYgcmVtb3ZlZCcsIHN0ci52YWx1ZSk7XG4gICAgcmV0dXJuIHN0ci52YWx1ZTtcbiAgfSkuam9pbignJyk7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyB3aXRoIGFsbCBpbnZpc2libGUgY2hhcmFjdGVycyBpbiBwbGFpbiB0ZXh0XG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGxpbmVcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBlc2NhcGVJbnZpc2libGVzKGxpbmUpIHtcbiAgICByZXR1cm4gbGluZS5yZXBsYWNlKC9cXHQvZywgJzx0YWI+JylcbiAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXHIvZywgJzxDUj4nKVxuICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcbi9nLCAnPExGPlxcbicpO1xufVxuXG4vKipcbiAqIENvbG9yIGxpbmVzIGZvciBgc3RyYCwgdXNpbmcgdGhlIGNvbG9yIGBuYW1lYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gY29sb3JMaW5lcyhuYW1lLCBzdHIpIHtcbiAgcmV0dXJuIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKHN0cil7XG4gICAgcmV0dXJuIGNvbG9yKG5hbWUsIHN0cik7XG4gIH0pLmpvaW4oJ1xcbicpO1xufVxuXG4vKipcbiAqIENoZWNrIHRoYXQgYSAvIGIgaGF2ZSB0aGUgc2FtZSB0eXBlLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBhXG4gKiBAcGFyYW0ge09iamVjdH0gYlxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNhbWVUeXBlKGEsIGIpIHtcbiAgYSA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhKTtcbiAgYiA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChiKTtcbiAgcmV0dXJuIGEgPT0gYjtcbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2Jhc2UuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9kb2MuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbi8qKlxuICogRXhwb3NlIGBEb2NgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IERvYztcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBEb2NgIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gRG9jKHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgdG90YWwgPSBydW5uZXIudG90YWxcbiAgICAsIGluZGVudHMgPSAyO1xuXG4gIGZ1bmN0aW9uIGluZGVudCgpIHtcbiAgICByZXR1cm4gQXJyYXkoaW5kZW50cykuam9pbignICAnKTtcbiAgfVxuXG4gIHJ1bm5lci5vbignc3VpdGUnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgaWYgKHN1aXRlLnJvb3QpIHJldHVybjtcbiAgICArK2luZGVudHM7XG4gICAgY29uc29sZS5sb2coJyVzPHNlY3Rpb24gY2xhc3M9XCJzdWl0ZVwiPicsIGluZGVudCgpKTtcbiAgICArK2luZGVudHM7XG4gICAgY29uc29sZS5sb2coJyVzPGgxPiVzPC9oMT4nLCBpbmRlbnQoKSwgdXRpbHMuZXNjYXBlKHN1aXRlLnRpdGxlKSk7XG4gICAgY29uc29sZS5sb2coJyVzPGRsPicsIGluZGVudCgpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZSBlbmQnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgaWYgKHN1aXRlLnJvb3QpIHJldHVybjtcbiAgICBjb25zb2xlLmxvZygnJXM8L2RsPicsIGluZGVudCgpKTtcbiAgICAtLWluZGVudHM7XG4gICAgY29uc29sZS5sb2coJyVzPC9zZWN0aW9uPicsIGluZGVudCgpKTtcbiAgICAtLWluZGVudHM7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGNvbnNvbGUubG9nKCclcyAgPGR0PiVzPC9kdD4nLCBpbmRlbnQoKSwgdXRpbHMuZXNjYXBlKHRlc3QudGl0bGUpKTtcbiAgICB2YXIgY29kZSA9IHV0aWxzLmVzY2FwZSh1dGlscy5jbGVhbih0ZXN0LmZuLnRvU3RyaW5nKCkpKTtcbiAgICBjb25zb2xlLmxvZygnJXMgIDxkZD48cHJlPjxjb2RlPiVzPC9jb2RlPjwvcHJlPjwvZGQ+JywgaW5kZW50KCksIGNvZGUpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGNvbnNvbGUubG9nKCclcyAgPGR0IGNsYXNzPVwiZXJyb3JcIj4lczwvZHQ+JywgaW5kZW50KCksIHV0aWxzLmVzY2FwZSh0ZXN0LnRpdGxlKSk7XG4gICAgdmFyIGNvZGUgPSB1dGlscy5lc2NhcGUodXRpbHMuY2xlYW4odGVzdC5mbi50b1N0cmluZygpKSk7XG4gICAgY29uc29sZS5sb2coJyVzICA8ZGQgY2xhc3M9XCJlcnJvclwiPjxwcmU+PGNvZGU+JXM8L2NvZGU+PC9wcmU+PC9kZD4nLCBpbmRlbnQoKSwgY29kZSk7XG4gICAgY29uc29sZS5sb2coJyVzICA8ZGQgY2xhc3M9XCJlcnJvclwiPiVzPC9kZD4nLCBpbmRlbnQoKSwgdXRpbHMuZXNjYXBlKGVycikpO1xuICB9KTtcbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2RvYy5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL2RvdC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIGNvbG9yID0gQmFzZS5jb2xvcjtcblxuLyoqXG4gKiBFeHBvc2UgYERvdGAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gRG90O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYERvdGAgbWF0cml4IHRlc3QgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBEb3QocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCB3aWR0aCA9IEJhc2Uud2luZG93LndpZHRoICogLjc1IHwgMFxuICAgICwgbiA9IC0xO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXG4gICcpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBpZiAoKytuICUgd2lkdGggPT0gMCkgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1xcbiAgJyk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29sb3IoJ3BlbmRpbmcnLCBCYXNlLnN5bWJvbHMuZG90KSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGlmICgrK24gJSB3aWR0aCA9PSAwKSBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFxuICAnKTtcbiAgICBpZiAoJ3Nsb3cnID09IHRlc3Quc3BlZWQpIHtcbiAgICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbG9yKCdicmlnaHQgeWVsbG93JywgQmFzZS5zeW1ib2xzLmRvdCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb2xvcih0ZXN0LnNwZWVkLCBCYXNlLnN5bWJvbHMuZG90KSk7XG4gICAgfVxuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGlmICgrK24gJSB3aWR0aCA9PSAwKSBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFxuICAnKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb2xvcignZmFpbCcsIEJhc2Uuc3ltYm9scy5kb3QpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIGNvbnNvbGUubG9nKCk7XG4gICAgc2VsZi5lcGlsb2d1ZSgpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEJhc2UucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gQmFzZS5wcm90b3R5cGU7XG5Eb3QucHJvdG90eXBlID0gbmV3IEY7XG5Eb3QucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gRG90O1xuXG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9kb3QuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9odG1sLWNvdi5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEpTT05Db3YgPSByZXF1aXJlKCcuL2pzb24tY292JylcbiAgLCBmcyA9IHJlcXVpcmUoJ2Jyb3dzZXIvZnMnKTtcblxuLyoqXG4gKiBFeHBvc2UgYEhUTUxDb3ZgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEhUTUxDb3Y7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgSnNDb3ZlcmFnZWAgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBIVE1MQ292KHJ1bm5lcikge1xuICB2YXIgamFkZSA9IHJlcXVpcmUoJ2phZGUnKVxuICAgICwgZmlsZSA9IF9fZGlybmFtZSArICcvdGVtcGxhdGVzL2NvdmVyYWdlLmphZGUnXG4gICAgLCBzdHIgPSBmcy5yZWFkRmlsZVN5bmMoZmlsZSwgJ3V0ZjgnKVxuICAgICwgZm4gPSBqYWRlLmNvbXBpbGUoc3RyLCB7IGZpbGVuYW1lOiBmaWxlIH0pXG4gICAgLCBzZWxmID0gdGhpcztcblxuICBKU09OQ292LmNhbGwodGhpcywgcnVubmVyLCBmYWxzZSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGZuKHtcbiAgICAgICAgY292OiBzZWxmLmNvdlxuICAgICAgLCBjb3ZlcmFnZUNsYXNzOiBjb3ZlcmFnZUNsYXNzXG4gICAgfSkpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gY292ZXJhZ2UgY2xhc3MgZm9yIGBuYC5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBjb3ZlcmFnZUNsYXNzKG4pIHtcbiAgaWYgKG4gPj0gNzUpIHJldHVybiAnaGlnaCc7XG4gIGlmIChuID49IDUwKSByZXR1cm4gJ21lZGl1bSc7XG4gIGlmIChuID49IDI1KSByZXR1cm4gJ2xvdyc7XG4gIHJldHVybiAndGVycmlibGUnO1xufVxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2h0bWwtY292LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvaHRtbC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxuICAsIFByb2dyZXNzID0gcmVxdWlyZSgnLi4vYnJvd3Nlci9wcm9ncmVzcycpXG4gICwgZXNjYXBlID0gdXRpbHMuZXNjYXBlO1xuXG4vKipcbiAqIFNhdmUgdGltZXIgcmVmZXJlbmNlcyB0byBhdm9pZCBTaW5vbiBpbnRlcmZlcmluZyAoc2VlIEdILTIzNykuXG4gKi9cblxudmFyIERhdGUgPSBnbG9iYWwuRGF0ZVxuICAsIHNldFRpbWVvdXQgPSBnbG9iYWwuc2V0VGltZW91dFxuICAsIHNldEludGVydmFsID0gZ2xvYmFsLnNldEludGVydmFsXG4gICwgY2xlYXJUaW1lb3V0ID0gZ2xvYmFsLmNsZWFyVGltZW91dFxuICAsIGNsZWFySW50ZXJ2YWwgPSBnbG9iYWwuY2xlYXJJbnRlcnZhbDtcblxuLyoqXG4gKiBFeHBvc2UgYEhUTUxgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEhUTUw7XG5cbi8qKlxuICogU3RhdHMgdGVtcGxhdGUuXG4gKi9cblxudmFyIHN0YXRzVGVtcGxhdGUgPSAnPHVsIGlkPVwibW9jaGEtc3RhdHNcIj4nXG4gICsgJzxsaSBjbGFzcz1cInByb2dyZXNzXCI+PGNhbnZhcyB3aWR0aD1cIjQwXCIgaGVpZ2h0PVwiNDBcIj48L2NhbnZhcz48L2xpPidcbiAgKyAnPGxpIGNsYXNzPVwicGFzc2VzXCI+PGEgaHJlZj1cIiNcIj5wYXNzZXM6PC9hPiA8ZW0+MDwvZW0+PC9saT4nXG4gICsgJzxsaSBjbGFzcz1cImZhaWx1cmVzXCI+PGEgaHJlZj1cIiNcIj5mYWlsdXJlczo8L2E+IDxlbT4wPC9lbT48L2xpPidcbiAgKyAnPGxpIGNsYXNzPVwiZHVyYXRpb25cIj5kdXJhdGlvbjogPGVtPjA8L2VtPnM8L2xpPidcbiAgKyAnPC91bD4nO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYEhUTUxgIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gSFRNTChydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIHRvdGFsID0gcnVubmVyLnRvdGFsXG4gICAgLCBzdGF0ID0gZnJhZ21lbnQoc3RhdHNUZW1wbGF0ZSlcbiAgICAsIGl0ZW1zID0gc3RhdC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnbGknKVxuICAgICwgcGFzc2VzID0gaXRlbXNbMV0uZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2VtJylbMF1cbiAgICAsIHBhc3Nlc0xpbmsgPSBpdGVtc1sxXS5nZXRFbGVtZW50c0J5VGFnTmFtZSgnYScpWzBdXG4gICAgLCBmYWlsdXJlcyA9IGl0ZW1zWzJdLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdlbScpWzBdXG4gICAgLCBmYWlsdXJlc0xpbmsgPSBpdGVtc1syXS5nZXRFbGVtZW50c0J5VGFnTmFtZSgnYScpWzBdXG4gICAgLCBkdXJhdGlvbiA9IGl0ZW1zWzNdLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdlbScpWzBdXG4gICAgLCBjYW52YXMgPSBzdGF0LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdjYW52YXMnKVswXVxuICAgICwgcmVwb3J0ID0gZnJhZ21lbnQoJzx1bCBpZD1cIm1vY2hhLXJlcG9ydFwiPjwvdWw+JylcbiAgICAsIHN0YWNrID0gW3JlcG9ydF1cbiAgICAsIHByb2dyZXNzXG4gICAgLCBjdHhcbiAgICAsIHJvb3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbW9jaGEnKTtcblxuICBpZiAoY2FudmFzLmdldENvbnRleHQpIHtcbiAgICB2YXIgcmF0aW8gPSB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyB8fCAxO1xuICAgIGNhbnZhcy5zdHlsZS53aWR0aCA9IGNhbnZhcy53aWR0aDtcbiAgICBjYW52YXMuc3R5bGUuaGVpZ2h0ID0gY2FudmFzLmhlaWdodDtcbiAgICBjYW52YXMud2lkdGggKj0gcmF0aW87XG4gICAgY2FudmFzLmhlaWdodCAqPSByYXRpbztcbiAgICBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICBjdHguc2NhbGUocmF0aW8sIHJhdGlvKTtcbiAgICBwcm9ncmVzcyA9IG5ldyBQcm9ncmVzcztcbiAgfVxuXG4gIGlmICghcm9vdCkgcmV0dXJuIGVycm9yKCcjbW9jaGEgZGl2IG1pc3NpbmcsIGFkZCBpdCB0byB5b3VyIGRvY3VtZW50Jyk7XG5cbiAgLy8gcGFzcyB0b2dnbGVcbiAgb24ocGFzc2VzTGluaywgJ2NsaWNrJywgZnVuY3Rpb24oKXtcbiAgICB1bmhpZGUoKTtcbiAgICB2YXIgbmFtZSA9IC9wYXNzLy50ZXN0KHJlcG9ydC5jbGFzc05hbWUpID8gJycgOiAnIHBhc3MnO1xuICAgIHJlcG9ydC5jbGFzc05hbWUgPSByZXBvcnQuY2xhc3NOYW1lLnJlcGxhY2UoL2ZhaWx8cGFzcy9nLCAnJykgKyBuYW1lO1xuICAgIGlmIChyZXBvcnQuY2xhc3NOYW1lLnRyaW0oKSkgaGlkZVN1aXRlc1dpdGhvdXQoJ3Rlc3QgcGFzcycpO1xuICB9KTtcblxuICAvLyBmYWlsdXJlIHRvZ2dsZVxuICBvbihmYWlsdXJlc0xpbmssICdjbGljaycsIGZ1bmN0aW9uKCl7XG4gICAgdW5oaWRlKCk7XG4gICAgdmFyIG5hbWUgPSAvZmFpbC8udGVzdChyZXBvcnQuY2xhc3NOYW1lKSA/ICcnIDogJyBmYWlsJztcbiAgICByZXBvcnQuY2xhc3NOYW1lID0gcmVwb3J0LmNsYXNzTmFtZS5yZXBsYWNlKC9mYWlsfHBhc3MvZywgJycpICsgbmFtZTtcbiAgICBpZiAocmVwb3J0LmNsYXNzTmFtZS50cmltKCkpIGhpZGVTdWl0ZXNXaXRob3V0KCd0ZXN0IGZhaWwnKTtcbiAgfSk7XG5cbiAgcm9vdC5hcHBlbmRDaGlsZChzdGF0KTtcbiAgcm9vdC5hcHBlbmRDaGlsZChyZXBvcnQpO1xuXG4gIGlmIChwcm9ncmVzcykgcHJvZ3Jlc3Muc2l6ZSg0MCk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZScsIGZ1bmN0aW9uKHN1aXRlKXtcbiAgICBpZiAoc3VpdGUucm9vdCkgcmV0dXJuO1xuXG4gICAgLy8gc3VpdGVcbiAgICB2YXIgdXJsID0gc2VsZi5zdWl0ZVVSTChzdWl0ZSk7XG4gICAgdmFyIGVsID0gZnJhZ21lbnQoJzxsaSBjbGFzcz1cInN1aXRlXCI+PGgxPjxhIGhyZWY9XCIlc1wiPiVzPC9hPjwvaDE+PC9saT4nLCB1cmwsIGVzY2FwZShzdWl0ZS50aXRsZSkpO1xuXG4gICAgLy8gY29udGFpbmVyXG4gICAgc3RhY2tbMF0uYXBwZW5kQ2hpbGQoZWwpO1xuICAgIHN0YWNrLnVuc2hpZnQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndWwnKSk7XG4gICAgZWwuYXBwZW5kQ2hpbGQoc3RhY2tbMF0pO1xuICB9KTtcblxuICBydW5uZXIub24oJ3N1aXRlIGVuZCcsIGZ1bmN0aW9uKHN1aXRlKXtcbiAgICBpZiAoc3VpdGUucm9vdCkgcmV0dXJuO1xuICAgIHN0YWNrLnNoaWZ0KCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgaWYgKCdob29rJyA9PSB0ZXN0LnR5cGUpIHJ1bm5lci5lbWl0KCd0ZXN0IGVuZCcsIHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24odGVzdCl7XG4gICAgLy8gVE9ETzogYWRkIHRvIHN0YXRzXG4gICAgdmFyIHBlcmNlbnQgPSBzdGF0cy50ZXN0cyAvIHRoaXMudG90YWwgKiAxMDAgfCAwO1xuICAgIGlmIChwcm9ncmVzcykgcHJvZ3Jlc3MudXBkYXRlKHBlcmNlbnQpLmRyYXcoY3R4KTtcblxuICAgIC8vIHVwZGF0ZSBzdGF0c1xuICAgIHZhciBtcyA9IG5ldyBEYXRlIC0gc3RhdHMuc3RhcnQ7XG4gICAgdGV4dChwYXNzZXMsIHN0YXRzLnBhc3Nlcyk7XG4gICAgdGV4dChmYWlsdXJlcywgc3RhdHMuZmFpbHVyZXMpO1xuICAgIHRleHQoZHVyYXRpb24sIChtcyAvIDEwMDApLnRvRml4ZWQoMikpO1xuXG4gICAgLy8gdGVzdFxuICAgIGlmICgncGFzc2VkJyA9PSB0ZXN0LnN0YXRlKSB7XG4gICAgICB2YXIgdXJsID0gc2VsZi50ZXN0VVJMKHRlc3QpO1xuICAgICAgdmFyIGVsID0gZnJhZ21lbnQoJzxsaSBjbGFzcz1cInRlc3QgcGFzcyAlZVwiPjxoMj4lZTxzcGFuIGNsYXNzPVwiZHVyYXRpb25cIj4lZW1zPC9zcGFuPiA8YSBocmVmPVwiJXNcIiBjbGFzcz1cInJlcGxheVwiPuKAozwvYT48L2gyPjwvbGk+JywgdGVzdC5zcGVlZCwgdGVzdC50aXRsZSwgdGVzdC5kdXJhdGlvbiwgdXJsKTtcbiAgICB9IGVsc2UgaWYgKHRlc3QucGVuZGluZykge1xuICAgICAgdmFyIGVsID0gZnJhZ21lbnQoJzxsaSBjbGFzcz1cInRlc3QgcGFzcyBwZW5kaW5nXCI+PGgyPiVlPC9oMj48L2xpPicsIHRlc3QudGl0bGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZWwgPSBmcmFnbWVudCgnPGxpIGNsYXNzPVwidGVzdCBmYWlsXCI+PGgyPiVlIDxhIGhyZWY9XCI/Z3JlcD0lZVwiIGNsYXNzPVwicmVwbGF5XCI+4oCjPC9hPjwvaDI+PC9saT4nLCB0ZXN0LnRpdGxlLCBlbmNvZGVVUklDb21wb25lbnQodGVzdC5mdWxsVGl0bGUoKSkpO1xuICAgICAgdmFyIHN0ciA9IHRlc3QuZXJyLnN0YWNrIHx8IHRlc3QuZXJyLnRvU3RyaW5nKCk7XG5cbiAgICAgIC8vIEZGIC8gT3BlcmEgZG8gbm90IGFkZCB0aGUgbWVzc2FnZVxuICAgICAgaWYgKCF+c3RyLmluZGV4T2YodGVzdC5lcnIubWVzc2FnZSkpIHtcbiAgICAgICAgc3RyID0gdGVzdC5lcnIubWVzc2FnZSArICdcXG4nICsgc3RyO1xuICAgICAgfVxuXG4gICAgICAvLyA8PUlFNyBzdHJpbmdpZmllcyB0byBbT2JqZWN0IEVycm9yXS4gU2luY2UgaXQgY2FuIGJlIG92ZXJsb2FkZWQsIHdlXG4gICAgICAvLyBjaGVjayBmb3IgdGhlIHJlc3VsdCBvZiB0aGUgc3RyaW5naWZ5aW5nLlxuICAgICAgaWYgKCdbb2JqZWN0IEVycm9yXScgPT0gc3RyKSBzdHIgPSB0ZXN0LmVyci5tZXNzYWdlO1xuXG4gICAgICAvLyBTYWZhcmkgZG9lc24ndCBnaXZlIHlvdSBhIHN0YWNrLiBMZXQncyBhdCBsZWFzdCBwcm92aWRlIGEgc291cmNlIGxpbmUuXG4gICAgICBpZiAoIXRlc3QuZXJyLnN0YWNrICYmIHRlc3QuZXJyLnNvdXJjZVVSTCAmJiB0ZXN0LmVyci5saW5lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc3RyICs9IFwiXFxuKFwiICsgdGVzdC5lcnIuc291cmNlVVJMICsgXCI6XCIgKyB0ZXN0LmVyci5saW5lICsgXCIpXCI7XG4gICAgICB9XG5cbiAgICAgIGVsLmFwcGVuZENoaWxkKGZyYWdtZW50KCc8cHJlIGNsYXNzPVwiZXJyb3JcIj4lZTwvcHJlPicsIHN0cikpO1xuICAgIH1cblxuICAgIC8vIHRvZ2dsZSBjb2RlXG4gICAgLy8gVE9ETzogZGVmZXJcbiAgICBpZiAoIXRlc3QucGVuZGluZykge1xuICAgICAgdmFyIGgyID0gZWwuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2gyJylbMF07XG5cbiAgICAgIG9uKGgyLCAnY2xpY2snLCBmdW5jdGlvbigpe1xuICAgICAgICBwcmUuc3R5bGUuZGlzcGxheSA9ICdub25lJyA9PSBwcmUuc3R5bGUuZGlzcGxheVxuICAgICAgICAgID8gJ2Jsb2NrJ1xuICAgICAgICAgIDogJ25vbmUnO1xuICAgICAgfSk7XG5cbiAgICAgIHZhciBwcmUgPSBmcmFnbWVudCgnPHByZT48Y29kZT4lZTwvY29kZT48L3ByZT4nLCB1dGlscy5jbGVhbih0ZXN0LmZuLnRvU3RyaW5nKCkpKTtcbiAgICAgIGVsLmFwcGVuZENoaWxkKHByZSk7XG4gICAgICBwcmUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICB9XG5cbiAgICAvLyBEb24ndCBjYWxsIC5hcHBlbmRDaGlsZCBpZiAjbW9jaGEtcmVwb3J0IHdhcyBhbHJlYWR5IC5zaGlmdCgpJ2VkIG9mZiB0aGUgc3RhY2suXG4gICAgaWYgKHN0YWNrWzBdKSBzdGFja1swXS5hcHBlbmRDaGlsZChlbCk7XG4gIH0pO1xufVxuXG4vKipcbiAqIFByb3ZpZGUgc3VpdGUgVVJMXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IFtzdWl0ZV1cbiAqL1xuXG5IVE1MLnByb3RvdHlwZS5zdWl0ZVVSTCA9IGZ1bmN0aW9uKHN1aXRlKXtcbiAgcmV0dXJuICc/Z3JlcD0nICsgZW5jb2RlVVJJQ29tcG9uZW50KHN1aXRlLmZ1bGxUaXRsZSgpKTtcbn07XG5cbi8qKlxuICogUHJvdmlkZSB0ZXN0IFVSTFxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBbdGVzdF1cbiAqL1xuXG5IVE1MLnByb3RvdHlwZS50ZXN0VVJMID0gZnVuY3Rpb24odGVzdCl7XG4gIHJldHVybiAnP2dyZXA9JyArIGVuY29kZVVSSUNvbXBvbmVudCh0ZXN0LmZ1bGxUaXRsZSgpKTtcbn07XG5cbi8qKlxuICogRGlzcGxheSBlcnJvciBgbXNnYC5cbiAqL1xuXG5mdW5jdGlvbiBlcnJvcihtc2cpIHtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChmcmFnbWVudCgnPGRpdiBpZD1cIm1vY2hhLWVycm9yXCI+JXM8L2Rpdj4nLCBtc2cpKTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBET00gZnJhZ21lbnQgZnJvbSBgaHRtbGAuXG4gKi9cblxuZnVuY3Rpb24gZnJhZ21lbnQoaHRtbCkge1xuICB2YXIgYXJncyA9IGFyZ3VtZW50c1xuICAgICwgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JylcbiAgICAsIGkgPSAxO1xuXG4gIGRpdi5pbm5lckhUTUwgPSBodG1sLnJlcGxhY2UoLyUoW3NlXSkvZywgZnVuY3Rpb24oXywgdHlwZSl7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlICdzJzogcmV0dXJuIFN0cmluZyhhcmdzW2krK10pO1xuICAgICAgY2FzZSAnZSc6IHJldHVybiBlc2NhcGUoYXJnc1tpKytdKTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBkaXYuZmlyc3RDaGlsZDtcbn1cblxuLyoqXG4gKiBDaGVjayBmb3Igc3VpdGVzIHRoYXQgZG8gbm90IGhhdmUgZWxlbWVudHNcbiAqIHdpdGggYGNsYXNzbmFtZWAsIGFuZCBoaWRlIHRoZW0uXG4gKi9cblxuZnVuY3Rpb24gaGlkZVN1aXRlc1dpdGhvdXQoY2xhc3NuYW1lKSB7XG4gIHZhciBzdWl0ZXMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdzdWl0ZScpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHN1aXRlcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBlbHMgPSBzdWl0ZXNbaV0uZ2V0RWxlbWVudHNCeUNsYXNzTmFtZShjbGFzc25hbWUpO1xuICAgIGlmICgwID09IGVscy5sZW5ndGgpIHN1aXRlc1tpXS5jbGFzc05hbWUgKz0gJyBoaWRkZW4nO1xuICB9XG59XG5cbi8qKlxuICogVW5oaWRlIC5oaWRkZW4gc3VpdGVzLlxuICovXG5cbmZ1bmN0aW9uIHVuaGlkZSgpIHtcbiAgdmFyIGVscyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ3N1aXRlIGhpZGRlbicpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGVscy5sZW5ndGg7ICsraSkge1xuICAgIGVsc1tpXS5jbGFzc05hbWUgPSBlbHNbaV0uY2xhc3NOYW1lLnJlcGxhY2UoJ3N1aXRlIGhpZGRlbicsICdzdWl0ZScpO1xuICB9XG59XG5cbi8qKlxuICogU2V0IGBlbGAgdGV4dCB0byBgc3RyYC5cbiAqL1xuXG5mdW5jdGlvbiB0ZXh0KGVsLCBzdHIpIHtcbiAgaWYgKGVsLnRleHRDb250ZW50KSB7XG4gICAgZWwudGV4dENvbnRlbnQgPSBzdHI7XG4gIH0gZWxzZSB7XG4gICAgZWwuaW5uZXJUZXh0ID0gc3RyO1xuICB9XG59XG5cbi8qKlxuICogTGlzdGVuIG9uIGBldmVudGAgd2l0aCBjYWxsYmFjayBgZm5gLlxuICovXG5cbmZ1bmN0aW9uIG9uKGVsLCBldmVudCwgZm4pIHtcbiAgaWYgKGVsLmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBmbiwgZmFsc2UpO1xuICB9IGVsc2Uge1xuICAgIGVsLmF0dGFjaEV2ZW50KCdvbicgKyBldmVudCwgZm4pO1xuICB9XG59XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9odG1sLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvaW5kZXguanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuZXhwb3J0cy5CYXNlID0gcmVxdWlyZSgnLi9iYXNlJyk7XG5leHBvcnRzLkRvdCA9IHJlcXVpcmUoJy4vZG90Jyk7XG5leHBvcnRzLkRvYyA9IHJlcXVpcmUoJy4vZG9jJyk7XG5leHBvcnRzLlRBUCA9IHJlcXVpcmUoJy4vdGFwJyk7XG5leHBvcnRzLkpTT04gPSByZXF1aXJlKCcuL2pzb24nKTtcbmV4cG9ydHMuSFRNTCA9IHJlcXVpcmUoJy4vaHRtbCcpO1xuZXhwb3J0cy5MaXN0ID0gcmVxdWlyZSgnLi9saXN0Jyk7XG5leHBvcnRzLk1pbiA9IHJlcXVpcmUoJy4vbWluJyk7XG5leHBvcnRzLlNwZWMgPSByZXF1aXJlKCcuL3NwZWMnKTtcbmV4cG9ydHMuTnlhbiA9IHJlcXVpcmUoJy4vbnlhbicpO1xuZXhwb3J0cy5YVW5pdCA9IHJlcXVpcmUoJy4veHVuaXQnKTtcbmV4cG9ydHMuTWFya2Rvd24gPSByZXF1aXJlKCcuL21hcmtkb3duJyk7XG5leHBvcnRzLlByb2dyZXNzID0gcmVxdWlyZSgnLi9wcm9ncmVzcycpO1xuZXhwb3J0cy5MYW5kaW5nID0gcmVxdWlyZSgnLi9sYW5kaW5nJyk7XG5leHBvcnRzLkpTT05Db3YgPSByZXF1aXJlKCcuL2pzb24tY292Jyk7XG5leHBvcnRzLkhUTUxDb3YgPSByZXF1aXJlKCcuL2h0bWwtY292Jyk7XG5leHBvcnRzLkpTT05TdHJlYW0gPSByZXF1aXJlKCcuL2pzb24tc3RyZWFtJyk7XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9pbmRleC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL2pzb24tY292LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpO1xuXG4vKipcbiAqIEV4cG9zZSBgSlNPTkNvdmAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gSlNPTkNvdjtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBKc0NvdmVyYWdlYCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG91dHB1dFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBKU09OQ292KHJ1bm5lciwgb3V0cHV0KSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgb3V0cHV0ID0gMSA9PSBhcmd1bWVudHMubGVuZ3RoID8gdHJ1ZSA6IG91dHB1dDtcblxuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgdGVzdHMgPSBbXVxuICAgICwgZmFpbHVyZXMgPSBbXVxuICAgICwgcGFzc2VzID0gW107XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHRlc3RzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHBhc3Nlcy5wdXNoKHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBmYWlsdXJlcy5wdXNoKHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgdmFyIGNvdiA9IGdsb2JhbC5fJGpzY292ZXJhZ2UgfHwge307XG4gICAgdmFyIHJlc3VsdCA9IHNlbGYuY292ID0gbWFwKGNvdik7XG4gICAgcmVzdWx0LnN0YXRzID0gc2VsZi5zdGF0cztcbiAgICByZXN1bHQudGVzdHMgPSB0ZXN0cy5tYXAoY2xlYW4pO1xuICAgIHJlc3VsdC5mYWlsdXJlcyA9IGZhaWx1cmVzLm1hcChjbGVhbik7XG4gICAgcmVzdWx0LnBhc3NlcyA9IHBhc3Nlcy5tYXAoY2xlYW4pO1xuICAgIGlmICghb3V0cHV0KSByZXR1cm47XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoSlNPTi5zdHJpbmdpZnkocmVzdWx0LCBudWxsLCAyICkpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBNYXAganNjb3ZlcmFnZSBkYXRhIHRvIGEgSlNPTiBzdHJ1Y3R1cmVcbiAqIHN1aXRhYmxlIGZvciByZXBvcnRpbmcuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGNvdlxuICogQHJldHVybiB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbWFwKGNvdikge1xuICB2YXIgcmV0ID0ge1xuICAgICAgaW5zdHJ1bWVudGF0aW9uOiAnbm9kZS1qc2NvdmVyYWdlJ1xuICAgICwgc2xvYzogMFxuICAgICwgaGl0czogMFxuICAgICwgbWlzc2VzOiAwXG4gICAgLCBjb3ZlcmFnZTogMFxuICAgICwgZmlsZXM6IFtdXG4gIH07XG5cbiAgZm9yICh2YXIgZmlsZW5hbWUgaW4gY292KSB7XG4gICAgdmFyIGRhdGEgPSBjb3ZlcmFnZShmaWxlbmFtZSwgY292W2ZpbGVuYW1lXSk7XG4gICAgcmV0LmZpbGVzLnB1c2goZGF0YSk7XG4gICAgcmV0LmhpdHMgKz0gZGF0YS5oaXRzO1xuICAgIHJldC5taXNzZXMgKz0gZGF0YS5taXNzZXM7XG4gICAgcmV0LnNsb2MgKz0gZGF0YS5zbG9jO1xuICB9XG5cbiAgcmV0LmZpbGVzLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgIHJldHVybiBhLmZpbGVuYW1lLmxvY2FsZUNvbXBhcmUoYi5maWxlbmFtZSk7XG4gIH0pO1xuXG4gIGlmIChyZXQuc2xvYyA+IDApIHtcbiAgICByZXQuY292ZXJhZ2UgPSAocmV0LmhpdHMgLyByZXQuc2xvYykgKiAxMDA7XG4gIH1cblxuICByZXR1cm4gcmV0O1xufTtcblxuLyoqXG4gKiBNYXAganNjb3ZlcmFnZSBkYXRhIGZvciBhIHNpbmdsZSBzb3VyY2UgZmlsZVxuICogdG8gYSBKU09OIHN0cnVjdHVyZSBzdWl0YWJsZSBmb3IgcmVwb3J0aW5nLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlbmFtZSBuYW1lIG9mIHRoZSBzb3VyY2UgZmlsZVxuICogQHBhcmFtIHtPYmplY3R9IGRhdGEganNjb3ZlcmFnZSBjb3ZlcmFnZSBkYXRhXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBjb3ZlcmFnZShmaWxlbmFtZSwgZGF0YSkge1xuICB2YXIgcmV0ID0ge1xuICAgIGZpbGVuYW1lOiBmaWxlbmFtZSxcbiAgICBjb3ZlcmFnZTogMCxcbiAgICBoaXRzOiAwLFxuICAgIG1pc3NlczogMCxcbiAgICBzbG9jOiAwLFxuICAgIHNvdXJjZToge31cbiAgfTtcblxuICBkYXRhLnNvdXJjZS5mb3JFYWNoKGZ1bmN0aW9uKGxpbmUsIG51bSl7XG4gICAgbnVtKys7XG5cbiAgICBpZiAoZGF0YVtudW1dID09PSAwKSB7XG4gICAgICByZXQubWlzc2VzKys7XG4gICAgICByZXQuc2xvYysrO1xuICAgIH0gZWxzZSBpZiAoZGF0YVtudW1dICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldC5oaXRzKys7XG4gICAgICByZXQuc2xvYysrO1xuICAgIH1cblxuICAgIHJldC5zb3VyY2VbbnVtXSA9IHtcbiAgICAgICAgc291cmNlOiBsaW5lXG4gICAgICAsIGNvdmVyYWdlOiBkYXRhW251bV0gPT09IHVuZGVmaW5lZFxuICAgICAgICA/ICcnXG4gICAgICAgIDogZGF0YVtudW1dXG4gICAgfTtcbiAgfSk7XG5cbiAgcmV0LmNvdmVyYWdlID0gcmV0LmhpdHMgLyByZXQuc2xvYyAqIDEwMDtcblxuICByZXR1cm4gcmV0O1xufVxuXG4vKipcbiAqIFJldHVybiBhIHBsYWluLW9iamVjdCByZXByZXNlbnRhdGlvbiBvZiBgdGVzdGBcbiAqIGZyZWUgb2YgY3ljbGljIHByb3BlcnRpZXMgZXRjLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSB0ZXN0XG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBjbGVhbih0ZXN0KSB7XG4gIHJldHVybiB7XG4gICAgICB0aXRsZTogdGVzdC50aXRsZVxuICAgICwgZnVsbFRpdGxlOiB0ZXN0LmZ1bGxUaXRsZSgpXG4gICAgLCBkdXJhdGlvbjogdGVzdC5kdXJhdGlvblxuICB9XG59XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9qc29uLWNvdi5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL2pzb24tc3RyZWFtLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgTGlzdGAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gTGlzdDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBMaXN0YCB0ZXN0IHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gTGlzdChydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIHRvdGFsID0gcnVubmVyLnRvdGFsO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KFsnc3RhcnQnLCB7IHRvdGFsOiB0b3RhbCB9XSkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Bhc3MnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShbJ3Bhc3MnLCBjbGVhbih0ZXN0KV0pKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdmYWlsJywgZnVuY3Rpb24odGVzdCwgZXJyKXtcbiAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShbJ2ZhaWwnLCBjbGVhbih0ZXN0KV0pKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKEpTT04uc3RyaW5naWZ5KFsnZW5kJywgc2VsZi5zdGF0c10pKTtcbiAgfSk7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgcGxhaW4tb2JqZWN0IHJlcHJlc2VudGF0aW9uIG9mIGB0ZXN0YFxuICogZnJlZSBvZiBjeWNsaWMgcHJvcGVydGllcyBldGMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHRlc3RcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNsZWFuKHRlc3QpIHtcbiAgcmV0dXJuIHtcbiAgICAgIHRpdGxlOiB0ZXN0LnRpdGxlXG4gICAgLCBmdWxsVGl0bGU6IHRlc3QuZnVsbFRpdGxlKClcbiAgICAsIGR1cmF0aW9uOiB0ZXN0LmR1cmF0aW9uXG4gIH1cbn1cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9qc29uLXN0cmVhbS5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL2pzb24uanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCBjdXJzb3IgPSBCYXNlLmN1cnNvclxuICAsIGNvbG9yID0gQmFzZS5jb2xvcjtcblxuLyoqXG4gKiBFeHBvc2UgYEpTT05gLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEpTT05SZXBvcnRlcjtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBKU09OYCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIEpTT05SZXBvcnRlcihydW5uZXIpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgdGVzdHMgPSBbXVxuICAgICwgZmFpbHVyZXMgPSBbXVxuICAgICwgcGFzc2VzID0gW107XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHRlc3RzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHBhc3Nlcy5wdXNoKHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGZhaWx1cmVzLnB1c2godGVzdCk7XG4gICAgaWYgKGVyciA9PT0gT2JqZWN0KGVycikpIHtcbiAgICAgIHRlc3QuZXJyTXNnID0gZXJyLm1lc3NhZ2U7XG4gICAgICB0ZXN0LmVyclN0YWNrID0gZXJyLnN0YWNrO1xuICAgIH1cbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIHZhciBvYmogPSB7XG4gICAgICBzdGF0czogc2VsZi5zdGF0cyxcbiAgICAgIHRlc3RzOiB0ZXN0cy5tYXAoY2xlYW4pLFxuICAgICAgZmFpbHVyZXM6IGZhaWx1cmVzLm1hcChjbGVhbiksXG4gICAgICBwYXNzZXM6IHBhc3Nlcy5tYXAoY2xlYW4pXG4gICAgfTtcbiAgICBydW5uZXIudGVzdFJlc3VsdHMgPSBvYmo7XG5cbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShKU09OLnN0cmluZ2lmeShvYmosIG51bGwsIDIpKTtcbiAgfSk7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgcGxhaW4tb2JqZWN0IHJlcHJlc2VudGF0aW9uIG9mIGB0ZXN0YFxuICogZnJlZSBvZiBjeWNsaWMgcHJvcGVydGllcyBldGMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHRlc3RcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNsZWFuKHRlc3QpIHtcbiAgcmV0dXJuIHtcbiAgICB0aXRsZTogdGVzdC50aXRsZSxcbiAgICBmdWxsVGl0bGU6IHRlc3QuZnVsbFRpdGxlKCksXG4gICAgZHVyYXRpb246IHRlc3QuZHVyYXRpb24sXG4gICAgZXJyOiB0ZXN0LmVycixcbiAgICBlcnJTdGFjazogdGVzdC5lcnIuc3RhY2ssXG4gICAgZXJyTWVzc2FnZTogdGVzdC5lcnIubWVzc2FnZVxuICB9XG59XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9qc29uLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvbGFuZGluZy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIGN1cnNvciA9IEJhc2UuY3Vyc29yXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgTGFuZGluZ2AuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gTGFuZGluZztcblxuLyoqXG4gKiBBaXJwbGFuZSBjb2xvci5cbiAqL1xuXG5CYXNlLmNvbG9ycy5wbGFuZSA9IDA7XG5cbi8qKlxuICogQWlycGxhbmUgY3Jhc2ggY29sb3IuXG4gKi9cblxuQmFzZS5jb2xvcnNbJ3BsYW5lIGNyYXNoJ10gPSAzMTtcblxuLyoqXG4gKiBSdW53YXkgY29sb3IuXG4gKi9cblxuQmFzZS5jb2xvcnMucnVud2F5ID0gOTA7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgTGFuZGluZ2AgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBMYW5kaW5nKHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgd2lkdGggPSBCYXNlLndpbmRvdy53aWR0aCAqIC43NSB8IDBcbiAgICAsIHRvdGFsID0gcnVubmVyLnRvdGFsXG4gICAgLCBzdHJlYW0gPSBwcm9jZXNzLnN0ZG91dFxuICAgICwgcGxhbmUgPSBjb2xvcigncGxhbmUnLCAn4pyIJylcbiAgICAsIGNyYXNoZWQgPSAtMVxuICAgICwgbiA9IDA7XG5cbiAgZnVuY3Rpb24gcnVud2F5KCkge1xuICAgIHZhciBidWYgPSBBcnJheSh3aWR0aCkuam9pbignLScpO1xuICAgIHJldHVybiAnICAnICsgY29sb3IoJ3J1bndheScsIGJ1Zik7XG4gIH1cblxuICBydW5uZXIub24oJ3N0YXJ0JywgZnVuY3Rpb24oKXtcbiAgICBzdHJlYW0ud3JpdGUoJ1xcbiAgJyk7XG4gICAgY3Vyc29yLmhpZGUoKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIC8vIGNoZWNrIGlmIHRoZSBwbGFuZSBjcmFzaGVkXG4gICAgdmFyIGNvbCA9IC0xID09IGNyYXNoZWRcbiAgICAgID8gd2lkdGggKiArK24gLyB0b3RhbCB8IDBcbiAgICAgIDogY3Jhc2hlZDtcblxuICAgIC8vIHNob3cgdGhlIGNyYXNoXG4gICAgaWYgKCdmYWlsZWQnID09IHRlc3Quc3RhdGUpIHtcbiAgICAgIHBsYW5lID0gY29sb3IoJ3BsYW5lIGNyYXNoJywgJ+KciCcpO1xuICAgICAgY3Jhc2hlZCA9IGNvbDtcbiAgICB9XG5cbiAgICAvLyByZW5kZXIgbGFuZGluZyBzdHJpcFxuICAgIHN0cmVhbS53cml0ZSgnXFx1MDAxYls0RlxcblxcbicpO1xuICAgIHN0cmVhbS53cml0ZShydW53YXkoKSk7XG4gICAgc3RyZWFtLndyaXRlKCdcXG4gICcpO1xuICAgIHN0cmVhbS53cml0ZShjb2xvcigncnVud2F5JywgQXJyYXkoY29sKS5qb2luKCfii4UnKSkpO1xuICAgIHN0cmVhbS53cml0ZShwbGFuZSlcbiAgICBzdHJlYW0ud3JpdGUoY29sb3IoJ3J1bndheScsIEFycmF5KHdpZHRoIC0gY29sKS5qb2luKCfii4UnKSArICdcXG4nKSk7XG4gICAgc3RyZWFtLndyaXRlKHJ1bndheSgpKTtcbiAgICBzdHJlYW0ud3JpdGUoJ1xcdTAwMWJbMG0nKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIGN1cnNvci5zaG93KCk7XG4gICAgY29uc29sZS5sb2coKTtcbiAgICBzZWxmLmVwaWxvZ3VlKCk7XG4gIH0pO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcbkxhbmRpbmcucHJvdG90eXBlID0gbmV3IEY7XG5MYW5kaW5nLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IExhbmRpbmc7XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9sYW5kaW5nLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvbGlzdC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIGN1cnNvciA9IEJhc2UuY3Vyc29yXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgTGlzdGAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gTGlzdDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBMaXN0YCB0ZXN0IHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gTGlzdChydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIG4gPSAwO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIGNvbnNvbGUubG9nKCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigndGVzdCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbG9yKCdwYXNzJywgJyAgICAnICsgdGVzdC5mdWxsVGl0bGUoKSArICc6ICcpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwZW5kaW5nJywgZnVuY3Rpb24odGVzdCl7XG4gICAgdmFyIGZtdCA9IGNvbG9yKCdjaGVja21hcmsnLCAnICAtJylcbiAgICAgICsgY29sb3IoJ3BlbmRpbmcnLCAnICVzJyk7XG4gICAgY29uc29sZS5sb2coZm10LCB0ZXN0LmZ1bGxUaXRsZSgpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgdmFyIGZtdCA9IGNvbG9yKCdjaGVja21hcmsnLCAnICAnK0Jhc2Uuc3ltYm9scy5kb3QpXG4gICAgICArIGNvbG9yKCdwYXNzJywgJyAlczogJylcbiAgICAgICsgY29sb3IodGVzdC5zcGVlZCwgJyVkbXMnKTtcbiAgICBjdXJzb3IuQ1IoKTtcbiAgICBjb25zb2xlLmxvZyhmbXQsIHRlc3QuZnVsbFRpdGxlKCksIHRlc3QuZHVyYXRpb24pO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGN1cnNvci5DUigpO1xuICAgIGNvbnNvbGUubG9nKGNvbG9yKCdmYWlsJywgJyAgJWQpICVzJyksICsrbiwgdGVzdC5mdWxsVGl0bGUoKSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgc2VsZi5lcGlsb2d1ZS5iaW5kKHNlbGYpKTtcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEJhc2UucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gQmFzZS5wcm90b3R5cGU7XG5MaXN0LnByb3RvdHlwZSA9IG5ldyBGO1xuTGlzdC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBMaXN0O1xuXG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9saXN0LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvbWFya2Rvd24uanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4vKipcbiAqIEV4cG9zZSBgTWFya2Rvd25gLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IE1hcmtkb3duO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYE1hcmtkb3duYCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIE1hcmtkb3duKHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgbGV2ZWwgPSAwXG4gICAgLCBidWYgPSAnJztcblxuICBmdW5jdGlvbiB0aXRsZShzdHIpIHtcbiAgICByZXR1cm4gQXJyYXkobGV2ZWwpLmpvaW4oJyMnKSArICcgJyArIHN0cjtcbiAgfVxuXG4gIGZ1bmN0aW9uIGluZGVudCgpIHtcbiAgICByZXR1cm4gQXJyYXkobGV2ZWwpLmpvaW4oJyAgJyk7XG4gIH1cblxuICBmdW5jdGlvbiBtYXBUT0Moc3VpdGUsIG9iaikge1xuICAgIHZhciByZXQgPSBvYmo7XG4gICAgb2JqID0gb2JqW3N1aXRlLnRpdGxlXSA9IG9ialtzdWl0ZS50aXRsZV0gfHwgeyBzdWl0ZTogc3VpdGUgfTtcbiAgICBzdWl0ZS5zdWl0ZXMuZm9yRWFjaChmdW5jdGlvbihzdWl0ZSl7XG4gICAgICBtYXBUT0Moc3VpdGUsIG9iaik7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0cmluZ2lmeVRPQyhvYmosIGxldmVsKSB7XG4gICAgKytsZXZlbDtcbiAgICB2YXIgYnVmID0gJyc7XG4gICAgdmFyIGxpbms7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKCdzdWl0ZScgPT0ga2V5KSBjb250aW51ZTtcbiAgICAgIGlmIChrZXkpIGxpbmsgPSAnIC0gWycgKyBrZXkgKyAnXSgjJyArIHV0aWxzLnNsdWcob2JqW2tleV0uc3VpdGUuZnVsbFRpdGxlKCkpICsgJylcXG4nO1xuICAgICAgaWYgKGtleSkgYnVmICs9IEFycmF5KGxldmVsKS5qb2luKCcgICcpICsgbGluaztcbiAgICAgIGJ1ZiArPSBzdHJpbmdpZnlUT0Mob2JqW2tleV0sIGxldmVsKTtcbiAgICB9XG4gICAgLS1sZXZlbDtcbiAgICByZXR1cm4gYnVmO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2VuZXJhdGVUT0Moc3VpdGUpIHtcbiAgICB2YXIgb2JqID0gbWFwVE9DKHN1aXRlLCB7fSk7XG4gICAgcmV0dXJuIHN0cmluZ2lmeVRPQyhvYmosIDApO1xuICB9XG5cbiAgZ2VuZXJhdGVUT0MocnVubmVyLnN1aXRlKTtcblxuICBydW5uZXIub24oJ3N1aXRlJywgZnVuY3Rpb24oc3VpdGUpe1xuICAgICsrbGV2ZWw7XG4gICAgdmFyIHNsdWcgPSB1dGlscy5zbHVnKHN1aXRlLmZ1bGxUaXRsZSgpKTtcbiAgICBidWYgKz0gJzxhIG5hbWU9XCInICsgc2x1ZyArICdcIj48L2E+JyArICdcXG4nO1xuICAgIGJ1ZiArPSB0aXRsZShzdWl0ZS50aXRsZSkgKyAnXFxuJztcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZSBlbmQnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgLS1sZXZlbDtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgdmFyIGNvZGUgPSB1dGlscy5jbGVhbih0ZXN0LmZuLnRvU3RyaW5nKCkpO1xuICAgIGJ1ZiArPSB0ZXN0LnRpdGxlICsgJy5cXG4nO1xuICAgIGJ1ZiArPSAnXFxuYGBganNcXG4nO1xuICAgIGJ1ZiArPSBjb2RlICsgJ1xcbic7XG4gICAgYnVmICs9ICdgYGBcXG5cXG4nO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJyMgVE9DXFxuJyk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoZ2VuZXJhdGVUT0MocnVubmVyLnN1aXRlKSk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoYnVmKTtcbiAgfSk7XG59XG59KTsgLy8gbW9kdWxlOiByZXBvcnRlcnMvbWFya2Rvd24uanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9taW4uanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJyk7XG5cbi8qKlxuICogRXhwb3NlIGBNaW5gLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IE1pbjtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBNaW5gIG1pbmltYWwgdGVzdCByZXBvcnRlciAoYmVzdCB1c2VkIHdpdGggLS13YXRjaCkuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBNaW4ocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIC8vIGNsZWFyIHNjcmVlblxuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHUwMDFiWzJKJyk7XG4gICAgLy8gc2V0IGN1cnNvciBwb3NpdGlvblxuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHUwMDFiWzE7M0gnKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCB0aGlzLmVwaWxvZ3VlLmJpbmQodGhpcykpO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcbk1pbi5wcm90b3R5cGUgPSBuZXcgRjtcbk1pbi5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBNaW47XG5cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL21pbi5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL255YW4uanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgRG90YC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBOeWFuQ2F0O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYERvdGAgbWF0cml4IHRlc3QgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBOeWFuQ2F0KHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIHdpZHRoID0gQmFzZS53aW5kb3cud2lkdGggKiAuNzUgfCAwXG4gICAgLCByYWluYm93Q29sb3JzID0gdGhpcy5yYWluYm93Q29sb3JzID0gc2VsZi5nZW5lcmF0ZUNvbG9ycygpXG4gICAgLCBjb2xvckluZGV4ID0gdGhpcy5jb2xvckluZGV4ID0gMFxuICAgICwgbnVtZXJPZkxpbmVzID0gdGhpcy5udW1iZXJPZkxpbmVzID0gNFxuICAgICwgdHJhamVjdG9yaWVzID0gdGhpcy50cmFqZWN0b3JpZXMgPSBbW10sIFtdLCBbXSwgW11dXG4gICAgLCBueWFuQ2F0V2lkdGggPSB0aGlzLm55YW5DYXRXaWR0aCA9IDExXG4gICAgLCB0cmFqZWN0b3J5V2lkdGhNYXggPSB0aGlzLnRyYWplY3RvcnlXaWR0aE1heCA9ICh3aWR0aCAtIG55YW5DYXRXaWR0aClcbiAgICAsIHNjb3JlYm9hcmRXaWR0aCA9IHRoaXMuc2NvcmVib2FyZFdpZHRoID0gNVxuICAgICwgdGljayA9IHRoaXMudGljayA9IDBcbiAgICAsIG4gPSAwO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIEJhc2UuY3Vyc29yLmhpZGUoKTtcbiAgICBzZWxmLmRyYXcoKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwZW5kaW5nJywgZnVuY3Rpb24odGVzdCl7XG4gICAgc2VsZi5kcmF3KCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHNlbGYuZHJhdygpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIHNlbGYuZHJhdygpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgQmFzZS5jdXJzb3Iuc2hvdygpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsZi5udW1iZXJPZkxpbmVzOyBpKyspIHdyaXRlKCdcXG4nKTtcbiAgICBzZWxmLmVwaWxvZ3VlKCk7XG4gIH0pO1xufVxuXG4vKipcbiAqIERyYXcgdGhlIG55YW4gY2F0XG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuZHJhdyA9IGZ1bmN0aW9uKCl7XG4gIHRoaXMuYXBwZW5kUmFpbmJvdygpO1xuICB0aGlzLmRyYXdTY29yZWJvYXJkKCk7XG4gIHRoaXMuZHJhd1JhaW5ib3coKTtcbiAgdGhpcy5kcmF3TnlhbkNhdCgpO1xuICB0aGlzLnRpY2sgPSAhdGhpcy50aWNrO1xufTtcblxuLyoqXG4gKiBEcmF3IHRoZSBcInNjb3JlYm9hcmRcIiBzaG93aW5nIHRoZSBudW1iZXJcbiAqIG9mIHBhc3NlcywgZmFpbHVyZXMgYW5kIHBlbmRpbmcgdGVzdHMuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuZHJhd1Njb3JlYm9hcmQgPSBmdW5jdGlvbigpe1xuICB2YXIgc3RhdHMgPSB0aGlzLnN0YXRzO1xuICB2YXIgY29sb3JzID0gQmFzZS5jb2xvcnM7XG5cbiAgZnVuY3Rpb24gZHJhdyhjb2xvciwgbikge1xuICAgIHdyaXRlKCcgJyk7XG4gICAgd3JpdGUoJ1xcdTAwMWJbJyArIGNvbG9yICsgJ20nICsgbiArICdcXHUwMDFiWzBtJyk7XG4gICAgd3JpdGUoJ1xcbicpO1xuICB9XG5cbiAgZHJhdyhjb2xvcnMuZ3JlZW4sIHN0YXRzLnBhc3Nlcyk7XG4gIGRyYXcoY29sb3JzLmZhaWwsIHN0YXRzLmZhaWx1cmVzKTtcbiAgZHJhdyhjb2xvcnMucGVuZGluZywgc3RhdHMucGVuZGluZyk7XG4gIHdyaXRlKCdcXG4nKTtcblxuICB0aGlzLmN1cnNvclVwKHRoaXMubnVtYmVyT2ZMaW5lcyk7XG59O1xuXG4vKipcbiAqIEFwcGVuZCB0aGUgcmFpbmJvdy5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5hcHBlbmRSYWluYm93ID0gZnVuY3Rpb24oKXtcbiAgdmFyIHNlZ21lbnQgPSB0aGlzLnRpY2sgPyAnXycgOiAnLSc7XG4gIHZhciByYWluYm93aWZpZWQgPSB0aGlzLnJhaW5ib3dpZnkoc2VnbWVudCk7XG5cbiAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IHRoaXMubnVtYmVyT2ZMaW5lczsgaW5kZXgrKykge1xuICAgIHZhciB0cmFqZWN0b3J5ID0gdGhpcy50cmFqZWN0b3JpZXNbaW5kZXhdO1xuICAgIGlmICh0cmFqZWN0b3J5Lmxlbmd0aCA+PSB0aGlzLnRyYWplY3RvcnlXaWR0aE1heCkgdHJhamVjdG9yeS5zaGlmdCgpO1xuICAgIHRyYWplY3RvcnkucHVzaChyYWluYm93aWZpZWQpO1xuICB9XG59O1xuXG4vKipcbiAqIERyYXcgdGhlIHJhaW5ib3cuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuZHJhd1JhaW5ib3cgPSBmdW5jdGlvbigpe1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgdGhpcy50cmFqZWN0b3JpZXMuZm9yRWFjaChmdW5jdGlvbihsaW5lLCBpbmRleCkge1xuICAgIHdyaXRlKCdcXHUwMDFiWycgKyBzZWxmLnNjb3JlYm9hcmRXaWR0aCArICdDJyk7XG4gICAgd3JpdGUobGluZS5qb2luKCcnKSk7XG4gICAgd3JpdGUoJ1xcbicpO1xuICB9KTtcblxuICB0aGlzLmN1cnNvclVwKHRoaXMubnVtYmVyT2ZMaW5lcyk7XG59O1xuXG4vKipcbiAqIERyYXcgdGhlIG55YW4gY2F0XG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuZHJhd055YW5DYXQgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB2YXIgc3RhcnRXaWR0aCA9IHRoaXMuc2NvcmVib2FyZFdpZHRoICsgdGhpcy50cmFqZWN0b3JpZXNbMF0ubGVuZ3RoO1xuICB2YXIgY29sb3IgPSAnXFx1MDAxYlsnICsgc3RhcnRXaWR0aCArICdDJztcbiAgdmFyIHBhZGRpbmcgPSAnJztcblxuICB3cml0ZShjb2xvcik7XG4gIHdyaXRlKCdfLC0tLS0tLSwnKTtcbiAgd3JpdGUoJ1xcbicpO1xuXG4gIHdyaXRlKGNvbG9yKTtcbiAgcGFkZGluZyA9IHNlbGYudGljayA/ICcgICcgOiAnICAgJztcbiAgd3JpdGUoJ198JyArIHBhZGRpbmcgKyAnL1xcXFxfL1xcXFwgJyk7XG4gIHdyaXRlKCdcXG4nKTtcblxuICB3cml0ZShjb2xvcik7XG4gIHBhZGRpbmcgPSBzZWxmLnRpY2sgPyAnXycgOiAnX18nO1xuICB2YXIgdGFpbCA9IHNlbGYudGljayA/ICd+JyA6ICdeJztcbiAgdmFyIGZhY2U7XG4gIHdyaXRlKHRhaWwgKyAnfCcgKyBwYWRkaW5nICsgdGhpcy5mYWNlKCkgKyAnICcpO1xuICB3cml0ZSgnXFxuJyk7XG5cbiAgd3JpdGUoY29sb3IpO1xuICBwYWRkaW5nID0gc2VsZi50aWNrID8gJyAnIDogJyAgJztcbiAgd3JpdGUocGFkZGluZyArICdcIlwiICBcIlwiICcpO1xuICB3cml0ZSgnXFxuJyk7XG5cbiAgdGhpcy5jdXJzb3JVcCh0aGlzLm51bWJlck9mTGluZXMpO1xufTtcblxuLyoqXG4gKiBEcmF3IG55YW4gY2F0IGZhY2UuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuZmFjZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgc3RhdHMgPSB0aGlzLnN0YXRzO1xuICBpZiAoc3RhdHMuZmFpbHVyZXMpIHtcbiAgICByZXR1cm4gJyggeCAueCknO1xuICB9IGVsc2UgaWYgKHN0YXRzLnBlbmRpbmcpIHtcbiAgICByZXR1cm4gJyggbyAubyknO1xuICB9IGVsc2UgaWYoc3RhdHMucGFzc2VzKSB7XG4gICAgcmV0dXJuICcoIF4gLl4pJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gJyggLSAuLSknO1xuICB9XG59XG5cbi8qKlxuICogTW92ZSBjdXJzb3IgdXAgYG5gLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5jdXJzb3JVcCA9IGZ1bmN0aW9uKG4pIHtcbiAgd3JpdGUoJ1xcdTAwMWJbJyArIG4gKyAnQScpO1xufTtcblxuLyoqXG4gKiBNb3ZlIGN1cnNvciBkb3duIGBuYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuY3Vyc29yRG93biA9IGZ1bmN0aW9uKG4pIHtcbiAgd3JpdGUoJ1xcdTAwMWJbJyArIG4gKyAnQicpO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSByYWluYm93IGNvbG9ycy5cbiAqXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk55YW5DYXQucHJvdG90eXBlLmdlbmVyYXRlQ29sb3JzID0gZnVuY3Rpb24oKXtcbiAgdmFyIGNvbG9ycyA9IFtdO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgKDYgKiA3KTsgaSsrKSB7XG4gICAgdmFyIHBpMyA9IE1hdGguZmxvb3IoTWF0aC5QSSAvIDMpO1xuICAgIHZhciBuID0gKGkgKiAoMS4wIC8gNikpO1xuICAgIHZhciByID0gTWF0aC5mbG9vcigzICogTWF0aC5zaW4obikgKyAzKTtcbiAgICB2YXIgZyA9IE1hdGguZmxvb3IoMyAqIE1hdGguc2luKG4gKyAyICogcGkzKSArIDMpO1xuICAgIHZhciBiID0gTWF0aC5mbG9vcigzICogTWF0aC5zaW4obiArIDQgKiBwaTMpICsgMyk7XG4gICAgY29sb3JzLnB1c2goMzYgKiByICsgNiAqIGcgKyBiICsgMTYpO1xuICB9XG5cbiAgcmV0dXJuIGNvbG9ycztcbn07XG5cbi8qKlxuICogQXBwbHkgcmFpbmJvdyB0byB0aGUgZ2l2ZW4gYHN0cmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUucmFpbmJvd2lmeSA9IGZ1bmN0aW9uKHN0cil7XG4gIHZhciBjb2xvciA9IHRoaXMucmFpbmJvd0NvbG9yc1t0aGlzLmNvbG9ySW5kZXggJSB0aGlzLnJhaW5ib3dDb2xvcnMubGVuZ3RoXTtcbiAgdGhpcy5jb2xvckluZGV4ICs9IDE7XG4gIHJldHVybiAnXFx1MDAxYlszODs1OycgKyBjb2xvciArICdtJyArIHN0ciArICdcXHUwMDFiWzBtJztcbn07XG5cbi8qKlxuICogU3Rkb3V0IGhlbHBlci5cbiAqL1xuXG5mdW5jdGlvbiB3cml0ZShzdHJpbmcpIHtcbiAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoc3RyaW5nKTtcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEJhc2UucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gQmFzZS5wcm90b3R5cGU7XG5OeWFuQ2F0LnByb3RvdHlwZSA9IG5ldyBGO1xuTnlhbkNhdC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBOeWFuQ2F0O1xuXG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9ueWFuLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvcHJvZ3Jlc3MuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY3Vyc29yID0gQmFzZS5jdXJzb3JcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBQcm9ncmVzc2AuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gUHJvZ3Jlc3M7XG5cbi8qKlxuICogR2VuZXJhbCBwcm9ncmVzcyBiYXIgY29sb3IuXG4gKi9cblxuQmFzZS5jb2xvcnMucHJvZ3Jlc3MgPSA5MDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBQcm9ncmVzc2AgYmFyIHRlc3QgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gUHJvZ3Jlc3MocnVubmVyLCBvcHRpb25zKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgd2lkdGggPSBCYXNlLndpbmRvdy53aWR0aCAqIC41MCB8IDBcbiAgICAsIHRvdGFsID0gcnVubmVyLnRvdGFsXG4gICAgLCBjb21wbGV0ZSA9IDBcbiAgICAsIG1heCA9IE1hdGgubWF4XG4gICAgLCBsYXN0TiA9IC0xO1xuXG4gIC8vIGRlZmF1bHQgY2hhcnNcbiAgb3B0aW9ucy5vcGVuID0gb3B0aW9ucy5vcGVuIHx8ICdbJztcbiAgb3B0aW9ucy5jb21wbGV0ZSA9IG9wdGlvbnMuY29tcGxldGUgfHwgJ+KWrCc7XG4gIG9wdGlvbnMuaW5jb21wbGV0ZSA9IG9wdGlvbnMuaW5jb21wbGV0ZSB8fCBCYXNlLnN5bWJvbHMuZG90O1xuICBvcHRpb25zLmNsb3NlID0gb3B0aW9ucy5jbG9zZSB8fCAnXSc7XG4gIG9wdGlvbnMudmVyYm9zZSA9IGZhbHNlO1xuXG4gIC8vIHRlc3RzIHN0YXJ0ZWRcbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2coKTtcbiAgICBjdXJzb3IuaGlkZSgpO1xuICB9KTtcblxuICAvLyB0ZXN0cyBjb21wbGV0ZVxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24oKXtcbiAgICBjb21wbGV0ZSsrO1xuICAgIHZhciBpbmNvbXBsZXRlID0gdG90YWwgLSBjb21wbGV0ZVxuICAgICAgLCBwZXJjZW50ID0gY29tcGxldGUgLyB0b3RhbFxuICAgICAgLCBuID0gd2lkdGggKiBwZXJjZW50IHwgMFxuICAgICAgLCBpID0gd2lkdGggLSBuO1xuXG4gICAgaWYgKGxhc3ROID09PSBuICYmICFvcHRpb25zLnZlcmJvc2UpIHtcbiAgICAgIC8vIERvbid0IHJlLXJlbmRlciB0aGUgbGluZSBpZiBpdCBoYXNuJ3QgY2hhbmdlZFxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsYXN0TiA9IG47XG5cbiAgICBjdXJzb3IuQ1IoKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFx1MDAxYltKJyk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29sb3IoJ3Byb2dyZXNzJywgJyAgJyArIG9wdGlvbnMub3BlbikpO1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKEFycmF5KG4pLmpvaW4ob3B0aW9ucy5jb21wbGV0ZSkpO1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKEFycmF5KGkpLmpvaW4ob3B0aW9ucy5pbmNvbXBsZXRlKSk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29sb3IoJ3Byb2dyZXNzJywgb3B0aW9ucy5jbG9zZSkpO1xuICAgIGlmIChvcHRpb25zLnZlcmJvc2UpIHtcbiAgICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbG9yKCdwcm9ncmVzcycsICcgJyArIGNvbXBsZXRlICsgJyBvZiAnICsgdG90YWwpKTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIHRlc3RzIGFyZSBjb21wbGV0ZSwgb3V0cHV0IHNvbWUgc3RhdHNcbiAgLy8gYW5kIHRoZSBmYWlsdXJlcyBpZiBhbnlcbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIGN1cnNvci5zaG93KCk7XG4gICAgY29uc29sZS5sb2coKTtcbiAgICBzZWxmLmVwaWxvZ3VlKCk7XG4gIH0pO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcblByb2dyZXNzLnByb3RvdHlwZSA9IG5ldyBGO1xuUHJvZ3Jlc3MucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gUHJvZ3Jlc3M7XG5cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL3Byb2dyZXNzLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvc3BlYy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIGN1cnNvciA9IEJhc2UuY3Vyc29yXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgU3BlY2AuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gU3BlYztcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBTcGVjYCB0ZXN0IHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gU3BlYyhydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIGluZGVudHMgPSAwXG4gICAgLCBuID0gMDtcblxuICBmdW5jdGlvbiBpbmRlbnQoKSB7XG4gICAgcmV0dXJuIEFycmF5KGluZGVudHMpLmpvaW4oJyAgJylcbiAgfVxuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIGNvbnNvbGUubG9nKCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignc3VpdGUnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgKytpbmRlbnRzO1xuICAgIGNvbnNvbGUubG9nKGNvbG9yKCdzdWl0ZScsICclcyVzJyksIGluZGVudCgpLCBzdWl0ZS50aXRsZSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignc3VpdGUgZW5kJywgZnVuY3Rpb24oc3VpdGUpe1xuICAgIC0taW5kZW50cztcbiAgICBpZiAoMSA9PSBpbmRlbnRzKSBjb25zb2xlLmxvZygpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB2YXIgZm10ID0gaW5kZW50KCkgKyBjb2xvcigncGVuZGluZycsICcgIC0gJXMnKTtcbiAgICBjb25zb2xlLmxvZyhmbXQsIHRlc3QudGl0bGUpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Bhc3MnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBpZiAoJ2Zhc3QnID09IHRlc3Quc3BlZWQpIHtcbiAgICAgIHZhciBmbXQgPSBpbmRlbnQoKVxuICAgICAgICArIGNvbG9yKCdjaGVja21hcmsnLCAnICAnICsgQmFzZS5zeW1ib2xzLm9rKVxuICAgICAgICArIGNvbG9yKCdwYXNzJywgJyAlcyAnKTtcbiAgICAgIGN1cnNvci5DUigpO1xuICAgICAgY29uc29sZS5sb2coZm10LCB0ZXN0LnRpdGxlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGZtdCA9IGluZGVudCgpXG4gICAgICAgICsgY29sb3IoJ2NoZWNrbWFyaycsICcgICcgKyBCYXNlLnN5bWJvbHMub2spXG4gICAgICAgICsgY29sb3IoJ3Bhc3MnLCAnICVzICcpXG4gICAgICAgICsgY29sb3IodGVzdC5zcGVlZCwgJyglZG1zKScpO1xuICAgICAgY3Vyc29yLkNSKCk7XG4gICAgICBjb25zb2xlLmxvZyhmbXQsIHRlc3QudGl0bGUsIHRlc3QuZHVyYXRpb24pO1xuICAgIH1cbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdmYWlsJywgZnVuY3Rpb24odGVzdCwgZXJyKXtcbiAgICBjdXJzb3IuQ1IoKTtcbiAgICBjb25zb2xlLmxvZyhpbmRlbnQoKSArIGNvbG9yKCdmYWlsJywgJyAgJWQpICVzJyksICsrbiwgdGVzdC50aXRsZSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgc2VsZi5lcGlsb2d1ZS5iaW5kKHNlbGYpKTtcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEJhc2UucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gQmFzZS5wcm90b3R5cGU7XG5TcGVjLnByb3RvdHlwZSA9IG5ldyBGO1xuU3BlYy5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBTcGVjO1xuXG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9zcGVjLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvdGFwLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY3Vyc29yID0gQmFzZS5jdXJzb3JcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBUQVBgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IFRBUDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBUQVBgIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gVEFQKHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgbiA9IDFcbiAgICAsIHBhc3NlcyA9IDBcbiAgICAsIGZhaWx1cmVzID0gMDtcblxuICBydW5uZXIub24oJ3N0YXJ0JywgZnVuY3Rpb24oKXtcbiAgICB2YXIgdG90YWwgPSBydW5uZXIuZ3JlcFRvdGFsKHJ1bm5lci5zdWl0ZSk7XG4gICAgY29uc29sZS5sb2coJyVkLi4lZCcsIDEsIHRvdGFsKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKCl7XG4gICAgKytuO1xuICB9KTtcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBjb25zb2xlLmxvZygnb2sgJWQgJXMgIyBTS0lQIC0nLCBuLCB0aXRsZSh0ZXN0KSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHBhc3NlcysrO1xuICAgIGNvbnNvbGUubG9nKCdvayAlZCAlcycsIG4sIHRpdGxlKHRlc3QpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdmYWlsJywgZnVuY3Rpb24odGVzdCwgZXJyKXtcbiAgICBmYWlsdXJlcysrO1xuICAgIGNvbnNvbGUubG9nKCdub3Qgb2sgJWQgJXMnLCBuLCB0aXRsZSh0ZXN0KSk7XG4gICAgaWYgKGVyci5zdGFjaykgY29uc29sZS5sb2coZXJyLnN0YWNrLnJlcGxhY2UoL14vZ20sICcgICcpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIGNvbnNvbGUubG9nKCcjIHRlc3RzICcgKyAocGFzc2VzICsgZmFpbHVyZXMpKTtcbiAgICBjb25zb2xlLmxvZygnIyBwYXNzICcgKyBwYXNzZXMpO1xuICAgIGNvbnNvbGUubG9nKCcjIGZhaWwgJyArIGZhaWx1cmVzKTtcbiAgfSk7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgVEFQLXNhZmUgdGl0bGUgb2YgYHRlc3RgXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHRlc3RcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHRpdGxlKHRlc3QpIHtcbiAgcmV0dXJuIHRlc3QuZnVsbFRpdGxlKCkucmVwbGFjZSgvIy9nLCAnJyk7XG59XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy90YXAuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy94dW5pdC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxuICAsIGVzY2FwZSA9IHV0aWxzLmVzY2FwZTtcblxuLyoqXG4gKiBTYXZlIHRpbWVyIHJlZmVyZW5jZXMgdG8gYXZvaWQgU2lub24gaW50ZXJmZXJpbmcgKHNlZSBHSC0yMzcpLlxuICovXG5cbnZhciBEYXRlID0gZ2xvYmFsLkRhdGVcbiAgLCBzZXRUaW1lb3V0ID0gZ2xvYmFsLnNldFRpbWVvdXRcbiAgLCBzZXRJbnRlcnZhbCA9IGdsb2JhbC5zZXRJbnRlcnZhbFxuICAsIGNsZWFyVGltZW91dCA9IGdsb2JhbC5jbGVhclRpbWVvdXRcbiAgLCBjbGVhckludGVydmFsID0gZ2xvYmFsLmNsZWFySW50ZXJ2YWw7XG5cbi8qKlxuICogRXhwb3NlIGBYVW5pdGAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gWFVuaXQ7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgWFVuaXRgIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gWFVuaXQocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuICB2YXIgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCB0ZXN0cyA9IFtdXG4gICAgLCBzZWxmID0gdGhpcztcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB0ZXN0cy5wdXNoKHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Bhc3MnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB0ZXN0cy5wdXNoKHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB0ZXN0cy5wdXNoKHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2codGFnKCd0ZXN0c3VpdGUnLCB7XG4gICAgICAgIG5hbWU6ICdNb2NoYSBUZXN0cydcbiAgICAgICwgdGVzdHM6IHN0YXRzLnRlc3RzXG4gICAgICAsIGZhaWx1cmVzOiBzdGF0cy5mYWlsdXJlc1xuICAgICAgLCBlcnJvcnM6IHN0YXRzLmZhaWx1cmVzXG4gICAgICAsIHNraXBwZWQ6IHN0YXRzLnRlc3RzIC0gc3RhdHMuZmFpbHVyZXMgLSBzdGF0cy5wYXNzZXNcbiAgICAgICwgdGltZXN0YW1wOiAobmV3IERhdGUpLnRvVVRDU3RyaW5nKClcbiAgICAgICwgdGltZTogKHN0YXRzLmR1cmF0aW9uIC8gMTAwMCkgfHwgMFxuICAgIH0sIGZhbHNlKSk7XG5cbiAgICB0ZXN0cy5mb3JFYWNoKHRlc3QpO1xuICAgIGNvbnNvbGUubG9nKCc8L3Rlc3RzdWl0ZT4nKTtcbiAgfSk7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBCYXNlLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEJhc2UucHJvdG90eXBlO1xuWFVuaXQucHJvdG90eXBlID0gbmV3IEY7XG5YVW5pdC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBYVW5pdDtcblxuXG4vKipcbiAqIE91dHB1dCB0YWcgZm9yIHRoZSBnaXZlbiBgdGVzdC5gXG4gKi9cblxuZnVuY3Rpb24gdGVzdCh0ZXN0KSB7XG4gIHZhciBhdHRycyA9IHtcbiAgICAgIGNsYXNzbmFtZTogdGVzdC5wYXJlbnQuZnVsbFRpdGxlKClcbiAgICAsIG5hbWU6IHRlc3QudGl0bGVcbiAgICAsIHRpbWU6ICh0ZXN0LmR1cmF0aW9uIC8gMTAwMCkgfHwgMFxuICB9O1xuXG4gIGlmICgnZmFpbGVkJyA9PSB0ZXN0LnN0YXRlKSB7XG4gICAgdmFyIGVyciA9IHRlc3QuZXJyO1xuICAgIGNvbnNvbGUubG9nKHRhZygndGVzdGNhc2UnLCBhdHRycywgZmFsc2UsIHRhZygnZmFpbHVyZScsIHt9LCBmYWxzZSwgY2RhdGEoZXNjYXBlKGVyci5tZXNzYWdlKSArIFwiXFxuXCIgKyBlcnIuc3RhY2spKSkpO1xuICB9IGVsc2UgaWYgKHRlc3QucGVuZGluZykge1xuICAgIGNvbnNvbGUubG9nKHRhZygndGVzdGNhc2UnLCBhdHRycywgZmFsc2UsIHRhZygnc2tpcHBlZCcsIHt9LCB0cnVlKSkpO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKHRhZygndGVzdGNhc2UnLCBhdHRycywgdHJ1ZSkgKTtcbiAgfVxufVxuXG4vKipcbiAqIEhUTUwgdGFnIGhlbHBlci5cbiAqL1xuXG5mdW5jdGlvbiB0YWcobmFtZSwgYXR0cnMsIGNsb3NlLCBjb250ZW50KSB7XG4gIHZhciBlbmQgPSBjbG9zZSA/ICcvPicgOiAnPidcbiAgICAsIHBhaXJzID0gW11cbiAgICAsIHRhZztcblxuICBmb3IgKHZhciBrZXkgaW4gYXR0cnMpIHtcbiAgICBwYWlycy5wdXNoKGtleSArICc9XCInICsgZXNjYXBlKGF0dHJzW2tleV0pICsgJ1wiJyk7XG4gIH1cblxuICB0YWcgPSAnPCcgKyBuYW1lICsgKHBhaXJzLmxlbmd0aCA/ICcgJyArIHBhaXJzLmpvaW4oJyAnKSA6ICcnKSArIGVuZDtcbiAgaWYgKGNvbnRlbnQpIHRhZyArPSBjb250ZW50ICsgJzwvJyArIG5hbWUgKyBlbmQ7XG4gIHJldHVybiB0YWc7XG59XG5cbi8qKlxuICogUmV0dXJuIGNkYXRhIGVzY2FwZWQgQ0RBVEEgYHN0cmAuXG4gKi9cblxuZnVuY3Rpb24gY2RhdGEoc3RyKSB7XG4gIHJldHVybiAnPCFbQ0RBVEFbJyArIGVzY2FwZShzdHIpICsgJ11dPic7XG59XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy94dW5pdC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicnVubmFibGUuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdicm93c2VyL2V2ZW50cycpLkV2ZW50RW1pdHRlclxuICAsIGRlYnVnID0gcmVxdWlyZSgnYnJvd3Nlci9kZWJ1ZycpKCdtb2NoYTpydW5uYWJsZScpXG4gICwgbWlsbGlzZWNvbmRzID0gcmVxdWlyZSgnLi9tcycpO1xuXG4vKipcbiAqIFNhdmUgdGltZXIgcmVmZXJlbmNlcyB0byBhdm9pZCBTaW5vbiBpbnRlcmZlcmluZyAoc2VlIEdILTIzNykuXG4gKi9cblxudmFyIERhdGUgPSBnbG9iYWwuRGF0ZVxuICAsIHNldFRpbWVvdXQgPSBnbG9iYWwuc2V0VGltZW91dFxuICAsIHNldEludGVydmFsID0gZ2xvYmFsLnNldEludGVydmFsXG4gICwgY2xlYXJUaW1lb3V0ID0gZ2xvYmFsLmNsZWFyVGltZW91dFxuICAsIGNsZWFySW50ZXJ2YWwgPSBnbG9iYWwuY2xlYXJJbnRlcnZhbDtcblxuLyoqXG4gKiBPYmplY3QjdG9TdHJpbmcoKS5cbiAqL1xuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nO1xuXG4vKipcbiAqIEV4cG9zZSBgUnVubmFibGVgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gUnVubmFibGU7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgUnVubmFibGVgIHdpdGggdGhlIGdpdmVuIGB0aXRsZWAgYW5kIGNhbGxiYWNrIGBmbmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHRpdGxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gUnVubmFibGUodGl0bGUsIGZuKSB7XG4gIHRoaXMudGl0bGUgPSB0aXRsZTtcbiAgdGhpcy5mbiA9IGZuO1xuICB0aGlzLmFzeW5jID0gZm4gJiYgZm4ubGVuZ3RoO1xuICB0aGlzLnN5bmMgPSAhIHRoaXMuYXN5bmM7XG4gIHRoaXMuX3RpbWVvdXQgPSAyMDAwO1xuICB0aGlzLl9zbG93ID0gNzU7XG4gIHRoaXMuX2VuYWJsZVRpbWVvdXRzID0gdHJ1ZTtcbiAgdGhpcy50aW1lZE91dCA9IGZhbHNlO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgRXZlbnRFbWl0dGVyLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGU7XG5SdW5uYWJsZS5wcm90b3R5cGUgPSBuZXcgRjtcblJ1bm5hYmxlLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFJ1bm5hYmxlO1xuXG5cbi8qKlxuICogU2V0ICYgZ2V0IHRpbWVvdXQgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcnxTdHJpbmd9IG1zXG4gKiBAcmV0dXJuIHtSdW5uYWJsZXxOdW1iZXJ9IG1zIG9yIHNlbGZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5hYmxlLnByb3RvdHlwZS50aW1lb3V0ID0gZnVuY3Rpb24obXMpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fdGltZW91dDtcbiAgaWYgKCdzdHJpbmcnID09IHR5cGVvZiBtcykgbXMgPSBtaWxsaXNlY29uZHMobXMpO1xuICBkZWJ1ZygndGltZW91dCAlZCcsIG1zKTtcbiAgdGhpcy5fdGltZW91dCA9IG1zO1xuICBpZiAodGhpcy50aW1lcikgdGhpcy5yZXNldFRpbWVvdXQoKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCAmIGdldCBzbG93IGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ8U3RyaW5nfSBtc1xuICogQHJldHVybiB7UnVubmFibGV8TnVtYmVyfSBtcyBvciBzZWxmXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uYWJsZS5wcm90b3R5cGUuc2xvdyA9IGZ1bmN0aW9uKG1zKXtcbiAgaWYgKDAgPT09IGFyZ3VtZW50cy5sZW5ndGgpIHJldHVybiB0aGlzLl9zbG93O1xuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIG1zKSBtcyA9IG1pbGxpc2Vjb25kcyhtcyk7XG4gIGRlYnVnKCd0aW1lb3V0ICVkJywgbXMpO1xuICB0aGlzLl9zbG93ID0gbXM7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgYW5kICYgZ2V0IHRpbWVvdXQgYGVuYWJsZWRgLlxuICpcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlZFxuICogQHJldHVybiB7UnVubmFibGV8Qm9vbGVhbn0gZW5hYmxlZCBvciBzZWxmXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uYWJsZS5wcm90b3R5cGUuZW5hYmxlVGltZW91dHMgPSBmdW5jdGlvbihlbmFibGVkKXtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHJldHVybiB0aGlzLl9lbmFibGVUaW1lb3V0cztcbiAgZGVidWcoJ2VuYWJsZVRpbWVvdXRzICVzJywgZW5hYmxlZCk7XG4gIHRoaXMuX2VuYWJsZVRpbWVvdXRzID0gZW5hYmxlZDtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJldHVybiB0aGUgZnVsbCB0aXRsZSBnZW5lcmF0ZWQgYnkgcmVjdXJzaXZlbHlcbiAqIGNvbmNhdGVuYXRpbmcgdGhlIHBhcmVudCdzIGZ1bGwgdGl0bGUuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SdW5uYWJsZS5wcm90b3R5cGUuZnVsbFRpdGxlID0gZnVuY3Rpb24oKXtcbiAgcmV0dXJuIHRoaXMucGFyZW50LmZ1bGxUaXRsZSgpICsgJyAnICsgdGhpcy50aXRsZTtcbn07XG5cbi8qKlxuICogQ2xlYXIgdGhlIHRpbWVvdXQuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmFibGUucHJvdG90eXBlLmNsZWFyVGltZW91dCA9IGZ1bmN0aW9uKCl7XG4gIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKTtcbn07XG5cbi8qKlxuICogSW5zcGVjdCB0aGUgcnVubmFibGUgdm9pZCBvZiBwcml2YXRlIHByb3BlcnRpZXMuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmFibGUucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbigpe1xuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodGhpcywgZnVuY3Rpb24oa2V5LCB2YWwpe1xuICAgIGlmICgnXycgPT0ga2V5WzBdKSByZXR1cm47XG4gICAgaWYgKCdwYXJlbnQnID09IGtleSkgcmV0dXJuICcjPFN1aXRlPic7XG4gICAgaWYgKCdjdHgnID09IGtleSkgcmV0dXJuICcjPENvbnRleHQ+JztcbiAgICByZXR1cm4gdmFsO1xuICB9LCAyKTtcbn07XG5cbi8qKlxuICogUmVzZXQgdGhlIHRpbWVvdXQuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmFibGUucHJvdG90eXBlLnJlc2V0VGltZW91dCA9IGZ1bmN0aW9uKCl7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIG1zID0gdGhpcy50aW1lb3V0KCkgfHwgMWU5O1xuXG4gIGlmICghdGhpcy5fZW5hYmxlVGltZW91dHMpIHJldHVybjtcbiAgdGhpcy5jbGVhclRpbWVvdXQoKTtcbiAgdGhpcy50aW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICBzZWxmLmNhbGxiYWNrKG5ldyBFcnJvcigndGltZW91dCBvZiAnICsgbXMgKyAnbXMgZXhjZWVkZWQnKSk7XG4gICAgc2VsZi50aW1lZE91dCA9IHRydWU7XG4gIH0sIG1zKTtcbn07XG5cbi8qKlxuICogV2hpdGVsaXN0IHRoZXNlIGdsb2JhbHMgZm9yIHRoaXMgdGVzdCBydW5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuUnVubmFibGUucHJvdG90eXBlLmdsb2JhbHMgPSBmdW5jdGlvbihhcnIpe1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHRoaXMuX2FsbG93ZWRHbG9iYWxzID0gYXJyO1xufTtcblxuLyoqXG4gKiBSdW4gdGhlIHRlc3QgYW5kIGludm9rZSBgZm4oZXJyKWAuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5hYmxlLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbihmbil7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhcnQgPSBuZXcgRGF0ZVxuICAgICwgY3R4ID0gdGhpcy5jdHhcbiAgICAsIGZpbmlzaGVkXG4gICAgLCBlbWl0dGVkO1xuXG4gIC8vIFNvbWUgdGltZXMgdGhlIGN0eCBleGlzdHMgYnV0IGl0IGlzIG5vdCBydW5uYWJsZVxuICBpZiAoY3R4ICYmIGN0eC5ydW5uYWJsZSkgY3R4LnJ1bm5hYmxlKHRoaXMpO1xuXG4gIC8vIGNhbGxlZCBtdWx0aXBsZSB0aW1lc1xuICBmdW5jdGlvbiBtdWx0aXBsZShlcnIpIHtcbiAgICBpZiAoZW1pdHRlZCkgcmV0dXJuO1xuICAgIGVtaXR0ZWQgPSB0cnVlO1xuICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIgfHwgbmV3IEVycm9yKCdkb25lKCkgY2FsbGVkIG11bHRpcGxlIHRpbWVzJykpO1xuICB9XG5cbiAgLy8gZmluaXNoZWRcbiAgZnVuY3Rpb24gZG9uZShlcnIpIHtcbiAgICB2YXIgbXMgPSBzZWxmLnRpbWVvdXQoKTtcbiAgICBpZiAoc2VsZi50aW1lZE91dCkgcmV0dXJuO1xuICAgIGlmIChmaW5pc2hlZCkgcmV0dXJuIG11bHRpcGxlKGVycik7XG4gICAgc2VsZi5jbGVhclRpbWVvdXQoKTtcbiAgICBzZWxmLmR1cmF0aW9uID0gbmV3IERhdGUgLSBzdGFydDtcbiAgICBmaW5pc2hlZCA9IHRydWU7XG4gICAgaWYgKCFlcnIgJiYgc2VsZi5kdXJhdGlvbiA+IG1zICYmIHNlbGYuX2VuYWJsZVRpbWVvdXRzKSBlcnIgPSBuZXcgRXJyb3IoJ3RpbWVvdXQgb2YgJyArIG1zICsgJ21zIGV4Y2VlZGVkJyk7XG4gICAgZm4oZXJyKTtcbiAgfVxuXG4gIC8vIGZvciAucmVzZXRUaW1lb3V0KClcbiAgdGhpcy5jYWxsYmFjayA9IGRvbmU7XG5cbiAgLy8gZXhwbGljaXQgYXN5bmMgd2l0aCBgZG9uZWAgYXJndW1lbnRcbiAgaWYgKHRoaXMuYXN5bmMpIHtcbiAgICB0aGlzLnJlc2V0VGltZW91dCgpO1xuXG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZm4uY2FsbChjdHgsIGZ1bmN0aW9uKGVycil7XG4gICAgICAgIGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvciB8fCB0b1N0cmluZy5jYWxsKGVycikgPT09IFwiW29iamVjdCBFcnJvcl1cIikgcmV0dXJuIGRvbmUoZXJyKTtcbiAgICAgICAgaWYgKG51bGwgIT0gZXJyKSB7XG4gICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChlcnIpID09PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICAgICAgcmV0dXJuIGRvbmUobmV3IEVycm9yKCdkb25lKCkgaW52b2tlZCB3aXRoIG5vbi1FcnJvcjogJyArIEpTT04uc3RyaW5naWZ5KGVycikpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGRvbmUobmV3IEVycm9yKCdkb25lKCkgaW52b2tlZCB3aXRoIG5vbi1FcnJvcjogJyArIGVycikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBkb25lKCk7XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGRvbmUoZXJyKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuYXN5bmNPbmx5KSB7XG4gICAgcmV0dXJuIGRvbmUobmV3IEVycm9yKCctLWFzeW5jLW9ubHkgb3B0aW9uIGluIHVzZSB3aXRob3V0IGRlY2xhcmluZyBgZG9uZSgpYCcpKTtcbiAgfVxuXG4gIC8vIHN5bmMgb3IgcHJvbWlzZS1yZXR1cm5pbmdcbiAgdHJ5IHtcbiAgICBpZiAodGhpcy5wZW5kaW5nKSB7XG4gICAgICBkb25lKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNhbGxGbih0aGlzLmZuKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGRvbmUoZXJyKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNhbGxGbihmbikge1xuICAgIHZhciByZXN1bHQgPSBmbi5jYWxsKGN0eCk7XG4gICAgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0LnRoZW4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHNlbGYucmVzZXRUaW1lb3V0KCk7XG4gICAgICByZXN1bHRcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgZG9uZSgpXG4gICAgICAgIH0sXG4gICAgICAgIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgIGRvbmUocmVhc29uIHx8IG5ldyBFcnJvcignUHJvbWlzZSByZWplY3RlZCB3aXRoIG5vIG9yIGZhbHN5IHJlYXNvbicpKVxuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgZG9uZSgpO1xuICAgIH1cbiAgfVxufTtcblxufSk7IC8vIG1vZHVsZTogcnVubmFibGUuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJ1bm5lci5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdicm93c2VyL2V2ZW50cycpLkV2ZW50RW1pdHRlclxuICAsIGRlYnVnID0gcmVxdWlyZSgnYnJvd3Nlci9kZWJ1ZycpKCdtb2NoYTpydW5uZXInKVxuICAsIFRlc3QgPSByZXF1aXJlKCcuL3Rlc3QnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpXG4gICwgZmlsdGVyID0gdXRpbHMuZmlsdGVyXG4gICwga2V5cyA9IHV0aWxzLmtleXM7XG5cbi8qKlxuICogTm9uLWVudW1lcmFibGUgZ2xvYmFscy5cbiAqL1xuXG52YXIgZ2xvYmFscyA9IFtcbiAgJ3NldFRpbWVvdXQnLFxuICAnY2xlYXJUaW1lb3V0JyxcbiAgJ3NldEludGVydmFsJyxcbiAgJ2NsZWFySW50ZXJ2YWwnLFxuICAnWE1MSHR0cFJlcXVlc3QnLFxuICAnRGF0ZSdcbl07XG5cbi8qKlxuICogRXhwb3NlIGBSdW5uZXJgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gUnVubmVyO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBgUnVubmVyYCBmb3IgdGhlIGdpdmVuIGBzdWl0ZWAuXG4gKlxuICogRXZlbnRzOlxuICpcbiAqICAgLSBgc3RhcnRgICBleGVjdXRpb24gc3RhcnRlZFxuICogICAtIGBlbmRgICBleGVjdXRpb24gY29tcGxldGVcbiAqICAgLSBgc3VpdGVgICAoc3VpdGUpIHRlc3Qgc3VpdGUgZXhlY3V0aW9uIHN0YXJ0ZWRcbiAqICAgLSBgc3VpdGUgZW5kYCAgKHN1aXRlKSBhbGwgdGVzdHMgKGFuZCBzdWItc3VpdGVzKSBoYXZlIGZpbmlzaGVkXG4gKiAgIC0gYHRlc3RgICAodGVzdCkgdGVzdCBleGVjdXRpb24gc3RhcnRlZFxuICogICAtIGB0ZXN0IGVuZGAgICh0ZXN0KSB0ZXN0IGNvbXBsZXRlZFxuICogICAtIGBob29rYCAgKGhvb2spIGhvb2sgZXhlY3V0aW9uIHN0YXJ0ZWRcbiAqICAgLSBgaG9vayBlbmRgICAoaG9vaykgaG9vayBjb21wbGV0ZVxuICogICAtIGBwYXNzYCAgKHRlc3QpIHRlc3QgcGFzc2VkXG4gKiAgIC0gYGZhaWxgICAodGVzdCwgZXJyKSB0ZXN0IGZhaWxlZFxuICogICAtIGBwZW5kaW5nYCAgKHRlc3QpIHRlc3QgcGVuZGluZ1xuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gUnVubmVyKHN1aXRlKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdGhpcy5fZ2xvYmFscyA9IFtdO1xuICB0aGlzLl9hYm9ydCA9IGZhbHNlO1xuICB0aGlzLnN1aXRlID0gc3VpdGU7XG4gIHRoaXMudG90YWwgPSBzdWl0ZS50b3RhbCgpO1xuICB0aGlzLmZhaWx1cmVzID0gMDtcbiAgdGhpcy5vbigndGVzdCBlbmQnLCBmdW5jdGlvbih0ZXN0KXsgc2VsZi5jaGVja0dsb2JhbHModGVzdCk7IH0pO1xuICB0aGlzLm9uKCdob29rIGVuZCcsIGZ1bmN0aW9uKGhvb2speyBzZWxmLmNoZWNrR2xvYmFscyhob29rKTsgfSk7XG4gIHRoaXMuZ3JlcCgvLiovKTtcbiAgdGhpcy5nbG9iYWxzKHRoaXMuZ2xvYmFsUHJvcHMoKS5jb25jYXQoZXh0cmFHbG9iYWxzKCkpKTtcbn1cblxuLyoqXG4gKiBXcmFwcGVyIGZvciBzZXRJbW1lZGlhdGUsIHByb2Nlc3MubmV4dFRpY2ssIG9yIGJyb3dzZXIgcG9seWZpbGwuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5pbW1lZGlhdGVseSA9IGdsb2JhbC5zZXRJbW1lZGlhdGUgfHwgcHJvY2Vzcy5uZXh0VGljaztcblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEV2ZW50RW1pdHRlci5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlO1xuUnVubmVyLnByb3RvdHlwZSA9IG5ldyBGO1xuUnVubmVyLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFJ1bm5lcjtcblxuXG4vKipcbiAqIFJ1biB0ZXN0cyB3aXRoIGZ1bGwgdGl0bGVzIG1hdGNoaW5nIGByZWAuIFVwZGF0ZXMgcnVubmVyLnRvdGFsXG4gKiB3aXRoIG51bWJlciBvZiB0ZXN0cyBtYXRjaGVkLlxuICpcbiAqIEBwYXJhbSB7UmVnRXhwfSByZVxuICogQHBhcmFtIHtCb29sZWFufSBpbnZlcnRcbiAqIEByZXR1cm4ge1J1bm5lcn0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJ1bm5lci5wcm90b3R5cGUuZ3JlcCA9IGZ1bmN0aW9uKHJlLCBpbnZlcnQpe1xuICBkZWJ1ZygnZ3JlcCAlcycsIHJlKTtcbiAgdGhpcy5fZ3JlcCA9IHJlO1xuICB0aGlzLl9pbnZlcnQgPSBpbnZlcnQ7XG4gIHRoaXMudG90YWwgPSB0aGlzLmdyZXBUb3RhbCh0aGlzLnN1aXRlKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIG51bWJlciBvZiB0ZXN0cyBtYXRjaGluZyB0aGUgZ3JlcCBzZWFyY2ggZm9yIHRoZVxuICogZ2l2ZW4gc3VpdGUuXG4gKlxuICogQHBhcmFtIHtTdWl0ZX0gc3VpdGVcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ncmVwVG90YWwgPSBmdW5jdGlvbihzdWl0ZSkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHZhciB0b3RhbCA9IDA7XG5cbiAgc3VpdGUuZWFjaFRlc3QoZnVuY3Rpb24odGVzdCl7XG4gICAgdmFyIG1hdGNoID0gc2VsZi5fZ3JlcC50ZXN0KHRlc3QuZnVsbFRpdGxlKCkpO1xuICAgIGlmIChzZWxmLl9pbnZlcnQpIG1hdGNoID0gIW1hdGNoO1xuICAgIGlmIChtYXRjaCkgdG90YWwrKztcbiAgfSk7XG5cbiAgcmV0dXJuIHRvdGFsO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYSBsaXN0IG9mIGdsb2JhbCBwcm9wZXJ0aWVzLlxuICpcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5nbG9iYWxQcm9wcyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcHJvcHMgPSB1dGlscy5rZXlzKGdsb2JhbCk7XG5cbiAgLy8gbm9uLWVudW1lcmFibGVzXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZ2xvYmFscy5sZW5ndGg7ICsraSkge1xuICAgIGlmICh+dXRpbHMuaW5kZXhPZihwcm9wcywgZ2xvYmFsc1tpXSkpIGNvbnRpbnVlO1xuICAgIHByb3BzLnB1c2goZ2xvYmFsc1tpXSk7XG4gIH1cblxuICByZXR1cm4gcHJvcHM7XG59O1xuXG4vKipcbiAqIEFsbG93IHRoZSBnaXZlbiBgYXJyYCBvZiBnbG9iYWxzLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGFyclxuICogQHJldHVybiB7UnVubmVyfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5nbG9iYWxzID0gZnVuY3Rpb24oYXJyKXtcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX2dsb2JhbHM7XG4gIGRlYnVnKCdnbG9iYWxzICVqJywgYXJyKTtcbiAgdGhpcy5fZ2xvYmFscyA9IHRoaXMuX2dsb2JhbHMuY29uY2F0KGFycik7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBDaGVjayBmb3IgZ2xvYmFsIHZhcmlhYmxlIGxlYWtzLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUuY2hlY2tHbG9iYWxzID0gZnVuY3Rpb24odGVzdCl7XG4gIGlmICh0aGlzLmlnbm9yZUxlYWtzKSByZXR1cm47XG4gIHZhciBvayA9IHRoaXMuX2dsb2JhbHM7XG5cbiAgdmFyIGdsb2JhbHMgPSB0aGlzLmdsb2JhbFByb3BzKCk7XG4gIHZhciBsZWFrcztcblxuICBpZiAodGVzdCkge1xuICAgIG9rID0gb2suY29uY2F0KHRlc3QuX2FsbG93ZWRHbG9iYWxzIHx8IFtdKTtcbiAgfVxuXG4gIGlmKHRoaXMucHJldkdsb2JhbHNMZW5ndGggPT0gZ2xvYmFscy5sZW5ndGgpIHJldHVybjtcbiAgdGhpcy5wcmV2R2xvYmFsc0xlbmd0aCA9IGdsb2JhbHMubGVuZ3RoO1xuXG4gIGxlYWtzID0gZmlsdGVyTGVha3Mob2ssIGdsb2JhbHMpO1xuICB0aGlzLl9nbG9iYWxzID0gdGhpcy5fZ2xvYmFscy5jb25jYXQobGVha3MpO1xuXG4gIGlmIChsZWFrcy5sZW5ndGggPiAxKSB7XG4gICAgdGhpcy5mYWlsKHRlc3QsIG5ldyBFcnJvcignZ2xvYmFsIGxlYWtzIGRldGVjdGVkOiAnICsgbGVha3Muam9pbignLCAnKSArICcnKSk7XG4gIH0gZWxzZSBpZiAobGVha3MubGVuZ3RoKSB7XG4gICAgdGhpcy5mYWlsKHRlc3QsIG5ldyBFcnJvcignZ2xvYmFsIGxlYWsgZGV0ZWN0ZWQ6ICcgKyBsZWFrc1swXSkpO1xuICB9XG59O1xuXG4vKipcbiAqIEZhaWwgdGhlIGdpdmVuIGB0ZXN0YC5cbiAqXG4gKiBAcGFyYW0ge1Rlc3R9IHRlc3RcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5mYWlsID0gZnVuY3Rpb24odGVzdCwgZXJyKXtcbiAgKyt0aGlzLmZhaWx1cmVzO1xuICB0ZXN0LnN0YXRlID0gJ2ZhaWxlZCc7XG5cbiAgaWYgKCdzdHJpbmcnID09IHR5cGVvZiBlcnIpIHtcbiAgICBlcnIgPSBuZXcgRXJyb3IoJ3RoZSBzdHJpbmcgXCInICsgZXJyICsgJ1wiIHdhcyB0aHJvd24sIHRocm93IGFuIEVycm9yIDopJyk7XG4gIH1cblxuICB0aGlzLmVtaXQoJ2ZhaWwnLCB0ZXN0LCBlcnIpO1xufTtcblxuLyoqXG4gKiBGYWlsIHRoZSBnaXZlbiBgaG9va2Agd2l0aCBgZXJyYC5cbiAqXG4gKiBIb29rIGZhaWx1cmVzIHdvcmsgaW4gdGhlIGZvbGxvd2luZyBwYXR0ZXJuOlxuICogLSBJZiBiYWlsLCB0aGVuIGV4aXRcbiAqIC0gRmFpbGVkIGBiZWZvcmVgIGhvb2sgc2tpcHMgYWxsIHRlc3RzIGluIGEgc3VpdGUgYW5kIHN1YnN1aXRlcyxcbiAqICAgYnV0IGp1bXBzIHRvIGNvcnJlc3BvbmRpbmcgYGFmdGVyYCBob29rXG4gKiAtIEZhaWxlZCBgYmVmb3JlIGVhY2hgIGhvb2sgc2tpcHMgcmVtYWluaW5nIHRlc3RzIGluIGFcbiAqICAgc3VpdGUgYW5kIGp1bXBzIHRvIGNvcnJlc3BvbmRpbmcgYGFmdGVyIGVhY2hgIGhvb2ssXG4gKiAgIHdoaWNoIGlzIHJ1biBvbmx5IG9uY2VcbiAqIC0gRmFpbGVkIGBhZnRlcmAgaG9vayBkb2VzIG5vdCBhbHRlclxuICogICBleGVjdXRpb24gb3JkZXJcbiAqIC0gRmFpbGVkIGBhZnRlciBlYWNoYCBob29rIHNraXBzIHJlbWFpbmluZyB0ZXN0cyBpbiBhXG4gKiAgIHN1aXRlIGFuZCBzdWJzdWl0ZXMsIGJ1dCBleGVjdXRlcyBvdGhlciBgYWZ0ZXIgZWFjaGBcbiAqICAgaG9va3NcbiAqXG4gKiBAcGFyYW0ge0hvb2t9IGhvb2tcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5mYWlsSG9vayA9IGZ1bmN0aW9uKGhvb2ssIGVycil7XG4gIHRoaXMuZmFpbChob29rLCBlcnIpO1xuICBpZiAodGhpcy5zdWl0ZS5iYWlsKCkpIHtcbiAgICB0aGlzLmVtaXQoJ2VuZCcpO1xuICB9XG59O1xuXG4vKipcbiAqIFJ1biBob29rIGBuYW1lYCBjYWxsYmFja3MgYW5kIHRoZW4gaW52b2tlIGBmbigpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuY3Rpb25cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUuaG9vayA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgdmFyIHN1aXRlID0gdGhpcy5zdWl0ZVxuICAgICwgaG9va3MgPSBzdWl0ZVsnXycgKyBuYW1lXVxuICAgICwgc2VsZiA9IHRoaXNcbiAgICAsIHRpbWVyO1xuXG4gIGZ1bmN0aW9uIG5leHQoaSkge1xuICAgIHZhciBob29rID0gaG9va3NbaV07XG4gICAgaWYgKCFob29rKSByZXR1cm4gZm4oKTtcbiAgICBpZiAoc2VsZi5mYWlsdXJlcyAmJiBzdWl0ZS5iYWlsKCkpIHJldHVybiBmbigpO1xuICAgIHNlbGYuY3VycmVudFJ1bm5hYmxlID0gaG9vaztcblxuICAgIGhvb2suY3R4LmN1cnJlbnRUZXN0ID0gc2VsZi50ZXN0O1xuXG4gICAgc2VsZi5lbWl0KCdob29rJywgaG9vayk7XG5cbiAgICBob29rLm9uKCdlcnJvcicsIGZ1bmN0aW9uKGVycil7XG4gICAgICBzZWxmLmZhaWxIb29rKGhvb2ssIGVycik7XG4gICAgfSk7XG5cbiAgICBob29rLnJ1bihmdW5jdGlvbihlcnIpe1xuICAgICAgaG9vay5yZW1vdmVBbGxMaXN0ZW5lcnMoJ2Vycm9yJyk7XG4gICAgICB2YXIgdGVzdEVycm9yID0gaG9vay5lcnJvcigpO1xuICAgICAgaWYgKHRlc3RFcnJvcikgc2VsZi5mYWlsKHNlbGYudGVzdCwgdGVzdEVycm9yKTtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgc2VsZi5mYWlsSG9vayhob29rLCBlcnIpO1xuXG4gICAgICAgIC8vIHN0b3AgZXhlY3V0aW5nIGhvb2tzLCBub3RpZnkgY2FsbGVlIG9mIGhvb2sgZXJyXG4gICAgICAgIHJldHVybiBmbihlcnIpO1xuICAgICAgfVxuICAgICAgc2VsZi5lbWl0KCdob29rIGVuZCcsIGhvb2spO1xuICAgICAgZGVsZXRlIGhvb2suY3R4LmN1cnJlbnRUZXN0O1xuICAgICAgbmV4dCgrK2kpO1xuICAgIH0pO1xuICB9XG5cbiAgUnVubmVyLmltbWVkaWF0ZWx5KGZ1bmN0aW9uKCl7XG4gICAgbmV4dCgwKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIFJ1biBob29rIGBuYW1lYCBmb3IgdGhlIGdpdmVuIGFycmF5IG9mIGBzdWl0ZXNgXG4gKiBpbiBvcmRlciwgYW5kIGNhbGxiYWNrIGBmbihlcnIsIGVyclN1aXRlKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEBwYXJhbSB7QXJyYXl9IHN1aXRlc1xuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUuaG9va3MgPSBmdW5jdGlvbihuYW1lLCBzdWl0ZXMsIGZuKXtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBvcmlnID0gdGhpcy5zdWl0ZTtcblxuICBmdW5jdGlvbiBuZXh0KHN1aXRlKSB7XG4gICAgc2VsZi5zdWl0ZSA9IHN1aXRlO1xuXG4gICAgaWYgKCFzdWl0ZSkge1xuICAgICAgc2VsZi5zdWl0ZSA9IG9yaWc7XG4gICAgICByZXR1cm4gZm4oKTtcbiAgICB9XG5cbiAgICBzZWxmLmhvb2sobmFtZSwgZnVuY3Rpb24oZXJyKXtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgdmFyIGVyclN1aXRlID0gc2VsZi5zdWl0ZTtcbiAgICAgICAgc2VsZi5zdWl0ZSA9IG9yaWc7XG4gICAgICAgIHJldHVybiBmbihlcnIsIGVyclN1aXRlKTtcbiAgICAgIH1cblxuICAgICAgbmV4dChzdWl0ZXMucG9wKCkpO1xuICAgIH0pO1xuICB9XG5cbiAgbmV4dChzdWl0ZXMucG9wKCkpO1xufTtcblxuLyoqXG4gKiBSdW4gaG9va3MgZnJvbSB0aGUgdG9wIGxldmVsIGRvd24uXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLmhvb2tVcCA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgdmFyIHN1aXRlcyA9IFt0aGlzLnN1aXRlXS5jb25jYXQodGhpcy5wYXJlbnRzKCkpLnJldmVyc2UoKTtcbiAgdGhpcy5ob29rcyhuYW1lLCBzdWl0ZXMsIGZuKTtcbn07XG5cbi8qKlxuICogUnVuIGhvb2tzIGZyb20gdGhlIGJvdHRvbSB1cC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUuaG9va0Rvd24gPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gIHZhciBzdWl0ZXMgPSBbdGhpcy5zdWl0ZV0uY29uY2F0KHRoaXMucGFyZW50cygpKTtcbiAgdGhpcy5ob29rcyhuYW1lLCBzdWl0ZXMsIGZuKTtcbn07XG5cbi8qKlxuICogUmV0dXJuIGFuIGFycmF5IG9mIHBhcmVudCBTdWl0ZXMgZnJvbVxuICogY2xvc2VzdCB0byBmdXJ0aGVzdC5cbiAqXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUucGFyZW50cyA9IGZ1bmN0aW9uKCl7XG4gIHZhciBzdWl0ZSA9IHRoaXMuc3VpdGVcbiAgICAsIHN1aXRlcyA9IFtdO1xuICB3aGlsZSAoc3VpdGUgPSBzdWl0ZS5wYXJlbnQpIHN1aXRlcy5wdXNoKHN1aXRlKTtcbiAgcmV0dXJuIHN1aXRlcztcbn07XG5cbi8qKlxuICogUnVuIHRoZSBjdXJyZW50IHRlc3QgYW5kIGNhbGxiYWNrIGBmbihlcnIpYC5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ydW5UZXN0ID0gZnVuY3Rpb24oZm4pe1xuICB2YXIgdGVzdCA9IHRoaXMudGVzdFxuICAgICwgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKHRoaXMuYXN5bmNPbmx5KSB0ZXN0LmFzeW5jT25seSA9IHRydWU7XG5cbiAgdHJ5IHtcbiAgICB0ZXN0Lm9uKCdlcnJvcicsIGZ1bmN0aW9uKGVycil7XG4gICAgICBzZWxmLmZhaWwodGVzdCwgZXJyKTtcbiAgICB9KTtcbiAgICB0ZXN0LnJ1bihmbik7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGZuKGVycik7XG4gIH1cbn07XG5cbi8qKlxuICogUnVuIHRlc3RzIGluIHRoZSBnaXZlbiBgc3VpdGVgIGFuZCBpbnZva2VcbiAqIHRoZSBjYWxsYmFjayBgZm4oKWAgd2hlbiBjb21wbGV0ZS5cbiAqXG4gKiBAcGFyYW0ge1N1aXRlfSBzdWl0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUucnVuVGVzdHMgPSBmdW5jdGlvbihzdWl0ZSwgZm4pe1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHRlc3RzID0gc3VpdGUudGVzdHMuc2xpY2UoKVxuICAgICwgdGVzdDtcblxuXG4gIGZ1bmN0aW9uIGhvb2tFcnIoZXJyLCBlcnJTdWl0ZSwgYWZ0ZXIpIHtcbiAgICAvLyBiZWZvcmUvYWZ0ZXIgRWFjaCBob29rIGZvciBlcnJTdWl0ZSBmYWlsZWQ6XG4gICAgdmFyIG9yaWcgPSBzZWxmLnN1aXRlO1xuXG4gICAgLy8gZm9yIGZhaWxlZCAnYWZ0ZXIgZWFjaCcgaG9vayBzdGFydCBmcm9tIGVyclN1aXRlIHBhcmVudCxcbiAgICAvLyBvdGhlcndpc2Ugc3RhcnQgZnJvbSBlcnJTdWl0ZSBpdHNlbGZcbiAgICBzZWxmLnN1aXRlID0gYWZ0ZXIgPyBlcnJTdWl0ZS5wYXJlbnQgOiBlcnJTdWl0ZTtcblxuICAgIGlmIChzZWxmLnN1aXRlKSB7XG4gICAgICAvLyBjYWxsIGhvb2tVcCBhZnRlckVhY2hcbiAgICAgIHNlbGYuaG9va1VwKCdhZnRlckVhY2gnLCBmdW5jdGlvbihlcnIyLCBlcnJTdWl0ZTIpIHtcbiAgICAgICAgc2VsZi5zdWl0ZSA9IG9yaWc7XG4gICAgICAgIC8vIHNvbWUgaG9va3MgbWF5IGZhaWwgZXZlbiBub3dcbiAgICAgICAgaWYgKGVycjIpIHJldHVybiBob29rRXJyKGVycjIsIGVyclN1aXRlMiwgdHJ1ZSk7XG4gICAgICAgIC8vIHJlcG9ydCBlcnJvciBzdWl0ZVxuICAgICAgICBmbihlcnJTdWl0ZSk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gdGhlcmUgaXMgbm8gbmVlZCBjYWxsaW5nIG90aGVyICdhZnRlciBlYWNoJyBob29rc1xuICAgICAgc2VsZi5zdWl0ZSA9IG9yaWc7XG4gICAgICBmbihlcnJTdWl0ZSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbmV4dChlcnIsIGVyclN1aXRlKSB7XG4gICAgLy8gaWYgd2UgYmFpbCBhZnRlciBmaXJzdCBlcnJcbiAgICBpZiAoc2VsZi5mYWlsdXJlcyAmJiBzdWl0ZS5fYmFpbCkgcmV0dXJuIGZuKCk7XG5cbiAgICBpZiAoc2VsZi5fYWJvcnQpIHJldHVybiBmbigpO1xuXG4gICAgaWYgKGVycikgcmV0dXJuIGhvb2tFcnIoZXJyLCBlcnJTdWl0ZSwgdHJ1ZSk7XG5cbiAgICAvLyBuZXh0IHRlc3RcbiAgICB0ZXN0ID0gdGVzdHMuc2hpZnQoKTtcblxuICAgIC8vIGFsbCBkb25lXG4gICAgaWYgKCF0ZXN0KSByZXR1cm4gZm4oKTtcblxuICAgIC8vIGdyZXBcbiAgICB2YXIgbWF0Y2ggPSBzZWxmLl9ncmVwLnRlc3QodGVzdC5mdWxsVGl0bGUoKSk7XG4gICAgaWYgKHNlbGYuX2ludmVydCkgbWF0Y2ggPSAhbWF0Y2g7XG4gICAgaWYgKCFtYXRjaCkgcmV0dXJuIG5leHQoKTtcblxuICAgIC8vIHBlbmRpbmdcbiAgICBpZiAodGVzdC5wZW5kaW5nKSB7XG4gICAgICBzZWxmLmVtaXQoJ3BlbmRpbmcnLCB0ZXN0KTtcbiAgICAgIHNlbGYuZW1pdCgndGVzdCBlbmQnLCB0ZXN0KTtcbiAgICAgIHJldHVybiBuZXh0KCk7XG4gICAgfVxuXG4gICAgLy8gZXhlY3V0ZSB0ZXN0IGFuZCBob29rKHMpXG4gICAgc2VsZi5lbWl0KCd0ZXN0Jywgc2VsZi50ZXN0ID0gdGVzdCk7XG4gICAgc2VsZi5ob29rRG93bignYmVmb3JlRWFjaCcsIGZ1bmN0aW9uKGVyciwgZXJyU3VpdGUpe1xuXG4gICAgICBpZiAoZXJyKSByZXR1cm4gaG9va0VycihlcnIsIGVyclN1aXRlLCBmYWxzZSk7XG5cbiAgICAgIHNlbGYuY3VycmVudFJ1bm5hYmxlID0gc2VsZi50ZXN0O1xuICAgICAgc2VsZi5ydW5UZXN0KGZ1bmN0aW9uKGVycil7XG4gICAgICAgIHRlc3QgPSBzZWxmLnRlc3Q7XG5cbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHNlbGYuZmFpbCh0ZXN0LCBlcnIpO1xuICAgICAgICAgIHNlbGYuZW1pdCgndGVzdCBlbmQnLCB0ZXN0KTtcbiAgICAgICAgICByZXR1cm4gc2VsZi5ob29rVXAoJ2FmdGVyRWFjaCcsIG5leHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGVzdC5zdGF0ZSA9ICdwYXNzZWQnO1xuICAgICAgICBzZWxmLmVtaXQoJ3Bhc3MnLCB0ZXN0KTtcbiAgICAgICAgc2VsZi5lbWl0KCd0ZXN0IGVuZCcsIHRlc3QpO1xuICAgICAgICBzZWxmLmhvb2tVcCgnYWZ0ZXJFYWNoJywgbmV4dCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHRoaXMubmV4dCA9IG5leHQ7XG4gIG5leHQoKTtcbn07XG5cbi8qKlxuICogUnVuIHRoZSBnaXZlbiBgc3VpdGVgIGFuZCBpbnZva2UgdGhlXG4gKiBjYWxsYmFjayBgZm4oKWAgd2hlbiBjb21wbGV0ZS5cbiAqXG4gKiBAcGFyYW0ge1N1aXRlfSBzdWl0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUucnVuU3VpdGUgPSBmdW5jdGlvbihzdWl0ZSwgZm4pe1xuICB2YXIgdG90YWwgPSB0aGlzLmdyZXBUb3RhbChzdWl0ZSlcbiAgICAsIHNlbGYgPSB0aGlzXG4gICAgLCBpID0gMDtcblxuICBkZWJ1ZygncnVuIHN1aXRlICVzJywgc3VpdGUuZnVsbFRpdGxlKCkpO1xuXG4gIGlmICghdG90YWwpIHJldHVybiBmbigpO1xuXG4gIHRoaXMuZW1pdCgnc3VpdGUnLCB0aGlzLnN1aXRlID0gc3VpdGUpO1xuXG4gIGZ1bmN0aW9uIG5leHQoZXJyU3VpdGUpIHtcbiAgICBpZiAoZXJyU3VpdGUpIHtcbiAgICAgIC8vIGN1cnJlbnQgc3VpdGUgZmFpbGVkIG9uIGEgaG9vayBmcm9tIGVyclN1aXRlXG4gICAgICBpZiAoZXJyU3VpdGUgPT0gc3VpdGUpIHtcbiAgICAgICAgLy8gaWYgZXJyU3VpdGUgaXMgY3VycmVudCBzdWl0ZVxuICAgICAgICAvLyBjb250aW51ZSB0byB0aGUgbmV4dCBzaWJsaW5nIHN1aXRlXG4gICAgICAgIHJldHVybiBkb25lKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBlcnJTdWl0ZSBpcyBhbW9uZyB0aGUgcGFyZW50cyBvZiBjdXJyZW50IHN1aXRlXG4gICAgICAgIC8vIHN0b3AgZXhlY3V0aW9uIG9mIGVyclN1aXRlIGFuZCBhbGwgc3ViLXN1aXRlc1xuICAgICAgICByZXR1cm4gZG9uZShlcnJTdWl0ZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNlbGYuX2Fib3J0KSByZXR1cm4gZG9uZSgpO1xuXG4gICAgdmFyIGN1cnIgPSBzdWl0ZS5zdWl0ZXNbaSsrXTtcbiAgICBpZiAoIWN1cnIpIHJldHVybiBkb25lKCk7XG4gICAgc2VsZi5ydW5TdWl0ZShjdXJyLCBuZXh0KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRvbmUoZXJyU3VpdGUpIHtcbiAgICBzZWxmLnN1aXRlID0gc3VpdGU7XG4gICAgc2VsZi5ob29rKCdhZnRlckFsbCcsIGZ1bmN0aW9uKCl7XG4gICAgICBzZWxmLmVtaXQoJ3N1aXRlIGVuZCcsIHN1aXRlKTtcbiAgICAgIGZuKGVyclN1aXRlKTtcbiAgICB9KTtcbiAgfVxuXG4gIHRoaXMuaG9vaygnYmVmb3JlQWxsJywgZnVuY3Rpb24oZXJyKXtcbiAgICBpZiAoZXJyKSByZXR1cm4gZG9uZSgpO1xuICAgIHNlbGYucnVuVGVzdHMoc3VpdGUsIG5leHQpO1xuICB9KTtcbn07XG5cbi8qKlxuICogSGFuZGxlIHVuY2F1Z2h0IGV4Y2VwdGlvbnMuXG4gKlxuICogQHBhcmFtIHtFcnJvcn0gZXJyXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLnVuY2F1Z2h0ID0gZnVuY3Rpb24oZXJyKXtcbiAgaWYgKGVycikge1xuICAgIGRlYnVnKCd1bmNhdWdodCBleGNlcHRpb24gJXMnLCBlcnIubWVzc2FnZSk7XG4gIH0gZWxzZSB7XG4gICAgZGVidWcoJ3VuY2F1Z2h0IHVuZGVmaW5lZCBleGNlcHRpb24nKTtcbiAgICBlcnIgPSBuZXcgRXJyb3IoJ0NhdGNoZWQgdW5kZWZpbmVkIGVycm9yLCBkaWQgeW91IHRocm93IHdpdGhvdXQgc3BlY2lmeWluZyB3aGF0PycpO1xuICB9XG4gIFxuICB2YXIgcnVubmFibGUgPSB0aGlzLmN1cnJlbnRSdW5uYWJsZTtcbiAgaWYgKCFydW5uYWJsZSB8fCAnZmFpbGVkJyA9PSBydW5uYWJsZS5zdGF0ZSkgcmV0dXJuO1xuICBydW5uYWJsZS5jbGVhclRpbWVvdXQoKTtcbiAgZXJyLnVuY2F1Z2h0ID0gdHJ1ZTtcbiAgdGhpcy5mYWlsKHJ1bm5hYmxlLCBlcnIpO1xuXG4gIC8vIHJlY292ZXIgZnJvbSB0ZXN0XG4gIGlmICgndGVzdCcgPT0gcnVubmFibGUudHlwZSkge1xuICAgIHRoaXMuZW1pdCgndGVzdCBlbmQnLCBydW5uYWJsZSk7XG4gICAgdGhpcy5ob29rVXAoJ2FmdGVyRWFjaCcsIHRoaXMubmV4dCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gYmFpbCBvbiBob29rc1xuICB0aGlzLmVtaXQoJ2VuZCcpO1xufTtcblxuLyoqXG4gKiBSdW4gdGhlIHJvb3Qgc3VpdGUgYW5kIGludm9rZSBgZm4oZmFpbHVyZXMpYFxuICogb24gY29tcGxldGlvbi5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UnVubmVyfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbihmbil7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgZm4gPSBmbiB8fCBmdW5jdGlvbigpe307XG5cbiAgZnVuY3Rpb24gdW5jYXVnaHQoZXJyKXtcbiAgICBzZWxmLnVuY2F1Z2h0KGVycik7XG4gIH1cblxuICBkZWJ1Zygnc3RhcnQnKTtcblxuICAvLyBjYWxsYmFja1xuICB0aGlzLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIGRlYnVnKCdlbmQnKTtcbiAgICBwcm9jZXNzLnJlbW92ZUxpc3RlbmVyKCd1bmNhdWdodEV4Y2VwdGlvbicsIHVuY2F1Z2h0KTtcbiAgICBmbihzZWxmLmZhaWx1cmVzKTtcbiAgfSk7XG5cbiAgLy8gcnVuIHN1aXRlc1xuICB0aGlzLmVtaXQoJ3N0YXJ0Jyk7XG4gIHRoaXMucnVuU3VpdGUodGhpcy5zdWl0ZSwgZnVuY3Rpb24oKXtcbiAgICBkZWJ1ZygnZmluaXNoZWQgcnVubmluZycpO1xuICAgIHNlbGYuZW1pdCgnZW5kJyk7XG4gIH0pO1xuXG4gIC8vIHVuY2F1Z2h0IGV4Y2VwdGlvblxuICBwcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIHVuY2F1Z2h0KTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQ2xlYW5seSBhYm9ydCBleGVjdXRpb25cbiAqXG4gKiBAcmV0dXJuIHtSdW5uZXJ9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuUnVubmVyLnByb3RvdHlwZS5hYm9ydCA9IGZ1bmN0aW9uKCl7XG4gIGRlYnVnKCdhYm9ydGluZycpO1xuICB0aGlzLl9hYm9ydCA9IHRydWU7XG59XG5cbi8qKlxuICogRmlsdGVyIGxlYWtzIHdpdGggdGhlIGdpdmVuIGdsb2JhbHMgZmxhZ2dlZCBhcyBgb2tgLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IG9rXG4gKiBAcGFyYW0ge0FycmF5fSBnbG9iYWxzXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGZpbHRlckxlYWtzKG9rLCBnbG9iYWxzKSB7XG4gIHJldHVybiBmaWx0ZXIoZ2xvYmFscywgZnVuY3Rpb24oa2V5KXtcbiAgICAvLyBGaXJlZm94IGFuZCBDaHJvbWUgZXhwb3NlcyBpZnJhbWVzIGFzIGluZGV4IGluc2lkZSB0aGUgd2luZG93IG9iamVjdFxuICAgIGlmICgvXmQrLy50ZXN0KGtleSkpIHJldHVybiBmYWxzZTtcblxuICAgIC8vIGluIGZpcmVmb3hcbiAgICAvLyBpZiBydW5uZXIgcnVucyBpbiBhbiBpZnJhbWUsIHRoaXMgaWZyYW1lJ3Mgd2luZG93LmdldEludGVyZmFjZSBtZXRob2Qgbm90IGluaXQgYXQgZmlyc3RcbiAgICAvLyBpdCBpcyBhc3NpZ25lZCBpbiBzb21lIHNlY29uZHNcbiAgICBpZiAoZ2xvYmFsLm5hdmlnYXRvciAmJiAvXmdldEludGVyZmFjZS8udGVzdChrZXkpKSByZXR1cm4gZmFsc2U7XG5cbiAgICAvLyBhbiBpZnJhbWUgY291bGQgYmUgYXBwcm9hY2hlZCBieSB3aW5kb3dbaWZyYW1lSW5kZXhdXG4gICAgLy8gaW4gaWU2LDcsOCBhbmQgb3BlcmEsIGlmcmFtZUluZGV4IGlzIGVudW1lcmFibGUsIHRoaXMgY291bGQgY2F1c2UgbGVha1xuICAgIGlmIChnbG9iYWwubmF2aWdhdG9yICYmIC9eXFxkKy8udGVzdChrZXkpKSByZXR1cm4gZmFsc2U7XG5cbiAgICAvLyBPcGVyYSBhbmQgSUUgZXhwb3NlIGdsb2JhbCB2YXJpYWJsZXMgZm9yIEhUTUwgZWxlbWVudCBJRHMgKGlzc3VlICMyNDMpXG4gICAgaWYgKC9ebW9jaGEtLy50ZXN0KGtleSkpIHJldHVybiBmYWxzZTtcblxuICAgIHZhciBtYXRjaGVkID0gZmlsdGVyKG9rLCBmdW5jdGlvbihvayl7XG4gICAgICBpZiAofm9rLmluZGV4T2YoJyonKSkgcmV0dXJuIDAgPT0ga2V5LmluZGV4T2Yob2suc3BsaXQoJyonKVswXSk7XG4gICAgICByZXR1cm4ga2V5ID09IG9rO1xuICAgIH0pO1xuICAgIHJldHVybiBtYXRjaGVkLmxlbmd0aCA9PSAwICYmICghZ2xvYmFsLm5hdmlnYXRvciB8fCAnb25lcnJvcicgIT09IGtleSk7XG4gIH0pO1xufVxuXG4vKipcbiAqIEFycmF5IG9mIGdsb2JhbHMgZGVwZW5kZW50IG9uIHRoZSBlbnZpcm9ubWVudC5cbiAqXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbiBmdW5jdGlvbiBleHRyYUdsb2JhbHMoKSB7XG4gIGlmICh0eXBlb2YocHJvY2VzcykgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2YocHJvY2Vzcy52ZXJzaW9uKSA9PT0gJ3N0cmluZycpIHtcblxuICAgIHZhciBub2RlVmVyc2lvbiA9IHByb2Nlc3MudmVyc2lvbi5zcGxpdCgnLicpLnJlZHVjZShmdW5jdGlvbihhLCB2KSB7XG4gICAgICByZXR1cm4gYSA8PCA4IHwgdjtcbiAgICB9KTtcblxuICAgIC8vICdlcnJubycgd2FzIHJlbmFtZWQgdG8gcHJvY2Vzcy5fZXJybm8gaW4gdjAuOS4xMS5cblxuICAgIGlmIChub2RlVmVyc2lvbiA8IDB4MDAwOTBCKSB7XG4gICAgICByZXR1cm4gWydlcnJubyddO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBbXTtcbiB9XG5cbn0pOyAvLyBtb2R1bGU6IHJ1bm5lci5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwic3VpdGUuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdicm93c2VyL2V2ZW50cycpLkV2ZW50RW1pdHRlclxuICAsIGRlYnVnID0gcmVxdWlyZSgnYnJvd3Nlci9kZWJ1ZycpKCdtb2NoYTpzdWl0ZScpXG4gICwgbWlsbGlzZWNvbmRzID0gcmVxdWlyZSgnLi9tcycpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcbiAgLCBIb29rID0gcmVxdWlyZSgnLi9ob29rJyk7XG5cbi8qKlxuICogRXhwb3NlIGBTdWl0ZWAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gU3VpdGU7XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IGBTdWl0ZWAgd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYFxuICogYW5kIHBhcmVudCBgU3VpdGVgLiBXaGVuIGEgc3VpdGUgd2l0aCB0aGVcbiAqIHNhbWUgdGl0bGUgaXMgYWxyZWFkeSBwcmVzZW50LCB0aGF0IHN1aXRlXG4gKiBpcyByZXR1cm5lZCB0byBwcm92aWRlIG5pY2VyIHJlcG9ydGVyXG4gKiBhbmQgbW9yZSBmbGV4aWJsZSBtZXRhLXRlc3RpbmcuXG4gKlxuICogQHBhcmFtIHtTdWl0ZX0gcGFyZW50XG4gKiBAcGFyYW0ge1N0cmluZ30gdGl0bGVcbiAqIEByZXR1cm4ge1N1aXRlfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLmNyZWF0ZSA9IGZ1bmN0aW9uKHBhcmVudCwgdGl0bGUpe1xuICB2YXIgc3VpdGUgPSBuZXcgU3VpdGUodGl0bGUsIHBhcmVudC5jdHgpO1xuICBzdWl0ZS5wYXJlbnQgPSBwYXJlbnQ7XG4gIGlmIChwYXJlbnQucGVuZGluZykgc3VpdGUucGVuZGluZyA9IHRydWU7XG4gIHRpdGxlID0gc3VpdGUuZnVsbFRpdGxlKCk7XG4gIHBhcmVudC5hZGRTdWl0ZShzdWl0ZSk7XG4gIHJldHVybiBzdWl0ZTtcbn07XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgU3VpdGVgIHdpdGggdGhlIGdpdmVuXG4gKiBgdGl0bGVgIGFuZCBgY3R4YC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdGl0bGVcbiAqIEBwYXJhbSB7Q29udGV4dH0gY3R4XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBTdWl0ZSh0aXRsZSwgcGFyZW50Q29udGV4dCkge1xuICB0aGlzLnRpdGxlID0gdGl0bGU7XG4gIHZhciBjb250ZXh0ID0gZnVuY3Rpb24oKSB7fTtcbiAgY29udGV4dC5wcm90b3R5cGUgPSBwYXJlbnRDb250ZXh0O1xuICB0aGlzLmN0eCA9IG5ldyBjb250ZXh0KCk7XG4gIHRoaXMuc3VpdGVzID0gW107XG4gIHRoaXMudGVzdHMgPSBbXTtcbiAgdGhpcy5wZW5kaW5nID0gZmFsc2U7XG4gIHRoaXMuX2JlZm9yZUVhY2ggPSBbXTtcbiAgdGhpcy5fYmVmb3JlQWxsID0gW107XG4gIHRoaXMuX2FmdGVyRWFjaCA9IFtdO1xuICB0aGlzLl9hZnRlckFsbCA9IFtdO1xuICB0aGlzLnJvb3QgPSAhdGl0bGU7XG4gIHRoaXMuX3RpbWVvdXQgPSAyMDAwO1xuICB0aGlzLl9lbmFibGVUaW1lb3V0cyA9IHRydWU7XG4gIHRoaXMuX3Nsb3cgPSA3NTtcbiAgdGhpcy5fYmFpbCA9IGZhbHNlO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgRXZlbnRFbWl0dGVyLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGU7XG5TdWl0ZS5wcm90b3R5cGUgPSBuZXcgRjtcblN1aXRlLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFN1aXRlO1xuXG5cbi8qKlxuICogUmV0dXJuIGEgY2xvbmUgb2YgdGhpcyBgU3VpdGVgLlxuICpcbiAqIEByZXR1cm4ge1N1aXRlfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU3VpdGUucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24oKXtcbiAgdmFyIHN1aXRlID0gbmV3IFN1aXRlKHRoaXMudGl0bGUpO1xuICBkZWJ1ZygnY2xvbmUnKTtcbiAgc3VpdGUuY3R4ID0gdGhpcy5jdHg7XG4gIHN1aXRlLnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICBzdWl0ZS5lbmFibGVUaW1lb3V0cyh0aGlzLmVuYWJsZVRpbWVvdXRzKCkpO1xuICBzdWl0ZS5zbG93KHRoaXMuc2xvdygpKTtcbiAgc3VpdGUuYmFpbCh0aGlzLmJhaWwoKSk7XG4gIHJldHVybiBzdWl0ZTtcbn07XG5cbi8qKlxuICogU2V0IHRpbWVvdXQgYG1zYCBvciBzaG9ydC1oYW5kIHN1Y2ggYXMgXCIyc1wiLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfFN0cmluZ30gbXNcbiAqIEByZXR1cm4ge1N1aXRlfE51bWJlcn0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUudGltZW91dCA9IGZ1bmN0aW9uKG1zKXtcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX3RpbWVvdXQ7XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgbXMpIG1zID0gbWlsbGlzZWNvbmRzKG1zKTtcbiAgZGVidWcoJ3RpbWVvdXQgJWQnLCBtcyk7XG4gIHRoaXMuX3RpbWVvdXQgPSBwYXJzZUludChtcywgMTApO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICAqIFNldCB0aW1lb3V0IGBlbmFibGVkYC5cbiAgKlxuICAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlZFxuICAqIEByZXR1cm4ge1N1aXRlfEJvb2xlYW59IHNlbGYgb3IgZW5hYmxlZFxuICAqIEBhcGkgcHJpdmF0ZVxuICAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuZW5hYmxlVGltZW91dHMgPSBmdW5jdGlvbihlbmFibGVkKXtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHJldHVybiB0aGlzLl9lbmFibGVUaW1lb3V0cztcbiAgZGVidWcoJ2VuYWJsZVRpbWVvdXRzICVzJywgZW5hYmxlZCk7XG4gIHRoaXMuX2VuYWJsZVRpbWVvdXRzID0gZW5hYmxlZDtcbiAgcmV0dXJuIHRoaXM7XG59XG5cbi8qKlxuICogU2V0IHNsb3cgYG1zYCBvciBzaG9ydC1oYW5kIHN1Y2ggYXMgXCIyc1wiLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfFN0cmluZ30gbXNcbiAqIEByZXR1cm4ge1N1aXRlfE51bWJlcn0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuc2xvdyA9IGZ1bmN0aW9uKG1zKXtcbiAgaWYgKDAgPT09IGFyZ3VtZW50cy5sZW5ndGgpIHJldHVybiB0aGlzLl9zbG93O1xuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIG1zKSBtcyA9IG1pbGxpc2Vjb25kcyhtcyk7XG4gIGRlYnVnKCdzbG93ICVkJywgbXMpO1xuICB0aGlzLl9zbG93ID0gbXM7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXRzIHdoZXRoZXIgdG8gYmFpbCBhZnRlciBmaXJzdCBlcnJvci5cbiAqXG4gKiBAcGFybWEge0Jvb2xlYW59IGJhaWxcbiAqIEByZXR1cm4ge1N1aXRlfE51bWJlcn0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYmFpbCA9IGZ1bmN0aW9uKGJhaWwpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fYmFpbDtcbiAgZGVidWcoJ2JhaWwgJXMnLCBiYWlsKTtcbiAgdGhpcy5fYmFpbCA9IGJhaWw7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSdW4gYGZuKHRlc3RbLCBkb25lXSlgIGJlZm9yZSBydW5uaW5nIHRlc3RzLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtTdWl0ZX0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYmVmb3JlQWxsID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgaWYgKHRoaXMucGVuZGluZykgcmV0dXJuIHRoaXM7XG4gIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGl0bGUpIHtcbiAgICBmbiA9IHRpdGxlO1xuICAgIHRpdGxlID0gZm4ubmFtZTtcbiAgfVxuICB0aXRsZSA9ICdcImJlZm9yZSBhbGxcIiBob29rJyArICh0aXRsZSA/ICc6ICcgKyB0aXRsZSA6ICcnKTtcblxuICB2YXIgaG9vayA9IG5ldyBIb29rKHRpdGxlLCBmbik7XG4gIGhvb2sucGFyZW50ID0gdGhpcztcbiAgaG9vay50aW1lb3V0KHRoaXMudGltZW91dCgpKTtcbiAgaG9vay5lbmFibGVUaW1lb3V0cyh0aGlzLmVuYWJsZVRpbWVvdXRzKCkpO1xuICBob29rLnNsb3codGhpcy5zbG93KCkpO1xuICBob29rLmN0eCA9IHRoaXMuY3R4O1xuICB0aGlzLl9iZWZvcmVBbGwucHVzaChob29rKTtcbiAgdGhpcy5lbWl0KCdiZWZvcmVBbGwnLCBob29rKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJ1biBgZm4odGVzdFssIGRvbmVdKWAgYWZ0ZXIgcnVubmluZyB0ZXN0cy5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7U3VpdGV9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU3VpdGUucHJvdG90eXBlLmFmdGVyQWxsID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgaWYgKHRoaXMucGVuZGluZykgcmV0dXJuIHRoaXM7XG4gIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGl0bGUpIHtcbiAgICBmbiA9IHRpdGxlO1xuICAgIHRpdGxlID0gZm4ubmFtZTtcbiAgfVxuICB0aXRsZSA9ICdcImFmdGVyIGFsbFwiIGhvb2snICsgKHRpdGxlID8gJzogJyArIHRpdGxlIDogJycpO1xuXG4gIHZhciBob29rID0gbmV3IEhvb2sodGl0bGUsIGZuKTtcbiAgaG9vay5wYXJlbnQgPSB0aGlzO1xuICBob29rLnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICBob29rLmVuYWJsZVRpbWVvdXRzKHRoaXMuZW5hYmxlVGltZW91dHMoKSk7XG4gIGhvb2suc2xvdyh0aGlzLnNsb3coKSk7XG4gIGhvb2suY3R4ID0gdGhpcy5jdHg7XG4gIHRoaXMuX2FmdGVyQWxsLnB1c2goaG9vayk7XG4gIHRoaXMuZW1pdCgnYWZ0ZXJBbGwnLCBob29rKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJ1biBgZm4odGVzdFssIGRvbmVdKWAgYmVmb3JlIGVhY2ggdGVzdCBjYXNlLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtTdWl0ZX0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYmVmb3JlRWFjaCA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gIGlmICh0aGlzLnBlbmRpbmcpIHJldHVybiB0aGlzO1xuICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRpdGxlKSB7XG4gICAgZm4gPSB0aXRsZTtcbiAgICB0aXRsZSA9IGZuLm5hbWU7XG4gIH1cbiAgdGl0bGUgPSAnXCJiZWZvcmUgZWFjaFwiIGhvb2snICsgKHRpdGxlID8gJzogJyArIHRpdGxlIDogJycpO1xuXG4gIHZhciBob29rID0gbmV3IEhvb2sodGl0bGUsIGZuKTtcbiAgaG9vay5wYXJlbnQgPSB0aGlzO1xuICBob29rLnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICBob29rLmVuYWJsZVRpbWVvdXRzKHRoaXMuZW5hYmxlVGltZW91dHMoKSk7XG4gIGhvb2suc2xvdyh0aGlzLnNsb3coKSk7XG4gIGhvb2suY3R4ID0gdGhpcy5jdHg7XG4gIHRoaXMuX2JlZm9yZUVhY2gucHVzaChob29rKTtcbiAgdGhpcy5lbWl0KCdiZWZvcmVFYWNoJywgaG9vayk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSdW4gYGZuKHRlc3RbLCBkb25lXSlgIGFmdGVyIGVhY2ggdGVzdCBjYXNlLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtTdWl0ZX0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYWZ0ZXJFYWNoID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgaWYgKHRoaXMucGVuZGluZykgcmV0dXJuIHRoaXM7XG4gIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGl0bGUpIHtcbiAgICBmbiA9IHRpdGxlO1xuICAgIHRpdGxlID0gZm4ubmFtZTtcbiAgfVxuICB0aXRsZSA9ICdcImFmdGVyIGVhY2hcIiBob29rJyArICh0aXRsZSA/ICc6ICcgKyB0aXRsZSA6ICcnKTtcblxuICB2YXIgaG9vayA9IG5ldyBIb29rKHRpdGxlLCBmbik7XG4gIGhvb2sucGFyZW50ID0gdGhpcztcbiAgaG9vay50aW1lb3V0KHRoaXMudGltZW91dCgpKTtcbiAgaG9vay5lbmFibGVUaW1lb3V0cyh0aGlzLmVuYWJsZVRpbWVvdXRzKCkpO1xuICBob29rLnNsb3codGhpcy5zbG93KCkpO1xuICBob29rLmN0eCA9IHRoaXMuY3R4O1xuICB0aGlzLl9hZnRlckVhY2gucHVzaChob29rKTtcbiAgdGhpcy5lbWl0KCdhZnRlckVhY2gnLCBob29rKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEFkZCBhIHRlc3QgYHN1aXRlYC5cbiAqXG4gKiBAcGFyYW0ge1N1aXRlfSBzdWl0ZVxuICogQHJldHVybiB7U3VpdGV9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU3VpdGUucHJvdG90eXBlLmFkZFN1aXRlID0gZnVuY3Rpb24oc3VpdGUpe1xuICBzdWl0ZS5wYXJlbnQgPSB0aGlzO1xuICBzdWl0ZS50aW1lb3V0KHRoaXMudGltZW91dCgpKTtcbiAgc3VpdGUuZW5hYmxlVGltZW91dHModGhpcy5lbmFibGVUaW1lb3V0cygpKTtcbiAgc3VpdGUuc2xvdyh0aGlzLnNsb3coKSk7XG4gIHN1aXRlLmJhaWwodGhpcy5iYWlsKCkpO1xuICB0aGlzLnN1aXRlcy5wdXNoKHN1aXRlKTtcbiAgdGhpcy5lbWl0KCdzdWl0ZScsIHN1aXRlKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEFkZCBhIGB0ZXN0YCB0byB0aGlzIHN1aXRlLlxuICpcbiAqIEBwYXJhbSB7VGVzdH0gdGVzdFxuICogQHJldHVybiB7U3VpdGV9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU3VpdGUucHJvdG90eXBlLmFkZFRlc3QgPSBmdW5jdGlvbih0ZXN0KXtcbiAgdGVzdC5wYXJlbnQgPSB0aGlzO1xuICB0ZXN0LnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICB0ZXN0LmVuYWJsZVRpbWVvdXRzKHRoaXMuZW5hYmxlVGltZW91dHMoKSk7XG4gIHRlc3Quc2xvdyh0aGlzLnNsb3coKSk7XG4gIHRlc3QuY3R4ID0gdGhpcy5jdHg7XG4gIHRoaXMudGVzdHMucHVzaCh0ZXN0KTtcbiAgdGhpcy5lbWl0KCd0ZXN0JywgdGVzdCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gdGhlIGZ1bGwgdGl0bGUgZ2VuZXJhdGVkIGJ5IHJlY3Vyc2l2ZWx5XG4gKiBjb25jYXRlbmF0aW5nIHRoZSBwYXJlbnQncyBmdWxsIHRpdGxlLlxuICpcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuU3VpdGUucHJvdG90eXBlLmZ1bGxUaXRsZSA9IGZ1bmN0aW9uKCl7XG4gIGlmICh0aGlzLnBhcmVudCkge1xuICAgIHZhciBmdWxsID0gdGhpcy5wYXJlbnQuZnVsbFRpdGxlKCk7XG4gICAgaWYgKGZ1bGwpIHJldHVybiBmdWxsICsgJyAnICsgdGhpcy50aXRsZTtcbiAgfVxuICByZXR1cm4gdGhpcy50aXRsZTtcbn07XG5cbi8qKlxuICogUmV0dXJuIHRoZSB0b3RhbCBudW1iZXIgb2YgdGVzdHMuXG4gKlxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUudG90YWwgPSBmdW5jdGlvbigpe1xuICByZXR1cm4gdXRpbHMucmVkdWNlKHRoaXMuc3VpdGVzLCBmdW5jdGlvbihzdW0sIHN1aXRlKXtcbiAgICByZXR1cm4gc3VtICsgc3VpdGUudG90YWwoKTtcbiAgfSwgMCkgKyB0aGlzLnRlc3RzLmxlbmd0aDtcbn07XG5cbi8qKlxuICogSXRlcmF0ZXMgdGhyb3VnaCBlYWNoIHN1aXRlIHJlY3Vyc2l2ZWx5IHRvIGZpbmRcbiAqIGFsbCB0ZXN0cy4gQXBwbGllcyBhIGZ1bmN0aW9uIGluIHRoZSBmb3JtYXRcbiAqIGBmbih0ZXN0KWAuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1N1aXRlfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU3VpdGUucHJvdG90eXBlLmVhY2hUZXN0ID0gZnVuY3Rpb24oZm4pe1xuICB1dGlscy5mb3JFYWNoKHRoaXMudGVzdHMsIGZuKTtcbiAgdXRpbHMuZm9yRWFjaCh0aGlzLnN1aXRlcywgZnVuY3Rpb24oc3VpdGUpe1xuICAgIHN1aXRlLmVhY2hUZXN0KGZuKTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxufSk7IC8vIG1vZHVsZTogc3VpdGUuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInRlc3QuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBSdW5uYWJsZSA9IHJlcXVpcmUoJy4vcnVubmFibGUnKTtcblxuLyoqXG4gKiBFeHBvc2UgYFRlc3RgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gVGVzdDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBUZXN0YCB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgIGFuZCBjYWxsYmFjayBgZm5gLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0aXRsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIFRlc3QodGl0bGUsIGZuKSB7XG4gIFJ1bm5hYmxlLmNhbGwodGhpcywgdGl0bGUsIGZuKTtcbiAgdGhpcy5wZW5kaW5nID0gIWZuO1xuICB0aGlzLnR5cGUgPSAndGVzdCc7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBSdW5uYWJsZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBSdW5uYWJsZS5wcm90b3R5cGU7XG5UZXN0LnByb3RvdHlwZSA9IG5ldyBGO1xuVGVzdC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBUZXN0O1xuXG5cbn0pOyAvLyBtb2R1bGU6IHRlc3QuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInV0aWxzLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIGZzID0gcmVxdWlyZSgnYnJvd3Nlci9mcycpXG4gICwgcGF0aCA9IHJlcXVpcmUoJ2Jyb3dzZXIvcGF0aCcpXG4gICwgam9pbiA9IHBhdGguam9pblxuICAsIGRlYnVnID0gcmVxdWlyZSgnYnJvd3Nlci9kZWJ1ZycpKCdtb2NoYTp3YXRjaCcpO1xuXG4vKipcbiAqIElnbm9yZWQgZGlyZWN0b3JpZXMuXG4gKi9cblxudmFyIGlnbm9yZSA9IFsnbm9kZV9tb2R1bGVzJywgJy5naXQnXTtcblxuLyoqXG4gKiBFc2NhcGUgc3BlY2lhbCBjaGFyYWN0ZXJzIGluIHRoZSBnaXZlbiBzdHJpbmcgb2YgaHRtbC5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGh0bWxcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuZXNjYXBlID0gZnVuY3Rpb24oaHRtbCl7XG4gIHJldHVybiBTdHJpbmcoaHRtbClcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgIC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JylcbiAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKTtcbn07XG5cbi8qKlxuICogQXJyYXkjZm9yRWFjaCAoPD1JRTgpXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJyYXlcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcGFyYW0ge09iamVjdH0gc2NvcGVcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuZm9yRWFjaCA9IGZ1bmN0aW9uKGFyciwgZm4sIHNjb3BlKXtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBhcnIubGVuZ3RoOyBpIDwgbDsgaSsrKVxuICAgIGZuLmNhbGwoc2NvcGUsIGFycltpXSwgaSk7XG59O1xuXG4vKipcbiAqIEFycmF5I21hcCAoPD1JRTgpXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJyYXlcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcGFyYW0ge09iamVjdH0gc2NvcGVcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMubWFwID0gZnVuY3Rpb24oYXJyLCBmbiwgc2NvcGUpe1xuICB2YXIgcmVzdWx0ID0gW107XG4gIGZvciAodmFyIGkgPSAwLCBsID0gYXJyLmxlbmd0aDsgaSA8IGw7IGkrKylcbiAgICByZXN1bHQucHVzaChmbi5jYWxsKHNjb3BlLCBhcnJbaV0sIGkpKTtcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogQXJyYXkjaW5kZXhPZiAoPD1JRTgpXG4gKlxuICogQHBhcm1hIHtBcnJheX0gYXJyXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIHRvIGZpbmQgaW5kZXggb2ZcbiAqIEBwYXJhbSB7TnVtYmVyfSBzdGFydFxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5pbmRleE9mID0gZnVuY3Rpb24oYXJyLCBvYmosIHN0YXJ0KXtcbiAgZm9yICh2YXIgaSA9IHN0YXJ0IHx8IDAsIGwgPSBhcnIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgaWYgKGFycltpXSA9PT0gb2JqKVxuICAgICAgcmV0dXJuIGk7XG4gIH1cbiAgcmV0dXJuIC0xO1xufTtcblxuLyoqXG4gKiBBcnJheSNyZWR1Y2UgKDw9SUU4KVxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHBhcmFtIHtPYmplY3R9IGluaXRpYWwgdmFsdWVcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMucmVkdWNlID0gZnVuY3Rpb24oYXJyLCBmbiwgdmFsKXtcbiAgdmFyIHJ2YWwgPSB2YWw7XG5cbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBhcnIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgcnZhbCA9IGZuKHJ2YWwsIGFycltpXSwgaSwgYXJyKTtcbiAgfVxuXG4gIHJldHVybiBydmFsO1xufTtcblxuLyoqXG4gKiBBcnJheSNmaWx0ZXIgKDw9SUU4KVxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5maWx0ZXIgPSBmdW5jdGlvbihhcnIsIGZuKXtcbiAgdmFyIHJldCA9IFtdO1xuXG4gIGZvciAodmFyIGkgPSAwLCBsID0gYXJyLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIHZhciB2YWwgPSBhcnJbaV07XG4gICAgaWYgKGZuKHZhbCwgaSwgYXJyKSkgcmV0LnB1c2godmFsKTtcbiAgfVxuXG4gIHJldHVybiByZXQ7XG59O1xuXG4vKipcbiAqIE9iamVjdC5rZXlzICg8PUlFOClcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtBcnJheX0ga2V5c1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5rZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24ob2JqKSB7XG4gIHZhciBrZXlzID0gW11cbiAgICAsIGhhcyA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkgLy8gZm9yIGB3aW5kb3dgIG9uIDw9SUU4XG5cbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChoYXMuY2FsbChvYmosIGtleSkpIHtcbiAgICAgIGtleXMucHVzaChrZXkpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBrZXlzO1xufTtcblxuLyoqXG4gKiBXYXRjaCB0aGUgZ2l2ZW4gYGZpbGVzYCBmb3IgY2hhbmdlc1xuICogYW5kIGludm9rZSBgZm4oZmlsZSlgIG9uIG1vZGlmaWNhdGlvbi5cbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBmaWxlc1xuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMud2F0Y2ggPSBmdW5jdGlvbihmaWxlcywgZm4pe1xuICB2YXIgb3B0aW9ucyA9IHsgaW50ZXJ2YWw6IDEwMCB9O1xuICBmaWxlcy5mb3JFYWNoKGZ1bmN0aW9uKGZpbGUpe1xuICAgIGRlYnVnKCdmaWxlICVzJywgZmlsZSk7XG4gICAgZnMud2F0Y2hGaWxlKGZpbGUsIG9wdGlvbnMsIGZ1bmN0aW9uKGN1cnIsIHByZXYpe1xuICAgICAgaWYgKHByZXYubXRpbWUgPCBjdXJyLm10aW1lKSBmbihmaWxlKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIElnbm9yZWQgZmlsZXMuXG4gKi9cblxuZnVuY3Rpb24gaWdub3JlZChwYXRoKXtcbiAgcmV0dXJuICF+aWdub3JlLmluZGV4T2YocGF0aCk7XG59XG5cbi8qKlxuICogTG9va3VwIGZpbGVzIGluIHRoZSBnaXZlbiBgZGlyYC5cbiAqXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuZmlsZXMgPSBmdW5jdGlvbihkaXIsIGV4dCwgcmV0KXtcbiAgcmV0ID0gcmV0IHx8IFtdO1xuICBleHQgPSBleHQgfHwgWydqcyddO1xuXG4gIHZhciByZSA9IG5ldyBSZWdFeHAoJ1xcXFwuKCcgKyBleHQuam9pbignfCcpICsgJykkJyk7XG5cbiAgZnMucmVhZGRpclN5bmMoZGlyKVxuICAuZmlsdGVyKGlnbm9yZWQpXG4gIC5mb3JFYWNoKGZ1bmN0aW9uKHBhdGgpe1xuICAgIHBhdGggPSBqb2luKGRpciwgcGF0aCk7XG4gICAgaWYgKGZzLnN0YXRTeW5jKHBhdGgpLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgIGV4cG9ydHMuZmlsZXMocGF0aCwgZXh0LCByZXQpO1xuICAgIH0gZWxzZSBpZiAocGF0aC5tYXRjaChyZSkpIHtcbiAgICAgIHJldC5wdXNoKHBhdGgpO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIHJldDtcbn07XG5cbi8qKlxuICogQ29tcHV0ZSBhIHNsdWcgZnJvbSB0aGUgZ2l2ZW4gYHN0cmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5zbHVnID0gZnVuY3Rpb24oc3RyKXtcbiAgcmV0dXJuIHN0clxuICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgLnJlcGxhY2UoLyArL2csICctJylcbiAgICAucmVwbGFjZSgvW14tXFx3XS9nLCAnJyk7XG59O1xuXG4vKipcbiAqIFN0cmlwIHRoZSBmdW5jdGlvbiBkZWZpbml0aW9uIGZyb20gYHN0cmAsXG4gKiBhbmQgcmUtaW5kZW50IGZvciBwcmUgd2hpdGVzcGFjZS5cbiAqL1xuXG5leHBvcnRzLmNsZWFuID0gZnVuY3Rpb24oc3RyKSB7XG4gIHN0ciA9IHN0clxuICAgIC5yZXBsYWNlKC9cXHJcXG4/fFtcXG5cXHUyMDI4XFx1MjAyOV0vZywgXCJcXG5cIikucmVwbGFjZSgvXlxcdUZFRkYvLCAnJylcbiAgICAucmVwbGFjZSgvXmZ1bmN0aW9uICpcXCguKlxcKSAqe3xcXCguKlxcKSAqPT4gKns/LywgJycpXG4gICAgLnJlcGxhY2UoL1xccytcXH0kLywgJycpO1xuXG4gIHZhciBzcGFjZXMgPSBzdHIubWF0Y2goL15cXG4/KCAqKS8pWzFdLmxlbmd0aFxuICAgICwgdGFicyA9IHN0ci5tYXRjaCgvXlxcbj8oXFx0KikvKVsxXS5sZW5ndGhcbiAgICAsIHJlID0gbmV3IFJlZ0V4cCgnXlxcbj8nICsgKHRhYnMgPyAnXFx0JyA6ICcgJykgKyAneycgKyAodGFicyA/IHRhYnMgOiBzcGFjZXMpICsgJ30nLCAnZ20nKTtcblxuICBzdHIgPSBzdHIucmVwbGFjZShyZSwgJycpO1xuXG4gIHJldHVybiBleHBvcnRzLnRyaW0oc3RyKTtcbn07XG5cbi8qKlxuICogRXNjYXBlIHJlZ3VsYXIgZXhwcmVzc2lvbiBjaGFyYWN0ZXJzIGluIGBzdHJgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuZXNjYXBlUmVnZXhwID0gZnVuY3Rpb24oc3RyKXtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9bLVxcXFxeJCorPy4oKXxbXFxde31dL2csIFwiXFxcXCQmXCIpO1xufTtcblxuLyoqXG4gKiBUcmltIHRoZSBnaXZlbiBgc3RyYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLnRyaW0gPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKTtcbn07XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGBxc2AuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHFzXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLnBhcnNlUXVlcnkgPSBmdW5jdGlvbihxcyl7XG4gIHJldHVybiBleHBvcnRzLnJlZHVjZShxcy5yZXBsYWNlKCc/JywgJycpLnNwbGl0KCcmJyksIGZ1bmN0aW9uKG9iaiwgcGFpcil7XG4gICAgdmFyIGkgPSBwYWlyLmluZGV4T2YoJz0nKVxuICAgICAgLCBrZXkgPSBwYWlyLnNsaWNlKDAsIGkpXG4gICAgICAsIHZhbCA9IHBhaXIuc2xpY2UoKytpKTtcblxuICAgIG9ialtrZXldID0gZGVjb2RlVVJJQ29tcG9uZW50KHZhbCk7XG4gICAgcmV0dXJuIG9iajtcbiAgfSwge30pO1xufTtcblxuLyoqXG4gKiBIaWdobGlnaHQgdGhlIGdpdmVuIHN0cmluZyBvZiBganNgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBqc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaGlnaGxpZ2h0KGpzKSB7XG4gIHJldHVybiBqc1xuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgLnJlcGxhY2UoL1xcL1xcLyguKikvZ20sICc8c3BhbiBjbGFzcz1cImNvbW1lbnRcIj4vLyQxPC9zcGFuPicpXG4gICAgLnJlcGxhY2UoLygnLio/JykvZ20sICc8c3BhbiBjbGFzcz1cInN0cmluZ1wiPiQxPC9zcGFuPicpXG4gICAgLnJlcGxhY2UoLyhcXGQrXFwuXFxkKykvZ20sICc8c3BhbiBjbGFzcz1cIm51bWJlclwiPiQxPC9zcGFuPicpXG4gICAgLnJlcGxhY2UoLyhcXGQrKS9nbSwgJzxzcGFuIGNsYXNzPVwibnVtYmVyXCI+JDE8L3NwYW4+JylcbiAgICAucmVwbGFjZSgvXFxibmV3WyBcXHRdKyhcXHcrKS9nbSwgJzxzcGFuIGNsYXNzPVwia2V5d29yZFwiPm5ldzwvc3Bhbj4gPHNwYW4gY2xhc3M9XCJpbml0XCI+JDE8L3NwYW4+JylcbiAgICAucmVwbGFjZSgvXFxiKGZ1bmN0aW9ufG5ld3x0aHJvd3xyZXR1cm58dmFyfGlmfGVsc2UpXFxiL2dtLCAnPHNwYW4gY2xhc3M9XCJrZXl3b3JkXCI+JDE8L3NwYW4+Jylcbn1cblxuLyoqXG4gKiBIaWdobGlnaHQgdGhlIGNvbnRlbnRzIG9mIHRhZyBgbmFtZWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuaGlnaGxpZ2h0VGFncyA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgdmFyIGNvZGUgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShuYW1lKTtcbiAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGNvZGUubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICBjb2RlW2ldLmlubmVySFRNTCA9IGhpZ2hsaWdodChjb2RlW2ldLmlubmVySFRNTCk7XG4gIH1cbn07XG5cblxuLyoqXG4gKiBTdHJpbmdpZnkgYG9iamAuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9ialxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5zdHJpbmdpZnkgPSBmdW5jdGlvbihvYmopIHtcbiAgaWYgKG9iaiBpbnN0YW5jZW9mIFJlZ0V4cCkgcmV0dXJuIG9iai50b1N0cmluZygpO1xuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoZXhwb3J0cy5jYW5vbmljYWxpemUob2JqKSwgbnVsbCwgMikucmVwbGFjZSgvLChcXG58JCkvZywgJyQxJyk7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgbmV3IG9iamVjdCB0aGF0IGhhcyB0aGUga2V5cyBpbiBzb3J0ZWQgb3JkZXIuXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLmNhbm9uaWNhbGl6ZSA9IGZ1bmN0aW9uKG9iaiwgc3RhY2spIHtcbiAgIHN0YWNrID0gc3RhY2sgfHwgW107XG5cbiAgIGlmIChleHBvcnRzLmluZGV4T2Yoc3RhY2ssIG9iaikgIT09IC0xKSByZXR1cm4gJ1tDaXJjdWxhcl0nO1xuXG4gICB2YXIgY2Fub25pY2FsaXplZE9iajtcblxuICAgaWYgKHt9LnRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgQXJyYXldJykge1xuICAgICBzdGFjay5wdXNoKG9iaik7XG4gICAgIGNhbm9uaWNhbGl6ZWRPYmogPSBleHBvcnRzLm1hcChvYmosIGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICByZXR1cm4gZXhwb3J0cy5jYW5vbmljYWxpemUoaXRlbSwgc3RhY2spO1xuICAgICB9KTtcbiAgICAgc3RhY2sucG9wKCk7XG4gICB9IGVsc2UgaWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbCkge1xuICAgICBzdGFjay5wdXNoKG9iaik7XG4gICAgIGNhbm9uaWNhbGl6ZWRPYmogPSB7fTtcbiAgICAgZXhwb3J0cy5mb3JFYWNoKGV4cG9ydHMua2V5cyhvYmopLnNvcnQoKSwgZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgY2Fub25pY2FsaXplZE9ialtrZXldID0gZXhwb3J0cy5jYW5vbmljYWxpemUob2JqW2tleV0sIHN0YWNrKTtcbiAgICAgfSk7XG4gICAgIHN0YWNrLnBvcCgpO1xuICAgfSBlbHNlIHtcbiAgICAgY2Fub25pY2FsaXplZE9iaiA9IG9iajtcbiAgIH1cblxuICAgcmV0dXJuIGNhbm9uaWNhbGl6ZWRPYmo7XG4gfVxuXG59KTsgLy8gbW9kdWxlOiB1dGlscy5qc1xuLy8gVGhlIGdsb2JhbCBvYmplY3QgaXMgXCJzZWxmXCIgaW4gV2ViIFdvcmtlcnMuXG52YXIgZ2xvYmFsID0gKGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpczsgfSkoKTtcblxuLyoqXG4gKiBTYXZlIHRpbWVyIHJlZmVyZW5jZXMgdG8gYXZvaWQgU2lub24gaW50ZXJmZXJpbmcgKHNlZSBHSC0yMzcpLlxuICovXG5cbnZhciBEYXRlID0gZ2xvYmFsLkRhdGU7XG52YXIgc2V0VGltZW91dCA9IGdsb2JhbC5zZXRUaW1lb3V0O1xudmFyIHNldEludGVydmFsID0gZ2xvYmFsLnNldEludGVydmFsO1xudmFyIGNsZWFyVGltZW91dCA9IGdsb2JhbC5jbGVhclRpbWVvdXQ7XG52YXIgY2xlYXJJbnRlcnZhbCA9IGdsb2JhbC5jbGVhckludGVydmFsO1xuXG4vKipcbiAqIE5vZGUgc2hpbXMuXG4gKlxuICogVGhlc2UgYXJlIG1lYW50IG9ubHkgdG8gYWxsb3dcbiAqIG1vY2hhLmpzIHRvIHJ1biB1bnRvdWNoZWQsIG5vdFxuICogdG8gYWxsb3cgcnVubmluZyBub2RlIGNvZGUgaW5cbiAqIHRoZSBicm93c2VyLlxuICovXG5cbnZhciBwcm9jZXNzID0ge307XG5wcm9jZXNzLmV4aXQgPSBmdW5jdGlvbihzdGF0dXMpe307XG5wcm9jZXNzLnN0ZG91dCA9IHt9O1xuXG52YXIgdW5jYXVnaHRFeGNlcHRpb25IYW5kbGVycyA9IFtdO1xuXG52YXIgb3JpZ2luYWxPbmVycm9ySGFuZGxlciA9IGdsb2JhbC5vbmVycm9yO1xuXG4vKipcbiAqIFJlbW92ZSB1bmNhdWdodEV4Y2VwdGlvbiBsaXN0ZW5lci5cbiAqIFJldmVydCB0byBvcmlnaW5hbCBvbmVycm9yIGhhbmRsZXIgaWYgcHJldmlvdXNseSBkZWZpbmVkLlxuICovXG5cbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbihlLCBmbil7XG4gIGlmICgndW5jYXVnaHRFeGNlcHRpb24nID09IGUpIHtcbiAgICBpZiAob3JpZ2luYWxPbmVycm9ySGFuZGxlcikge1xuICAgICAgZ2xvYmFsLm9uZXJyb3IgPSBvcmlnaW5hbE9uZXJyb3JIYW5kbGVyO1xuICAgIH0gZWxzZSB7XG4gICAgICBnbG9iYWwub25lcnJvciA9IGZ1bmN0aW9uKCkge307XG4gICAgfVxuICAgIHZhciBpID0gTW9jaGEudXRpbHMuaW5kZXhPZih1bmNhdWdodEV4Y2VwdGlvbkhhbmRsZXJzLCBmbik7XG4gICAgaWYgKGkgIT0gLTEpIHsgdW5jYXVnaHRFeGNlcHRpb25IYW5kbGVycy5zcGxpY2UoaSwgMSk7IH1cbiAgfVxufTtcblxuLyoqXG4gKiBJbXBsZW1lbnRzIHVuY2F1Z2h0RXhjZXB0aW9uIGxpc3RlbmVyLlxuICovXG5cbnByb2Nlc3Mub24gPSBmdW5jdGlvbihlLCBmbil7XG4gIGlmICgndW5jYXVnaHRFeGNlcHRpb24nID09IGUpIHtcbiAgICBnbG9iYWwub25lcnJvciA9IGZ1bmN0aW9uKGVyciwgdXJsLCBsaW5lKXtcbiAgICAgIGZuKG5ldyBFcnJvcihlcnIgKyAnICgnICsgdXJsICsgJzonICsgbGluZSArICcpJykpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfTtcbiAgICB1bmNhdWdodEV4Y2VwdGlvbkhhbmRsZXJzLnB1c2goZm4pO1xuICB9XG59O1xuXG4vKipcbiAqIEV4cG9zZSBtb2NoYS5cbiAqL1xuXG52YXIgTW9jaGEgPSBnbG9iYWwuTW9jaGEgPSByZXF1aXJlKCdtb2NoYScpLFxuICAgIG1vY2hhID0gZ2xvYmFsLm1vY2hhID0gbmV3IE1vY2hhKHsgcmVwb3J0ZXI6ICdodG1sJyB9KTtcblxuLy8gVGhlIEJERCBVSSBpcyByZWdpc3RlcmVkIGJ5IGRlZmF1bHQsIGJ1dCBubyBVSSB3aWxsIGJlIGZ1bmN0aW9uYWwgaW4gdGhlXG4vLyBicm93c2VyIHdpdGhvdXQgYW4gZXhwbGljaXQgY2FsbCB0byB0aGUgb3ZlcnJpZGRlbiBgbW9jaGEudWlgIChzZWUgYmVsb3cpLlxuLy8gRW5zdXJlIHRoYXQgdGhpcyBkZWZhdWx0IFVJIGRvZXMgbm90IGV4cG9zZSBpdHMgbWV0aG9kcyB0byB0aGUgZ2xvYmFsIHNjb3BlLlxubW9jaGEuc3VpdGUucmVtb3ZlQWxsTGlzdGVuZXJzKCdwcmUtcmVxdWlyZScpO1xuXG52YXIgaW1tZWRpYXRlUXVldWUgPSBbXVxuICAsIGltbWVkaWF0ZVRpbWVvdXQ7XG5cbmZ1bmN0aW9uIHRpbWVzbGljZSgpIHtcbiAgdmFyIGltbWVkaWF0ZVN0YXJ0ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIHdoaWxlIChpbW1lZGlhdGVRdWV1ZS5sZW5ndGggJiYgKG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gaW1tZWRpYXRlU3RhcnQpIDwgMTAwKSB7XG4gICAgaW1tZWRpYXRlUXVldWUuc2hpZnQoKSgpO1xuICB9XG4gIGlmIChpbW1lZGlhdGVRdWV1ZS5sZW5ndGgpIHtcbiAgICBpbW1lZGlhdGVUaW1lb3V0ID0gc2V0VGltZW91dCh0aW1lc2xpY2UsIDApO1xuICB9IGVsc2Uge1xuICAgIGltbWVkaWF0ZVRpbWVvdXQgPSBudWxsO1xuICB9XG59XG5cbi8qKlxuICogSGlnaC1wZXJmb3JtYW5jZSBvdmVycmlkZSBvZiBSdW5uZXIuaW1tZWRpYXRlbHkuXG4gKi9cblxuTW9jaGEuUnVubmVyLmltbWVkaWF0ZWx5ID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgaW1tZWRpYXRlUXVldWUucHVzaChjYWxsYmFjayk7XG4gIGlmICghaW1tZWRpYXRlVGltZW91dCkge1xuICAgIGltbWVkaWF0ZVRpbWVvdXQgPSBzZXRUaW1lb3V0KHRpbWVzbGljZSwgMCk7XG4gIH1cbn07XG5cbi8qKlxuICogRnVuY3Rpb24gdG8gYWxsb3cgYXNzZXJ0aW9uIGxpYnJhcmllcyB0byB0aHJvdyBlcnJvcnMgZGlyZWN0bHkgaW50byBtb2NoYS5cbiAqIFRoaXMgaXMgdXNlZnVsIHdoZW4gcnVubmluZyB0ZXN0cyBpbiBhIGJyb3dzZXIgYmVjYXVzZSB3aW5kb3cub25lcnJvciB3aWxsXG4gKiBvbmx5IHJlY2VpdmUgdGhlICdtZXNzYWdlJyBhdHRyaWJ1dGUgb2YgdGhlIEVycm9yLlxuICovXG5tb2NoYS50aHJvd0Vycm9yID0gZnVuY3Rpb24oZXJyKSB7XG4gIE1vY2hhLnV0aWxzLmZvckVhY2godW5jYXVnaHRFeGNlcHRpb25IYW5kbGVycywgZnVuY3Rpb24gKGZuKSB7XG4gICAgZm4oZXJyKTtcbiAgfSk7XG4gIHRocm93IGVycjtcbn07XG5cbi8qKlxuICogT3ZlcnJpZGUgdWkgdG8gZW5zdXJlIHRoYXQgdGhlIHVpIGZ1bmN0aW9ucyBhcmUgaW5pdGlhbGl6ZWQuXG4gKiBOb3JtYWxseSB0aGlzIHdvdWxkIGhhcHBlbiBpbiBNb2NoYS5wcm90b3R5cGUubG9hZEZpbGVzLlxuICovXG5cbm1vY2hhLnVpID0gZnVuY3Rpb24odWkpe1xuICBNb2NoYS5wcm90b3R5cGUudWkuY2FsbCh0aGlzLCB1aSk7XG4gIHRoaXMuc3VpdGUuZW1pdCgncHJlLXJlcXVpcmUnLCBnbG9iYWwsIG51bGwsIHRoaXMpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0dXAgbW9jaGEgd2l0aCB0aGUgZ2l2ZW4gc2V0dGluZyBvcHRpb25zLlxuICovXG5cbm1vY2hhLnNldHVwID0gZnVuY3Rpb24ob3B0cyl7XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2Ygb3B0cykgb3B0cyA9IHsgdWk6IG9wdHMgfTtcbiAgZm9yICh2YXIgb3B0IGluIG9wdHMpIHRoaXNbb3B0XShvcHRzW29wdF0pO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUnVuIG1vY2hhLCByZXR1cm5pbmcgdGhlIFJ1bm5lci5cbiAqL1xuXG5tb2NoYS5ydW4gPSBmdW5jdGlvbihmbil7XG4gIHZhciBvcHRpb25zID0gbW9jaGEub3B0aW9ucztcbiAgbW9jaGEuZ2xvYmFscygnbG9jYXRpb24nKTtcblxuICB2YXIgcXVlcnkgPSBNb2NoYS51dGlscy5wYXJzZVF1ZXJ5KGdsb2JhbC5sb2NhdGlvbi5zZWFyY2ggfHwgJycpO1xuICBpZiAocXVlcnkuZ3JlcCkgbW9jaGEuZ3JlcChxdWVyeS5ncmVwKTtcbiAgaWYgKHF1ZXJ5LmludmVydCkgbW9jaGEuaW52ZXJ0KCk7XG5cbiAgcmV0dXJuIE1vY2hhLnByb3RvdHlwZS5ydW4uY2FsbChtb2NoYSwgZnVuY3Rpb24oZXJyKXtcbiAgICAvLyBUaGUgRE9NIERvY3VtZW50IGlzIG5vdCBhdmFpbGFibGUgaW4gV2ViIFdvcmtlcnMuXG4gICAgaWYgKGdsb2JhbC5kb2N1bWVudCkge1xuICAgICAgTW9jaGEudXRpbHMuaGlnaGxpZ2h0VGFncygnY29kZScpO1xuICAgIH1cbiAgICBpZiAoZm4pIGZuKGVycik7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBFeHBvc2UgdGhlIHByb2Nlc3Mgc2hpbS5cbiAqL1xuXG5Nb2NoYS5wcm9jZXNzID0gcHJvY2Vzcztcbn0pKCk7IiwiQGNoYXJzZXQgXCJ1dGYtOFwiO1xuXG5ib2R5IHtcbiAgbWFyZ2luOjA7XG59XG5cbiNtb2NoYSB7XG4gIGZvbnQ6IDIwcHgvMS41IFwiSGVsdmV0aWNhIE5ldWVcIiwgSGVsdmV0aWNhLCBBcmlhbCwgc2Fucy1zZXJpZjtcbiAgbWFyZ2luOiA2MHB4IDUwcHg7XG59XG5cbiNtb2NoYSB1bCxcbiNtb2NoYSBsaSB7XG4gIG1hcmdpbjogMDtcbiAgcGFkZGluZzogMDtcbn1cblxuI21vY2hhIHVsIHtcbiAgbGlzdC1zdHlsZTogbm9uZTtcbn1cblxuI21vY2hhIGgxLFxuI21vY2hhIGgyIHtcbiAgbWFyZ2luOiAwO1xufVxuXG4jbW9jaGEgaDEge1xuICBtYXJnaW4tdG9wOiAxNXB4O1xuICBmb250LXNpemU6IDFlbTtcbiAgZm9udC13ZWlnaHQ6IDIwMDtcbn1cblxuI21vY2hhIGgxIGEge1xuICB0ZXh0LWRlY29yYXRpb246IG5vbmU7XG4gIGNvbG9yOiBpbmhlcml0O1xufVxuXG4jbW9jaGEgaDEgYTpob3ZlciB7XG4gIHRleHQtZGVjb3JhdGlvbjogdW5kZXJsaW5lO1xufVxuXG4jbW9jaGEgLnN1aXRlIC5zdWl0ZSBoMSB7XG4gIG1hcmdpbi10b3A6IDA7XG4gIGZvbnQtc2l6ZTogLjhlbTtcbn1cblxuI21vY2hhIC5oaWRkZW4ge1xuICBkaXNwbGF5OiBub25lO1xufVxuXG4jbW9jaGEgaDIge1xuICBmb250LXNpemU6IDEycHg7XG4gIGZvbnQtd2VpZ2h0OiBub3JtYWw7XG4gIGN1cnNvcjogcG9pbnRlcjtcbn1cblxuI21vY2hhIC5zdWl0ZSB7XG4gIG1hcmdpbi1sZWZ0OiAxNXB4O1xufVxuXG4jbW9jaGEgLnRlc3Qge1xuICBtYXJnaW4tbGVmdDogMTVweDtcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcbn1cblxuI21vY2hhIC50ZXN0LnBlbmRpbmc6aG92ZXIgaDI6OmFmdGVyIHtcbiAgY29udGVudDogJyhwZW5kaW5nKSc7XG4gIGZvbnQtZmFtaWx5OiBhcmlhbCwgc2Fucy1zZXJpZjtcbn1cblxuI21vY2hhIC50ZXN0LnBhc3MubWVkaXVtIC5kdXJhdGlvbiB7XG4gIGJhY2tncm91bmQ6ICNjMDk4NTM7XG59XG5cbiNtb2NoYSAudGVzdC5wYXNzLnNsb3cgLmR1cmF0aW9uIHtcbiAgYmFja2dyb3VuZDogI2I5NGE0ODtcbn1cblxuI21vY2hhIC50ZXN0LnBhc3M6OmJlZm9yZSB7XG4gIGNvbnRlbnQ6ICfinJMnO1xuICBmb250LXNpemU6IDEycHg7XG4gIGRpc3BsYXk6IGJsb2NrO1xuICBmbG9hdDogbGVmdDtcbiAgbWFyZ2luLXJpZ2h0OiA1cHg7XG4gIGNvbG9yOiAjMDBkNmIyO1xufVxuXG4jbW9jaGEgLnRlc3QucGFzcyAuZHVyYXRpb24ge1xuICBmb250LXNpemU6IDlweDtcbiAgbWFyZ2luLWxlZnQ6IDVweDtcbiAgcGFkZGluZzogMnB4IDVweDtcbiAgY29sb3I6ICNmZmY7XG4gIC13ZWJraXQtYm94LXNoYWRvdzogaW5zZXQgMCAxcHggMXB4IHJnYmEoMCwwLDAsLjIpO1xuICAtbW96LWJveC1zaGFkb3c6IGluc2V0IDAgMXB4IDFweCByZ2JhKDAsMCwwLC4yKTtcbiAgYm94LXNoYWRvdzogaW5zZXQgMCAxcHggMXB4IHJnYmEoMCwwLDAsLjIpO1xuICAtd2Via2l0LWJvcmRlci1yYWRpdXM6IDVweDtcbiAgLW1vei1ib3JkZXItcmFkaXVzOiA1cHg7XG4gIC1tcy1ib3JkZXItcmFkaXVzOiA1cHg7XG4gIC1vLWJvcmRlci1yYWRpdXM6IDVweDtcbiAgYm9yZGVyLXJhZGl1czogNXB4O1xufVxuXG4jbW9jaGEgLnRlc3QucGFzcy5mYXN0IC5kdXJhdGlvbiB7XG4gIGRpc3BsYXk6IG5vbmU7XG59XG5cbiNtb2NoYSAudGVzdC5wZW5kaW5nIHtcbiAgY29sb3I6ICMwYjk3YzQ7XG59XG5cbiNtb2NoYSAudGVzdC5wZW5kaW5nOjpiZWZvcmUge1xuICBjb250ZW50OiAn4pemJztcbiAgY29sb3I6ICMwYjk3YzQ7XG59XG5cbiNtb2NoYSAudGVzdC5mYWlsIHtcbiAgY29sb3I6ICNjMDA7XG59XG5cbiNtb2NoYSAudGVzdC5mYWlsIHByZSB7XG4gIGNvbG9yOiBibGFjaztcbn1cblxuI21vY2hhIC50ZXN0LmZhaWw6OmJlZm9yZSB7XG4gIGNvbnRlbnQ6ICfinJYnO1xuICBmb250LXNpemU6IDEycHg7XG4gIGRpc3BsYXk6IGJsb2NrO1xuICBmbG9hdDogbGVmdDtcbiAgbWFyZ2luLXJpZ2h0OiA1cHg7XG4gIGNvbG9yOiAjYzAwO1xufVxuXG4jbW9jaGEgLnRlc3QgcHJlLmVycm9yIHtcbiAgY29sb3I6ICNjMDA7XG4gIG1heC1oZWlnaHQ6IDMwMHB4O1xuICBvdmVyZmxvdzogYXV0bztcbn1cblxuLyoqXG4gKiAoMSk6IGFwcHJveGltYXRlIGZvciBicm93c2VycyBub3Qgc3VwcG9ydGluZyBjYWxjXG4gKiAoMik6IDQyID0gMioxNSArIDIqMTAgKyAyKjEgKHBhZGRpbmcgKyBtYXJnaW4gKyBib3JkZXIpXG4gKiAgICAgIF5eIHNlcmlvdXNseVxuICovXG4jbW9jaGEgLnRlc3QgcHJlIHtcbiAgZGlzcGxheTogYmxvY2s7XG4gIGZsb2F0OiBsZWZ0O1xuICBjbGVhcjogbGVmdDtcbiAgZm9udDogMTJweC8xLjUgbW9uYWNvLCBtb25vc3BhY2U7XG4gIG1hcmdpbjogNXB4O1xuICBwYWRkaW5nOiAxNXB4O1xuICBib3JkZXI6IDFweCBzb2xpZCAjZWVlO1xuICBtYXgtd2lkdGg6IDg1JTsgLyooMSkqL1xuICBtYXgtd2lkdGg6IGNhbGMoMTAwJSAtIDQycHgpOyAvKigyKSovXG4gIHdvcmQtd3JhcDogYnJlYWstd29yZDtcbiAgYm9yZGVyLWJvdHRvbS1jb2xvcjogI2RkZDtcbiAgLXdlYmtpdC1ib3JkZXItcmFkaXVzOiAzcHg7XG4gIC13ZWJraXQtYm94LXNoYWRvdzogMCAxcHggM3B4ICNlZWU7XG4gIC1tb3otYm9yZGVyLXJhZGl1czogM3B4O1xuICAtbW96LWJveC1zaGFkb3c6IDAgMXB4IDNweCAjZWVlO1xuICBib3JkZXItcmFkaXVzOiAzcHg7XG59XG5cbiNtb2NoYSAudGVzdCBoMiB7XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbn1cblxuI21vY2hhIC50ZXN0IGEucmVwbGF5IHtcbiAgcG9zaXRpb246IGFic29sdXRlO1xuICB0b3A6IDNweDtcbiAgcmlnaHQ6IDA7XG4gIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcbiAgdmVydGljYWwtYWxpZ246IG1pZGRsZTtcbiAgZGlzcGxheTogYmxvY2s7XG4gIHdpZHRoOiAxNXB4O1xuICBoZWlnaHQ6IDE1cHg7XG4gIGxpbmUtaGVpZ2h0OiAxNXB4O1xuICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gIGJhY2tncm91bmQ6ICNlZWU7XG4gIGZvbnQtc2l6ZTogMTVweDtcbiAgLW1vei1ib3JkZXItcmFkaXVzOiAxNXB4O1xuICBib3JkZXItcmFkaXVzOiAxNXB4O1xuICAtd2Via2l0LXRyYW5zaXRpb246IG9wYWNpdHkgMjAwbXM7XG4gIC1tb3otdHJhbnNpdGlvbjogb3BhY2l0eSAyMDBtcztcbiAgdHJhbnNpdGlvbjogb3BhY2l0eSAyMDBtcztcbiAgb3BhY2l0eTogMC4zO1xuICBjb2xvcjogIzg4ODtcbn1cblxuI21vY2hhIC50ZXN0OmhvdmVyIGEucmVwbGF5IHtcbiAgb3BhY2l0eTogMTtcbn1cblxuI21vY2hhLXJlcG9ydC5wYXNzIC50ZXN0LmZhaWwge1xuICBkaXNwbGF5OiBub25lO1xufVxuXG4jbW9jaGEtcmVwb3J0LmZhaWwgLnRlc3QucGFzcyB7XG4gIGRpc3BsYXk6IG5vbmU7XG59XG5cbiNtb2NoYS1yZXBvcnQucGVuZGluZyAudGVzdC5wYXNzLFxuI21vY2hhLXJlcG9ydC5wZW5kaW5nIC50ZXN0LmZhaWwge1xuICBkaXNwbGF5OiBub25lO1xufVxuI21vY2hhLXJlcG9ydC5wZW5kaW5nIC50ZXN0LnBhc3MucGVuZGluZyB7XG4gIGRpc3BsYXk6IGJsb2NrO1xufVxuXG4jbW9jaGEtZXJyb3Ige1xuICBjb2xvcjogI2MwMDtcbiAgZm9udC1zaXplOiAxLjVlbTtcbiAgZm9udC13ZWlnaHQ6IDEwMDtcbiAgbGV0dGVyLXNwYWNpbmc6IDFweDtcbn1cblxuI21vY2hhLXN0YXRzIHtcbiAgcG9zaXRpb246IGZpeGVkO1xuICB0b3A6IDE1cHg7XG4gIHJpZ2h0OiAxMHB4O1xuICBmb250LXNpemU6IDEycHg7XG4gIG1hcmdpbjogMDtcbiAgY29sb3I6ICM4ODg7XG4gIHotaW5kZXg6IDE7XG59XG5cbiNtb2NoYS1zdGF0cyAucHJvZ3Jlc3Mge1xuICBmbG9hdDogcmlnaHQ7XG4gIHBhZGRpbmctdG9wOiAwO1xufVxuXG4jbW9jaGEtc3RhdHMgZW0ge1xuICBjb2xvcjogYmxhY2s7XG59XG5cbiNtb2NoYS1zdGF0cyBhIHtcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xuICBjb2xvcjogaW5oZXJpdDtcbn1cblxuI21vY2hhLXN0YXRzIGE6aG92ZXIge1xuICBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTtcbn1cblxuI21vY2hhLXN0YXRzIGxpIHtcbiAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICBtYXJnaW46IDAgNXB4O1xuICBsaXN0LXN0eWxlOiBub25lO1xuICBwYWRkaW5nLXRvcDogMTFweDtcbn1cblxuI21vY2hhLXN0YXRzIGNhbnZhcyB7XG4gIHdpZHRoOiA0MHB4O1xuICBoZWlnaHQ6IDQwcHg7XG59XG5cbiNtb2NoYSBjb2RlIC5jb21tZW50IHsgY29sb3I6ICNkZGQ7IH1cbiNtb2NoYSBjb2RlIC5pbml0IHsgY29sb3I6ICMyZjZmYWQ7IH1cbiNtb2NoYSBjb2RlIC5zdHJpbmcgeyBjb2xvcjogIzU4OTBhZDsgfVxuI21vY2hhIGNvZGUgLmtleXdvcmQgeyBjb2xvcjogIzhhNjM0MzsgfVxuI21vY2hhIGNvZGUgLm51bWJlciB7IGNvbG9yOiAjMmY2ZmFkOyB9XG5cbkBtZWRpYSBzY3JlZW4gYW5kIChtYXgtZGV2aWNlLXdpZHRoOiA0ODBweCkge1xuICAjbW9jaGEge1xuICAgIG1hcmdpbjogNjBweCAwcHg7XG4gIH1cblxuICAjbW9jaGEgI3N0YXRzIHtcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIH1cbn1cbiIsIjsoZnVuY3Rpb24oKXtcblxuLyoqXG4gKiBSZXF1aXJlIHRoZSBnaXZlbiBwYXRoLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gKiBAcmV0dXJuIHtPYmplY3R9IGV4cG9ydHNcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gcmVxdWlyZShwYXRoLCBwYXJlbnQsIG9yaWcpIHtcbiAgdmFyIHJlc29sdmVkID0gcmVxdWlyZS5yZXNvbHZlKHBhdGgpO1xuXG4gIC8vIGxvb2t1cCBmYWlsZWRcbiAgaWYgKG51bGwgPT0gcmVzb2x2ZWQpIHtcbiAgICBvcmlnID0gb3JpZyB8fCBwYXRoO1xuICAgIHBhcmVudCA9IHBhcmVudCB8fCAncm9vdCc7XG4gICAgdmFyIGVyciA9IG5ldyBFcnJvcignRmFpbGVkIHRvIHJlcXVpcmUgXCInICsgb3JpZyArICdcIiBmcm9tIFwiJyArIHBhcmVudCArICdcIicpO1xuICAgIGVyci5wYXRoID0gb3JpZztcbiAgICBlcnIucGFyZW50ID0gcGFyZW50O1xuICAgIGVyci5yZXF1aXJlID0gdHJ1ZTtcbiAgICB0aHJvdyBlcnI7XG4gIH1cblxuICB2YXIgbW9kdWxlID0gcmVxdWlyZS5tb2R1bGVzW3Jlc29sdmVkXTtcblxuICAvLyBwZXJmb3JtIHJlYWwgcmVxdWlyZSgpXG4gIC8vIGJ5IGludm9raW5nIHRoZSBtb2R1bGUnc1xuICAvLyByZWdpc3RlcmVkIGZ1bmN0aW9uXG4gIGlmICghbW9kdWxlLl9yZXNvbHZpbmcgJiYgIW1vZHVsZS5leHBvcnRzKSB7XG4gICAgdmFyIG1vZCA9IHt9O1xuICAgIG1vZC5leHBvcnRzID0ge307XG4gICAgbW9kLmNsaWVudCA9IG1vZC5jb21wb25lbnQgPSB0cnVlO1xuICAgIG1vZHVsZS5fcmVzb2x2aW5nID0gdHJ1ZTtcbiAgICBtb2R1bGUuY2FsbCh0aGlzLCBtb2QuZXhwb3J0cywgcmVxdWlyZS5yZWxhdGl2ZShyZXNvbHZlZCksIG1vZCk7XG4gICAgZGVsZXRlIG1vZHVsZS5fcmVzb2x2aW5nO1xuICAgIG1vZHVsZS5leHBvcnRzID0gbW9kLmV4cG9ydHM7XG4gIH1cblxuICByZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbi8qKlxuICogUmVnaXN0ZXJlZCBtb2R1bGVzLlxuICovXG5cbnJlcXVpcmUubW9kdWxlcyA9IHt9O1xuXG4vKipcbiAqIFJlZ2lzdGVyZWQgYWxpYXNlcy5cbiAqL1xuXG5yZXF1aXJlLmFsaWFzZXMgPSB7fTtcblxuLyoqXG4gKiBSZXNvbHZlIGBwYXRoYC5cbiAqXG4gKiBMb29rdXA6XG4gKlxuICogICAtIFBBVEgvaW5kZXguanNcbiAqICAgLSBQQVRILmpzXG4gKiAgIC0gUEFUSFxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gKiBAcmV0dXJuIHtTdHJpbmd9IHBhdGggb3IgbnVsbFxuICogQGFwaSBwcml2YXRlXG4gKi9cblxucmVxdWlyZS5yZXNvbHZlID0gZnVuY3Rpb24ocGF0aCkge1xuICBpZiAocGF0aC5jaGFyQXQoMCkgPT09ICcvJykgcGF0aCA9IHBhdGguc2xpY2UoMSk7XG5cbiAgdmFyIHBhdGhzID0gW1xuICAgIHBhdGgsXG4gICAgcGF0aCArICcuanMnLFxuICAgIHBhdGggKyAnLmpzb24nLFxuICAgIHBhdGggKyAnL2luZGV4LmpzJyxcbiAgICBwYXRoICsgJy9pbmRleC5qc29uJ1xuICBdO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcGF0aHMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgcGF0aCA9IHBhdGhzW2ldO1xuICAgIGlmIChyZXF1aXJlLm1vZHVsZXMuaGFzT3duUHJvcGVydHkocGF0aCkpIHJldHVybiBwYXRoO1xuICAgIGlmIChyZXF1aXJlLmFsaWFzZXMuaGFzT3duUHJvcGVydHkocGF0aCkpIHJldHVybiByZXF1aXJlLmFsaWFzZXNbcGF0aF07XG4gIH1cbn07XG5cbi8qKlxuICogTm9ybWFsaXplIGBwYXRoYCByZWxhdGl2ZSB0byB0aGUgY3VycmVudCBwYXRoLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBjdXJyXG4gKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxucmVxdWlyZS5ub3JtYWxpemUgPSBmdW5jdGlvbihjdXJyLCBwYXRoKSB7XG4gIHZhciBzZWdzID0gW107XG5cbiAgaWYgKCcuJyAhPSBwYXRoLmNoYXJBdCgwKSkgcmV0dXJuIHBhdGg7XG5cbiAgY3VyciA9IGN1cnIuc3BsaXQoJy8nKTtcbiAgcGF0aCA9IHBhdGguc3BsaXQoJy8nKTtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IHBhdGgubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoJy4uJyA9PSBwYXRoW2ldKSB7XG4gICAgICBjdXJyLnBvcCgpO1xuICAgIH0gZWxzZSBpZiAoJy4nICE9IHBhdGhbaV0gJiYgJycgIT0gcGF0aFtpXSkge1xuICAgICAgc2Vncy5wdXNoKHBhdGhbaV0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBjdXJyLmNvbmNhdChzZWdzKS5qb2luKCcvJyk7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVyIG1vZHVsZSBhdCBgcGF0aGAgd2l0aCBjYWxsYmFjayBgZGVmaW5pdGlvbmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGRlZmluaXRpb25cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbnJlcXVpcmUucmVnaXN0ZXIgPSBmdW5jdGlvbihwYXRoLCBkZWZpbml0aW9uKSB7XG4gIHJlcXVpcmUubW9kdWxlc1twYXRoXSA9IGRlZmluaXRpb247XG59O1xuXG4vKipcbiAqIEFsaWFzIGEgbW9kdWxlIGRlZmluaXRpb24uXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGZyb21cbiAqIEBwYXJhbSB7U3RyaW5nfSB0b1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxucmVxdWlyZS5hbGlhcyA9IGZ1bmN0aW9uKGZyb20sIHRvKSB7XG4gIGlmICghcmVxdWlyZS5tb2R1bGVzLmhhc093blByb3BlcnR5KGZyb20pKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gYWxpYXMgXCInICsgZnJvbSArICdcIiwgaXQgZG9lcyBub3QgZXhpc3QnKTtcbiAgfVxuICByZXF1aXJlLmFsaWFzZXNbdG9dID0gZnJvbTtcbn07XG5cbi8qKlxuICogUmV0dXJuIGEgcmVxdWlyZSBmdW5jdGlvbiByZWxhdGl2ZSB0byB0aGUgYHBhcmVudGAgcGF0aC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFyZW50XG4gKiBAcmV0dXJuIHtGdW5jdGlvbn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbnJlcXVpcmUucmVsYXRpdmUgPSBmdW5jdGlvbihwYXJlbnQpIHtcbiAgdmFyIHAgPSByZXF1aXJlLm5vcm1hbGl6ZShwYXJlbnQsICcuLicpO1xuXG4gIC8qKlxuICAgKiBsYXN0SW5kZXhPZiBoZWxwZXIuXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGxhc3RJbmRleE9mKGFyciwgb2JqKSB7XG4gICAgdmFyIGkgPSBhcnIubGVuZ3RoO1xuICAgIHdoaWxlIChpLS0pIHtcbiAgICAgIGlmIChhcnJbaV0gPT09IG9iaikgcmV0dXJuIGk7XG4gICAgfVxuICAgIHJldHVybiAtMTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgcmVsYXRpdmUgcmVxdWlyZSgpIGl0c2VsZi5cbiAgICovXG5cbiAgZnVuY3Rpb24gbG9jYWxSZXF1aXJlKHBhdGgpIHtcbiAgICB2YXIgcmVzb2x2ZWQgPSBsb2NhbFJlcXVpcmUucmVzb2x2ZShwYXRoKTtcbiAgICByZXR1cm4gcmVxdWlyZShyZXNvbHZlZCwgcGFyZW50LCBwYXRoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNvbHZlIHJlbGF0aXZlIHRvIHRoZSBwYXJlbnQuXG4gICAqL1xuXG4gIGxvY2FsUmVxdWlyZS5yZXNvbHZlID0gZnVuY3Rpb24ocGF0aCkge1xuICAgIHZhciBjID0gcGF0aC5jaGFyQXQoMCk7XG4gICAgaWYgKCcvJyA9PSBjKSByZXR1cm4gcGF0aC5zbGljZSgxKTtcbiAgICBpZiAoJy4nID09IGMpIHJldHVybiByZXF1aXJlLm5vcm1hbGl6ZShwLCBwYXRoKTtcblxuICAgIC8vIHJlc29sdmUgZGVwcyBieSByZXR1cm5pbmdcbiAgICAvLyB0aGUgZGVwIGluIHRoZSBuZWFyZXN0IFwiZGVwc1wiXG4gICAgLy8gZGlyZWN0b3J5XG4gICAgdmFyIHNlZ3MgPSBwYXJlbnQuc3BsaXQoJy8nKTtcbiAgICB2YXIgaSA9IGxhc3RJbmRleE9mKHNlZ3MsICdkZXBzJykgKyAxO1xuICAgIGlmICghaSkgaSA9IDA7XG4gICAgcGF0aCA9IHNlZ3Muc2xpY2UoMCwgaSArIDEpLmpvaW4oJy8nKSArICcvZGVwcy8nICsgcGF0aDtcbiAgICByZXR1cm4gcGF0aDtcbiAgfTtcblxuICAvKipcbiAgICogQ2hlY2sgaWYgbW9kdWxlIGlzIGRlZmluZWQgYXQgYHBhdGhgLlxuICAgKi9cblxuICBsb2NhbFJlcXVpcmUuZXhpc3RzID0gZnVuY3Rpb24ocGF0aCkge1xuICAgIHJldHVybiByZXF1aXJlLm1vZHVsZXMuaGFzT3duUHJvcGVydHkobG9jYWxSZXF1aXJlLnJlc29sdmUocGF0aCkpO1xuICB9O1xuXG4gIHJldHVybiBsb2NhbFJlcXVpcmU7XG59O1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWlqcy1hc3NlcnRpb24tZXJyb3IvaW5kZXguanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogYXNzZXJ0aW9uLWVycm9yXG4gKiBDb3B5cmlnaHQoYykgMjAxMyBKYWtlIEx1ZXIgPGpha2VAcXVhbGlhbmN5LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qIVxuICogUmV0dXJuIGEgZnVuY3Rpb24gdGhhdCB3aWxsIGNvcHkgcHJvcGVydGllcyBmcm9tXG4gKiBvbmUgb2JqZWN0IHRvIGFub3RoZXIgZXhjbHVkaW5nIGFueSBvcmlnaW5hbGx5XG4gKiBsaXN0ZWQuIFJldHVybmVkIGZ1bmN0aW9uIHdpbGwgY3JlYXRlIGEgbmV3IGB7fWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGV4Y2x1ZGVkIHByb3BlcnRpZXMgLi4uXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn1cbiAqL1xuXG5mdW5jdGlvbiBleGNsdWRlICgpIHtcbiAgdmFyIGV4Y2x1ZGVzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXG4gIGZ1bmN0aW9uIGV4Y2x1ZGVQcm9wcyAocmVzLCBvYmopIHtcbiAgICBPYmplY3Qua2V5cyhvYmopLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgaWYgKCF+ZXhjbHVkZXMuaW5kZXhPZihrZXkpKSByZXNba2V5XSA9IG9ialtrZXldO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIGZ1bmN0aW9uIGV4dGVuZEV4Y2x1ZGUgKCkge1xuICAgIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMpXG4gICAgICAsIGkgPSAwXG4gICAgICAsIHJlcyA9IHt9O1xuXG4gICAgZm9yICg7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBleGNsdWRlUHJvcHMocmVzLCBhcmdzW2ldKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzO1xuICB9O1xufTtcblxuLyohXG4gKiBQcmltYXJ5IEV4cG9ydHNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFzc2VydGlvbkVycm9yO1xuXG4vKipcbiAqICMjIyBBc3NlcnRpb25FcnJvclxuICpcbiAqIEFuIGV4dGVuc2lvbiBvZiB0aGUgSmF2YVNjcmlwdCBgRXJyb3JgIGNvbnN0cnVjdG9yIGZvclxuICogYXNzZXJ0aW9uIGFuZCB2YWxpZGF0aW9uIHNjZW5hcmlvcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICogQHBhcmFtIHtPYmplY3R9IHByb3BlcnRpZXMgdG8gaW5jbHVkZSAob3B0aW9uYWwpXG4gKiBAcGFyYW0ge2NhbGxlZX0gc3RhcnQgc3RhY2sgZnVuY3Rpb24gKG9wdGlvbmFsKVxuICovXG5cbmZ1bmN0aW9uIEFzc2VydGlvbkVycm9yIChtZXNzYWdlLCBfcHJvcHMsIHNzZikge1xuICB2YXIgZXh0ZW5kID0gZXhjbHVkZSgnbmFtZScsICdtZXNzYWdlJywgJ3N0YWNrJywgJ2NvbnN0cnVjdG9yJywgJ3RvSlNPTicpXG4gICAgLCBwcm9wcyA9IGV4dGVuZChfcHJvcHMgfHwge30pO1xuXG4gIC8vIGRlZmF1bHQgdmFsdWVzXG4gIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2UgfHwgJ1Vuc3BlY2lmaWVkIEFzc2VydGlvbkVycm9yJztcbiAgdGhpcy5zaG93RGlmZiA9IGZhbHNlO1xuXG4gIC8vIGNvcHkgZnJvbSBwcm9wZXJ0aWVzXG4gIGZvciAodmFyIGtleSBpbiBwcm9wcykge1xuICAgIHRoaXNba2V5XSA9IHByb3BzW2tleV07XG4gIH1cblxuICAvLyBjYXB0dXJlIHN0YWNrIHRyYWNlXG4gIHNzZiA9IHNzZiB8fCBhcmd1bWVudHMuY2FsbGVlO1xuICBpZiAoc3NmICYmIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKSB7XG4gICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcywgc3NmKTtcbiAgfVxufVxuXG4vKiFcbiAqIEluaGVyaXQgZnJvbSBFcnJvci5wcm90b3R5cGVcbiAqL1xuXG5Bc3NlcnRpb25FcnJvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKEVycm9yLnByb3RvdHlwZSk7XG5cbi8qIVxuICogU3RhdGljYWxseSBzZXQgbmFtZVxuICovXG5cbkFzc2VydGlvbkVycm9yLnByb3RvdHlwZS5uYW1lID0gJ0Fzc2VydGlvbkVycm9yJztcblxuLyohXG4gKiBFbnN1cmUgY29ycmVjdCBjb25zdHJ1Y3RvclxuICovXG5cbkFzc2VydGlvbkVycm9yLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IEFzc2VydGlvbkVycm9yO1xuXG4vKipcbiAqIEFsbG93IGVycm9ycyB0byBiZSBjb252ZXJ0ZWQgdG8gSlNPTiBmb3Igc3RhdGljIHRyYW5zZmVyLlxuICpcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gaW5jbHVkZSBzdGFjayAoZGVmYXVsdDogYHRydWVgKVxuICogQHJldHVybiB7T2JqZWN0fSBvYmplY3QgdGhhdCBjYW4gYmUgYEpTT04uc3RyaW5naWZ5YFxuICovXG5cbkFzc2VydGlvbkVycm9yLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoc3RhY2spIHtcbiAgdmFyIGV4dGVuZCA9IGV4Y2x1ZGUoJ2NvbnN0cnVjdG9yJywgJ3RvSlNPTicsICdzdGFjaycpXG4gICAgLCBwcm9wcyA9IGV4dGVuZCh7IG5hbWU6IHRoaXMubmFtZSB9LCB0aGlzKTtcblxuICAvLyBpbmNsdWRlIHN0YWNrIGlmIGV4aXN0cyBhbmQgbm90IHR1cm5lZCBvZmZcbiAgaWYgKGZhbHNlICE9PSBzdGFjayAmJiB0aGlzLnN0YWNrKSB7XG4gICAgcHJvcHMuc3RhY2sgPSB0aGlzLnN0YWNrO1xuICB9XG5cbiAgcmV0dXJuIHByb3BzO1xufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaWpzLXR5cGUtZGV0ZWN0L2xpYi90eXBlLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIHR5cGUtZGV0ZWN0XG4gKiBDb3B5cmlnaHQoYykgMjAxMyBqYWtlIGx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qIVxuICogUHJpbWFyeSBFeHBvcnRzXG4gKi9cblxudmFyIGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IGdldFR5cGU7XG5cbi8qIVxuICogRGV0ZWN0YWJsZSBqYXZhc2NyaXB0IG5hdGl2ZXNcbiAqL1xuXG52YXIgbmF0aXZlcyA9IHtcbiAgICAnW29iamVjdCBBcnJheV0nOiAnYXJyYXknXG4gICwgJ1tvYmplY3QgUmVnRXhwXSc6ICdyZWdleHAnXG4gICwgJ1tvYmplY3QgRnVuY3Rpb25dJzogJ2Z1bmN0aW9uJ1xuICAsICdbb2JqZWN0IEFyZ3VtZW50c10nOiAnYXJndW1lbnRzJ1xuICAsICdbb2JqZWN0IERhdGVdJzogJ2RhdGUnXG59O1xuXG4vKipcbiAqICMjIyB0eXBlT2YgKG9iailcbiAqXG4gKiBVc2Ugc2V2ZXJhbCBkaWZmZXJlbnQgdGVjaG5pcXVlcyB0byBkZXRlcm1pbmVcbiAqIHRoZSB0eXBlIG9mIG9iamVjdCBiZWluZyB0ZXN0ZWQuXG4gKlxuICpcbiAqIEBwYXJhbSB7TWl4ZWR9IG9iamVjdFxuICogQHJldHVybiB7U3RyaW5nfSBvYmplY3QgdHlwZVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBnZXRUeXBlIChvYmopIHtcbiAgdmFyIHN0ciA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmopO1xuICBpZiAobmF0aXZlc1tzdHJdKSByZXR1cm4gbmF0aXZlc1tzdHJdO1xuICBpZiAob2JqID09PSBudWxsKSByZXR1cm4gJ251bGwnO1xuICBpZiAob2JqID09PSB1bmRlZmluZWQpIHJldHVybiAndW5kZWZpbmVkJztcbiAgaWYgKG9iaiA9PT0gT2JqZWN0KG9iaikpIHJldHVybiAnb2JqZWN0JztcbiAgcmV0dXJuIHR5cGVvZiBvYmo7XG59XG5cbmV4cG9ydHMuTGlicmFyeSA9IExpYnJhcnk7XG5cbi8qKlxuICogIyMjIExpYnJhcnlcbiAqXG4gKiBDcmVhdGUgYSByZXBvc2l0b3J5IGZvciBjdXN0b20gdHlwZSBkZXRlY3Rpb24uXG4gKlxuICogYGBganNcbiAqIHZhciBsaWIgPSBuZXcgdHlwZS5MaWJyYXJ5O1xuICogYGBgXG4gKlxuICovXG5cbmZ1bmN0aW9uIExpYnJhcnkgKCkge1xuICB0aGlzLnRlc3RzID0ge307XG59XG5cbi8qKlxuICogIyMjIyAub2YgKG9iailcbiAqXG4gKiBFeHBvc2UgcmVwbGFjZW1lbnQgYHR5cGVvZmAgZGV0ZWN0aW9uIHRvIHRoZSBsaWJyYXJ5LlxuICpcbiAqIGBgYGpzXG4gKiBpZiAoJ3N0cmluZycgPT09IGxpYi5vZignaGVsbG8gd29ybGQnKSkge1xuICogICAvLyAuLi5cbiAqIH1cbiAqIGBgYFxuICpcbiAqIEBwYXJhbSB7TWl4ZWR9IG9iamVjdCB0byB0ZXN0XG4gKiBAcmV0dXJuIHtTdHJpbmd9IHR5cGVcbiAqL1xuXG5MaWJyYXJ5LnByb3RvdHlwZS5vZiA9IGdldFR5cGU7XG5cbi8qKlxuICogIyMjIyAuZGVmaW5lICh0eXBlLCB0ZXN0KVxuICpcbiAqIEFkZCBhIHRlc3QgdG8gZm9yIHRoZSBgLnRlc3QoKWAgYXNzZXJ0aW9uLlxuICpcbiAqIENhbiBiZSBkZWZpbmVkIGFzIGEgcmVndWxhciBleHByZXNzaW9uOlxuICpcbiAqIGBgYGpzXG4gKiBsaWIuZGVmaW5lKCdpbnQnLCAvXlswLTldKyQvKTtcbiAqIGBgYFxuICpcbiAqIC4uLiBvciBhcyBhIGZ1bmN0aW9uOlxuICpcbiAqIGBgYGpzXG4gKiBsaWIuZGVmaW5lKCdibG4nLCBmdW5jdGlvbiAob2JqKSB7XG4gKiAgIGlmICgnYm9vbGVhbicgPT09IGxpYi5vZihvYmopKSByZXR1cm4gdHJ1ZTtcbiAqICAgdmFyIGJsbnMgPSBbICd5ZXMnLCAnbm8nLCAndHJ1ZScsICdmYWxzZScsIDEsIDAgXTtcbiAqICAgaWYgKCdzdHJpbmcnID09PSBsaWIub2Yob2JqKSkgb2JqID0gb2JqLnRvTG93ZXJDYXNlKCk7XG4gKiAgIHJldHVybiAhISB+Ymxucy5pbmRleE9mKG9iaik7XG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlXG4gKiBAcGFyYW0ge1JlZ0V4cHxGdW5jdGlvbn0gdGVzdFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5MaWJyYXJ5LnByb3RvdHlwZS5kZWZpbmUgPSBmdW5jdGlvbiAodHlwZSwgdGVzdCkge1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkgcmV0dXJuIHRoaXMudGVzdHNbdHlwZV07XG4gIHRoaXMudGVzdHNbdHlwZV0gPSB0ZXN0O1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogIyMjIyAudGVzdCAob2JqLCB0ZXN0KVxuICpcbiAqIEFzc2VydCB0aGF0IGFuIG9iamVjdCBpcyBvZiB0eXBlLiBXaWxsIGZpcnN0XG4gKiBjaGVjayBuYXRpdmVzLCBhbmQgaWYgdGhhdCBkb2VzIG5vdCBwYXNzIGl0IHdpbGxcbiAqIHVzZSB0aGUgdXNlciBkZWZpbmVkIGN1c3RvbSB0ZXN0cy5cbiAqXG4gKiBgYGBqc1xuICogYXNzZXJ0KGxpYi50ZXN0KCcxJywgJ2ludCcpKTtcbiAqIGFzc2VydChsaWIudGVzdCgneWVzJywgJ2JsbicpKTtcbiAqIGBgYFxuICpcbiAqIEBwYXJhbSB7TWl4ZWR9IG9iamVjdFxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGVcbiAqIEByZXR1cm4ge0Jvb2xlYW59IHJlc3VsdFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5MaWJyYXJ5LnByb3RvdHlwZS50ZXN0ID0gZnVuY3Rpb24gKG9iaiwgdHlwZSkge1xuICBpZiAodHlwZSA9PT0gZ2V0VHlwZShvYmopKSByZXR1cm4gdHJ1ZTtcbiAgdmFyIHRlc3QgPSB0aGlzLnRlc3RzW3R5cGVdO1xuXG4gIGlmICh0ZXN0ICYmICdyZWdleHAnID09PSBnZXRUeXBlKHRlc3QpKSB7XG4gICAgcmV0dXJuIHRlc3QudGVzdChvYmopO1xuICB9IGVsc2UgaWYgKHRlc3QgJiYgJ2Z1bmN0aW9uJyA9PT0gZ2V0VHlwZSh0ZXN0KSkge1xuICAgIHJldHVybiB0ZXN0KG9iaik7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IFJlZmVyZW5jZUVycm9yKCdUeXBlIHRlc3QgXCInICsgdHlwZSArICdcIiBub3QgZGVmaW5lZCBvciBpbnZhbGlkLicpO1xuICB9XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpanMtZGVlcC1lcWwvbGliL2VxbC5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBkZWVwLWVxbFxuICogQ29weXJpZ2h0KGMpIDIwMTMgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKiFcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXNcbiAqL1xuXG52YXIgdHlwZSA9IHJlcXVpcmUoJ3R5cGUtZGV0ZWN0Jyk7XG5cbi8qIVxuICogQnVmZmVyLmlzQnVmZmVyIGJyb3dzZXIgc2hpbVxuICovXG5cbnZhciBCdWZmZXI7XG50cnkgeyBCdWZmZXIgPSByZXF1aXJlKCdidWZmZXInKS5CdWZmZXI7IH1cbmNhdGNoKGV4KSB7XG4gIEJ1ZmZlciA9IHt9O1xuICBCdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbigpIHsgcmV0dXJuIGZhbHNlOyB9XG59XG5cbi8qIVxuICogUHJpbWFyeSBFeHBvcnRcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGRlZXBFcXVhbDtcblxuLyoqXG4gKiBBc3NlcnQgc3VwZXItc3RyaWN0IChlZ2FsKSBlcXVhbGl0eSBiZXR3ZWVuXG4gKiB0d28gb2JqZWN0cyBvZiBhbnkgdHlwZS5cbiAqXG4gKiBAcGFyYW0ge01peGVkfSBhXG4gKiBAcGFyYW0ge01peGVkfSBiXG4gKiBAcGFyYW0ge0FycmF5fSBtZW1vaXNlZCAob3B0aW9uYWwpXG4gKiBAcmV0dXJuIHtCb29sZWFufSBlcXVhbCBtYXRjaFxuICovXG5cbmZ1bmN0aW9uIGRlZXBFcXVhbChhLCBiLCBtKSB7XG4gIGlmIChzYW1lVmFsdWUoYSwgYikpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBlbHNlIGlmICgnZGF0ZScgPT09IHR5cGUoYSkpIHtcbiAgICByZXR1cm4gZGF0ZUVxdWFsKGEsIGIpO1xuICB9IGVsc2UgaWYgKCdyZWdleHAnID09PSB0eXBlKGEpKSB7XG4gICAgcmV0dXJuIHJlZ2V4cEVxdWFsKGEsIGIpO1xuICB9IGVsc2UgaWYgKEJ1ZmZlci5pc0J1ZmZlcihhKSkge1xuICAgIHJldHVybiBidWZmZXJFcXVhbChhLCBiKTtcbiAgfSBlbHNlIGlmICgnYXJndW1lbnRzJyA9PT0gdHlwZShhKSkge1xuICAgIHJldHVybiBhcmd1bWVudHNFcXVhbChhLCBiLCBtKTtcbiAgfSBlbHNlIGlmICghdHlwZUVxdWFsKGEsIGIpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9IGVsc2UgaWYgKCgnb2JqZWN0JyAhPT0gdHlwZShhKSAmJiAnb2JqZWN0JyAhPT0gdHlwZShiKSlcbiAgJiYgKCdhcnJheScgIT09IHR5cGUoYSkgJiYgJ2FycmF5JyAhPT0gdHlwZShiKSkpIHtcbiAgICByZXR1cm4gc2FtZVZhbHVlKGEsIGIpO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBvYmplY3RFcXVhbChhLCBiLCBtKTtcbiAgfVxufVxuXG4vKiFcbiAqIFN0cmljdCAoZWdhbCkgZXF1YWxpdHkgdGVzdC4gRW5zdXJlcyB0aGF0IE5hTiBhbHdheXNcbiAqIGVxdWFscyBOYU4gYW5kIGAtMGAgZG9lcyBub3QgZXF1YWwgYCswYC5cbiAqXG4gKiBAcGFyYW0ge01peGVkfSBhXG4gKiBAcGFyYW0ge01peGVkfSBiXG4gKiBAcmV0dXJuIHtCb29sZWFufSBlcXVhbCBtYXRjaFxuICovXG5cbmZ1bmN0aW9uIHNhbWVWYWx1ZShhLCBiKSB7XG4gIGlmIChhID09PSBiKSByZXR1cm4gYSAhPT0gMCB8fCAxIC8gYSA9PT0gMSAvIGI7XG4gIHJldHVybiBhICE9PSBhICYmIGIgIT09IGI7XG59XG5cbi8qIVxuICogQ29tcGFyZSB0aGUgdHlwZXMgb2YgdHdvIGdpdmVuIG9iamVjdHMgYW5kXG4gKiByZXR1cm4gaWYgdGhleSBhcmUgZXF1YWwuIE5vdGUgdGhhdCBhbiBBcnJheVxuICogaGFzIGEgdHlwZSBvZiBgYXJyYXlgIChub3QgYG9iamVjdGApIGFuZCBhcmd1bWVudHNcbiAqIGhhdmUgYSB0eXBlIG9mIGBhcmd1bWVudHNgIChub3QgYGFycmF5YC9gb2JqZWN0YCkuXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gYVxuICogQHBhcmFtIHtNaXhlZH0gYlxuICogQHJldHVybiB7Qm9vbGVhbn0gcmVzdWx0XG4gKi9cblxuZnVuY3Rpb24gdHlwZUVxdWFsKGEsIGIpIHtcbiAgcmV0dXJuIHR5cGUoYSkgPT09IHR5cGUoYik7XG59XG5cbi8qIVxuICogQ29tcGFyZSB0d28gRGF0ZSBvYmplY3RzIGJ5IGFzc2VydGluZyB0aGF0XG4gKiB0aGUgdGltZSB2YWx1ZXMgYXJlIGVxdWFsIHVzaW5nIGBzYXZlVmFsdWVgLlxuICpcbiAqIEBwYXJhbSB7RGF0ZX0gYVxuICogQHBhcmFtIHtEYXRlfSBiXG4gKiBAcmV0dXJuIHtCb29sZWFufSByZXN1bHRcbiAqL1xuXG5mdW5jdGlvbiBkYXRlRXF1YWwoYSwgYikge1xuICBpZiAoJ2RhdGUnICE9PSB0eXBlKGIpKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBzYW1lVmFsdWUoYS5nZXRUaW1lKCksIGIuZ2V0VGltZSgpKTtcbn1cblxuLyohXG4gKiBDb21wYXJlIHR3byByZWd1bGFyIGV4cHJlc3Npb25zIGJ5IGNvbnZlcnRpbmcgdGhlbVxuICogdG8gc3RyaW5nIGFuZCBjaGVja2luZyBmb3IgYHNhbWVWYWx1ZWAuXG4gKlxuICogQHBhcmFtIHtSZWdFeHB9IGFcbiAqIEBwYXJhbSB7UmVnRXhwfSBiXG4gKiBAcmV0dXJuIHtCb29sZWFufSByZXN1bHRcbiAqL1xuXG5mdW5jdGlvbiByZWdleHBFcXVhbChhLCBiKSB7XG4gIGlmICgncmVnZXhwJyAhPT0gdHlwZShiKSkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gc2FtZVZhbHVlKGEudG9TdHJpbmcoKSwgYi50b1N0cmluZygpKTtcbn1cblxuLyohXG4gKiBBc3NlcnQgZGVlcCBlcXVhbGl0eSBvZiB0d28gYGFyZ3VtZW50c2Agb2JqZWN0cy5cbiAqIFVuZm9ydHVuYXRlbHksIHRoZXNlIG11c3QgYmUgc2xpY2VkIHRvIGFycmF5c1xuICogcHJpb3IgdG8gdGVzdCB0byBlbnN1cmUgbm8gYmFkIGJlaGF2aW9yLlxuICpcbiAqIEBwYXJhbSB7QXJndW1lbnRzfSBhXG4gKiBAcGFyYW0ge0FyZ3VtZW50c30gYlxuICogQHBhcmFtIHtBcnJheX0gbWVtb2l6ZSAob3B0aW9uYWwpXG4gKiBAcmV0dXJuIHtCb29sZWFufSByZXN1bHRcbiAqL1xuXG5mdW5jdGlvbiBhcmd1bWVudHNFcXVhbChhLCBiLCBtKSB7XG4gIGlmICgnYXJndW1lbnRzJyAhPT0gdHlwZShiKSkgcmV0dXJuIGZhbHNlO1xuICBhID0gW10uc2xpY2UuY2FsbChhKTtcbiAgYiA9IFtdLnNsaWNlLmNhbGwoYik7XG4gIHJldHVybiBkZWVwRXF1YWwoYSwgYiwgbSk7XG59XG5cbi8qIVxuICogR2V0IGVudW1lcmFibGUgcHJvcGVydGllcyBvZiBhIGdpdmVuIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gYVxuICogQHJldHVybiB7QXJyYXl9IHByb3BlcnR5IG5hbWVzXG4gKi9cblxuZnVuY3Rpb24gZW51bWVyYWJsZShhKSB7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIGEpIHJlcy5wdXNoKGtleSk7XG4gIHJldHVybiByZXM7XG59XG5cbi8qIVxuICogU2ltcGxlIGVxdWFsaXR5IGZvciBmbGF0IGl0ZXJhYmxlIG9iamVjdHNcbiAqIHN1Y2ggYXMgQXJyYXlzIG9yIE5vZGUuanMgYnVmZmVycy5cbiAqXG4gKiBAcGFyYW0ge0l0ZXJhYmxlfSBhXG4gKiBAcGFyYW0ge0l0ZXJhYmxlfSBiXG4gKiBAcmV0dXJuIHtCb29sZWFufSByZXN1bHRcbiAqL1xuXG5mdW5jdGlvbiBpdGVyYWJsZUVxdWFsKGEsIGIpIHtcbiAgaWYgKGEubGVuZ3RoICE9PSAgYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcblxuICB2YXIgaSA9IDA7XG4gIHZhciBtYXRjaCA9IHRydWU7XG5cbiAgZm9yICg7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGFbaV0gIT09IGJbaV0pIHtcbiAgICAgIG1hdGNoID0gZmFsc2U7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbWF0Y2g7XG59XG5cbi8qIVxuICogRXh0ZW5zaW9uIHRvIGBpdGVyYWJsZUVxdWFsYCBzcGVjaWZpY2FsbHlcbiAqIGZvciBOb2RlLmpzIEJ1ZmZlcnMuXG4gKlxuICogQHBhcmFtIHtCdWZmZXJ9IGFcbiAqIEBwYXJhbSB7TWl4ZWR9IGJcbiAqIEByZXR1cm4ge0Jvb2xlYW59IHJlc3VsdFxuICovXG5cbmZ1bmN0aW9uIGJ1ZmZlckVxdWFsKGEsIGIpIHtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoYikpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIGl0ZXJhYmxlRXF1YWwoYSwgYik7XG59XG5cbi8qIVxuICogQmxvY2sgZm9yIGBvYmplY3RFcXVhbGAgZW5zdXJpbmcgbm9uLWV4aXN0aW5nXG4gKiB2YWx1ZXMgZG9uJ3QgZ2V0IGluLlxuICpcbiAqIEBwYXJhbSB7TWl4ZWR9IG9iamVjdFxuICogQHJldHVybiB7Qm9vbGVhbn0gcmVzdWx0XG4gKi9cblxuZnVuY3Rpb24gaXNWYWx1ZShhKSB7XG4gIHJldHVybiBhICE9PSBudWxsICYmIGEgIT09IHVuZGVmaW5lZDtcbn1cblxuLyohXG4gKiBSZWN1cnNpdmVseSBjaGVjayB0aGUgZXF1YWxpdHkgb2YgdHdvIG9iamVjdHMuXG4gKiBPbmNlIGJhc2ljIHNhbWVuZXNzIGhhcyBiZWVuIGVzdGFibGlzaGVkIGl0IHdpbGxcbiAqIGRlZmVyIHRvIGBkZWVwRXF1YWxgIGZvciBlYWNoIGVudW1lcmFibGUga2V5XG4gKiBpbiB0aGUgb2JqZWN0LlxuICpcbiAqIEBwYXJhbSB7TWl4ZWR9IGFcbiAqIEBwYXJhbSB7TWl4ZWR9IGJcbiAqIEByZXR1cm4ge0Jvb2xlYW59IHJlc3VsdFxuICovXG5cbmZ1bmN0aW9uIG9iamVjdEVxdWFsKGEsIGIsIG0pIHtcbiAgaWYgKCFpc1ZhbHVlKGEpIHx8ICFpc1ZhbHVlKGIpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKGEucHJvdG90eXBlICE9PSBiLnByb3RvdHlwZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHZhciBpO1xuICBpZiAobSkge1xuICAgIGZvciAoaSA9IDA7IGkgPCBtLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoKG1baV1bMF0gPT09IGEgJiYgbVtpXVsxXSA9PT0gYilcbiAgICAgIHx8ICAobVtpXVswXSA9PT0gYiAmJiBtW2ldWzFdID09PSBhKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgbSA9IFtdO1xuICB9XG5cbiAgdHJ5IHtcbiAgICB2YXIga2EgPSBlbnVtZXJhYmxlKGEpO1xuICAgIHZhciBrYiA9IGVudW1lcmFibGUoYik7XG4gIH0gY2F0Y2ggKGV4KSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAga2Euc29ydCgpO1xuICBrYi5zb3J0KCk7XG5cbiAgaWYgKCFpdGVyYWJsZUVxdWFsKGthLCBrYikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBtLnB1c2goWyBhLCBiIF0pO1xuXG4gIHZhciBrZXk7XG4gIGZvciAoaSA9IGthLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAga2V5ID0ga2FbaV07XG4gICAgaWYgKCFkZWVwRXF1YWwoYVtrZXldLCBiW2tleV0sIG0pKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvaW5kZXguanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9saWIvY2hhaScpO1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIGNoYWlcbiAqIENvcHlyaWdodChjKSAyMDExLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG52YXIgdXNlZCA9IFtdXG4gICwgZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8qIVxuICogQ2hhaSB2ZXJzaW9uXG4gKi9cblxuZXhwb3J0cy52ZXJzaW9uID0gJzEuOS4xJztcblxuLyohXG4gKiBBc3NlcnRpb24gRXJyb3JcbiAqL1xuXG5leHBvcnRzLkFzc2VydGlvbkVycm9yID0gcmVxdWlyZSgnYXNzZXJ0aW9uLWVycm9yJyk7XG5cbi8qIVxuICogVXRpbHMgZm9yIHBsdWdpbnMgKG5vdCBleHBvcnRlZClcbiAqL1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vY2hhaS91dGlscycpO1xuXG4vKipcbiAqICMgLnVzZShmdW5jdGlvbilcbiAqXG4gKiBQcm92aWRlcyBhIHdheSB0byBleHRlbmQgdGhlIGludGVybmFscyBvZiBDaGFpXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn1cbiAqIEByZXR1cm5zIHt0aGlzfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZXhwb3J0cy51c2UgPSBmdW5jdGlvbiAoZm4pIHtcbiAgaWYgKCF+dXNlZC5pbmRleE9mKGZuKSkge1xuICAgIGZuKHRoaXMsIHV0aWwpO1xuICAgIHVzZWQucHVzaChmbik7XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qIVxuICogQ29uZmlndXJhdGlvblxuICovXG5cbnZhciBjb25maWcgPSByZXF1aXJlKCcuL2NoYWkvY29uZmlnJyk7XG5leHBvcnRzLmNvbmZpZyA9IGNvbmZpZztcblxuLyohXG4gKiBQcmltYXJ5IGBBc3NlcnRpb25gIHByb3RvdHlwZVxuICovXG5cbnZhciBhc3NlcnRpb24gPSByZXF1aXJlKCcuL2NoYWkvYXNzZXJ0aW9uJyk7XG5leHBvcnRzLnVzZShhc3NlcnRpb24pO1xuXG4vKiFcbiAqIENvcmUgQXNzZXJ0aW9uc1xuICovXG5cbnZhciBjb3JlID0gcmVxdWlyZSgnLi9jaGFpL2NvcmUvYXNzZXJ0aW9ucycpO1xuZXhwb3J0cy51c2UoY29yZSk7XG5cbi8qIVxuICogRXhwZWN0IGludGVyZmFjZVxuICovXG5cbnZhciBleHBlY3QgPSByZXF1aXJlKCcuL2NoYWkvaW50ZXJmYWNlL2V4cGVjdCcpO1xuZXhwb3J0cy51c2UoZXhwZWN0KTtcblxuLyohXG4gKiBTaG91bGQgaW50ZXJmYWNlXG4gKi9cblxudmFyIHNob3VsZCA9IHJlcXVpcmUoJy4vY2hhaS9pbnRlcmZhY2Uvc2hvdWxkJyk7XG5leHBvcnRzLnVzZShzaG91bGQpO1xuXG4vKiFcbiAqIEFzc2VydCBpbnRlcmZhY2VcbiAqL1xuXG52YXIgYXNzZXJ0ID0gcmVxdWlyZSgnLi9jaGFpL2ludGVyZmFjZS9hc3NlcnQnKTtcbmV4cG9ydHMudXNlKGFzc2VydCk7XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvYXNzZXJ0aW9uLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIGNoYWlcbiAqIGh0dHA6Ly9jaGFpanMuY29tXG4gKiBDb3B5cmlnaHQoYykgMjAxMS0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxudmFyIGNvbmZpZyA9IHJlcXVpcmUoJy4vY29uZmlnJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKF9jaGFpLCB1dGlsKSB7XG4gIC8qIVxuICAgKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICAgKi9cblxuICB2YXIgQXNzZXJ0aW9uRXJyb3IgPSBfY2hhaS5Bc3NlcnRpb25FcnJvclxuICAgICwgZmxhZyA9IHV0aWwuZmxhZztcblxuICAvKiFcbiAgICogTW9kdWxlIGV4cG9ydC5cbiAgICovXG5cbiAgX2NoYWkuQXNzZXJ0aW9uID0gQXNzZXJ0aW9uO1xuXG4gIC8qIVxuICAgKiBBc3NlcnRpb24gQ29uc3RydWN0b3JcbiAgICpcbiAgICogQ3JlYXRlcyBvYmplY3QgZm9yIGNoYWluaW5nLlxuICAgKlxuICAgKiBAYXBpIHByaXZhdGVcbiAgICovXG5cbiAgZnVuY3Rpb24gQXNzZXJ0aW9uIChvYmosIG1zZywgc3RhY2spIHtcbiAgICBmbGFnKHRoaXMsICdzc2ZpJywgc3RhY2sgfHwgYXJndW1lbnRzLmNhbGxlZSk7XG4gICAgZmxhZyh0aGlzLCAnb2JqZWN0Jywgb2JqKTtcbiAgICBmbGFnKHRoaXMsICdtZXNzYWdlJywgbXNnKTtcbiAgfVxuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShBc3NlcnRpb24sICdpbmNsdWRlU3RhY2snLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgIGNvbnNvbGUud2FybignQXNzZXJ0aW9uLmluY2x1ZGVTdGFjayBpcyBkZXByZWNhdGVkLCB1c2UgY2hhaS5jb25maWcuaW5jbHVkZVN0YWNrIGluc3RlYWQuJyk7XG4gICAgICByZXR1cm4gY29uZmlnLmluY2x1ZGVTdGFjaztcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIGNvbnNvbGUud2FybignQXNzZXJ0aW9uLmluY2x1ZGVTdGFjayBpcyBkZXByZWNhdGVkLCB1c2UgY2hhaS5jb25maWcuaW5jbHVkZVN0YWNrIGluc3RlYWQuJyk7XG4gICAgICBjb25maWcuaW5jbHVkZVN0YWNrID0gdmFsdWU7XG4gICAgfVxuICB9KTtcblxuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoQXNzZXJ0aW9uLCAnc2hvd0RpZmYnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgIGNvbnNvbGUud2FybignQXNzZXJ0aW9uLnNob3dEaWZmIGlzIGRlcHJlY2F0ZWQsIHVzZSBjaGFpLmNvbmZpZy5zaG93RGlmZiBpbnN0ZWFkLicpO1xuICAgICAgcmV0dXJuIGNvbmZpZy5zaG93RGlmZjtcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIGNvbnNvbGUud2FybignQXNzZXJ0aW9uLnNob3dEaWZmIGlzIGRlcHJlY2F0ZWQsIHVzZSBjaGFpLmNvbmZpZy5zaG93RGlmZiBpbnN0ZWFkLicpO1xuICAgICAgY29uZmlnLnNob3dEaWZmID0gdmFsdWU7XG4gICAgfVxuICB9KTtcblxuICBBc3NlcnRpb24uYWRkUHJvcGVydHkgPSBmdW5jdGlvbiAobmFtZSwgZm4pIHtcbiAgICB1dGlsLmFkZFByb3BlcnR5KHRoaXMucHJvdG90eXBlLCBuYW1lLCBmbik7XG4gIH07XG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCA9IGZ1bmN0aW9uIChuYW1lLCBmbikge1xuICAgIHV0aWwuYWRkTWV0aG9kKHRoaXMucHJvdG90eXBlLCBuYW1lLCBmbik7XG4gIH07XG5cbiAgQXNzZXJ0aW9uLmFkZENoYWluYWJsZU1ldGhvZCA9IGZ1bmN0aW9uIChuYW1lLCBmbiwgY2hhaW5pbmdCZWhhdmlvcikge1xuICAgIHV0aWwuYWRkQ2hhaW5hYmxlTWV0aG9kKHRoaXMucHJvdG90eXBlLCBuYW1lLCBmbiwgY2hhaW5pbmdCZWhhdmlvcik7XG4gIH07XG5cbiAgQXNzZXJ0aW9uLm92ZXJ3cml0ZVByb3BlcnR5ID0gZnVuY3Rpb24gKG5hbWUsIGZuKSB7XG4gICAgdXRpbC5vdmVyd3JpdGVQcm9wZXJ0eSh0aGlzLnByb3RvdHlwZSwgbmFtZSwgZm4pO1xuICB9O1xuXG4gIEFzc2VydGlvbi5vdmVyd3JpdGVNZXRob2QgPSBmdW5jdGlvbiAobmFtZSwgZm4pIHtcbiAgICB1dGlsLm92ZXJ3cml0ZU1ldGhvZCh0aGlzLnByb3RvdHlwZSwgbmFtZSwgZm4pO1xuICB9O1xuXG4gIEFzc2VydGlvbi5vdmVyd3JpdGVDaGFpbmFibGVNZXRob2QgPSBmdW5jdGlvbiAobmFtZSwgZm4sIGNoYWluaW5nQmVoYXZpb3IpIHtcbiAgICB1dGlsLm92ZXJ3cml0ZUNoYWluYWJsZU1ldGhvZCh0aGlzLnByb3RvdHlwZSwgbmFtZSwgZm4sIGNoYWluaW5nQmVoYXZpb3IpO1xuICB9O1xuXG4gIC8qIVxuICAgKiAjIyMgLmFzc2VydChleHByZXNzaW9uLCBtZXNzYWdlLCBuZWdhdGVNZXNzYWdlLCBleHBlY3RlZCwgYWN0dWFsKVxuICAgKlxuICAgKiBFeGVjdXRlcyBhbiBleHByZXNzaW9uIGFuZCBjaGVjayBleHBlY3RhdGlvbnMuIFRocm93cyBBc3NlcnRpb25FcnJvciBmb3IgcmVwb3J0aW5nIGlmIHRlc3QgZG9lc24ndCBwYXNzLlxuICAgKlxuICAgKiBAbmFtZSBhc3NlcnRcbiAgICogQHBhcmFtIHtQaGlsb3NvcGhpY2FsfSBleHByZXNzaW9uIHRvIGJlIHRlc3RlZFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSB0byBkaXNwbGF5IGlmIGZhaWxzXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBuZWdhdGVkTWVzc2FnZSB0byBkaXNwbGF5IGlmIG5lZ2F0ZWQgZXhwcmVzc2lvbiBmYWlsc1xuICAgKiBAcGFyYW0ge01peGVkfSBleHBlY3RlZCB2YWx1ZSAocmVtZW1iZXIgdG8gY2hlY2sgZm9yIG5lZ2F0aW9uKVxuICAgKiBAcGFyYW0ge01peGVkfSBhY3R1YWwgKG9wdGlvbmFsKSB3aWxsIGRlZmF1bHQgdG8gYHRoaXMub2JqYFxuICAgKiBAYXBpIHByaXZhdGVcbiAgICovXG5cbiAgQXNzZXJ0aW9uLnByb3RvdHlwZS5hc3NlcnQgPSBmdW5jdGlvbiAoZXhwciwgbXNnLCBuZWdhdGVNc2csIGV4cGVjdGVkLCBfYWN0dWFsLCBzaG93RGlmZikge1xuICAgIHZhciBvayA9IHV0aWwudGVzdCh0aGlzLCBhcmd1bWVudHMpO1xuICAgIGlmICh0cnVlICE9PSBzaG93RGlmZikgc2hvd0RpZmYgPSBmYWxzZTtcbiAgICBpZiAodHJ1ZSAhPT0gY29uZmlnLnNob3dEaWZmKSBzaG93RGlmZiA9IGZhbHNlO1xuXG4gICAgaWYgKCFvaykge1xuICAgICAgdmFyIG1zZyA9IHV0aWwuZ2V0TWVzc2FnZSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICAgICwgYWN0dWFsID0gdXRpbC5nZXRBY3R1YWwodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHRocm93IG5ldyBBc3NlcnRpb25FcnJvcihtc2csIHtcbiAgICAgICAgICBhY3R1YWw6IGFjdHVhbFxuICAgICAgICAsIGV4cGVjdGVkOiBleHBlY3RlZFxuICAgICAgICAsIHNob3dEaWZmOiBzaG93RGlmZlxuICAgICAgfSwgKGNvbmZpZy5pbmNsdWRlU3RhY2spID8gdGhpcy5hc3NlcnQgOiBmbGFnKHRoaXMsICdzc2ZpJykpO1xuICAgIH1cbiAgfTtcblxuICAvKiFcbiAgICogIyMjIC5fb2JqXG4gICAqXG4gICAqIFF1aWNrIHJlZmVyZW5jZSB0byBzdG9yZWQgYGFjdHVhbGAgdmFsdWUgZm9yIHBsdWdpbiBkZXZlbG9wZXJzLlxuICAgKlxuICAgKiBAYXBpIHByaXZhdGVcbiAgICovXG5cbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KEFzc2VydGlvbi5wcm90b3R5cGUsICdfb2JqJyxcbiAgICB7IGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG4gICAgICB9XG4gICAgLCBzZXQ6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICAgICAgZmxhZyh0aGlzLCAnb2JqZWN0JywgdmFsKTtcbiAgICAgIH1cbiAgfSk7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL2NvbmZpZy5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xubW9kdWxlLmV4cG9ydHMgPSB7XG5cbiAgLyoqXG4gICAqICMjIyBjb25maWcuaW5jbHVkZVN0YWNrXG4gICAqXG4gICAqIFVzZXIgY29uZmlndXJhYmxlIHByb3BlcnR5LCBpbmZsdWVuY2VzIHdoZXRoZXIgc3RhY2sgdHJhY2VcbiAgICogaXMgaW5jbHVkZWQgaW4gQXNzZXJ0aW9uIGVycm9yIG1lc3NhZ2UuIERlZmF1bHQgb2YgZmFsc2VcbiAgICogc3VwcHJlc3NlcyBzdGFjayB0cmFjZSBpbiB0aGUgZXJyb3IgbWVzc2FnZS5cbiAgICpcbiAgICogICAgIGNoYWkuY29uZmlnLmluY2x1ZGVTdGFjayA9IHRydWU7ICAvLyBlbmFibGUgc3RhY2sgb24gZXJyb3JcbiAgICpcbiAgICogQHBhcmFtIHtCb29sZWFufVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICAgaW5jbHVkZVN0YWNrOiBmYWxzZSxcblxuICAvKipcbiAgICogIyMjIGNvbmZpZy5zaG93RGlmZlxuICAgKlxuICAgKiBVc2VyIGNvbmZpZ3VyYWJsZSBwcm9wZXJ0eSwgaW5mbHVlbmNlcyB3aGV0aGVyIG9yIG5vdFxuICAgKiB0aGUgYHNob3dEaWZmYCBmbGFnIHNob3VsZCBiZSBpbmNsdWRlZCBpbiB0aGUgdGhyb3duXG4gICAqIEFzc2VydGlvbkVycm9ycy4gYGZhbHNlYCB3aWxsIGFsd2F5cyBiZSBgZmFsc2VgOyBgdHJ1ZWBcbiAgICogd2lsbCBiZSB0cnVlIHdoZW4gdGhlIGFzc2VydGlvbiBoYXMgcmVxdWVzdGVkIGEgZGlmZlxuICAgKiBiZSBzaG93bi5cbiAgICpcbiAgICogQHBhcmFtIHtCb29sZWFufVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBzaG93RGlmZjogdHJ1ZSxcblxuICAvKipcbiAgICogIyMjIGNvbmZpZy50cnVuY2F0ZVRocmVzaG9sZFxuICAgKlxuICAgKiBVc2VyIGNvbmZpZ3VyYWJsZSBwcm9wZXJ0eSwgc2V0cyBsZW5ndGggdGhyZXNob2xkIGZvciBhY3R1YWwgYW5kXG4gICAqIGV4cGVjdGVkIHZhbHVlcyBpbiBhc3NlcnRpb24gZXJyb3JzLiBJZiB0aGlzIHRocmVzaG9sZCBpcyBleGNlZWRlZCxcbiAgICogdGhlIHZhbHVlIGlzIHRydW5jYXRlZC5cbiAgICpcbiAgICogU2V0IGl0IHRvIHplcm8gaWYgeW91IHdhbnQgdG8gZGlzYWJsZSB0cnVuY2F0aW5nIGFsdG9nZXRoZXIuXG4gICAqXG4gICAqICAgICBjaGFpLmNvbmZpZy50cnVuY2F0ZVRocmVzaG9sZCA9IDA7ICAvLyBkaXNhYmxlIHRydW5jYXRpbmdcbiAgICpcbiAgICogQHBhcmFtIHtOdW1iZXJ9XG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIHRydW5jYXRlVGhyZXNob2xkOiA0MFxuXG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL2NvcmUvYXNzZXJ0aW9ucy5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBjaGFpXG4gKiBodHRwOi8vY2hhaWpzLmNvbVxuICogQ29weXJpZ2h0KGMpIDIwMTEtMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNoYWksIF8pIHtcbiAgdmFyIEFzc2VydGlvbiA9IGNoYWkuQXNzZXJ0aW9uXG4gICAgLCB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcbiAgICAsIGZsYWcgPSBfLmZsYWc7XG5cbiAgLyoqXG4gICAqICMjIyBMYW5ndWFnZSBDaGFpbnNcbiAgICpcbiAgICogVGhlIGZvbGxvd2luZyBhcmUgcHJvdmlkZWQgYXMgY2hhaW5hYmxlIGdldHRlcnMgdG9cbiAgICogaW1wcm92ZSB0aGUgcmVhZGFiaWxpdHkgb2YgeW91ciBhc3NlcnRpb25zLiBUaGV5XG4gICAqIGRvIG5vdCBwcm92aWRlIHRlc3RpbmcgY2FwYWJpbGl0aWVzIHVubGVzcyB0aGV5XG4gICAqIGhhdmUgYmVlbiBvdmVyd3JpdHRlbiBieSBhIHBsdWdpbi5cbiAgICpcbiAgICogKipDaGFpbnMqKlxuICAgKlxuICAgKiAtIHRvXG4gICAqIC0gYmVcbiAgICogLSBiZWVuXG4gICAqIC0gaXNcbiAgICogLSB0aGF0XG4gICAqIC0gYW5kXG4gICAqIC0gaGFzXG4gICAqIC0gaGF2ZVxuICAgKiAtIHdpdGhcbiAgICogLSBhdFxuICAgKiAtIG9mXG4gICAqIC0gc2FtZVxuICAgKlxuICAgKiBAbmFtZSBsYW5ndWFnZSBjaGFpbnNcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgWyAndG8nLCAnYmUnLCAnYmVlbidcbiAgLCAnaXMnLCAnYW5kJywgJ2hhcycsICdoYXZlJ1xuICAsICd3aXRoJywgJ3RoYXQnLCAnYXQnXG4gICwgJ29mJywgJ3NhbWUnIF0uZm9yRWFjaChmdW5jdGlvbiAoY2hhaW4pIHtcbiAgICBBc3NlcnRpb24uYWRkUHJvcGVydHkoY2hhaW4sIGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuICB9KTtcblxuICAvKipcbiAgICogIyMjIC5ub3RcbiAgICpcbiAgICogTmVnYXRlcyBhbnkgb2YgYXNzZXJ0aW9ucyBmb2xsb3dpbmcgaW4gdGhlIGNoYWluLlxuICAgKlxuICAgKiAgICAgZXhwZWN0KGZvbykudG8ubm90LmVxdWFsKCdiYXInKTtcbiAgICogICAgIGV4cGVjdChnb29kRm4pLnRvLm5vdC50aHJvdyhFcnJvcik7XG4gICAqICAgICBleHBlY3QoeyBmb286ICdiYXonIH0pLnRvLmhhdmUucHJvcGVydHkoJ2ZvbycpXG4gICAqICAgICAgIC5hbmQubm90LmVxdWFsKCdiYXInKTtcbiAgICpcbiAgICogQG5hbWUgbm90XG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRQcm9wZXJ0eSgnbm90JywgZnVuY3Rpb24gKCkge1xuICAgIGZsYWcodGhpcywgJ25lZ2F0ZScsIHRydWUpO1xuICB9KTtcblxuICAvKipcbiAgICogIyMjIC5kZWVwXG4gICAqXG4gICAqIFNldHMgdGhlIGBkZWVwYCBmbGFnLCBsYXRlciB1c2VkIGJ5IHRoZSBgZXF1YWxgIGFuZFxuICAgKiBgcHJvcGVydHlgIGFzc2VydGlvbnMuXG4gICAqXG4gICAqICAgICBleHBlY3QoZm9vKS50by5kZWVwLmVxdWFsKHsgYmFyOiAnYmF6JyB9KTtcbiAgICogICAgIGV4cGVjdCh7IGZvbzogeyBiYXI6IHsgYmF6OiAncXV1eCcgfSB9IH0pXG4gICAqICAgICAgIC50by5oYXZlLmRlZXAucHJvcGVydHkoJ2Zvby5iYXIuYmF6JywgJ3F1dXgnKTtcbiAgICpcbiAgICogQG5hbWUgZGVlcFxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkUHJvcGVydHkoJ2RlZXAnLCBmdW5jdGlvbiAoKSB7XG4gICAgZmxhZyh0aGlzLCAnZGVlcCcsIHRydWUpO1xuICB9KTtcblxuICAvKipcbiAgICogIyMjIC5hKHR5cGUpXG4gICAqXG4gICAqIFRoZSBgYWAgYW5kIGBhbmAgYXNzZXJ0aW9ucyBhcmUgYWxpYXNlcyB0aGF0IGNhbiBiZVxuICAgKiB1c2VkIGVpdGhlciBhcyBsYW5ndWFnZSBjaGFpbnMgb3IgdG8gYXNzZXJ0IGEgdmFsdWUnc1xuICAgKiB0eXBlLlxuICAgKlxuICAgKiAgICAgLy8gdHlwZW9mXG4gICAqICAgICBleHBlY3QoJ3Rlc3QnKS50by5iZS5hKCdzdHJpbmcnKTtcbiAgICogICAgIGV4cGVjdCh7IGZvbzogJ2JhcicgfSkudG8uYmUuYW4oJ29iamVjdCcpO1xuICAgKiAgICAgZXhwZWN0KG51bGwpLnRvLmJlLmEoJ251bGwnKTtcbiAgICogICAgIGV4cGVjdCh1bmRlZmluZWQpLnRvLmJlLmFuKCd1bmRlZmluZWQnKTtcbiAgICpcbiAgICogICAgIC8vIGxhbmd1YWdlIGNoYWluXG4gICAqICAgICBleHBlY3QoZm9vKS50by5iZS5hbi5pbnN0YW5jZW9mKEZvbyk7XG4gICAqXG4gICAqIEBuYW1lIGFcbiAgICogQGFsaWFzIGFuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gYW4gKHR5cGUsIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHR5cGUgPSB0eXBlLnRvTG93ZXJDYXNlKCk7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpXG4gICAgICAsIGFydGljbGUgPSB+WyAnYScsICdlJywgJ2knLCAnbycsICd1JyBdLmluZGV4T2YodHlwZS5jaGFyQXQoMCkpID8gJ2FuICcgOiAnYSAnO1xuXG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgIHR5cGUgPT09IF8udHlwZShvYmopXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlICcgKyBhcnRpY2xlICsgdHlwZVxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSBub3QgdG8gYmUgJyArIGFydGljbGUgKyB0eXBlXG4gICAgKTtcbiAgfVxuXG4gIEFzc2VydGlvbi5hZGRDaGFpbmFibGVNZXRob2QoJ2FuJywgYW4pO1xuICBBc3NlcnRpb24uYWRkQ2hhaW5hYmxlTWV0aG9kKCdhJywgYW4pO1xuXG4gIC8qKlxuICAgKiAjIyMgLmluY2x1ZGUodmFsdWUpXG4gICAqXG4gICAqIFRoZSBgaW5jbHVkZWAgYW5kIGBjb250YWluYCBhc3NlcnRpb25zIGNhbiBiZSB1c2VkIGFzIGVpdGhlciBwcm9wZXJ0eVxuICAgKiBiYXNlZCBsYW5ndWFnZSBjaGFpbnMgb3IgYXMgbWV0aG9kcyB0byBhc3NlcnQgdGhlIGluY2x1c2lvbiBvZiBhbiBvYmplY3RcbiAgICogaW4gYW4gYXJyYXkgb3IgYSBzdWJzdHJpbmcgaW4gYSBzdHJpbmcuIFdoZW4gdXNlZCBhcyBsYW5ndWFnZSBjaGFpbnMsXG4gICAqIHRoZXkgdG9nZ2xlIHRoZSBgY29udGFpbmAgZmxhZyBmb3IgdGhlIGBrZXlzYCBhc3NlcnRpb24uXG4gICAqXG4gICAqICAgICBleHBlY3QoWzEsMiwzXSkudG8uaW5jbHVkZSgyKTtcbiAgICogICAgIGV4cGVjdCgnZm9vYmFyJykudG8uY29udGFpbignZm9vJyk7XG4gICAqICAgICBleHBlY3QoeyBmb286ICdiYXInLCBoZWxsbzogJ3VuaXZlcnNlJyB9KS50by5pbmNsdWRlLmtleXMoJ2ZvbycpO1xuICAgKlxuICAgKiBAbmFtZSBpbmNsdWRlXG4gICAqIEBhbGlhcyBjb250YWluXG4gICAqIEBwYXJhbSB7T2JqZWN0fFN0cmluZ3xOdW1iZXJ9IG9ialxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGluY2x1ZGVDaGFpbmluZ0JlaGF2aW9yICgpIHtcbiAgICBmbGFnKHRoaXMsICdjb250YWlucycsIHRydWUpO1xuICB9XG5cbiAgZnVuY3Rpb24gaW5jbHVkZSAodmFsLCBtc2cpIHtcbiAgICBpZiAobXNnKSBmbGFnKHRoaXMsICdtZXNzYWdlJywgbXNnKTtcbiAgICB2YXIgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG4gICAgdmFyIGV4cGVjdGVkID0gZmFsc2U7XG4gICAgaWYgKF8udHlwZShvYmopID09PSAnYXJyYXknICYmIF8udHlwZSh2YWwpID09PSAnb2JqZWN0Jykge1xuICAgICAgZm9yICh2YXIgaSBpbiBvYmopIHtcbiAgICAgICAgaWYgKF8uZXFsKG9ialtpXSwgdmFsKSkge1xuICAgICAgICAgIGV4cGVjdGVkID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoXy50eXBlKHZhbCkgPT09ICdvYmplY3QnKSB7XG4gICAgICBpZiAoIWZsYWcodGhpcywgJ25lZ2F0ZScpKSB7XG4gICAgICAgIGZvciAodmFyIGsgaW4gdmFsKSBuZXcgQXNzZXJ0aW9uKG9iaikucHJvcGVydHkoaywgdmFsW2tdKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdmFyIHN1YnNldCA9IHt9XG4gICAgICBmb3IgKHZhciBrIGluIHZhbCkgc3Vic2V0W2tdID0gb2JqW2tdXG4gICAgICBleHBlY3RlZCA9IF8uZXFsKHN1YnNldCwgdmFsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXhwZWN0ZWQgPSBvYmogJiYgfm9iai5pbmRleE9mKHZhbClcbiAgICB9XG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgIGV4cGVjdGVkXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGluY2x1ZGUgJyArIF8uaW5zcGVjdCh2YWwpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBpbmNsdWRlICcgKyBfLmluc3BlY3QodmFsKSk7XG4gIH1cblxuICBBc3NlcnRpb24uYWRkQ2hhaW5hYmxlTWV0aG9kKCdpbmNsdWRlJywgaW5jbHVkZSwgaW5jbHVkZUNoYWluaW5nQmVoYXZpb3IpO1xuICBBc3NlcnRpb24uYWRkQ2hhaW5hYmxlTWV0aG9kKCdjb250YWluJywgaW5jbHVkZSwgaW5jbHVkZUNoYWluaW5nQmVoYXZpb3IpO1xuXG4gIC8qKlxuICAgKiAjIyMgLm9rXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGlzIHRydXRoeS5cbiAgICpcbiAgICogICAgIGV4cGVjdCgnZXZlcnRoaW5nJykudG8uYmUub2s7XG4gICAqICAgICBleHBlY3QoMSkudG8uYmUub2s7XG4gICAqICAgICBleHBlY3QoZmFsc2UpLnRvLm5vdC5iZS5vaztcbiAgICogICAgIGV4cGVjdCh1bmRlZmluZWQpLnRvLm5vdC5iZS5vaztcbiAgICogICAgIGV4cGVjdChudWxsKS50by5ub3QuYmUub2s7XG4gICAqXG4gICAqIEBuYW1lIG9rXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRQcm9wZXJ0eSgnb2snLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgIGZsYWcodGhpcywgJ29iamVjdCcpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIHRydXRoeSdcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgZmFsc3knKTtcbiAgfSk7XG5cbiAgLyoqXG4gICAqICMjIyAudHJ1ZVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBpcyBgdHJ1ZWAuXG4gICAqXG4gICAqICAgICBleHBlY3QodHJ1ZSkudG8uYmUudHJ1ZTtcbiAgICogICAgIGV4cGVjdCgxKS50by5ub3QuYmUudHJ1ZTtcbiAgICpcbiAgICogQG5hbWUgdHJ1ZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkUHJvcGVydHkoJ3RydWUnLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgIHRydWUgPT09IGZsYWcodGhpcywgJ29iamVjdCcpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIHRydWUnXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIGZhbHNlJ1xuICAgICAgLCB0aGlzLm5lZ2F0ZSA/IGZhbHNlIDogdHJ1ZVxuICAgICk7XG4gIH0pO1xuXG4gIC8qKlxuICAgKiAjIyMgLmZhbHNlXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGlzIGBmYWxzZWAuXG4gICAqXG4gICAqICAgICBleHBlY3QoZmFsc2UpLnRvLmJlLmZhbHNlO1xuICAgKiAgICAgZXhwZWN0KDApLnRvLm5vdC5iZS5mYWxzZTtcbiAgICpcbiAgICogQG5hbWUgZmFsc2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgQXNzZXJ0aW9uLmFkZFByb3BlcnR5KCdmYWxzZScsIGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgZmFsc2UgPT09IGZsYWcodGhpcywgJ29iamVjdCcpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIGZhbHNlJ1xuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSB0cnVlJ1xuICAgICAgLCB0aGlzLm5lZ2F0ZSA/IHRydWUgOiBmYWxzZVxuICAgICk7XG4gIH0pO1xuXG4gIC8qKlxuICAgKiAjIyMgLm51bGxcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaXMgYG51bGxgLlxuICAgKlxuICAgKiAgICAgZXhwZWN0KG51bGwpLnRvLmJlLm51bGw7XG4gICAqICAgICBleHBlY3QodW5kZWZpbmVkKS5ub3QudG8uYmUubnVsbDtcbiAgICpcbiAgICogQG5hbWUgbnVsbFxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkUHJvcGVydHkoJ251bGwnLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgIG51bGwgPT09IGZsYWcodGhpcywgJ29iamVjdCcpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIG51bGwnXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IG5vdCB0byBiZSBudWxsJ1xuICAgICk7XG4gIH0pO1xuXG4gIC8qKlxuICAgKiAjIyMgLnVuZGVmaW5lZFxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBpcyBgdW5kZWZpbmVkYC5cbiAgICpcbiAgICogICAgIGV4cGVjdCh1bmRlZmluZWQpLnRvLmJlLnVuZGVmaW5lZDtcbiAgICogICAgIGV4cGVjdChudWxsKS50by5ub3QuYmUudW5kZWZpbmVkO1xuICAgKlxuICAgKiBAbmFtZSB1bmRlZmluZWRcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgQXNzZXJ0aW9uLmFkZFByb3BlcnR5KCd1bmRlZmluZWQnLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgIHVuZGVmaW5lZCA9PT0gZmxhZyh0aGlzLCAnb2JqZWN0JylcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgdW5kZWZpbmVkJ1xuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSBub3QgdG8gYmUgdW5kZWZpbmVkJ1xuICAgICk7XG4gIH0pO1xuXG4gIC8qKlxuICAgKiAjIyMgLmV4aXN0XG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGlzIG5laXRoZXIgYG51bGxgIG5vciBgdW5kZWZpbmVkYC5cbiAgICpcbiAgICogICAgIHZhciBmb28gPSAnaGknXG4gICAqICAgICAgICwgYmFyID0gbnVsbFxuICAgKiAgICAgICAsIGJhejtcbiAgICpcbiAgICogICAgIGV4cGVjdChmb28pLnRvLmV4aXN0O1xuICAgKiAgICAgZXhwZWN0KGJhcikudG8ubm90LmV4aXN0O1xuICAgKiAgICAgZXhwZWN0KGJheikudG8ubm90LmV4aXN0O1xuICAgKlxuICAgKiBAbmFtZSBleGlzdFxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkUHJvcGVydHkoJ2V4aXN0JywgZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICBudWxsICE9IGZsYWcodGhpcywgJ29iamVjdCcpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGV4aXN0J1xuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgZXhpc3QnXG4gICAgKTtcbiAgfSk7XG5cblxuICAvKipcbiAgICogIyMjIC5lbXB0eVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCdzIGxlbmd0aCBpcyBgMGAuIEZvciBhcnJheXMsIGl0IGNoZWNrc1xuICAgKiB0aGUgYGxlbmd0aGAgcHJvcGVydHkuIEZvciBvYmplY3RzLCBpdCBnZXRzIHRoZSBjb3VudCBvZlxuICAgKiBlbnVtZXJhYmxlIGtleXMuXG4gICAqXG4gICAqICAgICBleHBlY3QoW10pLnRvLmJlLmVtcHR5O1xuICAgKiAgICAgZXhwZWN0KCcnKS50by5iZS5lbXB0eTtcbiAgICogICAgIGV4cGVjdCh7fSkudG8uYmUuZW1wdHk7XG4gICAqXG4gICAqIEBuYW1lIGVtcHR5XG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRQcm9wZXJ0eSgnZW1wdHknLCBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpXG4gICAgICAsIGV4cGVjdGVkID0gb2JqO1xuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkob2JqKSB8fCAnc3RyaW5nJyA9PT0gdHlwZW9mIG9iamVjdCkge1xuICAgICAgZXhwZWN0ZWQgPSBvYmoubGVuZ3RoO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGV4cGVjdGVkID0gT2JqZWN0LmtleXMob2JqKS5sZW5ndGg7XG4gICAgfVxuXG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICFleHBlY3RlZFxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSBlbXB0eSdcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gbm90IHRvIGJlIGVtcHR5J1xuICAgICk7XG4gIH0pO1xuXG4gIC8qKlxuICAgKiAjIyMgLmFyZ3VtZW50c1xuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBpcyBhbiBhcmd1bWVudHMgb2JqZWN0LlxuICAgKlxuICAgKiAgICAgZnVuY3Rpb24gdGVzdCAoKSB7XG4gICAqICAgICAgIGV4cGVjdChhcmd1bWVudHMpLnRvLmJlLmFyZ3VtZW50cztcbiAgICogICAgIH1cbiAgICpcbiAgICogQG5hbWUgYXJndW1lbnRzXG4gICAqIEBhbGlhcyBBcmd1bWVudHNcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gY2hlY2tBcmd1bWVudHMgKCkge1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKVxuICAgICAgLCB0eXBlID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaik7XG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICdbb2JqZWN0IEFyZ3VtZW50c10nID09PSB0eXBlXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIGFyZ3VtZW50cyBidXQgZ290ICcgKyB0eXBlXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBiZSBhcmd1bWVudHMnXG4gICAgKTtcbiAgfVxuXG4gIEFzc2VydGlvbi5hZGRQcm9wZXJ0eSgnYXJndW1lbnRzJywgY2hlY2tBcmd1bWVudHMpO1xuICBBc3NlcnRpb24uYWRkUHJvcGVydHkoJ0FyZ3VtZW50cycsIGNoZWNrQXJndW1lbnRzKTtcblxuICAvKipcbiAgICogIyMjIC5lcXVhbCh2YWx1ZSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaXMgc3RyaWN0bHkgZXF1YWwgKGA9PT1gKSB0byBgdmFsdWVgLlxuICAgKiBBbHRlcm5hdGVseSwgaWYgdGhlIGBkZWVwYCBmbGFnIGlzIHNldCwgYXNzZXJ0cyB0aGF0XG4gICAqIHRoZSB0YXJnZXQgaXMgZGVlcGx5IGVxdWFsIHRvIGB2YWx1ZWAuXG4gICAqXG4gICAqICAgICBleHBlY3QoJ2hlbGxvJykudG8uZXF1YWwoJ2hlbGxvJyk7XG4gICAqICAgICBleHBlY3QoNDIpLnRvLmVxdWFsKDQyKTtcbiAgICogICAgIGV4cGVjdCgxKS50by5ub3QuZXF1YWwodHJ1ZSk7XG4gICAqICAgICBleHBlY3QoeyBmb286ICdiYXInIH0pLnRvLm5vdC5lcXVhbCh7IGZvbzogJ2JhcicgfSk7XG4gICAqICAgICBleHBlY3QoeyBmb286ICdiYXInIH0pLnRvLmRlZXAuZXF1YWwoeyBmb286ICdiYXInIH0pO1xuICAgKlxuICAgKiBAbmFtZSBlcXVhbFxuICAgKiBAYWxpYXMgZXF1YWxzXG4gICAqIEBhbGlhcyBlcVxuICAgKiBAYWxpYXMgZGVlcC5lcXVhbFxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGFzc2VydEVxdWFsICh2YWwsIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKTtcbiAgICBpZiAoZmxhZyh0aGlzLCAnZGVlcCcpKSB7XG4gICAgICByZXR1cm4gdGhpcy5lcWwodmFsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgdmFsID09PSBvYmpcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBlcXVhbCAje2V4cH0nXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IGVxdWFsICN7ZXhwfSdcbiAgICAgICAgLCB2YWxcbiAgICAgICAgLCB0aGlzLl9vYmpcbiAgICAgICAgLCB0cnVlXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2VxdWFsJywgYXNzZXJ0RXF1YWwpO1xuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdlcXVhbHMnLCBhc3NlcnRFcXVhbCk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2VxJywgYXNzZXJ0RXF1YWwpO1xuXG4gIC8qKlxuICAgKiAjIyMgLmVxbCh2YWx1ZSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaXMgZGVlcGx5IGVxdWFsIHRvIGB2YWx1ZWAuXG4gICAqXG4gICAqICAgICBleHBlY3QoeyBmb286ICdiYXInIH0pLnRvLmVxbCh7IGZvbzogJ2JhcicgfSk7XG4gICAqICAgICBleHBlY3QoWyAxLCAyLCAzIF0pLnRvLmVxbChbIDEsIDIsIDMgXSk7XG4gICAqXG4gICAqIEBuYW1lIGVxbFxuICAgKiBAYWxpYXMgZXFsc1xuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGFzc2VydEVxbChvYmosIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICBfLmVxbChvYmosIGZsYWcodGhpcywgJ29iamVjdCcpKVxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBkZWVwbHkgZXF1YWwgI3tleHB9J1xuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgZGVlcGx5IGVxdWFsICN7ZXhwfSdcbiAgICAgICwgb2JqXG4gICAgICAsIHRoaXMuX29ialxuICAgICAgLCB0cnVlXG4gICAgKTtcbiAgfVxuXG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2VxbCcsIGFzc2VydEVxbCk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2VxbHMnLCBhc3NlcnRFcWwpO1xuXG4gIC8qKlxuICAgKiAjIyMgLmFib3ZlKHZhbHVlKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBpcyBncmVhdGVyIHRoYW4gYHZhbHVlYC5cbiAgICpcbiAgICogICAgIGV4cGVjdCgxMCkudG8uYmUuYWJvdmUoNSk7XG4gICAqXG4gICAqIENhbiBhbHNvIGJlIHVzZWQgaW4gY29uanVuY3Rpb24gd2l0aCBgbGVuZ3RoYCB0b1xuICAgKiBhc3NlcnQgYSBtaW5pbXVtIGxlbmd0aC4gVGhlIGJlbmVmaXQgYmVpbmcgYVxuICAgKiBtb3JlIGluZm9ybWF0aXZlIGVycm9yIG1lc3NhZ2UgdGhhbiBpZiB0aGUgbGVuZ3RoXG4gICAqIHdhcyBzdXBwbGllZCBkaXJlY3RseS5cbiAgICpcbiAgICogICAgIGV4cGVjdCgnZm9vJykudG8uaGF2ZS5sZW5ndGguYWJvdmUoMik7XG4gICAqICAgICBleHBlY3QoWyAxLCAyLCAzIF0pLnRvLmhhdmUubGVuZ3RoLmFib3ZlKDIpO1xuICAgKlxuICAgKiBAbmFtZSBhYm92ZVxuICAgKiBAYWxpYXMgZ3RcbiAgICogQGFsaWFzIGdyZWF0ZXJUaGFuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGZ1bmN0aW9uIGFzc2VydEFib3ZlIChuLCBtc2cpIHtcbiAgICBpZiAobXNnKSBmbGFnKHRoaXMsICdtZXNzYWdlJywgbXNnKTtcbiAgICB2YXIgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG4gICAgaWYgKGZsYWcodGhpcywgJ2RvTGVuZ3RoJykpIHtcbiAgICAgIG5ldyBBc3NlcnRpb24ob2JqLCBtc2cpLnRvLmhhdmUucHJvcGVydHkoJ2xlbmd0aCcpO1xuICAgICAgdmFyIGxlbiA9IG9iai5sZW5ndGg7XG4gICAgICB0aGlzLmFzc2VydChcbiAgICAgICAgICBsZW4gPiBuXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gaGF2ZSBhIGxlbmd0aCBhYm92ZSAje2V4cH0gYnV0IGdvdCAje2FjdH0nXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IGhhdmUgYSBsZW5ndGggYWJvdmUgI3tleHB9J1xuICAgICAgICAsIG5cbiAgICAgICAgLCBsZW5cbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICAgIG9iaiA+IG5cbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSBhYm92ZSAnICsgblxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIGF0IG1vc3QgJyArIG5cbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnYWJvdmUnLCBhc3NlcnRBYm92ZSk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2d0JywgYXNzZXJ0QWJvdmUpO1xuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdncmVhdGVyVGhhbicsIGFzc2VydEFib3ZlKTtcblxuICAvKipcbiAgICogIyMjIC5sZWFzdCh2YWx1ZSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaXMgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIGB2YWx1ZWAuXG4gICAqXG4gICAqICAgICBleHBlY3QoMTApLnRvLmJlLmF0LmxlYXN0KDEwKTtcbiAgICpcbiAgICogQ2FuIGFsc28gYmUgdXNlZCBpbiBjb25qdW5jdGlvbiB3aXRoIGBsZW5ndGhgIHRvXG4gICAqIGFzc2VydCBhIG1pbmltdW0gbGVuZ3RoLiBUaGUgYmVuZWZpdCBiZWluZyBhXG4gICAqIG1vcmUgaW5mb3JtYXRpdmUgZXJyb3IgbWVzc2FnZSB0aGFuIGlmIHRoZSBsZW5ndGhcbiAgICogd2FzIHN1cHBsaWVkIGRpcmVjdGx5LlxuICAgKlxuICAgKiAgICAgZXhwZWN0KCdmb28nKS50by5oYXZlLmxlbmd0aC5vZi5hdC5sZWFzdCgyKTtcbiAgICogICAgIGV4cGVjdChbIDEsIDIsIDMgXSkudG8uaGF2ZS5sZW5ndGgub2YuYXQubGVhc3QoMyk7XG4gICAqXG4gICAqIEBuYW1lIGxlYXN0XG4gICAqIEBhbGlhcyBndGVcbiAgICogQHBhcmFtIHtOdW1iZXJ9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gYXNzZXJ0TGVhc3QgKG4sIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKTtcbiAgICBpZiAoZmxhZyh0aGlzLCAnZG9MZW5ndGgnKSkge1xuICAgICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykudG8uaGF2ZS5wcm9wZXJ0eSgnbGVuZ3RoJyk7XG4gICAgICB2YXIgbGVuID0gb2JqLmxlbmd0aDtcbiAgICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICAgIGxlbiA+PSBuXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gaGF2ZSBhIGxlbmd0aCBhdCBsZWFzdCAje2V4cH0gYnV0IGdvdCAje2FjdH0nXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gaGF2ZSBhIGxlbmd0aCBiZWxvdyAje2V4cH0nXG4gICAgICAgICwgblxuICAgICAgICAsIGxlblxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgb2JqID49IG5cbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSBhdCBsZWFzdCAnICsgblxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIGJlbG93ICcgKyBuXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2xlYXN0JywgYXNzZXJ0TGVhc3QpO1xuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdndGUnLCBhc3NlcnRMZWFzdCk7XG5cbiAgLyoqXG4gICAqICMjIyAuYmVsb3codmFsdWUpXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGlzIGxlc3MgdGhhbiBgdmFsdWVgLlxuICAgKlxuICAgKiAgICAgZXhwZWN0KDUpLnRvLmJlLmJlbG93KDEwKTtcbiAgICpcbiAgICogQ2FuIGFsc28gYmUgdXNlZCBpbiBjb25qdW5jdGlvbiB3aXRoIGBsZW5ndGhgIHRvXG4gICAqIGFzc2VydCBhIG1heGltdW0gbGVuZ3RoLiBUaGUgYmVuZWZpdCBiZWluZyBhXG4gICAqIG1vcmUgaW5mb3JtYXRpdmUgZXJyb3IgbWVzc2FnZSB0aGFuIGlmIHRoZSBsZW5ndGhcbiAgICogd2FzIHN1cHBsaWVkIGRpcmVjdGx5LlxuICAgKlxuICAgKiAgICAgZXhwZWN0KCdmb28nKS50by5oYXZlLmxlbmd0aC5iZWxvdyg0KTtcbiAgICogICAgIGV4cGVjdChbIDEsIDIsIDMgXSkudG8uaGF2ZS5sZW5ndGguYmVsb3coNCk7XG4gICAqXG4gICAqIEBuYW1lIGJlbG93XG4gICAqIEBhbGlhcyBsdFxuICAgKiBAYWxpYXMgbGVzc1RoYW5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gYXNzZXJ0QmVsb3cgKG4sIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKTtcbiAgICBpZiAoZmxhZyh0aGlzLCAnZG9MZW5ndGgnKSkge1xuICAgICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykudG8uaGF2ZS5wcm9wZXJ0eSgnbGVuZ3RoJyk7XG4gICAgICB2YXIgbGVuID0gb2JqLmxlbmd0aDtcbiAgICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICAgIGxlbiA8IG5cbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBoYXZlIGEgbGVuZ3RoIGJlbG93ICN7ZXhwfSBidXQgZ290ICN7YWN0fSdcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgaGF2ZSBhIGxlbmd0aCBiZWxvdyAje2V4cH0nXG4gICAgICAgICwgblxuICAgICAgICAsIGxlblxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgb2JqIDwgblxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGJlIGJlbG93ICcgKyBuXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgYXQgbGVhc3QgJyArIG5cbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnYmVsb3cnLCBhc3NlcnRCZWxvdyk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2x0JywgYXNzZXJ0QmVsb3cpO1xuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdsZXNzVGhhbicsIGFzc2VydEJlbG93KTtcblxuICAvKipcbiAgICogIyMjIC5tb3N0KHZhbHVlKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gYHZhbHVlYC5cbiAgICpcbiAgICogICAgIGV4cGVjdCg1KS50by5iZS5hdC5tb3N0KDUpO1xuICAgKlxuICAgKiBDYW4gYWxzbyBiZSB1c2VkIGluIGNvbmp1bmN0aW9uIHdpdGggYGxlbmd0aGAgdG9cbiAgICogYXNzZXJ0IGEgbWF4aW11bSBsZW5ndGguIFRoZSBiZW5lZml0IGJlaW5nIGFcbiAgICogbW9yZSBpbmZvcm1hdGl2ZSBlcnJvciBtZXNzYWdlIHRoYW4gaWYgdGhlIGxlbmd0aFxuICAgKiB3YXMgc3VwcGxpZWQgZGlyZWN0bHkuXG4gICAqXG4gICAqICAgICBleHBlY3QoJ2ZvbycpLnRvLmhhdmUubGVuZ3RoLm9mLmF0Lm1vc3QoNCk7XG4gICAqICAgICBleHBlY3QoWyAxLCAyLCAzIF0pLnRvLmhhdmUubGVuZ3RoLm9mLmF0Lm1vc3QoMyk7XG4gICAqXG4gICAqIEBuYW1lIG1vc3RcbiAgICogQGFsaWFzIGx0ZVxuICAgKiBAcGFyYW0ge051bWJlcn0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBmdW5jdGlvbiBhc3NlcnRNb3N0IChuLCBtc2cpIHtcbiAgICBpZiAobXNnKSBmbGFnKHRoaXMsICdtZXNzYWdlJywgbXNnKTtcbiAgICB2YXIgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG4gICAgaWYgKGZsYWcodGhpcywgJ2RvTGVuZ3RoJykpIHtcbiAgICAgIG5ldyBBc3NlcnRpb24ob2JqLCBtc2cpLnRvLmhhdmUucHJvcGVydHkoJ2xlbmd0aCcpO1xuICAgICAgdmFyIGxlbiA9IG9iai5sZW5ndGg7XG4gICAgICB0aGlzLmFzc2VydChcbiAgICAgICAgICBsZW4gPD0gblxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGhhdmUgYSBsZW5ndGggYXQgbW9zdCAje2V4cH0gYnV0IGdvdCAje2FjdH0nXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gaGF2ZSBhIGxlbmd0aCBhYm92ZSAje2V4cH0nXG4gICAgICAgICwgblxuICAgICAgICAsIGxlblxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgb2JqIDw9IG5cbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSBhdCBtb3N0ICcgKyBuXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgYWJvdmUgJyArIG5cbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnbW9zdCcsIGFzc2VydE1vc3QpO1xuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdsdGUnLCBhc3NlcnRNb3N0KTtcblxuICAvKipcbiAgICogIyMjIC53aXRoaW4oc3RhcnQsIGZpbmlzaClcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaXMgd2l0aGluIGEgcmFuZ2UuXG4gICAqXG4gICAqICAgICBleHBlY3QoNykudG8uYmUud2l0aGluKDUsMTApO1xuICAgKlxuICAgKiBDYW4gYWxzbyBiZSB1c2VkIGluIGNvbmp1bmN0aW9uIHdpdGggYGxlbmd0aGAgdG9cbiAgICogYXNzZXJ0IGEgbGVuZ3RoIHJhbmdlLiBUaGUgYmVuZWZpdCBiZWluZyBhXG4gICAqIG1vcmUgaW5mb3JtYXRpdmUgZXJyb3IgbWVzc2FnZSB0aGFuIGlmIHRoZSBsZW5ndGhcbiAgICogd2FzIHN1cHBsaWVkIGRpcmVjdGx5LlxuICAgKlxuICAgKiAgICAgZXhwZWN0KCdmb28nKS50by5oYXZlLmxlbmd0aC53aXRoaW4oMiw0KTtcbiAgICogICAgIGV4cGVjdChbIDEsIDIsIDMgXSkudG8uaGF2ZS5sZW5ndGgud2l0aGluKDIsNCk7XG4gICAqXG4gICAqIEBuYW1lIHdpdGhpblxuICAgKiBAcGFyYW0ge051bWJlcn0gc3RhcnQgbG93ZXJib3VuZCBpbmNsdXNpdmVcbiAgICogQHBhcmFtIHtOdW1iZXJ9IGZpbmlzaCB1cHBlcmJvdW5kIGluY2x1c2l2ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ3dpdGhpbicsIGZ1bmN0aW9uIChzdGFydCwgZmluaXNoLCBtc2cpIHtcbiAgICBpZiAobXNnKSBmbGFnKHRoaXMsICdtZXNzYWdlJywgbXNnKTtcbiAgICB2YXIgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0JylcbiAgICAgICwgcmFuZ2UgPSBzdGFydCArICcuLicgKyBmaW5pc2g7XG4gICAgaWYgKGZsYWcodGhpcywgJ2RvTGVuZ3RoJykpIHtcbiAgICAgIG5ldyBBc3NlcnRpb24ob2JqLCBtc2cpLnRvLmhhdmUucHJvcGVydHkoJ2xlbmd0aCcpO1xuICAgICAgdmFyIGxlbiA9IG9iai5sZW5ndGg7XG4gICAgICB0aGlzLmFzc2VydChcbiAgICAgICAgICBsZW4gPj0gc3RhcnQgJiYgbGVuIDw9IGZpbmlzaFxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGhhdmUgYSBsZW5ndGggd2l0aGluICcgKyByYW5nZVxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBoYXZlIGEgbGVuZ3RoIHdpdGhpbiAnICsgcmFuZ2VcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICAgIG9iaiA+PSBzdGFydCAmJiBvYmogPD0gZmluaXNoXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgd2l0aGluICcgKyByYW5nZVxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBiZSB3aXRoaW4gJyArIHJhbmdlXG4gICAgICApO1xuICAgIH1cbiAgfSk7XG5cbiAgLyoqXG4gICAqICMjIyAuaW5zdGFuY2VvZihjb25zdHJ1Y3RvcilcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgaXMgYW4gaW5zdGFuY2Ugb2YgYGNvbnN0cnVjdG9yYC5cbiAgICpcbiAgICogICAgIHZhciBUZWEgPSBmdW5jdGlvbiAobmFtZSkgeyB0aGlzLm5hbWUgPSBuYW1lOyB9XG4gICAqICAgICAgICwgQ2hhaSA9IG5ldyBUZWEoJ2NoYWknKTtcbiAgICpcbiAgICogICAgIGV4cGVjdChDaGFpKS50by5iZS5hbi5pbnN0YW5jZW9mKFRlYSk7XG4gICAqICAgICBleHBlY3QoWyAxLCAyLCAzIF0pLnRvLmJlLmluc3RhbmNlb2YoQXJyYXkpO1xuICAgKlxuICAgKiBAbmFtZSBpbnN0YW5jZW9mXG4gICAqIEBwYXJhbSB7Q29uc3RydWN0b3J9IGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFsaWFzIGluc3RhbmNlT2ZcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gYXNzZXJ0SW5zdGFuY2VPZiAoY29uc3RydWN0b3IsIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBuYW1lID0gXy5nZXROYW1lKGNvbnN0cnVjdG9yKTtcbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgZmxhZyh0aGlzLCAnb2JqZWN0JykgaW5zdGFuY2VvZiBjb25zdHJ1Y3RvclxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBiZSBhbiBpbnN0YW5jZSBvZiAnICsgbmFtZVxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgYmUgYW4gaW5zdGFuY2Ugb2YgJyArIG5hbWVcbiAgICApO1xuICB9O1xuXG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2luc3RhbmNlb2YnLCBhc3NlcnRJbnN0YW5jZU9mKTtcbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnaW5zdGFuY2VPZicsIGFzc2VydEluc3RhbmNlT2YpO1xuXG4gIC8qKlxuICAgKiAjIyMgLnByb3BlcnR5KG5hbWUsIFt2YWx1ZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGhhcyBhIHByb3BlcnR5IGBuYW1lYCwgb3B0aW9uYWxseSBhc3NlcnRpbmcgdGhhdFxuICAgKiB0aGUgdmFsdWUgb2YgdGhhdCBwcm9wZXJ0eSBpcyBzdHJpY3RseSBlcXVhbCB0byAgYHZhbHVlYC5cbiAgICogSWYgdGhlIGBkZWVwYCBmbGFnIGlzIHNldCwgeW91IGNhbiB1c2UgZG90LSBhbmQgYnJhY2tldC1ub3RhdGlvbiBmb3IgZGVlcFxuICAgKiByZWZlcmVuY2VzIGludG8gb2JqZWN0cyBhbmQgYXJyYXlzLlxuICAgKlxuICAgKiAgICAgLy8gc2ltcGxlIHJlZmVyZW5jaW5nXG4gICAqICAgICB2YXIgb2JqID0geyBmb286ICdiYXInIH07XG4gICAqICAgICBleHBlY3Qob2JqKS50by5oYXZlLnByb3BlcnR5KCdmb28nKTtcbiAgICogICAgIGV4cGVjdChvYmopLnRvLmhhdmUucHJvcGVydHkoJ2ZvbycsICdiYXInKTtcbiAgICpcbiAgICogICAgIC8vIGRlZXAgcmVmZXJlbmNpbmdcbiAgICogICAgIHZhciBkZWVwT2JqID0ge1xuICAgKiAgICAgICAgIGdyZWVuOiB7IHRlYTogJ21hdGNoYScgfVxuICAgKiAgICAgICAsIHRlYXM6IFsgJ2NoYWknLCAnbWF0Y2hhJywgeyB0ZWE6ICdrb25hY2hhJyB9IF1cbiAgICogICAgIH07XG5cbiAgICogICAgIGV4cGVjdChkZWVwT2JqKS50by5oYXZlLmRlZXAucHJvcGVydHkoJ2dyZWVuLnRlYScsICdtYXRjaGEnKTtcbiAgICogICAgIGV4cGVjdChkZWVwT2JqKS50by5oYXZlLmRlZXAucHJvcGVydHkoJ3RlYXNbMV0nLCAnbWF0Y2hhJyk7XG4gICAqICAgICBleHBlY3QoZGVlcE9iaikudG8uaGF2ZS5kZWVwLnByb3BlcnR5KCd0ZWFzWzJdLnRlYScsICdrb25hY2hhJyk7XG4gICAqXG4gICAqIFlvdSBjYW4gYWxzbyB1c2UgYW4gYXJyYXkgYXMgdGhlIHN0YXJ0aW5nIHBvaW50IG9mIGEgYGRlZXAucHJvcGVydHlgXG4gICAqIGFzc2VydGlvbiwgb3IgdHJhdmVyc2UgbmVzdGVkIGFycmF5cy5cbiAgICpcbiAgICogICAgIHZhciBhcnIgPSBbXG4gICAqICAgICAgICAgWyAnY2hhaScsICdtYXRjaGEnLCAna29uYWNoYScgXVxuICAgKiAgICAgICAsIFsgeyB0ZWE6ICdjaGFpJyB9XG4gICAqICAgICAgICAgLCB7IHRlYTogJ21hdGNoYScgfVxuICAgKiAgICAgICAgICwgeyB0ZWE6ICdrb25hY2hhJyB9IF1cbiAgICogICAgIF07XG4gICAqXG4gICAqICAgICBleHBlY3QoYXJyKS50by5oYXZlLmRlZXAucHJvcGVydHkoJ1swXVsxXScsICdtYXRjaGEnKTtcbiAgICogICAgIGV4cGVjdChhcnIpLnRvLmhhdmUuZGVlcC5wcm9wZXJ0eSgnWzFdWzJdLnRlYScsICdrb25hY2hhJyk7XG4gICAqXG4gICAqIEZ1cnRoZXJtb3JlLCBgcHJvcGVydHlgIGNoYW5nZXMgdGhlIHN1YmplY3Qgb2YgdGhlIGFzc2VydGlvblxuICAgKiB0byBiZSB0aGUgdmFsdWUgb2YgdGhhdCBwcm9wZXJ0eSBmcm9tIHRoZSBvcmlnaW5hbCBvYmplY3QuIFRoaXNcbiAgICogcGVybWl0cyBmb3IgZnVydGhlciBjaGFpbmFibGUgYXNzZXJ0aW9ucyBvbiB0aGF0IHByb3BlcnR5LlxuICAgKlxuICAgKiAgICAgZXhwZWN0KG9iaikudG8uaGF2ZS5wcm9wZXJ0eSgnZm9vJylcbiAgICogICAgICAgLnRoYXQuaXMuYSgnc3RyaW5nJyk7XG4gICAqICAgICBleHBlY3QoZGVlcE9iaikudG8uaGF2ZS5wcm9wZXJ0eSgnZ3JlZW4nKVxuICAgKiAgICAgICAudGhhdC5pcy5hbignb2JqZWN0JylcbiAgICogICAgICAgLnRoYXQuZGVlcC5lcXVhbHMoeyB0ZWE6ICdtYXRjaGEnIH0pO1xuICAgKiAgICAgZXhwZWN0KGRlZXBPYmopLnRvLmhhdmUucHJvcGVydHkoJ3RlYXMnKVxuICAgKiAgICAgICAudGhhdC5pcy5hbignYXJyYXknKVxuICAgKiAgICAgICAud2l0aC5kZWVwLnByb3BlcnR5KCdbMl0nKVxuICAgKiAgICAgICAgIC50aGF0LmRlZXAuZXF1YWxzKHsgdGVhOiAna29uYWNoYScgfSk7XG4gICAqXG4gICAqIEBuYW1lIHByb3BlcnR5XG4gICAqIEBhbGlhcyBkZWVwLnByb3BlcnR5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlIChvcHRpb25hbClcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAcmV0dXJucyB2YWx1ZSBvZiBwcm9wZXJ0eSBmb3IgY2hhaW5pbmdcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgncHJvcGVydHknLCBmdW5jdGlvbiAobmFtZSwgdmFsLCBtc2cpIHtcbiAgICBpZiAobXNnKSBmbGFnKHRoaXMsICdtZXNzYWdlJywgbXNnKTtcblxuICAgIHZhciBkZXNjcmlwdG9yID0gZmxhZyh0aGlzLCAnZGVlcCcpID8gJ2RlZXAgcHJvcGVydHkgJyA6ICdwcm9wZXJ0eSAnXG4gICAgICAsIG5lZ2F0ZSA9IGZsYWcodGhpcywgJ25lZ2F0ZScpXG4gICAgICAsIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpXG4gICAgICAsIHZhbHVlID0gZmxhZyh0aGlzLCAnZGVlcCcpXG4gICAgICAgID8gXy5nZXRQYXRoVmFsdWUobmFtZSwgb2JqKVxuICAgICAgICA6IG9ialtuYW1lXTtcblxuICAgIGlmIChuZWdhdGUgJiYgdW5kZWZpbmVkICE9PSB2YWwpIHtcbiAgICAgIGlmICh1bmRlZmluZWQgPT09IHZhbHVlKSB7XG4gICAgICAgIG1zZyA9IChtc2cgIT0gbnVsbCkgPyBtc2cgKyAnOiAnIDogJyc7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtc2cgKyBfLmluc3BlY3Qob2JqKSArICcgaGFzIG5vICcgKyBkZXNjcmlwdG9yICsgXy5pbnNwZWN0KG5hbWUpKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgdW5kZWZpbmVkICE9PSB2YWx1ZVxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGhhdmUgYSAnICsgZGVzY3JpcHRvciArIF8uaW5zcGVjdChuYW1lKVxuICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBoYXZlICcgKyBkZXNjcmlwdG9yICsgXy5pbnNwZWN0KG5hbWUpKTtcbiAgICB9XG5cbiAgICBpZiAodW5kZWZpbmVkICE9PSB2YWwpIHtcbiAgICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICAgIHZhbCA9PT0gdmFsdWVcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBoYXZlIGEgJyArIGRlc2NyaXB0b3IgKyBfLmluc3BlY3QobmFtZSkgKyAnIG9mICN7ZXhwfSwgYnV0IGdvdCAje2FjdH0nXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IGhhdmUgYSAnICsgZGVzY3JpcHRvciArIF8uaW5zcGVjdChuYW1lKSArICcgb2YgI3thY3R9J1xuICAgICAgICAsIHZhbFxuICAgICAgICAsIHZhbHVlXG4gICAgICApO1xuICAgIH1cblxuICAgIGZsYWcodGhpcywgJ29iamVjdCcsIHZhbHVlKTtcbiAgfSk7XG5cblxuICAvKipcbiAgICogIyMjIC5vd25Qcm9wZXJ0eShuYW1lKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBoYXMgYW4gb3duIHByb3BlcnR5IGBuYW1lYC5cbiAgICpcbiAgICogICAgIGV4cGVjdCgndGVzdCcpLnRvLmhhdmUub3duUHJvcGVydHkoJ2xlbmd0aCcpO1xuICAgKlxuICAgKiBAbmFtZSBvd25Qcm9wZXJ0eVxuICAgKiBAYWxpYXMgaGF2ZU93blByb3BlcnR5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gYXNzZXJ0T3duUHJvcGVydHkgKG5hbWUsIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKTtcbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgb2JqLmhhc093blByb3BlcnR5KG5hbWUpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGhhdmUgb3duIHByb3BlcnR5ICcgKyBfLmluc3BlY3QobmFtZSlcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IGhhdmUgb3duIHByb3BlcnR5ICcgKyBfLmluc3BlY3QobmFtZSlcbiAgICApO1xuICB9XG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnb3duUHJvcGVydHknLCBhc3NlcnRPd25Qcm9wZXJ0eSk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2hhdmVPd25Qcm9wZXJ0eScsIGFzc2VydE93blByb3BlcnR5KTtcblxuICAvKipcbiAgICogIyMjIC5sZW5ndGgodmFsdWUpXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0J3MgYGxlbmd0aGAgcHJvcGVydHkgaGFzXG4gICAqIHRoZSBleHBlY3RlZCB2YWx1ZS5cbiAgICpcbiAgICogICAgIGV4cGVjdChbIDEsIDIsIDNdKS50by5oYXZlLmxlbmd0aCgzKTtcbiAgICogICAgIGV4cGVjdCgnZm9vYmFyJykudG8uaGF2ZS5sZW5ndGgoNik7XG4gICAqXG4gICAqIENhbiBhbHNvIGJlIHVzZWQgYXMgYSBjaGFpbiBwcmVjdXJzb3IgdG8gYSB2YWx1ZVxuICAgKiBjb21wYXJpc29uIGZvciB0aGUgbGVuZ3RoIHByb3BlcnR5LlxuICAgKlxuICAgKiAgICAgZXhwZWN0KCdmb28nKS50by5oYXZlLmxlbmd0aC5hYm92ZSgyKTtcbiAgICogICAgIGV4cGVjdChbIDEsIDIsIDMgXSkudG8uaGF2ZS5sZW5ndGguYWJvdmUoMik7XG4gICAqICAgICBleHBlY3QoJ2ZvbycpLnRvLmhhdmUubGVuZ3RoLmJlbG93KDQpO1xuICAgKiAgICAgZXhwZWN0KFsgMSwgMiwgMyBdKS50by5oYXZlLmxlbmd0aC5iZWxvdyg0KTtcbiAgICogICAgIGV4cGVjdCgnZm9vJykudG8uaGF2ZS5sZW5ndGgud2l0aGluKDIsNCk7XG4gICAqICAgICBleHBlY3QoWyAxLCAyLCAzIF0pLnRvLmhhdmUubGVuZ3RoLndpdGhpbigyLDQpO1xuICAgKlxuICAgKiBAbmFtZSBsZW5ndGhcbiAgICogQGFsaWFzIGxlbmd0aE9mXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBsZW5ndGhcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBmdW5jdGlvbiBhc3NlcnRMZW5ndGhDaGFpbiAoKSB7XG4gICAgZmxhZyh0aGlzLCAnZG9MZW5ndGgnLCB0cnVlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFzc2VydExlbmd0aCAobiwgbXNnKSB7XG4gICAgaWYgKG1zZykgZmxhZyh0aGlzLCAnbWVzc2FnZScsIG1zZyk7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpO1xuICAgIG5ldyBBc3NlcnRpb24ob2JqLCBtc2cpLnRvLmhhdmUucHJvcGVydHkoJ2xlbmd0aCcpO1xuICAgIHZhciBsZW4gPSBvYmoubGVuZ3RoO1xuXG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgIGxlbiA9PSBuXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGhhdmUgYSBsZW5ndGggb2YgI3tleHB9IGJ1dCBnb3QgI3thY3R9J1xuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgaGF2ZSBhIGxlbmd0aCBvZiAje2FjdH0nXG4gICAgICAsIG5cbiAgICAgICwgbGVuXG4gICAgKTtcbiAgfVxuXG4gIEFzc2VydGlvbi5hZGRDaGFpbmFibGVNZXRob2QoJ2xlbmd0aCcsIGFzc2VydExlbmd0aCwgYXNzZXJ0TGVuZ3RoQ2hhaW4pO1xuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdsZW5ndGhPZicsIGFzc2VydExlbmd0aCwgYXNzZXJ0TGVuZ3RoQ2hhaW4pO1xuXG4gIC8qKlxuICAgKiAjIyMgLm1hdGNoKHJlZ2V4cClcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSB0YXJnZXQgbWF0Y2hlcyBhIHJlZ3VsYXIgZXhwcmVzc2lvbi5cbiAgICpcbiAgICogICAgIGV4cGVjdCgnZm9vYmFyJykudG8ubWF0Y2goL15mb28vKTtcbiAgICpcbiAgICogQG5hbWUgbWF0Y2hcbiAgICogQHBhcmFtIHtSZWdFeHB9IFJlZ3VsYXJFeHByZXNzaW9uXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnbWF0Y2gnLCBmdW5jdGlvbiAocmUsIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKTtcbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgcmUuZXhlYyhvYmopXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG1hdGNoICcgKyByZVxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSBub3QgdG8gbWF0Y2ggJyArIHJlXG4gICAgKTtcbiAgfSk7XG5cbiAgLyoqXG4gICAqICMjIyAuc3RyaW5nKHN0cmluZylcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSBzdHJpbmcgdGFyZ2V0IGNvbnRhaW5zIGFub3RoZXIgc3RyaW5nLlxuICAgKlxuICAgKiAgICAgZXhwZWN0KCdmb29iYXInKS50by5oYXZlLnN0cmluZygnYmFyJyk7XG4gICAqXG4gICAqIEBuYW1lIHN0cmluZ1xuICAgKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIF9vcHRpb25hbF9cbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgnc3RyaW5nJywgZnVuY3Rpb24gKHN0ciwgbXNnKSB7XG4gICAgaWYgKG1zZykgZmxhZyh0aGlzLCAnbWVzc2FnZScsIG1zZyk7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpO1xuICAgIG5ldyBBc3NlcnRpb24ob2JqLCBtc2cpLmlzLmEoJ3N0cmluZycpO1xuXG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgIH5vYmouaW5kZXhPZihzdHIpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIGNvbnRhaW4gJyArIF8uaW5zcGVjdChzdHIpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBjb250YWluICcgKyBfLmluc3BlY3Qoc3RyKVxuICAgICk7XG4gIH0pO1xuXG5cbiAgLyoqXG4gICAqICMjIyAua2V5cyhrZXkxLCBba2V5Ml0sIFsuLi5dKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBoYXMgZXhhY3RseSB0aGUgZ2l2ZW4ga2V5cywgb3JcbiAgICogYXNzZXJ0cyB0aGUgaW5jbHVzaW9uIG9mIHNvbWUga2V5cyB3aGVuIHVzaW5nIHRoZVxuICAgKiBgaW5jbHVkZWAgb3IgYGNvbnRhaW5gIG1vZGlmaWVycy5cbiAgICpcbiAgICogICAgIGV4cGVjdCh7IGZvbzogMSwgYmFyOiAyIH0pLnRvLmhhdmUua2V5cyhbJ2ZvbycsICdiYXInXSk7XG4gICAqICAgICBleHBlY3QoeyBmb286IDEsIGJhcjogMiwgYmF6OiAzIH0pLnRvLmNvbnRhaW4ua2V5cygnZm9vJywgJ2JhcicpO1xuICAgKlxuICAgKiBAbmFtZSBrZXlzXG4gICAqIEBhbGlhcyBrZXlcbiAgICogQHBhcmFtIHtTdHJpbmcuLi58QXJyYXl9IGtleXNcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gYXNzZXJ0S2V5cyAoa2V5cykge1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKVxuICAgICAgLCBzdHJcbiAgICAgICwgb2sgPSB0cnVlO1xuXG4gICAga2V5cyA9IGtleXMgaW5zdGFuY2VvZiBBcnJheVxuICAgICAgPyBrZXlzXG4gICAgICA6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cbiAgICBpZiAoIWtleXMubGVuZ3RoKSB0aHJvdyBuZXcgRXJyb3IoJ2tleXMgcmVxdWlyZWQnKTtcblxuICAgIHZhciBhY3R1YWwgPSBPYmplY3Qua2V5cyhvYmopXG4gICAgICAsIGxlbiA9IGtleXMubGVuZ3RoO1xuXG4gICAgLy8gSW5jbHVzaW9uXG4gICAgb2sgPSBrZXlzLmV2ZXJ5KGZ1bmN0aW9uKGtleSl7XG4gICAgICByZXR1cm4gfmFjdHVhbC5pbmRleE9mKGtleSk7XG4gICAgfSk7XG5cbiAgICAvLyBTdHJpY3RcbiAgICBpZiAoIWZsYWcodGhpcywgJ25lZ2F0ZScpICYmICFmbGFnKHRoaXMsICdjb250YWlucycpKSB7XG4gICAgICBvayA9IG9rICYmIGtleXMubGVuZ3RoID09IGFjdHVhbC5sZW5ndGg7XG4gICAgfVxuXG4gICAgLy8gS2V5IHN0cmluZ1xuICAgIGlmIChsZW4gPiAxKSB7XG4gICAgICBrZXlzID0ga2V5cy5tYXAoZnVuY3Rpb24oa2V5KXtcbiAgICAgICAgcmV0dXJuIF8uaW5zcGVjdChrZXkpO1xuICAgICAgfSk7XG4gICAgICB2YXIgbGFzdCA9IGtleXMucG9wKCk7XG4gICAgICBzdHIgPSBrZXlzLmpvaW4oJywgJykgKyAnLCBhbmQgJyArIGxhc3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IF8uaW5zcGVjdChrZXlzWzBdKTtcbiAgICB9XG5cbiAgICAvLyBGb3JtXG4gICAgc3RyID0gKGxlbiA+IDEgPyAna2V5cyAnIDogJ2tleSAnKSArIHN0cjtcblxuICAgIC8vIEhhdmUgLyBpbmNsdWRlXG4gICAgc3RyID0gKGZsYWcodGhpcywgJ2NvbnRhaW5zJykgPyAnY29udGFpbiAnIDogJ2hhdmUgJykgKyBzdHI7XG5cbiAgICAvLyBBc3NlcnRpb25cbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgb2tcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gJyArIHN0clxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgJyArIHN0clxuICAgICk7XG4gIH1cblxuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdrZXlzJywgYXNzZXJ0S2V5cyk7XG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ2tleScsIGFzc2VydEtleXMpO1xuXG4gIC8qKlxuICAgKiAjIyMgLnRocm93KGNvbnN0cnVjdG9yKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIGZ1bmN0aW9uIHRhcmdldCB3aWxsIHRocm93IGEgc3BlY2lmaWMgZXJyb3IsIG9yIHNwZWNpZmljIHR5cGUgb2YgZXJyb3JcbiAgICogKGFzIGRldGVybWluZWQgdXNpbmcgYGluc3RhbmNlb2ZgKSwgb3B0aW9uYWxseSB3aXRoIGEgUmVnRXhwIG9yIHN0cmluZyBpbmNsdXNpb24gdGVzdFxuICAgKiBmb3IgdGhlIGVycm9yJ3MgbWVzc2FnZS5cbiAgICpcbiAgICogICAgIHZhciBlcnIgPSBuZXcgUmVmZXJlbmNlRXJyb3IoJ1RoaXMgaXMgYSBiYWQgZnVuY3Rpb24uJyk7XG4gICAqICAgICB2YXIgZm4gPSBmdW5jdGlvbiAoKSB7IHRocm93IGVycjsgfVxuICAgKiAgICAgZXhwZWN0KGZuKS50by50aHJvdyhSZWZlcmVuY2VFcnJvcik7XG4gICAqICAgICBleHBlY3QoZm4pLnRvLnRocm93KEVycm9yKTtcbiAgICogICAgIGV4cGVjdChmbikudG8udGhyb3coL2JhZCBmdW5jdGlvbi8pO1xuICAgKiAgICAgZXhwZWN0KGZuKS50by5ub3QudGhyb3coJ2dvb2QgZnVuY3Rpb24nKTtcbiAgICogICAgIGV4cGVjdChmbikudG8udGhyb3coUmVmZXJlbmNlRXJyb3IsIC9iYWQgZnVuY3Rpb24vKTtcbiAgICogICAgIGV4cGVjdChmbikudG8udGhyb3coZXJyKTtcbiAgICogICAgIGV4cGVjdChmbikudG8ubm90LnRocm93KG5ldyBSYW5nZUVycm9yKCdPdXQgb2YgcmFuZ2UuJykpO1xuICAgKlxuICAgKiBQbGVhc2Ugbm90ZSB0aGF0IHdoZW4gYSB0aHJvdyBleHBlY3RhdGlvbiBpcyBuZWdhdGVkLCBpdCB3aWxsIGNoZWNrIGVhY2hcbiAgICogcGFyYW1ldGVyIGluZGVwZW5kZW50bHksIHN0YXJ0aW5nIHdpdGggZXJyb3IgY29uc3RydWN0b3IgdHlwZS4gVGhlIGFwcHJvcHJpYXRlIHdheVxuICAgKiB0byBjaGVjayBmb3IgdGhlIGV4aXN0ZW5jZSBvZiBhIHR5cGUgb2YgZXJyb3IgYnV0IGZvciBhIG1lc3NhZ2UgdGhhdCBkb2VzIG5vdCBtYXRjaFxuICAgKiBpcyB0byB1c2UgYGFuZGAuXG4gICAqXG4gICAqICAgICBleHBlY3QoZm4pLnRvLnRocm93KFJlZmVyZW5jZUVycm9yKVxuICAgKiAgICAgICAgLmFuZC5ub3QudGhyb3coL2dvb2QgZnVuY3Rpb24vKTtcbiAgICpcbiAgICogQG5hbWUgdGhyb3dcbiAgICogQGFsaWFzIHRocm93c1xuICAgKiBAYWxpYXMgVGhyb3dcbiAgICogQHBhcmFtIHtFcnJvckNvbnN0cnVjdG9yfSBjb25zdHJ1Y3RvclxuICAgKiBAcGFyYW0ge1N0cmluZ3xSZWdFeHB9IGV4cGVjdGVkIGVycm9yIG1lc3NhZ2VcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAc2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL0Vycm9yI0Vycm9yX3R5cGVzXG4gICAqIEByZXR1cm5zIGVycm9yIGZvciBjaGFpbmluZyAobnVsbCBpZiBubyBlcnJvcilcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgZnVuY3Rpb24gYXNzZXJ0VGhyb3dzIChjb25zdHJ1Y3RvciwgZXJyTXNnLCBtc2cpIHtcbiAgICBpZiAobXNnKSBmbGFnKHRoaXMsICdtZXNzYWdlJywgbXNnKTtcbiAgICB2YXIgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG4gICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykuaXMuYSgnZnVuY3Rpb24nKTtcblxuICAgIHZhciB0aHJvd24gPSBmYWxzZVxuICAgICAgLCBkZXNpcmVkRXJyb3IgPSBudWxsXG4gICAgICAsIG5hbWUgPSBudWxsXG4gICAgICAsIHRocm93bkVycm9yID0gbnVsbDtcblxuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBlcnJNc2cgPSBudWxsO1xuICAgICAgY29uc3RydWN0b3IgPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoY29uc3RydWN0b3IgJiYgKGNvbnN0cnVjdG9yIGluc3RhbmNlb2YgUmVnRXhwIHx8ICdzdHJpbmcnID09PSB0eXBlb2YgY29uc3RydWN0b3IpKSB7XG4gICAgICBlcnJNc2cgPSBjb25zdHJ1Y3RvcjtcbiAgICAgIGNvbnN0cnVjdG9yID0gbnVsbDtcbiAgICB9IGVsc2UgaWYgKGNvbnN0cnVjdG9yICYmIGNvbnN0cnVjdG9yIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgIGRlc2lyZWRFcnJvciA9IGNvbnN0cnVjdG9yO1xuICAgICAgY29uc3RydWN0b3IgPSBudWxsO1xuICAgICAgZXJyTXNnID0gbnVsbDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBjb25zdHJ1Y3RvciA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgbmFtZSA9IGNvbnN0cnVjdG9yLnByb3RvdHlwZS5uYW1lIHx8IGNvbnN0cnVjdG9yLm5hbWU7XG4gICAgICBpZiAobmFtZSA9PT0gJ0Vycm9yJyAmJiBjb25zdHJ1Y3RvciAhPT0gRXJyb3IpIHtcbiAgICAgICAgbmFtZSA9IChuZXcgY29uc3RydWN0b3IoKSkubmFtZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3RydWN0b3IgPSBudWxsO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBvYmooKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIC8vIGZpcnN0LCBjaGVjayBkZXNpcmVkIGVycm9yXG4gICAgICBpZiAoZGVzaXJlZEVycm9yKSB7XG4gICAgICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICAgICAgZXJyID09PSBkZXNpcmVkRXJyb3JcbiAgICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIHRocm93ICN7ZXhwfSBidXQgI3thY3R9IHdhcyB0aHJvd24nXG4gICAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgdGhyb3cgI3tleHB9J1xuICAgICAgICAgICwgKGRlc2lyZWRFcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZGVzaXJlZEVycm9yLnRvU3RyaW5nKCkgOiBkZXNpcmVkRXJyb3IpXG4gICAgICAgICAgLCAoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIudG9TdHJpbmcoKSA6IGVycilcbiAgICAgICAgKTtcblxuICAgICAgICBmbGFnKHRoaXMsICdvYmplY3QnLCBlcnIpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cblxuICAgICAgLy8gbmV4dCwgY2hlY2sgY29uc3RydWN0b3JcbiAgICAgIGlmIChjb25zdHJ1Y3Rvcikge1xuICAgICAgICB0aGlzLmFzc2VydChcbiAgICAgICAgICAgIGVyciBpbnN0YW5jZW9mIGNvbnN0cnVjdG9yXG4gICAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byB0aHJvdyAje2V4cH0gYnV0ICN7YWN0fSB3YXMgdGhyb3duJ1xuICAgICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IHRocm93ICN7ZXhwfSBidXQgI3thY3R9IHdhcyB0aHJvd24nXG4gICAgICAgICAgLCBuYW1lXG4gICAgICAgICAgLCAoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIudG9TdHJpbmcoKSA6IGVycilcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoIWVyck1zZykge1xuICAgICAgICAgIGZsYWcodGhpcywgJ29iamVjdCcsIGVycik7XG4gICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gbmV4dCwgY2hlY2sgbWVzc2FnZVxuICAgICAgdmFyIG1lc3NhZ2UgPSAnb2JqZWN0JyA9PT0gXy50eXBlKGVycikgJiYgXCJtZXNzYWdlXCIgaW4gZXJyXG4gICAgICAgID8gZXJyLm1lc3NhZ2VcbiAgICAgICAgOiAnJyArIGVycjtcblxuICAgICAgaWYgKChtZXNzYWdlICE9IG51bGwpICYmIGVyck1zZyAmJiBlcnJNc2cgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgICBlcnJNc2cuZXhlYyhtZXNzYWdlKVxuICAgICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gdGhyb3cgZXJyb3IgbWF0Y2hpbmcgI3tleHB9IGJ1dCBnb3QgI3thY3R9J1xuICAgICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gdGhyb3cgZXJyb3Igbm90IG1hdGNoaW5nICN7ZXhwfSdcbiAgICAgICAgICAsIGVyck1zZ1xuICAgICAgICAgICwgbWVzc2FnZVxuICAgICAgICApO1xuXG4gICAgICAgIGZsYWcodGhpcywgJ29iamVjdCcsIGVycik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfSBlbHNlIGlmICgobWVzc2FnZSAhPSBudWxsKSAmJiBlcnJNc2cgJiYgJ3N0cmluZycgPT09IHR5cGVvZiBlcnJNc2cpIHtcbiAgICAgICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICAgICB+bWVzc2FnZS5pbmRleE9mKGVyck1zZylcbiAgICAgICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIHRocm93IGVycm9yIGluY2x1ZGluZyAje2V4cH0gYnV0IGdvdCAje2FjdH0nXG4gICAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byB0aHJvdyBlcnJvciBub3QgaW5jbHVkaW5nICN7YWN0fSdcbiAgICAgICAgICAsIGVyck1zZ1xuICAgICAgICAgICwgbWVzc2FnZVxuICAgICAgICApO1xuXG4gICAgICAgIGZsYWcodGhpcywgJ29iamVjdCcsIGVycik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3duID0gdHJ1ZTtcbiAgICAgICAgdGhyb3duRXJyb3IgPSBlcnI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGFjdHVhbGx5R290ID0gJydcbiAgICAgICwgZXhwZWN0ZWRUaHJvd24gPSBuYW1lICE9PSBudWxsXG4gICAgICAgID8gbmFtZVxuICAgICAgICA6IGRlc2lyZWRFcnJvclxuICAgICAgICAgID8gJyN7ZXhwfScgLy9fLmluc3BlY3QoZGVzaXJlZEVycm9yKVxuICAgICAgICAgIDogJ2FuIGVycm9yJztcblxuICAgIGlmICh0aHJvd24pIHtcbiAgICAgIGFjdHVhbGx5R290ID0gJyBidXQgI3thY3R9IHdhcyB0aHJvd24nXG4gICAgfVxuXG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgIHRocm93biA9PT0gdHJ1ZVxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byB0aHJvdyAnICsgZXhwZWN0ZWRUaHJvd24gKyBhY3R1YWxseUdvdFxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgdGhyb3cgJyArIGV4cGVjdGVkVGhyb3duICsgYWN0dWFsbHlHb3RcbiAgICAgICwgKGRlc2lyZWRFcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZGVzaXJlZEVycm9yLnRvU3RyaW5nKCkgOiBkZXNpcmVkRXJyb3IpXG4gICAgICAsICh0aHJvd25FcnJvciBpbnN0YW5jZW9mIEVycm9yID8gdGhyb3duRXJyb3IudG9TdHJpbmcoKSA6IHRocm93bkVycm9yKVxuICAgICk7XG5cbiAgICBmbGFnKHRoaXMsICdvYmplY3QnLCB0aHJvd25FcnJvcik7XG4gIH07XG5cbiAgQXNzZXJ0aW9uLmFkZE1ldGhvZCgndGhyb3cnLCBhc3NlcnRUaHJvd3MpO1xuICBBc3NlcnRpb24uYWRkTWV0aG9kKCd0aHJvd3MnLCBhc3NlcnRUaHJvd3MpO1xuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdUaHJvdycsIGFzc2VydFRocm93cyk7XG5cbiAgLyoqXG4gICAqICMjIyAucmVzcG9uZFRvKG1ldGhvZClcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IHRoZSBvYmplY3Qgb3IgY2xhc3MgdGFyZ2V0IHdpbGwgcmVzcG9uZCB0byBhIG1ldGhvZC5cbiAgICpcbiAgICogICAgIEtsYXNzLnByb3RvdHlwZS5iYXIgPSBmdW5jdGlvbigpe307XG4gICAqICAgICBleHBlY3QoS2xhc3MpLnRvLnJlc3BvbmRUbygnYmFyJyk7XG4gICAqICAgICBleHBlY3Qob2JqKS50by5yZXNwb25kVG8oJ2JhcicpO1xuICAgKlxuICAgKiBUbyBjaGVjayBpZiBhIGNvbnN0cnVjdG9yIHdpbGwgcmVzcG9uZCB0byBhIHN0YXRpYyBmdW5jdGlvbixcbiAgICogc2V0IHRoZSBgaXRzZWxmYCBmbGFnLlxuICAgKlxuICAgKiAgICAgS2xhc3MuYmF6ID0gZnVuY3Rpb24oKXt9O1xuICAgKiAgICAgZXhwZWN0KEtsYXNzKS5pdHNlbGYudG8ucmVzcG9uZFRvKCdiYXonKTtcbiAgICpcbiAgICogQG5hbWUgcmVzcG9uZFRvXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXRob2RcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdyZXNwb25kVG8nLCBmdW5jdGlvbiAobWV0aG9kLCBtc2cpIHtcbiAgICBpZiAobXNnKSBmbGFnKHRoaXMsICdtZXNzYWdlJywgbXNnKTtcbiAgICB2YXIgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0JylcbiAgICAgICwgaXRzZWxmID0gZmxhZyh0aGlzLCAnaXRzZWxmJylcbiAgICAgICwgY29udGV4dCA9ICgnZnVuY3Rpb24nID09PSBfLnR5cGUob2JqKSAmJiAhaXRzZWxmKVxuICAgICAgICA/IG9iai5wcm90b3R5cGVbbWV0aG9kXVxuICAgICAgICA6IG9ialttZXRob2RdO1xuXG4gICAgdGhpcy5hc3NlcnQoXG4gICAgICAgICdmdW5jdGlvbicgPT09IHR5cGVvZiBjb250ZXh0XG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIHJlc3BvbmQgdG8gJyArIF8uaW5zcGVjdChtZXRob2QpXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCByZXNwb25kIHRvICcgKyBfLmluc3BlY3QobWV0aG9kKVxuICAgICk7XG4gIH0pO1xuXG4gIC8qKlxuICAgKiAjIyMgLml0c2VsZlxuICAgKlxuICAgKiBTZXRzIHRoZSBgaXRzZWxmYCBmbGFnLCBsYXRlciB1c2VkIGJ5IHRoZSBgcmVzcG9uZFRvYCBhc3NlcnRpb24uXG4gICAqXG4gICAqICAgICBmdW5jdGlvbiBGb28oKSB7fVxuICAgKiAgICAgRm9vLmJhciA9IGZ1bmN0aW9uKCkge31cbiAgICogICAgIEZvby5wcm90b3R5cGUuYmF6ID0gZnVuY3Rpb24oKSB7fVxuICAgKlxuICAgKiAgICAgZXhwZWN0KEZvbykuaXRzZWxmLnRvLnJlc3BvbmRUbygnYmFyJyk7XG4gICAqICAgICBleHBlY3QoRm9vKS5pdHNlbGYubm90LnRvLnJlc3BvbmRUbygnYmF6Jyk7XG4gICAqXG4gICAqIEBuYW1lIGl0c2VsZlxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkUHJvcGVydHkoJ2l0c2VsZicsIGZ1bmN0aW9uICgpIHtcbiAgICBmbGFnKHRoaXMsICdpdHNlbGYnLCB0cnVlKTtcbiAgfSk7XG5cbiAgLyoqXG4gICAqICMjIyAuc2F0aXNmeShtZXRob2QpXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IHBhc3NlcyBhIGdpdmVuIHRydXRoIHRlc3QuXG4gICAqXG4gICAqICAgICBleHBlY3QoMSkudG8uc2F0aXNmeShmdW5jdGlvbihudW0pIHsgcmV0dXJuIG51bSA+IDA7IH0pO1xuICAgKlxuICAgKiBAbmFtZSBzYXRpc2Z5XG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG1hdGNoZXJcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdzYXRpc2Z5JywgZnVuY3Rpb24gKG1hdGNoZXIsIG1zZykge1xuICAgIGlmIChtc2cpIGZsYWcodGhpcywgJ21lc3NhZ2UnLCBtc2cpO1xuICAgIHZhciBvYmogPSBmbGFnKHRoaXMsICdvYmplY3QnKTtcbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgbWF0Y2hlcihvYmopXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIHNhdGlzZnkgJyArIF8ub2JqRGlzcGxheShtYXRjaGVyKVxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3Qgc2F0aXNmeScgKyBfLm9iakRpc3BsYXkobWF0Y2hlcilcbiAgICAgICwgdGhpcy5uZWdhdGUgPyBmYWxzZSA6IHRydWVcbiAgICAgICwgbWF0Y2hlcihvYmopXG4gICAgKTtcbiAgfSk7XG5cbiAgLyoqXG4gICAqICMjIyAuY2xvc2VUbyhleHBlY3RlZCwgZGVsdGEpXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGlzIGVxdWFsIGBleHBlY3RlZGAsIHRvIHdpdGhpbiBhICsvLSBgZGVsdGFgIHJhbmdlLlxuICAgKlxuICAgKiAgICAgZXhwZWN0KDEuNSkudG8uYmUuY2xvc2VUbygxLCAwLjUpO1xuICAgKlxuICAgKiBAbmFtZSBjbG9zZVRvXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBleHBlY3RlZFxuICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgX29wdGlvbmFsX1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBBc3NlcnRpb24uYWRkTWV0aG9kKCdjbG9zZVRvJywgZnVuY3Rpb24gKGV4cGVjdGVkLCBkZWx0YSwgbXNnKSB7XG4gICAgaWYgKG1zZykgZmxhZyh0aGlzLCAnbWVzc2FnZScsIG1zZyk7XG4gICAgdmFyIG9iaiA9IGZsYWcodGhpcywgJ29iamVjdCcpO1xuICAgIHRoaXMuYXNzZXJ0KFxuICAgICAgICBNYXRoLmFicyhvYmogLSBleHBlY3RlZCkgPD0gZGVsdGFcbiAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgY2xvc2UgdG8gJyArIGV4cGVjdGVkICsgJyArLy0gJyArIGRlbHRhXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IG5vdCB0byBiZSBjbG9zZSB0byAnICsgZXhwZWN0ZWQgKyAnICsvLSAnICsgZGVsdGFcbiAgICApO1xuICB9KTtcblxuICBmdW5jdGlvbiBpc1N1YnNldE9mKHN1YnNldCwgc3VwZXJzZXQsIGNtcCkge1xuICAgIHJldHVybiBzdWJzZXQuZXZlcnkoZnVuY3Rpb24oZWxlbSkge1xuICAgICAgaWYgKCFjbXApIHJldHVybiBzdXBlcnNldC5pbmRleE9mKGVsZW0pICE9PSAtMTtcblxuICAgICAgcmV0dXJuIHN1cGVyc2V0LnNvbWUoZnVuY3Rpb24oZWxlbTIpIHtcbiAgICAgICAgcmV0dXJuIGNtcChlbGVtLCBlbGVtMik7XG4gICAgICB9KTtcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqICMjIyAubWVtYmVycyhzZXQpXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCB0aGUgdGFyZ2V0IGlzIGEgc3VwZXJzZXQgb2YgYHNldGAsXG4gICAqIG9yIHRoYXQgdGhlIHRhcmdldCBhbmQgYHNldGAgaGF2ZSB0aGUgc2FtZSBzdHJpY3RseS1lcXVhbCAoPT09KSBtZW1iZXJzLlxuICAgKiBBbHRlcm5hdGVseSwgaWYgdGhlIGBkZWVwYCBmbGFnIGlzIHNldCwgc2V0IG1lbWJlcnMgYXJlIGNvbXBhcmVkIGZvciBkZWVwXG4gICAqIGVxdWFsaXR5LlxuICAgKlxuICAgKiAgICAgZXhwZWN0KFsxLCAyLCAzXSkudG8uaW5jbHVkZS5tZW1iZXJzKFszLCAyXSk7XG4gICAqICAgICBleHBlY3QoWzEsIDIsIDNdKS50by5ub3QuaW5jbHVkZS5tZW1iZXJzKFszLCAyLCA4XSk7XG4gICAqXG4gICAqICAgICBleHBlY3QoWzQsIDJdKS50by5oYXZlLm1lbWJlcnMoWzIsIDRdKTtcbiAgICogICAgIGV4cGVjdChbNSwgMl0pLnRvLm5vdC5oYXZlLm1lbWJlcnMoWzUsIDIsIDFdKTtcbiAgICpcbiAgICogICAgIGV4cGVjdChbeyBpZDogMSB9XSkudG8uZGVlcC5pbmNsdWRlLm1lbWJlcnMoW3sgaWQ6IDEgfV0pO1xuICAgKlxuICAgKiBAbmFtZSBtZW1iZXJzXG4gICAqIEBwYXJhbSB7QXJyYXl9IHNldFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBfb3B0aW9uYWxfXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIEFzc2VydGlvbi5hZGRNZXRob2QoJ21lbWJlcnMnLCBmdW5jdGlvbiAoc3Vic2V0LCBtc2cpIHtcbiAgICBpZiAobXNnKSBmbGFnKHRoaXMsICdtZXNzYWdlJywgbXNnKTtcbiAgICB2YXIgb2JqID0gZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG5cbiAgICBuZXcgQXNzZXJ0aW9uKG9iaikudG8uYmUuYW4oJ2FycmF5Jyk7XG4gICAgbmV3IEFzc2VydGlvbihzdWJzZXQpLnRvLmJlLmFuKCdhcnJheScpO1xuXG4gICAgdmFyIGNtcCA9IGZsYWcodGhpcywgJ2RlZXAnKSA/IF8uZXFsIDogdW5kZWZpbmVkO1xuXG4gICAgaWYgKGZsYWcodGhpcywgJ2NvbnRhaW5zJykpIHtcbiAgICAgIHJldHVybiB0aGlzLmFzc2VydChcbiAgICAgICAgICBpc1N1YnNldE9mKHN1YnNldCwgb2JqLCBjbXApXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gYmUgYSBzdXBlcnNldCBvZiAje2FjdH0nXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gbm90IGJlIGEgc3VwZXJzZXQgb2YgI3thY3R9J1xuICAgICAgICAsIG9ialxuICAgICAgICAsIHN1YnNldFxuICAgICAgKTtcbiAgICB9XG5cbiAgICB0aGlzLmFzc2VydChcbiAgICAgICAgaXNTdWJzZXRPZihvYmosIHN1YnNldCwgY21wKSAmJiBpc1N1YnNldE9mKHN1YnNldCwgb2JqLCBjbXApXG4gICAgICAgICwgJ2V4cGVjdGVkICN7dGhpc30gdG8gaGF2ZSB0aGUgc2FtZSBtZW1iZXJzIGFzICN7YWN0fSdcbiAgICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgaGF2ZSB0aGUgc2FtZSBtZW1iZXJzIGFzICN7YWN0fSdcbiAgICAgICAgLCBvYmpcbiAgICAgICAgLCBzdWJzZXRcbiAgICApO1xuICB9KTtcbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvaW50ZXJmYWNlL2Fzc2VydC5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBjaGFpXG4gKiBDb3B5cmlnaHQoYykgMjAxMS0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjaGFpLCB1dGlsKSB7XG5cbiAgLyohXG4gICAqIENoYWkgZGVwZW5kZW5jaWVzLlxuICAgKi9cblxuICB2YXIgQXNzZXJ0aW9uID0gY2hhaS5Bc3NlcnRpb25cbiAgICAsIGZsYWcgPSB1dGlsLmZsYWc7XG5cbiAgLyohXG4gICAqIE1vZHVsZSBleHBvcnQuXG4gICAqL1xuXG4gIC8qKlxuICAgKiAjIyMgYXNzZXJ0KGV4cHJlc3Npb24sIG1lc3NhZ2UpXG4gICAqXG4gICAqIFdyaXRlIHlvdXIgb3duIHRlc3QgZXhwcmVzc2lvbnMuXG4gICAqXG4gICAqICAgICBhc3NlcnQoJ2ZvbycgIT09ICdiYXInLCAnZm9vIGlzIG5vdCBiYXInKTtcbiAgICogICAgIGFzc2VydChBcnJheS5pc0FycmF5KFtdKSwgJ2VtcHR5IGFycmF5cyBhcmUgYXJyYXlzJyk7XG4gICAqXG4gICAqIEBwYXJhbSB7TWl4ZWR9IGV4cHJlc3Npb24gdG8gdGVzdCBmb3IgdHJ1dGhpbmVzc1xuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSB0byBkaXNwbGF5IG9uIGVycm9yXG4gICAqIEBuYW1lIGFzc2VydFxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICB2YXIgYXNzZXJ0ID0gY2hhaS5hc3NlcnQgPSBmdW5jdGlvbiAoZXhwcmVzcywgZXJybXNnKSB7XG4gICAgdmFyIHRlc3QgPSBuZXcgQXNzZXJ0aW9uKG51bGwsIG51bGwsIGNoYWkuYXNzZXJ0KTtcbiAgICB0ZXN0LmFzc2VydChcbiAgICAgICAgZXhwcmVzc1xuICAgICAgLCBlcnJtc2dcbiAgICAgICwgJ1sgbmVnYXRpb24gbWVzc2FnZSB1bmF2YWlsYWJsZSBdJ1xuICAgICk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBbbWVzc2FnZV0sIFtvcGVyYXRvcl0pXG4gICAqXG4gICAqIFRocm93IGEgZmFpbHVyZS4gTm9kZS5qcyBgYXNzZXJ0YCBtb2R1bGUtY29tcGF0aWJsZS5cbiAgICpcbiAgICogQG5hbWUgZmFpbFxuICAgKiBAcGFyYW0ge01peGVkfSBhY3R1YWxcbiAgICogQHBhcmFtIHtNaXhlZH0gZXhwZWN0ZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wZXJhdG9yXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5mYWlsID0gZnVuY3Rpb24gKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsIG9wZXJhdG9yKSB7XG4gICAgbWVzc2FnZSA9IG1lc3NhZ2UgfHwgJ2Fzc2VydC5mYWlsKCknO1xuICAgIHRocm93IG5ldyBjaGFpLkFzc2VydGlvbkVycm9yKG1lc3NhZ2UsIHtcbiAgICAgICAgYWN0dWFsOiBhY3R1YWxcbiAgICAgICwgZXhwZWN0ZWQ6IGV4cGVjdGVkXG4gICAgICAsIG9wZXJhdG9yOiBvcGVyYXRvclxuICAgIH0sIGFzc2VydC5mYWlsKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5vayhvYmplY3QsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBvYmplY3RgIGlzIHRydXRoeS5cbiAgICpcbiAgICogICAgIGFzc2VydC5vaygnZXZlcnl0aGluZycsICdldmVyeXRoaW5nIGlzIG9rJyk7XG4gICAqICAgICBhc3NlcnQub2soZmFsc2UsICd0aGlzIHdpbGwgZmFpbCcpO1xuICAgKlxuICAgKiBAbmFtZSBva1xuICAgKiBAcGFyYW0ge01peGVkfSBvYmplY3QgdG8gdGVzdFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQub2sgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS5pcy5vaztcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5ub3RPayhvYmplY3QsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBvYmplY3RgIGlzIGZhbHN5LlxuICAgKlxuICAgKiAgICAgYXNzZXJ0Lm5vdE9rKCdldmVyeXRoaW5nJywgJ3RoaXMgd2lsbCBmYWlsJyk7XG4gICAqICAgICBhc3NlcnQubm90T2soZmFsc2UsICd0aGlzIHdpbGwgcGFzcycpO1xuICAgKlxuICAgKiBAbmFtZSBub3RPa1xuICAgKiBAcGFyYW0ge01peGVkfSBvYmplY3QgdG8gdGVzdFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQubm90T2sgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS5pcy5ub3Qub2s7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuZXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIG5vbi1zdHJpY3QgZXF1YWxpdHkgKGA9PWApIG9mIGBhY3R1YWxgIGFuZCBgZXhwZWN0ZWRgLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LmVxdWFsKDMsICczJywgJz09IGNvZXJjZXMgdmFsdWVzIHRvIHN0cmluZ3MnKTtcbiAgICpcbiAgICogQG5hbWUgZXF1YWxcbiAgICogQHBhcmFtIHtNaXhlZH0gYWN0dWFsXG4gICAqIEBwYXJhbSB7TWl4ZWR9IGV4cGVjdGVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5lcXVhbCA9IGZ1bmN0aW9uIChhY3QsIGV4cCwgbXNnKSB7XG4gICAgdmFyIHRlc3QgPSBuZXcgQXNzZXJ0aW9uKGFjdCwgbXNnLCBhc3NlcnQuZXF1YWwpO1xuXG4gICAgdGVzdC5hc3NlcnQoXG4gICAgICAgIGV4cCA9PSBmbGFnKHRlc3QsICdvYmplY3QnKVxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBlcXVhbCAje2V4cH0nXG4gICAgICAsICdleHBlY3RlZCAje3RoaXN9IHRvIG5vdCBlcXVhbCAje2FjdH0nXG4gICAgICAsIGV4cFxuICAgICAgLCBhY3RcbiAgICApO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLm5vdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyBub24tc3RyaWN0IGluZXF1YWxpdHkgKGAhPWApIG9mIGBhY3R1YWxgIGFuZCBgZXhwZWN0ZWRgLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0Lm5vdEVxdWFsKDMsIDQsICd0aGVzZSBudW1iZXJzIGFyZSBub3QgZXF1YWwnKTtcbiAgICpcbiAgICogQG5hbWUgbm90RXF1YWxcbiAgICogQHBhcmFtIHtNaXhlZH0gYWN0dWFsXG4gICAqIEBwYXJhbSB7TWl4ZWR9IGV4cGVjdGVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5ub3RFcXVhbCA9IGZ1bmN0aW9uIChhY3QsIGV4cCwgbXNnKSB7XG4gICAgdmFyIHRlc3QgPSBuZXcgQXNzZXJ0aW9uKGFjdCwgbXNnLCBhc3NlcnQubm90RXF1YWwpO1xuXG4gICAgdGVzdC5hc3NlcnQoXG4gICAgICAgIGV4cCAhPSBmbGFnKHRlc3QsICdvYmplY3QnKVxuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBub3QgZXF1YWwgI3tleHB9J1xuICAgICAgLCAnZXhwZWN0ZWQgI3t0aGlzfSB0byBlcXVhbCAje2FjdH0nXG4gICAgICAsIGV4cFxuICAgICAgLCBhY3RcbiAgICApO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyBzdHJpY3QgZXF1YWxpdHkgKGA9PT1gKSBvZiBgYWN0dWFsYCBhbmQgYGV4cGVjdGVkYC5cbiAgICpcbiAgICogICAgIGFzc2VydC5zdHJpY3RFcXVhbCh0cnVlLCB0cnVlLCAndGhlc2UgYm9vbGVhbnMgYXJlIHN0cmljdGx5IGVxdWFsJyk7XG4gICAqXG4gICAqIEBuYW1lIHN0cmljdEVxdWFsXG4gICAqIEBwYXJhbSB7TWl4ZWR9IGFjdHVhbFxuICAgKiBAcGFyYW0ge01peGVkfSBleHBlY3RlZFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuc3RyaWN0RXF1YWwgPSBmdW5jdGlvbiAoYWN0LCBleHAsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24oYWN0LCBtc2cpLnRvLmVxdWFsKGV4cCk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAubm90U3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHN0cmljdCBpbmVxdWFsaXR5IChgIT09YCkgb2YgYGFjdHVhbGAgYW5kIGBleHBlY3RlZGAuXG4gICAqXG4gICAqICAgICBhc3NlcnQubm90U3RyaWN0RXF1YWwoMywgJzMnLCAnbm8gY29lcmNpb24gZm9yIHN0cmljdCBlcXVhbGl0eScpO1xuICAgKlxuICAgKiBAbmFtZSBub3RTdHJpY3RFcXVhbFxuICAgKiBAcGFyYW0ge01peGVkfSBhY3R1YWxcbiAgICogQHBhcmFtIHtNaXhlZH0gZXhwZWN0ZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0Lm5vdFN0cmljdEVxdWFsID0gZnVuY3Rpb24gKGFjdCwgZXhwLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKGFjdCwgbXNnKS50by5ub3QuZXF1YWwoZXhwKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5kZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYGFjdHVhbGAgaXMgZGVlcGx5IGVxdWFsIHRvIGBleHBlY3RlZGAuXG4gICAqXG4gICAqICAgICBhc3NlcnQuZGVlcEVxdWFsKHsgdGVhOiAnZ3JlZW4nIH0sIHsgdGVhOiAnZ3JlZW4nIH0pO1xuICAgKlxuICAgKiBAbmFtZSBkZWVwRXF1YWxcbiAgICogQHBhcmFtIHtNaXhlZH0gYWN0dWFsXG4gICAqIEBwYXJhbSB7TWl4ZWR9IGV4cGVjdGVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5kZWVwRXF1YWwgPSBmdW5jdGlvbiAoYWN0LCBleHAsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24oYWN0LCBtc2cpLnRvLmVxbChleHApO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLm5vdERlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydCB0aGF0IGBhY3R1YWxgIGlzIG5vdCBkZWVwbHkgZXF1YWwgdG8gYGV4cGVjdGVkYC5cbiAgICpcbiAgICogICAgIGFzc2VydC5ub3REZWVwRXF1YWwoeyB0ZWE6ICdncmVlbicgfSwgeyB0ZWE6ICdqYXNtaW5lJyB9KTtcbiAgICpcbiAgICogQG5hbWUgbm90RGVlcEVxdWFsXG4gICAqIEBwYXJhbSB7TWl4ZWR9IGFjdHVhbFxuICAgKiBAcGFyYW0ge01peGVkfSBleHBlY3RlZFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQubm90RGVlcEVxdWFsID0gZnVuY3Rpb24gKGFjdCwgZXhwLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKGFjdCwgbXNnKS50by5ub3QuZXFsKGV4cCk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNUcnVlKHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgIGlzIHRydWUuXG4gICAqXG4gICAqICAgICB2YXIgdGVhU2VydmVkID0gdHJ1ZTtcbiAgICogICAgIGFzc2VydC5pc1RydWUodGVhU2VydmVkLCAndGhlIHRlYSBoYXMgYmVlbiBzZXJ2ZWQnKTtcbiAgICpcbiAgICogQG5hbWUgaXNUcnVlXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pc1RydWUgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS5pc1sndHJ1ZSddO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmlzRmFsc2UodmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgaXMgZmFsc2UuXG4gICAqXG4gICAqICAgICB2YXIgdGVhU2VydmVkID0gZmFsc2U7XG4gICAqICAgICBhc3NlcnQuaXNGYWxzZSh0ZWFTZXJ2ZWQsICdubyB0ZWEgeWV0PyBobW0uLi4nKTtcbiAgICpcbiAgICogQG5hbWUgaXNGYWxzZVxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNGYWxzZSA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLmlzWydmYWxzZSddO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmlzTnVsbCh2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBudWxsLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LmlzTnVsbChlcnIsICd0aGVyZSB3YXMgbm8gZXJyb3InKTtcbiAgICpcbiAgICogQG5hbWUgaXNOdWxsXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pc051bGwgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5lcXVhbChudWxsKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc05vdE51bGwodmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgaXMgbm90IG51bGwuXG4gICAqXG4gICAqICAgICB2YXIgdGVhID0gJ3Rhc3R5IGNoYWknO1xuICAgKiAgICAgYXNzZXJ0LmlzTm90TnVsbCh0ZWEsICdncmVhdCwgdGltZSBmb3IgdGVhIScpO1xuICAgKlxuICAgKiBAbmFtZSBpc05vdE51bGxcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmlzTm90TnVsbCA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLm5vdC5lcXVhbChudWxsKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc1VuZGVmaW5lZCh2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBgdW5kZWZpbmVkYC5cbiAgICpcbiAgICogICAgIHZhciB0ZWE7XG4gICAqICAgICBhc3NlcnQuaXNVbmRlZmluZWQodGVhLCAnbm8gdGVhIGRlZmluZWQnKTtcbiAgICpcbiAgICogQG5hbWUgaXNVbmRlZmluZWRcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmlzVW5kZWZpbmVkID0gZnVuY3Rpb24gKHZhbCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykudG8uZXF1YWwodW5kZWZpbmVkKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc0RlZmluZWQodmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgaXMgbm90IGB1bmRlZmluZWRgLlxuICAgKlxuICAgKiAgICAgdmFyIHRlYSA9ICdjdXAgb2YgY2hhaSc7XG4gICAqICAgICBhc3NlcnQuaXNEZWZpbmVkKHRlYSwgJ3RlYSBoYXMgYmVlbiBkZWZpbmVkJyk7XG4gICAqXG4gICAqIEBuYW1lIGlzRGVmaW5lZFxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNEZWZpbmVkID0gZnVuY3Rpb24gKHZhbCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykudG8ubm90LmVxdWFsKHVuZGVmaW5lZCk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNGdW5jdGlvbih2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBhIGZ1bmN0aW9uLlxuICAgKlxuICAgKiAgICAgZnVuY3Rpb24gc2VydmVUZWEoKSB7IHJldHVybiAnY3VwIG9mIHRlYSc7IH07XG4gICAqICAgICBhc3NlcnQuaXNGdW5jdGlvbihzZXJ2ZVRlYSwgJ2dyZWF0LCB3ZSBjYW4gaGF2ZSB0ZWEgbm93Jyk7XG4gICAqXG4gICAqIEBuYW1lIGlzRnVuY3Rpb25cbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmlzRnVuY3Rpb24gPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5iZS5hKCdmdW5jdGlvbicpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmlzTm90RnVuY3Rpb24odmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgaXMgX25vdF8gYSBmdW5jdGlvbi5cbiAgICpcbiAgICogICAgIHZhciBzZXJ2ZVRlYSA9IFsgJ2hlYXQnLCAncG91cicsICdzaXAnIF07XG4gICAqICAgICBhc3NlcnQuaXNOb3RGdW5jdGlvbihzZXJ2ZVRlYSwgJ2dyZWF0LCB3ZSBoYXZlIGxpc3RlZCB0aGUgc3RlcHMnKTtcbiAgICpcbiAgICogQG5hbWUgaXNOb3RGdW5jdGlvblxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNOb3RGdW5jdGlvbiA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLm5vdC5iZS5hKCdmdW5jdGlvbicpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmlzT2JqZWN0KHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgIGlzIGFuIG9iamVjdCAoYXMgcmV2ZWFsZWQgYnlcbiAgICogYE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdgKS5cbiAgICpcbiAgICogICAgIHZhciBzZWxlY3Rpb24gPSB7IG5hbWU6ICdDaGFpJywgc2VydmU6ICd3aXRoIHNwaWNlcycgfTtcbiAgICogICAgIGFzc2VydC5pc09iamVjdChzZWxlY3Rpb24sICd0ZWEgc2VsZWN0aW9uIGlzIGFuIG9iamVjdCcpO1xuICAgKlxuICAgKiBAbmFtZSBpc09iamVjdFxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNPYmplY3QgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5iZS5hKCdvYmplY3QnKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc05vdE9iamVjdCh2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBfbm90XyBhbiBvYmplY3QuXG4gICAqXG4gICAqICAgICB2YXIgc2VsZWN0aW9uID0gJ2NoYWknXG4gICAqICAgICBhc3NlcnQuaXNOb3RPYmplY3Qoc2VsZWN0aW9uLCAndGVhIHNlbGVjdGlvbiBpcyBub3QgYW4gb2JqZWN0Jyk7XG4gICAqICAgICBhc3NlcnQuaXNOb3RPYmplY3QobnVsbCwgJ251bGwgaXMgbm90IGFuIG9iamVjdCcpO1xuICAgKlxuICAgKiBAbmFtZSBpc05vdE9iamVjdFxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNOb3RPYmplY3QgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5ub3QuYmUuYSgnb2JqZWN0Jyk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNBcnJheSh2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBhbiBhcnJheS5cbiAgICpcbiAgICogICAgIHZhciBtZW51ID0gWyAnZ3JlZW4nLCAnY2hhaScsICdvb2xvbmcnIF07XG4gICAqICAgICBhc3NlcnQuaXNBcnJheShtZW51LCAnd2hhdCBraW5kIG9mIHRlYSBkbyB3ZSB3YW50PycpO1xuICAgKlxuICAgKiBAbmFtZSBpc0FycmF5XG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pc0FycmF5ID0gZnVuY3Rpb24gKHZhbCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykudG8uYmUuYW4oJ2FycmF5Jyk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNOb3RBcnJheSh2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBfbm90XyBhbiBhcnJheS5cbiAgICpcbiAgICogICAgIHZhciBtZW51ID0gJ2dyZWVufGNoYWl8b29sb25nJztcbiAgICogICAgIGFzc2VydC5pc05vdEFycmF5KG1lbnUsICd3aGF0IGtpbmQgb2YgdGVhIGRvIHdlIHdhbnQ/Jyk7XG4gICAqXG4gICAqIEBuYW1lIGlzTm90QXJyYXlcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmlzTm90QXJyYXkgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5ub3QuYmUuYW4oJ2FycmF5Jyk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNTdHJpbmcodmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgaXMgYSBzdHJpbmcuXG4gICAqXG4gICAqICAgICB2YXIgdGVhT3JkZXIgPSAnY2hhaSc7XG4gICAqICAgICBhc3NlcnQuaXNTdHJpbmcodGVhT3JkZXIsICdvcmRlciBwbGFjZWQnKTtcbiAgICpcbiAgICogQG5hbWUgaXNTdHJpbmdcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmlzU3RyaW5nID0gZnVuY3Rpb24gKHZhbCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykudG8uYmUuYSgnc3RyaW5nJyk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNOb3RTdHJpbmcodmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgaXMgX25vdF8gYSBzdHJpbmcuXG4gICAqXG4gICAqICAgICB2YXIgdGVhT3JkZXIgPSA0O1xuICAgKiAgICAgYXNzZXJ0LmlzTm90U3RyaW5nKHRlYU9yZGVyLCAnb3JkZXIgcGxhY2VkJyk7XG4gICAqXG4gICAqIEBuYW1lIGlzTm90U3RyaW5nXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pc05vdFN0cmluZyA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLm5vdC5iZS5hKCdzdHJpbmcnKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pc051bWJlcih2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBpcyBhIG51bWJlci5cbiAgICpcbiAgICogICAgIHZhciBjdXBzID0gMjtcbiAgICogICAgIGFzc2VydC5pc051bWJlcihjdXBzLCAnaG93IG1hbnkgY3VwcycpO1xuICAgKlxuICAgKiBAbmFtZSBpc051bWJlclxuICAgKiBAcGFyYW0ge051bWJlcn0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmlzTnVtYmVyID0gZnVuY3Rpb24gKHZhbCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykudG8uYmUuYSgnbnVtYmVyJyk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNOb3ROdW1iZXIodmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgaXMgX25vdF8gYSBudW1iZXIuXG4gICAqXG4gICAqICAgICB2YXIgY3VwcyA9ICcyIGN1cHMgcGxlYXNlJztcbiAgICogICAgIGFzc2VydC5pc05vdE51bWJlcihjdXBzLCAnaG93IG1hbnkgY3VwcycpO1xuICAgKlxuICAgKiBAbmFtZSBpc05vdE51bWJlclxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaXNOb3ROdW1iZXIgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5ub3QuYmUuYSgnbnVtYmVyJyk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNCb29sZWFuKHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgIGlzIGEgYm9vbGVhbi5cbiAgICpcbiAgICogICAgIHZhciB0ZWFSZWFkeSA9IHRydWVcbiAgICogICAgICAgLCB0ZWFTZXJ2ZWQgPSBmYWxzZTtcbiAgICpcbiAgICogICAgIGFzc2VydC5pc0Jvb2xlYW4odGVhUmVhZHksICdpcyB0aGUgdGVhIHJlYWR5Jyk7XG4gICAqICAgICBhc3NlcnQuaXNCb29sZWFuKHRlYVNlcnZlZCwgJ2hhcyB0ZWEgYmVlbiBzZXJ2ZWQnKTtcbiAgICpcbiAgICogQG5hbWUgaXNCb29sZWFuXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pc0Jvb2xlYW4gPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5iZS5hKCdib29sZWFuJyk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuaXNOb3RCb29sZWFuKHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgIGlzIF9ub3RfIGEgYm9vbGVhbi5cbiAgICpcbiAgICogICAgIHZhciB0ZWFSZWFkeSA9ICd5ZXAnXG4gICAqICAgICAgICwgdGVhU2VydmVkID0gJ25vcGUnO1xuICAgKlxuICAgKiAgICAgYXNzZXJ0LmlzTm90Qm9vbGVhbih0ZWFSZWFkeSwgJ2lzIHRoZSB0ZWEgcmVhZHknKTtcbiAgICogICAgIGFzc2VydC5pc05vdEJvb2xlYW4odGVhU2VydmVkLCAnaGFzIHRlYSBiZWVuIHNlcnZlZCcpO1xuICAgKlxuICAgKiBAbmFtZSBpc05vdEJvb2xlYW5cbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmlzTm90Qm9vbGVhbiA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLm5vdC5iZS5hKCdib29sZWFuJyk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAudHlwZU9mKHZhbHVlLCBuYW1lLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgJ3MgdHlwZSBpcyBgbmFtZWAsIGFzIGRldGVybWluZWQgYnlcbiAgICogYE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdgLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LnR5cGVPZih7IHRlYTogJ2NoYWknIH0sICdvYmplY3QnLCAnd2UgaGF2ZSBhbiBvYmplY3QnKTtcbiAgICogICAgIGFzc2VydC50eXBlT2YoWydjaGFpJywgJ2phc21pbmUnXSwgJ2FycmF5JywgJ3dlIGhhdmUgYW4gYXJyYXknKTtcbiAgICogICAgIGFzc2VydC50eXBlT2YoJ3RlYScsICdzdHJpbmcnLCAnd2UgaGF2ZSBhIHN0cmluZycpO1xuICAgKiAgICAgYXNzZXJ0LnR5cGVPZigvdGVhLywgJ3JlZ2V4cCcsICd3ZSBoYXZlIGEgcmVndWxhciBleHByZXNzaW9uJyk7XG4gICAqICAgICBhc3NlcnQudHlwZU9mKG51bGwsICdudWxsJywgJ3dlIGhhdmUgYSBudWxsJyk7XG4gICAqICAgICBhc3NlcnQudHlwZU9mKHVuZGVmaW5lZCwgJ3VuZGVmaW5lZCcsICd3ZSBoYXZlIGFuIHVuZGVmaW5lZCcpO1xuICAgKlxuICAgKiBAbmFtZSB0eXBlT2ZcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LnR5cGVPZiA9IGZ1bmN0aW9uICh2YWwsIHR5cGUsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLmJlLmEodHlwZSk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAubm90VHlwZU9mKHZhbHVlLCBuYW1lLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgdmFsdWVgJ3MgdHlwZSBpcyBfbm90XyBgbmFtZWAsIGFzIGRldGVybWluZWQgYnlcbiAgICogYE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdgLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0Lm5vdFR5cGVPZigndGVhJywgJ251bWJlcicsICdzdHJpbmdzIGFyZSBub3QgbnVtYmVycycpO1xuICAgKlxuICAgKiBAbmFtZSBub3RUeXBlT2ZcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IHR5cGVvZiBuYW1lXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5ub3RUeXBlT2YgPSBmdW5jdGlvbiAodmFsLCB0eXBlLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5ub3QuYmUuYSh0eXBlKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pbnN0YW5jZU9mKG9iamVjdCwgY29uc3RydWN0b3IsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgaXMgYW4gaW5zdGFuY2Ugb2YgYGNvbnN0cnVjdG9yYC5cbiAgICpcbiAgICogICAgIHZhciBUZWEgPSBmdW5jdGlvbiAobmFtZSkgeyB0aGlzLm5hbWUgPSBuYW1lOyB9XG4gICAqICAgICAgICwgY2hhaSA9IG5ldyBUZWEoJ2NoYWknKTtcbiAgICpcbiAgICogICAgIGFzc2VydC5pbnN0YW5jZU9mKGNoYWksIFRlYSwgJ2NoYWkgaXMgYW4gaW5zdGFuY2Ugb2YgdGVhJyk7XG4gICAqXG4gICAqIEBuYW1lIGluc3RhbmNlT2ZcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICAgKiBAcGFyYW0ge0NvbnN0cnVjdG9yfSBjb25zdHJ1Y3RvclxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuaW5zdGFuY2VPZiA9IGZ1bmN0aW9uICh2YWwsIHR5cGUsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24odmFsLCBtc2cpLnRvLmJlLmluc3RhbmNlT2YodHlwZSk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAubm90SW5zdGFuY2VPZihvYmplY3QsIGNvbnN0cnVjdG9yLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgYHZhbHVlYCBpcyBub3QgYW4gaW5zdGFuY2Ugb2YgYGNvbnN0cnVjdG9yYC5cbiAgICpcbiAgICogICAgIHZhciBUZWEgPSBmdW5jdGlvbiAobmFtZSkgeyB0aGlzLm5hbWUgPSBuYW1lOyB9XG4gICAqICAgICAgICwgY2hhaSA9IG5ldyBTdHJpbmcoJ2NoYWknKTtcbiAgICpcbiAgICogICAgIGFzc2VydC5ub3RJbnN0YW5jZU9mKGNoYWksIFRlYSwgJ2NoYWkgaXMgbm90IGFuIGluc3RhbmNlIG9mIHRlYScpO1xuICAgKlxuICAgKiBAbmFtZSBub3RJbnN0YW5jZU9mXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3RcbiAgICogQHBhcmFtIHtDb25zdHJ1Y3Rvcn0gY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0Lm5vdEluc3RhbmNlT2YgPSBmdW5jdGlvbiAodmFsLCB0eXBlLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5ub3QuYmUuaW5zdGFuY2VPZih0eXBlKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5pbmNsdWRlKGhheXN0YWNrLCBuZWVkbGUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBoYXlzdGFja2AgaW5jbHVkZXMgYG5lZWRsZWAuIFdvcmtzXG4gICAqIGZvciBzdHJpbmdzIGFuZCBhcnJheXMuXG4gICAqXG4gICAqICAgICBhc3NlcnQuaW5jbHVkZSgnZm9vYmFyJywgJ2JhcicsICdmb29iYXIgY29udGFpbnMgc3RyaW5nIFwiYmFyXCInKTtcbiAgICogICAgIGFzc2VydC5pbmNsdWRlKFsgMSwgMiwgMyBdLCAzLCAnYXJyYXkgY29udGFpbnMgdmFsdWUnKTtcbiAgICpcbiAgICogQG5hbWUgaW5jbHVkZVxuICAgKiBAcGFyYW0ge0FycmF5fFN0cmluZ30gaGF5c3RhY2tcbiAgICogQHBhcmFtIHtNaXhlZH0gbmVlZGxlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5pbmNsdWRlID0gZnVuY3Rpb24gKGV4cCwgaW5jLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKGV4cCwgbXNnLCBhc3NlcnQuaW5jbHVkZSkuaW5jbHVkZShpbmMpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLm5vdEluY2x1ZGUoaGF5c3RhY2ssIG5lZWRsZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYGhheXN0YWNrYCBkb2VzIG5vdCBpbmNsdWRlIGBuZWVkbGVgLiBXb3Jrc1xuICAgKiBmb3Igc3RyaW5ncyBhbmQgYXJyYXlzLlxuICAgKmlcbiAgICogICAgIGFzc2VydC5ub3RJbmNsdWRlKCdmb29iYXInLCAnYmF6JywgJ3N0cmluZyBub3QgaW5jbHVkZSBzdWJzdHJpbmcnKTtcbiAgICogICAgIGFzc2VydC5ub3RJbmNsdWRlKFsgMSwgMiwgMyBdLCA0LCAnYXJyYXkgbm90IGluY2x1ZGUgY29udGFpbiB2YWx1ZScpO1xuICAgKlxuICAgKiBAbmFtZSBub3RJbmNsdWRlXG4gICAqIEBwYXJhbSB7QXJyYXl8U3RyaW5nfSBoYXlzdGFja1xuICAgKiBAcGFyYW0ge01peGVkfSBuZWVkbGVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0Lm5vdEluY2x1ZGUgPSBmdW5jdGlvbiAoZXhwLCBpbmMsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24oZXhwLCBtc2csIGFzc2VydC5ub3RJbmNsdWRlKS5ub3QuaW5jbHVkZShpbmMpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLm1hdGNoKHZhbHVlLCByZWdleHAsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGB2YWx1ZWAgbWF0Y2hlcyB0aGUgcmVndWxhciBleHByZXNzaW9uIGByZWdleHBgLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0Lm1hdGNoKCdmb29iYXInLCAvXmZvby8sICdyZWdleHAgbWF0Y2hlcycpO1xuICAgKlxuICAgKiBAbmFtZSBtYXRjaFxuICAgKiBAcGFyYW0ge01peGVkfSB2YWx1ZVxuICAgKiBAcGFyYW0ge1JlZ0V4cH0gcmVnZXhwXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5tYXRjaCA9IGZ1bmN0aW9uIChleHAsIHJlLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKGV4cCwgbXNnKS50by5tYXRjaChyZSk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAubm90TWF0Y2godmFsdWUsIHJlZ2V4cCwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYHZhbHVlYCBkb2VzIG5vdCBtYXRjaCB0aGUgcmVndWxhciBleHByZXNzaW9uIGByZWdleHBgLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0Lm5vdE1hdGNoKCdmb29iYXInLCAvXmZvby8sICdyZWdleHAgZG9lcyBub3QgbWF0Y2gnKTtcbiAgICpcbiAgICogQG5hbWUgbm90TWF0Y2hcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtSZWdFeHB9IHJlZ2V4cFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQubm90TWF0Y2ggPSBmdW5jdGlvbiAoZXhwLCByZSwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbihleHAsIG1zZykudG8ubm90Lm1hdGNoKHJlKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5wcm9wZXJ0eShvYmplY3QsIHByb3BlcnR5LCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgb2JqZWN0YCBoYXMgYSBwcm9wZXJ0eSBuYW1lZCBieSBgcHJvcGVydHlgLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LnByb3BlcnR5KHsgdGVhOiB7IGdyZWVuOiAnbWF0Y2hhJyB9fSwgJ3RlYScpO1xuICAgKlxuICAgKiBAbmFtZSBwcm9wZXJ0eVxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwcm9wZXJ0eVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQucHJvcGVydHkgPSBmdW5jdGlvbiAob2JqLCBwcm9wLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKG9iaiwgbXNnKS50by5oYXZlLnByb3BlcnR5KHByb3ApO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLm5vdFByb3BlcnR5KG9iamVjdCwgcHJvcGVydHksIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBvYmplY3RgIGRvZXMgX25vdF8gaGF2ZSBhIHByb3BlcnR5IG5hbWVkIGJ5IGBwcm9wZXJ0eWAuXG4gICAqXG4gICAqICAgICBhc3NlcnQubm90UHJvcGVydHkoeyB0ZWE6IHsgZ3JlZW46ICdtYXRjaGEnIH19LCAnY29mZmVlJyk7XG4gICAqXG4gICAqIEBuYW1lIG5vdFByb3BlcnR5XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3RcbiAgICogQHBhcmFtIHtTdHJpbmd9IHByb3BlcnR5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5ub3RQcm9wZXJ0eSA9IGZ1bmN0aW9uIChvYmosIHByb3AsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24ob2JqLCBtc2cpLnRvLm5vdC5oYXZlLnByb3BlcnR5KHByb3ApO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmRlZXBQcm9wZXJ0eShvYmplY3QsIHByb3BlcnR5LCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgb2JqZWN0YCBoYXMgYSBwcm9wZXJ0eSBuYW1lZCBieSBgcHJvcGVydHlgLCB3aGljaCBjYW4gYmUgYVxuICAgKiBzdHJpbmcgdXNpbmcgZG90LSBhbmQgYnJhY2tldC1ub3RhdGlvbiBmb3IgZGVlcCByZWZlcmVuY2UuXG4gICAqXG4gICAqICAgICBhc3NlcnQuZGVlcFByb3BlcnR5KHsgdGVhOiB7IGdyZWVuOiAnbWF0Y2hhJyB9fSwgJ3RlYS5ncmVlbicpO1xuICAgKlxuICAgKiBAbmFtZSBkZWVwUHJvcGVydHlcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICAgKiBAcGFyYW0ge1N0cmluZ30gcHJvcGVydHlcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmRlZXBQcm9wZXJ0eSA9IGZ1bmN0aW9uIChvYmosIHByb3AsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24ob2JqLCBtc2cpLnRvLmhhdmUuZGVlcC5wcm9wZXJ0eShwcm9wKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5ub3REZWVwUHJvcGVydHkob2JqZWN0LCBwcm9wZXJ0eSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYG9iamVjdGAgZG9lcyBfbm90XyBoYXZlIGEgcHJvcGVydHkgbmFtZWQgYnkgYHByb3BlcnR5YCwgd2hpY2hcbiAgICogY2FuIGJlIGEgc3RyaW5nIHVzaW5nIGRvdC0gYW5kIGJyYWNrZXQtbm90YXRpb24gZm9yIGRlZXAgcmVmZXJlbmNlLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0Lm5vdERlZXBQcm9wZXJ0eSh7IHRlYTogeyBncmVlbjogJ21hdGNoYScgfX0sICd0ZWEub29sb25nJyk7XG4gICAqXG4gICAqIEBuYW1lIG5vdERlZXBQcm9wZXJ0eVxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwcm9wZXJ0eVxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQubm90RGVlcFByb3BlcnR5ID0gZnVuY3Rpb24gKG9iaiwgcHJvcCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykudG8ubm90LmhhdmUuZGVlcC5wcm9wZXJ0eShwcm9wKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5wcm9wZXJ0eVZhbChvYmplY3QsIHByb3BlcnR5LCB2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYG9iamVjdGAgaGFzIGEgcHJvcGVydHkgbmFtZWQgYnkgYHByb3BlcnR5YCB3aXRoIHZhbHVlIGdpdmVuXG4gICAqIGJ5IGB2YWx1ZWAuXG4gICAqXG4gICAqICAgICBhc3NlcnQucHJvcGVydHlWYWwoeyB0ZWE6ICdpcyBnb29kJyB9LCAndGVhJywgJ2lzIGdvb2QnKTtcbiAgICpcbiAgICogQG5hbWUgcHJvcGVydHlWYWxcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICAgKiBAcGFyYW0ge1N0cmluZ30gcHJvcGVydHlcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LnByb3BlcnR5VmFsID0gZnVuY3Rpb24gKG9iaiwgcHJvcCwgdmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKG9iaiwgbXNnKS50by5oYXZlLnByb3BlcnR5KHByb3AsIHZhbCk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAucHJvcGVydHlOb3RWYWwob2JqZWN0LCBwcm9wZXJ0eSwgdmFsdWUsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBvYmplY3RgIGhhcyBhIHByb3BlcnR5IG5hbWVkIGJ5IGBwcm9wZXJ0eWAsIGJ1dCB3aXRoIGEgdmFsdWVcbiAgICogZGlmZmVyZW50IGZyb20gdGhhdCBnaXZlbiBieSBgdmFsdWVgLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LnByb3BlcnR5Tm90VmFsKHsgdGVhOiAnaXMgZ29vZCcgfSwgJ3RlYScsICdpcyBiYWQnKTtcbiAgICpcbiAgICogQG5hbWUgcHJvcGVydHlOb3RWYWxcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICAgKiBAcGFyYW0ge1N0cmluZ30gcHJvcGVydHlcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LnByb3BlcnR5Tm90VmFsID0gZnVuY3Rpb24gKG9iaiwgcHJvcCwgdmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKG9iaiwgbXNnKS50by5ub3QuaGF2ZS5wcm9wZXJ0eShwcm9wLCB2YWwpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmRlZXBQcm9wZXJ0eVZhbChvYmplY3QsIHByb3BlcnR5LCB2YWx1ZSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgYG9iamVjdGAgaGFzIGEgcHJvcGVydHkgbmFtZWQgYnkgYHByb3BlcnR5YCB3aXRoIHZhbHVlIGdpdmVuXG4gICAqIGJ5IGB2YWx1ZWAuIGBwcm9wZXJ0eWAgY2FuIHVzZSBkb3QtIGFuZCBicmFja2V0LW5vdGF0aW9uIGZvciBkZWVwXG4gICAqIHJlZmVyZW5jZS5cbiAgICpcbiAgICogICAgIGFzc2VydC5kZWVwUHJvcGVydHlWYWwoeyB0ZWE6IHsgZ3JlZW46ICdtYXRjaGEnIH19LCAndGVhLmdyZWVuJywgJ21hdGNoYScpO1xuICAgKlxuICAgKiBAbmFtZSBkZWVwUHJvcGVydHlWYWxcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICAgKiBAcGFyYW0ge1N0cmluZ30gcHJvcGVydHlcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmRlZXBQcm9wZXJ0eVZhbCA9IGZ1bmN0aW9uIChvYmosIHByb3AsIHZhbCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykudG8uaGF2ZS5kZWVwLnByb3BlcnR5KHByb3AsIHZhbCk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuZGVlcFByb3BlcnR5Tm90VmFsKG9iamVjdCwgcHJvcGVydHksIHZhbHVlLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgb2JqZWN0YCBoYXMgYSBwcm9wZXJ0eSBuYW1lZCBieSBgcHJvcGVydHlgLCBidXQgd2l0aCBhIHZhbHVlXG4gICAqIGRpZmZlcmVudCBmcm9tIHRoYXQgZ2l2ZW4gYnkgYHZhbHVlYC4gYHByb3BlcnR5YCBjYW4gdXNlIGRvdC0gYW5kXG4gICAqIGJyYWNrZXQtbm90YXRpb24gZm9yIGRlZXAgcmVmZXJlbmNlLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LmRlZXBQcm9wZXJ0eU5vdFZhbCh7IHRlYTogeyBncmVlbjogJ21hdGNoYScgfX0sICd0ZWEuZ3JlZW4nLCAna29uYWNoYScpO1xuICAgKlxuICAgKiBAbmFtZSBkZWVwUHJvcGVydHlOb3RWYWxcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICAgKiBAcGFyYW0ge1N0cmluZ30gcHJvcGVydHlcbiAgICogQHBhcmFtIHtNaXhlZH0gdmFsdWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmRlZXBQcm9wZXJ0eU5vdFZhbCA9IGZ1bmN0aW9uIChvYmosIHByb3AsIHZhbCwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbihvYmosIG1zZykudG8ubm90LmhhdmUuZGVlcC5wcm9wZXJ0eShwcm9wLCB2YWwpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLmxlbmd0aE9mKG9iamVjdCwgbGVuZ3RoLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgb2JqZWN0YCBoYXMgYSBgbGVuZ3RoYCBwcm9wZXJ0eSB3aXRoIHRoZSBleHBlY3RlZCB2YWx1ZS5cbiAgICpcbiAgICogICAgIGFzc2VydC5sZW5ndGhPZihbMSwyLDNdLCAzLCAnYXJyYXkgaGFzIGxlbmd0aCBvZiAzJyk7XG4gICAqICAgICBhc3NlcnQubGVuZ3RoT2YoJ2Zvb2JhcicsIDUsICdzdHJpbmcgaGFzIGxlbmd0aCBvZiA2Jyk7XG4gICAqXG4gICAqIEBuYW1lIGxlbmd0aE9mXG4gICAqIEBwYXJhbSB7TWl4ZWR9IG9iamVjdFxuICAgKiBAcGFyYW0ge051bWJlcn0gbGVuZ3RoXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5sZW5ndGhPZiA9IGZ1bmN0aW9uIChleHAsIGxlbiwgbXNnKSB7XG4gICAgbmV3IEFzc2VydGlvbihleHAsIG1zZykudG8uaGF2ZS5sZW5ndGgobGVuKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC50aHJvd3MoZnVuY3Rpb24sIFtjb25zdHJ1Y3Rvci9zdHJpbmcvcmVnZXhwXSwgW3N0cmluZy9yZWdleHBdLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgZnVuY3Rpb25gIHdpbGwgdGhyb3cgYW4gZXJyb3IgdGhhdCBpcyBhbiBpbnN0YW5jZSBvZlxuICAgKiBgY29uc3RydWN0b3JgLCBvciBhbHRlcm5hdGVseSB0aGF0IGl0IHdpbGwgdGhyb3cgYW4gZXJyb3Igd2l0aCBtZXNzYWdlXG4gICAqIG1hdGNoaW5nIGByZWdleHBgLlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LnRocm93KGZuLCAnZnVuY3Rpb24gdGhyb3dzIGEgcmVmZXJlbmNlIGVycm9yJyk7XG4gICAqICAgICBhc3NlcnQudGhyb3coZm4sIC9mdW5jdGlvbiB0aHJvd3MgYSByZWZlcmVuY2UgZXJyb3IvKTtcbiAgICogICAgIGFzc2VydC50aHJvdyhmbiwgUmVmZXJlbmNlRXJyb3IpO1xuICAgKiAgICAgYXNzZXJ0LnRocm93KGZuLCBSZWZlcmVuY2VFcnJvciwgJ2Z1bmN0aW9uIHRocm93cyBhIHJlZmVyZW5jZSBlcnJvcicpO1xuICAgKiAgICAgYXNzZXJ0LnRocm93KGZuLCBSZWZlcmVuY2VFcnJvciwgL2Z1bmN0aW9uIHRocm93cyBhIHJlZmVyZW5jZSBlcnJvci8pO1xuICAgKlxuICAgKiBAbmFtZSB0aHJvd3NcbiAgICogQGFsaWFzIHRocm93XG4gICAqIEBhbGlhcyBUaHJvd1xuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jdGlvblxuICAgKiBAcGFyYW0ge0Vycm9yQ29uc3RydWN0b3J9IGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7UmVnRXhwfSByZWdleHBcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQHNlZSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9FcnJvciNFcnJvcl90eXBlc1xuICAgKiBAYXBpIHB1YmxpY1xuICAgKi9cblxuICBhc3NlcnQuVGhyb3cgPSBmdW5jdGlvbiAoZm4sIGVycnQsIGVycnMsIG1zZykge1xuICAgIGlmICgnc3RyaW5nJyA9PT0gdHlwZW9mIGVycnQgfHwgZXJydCBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgZXJycyA9IGVycnQ7XG4gICAgICBlcnJ0ID0gbnVsbDtcbiAgICB9XG5cbiAgICB2YXIgYXNzZXJ0RXJyID0gbmV3IEFzc2VydGlvbihmbiwgbXNnKS50by5UaHJvdyhlcnJ0LCBlcnJzKTtcbiAgICByZXR1cm4gZmxhZyhhc3NlcnRFcnIsICdvYmplY3QnKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5kb2VzTm90VGhyb3coZnVuY3Rpb24sIFtjb25zdHJ1Y3Rvci9yZWdleHBdLCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgZnVuY3Rpb25gIHdpbGwgX25vdF8gdGhyb3cgYW4gZXJyb3IgdGhhdCBpcyBhbiBpbnN0YW5jZSBvZlxuICAgKiBgY29uc3RydWN0b3JgLCBvciBhbHRlcm5hdGVseSB0aGF0IGl0IHdpbGwgbm90IHRocm93IGFuIGVycm9yIHdpdGggbWVzc2FnZVxuICAgKiBtYXRjaGluZyBgcmVnZXhwYC5cbiAgICpcbiAgICogICAgIGFzc2VydC5kb2VzTm90VGhyb3coZm4sIEVycm9yLCAnZnVuY3Rpb24gZG9lcyBub3QgdGhyb3cnKTtcbiAgICpcbiAgICogQG5hbWUgZG9lc05vdFRocm93XG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmN0aW9uXG4gICAqIEBwYXJhbSB7RXJyb3JDb25zdHJ1Y3Rvcn0gY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtSZWdFeHB9IHJlZ2V4cFxuICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZVxuICAgKiBAc2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL0Vycm9yI0Vycm9yX3R5cGVzXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5kb2VzTm90VGhyb3cgPSBmdW5jdGlvbiAoZm4sIHR5cGUsIG1zZykge1xuICAgIGlmICgnc3RyaW5nJyA9PT0gdHlwZW9mIHR5cGUpIHtcbiAgICAgIG1zZyA9IHR5cGU7XG4gICAgICB0eXBlID0gbnVsbDtcbiAgICB9XG5cbiAgICBuZXcgQXNzZXJ0aW9uKGZuLCBtc2cpLnRvLm5vdC5UaHJvdyh0eXBlKTtcbiAgfTtcblxuICAvKipcbiAgICogIyMjIC5vcGVyYXRvcih2YWwxLCBvcGVyYXRvciwgdmFsMiwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBDb21wYXJlcyB0d28gdmFsdWVzIHVzaW5nIGBvcGVyYXRvcmAuXG4gICAqXG4gICAqICAgICBhc3NlcnQub3BlcmF0b3IoMSwgJzwnLCAyLCAnZXZlcnl0aGluZyBpcyBvaycpO1xuICAgKiAgICAgYXNzZXJ0Lm9wZXJhdG9yKDEsICc+JywgMiwgJ3RoaXMgd2lsbCBmYWlsJyk7XG4gICAqXG4gICAqIEBuYW1lIG9wZXJhdG9yXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbDFcbiAgICogQHBhcmFtIHtTdHJpbmd9IG9wZXJhdG9yXG4gICAqIEBwYXJhbSB7TWl4ZWR9IHZhbDJcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0Lm9wZXJhdG9yID0gZnVuY3Rpb24gKHZhbCwgb3BlcmF0b3IsIHZhbDIsIG1zZykge1xuICAgIGlmICghflsnPT0nLCAnPT09JywgJz4nLCAnPj0nLCAnPCcsICc8PScsICchPScsICchPT0nXS5pbmRleE9mKG9wZXJhdG9yKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIG9wZXJhdG9yIFwiJyArIG9wZXJhdG9yICsgJ1wiJyk7XG4gICAgfVxuICAgIHZhciB0ZXN0ID0gbmV3IEFzc2VydGlvbihldmFsKHZhbCArIG9wZXJhdG9yICsgdmFsMiksIG1zZyk7XG4gICAgdGVzdC5hc3NlcnQoXG4gICAgICAgIHRydWUgPT09IGZsYWcodGVzdCwgJ29iamVjdCcpXG4gICAgICAsICdleHBlY3RlZCAnICsgdXRpbC5pbnNwZWN0KHZhbCkgKyAnIHRvIGJlICcgKyBvcGVyYXRvciArICcgJyArIHV0aWwuaW5zcGVjdCh2YWwyKVxuICAgICAgLCAnZXhwZWN0ZWQgJyArIHV0aWwuaW5zcGVjdCh2YWwpICsgJyB0byBub3QgYmUgJyArIG9wZXJhdG9yICsgJyAnICsgdXRpbC5pbnNwZWN0KHZhbDIpICk7XG4gIH07XG5cbiAgLyoqXG4gICAqICMjIyAuY2xvc2VUbyhhY3R1YWwsIGV4cGVjdGVkLCBkZWx0YSwgW21lc3NhZ2VdKVxuICAgKlxuICAgKiBBc3NlcnRzIHRoYXQgdGhlIHRhcmdldCBpcyBlcXVhbCBgZXhwZWN0ZWRgLCB0byB3aXRoaW4gYSArLy0gYGRlbHRhYCByYW5nZS5cbiAgICpcbiAgICogICAgIGFzc2VydC5jbG9zZVRvKDEuNSwgMSwgMC41LCAnbnVtYmVycyBhcmUgY2xvc2UnKTtcbiAgICpcbiAgICogQG5hbWUgY2xvc2VUb1xuICAgKiBAcGFyYW0ge051bWJlcn0gYWN0dWFsXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBleHBlY3RlZFxuICAgKiBAcGFyYW0ge051bWJlcn0gZGVsdGFcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmNsb3NlVG8gPSBmdW5jdGlvbiAoYWN0LCBleHAsIGRlbHRhLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKGFjdCwgbXNnKS50by5iZS5jbG9zZVRvKGV4cCwgZGVsdGEpO1xuICB9O1xuXG4gIC8qKlxuICAgKiAjIyMgLnNhbWVNZW1iZXJzKHNldDEsIHNldDIsIFttZXNzYWdlXSlcbiAgICpcbiAgICogQXNzZXJ0cyB0aGF0IGBzZXQxYCBhbmQgYHNldDJgIGhhdmUgdGhlIHNhbWUgbWVtYmVycy5cbiAgICogT3JkZXIgaXMgbm90IHRha2VuIGludG8gYWNjb3VudC5cbiAgICpcbiAgICogICAgIGFzc2VydC5zYW1lTWVtYmVycyhbIDEsIDIsIDMgXSwgWyAyLCAxLCAzIF0sICdzYW1lIG1lbWJlcnMnKTtcbiAgICpcbiAgICogQG5hbWUgc2FtZU1lbWJlcnNcbiAgICogQHBhcmFtIHtBcnJheX0gc3VwZXJzZXRcbiAgICogQHBhcmFtIHtBcnJheX0gc3Vic2V0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlXG4gICAqIEBhcGkgcHVibGljXG4gICAqL1xuXG4gIGFzc2VydC5zYW1lTWVtYmVycyA9IGZ1bmN0aW9uIChzZXQxLCBzZXQyLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHNldDEsIG1zZykudG8uaGF2ZS5zYW1lLm1lbWJlcnMoc2V0Mik7XG4gIH1cblxuICAvKipcbiAgICogIyMjIC5pbmNsdWRlTWVtYmVycyhzdXBlcnNldCwgc3Vic2V0LCBbbWVzc2FnZV0pXG4gICAqXG4gICAqIEFzc2VydHMgdGhhdCBgc3Vic2V0YCBpcyBpbmNsdWRlZCBpbiBgc3VwZXJzZXRgLlxuICAgKiBPcmRlciBpcyBub3QgdGFrZW4gaW50byBhY2NvdW50LlxuICAgKlxuICAgKiAgICAgYXNzZXJ0LmluY2x1ZGVNZW1iZXJzKFsgMSwgMiwgMyBdLCBbIDIsIDEgXSwgJ2luY2x1ZGUgbWVtYmVycycpO1xuICAgKlxuICAgKiBAbmFtZSBpbmNsdWRlTWVtYmVyc1xuICAgKiBAcGFyYW0ge0FycmF5fSBzdXBlcnNldFxuICAgKiBAcGFyYW0ge0FycmF5fSBzdWJzZXRcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2VcbiAgICogQGFwaSBwdWJsaWNcbiAgICovXG5cbiAgYXNzZXJ0LmluY2x1ZGVNZW1iZXJzID0gZnVuY3Rpb24gKHN1cGVyc2V0LCBzdWJzZXQsIG1zZykge1xuICAgIG5ldyBBc3NlcnRpb24oc3VwZXJzZXQsIG1zZykudG8uaW5jbHVkZS5tZW1iZXJzKHN1YnNldCk7XG4gIH1cblxuICAvKiFcbiAgICogVW5kb2N1bWVudGVkIC8gdW50ZXN0ZWRcbiAgICovXG5cbiAgYXNzZXJ0LmlmRXJyb3IgPSBmdW5jdGlvbiAodmFsLCBtc2cpIHtcbiAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5ub3QuYmUub2s7XG4gIH07XG5cbiAgLyohXG4gICAqIEFsaWFzZXMuXG4gICAqL1xuXG4gIChmdW5jdGlvbiBhbGlhcyhuYW1lLCBhcyl7XG4gICAgYXNzZXJ0W2FzXSA9IGFzc2VydFtuYW1lXTtcbiAgICByZXR1cm4gYWxpYXM7XG4gIH0pXG4gICgnVGhyb3cnLCAndGhyb3cnKVxuICAoJ1Rocm93JywgJ3Rocm93cycpO1xufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS9pbnRlcmZhY2UvZXhwZWN0LmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIGNoYWlcbiAqIENvcHlyaWdodChjKSAyMDExLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjaGFpLCB1dGlsKSB7XG4gIGNoYWkuZXhwZWN0ID0gZnVuY3Rpb24gKHZhbCwgbWVzc2FnZSkge1xuICAgIHJldHVybiBuZXcgY2hhaS5Bc3NlcnRpb24odmFsLCBtZXNzYWdlKTtcbiAgfTtcbn07XG5cblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS9pbnRlcmZhY2Uvc2hvdWxkLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIGNoYWlcbiAqIENvcHlyaWdodChjKSAyMDExLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjaGFpLCB1dGlsKSB7XG4gIHZhciBBc3NlcnRpb24gPSBjaGFpLkFzc2VydGlvbjtcblxuICBmdW5jdGlvbiBsb2FkU2hvdWxkICgpIHtcbiAgICAvLyBleHBsaWNpdGx5IGRlZmluZSB0aGlzIG1ldGhvZCBhcyBmdW5jdGlvbiBhcyB0byBoYXZlIGl0J3MgbmFtZSB0byBpbmNsdWRlIGFzIGBzc2ZpYFxuICAgIGZ1bmN0aW9uIHNob3VsZEdldHRlcigpIHtcbiAgICAgIGlmICh0aGlzIGluc3RhbmNlb2YgU3RyaW5nIHx8IHRoaXMgaW5zdGFuY2VvZiBOdW1iZXIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBBc3NlcnRpb24odGhpcy5jb25zdHJ1Y3Rvcih0aGlzKSwgbnVsbCwgc2hvdWxkR2V0dGVyKTtcbiAgICAgIH0gZWxzZSBpZiAodGhpcyBpbnN0YW5jZW9mIEJvb2xlYW4pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBBc3NlcnRpb24odGhpcyA9PSB0cnVlLCBudWxsLCBzaG91bGRHZXR0ZXIpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG5ldyBBc3NlcnRpb24odGhpcywgbnVsbCwgc2hvdWxkR2V0dGVyKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gc2hvdWxkU2V0dGVyKHZhbHVlKSB7XG4gICAgICAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2NoYWlqcy9jaGFpL2lzc3Vlcy84NjogdGhpcyBtYWtlc1xuICAgICAgLy8gYHdoYXRldmVyLnNob3VsZCA9IHNvbWVWYWx1ZWAgYWN0dWFsbHkgc2V0IGBzb21lVmFsdWVgLCB3aGljaCBpc1xuICAgICAgLy8gZXNwZWNpYWxseSB1c2VmdWwgZm9yIGBnbG9iYWwuc2hvdWxkID0gcmVxdWlyZSgnY2hhaScpLnNob3VsZCgpYC5cbiAgICAgIC8vXG4gICAgICAvLyBOb3RlIHRoYXQgd2UgaGF2ZSB0byB1c2UgW1tEZWZpbmVQcm9wZXJ0eV1dIGluc3RlYWQgb2YgW1tQdXRdXVxuICAgICAgLy8gc2luY2Ugb3RoZXJ3aXNlIHdlIHdvdWxkIHRyaWdnZXIgdGhpcyB2ZXJ5IHNldHRlciFcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAnc2hvdWxkJywge1xuICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgICAgd3JpdGFibGU6IHRydWVcbiAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBtb2RpZnkgT2JqZWN0LnByb3RvdHlwZSB0byBoYXZlIGBzaG91bGRgXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KE9iamVjdC5wcm90b3R5cGUsICdzaG91bGQnLCB7XG4gICAgICBzZXQ6IHNob3VsZFNldHRlclxuICAgICAgLCBnZXQ6IHNob3VsZEdldHRlclxuICAgICAgLCBjb25maWd1cmFibGU6IHRydWVcbiAgICB9KTtcblxuICAgIHZhciBzaG91bGQgPSB7fTtcblxuICAgIHNob3VsZC5lcXVhbCA9IGZ1bmN0aW9uICh2YWwxLCB2YWwyLCBtc2cpIHtcbiAgICAgIG5ldyBBc3NlcnRpb24odmFsMSwgbXNnKS50by5lcXVhbCh2YWwyKTtcbiAgICB9O1xuXG4gICAgc2hvdWxkLlRocm93ID0gZnVuY3Rpb24gKGZuLCBlcnJ0LCBlcnJzLCBtc2cpIHtcbiAgICAgIG5ldyBBc3NlcnRpb24oZm4sIG1zZykudG8uVGhyb3coZXJydCwgZXJycyk7XG4gICAgfTtcblxuICAgIHNob3VsZC5leGlzdCA9IGZ1bmN0aW9uICh2YWwsIG1zZykge1xuICAgICAgbmV3IEFzc2VydGlvbih2YWwsIG1zZykudG8uZXhpc3Q7XG4gICAgfVxuXG4gICAgLy8gbmVnYXRpb25cbiAgICBzaG91bGQubm90ID0ge31cblxuICAgIHNob3VsZC5ub3QuZXF1YWwgPSBmdW5jdGlvbiAodmFsMSwgdmFsMiwgbXNnKSB7XG4gICAgICBuZXcgQXNzZXJ0aW9uKHZhbDEsIG1zZykudG8ubm90LmVxdWFsKHZhbDIpO1xuICAgIH07XG5cbiAgICBzaG91bGQubm90LlRocm93ID0gZnVuY3Rpb24gKGZuLCBlcnJ0LCBlcnJzLCBtc2cpIHtcbiAgICAgIG5ldyBBc3NlcnRpb24oZm4sIG1zZykudG8ubm90LlRocm93KGVycnQsIGVycnMpO1xuICAgIH07XG5cbiAgICBzaG91bGQubm90LmV4aXN0ID0gZnVuY3Rpb24gKHZhbCwgbXNnKSB7XG4gICAgICBuZXcgQXNzZXJ0aW9uKHZhbCwgbXNnKS50by5ub3QuZXhpc3Q7XG4gICAgfVxuXG4gICAgc2hvdWxkWyd0aHJvdyddID0gc2hvdWxkWydUaHJvdyddO1xuICAgIHNob3VsZC5ub3RbJ3Rocm93J10gPSBzaG91bGQubm90WydUaHJvdyddO1xuXG4gICAgcmV0dXJuIHNob3VsZDtcbiAgfTtcblxuICBjaGFpLnNob3VsZCA9IGxvYWRTaG91bGQ7XG4gIGNoYWkuU2hvdWxkID0gbG9hZFNob3VsZDtcbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvdXRpbHMvYWRkQ2hhaW5hYmxlTWV0aG9kLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIENoYWkgLSBhZGRDaGFpbmluZ01ldGhvZCB1dGlsaXR5XG4gKiBDb3B5cmlnaHQoYykgMjAxMi0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyohXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cblxudmFyIHRyYW5zZmVyRmxhZ3MgPSByZXF1aXJlKCcuL3RyYW5zZmVyRmxhZ3MnKTtcbnZhciBmbGFnID0gcmVxdWlyZSgnLi9mbGFnJyk7XG52YXIgY29uZmlnID0gcmVxdWlyZSgnLi4vY29uZmlnJyk7XG5cbi8qIVxuICogTW9kdWxlIHZhcmlhYmxlc1xuICovXG5cbi8vIENoZWNrIHdoZXRoZXIgYF9fcHJvdG9fX2AgaXMgc3VwcG9ydGVkXG52YXIgaGFzUHJvdG9TdXBwb3J0ID0gJ19fcHJvdG9fXycgaW4gT2JqZWN0O1xuXG4vLyBXaXRob3V0IGBfX3Byb3RvX19gIHN1cHBvcnQsIHRoaXMgbW9kdWxlIHdpbGwgbmVlZCB0byBhZGQgcHJvcGVydGllcyB0byBhIGZ1bmN0aW9uLlxuLy8gSG93ZXZlciwgc29tZSBGdW5jdGlvbi5wcm90b3R5cGUgbWV0aG9kcyBjYW5ub3QgYmUgb3ZlcndyaXR0ZW4sXG4vLyBhbmQgdGhlcmUgc2VlbXMgbm8gZWFzeSBjcm9zcy1wbGF0Zm9ybSB3YXkgdG8gZGV0ZWN0IHRoZW0gKEBzZWUgY2hhaWpzL2NoYWkvaXNzdWVzLzY5KS5cbnZhciBleGNsdWRlTmFtZXMgPSAvXig/Omxlbmd0aHxuYW1lfGFyZ3VtZW50c3xjYWxsZXIpJC87XG5cbi8vIENhY2hlIGBGdW5jdGlvbmAgcHJvcGVydGllc1xudmFyIGNhbGwgID0gRnVuY3Rpb24ucHJvdG90eXBlLmNhbGwsXG4gICAgYXBwbHkgPSBGdW5jdGlvbi5wcm90b3R5cGUuYXBwbHk7XG5cbi8qKlxuICogIyMjIGFkZENoYWluYWJsZU1ldGhvZCAoY3R4LCBuYW1lLCBtZXRob2QsIGNoYWluaW5nQmVoYXZpb3IpXG4gKlxuICogQWRkcyBhIG1ldGhvZCB0byBhbiBvYmplY3QsIHN1Y2ggdGhhdCB0aGUgbWV0aG9kIGNhbiBhbHNvIGJlIGNoYWluZWQuXG4gKlxuICogICAgIHV0aWxzLmFkZENoYWluYWJsZU1ldGhvZChjaGFpLkFzc2VydGlvbi5wcm90b3R5cGUsICdmb28nLCBmdW5jdGlvbiAoc3RyKSB7XG4gKiAgICAgICB2YXIgb2JqID0gdXRpbHMuZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG4gKiAgICAgICBuZXcgY2hhaS5Bc3NlcnRpb24ob2JqKS50by5iZS5lcXVhbChzdHIpO1xuICogICAgIH0pO1xuICpcbiAqIENhbiBhbHNvIGJlIGFjY2Vzc2VkIGRpcmVjdGx5IGZyb20gYGNoYWkuQXNzZXJ0aW9uYC5cbiAqXG4gKiAgICAgY2hhaS5Bc3NlcnRpb24uYWRkQ2hhaW5hYmxlTWV0aG9kKCdmb28nLCBmbiwgY2hhaW5pbmdCZWhhdmlvcik7XG4gKlxuICogVGhlIHJlc3VsdCBjYW4gdGhlbiBiZSB1c2VkIGFzIGJvdGggYSBtZXRob2QgYXNzZXJ0aW9uLCBleGVjdXRpbmcgYm90aCBgbWV0aG9kYCBhbmRcbiAqIGBjaGFpbmluZ0JlaGF2aW9yYCwgb3IgYXMgYSBsYW5ndWFnZSBjaGFpbiwgd2hpY2ggb25seSBleGVjdXRlcyBgY2hhaW5pbmdCZWhhdmlvcmAuXG4gKlxuICogICAgIGV4cGVjdChmb29TdHIpLnRvLmJlLmZvbygnYmFyJyk7XG4gKiAgICAgZXhwZWN0KGZvb1N0cikudG8uYmUuZm9vLmVxdWFsKCdmb28nKTtcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gY3R4IG9iamVjdCB0byB3aGljaCB0aGUgbWV0aG9kIGlzIGFkZGVkXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBvZiBtZXRob2QgdG8gYWRkXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBtZXRob2QgZnVuY3Rpb24gdG8gYmUgdXNlZCBmb3IgYG5hbWVgLCB3aGVuIGNhbGxlZFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2hhaW5pbmdCZWhhdmlvciBmdW5jdGlvbiB0byBiZSBjYWxsZWQgZXZlcnkgdGltZSB0aGUgcHJvcGVydHkgaXMgYWNjZXNzZWRcbiAqIEBuYW1lIGFkZENoYWluYWJsZU1ldGhvZFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjdHgsIG5hbWUsIG1ldGhvZCwgY2hhaW5pbmdCZWhhdmlvcikge1xuICBpZiAodHlwZW9mIGNoYWluaW5nQmVoYXZpb3IgIT09ICdmdW5jdGlvbicpIHtcbiAgICBjaGFpbmluZ0JlaGF2aW9yID0gZnVuY3Rpb24gKCkgeyB9O1xuICB9XG5cbiAgdmFyIGNoYWluYWJsZUJlaGF2aW9yID0ge1xuICAgICAgbWV0aG9kOiBtZXRob2RcbiAgICAsIGNoYWluaW5nQmVoYXZpb3I6IGNoYWluaW5nQmVoYXZpb3JcbiAgfTtcblxuICAvLyBzYXZlIHRoZSBtZXRob2RzIHNvIHdlIGNhbiBvdmVyd3JpdGUgdGhlbSBsYXRlciwgaWYgd2UgbmVlZCB0by5cbiAgaWYgKCFjdHguX19tZXRob2RzKSB7XG4gICAgY3R4Ll9fbWV0aG9kcyA9IHt9O1xuICB9XG4gIGN0eC5fX21ldGhvZHNbbmFtZV0gPSBjaGFpbmFibGVCZWhhdmlvcjtcblxuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoY3R4LCBuYW1lLFxuICAgIHsgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNoYWluYWJsZUJlaGF2aW9yLmNoYWluaW5nQmVoYXZpb3IuY2FsbCh0aGlzKTtcblxuICAgICAgICB2YXIgYXNzZXJ0ID0gZnVuY3Rpb24gYXNzZXJ0KCkge1xuICAgICAgICAgIHZhciBvbGRfc3NmaSA9IGZsYWcodGhpcywgJ3NzZmknKTtcbiAgICAgICAgICBpZiAob2xkX3NzZmkgJiYgY29uZmlnLmluY2x1ZGVTdGFjayA9PT0gZmFsc2UpXG4gICAgICAgICAgICBmbGFnKHRoaXMsICdzc2ZpJywgYXNzZXJ0KTtcbiAgICAgICAgICB2YXIgcmVzdWx0ID0gY2hhaW5hYmxlQmVoYXZpb3IubWV0aG9kLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdCA9PT0gdW5kZWZpbmVkID8gdGhpcyA6IHJlc3VsdDtcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBVc2UgYF9fcHJvdG9fX2AgaWYgYXZhaWxhYmxlXG4gICAgICAgIGlmIChoYXNQcm90b1N1cHBvcnQpIHtcbiAgICAgICAgICAvLyBJbmhlcml0IGFsbCBwcm9wZXJ0aWVzIGZyb20gdGhlIG9iamVjdCBieSByZXBsYWNpbmcgdGhlIGBGdW5jdGlvbmAgcHJvdG90eXBlXG4gICAgICAgICAgdmFyIHByb3RvdHlwZSA9IGFzc2VydC5fX3Byb3RvX18gPSBPYmplY3QuY3JlYXRlKHRoaXMpO1xuICAgICAgICAgIC8vIFJlc3RvcmUgdGhlIGBjYWxsYCBhbmQgYGFwcGx5YCBtZXRob2RzIGZyb20gYEZ1bmN0aW9uYFxuICAgICAgICAgIHByb3RvdHlwZS5jYWxsID0gY2FsbDtcbiAgICAgICAgICBwcm90b3R5cGUuYXBwbHkgPSBhcHBseTtcbiAgICAgICAgfVxuICAgICAgICAvLyBPdGhlcndpc2UsIHJlZGVmaW5lIGFsbCBwcm9wZXJ0aWVzIChzbG93ISlcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgdmFyIGFzc2VydGVyTmFtZXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhjdHgpO1xuICAgICAgICAgIGFzc2VydGVyTmFtZXMuZm9yRWFjaChmdW5jdGlvbiAoYXNzZXJ0ZXJOYW1lKSB7XG4gICAgICAgICAgICBpZiAoIWV4Y2x1ZGVOYW1lcy50ZXN0KGFzc2VydGVyTmFtZSkpIHtcbiAgICAgICAgICAgICAgdmFyIHBkID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihjdHgsIGFzc2VydGVyTmFtZSk7XG4gICAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShhc3NlcnQsIGFzc2VydGVyTmFtZSwgcGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJhbnNmZXJGbGFncyh0aGlzLCBhc3NlcnQpO1xuICAgICAgICByZXR1cm4gYXNzZXJ0O1xuICAgICAgfVxuICAgICwgY29uZmlndXJhYmxlOiB0cnVlXG4gIH0pO1xufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS91dGlscy9hZGRNZXRob2QuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogQ2hhaSAtIGFkZE1ldGhvZCB1dGlsaXR5XG4gKiBDb3B5cmlnaHQoYykgMjAxMi0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxudmFyIGNvbmZpZyA9IHJlcXVpcmUoJy4uL2NvbmZpZycpO1xuXG4vKipcbiAqICMjIyAuYWRkTWV0aG9kIChjdHgsIG5hbWUsIG1ldGhvZClcbiAqXG4gKiBBZGRzIGEgbWV0aG9kIHRvIHRoZSBwcm90b3R5cGUgb2YgYW4gb2JqZWN0LlxuICpcbiAqICAgICB1dGlscy5hZGRNZXRob2QoY2hhaS5Bc3NlcnRpb24ucHJvdG90eXBlLCAnZm9vJywgZnVuY3Rpb24gKHN0cikge1xuICogICAgICAgdmFyIG9iaiA9IHV0aWxzLmZsYWcodGhpcywgJ29iamVjdCcpO1xuICogICAgICAgbmV3IGNoYWkuQXNzZXJ0aW9uKG9iaikudG8uYmUuZXF1YWwoc3RyKTtcbiAqICAgICB9KTtcbiAqXG4gKiBDYW4gYWxzbyBiZSBhY2Nlc3NlZCBkaXJlY3RseSBmcm9tIGBjaGFpLkFzc2VydGlvbmAuXG4gKlxuICogICAgIGNoYWkuQXNzZXJ0aW9uLmFkZE1ldGhvZCgnZm9vJywgZm4pO1xuICpcbiAqIFRoZW4gY2FuIGJlIHVzZWQgYXMgYW55IG90aGVyIGFzc2VydGlvbi5cbiAqXG4gKiAgICAgZXhwZWN0KGZvb1N0cikudG8uYmUuZm9vKCdiYXInKTtcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gY3R4IG9iamVjdCB0byB3aGljaCB0aGUgbWV0aG9kIGlzIGFkZGVkXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBvZiBtZXRob2QgdG8gYWRkXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBtZXRob2QgZnVuY3Rpb24gdG8gYmUgdXNlZCBmb3IgbmFtZVxuICogQG5hbWUgYWRkTWV0aG9kXG4gKiBAYXBpIHB1YmxpY1xuICovXG52YXIgZmxhZyA9IHJlcXVpcmUoJy4vZmxhZycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjdHgsIG5hbWUsIG1ldGhvZCkge1xuICBjdHhbbmFtZV0gPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG9sZF9zc2ZpID0gZmxhZyh0aGlzLCAnc3NmaScpO1xuICAgIGlmIChvbGRfc3NmaSAmJiBjb25maWcuaW5jbHVkZVN0YWNrID09PSBmYWxzZSlcbiAgICAgIGZsYWcodGhpcywgJ3NzZmknLCBjdHhbbmFtZV0pO1xuICAgIHZhciByZXN1bHQgPSBtZXRob2QuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICByZXR1cm4gcmVzdWx0ID09PSB1bmRlZmluZWQgPyB0aGlzIDogcmVzdWx0O1xuICB9O1xufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS91dGlscy9hZGRQcm9wZXJ0eS5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gYWRkUHJvcGVydHkgdXRpbGl0eVxuICogQ29weXJpZ2h0KGMpIDIwMTItMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogIyMjIGFkZFByb3BlcnR5IChjdHgsIG5hbWUsIGdldHRlcilcbiAqXG4gKiBBZGRzIGEgcHJvcGVydHkgdG8gdGhlIHByb3RvdHlwZSBvZiBhbiBvYmplY3QuXG4gKlxuICogICAgIHV0aWxzLmFkZFByb3BlcnR5KGNoYWkuQXNzZXJ0aW9uLnByb3RvdHlwZSwgJ2ZvbycsIGZ1bmN0aW9uICgpIHtcbiAqICAgICAgIHZhciBvYmogPSB1dGlscy5mbGFnKHRoaXMsICdvYmplY3QnKTtcbiAqICAgICAgIG5ldyBjaGFpLkFzc2VydGlvbihvYmopLnRvLmJlLmluc3RhbmNlb2YoRm9vKTtcbiAqICAgICB9KTtcbiAqXG4gKiBDYW4gYWxzbyBiZSBhY2Nlc3NlZCBkaXJlY3RseSBmcm9tIGBjaGFpLkFzc2VydGlvbmAuXG4gKlxuICogICAgIGNoYWkuQXNzZXJ0aW9uLmFkZFByb3BlcnR5KCdmb28nLCBmbik7XG4gKlxuICogVGhlbiBjYW4gYmUgdXNlZCBhcyBhbnkgb3RoZXIgYXNzZXJ0aW9uLlxuICpcbiAqICAgICBleHBlY3QobXlGb28pLnRvLmJlLmZvbztcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gY3R4IG9iamVjdCB0byB3aGljaCB0aGUgcHJvcGVydHkgaXMgYWRkZWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIG9mIHByb3BlcnR5IHRvIGFkZFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZ2V0dGVyIGZ1bmN0aW9uIHRvIGJlIHVzZWQgZm9yIG5hbWVcbiAqIEBuYW1lIGFkZFByb3BlcnR5XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGN0eCwgbmFtZSwgZ2V0dGVyKSB7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjdHgsIG5hbWUsXG4gICAgeyBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IGdldHRlci5jYWxsKHRoaXMpO1xuICAgICAgICByZXR1cm4gcmVzdWx0ID09PSB1bmRlZmluZWQgPyB0aGlzIDogcmVzdWx0O1xuICAgICAgfVxuICAgICwgY29uZmlndXJhYmxlOiB0cnVlXG4gIH0pO1xufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS91dGlscy9mbGFnLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIENoYWkgLSBmbGFnIHV0aWxpdHlcbiAqIENvcHlyaWdodChjKSAyMDEyLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKipcbiAqICMjIyBmbGFnKG9iamVjdCAsa2V5LCBbdmFsdWVdKVxuICpcbiAqIEdldCBvciBzZXQgYSBmbGFnIHZhbHVlIG9uIGFuIG9iamVjdC4gSWYgYVxuICogdmFsdWUgaXMgcHJvdmlkZWQgaXQgd2lsbCBiZSBzZXQsIGVsc2UgaXQgd2lsbFxuICogcmV0dXJuIHRoZSBjdXJyZW50bHkgc2V0IHZhbHVlIG9yIGB1bmRlZmluZWRgIGlmXG4gKiB0aGUgdmFsdWUgaXMgbm90IHNldC5cbiAqXG4gKiAgICAgdXRpbHMuZmxhZyh0aGlzLCAnZm9vJywgJ2JhcicpOyAvLyBzZXR0ZXJcbiAqICAgICB1dGlscy5mbGFnKHRoaXMsICdmb28nKTsgLy8gZ2V0dGVyLCByZXR1cm5zIGBiYXJgXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCAoY29uc3RydWN0ZWQgQXNzZXJ0aW9uXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5XG4gKiBAcGFyYW0ge01peGVkfSB2YWx1ZSAob3B0aW9uYWwpXG4gKiBAbmFtZSBmbGFnXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmosIGtleSwgdmFsdWUpIHtcbiAgdmFyIGZsYWdzID0gb2JqLl9fZmxhZ3MgfHwgKG9iai5fX2ZsYWdzID0gT2JqZWN0LmNyZWF0ZShudWxsKSk7XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAzKSB7XG4gICAgZmxhZ3Nba2V5XSA9IHZhbHVlO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBmbGFnc1trZXldO1xuICB9XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL2dldEFjdHVhbC5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gZ2V0QWN0dWFsIHV0aWxpdHlcbiAqIENvcHlyaWdodChjKSAyMDEyLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKipcbiAqICMgZ2V0QWN0dWFsKG9iamVjdCwgW2FjdHVhbF0pXG4gKlxuICogUmV0dXJucyB0aGUgYGFjdHVhbGAgdmFsdWUgZm9yIGFuIEFzc2VydGlvblxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgKGNvbnN0cnVjdGVkIEFzc2VydGlvbilcbiAqIEBwYXJhbSB7QXJndW1lbnRzfSBjaGFpLkFzc2VydGlvbi5wcm90b3R5cGUuYXNzZXJ0IGFyZ3VtZW50c1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaiwgYXJncykge1xuICByZXR1cm4gYXJncy5sZW5ndGggPiA0ID8gYXJnc1s0XSA6IG9iai5fb2JqO1xufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS91dGlscy9nZXRFbnVtZXJhYmxlUHJvcGVydGllcy5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gZ2V0RW51bWVyYWJsZVByb3BlcnRpZXMgdXRpbGl0eVxuICogQ29weXJpZ2h0KGMpIDIwMTItMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogIyMjIC5nZXRFbnVtZXJhYmxlUHJvcGVydGllcyhvYmplY3QpXG4gKlxuICogVGhpcyBhbGxvd3MgdGhlIHJldHJpZXZhbCBvZiBlbnVtZXJhYmxlIHByb3BlcnR5IG5hbWVzIG9mIGFuIG9iamVjdCxcbiAqIGluaGVyaXRlZCBvciBub3QuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdFxuICogQHJldHVybnMge0FycmF5fVxuICogQG5hbWUgZ2V0RW51bWVyYWJsZVByb3BlcnRpZXNcbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBnZXRFbnVtZXJhYmxlUHJvcGVydGllcyhvYmplY3QpIHtcbiAgdmFyIHJlc3VsdCA9IFtdO1xuICBmb3IgKHZhciBuYW1lIGluIG9iamVjdCkge1xuICAgIHJlc3VsdC5wdXNoKG5hbWUpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL2dldE1lc3NhZ2UuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogQ2hhaSAtIG1lc3NhZ2UgY29tcG9zaXRpb24gdXRpbGl0eVxuICogQ29weXJpZ2h0KGMpIDIwMTItMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qIVxuICogTW9kdWxlIGRlcGVuZGFuY2llc1xuICovXG5cbnZhciBmbGFnID0gcmVxdWlyZSgnLi9mbGFnJylcbiAgLCBnZXRBY3R1YWwgPSByZXF1aXJlKCcuL2dldEFjdHVhbCcpXG4gICwgaW5zcGVjdCA9IHJlcXVpcmUoJy4vaW5zcGVjdCcpXG4gICwgb2JqRGlzcGxheSA9IHJlcXVpcmUoJy4vb2JqRGlzcGxheScpO1xuXG4vKipcbiAqICMjIyAuZ2V0TWVzc2FnZShvYmplY3QsIG1lc3NhZ2UsIG5lZ2F0ZU1lc3NhZ2UpXG4gKlxuICogQ29uc3RydWN0IHRoZSBlcnJvciBtZXNzYWdlIGJhc2VkIG9uIGZsYWdzXG4gKiBhbmQgdGVtcGxhdGUgdGFncy4gVGVtcGxhdGUgdGFncyB3aWxsIHJldHVyblxuICogYSBzdHJpbmdpZmllZCBpbnNwZWN0aW9uIG9mIHRoZSBvYmplY3QgcmVmZXJlbmNlZC5cbiAqXG4gKiBNZXNzYWdlIHRlbXBsYXRlIHRhZ3M6XG4gKiAtIGAje3RoaXN9YCBjdXJyZW50IGFzc2VydGVkIG9iamVjdFxuICogLSBgI3thY3R9YCBhY3R1YWwgdmFsdWVcbiAqIC0gYCN7ZXhwfWAgZXhwZWN0ZWQgdmFsdWVcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IChjb25zdHJ1Y3RlZCBBc3NlcnRpb24pXG4gKiBAcGFyYW0ge0FyZ3VtZW50c30gY2hhaS5Bc3NlcnRpb24ucHJvdG90eXBlLmFzc2VydCBhcmd1bWVudHNcbiAqIEBuYW1lIGdldE1lc3NhZ2VcbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqLCBhcmdzKSB7XG4gIHZhciBuZWdhdGUgPSBmbGFnKG9iaiwgJ25lZ2F0ZScpXG4gICAgLCB2YWwgPSBmbGFnKG9iaiwgJ29iamVjdCcpXG4gICAgLCBleHBlY3RlZCA9IGFyZ3NbM11cbiAgICAsIGFjdHVhbCA9IGdldEFjdHVhbChvYmosIGFyZ3MpXG4gICAgLCBtc2cgPSBuZWdhdGUgPyBhcmdzWzJdIDogYXJnc1sxXVxuICAgICwgZmxhZ01zZyA9IGZsYWcob2JqLCAnbWVzc2FnZScpO1xuXG4gIG1zZyA9IG1zZyB8fCAnJztcbiAgbXNnID0gbXNnXG4gICAgLnJlcGxhY2UoLyN7dGhpc30vZywgb2JqRGlzcGxheSh2YWwpKVxuICAgIC5yZXBsYWNlKC8je2FjdH0vZywgb2JqRGlzcGxheShhY3R1YWwpKVxuICAgIC5yZXBsYWNlKC8je2V4cH0vZywgb2JqRGlzcGxheShleHBlY3RlZCkpO1xuXG4gIHJldHVybiBmbGFnTXNnID8gZmxhZ01zZyArICc6ICcgKyBtc2cgOiBtc2c7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL2dldE5hbWUuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogQ2hhaSAtIGdldE5hbWUgdXRpbGl0eVxuICogQ29weXJpZ2h0KGMpIDIwMTItMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogIyBnZXROYW1lKGZ1bmMpXG4gKlxuICogR2V0cyB0aGUgbmFtZSBvZiBhIGZ1bmN0aW9uLCBpbiBhIGNyb3NzLWJyb3dzZXIgd2F5LlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGEgZnVuY3Rpb24gKHVzdWFsbHkgYSBjb25zdHJ1Y3RvcilcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChmdW5jKSB7XG4gIGlmIChmdW5jLm5hbWUpIHJldHVybiBmdW5jLm5hbWU7XG5cbiAgdmFyIG1hdGNoID0gL15cXHM/ZnVuY3Rpb24gKFteKF0qKVxcKC8uZXhlYyhmdW5jKTtcbiAgcmV0dXJuIG1hdGNoICYmIG1hdGNoWzFdID8gbWF0Y2hbMV0gOiBcIlwiO1xufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS91dGlscy9nZXRQYXRoVmFsdWUuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogQ2hhaSAtIGdldFBhdGhWYWx1ZSB1dGlsaXR5XG4gKiBDb3B5cmlnaHQoYykgMjAxMi0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vbG9naWNhbHBhcmFkb3gvZmlsdHJcbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogIyMjIC5nZXRQYXRoVmFsdWUocGF0aCwgb2JqZWN0KVxuICpcbiAqIFRoaXMgYWxsb3dzIHRoZSByZXRyaWV2YWwgb2YgdmFsdWVzIGluIGFuXG4gKiBvYmplY3QgZ2l2ZW4gYSBzdHJpbmcgcGF0aC5cbiAqXG4gKiAgICAgdmFyIG9iaiA9IHtcbiAqICAgICAgICAgcHJvcDE6IHtcbiAqICAgICAgICAgICAgIGFycjogWydhJywgJ2InLCAnYyddXG4gKiAgICAgICAgICAgLCBzdHI6ICdIZWxsbydcbiAqICAgICAgICAgfVxuICogICAgICAgLCBwcm9wMjoge1xuICogICAgICAgICAgICAgYXJyOiBbIHsgbmVzdGVkOiAnVW5pdmVyc2UnIH0gXVxuICogICAgICAgICAgICwgc3RyOiAnSGVsbG8gYWdhaW4hJ1xuICogICAgICAgICB9XG4gKiAgICAgfVxuICpcbiAqIFRoZSBmb2xsb3dpbmcgd291bGQgYmUgdGhlIHJlc3VsdHMuXG4gKlxuICogICAgIGdldFBhdGhWYWx1ZSgncHJvcDEuc3RyJywgb2JqKTsgLy8gSGVsbG9cbiAqICAgICBnZXRQYXRoVmFsdWUoJ3Byb3AxLmF0dFsyXScsIG9iaik7IC8vIGJcbiAqICAgICBnZXRQYXRoVmFsdWUoJ3Byb3AyLmFyclswXS5uZXN0ZWQnLCBvYmopOyAvLyBVbml2ZXJzZVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0XG4gKiBAcmV0dXJucyB7T2JqZWN0fSB2YWx1ZSBvciBgdW5kZWZpbmVkYFxuICogQG5hbWUgZ2V0UGF0aFZhbHVlXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbnZhciBnZXRQYXRoVmFsdWUgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChwYXRoLCBvYmopIHtcbiAgdmFyIHBhcnNlZCA9IHBhcnNlUGF0aChwYXRoKTtcbiAgcmV0dXJuIF9nZXRQYXRoVmFsdWUocGFyc2VkLCBvYmopO1xufTtcblxuLyohXG4gKiAjIyBwYXJzZVBhdGgocGF0aClcbiAqXG4gKiBIZWxwZXIgZnVuY3Rpb24gdXNlZCB0byBwYXJzZSBzdHJpbmcgb2JqZWN0XG4gKiBwYXRocy4gVXNlIGluIGNvbmp1bmN0aW9uIHdpdGggYF9nZXRQYXRoVmFsdWVgLlxuICpcbiAqICAgICAgdmFyIHBhcnNlZCA9IHBhcnNlUGF0aCgnbXlvYmplY3QucHJvcGVydHkuc3VicHJvcCcpO1xuICpcbiAqICMjIyBQYXRoczpcbiAqXG4gKiAqIENhbiBiZSBhcyBuZWFyIGluZmluaXRlbHkgZGVlcCBhbmQgbmVzdGVkXG4gKiAqIEFycmF5cyBhcmUgYWxzbyB2YWxpZCB1c2luZyB0aGUgZm9ybWFsIGBteW9iamVjdC5kb2N1bWVudFszXS5wcm9wZXJ0eWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAqIEByZXR1cm5zIHtPYmplY3R9IHBhcnNlZFxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyc2VQYXRoIChwYXRoKSB7XG4gIHZhciBzdHIgPSBwYXRoLnJlcGxhY2UoL1xcWy9nLCAnLlsnKVxuICAgICwgcGFydHMgPSBzdHIubWF0Y2goLyhcXFxcXFwufFteLl0rPykrL2cpO1xuICByZXR1cm4gcGFydHMubWFwKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHZhciByZSA9IC9cXFsoXFxkKylcXF0kL1xuICAgICAgLCBtQXJyID0gcmUuZXhlYyh2YWx1ZSlcbiAgICBpZiAobUFycikgcmV0dXJuIHsgaTogcGFyc2VGbG9hdChtQXJyWzFdKSB9O1xuICAgIGVsc2UgcmV0dXJuIHsgcDogdmFsdWUgfTtcbiAgfSk7XG59O1xuXG4vKiFcbiAqICMjIF9nZXRQYXRoVmFsdWUocGFyc2VkLCBvYmopXG4gKlxuICogSGVscGVyIGNvbXBhbmlvbiBmdW5jdGlvbiBmb3IgYC5wYXJzZVBhdGhgIHRoYXQgcmV0dXJuc1xuICogdGhlIHZhbHVlIGxvY2F0ZWQgYXQgdGhlIHBhcnNlZCBhZGRyZXNzLlxuICpcbiAqICAgICAgdmFyIHZhbHVlID0gZ2V0UGF0aFZhbHVlKHBhcnNlZCwgb2JqKTtcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcGFyc2VkIGRlZmluaXRpb24gZnJvbSBgcGFyc2VQYXRoYC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgdG8gc2VhcmNoIGFnYWluc3RcbiAqIEByZXR1cm5zIHtPYmplY3R8VW5kZWZpbmVkfSB2YWx1ZVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gX2dldFBhdGhWYWx1ZSAocGFyc2VkLCBvYmopIHtcbiAgdmFyIHRtcCA9IG9ialxuICAgICwgcmVzO1xuICBmb3IgKHZhciBpID0gMCwgbCA9IHBhcnNlZC5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICB2YXIgcGFydCA9IHBhcnNlZFtpXTtcbiAgICBpZiAodG1wKSB7XG4gICAgICBpZiAoJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBwYXJ0LnApXG4gICAgICAgIHRtcCA9IHRtcFtwYXJ0LnBdO1xuICAgICAgZWxzZSBpZiAoJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiBwYXJ0LmkpXG4gICAgICAgIHRtcCA9IHRtcFtwYXJ0LmldO1xuICAgICAgaWYgKGkgPT0gKGwgLSAxKSkgcmVzID0gdG1wO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXMgPSB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXM7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL2dldFByb3BlcnRpZXMuanNcIiwgZnVuY3Rpb24oZXhwb3J0cywgcmVxdWlyZSwgbW9kdWxlKXtcbi8qIVxuICogQ2hhaSAtIGdldFByb3BlcnRpZXMgdXRpbGl0eVxuICogQ29weXJpZ2h0KGMpIDIwMTItMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogIyMjIC5nZXRQcm9wZXJ0aWVzKG9iamVjdClcbiAqXG4gKiBUaGlzIGFsbG93cyB0aGUgcmV0cmlldmFsIG9mIHByb3BlcnR5IG5hbWVzIG9mIGFuIG9iamVjdCwgZW51bWVyYWJsZSBvciBub3QsXG4gKiBpbmhlcml0ZWQgb3Igbm90LlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3RcbiAqIEByZXR1cm5zIHtBcnJheX1cbiAqIEBuYW1lIGdldFByb3BlcnRpZXNcbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBnZXRQcm9wZXJ0aWVzKG9iamVjdCkge1xuICB2YXIgcmVzdWx0ID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMoc3ViamVjdCk7XG5cbiAgZnVuY3Rpb24gYWRkUHJvcGVydHkocHJvcGVydHkpIHtcbiAgICBpZiAocmVzdWx0LmluZGV4T2YocHJvcGVydHkpID09PSAtMSkge1xuICAgICAgcmVzdWx0LnB1c2gocHJvcGVydHkpO1xuICAgIH1cbiAgfVxuXG4gIHZhciBwcm90byA9IE9iamVjdC5nZXRQcm90b3R5cGVPZihzdWJqZWN0KTtcbiAgd2hpbGUgKHByb3RvICE9PSBudWxsKSB7XG4gICAgT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMocHJvdG8pLmZvckVhY2goYWRkUHJvcGVydHkpO1xuICAgIHByb3RvID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKHByb3RvKTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL2luZGV4LmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIGNoYWlcbiAqIENvcHlyaWdodChjKSAyMDExIEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyohXG4gKiBNYWluIGV4cG9ydHNcbiAqL1xuXG52YXIgZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8qIVxuICogdGVzdCB1dGlsaXR5XG4gKi9cblxuZXhwb3J0cy50ZXN0ID0gcmVxdWlyZSgnLi90ZXN0Jyk7XG5cbi8qIVxuICogdHlwZSB1dGlsaXR5XG4gKi9cblxuZXhwb3J0cy50eXBlID0gcmVxdWlyZSgnLi90eXBlJyk7XG5cbi8qIVxuICogbWVzc2FnZSB1dGlsaXR5XG4gKi9cblxuZXhwb3J0cy5nZXRNZXNzYWdlID0gcmVxdWlyZSgnLi9nZXRNZXNzYWdlJyk7XG5cbi8qIVxuICogYWN0dWFsIHV0aWxpdHlcbiAqL1xuXG5leHBvcnRzLmdldEFjdHVhbCA9IHJlcXVpcmUoJy4vZ2V0QWN0dWFsJyk7XG5cbi8qIVxuICogSW5zcGVjdCB1dGlsXG4gKi9cblxuZXhwb3J0cy5pbnNwZWN0ID0gcmVxdWlyZSgnLi9pbnNwZWN0Jyk7XG5cbi8qIVxuICogT2JqZWN0IERpc3BsYXkgdXRpbFxuICovXG5cbmV4cG9ydHMub2JqRGlzcGxheSA9IHJlcXVpcmUoJy4vb2JqRGlzcGxheScpO1xuXG4vKiFcbiAqIEZsYWcgdXRpbGl0eVxuICovXG5cbmV4cG9ydHMuZmxhZyA9IHJlcXVpcmUoJy4vZmxhZycpO1xuXG4vKiFcbiAqIEZsYWcgdHJhbnNmZXJyaW5nIHV0aWxpdHlcbiAqL1xuXG5leHBvcnRzLnRyYW5zZmVyRmxhZ3MgPSByZXF1aXJlKCcuL3RyYW5zZmVyRmxhZ3MnKTtcblxuLyohXG4gKiBEZWVwIGVxdWFsIHV0aWxpdHlcbiAqL1xuXG5leHBvcnRzLmVxbCA9IHJlcXVpcmUoJ2RlZXAtZXFsJyk7XG5cbi8qIVxuICogRGVlcCBwYXRoIHZhbHVlXG4gKi9cblxuZXhwb3J0cy5nZXRQYXRoVmFsdWUgPSByZXF1aXJlKCcuL2dldFBhdGhWYWx1ZScpO1xuXG4vKiFcbiAqIEZ1bmN0aW9uIG5hbWVcbiAqL1xuXG5leHBvcnRzLmdldE5hbWUgPSByZXF1aXJlKCcuL2dldE5hbWUnKTtcblxuLyohXG4gKiBhZGQgUHJvcGVydHlcbiAqL1xuXG5leHBvcnRzLmFkZFByb3BlcnR5ID0gcmVxdWlyZSgnLi9hZGRQcm9wZXJ0eScpO1xuXG4vKiFcbiAqIGFkZCBNZXRob2RcbiAqL1xuXG5leHBvcnRzLmFkZE1ldGhvZCA9IHJlcXVpcmUoJy4vYWRkTWV0aG9kJyk7XG5cbi8qIVxuICogb3ZlcndyaXRlIFByb3BlcnR5XG4gKi9cblxuZXhwb3J0cy5vdmVyd3JpdGVQcm9wZXJ0eSA9IHJlcXVpcmUoJy4vb3ZlcndyaXRlUHJvcGVydHknKTtcblxuLyohXG4gKiBvdmVyd3JpdGUgTWV0aG9kXG4gKi9cblxuZXhwb3J0cy5vdmVyd3JpdGVNZXRob2QgPSByZXF1aXJlKCcuL292ZXJ3cml0ZU1ldGhvZCcpO1xuXG4vKiFcbiAqIEFkZCBhIGNoYWluYWJsZSBtZXRob2RcbiAqL1xuXG5leHBvcnRzLmFkZENoYWluYWJsZU1ldGhvZCA9IHJlcXVpcmUoJy4vYWRkQ2hhaW5hYmxlTWV0aG9kJyk7XG5cbi8qIVxuICogT3ZlcndyaXRlIGNoYWluYWJsZSBtZXRob2RcbiAqL1xuXG5leHBvcnRzLm92ZXJ3cml0ZUNoYWluYWJsZU1ldGhvZCA9IHJlcXVpcmUoJy4vb3ZlcndyaXRlQ2hhaW5hYmxlTWV0aG9kJyk7XG5cblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS91dGlscy9pbnNwZWN0LmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vLyBUaGlzIGlzIChhbG1vc3QpIGRpcmVjdGx5IGZyb20gTm9kZS5qcyB1dGlsc1xuLy8gaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL2Jsb2IvZjhjMzM1ZDBjYWY0N2YxNmQzMTQxM2Y4OWFhMjhlZGEzODc4ZTNhYS9saWIvdXRpbC5qc1xuXG52YXIgZ2V0TmFtZSA9IHJlcXVpcmUoJy4vZ2V0TmFtZScpO1xudmFyIGdldFByb3BlcnRpZXMgPSByZXF1aXJlKCcuL2dldFByb3BlcnRpZXMnKTtcbnZhciBnZXRFbnVtZXJhYmxlUHJvcGVydGllcyA9IHJlcXVpcmUoJy4vZ2V0RW51bWVyYWJsZVByb3BlcnRpZXMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBpbnNwZWN0O1xuXG4vKipcbiAqIEVjaG9zIHRoZSB2YWx1ZSBvZiBhIHZhbHVlLiBUcnlzIHRvIHByaW50IHRoZSB2YWx1ZSBvdXRcbiAqIGluIHRoZSBiZXN0IHdheSBwb3NzaWJsZSBnaXZlbiB0aGUgZGlmZmVyZW50IHR5cGVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBwcmludCBvdXQuXG4gKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dIaWRkZW4gRmxhZyB0aGF0IHNob3dzIGhpZGRlbiAobm90IGVudW1lcmFibGUpXG4gKiAgICBwcm9wZXJ0aWVzIG9mIG9iamVjdHMuXG4gKiBAcGFyYW0ge051bWJlcn0gZGVwdGggRGVwdGggaW4gd2hpY2ggdG8gZGVzY2VuZCBpbiBvYmplY3QuIERlZmF1bHQgaXMgMi5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gY29sb3JzIEZsYWcgdG8gdHVybiBvbiBBTlNJIGVzY2FwZSBjb2RlcyB0byBjb2xvciB0aGVcbiAqICAgIG91dHB1dC4gRGVmYXVsdCBpcyBmYWxzZSAobm8gY29sb3JpbmcpLlxuICovXG5mdW5jdGlvbiBpbnNwZWN0KG9iaiwgc2hvd0hpZGRlbiwgZGVwdGgsIGNvbG9ycykge1xuICB2YXIgY3R4ID0ge1xuICAgIHNob3dIaWRkZW46IHNob3dIaWRkZW4sXG4gICAgc2VlbjogW10sXG4gICAgc3R5bGl6ZTogZnVuY3Rpb24gKHN0cikgeyByZXR1cm4gc3RyOyB9XG4gIH07XG4gIHJldHVybiBmb3JtYXRWYWx1ZShjdHgsIG9iaiwgKHR5cGVvZiBkZXB0aCA9PT0gJ3VuZGVmaW5lZCcgPyAyIDogZGVwdGgpKTtcbn1cblxuLy8gaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vMTA0NDEyOC9cbnZhciBnZXRPdXRlckhUTUwgPSBmdW5jdGlvbihlbGVtZW50KSB7XG4gIGlmICgnb3V0ZXJIVE1MJyBpbiBlbGVtZW50KSByZXR1cm4gZWxlbWVudC5vdXRlckhUTUw7XG4gIHZhciBucyA9IFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiO1xuICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5zLCAnXycpO1xuICB2YXIgZWxlbVByb3RvID0gKHdpbmRvdy5IVE1MRWxlbWVudCB8fCB3aW5kb3cuRWxlbWVudCkucHJvdG90eXBlO1xuICB2YXIgeG1sU2VyaWFsaXplciA9IG5ldyBYTUxTZXJpYWxpemVyKCk7XG4gIHZhciBodG1sO1xuICBpZiAoZG9jdW1lbnQueG1sVmVyc2lvbikge1xuICAgIHJldHVybiB4bWxTZXJpYWxpemVyLnNlcmlhbGl6ZVRvU3RyaW5nKGVsZW1lbnQpO1xuICB9IGVsc2Uge1xuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChlbGVtZW50LmNsb25lTm9kZShmYWxzZSkpO1xuICAgIGh0bWwgPSBjb250YWluZXIuaW5uZXJIVE1MLnJlcGxhY2UoJz48JywgJz4nICsgZWxlbWVudC5pbm5lckhUTUwgKyAnPCcpO1xuICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSAnJztcbiAgICByZXR1cm4gaHRtbDtcbiAgfVxufTtcblxuLy8gUmV0dXJucyB0cnVlIGlmIG9iamVjdCBpcyBhIERPTSBlbGVtZW50LlxudmFyIGlzRE9NRWxlbWVudCA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgaWYgKHR5cGVvZiBIVE1MRWxlbWVudCA9PT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gb2JqZWN0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQ7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG9iamVjdCAmJlxuICAgICAgdHlwZW9mIG9iamVjdCA9PT0gJ29iamVjdCcgJiZcbiAgICAgIG9iamVjdC5ub2RlVHlwZSA9PT0gMSAmJlxuICAgICAgdHlwZW9mIG9iamVjdC5ub2RlTmFtZSA9PT0gJ3N0cmluZyc7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGZvcm1hdFZhbHVlKGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcykge1xuICAvLyBQcm92aWRlIGEgaG9vayBmb3IgdXNlci1zcGVjaWZpZWQgaW5zcGVjdCBmdW5jdGlvbnMuXG4gIC8vIENoZWNrIHRoYXQgdmFsdWUgaXMgYW4gb2JqZWN0IHdpdGggYW4gaW5zcGVjdCBmdW5jdGlvbiBvbiBpdFxuICBpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlLmluc3BlY3QgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgIC8vIEZpbHRlciBvdXQgdGhlIHV0aWwgbW9kdWxlLCBpdCdzIGluc3BlY3QgZnVuY3Rpb24gaXMgc3BlY2lhbFxuICAgICAgdmFsdWUuaW5zcGVjdCAhPT0gZXhwb3J0cy5pbnNwZWN0ICYmXG4gICAgICAvLyBBbHNvIGZpbHRlciBvdXQgYW55IHByb3RvdHlwZSBvYmplY3RzIHVzaW5nIHRoZSBjaXJjdWxhciBjaGVjay5cbiAgICAgICEodmFsdWUuY29uc3RydWN0b3IgJiYgdmFsdWUuY29uc3RydWN0b3IucHJvdG90eXBlID09PSB2YWx1ZSkpIHtcbiAgICB2YXIgcmV0ID0gdmFsdWUuaW5zcGVjdChyZWN1cnNlVGltZXMpO1xuICAgIGlmICh0eXBlb2YgcmV0ICE9PSAnc3RyaW5nJykge1xuICAgICAgcmV0ID0gZm9ybWF0VmFsdWUoY3R4LCByZXQsIHJlY3Vyc2VUaW1lcyk7XG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH1cblxuICAvLyBQcmltaXRpdmUgdHlwZXMgY2Fubm90IGhhdmUgcHJvcGVydGllc1xuICB2YXIgcHJpbWl0aXZlID0gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpO1xuICBpZiAocHJpbWl0aXZlKSB7XG4gICAgcmV0dXJuIHByaW1pdGl2ZTtcbiAgfVxuXG4gIC8vIElmIGl0J3MgRE9NIGVsZW0sIGdldCBvdXRlciBIVE1MLlxuICBpZiAoaXNET01FbGVtZW50KHZhbHVlKSkge1xuICAgIHJldHVybiBnZXRPdXRlckhUTUwodmFsdWUpO1xuICB9XG5cbiAgLy8gTG9vayB1cCB0aGUga2V5cyBvZiB0aGUgb2JqZWN0LlxuICB2YXIgdmlzaWJsZUtleXMgPSBnZXRFbnVtZXJhYmxlUHJvcGVydGllcyh2YWx1ZSk7XG4gIHZhciBrZXlzID0gY3R4LnNob3dIaWRkZW4gPyBnZXRQcm9wZXJ0aWVzKHZhbHVlKSA6IHZpc2libGVLZXlzO1xuXG4gIC8vIFNvbWUgdHlwZSBvZiBvYmplY3Qgd2l0aG91dCBwcm9wZXJ0aWVzIGNhbiBiZSBzaG9ydGN1dHRlZC5cbiAgLy8gSW4gSUUsIGVycm9ycyBoYXZlIGEgc2luZ2xlIGBzdGFja2AgcHJvcGVydHksIG9yIGlmIHRoZXkgYXJlIHZhbmlsbGEgYEVycm9yYCxcbiAgLy8gYSBgc3RhY2tgIHBsdXMgYGRlc2NyaXB0aW9uYCBwcm9wZXJ0eTsgaWdub3JlIHRob3NlIGZvciBjb25zaXN0ZW5jeS5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwIHx8IChpc0Vycm9yKHZhbHVlKSAmJiAoXG4gICAgICAoa2V5cy5sZW5ndGggPT09IDEgJiYga2V5c1swXSA9PT0gJ3N0YWNrJykgfHxcbiAgICAgIChrZXlzLmxlbmd0aCA9PT0gMiAmJiBrZXlzWzBdID09PSAnZGVzY3JpcHRpb24nICYmIGtleXNbMV0gPT09ICdzdGFjaycpXG4gICAgICkpKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdmFyIG5hbWUgPSBnZXROYW1lKHZhbHVlKTtcbiAgICAgIHZhciBuYW1lU3VmZml4ID0gbmFtZSA/ICc6ICcgKyBuYW1lIDogJyc7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tGdW5jdGlvbicgKyBuYW1lU3VmZml4ICsgJ10nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH1cbiAgICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKERhdGUucHJvdG90eXBlLnRvVVRDU3RyaW5nLmNhbGwodmFsdWUpLCAnZGF0ZScpO1xuICAgIH1cbiAgICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIGJhc2UgPSAnJywgYXJyYXkgPSBmYWxzZSwgYnJhY2VzID0gWyd7JywgJ30nXTtcblxuICAvLyBNYWtlIEFycmF5IHNheSB0aGF0IHRoZXkgYXJlIEFycmF5XG4gIGlmIChpc0FycmF5KHZhbHVlKSkge1xuICAgIGFycmF5ID0gdHJ1ZTtcbiAgICBicmFjZXMgPSBbJ1snLCAnXSddO1xuICB9XG5cbiAgLy8gTWFrZSBmdW5jdGlvbnMgc2F5IHRoYXQgdGhleSBhcmUgZnVuY3Rpb25zXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICB2YXIgbmFtZSA9IGdldE5hbWUodmFsdWUpO1xuICAgIHZhciBuYW1lU3VmZml4ID0gbmFtZSA/ICc6ICcgKyBuYW1lIDogJyc7XG4gICAgYmFzZSA9ICcgW0Z1bmN0aW9uJyArIG5hbWVTdWZmaXggKyAnXSc7XG4gIH1cblxuICAvLyBNYWtlIFJlZ0V4cHMgc2F5IHRoYXQgdGhleSBhcmUgUmVnRXhwc1xuICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGRhdGVzIHdpdGggcHJvcGVydGllcyBmaXJzdCBzYXkgdGhlIGRhdGVcbiAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgRGF0ZS5wcm90b3R5cGUudG9VVENTdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGVycm9yIHdpdGggbWVzc2FnZSBmaXJzdCBzYXkgdGhlIGVycm9yXG4gIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICBpZiAoa2V5cy5sZW5ndGggPT09IDAgJiYgKCFhcnJheSB8fCB2YWx1ZS5sZW5ndGggPT0gMCkpIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArIGJyYWNlc1sxXTtcbiAgfVxuXG4gIGlmIChyZWN1cnNlVGltZXMgPCAwKSB7XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbT2JqZWN0XScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG5cbiAgY3R4LnNlZW4ucHVzaCh2YWx1ZSk7XG5cbiAgdmFyIG91dHB1dDtcbiAgaWYgKGFycmF5KSB7XG4gICAgb3V0cHV0ID0gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cyk7XG4gIH0gZWxzZSB7XG4gICAgb3V0cHV0ID0ga2V5cy5tYXAoZnVuY3Rpb24oa2V5KSB7XG4gICAgICByZXR1cm4gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSk7XG4gICAgfSk7XG4gIH1cblxuICBjdHguc2Vlbi5wb3AoKTtcblxuICByZXR1cm4gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKSB7XG4gIHN3aXRjaCAodHlwZW9mIHZhbHVlKSB7XG4gICAgY2FzZSAndW5kZWZpbmVkJzpcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgndW5kZWZpbmVkJywgJ3VuZGVmaW5lZCcpO1xuXG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHZhciBzaW1wbGUgPSAnXFwnJyArIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9eXCJ8XCIkL2csICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJykgKyAnXFwnJztcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShzaW1wbGUsICdzdHJpbmcnKTtcblxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ251bWJlcicpO1xuXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ2Jvb2xlYW4nKTtcbiAgfVxuICAvLyBGb3Igc29tZSByZWFzb24gdHlwZW9mIG51bGwgaXMgXCJvYmplY3RcIiwgc28gc3BlY2lhbCBjYXNlIGhlcmUuXG4gIGlmICh2YWx1ZSA9PT0gbnVsbCkge1xuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnbnVsbCcsICdudWxsJyk7XG4gIH1cbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRFcnJvcih2YWx1ZSkge1xuICByZXR1cm4gJ1snICsgRXJyb3IucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpICsgJ10nO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpIHtcbiAgdmFyIG91dHB1dCA9IFtdO1xuICBmb3IgKHZhciBpID0gMCwgbCA9IHZhbHVlLmxlbmd0aDsgaSA8IGw7ICsraSkge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodmFsdWUsIFN0cmluZyhpKSkpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAgU3RyaW5nKGkpLCB0cnVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dC5wdXNoKCcnKTtcbiAgICB9XG4gIH1cbiAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICgha2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBrZXksIHRydWUpKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpIHtcbiAgdmFyIG5hbWUsIHN0cjtcbiAgaWYgKHZhbHVlLl9fbG9va3VwR2V0dGVyX18pIHtcbiAgICBpZiAodmFsdWUuX19sb29rdXBHZXR0ZXJfXyhrZXkpKSB7XG4gICAgICBpZiAodmFsdWUuX19sb29rdXBTZXR0ZXJfXyhrZXkpKSB7XG4gICAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyL1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHZhbHVlLl9fbG9va3VwU2V0dGVyX18oa2V5KSkge1xuICAgICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAodmlzaWJsZUtleXMuaW5kZXhPZihrZXkpIDwgMCkge1xuICAgIG5hbWUgPSAnWycgKyBrZXkgKyAnXSc7XG4gIH1cbiAgaWYgKCFzdHIpIHtcbiAgICBpZiAoY3R4LnNlZW4uaW5kZXhPZih2YWx1ZVtrZXldKSA8IDApIHtcbiAgICAgIGlmIChyZWN1cnNlVGltZXMgPT09IG51bGwpIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCB2YWx1ZVtrZXldLCBudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgdmFsdWVba2V5XSwgcmVjdXJzZVRpbWVzIC0gMSk7XG4gICAgICB9XG4gICAgICBpZiAoc3RyLmluZGV4T2YoJ1xcbicpID4gLTEpIHtcbiAgICAgICAgaWYgKGFycmF5KSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpLnN1YnN0cigyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIgPSAnXFxuJyArIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tDaXJjdWxhcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAodHlwZW9mIG5hbWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKGFycmF5ICYmIGtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICAgIG5hbWUgPSBKU09OLnN0cmluZ2lmeSgnJyArIGtleSk7XG4gICAgaWYgKG5hbWUubWF0Y2goL15cIihbYS16QS1aX11bYS16QS1aXzAtOV0qKVwiJC8pKSB7XG4gICAgICBuYW1lID0gbmFtZS5zdWJzdHIoMSwgbmFtZS5sZW5ndGggLSAyKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnbmFtZScpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvKF5cInxcIiQpL2csIFwiJ1wiKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnc3RyaW5nJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG5hbWUgKyAnOiAnICsgc3RyO1xufVxuXG5cbmZ1bmN0aW9uIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKSB7XG4gIHZhciBudW1MaW5lc0VzdCA9IDA7XG4gIHZhciBsZW5ndGggPSBvdXRwdXQucmVkdWNlKGZ1bmN0aW9uKHByZXYsIGN1cikge1xuICAgIG51bUxpbmVzRXN0Kys7XG4gICAgaWYgKGN1ci5pbmRleE9mKCdcXG4nKSA+PSAwKSBudW1MaW5lc0VzdCsrO1xuICAgIHJldHVybiBwcmV2ICsgY3VyLmxlbmd0aCArIDE7XG4gIH0sIDApO1xuXG4gIGlmIChsZW5ndGggPiA2MCkge1xuICAgIHJldHVybiBicmFjZXNbMF0gK1xuICAgICAgICAgICAoYmFzZSA9PT0gJycgPyAnJyA6IGJhc2UgKyAnXFxuICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgb3V0cHV0LmpvaW4oJyxcXG4gICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgYnJhY2VzWzFdO1xuICB9XG5cbiAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyAnICcgKyBvdXRwdXQuam9pbignLCAnKSArICcgJyArIGJyYWNlc1sxXTtcbn1cblxuZnVuY3Rpb24gaXNBcnJheShhcikge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShhcikgfHxcbiAgICAgICAgICh0eXBlb2YgYXIgPT09ICdvYmplY3QnICYmIG9iamVjdFRvU3RyaW5nKGFyKSA9PT0gJ1tvYmplY3QgQXJyYXldJyk7XG59XG5cbmZ1bmN0aW9uIGlzUmVnRXhwKHJlKSB7XG4gIHJldHVybiB0eXBlb2YgcmUgPT09ICdvYmplY3QnICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG59XG5cbmZ1bmN0aW9uIGlzRGF0ZShkKSB7XG4gIHJldHVybiB0eXBlb2YgZCA9PT0gJ29iamVjdCcgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbn1cblxuZnVuY3Rpb24gaXNFcnJvcihlKSB7XG4gIHJldHVybiB0eXBlb2YgZSA9PT0gJ29iamVjdCcgJiYgb2JqZWN0VG9TdHJpbmcoZSkgPT09ICdbb2JqZWN0IEVycm9yXSc7XG59XG5cbmZ1bmN0aW9uIG9iamVjdFRvU3RyaW5nKG8pIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKTtcbn1cblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS91dGlscy9vYmpEaXNwbGF5LmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIENoYWkgLSBmbGFnIHV0aWxpdHlcbiAqIENvcHlyaWdodChjKSAyMDEyLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKiFcbiAqIE1vZHVsZSBkZXBlbmRhbmNpZXNcbiAqL1xuXG52YXIgaW5zcGVjdCA9IHJlcXVpcmUoJy4vaW5zcGVjdCcpO1xudmFyIGNvbmZpZyA9IHJlcXVpcmUoJy4uL2NvbmZpZycpO1xuXG4vKipcbiAqICMjIyAub2JqRGlzcGxheSAob2JqZWN0KVxuICpcbiAqIERldGVybWluZXMgaWYgYW4gb2JqZWN0IG9yIGFuIGFycmF5IG1hdGNoZXNcbiAqIGNyaXRlcmlhIHRvIGJlIGluc3BlY3RlZCBpbi1saW5lIGZvciBlcnJvclxuICogbWVzc2FnZXMgb3Igc2hvdWxkIGJlIHRydW5jYXRlZC5cbiAqXG4gKiBAcGFyYW0ge01peGVkfSBqYXZhc2NyaXB0IG9iamVjdCB0byBpbnNwZWN0XG4gKiBAbmFtZSBvYmpEaXNwbGF5XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaikge1xuICB2YXIgc3RyID0gaW5zcGVjdChvYmopXG4gICAgLCB0eXBlID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaik7XG5cbiAgaWYgKGNvbmZpZy50cnVuY2F0ZVRocmVzaG9sZCAmJiBzdHIubGVuZ3RoID49IGNvbmZpZy50cnVuY2F0ZVRocmVzaG9sZCkge1xuICAgIGlmICh0eXBlID09PSAnW29iamVjdCBGdW5jdGlvbl0nKSB7XG4gICAgICByZXR1cm4gIW9iai5uYW1lIHx8IG9iai5uYW1lID09PSAnJ1xuICAgICAgICA/ICdbRnVuY3Rpb25dJ1xuICAgICAgICA6ICdbRnVuY3Rpb246ICcgKyBvYmoubmFtZSArICddJztcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdbb2JqZWN0IEFycmF5XScpIHtcbiAgICAgIHJldHVybiAnWyBBcnJheSgnICsgb2JqLmxlbmd0aCArICcpIF0nO1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqKVxuICAgICAgICAsIGtzdHIgPSBrZXlzLmxlbmd0aCA+IDJcbiAgICAgICAgICA/IGtleXMuc3BsaWNlKDAsIDIpLmpvaW4oJywgJykgKyAnLCAuLi4nXG4gICAgICAgICAgOiBrZXlzLmpvaW4oJywgJyk7XG4gICAgICByZXR1cm4gJ3sgT2JqZWN0ICgnICsga3N0ciArICcpIH0nO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gc3RyO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL292ZXJ3cml0ZU1ldGhvZC5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gb3ZlcndyaXRlTWV0aG9kIHV0aWxpdHlcbiAqIENvcHlyaWdodChjKSAyMDEyLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKipcbiAqICMjIyBvdmVyd3JpdGVNZXRob2QgKGN0eCwgbmFtZSwgZm4pXG4gKlxuICogT3ZlcndpdGVzIGFuIGFscmVhZHkgZXhpc3RpbmcgbWV0aG9kIGFuZCBwcm92aWRlc1xuICogYWNjZXNzIHRvIHByZXZpb3VzIGZ1bmN0aW9uLiBNdXN0IHJldHVybiBmdW5jdGlvblxuICogdG8gYmUgdXNlZCBmb3IgbmFtZS5cbiAqXG4gKiAgICAgdXRpbHMub3ZlcndyaXRlTWV0aG9kKGNoYWkuQXNzZXJ0aW9uLnByb3RvdHlwZSwgJ2VxdWFsJywgZnVuY3Rpb24gKF9zdXBlcikge1xuICogICAgICAgcmV0dXJuIGZ1bmN0aW9uIChzdHIpIHtcbiAqICAgICAgICAgdmFyIG9iaiA9IHV0aWxzLmZsYWcodGhpcywgJ29iamVjdCcpO1xuICogICAgICAgICBpZiAob2JqIGluc3RhbmNlb2YgRm9vKSB7XG4gKiAgICAgICAgICAgbmV3IGNoYWkuQXNzZXJ0aW9uKG9iai52YWx1ZSkudG8uZXF1YWwoc3RyKTtcbiAqICAgICAgICAgfSBlbHNlIHtcbiAqICAgICAgICAgICBfc3VwZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAqICAgICAgICAgfVxuICogICAgICAgfVxuICogICAgIH0pO1xuICpcbiAqIENhbiBhbHNvIGJlIGFjY2Vzc2VkIGRpcmVjdGx5IGZyb20gYGNoYWkuQXNzZXJ0aW9uYC5cbiAqXG4gKiAgICAgY2hhaS5Bc3NlcnRpb24ub3ZlcndyaXRlTWV0aG9kKCdmb28nLCBmbik7XG4gKlxuICogVGhlbiBjYW4gYmUgdXNlZCBhcyBhbnkgb3RoZXIgYXNzZXJ0aW9uLlxuICpcbiAqICAgICBleHBlY3QobXlGb28pLnRvLmVxdWFsKCdiYXInKTtcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gY3R4IG9iamVjdCB3aG9zZSBtZXRob2QgaXMgdG8gYmUgb3ZlcndyaXR0ZW5cbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIG9mIG1ldGhvZCB0byBvdmVyd3JpdGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG1ldGhvZCBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBmdW5jdGlvbiB0byBiZSB1c2VkIGZvciBuYW1lXG4gKiBAbmFtZSBvdmVyd3JpdGVNZXRob2RcbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoY3R4LCBuYW1lLCBtZXRob2QpIHtcbiAgdmFyIF9tZXRob2QgPSBjdHhbbmFtZV1cbiAgICAsIF9zdXBlciA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXM7IH07XG5cbiAgaWYgKF9tZXRob2QgJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIF9tZXRob2QpXG4gICAgX3N1cGVyID0gX21ldGhvZDtcblxuICBjdHhbbmFtZV0gPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHJlc3VsdCA9IG1ldGhvZChfc3VwZXIpLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgcmV0dXJuIHJlc3VsdCA9PT0gdW5kZWZpbmVkID8gdGhpcyA6IHJlc3VsdDtcbiAgfVxufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS91dGlscy9vdmVyd3JpdGVQcm9wZXJ0eS5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gb3ZlcndyaXRlUHJvcGVydHkgdXRpbGl0eVxuICogQ29weXJpZ2h0KGMpIDIwMTItMjAxNCBKYWtlIEx1ZXIgPGpha2VAYWxvZ2ljYWxwYXJhZG94LmNvbT5cbiAqIE1JVCBMaWNlbnNlZFxuICovXG5cbi8qKlxuICogIyMjIG92ZXJ3cml0ZVByb3BlcnR5IChjdHgsIG5hbWUsIGZuKVxuICpcbiAqIE92ZXJ3aXRlcyBhbiBhbHJlYWR5IGV4aXN0aW5nIHByb3BlcnR5IGdldHRlciBhbmQgcHJvdmlkZXNcbiAqIGFjY2VzcyB0byBwcmV2aW91cyB2YWx1ZS4gTXVzdCByZXR1cm4gZnVuY3Rpb24gdG8gdXNlIGFzIGdldHRlci5cbiAqXG4gKiAgICAgdXRpbHMub3ZlcndyaXRlUHJvcGVydHkoY2hhaS5Bc3NlcnRpb24ucHJvdG90eXBlLCAnb2snLCBmdW5jdGlvbiAoX3N1cGVyKSB7XG4gKiAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICogICAgICAgICB2YXIgb2JqID0gdXRpbHMuZmxhZyh0aGlzLCAnb2JqZWN0Jyk7XG4gKiAgICAgICAgIGlmIChvYmogaW5zdGFuY2VvZiBGb28pIHtcbiAqICAgICAgICAgICBuZXcgY2hhaS5Bc3NlcnRpb24ob2JqLm5hbWUpLnRvLmVxdWFsKCdiYXInKTtcbiAqICAgICAgICAgfSBlbHNlIHtcbiAqICAgICAgICAgICBfc3VwZXIuY2FsbCh0aGlzKTtcbiAqICAgICAgICAgfVxuICogICAgICAgfVxuICogICAgIH0pO1xuICpcbiAqXG4gKiBDYW4gYWxzbyBiZSBhY2Nlc3NlZCBkaXJlY3RseSBmcm9tIGBjaGFpLkFzc2VydGlvbmAuXG4gKlxuICogICAgIGNoYWkuQXNzZXJ0aW9uLm92ZXJ3cml0ZVByb3BlcnR5KCdmb28nLCBmbik7XG4gKlxuICogVGhlbiBjYW4gYmUgdXNlZCBhcyBhbnkgb3RoZXIgYXNzZXJ0aW9uLlxuICpcbiAqICAgICBleHBlY3QobXlGb28pLnRvLmJlLm9rO1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBjdHggb2JqZWN0IHdob3NlIHByb3BlcnR5IGlzIHRvIGJlIG92ZXJ3cml0dGVuXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBvZiBwcm9wZXJ0eSB0byBvdmVyd3JpdGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGdldHRlciBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBnZXR0ZXIgZnVuY3Rpb24gdG8gYmUgdXNlZCBmb3IgbmFtZVxuICogQG5hbWUgb3ZlcndyaXRlUHJvcGVydHlcbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoY3R4LCBuYW1lLCBnZXR0ZXIpIHtcbiAgdmFyIF9nZXQgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGN0eCwgbmFtZSlcbiAgICAsIF9zdXBlciA9IGZ1bmN0aW9uICgpIHt9O1xuXG4gIGlmIChfZ2V0ICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBfZ2V0LmdldClcbiAgICBfc3VwZXIgPSBfZ2V0LmdldFxuXG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjdHgsIG5hbWUsXG4gICAgeyBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IGdldHRlcihfc3VwZXIpLmNhbGwodGhpcyk7XG4gICAgICAgIHJldHVybiByZXN1bHQgPT09IHVuZGVmaW5lZCA/IHRoaXMgOiByZXN1bHQ7XG4gICAgICB9XG4gICAgLCBjb25maWd1cmFibGU6IHRydWVcbiAgfSk7XG59O1xuXG59KTtcbnJlcXVpcmUucmVnaXN0ZXIoXCJjaGFpL2xpYi9jaGFpL3V0aWxzL292ZXJ3cml0ZUNoYWluYWJsZU1ldGhvZC5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gb3ZlcndyaXRlQ2hhaW5hYmxlTWV0aG9kIHV0aWxpdHlcbiAqIENvcHlyaWdodChjKSAyMDEyLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKipcbiAqICMjIyBvdmVyd3JpdGVDaGFpbmFibGVNZXRob2QgKGN0eCwgbmFtZSwgZm4pXG4gKlxuICogT3ZlcndpdGVzIGFuIGFscmVhZHkgZXhpc3RpbmcgY2hhaW5hYmxlIG1ldGhvZFxuICogYW5kIHByb3ZpZGVzIGFjY2VzcyB0byB0aGUgcHJldmlvdXMgZnVuY3Rpb24gb3JcbiAqIHByb3BlcnR5LiAgTXVzdCByZXR1cm4gZnVuY3Rpb25zIHRvIGJlIHVzZWQgZm9yXG4gKiBuYW1lLlxuICpcbiAqICAgICB1dGlscy5vdmVyd3JpdGVDaGFpbmFibGVNZXRob2QoY2hhaS5Bc3NlcnRpb24ucHJvdG90eXBlLCAnbGVuZ3RoJyxcbiAqICAgICAgIGZ1bmN0aW9uIChfc3VwZXIpIHtcbiAqICAgICAgIH1cbiAqICAgICAsIGZ1bmN0aW9uIChfc3VwZXIpIHtcbiAqICAgICAgIH1cbiAqICAgICApO1xuICpcbiAqIENhbiBhbHNvIGJlIGFjY2Vzc2VkIGRpcmVjdGx5IGZyb20gYGNoYWkuQXNzZXJ0aW9uYC5cbiAqXG4gKiAgICAgY2hhaS5Bc3NlcnRpb24ub3ZlcndyaXRlQ2hhaW5hYmxlTWV0aG9kKCdmb28nLCBmbiwgZm4pO1xuICpcbiAqIFRoZW4gY2FuIGJlIHVzZWQgYXMgYW55IG90aGVyIGFzc2VydGlvbi5cbiAqXG4gKiAgICAgZXhwZWN0KG15Rm9vKS50by5oYXZlLmxlbmd0aCgzKTtcbiAqICAgICBleHBlY3QobXlGb28pLnRvLmhhdmUubGVuZ3RoLmFib3ZlKDMpO1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBjdHggb2JqZWN0IHdob3NlIG1ldGhvZCAvIHByb3BlcnR5IGlzIHRvIGJlIG92ZXJ3cml0dGVuXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBvZiBtZXRob2QgLyBwcm9wZXJ0eSB0byBvdmVyd3JpdGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG1ldGhvZCBmdW5jdGlvbiB0aGF0IHJldHVybnMgYSBmdW5jdGlvbiB0byBiZSB1c2VkIGZvciBuYW1lXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjaGFpbmluZ0JlaGF2aW9yIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhIGZ1bmN0aW9uIHRvIGJlIHVzZWQgZm9yIHByb3BlcnR5XG4gKiBAbmFtZSBvdmVyd3JpdGVDaGFpbmFibGVNZXRob2RcbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoY3R4LCBuYW1lLCBtZXRob2QsIGNoYWluaW5nQmVoYXZpb3IpIHtcbiAgdmFyIGNoYWluYWJsZUJlaGF2aW9yID0gY3R4Ll9fbWV0aG9kc1tuYW1lXTtcblxuICB2YXIgX2NoYWluaW5nQmVoYXZpb3IgPSBjaGFpbmFibGVCZWhhdmlvci5jaGFpbmluZ0JlaGF2aW9yO1xuICBjaGFpbmFibGVCZWhhdmlvci5jaGFpbmluZ0JlaGF2aW9yID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciByZXN1bHQgPSBjaGFpbmluZ0JlaGF2aW9yKF9jaGFpbmluZ0JlaGF2aW9yKS5jYWxsKHRoaXMpO1xuICAgIHJldHVybiByZXN1bHQgPT09IHVuZGVmaW5lZCA/IHRoaXMgOiByZXN1bHQ7XG4gIH07XG5cbiAgdmFyIF9tZXRob2QgPSBjaGFpbmFibGVCZWhhdmlvci5tZXRob2Q7XG4gIGNoYWluYWJsZUJlaGF2aW9yLm1ldGhvZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcmVzdWx0ID0gbWV0aG9kKF9tZXRob2QpLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgcmV0dXJuIHJlc3VsdCA9PT0gdW5kZWZpbmVkID8gdGhpcyA6IHJlc3VsdDtcbiAgfTtcbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvdXRpbHMvdGVzdC5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gdGVzdCB1dGlsaXR5XG4gKiBDb3B5cmlnaHQoYykgMjAxMi0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyohXG4gKiBNb2R1bGUgZGVwZW5kYW5jaWVzXG4gKi9cblxudmFyIGZsYWcgPSByZXF1aXJlKCcuL2ZsYWcnKTtcblxuLyoqXG4gKiAjIHRlc3Qob2JqZWN0LCBleHByZXNzaW9uKVxuICpcbiAqIFRlc3QgYW5kIG9iamVjdCBmb3IgZXhwcmVzc2lvbi5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IChjb25zdHJ1Y3RlZCBBc3NlcnRpb24pXG4gKiBAcGFyYW0ge0FyZ3VtZW50c30gY2hhaS5Bc3NlcnRpb24ucHJvdG90eXBlLmFzc2VydCBhcmd1bWVudHNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmosIGFyZ3MpIHtcbiAgdmFyIG5lZ2F0ZSA9IGZsYWcob2JqLCAnbmVnYXRlJylcbiAgICAsIGV4cHIgPSBhcmdzWzBdO1xuICByZXR1cm4gbmVnYXRlID8gIWV4cHIgOiBleHByO1xufTtcblxufSk7XG5yZXF1aXJlLnJlZ2lzdGVyKFwiY2hhaS9saWIvY2hhaS91dGlscy90cmFuc2ZlckZsYWdzLmpzXCIsIGZ1bmN0aW9uKGV4cG9ydHMsIHJlcXVpcmUsIG1vZHVsZSl7XG4vKiFcbiAqIENoYWkgLSB0cmFuc2ZlckZsYWdzIHV0aWxpdHlcbiAqIENvcHlyaWdodChjKSAyMDEyLTIwMTQgSmFrZSBMdWVyIDxqYWtlQGFsb2dpY2FscGFyYWRveC5jb20+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKipcbiAqICMjIyB0cmFuc2ZlckZsYWdzKGFzc2VydGlvbiwgb2JqZWN0LCBpbmNsdWRlQWxsID0gdHJ1ZSlcbiAqXG4gKiBUcmFuc2ZlciBhbGwgdGhlIGZsYWdzIGZvciBgYXNzZXJ0aW9uYCB0byBgb2JqZWN0YC4gSWZcbiAqIGBpbmNsdWRlQWxsYCBpcyBzZXQgdG8gYGZhbHNlYCwgdGhlbiB0aGUgYmFzZSBDaGFpXG4gKiBhc3NlcnRpb24gZmxhZ3MgKG5hbWVseSBgb2JqZWN0YCwgYHNzZmlgLCBhbmQgYG1lc3NhZ2VgKVxuICogd2lsbCBub3QgYmUgdHJhbnNmZXJyZWQuXG4gKlxuICpcbiAqICAgICB2YXIgbmV3QXNzZXJ0aW9uID0gbmV3IEFzc2VydGlvbigpO1xuICogICAgIHV0aWxzLnRyYW5zZmVyRmxhZ3MoYXNzZXJ0aW9uLCBuZXdBc3NlcnRpb24pO1xuICpcbiAqICAgICB2YXIgYW5vdGhlckFzc2VyaXRvbiA9IG5ldyBBc3NlcnRpb24obXlPYmopO1xuICogICAgIHV0aWxzLnRyYW5zZmVyRmxhZ3MoYXNzZXJ0aW9uLCBhbm90aGVyQXNzZXJ0aW9uLCBmYWxzZSk7XG4gKlxuICogQHBhcmFtIHtBc3NlcnRpb259IGFzc2VydGlvbiB0aGUgYXNzZXJ0aW9uIHRvIHRyYW5zZmVyIHRoZSBmbGFncyBmcm9tXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IHRoZSBvYmplY3QgdG8gdHJhbnNmZXIgdGhlIGZsYWdzIHRvbzsgdXN1YWxseSBhIG5ldyBhc3NlcnRpb25cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gaW5jbHVkZUFsbFxuICogQG5hbWUgZ2V0QWxsRmxhZ3NcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGFzc2VydGlvbiwgb2JqZWN0LCBpbmNsdWRlQWxsKSB7XG4gIHZhciBmbGFncyA9IGFzc2VydGlvbi5fX2ZsYWdzIHx8IChhc3NlcnRpb24uX19mbGFncyA9IE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXG4gIGlmICghb2JqZWN0Ll9fZmxhZ3MpIHtcbiAgICBvYmplY3QuX19mbGFncyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gIH1cblxuICBpbmNsdWRlQWxsID0gYXJndW1lbnRzLmxlbmd0aCA9PT0gMyA/IGluY2x1ZGVBbGwgOiB0cnVlO1xuXG4gIGZvciAodmFyIGZsYWcgaW4gZmxhZ3MpIHtcbiAgICBpZiAoaW5jbHVkZUFsbCB8fFxuICAgICAgICAoZmxhZyAhPT0gJ29iamVjdCcgJiYgZmxhZyAhPT0gJ3NzZmknICYmIGZsYWcgIT0gJ21lc3NhZ2UnKSkge1xuICAgICAgb2JqZWN0Ll9fZmxhZ3NbZmxhZ10gPSBmbGFnc1tmbGFnXTtcbiAgICB9XG4gIH1cbn07XG5cbn0pO1xucmVxdWlyZS5yZWdpc3RlcihcImNoYWkvbGliL2NoYWkvdXRpbHMvdHlwZS5qc1wiLCBmdW5jdGlvbihleHBvcnRzLCByZXF1aXJlLCBtb2R1bGUpe1xuLyohXG4gKiBDaGFpIC0gdHlwZSB1dGlsaXR5XG4gKiBDb3B5cmlnaHQoYykgMjAxMi0yMDE0IEpha2UgTHVlciA8amFrZUBhbG9naWNhbHBhcmFkb3guY29tPlxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyohXG4gKiBEZXRlY3RhYmxlIGphdmFzY3JpcHQgbmF0aXZlc1xuICovXG5cbnZhciBuYXRpdmVzID0ge1xuICAgICdbb2JqZWN0IEFyZ3VtZW50c10nOiAnYXJndW1lbnRzJ1xuICAsICdbb2JqZWN0IEFycmF5XSc6ICdhcnJheSdcbiAgLCAnW29iamVjdCBEYXRlXSc6ICdkYXRlJ1xuICAsICdbb2JqZWN0IEZ1bmN0aW9uXSc6ICdmdW5jdGlvbidcbiAgLCAnW29iamVjdCBOdW1iZXJdJzogJ251bWJlcidcbiAgLCAnW29iamVjdCBSZWdFeHBdJzogJ3JlZ2V4cCdcbiAgLCAnW29iamVjdCBTdHJpbmddJzogJ3N0cmluZydcbn07XG5cbi8qKlxuICogIyMjIHR5cGUob2JqZWN0KVxuICpcbiAqIEJldHRlciBpbXBsZW1lbnRhdGlvbiBvZiBgdHlwZW9mYCBkZXRlY3Rpb24gdGhhdCBjYW5cbiAqIGJlIHVzZWQgY3Jvc3MtYnJvd3Nlci4gSGFuZGxlcyB0aGUgaW5jb25zaXN0ZW5jaWVzIG9mXG4gKiBBcnJheSwgYG51bGxgLCBhbmQgYHVuZGVmaW5lZGAgZGV0ZWN0aW9uLlxuICpcbiAqICAgICB1dGlscy50eXBlKHt9KSAvLyAnb2JqZWN0J1xuICogICAgIHV0aWxzLnR5cGUobnVsbCkgLy8gYG51bGwnXG4gKiAgICAgdXRpbHMudHlwZSh1bmRlZmluZWQpIC8vIGB1bmRlZmluZWRgXG4gKiAgICAgdXRpbHMudHlwZShbXSkgLy8gYGFycmF5YFxuICpcbiAqIEBwYXJhbSB7TWl4ZWR9IG9iamVjdCB0byBkZXRlY3QgdHlwZSBvZlxuICogQG5hbWUgdHlwZVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciBzdHIgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqKTtcbiAgaWYgKG5hdGl2ZXNbc3RyXSkgcmV0dXJuIG5hdGl2ZXNbc3RyXTtcbiAgaWYgKG9iaiA9PT0gbnVsbCkgcmV0dXJuICdudWxsJztcbiAgaWYgKG9iaiA9PT0gdW5kZWZpbmVkKSByZXR1cm4gJ3VuZGVmaW5lZCc7XG4gIGlmIChvYmogPT09IE9iamVjdChvYmopKSByZXR1cm4gJ29iamVjdCc7XG4gIHJldHVybiB0eXBlb2Ygb2JqO1xufTtcblxufSk7XG5cblxuXG5cbnJlcXVpcmUuYWxpYXMoXCJjaGFpanMtYXNzZXJ0aW9uLWVycm9yL2luZGV4LmpzXCIsIFwiY2hhaS9kZXBzL2Fzc2VydGlvbi1lcnJvci9pbmRleC5qc1wiKTtcbnJlcXVpcmUuYWxpYXMoXCJjaGFpanMtYXNzZXJ0aW9uLWVycm9yL2luZGV4LmpzXCIsIFwiY2hhaS9kZXBzL2Fzc2VydGlvbi1lcnJvci9pbmRleC5qc1wiKTtcbnJlcXVpcmUuYWxpYXMoXCJjaGFpanMtYXNzZXJ0aW9uLWVycm9yL2luZGV4LmpzXCIsIFwiYXNzZXJ0aW9uLWVycm9yL2luZGV4LmpzXCIpO1xucmVxdWlyZS5hbGlhcyhcImNoYWlqcy1hc3NlcnRpb24tZXJyb3IvaW5kZXguanNcIiwgXCJjaGFpanMtYXNzZXJ0aW9uLWVycm9yL2luZGV4LmpzXCIpO1xucmVxdWlyZS5hbGlhcyhcImNoYWlqcy1kZWVwLWVxbC9saWIvZXFsLmpzXCIsIFwiY2hhaS9kZXBzL2RlZXAtZXFsL2xpYi9lcWwuanNcIik7XG5yZXF1aXJlLmFsaWFzKFwiY2hhaWpzLWRlZXAtZXFsL2xpYi9lcWwuanNcIiwgXCJjaGFpL2RlcHMvZGVlcC1lcWwvaW5kZXguanNcIik7XG5yZXF1aXJlLmFsaWFzKFwiY2hhaWpzLWRlZXAtZXFsL2xpYi9lcWwuanNcIiwgXCJkZWVwLWVxbC9pbmRleC5qc1wiKTtcbnJlcXVpcmUuYWxpYXMoXCJjaGFpanMtdHlwZS1kZXRlY3QvbGliL3R5cGUuanNcIiwgXCJjaGFpanMtZGVlcC1lcWwvZGVwcy90eXBlLWRldGVjdC9saWIvdHlwZS5qc1wiKTtcbnJlcXVpcmUuYWxpYXMoXCJjaGFpanMtdHlwZS1kZXRlY3QvbGliL3R5cGUuanNcIiwgXCJjaGFpanMtZGVlcC1lcWwvZGVwcy90eXBlLWRldGVjdC9pbmRleC5qc1wiKTtcbnJlcXVpcmUuYWxpYXMoXCJjaGFpanMtdHlwZS1kZXRlY3QvbGliL3R5cGUuanNcIiwgXCJjaGFpanMtdHlwZS1kZXRlY3QvaW5kZXguanNcIik7XG5yZXF1aXJlLmFsaWFzKFwiY2hhaWpzLWRlZXAtZXFsL2xpYi9lcWwuanNcIiwgXCJjaGFpanMtZGVlcC1lcWwvaW5kZXguanNcIik7XG5yZXF1aXJlLmFsaWFzKFwiY2hhaS9pbmRleC5qc1wiLCBcImNoYWkvaW5kZXguanNcIik7aWYgKHR5cGVvZiBleHBvcnRzID09IFwib2JqZWN0XCIpIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiY2hhaVwiKTtcbn0gZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xuICBkZWZpbmUoW10sIGZ1bmN0aW9uKCl7IHJldHVybiByZXF1aXJlKFwiY2hhaVwiKTsgfSk7XG59IGVsc2Uge1xuICB0aGlzW1wiY2hhaVwiXSA9IHJlcXVpcmUoXCJjaGFpXCIpO1xufX0pKCk7IiwiLyohXG4gKiBhc3luY1xuICogaHR0cHM6Ly9naXRodWIuY29tL2Nhb2xhbi9hc3luY1xuICpcbiAqIENvcHlyaWdodCAyMDEwLTIwMTQgQ2FvbGFuIE1jTWFob25cbiAqIFJlbGVhc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZVxuICovXG4vKmpzaGludCBvbmV2YXI6IGZhbHNlLCBpbmRlbnQ6NCAqL1xuLypnbG9iYWwgc2V0SW1tZWRpYXRlOiBmYWxzZSwgc2V0VGltZW91dDogZmFsc2UsIGNvbnNvbGU6IGZhbHNlICovXG4oZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIGFzeW5jID0ge307XG5cbiAgICAvLyBnbG9iYWwgb24gdGhlIHNlcnZlciwgd2luZG93IGluIHRoZSBicm93c2VyXG4gICAgdmFyIHJvb3QsIHByZXZpb3VzX2FzeW5jO1xuXG4gICAgcm9vdCA9IHRoaXM7XG4gICAgaWYgKHJvb3QgIT0gbnVsbCkge1xuICAgICAgcHJldmlvdXNfYXN5bmMgPSByb290LmFzeW5jO1xuICAgIH1cblxuICAgIGFzeW5jLm5vQ29uZmxpY3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJvb3QuYXN5bmMgPSBwcmV2aW91c19hc3luYztcbiAgICAgICAgcmV0dXJuIGFzeW5jO1xuICAgIH07XG5cbiAgICBmdW5jdGlvbiBvbmx5X29uY2UoZm4pIHtcbiAgICAgICAgdmFyIGNhbGxlZCA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoY2FsbGVkKSB0aHJvdyBuZXcgRXJyb3IoXCJDYWxsYmFjayB3YXMgYWxyZWFkeSBjYWxsZWQuXCIpO1xuICAgICAgICAgICAgY2FsbGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGZuLmFwcGx5KHJvb3QsIGFyZ3VtZW50cyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLy8vIGNyb3NzLWJyb3dzZXIgY29tcGF0aWJsaXR5IGZ1bmN0aW9ucyAvLy8vXG5cbiAgICB2YXIgX3RvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZztcblxuICAgIHZhciBfaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKG9iaikge1xuICAgICAgICByZXR1cm4gX3RvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgICB9O1xuXG4gICAgdmFyIF9lYWNoID0gZnVuY3Rpb24gKGFyciwgaXRlcmF0b3IpIHtcbiAgICAgICAgaWYgKGFyci5mb3JFYWNoKSB7XG4gICAgICAgICAgICByZXR1cm4gYXJyLmZvckVhY2goaXRlcmF0b3IpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICBpdGVyYXRvcihhcnJbaV0sIGksIGFycik7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIF9tYXAgPSBmdW5jdGlvbiAoYXJyLCBpdGVyYXRvcikge1xuICAgICAgICBpZiAoYXJyLm1hcCkge1xuICAgICAgICAgICAgcmV0dXJuIGFyci5tYXAoaXRlcmF0b3IpO1xuICAgICAgICB9XG4gICAgICAgIHZhciByZXN1bHRzID0gW107XG4gICAgICAgIF9lYWNoKGFyciwgZnVuY3Rpb24gKHgsIGksIGEpIHtcbiAgICAgICAgICAgIHJlc3VsdHMucHVzaChpdGVyYXRvcih4LCBpLCBhKSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9O1xuXG4gICAgdmFyIF9yZWR1Y2UgPSBmdW5jdGlvbiAoYXJyLCBpdGVyYXRvciwgbWVtbykge1xuICAgICAgICBpZiAoYXJyLnJlZHVjZSkge1xuICAgICAgICAgICAgcmV0dXJuIGFyci5yZWR1Y2UoaXRlcmF0b3IsIG1lbW8pO1xuICAgICAgICB9XG4gICAgICAgIF9lYWNoKGFyciwgZnVuY3Rpb24gKHgsIGksIGEpIHtcbiAgICAgICAgICAgIG1lbW8gPSBpdGVyYXRvcihtZW1vLCB4LCBpLCBhKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgIH07XG5cbiAgICB2YXIgX2tleXMgPSBmdW5jdGlvbiAob2JqKSB7XG4gICAgICAgIGlmIChPYmplY3Qua2V5cykge1xuICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKG9iaik7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGtleXMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgayBpbiBvYmopIHtcbiAgICAgICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoaykpIHtcbiAgICAgICAgICAgICAgICBrZXlzLnB1c2goayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGtleXM7XG4gICAgfTtcblxuICAgIC8vLy8gZXhwb3J0ZWQgYXN5bmMgbW9kdWxlIGZ1bmN0aW9ucyAvLy8vXG5cbiAgICAvLy8vIG5leHRUaWNrIGltcGxlbWVudGF0aW9uIHdpdGggYnJvd3Nlci1jb21wYXRpYmxlIGZhbGxiYWNrIC8vLy9cbiAgICBpZiAodHlwZW9mIHByb2Nlc3MgPT09ICd1bmRlZmluZWQnIHx8ICEocHJvY2Vzcy5uZXh0VGljaykpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGFzeW5jLm5leHRUaWNrID0gZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgICAgICAgICAgLy8gbm90IGEgZGlyZWN0IGFsaWFzIGZvciBJRTEwIGNvbXBhdGliaWxpdHlcbiAgICAgICAgICAgICAgICBzZXRJbW1lZGlhdGUoZm4pO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZSA9IGFzeW5jLm5leHRUaWNrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgYXN5bmMubmV4dFRpY2sgPSBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBhc3luYy5zZXRJbW1lZGlhdGUgPSBhc3luYy5uZXh0VGljaztcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgYXN5bmMubmV4dFRpY2sgPSBwcm9jZXNzLm5leHRUaWNrO1xuICAgICAgICBpZiAodHlwZW9mIHNldEltbWVkaWF0ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZSA9IGZ1bmN0aW9uIChmbikge1xuICAgICAgICAgICAgICAvLyBub3QgYSBkaXJlY3QgYWxpYXMgZm9yIElFMTAgY29tcGF0aWJpbGl0eVxuICAgICAgICAgICAgICBzZXRJbW1lZGlhdGUoZm4pO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZSA9IGFzeW5jLm5leHRUaWNrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXN5bmMuZWFjaCA9IGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICBpZiAoIWFyci5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBjb21wbGV0ZWQgPSAwO1xuICAgICAgICBfZWFjaChhcnIsIGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICBpdGVyYXRvcih4LCBvbmx5X29uY2UoZG9uZSkgKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGZ1bmN0aW9uIGRvbmUoZXJyKSB7XG4gICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgY29tcGxldGVkICs9IDE7XG4gICAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG4gICAgYXN5bmMuZm9yRWFjaCA9IGFzeW5jLmVhY2g7XG5cbiAgICBhc3luYy5lYWNoU2VyaWVzID0gZnVuY3Rpb24gKGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgIGlmICghYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNvbXBsZXRlZCA9IDA7XG4gICAgICAgIHZhciBpdGVyYXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaXRlcmF0b3IoYXJyW2NvbXBsZXRlZF0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb21wbGV0ZWQgKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBsZXRlZCA+PSBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlcmF0ZSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIGl0ZXJhdGUoKTtcbiAgICB9O1xuICAgIGFzeW5jLmZvckVhY2hTZXJpZXMgPSBhc3luYy5lYWNoU2VyaWVzO1xuXG4gICAgYXN5bmMuZWFjaExpbWl0ID0gZnVuY3Rpb24gKGFyciwgbGltaXQsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZm4gPSBfZWFjaExpbWl0KGxpbWl0KTtcbiAgICAgICAgZm4uYXBwbHkobnVsbCwgW2FyciwgaXRlcmF0b3IsIGNhbGxiYWNrXSk7XG4gICAgfTtcbiAgICBhc3luYy5mb3JFYWNoTGltaXQgPSBhc3luYy5lYWNoTGltaXQ7XG5cbiAgICB2YXIgX2VhY2hMaW1pdCA9IGZ1bmN0aW9uIChsaW1pdCkge1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICBpZiAoIWFyci5sZW5ndGggfHwgbGltaXQgPD0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGNvbXBsZXRlZCA9IDA7XG4gICAgICAgICAgICB2YXIgc3RhcnRlZCA9IDA7XG4gICAgICAgICAgICB2YXIgcnVubmluZyA9IDA7XG5cbiAgICAgICAgICAgIChmdW5jdGlvbiByZXBsZW5pc2ggKCkge1xuICAgICAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB3aGlsZSAocnVubmluZyA8IGxpbWl0ICYmIHN0YXJ0ZWQgPCBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0ZWQgKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgcnVubmluZyArPSAxO1xuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvcihhcnJbc3RhcnRlZCAtIDFdLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcGxldGVkICs9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcnVubmluZyAtPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwbGVuaXNoKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICB9O1xuICAgIH07XG5cblxuICAgIHZhciBkb1BhcmFsbGVsID0gZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICByZXR1cm4gZm4uYXBwbHkobnVsbCwgW2FzeW5jLmVhY2hdLmNvbmNhdChhcmdzKSk7XG4gICAgICAgIH07XG4gICAgfTtcbiAgICB2YXIgZG9QYXJhbGxlbExpbWl0ID0gZnVuY3Rpb24obGltaXQsIGZuKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICByZXR1cm4gZm4uYXBwbHkobnVsbCwgW19lYWNoTGltaXQobGltaXQpXS5jb25jYXQoYXJncykpO1xuICAgICAgICB9O1xuICAgIH07XG4gICAgdmFyIGRvU2VyaWVzID0gZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgICAgICByZXR1cm4gZm4uYXBwbHkobnVsbCwgW2FzeW5jLmVhY2hTZXJpZXNdLmNvbmNhdChhcmdzKSk7XG4gICAgICAgIH07XG4gICAgfTtcblxuXG4gICAgdmFyIF9hc3luY01hcCA9IGZ1bmN0aW9uIChlYWNoZm4sIGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIGFyciA9IF9tYXAoYXJyLCBmdW5jdGlvbiAoeCwgaSkge1xuICAgICAgICAgICAgcmV0dXJuIHtpbmRleDogaSwgdmFsdWU6IHh9O1xuICAgICAgICB9KTtcbiAgICAgICAgaWYgKCFjYWxsYmFjaykge1xuICAgICAgICAgICAgZWFjaGZuKGFyciwgZnVuY3Rpb24gKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgaXRlcmF0b3IoeC52YWx1ZSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgICAgICAgICAgZWFjaGZuKGFyciwgZnVuY3Rpb24gKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgaXRlcmF0b3IoeC52YWx1ZSwgZnVuY3Rpb24gKGVyciwgdikge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHRzW3guaW5kZXhdID0gdjtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIHJlc3VsdHMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIGFzeW5jLm1hcCA9IGRvUGFyYWxsZWwoX2FzeW5jTWFwKTtcbiAgICBhc3luYy5tYXBTZXJpZXMgPSBkb1NlcmllcyhfYXN5bmNNYXApO1xuICAgIGFzeW5jLm1hcExpbWl0ID0gZnVuY3Rpb24gKGFyciwgbGltaXQsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gX21hcExpbWl0KGxpbWl0KShhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjayk7XG4gICAgfTtcblxuICAgIHZhciBfbWFwTGltaXQgPSBmdW5jdGlvbihsaW1pdCkge1xuICAgICAgICByZXR1cm4gZG9QYXJhbGxlbExpbWl0KGxpbWl0LCBfYXN5bmNNYXApO1xuICAgIH07XG5cbiAgICAvLyByZWR1Y2Ugb25seSBoYXMgYSBzZXJpZXMgdmVyc2lvbiwgYXMgZG9pbmcgcmVkdWNlIGluIHBhcmFsbGVsIHdvbid0XG4gICAgLy8gd29yayBpbiBtYW55IHNpdHVhdGlvbnMuXG4gICAgYXN5bmMucmVkdWNlID0gZnVuY3Rpb24gKGFyciwgbWVtbywgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIGFzeW5jLmVhY2hTZXJpZXMoYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKG1lbW8sIHgsIGZ1bmN0aW9uIChlcnIsIHYpIHtcbiAgICAgICAgICAgICAgICBtZW1vID0gdjtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgbWVtbyk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgLy8gaW5qZWN0IGFsaWFzXG4gICAgYXN5bmMuaW5qZWN0ID0gYXN5bmMucmVkdWNlO1xuICAgIC8vIGZvbGRsIGFsaWFzXG4gICAgYXN5bmMuZm9sZGwgPSBhc3luYy5yZWR1Y2U7XG5cbiAgICBhc3luYy5yZWR1Y2VSaWdodCA9IGZ1bmN0aW9uIChhcnIsIG1lbW8sIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgcmV2ZXJzZWQgPSBfbWFwKGFyciwgZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9KS5yZXZlcnNlKCk7XG4gICAgICAgIGFzeW5jLnJlZHVjZShyZXZlcnNlZCwgbWVtbywgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbiAgICB9O1xuICAgIC8vIGZvbGRyIGFsaWFzXG4gICAgYXN5bmMuZm9sZHIgPSBhc3luYy5yZWR1Y2VSaWdodDtcblxuICAgIHZhciBfZmlsdGVyID0gZnVuY3Rpb24gKGVhY2hmbiwgYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICAgICAgYXJyID0gX21hcChhcnIsIGZ1bmN0aW9uICh4LCBpKSB7XG4gICAgICAgICAgICByZXR1cm4ge2luZGV4OiBpLCB2YWx1ZTogeH07XG4gICAgICAgIH0pO1xuICAgICAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgudmFsdWUsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKF9tYXAocmVzdWx0cy5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGEuaW5kZXggLSBiLmluZGV4O1xuICAgICAgICAgICAgfSksIGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHgudmFsdWU7XG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgYXN5bmMuZmlsdGVyID0gZG9QYXJhbGxlbChfZmlsdGVyKTtcbiAgICBhc3luYy5maWx0ZXJTZXJpZXMgPSBkb1NlcmllcyhfZmlsdGVyKTtcbiAgICAvLyBzZWxlY3QgYWxpYXNcbiAgICBhc3luYy5zZWxlY3QgPSBhc3luYy5maWx0ZXI7XG4gICAgYXN5bmMuc2VsZWN0U2VyaWVzID0gYXN5bmMuZmlsdGVyU2VyaWVzO1xuXG4gICAgdmFyIF9yZWplY3QgPSBmdW5jdGlvbiAoZWFjaGZuLCBhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgICAgICBhcnIgPSBfbWFwKGFyciwgZnVuY3Rpb24gKHgsIGkpIHtcbiAgICAgICAgICAgIHJldHVybiB7aW5kZXg6IGksIHZhbHVlOiB4fTtcbiAgICAgICAgfSk7XG4gICAgICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uICh4LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaXRlcmF0b3IoeC52YWx1ZSwgZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXYpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKF9tYXAocmVzdWx0cy5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGEuaW5kZXggLSBiLmluZGV4O1xuICAgICAgICAgICAgfSksIGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHgudmFsdWU7XG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgYXN5bmMucmVqZWN0ID0gZG9QYXJhbGxlbChfcmVqZWN0KTtcbiAgICBhc3luYy5yZWplY3RTZXJpZXMgPSBkb1NlcmllcyhfcmVqZWN0KTtcblxuICAgIHZhciBfZGV0ZWN0ID0gZnVuY3Rpb24gKGVhY2hmbiwgYXJyLCBpdGVyYXRvciwgbWFpbl9jYWxsYmFjaykge1xuICAgICAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2soeCk7XG4gICAgICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIG1haW5fY2FsbGJhY2soKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICBhc3luYy5kZXRlY3QgPSBkb1BhcmFsbGVsKF9kZXRlY3QpO1xuICAgIGFzeW5jLmRldGVjdFNlcmllcyA9IGRvU2VyaWVzKF9kZXRlY3QpO1xuXG4gICAgYXN5bmMuc29tZSA9IGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yLCBtYWluX2NhbGxiYWNrKSB7XG4gICAgICAgIGFzeW5jLmVhY2goYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgbWFpbl9jYWxsYmFjayh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgbWFpbl9jYWxsYmFjayA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIG1haW5fY2FsbGJhY2soZmFsc2UpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIC8vIGFueSBhbGlhc1xuICAgIGFzeW5jLmFueSA9IGFzeW5jLnNvbWU7XG5cbiAgICBhc3luYy5ldmVyeSA9IGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yLCBtYWluX2NhbGxiYWNrKSB7XG4gICAgICAgIGFzeW5jLmVhY2goYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgsIGZ1bmN0aW9uICh2KSB7XG4gICAgICAgICAgICAgICAgaWYgKCF2KSB7XG4gICAgICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2soZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgbWFpbl9jYWxsYmFjayh0cnVlKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICAvLyBhbGwgYWxpYXNcbiAgICBhc3luYy5hbGwgPSBhc3luYy5ldmVyeTtcblxuICAgIGFzeW5jLnNvcnRCeSA9IGZ1bmN0aW9uIChhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICBhc3luYy5tYXAoYXJyLCBmdW5jdGlvbiAoeCwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKHgsIGZ1bmN0aW9uIChlcnIsIGNyaXRlcmlhKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwge3ZhbHVlOiB4LCBjcml0ZXJpYTogY3JpdGVyaWF9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGZuID0gZnVuY3Rpb24gKGxlZnQsIHJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhID0gbGVmdC5jcml0ZXJpYSwgYiA9IHJpZ2h0LmNyaXRlcmlhO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYSA8IGIgPyAtMSA6IGEgPiBiID8gMSA6IDA7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCBfbWFwKHJlc3VsdHMuc29ydChmbiksIGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4LnZhbHVlO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIGFzeW5jLmF1dG8gPSBmdW5jdGlvbiAodGFza3MsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgIHZhciBrZXlzID0gX2tleXModGFza3MpO1xuICAgICAgICB2YXIgcmVtYWluaW5nVGFza3MgPSBrZXlzLmxlbmd0aFxuICAgICAgICBpZiAoIXJlbWFpbmluZ1Rhc2tzKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByZXN1bHRzID0ge307XG5cbiAgICAgICAgdmFyIGxpc3RlbmVycyA9IFtdO1xuICAgICAgICB2YXIgYWRkTGlzdGVuZXIgPSBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgICAgIGxpc3RlbmVycy51bnNoaWZ0KGZuKTtcbiAgICAgICAgfTtcbiAgICAgICAgdmFyIHJlbW92ZUxpc3RlbmVyID0gZnVuY3Rpb24gKGZuKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpc3RlbmVycy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgICAgIGlmIChsaXN0ZW5lcnNbaV0gPT09IGZuKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHZhciB0YXNrQ29tcGxldGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZW1haW5pbmdUYXNrcy0tXG4gICAgICAgICAgICBfZWFjaChsaXN0ZW5lcnMuc2xpY2UoMCksIGZ1bmN0aW9uIChmbikge1xuICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBhZGRMaXN0ZW5lcihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoIXJlbWFpbmluZ1Rhc2tzKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRoZUNhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICAgICAgICAgICAgLy8gcHJldmVudCBmaW5hbCBjYWxsYmFjayBmcm9tIGNhbGxpbmcgaXRzZWxmIGlmIGl0IGVycm9yc1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24gKCkge307XG5cbiAgICAgICAgICAgICAgICB0aGVDYWxsYmFjayhudWxsLCByZXN1bHRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgX2VhY2goa2V5cywgZnVuY3Rpb24gKGspIHtcbiAgICAgICAgICAgIHZhciB0YXNrID0gX2lzQXJyYXkodGFza3Nba10pID8gdGFza3Nba106IFt0YXNrc1trXV07XG4gICAgICAgICAgICB2YXIgdGFza0NhbGxiYWNrID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc2FmZVJlc3VsdHMgPSB7fTtcbiAgICAgICAgICAgICAgICAgICAgX2VhY2goX2tleXMocmVzdWx0cyksIGZ1bmN0aW9uKHJrZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNhZmVSZXN1bHRzW3JrZXldID0gcmVzdWx0c1tya2V5XTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHNhZmVSZXN1bHRzW2tdID0gYXJncztcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyLCBzYWZlUmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgICAgIC8vIHN0b3Agc3Vic2VxdWVudCBlcnJvcnMgaGl0dGluZyBjYWxsYmFjayBtdWx0aXBsZSB0aW1lc1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0c1trXSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZSh0YXNrQ29tcGxldGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB2YXIgcmVxdWlyZXMgPSB0YXNrLnNsaWNlKDAsIE1hdGguYWJzKHRhc2subGVuZ3RoIC0gMSkpIHx8IFtdO1xuICAgICAgICAgICAgdmFyIHJlYWR5ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBfcmVkdWNlKHJlcXVpcmVzLCBmdW5jdGlvbiAoYSwgeCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKGEgJiYgcmVzdWx0cy5oYXNPd25Qcm9wZXJ0eSh4KSk7XG4gICAgICAgICAgICAgICAgfSwgdHJ1ZSkgJiYgIXJlc3VsdHMuaGFzT3duUHJvcGVydHkoayk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKHJlYWR5KCkpIHtcbiAgICAgICAgICAgICAgICB0YXNrW3Rhc2subGVuZ3RoIC0gMV0odGFza0NhbGxiYWNrLCByZXN1bHRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBsaXN0ZW5lciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlYWR5KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZUxpc3RlbmVyKGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhc2tbdGFzay5sZW5ndGggLSAxXSh0YXNrQ2FsbGJhY2ssIHJlc3VsdHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBhZGRMaXN0ZW5lcihsaXN0ZW5lcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBhc3luYy5yZXRyeSA9IGZ1bmN0aW9uKHRpbWVzLCB0YXNrLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgREVGQVVMVF9USU1FUyA9IDU7XG4gICAgICAgIHZhciBhdHRlbXB0cyA9IFtdO1xuICAgICAgICAvLyBVc2UgZGVmYXVsdHMgaWYgdGltZXMgbm90IHBhc3NlZFxuICAgICAgICBpZiAodHlwZW9mIHRpbWVzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWxsYmFjayA9IHRhc2s7XG4gICAgICAgICAgICB0YXNrID0gdGltZXM7XG4gICAgICAgICAgICB0aW1lcyA9IERFRkFVTFRfVElNRVM7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTWFrZSBzdXJlIHRpbWVzIGlzIGEgbnVtYmVyXG4gICAgICAgIHRpbWVzID0gcGFyc2VJbnQodGltZXMsIDEwKSB8fCBERUZBVUxUX1RJTUVTO1xuICAgICAgICB2YXIgd3JhcHBlZFRhc2sgPSBmdW5jdGlvbih3cmFwcGVkQ2FsbGJhY2ssIHdyYXBwZWRSZXN1bHRzKSB7XG4gICAgICAgICAgICB2YXIgcmV0cnlBdHRlbXB0ID0gZnVuY3Rpb24odGFzaywgZmluYWxBdHRlbXB0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKHNlcmllc0NhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhc2soZnVuY3Rpb24oZXJyLCByZXN1bHQpe1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VyaWVzQ2FsbGJhY2soIWVyciB8fCBmaW5hbEF0dGVtcHQsIHtlcnI6IGVyciwgcmVzdWx0OiByZXN1bHR9KTtcbiAgICAgICAgICAgICAgICAgICAgfSwgd3JhcHBlZFJlc3VsdHMpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgd2hpbGUgKHRpbWVzKSB7XG4gICAgICAgICAgICAgICAgYXR0ZW1wdHMucHVzaChyZXRyeUF0dGVtcHQodGFzaywgISh0aW1lcy09MSkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFzeW5jLnNlcmllcyhhdHRlbXB0cywgZnVuY3Rpb24oZG9uZSwgZGF0YSl7XG4gICAgICAgICAgICAgICAgZGF0YSA9IGRhdGFbZGF0YS5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAod3JhcHBlZENhbGxiYWNrIHx8IGNhbGxiYWNrKShkYXRhLmVyciwgZGF0YS5yZXN1bHQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgYSBjYWxsYmFjayBpcyBwYXNzZWQsIHJ1biB0aGlzIGFzIGEgY29udHJvbGwgZmxvd1xuICAgICAgICByZXR1cm4gY2FsbGJhY2sgPyB3cmFwcGVkVGFzaygpIDogd3JhcHBlZFRhc2tcbiAgICB9O1xuXG4gICAgYXN5bmMud2F0ZXJmYWxsID0gZnVuY3Rpb24gKHRhc2tzLCBjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICBpZiAoIV9pc0FycmF5KHRhc2tzKSkge1xuICAgICAgICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IHRvIHdhdGVyZmFsbCBtdXN0IGJlIGFuIGFycmF5IG9mIGZ1bmN0aW9ucycpO1xuICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGFza3MubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgd3JhcEl0ZXJhdG9yID0gZnVuY3Rpb24gKGl0ZXJhdG9yKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5leHQgPSBpdGVyYXRvci5uZXh0KCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzLnB1c2god3JhcEl0ZXJhdG9yKG5leHQpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3MucHVzaChjYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9O1xuICAgICAgICB3cmFwSXRlcmF0b3IoYXN5bmMuaXRlcmF0b3IodGFza3MpKSgpO1xuICAgIH07XG5cbiAgICB2YXIgX3BhcmFsbGVsID0gZnVuY3Rpb24oZWFjaGZuLCB0YXNrcywgY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbiAoKSB7fTtcbiAgICAgICAgaWYgKF9pc0FycmF5KHRhc2tzKSkge1xuICAgICAgICAgICAgZWFjaGZuLm1hcCh0YXNrcywgZnVuY3Rpb24gKGZuLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGlmIChmbikge1xuICAgICAgICAgICAgICAgICAgICBmbihmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3MgPSBhcmdzWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbChudWxsLCBlcnIsIGFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0cyA9IHt9O1xuICAgICAgICAgICAgZWFjaGZuLmVhY2goX2tleXModGFza3MpLCBmdW5jdGlvbiAoaywgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICB0YXNrc1trXShmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDw9IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3MgPSBhcmdzWzBdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHNba10gPSBhcmdzO1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBhc3luYy5wYXJhbGxlbCA9IGZ1bmN0aW9uICh0YXNrcywgY2FsbGJhY2spIHtcbiAgICAgICAgX3BhcmFsbGVsKHsgbWFwOiBhc3luYy5tYXAsIGVhY2g6IGFzeW5jLmVhY2ggfSwgdGFza3MsIGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgYXN5bmMucGFyYWxsZWxMaW1pdCA9IGZ1bmN0aW9uKHRhc2tzLCBsaW1pdCwgY2FsbGJhY2spIHtcbiAgICAgICAgX3BhcmFsbGVsKHsgbWFwOiBfbWFwTGltaXQobGltaXQpLCBlYWNoOiBfZWFjaExpbWl0KGxpbWl0KSB9LCB0YXNrcywgY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICBhc3luYy5zZXJpZXMgPSBmdW5jdGlvbiAodGFza3MsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24gKCkge307XG4gICAgICAgIGlmIChfaXNBcnJheSh0YXNrcykpIHtcbiAgICAgICAgICAgIGFzeW5jLm1hcFNlcmllcyh0YXNrcywgZnVuY3Rpb24gKGZuLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGlmIChmbikge1xuICAgICAgICAgICAgICAgICAgICBmbihmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3MgPSBhcmdzWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbChudWxsLCBlcnIsIGFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0cyA9IHt9O1xuICAgICAgICAgICAgYXN5bmMuZWFjaFNlcmllcyhfa2V5cyh0YXNrcyksIGZ1bmN0aW9uIChrLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHRhc2tzW2tdKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJncyA9IGFyZ3NbMF07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0c1trXSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyLCByZXN1bHRzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGFzeW5jLml0ZXJhdG9yID0gZnVuY3Rpb24gKHRhc2tzKSB7XG4gICAgICAgIHZhciBtYWtlQ2FsbGJhY2sgPSBmdW5jdGlvbiAoaW5kZXgpIHtcbiAgICAgICAgICAgIHZhciBmbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBpZiAodGFza3MubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhc2tzW2luZGV4XS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZm4ubmV4dCgpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGZuLm5leHQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIChpbmRleCA8IHRhc2tzLmxlbmd0aCAtIDEpID8gbWFrZUNhbGxiYWNrKGluZGV4ICsgMSk6IG51bGw7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIGZuO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gbWFrZUNhbGxiYWNrKDApO1xuICAgIH07XG5cbiAgICBhc3luYy5hcHBseSA9IGZ1bmN0aW9uIChmbikge1xuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gZm4uYXBwbHkoXG4gICAgICAgICAgICAgICAgbnVsbCwgYXJncy5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSlcbiAgICAgICAgICAgICk7XG4gICAgICAgIH07XG4gICAgfTtcblxuICAgIHZhciBfY29uY2F0ID0gZnVuY3Rpb24gKGVhY2hmbiwgYXJyLCBmbiwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHIgPSBbXTtcbiAgICAgICAgZWFjaGZuKGFyciwgZnVuY3Rpb24gKHgsIGNiKSB7XG4gICAgICAgICAgICBmbih4LCBmdW5jdGlvbiAoZXJyLCB5KSB7XG4gICAgICAgICAgICAgICAgciA9IHIuY29uY2F0KHkgfHwgW10pO1xuICAgICAgICAgICAgICAgIGNiKGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyLCByKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICBhc3luYy5jb25jYXQgPSBkb1BhcmFsbGVsKF9jb25jYXQpO1xuICAgIGFzeW5jLmNvbmNhdFNlcmllcyA9IGRvU2VyaWVzKF9jb25jYXQpO1xuXG4gICAgYXN5bmMud2hpbHN0ID0gZnVuY3Rpb24gKHRlc3QsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAodGVzdCgpKSB7XG4gICAgICAgICAgICBpdGVyYXRvcihmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYXN5bmMud2hpbHN0KHRlc3QsIGl0ZXJhdG9yLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgYXN5bmMuZG9XaGlsc3QgPSBmdW5jdGlvbiAoaXRlcmF0b3IsIHRlc3QsIGNhbGxiYWNrKSB7XG4gICAgICAgIGl0ZXJhdG9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgIGlmICh0ZXN0LmFwcGx5KG51bGwsIGFyZ3MpKSB7XG4gICAgICAgICAgICAgICAgYXN5bmMuZG9XaGlsc3QoaXRlcmF0b3IsIHRlc3QsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBhc3luYy51bnRpbCA9IGZ1bmN0aW9uICh0ZXN0LCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKCF0ZXN0KCkpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhc3luYy51bnRpbCh0ZXN0LCBpdGVyYXRvciwgY2FsbGJhY2spO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGFzeW5jLmRvVW50aWwgPSBmdW5jdGlvbiAoaXRlcmF0b3IsIHRlc3QsIGNhbGxiYWNrKSB7XG4gICAgICAgIGl0ZXJhdG9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgIGlmICghdGVzdC5hcHBseShudWxsLCBhcmdzKSkge1xuICAgICAgICAgICAgICAgIGFzeW5jLmRvVW50aWwoaXRlcmF0b3IsIHRlc3QsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBhc3luYy5xdWV1ZSA9IGZ1bmN0aW9uICh3b3JrZXIsIGNvbmN1cnJlbmN5KSB7XG4gICAgICAgIGlmIChjb25jdXJyZW5jeSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25jdXJyZW5jeSA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gX2luc2VydChxLCBkYXRhLCBwb3MsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgaWYgKCFxLnN0YXJ0ZWQpe1xuICAgICAgICAgICAgcS5zdGFydGVkID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFfaXNBcnJheShkYXRhKSkge1xuICAgICAgICAgICAgICBkYXRhID0gW2RhdGFdO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZihkYXRhLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICAgLy8gY2FsbCBkcmFpbiBpbW1lZGlhdGVseSBpZiB0aGVyZSBhcmUgbm8gdGFza3NcbiAgICAgICAgICAgICByZXR1cm4gYXN5bmMuc2V0SW1tZWRpYXRlKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICBpZiAocS5kcmFpbikge1xuICAgICAgICAgICAgICAgICAgICAgcS5kcmFpbigpO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIF9lYWNoKGRhdGEsIGZ1bmN0aW9uKHRhc2spIHtcbiAgICAgICAgICAgICAgdmFyIGl0ZW0gPSB7XG4gICAgICAgICAgICAgICAgICBkYXRhOiB0YXNrLFxuICAgICAgICAgICAgICAgICAgY2FsbGJhY2s6IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogbnVsbFxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGlmIChwb3MpIHtcbiAgICAgICAgICAgICAgICBxLnRhc2tzLnVuc2hpZnQoaXRlbSk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcS50YXNrcy5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgaWYgKHEuc2F0dXJhdGVkICYmIHEudGFza3MubGVuZ3RoID09PSBxLmNvbmN1cnJlbmN5KSB7XG4gICAgICAgICAgICAgICAgICBxLnNhdHVyYXRlZCgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZShxLnByb2Nlc3MpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHdvcmtlcnMgPSAwO1xuICAgICAgICB2YXIgcSA9IHtcbiAgICAgICAgICAgIHRhc2tzOiBbXSxcbiAgICAgICAgICAgIGNvbmN1cnJlbmN5OiBjb25jdXJyZW5jeSxcbiAgICAgICAgICAgIHNhdHVyYXRlZDogbnVsbCxcbiAgICAgICAgICAgIGVtcHR5OiBudWxsLFxuICAgICAgICAgICAgZHJhaW46IG51bGwsXG4gICAgICAgICAgICBzdGFydGVkOiBmYWxzZSxcbiAgICAgICAgICAgIHBhdXNlZDogZmFsc2UsXG4gICAgICAgICAgICBwdXNoOiBmdW5jdGlvbiAoZGF0YSwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgX2luc2VydChxLCBkYXRhLCBmYWxzZSwgY2FsbGJhY2spO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGtpbGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgcS5kcmFpbiA9IG51bGw7XG4gICAgICAgICAgICAgIHEudGFza3MgPSBbXTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB1bnNoaWZ0OiBmdW5jdGlvbiAoZGF0YSwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgX2luc2VydChxLCBkYXRhLCB0cnVlLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJvY2VzczogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmICghcS5wYXVzZWQgJiYgd29ya2VycyA8IHEuY29uY3VycmVuY3kgJiYgcS50YXNrcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhc2sgPSBxLnRhc2tzLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChxLmVtcHR5ICYmIHEudGFza3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBxLmVtcHR5KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgd29ya2VycyArPSAxO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbmV4dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdvcmtlcnMgLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0YXNrLmNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFzay5jYWxsYmFjay5hcHBseSh0YXNrLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHEuZHJhaW4gJiYgcS50YXNrcy5sZW5ndGggKyB3b3JrZXJzID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcS5kcmFpbigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcS5wcm9jZXNzKCk7XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIHZhciBjYiA9IG9ubHlfb25jZShuZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgd29ya2VyKHRhc2suZGF0YSwgY2IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsZW5ndGg6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcS50YXNrcy5sZW5ndGg7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcnVubmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB3b3JrZXJzO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGlkbGU6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBxLnRhc2tzLmxlbmd0aCArIHdvcmtlcnMgPT09IDA7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcGF1c2U6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBpZiAocS5wYXVzZWQgPT09IHRydWUpIHsgcmV0dXJuOyB9XG4gICAgICAgICAgICAgICAgcS5wYXVzZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHEucHJvY2VzcygpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHJlc3VtZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGlmIChxLnBhdXNlZCA9PT0gZmFsc2UpIHsgcmV0dXJuOyB9XG4gICAgICAgICAgICAgICAgcS5wYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBxLnByb2Nlc3MoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHE7XG4gICAgfTtcbiAgICBcbiAgICBhc3luYy5wcmlvcml0eVF1ZXVlID0gZnVuY3Rpb24gKHdvcmtlciwgY29uY3VycmVuY3kpIHtcbiAgICAgICAgXG4gICAgICAgIGZ1bmN0aW9uIF9jb21wYXJlVGFza3MoYSwgYil7XG4gICAgICAgICAgcmV0dXJuIGEucHJpb3JpdHkgLSBiLnByaW9yaXR5O1xuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgZnVuY3Rpb24gX2JpbmFyeVNlYXJjaChzZXF1ZW5jZSwgaXRlbSwgY29tcGFyZSkge1xuICAgICAgICAgIHZhciBiZWcgPSAtMSxcbiAgICAgICAgICAgICAgZW5kID0gc2VxdWVuY2UubGVuZ3RoIC0gMTtcbiAgICAgICAgICB3aGlsZSAoYmVnIDwgZW5kKSB7XG4gICAgICAgICAgICB2YXIgbWlkID0gYmVnICsgKChlbmQgLSBiZWcgKyAxKSA+Pj4gMSk7XG4gICAgICAgICAgICBpZiAoY29tcGFyZShpdGVtLCBzZXF1ZW5jZVttaWRdKSA+PSAwKSB7XG4gICAgICAgICAgICAgIGJlZyA9IG1pZDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGVuZCA9IG1pZCAtIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBiZWc7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZ1bmN0aW9uIF9pbnNlcnQocSwgZGF0YSwgcHJpb3JpdHksIGNhbGxiYWNrKSB7XG4gICAgICAgICAgaWYgKCFxLnN0YXJ0ZWQpe1xuICAgICAgICAgICAgcS5zdGFydGVkID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFfaXNBcnJheShkYXRhKSkge1xuICAgICAgICAgICAgICBkYXRhID0gW2RhdGFdO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZihkYXRhLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICAgLy8gY2FsbCBkcmFpbiBpbW1lZGlhdGVseSBpZiB0aGVyZSBhcmUgbm8gdGFza3NcbiAgICAgICAgICAgICByZXR1cm4gYXN5bmMuc2V0SW1tZWRpYXRlKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICBpZiAocS5kcmFpbikge1xuICAgICAgICAgICAgICAgICAgICAgcS5kcmFpbigpO1xuICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIF9lYWNoKGRhdGEsIGZ1bmN0aW9uKHRhc2spIHtcbiAgICAgICAgICAgICAgdmFyIGl0ZW0gPSB7XG4gICAgICAgICAgICAgICAgICBkYXRhOiB0YXNrLFxuICAgICAgICAgICAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5LFxuICAgICAgICAgICAgICAgICAgY2FsbGJhY2s6IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogbnVsbFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgcS50YXNrcy5zcGxpY2UoX2JpbmFyeVNlYXJjaChxLnRhc2tzLCBpdGVtLCBfY29tcGFyZVRhc2tzKSArIDEsIDAsIGl0ZW0pO1xuXG4gICAgICAgICAgICAgIGlmIChxLnNhdHVyYXRlZCAmJiBxLnRhc2tzLmxlbmd0aCA9PT0gcS5jb25jdXJyZW5jeSkge1xuICAgICAgICAgICAgICAgICAgcS5zYXR1cmF0ZWQoKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhc3luYy5zZXRJbW1lZGlhdGUocS5wcm9jZXNzKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gU3RhcnQgd2l0aCBhIG5vcm1hbCBxdWV1ZVxuICAgICAgICB2YXIgcSA9IGFzeW5jLnF1ZXVlKHdvcmtlciwgY29uY3VycmVuY3kpO1xuICAgICAgICBcbiAgICAgICAgLy8gT3ZlcnJpZGUgcHVzaCB0byBhY2NlcHQgc2Vjb25kIHBhcmFtZXRlciByZXByZXNlbnRpbmcgcHJpb3JpdHlcbiAgICAgICAgcS5wdXNoID0gZnVuY3Rpb24gKGRhdGEsIHByaW9yaXR5LCBjYWxsYmFjaykge1xuICAgICAgICAgIF9pbnNlcnQocSwgZGF0YSwgcHJpb3JpdHksIGNhbGxiYWNrKTtcbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIC8vIFJlbW92ZSB1bnNoaWZ0IGZ1bmN0aW9uXG4gICAgICAgIGRlbGV0ZSBxLnVuc2hpZnQ7XG5cbiAgICAgICAgcmV0dXJuIHE7XG4gICAgfTtcblxuICAgIGFzeW5jLmNhcmdvID0gZnVuY3Rpb24gKHdvcmtlciwgcGF5bG9hZCkge1xuICAgICAgICB2YXIgd29ya2luZyAgICAgPSBmYWxzZSxcbiAgICAgICAgICAgIHRhc2tzICAgICAgID0gW107XG5cbiAgICAgICAgdmFyIGNhcmdvID0ge1xuICAgICAgICAgICAgdGFza3M6IHRhc2tzLFxuICAgICAgICAgICAgcGF5bG9hZDogcGF5bG9hZCxcbiAgICAgICAgICAgIHNhdHVyYXRlZDogbnVsbCxcbiAgICAgICAgICAgIGVtcHR5OiBudWxsLFxuICAgICAgICAgICAgZHJhaW46IG51bGwsXG4gICAgICAgICAgICBkcmFpbmVkOiB0cnVlLFxuICAgICAgICAgICAgcHVzaDogZnVuY3Rpb24gKGRhdGEsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFfaXNBcnJheShkYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBkYXRhID0gW2RhdGFdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBfZWFjaChkYXRhLCBmdW5jdGlvbih0YXNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhc2tzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogdGFzayxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrOiB0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicgPyBjYWxsYmFjayA6IG51bGxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNhcmdvLmRyYWluZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhcmdvLnNhdHVyYXRlZCAmJiB0YXNrcy5sZW5ndGggPT09IHBheWxvYWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhcmdvLnNhdHVyYXRlZCgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgYXN5bmMuc2V0SW1tZWRpYXRlKGNhcmdvLnByb2Nlc3MpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb2Nlc3M6IGZ1bmN0aW9uIHByb2Nlc3MoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHdvcmtpbmcpIHJldHVybjtcbiAgICAgICAgICAgICAgICBpZiAodGFza3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmKGNhcmdvLmRyYWluICYmICFjYXJnby5kcmFpbmVkKSBjYXJnby5kcmFpbigpO1xuICAgICAgICAgICAgICAgICAgICBjYXJnby5kcmFpbmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciB0cyA9IHR5cGVvZiBwYXlsb2FkID09PSAnbnVtYmVyJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gdGFza3Muc3BsaWNlKDAsIHBheWxvYWQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgOiB0YXNrcy5zcGxpY2UoMCwgdGFza3MubGVuZ3RoKTtcblxuICAgICAgICAgICAgICAgIHZhciBkcyA9IF9tYXAodHMsIGZ1bmN0aW9uICh0YXNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0YXNrLmRhdGE7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBpZihjYXJnby5lbXB0eSkgY2FyZ28uZW1wdHkoKTtcbiAgICAgICAgICAgICAgICB3b3JraW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB3b3JrZXIoZHMsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgd29ya2luZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgICAgICAgICBfZWFjaCh0cywgZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkYXRhLmNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGF0YS5jYWxsYmFjay5hcHBseShudWxsLCBhcmdzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgcHJvY2VzcygpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxlbmd0aDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0YXNrcy5sZW5ndGg7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcnVubmluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB3b3JraW5nO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gY2FyZ287XG4gICAgfTtcblxuICAgIHZhciBfY29uc29sZV9mbiA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgIGZuLmFwcGx5KG51bGwsIGFyZ3MuY29uY2F0KFtmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbnNvbGUuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoY29uc29sZVtuYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgX2VhY2goYXJncywgZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlW25hbWVdKHgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XSkpO1xuICAgICAgICB9O1xuICAgIH07XG4gICAgYXN5bmMubG9nID0gX2NvbnNvbGVfZm4oJ2xvZycpO1xuICAgIGFzeW5jLmRpciA9IF9jb25zb2xlX2ZuKCdkaXInKTtcbiAgICAvKmFzeW5jLmluZm8gPSBfY29uc29sZV9mbignaW5mbycpO1xuICAgIGFzeW5jLndhcm4gPSBfY29uc29sZV9mbignd2FybicpO1xuICAgIGFzeW5jLmVycm9yID0gX2NvbnNvbGVfZm4oJ2Vycm9yJyk7Ki9cblxuICAgIGFzeW5jLm1lbW9pemUgPSBmdW5jdGlvbiAoZm4sIGhhc2hlcikge1xuICAgICAgICB2YXIgbWVtbyA9IHt9O1xuICAgICAgICB2YXIgcXVldWVzID0ge307XG4gICAgICAgIGhhc2hlciA9IGhhc2hlciB8fCBmdW5jdGlvbiAoeCkge1xuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH07XG4gICAgICAgIHZhciBtZW1vaXplZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3MucG9wKCk7XG4gICAgICAgICAgICB2YXIga2V5ID0gaGFzaGVyLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgICAgICAgICAgaWYgKGtleSBpbiBtZW1vKSB7XG4gICAgICAgICAgICAgICAgYXN5bmMubmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjay5hcHBseShudWxsLCBtZW1vW2tleV0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoa2V5IGluIHF1ZXVlcykge1xuICAgICAgICAgICAgICAgIHF1ZXVlc1trZXldLnB1c2goY2FsbGJhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcXVldWVzW2tleV0gPSBbY2FsbGJhY2tdO1xuICAgICAgICAgICAgICAgIGZuLmFwcGx5KG51bGwsIGFyZ3MuY29uY2F0KFtmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lbW9ba2V5XSA9IGFyZ3VtZW50cztcbiAgICAgICAgICAgICAgICAgICAgdmFyIHEgPSBxdWV1ZXNba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHF1ZXVlc1trZXldO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbCA9IHEubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcVtpXS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfV0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgbWVtb2l6ZWQubWVtbyA9IG1lbW87XG4gICAgICAgIG1lbW9pemVkLnVubWVtb2l6ZWQgPSBmbjtcbiAgICAgICAgcmV0dXJuIG1lbW9pemVkO1xuICAgIH07XG5cbiAgICBhc3luYy51bm1lbW9pemUgPSBmdW5jdGlvbiAoZm4pIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAoZm4udW5tZW1vaXplZCB8fCBmbikuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgIH07XG4gICAgfTtcblxuICAgIGFzeW5jLnRpbWVzID0gZnVuY3Rpb24gKGNvdW50LCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGNvdW50ZXIgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBjb3VudGVyLnB1c2goaSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFzeW5jLm1hcChjb3VudGVyLCBpdGVyYXRvciwgY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICBhc3luYy50aW1lc1NlcmllcyA9IGZ1bmN0aW9uIChjb3VudCwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBjb3VudGVyID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgICAgICAgICAgY291bnRlci5wdXNoKGkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhc3luYy5tYXBTZXJpZXMoY291bnRlciwgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgYXN5bmMuc2VxID0gZnVuY3Rpb24gKC8qIGZ1bmN0aW9ucy4uLiAqLykge1xuICAgICAgICB2YXIgZm5zID0gYXJndW1lbnRzO1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJncy5wb3AoKTtcbiAgICAgICAgICAgIGFzeW5jLnJlZHVjZShmbnMsIGFyZ3MsIGZ1bmN0aW9uIChuZXdhcmdzLCBmbiwgY2IpIHtcbiAgICAgICAgICAgICAgICBmbi5hcHBseSh0aGF0LCBuZXdhcmdzLmNvbmNhdChbZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZXJyID0gYXJndW1lbnRzWzBdO1xuICAgICAgICAgICAgICAgICAgICB2YXIgbmV4dGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgICAgICBjYihlcnIsIG5leHRhcmdzKTtcbiAgICAgICAgICAgICAgICB9XSkpXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmFwcGx5KHRoYXQsIFtlcnJdLmNvbmNhdChyZXN1bHRzKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcbiAgICB9O1xuXG4gICAgYXN5bmMuY29tcG9zZSA9IGZ1bmN0aW9uICgvKiBmdW5jdGlvbnMuLi4gKi8pIHtcbiAgICAgIHJldHVybiBhc3luYy5zZXEuYXBwbHkobnVsbCwgQXJyYXkucHJvdG90eXBlLnJldmVyc2UuY2FsbChhcmd1bWVudHMpKTtcbiAgICB9O1xuXG4gICAgdmFyIF9hcHBseUVhY2ggPSBmdW5jdGlvbiAoZWFjaGZuLCBmbnMgLyphcmdzLi4uKi8pIHtcbiAgICAgICAgdmFyIGdvID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJncy5wb3AoKTtcbiAgICAgICAgICAgIHJldHVybiBlYWNoZm4oZm5zLCBmdW5jdGlvbiAoZm4sIGNiKSB7XG4gICAgICAgICAgICAgICAgZm4uYXBwbHkodGhhdCwgYXJncy5jb25jYXQoW2NiXSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNhbGxiYWNrKTtcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAyKSB7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgICAgICAgICByZXR1cm4gZ28uYXBwbHkodGhpcywgYXJncyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZ287XG4gICAgICAgIH1cbiAgICB9O1xuICAgIGFzeW5jLmFwcGx5RWFjaCA9IGRvUGFyYWxsZWwoX2FwcGx5RWFjaCk7XG4gICAgYXN5bmMuYXBwbHlFYWNoU2VyaWVzID0gZG9TZXJpZXMoX2FwcGx5RWFjaCk7XG5cbiAgICBhc3luYy5mb3JldmVyID0gZnVuY3Rpb24gKGZuLCBjYWxsYmFjaykge1xuICAgICAgICBmdW5jdGlvbiBuZXh0KGVycikge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm4obmV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgbmV4dCgpO1xuICAgIH07XG5cbiAgICAvLyBOb2RlLmpzXG4gICAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gYXN5bmM7XG4gICAgfVxuICAgIC8vIEFNRCAvIFJlcXVpcmVKU1xuICAgIGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgIT09ICd1bmRlZmluZWQnICYmIGRlZmluZS5hbWQpIHtcbiAgICAgICAgZGVmaW5lKFtdLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gYXN5bmM7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBpbmNsdWRlZCBkaXJlY3RseSB2aWEgPHNjcmlwdD4gdGFnXG4gICAgZWxzZSB7XG4gICAgICAgIHJvb3QuYXN5bmMgPSBhc3luYztcbiAgICB9XG5cbn0oKSk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbi8qKlxuICogQGZpbGVvdmVydmlld1xuICpcbiAqIFlvdXIgZW50cnkgcG9pbnQgaW50byBgd2ViLWNvbXBvbmVudC10ZXN0ZXJgJ3MgZW52aXJvbm1lbnQgYW5kIGNvbmZpZ3VyYXRpb24uXG4gKi9cbihmdW5jdGlvbigpIHtcblxudmFyIFdDVCA9IHdpbmRvdy5XQ1QgPSB7XG4gIHJlcG9ydGVyczoge30sXG59O1xuXG4vLyBDb25maWd1cmF0aW9uXG5cbi8qKiBCeSBkZWZhdWx0LCB3ZSB3YWl0IGZvciBhbnkgd2ViIGNvbXBvbmVudCBmcmFtZXdvcmtzIHRvIGxvYWQuICovXG5XQ1Qud2FpdEZvckZyYW1ld29ya3MgPSB0cnVlO1xuXG4vKiogSG93IG1hbnkgYC5odG1sYCBzdWl0ZXMgdGhhdCBjYW4gYmUgY29uY3VycmVudGx5IGxvYWRlZCAmIHJ1bi4gKi9cbldDVC5udW1Db25jdXJyZW50U3VpdGVzID0gODtcblxuLy8gSGVscGVyc1xuXG4vLyBFdmFsdWF0ZWQgaW4gbW9jaGEvcnVuLmpzLlxuV0NULl9zdWl0ZXNUb0xvYWQgPSBbXTtcbldDVC5fZGVwZW5kZW5jaWVzID0gW107XG4vKipcbiAqIExvYWRzIHN1aXRlcyBvZiB0ZXN0cywgc3VwcG9ydGluZyBgLmpzYCBhcyB3ZWxsIGFzIGAuaHRtbGAgZmlsZXMuXG4gKlxuICogQHBhcmFtIHshQXJyYXkuPHN0cmluZz59IGZpbGVzIFRoZSBmaWxlcyB0byBsb2FkLlxuICovXG5XQ1QubG9hZFN1aXRlcyA9IGZ1bmN0aW9uIGxvYWRTdWl0ZXMoZmlsZXMpIHtcbiAgZmlsZXMuZm9yRWFjaChmdW5jdGlvbihmaWxlKSB7XG4gICAgaWYgKGZpbGUuc2xpY2UoLTMpID09PSAnLmpzJykge1xuICAgICAgV0NULl9kZXBlbmRlbmNpZXMucHVzaChmaWxlKTtcbiAgICB9IGVsc2UgaWYgKGZpbGUuc2xpY2UoLTUpID09PSAnLmh0bWwnKSB7XG4gICAgICBXQ1QuX3N1aXRlc1RvTG9hZC5wdXNoKGZpbGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gcmVzb3VyY2UgdHlwZTogJyArIGZpbGUpO1xuICAgIH1cbiAgfSk7XG59O1xuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbldDVC51dGlsID0ge307XG5cbi8qKlxuICogQHBhcmFtIHtmdW5jdGlvbigpfSBkb25lIEEgZnVuY3Rpb24gdG8gY2FsbCB3aGVuIHRoZSBhY3RpdmUgd2ViIGNvbXBvbmVudFxuICogICAgIGZyYW1ld29ya3MgaGF2ZSBsb2FkZWQuXG4gKiBAcGFyYW0ge1dpbmRvd30gb3B0X3Njb3BlIEEgc2NvcGUgdG8gY2hlY2sgZm9yIHBvbHltZXIgd2l0aGluLlxuICovXG5XQ1QudXRpbC53aGVuRnJhbWV3b3Jrc1JlYWR5ID0gZnVuY3Rpb24oZG9uZSwgb3B0X3Njb3BlKSB7XG4gIHZhciBzY29wZSA9IG9wdF9zY29wZSB8fCB3aW5kb3c7XG4gIC8vIFRPRE8obmV2aXIpOiBGcmFtZXdvcmtzIG90aGVyIHRoYW4gUG9seW1lcj9cbiAgaWYgKCFzY29wZS5Qb2x5bWVyKSByZXR1cm4gZG9uZSgpO1xuXG4gIC8vIFBsYXRmb3JtIGlzbid0IHF1aXRlIHJlYWR5IGZvciBJRTEwLlxuICAvLyBUT0RPKG5ldmlyKTogU2hvdWxkIHRoaXMgYmUgYmFrZWQgaW50byBwbGF0Zm9ybSByZWFkeT9cbiAgZG9uZSA9IGFzeW5jUGxhdGZvcm1GbHVzaC5iaW5kKG51bGwsIGRvbmUpO1xuXG4gIGlmIChzY29wZS5Qb2x5bWVyLndoZW5SZWFkeSkge1xuICAgIHNjb3BlLlBvbHltZXIud2hlblJlYWR5KGRvbmUpO1xuICB9IGVsc2Uge1xuICAgIHNjb3BlLmFkZEV2ZW50TGlzdGVuZXIoJ3BvbHltZXItcmVhZHknLCBkb25lKTtcbiAgfVxufTtcblxuLyoqXG4gKiBAcGFyYW0ge251bWJlcn0gY291bnRcbiAqIEBwYXJhbSB7c3RyaW5nfSBraW5kXG4gKiBAcmV0dXJuIHtzdHJpbmd9ICc8Y291bnQ+IDxraW5kPiB0ZXN0cycgb3IgJzxjb3VudD4gPGtpbmQ+IHRlc3QnLlxuICovXG5XQ1QudXRpbC5wbHVyYWxpemVkU3RhdCA9IGZ1bmN0aW9uIHBsdXJhbGl6ZWRTdGF0KGNvdW50LCBraW5kKSB7XG4gIGlmIChjb3VudCA9PT0gMSkge1xuICAgIHJldHVybiBjb3VudCArICcgJyArIGtpbmQgKyAnIHRlc3QnO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBjb3VudCArICcgJyArIGtpbmQgKyAnIHRlc3RzJztcbiAgfVxufTtcblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gcGFyYW0gVGhlIHBhcmFtIHRvIHJldHVybiBhIHZhbHVlIGZvci5cbiAqIEByZXR1cm4gez9zdHJpbmd9IFRoZSBmaXJzdCB2YWx1ZSBmb3IgYHBhcmFtYCwgaWYgZm91bmQuXG4gKi9cbldDVC51dGlsLmdldFBhcmFtID0gZnVuY3Rpb24gZ2V0UGFyYW0ocGFyYW0pIHtcbiAgdmFyIHF1ZXJ5ID0gd2luZG93LmxvY2F0aW9uLnNlYXJjaC5zdWJzdHJpbmcoMSk7XG4gIHZhciB2YXJzID0gcXVlcnkuc3BsaXQoJyYnKTtcbiAgZm9yICh2YXIgaT0wO2k8dmFycy5sZW5ndGg7aSsrKSB7XG4gICAgdmFyIHBhaXIgPSB2YXJzW2ldLnNwbGl0KCc9Jyk7XG4gICAgaWYgKGRlY29kZVVSSUNvbXBvbmVudChwYWlyWzBdKSA9PT0gcGFyYW0pIHtcbiAgICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQocGFpclsxXSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufTtcblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gcGF0aCBUaGUgVVJJIG9mIHRoZSBzY3JpcHQgdG8gbG9hZC5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRvbmVcbiAqL1xuV0NULnV0aWwubG9hZFNjcmlwdCA9IGZ1bmN0aW9uIGxvYWRTY3JpcHQocGF0aCwgZG9uZSkge1xuICB2YXIgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG4gIHNjcmlwdC5zcmMgPSBwYXRoICsgJz8nICsgTWF0aC5yYW5kb20oKTtcbiAgc2NyaXB0Lm9ubG9hZCA9IGRvbmUuYmluZChudWxsLCBudWxsKTtcbiAgc2NyaXB0Lm9uZXJyb3IgPSBkb25lLmJpbmQobnVsbCwgJ0ZhaWxlZCB0byBsb2FkIHNjcmlwdCAnICsgc2NyaXB0LnNyYyk7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcbn1cblxuLyoqIEByZXR1cm4ge3N0cmluZ30gYGxvY2F0aW9uYCByZWxhdGl2ZSB0byB0aGUgY3VycmVudCB3aW5kb3cuICovXG5XQ1QudXRpbC5yZWxhdGl2ZUxvY2F0aW9uID0gZnVuY3Rpb24gcmVsYXRpdmVMb2NhdGlvbihsb2NhdGlvbikge1xuICB2YXIgcGF0aCA9IGxvY2F0aW9uLnBhdGhuYW1lO1xuICBpZiAocGF0aC5pbmRleE9mKHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSkgPT09IDApIHtcbiAgICBwYXRoID0gcGF0aC5zdWJzdHIod2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLmxlbmd0aCk7XG4gIH1cbiAgcmV0dXJuIHBhdGg7XG59XG5cbi8qKlxuICpcbiAqL1xuV0NULnV0aWwuZGVidWcgPSBmdW5jdGlvbiBkZWJ1Zyh2YXJfYXJncykge1xuICBpZiAoIVdDVC5kZWJ1ZykgcmV0dXJuO1xuICBjb25zb2xlLmRlYnVnLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7XG59XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuV0NULkNMSVNvY2tldCA9IENMSVNvY2tldDtcblxudmFyIFNPQ0tFVElPX0VORFBPSU5UID0gd2luZG93LmxvY2F0aW9uLnByb3RvY29sICsgJy8vJyArIHdpbmRvdy5sb2NhdGlvbi5ob3N0O1xudmFyIFNPQ0tFVElPX0xJQlJBUlkgID0gU09DS0VUSU9fRU5EUE9JTlQgKyAnL3NvY2tldC5pby9zb2NrZXQuaW8uanMnO1xuXG4vKipcbiAqIEEgc29ja2V0IGZvciBjb21tdW5pY2F0aW9uIGJldHdlZW4gdGhlIENMSSBhbmQgYnJvd3NlciBydW5uZXJzLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBicm93c2VySWQgQW4gSUQgZ2VuZXJhdGVkIGJ5IHRoZSBDTEkgcnVubmVyLlxuICogQHBhcmFtIHshaW8uU29ja2V0fSBzb2NrZXQgVGhlIHNvY2tldC5pbyBgU29ja2V0YCB0byBjb21tdW5pY2F0ZSBvdmVyLlxuICovXG5mdW5jdGlvbiBDTElTb2NrZXQoYnJvd3NlcklkLCBzb2NrZXQpIHtcbiAgdGhpcy5icm93c2VySWQgPSBicm93c2VySWQ7XG4gIHRoaXMuc29ja2V0ICAgID0gc29ja2V0O1xufVxuXG4vKipcbiAqIEBwYXJhbSB7IU1vY2hhLlJ1bm5lcn0gcnVubmVyIFRoZSBNb2NoYSBgUnVubmVyYCB0byBvYnNlcnZlLCByZXBvcnRpbmdcbiAqICAgICBpbnRlcmVzdGluZyBldmVudHMgYmFjayB0byB0aGUgQ0xJIHJ1bm5lci5cbiAqL1xuQ0xJU29ja2V0LnByb3RvdHlwZS5vYnNlcnZlID0gZnVuY3Rpb24gb2JzZXJ2ZShydW5uZXIpIHtcbiAgdGhpcy5lbWl0RXZlbnQoJ2Jyb3dzZXItc3RhcnQnLCB7XG4gICAgdXJsOiB3aW5kb3cubG9jYXRpb24udG9TdHJpbmcoKSxcbiAgfSk7XG5cbiAgLy8gV2Ugb25seSBlbWl0IGEgc3Vic2V0IG9mIGV2ZW50cyB0aGF0IHdlIGNhcmUgYWJvdXQsIGFuZCBmb2xsb3cgYSBtb3JlXG4gIC8vIGdlbmVyYWwgZXZlbnQgZm9ybWF0IHRoYXQgaXMgaG9wZWZ1bGx5IGFwcGxpY2FibGUgdG8gdGVzdCBydW5uZXJzIGJleW9uZFxuICAvLyBtb2NoYS5cbiAgLy9cbiAgLy8gRm9yIGFsbCBwb3NzaWJsZSBtb2NoYSBldmVudHMsIHNlZTpcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3Zpc2lvbm1lZGlhL21vY2hhL2Jsb2IvbWFzdGVyL2xpYi9ydW5uZXIuanMjTDM2XG4gIHJ1bm5lci5vbigndGVzdCcsIGZ1bmN0aW9uKHRlc3QpIHtcbiAgICB0aGlzLmVtaXRFdmVudCgndGVzdC1zdGFydCcsIHt0ZXN0OiBnZXRUaXRsZXModGVzdCl9KTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24odGVzdCkge1xuICAgIHRoaXMuZW1pdEV2ZW50KCd0ZXN0LWVuZCcsIHtcbiAgICAgIHN0YXRlOiAgICBnZXRTdGF0ZSh0ZXN0KSxcbiAgICAgIHRlc3Q6ICAgICBnZXRUaXRsZXModGVzdCksXG4gICAgICBkdXJhdGlvbjogdGVzdC5kdXJhdGlvbixcbiAgICAgIGVycm9yOiAgICB0ZXN0LmVycixcbiAgICB9KTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuZW1pdEV2ZW50KCdicm93c2VyLWVuZCcpO1xuICB9LmJpbmQodGhpcykpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBldmVudCBUaGUgbmFtZSBvZiB0aGUgZXZlbnQgdG8gZmlyZS5cbiAqIEBwYXJhbSB7Kn0gZGF0YSBBZGRpdGlvbmFsIGRhdGEgdG8gcGFzcyB3aXRoIHRoZSBldmVudC5cbiAqL1xuQ0xJU29ja2V0LnByb3RvdHlwZS5lbWl0RXZlbnQgPSBmdW5jdGlvbiBlbWl0RXZlbnQoZXZlbnQsIGRhdGEpIHtcbiAgdGhpcy5zb2NrZXQuZW1pdCgnY2xpZW50LWV2ZW50Jywge1xuICAgIGJyb3dzZXJJZDogdGhpcy5icm93c2VySWQsXG4gICAgZXZlbnQ6ICAgICBldmVudCxcbiAgICBkYXRhOiAgICAgIGRhdGEsXG4gIH0pO1xufTtcblxuLyoqXG4gKiBCdWlsZHMgYSBgQ0xJU29ja2V0YCBpZiB3ZSBhcmUgd2l0aGluIGEgQ0xJLXJ1biBlbnZpcm9ubWVudDsgc2hvcnQtY2lyY3VpdHNcbiAqIG90aGVyd2lzZS5cbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9uKCosIENMSVNvY2tldCl9IGRvbmUgTm9kZS1zdHlsZSBjYWxsYmFjay5cbiAqL1xuQ0xJU29ja2V0LmluaXQgPSBmdW5jdGlvbiBpbml0KGRvbmUpIHtcbiAgdmFyIGJyb3dzZXJJZCA9IFdDVC51dGlsLmdldFBhcmFtKCdjbGlfYnJvd3Nlcl9pZCcpO1xuICBpZiAoIWJyb3dzZXJJZCkgcmV0dXJuIGRvbmUoKTtcblxuICBXQ1QudXRpbC5sb2FkU2NyaXB0KFNPQ0tFVElPX0xJQlJBUlksIGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgaWYgKGVycm9yKSByZXR1cm4gZG9uZShlcnJvcik7XG5cbiAgICB2YXIgc29ja2V0ID0gaW8oU09DS0VUSU9fRU5EUE9JTlQpO1xuICAgIHNvY2tldC5vbignZXJyb3InLCBmdW5jdGlvbihlcnJvcikge1xuICAgICAgc29ja2V0Lm9mZigpO1xuICAgICAgZG9uZShlcnJvcik7XG4gICAgfSk7XG5cbiAgICBzb2NrZXQub24oJ2Nvbm5lY3QnLCBmdW5jdGlvbigpIHtcbiAgICAgIHNvY2tldC5vZmYoKTtcbiAgICAgIGRvbmUobnVsbCwgbmV3IENMSVNvY2tldChicm93c2VySWQsIHNvY2tldCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIE1pc2MgVXRpbGl0eVxuXG4vKipcbiAqIEBwYXJhbSB7IU1vY2hhLlJ1bm5hYmxlfSBydW5uYWJsZSBUaGUgdGVzdCBvciBzdWl0ZSB0byBleHRyYWN0IHRpdGxlcyBmcm9tLlxuICogQHJldHVybiB7IUFycmF5LjxzdHJpbmc+fSBUaGUgdGl0bGVzIG9mIHRoZSBydW5uYWJsZSBhbmQgaXRzIHBhcmVudHMuXG4gKi9cbmZ1bmN0aW9uIGdldFRpdGxlcyhydW5uYWJsZSkge1xuICB2YXIgdGl0bGVzID0gW107XG4gIHdoaWxlIChydW5uYWJsZSAmJiAhcnVubmFibGUucm9vdCAmJiBydW5uYWJsZS50aXRsZSkge1xuICAgIHRpdGxlcy51bnNoaWZ0KHJ1bm5hYmxlLnRpdGxlKTtcbiAgICBydW5uYWJsZSA9IHJ1bm5hYmxlLnBhcmVudDtcbiAgfVxuICByZXR1cm4gdGl0bGVzO1xufTtcblxuLyoqXG4gKiBAcGFyYW0geyFNb2NoYS5SdW5uYWJsZX0gcnVubmFibGVcbiAqIEByZXR1cm4ge3N0cmluZ31cbiAqL1xuZnVuY3Rpb24gZ2V0U3RhdGUocnVubmFibGUpIHtcbiAgaWYgKHJ1bm5hYmxlLnN0YXRlID09PSAncGFzc2VkJykge1xuICAgIHJldHVybiAncGFzc2luZyc7XG4gIH0gZWxzZSBpZiAocnVubmFibGUuc3RhdGUgPT0gJ2ZhaWxlZCcpIHtcbiAgICByZXR1cm4gJ2ZhaWxpbmcnO1xuICB9IGVsc2UgaWYgKHJ1bm5hYmxlLnBlbmRpbmcpIHtcbiAgICByZXR1cm4gJ3BlbmRpbmcnO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiAndW5rbm93bic7XG4gIH1cbn07XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuLyoqXG4gKiBBIE1vY2hhIHN1aXRlIChvciBzdWl0ZXMpIHJ1biB3aXRoaW4gYSBjaGlsZCBpZnJhbWUsIGJ1dCByZXBvcnRlZCBhcyBpZiB0aGV5XG4gKiBhcmUgcGFydCBvZiB0aGUgY3VycmVudCBjb250ZXh0LlxuICovXG5mdW5jdGlvbiBTdWJTdWl0ZSh1cmwsIHBhcmVudFNjb3BlKSB7XG4gIHRoaXMudXJsICAgICAgICAgPSB1cmwgKyAnPycgKyBNYXRoLnJhbmRvbSgpO1xuICB0aGlzLnBhcmVudFNjb3BlID0gcGFyZW50U2NvcGU7XG5cbiAgdGhpcy5zdGF0ZSA9ICdpbml0aWFsaXppbmcnO1xufVxuV0NULlN1YlN1aXRlID0gU3ViU3VpdGU7XG5cbi8vIFN1YlN1aXRlcyBnZXQgYSBwcmV0dHkgZ2VuZXJvdXMgbG9hZCB0aW1lb3V0IGJ5IGRlZmF1bHQuXG5TdWJTdWl0ZS5sb2FkVGltZW91dCA9IDUwMDA7XG5cbi8vIFdlIGNhbid0IG1haW50YWluIHByb3BlcnRpZXMgb24gaWZyYW1lIGVsZW1lbnRzIGluIEZpcmVmb3gvU2FmYXJpLz8/Pywgc28gd2Vcbi8vIHRyYWNrIHN1YlN1aXRlcyBieSBVUkwuXG5TdWJTdWl0ZS5fYnlVcmwgPSB7fTtcblxuLyoqXG4gKiBAcmV0dXJuIHtTdWJTdWl0ZX0gVGhlIGBTdWJTdWl0ZWAgdGhhdCB3YXMgcmVnaXN0ZXJlZCBmb3IgdGhpcyB3aW5kb3cuXG4gKi9cblN1YlN1aXRlLmN1cnJlbnQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIFN1YlN1aXRlLmdldCh3aW5kb3cpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7IVdpbmRvd30gdGFyZ2V0IEEgd2luZG93IHRvIGZpbmQgdGhlIFN1YlN1aXRlIG9mLlxuICogQHJldHVybiB7U3ViU3VpdGV9IFRoZSBgU3ViU3VpdGVgIHRoYXQgd2FzIHJlZ2lzdGVyZWQgZm9yIGB0YXJnZXRgLlxuICovXG5TdWJTdWl0ZS5nZXQgPSBmdW5jdGlvbih0YXJnZXQpIHtcbiAgdmFyIHN1YlN1aXRlID0gU3ViU3VpdGUuX2J5VXJsW3RhcmdldC5sb2NhdGlvbi5ocmVmXTtcbiAgaWYgKHN1YlN1aXRlIHx8IHdpbmRvdy5wYXJlbnQgPT09IHdpbmRvdykgcmV0dXJuIHN1YlN1aXRlO1xuICAvLyBPdGhlcndpc2UsIHRyYXZlcnNlLlxuICByZXR1cm4gd2luZG93LnBhcmVudC5XQ1QuU3ViU3VpdGUuZ2V0KHRhcmdldCk7XG59XG5cbi8qKlxuICogTG9hZHMgYW5kIHJ1bnMgdGhlIHN1YnN1aXRlLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRvbmUgTm9kZS1zdHlsZSBjYWxsYmFjay5cbiAqL1xuU3ViU3VpdGUucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uKGRvbmUpIHtcbiAgV0NULnV0aWwuZGVidWcoJ1N1YlN1aXRlI3J1bicsIHRoaXMudXJsKTtcbiAgdGhpcy5zdGF0ZSA9ICdsb2FkaW5nJztcbiAgdGhpcy5vblJ1bkNvbXBsZXRlID0gZG9uZTtcblxuICB0aGlzLmlmcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuICB0aGlzLmlmcmFtZS5zcmMgPSB0aGlzLnVybDtcbiAgdGhpcy5pZnJhbWUuY2xhc3NMaXN0LmFkZCgnc3Vic3VpdGUnKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmlmcmFtZSk7XG5cbiAgLy8gbGV0IHRoZSBpZnJhbWUgZXhwYW5kIHRoZSBVUkwgZm9yIHVzLlxuICB0aGlzLnVybCA9IHRoaXMuaWZyYW1lLnNyYztcbiAgU3ViU3VpdGUuX2J5VXJsW3RoaXMudXJsXSA9IHRoaXM7XG5cbiAgdGhpcy50aW1lb3V0SWQgPSBzZXRUaW1lb3V0KFxuICAgICAgdGhpcy5sb2FkZWQuYmluZCh0aGlzLCBuZXcgRXJyb3IoJ1RpbWVkIG91dCBsb2FkaW5nICcgKyB0aGlzLnVybCkpLCBTdWJTdWl0ZS5sb2FkVGltZW91dCk7XG5cbiAgdGhpcy5pZnJhbWUuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLFxuICAgICAgdGhpcy5sb2FkZWQuYmluZCh0aGlzLCBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGRvY3VtZW50ICcgKyB0aGlzLnVybCkpKTtcblxuICB0aGlzLmlmcmFtZS5jb250ZW50V2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCB0aGlzLmxvYWRlZC5iaW5kKHRoaXMsIG51bGwpKTtcbn07XG5cbi8qKlxuICogQ2FsbGVkIHdoZW4gdGhlIHN1YiBzdWl0ZSdzIGlmcmFtZSBoYXMgbG9hZGVkIChvciBlcnJvcmVkIGR1cmluZyBsb2FkKS5cbiAqXG4gKiBAcGFyYW0geyp9IGVycm9yIFRoZSBlcnJvciB0aGF0IG9jY3VyZWQsIGlmIGFueS5cbiAqL1xuU3ViU3VpdGUucHJvdG90eXBlLmxvYWRlZCA9IGZ1bmN0aW9uKGVycm9yKSB7XG4gIGlmICh0aGlzLnRpbWVvdXRJZCkge1xuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXRJZCk7XG4gIH1cbiAgaWYgKGVycm9yKSB7XG4gICAgdGhpcy5zaWduYWxSdW5Db21wbGV0ZShlcnJvcik7XG4gICAgdGhpcy5kb25lKCk7XG4gIH1cbn07XG5cbi8qKiBDYWxsZWQgd2hlbiB0aGUgc3ViIHN1aXRlJ3MgdGVzdHMgYXJlIGNvbXBsZXRlLCBzbyB0aGF0IGl0IGNhbiBjbGVhbiB1cC4gKi9cblN1YlN1aXRlLnByb3RvdHlwZS5kb25lID0gZnVuY3Rpb24gZG9uZSgpIHtcbiAgV0NULnV0aWwuZGVidWcoJ1N1YlN1aXRlI2RvbmUnLCB0aGlzLnVybCwgYXJndW1lbnRzKTtcbiAgdGhpcy5zaWduYWxSdW5Db21wbGV0ZSgpO1xuXG4gIGlmICghdGhpcy5pZnJhbWUpIHJldHVybjtcbiAgdGhpcy5pZnJhbWUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLmlmcmFtZSk7XG59O1xuXG5TdWJTdWl0ZS5wcm90b3R5cGUuc2lnbmFsUnVuQ29tcGxldGUgPSBmdW5jdGlvbiBzaWduYWxSdW5Db21wbGV0ZShlcnJvcikge1xuICBpZiAoIXRoaXMub25SdW5Db21wbGV0ZSkgcmV0dXJuO1xuICB0aGlzLnN0YXRlID0gJ2NvbXBsZXRlJztcbiAgdGhpcy5vblJ1bkNvbXBsZXRlKGVycm9yKTtcbiAgdGhpcy5vblJ1bkNvbXBsZXRlID0gbnVsbDtcbn1cblxufSkoKTtcbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuXG52YXIgYXNzZXJ0ID0gY2hhaS5hc3NlcnQ7XG52YXIgZXhwZWN0ID0gY2hhaS5leHBlY3Q7XG5cbi8vIFdlIHByZWZlciB0byBnZXQgYXMgbXVjaCBzdGFjayBpbmZvcm1hdGlvbiBhcyBwb3NzaWJsZS5cbmNoYWkuY29uZmlnLmluY2x1ZGVTdGFjayA9IHRydWU7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuLy8gcG9seW1lci10ZXN0LXRvb2xzIChhbmQgUG9seW1lci90b29scykgc3VwcG9ydCBIVE1MIHRlc3RzIHdoZXJlIGVhY2ggZmlsZSBpc1xuLy8gZXhwZWN0ZWQgdG8gY2FsbCBgZG9uZSgpYCwgd2hpY2ggcG9zdHMgYSBtZXNzYWdlIHRvIHRoZSBwYXJlbnQgd2luZG93Llxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbihldmVudCkge1xuICBpZiAoIWV2ZW50LmRhdGEgfHwgKGV2ZW50LmRhdGEgIT09ICdvaycgJiYgIWV2ZW50LmRhdGEuZXJyb3IpKSByZXR1cm47XG4gIHZhciBzdWJTdWl0ZSA9IFdDVC5TdWJTdWl0ZS5nZXQoZXZlbnQuc291cmNlKTtcbiAgaWYgKCFzdWJTdWl0ZSkgcmV0dXJuO1xuXG4gIC8vIFRoZSBuYW1lIG9mIHRoZSBzdWl0ZSBhcyBleHBvc2VkIHRvIHRoZSB1c2VyLlxuICB2YXIgcGF0aCA9IFdDVC51dGlsLnJlbGF0aXZlTG9jYXRpb24oZXZlbnQuc291cmNlLmxvY2F0aW9uKTtcblxuICB2YXIgcGFyZW50UnVubmVyID0gc3ViU3VpdGUucGFyZW50U2NvcGUuV0NULl9tdWx0aVJ1bm5lcjtcbiAgcGFyZW50UnVubmVyLmVtaXRPdXRPZkJhbmRUZXN0KHBhdGgsIGV2ZW50LmRhdGEuZXJyb3IsIHRydWUpO1xuXG4gIHN1YlN1aXRlLmRvbmUoKTtcbn0pO1xuXG4vKipcbiAqXG4gKi9cbndpbmRvdy5kb25lID0gZnVuY3Rpb24oKSB7XG4gIHBhcmVudC5wb3N0TWVzc2FnZSgnb2snLCAnKicpO1xufTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgZnVuY3Rpb24oZXJyb3IpIHtcbiAgcGFyZW50LnBvc3RNZXNzYWdlKHtlcnJvcjogZXJyb3J9LCAnKicpO1xufSk7XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cblxuLyoqXG4gKiBJdCBpcyBvZnRlbiB1c2VmdWwgdG8gdHJpZ2dlciBhIFBsYXRmb3JtLmZsdXNoLCBhbmQgcGVyZm9ybSB3b3JrIG9uIHRoZSBuZXh0XG4gKiBydW4gbG9vcCB0aWNrLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrXG4gKi9cbmZ1bmN0aW9uIGFzeW5jUGxhdGZvcm1GbHVzaChjYWxsYmFjaykge1xuICBQbGF0Zm9ybS5mbHVzaCgpO1xuICBhc3luYy5uZXh0VGljayhjYWxsYmFjayk7XG59XG5cbi8qKlxuICpcbiAqL1xuZnVuY3Rpb24gd2FpdEZvcihmbiwgbmV4dCwgaW50ZXJ2YWxPck11dGF0aW9uRWwsIHRpbWVvdXQsIHRpbWVvdXRUaW1lKSB7XG4gIHRpbWVvdXRUaW1lID0gdGltZW91dFRpbWUgfHwgRGF0ZS5ub3coKSArICh0aW1lb3V0IHx8IDEwMDApO1xuICBpbnRlcnZhbE9yTXV0YXRpb25FbCA9IGludGVydmFsT3JNdXRhdGlvbkVsIHx8IDMyO1xuICB0cnkge1xuICAgIGZuKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBpZiAoRGF0ZS5ub3coKSA+IHRpbWVvdXRUaW1lKSB7XG4gICAgICB0aHJvdyBlO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoaXNOYU4oaW50ZXJ2YWxPck11dGF0aW9uRWwpKSB7XG4gICAgICAgIGludGVydmFsT3JNdXRhdGlvbkVsLm9uTXV0YXRpb24oaW50ZXJ2YWxPck11dGF0aW9uRWwsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHdhaXRGb3IoZm4sIG5leHQsIGludGVydmFsT3JNdXRhdGlvbkVsLCB0aW1lb3V0LCB0aW1lb3V0VGltZSk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICB3YWl0Rm9yKGZuLCBuZXh0LCBpbnRlcnZhbE9yTXV0YXRpb25FbCwgdGltZW91dCwgdGltZW91dFRpbWUpO1xuICAgICAgICB9LCBpbnRlcnZhbE9yTXV0YXRpb25FbCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG4gIG5leHQoKTtcbn07XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuV0NULk11bHRpUnVubmVyID0gTXVsdGlSdW5uZXI7XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS92aXNpb25tZWRpYS9tb2NoYS9ibG9iL21hc3Rlci9saWIvcnVubmVyLmpzI0wzNi00NlxudmFyIE1PQ0hBX0VWRU5UUyA9IFtcbiAgJ3N0YXJ0JyxcbiAgJ2VuZCcsXG4gICdzdWl0ZScsXG4gICdzdWl0ZSBlbmQnLFxuICAndGVzdCcsXG4gICd0ZXN0IGVuZCcsXG4gICdob29rJyxcbiAgJ2hvb2sgZW5kJyxcbiAgJ3Bhc3MnLFxuICAnZmFpbCcsXG4gICdwZW5kaW5nJyxcbl07XG5cbi8vIFVudGlsIGEgc3VpdGUgaGFzIGxvYWRlZCwgd2UgYXNzdW1lIHRoaXMgbWFueSB0ZXN0cyBpbiBpdC5cbnZhciBFU1RJTUFURURfVEVTVFNfUEVSX1NVSVRFID0gMztcblxuLyoqXG4gKiBBIE1vY2hhLWxpa2UgcnVubmVyIHRoYXQgY29tYmluZXMgdGhlIG91dHB1dCBvZiBtdWx0aXBsZSBNb2NoYSBzdWl0ZXMuXG4gKlxuICogQHBhcmFtIHtudW1iZXJ9IG51bVN1aXRlcyBUaGUgbnVtYmVyIG9mIHN1aXRlcyB0aGF0IHdpbGwgYmUgcnVuLCBpbiBvcmRlciB0b1xuICogICAgIGVzdGltYXRlIHRoZSB0b3RhbCBudW1iZXIgb2YgdGVzdHMgdGhhdCB3aWxsIGJlIHBlcmZvcm1lZC5cbiAqIEBwYXJhbSB7IUFycmF5LjwhTW9jaGEucmVwb3J0ZXJzLkJhc2U+fSByZXBvcnRlcnMgVGhlIHNldCBvZiByZXBvcnRlcnMgdGhhdFxuICogICAgIHNob3VsZCByZWNlaXZlIHRoZSB1bmlmaWVkIGV2ZW50IHN0cmVhbS5cbiAqL1xuZnVuY3Rpb24gTXVsdGlSdW5uZXIobnVtU3VpdGVzLCByZXBvcnRlcnMpIHtcbiAgdGhpcy5yZXBvcnRlcnMgPSByZXBvcnRlcnMubWFwKGZ1bmN0aW9uKHJlcG9ydGVyKSB7XG4gICAgcmV0dXJuIG5ldyByZXBvcnRlcih0aGlzKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICB0aGlzLnRvdGFsID0gbnVtU3VpdGVzICogRVNUSU1BVEVEX1RFU1RTX1BFUl9TVUlURTtcbiAgLy8gTW9jaGEgcmVwb3J0ZXJzIGFzc3VtZSBhIHN0cmVhbSBvZiBldmVudHMsIHNvIHdlIGhhdmUgdG8gYmUgY2FyZWZ1bCB0byBvbmx5XG4gIC8vIHJlcG9ydCBvbiBvbmUgcnVubmVyIGF0IGEgdGltZS4uLlxuICB0aGlzLmN1cnJlbnRSdW5uZXIgPSBudWxsO1xuICAvLyAuLi53aGlsZSB3ZSBidWZmZXIgZXZlbnRzIGZvciBhbnkgb3RoZXIgYWN0aXZlIHJ1bm5lcnMuXG4gIHRoaXMucGVuZGluZ0V2ZW50cyA9IFtdO1xuXG4gIHRoaXMuZW1pdCgnc3RhcnQnKTtcbn1cbi8vIE1vY2hhIGRvZXNuJ3QgZXhwb3NlIGl0cyBgRXZlbnRFbWl0dGVyYCBzaGltIGRpcmVjdGx5LCBzbzpcbk11bHRpUnVubmVyLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoT2JqZWN0LmdldFByb3RvdHlwZU9mKE1vY2hhLlJ1bm5lci5wcm90b3R5cGUpKTtcblxuLyoqXG4gKiBAcmV0dXJuIHshTW9jaGEucmVwb3J0ZXJzLkJhc2V9IEEgcmVwb3J0ZXItbGlrZSBcImNsYXNzXCIgZm9yIGVhY2ggY2hpbGQgc3VpdGVcbiAqICAgICB0aGF0IHNob3VsZCBiZSBwYXNzZWQgdG8gYG1vY2hhLnJ1bmAuXG4gKi9cbk11bHRpUnVubmVyLnByb3RvdHlwZS5jaGlsZFJlcG9ydGVyID0gZnVuY3Rpb24gY2hpbGRSZXBvcnRlcihuYW1lKSB7XG4gIC8vIFRoZSByZXBvcnRlciBpcyB1c2VkIGFzIGEgY29uc3RydWN0b3IsIHNvIHdlIGNhbid0IGRlcGVuZCBvbiBgdGhpc2AgYmVpbmdcbiAgLy8gcHJvcGVybHkgYm91bmQuXG4gIHZhciBzZWxmID0gdGhpcztcbiAgcmV0dXJuIGZ1bmN0aW9uIGNoaWxkUmVwb3J0ZXIocnVubmVyKSB7XG4gICAgcnVubmVyLm5hbWUgPSBuYW1lO1xuICAgIHNlbGYuYmluZENoaWxkUnVubmVyKHJ1bm5lcik7XG4gIH07XG59O1xuXG4vKiogTXVzdCBiZSBjYWxsZWQgb25jZSBhbGwgcnVubmVycyBoYXZlIGZpbmlzaGVkLiAqL1xuTXVsdGlSdW5uZXIucHJvdG90eXBlLmRvbmUgPSBmdW5jdGlvbiBkb25lKCkge1xuICB0aGlzLmNvbXBsZXRlID0gdHJ1ZTtcbiAgdGhpcy5lbWl0KCdlbmQnKTtcbiAgdGhpcy5mbHVzaFBlbmRpbmdFdmVudHMoKTtcbn07XG5cbi8qKlxuICogRW1pdCBhIHRvcCBsZXZlbCB0ZXN0IHRoYXQgaXMgbm90IHBhcnQgb2YgYW55IHN1aXRlIG1hbmFnZWQgYnkgdGhpcyBydW5uZXIuXG4gKlxuICogSGVscGZ1bCBmb3IgcmVwb3J0aW5nIG9uIGdsb2JhbCBlcnJvcnMsIGxvYWRpbmcgaXNzdWVzLCBldGMuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHRpdGxlIFRoZSB0aXRsZSBvZiB0aGUgdGVzdC5cbiAqIEBwYXJhbSB7Kn0gb3B0X2Vycm9yIEFuIGVycm9yIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHRlc3QuIElmIGZhbHN5LCB0ZXN0IGlzXG4gKiAgICAgY29uc2lkZXJlZCB0byBiZSBwYXNzaW5nLlxuICogQHBhcmFtIHs/Ym9vbGVhbn0gb3B0X2VzdGltYXRlZCBJZiB0aGlzIHRlc3Qgd2FzIGluY2x1ZGVkIGluIHRoZSBvcmlnaW5hbFxuICogICAgIGVzdGltYXRlIG9mIGBudW1TdWl0ZXNgLlxuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUuZW1pdE91dE9mQmFuZFRlc3QgPSBmdW5jdGlvbiBlbWl0T3V0T2ZCYW5kVGVzdCh0aXRsZSwgb3B0X2Vycm9yLCBvcHRfZXN0aW1hdGVkKSB7XG4gIHZhciByb290ID0gbmV3IE1vY2hhLlN1aXRlKCk7XG4gIHZhciB0ZXN0ID0gbmV3IE1vY2hhLlRlc3QodGl0bGUsIGZ1bmN0aW9uKCkge1xuICB9KTtcbiAgdGVzdC5wYXJlbnQgPSByb290O1xuICB0ZXN0LnN0YXRlICA9IG9wdF9lcnJvciA/ICdmYWlsZWQnIDogJ3Bhc3NlZCc7XG4gIHRlc3QuZXJyICAgID0gb3B0X2Vycm9yO1xuXG4gIGlmICghb3B0X2VzdGltYXRlZCkge1xuICAgIHRoaXMudG90YWwgPSB0aGlzLnRvdGFsICsgRVNUSU1BVEVEX1RFU1RTX1BFUl9TVUlURTtcbiAgfVxuXG4gIHZhciBydW5uZXIgPSB7dG90YWw6IDF9O1xuICB0aGlzLnByb3h5RXZlbnQoJ3N0YXJ0JywgcnVubmVyKTtcbiAgdGhpcy5wcm94eUV2ZW50KCdzdWl0ZScsIHJ1bm5lciwgcm9vdCk7XG4gIHRoaXMucHJveHlFdmVudCgndGVzdCcsIHJ1bm5lciwgdGVzdCk7XG4gIGlmIChvcHRfZXJyb3IpIHtcbiAgICB0aGlzLnByb3h5RXZlbnQoJ2ZhaWwnLCBydW5uZXIsIHRlc3QsIG9wdF9lcnJvcik7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5wcm94eUV2ZW50KCdwYXNzJywgcnVubmVyLCB0ZXN0KTtcbiAgfVxuICB0aGlzLnByb3h5RXZlbnQoJ3Rlc3QgZW5kJywgcnVubmVyLCB0ZXN0KTtcbiAgdGhpcy5wcm94eUV2ZW50KCdzdWl0ZSBlbmQnLCBydW5uZXIsIHJvb3QpO1xuICB0aGlzLnByb3h5RXZlbnQoJ2VuZCcsIHJ1bm5lcik7XG59O1xuXG4vLyBJbnRlcm5hbCBJbnRlcmZhY2VcblxuLyoqIEBwYXJhbSB7IU1vY2hhLnJ1bm5lcnMuQmFzZX0gcnVubmVyIFRoZSBydW5uZXIgdG8gbGlzdGVuIHRvIGV2ZW50cyBmb3IuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUuYmluZENoaWxkUnVubmVyID0gZnVuY3Rpb24gYmluZENoaWxkUnVubmVyKHJ1bm5lcikge1xuICBNT0NIQV9FVkVOVFMuZm9yRWFjaChmdW5jdGlvbihldmVudE5hbWUpIHtcbiAgICBydW5uZXIub24oZXZlbnROYW1lLCB0aGlzLnByb3h5RXZlbnQuYmluZCh0aGlzLCBldmVudE5hbWUsIHJ1bm5lcikpO1xuICB9LmJpbmQodGhpcykpO1xufTtcblxuLyoqXG4gKiBFdmFsdWF0ZXMgYW4gZXZlbnQgZmlyZWQgYnkgYHJ1bm5lcmAsIHByb3h5aW5nIGl0IGZvcndhcmQgb3IgYnVmZmVyaW5nIGl0LlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBldmVudE5hbWVcbiAqIEBwYXJhbSB7IU1vY2hhLnJ1bm5lcnMuQmFzZX0gcnVubmVyIFRoZSBydW5uZXIgdGhhdCBlbWl0dGVkIHRoaXMgZXZlbnQuXG4gKiBAcGFyYW0gey4uLip9IHZhcl9hcmdzIEFueSBhZGRpdGlvbmFsIGRhdGEgcGFzc2VkIGFzIHBhcnQgb2YgdGhlIGV2ZW50LlxuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUucHJveHlFdmVudCA9IGZ1bmN0aW9uIHByb3h5RXZlbnQoZXZlbnROYW1lLCBydW5uZXIsIHZhcl9hcmdzKSB7XG4gIHZhciBleHRyYUFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICBpZiAodGhpcy5jb21wbGV0ZSkge1xuICAgIGNvbnNvbGUud2Fybignb3V0IG9mIG9yZGVyIE1vY2hhIGV2ZW50IGZvciAnICsgcnVubmVyLm5hbWUgKyAnOicsIGV2ZW50TmFtZSwgZXh0cmFBcmdzKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5jdXJyZW50UnVubmVyICYmIHJ1bm5lciAhPT0gdGhpcy5jdXJyZW50UnVubmVyKSB7XG4gICAgdGhpcy5wZW5kaW5nRXZlbnRzLnB1c2goYXJndW1lbnRzKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoZXZlbnROYW1lID09PSAnc3RhcnQnKSB7XG4gICAgdGhpcy5vblJ1bm5lclN0YXJ0KHJ1bm5lcik7XG4gIH0gZWxzZSBpZiAoZXZlbnROYW1lID09PSAnZW5kJykge1xuICAgIHRoaXMub25SdW5uZXJFbmQocnVubmVyKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLmVtaXQuYXBwbHkodGhpcywgW2V2ZW50TmFtZV0uY29uY2F0KGV4dHJhQXJncykpO1xuICB9XG59O1xuXG4vKiogQHBhcmFtIHshTW9jaGEucnVubmVycy5CYXNlfSBydW5uZXIgKi9cbk11bHRpUnVubmVyLnByb3RvdHlwZS5vblJ1bm5lclN0YXJ0ID0gZnVuY3Rpb24gb25SdW5uZXJTdGFydChydW5uZXIpIHtcbiAgV0NULnV0aWwuZGVidWcoJ011bHRpUnVubmVyI29uUnVubmVyU3RhcnQ6JywgcnVubmVyLm5hbWUpO1xuICB0aGlzLnRvdGFsID0gdGhpcy50b3RhbCAtIEVTVElNQVRFRF9URVNUU19QRVJfU1VJVEUgKyBydW5uZXIudG90YWw7XG4gIHRoaXMuY3VycmVudFJ1bm5lciA9IHJ1bm5lcjtcbn07XG5cbi8qKiBAcGFyYW0geyFNb2NoYS5ydW5uZXJzLkJhc2V9IHJ1bm5lciAqL1xuTXVsdGlSdW5uZXIucHJvdG90eXBlLm9uUnVubmVyRW5kID0gZnVuY3Rpb24gb25SdW5uZXJFbmQocnVubmVyKSB7XG4gIFdDVC51dGlsLmRlYnVnKCdNdWx0aVJ1bm5lciNvblJ1bm5lckVuZDonLCBydW5uZXIubmFtZSk7XG4gIHRoaXMuY3VycmVudFJ1bm5lciA9IG51bGw7XG4gIHRoaXMuZmx1c2hQZW5kaW5nRXZlbnRzKCk7XG59O1xuXG4vKipcbiAqIEZsdXNoZXMgYW55IGJ1ZmZlcmVkIGV2ZW50cyBhbmQgcnVucyB0aGVtIHRocm91Z2ggYHByb3h5RXZlbnRgLiBUaGlzIHdpbGxcbiAqIGxvb3AgdW50aWwgYWxsIGJ1ZmZlcmVkIHJ1bm5lcnMgYXJlIGNvbXBsZXRlLCBvciB3ZSBoYXZlIHJ1biBvdXQgb2YgYnVmZmVyZWRcbiAqIGV2ZW50cy5cbiAqL1xuTXVsdGlSdW5uZXIucHJvdG90eXBlLmZsdXNoUGVuZGluZ0V2ZW50cyA9IGZ1bmN0aW9uIGZsdXNoUGVuZGluZ0V2ZW50cygpIHtcbiAgdmFyIGV2ZW50cyA9IHRoaXMucGVuZGluZ0V2ZW50cztcbiAgdGhpcy5wZW5kaW5nRXZlbnRzID0gW107XG4gIGV2ZW50cy5mb3JFYWNoKGZ1bmN0aW9uKGV2ZW50QXJncykge1xuICAgIHRoaXMucHJveHlFdmVudC5hcHBseSh0aGlzLCBldmVudEFyZ3MpO1xuICB9LmJpbmQodGhpcykpO1xufTtcblxufSkoKTtcbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuLyoqXG4gKiBAZmlsZW92ZXJ2aWV3XG4gKlxuICogUnVucyBhbGwgdGVzdHMgZGVzY3JpYmVkIGJ5IHRoaXMgZG9jdW1lbnQsIGFmdGVyIGdpdmluZyB0aGUgZG9jdW1lbnQgYSBjaGFuY2VcbiAqIHRvIGxvYWQuXG4gKlxuICogSWYgYFdDVC53YWl0Rm9yRnJhbWV3b3Jrc2AgaXMgdHJ1ZSAodGhlIGRlZmF1bHQpLCB3ZSB3aWxsIGFsc28gd2FpdCBmb3IgYW55XG4gKiBwcmVzZW50IHdlYiBjb21wb25lbnQgZnJhbWV3b3JrcyB0byBoYXZlIGZ1bGx5IGluaXRpYWxpemVkIGFzIHdlbGwuXG4gKi9cbihmdW5jdGlvbigpIHtcblxuLy8gR2l2ZSBhbnkgc2NyaXB0cyBvbiB0aGUgcGFnZSBhIGNoYW5jZSB0byB0d2lkZGxlIHRoZSBlbnZpcm9ubWVudC5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBmdW5jdGlvbigpIHtcbiAgV0NULnV0aWwuZGVidWcoJ3J1biBzdGFnZTogRE9NQ29udGVudExvYWRlZCcpO1xuICB2YXIgc3ViU3VpdGUgPSBXQ1QuU3ViU3VpdGUuY3VycmVudCgpO1xuICBpZiAoc3ViU3VpdGUpIHtcbiAgICBXQ1QudXRpbC5kZWJ1ZygncnVuIHN0YWdlOiBzdWJzdWl0ZScpO1xuICAgIC8vIEdpdmUgdGhlIHN1YnN1aXRlIHRpbWUgdG8gY29tcGxldGUgaXRzIGxvYWQgKHNlZSBgU3ViU3VpdGUubG9hZGApLlxuICAgIGFzeW5jLm5leHRUaWNrKHJ1blN1YlN1aXRlLmJpbmQobnVsbCwgc3ViU3VpdGUpKTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBCZWZvcmUgYW55dGhpbmcgZWxzZSwgd2UgbmVlZCB0byBlbnN1cmUgb3VyIGNvbW11bmljYXRpb24gY2hhbm5lbCB3aXRoIHRoZVxuICAvLyBDTEkgcnVubmVyIGlzIGVzdGFibGlzaGVkIChpZiB3ZSdyZSBydW5uaW5nIGluIHRoYXQgY29udGV4dCkuIExlc3NcbiAgLy8gYnVmZmVyaW5nIHRvIGRlYWwgd2l0aC5cbiAgV0NULkNMSVNvY2tldC5pbml0KGZ1bmN0aW9uKGVycm9yLCBzb2NrZXQpIHtcbiAgICBXQ1QudXRpbC5kZWJ1ZygncnVuIHN0YWdlOiBXQ1QuQ0xJU29ja2V0LmluaXQgZG9uZScsIGVycm9yKTtcbiAgICBpZiAoZXJyb3IpIHRocm93IGVycm9yO1xuXG4gICAgbG9hZERlcGVuZGVuY2llcyhmdW5jdGlvbihlcnJvcikge1xuICAgICAgV0NULnV0aWwuZGVidWcoJ3J1biBzdGFnZTogbG9hZERlcGVuZGVuY2llcyBkb25lJywgZXJyb3IpO1xuICAgICAgaWYgKGVycm9yKSB0aHJvdyBlcnJvcjtcblxuICAgICAgcnVuTXVsdGlTdWl0ZShkZXRlcm1pbmVSZXBvcnRlcnMoc29ja2V0KSk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG5cbi8qKlxuICogTG9hZHMgYW55IGRlcGVuZGVuY2llcyBvZiB0aGUgX2N1cnJlbnRfIHN1aXRlIChlLmcuIGAuanNgIHNvdXJjZXMpLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRvbmUgQSBub2RlIHN0eWxlIGNhbGxiYWNrLlxuICovXG5mdW5jdGlvbiBsb2FkRGVwZW5kZW5jaWVzKGRvbmUpIHtcbiAgV0NULnV0aWwuZGVidWcoJ2xvYWREZXBlbmRlbmNpZXM6JywgV0NULl9kZXBlbmRlbmNpZXMpO1xuICB2YXIgbG9hZGVycyA9IFdDVC5fZGVwZW5kZW5jaWVzLm1hcChmdW5jdGlvbihmaWxlKSB7XG4gICAgLy8gV2Ugb25seSBzdXBwb3J0IGAuanNgIGRlcGVuZGVuY2llcyBmb3Igbm93LlxuICAgIHJldHVybiBXQ1QudXRpbC5sb2FkU2NyaXB0LmJpbmQoV0NULnV0aWwsIGZpbGUpO1xuICB9KTtcblxuICBhc3luYy5wYXJhbGxlbChsb2FkZXJzLCBkb25lKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0geyFXQ1QuU3ViU3VpdGV9IHN1YlN1aXRlIFRoZSBgU3ViU3VpdGVgIGZvciB0aGlzIGZyYW1lLCB0aGF0IGBtb2NoYWBcbiAqICAgICBzaG91bGQgYmUgcnVuIGZvci5cbiAqL1xuZnVuY3Rpb24gcnVuU3ViU3VpdGUoc3ViU3VpdGUpIHtcbiAgV0NULnV0aWwuZGVidWcoJ3J1blN1YlN1aXRlJywgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lKTtcbiAgLy8gTm90IHZlcnkgcHJldHR5LlxuICB2YXIgcGFyZW50V0NUID0gc3ViU3VpdGUucGFyZW50U2NvcGUuV0NUO1xuICB2YXIgc3VpdGVOYW1lID0gcGFyZW50V0NULnV0aWwucmVsYXRpdmVMb2NhdGlvbih3aW5kb3cubG9jYXRpb24pO1xuICB2YXIgcmVwb3J0ZXIgID0gcGFyZW50V0NULl9tdWx0aVJ1bm5lci5jaGlsZFJlcG9ydGVyKHN1aXRlTmFtZSk7XG4gIHJ1bk1vY2hhKHJlcG9ydGVyLCBzdWJTdWl0ZS5kb25lLmJpbmQoc3ViU3VpdGUpKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0geyFBcnJheS48IU1vY2hhLnJlcG9ydGVycy5CYXNlPn0gcmVwb3J0ZXJzIFRoZSByZXBvcnRlcnMgdGhhdCBzaG91bGRcbiAqICAgICBjb25zdW1lIHRoZSBvdXRwdXQgb2YgdGhpcyBgTXVsdGlSdW5uZXJgLlxuICovXG5mdW5jdGlvbiBydW5NdWx0aVN1aXRlKHJlcG9ydGVycykge1xuICBXQ1QudXRpbC5kZWJ1ZygncnVuTXVsdGlTdWl0ZScsIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSk7XG4gIHZhciByb290TmFtZSA9IFdDVC51dGlsLnJlbGF0aXZlTG9jYXRpb24od2luZG93LmxvY2F0aW9uKTtcbiAgdmFyIHJ1bm5lciAgID0gbmV3IFdDVC5NdWx0aVJ1bm5lcihXQ1QuX3N1aXRlc1RvTG9hZC5sZW5ndGggKyAxLCByZXBvcnRlcnMpO1xuICBXQ1QuX211bHRpUnVubmVyID0gcnVubmVyO1xuXG5cbiAgdmFyIHN1aXRlUnVubmVycyA9IFtcbiAgICAvLyBSdW4gdGhlIGxvY2FsIHRlc3RzIChpZiBhbnkpIGZpcnN0LCBub3Qgc3RvcHBpbmcgb24gZXJyb3I7XG4gICAgcnVuTW9jaGEuYmluZChudWxsLCBydW5uZXIuY2hpbGRSZXBvcnRlcihyb290TmFtZSkpLFxuICBdO1xuXG4gIC8vIEFzIHdlbGwgYXMgYW55IHN1YiBzdWl0ZXMuIEFnYWluLCBkb24ndCBzdG9wIG9uIGVycm9yLlxuICBXQ1QuX3N1aXRlc1RvTG9hZC5mb3JFYWNoKGZ1bmN0aW9uKGZpbGUpIHtcbiAgICBzdWl0ZVJ1bm5lcnMucHVzaChmdW5jdGlvbihuZXh0KSB7XG4gICAgICB2YXIgc3ViU3VpdGUgPSBuZXcgV0NULlN1YlN1aXRlKGZpbGUsIHdpbmRvdyk7XG4gICAgICBzdWJTdWl0ZS5ydW4oZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yKSBydW5uZXIuZW1pdE91dE9mQmFuZFRlc3QodGl0bGUsIGVycm9yKTtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGFzeW5jLnBhcmFsbGVsTGltaXQoc3VpdGVSdW5uZXJzLCBXQ1QubnVtQ29uY3VycmVudFN1aXRlcywgZnVuY3Rpb24oZXJyb3IpIHtcbiAgICBXQ1QudXRpbC5kZWJ1ZygncnVuTXVsdGlTdWl0ZSBkb25lJywgZXJyb3IpO1xuICAgIHJ1bm5lci5kb25lKCk7XG4gIH0pO1xufVxuXG4vKipcbiAqIEtpY2tzIG9mZiBhIG1vY2hhIHJ1biwgd2FpdGluZyBmb3IgZnJhbWV3b3JrcyB0byBsb2FkIGlmIG5lY2Vzc2FyeS5cbiAqXG4gKiBAcGFyYW0geyFNb2NoYS5yZXBvcnRlcnMuQmFzZX0gcmVwb3J0ZXIgVGhlIHJlcG9ydGVyIHRvIHBhc3MgdG8gYG1vY2hhLnJ1bmAuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBkb25lIEEgY2FsbGJhY2sgZmlyZWQsIF9ubyBlcnJvciBpcyBwYXNzZWRfLlxuICovXG5mdW5jdGlvbiBydW5Nb2NoYShyZXBvcnRlciwgZG9uZSwgd2FpdGVkKSB7XG4gIGlmIChXQ1Qud2FpdEZvckZyYW1ld29ya3MgJiYgIXdhaXRlZCkge1xuICAgIFdDVC51dGlsLndoZW5GcmFtZXdvcmtzUmVhZHkocnVuTW9jaGEuYmluZChudWxsLCByZXBvcnRlciwgZG9uZSwgdHJ1ZSkpO1xuICAgIHJldHVybjtcbiAgfVxuICBXQ1QudXRpbC5kZWJ1ZygncnVuTW9jaGEnLCB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUpO1xuXG4gIG1vY2hhLnJlcG9ydGVyKHJlcG9ydGVyKTtcbiAgbW9jaGEucnVuKGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgZG9uZSgpOyAgLy8gV2UgaWdub3JlIHRoZSBNb2NoYSBmYWlsdXJlIGNvdW50LlxuICB9KTtcbn1cblxuLyoqXG4gKiBGaWd1cmUgb3V0IHdoaWNoIHJlcG9ydGVycyBzaG91bGQgYmUgdXNlZCBmb3IgdGhlIGN1cnJlbnQgYHdpbmRvd2AuXG4gKlxuICogQHBhcmFtIHtXQ1QuQ0xJU29ja2V0fSBzb2NrZXQgVGhlIENMSSBzb2NrZXQsIGlmIHByZXNlbnQuXG4gKi9cbmZ1bmN0aW9uIGRldGVybWluZVJlcG9ydGVycyhzb2NrZXQpIHtcbiAgdmFyIHJlcG9ydGVycyA9IFtcbiAgICBXQ1QucmVwb3J0ZXJzLlRpdGxlLFxuICAgIFdDVC5yZXBvcnRlcnMuQ29uc29sZSxcbiAgXTtcblxuICBpZiAoc29ja2V0KSB7XG4gICAgcmVwb3J0ZXJzLnB1c2goZnVuY3Rpb24ocnVubmVyKSB7XG4gICAgICBzb2NrZXQub2JzZXJ2ZShydW5uZXIpO1xuICAgIH0pO1xuICB9XG5cbiAgaWYgKFdDVC5fc3VpdGVzVG9Mb2FkLmxlbmd0aCA+IDApIHtcbiAgICByZXBvcnRlcnMucHVzaChXQ1QucmVwb3J0ZXJzLkhUTUwpO1xuICB9XG5cbiAgcmV0dXJuIHJlcG9ydGVycztcbn1cblxufSkoKTtcbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuLyoqXG4gKiBAZmlsZW92ZXJ2aWV3XG4gKlxuICogUHJvdmlkZXMgYXV0b21hdGljIGNvbmZpZ3VyYXRpb24gb2YgTW9jaGEgYnkgc3R1YmJpbmcgb3V0IHBvdGVudGlhbCBNb2NoYVxuICogbWV0aG9kcywgYW5kIGNvbmZpZ3VyaW5nIE1vY2hhIGFwcHJvcHJpYXRlbHkgb25jZSB5b3UgY2FsbCB0aGVtLlxuICpcbiAqIEp1c3QgY2FsbCBgc3VpdGVgLCBgZGVzY3JpYmVgLCBldGMgbm9ybWFsbHksIGFuZCBldmVyeXRoaW5nIHNob3VsZCBKdXN0IFdvcmsuXG4gKi9cbihmdW5jdGlvbigpIHtcblxuLy8gTW9jaGEgZ2xvYmFsIGhlbHBlcnMsIGJyb2tlbiBvdXQgYnkgdGVzdGluZyBtZXRob2QuXG52YXIgTU9DSEFfRVhQT1JUUyA9IHtcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3Zpc2lvbm1lZGlhL21vY2hhL2Jsb2IvbWFzdGVyL2xpYi9pbnRlcmZhY2VzL3RkZC5qc1xuICB0ZGQ6IFtcbiAgICAnc2V0dXAnLFxuICAgICd0ZWFyZG93bicsXG4gICAgJ3N1aXRlU2V0dXAnLFxuICAgICdzdWl0ZVRlYXJkb3duJyxcbiAgICAnc3VpdGUnLFxuICAgICd0ZXN0JyxcbiAgXSxcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3Zpc2lvbm1lZGlhL21vY2hhL2Jsb2IvbWFzdGVyL2xpYi9pbnRlcmZhY2VzL3RkZC5qc1xuICBiZGQ6IFtcbiAgICAnYmVmb3JlJyxcbiAgICAnYWZ0ZXInLFxuICAgICdiZWZvcmVFYWNoJyxcbiAgICAnYWZ0ZXJFYWNoJyxcbiAgICAnZGVzY3JpYmUnLFxuICAgICd4ZGVzY3JpYmUnLFxuICAgICd4Y29udGV4dCcsXG4gICAgJ2l0JyxcbiAgICAneGl0JyxcbiAgICAneHNwZWNpZnknLFxuICBdLFxufTtcblxuLy8gV2UgZXhwb3NlIGFsbCBNb2NoYSBtZXRob2RzIHVwIGZyb250LCBjb25maWd1cmluZyBhbmQgcnVubmluZyBtb2NoYVxuLy8gYXV0b21hdGljYWxseSB3aGVuIHlvdSBjYWxsIHRoZW0uXG4vL1xuLy8gVGhlIGFzc3VtcHRpb24gaXMgdGhhdCBpdCBpcyBhIG9uZS1vZmYgKHN1Yi0pc3VpdGUgb2YgdGVzdHMgYmVpbmcgcnVuLlxuT2JqZWN0LmtleXMoTU9DSEFfRVhQT1JUUykuZm9yRWFjaChmdW5jdGlvbih1aSkge1xuICBNT0NIQV9FWFBPUlRTW3VpXS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIHdpbmRvd1trZXldID0gZnVuY3Rpb24gd3JhcHBlZE1vY2hhRnVuY3Rpb24oKSB7XG4gICAgICBXQ1Quc2V0dXBNb2NoYSh1aSk7XG4gICAgICBpZiAoIXdpbmRvd1trZXldIHx8IHdpbmRvd1trZXldID09PSB3cmFwcGVkTW9jaGFGdW5jdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIG1vY2hhLnNldHVwIHRvIGRlZmluZSAnICsga2V5KTtcbiAgICAgIH1cbiAgICAgIHdpbmRvd1trZXldLmFwcGx5KHdpbmRvdywgYXJndW1lbnRzKTtcbiAgICB9XG4gIH0pO1xufSk7XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IHVpIFNldHMgdXAgbW9jaGEgdG8gcnVuIGB1aWAtc3R5bGUgdGVzdHMuXG4gKi9cbldDVC5zZXR1cE1vY2hhID0gZnVuY3Rpb24gc2V0dXBNb2NoYSh1aSkge1xuICBpZiAoV0NULl9tb2NoYVVJICYmIFdDVC5fbW9jaGFVSSA9PT0gdWkpIHJldHVybjtcbiAgaWYgKFdDVC5fbW9jaGFVSSAmJiBXQ1QuX21vY2hhVUkgIT09IHVpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNaXhpbmcgJyArIFdDVC5fbW9jaGFVSSArICcgYW5kICcgKyB1aSArICcgTW9jaGEgc3R5bGVzIGlzIG5vdCBzdXBwb3J0ZWQuJyk7XG4gIH1cbiAgbW9jaGEuc2V0dXAoe3VpOiB1aX0pOyAgLy8gTm90ZSB0aGF0IHRoZSByZXBvcnRlciBpcyBjb25maWd1cmVkIGluIHJ1bi5qcy5cbiAgV0NULm1vY2hhSXNTZXR1cCA9IHRydWU7XG59XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuV0NULnJlcG9ydGVycy5Db25zb2xlID0gQ29uc29sZTtcblxuLy8gV2UgY2FwdHVyZSBjb25zb2xlIGV2ZW50cyB3aGVuIHJ1bm5pbmcgdGVzdHM7IHNvIG1ha2Ugc3VyZSB3ZSBoYXZlIGFcbi8vIHJlZmVyZW5jZSB0byB0aGUgb3JpZ2luYWwgb25lLlxudmFyIGNvbnNvbGUgPSB3aW5kb3cuY29uc29sZTtcblxudmFyIEZPTlQgPSAnO2ZvbnQ6IG5vcm1hbCAxM3B4IFwiUm9ib3RvXCIsIFwiSGVsdmV0aWNhIE5ldWVcIiwgXCJIZWx2ZXRpY2FcIiwgc2Fucy1zZXJpZjsnXG52YXIgU1RZTEVTID0ge1xuICBwbGFpbjogICBGT05ULFxuICBzdWl0ZTogICAnY29sb3I6ICM1YzZiYzAnICsgRk9OVCxcbiAgdGVzdDogICAgRk9OVCxcbiAgcGFzc2luZzogJ2NvbG9yOiAjMjU5YjI0JyArIEZPTlQsXG4gIHBlbmRpbmc6ICdjb2xvcjogI2U2NTEwMCcgKyBGT05ULFxuICBmYWlsaW5nOiAnY29sb3I6ICNjNDE0MTEnICsgRk9OVCxcbiAgc3RhY2s6ICAgJ2NvbG9yOiAjYzQxNDExJyxcbiAgcmVzdWx0czogRk9OVCArICdmb250LXNpemU6IDE2cHgnLFxufVxuXG4vLyBJIGRvbid0IHRoaW5rIHdlIGNhbiBmZWF0dXJlIGRldGVjdCB0aGlzIG9uZS4uLlxudmFyIHVzZXJBZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKTtcbnZhciBDQU5fU1RZTEVfTE9HICAgPSB1c2VyQWdlbnQubWF0Y2goJ2ZpcmVmb3gnKSB8fCB1c2VyQWdlbnQubWF0Y2goJ3dlYmtpdCcpO1xudmFyIENBTl9TVFlMRV9HUk9VUCA9IHVzZXJBZ2VudC5tYXRjaCgnd2Via2l0Jyk7XG4vLyBUcmFjayB0aGUgaW5kZW50IGZvciBmYWtlZCBgY29uc29sZS5ncm91cGBcbnZhciBsb2dJbmRlbnQgPSAnJztcblxuZnVuY3Rpb24gbG9nKHRleHQsIHN0eWxlKSB7XG4gIHRleHQgPSB0ZXh0LnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obCkgeyByZXR1cm4gbG9nSW5kZW50ICsgbDsgfSkuam9pbignXFxuJyk7XG4gIGlmIChDQU5fU1RZTEVfTE9HKSB7XG4gICAgY29uc29sZS5sb2coJyVjJyArIHRleHQsIFNUWUxFU1tzdHlsZV0gfHwgU1RZTEVTLnBsYWluKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zb2xlLmxvZyh0ZXh0KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBsb2dHcm91cCh0ZXh0LCBzdHlsZSkge1xuICBpZiAoQ0FOX1NUWUxFX0dST1VQKSB7XG4gICAgY29uc29sZS5ncm91cCgnJWMnICsgdGV4dCwgU1RZTEVTW3N0eWxlXSB8fCBTVFlMRVMucGxhaW4pO1xuICB9IGVsc2UgaWYgKGNvbnNvbGUuZ3JvdXApIHtcbiAgICBjb25zb2xlLmdyb3VwKHRleHQpO1xuICB9IGVsc2Uge1xuICAgIGxvZ0luZGVudCA9IGxvZ0luZGVudCArICcgICc7XG4gICAgbG9nKHRleHQsIHN0eWxlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBsb2dHcm91cEVuZCgpIHtcbiAgaWYgKGNvbnNvbGUuZ3JvdXBFbmQpIHtcbiAgICBjb25zb2xlLmdyb3VwRW5kKCk7XG4gIH0gZWxzZSB7XG4gICAgbG9nSW5kZW50ID0gbG9nSW5kZW50LnN1YnN0cigwLCBsb2dJbmRlbnQubGVuZ3RoIC0gMik7XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9nRXhjZXB0aW9uKGVycm9yKSB7XG4gIGlmIChjb25zb2xlLmV4Y2VwdGlvbikge1xuICAgIGNvbnNvbGUuZXhjZXB0aW9uKGVycm9yKTtcbiAgfSBlbHNlIHtcbiAgICBsb2coZXJyb3Iuc3RhY2sgfHwgZXJyb3IubWVzc2FnZSB8fCBlcnJvciwgJ3N0YWNrJyk7XG4gIH1cbn1cblxuLyoqXG4gKiBBIE1vY2hhIHJlcG9ydGVyIHRoYXQgbG9ncyByZXN1bHRzIG91dCB0byB0aGUgd2ViIGBjb25zb2xlYC5cbiAqXG4gKiBAcGFyYW0geyFNb2NoYS5SdW5uZXJ9IHJ1bm5lciBUaGUgcnVubmVyIHRoYXQgaXMgYmVpbmcgcmVwb3J0ZWQgb24uXG4gKi9cbmZ1bmN0aW9uIENvbnNvbGUocnVubmVyKSB7XG4gIE1vY2hhLnJlcG9ydGVycy5CYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICBydW5uZXIub24oJ3N1aXRlJywgZnVuY3Rpb24oc3VpdGUpIHtcbiAgICBpZiAoc3VpdGUucm9vdCkgcmV0dXJuO1xuICAgIGxvZ0dyb3VwKHN1aXRlLnRpdGxlLCAnc3VpdGUnKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ3N1aXRlIGVuZCcsIGZ1bmN0aW9uKHN1aXRlKSB7XG4gICAgaWYgKHN1aXRlLnJvb3QpIHJldHVybjtcbiAgICBsb2dHcm91cEVuZCgpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIHJ1bm5lci5vbigndGVzdCcsIGZ1bmN0aW9uKHRlc3QpIHtcbiAgICBsb2dHcm91cCh0ZXN0LnRpdGxlLCAndGVzdCcpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIHJ1bm5lci5vbigncGVuZGluZycsIGZ1bmN0aW9uKHRlc3QpIHtcbiAgICBsb2dHcm91cCh0ZXN0LnRpdGxlLCAncGVuZGluZycpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycm9yKSB7XG4gICAgbG9nRXhjZXB0aW9uKGVycm9yKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24odGVzdCkge1xuICAgIGxvZ0dyb3VwRW5kKCk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCB0aGlzLmxvZ1N1bW1hcnkuYmluZCh0aGlzKSk7XG59O1xuQ29uc29sZS5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKE1vY2hhLnJlcG9ydGVycy5CYXNlLnByb3RvdHlwZSk7XG5cbi8qKiBQcmludHMgb3V0IGEgZmluYWwgc3VtbWFyeSBvZiB0ZXN0IHJlc3VsdHMuICovXG5Db25zb2xlLnByb3RvdHlwZS5sb2dTdW1tYXJ5ID0gZnVuY3Rpb24gbG9nU3VtbWFyeSgpIHtcbiAgbG9nR3JvdXAoJ1Rlc3QgUmVzdWx0cycsICdyZXN1bHRzJyk7XG5cbiAgaWYgKHRoaXMuc3RhdHMuZmFpbHVyZXMgPiAwKSB7XG4gICAgbG9nKFdDVC51dGlsLnBsdXJhbGl6ZWRTdGF0KHRoaXMuc3RhdHMuZmFpbHVyZXMsICdmYWlsaW5nJyksICdmYWlsaW5nJyk7XG4gIH1cbiAgaWYgKHRoaXMuc3RhdHMucGVuZGluZyA+IDApIHtcbiAgICBsb2coV0NULnV0aWwucGx1cmFsaXplZFN0YXQodGhpcy5zdGF0cy5wZW5kaW5nLCAncGVuZGluZycpLCAncGVuZGluZycpO1xuICB9XG4gIGxvZyhXQ1QudXRpbC5wbHVyYWxpemVkU3RhdCh0aGlzLnN0YXRzLnBhc3NlcywgJ3Bhc3NpbmcnKSk7XG5cbiAgaWYgKCF0aGlzLnN0YXRzLmZhaWx1cmVzKSB7XG4gICAgbG9nKCd0ZXN0IHN1aXRlIHBhc3NlZCcsICdwYXNzaW5nJyk7XG4gIH1cbiAgbG9nKCdFdmFsdWF0ZWQgJyArIHRoaXMuc3RhdHMudGVzdHMgKyAnIHRlc3RzIGluICcgKyB0aGlzLnN0YXRzLmR1cmF0aW9uICsgJ21zLicpO1xuICBsb2dHcm91cEVuZCgpO1xufTtcblxufSkoKTtcbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuKGZ1bmN0aW9uKCkge1xuXG5XQ1QucmVwb3J0ZXJzLkhUTUwgPSBIVE1MO1xuXG4vKipcbiAqIFdDVC1zcGVjaWZpYyBiZWhhdmlvciBvbiB0b3Agb2YgTW9jaGEncyBkZWZhdWx0IEhUTUwgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHshTW9jaGEuUnVubmVyfSBydW5uZXIgVGhlIHJ1bm5lciB0aGF0IGlzIGJlaW5nIHJlcG9ydGVkIG9uLlxuICovXG5mdW5jdGlvbiBIVE1MKHJ1bm5lcikge1xuICB2YXIgb3V0cHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIG91dHB1dC5pZCA9ICdtb2NoYSc7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3V0cHV0KTtcblxuICBydW5uZXIub24oJ3N1aXRlJywgZnVuY3Rpb24odGVzdCkge1xuICAgIHRoaXMudG90YWwgPSBydW5uZXIudG90YWw7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgTW9jaGEucmVwb3J0ZXJzLkhUTUwuY2FsbCh0aGlzLCBydW5uZXIpO1xufTtcbkhUTUwucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShNb2NoYS5yZXBvcnRlcnMuSFRNTC5wcm90b3R5cGUpO1xuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbldDVC5yZXBvcnRlcnMuVGl0bGUgPSBUaXRsZTtcblxudmFyIEFSQ19PRkZTRVQgPSAwOyAvLyBzdGFydCBhdCB0aGUgcmlnaHQuXG52YXIgQVJDX1dJRFRIICA9IDY7XG5cbi8qKlxuICogQSBNb2NoYSByZXBvcnRlciB0aGF0IHVwZGF0ZXMgdGhlIGRvY3VtZW50J3MgdGl0bGUgYW5kIGZhdmljb24gd2l0aFxuICogYXQtYS1nbGFuY2Ugc3RhdHMuXG4gKlxuICogQHBhcmFtIHshTW9jaGEuUnVubmVyfSBydW5uZXIgVGhlIHJ1bm5lciB0aGF0IGlzIGJlaW5nIHJlcG9ydGVkIG9uLlxuICovXG5mdW5jdGlvbiBUaXRsZShydW5uZXIpIHtcbiAgTW9jaGEucmVwb3J0ZXJzLkJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHJ1bm5lci5vbigndGVzdCBlbmQnLCB0aGlzLnJlcG9ydC5iaW5kKHRoaXMpKTtcbn1cblxuLyoqIFJlcG9ydHMgY3VycmVudCBzdGF0cyB2aWEgdGhlIHBhZ2UgdGl0bGUgYW5kIGZhdmljb24uICovXG5UaXRsZS5wcm90b3R5cGUucmVwb3J0ID0gZnVuY3Rpb24gcmVwb3J0KCkge1xuICB0aGlzLnVwZGF0ZVRpdGxlKCk7XG4gIHRoaXMudXBkYXRlRmF2aWNvbigpO1xufTtcblxuLyoqIFVwZGF0ZXMgdGhlIGRvY3VtZW50IHRpdGxlIHdpdGggYSBzdW1tYXJ5IG9mIGN1cnJlbnQgc3RhdHMuICovXG5UaXRsZS5wcm90b3R5cGUudXBkYXRlVGl0bGUgPSBmdW5jdGlvbiB1cGRhdGVUaXRsZSgpIHtcbiAgaWYgKHRoaXMuc3RhdHMuZmFpbHVyZXMgPiAwKSB7XG4gICAgZG9jdW1lbnQudGl0bGUgPSBXQ1QudXRpbC5wbHVyYWxpemVkU3RhdCh0aGlzLnN0YXRzLmZhaWx1cmVzLCAnZmFpbGluZycpO1xuICB9IGVsc2Uge1xuICAgIGRvY3VtZW50LnRpdGxlID0gV0NULnV0aWwucGx1cmFsaXplZFN0YXQodGhpcy5zdGF0cy5wYXNzZXMsICdwYXNzaW5nJyk7XG4gIH1cbn07XG5cbi8qKlxuICogRHJhd3MgYW4gYXJjIGZvciB0aGUgZmF2aWNvbiBzdGF0dXMsIHJlbGF0aXZlIHRvIHRoZSB0b3RhbCBudW1iZXIgb2YgdGVzdHMuXG4gKlxuICogQHBhcmFtIHshQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEfSBjb250ZXh0XG4gKiBAcGFyYW0ge251bWJlcn0gdG90YWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBzdGFydFxuICogQHBhcmFtIHtudW1iZXJ9IGxlbmd0aFxuICogQHBhcmFtIHtzdHJpbmd9IGNvbG9yXG4gKi9cbmZ1bmN0aW9uIGRyYXdGYXZpY29uQXJjKGNvbnRleHQsIHRvdGFsLCBzdGFydCwgbGVuZ3RoLCBjb2xvcikge1xuICB2YXIgYXJjU3RhcnQgPSBBUkNfT0ZGU0VUICsgTWF0aC5QSSAqIDIgKiAoc3RhcnQgLyB0b3RhbCk7XG4gIHZhciBhcmNFbmQgICA9IEFSQ19PRkZTRVQgKyBNYXRoLlBJICogMiAqICgoc3RhcnQgKyBsZW5ndGgpIC8gdG90YWwpO1xuXG4gIGNvbnRleHQuYmVnaW5QYXRoKCk7XG4gIGNvbnRleHQuc3Ryb2tlU3R5bGUgPSBjb2xvcjtcbiAgY29udGV4dC5saW5lV2lkdGggICA9IEFSQ19XSURUSDtcbiAgY29udGV4dC5hcmMoMTYsIDE2LCAxNiAtIEFSQ19XSURUSCAvIDIsIGFyY1N0YXJ0LCBhcmNFbmQpO1xuICBjb250ZXh0LnN0cm9rZSgpO1xufTtcblxuLyoqIFVwZGF0ZXMgdGhlIGRvY3VtZW50J3MgZmF2aWNvbiB3LyBhIHN1bW1hcnkgb2YgY3VycmVudCBzdGF0cy4gKi9cblRpdGxlLnByb3RvdHlwZS51cGRhdGVGYXZpY29uID0gZnVuY3Rpb24gdXBkYXRlRmF2aWNvbigpIHtcbiAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuICBjYW52YXMuaGVpZ2h0ID0gY2FudmFzLndpZHRoID0gMzI7XG4gIHZhciBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cbiAgdmFyIHBhc3NpbmcgPSB0aGlzLnN0YXRzLnBhc3NlcztcbiAgdmFyIHBlbmRpbmcgPSB0aGlzLnN0YXRzLnBlbmRpbmc7XG4gIHZhciBmYWlsaW5nID0gdGhpcy5zdGF0cy5mYWlsdXJlcztcbiAgdmFyIHRvdGFsICAgPSBNYXRoLm1heCh0aGlzLnJ1bm5lci50b3RhbCwgcGFzc2luZyArIHBlbmRpbmcgKyBmYWlsaW5nKTtcbiAgZHJhd0Zhdmljb25BcmMoY29udGV4dCwgdG90YWwsIDAsICAgICAgICAgICAgICAgICBwYXNzaW5nLCAnIzBlOWM1NycpO1xuICBkcmF3RmF2aWNvbkFyYyhjb250ZXh0LCB0b3RhbCwgcGFzc2luZywgICAgICAgICAgIHBlbmRpbmcsICcjZjNiMzAwJyk7XG4gIGRyYXdGYXZpY29uQXJjKGNvbnRleHQsIHRvdGFsLCBwZW5kaW5nICsgcGFzc2luZywgZmFpbGluZywgJyNmZjU2MjEnKTtcblxuICB0aGlzLnNldEZhdmljb24oY2FudmFzLnRvRGF0YVVSTCgpKTtcbn07XG5cbi8qKiBTZXRzIHRoZSBjdXJyZW50IGZhdmljb24gYnkgVVJMLiAqL1xuVGl0bGUucHJvdG90eXBlLnNldEZhdmljb24gPSBmdW5jdGlvbiBzZXRGYXZpY29uKHVybCkge1xuICB2YXIgY3VycmVudCA9IGRvY3VtZW50LmhlYWQucXVlcnlTZWxlY3RvcignbGlua1tyZWw9XCJpY29uXCJdJyk7XG4gIGlmIChjdXJyZW50KSB7XG4gICAgZG9jdW1lbnQuaGVhZC5yZW1vdmVDaGlsZChjdXJyZW50KTtcbiAgfVxuXG4gIHZhciBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGluaycpO1xuICBsaW5rLnJlbCA9ICdpY29uJztcbiAgbGluay50eXBlID0gJ2ltYWdlL3gtaWNvbic7XG4gIGxpbmsuaHJlZiA9IHVybDtcbiAgbGluay5zZXRBdHRyaWJ1dGUoJ3NpemVzJywgJzMyeDMyJyk7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQobGluayk7XG59O1xuXG59KSgpO1xuIiwiLyogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4jbW9jaGEge1xuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcbiAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbiAgbGVmdDogMDtcbiAgbWFyZ2luOiAwICFpbXBvcnRhbnQ7IC8qIFdlIGNvbnZlcnQgTW9jaGEncyBtYXJnaW4gdG8gcGFkZGluZyAqL1xuICBtaW4taGVpZ2h0OiAxMDAlO1xuICBwYWRkaW5nOiA2MHB4IDUwcHg7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgdG9wOiAwO1xuICB3aWR0aDogMTAwJTtcbiAgei1pbmRleDogMTAwO1xufVxuXG4vKiBUT0RPKG5ldmlyKTogRml4IGdyZXAgc3VwcG9ydCAqL1xuI21vY2hhIC5yZXBsYXkge1xuICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG59XG5cbi5zdWJzdWl0ZSB7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgbGVmdDogMDtcbiAgdG9wOiAwO1xuICAvKiBUaGUgc2l6ZSBvZiB0aGUgaWZyYW1lIGRpcmVjdGx5IGltcGFjdHMgcGVyZm9ybWFuY2UuICovXG4gIGhlaWdodDogNDAwcHg7XG4gIHdpZHRoOiAyNTBweDtcbn1cbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==