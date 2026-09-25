// grid.js — the spatial hash. Every question the war asks ("who is near me?") is answered here in
// constant time per cell, so ten thousand bodies cost what a hundred do. Rebuilt once a tick by a
// counting sort into flat typed arrays: no objects, no lists, no garbage.
export class Grid {
  constructor(w, h, cell, cap) {
    this.cell = cell;
    this.cols = Math.ceil(w / cell) + 1;
    this.rows = Math.ceil(h / cell) + 1;
    this.n = this.cols * this.rows;
    this.start = new Int32Array(this.n + 1);   // start[k] .. start[k+1] are cell k's items
    this.fill = new Int32Array(this.n);
    this.items = new Int32Array(cap);
    this.cellOf = new Int32Array(cap);
  }
  key(x, y) {
    let cx = (x / this.cell) | 0, cy = (y / this.cell) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }
  // Sort the live indices [0, hi) into their cells. alive[i] is 0/1.
  build(xs, ys, alive, hi) {
    const start = this.start, fill = this.fill, items = this.items, cellOf = this.cellOf, n = this.n;
    start.fill(0);
    for (let i = 0; i < hi; i++) {
      if (!alive[i]) { cellOf[i] = -1; continue; }
      const k = this.key(xs[i], ys[i]);
      cellOf[i] = k;
      start[k + 1]++;
    }
    for (let k = 0; k < n; k++) start[k + 1] += start[k];
    fill.set(start.subarray(0, n));
    for (let i = 0; i < hi; i++) { const k = cellOf[i]; if (k >= 0) items[fill[k]++] = i; }
  }
  // Visit every item whose cell touches the box (x±r, y±r). fn(i) returns true to stop early.
  near(x, y, r, fn) {
    const c = this.cell;
    let x0 = ((x - r) / c) | 0, x1 = ((x + r) / c) | 0, y0 = ((y - r) / c) | 0, y1 = ((y + r) / c) | 0;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x1 >= this.cols) x1 = this.cols - 1; if (y1 >= this.rows) y1 = this.rows - 1;
    const start = this.start, items = this.items, cols = this.cols;
    for (let cy = y0; cy <= y1; cy++) {
      let k = cy * cols + x0;
      for (let cx = x0; cx <= x1; cx++, k++) {
        for (let j = start[k], e = start[k + 1]; j < e; j++) if (fn(items[j])) return;
      }
    }
  }
}
