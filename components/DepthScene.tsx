"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A cut-out picture lifted off the page: every pixel is shifted by how near it
 * is, and a soft shadow falls on the ground beneath, so the pointer — and the
 * page scrolling past — moves the near figures more than the far ones and the
 * shadow less than either. The picture reads as standing above the paper.
 *
 * Two textures and one fragment shader, no library. The map beside the
 * picture carries two things in two channels: red is nearness (white near),
 * green is the soft silhouette the shadow is drawn from.
 *
 * The shadow's colour is the frame's CSS `color`, read back here — so a theme
 * sets it in a stylesheet like any other colour and this file holds none.
 *
 * The plain <img> underneath is the picture at rest and stays in the page: it
 * paints first, it is what a browser without WebGL keeps, and all that
 * reduced motion ever sees. The canvas takes over only once both textures are
 * uploaded, and hands back if the GPU drops the context.
 */

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/**
 * Two depth taps rather than one: the second reads the depth where the first
 * offset landed, which keeps a near edge from smearing across what is behind
 * it. The shadow lies on the ground plane (depth 0), so it moves the least.
 * Output is premultiplied: the figure over its shadow, over nothing.
 */
const FRAG = `
precision mediump float;
uniform sampler2D u_img;
uniform sampler2D u_depth;
uniform vec2 u_shift;
uniform float u_zoom;
uniform vec2 u_cover;
uniform vec2 u_drop;
uniform vec4 u_shadow;
varying vec2 v_uv;
void main() {
  vec2 uv = (v_uv - 0.5) * u_cover / u_zoom + 0.5;
  float d = texture2D(u_depth, uv).r;
  vec2 off = u_shift * (d - 0.3);
  d = texture2D(u_depth, uv + off).r;
  off = u_shift * (d - 0.3);
  vec4 c = texture2D(u_img, uv + off);
  float m = texture2D(u_depth, uv - u_shift * 0.3 + u_drop).g * u_shadow.a;
  gl_FragColor = c + vec4(u_shadow.rgb * m, m) * (1.0 - c.a);
}`;

/** How far the nearest point moves at full deflection, in fractions of the picture. */
const REACH = 0.035;
/** Where the shadow falls at rest: a little right, mostly down. */
const DROP = { x: -0.004, y: -0.03 };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * How much of the colour's own alpha the shadow uses. The colour comes from a
 * shared token (`--scrim`), which is dark enough to sit text on; a shadow on
 * the ground wants a fraction of that.
 */
const SHADOW_STRENGTH = 0.45;

/**
 * A computed CSS colour -> [r, g, b, a] in 0-1. Browsers report either
 * "rgba(14, 14, 16, 0.55)" (channels 0-255) or, for some sources,
 * "color(srgb 0.05 0.05 0.06 / 0.55)" (channels 0-1).
 */
function parseColour(css: string): [number, number, number, number] {
  const n = css.match(/-?[\d.]+(e-?\d+)?/g)?.map(Number) ?? [];
  const unit = css.startsWith("color(") ? 1 : 255;
  return [(n[0] ?? 0) / unit, (n[1] ?? 0) / unit, (n[2] ?? 0) / unit, (n[3] ?? 1) * SHADOW_STRENGTH];
}

