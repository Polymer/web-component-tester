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
              // Polymer's shady dom implementation goes through the insertion
              // points and checks their parents. If the parent of a content
              // tag has been stamped already, then Polymer.dom has to be aware
              // of this content tag's parent. Additionally,
              // Polymer.dom.appendChild does not seem to actually append the
              // content nodes into the document fragment, so node.appendChild
              // must also be called to actually insert the node.
              if (instanceNode.tagName == 'CONTENT') {
                Polymer.dom(instanceParent).appendChild(instanceNode);
              }

              instanceParent.appendChild(instanceNode);
            }

            // traverse down the tree
            if (templateNode.firstChild) {
              instanceParent = instanceNode;
              templateNode = templateNode.firstChild;

            // traverse up
            } else {
              // traverse up until you can move laterally
              while (!templateNode.nextSibling) {
                // stop traversing up if we are at the top
                if (templateNode.parentNode === dom) {
                  return instanceParent;
                } else {
                  instanceParent = instanceParent.parentNode;
                }

                templateNode = templateNode.parentNode;
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
