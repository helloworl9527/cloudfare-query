import { monitorEventLoopDelay } from 'node:perf_hooks';

function keyFor(name, labels) {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return `${name}\0${JSON.stringify(entries)}`;
}

function labelsText(labels) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  const inner = entries.map(([key, value]) => {
    const escaped = String(value).replace(/\\/gu, '\\\\').replace(/"/gu, '\\"').replace(/\n/gu, '\\n');
    return `${key}="${escaped}"`;
  }).join(',');
  return `{${inner}}`;
}

export class Metrics {
  constructor(prefix = 'nfq') {
    this.prefix = prefix;
    this.counters = new Map();
    this.observations = new Map();
    this.eventLoop = monitorEventLoopDelay({ resolution: 20 });
    this.eventLoop.enable();
  }

  increment(name, labels = {}, amount = 1) {
    const fullName = `${this.prefix}_${name}`;
    const key = keyFor(fullName, labels);
    const current = this.counters.get(key) ?? { name: fullName, labels, value: 0 };
    current.value += amount;
    this.counters.set(key, current);
  }

  observe(name, seconds, labels = {}) {
    const fullName = `${this.prefix}_${name}`;
    const key = keyFor(fullName, labels);
    const current = this.observations.get(key) ?? { name: fullName, labels, count: 0, sum: 0, max: 0 };
    const value = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
    current.count += 1;
    current.sum += value;
    current.max = Math.max(current.max, value);
    this.observations.set(key, current);
  }

  render(extraGauges = {}) {
    const lines = [];
    for (const metric of this.counters.values()) {
      lines.push(`${metric.name}_total${labelsText(metric.labels)} ${metric.value}`);
    }
    for (const metric of this.observations.values()) {
      const labels = labelsText(metric.labels);
      lines.push(`${metric.name}_count${labels} ${metric.count}`);
      lines.push(`${metric.name}_sum${labels} ${metric.sum}`);
      lines.push(`${metric.name}_max${labels} ${metric.max}`);
    }
    const memory = process.memoryUsage();
    lines.push(`${this.prefix}_process_resident_memory_bytes ${memory.rss}`);
    lines.push(`${this.prefix}_process_heap_used_bytes ${memory.heapUsed}`);
    lines.push(`${this.prefix}_process_heap_total_bytes ${memory.heapTotal}`);
    lines.push(`${this.prefix}_process_external_memory_bytes ${memory.external}`);
    lines.push(`${this.prefix}_event_loop_delay_seconds ${this.eventLoop.mean / 1e9 || 0}`);
    lines.push(`${this.prefix}_event_loop_delay_max_seconds ${this.eventLoop.max / 1e9 || 0}`);
    lines.push(`${this.prefix}_event_loop_delay_p95_seconds ${this.eventLoop.percentile(95) / 1e9 || 0}`);
    lines.push(`${this.prefix}_event_loop_delay_p99_seconds ${this.eventLoop.percentile(99) / 1e9 || 0}`);
    for (const [name, value] of Object.entries(extraGauges)) {
      lines.push(`${this.prefix}_${name} ${Number(value) || 0}`);
    }
    return `${lines.join('\n')}\n`;
  }

  close() {
    this.eventLoop.disable();
  }
}
