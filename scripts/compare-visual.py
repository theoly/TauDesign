#!/usr/bin/env python3
"""Compare a rendered HTML page with a browser-specific PNG reference."""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import sys
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageChops, ImageStat
    from playwright.async_api import async_playwright
except ImportError as error:
    print(json.dumps({"status": "unavailable", "reason": f"Missing optional dependency: {error.name}"}))
    raise SystemExit(2)


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html", required=True, type=Path, help="HTML file to render")
    parser.add_argument("--reference", required=True, type=Path, help="PNG baseline captured in the same browser")
    parser.add_argument("--actual", required=True, type=Path, help="Where to write the rendered PNG")
    parser.add_argument("--diff", required=True, type=Path, help="Where to write the red-overlay diff PNG")
    parser.add_argument("--browser", choices=("chromium", "webkit", "firefox"), default="chromium")
    parser.add_argument("--width", type=int, default=390, help="CSS-pixel viewport width (default: 390)")
    parser.add_argument("--height", type=int, default=844, help="CSS-pixel viewport height (default: 844)")
    parser.add_argument("--threshold", type=float, default=0.005, help="Maximum changed-pixel ratio, from 0 to 1 (default: 0.005)")
    parser.add_argument("--channel-threshold", type=int, default=12, help="Per-channel RGB noise ignored (default: 12)")
    parser.add_argument("--full-page", action="store_true", help="Capture the full document instead of one viewport")
    parser.add_argument("--update-reference", action="store_true", help="Explicitly replace the browser-specific baseline with this render")
    return parser.parse_args()


def compare(reference_path: Path, actual_path: Path, diff_path: Path, channel_threshold: int) -> dict[str, Any]:
    reference = Image.open(reference_path).convert("RGBA")
    actual = Image.open(actual_path).convert("RGBA")
    reference_size, actual_size = reference.size, actual.size
    size_matches = reference.size == actual.size
    width, height = max(reference.width, actual.width), max(reference.height, actual.height)
    if not size_matches:
        canvas_reference = Image.new("RGBA", (width, height), (255, 0, 255, 255))
        canvas_actual = Image.new("RGBA", (width, height), (255, 0, 255, 255))
        canvas_reference.alpha_composite(reference, (0, 0))
        canvas_actual.alpha_composite(actual, (0, 0))
        reference, actual = canvas_reference, canvas_actual

    raw = ImageChops.difference(reference, actual)
    rgb_diff = raw.convert("RGB")
    red, green, blue = rgb_diff.split()
    max_channel_diff = ImageChops.lighter(red, ImageChops.lighter(green, blue))
    changed_mask = max_channel_diff.point(lambda value: 255 if value > channel_threshold else 0)
    changed = changed_mask.histogram()[255]
    pixel_count = max(1, width * height)
    changed_ratio = changed / pixel_count
    mean_absolute_difference = sum(ImageStat.Stat(rgb_diff).mean) / (3 * 255)

    overlay = actual.copy()
    mask = Image.new("RGBA", overlay.size, (255, 32, 32, 0))
    alpha = changed_mask.point(lambda value: 180 if value else 0)
    mask.putalpha(alpha)
    overlay.alpha_composite(mask)
    diff_path.parent.mkdir(parents=True, exist_ok=True)
    overlay.save(diff_path)
    return {
        "size_matches": size_matches,
        "reference_size": list(reference_size),
        "actual_size": list(actual_size),
        "changed_pixels": changed,
        "changed_pixel_ratio": round(changed_ratio, 6),
        "mean_absolute_difference": round(mean_absolute_difference, 6),
    }


async def run(args: argparse.Namespace) -> int:
    if not 0 <= args.threshold <= 1 or args.width <= 0 or args.height <= 0 or not 0 <= args.channel_threshold <= 255:
        print(json.dumps({"status": "error", "reason": "Threshold, viewport, or channel threshold is out of range."}))
        return 2
    output_paths = [args.html.resolve(), args.reference.resolve(), args.actual.resolve(), args.diff.resolve()]
    if len(set(output_paths)) != len(output_paths):
        print(json.dumps({"status": "error", "reason": "HTML, reference, actual, and diff paths must be distinct."}))
        return 2
    for path in (args.html, args.reference):
        if args.update_reference and path == args.reference:
            continue
        if not path.is_file():
            print(json.dumps({"status": "error", "reason": f"File does not exist: {path}"}))
            return 2

    failed_requests: list[str] = []
    bad_responses: list[str] = []
    page_errors: list[str] = []
    broken_images: list[str] = []
    async with async_playwright() as playwright:
        browser_type = getattr(playwright, args.browser)
        try:
            browser = await browser_type.launch(headless=True)
        except Exception as error:
            print(json.dumps({"status": "unavailable", "browser": args.browser, "reason": str(error).splitlines()[0]}))
            return 2

        context = await browser.new_context(
            viewport={"width": args.width, "height": args.height},
            device_scale_factor=1,
            java_script_enabled=False,
        )
        page = await context.new_page()
        page.on("requestfailed", lambda request: failed_requests.append(f"{request.url}: {request.failure}"))
        page.on("response", lambda response: bad_responses.append(f"{response.status} {response.url}") if response.status >= 400 else None)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        navigation_error: str | None = None
        try:
            await page.goto(args.html.resolve().as_uri(), wait_until="load", timeout=30000)
            await page.evaluate("document.fonts ? document.fonts.ready : Promise.resolve()")
            broken_images = await page.evaluate("""async () => Promise.all(Array.from(document.images, async image => {
              try { await image.decode(); return null; }
              catch { return image.currentSrc || image.src || '<image without source>'; }
            })).then(results => results.filter(Boolean))""")
            await page.screenshot(path=str(args.actual), full_page=args.full_page, animations="disabled", caret="hide")
        except Exception as error:
            navigation_error = str(error)
        version = browser.version
        await context.close()
        await browser.close()

    if navigation_error:
        print(json.dumps({"status": "error", "browser": args.browser, "reason": navigation_error, "failed_requests": failed_requests[:10]}, ensure_ascii=False))
        return 1

    complete = not failed_requests and not bad_responses and not page_errors and not broken_images
    if args.update_reference:
        if not complete:
            print(json.dumps({
                "status": "error", "browser": args.browser,
                "reason": "Cannot update a baseline while page resources or runtime errors remain.",
                "failed_requests": failed_requests[:10], "bad_responses": bad_responses[:10],
                "page_errors": page_errors[:10], "broken_images": broken_images[:10]
            }, ensure_ascii=False, indent=2))
            return 1
        args.reference.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.actual, args.reference)

    metrics = compare(args.reference, args.actual, args.diff, args.channel_threshold)
    passed = complete and metrics["size_matches"] and metrics["changed_pixel_ratio"] <= args.threshold
    result = {
        "status": "baseline_updated" if args.update_reference else "pass" if passed else "fail",
        "browser": args.browser,
        "browser_version": version,
        "platform": sys.platform,
        "viewport": {"width": args.width, "height": args.height, "full_page": args.full_page},
        "allowed_changed_pixel_ratio": args.threshold,
        "resources_complete": complete,
        "failed_requests": failed_requests[:10],
        "bad_responses": bad_responses[:10],
        "page_errors": page_errors[:10],
        "broken_images": broken_images[:10],
        "actual_png": str(args.actual),
        "diff_png": str(args.diff),
        **metrics,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if args.update_reference or passed else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(arguments())))
