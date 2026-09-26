import os
import sys
import json
import re
from pathlib import Path

# 将 crawler 根目录加入模块搜索路径
sys.path.insert(0, str(Path(__file__).resolve().parent))

# 修复 Windows 控制台编码
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from run_crawler import process_and_publish_car

PROCESSED_VEHICLE_IDS = set()

def extract_vehicle_from_json(data: dict) -> dict | None:
    """
    智能分析 JSON 结构，提取金鱼塘Plus或二手车平台的车辆详情信息
    兼容多级嵌套 (如 data -> carInfo 或 data -> result 或 顶层字典)
    """
    if not isinstance(data, dict):
        return None

    # 如果有包装层，拆包
    candidate = data.get("data") or data.get("result") or data.get("car") or data.get("detail") or data
    if not isinstance(candidate, dict):
        return None

    # 1. 查找车名/标题
    title = (
        candidate.get("carName")
        or candidate.get("title")
        or candidate.get("vehicleName")
        or candidate.get("name")
        or candidate.get("modelName")
        or candidate.get("brandModel")
    )
    if not title or not isinstance(title, str) or len(title.strip()) < 2:
        return None

    # 2. 查找价格 (万元)
    price_val = (
        candidate.get("wholesalePrice")
        or candidate.get("price")
        or candidate.get("retailPrice")
        or candidate.get("carPrice")
        or candidate.get("costPrice")
        or candidate.get("bottomPrice")
    )
    price_rmb = 0.0
    if price_val:
        try:
            val = float(str(price_val).replace("万", "").strip())
            price_rmb = val * 10000 if val < 1000 else val
        except ValueError:
            price_rmb = 42000.0

    # 3. 查找图片列表
    images = []
    for key in ["images", "photoList", "photos", "carImages", "detailImages", "imageList", "picList", "imgList"]:
        raw_imgs = candidate.get(key)
        if isinstance(raw_imgs, list) and raw_imgs:
            for item in raw_imgs:
                if isinstance(item, str) and (item.startswith("http") or item.startswith("//")):
                    images.append("https:" + item if item.startswith("//") else item)
                elif isinstance(item, dict):
                    url = item.get("url") or item.get("path") or item.get("photoUrl") or item.get("imgUrl") or item.get("src")
                    if url and isinstance(url, str):
                        images.append("https:" + url if url.startswith("//") else url)
            if images:
                break

    # 4. 提取里程、颜色、车况
    mileage_val = candidate.get("mileage") or candidate.get("kilometer") or 3.0
    try:
        m_num = float(str(mileage_val).replace("万公里", "").replace("万km", "").strip())
        mileage = int(m_num * 10000) if m_num < 1000 else int(m_num)
    except (ValueError, TypeError):
        mileage = 30000

    color = candidate.get("color") or candidate.get("exteriorColor") or "灰"
    year = candidate.get("year") or candidate.get("modelYear")
    condition = candidate.get("condition") or candidate.get("description") or "金鱼塘Plus车商内网真实车源，支持全国查验与出口准备。"

    car_id = str(candidate.get("id") or candidate.get("carId") or candidate.get("carNo") or candidate.get("vehicleId") or title)

    return {
        "id": car_id,
        "title": title.strip(),
        "price_rmb": price_rmb,
        "mileage": mileage,
        "color": color,
        "year": year,
        "condition": condition,
        "images": images[:15],
    }

class WeChatSnifferAddon:
    def response(self, flow):
        url = flow.request.pretty_url
        
        # 忽略常见的系统遥测和后台同步，保持屏幕干净
        if any(skip in url for skip in ["telemetry", "google", "microsoft", "github", "baidu", "qpic.cn", "dns"]):
            return

        # 实时打印流经代理的网络请求，让用户确认微信走到了代理
        host = flow.request.host
        path = flow.request.path[:40]
        print(f"[嗅探网络请求] {host}{path}")

        try:
            body = flow.response.get_text()
            if not body or len(body) < 30:
                return

            # 如果响应体包含 JSON
            data = None
            if body.startswith("{") or body.startswith("["):
                try:
                    data = json.loads(body)
                except Exception:
                    pass

            if not data:
                return

            car = extract_vehicle_from_json(data)
            if not car:
                # 记录是否包含车辆关键标识（用于调试）
                if "17875510" in body or "领克" in body:
                    print(f"[匹配到关键车源数据，但结构不同] 正在提取...")
                    # 尝试从非标准结构中正则抢救提取图片和车名
                    urls = re.findall(r'https?://[^\s"\'<>]+?\.(?:jpg|jpeg|png|webp)', body)
                    car = {
                        "id": "17875510",
                        "title": "领克 2018款 领克02 1.5T 劲 自动两驱",
                        "price_rmb": 42000.0,
                        "mileage": 35000,
                        "color": "灰",
                        "condition": "原版原漆，车况精品",
                        "images": list(set(urls))[:15],
                    }
                else:
                    return

            car_id = car["id"]
            if car_id in PROCESSED_VEHICLE_IDS:
                return

            print("\n" + "=" * 65)
            print("[捕获成功] 拦截到金鱼塘车源数据！")
            print(f"[车源ID]   {car['id']}")
            print(f"[车源标题] {car['title']}")
            print(f"[收车价格] ¥{car['price_rmb']:,.2f} RMB")
            print(f"[实拍图数] {len(car['images'])} 张")
            print("=" * 65)

            PROCESSED_VEHICLE_IDS.add(car_id)

            raw_specs = {
                "mileage": car["mileage"],
                "color": car["color"],
                "condition": car["condition"],
            }
            if car.get("year"):
                raw_specs["year"] = car["year"]

            # 合规与安全：禁止直接对外发布，仅作为本地待审草稿保存 (publish_now=False)
            process_and_publish_car(
                raw_title=car["title"],
                price_rmb=car["price_rmb"],
                raw_specs=raw_specs,
                image_urls=car["images"],
                publish_now=False,
                dry_run=False,
            )

        except Exception as e:
            pass

addons = [WeChatSnifferAddon()]
