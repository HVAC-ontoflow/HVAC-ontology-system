/* HVAC Knowledge System — 화면 코드
   ============================================================
   이 파일은 마크업에 값을 써 넣는 일만 한다. 값은 전부 js/data.js(KB)와
   js/graph-data.js(GRAPH)에서 오고, 여기서 새로 만들어 내는 수치는 없다.

   화면은 세 파트다.
     01 문서 → 온톨로지   입력 문서 · 변환 단계 · 결과 수치
     02 온톨로지 탐색     오른쪽 그래프 / 왼쪽 판독 (커서를 올린 노드의 관계 전부)
     03 질의응답          세 문항이 무한 반복. 답이 되는 노드가 그래프에서
                          밝아진 뒤 왼쪽 답변판으로 내려앉는다

   03 의 답은 지어내지 않는다. qaResolve() 가 GRAPH 를 실제로 걸어서
   답이 되는 노드를 찾는다 — 그래프를 다시 뽑아도 답이 따라 바뀐다.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var lang = function () { return root.getAttribute('data-lang') || 'ko'; };

  /* {ko, en} 객체와 평문 문자열을 같이 받는다 */
  function t(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    return v[lang()] !== undefined ? v[lang()] : (v.ko || '');
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 1000 단위 구분. 소수는 그대로 둔다 — 2.2 를 2 로 만들면 안 된다.
     dp 를 주면 자리수를 고정한다: TTL 에 3.0 으로 적힌 값을 3 으로 줄이지 않기 위한 것. */
  function fmt(n, dp) {
    if (typeof n !== 'number') return String(n);
    if (dp !== undefined) return n.toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function el(id) { return document.getElementById(id); }

  /* 술어의 접두사. graph-data.js 에는 이름만 실려 있는데, 화면에 hvo: 를
     일괄로 붙이면 사실이 틀린다 — hasPart 와 hasLocation 은 Brick 것이다.
     질문·정답 카탈로그도 "hvo:hasPart 로 물으면 0행"이라고 적어 두었다.
     ontology.ttl 을 grep 해서 확인한 결과대로 적는다. */
  var BRICK_P = { hasPart: 1, hasLocation: 1 };
  function qname(p) { return (BRICK_P[p] ? 'brick:' : 'hvo:') + p; }

  /* 마침표 뒤에서 줄을 바꾼다. 한글 본문은 문장 단위로 끊는 편이 훨씬 잘 읽힌다.
     0.335 · p.252 · SCH-A03 은 마침표 뒤에 공백이 없어 걸리지 않는다.
     이미 escape 된 문자열에 넣으므로 반드시 esc() 다음에 부른다. */
  function brs(html) {
    if (lang() !== 'ko') return html;
    return String(html).replace(/(\.)\s+(?=\S)/g, '$1<br>');
  }

  /* 여러 곳에서 다시 그려야 하는 렌더러를 모아 둔다 */
  var renderers = [];
  function register(fn) { renderers.push(fn); fn(); }

  /* 스크롤에 붙는다. rAF 로 묶지 않는다 — 콜백이 한 번 오지 않으면 플래그가
     선 채로 남아 그 시스템이 스크롤에 영구히 반응하지 않는다. 여기서 하는 일은
     rect 몇 번 읽고 클래스를 토글하는 정도이고, 스크롤 이벤트도 프레임마다
     한 번꼴로 오므로 그 자리에서 바로 한다. */
  function onScroll(fn) {
    window.addEventListener('scroll', fn, { passive: true });
    window.addEventListener('resize', fn);
    fn();
  }

  /* 무엇을 보고 있는지 판정하는 선.
     좁은 화면에서는 그래프 띠가 화면 위쪽을 덮으므로, 그 아래로 내린다 —
     그러지 않으면 띠에 가려 아직 안 보이는 파트가 '지금 보는 것'이 된다.
     띠가 위쪽에 붙는 구간은 CSS 와 같은 1079px 경계로 판단한다. */
  function decideLine() {
    var vh = window.innerHeight || 800;
    var mid = vh * 0.42;
    var g = document.querySelector('.stage-graph');
    if (!g || !g.parentNode) return mid;
    var b = g.getBoundingClientRect();
    var wrap = g.parentNode.getBoundingClientRect();
    /* 그래프가 '위쪽 띠' 로 붙어 있는 배치인가. 화면 폭으로 판단하면 안 된다 —
       누운 핸드폰은 폭이 좁아도 그래프가 오른쪽 칸이다. 폭이 좁다는 이유로
       선을 내렸더니 390px 높이에서 선이 335px 에 놓여, 파트가 화면 거의
       바닥에 닿아야 바뀌었다. 그래서 02 를 잠긴 채로 지나갔다.
       띠인지 아닌지는 배치가 말해 준다 — 띠는 칸 폭을 거의 다 쓴다. */
    if (!wrap.width || b.width < wrap.width * 0.8) return mid;
    /* 아직 위에 붙지 않고 흘러 지나가는 중이면 그대로 둔다 */
    if (b.top > vh * 0.3 || b.bottom <= mid) return mid;
    return Math.min(b.bottom + 44, vh * 0.86);
  }

  /* 커서가 있는 기기인가. 핸드폰에는 없으므로 안내 문구를 바꿔야 한다 —
     "커서를 올려 보세요" 는 손가락으로 보는 사람에게는 거짓말이다.
     (hover: hover) 만으로는 일부 안드로이드가 참을 돌려주므로 pointer 도 본다. */
  function fine() {
    try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; }
    catch (e) { return true; }
  }
  function renderAll() { renderers.forEach(function (fn) { fn(); }); }

  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;


  /* ═══ 언어 전환 ═══════════════════════════════════════════════════
     정적 마크업은 CSS 가 한쪽을 감추므로 속성만 뒤집고, JS 가 그린 것은
     다시 그린다. */
  (function langToggle() {
    var btn = el('langToggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = lang() === 'ko' ? 'en' : 'ko';
      root.setAttribute('data-lang', next);
      root.setAttribute('lang', next);
      document.title = next === 'ko'
        ? 'ONTOFLOW — HVAC Knowledge System · 온톨로지 기반 건물 지식 탐색'
        : 'ONTOFLOW — HVAC Knowledge System · Ontology-based Building Knowledge Explorer';
      renderAll();
    });
  }());


  /* ═══ 히어로 ══════════════════════════════════════════════════════ */

  /* 규모 지표 — 숫자를 세어 올리지 않는다. 포스터 스크린샷이 애니메이션
     중간에 찍히면 55,714 처럼 엉뚱한 수가 박힌다(실제로 그랬다). */
  register(function kpi() {
    var host = el('kpiStrip');
    if (!host || typeof KB === 'undefined') return;
    host.innerHTML = KB.scale.headline.map(function (k) {
      return '<div class="tile">' +
               '<b class="num">' + fmt(k.value) + '</b>' +
               '<span class="tile-label">' + esc(t(k.label)) +
                 (k.verified ? '<i class="chk" aria-hidden="true">✓</i>' : '') + '</span>' +
               '<span class="tile-note">' + esc(t(k.note)) + '</span>' +
             '</div>';
    }).join('');
  });

  /* ═══ 01 문서 → 온톨로지 ═══════════════════════════════════════════
     문서가 세 단계를 지나며 온톨로지가 된다. 각 단계에서 실제로 무엇이
     세워지는지 보여야 "무슨 처리를 거치는지" 가 읽힌다 — 이름만 적어 두면
     칸 세 개가 그냥 놓여 있는 것과 같다.

       TBOX  클래스 계층      Brick 어휘를 재사용하고 필요한 것만 자체 정의
       RBOX  관계 속성        이 온톨로지가 쓰는 술어 여덟 개
       ABOX  개체 · 값 · 출처   위 두 스키마에 맞춰 단언한다 (개수가 쌓인다)

     여기 적히는 클래스 이름과 술어는 모두 ontology.ttl 에 실제로 있는 것이다
     (grep 으로 확인했다). 단계 이름을 채우기 위해 지어낸 것이 없다.

     한 번 다 자라면 그대로 둔다 — 계속 지웠다 만들면 온톨로지가 사라지는
     것처럼 보인다. 다시 보려면 '다시 만들기' 를 누른다. */
  var ingGraph = null;
  var ingBuiltN = 0, ingBuiltE = 0, ingDone = false;

  /* TBox — 실제 클래스. 상위(Brick)와 하위(자체 정의)를 짝으로 둔다. */
  var PIPE_T = [
    ['brick:Air_Handling_Unit', 'hvo:UnderfloorAirHandlingUnit'],
    ['brick:Supply_Fan', 'brick:Motor'],
    ['hvo:QuantityValue', 'hvo:SourceReference'],
    ['hvo:DesignBasis', 'hvo:CalculationStep']
  ];
  /* RBox — 이 부분 그래프가 실제로 쓰는 술어 여덟 개 */
  var PIPE_R = ['brick:hasPart', 'brick:hasLocation', 'hvo:serves',
                'hvo:hasQuantityValue', 'hvo:selectedBy', 'hvo:derivedFrom',
                'hvo:basedOn', 'hvo:sourcedFrom'];

  function ingPaintCount(n, e) {
    var out = el('oneCount');
    if (!out) return;
    var tpl = out.dataset.tpl || '노드 %N · 엣지 %E';
    out.innerHTML = tpl.replace('%N', '<b>' + fmt(n) + '</b>')
                       .replace('%E', '<b>' + fmt(e) + '</b>');
  }

  register(function ingChrome() {
    var out = el('oneCount');
    if (out) {
      out.dataset.tpl = lang() === 'ko' ? '노드 %N · 엣지 %E' : '%N nodes · %E edges';
      ingPaintCount(ingBuiltN, ingBuiltE);
    }
    /* 단계 안의 항목은 진행률에 따라 열리므로, 뼈대만 미리 깔아 둔다. */
    var tl = el('stTList');
    if (tl) {
      tl.innerHTML = PIPE_T.map(function (pair) {
        return '<li><span class="pi-a">' + esc(pair[0]) + '</span>' +
               '<span class="pi-b">' + esc(pair[1]) + '</span></li>';
      }).join('');
    }
    var rl = el('stRList');
    if (rl) {
      rl.innerHTML = PIPE_R.map(function (p) {
        return '<li><span class="pi-p">' + esc(p) + '</span></li>';
      }).join('');
    }
    ingPaintStageA();
  });

  /* ABox 단계 — 쌓이는 개수를 그대로 적는다 */
  function ingPaintStageA() {
    var al = el('stAList');
    if (!al || typeof GRAPH === 'undefined') return;
    var L = lang() === 'ko';
    al.innerHTML =
      '<li><span class="pi-k">' + (L ? '개체' : 'individuals') + '</span>' +
        '<span class="pi-v num">' + fmt(ingBuiltN) + '</span></li>' +
      '<li><span class="pi-k">' + (L ? '관계 단언' : 'relations') + '</span>' +
        '<span class="pi-v num">' + fmt(ingBuiltE) + '</span></li>';
  }

  function ingCountAt(p) {
    if (typeof GRAPH === 'undefined' || !ingGraph) return [0, 0];
    var N = GRAPH.nodes.length;
    var cut = Math.round(p * N);
    var rank = ingGraph.buildRank;
    if (!rank) return [cut, 0];
    var e = 0, E = GRAPH.edges;
    for (var i = 0; i < E.length; i++) {
      if (rank[E[i][0]] < cut && rank[E[i][1]] < cut) e++;
    }
    return [cut, e];
  }

  /* 01 의 생성 타이머. 상태 기계가 켜고 끈다. */
  var ingTimer = null, ingT0 = 0, ingDur = 11000;

  /* 생성에 쓸 시간. 좁은 화면에서는 짧게 잡는다.
     문서가 화면 높이에 비해 길어서(세로 390x844 에서 5,078px = 6 화면),
     넓은 화면과 같은 11초를 쓰면 02 에 도착할 때까지 끝나지 않는다 —
     실측으로 탐색 파트를 잠긴 채로 지나갔다. 7초면 자라는 것이 충분히
     보이면서도 02 에 도착하기 전에 끝난다. */
  function ingBaseDur() {
    var narrow;
    try { narrow = window.matchMedia('(max-width: 1079px)').matches; }
    catch (e) { narrow = window.innerWidth < 1080; }
    return narrow ? 7000 : 11000;
  }

  function ingStages() { return [el('stT'), el('stR'), el('stA')]; }

  function ingOpen(host, frac) {
    var lis = host ? host.children : [];
    var k = Math.round(frac * lis.length);
    for (var i = 0; i < lis.length; i++) lis[i].classList.toggle('is-on', i < k);
  }

  /* ── 문서가 온톨로지가 되는 한 줄기 ──
     예전에는 왼쪽에서 종이가 흘러가고 오른쪽에서 그래프가 자라는 두 장면이
     서로 무관하게 돌았다. 시트는 자기 칸 오른쪽 끝(88%)에서 옅어져 사라지고,
     거기서 끝이었다 — 무엇이 무엇이 되는지 화면이 말해 주지 않았다.

     그 사라지던 자리에서 이어받는다. 지금 켜져 있는 단계(TBox·RBox·ABox)를
     한 번 거쳐, 방금 만들어진 노드 자리로 들어간다. 도착하면 그 자리에
     고리가 한 번 퍼진다. 그래서 종이 한 장 → 단계 → 노드 하나가 한 줄기로 읽힌다.

     생성 순서의 역표. graph.js 는 노드마다 순위를 주지만, 우리는 "지금 순위
     n 인 노드가 누구인가" 를 알아야 한다. */
  var ingOrder = null;
  function ingOrderOf() {
    if (ingOrder) return ingOrder;
    var rank = G && G.buildRank;
    if (!rank) return null;
    ingOrder = new Array(rank.length);
    for (var i = 0; i < rank.length; i++) ingOrder[rank[i]] = i;
    return ingOrder;
  }

  var ingFlyT = 0;

  function ingFlyOne(cut) {
    var fly = el('ingFly'), left = document.querySelector('.ing-left');
    if (!fly || !left || reduced) return;

    var lb = left.getBoundingClientRect();
    var vh = window.innerHeight || 800;
    /* 문서 칸이 화면에 없으면 보낼 이유가 없다 */
    if (lb.bottom < 40 || lb.top > vh - 40) return;

    var fb = fly.getBoundingClientRect();
    /* 출발 — 시트가 옅어지며 사라지던 그 자리(칸 오른쪽 88%) */
    var x0 = lb.left - fb.left + lb.width * 0.88;
    var y0 = lb.top - fb.top + lb.height * (0.3 + Math.random() * 0.4);

    /* 좁은 화면에서 그래프는 위쪽에 붙은 띠다. 비행층(z 12)이 띠(z 8)보다
       위이므로, 띠 뒤에 있는 문서 칸에서 출발하면 조각이 그래프 한가운데에서
       난데없이 튀어나온 것처럼 보인다. 그런 때는 보내지 않는다 —
       출발이 보이지 않는 비행은 무엇이 무엇이 되는지 말해 주지 못한다. */
    var band = document.querySelector('.stage-graph');
    if (band && band.parentNode) {
      var bb = band.getBoundingClientRect();
      var wrapW = band.parentNode.getBoundingClientRect().width;
      var strip = wrapW && bb.width > wrapW * 0.8;
      if (strip && lb.top - fb.top < bb.bottom - fb.top) return;
    }

    /* 경유 — 지금 켜져 있는 단계 */
    var on = document.querySelector('.pipe-st.is-on:not(.is-past)') ||
             document.querySelector('.pipe-st.is-on');
    var x1 = x0, y1 = y0;
    if (on) {
      var ob = on.getBoundingClientRect();
      x1 = ob.left - fb.left + ob.width * 0.5;
      y1 = ob.top - fb.top + ob.height * 0.5;
    }

    /* 도착 — 방금 만들어진 노드. 아직 노드가 없으면(스키마 단계) 단계에서 끝난다. */
    var x2 = null, y2 = null;
    var ord = ingOrderOf(), canvas = el('oneGraph');
    if (ord && canvas && G && cut > 0) {
      var idx = ord[Math.max(0, Math.min(ord.length - 1, cut - 1))];
      var pt = G.screenPos(idx);
      if (pt) {
        var cb = canvas.getBoundingClientRect();
        x2 = cb.left - fb.left + pt.x;
        y2 = cb.top - fb.top + pt.y;
      }
    }

    var chip = document.createElement('span');
    chip.className = 'ing-chip';
    chip.style.left = x0 + 'px';
    chip.style.top = y0 + 'px';
    fly.appendChild(chip);
    void chip.offsetWidth;

    function drop(n) { if (n && n.parentNode) n.parentNode.removeChild(n); }

    /* 1구간 — 단계로 */
    chip.classList.add('is-go');
    chip.style.transform = 'translate(' + (x1 - x0) + 'px,' + (y1 - y0) + 'px) scale(.72)';

    setTimeout(function () {
      if (x2 === null) {
        chip.classList.add('is-end');
        setTimeout(function () { drop(chip); }, 420);
        return;
      }
      /* 2구간 — 노드로. 지나온 길을 실로 한 번 긋는다. */
      var dx = x2 - x1, dy = y2 - y1;
      var len = Math.sqrt(dx * dx + dy * dy);
      var wire = document.createElement('span');
      wire.className = 'ing-wire';
      wire.style.left = x1 + 'px';
      wire.style.top = y1 + 'px';
      wire.style.width = len + 'px';
      wire.style.transform = 'rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2) + 'deg) scaleX(0)';
      fly.appendChild(wire);
      void wire.offsetWidth;
      wire.classList.add('is-on');
      wire.style.transform = 'rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2) + 'deg) scaleX(1)';

      chip.style.transform = 'translate(' + (x2 - x0) + 'px,' + (y2 - y0) + 'px) scale(.3)';

      setTimeout(function () {
        /* 도착한 자리에 고리 하나 — 여기서 노드가 되었다는 표시 */
        var ring = document.createElement('span');
        ring.className = 'ing-ring';
        ring.style.left = x2 + 'px';
        ring.style.top = y2 + 'px';
        fly.appendChild(ring);
        chip.classList.add('is-end');
        wire.classList.add('is-off');
        setTimeout(function () { drop(chip); drop(wire); drop(ring); }, 900);
      }, 620);
    }, 520);
  }

  /* 층을 비운다 — 다시 만들기를 누르거나 파트를 벗어날 때 */
  function ingFlyClear() {
    var fly = el('ingFly');
    if (fly) while (fly.firstChild) fly.removeChild(fly.firstChild);
  }

  function ingStep() {
    var p = Math.min(1, (Date.now() - ingT0) / ingDur);
    var sts = ingStages();
    if (sts[0]) sts[0].classList.toggle('is-on', p > 0.01);
    if (sts[1]) sts[1].classList.toggle('is-on', p > 0.10);
    if (sts[2]) sts[2].classList.toggle('is-on', p > 0.20);
    if (sts[0]) sts[0].classList.toggle('is-past', p > 0.20);
    if (sts[1]) sts[1].classList.toggle('is-past', p > 0.20);

    ingOpen(el('stTList'), p <= 0.01 ? 0 : Math.min(1, (p - 0.01) / 0.09));
    ingOpen(el('stRList'), p <= 0.10 ? 0 : Math.min(1, (p - 0.10) / 0.10));

    var g = p <= 0.20 ? 0 : (p - 0.20) / 0.80;
    if (G) G.setBuild(g);
    var c = ingCountAt(g);
    if (c[0] !== ingBuiltN || c[1] !== ingBuiltE) {
      ingBuiltN = c[0]; ingBuiltE = c[1];
      ingPaintCount(ingBuiltN, ingBuiltE);
      ingPaintStageA();
    }
    /* 시트는 1.1초 간격으로 한 장씩 도착한다(--d 0.0/1.1/2.2/3.3). 같은
       박자로 한 줄기씩 보낸다. 스키마 단계(p<=0.20)에서는 단계까지만 간다. */
    var now2 = Date.now();
    if (p > 0.02 && p < 1 && now2 - ingFlyT > 1100) {
      ingFlyT = now2;
      ingFlyOne(ingBuiltN);
    }

    if (p < 1) { ingTimer = setTimeout(ingStep, reduced ? 400 : 90); }
    else { ingTimer = null; ingDone = true; ingDoneNow(); }
  }

  /* 01 을 지나 내려갔는데 아직 만들고 있을 때.
     그대로 두면 02 와 03 이 여러 화면에 걸쳐 잠긴 채로 남고, 그래프 위에는
     "잠시 후 사용할 수 있습니다" 가 계속 떠 있다 — 실측으로 390x844 에서
     페이지 88% 까지 그 상태였다. 고장난 것처럼 보인다.

     그렇다고 남은 것을 즉시 채우면 결과가 짠 하고 나타난다. 남은 진행을
     2.2초에 나눠 준다 — 자라는 것이 보이면서도 기다림이 끝난다.
     진행률이 튀지 않게, 지금 값을 유지하면서 전체 길이만 줄인다. */
  function ingUrge() {
    if (ingTimer === null || ingDone) return;
    var el0 = Date.now() - ingT0;
    var p = Math.min(1, el0 / ingDur);
    if (p > 0.97) return;
    var rest = reduced ? 200 : 2200;
    var dur = rest / (1 - p);
    ingDur = dur;
    ingT0 = Date.now() - p * dur;
  }

  function ingMark() {
    var btn = el('ingReplay');
    if (btn) btn.classList.toggle('is-ready', ingDone);
  }
  function ingPause() {
    if (ingTimer !== null) { clearTimeout(ingTimer); ingTimer = null; }
  }
  function ingPlay() {
    var stage = el('ingStage');
    if (stage) stage.classList.add('is-on');
    if (ingTimer !== null || ingDone) return;
    ingDur = ingBaseDur();
    ingT0 = Date.now();
    ingStep();
  }
  /* 온톨로지가 다 만들어졌는지. 이 값이 false 인 동안 02·03 의 기능은 잠긴다.

     예전에는 02·03 으로 스크롤하면 ingFinish() 가 남은 노드를 앞당겨 채웠다.
     그러면 "만들어지는 과정"이 스크롤 한 번에 건너뛰어지고, 결과가 짠 하고
     나타난다 — 만드는 것을 보여주는 파트인데 그 과정을 스스로 지운 셈이었다.
     지금은 생성이 제 속도로 끝까지 가고, 아래 파트는 그동안 기다린다. */
  var ontologyReady = false;

  function ingDoneNow() {
    ontologyReady = true;
    ingMark();
    /* 다 만들어진 시점의 파트에 맞춰 기능을 켠다 */
    if (typeof stageEnable === 'function') stageEnable();
  }

  function ingReplay() {
    ingPause();
    ingDone = false;
    ontologyReady = false;
    if (typeof stageEnable === 'function') stageEnable();
    ingBuiltN = 0; ingBuiltE = 0;
    ingFlyClear();
    if (G) { G.clearFocus(); G.setBuild(0); }
    ingPaintCount(0, 0);
    ingPaintStageA();
    [el('stTList'), el('stRList')].forEach(function (h) {
      if (!h) return;
      for (var i = 0; i < h.children.length; i++) h.children[i].classList.remove('is-on');
    });
    ingStages().forEach(function (x) {
      if (x) { x.classList.remove('is-on'); x.classList.remove('is-past'); }
    });
    ingMark();
    ingDur = ingBaseDur();
    ingT0 = Date.now();
    ingStep();
  }

  register(function ingWire() {
    var btn = el('ingReplay');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', ingReplay);
  });

  /* 무대가 화면에 가까워지면 바로 시작한다.
     예전에는 파트 01 이 '활성 파트' 가 된 뒤에 시작했다. 그러면 히어로에서
     내려오는 동안은 아무것도 안 하고 있다가, 01 에 도착해서야 0 부터 만들기
     시작해 첫 노드까지 한참 기다려야 했다. 한 화면 앞에서 미리 시작해 두면
     도착했을 때 이미 자라고 있다. */
  (function ingEarly() {
    var stage = el('ingStage');
    if (!stage) return;
    function check() {
      var b = stage.getBoundingClientRect();
      var vh = window.innerHeight || 800;
      /* 얼마나 앞에서 시작할지. 좁은 화면에서는 히어로가 1.5 화면이고 01 의
         무대도 위아래로 쌓여 길어서, 한 화면 앞(1.6)에서 시작하면 도착이
         너무 늦다 — 실측으로 페이지 60% 까지 그래프가 비어 있었다.
         두 화면 반 앞에서 시작한다. 스크롤을 시작하면 곧 시작되는 셈이다. */
      var narrow;
      try { narrow = window.matchMedia('(max-width: 1079px)').matches; }
      catch (e) { narrow = window.innerWidth < 1080; }
      if (b.top < vh * (narrow ? 2.6 : 1.6)) { ingPlay(); }
    }
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    /* 첫 판단은 레이아웃이 끝난 뒤에 한다. 스크립트가 도는 시점에는 히어로
       캔버스가 아직 자리를 잡지 않아 문서가 짧고, 무대가 화면 가까이에 있는
       것처럼 보인다 — 그 상태로 판단하면 열자마자 시작된다. */
    if (document.readyState === 'complete') check();
    else window.addEventListener('load', check);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(check);
  }());


  /* ═══ 02 온톨로지 탐색 ═════════════════════════════════════════════
     오른쪽 그래프의 hover 를 왼쪽 판독판에 쓴다. graph.js 의 info(i) 가
     그 노드의 클래스와 관계 묶음을 돌려주고, 여기서는 그것을 조판만 한다. */
  var exGraph = null;

  function exReadEmpty() {
    var L = lang() === 'ko';
    return '<div class="ex-empty">' +
      '<span class="ex-kicker">' + (L ? '노드 판독' : 'Node readout') + '</span>' +
      '<p class="ex-lead">' + (fine()
        ? (L
          ? '오른쪽 그래프의 노드에 커서를 올리면<br>그 개체가 무엇이고 어떤 관계로 무엇에 매달려 있는지 여기에 나옵니다.'
          : 'Hover a node in the graph to the right.<br>What the individual is, and exactly what it hangs off, appears here.')
        : (L
          ? '위 그래프의 노드를 누르면<br>그 개체가 무엇이고 어떤 관계로 무엇에 매달려 있는지 여기에 나옵니다.'
          : 'Tap a node in the graph above.<br>What the individual is, and exactly what it hangs off, appears here.')) + '</p>' +
      '<p class="ex-lead ex-lead--dim">' + (fine()
        ? (L
          ? 'HVAC 설비 노드를 누르면 그 설비만 남기고 나머지를 눌러 둡니다.'
          : 'Click an equipment node to keep it lit and press the rest back.')
        : (L
          ? '빈 곳을 누르면 판독을 닫습니다.'
          : 'Tap an empty spot to close the readout.')) + '</p>' +
      '</div>';
  }

  function exReadNode(nd) {
    var L = lang() === 'ko';
    var meta = nd.typeMeta;

    var groups = nd.groups.map(function (g) {
      var items = g.items.map(function (it) {
        return '<li><i class="ex-dot" style="background:' + it.meta.c + '"></i>' +
               '<span class="ex-il">' + esc(it.label) + '</span>' +
               '<span class="ex-it">' + esc(L ? it.meta.ko : it.meta.en) + '</span></li>';
      }).join('');
      return '<div class="ex-grp">' +
               '<div class="ex-grp-h">' +
                 '<span class="ex-arrow">' + (g.out ? '→' : '←') + '</span>' +
                 '<span class="ex-pred">' + esc(qname(g.p)) + '</span>' +
                 '<span class="ex-cnt num">' + g.items.length + '</span>' +
               '</div>' +
               '<ul class="ex-items">' + items + '</ul>' +
             '</div>';
    }).join('');

    return '<div class="ex-node">' +
      '<div class="ex-node-h">' +
        '<i class="ex-dot ex-dot--big" style="background:' + meta.c + '"></i>' +
        '<span class="ex-cls">' + esc(L ? meta.ko : meta.en) + '</span>' +
        '<span class="ex-deg">' + (L ? '관계 ' : 'links ') +
          '<b class="num">' + nd.degree + '</b></span>' +
      '</div>' +
      '<p class="ex-label">' + esc(nd.label) + '</p>' +
      '<div class="ex-groups">' + groups + '</div>' +
    '</div>';
  }

  register(function explore() {
    var host = el('exRead');
    if (!host) return;
    /* 커서가 올라가 있지 않은 상태를 기본으로 둔다. 언어를 바꿔 다시 그릴 때도
       마지막으로 본 노드를 되살리지 않는다 — 커서는 이미 떠났을 것이다. */
    host.innerHTML = exReadEmpty();

    var lg = el('exLegend');
    var OG = window.OntoGraph;
    if (lg && OG) {
      var L = lang() === 'ko';
      lg.innerHTML = OG.LEGEND.map(function (k) {
        var m = OG.TYPES[k];
        return '<li><i style="background:' + m.c + '"></i>' + esc(L ? m.ko : m.en) + '</li>';
      }).join('');
    }

  });

  /* 2D / 3D 전환 */
  register(function dimToggle() {
    var host = el('mapDim');
    if (!host || !exGraph || !exGraph.has3D) return;
    var L = lang() === 'ko';
    var on = exGraph.is3D();
    host.innerHTML =
      '<span class="md-label">' + (L ? '보기' : 'View') + '</span>' +
      '<button type="button" data-d="2" aria-pressed="' + (!on) + '">' +
        '2D<em>' + (L ? '평면' : 'flat') + '</em></button>' +
      '<button type="button" data-d="3" aria-pressed="' + (on) + '">' +
        '3D<em>' + (L ? '구체' : 'sphere') + '</em></button>' +
      '<span class="md-note">' +
        (L ? (on ? '회전하는 구 · 가운데가 HVAC 설비, 껍질이 출처입니다'
                 : '평면 바퀴 · 3D를 누르면 같은 그래프가 구로 펼쳐집니다')
           : (on ? 'rotating sphere · equipment at the core, sources on the outer shell'
                 : 'flat wheel · press 3D to unfold the same graph onto a sphere')) +
      '</span>';
    Array.prototype.forEach.call(host.querySelectorAll('button'), function (btn) {
      btn.addEventListener('click', function () {
        exGraph.setThreeD(btn.getAttribute('data-d') === '3');
        dimToggleRedraw();
      });
    });
  });
  function dimToggleRedraw() {
    renderers.forEach(function (fn) { if (fn.name === 'dimToggle') fn(); });
  }


  /* ═══ 03 질의응답 ═══════════════════════════════════════════════════

     세 문항을 세 페이지로 놓는다. 스크롤이 다음 문항을 연다.

     예전에는 한 자리에서 세 문항이 자동으로 돌아갔다. 그러면 읽던 답이
     시간이 지나면 사라지고, 읽는 속도를 화면이 정해 버린다. 지금은 한 문항을
     끝까지 보고, 스크롤해서 다음으로 간다. 이미 본 문항의 답은 그대로 남는다.

     답은 지어내지 않는다. qaResolve() 가 GRAPH 를 실제로 걸어 답이 되는
     노드를 찾는다 — 그래프를 다시 뽑아도 답이 따라 바뀐다.

     한 페이지의 진행
       질문 타이핑 → 그래프에서 답 노드 초점 → 노드 자리에 고리 →
       노드에서 슬롯까지 선 → 조각이 그 선을 따라 내려앉음 → 근거·출처·조건
     ═══════════════════════════════════════════════════════════════ */
  var QA = [], qaPages = [], qaCur = -1;

  function qaResolve() {
    if (typeof GRAPH === 'undefined') return [];
    var N = GRAPH.nodes, E = GRAPH.edges;

    function findEq(tag) {
      for (var i = 0; i < N.length; i++) {
        if (N[i].t === 'eq' && N[i].l === tag) return i;
      }
      return -1;
    }
    function out(i, pred, types) {
      var r = [];
      for (var k = 0; k < E.length; k++) {
        if (E[k][0] !== i || (pred && E[k][2] !== pred)) continue;
        var o = E[k][1];
        if (!types || types.indexOf(N[o].t) >= 0) r.push(o);
      }
      return r;
    }

    var eq = findEq('ZHUA01');
    var qs = [];
    if (eq < 0) return qs;

    /* ① 값 → 출처 */
    var vals = out(eq, 'hasQuantityValue', ['vOK', 'vNO', 'vTOL']);
    var v7 = -1;
    for (var a = 0; a < vals.length; a++) {
      if (String(N[vals[a]].l).replace(/,/g, '') === '7300') { v7 = vals[a]; break; }
    }
    if (v7 >= 0) {
      var srcs = out(v7, 'sourcedFrom', ['src']);
      if (srcs.length) {
        qs.push({
          key: 'trace',
          q: { ko: 'ZHUA01의 설계풍량 7,300 CMH는 어느 자료에서 나온 것인가',
               en: 'Which documents does the ZHUA01 design air flow of 7,300 CMH come from?' },
          kind: { ko: '근거 추적', en: 'Evidence trace' },
          nodes: srcs.slice(0, 4),
          lit: [eq, v7].concat(srcs.slice(0, 4)),
          meta: [
            { k: { ko: '값', en: 'Value' }, v: '7,300 CMH' },
            { k: { ko: '관계 경로', en: 'Path' }, v: 'hasQuantityValue → sourcedFrom' },
            { k: { ko: '검증 상태', en: 'Status' }, v: 'VERIFIED' }
          ],
          note: { ko: '값 하나에 출처가 여러 개 매달려 있습니다. 도면과 계산서가 함께 나옵니다.',
                  en: 'A single value carries several sources — the drawing and the calculation sheet together.' }
        });
      }
    }

    /* ② 부품 구성 */
    var parts = out(eq, 'hasPart', null);
    if (parts.length) {
      qs.push({
        key: 'parts',
        q: { ko: 'ZHUA01은 어떤 부품으로 구성되어 있는가',
             en: 'What parts is ZHUA01 made of?' },
        kind: { ko: '부품 구성', en: 'Composition' },
        nodes: parts.slice(0, 4),
        lit: [eq].concat(parts),
        meta: [
          { k: { ko: '관계', en: 'Relation' }, v: 'brick:hasPart' },
          { k: { ko: '부품 수', en: 'Parts' }, v: String(parts.length) },
          { k: { ko: '주의', en: 'Note' }, v: 'hvo:hasPart 로 물으면 0행' }
        ],
        note: { ko: '부품은 brick:hasPart 로 매달려 있습니다. 같은 이름의 hvo:hasPart 로 물으면 아무것도 나오지 않습니다.',
                en: 'Parts hang off brick:hasPart. Asking with hvo:hasPart instead returns nothing.' }
      });
    }

    /* ③ 근거 사슬 — 층으로 묶인 한 덩어리.
       설비 ──selectedBy──▶ 선정근거 ──derivedFrom──▶ 계산단계 ──basedOn──▶ 설계조건 */
    var basis = out(eq, 'selectedBy', ['basis']);
    if (basis.length) {
      var bi = basis[0];
      var steps = out(bi, 'derivedFrom', ['calc']);
      var conds = steps.length ? out(steps[0], 'basedOn', ['cond']) : [];
      var csrc = steps.length ? out(steps[0], 'sourcedFrom', ['src']) : [];
      var spine = [bi];
      if (steps.length) spine.push(steps[0]);
      if (conds.length) spine.push(conds[0]);
      if (csrc.length) spine.push(csrc[0]);
      if (spine.length >= 3) {
        qs.push({
          key: 'why',
          q: { ko: 'ZHUA01을 이 용량으로 고른 근거는 무엇인가',
               en: 'On what basis was ZHUA01 sized this way?' },
          kind: { ko: '근거 사슬', en: 'Evidence chain' },
          nodes: spine,
          lit: [eq, bi].concat(steps, conds, csrc),
          meta: [
            { k: { ko: '관계 경로', en: 'Path' }, v: 'selectedBy → derivedFrom → basedOn' },
            { k: { ko: '계산단계', en: 'Calculation steps' },
              v: String(steps.length) + (lang() === 'ko' ? '개' : '') },
            { k: { ko: '설계조건', en: 'Design conditions' },
              v: String(conds.length) + (lang() === 'ko' ? '종' : '') }
          ],
          note: { ko: '값 하나 뒤에 선정근거 · 계산단계 · 설계조건이 층으로 매달려 있습니다. 이 묶음이 "왜 그 값인가"에 대한 답입니다.',
                  en: 'Behind a single value sit the design basis, the calculation steps and the design conditions, layered. That bundle is the answer to "why this value".' }
        });
      }
    }
    return qs;
  }

  /* 세 페이지의 뼈대를 만든다. 답은 페이지가 열릴 때 채운다. */
  register(function qaRender() {
    var host = el('qaPages');
    if (!host) return;
    QA = qaResolve();
    var L = lang() === 'ko';

    host.innerHTML = QA.map(function (q, i) {
      return '' +
        '<section class="qa2-page" data-i="' + i + '">' +
          '<div class="qa2-ask">' +
            '<div class="qa2-who">' +
              '<span class="qa2-who-t">' + (L ? '질문' : 'Question') + '</span>' +
              '<span class="qa2-who-s">' + (L ? '사람이 입력한 문장' : 'typed by a person') + '</span>' +
              '<span class="qa2-no">' + (i + 1) + ' / ' + QA.length + '</span>' +
            '</div>' +
            '<p class="qa2-q"></p>' +
          '</div>' +
          '<div class="qa2-ans">' +
            '<div class="qa2-who">' +
              '<span class="qa2-who-t">' + (L ? '온톨로지 기반 답변' : 'Answer from the ontology') + '</span>' +
              '<span class="qa2-state"></span>' +
            '</div>' +
            '<ol class="qa2-slots"></ol>' +
            '<dl class="qa2-meta"></dl>' +
          '</div>' +
        '</section>';
    }).join('');

    qaPages = Array.prototype.slice.call(host.querySelectorAll('.qa2-page'));
    qaTimers = [];
    qaPages.forEach(function (p, i) { p.dataset.state = 'idle'; qaTimers[i] = []; });
    qaCur = -1;
    /* 언어를 바꾸면 뼈대를 다시 만들었으므로 지금 페이지를 다시 연다 */
    if (typeof qaSync === 'function') qaSync();
  });

  /* 타이머를 페이지별로 나눠 둔다.
     예전에는 한 배열에 모아 두고 파트를 벗어날 때 통째로 지웠다. 그러면
     질문을 쓰는 중에 스크롤 한 번으로 타이핑이 "ZHU" 에서 멈추고, 페이지는
     이미 '재생됨' 으로 표시돼 있어 다시 와도 그 상태로 영구히 남았다.
     지금은 페이지마다 따로 걷고, 끝내지 못한 페이지는 되돌린다. */
  var qaTimers = [[], [], []];
  function qaLaterFor(i, fn, ms) {
    if (!qaTimers[i]) qaTimers[i] = [];
    qaTimers[i].push(setTimeout(fn, ms));
  }
  function qaClearFor(i) {
    (qaTimers[i] || []).forEach(clearTimeout);
    qaTimers[i] = [];
  }
  function qaClear() { for (var i = 0; i < qaTimers.length; i++) qaClearFor(i); }

  function qaType(host, str, later, done) {
    if (!host) { done(); return; }
    if (reduced) { host.textContent = str; done(); return; }
    var i = 0;
    host.textContent = '';
    host.classList.add('is-typing');
    (function tick() {
      host.textContent = str.slice(0, ++i);
      if (i < str.length) later(tick, 34 + Math.random() * 34);
      else { host.classList.remove('is-typing'); later(done, 900); }
    }());
  }

  /* 노드 하나를 슬롯으로 옮긴다. 어디서 뽑아오는지가 보여야 하므로
     고리 → 선 → 조각의 세 단계로 나눈다. 노드는 <canvas> 안에 있어 CSS 로
     움직일 수 없으므로, 화면 좌표에 DOM 조각을 겹쳐 놓고 옮긴다. */
  /* 비행층을 비운다. 한 번에 한 문항만 날아가므로 통째로 지워도 된다. */
  function qaFlyClear() {
    var fly = el('qaFly');
    if (fly) while (fly.firstChild) fly.removeChild(fly.firstChild);
  }

  function qaFlyNode(nodeIdx, slotLi, label, color, later, done) {
    var fly = el('qaFly'), canvas = el('oneGraph');
    if (!fly || !canvas || !G || reduced) { done(); return; }
    var p = G.screenPos(nodeIdx);
    if (!p) { done(); return; }

    var cb = canvas.getBoundingClientRect(), fb = fly.getBoundingClientRect();
    var x0 = cb.left - fb.left + p.x, y0 = cb.top - fb.top + p.y;

    var mark = document.createElement('span');
    mark.className = 'qa2-mark';
    mark.style.left = x0 + 'px';
    mark.style.top = y0 + 'px';
    fly.appendChild(mark);
    void mark.offsetWidth;
    mark.classList.add('is-on');

    var dotEl = slotLi.querySelector('.qs-dot');
    var b2 = (dotEl || slotLi).getBoundingClientRect();
    var x1 = b2.left - fb.left + b2.width / 2, y1 = b2.top - fb.top + b2.height / 2;

    var dx = x1 - x0, dy = y1 - y0;
    var len = Math.sqrt(dx * dx + dy * dy);
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;
    var wire = document.createElement('span');
    wire.className = 'qa2-wire';
    wire.style.left = x0 + 'px';
    wire.style.top = y0 + 'px';
    wire.style.width = len + 'px';
    wire.style.transform = 'rotate(' + ang.toFixed(2) + 'deg) scaleX(0)';
    fly.appendChild(wire);
    void wire.offsetWidth;
    wire.classList.add('is-on');
    wire.style.transform = 'rotate(' + ang.toFixed(2) + 'deg) scaleX(1)';

    later(function () {
      var chip = document.createElement('span');
      chip.className = 'qa2-chip';
      chip.style.setProperty('--c', color);
      chip.textContent = label;
      chip.style.left = x0 + 'px';
      chip.style.top = y0 + 'px';
      fly.appendChild(chip);
      /* getBoundingClientRect 가 그 자리에서 레이아웃을 계산하므로 방금 붙인
         조각의 크기도 이미 정확하다 — rAF 를 기다리면 프레임이 굶는 환경에서
         답변이 영구히 비어 있게 된다. */
      var a2 = chip.getBoundingClientRect();
      var cx = a2.left - fb.left + a2.width / 2, cy = a2.top - fb.top + a2.height / 2;
      chip.classList.add('is-fly');
      chip.style.transform = 'translate(' + (x1 - cx) + 'px,' + (y1 - cy) + 'px) scale(.62)';
      later(function () {
        chip.classList.add('is-done');
        wire.classList.remove('is-on');
        wire.classList.add('is-off');
        done();
        later(function () {
          [chip, wire, mark].forEach(function (n) {
            if (n.parentNode) n.parentNode.removeChild(n);
          });
        }, 600);
      }, 1150);
    }, 560);
  }

  /* 페이지를 처음 상태로 되돌린다. 끝까지 가지 못한 것만 되돌린다 —
     끝난 페이지를 되돌리면 읽고 있던 답이 사라진다. */
  function qaReset(i) {
    var page = qaPages[i];
    if (!page) return;
    qaClearFor(i);
    /* 타이머를 취소했으므로 조각을 지우는 일도 취소됐다. 여기서 치운다. */
    qaFlyClear();
    page.dataset.state = 'idle';
    var q = page.querySelector('.qa2-q');
    if (q) { q.textContent = ''; q.classList.remove('is-typing'); }
    var st = page.querySelector('.qa2-state');
    if (st) st.textContent = '';
    var sl = page.querySelector('.qa2-slots');
    if (sl) sl.innerHTML = '';
    var mt = page.querySelector('.qa2-meta');
    if (mt) mt.innerHTML = '';
    var ans = page.querySelector('.qa2-ans');
    if (ans) ans.classList.remove('is-ready');
  }

  /* 한 페이지를 연다.
       idle     처음부터 질문을 쓰고 답을 찾는다
       running  그대로 둔다 (다시 부르면 처음으로 돌아가 버린다)
       done     초점만 다시 맞춘다 — 답은 기록으로 남긴다 */
  function qaOpen(i) {
    var page = qaPages[i], q = QA[i];
    if (!page || !q) return;

    if (G) G.focus(q.lit ? q.lit.slice() : q.nodes.slice());

    var state = page.dataset.state || 'idle';
    if (state === 'done' || state === 'running') return;
    page.dataset.state = 'running';

    var L = lang() === 'ko';
    var qEl = page.querySelector('.qa2-q');
    var stEl = page.querySelector('.qa2-state');
    var slots = page.querySelector('.qa2-slots');
    var meta = page.querySelector('.qa2-meta');
    var ans = page.querySelector('.qa2-ans');
    function later(fn, ms) { qaLaterFor(i, fn, ms); }
    function say(txt) { if (stEl) stEl.textContent = txt; }

    say(L ? '질문 수신' : 'question received');
    slots.innerHTML = q.nodes.map(function () {
      return '<li class="qs"><i class="qs-dot"></i>' +
             '<span class="qs-nm"></span><span class="qs-ty"></span></li>';
    }).join('');
    var lis = Array.prototype.slice.call(slots.querySelectorAll('.qs'));

    qaType(qEl, t(q.q), later, function () {
      say(L ? '그래프 탐색 중…' : 'searching the graph…');
      later(function () {
        say(L ? '노드를 답변으로 옮기는 중…' : 'moving nodes into the answer…');
        q.nodes.forEach(function (ni, n) {
          later(function () {
            var nd = GRAPH.nodes[ni];
            var OG = window.OntoGraph;
            var m = (OG && OG.TYPES[nd.t]) || { c: '#6ab4ff', ko: '', en: '' };
            var li = lis[n];
            qaFlyNode(ni, li, nd.l, m.c, later, function () {
              li.classList.add('is-on');
              li.querySelector('.qs-dot').style.background = m.c;
              li.querySelector('.qs-nm').textContent = nd.l;
              li.querySelector('.qs-ty').textContent = L ? m.ko : m.en;
            });
          }, 1250 * n);
        });
        later(function () {
          meta.innerHTML = q.meta.map(function (m) {
            return '<div><dt>' + esc(t(m.k)) + '</dt><dd>' + esc(t(m.v)) + '</dd></div>';
          }).join('') +
          '<div class="qm-note"><dt>' + (L ? '읽는 법' : 'How to read it') +
            '</dt><dd>' + brs(esc(t(q.note))) + '</dd></div>';
          if (ans) ans.classList.add('is-ready');
          say(L ? '답변 완료' : 'answered');
          page.dataset.state = 'done';      /* 여기까지 와야 기록으로 남는다 */
        }, 1250 * q.nodes.length + (reduced ? 40 : 1900));
      }, reduced ? 60 : 1100);
    });
  }

  /* 스크롤 → 어느 문항을 보고 있는지 */
  function qaSync() {
    if (!qaPages.length || !ontologyReady) return;
    /* 03 에 와 있을 때만 돈다.
       예전에는 이 검사가 없었다. qaSync 는 스크롤마다 불리고 고르는 값이
       기본 0 이므로, 온톨로지가 다 만들어지는 순간 어디에 있든 1번 문항이
       시작됐다 — 01 을 보고 있는데 그래프에서 답변판으로 선이 그어지고
       질문이 타이핑됐다. 실측 로그에도 build 파트에서 qa=[running,idle,idle]
       로 찍혀 있었다. */
    if (STATE !== 'qa') return;
    var mid = decideLine();
    var pick = 0;
    for (var i = 0; i < qaPages.length; i++) {
      if (qaPages[i].getBoundingClientRect().top <= mid) pick = i;
    }
    for (var k = 0; k < qaPages.length; k++) {
      qaPages[k].classList.toggle('is-cur', k === pick);
    }
    if (pick === qaCur) return;
    qaCur = pick;
    /* 지금 페이지가 아닌데 끝까지 가지 못한 것은 되돌린다. 그래야 다시
       그 문항으로 왔을 때 처음부터 질문을 쓰고 답을 찾는다. */
    for (var m = 0; m < qaPages.length; m++) {
      if (m !== pick && (qaPages[m].dataset.state || 'idle') === 'running') qaReset(m);
    }
    qaOpen(pick);
  }

  /* 파트를 벗어날 때. 진행 중이던 페이지는 되돌려 둔다 — 중간에 멈춘 화면을
     그대로 남기면 다시 왔을 때 "ZHU" 에서 끊긴 질문을 보게 된다. */
  function qaStop() {
    for (var i = 0; i < qaPages.length; i++) {
      if ((qaPages[i].dataset.state || 'idle') === 'running') qaReset(i);
      else qaClearFor(i);
    }
    qaFlyClear();
    qaCur = -1;
    if (G) G.clearFocus();
  }

  (function qaScroll() {
    onScroll(qaSync);
  }());


  /* ═══ 그래프 ═══════════════════════════════════════════════════════
     캔버스는 둘뿐이다 — 히어로 배경과, 세 파트가 나눠 쓰는 고정 그래프.

     파트마다 캔버스를 따로 두었더니 같은 그래프가 세 번 나와 "하나의 지식
     베이스를 여러 각도에서 본다"가 아니라 "그림이 세 개 있다"로 읽혔다.
     하나로 고정하고 스크롤 위치가 상태만 바꾼다.

       01  생성 진행 (setBuild)   · 커서 판독 끔
       02  전체 + 커서 판독
       03  답 노드에 초점 · 조각이 답변판으로 내려앉음
     ═══════════════════════════════════════════════════════════════ */
  var G = null;                 /* 고정 그래프 하나 */
  var STATE = '';               /* 'build' | 'explore' | 'qa' */

  (function graphs() {
    var OG = window.OntoGraph;
    if (!OG || typeof GRAPH === 'undefined') return;

    var hero = el('heroGraph');
    if (hero) OG.create(hero, { mode: 'hero', threeD: true });

    var one = el('oneGraph');
    if (!one) return;
    G = OG.create(one, {
      threeD: /(^|[?&])3d(&|=|$)/.test(searchStr()) || true,
      build: true,
      /* 질의응답에서 답만 밝힐 때 배경 그래프가 남아 있게 한다 */
      dimFloor: { edge: 0.16, node: 0.44 },
      onHover: function (nd) {
        var host = el('exRead');
        if (!host) return;
        /* 판독은 02 구간에서만 쓴다. 다른 구간에서 커서가 지나가도
           02 의 칸을 바꿔 놓으면 읽는 사람이 어리둥절해진다. */
        if (STATE !== 'explore' || !ontologyReady) return;
        host.innerHTML = nd ? exReadNode(nd) : exReadEmpty();
      }
    });
    /* 예전에 캔버스가 셋이던 흔적. 지금은 G 하나이므로 옛 이름들은 그것을
       가리키게 해 둔다 — qaGraph 는 질의응답을 페이지로 바꿀 때 없애서,
       여기 대입이 남아 있으면 ReferenceError 로 스크립트가 멈춘다. */
    ingGraph = G;
    exGraph = G;
    dimToggleRedraw();
    QA = qaResolve();
    qaSync();
  }());

  /* ── 스크롤 → 상태 ──
     세 파트 중 화면 가운데를 지난 마지막 것을 고른다. 경계에서 왔다 갔다
     하지 않도록 '지나간 마지막' 으로 정한다.

     기능은 온톨로지가 다 만들어진 뒤에만 켠다. 절반만 자란 그래프 위에서
     탐색하거나 답을 찾으면 아직 없는 노드를 가리키게 된다. */
  var stageEnable = null;

  (function stageState() {
    if (!G) return;
    var parts = ['build', 'explore', 'qa'].map(el).filter(Boolean);
    if (!parts.length) return;

    var LABEL = {
      build:   { ko: '온톨로지 생성 중',            en: 'building the ontology' },
      explore: fine()
        ? { ko: '탐색 · 커서를 올려 보세요', en: 'explore · hover a node' }
        : { ko: '탐색 · 노드를 눌러 보세요', en: 'explore · tap a node' },
      qa:      { ko: '질의응답',                    en: 'question & answer' }
    };
    var WAIT = { ko: '온톨로지 생성 중 · 잠시 후 사용할 수 있습니다',
                 en: 'building the ontology · available shortly' };

    function paintState() {
      var st = el('sgState');
      if (!st) return;
      st.textContent = ontologyReady ? t(LABEL[STATE] || '') : t(WAIT);
      st.classList.toggle('is-wait', !ontologyReady);
    }

    /* 잠금 표시 — 02 의 판독판과 03 의 답변판에 같은 문구를 둔다.
       칸을 비워 두면 고장난 것처럼 보이므로 왜 기다리는지 적는다. */
    function lockNote() {
      var L = lang() === 'ko';
      return '<div class="ex-empty">' +
        '<span class="ex-kicker">' + (L ? '대기' : 'waiting') + '</span>' +
        '<p class="ex-lead">' + (L
          ? '온톨로지가 만들어지는 중입니다.<br>다 만들어지면 이 자리에서 노드를 읽을 수 있습니다.'
          : 'The ontology is still being built.<br>Once it is complete you can read nodes here.') +
        '</p></div>';
    }

    /* 지금 파트에 맞춰 기능을 켜고 끈다. 생성이 끝나는 순간에도 불린다. */
    stageEnable = function () {
      var flow = document.querySelector('.stage-flow');
      if (flow) flow.classList.toggle('is-locked', !ontologyReady);
      paintState();

      var dim = el('mapDim');
      if (dim) dim.hidden = (STATE === 'build') || !ontologyReady;
      var btn = el('ingReplay');
      if (btn) btn.hidden = (STATE !== 'build');

      if (!ontologyReady) {
        qaStop();
        var host = el('exRead');
        if (host && STATE !== 'build') host.innerHTML = lockNote();
        return;
      }

      if (STATE === 'explore') {
        qaStop();
        G.clearFocus();
        var h2 = el('exRead');
        if (h2) h2.innerHTML = exReadEmpty();
      } else if (STATE === 'qa') {
        qaSync();
      } else {
        qaStop();
        G.clearFocus();
      }
    };

    function apply(next) {
      if (next === STATE) return;
      STATE = next;
      /* 여기서 ingPlay() 를 부르지 않는다. 첫 프레임에 STATE 가 '' → 'build'
         로 바뀌면서 조건 없이 시작되어, 핸드폰에서는 히어로를 보는 동안
         보이지 않는 곳에서 다 만들어졌다. 시작 조건은 ingEarly() 한 곳에만
         둔다 — 무대가 한 화면 앞까지 왔을 때. */
      /* 01 을 지나쳤는데 아직 만들고 있으면 남은 것을 짧게 끝낸다 */
      if (next !== 'build') ingUrge();
      stageEnable();
    }

    function frame() {
      var mid = decideLine();
      var pick = parts[0].id;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].getBoundingClientRect().top <= mid) pick = parts[i].id;
      }
      apply(pick);
    }

    STATE = '';
    onScroll(frame);
    stageEnable();
  }());

  function searchStr() {
    try { return window.location.search || ''; } catch (e) { return ''; }
  }
  function viewportW() {
    try { return document.documentElement.clientWidth || window.innerWidth; }
    catch (e) { return 0; }
  }


  /* ═══ 등장 연출 ════════════════════════════════════════════════════
     섹션이 화면에 들어오면 살짝 올라오며 나타난다.

     숨김 규칙은 <html> 의 .reveal 에 걸려 있고 그 클래스는 이 함수가 붙인다.
     이 연출은 본문을 기본적으로 투명하게 만드는 장치이므로, 스크립트가
     실패했을 때 숨김만 남으면 페이지 전체가 빈 화면이 된다.

     히어로는 대상이 아니다 — 첫 화면은 포스터 스크린샷으로 쓰이므로
     스크롤하지 않은 그 상태에서 이미 완성돼 있어야 한다. */
  (function reveal() {
    if (reduced || !window.IntersectionObserver) return;

    function repeated(node) {
      var ch = node.children;
      if (ch.length < 3) return null;
      var tag = ch[0].tagName;
      for (var i = 1; i < ch.length; i++) if (ch[i].tagName !== tag) return null;
      return ch;
    }

    var targets = [];
    function mark(n, i, step) {
      n.classList.add('rv');
      var r = n.getBoundingClientRect();
      var mid = (viewportW() || 1200) / 2;
      var cx = r.left + r.width / 2;
      /* 가운데에서 벗어난 만큼 옆에서 들어온다. 화면 절반을 넘게 쓰는 넓은
         블록은 0 에 가까워져 옆으로 흔들리지 않는다. */
      var off = r.width > mid ? 0 : Math.max(-1, Math.min(1, (cx - mid) / mid));
      n.style.setProperty('--ox', (off * 26).toFixed(1) + 'px');
      n.style.setProperty('--oy', (r.width > mid ? 24 : 18) + 'px');
      n.style.setProperty('--o', Math.min(i, 7) * (step / 68));
      targets.push(n);
    }

    Array.prototype.forEach.call(document.querySelectorAll('.sec'), function (sec) {
      var inn = sec.querySelector('.sec-in');
      if (!inn) return;
      var blocks = [];
      Array.prototype.forEach.call(inn.children, function (col) {
        if (col.classList.contains('sec-label')) { blocks.push(col); return; }
        Array.prototype.forEach.call(col.children, function (ch) { blocks.push(ch); });
      });
      blocks.forEach(function (b, bi) {
        /* 그래프가 들어 있는 판은 항목으로 쪼개지 않는다 — 캔버스를
           개별로 밀면 그리는 자리가 어긋난다. */
        if (b.querySelector && b.querySelector('canvas')) { mark(b, bi, 70); return; }
        var items = repeated(b);
        if (items) { for (var k = 0; k < items.length; k++) mark(items[k], k, 55); }
        else mark(b, bi, 70);
      });
    });
    if (!targets.length) return;

    root.classList.add('reveal');

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.06 });
    targets.forEach(function (n) { io.observe(n); });

    /* ── 안전망 ──
       IntersectionObserver 의 콜백은 '렌더 갱신 뒤'에 온다. 브라우저가
       프레임을 아껴 주는 상황(백그라운드 탭 · 인쇄 · 헤드리스 캡처)에서는
       그 갱신이 오지 않아 콜백도 오지 않는다. 그러면 이 연출은 본문을
       영구히 숨기는 장치가 된다 — 실제로 헤드리스 스크린샷에서 히어로
       아래 전체가 빈 화면으로 찍혔다. 2.4초 뒤에는 조건 없이 연다. */
    setTimeout(function () {
      targets.forEach(function (n) { n.classList.add('in'); });
    }, 2400);
  }());


  /* ═══ 파트 전환 ════════════════════════════════════════════════════
     스크롤 위치가 그대로 움직임이 된다. 시간 기반 전환으로 두면 섹션이
     들어온 순간 한 번 재생되고 끝나서, 스크롤을 아무리 천천히 해도
     '넘어간다'는 감각이 생기지 않는다.

     움직이는 것은 본문 칸뿐이다. 섹션 제목(.sec-label)은 sticky 로 붙어
     있는 쪽이라 건드리지 않는다 — transform 을 sticky 의 조상에 걸면
     붙어 있는 성질이 깨진다. */
  (function partsAndProgress() {
    if (reduced) return;

    var cols = [];
    Array.prototype.forEach.call(document.querySelectorAll('.sec'), function (sec) {
      var inn = sec.querySelector('.sec-in');
      if (!inn) return;
      Array.prototype.forEach.call(inn.children, function (col) {
        if (!col.classList.contains('sec-label')) cols.push(col);
      });
    });

    var bar = document.createElement('div');
    bar.className = 'scroll-prog';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    function frame() {
      var vh = window.innerHeight || 800;
      for (var i = 0; i < cols.length; i++) {
        var r = cols[i].getBoundingClientRect();
        var e = (vh * 0.88 - r.top) / (vh * 0.50);
        if (r.top < 0) e = 1;
        cols[i].style.setProperty('--enter', (e < 0 ? 0 : e > 1 ? 1 : e).toFixed(3));
      }
      var h = document.documentElement.scrollHeight - vh;
      var p = h > 0 ? window.scrollY / h : 0;
      bar.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(2) + '%';
    }

    onScroll(frame);
    root.classList.add('parts');
  }());


  /* ═══ 상단 바 높이 ════════════════════════════════════════════════
     고정 그래프 띠(--top-h 에 붙는다)와 앵커 스크롤이 이 값을 쓴다.
     좁은 화면에서 바가 두 줄이 되면 56 → 90 대로 커지는데, 예전에는 띠가
     56px 에 못박혀 있어 띠의 조작 줄이 바 뒤로 숨었다.
     언어를 바꾸면 글자 길이가 달라져 줄 수가 바뀌므로 register 로도 건다. */
  (function topHeight() {
    var bar = document.querySelector('.topbar');
    if (!bar) return;
    var last = -1;
    function measure() {
      var h = Math.round(bar.getBoundingClientRect().height);
      if (!h || h === last) return;
      last = h;
      root.style.setProperty('--top-h', h + 'px');
    }
    if (window.ResizeObserver) new window.ResizeObserver(measure).observe(bar);
    window.addEventListener('resize', measure);
    /* 서체가 늦게 오면 줄 수가 바뀐다 */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    register(measure);
  }());


  /* ═══ 진단 화면 (?debug=1) ════════════════════════════════════════
     실기기에서만 나는 문제를 손에 들고 확인하기 위한 것이다. 주소 끝에
     ?debug=1 을 붙이면 왼쪽 아래에 지금 상태가 뜬다. 평소에는 아무것도
     만들지 않는다. */
  (function debugPanel() {
    if (!/(^|[?&])debug=1(&|$)/.test(searchStr())) return;
    var box = document.createElement('div');
    box.setAttribute('style',
      'position:fixed;left:6px;bottom:6px;z-index:9999;max-width:70vw;' +
      'font:11px/1.45 ui-monospace,monospace;white-space:pre;' +
      'background:rgba(0,0,0,.82);color:#9fe;padding:7px 9px;border-radius:3px;' +
      'pointer-events:none');
    document.body.appendChild(box);

    var frames = 0, fps = 0, t0 = Date.now(), tap = '-';
    (function count() { frames++; requestAnimationFrame(count); }());

    var one = el('oneGraph');
    if (one) {
      one.addEventListener('pointerup', function (e) {
        tap = 'up ' + e.pointerType + ' ' + Math.round(e.clientX) + ',' + Math.round(e.clientY);
      });
      one.addEventListener('touchend', function () { tap += ' +touchend'; }, { passive: true });
      one.addEventListener('click', function () { tap += ' +click'; });
    }

    function line() {
      var now = Date.now();
      if (now - t0 >= 1000) { fps = Math.round(frames * 1000 / (now - t0)); frames = 0; t0 = now; }
      var g = document.querySelector('.stage-graph');
      var gb = g ? g.getBoundingClientRect() : null;
      var cs = g ? getComputedStyle(g) : null;
      var read = el('exRead');
      var coarse = false;
      try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e) {}
      /* 줄바꿈은 배열로 잇는다 — 소스에 이스케이프를 쓰다가 문자열 안에
         진짜 줄바꿈이 들어가 app.js 가 통째로 죽은 적이 있다. */
      box.textContent = [
        'STATE ' + (STATE || '-') + '  준비 ' + ontologyReady + '  fps ' + fps,
        '화면 ' + innerWidth + 'x' + innerHeight +
          '  dpr ' + (devicePixelRatio || 1) + '  coarse ' + coarse,
        '띄 ' + (cs ? cs.position : '-') + ' top:' + (cs ? cs.top : '-') +
          ' ' + (gb ? Math.round(gb.top) + '..' + Math.round(gb.bottom) : '-'),
        '캔버스 ' + (one ? one.width + 'x' + one.height : '-') +
          '  노드 ' + ingBuiltN,
        '판독 ' + (read ? (read.querySelector('.ex-empty') ? '빈판' : '켜짐') : '-') +
          '  탭 ' + tap
      ].join(String.fromCharCode(10));
      requestAnimationFrame(line);
    }
    line();
  }());


  /* ═══ 내비게이션 현재 위치 ════════════════════════════════════════ */
  (function navState() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.nav a'));
    var secs = links.map(function (a) { return document.querySelector(a.getAttribute('href')); })
                    .filter(Boolean);
    if (!secs.length || !window.IntersectionObserver) return;

    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.intersectionRatio; });
      var best = null, bestR = 0;
      Object.keys(seen).forEach(function (id) {
        if (seen[id] > bestR) { bestR = seen[id]; best = id; }
      });
      links.forEach(function (a) {
        a.classList.toggle('on', best !== null && a.getAttribute('href') === '#' + best);
      });
    }, { rootMargin: '-70px 0px -55% 0px', threshold: [0, .1, .3, .6, 1] });
    secs.forEach(function (s) { io.observe(s); });
  }());

}());
