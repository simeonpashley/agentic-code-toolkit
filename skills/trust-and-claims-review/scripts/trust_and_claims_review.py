#!/usr/bin/env python3
from __future__ import annotations
import argparse, os, re, json
from pathlib import Path

EXT={".md",".mdx",".txt",".html",".tsx",".ts",".jsx",".js",".json",".yml",".yaml"}
PATTERNS={
 "HIGH_RISK_PRIVACY_SECURITY":[r"\banonymous\b",r"\bzero[- ]knowledge\b",r"\bend[- ]to[- ]end encrypted\b",r"\bE2EE\b",r"\bsecure deletion\b",r"\bpermanently deleted\b",r"\bno tracking\b",r"\bfully private\b",r"\bunhackable\b",r"\bmilitary[- ]grade\b"],
 "HIGH_RISK_COMPLIANCE":[r"\bGDPR compliant\b",r"\bHIPAA compliant\b",r"\bSOC ?2\b",r"\bISO ?27001\b",r"\bcertified\b"],
 "HIGH_RISK_OUTCOME":[r"\bclinically proven\b",r"\bimproves mental health\b",r"\btreats?\b",r"\bdiagnos(e|is|tic)\b"],
 "TRACTION_SUPERIORITY":[r"\btrusted by thousands\b",r"\bloved by millions\b",r"\bbest\b",r"\bnumber one\b",r"\bguaranteed\b",r"\bunlimited\b",r"\blifetime\b"]
}
def files(paths):
 for p in map(Path,paths):
  if p.is_file() and p.suffix.lower() in EXT: yield p
  elif p.is_dir():
   for root,dirs,fs in os.walk(p):
    dirs[:]=[d for d in dirs if d not in {".git","node_modules",".next","dist","build"}]
    for f in fs:
     fp=Path(root)/f
     if fp.suffix.lower() in EXT: yield fp
def scan(p):
 t=p.read_text(encoding="utf-8",errors="ignore"); out=[]
 for g,ps in PATTERNS.items():
  for pat in ps:
   for m in re.finditer(pat,t,re.I):
    line=t.count("\n",0,m.start())+1
    sn=t[max(0,m.start()-70):min(len(t),m.end()+70)].replace("\n"," ").strip()
    out.append({"group":g,"line":line,"match":m.group(0),"snippet":sn})
 return {"file":str(p),"findings":out}
def main():
 ap=argparse.ArgumentParser(); ap.add_argument("paths",nargs="+"); ap.add_argument("--json",action="store_true"); a=ap.parse_args()
 res=[r for r in (scan(p) for p in files(a.paths)) if r["findings"]]
 if a.json: print(json.dumps(res,indent=2)); return
 print(f"Trust/claims audit: {sum(len(r['findings']) for r in res)} findings across {len(res)} files.\n")
 for r in res:
  print("##",r["file"])
  for f in r["findings"]:
   print(f"- [{f['group']}] line {f['line']}: {f['match']!r}\n  {f['snippet']}")
  print()
 print("Findings are review candidates, not conclusions.")
if __name__=="__main__": main()
