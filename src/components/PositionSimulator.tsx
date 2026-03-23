'use client';

import { useState, useEffect } from 'react';
import { TradeSetup, SavedPosition } from '@/lib/types';
import HelpTip from './HelpTip';


function fmt(n: number, d?: number): string {
  const decimals = d ?? (n >= 1000 ? 0 : n >= 1 ? 2 : 4);
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDuration(ms: number): string {
  const hours = ms / (60 * 60 * 1000);
  if (hours < 24) return `${Math.round(hours)}時間`;
  const days = hours / 24;
  if (days === Math.round(days)) return `${Math.round(days)}日`;
  return `${days.toFixed(1)}日`;
}

interface Props {
  longSetup: TradeSetup;
  shortSetup: TradeSetup;
  symbol: string;
  onSavePosition: (pos: Omit<SavedPosition, 'id' | 'createdAt' | 'status'>) => boolean;
  positionCount: number;
  maxPositions: number;
}

export default function PositionSimulator({ longSetup, shortSetup, symbol, onSavePosition, positionCount, maxPositions }: Props) {
  const [amount, setAmount] = useState('1000');
  const [leverage, setLeverage] = useState(1);
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [saved, setSaved] = useState(false);

  // Custom price inputs (string for editable inputs)
  const [customEntry, setCustomEntry] = useState('');
  const [customSL, setCustomSL] = useState('');
  const [customTP, setCustomTP] = useState('');

  const setup = direction === 'long' ? longSetup : shortSetup;

  // Sync custom prices when direction or setup changes
  useEffect(() => {
    setCustomEntry(setup.entry.toString());
    setCustomSL(setup.stopLoss.toString());
    setCustomTP(setup.target.toString());
  }, [setup.entry, setup.stopLoss, setup.target]);

  const entry = parseFloat(customEntry) || setup.entry;
  const stopLoss = parseFloat(customSL) || setup.stopLoss;
  const target = parseFloat(customTP) || setup.target;

  const investAmount = parseFloat(amount) || 0;
  const positionSize = investAmount * leverage;

  // Recalculate profit/loss based on custom prices
  const rewardPercent = direction === 'long'
    ? ((target - entry) / entry) * 100
    : ((entry - target) / entry) * 100;
  const riskPercent = direction === 'long'
    ? ((entry - stopLoss) / entry) * 100
    : ((stopLoss - entry) / entry) * 100;

  const profitAtTarget = positionSize * Math.abs(rewardPercent) / 100;
  const lossAtStop = positionSize * Math.abs(riskPercent) / 100;
  const roi = investAmount > 0 ? (profitAtTarget / investAmount) * 100 : 0;
  const lossRoi = investAmount > 0 ? (lossAtStop / investAmount) * 100 : 0;
  const rr = riskPercent > 0 ? Math.abs(rewardPercent) / riskPercent : 0;

  let liquidationPrice: number | null = null;
  if (leverage > 1) {
    if (direction === 'long') {
      liquidationPrice = entry * (1 - 1 / leverage);
    } else {
      liquidationPrice = entry * (1 + 1 / leverage);
    }
  }

  const isFull = positionCount >= maxPositions;

  // Check if custom prices differ from defaults
  const isCustomized = entry !== setup.entry || stopLoss !== setup.stopLoss || target !== setup.target;

  const handleReset = () => {
    setCustomEntry(setup.entry.toString());
    setCustomSL(setup.stopLoss.toString());
    setCustomTP(setup.target.toString());
  };

  const handleSave = () => {
    const ok = onSavePosition({
      symbol,
      direction,
      entry,
      stopLoss,
      target,
      amount: investAmount,
      leverage,
      ...(setup.suggestedMaxHoldingMs ? { maxHoldingMs: setup.suggestedMaxHoldingMs } : {}),
      ...(setup.tradingStyle ? { tradingStyle: setup.tradingStyle } : {}),
    });
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const inputClass = "w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm font-mono";

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-bold text-white">
          売買シミュレーター
          <HelpTip text="分析結果のエントリー・損切り・利確価格を基に、投資金額に応じた損益を試算します。各価格は手動で変更可能です" />
        </h2>
        <span className="text-xs text-gray-500">※ 手数料・Funding Rate は含まれません</span>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            投資金額 (USDC)<HelpTip text="取引に使う元手の金額です" />
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            className={inputClass}
            placeholder="1000"
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs text-gray-400">
              レバレッジ<HelpTip text="元手を何倍にして取引するかの倍率です。高いほどリターンもリスクも大きくなります" />
            </label>
            <span className={`text-sm font-bold font-mono ${leverage >= 20 ? 'text-red-400' : leverage >= 10 ? 'text-yellow-400' : 'text-white'}`}>{leverage}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={40}
            step={1}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>1x</span>
            <span>10x</span>
            <span>20x</span>
            <span>40x</span>
          </div>
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

      {/* Price inputs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            エントリー<HelpTip text="指値注文の約定価格です。分析結果を元に自動設定されますが変更可能です" />
          </label>
          <input
            type="number"
            value={customEntry}
            onChange={(e) => setCustomEntry(e.target.value)}
            step="any"
            className={`${inputClass} ${entry !== setup.entry ? '!border-blue-500/60' : ''}`}
          />
        </div>
        <div>
          <label className="block text-xs text-red-400/80 mb-1">
            損切り<HelpTip text="この価格に達すると自動で損切り決済されます" />
          </label>
          <input
            type="number"
            value={customSL}
            onChange={(e) => setCustomSL(e.target.value)}
            step="any"
            className={`${inputClass} ${stopLoss !== setup.stopLoss ? '!border-blue-500/60' : ''}`}
          />
        </div>
        <div>
          <label className="block text-xs text-green-400/80 mb-1">
            利確<HelpTip text="この価格に達すると自動で利確決済されます" />
          </label>
          <input
            type="number"
            value={customTP}
            onChange={(e) => setCustomTP(e.target.value)}
            step="any"
            className={`${inputClass} ${target !== setup.target ? '!border-blue-500/60' : ''}`}
          />
        </div>
      </div>

      {/* Reset to defaults button */}
      {isCustomized && (
        <div className="mb-4">
          <button
            onClick={handleReset}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            分析値にリセット（Entry: ${fmt(setup.entry)} / SL: ${fmt(setup.stopLoss)} / TP: ${fmt(setup.target)}）
          </button>
        </div>
      )}

      {/* Results */}
      {investAmount > 0 && (
        <div className="space-y-3">
          {/* Position info */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-400">ポジションサイズ<HelpTip text="実際に動かす金額です（投資金額×レバレッジ）" /></div>
            <div className="text-right font-mono text-gray-200">${fmt(positionSize, 0)}</div>
            <div className="text-gray-400">リスクリワード比</div>
            <div className="text-right font-mono text-gray-200">1 : {fmt(rr, 1)}</div>
          </div>

          <div className="border-t border-gray-700 pt-3 grid grid-cols-2 gap-2">
            {/* Profit scenario */}
            <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3">
              <div className="text-xs text-green-400 mb-1">
                利確時（${fmt(target)}）<HelpTip text="目標価格に達した場合の利益です" />
              </div>
              <div className="text-green-400 text-xl font-bold font-mono">+${fmt(profitAtTarget)}</div>
              <div className="text-green-400 text-sm font-mono">+{fmt(roi)}%</div>
            </div>

            {/* Loss scenario */}
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
              <div className="text-xs text-red-400 mb-1">
                損切り時（${fmt(stopLoss)}）<HelpTip text="損切りラインに達した場合の損失です" />
              </div>
              <div className="text-red-400 text-xl font-bold font-mono">-${fmt(lossAtStop)}</div>
              <div className="text-red-400 text-sm font-mono">-{fmt(lossRoi)}%</div>
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

          {/* Suggested max holding time */}
          {setup.suggestedMaxHoldingMs && (
            <div className="border-t border-gray-700 pt-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">
                  推奨最大保有時間<HelpTip text="分析タイムフレームから算出した目安です。この時間を超えてSL/TPに到達しない場合、手動決済を検討してください" />
                </span>
                <span className="font-mono text-gray-200 font-bold">{fmtDuration(setup.suggestedMaxHoldingMs)}</span>
              </div>
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
              {saved ? '指値注文を登録しました' : isFull ? `ポジション上限（${maxPositions}件）に達しています` : '指値注文として登録'}
            </button>
            <p className="text-xs text-gray-500 mt-1 text-center">
              価格がエントリーに到達すると約定します。損切り/利確/保有期限超過は自動執行されます（{positionCount}/{maxPositions}件）
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
