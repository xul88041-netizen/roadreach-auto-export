import os
import io
import requests
from PIL import Image, ImageDraw, ImageFont
from config import (
    IMAGE_MAX_WIDTH,
    IMAGE_QUALITY,
    OUTPUT_FORMAT,
    WATERMARK_ENABLED,
    WATERMARK_TEXT,
    WATERMARK_SUBTEXT,
)

def download_image(url: str, timeout: int = 15) -> bytes:
    """下载图片或读取本地文件二进制数据"""
    if os.path.isfile(url):
        with open(url, "rb") as f:
            return f.read()

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": "https://www.jytche.com/",
    }
    response = requests.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response.content

def process_vehicle_image(
    image_bytes: bytes,
    crop_bottom_percent: float = 0.0,
    add_watermark: bool = WATERMARK_ENABLED
) -> bytes:
    """
    对汽车图片进行全套清洗与优化：
    1. 去除元数据并矫正方向
    2. 按需裁剪底部残留水印
    3. 等比缩放至最大宽度 (1600px)
    4. 加盖 RoadReach Auto Export 专业半透明品牌水印
    5. 转换为高压缩率、极速加载的 WebP 格式
    """
    image = Image.open(io.BytesIO(image_bytes))
    if image.mode in ("RGBA", "P"):
        image = image.convert("RGB")

    width, height = image.size

    # 1. 裁剪底部原平台可能存在的水印 (例如去掉底部 3% 高度)
    if crop_bottom_percent > 0:
        new_height = int(height * (1.0 - crop_bottom_percent))
        image = image.crop((0, 0, width, new_height))
        width, height = image.size

    # 2. 等比缩放
    if width > IMAGE_MAX_WIDTH:
        new_w = IMAGE_MAX_WIDTH
        new_h = int(height * (new_w / width))
        image = image.resize((new_w, new_h), Image.Resampling.LANCZOS)
        width, height = image.size

    # 3. 盖印 RoadReach Auto Export 专业半透明防伪品牌标
    if add_watermark:
        image = _draw_watermark_badge(image, WATERMARK_TEXT, WATERMARK_SUBTEXT)

    # 4. 转为 WebP 字节
    output_buffer = io.BytesIO()
    image.save(output_buffer, format=OUTPUT_FORMAT, quality=IMAGE_QUALITY, method=6)
    return output_buffer.getvalue()

def _draw_watermark_badge(image: Image.Image, main_text: str, sub_text: str) -> Image.Image:
    """
    在图片右下角绘制半透明的高级质感胶囊徽章（Badge），
    既遮挡原网站可能的右下角LOGO，又极大增加海外出口车源的官方正规感。
    """
    width, height = image.size
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # 动态计算字体大小
    font_size_main = max(16, int(width * 0.022))
    font_size_sub = max(10, int(font_size_main * 0.65))

    try:
        font_main = ImageFont.truetype("arial.ttf", font_size_main)
        font_sub = ImageFont.truetype("arial.ttf", font_size_sub)
    except IOError:
        font_main = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    # 测量文本
    bbox_main = draw.textbbox((0, 0), main_text, font=font_main)
    main_w = bbox_main[2] - bbox_main[0]
    main_h = bbox_main[3] - bbox_main[1]

    bbox_sub = draw.textbbox((0, 0), sub_text, font=font_sub)
    sub_w = bbox_sub[2] - bbox_sub[0]
    sub_h = bbox_sub[3] - bbox_sub[1]

    content_w = max(main_w, sub_w)
    padding_x = int(font_size_main * 0.8)
    padding_y = int(font_size_main * 0.5)

    badge_w = content_w + padding_x * 2
    badge_h = main_h + sub_h + padding_y * 2 + 4

    margin_right = int(width * 0.03)
    margin_bottom = int(height * 0.04)

    x1 = width - margin_right - badge_w
    y1 = height - margin_bottom - badge_h
    x2 = x1 + badge_w
    y2 = y1 + badge_h

    # 绘制深蓝微透背景 (#071826，匹配 RoadReach 品牌主色)
    bg_color = (7, 24, 38, 195)
    border_color = (255, 255, 255, 90)
    draw.rounded_rectangle([x1, y1, x2, y2], radius=8, fill=bg_color, outline=border_color, width=1)

    # 绘制品牌文字
    text_main_x = x1 + (badge_w - main_w) // 2
    text_main_y = y1 + padding_y
    draw.text((text_main_x, text_main_y), main_text, font=font_main, fill=(255, 255, 255, 245))

    text_sub_x = x1 + (badge_w - sub_w) // 2
    text_sub_y = text_main_y + main_h + 4
    draw.text((text_sub_x, text_sub_y), sub_text, font=font_sub, fill=(255, 180, 0, 240)) # 金色副标

    # 混合原图与覆盖层
    return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
