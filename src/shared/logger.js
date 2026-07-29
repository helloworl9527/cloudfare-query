function safeError(error) {
  return {
    name: error?.name ?? 'Error',
    code: error?.code ?? 'internal_error',
    status: error?.status ?? 500,
    upstream_status: error?.upstreamStatus,
    upstream_code: error?.upstreamCode,
    timeout: error?.timeout === true || undefined,
    response_too_large: error?.tooLarge === true || undefined,
  };
}

export class JsonLogger {
  constructor({ service, output = process.stdout, errorOutput = process.stderr } = {}) {
    this.service = service;
    this.output = output;
    this.errorOutput = errorOutput;
  }

  info(event, fields = {}) { this.#write('info', event, fields); }
  warn(event, fields = {}) { this.#write('warn', event, fields, this.errorOutput); }
  error(event, error, fields = {}) {
    this.#write('error', event, { ...fields, error: safeError(error) }, this.errorOutput);
  }

  #write(level, event, fields, stream = this.output) {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      event,
      ...fields,
    };
    stream.write(`${JSON.stringify(record)}\n`);
  }
}

export function createNoopLogger() {
  return { info() {}, warn() {}, error() {} };
}
