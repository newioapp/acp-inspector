import { describe, it, expect } from 'vitest';
import { isJsonRpcRequest, isJsonRpcResponse } from '../types';

describe('isJsonRpcRequest', () => {
  it('returns true for request with method', () => {
    expect(isJsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'test', params: {} })).toBe(true);
  });

  it('returns true for notification (no id)', () => {
    expect(isJsonRpcRequest({ method: 'test' })).toBe(true);
  });

  it('returns false for response', () => {
    expect(isJsonRpcRequest({ jsonrpc: '2.0', id: 1, result: {} })).toBe(false);
  });

  it('returns false for process event', () => {
    expect(isJsonRpcRequest({ stderr: 'error output' })).toBe(false);
  });

  it('returns false for error response', () => {
    expect(isJsonRpcRequest({ id: 1, error: { code: -1, message: 'fail' } })).toBe(false);
  });
});

describe('isJsonRpcResponse', () => {
  it('returns true for success response', () => {
    expect(isJsonRpcResponse({ jsonrpc: '2.0', id: 1, result: {} })).toBe(true);
  });

  it('returns true for error response', () => {
    expect(isJsonRpcResponse({ id: 1, error: { code: -1, message: 'fail' } })).toBe(true);
  });

  it('returns false for request', () => {
    expect(isJsonRpcResponse({ method: 'test', params: {} })).toBe(false);
  });

  it('returns false for process event', () => {
    expect(isJsonRpcResponse({ stderr: 'error output' })).toBe(false);
  });

  it('returns true for response with null result', () => {
    expect(isJsonRpcResponse({ id: 1, result: null })).toBe(true);
  });
});
