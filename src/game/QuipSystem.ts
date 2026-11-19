import { QUIP_MESSAGES, type QuipEvent } from '../data/quips';

const GLOBAL_COOLDOWN_SEC = 4.0;
const BANNER_DURATION_SEC = 2.6;

export class QuipSystem {
  private cooldownTimer = 0;
  private displayTimer = 0;
  public activeText = '';

  constructor(private readonly onBannerChange: (text: string | null) => void) {}

  reset(): void {
    this.cooldownTimer = 0;
    this.displayTimer = 0;
    this.activeText = '';
    this.onBannerChange(null);
  }

  step(dt: number): void {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    }
    if (this.displayTimer > 0) {
      this.displayTimer -= dt;
      if (this.displayTimer <= 0) {
        this.displayTimer = 0;
        this.activeText = '';
        this.onBannerChange(null);
      }
    }
  }

  trigger(event: QuipEvent): boolean {
    if (this.cooldownTimer > 0) return false;
    const pool = QUIP_MESSAGES[event];
    if (!pool || pool.length === 0) return false;
    const text = pool[Math.floor(Math.random() * pool.length)];
    this.activeText = text;
    this.displayTimer = BANNER_DURATION_SEC;
    this.cooldownTimer = GLOBAL_COOLDOWN_SEC;
    this.onBannerChange(text);
    return true;
  }
}
