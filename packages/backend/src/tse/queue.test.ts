/** Unit tests for the TSE call queue — pure logic, no subprocess involved. */
import { describe, expect, it } from 'vitest';
import { enqueueTseCall } from './queue.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('enqueueTseCall', () => {
  it('runs calls strictly one after another, in enqueue order', async () => {
    const order: number[] = [];
    const p1 = enqueueTseCall(async () => {
      await delay(30);
      order.push(1);
    });
    const p2 = enqueueTseCall(async () => {
      await delay(5);
      order.push(2);
    });
    const p3 = enqueueTseCall(async () => {
      order.push(3);
    });

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('continues processing the queue after an earlier call rejects', async () => {
    const order: string[] = [];
    const failing = enqueueTseCall(async () => {
      order.push('a');
      throw new Error('boom');
    });
    const following = enqueueTseCall(async () => {
      order.push('b');
      return 'ok';
    });

    await expect(failing).rejects.toThrow('boom');
    await expect(following).resolves.toBe('ok');
    expect(order).toEqual(['a', 'b']);
  });

  it('propagates the resolved value of the wrapped function', async () => {
    const result = await enqueueTseCall(async () => 42);
    expect(result).toBe(42);
  });
});
