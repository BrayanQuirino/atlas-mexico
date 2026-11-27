import fs from 'node:fs/promises';
const key=process.env.GOOGLE_MAPS_API_KEY;
if(!key)throw new Error('GOOGLE_MAPS_API_KEY secret is missing');
const file=new URL('../src/data/places.json',import.meta.url);
const db=JSON.parse(await fs.readFile(file,'utf8'));
const requested=Number(process.env.LOOKUP_LIMIT||5);
if(!Number.isInteger(requested)||requested<1||requested>292)throw new Error('Invalid request limit');
const limit=requested;
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\([^)]*\)/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const pending=db.places.filter(p=>!p.googlePlaceId&&!p.coordinates).slice(0,limit);
const report=[];let calls=0;
for(const p of pending){
 const origin=db.zones[p.z];calls++;
 const res=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location'},body:JSON.stringify({textQuery:p.name+' '+(db.labels[p.z]||p.z)+' México',languageCode:'es',regionCode:'MX',pageSize:5,locationBias:{circle:{center:{latitude:origin[0],longitude:origin[1]},radius:10000}}}),signal:AbortSignal.timeout(20000)});
 if(!res.ok){report.push({id:p.id,status:'HTTP '+res.status});break}
 const {places=[]}=await res.json();
 const matches=places.filter(x=>normalize(x.displayName?.text)===normalize(p.name)&&x.id&&x.location&&Math.hypot(x.location.latitude-origin[0],(x.location.longitude-origin[1])*0.94)<0.045);
 if(matches.length===1){p.googlePlaceId=matches[0].id;report.push({id:p.id,status:'matched',googlePlaceId:p.googlePlaceId})}
 else report.push({id:p.id,status:matches.length?'ambiguous':'no exact match',candidateIds:places.map(x=>x.id).filter(Boolean)});
}
await fs.writeFile(file,JSON.stringify(db,null,2)+'\n');
await fs.writeFile(new URL('../google-id-report.json',import.meta.url),JSON.stringify({calls,limit,results:report},null,2)+'\n');
console.log('Google requests:',calls,'matched:',report.filter(x=>x.status==='matched').length);
if(report.some(x=>x.status.startsWith('HTTP ')))process.exitCode=1;
