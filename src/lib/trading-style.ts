import { TradingStyle, TradingStyleConfig } from './types';

export const TRADING_STYLE_CONFIGS: Record<TradingStyle, TradingStyleConfig> = {
  scalping: {
    style: 'scalping',
    label: 'スキャルピング',
    timeframes: ['5m', '15m', '1h'],
    weights: { '5m': 1, '15m': 2, '1h': 4, '4h': 0, '1d': 0 },
    roles: {
      environment: '1h',
      setup: '15m',
      trigger: '5m',
      execution: '5m',
    },
    maxHoldingMs: 2 * 60 * 60 * 1000, // 2時間
  },
  day_trade: {
    style: 'day_trade',
    label: 'デイトレード',
    timeframes: ['5m', '15m', '1h', '4h'],
    weights: { '5m': 1, '15m': 1.5, '1h': 2, '4h': 4, '1d': 0 },
    roles: {
      environment: '4h',
      setup: '1h',
      trigger: '15m',
      execution: '5m',
    },
    maxHoldingMs: 12 * 60 * 60 * 1000, // 12時間
  },
  swing: {
    style: 'swing',
    label: 'スイング',
    timeframes: ['15m', '1h', '4h', '1d'],
    weights: { '5m': 0, '15m': 1.5, '1h': 2, '4h': 3, '1d': 4 },
    roles: {
      environment: '1d',
      setup: '4h',
      trigger: '1h',
      execution: '15m',
    },
    maxHoldingMs: 5 * 24 * 60 * 60 * 1000, // 5日
  },
};
