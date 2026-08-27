/* eslint-env jest */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getHistory, addHistoryEntry, clearHistory } from '../historyService';
import { STORAGE_KEYS } from '../storageKeys';

const ANALYSIS = {
  riskLevel: 'MODERATE',
  riskScore: 44,
  riskSummary: 'Some signs present.',
};

const add = (overrides = {}) =>
  addHistoryEntry({
    organId: 'heart',
    organName: 'Heart',
    analysis: ANALYSIS,
    symptomCount: 2,
    ...overrides,
  });

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('reading', () => {
  it('returns an empty list when nothing is stored', async () => {
    expect(await getHistory()).toEqual([]);
  });

  it('survives corrupted JSON instead of throwing', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.SCAN_HISTORY, '{not json');
    expect(await getHistory()).toEqual([]);
  });

  // One bad record used to be enough to blank the whole list.
  it('drops individual malformed records and keeps the rest', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.SCAN_HISTORY,
      JSON.stringify([
        {
          id: 'good',
          organId: 'liver',
          organName: 'Liver',
          date: '2026-08-27T10:00:00Z',
          riskLevel: 'LOW',
          riskScore: 10,
          symptomCount: 1,
          summary: 'ok',
        },
        { id: 'bad', organId: 'pancreas' },
      ])
    );

    const history = await getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('good');
  });
});

describe('migration off the old unscoped key', () => {
  it('moves legacy data to the namespaced key and removes the old one', async () => {
    const legacy = [
      {
        id: 'legacy-1',
        organId: 'heart',
        organName: 'Heart',
        date: '2026-01-01T00:00:00Z',
        riskLevel: 'HIGH',
        riskScore: 80,
        symptomCount: 3,
        summary: 'Old record',
      },
    ];
    await AsyncStorage.setItem(STORAGE_KEYS.LEGACY_SCAN_HISTORY, JSON.stringify(legacy));

    const history = await getHistory();

    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('legacy-1');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.LEGACY_SCAN_HISTORY)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.SCAN_HISTORY)).not.toBeNull();
  });

  it('does not clobber existing data with legacy data', async () => {
    await add();
    await AsyncStorage.setItem(STORAGE_KEYS.LEGACY_SCAN_HISTORY, JSON.stringify([]));

    const history = await getHistory();

    expect(history).toHaveLength(1);
    expect(history[0].organName).toBe('Heart');
  });
});

describe('writing', () => {
  it('stores a screening newest-first', async () => {
    await add({ organId: 'heart', organName: 'Heart' });
    await add({ organId: 'liver', organName: 'Liver' });

    const history = await getHistory();
    expect(history.map((h) => h.organId)).toEqual(['liver', 'heart']);
  });

  it('records the fields the history and profile screens read', async () => {
    const entry = await add();
    expect(entry).toMatchObject({
      organId: 'heart',
      organName: 'Heart',
      riskLevel: 'MODERATE',
      riskScore: 44,
      symptomCount: 2,
      summary: 'Some signs present.',
    });
    expect(entry.id).toEqual(expect.any(String));
    expect(Date.parse(entry.date)).not.toBeNaN();
  });

  it('refuses to store an entry that would not survive a read', async () => {
    const entry = await addHistoryEntry({
      organId: 'spleen',
      organName: 'Spleen',
      analysis: ANALYSIS,
      symptomCount: 1,
    });

    expect(entry).toBeNull();
    expect(await getHistory()).toEqual([]);
  });

  it('caps the stored history so it cannot grow without bound', async () => {
    for (let i = 0; i < 105; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await add();
    }
    expect((await getHistory()).length).toBeLessThanOrEqual(100);
  });
});

describe('clearing', () => {
  it('removes both the current and legacy keys', async () => {
    await add();
    await AsyncStorage.setItem(STORAGE_KEYS.LEGACY_SCAN_HISTORY, JSON.stringify([]));

    await clearHistory();

    expect(await getHistory()).toEqual([]);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.LEGACY_SCAN_HISTORY)).toBeNull();
  });
});
