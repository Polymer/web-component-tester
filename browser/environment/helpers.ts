/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

export {};

// Make sure that we use native timers, in case they're being stubbed out.
const nativeSetInterval = window.setInterval;
const nativeSetTimeout = window.setTimeout;
const nativeRequestAnimationFrame = window.requestAnimationFrame;



/**
 * Runs `stepFn`, catching any error and passing it to `callback` (Node-style).
 * Otherwise, calls `callback` with no arguments on success.
 *
 * @param {function()} callback
 * @param {function()} stepFn
 */
function safeStep(callback: (error?: any) => void, stepFn: () => void) {
  let err;
  try {
    stepFn();
  } catch (error) {
    err = error;
  }
  callback(err);
}

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
function testImmediate(name: string, testFn: Function) {
  if (testFn.length > 0) {
    return testImmediateAsync(name, testFn);
  }

  let err: any;
  try {
    testFn();
  } catch (error) {
    err = error;
  }
  test(name, function(done) {
    done(err);
  });
}

/**
 * An async-only variant of `testImmediate`.
 *
 * @param {string} name
 * @param {function(?function())} testFn
 */
function testImmediateAsync(name: string, testFn: Function) {
  let testComplete = false;
  let err: any;

  test(name, function(done) {
    const intervalId = nativeSetInterval(function() {
      if (!testComplete)
        return;
      clearInterval(intervalId);
      done(err);
    }, 10);
  });

  try {
    testFn(function(error: any) {
      if (error)
        err = error;
      testComplete = true;
    });
  } catch (error) {
    err = error;
    testComplete = true;
  }
}

/**
 * Triggers a flush of any pending events, observations, etc and calls you back
 * after they have been processed.
 *
 * @param {function()} callback
 */
function flush(callback: () => void) {
  // Ideally, this function would be a call to Polymer.dom.flush, but that
  // doesn't support a callback yet
  // (https://github.com/Polymer/polymer-dev/issues/851),
  // ...and there's cross-browser flakiness to deal with.

  // Make sure that we're invoking the callback with no arguments so that the
  // caller can pass Mocha callbacks, etc.
  let done = function done() {
    callback();
  };

  // Because endOfMicrotask is flaky for IE, we perform microtask checkpoints
  // ourselves (https://github.com/Polymer/polymer-dev/issues/114):
  const isIE = navigator.appName === 'Microsoft Internet Explorer';
  if (isIE && window.Platform && window.Platform.performMicrotaskCheckpoint) {
    const reallyDone = done;
    done = function doneIE() {
      Platform.performMicrotaskCheckpoint();
      nativeSetTimeout(reallyDone, 0);
    };
  }

  // Everyone else gets a regular flush.
  let scope;
  if (window.Polymer && window.Polymer.dom && window.Polymer.dom.flush) {
    scope = window.Polymer.dom;
  } else if (window.Polymer && window.Polymer.flush) {
    scope = window.Polymer;
  } else if (window.WebComponents && window.WebComponents.flush) {
    scope = window.WebComponents;
  }
  if (scope) {
    scope.flush();
  }

  // Ensure that we are creating a new _task_ to allow all active microtasks to
  // finish (the code you're testing may be using endOfMicrotask, too).
  nativeSetTimeout(done, 0);
}

/**
 * Advances a single animation frame.
 *
 * Calls `flush`, `requestAnimationFrame`, `flush`, and `callback` sequentially
 * @param {function()} callback
 */
function animationFrameFlush(callback: () => void) {
  flush(function() {
    nativeRequestAnimationFrame(function() {
      flush(callback);
    });
  });
}

/**
 * DEPRECATED: Use `flush`.
 * @param {function} callback
 */
function asyncPlatformFlush(callback: () => void) {
  console.warn(
      'asyncPlatformFlush is deprecated in favor of the more terse flush()');
  return window.flush(callback);
}

export interface MutationEl {
  onMutation(mutationEl: this, cb: () => void): void;
}

/**
 *
 */
function waitFor(
    fn: () => void, next: () => void, intervalOrMutationEl: number|MutationEl,
    timeout: number, timeoutTime: number) {
  timeoutTime = timeoutTime || Date.now() + (timeout || 1000);
  intervalOrMutationEl = intervalOrMutationEl || 32;
  try {
    fn();
  } catch (e) {
    if (Date.now() > timeoutTime) {
      throw e;
    } else {
      if (typeof intervalOrMutationEl !== 'number') {
        intervalOrMutationEl.onMutation(intervalOrMutationEl, function() {
          waitFor(fn, next, intervalOrMutationEl, timeout, timeoutTime);
        });
      } else {
        nativeSetTimeout(function() {
          waitFor(fn, next, intervalOrMutationEl, timeout, timeoutTime);
        }, intervalOrMutationEl);
      }
      return;
    }
  }
  next();
}

declare global {
  interface Window {
    safeStep: typeof safeStep;
    testImmediate: typeof testImmediate;
    testImmediateAsync: typeof testImmediateAsync;
    flush: typeof flush;
    animationFrameFlush: typeof animationFrameFlush;
    asyncPlatformFlush: typeof asyncPlatformFlush;
    waitFor: typeof waitFor;
  }
}

window.safeStep = safeStep;
window.testImmediate = testImmediate;
window.testImmediateAsync = testImmediateAsync;
window.flush = flush;
window.animationFrameFlush = animationFrameFlush;
window.asyncPlatformFlush = asyncPlatformFlush;
window.waitFor = waitFor;
