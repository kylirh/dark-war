/**
 * Procedural adaptive music engine built on Web Audio.
 *
 * The score is generated at runtime from layered drones, pulses, percussion,
 * melody fragments, radio chatter, ambient stems, and enemy leitmotifs.
 */

import { EntityKind, GameState, MonsterType } from "../engine/types";

export type MusicScene =
  | "title"
  | "main-menu"
  | "intro-story"
  | "outside-peaceful"
  | "megacorp-quiet"
  | "megacorp-alert"
  | "megacorp-combat"
  | "megacorp-heavy-combat"
  | "death";

interface MusicMood {
  scene: MusicScene;
  combatIntensity: number;
  threatLevel: number;
  lowHealth: number;
  timeScale: number;
  enemyCount: number;
  enemyDensity: number;
  explorationRatio: number;
  enemyWeights: Record<MonsterType, number>;
}

interface MusicLayer {
  gain: GainNode;
  level: number;
}

interface VoiceGainTargets {
  drone: number;
  outsideStem: number;
  megacorpStem: number;
  tension: number;
  percussion: number;
  melody: number;
  lead: number;
  chords: number;
  bass: number;
  arp: number;
  drums: number;
  radio: number;
  modulation: number;
  lowHealth: number;
  mutant: number;
  rat: number;
  skulker: number;
  utilityBot: number;
}

function zeroEnemyWeights(): Record<MonsterType, number> {
  const weights = {} as Record<MonsterType, number>;
  for (const type of Object.values(MonsterType)) weights[type] = 0;
  return weights;
}

const DEFAULT_ENEMY_WEIGHTS: Record<MonsterType, number> = zeroEnemyWeights();

const SCENE_ROOTS: Record<MusicScene, number> = {
  title: 36.71,
  "main-menu": 41.2,
  "intro-story": 32.7,
  "outside-peaceful": 43.65,
  "megacorp-quiet": 36.71,
  "megacorp-alert": 38.89,
  "megacorp-combat": 36.71,
  "megacorp-heavy-combat": 34.65,
  death: 30.87,
};

const SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10, 12];
const PROCEDURAL_OUTPUT_GAIN = 1.7;
const MUSIC_STEP_LOOKAHEAD_SECONDS = 0.45;

const SCENE_PROFILES: Record<
  MusicScene,
  {
    bpm: number;
    rootMidi: number;
    progression: number[];
    scale: number[];
  }
> = {
  title: {
    bpm: 84,
    rootMidi: 38,
    progression: [0, -3, -5, -2],
    scale: [0, 2, 3, 5, 7, 10],
  },
  "main-menu": {
    bpm: 78,
    rootMidi: 41,
    progression: [0, -5, -3, -7],
    scale: [0, 2, 3, 5, 7, 10],
  },
  "intro-story": {
    bpm: 72,
    rootMidi: 36,
    progression: [0, -2, -5, -7],
    scale: [0, 2, 3, 5, 7, 8, 10],
  },
  "outside-peaceful": {
    bpm: 76,
    rootMidi: 45,
    progression: [0, 5, 3, -2],
    scale: [0, 2, 4, 7, 9, 12],
  },
  "megacorp-quiet": {
    bpm: 86,
    rootMidi: 38,
    progression: [0, -5, -2, -7],
    scale: [0, 2, 3, 5, 7, 10],
  },
  "megacorp-alert": {
    bpm: 104,
    rootMidi: 38,
    progression: [0, -2, -5, -1],
    scale: [0, 1, 3, 5, 7, 8, 10],
  },
  "megacorp-combat": {
    bpm: 126,
    rootMidi: 38,
    progression: [0, -1, -5, -2],
    scale: [0, 1, 3, 5, 6, 7, 10],
  },
  "megacorp-heavy-combat": {
    bpm: 142,
    rootMidi: 36,
    progression: [0, -1, -6, -2],
    scale: [0, 1, 3, 5, 6, 7, 10],
  },
  death: {
    bpm: 58,
    rootMidi: 34,
    progression: [0, -5, -8, -7],
    scale: [0, 1, 3, 5, 7, 8, 10],
  },
};

type AudioContextConstructor = new () => AudioContext;
type LegacyAudioGlobal = typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * clamp01(t);
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function makeRng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(
    new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT),
  );
  const drive = Math.max(1, amount);
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] =
      ((3 + drive) * x * 20 * (Math.PI / 180)) /
      (Math.PI + drive * Math.abs(x));
  }
  return curve;
}

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  return (
    globalThis.AudioContext ??
    (globalThis as LegacyAudioGlobal).webkitAudioContext
  );
}

class MusicPlayer {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private distortion: WaveShaperNode | null = null;
  private layers: Record<keyof VoiceGainTargets, MusicLayer> | null = null;
  private volume: number = 0.3;
  private _playing: boolean = false;
  private unlockListenersInstalled: boolean = false;
  private schedulerId: number | null = null;
  private nextPulseAt: number = 0;
  private nextPercussionAt: number = 0;
  private nextMelodyAt: number = 0;
  private nextRadioAt: number = 0;
  private nextMusicStepAt: number = 0;
  private musicStepIndex: number = 0;
  private nextLeitmotifAt: Record<MonsterType, number> = zeroEnemyWeights();
  private mood: MusicMood = {
    scene: "main-menu",
    combatIntensity: 0,
    threatLevel: 0,
    lowHealth: 0,
    timeScale: 1,
    enemyCount: 0,
    enemyDensity: 0,
    explorationRatio: 0,
    enemyWeights: { ...DEFAULT_ENEMY_WEIGHTS },
  };

