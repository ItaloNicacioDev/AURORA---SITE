/* ============================================================
   AURORA 3D — Canvas de fundo (Aurora Boreal)
   Renderizado em WebGL com shader de ruído (FBM).
   Exponibiliza:  window.Aurora3D.init(canvasId, { mouse })
   ============================================================ */
(function () {
    'use strict';

    const VERT = `
        attribute vec2 aPos;
        varying vec2 vUv;
        void main() {
            vUv = aPos * 0.5 + 0.5;
            gl_Position = vec4(aPos, 0.0, 1.0);
        }
    `;

    const FRAG = `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec2  uRes;
        uniform vec2  uMouse;

        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }
        float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }
        float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 5; i++) {
                v += a * noise(p);
                p = p * 2.03 + vec2(1.7, 9.2);
                a *= 0.5;
            }
            return v;
        }

        /* uma "cortina" de aurora */
        float auroraLayer(vec2 uv, float t, float layer, float mx) {
            float speed = 0.18 + layer * 0.12;
            float x = uv.x;
            float base = 0.32 + layer * 0.13 + 0.07 * sin(x * 1.8 + t * speed * 3.0 + layer * 1.7);
            float wave = 0.06 * sin(x * 5.0 + t * speed * 5.0 + layer)
                       + 0.035 * sin(x * 11.0 - t * speed * 4.0 + layer * 2.3);
            float y = base + wave + mx * 0.12 * sin(x * 2.5 + layer);
            float d = uv.y - y;
            float n = fbm(vec2(x * 4.0 + t * speed, layer * 8.0));
            float thick = 0.18 + 0.22 * n;
            float r = d / thick;
            float band = exp(-r * r);
            float col = fbm(vec2(x * 32.0 + t * speed * 2.0, uv.y * 9.0 + layer * 3.0));
            band *= 0.35 + 0.9 * col;
            band *= smoothstep(1.05, 0.15, uv.y);
            band *= smoothstep(-0.05, 0.25, uv.y);
            return max(band, 0.0);
        }

        void main() {
            vec2 uv = vUv;
            float aspect = uRes.x / uRes.y;
            vec2 p = uv; p.x *= aspect;
            float t = uTime;
            float mx = (uMouse.x - 0.5);

            // céu base
            vec3 col = mix(vec3(0.012, 0.035, 0.07), vec3(0.004, 0.012, 0.03), uv.y);

            // estrelas (discretas, para não competir com o texto)
            vec2 sp = p * 130.0;
            vec2 cell = floor(sp);
            float h = hash(cell);
            float star = step(0.972, h);
            float tw = 0.5 + 0.5 * sin(t * 2.5 + h * 120.0);
            star *= tw;
            star *= smoothstep(0.2, 0.9, uv.y);
            col += vec3(0.8, 0.9, 1.0) * star * 0.4;

            // aurora (3 camadas)
            vec3 aur = vec3(0.0);
            for (int i = 0; i < 3; i++) {
                float fi = float(i);
                float b = auroraLayer(uv, t, fi, mx);
                vec3 cL = mix(vec3(0.0, 1.0, 0.6), vec3(0.0, 0.8, 1.0), fi / 2.0);
                cL = mix(cL, vec3(0.55, 0.25, 1.0), 0.5 + 0.5 * sin(fi * 1.7));
                cL = mix(cL, vec3(1.0, 0.3, 0.85), smoothstep(0.5, 1.0, uv.y) * 0.4);
                aur += cL * b;
            }
            // aurora bem sutil, para não cobrir o texto
            col += aur * 0.5;

            // brilho de reflexo no "chão"
            float g = smoothstep(0.35, 0.0, uv.y);
            col += vec3(0.0, 0.25, 0.2) * g * 0.05;

            // vinheta
            float vig = smoothstep(1.25, 0.2, length((uv - 0.5) * vec2(aspect, 1.0)));
            col *= mix(0.7, 1.0, vig);

            gl_FragColor = vec4(col, 1.0);
        }
    `;

    function compile(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.warn('[aurora3d] shader:', gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    function createProgram(gl, v, f) {
        const vs = compile(gl, gl.VERTEX_SHADER, v);
        const fs = compile(gl, gl.FRAGMENT_SHADER, f);
        if (!vs || !fs) return null;
        const p = gl.createProgram();
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.warn('[aurora3d] link:', gl.getProgramInfoLog(p));
            return null;
        }
        return p;
    }

    function init(canvasId, opts) {
        opts = opts || {};
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const gl = canvas.getContext('webgl', { antialias: true, alpha: false })
                || canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
        if (!gl) {
            document.body.classList.add('no-webgl');
            return;
        }
        const prog = createProgram(gl, VERT, FRAG);
        if (!prog) {
            document.body.classList.add('no-webgl');
            return;
        }
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1,  -1, 1,
            -1,  1,  1, -1,   1, 1
        ]), gl.STATIC_DRAW);

        const aPos = gl.getAttribLocation(prog, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const uTime  = gl.getUniformLocation(prog, 'uTime');
        const uRes   = gl.getUniformLocation(prog, 'uRes');
        const uMouse = gl.getUniformLocation(prog, 'uMouse');

        const mouse = { x: 0.5, y: 0.5 };
        if (opts.mouse !== false) {
            window.addEventListener('mousemove', function (e) {
                mouse.x = e.clientX / window.innerWidth;
                mouse.y = e.clientY / window.innerHeight;
            }, { passive: true });
        }

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.floor(window.innerWidth * dpr);
            const h = Math.floor(window.innerHeight * dpr);
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                canvas.style.width = window.innerWidth + 'px';
                canvas.style.height = window.innerHeight + 'px';
                gl.viewport(0, 0, w, h);
            }
        }
        resize();
        window.addEventListener('resize', resize);

        const start = performance.now();
        function render(now) {
            const t = (now - start) / 1000;
            gl.uniform1f(uTime, t);
            gl.uniform2f(uRes, canvas.width, canvas.height);
            gl.uniform2f(uMouse, mouse.x, mouse.y);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            requestAnimationFrame(render);
        }
        requestAnimationFrame(render);
    }

    window.Aurora3D = { init: init };
})();
