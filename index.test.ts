import { Readable } from 'stream';
import { mockNodeStreamFromPdf } from './index';

describe('mockNodeStreamFromPdf', () => {
  it('should generate 2 chunks with 2s delay', async () => {
    const stream = await mockNodeStreamFromPdf();

    const chunks: Buffer[] = [];
    const timestamps: number[] = [];

    // Collect data and timestamps
    const dataHandler = (chunk: Buffer) => {
      timestamps.push(Date.now());
      chunks.push(chunk);
    };

    await new Promise<void>((resolve, reject) => {
      stream
        .on('data', dataHandler)
        .on('end', () => resolve())
        .on('error', reject);
    });

    // Basic assertions
    expect(chunks).toHaveLength(2);
    expect(chunks[0].length).toBe(1024);
    expect(chunks[1].length).toBe(1024);

    // Timing assertion (2s ± 100ms tolerance)
    const timeDiff = timestamps[1] - timestamps[0];
    expect(timeDiff).toBeGreaterThanOrEqual(1900);
    expect(timeDiff).toBeLessThanOrEqual(2100);
  }, 10000); // Extend test timeout to 10 seconds
});
