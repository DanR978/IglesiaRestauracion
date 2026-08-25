// S56b — repos/receipts: query shape, contracts, path builder, D-018 arithmetic.
// New functionality, so there is no legacy oracle (VERIFICATION.md #5 is N/A for
// this session); RLS itself is proven on staging, never here.
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('$lib/db/client', () => import('./mock-client'));

import { mock, supabase as mockClient } from './mock-client';
import {
  deleteReceipt,
  downloadReceipt,
  listReceipts,
  MONTH_LABELS,
  monthSummaries,
  receiptFolder,
  receiptPaths,
  RECEIPTS_BUCKET,
  retainedYears,
  retentionCutoffYear,
  totalBytes,
  uploadReceipt,
  type FinReceipt,
} from '$lib/repos/receipts';

const ERR = { message: 'boom' };
const blob = (size: number): Blob => new Blob([new Uint8Array(size)]);
const UUID = /^[0-9a-f-]{8,}$/i;

/**
 * S22's `mock-client` has no `download` (nothing needed it before the private
 * receipts bucket). `storage.from()` hands back one shared object, so the spy is
 * attached here rather than editing an S22 file.
 */
type DownloadResult = { data: Blob | null; error: { message: string } | null };
type DownloadFn = (path: string) => Promise<DownloadResult>;
type Bucket = { download?: DownloadFn };
let download: Mock<DownloadFn>;

const row = (over: Partial<FinReceipt> = {}): FinReceipt => ({
  id: 'r1',
  scope: 'church',
  ministry_id: null,
  project_id: null,
  year: 2026,
  month: 3,
  storage_path: 'church/2026/a.webp',
  thumb_path: 'church/2026/a-thumb.webp',
  file_size: 1000,
  original_name: null,
  note: null,
  uploaded_by: null,
  created_at: '2026-03-01T00:00:00Z',
  ...over,
});

