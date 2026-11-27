import db from './data/places.json' with {type:'json'};
const {zones,labels,categories,aliases}=db;
const area=z=>labels[z]||z;
const data=db.places.map(p=>({...p,xy:p.coordinates||p.location?.coordinates||null,locationStatus:p.location?.status||'unlocated',locationSource:p.location?.source||null,address:p.address||p.location?.address||null}));
export {zones,categories,data,area,aliases};
