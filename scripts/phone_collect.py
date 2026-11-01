#!/usr/bin/env python3
"""USB로 연결된 본인 Android 폰의 '현재 화면' 텍스트를 수집하는 반자동 도구.

- 병원 서버/API를 호출하지 않고, 본인이 직접 로그인한 앱 화면의 텍스트만 읽습니다.
- 로그인·본인인증·메뉴 이동은 사용자가 폰에서 직접 합니다. (자동 로그인 없음)
- 앱이 USB 디버깅/접근성 조회를 차단하면 우회하지 말고 중단하십시오.
- 결과는 PC의 phone_dump/ 폴더에만 저장됩니다. (.gitignore 처리됨, 외부 전송 없음)

사전 준비: PC에 Android platform-tools(adb) 설치 → 폰 개발자 옵션에서 USB 디버깅 허용.

사용법:
  python scripts/phone_collect.py check
  python scripts/phone_collect.py record --app samsung     # 화면 이동 후 Enter마다 1화면 저장
  python scripts/phone_collect.py record --app samsung --scroll   # 길면 자동 스크롤하며 수집
  python scripts/phone_collect.py export --app samsung     # 수집분을 하나의 JSON으로 병합
"""
import argparse
import json
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

OUT_ROOT = Path("phone_dump")
BOUNDS_RE = re.compile(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]")


def adb(*args, serial=None, binary=False):
    cmd = ["adb"] + (["-s", serial] if serial else []) + list(args)
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=60)
    except FileNotFoundError:
        sys.exit("adb를 찾을 수 없습니다. platform-tools를 설치하고 PATH에 추가하십시오.")
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "replace").strip() or "adb 실행 실패")
    return r.stdout if binary else r.stdout.decode("utf-8", "replace")


def get_serial():
    lines = adb("devices").strip().splitlines()[1:]
    ready = [ln.split("\t")[0] for ln in lines if ln.strip().endswith("device")]
    if len(ready) != 1:
        sys.exit(f"연결된 기기가 정확히 1대여야 합니다. (현재 {len(ready)}대) USB 디버깅 허용 팝업을 확인하십시오.")
    return ready[0]


def parse_ui_xml(xml_text):
    """UI 계층에서 보이는 텍스트를 위→아래, 좌→우 순서로 추출."""
    items = []
    for node in ET.fromstring(xml_text).iter("node"):
        text = (node.get("text") or node.get("content-desc") or "").strip()
        if not text:
            continue
        m = BOUNDS_RE.match(node.get("bounds") or "")
        left, top = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
        items.append({"text": text, "x": left, "y": top})
    items.sort(key=lambda i: (i["y"], i["x"]))
    return items


def dump_screen(serial):
    adb("shell", "uiautomator", "dump", "/sdcard/_ui.xml", serial=serial)
    xml_text = adb("exec-out", "cat", "/sdcard/_ui.xml", serial=serial)
    adb("shell", "rm", "-f", "/sdcard/_ui.xml", serial=serial)
    return parse_ui_xml(xml_text)


def screen_size(serial):
    m = re.search(r"(\d+)x(\d+)", adb("shell", "wm", "size", serial=serial))
    return (int(m.group(1)), int(m.group(2))) if m else (1080, 2400)


def collect(serial, scroll, max_scrolls=15):
    """현재 화면을 수집. scroll=True면 새 텍스트가 없을 때까지 아래로 스크롤."""
    seen, ordered = set(), []

    def add(items):
        added = 0
        for it in items:
            if it["text"] not in seen:
                seen.add(it["text"])
                ordered.append(it["text"])
                added += 1
        return added

    add(dump_screen(serial))
    if scroll:
        w, h = screen_size(serial)
        for _ in range(max_scrolls):
            adb("shell", "input", "swipe", str(w // 2), str(int(h * 0.75)),
                str(w // 2), str(int(h * 0.30)), "400", serial=serial)
            time.sleep(0.8)
            if add(dump_screen(serial)) == 0:
                break
    return ordered


def cmd_check(_):
    serial = get_serial()
    model = adb("shell", "getprop", "ro.product.model", serial=serial).strip()
    print(f"연결 확인: {serial} ({model}), 화면 {screen_size(serial)}")


def cmd_record(args):
    serial = get_serial()
    folder = OUT_ROOT / args.app
    folder.mkdir(parents=True, exist_ok=True)
    print("폰에서 수집할 화면을 연 뒤 이름을 입력하고 Enter. 종료는 빈 입력 또는 q.")
    while True:
        name = input("화면 이름(예: 검사결과_목록) > ").strip()
        if name.lower() in ("", "q"):
            break
        lines = collect(serial, args.scroll)
        if not lines:
            print("텍스트를 읽지 못했습니다. 앱이 화면 조회를 차단했을 수 있습니다. 우회하지 말고 캡처/PDF 방식을 사용하십시오.")
            continue
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        safe = re.sub(r"[^0-9A-Za-z가-힣_-]", "_", name)
        path = folder / f"{stamp}_{safe}.json"
        path.write_text(json.dumps({"app": args.app, "screen": name, "collected_at": stamp, "lines": lines},
                                   ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"저장: {path} ({len(lines)}줄)")


def cmd_export(args):
    folder = OUT_ROOT / args.app
    screens = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(folder.glob("*.json"))
               if p.name != "merged.json"]
    out = folder / "merged.json"
    out.write_text(json.dumps(screens, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"병합 완료: {out} ({len(screens)}개 화면)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check").set_defaults(fn=cmd_check)
    r = sub.add_parser("record")
    r.add_argument("--app", required=True)
    r.add_argument("--scroll", action="store_true")
    r.set_defaults(fn=cmd_record)
    e = sub.add_parser("export")
    e.add_argument("--app", required=True)
    e.set_defaults(fn=cmd_export)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
