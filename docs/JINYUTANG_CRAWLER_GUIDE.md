# 金鱼塘 (Jinyutang) 二手车自动抓取与发布系统使用指南

本项目为 **RoadReach Auto Export** 平台提供了全自动的金鱼塘车源采集、图片清洗处理与一键发布流水线。

---

## 一、 系统核心功能

1. **自动采集与解析**：
   - 支持**金鱼塘车源 H5 / 分享链接**（基于无头浏览器自动渲染与提取）。
   - 支持**车商复制的车源文字**快速导入（无需浏览器，秒级完成）。
   - 支持金鱼塘 App 抓包 JSON 直接导入。
2. **专业级图像处理（全自动）**：
   - 自动等比缩放至最适配的高清尺寸（1600px 宽度）。
   - 自动裁切原平台可能存在的底部水印。
   - 自动在右下角盖上 **`ROADREACH AUTO EXPORT · VERIFIED SOURCING`** 专属半透明高质感品牌水印（防止被同行盗用，提升海外买家信任度）。
   - 自动转码为高效 **WebP** 格式（体积缩小 70%，极大提升海外用户打开速度）。
   - 自动上传到 Supabase Storage 的 `vehicle-images` 存储桶。
3. **数据国际化清洗与成本核算**：
   - 自动将国内中文品牌、车型标准化映射（如：`哈弗 H6` -> `Haval H6`，`比亚迪 宋PLUS` -> `BYD Song Plus`）。
   - 自动将国内车商标价转换为人民币收车成本 `internal_vehicle_cost_rmb`。
   - 结合运费、手续费与目标利润，根据汇率自动计算国际 **FOB 美元指导价**（`suggested_fob_price_usd`）。
   - 自动生成规范的**英文与俄文版出口车辆介绍**。
4. **一键发布**：
   - 车辆信息写入 Supabase 数据库，关联处理后的图片。
   - 支持直接在前台展厅公开（`PUBLISHED`）或存入后台草稿箱（`DRAFT`）由人工复核。

---

## 二、 快速上手与命令

进入项目根目录：

### 1. 本地运行测试（预览图片水印与数据解析效果）
无需写入数据库，在本地生成清洗加水印后的 WebP 图片供检查：
```powershell
python scripts/crawler/run_crawler.py --test
```
生成的测试图片将保存在 `scripts/crawler/test_output/` 文件夹中。

---

### 2. 采集金鱼塘车源分享链接（全自动）
车商在微信中分享的金鱼塘车辆链接（例如 `https://share.jytche.com/...`）：
```powershell
# 抓取并直接发布到网站前台
python scripts/crawler/run_crawler.py --url "https://share.jytche.com/car/xxxxxx"

# 抓取并存为草稿箱 (在 /admin/ 后台审核后再点发布)
python scripts/crawler/run_crawler.py --url "https://share.jytche.com/car/xxxxxx" --draft
```

---

### 3. 从车商微信文案直接导入
如果你在车商微信群或朋友圈看到车源信息，直接复制粘贴文案即可：
```powershell
python scripts/crawler/run_crawler.py --text "【金鱼塘车源】2021款哈弗H6 1.5T 自动两驱Max 3.2万公里 批发价5.68万" --images "https://img1.jpg,https://img2.jpg"
```

---

## 三、 配置与参数定制 (`scripts/crawler/config.py`)

如需调整利润、汇率或水印文字，可以直接在 `.env` 或 `scripts/crawler/config.py` 中修改：

| 配置项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `DEFAULT_EXCHANGE_RATE` | `7.20` | 人民币兑美元汇率 |
| `DOMESTIC_TRANSPORT_COST_RMB` | `1500.0` | 国内托运/短驳到出口港费用 (元) |
| `EXPORT_DOCUMENT_COST_RMB` | `2000.0` | 出口许可证、报关与单证费用 (元) |
| `PORT_LOADING_COST_RMB` | `800.0` | 港口装箱/滚装进港码头费 (元) |
| `TARGET_PROFIT_RMB` | `6000.0` | 每台车的期望出口毛利 (元) |
| `WATERMARK_TEXT` | `ROADREACH AUTO EXPORT` | 图片水印品牌主标题 |
| `WATERMARK_SUBTEXT` | `VERIFIED SOURCING` | 图片水印副标题 |
| `DEFAULT_PUBLICATION_STATUS` | `PUBLISHED` | 默认状态 (`PUBLISHED` 或 `DRAFT`) |

---

## 四、 环境变量配置 (`.env`)

若要让抓取脚本能够自动写入远程 Supabase 数据库和上传 Storage，请确保项目根目录的 `.env` 包含 `SUPABASE_SERVICE_ROLE_KEY`（在 Supabase 控制台 **Project Settings → API** 中获取）：

```ini
SUPABASE_URL=https://smjbzjzsmmisdrmdfjby.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
