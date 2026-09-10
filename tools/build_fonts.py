# 서체를 이 폴더 안으로 가져온다 — 외부 요청 0건으로 만들기 위한 스크립트.
#
# 왜 필요한가
#   원래는 Google Fonts(IBM Plex Mono)와 jsDelivr(Pretendard)에서 받아왔다.
#   경진대회장 네트워크가 막히면 한글이 시스템 서체로 떨어지고, CDN 쪽이 바뀌면
#   몇 년 뒤에 페이지가 달라 보인다. 레퍼런스 문서도 "오래 둘 페이지라면 라이브러리를
#   zip 안에 넣으라"고 권한다.
#
# 무엇을 하는가
#   1. 페이지가 실제로 쓰는 글자를 전부 모은다 (index.html · js · css)
#   2. Apple SD Gothic Neo 원본(각 3.8 MB)을 그 글자만 남겨 서브셋한다
#   3. IBM Plex Mono 는 라틴·숫자만 쓰므로 Google 의 latin 서브셋을 그대로 받는다
#   4. fonts/fonts.css 를 쓴다
#
# 한글 서체에 관하여
#   Apple SD Gothic Neo 를 쓴다. 이 장치에 설치된 것을 읽는다
#   (%LOCALAPPDATA%\Microsoft\Windows\Fonts). 파일이 다섯 벌인데 모두
#   usWeightClass 가 400 이고 패밀리 이름이 서로 달라서(…NeoM00, …NeoB00),
#   운영체제가 굵기로 묶어 주지 않는다. 그래서 @font-face 에서 굵기를
#   직접 지정해 한 패밀리로 묶는다.
#
#   실제로 쓰는 세 벌만 담는다 — M(500) 본문 · B(700) 강조 · EB(800) 큰 제목.
#   L(300)과 H(900)은 화면에서 쓰지 않아 뺐다(각 40 KB 절약).
#
# 언제 다시 돌리는가
#   화면 문구에 새 한글이 들어가면 다시 돌려야 한다. 서브셋에 없는 글자는
#   시스템 서체로 떨어진다. 스크립트가 끝에 빠진 글자를 검사해 알려 준다.
#
#     python tools/build_fonts.py        ← 작업/ 에서 실행 (fontTools · brotli 필요)

import io, os, re, sys, urllib.request
sys.stdout.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.dirname(HERE)
FONTS = os.path.join(WORK, 'fonts')
CACHE = os.path.join(HERE, '_fontcache')
os.makedirs(FONTS, exist_ok=True)
os.makedirs(CACHE, exist_ok=True)

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36')

def fetch(url, name):
    """받아서 tools/_fontcache 에 둔다. 다시 돌릴 때 네트워크를 또 쓰지 않는다."""
    dst = os.path.join(CACHE, name)
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return dst
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=90) as r, open(dst, 'wb') as f:
        f.write(r.read())
    print('   받음 %-46s %8d bytes' % (name, os.path.getsize(dst)))
    return dst


# ── 1. 페이지가 쓰는 글자 모으기 ────────────────────────────────────────
SCAN = ['index.html', 'css/style.css', 'js/data.js', 'js/app.js',
        'js/graph.js', 'js/graph-data.js']
def strip_comments(text, rel):
    """주석은 화면에 안 나온다. 주석의 괘선문자(─ ═)까지 세면 '빠진 글자'
       경고가 실제 문제인지 구분이 안 된다."""
    if rel.endswith(('.js', '.css')):
        text = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
        text = re.sub(r'^\s*//.*$', ' ', text, flags=re.M)
    elif rel.endswith('.html'):
        text = re.sub(r'<!--.*?-->', ' ', text, flags=re.S)
    return text

chars = set()
for rel in SCAN:
    p = os.path.join(WORK, rel)
    if os.path.exists(p):
        chars |= set(strip_comments(io.open(p, encoding='utf-8').read(), rel))

# 라틴·숫자·기호는 넉넉히 넣는다 (거의 무게가 없다)
for c in range(0x20, 0x7F):
    chars.add(chr(c))
