/**
 * Dirty Checking - 追踪数值变化，避免不必要的DOM更新
 * 
 * 在高频更新场景下，某些值可能在多次更新中保持不变，
 * 通过追踪上次的值，可以跳过冗余的DOM操作
 */

export class DirtyChecker {
  private lastValues = new WeakMap<HTMLElement, Map<string, any>>();

  /**
   * 检查值是否发生变化
   * @param element DOM元素
   * @param key 属性键
   * @param newValue 新值
   * @returns 是否发生了变化
   */
  isDirty(element: HTMLElement, key: string, newValue: any): boolean {
    let elementCache = this.lastValues.get(element);
    
    if (!elementCache) {
      elementCache = new Map();
      this.lastValues.set(element, elementCache);
    }

    const lastValue = elementCache.get(key);
    
    if (lastValue === newValue) {
      return false;
    }

    elementCache.set(key, newValue);
    return true;
  }

  /**
   * 清除某个元素的缓存
   */
  clearElement(element: HTMLElement): void {
    this.lastValues.delete(element);
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.lastValues = new WeakMap();
  }
}

export const dirtyChecker = new DirtyChecker();

