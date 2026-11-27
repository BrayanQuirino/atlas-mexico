"""Match the curated catalog to bulk geographic data, never to invented coordinates."""
import argparse,csv,json,math,re,unicodedata,zipfile,io
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1]
def norm(s):
    return ' '.join(re.findall(r'[a-z0-9]+',unicodedata.normalize('NFKD',str(s or '')).encode('ascii','ignore').decode().lower()))
def distance(a,b):
    x,y=map(math.radians,a);u,v=map(math.radians,b)
    return 6371*2*math.asin(min(1,math.sqrt(math.sin((x-u)/2)**2+math.cos(x)*math.cos(u)*math.sin((y-v)/2)**2)))
def aliases(name):
    return {norm(name),norm(re.sub(r'\s*\([^)]*\)','',name))}
def read_denue(path,index):
    def ingest(stream):
        for row in csv.DictReader(stream):
            r={norm(k):v for k,v in row.items()}
            try: xy=[float(r['latitud']),float(r['longitud'])]
            except (KeyError,ValueError,TypeError): continue
            name=r.get('nom estab') or r.get('nombre de la unidad economica')
            if not name or norm(name) not in index: continue
            ident=r.get('id') or r.get('clee')
            if not ident: continue
            address=', '.join(filter(None,[r.get('nom vial'),r.get('numero ext'),r.get('nomb asent'),r.get('municipio'),r.get('entidad'),r.get('cod postal')]))
            yield dict(name=name,coordinates=xy,source='https://www.inegi.org.mx/app/mapa/denue/',sourceId=str(ident),provider='INEGI DENUE',address=address or None,precision='establishment')
    if path.suffix.lower()=='.zip':
        with zipfile.ZipFile(path) as z:
            for n in z.namelist():
                if n.lower().endswith('.csv') and 'diccionario' not in n.lower():
                    with z.open(n) as raw:
                        yield from ingest(io.TextIOWrapper(raw,encoding='utf-8-sig',errors='replace'))
    else:
        with path.open(encoding='utf-8-sig',errors='replace',newline='') as stream: yield from ingest(stream)
def read_osm(path,index):
    import osmium
    class Handler(osmium.SimpleHandler):
        def __init__(self):
            super().__init__();self.rows=[]
        def put(self,obj,xy,kind,ident):
            names=[obj.tags.get(k) for k in ('name','name:es','official_name','alt_name','brand')]
            matched=next((n for n in names if norm(n) in index),None)
            if not matched: return
            if not (18.3<=xy[0]<=21 and -100.6<=xy[1]<=-97.8):return
            addr=', '.join(filter(None,[obj.tags.get('addr:street'),obj.tags.get('addr:housenumber'),obj.tags.get('addr:suburb'),obj.tags.get('addr:city')]))
            self.rows.append(dict(name=matched,coordinates=xy,source=f'https://www.openstreetmap.org/{kind}/{ident}',sourceId=f'{kind}/{ident}',provider='OpenStreetMap / Geofabrik',address=addr or None,precision='point' if kind=='node' else 'feature representative point'))
        def node(self,n):
            if n.location.valid(): self.put(n,[n.location.lat,n.location.lon],'node',n.id)
        def way(self,w):
            if not any(norm(w.tags.get(k)) in index for k in ('name','name:es','official_name','alt_name','brand')):return
            pts=[(n.location.lat,n.location.lon) for n in w.nodes if n.location.valid()]
            if pts:
                mid=[sum(x[0] for x in pts)/len(pts),sum(x[1] for x in pts)/len(pts)]
                # Use a real vertex for linear features rather than a fictitious building entrance.
                xy=list(min(pts,key=lambda x:distance(x,mid)))
                self.put(w,xy,'way',w.id)
    h=Handler();h.apply_file(str(path),locations=True,idx='flex_mem');return h.rows
def choose(p,rows,zones):
    origin=zones[p['z']]
    candidates=[r for r in rows if all(math.isfinite(v) for v in r['coordinates']) and 18.3<=r['coordinates'][0]<=21 and -100.6<=r['coordinates'][1]<=-97.8 and distance(origin,r['coordinates'])<(20 if p['c']>=12 else 5) and distance(origin,r['coordinates'])>0.0001]
    candidates.sort(key=lambda r:distance(origin,r['coordinates']))
    if not candidates:return None,'no exact name match within expected region'
    # A chain or conflicting feature cannot be silently assigned to the nearest branch.
    if any(distance(candidates[0]['coordinates'],r['coordinates'])>0.20 for r in candidates[1:]):return None,'ambiguous or conflicting candidates'
    prefer_denue=p['c'] in (0,3,4,5,11)
    candidates.sort(key=lambda r:(r['provider']!='INEGI DENUE' if prefer_denue else r['provider']=='INEGI DENUE',r['precision']!='point'))
    best=dict(candidates[0]);best['status']='sourced';best['matchedName']=best.pop('name');best['matchMethod']='exact normalized name and geographic consistency'
    return best,None
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--osm',type=Path);ap.add_argument('--denue',type=Path,nargs='*',default=[]);ap.add_argument('--apply',action='store_true');args=ap.parse_args()
    if not args.osm and not args.denue:ap.error('at least one source file is required')
    file=ROOT/'src/data/places.json';db=json.loads(file.read_text());index={a for p in db['places'] for a in aliases(p['name']) if a};rows=defaultdict(list)
    for path in args.denue:
        for r in read_denue(path,index):rows[norm(r['name'])].append(r)
    if args.osm:
        for r in read_osm(args.osm,index):rows[norm(r['name'])].append(r)
    unresolved=[];conflicts=[];added=0
    for p in db['places']:
        candidates=[r for a in aliases(p['name']) for r in rows[a]]
        best,reason=choose(p,candidates,db['zones'])
        if p.get('location'):
            if best and distance(p['location']['coordinates'],best['coordinates'])>.20:conflicts.append({'id':p['id'],'existing':p['location'],'candidate':best})
            continue
        if best:p['location']=best;added+=1
        else:unresolved.append({'id':p['id'],'reason':reason,'candidates':candidates[:8]})
    report={'total':len(db['places']),'added':added,'mapped':sum(bool(p.get('location')) for p in db['places']),'unresolved':unresolved,'existingConflicts':conflicts}
    (ROOT/'geocoding-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if args.apply:file.write_text(json.dumps(db,ensure_ascii=False,indent=2)+'\n')
    print({k:v if isinstance(v,int) else len(v) for k,v in report.items()})
if __name__=='__main__':main()
