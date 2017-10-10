import {extendInterfaces} from './extend.js';

interface TestFixture extends HTMLElement {
  create(model: object): HTMLElement;
  restore(): void;
}

extendInterfaces('fixture', function(context, teardown) {

  // Return context.fixture if it is already a thing, for backwards
  // compatibility with `test-fixture-mocha.js`:
  return context.fixture || function fixture(fixtureId: string, model: object) {

    // Automatically register a teardown callback that will restore the
    // test-fixture:
    teardown(function() {
      (document.getElementById(fixtureId) as TestFixture).restore();
    });

    // Find the test-fixture with the provided ID and create it, returning
    // the results:
    return (document.getElementById(fixtureId) as TestFixture).create(model);
  };
});
