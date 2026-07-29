export class AppError extends Error {
  constructor(message, { code = 'internal_error', status = 500, cause, details } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = '请求参数无效', details) {
    super(message, { code: 'invalid_request', status: 400, details });
  }
}

export class NotFoundError extends AppError {
  constructor(message = '未找到记录') {
    super(message, { code: 'not_found', status: 404 });
  }
}

export class ConflictError extends AppError {
  constructor(message = '记录已被修改，请刷新后重试', code = 'conflict') {
    super(message, { code, status: 409 });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = '需要管理员登录') {
    super(message, { code: 'authentication_required', status: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '请求校验失败', code = 'forbidden') {
    super(message, { code, status: 403 });
  }
}

export class OverloadedError extends AppError {
  constructor(message = '服务繁忙，请稍后重试') {
    super(message, { code: 'service_busy', status: 503 });
  }
}

export class RequestAbortedError extends AppError {
  constructor(message = '客户端已取消请求', cause) {
    super(message, { code: 'request_cancelled', status: 499, cause });
  }
}

export class UpstreamError extends AppError {
  constructor(message, { upstreamStatus, upstreamCode, cause, timeout = false, tooLarge = false } = {}) {
    super(message, {
      code: timeout ? 'upstream_timeout' : 'upstream_error',
      status: timeout ? 504 : 502,
      cause,
      details: { upstreamStatus, upstreamCode, tooLarge },
    });
    this.upstreamStatus = upstreamStatus;
    this.upstreamCode = upstreamCode;
    this.timeout = timeout;
    this.tooLarge = tooLarge;
  }
}

export function isSqliteConstraint(error) {
  return typeof error?.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT');
}