  /**
   * Prepare the procedural graph.
   */
  public async load(): Promise<void> {
    this.installUnlockListeners();
  }

  /**
   * Start or resume the procedural score.
   */
  public play(): void {
    this._playing = true;
    this.installUnlockListeners();
    const context = this.ensureGraph();
    if (!context) return;
    this.startScheduler();
    this.applyMoodTargets();
    this.resumeContext();
  }

  /**
   * Pause generation without destroying the graph.
   */
  public pause(): void {
    this._playing = false;
    this.stopScheduler();
    this.audioContext?.suspend().catch(() => {});
  }

  /**
   * Set master music volume.
   */
  public setVolume(v: number): void {
    this.volume = clamp01(v);
    if (!this.masterGain || !this.audioContext) return;
    this.masterGain.gain.setTargetAtTime(
      this._playing ? this.getMasterVolume() : 0,
      this.audioContext.currentTime,
      0.08,
    );
  }

  public getVolume(): number {
    return this.volume;
  }

  public isPlaying(): boolean {
    return this._playing;
  }

  /**
   * Crossfade to a high-level musical scene.
   */
  public setScene(scene: MusicScene): void {
    if (this.mood.scene === scene) return;
    this.mood = {
      ...this.mood,
      scene,
      combatIntensity: scene.includes("combat") ? this.mood.combatIntensity : 0,
      threatLevel: scene.includes("combat") ? this.mood.threatLevel : 0,
    };
    this.applyMoodTargets();
  }

  /**
   * Let the score follow the current game state.
   */
  public updateForGameState(state: GameState, threatLevel: number): void {
    const player = state.player;
    const hpRatio = player.hpMax > 0 ? clamp01(player.hp / player.hpMax) : 1;
    const enemyWeights: Record<MonsterType, number> = {
      ...DEFAULT_ENEMY_WEIGHTS,
    };
    const explorationRatio = this.computeExplorationRatio(state);
    let enemyCount = 0;
    let visibleAlerted = 0;
    let nearbyMonsters = 0;
    let incomingBullets = 0;

    for (const entity of state.entities) {
      if (entity.kind === EntityKind.MONSTER) {
        if (entity.hp <= 0) continue;
        enemyCount += 1;

        const dx = entity.worldX - player.worldX;
        const dy = entity.worldY - player.worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const near = dist < 32 * 14;
        const visible = state.visible.has(
          entity.gridY * state.mapWidth + entity.gridX,
        );
        const alert = clamp01((entity.alertLevel ?? 0) / 100);
        const pressure = clamp01(
          (near ? 0.35 : 0) + (visible ? 0.35 : 0) + alert * 0.45,
        );

        if (pressure > enemyWeights[entity.type]) {
          enemyWeights[entity.type] = pressure;
        }
        if (visible && alert > 0.2) visibleAlerted += 1;
        if (near) nearbyMonsters += 1;
      } else if (
        entity.kind === EntityKind.BULLET &&
        entity.ownerId !== player.id
      ) {
        const dx = entity.worldX - player.worldX;
        const dy = entity.worldY - player.worldY;
        if (dx * dx + dy * dy < 32 * 8 * (32 * 8)) incomingBullets += 1;
      }
    }

    const enemyDensity = clamp01(enemyCount / 18);
    const unknownThreat = enemyCount > 0 ? (1 - explorationRatio) * 0.34 : 0;
    const combatIntensity = clamp01(
      threatLevel * 0.62 +
        Math.min(1, visibleAlerted / 5) * 0.22 +
        Math.min(1, nearbyMonsters / 8) * 0.1 +
        Math.min(1, incomingBullets / 3) * 0.25 +
        enemyDensity * 0.18 +
        unknownThreat,
    );
    const scene = this.sceneForGameState(
      state,
      combatIntensity,
      enemyCount,
      explorationRatio,
    );

    this.mood = {
      scene,
      combatIntensity,
      threatLevel: clamp01(threatLevel),
      lowHealth: clamp01(1 - hpRatio),
      timeScale: clamp01(state.sim.timeScale),
      enemyCount,
      enemyDensity,
      explorationRatio,
      enemyWeights,
    };
    this.applyMoodTargets();
  }

  private computeExplorationRatio(state: GameState): number {
    const reachableCount = state.accessible.size;
    if (reachableCount > 0) {
      let exploredReachable = 0;
      for (const tileIndex of state.accessible) {
        if (state.explored.has(tileIndex)) exploredReachable += 1;
      }
      return clamp01(exploredReachable / reachableCount);
    }

    return clamp01(state.explored.size / Math.max(1, state.map.length));
  }