# 화면에서 쓰는 기호들 — 문구를 조금 고쳐도 깨지지 않도록 미리 넣어 둔다
# Pretendard 에 없는 글자는 넣어도 시스템 서체로 떨어진다. ▸ ∙ ⓐ 가 그렇다 —
# 그래서 화면에서 쓰지 않는다(▸ 는 구축 과정의 'NOW' 마커에서 뺐다).
chars |= set('·—–…→←↑↓≠≈≥≤±×÷✓◆°℃㎡㎥′″“”‘’「」()[]{}%&@#*①②③④⑤⑥⑦⑧⑨⑩')
# 자주 쓰는 한글 조사·어미가 빠지면 문구 수정 때 바로 깨진다. 흔한 음절을 더해 둔다.
chars |= set('가각간갈감강개거건걸검것게격결경계고곡골공과관광그기긴길김깊'
             '나난날남내너널네년노논높누는능니다단달담답대더던데도독동되된두'
             '들등디따때또라락란람래러런럴렁레려력련렬로록론료루르른를리린림'
             '마막만말맞매머먼멀메며면명모목몬무문물미민및바박반받발밝방배백'
             '번벌범법베변별보복본볼봄부북분불붙비빈빠뻐뽑사산살삼상새생서선'
             '설섬성세소속손솔송수순숨쉬스슬습시식신실심십싸써쓰씨아안않알암'
             '압앙앞애야약얀양어언얼업없었에여역연열영예오온올옮와완외요용우'
             '운울움웃원월위유으은을음응의이인일임입있잊자작잔잘잡장재저적전'
             '절점접정제조족존종좌주준줄중즈즉지직진질집짧차착찬참창찾채책처'
             '천철첫청체초총최추축출충치침칭카커컨코쿠크큰클키타탁탄탐태택터'
             '텍토통투트특틀티파판팔퍼페평포표푸품풀프피필하학한할함합해핵행'
             '향허험헤현협형호혹혼홈화확환활황회획효후훨흐흔흘히힘')

print('수집한 글자 %d자 (한글 %d자)'
      % (len(chars), sum(1 for c in chars if '가' <= c <= '힣')))


# ── 2. Apple SD Gothic Neo 서브셋 ──────────────────────────────────────
print()
print('Apple SD Gothic Neo')

from fontTools import subset as ftsubset
from fontTools.ttLib import TTFont

APPLE_DIR = os.path.join(os.environ.get('LOCALAPPDATA', ''),
                         'Microsoft', 'Windows', 'Fonts')
# 파일 → 우리가 쓸 굵기. 원본의 usWeightClass 는 다섯 벌 모두 400 이라
# 참고가 되지 않으므로, 파일 이름이 뜻하는 굵기를 여기서 정한다.
APPLE_FACES = [
    ('AppleSDGothicNeoM.ttf',  500, 'applesd-500.woff2'),   # 본문
    ('AppleSDGothicNeoB.ttf',  700, 'applesd-700.woff2'),   # 강조 · 제목
    ('AppleSDGothicNeoEB.ttf', 800, 'applesd-800.woff2'),   # 큰 제목
]

kr_faces = []
for fname, weight, out_name in APPLE_FACES:
    src = os.path.join(APPLE_DIR, fname)
    if not os.path.exists(src):
        print('   ⚠ 원본이 없다: %s' % src)
        continue
    out = os.path.join(FONTS, out_name)
    opts = ftsubset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.drop_tables = []
    font = ftsubset.load_font(src, opts)
    sub = ftsubset.Subsetter(options=opts)
    sub.populate(text=''.join(sorted(chars)))
    sub.subset(font)
    ftsubset.save_font(font, out, opts)
    font.close()
    print('   → fonts/%-20s %7d bytes  (원본 %d, 굵기 %d)'
          % (out_name, os.path.getsize(out), os.path.getsize(src), weight))
    kr_faces.append((weight, out_name))

assert kr_faces, 'Apple SD Gothic Neo 원본을 찾지 못했다'

# 빠진 글자 검사는 아래 IBM Plex Mono 를 담은 뒤 두 서체의 합집합으로 한다.
# 한 서체만 보면 헛경고가 난다 — Apple SD 에는 · − • 가 없고 Plex 에는
# → ≠ ≈ 가 없어서, 서로가 서로를 메운다(글자 단위 대체).
def cmap_of(rel):
    t = TTFont(os.path.join(FONTS, rel))
    out = set()
    for tb in t['cmap'].tables:
        out |= set(tb.cmap.keys())
    t.close()
    return out

kr_cmap = cmap_of(kr_faces[0][1])

# 옛 Pretendard 서브셋이 남아 있으면 지운다 — 쓰지 않는데 올라가면 낭비다
old_pre = os.path.join(FONTS, 'pretendard-subset.woff2')
if os.path.exists(old_pre):
    os.remove(old_pre)
    print('   옛 pretendard-subset.woff2 삭제')


