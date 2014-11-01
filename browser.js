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

  // TODO(thedeeno): This could probably be moved to a more
  // obvious place, but since the iframe is destroyed right after
  // this done callback, perhaps this is currently the most
  // appropriate place.
  this.share = this.iframe.contentWindow.WCT.share;

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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1vY2hhLmpzIiwibW9jaGEuY3NzIiwicGFyc2luZy5qcyIsImZvcm1hdHRpbmcuanMiLCJub3JtYWxpemF0aW9uLmpzIiwiaW5kZXguanMiLCJ1dGlsLmpzIiwiY2xpc29ja2V0LmpzIiwic3Vic3VpdGUuanMiLCJyZXBvcnRlcnMvaHRtbC5jc3MiLCJlbnZpcm9ubWVudC9jb21wYXRhYmlsaXR5LmpzIiwiZW52aXJvbm1lbnQvaGVscGVycy5qcyIsIm1vY2hhL211bHRpcnVubmVyLmpzIiwibW9jaGEvcnVuLmpzIiwibW9jaGEvc2V0dXAuanMiLCJyZXBvcnRlcnMvY29uc29sZS5qcyIsInJlcG9ydGVycy9odG1sLmpzIiwicmVwb3J0ZXJzL3RpdGxlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDOTFMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDNUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNqSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDL0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3BNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN0SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDL0lBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMvSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDclBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNsT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDOUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJicm93c2VyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiOyhmdW5jdGlvbigpe1xuXG4vLyBDb21tb25KUyByZXF1aXJlKClcblxuZnVuY3Rpb24gcmVxdWlyZShwKXtcbiAgICB2YXIgcGF0aCA9IHJlcXVpcmUucmVzb2x2ZShwKVxuICAgICAgLCBtb2QgPSByZXF1aXJlLm1vZHVsZXNbcGF0aF07XG4gICAgaWYgKCFtb2QpIHRocm93IG5ldyBFcnJvcignZmFpbGVkIHRvIHJlcXVpcmUgXCInICsgcCArICdcIicpO1xuICAgIGlmICghbW9kLmV4cG9ydHMpIHtcbiAgICAgIG1vZC5leHBvcnRzID0ge307XG4gICAgICBtb2QuY2FsbChtb2QuZXhwb3J0cywgbW9kLCBtb2QuZXhwb3J0cywgcmVxdWlyZS5yZWxhdGl2ZShwYXRoKSk7XG4gICAgfVxuICAgIHJldHVybiBtb2QuZXhwb3J0cztcbiAgfVxuXG5yZXF1aXJlLm1vZHVsZXMgPSB7fTtcblxucmVxdWlyZS5yZXNvbHZlID0gZnVuY3Rpb24gKHBhdGgpe1xuICAgIHZhciBvcmlnID0gcGF0aFxuICAgICAgLCByZWcgPSBwYXRoICsgJy5qcydcbiAgICAgICwgaW5kZXggPSBwYXRoICsgJy9pbmRleC5qcyc7XG4gICAgcmV0dXJuIHJlcXVpcmUubW9kdWxlc1tyZWddICYmIHJlZ1xuICAgICAgfHwgcmVxdWlyZS5tb2R1bGVzW2luZGV4XSAmJiBpbmRleFxuICAgICAgfHwgb3JpZztcbiAgfTtcblxucmVxdWlyZS5yZWdpc3RlciA9IGZ1bmN0aW9uIChwYXRoLCBmbil7XG4gICAgcmVxdWlyZS5tb2R1bGVzW3BhdGhdID0gZm47XG4gIH07XG5cbnJlcXVpcmUucmVsYXRpdmUgPSBmdW5jdGlvbiAocGFyZW50KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKHApe1xuICAgICAgaWYgKCcuJyAhPSBwLmNoYXJBdCgwKSkgcmV0dXJuIHJlcXVpcmUocCk7XG5cbiAgICAgIHZhciBwYXRoID0gcGFyZW50LnNwbGl0KCcvJylcbiAgICAgICAgLCBzZWdzID0gcC5zcGxpdCgnLycpO1xuICAgICAgcGF0aC5wb3AoKTtcblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBzZWcgPSBzZWdzW2ldO1xuICAgICAgICBpZiAoJy4uJyA9PSBzZWcpIHBhdGgucG9wKCk7XG4gICAgICAgIGVsc2UgaWYgKCcuJyAhPSBzZWcpIHBhdGgucHVzaChzZWcpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVxdWlyZShwYXRoLmpvaW4oJy8nKSk7XG4gICAgfTtcbiAgfTtcblxuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiYnJvd3Nlci9kZWJ1Zy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHR5cGUpe1xuICByZXR1cm4gZnVuY3Rpb24oKXtcbiAgfVxufTtcblxufSk7IC8vIG1vZHVsZTogYnJvd3Nlci9kZWJ1Zy5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiYnJvd3Nlci9kaWZmLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG4vKiBTZWUgTElDRU5TRSBmaWxlIGZvciB0ZXJtcyBvZiB1c2UgKi9cblxuLypcbiAqIFRleHQgZGlmZiBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBUaGlzIGxpYnJhcnkgc3VwcG9ydHMgdGhlIGZvbGxvd2luZyBBUElTOlxuICogSnNEaWZmLmRpZmZDaGFyczogQ2hhcmFjdGVyIGJ5IGNoYXJhY3RlciBkaWZmXG4gKiBKc0RpZmYuZGlmZldvcmRzOiBXb3JkIChhcyBkZWZpbmVkIGJ5IFxcYiByZWdleCkgZGlmZiB3aGljaCBpZ25vcmVzIHdoaXRlc3BhY2VcbiAqIEpzRGlmZi5kaWZmTGluZXM6IExpbmUgYmFzZWQgZGlmZlxuICpcbiAqIEpzRGlmZi5kaWZmQ3NzOiBEaWZmIHRhcmdldGVkIGF0IENTUyBjb250ZW50XG4gKlxuICogVGhlc2UgbWV0aG9kcyBhcmUgYmFzZWQgb24gdGhlIGltcGxlbWVudGF0aW9uIHByb3Bvc2VkIGluXG4gKiBcIkFuIE8oTkQpIERpZmZlcmVuY2UgQWxnb3JpdGhtIGFuZCBpdHMgVmFyaWF0aW9uc1wiIChNeWVycywgMTk4NikuXG4gKiBodHRwOi8vY2l0ZXNlZXJ4LmlzdC5wc3UuZWR1L3ZpZXdkb2Mvc3VtbWFyeT9kb2k9MTAuMS4xLjQuNjkyN1xuICovXG52YXIgSnNEaWZmID0gKGZ1bmN0aW9uKCkge1xuICAvKmpzaGludCBtYXhwYXJhbXM6IDUqL1xuICBmdW5jdGlvbiBjbG9uZVBhdGgocGF0aCkge1xuICAgIHJldHVybiB7IG5ld1BvczogcGF0aC5uZXdQb3MsIGNvbXBvbmVudHM6IHBhdGguY29tcG9uZW50cy5zbGljZSgwKSB9O1xuICB9XG4gIGZ1bmN0aW9uIHJlbW92ZUVtcHR5KGFycmF5KSB7XG4gICAgdmFyIHJldCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChhcnJheVtpXSkge1xuICAgICAgICByZXQucHVzaChhcnJheVtpXSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH1cbiAgZnVuY3Rpb24gZXNjYXBlSFRNTChzKSB7XG4gICAgdmFyIG4gPSBzO1xuICAgIG4gPSBuLnJlcGxhY2UoLyYvZywgJyZhbXA7Jyk7XG4gICAgbiA9IG4ucmVwbGFjZSgvPC9nLCAnJmx0OycpO1xuICAgIG4gPSBuLnJlcGxhY2UoLz4vZywgJyZndDsnKTtcbiAgICBuID0gbi5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7Jyk7XG5cbiAgICByZXR1cm4gbjtcbiAgfVxuXG4gIHZhciBEaWZmID0gZnVuY3Rpb24oaWdub3JlV2hpdGVzcGFjZSkge1xuICAgIHRoaXMuaWdub3JlV2hpdGVzcGFjZSA9IGlnbm9yZVdoaXRlc3BhY2U7XG4gIH07XG4gIERpZmYucHJvdG90eXBlID0ge1xuICAgICAgZGlmZjogZnVuY3Rpb24ob2xkU3RyaW5nLCBuZXdTdHJpbmcpIHtcbiAgICAgICAgLy8gSGFuZGxlIHRoZSBpZGVudGl0eSBjYXNlICh0aGlzIGlzIGR1ZSB0byB1bnJvbGxpbmcgZWRpdExlbmd0aCA9PSAwXG4gICAgICAgIGlmIChuZXdTdHJpbmcgPT09IG9sZFN0cmluZykge1xuICAgICAgICAgIHJldHVybiBbeyB2YWx1ZTogbmV3U3RyaW5nIH1dO1xuICAgICAgICB9XG4gICAgICAgIGlmICghbmV3U3RyaW5nKSB7XG4gICAgICAgICAgcmV0dXJuIFt7IHZhbHVlOiBvbGRTdHJpbmcsIHJlbW92ZWQ6IHRydWUgfV07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFvbGRTdHJpbmcpIHtcbiAgICAgICAgICByZXR1cm4gW3sgdmFsdWU6IG5ld1N0cmluZywgYWRkZWQ6IHRydWUgfV07XG4gICAgICAgIH1cblxuICAgICAgICBuZXdTdHJpbmcgPSB0aGlzLnRva2VuaXplKG5ld1N0cmluZyk7XG4gICAgICAgIG9sZFN0cmluZyA9IHRoaXMudG9rZW5pemUob2xkU3RyaW5nKTtcblxuICAgICAgICB2YXIgbmV3TGVuID0gbmV3U3RyaW5nLmxlbmd0aCwgb2xkTGVuID0gb2xkU3RyaW5nLmxlbmd0aDtcbiAgICAgICAgdmFyIG1heEVkaXRMZW5ndGggPSBuZXdMZW4gKyBvbGRMZW47XG4gICAgICAgIHZhciBiZXN0UGF0aCA9IFt7IG5ld1BvczogLTEsIGNvbXBvbmVudHM6IFtdIH1dO1xuXG4gICAgICAgIC8vIFNlZWQgZWRpdExlbmd0aCA9IDBcbiAgICAgICAgdmFyIG9sZFBvcyA9IHRoaXMuZXh0cmFjdENvbW1vbihiZXN0UGF0aFswXSwgbmV3U3RyaW5nLCBvbGRTdHJpbmcsIDApO1xuICAgICAgICBpZiAoYmVzdFBhdGhbMF0ubmV3UG9zKzEgPj0gbmV3TGVuICYmIG9sZFBvcysxID49IG9sZExlbikge1xuICAgICAgICAgIHJldHVybiBiZXN0UGF0aFswXS5jb21wb25lbnRzO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgZWRpdExlbmd0aCA9IDE7IGVkaXRMZW5ndGggPD0gbWF4RWRpdExlbmd0aDsgZWRpdExlbmd0aCsrKSB7XG4gICAgICAgICAgZm9yICh2YXIgZGlhZ29uYWxQYXRoID0gLTEqZWRpdExlbmd0aDsgZGlhZ29uYWxQYXRoIDw9IGVkaXRMZW5ndGg7IGRpYWdvbmFsUGF0aCs9Mikge1xuICAgICAgICAgICAgdmFyIGJhc2VQYXRoO1xuICAgICAgICAgICAgdmFyIGFkZFBhdGggPSBiZXN0UGF0aFtkaWFnb25hbFBhdGgtMV0sXG4gICAgICAgICAgICAgICAgcmVtb3ZlUGF0aCA9IGJlc3RQYXRoW2RpYWdvbmFsUGF0aCsxXTtcbiAgICAgICAgICAgIG9sZFBvcyA9IChyZW1vdmVQYXRoID8gcmVtb3ZlUGF0aC5uZXdQb3MgOiAwKSAtIGRpYWdvbmFsUGF0aDtcbiAgICAgICAgICAgIGlmIChhZGRQYXRoKSB7XG4gICAgICAgICAgICAgIC8vIE5vIG9uZSBlbHNlIGlzIGdvaW5nIHRvIGF0dGVtcHQgdG8gdXNlIHRoaXMgdmFsdWUsIGNsZWFyIGl0XG4gICAgICAgICAgICAgIGJlc3RQYXRoW2RpYWdvbmFsUGF0aC0xXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGNhbkFkZCA9IGFkZFBhdGggJiYgYWRkUGF0aC5uZXdQb3MrMSA8IG5ld0xlbjtcbiAgICAgICAgICAgIHZhciBjYW5SZW1vdmUgPSByZW1vdmVQYXRoICYmIDAgPD0gb2xkUG9zICYmIG9sZFBvcyA8IG9sZExlbjtcbiAgICAgICAgICAgIGlmICghY2FuQWRkICYmICFjYW5SZW1vdmUpIHtcbiAgICAgICAgICAgICAgYmVzdFBhdGhbZGlhZ29uYWxQYXRoXSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFNlbGVjdCB0aGUgZGlhZ29uYWwgdGhhdCB3ZSB3YW50IHRvIGJyYW5jaCBmcm9tLiBXZSBzZWxlY3QgdGhlIHByaW9yXG4gICAgICAgICAgICAvLyBwYXRoIHdob3NlIHBvc2l0aW9uIGluIHRoZSBuZXcgc3RyaW5nIGlzIHRoZSBmYXJ0aGVzdCBmcm9tIHRoZSBvcmlnaW5cbiAgICAgICAgICAgIC8vIGFuZCBkb2VzIG5vdCBwYXNzIHRoZSBib3VuZHMgb2YgdGhlIGRpZmYgZ3JhcGhcbiAgICAgICAgICAgIGlmICghY2FuQWRkIHx8IChjYW5SZW1vdmUgJiYgYWRkUGF0aC5uZXdQb3MgPCByZW1vdmVQYXRoLm5ld1BvcykpIHtcbiAgICAgICAgICAgICAgYmFzZVBhdGggPSBjbG9uZVBhdGgocmVtb3ZlUGF0aCk7XG4gICAgICAgICAgICAgIHRoaXMucHVzaENvbXBvbmVudChiYXNlUGF0aC5jb21wb25lbnRzLCBvbGRTdHJpbmdbb2xkUG9zXSwgdW5kZWZpbmVkLCB0cnVlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGJhc2VQYXRoID0gY2xvbmVQYXRoKGFkZFBhdGgpO1xuICAgICAgICAgICAgICBiYXNlUGF0aC5uZXdQb3MrKztcbiAgICAgICAgICAgICAgdGhpcy5wdXNoQ29tcG9uZW50KGJhc2VQYXRoLmNvbXBvbmVudHMsIG5ld1N0cmluZ1tiYXNlUGF0aC5uZXdQb3NdLCB0cnVlLCB1bmRlZmluZWQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgb2xkUG9zID0gdGhpcy5leHRyYWN0Q29tbW9uKGJhc2VQYXRoLCBuZXdTdHJpbmcsIG9sZFN0cmluZywgZGlhZ29uYWxQYXRoKTtcblxuICAgICAgICAgICAgaWYgKGJhc2VQYXRoLm5ld1BvcysxID49IG5ld0xlbiAmJiBvbGRQb3MrMSA+PSBvbGRMZW4pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGJhc2VQYXRoLmNvbXBvbmVudHM7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBiZXN0UGF0aFtkaWFnb25hbFBhdGhdID0gYmFzZVBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICBwdXNoQ29tcG9uZW50OiBmdW5jdGlvbihjb21wb25lbnRzLCB2YWx1ZSwgYWRkZWQsIHJlbW92ZWQpIHtcbiAgICAgICAgdmFyIGxhc3QgPSBjb21wb25lbnRzW2NvbXBvbmVudHMubGVuZ3RoLTFdO1xuICAgICAgICBpZiAobGFzdCAmJiBsYXN0LmFkZGVkID09PSBhZGRlZCAmJiBsYXN0LnJlbW92ZWQgPT09IHJlbW92ZWQpIHtcbiAgICAgICAgICAvLyBXZSBuZWVkIHRvIGNsb25lIGhlcmUgYXMgdGhlIGNvbXBvbmVudCBjbG9uZSBvcGVyYXRpb24gaXMganVzdFxuICAgICAgICAgIC8vIGFzIHNoYWxsb3cgYXJyYXkgY2xvbmVcbiAgICAgICAgICBjb21wb25lbnRzW2NvbXBvbmVudHMubGVuZ3RoLTFdID1cbiAgICAgICAgICAgIHt2YWx1ZTogdGhpcy5qb2luKGxhc3QudmFsdWUsIHZhbHVlKSwgYWRkZWQ6IGFkZGVkLCByZW1vdmVkOiByZW1vdmVkIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29tcG9uZW50cy5wdXNoKHt2YWx1ZTogdmFsdWUsIGFkZGVkOiBhZGRlZCwgcmVtb3ZlZDogcmVtb3ZlZCB9KTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIGV4dHJhY3RDb21tb246IGZ1bmN0aW9uKGJhc2VQYXRoLCBuZXdTdHJpbmcsIG9sZFN0cmluZywgZGlhZ29uYWxQYXRoKSB7XG4gICAgICAgIHZhciBuZXdMZW4gPSBuZXdTdHJpbmcubGVuZ3RoLFxuICAgICAgICAgICAgb2xkTGVuID0gb2xkU3RyaW5nLmxlbmd0aCxcbiAgICAgICAgICAgIG5ld1BvcyA9IGJhc2VQYXRoLm5ld1BvcyxcbiAgICAgICAgICAgIG9sZFBvcyA9IG5ld1BvcyAtIGRpYWdvbmFsUGF0aDtcbiAgICAgICAgd2hpbGUgKG5ld1BvcysxIDwgbmV3TGVuICYmIG9sZFBvcysxIDwgb2xkTGVuICYmIHRoaXMuZXF1YWxzKG5ld1N0cmluZ1tuZXdQb3MrMV0sIG9sZFN0cmluZ1tvbGRQb3MrMV0pKSB7XG4gICAgICAgICAgbmV3UG9zKys7XG4gICAgICAgICAgb2xkUG9zKys7XG5cbiAgICAgICAgICB0aGlzLnB1c2hDb21wb25lbnQoYmFzZVBhdGguY29tcG9uZW50cywgbmV3U3RyaW5nW25ld1Bvc10sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgICAgICBiYXNlUGF0aC5uZXdQb3MgPSBuZXdQb3M7XG4gICAgICAgIHJldHVybiBvbGRQb3M7XG4gICAgICB9LFxuXG4gICAgICBlcXVhbHM6IGZ1bmN0aW9uKGxlZnQsIHJpZ2h0KSB7XG4gICAgICAgIHZhciByZVdoaXRlc3BhY2UgPSAvXFxTLztcbiAgICAgICAgaWYgKHRoaXMuaWdub3JlV2hpdGVzcGFjZSAmJiAhcmVXaGl0ZXNwYWNlLnRlc3QobGVmdCkgJiYgIXJlV2hpdGVzcGFjZS50ZXN0KHJpZ2h0KSkge1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBsZWZ0ID09PSByaWdodDtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIGpvaW46IGZ1bmN0aW9uKGxlZnQsIHJpZ2h0KSB7XG4gICAgICAgIHJldHVybiBsZWZ0ICsgcmlnaHQ7XG4gICAgICB9LFxuICAgICAgdG9rZW5pemU6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgIH1cbiAgfTtcblxuICB2YXIgQ2hhckRpZmYgPSBuZXcgRGlmZigpO1xuXG4gIHZhciBXb3JkRGlmZiA9IG5ldyBEaWZmKHRydWUpO1xuICB2YXIgV29yZFdpdGhTcGFjZURpZmYgPSBuZXcgRGlmZigpO1xuICBXb3JkRGlmZi50b2tlbml6ZSA9IFdvcmRXaXRoU3BhY2VEaWZmLnRva2VuaXplID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gcmVtb3ZlRW1wdHkodmFsdWUuc3BsaXQoLyhcXHMrfFxcYikvKSk7XG4gIH07XG5cbiAgdmFyIENzc0RpZmYgPSBuZXcgRGlmZih0cnVlKTtcbiAgQ3NzRGlmZi50b2tlbml6ZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIHJlbW92ZUVtcHR5KHZhbHVlLnNwbGl0KC8oW3t9OjssXXxcXHMrKS8pKTtcbiAgfTtcblxuICB2YXIgTGluZURpZmYgPSBuZXcgRGlmZigpO1xuICBMaW5lRGlmZi50b2tlbml6ZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlLnNwbGl0KC9eL20pO1xuICB9O1xuXG4gIHJldHVybiB7XG4gICAgRGlmZjogRGlmZixcblxuICAgIGRpZmZDaGFyczogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIENoYXJEaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpOyB9LFxuICAgIGRpZmZXb3JkczogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIFdvcmREaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpOyB9LFxuICAgIGRpZmZXb3Jkc1dpdGhTcGFjZTogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIFdvcmRXaXRoU3BhY2VEaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpOyB9LFxuICAgIGRpZmZMaW5lczogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIExpbmVEaWZmLmRpZmYob2xkU3RyLCBuZXdTdHIpOyB9LFxuXG4gICAgZGlmZkNzczogZnVuY3Rpb24ob2xkU3RyLCBuZXdTdHIpIHsgcmV0dXJuIENzc0RpZmYuZGlmZihvbGRTdHIsIG5ld1N0cik7IH0sXG5cbiAgICBjcmVhdGVQYXRjaDogZnVuY3Rpb24oZmlsZU5hbWUsIG9sZFN0ciwgbmV3U3RyLCBvbGRIZWFkZXIsIG5ld0hlYWRlcikge1xuICAgICAgdmFyIHJldCA9IFtdO1xuXG4gICAgICByZXQucHVzaCgnSW5kZXg6ICcgKyBmaWxlTmFtZSk7XG4gICAgICByZXQucHVzaCgnPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PScpO1xuICAgICAgcmV0LnB1c2goJy0tLSAnICsgZmlsZU5hbWUgKyAodHlwZW9mIG9sZEhlYWRlciA9PT0gJ3VuZGVmaW5lZCcgPyAnJyA6ICdcXHQnICsgb2xkSGVhZGVyKSk7XG4gICAgICByZXQucHVzaCgnKysrICcgKyBmaWxlTmFtZSArICh0eXBlb2YgbmV3SGVhZGVyID09PSAndW5kZWZpbmVkJyA/ICcnIDogJ1xcdCcgKyBuZXdIZWFkZXIpKTtcblxuICAgICAgdmFyIGRpZmYgPSBMaW5lRGlmZi5kaWZmKG9sZFN0ciwgbmV3U3RyKTtcbiAgICAgIGlmICghZGlmZltkaWZmLmxlbmd0aC0xXS52YWx1ZSkge1xuICAgICAgICBkaWZmLnBvcCgpOyAgIC8vIFJlbW92ZSB0cmFpbGluZyBuZXdsaW5lIGFkZFxuICAgICAgfVxuICAgICAgZGlmZi5wdXNoKHt2YWx1ZTogJycsIGxpbmVzOiBbXX0pOyAgIC8vIEFwcGVuZCBhbiBlbXB0eSB2YWx1ZSB0byBtYWtlIGNsZWFudXAgZWFzaWVyXG5cbiAgICAgIGZ1bmN0aW9uIGNvbnRleHRMaW5lcyhsaW5lcykge1xuICAgICAgICByZXR1cm4gbGluZXMubWFwKGZ1bmN0aW9uKGVudHJ5KSB7IHJldHVybiAnICcgKyBlbnRyeTsgfSk7XG4gICAgICB9XG4gICAgICBmdW5jdGlvbiBlb2ZOTChjdXJSYW5nZSwgaSwgY3VycmVudCkge1xuICAgICAgICB2YXIgbGFzdCA9IGRpZmZbZGlmZi5sZW5ndGgtMl0sXG4gICAgICAgICAgICBpc0xhc3QgPSBpID09PSBkaWZmLmxlbmd0aC0yLFxuICAgICAgICAgICAgaXNMYXN0T2ZUeXBlID0gaSA9PT0gZGlmZi5sZW5ndGgtMyAmJiAoY3VycmVudC5hZGRlZCAhPT0gbGFzdC5hZGRlZCB8fCBjdXJyZW50LnJlbW92ZWQgIT09IGxhc3QucmVtb3ZlZCk7XG5cbiAgICAgICAgLy8gRmlndXJlIG91dCBpZiB0aGlzIGlzIHRoZSBsYXN0IGxpbmUgZm9yIHRoZSBnaXZlbiBmaWxlIGFuZCBtaXNzaW5nIE5MXG4gICAgICAgIGlmICghL1xcbiQvLnRlc3QoY3VycmVudC52YWx1ZSkgJiYgKGlzTGFzdCB8fCBpc0xhc3RPZlR5cGUpKSB7XG4gICAgICAgICAgY3VyUmFuZ2UucHVzaCgnXFxcXCBObyBuZXdsaW5lIGF0IGVuZCBvZiBmaWxlJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdmFyIG9sZFJhbmdlU3RhcnQgPSAwLCBuZXdSYW5nZVN0YXJ0ID0gMCwgY3VyUmFuZ2UgPSBbXSxcbiAgICAgICAgICBvbGRMaW5lID0gMSwgbmV3TGluZSA9IDE7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRpZmYubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGN1cnJlbnQgPSBkaWZmW2ldLFxuICAgICAgICAgICAgbGluZXMgPSBjdXJyZW50LmxpbmVzIHx8IGN1cnJlbnQudmFsdWUucmVwbGFjZSgvXFxuJC8sICcnKS5zcGxpdCgnXFxuJyk7XG4gICAgICAgIGN1cnJlbnQubGluZXMgPSBsaW5lcztcblxuICAgICAgICBpZiAoY3VycmVudC5hZGRlZCB8fCBjdXJyZW50LnJlbW92ZWQpIHtcbiAgICAgICAgICBpZiAoIW9sZFJhbmdlU3RhcnQpIHtcbiAgICAgICAgICAgIHZhciBwcmV2ID0gZGlmZltpLTFdO1xuICAgICAgICAgICAgb2xkUmFuZ2VTdGFydCA9IG9sZExpbmU7XG4gICAgICAgICAgICBuZXdSYW5nZVN0YXJ0ID0gbmV3TGluZTtcblxuICAgICAgICAgICAgaWYgKHByZXYpIHtcbiAgICAgICAgICAgICAgY3VyUmFuZ2UgPSBjb250ZXh0TGluZXMocHJldi5saW5lcy5zbGljZSgtNCkpO1xuICAgICAgICAgICAgICBvbGRSYW5nZVN0YXJ0IC09IGN1clJhbmdlLmxlbmd0aDtcbiAgICAgICAgICAgICAgbmV3UmFuZ2VTdGFydCAtPSBjdXJSYW5nZS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGN1clJhbmdlLnB1c2guYXBwbHkoY3VyUmFuZ2UsIGxpbmVzLm1hcChmdW5jdGlvbihlbnRyeSkgeyByZXR1cm4gKGN1cnJlbnQuYWRkZWQ/JysnOictJykgKyBlbnRyeTsgfSkpO1xuICAgICAgICAgIGVvZk5MKGN1clJhbmdlLCBpLCBjdXJyZW50KTtcblxuICAgICAgICAgIGlmIChjdXJyZW50LmFkZGVkKSB7XG4gICAgICAgICAgICBuZXdMaW5lICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb2xkTGluZSArPSBsaW5lcy5sZW5ndGg7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChvbGRSYW5nZVN0YXJ0KSB7XG4gICAgICAgICAgICAvLyBDbG9zZSBvdXQgYW55IGNoYW5nZXMgdGhhdCBoYXZlIGJlZW4gb3V0cHV0IChvciBqb2luIG92ZXJsYXBwaW5nKVxuICAgICAgICAgICAgaWYgKGxpbmVzLmxlbmd0aCA8PSA4ICYmIGkgPCBkaWZmLmxlbmd0aC0yKSB7XG4gICAgICAgICAgICAgIC8vIE92ZXJsYXBwaW5nXG4gICAgICAgICAgICAgIGN1clJhbmdlLnB1c2guYXBwbHkoY3VyUmFuZ2UsIGNvbnRleHRMaW5lcyhsaW5lcykpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gZW5kIHRoZSByYW5nZSBhbmQgb3V0cHV0XG4gICAgICAgICAgICAgIHZhciBjb250ZXh0U2l6ZSA9IE1hdGgubWluKGxpbmVzLmxlbmd0aCwgNCk7XG4gICAgICAgICAgICAgIHJldC5wdXNoKFxuICAgICAgICAgICAgICAgICAgJ0BAIC0nICsgb2xkUmFuZ2VTdGFydCArICcsJyArIChvbGRMaW5lLW9sZFJhbmdlU3RhcnQrY29udGV4dFNpemUpXG4gICAgICAgICAgICAgICAgICArICcgKycgKyBuZXdSYW5nZVN0YXJ0ICsgJywnICsgKG5ld0xpbmUtbmV3UmFuZ2VTdGFydCtjb250ZXh0U2l6ZSlcbiAgICAgICAgICAgICAgICAgICsgJyBAQCcpO1xuICAgICAgICAgICAgICByZXQucHVzaC5hcHBseShyZXQsIGN1clJhbmdlKTtcbiAgICAgICAgICAgICAgcmV0LnB1c2guYXBwbHkocmV0LCBjb250ZXh0TGluZXMobGluZXMuc2xpY2UoMCwgY29udGV4dFNpemUpKSk7XG4gICAgICAgICAgICAgIGlmIChsaW5lcy5sZW5ndGggPD0gNCkge1xuICAgICAgICAgICAgICAgIGVvZk5MKHJldCwgaSwgY3VycmVudCk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBvbGRSYW5nZVN0YXJ0ID0gMDsgIG5ld1JhbmdlU3RhcnQgPSAwOyBjdXJSYW5nZSA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBvbGRMaW5lICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgICBuZXdMaW5lICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmV0LmpvaW4oJ1xcbicpICsgJ1xcbic7XG4gICAgfSxcblxuICAgIGFwcGx5UGF0Y2g6IGZ1bmN0aW9uKG9sZFN0ciwgdW5pRGlmZikge1xuICAgICAgdmFyIGRpZmZzdHIgPSB1bmlEaWZmLnNwbGl0KCdcXG4nKTtcbiAgICAgIHZhciBkaWZmID0gW107XG4gICAgICB2YXIgcmVtRU9GTkwgPSBmYWxzZSxcbiAgICAgICAgICBhZGRFT0ZOTCA9IGZhbHNlO1xuXG4gICAgICBmb3IgKHZhciBpID0gKGRpZmZzdHJbMF1bMF09PT0nSSc/NDowKTsgaSA8IGRpZmZzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYoZGlmZnN0cltpXVswXSA9PT0gJ0AnKSB7XG4gICAgICAgICAgdmFyIG1laCA9IGRpZmZzdHJbaV0uc3BsaXQoL0BAIC0oXFxkKyksKFxcZCspIFxcKyhcXGQrKSwoXFxkKykgQEAvKTtcbiAgICAgICAgICBkaWZmLnVuc2hpZnQoe1xuICAgICAgICAgICAgc3RhcnQ6bWVoWzNdLFxuICAgICAgICAgICAgb2xkbGVuZ3RoOm1laFsyXSxcbiAgICAgICAgICAgIG9sZGxpbmVzOltdLFxuICAgICAgICAgICAgbmV3bGVuZ3RoOm1laFs0XSxcbiAgICAgICAgICAgIG5ld2xpbmVzOltdXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSBpZihkaWZmc3RyW2ldWzBdID09PSAnKycpIHtcbiAgICAgICAgICBkaWZmWzBdLm5ld2xpbmVzLnB1c2goZGlmZnN0cltpXS5zdWJzdHIoMSkpO1xuICAgICAgICB9IGVsc2UgaWYoZGlmZnN0cltpXVswXSA9PT0gJy0nKSB7XG4gICAgICAgICAgZGlmZlswXS5vbGRsaW5lcy5wdXNoKGRpZmZzdHJbaV0uc3Vic3RyKDEpKTtcbiAgICAgICAgfSBlbHNlIGlmKGRpZmZzdHJbaV1bMF0gPT09ICcgJykge1xuICAgICAgICAgIGRpZmZbMF0ubmV3bGluZXMucHVzaChkaWZmc3RyW2ldLnN1YnN0cigxKSk7XG4gICAgICAgICAgZGlmZlswXS5vbGRsaW5lcy5wdXNoKGRpZmZzdHJbaV0uc3Vic3RyKDEpKTtcbiAgICAgICAgfSBlbHNlIGlmKGRpZmZzdHJbaV1bMF0gPT09ICdcXFxcJykge1xuICAgICAgICAgIGlmIChkaWZmc3RyW2ktMV1bMF0gPT09ICcrJykge1xuICAgICAgICAgICAgcmVtRU9GTkwgPSB0cnVlO1xuICAgICAgICAgIH0gZWxzZSBpZihkaWZmc3RyW2ktMV1bMF0gPT09ICctJykge1xuICAgICAgICAgICAgYWRkRU9GTkwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgc3RyID0gb2xkU3RyLnNwbGl0KCdcXG4nKTtcbiAgICAgIGZvciAodmFyIGkgPSBkaWZmLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIHZhciBkID0gZGlmZltpXTtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBkLm9sZGxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgaWYoc3RyW2Quc3RhcnQtMStqXSAhPT0gZC5vbGRsaW5lc1tqXSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBBcnJheS5wcm90b3R5cGUuc3BsaWNlLmFwcGx5KHN0cixbZC5zdGFydC0xLCtkLm9sZGxlbmd0aF0uY29uY2F0KGQubmV3bGluZXMpKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlbUVPRk5MKSB7XG4gICAgICAgIHdoaWxlICghc3RyW3N0ci5sZW5ndGgtMV0pIHtcbiAgICAgICAgICBzdHIucG9wKCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoYWRkRU9GTkwpIHtcbiAgICAgICAgc3RyLnB1c2goJycpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN0ci5qb2luKCdcXG4nKTtcbiAgICB9LFxuXG4gICAgY29udmVydENoYW5nZXNUb1hNTDogZnVuY3Rpb24oY2hhbmdlcyl7XG4gICAgICB2YXIgcmV0ID0gW107XG4gICAgICBmb3IgKCB2YXIgaSA9IDA7IGkgPCBjaGFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGFuZ2UgPSBjaGFuZ2VzW2ldO1xuICAgICAgICBpZiAoY2hhbmdlLmFkZGVkKSB7XG4gICAgICAgICAgcmV0LnB1c2goJzxpbnM+Jyk7XG4gICAgICAgIH0gZWxzZSBpZiAoY2hhbmdlLnJlbW92ZWQpIHtcbiAgICAgICAgICByZXQucHVzaCgnPGRlbD4nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldC5wdXNoKGVzY2FwZUhUTUwoY2hhbmdlLnZhbHVlKSk7XG5cbiAgICAgICAgaWYgKGNoYW5nZS5hZGRlZCkge1xuICAgICAgICAgIHJldC5wdXNoKCc8L2lucz4nKTtcbiAgICAgICAgfSBlbHNlIGlmIChjaGFuZ2UucmVtb3ZlZCkge1xuICAgICAgICAgIHJldC5wdXNoKCc8L2RlbD4nKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJldC5qb2luKCcnKTtcbiAgICB9LFxuXG4gICAgLy8gU2VlOiBodHRwOi8vY29kZS5nb29nbGUuY29tL3AvZ29vZ2xlLWRpZmYtbWF0Y2gtcGF0Y2gvd2lraS9BUElcbiAgICBjb252ZXJ0Q2hhbmdlc1RvRE1QOiBmdW5jdGlvbihjaGFuZ2VzKXtcbiAgICAgIHZhciByZXQgPSBbXSwgY2hhbmdlO1xuICAgICAgZm9yICggdmFyIGkgPSAwOyBpIDwgY2hhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjaGFuZ2UgPSBjaGFuZ2VzW2ldO1xuICAgICAgICByZXQucHVzaChbKGNoYW5nZS5hZGRlZCA/IDEgOiBjaGFuZ2UucmVtb3ZlZCA/IC0xIDogMCksIGNoYW5nZS52YWx1ZV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJldDtcbiAgICB9XG4gIH07XG59KSgpO1xuXG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEpzRGlmZjtcbn1cblxufSk7IC8vIG1vZHVsZTogYnJvd3Nlci9kaWZmLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJicm93c2VyL2V2ZW50cy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBleHBvcnRzLlxuICovXG5cbmV4cG9ydHMuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuXG4vKipcbiAqIENoZWNrIGlmIGBvYmpgIGlzIGFuIGFycmF5LlxuICovXG5cbmZ1bmN0aW9uIGlzQXJyYXkob2JqKSB7XG4gIHJldHVybiAnW29iamVjdCBBcnJheV0nID09IHt9LnRvU3RyaW5nLmNhbGwob2JqKTtcbn1cblxuLyoqXG4gKiBFdmVudCBlbWl0dGVyIGNvbnN0cnVjdG9yLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gRXZlbnRFbWl0dGVyKCl7fTtcblxuLyoqXG4gKiBBZGRzIGEgbGlzdGVuZXIuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gZnVuY3Rpb24gKG5hbWUsIGZuKSB7XG4gIGlmICghdGhpcy4kZXZlbnRzKSB7XG4gICAgdGhpcy4kZXZlbnRzID0ge307XG4gIH1cblxuICBpZiAoIXRoaXMuJGV2ZW50c1tuYW1lXSkge1xuICAgIHRoaXMuJGV2ZW50c1tuYW1lXSA9IGZuO1xuICB9IGVsc2UgaWYgKGlzQXJyYXkodGhpcy4kZXZlbnRzW25hbWVdKSkge1xuICAgIHRoaXMuJGV2ZW50c1tuYW1lXS5wdXNoKGZuKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLiRldmVudHNbbmFtZV0gPSBbdGhpcy4kZXZlbnRzW25hbWVdLCBmbl07XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXIgPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uO1xuXG4vKipcbiAqIEFkZHMgYSB2b2xhdGlsZSBsaXN0ZW5lci5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uIChuYW1lLCBmbikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgZnVuY3Rpb24gb24gKCkge1xuICAgIHNlbGYucmVtb3ZlTGlzdGVuZXIobmFtZSwgb24pO1xuICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgb24ubGlzdGVuZXIgPSBmbjtcbiAgdGhpcy5vbihuYW1lLCBvbik7XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJlbW92ZXMgYSBsaXN0ZW5lci5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbiAobmFtZSwgZm4pIHtcbiAgaWYgKHRoaXMuJGV2ZW50cyAmJiB0aGlzLiRldmVudHNbbmFtZV0pIHtcbiAgICB2YXIgbGlzdCA9IHRoaXMuJGV2ZW50c1tuYW1lXTtcblxuICAgIGlmIChpc0FycmF5KGxpc3QpKSB7XG4gICAgICB2YXIgcG9zID0gLTE7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gbGlzdC5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaWYgKGxpc3RbaV0gPT09IGZuIHx8IChsaXN0W2ldLmxpc3RlbmVyICYmIGxpc3RbaV0ubGlzdGVuZXIgPT09IGZuKSkge1xuICAgICAgICAgIHBvcyA9IGk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHBvcyA8IDApIHtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG5cbiAgICAgIGxpc3Quc3BsaWNlKHBvcywgMSk7XG5cbiAgICAgIGlmICghbGlzdC5sZW5ndGgpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuJGV2ZW50c1tuYW1lXTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGxpc3QgPT09IGZuIHx8IChsaXN0Lmxpc3RlbmVyICYmIGxpc3QubGlzdGVuZXIgPT09IGZuKSkge1xuICAgICAgZGVsZXRlIHRoaXMuJGV2ZW50c1tuYW1lXTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmVtb3ZlcyBhbGwgbGlzdGVuZXJzIGZvciBhbiBldmVudC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgaWYgKG5hbWUgPT09IHVuZGVmaW5lZCkge1xuICAgIHRoaXMuJGV2ZW50cyA9IHt9O1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgaWYgKHRoaXMuJGV2ZW50cyAmJiB0aGlzLiRldmVudHNbbmFtZV0pIHtcbiAgICB0aGlzLiRldmVudHNbbmFtZV0gPSBudWxsO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEdldHMgYWxsIGxpc3RlbmVycyBmb3IgYSBjZXJ0YWluIGV2ZW50LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbiAobmFtZSkge1xuICBpZiAoIXRoaXMuJGV2ZW50cykge1xuICAgIHRoaXMuJGV2ZW50cyA9IHt9O1xuICB9XG5cbiAgaWYgKCF0aGlzLiRldmVudHNbbmFtZV0pIHtcbiAgICB0aGlzLiRldmVudHNbbmFtZV0gPSBbXTtcbiAgfVxuXG4gIGlmICghaXNBcnJheSh0aGlzLiRldmVudHNbbmFtZV0pKSB7XG4gICAgdGhpcy4kZXZlbnRzW25hbWVdID0gW3RoaXMuJGV2ZW50c1tuYW1lXV07XG4gIH1cblxuICByZXR1cm4gdGhpcy4kZXZlbnRzW25hbWVdO1xufTtcblxuLyoqXG4gKiBFbWl0cyBhbiBldmVudC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gIGlmICghdGhpcy4kZXZlbnRzKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgdmFyIGhhbmRsZXIgPSB0aGlzLiRldmVudHNbbmFtZV07XG5cbiAgaWYgKCFoYW5kbGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIGhhbmRsZXIpIHtcbiAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9IGVsc2UgaWYgKGlzQXJyYXkoaGFuZGxlcikpIHtcbiAgICB2YXIgbGlzdGVuZXJzID0gaGFuZGxlci5zbGljZSgpO1xuXG4gICAgZm9yICh2YXIgaSA9IDAsIGwgPSBsaXN0ZW5lcnMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICBsaXN0ZW5lcnNbaV0uYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcbn0pOyAvLyBtb2R1bGU6IGJyb3dzZXIvZXZlbnRzLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJicm93c2VyL2ZzLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbn0pOyAvLyBtb2R1bGU6IGJyb3dzZXIvZnMuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImJyb3dzZXIvcGF0aC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG59KTsgLy8gbW9kdWxlOiBicm93c2VyL3BhdGguanNcblxucmVxdWlyZS5yZWdpc3RlcihcImJyb3dzZXIvcHJvZ3Jlc3MuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qKlxuICogRXhwb3NlIGBQcm9ncmVzc2AuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBQcm9ncmVzcztcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBQcm9ncmVzc2AgaW5kaWNhdG9yLlxuICovXG5cbmZ1bmN0aW9uIFByb2dyZXNzKCkge1xuICB0aGlzLnBlcmNlbnQgPSAwO1xuICB0aGlzLnNpemUoMCk7XG4gIHRoaXMuZm9udFNpemUoMTEpO1xuICB0aGlzLmZvbnQoJ2hlbHZldGljYSwgYXJpYWwsIHNhbnMtc2VyaWYnKTtcbn1cblxuLyoqXG4gKiBTZXQgcHJvZ3Jlc3Mgc2l6ZSB0byBgbmAuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG5cbiAqIEByZXR1cm4ge1Byb2dyZXNzfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUHJvZ3Jlc3MucHJvdG90eXBlLnNpemUgPSBmdW5jdGlvbihuKXtcbiAgdGhpcy5fc2l6ZSA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGV4dCB0byBgc3RyYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtQcm9ncmVzc30gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblByb2dyZXNzLnByb3RvdHlwZS50ZXh0ID0gZnVuY3Rpb24oc3RyKXtcbiAgdGhpcy5fdGV4dCA9IHN0cjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCBmb250IHNpemUgdG8gYG5gLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXG4gKiBAcmV0dXJuIHtQcm9ncmVzc30gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblByb2dyZXNzLnByb3RvdHlwZS5mb250U2l6ZSA9IGZ1bmN0aW9uKG4pe1xuICB0aGlzLl9mb250U2l6ZSA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgZm9udCBgZmFtaWx5YC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmFtaWx5XG4gKiBAcmV0dXJuIHtQcm9ncmVzc30gZm9yIGNoYWluaW5nXG4gKi9cblxuUHJvZ3Jlc3MucHJvdG90eXBlLmZvbnQgPSBmdW5jdGlvbihmYW1pbHkpe1xuICB0aGlzLl9mb250ID0gZmFtaWx5O1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogVXBkYXRlIHBlcmNlbnRhZ2UgdG8gYG5gLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXG4gKiBAcmV0dXJuIHtQcm9ncmVzc30gZm9yIGNoYWluaW5nXG4gKi9cblxuUHJvZ3Jlc3MucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKG4pe1xuICB0aGlzLnBlcmNlbnQgPSBuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogRHJhdyBvbiBgY3R4YC5cbiAqXG4gKiBAcGFyYW0ge0NhbnZhc1JlbmRlcmluZ0NvbnRleHQyZH0gY3R4XG4gKiBAcmV0dXJuIHtQcm9ncmVzc30gZm9yIGNoYWluaW5nXG4gKi9cblxuUHJvZ3Jlc3MucHJvdG90eXBlLmRyYXcgPSBmdW5jdGlvbihjdHgpe1xuICB0cnkge1xuICAgIHZhciBwZXJjZW50ID0gTWF0aC5taW4odGhpcy5wZXJjZW50LCAxMDApXG4gICAgICAsIHNpemUgPSB0aGlzLl9zaXplXG4gICAgICAsIGhhbGYgPSBzaXplIC8gMlxuICAgICAgLCB4ID0gaGFsZlxuICAgICAgLCB5ID0gaGFsZlxuICAgICAgLCByYWQgPSBoYWxmIC0gMVxuICAgICAgLCBmb250U2l6ZSA9IHRoaXMuX2ZvbnRTaXplO1xuICBcbiAgICBjdHguZm9udCA9IGZvbnRTaXplICsgJ3B4ICcgKyB0aGlzLl9mb250O1xuICBcbiAgICB2YXIgYW5nbGUgPSBNYXRoLlBJICogMiAqIChwZXJjZW50IC8gMTAwKTtcbiAgICBjdHguY2xlYXJSZWN0KDAsIDAsIHNpemUsIHNpemUpO1xuICBcbiAgICAvLyBvdXRlciBjaXJjbGVcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSAnIzlmOWY5Zic7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5hcmMoeCwgeSwgcmFkLCAwLCBhbmdsZSwgZmFsc2UpO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgXG4gICAgLy8gaW5uZXIgY2lyY2xlXG4gICAgY3R4LnN0cm9rZVN0eWxlID0gJyNlZWUnO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHguYXJjKHgsIHksIHJhZCAtIDEsIDAsIGFuZ2xlLCB0cnVlKTtcbiAgICBjdHguc3Ryb2tlKCk7XG4gIFxuICAgIC8vIHRleHRcbiAgICB2YXIgdGV4dCA9IHRoaXMuX3RleHQgfHwgKHBlcmNlbnQgfCAwKSArICclJ1xuICAgICAgLCB3ID0gY3R4Lm1lYXN1cmVUZXh0KHRleHQpLndpZHRoO1xuICBcbiAgICBjdHguZmlsbFRleHQoXG4gICAgICAgIHRleHRcbiAgICAgICwgeCAtIHcgLyAyICsgMVxuICAgICAgLCB5ICsgZm9udFNpemUgLyAyIC0gMSk7XG4gIH0gY2F0Y2ggKGV4KSB7fSAvL2Rvbid0IGZhaWwgaWYgd2UgY2FuJ3QgcmVuZGVyIHByb2dyZXNzXG4gIHJldHVybiB0aGlzO1xufTtcblxufSk7IC8vIG1vZHVsZTogYnJvd3Nlci9wcm9ncmVzcy5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiYnJvd3Nlci90dHkuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuZXhwb3J0cy5pc2F0dHkgPSBmdW5jdGlvbigpe1xuICByZXR1cm4gdHJ1ZTtcbn07XG5cbmV4cG9ydHMuZ2V0V2luZG93U2l6ZSA9IGZ1bmN0aW9uKCl7XG4gIGlmICgnaW5uZXJIZWlnaHQnIGluIGdsb2JhbCkge1xuICAgIHJldHVybiBbZ2xvYmFsLmlubmVySGVpZ2h0LCBnbG9iYWwuaW5uZXJXaWR0aF07XG4gIH0gZWxzZSB7XG4gICAgLy8gSW4gYSBXZWIgV29ya2VyLCB0aGUgRE9NIFdpbmRvdyBpcyBub3QgYXZhaWxhYmxlLlxuICAgIHJldHVybiBbNjQwLCA0ODBdO1xuICB9XG59O1xuXG59KTsgLy8gbW9kdWxlOiBicm93c2VyL3R0eS5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiY29udGV4dC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIEV4cG9zZSBgQ29udGV4dGAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBDb250ZXh0O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYENvbnRleHRgLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIENvbnRleHQoKXt9XG5cbi8qKlxuICogU2V0IG9yIGdldCB0aGUgY29udGV4dCBgUnVubmFibGVgIHRvIGBydW5uYWJsZWAuXG4gKlxuICogQHBhcmFtIHtSdW5uYWJsZX0gcnVubmFibGVcbiAqIEByZXR1cm4ge0NvbnRleHR9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Db250ZXh0LnByb3RvdHlwZS5ydW5uYWJsZSA9IGZ1bmN0aW9uKHJ1bm5hYmxlKXtcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX3J1bm5hYmxlO1xuICB0aGlzLnRlc3QgPSB0aGlzLl9ydW5uYWJsZSA9IHJ1bm5hYmxlO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IHRlc3QgdGltZW91dCBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7Q29udGV4dH0gc2VsZlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQ29udGV4dC5wcm90b3R5cGUudGltZW91dCA9IGZ1bmN0aW9uKG1zKXtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHJldHVybiB0aGlzLnJ1bm5hYmxlKCkudGltZW91dCgpO1xuICB0aGlzLnJ1bm5hYmxlKCkudGltZW91dChtcyk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGVzdCB0aW1lb3V0IGBlbmFibGVkYC5cbiAqXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZWRcbiAqIEByZXR1cm4ge0NvbnRleHR9IHNlbGZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkNvbnRleHQucHJvdG90eXBlLmVuYWJsZVRpbWVvdXRzID0gZnVuY3Rpb24gKGVuYWJsZWQpIHtcbiAgdGhpcy5ydW5uYWJsZSgpLmVuYWJsZVRpbWVvdXRzKGVuYWJsZWQpO1xuICByZXR1cm4gdGhpcztcbn07XG5cblxuLyoqXG4gKiBTZXQgdGVzdCBzbG93bmVzcyB0aHJlc2hvbGQgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge0NvbnRleHR9IHNlbGZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkNvbnRleHQucHJvdG90eXBlLnNsb3cgPSBmdW5jdGlvbihtcyl7XG4gIHRoaXMucnVubmFibGUoKS5zbG93KG1zKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEluc3BlY3QgdGhlIGNvbnRleHQgdm9pZCBvZiBgLl9ydW5uYWJsZWAuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQ29udGV4dC5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uKCl7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeSh0aGlzLCBmdW5jdGlvbihrZXksIHZhbCl7XG4gICAgaWYgKCdfcnVubmFibGUnID09IGtleSkgcmV0dXJuO1xuICAgIGlmICgndGVzdCcgPT0ga2V5KSByZXR1cm47XG4gICAgcmV0dXJuIHZhbDtcbiAgfSwgMik7XG59O1xuXG59KTsgLy8gbW9kdWxlOiBjb250ZXh0LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJob29rLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgUnVubmFibGUgPSByZXF1aXJlKCcuL3J1bm5hYmxlJyk7XG5cbi8qKlxuICogRXhwb3NlIGBIb29rYC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IEhvb2s7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgSG9va2Agd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYCBhbmQgY2FsbGJhY2sgYGZuYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdGl0bGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBIb29rKHRpdGxlLCBmbikge1xuICBSdW5uYWJsZS5jYWxsKHRoaXMsIHRpdGxlLCBmbik7XG4gIHRoaXMudHlwZSA9ICdob29rJztcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYFJ1bm5hYmxlLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IFJ1bm5hYmxlLnByb3RvdHlwZTtcbkhvb2sucHJvdG90eXBlID0gbmV3IEY7XG5Ib29rLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IEhvb2s7XG5cblxuLyoqXG4gKiBHZXQgb3Igc2V0IHRoZSB0ZXN0IGBlcnJgLlxuICpcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxuICogQHJldHVybiB7RXJyb3J9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkhvb2sucHJvdG90eXBlLmVycm9yID0gZnVuY3Rpb24oZXJyKXtcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkge1xuICAgIHZhciBlcnIgPSB0aGlzLl9lcnJvcjtcbiAgICB0aGlzLl9lcnJvciA9IG51bGw7XG4gICAgcmV0dXJuIGVycjtcbiAgfVxuXG4gIHRoaXMuX2Vycm9yID0gZXJyO1xufTtcblxufSk7IC8vIG1vZHVsZTogaG9vay5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwiaW50ZXJmYWNlcy9iZGQuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBTdWl0ZSA9IHJlcXVpcmUoJy4uL3N1aXRlJylcbiAgLCBUZXN0ID0gcmVxdWlyZSgnLi4vdGVzdCcpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4vKipcbiAqIEJERC1zdHlsZSBpbnRlcmZhY2U6XG4gKlxuICogICAgICBkZXNjcmliZSgnQXJyYXknLCBmdW5jdGlvbigpe1xuICogICAgICAgIGRlc2NyaWJlKCcjaW5kZXhPZigpJywgZnVuY3Rpb24oKXtcbiAqICAgICAgICAgIGl0KCdzaG91bGQgcmV0dXJuIC0xIHdoZW4gbm90IHByZXNlbnQnLCBmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgIH0pO1xuICpcbiAqICAgICAgICAgIGl0KCdzaG91bGQgcmV0dXJuIHRoZSBpbmRleCB3aGVuIHByZXNlbnQnLCBmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgIH0pO1xuICogICAgICAgIH0pO1xuICogICAgICB9KTtcbiAqXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzdWl0ZSl7XG4gIHZhciBzdWl0ZXMgPSBbc3VpdGVdO1xuXG4gIHN1aXRlLm9uKCdwcmUtcmVxdWlyZScsIGZ1bmN0aW9uKGNvbnRleHQsIGZpbGUsIG1vY2hhKXtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYmVmb3JlIHJ1bm5pbmcgdGVzdHMuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmJlZm9yZSA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5iZWZvcmVBbGwobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGFmdGVyIHJ1bm5pbmcgdGVzdHMuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmFmdGVyID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmFmdGVyQWxsKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBiZWZvcmUgZWFjaCB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmJlZm9yZUVhY2ggPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYmVmb3JlRWFjaChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYWZ0ZXIgZWFjaCB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmFmdGVyRWFjaCA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5hZnRlckVhY2gobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZSBhIFwic3VpdGVcIiB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgXG4gICAgICogYW5kIGNhbGxiYWNrIGBmbmAgY29udGFpbmluZyBuZXN0ZWQgc3VpdGVzXG4gICAgICogYW5kL29yIHRlc3RzLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5kZXNjcmliZSA9IGNvbnRleHQuY29udGV4dCA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gICAgICB2YXIgc3VpdGUgPSBTdWl0ZS5jcmVhdGUoc3VpdGVzWzBdLCB0aXRsZSk7XG4gICAgICBzdWl0ZS5maWxlID0gZmlsZTtcbiAgICAgIHN1aXRlcy51bnNoaWZ0KHN1aXRlKTtcbiAgICAgIGZuLmNhbGwoc3VpdGUpO1xuICAgICAgc3VpdGVzLnNoaWZ0KCk7XG4gICAgICByZXR1cm4gc3VpdGU7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFBlbmRpbmcgZGVzY3JpYmUuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnhkZXNjcmliZSA9XG4gICAgY29udGV4dC54Y29udGV4dCA9XG4gICAgY29udGV4dC5kZXNjcmliZS5za2lwID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IFN1aXRlLmNyZWF0ZShzdWl0ZXNbMF0sIHRpdGxlKTtcbiAgICAgIHN1aXRlLnBlbmRpbmcgPSB0cnVlO1xuICAgICAgc3VpdGVzLnVuc2hpZnQoc3VpdGUpO1xuICAgICAgZm4uY2FsbChzdWl0ZSk7XG4gICAgICBzdWl0ZXMuc2hpZnQoKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhjbHVzaXZlIHN1aXRlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5kZXNjcmliZS5vbmx5ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IGNvbnRleHQuZGVzY3JpYmUodGl0bGUsIGZuKTtcbiAgICAgIG1vY2hhLmdyZXAoc3VpdGUuZnVsbFRpdGxlKCkpO1xuICAgICAgcmV0dXJuIHN1aXRlO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZSBhIHNwZWNpZmljYXRpb24gb3IgdGVzdC1jYXNlXG4gICAgICogd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYCBhbmQgY2FsbGJhY2sgYGZuYFxuICAgICAqIGFjdGluZyBhcyBhIHRodW5rLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5pdCA9IGNvbnRleHQuc3BlY2lmeSA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gICAgICB2YXIgc3VpdGUgPSBzdWl0ZXNbMF07XG4gICAgICBpZiAoc3VpdGUucGVuZGluZykgdmFyIGZuID0gbnVsbDtcbiAgICAgIHZhciB0ZXN0ID0gbmV3IFRlc3QodGl0bGUsIGZuKTtcbiAgICAgIHRlc3QuZmlsZSA9IGZpbGU7XG4gICAgICBzdWl0ZS5hZGRUZXN0KHRlc3QpO1xuICAgICAgcmV0dXJuIHRlc3Q7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4Y2x1c2l2ZSB0ZXN0LWNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0Lml0Lm9ubHkgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHRlc3QgPSBjb250ZXh0Lml0KHRpdGxlLCBmbik7XG4gICAgICB2YXIgcmVTdHJpbmcgPSAnXicgKyB1dGlscy5lc2NhcGVSZWdleHAodGVzdC5mdWxsVGl0bGUoKSkgKyAnJCc7XG4gICAgICBtb2NoYS5ncmVwKG5ldyBSZWdFeHAocmVTdHJpbmcpKTtcbiAgICAgIHJldHVybiB0ZXN0O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBQZW5kaW5nIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQueGl0ID1cbiAgICBjb250ZXh0LnhzcGVjaWZ5ID1cbiAgICBjb250ZXh0Lml0LnNraXAgPSBmdW5jdGlvbih0aXRsZSl7XG4gICAgICBjb250ZXh0Lml0KHRpdGxlKTtcbiAgICB9O1xuICB9KTtcbn07XG5cbn0pOyAvLyBtb2R1bGU6IGludGVyZmFjZXMvYmRkLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJpbnRlcmZhY2VzL2V4cG9ydHMuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBTdWl0ZSA9IHJlcXVpcmUoJy4uL3N1aXRlJylcbiAgLCBUZXN0ID0gcmVxdWlyZSgnLi4vdGVzdCcpO1xuXG4vKipcbiAqIFRERC1zdHlsZSBpbnRlcmZhY2U6XG4gKlxuICogICAgIGV4cG9ydHMuQXJyYXkgPSB7XG4gKiAgICAgICAnI2luZGV4T2YoKSc6IHtcbiAqICAgICAgICAgJ3Nob3VsZCByZXR1cm4gLTEgd2hlbiB0aGUgdmFsdWUgaXMgbm90IHByZXNlbnQnOiBmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgfSxcbiAqXG4gKiAgICAgICAgICdzaG91bGQgcmV0dXJuIHRoZSBjb3JyZWN0IGluZGV4IHdoZW4gdGhlIHZhbHVlIGlzIHByZXNlbnQnOiBmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgfVxuICogICAgICAgfVxuICogICAgIH07XG4gKlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oc3VpdGUpe1xuICB2YXIgc3VpdGVzID0gW3N1aXRlXTtcblxuICBzdWl0ZS5vbigncmVxdWlyZScsIHZpc2l0KTtcblxuICBmdW5jdGlvbiB2aXNpdChvYmosIGZpbGUpIHtcbiAgICB2YXIgc3VpdGU7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIG9ialtrZXldKSB7XG4gICAgICAgIHZhciBmbiA9IG9ialtrZXldO1xuICAgICAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgICAgIGNhc2UgJ2JlZm9yZSc6XG4gICAgICAgICAgICBzdWl0ZXNbMF0uYmVmb3JlQWxsKGZuKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2FmdGVyJzpcbiAgICAgICAgICAgIHN1aXRlc1swXS5hZnRlckFsbChmbik7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdiZWZvcmVFYWNoJzpcbiAgICAgICAgICAgIHN1aXRlc1swXS5iZWZvcmVFYWNoKGZuKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2FmdGVyRWFjaCc6XG4gICAgICAgICAgICBzdWl0ZXNbMF0uYWZ0ZXJFYWNoKGZuKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB2YXIgdGVzdCA9IG5ldyBUZXN0KGtleSwgZm4pO1xuICAgICAgICAgICAgdGVzdC5maWxlID0gZmlsZTtcbiAgICAgICAgICAgIHN1aXRlc1swXS5hZGRUZXN0KHRlc3QpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgc3VpdGUgPSBTdWl0ZS5jcmVhdGUoc3VpdGVzWzBdLCBrZXkpO1xuICAgICAgICBzdWl0ZXMudW5zaGlmdChzdWl0ZSk7XG4gICAgICAgIHZpc2l0KG9ialtrZXldKTtcbiAgICAgICAgc3VpdGVzLnNoaWZ0KCk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG59KTsgLy8gbW9kdWxlOiBpbnRlcmZhY2VzL2V4cG9ydHMuanNcblxucmVxdWlyZS5yZWdpc3RlcihcImludGVyZmFjZXMvaW5kZXguanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuZXhwb3J0cy5iZGQgPSByZXF1aXJlKCcuL2JkZCcpO1xuZXhwb3J0cy50ZGQgPSByZXF1aXJlKCcuL3RkZCcpO1xuZXhwb3J0cy5xdW5pdCA9IHJlcXVpcmUoJy4vcXVuaXQnKTtcbmV4cG9ydHMuZXhwb3J0cyA9IHJlcXVpcmUoJy4vZXhwb3J0cycpO1xuXG59KTsgLy8gbW9kdWxlOiBpbnRlcmZhY2VzL2luZGV4LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJpbnRlcmZhY2VzL3F1bml0LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgU3VpdGUgPSByZXF1aXJlKCcuLi9zdWl0ZScpXG4gICwgVGVzdCA9IHJlcXVpcmUoJy4uL3Rlc3QnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcblxuLyoqXG4gKiBRVW5pdC1zdHlsZSBpbnRlcmZhY2U6XG4gKlxuICogICAgIHN1aXRlKCdBcnJheScpO1xuICpcbiAqICAgICB0ZXN0KCcjbGVuZ3RoJywgZnVuY3Rpb24oKXtcbiAqICAgICAgIHZhciBhcnIgPSBbMSwyLDNdO1xuICogICAgICAgb2soYXJyLmxlbmd0aCA9PSAzKTtcbiAqICAgICB9KTtcbiAqXG4gKiAgICAgdGVzdCgnI2luZGV4T2YoKScsIGZ1bmN0aW9uKCl7XG4gKiAgICAgICB2YXIgYXJyID0gWzEsMiwzXTtcbiAqICAgICAgIG9rKGFyci5pbmRleE9mKDEpID09IDApO1xuICogICAgICAgb2soYXJyLmluZGV4T2YoMikgPT0gMSk7XG4gKiAgICAgICBvayhhcnIuaW5kZXhPZigzKSA9PSAyKTtcbiAqICAgICB9KTtcbiAqXG4gKiAgICAgc3VpdGUoJ1N0cmluZycpO1xuICpcbiAqICAgICB0ZXN0KCcjbGVuZ3RoJywgZnVuY3Rpb24oKXtcbiAqICAgICAgIG9rKCdmb28nLmxlbmd0aCA9PSAzKTtcbiAqICAgICB9KTtcbiAqXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzdWl0ZSl7XG4gIHZhciBzdWl0ZXMgPSBbc3VpdGVdO1xuXG4gIHN1aXRlLm9uKCdwcmUtcmVxdWlyZScsIGZ1bmN0aW9uKGNvbnRleHQsIGZpbGUsIG1vY2hhKXtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYmVmb3JlIHJ1bm5pbmcgdGVzdHMuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmJlZm9yZSA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5iZWZvcmVBbGwobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIGFmdGVyIHJ1bm5pbmcgdGVzdHMuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmFmdGVyID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmFmdGVyQWxsKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBiZWZvcmUgZWFjaCB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmJlZm9yZUVhY2ggPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYmVmb3JlRWFjaChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYWZ0ZXIgZWFjaCB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LmFmdGVyRWFjaCA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5hZnRlckVhY2gobmFtZSwgZm4pO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZSBhIFwic3VpdGVcIiB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zdWl0ZSA9IGZ1bmN0aW9uKHRpdGxlKXtcbiAgICAgIGlmIChzdWl0ZXMubGVuZ3RoID4gMSkgc3VpdGVzLnNoaWZ0KCk7XG4gICAgICB2YXIgc3VpdGUgPSBTdWl0ZS5jcmVhdGUoc3VpdGVzWzBdLCB0aXRsZSk7XG4gICAgICBzdWl0ZS5maWxlID0gZmlsZTtcbiAgICAgIHN1aXRlcy51bnNoaWZ0KHN1aXRlKTtcbiAgICAgIHJldHVybiBzdWl0ZTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhjbHVzaXZlIHRlc3QtY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuc3VpdGUub25seSA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gICAgICB2YXIgc3VpdGUgPSBjb250ZXh0LnN1aXRlKHRpdGxlLCBmbik7XG4gICAgICBtb2NoYS5ncmVwKHN1aXRlLmZ1bGxUaXRsZSgpKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRGVzY3JpYmUgYSBzcGVjaWZpY2F0aW9uIG9yIHRlc3QtY2FzZVxuICAgICAqIHdpdGggdGhlIGdpdmVuIGB0aXRsZWAgYW5kIGNhbGxiYWNrIGBmbmBcbiAgICAgKiBhY3RpbmcgYXMgYSB0aHVuay5cbiAgICAgKi9cblxuICAgIGNvbnRleHQudGVzdCA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gICAgICB2YXIgdGVzdCA9IG5ldyBUZXN0KHRpdGxlLCBmbik7XG4gICAgICB0ZXN0LmZpbGUgPSBmaWxlO1xuICAgICAgc3VpdGVzWzBdLmFkZFRlc3QodGVzdCk7XG4gICAgICByZXR1cm4gdGVzdDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhjbHVzaXZlIHRlc3QtY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQudGVzdC5vbmx5ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciB0ZXN0ID0gY29udGV4dC50ZXN0KHRpdGxlLCBmbik7XG4gICAgICB2YXIgcmVTdHJpbmcgPSAnXicgKyB1dGlscy5lc2NhcGVSZWdleHAodGVzdC5mdWxsVGl0bGUoKSkgKyAnJCc7XG4gICAgICBtb2NoYS5ncmVwKG5ldyBSZWdFeHAocmVTdHJpbmcpKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUGVuZGluZyB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnRlc3Quc2tpcCA9IGZ1bmN0aW9uKHRpdGxlKXtcbiAgICAgIGNvbnRleHQudGVzdCh0aXRsZSk7XG4gICAgfTtcbiAgfSk7XG59O1xuXG59KTsgLy8gbW9kdWxlOiBpbnRlcmZhY2VzL3F1bml0LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJpbnRlcmZhY2VzL3RkZC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIFN1aXRlID0gcmVxdWlyZSgnLi4vc3VpdGUnKVxuICAsIFRlc3QgPSByZXF1aXJlKCcuLi90ZXN0JylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7O1xuXG4vKipcbiAqIFRERC1zdHlsZSBpbnRlcmZhY2U6XG4gKlxuICogICAgICBzdWl0ZSgnQXJyYXknLCBmdW5jdGlvbigpe1xuICogICAgICAgIHN1aXRlKCcjaW5kZXhPZigpJywgZnVuY3Rpb24oKXtcbiAqICAgICAgICAgIHN1aXRlU2V0dXAoZnVuY3Rpb24oKXtcbiAqXG4gKiAgICAgICAgICB9KTtcbiAqXG4gKiAgICAgICAgICB0ZXN0KCdzaG91bGQgcmV0dXJuIC0xIHdoZW4gbm90IHByZXNlbnQnLCBmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgIH0pO1xuICpcbiAqICAgICAgICAgIHRlc3QoJ3Nob3VsZCByZXR1cm4gdGhlIGluZGV4IHdoZW4gcHJlc2VudCcsIGZ1bmN0aW9uKCl7XG4gKlxuICogICAgICAgICAgfSk7XG4gKlxuICogICAgICAgICAgc3VpdGVUZWFyZG93bihmdW5jdGlvbigpe1xuICpcbiAqICAgICAgICAgIH0pO1xuICogICAgICAgIH0pO1xuICogICAgICB9KTtcbiAqXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzdWl0ZSl7XG4gIHZhciBzdWl0ZXMgPSBbc3VpdGVdO1xuXG4gIHN1aXRlLm9uKCdwcmUtcmVxdWlyZScsIGZ1bmN0aW9uKGNvbnRleHQsIGZpbGUsIG1vY2hhKXtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYmVmb3JlIGVhY2ggdGVzdCBjYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zZXR1cCA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgICAgIHN1aXRlc1swXS5iZWZvcmVFYWNoKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBhZnRlciBlYWNoIHRlc3QgY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQudGVhcmRvd24gPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gICAgICBzdWl0ZXNbMF0uYWZ0ZXJFYWNoKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBiZWZvcmUgdGhlIHN1aXRlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zdWl0ZVNldHVwID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmJlZm9yZUFsbChuYW1lLCBmbik7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgYWZ0ZXIgdGhlIHN1aXRlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zdWl0ZVRlYXJkb3duID0gZnVuY3Rpb24obmFtZSwgZm4pe1xuICAgICAgc3VpdGVzWzBdLmFmdGVyQWxsKG5hbWUsIGZuKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRGVzY3JpYmUgYSBcInN1aXRlXCIgd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYFxuICAgICAqIGFuZCBjYWxsYmFjayBgZm5gIGNvbnRhaW5pbmcgbmVzdGVkIHN1aXRlc1xuICAgICAqIGFuZC9vciB0ZXN0cy5cbiAgICAgKi9cblxuICAgIGNvbnRleHQuc3VpdGUgPSBmdW5jdGlvbih0aXRsZSwgZm4pe1xuICAgICAgdmFyIHN1aXRlID0gU3VpdGUuY3JlYXRlKHN1aXRlc1swXSwgdGl0bGUpO1xuICAgICAgc3VpdGUuZmlsZSA9IGZpbGU7XG4gICAgICBzdWl0ZXMudW5zaGlmdChzdWl0ZSk7XG4gICAgICBmbi5jYWxsKHN1aXRlKTtcbiAgICAgIHN1aXRlcy5zaGlmdCgpO1xuICAgICAgcmV0dXJuIHN1aXRlO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBQZW5kaW5nIHN1aXRlLlxuICAgICAqL1xuICAgIGNvbnRleHQuc3VpdGUuc2tpcCA9IGZ1bmN0aW9uKHRpdGxlLCBmbikge1xuICAgICAgdmFyIHN1aXRlID0gU3VpdGUuY3JlYXRlKHN1aXRlc1swXSwgdGl0bGUpO1xuICAgICAgc3VpdGUucGVuZGluZyA9IHRydWU7XG4gICAgICBzdWl0ZXMudW5zaGlmdChzdWl0ZSk7XG4gICAgICBmbi5jYWxsKHN1aXRlKTtcbiAgICAgIHN1aXRlcy5zaGlmdCgpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBFeGNsdXNpdmUgdGVzdC1jYXNlLlxuICAgICAqL1xuXG4gICAgY29udGV4dC5zdWl0ZS5vbmx5ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IGNvbnRleHQuc3VpdGUodGl0bGUsIGZuKTtcbiAgICAgIG1vY2hhLmdyZXAoc3VpdGUuZnVsbFRpdGxlKCkpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBEZXNjcmliZSBhIHNwZWNpZmljYXRpb24gb3IgdGVzdC1jYXNlXG4gICAgICogd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYCBhbmQgY2FsbGJhY2sgYGZuYFxuICAgICAqIGFjdGluZyBhcyBhIHRodW5rLlxuICAgICAqL1xuXG4gICAgY29udGV4dC50ZXN0ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciBzdWl0ZSA9IHN1aXRlc1swXTtcbiAgICAgIGlmIChzdWl0ZS5wZW5kaW5nKSB2YXIgZm4gPSBudWxsO1xuICAgICAgdmFyIHRlc3QgPSBuZXcgVGVzdCh0aXRsZSwgZm4pO1xuICAgICAgdGVzdC5maWxlID0gZmlsZTtcbiAgICAgIHN1aXRlLmFkZFRlc3QodGVzdCk7XG4gICAgICByZXR1cm4gdGVzdDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRXhjbHVzaXZlIHRlc3QtY2FzZS5cbiAgICAgKi9cblxuICAgIGNvbnRleHQudGVzdC5vbmx5ID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgICAgIHZhciB0ZXN0ID0gY29udGV4dC50ZXN0KHRpdGxlLCBmbik7XG4gICAgICB2YXIgcmVTdHJpbmcgPSAnXicgKyB1dGlscy5lc2NhcGVSZWdleHAodGVzdC5mdWxsVGl0bGUoKSkgKyAnJCc7XG4gICAgICBtb2NoYS5ncmVwKG5ldyBSZWdFeHAocmVTdHJpbmcpKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUGVuZGluZyB0ZXN0IGNhc2UuXG4gICAgICovXG5cbiAgICBjb250ZXh0LnRlc3Quc2tpcCA9IGZ1bmN0aW9uKHRpdGxlKXtcbiAgICAgIGNvbnRleHQudGVzdCh0aXRsZSk7XG4gICAgfTtcbiAgfSk7XG59O1xuXG59KTsgLy8gbW9kdWxlOiBpbnRlcmZhY2VzL3RkZC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwibW9jaGEuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qIVxuICogbW9jaGFcbiAqIENvcHlyaWdodChjKSAyMDExIFRKIEhvbG93YXljaHVrIDx0akB2aXNpb24tbWVkaWEuY2E+XG4gKiBNSVQgTGljZW5zZWRcbiAqL1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIHBhdGggPSByZXF1aXJlKCdicm93c2VyL3BhdGgnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG4vKipcbiAqIEV4cG9zZSBgTW9jaGFgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IE1vY2hhO1xuXG4vKipcbiAqIFRvIHJlcXVpcmUgbG9jYWwgVUlzIGFuZCByZXBvcnRlcnMgd2hlbiBydW5uaW5nIGluIG5vZGUuXG4gKi9cblxuaWYgKHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgcHJvY2Vzcy5jd2QgPT09ICdmdW5jdGlvbicpIHtcbiAgdmFyIGpvaW4gPSBwYXRoLmpvaW5cbiAgICAsIGN3ZCA9IHByb2Nlc3MuY3dkKCk7XG4gIG1vZHVsZS5wYXRocy5wdXNoKGN3ZCwgam9pbihjd2QsICdub2RlX21vZHVsZXMnKSk7XG59XG5cbi8qKlxuICogRXhwb3NlIGludGVybmFscy5cbiAqL1xuXG5leHBvcnRzLnV0aWxzID0gdXRpbHM7XG5leHBvcnRzLmludGVyZmFjZXMgPSByZXF1aXJlKCcuL2ludGVyZmFjZXMnKTtcbmV4cG9ydHMucmVwb3J0ZXJzID0gcmVxdWlyZSgnLi9yZXBvcnRlcnMnKTtcbmV4cG9ydHMuUnVubmFibGUgPSByZXF1aXJlKCcuL3J1bm5hYmxlJyk7XG5leHBvcnRzLkNvbnRleHQgPSByZXF1aXJlKCcuL2NvbnRleHQnKTtcbmV4cG9ydHMuUnVubmVyID0gcmVxdWlyZSgnLi9ydW5uZXInKTtcbmV4cG9ydHMuU3VpdGUgPSByZXF1aXJlKCcuL3N1aXRlJyk7XG5leHBvcnRzLkhvb2sgPSByZXF1aXJlKCcuL2hvb2snKTtcbmV4cG9ydHMuVGVzdCA9IHJlcXVpcmUoJy4vdGVzdCcpO1xuXG4vKipcbiAqIFJldHVybiBpbWFnZSBgbmFtZWAgcGF0aC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaW1hZ2UobmFtZSkge1xuICByZXR1cm4gX19kaXJuYW1lICsgJy8uLi9pbWFnZXMvJyArIG5hbWUgKyAnLnBuZyc7XG59XG5cbi8qKlxuICogU2V0dXAgbW9jaGEgd2l0aCBgb3B0aW9uc2AuXG4gKlxuICogT3B0aW9uczpcbiAqXG4gKiAgIC0gYHVpYCBuYW1lIFwiYmRkXCIsIFwidGRkXCIsIFwiZXhwb3J0c1wiIGV0Y1xuICogICAtIGByZXBvcnRlcmAgcmVwb3J0ZXIgaW5zdGFuY2UsIGRlZmF1bHRzIHRvIGBtb2NoYS5yZXBvcnRlcnMuc3BlY2BcbiAqICAgLSBgZ2xvYmFsc2AgYXJyYXkgb2YgYWNjZXB0ZWQgZ2xvYmFsc1xuICogICAtIGB0aW1lb3V0YCB0aW1lb3V0IGluIG1pbGxpc2Vjb25kc1xuICogICAtIGBiYWlsYCBiYWlsIG9uIHRoZSBmaXJzdCB0ZXN0IGZhaWx1cmVcbiAqICAgLSBgc2xvd2AgbWlsbGlzZWNvbmRzIHRvIHdhaXQgYmVmb3JlIGNvbnNpZGVyaW5nIGEgdGVzdCBzbG93XG4gKiAgIC0gYGlnbm9yZUxlYWtzYCBpZ25vcmUgZ2xvYmFsIGxlYWtzXG4gKiAgIC0gYGdyZXBgIHN0cmluZyBvciByZWdleHAgdG8gZmlsdGVyIHRlc3RzIHdpdGhcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBNb2NoYShvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICB0aGlzLmZpbGVzID0gW107XG4gIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gIHRoaXMuZ3JlcChvcHRpb25zLmdyZXApO1xuICB0aGlzLnN1aXRlID0gbmV3IGV4cG9ydHMuU3VpdGUoJycsIG5ldyBleHBvcnRzLkNvbnRleHQpO1xuICB0aGlzLnVpKG9wdGlvbnMudWkpO1xuICB0aGlzLmJhaWwob3B0aW9ucy5iYWlsKTtcbiAgdGhpcy5yZXBvcnRlcihvcHRpb25zLnJlcG9ydGVyKTtcbiAgaWYgKG51bGwgIT0gb3B0aW9ucy50aW1lb3V0KSB0aGlzLnRpbWVvdXQob3B0aW9ucy50aW1lb3V0KTtcbiAgdGhpcy51c2VDb2xvcnMob3B0aW9ucy51c2VDb2xvcnMpXG4gIGlmIChvcHRpb25zLmVuYWJsZVRpbWVvdXRzICE9PSBudWxsKSB0aGlzLmVuYWJsZVRpbWVvdXRzKG9wdGlvbnMuZW5hYmxlVGltZW91dHMpO1xuICBpZiAob3B0aW9ucy5zbG93KSB0aGlzLnNsb3cob3B0aW9ucy5zbG93KTtcblxuICB0aGlzLnN1aXRlLm9uKCdwcmUtcmVxdWlyZScsIGZ1bmN0aW9uIChjb250ZXh0KSB7XG4gICAgZXhwb3J0cy5hZnRlckVhY2ggPSBjb250ZXh0LmFmdGVyRWFjaCB8fCBjb250ZXh0LnRlYXJkb3duO1xuICAgIGV4cG9ydHMuYWZ0ZXIgPSBjb250ZXh0LmFmdGVyIHx8IGNvbnRleHQuc3VpdGVUZWFyZG93bjtcbiAgICBleHBvcnRzLmJlZm9yZUVhY2ggPSBjb250ZXh0LmJlZm9yZUVhY2ggfHwgY29udGV4dC5zZXR1cDtcbiAgICBleHBvcnRzLmJlZm9yZSA9IGNvbnRleHQuYmVmb3JlIHx8IGNvbnRleHQuc3VpdGVTZXR1cDtcbiAgICBleHBvcnRzLmRlc2NyaWJlID0gY29udGV4dC5kZXNjcmliZSB8fCBjb250ZXh0LnN1aXRlO1xuICAgIGV4cG9ydHMuaXQgPSBjb250ZXh0Lml0IHx8IGNvbnRleHQudGVzdDtcbiAgICBleHBvcnRzLnNldHVwID0gY29udGV4dC5zZXR1cCB8fCBjb250ZXh0LmJlZm9yZUVhY2g7XG4gICAgZXhwb3J0cy5zdWl0ZVNldHVwID0gY29udGV4dC5zdWl0ZVNldHVwIHx8IGNvbnRleHQuYmVmb3JlO1xuICAgIGV4cG9ydHMuc3VpdGVUZWFyZG93biA9IGNvbnRleHQuc3VpdGVUZWFyZG93biB8fCBjb250ZXh0LmFmdGVyO1xuICAgIGV4cG9ydHMuc3VpdGUgPSBjb250ZXh0LnN1aXRlIHx8IGNvbnRleHQuZGVzY3JpYmU7XG4gICAgZXhwb3J0cy50ZWFyZG93biA9IGNvbnRleHQudGVhcmRvd24gfHwgY29udGV4dC5hZnRlckVhY2g7XG4gICAgZXhwb3J0cy50ZXN0ID0gY29udGV4dC50ZXN0IHx8IGNvbnRleHQuaXQ7XG4gIH0pO1xufVxuXG4vKipcbiAqIEVuYWJsZSBvciBkaXNhYmxlIGJhaWxpbmcgb24gdGhlIGZpcnN0IGZhaWx1cmUuXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBbYmFpbF1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmJhaWwgPSBmdW5jdGlvbihiYWlsKXtcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkgYmFpbCA9IHRydWU7XG4gIHRoaXMuc3VpdGUuYmFpbChiYWlsKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEFkZCB0ZXN0IGBmaWxlYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuYWRkRmlsZSA9IGZ1bmN0aW9uKGZpbGUpe1xuICB0aGlzLmZpbGVzLnB1c2goZmlsZSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgcmVwb3J0ZXIgdG8gYHJlcG9ydGVyYCwgZGVmYXVsdHMgdG8gXCJzcGVjXCIuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8RnVuY3Rpb259IHJlcG9ydGVyIG5hbWUgb3IgY29uc3RydWN0b3JcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLnJlcG9ydGVyID0gZnVuY3Rpb24ocmVwb3J0ZXIpe1xuICBpZiAoJ2Z1bmN0aW9uJyA9PSB0eXBlb2YgcmVwb3J0ZXIpIHtcbiAgICB0aGlzLl9yZXBvcnRlciA9IHJlcG9ydGVyO1xuICB9IGVsc2Uge1xuICAgIHJlcG9ydGVyID0gcmVwb3J0ZXIgfHwgJ3NwZWMnO1xuICAgIHZhciBfcmVwb3J0ZXI7XG4gICAgdHJ5IHsgX3JlcG9ydGVyID0gcmVxdWlyZSgnLi9yZXBvcnRlcnMvJyArIHJlcG9ydGVyKTsgfSBjYXRjaCAoZXJyKSB7fTtcbiAgICBpZiAoIV9yZXBvcnRlcikgdHJ5IHsgX3JlcG9ydGVyID0gcmVxdWlyZShyZXBvcnRlcik7IH0gY2F0Y2ggKGVycikge307XG4gICAgaWYgKCFfcmVwb3J0ZXIgJiYgcmVwb3J0ZXIgPT09ICd0ZWFtY2l0eScpXG4gICAgICBjb25zb2xlLndhcm4oJ1RoZSBUZWFtY2l0eSByZXBvcnRlciB3YXMgbW92ZWQgdG8gYSBwYWNrYWdlIG5hbWVkICcgK1xuICAgICAgICAnbW9jaGEtdGVhbWNpdHktcmVwb3J0ZXIgJyArXG4gICAgICAgICcoaHR0cHM6Ly9ucG1qcy5vcmcvcGFja2FnZS9tb2NoYS10ZWFtY2l0eS1yZXBvcnRlcikuJyk7XG4gICAgaWYgKCFfcmVwb3J0ZXIpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCByZXBvcnRlciBcIicgKyByZXBvcnRlciArICdcIicpO1xuICAgIHRoaXMuX3JlcG9ydGVyID0gX3JlcG9ydGVyO1xuICB9XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGVzdCBVSSBgbmFtZWAsIGRlZmF1bHRzIHRvIFwiYmRkXCIuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGJkZFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUudWkgPSBmdW5jdGlvbihuYW1lKXtcbiAgbmFtZSA9IG5hbWUgfHwgJ2JkZCc7XG4gIHRoaXMuX3VpID0gZXhwb3J0cy5pbnRlcmZhY2VzW25hbWVdO1xuICBpZiAoIXRoaXMuX3VpKSB0cnkgeyB0aGlzLl91aSA9IHJlcXVpcmUobmFtZSk7IH0gY2F0Y2ggKGVycikge307XG4gIGlmICghdGhpcy5fdWkpIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBpbnRlcmZhY2UgXCInICsgbmFtZSArICdcIicpO1xuICB0aGlzLl91aSA9IHRoaXMuX3VpKHRoaXMuc3VpdGUpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogTG9hZCByZWdpc3RlcmVkIGZpbGVzLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk1vY2hhLnByb3RvdHlwZS5sb2FkRmlsZXMgPSBmdW5jdGlvbihmbil7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIHN1aXRlID0gdGhpcy5zdWl0ZTtcbiAgdmFyIHBlbmRpbmcgPSB0aGlzLmZpbGVzLmxlbmd0aDtcbiAgdGhpcy5maWxlcy5mb3JFYWNoKGZ1bmN0aW9uKGZpbGUpe1xuICAgIGZpbGUgPSBwYXRoLnJlc29sdmUoZmlsZSk7XG4gICAgc3VpdGUuZW1pdCgncHJlLXJlcXVpcmUnLCBnbG9iYWwsIGZpbGUsIHNlbGYpO1xuICAgIHN1aXRlLmVtaXQoJ3JlcXVpcmUnLCByZXF1aXJlKGZpbGUpLCBmaWxlLCBzZWxmKTtcbiAgICBzdWl0ZS5lbWl0KCdwb3N0LXJlcXVpcmUnLCBnbG9iYWwsIGZpbGUsIHNlbGYpO1xuICAgIC0tcGVuZGluZyB8fCAoZm4gJiYgZm4oKSk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBFbmFibGUgZ3Jvd2wgc3VwcG9ydC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuX2dyb3dsID0gZnVuY3Rpb24ocnVubmVyLCByZXBvcnRlcikge1xuICB2YXIgbm90aWZ5ID0gcmVxdWlyZSgnZ3Jvd2wnKTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgdmFyIHN0YXRzID0gcmVwb3J0ZXIuc3RhdHM7XG4gICAgaWYgKHN0YXRzLmZhaWx1cmVzKSB7XG4gICAgICB2YXIgbXNnID0gc3RhdHMuZmFpbHVyZXMgKyAnIG9mICcgKyBydW5uZXIudG90YWwgKyAnIHRlc3RzIGZhaWxlZCc7XG4gICAgICBub3RpZnkobXNnLCB7IG5hbWU6ICdtb2NoYScsIHRpdGxlOiAnRmFpbGVkJywgaW1hZ2U6IGltYWdlKCdlcnJvcicpIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBub3RpZnkoc3RhdHMucGFzc2VzICsgJyB0ZXN0cyBwYXNzZWQgaW4gJyArIHN0YXRzLmR1cmF0aW9uICsgJ21zJywge1xuICAgICAgICAgIG5hbWU6ICdtb2NoYSdcbiAgICAgICAgLCB0aXRsZTogJ1Bhc3NlZCdcbiAgICAgICAgLCBpbWFnZTogaW1hZ2UoJ29rJylcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vKipcbiAqIEFkZCByZWdleHAgdG8gZ3JlcCwgaWYgYHJlYCBpcyBhIHN0cmluZyBpdCBpcyBlc2NhcGVkLlxuICpcbiAqIEBwYXJhbSB7UmVnRXhwfFN0cmluZ30gcmVcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuZ3JlcCA9IGZ1bmN0aW9uKHJlKXtcbiAgdGhpcy5vcHRpb25zLmdyZXAgPSAnc3RyaW5nJyA9PSB0eXBlb2YgcmVcbiAgICA/IG5ldyBSZWdFeHAodXRpbHMuZXNjYXBlUmVnZXhwKHJlKSlcbiAgICA6IHJlO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogSW52ZXJ0IGAuZ3JlcCgpYCBtYXRjaGVzLlxuICpcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuaW52ZXJ0ID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5vcHRpb25zLmludmVydCA9IHRydWU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBJZ25vcmUgZ2xvYmFsIGxlYWtzLlxuICpcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gaWdub3JlXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmlnbm9yZUxlYWtzID0gZnVuY3Rpb24oaWdub3JlKXtcbiAgdGhpcy5vcHRpb25zLmlnbm9yZUxlYWtzID0gISFpZ25vcmU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBFbmFibGUgZ2xvYmFsIGxlYWsgY2hlY2tpbmcuXG4gKlxuICogQHJldHVybiB7TW9jaGF9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbk1vY2hhLnByb3RvdHlwZS5jaGVja0xlYWtzID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5vcHRpb25zLmlnbm9yZUxlYWtzID0gZmFsc2U7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBFbmFibGUgZ3Jvd2wgc3VwcG9ydC5cbiAqXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmdyb3dsID0gZnVuY3Rpb24oKXtcbiAgdGhpcy5vcHRpb25zLmdyb3dsID0gdHJ1ZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIElnbm9yZSBgZ2xvYmFsc2AgYXJyYXkgb3Igc3RyaW5nLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl8U3RyaW5nfSBnbG9iYWxzXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmdsb2JhbHMgPSBmdW5jdGlvbihnbG9iYWxzKXtcbiAgdGhpcy5vcHRpb25zLmdsb2JhbHMgPSAodGhpcy5vcHRpb25zLmdsb2JhbHMgfHwgW10pLmNvbmNhdChnbG9iYWxzKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEVtaXQgY29sb3Igb3V0cHV0LlxuICpcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gY29sb3JzXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLnVzZUNvbG9ycyA9IGZ1bmN0aW9uKGNvbG9ycyl7XG4gIHRoaXMub3B0aW9ucy51c2VDb2xvcnMgPSBhcmd1bWVudHMubGVuZ3RoICYmIGNvbG9ycyAhPSB1bmRlZmluZWRcbiAgICA/IGNvbG9yc1xuICAgIDogdHJ1ZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFVzZSBpbmxpbmUgZGlmZnMgcmF0aGVyIHRoYW4gKy8tLlxuICpcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gaW5saW5lRGlmZnNcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUudXNlSW5saW5lRGlmZnMgPSBmdW5jdGlvbihpbmxpbmVEaWZmcykge1xuICB0aGlzLm9wdGlvbnMudXNlSW5saW5lRGlmZnMgPSBhcmd1bWVudHMubGVuZ3RoICYmIGlubGluZURpZmZzICE9IHVuZGVmaW5lZFxuICA/IGlubGluZURpZmZzXG4gIDogZmFsc2U7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIHRpbWVvdXQgaW4gbWlsbGlzZWNvbmRzLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lb3V0XG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLnRpbWVvdXQgPSBmdW5jdGlvbih0aW1lb3V0KXtcbiAgdGhpcy5zdWl0ZS50aW1lb3V0KHRpbWVvdXQpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IHNsb3duZXNzIHRocmVzaG9sZCBpbiBtaWxsaXNlY29uZHMuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IHNsb3dcbiAqIEByZXR1cm4ge01vY2hhfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Nb2NoYS5wcm90b3R5cGUuc2xvdyA9IGZ1bmN0aW9uKHNsb3cpe1xuICB0aGlzLnN1aXRlLnNsb3coc2xvdyk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBFbmFibGUgdGltZW91dHMuXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVkXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmVuYWJsZVRpbWVvdXRzID0gZnVuY3Rpb24oZW5hYmxlZCkge1xuICB0aGlzLnN1aXRlLmVuYWJsZVRpbWVvdXRzKGFyZ3VtZW50cy5sZW5ndGggJiYgZW5hYmxlZCAhPT0gdW5kZWZpbmVkXG4gICAgPyBlbmFibGVkXG4gICAgOiB0cnVlKTtcbiAgcmV0dXJuIHRoaXNcbn07XG5cbi8qKlxuICogTWFrZXMgYWxsIHRlc3RzIGFzeW5jIChhY2NlcHRpbmcgYSBjYWxsYmFjaylcbiAqXG4gKiBAcmV0dXJuIHtNb2NoYX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLmFzeW5jT25seSA9IGZ1bmN0aW9uKCl7XG4gIHRoaXMub3B0aW9ucy5hc3luY09ubHkgPSB0cnVlO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUnVuIHRlc3RzIGFuZCBpbnZva2UgYGZuKClgIHdoZW4gY29tcGxldGUuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1J1bm5lcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuTW9jaGEucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uKGZuKXtcbiAgaWYgKHRoaXMuZmlsZXMubGVuZ3RoKSB0aGlzLmxvYWRGaWxlcygpO1xuICB2YXIgc3VpdGUgPSB0aGlzLnN1aXRlO1xuICB2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcbiAgb3B0aW9ucy5maWxlcyA9IHRoaXMuZmlsZXM7XG4gIHZhciBydW5uZXIgPSBuZXcgZXhwb3J0cy5SdW5uZXIoc3VpdGUpO1xuICB2YXIgcmVwb3J0ZXIgPSBuZXcgdGhpcy5fcmVwb3J0ZXIocnVubmVyLCBvcHRpb25zKTtcbiAgcnVubmVyLmlnbm9yZUxlYWtzID0gZmFsc2UgIT09IG9wdGlvbnMuaWdub3JlTGVha3M7XG4gIHJ1bm5lci5hc3luY09ubHkgPSBvcHRpb25zLmFzeW5jT25seTtcbiAgaWYgKG9wdGlvbnMuZ3JlcCkgcnVubmVyLmdyZXAob3B0aW9ucy5ncmVwLCBvcHRpb25zLmludmVydCk7XG4gIGlmIChvcHRpb25zLmdsb2JhbHMpIHJ1bm5lci5nbG9iYWxzKG9wdGlvbnMuZ2xvYmFscyk7XG4gIGlmIChvcHRpb25zLmdyb3dsKSB0aGlzLl9ncm93bChydW5uZXIsIHJlcG9ydGVyKTtcbiAgZXhwb3J0cy5yZXBvcnRlcnMuQmFzZS51c2VDb2xvcnMgPSBvcHRpb25zLnVzZUNvbG9ycztcbiAgZXhwb3J0cy5yZXBvcnRlcnMuQmFzZS5pbmxpbmVEaWZmcyA9IG9wdGlvbnMudXNlSW5saW5lRGlmZnM7XG4gIHJldHVybiBydW5uZXIucnVuKGZuKTtcbn07XG5cbn0pOyAvLyBtb2R1bGU6IG1vY2hhLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJtcy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyoqXG4gKiBIZWxwZXJzLlxuICovXG5cbnZhciBzID0gMTAwMDtcbnZhciBtID0gcyAqIDYwO1xudmFyIGggPSBtICogNjA7XG52YXIgZCA9IGggKiAyNDtcbnZhciB5ID0gZCAqIDM2NS4yNTtcblxuLyoqXG4gKiBQYXJzZSBvciBmb3JtYXQgdGhlIGdpdmVuIGB2YWxgLlxuICpcbiAqIE9wdGlvbnM6XG4gKlxuICogIC0gYGxvbmdgIHZlcmJvc2UgZm9ybWF0dGluZyBbZmFsc2VdXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSB2YWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtTdHJpbmd8TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHZhbCwgb3B0aW9ucyl7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIHZhbCkgcmV0dXJuIHBhcnNlKHZhbCk7XG4gIHJldHVybiBvcHRpb25zLmxvbmcgPyBsb25nRm9ybWF0KHZhbCkgOiBzaG9ydEZvcm1hdCh2YWwpO1xufTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gYHN0cmAgYW5kIHJldHVybiBtaWxsaXNlY29uZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyc2Uoc3RyKSB7XG4gIHZhciBtYXRjaCA9IC9eKCg/OlxcZCspP1xcLj9cXGQrKSAqKG1zfHNlY29uZHM/fHN8bWludXRlcz98bXxob3Vycz98aHxkYXlzP3xkfHllYXJzP3x5KT8kL2kuZXhlYyhzdHIpO1xuICBpZiAoIW1hdGNoKSByZXR1cm47XG4gIHZhciBuID0gcGFyc2VGbG9hdChtYXRjaFsxXSk7XG4gIHZhciB0eXBlID0gKG1hdGNoWzJdIHx8ICdtcycpLnRvTG93ZXJDYXNlKCk7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ3llYXJzJzpcbiAgICBjYXNlICd5ZWFyJzpcbiAgICBjYXNlICd5JzpcbiAgICAgIHJldHVybiBuICogeTtcbiAgICBjYXNlICdkYXlzJzpcbiAgICBjYXNlICdkYXknOlxuICAgIGNhc2UgJ2QnOlxuICAgICAgcmV0dXJuIG4gKiBkO1xuICAgIGNhc2UgJ2hvdXJzJzpcbiAgICBjYXNlICdob3VyJzpcbiAgICBjYXNlICdoJzpcbiAgICAgIHJldHVybiBuICogaDtcbiAgICBjYXNlICdtaW51dGVzJzpcbiAgICBjYXNlICdtaW51dGUnOlxuICAgIGNhc2UgJ20nOlxuICAgICAgcmV0dXJuIG4gKiBtO1xuICAgIGNhc2UgJ3NlY29uZHMnOlxuICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgY2FzZSAncyc6XG4gICAgICByZXR1cm4gbiAqIHM7XG4gICAgY2FzZSAnbXMnOlxuICAgICAgcmV0dXJuIG47XG4gIH1cbn1cblxuLyoqXG4gKiBTaG9ydCBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzaG9ydEZvcm1hdChtcykge1xuICBpZiAobXMgPj0gZCkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBkKSArICdkJztcbiAgaWYgKG1zID49IGgpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gaCkgKyAnaCc7XG4gIGlmIChtcyA+PSBtKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIG0pICsgJ20nO1xuICBpZiAobXMgPj0gcykgcmV0dXJuIE1hdGgucm91bmQobXMgLyBzKSArICdzJztcbiAgcmV0dXJuIG1zICsgJ21zJztcbn1cblxuLyoqXG4gKiBMb25nIGZvcm1hdCBmb3IgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvbmdGb3JtYXQobXMpIHtcbiAgcmV0dXJuIHBsdXJhbChtcywgZCwgJ2RheScpXG4gICAgfHwgcGx1cmFsKG1zLCBoLCAnaG91cicpXG4gICAgfHwgcGx1cmFsKG1zLCBtLCAnbWludXRlJylcbiAgICB8fCBwbHVyYWwobXMsIHMsICdzZWNvbmQnKVxuICAgIHx8IG1zICsgJyBtcyc7XG59XG5cbi8qKlxuICogUGx1cmFsaXphdGlvbiBoZWxwZXIuXG4gKi9cblxuZnVuY3Rpb24gcGx1cmFsKG1zLCBuLCBuYW1lKSB7XG4gIGlmIChtcyA8IG4pIHJldHVybjtcbiAgaWYgKG1zIDwgbiAqIDEuNSkgcmV0dXJuIE1hdGguZmxvb3IobXMgLyBuKSArICcgJyArIG5hbWU7XG4gIHJldHVybiBNYXRoLmNlaWwobXMgLyBuKSArICcgJyArIG5hbWUgKyAncyc7XG59XG5cbn0pOyAvLyBtb2R1bGU6IG1zLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvYmFzZS5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIHR0eSA9IHJlcXVpcmUoJ2Jyb3dzZXIvdHR5JylcbiAgLCBkaWZmID0gcmVxdWlyZSgnYnJvd3Nlci9kaWZmJylcbiAgLCBtcyA9IHJlcXVpcmUoJy4uL21zJylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbi8qKlxuICogU2F2ZSB0aW1lciByZWZlcmVuY2VzIHRvIGF2b2lkIFNpbm9uIGludGVyZmVyaW5nIChzZWUgR0gtMjM3KS5cbiAqL1xuXG52YXIgRGF0ZSA9IGdsb2JhbC5EYXRlXG4gICwgc2V0VGltZW91dCA9IGdsb2JhbC5zZXRUaW1lb3V0XG4gICwgc2V0SW50ZXJ2YWwgPSBnbG9iYWwuc2V0SW50ZXJ2YWxcbiAgLCBjbGVhclRpbWVvdXQgPSBnbG9iYWwuY2xlYXJUaW1lb3V0XG4gICwgY2xlYXJJbnRlcnZhbCA9IGdsb2JhbC5jbGVhckludGVydmFsO1xuXG4vKipcbiAqIENoZWNrIGlmIGJvdGggc3RkaW8gc3RyZWFtcyBhcmUgYXNzb2NpYXRlZCB3aXRoIGEgdHR5LlxuICovXG5cbnZhciBpc2F0dHkgPSB0dHkuaXNhdHR5KDEpICYmIHR0eS5pc2F0dHkoMik7XG5cbi8qKlxuICogRXhwb3NlIGBCYXNlYC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBCYXNlO1xuXG4vKipcbiAqIEVuYWJsZSBjb2xvcmluZyBieSBkZWZhdWx0LlxuICovXG5cbmV4cG9ydHMudXNlQ29sb3JzID0gaXNhdHR5IHx8IChwcm9jZXNzLmVudi5NT0NIQV9DT0xPUlMgIT09IHVuZGVmaW5lZCk7XG5cbi8qKlxuICogSW5saW5lIGRpZmZzIGluc3RlYWQgb2YgKy8tXG4gKi9cblxuZXhwb3J0cy5pbmxpbmVEaWZmcyA9IGZhbHNlO1xuXG4vKipcbiAqIERlZmF1bHQgY29sb3IgbWFwLlxuICovXG5cbmV4cG9ydHMuY29sb3JzID0ge1xuICAgICdwYXNzJzogOTBcbiAgLCAnZmFpbCc6IDMxXG4gICwgJ2JyaWdodCBwYXNzJzogOTJcbiAgLCAnYnJpZ2h0IGZhaWwnOiA5MVxuICAsICdicmlnaHQgeWVsbG93JzogOTNcbiAgLCAncGVuZGluZyc6IDM2XG4gICwgJ3N1aXRlJzogMFxuICAsICdlcnJvciB0aXRsZSc6IDBcbiAgLCAnZXJyb3IgbWVzc2FnZSc6IDMxXG4gICwgJ2Vycm9yIHN0YWNrJzogOTBcbiAgLCAnY2hlY2ttYXJrJzogMzJcbiAgLCAnZmFzdCc6IDkwXG4gICwgJ21lZGl1bSc6IDMzXG4gICwgJ3Nsb3cnOiAzMVxuICAsICdncmVlbic6IDMyXG4gICwgJ2xpZ2h0JzogOTBcbiAgLCAnZGlmZiBndXR0ZXInOiA5MFxuICAsICdkaWZmIGFkZGVkJzogNDJcbiAgLCAnZGlmZiByZW1vdmVkJzogNDFcbn07XG5cbi8qKlxuICogRGVmYXVsdCBzeW1ib2wgbWFwLlxuICovXG5cbmV4cG9ydHMuc3ltYm9scyA9IHtcbiAgb2s6ICfinJMnLFxuICBlcnI6ICfinJYnLFxuICBkb3Q6ICfigKQnXG59O1xuXG4vLyBXaXRoIG5vZGUuanMgb24gV2luZG93czogdXNlIHN5bWJvbHMgYXZhaWxhYmxlIGluIHRlcm1pbmFsIGRlZmF1bHQgZm9udHNcbmlmICgnd2luMzInID09IHByb2Nlc3MucGxhdGZvcm0pIHtcbiAgZXhwb3J0cy5zeW1ib2xzLm9rID0gJ1xcdTIyMUEnO1xuICBleHBvcnRzLnN5bWJvbHMuZXJyID0gJ1xcdTAwRDcnO1xuICBleHBvcnRzLnN5bWJvbHMuZG90ID0gJy4nO1xufVxuXG4vKipcbiAqIENvbG9yIGBzdHJgIHdpdGggdGhlIGdpdmVuIGB0eXBlYCxcbiAqIGFsbG93aW5nIGNvbG9ycyB0byBiZSBkaXNhYmxlZCxcbiAqIGFzIHdlbGwgYXMgdXNlci1kZWZpbmVkIGNvbG9yXG4gKiBzY2hlbWVzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG52YXIgY29sb3IgPSBleHBvcnRzLmNvbG9yID0gZnVuY3Rpb24odHlwZSwgc3RyKSB7XG4gIGlmICghZXhwb3J0cy51c2VDb2xvcnMpIHJldHVybiBzdHI7XG4gIHJldHVybiAnXFx1MDAxYlsnICsgZXhwb3J0cy5jb2xvcnNbdHlwZV0gKyAnbScgKyBzdHIgKyAnXFx1MDAxYlswbSc7XG59O1xuXG4vKipcbiAqIEV4cG9zZSB0ZXJtIHdpbmRvdyBzaXplLCB3aXRoIHNvbWVcbiAqIGRlZmF1bHRzIGZvciB3aGVuIHN0ZGVyciBpcyBub3QgYSB0dHkuXG4gKi9cblxuZXhwb3J0cy53aW5kb3cgPSB7XG4gIHdpZHRoOiBpc2F0dHlcbiAgICA/IHByb2Nlc3Muc3Rkb3V0LmdldFdpbmRvd1NpemVcbiAgICAgID8gcHJvY2Vzcy5zdGRvdXQuZ2V0V2luZG93U2l6ZSgxKVswXVxuICAgICAgOiB0dHkuZ2V0V2luZG93U2l6ZSgpWzFdXG4gICAgOiA3NVxufTtcblxuLyoqXG4gKiBFeHBvc2Ugc29tZSBiYXNpYyBjdXJzb3IgaW50ZXJhY3Rpb25zXG4gKiB0aGF0IGFyZSBjb21tb24gYW1vbmcgcmVwb3J0ZXJzLlxuICovXG5cbmV4cG9ydHMuY3Vyc29yID0ge1xuICBoaWRlOiBmdW5jdGlvbigpe1xuICAgIGlzYXR0eSAmJiBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFx1MDAxYls/MjVsJyk7XG4gIH0sXG5cbiAgc2hvdzogZnVuY3Rpb24oKXtcbiAgICBpc2F0dHkgJiYgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1xcdTAwMWJbPzI1aCcpO1xuICB9LFxuXG4gIGRlbGV0ZUxpbmU6IGZ1bmN0aW9uKCl7XG4gICAgaXNhdHR5ICYmIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHUwMDFiWzJLJyk7XG4gIH0sXG5cbiAgYmVnaW5uaW5nT2ZMaW5lOiBmdW5jdGlvbigpe1xuICAgIGlzYXR0eSAmJiBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFx1MDAxYlswRycpO1xuICB9LFxuXG4gIENSOiBmdW5jdGlvbigpe1xuICAgIGlmIChpc2F0dHkpIHtcbiAgICAgIGV4cG9ydHMuY3Vyc29yLmRlbGV0ZUxpbmUoKTtcbiAgICAgIGV4cG9ydHMuY3Vyc29yLmJlZ2lubmluZ09mTGluZSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFxyJyk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIE91dHV0IHRoZSBnaXZlbiBgZmFpbHVyZXNgIGFzIGEgbGlzdC5cbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBmYWlsdXJlc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLmxpc3QgPSBmdW5jdGlvbihmYWlsdXJlcyl7XG4gIGNvbnNvbGUuZXJyb3IoKTtcbiAgZmFpbHVyZXMuZm9yRWFjaChmdW5jdGlvbih0ZXN0LCBpKXtcbiAgICAvLyBmb3JtYXRcbiAgICB2YXIgZm10ID0gY29sb3IoJ2Vycm9yIHRpdGxlJywgJyAgJXMpICVzOlxcbicpXG4gICAgICArIGNvbG9yKCdlcnJvciBtZXNzYWdlJywgJyAgICAgJXMnKVxuICAgICAgKyBjb2xvcignZXJyb3Igc3RhY2snLCAnXFxuJXNcXG4nKTtcblxuICAgIC8vIG1zZ1xuICAgIHZhciBlcnIgPSB0ZXN0LmVyclxuICAgICAgLCBtZXNzYWdlID0gZXJyLm1lc3NhZ2UgfHwgJydcbiAgICAgICwgc3RhY2sgPSBlcnIuc3RhY2sgfHwgbWVzc2FnZVxuICAgICAgLCBpbmRleCA9IHN0YWNrLmluZGV4T2YobWVzc2FnZSkgKyBtZXNzYWdlLmxlbmd0aFxuICAgICAgLCBtc2cgPSBzdGFjay5zbGljZSgwLCBpbmRleClcbiAgICAgICwgYWN0dWFsID0gZXJyLmFjdHVhbFxuICAgICAgLCBleHBlY3RlZCA9IGVyci5leHBlY3RlZFxuICAgICAgLCBlc2NhcGUgPSB0cnVlO1xuXG4gICAgLy8gdW5jYXVnaHRcbiAgICBpZiAoZXJyLnVuY2F1Z2h0KSB7XG4gICAgICBtc2cgPSAnVW5jYXVnaHQgJyArIG1zZztcbiAgICB9XG5cbiAgICAvLyBleHBsaWNpdGx5IHNob3cgZGlmZlxuICAgIGlmIChlcnIuc2hvd0RpZmYgJiYgc2FtZVR5cGUoYWN0dWFsLCBleHBlY3RlZCkpIHtcbiAgICAgIGVzY2FwZSA9IGZhbHNlO1xuICAgICAgZXJyLmFjdHVhbCA9IGFjdHVhbCA9IHV0aWxzLnN0cmluZ2lmeShhY3R1YWwpO1xuICAgICAgZXJyLmV4cGVjdGVkID0gZXhwZWN0ZWQgPSB1dGlscy5zdHJpbmdpZnkoZXhwZWN0ZWQpO1xuICAgIH1cblxuICAgIC8vIGFjdHVhbCAvIGV4cGVjdGVkIGRpZmZcbiAgICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIGFjdHVhbCAmJiAnc3RyaW5nJyA9PSB0eXBlb2YgZXhwZWN0ZWQpIHtcbiAgICAgIGZtdCA9IGNvbG9yKCdlcnJvciB0aXRsZScsICcgICVzKSAlczpcXG4lcycpICsgY29sb3IoJ2Vycm9yIHN0YWNrJywgJ1xcbiVzXFxuJyk7XG4gICAgICB2YXIgbWF0Y2ggPSBtZXNzYWdlLm1hdGNoKC9eKFteOl0rKTogZXhwZWN0ZWQvKTtcbiAgICAgIG1zZyA9ICdcXG4gICAgICAnICsgY29sb3IoJ2Vycm9yIG1lc3NhZ2UnLCBtYXRjaCA/IG1hdGNoWzFdIDogbXNnKTtcblxuICAgICAgaWYgKGV4cG9ydHMuaW5saW5lRGlmZnMpIHtcbiAgICAgICAgbXNnICs9IGlubGluZURpZmYoZXJyLCBlc2NhcGUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbXNnICs9IHVuaWZpZWREaWZmKGVyciwgZXNjYXBlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpbmRlbnQgc3RhY2sgdHJhY2Ugd2l0aG91dCBtc2dcbiAgICBzdGFjayA9IHN0YWNrLnNsaWNlKGluZGV4ID8gaW5kZXggKyAxIDogaW5kZXgpXG4gICAgICAucmVwbGFjZSgvXi9nbSwgJyAgJyk7XG5cbiAgICBjb25zb2xlLmVycm9yKGZtdCwgKGkgKyAxKSwgdGVzdC5mdWxsVGl0bGUoKSwgbXNnLCBzdGFjayk7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBCYXNlYCByZXBvcnRlci5cbiAqXG4gKiBBbGwgb3RoZXIgcmVwb3J0ZXJzIGdlbmVyYWxseVxuICogaW5oZXJpdCBmcm9tIHRoaXMgcmVwb3J0ZXIsIHByb3ZpZGluZ1xuICogc3RhdHMgc3VjaCBhcyB0ZXN0IGR1cmF0aW9uLCBudW1iZXJcbiAqIG9mIHRlc3RzIHBhc3NlZCAvIGZhaWxlZCBldGMuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBCYXNlKHJ1bm5lcikge1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0cyA9IHsgc3VpdGVzOiAwLCB0ZXN0czogMCwgcGFzc2VzOiAwLCBwZW5kaW5nOiAwLCBmYWlsdXJlczogMCB9XG4gICAgLCBmYWlsdXJlcyA9IHRoaXMuZmFpbHVyZXMgPSBbXTtcblxuICBpZiAoIXJ1bm5lcikgcmV0dXJuO1xuICB0aGlzLnJ1bm5lciA9IHJ1bm5lcjtcblxuICBydW5uZXIuc3RhdHMgPSBzdGF0cztcblxuICBydW5uZXIub24oJ3N0YXJ0JywgZnVuY3Rpb24oKXtcbiAgICBzdGF0cy5zdGFydCA9IG5ldyBEYXRlO1xuICB9KTtcblxuICBydW5uZXIub24oJ3N1aXRlJywgZnVuY3Rpb24oc3VpdGUpe1xuICAgIHN0YXRzLnN1aXRlcyA9IHN0YXRzLnN1aXRlcyB8fCAwO1xuICAgIHN1aXRlLnJvb3QgfHwgc3RhdHMuc3VpdGVzKys7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigndGVzdCBlbmQnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBzdGF0cy50ZXN0cyA9IHN0YXRzLnRlc3RzIHx8IDA7XG4gICAgc3RhdHMudGVzdHMrKztcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgc3RhdHMucGFzc2VzID0gc3RhdHMucGFzc2VzIHx8IDA7XG5cbiAgICB2YXIgbWVkaXVtID0gdGVzdC5zbG93KCkgLyAyO1xuICAgIHRlc3Quc3BlZWQgPSB0ZXN0LmR1cmF0aW9uID4gdGVzdC5zbG93KClcbiAgICAgID8gJ3Nsb3cnXG4gICAgICA6IHRlc3QuZHVyYXRpb24gPiBtZWRpdW1cbiAgICAgICAgPyAnbWVkaXVtJ1xuICAgICAgICA6ICdmYXN0JztcblxuICAgIHN0YXRzLnBhc3NlcysrO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIHN0YXRzLmZhaWx1cmVzID0gc3RhdHMuZmFpbHVyZXMgfHwgMDtcbiAgICBzdGF0cy5mYWlsdXJlcysrO1xuICAgIHRlc3QuZXJyID0gZXJyO1xuICAgIGZhaWx1cmVzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKXtcbiAgICBzdGF0cy5lbmQgPSBuZXcgRGF0ZTtcbiAgICBzdGF0cy5kdXJhdGlvbiA9IG5ldyBEYXRlIC0gc3RhdHMuc3RhcnQ7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGVuZGluZycsIGZ1bmN0aW9uKCl7XG4gICAgc3RhdHMucGVuZGluZysrO1xuICB9KTtcbn1cblxuLyoqXG4gKiBPdXRwdXQgY29tbW9uIGVwaWxvZ3VlIHVzZWQgYnkgbWFueSBvZlxuICogdGhlIGJ1bmRsZWQgcmVwb3J0ZXJzLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuQmFzZS5wcm90b3R5cGUuZXBpbG9ndWUgPSBmdW5jdGlvbigpe1xuICB2YXIgc3RhdHMgPSB0aGlzLnN0YXRzO1xuICB2YXIgdGVzdHM7XG4gIHZhciBmbXQ7XG5cbiAgY29uc29sZS5sb2coKTtcblxuICAvLyBwYXNzZXNcbiAgZm10ID0gY29sb3IoJ2JyaWdodCBwYXNzJywgJyAnKVxuICAgICsgY29sb3IoJ2dyZWVuJywgJyAlZCBwYXNzaW5nJylcbiAgICArIGNvbG9yKCdsaWdodCcsICcgKCVzKScpO1xuXG4gIGNvbnNvbGUubG9nKGZtdCxcbiAgICBzdGF0cy5wYXNzZXMgfHwgMCxcbiAgICBtcyhzdGF0cy5kdXJhdGlvbikpO1xuXG4gIC8vIHBlbmRpbmdcbiAgaWYgKHN0YXRzLnBlbmRpbmcpIHtcbiAgICBmbXQgPSBjb2xvcigncGVuZGluZycsICcgJylcbiAgICAgICsgY29sb3IoJ3BlbmRpbmcnLCAnICVkIHBlbmRpbmcnKTtcblxuICAgIGNvbnNvbGUubG9nKGZtdCwgc3RhdHMucGVuZGluZyk7XG4gIH1cblxuICAvLyBmYWlsdXJlc1xuICBpZiAoc3RhdHMuZmFpbHVyZXMpIHtcbiAgICBmbXQgPSBjb2xvcignZmFpbCcsICcgICVkIGZhaWxpbmcnKTtcblxuICAgIGNvbnNvbGUuZXJyb3IoZm10LFxuICAgICAgc3RhdHMuZmFpbHVyZXMpO1xuXG4gICAgQmFzZS5saXN0KHRoaXMuZmFpbHVyZXMpO1xuICAgIGNvbnNvbGUuZXJyb3IoKTtcbiAgfVxuXG4gIGNvbnNvbGUubG9nKCk7XG59O1xuXG4vKipcbiAqIFBhZCB0aGUgZ2l2ZW4gYHN0cmAgdG8gYGxlbmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHBhcmFtIHtTdHJpbmd9IGxlblxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFkKHN0ciwgbGVuKSB7XG4gIHN0ciA9IFN0cmluZyhzdHIpO1xuICByZXR1cm4gQXJyYXkobGVuIC0gc3RyLmxlbmd0aCArIDEpLmpvaW4oJyAnKSArIHN0cjtcbn1cblxuXG4vKipcbiAqIFJldHVybnMgYW4gaW5saW5lIGRpZmYgYmV0d2VlbiAyIHN0cmluZ3Mgd2l0aCBjb2xvdXJlZCBBTlNJIG91dHB1dFxuICpcbiAqIEBwYXJhbSB7RXJyb3J9IEVycm9yIHdpdGggYWN0dWFsL2V4cGVjdGVkXG4gKiBAcmV0dXJuIHtTdHJpbmd9IERpZmZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGlubGluZURpZmYoZXJyLCBlc2NhcGUpIHtcbiAgdmFyIG1zZyA9IGVycm9yRGlmZihlcnIsICdXb3Jkc1dpdGhTcGFjZScsIGVzY2FwZSk7XG5cbiAgLy8gbGluZW5vc1xuICB2YXIgbGluZXMgPSBtc2cuc3BsaXQoJ1xcbicpO1xuICBpZiAobGluZXMubGVuZ3RoID4gNCkge1xuICAgIHZhciB3aWR0aCA9IFN0cmluZyhsaW5lcy5sZW5ndGgpLmxlbmd0aDtcbiAgICBtc2cgPSBsaW5lcy5tYXAoZnVuY3Rpb24oc3RyLCBpKXtcbiAgICAgIHJldHVybiBwYWQoKytpLCB3aWR0aCkgKyAnIHwnICsgJyAnICsgc3RyO1xuICAgIH0pLmpvaW4oJ1xcbicpO1xuICB9XG5cbiAgLy8gbGVnZW5kXG4gIG1zZyA9ICdcXG4nXG4gICAgKyBjb2xvcignZGlmZiByZW1vdmVkJywgJ2FjdHVhbCcpXG4gICAgKyAnICdcbiAgICArIGNvbG9yKCdkaWZmIGFkZGVkJywgJ2V4cGVjdGVkJylcbiAgICArICdcXG5cXG4nXG4gICAgKyBtc2dcbiAgICArICdcXG4nO1xuXG4gIC8vIGluZGVudFxuICBtc2cgPSBtc2cucmVwbGFjZSgvXi9nbSwgJyAgICAgICcpO1xuICByZXR1cm4gbXNnO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSB1bmlmaWVkIGRpZmYgYmV0d2VlbiAyIHN0cmluZ3NcbiAqXG4gKiBAcGFyYW0ge0Vycm9yfSBFcnJvciB3aXRoIGFjdHVhbC9leHBlY3RlZFxuICogQHJldHVybiB7U3RyaW5nfSBEaWZmXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiB1bmlmaWVkRGlmZihlcnIsIGVzY2FwZSkge1xuICB2YXIgaW5kZW50ID0gJyAgICAgICc7XG4gIGZ1bmN0aW9uIGNsZWFuVXAobGluZSkge1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgIGxpbmUgPSBlc2NhcGVJbnZpc2libGVzKGxpbmUpO1xuICAgIH1cbiAgICBpZiAobGluZVswXSA9PT0gJysnKSByZXR1cm4gaW5kZW50ICsgY29sb3JMaW5lcygnZGlmZiBhZGRlZCcsIGxpbmUpO1xuICAgIGlmIChsaW5lWzBdID09PSAnLScpIHJldHVybiBpbmRlbnQgKyBjb2xvckxpbmVzKCdkaWZmIHJlbW92ZWQnLCBsaW5lKTtcbiAgICBpZiAobGluZS5tYXRjaCgvXFxAXFxALykpIHJldHVybiBudWxsO1xuICAgIGlmIChsaW5lLm1hdGNoKC9cXFxcIE5vIG5ld2xpbmUvKSkgcmV0dXJuIG51bGw7XG4gICAgZWxzZSByZXR1cm4gaW5kZW50ICsgbGluZTtcbiAgfVxuICBmdW5jdGlvbiBub3RCbGFuayhsaW5lKSB7XG4gICAgcmV0dXJuIGxpbmUgIT0gbnVsbDtcbiAgfVxuICBtc2cgPSBkaWZmLmNyZWF0ZVBhdGNoKCdzdHJpbmcnLCBlcnIuYWN0dWFsLCBlcnIuZXhwZWN0ZWQpO1xuICB2YXIgbGluZXMgPSBtc2cuc3BsaXQoJ1xcbicpLnNwbGljZSg0KTtcbiAgcmV0dXJuICdcXG4gICAgICAnXG4gICAgICAgICArIGNvbG9yTGluZXMoJ2RpZmYgYWRkZWQnLCAgICcrIGV4cGVjdGVkJykgKyAnICdcbiAgICAgICAgICsgY29sb3JMaW5lcygnZGlmZiByZW1vdmVkJywgJy0gYWN0dWFsJylcbiAgICAgICAgICsgJ1xcblxcbidcbiAgICAgICAgICsgbGluZXMubWFwKGNsZWFuVXApLmZpbHRlcihub3RCbGFuaykuam9pbignXFxuJyk7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgY2hhcmFjdGVyIGRpZmYgZm9yIGBlcnJgLlxuICpcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gZXJyb3JEaWZmKGVyciwgdHlwZSwgZXNjYXBlKSB7XG4gIHZhciBhY3R1YWwgICA9IGVzY2FwZSA/IGVzY2FwZUludmlzaWJsZXMoZXJyLmFjdHVhbCkgICA6IGVyci5hY3R1YWw7XG4gIHZhciBleHBlY3RlZCA9IGVzY2FwZSA/IGVzY2FwZUludmlzaWJsZXMoZXJyLmV4cGVjdGVkKSA6IGVyci5leHBlY3RlZDtcbiAgcmV0dXJuIGRpZmZbJ2RpZmYnICsgdHlwZV0oYWN0dWFsLCBleHBlY3RlZCkubWFwKGZ1bmN0aW9uKHN0cil7XG4gICAgaWYgKHN0ci5hZGRlZCkgcmV0dXJuIGNvbG9yTGluZXMoJ2RpZmYgYWRkZWQnLCBzdHIudmFsdWUpO1xuICAgIGlmIChzdHIucmVtb3ZlZCkgcmV0dXJuIGNvbG9yTGluZXMoJ2RpZmYgcmVtb3ZlZCcsIHN0ci52YWx1ZSk7XG4gICAgcmV0dXJuIHN0ci52YWx1ZTtcbiAgfSkuam9pbignJyk7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyB3aXRoIGFsbCBpbnZpc2libGUgY2hhcmFjdGVycyBpbiBwbGFpbiB0ZXh0XG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGxpbmVcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBlc2NhcGVJbnZpc2libGVzKGxpbmUpIHtcbiAgICByZXR1cm4gbGluZS5yZXBsYWNlKC9cXHQvZywgJzx0YWI+JylcbiAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXHIvZywgJzxDUj4nKVxuICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcbi9nLCAnPExGPlxcbicpO1xufVxuXG4vKipcbiAqIENvbG9yIGxpbmVzIGZvciBgc3RyYCwgdXNpbmcgdGhlIGNvbG9yIGBuYW1lYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gY29sb3JMaW5lcyhuYW1lLCBzdHIpIHtcbiAgcmV0dXJuIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKHN0cil7XG4gICAgcmV0dXJuIGNvbG9yKG5hbWUsIHN0cik7XG4gIH0pLmpvaW4oJ1xcbicpO1xufVxuXG4vKipcbiAqIENoZWNrIHRoYXQgYSAvIGIgaGF2ZSB0aGUgc2FtZSB0eXBlLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBhXG4gKiBAcGFyYW0ge09iamVjdH0gYlxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNhbWVUeXBlKGEsIGIpIHtcbiAgYSA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhKTtcbiAgYiA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChiKTtcbiAgcmV0dXJuIGEgPT0gYjtcbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2Jhc2UuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9kb2MuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzJyk7XG5cbi8qKlxuICogRXhwb3NlIGBEb2NgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IERvYztcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBEb2NgIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gRG9jKHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgdG90YWwgPSBydW5uZXIudG90YWxcbiAgICAsIGluZGVudHMgPSAyO1xuXG4gIGZ1bmN0aW9uIGluZGVudCgpIHtcbiAgICByZXR1cm4gQXJyYXkoaW5kZW50cykuam9pbignICAnKTtcbiAgfVxuXG4gIHJ1bm5lci5vbignc3VpdGUnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgaWYgKHN1aXRlLnJvb3QpIHJldHVybjtcbiAgICArK2luZGVudHM7XG4gICAgY29uc29sZS5sb2coJyVzPHNlY3Rpb24gY2xhc3M9XCJzdWl0ZVwiPicsIGluZGVudCgpKTtcbiAgICArK2luZGVudHM7XG4gICAgY29uc29sZS5sb2coJyVzPGgxPiVzPC9oMT4nLCBpbmRlbnQoKSwgdXRpbHMuZXNjYXBlKHN1aXRlLnRpdGxlKSk7XG4gICAgY29uc29sZS5sb2coJyVzPGRsPicsIGluZGVudCgpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZSBlbmQnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgaWYgKHN1aXRlLnJvb3QpIHJldHVybjtcbiAgICBjb25zb2xlLmxvZygnJXM8L2RsPicsIGluZGVudCgpKTtcbiAgICAtLWluZGVudHM7XG4gICAgY29uc29sZS5sb2coJyVzPC9zZWN0aW9uPicsIGluZGVudCgpKTtcbiAgICAtLWluZGVudHM7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGNvbnNvbGUubG9nKCclcyAgPGR0PiVzPC9kdD4nLCBpbmRlbnQoKSwgdXRpbHMuZXNjYXBlKHRlc3QudGl0bGUpKTtcbiAgICB2YXIgY29kZSA9IHV0aWxzLmVzY2FwZSh1dGlscy5jbGVhbih0ZXN0LmZuLnRvU3RyaW5nKCkpKTtcbiAgICBjb25zb2xlLmxvZygnJXMgIDxkZD48cHJlPjxjb2RlPiVzPC9jb2RlPjwvcHJlPjwvZGQ+JywgaW5kZW50KCksIGNvZGUpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGNvbnNvbGUubG9nKCclcyAgPGR0IGNsYXNzPVwiZXJyb3JcIj4lczwvZHQ+JywgaW5kZW50KCksIHV0aWxzLmVzY2FwZSh0ZXN0LnRpdGxlKSk7XG4gICAgdmFyIGNvZGUgPSB1dGlscy5lc2NhcGUodXRpbHMuY2xlYW4odGVzdC5mbi50b1N0cmluZygpKSk7XG4gICAgY29uc29sZS5sb2coJyVzICA8ZGQgY2xhc3M9XCJlcnJvclwiPjxwcmU+PGNvZGU+JXM8L2NvZGU+PC9wcmU+PC9kZD4nLCBpbmRlbnQoKSwgY29kZSk7XG4gICAgY29uc29sZS5sb2coJyVzICA8ZGQgY2xhc3M9XCJlcnJvclwiPiVzPC9kZD4nLCBpbmRlbnQoKSwgdXRpbHMuZXNjYXBlKGVycikpO1xuICB9KTtcbn1cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2RvYy5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL2RvdC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIGNvbG9yID0gQmFzZS5jb2xvcjtcblxuLyoqXG4gKiBFeHBvc2UgYERvdGAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gRG90O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYERvdGAgbWF0cml4IHRlc3QgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBEb3QocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCB3aWR0aCA9IEJhc2Uud2luZG93LndpZHRoICogLjc1IHwgMFxuICAgICwgbiA9IC0xO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXG4gICcpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBpZiAoKytuICUgd2lkdGggPT0gMCkgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1xcbiAgJyk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29sb3IoJ3BlbmRpbmcnLCBCYXNlLnN5bWJvbHMuZG90KSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIGlmICgrK24gJSB3aWR0aCA9PSAwKSBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFxuICAnKTtcbiAgICBpZiAoJ3Nsb3cnID09IHRlc3Quc3BlZWQpIHtcbiAgICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbG9yKCdicmlnaHQgeWVsbG93JywgQmFzZS5zeW1ib2xzLmRvdCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb2xvcih0ZXN0LnNwZWVkLCBCYXNlLnN5bWJvbHMuZG90KSk7XG4gICAgfVxuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGlmICgrK24gJSB3aWR0aCA9PSAwKSBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFxuICAnKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb2xvcignZmFpbCcsIEJhc2Uuc3ltYm9scy5kb3QpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIGNvbnNvbGUubG9nKCk7XG4gICAgc2VsZi5lcGlsb2d1ZSgpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEJhc2UucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gQmFzZS5wcm90b3R5cGU7XG5Eb3QucHJvdG90eXBlID0gbmV3IEY7XG5Eb3QucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gRG90O1xuXG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9kb3QuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9odG1sLWNvdi5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEpTT05Db3YgPSByZXF1aXJlKCcuL2pzb24tY292JylcbiAgLCBmcyA9IHJlcXVpcmUoJ2Jyb3dzZXIvZnMnKTtcblxuLyoqXG4gKiBFeHBvc2UgYEhUTUxDb3ZgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEhUTUxDb3Y7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgSnNDb3ZlcmFnZWAgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBIVE1MQ292KHJ1bm5lcikge1xuICB2YXIgamFkZSA9IHJlcXVpcmUoJ2phZGUnKVxuICAgICwgZmlsZSA9IF9fZGlybmFtZSArICcvdGVtcGxhdGVzL2NvdmVyYWdlLmphZGUnXG4gICAgLCBzdHIgPSBmcy5yZWFkRmlsZVN5bmMoZmlsZSwgJ3V0ZjgnKVxuICAgICwgZm4gPSBqYWRlLmNvbXBpbGUoc3RyLCB7IGZpbGVuYW1lOiBmaWxlIH0pXG4gICAgLCBzZWxmID0gdGhpcztcblxuICBKU09OQ292LmNhbGwodGhpcywgcnVubmVyLCBmYWxzZSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGZuKHtcbiAgICAgICAgY292OiBzZWxmLmNvdlxuICAgICAgLCBjb3ZlcmFnZUNsYXNzOiBjb3ZlcmFnZUNsYXNzXG4gICAgfSkpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gY292ZXJhZ2UgY2xhc3MgZm9yIGBuYC5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBjb3ZlcmFnZUNsYXNzKG4pIHtcbiAgaWYgKG4gPj0gNzUpIHJldHVybiAnaGlnaCc7XG4gIGlmIChuID49IDUwKSByZXR1cm4gJ21lZGl1bSc7XG4gIGlmIChuID49IDI1KSByZXR1cm4gJ2xvdyc7XG4gIHJldHVybiAndGVycmlibGUnO1xufVxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL2h0bWwtY292LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvaHRtbC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxuICAsIFByb2dyZXNzID0gcmVxdWlyZSgnLi4vYnJvd3Nlci9wcm9ncmVzcycpXG4gICwgZXNjYXBlID0gdXRpbHMuZXNjYXBlO1xuXG4vKipcbiAqIFNhdmUgdGltZXIgcmVmZXJlbmNlcyB0byBhdm9pZCBTaW5vbiBpbnRlcmZlcmluZyAoc2VlIEdILTIzNykuXG4gKi9cblxudmFyIERhdGUgPSBnbG9iYWwuRGF0ZVxuICAsIHNldFRpbWVvdXQgPSBnbG9iYWwuc2V0VGltZW91dFxuICAsIHNldEludGVydmFsID0gZ2xvYmFsLnNldEludGVydmFsXG4gICwgY2xlYXJUaW1lb3V0ID0gZ2xvYmFsLmNsZWFyVGltZW91dFxuICAsIGNsZWFySW50ZXJ2YWwgPSBnbG9iYWwuY2xlYXJJbnRlcnZhbDtcblxuLyoqXG4gKiBFeHBvc2UgYEhUTUxgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEhUTUw7XG5cbi8qKlxuICogU3RhdHMgdGVtcGxhdGUuXG4gKi9cblxudmFyIHN0YXRzVGVtcGxhdGUgPSAnPHVsIGlkPVwibW9jaGEtc3RhdHNcIj4nXG4gICsgJzxsaSBjbGFzcz1cInByb2dyZXNzXCI+PGNhbnZhcyB3aWR0aD1cIjQwXCIgaGVpZ2h0PVwiNDBcIj48L2NhbnZhcz48L2xpPidcbiAgKyAnPGxpIGNsYXNzPVwicGFzc2VzXCI+PGEgaHJlZj1cIiNcIj5wYXNzZXM6PC9hPiA8ZW0+MDwvZW0+PC9saT4nXG4gICsgJzxsaSBjbGFzcz1cImZhaWx1cmVzXCI+PGEgaHJlZj1cIiNcIj5mYWlsdXJlczo8L2E+IDxlbT4wPC9lbT48L2xpPidcbiAgKyAnPGxpIGNsYXNzPVwiZHVyYXRpb25cIj5kdXJhdGlvbjogPGVtPjA8L2VtPnM8L2xpPidcbiAgKyAnPC91bD4nO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYEhUTUxgIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gSFRNTChydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIHRvdGFsID0gcnVubmVyLnRvdGFsXG4gICAgLCBzdGF0ID0gZnJhZ21lbnQoc3RhdHNUZW1wbGF0ZSlcbiAgICAsIGl0ZW1zID0gc3RhdC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnbGknKVxuICAgICwgcGFzc2VzID0gaXRlbXNbMV0uZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2VtJylbMF1cbiAgICAsIHBhc3Nlc0xpbmsgPSBpdGVtc1sxXS5nZXRFbGVtZW50c0J5VGFnTmFtZSgnYScpWzBdXG4gICAgLCBmYWlsdXJlcyA9IGl0ZW1zWzJdLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdlbScpWzBdXG4gICAgLCBmYWlsdXJlc0xpbmsgPSBpdGVtc1syXS5nZXRFbGVtZW50c0J5VGFnTmFtZSgnYScpWzBdXG4gICAgLCBkdXJhdGlvbiA9IGl0ZW1zWzNdLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdlbScpWzBdXG4gICAgLCBjYW52YXMgPSBzdGF0LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdjYW52YXMnKVswXVxuICAgICwgcmVwb3J0ID0gZnJhZ21lbnQoJzx1bCBpZD1cIm1vY2hhLXJlcG9ydFwiPjwvdWw+JylcbiAgICAsIHN0YWNrID0gW3JlcG9ydF1cbiAgICAsIHByb2dyZXNzXG4gICAgLCBjdHhcbiAgICAsIHJvb3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbW9jaGEnKTtcblxuICBpZiAoY2FudmFzLmdldENvbnRleHQpIHtcbiAgICB2YXIgcmF0aW8gPSB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyB8fCAxO1xuICAgIGNhbnZhcy5zdHlsZS53aWR0aCA9IGNhbnZhcy53aWR0aDtcbiAgICBjYW52YXMuc3R5bGUuaGVpZ2h0ID0gY2FudmFzLmhlaWdodDtcbiAgICBjYW52YXMud2lkdGggKj0gcmF0aW87XG4gICAgY2FudmFzLmhlaWdodCAqPSByYXRpbztcbiAgICBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICBjdHguc2NhbGUocmF0aW8sIHJhdGlvKTtcbiAgICBwcm9ncmVzcyA9IG5ldyBQcm9ncmVzcztcbiAgfVxuXG4gIGlmICghcm9vdCkgcmV0dXJuIGVycm9yKCcjbW9jaGEgZGl2IG1pc3NpbmcsIGFkZCBpdCB0byB5b3VyIGRvY3VtZW50Jyk7XG5cbiAgLy8gcGFzcyB0b2dnbGVcbiAgb24ocGFzc2VzTGluaywgJ2NsaWNrJywgZnVuY3Rpb24oKXtcbiAgICB1bmhpZGUoKTtcbiAgICB2YXIgbmFtZSA9IC9wYXNzLy50ZXN0KHJlcG9ydC5jbGFzc05hbWUpID8gJycgOiAnIHBhc3MnO1xuICAgIHJlcG9ydC5jbGFzc05hbWUgPSByZXBvcnQuY2xhc3NOYW1lLnJlcGxhY2UoL2ZhaWx8cGFzcy9nLCAnJykgKyBuYW1lO1xuICAgIGlmIChyZXBvcnQuY2xhc3NOYW1lLnRyaW0oKSkgaGlkZVN1aXRlc1dpdGhvdXQoJ3Rlc3QgcGFzcycpO1xuICB9KTtcblxuICAvLyBmYWlsdXJlIHRvZ2dsZVxuICBvbihmYWlsdXJlc0xpbmssICdjbGljaycsIGZ1bmN0aW9uKCl7XG4gICAgdW5oaWRlKCk7XG4gICAgdmFyIG5hbWUgPSAvZmFpbC8udGVzdChyZXBvcnQuY2xhc3NOYW1lKSA/ICcnIDogJyBmYWlsJztcbiAgICByZXBvcnQuY2xhc3NOYW1lID0gcmVwb3J0LmNsYXNzTmFtZS5yZXBsYWNlKC9mYWlsfHBhc3MvZywgJycpICsgbmFtZTtcbiAgICBpZiAocmVwb3J0LmNsYXNzTmFtZS50cmltKCkpIGhpZGVTdWl0ZXNXaXRob3V0KCd0ZXN0IGZhaWwnKTtcbiAgfSk7XG5cbiAgcm9vdC5hcHBlbmRDaGlsZChzdGF0KTtcbiAgcm9vdC5hcHBlbmRDaGlsZChyZXBvcnQpO1xuXG4gIGlmIChwcm9ncmVzcykgcHJvZ3Jlc3Muc2l6ZSg0MCk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZScsIGZ1bmN0aW9uKHN1aXRlKXtcbiAgICBpZiAoc3VpdGUucm9vdCkgcmV0dXJuO1xuXG4gICAgLy8gc3VpdGVcbiAgICB2YXIgdXJsID0gc2VsZi5zdWl0ZVVSTChzdWl0ZSk7XG4gICAgdmFyIGVsID0gZnJhZ21lbnQoJzxsaSBjbGFzcz1cInN1aXRlXCI+PGgxPjxhIGhyZWY9XCIlc1wiPiVzPC9hPjwvaDE+PC9saT4nLCB1cmwsIGVzY2FwZShzdWl0ZS50aXRsZSkpO1xuXG4gICAgLy8gY29udGFpbmVyXG4gICAgc3RhY2tbMF0uYXBwZW5kQ2hpbGQoZWwpO1xuICAgIHN0YWNrLnVuc2hpZnQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndWwnKSk7XG4gICAgZWwuYXBwZW5kQ2hpbGQoc3RhY2tbMF0pO1xuICB9KTtcblxuICBydW5uZXIub24oJ3N1aXRlIGVuZCcsIGZ1bmN0aW9uKHN1aXRlKXtcbiAgICBpZiAoc3VpdGUucm9vdCkgcmV0dXJuO1xuICAgIHN0YWNrLnNoaWZ0KCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZmFpbCcsIGZ1bmN0aW9uKHRlc3QsIGVycil7XG4gICAgaWYgKCdob29rJyA9PSB0ZXN0LnR5cGUpIHJ1bm5lci5lbWl0KCd0ZXN0IGVuZCcsIHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24odGVzdCl7XG4gICAgLy8gVE9ETzogYWRkIHRvIHN0YXRzXG4gICAgdmFyIHBlcmNlbnQgPSBzdGF0cy50ZXN0cyAvIHRoaXMudG90YWwgKiAxMDAgfCAwO1xuICAgIGlmIChwcm9ncmVzcykgcHJvZ3Jlc3MudXBkYXRlKHBlcmNlbnQpLmRyYXcoY3R4KTtcblxuICAgIC8vIHVwZGF0ZSBzdGF0c1xuICAgIHZhciBtcyA9IG5ldyBEYXRlIC0gc3RhdHMuc3RhcnQ7XG4gICAgdGV4dChwYXNzZXMsIHN0YXRzLnBhc3Nlcyk7XG4gICAgdGV4dChmYWlsdXJlcywgc3RhdHMuZmFpbHVyZXMpO1xuICAgIHRleHQoZHVyYXRpb24sIChtcyAvIDEwMDApLnRvRml4ZWQoMikpO1xuXG4gICAgLy8gdGVzdFxuICAgIGlmICgncGFzc2VkJyA9PSB0ZXN0LnN0YXRlKSB7XG4gICAgICB2YXIgdXJsID0gc2VsZi50ZXN0VVJMKHRlc3QpO1xuICAgICAgdmFyIGVsID0gZnJhZ21lbnQoJzxsaSBjbGFzcz1cInRlc3QgcGFzcyAlZVwiPjxoMj4lZTxzcGFuIGNsYXNzPVwiZHVyYXRpb25cIj4lZW1zPC9zcGFuPiA8YSBocmVmPVwiJXNcIiBjbGFzcz1cInJlcGxheVwiPuKAozwvYT48L2gyPjwvbGk+JywgdGVzdC5zcGVlZCwgdGVzdC50aXRsZSwgdGVzdC5kdXJhdGlvbiwgdXJsKTtcbiAgICB9IGVsc2UgaWYgKHRlc3QucGVuZGluZykge1xuICAgICAgdmFyIGVsID0gZnJhZ21lbnQoJzxsaSBjbGFzcz1cInRlc3QgcGFzcyBwZW5kaW5nXCI+PGgyPiVlPC9oMj48L2xpPicsIHRlc3QudGl0bGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZWwgPSBmcmFnbWVudCgnPGxpIGNsYXNzPVwidGVzdCBmYWlsXCI+PGgyPiVlIDxhIGhyZWY9XCI/Z3JlcD0lZVwiIGNsYXNzPVwicmVwbGF5XCI+4oCjPC9hPjwvaDI+PC9saT4nLCB0ZXN0LnRpdGxlLCBlbmNvZGVVUklDb21wb25lbnQodGVzdC5mdWxsVGl0bGUoKSkpO1xuICAgICAgdmFyIHN0ciA9IHRlc3QuZXJyLnN0YWNrIHx8IHRlc3QuZXJyLnRvU3RyaW5nKCk7XG5cbiAgICAgIC8vIEZGIC8gT3BlcmEgZG8gbm90IGFkZCB0aGUgbWVzc2FnZVxuICAgICAgaWYgKCF+c3RyLmluZGV4T2YodGVzdC5lcnIubWVzc2FnZSkpIHtcbiAgICAgICAgc3RyID0gdGVzdC5lcnIubWVzc2FnZSArICdcXG4nICsgc3RyO1xuICAgICAgfVxuXG4gICAgICAvLyA8PUlFNyBzdHJpbmdpZmllcyB0byBbT2JqZWN0IEVycm9yXS4gU2luY2UgaXQgY2FuIGJlIG92ZXJsb2FkZWQsIHdlXG4gICAgICAvLyBjaGVjayBmb3IgdGhlIHJlc3VsdCBvZiB0aGUgc3RyaW5naWZ5aW5nLlxuICAgICAgaWYgKCdbb2JqZWN0IEVycm9yXScgPT0gc3RyKSBzdHIgPSB0ZXN0LmVyci5tZXNzYWdlO1xuXG4gICAgICAvLyBTYWZhcmkgZG9lc24ndCBnaXZlIHlvdSBhIHN0YWNrLiBMZXQncyBhdCBsZWFzdCBwcm92aWRlIGEgc291cmNlIGxpbmUuXG4gICAgICBpZiAoIXRlc3QuZXJyLnN0YWNrICYmIHRlc3QuZXJyLnNvdXJjZVVSTCAmJiB0ZXN0LmVyci5saW5lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc3RyICs9IFwiXFxuKFwiICsgdGVzdC5lcnIuc291cmNlVVJMICsgXCI6XCIgKyB0ZXN0LmVyci5saW5lICsgXCIpXCI7XG4gICAgICB9XG5cbiAgICAgIGVsLmFwcGVuZENoaWxkKGZyYWdtZW50KCc8cHJlIGNsYXNzPVwiZXJyb3JcIj4lZTwvcHJlPicsIHN0cikpO1xuICAgIH1cblxuICAgIC8vIHRvZ2dsZSBjb2RlXG4gICAgLy8gVE9ETzogZGVmZXJcbiAgICBpZiAoIXRlc3QucGVuZGluZykge1xuICAgICAgdmFyIGgyID0gZWwuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2gyJylbMF07XG5cbiAgICAgIG9uKGgyLCAnY2xpY2snLCBmdW5jdGlvbigpe1xuICAgICAgICBwcmUuc3R5bGUuZGlzcGxheSA9ICdub25lJyA9PSBwcmUuc3R5bGUuZGlzcGxheVxuICAgICAgICAgID8gJ2Jsb2NrJ1xuICAgICAgICAgIDogJ25vbmUnO1xuICAgICAgfSk7XG5cbiAgICAgIHZhciBwcmUgPSBmcmFnbWVudCgnPHByZT48Y29kZT4lZTwvY29kZT48L3ByZT4nLCB1dGlscy5jbGVhbih0ZXN0LmZuLnRvU3RyaW5nKCkpKTtcbiAgICAgIGVsLmFwcGVuZENoaWxkKHByZSk7XG4gICAgICBwcmUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICB9XG5cbiAgICAvLyBEb24ndCBjYWxsIC5hcHBlbmRDaGlsZCBpZiAjbW9jaGEtcmVwb3J0IHdhcyBhbHJlYWR5IC5zaGlmdCgpJ2VkIG9mZiB0aGUgc3RhY2suXG4gICAgaWYgKHN0YWNrWzBdKSBzdGFja1swXS5hcHBlbmRDaGlsZChlbCk7XG4gIH0pO1xufVxuXG4vKipcbiAqIFByb3ZpZGUgc3VpdGUgVVJMXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IFtzdWl0ZV1cbiAqL1xuXG5IVE1MLnByb3RvdHlwZS5zdWl0ZVVSTCA9IGZ1bmN0aW9uKHN1aXRlKXtcbiAgcmV0dXJuICc/Z3JlcD0nICsgZW5jb2RlVVJJQ29tcG9uZW50KHN1aXRlLmZ1bGxUaXRsZSgpKTtcbn07XG5cbi8qKlxuICogUHJvdmlkZSB0ZXN0IFVSTFxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBbdGVzdF1cbiAqL1xuXG5IVE1MLnByb3RvdHlwZS50ZXN0VVJMID0gZnVuY3Rpb24odGVzdCl7XG4gIHJldHVybiAnP2dyZXA9JyArIGVuY29kZVVSSUNvbXBvbmVudCh0ZXN0LmZ1bGxUaXRsZSgpKTtcbn07XG5cbi8qKlxuICogRGlzcGxheSBlcnJvciBgbXNnYC5cbiAqL1xuXG5mdW5jdGlvbiBlcnJvcihtc2cpIHtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChmcmFnbWVudCgnPGRpdiBpZD1cIm1vY2hhLWVycm9yXCI+JXM8L2Rpdj4nLCBtc2cpKTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBET00gZnJhZ21lbnQgZnJvbSBgaHRtbGAuXG4gKi9cblxuZnVuY3Rpb24gZnJhZ21lbnQoaHRtbCkge1xuICB2YXIgYXJncyA9IGFyZ3VtZW50c1xuICAgICwgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JylcbiAgICAsIGkgPSAxO1xuXG4gIGRpdi5pbm5lckhUTUwgPSBodG1sLnJlcGxhY2UoLyUoW3NlXSkvZywgZnVuY3Rpb24oXywgdHlwZSl7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlICdzJzogcmV0dXJuIFN0cmluZyhhcmdzW2krK10pO1xuICAgICAgY2FzZSAnZSc6IHJldHVybiBlc2NhcGUoYXJnc1tpKytdKTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBkaXYuZmlyc3RDaGlsZDtcbn1cblxuLyoqXG4gKiBDaGVjayBmb3Igc3VpdGVzIHRoYXQgZG8gbm90IGhhdmUgZWxlbWVudHNcbiAqIHdpdGggYGNsYXNzbmFtZWAsIGFuZCBoaWRlIHRoZW0uXG4gKi9cblxuZnVuY3Rpb24gaGlkZVN1aXRlc1dpdGhvdXQoY2xhc3NuYW1lKSB7XG4gIHZhciBzdWl0ZXMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdzdWl0ZScpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHN1aXRlcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBlbHMgPSBzdWl0ZXNbaV0uZ2V0RWxlbWVudHNCeUNsYXNzTmFtZShjbGFzc25hbWUpO1xuICAgIGlmICgwID09IGVscy5sZW5ndGgpIHN1aXRlc1tpXS5jbGFzc05hbWUgKz0gJyBoaWRkZW4nO1xuICB9XG59XG5cbi8qKlxuICogVW5oaWRlIC5oaWRkZW4gc3VpdGVzLlxuICovXG5cbmZ1bmN0aW9uIHVuaGlkZSgpIHtcbiAgdmFyIGVscyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ3N1aXRlIGhpZGRlbicpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGVscy5sZW5ndGg7ICsraSkge1xuICAgIGVsc1tpXS5jbGFzc05hbWUgPSBlbHNbaV0uY2xhc3NOYW1lLnJlcGxhY2UoJ3N1aXRlIGhpZGRlbicsICdzdWl0ZScpO1xuICB9XG59XG5cbi8qKlxuICogU2V0IGBlbGAgdGV4dCB0byBgc3RyYC5cbiAqL1xuXG5mdW5jdGlvbiB0ZXh0KGVsLCBzdHIpIHtcbiAgaWYgKGVsLnRleHRDb250ZW50KSB7XG4gICAgZWwudGV4dENvbnRlbnQgPSBzdHI7XG4gIH0gZWxzZSB7XG4gICAgZWwuaW5uZXJUZXh0ID0gc3RyO1xuICB9XG59XG5cbi8qKlxuICogTGlzdGVuIG9uIGBldmVudGAgd2l0aCBjYWxsYmFjayBgZm5gLlxuICovXG5cbmZ1bmN0aW9uIG9uKGVsLCBldmVudCwgZm4pIHtcbiAgaWYgKGVsLmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBmbiwgZmFsc2UpO1xuICB9IGVsc2Uge1xuICAgIGVsLmF0dGFjaEV2ZW50KCdvbicgKyBldmVudCwgZm4pO1xuICB9XG59XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9odG1sLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvaW5kZXguanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuZXhwb3J0cy5CYXNlID0gcmVxdWlyZSgnLi9iYXNlJyk7XG5leHBvcnRzLkRvdCA9IHJlcXVpcmUoJy4vZG90Jyk7XG5leHBvcnRzLkRvYyA9IHJlcXVpcmUoJy4vZG9jJyk7XG5leHBvcnRzLlRBUCA9IHJlcXVpcmUoJy4vdGFwJyk7XG5leHBvcnRzLkpTT04gPSByZXF1aXJlKCcuL2pzb24nKTtcbmV4cG9ydHMuSFRNTCA9IHJlcXVpcmUoJy4vaHRtbCcpO1xuZXhwb3J0cy5MaXN0ID0gcmVxdWlyZSgnLi9saXN0Jyk7XG5leHBvcnRzLk1pbiA9IHJlcXVpcmUoJy4vbWluJyk7XG5leHBvcnRzLlNwZWMgPSByZXF1aXJlKCcuL3NwZWMnKTtcbmV4cG9ydHMuTnlhbiA9IHJlcXVpcmUoJy4vbnlhbicpO1xuZXhwb3J0cy5YVW5pdCA9IHJlcXVpcmUoJy4veHVuaXQnKTtcbmV4cG9ydHMuTWFya2Rvd24gPSByZXF1aXJlKCcuL21hcmtkb3duJyk7XG5leHBvcnRzLlByb2dyZXNzID0gcmVxdWlyZSgnLi9wcm9ncmVzcycpO1xuZXhwb3J0cy5MYW5kaW5nID0gcmVxdWlyZSgnLi9sYW5kaW5nJyk7XG5leHBvcnRzLkpTT05Db3YgPSByZXF1aXJlKCcuL2pzb24tY292Jyk7XG5leHBvcnRzLkhUTUxDb3YgPSByZXF1aXJlKCcuL2h0bWwtY292Jyk7XG5leHBvcnRzLkpTT05TdHJlYW0gPSByZXF1aXJlKCcuL2pzb24tc3RyZWFtJyk7XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9pbmRleC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL2pzb24tY292LmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpO1xuXG4vKipcbiAqIEV4cG9zZSBgSlNPTkNvdmAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gSlNPTkNvdjtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBKc0NvdmVyYWdlYCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAcGFyYW0ge0Jvb2xlYW59IG91dHB1dFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBKU09OQ292KHJ1bm5lciwgb3V0cHV0KSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgb3V0cHV0ID0gMSA9PSBhcmd1bWVudHMubGVuZ3RoID8gdHJ1ZSA6IG91dHB1dDtcblxuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgdGVzdHMgPSBbXVxuICAgICwgZmFpbHVyZXMgPSBbXVxuICAgICwgcGFzc2VzID0gW107XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHRlc3RzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHBhc3Nlcy5wdXNoKHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBmYWlsdXJlcy5wdXNoKHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgdmFyIGNvdiA9IGdsb2JhbC5fJGpzY292ZXJhZ2UgfHwge307XG4gICAgdmFyIHJlc3VsdCA9IHNlbGYuY292ID0gbWFwKGNvdik7XG4gICAgcmVzdWx0LnN0YXRzID0gc2VsZi5zdGF0cztcbiAgICByZXN1bHQudGVzdHMgPSB0ZXN0cy5tYXAoY2xlYW4pO1xuICAgIHJlc3VsdC5mYWlsdXJlcyA9IGZhaWx1cmVzLm1hcChjbGVhbik7XG4gICAgcmVzdWx0LnBhc3NlcyA9IHBhc3Nlcy5tYXAoY2xlYW4pO1xuICAgIGlmICghb3V0cHV0KSByZXR1cm47XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoSlNPTi5zdHJpbmdpZnkocmVzdWx0LCBudWxsLCAyICkpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBNYXAganNjb3ZlcmFnZSBkYXRhIHRvIGEgSlNPTiBzdHJ1Y3R1cmVcbiAqIHN1aXRhYmxlIGZvciByZXBvcnRpbmcuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGNvdlxuICogQHJldHVybiB7T2JqZWN0fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbWFwKGNvdikge1xuICB2YXIgcmV0ID0ge1xuICAgICAgaW5zdHJ1bWVudGF0aW9uOiAnbm9kZS1qc2NvdmVyYWdlJ1xuICAgICwgc2xvYzogMFxuICAgICwgaGl0czogMFxuICAgICwgbWlzc2VzOiAwXG4gICAgLCBjb3ZlcmFnZTogMFxuICAgICwgZmlsZXM6IFtdXG4gIH07XG5cbiAgZm9yICh2YXIgZmlsZW5hbWUgaW4gY292KSB7XG4gICAgdmFyIGRhdGEgPSBjb3ZlcmFnZShmaWxlbmFtZSwgY292W2ZpbGVuYW1lXSk7XG4gICAgcmV0LmZpbGVzLnB1c2goZGF0YSk7XG4gICAgcmV0LmhpdHMgKz0gZGF0YS5oaXRzO1xuICAgIHJldC5taXNzZXMgKz0gZGF0YS5taXNzZXM7XG4gICAgcmV0LnNsb2MgKz0gZGF0YS5zbG9jO1xuICB9XG5cbiAgcmV0LmZpbGVzLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgIHJldHVybiBhLmZpbGVuYW1lLmxvY2FsZUNvbXBhcmUoYi5maWxlbmFtZSk7XG4gIH0pO1xuXG4gIGlmIChyZXQuc2xvYyA+IDApIHtcbiAgICByZXQuY292ZXJhZ2UgPSAocmV0LmhpdHMgLyByZXQuc2xvYykgKiAxMDA7XG4gIH1cblxuICByZXR1cm4gcmV0O1xufTtcblxuLyoqXG4gKiBNYXAganNjb3ZlcmFnZSBkYXRhIGZvciBhIHNpbmdsZSBzb3VyY2UgZmlsZVxuICogdG8gYSBKU09OIHN0cnVjdHVyZSBzdWl0YWJsZSBmb3IgcmVwb3J0aW5nLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlbmFtZSBuYW1lIG9mIHRoZSBzb3VyY2UgZmlsZVxuICogQHBhcmFtIHtPYmplY3R9IGRhdGEganNjb3ZlcmFnZSBjb3ZlcmFnZSBkYXRhXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBjb3ZlcmFnZShmaWxlbmFtZSwgZGF0YSkge1xuICB2YXIgcmV0ID0ge1xuICAgIGZpbGVuYW1lOiBmaWxlbmFtZSxcbiAgICBjb3ZlcmFnZTogMCxcbiAgICBoaXRzOiAwLFxuICAgIG1pc3NlczogMCxcbiAgICBzbG9jOiAwLFxuICAgIHNvdXJjZToge31cbiAgfTtcblxuICBkYXRhLnNvdXJjZS5mb3JFYWNoKGZ1bmN0aW9uKGxpbmUsIG51bSl7XG4gICAgbnVtKys7XG5cbiAgICBpZiAoZGF0YVtudW1dID09PSAwKSB7XG4gICAgICByZXQubWlzc2VzKys7XG4gICAgICByZXQuc2xvYysrO1xuICAgIH0gZWxzZSBpZiAoZGF0YVtudW1dICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldC5oaXRzKys7XG4gICAgICByZXQuc2xvYysrO1xuICAgIH1cblxuICAgIHJldC5zb3VyY2VbbnVtXSA9IHtcbiAgICAgICAgc291cmNlOiBsaW5lXG4gICAgICAsIGNvdmVyYWdlOiBkYXRhW251bV0gPT09IHVuZGVmaW5lZFxuICAgICAgICA/ICcnXG4gICAgICAgIDogZGF0YVtudW1dXG4gICAgfTtcbiAgfSk7XG5cbiAgcmV0LmNvdmVyYWdlID0gcmV0LmhpdHMgLyByZXQuc2xvYyAqIDEwMDtcblxuICByZXR1cm4gcmV0O1xufVxuXG4vKipcbiAqIFJldHVybiBhIHBsYWluLW9iamVjdCByZXByZXNlbnRhdGlvbiBvZiBgdGVzdGBcbiAqIGZyZWUgb2YgY3ljbGljIHByb3BlcnRpZXMgZXRjLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSB0ZXN0XG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBjbGVhbih0ZXN0KSB7XG4gIHJldHVybiB7XG4gICAgICB0aXRsZTogdGVzdC50aXRsZVxuICAgICwgZnVsbFRpdGxlOiB0ZXN0LmZ1bGxUaXRsZSgpXG4gICAgLCBkdXJhdGlvbjogdGVzdC5kdXJhdGlvblxuICB9XG59XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9qc29uLWNvdi5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL2pzb24tc3RyZWFtLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgTGlzdGAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gTGlzdDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBMaXN0YCB0ZXN0IHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gTGlzdChydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIHRvdGFsID0gcnVubmVyLnRvdGFsO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KFsnc3RhcnQnLCB7IHRvdGFsOiB0b3RhbCB9XSkpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Bhc3MnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShbJ3Bhc3MnLCBjbGVhbih0ZXN0KV0pKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdmYWlsJywgZnVuY3Rpb24odGVzdCwgZXJyKXtcbiAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShbJ2ZhaWwnLCBjbGVhbih0ZXN0KV0pKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKEpTT04uc3RyaW5naWZ5KFsnZW5kJywgc2VsZi5zdGF0c10pKTtcbiAgfSk7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgcGxhaW4tb2JqZWN0IHJlcHJlc2VudGF0aW9uIG9mIGB0ZXN0YFxuICogZnJlZSBvZiBjeWNsaWMgcHJvcGVydGllcyBldGMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHRlc3RcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNsZWFuKHRlc3QpIHtcbiAgcmV0dXJuIHtcbiAgICAgIHRpdGxlOiB0ZXN0LnRpdGxlXG4gICAgLCBmdWxsVGl0bGU6IHRlc3QuZnVsbFRpdGxlKClcbiAgICAsIGR1cmF0aW9uOiB0ZXN0LmR1cmF0aW9uXG4gIH1cbn1cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9qc29uLXN0cmVhbS5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL2pzb24uanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJylcbiAgLCBjdXJzb3IgPSBCYXNlLmN1cnNvclxuICAsIGNvbG9yID0gQmFzZS5jb2xvcjtcblxuLyoqXG4gKiBFeHBvc2UgYEpTT05gLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEpTT05SZXBvcnRlcjtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBKU09OYCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIEpTT05SZXBvcnRlcihydW5uZXIpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgdGVzdHMgPSBbXVxuICAgICwgZmFpbHVyZXMgPSBbXVxuICAgICwgcGFzc2VzID0gW107XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHRlc3RzLnB1c2godGVzdCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHBhc3Nlcy5wdXNoKHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGZhaWx1cmVzLnB1c2godGVzdCk7XG4gICAgaWYgKGVyciA9PT0gT2JqZWN0KGVycikpIHtcbiAgICAgIHRlc3QuZXJyTXNnID0gZXJyLm1lc3NhZ2U7XG4gICAgICB0ZXN0LmVyclN0YWNrID0gZXJyLnN0YWNrO1xuICAgIH1cbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIHZhciBvYmogPSB7XG4gICAgICBzdGF0czogc2VsZi5zdGF0cyxcbiAgICAgIHRlc3RzOiB0ZXN0cy5tYXAoY2xlYW4pLFxuICAgICAgZmFpbHVyZXM6IGZhaWx1cmVzLm1hcChjbGVhbiksXG4gICAgICBwYXNzZXM6IHBhc3Nlcy5tYXAoY2xlYW4pXG4gICAgfTtcbiAgICBydW5uZXIudGVzdFJlc3VsdHMgPSBvYmo7XG5cbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShKU09OLnN0cmluZ2lmeShvYmosIG51bGwsIDIpKTtcbiAgfSk7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgcGxhaW4tb2JqZWN0IHJlcHJlc2VudGF0aW9uIG9mIGB0ZXN0YFxuICogZnJlZSBvZiBjeWNsaWMgcHJvcGVydGllcyBldGMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHRlc3RcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNsZWFuKHRlc3QpIHtcbiAgcmV0dXJuIHtcbiAgICB0aXRsZTogdGVzdC50aXRsZSxcbiAgICBmdWxsVGl0bGU6IHRlc3QuZnVsbFRpdGxlKCksXG4gICAgZHVyYXRpb246IHRlc3QuZHVyYXRpb24sXG4gICAgZXJyOiB0ZXN0LmVycixcbiAgICBlcnJTdGFjazogdGVzdC5lcnIuc3RhY2ssXG4gICAgZXJyTWVzc2FnZTogdGVzdC5lcnIubWVzc2FnZVxuICB9XG59XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9qc29uLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvbGFuZGluZy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIGN1cnNvciA9IEJhc2UuY3Vyc29yXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgTGFuZGluZ2AuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gTGFuZGluZztcblxuLyoqXG4gKiBBaXJwbGFuZSBjb2xvci5cbiAqL1xuXG5CYXNlLmNvbG9ycy5wbGFuZSA9IDA7XG5cbi8qKlxuICogQWlycGxhbmUgY3Jhc2ggY29sb3IuXG4gKi9cblxuQmFzZS5jb2xvcnNbJ3BsYW5lIGNyYXNoJ10gPSAzMTtcblxuLyoqXG4gKiBSdW53YXkgY29sb3IuXG4gKi9cblxuQmFzZS5jb2xvcnMucnVud2F5ID0gOTA7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgTGFuZGluZ2AgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBMYW5kaW5nKHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgd2lkdGggPSBCYXNlLndpbmRvdy53aWR0aCAqIC43NSB8IDBcbiAgICAsIHRvdGFsID0gcnVubmVyLnRvdGFsXG4gICAgLCBzdHJlYW0gPSBwcm9jZXNzLnN0ZG91dFxuICAgICwgcGxhbmUgPSBjb2xvcigncGxhbmUnLCAn4pyIJylcbiAgICAsIGNyYXNoZWQgPSAtMVxuICAgICwgbiA9IDA7XG5cbiAgZnVuY3Rpb24gcnVud2F5KCkge1xuICAgIHZhciBidWYgPSBBcnJheSh3aWR0aCkuam9pbignLScpO1xuICAgIHJldHVybiAnICAnICsgY29sb3IoJ3J1bndheScsIGJ1Zik7XG4gIH1cblxuICBydW5uZXIub24oJ3N0YXJ0JywgZnVuY3Rpb24oKXtcbiAgICBzdHJlYW0ud3JpdGUoJ1xcbiAgJyk7XG4gICAgY3Vyc29yLmhpZGUoKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIC8vIGNoZWNrIGlmIHRoZSBwbGFuZSBjcmFzaGVkXG4gICAgdmFyIGNvbCA9IC0xID09IGNyYXNoZWRcbiAgICAgID8gd2lkdGggKiArK24gLyB0b3RhbCB8IDBcbiAgICAgIDogY3Jhc2hlZDtcblxuICAgIC8vIHNob3cgdGhlIGNyYXNoXG4gICAgaWYgKCdmYWlsZWQnID09IHRlc3Quc3RhdGUpIHtcbiAgICAgIHBsYW5lID0gY29sb3IoJ3BsYW5lIGNyYXNoJywgJ+KciCcpO1xuICAgICAgY3Jhc2hlZCA9IGNvbDtcbiAgICB9XG5cbiAgICAvLyByZW5kZXIgbGFuZGluZyBzdHJpcFxuICAgIHN0cmVhbS53cml0ZSgnXFx1MDAxYls0RlxcblxcbicpO1xuICAgIHN0cmVhbS53cml0ZShydW53YXkoKSk7XG4gICAgc3RyZWFtLndyaXRlKCdcXG4gICcpO1xuICAgIHN0cmVhbS53cml0ZShjb2xvcigncnVud2F5JywgQXJyYXkoY29sKS5qb2luKCfii4UnKSkpO1xuICAgIHN0cmVhbS53cml0ZShwbGFuZSlcbiAgICBzdHJlYW0ud3JpdGUoY29sb3IoJ3J1bndheScsIEFycmF5KHdpZHRoIC0gY29sKS5qb2luKCfii4UnKSArICdcXG4nKSk7XG4gICAgc3RyZWFtLndyaXRlKHJ1bndheSgpKTtcbiAgICBzdHJlYW0ud3JpdGUoJ1xcdTAwMWJbMG0nKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIGN1cnNvci5zaG93KCk7XG4gICAgY29uc29sZS5sb2coKTtcbiAgICBzZWxmLmVwaWxvZ3VlKCk7XG4gIH0pO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcbkxhbmRpbmcucHJvdG90eXBlID0gbmV3IEY7XG5MYW5kaW5nLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IExhbmRpbmc7XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9sYW5kaW5nLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvbGlzdC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIGN1cnNvciA9IEJhc2UuY3Vyc29yXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgTGlzdGAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gTGlzdDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBMaXN0YCB0ZXN0IHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gTGlzdChydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIG4gPSAwO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIGNvbnNvbGUubG9nKCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigndGVzdCcsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbG9yKCdwYXNzJywgJyAgICAnICsgdGVzdC5mdWxsVGl0bGUoKSArICc6ICcpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwZW5kaW5nJywgZnVuY3Rpb24odGVzdCl7XG4gICAgdmFyIGZtdCA9IGNvbG9yKCdjaGVja21hcmsnLCAnICAtJylcbiAgICAgICsgY29sb3IoJ3BlbmRpbmcnLCAnICVzJyk7XG4gICAgY29uc29sZS5sb2coZm10LCB0ZXN0LmZ1bGxUaXRsZSgpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgdmFyIGZtdCA9IGNvbG9yKCdjaGVja21hcmsnLCAnICAnK0Jhc2Uuc3ltYm9scy5kb3QpXG4gICAgICArIGNvbG9yKCdwYXNzJywgJyAlczogJylcbiAgICAgICsgY29sb3IodGVzdC5zcGVlZCwgJyVkbXMnKTtcbiAgICBjdXJzb3IuQ1IoKTtcbiAgICBjb25zb2xlLmxvZyhmbXQsIHRlc3QuZnVsbFRpdGxlKCksIHRlc3QuZHVyYXRpb24pO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIGN1cnNvci5DUigpO1xuICAgIGNvbnNvbGUubG9nKGNvbG9yKCdmYWlsJywgJyAgJWQpICVzJyksICsrbiwgdGVzdC5mdWxsVGl0bGUoKSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgc2VsZi5lcGlsb2d1ZS5iaW5kKHNlbGYpKTtcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEJhc2UucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gQmFzZS5wcm90b3R5cGU7XG5MaXN0LnByb3RvdHlwZSA9IG5ldyBGO1xuTGlzdC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBMaXN0O1xuXG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9saXN0LmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvbWFya2Rvd24uanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscycpO1xuXG4vKipcbiAqIEV4cG9zZSBgTWFya2Rvd25gLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IE1hcmtkb3duO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYE1hcmtkb3duYCByZXBvcnRlci5cbiAqXG4gKiBAcGFyYW0ge1J1bm5lcn0gcnVubmVyXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIE1hcmtkb3duKHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgbGV2ZWwgPSAwXG4gICAgLCBidWYgPSAnJztcblxuICBmdW5jdGlvbiB0aXRsZShzdHIpIHtcbiAgICByZXR1cm4gQXJyYXkobGV2ZWwpLmpvaW4oJyMnKSArICcgJyArIHN0cjtcbiAgfVxuXG4gIGZ1bmN0aW9uIGluZGVudCgpIHtcbiAgICByZXR1cm4gQXJyYXkobGV2ZWwpLmpvaW4oJyAgJyk7XG4gIH1cblxuICBmdW5jdGlvbiBtYXBUT0Moc3VpdGUsIG9iaikge1xuICAgIHZhciByZXQgPSBvYmo7XG4gICAgb2JqID0gb2JqW3N1aXRlLnRpdGxlXSA9IG9ialtzdWl0ZS50aXRsZV0gfHwgeyBzdWl0ZTogc3VpdGUgfTtcbiAgICBzdWl0ZS5zdWl0ZXMuZm9yRWFjaChmdW5jdGlvbihzdWl0ZSl7XG4gICAgICBtYXBUT0Moc3VpdGUsIG9iaik7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHN0cmluZ2lmeVRPQyhvYmosIGxldmVsKSB7XG4gICAgKytsZXZlbDtcbiAgICB2YXIgYnVmID0gJyc7XG4gICAgdmFyIGxpbms7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKCdzdWl0ZScgPT0ga2V5KSBjb250aW51ZTtcbiAgICAgIGlmIChrZXkpIGxpbmsgPSAnIC0gWycgKyBrZXkgKyAnXSgjJyArIHV0aWxzLnNsdWcob2JqW2tleV0uc3VpdGUuZnVsbFRpdGxlKCkpICsgJylcXG4nO1xuICAgICAgaWYgKGtleSkgYnVmICs9IEFycmF5KGxldmVsKS5qb2luKCcgICcpICsgbGluaztcbiAgICAgIGJ1ZiArPSBzdHJpbmdpZnlUT0Mob2JqW2tleV0sIGxldmVsKTtcbiAgICB9XG4gICAgLS1sZXZlbDtcbiAgICByZXR1cm4gYnVmO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2VuZXJhdGVUT0Moc3VpdGUpIHtcbiAgICB2YXIgb2JqID0gbWFwVE9DKHN1aXRlLCB7fSk7XG4gICAgcmV0dXJuIHN0cmluZ2lmeVRPQyhvYmosIDApO1xuICB9XG5cbiAgZ2VuZXJhdGVUT0MocnVubmVyLnN1aXRlKTtcblxuICBydW5uZXIub24oJ3N1aXRlJywgZnVuY3Rpb24oc3VpdGUpe1xuICAgICsrbGV2ZWw7XG4gICAgdmFyIHNsdWcgPSB1dGlscy5zbHVnKHN1aXRlLmZ1bGxUaXRsZSgpKTtcbiAgICBidWYgKz0gJzxhIG5hbWU9XCInICsgc2x1ZyArICdcIj48L2E+JyArICdcXG4nO1xuICAgIGJ1ZiArPSB0aXRsZShzdWl0ZS50aXRsZSkgKyAnXFxuJztcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZSBlbmQnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgLS1sZXZlbDtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwYXNzJywgZnVuY3Rpb24odGVzdCl7XG4gICAgdmFyIGNvZGUgPSB1dGlscy5jbGVhbih0ZXN0LmZuLnRvU3RyaW5nKCkpO1xuICAgIGJ1ZiArPSB0ZXN0LnRpdGxlICsgJy5cXG4nO1xuICAgIGJ1ZiArPSAnXFxuYGBganNcXG4nO1xuICAgIGJ1ZiArPSBjb2RlICsgJ1xcbic7XG4gICAgYnVmICs9ICdgYGBcXG5cXG4nO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJyMgVE9DXFxuJyk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoZ2VuZXJhdGVUT0MocnVubmVyLnN1aXRlKSk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoYnVmKTtcbiAgfSk7XG59XG59KTsgLy8gbW9kdWxlOiByZXBvcnRlcnMvbWFya2Rvd24uanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy9taW4uanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBCYXNlID0gcmVxdWlyZSgnLi9iYXNlJyk7XG5cbi8qKlxuICogRXhwb3NlIGBNaW5gLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IE1pbjtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBNaW5gIG1pbmltYWwgdGVzdCByZXBvcnRlciAoYmVzdCB1c2VkIHdpdGggLS13YXRjaCkuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBNaW4ocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIC8vIGNsZWFyIHNjcmVlblxuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHUwMDFiWzJKJyk7XG4gICAgLy8gc2V0IGN1cnNvciBwb3NpdGlvblxuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdcXHUwMDFiWzE7M0gnKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCB0aGlzLmVwaWxvZ3VlLmJpbmQodGhpcykpO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcbk1pbi5wcm90b3R5cGUgPSBuZXcgRjtcbk1pbi5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBNaW47XG5cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL21pbi5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicmVwb3J0ZXJzL255YW4uanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgRG90YC5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBOeWFuQ2F0O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYERvdGAgbWF0cml4IHRlc3QgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBOeWFuQ2F0KHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIHdpZHRoID0gQmFzZS53aW5kb3cud2lkdGggKiAuNzUgfCAwXG4gICAgLCByYWluYm93Q29sb3JzID0gdGhpcy5yYWluYm93Q29sb3JzID0gc2VsZi5nZW5lcmF0ZUNvbG9ycygpXG4gICAgLCBjb2xvckluZGV4ID0gdGhpcy5jb2xvckluZGV4ID0gMFxuICAgICwgbnVtZXJPZkxpbmVzID0gdGhpcy5udW1iZXJPZkxpbmVzID0gNFxuICAgICwgdHJhamVjdG9yaWVzID0gdGhpcy50cmFqZWN0b3JpZXMgPSBbW10sIFtdLCBbXSwgW11dXG4gICAgLCBueWFuQ2F0V2lkdGggPSB0aGlzLm55YW5DYXRXaWR0aCA9IDExXG4gICAgLCB0cmFqZWN0b3J5V2lkdGhNYXggPSB0aGlzLnRyYWplY3RvcnlXaWR0aE1heCA9ICh3aWR0aCAtIG55YW5DYXRXaWR0aClcbiAgICAsIHNjb3JlYm9hcmRXaWR0aCA9IHRoaXMuc2NvcmVib2FyZFdpZHRoID0gNVxuICAgICwgdGljayA9IHRoaXMudGljayA9IDBcbiAgICAsIG4gPSAwO1xuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIEJhc2UuY3Vyc29yLmhpZGUoKTtcbiAgICBzZWxmLmRyYXcoKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdwZW5kaW5nJywgZnVuY3Rpb24odGVzdCl7XG4gICAgc2VsZi5kcmF3KCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHNlbGYuZHJhdygpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0LCBlcnIpe1xuICAgIHNlbGYuZHJhdygpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgQmFzZS5jdXJzb3Iuc2hvdygpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsZi5udW1iZXJPZkxpbmVzOyBpKyspIHdyaXRlKCdcXG4nKTtcbiAgICBzZWxmLmVwaWxvZ3VlKCk7XG4gIH0pO1xufVxuXG4vKipcbiAqIERyYXcgdGhlIG55YW4gY2F0XG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuZHJhdyA9IGZ1bmN0aW9uKCl7XG4gIHRoaXMuYXBwZW5kUmFpbmJvdygpO1xuICB0aGlzLmRyYXdTY29yZWJvYXJkKCk7XG4gIHRoaXMuZHJhd1JhaW5ib3coKTtcbiAgdGhpcy5kcmF3TnlhbkNhdCgpO1xuICB0aGlzLnRpY2sgPSAhdGhpcy50aWNrO1xufTtcblxuLyoqXG4gKiBEcmF3IHRoZSBcInNjb3JlYm9hcmRcIiBzaG93aW5nIHRoZSBudW1iZXJcbiAqIG9mIHBhc3NlcywgZmFpbHVyZXMgYW5kIHBlbmRpbmcgdGVzdHMuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuZHJhd1Njb3JlYm9hcmQgPSBmdW5jdGlvbigpe1xuICB2YXIgc3RhdHMgPSB0aGlzLnN0YXRzO1xuICB2YXIgY29sb3JzID0gQmFzZS5jb2xvcnM7XG5cbiAgZnVuY3Rpb24gZHJhdyhjb2xvciwgbikge1xuICAgIHdyaXRlKCcgJyk7XG4gICAgd3JpdGUoJ1xcdTAwMWJbJyArIGNvbG9yICsgJ20nICsgbiArICdcXHUwMDFiWzBtJyk7XG4gICAgd3JpdGUoJ1xcbicpO1xuICB9XG5cbiAgZHJhdyhjb2xvcnMuZ3JlZW4sIHN0YXRzLnBhc3Nlcyk7XG4gIGRyYXcoY29sb3JzLmZhaWwsIHN0YXRzLmZhaWx1cmVzKTtcbiAgZHJhdyhjb2xvcnMucGVuZGluZywgc3RhdHMucGVuZGluZyk7XG4gIHdyaXRlKCdcXG4nKTtcblxuICB0aGlzLmN1cnNvclVwKHRoaXMubnVtYmVyT2ZMaW5lcyk7XG59O1xuXG4vKipcbiAqIEFwcGVuZCB0aGUgcmFpbmJvdy5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5hcHBlbmRSYWluYm93ID0gZnVuY3Rpb24oKXtcbiAgdmFyIHNlZ21lbnQgPSB0aGlzLnRpY2sgPyAnXycgOiAnLSc7XG4gIHZhciByYWluYm93aWZpZWQgPSB0aGlzLnJhaW5ib3dpZnkoc2VnbWVudCk7XG5cbiAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IHRoaXMubnVtYmVyT2ZMaW5lczsgaW5kZXgrKykge1xuICAgIHZhciB0cmFqZWN0b3J5ID0gdGhpcy50cmFqZWN0b3JpZXNbaW5kZXhdO1xuICAgIGlmICh0cmFqZWN0b3J5Lmxlbmd0aCA+PSB0aGlzLnRyYWplY3RvcnlXaWR0aE1heCkgdHJhamVjdG9yeS5zaGlmdCgpO1xuICAgIHRyYWplY3RvcnkucHVzaChyYWluYm93aWZpZWQpO1xuICB9XG59O1xuXG4vKipcbiAqIERyYXcgdGhlIHJhaW5ib3cuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuZHJhd1JhaW5ib3cgPSBmdW5jdGlvbigpe1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgdGhpcy50cmFqZWN0b3JpZXMuZm9yRWFjaChmdW5jdGlvbihsaW5lLCBpbmRleCkge1xuICAgIHdyaXRlKCdcXHUwMDFiWycgKyBzZWxmLnNjb3JlYm9hcmRXaWR0aCArICdDJyk7XG4gICAgd3JpdGUobGluZS5qb2luKCcnKSk7XG4gICAgd3JpdGUoJ1xcbicpO1xuICB9KTtcblxuICB0aGlzLmN1cnNvclVwKHRoaXMubnVtYmVyT2ZMaW5lcyk7XG59O1xuXG4vKipcbiAqIERyYXcgdGhlIG55YW4gY2F0XG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuZHJhd055YW5DYXQgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB2YXIgc3RhcnRXaWR0aCA9IHRoaXMuc2NvcmVib2FyZFdpZHRoICsgdGhpcy50cmFqZWN0b3JpZXNbMF0ubGVuZ3RoO1xuICB2YXIgY29sb3IgPSAnXFx1MDAxYlsnICsgc3RhcnRXaWR0aCArICdDJztcbiAgdmFyIHBhZGRpbmcgPSAnJztcblxuICB3cml0ZShjb2xvcik7XG4gIHdyaXRlKCdfLC0tLS0tLSwnKTtcbiAgd3JpdGUoJ1xcbicpO1xuXG4gIHdyaXRlKGNvbG9yKTtcbiAgcGFkZGluZyA9IHNlbGYudGljayA/ICcgICcgOiAnICAgJztcbiAgd3JpdGUoJ198JyArIHBhZGRpbmcgKyAnL1xcXFxfL1xcXFwgJyk7XG4gIHdyaXRlKCdcXG4nKTtcblxuICB3cml0ZShjb2xvcik7XG4gIHBhZGRpbmcgPSBzZWxmLnRpY2sgPyAnXycgOiAnX18nO1xuICB2YXIgdGFpbCA9IHNlbGYudGljayA/ICd+JyA6ICdeJztcbiAgdmFyIGZhY2U7XG4gIHdyaXRlKHRhaWwgKyAnfCcgKyBwYWRkaW5nICsgdGhpcy5mYWNlKCkgKyAnICcpO1xuICB3cml0ZSgnXFxuJyk7XG5cbiAgd3JpdGUoY29sb3IpO1xuICBwYWRkaW5nID0gc2VsZi50aWNrID8gJyAnIDogJyAgJztcbiAgd3JpdGUocGFkZGluZyArICdcIlwiICBcIlwiICcpO1xuICB3cml0ZSgnXFxuJyk7XG5cbiAgdGhpcy5jdXJzb3JVcCh0aGlzLm51bWJlck9mTGluZXMpO1xufTtcblxuLyoqXG4gKiBEcmF3IG55YW4gY2F0IGZhY2UuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuZmFjZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgc3RhdHMgPSB0aGlzLnN0YXRzO1xuICBpZiAoc3RhdHMuZmFpbHVyZXMpIHtcbiAgICByZXR1cm4gJyggeCAueCknO1xuICB9IGVsc2UgaWYgKHN0YXRzLnBlbmRpbmcpIHtcbiAgICByZXR1cm4gJyggbyAubyknO1xuICB9IGVsc2UgaWYoc3RhdHMucGFzc2VzKSB7XG4gICAgcmV0dXJuICcoIF4gLl4pJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gJyggLSAuLSknO1xuICB9XG59XG5cbi8qKlxuICogTW92ZSBjdXJzb3IgdXAgYG5gLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5OeWFuQ2F0LnByb3RvdHlwZS5jdXJzb3JVcCA9IGZ1bmN0aW9uKG4pIHtcbiAgd3JpdGUoJ1xcdTAwMWJbJyArIG4gKyAnQScpO1xufTtcblxuLyoqXG4gKiBNb3ZlIGN1cnNvciBkb3duIGBuYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUuY3Vyc29yRG93biA9IGZ1bmN0aW9uKG4pIHtcbiAgd3JpdGUoJ1xcdTAwMWJbJyArIG4gKyAnQicpO1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZSByYWluYm93IGNvbG9ycy5cbiAqXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk55YW5DYXQucHJvdG90eXBlLmdlbmVyYXRlQ29sb3JzID0gZnVuY3Rpb24oKXtcbiAgdmFyIGNvbG9ycyA9IFtdO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgKDYgKiA3KTsgaSsrKSB7XG4gICAgdmFyIHBpMyA9IE1hdGguZmxvb3IoTWF0aC5QSSAvIDMpO1xuICAgIHZhciBuID0gKGkgKiAoMS4wIC8gNikpO1xuICAgIHZhciByID0gTWF0aC5mbG9vcigzICogTWF0aC5zaW4obikgKyAzKTtcbiAgICB2YXIgZyA9IE1hdGguZmxvb3IoMyAqIE1hdGguc2luKG4gKyAyICogcGkzKSArIDMpO1xuICAgIHZhciBiID0gTWF0aC5mbG9vcigzICogTWF0aC5zaW4obiArIDQgKiBwaTMpICsgMyk7XG4gICAgY29sb3JzLnB1c2goMzYgKiByICsgNiAqIGcgKyBiICsgMTYpO1xuICB9XG5cbiAgcmV0dXJuIGNvbG9ycztcbn07XG5cbi8qKlxuICogQXBwbHkgcmFpbmJvdyB0byB0aGUgZ2l2ZW4gYHN0cmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuTnlhbkNhdC5wcm90b3R5cGUucmFpbmJvd2lmeSA9IGZ1bmN0aW9uKHN0cil7XG4gIHZhciBjb2xvciA9IHRoaXMucmFpbmJvd0NvbG9yc1t0aGlzLmNvbG9ySW5kZXggJSB0aGlzLnJhaW5ib3dDb2xvcnMubGVuZ3RoXTtcbiAgdGhpcy5jb2xvckluZGV4ICs9IDE7XG4gIHJldHVybiAnXFx1MDAxYlszODs1OycgKyBjb2xvciArICdtJyArIHN0ciArICdcXHUwMDFiWzBtJztcbn07XG5cbi8qKlxuICogU3Rkb3V0IGhlbHBlci5cbiAqL1xuXG5mdW5jdGlvbiB3cml0ZShzdHJpbmcpIHtcbiAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoc3RyaW5nKTtcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEJhc2UucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gQmFzZS5wcm90b3R5cGU7XG5OeWFuQ2F0LnByb3RvdHlwZSA9IG5ldyBGO1xuTnlhbkNhdC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBOeWFuQ2F0O1xuXG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9ueWFuLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvcHJvZ3Jlc3MuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY3Vyc29yID0gQmFzZS5jdXJzb3JcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBQcm9ncmVzc2AuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gUHJvZ3Jlc3M7XG5cbi8qKlxuICogR2VuZXJhbCBwcm9ncmVzcyBiYXIgY29sb3IuXG4gKi9cblxuQmFzZS5jb2xvcnMucHJvZ3Jlc3MgPSA5MDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBQcm9ncmVzc2AgYmFyIHRlc3QgcmVwb3J0ZXIuXG4gKlxuICogQHBhcmFtIHtSdW5uZXJ9IHJ1bm5lclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gUHJvZ3Jlc3MocnVubmVyLCBvcHRpb25zKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgd2lkdGggPSBCYXNlLndpbmRvdy53aWR0aCAqIC41MCB8IDBcbiAgICAsIHRvdGFsID0gcnVubmVyLnRvdGFsXG4gICAgLCBjb21wbGV0ZSA9IDBcbiAgICAsIG1heCA9IE1hdGgubWF4XG4gICAgLCBsYXN0TiA9IC0xO1xuXG4gIC8vIGRlZmF1bHQgY2hhcnNcbiAgb3B0aW9ucy5vcGVuID0gb3B0aW9ucy5vcGVuIHx8ICdbJztcbiAgb3B0aW9ucy5jb21wbGV0ZSA9IG9wdGlvbnMuY29tcGxldGUgfHwgJ+KWrCc7XG4gIG9wdGlvbnMuaW5jb21wbGV0ZSA9IG9wdGlvbnMuaW5jb21wbGV0ZSB8fCBCYXNlLnN5bWJvbHMuZG90O1xuICBvcHRpb25zLmNsb3NlID0gb3B0aW9ucy5jbG9zZSB8fCAnXSc7XG4gIG9wdGlvbnMudmVyYm9zZSA9IGZhbHNlO1xuXG4gIC8vIHRlc3RzIHN0YXJ0ZWRcbiAgcnVubmVyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2coKTtcbiAgICBjdXJzb3IuaGlkZSgpO1xuICB9KTtcblxuICAvLyB0ZXN0cyBjb21wbGV0ZVxuICBydW5uZXIub24oJ3Rlc3QgZW5kJywgZnVuY3Rpb24oKXtcbiAgICBjb21wbGV0ZSsrO1xuICAgIHZhciBpbmNvbXBsZXRlID0gdG90YWwgLSBjb21wbGV0ZVxuICAgICAgLCBwZXJjZW50ID0gY29tcGxldGUgLyB0b3RhbFxuICAgICAgLCBuID0gd2lkdGggKiBwZXJjZW50IHwgMFxuICAgICAgLCBpID0gd2lkdGggLSBuO1xuXG4gICAgaWYgKGxhc3ROID09PSBuICYmICFvcHRpb25zLnZlcmJvc2UpIHtcbiAgICAgIC8vIERvbid0IHJlLXJlbmRlciB0aGUgbGluZSBpZiBpdCBoYXNuJ3QgY2hhbmdlZFxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsYXN0TiA9IG47XG5cbiAgICBjdXJzb3IuQ1IoKTtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnXFx1MDAxYltKJyk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29sb3IoJ3Byb2dyZXNzJywgJyAgJyArIG9wdGlvbnMub3BlbikpO1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKEFycmF5KG4pLmpvaW4ob3B0aW9ucy5jb21wbGV0ZSkpO1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKEFycmF5KGkpLmpvaW4ob3B0aW9ucy5pbmNvbXBsZXRlKSk7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29sb3IoJ3Byb2dyZXNzJywgb3B0aW9ucy5jbG9zZSkpO1xuICAgIGlmIChvcHRpb25zLnZlcmJvc2UpIHtcbiAgICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbG9yKCdwcm9ncmVzcycsICcgJyArIGNvbXBsZXRlICsgJyBvZiAnICsgdG90YWwpKTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIHRlc3RzIGFyZSBjb21wbGV0ZSwgb3V0cHV0IHNvbWUgc3RhdHNcbiAgLy8gYW5kIHRoZSBmYWlsdXJlcyBpZiBhbnlcbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIGN1cnNvci5zaG93KCk7XG4gICAgY29uc29sZS5sb2coKTtcbiAgICBzZWxmLmVwaWxvZ3VlKCk7XG4gIH0pO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgQmFzZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBCYXNlLnByb3RvdHlwZTtcblByb2dyZXNzLnByb3RvdHlwZSA9IG5ldyBGO1xuUHJvZ3Jlc3MucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gUHJvZ3Jlc3M7XG5cblxufSk7IC8vIG1vZHVsZTogcmVwb3J0ZXJzL3Byb2dyZXNzLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvc3BlYy5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIGN1cnNvciA9IEJhc2UuY3Vyc29yXG4gICwgY29sb3IgPSBCYXNlLmNvbG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgU3BlY2AuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gU3BlYztcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBTcGVjYCB0ZXN0IHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gU3BlYyhydW5uZXIpIHtcbiAgQmFzZS5jYWxsKHRoaXMsIHJ1bm5lcik7XG5cbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBzdGF0cyA9IHRoaXMuc3RhdHNcbiAgICAsIGluZGVudHMgPSAwXG4gICAgLCBuID0gMDtcblxuICBmdW5jdGlvbiBpbmRlbnQoKSB7XG4gICAgcmV0dXJuIEFycmF5KGluZGVudHMpLmpvaW4oJyAgJylcbiAgfVxuXG4gIHJ1bm5lci5vbignc3RhcnQnLCBmdW5jdGlvbigpe1xuICAgIGNvbnNvbGUubG9nKCk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignc3VpdGUnLCBmdW5jdGlvbihzdWl0ZSl7XG4gICAgKytpbmRlbnRzO1xuICAgIGNvbnNvbGUubG9nKGNvbG9yKCdzdWl0ZScsICclcyVzJyksIGluZGVudCgpLCBzdWl0ZS50aXRsZSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignc3VpdGUgZW5kJywgZnVuY3Rpb24oc3VpdGUpe1xuICAgIC0taW5kZW50cztcbiAgICBpZiAoMSA9PSBpbmRlbnRzKSBjb25zb2xlLmxvZygpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB2YXIgZm10ID0gaW5kZW50KCkgKyBjb2xvcigncGVuZGluZycsICcgIC0gJXMnKTtcbiAgICBjb25zb2xlLmxvZyhmbXQsIHRlc3QudGl0bGUpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Bhc3MnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBpZiAoJ2Zhc3QnID09IHRlc3Quc3BlZWQpIHtcbiAgICAgIHZhciBmbXQgPSBpbmRlbnQoKVxuICAgICAgICArIGNvbG9yKCdjaGVja21hcmsnLCAnICAnICsgQmFzZS5zeW1ib2xzLm9rKVxuICAgICAgICArIGNvbG9yKCdwYXNzJywgJyAlcyAnKTtcbiAgICAgIGN1cnNvci5DUigpO1xuICAgICAgY29uc29sZS5sb2coZm10LCB0ZXN0LnRpdGxlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGZtdCA9IGluZGVudCgpXG4gICAgICAgICsgY29sb3IoJ2NoZWNrbWFyaycsICcgICcgKyBCYXNlLnN5bWJvbHMub2spXG4gICAgICAgICsgY29sb3IoJ3Bhc3MnLCAnICVzICcpXG4gICAgICAgICsgY29sb3IodGVzdC5zcGVlZCwgJyglZG1zKScpO1xuICAgICAgY3Vyc29yLkNSKCk7XG4gICAgICBjb25zb2xlLmxvZyhmbXQsIHRlc3QudGl0bGUsIHRlc3QuZHVyYXRpb24pO1xuICAgIH1cbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdmYWlsJywgZnVuY3Rpb24odGVzdCwgZXJyKXtcbiAgICBjdXJzb3IuQ1IoKTtcbiAgICBjb25zb2xlLmxvZyhpbmRlbnQoKSArIGNvbG9yKCdmYWlsJywgJyAgJWQpICVzJyksICsrbiwgdGVzdC50aXRsZSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbignZW5kJywgc2VsZi5lcGlsb2d1ZS5iaW5kKHNlbGYpKTtcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEJhc2UucHJvdG90eXBlYC5cbiAqL1xuXG5mdW5jdGlvbiBGKCl7fTtcbkYucHJvdG90eXBlID0gQmFzZS5wcm90b3R5cGU7XG5TcGVjLnByb3RvdHlwZSA9IG5ldyBGO1xuU3BlYy5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBTcGVjO1xuXG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy9zcGVjLmpzXG5cbnJlcXVpcmUucmVnaXN0ZXIoXCJyZXBvcnRlcnMvdGFwLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgQmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpXG4gICwgY3Vyc29yID0gQmFzZS5jdXJzb3JcbiAgLCBjb2xvciA9IEJhc2UuY29sb3I7XG5cbi8qKlxuICogRXhwb3NlIGBUQVBgLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IFRBUDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBUQVBgIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gVEFQKHJ1bm5lcikge1xuICBCYXNlLmNhbGwodGhpcywgcnVubmVyKTtcblxuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHN0YXRzID0gdGhpcy5zdGF0c1xuICAgICwgbiA9IDFcbiAgICAsIHBhc3NlcyA9IDBcbiAgICAsIGZhaWx1cmVzID0gMDtcblxuICBydW5uZXIub24oJ3N0YXJ0JywgZnVuY3Rpb24oKXtcbiAgICB2YXIgdG90YWwgPSBydW5uZXIuZ3JlcFRvdGFsKHJ1bm5lci5zdWl0ZSk7XG4gICAgY29uc29sZS5sb2coJyVkLi4lZCcsIDEsIHRvdGFsKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKCl7XG4gICAgKytuO1xuICB9KTtcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICBjb25zb2xlLmxvZygnb2sgJWQgJXMgIyBTS0lQIC0nLCBuLCB0aXRsZSh0ZXN0KSk7XG4gIH0pO1xuXG4gIHJ1bm5lci5vbigncGFzcycsIGZ1bmN0aW9uKHRlc3Qpe1xuICAgIHBhc3NlcysrO1xuICAgIGNvbnNvbGUubG9nKCdvayAlZCAlcycsIG4sIHRpdGxlKHRlc3QpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdmYWlsJywgZnVuY3Rpb24odGVzdCwgZXJyKXtcbiAgICBmYWlsdXJlcysrO1xuICAgIGNvbnNvbGUubG9nKCdub3Qgb2sgJWQgJXMnLCBuLCB0aXRsZSh0ZXN0KSk7XG4gICAgaWYgKGVyci5zdGFjaykgY29uc29sZS5sb2coZXJyLnN0YWNrLnJlcGxhY2UoL14vZ20sICcgICcpKTtcbiAgfSk7XG5cbiAgcnVubmVyLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIGNvbnNvbGUubG9nKCcjIHRlc3RzICcgKyAocGFzc2VzICsgZmFpbHVyZXMpKTtcbiAgICBjb25zb2xlLmxvZygnIyBwYXNzICcgKyBwYXNzZXMpO1xuICAgIGNvbnNvbGUubG9nKCcjIGZhaWwgJyArIGZhaWx1cmVzKTtcbiAgfSk7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgVEFQLXNhZmUgdGl0bGUgb2YgYHRlc3RgXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHRlc3RcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHRpdGxlKHRlc3QpIHtcbiAgcmV0dXJuIHRlc3QuZnVsbFRpdGxlKCkucmVwbGFjZSgvIy9nLCAnJyk7XG59XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy90YXAuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJlcG9ydGVycy94dW5pdC5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEJhc2UgPSByZXF1aXJlKCcuL2Jhc2UnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKVxuICAsIGVzY2FwZSA9IHV0aWxzLmVzY2FwZTtcblxuLyoqXG4gKiBTYXZlIHRpbWVyIHJlZmVyZW5jZXMgdG8gYXZvaWQgU2lub24gaW50ZXJmZXJpbmcgKHNlZSBHSC0yMzcpLlxuICovXG5cbnZhciBEYXRlID0gZ2xvYmFsLkRhdGVcbiAgLCBzZXRUaW1lb3V0ID0gZ2xvYmFsLnNldFRpbWVvdXRcbiAgLCBzZXRJbnRlcnZhbCA9IGdsb2JhbC5zZXRJbnRlcnZhbFxuICAsIGNsZWFyVGltZW91dCA9IGdsb2JhbC5jbGVhclRpbWVvdXRcbiAgLCBjbGVhckludGVydmFsID0gZ2xvYmFsLmNsZWFySW50ZXJ2YWw7XG5cbi8qKlxuICogRXhwb3NlIGBYVW5pdGAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gWFVuaXQ7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgWFVuaXRgIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7UnVubmVyfSBydW5uZXJcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gWFVuaXQocnVubmVyKSB7XG4gIEJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuICB2YXIgc3RhdHMgPSB0aGlzLnN0YXRzXG4gICAgLCB0ZXN0cyA9IFtdXG4gICAgLCBzZWxmID0gdGhpcztcblxuICBydW5uZXIub24oJ3BlbmRpbmcnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB0ZXN0cy5wdXNoKHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ3Bhc3MnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB0ZXN0cy5wdXNoKHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2ZhaWwnLCBmdW5jdGlvbih0ZXN0KXtcbiAgICB0ZXN0cy5wdXNoKHRlc3QpO1xuICB9KTtcblxuICBydW5uZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCl7XG4gICAgY29uc29sZS5sb2codGFnKCd0ZXN0c3VpdGUnLCB7XG4gICAgICAgIG5hbWU6ICdNb2NoYSBUZXN0cydcbiAgICAgICwgdGVzdHM6IHN0YXRzLnRlc3RzXG4gICAgICAsIGZhaWx1cmVzOiBzdGF0cy5mYWlsdXJlc1xuICAgICAgLCBlcnJvcnM6IHN0YXRzLmZhaWx1cmVzXG4gICAgICAsIHNraXBwZWQ6IHN0YXRzLnRlc3RzIC0gc3RhdHMuZmFpbHVyZXMgLSBzdGF0cy5wYXNzZXNcbiAgICAgICwgdGltZXN0YW1wOiAobmV3IERhdGUpLnRvVVRDU3RyaW5nKClcbiAgICAgICwgdGltZTogKHN0YXRzLmR1cmF0aW9uIC8gMTAwMCkgfHwgMFxuICAgIH0sIGZhbHNlKSk7XG5cbiAgICB0ZXN0cy5mb3JFYWNoKHRlc3QpO1xuICAgIGNvbnNvbGUubG9nKCc8L3Rlc3RzdWl0ZT4nKTtcbiAgfSk7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBCYXNlLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEJhc2UucHJvdG90eXBlO1xuWFVuaXQucHJvdG90eXBlID0gbmV3IEY7XG5YVW5pdC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBYVW5pdDtcblxuXG4vKipcbiAqIE91dHB1dCB0YWcgZm9yIHRoZSBnaXZlbiBgdGVzdC5gXG4gKi9cblxuZnVuY3Rpb24gdGVzdCh0ZXN0KSB7XG4gIHZhciBhdHRycyA9IHtcbiAgICAgIGNsYXNzbmFtZTogdGVzdC5wYXJlbnQuZnVsbFRpdGxlKClcbiAgICAsIG5hbWU6IHRlc3QudGl0bGVcbiAgICAsIHRpbWU6ICh0ZXN0LmR1cmF0aW9uIC8gMTAwMCkgfHwgMFxuICB9O1xuXG4gIGlmICgnZmFpbGVkJyA9PSB0ZXN0LnN0YXRlKSB7XG4gICAgdmFyIGVyciA9IHRlc3QuZXJyO1xuICAgIGNvbnNvbGUubG9nKHRhZygndGVzdGNhc2UnLCBhdHRycywgZmFsc2UsIHRhZygnZmFpbHVyZScsIHt9LCBmYWxzZSwgY2RhdGEoZXNjYXBlKGVyci5tZXNzYWdlKSArIFwiXFxuXCIgKyBlcnIuc3RhY2spKSkpO1xuICB9IGVsc2UgaWYgKHRlc3QucGVuZGluZykge1xuICAgIGNvbnNvbGUubG9nKHRhZygndGVzdGNhc2UnLCBhdHRycywgZmFsc2UsIHRhZygnc2tpcHBlZCcsIHt9LCB0cnVlKSkpO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKHRhZygndGVzdGNhc2UnLCBhdHRycywgdHJ1ZSkgKTtcbiAgfVxufVxuXG4vKipcbiAqIEhUTUwgdGFnIGhlbHBlci5cbiAqL1xuXG5mdW5jdGlvbiB0YWcobmFtZSwgYXR0cnMsIGNsb3NlLCBjb250ZW50KSB7XG4gIHZhciBlbmQgPSBjbG9zZSA/ICcvPicgOiAnPidcbiAgICAsIHBhaXJzID0gW11cbiAgICAsIHRhZztcblxuICBmb3IgKHZhciBrZXkgaW4gYXR0cnMpIHtcbiAgICBwYWlycy5wdXNoKGtleSArICc9XCInICsgZXNjYXBlKGF0dHJzW2tleV0pICsgJ1wiJyk7XG4gIH1cblxuICB0YWcgPSAnPCcgKyBuYW1lICsgKHBhaXJzLmxlbmd0aCA/ICcgJyArIHBhaXJzLmpvaW4oJyAnKSA6ICcnKSArIGVuZDtcbiAgaWYgKGNvbnRlbnQpIHRhZyArPSBjb250ZW50ICsgJzwvJyArIG5hbWUgKyBlbmQ7XG4gIHJldHVybiB0YWc7XG59XG5cbi8qKlxuICogUmV0dXJuIGNkYXRhIGVzY2FwZWQgQ0RBVEEgYHN0cmAuXG4gKi9cblxuZnVuY3Rpb24gY2RhdGEoc3RyKSB7XG4gIHJldHVybiAnPCFbQ0RBVEFbJyArIGVzY2FwZShzdHIpICsgJ11dPic7XG59XG5cbn0pOyAvLyBtb2R1bGU6IHJlcG9ydGVycy94dW5pdC5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwicnVubmFibGUuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdicm93c2VyL2V2ZW50cycpLkV2ZW50RW1pdHRlclxuICAsIGRlYnVnID0gcmVxdWlyZSgnYnJvd3Nlci9kZWJ1ZycpKCdtb2NoYTpydW5uYWJsZScpXG4gICwgbWlsbGlzZWNvbmRzID0gcmVxdWlyZSgnLi9tcycpO1xuXG4vKipcbiAqIFNhdmUgdGltZXIgcmVmZXJlbmNlcyB0byBhdm9pZCBTaW5vbiBpbnRlcmZlcmluZyAoc2VlIEdILTIzNykuXG4gKi9cblxudmFyIERhdGUgPSBnbG9iYWwuRGF0ZVxuICAsIHNldFRpbWVvdXQgPSBnbG9iYWwuc2V0VGltZW91dFxuICAsIHNldEludGVydmFsID0gZ2xvYmFsLnNldEludGVydmFsXG4gICwgY2xlYXJUaW1lb3V0ID0gZ2xvYmFsLmNsZWFyVGltZW91dFxuICAsIGNsZWFySW50ZXJ2YWwgPSBnbG9iYWwuY2xlYXJJbnRlcnZhbDtcblxuLyoqXG4gKiBPYmplY3QjdG9TdHJpbmcoKS5cbiAqL1xuXG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nO1xuXG4vKipcbiAqIEV4cG9zZSBgUnVubmFibGVgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gUnVubmFibGU7XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgUnVubmFibGVgIHdpdGggdGhlIGdpdmVuIGB0aXRsZWAgYW5kIGNhbGxiYWNrIGBmbmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHRpdGxlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gUnVubmFibGUodGl0bGUsIGZuKSB7XG4gIHRoaXMudGl0bGUgPSB0aXRsZTtcbiAgdGhpcy5mbiA9IGZuO1xuICB0aGlzLmFzeW5jID0gZm4gJiYgZm4ubGVuZ3RoO1xuICB0aGlzLnN5bmMgPSAhIHRoaXMuYXN5bmM7XG4gIHRoaXMuX3RpbWVvdXQgPSAyMDAwO1xuICB0aGlzLl9zbG93ID0gNzU7XG4gIHRoaXMuX2VuYWJsZVRpbWVvdXRzID0gdHJ1ZTtcbiAgdGhpcy50aW1lZE91dCA9IGZhbHNlO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgRXZlbnRFbWl0dGVyLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGU7XG5SdW5uYWJsZS5wcm90b3R5cGUgPSBuZXcgRjtcblJ1bm5hYmxlLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFJ1bm5hYmxlO1xuXG5cbi8qKlxuICogU2V0ICYgZ2V0IHRpbWVvdXQgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcnxTdHJpbmd9IG1zXG4gKiBAcmV0dXJuIHtSdW5uYWJsZXxOdW1iZXJ9IG1zIG9yIHNlbGZcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5hYmxlLnByb3RvdHlwZS50aW1lb3V0ID0gZnVuY3Rpb24obXMpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fdGltZW91dDtcbiAgaWYgKCdzdHJpbmcnID09IHR5cGVvZiBtcykgbXMgPSBtaWxsaXNlY29uZHMobXMpO1xuICBkZWJ1ZygndGltZW91dCAlZCcsIG1zKTtcbiAgdGhpcy5fdGltZW91dCA9IG1zO1xuICBpZiAodGhpcy50aW1lcikgdGhpcy5yZXNldFRpbWVvdXQoKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCAmIGdldCBzbG93IGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ8U3RyaW5nfSBtc1xuICogQHJldHVybiB7UnVubmFibGV8TnVtYmVyfSBtcyBvciBzZWxmXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uYWJsZS5wcm90b3R5cGUuc2xvdyA9IGZ1bmN0aW9uKG1zKXtcbiAgaWYgKDAgPT09IGFyZ3VtZW50cy5sZW5ndGgpIHJldHVybiB0aGlzLl9zbG93O1xuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIG1zKSBtcyA9IG1pbGxpc2Vjb25kcyhtcyk7XG4gIGRlYnVnKCd0aW1lb3V0ICVkJywgbXMpO1xuICB0aGlzLl9zbG93ID0gbXM7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgYW5kICYgZ2V0IHRpbWVvdXQgYGVuYWJsZWRgLlxuICpcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlZFxuICogQHJldHVybiB7UnVubmFibGV8Qm9vbGVhbn0gZW5hYmxlZCBvciBzZWxmXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uYWJsZS5wcm90b3R5cGUuZW5hYmxlVGltZW91dHMgPSBmdW5jdGlvbihlbmFibGVkKXtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHJldHVybiB0aGlzLl9lbmFibGVUaW1lb3V0cztcbiAgZGVidWcoJ2VuYWJsZVRpbWVvdXRzICVzJywgZW5hYmxlZCk7XG4gIHRoaXMuX2VuYWJsZVRpbWVvdXRzID0gZW5hYmxlZDtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJldHVybiB0aGUgZnVsbCB0aXRsZSBnZW5lcmF0ZWQgYnkgcmVjdXJzaXZlbHlcbiAqIGNvbmNhdGVuYXRpbmcgdGhlIHBhcmVudCdzIGZ1bGwgdGl0bGUuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SdW5uYWJsZS5wcm90b3R5cGUuZnVsbFRpdGxlID0gZnVuY3Rpb24oKXtcbiAgcmV0dXJuIHRoaXMucGFyZW50LmZ1bGxUaXRsZSgpICsgJyAnICsgdGhpcy50aXRsZTtcbn07XG5cbi8qKlxuICogQ2xlYXIgdGhlIHRpbWVvdXQuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmFibGUucHJvdG90eXBlLmNsZWFyVGltZW91dCA9IGZ1bmN0aW9uKCl7XG4gIGNsZWFyVGltZW91dCh0aGlzLnRpbWVyKTtcbn07XG5cbi8qKlxuICogSW5zcGVjdCB0aGUgcnVubmFibGUgdm9pZCBvZiBwcml2YXRlIHByb3BlcnRpZXMuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmFibGUucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbigpe1xuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodGhpcywgZnVuY3Rpb24oa2V5LCB2YWwpe1xuICAgIGlmICgnXycgPT0ga2V5WzBdKSByZXR1cm47XG4gICAgaWYgKCdwYXJlbnQnID09IGtleSkgcmV0dXJuICcjPFN1aXRlPic7XG4gICAgaWYgKCdjdHgnID09IGtleSkgcmV0dXJuICcjPENvbnRleHQ+JztcbiAgICByZXR1cm4gdmFsO1xuICB9LCAyKTtcbn07XG5cbi8qKlxuICogUmVzZXQgdGhlIHRpbWVvdXQuXG4gKlxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmFibGUucHJvdG90eXBlLnJlc2V0VGltZW91dCA9IGZ1bmN0aW9uKCl7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIG1zID0gdGhpcy50aW1lb3V0KCkgfHwgMWU5O1xuXG4gIGlmICghdGhpcy5fZW5hYmxlVGltZW91dHMpIHJldHVybjtcbiAgdGhpcy5jbGVhclRpbWVvdXQoKTtcbiAgdGhpcy50aW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICBzZWxmLmNhbGxiYWNrKG5ldyBFcnJvcigndGltZW91dCBvZiAnICsgbXMgKyAnbXMgZXhjZWVkZWQnKSk7XG4gICAgc2VsZi50aW1lZE91dCA9IHRydWU7XG4gIH0sIG1zKTtcbn07XG5cbi8qKlxuICogV2hpdGVsaXN0IHRoZXNlIGdsb2JhbHMgZm9yIHRoaXMgdGVzdCBydW5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuUnVubmFibGUucHJvdG90eXBlLmdsb2JhbHMgPSBmdW5jdGlvbihhcnIpe1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHRoaXMuX2FsbG93ZWRHbG9iYWxzID0gYXJyO1xufTtcblxuLyoqXG4gKiBSdW4gdGhlIHRlc3QgYW5kIGludm9rZSBgZm4oZXJyKWAuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5hYmxlLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbihmbil7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgc3RhcnQgPSBuZXcgRGF0ZVxuICAgICwgY3R4ID0gdGhpcy5jdHhcbiAgICAsIGZpbmlzaGVkXG4gICAgLCBlbWl0dGVkO1xuXG4gIC8vIFNvbWUgdGltZXMgdGhlIGN0eCBleGlzdHMgYnV0IGl0IGlzIG5vdCBydW5uYWJsZVxuICBpZiAoY3R4ICYmIGN0eC5ydW5uYWJsZSkgY3R4LnJ1bm5hYmxlKHRoaXMpO1xuXG4gIC8vIGNhbGxlZCBtdWx0aXBsZSB0aW1lc1xuICBmdW5jdGlvbiBtdWx0aXBsZShlcnIpIHtcbiAgICBpZiAoZW1pdHRlZCkgcmV0dXJuO1xuICAgIGVtaXR0ZWQgPSB0cnVlO1xuICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIgfHwgbmV3IEVycm9yKCdkb25lKCkgY2FsbGVkIG11bHRpcGxlIHRpbWVzJykpO1xuICB9XG5cbiAgLy8gZmluaXNoZWRcbiAgZnVuY3Rpb24gZG9uZShlcnIpIHtcbiAgICB2YXIgbXMgPSBzZWxmLnRpbWVvdXQoKTtcbiAgICBpZiAoc2VsZi50aW1lZE91dCkgcmV0dXJuO1xuICAgIGlmIChmaW5pc2hlZCkgcmV0dXJuIG11bHRpcGxlKGVycik7XG4gICAgc2VsZi5jbGVhclRpbWVvdXQoKTtcbiAgICBzZWxmLmR1cmF0aW9uID0gbmV3IERhdGUgLSBzdGFydDtcbiAgICBmaW5pc2hlZCA9IHRydWU7XG4gICAgaWYgKCFlcnIgJiYgc2VsZi5kdXJhdGlvbiA+IG1zICYmIHNlbGYuX2VuYWJsZVRpbWVvdXRzKSBlcnIgPSBuZXcgRXJyb3IoJ3RpbWVvdXQgb2YgJyArIG1zICsgJ21zIGV4Y2VlZGVkJyk7XG4gICAgZm4oZXJyKTtcbiAgfVxuXG4gIC8vIGZvciAucmVzZXRUaW1lb3V0KClcbiAgdGhpcy5jYWxsYmFjayA9IGRvbmU7XG5cbiAgLy8gZXhwbGljaXQgYXN5bmMgd2l0aCBgZG9uZWAgYXJndW1lbnRcbiAgaWYgKHRoaXMuYXN5bmMpIHtcbiAgICB0aGlzLnJlc2V0VGltZW91dCgpO1xuXG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZm4uY2FsbChjdHgsIGZ1bmN0aW9uKGVycil7XG4gICAgICAgIGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvciB8fCB0b1N0cmluZy5jYWxsKGVycikgPT09IFwiW29iamVjdCBFcnJvcl1cIikgcmV0dXJuIGRvbmUoZXJyKTtcbiAgICAgICAgaWYgKG51bGwgIT0gZXJyKSB7XG4gICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChlcnIpID09PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICAgICAgcmV0dXJuIGRvbmUobmV3IEVycm9yKCdkb25lKCkgaW52b2tlZCB3aXRoIG5vbi1FcnJvcjogJyArIEpTT04uc3RyaW5naWZ5KGVycikpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGRvbmUobmV3IEVycm9yKCdkb25lKCkgaW52b2tlZCB3aXRoIG5vbi1FcnJvcjogJyArIGVycikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBkb25lKCk7XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGRvbmUoZXJyKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuYXN5bmNPbmx5KSB7XG4gICAgcmV0dXJuIGRvbmUobmV3IEVycm9yKCctLWFzeW5jLW9ubHkgb3B0aW9uIGluIHVzZSB3aXRob3V0IGRlY2xhcmluZyBgZG9uZSgpYCcpKTtcbiAgfVxuXG4gIC8vIHN5bmMgb3IgcHJvbWlzZS1yZXR1cm5pbmdcbiAgdHJ5IHtcbiAgICBpZiAodGhpcy5wZW5kaW5nKSB7XG4gICAgICBkb25lKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNhbGxGbih0aGlzLmZuKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGRvbmUoZXJyKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNhbGxGbihmbikge1xuICAgIHZhciByZXN1bHQgPSBmbi5jYWxsKGN0eCk7XG4gICAgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0LnRoZW4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHNlbGYucmVzZXRUaW1lb3V0KCk7XG4gICAgICByZXN1bHRcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgZG9uZSgpXG4gICAgICAgIH0sXG4gICAgICAgIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgIGRvbmUocmVhc29uIHx8IG5ldyBFcnJvcignUHJvbWlzZSByZWplY3RlZCB3aXRoIG5vIG9yIGZhbHN5IHJlYXNvbicpKVxuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgZG9uZSgpO1xuICAgIH1cbiAgfVxufTtcblxufSk7IC8vIG1vZHVsZTogcnVubmFibGUuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInJ1bm5lci5qc1wiLCBmdW5jdGlvbihtb2R1bGUsIGV4cG9ydHMsIHJlcXVpcmUpe1xuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdicm93c2VyL2V2ZW50cycpLkV2ZW50RW1pdHRlclxuICAsIGRlYnVnID0gcmVxdWlyZSgnYnJvd3Nlci9kZWJ1ZycpKCdtb2NoYTpydW5uZXInKVxuICAsIFRlc3QgPSByZXF1aXJlKCcuL3Rlc3QnKVxuICAsIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpXG4gICwgZmlsdGVyID0gdXRpbHMuZmlsdGVyXG4gICwga2V5cyA9IHV0aWxzLmtleXM7XG5cbi8qKlxuICogTm9uLWVudW1lcmFibGUgZ2xvYmFscy5cbiAqL1xuXG52YXIgZ2xvYmFscyA9IFtcbiAgJ3NldFRpbWVvdXQnLFxuICAnY2xlYXJUaW1lb3V0JyxcbiAgJ3NldEludGVydmFsJyxcbiAgJ2NsZWFySW50ZXJ2YWwnLFxuICAnWE1MSHR0cFJlcXVlc3QnLFxuICAnRGF0ZSdcbl07XG5cbi8qKlxuICogRXhwb3NlIGBSdW5uZXJgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gUnVubmVyO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBgUnVubmVyYCBmb3IgdGhlIGdpdmVuIGBzdWl0ZWAuXG4gKlxuICogRXZlbnRzOlxuICpcbiAqICAgLSBgc3RhcnRgICBleGVjdXRpb24gc3RhcnRlZFxuICogICAtIGBlbmRgICBleGVjdXRpb24gY29tcGxldGVcbiAqICAgLSBgc3VpdGVgICAoc3VpdGUpIHRlc3Qgc3VpdGUgZXhlY3V0aW9uIHN0YXJ0ZWRcbiAqICAgLSBgc3VpdGUgZW5kYCAgKHN1aXRlKSBhbGwgdGVzdHMgKGFuZCBzdWItc3VpdGVzKSBoYXZlIGZpbmlzaGVkXG4gKiAgIC0gYHRlc3RgICAodGVzdCkgdGVzdCBleGVjdXRpb24gc3RhcnRlZFxuICogICAtIGB0ZXN0IGVuZGAgICh0ZXN0KSB0ZXN0IGNvbXBsZXRlZFxuICogICAtIGBob29rYCAgKGhvb2spIGhvb2sgZXhlY3V0aW9uIHN0YXJ0ZWRcbiAqICAgLSBgaG9vayBlbmRgICAoaG9vaykgaG9vayBjb21wbGV0ZVxuICogICAtIGBwYXNzYCAgKHRlc3QpIHRlc3QgcGFzc2VkXG4gKiAgIC0gYGZhaWxgICAodGVzdCwgZXJyKSB0ZXN0IGZhaWxlZFxuICogICAtIGBwZW5kaW5nYCAgKHRlc3QpIHRlc3QgcGVuZGluZ1xuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gUnVubmVyKHN1aXRlKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdGhpcy5fZ2xvYmFscyA9IFtdO1xuICB0aGlzLl9hYm9ydCA9IGZhbHNlO1xuICB0aGlzLnN1aXRlID0gc3VpdGU7XG4gIHRoaXMudG90YWwgPSBzdWl0ZS50b3RhbCgpO1xuICB0aGlzLmZhaWx1cmVzID0gMDtcbiAgdGhpcy5vbigndGVzdCBlbmQnLCBmdW5jdGlvbih0ZXN0KXsgc2VsZi5jaGVja0dsb2JhbHModGVzdCk7IH0pO1xuICB0aGlzLm9uKCdob29rIGVuZCcsIGZ1bmN0aW9uKGhvb2speyBzZWxmLmNoZWNrR2xvYmFscyhob29rKTsgfSk7XG4gIHRoaXMuZ3JlcCgvLiovKTtcbiAgdGhpcy5nbG9iYWxzKHRoaXMuZ2xvYmFsUHJvcHMoKS5jb25jYXQoZXh0cmFHbG9iYWxzKCkpKTtcbn1cblxuLyoqXG4gKiBXcmFwcGVyIGZvciBzZXRJbW1lZGlhdGUsIHByb2Nlc3MubmV4dFRpY2ssIG9yIGJyb3dzZXIgcG9seWZpbGwuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5pbW1lZGlhdGVseSA9IGdsb2JhbC5zZXRJbW1lZGlhdGUgfHwgcHJvY2Vzcy5uZXh0VGljaztcblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEV2ZW50RW1pdHRlci5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlO1xuUnVubmVyLnByb3RvdHlwZSA9IG5ldyBGO1xuUnVubmVyLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFJ1bm5lcjtcblxuXG4vKipcbiAqIFJ1biB0ZXN0cyB3aXRoIGZ1bGwgdGl0bGVzIG1hdGNoaW5nIGByZWAuIFVwZGF0ZXMgcnVubmVyLnRvdGFsXG4gKiB3aXRoIG51bWJlciBvZiB0ZXN0cyBtYXRjaGVkLlxuICpcbiAqIEBwYXJhbSB7UmVnRXhwfSByZVxuICogQHBhcmFtIHtCb29sZWFufSBpbnZlcnRcbiAqIEByZXR1cm4ge1J1bm5lcn0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJ1bm5lci5wcm90b3R5cGUuZ3JlcCA9IGZ1bmN0aW9uKHJlLCBpbnZlcnQpe1xuICBkZWJ1ZygnZ3JlcCAlcycsIHJlKTtcbiAgdGhpcy5fZ3JlcCA9IHJlO1xuICB0aGlzLl9pbnZlcnQgPSBpbnZlcnQ7XG4gIHRoaXMudG90YWwgPSB0aGlzLmdyZXBUb3RhbCh0aGlzLnN1aXRlKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIG51bWJlciBvZiB0ZXN0cyBtYXRjaGluZyB0aGUgZ3JlcCBzZWFyY2ggZm9yIHRoZVxuICogZ2l2ZW4gc3VpdGUuXG4gKlxuICogQHBhcmFtIHtTdWl0ZX0gc3VpdGVcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ncmVwVG90YWwgPSBmdW5jdGlvbihzdWl0ZSkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHZhciB0b3RhbCA9IDA7XG5cbiAgc3VpdGUuZWFjaFRlc3QoZnVuY3Rpb24odGVzdCl7XG4gICAgdmFyIG1hdGNoID0gc2VsZi5fZ3JlcC50ZXN0KHRlc3QuZnVsbFRpdGxlKCkpO1xuICAgIGlmIChzZWxmLl9pbnZlcnQpIG1hdGNoID0gIW1hdGNoO1xuICAgIGlmIChtYXRjaCkgdG90YWwrKztcbiAgfSk7XG5cbiAgcmV0dXJuIHRvdGFsO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYSBsaXN0IG9mIGdsb2JhbCBwcm9wZXJ0aWVzLlxuICpcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5nbG9iYWxQcm9wcyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcHJvcHMgPSB1dGlscy5rZXlzKGdsb2JhbCk7XG5cbiAgLy8gbm9uLWVudW1lcmFibGVzXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZ2xvYmFscy5sZW5ndGg7ICsraSkge1xuICAgIGlmICh+dXRpbHMuaW5kZXhPZihwcm9wcywgZ2xvYmFsc1tpXSkpIGNvbnRpbnVlO1xuICAgIHByb3BzLnB1c2goZ2xvYmFsc1tpXSk7XG4gIH1cblxuICByZXR1cm4gcHJvcHM7XG59O1xuXG4vKipcbiAqIEFsbG93IHRoZSBnaXZlbiBgYXJyYCBvZiBnbG9iYWxzLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGFyclxuICogQHJldHVybiB7UnVubmVyfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5nbG9iYWxzID0gZnVuY3Rpb24oYXJyKXtcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX2dsb2JhbHM7XG4gIGRlYnVnKCdnbG9iYWxzICVqJywgYXJyKTtcbiAgdGhpcy5fZ2xvYmFscyA9IHRoaXMuX2dsb2JhbHMuY29uY2F0KGFycik7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBDaGVjayBmb3IgZ2xvYmFsIHZhcmlhYmxlIGxlYWtzLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUuY2hlY2tHbG9iYWxzID0gZnVuY3Rpb24odGVzdCl7XG4gIGlmICh0aGlzLmlnbm9yZUxlYWtzKSByZXR1cm47XG4gIHZhciBvayA9IHRoaXMuX2dsb2JhbHM7XG5cbiAgdmFyIGdsb2JhbHMgPSB0aGlzLmdsb2JhbFByb3BzKCk7XG4gIHZhciBsZWFrcztcblxuICBpZiAodGVzdCkge1xuICAgIG9rID0gb2suY29uY2F0KHRlc3QuX2FsbG93ZWRHbG9iYWxzIHx8IFtdKTtcbiAgfVxuXG4gIGlmKHRoaXMucHJldkdsb2JhbHNMZW5ndGggPT0gZ2xvYmFscy5sZW5ndGgpIHJldHVybjtcbiAgdGhpcy5wcmV2R2xvYmFsc0xlbmd0aCA9IGdsb2JhbHMubGVuZ3RoO1xuXG4gIGxlYWtzID0gZmlsdGVyTGVha3Mob2ssIGdsb2JhbHMpO1xuICB0aGlzLl9nbG9iYWxzID0gdGhpcy5fZ2xvYmFscy5jb25jYXQobGVha3MpO1xuXG4gIGlmIChsZWFrcy5sZW5ndGggPiAxKSB7XG4gICAgdGhpcy5mYWlsKHRlc3QsIG5ldyBFcnJvcignZ2xvYmFsIGxlYWtzIGRldGVjdGVkOiAnICsgbGVha3Muam9pbignLCAnKSArICcnKSk7XG4gIH0gZWxzZSBpZiAobGVha3MubGVuZ3RoKSB7XG4gICAgdGhpcy5mYWlsKHRlc3QsIG5ldyBFcnJvcignZ2xvYmFsIGxlYWsgZGV0ZWN0ZWQ6ICcgKyBsZWFrc1swXSkpO1xuICB9XG59O1xuXG4vKipcbiAqIEZhaWwgdGhlIGdpdmVuIGB0ZXN0YC5cbiAqXG4gKiBAcGFyYW0ge1Rlc3R9IHRlc3RcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5mYWlsID0gZnVuY3Rpb24odGVzdCwgZXJyKXtcbiAgKyt0aGlzLmZhaWx1cmVzO1xuICB0ZXN0LnN0YXRlID0gJ2ZhaWxlZCc7XG5cbiAgaWYgKCdzdHJpbmcnID09IHR5cGVvZiBlcnIpIHtcbiAgICBlcnIgPSBuZXcgRXJyb3IoJ3RoZSBzdHJpbmcgXCInICsgZXJyICsgJ1wiIHdhcyB0aHJvd24sIHRocm93IGFuIEVycm9yIDopJyk7XG4gIH1cblxuICB0aGlzLmVtaXQoJ2ZhaWwnLCB0ZXN0LCBlcnIpO1xufTtcblxuLyoqXG4gKiBGYWlsIHRoZSBnaXZlbiBgaG9va2Agd2l0aCBgZXJyYC5cbiAqXG4gKiBIb29rIGZhaWx1cmVzIHdvcmsgaW4gdGhlIGZvbGxvd2luZyBwYXR0ZXJuOlxuICogLSBJZiBiYWlsLCB0aGVuIGV4aXRcbiAqIC0gRmFpbGVkIGBiZWZvcmVgIGhvb2sgc2tpcHMgYWxsIHRlc3RzIGluIGEgc3VpdGUgYW5kIHN1YnN1aXRlcyxcbiAqICAgYnV0IGp1bXBzIHRvIGNvcnJlc3BvbmRpbmcgYGFmdGVyYCBob29rXG4gKiAtIEZhaWxlZCBgYmVmb3JlIGVhY2hgIGhvb2sgc2tpcHMgcmVtYWluaW5nIHRlc3RzIGluIGFcbiAqICAgc3VpdGUgYW5kIGp1bXBzIHRvIGNvcnJlc3BvbmRpbmcgYGFmdGVyIGVhY2hgIGhvb2ssXG4gKiAgIHdoaWNoIGlzIHJ1biBvbmx5IG9uY2VcbiAqIC0gRmFpbGVkIGBhZnRlcmAgaG9vayBkb2VzIG5vdCBhbHRlclxuICogICBleGVjdXRpb24gb3JkZXJcbiAqIC0gRmFpbGVkIGBhZnRlciBlYWNoYCBob29rIHNraXBzIHJlbWFpbmluZyB0ZXN0cyBpbiBhXG4gKiAgIHN1aXRlIGFuZCBzdWJzdWl0ZXMsIGJ1dCBleGVjdXRlcyBvdGhlciBgYWZ0ZXIgZWFjaGBcbiAqICAgaG9va3NcbiAqXG4gKiBAcGFyYW0ge0hvb2t9IGhvb2tcbiAqIEBwYXJhbSB7RXJyb3J9IGVyclxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5mYWlsSG9vayA9IGZ1bmN0aW9uKGhvb2ssIGVycil7XG4gIHRoaXMuZmFpbChob29rLCBlcnIpO1xuICBpZiAodGhpcy5zdWl0ZS5iYWlsKCkpIHtcbiAgICB0aGlzLmVtaXQoJ2VuZCcpO1xuICB9XG59O1xuXG4vKipcbiAqIFJ1biBob29rIGBuYW1lYCBjYWxsYmFja3MgYW5kIHRoZW4gaW52b2tlIGBmbigpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuY3Rpb25cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUuaG9vayA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgdmFyIHN1aXRlID0gdGhpcy5zdWl0ZVxuICAgICwgaG9va3MgPSBzdWl0ZVsnXycgKyBuYW1lXVxuICAgICwgc2VsZiA9IHRoaXNcbiAgICAsIHRpbWVyO1xuXG4gIGZ1bmN0aW9uIG5leHQoaSkge1xuICAgIHZhciBob29rID0gaG9va3NbaV07XG4gICAgaWYgKCFob29rKSByZXR1cm4gZm4oKTtcbiAgICBpZiAoc2VsZi5mYWlsdXJlcyAmJiBzdWl0ZS5iYWlsKCkpIHJldHVybiBmbigpO1xuICAgIHNlbGYuY3VycmVudFJ1bm5hYmxlID0gaG9vaztcblxuICAgIGhvb2suY3R4LmN1cnJlbnRUZXN0ID0gc2VsZi50ZXN0O1xuXG4gICAgc2VsZi5lbWl0KCdob29rJywgaG9vayk7XG5cbiAgICBob29rLm9uKCdlcnJvcicsIGZ1bmN0aW9uKGVycil7XG4gICAgICBzZWxmLmZhaWxIb29rKGhvb2ssIGVycik7XG4gICAgfSk7XG5cbiAgICBob29rLnJ1bihmdW5jdGlvbihlcnIpe1xuICAgICAgaG9vay5yZW1vdmVBbGxMaXN0ZW5lcnMoJ2Vycm9yJyk7XG4gICAgICB2YXIgdGVzdEVycm9yID0gaG9vay5lcnJvcigpO1xuICAgICAgaWYgKHRlc3RFcnJvcikgc2VsZi5mYWlsKHNlbGYudGVzdCwgdGVzdEVycm9yKTtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgc2VsZi5mYWlsSG9vayhob29rLCBlcnIpO1xuXG4gICAgICAgIC8vIHN0b3AgZXhlY3V0aW5nIGhvb2tzLCBub3RpZnkgY2FsbGVlIG9mIGhvb2sgZXJyXG4gICAgICAgIHJldHVybiBmbihlcnIpO1xuICAgICAgfVxuICAgICAgc2VsZi5lbWl0KCdob29rIGVuZCcsIGhvb2spO1xuICAgICAgZGVsZXRlIGhvb2suY3R4LmN1cnJlbnRUZXN0O1xuICAgICAgbmV4dCgrK2kpO1xuICAgIH0pO1xuICB9XG5cbiAgUnVubmVyLmltbWVkaWF0ZWx5KGZ1bmN0aW9uKCl7XG4gICAgbmV4dCgwKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIFJ1biBob29rIGBuYW1lYCBmb3IgdGhlIGdpdmVuIGFycmF5IG9mIGBzdWl0ZXNgXG4gKiBpbiBvcmRlciwgYW5kIGNhbGxiYWNrIGBmbihlcnIsIGVyclN1aXRlKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEBwYXJhbSB7QXJyYXl9IHN1aXRlc1xuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUuaG9va3MgPSBmdW5jdGlvbihuYW1lLCBzdWl0ZXMsIGZuKXtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gICAgLCBvcmlnID0gdGhpcy5zdWl0ZTtcblxuICBmdW5jdGlvbiBuZXh0KHN1aXRlKSB7XG4gICAgc2VsZi5zdWl0ZSA9IHN1aXRlO1xuXG4gICAgaWYgKCFzdWl0ZSkge1xuICAgICAgc2VsZi5zdWl0ZSA9IG9yaWc7XG4gICAgICByZXR1cm4gZm4oKTtcbiAgICB9XG5cbiAgICBzZWxmLmhvb2sobmFtZSwgZnVuY3Rpb24oZXJyKXtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgdmFyIGVyclN1aXRlID0gc2VsZi5zdWl0ZTtcbiAgICAgICAgc2VsZi5zdWl0ZSA9IG9yaWc7XG4gICAgICAgIHJldHVybiBmbihlcnIsIGVyclN1aXRlKTtcbiAgICAgIH1cblxuICAgICAgbmV4dChzdWl0ZXMucG9wKCkpO1xuICAgIH0pO1xuICB9XG5cbiAgbmV4dChzdWl0ZXMucG9wKCkpO1xufTtcblxuLyoqXG4gKiBSdW4gaG9va3MgZnJvbSB0aGUgdG9wIGxldmVsIGRvd24uXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLmhvb2tVcCA9IGZ1bmN0aW9uKG5hbWUsIGZuKXtcbiAgdmFyIHN1aXRlcyA9IFt0aGlzLnN1aXRlXS5jb25jYXQodGhpcy5wYXJlbnRzKCkpLnJldmVyc2UoKTtcbiAgdGhpcy5ob29rcyhuYW1lLCBzdWl0ZXMsIGZuKTtcbn07XG5cbi8qKlxuICogUnVuIGhvb2tzIGZyb20gdGhlIGJvdHRvbSB1cC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUuaG9va0Rvd24gPSBmdW5jdGlvbihuYW1lLCBmbil7XG4gIHZhciBzdWl0ZXMgPSBbdGhpcy5zdWl0ZV0uY29uY2F0KHRoaXMucGFyZW50cygpKTtcbiAgdGhpcy5ob29rcyhuYW1lLCBzdWl0ZXMsIGZuKTtcbn07XG5cbi8qKlxuICogUmV0dXJuIGFuIGFycmF5IG9mIHBhcmVudCBTdWl0ZXMgZnJvbVxuICogY2xvc2VzdCB0byBmdXJ0aGVzdC5cbiAqXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUucGFyZW50cyA9IGZ1bmN0aW9uKCl7XG4gIHZhciBzdWl0ZSA9IHRoaXMuc3VpdGVcbiAgICAsIHN1aXRlcyA9IFtdO1xuICB3aGlsZSAoc3VpdGUgPSBzdWl0ZS5wYXJlbnQpIHN1aXRlcy5wdXNoKHN1aXRlKTtcbiAgcmV0dXJuIHN1aXRlcztcbn07XG5cbi8qKlxuICogUnVuIHRoZSBjdXJyZW50IHRlc3QgYW5kIGNhbGxiYWNrIGBmbihlcnIpYC5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ydW5UZXN0ID0gZnVuY3Rpb24oZm4pe1xuICB2YXIgdGVzdCA9IHRoaXMudGVzdFxuICAgICwgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKHRoaXMuYXN5bmNPbmx5KSB0ZXN0LmFzeW5jT25seSA9IHRydWU7XG5cbiAgdHJ5IHtcbiAgICB0ZXN0Lm9uKCdlcnJvcicsIGZ1bmN0aW9uKGVycil7XG4gICAgICBzZWxmLmZhaWwodGVzdCwgZXJyKTtcbiAgICB9KTtcbiAgICB0ZXN0LnJ1bihmbik7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGZuKGVycik7XG4gIH1cbn07XG5cbi8qKlxuICogUnVuIHRlc3RzIGluIHRoZSBnaXZlbiBgc3VpdGVgIGFuZCBpbnZva2VcbiAqIHRoZSBjYWxsYmFjayBgZm4oKWAgd2hlbiBjb21wbGV0ZS5cbiAqXG4gKiBAcGFyYW0ge1N1aXRlfSBzdWl0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUucnVuVGVzdHMgPSBmdW5jdGlvbihzdWl0ZSwgZm4pe1xuICB2YXIgc2VsZiA9IHRoaXNcbiAgICAsIHRlc3RzID0gc3VpdGUudGVzdHMuc2xpY2UoKVxuICAgICwgdGVzdDtcblxuXG4gIGZ1bmN0aW9uIGhvb2tFcnIoZXJyLCBlcnJTdWl0ZSwgYWZ0ZXIpIHtcbiAgICAvLyBiZWZvcmUvYWZ0ZXIgRWFjaCBob29rIGZvciBlcnJTdWl0ZSBmYWlsZWQ6XG4gICAgdmFyIG9yaWcgPSBzZWxmLnN1aXRlO1xuXG4gICAgLy8gZm9yIGZhaWxlZCAnYWZ0ZXIgZWFjaCcgaG9vayBzdGFydCBmcm9tIGVyclN1aXRlIHBhcmVudCxcbiAgICAvLyBvdGhlcndpc2Ugc3RhcnQgZnJvbSBlcnJTdWl0ZSBpdHNlbGZcbiAgICBzZWxmLnN1aXRlID0gYWZ0ZXIgPyBlcnJTdWl0ZS5wYXJlbnQgOiBlcnJTdWl0ZTtcblxuICAgIGlmIChzZWxmLnN1aXRlKSB7XG4gICAgICAvLyBjYWxsIGhvb2tVcCBhZnRlckVhY2hcbiAgICAgIHNlbGYuaG9va1VwKCdhZnRlckVhY2gnLCBmdW5jdGlvbihlcnIyLCBlcnJTdWl0ZTIpIHtcbiAgICAgICAgc2VsZi5zdWl0ZSA9IG9yaWc7XG4gICAgICAgIC8vIHNvbWUgaG9va3MgbWF5IGZhaWwgZXZlbiBub3dcbiAgICAgICAgaWYgKGVycjIpIHJldHVybiBob29rRXJyKGVycjIsIGVyclN1aXRlMiwgdHJ1ZSk7XG4gICAgICAgIC8vIHJlcG9ydCBlcnJvciBzdWl0ZVxuICAgICAgICBmbihlcnJTdWl0ZSk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gdGhlcmUgaXMgbm8gbmVlZCBjYWxsaW5nIG90aGVyICdhZnRlciBlYWNoJyBob29rc1xuICAgICAgc2VsZi5zdWl0ZSA9IG9yaWc7XG4gICAgICBmbihlcnJTdWl0ZSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbmV4dChlcnIsIGVyclN1aXRlKSB7XG4gICAgLy8gaWYgd2UgYmFpbCBhZnRlciBmaXJzdCBlcnJcbiAgICBpZiAoc2VsZi5mYWlsdXJlcyAmJiBzdWl0ZS5fYmFpbCkgcmV0dXJuIGZuKCk7XG5cbiAgICBpZiAoc2VsZi5fYWJvcnQpIHJldHVybiBmbigpO1xuXG4gICAgaWYgKGVycikgcmV0dXJuIGhvb2tFcnIoZXJyLCBlcnJTdWl0ZSwgdHJ1ZSk7XG5cbiAgICAvLyBuZXh0IHRlc3RcbiAgICB0ZXN0ID0gdGVzdHMuc2hpZnQoKTtcblxuICAgIC8vIGFsbCBkb25lXG4gICAgaWYgKCF0ZXN0KSByZXR1cm4gZm4oKTtcblxuICAgIC8vIGdyZXBcbiAgICB2YXIgbWF0Y2ggPSBzZWxmLl9ncmVwLnRlc3QodGVzdC5mdWxsVGl0bGUoKSk7XG4gICAgaWYgKHNlbGYuX2ludmVydCkgbWF0Y2ggPSAhbWF0Y2g7XG4gICAgaWYgKCFtYXRjaCkgcmV0dXJuIG5leHQoKTtcblxuICAgIC8vIHBlbmRpbmdcbiAgICBpZiAodGVzdC5wZW5kaW5nKSB7XG4gICAgICBzZWxmLmVtaXQoJ3BlbmRpbmcnLCB0ZXN0KTtcbiAgICAgIHNlbGYuZW1pdCgndGVzdCBlbmQnLCB0ZXN0KTtcbiAgICAgIHJldHVybiBuZXh0KCk7XG4gICAgfVxuXG4gICAgLy8gZXhlY3V0ZSB0ZXN0IGFuZCBob29rKHMpXG4gICAgc2VsZi5lbWl0KCd0ZXN0Jywgc2VsZi50ZXN0ID0gdGVzdCk7XG4gICAgc2VsZi5ob29rRG93bignYmVmb3JlRWFjaCcsIGZ1bmN0aW9uKGVyciwgZXJyU3VpdGUpe1xuXG4gICAgICBpZiAoZXJyKSByZXR1cm4gaG9va0VycihlcnIsIGVyclN1aXRlLCBmYWxzZSk7XG5cbiAgICAgIHNlbGYuY3VycmVudFJ1bm5hYmxlID0gc2VsZi50ZXN0O1xuICAgICAgc2VsZi5ydW5UZXN0KGZ1bmN0aW9uKGVycil7XG4gICAgICAgIHRlc3QgPSBzZWxmLnRlc3Q7XG5cbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHNlbGYuZmFpbCh0ZXN0LCBlcnIpO1xuICAgICAgICAgIHNlbGYuZW1pdCgndGVzdCBlbmQnLCB0ZXN0KTtcbiAgICAgICAgICByZXR1cm4gc2VsZi5ob29rVXAoJ2FmdGVyRWFjaCcsIG5leHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGVzdC5zdGF0ZSA9ICdwYXNzZWQnO1xuICAgICAgICBzZWxmLmVtaXQoJ3Bhc3MnLCB0ZXN0KTtcbiAgICAgICAgc2VsZi5lbWl0KCd0ZXN0IGVuZCcsIHRlc3QpO1xuICAgICAgICBzZWxmLmhvb2tVcCgnYWZ0ZXJFYWNoJywgbmV4dCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHRoaXMubmV4dCA9IG5leHQ7XG4gIG5leHQoKTtcbn07XG5cbi8qKlxuICogUnVuIHRoZSBnaXZlbiBgc3VpdGVgIGFuZCBpbnZva2UgdGhlXG4gKiBjYWxsYmFjayBgZm4oKWAgd2hlbiBjb21wbGV0ZS5cbiAqXG4gKiBAcGFyYW0ge1N1aXRlfSBzdWl0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJ1bm5lci5wcm90b3R5cGUucnVuU3VpdGUgPSBmdW5jdGlvbihzdWl0ZSwgZm4pe1xuICB2YXIgdG90YWwgPSB0aGlzLmdyZXBUb3RhbChzdWl0ZSlcbiAgICAsIHNlbGYgPSB0aGlzXG4gICAgLCBpID0gMDtcblxuICBkZWJ1ZygncnVuIHN1aXRlICVzJywgc3VpdGUuZnVsbFRpdGxlKCkpO1xuXG4gIGlmICghdG90YWwpIHJldHVybiBmbigpO1xuXG4gIHRoaXMuZW1pdCgnc3VpdGUnLCB0aGlzLnN1aXRlID0gc3VpdGUpO1xuXG4gIGZ1bmN0aW9uIG5leHQoZXJyU3VpdGUpIHtcbiAgICBpZiAoZXJyU3VpdGUpIHtcbiAgICAgIC8vIGN1cnJlbnQgc3VpdGUgZmFpbGVkIG9uIGEgaG9vayBmcm9tIGVyclN1aXRlXG4gICAgICBpZiAoZXJyU3VpdGUgPT0gc3VpdGUpIHtcbiAgICAgICAgLy8gaWYgZXJyU3VpdGUgaXMgY3VycmVudCBzdWl0ZVxuICAgICAgICAvLyBjb250aW51ZSB0byB0aGUgbmV4dCBzaWJsaW5nIHN1aXRlXG4gICAgICAgIHJldHVybiBkb25lKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBlcnJTdWl0ZSBpcyBhbW9uZyB0aGUgcGFyZW50cyBvZiBjdXJyZW50IHN1aXRlXG4gICAgICAgIC8vIHN0b3AgZXhlY3V0aW9uIG9mIGVyclN1aXRlIGFuZCBhbGwgc3ViLXN1aXRlc1xuICAgICAgICByZXR1cm4gZG9uZShlcnJTdWl0ZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNlbGYuX2Fib3J0KSByZXR1cm4gZG9uZSgpO1xuXG4gICAgdmFyIGN1cnIgPSBzdWl0ZS5zdWl0ZXNbaSsrXTtcbiAgICBpZiAoIWN1cnIpIHJldHVybiBkb25lKCk7XG4gICAgc2VsZi5ydW5TdWl0ZShjdXJyLCBuZXh0KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRvbmUoZXJyU3VpdGUpIHtcbiAgICBzZWxmLnN1aXRlID0gc3VpdGU7XG4gICAgc2VsZi5ob29rKCdhZnRlckFsbCcsIGZ1bmN0aW9uKCl7XG4gICAgICBzZWxmLmVtaXQoJ3N1aXRlIGVuZCcsIHN1aXRlKTtcbiAgICAgIGZuKGVyclN1aXRlKTtcbiAgICB9KTtcbiAgfVxuXG4gIHRoaXMuaG9vaygnYmVmb3JlQWxsJywgZnVuY3Rpb24oZXJyKXtcbiAgICBpZiAoZXJyKSByZXR1cm4gZG9uZSgpO1xuICAgIHNlbGYucnVuVGVzdHMoc3VpdGUsIG5leHQpO1xuICB9KTtcbn07XG5cbi8qKlxuICogSGFuZGxlIHVuY2F1Z2h0IGV4Y2VwdGlvbnMuXG4gKlxuICogQHBhcmFtIHtFcnJvcn0gZXJyXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SdW5uZXIucHJvdG90eXBlLnVuY2F1Z2h0ID0gZnVuY3Rpb24oZXJyKXtcbiAgaWYgKGVycikge1xuICAgIGRlYnVnKCd1bmNhdWdodCBleGNlcHRpb24gJXMnLCBlcnIubWVzc2FnZSk7XG4gIH0gZWxzZSB7XG4gICAgZGVidWcoJ3VuY2F1Z2h0IHVuZGVmaW5lZCBleGNlcHRpb24nKTtcbiAgICBlcnIgPSBuZXcgRXJyb3IoJ0NhdGNoZWQgdW5kZWZpbmVkIGVycm9yLCBkaWQgeW91IHRocm93IHdpdGhvdXQgc3BlY2lmeWluZyB3aGF0PycpO1xuICB9XG4gIFxuICB2YXIgcnVubmFibGUgPSB0aGlzLmN1cnJlbnRSdW5uYWJsZTtcbiAgaWYgKCFydW5uYWJsZSB8fCAnZmFpbGVkJyA9PSBydW5uYWJsZS5zdGF0ZSkgcmV0dXJuO1xuICBydW5uYWJsZS5jbGVhclRpbWVvdXQoKTtcbiAgZXJyLnVuY2F1Z2h0ID0gdHJ1ZTtcbiAgdGhpcy5mYWlsKHJ1bm5hYmxlLCBlcnIpO1xuXG4gIC8vIHJlY292ZXIgZnJvbSB0ZXN0XG4gIGlmICgndGVzdCcgPT0gcnVubmFibGUudHlwZSkge1xuICAgIHRoaXMuZW1pdCgndGVzdCBlbmQnLCBydW5uYWJsZSk7XG4gICAgdGhpcy5ob29rVXAoJ2FmdGVyRWFjaCcsIHRoaXMubmV4dCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gYmFpbCBvbiBob29rc1xuICB0aGlzLmVtaXQoJ2VuZCcpO1xufTtcblxuLyoqXG4gKiBSdW4gdGhlIHJvb3Qgc3VpdGUgYW5kIGludm9rZSBgZm4oZmFpbHVyZXMpYFxuICogb24gY29tcGxldGlvbi5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7UnVubmVyfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUnVubmVyLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbihmbil7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgZm4gPSBmbiB8fCBmdW5jdGlvbigpe307XG5cbiAgZnVuY3Rpb24gdW5jYXVnaHQoZXJyKXtcbiAgICBzZWxmLnVuY2F1Z2h0KGVycik7XG4gIH1cblxuICBkZWJ1Zygnc3RhcnQnKTtcblxuICAvLyBjYWxsYmFja1xuICB0aGlzLm9uKCdlbmQnLCBmdW5jdGlvbigpe1xuICAgIGRlYnVnKCdlbmQnKTtcbiAgICBwcm9jZXNzLnJlbW92ZUxpc3RlbmVyKCd1bmNhdWdodEV4Y2VwdGlvbicsIHVuY2F1Z2h0KTtcbiAgICBmbihzZWxmLmZhaWx1cmVzKTtcbiAgfSk7XG5cbiAgLy8gcnVuIHN1aXRlc1xuICB0aGlzLmVtaXQoJ3N0YXJ0Jyk7XG4gIHRoaXMucnVuU3VpdGUodGhpcy5zdWl0ZSwgZnVuY3Rpb24oKXtcbiAgICBkZWJ1ZygnZmluaXNoZWQgcnVubmluZycpO1xuICAgIHNlbGYuZW1pdCgnZW5kJyk7XG4gIH0pO1xuXG4gIC8vIHVuY2F1Z2h0IGV4Y2VwdGlvblxuICBwcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIHVuY2F1Z2h0KTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQ2xlYW5seSBhYm9ydCBleGVjdXRpb25cbiAqXG4gKiBAcmV0dXJuIHtSdW5uZXJ9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuUnVubmVyLnByb3RvdHlwZS5hYm9ydCA9IGZ1bmN0aW9uKCl7XG4gIGRlYnVnKCdhYm9ydGluZycpO1xuICB0aGlzLl9hYm9ydCA9IHRydWU7XG59XG5cbi8qKlxuICogRmlsdGVyIGxlYWtzIHdpdGggdGhlIGdpdmVuIGdsb2JhbHMgZmxhZ2dlZCBhcyBgb2tgLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IG9rXG4gKiBAcGFyYW0ge0FycmF5fSBnbG9iYWxzXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGZpbHRlckxlYWtzKG9rLCBnbG9iYWxzKSB7XG4gIHJldHVybiBmaWx0ZXIoZ2xvYmFscywgZnVuY3Rpb24oa2V5KXtcbiAgICAvLyBGaXJlZm94IGFuZCBDaHJvbWUgZXhwb3NlcyBpZnJhbWVzIGFzIGluZGV4IGluc2lkZSB0aGUgd2luZG93IG9iamVjdFxuICAgIGlmICgvXmQrLy50ZXN0KGtleSkpIHJldHVybiBmYWxzZTtcblxuICAgIC8vIGluIGZpcmVmb3hcbiAgICAvLyBpZiBydW5uZXIgcnVucyBpbiBhbiBpZnJhbWUsIHRoaXMgaWZyYW1lJ3Mgd2luZG93LmdldEludGVyZmFjZSBtZXRob2Qgbm90IGluaXQgYXQgZmlyc3RcbiAgICAvLyBpdCBpcyBhc3NpZ25lZCBpbiBzb21lIHNlY29uZHNcbiAgICBpZiAoZ2xvYmFsLm5hdmlnYXRvciAmJiAvXmdldEludGVyZmFjZS8udGVzdChrZXkpKSByZXR1cm4gZmFsc2U7XG5cbiAgICAvLyBhbiBpZnJhbWUgY291bGQgYmUgYXBwcm9hY2hlZCBieSB3aW5kb3dbaWZyYW1lSW5kZXhdXG4gICAgLy8gaW4gaWU2LDcsOCBhbmQgb3BlcmEsIGlmcmFtZUluZGV4IGlzIGVudW1lcmFibGUsIHRoaXMgY291bGQgY2F1c2UgbGVha1xuICAgIGlmIChnbG9iYWwubmF2aWdhdG9yICYmIC9eXFxkKy8udGVzdChrZXkpKSByZXR1cm4gZmFsc2U7XG5cbiAgICAvLyBPcGVyYSBhbmQgSUUgZXhwb3NlIGdsb2JhbCB2YXJpYWJsZXMgZm9yIEhUTUwgZWxlbWVudCBJRHMgKGlzc3VlICMyNDMpXG4gICAgaWYgKC9ebW9jaGEtLy50ZXN0KGtleSkpIHJldHVybiBmYWxzZTtcblxuICAgIHZhciBtYXRjaGVkID0gZmlsdGVyKG9rLCBmdW5jdGlvbihvayl7XG4gICAgICBpZiAofm9rLmluZGV4T2YoJyonKSkgcmV0dXJuIDAgPT0ga2V5LmluZGV4T2Yob2suc3BsaXQoJyonKVswXSk7XG4gICAgICByZXR1cm4ga2V5ID09IG9rO1xuICAgIH0pO1xuICAgIHJldHVybiBtYXRjaGVkLmxlbmd0aCA9PSAwICYmICghZ2xvYmFsLm5hdmlnYXRvciB8fCAnb25lcnJvcicgIT09IGtleSk7XG4gIH0pO1xufVxuXG4vKipcbiAqIEFycmF5IG9mIGdsb2JhbHMgZGVwZW5kZW50IG9uIHRoZSBlbnZpcm9ubWVudC5cbiAqXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbiBmdW5jdGlvbiBleHRyYUdsb2JhbHMoKSB7XG4gIGlmICh0eXBlb2YocHJvY2VzcykgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2YocHJvY2Vzcy52ZXJzaW9uKSA9PT0gJ3N0cmluZycpIHtcblxuICAgIHZhciBub2RlVmVyc2lvbiA9IHByb2Nlc3MudmVyc2lvbi5zcGxpdCgnLicpLnJlZHVjZShmdW5jdGlvbihhLCB2KSB7XG4gICAgICByZXR1cm4gYSA8PCA4IHwgdjtcbiAgICB9KTtcblxuICAgIC8vICdlcnJubycgd2FzIHJlbmFtZWQgdG8gcHJvY2Vzcy5fZXJybm8gaW4gdjAuOS4xMS5cblxuICAgIGlmIChub2RlVmVyc2lvbiA8IDB4MDAwOTBCKSB7XG4gICAgICByZXR1cm4gWydlcnJubyddO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBbXTtcbiB9XG5cbn0pOyAvLyBtb2R1bGU6IHJ1bm5lci5qc1xuXG5yZXF1aXJlLnJlZ2lzdGVyKFwic3VpdGUuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdicm93c2VyL2V2ZW50cycpLkV2ZW50RW1pdHRlclxuICAsIGRlYnVnID0gcmVxdWlyZSgnYnJvd3Nlci9kZWJ1ZycpKCdtb2NoYTpzdWl0ZScpXG4gICwgbWlsbGlzZWNvbmRzID0gcmVxdWlyZSgnLi9tcycpXG4gICwgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJylcbiAgLCBIb29rID0gcmVxdWlyZSgnLi9ob29rJyk7XG5cbi8qKlxuICogRXhwb3NlIGBTdWl0ZWAuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gU3VpdGU7XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IGBTdWl0ZWAgd2l0aCB0aGUgZ2l2ZW4gYHRpdGxlYFxuICogYW5kIHBhcmVudCBgU3VpdGVgLiBXaGVuIGEgc3VpdGUgd2l0aCB0aGVcbiAqIHNhbWUgdGl0bGUgaXMgYWxyZWFkeSBwcmVzZW50LCB0aGF0IHN1aXRlXG4gKiBpcyByZXR1cm5lZCB0byBwcm92aWRlIG5pY2VyIHJlcG9ydGVyXG4gKiBhbmQgbW9yZSBmbGV4aWJsZSBtZXRhLXRlc3RpbmcuXG4gKlxuICogQHBhcmFtIHtTdWl0ZX0gcGFyZW50XG4gKiBAcGFyYW0ge1N0cmluZ30gdGl0bGVcbiAqIEByZXR1cm4ge1N1aXRlfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5leHBvcnRzLmNyZWF0ZSA9IGZ1bmN0aW9uKHBhcmVudCwgdGl0bGUpe1xuICB2YXIgc3VpdGUgPSBuZXcgU3VpdGUodGl0bGUsIHBhcmVudC5jdHgpO1xuICBzdWl0ZS5wYXJlbnQgPSBwYXJlbnQ7XG4gIGlmIChwYXJlbnQucGVuZGluZykgc3VpdGUucGVuZGluZyA9IHRydWU7XG4gIHRpdGxlID0gc3VpdGUuZnVsbFRpdGxlKCk7XG4gIHBhcmVudC5hZGRTdWl0ZShzdWl0ZSk7XG4gIHJldHVybiBzdWl0ZTtcbn07XG5cbi8qKlxuICogSW5pdGlhbGl6ZSBhIG5ldyBgU3VpdGVgIHdpdGggdGhlIGdpdmVuXG4gKiBgdGl0bGVgIGFuZCBgY3R4YC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdGl0bGVcbiAqIEBwYXJhbSB7Q29udGV4dH0gY3R4XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBTdWl0ZSh0aXRsZSwgcGFyZW50Q29udGV4dCkge1xuICB0aGlzLnRpdGxlID0gdGl0bGU7XG4gIHZhciBjb250ZXh0ID0gZnVuY3Rpb24oKSB7fTtcbiAgY29udGV4dC5wcm90b3R5cGUgPSBwYXJlbnRDb250ZXh0O1xuICB0aGlzLmN0eCA9IG5ldyBjb250ZXh0KCk7XG4gIHRoaXMuc3VpdGVzID0gW107XG4gIHRoaXMudGVzdHMgPSBbXTtcbiAgdGhpcy5wZW5kaW5nID0gZmFsc2U7XG4gIHRoaXMuX2JlZm9yZUVhY2ggPSBbXTtcbiAgdGhpcy5fYmVmb3JlQWxsID0gW107XG4gIHRoaXMuX2FmdGVyRWFjaCA9IFtdO1xuICB0aGlzLl9hZnRlckFsbCA9IFtdO1xuICB0aGlzLnJvb3QgPSAhdGl0bGU7XG4gIHRoaXMuX3RpbWVvdXQgPSAyMDAwO1xuICB0aGlzLl9lbmFibGVUaW1lb3V0cyA9IHRydWU7XG4gIHRoaXMuX3Nsb3cgPSA3NTtcbiAgdGhpcy5fYmFpbCA9IGZhbHNlO1xufVxuXG4vKipcbiAqIEluaGVyaXQgZnJvbSBgRXZlbnRFbWl0dGVyLnByb3RvdHlwZWAuXG4gKi9cblxuZnVuY3Rpb24gRigpe307XG5GLnByb3RvdHlwZSA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGU7XG5TdWl0ZS5wcm90b3R5cGUgPSBuZXcgRjtcblN1aXRlLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFN1aXRlO1xuXG5cbi8qKlxuICogUmV0dXJuIGEgY2xvbmUgb2YgdGhpcyBgU3VpdGVgLlxuICpcbiAqIEByZXR1cm4ge1N1aXRlfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU3VpdGUucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24oKXtcbiAgdmFyIHN1aXRlID0gbmV3IFN1aXRlKHRoaXMudGl0bGUpO1xuICBkZWJ1ZygnY2xvbmUnKTtcbiAgc3VpdGUuY3R4ID0gdGhpcy5jdHg7XG4gIHN1aXRlLnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICBzdWl0ZS5lbmFibGVUaW1lb3V0cyh0aGlzLmVuYWJsZVRpbWVvdXRzKCkpO1xuICBzdWl0ZS5zbG93KHRoaXMuc2xvdygpKTtcbiAgc3VpdGUuYmFpbCh0aGlzLmJhaWwoKSk7XG4gIHJldHVybiBzdWl0ZTtcbn07XG5cbi8qKlxuICogU2V0IHRpbWVvdXQgYG1zYCBvciBzaG9ydC1oYW5kIHN1Y2ggYXMgXCIyc1wiLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfFN0cmluZ30gbXNcbiAqIEByZXR1cm4ge1N1aXRlfE51bWJlcn0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUudGltZW91dCA9IGZ1bmN0aW9uKG1zKXtcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX3RpbWVvdXQ7XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgbXMpIG1zID0gbWlsbGlzZWNvbmRzKG1zKTtcbiAgZGVidWcoJ3RpbWVvdXQgJWQnLCBtcyk7XG4gIHRoaXMuX3RpbWVvdXQgPSBwYXJzZUludChtcywgMTApO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICAqIFNldCB0aW1lb3V0IGBlbmFibGVkYC5cbiAgKlxuICAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlZFxuICAqIEByZXR1cm4ge1N1aXRlfEJvb2xlYW59IHNlbGYgb3IgZW5hYmxlZFxuICAqIEBhcGkgcHJpdmF0ZVxuICAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuZW5hYmxlVGltZW91dHMgPSBmdW5jdGlvbihlbmFibGVkKXtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHJldHVybiB0aGlzLl9lbmFibGVUaW1lb3V0cztcbiAgZGVidWcoJ2VuYWJsZVRpbWVvdXRzICVzJywgZW5hYmxlZCk7XG4gIHRoaXMuX2VuYWJsZVRpbWVvdXRzID0gZW5hYmxlZDtcbiAgcmV0dXJuIHRoaXM7XG59XG5cbi8qKlxuICogU2V0IHNsb3cgYG1zYCBvciBzaG9ydC1oYW5kIHN1Y2ggYXMgXCIyc1wiLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfFN0cmluZ30gbXNcbiAqIEByZXR1cm4ge1N1aXRlfE51bWJlcn0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuc2xvdyA9IGZ1bmN0aW9uKG1zKXtcbiAgaWYgKDAgPT09IGFyZ3VtZW50cy5sZW5ndGgpIHJldHVybiB0aGlzLl9zbG93O1xuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIG1zKSBtcyA9IG1pbGxpc2Vjb25kcyhtcyk7XG4gIGRlYnVnKCdzbG93ICVkJywgbXMpO1xuICB0aGlzLl9zbG93ID0gbXM7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXRzIHdoZXRoZXIgdG8gYmFpbCBhZnRlciBmaXJzdCBlcnJvci5cbiAqXG4gKiBAcGFybWEge0Jvb2xlYW59IGJhaWxcbiAqIEByZXR1cm4ge1N1aXRlfE51bWJlcn0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYmFpbCA9IGZ1bmN0aW9uKGJhaWwpe1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fYmFpbDtcbiAgZGVidWcoJ2JhaWwgJXMnLCBiYWlsKTtcbiAgdGhpcy5fYmFpbCA9IGJhaWw7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSdW4gYGZuKHRlc3RbLCBkb25lXSlgIGJlZm9yZSBydW5uaW5nIHRlc3RzLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtTdWl0ZX0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYmVmb3JlQWxsID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgaWYgKHRoaXMucGVuZGluZykgcmV0dXJuIHRoaXM7XG4gIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGl0bGUpIHtcbiAgICBmbiA9IHRpdGxlO1xuICAgIHRpdGxlID0gZm4ubmFtZTtcbiAgfVxuICB0aXRsZSA9ICdcImJlZm9yZSBhbGxcIiBob29rJyArICh0aXRsZSA/ICc6ICcgKyB0aXRsZSA6ICcnKTtcblxuICB2YXIgaG9vayA9IG5ldyBIb29rKHRpdGxlLCBmbik7XG4gIGhvb2sucGFyZW50ID0gdGhpcztcbiAgaG9vay50aW1lb3V0KHRoaXMudGltZW91dCgpKTtcbiAgaG9vay5lbmFibGVUaW1lb3V0cyh0aGlzLmVuYWJsZVRpbWVvdXRzKCkpO1xuICBob29rLnNsb3codGhpcy5zbG93KCkpO1xuICBob29rLmN0eCA9IHRoaXMuY3R4O1xuICB0aGlzLl9iZWZvcmVBbGwucHVzaChob29rKTtcbiAgdGhpcy5lbWl0KCdiZWZvcmVBbGwnLCBob29rKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJ1biBgZm4odGVzdFssIGRvbmVdKWAgYWZ0ZXIgcnVubmluZyB0ZXN0cy5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHJldHVybiB7U3VpdGV9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU3VpdGUucHJvdG90eXBlLmFmdGVyQWxsID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgaWYgKHRoaXMucGVuZGluZykgcmV0dXJuIHRoaXM7XG4gIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGl0bGUpIHtcbiAgICBmbiA9IHRpdGxlO1xuICAgIHRpdGxlID0gZm4ubmFtZTtcbiAgfVxuICB0aXRsZSA9ICdcImFmdGVyIGFsbFwiIGhvb2snICsgKHRpdGxlID8gJzogJyArIHRpdGxlIDogJycpO1xuXG4gIHZhciBob29rID0gbmV3IEhvb2sodGl0bGUsIGZuKTtcbiAgaG9vay5wYXJlbnQgPSB0aGlzO1xuICBob29rLnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICBob29rLmVuYWJsZVRpbWVvdXRzKHRoaXMuZW5hYmxlVGltZW91dHMoKSk7XG4gIGhvb2suc2xvdyh0aGlzLnNsb3coKSk7XG4gIGhvb2suY3R4ID0gdGhpcy5jdHg7XG4gIHRoaXMuX2FmdGVyQWxsLnB1c2goaG9vayk7XG4gIHRoaXMuZW1pdCgnYWZ0ZXJBbGwnLCBob29rKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJ1biBgZm4odGVzdFssIGRvbmVdKWAgYmVmb3JlIGVhY2ggdGVzdCBjYXNlLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtTdWl0ZX0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYmVmb3JlRWFjaCA9IGZ1bmN0aW9uKHRpdGxlLCBmbil7XG4gIGlmICh0aGlzLnBlbmRpbmcpIHJldHVybiB0aGlzO1xuICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRpdGxlKSB7XG4gICAgZm4gPSB0aXRsZTtcbiAgICB0aXRsZSA9IGZuLm5hbWU7XG4gIH1cbiAgdGl0bGUgPSAnXCJiZWZvcmUgZWFjaFwiIGhvb2snICsgKHRpdGxlID8gJzogJyArIHRpdGxlIDogJycpO1xuXG4gIHZhciBob29rID0gbmV3IEhvb2sodGl0bGUsIGZuKTtcbiAgaG9vay5wYXJlbnQgPSB0aGlzO1xuICBob29rLnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICBob29rLmVuYWJsZVRpbWVvdXRzKHRoaXMuZW5hYmxlVGltZW91dHMoKSk7XG4gIGhvb2suc2xvdyh0aGlzLnNsb3coKSk7XG4gIGhvb2suY3R4ID0gdGhpcy5jdHg7XG4gIHRoaXMuX2JlZm9yZUVhY2gucHVzaChob29rKTtcbiAgdGhpcy5lbWl0KCdiZWZvcmVFYWNoJywgaG9vayk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSdW4gYGZuKHRlc3RbLCBkb25lXSlgIGFmdGVyIGVhY2ggdGVzdCBjYXNlLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtTdWl0ZX0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUuYWZ0ZXJFYWNoID0gZnVuY3Rpb24odGl0bGUsIGZuKXtcbiAgaWYgKHRoaXMucGVuZGluZykgcmV0dXJuIHRoaXM7XG4gIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGl0bGUpIHtcbiAgICBmbiA9IHRpdGxlO1xuICAgIHRpdGxlID0gZm4ubmFtZTtcbiAgfVxuICB0aXRsZSA9ICdcImFmdGVyIGVhY2hcIiBob29rJyArICh0aXRsZSA/ICc6ICcgKyB0aXRsZSA6ICcnKTtcblxuICB2YXIgaG9vayA9IG5ldyBIb29rKHRpdGxlLCBmbik7XG4gIGhvb2sucGFyZW50ID0gdGhpcztcbiAgaG9vay50aW1lb3V0KHRoaXMudGltZW91dCgpKTtcbiAgaG9vay5lbmFibGVUaW1lb3V0cyh0aGlzLmVuYWJsZVRpbWVvdXRzKCkpO1xuICBob29rLnNsb3codGhpcy5zbG93KCkpO1xuICBob29rLmN0eCA9IHRoaXMuY3R4O1xuICB0aGlzLl9hZnRlckVhY2gucHVzaChob29rKTtcbiAgdGhpcy5lbWl0KCdhZnRlckVhY2gnLCBob29rKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEFkZCBhIHRlc3QgYHN1aXRlYC5cbiAqXG4gKiBAcGFyYW0ge1N1aXRlfSBzdWl0ZVxuICogQHJldHVybiB7U3VpdGV9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU3VpdGUucHJvdG90eXBlLmFkZFN1aXRlID0gZnVuY3Rpb24oc3VpdGUpe1xuICBzdWl0ZS5wYXJlbnQgPSB0aGlzO1xuICBzdWl0ZS50aW1lb3V0KHRoaXMudGltZW91dCgpKTtcbiAgc3VpdGUuZW5hYmxlVGltZW91dHModGhpcy5lbmFibGVUaW1lb3V0cygpKTtcbiAgc3VpdGUuc2xvdyh0aGlzLnNsb3coKSk7XG4gIHN1aXRlLmJhaWwodGhpcy5iYWlsKCkpO1xuICB0aGlzLnN1aXRlcy5wdXNoKHN1aXRlKTtcbiAgdGhpcy5lbWl0KCdzdWl0ZScsIHN1aXRlKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEFkZCBhIGB0ZXN0YCB0byB0aGlzIHN1aXRlLlxuICpcbiAqIEBwYXJhbSB7VGVzdH0gdGVzdFxuICogQHJldHVybiB7U3VpdGV9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU3VpdGUucHJvdG90eXBlLmFkZFRlc3QgPSBmdW5jdGlvbih0ZXN0KXtcbiAgdGVzdC5wYXJlbnQgPSB0aGlzO1xuICB0ZXN0LnRpbWVvdXQodGhpcy50aW1lb3V0KCkpO1xuICB0ZXN0LmVuYWJsZVRpbWVvdXRzKHRoaXMuZW5hYmxlVGltZW91dHMoKSk7XG4gIHRlc3Quc2xvdyh0aGlzLnNsb3coKSk7XG4gIHRlc3QuY3R4ID0gdGhpcy5jdHg7XG4gIHRoaXMudGVzdHMucHVzaCh0ZXN0KTtcbiAgdGhpcy5lbWl0KCd0ZXN0JywgdGVzdCk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gdGhlIGZ1bGwgdGl0bGUgZ2VuZXJhdGVkIGJ5IHJlY3Vyc2l2ZWx5XG4gKiBjb25jYXRlbmF0aW5nIHRoZSBwYXJlbnQncyBmdWxsIHRpdGxlLlxuICpcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuU3VpdGUucHJvdG90eXBlLmZ1bGxUaXRsZSA9IGZ1bmN0aW9uKCl7XG4gIGlmICh0aGlzLnBhcmVudCkge1xuICAgIHZhciBmdWxsID0gdGhpcy5wYXJlbnQuZnVsbFRpdGxlKCk7XG4gICAgaWYgKGZ1bGwpIHJldHVybiBmdWxsICsgJyAnICsgdGhpcy50aXRsZTtcbiAgfVxuICByZXR1cm4gdGhpcy50aXRsZTtcbn07XG5cbi8qKlxuICogUmV0dXJuIHRoZSB0b3RhbCBudW1iZXIgb2YgdGVzdHMuXG4gKlxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5TdWl0ZS5wcm90b3R5cGUudG90YWwgPSBmdW5jdGlvbigpe1xuICByZXR1cm4gdXRpbHMucmVkdWNlKHRoaXMuc3VpdGVzLCBmdW5jdGlvbihzdW0sIHN1aXRlKXtcbiAgICByZXR1cm4gc3VtICsgc3VpdGUudG90YWwoKTtcbiAgfSwgMCkgKyB0aGlzLnRlc3RzLmxlbmd0aDtcbn07XG5cbi8qKlxuICogSXRlcmF0ZXMgdGhyb3VnaCBlYWNoIHN1aXRlIHJlY3Vyc2l2ZWx5IHRvIGZpbmRcbiAqIGFsbCB0ZXN0cy4gQXBwbGllcyBhIGZ1bmN0aW9uIGluIHRoZSBmb3JtYXRcbiAqIGBmbih0ZXN0KWAuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1N1aXRlfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuU3VpdGUucHJvdG90eXBlLmVhY2hUZXN0ID0gZnVuY3Rpb24oZm4pe1xuICB1dGlscy5mb3JFYWNoKHRoaXMudGVzdHMsIGZuKTtcbiAgdXRpbHMuZm9yRWFjaCh0aGlzLnN1aXRlcywgZnVuY3Rpb24oc3VpdGUpe1xuICAgIHN1aXRlLmVhY2hUZXN0KGZuKTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxufSk7IC8vIG1vZHVsZTogc3VpdGUuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInRlc3QuanNcIiwgZnVuY3Rpb24obW9kdWxlLCBleHBvcnRzLCByZXF1aXJlKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBSdW5uYWJsZSA9IHJlcXVpcmUoJy4vcnVubmFibGUnKTtcblxuLyoqXG4gKiBFeHBvc2UgYFRlc3RgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gVGVzdDtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBUZXN0YCB3aXRoIHRoZSBnaXZlbiBgdGl0bGVgIGFuZCBjYWxsYmFjayBgZm5gLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0aXRsZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIFRlc3QodGl0bGUsIGZuKSB7XG4gIFJ1bm5hYmxlLmNhbGwodGhpcywgdGl0bGUsIGZuKTtcbiAgdGhpcy5wZW5kaW5nID0gIWZuO1xuICB0aGlzLnR5cGUgPSAndGVzdCc7XG59XG5cbi8qKlxuICogSW5oZXJpdCBmcm9tIGBSdW5uYWJsZS5wcm90b3R5cGVgLlxuICovXG5cbmZ1bmN0aW9uIEYoKXt9O1xuRi5wcm90b3R5cGUgPSBSdW5uYWJsZS5wcm90b3R5cGU7XG5UZXN0LnByb3RvdHlwZSA9IG5ldyBGO1xuVGVzdC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBUZXN0O1xuXG5cbn0pOyAvLyBtb2R1bGU6IHRlc3QuanNcblxucmVxdWlyZS5yZWdpc3RlcihcInV0aWxzLmpzXCIsIGZ1bmN0aW9uKG1vZHVsZSwgZXhwb3J0cywgcmVxdWlyZSl7XG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIGZzID0gcmVxdWlyZSgnYnJvd3Nlci9mcycpXG4gICwgcGF0aCA9IHJlcXVpcmUoJ2Jyb3dzZXIvcGF0aCcpXG4gICwgam9pbiA9IHBhdGguam9pblxuICAsIGRlYnVnID0gcmVxdWlyZSgnYnJvd3Nlci9kZWJ1ZycpKCdtb2NoYTp3YXRjaCcpO1xuXG4vKipcbiAqIElnbm9yZWQgZGlyZWN0b3JpZXMuXG4gKi9cblxudmFyIGlnbm9yZSA9IFsnbm9kZV9tb2R1bGVzJywgJy5naXQnXTtcblxuLyoqXG4gKiBFc2NhcGUgc3BlY2lhbCBjaGFyYWN0ZXJzIGluIHRoZSBnaXZlbiBzdHJpbmcgb2YgaHRtbC5cbiAqXG4gKiBAcGFyYW0gIHtTdHJpbmd9IGh0bWxcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuZXNjYXBlID0gZnVuY3Rpb24oaHRtbCl7XG4gIHJldHVybiBTdHJpbmcoaHRtbClcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgIC5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JylcbiAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKTtcbn07XG5cbi8qKlxuICogQXJyYXkjZm9yRWFjaCAoPD1JRTgpXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJyYXlcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcGFyYW0ge09iamVjdH0gc2NvcGVcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuZm9yRWFjaCA9IGZ1bmN0aW9uKGFyciwgZm4sIHNjb3BlKXtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBhcnIubGVuZ3RoOyBpIDwgbDsgaSsrKVxuICAgIGZuLmNhbGwoc2NvcGUsIGFycltpXSwgaSk7XG59O1xuXG4vKipcbiAqIEFycmF5I21hcCAoPD1JRTgpXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJyYXlcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcGFyYW0ge09iamVjdH0gc2NvcGVcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMubWFwID0gZnVuY3Rpb24oYXJyLCBmbiwgc2NvcGUpe1xuICB2YXIgcmVzdWx0ID0gW107XG4gIGZvciAodmFyIGkgPSAwLCBsID0gYXJyLmxlbmd0aDsgaSA8IGw7IGkrKylcbiAgICByZXN1bHQucHVzaChmbi5jYWxsKHNjb3BlLCBhcnJbaV0sIGkpKTtcbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogQXJyYXkjaW5kZXhPZiAoPD1JRTgpXG4gKlxuICogQHBhcm1hIHtBcnJheX0gYXJyXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIHRvIGZpbmQgaW5kZXggb2ZcbiAqIEBwYXJhbSB7TnVtYmVyfSBzdGFydFxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5pbmRleE9mID0gZnVuY3Rpb24oYXJyLCBvYmosIHN0YXJ0KXtcbiAgZm9yICh2YXIgaSA9IHN0YXJ0IHx8IDAsIGwgPSBhcnIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgaWYgKGFycltpXSA9PT0gb2JqKVxuICAgICAgcmV0dXJuIGk7XG4gIH1cbiAgcmV0dXJuIC0xO1xufTtcblxuLyoqXG4gKiBBcnJheSNyZWR1Y2UgKDw9SUU4KVxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHBhcmFtIHtPYmplY3R9IGluaXRpYWwgdmFsdWVcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMucmVkdWNlID0gZnVuY3Rpb24oYXJyLCBmbiwgdmFsKXtcbiAgdmFyIHJ2YWwgPSB2YWw7XG5cbiAgZm9yICh2YXIgaSA9IDAsIGwgPSBhcnIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgcnZhbCA9IGZuKHJ2YWwsIGFycltpXSwgaSwgYXJyKTtcbiAgfVxuXG4gIHJldHVybiBydmFsO1xufTtcblxuLyoqXG4gKiBBcnJheSNmaWx0ZXIgKDw9SUU4KVxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5maWx0ZXIgPSBmdW5jdGlvbihhcnIsIGZuKXtcbiAgdmFyIHJldCA9IFtdO1xuXG4gIGZvciAodmFyIGkgPSAwLCBsID0gYXJyLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIHZhciB2YWwgPSBhcnJbaV07XG4gICAgaWYgKGZuKHZhbCwgaSwgYXJyKSkgcmV0LnB1c2godmFsKTtcbiAgfVxuXG4gIHJldHVybiByZXQ7XG59O1xuXG4vKipcbiAqIE9iamVjdC5rZXlzICg8PUlFOClcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtBcnJheX0ga2V5c1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5rZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24ob2JqKSB7XG4gIHZhciBrZXlzID0gW11cbiAgICAsIGhhcyA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkgLy8gZm9yIGB3aW5kb3dgIG9uIDw9SUU4XG5cbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChoYXMuY2FsbChvYmosIGtleSkpIHtcbiAgICAgIGtleXMucHVzaChrZXkpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBrZXlzO1xufTtcblxuLyoqXG4gKiBXYXRjaCB0aGUgZ2l2ZW4gYGZpbGVzYCBmb3IgY2hhbmdlc1xuICogYW5kIGludm9rZSBgZm4oZmlsZSlgIG9uIG1vZGlmaWNhdGlvbi5cbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBmaWxlc1xuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMud2F0Y2ggPSBmdW5jdGlvbihmaWxlcywgZm4pe1xuICB2YXIgb3B0aW9ucyA9IHsgaW50ZXJ2YWw6IDEwMCB9O1xuICBmaWxlcy5mb3JFYWNoKGZ1bmN0aW9uKGZpbGUpe1xuICAgIGRlYnVnKCdmaWxlICVzJywgZmlsZSk7XG4gICAgZnMud2F0Y2hGaWxlKGZpbGUsIG9wdGlvbnMsIGZ1bmN0aW9uKGN1cnIsIHByZXYpe1xuICAgICAgaWYgKHByZXYubXRpbWUgPCBjdXJyLm10aW1lKSBmbihmaWxlKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIElnbm9yZWQgZmlsZXMuXG4gKi9cblxuZnVuY3Rpb24gaWdub3JlZChwYXRoKXtcbiAgcmV0dXJuICF+aWdub3JlLmluZGV4T2YocGF0aCk7XG59XG5cbi8qKlxuICogTG9va3VwIGZpbGVzIGluIHRoZSBnaXZlbiBgZGlyYC5cbiAqXG4gKiBAcmV0dXJuIHtBcnJheX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuZmlsZXMgPSBmdW5jdGlvbihkaXIsIGV4dCwgcmV0KXtcbiAgcmV0ID0gcmV0IHx8IFtdO1xuICBleHQgPSBleHQgfHwgWydqcyddO1xuXG4gIHZhciByZSA9IG5ldyBSZWdFeHAoJ1xcXFwuKCcgKyBleHQuam9pbignfCcpICsgJykkJyk7XG5cbiAgZnMucmVhZGRpclN5bmMoZGlyKVxuICAuZmlsdGVyKGlnbm9yZWQpXG4gIC5mb3JFYWNoKGZ1bmN0aW9uKHBhdGgpe1xuICAgIHBhdGggPSBqb2luKGRpciwgcGF0aCk7XG4gICAgaWYgKGZzLnN0YXRTeW5jKHBhdGgpLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgIGV4cG9ydHMuZmlsZXMocGF0aCwgZXh0LCByZXQpO1xuICAgIH0gZWxzZSBpZiAocGF0aC5tYXRjaChyZSkpIHtcbiAgICAgIHJldC5wdXNoKHBhdGgpO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIHJldDtcbn07XG5cbi8qKlxuICogQ29tcHV0ZSBhIHNsdWcgZnJvbSB0aGUgZ2l2ZW4gYHN0cmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5zbHVnID0gZnVuY3Rpb24oc3RyKXtcbiAgcmV0dXJuIHN0clxuICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgLnJlcGxhY2UoLyArL2csICctJylcbiAgICAucmVwbGFjZSgvW14tXFx3XS9nLCAnJyk7XG59O1xuXG4vKipcbiAqIFN0cmlwIHRoZSBmdW5jdGlvbiBkZWZpbml0aW9uIGZyb20gYHN0cmAsXG4gKiBhbmQgcmUtaW5kZW50IGZvciBwcmUgd2hpdGVzcGFjZS5cbiAqL1xuXG5leHBvcnRzLmNsZWFuID0gZnVuY3Rpb24oc3RyKSB7XG4gIHN0ciA9IHN0clxuICAgIC5yZXBsYWNlKC9cXHJcXG4/fFtcXG5cXHUyMDI4XFx1MjAyOV0vZywgXCJcXG5cIikucmVwbGFjZSgvXlxcdUZFRkYvLCAnJylcbiAgICAucmVwbGFjZSgvXmZ1bmN0aW9uICpcXCguKlxcKSAqe3xcXCguKlxcKSAqPT4gKns/LywgJycpXG4gICAgLnJlcGxhY2UoL1xccytcXH0kLywgJycpO1xuXG4gIHZhciBzcGFjZXMgPSBzdHIubWF0Y2goL15cXG4/KCAqKS8pWzFdLmxlbmd0aFxuICAgICwgdGFicyA9IHN0ci5tYXRjaCgvXlxcbj8oXFx0KikvKVsxXS5sZW5ndGhcbiAgICAsIHJlID0gbmV3IFJlZ0V4cCgnXlxcbj8nICsgKHRhYnMgPyAnXFx0JyA6ICcgJykgKyAneycgKyAodGFicyA/IHRhYnMgOiBzcGFjZXMpICsgJ30nLCAnZ20nKTtcblxuICBzdHIgPSBzdHIucmVwbGFjZShyZSwgJycpO1xuXG4gIHJldHVybiBleHBvcnRzLnRyaW0oc3RyKTtcbn07XG5cbi8qKlxuICogRXNjYXBlIHJlZ3VsYXIgZXhwcmVzc2lvbiBjaGFyYWN0ZXJzIGluIGBzdHJgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuZXNjYXBlUmVnZXhwID0gZnVuY3Rpb24oc3RyKXtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9bLVxcXFxeJCorPy4oKXxbXFxde31dL2csIFwiXFxcXCQmXCIpO1xufTtcblxuLyoqXG4gKiBUcmltIHRoZSBnaXZlbiBgc3RyYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLnRyaW0gPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKTtcbn07XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGBxc2AuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHFzXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLnBhcnNlUXVlcnkgPSBmdW5jdGlvbihxcyl7XG4gIHJldHVybiBleHBvcnRzLnJlZHVjZShxcy5yZXBsYWNlKCc/JywgJycpLnNwbGl0KCcmJyksIGZ1bmN0aW9uKG9iaiwgcGFpcil7XG4gICAgdmFyIGkgPSBwYWlyLmluZGV4T2YoJz0nKVxuICAgICAgLCBrZXkgPSBwYWlyLnNsaWNlKDAsIGkpXG4gICAgICAsIHZhbCA9IHBhaXIuc2xpY2UoKytpKTtcblxuICAgIG9ialtrZXldID0gZGVjb2RlVVJJQ29tcG9uZW50KHZhbCk7XG4gICAgcmV0dXJuIG9iajtcbiAgfSwge30pO1xufTtcblxuLyoqXG4gKiBIaWdobGlnaHQgdGhlIGdpdmVuIHN0cmluZyBvZiBganNgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBqc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaGlnaGxpZ2h0KGpzKSB7XG4gIHJldHVybiBqc1xuICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgLnJlcGxhY2UoL1xcL1xcLyguKikvZ20sICc8c3BhbiBjbGFzcz1cImNvbW1lbnRcIj4vLyQxPC9zcGFuPicpXG4gICAgLnJlcGxhY2UoLygnLio/JykvZ20sICc8c3BhbiBjbGFzcz1cInN0cmluZ1wiPiQxPC9zcGFuPicpXG4gICAgLnJlcGxhY2UoLyhcXGQrXFwuXFxkKykvZ20sICc8c3BhbiBjbGFzcz1cIm51bWJlclwiPiQxPC9zcGFuPicpXG4gICAgLnJlcGxhY2UoLyhcXGQrKS9nbSwgJzxzcGFuIGNsYXNzPVwibnVtYmVyXCI+JDE8L3NwYW4+JylcbiAgICAucmVwbGFjZSgvXFxibmV3WyBcXHRdKyhcXHcrKS9nbSwgJzxzcGFuIGNsYXNzPVwia2V5d29yZFwiPm5ldzwvc3Bhbj4gPHNwYW4gY2xhc3M9XCJpbml0XCI+JDE8L3NwYW4+JylcbiAgICAucmVwbGFjZSgvXFxiKGZ1bmN0aW9ufG5ld3x0aHJvd3xyZXR1cm58dmFyfGlmfGVsc2UpXFxiL2dtLCAnPHNwYW4gY2xhc3M9XCJrZXl3b3JkXCI+JDE8L3NwYW4+Jylcbn1cblxuLyoqXG4gKiBIaWdobGlnaHQgdGhlIGNvbnRlbnRzIG9mIHRhZyBgbmFtZWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmV4cG9ydHMuaGlnaGxpZ2h0VGFncyA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgdmFyIGNvZGUgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShuYW1lKTtcbiAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGNvZGUubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICBjb2RlW2ldLmlubmVySFRNTCA9IGhpZ2hsaWdodChjb2RlW2ldLmlubmVySFRNTCk7XG4gIH1cbn07XG5cblxuLyoqXG4gKiBTdHJpbmdpZnkgYG9iamAuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9ialxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZXhwb3J0cy5zdHJpbmdpZnkgPSBmdW5jdGlvbihvYmopIHtcbiAgaWYgKG9iaiBpbnN0YW5jZW9mIFJlZ0V4cCkgcmV0dXJuIG9iai50b1N0cmluZygpO1xuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoZXhwb3J0cy5jYW5vbmljYWxpemUob2JqKSwgbnVsbCwgMikucmVwbGFjZSgvLChcXG58JCkvZywgJyQxJyk7XG59XG5cbi8qKlxuICogUmV0dXJuIGEgbmV3IG9iamVjdCB0aGF0IGhhcyB0aGUga2V5cyBpbiBzb3J0ZWQgb3JkZXIuXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5leHBvcnRzLmNhbm9uaWNhbGl6ZSA9IGZ1bmN0aW9uKG9iaiwgc3RhY2spIHtcbiAgIHN0YWNrID0gc3RhY2sgfHwgW107XG5cbiAgIGlmIChleHBvcnRzLmluZGV4T2Yoc3RhY2ssIG9iaikgIT09IC0xKSByZXR1cm4gJ1tDaXJjdWxhcl0nO1xuXG4gICB2YXIgY2Fub25pY2FsaXplZE9iajtcblxuICAgaWYgKHt9LnRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgQXJyYXldJykge1xuICAgICBzdGFjay5wdXNoKG9iaik7XG4gICAgIGNhbm9uaWNhbGl6ZWRPYmogPSBleHBvcnRzLm1hcChvYmosIGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICByZXR1cm4gZXhwb3J0cy5jYW5vbmljYWxpemUoaXRlbSwgc3RhY2spO1xuICAgICB9KTtcbiAgICAgc3RhY2sucG9wKCk7XG4gICB9IGVsc2UgaWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbCkge1xuICAgICBzdGFjay5wdXNoKG9iaik7XG4gICAgIGNhbm9uaWNhbGl6ZWRPYmogPSB7fTtcbiAgICAgZXhwb3J0cy5mb3JFYWNoKGV4cG9ydHMua2V5cyhvYmopLnNvcnQoKSwgZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgY2Fub25pY2FsaXplZE9ialtrZXldID0gZXhwb3J0cy5jYW5vbmljYWxpemUob2JqW2tleV0sIHN0YWNrKTtcbiAgICAgfSk7XG4gICAgIHN0YWNrLnBvcCgpO1xuICAgfSBlbHNlIHtcbiAgICAgY2Fub25pY2FsaXplZE9iaiA9IG9iajtcbiAgIH1cblxuICAgcmV0dXJuIGNhbm9uaWNhbGl6ZWRPYmo7XG4gfVxuXG59KTsgLy8gbW9kdWxlOiB1dGlscy5qc1xuLy8gVGhlIGdsb2JhbCBvYmplY3QgaXMgXCJzZWxmXCIgaW4gV2ViIFdvcmtlcnMuXG52YXIgZ2xvYmFsID0gKGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpczsgfSkoKTtcblxuLyoqXG4gKiBTYXZlIHRpbWVyIHJlZmVyZW5jZXMgdG8gYXZvaWQgU2lub24gaW50ZXJmZXJpbmcgKHNlZSBHSC0yMzcpLlxuICovXG5cbnZhciBEYXRlID0gZ2xvYmFsLkRhdGU7XG52YXIgc2V0VGltZW91dCA9IGdsb2JhbC5zZXRUaW1lb3V0O1xudmFyIHNldEludGVydmFsID0gZ2xvYmFsLnNldEludGVydmFsO1xudmFyIGNsZWFyVGltZW91dCA9IGdsb2JhbC5jbGVhclRpbWVvdXQ7XG52YXIgY2xlYXJJbnRlcnZhbCA9IGdsb2JhbC5jbGVhckludGVydmFsO1xuXG4vKipcbiAqIE5vZGUgc2hpbXMuXG4gKlxuICogVGhlc2UgYXJlIG1lYW50IG9ubHkgdG8gYWxsb3dcbiAqIG1vY2hhLmpzIHRvIHJ1biB1bnRvdWNoZWQsIG5vdFxuICogdG8gYWxsb3cgcnVubmluZyBub2RlIGNvZGUgaW5cbiAqIHRoZSBicm93c2VyLlxuICovXG5cbnZhciBwcm9jZXNzID0ge307XG5wcm9jZXNzLmV4aXQgPSBmdW5jdGlvbihzdGF0dXMpe307XG5wcm9jZXNzLnN0ZG91dCA9IHt9O1xuXG52YXIgdW5jYXVnaHRFeGNlcHRpb25IYW5kbGVycyA9IFtdO1xuXG52YXIgb3JpZ2luYWxPbmVycm9ySGFuZGxlciA9IGdsb2JhbC5vbmVycm9yO1xuXG4vKipcbiAqIFJlbW92ZSB1bmNhdWdodEV4Y2VwdGlvbiBsaXN0ZW5lci5cbiAqIFJldmVydCB0byBvcmlnaW5hbCBvbmVycm9yIGhhbmRsZXIgaWYgcHJldmlvdXNseSBkZWZpbmVkLlxuICovXG5cbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbihlLCBmbil7XG4gIGlmICgndW5jYXVnaHRFeGNlcHRpb24nID09IGUpIHtcbiAgICBpZiAob3JpZ2luYWxPbmVycm9ySGFuZGxlcikge1xuICAgICAgZ2xvYmFsLm9uZXJyb3IgPSBvcmlnaW5hbE9uZXJyb3JIYW5kbGVyO1xuICAgIH0gZWxzZSB7XG4gICAgICBnbG9iYWwub25lcnJvciA9IGZ1bmN0aW9uKCkge307XG4gICAgfVxuICAgIHZhciBpID0gTW9jaGEudXRpbHMuaW5kZXhPZih1bmNhdWdodEV4Y2VwdGlvbkhhbmRsZXJzLCBmbik7XG4gICAgaWYgKGkgIT0gLTEpIHsgdW5jYXVnaHRFeGNlcHRpb25IYW5kbGVycy5zcGxpY2UoaSwgMSk7IH1cbiAgfVxufTtcblxuLyoqXG4gKiBJbXBsZW1lbnRzIHVuY2F1Z2h0RXhjZXB0aW9uIGxpc3RlbmVyLlxuICovXG5cbnByb2Nlc3Mub24gPSBmdW5jdGlvbihlLCBmbil7XG4gIGlmICgndW5jYXVnaHRFeGNlcHRpb24nID09IGUpIHtcbiAgICBnbG9iYWwub25lcnJvciA9IGZ1bmN0aW9uKGVyciwgdXJsLCBsaW5lKXtcbiAgICAgIGZuKG5ldyBFcnJvcihlcnIgKyAnICgnICsgdXJsICsgJzonICsgbGluZSArICcpJykpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfTtcbiAgICB1bmNhdWdodEV4Y2VwdGlvbkhhbmRsZXJzLnB1c2goZm4pO1xuICB9XG59O1xuXG4vKipcbiAqIEV4cG9zZSBtb2NoYS5cbiAqL1xuXG52YXIgTW9jaGEgPSBnbG9iYWwuTW9jaGEgPSByZXF1aXJlKCdtb2NoYScpLFxuICAgIG1vY2hhID0gZ2xvYmFsLm1vY2hhID0gbmV3IE1vY2hhKHsgcmVwb3J0ZXI6ICdodG1sJyB9KTtcblxuLy8gVGhlIEJERCBVSSBpcyByZWdpc3RlcmVkIGJ5IGRlZmF1bHQsIGJ1dCBubyBVSSB3aWxsIGJlIGZ1bmN0aW9uYWwgaW4gdGhlXG4vLyBicm93c2VyIHdpdGhvdXQgYW4gZXhwbGljaXQgY2FsbCB0byB0aGUgb3ZlcnJpZGRlbiBgbW9jaGEudWlgIChzZWUgYmVsb3cpLlxuLy8gRW5zdXJlIHRoYXQgdGhpcyBkZWZhdWx0IFVJIGRvZXMgbm90IGV4cG9zZSBpdHMgbWV0aG9kcyB0byB0aGUgZ2xvYmFsIHNjb3BlLlxubW9jaGEuc3VpdGUucmVtb3ZlQWxsTGlzdGVuZXJzKCdwcmUtcmVxdWlyZScpO1xuXG52YXIgaW1tZWRpYXRlUXVldWUgPSBbXVxuICAsIGltbWVkaWF0ZVRpbWVvdXQ7XG5cbmZ1bmN0aW9uIHRpbWVzbGljZSgpIHtcbiAgdmFyIGltbWVkaWF0ZVN0YXJ0ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIHdoaWxlIChpbW1lZGlhdGVRdWV1ZS5sZW5ndGggJiYgKG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gaW1tZWRpYXRlU3RhcnQpIDwgMTAwKSB7XG4gICAgaW1tZWRpYXRlUXVldWUuc2hpZnQoKSgpO1xuICB9XG4gIGlmIChpbW1lZGlhdGVRdWV1ZS5sZW5ndGgpIHtcbiAgICBpbW1lZGlhdGVUaW1lb3V0ID0gc2V0VGltZW91dCh0aW1lc2xpY2UsIDApO1xuICB9IGVsc2Uge1xuICAgIGltbWVkaWF0ZVRpbWVvdXQgPSBudWxsO1xuICB9XG59XG5cbi8qKlxuICogSGlnaC1wZXJmb3JtYW5jZSBvdmVycmlkZSBvZiBSdW5uZXIuaW1tZWRpYXRlbHkuXG4gKi9cblxuTW9jaGEuUnVubmVyLmltbWVkaWF0ZWx5ID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgaW1tZWRpYXRlUXVldWUucHVzaChjYWxsYmFjayk7XG4gIGlmICghaW1tZWRpYXRlVGltZW91dCkge1xuICAgIGltbWVkaWF0ZVRpbWVvdXQgPSBzZXRUaW1lb3V0KHRpbWVzbGljZSwgMCk7XG4gIH1cbn07XG5cbi8qKlxuICogRnVuY3Rpb24gdG8gYWxsb3cgYXNzZXJ0aW9uIGxpYnJhcmllcyB0byB0aHJvdyBlcnJvcnMgZGlyZWN0bHkgaW50byBtb2NoYS5cbiAqIFRoaXMgaXMgdXNlZnVsIHdoZW4gcnVubmluZyB0ZXN0cyBpbiBhIGJyb3dzZXIgYmVjYXVzZSB3aW5kb3cub25lcnJvciB3aWxsXG4gKiBvbmx5IHJlY2VpdmUgdGhlICdtZXNzYWdlJyBhdHRyaWJ1dGUgb2YgdGhlIEVycm9yLlxuICovXG5tb2NoYS50aHJvd0Vycm9yID0gZnVuY3Rpb24oZXJyKSB7XG4gIE1vY2hhLnV0aWxzLmZvckVhY2godW5jYXVnaHRFeGNlcHRpb25IYW5kbGVycywgZnVuY3Rpb24gKGZuKSB7XG4gICAgZm4oZXJyKTtcbiAgfSk7XG4gIHRocm93IGVycjtcbn07XG5cbi8qKlxuICogT3ZlcnJpZGUgdWkgdG8gZW5zdXJlIHRoYXQgdGhlIHVpIGZ1bmN0aW9ucyBhcmUgaW5pdGlhbGl6ZWQuXG4gKiBOb3JtYWxseSB0aGlzIHdvdWxkIGhhcHBlbiBpbiBNb2NoYS5wcm90b3R5cGUubG9hZEZpbGVzLlxuICovXG5cbm1vY2hhLnVpID0gZnVuY3Rpb24odWkpe1xuICBNb2NoYS5wcm90b3R5cGUudWkuY2FsbCh0aGlzLCB1aSk7XG4gIHRoaXMuc3VpdGUuZW1pdCgncHJlLXJlcXVpcmUnLCBnbG9iYWwsIG51bGwsIHRoaXMpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0dXAgbW9jaGEgd2l0aCB0aGUgZ2l2ZW4gc2V0dGluZyBvcHRpb25zLlxuICovXG5cbm1vY2hhLnNldHVwID0gZnVuY3Rpb24ob3B0cyl7XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2Ygb3B0cykgb3B0cyA9IHsgdWk6IG9wdHMgfTtcbiAgZm9yICh2YXIgb3B0IGluIG9wdHMpIHRoaXNbb3B0XShvcHRzW29wdF0pO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUnVuIG1vY2hhLCByZXR1cm5pbmcgdGhlIFJ1bm5lci5cbiAqL1xuXG5tb2NoYS5ydW4gPSBmdW5jdGlvbihmbil7XG4gIHZhciBvcHRpb25zID0gbW9jaGEub3B0aW9ucztcbiAgbW9jaGEuZ2xvYmFscygnbG9jYXRpb24nKTtcblxuICB2YXIgcXVlcnkgPSBNb2NoYS51dGlscy5wYXJzZVF1ZXJ5KGdsb2JhbC5sb2NhdGlvbi5zZWFyY2ggfHwgJycpO1xuICBpZiAocXVlcnkuZ3JlcCkgbW9jaGEuZ3JlcChxdWVyeS5ncmVwKTtcbiAgaWYgKHF1ZXJ5LmludmVydCkgbW9jaGEuaW52ZXJ0KCk7XG5cbiAgcmV0dXJuIE1vY2hhLnByb3RvdHlwZS5ydW4uY2FsbChtb2NoYSwgZnVuY3Rpb24oZXJyKXtcbiAgICAvLyBUaGUgRE9NIERvY3VtZW50IGlzIG5vdCBhdmFpbGFibGUgaW4gV2ViIFdvcmtlcnMuXG4gICAgaWYgKGdsb2JhbC5kb2N1bWVudCkge1xuICAgICAgTW9jaGEudXRpbHMuaGlnaGxpZ2h0VGFncygnY29kZScpO1xuICAgIH1cbiAgICBpZiAoZm4pIGZuKGVycik7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBFeHBvc2UgdGhlIHByb2Nlc3Mgc2hpbS5cbiAqL1xuXG5Nb2NoYS5wcm9jZXNzID0gcHJvY2Vzcztcbn0pKCk7IiwiQGNoYXJzZXQgXCJ1dGYtOFwiO1xuXG5ib2R5IHtcbiAgbWFyZ2luOjA7XG59XG5cbiNtb2NoYSB7XG4gIGZvbnQ6IDIwcHgvMS41IFwiSGVsdmV0aWNhIE5ldWVcIiwgSGVsdmV0aWNhLCBBcmlhbCwgc2Fucy1zZXJpZjtcbiAgbWFyZ2luOiA2MHB4IDUwcHg7XG59XG5cbiNtb2NoYSB1bCxcbiNtb2NoYSBsaSB7XG4gIG1hcmdpbjogMDtcbiAgcGFkZGluZzogMDtcbn1cblxuI21vY2hhIHVsIHtcbiAgbGlzdC1zdHlsZTogbm9uZTtcbn1cblxuI21vY2hhIGgxLFxuI21vY2hhIGgyIHtcbiAgbWFyZ2luOiAwO1xufVxuXG4jbW9jaGEgaDEge1xuICBtYXJnaW4tdG9wOiAxNXB4O1xuICBmb250LXNpemU6IDFlbTtcbiAgZm9udC13ZWlnaHQ6IDIwMDtcbn1cblxuI21vY2hhIGgxIGEge1xuICB0ZXh0LWRlY29yYXRpb246IG5vbmU7XG4gIGNvbG9yOiBpbmhlcml0O1xufVxuXG4jbW9jaGEgaDEgYTpob3ZlciB7XG4gIHRleHQtZGVjb3JhdGlvbjogdW5kZXJsaW5lO1xufVxuXG4jbW9jaGEgLnN1aXRlIC5zdWl0ZSBoMSB7XG4gIG1hcmdpbi10b3A6IDA7XG4gIGZvbnQtc2l6ZTogLjhlbTtcbn1cblxuI21vY2hhIC5oaWRkZW4ge1xuICBkaXNwbGF5OiBub25lO1xufVxuXG4jbW9jaGEgaDIge1xuICBmb250LXNpemU6IDEycHg7XG4gIGZvbnQtd2VpZ2h0OiBub3JtYWw7XG4gIGN1cnNvcjogcG9pbnRlcjtcbn1cblxuI21vY2hhIC5zdWl0ZSB7XG4gIG1hcmdpbi1sZWZ0OiAxNXB4O1xufVxuXG4jbW9jaGEgLnRlc3Qge1xuICBtYXJnaW4tbGVmdDogMTVweDtcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcbn1cblxuI21vY2hhIC50ZXN0LnBlbmRpbmc6aG92ZXIgaDI6OmFmdGVyIHtcbiAgY29udGVudDogJyhwZW5kaW5nKSc7XG4gIGZvbnQtZmFtaWx5OiBhcmlhbCwgc2Fucy1zZXJpZjtcbn1cblxuI21vY2hhIC50ZXN0LnBhc3MubWVkaXVtIC5kdXJhdGlvbiB7XG4gIGJhY2tncm91bmQ6ICNjMDk4NTM7XG59XG5cbiNtb2NoYSAudGVzdC5wYXNzLnNsb3cgLmR1cmF0aW9uIHtcbiAgYmFja2dyb3VuZDogI2I5NGE0ODtcbn1cblxuI21vY2hhIC50ZXN0LnBhc3M6OmJlZm9yZSB7XG4gIGNvbnRlbnQ6ICfinJMnO1xuICBmb250LXNpemU6IDEycHg7XG4gIGRpc3BsYXk6IGJsb2NrO1xuICBmbG9hdDogbGVmdDtcbiAgbWFyZ2luLXJpZ2h0OiA1cHg7XG4gIGNvbG9yOiAjMDBkNmIyO1xufVxuXG4jbW9jaGEgLnRlc3QucGFzcyAuZHVyYXRpb24ge1xuICBmb250LXNpemU6IDlweDtcbiAgbWFyZ2luLWxlZnQ6IDVweDtcbiAgcGFkZGluZzogMnB4IDVweDtcbiAgY29sb3I6ICNmZmY7XG4gIC13ZWJraXQtYm94LXNoYWRvdzogaW5zZXQgMCAxcHggMXB4IHJnYmEoMCwwLDAsLjIpO1xuICAtbW96LWJveC1zaGFkb3c6IGluc2V0IDAgMXB4IDFweCByZ2JhKDAsMCwwLC4yKTtcbiAgYm94LXNoYWRvdzogaW5zZXQgMCAxcHggMXB4IHJnYmEoMCwwLDAsLjIpO1xuICAtd2Via2l0LWJvcmRlci1yYWRpdXM6IDVweDtcbiAgLW1vei1ib3JkZXItcmFkaXVzOiA1cHg7XG4gIC1tcy1ib3JkZXItcmFkaXVzOiA1cHg7XG4gIC1vLWJvcmRlci1yYWRpdXM6IDVweDtcbiAgYm9yZGVyLXJhZGl1czogNXB4O1xufVxuXG4jbW9jaGEgLnRlc3QucGFzcy5mYXN0IC5kdXJhdGlvbiB7XG4gIGRpc3BsYXk6IG5vbmU7XG59XG5cbiNtb2NoYSAudGVzdC5wZW5kaW5nIHtcbiAgY29sb3I6ICMwYjk3YzQ7XG59XG5cbiNtb2NoYSAudGVzdC5wZW5kaW5nOjpiZWZvcmUge1xuICBjb250ZW50OiAn4pemJztcbiAgY29sb3I6ICMwYjk3YzQ7XG59XG5cbiNtb2NoYSAudGVzdC5mYWlsIHtcbiAgY29sb3I6ICNjMDA7XG59XG5cbiNtb2NoYSAudGVzdC5mYWlsIHByZSB7XG4gIGNvbG9yOiBibGFjaztcbn1cblxuI21vY2hhIC50ZXN0LmZhaWw6OmJlZm9yZSB7XG4gIGNvbnRlbnQ6ICfinJYnO1xuICBmb250LXNpemU6IDEycHg7XG4gIGRpc3BsYXk6IGJsb2NrO1xuICBmbG9hdDogbGVmdDtcbiAgbWFyZ2luLXJpZ2h0OiA1cHg7XG4gIGNvbG9yOiAjYzAwO1xufVxuXG4jbW9jaGEgLnRlc3QgcHJlLmVycm9yIHtcbiAgY29sb3I6ICNjMDA7XG4gIG1heC1oZWlnaHQ6IDMwMHB4O1xuICBvdmVyZmxvdzogYXV0bztcbn1cblxuLyoqXG4gKiAoMSk6IGFwcHJveGltYXRlIGZvciBicm93c2VycyBub3Qgc3VwcG9ydGluZyBjYWxjXG4gKiAoMik6IDQyID0gMioxNSArIDIqMTAgKyAyKjEgKHBhZGRpbmcgKyBtYXJnaW4gKyBib3JkZXIpXG4gKiAgICAgIF5eIHNlcmlvdXNseVxuICovXG4jbW9jaGEgLnRlc3QgcHJlIHtcbiAgZGlzcGxheTogYmxvY2s7XG4gIGZsb2F0OiBsZWZ0O1xuICBjbGVhcjogbGVmdDtcbiAgZm9udDogMTJweC8xLjUgbW9uYWNvLCBtb25vc3BhY2U7XG4gIG1hcmdpbjogNXB4O1xuICBwYWRkaW5nOiAxNXB4O1xuICBib3JkZXI6IDFweCBzb2xpZCAjZWVlO1xuICBtYXgtd2lkdGg6IDg1JTsgLyooMSkqL1xuICBtYXgtd2lkdGg6IGNhbGMoMTAwJSAtIDQycHgpOyAvKigyKSovXG4gIHdvcmQtd3JhcDogYnJlYWstd29yZDtcbiAgYm9yZGVyLWJvdHRvbS1jb2xvcjogI2RkZDtcbiAgLXdlYmtpdC1ib3JkZXItcmFkaXVzOiAzcHg7XG4gIC13ZWJraXQtYm94LXNoYWRvdzogMCAxcHggM3B4ICNlZWU7XG4gIC1tb3otYm9yZGVyLXJhZGl1czogM3B4O1xuICAtbW96LWJveC1zaGFkb3c6IDAgMXB4IDNweCAjZWVlO1xuICBib3JkZXItcmFkaXVzOiAzcHg7XG59XG5cbiNtb2NoYSAudGVzdCBoMiB7XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbn1cblxuI21vY2hhIC50ZXN0IGEucmVwbGF5IHtcbiAgcG9zaXRpb246IGFic29sdXRlO1xuICB0b3A6IDNweDtcbiAgcmlnaHQ6IDA7XG4gIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcbiAgdmVydGljYWwtYWxpZ246IG1pZGRsZTtcbiAgZGlzcGxheTogYmxvY2s7XG4gIHdpZHRoOiAxNXB4O1xuICBoZWlnaHQ6IDE1cHg7XG4gIGxpbmUtaGVpZ2h0OiAxNXB4O1xuICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gIGJhY2tncm91bmQ6ICNlZWU7XG4gIGZvbnQtc2l6ZTogMTVweDtcbiAgLW1vei1ib3JkZXItcmFkaXVzOiAxNXB4O1xuICBib3JkZXItcmFkaXVzOiAxNXB4O1xuICAtd2Via2l0LXRyYW5zaXRpb246IG9wYWNpdHkgMjAwbXM7XG4gIC1tb3otdHJhbnNpdGlvbjogb3BhY2l0eSAyMDBtcztcbiAgdHJhbnNpdGlvbjogb3BhY2l0eSAyMDBtcztcbiAgb3BhY2l0eTogMC4zO1xuICBjb2xvcjogIzg4ODtcbn1cblxuI21vY2hhIC50ZXN0OmhvdmVyIGEucmVwbGF5IHtcbiAgb3BhY2l0eTogMTtcbn1cblxuI21vY2hhLXJlcG9ydC5wYXNzIC50ZXN0LmZhaWwge1xuICBkaXNwbGF5OiBub25lO1xufVxuXG4jbW9jaGEtcmVwb3J0LmZhaWwgLnRlc3QucGFzcyB7XG4gIGRpc3BsYXk6IG5vbmU7XG59XG5cbiNtb2NoYS1yZXBvcnQucGVuZGluZyAudGVzdC5wYXNzLFxuI21vY2hhLXJlcG9ydC5wZW5kaW5nIC50ZXN0LmZhaWwge1xuICBkaXNwbGF5OiBub25lO1xufVxuI21vY2hhLXJlcG9ydC5wZW5kaW5nIC50ZXN0LnBhc3MucGVuZGluZyB7XG4gIGRpc3BsYXk6IGJsb2NrO1xufVxuXG4jbW9jaGEtZXJyb3Ige1xuICBjb2xvcjogI2MwMDtcbiAgZm9udC1zaXplOiAxLjVlbTtcbiAgZm9udC13ZWlnaHQ6IDEwMDtcbiAgbGV0dGVyLXNwYWNpbmc6IDFweDtcbn1cblxuI21vY2hhLXN0YXRzIHtcbiAgcG9zaXRpb246IGZpeGVkO1xuICB0b3A6IDE1cHg7XG4gIHJpZ2h0OiAxMHB4O1xuICBmb250LXNpemU6IDEycHg7XG4gIG1hcmdpbjogMDtcbiAgY29sb3I6ICM4ODg7XG4gIHotaW5kZXg6IDE7XG59XG5cbiNtb2NoYS1zdGF0cyAucHJvZ3Jlc3Mge1xuICBmbG9hdDogcmlnaHQ7XG4gIHBhZGRpbmctdG9wOiAwO1xufVxuXG4jbW9jaGEtc3RhdHMgZW0ge1xuICBjb2xvcjogYmxhY2s7XG59XG5cbiNtb2NoYS1zdGF0cyBhIHtcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xuICBjb2xvcjogaW5oZXJpdDtcbn1cblxuI21vY2hhLXN0YXRzIGE6aG92ZXIge1xuICBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2VlZTtcbn1cblxuI21vY2hhLXN0YXRzIGxpIHtcbiAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICBtYXJnaW46IDAgNXB4O1xuICBsaXN0LXN0eWxlOiBub25lO1xuICBwYWRkaW5nLXRvcDogMTFweDtcbn1cblxuI21vY2hhLXN0YXRzIGNhbnZhcyB7XG4gIHdpZHRoOiA0MHB4O1xuICBoZWlnaHQ6IDQwcHg7XG59XG5cbiNtb2NoYSBjb2RlIC5jb21tZW50IHsgY29sb3I6ICNkZGQ7IH1cbiNtb2NoYSBjb2RlIC5pbml0IHsgY29sb3I6ICMyZjZmYWQ7IH1cbiNtb2NoYSBjb2RlIC5zdHJpbmcgeyBjb2xvcjogIzU4OTBhZDsgfVxuI21vY2hhIGNvZGUgLmtleXdvcmQgeyBjb2xvcjogIzhhNjM0MzsgfVxuI21vY2hhIGNvZGUgLm51bWJlciB7IGNvbG9yOiAjMmY2ZmFkOyB9XG5cbkBtZWRpYSBzY3JlZW4gYW5kIChtYXgtZGV2aWNlLXdpZHRoOiA0ODBweCkge1xuICAjbW9jaGEge1xuICAgIG1hcmdpbjogNjBweCAwcHg7XG4gIH1cblxuICAjbW9jaGEgI3N0YXRzIHtcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIH1cbn1cbiIsIi8vIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vL1xuLy8gVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4vLyBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4vLyBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuLy8gQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc28gc3ViamVjdCB0b1xuLy8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbihmdW5jdGlvbihzY29wZSkge1xuJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBwYXJzZShzdGFjaykge1xuICB2YXIgcmF3TGluZXMgPSBzdGFjay5zcGxpdCgnXFxuJyk7XG5cbiAgdmFyIHN0YWNreUxpbmVzID0gY29tcGFjdChyYXdMaW5lcy5tYXAocGFyc2VTdGFja3lMaW5lKSk7XG4gIGlmIChzdGFja3lMaW5lcy5sZW5ndGggPT09IHJhd0xpbmVzLmxlbmd0aCkgcmV0dXJuIHN0YWNreUxpbmVzO1xuXG4gIHZhciB2OExpbmVzID0gY29tcGFjdChyYXdMaW5lcy5tYXAocGFyc2VWOExpbmUpKTtcbiAgaWYgKHY4TGluZXMubGVuZ3RoID4gMCkgcmV0dXJuIHY4TGluZXM7XG5cbiAgdmFyIGdlY2tvTGluZXMgPSBjb21wYWN0KHJhd0xpbmVzLm1hcChwYXJzZUdlY2tvTGluZSkpO1xuICBpZiAoZ2Vja29MaW5lcy5sZW5ndGggPiAwKSByZXR1cm4gZ2Vja29MaW5lcztcblxuICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gc3RhY2sgZm9ybWF0OiAnICsgc3RhY2spO1xufVxuXG4vLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9FcnJvci9TdGFja1xudmFyIEdFQ0tPX0xJTkUgPSAvXig/OihbXkBdKilAKT8oLio/KTooXFxkKykoPzo6KFxcZCspKT8kLztcblxuZnVuY3Rpb24gcGFyc2VHZWNrb0xpbmUobGluZSkge1xuICB2YXIgbWF0Y2ggPSBsaW5lLm1hdGNoKEdFQ0tPX0xJTkUpO1xuICBpZiAoIW1hdGNoKSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHtcbiAgICBtZXRob2Q6ICAgbWF0Y2hbMV0gfHwgJycsXG4gICAgbG9jYXRpb246IG1hdGNoWzJdIHx8ICcnLFxuICAgIGxpbmU6ICAgICBwYXJzZUludChtYXRjaFszXSkgfHwgMCxcbiAgICBjb2x1bW46ICAgcGFyc2VJbnQobWF0Y2hbNF0pIHx8IDAsXG4gIH07XG59XG5cbi8vIGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3Avdjgvd2lraS9KYXZhU2NyaXB0U3RhY2tUcmFjZUFwaVxudmFyIFY4X09VVEVSMSA9IC9eXFxzKihldmFsICk/YXQgKC4qKSBcXCgoLiopXFwpJC87XG52YXIgVjhfT1VURVIyID0gL15cXHMqYXQoKSgpIChcXFMrKSQvO1xudmFyIFY4X0lOTkVSICA9IC9eXFwoPyhbXlxcKF0rKTooXFxkKyk6KFxcZCspXFwpPyQvO1xuXG5mdW5jdGlvbiBwYXJzZVY4TGluZShsaW5lKSB7XG4gIHZhciBvdXRlciA9IGxpbmUubWF0Y2goVjhfT1VURVIxKSB8fCBsaW5lLm1hdGNoKFY4X09VVEVSMik7XG4gIGlmICghb3V0ZXIpIHJldHVybiBudWxsO1xuICB2YXIgaW5uZXIgPSBvdXRlclszXS5tYXRjaChWOF9JTk5FUik7XG4gIGlmICghaW5uZXIpIHJldHVybiBudWxsO1xuXG4gIHZhciBtZXRob2QgPSBvdXRlclsyXSB8fCAnJztcbiAgaWYgKG91dGVyWzFdKSBtZXRob2QgPSAnZXZhbCBhdCAnICsgbWV0aG9kO1xuICByZXR1cm4ge1xuICAgIG1ldGhvZDogICBtZXRob2QsXG4gICAgbG9jYXRpb246IGlubmVyWzFdIHx8ICcnLFxuICAgIGxpbmU6ICAgICBwYXJzZUludChpbm5lclsyXSkgfHwgMCxcbiAgICBjb2x1bW46ICAgcGFyc2VJbnQoaW5uZXJbM10pIHx8IDAsXG4gIH07XG59XG5cbi8vIFN0YWNreS5mb3JtYXR0aW5nLnByZXR0eVxuXG52YXIgU1RBQ0tZX0xJTkUgPSAvXlxccyooLispIGF0ICguKyk6KFxcZCspOihcXGQrKSQvO1xuXG5mdW5jdGlvbiBwYXJzZVN0YWNreUxpbmUobGluZSkge1xuICB2YXIgbWF0Y2ggPSBsaW5lLm1hdGNoKFNUQUNLWV9MSU5FKTtcbiAgaWYgKCFtYXRjaCkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7XG4gICAgbWV0aG9kOiAgIG1hdGNoWzFdIHx8ICcnLFxuICAgIGxvY2F0aW9uOiBtYXRjaFsyXSB8fCAnJyxcbiAgICBsaW5lOiAgICAgcGFyc2VJbnQobWF0Y2hbM10pIHx8IDAsXG4gICAgY29sdW1uOiAgIHBhcnNlSW50KG1hdGNoWzRdKSB8fCAwLFxuICB9O1xufVxuXG4vLyBIZWxwZXJzXG5cbmZ1bmN0aW9uIGNvbXBhY3QoYXJyYXkpIHtcbiAgdmFyIHJlc3VsdCA9IFtdO1xuICBhcnJheS5mb3JFYWNoKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgaWYgKHZhbHVlKSB7XG4gICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuc2NvcGUucGFyc2UgICAgICAgICAgID0gcGFyc2U7XG5zY29wZS5wYXJzZUdlY2tvTGluZSAgPSBwYXJzZUdlY2tvTGluZTtcbnNjb3BlLnBhcnNlVjhMaW5lICAgICA9IHBhcnNlVjhMaW5lO1xuc2NvcGUucGFyc2VTdGFja3lMaW5lID0gcGFyc2VTdGFja3lMaW5lO1xufSkodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgPyBtb2R1bGUuZXhwb3J0cyA6ICh0aGlzLlN0YWNreSA9IHRoaXMuU3RhY2t5IHx8IHt9KSk7XG4iLCIvLyBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuLy9cbi8vIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBwb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuLy8gVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBwb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuLy8gVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbi8vIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvIHN1YmplY3QgdG9cbi8vIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4oZnVuY3Rpb24oc2NvcGUpIHtcbid1c2Ugc3RyaWN0JztcblxudmFyIHBhcnNlID0gc2NvcGUucGFyc2UgfHwgcmVxdWlyZSgnLi9wYXJzaW5nJykucGFyc2U7XG5cbnNjb3BlLmRlZmF1bHRzID0ge1xuICAvLyBNZXRob2RzIGFyZSBhbGlnbmVkIHVwIHRvIHRoaXMgbXVjaCBwYWRkaW5nLlxuICBtYXhNZXRob2RQYWRkaW5nOiA0MCxcbiAgLy8gQSBzdHJpbmcgdG8gcHJlZml4IGVhY2ggbGluZSB3aXRoLlxuICBpbmRlbnQ6ICcnLFxuICAvLyBBIHN0cmluZyB0byBzaG93IGZvciBzdGFjayBsaW5lcyB0aGF0IGFyZSBtaXNzaW5nIGEgbWV0aG9kLlxuICBtZXRob2RQbGFjZWhvbGRlcjogJzx1bmtub3duPicsXG4gIC8vIEEgbGlzdCBvZiBTdHJpbmdzL1JlZ0V4cHMgdGhhdCB3aWxsIGJlIHN0cmlwcGVkIGZyb20gYGxvY2F0aW9uYCB2YWx1ZXMgb25cbiAgLy8gZWFjaCBsaW5lICh2aWEgYFN0cmluZyNyZXBsYWNlYCkuXG4gIGxvY2F0aW9uU3RyaXA6IFtdLFxuICAvLyBBIGxpc3Qgb2YgU3RyaW5ncy9SZWdFeHBzIHRoYXQgaW5kaWNhdGUgdGhhdCBhIGxpbmUgaXMgKm5vdCogaW1wb3J0YW50LCBhbmRcbiAgLy8gc2hvdWxkIGJlIHN0eWxlZCBhcyBzdWNoLlxuICB1bmltcG9ydGFudExvY2F0aW9uOiBbXSxcbiAgLy8gQSBmaWx0ZXIgZnVuY3Rpb24gdG8gY29tcGxldGVseSByZW1vdmUgbGluZXNcbiAgZmlsdGVyOiBmdW5jdGlvbigpIHsgcmV0dXJuIGZhbHNlOyB9LFxuICAvLyBzdHlsZXMgYXJlIGZ1bmN0aW9ucyB0aGF0IHRha2UgYSBzdHJpbmcgYW5kIHJldHVybiB0aGF0IHN0cmluZyB3aGVuIHN0eWxlZC5cbiAgc3R5bGVzOiB7XG4gICAgbWV0aG9kOiAgICAgIHBhc3N0aHJvdWdoLFxuICAgIGxvY2F0aW9uOiAgICBwYXNzdGhyb3VnaCxcbiAgICBsaW5lOiAgICAgICAgcGFzc3Rocm91Z2gsXG4gICAgY29sdW1uOiAgICAgIHBhc3N0aHJvdWdoLFxuICAgIHVuaW1wb3J0YW50OiBwYXNzdGhyb3VnaCxcbiAgfSxcbn07XG5cbi8vIEZvciBTdGFja3ktaW4tTm9kZSwgd2UgZGVmYXVsdCB0byBjb2xvcmVkIHN0YWNrcy5cbmlmICh0eXBlb2YgcmVxdWlyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICB2YXIgY2hhbGsgPSByZXF1aXJlKCdjaGFsaycpO1xuXG4gIHNjb3BlLmRlZmF1bHRzLnN0eWxlcyA9IHtcbiAgICBtZXRob2Q6ICAgICAgY2hhbGsubWFnZW50YSxcbiAgICBsb2NhdGlvbjogICAgY2hhbGsuYmx1ZSxcbiAgICBsaW5lOiAgICAgICAgY2hhbGsuY3lhbixcbiAgICBjb2x1bW46ICAgICAgY2hhbGsuY3lhbixcbiAgICB1bmltcG9ydGFudDogY2hhbGsuZGltLFxuICB9O1xufVxuXG5mdW5jdGlvbiBwcmV0dHkoc3RhY2tPclBhcnNlZCwgb3B0aW9ucykge1xuICBvcHRpb25zID0gbWVyZ2VEZWZhdWx0cyhvcHRpb25zIHx8IHt9LCBzY29wZS5kZWZhdWx0cyk7XG4gIHZhciBsaW5lcyA9IEFycmF5LmlzQXJyYXkoc3RhY2tPclBhcnNlZCkgPyBzdGFja09yUGFyc2VkIDogcGFyc2Uoc3RhY2tPclBhcnNlZCk7XG4gIGxpbmVzID0gY2xlYW4obGluZXMsIG9wdGlvbnMpO1xuXG4gIHZhciBwYWRTaXplID0gbWV0aG9kUGFkZGluZyhsaW5lcywgb3B0aW9ucyk7XG4gIHZhciBwYXJ0cyA9IGxpbmVzLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgdmFyIG1ldGhvZCAgID0gbGluZS5tZXRob2QgfHwgb3B0aW9ucy5tZXRob2RQbGFjZWhvbGRlcjtcbiAgICB2YXIgcGFkICAgICAgPSBvcHRpb25zLmluZGVudCArIHBhZGRpbmcocGFkU2l6ZSAtIG1ldGhvZC5sZW5ndGgpO1xuICAgIHZhciBsb2NhdGlvbiA9IFtcbiAgICAgIG9wdGlvbnMuc3R5bGVzLmxvY2F0aW9uKGxpbmUubG9jYXRpb24pLFxuICAgICAgb3B0aW9ucy5zdHlsZXMubGluZShsaW5lLmxpbmUpLFxuICAgICAgb3B0aW9ucy5zdHlsZXMuY29sdW1uKGxpbmUuY29sdW1uKSxcbiAgICBdLmpvaW4oJzonKTtcblxuICAgIHZhciB0ZXh0ID0gcGFkICsgb3B0aW9ucy5zdHlsZXMubWV0aG9kKG1ldGhvZCkgKyAnIGF0ICcgKyBsb2NhdGlvbjtcbiAgICBpZiAoIWxpbmUuaW1wb3J0YW50KSB7XG4gICAgICB0ZXh0ID0gb3B0aW9ucy5zdHlsZXMudW5pbXBvcnRhbnQodGV4dCk7XG4gICAgfVxuICAgIHJldHVybiB0ZXh0O1xuICB9KTtcblxuICByZXR1cm4gcGFydHMuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGNsZWFuKGxpbmVzLCBvcHRpb25zKSB7XG4gIHZhciByZXN1bHQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGxpbmU7IGxpbmUgPSBsaW5lc1tpXTsgaSsrKSB7XG4gICAgaWYgKG9wdGlvbnMuZmlsdGVyKGxpbmUpKSBjb250aW51ZTtcbiAgICBsaW5lLmxvY2F0aW9uICA9IGNsZWFuTG9jYXRpb24obGluZS5sb2NhdGlvbiwgb3B0aW9ucyk7XG4gICAgbGluZS5pbXBvcnRhbnQgPSBpc0ltcG9ydGFudChsaW5lLCBvcHRpb25zKTtcbiAgICByZXN1bHQucHVzaChsaW5lKTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8vIFV0aWxpdHlcblxuZnVuY3Rpb24gcGFzc3Rocm91Z2goc3RyaW5nKSB7XG4gIHJldHVybiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIG1lcmdlRGVmYXVsdHMob3B0aW9ucywgZGVmYXVsdHMpIHtcbiAgdmFyIHJlc3VsdCA9IE9iamVjdC5jcmVhdGUoZGVmYXVsdHMpO1xuICBPYmplY3Qua2V5cyhvcHRpb25zKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIHZhciB2YWx1ZSA9IG9wdGlvbnNba2V5XTtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgIHZhbHVlID0gbWVyZ2VEZWZhdWx0cyh2YWx1ZSwgZGVmYXVsdHNba2V5XSk7XG4gICAgfVxuICAgIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBtZXRob2RQYWRkaW5nKGxpbmVzLCBvcHRpb25zKSB7XG4gIHZhciBzaXplID0gb3B0aW9ucy5tZXRob2RQbGFjZWhvbGRlci5sZW5ndGg7XG4gIGZvciAodmFyIGkgPSAwLCBsaW5lOyBsaW5lID0gbGluZXNbaV07IGkrKykge1xuICAgIHNpemUgPSBNYXRoLm1pbihvcHRpb25zLm1heE1ldGhvZFBhZGRpbmcsIE1hdGgubWF4KHNpemUsIGxpbmUubWV0aG9kLmxlbmd0aCkpO1xuICB9XG4gIHJldHVybiBzaXplO1xufVxuXG5mdW5jdGlvbiBwYWRkaW5nKGxlbmd0aCkge1xuICB2YXIgcmVzdWx0ID0gJyc7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICByZXN1bHQgPSByZXN1bHQgKyAnICc7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gY2xlYW5Mb2NhdGlvbihsb2NhdGlvbiwgb3B0aW9ucykge1xuICBpZiAob3B0aW9ucy5sb2NhdGlvblN0cmlwKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIG1hdGNoZXI7IG1hdGNoZXIgPSBvcHRpb25zLmxvY2F0aW9uU3RyaXBbaV07IGkrKykge1xuICAgICAgbG9jYXRpb24gPSBsb2NhdGlvbi5yZXBsYWNlKG1hdGNoZXIsICcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbG9jYXRpb247XG59XG5cbmZ1bmN0aW9uIGlzSW1wb3J0YW50KGxpbmUsIG9wdGlvbnMpIHtcbiAgaWYgKG9wdGlvbnMudW5pbXBvcnRhbnRMb2NhdGlvbikge1xuICAgIGZvciAodmFyIGkgPSAwLCBtYXRjaGVyOyBtYXRjaGVyID0gb3B0aW9ucy51bmltcG9ydGFudExvY2F0aW9uW2ldOyBpKyspIHtcbiAgICAgIGlmIChsaW5lLmxvY2F0aW9uLm1hdGNoKG1hdGNoZXIpKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbnNjb3BlLmNsZWFuICA9IGNsZWFuO1xuc2NvcGUucHJldHR5ID0gcHJldHR5O1xufSkodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgPyBtb2R1bGUuZXhwb3J0cyA6ICh0aGlzLlN0YWNreSA9IHRoaXMuU3RhY2t5IHx8IHt9KSk7XG5cbiIsIi8vIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vL1xuLy8gVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4vLyBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IHBvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4vLyBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuLy8gQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc28gc3ViamVjdCB0b1xuLy8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbihmdW5jdGlvbihzY29wZSkge1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgcGFyc2UgID0gc2NvcGUucGFyc2UgIHx8IHJlcXVpcmUoJy4vcGFyc2luZycpLnBhcnNlO1xudmFyIHByZXR0eSA9IHNjb3BlLnByZXR0eSB8fCByZXF1aXJlKCcuL2Zvcm1hdHRpbmcnKS5wcmV0dHk7XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZShlcnJvciwgcHJldHR5T3B0aW9ucykge1xuICBpZiAoZXJyb3IucGFyc2VkU3RhY2spIHJldHVybiBlcnJvcjtcbiAgdmFyIG1lc3NhZ2UgPSBlcnJvci5tZXNzYWdlIHx8IGVycm9yLmRlc2NyaXB0aW9uIHx8IGVycm9yIHx8ICc8dW5rbm93biBlcnJvcj4nO1xuICB2YXIgcGFyc2VkU3RhY2sgPSBbXTtcbiAgdHJ5IHtcbiAgICBwYXJzZWRTdGFjayA9IHBhcnNlKGVycm9yLnN0YWNrIHx8IGVycm9yLnRvU3RyaW5nKCkpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIEFoIHdlbGwuXG4gIH1cblxuICBpZiAocGFyc2VkU3RhY2subGVuZ3RoID09PSAwICYmIGVycm9yLmZpbGVOYW1lKSB7XG4gICAgcGFyc2VkU3RhY2sucHVzaCh7XG4gICAgICBtZXRob2Q6ICAgJycsXG4gICAgICBsb2NhdGlvbjogZXJyb3IuZmlsZU5hbWUsXG4gICAgICBsaW5lOiAgICAgZXJyb3IubGluZU51bWJlcixcbiAgICAgIGNvbHVtbjogICBlcnJvci5jb2x1bW5OdW1iZXIsXG4gICAgfSk7XG4gIH1cblxuICB2YXIgcHJldHR5U3RhY2sgPSBtZXNzYWdlO1xuICBpZiAocGFyc2VkU3RhY2subGVuZ3RoID4gMCkge1xuICAgIHByZXR0eVN0YWNrID0gcHJldHR5U3RhY2sgKyAnXFxuJyArIHByZXR0eShwYXJzZWRTdGFjaywgcHJldHR5T3B0aW9ucyk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG1lc3NhZ2U6ICAgICBtZXNzYWdlLFxuICAgIHN0YWNrOiAgICAgICBwcmV0dHlTdGFjayxcbiAgICBwYXJzZWRTdGFjazogcGFyc2VkU3RhY2ssXG4gIH07XG59XG5cbnNjb3BlLm5vcm1hbGl6ZSA9IG5vcm1hbGl6ZTtcbn0pKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnID8gbW9kdWxlLmV4cG9ydHMgOiAodGhpcy5TdGFja3kgPSB0aGlzLlN0YWNreSB8fCB7fSkpO1xuXG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbi8qKlxuICogQGZpbGVvdmVydmlld1xuICpcbiAqIFlvdXIgZW50cnkgcG9pbnQgaW50byBgd2ViLWNvbXBvbmVudC10ZXN0ZXJgJ3MgZW52aXJvbm1lbnQgYW5kIGNvbmZpZ3VyYXRpb24uXG4gKi9cbihmdW5jdGlvbigpIHtcblxudmFyIFdDVCA9IHdpbmRvdy5XQ1QgPSB7XG4gIHJlcG9ydGVyczoge30sXG59O1xuXG4vLyBDb25maWd1cmF0aW9uXG5cbi8qKiBCeSBkZWZhdWx0LCB3ZSB3YWl0IGZvciBhbnkgd2ViIGNvbXBvbmVudCBmcmFtZXdvcmtzIHRvIGxvYWQuICovXG5XQ1Qud2FpdEZvckZyYW1ld29ya3MgPSB0cnVlO1xuXG4vKiogSG93IG1hbnkgYC5odG1sYCBzdWl0ZXMgdGhhdCBjYW4gYmUgY29uY3VycmVudGx5IGxvYWRlZCAmIHJ1bi4gKi9cbldDVC5udW1Db25jdXJyZW50U3VpdGVzID0gMTtcblxuLy8gSGVscGVyc1xuXG4vLyBFdmFsdWF0ZWQgaW4gbW9jaGEvcnVuLmpzLlxuV0NULl9zdWl0ZXNUb0xvYWQgPSBbXTtcbldDVC5fZGVwZW5kZW5jaWVzID0gW107XG5cbi8vIFVzZWQgdG8gc2hhcmUgZGF0YSBiZXR3ZWVuIHN1YlN1aXRlcyBvbiBjbGllbnQgYW5kIHJlcG9ydGVycyBvbiBzZXJ2ZXJcbldDVC5zaGFyZSA9IHt9O1xuXG4vKipcbiAqIExvYWRzIHN1aXRlcyBvZiB0ZXN0cywgc3VwcG9ydGluZyBgLmpzYCBhcyB3ZWxsIGFzIGAuaHRtbGAgZmlsZXMuXG4gKlxuICogQHBhcmFtIHshQXJyYXkuPHN0cmluZz59IGZpbGVzIFRoZSBmaWxlcyB0byBsb2FkLlxuICovXG5XQ1QubG9hZFN1aXRlcyA9IGZ1bmN0aW9uIGxvYWRTdWl0ZXMoZmlsZXMpIHtcbiAgZmlsZXMuZm9yRWFjaChmdW5jdGlvbihmaWxlKSB7XG4gICAgaWYgKGZpbGUuc2xpY2UoLTMpID09PSAnLmpzJykge1xuICAgICAgV0NULl9kZXBlbmRlbmNpZXMucHVzaChmaWxlKTtcbiAgICB9IGVsc2UgaWYgKGZpbGUuc2xpY2UoLTUpID09PSAnLmh0bWwnKSB7XG4gICAgICBXQ1QuX3N1aXRlc1RvTG9hZC5wdXNoKGZpbGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gcmVzb3VyY2UgdHlwZTogJyArIGZpbGUpO1xuICAgIH1cbiAgfSk7XG59O1xuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbldDVC51dGlsID0ge307XG5cbi8qKlxuICogQHBhcmFtIHtmdW5jdGlvbigpfSBjYWxsYmFjayBBIGZ1bmN0aW9uIHRvIGNhbGwgd2hlbiB0aGUgYWN0aXZlIHdlYiBjb21wb25lbnRcbiAqICAgICBmcmFtZXdvcmtzIGhhdmUgbG9hZGVkLlxuICovXG5XQ1QudXRpbC53aGVuRnJhbWV3b3Jrc1JlYWR5ID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgV0NULnV0aWwuZGVidWcod2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLCAnV0NULnV0aWwud2hlbkZyYW1ld29ya3NSZWFkeScpO1xuICB2YXIgZG9uZSA9IGZ1bmN0aW9uKCkge1xuICAgIFdDVC51dGlsLmRlYnVnKHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSwgJ1dDVC51dGlsLndoZW5GcmFtZXdvcmtzUmVhZHkgZG9uZScpO1xuICAgIGNhbGxiYWNrKCk7XG4gIH07XG5cbiAgZnVuY3Rpb24gaW1wb3J0c1JlYWR5KCkge1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdIVE1MSW1wb3J0c0xvYWRlZCcsIGltcG9ydHNSZWFkeSk7XG4gICAgV0NULnV0aWwuZGVidWcod2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLCAnSFRNTEltcG9ydHNMb2FkZWQnKTtcblxuICAgIGlmICh3aW5kb3cuUG9seW1lciAmJiBQb2x5bWVyLndoZW5SZWFkeSkge1xuICAgICAgUG9seW1lci53aGVuUmVhZHkoZnVuY3Rpb24oKSB7XG4gICAgICAgIFdDVC51dGlsLmRlYnVnKHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSwgJ3BvbHltZXItcmVhZHknKTtcbiAgICAgICAgZG9uZSgpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRvbmUoKTtcbiAgICB9XG4gIH1cblxuICAvLyBBbGwgb3VyIHN1cHBvcnRlZCBmcmFtZXdvcmsgY29uZmlndXJhdGlvbnMgZGVwZW5kIG9uIGltcG9ydHMuXG4gIGlmICghd2luZG93LkhUTUxJbXBvcnRzKSB7XG4gICAgZG9uZSgpO1xuICB9IGVsc2UgaWYgKEhUTUxJbXBvcnRzLnJlYWR5KSB7XG4gICAgaW1wb3J0c1JlYWR5KCk7XG4gIH0gZWxzZSB7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ0hUTUxJbXBvcnRzTG9hZGVkJywgaW1wb3J0c1JlYWR5KTtcbiAgfVxufTtcblxuLyoqXG4gKiBAcGFyYW0ge251bWJlcn0gY291bnRcbiAqIEBwYXJhbSB7c3RyaW5nfSBraW5kXG4gKiBAcmV0dXJuIHtzdHJpbmd9ICc8Y291bnQ+IDxraW5kPiB0ZXN0cycgb3IgJzxjb3VudD4gPGtpbmQ+IHRlc3QnLlxuICovXG5XQ1QudXRpbC5wbHVyYWxpemVkU3RhdCA9IGZ1bmN0aW9uIHBsdXJhbGl6ZWRTdGF0KGNvdW50LCBraW5kKSB7XG4gIGlmIChjb3VudCA9PT0gMSkge1xuICAgIHJldHVybiBjb3VudCArICcgJyArIGtpbmQgKyAnIHRlc3QnO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBjb3VudCArICcgJyArIGtpbmQgKyAnIHRlc3RzJztcbiAgfVxufTtcblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gcGF0aCBUaGUgVVJJIG9mIHRoZSBzY3JpcHQgdG8gbG9hZC5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRvbmVcbiAqL1xuV0NULnV0aWwubG9hZFNjcmlwdCA9IGZ1bmN0aW9uIGxvYWRTY3JpcHQocGF0aCwgZG9uZSkge1xuICB2YXIgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG4gIHNjcmlwdC5zcmMgPSBwYXRoICsgJz8nICsgTWF0aC5yYW5kb20oKTtcbiAgc2NyaXB0Lm9ubG9hZCA9IGRvbmUuYmluZChudWxsLCBudWxsKTtcbiAgc2NyaXB0Lm9uZXJyb3IgPSBkb25lLmJpbmQobnVsbCwgJ0ZhaWxlZCB0byBsb2FkIHNjcmlwdCAnICsgc2NyaXB0LnNyYyk7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcbn07XG5cbi8qKlxuICogQHBhcmFtIHsuLi4qfSB2YXJfYXJncyBMb2dzIHZhbHVlcyB0byB0aGUgY29uc29sZSB3aGVuIGBXQ1QuZGVidWdgIGlzIHRydWUuXG4gKi9cbldDVC51dGlsLmRlYnVnID0gZnVuY3Rpb24gZGVidWcodmFyX2FyZ3MpIHtcbiAgaWYgKCFXQ1QuZGVidWcpIHJldHVybjtcbiAgY29uc29sZS5kZWJ1Zy5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpO1xufTtcblxuLy8gVVJMIFByb2Nlc3NpbmdcblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gb3B0X3F1ZXJ5IEEgcXVlcnkgc3RyaW5nIHRvIHBhcnNlLlxuICogQHJldHVybiB7IU9iamVjdC48c3RyaW5nLCAhQXJyYXkuPHN0cmluZz4+fSBBbGwgcGFyYW1zIG9uIHRoZSBVUkwncyBxdWVyeS5cbiAqL1xuV0NULnV0aWwuZ2V0UGFyYW1zID0gZnVuY3Rpb24gZ2V0UGFyYW1zKG9wdF9xdWVyeSkge1xuICB2YXIgcXVlcnkgPSBvcHRfcXVlcnkgfHwgd2luZG93LmxvY2F0aW9uLnNlYXJjaDtcbiAgaWYgKHF1ZXJ5LnN1YnN0cmluZygwLCAxKSA9PT0gJz8nKSB7XG4gICAgcXVlcnkgPSBxdWVyeS5zdWJzdHJpbmcoMSk7XG4gIH1cbiAgLy8gcHl0aG9uJ3MgU2ltcGxlSFRUUFNlcnZlciB0YWNrcyBhIGAvYCBvbiB0aGUgZW5kIG9mIHF1ZXJ5IHN0cmluZ3MgOihcbiAgaWYgKHF1ZXJ5LnNsaWNlKC0xKSA9PT0gJy8nKSB7XG4gICAgcXVlcnkgPSBxdWVyeS5zdWJzdHJpbmcoMCwgcXVlcnkubGVuZ3RoIC0gMSk7XG4gIH1cbiAgaWYgKHF1ZXJ5ID09PSAnJykgcmV0dXJuIHt9O1xuXG4gIHZhciByZXN1bHQgPSB7fTtcbiAgcXVlcnkuc3BsaXQoJyYnKS5mb3JFYWNoKGZ1bmN0aW9uKHBhcnQpIHtcbiAgICB2YXIgcGFpciA9IHBhcnQuc3BsaXQoJz0nKTtcbiAgICBpZiAocGFpci5sZW5ndGggIT09IDIpIHtcbiAgICAgIGNvbnNvbGUud2FybignSW52YWxpZCBVUkwgcXVlcnkgcGFydDonLCBwYXJ0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIGtleSAgID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhaXJbMF0pO1xuICAgIHZhciB2YWx1ZSA9IGRlY29kZVVSSUNvbXBvbmVudChwYWlyWzFdKTtcblxuICAgIGlmICghcmVzdWx0W2tleV0pIHtcbiAgICAgIHJlc3VsdFtrZXldID0gW107XG4gICAgfVxuICAgIHJlc3VsdFtrZXldLnB1c2godmFsdWUpO1xuICB9KTtcblxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gcGFyYW0gVGhlIHBhcmFtIHRvIHJldHVybiBhIHZhbHVlIGZvci5cbiAqIEByZXR1cm4gez9zdHJpbmd9IFRoZSBmaXJzdCB2YWx1ZSBmb3IgYHBhcmFtYCwgaWYgZm91bmQuXG4gKi9cbldDVC51dGlsLmdldFBhcmFtID0gZnVuY3Rpb24gZ2V0UGFyYW0ocGFyYW0pIHtcbiAgdmFyIHBhcmFtcyA9IFdDVC51dGlsLmdldFBhcmFtcygpO1xuICByZXR1cm4gcGFyYW1zW3BhcmFtXSA/IHBhcmFtc1twYXJhbV1bMF0gOiBudWxsO1xufTtcblxuLyoqXG4gKiBAcGFyYW0geyFPYmplY3QuPHN0cmluZywgIUFycmF5LjxzdHJpbmc+Pn0gcGFyYW1zXG4gKiBAcmV0dXJuIHtzdHJpbmd9IGBwYXJhbXNgIGVuY29kZWQgYXMgYSBVUkkgcXVlcnkuXG4gKi9cbldDVC51dGlsLnBhcmFtc1RvUXVlcnkgPSBmdW5jdGlvbiBwYXJhbXNUb1F1ZXJ5KHBhcmFtcykge1xuICB2YXIgcGFpcnMgPSBbXTtcbiAgT2JqZWN0LmtleXMocGFyYW1zKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIHBhcmFtc1trZXldLmZvckVhY2goZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHBhaXJzLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KGtleSkgKyAnPScgKyBlbmNvZGVVUklDb21wb25lbnQodmFsdWUpKTtcbiAgICB9KTtcbiAgfSk7XG4gIHJldHVybiAnPycgKyBwYWlycy5qb2luKCcmJyk7XG59O1xuXG4vKiogQHJldHVybiB7c3RyaW5nfSBgbG9jYXRpb25gIHJlbGF0aXZlIHRvIHRoZSBjdXJyZW50IHdpbmRvdy4gKi9cbldDVC51dGlsLnJlbGF0aXZlTG9jYXRpb24gPSBmdW5jdGlvbiByZWxhdGl2ZUxvY2F0aW9uKGxvY2F0aW9uKSB7XG4gIHZhciBwYXRoID0gbG9jYXRpb24ucGF0aG5hbWU7XG4gIHZhciBiYXNlUGF0aCA9IHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZS5tYXRjaCgvXi4qXFwvLylbMF07XG4gIGlmIChwYXRoLmluZGV4T2YoYmFzZVBhdGgpID09PSAwKSB7XG4gICAgcGF0aCA9IHBhdGguc3Vic3RyaW5nKGJhc2VQYXRoLmxlbmd0aCk7XG4gIH1cbiAgcmV0dXJuIHBhdGg7XG59O1xuXG4vKipcbiAqIExpa2UgYGFzeW5jLnBhcmFsbGVsTGltaXRgLCBidXQgb3VyIG93biBzbyB0aGF0IHdlIGRvbid0IGZvcmNlIGEgZGVwZW5kZW5jeVxuICogb24gZG93bnN0cmVhbSBjb2RlLlxuICpcbiAqIEBwYXJhbSB7IUFycmF5LjxmdW5jdGlvbihmdW5jdGlvbigqKSk+fSBydW5uZXJzIFJ1bm5lcnMgdGhhdCBjYWxsIHRoZWlyIGdpdmVuXG4gKiAgICAgTm9kZS1zdHlsZSBjYWxsYmFjayB3aGVuIGRvbmUuXG4gKiBAcGFyYW0ge251bWJlcnxmdW5jdGlvbigqKX0gbGltaXQgTWF4aW11bSBudW1iZXIgb2YgY29uY3VycmVudCBydW5uZXJzLlxuICogICAgIChvcHRpb25hbCkuXG4gKiBAcGFyYW0gez9mdW5jdGlvbigqKX0gZG9uZSBDYWxsYmFjayB0aGF0IHNob3VsZCBiZSB0cmlnZ2VyZWQgb25jZSBhbGwgcnVubmVyc1xuICogICAgIGhhdmUgY29tcGxldGVkLCBvciBlbmNvdW50ZXJlZCBhbiBlcnJvci5cbiAqL1xuV0NULnV0aWwucGFyYWxsZWwgPSBmdW5jdGlvbiBwYXJhbGxlbChydW5uZXJzLCBsaW1pdCwgZG9uZSkge1xuICBpZiAodHlwZW9mIGxpbWl0ICE9PSAnbnVtYmVyJykge1xuICAgIGRvbmUgID0gbGltaXQ7XG4gICAgbGltaXQgPSAwO1xuICB9XG4gIGlmICghcnVubmVycy5sZW5ndGgpIHJldHVybiBkb25lKCk7XG5cbiAgdmFyIGNhbGxlZCAgICA9IGZhbHNlO1xuICB2YXIgdG90YWwgICAgID0gcnVubmVycy5sZW5ndGg7XG4gIHZhciBudW1BY3RpdmUgPSAwO1xuICB2YXIgbnVtRG9uZSAgID0gMDtcblxuICBmdW5jdGlvbiBydW5uZXJEb25lKGVycm9yKSB7XG4gICAgaWYgKGNhbGxlZCkgcmV0dXJuO1xuICAgIG51bURvbmUgPSBudW1Eb25lICsgMTtcbiAgICBudW1BY3RpdmUgPSBudW1BY3RpdmUgLSAxO1xuXG4gICAgaWYgKGVycm9yIHx8IG51bURvbmUgPj0gdG90YWwpIHtcbiAgICAgIGNhbGxlZCA9IHRydWU7XG4gICAgICBkb25lKGVycm9yKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcnVuT25lKCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcnVuT25lKCkge1xuICAgIGlmIChsaW1pdCAmJiBudW1BY3RpdmUgPj0gbGltaXQpIHJldHVybjtcbiAgICBpZiAoIXJ1bm5lcnMubGVuZ3RoKSByZXR1cm47XG4gICAgbnVtQWN0aXZlID0gbnVtQWN0aXZlICsgMTtcbiAgICBydW5uZXJzLnNoaWZ0KCkocnVubmVyRG9uZSk7XG4gIH1cbiAgcnVubmVycy5mb3JFYWNoKHJ1bk9uZSk7XG59O1xuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbldDVC5DTElTb2NrZXQgPSBDTElTb2NrZXQ7XG5cbnZhciBTT0NLRVRJT19FTkRQT0lOVCA9IHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCArICcvLycgKyB3aW5kb3cubG9jYXRpb24uaG9zdDtcbnZhciBTT0NLRVRJT19MSUJSQVJZICA9IFNPQ0tFVElPX0VORFBPSU5UICsgJy9zb2NrZXQuaW8vc29ja2V0LmlvLmpzJztcblxuLyoqXG4gKiBBIHNvY2tldCBmb3IgY29tbXVuaWNhdGlvbiBiZXR3ZWVuIHRoZSBDTEkgYW5kIGJyb3dzZXIgcnVubmVycy5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gYnJvd3NlcklkIEFuIElEIGdlbmVyYXRlZCBieSB0aGUgQ0xJIHJ1bm5lci5cbiAqIEBwYXJhbSB7IWlvLlNvY2tldH0gc29ja2V0IFRoZSBzb2NrZXQuaW8gYFNvY2tldGAgdG8gY29tbXVuaWNhdGUgb3Zlci5cbiAqL1xuZnVuY3Rpb24gQ0xJU29ja2V0KGJyb3dzZXJJZCwgc29ja2V0KSB7XG4gIHRoaXMuYnJvd3NlcklkID0gYnJvd3NlcklkO1xuICB0aGlzLnNvY2tldCAgICA9IHNvY2tldDtcbn1cblxuLyoqXG4gKiBAcGFyYW0geyFNb2NoYS5SdW5uZXJ9IHJ1bm5lciBUaGUgTW9jaGEgYFJ1bm5lcmAgdG8gb2JzZXJ2ZSwgcmVwb3J0aW5nXG4gKiAgICAgaW50ZXJlc3RpbmcgZXZlbnRzIGJhY2sgdG8gdGhlIENMSSBydW5uZXIuXG4gKi9cbkNMSVNvY2tldC5wcm90b3R5cGUub2JzZXJ2ZSA9IGZ1bmN0aW9uIG9ic2VydmUocnVubmVyKSB7XG4gIHRoaXMuZW1pdEV2ZW50KCdicm93c2VyLXN0YXJ0Jywge1xuICAgIHVybDogd2luZG93LmxvY2F0aW9uLnRvU3RyaW5nKCksXG4gIH0pO1xuXG4gIC8vIFdlIG9ubHkgZW1pdCBhIHN1YnNldCBvZiBldmVudHMgdGhhdCB3ZSBjYXJlIGFib3V0LCBhbmQgZm9sbG93IGEgbW9yZVxuICAvLyBnZW5lcmFsIGV2ZW50IGZvcm1hdCB0aGF0IGlzIGhvcGVmdWxseSBhcHBsaWNhYmxlIHRvIHRlc3QgcnVubmVycyBiZXlvbmRcbiAgLy8gbW9jaGEuXG4gIC8vXG4gIC8vIEZvciBhbGwgcG9zc2libGUgbW9jaGEgZXZlbnRzLCBzZWU6XG4gIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS92aXNpb25tZWRpYS9tb2NoYS9ibG9iL21hc3Rlci9saWIvcnVubmVyLmpzI0wzNlxuICBydW5uZXIub24oJ3Rlc3QnLCBmdW5jdGlvbih0ZXN0KSB7XG4gICAgdGhpcy5lbWl0RXZlbnQoJ3Rlc3Qtc3RhcnQnLCB7dGVzdDogZ2V0VGl0bGVzKHRlc3QpfSk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgcnVubmVyLm9uKCd0ZXN0IGVuZCcsIGZ1bmN0aW9uKHRlc3QpIHtcbiAgICB0aGlzLmVtaXRFdmVudCgndGVzdC1lbmQnLCB7XG4gICAgICBzdGF0ZTogICAgZ2V0U3RhdGUodGVzdCksXG4gICAgICB0ZXN0OiAgICAgZ2V0VGl0bGVzKHRlc3QpLFxuICAgICAgZHVyYXRpb246IHRlc3QuZHVyYXRpb24sXG4gICAgICBlcnJvcjogICAgdGVzdC5lcnIsXG4gICAgfSk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgcnVubmVyLm9uKCdzdWJTdWl0ZSBlbmQnLCBmdW5jdGlvbihzdWJTdWl0ZSkge1xuICAgIHRoaXMuZW1pdEV2ZW50KCdzdWItc3VpdGUtZW5kJywgc3ViU3VpdGUuc2hhcmUpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIHJ1bm5lci5vbignZW5kJywgZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5lbWl0RXZlbnQoJ2Jyb3dzZXItZW5kJyk7XG4gIH0uYmluZCh0aGlzKSk7XG59O1xuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBldmVudCBUaGUgbmFtZSBvZiB0aGUgZXZlbnQgdG8gZmlyZS5cbiAqIEBwYXJhbSB7Kn0gZGF0YSBBZGRpdGlvbmFsIGRhdGEgdG8gcGFzcyB3aXRoIHRoZSBldmVudC5cbiAqL1xuQ0xJU29ja2V0LnByb3RvdHlwZS5lbWl0RXZlbnQgPSBmdW5jdGlvbiBlbWl0RXZlbnQoZXZlbnQsIGRhdGEpIHtcbiAgdGhpcy5zb2NrZXQuZW1pdCgnY2xpZW50LWV2ZW50Jywge1xuICAgIGJyb3dzZXJJZDogdGhpcy5icm93c2VySWQsXG4gICAgZXZlbnQ6ICAgICBldmVudCxcbiAgICBkYXRhOiAgICAgIGRhdGEsXG4gIH0pO1xufTtcblxuLyoqXG4gKiBCdWlsZHMgYSBgQ0xJU29ja2V0YCBpZiB3ZSBhcmUgd2l0aGluIGEgQ0xJLXJ1biBlbnZpcm9ubWVudDsgc2hvcnQtY2lyY3VpdHNcbiAqIG90aGVyd2lzZS5cbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9uKCosIENMSVNvY2tldCl9IGRvbmUgTm9kZS1zdHlsZSBjYWxsYmFjay5cbiAqL1xuQ0xJU29ja2V0LmluaXQgPSBmdW5jdGlvbiBpbml0KGRvbmUpIHtcbiAgdmFyIGJyb3dzZXJJZCA9IFdDVC51dGlsLmdldFBhcmFtKCdjbGlfYnJvd3Nlcl9pZCcpO1xuICBpZiAoIWJyb3dzZXJJZCkgcmV0dXJuIGRvbmUoKTtcblxuICBXQ1QudXRpbC5sb2FkU2NyaXB0KFNPQ0tFVElPX0xJQlJBUlksIGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgaWYgKGVycm9yKSByZXR1cm4gZG9uZShlcnJvcik7XG5cbiAgICB2YXIgc29ja2V0ID0gaW8oU09DS0VUSU9fRU5EUE9JTlQpO1xuICAgIHNvY2tldC5vbignZXJyb3InLCBmdW5jdGlvbihlcnJvcikge1xuICAgICAgc29ja2V0Lm9mZigpO1xuICAgICAgZG9uZShlcnJvcik7XG4gICAgfSk7XG5cbiAgICBzb2NrZXQub24oJ2Nvbm5lY3QnLCBmdW5jdGlvbigpIHtcbiAgICAgIHNvY2tldC5vZmYoKTtcbiAgICAgIGRvbmUobnVsbCwgbmV3IENMSVNvY2tldChicm93c2VySWQsIHNvY2tldCkpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIE1pc2MgVXRpbGl0eVxuXG4vKipcbiAqIEBwYXJhbSB7IU1vY2hhLlJ1bm5hYmxlfSBydW5uYWJsZSBUaGUgdGVzdCBvciBzdWl0ZSB0byBleHRyYWN0IHRpdGxlcyBmcm9tLlxuICogQHJldHVybiB7IUFycmF5LjxzdHJpbmc+fSBUaGUgdGl0bGVzIG9mIHRoZSBydW5uYWJsZSBhbmQgaXRzIHBhcmVudHMuXG4gKi9cbmZ1bmN0aW9uIGdldFRpdGxlcyhydW5uYWJsZSkge1xuICB2YXIgdGl0bGVzID0gW107XG4gIHdoaWxlIChydW5uYWJsZSAmJiAhcnVubmFibGUucm9vdCAmJiBydW5uYWJsZS50aXRsZSkge1xuICAgIHRpdGxlcy51bnNoaWZ0KHJ1bm5hYmxlLnRpdGxlKTtcbiAgICBydW5uYWJsZSA9IHJ1bm5hYmxlLnBhcmVudDtcbiAgfVxuICByZXR1cm4gdGl0bGVzO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7IU1vY2hhLlJ1bm5hYmxlfSBydW5uYWJsZVxuICogQHJldHVybiB7c3RyaW5nfVxuICovXG5mdW5jdGlvbiBnZXRTdGF0ZShydW5uYWJsZSkge1xuICBpZiAocnVubmFibGUuc3RhdGUgPT09ICdwYXNzZWQnKSB7XG4gICAgcmV0dXJuICdwYXNzaW5nJztcbiAgfSBlbHNlIGlmIChydW5uYWJsZS5zdGF0ZSA9PSAnZmFpbGVkJykge1xuICAgIHJldHVybiAnZmFpbGluZyc7XG4gIH0gZWxzZSBpZiAocnVubmFibGUucGVuZGluZykge1xuICAgIHJldHVybiAncGVuZGluZyc7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuICd1bmtub3duJztcbiAgfVxufVxuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbi8vIFRPRE8odGhlZGVlbm8pOiBDb25zaWRlciByZW5hbWluZyBzdWJzdWl0ZS4gSUlSQywgc3ViU3VpdGUgaXMgZW50aXJlbHlcbi8vIGRpc3RpbmN0IGZyb20gbW9jaGEgc3VpdGUsIHdoaWNoIHRyaXBwZWQgbWUgdXAgYmFkbHkgd2hlbiB0cnlpbmcgdG8gYWRkXG4vLyBwbHVnaW4gc3VwcG9ydC4gUGVyaGFwcyBzb21ldGhpbmcgbGlrZSAnYmF0Y2gnLCBvciAnYnVuZGxlJy4gU29tZXRoaW5nIHRoYXRcbi8vIGhhcyBubyBtb2NoYSBjb3JyZWxhdGUuIFRoaXMgbWF5IGFsc28gZWxpbWluYXRlIHRoZSBuZWVkIGZvciByb290L25vbi1yb290XG4vLyBzdWl0ZSBkaXN0aW5jdGlvbnMuXG5cbi8qKlxuICogQSBNb2NoYSBzdWl0ZSAob3Igc3VpdGVzKSBydW4gd2l0aGluIGEgY2hpbGQgaWZyYW1lLCBidXQgcmVwb3J0ZWQgYXMgaWYgdGhleVxuICogYXJlIHBhcnQgb2YgdGhlIGN1cnJlbnQgY29udGV4dC5cbiAqL1xuZnVuY3Rpb24gU3ViU3VpdGUodXJsLCBwYXJlbnRTY29wZSkge1xuICB2YXIgcGFyYW1zID0gV0NULnV0aWwuZ2V0UGFyYW1zKHBhcmVudFNjb3BlLmxvY2F0aW9uLnNlYXJjaCk7XG4gIGRlbGV0ZSBwYXJhbXMuY2xpX2Jyb3dzZXJfaWQ7XG4gIHBhcmFtcy5idXN0ID0gW01hdGgucmFuZG9tKCldO1xuXG4gIHRoaXMudXJsICAgICAgICAgPSB1cmwgKyBXQ1QudXRpbC5wYXJhbXNUb1F1ZXJ5KHBhcmFtcyk7XG4gIHRoaXMucGFyZW50U2NvcGUgPSBwYXJlbnRTY29wZTtcblxuICB0aGlzLnN0YXRlID0gJ2luaXRpYWxpemluZyc7XG59XG5XQ1QuU3ViU3VpdGUgPSBTdWJTdWl0ZTtcblxuLy8gU3ViU3VpdGVzIGdldCBhIHByZXR0eSBnZW5lcm91cyBsb2FkIHRpbWVvdXQgYnkgZGVmYXVsdC5cblN1YlN1aXRlLmxvYWRUaW1lb3V0ID0gMzAwMDA7XG5cbi8vIFdlIGNhbid0IG1haW50YWluIHByb3BlcnRpZXMgb24gaWZyYW1lIGVsZW1lbnRzIGluIEZpcmVmb3gvU2FmYXJpLz8/Pywgc28gd2Vcbi8vIHRyYWNrIHN1YlN1aXRlcyBieSBVUkwuXG5TdWJTdWl0ZS5fYnlVcmwgPSB7fTtcblxuLyoqXG4gKiBAcmV0dXJuIHtTdWJTdWl0ZX0gVGhlIGBTdWJTdWl0ZWAgdGhhdCB3YXMgcmVnaXN0ZXJlZCBmb3IgdGhpcyB3aW5kb3cuXG4gKi9cblN1YlN1aXRlLmN1cnJlbnQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIFN1YlN1aXRlLmdldCh3aW5kb3cpO1xufTtcblxuLyoqXG4gKiBAcGFyYW0geyFXaW5kb3d9IHRhcmdldCBBIHdpbmRvdyB0byBmaW5kIHRoZSBTdWJTdWl0ZSBvZi5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gdHJhdmVyc2FsIFdoZXRoZXIgdGhpcyBpcyBhIHRyYXZlcnNhbCBmcm9tIGEgY2hpbGQgd2luZG93LlxuICogQHJldHVybiB7U3ViU3VpdGV9IFRoZSBgU3ViU3VpdGVgIHRoYXQgd2FzIHJlZ2lzdGVyZWQgZm9yIGB0YXJnZXRgLlxuICovXG5TdWJTdWl0ZS5nZXQgPSBmdW5jdGlvbih0YXJnZXQsIHRyYXZlcnNhbCkge1xuICB2YXIgc3ViU3VpdGUgPSBTdWJTdWl0ZS5fYnlVcmxbdGFyZ2V0LmxvY2F0aW9uLmhyZWZdO1xuICBpZiAoc3ViU3VpdGUpIHJldHVybiBzdWJTdWl0ZTtcbiAgaWYgKHdpbmRvdy5wYXJlbnQgPT09IHdpbmRvdykge1xuICAgIGlmICh0cmF2ZXJzYWwpIHtcbiAgICAgIC8vIEkgcmVhbGx5IGhvcGUgdGhlcmUncyBubyBsZWdpdCBjYXNlIGZvciB0aGlzLiBJbmZpbml0ZSByZWxvYWRzIGFyZSBubyBnb29kLlxuICAgICAgY29uc29sZS53YXJuKCdTdWJzdWl0ZSBsb2FkZWQgYnV0IHdhcyBuZXZlciByZWdpc3RlcmVkLiBUaGlzIG1vc3QgbGlrZWx5IGlzIGR1ZSB0byB3b25reSBoaXN0b3J5IGJlaGF2aW9yLiBSZWxvYWRpbmcuLi4nKTtcbiAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG4gIC8vIE90aGVyd2lzZSwgdHJhdmVyc2UuXG4gIHJldHVybiB3aW5kb3cucGFyZW50LldDVC5TdWJTdWl0ZS5nZXQodGFyZ2V0LCB0cnVlKTtcbn07XG5cbi8qKlxuICogTG9hZHMgYW5kIHJ1bnMgdGhlIHN1YnN1aXRlLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRvbmUgTm9kZS1zdHlsZSBjYWxsYmFjay5cbiAqL1xuU3ViU3VpdGUucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uKGRvbmUpIHtcbiAgV0NULnV0aWwuZGVidWcoJ1N1YlN1aXRlI3J1bicsIHRoaXMudXJsKTtcbiAgdGhpcy5zdGF0ZSA9ICdsb2FkaW5nJztcbiAgdGhpcy5vblJ1bkNvbXBsZXRlID0gZG9uZTtcblxuICB0aGlzLmlmcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuICB0aGlzLmlmcmFtZS5zcmMgPSB0aGlzLnVybDtcbiAgdGhpcy5pZnJhbWUuY2xhc3NMaXN0LmFkZCgnc3Vic3VpdGUnKTtcblxuICB2YXIgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N1YnN1aXRlcycpO1xuICBpZiAoIWNvbnRhaW5lcikge1xuICAgIGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGNvbnRhaW5lci5pZCA9ICdzdWJzdWl0ZXMnO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcbiAgfVxuICBjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5pZnJhbWUpO1xuXG4gIC8vIGxldCB0aGUgaWZyYW1lIGV4cGFuZCB0aGUgVVJMIGZvciB1cy5cbiAgdGhpcy51cmwgPSB0aGlzLmlmcmFtZS5zcmM7XG4gIFN1YlN1aXRlLl9ieVVybFt0aGlzLnVybF0gPSB0aGlzO1xuXG4gIHRoaXMudGltZW91dElkID0gc2V0VGltZW91dChcbiAgICAgIHRoaXMubG9hZGVkLmJpbmQodGhpcywgbmV3IEVycm9yKCdUaW1lZCBvdXQgbG9hZGluZyAnICsgdGhpcy51cmwpKSwgU3ViU3VpdGUubG9hZFRpbWVvdXQpO1xuXG4gIHRoaXMuaWZyYW1lLmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJyxcbiAgICAgIHRoaXMubG9hZGVkLmJpbmQodGhpcywgbmV3IEVycm9yKCdGYWlsZWQgdG8gbG9hZCBkb2N1bWVudCAnICsgdGhpcy51cmwpKSk7XG5cbiAgdGhpcy5pZnJhbWUuY29udGVudFdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgdGhpcy5sb2FkZWQuYmluZCh0aGlzLCBudWxsKSk7XG59O1xuXG4vKipcbiAqIENhbGxlZCB3aGVuIHRoZSBzdWIgc3VpdGUncyBpZnJhbWUgaGFzIGxvYWRlZCAob3IgZXJyb3JlZCBkdXJpbmcgbG9hZCkuXG4gKlxuICogQHBhcmFtIHsqfSBlcnJvciBUaGUgZXJyb3IgdGhhdCBvY2N1cmVkLCBpZiBhbnkuXG4gKi9cblN1YlN1aXRlLnByb3RvdHlwZS5sb2FkZWQgPSBmdW5jdGlvbihlcnJvcikge1xuICBXQ1QudXRpbC5kZWJ1ZygnU3ViU3VpdGUjbG9hZGVkJywgdGhpcy51cmwsIGVycm9yKTtcbiAgaWYgKHRoaXMudGltZW91dElkKSB7XG4gICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dElkKTtcbiAgfVxuICBpZiAoZXJyb3IpIHtcbiAgICB0aGlzLnNpZ25hbFJ1bkNvbXBsZXRlKGVycm9yKTtcbiAgICB0aGlzLmRvbmUoKTtcbiAgfVxufTtcblxuLyoqIENhbGxlZCB3aGVuIHRoZSBzdWIgc3VpdGUncyB0ZXN0cyBhcmUgY29tcGxldGUsIHNvIHRoYXQgaXQgY2FuIGNsZWFuIHVwLiAqL1xuU3ViU3VpdGUucHJvdG90eXBlLmRvbmUgPSBmdW5jdGlvbiBkb25lKCkge1xuICBXQ1QudXRpbC5kZWJ1ZygnU3ViU3VpdGUjZG9uZScsIHRoaXMudXJsLCBhcmd1bWVudHMpO1xuXG4gIC8vIFRPRE8odGhlZGVlbm8pOiBUaGlzIGNvdWxkIHByb2JhYmx5IGJlIG1vdmVkIHRvIGEgbW9yZVxuICAvLyBvYnZpb3VzIHBsYWNlLCBidXQgc2luY2UgdGhlIGlmcmFtZSBpcyBkZXN0cm95ZWQgcmlnaHQgYWZ0ZXJcbiAgLy8gdGhpcyBkb25lIGNhbGxiYWNrLCBwZXJoYXBzIHRoaXMgaXMgY3VycmVudGx5IHRoZSBtb3N0XG4gIC8vIGFwcHJvcHJpYXRlIHBsYWNlLlxuICB0aGlzLnNoYXJlID0gdGhpcy5pZnJhbWUuY29udGVudFdpbmRvdy5XQ1Quc2hhcmU7XG5cbiAgdGhpcy5zaWduYWxSdW5Db21wbGV0ZSgpO1xuXG4gIGlmICghdGhpcy5pZnJhbWUpIHJldHVybjtcbiAgdGhpcy5pZnJhbWUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLmlmcmFtZSk7XG59O1xuXG5TdWJTdWl0ZS5wcm90b3R5cGUuc2lnbmFsUnVuQ29tcGxldGUgPSBmdW5jdGlvbiBzaWduYWxSdW5Db21wbGV0ZShlcnJvcikge1xuICBpZiAoIXRoaXMub25SdW5Db21wbGV0ZSkgcmV0dXJuO1xuICB0aGlzLnN0YXRlID0gJ2NvbXBsZXRlJztcbiAgdGhpcy5vblJ1bkNvbXBsZXRlKGVycm9yKTtcbiAgdGhpcy5vblJ1bkNvbXBsZXRlID0gbnVsbDtcbn07XG5cbn0pKCk7XG4iLCIvKipcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuaHRtbCwgYm9keSB7XG4gIGhlaWdodDogMTAwJTtcbiAgd2lkdGg6ICAxMDAlO1xufVxuXG4jbW9jaGEsICNzdWJzdWl0ZXMge1xuICBoZWlnaHQ6IDEwMCU7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgdG9wOiAwO1xuICB3aWR0aDogNTAlO1xufVxuXG4jbW9jaGEge1xuICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuICBtYXJnaW46IDAgIWltcG9ydGFudDtcbiAgb3ZlcmZsb3cteTogYXV0bztcbiAgcGFkZGluZzogNjBweCA1MHB4O1xuICByaWdodDogMDtcbn1cblxuI3N1YnN1aXRlcyB7XG4gIC1tcy1mbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAtd2Via2l0LWZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gIGRpc3BsYXk6IC1tcy1mbGV4Ym94O1xuICBkaXNwbGF5OiAtd2Via2l0LWZsZXg7XG4gIGRpc3BsYXk6IGZsZXg7XG4gIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gIGxlZnQ6IDA7XG59XG5cbiNzdWJzdWl0ZXMgLnN1YnN1aXRlIHtcbiAgYm9yZGVyOiAwO1xuICB3aWR0aDogMTAwJTtcbiAgaGVpZ2h0OiAxMDAlO1xufVxuXG4jbW9jaGEgLnRlc3QucGFzcyAuZHVyYXRpb24ge1xuICBjb2xvcjogIzU1NTtcbn1cbiIsIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxNCBUaGUgUG9seW1lciBQcm9qZWN0IEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiBUaGlzIGNvZGUgbWF5IG9ubHkgYmUgdXNlZCB1bmRlciB0aGUgQlNEIHN0eWxlIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0xJQ0VOU0UudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGF1dGhvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9BVVRIT1JTLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBjb250cmlidXRvcnMgbWF5IGJlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9DT05UUklCVVRPUlMudHh0XG4gKiBDb2RlIGRpc3RyaWJ1dGVkIGJ5IEdvb2dsZSBhcyBwYXJ0IG9mIHRoZSBwb2x5bWVyIHByb2plY3QgaXMgYWxzb1xuICogc3ViamVjdCB0byBhbiBhZGRpdGlvbmFsIElQIHJpZ2h0cyBncmFudCBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vUEFURU5UUy50eHRcbiAqL1xuKGZ1bmN0aW9uKCkge1xuXG4vLyBwb2x5bWVyLXRlc3QtdG9vbHMgKGFuZCBQb2x5bWVyL3Rvb2xzKSBzdXBwb3J0IEhUTUwgdGVzdHMgd2hlcmUgZWFjaCBmaWxlIGlzXG4vLyBleHBlY3RlZCB0byBjYWxsIGBkb25lKClgLCB3aGljaCBwb3N0cyBhIG1lc3NhZ2UgdG8gdGhlIHBhcmVudCB3aW5kb3cuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gIGlmICghZXZlbnQuZGF0YSB8fCAoZXZlbnQuZGF0YSAhPT0gJ29rJyAmJiAhZXZlbnQuZGF0YS5lcnJvcikpIHJldHVybjtcbiAgdmFyIHN1YlN1aXRlID0gV0NULlN1YlN1aXRlLmdldChldmVudC5zb3VyY2UpO1xuICBpZiAoIXN1YlN1aXRlKSByZXR1cm47XG5cbiAgLy8gVGhlIG5hbWUgb2YgdGhlIHN1aXRlIGFzIGV4cG9zZWQgdG8gdGhlIHVzZXIuXG4gIHZhciBwYXRoID0gV0NULnV0aWwucmVsYXRpdmVMb2NhdGlvbihldmVudC5zb3VyY2UubG9jYXRpb24pO1xuICB2YXIgcGFyZW50UnVubmVyID0gc3ViU3VpdGUucGFyZW50U2NvcGUuV0NULl9tdWx0aVJ1bm5lcjtcbiAgcGFyZW50UnVubmVyLmVtaXRPdXRPZkJhbmRUZXN0KCdwYWdlLXdpZGUgdGVzdHMgdmlhIGdsb2JhbCBkb25lKCknLCBldmVudC5kYXRhLmVycm9yLCBwYXRoLCB0cnVlKTtcblxuICBzdWJTdWl0ZS5kb25lKCk7XG59KTtcblxuLy8gQXR0ZW1wdCB0byBlbnN1cmUgdGhhdCB3ZSBjb21wbGV0ZSBhIHRlc3Qgc3VpdGUgaWYgaXQgaXMgaW50ZXJydXB0ZWQgYnkgYVxuLy8gZG9jdW1lbnQgdW5sb2FkLlxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3VubG9hZCcsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gIC8vIE1vY2hhJ3MgaG9vayBxdWV1ZSBpcyBhc3luY2hyb25vdXM7IGJ1dCB3ZSB3YW50IHN5bmNocm9ub3VzIGJlaGF2aW9yIGlmXG4gIC8vIHdlJ3ZlIGdvdHRlbiB0byB0aGUgcG9pbnQgb2YgdW5sb2FkaW5nIHRoZSBkb2N1bWVudC5cbiAgTW9jaGEuUnVubmVyLmltbWVkaWF0ZWx5ID0gZnVuY3Rpb24oY2FsbGJhY2spIHsgY2FsbGJhY2soKTsgfTtcbn0pO1xuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbi8qKlxuICogUnVucyBgc3RlcEZuYCwgY2F0Y2hpbmcgYW55IGVycm9yIGFuZCBwYXNzaW5nIGl0IHRvIGBjYWxsYmFja2AgKE5vZGUtc3R5bGUpLlxuICogT3RoZXJ3aXNlLCBjYWxscyBgY2FsbGJhY2tgIHdpdGggbm8gYXJndW1lbnRzIG9uIHN1Y2Nlc3MuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbigpfSBjYWxsYmFja1xuICogQHBhcmFtIHtmdW5jdGlvbigpfSBzdGVwRm5cbiAqL1xud2luZG93LnNhZmVTdGVwID0gZnVuY3Rpb24gc2FmZVN0ZXAoY2FsbGJhY2ssIHN0ZXBGbikge1xuICB2YXIgZXJyO1xuICB0cnkge1xuICAgIHN0ZXBGbigpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGVyciA9IGVycm9yO1xuICB9XG4gIGNhbGxiYWNrKGVycik7XG59O1xuXG4vKipcbiAqIFJ1bnMgeW91ciB0ZXN0IGF0IGRlY2xhcmF0aW9uIHRpbWUgKGJlZm9yZSBNb2NoYSBoYXMgYmVndW4gdGVzdHMpLiBIYW5keSBmb3JcbiAqIHdoZW4geW91IG5lZWQgdG8gdGVzdCBkb2N1bWVudCBpbml0aWFsaXphdGlvbi5cbiAqXG4gKiBCZSBhd2FyZSB0aGF0IGFueSBlcnJvcnMgdGhyb3duIGFzeW5jaHJvbm91c2x5IGNhbm5vdCBiZSB0aWVkIHRvIHlvdXIgdGVzdC5cbiAqIFlvdSBtYXkgd2FudCB0byBjYXRjaCB0aGVtIGFuZCBwYXNzIHRoZW0gdG8gdGhlIGRvbmUgZXZlbnQsIGluc3RlYWQuIFNlZVxuICogYHNhZmVTdGVwYC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgdGVzdC5cbiAqIEBwYXJhbSB7ZnVuY3Rpb24oP2Z1bmN0aW9uKCkpfSB0ZXN0Rm4gVGhlIHRlc3QgZnVuY3Rpb24uIElmIGFuIGFyZ3VtZW50IGlzXG4gKiAgICAgYWNjZXB0ZWQsIHRoZSB0ZXN0IHdpbGwgYmUgdHJlYXRlZCBhcyBhc3luYywganVzdCBsaWtlIE1vY2hhIHRlc3RzLlxuICovXG53aW5kb3cudGVzdEltbWVkaWF0ZSA9IGZ1bmN0aW9uIHRlc3RJbW1lZGlhdGUobmFtZSwgdGVzdEZuKSB7XG4gIGlmICh0ZXN0Rm4ubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiB0ZXN0SW1tZWRpYXRlQXN5bmMobmFtZSwgdGVzdEZuKTtcbiAgfVxuXG4gIHZhciBlcnI7XG4gIHRyeSB7XG4gICAgdGVzdEZuKCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgZXJyID0gZXJyb3I7XG4gIH1cblxuICB0ZXN0KG5hbWUsIGZ1bmN0aW9uKGRvbmUpIHtcbiAgICBkb25lKGVycik7XG4gIH0pO1xufTtcblxuLyoqXG4gKiBBbiBhc3luYy1vbmx5IHZhcmlhbnQgb2YgYHRlc3RJbW1lZGlhdGVgLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG4gKiBAcGFyYW0ge2Z1bmN0aW9uKD9mdW5jdGlvbigpKX0gdGVzdEZuXG4gKi9cbndpbmRvdy50ZXN0SW1tZWRpYXRlQXN5bmMgPSBmdW5jdGlvbiB0ZXN0SW1tZWRpYXRlQXN5bmMobmFtZSwgdGVzdEZuKSB7XG4gIHZhciB0ZXN0Q29tcGxldGUgPSBmYWxzZTtcbiAgdmFyIGVycjtcblxuICB0ZXN0KG5hbWUsIGZ1bmN0aW9uKGRvbmUpIHtcbiAgICB2YXIgaW50ZXJ2YWxJZCA9IHNldEludGVydmFsKGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKCF0ZXN0Q29tcGxldGUpIHJldHVybjtcbiAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWxJZCk7XG4gICAgICBkb25lKGVycik7XG4gICAgfSwgMTApO1xuICB9KTtcblxuICB0cnkge1xuICAgIHRlc3RGbihmdW5jdGlvbihlcnJvcikge1xuICAgICAgaWYgKGVycm9yKSBlcnIgPSBlcnJvcjtcbiAgICAgIHRlc3RDb21wbGV0ZSA9IHRydWU7XG4gICAgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgZXJyID0gZXJyb3I7XG4gIH1cbn07XG5cbi8qKlxuICogVHJpZ2dlcnMgYSBmbHVzaCBvZiBhbnkgcGVuZGluZyBldmVudHMsIG9ic2VydmF0aW9ucywgZXRjIGFuZCBjYWxscyB5b3UgYmFja1xuICogYWZ0ZXIgdGhleSBoYXZlIGJlZW4gcHJvY2Vzc2VkLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb24oKX0gY2FsbGJhY2tcbiAqL1xud2luZG93LmZsdXNoID0gZnVuY3Rpb24gZmx1c2goY2FsbGJhY2spIHtcbiAgLy8gSWRlYWxseSwgdGhpcyBmdW5jdGlvbiB3b3VsZCBiZSBhIGNhbGwgdG8gUG9seW1lci5mbHVzaCwgYnV0IHRoYXQgZG9lc24ndFxuICAvLyBzdXBwb3J0IGEgY2FsbGJhY2sgeWV0IChodHRwczovL2dpdGh1Yi5jb20vUG9seW1lci9wb2x5bWVyLWRldi9pc3N1ZXMvMTE1KSxcbiAgLy8gLi4uYW5kIHRoZXJlJ3MgY3Jvc3MtYnJvd3NlciBmbGFraW5lc3MgdG8gZGVhbCB3aXRoLlxuXG4gIC8vIE1ha2Ugc3VyZSB0aGF0IHdlJ3JlIGludm9raW5nIHRoZSBjYWxsYmFjayB3aXRoIG5vIGFyZ3VtZW50cyBzbyB0aGF0IHRoZVxuICAvLyBjYWxsZXIgY2FuIHBhc3MgTW9jaGEgY2FsbGJhY2tzLCBldGMuXG4gIHZhciBkb25lID0gZnVuY3Rpb24gZG9uZSgpIHsgY2FsbGJhY2soKTsgfTtcblxuICAvLyBCZWNhdXNlIGVuZE9mTWljcm90YXNrIGlzIGZsYWt5IGZvciBJRSwgd2UgcGVyZm9ybSBtaWNyb3Rhc2sgY2hlY2twb2ludHNcbiAgLy8gb3Vyc2VsdmVzIChodHRwczovL2dpdGh1Yi5jb20vUG9seW1lci9wb2x5bWVyLWRldi9pc3N1ZXMvMTE0KTpcbiAgdmFyIGlzSUUgPSBuYXZpZ2F0b3IuYXBwTmFtZSA9PSAnTWljcm9zb2Z0IEludGVybmV0IEV4cGxvcmVyJztcbiAgaWYgKGlzSUUgJiYgd2luZG93LlBsYXRmb3JtICYmIHdpbmRvdy5QbGF0Zm9ybS5wZXJmb3JtTWljcm90YXNrQ2hlY2twb2ludCkge1xuICAgIHZhciByZWFsbHlEb25lID0gZG9uZTtcbiAgICBkb25lID0gZnVuY3Rpb24gZG9uZUlFKCkge1xuICAgICAgUGxhdGZvcm0ucGVyZm9ybU1pY3JvdGFza0NoZWNrcG9pbnQoKTtcbiAgICAgIHNldFRpbWVvdXQocmVhbGx5RG9uZSwgMCk7XG4gICAgfTtcbiAgfVxuXG4gIC8vIEV2ZXJ5b25lIGVsc2UgZ2V0cyBhIHJlZ3VsYXIgZmx1c2guXG4gIHZhciBzY29wZSA9IHdpbmRvdy5Qb2x5bWVyIHx8IHdpbmRvdy5XZWJDb21wb25lbnRzO1xuICBpZiAoc2NvcGUgJiYgc2NvcGUuZmx1c2gpIHtcbiAgICBzY29wZS5mbHVzaCgpO1xuICB9XG5cbiAgLy8gRW5zdXJlIHRoYXQgd2UgYXJlIGNyZWF0aW5nIGEgbmV3IF90YXNrXyB0byBhbGxvdyBhbGwgYWN0aXZlIG1pY3JvdGFza3MgdG9cbiAgLy8gZmluaXNoICh0aGUgY29kZSB5b3UncmUgdGVzdGluZyBtYXkgYmUgdXNpbmcgZW5kT2ZNaWNyb3Rhc2ssIHRvbykuXG4gIHNldFRpbWVvdXQoZG9uZSwgMCk7XG59O1xuXG4vKipcbiAqIERFUFJFQ0FURUQ6IFVzZSBgZmx1c2hgLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2tcbiAqL1xud2luZG93LmFzeW5jUGxhdGZvcm1GbHVzaCA9IGZ1bmN0aW9uIGFzeW5jUGxhdGZvcm1GbHVzaChjYWxsYmFjaykge1xuICBjb25zb2xlLndhcm4oJ2FzeW5jUGxhdGZvcm1GbHVzaCBpcyBkZXByZWNhdGVkIGluIGZhdm9yIG9mIHRoZSBtb3JlIHRlcnNlIGZsdXNoKCknKTtcbiAgcmV0dXJuIHdpbmRvdy5mbHVzaChjYWxsYmFjayk7XG59O1xuXG4vKipcbiAqXG4gKi9cbndpbmRvdy53YWl0Rm9yID0gZnVuY3Rpb24gd2FpdEZvcihmbiwgbmV4dCwgaW50ZXJ2YWxPck11dGF0aW9uRWwsIHRpbWVvdXQsIHRpbWVvdXRUaW1lKSB7XG4gIHRpbWVvdXRUaW1lID0gdGltZW91dFRpbWUgfHwgRGF0ZS5ub3coKSArICh0aW1lb3V0IHx8IDEwMDApO1xuICBpbnRlcnZhbE9yTXV0YXRpb25FbCA9IGludGVydmFsT3JNdXRhdGlvbkVsIHx8IDMyO1xuICB0cnkge1xuICAgIGZuKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBpZiAoRGF0ZS5ub3coKSA+IHRpbWVvdXRUaW1lKSB7XG4gICAgICB0aHJvdyBlO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoaXNOYU4oaW50ZXJ2YWxPck11dGF0aW9uRWwpKSB7XG4gICAgICAgIGludGVydmFsT3JNdXRhdGlvbkVsLm9uTXV0YXRpb24oaW50ZXJ2YWxPck11dGF0aW9uRWwsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHdhaXRGb3IoZm4sIG5leHQsIGludGVydmFsT3JNdXRhdGlvbkVsLCB0aW1lb3V0LCB0aW1lb3V0VGltZSk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICB3YWl0Rm9yKGZuLCBuZXh0LCBpbnRlcnZhbE9yTXV0YXRpb25FbCwgdGltZW91dCwgdGltZW91dFRpbWUpO1xuICAgICAgICB9LCBpbnRlcnZhbE9yTXV0YXRpb25FbCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG4gIG5leHQoKTtcbn07XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuV0NULk11bHRpUnVubmVyID0gTXVsdGlSdW5uZXI7XG5cbnZhciBTVEFDS1lfQ09ORklHID0ge1xuICBpbmRlbnQ6ICcgICcsXG4gIGxvY2F0aW9uU3RyaXA6IFtcbiAgICAvXmh0dHBzPzpcXC9cXC9bXlxcL10rLyxcbiAgICAvXFw/W1xcZFxcLl0rJC8sXG4gIF0sXG4gIGZpbHRlcjogZnVuY3Rpb24obGluZSkge1xuICAgIHJldHVybiBsaW5lLmxvY2F0aW9uLm1hdGNoKC93ZWItY29tcG9uZW50LXRlc3RlclxcL2Jyb3dzZXIuanMvKTtcbiAgfSxcbn07XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS92aXNpb25tZWRpYS9tb2NoYS9ibG9iL21hc3Rlci9saWIvcnVubmVyLmpzI0wzNi00NlxudmFyIE1PQ0hBX0VWRU5UUyA9IFtcbiAgJ3N0YXJ0JyxcbiAgJ2VuZCcsXG4gICdzdWl0ZScsXG4gICdzdWl0ZSBlbmQnLFxuICAndGVzdCcsXG4gICd0ZXN0IGVuZCcsXG4gICdob29rJyxcbiAgJ2hvb2sgZW5kJyxcbiAgJ3Bhc3MnLFxuICAnZmFpbCcsXG4gICdwZW5kaW5nJyxcbl07XG5cbi8vIFVudGlsIGEgc3VpdGUgaGFzIGxvYWRlZCwgd2UgYXNzdW1lIHRoaXMgbWFueSB0ZXN0cyBpbiBpdC5cbnZhciBFU1RJTUFURURfVEVTVFNfUEVSX1NVSVRFID0gMztcblxuLyoqXG4gKiBBIE1vY2hhLWxpa2UgcnVubmVyIHRoYXQgY29tYmluZXMgdGhlIG91dHB1dCBvZiBtdWx0aXBsZSBNb2NoYSBzdWl0ZXMuXG4gKlxuICogQHBhcmFtIHtudW1iZXJ9IG51bVN1aXRlcyBUaGUgbnVtYmVyIG9mIHN1aXRlcyB0aGF0IHdpbGwgYmUgcnVuLCBpbiBvcmRlciB0b1xuICogICAgIGVzdGltYXRlIHRoZSB0b3RhbCBudW1iZXIgb2YgdGVzdHMgdGhhdCB3aWxsIGJlIHBlcmZvcm1lZC5cbiAqIEBwYXJhbSB7IUFycmF5LjwhTW9jaGEucmVwb3J0ZXJzLkJhc2U+fSByZXBvcnRlcnMgVGhlIHNldCBvZiByZXBvcnRlcnMgdGhhdFxuICogICAgIHNob3VsZCByZWNlaXZlIHRoZSB1bmlmaWVkIGV2ZW50IHN0cmVhbS5cbiAqL1xuZnVuY3Rpb24gTXVsdGlSdW5uZXIobnVtU3VpdGVzLCByZXBvcnRlcnMpIHtcbiAgdGhpcy5yZXBvcnRlcnMgPSByZXBvcnRlcnMubWFwKGZ1bmN0aW9uKHJlcG9ydGVyKSB7XG4gICAgcmV0dXJuIG5ldyByZXBvcnRlcih0aGlzKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICB0aGlzLnRvdGFsID0gbnVtU3VpdGVzICogRVNUSU1BVEVEX1RFU1RTX1BFUl9TVUlURTtcbiAgLy8gTW9jaGEgcmVwb3J0ZXJzIGFzc3VtZSBhIHN0cmVhbSBvZiBldmVudHMsIHNvIHdlIGhhdmUgdG8gYmUgY2FyZWZ1bCB0byBvbmx5XG4gIC8vIHJlcG9ydCBvbiBvbmUgcnVubmVyIGF0IGEgdGltZS4uLlxuICB0aGlzLmN1cnJlbnRSdW5uZXIgPSBudWxsO1xuICAvLyAuLi53aGlsZSB3ZSBidWZmZXIgZXZlbnRzIGZvciBhbnkgb3RoZXIgYWN0aXZlIHJ1bm5lcnMuXG4gIHRoaXMucGVuZGluZ0V2ZW50cyA9IFtdO1xuXG4gIHRoaXMuZW1pdCgnc3RhcnQnKTtcbn1cbi8vIE1vY2hhIGRvZXNuJ3QgZXhwb3NlIGl0cyBgRXZlbnRFbWl0dGVyYCBzaGltIGRpcmVjdGx5LCBzbzpcbk11bHRpUnVubmVyLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoT2JqZWN0LmdldFByb3RvdHlwZU9mKE1vY2hhLlJ1bm5lci5wcm90b3R5cGUpKTtcblxuLyoqXG4gKiBAcmV0dXJuIHshTW9jaGEucmVwb3J0ZXJzLkJhc2V9IEEgcmVwb3J0ZXItbGlrZSBcImNsYXNzXCIgZm9yIGVhY2ggY2hpbGQgc3VpdGVcbiAqICAgICB0aGF0IHNob3VsZCBiZSBwYXNzZWQgdG8gYG1vY2hhLnJ1bmAuXG4gKi9cbk11bHRpUnVubmVyLnByb3RvdHlwZS5jaGlsZFJlcG9ydGVyID0gZnVuY3Rpb24gY2hpbGRSZXBvcnRlcihuYW1lKSB7XG4gIC8vIFRoZSByZXBvcnRlciBpcyB1c2VkIGFzIGEgY29uc3RydWN0b3IsIHNvIHdlIGNhbid0IGRlcGVuZCBvbiBgdGhpc2AgYmVpbmdcbiAgLy8gcHJvcGVybHkgYm91bmQuXG4gIHZhciBzZWxmID0gdGhpcztcbiAgZnVuY3Rpb24gcmVwb3J0ZXIocnVubmVyKSB7XG4gICAgcnVubmVyLm5hbWUgPSBuYW1lO1xuICAgIHNlbGYuYmluZENoaWxkUnVubmVyKHJ1bm5lcik7XG4gIH1cbiAgcmVwb3J0ZXIudGl0bGUgPSBuYW1lO1xuICByZXR1cm4gcmVwb3J0ZXI7XG59O1xuXG4vKiogTXVzdCBiZSBjYWxsZWQgb25jZSBhbGwgcnVubmVycyBoYXZlIGZpbmlzaGVkLiAqL1xuTXVsdGlSdW5uZXIucHJvdG90eXBlLmRvbmUgPSBmdW5jdGlvbiBkb25lKCkge1xuICB0aGlzLmNvbXBsZXRlID0gdHJ1ZTtcbiAgdGhpcy5lbWl0KCdlbmQnKTtcbiAgdGhpcy5mbHVzaFBlbmRpbmdFdmVudHMoKTtcbn07XG5cbi8qKlxuICogRW1pdCBhIHRvcCBsZXZlbCB0ZXN0IHRoYXQgaXMgbm90IHBhcnQgb2YgYW55IHN1aXRlIG1hbmFnZWQgYnkgdGhpcyBydW5uZXIuXG4gKlxuICogSGVscGZ1bCBmb3IgcmVwb3J0aW5nIG9uIGdsb2JhbCBlcnJvcnMsIGxvYWRpbmcgaXNzdWVzLCBldGMuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHRpdGxlIFRoZSB0aXRsZSBvZiB0aGUgdGVzdC5cbiAqIEBwYXJhbSB7Kn0gb3B0X2Vycm9yIEFuIGVycm9yIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHRlc3QuIElmIGZhbHN5LCB0ZXN0IGlzXG4gKiAgICAgY29uc2lkZXJlZCB0byBiZSBwYXNzaW5nLlxuICogQHBhcmFtIHtzdHJpbmd9IG9wdF9zdWl0ZVRpdGxlIFRpdGxlIGZvciB0aGUgc3VpdGUgdGhhdCdzIHdyYXBwaW5nIHRoZSB0ZXN0LlxuICogQHBhcmFtIHs/Ym9vbGVhbn0gb3B0X2VzdGltYXRlZCBJZiB0aGlzIHRlc3Qgd2FzIGluY2x1ZGVkIGluIHRoZSBvcmlnaW5hbFxuICogICAgIGVzdGltYXRlIG9mIGBudW1TdWl0ZXNgLlxuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUuZW1pdE91dE9mQmFuZFRlc3QgPSBmdW5jdGlvbiBlbWl0T3V0T2ZCYW5kVGVzdCh0aXRsZSwgb3B0X2Vycm9yLCBvcHRfc3VpdGVUaXRsZSwgb3B0X2VzdGltYXRlZCkge1xuICBXQ1QudXRpbC5kZWJ1ZygnTXVsdGlSdW5uZXIjZW1pdE91dE9mQmFuZFRlc3QoJywgYXJndW1lbnRzLCAnKScpO1xuICB2YXIgcm9vdCA9IG5ldyBNb2NoYS5TdWl0ZSgpO1xuICByb290LnRpdGxlID0gb3B0X3N1aXRlVGl0bGU7XG4gIHZhciB0ZXN0ID0gbmV3IE1vY2hhLlRlc3QodGl0bGUsIGZ1bmN0aW9uKCkge1xuICB9KTtcbiAgdGVzdC5wYXJlbnQgPSByb290O1xuICB0ZXN0LnN0YXRlICA9IG9wdF9lcnJvciA/ICdmYWlsZWQnIDogJ3Bhc3NlZCc7XG4gIHRlc3QuZXJyICAgID0gb3B0X2Vycm9yO1xuXG4gIGlmICghb3B0X2VzdGltYXRlZCkge1xuICAgIHRoaXMudG90YWwgPSB0aGlzLnRvdGFsICsgRVNUSU1BVEVEX1RFU1RTX1BFUl9TVUlURTtcbiAgfVxuXG4gIHZhciBydW5uZXIgPSB7dG90YWw6IDF9O1xuICB0aGlzLnByb3h5RXZlbnQoJ3N0YXJ0JywgcnVubmVyKTtcbiAgdGhpcy5wcm94eUV2ZW50KCdzdWl0ZScsIHJ1bm5lciwgcm9vdCk7XG4gIHRoaXMucHJveHlFdmVudCgndGVzdCcsIHJ1bm5lciwgdGVzdCk7XG4gIGlmIChvcHRfZXJyb3IpIHtcbiAgICB0aGlzLnByb3h5RXZlbnQoJ2ZhaWwnLCBydW5uZXIsIHRlc3QsIG9wdF9lcnJvcik7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5wcm94eUV2ZW50KCdwYXNzJywgcnVubmVyLCB0ZXN0KTtcbiAgfVxuICB0aGlzLnByb3h5RXZlbnQoJ3Rlc3QgZW5kJywgcnVubmVyLCB0ZXN0KTtcbiAgdGhpcy5wcm94eUV2ZW50KCdzdWl0ZSBlbmQnLCBydW5uZXIsIHJvb3QpO1xuICB0aGlzLnByb3h5RXZlbnQoJ2VuZCcsIHJ1bm5lcik7XG59O1xuXG4vLyBJbnRlcm5hbCBJbnRlcmZhY2VcblxuLyoqIEBwYXJhbSB7IU1vY2hhLnJ1bm5lcnMuQmFzZX0gcnVubmVyIFRoZSBydW5uZXIgdG8gbGlzdGVuIHRvIGV2ZW50cyBmb3IuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUuYmluZENoaWxkUnVubmVyID0gZnVuY3Rpb24gYmluZENoaWxkUnVubmVyKHJ1bm5lcikge1xuICBNT0NIQV9FVkVOVFMuZm9yRWFjaChmdW5jdGlvbihldmVudE5hbWUpIHtcbiAgICBydW5uZXIub24oZXZlbnROYW1lLCB0aGlzLnByb3h5RXZlbnQuYmluZCh0aGlzLCBldmVudE5hbWUsIHJ1bm5lcikpO1xuICB9LmJpbmQodGhpcykpO1xufTtcblxuLyoqXG4gKiBFdmFsdWF0ZXMgYW4gZXZlbnQgZmlyZWQgYnkgYHJ1bm5lcmAsIHByb3h5aW5nIGl0IGZvcndhcmQgb3IgYnVmZmVyaW5nIGl0LlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBldmVudE5hbWVcbiAqIEBwYXJhbSB7IU1vY2hhLnJ1bm5lcnMuQmFzZX0gcnVubmVyIFRoZSBydW5uZXIgdGhhdCBlbWl0dGVkIHRoaXMgZXZlbnQuXG4gKiBAcGFyYW0gey4uLip9IHZhcl9hcmdzIEFueSBhZGRpdGlvbmFsIGRhdGEgcGFzc2VkIGFzIHBhcnQgb2YgdGhlIGV2ZW50LlxuICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUucHJveHlFdmVudCA9IGZ1bmN0aW9uIHByb3h5RXZlbnQoZXZlbnROYW1lLCBydW5uZXIsIHZhcl9hcmdzKSB7XG4gIHZhciBleHRyYUFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICBpZiAodGhpcy5jb21wbGV0ZSkge1xuICAgIGNvbnNvbGUud2Fybignb3V0IG9mIG9yZGVyIE1vY2hhIGV2ZW50IGZvciAnICsgcnVubmVyLm5hbWUgKyAnOicsIGV2ZW50TmFtZSwgZXh0cmFBcmdzKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5jdXJyZW50UnVubmVyICYmIHJ1bm5lciAhPT0gdGhpcy5jdXJyZW50UnVubmVyKSB7XG4gICAgdGhpcy5wZW5kaW5nRXZlbnRzLnB1c2goYXJndW1lbnRzKTtcbiAgICByZXR1cm47XG4gIH1cbiAgV0NULnV0aWwuZGVidWcoJ011bHRpUnVubmVyI3Byb3h5RXZlbnQoJywgYXJndW1lbnRzLCAnKScpO1xuXG4gIC8vIFRoaXMgYXBwZWFycyB0byBiZSBhIE1vY2hhIGJ1ZzogVGVzdHMgZmFpbGVkIGJ5IHBhc3NpbmcgYW4gZXJyb3IgdG8gdGhlaXJcbiAgLy8gZG9uZSBmdW5jdGlvbiBkb24ndCBzZXQgYGVycmAgcHJvcGVybHkuXG4gIC8vXG4gIC8vIFRPRE8obmV2aXIpOiBUcmFjayBkb3duLlxuICBpZiAoZXZlbnROYW1lID09PSAnZmFpbCcgJiYgIWV4dHJhQXJnc1swXS5lcnIpIHtcbiAgICBleHRyYUFyZ3NbMF0uZXJyID0gZXh0cmFBcmdzWzFdO1xuICB9XG5cbiAgaWYgKGV2ZW50TmFtZSA9PT0gJ3N0YXJ0Jykge1xuICAgIHRoaXMub25SdW5uZXJTdGFydChydW5uZXIpO1xuICB9IGVsc2UgaWYgKGV2ZW50TmFtZSA9PT0gJ2VuZCcpIHtcbiAgICB0aGlzLm9uUnVubmVyRW5kKHJ1bm5lcik7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5jbGVhbkV2ZW50KGV2ZW50TmFtZSwgcnVubmVyLCBleHRyYUFyZ3MpO1xuICAgIHRoaXMuZW1pdC5hcHBseSh0aGlzLCBbZXZlbnROYW1lXS5jb25jYXQoZXh0cmFBcmdzKSk7XG4gIH1cbn07XG5cbi8qKlxuICogQ2xlYW5zIG9yIG1vZGlmaWVzIGFuIGV2ZW50IGlmIG5lZWRlZC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gZXZlbnROYW1lXG4gKiBAcGFyYW0geyFNb2NoYS5ydW5uZXJzLkJhc2V9IHJ1bm5lciBUaGUgcnVubmVyIHRoYXQgZW1pdHRlZCB0aGlzIGV2ZW50LlxuICogQHBhcmFtIHshQXJyYXkuPCo+fSBleHRyYUFyZ3NcbiAqL1xuTXVsdGlSdW5uZXIucHJvdG90eXBlLmNsZWFuRXZlbnQgPSBmdW5jdGlvbiBjbGVhbkV2ZW50KGV2ZW50TmFtZSwgcnVubmVyLCBleHRyYUFyZ3MpIHtcbiAgLy8gU3VpdGUgaGllcmFyY2h5XG4gIGlmIChleHRyYUFyZ3NbMF0pIHtcbiAgICBleHRyYUFyZ3NbMF0gPSB0aGlzLnNob3dSb290U3VpdGUoZXh0cmFBcmdzWzBdKTtcbiAgfVxuXG4gIC8vIE5vcm1hbGl6ZSBlcnJvcnNcbiAgaWYgKGV2ZW50TmFtZSA9PT0gJ2ZhaWwnKSB7XG4gICAgZXh0cmFBcmdzWzFdID0gU3RhY2t5Lm5vcm1hbGl6ZShleHRyYUFyZ3NbMV0sIFNUQUNLWV9DT05GSUcpO1xuICB9XG4gIGlmIChleHRyYUFyZ3NbMF0gJiYgZXh0cmFBcmdzWzBdLmVycikge1xuICAgIGV4dHJhQXJnc1swXS5lcnIgPSBTdGFja3kubm9ybWFsaXplKGV4dHJhQXJnc1swXS5lcnIsIFNUQUNLWV9DT05GSUcpO1xuICB9XG59O1xuXG4vKipcbiAqIFdlIGxpa2UgdG8gc2hvdyB0aGUgcm9vdCBzdWl0ZSdzIHRpdGxlLCB3aGljaCByZXF1aXJlcyBhIGxpdHRsZSBiaXQgb2ZcbiAqIHRyaWNrZXJ5IGluIHRoZSBzdWl0ZSBoaWVyYXJjaHkuXG4gKlxuICogQHBhcmFtIHshTW9jaGEuUnVubmFibGV9IG5vZGVcbiAqL1xuTXVsdGlSdW5uZXIucHJvdG90eXBlLnNob3dSb290U3VpdGUgPSBmdW5jdGlvbiBzaG93Um9vdFN1aXRlKG5vZGUpIHtcbiAgdmFyIGxlYWYgPSBub2RlID0gT2JqZWN0LmNyZWF0ZShub2RlKTtcbiAgd2hpbGUgKG5vZGUgJiYgIW5vZGUucm9vdCkge1xuICAgIHZhciB3cmFwcGVkUGFyZW50ID0gT2JqZWN0LmNyZWF0ZShub2RlLnBhcmVudCk7XG4gICAgbm9kZS5wYXJlbnQgPSB3cmFwcGVkUGFyZW50O1xuICAgIG5vZGUgPSB3cmFwcGVkUGFyZW50O1xuICB9XG4gIG5vZGUucm9vdCA9IGZhbHNlO1xuXG4gIHJldHVybiBsZWFmO1xufTtcblxuLyoqIEBwYXJhbSB7IU1vY2hhLnJ1bm5lcnMuQmFzZX0gcnVubmVyICovXG5NdWx0aVJ1bm5lci5wcm90b3R5cGUub25SdW5uZXJTdGFydCA9IGZ1bmN0aW9uIG9uUnVubmVyU3RhcnQocnVubmVyKSB7XG4gIFdDVC51dGlsLmRlYnVnKCdNdWx0aVJ1bm5lciNvblJ1bm5lclN0YXJ0OicsIHJ1bm5lci5uYW1lKTtcbiAgdGhpcy50b3RhbCA9IHRoaXMudG90YWwgLSBFU1RJTUFURURfVEVTVFNfUEVSX1NVSVRFICsgcnVubmVyLnRvdGFsO1xuICB0aGlzLmN1cnJlbnRSdW5uZXIgPSBydW5uZXI7XG59O1xuXG4vKiogQHBhcmFtIHshTW9jaGEucnVubmVycy5CYXNlfSBydW5uZXIgKi9cbk11bHRpUnVubmVyLnByb3RvdHlwZS5vblJ1bm5lckVuZCA9IGZ1bmN0aW9uIG9uUnVubmVyRW5kKHJ1bm5lcikge1xuICBXQ1QudXRpbC5kZWJ1ZygnTXVsdGlSdW5uZXIjb25SdW5uZXJFbmQ6JywgcnVubmVyLm5hbWUpO1xuICB0aGlzLmN1cnJlbnRSdW5uZXIgPSBudWxsO1xuICB0aGlzLmZsdXNoUGVuZGluZ0V2ZW50cygpO1xufTtcblxuLyoqXG4gKiBGbHVzaGVzIGFueSBidWZmZXJlZCBldmVudHMgYW5kIHJ1bnMgdGhlbSB0aHJvdWdoIGBwcm94eUV2ZW50YC4gVGhpcyB3aWxsXG4gKiBsb29wIHVudGlsIGFsbCBidWZmZXJlZCBydW5uZXJzIGFyZSBjb21wbGV0ZSwgb3Igd2UgaGF2ZSBydW4gb3V0IG9mIGJ1ZmZlcmVkXG4gKiBldmVudHMuXG4gKi9cbk11bHRpUnVubmVyLnByb3RvdHlwZS5mbHVzaFBlbmRpbmdFdmVudHMgPSBmdW5jdGlvbiBmbHVzaFBlbmRpbmdFdmVudHMoKSB7XG4gIHZhciBldmVudHMgPSB0aGlzLnBlbmRpbmdFdmVudHM7XG4gIHRoaXMucGVuZGluZ0V2ZW50cyA9IFtdO1xuICBldmVudHMuZm9yRWFjaChmdW5jdGlvbihldmVudEFyZ3MpIHtcbiAgICB0aGlzLnByb3h5RXZlbnQuYXBwbHkodGhpcywgZXZlbnRBcmdzKTtcbiAgfS5iaW5kKHRoaXMpKTtcbn07XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbi8qKlxuICogQGZpbGVvdmVydmlld1xuICpcbiAqIFJ1bnMgYWxsIHRlc3RzIGRlc2NyaWJlZCBieSB0aGlzIGRvY3VtZW50LCBhZnRlciBnaXZpbmcgdGhlIGRvY3VtZW50IGEgY2hhbmNlXG4gKiB0byBsb2FkLlxuICpcbiAqIElmIGBXQ1Qud2FpdEZvckZyYW1ld29ya3NgIGlzIHRydWUgKHRoZSBkZWZhdWx0KSwgd2Ugd2lsbCBhbHNvIHdhaXQgZm9yIGFueVxuICogcHJlc2VudCB3ZWIgY29tcG9uZW50IGZyYW1ld29ya3MgdG8gaGF2ZSBmdWxseSBpbml0aWFsaXplZCBhcyB3ZWxsLlxuICovXG4oZnVuY3Rpb24oKSB7XG5cbi8vIFdlIGRvIGEgYml0IG9mIG91ciBvd24gZ3JlcCBwcm9jZXNzaW5nIHRvIHNwZWVkIHRoaW5ncyB1cC5cbnZhciBncmVwID0gV0NULnV0aWwuZ2V0UGFyYW0oJ2dyZXAnKTtcblxuLy8gZW52aXJvbm1lbnQuanMgaXMgb3B0aW9uYWw7IHdlIG5lZWQgdG8gdGFrZSBhIGxvb2sgYXQgb3VyIHNjcmlwdCdzIFVSTCBpblxuLy8gb3JkZXIgdG8gZGV0ZXJtaW5lIGhvdyAob3Igbm90KSB0byBsb2FkIGl0LlxudmFyIHByZWZpeCAgPSB3aW5kb3cuV0NUUHJlZml4O1xudmFyIGxvYWRFbnYgPSAhd2luZG93LldDVFNraXBFbnZpcm9ubWVudDtcblxudmFyIHNjcmlwdHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdzY3JpcHRbc3JjKj1cImJyb3dzZXIuanNcIl0nKTtcbmlmIChzY3JpcHRzLmxlbmd0aCAhPT0gMSAmJiAhcHJlZml4KSB7XG4gIHRocm93IG5ldyBFcnJvcignVW5hYmxlIHRvIGRldGVjdCByb290IFVSTCBmb3IgV0NULiBQbGVhc2Ugc2V0IFdDVFByZWZpeCBiZWZvcmUgaW5jbHVkaW5nIGJyb3dzZXIuanMnKTtcbn1cbmlmIChzY3JpcHRzWzBdKSB7XG4gIHZhciB0aGlzU2NyaXB0ID0gc2NyaXB0c1swXS5zcmM7XG4gIHByZWZpeCAgPSB0aGlzU2NyaXB0LnN1YnN0cmluZygwLCB0aGlzU2NyaXB0LmluZGV4T2YoJ2Jyb3dzZXIuanMnKSk7XG4gIC8vIFlvdSBjYW4gdGFjayA/c2tpcEVudiBvbnRvIHRoZSBicm93c2VyIFVSTCB0byBza2lwIHRoZSBkZWZhdWx0IGVudmlyb25tZW50LlxuICBsb2FkRW52ID0gdGhpc1NjcmlwdC5pbmRleE9mKCdza2lwRW52JykgPT09IC0xO1xufVxuaWYgKGxvYWRFbnYpIHtcbiAgLy8gU3luY2hyb25vdXMgbG9hZCBzbyB0aGF0IHdlIGNhbiBndWFyYW50ZWUgaXQgaXMgc2V0IHVwIGZvciBlYXJseSB0ZXN0cy5cbiAgZG9jdW1lbnQud3JpdGUoJzxzY3JpcHQgc3JjPVwiJyArIHByZWZpeCArICdlbnZpcm9ubWVudC5qc1wiPjwvc2NyaXB0PicpOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbn1cblxuLy8gR2l2ZSBhbnkgc2NyaXB0cyBvbiB0aGUgcGFnZSBhIGNoYW5jZSB0byB0d2lkZGxlIHRoZSBlbnZpcm9ubWVudC5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBmdW5jdGlvbigpIHtcbiAgV0NULnV0aWwuZGVidWcoJ3J1biBzdGFnZTogRE9NQ29udGVudExvYWRlZCcpO1xuICB2YXIgc3ViU3VpdGUgPSBXQ1QuU3ViU3VpdGUuY3VycmVudCgpO1xuICBpZiAoc3ViU3VpdGUpIHtcbiAgICBXQ1QudXRpbC5kZWJ1ZygncnVuIHN0YWdlOiBzdWJzdWl0ZScpO1xuICAgIC8vIEdpdmUgdGhlIHN1YnN1aXRlIHRpbWUgdG8gY29tcGxldGUgaXRzIGxvYWQgKHNlZSBgU3ViU3VpdGUubG9hZGApLlxuICAgIHNldFRpbWVvdXQocnVuU3ViU3VpdGUuYmluZChudWxsLCBzdWJTdWl0ZSksIDApO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEJlZm9yZSBhbnl0aGluZyBlbHNlLCB3ZSBuZWVkIHRvIGVuc3VyZSBvdXIgY29tbXVuaWNhdGlvbiBjaGFubmVsIHdpdGggdGhlXG4gIC8vIENMSSBydW5uZXIgaXMgZXN0YWJsaXNoZWQgKGlmIHdlJ3JlIHJ1bm5pbmcgaW4gdGhhdCBjb250ZXh0KS4gTGVzc1xuICAvLyBidWZmZXJpbmcgdG8gZGVhbCB3aXRoLlxuICBXQ1QuQ0xJU29ja2V0LmluaXQoZnVuY3Rpb24oZXJyb3IsIHNvY2tldCkge1xuICAgIFdDVC51dGlsLmRlYnVnKCdydW4gc3RhZ2U6IFdDVC5DTElTb2NrZXQuaW5pdCBkb25lJywgZXJyb3IpO1xuICAgIGlmIChlcnJvcikgdGhyb3cgZXJyb3I7XG4gICAgdmFyIHN1YnN1aXRlcyA9IFdDVC5fc3VpdGVzVG9Mb2FkO1xuICAgIGlmIChncmVwKSB7XG4gICAgICB2YXIgY2xlYW5TdWJzdWl0ZXMgPSBbXTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBzdWJzdWl0ZTsgc3Vic3VpdGUgPSBzdWJzdWl0ZXNbaV07IGkrKykge1xuICAgICAgICBpZiAoc3Vic3VpdGUuaW5kZXhPZihncmVwKSA9PT0gMCkge1xuICAgICAgICAgIGNsZWFuU3Vic3VpdGVzLnB1c2goc3Vic3VpdGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBzdWJzdWl0ZXMgPSBjbGVhblN1YnN1aXRlcztcbiAgICB9XG5cbiAgICB2YXIgcnVubmVyID0gbmV3TXVsdGlTdWl0ZVJ1bm5lcihzdWJzdWl0ZXMsIGRldGVybWluZVJlcG9ydGVycyhzb2NrZXQpKTtcblxuICAgIGxvYWREZXBlbmRlbmNpZXMocnVubmVyLCBmdW5jdGlvbihlcnJvcikge1xuICAgICAgV0NULnV0aWwuZGVidWcoJ3J1biBzdGFnZTogbG9hZERlcGVuZGVuY2llcyBkb25lJywgZXJyb3IpO1xuICAgICAgaWYgKGVycm9yKSB0aHJvdyBlcnJvcjtcblxuICAgICAgcnVuTXVsdGlTdWl0ZShydW5uZXIsIHN1YnN1aXRlcyk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG5cbi8qKlxuICogTG9hZHMgYW55IGRlcGVuZGVuY2llcyBvZiB0aGUgX2N1cnJlbnRfIHN1aXRlIChlLmcuIGAuanNgIHNvdXJjZXMpLlxuICpcbiAqIEBwYXJhbSB7IVdDVC5NdWx0aVJ1bm5lcn0gcnVubmVyIFRoZSBydW5uZXIgd2hlcmUgZXJyb3JzIHNob3VsZCBiZSByZXBvcnRlZC5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRvbmUgQSBub2RlIHN0eWxlIGNhbGxiYWNrLlxuICovXG5mdW5jdGlvbiBsb2FkRGVwZW5kZW5jaWVzKHJ1bm5lciwgZG9uZSkge1xuICBXQ1QudXRpbC5kZWJ1ZygnbG9hZERlcGVuZGVuY2llczonLCBXQ1QuX2RlcGVuZGVuY2llcyk7XG5cbiAgZnVuY3Rpb24gb25FcnJvcihldmVudCkge1xuICAgIHJ1bm5lci5lbWl0T3V0T2ZCYW5kVGVzdCgnVGVzdCBTdWl0ZSBJbml0aWFsaXphdGlvbicsIGV2ZW50LmVycm9yKTtcbiAgfVxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCBvbkVycm9yKTtcblxuICB2YXIgbG9hZGVycyA9IFdDVC5fZGVwZW5kZW5jaWVzLm1hcChmdW5jdGlvbihmaWxlKSB7XG4gICAgLy8gV2Ugb25seSBzdXBwb3J0IGAuanNgIGRlcGVuZGVuY2llcyBmb3Igbm93LlxuICAgIHJldHVybiBXQ1QudXRpbC5sb2FkU2NyaXB0LmJpbmQoV0NULnV0aWwsIGZpbGUpO1xuICB9KTtcblxuICBXQ1QudXRpbC5wYXJhbGxlbChsb2FkZXJzLCBmdW5jdGlvbihlcnJvcikge1xuICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdlcnJvcicsIG9uRXJyb3IpO1xuICAgIGRvbmUoZXJyb3IpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBAcGFyYW0geyFXQ1QuU3ViU3VpdGV9IHN1YlN1aXRlIFRoZSBgU3ViU3VpdGVgIGZvciB0aGlzIGZyYW1lLCB0aGF0IGBtb2NoYWBcbiAqICAgICBzaG91bGQgYmUgcnVuIGZvci5cbiAqL1xuZnVuY3Rpb24gcnVuU3ViU3VpdGUoc3ViU3VpdGUpIHtcbiAgV0NULnV0aWwuZGVidWcoJ3J1blN1YlN1aXRlJywgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lKTtcbiAgLy8gTm90IHZlcnkgcHJldHR5LlxuICB2YXIgcGFyZW50V0NUID0gc3ViU3VpdGUucGFyZW50U2NvcGUuV0NUO1xuICB2YXIgc3VpdGVOYW1lID0gcGFyZW50V0NULnV0aWwucmVsYXRpdmVMb2NhdGlvbih3aW5kb3cubG9jYXRpb24pO1xuICB2YXIgcmVwb3J0ZXIgID0gcGFyZW50V0NULl9tdWx0aVJ1bm5lci5jaGlsZFJlcG9ydGVyKHN1aXRlTmFtZSk7XG4gIHJ1bk1vY2hhKHJlcG9ydGVyLCBzdWJTdWl0ZS5kb25lLmJpbmQoc3ViU3VpdGUpKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0geyFBcnJheS48c3RyaW5nPn0gc3Vic3VpdGVzIFRoZSBzdWJzdWl0ZXMgdGhhdCB3aWxsIGJlIHJ1bi5cbiAqIEBwYXJhbSB7IUFycmF5LjwhTW9jaGEucmVwb3J0ZXJzLkJhc2U+fSByZXBvcnRlcnMgVGhlIHJlcG9ydGVycyB0aGF0IHNob3VsZFxuICogICAgIGNvbnN1bWUgdGhlIG91dHB1dCBvZiB0aGlzIGBNdWx0aVJ1bm5lcmAuXG4gKiBAcmV0dXJuIHshV0NULk11bHRpUnVubmVyfSBUaGUgcnVubmVyIGZvciBvdXIgcm9vdCBzdWl0ZS5cbiAqL1xuZnVuY3Rpb24gbmV3TXVsdGlTdWl0ZVJ1bm5lcihzdWJzdWl0ZXMsIHJlcG9ydGVycykge1xuICBXQ1QudXRpbC5kZWJ1ZygnbmV3TXVsdGlTdWl0ZVJ1bm5lcicsIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSk7XG4gIFdDVC5fbXVsdGlSdW5uZXIgPSBuZXcgV0NULk11bHRpUnVubmVyKHN1YnN1aXRlcy5sZW5ndGggKyAxLCByZXBvcnRlcnMpO1xuICByZXR1cm4gV0NULl9tdWx0aVJ1bm5lcjtcbn1cblxuLyoqXG4gKiBAcGFyYW0geyFXQ1QuTXVsdGlSdW5uZXJ9IFRoZSBydW5uZXIgYnVpbHQgdmlhIGBuZXdNdWx0aVN1aXRlUnVubmVyYC5cbiAqIEBwYXJhbSB7IUFycmF5LjxzdHJpbmc+fSBzdWJzdWl0ZXMgVGhlIHN1YnN1aXRlcyB0byBydW4uXG4gKi9cbmZ1bmN0aW9uIHJ1bk11bHRpU3VpdGUocnVubmVyLCBzdWJzdWl0ZXMpIHtcbiAgV0NULnV0aWwuZGVidWcoJ3J1bk11bHRpU3VpdGUnLCB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUpO1xuICB2YXIgcm9vdE5hbWUgPSBXQ1QudXRpbC5yZWxhdGl2ZUxvY2F0aW9uKHdpbmRvdy5sb2NhdGlvbik7XG5cbiAgdmFyIHN1aXRlUnVubmVycyA9IFtcbiAgICAvLyBSdW4gdGhlIGxvY2FsIHRlc3RzIChpZiBhbnkpIGZpcnN0LCBub3Qgc3RvcHBpbmcgb24gZXJyb3I7XG4gICAgcnVuTW9jaGEuYmluZChudWxsLCBydW5uZXIuY2hpbGRSZXBvcnRlcihyb290TmFtZSkpLFxuICBdO1xuXG4gIC8vIEFzIHdlbGwgYXMgYW55IHN1YiBzdWl0ZXMuIEFnYWluLCBkb24ndCBzdG9wIG9uIGVycm9yLlxuICBzdWJzdWl0ZXMuZm9yRWFjaChmdW5jdGlvbihmaWxlKSB7XG4gICAgc3VpdGVSdW5uZXJzLnB1c2goZnVuY3Rpb24obmV4dCkge1xuICAgICAgdmFyIHN1YlN1aXRlID0gbmV3IFdDVC5TdWJTdWl0ZShmaWxlLCB3aW5kb3cpO1xuICAgICAgc3ViU3VpdGUucnVuKGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICAgIHJ1bm5lci5lbWl0KCdzdWJTdWl0ZSBlbmQnLCBzdWJTdWl0ZSk7XG4gICAgICAgIGlmIChlcnJvcikgcnVubmVyLmVtaXRPdXRPZkJhbmRUZXN0KGZpbGUsIGVycm9yKTtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIFdDVC51dGlsLnBhcmFsbGVsKHN1aXRlUnVubmVycywgV0NULm51bUNvbmN1cnJlbnRTdWl0ZXMsIGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgV0NULnV0aWwuZGVidWcoJ3J1bk11bHRpU3VpdGUgZG9uZScsIGVycm9yKTtcbiAgICBydW5uZXIuZG9uZSgpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBLaWNrcyBvZmYgYSBtb2NoYSBydW4sIHdhaXRpbmcgZm9yIGZyYW1ld29ya3MgdG8gbG9hZCBpZiBuZWNlc3NhcnkuXG4gKlxuICogQHBhcmFtIHshTW9jaGEucmVwb3J0ZXJzLkJhc2V9IHJlcG9ydGVyIFRoZSByZXBvcnRlciB0byBwYXNzIHRvIGBtb2NoYS5ydW5gLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gZG9uZSBBIGNhbGxiYWNrIGZpcmVkLCBfbm8gZXJyb3IgaXMgcGFzc2VkXy5cbiAqL1xuZnVuY3Rpb24gcnVuTW9jaGEocmVwb3J0ZXIsIGRvbmUsIHdhaXRlZCkge1xuICBpZiAoV0NULndhaXRGb3JGcmFtZXdvcmtzICYmICF3YWl0ZWQpIHtcbiAgICBXQ1QudXRpbC53aGVuRnJhbWV3b3Jrc1JlYWR5KHJ1bk1vY2hhLmJpbmQobnVsbCwgcmVwb3J0ZXIsIGRvbmUsIHRydWUpKTtcbiAgICByZXR1cm47XG4gIH1cbiAgV0NULnV0aWwuZGVidWcoJ3J1bk1vY2hhJywgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lKTtcblxuICBtb2NoYS5yZXBvcnRlcihyZXBvcnRlcik7XG4gIG1vY2hhLnN1aXRlLnRpdGxlID0gcmVwb3J0ZXIudGl0bGU7XG4gIG1vY2hhLmdyZXAoZ3JlcCk7XG5cbiAgLy8gV2UgY2FuJ3QgdXNlIGBtb2NoYS5ydW5gIGJlY2F1c2UgaXQgYmFzaGVzIG92ZXIgZ3JlcCwgaW52ZXJ0LCBhbmQgZnJpZW5kcy5cbiAgLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS92aXNpb25tZWRpYS9tb2NoYS9ibG9iL21hc3Rlci9zdXBwb3J0L3RhaWwuanMjTDEzN1xuICB2YXIgcnVubmVyID0gTW9jaGEucHJvdG90eXBlLnJ1bi5jYWxsKG1vY2hhLCBmdW5jdGlvbihlcnJvcikge1xuICAgIE1vY2hhLnV0aWxzLmhpZ2hsaWdodFRhZ3MoJ2NvZGUnKTtcbiAgICBkb25lKCk7ICAvLyBXZSBpZ25vcmUgdGhlIE1vY2hhIGZhaWx1cmUgY291bnQuXG4gIH0pO1xuXG4gIC8vIE1vY2hhJ3MgZGVmYXVsdCBgb25lcnJvcmAgaGFuZGxpbmcgc3RyaXBzIHRoZSBzdGFjayAodG8gc3VwcG9ydCByZWFsbHkgb2xkXG4gIC8vIGJyb3dzZXJzKS4gV2UgdXBncmFkZSB0aGlzIHRvIGdldCBiZXR0ZXIgc3RhY2tzIGZvciBhc3luYyBlcnJvcnMuXG4gIC8vXG4gIC8vIFRPRE8obmV2aXIpOiBDYW4gd2UgZXhwYW5kIHN1cHBvcnQgdG8gb3RoZXIgYnJvd3NlcnM/XG4gIGlmIChuYXZpZ2F0b3IudXNlckFnZW50Lm1hdGNoKC9jaHJvbWUvaSkpIHtcbiAgICB3aW5kb3cub25lcnJvciA9IG51bGw7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgIGlmICghZXZlbnQuZXJyb3IpIHJldHVybjtcbiAgICAgIGlmIChldmVudC5lcnJvci5pZ25vcmUpIHJldHVybjtcbiAgICAgIHJ1bm5lci51bmNhdWdodChldmVudC5lcnJvcik7XG4gICAgfSk7XG4gIH1cbn1cblxuLyoqXG4gKiBGaWd1cmUgb3V0IHdoaWNoIHJlcG9ydGVycyBzaG91bGQgYmUgdXNlZCBmb3IgdGhlIGN1cnJlbnQgYHdpbmRvd2AuXG4gKlxuICogQHBhcmFtIHtXQ1QuQ0xJU29ja2V0fSBzb2NrZXQgVGhlIENMSSBzb2NrZXQsIGlmIHByZXNlbnQuXG4gKi9cbmZ1bmN0aW9uIGRldGVybWluZVJlcG9ydGVycyhzb2NrZXQpIHtcbiAgdmFyIHJlcG9ydGVycyA9IFtcbiAgICBXQ1QucmVwb3J0ZXJzLlRpdGxlLFxuICAgIFdDVC5yZXBvcnRlcnMuQ29uc29sZSxcbiAgXTtcblxuICBpZiAoc29ja2V0KSB7XG4gICAgcmVwb3J0ZXJzLnB1c2goZnVuY3Rpb24ocnVubmVyKSB7XG4gICAgICBzb2NrZXQub2JzZXJ2ZShydW5uZXIpO1xuICAgIH0pO1xuICB9XG5cbiAgaWYgKFdDVC5fc3VpdGVzVG9Mb2FkLmxlbmd0aCA+IDAgfHwgV0NULl9kZXBlbmRlbmNpZXMubGVuZ3RoID4gMCkge1xuICAgIHJlcG9ydGVycy5wdXNoKFdDVC5yZXBvcnRlcnMuSFRNTCk7XG4gIH1cblxuICByZXR1cm4gcmVwb3J0ZXJzO1xufVxuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4vKipcbiAqIEBmaWxlb3ZlcnZpZXdcbiAqXG4gKiBQcm92aWRlcyBhdXRvbWF0aWMgY29uZmlndXJhdGlvbiBvZiBNb2NoYSBieSBzdHViYmluZyBvdXQgcG90ZW50aWFsIE1vY2hhXG4gKiBtZXRob2RzLCBhbmQgY29uZmlndXJpbmcgTW9jaGEgYXBwcm9wcmlhdGVseSBvbmNlIHlvdSBjYWxsIHRoZW0uXG4gKlxuICogSnVzdCBjYWxsIGBzdWl0ZWAsIGBkZXNjcmliZWAsIGV0YyBub3JtYWxseSwgYW5kIGV2ZXJ5dGhpbmcgc2hvdWxkIEp1c3QgV29yay5cbiAqL1xuKGZ1bmN0aW9uKCkge1xuXG4vLyBNb2NoYSBnbG9iYWwgaGVscGVycywgYnJva2VuIG91dCBieSB0ZXN0aW5nIG1ldGhvZC5cbnZhciBNT0NIQV9FWFBPUlRTID0ge1xuICAvLyBodHRwczovL2dpdGh1Yi5jb20vdmlzaW9ubWVkaWEvbW9jaGEvYmxvYi9tYXN0ZXIvbGliL2ludGVyZmFjZXMvdGRkLmpzXG4gIHRkZDogW1xuICAgICdzZXR1cCcsXG4gICAgJ3RlYXJkb3duJyxcbiAgICAnc3VpdGVTZXR1cCcsXG4gICAgJ3N1aXRlVGVhcmRvd24nLFxuICAgICdzdWl0ZScsXG4gICAgJ3Rlc3QnLFxuICBdLFxuICAvLyBodHRwczovL2dpdGh1Yi5jb20vdmlzaW9ubWVkaWEvbW9jaGEvYmxvYi9tYXN0ZXIvbGliL2ludGVyZmFjZXMvdGRkLmpzXG4gIGJkZDogW1xuICAgICdiZWZvcmUnLFxuICAgICdhZnRlcicsXG4gICAgJ2JlZm9yZUVhY2gnLFxuICAgICdhZnRlckVhY2gnLFxuICAgICdkZXNjcmliZScsXG4gICAgJ3hkZXNjcmliZScsXG4gICAgJ3hjb250ZXh0JyxcbiAgICAnaXQnLFxuICAgICd4aXQnLFxuICAgICd4c3BlY2lmeScsXG4gIF0sXG59O1xuXG4vLyBXZSBleHBvc2UgYWxsIE1vY2hhIG1ldGhvZHMgdXAgZnJvbnQsIGNvbmZpZ3VyaW5nIGFuZCBydW5uaW5nIG1vY2hhXG4vLyBhdXRvbWF0aWNhbGx5IHdoZW4geW91IGNhbGwgdGhlbS5cbi8vXG4vLyBUaGUgYXNzdW1wdGlvbiBpcyB0aGF0IGl0IGlzIGEgb25lLW9mZiAoc3ViLSlzdWl0ZSBvZiB0ZXN0cyBiZWluZyBydW4uXG5PYmplY3Qua2V5cyhNT0NIQV9FWFBPUlRTKS5mb3JFYWNoKGZ1bmN0aW9uKHVpKSB7XG4gIE1PQ0hBX0VYUE9SVFNbdWldLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgd2luZG93W2tleV0gPSBmdW5jdGlvbiB3cmFwcGVkTW9jaGFGdW5jdGlvbigpIHtcbiAgICAgIFdDVC5zZXR1cE1vY2hhKHVpKTtcbiAgICAgIGlmICghd2luZG93W2tleV0gfHwgd2luZG93W2tleV0gPT09IHdyYXBwZWRNb2NoYUZ1bmN0aW9uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgbW9jaGEuc2V0dXAgdG8gZGVmaW5lICcgKyBrZXkpO1xuICAgICAgfVxuICAgICAgd2luZG93W2tleV0uYXBwbHkod2luZG93LCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH0pO1xufSk7XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IHVpIFNldHMgdXAgbW9jaGEgdG8gcnVuIGB1aWAtc3R5bGUgdGVzdHMuXG4gKi9cbldDVC5zZXR1cE1vY2hhID0gZnVuY3Rpb24gc2V0dXBNb2NoYSh1aSkge1xuICBpZiAoV0NULl9tb2NoYVVJICYmIFdDVC5fbW9jaGFVSSA9PT0gdWkpIHJldHVybjtcbiAgaWYgKFdDVC5fbW9jaGFVSSAmJiBXQ1QuX21vY2hhVUkgIT09IHVpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNaXhpbmcgJyArIFdDVC5fbW9jaGFVSSArICcgYW5kICcgKyB1aSArICcgTW9jaGEgc3R5bGVzIGlzIG5vdCBzdXBwb3J0ZWQuJyk7XG4gIH1cbiAgbW9jaGEuc2V0dXAoe3VpOiB1aSwgdGltZW91dDogNjAgKiAxMDAwfSk7ICAvLyBOb3RlIHRoYXQgdGhlIHJlcG9ydGVyIGlzIGNvbmZpZ3VyZWQgaW4gcnVuLmpzLlxuICBXQ1QubW9jaGFJc1NldHVwID0gdHJ1ZTtcbn07XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuV0NULnJlcG9ydGVycy5Db25zb2xlID0gQ29uc29sZTtcblxuLy8gV2UgY2FwdHVyZSBjb25zb2xlIGV2ZW50cyB3aGVuIHJ1bm5pbmcgdGVzdHM7IHNvIG1ha2Ugc3VyZSB3ZSBoYXZlIGFcbi8vIHJlZmVyZW5jZSB0byB0aGUgb3JpZ2luYWwgb25lLlxudmFyIGNvbnNvbGUgPSB3aW5kb3cuY29uc29sZTtcblxudmFyIEZPTlQgPSAnO2ZvbnQ6IG5vcm1hbCAxM3B4IFwiUm9ib3RvXCIsIFwiSGVsdmV0aWNhIE5ldWVcIiwgXCJIZWx2ZXRpY2FcIiwgc2Fucy1zZXJpZjsnO1xudmFyIFNUWUxFUyA9IHtcbiAgcGxhaW46ICAgRk9OVCxcbiAgc3VpdGU6ICAgJ2NvbG9yOiAjNWM2YmMwJyArIEZPTlQsXG4gIHRlc3Q6ICAgIEZPTlQsXG4gIHBhc3Npbmc6ICdjb2xvcjogIzI1OWIyNCcgKyBGT05ULFxuICBwZW5kaW5nOiAnY29sb3I6ICNlNjUxMDAnICsgRk9OVCxcbiAgZmFpbGluZzogJ2NvbG9yOiAjYzQxNDExJyArIEZPTlQsXG4gIHN0YWNrOiAgICdjb2xvcjogI2M0MTQxMScsXG4gIHJlc3VsdHM6IEZPTlQgKyAnZm9udC1zaXplOiAxNnB4Jyxcbn07XG5cbi8vIEkgZG9uJ3QgdGhpbmsgd2UgY2FuIGZlYXR1cmUgZGV0ZWN0IHRoaXMgb25lLi4uXG52YXIgdXNlckFnZW50ID0gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpO1xudmFyIENBTl9TVFlMRV9MT0cgICA9IHVzZXJBZ2VudC5tYXRjaCgnZmlyZWZveCcpIHx8IHVzZXJBZ2VudC5tYXRjaCgnd2Via2l0Jyk7XG52YXIgQ0FOX1NUWUxFX0dST1VQID0gdXNlckFnZW50Lm1hdGNoKCd3ZWJraXQnKTtcbi8vIFRyYWNrIHRoZSBpbmRlbnQgZm9yIGZha2VkIGBjb25zb2xlLmdyb3VwYFxudmFyIGxvZ0luZGVudCA9ICcnO1xuXG5mdW5jdGlvbiBsb2codGV4dCwgc3R5bGUpIHtcbiAgdGV4dCA9IHRleHQuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsKSB7IHJldHVybiBsb2dJbmRlbnQgKyBsOyB9KS5qb2luKCdcXG4nKTtcbiAgaWYgKENBTl9TVFlMRV9MT0cpIHtcbiAgICBjb25zb2xlLmxvZygnJWMnICsgdGV4dCwgU1RZTEVTW3N0eWxlXSB8fCBTVFlMRVMucGxhaW4pO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKHRleHQpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGxvZ0dyb3VwKHRleHQsIHN0eWxlKSB7XG4gIGlmIChDQU5fU1RZTEVfR1JPVVApIHtcbiAgICBjb25zb2xlLmdyb3VwKCclYycgKyB0ZXh0LCBTVFlMRVNbc3R5bGVdIHx8IFNUWUxFUy5wbGFpbik7XG4gIH0gZWxzZSBpZiAoY29uc29sZS5ncm91cCkge1xuICAgIGNvbnNvbGUuZ3JvdXAodGV4dCk7XG4gIH0gZWxzZSB7XG4gICAgbG9nSW5kZW50ID0gbG9nSW5kZW50ICsgJyAgJztcbiAgICBsb2codGV4dCwgc3R5bGUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGxvZ0dyb3VwRW5kKCkge1xuICBpZiAoY29uc29sZS5ncm91cEVuZCkge1xuICAgIGNvbnNvbGUuZ3JvdXBFbmQoKTtcbiAgfSBlbHNlIHtcbiAgICBsb2dJbmRlbnQgPSBsb2dJbmRlbnQuc3Vic3RyKDAsIGxvZ0luZGVudC5sZW5ndGggLSAyKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBsb2dFeGNlcHRpb24oZXJyb3IpIHtcbiAgbG9nKGVycm9yLnN0YWNrIHx8IGVycm9yLm1lc3NhZ2UgfHwgZXJyb3IsICdzdGFjaycpO1xufVxuXG4vKipcbiAqIEEgTW9jaGEgcmVwb3J0ZXIgdGhhdCBsb2dzIHJlc3VsdHMgb3V0IHRvIHRoZSB3ZWIgYGNvbnNvbGVgLlxuICpcbiAqIEBwYXJhbSB7IU1vY2hhLlJ1bm5lcn0gcnVubmVyIFRoZSBydW5uZXIgdGhhdCBpcyBiZWluZyByZXBvcnRlZCBvbi5cbiAqL1xuZnVuY3Rpb24gQ29uc29sZShydW5uZXIpIHtcbiAgTW9jaGEucmVwb3J0ZXJzLkJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHJ1bm5lci5vbignc3VpdGUnLCBmdW5jdGlvbihzdWl0ZSkge1xuICAgIGlmIChzdWl0ZS5yb290KSByZXR1cm47XG4gICAgbG9nR3JvdXAoc3VpdGUudGl0bGUsICdzdWl0ZScpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIHJ1bm5lci5vbignc3VpdGUgZW5kJywgZnVuY3Rpb24oc3VpdGUpIHtcbiAgICBpZiAoc3VpdGUucm9vdCkgcmV0dXJuO1xuICAgIGxvZ0dyb3VwRW5kKCk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgcnVubmVyLm9uKCd0ZXN0JywgZnVuY3Rpb24odGVzdCkge1xuICAgIGxvZ0dyb3VwKHRlc3QudGl0bGUsICd0ZXN0Jyk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgcnVubmVyLm9uKCdwZW5kaW5nJywgZnVuY3Rpb24odGVzdCkge1xuICAgIGxvZ0dyb3VwKHRlc3QudGl0bGUsICdwZW5kaW5nJyk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgcnVubmVyLm9uKCdmYWlsJywgZnVuY3Rpb24odGVzdCwgZXJyb3IpIHtcbiAgICBsb2dFeGNlcHRpb24oZXJyb3IpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIHJ1bm5lci5vbigndGVzdCBlbmQnLCBmdW5jdGlvbih0ZXN0KSB7XG4gICAgbG9nR3JvdXBFbmQoKTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICBydW5uZXIub24oJ2VuZCcsIHRoaXMubG9nU3VtbWFyeS5iaW5kKHRoaXMpKTtcbn1cbkNvbnNvbGUucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShNb2NoYS5yZXBvcnRlcnMuQmFzZS5wcm90b3R5cGUpO1xuXG4vKiogUHJpbnRzIG91dCBhIGZpbmFsIHN1bW1hcnkgb2YgdGVzdCByZXN1bHRzLiAqL1xuQ29uc29sZS5wcm90b3R5cGUubG9nU3VtbWFyeSA9IGZ1bmN0aW9uIGxvZ1N1bW1hcnkoKSB7XG4gIGxvZ0dyb3VwKCdUZXN0IFJlc3VsdHMnLCAncmVzdWx0cycpO1xuXG4gIGlmICh0aGlzLnN0YXRzLmZhaWx1cmVzID4gMCkge1xuICAgIGxvZyhXQ1QudXRpbC5wbHVyYWxpemVkU3RhdCh0aGlzLnN0YXRzLmZhaWx1cmVzLCAnZmFpbGluZycpLCAnZmFpbGluZycpO1xuICB9XG4gIGlmICh0aGlzLnN0YXRzLnBlbmRpbmcgPiAwKSB7XG4gICAgbG9nKFdDVC51dGlsLnBsdXJhbGl6ZWRTdGF0KHRoaXMuc3RhdHMucGVuZGluZywgJ3BlbmRpbmcnKSwgJ3BlbmRpbmcnKTtcbiAgfVxuICBsb2coV0NULnV0aWwucGx1cmFsaXplZFN0YXQodGhpcy5zdGF0cy5wYXNzZXMsICdwYXNzaW5nJykpO1xuXG4gIGlmICghdGhpcy5zdGF0cy5mYWlsdXJlcykge1xuICAgIGxvZygndGVzdCBzdWl0ZSBwYXNzZWQnLCAncGFzc2luZycpO1xuICB9XG4gIGxvZygnRXZhbHVhdGVkICcgKyB0aGlzLnN0YXRzLnRlc3RzICsgJyB0ZXN0cyBpbiAnICsgdGhpcy5zdGF0cy5kdXJhdGlvbiArICdtcy4nKTtcbiAgbG9nR3JvdXBFbmQoKTtcbn07XG5cbn0pKCk7XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgVGhlIFBvbHltZXIgUHJvamVjdCBBdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogVGhpcyBjb2RlIG1heSBvbmx5IGJlIHVzZWQgdW5kZXIgdGhlIEJTRCBzdHlsZSBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9MSUNFTlNFLnR4dFxuICogVGhlIGNvbXBsZXRlIHNldCBvZiBhdXRob3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQVVUSE9SUy50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgY29udHJpYnV0b3JzIG1heSBiZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vQ09OVFJJQlVUT1JTLnR4dFxuICogQ29kZSBkaXN0cmlidXRlZCBieSBHb29nbGUgYXMgcGFydCBvZiB0aGUgcG9seW1lciBwcm9qZWN0IGlzIGFsc29cbiAqIHN1YmplY3QgdG8gYW4gYWRkaXRpb25hbCBJUCByaWdodHMgZ3JhbnQgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL1BBVEVOVFMudHh0XG4gKi9cbihmdW5jdGlvbigpIHtcblxuV0NULnJlcG9ydGVycy5IVE1MID0gSFRNTDtcblxuLyoqXG4gKiBXQ1Qtc3BlY2lmaWMgYmVoYXZpb3Igb24gdG9wIG9mIE1vY2hhJ3MgZGVmYXVsdCBIVE1MIHJlcG9ydGVyLlxuICpcbiAqIEBwYXJhbSB7IU1vY2hhLlJ1bm5lcn0gcnVubmVyIFRoZSBydW5uZXIgdGhhdCBpcyBiZWluZyByZXBvcnRlZCBvbi5cbiAqL1xuZnVuY3Rpb24gSFRNTChydW5uZXIpIHtcbiAgdmFyIG91dHB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBvdXRwdXQuaWQgPSAnbW9jaGEnO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG91dHB1dCk7XG5cbiAgcnVubmVyLm9uKCdzdWl0ZScsIGZ1bmN0aW9uKHRlc3QpIHtcbiAgICB0aGlzLnRvdGFsID0gcnVubmVyLnRvdGFsO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIE1vY2hhLnJlcG9ydGVycy5IVE1MLmNhbGwodGhpcywgcnVubmVyKTtcbn1cbkhUTUwucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShNb2NoYS5yZXBvcnRlcnMuSFRNTC5wcm90b3R5cGUpO1xuXG59KSgpO1xuIiwiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE0IFRoZSBQb2x5bWVyIFByb2plY3QgQXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFRoaXMgY29kZSBtYXkgb25seSBiZSB1c2VkIHVuZGVyIHRoZSBCU0Qgc3R5bGUgbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vcG9seW1lci5naXRodWIuaW8vTElDRU5TRS50eHRcbiAqIFRoZSBjb21wbGV0ZSBzZXQgb2YgYXV0aG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0FVVEhPUlMudHh0XG4gKiBUaGUgY29tcGxldGUgc2V0IG9mIGNvbnRyaWJ1dG9ycyBtYXkgYmUgZm91bmQgYXQgaHR0cDovL3BvbHltZXIuZ2l0aHViLmlvL0NPTlRSSUJVVE9SUy50eHRcbiAqIENvZGUgZGlzdHJpYnV0ZWQgYnkgR29vZ2xlIGFzIHBhcnQgb2YgdGhlIHBvbHltZXIgcHJvamVjdCBpcyBhbHNvXG4gKiBzdWJqZWN0IHRvIGFuIGFkZGl0aW9uYWwgSVAgcmlnaHRzIGdyYW50IGZvdW5kIGF0IGh0dHA6Ly9wb2x5bWVyLmdpdGh1Yi5pby9QQVRFTlRTLnR4dFxuICovXG4oZnVuY3Rpb24oKSB7XG5cbldDVC5yZXBvcnRlcnMuVGl0bGUgPSBUaXRsZTtcblxudmFyIEFSQ19PRkZTRVQgPSAwOyAvLyBzdGFydCBhdCB0aGUgcmlnaHQuXG52YXIgQVJDX1dJRFRIICA9IDY7XG5cbi8qKlxuICogQSBNb2NoYSByZXBvcnRlciB0aGF0IHVwZGF0ZXMgdGhlIGRvY3VtZW50J3MgdGl0bGUgYW5kIGZhdmljb24gd2l0aFxuICogYXQtYS1nbGFuY2Ugc3RhdHMuXG4gKlxuICogQHBhcmFtIHshTW9jaGEuUnVubmVyfSBydW5uZXIgVGhlIHJ1bm5lciB0aGF0IGlzIGJlaW5nIHJlcG9ydGVkIG9uLlxuICovXG5mdW5jdGlvbiBUaXRsZShydW5uZXIpIHtcbiAgTW9jaGEucmVwb3J0ZXJzLkJhc2UuY2FsbCh0aGlzLCBydW5uZXIpO1xuXG4gIHJ1bm5lci5vbigndGVzdCBlbmQnLCB0aGlzLnJlcG9ydC5iaW5kKHRoaXMpKTtcbn1cblxuLyoqIFJlcG9ydHMgY3VycmVudCBzdGF0cyB2aWEgdGhlIHBhZ2UgdGl0bGUgYW5kIGZhdmljb24uICovXG5UaXRsZS5wcm90b3R5cGUucmVwb3J0ID0gZnVuY3Rpb24gcmVwb3J0KCkge1xuICB0aGlzLnVwZGF0ZVRpdGxlKCk7XG4gIHRoaXMudXBkYXRlRmF2aWNvbigpO1xufTtcblxuLyoqIFVwZGF0ZXMgdGhlIGRvY3VtZW50IHRpdGxlIHdpdGggYSBzdW1tYXJ5IG9mIGN1cnJlbnQgc3RhdHMuICovXG5UaXRsZS5wcm90b3R5cGUudXBkYXRlVGl0bGUgPSBmdW5jdGlvbiB1cGRhdGVUaXRsZSgpIHtcbiAgaWYgKHRoaXMuc3RhdHMuZmFpbHVyZXMgPiAwKSB7XG4gICAgZG9jdW1lbnQudGl0bGUgPSBXQ1QudXRpbC5wbHVyYWxpemVkU3RhdCh0aGlzLnN0YXRzLmZhaWx1cmVzLCAnZmFpbGluZycpO1xuICB9IGVsc2Uge1xuICAgIGRvY3VtZW50LnRpdGxlID0gV0NULnV0aWwucGx1cmFsaXplZFN0YXQodGhpcy5zdGF0cy5wYXNzZXMsICdwYXNzaW5nJyk7XG4gIH1cbn07XG5cbi8qKlxuICogRHJhd3MgYW4gYXJjIGZvciB0aGUgZmF2aWNvbiBzdGF0dXMsIHJlbGF0aXZlIHRvIHRoZSB0b3RhbCBudW1iZXIgb2YgdGVzdHMuXG4gKlxuICogQHBhcmFtIHshQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEfSBjb250ZXh0XG4gKiBAcGFyYW0ge251bWJlcn0gdG90YWxcbiAqIEBwYXJhbSB7bnVtYmVyfSBzdGFydFxuICogQHBhcmFtIHtudW1iZXJ9IGxlbmd0aFxuICogQHBhcmFtIHtzdHJpbmd9IGNvbG9yXG4gKi9cbmZ1bmN0aW9uIGRyYXdGYXZpY29uQXJjKGNvbnRleHQsIHRvdGFsLCBzdGFydCwgbGVuZ3RoLCBjb2xvcikge1xuICB2YXIgYXJjU3RhcnQgPSBBUkNfT0ZGU0VUICsgTWF0aC5QSSAqIDIgKiAoc3RhcnQgLyB0b3RhbCk7XG4gIHZhciBhcmNFbmQgICA9IEFSQ19PRkZTRVQgKyBNYXRoLlBJICogMiAqICgoc3RhcnQgKyBsZW5ndGgpIC8gdG90YWwpO1xuXG4gIGNvbnRleHQuYmVnaW5QYXRoKCk7XG4gIGNvbnRleHQuc3Ryb2tlU3R5bGUgPSBjb2xvcjtcbiAgY29udGV4dC5saW5lV2lkdGggICA9IEFSQ19XSURUSDtcbiAgY29udGV4dC5hcmMoMTYsIDE2LCAxNiAtIEFSQ19XSURUSCAvIDIsIGFyY1N0YXJ0LCBhcmNFbmQpO1xuICBjb250ZXh0LnN0cm9rZSgpO1xufVxuXG4vKiogVXBkYXRlcyB0aGUgZG9jdW1lbnQncyBmYXZpY29uIHcvIGEgc3VtbWFyeSBvZiBjdXJyZW50IHN0YXRzLiAqL1xuVGl0bGUucHJvdG90eXBlLnVwZGF0ZUZhdmljb24gPSBmdW5jdGlvbiB1cGRhdGVGYXZpY29uKCkge1xuICB2YXIgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG4gIGNhbnZhcy5oZWlnaHQgPSBjYW52YXMud2lkdGggPSAzMjtcbiAgdmFyIGNvbnRleHQgPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcblxuICB2YXIgcGFzc2luZyA9IHRoaXMuc3RhdHMucGFzc2VzO1xuICB2YXIgcGVuZGluZyA9IHRoaXMuc3RhdHMucGVuZGluZztcbiAgdmFyIGZhaWxpbmcgPSB0aGlzLnN0YXRzLmZhaWx1cmVzO1xuICB2YXIgdG90YWwgICA9IE1hdGgubWF4KHRoaXMucnVubmVyLnRvdGFsLCBwYXNzaW5nICsgcGVuZGluZyArIGZhaWxpbmcpO1xuICBkcmF3RmF2aWNvbkFyYyhjb250ZXh0LCB0b3RhbCwgMCwgICAgICAgICAgICAgICAgIHBhc3NpbmcsICcjMGU5YzU3Jyk7XG4gIGRyYXdGYXZpY29uQXJjKGNvbnRleHQsIHRvdGFsLCBwYXNzaW5nLCAgICAgICAgICAgcGVuZGluZywgJyNmM2IzMDAnKTtcbiAgZHJhd0Zhdmljb25BcmMoY29udGV4dCwgdG90YWwsIHBlbmRpbmcgKyBwYXNzaW5nLCBmYWlsaW5nLCAnI2ZmNTYyMScpO1xuXG4gIHRoaXMuc2V0RmF2aWNvbihjYW52YXMudG9EYXRhVVJMKCkpO1xufTtcblxuLyoqIFNldHMgdGhlIGN1cnJlbnQgZmF2aWNvbiBieSBVUkwuICovXG5UaXRsZS5wcm90b3R5cGUuc2V0RmF2aWNvbiA9IGZ1bmN0aW9uIHNldEZhdmljb24odXJsKSB7XG4gIHZhciBjdXJyZW50ID0gZG9jdW1lbnQuaGVhZC5xdWVyeVNlbGVjdG9yKCdsaW5rW3JlbD1cImljb25cIl0nKTtcbiAgaWYgKGN1cnJlbnQpIHtcbiAgICBkb2N1bWVudC5oZWFkLnJlbW92ZUNoaWxkKGN1cnJlbnQpO1xuICB9XG5cbiAgdmFyIGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaW5rJyk7XG4gIGxpbmsucmVsID0gJ2ljb24nO1xuICBsaW5rLnR5cGUgPSAnaW1hZ2UveC1pY29uJztcbiAgbGluay5ocmVmID0gdXJsO1xuICBsaW5rLnNldEF0dHJpYnV0ZSgnc2l6ZXMnLCAnMzJ4MzInKTtcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChsaW5rKTtcbn07XG5cbn0pKCk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=