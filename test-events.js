var tester = require('./index');

// {
//     "browserName": "chrome",
//     "platform": "Windows 8.1",
//     "version": "36"
//   }
var reporter = tester.test(false, [], {
    port: 9998, 
    component: 'core-list',
    root: '/Users/kschaaf/dev/polymer/components'
  }, function() {
  console.log('done');
});

reporter.on('runner started', function(data) {
  console.log('runner started');
});
reporter.on('browser started', function(data) {
  console.log('browser started', data.browser.browserName);
});
reporter.on('mocha event', function(data) {
  console.log('mocha event', data.event);
});
reporter.on('browser stopped', function(data) {
  console.log('browser stopped', data.browser.browserName);
});
reporter.on('runner stopped', function(data) {
  console.log('runner stopped');
});
