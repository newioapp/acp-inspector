import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, setLogLevel } from '../logger';

describe('Logger', () => {
  beforeEach(() => {
    setLogLevel('debug');
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs at all levels when level is debug', () => {
    const log = new Logger('Test');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(console.debug).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('suppresses debug when level is info', () => {
    setLogLevel('info');
    const log = new Logger('Test');
    log.debug('d');
    log.info('i');
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledTimes(1);
  });

  it('suppresses debug and info when level is warn', () => {
    setLogLevel('warn');
    const log = new Logger('Test');
    log.debug('d');
    log.info('i');
    log.warn('w');
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('includes tag in log output', () => {
    const log = new Logger('MyTag');
    log.info('hello');
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('[MyTag]'), 'hello');
  });

  it('passes extra args', () => {
    const log = new Logger('Test');
    log.info('msg', { key: 'val' });
    expect(console.info).toHaveBeenCalledWith(expect.any(String), 'msg', { key: 'val' });
  });
});
