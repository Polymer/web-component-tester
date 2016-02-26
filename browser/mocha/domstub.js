/**
 * Maintains a collection of DOM decorator functions.
 * Applies them by stubbing Polymer.Base.instanceTemplate
 */
export function DomStub() {
  this._decorators = [];
}

/**
 * Returns true, if this instance wasn't setup yet (or just teared down)
 */
DomStub.prototype.pristine = function() {
  return this._decorators.length === 0;
};

/**
 * Add decorator function
 */
DomStub.prototype.decorator = function(decorator) {
  this._decorators.push(decorator);
};

/**
 * Removes all setup decorators and restores instanceTemplate stub
 */
DomStub.prototype.teardown = function() {
  this._decorators = [];

  // Restore the stubbed version of `Polymer.Base.instanceTemplate`:
  if (Polymer.Base.instanceTemplate.isSinonProxy) {
    Polymer.Base.instanceTemplate.restore();
  }
};

/**
 * Stubs Polymer.Base.instanceTemplate with function that applies
 * provided decorator to the dom.
 */
DomStub.prototype.setup = function() {
  // Keep a reference to the original `Polymer.Base.instanceTemplate`
  // implementation for later:
  var originalInstanceTemplate = Polymer.Base.instanceTemplate;

  var decorators = this._decorators;

  // Use Sinon to stub `Polymer.Base.instanceTemplate`:
  sinon.stub(Polymer.Base, 'instanceTemplate', function(template) {
    // The DOM to replace is the result of calling the "original"
    // `instanceTemplate` implementation:
    var dom = originalInstanceTemplate.apply(this, arguments);

    // Apply all decorators that were setup
    decorators.forEach(function(decorator) {
      decorator(dom);
    });

    return dom;
  });
};
