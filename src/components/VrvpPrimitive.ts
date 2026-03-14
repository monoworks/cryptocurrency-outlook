import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  ISeriesPrimitiveAxisView,
  SeriesType,
  ISeriesApi,
  IChartApiBase,
} from 'lightweight-charts';
import type { VolumeProfileAnalysis } from '@/lib/types';

interface BarRect {
  y: number;         // top (media coords)
  height: number;    // bar height (media coords)
  widthRatio: number; // 0-1 ratio of max bar width
  isPoc: boolean;
  inValueArea: boolean;
}

const MAX_BAR_WIDTH_RATIO = 0.25; // max 25% of chart width

class VrvpPaneRenderer implements IPrimitivePaneRenderer {
  private _bars: BarRect[] = [];

  update(bars: BarRect[]) {
    this._bars = bars;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const chartWidth = mediaSize.width;
      const maxBarWidth = chartWidth * MAX_BAR_WIDTH_RATIO;

      for (const bar of this._bars) {
        const barWidth = bar.widthRatio * maxBarWidth;
        // Draw from right side of chart
        const x = chartWidth - barWidth;
        const h = Math.max(bar.height - 0.5, 1);

        if (bar.isPoc) {
          ctx.fillStyle = 'rgba(255, 193, 7, 0.45)';
        } else if (bar.inValueArea) {
          ctx.fillStyle = 'rgba(100, 181, 246, 0.3)';
        } else {
          ctx.fillStyle = 'rgba(156, 163, 175, 0.2)';
        }

        ctx.fillRect(x, bar.y, barWidth, h);

        // Left edge border
        if (bar.isPoc) {
          ctx.strokeStyle = 'rgba(255, 193, 7, 0.8)';
        } else if (bar.inValueArea) {
          ctx.strokeStyle = 'rgba(100, 181, 246, 0.5)';
        } else {
          ctx.strokeStyle = 'rgba(156, 163, 175, 0.3)';
        }
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, bar.y);
        ctx.lineTo(x, bar.y + h);
        ctx.stroke();
      }
    });
  }
}

class VrvpPaneView implements IPrimitivePaneView {
  private _renderer = new VrvpPaneRenderer();

  update(bars: BarRect[]) {
    this._renderer.update(bars);
  }

  zOrder(): 'bottom' {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class VrvpAxisView implements ISeriesPrimitiveAxisView {
  private _price: number;
  private _label: string;
  private _color: string;
  private _series: ISeriesApi<SeriesType, Time> | null = null;

  constructor(price: number, label: string, color: string) {
    this._price = price;
    this._label = label;
    this._color = color;
  }

  setSeries(series: ISeriesApi<SeriesType, Time>) {
    this._series = series;
  }

  coordinate(): number {
    if (!this._series) return -1;
    return this._series.priceToCoordinate(this._price) ?? -1;
  }

  text(): string {
    return this._label;
  }

  textColor(): string {
    return '#1a1a2e';
  }

  backColor(): string {
    return this._color;
  }

  visible(): boolean {
    return this.coordinate() >= 0;
  }

  tickVisible(): boolean {
    return false;
  }
}

export class VrvpPrimitive implements ISeriesPrimitive<Time> {
  private _profile: VolumeProfileAnalysis | null = null;
  private _paneView = new VrvpPaneView();
  private _paneViews: IPrimitivePaneView[] = [this._paneView];
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _chart: IChartApiBase<Time> | null = null;
  private _axisViews: ISeriesPrimitiveAxisView[] = [];
  private _requestUpdate: (() => void) | null = null;

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._series = param.series;
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
    this._rebuildAxisViews();
  }

  detached(): void {
    this._series = null;
    this._chart = null;
    this._requestUpdate = null;
  }

  setProfile(profile: VolumeProfileAnalysis | null): void {
    this._profile = profile;
    this._rebuildAxisViews();
    if (this._requestUpdate) this._requestUpdate();
  }

  updateAllViews(): void {
    const bars = this._calculateBars();
    this._paneView.update(bars);
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._axisViews;
  }

  private _rebuildAxisViews(): void {
    if (!this._profile || !this._series) {
      this._axisViews = [];
      return;
    }
    const p = this._profile;
    const pocView = new VrvpAxisView(p.poc, 'POC', 'rgba(255,193,7,0.9)');
    const vahView = new VrvpAxisView(p.valueAreaHigh, 'VAH', 'rgba(100,181,246,0.8)');
    const valView = new VrvpAxisView(p.valueAreaLow, 'VAL', 'rgba(100,181,246,0.8)');
    pocView.setSeries(this._series);
    vahView.setSeries(this._series);
    valView.setSeries(this._series);
    this._axisViews = [pocView, vahView, valView];
  }

  private _calculateBars(): BarRect[] {
    if (!this._profile || !this._series) return [];

    const levels = this._profile.levels;
    if (levels.length === 0) return [];

    const maxVolume = Math.max(...levels.map((l) => l.volume));
    if (maxVolume <= 0) return [];

    const bars: BarRect[] = [];

    for (const level of levels) {
      const yTop = this._series.priceToCoordinate(level.priceMax);
      const yBottom = this._series.priceToCoordinate(level.priceMin);
      if (yTop === null || yBottom === null) continue;

      const y = Math.min(yTop, yBottom);
      const height = Math.abs(yBottom - yTop);
      const widthRatio = level.volume / maxVolume;

      const isPoc = level.priceMid === this._profile!.poc;
      const inValueArea =
        level.priceMid >= this._profile!.valueAreaLow &&
        level.priceMid <= this._profile!.valueAreaHigh;

      bars.push({ y, height, widthRatio, isPoc, inValueArea });
    }

    return bars;
  }
}
