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

  /* 근거 사슬 미리보기 — 첫 화면에서 "값 하나에 이만큼이 매달려 있다"를 보인다.
     KB.evidence[0].steps 의 모양을 그대로 쓴다:
       {relation, node, title, value, unit, meta, source} */
  register(function preview() {
    var host = el('heroPreview');
    if (!host || typeof KB === 'undefined' || !KB.evidence || !KB.evidence.length) return;
    var ev = KB.evidence[0];
    var head = ev.steps[0];
    var L = lang() === 'ko';

    var rows = ev.steps.slice(1).map(function (st) {
      return '<div class="pv-row">' +
               '<span class="pv-rel">↑ ' + esc(st.relation) + '</span>' +
               '<span class="pv-cls">' + esc(st.node) + '</span>' +
               '<span class="pv-val">' + esc(st.value) + '</span>' +
             '</div>';
    }).join('');

    /* 값 상태 세 가지만 아래에 둔다. 단일출처 2,614 와 미해결 2 는 첫 화면에서
       설명할 자리가 없어 빼고, 이 페이지의 §01 결과 칸에서 다룬다. */
    var trio = KB.valueStatus.filter(function (v) {
      return ['VERIFIED', 'DIVERGENT', 'TOLERANCE_OK'].indexOf(v.code) >= 0;
    });

    host.innerHTML =
      '<div class="pv-head">' +
        '<span class="pv-title">' + (L ? '근거 사슬' : 'Evidence chain') + '</span>' +
        '<span class="pv-eq">' + esc(ev.equipment) + '</span>' +
      '</div>' +
      '<div class="pv-body">' +
        '<span class="pv-prop">' + esc(ev.prop) + '</span>' +
        '<div class="pv-value"><b class="num">' + esc(head.value) + '</b>' +
          '<span class="unit">' + esc(head.unit) + '</span>' +
          '<span class="badge is-ok">VERIFIED' +
            (L ? '<i class="badge-ko">두 자료가 같음</i>' : '') + '</span>' +
        '</div>' +
        rows +
        '<div class="pv-src">' + esc(head.source) + '</div>' +
      '</div>' +
      '<div class="pv-foot">' +
        trio.map(function (st) {
          return '<div class="is-' + st.tone + '">' +
                 '<b class="pf-n num">' + fmt(st.count) + '</b>' +
                 '<span class="pf-l">' + esc(st.code) + '</span></div>';
        }).join('') +
      '</div>';
  });


  /* ═══ 01 문서 → 온톨로지 ═══════════════════════════════════════════
     입력 문서 · 변환 단계 · 결과 수치. 세 칸 모두 KB 값 그대로다. */
  register(function build1() {
    var docs = el('f3Docs'), steps = el('f3Steps'), out = el('f3Out');
    if (!docs || typeof KB === 'undefined') return;

    /* 입력 — 문서 5종과 각 문서를 가리키는 출처 참조 수 */
    docs.innerHTML = KB.documents.map(function (d) {
      var dwg = /\.dwg$/i.test(d.name);
      return '<li class="' + (dwg ? 'is-dwg' : 'is-pdf') + '">' +
               '<span class="fd-kind">' + (dwg ? 'DWG' : 'PDF') + '</span>' +
               '<span class="fd-name">' + esc(d.name) + '</span>' +
               '<span class="fd-refs num">' + fmt(d.refs) + '</span>' +
             '</li>';
    }).join('');

    /* 변환 — 파이프라인. 화면에서는 이름과 한 줄 설명까지만 둔다. */
    if (steps) {
      steps.innerHTML = KB.pipeline.map(function (p, i) {
        return '<li class="' + (p.highlight ? 'is-now' : '') + '">' +
                 '<span class="fs-n num">' + String(i + 1).padStart(2, '0') + '</span>' +
                 '<span class="fs-t">' + esc(t(p.name)) + '</span>' +
                 '<span class="fs-d">' + esc(t(p.what)) + '</span>' +
               '</li>';
      }).join('');
    }

    /* 결과 — 규모 지표에서 네 개만. 여섯 개를 다시 늘어놓으면 히어로와 겹친다. */
    if (out) {
      var pick = [0, 1, 3, 4];
      out.innerHTML = pick.map(function (k) {
        var h = KB.scale.headline[k];
        return '<li><b class="num">' + fmt(h.value) + '</b>' +
               '<span class="fo-l">' + esc(t(h.label)) + '</span>' +
               '<span class="fo-n">' + esc(t(h.note)) + '</span></li>';
      }).join('');
    }
  });


  /* ═══ 02 온톨로지 탐색 ═════════════════════════════════════════════
     오른쪽 그래프의 hover 를 왼쪽 판독판에 쓴다. graph.js 의 info(i) 가
     그 노드의 클래스와 관계 묶음을 돌려주고, 여기서는 그것을 조판만 한다. */
  var exGraph = null;

  function exReadEmpty() {
    var L = lang() === 'ko';
    return '<div class="ex-empty">' +
      '<span class="ex-kicker">' + (L ? '노드 판독' : 'Node readout') + '</span>' +
      '<p class="ex-lead">' + (L
        ? '오른쪽 그래프의 노드에 커서를 올리면<br>그 개체가 무엇이고 어떤 관계로 무엇에 매달려 있는지 여기에 나옵니다.'
        : 'Hover a node in the graph to the right.<br>What the individual is, and exactly what it hangs off, appears here.') + '</p>' +
      '<p class="ex-lead ex-lead--dim">' + (L
        ? 'HVAC 설비 노드를 누르면 그 설비만 남기고 나머지를 눌러 둡니다.'
        : 'Click an equipment node to keep it lit and press the rest back.') + '</p>' +
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
                 '<span class="ex-pred">hvo:' + esc(g.p) + '</span>' +
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

    var cnt = el('exCount');
    if (cnt && typeof GRAPH !== 'undefined') {
      cnt.innerHTML = lang() === 'ko'
        ? '노드 <b class="num">' + fmt(GRAPH.nodes.length) + '</b> · 엣지 <b class="num">' + fmt(GRAPH.edges.length) + '</b>'
        : '<b class="num">' + fmt(GRAPH.nodes.length) + '</b> nodes · <b class="num">' + fmt(GRAPH.edges.length) + '</b> edges';
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

     세 문항. 답이 되는 노드를 GRAPH 에서 실제로 찾는다.

       ① 근거 추적   ZHUA01 의 설계풍량 값 노드 → sourcedFrom → 출처들
       ② 부품 구성   ZHUA01 → hasPart → 부품들
       ③ 정격 vs 계산  값 상태가 DIVERGENT(vNO)인 값 노드들

     연출은 t-ranno 레퍼런스의 진행을 따른다.
       질문 타이핑 → 그래프 눌림 → 매칭 노드 점등(차례로) →
       노드가 왼쪽 슬롯으로 비행 → 근거·출처·조건 채움 → 리셋 → 다음 문항

     노드는 <canvas> 안에 있어 CSS 로 움직일 수 없다. 그래서 노드의 화면
     좌표(graph.js 의 screenPos)에 DOM 조각을 하나 만들어 겹쳐 놓고,
     그 조각을 슬롯 좌표까지 transform 으로 옮긴다 — 레퍼런스의 flyTo 와
     같은 방법이다. */
  var qaGraph = null, qaTimers = [], qaRunning = false, qaIdx = 0;

  function qaLater(fn, ms) { qaTimers.push(setTimeout(fn, ms)); }
  function qaClear() { qaTimers.forEach(clearTimeout); qaTimers = []; }

  /* GRAPH 를 걸어서 답이 되는 노드를 찾는다. 손으로 적어 두지 않는 이유는
     그래프를 다시 뽑았을 때 조용히 낡기 때문이다. */
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

    /* ① 값 → 출처. 설계풍량 7,300 값 노드를 찾아 그 출처를 답으로 쓴다. */
    if (eq >= 0) {
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
            anchor: eq, via: v7,
            nodes: srcs.slice(0, 5),
            meta: [
              { k: { ko: '값', en: 'Value' }, v: '7,300 CMH' },
              { k: { ko: '관계', en: 'Relation' }, v: 'hasQuantityValue → sourcedFrom' },
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
          anchor: eq,
          nodes: parts.slice(0, 5),
          meta: [
            { k: { ko: '관계', en: 'Relation' }, v: 'brick:hasPart' },
            { k: { ko: '부품 수', en: 'Parts' }, v: String(parts.length) },
            { k: { ko: '주의', en: 'Note' }, v: 'hvo:hasPart 로 물으면 0행' }
          ],
          note: { ko: '부품은 brick:hasPart 로 매달려 있습니다. 같은 이름의 hvo:hasPart 로 물으면 아무것도 나오지 않습니다.',
                  en: 'Parts hang off brick:hasPart. Asking with hvo:hasPart instead returns nothing.' }
        });
      }
    }

    /* ③ 정격값과 계산값이 어긋난 값 노드 */
    var diverg = [];
    for (var b = 0; b < N.length; b++) if (N[b].t === 'vNO') diverg.push(b);
    if (diverg.length) {
      qs.push({
        key: 'diverge',
        q: { ko: '정격값과 계산값이 어긋난 값은 어떤 것인가',
             en: 'Which values disagree between the rated and the calculated figure?' },
        kind: { ko: '정격 vs 계산', en: 'Rated vs calculated' },
        nodes: diverg.slice(0, 5),
        meta: [
          { k: { ko: '상태', en: 'Status' }, v: 'DIVERGENT' },
          { k: { ko: '전체', en: 'Total' }, v: fmt(493) + (lang() === 'ko' ? '개' : '') },
          { k: { ko: '처리', en: 'Handling' }, v: { ko: '두 값 모두 보존', en: 'both values kept' } }
        ],
        note: { ko: '어느 쪽도 틀린 값이 아닙니다. 두 자료에 다르게 적혀 있다는 사실을 그대로 남깁니다.',
                en: 'Neither figure is wrong. The fact that the two documents disagree is what gets recorded.' }
      });
    }

    return qs;
  }

  var QA = [];

  function qaReset() {
    var slots = el('qaSlots'), meta = el('qaMeta'), fly = el('qaFly');
    if (slots) slots.innerHTML = '';
    if (meta) meta.innerHTML = '';
    if (fly) fly.innerHTML = '';
    var ans = el('qaAns');
    if (ans) ans.classList.remove('is-ready');
    if (qaGraph) qaGraph.clearFocus();
  }

  function qaSetState(txt) {
    var st = el('qaState');
    if (st) st.textContent = txt;
  }

  /* 질문을 한 글자씩 쓴다. 사람이 타이핑하는 것처럼 보여야 '사람이 물었다'가
     읽힌다. reduced-motion 이면 한 번에 놓는다. */
  function qaType(str, done) {
    var host = el('qaQ');
    if (!host) { done(); return; }
    if (reduced) { host.textContent = str; done(); return; }
    var i = 0;
    host.textContent = '';
    host.classList.add('is-typing');
    (function tick() {
      host.textContent = str.slice(0, ++i);
      if (i < str.length) qaLater(tick, 20 + Math.random() * 26);
      else { host.classList.remove('is-typing'); qaLater(done, 420); }
    }());
  }

  /* 노드 하나를 슬롯으로 날린다.
     캔버스 안의 노드 좌표에 조각을 만들어 두고, 슬롯의 화면 좌표까지의
     차이만큼 transform 으로 옮긴다. 좌표는 둘 다 getBoundingClientRect
     기준이라 스크롤 위치와 무관하다. */
  function qaFlyNode(nodeIdx, slotLi, label, color, done) {
    var fly = el('qaFly'), canvas = el('qaGraph');
    if (!fly || !canvas || !qaGraph || reduced) { done(); return; }
    var p = qaGraph.screenPos(nodeIdx);
    if (!p) { done(); return; }

    var cb = canvas.getBoundingClientRect(), fb = fly.getBoundingClientRect();
    var chip = document.createElement('span');
    chip.className = 'qa2-chip';
    chip.style.setProperty('--c', color);
    chip.textContent = label;
    /* fly 층은 캔버스와 같은 자리에 겹쳐 있다. 그래도 두 사각형의 차이를
       빼 주어야 한다 — 테두리 한 줄만 어긋나도 조각이 노드에서 떨어져 뜬다. */
    chip.style.left = (cb.left - fb.left + p.x) + 'px';
    chip.style.top = (cb.top - fb.top + p.y) + 'px';
    fly.appendChild(chip);

    /* 목표 위치를 지금 바로 계산한다.
       처음에는 requestAnimationFrame 안에서 쟀는데, 프레임이 굶는 상황
       (백그라운드 탭 · 인쇄 · 헤드리스 캡처)에서는 콜백이 오지 않아 답변이
       영구히 비어 있었다. getBoundingClientRect 를 부르면 그 자리에서
       레이아웃이 계산되므로 방금 붙인 조각의 크기도 이미 정확하다. */
    var a = chip.getBoundingClientRect();
    var dotEl = slotLi.querySelector('.qs-dot');
    var b = (dotEl || slotLi).getBoundingClientRect();
    var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    var dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    chip.classList.add('is-fly');
    chip.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(.62)';
    qaLater(function () {
      chip.classList.add('is-done');
      done();
      qaLater(function () { if (chip.parentNode) chip.parentNode.removeChild(chip); }, 260);
    }, 620);
  }

  function qaRun() {
    if (!QA.length) return;
    var q = QA[qaIdx % QA.length];
    var L = lang() === 'ko';
    var slots = el('qaSlots'), meta = el('qaMeta'), ans = el('qaAns');
    if (!slots) return;

    qaReset();
    qaSetState(L ? '질문 수신' : 'question received');

    /* 답 슬롯을 미리 비워 놓는다. 몇 개가 올지 먼저 보이는 편이
       '채워진다'로 읽힌다 — 빈 칸이 없으면 그냥 나타나는 것이 된다. */
    slots.innerHTML = q.nodes.map(function () {
      return '<li class="qs"><i class="qs-dot"></i>' +
             '<span class="qs-nm"></span><span class="qs-ty"></span></li>';
    }).join('');
    var lis = Array.prototype.slice.call(slots.querySelectorAll('.qs'));

    qaType(t(q.q), function () {
      qaSetState(L ? '그래프 탐색 중…' : 'searching the graph…');

      /* 답이 되는 노드를 밝힌다. 앵커(설비)도 함께 밝혀 어디서 출발한
         답인지 보이게 한다. */
      var lit = q.nodes.slice();
      if (q.anchor !== undefined) lit.push(q.anchor);
      if (q.via !== undefined) lit.push(q.via);
      if (qaGraph) qaGraph.focus(lit);

      qaLater(function () {
        qaSetState(L ? '노드를 답변으로 옮기는 중…' : 'moving nodes into the answer…');

        q.nodes.forEach(function (ni, n) {
          qaLater(function () {
            var nd = GRAPH.nodes[ni];
            var OG = window.OntoGraph;
            var m = (OG && OG.TYPES[nd.t]) || { c: '#6ab4ff', ko: '', en: '' };
            var li = lis[n];
            qaFlyNode(ni, li, nd.l, m.c, function () {
              li.classList.add('is-on');
              li.style.setProperty('--c', m.c);
              li.querySelector('.qs-dot').style.background = m.c;
              li.querySelector('.qs-nm').textContent = nd.l;
              li.querySelector('.qs-ty').textContent = L ? m.ko : m.en;
            });
          }, 260 * n);
        });

        /* 근거 · 출처 · 조건 — 노드가 다 내려앉은 뒤에 붙는다 */
        var tAfter = 260 * q.nodes.length + (reduced ? 40 : 760);
        qaLater(function () {
          if (meta) {
            meta.innerHTML = q.meta.map(function (m) {
              return '<div><dt>' + esc(t(m.k)) + '</dt><dd>' + esc(t(m.v)) + '</dd></div>';
            }).join('') +
            '<div class="qm-note"><dt>' + (L ? '읽는 법' : 'How to read it') +
              '</dt><dd>' + brs(esc(t(q.note))) + '</dd></div>';
          }
          if (ans) ans.classList.add('is-ready');
          qaSetState(L ? '답변 완료' : 'answered');

          /* 다음 문항으로. 읽을 시간을 준 뒤에 넘긴다. */
          qaLater(function () {
            qaIdx++;
            if (qaRunning) qaRun();
          }, reduced ? 7000 : 5200);
        }, tAfter);
      }, reduced ? 60 : 620);
    });
  }

  function qaStart() {
    if (qaRunning || !QA.length) return;
    qaRunning = true;
    qaIdx = 0;
    qaRun();
  }
  function qaStop() {
    qaRunning = false;
    qaClear();
  }

  register(function qaChrome() {
    /* 언어를 바꾸면 문항 자체를 다시 만든다 — meta 안에 언어별 문구가 있다 */
    QA = qaResolve();
    if (qaRunning) { qaClear(); qaIdx = 0; qaRun(); }
  });


  /* ═══ 그래프 만들기 ════════════════════════════════════════════════ */
  (function graphs() {
    var OG = window.OntoGraph;
    if (!OG || typeof GRAPH === 'undefined') return;

    var hero = el('heroGraph');
    if (hero) OG.create(hero, { mode: 'hero', threeD: true });

    var exCanvas = el('mapGraph');
    if (exCanvas) {
      exGraph = OG.create(exCanvas, {
        threeD: /(^|[?&])3d(&|=|$)/.test(searchStr()),
        onHover: function (nd) {
          var host = el('exRead');
          if (!host) return;
          host.innerHTML = nd ? exReadNode(nd) : exReadEmpty();
        }
      });
      dimToggleRedraw();
    }

    var qaCanvas = el('qaGraph');
    if (qaCanvas) {
      /* 질의응답 쪽 그래프는 읽는 대상이 아니라 연출 무대다. 커서 판독을
         켜지 않고, 3D 로 두어 노드가 공간에 흩어져 있는 것이 보이게 한다. */
      qaGraph = OG.create(qaCanvas, { threeD: true });
      QA = qaResolve();

      if (window.IntersectionObserver) {
        /* 화면에 들어와야 시작한다. 위에서부터 읽는 사람이 이 파트에
           도달했을 때 첫 문항이 시작되어야 한다. */
        new IntersectionObserver(function (ens) {
          ens.forEach(function (e) {
            if (e.isIntersecting) qaStart(); else qaStop();
          });
        }, { threshold: 0.25 }).observe(el('qa'));
      } else {
        qaStart();
      }
    }
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

    var queued = false;
    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(function () { queued = false; frame(); });
    }, { passive: true });
    window.addEventListener('resize', frame);
    frame();
    root.classList.add('parts');
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
