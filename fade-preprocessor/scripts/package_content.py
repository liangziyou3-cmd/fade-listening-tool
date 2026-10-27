#!/usr/bin/env python3
import argparse, os, zipfile
ap=argparse.ArgumentParser(); ap.add_argument('--input-dir',required=True); ap.add_argument('--output',required=True); args=ap.parse_args()
with zipfile.ZipFile(args.output,'w',zipfile.ZIP_DEFLATED) as archive:
    for name in os.listdir(args.input_dir):
        path=os.path.join(args.input_dir,name)
        if os.path.isfile(path): archive.write(path,name)
print(args.output)
