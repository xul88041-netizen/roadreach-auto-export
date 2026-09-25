import os
import sys
import argparse
import tempfile
from pathlib import Path

# 将当前目录加入 sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

# 修复 Windows 控制台中文及 Emoji 编码问题
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from config import DEFAULT_PUBLICATION_STATUS, SUPABASE_SERVICE_KEY
from jinyutang_crawler import JinyutangCrawler
from translator import normalize_vehicle_info
from image_processor import download_image, process_vehicle_image
from supabase_publisher import SupabasePublisher

def process_and_publish_car(
    raw_title: str,
    price_rmb: float,
    raw_specs: dict,
    image_urls: list[str],
    publish_now: bool = True,
    dry_run: bool = False,
    output_dir: str = None
):
    print("=" * 60)
    print("[开始处理] 正在清洗金鱼塘车源...")
    print(f"[原始标题] {raw_title}")
    print(f"[收车底价] ¥{price_rmb:,.2f} RMB")
    print(f"[图片数量] {len(image_urls)} 张")

    # 1. 国际化与数据标准化
    normalized = normalize_vehicle_info(raw_title, raw_specs)
    normalized["internal_vehicle_cost_rmb"] = price_rmb
    normalized["publication_status"] = "PUBLISHED" if publish_now else "DRAFT"

    print("\n[标准化完成] 多语言翻译完成:")
    print(f"   - 品牌车型: {normalized['brand']} {normalized['model']}")
    print(f"   - 出厂年份: {normalized['year']} | 车身: {normalized['body_type']} | 动力: {normalized['fuel_type']}")
    print(f"   - 外观颜色: {normalized['exterior_color']} | 表显里程: {normalized['mileage']:,} km")
    print(f"   - 英文文案: {normalized['vehicle_notes_en'][:60]}...")
    print(f"   - 俄文文案: {normalized['vehicle_notes_ru'][:60]}...")

    # 2. 图像智能处理流水线 (用户要求: 直接处理好图片)
    print("\n[图像流水线] 开始执行图像清洗与品牌加标:")
    processed_images_bytes = []
    
    for idx, url in enumerate(image_urls[:15]):
        try:
            print(f"   [{idx + 1}/{min(len(image_urls), 15)}] 下载并处理图片: {url[:50]}...")
            raw_bytes = download_image(url)
            # 处理: 裁切底部原水印、加盖 RoadReach 半透明品牌标、等比缩放、转 WebP
            processed_bytes = process_vehicle_image(raw_bytes, crop_bottom_percent=0.03, add_watermark=True)
            processed_images_bytes.append(processed_bytes)
            
            # 如果指定了本地保存目录 (例如测试模式)
            if output_dir:
                out_path = Path(output_dir) / f"car_img_{idx + 1:02d}.webp"
                out_path.write_bytes(processed_bytes)
                print(f"      -> 已保存到本地测试文件: {out_path.name}")
        except Exception as e:
            print(f"   [图片跳过] ({url[:30]}): {e}")

    print(f"[图像清洗完成] 共优化产出 {len(processed_images_bytes)} 张高清 WebP 品牌车源图。")

    if dry_run:
        print("\n[测试模式] 未写入 Supabase，数据和图片已在本地预览验证。")
        return normalized

    # 3. 自动发布到 Supabase
    print("\n[发布上线] 开始发布到 RoadReach Auto 网站...")
    if not SUPABASE_SERVICE_KEY:
        print("[警告] 未检测到 SUPABASE_SERVICE_ROLE_KEY 环境变量！")
        print("[提示] 请在 .env 文件中配置 SUPABASE_SERVICE_ROLE_KEY=your_key 以启用写入。")
        return normalized

    publisher = SupabasePublisher()
    result = publisher.publish_vehicle(normalized, processed_images_bytes)
    print(f"\n[发布成功] 车源已成功发布上线！")
    print(f"[Stock ID] {result.get('stock_id')}")
    print(f"[FOB指导价] ${result.get('suggested_fob_price_usd', 0):,.2f} USD")
    print("=" * 60)
    return result

