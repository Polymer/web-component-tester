import {extendInterfaces} from './extend.js';

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
extendInterfaces('stub', function(_context, teardown) {

  return function stub(tagName: string, implementation: object) {
    // Find the prototype of the element being stubbed:
    const proto = document.createElement(tagName).constructor.prototype;

    // For all keys in the implementation to stub with..
    const stubs = Object.keys(implementation).map(function(key) {
      // Stub the method on the element prototype with Sinon:
      return sinon.stub(proto, key, implementation[key]);
    });

    // After all tests..
    teardown(function() {
      stubs.forEach(function(stub) {
        stub.restore();
      });
    });
  };
});
