//! 高保真 PNG 导出 (doc/feature/high-fidelity-png-export/spec.md)
//!
//! 浏览器侧此前把 HTML 塞进 SVG `<foreignObject>` 再 `drawImage` 光栅化。该上下文在
//! WKWebView 下会拦截子资源、排版行为也与正常文档不一致，导出图大面积丢内容（ISSUE-025
//! 只是同一个坑的局部缓解）。
//!
//! 本模块改用**真实渲染器**出图：
//!   1. 把自包含 HTML 挂到自定义协议上，用一个离屏窗口真正渲染它；
//!   2. `WKWebView.createPDF` 一次性拿到**整页**矢量快照——无需滚动拼接，
//!      因而不会出现吸顶/吸底元素在接缝处重复；也不需要录屏权限；
//!   3. CoreGraphics 按倍率把 PDF 栅格化为位图，`png` crate 编码。
//!
//! 导入页使用 WKWebView 屏幕位图快照，避免复合径向渐变在 PDF 转译中失真。
//! 仅 macOS 实现；其他平台返回 `unsupported_platform`，由前端回退旧路径 (BR-PX-05)。

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;

/// 离屏渲染页面所用的自定义协议。走自定义协议而非 `file://`，
/// 是因为 WKWebView 对顶层 `file://` 与 `data:` 导航都有限制。
pub const EXPORT_SCHEME: &str = "aidesign-export";

/// 待渲染 HTML 暂存表，键为一次性 token
static PENDING_HTML: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn registry() -> &'static Mutex<HashMap<String, String>> {
    PENDING_HTML.get_or_init(|| Mutex::new(HashMap::new()))
}

fn put_html(token: &str, html: String) {
    if let Ok(mut map) = registry().lock() {
        map.insert(token.to_string(), html);
    }
}

fn drop_html(token: &str) {
    if let Ok(mut map) = registry().lock() {
        map.remove(token);
    }
}

