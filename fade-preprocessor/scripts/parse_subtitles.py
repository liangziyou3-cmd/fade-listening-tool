#!/usr/bin/env python3
import argparse, json, re

STAMP = re.compile(r'^\s*\[(?P<h>\d{1,2}):(?P<m>\d{2}):(?P<s>\d{2})(?:\.(?P<ms>\d{1,3}))?\]\s*(?P<text>.+?)\s*$')
SRT = re.compile(r'^(?P<h>\d{2}):(?P<m>\d{2}):(?P<s>\d{2})[,.](?P<ms>\d{3})\s*-->')

def seconds(h, m, s, ms='0'):
    return int(h)*3600 + int(m)*60 + int(s) + int(ms.ljust(3, '0')[:3])/1000

def parse(path):
    lines=open(path, encoding='utf-8-sig').read().splitlines()
    cues=[]; i=0; raw_id=0
    while i < len(lines):
        line=lines[i].strip()
        match=STAMP.match(line)
        if match:
            raw_id+=1; start=seconds(match['h'],match['m'],match['s'],match['ms'] or '0')
            cues.append({'id':f'raw{raw_id:03d}','start':start,'text':match['text']}); i+=1; continue
        if SRT.match(line):
            left,right=line.split('-->')[:2]
            def parse_srt(value):
                h,m,sms=value.strip().split(':'); s,ms=re.split('[,.]',sms); return seconds(h,m,s,ms)
            start=parse_srt(left); end=parse_srt(right.split()[0]); i+=1; text=[]
            while i<len(lines) and lines[i].strip(): text.append(lines[i].strip()); i+=1
            raw_id+=1; cues.append({'id':f'raw{raw_id:03d}','start':start,'end':end,'text':' '.join(text)})
        i+=1
    for index,cue in enumerate(cues):
        if 'end' not in cue: cue['end']=cues[index+1]['start'] if index+1<len(cues) else cue['start']+4
    return {'schema_version':'1.0','cues':cues}

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--input',required=True); ap.add_argument('--output',required=True); args=ap.parse_args()
    json.dump(parse(args.input),open(args.output,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
