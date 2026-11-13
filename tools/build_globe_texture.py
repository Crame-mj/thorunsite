"""지구본 텍스처 생성 스크립트.

평면 세계지도(world-map.webp)를 구에 감았을 때 극지방이 늘어나지 않도록 가공해서
assets/textures/world-map-globe.webp 를 만든다. (사이트에는 결과물만 쓰인다)

처리 순서
 1. 원본 지도에서 Arkeh(좌상단 섬)와 아래쪽 Yumir 띠를 지우고 주변 바다로 메운다.
 2. 지도를 메르카토르(형태 보존)로 그려진 것으로 보고 등장방형으로 재투영한다.
    위도 ±66.5° 바깥 극지방은 바다 질감으로 채운다.
 3. Arkeh를 북극 가까이(ARKEH_LAT)로 옮겨 왜곡 없이 다시 얹는다.
 4. yumir.webp(위에서 본 남극 대륙 그림)를 남극 중심에 얹는다.

실행: python3 tools/build_globe_texture.py   (numpy, Pillow 필요)
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
TEX = ROOT / 'assets' / 'textures'
SRC_MAP = TEX / 'world-map.webp'
SRC_YUMIR = TEX / 'yumir.webp'
OUT = TEX / 'world-map-globe.webp'

OW, OH = 2048, 1024                     # 출력 크기 (2:1)

# 원본 지도 좌표(px) 기준 영역
ARKEH_BOX = (0, 0, 380, 215)            # Arkeh가 들어 있는 사각형
ASHADON_ELLIPSE = (368, 248, 118, 106)  # Arkeh 근처의 Ashadon (중심 x, y, 반경 x, y) — 제외
YUMIR_BAND_BOX = (430, 765, 1530, 892)  # 아래쪽 Yumir 띠
YUMIR_BAND_EXCLUDE = (880, 740, 1030, 800)  # 그 안에서 Yidra 남쪽 끝 (제외)
OCEAN_PATCH = (1460, 640, 1784, 770)    # 깨끗한 바다 질감 샘플

ARKEH_LAT = 75.0                        # Arkeh를 옮길 위도 (중심)
YUMIR_LAND_RADIUS = 30.0                # Yumir 대륙 반경(남극에서의 각도, 도)
YUMIR_LAND_HALF_PX = 530                # yumir.webp에서 대륙 가로 반폭(px)

PHI_MAX = 2 * math.atan(math.exp(math.pi / 2)) - math.pi / 2  # 메르카토르 2:1 지도의 위도 한계 ≈ 66.5°


# ------------------------------------------------------------------ 유틸

def box1(a, r, axis, mode):
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode=mode), axis=axis)
    n = a.shape[axis]
    return (np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis) - np.take(c, np.arange(n), axis)) / (2 * r + 1)


def gblur(a, sigma, wrap_x=True):
    """박스 블러 3회로 근사한 가우시안. 가로(경도)는 순환."""
    r = max(1, int(round(sigma)))
    for _ in range(3):
        a = box1(a, r, 1, 'wrap' if wrap_x else 'edge')
        a = box1(a, r, 0, 'edge')
    return a


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def mask_from(region_mask, dilate, blur):
    im = Image.fromarray((np.clip(region_mask, 0, 1) * 255).astype(np.uint8))
    if dilate:
        im = im.filter(ImageFilter.MaxFilter(dilate))
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(im).astype(np.float32) / 255


def bilinear(img, sx, sy):
    """img(H,W,C)에서 실수 좌표 샘플. 범위 밖은 가장자리 값."""
    h, w = img.shape[:2]
    sx = np.clip(sx, 0, w - 1.001)
    sy = np.clip(sy, 0, h - 1.001)
    x0 = np.floor(sx).astype(int); y0 = np.floor(sy).astype(int)
    tx = (sx - x0)[..., None]; ty = (sy - y0)[..., None]
    a = img[y0, x0] * (1 - tx) + img[y0, x0 + 1] * tx
    b = img[y0 + 1, x0] * (1 - tx) + img[y0 + 1, x0 + 1] * tx
    return a * (1 - ty) + b * ty


def mirror_index(k, n):
    k = np.mod(k, 2 * n)
    return np.where(k < n, k, 2 * n - 1 - k)


class OceanDetail:
    """바다 패치의 고주파(물결) 성분을 거울 반복으로 어디서든 샘플링."""

    def __init__(self, patch):
        self.hf = patch - gblur(patch, 6, wrap_x=False)
        self.h, self.w = patch.shape[:2]

    def sample(self, x, y):
        xi = mirror_index(np.round(x).astype(int), self.w)
        yi = mirror_index(np.round(y).astype(int), self.h)
        return self.hf[yi, xi]


def fill_region(img, mask, ocean, dark):
    """mask(0~1) 영역을 주변 색(저주파) + 바다 물결(고주파)로 메운다. 색은 어두운 바다 픽셀(dark)에서만 가져온다."""
    known = ((mask < 0.02) & dark).astype(np.float32)
    est = np.empty_like(img)
    est[:] = (img * known[..., None]).sum(axis=(0, 1)) / known.sum()  # 최후의 대체값: 전체 바다 평균
    for sigma, th in ((200, 0.02), (80, 0.1), (30, 0.2), (10, 0.3)):  # 큰 스케일부터 덮어쓴다
        num = gblur(img * known[..., None], sigma)
        den = gblur(known, sigma)
        ok = den > th
        est[ok] = num[ok] / den[ok][:, None]
    h, w = mask.shape
    yy, xx = np.mgrid[0:h, 0:w]
    filled = est + ocean.sample(xx, yy)
    m = mask[..., None]
    return img * (1 - m) + filled * m


# ------------------------------------------------------------------ 1. 원본 정리

src = np.asarray(Image.open(SRC_MAP).convert('RGB')).astype(np.float32)
SH, SW = src.shape[:2]
ocean = OceanDetail(src[OCEAN_PATCH[1]:OCEAN_PATCH[3], OCEAN_PATCH[0]:OCEAN_PATCH[2]])

lum_soft = gblur(src.mean(axis=2), 2.5, wrap_x=False)  # 얇은 물결 선은 흐려서 무시


def region(box, exclude=None):
    m = np.zeros((SH, SW), np.float32)
    x0, y0, x1, y1 = box
    m[y0:y1, x0:x1] = 1
    if exclude:
        ex0, ey0, ex1, ey1 = exclude
        m[ey0:ey1, ex0:ex1] = 0
    return m


def outside_ellipse(cx, cy, rx, ry, feather=10):
    """타원 바깥=1, 안쪽=0, 경계는 feather(px) 폭으로 부드럽게"""
    yy, xx = np.mgrid[0:SH, 0:SW]
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    return smoothstep(1 - feather / min(rx, ry), 1, d).astype(np.float32)


arkeh_area = region(ARKEH_BOX) * outside_ellipse(*ASHADON_ELLIPSE)
arkeh_core = smoothstep(55, 110, lum_soft) * arkeh_area
arkeh_alpha = mask_from(arkeh_core, 0, 1.5) * arkeh_area                       # 옮겨 붙일 때 쓰는 부드러운 알파
# 지울 때는 번짐까지 넉넉히. 사각형으로 자르면 경계가 생기므로 Ashadon 타원만 피한다.
arkeh_remove = mask_from(smoothstep(30, 60, lum_soft) * arkeh_area, 41, 16) * outside_ellipse(*ASHADON_ELLIPSE, feather=25)
band_core = smoothstep(60, 120, lum_soft) * region(YUMIR_BAND_BOX, YUMIR_BAND_EXCLUDE)
band_remove = mask_from(band_core, 25, 10)

clean = fill_region(src, np.maximum(arkeh_remove, band_remove), ocean, lum_soft < 40)


def fix_seam(img, band=70):
    """지도 좌우 끝(경도 ±180°)이 만나는 곳의 어두운 비네팅 골을 없앤다.
    이음매 양쪽 band(px) 구간의 바다 저주파 색을 양 끝 안쪽 값 사이 선형 보간으로 바꾼다."""
    w = img.shape[1]
    ocean_px = (gblur(img.mean(axis=2), 2.5) < 45).astype(np.float32)
    lf = gblur(img * ocean_px[..., None], 8) / np.maximum(gblur(ocean_px, 8), 1e-3)[..., None]
    right_ref = gblur(lf[:, w - 1 - band][:, None], 10)[:, 0]   # 이음매 왼쪽(지도 오른쪽 끝) 안쪽 기준값
    left_ref = gblur(lf[:, band][:, None], 10)[:, 0]            # 이음매 오른쪽(지도 왼쪽 끝) 안쪽 기준값
    cols = np.r_[np.arange(w - 1 - band, w), np.arange(0, band + 1)]
    t = (np.arange(cols.size) / (cols.size - 1))[None, :, None]
    target = right_ref[:, None] * (1 - t) + left_ref[:, None] * t
    out = img.copy()
    out[:, cols] += np.maximum(target - lf[:, cols], 0)  # 어두운 골을 메우는 방향으로만 보정

    # 물결 무늬가 끊기는 부분만 이음매 바로 옆 몇 px을 서로 섞는다. (넓게 섞으면 근처 섬이 거울처럼 비친다)
    # 이음매 바로 옆은 양쪽 50:50, 안쪽으로 갈수록 원래 그림으로 돌아간다.
    xf = 8
    s = (0.5 + 0.5 * smoothstep(0, 1, np.arange(xf) / xf))[None, :, None]
    left = out[:, :xf].copy()
    right = out[:, w - xf:][:, ::-1].copy()  # right[:, k] = 이음매에서 k번째 (지도 오른쪽 끝부터)
    out[:, :xf] = left * s + right * (1 - s)
    out[:, w - xf:] = (right * s + left * (1 - s))[:, ::-1]
    return out


clean = fix_seam(clean)

# ------------------------------------------------------------------ 2. 재투영

lat = math.pi / 2 - (np.arange(OH) + 0.5) / OH * math.pi
lon = -math.pi + (np.arange(OW) + 0.5) / OW * 2 * math.pi
LAT, LON = np.meshgrid(lat, lon, indexing='ij')

merc_y = np.log(np.tan(math.pi / 4 + np.clip(LAT, -PHI_MAX, PHI_MAX) / 2))
sy = (math.pi / 2 - merc_y) / math.pi * SH - 0.5
sx = (LON + math.pi) / (2 * math.pi) * SW - 0.5
# 가로 순환 샘플을 위해 오른쪽에 첫 열을 붙인다
clean_wrap = np.concatenate([clean, clean[:, :1]], axis=1)
out = bilinear(clean_wrap, np.mod(sx, SW), sy)

# 극지방: 경계 색을 가로로 흐려 단색으로 수렴시키고, 극 중심 좌표계로 물결 질감을 입힌다
CAP_FADE = math.radians(12)
for pole in (1, -1):
    rows = np.where((np.abs(lat) >= PHI_MAX) & (np.sign(lat) == pole))[0]
    edge = rows[-1] + 1 if pole == 1 else rows[0] - 1
    edge_row = gblur(out[edge][None], 60)[0]
    cap = edge_row.mean(axis=0)
    t = smoothstep(0, 1, (np.abs(lat[rows]) - PHI_MAX) / CAP_FADE)[:, None, None]
    base = edge_row[None] * (1 - t) + cap[None, None] * t
    r = (math.pi / 2 - np.abs(LAT[rows])) * 180 / math.pi * 9.0  # 극에서의 거리(px 단위)
    px, py = r * np.cos(LON[rows]), r * np.sin(LON[rows])
    out[rows] = base + ocean.sample(px + 4000, py + 4000)

# ------------------------------------------------------------------ 3, 4. 극 근처 오버레이

V = np.stack([np.cos(LAT) * np.cos(LON), np.cos(LAT) * np.sin(LON), np.sin(LAT)], axis=-1)


def overlay(dst, img, alpha, center, up, ppd, cx, cy, max_deg):
    """img를 구면 위 center에 '위쪽=up' 방향으로 붙인다 (방위 등거리 투영, ppd: 도당 px)."""
    right = np.cross(up, center)
    dot = np.clip(V @ center, -1, 1)
    d = np.degrees(np.arccos(dot))
    sel = d < max_deg
    tv = V[sel] - dot[sel][:, None] * center
    n = np.linalg.norm(tv, axis=1, keepdims=True)
    tv = np.divide(tv, n, out=np.zeros_like(tv), where=n > 1e-9)
    x = d[sel] * (tv @ right)
    y = d[sel] * (tv @ up)
    ix = cx + x * ppd
    iy = cy - y * ppd
    h, w = img.shape[:2]
    inside = ((ix >= 0) & (ix <= w - 1) & (iy >= 0) & (iy <= h - 1)).astype(np.float32)[:, None]
    col = bilinear(img, ix, iy)
    a = bilinear(alpha[..., None], ix, iy) * inside
    dst[sel] = dst[sel] * (1 - a) + col * a


# Arkeh: 원래 위치의 메르카토르 축척으로 잘라서 북쪽으로 이동
ys, xs = np.nonzero(arkeh_core > 0.5)
acx, acy = xs.mean(), ys.mean()
a_lon = acx / SW * 2 * math.pi - math.pi
a_lat0 = 2 * math.atan(math.exp(math.pi / 2 - acy / SH * math.pi)) - math.pi / 2
ppd_arkeh = (SW / 360) / math.cos(a_lat0)  # 원래 위치에서 실제 1도(호)당 px
a_lat = math.radians(ARKEH_LAT)
center = np.array([math.cos(a_lat) * math.cos(a_lon), math.cos(a_lat) * math.sin(a_lon), math.sin(a_lat)])
north = np.array([0.0, 0.0, 1.0])
up = north - (north @ center) * center
up /= np.linalg.norm(up)
overlay(out, src, arkeh_alpha, center, up, ppd_arkeh, acx, acy, 40)

# Yumir: 남극 중심, 그림 위쪽이 경도 0°(지도 가운데) 방향
yimg = np.asarray(Image.open(SRC_YUMIR).convert('RGB')).astype(np.float32)
yh, yw = yimg.shape[:2]
ylum = gblur(yimg.mean(axis=2), 2.5, wrap_x=False)
y_alpha = mask_from(smoothstep(45, 100, ylum), 31, 14)
# 그림 가장자리에서는 반드시 0이 되도록
edge_fade = np.minimum.outer(smoothstep(0, 40, np.arange(yh)) * smoothstep(0, 40, yh - 1 - np.arange(yh)),
                             smoothstep(0, 40, np.arange(yw)) * smoothstep(0, 40, yw - 1 - np.arange(yw)))
y_alpha *= edge_fade
overlay(out, yimg, y_alpha, np.array([0.0, 0.0, -1.0]), np.array([1.0, 0.0, 0.0]),
        YUMIR_LAND_HALF_PX / YUMIR_LAND_RADIUS, yw / 2, yh / 2, 60)

Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT, quality=90)
print('saved', OUT, f'(Arkeh {math.degrees(a_lat0):.1f}° → {ARKEH_LAT}°)')
