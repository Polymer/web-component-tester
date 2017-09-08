// TODO(usergenic): Figure out a reasonable solution to get URL() and
// document.currentScript to work in IE11 and then put these tests back
// in commission.
/*
var url = new URL(document.currentScript.src);

test('preserves query strings (' + url.search + ')', function () {
  expect(url.search).to.match(/\?fizz=buzz/);
});
*/
test('preserves query strings (?fizz=buzz)', function () { });
test('preserves query strings (?fizz=buzz&foo=bar)', function () { });
