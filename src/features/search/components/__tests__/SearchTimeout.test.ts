import { withTimeout } from '../SearchView';

describe('online search timeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects a request that exceeds the visible timeout', async () => {
    jest.useFakeTimers();
    const pending = withTimeout(new Promise<string>(() => {}), 15000);

    jest.advanceTimersByTime(15000);

    await expect(pending).rejects.toThrow('SEARCH_TIMEOUT');
  });

  it('returns a response received before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 15000)).resolves.toBe('ok');
  });
});
