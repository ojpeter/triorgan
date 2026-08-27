// ─────────────────────────────────────────────────────────────────────────────
// Screening history. Owns its storage key.
//
// Four screens previously read and parsed the raw `scan_history` key themselves
// and one wrote it, so the record shape was defined in five places. It is
// defined here now, and validated on read so one corrupt record cannot blank
// the whole list.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from './storageKeys';
import { HistoryEntrySchema, parseList } from './schemas';

const MAX_ENTRIES = 100;

export async function getHistory() {
  try {
    let raw = await AsyncStorage.getItem(STORAGE_KEYS.SCAN_HISTORY);

    // One-time migration off the old unscoped key.
    if (raw === null) {
      const legacy = await AsyncStorage.getItem(STORAGE_KEYS.LEGACY_SCAN_HISTORY);
      if (legacy !== null) {
        await AsyncStorage.setItem(STORAGE_KEYS.SCAN_HISTORY, legacy);
        await AsyncStorage.removeItem(STORAGE_KEYS.LEGACY_SCAN_HISTORY);
        raw = legacy;
      }
    }

    return raw ? parseList(HistoryEntrySchema, JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export async function addHistoryEntry({ organId, organName, analysis, symptomCount }) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    organId,
    organName,
    date: new Date().toISOString(),
    riskLevel: analysis.riskLevel,
    riskScore: analysis.riskScore,
    symptomCount,
    summary: analysis.riskSummary,
  };

  const parsed = HistoryEntrySchema.safeParse(entry);
  if (!parsed.success) return null;

  const existing = await getHistory();
  const next = [parsed.data, ...existing].slice(0, MAX_ENTRIES);
  await AsyncStorage.setItem(STORAGE_KEYS.SCAN_HISTORY, JSON.stringify(next));
  return parsed.data;
}

export async function clearHistory() {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.SCAN_HISTORY,
    STORAGE_KEYS.LEGACY_SCAN_HISTORY,
  ]);
}
