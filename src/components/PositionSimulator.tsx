'use client';

import { useState } from 'react';
import { TradeSetup, SavedPosition } from '@/lib/types';
import HelpTip from './HelpTip';

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20, 25, 40];

function fmt(n: number, d = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface Props {
  longSetup: TradeSetup;
  shortSetup: TradeSetup;
  symbol: string;
  onSavePosition: (pos: Omit<SavedPosition, 'id' | 'createdAt'>) => boolean;
  positionCount: number;
  maxPositions: number;
}

export default function PositionSimulator({ longSetup, shortSetup, symbol, onSavePosition, positionCount, maxPositions }: Props) {
  const [amount, setAmount] = useState('1000');
  const [leverage, setLeverage] = useState(1);
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [saved, setSaved] = useState(false);

  const setup = direction === 'long' ? longSetup : shortSetup;
  const investAmount = parseFloat(amount) || 0;
  const positionSize = investAmount * leverage;

  const profitAtTarget = positionSize * setup.rewardPercent / 100;
  const lossAtStop = positionSize * setup.riskPercent / 100;
  const roi = investAmount > 0 ? (profitAtTarget / investAmount) * 100 : 0;
  const lossRoi = investAmount > 0 ? (lossAtStop / investAmount) * 100 : 0;

  let liquidationPrice: number | null = null;
  if (leverage > 1) {
    if (direction === 'long') {
      liquidationPrice = setup.entry * (1 - 1 / leverage);
    } else {
      liquidationPrice = setup.entry * (1 + 1 / leverage);
    }
  }

  const isFull = positionCount >= maxPositions;

  const handleSave = () => {
    const ok = onSavePosition({
      symbol,
      direction,
      entry: setup.entry,
      stopLoss: setup.stopLoss,
      target: setup.target,
      amount: investAmount,
      leverage,
    });
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3">
        損益シミュレーター
        <HelpTip text="分析結果のエントリー・損切り・利確価格を基に、投資金額に応じた損益を試算します。実際の取引では手数料やスリッページが発生します" />
      </h2>

      {/* Inputs */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-400 mb-1">
            投資金額 (USDT)<HelpTip text="取引に使う元手の金額です" />
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
            placeholder="1000"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            レバレッジ<HelpTip text="元手を何倍にして取引するかの倍率です。高いほどリターンもリスクも大きくなります" />
          </label>
          <select
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 text-sm"
          >
            {LEVERAGE_OPTIONS.map((lv) => (
              <option key={lv} value={lv}>{lv}x</option>
            ))}
          </select>
        </div>
      </div>

      {/* Direction tabs */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setDirection('long')}
          className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
            direction === 'long'
              ? 'bg-green-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          ロング（買い）
        </button>
        <button
          onClick={() => setDirection('short')}
          className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
            direction === 'short'
              ? 'bg-red-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          ショート（売り）
        </button>
      </div>

      {/* Results */}
      {investAmount > 0 && (
        <div className="space-y-3">
          {/* Position info */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-400">ポジションサイズ<HelpTip text="実際に動かす金額です（投資金額×レバレッジ）" /></div>
            <div className="text-right font-mono text-gray-200">${fmt(positionSize, 0)}</div>
            <div className="text-gray-400">エントリー価格</div>
            <div className="text-right font-mono text-gray-200">${fmt(setup.entry)}</div>
          </div>

          <div className="border-t border-gray-700 pt-3">
            {/* Profit scenario */}
            <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3 mb-2">
              <div className="text-xs text-green-400 mb-1">
                利確時（${fmt(setup.target)}）<HelpTip text="目標価格に達した場合の利益です" />
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-green-400 text-xl font-bold font-mono">+${fmt(profitAtTarget)}</span>
                <span className="text-green-400 text-sm font-mono">+{fmt(roi)}%</span>
              </div>
            </div>

            {/* Loss scenario */}
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
              <div className="text-xs text-red-400 mb-1">
                損切り時（${fmt(setup.stopLoss)}）<HelpTip text="損切りラインに達した場合の損失です" />
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-red-400 text-xl font-bold font-mono">-${fmt(lossAtStop)}</span>
                <span className="text-red-400 text-sm font-mono">-{fmt(lossRoi)}%</span>
              </div>
            </div>
          </div>

          {/* Liquidation price */}
          {liquidationPrice != null && (
            <div className="border-t border-gray-700 pt-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-yellow-400">
                  推定清算価格<HelpTip text="証拠金が0になり強制決済される価格の目安です。この価格に近づくと全額を失う可能性があります" />
                </span>
                <span className="font-mono text-yellow-400 font-bold">${fmt(liquidationPrice)}</span>
              </div>
              {leverage >= 10 && (
                <p className="text-xs text-yellow-500/80 mt-1">
                  高レバレッジは清算リスクが非常に高くなります。ご注意ください。
                </p>
              )}
            </div>
          )}

          {/* Save position button */}
          <div className="border-t border-gray-700 pt-3">
            <button
              onClick={handleSave}
              disabled={isFull || saved}
              className={`w-full py-2 rounded text-sm font-medium transition-colors ${
                saved
                  ? 'bg-green-700 text-white'
                  : isFull
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {saved ? '登録しました' : isFull ? `ポジション上限（${maxPositions}件）に達しています` : 'このポジションを登録'}
            </button>
            <p className="text-xs text-gray-500 mt-1 text-center">
              登録するとリアルタイムで含み損益を確認できます（{positionCount}/{maxPositions}件）
            </p>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-gray-600 mt-2">
            ※ 手数料・スリッページ・Funding等は含まれていません。実際の損益とは異なります。
          </p>
        </div>
      )}
    </div>
  );
}
