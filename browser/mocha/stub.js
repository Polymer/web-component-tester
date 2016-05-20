import { extendInterfaces } from './extend';

/**
 * stub
 *
 * The stub addon allows the tester to partially replace the implementation of
 * an element with some custom implementation. Usage example:
 *
 * beforeEach(function() {
 *   stub('x-foo', {
 *     attached: function() {
 *       // Custom implementation of the `attached` method of element `x-foo`..
 *     },
 *     otherMethod: function() {
 *       // More custom implementation..
 *     },
 *     // etc..
 *   });
 * });
 */
extendInterfaces('stub', function(context, teardown) {

  return function stub(tagName, implementation) {
    // Find the prototype of the element being stubbed:
    var proto = document.createElement(tagName).constructor.prototype;

    // For all keys in the implementation to stub with..
    var keys = Object.keys(implementation);
    keys.forEach(function(key) {
      // Stub the method on the element prototype with Sinon:
      sinon.stub(proto, key, implementation[key]);
    });

    // After all tests..
    teardown(function() {
      // For all of the keys in the implementation we stubbed..
      keys.forEach(function(key) {
        // Restore the stub:
        if (proto[key].isSinonProxy) {
          proto[key].restore();
        }
      });
    });
  };
});
