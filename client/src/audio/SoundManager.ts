/**
 * 三国卡牌对战 · 音效管理器（前端 Vue 版）
 * - MP3 文件放在 public/sfx/，通过 /sfx/xxx.mp3 访问
 * - MP3 加载失败则用 Web Audio API 程序化合成兜底
 */

/** 音效类型 */
export type SfxType =
  | 'play'
  | 'attackLight'
  | 'attackHeavy'
  | 'hitLight'
  | 'hitHeavy'
  | 'armorLight'
  | 'armorHeavy'
  | 'qi'
  | 'heal'
  | 'strategy'
  | 'formation'
  | 'ultimate'
  | 'win'
  | 'lose'
  | 'draw';

const SFX_FILES: Record<SfxType, string> = {
  play: '/sfx/play.mp3',
  attackLight: '/sfx/attack_light.mp3',
  attackHeavy: '/sfx/attack_heavy.mp3',
  hitLight: '/sfx/hit_light.mp3',
  hitHeavy: '/sfx/hit_heavy.mp3',
  armorLight: '/sfx/armor_light.mp3',
  armorHeavy: '/sfx/armor_heavy.mp3',
  qi: '/sfx/qi.mp3',
  heal: '/sfx/heal.mp3',
  strategy: '/sfx/strategy.mp3',
  formation: '/sfx/formation.mp3',
  ultimate: '/sfx/ultimate.mp3',
  win: '/sfx/win.mp3',
  lose: '/sfx/lose.mp3',
  draw: '/sfx/draw.mp3',
};

type LoadState = 'pending' | 'loaded' | 'fallback';

export class SoundManager {
  private audioContext: AudioContext | null = null;
  private audioCache: Map<SfxType, HTMLAudioElement> = new Map();
  private loadState: Map<SfxType, LoadState> = new Map();
  volume: number = 0.5;
  muted: boolean = false;
  private initialized: boolean = false;

