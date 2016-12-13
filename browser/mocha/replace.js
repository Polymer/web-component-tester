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
extendInterfaces('replace', function (context, teardown) {
  return function replace(oldTagName) {
    return {
      with: function (tagName) {
        // Standardizes our replacements map
        oldTagName = oldTagName.toLowerCase();
        tagName = tagName.toLowerCase();

        replacements[oldTagName] = tagName;

        // If the function is already a stub, restore it to original
        if (document.importNode.isSinonProxy) {
          return;
        }

        if (!Polymer.Element) {
          Polymer.Element = function () { };
          Polymer.Element.prototype._stampTemplate = function () { };
        }

        // Keep a reference to the original `document.importNode`
        // implementation for later:
        var originalImportNode = document.importNode;

        // Use Sinon to stub `document.ImportNode`:
        sinon.stub(document, 'importNode', function (origContent, deep) {
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

          return originalImportNode.call(this, content, deep);
        });

        if (!replaceTeardownAttached) {
          // After each test...
          teardown(function () {
            replaceTeardownAttached = true;
            // Restore the stubbed version of `document.importNode`:
            if (document.importNode.isSinonProxy) {
              document.importNode.restore();
            }

            // Empty the replacement map
            replacements = {};
          });
        }
      }
    };
  };
});
