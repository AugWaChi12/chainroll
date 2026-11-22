/** Mechanical shutter click, synthesized (no audio asset). Safe to call on any user gesture. */
let ctx: AudioContext | null = null

export function playShutter() {
  try {
    ctx ??= new AudioContext()
    const now = ctx.currentTime
    const burst = (at: number, dur: number, gain: number, freq: number) => {
      const len = Math.ceil(ctx!.sampleRate * dur)
      const buf = ctx!.createBuffer(1, len, ctx!.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
      const src = ctx!.createBufferSource()
      src.buffer = buf
      const bp = ctx!.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = freq
      bp.Q.value = 0.9
      const g = ctx!.createGain()
      g.gain.value = gain
      src.connect(bp).connect(g).connect(ctx!.destination)
      src.start(at)
    }
    burst(now, 0.03, 0.9, 2400) // curtain 1
    burst(now + 0.055, 0.045, 0.6, 1400) // curtain 2
  } catch {
    /* audio blocked — silent is fine */
  }
}

export function haptic() {
  try {
    navigator.vibrate?.(12)
  } catch {
    /* unsupported */
  }
}
