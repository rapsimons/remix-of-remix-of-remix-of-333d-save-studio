import * as THREE from "three";
import { createDiscMaterial } from "./discShader";
import { CD_V4_DIAMETER } from "./cdV4Contour";

/** Reuse the optical CD grating without changing the original CD model shaders. */
export function createSawbladeMaterial(art: THREE.Texture, back: boolean) {
  const material = createDiscMaterial(CD_V4_DIAMETER / 2, 0, 60);
  material.side = THREE.FrontSide;
  material.transparent = true;
  material.depthWrite = true;
  material.toneMapped = false;
  material.uniforms["uShape"] = { value: art };
  material.uniforms["uBack"] = { value: back ? 1 : 0 };
  material.uniforms["uArt"] = { value: art };
  const helpers = material.fragmentShader.split("  void main() {")[0];
  material.fragmentShader = `${helpers}
    uniform sampler2D uShape;
    uniform float uBack;
    void main() {
      vec2 uv = vLocal.xy / (2.0 * uR) + 0.5;
      if (uBack > 0.5) uv.x = 1.0 - uv.x;
      vec4 art = texture2D(uShape, uv);
      // Do not alpha-test away the partially transparent polycarbonate hub.
      if (art.a < 0.025 || length(uv - 0.5) < 54.0 / 960.0) discard;
      vec3 N = normalize(vN);
      vec3 V = normalize(-vP);
      vec3 R = reflect(-V, N);
      vec3 worldR = normalize((vec4(R, 0.0) * viewMatrix).xyz);
      float cosv = max(dot(N, V), 0.0);
      float r = length(uv - 0.5) * 120.0;
      vec3 rainbow = grating(KEY, V, 0.065) * 1.2
        + grating(STRIP, V, 0.055) + grating(TOP, V, 0.08) * 0.7
        + grating(BOUNCE, V, 0.12) * 0.4;
      vec3 gel = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        if (i >= uLn) break;
        rainbow += grating(uL[i], V, 0.07) * uLc[i];
        gel += pow(max(dot(R, normalize(uL[i])), 0.0), 28.0) * uLc[i];
      }
      float tracks = smoothstep(18.0, 23.0, r);
      float grain = 0.96 + 0.04 * sin(r * 1400.0);
      rainbow *= tracks * grain;
      vec3 reflection = studio(worldR) + gel;
      vec3 col;
      if (uBack > 0.5) {
        col = uTint * (vec3(0.18) + reflection * 0.8) + rainbow * 1.35;
      } else {
        // Preserve the source artwork while letting its chrome catch moving light.
        float chrome = smoothstep(0.25, 0.8, dot(art.rgb, vec3(0.333)));
        col = art.rgb * 0.86 + reflection * (0.16 + chrome * 0.3)
          + rainbow * (0.12 + chrome * 0.38);
        col += min(glare(worldR), vec3(2.0)) * fresnel(cosv, 1.58) * 0.45;
      }
      gl_FragColor = vec4(col, art.a);
      #include <colorspace_fragment>
    }
  `;
  return material;
}