import { extendInterfaces } from './extend';

// replacement map stores what should be
var replacements = {};

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

        // Use Sinon to stub `Polymer.Base.instanceTemplate`:
        sinon.stub(Polymer.Base, 'instanceTemplate', function(template) {
          // dom to be replaced. _content is used for templatize calls the
          // content is used for every other occasion of template instantiation
          var dom = template._content || template.content;
          var templateNode = dom;
          var instanceNode;
          var instanceParent;

          // Traverses the tree. And places the new nodes (after replacing) into
          // a new template.
          while (templateNode) {
            if (templateNode.nodeType === Node.ELEMENT_NODE) {
              var originalTagName = templateNode.tagName.toLowerCase();
              var currentTagName = originalTagName;

              // determines the name of the element in the new template
              while (replacements.hasOwnProperty(currentTagName)) {
                currentTagName = replacements[currentTagName];
              }

              // if we have not changed this element, copy it over
              if (currentTagName === originalTagName) {
                instanceNode = document.importNode(templateNode);

              } else {
                // create the new node
                instanceNode = document.createElement(currentTagName);

                var numAttributes = templateNode.attributes.length;
                // For all attributes in the original node..
                for (var index=0; index<numAttributes; ++index) {
                  // Set that attribute on the new node:
                  instanceNode.setAttribute(templateNode.attributes[index].name,
                      templateNode.attributes[index].value);
                }
              }

            } else {
              // if it is not an element node, simply import it.
              instanceNode = document.importNode(templateNode);
            }

            if (instanceParent) {
              instanceParent.appendChild(instanceNode);
            }

            // traverse down the tree
            if (templateNode.firstChild) {
              instanceParent = instanceNode;
              templateNode = templateNode.firstChild;

            // traverse laterally if you cannot traverse down
            } else if (templateNode.nextSibling) {
              templateNode = templateNode.nextSibling;

            // if the parent is the dom, we are done
            } else if (templateNode.parentNode === dom) {
              instanceParent = instanceNode.parentNode;
              return instanceParent;

            // traverse up
            } else {
              // traverse up until you can move laterally
              while (!templateNode.nextSibling) {
                templateNode = templateNode.parentNode;
                instanceParent = instanceParent.parentNode;

                // stop traversing up if we are at the top
                if (templateNode === dom) {
                  return instanceParent;
                }
              }

              // traverse laterally
              templateNode = templateNode.nextSibling;
            }
          }
        });

        // After each test...
        teardown(function() {
          // Restore the stubbed version of `Polymer.Base.instanceTemplate`:
          if (Polymer.Base.instanceTemplate.isSinonProxy) {
            Polymer.Base.instanceTemplate.restore();
          }

          // Empty the replacement map
          replacements = {};
        });
      }
    };
  };
});
