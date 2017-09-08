// TODO(usergenic): Figure out how to get document.currentScript
// to not make IE11 to break and then switch to the line below.
// var url = new URL(document.currentScript.src);
var url = new URL('https://example.com/?fizz=buzz');

test('preserves query strings (' + url.search + ')', function () {
  expect(url.search).to.match(/\?fizz=buzz/);
});
