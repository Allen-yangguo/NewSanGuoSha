/**
 * 三国卡牌对战 · Web 测试版音效管理器
 *
 * 设计：本地 MP3 优先，加载失败则用 Web Audio API 程序化合成兜底
 * 这样可以立即听到效果，后续下载真实音效放入 sfx/ 即可替换
 *
 * 音效清单（建议从 mixkit.co / Pixabay / freesound.org 下载 CC0 资源）：
 *   sfx/play.mp3            出牌动作（轻微沙沙声）
 *   sfx/attack_light.mp3    武将攻击·轻击（攻1-2，简单音效）
 *   sfx/attack_heavy.mp3    武将攻击·重击（攻3-5，重声短音 · 走合成兜底）
 *   sfx/hit_light.mp3       伤害命中·轻（小伤害，简单音效）
 *   sfx/hit_heavy.mp3       伤害命中·重（大伤害，重声短音 · 走合成兜底）
 *   sfx/armor_light.mp3     防具格挡·轻（防1-2，简单音效）
 *   sfx/armor_heavy.mp3     防具格挡·重（防3-4，重击音效）
 *   sfx/qi.mp3              补气（铃声）
 *   sfx/heal.mp3            补血（药水）
 *   sfx/strategy.mp3        兵法（书页翻动）
 *   sfx/formation.mp3       阵法（符咒）
 *   sfx/ultimate.mp3        绝杀（剑鸣）
 *   sfx/win.mp3              获胜（凯旋号角）
 *   sfx/lose.mp3             败北（低沉下沉）
 *   sfx/draw.mp3             平局（中性收尾）
 */

/** 音效类型 */
export type SfxType =
  | 'play'          // 出牌动作
  | 'attackLight'   // 武将攻击·轻击（攻1-2）
  | 'attackHeavy'   // 武将攻击·重击（攻3-5）
  | 'hitLight'      // 伤害命中·轻（小伤害）
  | 'hitHeavy'      // 伤害命中·重（大伤害）
  | 'armorLight'    // 防具格挡·轻（防1-2）
  | 'armorHeavy'    // 防具格挡·重（防3-4）
  | 'qi'            // 补气
  | 'heal'          // 补血
  | 'strategy'      // 兵法
  | 'formation'     // 阵法
  | 'ultimate'      // 绝杀
  | 'win'           // 获胜（凯旋号角）
  | 'lose'          // 败北（低沉下沉）
  | 'draw';         // 平局（中性收尾）

const SFX_FILES: Record<SfxType, string> = {
  play: 'sfx/play.mp3',
  attackLight: 'sfx/attack_light.mp3',
  attackHeavy: 'sfx/attack_heavy.mp3',
  hitLight: 'sfx/hit_light.mp3',
  hitHeavy: 'sfx/hit_heavy.mp3',
  armorLight: 'sfx/armor_light.mp3',
  armorHeavy: 'sfx/armor_heavy.mp3',
  qi: 'sfx/qi.mp3',
  heal: 'sfx/heal.mp3',
  strategy: 'sfx/strategy.mp3',
  formation: 'sfx/formation.mp3',
  ultimate: 'sfx/ultimate.mp3',
  win: 'sfx/win.mp3',
  lose: 'sfx/lose.mp3',
  draw: 'sfx/draw.mp3',
};

/** 单个音效的加载状态 */
type LoadState = 'pending' | 'loaded' | 'fallback';

export class SoundManager {
  private audioContext: AudioContext | null = null;
  private audioCache: Map<SfxType, HTMLAudioElement> = new Map();
  private loadState: Map<SfxType, LoadState> = new Map();
  /** 全局音量 0~1 */
  volume: number = 0.5;
  /** 是否静音 */
  muted: boolean = false;
  /** 是否已初始化 */
  private initialized: boolean = false;

