import fs from 'node:fs/promises';
const key=process.env.GOOGLE_MAPS_API_KEY;
if(!key)throw Error('GOOGLE_MAPS_API_KEY is missing');
const file=new URL('../src/data/places.json',import.meta.url);
const db=JSON.parse(await fs.readFile(file,'utf8'));
const limit=Number(process.env.LOOKUP_LIMIT||292);
if(!Number.isInteger(limit)||limit<1||limit>292)throw Error('Invalid request limit');
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\([^)]*\)/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const now=new Date(), expires=new Date(now.getTime()+29*86400000);
const cache={schemaVersion:1,provider:'Google Maps Platform',generatedAt:now.toISOString(),expiresAt:expires.toISOString(),places:[]};
const report={calls:0,limit,matched:0,unresolved:[]};
for(const p of db.places.slice(0,limit)){
 const origin=db.zones[p.z];report.calls++;
 const req={textQuery:p.name+' '+(db.labels[p.z]||p.z)+' México',languageCode:'es',regionCode:'MX',pageSize:5,locationBias:{circle:{center:{latitude:origin[0],longitude:origin[1]},radius:10000}}};
 let res;
 try{res=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.location'},body:JSON.stringify(req),signal:AbortSignal.timeout(20000)})}catch{throw Error('Network failure; stopped without retry')}
 if(!res.ok)throw Error('Google Places HTTP '+res.status+'; stopped without retry');
 const {places=[]}=await res.json();
 const matches=places.filter(x=>x.id&&x.location&&Number.isFinite(x.location.latitude)&&Number.isFinite(x.location.longitude)&&(x.id===p.googlePlaceId||norm(x.displayName?.text)===norm(p.name))&&Math.hypot(x.location.latitude-origin[0],(x.location.longitude-origin[1])*.94)<(p.c>=12?.18:.045));
 const unique=[...new Map(matches.map(x=>[x.id,x])).values()];
 if(unique.length!==1){report.unresolved.push({id:p.id,reason:unique.length?'ambiguous':'no exact geographic match'});continue}
 const x=unique[0];p.googlePlaceId=x.id;cache.places.push({id:p.id,googlePlaceId:x.id,coordinates:[x.location.latitude,x.location.longitude]});report.matched++;
}
await fs.writeFile(file,JSON.stringify(db,null,2)+'\n');
await fs.mkdir(new URL('../public/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../public/google-coordinates.json',import.meta.url),JSON.stringify(cache)+'\n');
await fs.writeFile(new URL('../google-id-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({calls:report.calls,matched:report.matched,unresolved:report.unresolved.length}));