# ── 3. IBM Plex Mono ───────────────────────────────────────────────────
# 라틴과 숫자에만 쓰므로 Google 의 latin 서브셋이 정확히 맞는다.
print()
print('IBM Plex Mono')
css_url = ('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:'
           'wght@300;400;500;600&display=swap')
req = urllib.request.Request(css_url, headers={'User-Agent': UA})
with urllib.request.urlopen(req, timeout=60) as r:
    gcss = r.read().decode('utf-8')

# latin 블록만 고른다 (latin-ext · vietnamese 는 쓰지 않는다)
blocks = re.findall(r'/\*\s*([\w\-\[\] ]+)\s*\*/\s*(@font-face\s*\{[^}]*\})', gcss)
plex_faces = []
for name, block in blocks:
    if name.strip() != 'latin':
        continue
    w = re.search(r'font-weight:\s*(\d+)', block)
    u = re.search(r'url\((https://[^)]+\.woff2)\)', block)
    if not (w and u):
        continue
    weight = w.group(1)
    fname = 'plex-mono-%s.woff2' % weight
    fetch(u.group(1), fname)
    with open(os.path.join(CACHE, fname), 'rb') as fsrc, \
         open(os.path.join(FONTS, fname), 'wb') as fdst:
        fdst.write(fsrc.read())
    rng = re.search(r'unicode-range:\s*([^;}]+)', block)
    plex_faces.append((weight, fname, rng.group(1).strip() if rng else None))
plex_faces.sort(key=lambda x: int(x[0]))
print('   가져온 굵기: %s' % ', '.join(w for w, _, _ in plex_faces))
assert plex_faces, 'IBM Plex Mono latin 블록을 못 찾았다'

# ── 빠진 글자 검사 (두 서체 합집합) ──
cover = kr_cmap | cmap_of(plex_faces[0][1])
missing = sorted(c for c in chars if ord(c) not in cover and c.strip())
if missing:
    print('   ⚠ 두 서체 어디에도 없는 글자 %d자: %s'
          % (len(missing), ''.join(missing[:60])))
else:
    print('   빠진 글자 없음 (Apple SD ∪ Plex Mono)')

only_plex = sorted(c for c in chars
                   if ord(c) not in kr_cmap and ord(c) in cover and c.strip())
if only_plex:
    print('   Plex 에서 오는 글자: %s' % ''.join(only_plex))


# ── 4. fonts/fonts.css ─────────────────────────────────────────────────
lines = ["""/* 서체 — 이 폴더 안에서만 불러온다. 외부 요청 0건.
   ============================================================
   tools/build_fonts.py 가 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다.

   Apple SD Gothic Neo 는 이 페이지가 실제로 쓰는 글자만 남긴 서브셋이다.
   화면 문구에 새 한글을 넣으면 서브셋에 없어서 시스템 서체로 떨어지므로,
   문구를 고친 뒤에는 python tools/build_fonts.py 를 다시 돌려야 한다.

   원본 다섯 벌은 패밀리 이름이 서로 달라(…NeoM00, …NeoB00) 운영체제가 굵기로
   묶어 주지 않는다. 여기서 같은 font-family 에 굵기만 달리 선언해 한 벌로 묶는다.

   IBM Plex Mono 는 라틴·숫자에만 쓰므로 latin 서브셋만 담았다.
   ============================================================ */
"""]
for weight, fname, rng in plex_faces:
    lines.append("""@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: %s;
  font-display: swap;
  src: url('%s') format('woff2');%s
}""" % (weight, fname, ('\n  unicode-range: %s;' % rng) if rng else ''))

for weight, out_name in kr_faces:
    lines.append("""@font-face {
  font-family: 'Apple SD Gothic Neo';
  font-style: normal;
  font-weight: %s;
  font-display: swap;
  src: url('%s') format('woff2');
}""" % (weight, out_name))

io.open(os.path.join(FONTS, 'fonts.css'), 'w', encoding='utf-8').write(
    '\n\n'.join(lines) + '\n')

print()
total = sum(os.path.getsize(os.path.join(FONTS, f)) for f in os.listdir(FONTS))
print('fonts/ 합계 %d bytes' % total)
for f in sorted(os.listdir(FONTS)):
    print('   %-30s %8d' % (f, os.path.getsize(os.path.join(FONTS, f))))
