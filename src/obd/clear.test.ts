import { clearAndVerify } from './clear';

function fake(reply: string, lists: Record<string, string[]>, failRead = false) {
  return {
    clearDTCs: async () => reply,
    readDTCs: async (k: string) => {
      if (failRead) throw new Error('timeout');
      return lists[k] ?? [];
    },
  };
}

describe('clearAndVerify', () => {
  it('reports a clean clear', async () => {
    const r = await clearAndVerify(fake('44 \r\r>', {}), ['P0171']);
    expect(r).toMatchObject({ kind: 'ok', back: [], permanent: [], raw: '44 >' });
  });
  it('flags codes that come straight back and permanent ones', async () => {
    const r = await clearAndVerify(fake('44', { stored: ['P0335'], permanent: ['P0335', 'P0456'] }), ['P0335', 'P0171']);
    expect(r.back).toEqual(['P0335']);
    expect(r.permanent).toEqual(['P0335', 'P0456']);
  });
  it('passes through engine-running and refusals without re-reading', async () => {
    expect((await clearAndVerify(fake('7F 04 22', {}), [])).kind).toBe('engine-running');
    expect((await clearAndVerify(fake('NO DATA', {}), [])).kind).toBe('no-response');
    expect((await clearAndVerify(fake('', {}), [])).raw).toBe('boş');
  });
  it('still reports ok when the re-read fails', async () => {
    const r = await clearAndVerify(fake('44', {}, true), ['P0171']);
    expect(r).toMatchObject({ kind: 'ok', after: null });
  });
});
