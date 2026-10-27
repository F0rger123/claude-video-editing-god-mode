#!/usr/bin/env python3
"""Emphasis-zoom engine: turn a taste-driven zoom map into a rendered video.

The whole clip is ONE piecewise-linear zoom(t) envelope. Events expand into
keyframes; the final zoom at any instant is max(1, all events) so overlapping
releases blend upward instead of snapping to 1.0.

Event types (JSON map = a list of these):
  {"type":"punch",    "t":4.55, "peak":1.22, "hold":0.5, "label":"..."}
      snap in ~0.18s on the word, hold, release ~0.35s  -> DRAMATIC emphasis
  {"type":"kenburns", "t0":11.8,"t1":15.0, "peak":1.12, "label":"..."}
      slow continuous push across an insight line, gentle release -> INSIGHT
  {"type":"ratchet",  "steps":[[4.55,1.16],[5.4,1.2],[5.95,1.24]], "label":"..."}
      listicle step-build: each item bumps in + holds, release after last

Focal point defaults to (0.5, 0.42) = horizontally centered, biased up toward a
face in a vertical talking-head. Override with --cx/--cy.

Usage:
  python3 zoom_lib.py render INPUT.mp4 OUTPUT.mp4 MAP.json [--cx 0.5 --cy 0.42 --crf 19]
  python3 zoom_lib.py filter INPUT.mp4 MAP.json           # just print the filtergraph
"""
import json, subprocess, sys, argparse

RELEASE = 0.35  # only Ken Burns eases; punches & ratchets are HARD CUTS (1-frame jumps)

def probe(path):
    out = subprocess.check_output([
        "ffprobe","-v","error","-select_streams","v:0",
        "-show_entries","stream=width,height,r_frame_rate",
        "-of","default=noprint_wrappers=1:nokey=1", path]).decode().split()
    w, h, rate = int(out[0]), int(out[1]), out[2]
    num, den = (rate.split("/")+["1"])[:2]
    return w, h, float(num)/float(den)

# ---- events -> keyframes -------------------------------------------------
# HARD CUT = two keyframes at the same time; the frame-fixer spaces them 1 frame
# apart, so the zoom jumps instantly (no ramp). Only Ken Burns ramps.
def kf_punch(e):
    t, p, hold = e["t"], e["peak"], e.get("hold", 0.5)
    return [(t,1.0),(t,p),(t+hold,p),(t+hold,1.0)]  # cut IN, hold, cut OUT

def kf_kenburns(e):
    t0,t1,p = e["t0"], e["t1"], e["peak"]
    return [(t0,1.0),(t1,p),(t1+RELEASE+0.15,1.0)]  # smooth push + gentle release

def kf_ratchet(e):
    steps = e["steps"]
    hold = e.get("hold", 0.45)
    kf=[(steps[0][0],1.0)]
    for i,(t,p) in enumerate(steps):
        kf.append((t,p))                                   # hard cut up to this step
        end = steps[i+1][0] if i+1<len(steps) else t+hold
        kf.append((end,p))                                 # hold this level
    lt,lp = steps[-1]
    kf.append((lt+hold,1.0))                               # hard cut back to 1.0
    return kf

KF = {"punch":kf_punch, "kenburns":kf_kenburns, "ratchet":kf_ratchet}

def event_expr(kf, fps):
    parts=[]
    for t,z in kf:
        parts.append((round(t*fps), round(max(1.0,z),4)))
    fixed=[]
    for fr,z in parts:
        if fixed and fr<=fixed[-1][0]: fr=fixed[-1][0]+1
        fixed.append((fr,z))
    parts=fixed
    expr=f"{parts[-1][1]}"
    for i in range(len(parts)-2,-1,-1):
        f0,z0=parts[i]; f1,z1=parts[i+1]
        expr=f"if(lte(on\\,{f1})\\,{z0}+({z1-z0:.4f})*(on-{f0})/{f1-f0}\\,{expr})"
    return expr

def build_expr(events, fps):
    inner="1"
    for e in events:
        inner=f"max({event_expr(KF[e['type']](e), fps)}\\,{inner})"
    return inner

def build_filter(events, w, h, fps, cx=0.5, cy=0.42):
    expr=build_expr(events, fps)
    return (f"[0:v]zoompan=z='{expr}':"
            f"x='iw*{cx}*(1-1/zoom)':y='ih*{cy}*(1-1/zoom)':"
            f"d=1:s={w}x{h}:fps={fps:.6f},format=yuv420p[v]")

# ---- CLI -----------------------------------------------------------------
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["render","filter"])
    ap.add_argument("input")
    ap.add_argument("a"); ap.add_argument("b", nargs="?")
    ap.add_argument("--cx", type=float, default=0.5)
    ap.add_argument("--cy", type=float, default=0.42)
    ap.add_argument("--crf", type=int, default=19)
    args=ap.parse_args()
    w,h,fps=probe(args.input)

    if args.cmd=="filter":
        events=json.load(open(args.a))
        print(build_filter(events,w,h,fps,args.cx,args.cy)); return

    output, mapf = args.a, args.b
    events=json.load(open(mapf))
    filt=build_filter(events,w,h,fps,args.cx,args.cy)
    ftxt=output+".filter.txt"; open(ftxt,"w").write(filt)
    peaks=[]
    for e in events:
        kf=KF[e['type']](e); peaks.append((round(kf[0][0],2),round(kf[-1][0],2),max(z for _,z in kf),e.get("label","")))
    print(f"{len(events)} events, {w}x{h} @ {fps:.3f}fps:")
    for s,en,pk,l in peaks: print(f"  {s:6.2f}-{en:6.2f}  peak {pk:.2f}  {l}")
    cmd=["ffmpeg","-y","-v","error","-stats","-i",args.input,
         "-filter_complex_script",ftxt,"-map","[v]","-map","0:a",
         "-c:v","libx264","-crf",str(args.crf),"-preset","medium","-pix_fmt","yuv420p",
         "-c:a","copy","-movflags","+faststart",output]
    subprocess.run(cmd, check=True)
    print("\nwrote", output)

if __name__=="__main__":
    main()
