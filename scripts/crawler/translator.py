import re

BRAND_MAP = {
    "哈弗": "Haval",
    "长城": "GWM",
    "坦克": "Tank",
    "比亚迪": "BYD",
    "吉利": "Geely",
    "长安": "Changan",
    "奇瑞": "Chery",
    "星途": "Exeed",
    "捷途": "Jetour",
    "红旗": "Hongqi",
    "领克": "Lynk & Co",
    "极氪": "Zeekr",
    "理想": "Li Auto",
    "蔚来": "NIO",
    "小鹏": "XPENG",
    "广汽传祺": "GAC Trumpchi",
    "传祺": "GAC Trumpchi",
    "广汽埃安": "GAC Aion",
    "埃安": "Aion",
    "东风": "Dongfeng",
    "上汽大通": "Maxus",
    "大通": "Maxus",
    "五菱": "Wuling",
    "宝骏": "Baojun",
    "丰田": "Toyota",
    "本田": "Honda",
    "日产": "Nissan",
    "大众": "Volkswagen",
    "现代": "Hyundai",
    "起亚": "Kia",
    "别克": "Buick",
    "雪佛兰": "Chevrolet",
    "福特": "Ford",
    "宝马": "BMW",
    "奔驰": "Mercedes-Benz",
    "奥迪": "Audi",
    "保时捷": "Porsche",
    "特斯拉": "Tesla",
    "路虎": "Land Rover",
    "捷豹": "Jaguar",
    "沃尔沃": "Volvo",
}

BODY_MAP = [
    (r"SUV|越野", "SUV"),
    (r"轿车|三厢|两厢|掀背", "Sedan"),
    (r"MPV|商务车", "MPV"),
    (r"皮卡", "Pickup"),
    (r"跑车|轿跑", "Coupe"),
    (r"微面|客车|轻客", "Van"),
]

FUEL_MAP = [
    (r"纯电动|EV|电动", "EV"),
    (r"插电混动|PHEV|增程|DM-i|DM-p|Hi4|EM-P", "PHEV"),
    (r"油电混动|HEV|双擎", "Hybrid"),
    (r"柴油", "Diesel"),
    (r"汽油|燃油|T|L", "Gasoline"),
]

COLOR_MAP = {
    "黑": ("Black", "Черный"),
    "白": ("White", "Белый"),
    "灰": ("Grey", "Серый"),
    "银": ("Silver", "Серебристый"),
    "红": ("Red", "Красный"),
    "蓝": ("Blue", "Синий"),
    "金": ("Gold", "Золотистый"),
    "棕": ("Brown", "Коричневый"),
    "绿": ("Green", "Зеленый"),
    "橙": ("Orange", "Оранжевый"),
    "黄": ("Yellow", "Желтый"),
    "紫": ("Purple", "Фиолетовый"),
}

def normalize_vehicle_info(raw_title: str, raw_specs: dict) -> dict:
    """
    将国内车商网站提取的原始中文信息，标准化为国际出口展厅格式
    """
    title = raw_title.strip()
    
    # 1. 匹配品牌
    brand_en = "Other"
    matched_cn_brand = ""
    for cn_brand, en_brand in BRAND_MAP.items():
        if title.startswith(cn_brand) or f" {cn_brand} " in f" {title} ":
            brand_en = en_brand
            matched_cn_brand = cn_brand
            break
            
    # 2. 匹配年份 (例如: 2021款, 21款, 2020年)
    year = 2022
    year_match = re.search(r"(201\d|202\d)款?", title)
    if year_match:
        year = int(year_match.group(1))
    elif "year" in raw_specs and str(raw_specs["year"]).isdigit():
        year = int(raw_specs["year"])

    # 3. 提取车型 Model (剔除品牌和年份后的大体车系名)
    clean_title = title
    if matched_cn_brand:
        clean_title = clean_title.replace(matched_cn_brand, "").strip()
    clean_title = re.sub(r"20\d\d款?", "", clean_title).strip()
    
    # 取前两到三个特征词作为 Model
    model_parts = clean_title.split()
    model_en = " ".join(model_parts[:3]) if model_parts else "Standard"

    # 4. 识别车身形式
    body_type = "SUV"
    for pattern, b_type in BODY_MAP:
        if re.search(pattern, title, re.IGNORECASE):
            body_type = b_type
            break

    # 5. 识别燃油形式 (避免车况描述里的'电动座椅/电动天窗'误判为纯电动)
    fuel_type = "Gasoline"
    # 先判断纯电与插混 (必须匹配独立的纯电/EV标识)
    powertrain_text = f"{title} {raw_specs.get('fuel_type', '')} {raw_specs.get('engine', '')}"
    if re.search(r"纯电动|纯电|\bEV\b|BEV", powertrain_text, re.IGNORECASE):
        fuel_type = "EV"
    elif re.search(r"插电混动|PHEV|增程式?|DM-i|DM-p|Hi4|EM-P", powertrain_text, re.IGNORECASE):
        fuel_type = "PHEV"
    elif re.search(r"油电混动|\bHEV\b|双擎", powertrain_text, re.IGNORECASE):
        fuel_type = "Hybrid"
    elif re.search(r"柴油", powertrain_text):
        fuel_type = "Diesel"
    else:
        fuel_type = "Gasoline"

    # 6. 里程与颜色
    mileage = raw_specs.get("mileage")
    if isinstance(mileage, str):
        # 处理例如 "3.5万公里" -> 35000
        num_match = re.search(r"([\d\.]+)", mileage)
        if num_match:
            val = float(num_match.group(1))
            mileage = int(val * 10000) if "万" in mileage else int(val)
    elif not mileage:
        mileage = 30000

    raw_color = raw_specs.get("color", "白")
    color_en, color_ru = "White", "Белый"
    for k, (c_en, c_ru) in COLOR_MAP.items():
        if k in raw_color:
            color_en, color_ru = c_en, c_ru
            break

    # 7. 自动生成英文与俄文出口简介 (Notes)
    notes_en = f"Inspected {year} {brand_en} {model_en} in clean condition. Left-hand drive (LHD), ready for international export. Full inspection evidence and shipping quotation to your destination port available upon request."
    notes_ru = f"Проверенный автомобиль {year} {brand_en} {model_en} в отличном техническом состоянии. Левый руль (LHD), готов к экспорту из Китая. Доступен полный отчет об инспекции и расчет доставки в ваш порт."

    return {
        "brand": brand_en,
        "model": model_en,
        "year": year,
        "body_type": body_type,
        "fuel_type": fuel_type,
        "steering": "LHD",
        "mileage": mileage,
        "exterior_color": color_en,
        "interior_color": "Black",
        "vehicle_notes_en": notes_en,
        "vehicle_notes_ru": notes_ru,
        "condition": raw_specs.get("condition", "Verified accident-free, full service records, export ready."),
    }
