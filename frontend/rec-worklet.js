'use strict';
// Cattura del microfono: inoltra blocchi di campioni con il frame del contesto audio in cui
// sono arrivati, così la registrazione si allinea esattamente alla riproduzione.

const CHUNK = 4096;

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = true;
    this.reset();
    this.port.onmessage = (e) => {
      if (e.data === 'stop') {
        this.flush();
        this.on = false;
        this.port.postMessage({ type: 'done' });
      }
    };
  }

  reset() {
    this.frame = -1;
    this.n = 0;
    this.l = new Float32Array(CHUNK);
    this.r = null;
  }

  flush() {
    if (this.n > 0) {
      const msg = { type: 'chunk', frame: this.frame, l: this.l.slice(0, this.n), r: this.r ? this.r.slice(0, this.n) : null };
      this.port.postMessage(msg, msg.r ? [msg.l.buffer, msg.r.buffer] : [msg.l.buffer]);
    }
    this.reset();
  }

  process(inputs) {
    if (!this.on) return false;
    const ch = inputs[0];
    if (!ch || !ch.length) { this.flush(); return true; } // nessun dato: il blocco successivo riparte da capo
    const len = ch[0].length;
    if (this.n + len > CHUNK) this.flush();
    if (this.n === 0) this.frame = currentFrame;
    this.l.set(ch[0], this.n);
    if (ch.length > 1) {
      if (!this.r) this.r = new Float32Array(CHUNK);
      this.r.set(ch[1], this.n);
    }
    this.n += len;
    return true;
  }
}

registerProcessor('noises-recorder', RecorderProcessor);
