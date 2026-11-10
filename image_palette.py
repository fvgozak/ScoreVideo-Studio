"""Album artwork palette extraction, adapted from user-supplied Hemio Image Studio.
Original hue grouping, neutral detection and weighted palette algorithm are preserved.
The ScoreVideo-specific color harmonies are added below.
"""
import colorsys
import math
from PIL import Image, ImageOps

def clamp(value, low, high):
    return max(low, min(high, value))


def to_hex(r, g, b):
    return "#{:02X}{:02X}{:02X}".format(round(r), round(g), round(b))


def hsv_to_hex(h, s, v):
    rgb = colorsys.hsv_to_rgb(
        (h % 360) / 360,
        clamp(s, 0, 1),
        clamp(v, 0, 1),
    )
    return to_hex(*(255 * c for c in rgb))


def color_family(h):
    if h < 35 or h >= 340:
        return "붉은색"
    if h < 65:
        return "주황색"
    if h < 100:
        return "노란색"
    if h < 165:
        return "초록색"
    if h < 190:
        return "청록색"
    if h < 245:
        return "파란색"
    if h < 295:
        return "보라색"
    return "분홍색"


def tone_color(name, hue, saturation):
    if name == "붉은색":
        hue = (hue - 16) % 360
        s = clamp(saturation * 1.41, 0.38, 0.53)
        v = 0.575
    elif name == "파란색":
        hue = (hue - 5) % 360
        s = clamp(saturation * 1.46, 0.30, 0.46)
        v = 0.48
    elif name == "청록색":
        s = clamp(saturation * 1.55, 0.30, 0.47)
        v = 0.49
    else:
        s = clamp(saturation * 1.45, 0.28, 0.50)
        v = 0.62 if name in ("노란색", "주황색") else 0.54
    return hsv_to_hex(hue, s, v)


def extract_cover_palette(cover):
    image = ImageOps.exif_transpose(cover).convert("RGBA")
    white = Image.new("RGBA", image.size, (255, 255, 255, 255))
    image = Image.alpha_composite(white, image).convert("RGB")
    image.thumbnail((160, 160), Image.Resampling.LANCZOS)

    groups = {}
    bright_count = 0
    bright_sum = [0, 0, 0]
    total = image.width * image.height

    pixels = image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()
    for r, g, b in pixels:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        degrees = h * 360

        if s < 0.135 and v > 0.68:
            bright_count += 1
            bright_sum[0] += r
            bright_sum[1] += g
            bright_sum[2] += b

        if s < 0.125 or v < 0.13 or v > 0.95:
            continue

        name = color_family(degrees)
        stat = groups.setdefault(name, [0.0, 0.0, 0.0, 0.0])
        weight = (s ** 1.2) * (0.3 + v)
        radians = math.radians(degrees)

        stat[0] += weight
        stat[1] += weight * math.sin(radians)
        stat[2] += weight * math.cos(radians)
        stat[3] += weight * s

    neutral_hex = None
    if bright_count:
        mean = tuple(n / bright_count / 255 for n in bright_sum)
        hue, sat, _ = colorsys.rgb_to_hsv(*mean)
        neutral_hex = hsv_to_hex(hue * 360 + 12, sat * 0.95, 0.81)

    candidates = []
    for name, (score, sine, cosine, sat_sum) in groups.items():
        if score < 0.5:
            continue
        hue = math.degrees(math.atan2(sine, cosine)) % 360
        saturation = sat_sum / score
        candidates.append({
            "name": name,
            "hex": tone_color(name, hue, saturation),
            "score": score,
        })

    candidates.sort(key=lambda c: c["score"], reverse=True)

    if bright_count / total > 0.68 and neutral_hex:
        candidates.insert(0, {
            "name": "밝은 중성색",
            "hex": neutral_hex,
            "score": 999999,
        })
    elif neutral_hex:
        candidates.append({
            "name": "밝은 중성색",
            "hex": neutral_hex,
            "score": -1,
        })

    if not candidates:
        candidates = [{"name": "중성 회색", "hex": "#777774", "score": 1}]

    unique = []
    seen = set()
    for candidate in candidates:
        if candidate["hex"] not in seen:
            unique.append({
                "name": candidate["name"],
                "hex": candidate["hex"],
            })
            seen.add(candidate["hex"])

    return unique[:6]


