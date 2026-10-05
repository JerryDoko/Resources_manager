"""Local Kokoro worker. JSON lines in/out; text never leaves the computer."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time
import wave
import os
import threading

# Embedded Windows Python omits the script directory from its isolated search path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from opencc import OpenCC
import sherpa_onnx
from narration import prepare


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--cache", required=True, type=Path)
    parser.add_argument("--threads", type=int, default=2, choices=range(1, 33))
    parser.add_argument("--model-key", default="bundled-kokoro-v1.1")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--benchmark", action="store_true")
    args = parser.parse_args()
    parent = os.getppid()
    def watch_parent():
        if os.name == "nt":
            import ctypes
            from ctypes import wintypes
            kernel = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
            kernel.OpenProcess.restype = wintypes.HANDLE
            kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
            kernel.CloseHandle.argtypes = [wintypes.HANDLE]
            handle = kernel.OpenProcess(0x00100000, False, parent)
            if handle:
                kernel.WaitForSingleObject(handle, 0xFFFFFFFF)
                kernel.CloseHandle(handle)
            os._exit(0)
        while True:
            time.sleep(1)
            if os.getppid() != parent:
                os._exit(0)
    threading.Thread(target=watch_parent, daemon=True).start()
    model = args.model
    onnx = model / ("model.onnx" if (model / "model.onnx").exists() else "model.int8.onnx")
    load_start = time.perf_counter()
    rules = [str(model / name) for name in ("date-zh.fst", "number-zh.fst", "phone-zh.fst") if (model / name).exists()]
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=str(onnx), voices=str(model / "voices.bin"),
                tokens=str(model / "tokens.txt"), data_dir=str(model / "espeak-ng-data"),
                lexicon=",".join(str(model / name) for name in ("lexicon-us-en.txt", "lexicon-zh.txt")),
            ), num_threads=args.threads, debug=False, provider="cpu",
        ), rule_fsts=",".join(rules), max_num_sentences=1,
    )
    if not config.validate():
        raise RuntimeError("Kokoro 模型文件不完整，请重新运行安装脚本。")
    engine = sherpa_onnx.OfflineTts(config)
    load_seconds = time.perf_counter() - load_start
    if engine.num_speakers != 103:
        raise RuntimeError("需要 Kokoro v1.1 中英模型（103 个音色）。")
    if args.check:
        emit({"checked": True, "speakers": engine.num_speakers, "loadSeconds": load_seconds})
        return
    if args.benchmark:
        start = time.perf_counter()
        audio = engine.generate(text="清晨的阳光透过窗帘，洒在书桌上。他放下手中的书，轻声说道：今天我们继续读下一章。窗外传来鸟鸣，故事也慢慢展开。", sid=22, speed=1.0)
        if len(audio.samples) == 0:
            raise RuntimeError("测试未能生成音频。")
        emit({"benchmark": True, "speakers": engine.num_speakers, "loadSeconds": load_seconds,
              "elapsed": time.perf_counter() - start, "duration": len(audio.samples) / audio.sample_rate})
        return
    converter = OpenCC("t2s")
    emit({"ready": True, "speakers": engine.num_speakers, "threads": args.threads})
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            start = time.perf_counter()
            text = converter.convert(prepare(request["text"]))
            sid = int(request["speaker"])
            if not text.strip() or len(text) > 1000 or not 0 <= sid < engine.num_speakers:
                raise ValueError("正文或音色编号无效。")
            key = hashlib.sha256(f"kokoro-v1.1-book-v3|{args.model_key}|{sid}|{text}".encode()).hexdigest()
            cache = Path(request.get("cache", str(args.cache)))
            path = cache / f"{key}.wav"
            cached = path.exists()
            if not cached:
                audio = engine.generate(text, sid=sid, speed=1.0)
                if len(audio.samples) == 0:
                    raise RuntimeError("未能生成音频，请尝试其他段落。")
                temporary = path.with_suffix(".tmp.wav")
                sherpa_onnx.write_wave(str(temporary), audio.samples, audio.sample_rate)
                temporary.replace(path)
            with wave.open(str(path), "rb") as stream:
                duration = stream.getnframes() / stream.getframerate()
            emit({"id": request["id"], "path": str(path), "cached": cached,
                  "duration": duration, "elapsed": time.perf_counter() - start})
        except Exception as exc:
            emit({"id": request.get("id", ""), "error": str(exc)})


if __name__ == "__main__":
    main()
