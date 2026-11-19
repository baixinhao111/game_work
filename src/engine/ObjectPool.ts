export interface Poolable {
  active: boolean;
}

export class ObjectPool<T extends Poolable> {
  private readonly pool: T[] = [];
  private readonly activeList: T[] = [];

  constructor(
    private readonly factory: () => T,
    private readonly reset: (item: T) => void,
    prewarmCount: number
  ) {
    for (let i = 0; i < prewarmCount; i++) {
      const obj = this.factory();
      obj.active = false;
      this.pool.push(obj);
    }
  }

  acquire(): T {
    const item = this.pool.length > 0 ? this.pool.pop()! : this.factory();
    this.reset(item);
    item.active = true;
    this.activeList.push(item);
    return item;
  }

  get activeItems(): readonly T[] {
    return this.activeList;
  }

  get activeCount(): number {
    return this.activeList.length;
  }

  get pooledCount(): number {
    return this.pool.length;
  }

  /**
   * O(1) Swap-and-Pop 回收失活对象，零数组元素搬移开销
   */
  sweepInactive(): void {
    let i = this.activeList.length;
    while (i--) {
      const item = this.activeList[i];
      if (!item.active) {
        const lastIdx = this.activeList.length - 1;
        if (i !== lastIdx) {
          this.activeList[i] = this.activeList[lastIdx];
        }
        this.activeList.pop();
        this.pool.push(item);
      }
    }
  }

  releaseAll(): void {
    while (this.activeList.length > 0) {
      const item = this.activeList.pop()!;
      item.active = false;
      this.pool.push(item);
    }
  }
}
