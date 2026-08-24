/* ============================================================
   AURORA — Sessão / Conta (gate de login)
   · mantém a sessão em localStorage
   · esconde elementos [data-auth="required"] quando deslogado
   · mostra controles de conta na nav (Entrar / Sair)
   · abre um modal de login simples
   Nota: gate de UI. Para segurança real, o back-end também
   precisa exigir o token (ver Program.cs /api/auth/login).
   ============================================================ */
(function () {
    'use strict';

    const KEY = 'aurora_session';
    let session = null;
    try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { session = null; }

    function isLoggedIn() { return !!(session && session.token); }
    function getSession() { return session; }

    function persist(s) {
        session = s;
        try { localStorage.setItem(KEY, s ? JSON.stringify(s) : ''); } catch (e) {}
        apply(); updateNav();
    }
    function clear() { persist(null); }

    /* ── Aplica a visibilidade conforme o estado ── */
    function apply() {
        document.querySelectorAll('[data-auth="required"]').forEach(function (el) {
            el.style.display = isLoggedIn() ? '' : 'none';
        });
        document.querySelectorAll('[data-auth="anon"]').forEach(function (el) {
            el.style.display = isLoggedIn() ? 'none' : '';
        });
        document.querySelectorAll('[data-auth="user"]').forEach(function (el) {
            el.style.display = isLoggedIn() ? '' : 'none';
            if (isLoggedIn() && el.id === 'btnConta') {
                el.textContent = session.email || 'Conta';
            }
        });
    }

    /* ── Login (tenta o back-end; cai no modo demo se não houver API) ── */
    async function login(email, password) {
        if (!email || !password) return { ok: false, error: 'Preencha e-mail e senha.' };
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, password: password })
            });
            if (res.ok) {
                const data = await res.json();
                persist({ token: data.token || ('aurora-' + Date.now()), email: email });
                return { ok: true };
            }
            if (res.status === 401) return { ok: false, error: 'Credenciais inválidas.' };
            throw new Error('bad');
        } catch (e) {
            // modo demo: sem back-end, aceita qualquer par não vazio
            persist({ token: 'demo-' + Date.now(), email: email });
            return { ok: true };
        }
    }

    function logout() { clear(); }

    /* ── Controles na nav ── */
    function updateNav() {
        document.querySelectorAll('.nav-account .nav-account-user').forEach(function (el) {
            if (isLoggedIn()) el.textContent = (session.email || 'Conta');
        });
    }
    function injectNavControls() {
        document.querySelectorAll('nav').forEach(function (nav) {
            if (nav.querySelector('.nav-account')) return;
            const wrap = document.createElement('div');
            wrap.className = 'nav-account';
            wrap.innerHTML =
                '<button class="nav-account-btn" data-auth="anon" id="btnEntrar">Entrar</button>' +
                '<button class="nav-account-btn nav-account-user" data-auth="user" id="btnConta">Conta</button>' +
                '<button class="nav-account-btn" data-auth="user" id="btnSair">Sair</button>';
            nav.appendChild(wrap);
            wrap.querySelector('#btnEntrar').addEventListener('click', openLogin);
            wrap.querySelector('#btnSair').addEventListener('click', function () { logout(); });
        });
        apply();
    }

    /* ── Modal de login ── */
    let modalEl = null;
    function injectModal() {
        if (document.getElementById('authModal')) return;
        const back = document.createElement('div');
        back.className = 'auth-modal-backdrop';
        back.id = 'authModal';
        back.innerHTML =
            '<div class="auth-modal">' +
                '<button class="auth-close" id="authClose" aria-label="Fechar">×</button>' +
                '<h3>Entrar</h3>' +
                '<p class="sub">Acesse sua conta para registrar ancestrais.</p>' +
                '<div class="auth-field">' +
                    '<label>E-mail</label>' +
                    '<input type="email" id="authEmail" placeholder="voce@exemplo.com" autocomplete="username" />' +
                '</div>' +
                '<div class="auth-field">' +
                    '<label>Senha</label>' +
                    '<input type="password" id="authPass" placeholder="••••••••" autocomplete="current-password" />' +
                '</div>' +
                '<div class="auth-error" id="authError"></div>' +
                '<button class="btn btn-primary" id="authSubmit" style="width:100%;justify-content:center">Entrar</button>' +
            '</div>';
        document.body.appendChild(back);
        modalEl = back;

        back.addEventListener('click', function (e) { if (e.target === back) closeLogin(); });
        back.querySelector('#authClose').addEventListener('click', closeLogin);
        back.querySelector('#authSubmit').addEventListener('click', submit);
        back.querySelector('#authPass').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') submit();
        });
    }
    function openLogin() {
        injectModal();
        const back = document.getElementById('authModal');
        back.classList.add('open');
        const email = document.getElementById('authEmail');
        if (email) email.focus();
    }
    function closeLogin() {
        const back = document.getElementById('authModal');
        if (back) back.classList.remove('open');
    }
    async function submit() {
        const email = document.getElementById('authEmail').value.trim();
        const pass  = document.getElementById('authPass').value;
        const errEl = document.getElementById('authError');
        errEl.textContent = '';
        const r = await login(email, pass);
        if (r.ok) { closeLogin(); }
        else { errEl.textContent = r.error || 'Não foi possível entrar.'; }
    }

    window.AuroraAuth = {
        isLoggedIn: isLoggedIn,
        getSession: getSession,
        login: login,
        logout: logout,
        openLogin: openLogin,
        apply: apply
    };

    if (document.readyState !== 'loading') { injectNavControls(); injectModal(); apply(); }
    else document.addEventListener('DOMContentLoaded', function () { injectNavControls(); injectModal(); apply(); });
})();
