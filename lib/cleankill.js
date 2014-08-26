'use strict';

var interruptHandlers = [];
// You could cheat by calling callbacks multiple times, but that's your bug!
var numCompleteInterruptHandlers = 0;

// Register a handler to occur on SIGINT. All handlers are passed a callback,
// and the process will be terminated once all handlers complete.
function onInterrupt(handler) {
  interruptHandlers.push(handler);
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
    console.log('\nShutting down. Press ctrl-c again to kill immediately.');
  }

  interruptHandlers.forEach(function(handler) {
    handler(function() {
      numCompleteInterruptHandlers = numCompleteInterruptHandlers + 1;
      if (numCompleteInterruptHandlers === interruptHandlers.length) {
        process.exit();
      }
    });
  });
}
process.on('SIGINT', interrupt);

module.exports.interrupt   = interrupt;
module.exports.onInterrupt = onInterrupt;
