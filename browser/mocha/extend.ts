
var interfaceExtensions = [];

/**
 * Registers an extension that extends the global `Mocha` implementation
 * with new helper methods. These helper methods will be added to the `window`
 * when tests run for both BDD and TDD interfaces.
 */
export function extendInterfaces(helperName, helperFactory) {
  interfaceExtensions.push(function() {
    var Mocha = window.Mocha;
    // For all Mocha interfaces (probably just TDD and BDD):
    Object.keys(Mocha.interfaces).forEach(function(interfaceName) {
      // This is the original callback that defines the interface (TDD or BDD):
      var originalInterface = Mocha.interfaces[interfaceName];
      // This is the name of the "teardown" or "afterEach" property for the
      // current interface:
      var teardownProperty = interfaceName === 'tdd' ? 'teardown' : 'afterEach';
      // The original callback is monkey patched with a new one that appends to
      // the global context however we want it to:
      Mocha.interfaces[interfaceName] = function(suite) {
        // Call back to the original callback so that we get the base interface:
        originalInterface.apply(this, arguments);
        // Register a listener so that we can further extend the base interface:
        suite.on('pre-require', function(context, file, mocha) {
          // Capture a bound reference to the teardown function as a convenience:
          var teardown = context[teardownProperty].bind(context);
          // Add our new helper to the testing context. The helper is generated
          // by a factory method that receives the context, the teardown function
          // and the interface name and returns the new method to be added to
          // that context:
          context[helperName] = helperFactory(context, teardown, interfaceName);
        });
      };
    });
  });
}

/**
 * Applies any registered interface extensions. The extensions will be applied
 * as many times as this function is called, so don't call it more than once.
 */
export function applyExtensions() {
  interfaceExtensions.forEach(function(applyExtension) {
    applyExtension();
  });
}
