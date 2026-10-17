#!/usr/bin/env python3
"""SPDX-License-Identifier: MIT. Build FreeJ2ME-Web Java sources, without downloads.

Supply a separate upstream checkout. This does not build CheerpJ or FluidSynth WASM,
and does not provide a browser runtime. It preserves the upstream resources in the JAR.
"""
import argparse
from pathlib import Path
import subprocess
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
root = args.source.resolve(strict=True)
out = args.out.resolve()
if root == out or root in out.parents:
    parser.error('--out must be outside the upstream checkout')
sources = sorted((root / 'src').rglob('*.java'))
if not sources:
    parser.error('No upstream Java sources')
classes = out / 'classes'
if classes.exists():
    parser.error('Use a fresh output directory to avoid stale classes')
classes.mkdir(parents=True)
# javac argument files need quoting when checkout paths contain spaces.
source_list = out / 'sources.txt'
source_list.write_text('\n'.join('"' + str(p).replace('\\', '\\\\').replace('"', '\\"') + '"' for p in sources))
subprocess.run(['java', '--module', 'jdk.compiler/com.sun.tools.javac.Main', '--release', '8',
                '-d', str(classes), '@' + str(source_list)], check=True)
jar = out / 'freej2me-web.jar'
count = 0
with zipfile.ZipFile(jar, 'w', zipfile.ZIP_DEFLATED) as archive:
    for folder in [classes, root / 'resources']:
        for file in sorted(folder.rglob('*')):
            if file.is_file():
                archive.write(file, str(file.relative_to(folder)))
                count += 1
print(str(len(sources)) + ' Java sources; ' + str(count) + ' JAR entries; output: ' + str(jar))