  // ===== 背景音乐（优先播放 /sfx/bgm.wav，失败回退 Web Audio 合成循环）=====
  private bgmOn: boolean = true;
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmAudioOn: boolean = false;
  private bgmSynthTimer: ReturnType<typeof setInterval> | null = null;
  private bgmNextBeat: number = 0;
  /** 每秒节拍数（72 BPM） */
  private static BGM_BPM = 72;
  /** 循环长度（拍） */
  private static BGM_LOOP_BEATS = 16;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (Ctx) this.audioContext = new Ctx();
    } catch (e) {
      console.warn('AudioContext 不可用，仅使用 HTMLAudio', e);
    }
    for (const type of Object.keys(SFX_FILES) as SfxType[]) {
      this.preload(type);
    }
    // 读取用户 BGM 开关偏好（默认开）
    try {
      const saved = localStorage.getItem('sgsBgm');
      this.bgmOn = saved === null ? true : saved === '1';
    } catch { this.bgmOn = true; }
  }

  private preload(type: SfxType): void {
    this.tryLoadMp3(type, 0);
  }

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
        setTimeout(() => this.tryLoadMp3(type, retryCount + 1), 500 + retryCount * 500);
      } else {
        this.loadState.set(type, 'fallback');
      }
    }, { once: true });

    audio.load();
  }

  play(type: SfxType): void {
    if (this.muted || !this.initialized) return;
    const state = this.loadState.get(type);
    if (state === 'loaded') {
      const audio = this.audioCache.get(type);
      if (audio) {
        audio.currentTime = 0;
        audio.volume = this.volume;
        audio.play().catch(() => {});
        return;
      }
    }
    this.playSynth(type);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    for (const audio of this.audioCache.values()) {
      audio.volume = this.volume;
    }
  }

  // ============ 背景音乐 ============

  /** BGM 是否开启 */
  isBgmOn(): boolean {
    return this.bgmOn;
  }

  /** 开启/关闭 BGM，返回新状态 */
  toggleBgm(): boolean {
    this.bgmOn = !this.bgmOn;
    try { localStorage.setItem('sgsBgm', this.bgmOn ? '1' : '0'); } catch {}
    if (this.bgmOn) this.startBgm();
    else this.stopBgm();
    return this.bgmOn;
  }

  /** 启动 BGM（优先真实音频文件，失败回退合成循环；需用户手势后调用） */
  startBgm(): void {
    if (!this.bgmOn) return;
    // 尝试真实音频文件（mp3 优先，wav 兜底）
    if (!this.bgmAudio) {
      this.tryLoadBgmFile(0);
    } else if (!this.bgmAudioOn) {
      this.bgmAudioOn = true;
      this.bgmAudio.volume = Math.max(0.2, this.volume * 0.55);
      this.bgmAudio.play().catch(() => {});
    }
  }

  /** BGM 音频文件候选列表 */
  private static BGM_FILES = ['/sfx/bgm.mp3', '/sfx/bgm.wav'];

  /** 依次尝试加载 BGM 文件；全部失败则回退合成循环 */
  private tryLoadBgmFile(index: number): void {
    if (index >= SoundManager.BGM_FILES.length) {
      this.startBgmSynth();
      return;
    }
    const audio = new Audio(SoundManager.BGM_FILES[index]);
    audio.loop = true;
    audio.volume = Math.max(0.2, this.volume * 0.55);
    audio.addEventListener('error', () => {
      this.bgmAudio = null;
      this.tryLoadBgmFile(index + 1);
    }, { once: true });
    audio.addEventListener('canplaythrough', () => {
      this.bgmAudio = audio;
      this.bgmAudioOn = true;
      audio.volume = Math.max(0.2, this.volume * 0.55);
      audio.play().catch(() => {});
    }, { once: true });
    audio.load();
  }

  /** 停止 BGM（同时停文件与合成） */
  stopBgm(): void {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudioOn = false;
    }
    this.stopBgmSynth();
  }

  /** 合成循环调度器启动 */
  private startBgmSynth(): void {
    if (!this.bgmOn) return;
    if (!this.audioContext) return;
    if (this.bgmSynthTimer !== null) return;
    const ctx = this.audioContext;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    this.bgmNextBeat = 0;
    const beatSec = 60 / SoundManager.BGM_BPM;
    const lookahead = 0.7;
    const tick = () => {
      if (!this.audioContext) return;
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      while (this.bgmNextBeat * beatSec < now + lookahead) {
        this.scheduleBgmBeat(this.bgmNextBeat, now);
        this.bgmNextBeat += 1;
      }
    };
    tick();
    this.bgmSynthTimer = setInterval(tick, 200);
  }

  /** 停止合成循环 */
  private stopBgmSynth(): void {
    if (this.bgmSynthTimer !== null) {
      clearInterval(this.bgmSynthTimer);
      this.bgmSynthTimer = null;
    }
  }

  /**
   * 调度一个循环拍上的音符（古风五声音阶 D 宫：D E F# A B）
   * 每 4 拍一个低音铺底，主旋律为舒缓琶音
   */
  private scheduleBgmBeat(beat: number, now: number): void {
    const ctx = this.audioContext;
    if (!ctx) return;
    const beatSec = 60 / SoundManager.BGM_BPM;
    const t = now + beat * beatSec;
    const loop = SoundManager.BGM_LOOP_BEATS;
    const b = beat % loop;
    const vol = this.volume * 0.28;

    // 低音铺底：D3 / A2 交替（每 4 拍）
    const bassNotes: Array<[number, number]> = [[0, 146.83], [4, 110.0], [8, 146.83], [12, 110.0]];
    for (const [bb, freq] of bassNotes) {
      if (b === bb) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol * 0.7, t + 0.03);
        g.gain.setValueAtTime(vol * 0.7, t + beatSec * 2.6);
        g.gain.exponentialRampToValueAtTime(0.001, t + beatSec * 3.6);
        osc.connect(g).connect(ctx.destination);
        osc.start(t); osc.stop(t + beatSec * 3.7);
      }
    }

    // 主旋律（五声音阶 pluck）：[拍, 频率, 时值(拍)]
    const D4 = 293.66, E4 = 329.63, Fs4 = 369.99, A4 = 440.0, B4 = 493.88, D5 = 587.33, E5 = 659.25;
    const melody: Array<[number, number, number]> = [
      [0, D4, 1], [1, Fs4, 1], [2, A4, 2],
      [4, B4, 1], [5, A4, 1], [6, Fs4, 2],
      [8, D5, 2], [10, B4, 1], [11, A4, 1],
      [12, Fs4, 1.5], [13.5, E4, 1], [14.5, D4, 1.5],
    ];
    for (const [mb, freq, dur] of melody) {
      if (Math.abs(b - mb) < 0.001) {
        this.playPluck(freq, t, dur * beatSec, vol * 0.8);
        // 高八度点缀
        if (dur >= 1.5) this.playPluck(freq * 2, t + 0.01, dur * beatSec * 0.8, vol * 0.25);
      }
    }
  }

  /** 古筝/拨弦音色：三角波 + 快速衰减 + 轻微泛音 */
  private playPluck(freq: number, t: number, dur: number, vol: number): void {
    const ctx = this.audioContext;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.4, dur));
    osc.connect(g).connect(ctx.destination);
    osc.start(t); osc.stop(t + Math.max(0.45, dur + 0.1));

    // 第二泛音层（八度）
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.linearRampToValueAtTime(vol * 0.4, t + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.3, dur * 0.7));
    osc2.connect(g2).connect(ctx.destination);
    osc2.start(t); osc2.stop(t + Math.max(0.35, dur * 0.8));
  }

  // ============ Web Audio API 合成兜底 ============

  private playSynth(type: SfxType): void {
    if (!this.audioContext) return;
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
      case 'draw':         this.synthDraw(ctx, now); break;
    }
  }

  private synthPlay(ctx: AudioContext, t: number): void {
    const dur = 0.08;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3 * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = this.volume * 0.4;
    src.connect(gain).connect(ctx.destination);
    src.start(t);
  }

  private synthAttackLight(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.15);
  }

  private synthAttackHeavy(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.volume * 0.55, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.1);

    const dur = 0.03;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const ng = ctx.createGain();
    ng.gain.value = this.volume * 0.3;
    src.connect(ng).connect(ctx.destination);
    src.start(t);
  }

  private synthHitLight(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.12);
  }

  private synthHitHeavy(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.volume * 0.65, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.1);

    const dur = 0.04;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const ng = ctx.createGain();
    ng.gain.value = this.volume * 0.35;
    src.connect(ng).connect(ctx.destination);
    src.start(t);
  }

  private synthArmorLight(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.12);
  }

  private synthArmorHeavy(ctx: AudioContext, t: number): void {
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
      osc.start(start); osc.stop(start + 0.15);
    });
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t + 0.02);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t + 0.02);
    gain.gain.linearRampToValueAtTime(this.volume * 0.4, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + 0.02); osc.stop(t + 0.3);
  }

  private synthQi(ctx: AudioContext, t: number): void {
    const notes = [523, 659, 784];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      const start = t + i * 0.04;
      gain.gain.setValueAtTime(this.volume * 0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start); osc.stop(start + 0.2);
    });
  }

  private synthHeal(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.3);
  }

  private synthStrategy(ctx: AudioContext, t: number): void {
    const dur = 0.12;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.2 * Math.sin(i / data.length * Math.PI);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const ng = ctx.createGain();
    ng.gain.value = this.volume * 0.3;
    src.connect(ng).connect(ctx.destination);
    src.start(t);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.linearRampToValueAtTime(330, t + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.volume * 0.25, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.4);
  }

  private synthFormation(ctx: AudioContext, t: number): void {
    const freqs = [392, 587, 880];
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
      osc.start(t); osc.stop(t + 0.6);
    });
  }

  private synthUltimate(ctx: AudioContext, t: number): void {
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
    osc1.start(t); osc1.stop(t + 0.5);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(80, t + 0.1);
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, t + 0.1);
    gain2.gain.linearRampToValueAtTime(this.volume * 0.5, t + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(t + 0.1); osc2.stop(t + 0.4);
  }

  private synthWin(ctx: AudioContext, t: number): void {
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((f, i) => {
      const start = t + i * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(this.volume * 0.3, start + 0.05);
      gain.gain.linearRampToValueAtTime(this.volume * 0.3, start + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start); osc.stop(start + 0.6);
    });
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
      osc.start(finalStart); osc.stop(finalStart + 1.2);
    });
  }

  private synthLose(ctx: AudioContext, t: number): void {
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(330, t);
    osc1.frequency.exponentialRampToValueAtTime(60, t + 1.0);
    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(this.volume * 0.35, t);
    gain1.gain.linearRampToValueAtTime(this.volume * 0.35, t + 0.4);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(t); osc1.stop(t + 1.2);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(80, t + 0.3);
    osc2.frequency.exponentialRampToValueAtTime(40, t + 0.9);
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, t + 0.3);
    gain2.gain.linearRampToValueAtTime(this.volume * 0.5, t + 0.45);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(t + 0.3); osc2.stop(t + 1.0);
  }

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
    osc.start(t); osc.stop(t + 1.2);
  }
}

/** 全局单例 */
export const soundManager = new SoundManager();
