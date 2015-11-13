import { extendInterfaces } from './extend';

/**
 * replace
 *
 * The replace addon allows the tester to replace all usages of one element with
 * another element within all Polymer elements created within the time span of
 * the test. Usage example:
 *
 * beforeEach(function() {
 *   replace('x-foo').with('x-fake-foo');
 * });
 *
 * All annotations and attributes will be set on the placement element the way
 * they were set for the original element.
 */
extendInterfaces('replace', function(context, teardown) {
  return function replace(oldTagName) {
    return {
      with: function(tagName) {
        // Keep a reference to the original `Polymer.Base.instanceTemplate`
        // implementation for later:
        var originalInstanceTemplate = Polymer.Base.instanceTemplate;

        // Use Sinon to stub `Polymer.Base.instanceTemplate`:
        sinon.stub(Polymer.Base, 'instanceTemplate', function(template) {
          // The DOM to replace is the result of calling the "original"
          // `instanceTemplate` implementation:
          var dom = originalInstanceTemplate.apply(this, arguments);

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

          return dom;
        });

        // After each test...
        teardown(function() {
          // Restore the stubbed version of `Polymer.Base.instanceTemplate`:
          Polymer.Base.instanceTemplate.restore();
        });
      }
    };
  };
});
