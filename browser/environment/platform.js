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