def _hsl_color(hue, saturation, lightness):
    r,g,b = colorsys.hls_to_rgb((hue%360)/360, clamp(lightness,0,1), clamp(saturation,0,1))
    return to_hex(255*r,255*g,255*b)


def _luminance(color):
    numbers=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    v=[n/12.92 if n<=0.04045 else ((n+0.055)/1.055)**2.4 for n in numbers]
    return .2126*v[0]+.7152*v[1]+.0722*v[2]


def contrast_ratio(a,b):
    a,b=sorted((_luminance(a),_luminance(b)))
    return (b+0.05)/(a+0.05)


def _hsl(hexcolor):
    r,g,b=[int(hexcolor[i:i+2],16)/255 for i in (1,3,5)]
    h,l,s=colorsys.rgb_to_hls(r,g,b)
    return h*360,s,l


def _opposite(h,s,l):
    return _hsl_color(h+158,max(.65,s),l)


def _scheme(name,description,main,secondary,kind):
    h,s,_=_hsl(main)
    h2,s2,_=_hsl(secondary)
    if kind=='paper':
        paper=_hsl_color(h, .12, .97)
        ink=_hsl_color(h, .18, .12)
        staff=_hsl_color(h, .16, .32)
        accent=_hsl_color(h, max(.6,s), .39)
        glow=_hsl_color(h2,max(.68,s2),.57)
        panel=_hsl_color(h,.18,.96)
        panel_opacity=.82
    elif kind=='dark':
        paper=_hsl_color(h,.27,.10)
        ink=_hsl_color(h,.12,.94)
        staff=_hsl_color(h,.19,.69)
        accent=_hsl_color(h,max(.65,s),.72)
        glow=_hsl_color(h2,max(.72,s2),.73)
        panel=_hsl_color(h,.23,.08)
        panel_opacity=.72
    elif kind=='muted':
        paper=_hsl_color(h2,.20,.90)
        ink=_hsl_color(h,.25,.18)
        staff=_hsl_color(h,.18,.36)
        accent=_hsl_color(h,max(.48,s*.83),.41)
        glow=_hsl_color(h2,max(.55,s2*.9),.57)
        panel=_hsl_color(h2,.14,.95)
        panel_opacity=.76
    else:
        paper=_hsl_color(h,.32,.15)
        ink=_hsl_color(h2,.09,.96)
        staff=_hsl_color(h2,.14,.76)
        accent=_hsl_color(h,max(.75,s),.75)
        glow=_hsl_color(h2,max(.83,s2),.73)
        panel=_hsl_color(h,.32,.12)
        panel_opacity=.83
    if contrast_ratio(paper,ink)<7:
        ink='#151A20' if _luminance(paper)>.5 else '#F8FAFD'
    if contrast_ratio(paper,staff)<3:
        staff='#47505B' if _luminance(paper)>.5 else '#AEB8C5'
    upper=_hsl_color(h,max(.72,s),.66 if _luminance(paper)<.5 else .45)
    lower=_hsl_color(h+145,max(.69,s2),.68 if _luminance(paper)<.5 else .43)
    return {'id':kind,'name':name,'description':description,
        'colors':{'paper':paper,'ink':ink,'staff':staff,'accent':accent,'glow':glow,'cursor':accent,
                  'trail_upper':upper,'trail_lower':lower,
                  'aurora_low':_hsl_color(h+160,.80,.62),'aurora_high':_hsl_color(h-14,.86,.58),
                  'panel':panel},'panel_opacity':panel_opacity,
        'contrast':round(contrast_ratio(paper,ink),2)}


def propose_score_palettes(image):
    """Return user's dominant colors + four legible score themes. No data leaves this computer."""
    palette=extract_cover_palette(image)
    colorful=[v for v in palette if '중성' not in v['name']]
    main=(colorful or palette)[0]['hex']
    h,s,l=_hsl(main)
    secondary=colorful[1]['hex'] if len(colorful)>1 else _hsl_color(h+160,max(.7,s),.56)
    schemes=[_scheme('Gallery Paper','가독성 높은 밝은 악보',main,secondary,'paper'),
             _scheme('Midnight','사진에 어울리는 어두운 악보',main,secondary,'dark'),
             _scheme('Soft Canvas','절제된 색감과 따뜻한 질감',main,secondary,'muted'),
             _scheme('Vivid Contrast','선명한 음표와 색채 대비',main,secondary,'vivid')]
    return {'palette':palette,'schemes':schemes,'primary':main}
