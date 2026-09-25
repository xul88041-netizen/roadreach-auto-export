import requests
from config import (
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    STORAGE_BUCKET,
    DEFAULT_EXCHANGE_RATE,
    DOMESTIC_TRANSPORT_COST_RMB,
    EXPORT_DOCUMENT_COST_RMB,
    PORT_LOADING_COST_RMB,
    REFURBISHMENT_COST_RMB,
    TARGET_PROFIT_RMB,
    DEFAULT_PUBLICATION_STATUS,
    DEFAULT_SOURCING_STATUS,
)

class SupabasePublisher:
    def __init__(self, base_url: str = SUPABASE_URL, key: str = SUPABASE_SERVICE_KEY):
        self.base_url = base_url.rstrip("/")
        self.key = key
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def generate_next_stock_id(self) -> str:
        """获取最新的 Stock ID 并自动递增 (例如 RR-0002 -> RR-0003)"""
        url = f"{self.base_url}/rest/v1/vehicles?select=stock_id&order=created_at.desc&limit=20"
        try:
            resp = requests.get(url, headers=self.headers, timeout=10)
            if resp.status_code == 200:
                rows = resp.json()
                max_num = 1
                for r in rows:
                    sid = r.get("stock_id", "")
                    if sid.startswith("RR-"):
                        try:
                            num = int(sid.replace("RR-", ""))
                            if num > max_num:
                                max_num = num
                        except ValueError:
                            pass
                return f"RR-{max_num + 1:04d}"
        except Exception as e:
            print(f"[SupabasePublisher] 获取最新 Stock ID 失败，使用时间戳回退: {e}")
        
        import time
        return f"RR-{int(time.time()) % 10000:04d}"

    def upload_image(self, storage_path: str, image_bytes: bytes, mime_type: str = "image/webp") -> str:
        """上传单张图片到 Supabase Storage，返回公开访问 URL"""
        upload_url = f"{self.base_url}/storage/v1/object/{STORAGE_BUCKET}/{storage_path}"
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": mime_type,
            "x-upsert": "true",
        }
        resp = requests.post(upload_url, data=image_bytes, headers=headers, timeout=30)
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"图片上传失败 [{resp.status_code}]: {resp.text}")

        public_url = f"{self.base_url}/storage/v1/object/public/{STORAGE_BUCKET}/{storage_path}"
        return public_url

    def publish_vehicle(self, vehicle_data: dict, processed_images: list[bytes]) -> dict:
        """
        完整发布流程：
        1. 准备车辆基础信息与成本定价
        2. 写入 public.vehicles 表
        3. 批量上传 WebP 图片至 Storage
        4. 写入 public.vehicle_images 表
        """
        if not self.key:
            raise ValueError("未配置 SUPABASE_SERVICE_ROLE_KEY，无法执行数据库写入与存储上传！请检查 .env 配置。")

        stock_id = vehicle_data.get("stock_id") or self.generate_next_stock_id()
        cost_rmb = float(vehicle_data.get("internal_vehicle_cost_rmb", 50000.0))

        vehicle_payload = {
            "stock_id": stock_id,
            "brand": vehicle_data["brand"],
            "model": vehicle_data["model"],
            "year": int(vehicle_data["year"]),
            "body_type": vehicle_data["body_type"],
            "fuel_type": vehicle_data["fuel_type"],
            "steering": vehicle_data.get("steering", "LHD"),
            "mileage": int(vehicle_data.get("mileage", 30000)),
            "exterior_color": vehicle_data.get("exterior_color", "White"),
            "interior_color": vehicle_data.get("interior_color", "Black"),
            "condition": vehicle_data.get("condition", "Verified clean condition"),
            "sourcing_status": vehicle_data.get("sourcing_status", DEFAULT_SOURCING_STATUS),
            "publication_status": vehicle_data.get("publication_status", DEFAULT_PUBLICATION_STATUS),
            "internal_vehicle_cost_rmb": cost_rmb,
            "exchange_rate": DEFAULT_EXCHANGE_RATE,
            "domestic_transport_cost_rmb": DOMESTIC_TRANSPORT_COST_RMB,
            "refurbishment_cost_rmb": REFURBISHMENT_COST_RMB,
            "export_document_cost_rmb": EXPORT_DOCUMENT_COST_RMB,
            "port_loading_cost_rmb": PORT_LOADING_COST_RMB,
            "target_profit_rmb": TARGET_PROFIT_RMB,
            "vehicle_notes_en": vehicle_data.get("vehicle_notes_en", ""),
            "vehicle_notes_ru": vehicle_data.get("vehicle_notes_ru", ""),
            "featured": vehicle_data.get("featured", False),
        }

        # 1. 插入 vehicles 表
        vehicles_api_url = f"{self.base_url}/rest/v1/vehicles"
        resp = requests.post(vehicles_api_url, json=vehicle_payload, headers=self.headers, timeout=15)
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"车辆信息写入失败 [{resp.status_code}]: {resp.text}")

        inserted_vehicle = resp.json()[0]
        vehicle_id = inserted_vehicle["id"]
        print(f"[SupabasePublisher] 成功创建车辆记录: {stock_id} (ID: {vehicle_id})")

        # 2. 上传图片并关联
        image_records = []
        for index, img_bytes in enumerate(processed_images[:15]):
            storage_path = f"vehicles/{stock_id}/img_{index + 1:02d}.webp"
            public_url = self.upload_image(storage_path, img_bytes)
            
            image_records.append({
                "vehicle_id": vehicle_id,
                "storage_path": storage_path,
                "public_url": public_url,
                "alt_text_en": f"{inserted_vehicle['brand']} {inserted_vehicle['model']} view {index + 1}",
                "sort_order": index,
            })

        if image_records:
            images_api_url = f"{self.base_url}/rest/v1/vehicle_images"
            img_resp = requests.post(images_api_url, json=image_records, headers=self.headers, timeout=15)
            if img_resp.status_code not in (200, 201):
                print(f"[SupabasePublisher] 警告：图片关联记录写入失败: {img_resp.text}")
            else:
                print(f"[SupabasePublisher] 成功上传并关联 {len(image_records)} 张高清处理后车源实拍图！")

        return inserted_vehicle
