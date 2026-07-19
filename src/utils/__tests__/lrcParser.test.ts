import { parseLRC } from '../lrcParser';

describe('parseLRC', () => {
  it('returns empty array for empty input', () => {
    expect(parseLRC('')).toEqual([]);
  });

  it('returns empty array for text without timestamps', () => {
    expect(parseLRC('Just some text\nNo timestamps here')).toEqual([]);
  });

  it('parses simple LRC lines', () => {
    const lrc = `[00:12.00]First line
[00:24.50]Second line`;

    const result = parseLRC(lrc);
    expect(result).toEqual([
      { time: 12, text: 'First line' },
      { time: 24.5, text: 'Second line' },
    ]);
  });

  it('parses timestamps with milliseconds', () => {
    const result = parseLRC('[01:30.123]With milliseconds');
    expect(result).toEqual([{ time: 90.123, text: 'With milliseconds' }]);
  });

  it('parses multiple timestamps per line', () => {
    const result = parseLRC('[00:10.00][00:20.00]Repeated line');
    expect(result).toEqual([
      { time: 10, text: 'Repeated line' },
      { time: 20, text: 'Repeated line' },
    ]);
  });

  it('sorts lines chronologically', () => {
    const lrc = `[00:30.00]Third
[00:10.00]First
[00:20.00]Second`;

    const result = parseLRC(lrc);
    expect(result.map(r => r.text)).toEqual(['First', 'Second', 'Third']);
  });

  it('skips empty lines and metadata lines', () => {
    const lrc = `[ti:Song Title]
[ar:Artist]

[00:05.00]Actual lyric`;

    const result = parseLRC(lrc);
    expect(result).toEqual([{ time: 5, text: 'Actual lyric' }]);
  });

  it('handles CRLF line endings', () => {
    const result = parseLRC('[00:01.00]Line 1\r\n[00:02.00]Line 2');
    expect(result).toHaveLength(2);
  });

  it('parses timestamps without milliseconds', () => {
    const result = parseLRC('[02:30]No fractions');
    expect(result).toEqual([{ time: 150, text: 'No fractions' }]);
  });
});
