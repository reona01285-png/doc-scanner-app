"""
D:\Claude\doc_scanner_app 内の index.html / style.css / app.js / vendor/opencv.js を
1つの自己完結HTMLファイル(standalone.html)にまとめるビルドスクリプト。
サーバーなし・オフラインでそのまま開けるようにするため。
"""
import re
from pathlib import Path

BASE = Path(r"D:\Claude\doc_scanner_app")

html = (BASE / "index.html").read_text(encoding="utf-8")
css = (BASE / "style.css").read_text(encoding="utf-8")
js = (BASE / "app.js").read_text(encoding="utf-8")
opencv_js = (BASE / "vendor" / "opencv.js").read_text(encoding="utf-8")

# <link rel="stylesheet" href="style.css"> を <style>...</style> に置き換える
html = html.replace(
    '<link rel="stylesheet" href="style.css">',
    f"<style>\n{css}\n</style>",
)

# <script src="vendor/opencv.js"></script> と <script src="app.js"></script> を
# それぞれインライン化する
html = html.replace(
    '<script src="vendor/opencv.js"></script>',
    f"<script>\n{opencv_js}\n</script>",
)
html = html.replace(
    '<script src="app.js"></script>',
    f"<script>\n{js}\n</script>",
)

out_path = BASE / "standalone.html"
out_path.write_text(html, encoding="utf-8")
print(f"生成しました: {out_path} ({out_path.stat().st_size / 1024 / 1024:.2f} MB)")