def run_test_demo():
    """使用内置样本演示真实跑通完整流程"""
    print("正在运行金鱼塘车源采集发布演示...")
    test_dir = Path(__file__).resolve().parent / "test_output"
    test_dir.mkdir(exist_ok=True)
    
    # 模拟从金鱼塘提取的样本数据
    sample_title = "哈弗H6 2021款 第二代 1.5T 自动两驱冠军版"
    sample_price = 56000.0  # 5.6万
    sample_specs = {
        "mileage": "3.5万公里",
        "color": "白",
        "condition": "原版原漆，带全景天窗，电动座椅，车况极品。",
    }
    # 使用项目内现有的哈弗H6图片或公共图片进行处理演练
    sample_images = [
        "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=1200",
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200",
    ]

    process_and_publish_car(
        raw_title=sample_title,
        price_rmb=sample_price,
        raw_specs=sample_specs,
        image_urls=sample_images,
        publish_now=False,
        dry_run=True,
        output_dir=str(test_dir),
    )
    print(f"\n✅ 演示完成！处理后的带水印 WebP 图片存放在: {test_dir}")

def main():
    parser = argparse.ArgumentParser(description="金鱼塘二手车全自动抓取与发布系统")
    parser.add_argument("--url", help="金鱼塘车源 H5 / 分享网页链接 (使用无头浏览器抓取)")
    parser.add_argument("--text", help="车商复制的金鱼塘车源描述文本")
    parser.add_argument("--images", help="图片链接列表，以英文逗号分隔")
    parser.add_argument("--folder", help="本地图片文件夹路径 (包含从小程序下载的所有图片)")
    parser.add_argument("--title", help="车辆标题 (如: 领克 2018款 领克02 1.5T 劲 自动挡)")
    parser.add_argument("--price", type=float, help="车辆价格 (万元，如 4.2)")
    parser.add_argument("--mileage", type=int, help="表显里程 (如 48000)")
    parser.add_argument("--test", action="store_true", help="运行本地无头测试与图片水印效果预览")
    parser.add_argument("--draft", action="store_true", help="设为草稿状态 DRAFT，不立即前台公开")
    args = parser.parse_args()

    if args.test:
        run_test_demo()
        return

    # 支持直接从本地图片文件夹导入
    if args.folder:
        folder_path = Path(args.folder)
        if not folder_path.exists():
            print(f"错误: 找不到指定的图片文件夹: {args.folder}")
            return

        image_files = sorted([
            f for f in folder_path.iterdir()
            if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]
        ])
        if not image_files:
            print(f"错误: 文件夹中未找到任何图片文件！")
            return

        print(f"已扫描到本地图片: {len(image_files)} 张")
        title = args.title or "领克 2018款 领克02 1.5T 劲 自动挡"
        price_rmb = (args.price or 4.2) * 10000 if (args.price and args.price < 1000) else (args.price or 42000.0)
        mileage = args.mileage or 48000

        # 直接处理本地图片并发布
        raw_specs = {
            "mileage": mileage,
            "color": "灰",
            "year": 2018,
            "condition": "原版 一个面补漆 0出险 查博士S认证",
        }
        
        # 将本地图片路径直接传入处理流
        process_and_publish_car(
            raw_title=title,
            price_rmb=price_rmb,
            raw_specs=raw_specs,
            image_urls=[str(f) for f in image_files[:15]],
            publish_now=not args.draft,
            dry_run=False,
        )
        return

    crawler = JinyutangCrawler()

    if args.url:
        data = crawler.crawl_share_url(args.url)
    elif args.text:
        imgs = [url.strip() for url in args.images.split(",")] if args.images else []
        data = crawler.parse_copy_text(args.text, imgs)
    else:
        print("请提供 --url 或 --text 或 --folder 参数，使用 -h 查看说明。")
        return

    process_and_publish_car(
        raw_title=data["raw_title"],
        price_rmb=data["price_rmb"],
        raw_specs=data["raw_specs"],
        image_urls=data["image_urls"],
        publish_now=not args.draft,
        dry_run=False,
    )

if __name__ == "__main__":
    main()
