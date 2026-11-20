import {
  QUIP_CONFIG,
  type ActiveQuip,
  type QuipChannel,
  type QuipEvent,
  type QuipTone
} from '../data/quips';
import type { AudioEngine } from '../engine/AudioEngine';

const CHANNEL_COOLDOWN: Record<QuipChannel, number> = {
  SQUAD: 2.8,
  BOSS: 1.4,
  CHAT: 3.6
};

const CHANNEL_DURATION: Record<QuipChannel, number> = {
  SQUAD: 2.3,
  BOSS: 2.6,
  CHAT: 3.1
};

export class QuipSystem {
  public squadBubble: ActiveQuip | null = null;
  public bossBubble: ActiveQuip | null = null;
  public chatToast: ActiveQuip | null = null;

  private readonly cooldowns: Record<QuipChannel, number> = {
    SQUAD: 0,
    BOSS: 0,
    CHAT: 0
  };
  private readonly lastLineByEvent: Partial<Record<QuipEvent, string>> = {};
  private nextId = 1;

  constructor(
    private readonly audio: AudioEngine,
    private readonly onChatChange: (quip: ActiveQuip | null) => void
  ) {}

  get activeText(): string {
    return this.chatToast?.text ?? this.squadBubble?.text ?? this.bossBubble?.text ?? '';
  }

  reset(): void {
    this.squadBubble = null;
    this.bossBubble = null;
    this.chatToast = null;
    this.cooldowns.SQUAD = 0;
    this.cooldowns.BOSS = 0;
    this.cooldowns.CHAT = 0;
    this.onChatChange(null);
  }

  step(dt: number): void {
    this.cooldowns.SQUAD = Math.max(0, this.cooldowns.SQUAD - dt);
    this.cooldowns.BOSS = Math.max(0, this.cooldowns.BOSS - dt);
    this.cooldowns.CHAT = Math.max(0, this.cooldowns.CHAT - dt);

    this.squadBubble = this.stepSlot(this.squadBubble, dt);
    this.bossBubble = this.stepSlot(this.bossBubble, dt);

    const hadChat = this.chatToast !== null;
    this.chatToast = this.stepSlot(this.chatToast, dt);
    if (hadChat && !this.chatToast) {
      this.onChatChange(null);
    }
  }

  private stepSlot(q: ActiveQuip | null, dt: number): ActiveQuip | null {
    if (!q) return null;
    q.remaining -= dt;
    return q.remaining > 0 ? q : null;
  }

  private emit(q: ActiveQuip): void {
    this.cooldowns[q.channel] = CHANNEL_COOLDOWN[q.channel];
    if (q.channel === 'SQUAD') {
      this.squadBubble = q;
    } else if (q.channel === 'BOSS') {
      this.bossBubble = q;
    } else {
      this.chatToast = q;
      this.onChatChange(q);
    }
    this.audio.playQuip(q.channel);
  }

  /** 直接在指定通道播报文本（Boss 登场等关键时刻无视冷却） */
  say(
    text: string,
    channel: QuipChannel = 'BOSS',
    tone: QuipTone = channel === 'BOSS' ? 'boss' : 'sass'
  ): void {
    const duration = CHANNEL_DURATION[channel];
    this.emit({
      id: this.nextId++,
      channel,
      tone,
      text,
      sender: channel === 'CHAT' ? '摸鱼系统' : undefined,
      tag: channel === 'CHAT' ? '通知' : undefined,
      icon: channel === 'CHAT' ? '💬' : undefined,
      duration,
      remaining: duration
    });
  }

  trigger(event: QuipEvent): boolean {
    const entry = QUIP_CONFIG[event];
    if (!entry || entry.lines.length === 0) return false;
    if (!entry.priority && this.cooldowns[entry.channel] > 0) return false;

    let text = entry.lines[Math.floor(Math.random() * entry.lines.length)];
    if (entry.lines.length > 1) {
      const prev = this.lastLineByEvent[event];
      if (text === prev) {
        const idx = entry.lines.indexOf(text);
        text = entry.lines[(idx + 1) % entry.lines.length];
      }
    }
    this.lastLineByEvent[event] = text;

    const duration = CHANNEL_DURATION[entry.channel];
    this.emit({
      id: this.nextId++,
      channel: entry.channel,
      tone: entry.tone,
      text,
      sender: entry.sender,
      tag: entry.tag,
      icon: entry.icon,
      duration,
      remaining: duration
    });
    return true;
  }
}
