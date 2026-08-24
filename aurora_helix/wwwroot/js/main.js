/* ============================================================
   AURORA — Comportamento comum (todas as páginas)
   · menu hambúrguer / drawer
   · canvas 3D de fundo (Aurora Boreal)
   · pré-loader 3D
   ============================================================ */
(function () {
    'use strict';

    function initNav() {
        const burger = document.getElementById('burger');
        const drawer = document.getElementById('drawer');
        if (!burger || !drawer) return;
        burger.addEventListener('click', function () {
            const open = drawer.classList.toggle('open');
            burger.classList.toggle('open', open);
        });
        document.addEventListener('click', function (e) {
            if (!burger.contains(e.target) && !drawer.contains(e.target)) {
                drawer.classList.remove('open');
                burger.classList.remove('open');
            }
        });
    }

    function start() {
        initNav();
        if (window.Aurora3D) window.Aurora3D.init('auroraCanvas', { mouse: true });
        if (window.AuroraPreloader) window.AuroraPreloader.init();
    }

    if (document.readyState !== 'loading') start();
    else document.addEventListener('DOMContentLoaded', start);
})();
