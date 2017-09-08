var url = document.currentScript ?
  new URL(document.currentScript.src) :
  // TODO(usergenic): Add the currentScript polyfill or remove this test.
  new URL('https://example.com/?fizz=buzz');

test('preserves query strings (' + url.search + ')', function () {
  expect(url.search).to.match(/\?fizz=buzz/);
});
