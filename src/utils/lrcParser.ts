export interface LyricLine {
  time: number; // in seconds
  text: string;
}

/**
 * Parses an LRC lyrics text file content.
 * Supports lines with multiple timestamps like:
 * [00:12.50][00:24.00] Repeated lyrics line
 */
export function parseLRC(lrcText: string): LyricLine[] {
  const lines = lrcText.split(/\r?\n/);
  const result: LyricLine[] = [];

  // Match timestamps like [01:23.45] or [01:23] or [01:23:45]
  const timestampRegex = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Check if there are any timestamps in the line
    const matches = Array.from(trimmedLine.matchAll(timestampRegex));
    if (matches.length === 0) continue;

    // Remove all timestamps from the line to get the clean lyrics text
    const cleanText = trimmedLine.replace(timestampRegex, '').trim();

    // Process each timestamp found in the line
    for (const match of matches) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      let fractions = 0;

      if (match[3]) {
        const rawFraction = match[3];
        // If 2 digits (centiseconds), it's fraction of 100, e.g. 45 -> 0.45
        // If 3 digits (milliseconds), it's fraction of 1000, e.g. 450 -> 0.450
        fractions = parseFloat(`0.${rawFraction}`);
      }

      const totalTimeSeconds = minutes * 60 + seconds + fractions;
      result.push({
        time: totalTimeSeconds,
        text: cleanText,
      });
    }
  }

  // Sort lyrics chronologically
  return result.sort((a, b) => a.time - b.time);
}