describe('repos/receipts', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock.reset();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    download = vi.fn<DownloadFn>(async () => ({ data: blob(4), error: null }));
    (mockClient.storage.from() as Bucket).download = download;
  });
  afterEach(() => warn.mockRestore());

  describe('retention arithmetic (D-018)', () => {
    it('cutoff is the UTC year minus two', () => {
      expect(retentionCutoffYear(new Date('2028-02-01T05:00:00Z'))).toBe(2026);
      expect(retentionCutoffYear(new Date('2026-08-24T12:00:00Z'))).toBe(2024);
    });

    it('the Feb 1 2028 run deletes 2026 and older, keeping 2027 + 2028', () => {
      const cutoff = retentionCutoffYear(new Date('2028-02-01T05:00:00Z'));
      const expired = (year: number): boolean => year <= cutoff;
      expect([2024, 2025, 2026].every(expired)).toBe(true);
      expect([2027, 2028].some(expired)).toBe(false);
    });

    it('year Y is deleted by the run of Feb 1 of Y+2, never earlier', () => {
      for (const y of [2026, 2027, 2030]) {
        expect(y <= retentionCutoffYear(new Date(`${y + 1}-02-01T05:00:00Z`))).toBe(false);
        expect(y <= retentionCutoffYear(new Date(`${y + 2}-02-01T05:00:00Z`))).toBe(true);
      }
    });

    it('January is still inside the previous window (regression: cutoff was month-blind)', () => {
      // Jan 2028: the Feb 1 2028 sweep has not run, so 2026 is still retained.
      expect(retentionCutoffYear(new Date('2028-01-15T00:00:00Z'))).toBe(2025);
      expect(retentionCutoffYear(new Date('2028-01-31T23:59:59Z'))).toBe(2025);
      // …and the sweep the next day takes it.
      expect(retentionCutoffYear(new Date('2028-02-01T05:00:00Z'))).toBe(2026);
    });

    it('the year picker widens to three entries during January', () => {
      expect(retainedYears(new Date('2028-01-15T00:00:00Z'))).toEqual([2028, 2027, 2026]);
      expect(retainedYears(new Date('2028-02-01T05:00:00Z'))).toEqual([2028, 2027]);
    });

    it('a missed run self-heals: the next year clears both backlogs', () => {
      // 2028 never fired; the 2029 run must still take 2026 AND 2027.
      const cutoff = retentionCutoffYear(new Date('2029-02-01T05:00:00Z'));
      expect(cutoff).toBe(2027);
      expect([2026, 2027].every((y) => y <= cutoff)).toBe(true);
    });

    it('the picker offers current + previous year, newest first', () => {
      expect(retainedYears(new Date('2026-08-24T12:00:00Z'))).toEqual([2026, 2025]);
    });
  });

  describe('path builder', () => {
    it('church paths are <year>-deep; ministry/project carry the id folder', () => {
      expect(receiptFolder({ scope: 'church' }, 2026)).toBe('church/2026');
      expect(receiptFolder({ scope: 'ministry', ministryId: 'm1' }, 2026)).toBe('ministry/m1/2026');
      expect(receiptFolder({ scope: 'project', projectId: 'p1' }, 2026)).toBe('project/p1/2026');
    });

    it('matches the folder depth + 4-digit-year shape receipts_insert enforces', () => {
      const depth = (p: string): number => p.split('/').length - 1;
      const church = receiptPaths({ scope: 'church' }, 2026, 'abc');
      const ministry = receiptPaths({ scope: 'ministry', ministryId: 'm1' }, 2026, 'abc');
      const project = receiptPaths({ scope: 'project', projectId: 'p1' }, 2026, 'abc');
      expect(church).toEqual({
        mainPath: 'church/2026/abc.webp',
        thumbPath: 'church/2026/abc-thumb.webp',
      });
      expect(ministry.mainPath).toBe('ministry/m1/2026/abc.webp');
      expect(project.thumbPath).toBe('project/p1/2026/abc-thumb.webp');
      expect(depth(church.mainPath)).toBe(2);
      expect(depth(ministry.mainPath)).toBe(3);
      expect(depth(project.mainPath)).toBe(3);
      for (const p of [church.mainPath, ministry.mainPath, project.mainPath]) {
        expect(p.split('/').at(-2)).toMatch(/^\d{4}$/);
      }
    });

    it('generates an id when none is given, and pairs main with -thumb', () => {
      const { mainPath, thumbPath } = receiptPaths({ scope: 'church' }, 2026);
      const id = mainPath.slice('church/2026/'.length, -'.webp'.length);
      expect(id).toMatch(UUID);
      expect(thumbPath).toBe(`church/2026/${id}-thumb.webp`);
    });
  });

  describe('listReceipts', () => {
    it('filters scope + year and orders month then created_at', async () => {
      mock.results.fin_receipts = [{ data: [row()] }];
      expect(await listReceipts({ scope: 'church' }, 2026)).toEqual([row()]);
      expect(mock.query().table).toBe('fin_receipts');
      expect(mock.chain()).toEqual(['select', 'eq', 'eq', 'order', 'order']);
      expect(mock.args('select')).toEqual(['*']);
      expect(mock.query().calls.map((c) => c.args)).toEqual([
        ['*'],
        ['scope', 'church'],
        ['year', 2026],
        ['month', { ascending: true }],
        ['created_at', { ascending: true }],
      ]);
    });

    it('adds ministry_id / project_id for the scoped views', async () => {
      await listReceipts({ scope: 'ministry', ministryId: 'm1' }, 2026);
      expect(mock.query().calls.at(-1)).toEqual({ method: 'eq', args: ['ministry_id', 'm1'] });
      mock.reset();
      await listReceipts({ scope: 'project', projectId: 'p1' }, 2026);
      expect(mock.query().calls.at(-1)).toEqual({ method: 'eq', args: ['project_id', 'p1'] });
    });

    it('returns [] without a query for a non-integer year', async () => {
      expect(await listReceipts({ scope: 'church' }, Number.NaN)).toEqual([]);
      expect(mock.queries).toHaveLength(0);
    });

    it('returns [] and warns on error', async () => {
      mock.results.fin_receipts = [{ data: null, error: ERR }];
      expect(await listReceipts({ scope: 'church' }, 2026)).toEqual([]);
      expect(warn).toHaveBeenCalledWith('[receipts] listReceipts:', 'boom');
    });
  });

  describe('downloadReceipt (private bucket — no public URL)', () => {
    it('downloads through the authenticated client', async () => {
      const out = await downloadReceipt('church/2026/a.webp');
      expect(out).toBeInstanceOf(Blob);
      expect(mockClient.storage.from).toHaveBeenCalledWith(RECEIPTS_BUCKET);
      expect(download).toHaveBeenCalledWith('church/2026/a.webp');
    });

    it('null for an empty path and on error', async () => {
      expect(await downloadReceipt('')).toBeNull();
      download.mockResolvedValueOnce({ data: null, error: ERR });
      expect(await downloadReceipt('x')).toBeNull();
      expect(warn).toHaveBeenCalledWith('[receipts] downloadReceipt:', 'boom');
    });
  });

  describe('monthSummaries / totalBytes', () => {
    it('always returns 12 buckets, Ene…Dic, in order', () => {
      const months = monthSummaries([]);
      expect(months).toHaveLength(12);
      expect(months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(months.map((m) => m.label)).toEqual([...MONTH_LABELS]);
      expect(months[0].name).toBe('enero');
      expect(months.every((m) => m.count === 0 && m.totalSize === 0)).toBe(true);
    });

    it('groups by month and sums sizes; a null file_size counts as 0', () => {
      const rows = [
        row({ id: 'a', month: 3, file_size: 100 }),
        row({ id: 'b', month: 3, file_size: null }),
        row({ id: 'c', month: 12, file_size: 50 }),
      ];
      const months = monthSummaries(rows);
      expect(months[2].count).toBe(2);
      expect(months[2].totalSize).toBe(100);
      expect(months[2].receipts.map((r) => r.id)).toEqual(['a', 'b']);
      expect(months[11].totalSize).toBe(50);
      expect(totalBytes(rows)).toBe(150);
    });

    it('ignores an out-of-range month rather than throwing', () => {
      expect(() => monthSummaries([row({ month: 0 }), row({ month: 13 })])).not.toThrow();
      expect(monthSummaries([row({ month: 13 })]).every((m) => m.count === 0)).toBe(true);
    });
  });

  describe('uploadReceipt', () => {
    const input = { year: 2026, month: 3, main: blob(300), thumb: blob(40) };

    it('uploads main + thumb as WebP, then inserts the row', async () => {
      mock.results.fin_receipts = [{ data: row() }];
      const res = await uploadReceipt({ scope: 'church' }, input);
      expect(res).toEqual({ ok: true, data: row() });

      const uploads = mock.storage.calls.filter((c) => c.method === 'upload');
      expect(uploads).toHaveLength(2);
      expect(uploads.map((u) => u.args[2])).toEqual([
        { cacheControl: '3600', upsert: false, contentType: 'image/webp' },
        { cacheControl: '3600', upsert: false, contentType: 'image/webp' },
      ]);
      const [mainPath] = uploads[0].args as [string];
      const [thumbPath] = uploads[1].args as [string];
      expect(mainPath).toMatch(/^church\/2026\/[^/]+\.webp$/);
      expect(thumbPath).toBe(mainPath.replace(/\.webp$/, '-thumb.webp'));

      expect(mock.chain()).toEqual(['insert', 'select', 'single']);
      expect(mock.args('insert')[0]).toEqual({
        scope: 'church',
        ministry_id: null,
        project_id: null,
        year: 2026,
        month: 3,
        storage_path: mainPath,
        thumb_path: thumbPath,
        file_size: 300,
        original_name: null,
        note: null,
        uploaded_by: null,
      });
    });

    it('carries the scope id, original name, note and uploader', async () => {
      mock.results.fin_receipts = [{ data: row() }];
      await uploadReceipt(
        { scope: 'ministry', ministryId: 'm1' },
        { ...input, originalName: 'IMG_1.jpg', note: 'gasolina', uploadedBy: 'u1' },
      );
      expect(mock.args('insert')[0]).toMatchObject({
        scope: 'ministry',
        ministry_id: 'm1',
        project_id: null,
        original_name: 'IMG_1.jpg',
        note: 'gasolina',
        uploaded_by: 'u1',
      });
    });

    it('rejects bad arguments without touching storage', async () => {
      const cases = [
        { ...input, year: 1999 },
        { ...input, month: 0 },
        { ...input, month: 13 },
      ];
      for (const bad of cases) {
        expect((await uploadReceipt({ scope: 'church' }, bad)).ok).toBe(false);
      }
      expect(mock.storage.calls).toHaveLength(0);
      expect(mock.queries).toHaveLength(0);
    });

    it('rolls back the surviving object when one upload fails', async () => {
      mock.storage.uploadError = { message: 'bucket full' };
      expect(await uploadReceipt({ scope: 'church' }, input)).toEqual({
        ok: false,
        error: 'bucket full',
      });
      expect(mock.storage.calls.at(-1)?.method).toBe('remove');
      expect(mock.queries).toHaveLength(0);
    });

    it('removes BOTH objects when the row insert fails (zero orphans)', async () => {
      mock.results.fin_receipts = [{ data: null, error: ERR }];
      expect(await uploadReceipt({ scope: 'church' }, input)).toEqual({
        ok: false,
        error: 'boom',
      });
      const removed = mock.storage.calls.at(-1);
      expect(removed?.method).toBe('remove');
      expect((removed?.args[0] as string[]).length).toBe(2);
    });
  });

  describe('deleteReceipt', () => {
    it('removes both objects, then the row', async () => {
      expect(await deleteReceipt(row())).toEqual({ ok: true, data: undefined });
      expect(mock.storage.calls[0]).toEqual({
        method: 'remove',
        args: [['church/2026/a.webp', 'church/2026/a-thumb.webp']],
      });
      expect(mock.query().table).toBe('fin_receipts');
      expect(mock.chain()).toEqual(['delete', 'eq']);
      expect(mock.args('eq')).toEqual(['id', 'r1']);
    });

    it('still deletes the row when no path is known', async () => {
      await deleteReceipt({ id: 'r1', storage_path: null, thumb_path: null });
      expect(mock.storage.calls).toHaveLength(0);
      expect(mock.chain()).toEqual(['delete', 'eq']);
    });

    it('rejects a receipt without an id, and reports a row error', async () => {
      expect((await deleteReceipt({ id: '' })).ok).toBe(false);
      mock.results.fin_receipts = [{ data: null, error: ERR }];
      expect(await deleteReceipt(row())).toEqual({ ok: false, error: 'boom' });
    });
  });
});
