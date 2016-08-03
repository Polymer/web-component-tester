import { extendInterfaces } from './extend';

var fixtureTeardownAttached = false;

extendInterfaces('fixture', function(context, teardown) {

  // Return context.fixture if it is already a thing, for backwards
  // compatibility with `test-fixture-mocha.js`:
  return context.fixture || function fixture(fixtureId, model) {

    if (!fixtureTeardownAttached) {
      // Automatically register a teardown callback that will restore the
      // test-fixture:
      teardown(function() {
        fixtureTeardownAttached = true;
        document.getElementById(fixtureId).restore();
      });
    }

    // Find the test-fixture with the provided ID and create it, returning
    // the results:
    return document.getElementById(fixtureId).create(model);
  };
});
