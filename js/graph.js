/* 온톨로지 그래프 렌더러 — canvas 2D, 외부 라이브러리 없음
   ============================================================
   graph-data.js 의 GRAPH(노드 484 · 엣지 832)를 그린다.

   ── 왜 방사형인가 ──
   처음에는 힘-지향 배치로 그렸다. 484개 노드를 그렇게 놓으면 결과가
   헤어볼이고, 색을 어떻게 만져도 지저분하다. 구조가 있는 데이터를 구조 없이
   놓았기 때문이다. 그래서 배치를 바꿨다(tools/extract_graph.py) —

     반지름은 클래스가 정한다   HVAC 설비가 가운데, 출처가 테두리
     각도는 트리가 정한다       설비마다 부채꼴 하나, 그 아래 것은 그 안에만

   그래서 엣지 832개 중 437개가 짧은 방사선이 되고, 나머지 현도 각도차가
   중앙값 0.06 rad 로 거의 방사선에 가깝다. 정돈되어 보이는 것은 색이 아니라
   이 배치 덕분이다.

   다만 정확한 동심원은 기계적으로 보인다. 그래서 클래스마다 목표 반지름을
   흔들어 고리를 두께 20 남짓의 '띠'로 번지게 하고, 그 상태에서 짧은 이완을
   돌렸다 — 구조는 남고 그림은 퍼진다. 자세한 것은 추출 스크립트 §6.

   ── 움직임 ──
   물리 시뮬레이션을 브라우저에서 돌리지 않는다. 좌표는 이미 굳어 있고,
   화면에서는 바퀴 전체가 아주 천천히 돌고 노드가 미세하게 숨쉰다.
   방사형에서 회전은 구조를 흐트러뜨리지 않는 유일한 움직임이다 — 좌우로
   흔들면 고리가 무너져 다시 헤어볼이 된다.

   두 가지 모드로 쓴다.
     hero : 히어로 배경. 상호작용 없음, 흐리게
     map  : 온톨로지 지도 섹션. 커서를 올리면 이웃을 밝히고 이름을 보여준다

   외부 CDN 을 쓰지 않는 것은 레퍼런스 문서의 권고를 따른 것이다 — 남의 서버에서
   불러온 스크립트는 그쪽이 바뀌면 같이 죽는다. 이 파일은 자기 완결이다.
   ============================================================ */
