import re
import json
import time
from typing import Optional
from playwright.sync_api import sync_playwright

class JinyutangCrawler:
    """
    金鱼塘 (Jinyutang) 车源采集器
    支持三种采集形态：
    1. H5分享页面 (Playwright 无头渲染抓取)
    2. 车商一键复制的文本详情
    3. 金鱼塘 App / 微信小程序抓包 JSON 数据
    """

    def crawl_share_url(self, url: str) -> dict:
        """
        使用 Playwright 打开金鱼塘分享网页/H5，提取车源标题、价格、参数及所有高清实拍图
        """
        print(f"[JinyutangCrawler] 启动无头浏览器，访问: {url}")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 430, "height": 932}, # 模拟移动端屏幕
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.38(0x1800262c) NetType/WIFI Language/zh_CN",
            )
            page = context.new_page()
            
            try:
                page.goto(url, wait_until="networkidle", timeout=30000)
            except Exception as e:
                print(f"[JinyutangCrawler] 页面加载等待超时，尝试继续解析: {e}")

            time.sleep(2)  # 等待动态图片懒加载

            # 滚动页面以触发所有懒加载图片
            page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)")
            time.sleep(1)
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(1)

            # 1. 提取标题
            title = ""
            for selector in [".car-title", ".title", "h1", "h2", ".vehicle-name", ".car_name"]:
                if page.locator(selector).count() > 0:
                    title = page.locator(selector).first.inner_text().strip()
                    if title:
                        break
            if not title:
                title = page.title()

            # 2. 提取价格 (万元 -> RMB元)
            price_rmb = 0.0
            price_text = ""
            for selector in [".price", ".car-price", ".wholesale-price", ".cost", "span:has-text('万')"]:
                if page.locator(selector).count() > 0:
                    candidate = page.locator(selector).first.inner_text().strip()
                    m = re.search(r"([\d\.]+)\s*万", candidate)
                    if m:
                        price_rmb = float(m.group(1)) * 10000
                        price_text = candidate
                        break

            # 3. 提取里程、上牌年份等参数
            body_text = page.locator("body").inner_text()
            
            mileage = 30000
            m_mile = re.search(r"([\d\.]+)\s*(?:万公里|万km)", body_text, re.IGNORECASE)
            if m_mile:
                mileage = int(float(m_mile.group(1)) * 10000)
            else:
                m_km = re.search(r"(\d+)\s*(?:公里|km)", body_text, re.IGNORECASE)
                if m_km:
                    mileage = int(m_km.group(1))

            # 4. 提取车身颜色
            color = "白"
            for c in ["黑", "白", "灰", "银", "红", "蓝", "金", "棕", "绿", "橙"]:
                if f"{c}色" in body_text or f"外观{c}" in body_text:
                    color = c
                    break

            # 5. 抓取图片 URLs
            image_urls = []
            img_elements = page.query_selector_all("img")
            for img in img_elements:
                src = img.get_attribute("src") or img.get_attribute("data-src") or img.get_attribute("data-original")
                if not src:
                    continue
                # 过滤明显不是车图的图标、logo、头像、base64微缩图
                if any(ext in src.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"]) or "image" in src.lower():
                    if not any(skip in src.lower() for skip in ["avatar", "icon", "logo", "qr", "emoji"]):
                        # 补全相对协议
                        if src.startswith("//"):
                            src = "https:" + src
                        if src not in image_urls:
                            image_urls.append(src)

            browser.close()

            print(f"[JinyutangCrawler] 抓取完成: 标题: '{title}', 价格: {price_rmb}元, 提取到图片: {len(image_urls)}张")

            return {
                "raw_title": title,
                "price_rmb": price_rmb,
                "raw_specs": {
                    "mileage": mileage,
                    "color": color,
                    "condition": "原版原漆，车况精品，支持第三方检测（金鱼塘真实车源）",
                },
                "image_urls": image_urls[:15],
            }

    def parse_copy_text(self, text: str, image_urls: list[str] = None) -> dict:
        """
        从车商复制的金鱼塘车源文案中提取信息（无需无头浏览器，秒级完成）
        例如：
        【金鱼塘车源】2021款 哈弗H6 1.5T 自动两驱Max
        上牌：2021年6月
        表显：3.2万公里
        批发价：5.68万
        车况：原版原漆，一手私家车
        """
        lines = [line.strip() for line in text.strip().split("\n") if line.strip()]
        raw_title = lines[0] if lines else "精品二手车"
        raw_title = re.sub(r"【.*?】", "", raw_title).strip()

        price_rmb = 50000.0
        m_price = re.search(r"([\d\.]+)\s*万", text)
        if m_price:
            price_rmb = float(m_price.group(1)) * 10000

        mileage = 30000
        m_mile = re.search(r"([\d\.]+)\s*万公里", text)
        if m_mile:
            mileage = int(float(m_mile.group(1)) * 10000)

        # 匹配颜色
        color = "白"
        for c in ["黑", "白", "灰", "银", "红", "蓝", "金", "棕", "绿", "橙"]:
            if c in text:
                color = c
                break

        return {
            "raw_title": raw_title,
            "price_rmb": price_rmb,
            "raw_specs": {
                "mileage": mileage,
                "color": color,
                "condition": "一手私家车，无重大事故，无火烧泡水，支持跨境独立检测。",
            },
            "image_urls": image_urls or [],
        }

    def parse_api_json(self, json_data: dict) -> dict:
        """
        直接解析金鱼塘 App 抓包 JSON 数据
        """
        title = json_data.get("carName") or json_data.get("title") or "中国精选二手车"
        price = float(json_data.get("price") or json_data.get("wholesalePrice") or 5.0) * 10000
        mileage = int(float(json_data.get("mileage") or 3.0) * 10000)
        images = json_data.get("images") or json_data.get("photoList") or []
        
        return {
            "raw_title": title,
            "price_rmb": price,
            "raw_specs": {
                "mileage": mileage,
                "color": json_data.get("color", "白"),
                "year": json_data.get("year", 2022),
                "condition": json_data.get("description", "检测合格车源"),
            },
            "image_urls": images[:15],
        }