  /** 初始化（必须由用户手势触发，如首次点击） */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // 创建 AudioContext（用于合成兜底）
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (Ctx) this.audioContext = new Ctx();
    } catch (e) {
      console.warn('AudioContext 不可用，仅使用 HTMLAudio', e);
    }

    // 异步预加载所有音效文件
    for (const type of Object.keys(SFX_FILES) as SfxType[]) {
      this.preload(type);
    }
  }

  /** 预加载某个音效：尝试加载 MP3，失败则标记为 fallback */
  private preload(type: SfxType): void {
    this.tryLoadMp3(type, 0);
  }

  /** 带重试的 MP3 加载（最多重试 2 次） */
  private tryLoadMp3(type: SfxType, retryCount: number): void {
    const path = SFX_FILES[type];
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.volume = this.volume;
    this.loadState.set(type, 'pending');

    audio.addEventListener('canplaythrough', () => {
      this.loadState.set(type, 'loaded');
      this.audioCache.set(type, audio);
    }, { once: true });

    audio.addEventListener('error', () => {
      if (retryCount < 2) {
        // 加载失败：延迟 500ms 后重试（可能是浏览器并发限制）
        setTimeout(() => this.tryLoadMp3(type, retryCount + 1), 500 + retryCount * 500);
      } else {
        // 重试 2 次仍失败：使用合成兜底
        this.loadState.set(type, 'fallback');
      }
    }, { once: true });

    // 触发加载
    audio.load();
  }

  /** 播放音效 */
  play(type: SfxType): void {
    if (this.muted || !this.initialized) return;

    const state = this.loadState.get(type);
    if (state === 'loaded') {
      // 播放真实 MP3
      const audio = this.audioCache.get(type);
      if (audio) {
        audio.currentTime = 0;
        audio.volume = this.volume;
        audio.play().catch(() => {
          // 自动播放策略阻止：忽略
        });
        return;
      }
    }
    // 兜底：合成
    this.playSynth(type);
  }

  /** 静音切换 */
  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /** 设置音量 */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    for (const audio of this.audioCache.values()) {
      audio.volume = this.volume;
    }
  }

  // ============ Web Audio API 合成兜底 ============

  private playSynth(type: SfxType): void {
    if (!this.audioContext) return;
    // 浏览器自动播放策略：如果 context 处于 suspended，尝试恢复
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    switch (type) {
      case 'play':         this.synthPlay(ctx, now); break;
      case 'attackLight':  this.synthAttackLight(ctx, now); break;
      case 'attackHeavy':  this.synthAttackHeavy(ctx, now); break;
      case 'hitLight':     this.synthHitLight(ctx, now); break;
      case 'hitHeavy':     this.synthHitHeavy(ctx, now); break;
      case 'armorLight':   this.synthArmorLight(ctx, now); break;
      case 'armorHeavy':   this.synthArmorHeavy(ctx, now); break;
      case 'qi':           this.synthQi(ctx, now); break;
      case 'heal':         this.synthHeal(ctx, now); break;
      case 'strategy':     this.synthStrategy(ctx, now); break;
      case 'formation':    this.synthFormation(ctx, now); break;
      case 'ultimate':     this.synthUltimate(ctx, now); break;
      case 'win':          this.synthWin(ctx, now); break;
      case 'lose':         this.synthLose(ctx, now); break;
      case 'draw':       this.synthDraw(ctx, now); break;
    }
  }

  /** 出牌动作：短促的白噪声（沙沙声） */
  private synthPlay(ctx: AudioContext, t: number): void {
    const dur = 0.08;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3 * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = this.volume * 0.4;
    src.connect(gain).connect(ctx.destination);
    src.start(t);
  }

  /** 武将攻击·轻击（攻1-2）：短促高频扫动，简单清脆 */
  private synthAttackLight(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** 武将攻击·重击（攻3-5）：重声短音 - 低频短促重击，干脆有力（~0.1s） */
  private synthAttackHeavy(ctx: AudioContext, t: number): void {
    // 主体：低频正弦短击，瞬间起、快速衰减
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.volume * 0.55, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);

    // 短噪声冲击点（增强"重"的瞬间质感）
    const dur = 0.03;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const ng = ctx.createGain();
    ng.gain.value = this.volume * 0.3;
    src.connect(ng).connect(ctx.destination);
    src.start(t);
  }

  /** 伤害命中·轻（小伤害）：中频短鼓点，清脆简单 */
  private synthHitLight(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  /** 伤害命中·重（大伤害）：重声短音 - 短促低频重击，瞬间爆发（~0.1s） */
  private synthHitHeavy(ctx: AudioContext, t: number): void {
    // 主体：低频正弦短击
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.volume * 0.65, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);

    // 短促冲击噪声（瞬间爆发感）
    const dur = 0.04;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const ng = ctx.createGain();
    ng.gain.value = this.volume * 0.35;
    src.connect(ng).connect(ctx.destination);
    src.start(t);
  }

  /** 防具格挡·轻（防1-2）：单音高频金属脆响，轻巧 */
  private synthArmorLight(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  /** 防具格挡·重（防3-4）：多频金属撞击 + 低频回响，厚重 */
  private synthArmorHeavy(ctx: AudioContext, t: number): void {
    // 高频金属撞击（多个不同频率叠加）
    const freqs = [800, 1200, 1600, 2200];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      const start = t + i * 0.008;
      gain.gain.setValueAtTime(this.volume * 0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    });

    // 低频回响增强重甲感
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t + 0.02);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t + 0.02);
    gain.gain.linearRampToValueAtTime(this.volume * 0.4, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + 0.02);
    osc.stop(t + 0.3);
  }

  /** 补气：上升铃声 */
  private synthQi(ctx: AudioContext, t: number): void {
    const notes = [523, 659, 784]; // C5 E5 G5
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      const start = t + i * 0.04;
      gain.gain.setValueAtTime(this.volume * 0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  }

  /** 补血：温暖上升音 */
  private synthHeal(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** 兵法：翻书 + 低沉哼鸣 */
  private synthStrategy(ctx: AudioContext, t: number): void {
    // 翻书声
    const dur = 0.12;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.2 * Math.sin(i / data.length * Math.PI);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const ng = ctx.createGain();
    ng.gain.value = this.volume * 0.3;
    src.connect(ng).connect(ctx.destination);
    src.start(t);

    // 低沉哼鸣
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.linearRampToValueAtTime(330, t + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.volume * 0.25, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  /** 阵法：神秘符咒 - 多频共振 */
  private synthFormation(ctx: AudioContext, t: number): void {
    const freqs = [392, 587, 880]; // G4 D5 A5
    freqs.forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(this.volume * 0.2, t + 0.05);
      gain.gain.linearRampToValueAtTime(this.volume * 0.2, t + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  /** 绝杀：剑鸣 - 长高频锐利 */
  private synthUltimate(ctx: AudioContext, t: number): void {
    // 第一阶段：金属铮鸣
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(880, t);
    osc1.frequency.exponentialRampToValueAtTime(2200, t + 0.1);
    osc1.frequency.exponentialRampToValueAtTime(440, t + 0.4);
    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0, t);
    gain1.gain.linearRampToValueAtTime(this.volume * 0.4, t + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.5);

    // 第二阶段：低频冲击
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(80, t + 0.1);
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, t + 0.1);
    gain2.gain.linearRampToValueAtTime(this.volume * 0.5, t + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(t + 0.1);
    osc2.stop(t + 0.4);
  }

  /** 获胜：凯旋号角 - 上升大三和弦 */
  private synthWin(ctx: AudioContext, t: number): void {
    // C4 E4 G4 C5 - 上升琶音
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((f, i) => {
      const start = t + i * 0.12;
      // 号角感：锯齿 + 慢起音
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(this.volume * 0.3, start + 0.05);
      gain.gain.linearRampToValueAtTime(this.volume * 0.3, start + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });
    // 终和弦持续
    const finalStart = t + 0.48;
    [523.25, 659.25, 783.99].forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, finalStart);
      gain.gain.linearRampToValueAtTime(this.volume * 0.25, finalStart + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, finalStart + 1.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(finalStart);
      osc.stop(finalStart + 1.2);
    });
  }

  /** 败北：低沉下沉 - 下扫 + 低频 */
  private synthLose(ctx: AudioContext, t: number): void {
    // 下扫
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(330, t);
    osc1.frequency.exponentialRampToValueAtTime(60, t + 1.0);
    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(this.volume * 0.35, t);
    gain1.gain.linearRampToValueAtTime(this.volume * 0.35, t + 0.4);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 1.2);

    // 低频沉击
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(80, t + 0.3);
    osc2.frequency.exponentialRampToValueAtTime(40, t + 0.9);
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, t + 0.3);
    gain2.gain.linearRampToValueAtTime(this.volume * 0.5, t + 0.45);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(t + 0.3);
    osc2.stop(t + 1.0);
  }

  /** 平局：中性收尾 - 单音渐弱 */
  private synthDraw(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.linearRampToValueAtTime(392, t + 0.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.volume * 0.3, t + 0.1);
    gain.gain.linearRampToValueAtTime(this.volume * 0.3, t + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.2);
  }
}

/** 全局单例 */
export const soundManager = new SoundManager();
