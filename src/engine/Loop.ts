export const FIXED_DT = 1 / 60;

export interface LoopCallbacks {
  isPlaying: () => boolean;
  onStep: (dt: number) => void;
  onRender: (alpha: number) => void;
  onAutoPause: () => void;
}

export class GameLoop {
  private rafId: number | null = null;
  private lastTimestamp = 0;
  private accumulator = 0;
  private fpsSamples = 0;
  private fpsTimer = 0;
  public currentFps = 60;

  constructor(private readonly callbacks: LoopCallbacks) {
    this.handleVisibility = this.handleVisibility.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.tick = this.tick.bind(this);
  }

  start(): void {
    if (this.rafId !== null) return;
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('blur', this.handleBlur);
    this.lastTimestamp = 0;
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('blur', this.handleBlur);
  }

  private handleVisibility(): void {
    if (document.hidden && this.callbacks.isPlaying()) {
      this.callbacks.onAutoPause();
    }
    this.lastTimestamp = 0;
    this.accumulator = 0;
  }

  private handleBlur(): void {
    if (this.callbacks.isPlaying()) {
      this.callbacks.onAutoPause();
    }
    this.lastTimestamp = 0;
    this.accumulator = 0;
  }

  private tick(now: number): void {
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = now;
    }
    let frameTime = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;

    if (frameTime > 0.1) {
      frameTime = 0.1;
    } else if (frameTime < 0) {
      frameTime = 0;
    }

    this.fpsSamples++;
    this.fpsTimer += frameTime;
    if (this.fpsTimer >= 0.5) {
      this.currentFps = Math.round(this.fpsSamples / this.fpsTimer);
      this.fpsSamples = 0;
      this.fpsTimer = 0;
    }

    if (this.callbacks.isPlaying()) {
      this.accumulator += frameTime;
      while (this.accumulator >= FIXED_DT) {
        this.callbacks.onStep(FIXED_DT);
        this.accumulator -= FIXED_DT;
      }
    } else {
      this.accumulator = 0;
    }

    this.callbacks.onRender(this.accumulator / FIXED_DT);
    this.rafId = requestAnimationFrame(this.tick);
  }
}
