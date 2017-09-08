var url = document.currentScript ?
  new URL(document.currentScript.src) :
  new URL('https://example.com/?fizz=buzz');

test('preserves query strings (' + url.search + ')', function () {
  expect(url.search).to.match(/\?fizz=buzz/);
});
