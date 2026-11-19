import { Viewport } from './Viewport';

const DRAG_SENSITIVITY = 1.25;
const KEY_SPEED_LANE_PER_SEC = 330;
const DOUBLE_TAP_WINDOW_MS = 260;

export interface InputCallbacks {
  isPlaying: () => boolean;
  onDragDelta: (deltaLaneX: number) => void;
  onTriggerUltimate: () => void;
  onUnlockAudio: () => void;
}

export class InputManager {
  private activePointerId: number | null = null;
  private prevClientX = 0;
  private lastTapTime = 0;
  private lastTapX = 0;
  private keyLeft = false;
  private keyRight = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly viewport: Viewport,
    private readonly callbacks: InputCallbacks
  ) {
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onTouchMoveDoc = this.onTouchMoveDoc.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  attach(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    document.addEventListener('touchmove', this.onTouchMoveDoc, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    document.removeEventListener('touchmove', this.onTouchMoveDoc);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  stepKeyboard(dt: number): void {
    if (!this.callbacks.isPlaying()) return;
    let dir = 0;
    if (this.keyLeft) dir -= 1;
    if (this.keyRight) dir += 1;
    if (dir !== 0) {
      this.callbacks.onDragDelta(dir * KEY_SPEED_LANE_PER_SEC * dt);
    }
  }

  resetState(): void {
    this.activePointerId = null;
    this.keyLeft = false;
    this.keyRight = false;
  }

  private onPointerDown(e: PointerEvent): void {
    this.callbacks.onUnlockAudio();
    if (!this.callbacks.isPlaying()) return;

    if (this.activePointerId === null) {
      this.activePointerId = e.pointerId;
      this.prevClientX = e.clientX;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // 部分嵌入式 WebView 不支持 setPointerCapture，静默忽略
      }

      const now = performance.now();
      const movedDist = Math.abs(e.clientX - this.lastTapX);
      if (now - this.lastTapTime <= DOUBLE_TAP_WINDOW_MS && movedDist < 36) {
        this.callbacks.onTriggerUltimate();
        this.lastTapTime = 0;
      } else {
        this.lastTapTime = now;
        this.lastTapX = e.clientX;
      }
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.activePointerId !== e.pointerId) return;
    if (!this.callbacks.isPlaying()) return;

    const deltaClientX = e.clientX - this.prevClientX;
    this.prevClientX = e.clientX;
    if (deltaClientX === 0) return;

    const cssScale = Math.max(0.1, this.viewport.cssScale);
    const deltaLaneX = (deltaClientX / cssScale) * DRAG_SENSITIVITY;
    this.callbacks.onDragDelta(deltaLaneX);
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.activePointerId === e.pointerId) {
      this.activePointerId = null;
    }
  }

  private onTouchMoveDoc(e: TouchEvent): void {
    if (this.callbacks.isPlaying() || e.target === this.canvas) {
      e.preventDefault();
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      this.keyLeft = true;
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      this.keyRight = true;
    } else if (e.code === 'Space' && this.callbacks.isPlaying()) {
      e.preventDefault();
      this.callbacks.onUnlockAudio();
      this.callbacks.onTriggerUltimate();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      this.keyLeft = false;
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      this.keyRight = false;
    }
  }
}
