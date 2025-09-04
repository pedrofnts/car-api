import { randomUUID } from 'crypto';

export function generateRequestId(): string {
  return randomUUID();
}

export function generateCorrelationId(): string {
  return randomUUID();
}