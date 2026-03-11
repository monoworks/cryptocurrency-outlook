'use client';

import { useState, useEffect, useCallback } from 'react';
import { SavedPosition } from '@/lib/types';

const STORAGE_KEY = 'crypto-signal-positions';
const MAX_POSITIONS = 50;

function loadPositions(): SavedPosition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPosition[];
    // Migration: positions without status field are treated as 'open' (legacy)
    return parsed.map((p) => ({
      ...p,
      status: p.status ?? (p.closedAt ? 'closed' : 'open'),
    }));
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

  const addPosition = useCallback((pos: Omit<SavedPosition, 'id' | 'createdAt' | 'status'>): boolean => {
    const current = loadPositions();
    if (current.length >= MAX_POSITIONS) return false;
    const newPos: SavedPosition = {
      ...pos,
      id: crypto.randomUUID(),
      status: 'pending',
      createdAt: Date.now(),
    };
    const updated = [newPos, ...current];
    savePositions(updated);
    setPositions(updated);
    return true;
  }, []);

  const fillPosition = useCallback((id: string, fillPrice: number) => {
    const current = loadPositions();
    const updated = current.map((p) => {
      if (p.id !== id || p.status !== 'pending') return p;
      return { ...p, status: 'open' as const, entry: fillPrice, filledAt: Date.now() };
    });
    savePositions(updated);
    setPositions(updated);
  }, []);

  const removePosition = useCallback((id: string) => {
    const current = loadPositions();
    const updated = current.filter((p) => p.id !== id);
    savePositions(updated);
    setPositions(updated);
  }, []);

  const closePosition = useCallback((id: string, currentPrice: number, reason: 'manual' | 'stop_loss' | 'take_profit' = 'manual') => {
    const current = loadPositions();
    const updated = current.map((p) => {
      if (p.id !== id || p.status !== 'open') return p;
      const posSize = p.amount * p.leverage;
      const pnl = p.direction === 'long'
        ? posSize * (currentPrice - p.entry) / p.entry
        : posSize * (p.entry - currentPrice) / p.entry;
      return {
        ...p,
        status: 'closed' as const,
        closedAt: Date.now(),
        closedPrice: currentPrice,
        closedPnl: pnl,
        closeReason: reason,
      };
    });
    savePositions(updated);
    setPositions(updated);
  }, []);

  const resetAll = useCallback(() => {
    savePositions([]);
    setPositions([]);
  }, []);

  const pendingPositions = positions.filter((p) => p.status === 'pending');
  const openPositions = positions.filter((p) => p.status === 'open');
  const closedPositions = positions.filter((p) => p.status === 'closed');

  return {
    positions,
    pendingPositions,
    openPositions,
    closedPositions,
    addPosition,
    fillPosition,
    removePosition,
    closePosition,
    resetAll,
    maxPositions: MAX_POSITIONS,
  };
}
