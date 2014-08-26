'use strict';

var interruptHandlers = [];
// Register a handler to occur on SIGINT. All handlers are passed a callback,
// and the process will be terminated once all handlers complete.
function onInterrupt(handler) {
  interruptHandlers.push(handler);
}

// Call all interrupt handlers, and call the callback when they all complete.
function close(done) {
  var numComplete = 0;
  // You could cheat by calling callbacks multiple times, but that's your bug!
  var total = interruptHandlers.length;
  interruptHandlers.forEach(function(handler) {
    handler(function() {
      numComplete = numComplete + 1;
      if (numComplete === total) done();
    });
  });
  interruptHandlers = [];
}

var interrupted = false;
// Behaves as if you sent a SIGINT to the process.
function interrupt() {
  if (interruptHandlers.length == 0) return process.exit();
  if (interrupted) {
    console.log('\nKilling process with extreme prejudice');
    return process.exit(1);
  } else {
    interrupted = true;
  }

  close(process.exit.bind(process));
  console.log('\nShutting down. Press ctrl-c again to kill immediately.');
}
process.on('SIGINT', interrupt);

module.exports.close       = close;
module.exports.interrupt   = interrupt;
module.exports.onInterrupt = onInterrupt;
