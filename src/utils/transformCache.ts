/**
 * Transform 字符串缓存 - 避免重复创建相同的CSS transform字符串
 * 
 * 例如：scale(0.5) 这样的字符串在100个组件中可能重复出现，
 * 通过缓存可以大幅减少字符串分配和GC压力
 */

class TransformCache {
  private scaleXCache = new Map<number, string>();
  private scaleYCache = new Map<number, string>();
  private translateXCache = new Map<number, string>();
  private translateYCache = new Map<number, string>();

  getScaleX(percent: number): string {
    const normalized = Math.min(Math.max(percent, 0), 100);
    const scale = normalized / 100;
    
    if (!this.scaleXCache.has(scale)) {
      this.scaleXCache.set(scale, `scaleX(${scale})`);
    }
    return this.scaleXCache.get(scale)!;
  }

  getScaleY(percent: number): string {
    const normalized = Math.min(Math.max(percent, 0), 100);
    const scale = normalized / 100;
    
    if (!this.scaleYCache.has(scale)) {
      this.scaleYCache.set(scale, `scaleY(${scale})`);
    }
    return this.scaleYCache.get(scale)!;
  }

  getTranslateX(percent: number): string {
    const normalized = percent - 100;
    
    if (!this.translateXCache.has(normalized)) {
      this.translateXCache.set(normalized, `translateX(${normalized}%)`);
    }
    return this.translateXCache.get(normalized)!;
  }

  getTranslateY(percent: number): string {
    const normalized = 100 - percent;
    
    if (!this.translateYCache.has(normalized)) {
      this.translateYCache.set(normalized, `translateY(${normalized}%)`);
    }
    return this.translateYCache.get(normalized)!;
  }

  clear(): void {
    this.scaleXCache.clear();
    this.scaleYCache.clear();
    this.translateXCache.clear();
    this.translateYCache.clear();
  }

  get totalCached(): number {
    return this.scaleXCache.size + this.scaleYCache.size + 
           this.translateXCache.size + this.translateYCache.size;
  }
}

export const transformCache = new TransformCache();

