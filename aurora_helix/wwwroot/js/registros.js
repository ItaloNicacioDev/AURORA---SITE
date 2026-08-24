/* ============================================================
   REGISTROS — tabela e estatísticas sobre a API de cadastros
   ============================================================ */
(function () {
    'use strict';

    let allData = [];

    async function loadData() {
        try {
            const res = await fetch('/api/cadastro');
            allData = res.ok ? await res.json() : [];
        } catch (e) {
            allData = [];
        }
        updateStats();
        renderTable();
    }

    function updateStats() {
        const vivos     = allData.filter(function (p) { return !p.ano_morte; }).length;
        const falecidos = allData.filter(function (p) { return  p.ano_morte; }).length;
        const nacs      = new Set(allData.map(function (p) { return p.nacionalidade; }).filter(Boolean)).size;
        document.getElementById('statTotal').textContent     = allData.length;
        document.getElementById('statVivos').textContent     = vivos;
        document.getElementById('statFalecidos').textContent = falecidos;
        document.getElementById('statNac').textContent       = nacs;
    }

    window.filterTable = function () { renderTable(); };

    function renderTable() {
        const q = document.getElementById('tableSearch').value.trim().toLowerCase();
        const data = q ? allData.filter(function (p) {
            return (p.nome || '').toLowerCase().includes(q)
                || (p.nacionalidade || '').toLowerCase().includes(q)
                || (p.descendencia || '').toLowerCase().includes(q);
        }) : allData;

        document.getElementById('tableLabel').textContent =
            data.length + ' registro' + (data.length !== 1 ? 's' : '');

        const body = document.getElementById('tableBody');
        if (data.length === 0) {
            body.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum registro encontrado. <a href="cadastro.html" style="color:var(--aurora-green)">Cadastrar pessoa</a></td></tr>';
            return;
        }
        body.innerHTML = data.map(function (p) {
            const badge = p.ano_morte
                ? '<span class="badge badge-falecido">† ' + p.ano_morte + '</span>'
                : '<span class="badge badge-vivo">Vivo(a)</span>';
            return ''
                + '<tr>'
                +   '<td class="td-id">' + (p.id ?? '') + '</td>'
                +   '<td class="td-name">' + (p.nome || '—') + '</td>'
                +   '<td>' + (p.data_nasc || '—') + '</td>'
                +   '<td>' + (p.nacionalidade || '—') + '</td>'
                +   '<td>' + (p.descendencia || '—') + '</td>'
                +   '<td>' + badge + '</td>'
                + '</tr>';
        }).join('');
    }

    loadData();
})();
