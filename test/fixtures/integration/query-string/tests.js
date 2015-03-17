var urlBits = WCT.util.parseUrl(document.currentScript.src);
var query   = WCT.util.paramsToQuery(urlBits.params);

test('preserves query strings (' + query + ')', function() {
  expect(urlBits.params.fizz).to.deep.eq(['buzz']);
});