/// 供自定义协议处理器取用；页面可能重载，故只读不删
pub fn get_html(token: &str) -> Option<String> {
    registry().lock().ok()?.get(token).cloned()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPngResult {
    /// PNG 字节的 base64（不含 data URL 前缀）
    pub png_base64: String,
    pub width: u32,
    pub height: u32,
    /// 实际生效的渲染引擎，回显给用户便于排查
    pub engine: String,
}

/// 把一页自包含 HTML 渲染为高保真 PNG。
///
/// * `width` —— 画框宽度（CSS 像素）
/// * `height` —— 期望渲染高度（CSS 像素），由前端实测得出 (BR-PX-03)
/// * `scale` —— 输出倍率，1/2/3
#[tauri::command]
pub async fn export_screen_png(
    app: tauri::AppHandle,
    html: String,
    width: f64,
    height: f64,
    scale: f64,
    settle_ms: Option<u64>,
    prefer_snapshot: Option<bool>,
) -> Result<ExportPngResult, String> {
    if width <= 0.0 || height <= 0.0 {
        return Err("导出尺寸非法：宽高必须为正数".to_string());
    }
    let scale = if scale <= 0.0 { 1.0 } else { scale.min(4.0) };

    #[cfg(target_os = "macos")]
    {
        let settle = settle_ms.unwrap_or(400);
        tauri::async_runtime::spawn_blocking(move || {
            macos::render(
                app,
                html,
                width,
                height,
                scale,
                settle,
                prefer_snapshot.unwrap_or(false),
            )
        })
        .await
        .map_err(|e| format!("导出任务调度失败: {e}"))?
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, html, width, height, scale, settle_ms, prefer_snapshot);
        Err("unsupported_platform: 原生高保真导出目前仅支持 macOS".to_string())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{drop_html, put_html, ExportPngResult, EXPORT_SCHEME};
    use base64::Engine as _;
    use block2::RcBlock;
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSImage;
    use objc2_core_foundation::{CFData, CGPoint, CGRect, CGSize};
    use objc2_core_graphics::{
        CGBitmapContextCreate, CGColorSpace, CGContext, CGDataProvider, CGImage, CGImageAlphaInfo,
        CGPDFBox, CGPDFDocument, CGPDFPage,
    };
    use objc2_foundation::{NSData, NSError, NSNumber};
    use objc2_web_kit::{WKPDFConfiguration, WKSnapshotConfiguration, WKWebView};
    use std::sync::mpsc;
    use std::sync::Mutex;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use tauri::webview::PageLoadEvent;
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    /// 离屏窗口的落点。放到远离任何显示器的坐标，既能保持窗口"可见"
    /// 从而让 WKWebView 正常提交渲染，又不会在用户屏幕上闪出来。
    const OFFSCREEN_X: f64 = -32000.0;
    const OFFSCREEN_Y: f64 = -32000.0;

    const LOAD_TIMEOUT: Duration = Duration::from_secs(20);
    const PDF_TIMEOUT: Duration = Duration::from_secs(40);

    pub fn render(
        app: tauri::AppHandle,
        html: String,
        width: f64,
        height: f64,
        scale: f64,
        settle_ms: u64,
        prefer_snapshot: bool,
    ) -> Result<ExportPngResult, String> {
        let token = format!(
            "exp{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        put_html(&token, html);

        let result = render_inner(
            &app,
            &token,
            width,
            height,
            scale,
            settle_ms,
            prefer_snapshot,
        );

        drop_html(&token);
        if let Some(win) = app.get_webview_window(&window_label(&token)) {
            let _ = win.close();
        }
        result
    }

    fn window_label(token: &str) -> String {
        format!("export-{token}")
    }

    fn render_inner(
        app: &tauri::AppHandle,
        token: &str,
        width: f64,
        height: f64,
        scale: f64,
        settle_ms: u64,
        prefer_snapshot: bool,
    ) -> Result<ExportPngResult, String> {
        let url = format!("{EXPORT_SCHEME}://localhost/{token}")
            .parse()
            .map_err(|e| format!("导出地址构造失败: {e}"))?;

        let (load_tx, load_rx) = mpsc::channel::<()>();
        let load_tx = Mutex::new(Some(load_tx));

        // 离屏窗口尺寸即渲染视口。高度给足整页，createPDF 才能拿到完整内容 (BR-PX-03)
        let win = WebviewWindowBuilder::new(app, window_label(token), WebviewUrl::External(url))
            .title("export")
            .inner_size(width, height)
            .position(OFFSCREEN_X, OFFSCREEN_Y)
            .decorations(false)
            .resizable(false)
            .focused(false)
            .visible(true)
            .on_page_load(move |_webview, payload| {
                if matches!(payload.event(), PageLoadEvent::Finished) {
                    if let Ok(mut slot) = load_tx.lock() {
                        if let Some(tx) = slot.take() {
                            let _ = tx.send(());
                        }
                    }
                }
            })
            .build()
            .map_err(|e| format!("离屏渲染窗口创建失败: {e}"))?;

        load_rx
            .recv_timeout(LOAD_TIMEOUT)
            .map_err(|_| "离屏页面加载超时".to_string())?;

        // 字体与图片解码、首帧合成都发生在 load 之后，留一段沉降时间 (BR-PX-02)
        std::thread::sleep(Duration::from_millis(settle_ms));

        let (pixels, px_w, px_h) = if prefer_snapshot {
            capture_snapshot(&win, width, height, scale)?
        } else {
            let pdf = capture_pdf(&win, width, height)?;
            rasterize_pdf(&pdf, scale, Some(height))?
        };
        let png = encode_png(&pixels, px_w, px_h)?;

        Ok(ExportPngResult {
            png_base64: base64::engine::general_purpose::STANDARD.encode(png),
            width: px_w,
            height: px_h,
            engine: if prefer_snapshot {
                "native-webview-snapshot"
            } else {
                "native-webview-pdf"
            }
            .to_string(),
        })
    }

    /// Imported pages use the screen raster backend: createPDF can turn layered
    /// radial gradients into opaque black/white masks on older system WebKit.
    /// The offscreen viewport already covers the whole page, so no scrolling or
    /// stitching is required (fixed headers/footers are captured only once).
    fn capture_snapshot(
        win: &tauri::WebviewWindow,
        width: f64,
        height: f64,
        scale: f64,
    ) -> Result<(Vec<u8>, u32, u32), String> {
        let (tx, rx) = mpsc::channel();
        win.with_webview(move |platform| {
            let mtm = unsafe { MainThreadMarker::new_unchecked() };
            let view: &WKWebView = unsafe { &*platform.inner().cast() };
            let config = unsafe { WKSnapshotConfiguration::new(mtm) };
            unsafe {
                config.setRect(CGRect::new(
                    CGPoint::new(0.0, 0.0),
                    CGSize::new(width, height),
                ));
                config.setSnapshotWidth(Some(&NSNumber::new_f64(width * scale)));
                config.setAfterScreenUpdates(true);
            }
            let handler = RcBlock::new(move |image: *mut NSImage, err: *mut NSError| {
                let result = if image.is_null() {
                    let reason = if err.is_null() {
                        "WKWebView 未返回快照".to_string()
                    } else {
                        unsafe { &*err }.localizedDescription().to_string()
                    };
                    Err(reason)
                } else {
                    let image = unsafe { &*image };
                    rasterize_snapshot(image, width, height, scale)
                };
                let _ = tx.send(result);
            });
            unsafe {
                view.takeSnapshotWithConfiguration_completionHandler(Some(&config), &handler);
            }
        })
        .map_err(|e| format!("无法访问快照 WebView: {e}"))?;
        rx.recv_timeout(PDF_TIMEOUT)
            .map_err(|_| "原生整页快照超时".to_string())?
    }

    fn rasterize_snapshot(
        image: &NSImage,
        width: f64,
        height: f64,
        scale: f64,
    ) -> Result<(Vec<u8>, u32, u32), String> {
        let cg =
            unsafe { image.CGImageForProposedRect_context_hints(std::ptr::null_mut(), None, None) }
                .ok_or_else(|| "原生快照没有位图数据".to_string())?;
        let px_w = (width * scale).round().max(1.0) as usize;
        let px_h = (height * scale).round().max(1.0) as usize;
        // Snapshot width is in points; backing pixels depend on the display.
        // Normalize to the requested output size instead of leaking Retina scale.
        let src_w = CGImage::width(Some(&cg)) as f64;
        let src_h = CGImage::height(Some(&cg)) as f64;
        if src_w < px_w as f64
            || src_h < px_h as f64
            || (src_h / src_w - height / width).abs() > 0.02
        {
            return Err("原生快照尺寸不足或比例不符，无法交付截断/放大图片".to_string());
        }
        let mut pixels = vec![0u8; px_w * px_h * 4];
        let color_space =
            CGColorSpace::new_device_rgb().ok_or_else(|| "快照颜色空间创建失败".to_string())?;
        let ctx = unsafe {
            CGBitmapContextCreate(
                pixels.as_mut_ptr().cast(),
                px_w,
                px_h,
                8,
                px_w * 4,
                Some(&color_space),
                CGImageAlphaInfo::PremultipliedLast.0,
            )
        }
        .ok_or_else(|| "快照位图上下文创建失败".to_string())?;
        let rect = CGRect::new(
            CGPoint::new(0.0, 0.0),
            CGSize::new(px_w as f64, px_h as f64),
        );
        CGContext::set_rgb_fill_color(Some(&ctx), 1.0, 1.0, 1.0, 1.0);
        CGContext::fill_rect(Some(&ctx), rect);
        CGContext::draw_image(Some(&ctx), rect, Some(&cg));
        CGContext::flush(Some(&ctx));
        drop(ctx);
        Ok((pixels, px_w as u32, px_h as u32))
    }

    /// 调 `WKWebView.createPDF` 拿整页矢量快照。闭包在主线程执行，
    /// 结果经 channel 回传到当前工作线程。
    fn capture_pdf(win: &tauri::WebviewWindow, width: f64, height: f64) -> Result<Vec<u8>, String> {
        let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();

        win.with_webview(move |platform| {
            // with_webview 保证在主线程执行，此处取 MainThreadMarker 是安全的
            let mtm = unsafe { MainThreadMarker::new_unchecked() };
            let view: &WKWebView = unsafe { &*platform.inner().cast() };

            let config = unsafe { WKPDFConfiguration::new(mtm) };
            unsafe {
                config.setRect(CGRect::new(
                    CGPoint::new(0.0, 0.0),
                    CGSize::new(width, height),
                ));
            }

            let sender = tx.clone();
            let handler = RcBlock::new(move |data: *mut NSData, err: *mut NSError| {
                let outcome = if data.is_null() {
                    let reason = if err.is_null() {
                        "WKWebView 未返回 PDF 数据".to_string()
                    } else {
                        let e: &NSError = unsafe { &*err };
                        format!("WKWebView createPDF 失败: {}", e.localizedDescription())
                    };
                    Err(reason)
                } else {
                    let d: &NSData = unsafe { &*data };
                    Ok(d.to_vec())
                };
                let _ = sender.send(outcome);
            });

            unsafe {
                view.createPDFWithConfiguration_completionHandler(Some(&config), &handler);
            }
        })
        .map_err(|e| format!("无法访问原生 WebView: {e}"))?;

        rx.recv_timeout(PDF_TIMEOUT)
            .map_err(|_| "原生整页渲染超时".to_string())?
    }

    /// PDF → RGBA8 位图。PDF 与 CGBitmapContext 同为左下原点，
    /// 直接绘制即可得到方向正确的图像，无需翻转。
    fn rasterize_pdf(
        pdf: &[u8],
        scale: f64,
        expected_height: Option<f64>,
    ) -> Result<(Vec<u8>, u32, u32), String> {
        let cf_data = CFData::from_bytes(pdf);
        let provider = CGDataProvider::with_cf_data(Some(&cf_data))
            .ok_or_else(|| "PDF 数据源创建失败".to_string())?;
        let doc = CGPDFDocument::with_provider(Some(&provider))
            .ok_or_else(|| "PDF 解析失败".to_string())?;
        if CGPDFDocument::number_of_pages(Some(&doc)) == 0 {
            return Err("PDF 无可用页面".to_string());
        }
        let page =
            CGPDFDocument::page(Some(&doc), 1).ok_or_else(|| "PDF 首页读取失败".to_string())?;

        let media = CGPDFPage::box_rect(Some(&page), CGPDFBox::MediaBox);
        let pt_w = media.size.width;
        let pt_h = media.size.height;
        if pt_w <= 0.0 || pt_h <= 0.0 {
            return Err("PDF 页面尺寸异常".to_string());
        }

        // 捕获高度明显不足，说明内容被视口裁掉了。此时宁可报错让上层回退，
        // 也不能把一张截断的图当成功交出去 (BR-PX-05)
        if let Some(expected) = expected_height {
            if expected > 0.0 && pt_h + 1.0 < expected * 0.9 {
                return Err(format!(
                    "原生渲染只捕获到 {:.0}px，预期 {:.0}px，疑似被视口裁切",
                    pt_h, expected
                ));
            }
        }

        let px_w = (pt_w * scale).round().max(1.0) as usize;
        let px_h = (pt_h * scale).round().max(1.0) as usize;
        let bytes_per_row = px_w * 4;
        let mut buffer = vec![0u8; bytes_per_row * px_h];

        let color_space =
            CGColorSpace::new_device_rgb().ok_or_else(|| "颜色空间创建失败".to_string())?;

        let ctx = unsafe {
            CGBitmapContextCreate(
                buffer.as_mut_ptr() as *mut core::ffi::c_void,
                px_w,
                px_h,
                8,
                bytes_per_row,
                Some(&color_space),
                CGImageAlphaInfo::PremultipliedLast.0,
            )
        }
        .ok_or_else(|| "位图上下文创建失败".to_string())?;

        // 先铺白底：PDF 透明区域直出会得到黑块 (BR-PX-06)
        CGContext::set_rgb_fill_color(Some(&ctx), 1.0, 1.0, 1.0, 1.0);
        CGContext::fill_rect(
            Some(&ctx),
            CGRect::new(
                CGPoint::new(0.0, 0.0),
                CGSize::new(px_w as f64, px_h as f64),
            ),
        );

        CGContext::scale_ctm(Some(&ctx), scale, scale);
        CGContext::translate_ctm(Some(&ctx), -media.origin.x, -media.origin.y);
        CGContext::draw_pdf_page(Some(&ctx), Some(&page));
        CGContext::flush(Some(&ctx));

        drop(ctx);
        Ok((buffer, px_w as u32, px_h as u32))
    }

    #[cfg(test)]
    pub(super) fn rasterize_pdf_for_test(
        pdf: &[u8],
        scale: f64,
        expected_height: Option<f64>,
    ) -> Result<(Vec<u8>, u32, u32), String> {
        rasterize_pdf(pdf, scale, expected_height)
    }

    #[cfg(test)]
    pub(super) fn encode_png_for_test(pixels: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
        encode_png(pixels, width, height)
    }

    fn encode_png(pixels: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
        let mut out = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut out, width, height);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder
                .write_header()
                .map_err(|e| format!("PNG 头写入失败: {e}"))?;
            writer
                .write_image_data(pixels)
                .map_err(|e| format!("PNG 数据写入失败: {e}"))?;
        }
        Ok(out)
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::macos::{encode_png_for_test, rasterize_pdf_for_test};
    use objc2_core_foundation::{CFMutableData, CGPoint, CGRect, CGSize};
    use objc2_core_graphics::{
        CGContext, CGDataConsumer, CGPDFContextClose, CGPDFContextCreate,
    };

    /// 用 CoreGraphics 现造一张 100x50 的 PDF：左下角 50x25 填红，其余留白。
    /// 借它验证栅格化的尺寸、倍率、方向、行距与 PNG 编码。
    fn make_test_pdf() -> Vec<u8> {
        let data = CFMutableData::new(None, 0).expect("CFMutableData");
        let consumer = CGDataConsumer::with_cf_data(Some(&data)).expect("consumer");
        let media = CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(100.0, 50.0));

        let ctx = unsafe { CGPDFContextCreate(Some(&consumer), &media, None) }.expect("pdf ctx");
        unsafe { objc2_core_graphics::CGPDFContextBeginPage(Some(&ctx), None) };
        CGContext::set_rgb_fill_color(Some(&ctx), 1.0, 0.0, 0.0, 1.0);
        CGContext::fill_rect(
            Some(&ctx),
            CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(50.0, 25.0)),
        );
        objc2_core_graphics::CGPDFContextEndPage(Some(&ctx));
        CGPDFContextClose(Some(&ctx));
        drop(ctx);

        data.to_vec()
    }

    #[test]
    fn rasterizes_pdf_at_requested_scale_with_correct_orientation() {
        let pdf = make_test_pdf();
        assert!(pdf.starts_with(b"%PDF"), "生成的不是 PDF");

        let (pixels, w, h) = rasterize_pdf_for_test(&pdf, 2.0, None).expect("rasterize");

        // 1. 尺寸按倍率放大
        assert_eq!((w, h), (200, 100));
        assert_eq!(pixels.len(), (w * h * 4) as usize);

        let px = |x: u32, y: u32| {
            let i = ((y * w + x) * 4) as usize;
            (pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3])
        };

        // 2. 方向：PDF 原点在左下，红块应落在位图的左下角
        let (r, g, b, a) = px(10, h - 10);
        assert!(r > 200 && g < 60 && b < 60 && a == 255, "左下角应为红色，实际 {:?}", (r, g, b, a));

        // 3. 留白处铺的是白底而非透明黑
        let (r2, g2, b2, a2) = px(w - 10, 10);
        assert_eq!((r2, g2, b2, a2), (255, 255, 255, 255), "右上角应为白底");
    }

    #[test]
    fn rejects_truncated_capture_instead_of_delivering_a_clipped_image() {
        let pdf = make_test_pdf(); // 实际页高 50px
        let err = rasterize_pdf_for_test(&pdf, 1.0, Some(4469.0)).unwrap_err();
        assert!(err.contains("视口裁切"), "应判定为裁切，实际: {err}");

        // 高度基本吻合时不得误判
        assert!(rasterize_pdf_for_test(&pdf, 1.0, Some(50.0)).is_ok());
    }

    #[test]
    fn encodes_valid_png_stream() {
        let pdf = make_test_pdf();
        let (pixels, w, h) = rasterize_pdf_for_test(&pdf, 1.0, None).expect("rasterize");
        let png = encode_png_for_test(&pixels, w, h).expect("encode");

        assert_eq!(&png[..8], &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a], "PNG magic 不正确");
        assert!(png.len() > 100, "PNG 体积异常小");
    }
}
