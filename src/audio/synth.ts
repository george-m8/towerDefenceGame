// A small chiptune voice on the Web Audio API: pulse (with PWM), triangle, saw, sine and
// noise, an ADSR amplitude envelope, a semitone pitch envelope and vibrato. One voice per note; each
// cleans itself up when it ends. The timing maths lives in envelopes.ts.
import {
  MAX_DUTY,
  MIN_DUTY,
  envelopePoints,
  pulseDelay,
  shiftSemitones,
  type Envelope,
} from "./envelopes";

export type Waveform = "pulse" | "triangle" | "sawtooth" | "sine" | "noise";

export interface VoiceSettings {
  wave: Waveform;
  /** Peak gain, 0-1. */
  volume: number;
  envelope: Envelope;
  /** Pulse only: fraction of each cycle that is high (0.5 = square). */
  duty?: number;
  /** Pulse only: sweep the duty cycle with an LFO. `depth` is in duty units (0.2 = ±20%). */
  pwm?: { rate: number; depth: number };
  /** Start this many semitones away from the note and slide onto it over `time` seconds. */
  pitchEnvelope?: { semitones: number; time: number };
  /** Optional low-pass filter cutoff in Hz (softens noise into thumps). */
  lowpass?: number;
  /** Wobble the pitch with an LFO: `rate` in Hz, `depth` in semitones either way. */
  vibrato?: { rate: number; depth: number };
}

/** Longest pulse delay ever needed: the widest duty at the lowest audible pitch. */
const MAX_PULSE_DELAY = 0.1;
/** Extra time after the release before sources stop, so nothing clicks. */
const STOP_PADDING = 0.02;

let liveVoices = 0;

/** Voices currently sounding (for the dev sound test's node-leak check). */
export function liveVoiceCount(): number {
  return liveVoices;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One second of white noise per audio context, looped by every noise voice. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** Plays one note of `voice` at `hz`, starting at audio time `start`, held for `duration` s. */
export function playVoice(
  ctx: BaseAudioContext,
  output: AudioNode,
  voice: VoiceSettings,
  hz: number,
  start: number,
  duration: number,
): void {
  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];

  const amp = ctx.createGain();
  const points = envelopePoints(start, duration, voice.envelope, voice.volume);
  amp.gain.setValueAtTime(points[0].value, points[0].time);
  for (const p of points.slice(1)) amp.gain.linearRampToValueAtTime(p.value, p.time);
  amp.connect(output);
  nodes.push(amp);

  let input: AudioNode = amp;
  if (voice.lowpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(voice.lowpass, start);
    filter.connect(amp);
    nodes.push(filter);
    input = filter;
  }

  /** Adds vibrato to an oscillator's detune (in cents), if the voice has it. */
  const wobble = (osc: OscillatorNode) => {
    if (!voice.vibrato) return;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = voice.vibrato.rate;
    const depth = ctx.createGain();
    depth.gain.value = voice.vibrato.depth * 100;
    lfo.connect(depth).connect(osc.detune);
    nodes.push(depth);
    sources.push(lfo);
  };

  const startHz = voice.pitchEnvelope ? shiftSemitones(hz, voice.pitchEnvelope.semitones) : hz;
  const slideEnd = start + (voice.pitchEnvelope?.time ?? 0);
  /** Sets `param` to `from` at the start and slides it exponentially to `to`. */
  const slide = (param: AudioParam, from: number, to: number) => {
    param.setValueAtTime(from, start);
    if (from !== to) param.exponentialRampToValueAtTime(to, slideEnd);
  };

  if (voice.wave === "noise") {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    noise.connect(input);
    sources.push(noise);
  } else if (voice.wave === "pulse") {
    // pulse = (saw - delayed saw) / 2; the delay sets the duty cycle.
    const duty = voice.duty ?? 0.5;
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    slide(saw.frequency, startHz, hz);
    const direct = ctx.createGain();
    direct.gain.value = 0.5;
    const delay = ctx.createDelay(MAX_PULSE_DELAY);
    slide(delay.delayTime, pulseDelay(startHz, duty), pulseDelay(hz, duty));
    const inverted = ctx.createGain();
    inverted.gain.value = -0.5;
    saw.connect(direct).connect(input);
    saw.connect(delay).connect(inverted).connect(input);
    nodes.push(direct, delay, inverted);
    sources.push(saw);
    wobble(saw);

    if (voice.pwm) {
      // Sweep the delay (and so the duty) around its centre, keeping the pulse in range.
      const depth = Math.min(voice.pwm.depth, duty - MIN_DUTY, MAX_DUTY - duty);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = voice.pwm.rate;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = depth / hz;
      lfo.connect(lfoDepth).connect(delay.delayTime);
      nodes.push(lfoDepth);
      sources.push(lfo);
    }
  } else {
    const osc = ctx.createOscillator();
    osc.type = voice.wave;
    slide(osc.frequency, startHz, hz);
    osc.connect(input);
    sources.push(osc);
    wobble(osc);
  }

  const stopAt = points[points.length - 1].time + STOP_PADDING;
  for (const source of sources) {
    source.start(start);
    source.stop(stopAt);
  }
  liveVoices++;
  sources[0].onended = () => {
    liveVoices--;
    for (const node of [...sources, ...nodes]) node.disconnect();
  };
}
