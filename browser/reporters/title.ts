/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */
import * as util from '../util.js';

const ARC_OFFSET = 0;  // start at the right.
const ARC_WIDTH = 6;

/**
 * A Mocha reporter that updates the document's title and favicon with
 * at-a-glance stats.
 *
 * @param {!Mocha.Runner} runner The runner that is being reported on.
 */
export default class Title {
  runner: Mocha.IRunner;
  constructor(runner: Mocha.IRunner) {
    Mocha.reporters.Base.call(this, runner);

    runner.on('test end', this.report.bind(this));
  }

  /** Reports current stats via the page title and favicon. */
  report() {
    this.updateTitle();
    this.updateFavicon();
  }

  /** Updates the document title with a summary of current stats. */
  updateTitle() {
    if (this.stats.failures > 0) {
      document.title = util.pluralizedStat(this.stats.failures, 'failing');
    } else {
      document.title = util.pluralizedStat(this.stats.passes, 'passing');
    }
  }

  /** Updates the document's favicon w/ a summary of current stats. */
  updateFavicon() {
    const canvas = document.createElement('canvas');
    canvas.height = canvas.width = 32;
    const context = canvas.getContext('2d');

    const passing = this.stats.passes;
    const pending = this.stats.pending;
    const failing = this.stats.failures;
    const total = Math.max(this.runner.total, passing + pending + failing);
    drawFaviconArc(context, total, 0, passing, '#0e9c57');
    drawFaviconArc(context, total, passing, pending, '#f3b300');
    drawFaviconArc(context, total, pending + passing, failing, '#ff5621');

    this.setFavicon(canvas.toDataURL());
  }

  /** Sets the current favicon by URL. */
  setFavicon(url: string) {
    const current = document.head.querySelector('link[rel="icon"]');
    if (current) {
      document.head.removeChild(current);
    }

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/x-icon';
    link.href = url;
    link.setAttribute('sizes', '32x32');
    document.head.appendChild(link);
  }
}

/**
 * Draws an arc for the favicon status, relative to the total number of tests.
 */
function drawFaviconArc(
    context: CanvasRenderingContext2D, total: number, start: number,
    length: number, color: string) {
  const arcStart = ARC_OFFSET + Math.PI * 2 * (start / total);
  const arcEnd = ARC_OFFSET + Math.PI * 2 * ((start + length) / total);

  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = ARC_WIDTH;
  context.arc(16, 16, 16 - ARC_WIDTH / 2, arcStart, arcEnd);
  context.stroke();
}

export default interface Title extends Mocha.reporters.Base {}
