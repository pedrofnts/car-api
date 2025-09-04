import { ApiError } from '@/types/common.js';

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, unknown>,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details ?? {};
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }

  toApiError(includeStack: boolean = false): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.details ?? {},
      ...(includeStack && { stack: this.stack }),
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', details?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', details?: Record<string, unknown>) {
    super(message, 'AUTHORIZATION_ERROR', 403, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    message: string,
    originalError?: Error,
    details?: Record<string, unknown>
  ) {
    super(
      `${service} service error: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      {
        service,
        originalMessage: originalError?.message,
        ...details,
      }
    );
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(
      `Database error: ${message}`,
      'DATABASE_ERROR',
      500,
      {
        originalMessage: originalError?.message,
      }
    );
  }
}

export class CircuitBreakerError extends AppError {
  constructor(service: string) {
    super(
      `${service} service is currently unavailable (circuit breaker open)`,
      'CIRCUIT_BREAKER_OPEN',
      503,
      { service }
    );
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function createErrorFromStatusCode(
  statusCode: number,
  message: string,
  details?: Record<string, unknown>
): AppError {
  switch (statusCode) {
    case 400:
      return new ValidationError(message, details);
    case 401:
      return new AuthenticationError(message, details);
    case 403:
      return new AuthorizationError(message, details);
    case 404:
      return new NotFoundError(message);
    case 429:
      return new RateLimitError(message);
    case 502:
    case 503:
    case 504:
      return new ExternalServiceError('External Service', message, undefined, details);
    default:
      return new AppError(message, 'UNKNOWN_ERROR', statusCode, details);
  }
}