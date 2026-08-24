/* ============================================================
   AURORA — Pré-loader 3D
   Uma aurora boreal EM 3D que "surge" do escuro: cortinas de
   luz organizadas em arco com perspectiva, reveladas
   progressivamente conforme o carregamento avança.
   Some com a classe .hidden ao terminar o carregamento.
   Exponibiliza:  window.AuroraPreloader.init()
   ============================================================ */
(function () {
    'use strict';

    const VERT = `
        precision highp float;
        attribute vec2 aPos;            // x:[-0.5,0.5] largura | y:[0,1] altura
        uniform mat4  uProj;
        uniform mat4  uView;
        uniform float uAngle;           // posição no arco
        uniform float uR;               // raio do arco
        uniform float uWidth;
        uniform float uHeight;
        uniform float uReveal;          // 0..1 (emergir do chão)
        uniform float uSway;            // balanço lateral
        varying vec2  vUv;
        varying float vReveal;

        void main() {
            vUv = vec2(aPos.x + 0.5, aPos.y);
            vReveal = uReveal;

            float ang  = uAngle + uSway * sin(uAngle * 3.0);
            vec3  center  = vec3(sin(ang) * uR, 0.0, -cos(ang) * uR);
            vec3  tangent = vec3(cos(ang), 0.0, sin(ang));

            float h = aPos.y * uHeight * uReveal;       // cresce de baixo p/ cima
            vec3  world = center + tangent * (aPos.x * uWidth) + vec3(0.0, h, 0.0);

            gl_Position = uProj * uView * vec4(world, 1.0);
        }
    `;

    const FRAG = `
        precision highp float;
        varying vec2  vUv;
        varying float vReveal;
        uniform float uTime;
        uniform float uColor;          // 0..1 along arco

        float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float noise(vec2 p){
            vec2 i = floor(p), f = fract(p);
            float a = hash(i), b = hash(i + vec2(1.0,0.0)), c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
            vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
        }
        float fbm(vec2 p){
            float v = 0.0, a = 0.5;
            for (int i=0;i<4;i++){ v += a*noise(p); p = p*2.03 + vec2(1.7,9.2); a *= 0.5; }
            return v;
        }

        void main() {
            // estrias verticais da aurora
            float streak = fbm(vec2(vUv.x * 9.0 + uTime * 0.25, vUv.y * 3.0 + uColor * 5.0));
            float intensity = 0.45 + 0.9 * streak;

            // some no topo e renasce na base
            intensity *= smoothstep(1.0, 0.15, vUv.y);
            intensity *= smoothstep(0.0, 0.18, vUv.y);
            // bordas laterais suaves
            intensity *= smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x);

            // gradiente verde -> ciano -> violeta
            vec3 c = mix(vec3(0.0, 1.0, 0.55), vec3(0.0, 0.75, 1.0), uColor);
            c = mix(c, vec3(0.7, 0.3, 1.0), vUv.y * 0.6);

            float a = intensity * vReveal;
            gl_FragColor = vec4(c * intensity, a);
        }
    `;

    /* ── mat4 mínimo (column-major) ── */
    function perspective(fovy, aspect, near, far) {
        const f = 1.0 / Math.tan(fovy / 2);
        const nf = 1.0 / (near - far);
        return [
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (far + near) * nf, -1,
            0, 0, 2 * far * near * nf, 0
        ];
    }
    function translate(x, y, z) {
        return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];
    }
    function rotateX(a) {
        const c = Math.cos(a), s = Math.sin(a);
        return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];
    }
    function mul(a, b) {
        const o = new Array(16);
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
                o[c*4+r] = a[0*4+r]*b[c*4+0] + a[1*4+r]*b[c*4+1] + a[2*4+r]*b[c*4+2] + a[3*4+r]*b[c*4+3];
            }
        }
        return o;
    }

    function init() {
        const overlay = document.getElementById('preloader');
        const canvas  = document.getElementById('preloaderCanvas');
        const fill    = document.getElementById('preloaderFill');
        const pctEl   = document.getElementById('preloaderPct');

        if (!overlay) return;

        let gl = null;
        if (canvas) gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) { finish(); return; }

        /* ── Geometria: plano unitário (cortina) ── */
        const plane = new Float32Array([
            -0.5, 0.0,  -0.5, 1.0,   0.5, 0.0,
             0.5, 1.0
        ]); // TRIANGLE_STRIP
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, plane, gl.STATIC_DRAW);

        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, VERT); gl.compileShader(vs);
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, FRAG); gl.compileShader(fs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.warn('[preloader] shader:', gl.getShaderInfoLog(vs) || gl.getShaderInfoLog(fs));
            finish(); return;
        }
        const prog = gl.createProgram();
        gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { finish(); return; }
        gl.useProgram(prog);

        const aPos   = gl.getAttribLocation(prog, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const uProj   = gl.getUniformLocation(prog, 'uProj');
        const uView   = gl.getUniformLocation(prog, 'uView');
        const uAngle  = gl.getUniformLocation(prog, 'uAngle');
        const uR      = gl.getUniformLocation(prog, 'uR');
        const uWidth  = gl.getUniformLocation(prog, 'uWidth');
        const uHeight = gl.getUniformLocation(prog, 'uHeight');
        const uReveal = gl.getUniformLocation(prog, 'uReveal');
        const uSway   = gl.getUniformLocation(prog, 'uSway');
        const uTime   = gl.getUniformLocation(prog, 'uTime');
        const uColor  = gl.getUniformLocation(prog, 'uColor');

        /* ── Cortinas em arco ── */
        const N = 16, R = 1.7, spread = 0.72;
        const angles = [], colors = [];
        for (let i = 0; i < N; i++) {
            const f = i / (N - 1);
            angles.push(-spread + f * (spread * 2));
            colors.push(f);
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // aditivo -> brilho
        gl.clearColor(0, 0, 0, 0);
        gl.disable(gl.DEPTH_TEST);

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.max(1, Math.floor(window.innerWidth  * dpr));
            const h = Math.max(1, Math.floor(window.innerHeight * dpr));
            canvas.width = w; canvas.height = h;
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = window.innerHeight + 'px';
            gl.viewport(0, 0, w, h);
        }
        resize();
        window.addEventListener('resize', resize);

        let progress = 0;
        const start = performance.now();
        let raf;

        function render(now) {
            const t = (now - start) / 1000;
            const aspect = canvas.width / canvas.height;
            const proj = perspective(50 * Math.PI / 180, aspect, 0.1, 100);
            // câmera levemente inclinada, observando o arco
            const view = mul(rotateX(0.14), translate(0, -0.30, -2.3));

            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniformMatrix4fv(uProj, false, new Float32Array(proj));
            gl.uniformMatrix4fv(uView, false, new Float32Array(view));
            gl.uniform1f(uTime, t);
            gl.uniform1f(uR, R);
            gl.uniform1f(uWidth, 0.42);
            gl.uniform1f(uHeight, 1.5);

            const gp = progress / 100; // 0..1 global
            for (let i = 0; i < N; i++) {
                // revela progressivamente (emergir)
                const local = gp * 1.5 - (i / (N - 1)) * 0.45;
                const reveal = Math.max(0, Math.min(1, local));
                gl.uniform1f(uAngle, angles[i]);
                gl.uniform1f(uColor, colors[i]);
                gl.uniform1f(uReveal, reveal);
                gl.uniform1f(uSway, 0.04 * Math.sin(t * 0.6 + i));
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
            raf = requestAnimationFrame(render);
        }
        raf = requestAnimationFrame(render);

        /* ── Progresso + carregamento real ── */
        const timer = setInterval(function () {
            const step = progress < 90 ? (Math.random() * 8 + 4) : 0.4;
            progress = Math.min(progress + step, 100);
            if (fill) fill.style.width = progress + '%';
            if (pctEl) pctEl.textContent = Math.floor(progress) + '%';
            if (progress >= 100) clearInterval(timer);
        }, 120);

        function onLoaded() { setTimeout(finish, 350); }
        if (document.readyState === 'complete') onLoaded();
        else window.addEventListener('load', onLoaded);
        setTimeout(finish, 6000); // garante saída

        function finish() {
            if (raf) cancelAnimationFrame(raf);
            if (fill) fill.style.width = '100%';
            if (pctEl) pctEl.textContent = '100%';
            overlay.classList.add('hidden');
            setTimeout(function () { overlay.remove(); }, 900);
        }
    }

    window.AuroraPreloader = { init: init };
})();
