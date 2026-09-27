/**
 * 对象池 - 避免频繁创建和销毁对象，减少GC压力
 */

type PoolableObject = Record<string, any>;

class ObjectPool<T extends PoolableObject> {
  private pool: T[] = [];
  private maxSize: number;
  private factory: () => T;

  constructor(factory: () => T, initialSize = 0, maxSize = 1000) {
    this.factory = factory;
    this.maxSize = maxSize;
    
    // 预热池
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    return this.pool.pop() || this.factory();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      // 清空对象属性，避免内存泄漏
      for (const key in obj) {
        delete obj[key];
      }
      this.pool.push(obj);
    }
  }

  clear(): void {
    this.pool = [];
  }

  get size(): number {
    return this.pool.length;
  }
}

// 创建专用池
export const patchObjectPool = new ObjectPool(() => ({}), 50, 500);
export const motorPatchMapPool = new ObjectPool(() => new Map(), 20, 200);