  private sceneForGameState(
    state: GameState,
    combatIntensity: number,
    enemyCount: number,
    explorationRatio: number,
  ): MusicScene {
    if (state.player.hp <= 0) return "death";
    if (state.levelKind === "outside" || state.depth === 0) {
      return "outside-peaceful";
    }
    if (enemyCount === 0 && explorationRatio > 0.88) {
      return "megacorp-quiet";
    }
    if (combatIntensity > 0.72) return "megacorp-heavy-combat";
    if (combatIntensity > 0.42) return "megacorp-combat";
    if (combatIntensity > 0.12) return "megacorp-alert";
    return "megacorp-quiet";
  }

  private ensureGraph(): AudioContext | null {
    if (this.audioContext) return this.audioContext;

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) return null;

    const context = new AudioContextCtor();
    this.audioContext = context;
    this.masterGain = context.createGain();
    this.masterGain.gain.value = this._playing ? this.getMasterVolume() : 0;
    this.dryGain = context.createGain();
    this.wetGain = context.createGain();
    this.distortion = context.createWaveShaper();
    this.distortion.curve = makeDistortionCurve(26);
    this.distortion.oversample = "4x";
    this.wetGain.gain.value = 0;
    this.dryGain.gain.value = 1;

    this.dryGain.connect(this.masterGain);
    this.wetGain.connect(this.distortion);
    this.distortion.connect(this.masterGain);
    this.masterGain.connect(context.destination);

    this.layers = {
      drone: this.createLayer(context),
      outsideStem: this.createLayer(context),
      megacorpStem: this.createLayer(context),
      tension: this.createLayer(context),
      percussion: this.createLayer(context),
      melody: this.createLayer(context),
      lead: this.createLayer(context),
      chords: this.createLayer(context),
      bass: this.createLayer(context),
      arp: this.createLayer(context),
      drums: this.createLayer(context),
      radio: this.createLayer(context),
      modulation: this.createLayer(context),
      lowHealth: this.createLayer(context),
      mutant: this.createLayer(context),
      rat: this.createLayer(context),
      skulker: this.createLayer(context),
      utilityBot: this.createLayer(context),
    };

