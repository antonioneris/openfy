import { getPerformanceMetrics, recordPerformanceMetric } from '../performanceMetrics';

describe('performance metrics', () => {
  beforeEach(() => localStorage.clear());

  it('stores rounded, non-negative measurements with metadata', () => {
    recordPerformanceMetric('library-indexation', 123.8, { trackCount: 10 });
    expect(getPerformanceMetrics()).toEqual([
      expect.objectContaining({
        name: 'library-indexation',
        durationMs: 124,
        metadata: { trackCount: 10 },
      })
    ]);
  });
});
