import { extendInterfaces } from './extend';
import { stubInstanceTemplate, tagReplacer } from './helper';

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
        var decorator = tagReplacer(oldTagName, tagName);
        return stubInstanceTemplate(decorator, teardown);
      }
    };
  };
});
