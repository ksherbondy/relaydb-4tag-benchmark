/**
 * Author: Kris Sherbondy
 * Date: 2026-05-21
 * Purpose:
 *   Tiny LRU cache for RelayDB locality experiments.
 *
 *   This is intentionally small and dependency-free.
 */

class TinyLRU {
  constructor(limit = 128) {
    this.limit = limit;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.evictions = 0;
  }

  get(key) {
    if (!this.map.has(key)) {
      this.misses += 1;
      return undefined;
    }

    const value = this.map.get(key);

    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, value);

    this.hits += 1;
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    }

    this.map.set(key, value);
    this.sets += 1;

    if (this.map.size > this.limit) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
      this.evictions += 1;
    }
  }

  has(key) {
    return this.map.has(key);
  }

  clear() {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.evictions = 0;
  }

  stats() {
    return {
      limit: this.limit,
      size: this.map.size,
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      evictions: this.evictions,
      hitRate:
        this.hits + this.misses === 0
          ? 0
          : Number((this.hits / (this.hits + this.misses)).toFixed(6)),
    };
  }
}

module.exports = TinyLRU;