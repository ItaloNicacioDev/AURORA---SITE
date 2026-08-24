/* ============================================================
   COMPRAR — abas de pagamento, formatação e cópia Pix
   ============================================================ */
(function () {
    'use strict';

    window.switchTab = function (tab) {
        document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
        document.querySelector('.tab-' + tab).classList.add('active');
        document.getElementById('panel-' + tab).classList.add('active');
    };

    window.formatCard = function (input) {
        let v = input.value.replace(/\D/g, '').slice(0, 16);
        input.value = v.replace(/(.{4})/g, '$1 ').trim();
        const preview = v.padEnd(16, '•');
        document.getElementById('cardPreview').textContent =
            preview.slice(0, 4) + ' ' + preview.slice(4, 8) + ' ' +
            preview.slice(8, 12) + ' ' + preview.slice(12, 16);
    };

    window.formatExpiry = function (input) {
        let v = input.value.replace(/\D/g, '').slice(0, 4);
        if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
        input.value = v;
    };

    window.copyPix = function () {
        const key = 'aurora@exemplo.com.br';
        if (navigator.clipboard) {
            navigator.clipboard.writeText(key).catch(function () {});
        }
        const btn = document.getElementById('btnCopy');
        btn.textContent = '✓ Copiado!';
        btn.classList.add('copied');
        setTimeout(function () {
            btn.textContent = 'Copiar chave';
            btn.classList.remove('copied');
        }, 2500);
    };

    window.handlePaypal = function () {
        alert('Redirecionando para o PayPal...\n(Integre com a API do PayPal aqui)');
    };

    window.handleCard = function () {
        alert('Processando pagamento...\n(Integre com Stripe, PagSeguro ou similar aqui)');
    };
})();
