'use client';

import { useState, useEffect, useCallback } from 'react';
import { SavedPosition } from '@/lib/types';

const STORAGE_KEY = 'crypto-signal-positions';
const MAX_POSITIONS = 50;

function loadPositions(): SavedPosition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePositions(positions: SavedPosition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

export function useSavedPositions() {
  const [positions, setPositions] = useState<SavedPosition[]>([]);

  useEffect(() => {
    setPositions(loadPositions());
  }, []);

  const addPosition = useCallback((pos: Omit<SavedPosition, 'id' | 'createdAt'>): boolean => {
    const current = loadPositions();
    if (current.length >= MAX_POSITIONS) return false;
    const newPos: SavedPosition = {
      ...pos,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    const updated = [newPos, ...current];
    savePositions(updated);
    setPositions(updated);
    return true;
  }, []);

  const removePosition = useCallback((id: string) => {
    const current = loadPositions();
    const updated = current.filter((p) => p.id !== id);
    savePositions(updated);
    setPositions(updated);
  }, []);

  const closePosition = useCallback((id: string, currentPrice: number) => {
    const current = loadPositions();
    const updated = current.map((p) => {
      if (p.id !== id || p.closedAt) return p;
      const posSize = p.amount * p.leverage;
      const pnl = p.direction === 'long'
        ? posSize * (currentPrice - p.entry) / p.entry
        : posSize * (p.entry - currentPrice) / p.entry;
      return { ...p, closedAt: Date.now(), closedPrice: currentPrice, closedPnl: pnl };
    });
    savePositions(updated);
    setPositions(updated);
  }, []);

  const resetAll = useCallback(() => {
    savePositions([]);
    setPositions([]);
  }, []);

  const openPositions = positions.filter((p) => !p.closedAt);
  const closedPositions = positions.filter((p) => !!p.closedAt);

  return {
    positions,
    openPositions,
    closedPositions,
    addPosition,
    removePosition,
    closePosition,
    resetAll,
    maxPositions: MAX_POSITIONS,
  };
}
