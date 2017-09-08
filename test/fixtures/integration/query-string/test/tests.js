var url = new URL(document._currentScript ? document._currentScript.src : document.currentScript.src);

test('preserves query strings (' + url.search + ')', function () {
  expect(url.search).to.match(/\?fizz=buzz/);
});
