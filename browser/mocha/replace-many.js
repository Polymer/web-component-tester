import { extendInterfaces } from './extend';
import { stubInstanceTemplate, tagReplacer } from './helper';

/**
 * replaceMany
 *
 * The replaceMany addon works just like replace addon,
 * except that you can specify multiple replacements.
 *
 * beforeEach(function() {
 *   replaceMany({
 *     'x-foo': 'x-fake-foo',
 *     'y-bar': 'y-fake-bar'
 *   });
 * });
 */
extendInterfaces('replaceMany', function(context, teardown) {
  return function replaceMany(tags) {
    var decorator = function(dom) {
      for (var oldTagName in tags) {
        var tagName = tags[oldTagName];
        tagReplacer(oldTagName, tagName)(dom);
      }
    };
    return stubInstanceTemplate(decorator, teardown);
  };
});
