#!/usr/bin/env python3
import argparse, json, os, sys

FILES=['manifest.json','subtitles.json','quizzes.json','vocabulary.json','culture.json']
def load(path): return json.load(open(path,encoding='utf-8'))
def main(folder):
    errors=[]
    for name in FILES:
        if not os.path.exists(os.path.join(folder,name)): errors.append(f'missing {name}')
    if errors: print('\n'.join(errors)); return 1
    manifest=load(os.path.join(folder,'manifest.json')); content_id=manifest.get('content_id')
    for name in FILES:
        data=load(os.path.join(folder,name))
        if data.get('schema_version')!='1.0': errors.append(f'{name}: schema_version must be 1.0')
        if name!='manifest.json' and data.get('content_id')!=content_id: errors.append(f'{name}: content_id mismatch')
    subtitles=load(os.path.join(folder,'subtitles.json')); ids=set()
    for cue in subtitles.get('cues',[]):
        ids.add(cue['id']); text=cue.get('source_text','')
        for ann in cue.get('annotations',[]):
            if text and text[ann['start_char']:ann['end_char']]!=ann['text']: errors.append(f"{cue['id']}/{ann['id']}: character range mismatch")
            if ann.get('review_status')!='approved': errors.append(f"{cue['id']}/{ann['id']}: not approved")
    for q in load(os.path.join(folder,'quizzes.json')).get('questions',[]):
        if not q.get('related_subtitle_ids') or not set(q['related_subtitle_ids'])<=ids: errors.append(f"{q.get('id')}: invalid evidence")
    print('PASS' if not errors else 'FAIL')
    for error in errors: print('-',error)
    return 0 if not errors else 1
if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--package-dir',required=True); sys.exit(main(ap.parse_args().package_dir))
