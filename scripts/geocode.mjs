import fs from 'node:fs/promises';
const path=new URL('../src/data/places.json',import.meta.url);
const db=JSON.parse(await fs.readFile(path,'utf8'));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases={'Museo Nacional de Arte (MUNAL)':['Museo Nacional de Arte'],'Museo del Chocolate (MUCHO)':['Museo del Chocolate'],'Museo del Objeto del Objeto (MODO)':['Museo del Objeto del Objeto'],'Mirador Torre Latinoamericana':['Torre Latinoamericana'],'Centro de Coyoacán':['Jardín Centenario'],'Rectoría y Biblioteca Central UNAM':['Biblioteca Central'],'El Califa de León':['Taquería El Califa de León'],'Cafebrería El Péndulo':['El Péndulo'],'Fuentes Brotantes':['Parque Nacional Fuentes Brotantes']};
const pending=db.places.filter(p=>!p.location);
const names=[...new Set(pending.flatMap(p=>[p.name,...(aliases[p.name]||[])]))];
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const distance=(a,b)=>{const d=Math.PI/180;return 6371*2*Math.asin(Math.sqrt(Math.sin((a[0]-b[0])*d/2)**2+Math.cos(a[0]*d)*Math.cos(b[0]*d)*Math.sin((a[1]-b[1])*d/2)**2))};
let elements=[],errors=[];
for(let i=0;i<names.length;i+=55){const regex='^('+names.slice(i,i+55).map(escape).join('|')+')$';const query='[out:json][timeout:90];(nwr["name"~'+JSON.stringify(regex)+',i](18.3,-100.6,21,-97.8);nwr["name:es"~'+JSON.stringify(regex)+',i](18.3,-100.6,21,-97.8););out center tags;';try{const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:new URLSearchParams({data:query}),headers:{'User-Agent':'AtlasMexicoCatalog/2.4 (https://github.com/BrayanQuirino/atlas-mexico)'},signal:AbortSignal.timeout(110000)});if(!res.ok)throw Error('HTTP '+res.status);const obj=await res.json();if(!Array.isArray(obj.elements))throw Error('missing elements');elements.push(...obj.elements)}catch(e){errors.push(String(e));}await new Promise(r=>setTimeout(r,2500))}
elements=[...new Map(elements.map(e=>[e.type+'/'+e.id,e])).values()];
let added=0;const unresolved=[];
for(const p of pending){const expected=new Set([p.name,...(aliases[p.name]||[])].map(norm));const origin=db.zones[p.z];const candidates=elements.filter(e=>[e.tags?.name,e.tags?.['name:es'],e.tags?.official_name].some(n=>expected.has(norm(n)))).map(e=>({e,xy:[e.lat??e.center?.lat,e.lon??e.center?.lon]})).filter(x=>x.xy.every(Number.isFinite)).map(x=>({...x,d:distance(origin,x.xy)})).filter(x=>x.d<=(p.c===12||p.c===13?25:5)).sort((a,b)=>a.d-b.d);
const best=candidates[0];if(!best||candidates.some(x=>distance(best.xy,x.xy)>0.15)){unresolved.push({id:p.id,reason:best?'ambiguous multiple locations':'no exact nearby OSM name match',candidates:candidates.slice(0,5).map(x=>({name:x.e.tags.name,coordinates:x.xy,source:'https://www.openstreetmap.org/'+x.e.type+'/'+x.e.id}))});continue}
const t=best.e.tags;const address=[t['addr:street'],t['addr:housenumber'],t['addr:suburb'],t['addr:city']].filter(Boolean).join(', ')||null;
p.location={coordinates:best.xy,source:'https://www.openstreetmap.org/'+best.e.type+'/'+best.e.id,address,status:'sourced',matchedName:t.name||t['name:es']};added++}
await fs.writeFile(path,JSON.stringify(db,null,2)+'\n');await fs.writeFile(new URL('../geocoding-report.json',import.meta.url),JSON.stringify({total:db.places.length,mapped:db.places.filter(p=>p.location).length,added,unresolved,errors},null,2)+'\n');console.log({added,pending:unresolved.length,errors:errors.length});if(errors.length&&!elements.length&&pending.length)process.exitCode=1;
