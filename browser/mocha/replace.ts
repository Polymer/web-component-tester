import {extendInterfaces} from './extend.js';

// replacement map stores what should be
let replacements = {};
let replaceTeardownAttached = false;

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
extendInterfaces('replace', function(_context, teardown) {
  return function replace(oldTagName: string) {
    return {
      with: function(tagName: string) {
        // Standardizes our replacements map
        oldTagName = oldTagName.toLowerCase();
        tagName = tagName.toLowerCase();

        replacements[oldTagName] = tagName;

        // If the function is already a stub, restore it to original
        if ((document.importNode as any).isSinonProxy) {
          return;
        }

        if (!window.Polymer.Element) {
          window.Polymer.Element = function() {};
          window.Polymer.Element.prototype._stampTemplate = function() {};
        }

        // Keep a reference to the original `document.importNode`
        // implementation for later:
        const originalImportNode = document.importNode;

        // Use Sinon to stub `document.ImportNode`:
        sinon.stub(
            document, 'importNode', function(origContent: any, deep: boolean) {
              const templateClone = document.createElement('template');
              const content = templateClone.content;
              const inertDoc = content.ownerDocument;

              // imports node from inertDoc which holds inert nodes.
              templateClone.content.appendChild(
                  inertDoc.importNode(origContent, true));

              // optional arguments are not optional on IE.
              const nodeIterator = document.createNodeIterator(
                  content, NodeFilter.SHOW_ELEMENT, null, true);
              let node;

              // Traverses the tree. A recently-replaced node will be put next,
              // so if a node is replaced, it will be checked if it needs to be
              // replaced again.
              while (node = nodeIterator.nextNode() as Element) {
                let currentTagName = node.tagName.toLowerCase();

                if (replacements.hasOwnProperty(currentTagName)) {
                  currentTagName = replacements[currentTagName];

                  // find the final tag name.
                  while (replacements[currentTagName]) {
                    currentTagName = replacements[currentTagName];
                  }

                  // Create a replacement:
                  const replacement = document.createElement(currentTagName);

                  // For all attributes in the original node..
                  for (let index = 0; index < node.attributes.length; ++index) {
                    // Set that attribute on the replacement:
                    replacement.setAttribute(
                        node.attributes[index].name,
                        node.attributes[index].value);
                  }

                  // Replace the original node with the replacement node:
                  node.parentNode.replaceChild(replacement, node);
                }
              }

              return originalImportNode.call(this, content, deep);
            });

        if (!replaceTeardownAttached) {
          // After each test...
          teardown(function() {
            replaceTeardownAttached = true;
            // Restore the stubbed version of `document.importNode`:
            const documentImportNode = document.importNode as any;
            if (documentImportNode.isSinonProxy) {
              documentImportNode.restore();
            }

            // Empty the replacement map
            replacements = {};
          });
        }
      }
    };
  };
});
