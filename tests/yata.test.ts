import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../src/api/http';
import { YATA_TRAVEL_URL, YataClient } from '../src/api/yata';

const travelPayload = {
  stocks: {
    mex: {
      update: 1_700_000_000,
      stocks: [{ id: 1, name: 'Ramen', quantity: 5, cost: 100 }],
    },
  },
};

describe('YataClient', () => {
  it('fetches the travel export', async () => {
    const json = vi.fn(async () => travelPayload);
    const http = { json } as unknown as HttpClient;
    const yata = new YataClient(http);

    const stock = await yata.getTravelStock();
    expect(stock.countries.mex?.items[0]?.name).toBe('Ramen');
    expect(stock.countries.mex?.updatedAt).toBe(1_700_000_000_000);
    expect(json).toHaveBeenCalledWith(YATA_TRAVEL_URL, { signal: undefined });
  });

  it('propagates transport errors', async () => {
    const json = vi.fn(async () => {
      throw new Error('offline');
    });
    const http = { json } as unknown as HttpClient;
    const yata = new YataClient(http);
    await expect(yata.getTravelStock()).rejects.toThrow('offline');
  });
});
