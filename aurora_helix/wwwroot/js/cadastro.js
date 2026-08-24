/* ============================================================
   CADASTRO — lógica do formulário
   ============================================================ */
(function () {
    'use strict';

    let statusAtual = 'vivo';

    window.setStatus = function (s) {
        statusAtual = s;
        document.getElementById('btnVivo').className     = 'toggle-btn' + (s === 'vivo'     ? ' active-vivo'     : '');
        document.getElementById('btnFalecido').className = 'toggle-btn' + (s === 'falecido' ? ' active-falecido' : '');
        const mf = document.getElementById('morteField');
        if (s === 'falecido') {
            mf.classList.add('visible');
        } else {
            mf.classList.remove('visible');
            document.getElementById('ano_morte').value = '';
        }
    };

    function val(id) { return document.getElementById(id).value.trim(); }

    function err(id, show) {
        const el = document.getElementById('err-' + id);
        if (el) el.classList.toggle('show', show);
        const inp = document.getElementById(id === 'nasc' ? 'data_nasc' : id === 'nac' ? 'nacionalidade' : id);
        if (inp) inp.classList.toggle('error', show);
    }

    function showToast(msg, type) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast ' + type + ' show';
        setTimeout(function () { t.classList.remove('show'); }, 3800);
    }

    window.submitForm = async function () {
        // exige sessão para registrar um ancestral
        if (!window.AuroraAuth || !window.AuroraAuth.isLoggedIn()) {
            showToast('Faça login para registrar um ancestral.', 'error');
            if (window.AuroraAuth) window.AuroraAuth.openLogin();
            return;
        }

        let ok = true;

        const nome = val('nome');
        err('nome', !nome); if (!nome) ok = false;

        const nasc = val('data_nasc');
        const nascOk = nasc.length === 8 && /^\d{8}$/.test(nasc);
        err('nasc', !nascOk); if (!nascOk) ok = false;

        const nac = val('nacionalidade');
        err('nac', !nac); if (!nac) ok = false;

        if (!ok) { showToast('Corrija os campos destacados.', 'error'); return; }

        const btn = document.getElementById('btnSubmit');
        btn.disabled = true; btn.classList.add('loading');

        const payload = {
            nome:           nome,
            data_nasc:      nasc,
            nacionalidade:  nac,
            descendencia:   val('descendencia') || null,
            ano_morte:      statusAtual === 'falecido' ? (val('ano_morte') || null) : null,
            informacoes_add: val('informacoes_add') || null,
            sequencia_dna:  val('sequencia_dna') || null,
        };

        try {
            const sess = window.AuroraAuth && window.AuroraAuth.getSession();
            const headers = { 'Content-Type': 'application/json' };
            if (sess && sess.token) headers['Authorization'] = 'Bearer ' + sess.token;
            const res = await fetch('/api/cadastro', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                showToast('✓ Pessoa registrada com sucesso!', 'success');
                ['nome', 'data_nasc', 'descendencia', 'ano_morte', 'informacoes_add', 'sequencia_dna']
                    .forEach(function (id) { document.getElementById(id).value = ''; });
                document.getElementById('nacionalidade').value = '';
                window.setStatus('vivo');
            } else {
                const msg = await res.text();
                showToast('Erro: ' + (msg || 'Falha ao salvar.'), 'error');
            }
        } catch (e) {
            showToast('Erro de conexão com o servidor.', 'error');
        } finally {
            btn.disabled = false; btn.classList.remove('loading');
        }
    };
})();
