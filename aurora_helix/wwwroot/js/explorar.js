/* ============================================================
   EXPLORAR — busca e filtros sobre a API de cadastros
   ============================================================ */
(function () {
    'use strict';

    let allData = [], activeFilter = 'todos';

    async function loadData() {
        try {
            const res = await fetch('/api/cadastro');
            allData = res.ok ? await res.json() : [];
        } catch (e) {
            allData = [];
        }
        renderResults();
    }

    window.setFilter = function (el, f) {
        document.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
        el.classList.add('active');
        activeFilter = f;
        renderResults();
    };

    window.handleSearch = function () { renderResults(); };

    function renderResults() {
        const q = document.getElementById('searchInput').value.trim().toLowerCase();
        let data = allData;

        if (activeFilter === 'vivos')       data = data.filter(function (p) { return !p.ano_morte; });
        if (activeFilter === 'falecidos')   data = data.filter(function (p) { return  p.ano_morte; });
        if (q) data = data.filter(function (p) {
            return (p.nome || '').toLowerCase().includes(q)
                || (p.nacionalidade || '').toLowerCase().includes(q)
                || (p.descendencia  || '').toLowerCase().includes(q);
        });

        const grid  = document.getElementById('resultsGrid');
        const empty = document.getElementById('emptyState');
        document.getElementById('resultsCount').textContent =
            data.length + ' pessoa' + (data.length !== 1 ? 's' : '');

        if (data.length === 0) {
            grid.style.display  = 'none';
            empty.style.display = 'block';
            return;
        }
        grid.style.display  = 'grid';
        empty.style.display = 'none';

        grid.innerHTML = data.map(function (p) {
            const initials = (p.nome || '?').split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
            const status   = p.ano_morte ? ('† ' + p.ano_morte) : 'Vivo(a)';
            const statusColor = p.ano_morte ? 'color:var(--aurora-violet)' : 'color:var(--aurora-green)';
            return ''
                + '<div class="result-card">'
                +   '<div class="result-info">'
                +     '<div class="result-name">' + (p.nome || '—') + '</div>'
                +     '<div class="result-meta">'
                +       '<span class="tag">' + (p.nacionalidade || '—') + '</span>'
                +       '<span>' + (p.data_nasc ? 'Nasc. ' + p.data_nasc : '—') + '</span>'
                +       '<span style="' + statusColor + '">' + status + '</span>'
                +     '</div>'
                +   '</div>'
                +   '<div class="result-avatar">' + initials + '</div>'
                + '</div>';
        }).join('');
    }

    loadData();
})();
