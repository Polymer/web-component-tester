/**
 * Stubs Polymer.Base.instanceTemplate with function that calls
 * provided `domDecorator` function before returning the dom.
 *
 * Sets up teardown to restore the stub.
 */
export function stubInstanceTemplate(domDecorator, teardown) {
  // Keep a reference to the original `Polymer.Base.instanceTemplate`
  // implementation for later:
  var originalInstanceTemplate = Polymer.Base.instanceTemplate;

  // Use Sinon to stub `Polymer.Base.instanceTemplate`:
  sinon.stub(Polymer.Base, 'instanceTemplate', function(template) {
    // The DOM to replace is the result of calling the "original"
    // `instanceTemplate` implementation:
    var dom = originalInstanceTemplate.apply(this, arguments);
    domDecorator(dom);

    return dom;
  });

  // After each test...
  teardown(function() {
    // Restore the stubbed version of `Polymer.Base.instanceTemplate`:
    if (Polymer.Base.instanceTemplate.isSinonProxy) {
      Polymer.Base.instanceTemplate.restore();
    }
  });
}

/**
 * Returns function that takes dom as a parameter and replaces
 * all oldTagNames with tagNames.
 *
 * All annotations and attributes will be set on the placement element the way
 * they were set for the original element.
 */
export function tagReplacer(oldTagName, tagName) {
  return function(dom) {
    // The nodes to replace are queried from the DOM chunk:
    var nodes = Array.prototype.slice.call(dom.querySelectorAll(oldTagName));

    // For all of the nodes we want to place...
    nodes.forEach(function(node) {

      // Create a replacement:
      var replacement = document.createElement(tagName);

      // For all attributes in the original node..
      for (var index = 0; index < node.attributes.length; ++index) {
        // Set that attribute on the replacement:
        replacement.setAttribute(
          node.attributes[index].name, node.attributes[index].value);
      }

      // Replace the original node with the replacement node:
      node.parentNode.replaceChild(replacement, node);
    });
  };
}
