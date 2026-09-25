import os
from pathlib import Path
from dotenv import load_dotenv

# 加载父目录或当前目录的 .env
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

# Supabase 配置
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://smjbzjzsmmisdrmdfjby.supabase.co").rstrip("/")
# 注意：直接插入数据库或上传 Storage 通常需要 service_role key 或带有管理权限的 token
# 在本地脚本运行环境使用 service_role key 是安全且标准的
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("ROADREACH_SERVICE_KEY") or os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
STORAGE_BUCKET = "vehicle-images"

# 汇率与出口定价模型配置 (RMB -> USD FOB)
DEFAULT_EXCHANGE_RATE = float(os.getenv("DEFAULT_EXCHANGE_RATE", 7.20))
DOMESTIC_TRANSPORT_COST_RMB = float(os.getenv("DOMESTIC_TRANSPORT_COST_RMB", 1500.0))  # 国内短驳/托运到港口
EXPORT_DOCUMENT_COST_RMB = float(os.getenv("EXPORT_DOCUMENT_COST_RMB", 2000.0))       # 出口许可证、报关单证
PORT_LOADING_COST_RMB = float(os.getenv("PORT_LOADING_COST_RMB", 800.0))             # 港口装箱/滚装进港
REFURBISHMENT_COST_RMB = float(os.getenv("REFURBISHMENT_COST_RMB", 500.0))           # 基础精洗与整备
TARGET_PROFIT_RMB = float(os.getenv("TARGET_PROFIT_RMB", 6000.0))                    # 期望出口单车利润

# 默认发布状态: PUBLISHED (直接前台展示) 或 DRAFT (草稿箱，等待后台审核)
DEFAULT_PUBLICATION_STATUS = os.getenv("DEFAULT_PUBLICATION_STATUS", "PUBLISHED")
DEFAULT_SOURCING_STATUS = "AVAILABLE_TO_SOURCE" # 或 "IN_STOCK"

# 图像处理与水印设置
WATERMARK_ENABLED = True
WATERMARK_TEXT = "ROADREACH AUTO EXPORT"
WATERMARK_SUBTEXT = "VERIFIED SOURCING"
MAX_IMAGES_PER_VEHICLE = 15  # 数据库上限限制为 15 张
IMAGE_MAX_WIDTH = 1600       # 缩放至最大宽度，保持极佳清晰度
IMAGE_QUALITY = 85           # WebP 质量
OUTPUT_FORMAT = "WEBP"
