/**
 * LockMap - 按 name 粒度的异步锁
 * 不同配置的写操作可以并行，同一配置的写操作串行化
 */

export class LockMap {
  private locks: Map<string, Promise<void>> = new Map();

  /**
   * 获取指定 name 的锁，如果已有操作在队列中则等待
   * @param name 配置名称
   * @param fn 需要执行的操作
   */
  async acquire(name: string, fn: () => Promise<void> | void): Promise<void> {
    // 等待之前的操作完成
    const previousLock = this.locks.get(name);

    // 使用一个变量来跟踪当前锁的 Promise
    let resolveCurrent: () => void;
    const currentLock = new Promise<void>((resolve) => {
      resolveCurrent = resolve;
    });

    // 更新锁队列（在开始执行前就设置）
    this.locks.set(name, currentLock);

    // 异步执行操作（fire-and-forget，通过 currentLock 通知调用者）
    void (async () => {
      try {
        // 等待前一个锁释放
        if (previousLock) {
          await previousLock.catch(() => {
            // 忽略前一个操作的错误，继续执行
          });
        }
        // 执行当前操作
        await fn();
      } finally {
        // 释放当前锁
        resolveCurrent!();
        // 清理锁：当这个锁仍在队列且已完成时移除
        if (this.locks.get(name) === currentLock) {
          this.locks.delete(name);
        }
      }
    })();

    // 返回当前锁 Promise
    return currentLock;
  }

}