export function DepthScene({
  src,
  srcSet,
  sizes,
  small,
  depth,
  width,
  height,
  alt,
  className,
}: {
  /** The cut-out at full size, with transparency. */
  src: string;
  srcSet?: string;
  sizes?: string;
  /** A narrower copy the canvas uses on small frames. */
  small?: string;
  /** Red: nearness, white near. Green: the soft silhouette. Any size. */
  depth: string;
  width: number;
  height: number;
  alt: string;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (frame === null || canvas === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
    });
    if (gl === null || gl.isContextLost()) return;

    let disposed = false;
    let raf = 0;
    let visible = true;

    /**
     * Everything this mount creates, freed one by one on unmount — never by
     * `loseContext()`. A canvas hands the same context back to every
     * `getContext` call, so killing it on unmount left the next mount (React
     * runs effects twice in development) holding a dead one.
     */
    const shaders: WebGLShader[] = [];
    const textures: WebGLTexture[] = [];

    const compile = (type: number, source: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      shaders.push(sh);
      return sh;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uShift = gl.getUniformLocation(program, "u_shift");
    const uZoom = gl.getUniformLocation(program, "u_zoom");
    const uCover = gl.getUniformLocation(program, "u_cover");
    const uDrop = gl.getUniformLocation(program, "u_drop");
    const uShadow = gl.getUniformLocation(program, "u_shadow");
    gl.uniform1i(gl.getUniformLocation(program, "u_img"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "u_depth"), 1);
    gl.uniform2f(uDrop, DROP.x, DROP.y);

    /** Non-power-of-two textures in WebGL 1: no mipmaps, clamped edges. */
    const upload = (unit: number, img: HTMLImageElement, withAlpha: boolean) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      const tex = gl.createTexture()!;
      textures.push(tex);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, withAlpha);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const format = withAlpha ? gl.RGBA : gl.RGB;
      gl.texImage2D(gl.TEXTURE_2D, 0, format, format, gl.UNSIGNED_BYTE, img);
    };

    /** The shadow colour, from the stylesheet; re-read when the theme flips. */
    const readShadow = () => gl.uniform4fv(uShadow, parseColour(getComputedStyle(frame).color));
    const themeWatch = new MutationObserver(readShadow);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

    /** Canvas pixels follow the frame; the picture covers it like object-fit. */
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(frame.clientWidth * dpr));
      const h = Math.max(1, Math.round(frame.clientHeight * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      const frameAspect = w / h;
      const picAspect = width / height;
      if (frameAspect > picAspect) gl.uniform2f(uCover, 1, picAspect / frameAspect);
      else gl.uniform2f(uCover, frameAspect / picAspect, 1);
    };

    /* Where the view is heading, and where it is. Eased toward each frame. */
    const target = { x: 0, y: 0 };
    const now = { x: 0, y: 0, zoom: 1 };
    let pointerAt = 0;

    const onMove = (e: PointerEvent) => {
      const r = frame.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      target.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      pointerAt = performance.now();
    };
    const onLeave = () => {
      pointerAt = 0;
    };

    const draw = (t: number) => {
      raf = 0;
      if (disposed || !visible) return;

      const r = frame.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      /** -1 as the frame enters from below, 0 centred, 1 as it leaves at the top. */
      const scroll = Math.max(-1, Math.min(1, (vh / 2 - (r.top + r.height / 2)) / vh));

      /* Idle, the view drifts on its own so the depth shows without a mouse. */
      const idle = pointerAt === 0 || t - pointerAt > 2500;
      const aimX = idle ? Math.sin(t / 2600) * 0.6 : target.x;
      const aimY = (idle ? Math.sin(t / 3700) * 0.35 : target.y) - scroll * 0.7;
      const aimZoom = 1 + Math.max(0, scroll) * 0.05;

      now.x += (aimX - now.x) * 0.055;
      now.y += (aimY - now.y) * 0.055;
      now.zoom += (aimZoom - now.zoom) * 0.08;

      render();
      raf = requestAnimationFrame(draw);
    };

    const render = () => {
      resize();
      gl.uniform2f(uShift, -now.x * REACH, -now.y * REACH * 0.6);
      gl.uniform1f(uZoom, now.zoom);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const wake = () => {
      if (raf === 0 && visible && !disposed) raf = requestAnimationFrame(draw);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      wake();
    });

    const onLost = (e: Event) => {
      e.preventDefault();
      disposed = true;
      setLive(false);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    const useSmall = small !== undefined && frame.clientWidth * (window.devicePixelRatio || 1) <= 1000;
    Promise.all([loadImage(useSmall ? small : src), loadImage(depth)])
      .then(([pic, map]) => {
        if (disposed) return;
        upload(0, pic, true);
        upload(1, map, false);
        readShadow();
        /* The first frame now, not on the next animation frame: the canvas
           replaces the picture the moment it is live, so it must already
           hold one — a background tab may not run animation frames at all. */
        render();
        frame.addEventListener("pointermove", onMove);
        frame.addEventListener("pointerleave", onLeave);
        io.observe(frame);
        setLive(true);
        wake();
      })
      .catch(() => {
        /* The <img> is already the picture; nothing to recover. */
      });

    return () => {
      disposed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      io.disconnect();
      themeWatch.disconnect();
      frame.removeEventListener("pointermove", onMove);
      frame.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      if (!gl.isContextLost()) {
        textures.forEach((t) => gl.deleteTexture(t));
        gl.deleteBuffer(quad);
        gl.deleteProgram(program);
        shaders.forEach((sh) => gl.deleteShader(sh));
      }
    };
  }, [src, small, depth, width, height]);

  return (
    <div ref={frameRef} className={`depth-scene${live ? " is-live" : ""}${className ? ` ${className}` : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local, pre-sized, and the fallback for the canvas */}
      <img src={src} srcSet={srcSet} sizes={sizes} width={width} height={height} alt={alt} fetchPriority="high" />
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
