import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readSaveSlot, writeSaveSlot, listSaveSlots, SaveSlotRecord, createSaveSlotRecord } from './save-slots';
import { SerializedState } from '../../engine/types';

describe('save-slots', () => {
  beforeEach(() => {
    // Mock the native object that the code checks for
    vi.stubGlobal('window', {
      native: undefined
    });

    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles localStorage.getItem throwing an error', async () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error('Disk error');
    });
    const result = await readSaveSlot(0);
    expect(result).toBeNull();
  });
});
