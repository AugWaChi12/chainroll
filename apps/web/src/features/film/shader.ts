export const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

/**
 * Parametric film emulation.
 * order: crop → exposure/balance → halation → tone curve + fade → split tone → saturation/mono → vignette → grain
 */
export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTex;
uniform vec4 uCrop;        // scale.xy, offset.xy
uniform bool uMirror;
uniform vec2 uRes;         // output size px
uniform float uSeed;

uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform float uFade;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform vec3 uBalance;
uniform float uGrain;
uniform float uGrainSize;
uniform float uHalation;
uniform vec3 uHalationTint;
uniform float uVignette;
uniform bool uMono;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 srgbToLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 linearToSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

vec2 srcUv(vec2 uv) {
  vec2 p = uv;
  if (uMirror) p.x = 1.0 - p.x;
  p.y = 1.0 - p.y;                 // texture rows are top-down
  return p * uCrop.xy + uCrop.zw;
}

vec3 sampleLin(vec2 uv) { return srgbToLinear(texture(uTex, srcUv(uv)).rgb); }

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// filmic S-curve around mid-grey, strength k
float sCurve(float x, float k) {
  float s = x * x * (3.0 - 2.0 * x);
  return mix(x, s, k);
}

void main() {
  vec2 uv = vUv;
  vec3 col = sampleLin(uv) * exp2(uExposure) * uBalance;

  // halation: bright neighbours bleed a warm glow
  if (uHalation > 0.0) {
    // radius scales with frame height so preview and capture match (~0.9% of height)
    vec2 px = vec2(uRes.y / uRes.x, 1.0) * 0.009;
    float glow = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982 + 0.39;
      vec2 o = vec2(cos(a), sin(a)) * px;
      glow += smoothstep(0.6, 1.0, dot(sampleLin(uv + o), LUMA));
      glow += smoothstep(0.6, 1.0, dot(sampleLin(uv + o * 2.4), LUMA)) * 0.6;
    }
    glow /= 12.8;
    // glow only where the pixel itself isn't already blown out
    col += glow * (1.0 - smoothstep(0.7, 1.0, dot(col, LUMA))) * uHalationTint * uHalation * 1.4;
  }

  // back to display space for grading
  col = linearToSrgb(col);

  // tone curve per channel + faded blacks
  col = vec3(sCurve(clamp(col.r, 0.0, 1.0), uContrast),
             sCurve(clamp(col.g, 0.0, 1.0), uContrast),
             sCurve(clamp(col.b, 0.0, 1.0), uContrast));
  col = mix(vec3(uFade), vec3(1.0 - uFade * 0.25), col);

  // split toning
  float l = dot(col, LUMA);
  col += uShadowTint * (1.0 - smoothstep(0.0, 0.5, l));
  col += uHighTint * smoothstep(0.5, 1.0, l);

  // saturation / monochrome
  l = dot(col, LUMA);
  col = uMono ? vec3(l) : mix(vec3(l), col, uSaturation);

  // vignette
  vec2 d = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  col *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(d) * 1.1);

  // grain: luminance-weighted, strongest in mid-tones
  vec2 gp = floor(gl_FragCoord.xy / uGrainSize);
  float n = (hash(gp) + hash(gp + 17.0) - 1.0);
  float w = 1.0 - abs(l - 0.5) * 1.4;
  col += n * uGrain * 0.12 * max(w, 0.15);

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
