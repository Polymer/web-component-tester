// People frequently sudo install web-component-tester, and we have to be a
// little careful about file permissions.
//
// sauce-connect-launcher downloads and caches the sc binary into its package
// directory the first time you try to connect. If WCT is installed via sudo,
// sauce-connect-launcher will be unable to write to its directory, and fail.
//
// So, we force a prefetch during install ourselves. This also works around a
// npm bug where sauce-connect-launcher is unable to predownload itself:
// https://github.com/npm/npm/issues/6624
var sauceConnectLauncher = require('sauce-connect-launcher');

sauceConnectLauncher.download({
  logger: console.log.bind(console),
}, function(error) {
  if (error) {
    console.log('Failed to download sauce connect binary:', error);
    console.log('sauce-connect-launcher will attempt to re-download next time it is run.');
  }
});
