import { describe, expect, it } from 'vitest';
import { ProcessLocator } from './processLocator';

describe('ProcessLocator', () => {
  it('instantiates and provides detectConnection method', () => {
    const locator = new ProcessLocator();
    expect(typeof locator.detectConnection).toBe('function');
    expect(typeof locator.detectConnections).toBe('function');
  });

  it('detects live Antigravity / agy process on the current host if running', async () => {
    const logs: string[] = [];
    const locator = new ProcessLocator((msg) => logs.push(msg));
    const connections = await locator.detectConnections();
    // If agy or language_server is running, it should return at least one valid connection
    if (connections.length > 0) {
      expect(connections[0].pid).toBeGreaterThan(0);
      expect(connections[0].port).toBeGreaterThan(0);
      expect(connections[0].csrfToken).toBeTruthy();
    }
  });
});
