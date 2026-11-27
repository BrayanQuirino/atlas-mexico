import React,{useEffect,useRef,useState,forwardRef,useImperativeHandle} from 'react';import maplibregl from 'maplibre-gl';import L from 'leaflet';import 'maplibre-gl/dist/maplibre-gl.css';import 'leaflet/dist/leaflet.css';import {area,categories} from '../catalog.js';
const center=[19.40,-99.16];const lnglat=p=>[p.xy[1],p.xy[0]];function group(ps){const g=new Map();ps.forEach((p,i)=>{const k=p.xy.join(',');if(!g.has(k))g.set(k,[]);g.get(k).push({p,i})});return g}
const ExplorerMap=forwardRef(function ExplorerMap({visible,route,onSelect,onArea,onRoute},ref){const host=useRef(null),engine=useRef(null),markers=useRef([]),[ready,setReady]=useState(0),[status,setStatus]=useState('Connecting to map…');const callbacks=useRef({});callbacks.current={onSelect,onArea,onRoute};useEffect(()=>{let alive=true,primary,backup,timer;const fallback=()=>{if(!alive||backup)return;clearTimeout(timer);if(primary){primary.remove();primary=null}try{backup=L.map(host.current).setView(center,11);const layer=L.layerGroup().addTo(backup);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).on('tileload',()=>alive&&setStatus('OpenStreetMap · Backup')).on('tileerror',()=>alive&&setStatus('Map tiles unavailable · pins still work')).addTo(backup);engine.current={kind:'leaflet',map:backup,layer};setStatus('Loading backup map…');setReady(x=>x+1)}catch{setStatus('Map unavailable')}};try{primary=new maplibregl.Map({container:host.current,style:'https://tiles.openfreemap.org/styles/liberty',center:[center[1],center[0]],zoom:10.8,maxZoom:19});primary.addControl(new maplibregl.NavigationControl(),'top-left');primary.once('load',()=>{if(!alive||!primary)return;clearTimeout(timer);engine.current={kind:'maplibre',map:primary};setStatus('OpenFreeMap · Live');setReady(x=>x+1)});primary.on('error',e=>{if(primary&&!primary.isStyleLoaded()&&e.error?.status===403)fallback()});timer=setTimeout(()=>{if(primary&&!engine.current)fallback()},15000)}catch{fallback()}const observer=new ResizeObserver(()=>{const e=engine.current;if(e?.kind==='maplibre')e.map.resize();else e?.map.invalidateSize()});observer.observe(host.current);return()=>{alive=false;clearTimeout(timer);observer.disconnect();markers.current.forEach(m=>m.remove());markers.current=[];engine.current=null;primary?.remove();backup?.remove()}},[]);
useImperativeHandle(ref,()=>({fit(ps){ps=ps.filter(p=>p.xy);const e=engine.current;if(!e||!ps.length)return;if(e.kind==='maplibre'){const b=new maplibregl.LngLatBounds();ps.forEach(p=>b.extend(lnglat(p)));e.map.fitBounds(b,{padding:55,maxZoom:13,duration:500})}else e.map.fitBounds(L.latLngBounds(ps.map(p=>p.xy)),{padding:[45,45],maxZoom:13})},select(p){if(!p.xy)return;const e=engine.current;if(e?.kind==='maplibre')e.map.flyTo({center:lnglat(p),zoom:Math.max(14,e.map.getZoom()),duration:600});else e?.map.flyTo(p.xy,Math.max(14,e.map.getZoom()))},reset(){const e=engine.current;if(e?.kind==='maplibre')e.map.flyTo({center:[center[1],center[0]],zoom:10.8});else e?.map.setView(center,11)}}),[]);
useEffect(()=>{
 const e=engine.current;if(!e)return;
 const order=new Map(route.map((p,i)=>[p.id,i+1]));
 const all=new Map(visible.map(p=>[p.id,p]));route.forEach(p=>all.set(p.id,p));
 const points=[...all.values()].filter(p=>p.xy);
 const lineFeatures=route.slice(1).flatMap((p,i)=>p.locationStatus==='sourced'&&route[i].locationStatus==='sourced'?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[lnglat(route[i]),lnglat(p)]}}]:[]);
 const geo={type:'FeatureCollection',features:lineFeatures};
 let frame=0,lastDraw=0,active=new Map(),lineLayer;
 if(e.kind==='maplibre'){
   if(e.map.getSource('atlas-route'))e.map.getSource('atlas-route').setData(geo);
   else{e.map.addSource('atlas-route',{type:'geojson',data:geo});e.map.addLayer({id:'atlas-route-line',type:'line',source:'atlas-route',paint:{'line-color':'#a16e49','line-width':4,'line-dasharray':[2,2]}})}
 }else{lineLayer=L.layerGroup().addTo(e.map);lineFeatures.forEach(f=>L.polyline(f.geometry.coordinates.map(([lng,lat])=>[lat,lng]),{color:'#a16e49',weight:4,dashArray:'7 7'}).addTo(lineLayer))}
 const project=p=>e.kind==='maplibre'?e.map.project(lnglat(p)):e.map.latLngToContainerPoint(p.xy);
 function fly(p,zoom){if(e.kind==='maplibre')e.map.easeTo({center:lnglat(p),zoom,duration:400});else e.map.setView(p.xy,zoom)}
 function renderMarkers(){
   const zoom=e.map.getZoom(),wanted=new Map();
   function add(p,key,label,title,offset,click,style=''){
     wanted.set(key,{p,label,title,offset,click,style});
   }
   function individual(p,offset=[0,0]){
     const n=order.get(p.id),approx=p.locationStatus!=='sourced';
     add(p,p.id,n?String(n):categories[p.c][1],(n?'Stop '+n+' · ':'')+p.name+(approx?' · area only':''),offset,()=>callbacks.current.onSelect(p),(n?' count route-pin':'')+(approx?' approximate-pin':''));
   }
   function spread(items,base=[0,0]){
     let ring=1,slot=0;
     items.forEach((p,i)=>{if(!i){individual(p,base);return}const capacity=6*ring,a=2*Math.PI*slot/capacity-Math.PI/2;individual(p,[base[0]+Math.round(44*ring*Math.cos(a)),base[1]+Math.round(44*ring*Math.sin(a))]);if(++slot>=capacity){ring++;slot=0}});
   }
   const ordinary=points.filter(p=>!order.has(p.id)&&p.locationStatus==='sourced');
   const clusters=[];
   ordinary.forEach(p=>{const pt=project(p);const c=clusters.find(c=>Math.hypot(c.x-pt.x,c.y-pt.y)<(zoom>=17?35:58));if(c)c.items.push(p);else clusters.push({x:pt.x,y:pt.y,items:[p]})});
   clusters.forEach(c=>{
     if(c.items.length===1){individual(c.items[0]);return}
     if(zoom>=17){spread(c.items);return}
     const p=c.items[0],key='cluster:'+c.items.map(x=>x.id).sort().join('|');
     add(p,key,String(c.items.length),c.items.length+' mapped places · zoom in',[0,0],()=>fly(p,Math.min(19,zoom+1.7)),' count');
   });
   // Restore all catalog destinations without pretending their area centers are exact.
   const pending=points.filter(p=>p.locationStatus!=='sourced'&&!order.has(p.id));
   const pendingGroups=[];
   pending.forEach(p=>{
     const pt=project(p);
     const c=pendingGroups.find(c=>zoom<14?Math.hypot(c.x-pt.x,c.y-pt.y)<58:c.items[0].z===p.z);
     if(c)c.items.push(p);else pendingGroups.push({x:pt.x,y:pt.y,items:[p]});
   });
   pendingGroups.forEach(c=>{
     const p=c.items[0];
     if(c.items.length===1){add(p,'approx:'+p.id,categories[p.c][1],p.name+' · approximate area',[0,0],()=>callbacks.current.onSelect(p),' approximate-pin');return}
     if(zoom>=15){spread(c.items,[0,0]);return}
     const key='approx:'+c.items.map(x=>x.id).sort().join('|');
     add(p,key,String(c.items.length),c.items.length+' destinations in this approximate area · zoom to expand',[0,0],()=>fly(p,Math.min(19,zoom<14?14:15)),' count approximate-pin');
   });
   group(points.filter(p=>order.has(p.id)&&p.locationStatus!=='sourced')).forEach(items=>spread(items.map(x=>x.p),[0,-48]));
   // Numbered route stops with known coordinates stay separate from discovery clusters.
   group(points.filter(p=>order.has(p.id)&&p.locationStatus==='sourced')).forEach(items=>spread(items.map(x=>x.p)));
   for(const [key,entry] of active){if(!wanted.has(key)){entry.marker.remove();active.delete(key)}}
   for(const [key,item] of wanted){
     const existing=active.get(key);
     if(existing&&existing.signature===item.offset.join(',')+'|'+item.style+'|'+item.label){existing.button.onclick=ev=>{ev.stopPropagation();item.click()};continue}
     if(existing){existing.marker.remove();active.delete(key)}
     const button=document.createElement('button');button.type='button';button.className='pin individual-pin'+item.style;button.textContent=item.label;button.title=item.title;button.setAttribute('aria-label',item.title);button.onclick=ev=>{ev.stopPropagation();item.click()};
     let marker;
     if(e.kind==='maplibre')marker=new maplibregl.Marker({element:button,offset:item.offset}).setLngLat(lnglat(item.p)).addTo(e.map);
     else marker=L.marker(item.p.xy,{icon:L.divIcon({html:button,iconSize:[38,38],iconAnchor:[19-item.offset[0],19-item.offset[1]]}),keyboard:false}).addTo(e.map);
     active.set(key,{marker,button,signature:item.offset.join(',')+'|'+item.style+'|'+item.label});
   }
 }
 function schedule(){if(frame)return;frame=requestAnimationFrame(t=>{frame=0;if(t-lastDraw>=45){lastDraw=t;renderMarkers()}else schedule()})}
 e.map.on('zoom',schedule);e.map.on('move',schedule);e.map.on('zoomend',schedule);
 renderMarkers();
 return()=>{cancelAnimationFrame(frame);e.map.off('zoom',schedule);e.map.off('move',schedule);e.map.off('zoomend',schedule);active.forEach(x=>x.marker.remove());lineLayer?.remove()};
},[visible,route,ready]);return <><div id="map" ref={host}/><div className="mapnote"><span className="mapstatus">{status}</span><br/>Numbers count places. Gray dashed markers are approximate areas; green markers use sourced coordinates.</div></>});export default ExplorerMap;