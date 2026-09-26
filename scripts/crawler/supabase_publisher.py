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

    def delete_storage_objects(self, storage_paths: list[str]):
        """批量删除 Supabase Storage 中的对象"""
        if not storage_paths:
            return
        delete_url = f"{self.base_url}/storage/v1/object/{STORAGE_BUCKET}"
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        try:
            requests.delete(delete_url, json={"prefixes": storage_paths}, headers=headers, timeout=15)
        except Exception as e:
            print(f"[SupabasePublisher] 清理 Storage 对象失败: {e}")

    def publish_vehicle(self, vehicle_data: dict, processed_images: list[bytes], require_review: bool = True) -> dict:
        """
        具备原子性和草稿回滚保护的车辆录入流程：
        1. 必须提供有效图片，初始 publication_status 强制设为 DRAFT
        2. 写入 public.vehicles 表（状态为 DRAFT）
        3. 上传图片至 Storage，若任何一张上传失败立即触发回滚
        4. 写入 public.vehicle_images 表
        5. 仅当全部图片上传与关联成功、且显式指定无需人工审核（require_review=False）时，
           才单次 PATCH 将状态切换为 PUBLISHED；默认保持 DRAFT 待后台人工复核。
        """
        if not self.key:
            raise ValueError("未配置 SUPABASE_SERVICE_ROLE_KEY，无法执行数据库写入与存储上传！")

        if not processed_images:
            raise ValueError("发布车辆必须包含至少一张已处理的高清图片！")

        stock_id = vehicle_data.get("stock_id") or self.generate_next_stock_id()
        cost_rmb = float(vehicle_data.get("internal_vehicle_cost_rmb", 50000.0))

        # 强制初始状态为 DRAFT，避免上传过程半途暴露不完整车辆
        initial_status = "DRAFT"
        target_status = vehicle_data.get("publication_status", "PUBLISHED") if not require_review else "DRAFT"

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
            "publication_status": initial_status,
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

        # 1. 插入 vehicles 表 (DRAFT 状态)
        vehicles_api_url = f"{self.base_url}/rest/v1/vehicles"
        resp = requests.post(vehicles_api_url, json=vehicle_payload, headers=self.headers, timeout=15)
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"车辆信息写入失败 [{resp.status_code}]: {resp.text}")

        inserted_vehicle = resp.json()[0]
        vehicle_id = inserted_vehicle["id"]
        print(f"[SupabasePublisher] 成功创建 DRAFT 车辆记录: {stock_id} (ID: {vehicle_id})")

        uploaded_storage_paths = []
        try:
            # 2. 上传图片并关联
            image_records = []
            for index, img_bytes in enumerate(processed_images[:15]):
                storage_path = f"vehicles/{stock_id}/img_{index + 1:02d}.webp"
                public_url = self.upload_image(storage_path, img_bytes)
                uploaded_storage_paths.append(storage_path)

                image_records.append({
                    "vehicle_id": vehicle_id,
                    "storage_path": storage_path,
                    "public_url": public_url,
                    "alt_text_en": f"{inserted_vehicle['brand']} {inserted_vehicle['model']} view {index + 1}",
                    "sort_order": index,
                })

            if len(image_records) != len(processed_images[:15]):
                raise RuntimeError("上传图片数量与输入不一致！")

            images_api_url = f"{self.base_url}/rest/v1/vehicle_images"
            img_resp = requests.post(images_api_url, json=image_records, headers=self.headers, timeout=15)
            if img_resp.status_code not in (200, 201):
                raise RuntimeError(f"图片关联记录写入失败: {img_resp.text}")

            print(f"[SupabasePublisher] 成功上传并关联全部 {len(image_records)} 张图片！")

            # 3. 如果明确允许发布，单次原子更新状态为 PUBLISHED
            if target_status == "PUBLISHED":
                patch_url = f"{vehicles_api_url}?id=eq.{vehicle_id}"
                patch_resp = requests.patch(patch_url, json={"publication_status": "PUBLISHED"}, headers=self.headers, timeout=15)
                if patch_resp.status_code not in (200, 204):
                    raise RuntimeError(f"切换发布状态失败: {patch_resp.text}")
                inserted_vehicle["publication_status"] = "PUBLISHED"
                print(f"[SupabasePublisher] 车辆 {stock_id} 图片核验完毕，已原子切换为 PUBLISHED 上线状态！")
            else:
                print(f"[SupabasePublisher] 车辆 {stock_id} 保持 DRAFT 待审状态，等待管理后台人工复核。")

            return inserted_vehicle

        except Exception as err:
            print(f"[SupabasePublisher 回滚操作] 过程中出现异常: {err}，正在执行自动清理与回滚...")
            if uploaded_storage_paths:
                self.delete_storage_objects(uploaded_storage_paths)
            try:
                delete_car_url = f"{vehicles_api_url}?id=eq.{vehicle_id}"
                requests.delete(delete_car_url, headers=self.headers, timeout=10)
                print(f"[SupabasePublisher 回滚完成] 已清理半成品车辆记录 {vehicle_id} 及 Storage 文件。")
            except Exception as del_err:
                print(f"[SupabasePublisher] 回滚删除记录失败: {del_err}")
            raise