(function (global) {
  'use strict';

  /* ── 종류별 색과 이름 ──
     파란 계열이 화면을 지배하고, 색을 따로 쓰는 것은 값의 검증 상태 셋뿐이다.
     색은 장식이 아니라 값이다. */
  /* 어두운 바탕에서는 명도 순서가 뒤집힌다. 흰 바탕에서 가장 진했던 설비가
     여기서는 가장 밝고, 가장 조용한 출처가 가장 어둡다. 색상(파랑 계열)과
     검증 3색의 역할은 그대로다. */
  var TYPES = {
    eq:    { c: '#dbe9ff', r: 3.8, ko: 'HVAC 설비',       en: 'HVAC equipment' },
    basis: { c: '#7fb4ff', r: 3.4, ko: '선정근거',         en: 'Design basis' },
    calc:  { c: '#6f9fd0', r: 3.0, ko: '계산단계',         en: 'Calculation step' },
    cond:  { c: '#5f7d9e', r: 2.7, ko: '설계조건',         en: 'Design condition' },
    part:  { c: '#78a8e0', r: 2.7, ko: '부품',            en: 'Part' },
    zone:  { c: '#9dc0e4', r: 2.9, ko: '존',              en: 'Zone' },
    space: { c: '#7d97b2', r: 2.9, ko: '공간',            en: 'Space' },
    vOK:   { c: '#3ddc97', r: 2.8, ko: '값 · 교차검증',    en: 'Value · cross-validated' },
    /* '불일치' 는 틀렸다는 뜻으로 읽힌다. 이 상태는 두 문서에 다르게 적혀
       있다는 사실이고 어느 쪽도 틀린 값이 아니다 — 화면의 다른 자리와 같은
       말을 쓴다. 색도 경고색(#fb923c)에서 차분한 금색으로 내렸다. */
    vNO:   { c: '#f0be74', r: 2.8, ko: '값 · 두 자료가 다름', en: 'Value · divergent' },
    vTOL:  { c: '#38bdf8', r: 2.8, ko: '값 · 허용오차 내',  en: 'Value · within tolerance' },
    src:   { c: '#647c96', r: 2.3, ko: '출처',            en: 'Source' }
  };

  /* 범례 순서 — 가운데 고리부터 바깥 고리 순. 그림의 반지름 순서와 같다. */
  /* 술어의 접두사. graph-data.js 에는 이름만 실려 있는데 화면에 hvo: 를
     일괄로 붙이면 사실이 틀린다 — hasPart 와 hasLocation 은 Brick 것이다.
     ontology.ttl 로 확인한 결과다. */
  var BRICK_P = { hasPart: 1, hasLocation: 1 };

  var LEGEND = ['eq', 'basis', 'calc', 'cond', 'part', 'zone', 'vOK', 'vNO', 'vTOL', 'src'];

  var reduced = global.matchMedia &&
                global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  function create(canvas, opts) {
    opts = opts || {};
    var mode = opts.mode || 'map';
    var isHero = mode === 'hero';
    var ctx = canvas.getContext('2d');

    var N = GRAPH.nodes, E = GRAPH.edges;
    var CX = GRAPH.cx, CY = GRAPH.cy, R0 = GRAPH.r;

    /* 이웃 목록 — hover 에서 1-hop 을 밝히는 데 쓴다 */
    var nbr = N.map(function () { return []; });
    for (var e = 0; e < E.length; e++) {
      nbr[E[e][0]].push(e);
      nbr[E[e][1]].push(e);
    }

    /* 극좌표를 그대로 들고 간다. 회전은 각도에 더하기만 하면 되고
       고리(반지름)는 절대 흐트러지지 않는다. */
    var ang0 = N.map(function (n) { return n.a; });
    var rad0 = N.map(function (n) {
      return Math.sqrt((n.x - CX) * (n.x - CX) + (n.y - CY) * (n.y - CY));
    });
    var brPh = N.map(function (n, i) { return (i * 2.399963) % 6.2832; });

    /* 3차원 좌표 — 추출기가 만든 구면 배치(§7). 2D 와 함께 실려 온다. */
    var p3 = N.map(function (n) { return [n.X || 0, n.Y || 0, n.Z || 0]; });
    var has3 = N.length > 0 && N[0].X !== undefined;

    /* 카메라 — 원근이 보일 만큼만 가깝게. CAM 이 크면 평행투영에 가까워진다.
       3.1 로 두었을 때는 앞뒤 크기차가 2배도 안 되어 회전하는 평면 산포처럼
       읽혔다. 2.4 면 앞 1.71배 · 뒤 0.71배로 벌어져 부피가 보인다.
       더 줄이면(2.0 아래) 앞쪽 노드가 화면 밖으로 밀려난다. */
    var CAM = R0 * 2.4, FOC = R0 * 2.4, TILT = -0.40;

    /* 3D 는 원근 때문에 2D 보다 넓게 퍼진다 — 그만큼 줄여 화면에 담는다. */
    var S3 = 0.92;

    var view = { s: 1, cx: 0, cy: 0, w: 0, h: 0, R: 1 };
    var t0 = null, raf = null, running = false, rot = 0;
    var hover = -1, hoverEdges = null, hoverNodes = null;
    /* 초점 — hover 와 같은 '눌러 두기' 장치를 프로그램에서 켤 때 쓴다.
       질의응답에서 답이 되는 노드만 밝히는 데 필요하다. hover 와 같은
       집합(hoverEdges · hoverNodes)을 재사용하므로 그리는 코드는 그대로다. */
    var focused = false;

    /* ── 점진적 생성 ──
       bCut 은 지금 몇 개까지 보이는지다(노드 개수). 1 이 아니라 개수로 두는
       것은, 진행률을 개수로 환산해 두면 엣지 판정이 비교 한 번으로 끝나기
       때문이다.

       순서는 손으로 적지 않고 데이터에서 뽑는다 — 클래스 띠(설비 → 근거·계산
       → 부품·공간 → 값 → 출처) 순으로, 같은 띠 안에서는 각도 순. 그래서
       가운데에서 바깥으로 한 바퀴씩 자라 보이고, 그 순서가 실제 구축 순서
       (개체를 세우고 → 근거를 붙이고 → 값을 달고 → 출처를 잇는다)와 같다. */
    var BAND = { eq: 0, basis: 1, calc: 2, cond: 3,
                 part: 4, zone: 5, space: 5,
                 vOK: 6, vNO: 6, vTOL: 6, src: 7 };
    var bRank = new Array(N.length);
    (function () {
      var idx = [];
      for (var i = 0; i < N.length; i++) idx.push(i);
      idx.sort(function (a, b) {
        var ba = BAND[N[a].t], bb = BAND[N[b].t];
        if (ba === undefined) ba = 9;
        if (bb === undefined) bb = 9;
        if (ba !== bb) return ba - bb;
        return (N[a].a || 0) - (N[b].a || 0);
      });
      for (var k = 0; k < idx.length; k++) bRank[idx[k]] = k;
    }());
    /* 생성 모드가 아니면 처음부터 전부 보인다 */
    var building = opts.build === true;
    var bCut = building ? 0 : N.length;
    /* 눌린 쪽의 바닥값. hover 판독(02)에서는 낮게 두어 이웃이 도드라지게 하고,
       질의응답(03)에서는 높게 두어 배경 그래프가 남아 있게 한다. */
    var DIMF = {
      edge: (opts.dimFloor && opts.dimFloor.edge) || 0.09,
      node: (opts.dimFloor && opts.dimFloor.node) || 0.26
    };

    /* 2D ↔ 3D. morph 가 목표값을 향해 부드럽게 따라간다. */
    var want3 = has3 && (opts.threeD === true);
    var morph = want3 ? 1 : 0;

    /* 캔버스 위에 떠 있는 DOM 이 차지한 자리. 이름표는 여기를 피한다.
       매 프레임 재지 않고 resize 에서 한 번 잡는다 — 위치가 CSS 로 못박혀 있다. */
    var deadBox = null;

    function resize() {
      var box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;

      var cnt = canvas.parentNode && canvas.parentNode.querySelector('.sg-count');
      if (cnt) {
        var cr = cnt.getBoundingClientRect();
        deadBox = cr.width
          ? { x: cr.left - box.left - 5, y: cr.top - box.top - 4,
              w: cr.width + 10, h: cr.height + 8 }
          : null;
      }
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width  = Math.round(box.width * dpr);
      canvas.height = Math.round(box.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      view.w = box.width; view.h = box.height;

      /* 원은 찌그러뜨리지 않는다 — 가로세로 같은 배율만 쓴다.
         지도는 전부 담고, 히어로는 조금 넘치게 두어 위아래가 잘린다. */
      /* 배율을 2px 단위로 끊는다.
         스크롤 중에 박스 높이가 1px 단위로 흔들리는 일이 있고(스크롤바 ·
         sticky 전환 · 100vh 변동), 그때마다 fit 이 달라져 그래프가 미세하게
         커졌다 작아졌다 했다 — "스크롤하면서 화면 비율이 달라진다" 가 이것이다.
         눈에 보이지 않을 만큼만 양자화하면 흔들림이 사라진다. */
      var qw = Math.round(box.width / 2) * 2;
      var qh = Math.round(box.height / 2) * 2;
      var fit = Math.min(qw, qh) / (R0 * 2);
      if (isHero) {
        /* 확대하면(1.4배로 해 봤다) 화면에 남는 것이 방사선 줄무늬뿐이어서
           구조가 읽히지 않는다. 바퀴 전체가 들어오는 배율로 두고 오른쪽으로
           살짝 밀어, 미리보기 패널 뒤에서 반쯤 드러나게 한다. */
        view.s = fit * 1.02;
        view.cx = box.width * 0.575;
        view.cy = box.height * 0.42;
      } else {
        view.s = fit * 0.97;
        view.cx = box.width / 2;
        view.cy = box.height / 2;
      }
      view.R = R0 * view.s;
    }

    /* ── 좌표 계산 ──
       2D 는 극좌표(고리+각도), 3D 는 회전 후 원근 투영.
       morph 로 두 결과를 화면 좌표에서 섞는다 — 위치를 섞는 것이라
       전환이 튀지 않고, 어느 쪽도 계산이 무겁지 않다.

       z 는 깊이 단서를 만드는 데 쓴다. 0(먼 쪽)~1(가까운 쪽)로 정규화해
       크기와 진하기에 곱한다. 안개가 없으면 구가 평면 원반처럼 보인다. */
    var cosR = 1, sinR = 0, cosT = 1, sinT = 0;

    function P(i, prog, tt) {
      /* 2D */
      var a = ang0[i] + rot, r = rad0[i];
      if (prog < 1) {
        /* 등장 — 바깥에서 제 자리로 모인다. 결정적이라 매번 같다. */
        var pe = ease(Math.min(1, Math.max(0, prog * 1.4 - (i % 32) * 0.009)));
        r = R0 * 1.3 * (1 - pe) + r * pe;
        a += (1 - pe) * 0.2;
      } else if (!reduced) {
        r += Math.sin(tt * 0.5 + brPh[i]) * 1.5;
      }
      var x2 = view.cx + Math.cos(a) * r * view.s;
      var y2 = view.cy + Math.sin(a) * r * view.s;

      if (morph < 0.001) return { x: x2, y: y2, k: 1, z: 0.62 };

      /* 3D — Y축 회전 다음 X축 기울임, 그리고 원근 */
      var v = p3[i], grow = 1;
      if (prog < 1) {
        var pe3 = ease(Math.min(1, Math.max(0, prog * 1.4 - (i % 32) * 0.009)));
        grow = 1.3 * (1 - pe3) + pe3;
      }
      var vx = v[0] * grow, vy = v[1] * grow, vz = v[2] * grow;
      var rx = vx * cosR + vz * sinR;
      var rz = -vx * sinR + vz * cosR;
      var ry = vy * cosT - rz * sinT;
      var rz2 = vy * sinT + rz * cosT;
      var k = FOC / Math.max(120, CAM - rz2);
      var x3 = view.cx + rx * k * view.s * S3;
      var y3 = view.cy + ry * k * view.s * S3;
      var zn = (rz2 + R0) / (2 * R0);          /* 0 먼 쪽 · 1 가까운 쪽 */

      if (morph > 0.999) return { x: x3, y: y3, k: k, z: zn };
      var m = morph;
      return { x: x2 + (x3 - x2) * m, y: y2 + (y3 - y2) * m,
               k: 1 + (k - 1) * m, z: 0.62 + (zn - 0.62) * m };
    }

    /* 한 프레임에서 예외가 나도 연쇄를 끊지 않는다.
       예전에는 draw() 마지막 줄에서만 다음 프레임을 요청했기 때문에, 중간에
       한 번 던지면 그래프가 그 자리에서 영구히 멈췄다. 그림 하나 깨지는 것과
       화면이 죽는 것은 무게가 다르다. */
    function draw() {
      try { drawFrame(); }
      catch (err) {
        if (global.console && console.warn) console.warn('graph draw:', err);
      }
      raf = running ? global.requestAnimationFrame(draw) : null;
    }

    function drawFrame() {
      /* 시간은 rAF 타임스탬프가 아니라 벽시계로 잰다.
         rAF 로 재면 브라우저가 프레임을 아껴 주는 상황(백그라운드 탭 ·
         인쇄 · 스크린샷 캡처)에서 등장 애니메이션이 중간에 멈춘 채로 남는다.
         실제로 헤드리스 캡처에서 프레임이 세 번만 돌아 그래프가 투명한
         상태로 찍혔다. 벽시계를 쓰면 늦게 한 프레임만 그려도 완성된 그림이 된다. */
      var now = Date.now();
      if (t0 === null) t0 = now;
      var tt = (now - t0) / 1000;
      var prog = reduced ? 1 : Math.min(1, tt / 2.1);
      /* 아주 느리게. 살아 있다는 것만 보이면 된다. */
      if (!reduced) rot = tt * (isHero ? 0.0075 : 0.004);

      /* 2D ↔ 3D 전환을 따라간다 (약 0.5초) */
      var target = want3 ? 1 : 0;
      if (morph !== target) {
        var stepM = reduced ? 1 : 0.055;
        morph += Math.min(stepM, Math.abs(target - morph)) * (target > morph ? 1 : -1);
        if (Math.abs(target - morph) < 0.002) morph = target;
      }

      /* 3D 회전 — 2D 와 달리 각도에 더하는 것으로는 안 되므로 미리 계산해 둔다 */
      /* 회전 속도. 3D 에서는 움직임 자체가 깊이 단서라서 2D 의 미세한 회전
         (0.0075)처럼 두면 3D 인 줄 모른다. 0.10 은 한 바퀴 63초로 멈춘 것처럼
         보였다. 0.30 이면 21초, 배경으로 두기에 아직 조용하다. */
      var yaw = reduced ? 0.6 : tt * (isHero ? 0.30 : 0.24);
      cosR = Math.cos(yaw); sinR = Math.sin(yaw);
      cosT = Math.cos(TILT); sinT = Math.sin(TILT);

      ctx.clearRect(0, 0, view.w, view.h);
      var dim = hover >= 0 || focused;

      /* 고리 안내선은 그리지 않는다. 노드가 고리 위에 정확히 앉아 있을 때는
         구조를 알려 주는 선이었지만, 지금은 각 클래스가 두께 20 남짓의 띠로
         번져 있어서(tools/extract_graph.py §6) 원을 그으면 노드가 선을 빗나간
         것처럼 보인다. 구조는 노드의 분포가 스스로 말한다. */

      var pt = new Array(N.length);
      for (var i = 0; i < N.length; i++) pt[i] = P(i, prog, tt);

      /* 3D 에서는 먼 것부터 그려야 가까운 것이 위에 온다.
         2D 에서는 순서가 의미 없으므로 정렬을 건너뛴다. */
      var order = new Array(N.length);
      for (var oi = 0; oi < N.length; oi++) order[oi] = oi;
      if (morph > 0.001) {
        order.sort(function (p, q) { return pt[p].z - pt[q].z; });
      }

      /* ── 엣지 ──
         트리 엣지는 곧은 방사선. 현은 안쪽으로 아주 살짝 배부르게 —
         각도차가 작으니 이 정도로 충분히 갈라져 보인다.

         히어로에서 엣지를 빼 본 적이 있다. 그러면 배경 평균 명도가 254/255 로
         사실상 백지가 되어(실측) 그래프가 있다는 것조차 안 보였다 — 잉크의
         대부분이 엣지에 있기 때문이다. 그래서 되살렸다. 처음에 줄무늬로 보였던
         것은 엣지 탓이 아니라 바퀴를 1.4배로 확대해 중심이 화면 밖으로 나갔던
         탓이고, 지금은 중심이 글과 패널 사이에 들어와 방사선이 한 점으로
         모이는 것이 보인다. */
      for (var e2 = 0; e2 < E.length; e2++) {
        /* 한쪽 끝이 아직 없으면 선을 그을 데가 없다 */
        if (bRank[E[e2][0]] >= bCut || bRank[E[e2][1]] >= bCut) continue;
        var a = pt[E[e2][0]], b = pt[E[e2][1]];
        var lit = !isHero && dim && hoverEdges !== null && hoverEdges.has(e2);
        /* 눌린 쪽의 바닥값을 .05 → .09 로 올렸다. 질의응답에서 답이 되는
           노드만 밝히면 나머지가 거의 사라져 '그래프 위에서 찾았다'가 아니라
           '빈 화면에 몇 개 떠 있다'로 보였다. */
        var al = (isHero ? 0.30 : (dim ? (lit ? 0.75 : DIMF.edge) : 0.22)) * prog;
        /* 깊이 안개 — 뒤로 갈수록 옅게. 이게 없으면 구가 평면처럼 보인다. */
        if (morph > 0.001) {
          var zAvg = (a.z + b.z) / 2;
          al *= 1 - morph * (1 - (0.16 + 0.84 * zAvg));
        }
        if (al < 0.012) continue;
        ctx.strokeStyle = lit ? 'rgba(140,194,255,' + al + ')'
                              : 'rgba(148,186,232,' + al + ')';
        ctx.lineWidth = lit ? 1.6 : 0.9;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        /* 3D 에서는 곧은 선으로 둔다. 휘어진 현은 평면에서 겹침을 풀어 주지만
           회전하는 3D 에서는 방향이 헷갈리게 만든다. */
        if (E[e2][3] || morph > 0.5) {
          ctx.lineTo(b.x, b.y);
        } else {
          var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          ctx.quadraticCurveTo(mx + (view.cx - mx) * 0.16,
                               my + (view.cy - my) * 0.16, b.x, b.y);
        }
        ctx.stroke();
      }

      /* ── 노드 ── 3D 에서는 먼 것부터 ── */
      for (var oj = 0; oj < order.length; oj++) {
        var j = order[oj];
        if (bRank[j] >= bCut) continue;          /* 아직 만들어지지 않았다 */
        var n = N[j], ty = TYPES[n.t] || TYPES.src, p = pt[j];
        var rr = (ty.r + Math.min(2.6, Math.sqrt(n.d) * 0.6)) * (isHero ? 0.9 : 1);
        var litN = !isHero && dim && hoverNodes !== null && hoverNodes.has(j);
        var al2 = (isHero ? 0.88 : (dim ? (litN ? 1 : DIMF.node) : 0.92)) * prog;
        if (morph > 0.001) {
          rr *= 1 + morph * (p.k - 1);                       /* 원근 크기 */
          al2 *= 1 - morph * (1 - (0.20 + 0.80 * p.z));      /* 깊이 안개 */
        }
        /* 갓 나온 노드는 잠깐 크게 그린다. 이게 없으면 개수만 늘고
           '하나가 지금 생겼다'가 보이지 않는다. */
        if (building) {
          var age = bCut - bRank[j];
          if (age < 14) rr *= 1 + (1 - age / 14) * 0.9;
        }

        ctx.globalAlpha = al2;
        ctx.fillStyle = ty.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr * (litN ? 1.45 : 1), 0, 6.2832);
        ctx.fill();
        /* 바탕색 테두리 한 줄 — 붙어 있는 노드가 서로 떨어져 보이게 한다.
           흰 테두리를 두면 어두운 바탕에서 노드마다 흰 링이 생겨 더 지저분하다. */
        if (!isHero || litN) {
          ctx.globalAlpha = al2 * 0.85;
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#070d18';
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      /* ── 강조 ──
         예전에는 이웃 노드의 이름만 띄웠다. 그러면 "무엇이 매달려 있다"까지만
         알고 "어떻게 매달려 있다"는 알 수 없다 — 관계는 노드가 아니라 술어다.
         게다가 이름 열 개가 한자리에 겹쳐 쌓여 읽히지도 않았다.

         지금은 셋을 그린다.
           ① 중심 노드에 링 두 겹      — 어디를 짚었는지
           ② 엣지에 방향 화살표         — 어느 쪽으로 향하는 관계인지
           ③ 술어 이름을 묶어서 한 번씩  — 어떤 관계인지
         이름표는 놓을 자리를 확인하고, 겹치면 아래로 밀어 놓는다. */
      if (!isHero && hoverNodes) {
        var FONT = ' "SF Pro Text", system-ui, -apple-system, sans-serif';
        var placed = [];
        /* 노드 수 판독이 앉아 있는 자리를 먼저 차지해 둔다 */
        if (deadBox) placed.push(deadBox);

        function free(x, y, w, h) {
          for (var i = 0; i < placed.length; i++) {
            var r = placed[i];
            if (x < r.x + r.w + 3 && x + w + 3 > r.x &&
                y < r.y + r.h + 2 && y + h + 2 > r.y) return false;
          }
          return true;
        }
        /* 제자리에 못 놓으면 위아래로 조금씩 밀어 본다. 그래도 안 되면 버린다 —
           읽을 수 없게 겹쳐 놓는 것보다 하나 빼는 편이 낫다. */
        function place(x, y, w, h) {
          for (var k = 0; k < 9; k++) {
            var dy = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (h + 3);
            if (free(x, y + dy, w, h)) {
              placed.push({ x: x, y: y + dy, w: w, h: h });
              return y + dy;
            }
          }
          return null;
        }
        function chip(x, y, text, fg, bg, bd, weight, size) {
          ctx.font = weight + ' ' + size + 'px' + FONT;
          var w = ctx.measureText(text).width, h = size + 9;
          var yy = place(x, y - h / 2, w + 14, h);
          if (yy === null) return false;
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.rect(x, yy, w + 14, h);
          ctx.fill();
          if (bd) {
            ctx.strokeStyle = bd; ctx.lineWidth = 1;
            ctx.stroke();
          }
          ctx.fillStyle = fg;
          ctx.textBaseline = 'middle';
          ctx.fillText(text, x + 7, yy + h / 2);
          return true;
        }

        /* ① 중심 노드에 링 — hover 는 하나, 초점(질의응답)은 여럿 */
        var cores = hover >= 0 ? [hover] : [];
        if (hover < 0 && focusSet) focusSet.forEach(function (v) { cores.push(v); });
        ctx.lineWidth = 1.4;
        for (var ci = 0; ci < cores.length; ci++) {
          var cp = pt[cores[ci]];
          if (!cp) continue;
          ctx.strokeStyle = 'rgba(106,180,255,.85)';
          ctx.beginPath(); ctx.arc(cp.x, cp.y, 11, 0, 6.2832); ctx.stroke();
          ctx.strokeStyle = 'rgba(106,180,255,.30)';
          ctx.beginPath(); ctx.arc(cp.x, cp.y, 17, 0, 6.2832); ctx.stroke();
        }

        /* ② 방향 화살표 — hover 한 노드에 붙은 엣지에만 */
        if (hover >= 0) {
          var hp = pt[hover];
          ctx.fillStyle = 'rgba(166,212,255,.9)';
          nbr[hover].forEach(function (ei) {
            var from = pt[E[ei][0]], to = pt[E[ei][1]];
            if (!from || !to) return;
            var vx = to.x - from.x, vy = to.y - from.y;
            var len = Math.sqrt(vx * vx + vy * vy);
            if (len < 24) return;
            vx /= len; vy /= len;
            /* 목표 노드 앞에서 멈춘다 — 노드 위에 겹치면 무엇을 가리키는지 흐려진다 */
            var ax = to.x - vx * 9, ay = to.y - vy * 9;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - vx * 8 - vy * 4, ay - vy * 8 + vx * 4);
            ctx.lineTo(ax - vx * 8 + vy * 4, ay - vy * 8 - vx * 4);
            ctx.closePath();
            ctx.fill();
          });
        }

        /* ③ 술어 — 같은 술어·같은 방향은 한 번만. 그 무리의 가운데에 적는다.
           엣지마다 적으면 같은 이름이 여덟 번 쌓여 읽을 수 없다. */
        if (hover >= 0) {
          var groups = {};
          nbr[hover].forEach(function (ei) {
            var out = E[ei][0] === hover;
            var key = (out ? '>' : '<') + E[ei][2];
            var mid = { x: (pt[E[ei][0]].x + pt[E[ei][1]].x) / 2,
                        y: (pt[E[ei][0]].y + pt[E[ei][1]].y) / 2 };
            if (!groups[key]) groups[key] = { p: E[ei][2], out: out, x: 0, y: 0, n: 0 };
            groups[key].x += mid.x; groups[key].y += mid.y; groups[key].n++;
          });
          Object.keys(groups).forEach(function (k) {
            var g = groups[k];
            var name = (BRICK_P[g.p] ? 'brick:' : 'hvo:') + g.p +
                       (g.n > 1 ? '  ×' + g.n : '');
            chip(g.x / g.n + 8, g.y / g.n, (g.out ? '→ ' : '← ') + name,
                 '#a6d4ff', 'rgba(7,13,24,.94)', 'rgba(106,180,255,.55)', '500', 11.5);
          });
        }

        /* 이름표 — 중심에서 가까운 것부터 놓는다. 자리가 없으면 버린다. */
        var list = [];
        hoverNodes.forEach(function (j2) { list.push(j2); });
        var anchor = hover >= 0 ? pt[hover] : null;
        if (anchor) {
          list.sort(function (u, v) {
            function d(i) {
              var q = pt[i];
              return (q.x - anchor.x) * (q.x - anchor.x) + (q.y - anchor.y) * (q.y - anchor.y);
            }
            return d(u) - d(v);
          });
        }
        for (var li = 0; li < list.length; li++) {
          var j2 = list[li], n2 = N[j2], p2 = pt[j2];
          if (!p2) continue;
          var isMain = j2 === hover;
          var label = n2.l.length > 22 ? n2.l.slice(0, 21) + '…' : n2.l;
          var size = isMain ? 13.5 : 11.5;
          ctx.font = (isMain ? '600 ' : '400 ') + size + 'px' + FONT;
          var w = ctx.measureText(label).width + 14;
          var out2 = Math.cos(ang0[j2] + rot) < 0 ? -1 : 1;
          var gap = (TYPES[n2.t] || TYPES.src).r + (isMain ? 20 : 8);
          var bx = out2 > 0 ? p2.x + gap : p2.x - gap - w;
          bx = Math.max(3, Math.min(bx, view.w - w - 4));
          chip(bx, p2.y, label,
               isMain ? '#f4f7fa' : '#c3ccd6',
               isMain ? 'rgba(11,20,36,.97)' : 'rgba(7,13,24,.90)',
               isMain ? 'rgba(106,180,255,.8)' : null,
               isMain ? '600' : '400', size);
        }
      }

      lastPt = pt;
    }

    function kick() { if (raf === null && running) raf = global.requestAnimationFrame(draw); }

    /* ── hover ──
       마지막으로 그린 화면 좌표(lastPt)로 찍는다. 2D 는 각도만 되돌리면 됐지만
       3D 는 회전·기울임·원근이 겹쳐 역산이 번거롭고, 어차피 매 프레임 좌표를
       계산해 두므로 그것을 쓰는 편이 정확하다. 겹친 노드 중에서는 가까운 것을
       고른다 — 눈에 보이는 것이 잡혀야 한다. */
    var lastPt = null;

    /* tol — 집는 반경(px). 커서는 18, 손가락은 넓게 준다.
       실측 333px 캔버스에 484 개 노드가 들어가므로 너무 넓히면 옆 노드를
       집는다. 28 은 손끝 폭쯤이고, 겹칠 때는 앞쪽(z 큰) 것을 고른다. */
    function pick(mx, my, tol) {
      var T = tol || 18;
      if (lastPt) {
        var b3 = -1, bd3 = T * T, bz = -1;
        for (var q = 0; q < N.length; q++) {
          var pq = lastPt[q];
          var dq = (pq.x - mx) * (pq.x - mx) + (pq.y - my) * (pq.y - my);
          if (dq < bd3 && pq.z >= bz) { bd3 = Math.max(dq, 1); bz = pq.z; b3 = q; }
        }
        if (b3 >= 0) return b3;
      }
      var best = -1, bd = (T - 2) * (T - 2);
      for (var i = 0; i < N.length; i++) {
        var a = ang0[i] + rot, r = rad0[i] * view.s;
        var px = view.cx + Math.cos(a) * r, py = view.cy + Math.sin(a) * r;
        var d = (px - mx) * (px - mx) + (py - my) * (py - my);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    /* 초점(focus)으로 만든 집합. setHover 가 커서 집합으로 덮어쓰더라도
       커서가 떠날 때 이걸로 되돌린다. */
    var focusSet = null, focusEdges = null;

    function setHover(i) {
      if (i === hover) return;
      hover = i;
      if (i < 0) {
        /* 여기서 그냥 null 로 비우면, 초점이 켜져 있는 동안(dim === true)
           draw() 가 hoverNodes.has() 를 부르다 예외로 죽는다. 그러면 rAF
           연쇄가 끊겨 그래프가 영구히 멈추고, 창을 다시 열 때까지 돌아오지
           않는다 — 커서를 캔버스 밖으로 빼거나 2D/3D 를 누르는 것만으로
           재현됐다. 초점이 있으면 그 집합으로 되돌린다. */
        if (focused) { hoverEdges = focusEdges; hoverNodes = focusSet; }
        else { hoverEdges = hoverNodes = null; }
      } else {
        hoverEdges = new Set(nbr[i]);
        hoverNodes = new Set([i]);
        nbr[i].forEach(function (ei) {
          hoverNodes.add(E[ei][0]); hoverNodes.add(E[ei][1]);
        });
      }
      if (opts.onHover) opts.onHover(i < 0 ? null : info(i));
      kick();
    }

    /* 이 노드가 무엇이고 어떤 관계로 매달려 있는지 */
    function info(i) {
      var n = N[i], groups = [], byKey = {};
      nbr[i].forEach(function (ei) {
        var p = E[ei][2];
        var other = E[ei][0] === i ? E[ei][1] : E[ei][0];
        /* 방향을 보존한다. 'ZHUA01 → hasPart → 코일' 과 그 반대는 다른 사실이다. */
        var out = E[ei][0] === i;
        var key = (out ? 'out ' : 'in ') + p;
        if (!byKey[key]) {
          byKey[key] = { p: p, out: out, items: [] };
          groups.push(byKey[key]);
        }
        byKey[key].items.push({
          i: other, label: N[other].l, type: N[other].t,
          meta: TYPES[N[other].t] || TYPES.src
        });
      });
      /* 술어 순서를 고정한다 — 매번 다른 순서로 뜨면 읽는 사람이 헷갈린다. */
      var ORDER = ['hasQuantityValue', 'selectedBy', 'derivedFrom', 'basedOn',
                   'sourcedFrom', 'hasPart', 'serves', 'hasLocation'];
      groups.sort(function (a, b) {
        var x = ORDER.indexOf(a.p), y = ORDER.indexOf(b.p);
        return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
      });
      return { i: i, label: n.l, type: n.t, typeMeta: TYPES[n.t] || TYPES.src,
               degree: n.d, groups: groups };
    }

    if (!isHero) {
      /* 마지막 입력이 손가락이었나. 터치는 pointermove 로 훑을 수가 없고
         (누른 채 끌면 스크롤이다) 손을 떼면 pointerleave 가 따라오므로,
         커서와 같은 규칙을 쓰면 판독이 뜨자마자 지워진다. */
      var coarse = false;

      canvas.addEventListener('pointerdown', function (ev) {
        coarse = ev.pointerType === 'touch' || ev.pointerType === 'pen';
      });
      canvas.addEventListener('pointermove', function (ev) {
        if (ev.pointerType === 'touch') return;   /* 스크롤 중이다 */
        coarse = false;
        var b = canvas.getBoundingClientRect();
        setHover(pick(ev.clientX - b.left, ev.clientY - b.top));
      });
      /* 손가락으로 고른 것은 손을 떼도 남는다 — 다음 탭까지 읽을 시간을 준다 */
      canvas.addEventListener('pointerleave', function () { if (!coarse) setHover(-1); });
      canvas.addEventListener('click', function (ev) {
        if (coarse) {
          /* pointerleave 가 이미 지나갔으므로 좌표로 다시 집는다.
             빈 곳을 탭하면 -1 이 되어 판독이 닫힌다 — 닫는 방법이 있어야 한다. */
          var b = canvas.getBoundingClientRect();
          setHover(pick(ev.clientX - b.left, ev.clientY - b.top, 28));
        }
        if (hover >= 0 && opts.onSelect) opts.onSelect(info(hover));
      });
    }

    /* 화면 밖으로 나가면 멈춘다. 배터리를 쓸 이유가 없다. */
    function start() { if (!running) { running = true; kick(); } }
    function stop()  { running = false; if (raf) { global.cancelAnimationFrame(raf); raf = null; } }

    resize();
    if (global.ResizeObserver) {
      new global.ResizeObserver(function () { resize(); kick(); }).observe(canvas);
    } else {
      global.addEventListener('resize', function () { resize(); kick(); });
    }

    /* 첫 프레임은 조건 없이 그린다.
       예전에는 IntersectionObserver 가 start() 를 부를 때까지 기다렸는데,
       IO 콜백은 렌더 갱신이 일어난 뒤에 오고 렌더 갱신은 누군가 프레임을
       요청해야 일어나므로 교착이 생겼다 — 실측에서 rAF 호출 0회, 캔버스 0픽셀.
       IO 는 화면을 벗어났을 때 멈추고 다시 들어오면 재개하는 용도로만 쓴다. */
    start();

    /* ── 화면에 있을 때만 그린다 ──
       예전에는 IntersectionObserver 로 판단했다. 그런데 IO 콜백은 '렌더 갱신
       뒤'에 오므로, 오지 않는 상황에서는 캔버스가 영구히 멈춘 상태로 남는다.
       실측: 세 파트 어디로 스크롤해도 running=false · draws=2 였다 — 그래프가
       빈 화면으로 보이고, lastPt 가 갱신되지 않아 질의응답의 노드 비행까지
       사라졌다. 한 원인이 두 증상을 만들었다.

       그래서 스크롤·리사이즈에서 좌표로 직접 판단한다. 동기 계산이라
       굶을 수가 없다. 위아래로 200px 여유를 둬서 경계에서 깜빡이지 않는다. */
    function inView() {
      var b = canvas.getBoundingClientRect();
      var vh = global.innerHeight || 800;
      if (b.bottom > -200 && b.top < vh + 200) start(); else stop();
    }
    var vq = false;
    function onScrollView() {
      if (vq) return;
      vq = true;
      global.requestAnimationFrame(function () { vq = false; inView(); });
    }
    global.addEventListener('scroll', onScrollView, { passive: true });
    global.addEventListener('resize', inView);
    /* 문서가 숨으면(다른 탭) 멈추고, 돌아오면 다시 본다 */
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.hidden) stop(); else inView();
    });
    inView();

    return {
      start: start, stop: stop, resize: resize, info: info,

      /* ── 질의응답 연출이 쓰는 셋 ──
         focus(list)  그 노드들만 밝히고 나머지를 눌러 둔다. 사이를 잇는
                      엣지도 함께 밝힌다(양쪽 끝이 모두 목록에 있을 때).
         screenPos(i) 그 노드가 지금 캔버스 안 어디에 찍혀 있는지(CSS px).
                      노드가 <canvas> 안에 있어 CSS 로 움직일 수 없으므로,
                      이 좌표에 DOM 조각을 겹쳐 놓고 그것을 날린다. */
      /* 진행률 0..1. 생성 모드로 만든 그래프에서만 뜻이 있다. */
      setBuild: function (p) {
        if (!building) return;
        var v = p < 0 ? 0 : p > 1 ? 1 : p;
        var next = Math.round(v * N.length);
        if (next === bCut) return;
        bCut = next;
        kick();
      },
      buildCount: N.length,
      /* 생성 순서. 화면에 적는 노드·엣지 수를 실제로 그려진 것과 맞추려면
         바깥에서도 이 순서를 알아야 한다. */
      buildRank: bRank,

      focus: function (list) {
        if (!list || !list.length) {
          focused = false; focusSet = focusEdges = null;
          hoverEdges = hoverNodes = null; kick(); return;
        }
        var set = new Set(list);
        var eset = new Set();
        for (var k = 0; k < E.length; k++) {
          if (set.has(E[k][0]) && set.has(E[k][1])) eset.add(k);
        }
        focused = true;
        focusSet = set; focusEdges = eset;
        hoverNodes = set; hoverEdges = eset;
        hover = -1;
        kick();
      },
      clearFocus: function () {
        focused = false; focusSet = focusEdges = null;
        hoverEdges = hoverNodes = null; hover = -1; kick();
      },
      screenPos: function (i) {
        if (!lastPt || !lastPt[i]) return null;
        return { x: lastPt[i].x, y: lastPt[i].y };
      },
      /* 노드 색 — 날려 보내는 조각을 실제 노드와 같은 색으로 칠하기 위해 */
      colorOf: function (i) {
        var m = TYPES[N[i].t] || TYPES.src;
        return m.c;
      },

      has3D: has3,
      is3D: function () { return want3; },
      setThreeD: function (on) {
        if (!has3 && on) return;
        want3 = !!on;
        setHover(-1);
        kick();
      },
      count: { nodes: N.length, edges: E.length }
    };
  }

  global.OntoGraph = { create: create, TYPES: TYPES, LEGEND: LEGEND, reduced: reduced };

}(window));
