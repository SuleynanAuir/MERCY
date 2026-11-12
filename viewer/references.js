/* RGB and event imagery is one immutable pair per animation timestamp.
   Retain compressed bytes, decode only the bounded playback window. */
(function (root) {
  'use strict';
  class ViewerReferences {
    constructor(query, maxBytes = 80 * 1024**2) {
      this.query = query; this.maxBytes = maxBytes;
      this.cache = new Map(); this.pending = new Map(); this.bytes = 0;
    }
    async blob(index) {
      let blob = this.cache.get(index);
      if (blob) {this.cache.delete(index); this.cache.set(index, blob);}
      else {
        if (!this.pending.has(index)) {
          const request = (async () => {
            const response = await fetch(`/api/reference/${index}${this.query}`, {signal: AbortSignal.timeout(15000)});
            if (!response.ok) throw new Error(`Reference frame ${index}: HTTP ${response.status}`);
            const value = await response.blob();
            if (value.size <= this.maxBytes) {
              this.cache.set(index, value); this.bytes += value.size;
              while (this.bytes > this.maxBytes) {
                const key = this.cache.keys().next().value;
                this.bytes -= this.cache.get(key).size; this.cache.delete(key);
              }
            }
            return value;
          })();
          this.pending.set(index, request);
        }
        try {blob = await this.pending.get(index);} finally {this.pending.delete(index);}
      }
      return blob;
    }
    async frame(index) {
      // Each presentation owns its bitmap, including repeated/looped frames.
      return createImageBitmap(await this.blob(index));
    }
    prepare(count, progress = () => {}, valid = () => true) {
      this.progress = progress;
      if (this.prepared) return Promise.resolve();
      if (this.preparation) return this.preparation.catch(error => {
        if(error.message === 'Cancelled' && valid()) return this.prepare(count, progress, valid);
        throw error;
      });
      this.preparation = (async () => {
        let next = 0, completed = 0, failure = null;
        this.progress(0, count);
        // Four HTTP requests maximum; decode only frames actually presented.
        await Promise.all(Array.from({length: Math.min(4, count)}, async () => {
          while (!failure && valid() && next < count) {
            const index = next++;
            try {
              await this.blob(index);
              this.progress(++completed, count);
            } catch (error) {failure = error;}
          }
        }));
        if (!valid()) throw new Error('Cancelled');
        if (failure) throw failure;
        if(this.cache.size!==count)throw new Error('Reference sequence exceeds the cache limit. Reduce the reference video size and retry.');
        this.prepared = true;
      })().finally(() => {this.preparation = null;});
      return this.preparation;
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = ViewerReferences;
  else root.ViewerReferences = ViewerReferences;
})(globalThis);
