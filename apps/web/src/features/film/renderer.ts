import { coverCrop, FRAME_ASPECT } from './geometry'
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shader'
import type { FilmLook } from './stocks'

export type FilmSource = HTMLVideoElement | ImageBitmap | HTMLImageElement | HTMLCanvasElement

function sourceSize(src: FilmSource): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight]
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight]
  return [src.width, src.height]
}

export class WebGLUnavailableError extends Error {
  constructor() {
    super('WebGL2 is not available')
  }
}

/**
 * Renders a camera/image source through the film shader onto a canvas.
 * One instance per canvas (preview and capture each get their own).
 */
export class FilmRenderer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private tex: WebGLTexture
  private loc = new Map<string, WebGLUniformLocation | null>()

  constructor(canvas: HTMLCanvasElement, opts: { preserveDrawingBuffer?: boolean } = {}) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    })
    if (!gl) throw new WebGLUnavailableError()
    this.gl = gl

    const vs = this.compile(gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`film shader link failed: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program
    gl.useProgram(program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    this.tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  private compile(type: number, src: string) {
    const gl = this.gl
    const sh = gl.createShader(type)
    if (!sh) throw new Error('createShader failed')
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`film shader compile failed: ${gl.getShaderInfoLog(sh)}`)
    }
    return sh
  }

  private u(name: string) {
    if (!this.loc.has(name)) this.loc.set(name, this.gl.getUniformLocation(this.program, name))
    return this.loc.get(name) ?? null
  }

  setSize(width: number, height: number) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
  }

  /** Returns false when the source has no frame yet (e.g. video still loading). */
  render(src: FilmSource, look: FilmLook, opts: { mirror?: boolean; seed?: number } = {}) {
    const [sw, sh] = sourceSize(src)
    if (!sw || !sh) return false
    const gl = this.gl
    const { width, height } = this.canvas

    gl.viewport(0, 0, width, height)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)

    const crop = coverCrop(sw, sh, FRAME_ASPECT)
    gl.uniform4f(this.u('uCrop'), crop.scaleX, crop.scaleY, crop.offsetX, crop.offsetY)
    gl.uniform1i(this.u('uMirror'), opts.mirror ? 1 : 0)
    gl.uniform2f(this.u('uRes'), width, height)
    gl.uniform1f(this.u('uSeed'), opts.seed ?? Math.random())

    gl.uniform1f(this.u('uExposure'), look.exposure)
    gl.uniform1f(this.u('uContrast'), look.contrast)
    gl.uniform1f(this.u('uSaturation'), look.saturation)
    gl.uniform1f(this.u('uFade'), look.fade)
    gl.uniform3fv(this.u('uShadowTint'), look.shadowTint)
    gl.uniform3fv(this.u('uHighTint'), look.highlightTint)
    gl.uniform3fv(this.u('uBalance'), look.balance)
    // grain size is defined at capture resolution; scale it down for small previews
    gl.uniform1f(this.u('uGrain'), look.grain)
    gl.uniform1f(this.u('uGrainSize'), Math.max(1, look.grainSize * (height / 2048) * 1.4))
    gl.uniform1f(this.u('uHalation'), look.halation)
    gl.uniform3fv(this.u('uHalationTint'), look.halationTint)
    gl.uniform1f(this.u('uVignette'), look.vignette)
    gl.uniform1i(this.u('uMono'), look.monochrome ? 1 : 0)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    return true
  }

  /**
   * Frees GPU objects. Does NOT force-lose the context: a canvas returns the same context
   * on every getContext() call, so a remount (React strict mode, HMR) would get a dead one.
   */
  dispose() {
    const gl = this.gl
    gl.deleteTexture(this.tex)
    gl.deleteProgram(this.program)
  }
}