    this.createDrone(context);
    this.createAdaptiveModulationSynth(context);
    this.createLowHealthNoise(context);
    this.createAmbientStem(context, "outsideStem", 0x0a17_2000, 49);
    this.createAmbientStem(context, "megacorpStem", 0x0d42_1992, 37);
    this.applyMoodTargets();
    return context;
  }

  private installUnlockListeners(): void {
    if (this.unlockListenersInstalled || typeof window === "undefined") return;
    this.unlockListenersInstalled = true;
    window.addEventListener("pointerdown", this.unlockFromGesture, true);
    window.addEventListener("keydown", this.unlockFromGesture, true);
    window.addEventListener("touchstart", this.unlockFromGesture, true);
  }

  private removeUnlockListeners(): void {
    if (!this.unlockListenersInstalled || typeof window === "undefined") return;
    this.unlockListenersInstalled = false;
    window.removeEventListener("pointerdown", this.unlockFromGesture, true);
    window.removeEventListener("keydown", this.unlockFromGesture, true);
    window.removeEventListener("touchstart", this.unlockFromGesture, true);
  }

  private readonly unlockFromGesture = (): void => {
    if (!this._playing) return;
    const context = this.ensureGraph();
    if (!context) return;
    this.startScheduler();
    this.applyMoodTargets();
    this.resumeContext();
  };

  private resumeContext(): void {
    if (!this.audioContext) return;
    this.audioContext
      .resume()
      .then(() => {
        if (this.audioContext?.state === "running") {
          this.removeUnlockListeners();
        }
      })
      .catch(() => {});
  }

  private getMasterVolume(): number {
    return Math.min(1, this.volume * PROCEDURAL_OUTPUT_GAIN);
  }

  private createLayer(context: AudioContext): MusicLayer {
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(this.dryGain as GainNode);
    gain.connect(this.wetGain as GainNode);
    return { gain, level: 0 };
  }

  private createDrone(context: AudioContext): void {
    if (!this.layers) return;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 640;
    filter.Q.value = 0.6;
    filter.connect(this.layers.drone.gain);

    for (const [frequency, type, detune] of [
      [36.71, "sine", -7],
      [55, "triangle", 4],
      [73.42, "sawtooth", 2],
    ] as Array<[number, OscillatorType, number]>) {
      const oscillator = context.createOscillator();
      const voiceGain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      voiceGain.gain.value = type === "sawtooth" ? 0.035 : 0.08;
      oscillator.connect(voiceGain);
      voiceGain.connect(filter);
      oscillator.start();
    }
  }

  private createAdaptiveModulationSynth(context: AudioContext): void {
    if (!this.layers) return;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const voiceGain = context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = 72;
    filter.type = "bandpass";
    filter.frequency.value = 420;
    filter.Q.value = 7;
    voiceGain.gain.value = 0.08;
    oscillator.connect(filter);
    filter.connect(voiceGain);
    voiceGain.connect(this.layers.modulation.gain);
    oscillator.start();

    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
  }

  private createLowHealthNoise(context: AudioContext): void {
    if (!this.layers) return;
    const buffer = this.createNoiseBuffer(context, 2, 0x514f_5748);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    gain.gain.value = 0.035;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.layers.lowHealth.gain);
    source.start();
  }

  private createAmbientStem(
    context: AudioContext,
    layerName: "outsideStem" | "megacorpStem",
    seed: number,
    rootMidi: number,
  ): void {
    if (!this.layers) return;
    const source = context.createBufferSource();
    source.buffer = this.createAmbientStemBuffer(context, seed, rootMidi);
    source.loop = true;
    source.playbackRate.value = layerName === "outsideStem" ? 0.92 : 0.84;
    source.connect(this.layers[layerName].gain);
    source.start();
  }

  private createAmbientStemBuffer(
    context: AudioContext,
    seed: number,
    rootMidi: number,
  ): AudioBuffer {
    const seconds = 18;
    const buffer = context.createBuffer(
      2,
      context.sampleRate * seconds,
      context.sampleRate,
    );
    const rng = makeRng(seed);
    const chord = [0, 3, 7, 10].map((interval) =>
      midiToFrequency(rootMidi + interval),
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      const phaseOffsets = chord.map(() => rng() * Math.PI * 2);
      for (let i = 0; i < data.length; i += 1) {
        const t = i / context.sampleRate;
        const slow = Math.sin(t * 0.045 + channel * 0.7) * 0.5 + 0.5;
        let sample = 0;
        for (let j = 0; j < chord.length; j += 1) {
          sample +=
            Math.sin(t * Math.PI * 2 * chord[j] * 0.25 + phaseOffsets[j]) *
            0.045;
        }
        sample += (rng() * 2 - 1) * 0.018 * slow;
        data[i] = sample;
      }
    }

    return buffer;
  }

  private createNoiseBuffer(
    context: AudioContext,
    seconds: number,
    seed: number,
  ): AudioBuffer {
    const buffer = context.createBuffer(
      1,
      context.sampleRate * seconds,
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    const rng = makeRng(seed);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      last = last * 0.86 + (rng() * 2 - 1) * 0.14;
      data[i] = last;
    }
    return buffer;
  }

  private applyMoodTargets(): void {
    if (
      !this.audioContext ||
      !this.layers ||
      !this.masterGain ||
      !this.dryGain ||
      !this.wetGain
    ) {
      return;
    }

    const targets = this.targetsForMood();
    const now = this.audioContext.currentTime;
    for (const [name, value] of Object.entries(targets) as Array<
      [keyof VoiceGainTargets, number]
    >) {
      const layer = this.layers[name];
      layer.level = value;
      layer.gain.gain.setTargetAtTime(value, now, 1.2);
    }

    const distortionAmount = clamp01((this.mood.lowHealth - 0.52) / 0.34);
    const combatDirt = this.mood.combatIntensity * 0.12;
    this.wetGain.gain.setTargetAtTime(
      distortionAmount * 0.34 + combatDirt,
      now,
      0.7,
    );
    this.dryGain.gain.setTargetAtTime(1 - distortionAmount * 0.18, now, 0.7);
    this.masterGain.gain.setTargetAtTime(
      this._playing ? this.getMasterVolume() : 0,
      now,
      0.08,
    );
  }

  private targetsForMood(): VoiceGainTargets {
    const combat = this.mood.combatIntensity;
    const lowHealth = clamp01((this.mood.lowHealth - 0.48) / 0.45);
    const quietDamp = 1 - combat * 0.28;
    const targets: VoiceGainTargets = {
      drone: 0.24,
      outsideStem: 0,
      megacorpStem: 0,
      tension: 0,
      percussion: 0,
      melody: 0,
      lead: 0,
      chords: 0,
      bass: 0,
      arp: 0,
      drums: 0,
      radio: 0,
      modulation: 0,
      lowHealth,
      mutant: this.mood.enemyWeights[MonsterType.MUTANT] * 0.18,
      rat: this.mood.enemyWeights[MonsterType.RAT] * 0.11,
      skulker: this.mood.enemyWeights[MonsterType.SKULKER] * 0.16,
      utilityBot: this.mood.enemyWeights[MonsterType.UTILITY_BOT] * 0.14,
    };

    switch (this.mood.scene) {
      case "title":
        targets.drone = 0.2;
        targets.megacorpStem = 0.08;
        targets.chords = 0.3;
        targets.bass = 0.18;
        targets.arp = 0.12;
        targets.lead = 0.18;
        targets.drums = 0.18;
        targets.melody = 0.1;
        targets.radio = 0.04;
        targets.tension = 0.06;
        break;
      case "main-menu":
        targets.drone = 0.16;
        targets.megacorpStem = 0.06;
        targets.outsideStem = 0.05;
        targets.chords = 0.26;
        targets.bass = 0.13;
        targets.arp = 0.09;
        targets.lead = 0.12;
        targets.drums = 0.1;
        targets.melody = 0.05;
        targets.radio = 0.06;
        break;
      case "intro-story":
        targets.drone = 0.18;
        targets.megacorpStem = 0.08;
        targets.outsideStem = 0.06;
        targets.chords = 0.24;
        targets.bass = 0.1;
        targets.arp = 0.07;
        targets.lead = 0.14;
        targets.melody = 0.08;
        targets.radio = 0.1;
        targets.tension = 0.12;
        break;
      case "outside-peaceful":
        targets.drone = 0.1 * quietDamp;
        targets.outsideStem = 0.08;
        targets.chords = 0.32;
        targets.bass = 0.11 + combat * 0.1;
        targets.arp = 0.09 + combat * 0.08;
        targets.lead = 0.1;
        targets.drums = 0.04 + combat * 0.18;
        targets.melody = 0.04;
        targets.radio = 0.035;
        targets.tension = combat * 0.28;
        targets.percussion = combat * 0.08;
        targets.modulation = combat * 0.08;
        break;
      case "megacorp-quiet":
        targets.drone = 0.14;
        targets.megacorpStem = 0.08;
        targets.chords = 0.28;
        targets.bass = 0.12;
        targets.arp = this.mood.enemyCount > 0 ? 0.12 : 0.05;
        targets.lead = this.mood.enemyCount > 0 ? 0.08 : 0.04;
        targets.drums = this.mood.enemyCount > 0 ? 0.08 : 0.02;
        targets.radio = 0.025;
        targets.melody = 0.025;
        break;
      case "megacorp-alert":
        targets.drone = 0.16;
        targets.megacorpStem = 0.08;
        targets.chords = 0.24;
        targets.bass = 0.24 + combat * 0.1;
        targets.arp = 0.18 + combat * 0.14;
        targets.lead = 0.12 + combat * 0.08;
        targets.drums = 0.18 + combat * 0.22;
        targets.tension = 0.22 + combat * 0.34;
        targets.modulation = 0.12 + combat * 0.16;
        targets.melody = 0.04;
        targets.radio = 0.035;
        break;
      case "megacorp-combat":
        targets.drone = 0.18;
        targets.megacorpStem = 0.06;
        targets.chords = 0.2;
        targets.bass = 0.36 + combat * 0.16;
        targets.arp = 0.28 + combat * 0.16;
        targets.lead = 0.18 + combat * 0.12;
        targets.drums = 0.48 + combat * 0.22;
        targets.tension = 0.32 + combat * 0.22;
        targets.percussion = 0.16 + combat * 0.2;
        targets.modulation = 0.16 + combat * 0.18;
        targets.melody = 0.06;
        targets.radio = 0.04;
        break;
      case "megacorp-heavy-combat":
        targets.drone = 0.2;
        targets.megacorpStem = 0.05;
        targets.chords = 0.16;
        targets.bass = 0.54;
        targets.arp = 0.46;
        targets.lead = 0.28;
        targets.drums = 0.74;
        targets.tension = 0.58;
        targets.percussion = 0.44;
        targets.modulation = 0.38;
        targets.melody = 0.08;
        targets.radio = 0.06;
        break;
      case "death":
        targets.drone = 0.16;
        targets.megacorpStem = 0.04;
        targets.chords = 0.2;
        targets.bass = 0.06;
        targets.lead = 0.08;
        targets.tension = 0.06;
        targets.lowHealth = 0.8;
        break;
    }

    if (this.mood.enemyCount === 0 && this.mood.explorationRatio > 0.9) {
      targets.tension *= 0.25;
      targets.percussion *= 0.2;
      targets.drums *= 0.35;
      targets.arp *= 0.6;
      targets.radio *= 0.3;
      targets.chords = Math.max(targets.chords, 0.32);
      targets.lead = Math.max(targets.lead, 0.08);
    }

    if (this.mood.lowHealth > 0.5) {
      targets.bass += 0.08;
      targets.tension += 0.14;
      targets.drums += 0.1;
    }

    return targets;
  }

  private startScheduler(): void {
    if (this.schedulerId !== null) return;
    this.schedulerId = window.setInterval(() => this.scheduleAhead(), 90);
  }

  private stopScheduler(): void {
    if (this.schedulerId === null) return;
    window.clearInterval(this.schedulerId);
    this.schedulerId = null;
  }

  private scheduleAhead(): void {
    if (!this._playing || !this.audioContext || !this.layers) return;
    const now = this.audioContext.currentTime;
    const horizon = now + 0.35;
    this.scheduleTensionPulse(now, horizon);
    this.schedulePercussion(now, horizon);
    this.scheduleMusicGrid(now, now + MUSIC_STEP_LOOKAHEAD_SECONDS);
    this.scheduleMelody(now, horizon);
    this.scheduleRadio(now, horizon);
    this.scheduleLeitmotifs(now, horizon);
  }

  private scheduleMusicGrid(now: number, horizon: number): void {
    if (!this.audioContext || !this.layers) return;
    if (this.nextMusicStepAt <= now || this.nextMusicStepAt > now + 1) {
      this.nextMusicStepAt = now + 0.04;
    }

    while (this.nextMusicStepAt < horizon) {
      this.scheduleMusicStep(this.musicStepIndex, this.nextMusicStepAt);
      this.musicStepIndex = (this.musicStepIndex + 1) % 64;
      this.nextMusicStepAt += this.getStepSeconds();
    }
  }

  private getStepSeconds(): number {
    return 60 / SCENE_PROFILES[this.mood.scene].bpm / 4;
  }

  private scheduleMusicStep(step: number, time: number): void {
    if (!this.audioContext || !this.layers) return;
    const sixteenth = step % 16;
    const bar = Math.floor(step / 16);
    const profile = SCENE_PROFILES[this.mood.scene];
    const chordRootMidi =
      profile.rootMidi + profile.progression[bar % profile.progression.length];
    const combat = this.mood.combatIntensity;
    const unknown = 1 - this.mood.explorationRatio;

    this.scheduleChordStep(sixteenth, time, chordRootMidi, combat);
    this.scheduleBassStep(sixteenth, time, chordRootMidi, combat);
    this.scheduleDrumStep(sixteenth, time, combat);
    this.scheduleArpStep(
      step,
      time,
      chordRootMidi,
      profile.scale,
      combat,
      unknown,
    );
    this.scheduleLeadStep(step, time, chordRootMidi, profile.scale, combat);
  }

  private scheduleChordStep(
    sixteenth: number,
    time: number,
    chordRootMidi: number,
    combat: number,
  ): void {
    if (!this.layers) return;
    const level = this.layers.chords.level;
    if (level < 0.02 || sixteenth !== 0) return;

    const minor = this.mood.scene !== "outside-peaceful";
    const intervals = minor ? [0, 3, 7, 10] : [0, 4, 7, 11];
    const duration = lerp(2.4, 1.2, combat);
    const filterFrequency = lerp(900, 1800, combat);
    for (const interval of intervals) {
      this.playFilteredTone(
        time,
        midiToFrequency(chordRootMidi + interval + 12),
        duration,
        level * 0.13,
        "triangle",
        filterFrequency,
        this.layers.chords.gain,
      );
    }
  }

  private scheduleBassStep(
    sixteenth: number,
    time: number,
    chordRootMidi: number,
    combat: number,
  ): void {
    if (!this.layers) return;
    const level = this.layers.bass.level;
    if (level < 0.02) return;

    const combatPattern =
      sixteenth === 0 ||
      sixteenth === 3 ||
      sixteenth === 6 ||
      sixteenth === 8 ||
      sixteenth === 11 ||
      sixteenth === 14;
    const calmPattern = sixteenth === 0 || sixteenth === 8;
    const shouldPlay = combat > 0.35 ? combatPattern : calmPattern;
    if (!shouldPlay) return;

    const octave = sixteenth === 6 || sixteenth === 14 ? -5 : -12;
    const accent = sixteenth === 0 || sixteenth === 8 ? 1 : 0.72;
    this.playBass(
      time,
      midiToFrequency(chordRootMidi + octave),
      lerp(0.34, 0.18, combat),
      level * 0.42 * accent,
      this.layers.bass.gain,
    );
  }

  private scheduleDrumStep(
    sixteenth: number,
    time: number,
    combat: number,
  ): void {
    if (!this.layers) return;
    const level = this.layers.drums.level;
    if (level < 0.015) return;

    const heavy = this.mood.scene === "megacorp-heavy-combat";
    const kickSteps = combat > 0.45 ? [0, 3, 8, 10, 14] : [0, 8];
    if (kickSteps.includes(sixteenth)) {
      this.playKick(
        time,
        heavy ? 58 : 52,
        level * (heavy ? 0.68 : 0.52),
        this.layers.drums.gain,
      );
    }

    if (sixteenth === 4 || sixteenth === 12) {
      this.playSnare(
        time,
        level * lerp(0.32, 0.58, combat),
        this.layers.drums.gain,
      );
    }

    const hatEveryStep = combat > 0.75;
    if ((hatEveryStep || sixteenth % 2 === 0) && combat > 0.08) {
      const hatVolume = level * (sixteenth % 4 === 0 ? 0.12 : 0.08);
      this.playHat(time, hatVolume, this.layers.drums.gain);
    }

    if (heavy && (sixteenth === 7 || sixteenth === 15)) {
      this.playMetalClick(time, level * 0.18, this.layers.drums.gain);
    }
  }

  private scheduleArpStep(
    step: number,
    time: number,
    chordRootMidi: number,
    scale: number[],
    combat: number,
    unknown: number,
  ): void {
    if (!this.layers) return;
    const level = this.layers.arp.level;
    if (level < 0.02) return;

    const sixteenth = step % 16;
    const shouldPlay = combat > 0.55 || sixteenth % 2 === 0;
    if (!shouldPlay) return;

    const index =
      (step * (combat > 0.5 ? 3 : 1) + Math.floor(unknown * 5)) % scale.length;
    const octave = combat > 0.45 && sixteenth % 4 === 2 ? 24 : 12;
    this.playFilteredTone(
      time,
      midiToFrequency(chordRootMidi + scale[index] + octave),
      lerp(0.18, 0.09, combat),
      level * lerp(0.16, 0.24, combat),
      "square",
      lerp(1600, 3600, combat),
      this.layers.arp.gain,
    );
  }

  private scheduleLeadStep(
    step: number,
    time: number,
    chordRootMidi: number,
    scale: number[],
    combat: number,
  ): void {
    if (!this.layers) return;
    const level = this.layers.lead.level;
    if (level < 0.02) return;

    const phraseSteps = combat > 0.45 ? [2, 6, 10, 13] : [4, 11];
    const sixteenth = step % 16;
    if (!phraseSteps.includes(sixteenth)) return;

    const phraseIndex = Math.floor(step / 4) % scale.length;
    const interval = scale[(phraseIndex * 2 + sixteenth) % scale.length];
    const frequency = midiToFrequency(chordRootMidi + interval + 24);
    this.playFilteredTone(
      time,
      frequency,
      combat > 0.45 ? 0.22 : 0.42,
      level * (combat > 0.45 ? 0.24 : 0.18),
      combat > 0.45 ? "sawtooth" : "triangle",
      combat > 0.45 ? 2400 : 1600,
      this.layers.lead.gain,
    );
  }

  private scheduleTensionPulse(now: number, horizon: number): void {
    if (!this.audioContext || !this.layers) return;
    const tension = this.layers.tension.level;
    if (tension < 0.02) {
      this.nextPulseAt = Math.max(this.nextPulseAt, now + 0.5);
      return;
    }

    const interval = lerp(2.8, 0.52, this.mood.combatIntensity);
    if (this.nextPulseAt <= now) this.nextPulseAt = now + 0.04;
    while (this.nextPulseAt < horizon) {
      this.playKick(
        this.nextPulseAt,
        45,
        tension * 0.24,
        this.layers.tension.gain,
      );
      this.nextPulseAt += interval;
    }
  }

  private schedulePercussion(now: number, horizon: number): void {
    if (!this.audioContext || !this.layers) return;
    const level = this.layers.percussion.level;
    if (level < 0.03) {
      this.nextPercussionAt = Math.max(this.nextPercussionAt, now + 0.4);
      return;
    }

    const beat = lerp(0.62, 0.34, this.mood.combatIntensity);
    if (this.nextPercussionAt <= now) this.nextPercussionAt = now + 0.08;
    while (this.nextPercussionAt < horizon) {
      this.playKick(
        this.nextPercussionAt,
        55,
        level * 0.42,
        this.layers.percussion.gain,
      );
      if (this.mood.combatIntensity > 0.45) {
        this.playNoiseHit(
          this.nextPercussionAt + beat * 0.5,
          0.04,
          level * 0.18,
          3500,
          this.layers.percussion.gain,
        );
      }
      if (this.mood.combatIntensity > 0.7) {
        this.playMetalClick(
          this.nextPercussionAt + beat * 0.25,
          level * 0.12,
          this.layers.percussion.gain,
        );
      }
      this.nextPercussionAt += beat;
    }
  }

  private scheduleMelody(now: number, horizon: number): void {
    if (!this.audioContext || !this.layers) return;
    const level = this.layers.melody.level;
    if (level < 0.025) {
      this.nextMelodyAt = Math.max(this.nextMelodyAt, now + 1.5);
      return;
    }

    if (this.nextMelodyAt <= now) this.nextMelodyAt = now + 0.4;
    while (this.nextMelodyAt < horizon) {
      const root = SCENE_ROOTS[this.mood.scene];
      const phraseLength = this.mood.scene === "outside-peaceful" ? 3 : 4;
      for (let i = 0; i < phraseLength; i += 1) {
        const scaleIndex =
          (i * 2 + Math.floor(now + i)) % SCALE_INTERVALS.length;
        const frequency = root * 2 ** (SCALE_INTERVALS[scaleIndex] / 12);
        this.playTone(
          this.nextMelodyAt + i * 0.32,
          frequency * (i === phraseLength - 1 ? 0.5 : 1),
          0.18,
          level * 0.22,
          "triangle",
          this.layers.melody.gain,
        );
      }
      this.nextMelodyAt += lerp(7.5, 3.2, this.mood.combatIntensity);
    }
  }

  private scheduleRadio(now: number, horizon: number): void {
    if (!this.audioContext || !this.layers) return;
    const level = this.layers.radio.level;
    if (level < 0.03) {
      this.nextRadioAt = Math.max(this.nextRadioAt, now + 2.0);
      return;
    }

    if (this.nextRadioAt <= now) this.nextRadioAt = now + 0.8;
    while (this.nextRadioAt < horizon) {
      this.playRadioBurst(this.nextRadioAt, level);
      this.nextRadioAt += lerp(
        9,
        3.4,
        Math.max(this.mood.combatIntensity, level),
      );
    }
  }

  private scheduleLeitmotifs(now: number, horizon: number): void {
    if (!this.audioContext || !this.layers) return;
    this.scheduleEnemyMotif(
      MonsterType.MUTANT,
      this.layers.mutant,
      [0, -1, -5],
      32.7,
      now,
      horizon,
    );
    this.scheduleEnemyMotif(
      MonsterType.RAT,
      this.layers.rat,
      [12, 10, 7, 10],
      49,
      now,
      horizon,
    );
    this.scheduleEnemyMotif(
      MonsterType.SKULKER,
      this.layers.skulker,
      [0, 6, 1],
      41.2,
      now,
      horizon,
    );
    this.scheduleEnemyMotif(
      MonsterType.UTILITY_BOT,
      this.layers.utilityBot,
      [0, 7, 12, 7],
      55,
      now,
      horizon,
    );
  }

  private scheduleEnemyMotif(
    type: MonsterType,
    layer: MusicLayer,
    intervals: number[],
    root: number,
    now: number,
    horizon: number,
  ): void {
    const level = layer.level;
    if (level < 0.025) {
      this.nextLeitmotifAt[type] = Math.max(
        this.nextLeitmotifAt[type],
        now + 1,
      );
      return;
    }

    if (this.nextLeitmotifAt[type] <= now) {
      this.nextLeitmotifAt[type] = now + lerp(0.6, 0.18, level);
    }

    while (this.nextLeitmotifAt[type] < horizon) {
      for (let i = 0; i < intervals.length; i += 1) {
        this.playTone(
          this.nextLeitmotifAt[type] + i * 0.15,
          root * 2 ** (intervals[i] / 12),
          type === MonsterType.UTILITY_BOT ? 0.1 : 0.18,
          level * 0.22,
          type === MonsterType.UTILITY_BOT ? "square" : "sine",
          layer.gain,
        );
      }
      this.nextLeitmotifAt[type] += lerp(8, 2.6, level);
    }
  }

  private playTone(
    startTime: number,
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    destination: AudioNode,
  ): void {
    if (!this.audioContext) return;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, volume),
      startTime + 0.03,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.03);
  }

  private playFilteredTone(
    startTime: number,
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    filterFrequency: number,
    destination: AudioNode,
  ): void {
    if (!this.audioContext) return;
    const oscillator = this.audioContext.createOscillator();
    const filter = this.audioContext.createBiquadFilter();
    const gain = this.audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    filter.type =
      type === "square" || type === "sawtooth" ? "lowpass" : "bandpass";
    filter.frequency.setValueAtTime(filterFrequency, startTime);
    filter.Q.value = type === "triangle" ? 1.2 : 0.9;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, volume),
      startTime + 0.018,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.04);
  }

  private playBass(
    startTime: number,
    frequency: number,
    duration: number,
    volume: number,
    destination: AudioNode,
  ): void {
    if (!this.audioContext) return;
    const oscillator = this.audioContext.createOscillator();
    const sub = this.audioContext.createOscillator();
    const filter = this.audioContext.createBiquadFilter();
    const gain = this.audioContext.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(frequency, startTime);
    sub.type = "sine";
    sub.frequency.setValueAtTime(frequency * 0.5, startTime);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(260, startTime);
    filter.frequency.exponentialRampToValueAtTime(90, startTime + duration);
    filter.Q.value = 4;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, volume),
      startTime + 0.012,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    oscillator.start(startTime);
    sub.start(startTime);
    oscillator.stop(startTime + duration + 0.03);
    sub.stop(startTime + duration + 0.03);
  }

  private playKick(
    startTime: number,
    frequency: number,
    volume: number,
    destination: AudioNode,
  ): void {
    if (!this.audioContext) return;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency * 1.9, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency,
      startTime + 0.16,
    );
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, volume),
      startTime + 0.012,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.34);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.36);
  }

  private playNoiseHit(
    startTime: number,
    duration: number,
    volume: number,
    cutoff: number,
    destination: AudioNode,
  ): void {
    if (!this.audioContext) return;
    const source = this.audioContext.createBufferSource();
    const filter = this.audioContext.createBiquadFilter();
    const gain = this.audioContext.createGain();
    source.buffer = this.createNoiseBuffer(
      this.audioContext,
      Math.max(0.05, duration),
      0x4849_5448,
    );
    filter.type = "highpass";
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, volume),
      startTime + 0.005,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(startTime);
    source.stop(startTime + duration + 0.02);
  }

  private playSnare(
    startTime: number,
    volume: number,
    destination: AudioNode,
  ): void {
    if (!this.audioContext) return;
    this.playNoiseHit(startTime, 0.16, volume, 1800, destination);
    this.playTone(startTime, 185, 0.09, volume * 0.28, "triangle", destination);
  }

  private playHat(
    startTime: number,
    volume: number,
    destination: AudioNode,
  ): void {
    this.playNoiseHit(startTime, 0.045, volume, 6200, destination);
  }

  private playMetalClick(
    startTime: number,
    volume: number,
    destination: AudioNode,
  ): void {
    this.playTone(startTime, 1300, 0.045, volume, "square", destination);
    this.playTone(
      startTime + 0.035,
      1760,
      0.04,
      volume * 0.7,
      "square",
      destination,
    );
  }

  private playRadioBurst(startTime: number, volume: number): void {
    if (!this.audioContext || !this.layers) return;
    const burstCount = 4 + Math.floor(this.mood.combatIntensity * 4);
    for (let i = 0; i < burstCount; i += 1) {
      const time = startTime + i * 0.08;
      const frequency = 380 + ((i * 97) % 420);
      this.playTone(
        time,
        frequency,
        0.055,
        volume * 0.16,
        "sawtooth",
        this.layers.radio.gain,
      );
      this.playNoiseHit(time, 0.05, volume * 0.05, 900, this.layers.radio.gain);
    }
  }
}

export const Music = new MusicPlayer();
