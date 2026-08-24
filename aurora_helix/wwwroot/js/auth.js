/* ============================================================
   AURORA — Sessão / Conta
   · mantém a sessão em localStorage
   · esconde [data-auth="required"] / [data-auth="anon"] / [data-auth="user"]
   · abre um modal com login E criação de conta (backend real)
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

    /* ── Backend: login ── */
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
            const msg = await res.json().catch(function () { return null; });
            return { ok: false, error: (msg && msg.erro) || 'Falha ao entrar.' };
        } catch (e) {
            return { ok: false, error: 'Erro de conexão com o servidor.' };
        }
    }

    /* ── Backend: registro de usuário ── */
    async function registro(email, password, nome) {
        try {
            const res = await fetch('/api/auth/registro', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, senha: password, nome: nome })
            });
            if (res.ok) return { ok: true };
            const msg = await res.json().catch(function () { return null; });
            if (res.status === 409) return { ok: false, error: (msg && msg.erro) || 'E-mail já cadastrado.' };
            return { ok: false, error: (msg && msg.erro) || 'Falha ao criar conta.' };
        } catch (e) {
            return { ok: false, error: 'Erro de conexão com o servidor.' };
        }
    }

    function logout() { clear(); }

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

    /* ── Modal de login / criação de conta ── */
    let mode = 'login';
    let modalEl = null;

    function setMode(m) {
        mode = m;
        const title = document.getElementById('authTitle');
        const sub   = document.getElementById('authSub');
        const nameField = document.getElementById('authNameField');
        const submit = document.getElementById('authSubmit');
        const toggle = document.getElementById('authToggle');
        if (m === 'register') {
            title.textContent = 'Criar conta';
            sub.textContent = 'Cadastre-se para acessar o Aurora.';
            nameField.style.display = '';
            submit.textContent = 'Criar conta';
            toggle.innerHTML = 'Já tem conta? <a href="#" id="authToggleLink">Entrar</a>';
        } else {
            title.textContent = 'Entrar';
            sub.textContent = 'Acesse sua conta para registrar ancestrais.';
            nameField.style.display = 'none';
            submit.textContent = 'Entrar';
            toggle.innerHTML = 'Não tem conta? <a href="#" id="authToggleLink">Criar conta</a>';
        }
        const link = document.getElementById('authToggleLink');
        if (link) link.addEventListener('click', function (e) {
            e.preventDefault();
            setMode(m === 'login' ? 'register' : 'login');
        });
    }

    function injectModal() {
        if (document.getElementById('authModal')) return;
        const back = document.createElement('div');
        back.className = 'auth-modal-backdrop';
        back.id = 'authModal';
        back.innerHTML =
            '<div class="auth-modal">' +
                '<button class="auth-close" id="authClose" aria-label="Fechar">×</button>' +
                '<h3 id="authTitle">Entrar</h3>' +
                '<p class="sub" id="authSub">Acesse sua conta para registrar ancestrais.</p>' +
                '<div class="auth-field" id="authNameField" style="display:none">' +
                    '<label>Nome</label>' +
                    '<input type="text" id="authName" placeholder="Seu nome (opcional)" />' +
                '</div>' +
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
                '<p class="auth-toggle" id="authToggle">Não tem conta? <a href="#" id="authToggleLink">Criar conta</a></p>' +
            '</div>';
        document.body.appendChild(back);
        modalEl = back;

        back.addEventListener('click', function (e) { if (e.target === back) closeLogin(); });
        back.querySelector('#authClose').addEventListener('click', closeLogin);
        back.querySelector('#authSubmit').addEventListener('click', submit);
        back.querySelector('#authPass').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') submit();
        });
        setMode('login');
    }

    function openLogin() {
        injectModal();
        setMode('login');
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
        if (!email || !pass) { errEl.textContent = 'Informe e-mail e senha.'; return; }

        if (mode === 'register') {
            const nome = document.getElementById('authName').value.trim();
            const r = await registro(email, pass, nome);
            if (!r.ok) { errEl.textContent = r.error || 'Não foi possível criar a conta.'; return; }
            const l = await login(email, pass);
            if (l.ok) { closeLogin(); }
            else { errEl.textContent = l.error || 'Conta criada, mas falha ao entrar.'; }
        } else {
            const r = await login(email, pass);
            if (r.ok) { closeLogin(); }
            else { errEl.textContent = r.error || 'Não foi possível entrar.'; }
        }
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
