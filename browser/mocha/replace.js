import { extendInterfaces } from './extend';

// replacement map stores what should be
var replacements = {};
var replaceTeardownAttached = false;

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
        // Standardizes our replacements map
        oldTagName = oldTagName.toLowerCase();
        tagName = tagName.toLowerCase();

        replacements[oldTagName] = tagName;

        // If the function is already a stub, restore it to original
        if (Polymer.Base.instanceTemplate.isSinonProxy) {
          return;
        }

        // Keep a reference to the original `Polymer.Base.instanceTemplate`
        // implementation for later:
        var originalInstanceTemplate = Polymer.Base.instanceTemplate;

        // Use Sinon to stub `Polymer.Base.instanceTemplate`:
        sinon.stub(Polymer.Base, 'instanceTemplate', function(template) {
          var origContent = template._content || template.content;
          var templateClone = document.createElement('template');
          var content = templateClone.content;
          var inertDoc = content.ownerDocument;

          // imports node from inertDoc which holds inert nodes.
          templateClone.content.appendChild(inertDoc.importNode(origContent, true));

          // optional arguments are not optional on IE.
          var nodeIterator = document.createNodeIterator(content,
              NodeFilter.SHOW_ELEMENT, null, true);
          var node;

          // Traverses the tree. A recently-replaced node will be put next, so
          // if a node is replaced, it will be checked if it needs to be
          // replaced again.
          while (node = nodeIterator.nextNode()) {
            var currentTagName = node.tagName.toLowerCase();

            if (replacements.hasOwnProperty(currentTagName)) {
              currentTagName = replacements[currentTagName];

              // find the final tag name.
              while (replacements[currentTagName]) {
                currentTagName = replacements[currentTagName];
              }

              // Create a replacement:
              var replacement = document.createElement(currentTagName);

              // For all attributes in the original node..
              for (var index = 0; index < node.attributes.length; ++index) {
                // Set that attribute on the replacement:
                replacement.setAttribute(
                  node.attributes[index].name, node.attributes[index].value);
              }

              // Replace the original node with the replacement node:
              node.parentNode.replaceChild(replacement, node);
            }
          }

          return originalInstanceTemplate.call(this, templateClone);
        });

        if (!replaceTeardownAttached) {
          // After each test...
          teardown(function() {
            replaceTeardownAttached = true;
            // Restore the stubbed version of `Polymer.Base.instanceTemplate`:
            if (Polymer.Base.instanceTemplate.isSinonProxy) {
              Polymer.Base.instanceTemplate.restore();
            }

            // Empty the replacement map
            replacements = {};
          });
        }
      }
    };
  };
});
