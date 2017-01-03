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
 *     getterSetterProperty: {
 *       get: function() {
 *         // Custom getter implementation..
 *       },
 *       set: function() {
 *         // Custom setter implementation..
 *       }
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
    var stubs = Object.keys(implementation).map(function(key) {
      // Stub the method on the element prototype with Sinon:
      return sinon.stub(proto, key, implementation[key]);
    });

    // After all tests..
    teardown(function() {
      // For all of the keys in the implementation we stubbed..
      stubs.forEach(function(stub) {
        // Restore the stub:
        stub.restore();
      });
    });
  };
});
