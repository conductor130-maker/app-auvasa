(function(){

const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let G=null,S={tab:'r',route:null,dir:null,stop:null,q:'',date:new Date().toLocaleDateString('sv')};

/* ---------- CSV ---------- */
function pl(l){if(l.indexOf('"')<0)return l.split(',');const o=[];let c='',q=false;
 for(let i=0;i<l.length;i++){const ch=l[i];
  if(q){if(ch=='"'){if(l[i+1]=='"'){c+='"';i++}else q=false}else c+=ch}
  else if(ch=='"')q=true;else if(ch==','){o.push(c);c=''}else c+=ch}
 o.push(c);return o}
function tbl(t){if(!t)return{i:{},r:[]};if(t.charCodeAt(0)==65279)t=t.slice(1);
 const L=t.split(/\r?\n/),i={};pl(L[0]).forEach((k,n)=>i[k.trim()]=n);
 const r=[];for(let n=1;n<L.length;n++)if(L[n])r.push(pl(L[n]));return{i,r}}
const tm=s=>{if(!s)return null;const p=s.split(':');return(+p[0])*60+(+p[1])};
const fmt=m=>{const h=Math.floor(m/60);return String(h%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0')+(h>=24?'<sup>+1</sup>':'')};

/* ---------- Build ---------- */
const zipLib=()=>window.JSZip?Promise.resolve():new Promise((ok,ko)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';s.crossOrigin='anonymous';s.onload=ok;s.onerror=()=>ko(new Error('No se pudo cargar la librería ZIP (¿sin conexión?)'));document.head.appendChild(s)});
async function build(buf){
 await zipLib();const zip=await JSZip.loadAsync(buf);
 const rd=async n=>{const f=zip.file(new RegExp('(^|/)'+n+'$'))[0];return f?f.async('string'):''};
 const [s,r,t,st,c,cd,sh]=await Promise.all(['stops.txt','routes.txt','trips.txt','stop_times.txt','calendar.txt','calendar_dates.txt','shapes.txt'].map(rd));
 if(!r||!t||!st)throw new Error('El archivo no contiene routes.txt, trips.txt y stop_times.txt.');
 const g={stops:new Map(),routes:[],trips:new Map(),st:new Map(),cal:new Map(),exc:new Map(),bySt:null};
 let T=tbl(s);T.r.forEach(x=>g.stops.set(x[T.i.stop_id],{n:x[T.i.stop_name]||x[T.i.stop_id],c:x[T.i.stop_code]||'',lat:parseFloat(x[T.i.stop_lat]),lon:parseFloat(x[T.i.stop_lon])}));
 T=tbl(r);const ri=T.i;
 T.r.forEach(x=>g.routes.push({id:x[ri.route_id],s:x[ri.route_short_name]||'',l:x[ri.route_long_name]||'',bg:x[ri.route_color]||'',fg:x[ri.route_text_color]||''}));
 g.routes.sort((a,b)=>(a.s||a.l).localeCompare(b.s||b.l,'es',{numeric:true}));
 T=tbl(t);const ti=T.i;
 T.r.forEach(x=>{const o={id:x[ti.trip_id],rt:x[ti.route_id],svc:x[ti.service_id],dir:ti.direction_id!=null?x[ti.direction_id]:'',h:(ti.trip_headsign!=null?x[ti.trip_headsign]:'')||'',shp:ti.shape_id!=null?x[ti.shape_id]:''};
  if(!g.trips.has(o.rt))g.trips.set(o.rt,[]);g.trips.get(o.rt).push(o)});
 T=tbl(st);const si=T.i;
 T.r.forEach(x=>{const id=x[si.trip_id];let a=g.st.get(id);if(!a)g.st.set(id,a=[]);
  a.push([x[si.stop_id],tm(x[si.arrival_time]),tm(x[si.departure_time]),+x[si.stop_sequence]])});
 g.st.forEach(a=>a.sort((p,q)=>p[3]-q[3]));
 T=tbl(c);const ci=T.i;
 T.r.forEach(x=>g.cal.set(x[ci.service_id],{d:['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(k=>x[ci[k]]=='1'),s:x[ci.start_date],e:x[ci.end_date]}));
 T=tbl(cd);const di=T.i;
 T.r.forEach(x=>{const k=x[di.service_id];if(!g.exc.has(k))g.exc.set(k,new Map());g.exc.get(k).set(x[di.date],x[di.exception_type])});
 g.shp=new Map();T=tbl(sh);if(T.r.length){const a=new Map(),i=T.i;T.r.forEach(x=>{const id=x[i.shape_id];let l=a.get(id);if(!l)a.set(id,l=[]);l.push([+x[i.shape_pt_sequence],+x[i.shape_pt_lat],+x[i.shape_pt_lon]])});a.forEach((l,id)=>g.shp.set(id,l.sort((p,q)=>p[0]-q[0]).map(p=>[p[1],p[2]])))}
 return g}

function active(svc){
 const d=S.date.replace(/-/g,''),w=(new Date(S.date+'T12:00:00').getDay()+6)%7;
 const e=G.exc.get(svc)&&G.exc.get(svc).get(d);if(e=='1')return true;if(e=='2')return false;
 const c=G.cal.get(svc);return !!c&&d>=c.s&&d<=c.e&&c.d[w]}

/* ---------- Views ---------- */
const col=r=>{const bg=r.bg?'#'+r.bg:'var(--ac)';let fg=r.fg?'#'+r.fg:'var(--acx)';
 if(r.bg&&!r.fg){const n=parseInt(r.bg,16),y=((n>>16)*299+((n>>8)&255)*587+(n&255)*114)/1000;fg=y>150?'#000':'#fff'}
 return`background:${bg};color:${fg}`};
const badge=r=>`<span class="badge" style="${col(r)}">${esc(r.s||r.l.slice(0,6))}</span>`;
const stopName=id=>{const s=G.stops.get(id);return s?s.n:id};

function render(){
 if(S.rt){rtRender();return}
 const app=$('#gx-app');
 if(!G){app.innerHTML=`<div class="empty"><h2>Carga el archivo GTFS</h2><p>Descarga el .zip desde <a href="http://212.170.201.204:50080/GTFSRTapi/api/GTFSFile" target="_blank" rel="noopener">el enlace de tu API</a> y selecciónalo con el botón «Cargar GTFS». Queda guardado en este navegador para la próxima vez.</p><p class="mu">Todo se procesa en tu dispositivo; el archivo no se envía a ningún sitio.</p><div id="err"></div></div>`;return}
 app.innerHTML=`<aside><div class="tabs" role="tablist"><button role="tab" data-t="r" aria-selected="${S.tab=='r'}">Líneas</button><button role="tab" data-t="p" aria-selected="${S.tab=='p'}">Paradas</button></div>
 <input id="q" type="search" placeholder="${S.tab=='r'?'Buscar línea o destino':'Buscar parada'}" value="${esc(S.q)}"><div id="list"></div></aside><section id="det"></section>`;
 app.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{S.tab=b.dataset.t;S.q='';render()});
 $('#q').oninput=e=>{S.q=e.target.value;list()};
 list();detail()}

function list(){
 const q=S.q.toLowerCase().trim(),el=$('#list');let h='';
 if(S.tab=='r'){
  G.routes.filter(r=>!q||(r.s+' '+r.l).toLowerCase().includes(q)).forEach(r=>{
   h+=`<button class="it" data-id="${esc(r.id)}" aria-current="${S.route==r.id}">${badge(r)}<span>${esc(r.l||'Línea '+r.s)}</span></button>`});
  el.innerHTML=h;el.querySelectorAll('.it').forEach(b=>b.onclick=()=>{S.route=b.dataset.id;S.dir=null;list();detail()})}
 else{let n=0;
  for(const[id,s]of G.stops){if(q&&!(s.n+' '+s.c).toLowerCase().includes(q))continue;if(++n>150)break;
   h+=`<button class="it" data-id="${esc(id)}" aria-current="${S.stop==id}"><span>${esc(s.n)}<small>${esc(s.c||id)}</small></span></button>`}
  if(n>150)h+='<p class="mu" style="padding:8px 12px">Hay más resultados: afina la búsqueda.</p>';
  el.innerHTML=h||'<p class="mu" style="padding:8px 12px">Sin resultados.</p>';
  el.querySelectorAll('.it').forEach(b=>b.onclick=()=>{S.stop=b.dataset.id;list();detail()})}}

const dateCtl=()=>`<input id="date" type="date" value="${S.date}" aria-label="Fecha">`;
function bindDate(){$('#date').onchange=e=>{if(e.target.value){S.date=e.target.value;detail()}}}

function detail(){
 const el=$('#det');
 if(S.tab=='r'){
  const r=G.routes.find(x=>x.id==S.route);
  if(!r){el.innerHTML='<p class="mu">Elige una línea de la lista.</p>';return}
  const all=(G.trips.get(r.id)||[]).filter(t=>active(t.svc));
  const key=t=>t.dir!==''?t.dir:t.h,dirs=[...new Set(all.map(key))];
  if(S.dir===null||!dirs.includes(S.dir))S.dir=dirs[0]!==undefined?dirs[0]:null;
  const label=k=>{const c={};all.filter(t=>key(t)==k).forEach(t=>c[t.h]=(c[t.h]||0)+1);
   const top=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];return top&&top[0]?'Hacia '+top[0]:'Sentido '+k};
  let head=`<div class="top">${badge(r)}<h2>${esc(r.l||'Línea '+r.s)}</h2>${dirs.length>1?`<select id="dir" aria-label="Sentido">${dirs.map(k=>`<option value="${esc(k)}"${k==S.dir?' selected':''}>${esc(label(k))}</option>`).join('')}</select>`:''}${dateCtl()}</div>`;
  const trips=all.filter(t=>key(t)==S.dir&&G.st.get(t.id)).sort((a,b)=>{const f=t=>{const s=G.st.get(t.id)[0];return s[2]??s[1]??0};return f(a)-f(b)});
  if(!trips.length){el.innerHTML=head+'<p>No hay servicio de esta línea en la fecha elegida. Prueba con otro día.</p>';bindDate();return}
  const longest=trips.reduce((m,t)=>G.st.get(t.id).length>G.st.get(m.id).length?t:m,trips[0]);
  const order=G.st.get(longest.id).map(x=>x[0]).filter((v,i,a)=>a.indexOf(v)==i);
  trips.forEach(t=>{let p=-1;G.st.get(t.id).forEach(x=>{const k=order.indexOf(x[0]);if(k<0){order.splice(p+1,0,x[0]);p++}else p=k})});
  const cells=trips.map(t=>{const m=new Map();G.st.get(t.id).forEach(x=>{if(!m.has(x[0]))m.set(x[0],x[2]??x[1])});return m});
  let tb=`<div class="wrap"><table><thead><tr><th>${trips.length} viajes</th>${trips.map((t,i)=>`<th>${i+1}</th>`).join('')}</tr></thead><tbody>`;
  order.forEach(id=>{tb+=`<tr><th title="${esc(stopName(id))}">${esc(stopName(id))}</th>${cells.map(m=>{const v=m.get(id);return v==null?'<td class="n">–</td>':`<td>${fmt(v)}</td>`}).join('')}</tr>`});
  el.innerHTML=head+tb+'</tbody></table></div>';
  bindDate();const d=$('#dir');if(d)d.onchange=e=>{S.dir=e.target.value;detail()}}
 else{
  const s=G.stops.get(S.stop);
  if(!s){el.innerHTML='<p class="mu">Elige una parada de la lista.</p>';return}
  if(!G.bySt){G.bySt=new Map();G.trips.forEach(a=>a.forEach(t=>(G.st.get(t.id)||[]).forEach(x=>{
   let l=G.bySt.get(x[0]);if(!l)G.bySt.set(x[0],l=[]);l.push([t,x[2]??x[1]])})))}
  const by=new Map();
  (G.bySt.get(S.stop)||[]).forEach(([t,v])=>{if(v==null||!active(t.svc))return;
   let g=by.get(t.rt);if(!g)by.set(t.rt,g=[]);g.push([v,t.h])});
  let h=`<div class="top"><h2>${esc(s.n)}</h2>${dateCtl()}</div>`;
  const rs=G.routes.filter(r=>by.has(r.id));
  if(!rs.length)h+='<p>No hay pasos por esta parada en la fecha elegida.</p>';
  rs.forEach(r=>{const a=by.get(r.id).sort((p,q)=>p[0]-q[0]);
   h+=`<div class="grp"><h3>${badge(r)}<span>${esc(r.l)}</span></h3><div class="chips">${a.map(x=>`<span title="${esc(x[1])}">${fmt(x[0])}</span>`).join('')}</div></div>`});
  el.innerHTML=h;bindDate()}}

/* ---------- Tiempo real ---------- */
let R=null;
function pb(b){const o=[];let i=0,L=0;const rv=()=>{let r=0,s=0,c,lo=0;do{c=b[i++];r+=(c&127)*2**s;if(s<32)lo|=(c&127)<<s;s+=7}while(c&128);L=lo;return r};
 while(i<b.length){const k=rv(),f=k>>>3,w=k&7;let v,l;
  if(w==0){v=rv();o.push([f,v,L]);continue}
  if(w==2){l=rv();v=b.subarray(i,i+l);i+=l}else if(w==5){v=new DataView(b.buffer,b.byteOffset+i,4);i+=4}else if(w==1){i+=8;continue}else break;
  o.push([f,v])}return o}
const g1=(m,f)=>{const x=m.find(a=>a[0]==f);return x?x[1]:undefined},gi=(m,f)=>{const x=m.find(a=>a[0]==f);return x?x[2]:undefined},ga=(m,f)=>m.filter(a=>a[0]==f).map(a=>a[1]),gs=(m,f)=>{const x=g1(m,f);return x&&x.subarray?new TextDecoder().decode(x):''},sub=(m,f)=>{const x=g1(m,f);return x&&x.subarray?pb(x):[]},fl=d=>d&&d.getFloat32?d.getFloat32(0,true):null;
const tr=m=>{const p=sub(m,1);return{trip:gs(p,1),date:gs(p,3),route:gs(p,5)}};
function feed(buf,r){const m=pb(buf);r.ts=Math.max(r.ts,g1(sub(m,1),3)||0);
 ga(m,2).forEach(e=>{const E=pb(e),tu=sub(E,3),ve=sub(E,4),al=sub(E,5);
  if(tu.length)r.tu.push({...tr(tu),sts:ga(tu,2).map(s=>{const S2=pb(s),a=sub(S2,2),d=sub(S2,3);return{seq:g1(S2,1),stop:gs(S2,4),t:g1(a,2)||g1(d,2)||0,dl:gi(a,1)!==undefined?gi(a,1):gi(d,1)}})});
  if(ve.length){const p=sub(ve,2),vd=sub(ve,8);r.veh.push({...tr(ve),lat:fl(g1(p,1)),lon:fl(g1(p,2)),v:gs(vd,2)||gs(vd,3)||gs(vd,1),num:gs(vd,1),plate:gs(vd,3).trim(),occ:g1(ve,9),ts:g1(ve,5)||0})}
  if(al.length){const tx=f=>{const t=ga(sub(al,f),1)[0];return t?gs(pb(t),1):''};r.al.push({h:tx(10),d:tx(11),en:ga(al,5).map(x=>{const q=pb(x);return{r:gs(q,2),s:gs(q,5)}})})}})}
const hm=u=>u?new Date(u*1000).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}):'–';
const sn=id=>G&&G.stops.get(id)?G.stops.get(id).n:id;
const trR=t=>{if(!G)return'';if(!G.tr){G.tr=new Map();G.trips.forEach(a=>a.forEach(x=>G.tr.set(x.id,x.rt)))}return G.tr.get(t)||''};
const rid=x=>x.route||trR(x.trip);
const rb=id=>{const r=G&&G.routes.find(x=>x.id==id);return r?badge(r):`<span class='badge'>${esc(id||'?')}</span>`};
const dly=s=>s==null?'<span class=mu>–</span>':Math.abs(s)<60?'a tiempo':(s>0?'+':'−')+Math.round(Math.abs(s)/60)+' min';
function rtArr(){if(R.ix)return R.ix;const m=new Map();
 R.tu.forEach(t=>{const tl=G&&G.st.get(t.trip);t.sts.forEach(s=>{let id=s.stop,x;if(tl)x=tl.find(y=>id?y[0]==id:y[3]==s.seq);if(!id&&x)id=x[0];if(!id||!s.t)return;
  let sch=null;if(x&&t.date.length==8){const mn=x[2]??x[1];if(mn!=null)sch=new Date(+t.date.slice(0,4),+t.date.slice(4,6)-1,+t.date.slice(6,8)).getTime()/1000+mn*60}
  const a=m.get(id)||[];a.push({r:rid(t),t:s.t,dl:s.dl!=null?s.dl:(sch!=null?s.t-sch:null)});m.set(id,a)})});
 return R.ix=m}
function rtRender(){
 let h=`<section style='grid-column:1/-1'><div class='top'><h2>Tiempo real</h2><label class='btn'>Cargar feeds<input id='rf' type='file' multiple hidden></label></div>`;
 if(!R)h+=`<p>Selecciona a la vez los archivos <b>vehicleposition</b>, <b>tripupdate</b> y <b>alert</b>. Se reconocen por su contenido, aunque no tengan extensión.</p>${G?'':'<p class=mu>Sin el GTFS estático verás códigos de línea y de parada en lugar de nombres.</p>'}`;
 else{
  const T=[['v','Vehículos ('+R.veh.length+')'],['l','Llegadas'],['a','Alertas ('+R.al.length+')']];
  h+=`<p class=mu>Foto de las ${hm(R.ts)} ${R.err?esc(R.err):''}</p><div class='tabs' style='margin-bottom:14px'>${T.map(t=>`<button data-s='${t[0]}' aria-selected='${S.rs==t[0]}'>${t[1]}</button>`).join('')}</div>`;
  if(S.rs=='v'){const v=[...R.veh].sort((a,b)=>rid(a).localeCompare(rid(b),'es',{numeric:true}));
   h+=`<div class='wrap'><table><thead><tr><th>Línea</th><th>Vehículo</th><th>Viaje</th><th>Posición</th><th>Hora</th></tr></thead><tbody>${v.map(x=>`<tr><th>${rb(rid(x))}</th><td>${esc((x.num?x.num+' · ':'')+(x.plate||x.v))}</td><td>${esc(x.trip)}</td><td>${x.lat==null?'–':`<a href='https://www.openstreetmap.org/?mlat=${x.lat}&amp;mlon=${x.lon}#map=17/${x.lat}/${x.lon}' target='_blank' rel='noopener'>${x.lat.toFixed(5)}, ${x.lon.toFixed(5)}</a>`}</td><td>${hm(x.ts)}</td></tr>`).join('')}</tbody></table></div>`}
  else if(S.rs=='l'&&!G)h+='<p>Para ver llegadas por parada hace falta cargar antes el GTFS estático: el feed solo indica el número de parada dentro de cada viaje.</p>';
  else if(S.rs=='l'){const ix=rtArr(),q=(S.rq||'').toLowerCase();
   S.ids=[...ix.keys()].filter(id=>!q||(sn(id)+' '+id).toLowerCase().includes(q)).sort((a,b)=>sn(a).localeCompare(sn(b),'es',{numeric:true})).slice(0,60);
   h+=`<input id='rq' type='search' placeholder='Buscar parada' style='width:100%;max-width:360px;margin-bottom:8px'><div class='wrap' style='max-height:200px;margin-bottom:14px'>${S.ids.map((id,n)=>`<button class='it' data-i='${n}' aria-current='${S.rstop==id}'><span>${esc(sn(id))}<small>${esc(id)}</small></span></button>`).join('')||'<p class=mu style=padding:8px>Sin resultados.</p>'}</div>`;
   if(S.rstop&&ix.has(S.rstop)){const a=[...ix.get(S.rstop)].sort((p,z)=>p.t-z.t);
    h+=`<h3 class='cond' style='font-size:22px;margin:0 0 8px'>${esc(sn(S.rstop))}</h3><div class='wrap'><table><thead><tr><th>Línea</th><th>Hora prevista</th><th>Retraso</th></tr></thead><tbody>${a.map(x=>`<tr><th>${rb(x.r)}</th><td>${hm(x.t)}</td><td>${dly(x.dl)}</td></tr>`).join('')}</tbody></table></div>`}
   else h+='<p class=mu>Elige una parada para ver sus próximas llegadas.</p>'}
  else h+=R.al.map(a=>`<div class='grp'><h3>${esc(a.h||'Aviso')}</h3><p>${esc(a.d)}</p><p class=mu>${a.en.filter(e=>e.r||e.s).map(e=>e.r?'Línea '+esc(e.r):'Parada '+esc(sn(e.s))).join(' · ')}</p></div>`).join('')||'<p>No hay alertas en el feed.</p>'}
 $('#gx-app').innerHTML=h+'</section>';
 $('#rf').onchange=e=>rtLoad([...e.target.files]);
 document.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{S.rs=b.dataset.s;rtRender()});
 document.querySelectorAll('#gx-app .it').forEach(b=>b.onclick=()=>{S.rstop=S.ids[+b.dataset.i];rtRender()});
 const i=$('#rq');if(i){i.value=S.rq||'';i.oninput=e=>{S.rq=e.target.value;S.rf=1;rtRender()};if(S.rf){S.rf=0;i.focus();i.setSelectionRange(i.value.length,i.value.length)}}}
async function rtLoad(fs){const r={veh:[],tu:[],al:[],ts:0,err:''};for(const f of fs){try{feed(new Uint8Array(await f.arrayBuffer()),r)}catch(e){r.err+=f.name+': '+e.message+' '}}R=r;S.rs=S.rs||'v';emit('rt');rtRender()}
$('#rtb').onclick=()=>{if(window.irA)irA('pantalla-buses')};

/* ---------- Load & persist ---------- */
const idb=(m,f)=>new Promise((ok,ko)=>{const o=indexedDB.open('gtfs-app',1);
 o.onupgradeneeded=()=>o.result.createObjectStore('k');
 o.onsuccess=()=>{const tx=o.result.transaction('k',m),rq=f(tx.objectStore('k'));tx.oncomplete=()=>ok(rq.result);tx.onerror=ko};o.onerror=ko});
async function use(buf,name,ts){
 $('#meta').textContent='Procesando…';
 try{G=await build(buf);S.route=null;S.stop=null;
  $('#meta').textContent=`${name} · ${G.routes.length} líneas · ${G.stops.size} paradas · cargado el ${new Date(ts).toLocaleDateString('es')}`;
  render();emit('static');return true}
 catch(e){G=null;$('#meta').textContent='Sin datos cargados';render();const x=$('#err');if(x)x.textContent='No se pudo leer el archivo (¿es un .zip con extensión distinta?): '+e.message;return false}}
$('#file').onchange=async e=>{const f=e.target.files[0];if(!f)return;
 const buf=await f.arrayBuffer(),ts=Date.now();
 if(await use(buf,f.name,ts)){try{await idb('readwrite',s=>s.put({buf,name:f.name,ts},'zip'))}catch(_){}}
 e.target.value=''};
const subs=[];const emit=k=>subs.forEach(f=>{try{f(k)}catch(_){}});
async function rtBuffers(bs,keepAl){const prev=R,r={veh:[],tu:[],al:[],ts:0,err:''};for(const b of bs){try{feed(new Uint8Array(b),r)}catch(e){r.err+=e.message+' '}}if(keepAl&&prev&&prev.al)r.al=prev.al;R=r;emit('rt');if(S.rt)rtRender()}
window.gx={get G(){return G},get R(){return R},badge,esc,sub:f=>subs.push(f),rt:rtBuffers,loadZip:async(buf,name)=>{const ts=Date.now();if(await use(buf,name,ts)){try{await idb('readwrite',s=>s.put({buf,name,ts},'zip'))}catch(_){}return true}return false}};
const sigOf=buf=>{const u=new Uint8Array(buf);let s=0;for(let i=0;i<u.length;i+=997)s=(s+u[i]*(i%251+1))%1000003;return buf.byteLength+':'+s};
window.gx.sig=sigOf;
// gtfs.zip uploaded next to the app: loaded automatically, and again only when that file changes
async function bundled(){try{const r=await fetch('gtfs.zip',{cache:'no-cache'});if(!r.ok)return;const buf=await r.arrayBuffer(),sg=sigOf(buf);if(G&&sg===localStorage.getItem('auvasa_bundled_sig'))return;if(await window.gx.loadZip(buf,'GTFS de la app')){localStorage.setItem('auvasa_bundled_sig',sg);localStorage.setItem('auvasa_gtfs_sig',sg)}}catch(_){}}
window.gxInit=(()=>{let d=0;return async()=>{if(d)return;d=1;render();try{const z=await idb('readonly',s=>s.get('zip'));if(z)await use(z.buf,z.name,z.ts)}catch(_){}await bundled()}})();

})();
