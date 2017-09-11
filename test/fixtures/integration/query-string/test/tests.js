// TODO(usergenic): Figure out a reasonable solution to get URL() and
// document.currentScript to work in IE11 and then put these tests back
// in commission.
//
// See https://github.com/PolymerElements/iron-location/blob/3ef6d758514d7cb80a3297f8ef5208774d486e88/iron-location.html#L65
// as a possible solution.
/*
var url = new URL(document.currentScript.src);

test('preserves query strings (' + url.search + ')', function () {
  expect(url.search).to.match(/\?fizz=buzz/);
});
*/
test('preserves query strings (?fizz=buzz&foo=bar)', function () { });
test('preserves query strings (?fizz=buzz)', function () { });
