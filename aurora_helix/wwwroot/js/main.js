/* ============================================================
   AURORA — Comportamento comum (todas as páginas)
   · menu hambúrguer / drawer (fecha em clique/Escape/rota)
   · canvas 3D de fundo (aurora + hélice de DNA)
   · pré-loader 3D
   · estado de scroll na nav (nav.scrolled)
   · reveal-on-scroll (IntersectionObserver, com stagger)
   · tilt 3D sutil em cards (somente pointer fino)
   ============================================================ */
(function () {
    'use strict';

    var reduced = window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── NAV / DRAWER ── */
    function initNav() {
        var burger = document.getElementById('burger');
        var drawer = document.getElementById('drawer');
        if (!burger || !drawer) return;

        burger.setAttribute('aria-expanded', 'false');

        burger.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = drawer.classList.toggle('open');
            burger.classList.toggle('open', open);
            burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        /* fecha ao navegar por um link do drawer */
        drawer.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () {
                drawer.classList.remove('open');
                burger.classList.remove('open');
            });
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                drawer.classList.remove('open');
                burger.classList.remove('open');
            }
        });

        document.addEventListener('click', function (e) {
            if (!burger.contains(e.target) && !drawer.contains(e.target)) {
                drawer.classList.remove('open');
                burger.classList.remove('open');
            }
        });
    }

    /* ── NAV: estado de scroll (fundo mais sólido ao rolar) ── */
    function initScrollNav() {
        var nav = document.querySelector('nav');
        if (!nav) return;
        var update = function () {
            nav.classList.toggle('scrolled', (window.scrollY || 0) > 24);
        };
        update();
        window.addEventListener('scroll', update, { passive: true });
    }

    /* ── REVEAL ON SCROLL ── */
    function initReveal() {
        if (reduced || !('IntersectionObserver' in window)) return;

        var els = document.querySelectorAll(
            '.card, .nav-tile, .timeline-item, .tech-chip, .cta-block, .divider'
        );
        if (!els.length) return;

        els.forEach(function (el) { el.classList.add('will-reveal'); });

        /* stagger entre irmãos do mesmo grupo */
        document.querySelectorAll('.cards, .nav-grid, .timeline, .tech-grid').forEach(function (g) {
            Array.prototype.forEach.call(g.children, function (child, i) {
                child.style.transitionDelay = Math.min(i * 70, 420) + 'ms';
            });
        });

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) {
                    en.target.classList.add('revealed');
                    io.unobserve(en.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });

        els.forEach(function (el) { io.observe(el); });
    }

    /* ── TILT 3D sutil (hover com pointer fino) ── */
    function initTilt() {
        if (reduced || !window.matchMedia
            || !window.matchMedia('(pointer: fine)').matches) return;

        document.querySelectorAll('.card, .nav-tile').forEach(function (el) {
            el.addEventListener('pointermove', function (e) {
                var r = el.getBoundingClientRect();
                if (!r.width || !r.height) return;
                var x = (e.clientX - r.left) / r.width - 0.5;
                var y = (e.clientY - r.top) / r.height - 0.5;
                el.style.setProperty('--rx', (-y * 5).toFixed(2) + 'deg');
                el.style.setProperty('--ry', (x * 7).toFixed(2) + 'deg');
            });
            el.addEventListener('pointerleave', function () {
                el.style.setProperty('--rx', '0deg');
                el.style.setProperty('--ry', '0deg');
            });
        });
    }

    function start() {
        initNav();
        initScrollNav();
        if (window.Aurora3D) window.Aurora3D.init('auroraCanvas', { mouse: true });
        if (window.AuroraPreloader) window.AuroraPreloader.init();
        initReveal();
        initTilt();
    }

    if (document.readyState !== 'loading') start();
    else document.addEventListener('DOMContentLoaded', start);
})();
