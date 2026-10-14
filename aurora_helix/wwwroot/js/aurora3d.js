/* ============================================================
   AURORA 3D v3 — Fundo animado em WebGL (limpo e leve)
   1) Céu de aurora sutil (shader FBM)        — camada base
   2) Hélice de DNA em partículas 3D         — assinatura Helix
   · Reage ao mouse e ao scroll (parallax suave)
   · Pausa quando a aba está oculta
   · Respeita prefers-reduced-motion (quadro estático)
   · Menos partículas, menos brilho, mais elegância
   Exponibiliza: window.Aurora3D.init(canvasId, { mouse })
   ============================================================ */
(function () {
    'use strict';

    /* ── 1) SHADER DO CÉU (aurora boreal sutil) ────────────── */
    const SKY_VERT = `
        attribute vec2 aPos;
        varying vec2 vUv;
        void main() {
            vUv = aPos * 0.5 + 0.5;
            gl_Position = vec4(aPos, 0.0, 1.0);
        }
    `;

    const SKY_FRAG = `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec2  uRes;
        uniform vec2  uMouse;
        uniform float uScroll;

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
            for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p = p * 2.02 + vec2(1.7, 9.2);
                a *= 0.5;
            }
            return v;
        }
        float auroraLayer(vec2 uv, float t, float layer, float mx) {
            float speed = 0.12 + layer * 0.08;
            float x = uv.x;
            float base = 0.35 + layer * 0.12 + 0.05 * sin(x * 1.5 + t * speed * 2.0 + layer * 1.7);
            float wave = 0.04 * sin(x * 4.0 + t * speed * 3.0 + layer)
                       + 0.02 * sin(x * 9.0 - t * speed * 2.5 + layer * 2.3);
            float y = base + wave + mx * 0.08 * sin(x * 2.0 + layer);
            float d = uv.y - y;
            float n = fbm(vec2(x * 3.0 + t * speed, layer * 6.0));
            float thick = 0.22 + 0.18 * n;
            float r = d / thick;
            float band = exp(-r * r);
            float col = fbm(vec2(x * 20.0 + t * speed * 1.5, uv.y * 6.0 + layer * 2.0));
            band *= 0.25 + 0.7 * col;
            band *= smoothstep(1.1, 0.2, uv.y);
            band *= smoothstep(-0.1, 0.3, uv.y);
            return max(band, 0.0);
        }

        void main() {
            vec2 uv = vUv;
            float aspect = uRes.x / uRes.y;
            vec2 p = uv; p.x *= aspect;
            float t = uTime;
            float mx = (uMouse.x - 0.5);
            vec2 uvA = uv + vec2(0.0, uScroll * 0.1);

            /* céu base — mais escuro, menos gradiente */
            vec3 col = mix(vec3(0.008, 0.025, 0.05), vec3(0.003, 0.008, 0.02), uv.y);

            /* estrelas bem discretas */
            vec2 sp = p * 100.0;
            vec2 cell = floor(sp);
            float h = hash(cell);
            float star = step(0.985, h);
            float tw = 0.6 + 0.4 * sin(t * 2.0 + h * 100.0);
            star *= tw;
            star *= smoothstep(0.3, 0.95, uv.y);
            col += vec3(0.7, 0.85, 1.0) * star * 0.25;

            /* aurora (2 camadas apenas) — bem sutil */
            vec3 aur = vec3(0.0);
            for (int i = 0; i < 2; i++) {
                float fi = float(i);
                float b = auroraLayer(uvA, t, fi, mx);
                vec3 cL = mix(vec3(0.0, 0.85, 0.5), vec3(0.0, 0.7, 1.0), fi);
                cL = mix(cL, vec3(0.5, 0.2, 1.0), 0.3 + 0.3 * sin(fi * 1.7));
                aur += cL * b;
            }
            col += aur * 0.28;  /* bem mais sutil */

            /* vinheta suave */
            float vig = smoothstep(1.3, 0.25, length((uv - 0.5) * vec2(aspect, 1.0)));
            col *= mix(0.75, 1.0, vig);

            gl_FragColor = vec4(col, 1.0);
        }
    `;

    /* ── 2) SHADER DAS PARTÍCULAS (apenas hélice de DNA) ────── */
    const PT_VERT = `
        precision highp float;
        attribute float aSeed;
        uniform float uTime;
        uniform vec2  uMouse;
        uniform float uScroll;
        uniform float uAspect;
        uniform float uDpr;
        uniform float uPx;
        varying float vFade;
        varying vec3  vColor;

        float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }

        /* paleta Aurora: verde -> ciano -> violeta */
        vec3 palette(float t) {
            vec3 c = mix(vec3(0.0, 1.0, 0.70),  vec3(0.0, 0.83, 1.0), smoothstep(0.00, 0.45, t));
            c = mix(c, vec3(0.48, 0.18, 1.0), smoothstep(0.45, 0.85, t));
            c = mix(c, vec3(1.0,  0.31, 0.85), smoothstep(0.85, 1.00, t));
            return c;
        }

        void main() {
            vec3  pos  = vec3(0.0);
            float size = 2.0;
            float fade = 1.0;
            vec3  col  = vec3(1.0);

            /* ── HÉLICE DE DNA: duas fitas + degraus ── */
            float s  = aSeed * 76.123;
            float r1 = hash1(s);
            float r2 = hash1(s + 11.7);
            float r3 = hash1(s + 23.4);

            float prog   = fract(r1 + uTime * (0.008 + 0.008 * r2));
            float isRung = step(0.72, r3);
            float q = mix(prog, floor(prog * 20.0) / 20.0, isRung);
            float f = mix(0.0, fract(r1 * 93.7), isRung);

            float baseAng = q * 2.4 * 6.28318 + uTime * 0.15;
            float side    = step(0.5, fract(r2 * 7.77));
            float ang     = baseAng + side * 3.14159;

            float radius = 0.42;
            vec3 A = vec3(cos(baseAng) * radius, 0.0, sin(baseAng) * radius);
            vec3 B = vec3(-A.x, 0.0, -A.z);

            vec3 onStrand = vec3(cos(ang) * radius, 0.0, sin(ang) * radius);
            vec3 onRung   = mix(A, B, f);
            pos = mix(onStrand, onRung, isRung);
            pos.y = (q - 0.5) * 1.25;

            /* respiração sutil */
            pos.xy *= 1.0 + 0.02 * sin(uTime * 0.4 + q * 5.0);

            col  = mix(palette(q), vec3(0.5, 0.8, 1.0), isRung * 0.35);
            fade = smoothstep(0.0, 0.12, q) * smoothstep(1.0, 0.9, q);
            fade *= 0.5 + 0.35 * sin(uTime * 0.7 + r1 * 40.0);
            fade *= 0.5;  /* mais sutil */
            size = mix(2.2, 1.3, isRung);

            /* parallax de mouse por profundidade + drift de scroll */
            pos.xy += uMouse * vec2(0.07, 0.04) * (0.6 - pos.z);
            pos.y  += uScroll * 0.4;

            /* projeção manual */
            float persp = 1.0 / (1.3 - pos.z * 0.4);
            float scale = 1.1 * min(uAspect, 1.0);
            vec2 xy = vec2(pos.x * persp * scale / uAspect, pos.y * persp * scale);
            gl_Position = vec4(xy, 0.0, 1.0);
            gl_PointSize = max(1.3, size * uDpr * persp * uPx * 1.3);

            vFade  = fade;
            vColor = col;
        }
    `;

    const PT_FRAG = `
        precision mediump float;
        varying float vFade;
        varying vec3  vColor;
        void main() {
            vec2 d = gl_PointCoord - 0.5;
            float r2 = dot(d, d) * 4.0;
            float a = exp(-r2 * 3.5) * vFade;
            if (a < 0.005) discard;
            gl_FragColor = vec4(vColor * a, a);
        }
    `;

    /* ── utilitários WebGL ─────────────────────────────────── */
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

    /* ── init ──────────────────────────────────────────────── */
    function init(canvasId, opts) {
        opts = opts || {};
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
                || canvas.getContext('experimental-webgl', { antialias: false, alpha: false });
        if (!gl) { document.body.classList.add('no-webgl'); return; }

        const sky = createProgram(gl, SKY_VERT, SKY_FRAG);
        const pts = createProgram(gl, PT_VERT, PT_FRAG);
        if (!sky || !pts) { document.body.classList.add('no-webgl'); return; }

        const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const small   = Math.min(window.screen.width, window.screen.height) < 720
                     || window.innerWidth < 720;

        const N_HELIX = small ? 350 : 650;  /* menos partículas */

        /* buffer do quad de tela cheia (céu) */
        const quadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1,  -1, 1,
            -1,  1,  1, -1,   1, 1
        ]), gl.STATIC_DRAW);

        /* buffer de sementes */
        const seeds = new Float32Array(N_HELIX);
        for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
        const seedBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
        gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);

        /* uniforms — céu */
        gl.useProgram(sky);
        const skyPos    = gl.getAttribLocation(sky, 'aPos');
        const uSkyTime  = gl.getUniformLocation(sky, 'uTime');
        const uSkyRes   = gl.getUniformLocation(sky, 'uRes');
        const uSkyMouse = gl.getUniformLocation(sky, 'uMouse');
        const uSkyScr   = gl.getUniformLocation(sky, 'uScroll');

        /* uniforms — partículas */
        gl.useProgram(pts);
        const ptSeed   = gl.getAttribLocation(pts, 'aSeed');
        const uPtTime  = gl.getUniformLocation(pts, 'uTime');
        const uPtMouse = gl.getUniformLocation(pts, 'uMouse');
        const uPtScr   = gl.getUniformLocation(pts, 'uScroll');
        const uPtAsp   = gl.getUniformLocation(pts, 'uAspect');
        const uPtDpr   = gl.getUniformLocation(pts, 'uDpr');
        const uPtPx    = gl.getUniformLocation(pts, 'uPx');

        /* mouse + scroll com suavização */
        const tgt = { x: 0.5, y: 0.5 };
        const cur = { x: 0.5, y: 0.5 };
        let scrollT = 0, scroll = 0;

        if (opts.mouse !== false && !reduced) {
            window.addEventListener('mousemove', function (e) {
                tgt.x = e.clientX / window.innerWidth;
                tgt.y = e.clientY / window.innerHeight;
            }, { passive: true });
        }
        window.addEventListener('scroll', function () {
            const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
            scrollT = Math.min(1, (window.scrollY || 0) / max);
        }, { passive: true });

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
            const w = Math.max(1, Math.floor(window.innerWidth  * dpr));
            const h = Math.max(1, Math.floor(window.innerHeight * dpr));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                canvas.style.width = window.innerWidth + 'px';
                canvas.style.height = window.innerHeight + 'px';
                gl.viewport(0, 0, w, h);
            }
        }
        resize();
        window.addEventListener('resize', function () {
            resize();
            if (reduced) drawFrame(20000);
        });

        const start = performance.now();
        let raf = 0;

        function drawFrame(now) {
            const t = (now - start) / 1000;

            /* 1) céu — opaco */
            gl.disable(gl.BLEND);
            gl.useProgram(sky);
            gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
            gl.enableVertexAttribArray(skyPos);
            gl.vertexAttribPointer(skyPos, 2, gl.FLOAT, false, 0, 0);
            gl.uniform1f(uSkyTime, t);
            gl.uniform2f(uSkyRes, canvas.width, canvas.height);
            gl.uniform2f(uSkyMouse, cur.x, cur.y);
            gl.uniform1f(uSkyScr, scroll);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            /* 2) partículas — aditivo (brilho sutil) */
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.useProgram(pts);
            gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
            gl.enableVertexAttribArray(ptSeed);
            gl.vertexAttribPointer(ptSeed, 1, gl.FLOAT, false, 0, 0);
            gl.uniform1f(uPtTime, t);
            gl.uniform2f(uPtMouse, cur.x - 0.5, 0.5 - cur.y);
            gl.uniform1f(uPtScr, scroll);
            gl.uniform1f(uPtAsp, canvas.width / canvas.height);
            gl.uniform1f(uPtDpr, canvas.width / Math.max(1, window.innerWidth));
            gl.uniform1f(uPtPx, canvas.height / 1000);
            gl.drawArrays(gl.POINTS, 0, N_HELIX);

            window.Aurora3D.ok = true;
        }

        function loop(now) {
            raf = requestAnimationFrame(loop);
            if (document.hidden) return;
            cur.x += (tgt.x - cur.x) * 0.04;
            cur.y += (tgt.y - cur.y) * 0.04;
            scroll += (scrollT - scroll) * 0.05;
            drawFrame(now);
        }

        if (reduced) {
            drawFrame(20000);
        } else {
            raf = requestAnimationFrame(loop);
        }
    }

    window.Aurora3D = { init: init, ok: false };
})();
