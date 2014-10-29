function CoverageReporter(emitter, stream, options) {
  this.reporter = options.reporter;
  this.collector = options.collector;

  emitter.on('test-end', function(browser, data, stats) {
    if (data.state !== 'failing') {
      this.collector.call(this, data.context, browser);
    }
  }.bind(this));

  emitter.on('run-end', function(error) {
    if (!error) {
      this.reporter.call(this);
    }
  }.bind(this));
}

module.exports = CoverageReporter;
