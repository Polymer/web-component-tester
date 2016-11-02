var url = new URL(document.currentScript.src);

test('preserves query strings (' + url.search + ')', function() {
  expect(url.search).to.match(/\?fizz=buzz/);
});
