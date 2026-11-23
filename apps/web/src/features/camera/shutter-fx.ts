/**
 * Mechanical 35mm SLR shutter + motorized film-advance sound engine,
 * synthesized via Web Audio API (zero audio assets, zero latency).
 */
let ctx: AudioContext | null = null

function getAudioCtx(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function playShutter(muted = false) {
  if (muted) return
  try {
    const audio = getAudioCtx()
    if (!audio) return
    const now = audio.currentTime

    const burst = (at: number, dur: number, gain: number, freq: number, q = 0.9) => {
      const len = Math.ceil(audio.sampleRate * dur)
      const buf = audio.createBuffer(1, len, audio.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
      const src = audio.createBufferSource()
      src.buffer = buf
      const bp = audio.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = freq
      bp.Q.value = q
      const g = audio.createGain()
      g.gain.value = gain
      src.connect(bp).connect(g).connect(audio.destination)
      src.start(at)
    }

    // 1. Focal-plane shutter: mirror slap + curtain 1 + curtain 2
    burst(now, 0.025, 0.85, 1900, 1.1)
    burst(now + 0.012, 0.032, 0.95, 2700, 0.9)
    burst(now + 0.062, 0.042, 0.62, 1350, 1.0)

    // 2. Motorized 35mm film advance whir (+130ms..+350ms)
    const windStart = now + 0.13
    const windDur = 0.22
    const osc = audio.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(115, windStart)
    osc.frequency.exponentialRampToValueAtTime(175, windStart + 0.09)
    osc.frequency.exponentialRampToValueAtTime(140, windStart + windDur)

    const windFilter = audio.createBiquadFilter()
    windFilter.type = 'bandpass'
    windFilter.frequency.value = 620
    windFilter.Q.value = 2.2

    const windGain = audio.createGain()
    windGain.gain.setValueAtTime(0.001, windStart)
    windGain.gain.linearRampToValueAtTime(0.11, windStart + 0.035)
    windGain.gain.setValueAtTime(0.1, windStart + windDur - 0.05)
    windGain.gain.exponentialRampToValueAtTime(0.001, windStart + windDur)

    osc.connect(windFilter).connect(windGain).connect(audio.destination)
    osc.start(windStart)
    osc.stop(windStart + windDur + 0.01)

    // 3. Soft mechanical frame-lock click
    burst(windStart + windDur - 0.01, 0.02, 0.35, 3100, 1.4)
  } catch {
    /* audio blocked — silent is fine */
  }
}

export function haptic() {
  try {
    navigator.vibrate?.([12, 40, 8])
  } catch {
    /* unsupported */
  }
}
