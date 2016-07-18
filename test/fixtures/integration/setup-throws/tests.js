setup(function() {
  throw "Failed";
});

// Don't expect this test to be run due to setup failing.
test('not run test', function() {
  assert.isTrue(false);
});
