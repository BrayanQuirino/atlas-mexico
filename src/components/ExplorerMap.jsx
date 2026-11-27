import React,{useEffect,useRef,useState,forwardRef,useImperativeHandle} from 'react';import maplibregl from 'maplibre-gl';import L from 'leaflet';import 'maplibre-gl/dist/maplibre-gl.css';import 'leaflet/dist/leaflet.css';import {area,categories} from '../catalog.js';
const center=[19.40,-99.16];const lnglat=p=>[p.xy[1],p.xy[0]];function group(ps){const g=new Map();ps.forEach((p,i)=>{const k=p.xy.join(',');if(!g.has(k))g.set(k,[]);g.get(k).push({p,i})});return g}
const ExplorerMap=forwardRef(function ExplorerMap({visible,route,onSelect,onArea,onRoute},ref){const host=useRef(null),engine=useRef(null),markers=useRef([]),[ready,setReady]=useState(0),[zoomRevision,setZoomRevision]=useState(0),[status,setStatus]=useState('Connecting to map…');const callbacks=useRef({});callbacks.current={onSelect,onArea,onRoute};useEffect(()=>{let alive=true,primary,backup,timer;const fallback=()=>{if(!alive||backup)return;clearTimeout(timer);if(primary){primary.remove();primary=null}try{backup=L.map(host.current).setView(center,11);const layer=L.layerGroup().addTo(backup);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).on('tileload',()=>alive&&setStatus('OpenStreetMap · Backup')).on('tileerror',()=>alive&&setStatus('Map tiles unavailable · pins still work')).addTo(backup);engine.current={kind:'leaflet',map:backup,layer};setStatus('Loading backup map…');setReady(x=>x+1)}catch{setStatus('Map unavailable')}};try{primary=new maplibregl.Map({container:host.current,style:'https://tiles.openfreemap.org/styles/liberty',center:[center[1],center[0]],zoom:10.8,maxZoom:19});primary.addControl(new maplibregl.NavigationControl(),'top-left');primary.once('load',()=>{if(!alive||!primary)return;clearTimeout(timer);engine.current={kind:'maplibre',map:primary};setStatus('OpenFreeMap · Live');setReady(x=>x+1)});primary.on('error',e=>{if(primary&&!primary.isStyleLoaded()&&e.error?.status===403)fallback()});timer=setTimeout(()=>{if(primary&&!engine.current)fallback()},15000)}catch{fallback()}const observer=new ResizeObserver(()=>{const e=engine.current;if(e?.kind==='maplibre')e.map.resize();else e?.map.invalidateSize()});observer.observe(host.current);return()=>{alive=false;clearTimeout(timer);observer.disconnect();markers.current.forEach(m=>m.remove());markers.current=[];engine.current=null;primary?.remove();backup?.remove()}},[]);
useImperativeHandle(ref,()=>({fit(ps){const e=engine.current;if(!e||!ps.length)return;if(e.kind==='maplibre'){const b=new maplibregl.LngLatBounds();ps.forEach(p=>b.extend(lnglat(p)));e.map.fitBounds(b,{padding:55,maxZoom:13,duration:500})}else e.map.fitBounds(L.latLngBounds(ps.map(p=>p.xy)),{padding:[45,45],maxZoom:13})},select(p){const e=engine.current;if(e?.kind==='maplibre')e.map.flyTo({center:lnglat(p),zoom:Math.max(14,e.map.getZoom()),duration:600});else e?.map.flyTo(p.xy,Math.max(14,e.map.getZoom()))},reset(){const e=engine.current;if(e?.kind==='maplibre')e.map.flyTo({center:[center[1],center[0]],zoom:10.8});else e?.map.setView(center,11)}}),[]);
useEffect(()=>{const e=engine.current;if(!e)return;const refresh=()=>setZoomRevision(x=>x+1);e.map.on('zoomend',refresh);return()=>e.map.off('zoomend',refresh)},[ready]);
useEffect(()=>{
 const e=engine.current;if(!e)return;
 markers.current.forEach(m=>m.remove());markers.current=[];
 if(e.kind==='leaflet')e.layer.clearLayers();
 // Each destination has exactly one marker. Shared area coordinates are
 // separated visually in pixel space; these offsets are not geocoded locations.
 const order=new Map(route.map((p,i)=>[p.id,i+1]));
 const all=new Map(visible.map(p=>[p.id,p]));route.forEach(p=>all.set(p.id,p));
 const geo={type:'FeatureCollection',features:route.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:route.map(lnglat)}}]:[]};
 if(e.kind==='maplibre'){
   if(e.map.getSource('atlas-route'))e.map.getSource('atlas-route').setData(geo);
   else{e.map.addSource('atlas-route',{type:'geojson',data:geo});e.map.addLayer({id:'atlas-route-line',type:'line',source:'atlas-route',paint:{'line-color':'#a16e49','line-width':4,'line-dasharray':[2,2]}})}
 }else if(route.length>1)L.polyline(route.map(p=>p.xy),{color:'#a16e49',weight:4,dashArray:'7 7'}).addTo(e.layer);
 const add=(p,offset,cluster=null)=>{
   const number=order.get(p.id),b=document.createElement('button');b.type='button';
   b.className='pin individual-pin'+(cluster?' count':number?' count route-pin':'');
   b.textContent=cluster?String(cluster.length):number?String(number):categories[p.c][1];
   b.title=cluster?cluster.length+' places · zoom in to explore':(number?'Stop '+number+' · ':'')+p.name+' · '+area(p.z)+' (approximate area)';
   b.setAttribute('aria-label',b.title);
   b.onclick=event=>{event.stopPropagation();if(cluster){const zoom=Math.min(19,Math.max(e.map.getZoom()+2,14));if(e.kind==='maplibre')e.map.easeTo({center:lnglat(p),zoom,duration:450});else e.map.setView(p.xy,zoom);return}callbacks.current.onSelect(p)};
   if(e.kind==='maplibre'){
     markers.current.push(new maplibregl.Marker({element:b,offset}).setLngLat(lnglat(p)).addTo(e.map));
   }else{
     const icon=L.divIcon({html:b,iconSize:[30,30],iconAnchor:[15-offset[0],15-offset[1]]});
     L.marker(p.xy,{icon,zIndexOffset:number?500:0,keyboard:false}).addTo(e.layer);
   }
 };
 const zoom=e.map.getZoom();
 const points=[...all.values()];
 // Below street zoom, cluster nearby screen positions, including different areas.
 // Route stops remain individually numbered, never confused with cluster counts.
 const ordinary=points.filter(p=>!order.has(p.id));
 const planned=points.filter(p=>order.has(p.id));
 function spread(items,base=[0,0]){
   let ring=1,slot=0;
   items.forEach(({p},i)=>{
     if(i===0){add(p,base);return}
     const capacity=6*ring,angle=2*Math.PI*slot/capacity-Math.PI/2;
     add(p,[base[0]+Math.round(44*ring*Math.cos(angle)),base[1]+Math.round(44*ring*Math.sin(angle))]);
     slot++;if(slot>=capacity){ring++;slot=0}
   });
 }
 if(zoom<14){
   const clusters=[];
   const project=p=>e.kind==='maplibre'?e.map.project(lnglat(p)):e.map.latLngToContainerPoint(p.xy);
   ordinary.forEach(p=>{
     const pt=project(p);
     const near=clusters.find(c=>Math.hypot(c.x-pt.x,c.y-pt.y)<58);
     if(near)near.items.push(p);else clusters.push({x:pt.x,y:pt.y,items:[p]});
   });
   clusters.forEach(c=>add(c.items[0],[0,0],c.items.length>1?c.items:null));
   group(planned).forEach(items=>spread(items,[0,-45]));
 }else{
   group(points).forEach(items=>spread(items));
 }
},[visible,route,ready,zoomRevision]);return <><div id="map" ref={host}/><div className="mapnote"><span className="mapstatus">{status}</span><br/>Zoom in to reveal individual places. Green numbers count nearby places; terracotta numbers show route order. Positions are approximate.</div></>});export default ExplorerMap;