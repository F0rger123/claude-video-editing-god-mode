# Speaker alpha matte with Robust Video Matting (RVM, MobileNetV3 ONNX): much finer hair edges than the
# 256x256 MediaPipe segmenter in matte.py, and temporally stable because the model is recurrent.
# Free and local (RVM is GPL-3.0; the model runs on this PC only). Uses the GPU when onnxruntime-gpu can.
# Usage: tmp/venv-matte/Scripts/python.exe scripts/matte-rvm.py <clean.mp4> <rvm_mobilenetv3_fp32.onnx> <out-mask.mp4> [max_seconds]
# Writes a grayscale mask video (720x1280) at the source frame rate, plus
# <out-mask>-fgr.mp4: RVM's predicted foreground colors. Alphamerge the mask onto THAT video, not the original
# footage, so the room's dark background does not bleed into soft hair edges as a halo.
import sys, subprocess
import numpy as np, cv2
import onnxruntime as ort

src, model, out = sys.argv[1:4]
max_s = float(sys.argv[4]) if len(sys.argv) > 4 else 1e9
W, H = 720, 1280
sess = ort.InferenceSession(model, providers=['CUDAExecutionProvider', 'CPUExecutionProvider'])
print('provider', sess.get_providers()[0])
cap = cv2.VideoCapture(src)
fps = cap.get(cv2.CAP_PROP_FPS)
def writer(path, fmt):
    return subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', fmt, '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
                             '-c:v', 'libx264', '-crf', '8', '-pix_fmt', 'yuv420p' if fmt == 'gray' else 'yuv444p', path], stdin=subprocess.PIPE)
ff = writer(out, 'gray')
fg = writer(out.replace('.mp4', '-fgr.mp4'), 'rgb24')
rec = [np.zeros([1, 1, 1, 1], dtype=np.float32)] * 4
# downsample_ratio 0.4 suits a 720x1280 portrait with the speaker filling the frame (RVM's guidance).
ratio = np.array([0.4], dtype=np.float32)
i = 0
while i < max_s * fps:
    ok, frame = cap.read()
    if not ok: break
    frame = cv2.resize(frame, (W, H), interpolation=cv2.INTER_AREA)
    x = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB).astype(np.float32).transpose(2, 0, 1)[None] / 255.0
    fgr, pha, *rec = sess.run([], {'src': x, 'r1i': rec[0], 'r2i': rec[1], 'r3i': rec[2], 'r4i': rec[3], 'downsample_ratio': ratio})
    ff.stdin.write((np.clip(pha[0, 0], 0, 1) * 255).astype(np.uint8).tobytes())
    fg.stdin.write((np.clip(fgr[0].transpose(1, 2, 0), 0, 1) * 255).astype(np.uint8).tobytes())
    i += 1
for p in (ff, fg): p.stdin.close(); p.wait()
print('frames', i, 'fps', fps)
# Tighten the soft edge before alphamerging, which removes most of the dark-room halo around hair:
#   ffmpeg ... -i <mask.mp4> -vf "format=gray,lutyuv=y='clip((val-110)*255/140,0,255)'" ...
# Setup (once): python -m venv tmp/venv-matte; pip install onnxruntime-gpu opencv-python numpy;
#   model: https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx -> tmp/models/
