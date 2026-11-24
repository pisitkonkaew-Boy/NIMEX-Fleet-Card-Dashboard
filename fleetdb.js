// ════════ ฐานข้อมูลรถ + ตาราง DC → ภาค ════════
// โหลดพร้อมข้อมูลน้ำมันจาก Google Sheet (ชีต "รถ" และ "ภาค")
// กติกา (ตกลงกับผู้ใช้ 24 พ.ย. 2569)
// - ข้อมูลรถ (กลุ่ม, DC, ประเภท, เจ้าของ, PA) มาจากฐานรถเสมอ จับคู่ด้วยทะเบียน แก้ฐานแล้วใช้กับทุกเดือน
// - PA ของช่วงเวลา = รถทุกคันที่ยังใช้งานในเดือนนั้น (ไม่ใช่เฉพาะรถที่เติม) รถที่มีวันที่เลิกใช้ ยังนับในเดือนที่เลิกและก่อนหน้า
// - รถที่มีวงเงินเป็นบาท (รถใช้งานบริษัท): PA ลิตร = วงเงินบาท ÷ ราคาเฉลี่ยที่คันนั้นเติมในเดือน (ไม่ได้เติม → ราคาเฉลี่ยกลุ่ม)
// - รถอื่น: PA บาท = PA ลิตร × ราคาเฉลี่ยจริงของคันนั้นในเดือน (ไม่ได้เติม → ราคาเฉลี่ยกลุ่ม)
// - ถ้ายังไม่มีฐานรถใน Sheet ใช้ค่าที่มากับแถวน้ำมันแบบเดิม

let VEH={}, VEH_LIST=[], ZONES={}, FLEET_ON=false, UNMATCHED=[], PR={car:{},grp:{},all:{}};
const GROUPS=['กระจาย','ขนย้าย','Lay','รถใช้งานบริษัท'];
const OWNERS=['01 รถบริษัท','02 รถร่วม นิติบุคคล','03 รถร่วม บุคคลธรรมดา','11 รถร่วม Lay'];

// ทะเบียนสำหรับแสดงผล: มีขีดเสมอ เช่น 3ฒช1308 → 3ฒช-1308 · 651325 → 65-1325 (จับคู่ด้วย plateKey ที่ตัดขีดออก ไม่กระทบ)
function fmtPlate(s){const t=String(s==null?'':s).replace(/[\s\u00A0]+/g,'').replace(/[\u2013\u2014]/g,'-');const k=t.replace(/[-.]/g,'');
  let m=k.match(/^(\d?[ก-ฮ]{1,3})(\d{1,4})$/);if(m)return m[1]+'-'+m[2];
  m=k.match(/^(\d{2})(\d{4,5})$/);if(m)return m[1]+'-'+m[2];
  return t;}
function plateKey(s){return String(s||'').replace(/[\s \-\.–—]/g,'').toUpperCase();}
function nt(s){return String(s==null?'':s).replace(/[\s ]+/g,' ').trim();}
function dcCodeOf(s){const m=nt(s).match(/^(\d+)/);return m?m[1]:nt(s);}
function dcNameOf(s){return nt(s).replace(/^\d+\s*/,'');}
function dcLabel(code){const z=ZONES[code];return z&&z.name?code+' '+z.name:String(code);}
function zoneOf(code){const z=ZONES[code];return z&&z.zone?z.zone:'(ไม่มีภาค)';}
function ownShort(o){const s=nt(o);return /^0?1\b/.test(s)||(/บริษัท/.test(s)&&!/ร่วม/.test(s))?'บริษัท':'ผปก';}
function ownNorm(o){const s=nt(o);const m=s.match(/^(\d{1,2})\s*(.*)$/);if(m){const c=m[1].padStart(2,'0');const hit=OWNERS.find(x=>x.startsWith(c+' '));return hit||(c+' '+m[2]);}if(s==='บริษัท'||s==='รถบริษัท')return OWNERS[0];if(s==='ผปก')return OWNERS[2];return s;}
function dkey(s){const p=String(s||'').split('/');if(p.length!==3)return 0;return (+p[2])*10000+(+p[1])*100+(+p[0]);}

function buildFleet(j){
  VEH={};VEH_LIST=[];ZONES={};
  const zr=(j&&j.zones&&j.zones.rows)||[];
  zr.forEach(r=>{const c=nt(r[0]);if(c)ZONES[c]={code:c,name:nt(r[1]),zone:nt(r[2])};});
  const vr=(j&&j.vehicles&&j.vehicles.rows)||[];
  vr.forEach(r=>{
    const plate=fmtPlate(r[0]);if(!plate)return;
    const car={plate,key:plateKey(plate),code:nt(r[1]),group:nt(r[2]),dc:dcCodeOf(r[3]),vtype:nt(r[4]),ownerFull:ownNorm(r[5]),
      paL:parseFloat(r[6])||0,budget:parseFloat(r[7])||0,start:nt(r[8]),end:nt(r[9]),note:nt(r[10]),edited:nt(r[11])};
    car.owner=ownShort(car.ownerFull);car.zone=zoneOf(car.dc);car.dcLabel=dcLabel(car.dc);
    VEH[car.key]=car;
  });
  VEH_LIST=Object.values(VEH);
  FLEET_ON=VEH_LIST.length>0;
}
// เรียกจาก loadData: เติมข้อมูลรถจากฐาน แยกแถวที่ไม่อยู่ในฐาน
// กติกาจับคู่ (ขั้น 2): ทะเบียน (ผ่านตาราง alias ที่ผู้ดูแลผูกไว้) → ถ้ารหัสรถล่าสุดไม่ตรงฐาน นับตามข้อมูลเดิมในฐานไปก่อน + แจ้งเตือนให้ยืนยัน
// ทะเบียนไม่อยู่ในฐาน → ไม่นับ แจ้งเตือนให้เพิ่ม / ผูกกับทะเบียนที่มี / ไม่นับ
let EXCLUDED=[], FCFG={alias:{},exclude:{},ignoreCode:{}}, VEH_BY_CODE={};
function fleetCfg(){const s=(window.SHEET_SETTINGS&&window.SHEET_SETTINGS.fleet)||{};FCFG={alias:s.alias||{},exclude:s.exclude||{},ignoreCode:s.ignoreCode||{}};return FCFG;}
function resolveKey(plate){const k=plateKey(plate);return FCFG.alias[k]||k;}
function applyFleetDB(parsed,j){
  buildFleet(j);fleetCfg();UNMATCHED=[];EXCLUDED=[];VEH_BY_CODE={};
  VEH_LIST.forEach(c=>{if(c.code)VEH_BY_CODE[c.code]=c;});
  if(!FLEET_ON){parsed.forEach(r=>{r.zone=zoneOf(dcCodeOf(r.dc));});buildPrices(parsed);return parsed;}
  const out=[];
  parsed.forEach(r=>{
    r.rawPlate=r.rawPlate||r.plate;
    const k=resolveKey(r.plate);
    if(FCFG.exclude[k]){EXCLUDED.push(r);return;}
    const car=VEH[k];
    if(!car){UNMATCHED.push(r);return;}
    r.plate=car.plate;r.group=car.group;r.dc=car.dcLabel;r.vtype=car.vtype;r.owner=car.owner;r.zone=car.zone;r.car=car;
    out.push(r);
  });
  buildPrices(out);
  return out;
}
function buildPrices(rows){
  const a={},g={},c={};
  rows.forEach(r=>{const mk=monthKey(r.date),k=plateKey(r.plate);
    [[a,mk],[g,mk+'|'+r.group],[c,mk+'|'+k]].forEach(([o,key])=>{if(!o[key])o[key]=[0,0];o[key][0]+=r.baht;o[key][1]+=r.liter;});});
  const fin=o=>{const x={};for(const k in o)if(o[k][1]>0&&o[k][0]>0)x[k]=o[k][0]/o[k][1];return x;};
  PR={all:fin(a),grp:fin(g),car:fin(c)};
}
function priceOf(car,mk){return PR.car[mk+'|'+car.key]||PR.grp[mk+'|'+car.group]||PR.all[mk]||0;}
function activeIn(car,mk){
  const p=mk.split('/');const first=(+p[1])*10000+(+p[0])*100+1,last=first+30;
  if(car.end&&dkey(car.end)&&dkey(car.end)<first)return false;
  if(car.start&&dkey(car.start)&&dkey(car.start)>last)return false;
  return true;
}
function paOf(car,mk){
  if(!activeIn(car,mk))return null;
  const pr=priceOf(car,mk);
  if(car.paL>0)return{l:car.paL,b:car.paL*pr};
  if(car.budget>0)return{l:pr>0?car.budget/pr:0,b:car.budget};
  return{l:0,b:0};
}
function carPA(car,months){let l=0,b=0,on=false;months.forEach(mk=>{const x=paOf(car,mk);if(x){on=true;l+=x.l;b+=x.b;}});return on?{l,b}:null;}
// เรียกจาก computeFromRows: ตั้ง PA ของรถจากฐาน และเพิ่มรถที่ยังใช้งานแต่ไม่ได้เติมในช่วงนั้น
function fleetPA(vMap,rows){
  if(!FLEET_ON)return;
  const months=[...new Set(rows.map(r=>monthKey(r.date)))].filter(Boolean);
  const seen=new Set();
  Object.values(vMap).forEach(v=>{
    const car=VEH[plateKey(v.plate)];if(!car)return;seen.add(car.key);
    const x=carPA(car,months);v.paLiter=x?x.l:0;v.paBaht=x?x.b:0;v.zone=car.zone;
  });
  VEH_LIST.forEach(car=>{
    if(seen.has(car.key))return;
    if(typeof inGrp==='function'&&!inGrp(car.group))return;
    const x=carPA(car,months);if(!x)return;
    vMap[car.plate]={plate:car.plate,group:car.group,dc:car.dcLabel,owner:car.owner,vtype:car.vtype,zone:car.zone,paBaht:x.b,paLiter:x.l,l:0,b:0,idle:true};
  });
}

// ════════ หน้า ฐานข้อมูลรถ (ผู้ดูแล) ════════
let FDB={q:'',grp:'',st:'act',zone:''};
function fdbStatus(car){const now=new Date();const t=(now.getFullYear()+543)*10000+(now.getMonth()+1)*100+now.getDate();return car.end&&dkey(car.end)&&dkey(car.end)<t?'off':'act';}
function renderFleetDB(){
  const box=document.getElementById('fdb-body');if(!box)return;
  const zs=[...new Set(VEH_LIST.map(c=>c.zone))].sort((a,b)=>a.localeCompare(b,'th'));
  const zsel=document.getElementById('fdb-zone');
  if(zsel){const cur=zsel.value;zsel.innerHTML='<option value="">ทุกภาค</option>'+zs.map(z=>`<option${z===cur?' selected':''}>${escH(z)}</option>`).join('');}
  const q=plateKey(FDB.q),qt=nt(FDB.q);
  const list=VEH_LIST.filter(c=>(!FDB.grp||c.group===FDB.grp)&&(!FDB.zone||c.zone===FDB.zone)&&(FDB.st==='all'||fdbStatus(c)===FDB.st)
    &&(!qt||c.key.includes(q)||c.code.includes(qt)||c.dcLabel.includes(qt)||c.vtype.includes(qt)));
  const act=VEH_LIST.filter(c=>fdbStatus(c)==='act');
  document.getElementById('fdb-stats').innerHTML=`
    <div class="stat"><div><b>${fmt(act.length)}</b><span>คันที่ใช้งาน</span></div></div>
    <div class="stat"><div><b>${fmt(VEH_LIST.length-act.length)}</b><span>เลิกใช้แล้ว</span></div></div>
    <div class="stat"><div><b>${fmt(act.reduce((s,c)=>s+c.paL,0))}</b><span>PA ลิตร (รถที่วงเงินเป็นลิตร)</span></div></div>
    <div class="stat"><div><b>฿${fmt(act.reduce((s,c)=>s+c.budget,0))}</b><span>วงเงินบาท (รถใช้งานบริษัท)</span></div></div>`;
  box.innerHTML=list.length?list.sort((a,b)=>a.group.localeCompare(b.group,'th')||a.dc-b.dc||a.plate.localeCompare(b.plate,'th')).map(c=>`<tr class="${fdbStatus(c)==='off'?'off':''}">
    <td><strong>${escH(c.plate)}</strong></td><td>${escH(c.code)}</td><td>${escH(c.group)}</td><td>${escH(c.dcLabel)}</td><td>${escH(c.zone)}</td><td>${escH(c.vtype)}</td>
    <td>${escH(c.owner)}</td><td class="r">${c.paL?fmt(c.paL):''}</td><td class="r">${c.budget?'฿'+fmt(c.budget):''}</td>
    <td>${fdbStatus(c)==='off'?'<span class="badt">เลิกใช้ '+escH(c.end)+'</span>':(c.end?'เลิกใช้ '+escH(c.end):'ใช้งาน')}</td>
    <td><button class="btn alt btn-sm" onclick="openCar('${escH(c.key)}')">แก้ไข</button></td></tr>`).join('')
    :'<tr><td colspan="11" style="text-align:center">'+(VEH_LIST.length?'ไม่พบรถตามเงื่อนไข':'ยังไม่มีฐานรถ — กด นำเข้า Excel เพื่อเริ่มต้น')+'</td></tr>';
  document.getElementById('fdb-count').textContent='แสดง '+fmt(list.length)+' จาก '+fmt(VEH_LIST.length)+' คัน';
  renderZones();
}
function fdbFilter(k,v){FDB[k]=v;renderFleetDB();}

// ฟอร์มเพิ่ม/แก้ไขรถ · pre = ค่าที่กรอกไว้ให้ (จากหน้าแจ้งเตือน / รถไม่มีการใช้งาน)
function openCar(key,pre){
  const c0=key?VEH[key]:null, c=Object.assign({plate:'',code:'',group:'กระจาย',dc:'',vtype:'',ownerFull:OWNERS[2],paL:'',budget:'',start:'',end:'',note:''},c0||{},pre||{});
  const dcs=Object.values(ZONES).sort((a,b)=>a.code-b.code);
  const vts=[...new Set(VEH_LIST.map(x=>x.vtype).filter(Boolean))];
  const E=v=>escH(v==null?'':v);
  document.getElementById('m-car-title').textContent=c0?'แก้ไขรถ '+c0.plate:'เพิ่มรถ';
  document.getElementById('m-car-body').innerHTML=`
    <input type="hidden" id="car-old" value="${c0?E(c0.plate):''}">
    ${pre&&pre._hint?`<p class="flog" style="text-align:left">${pre._hint}</p>`:''}
    <div class="g g2">
      <div class="field"><label for="car-plate">ทะเบียน</label><input id="car-plate" value="${E(c.plate)}" placeholder="เช่น 3ฒข-1306"></div>
      <div class="field"><label for="car-code">รหัสรถ</label><input id="car-code" value="${E(c.code)}" inputmode="numeric"></div>
      <div class="field"><label for="car-group">กลุ่มรถ</label><select id="car-group" onchange="carBudgetUI()">${GROUPS.map(g=>`<option${c.group===g?' selected':''}>${g}</option>`).join('')}</select></div>
      <div class="field"><label for="car-dc">DC</label><select id="car-dc">${dcs.map(z=>`<option value="${E(z.code)}"${c.dc===z.code?' selected':''}>${E(z.code+' '+z.name)} · ${E(z.zone||'ไม่มีภาค')}</option>`).join('')}${c.dc&&!ZONES[c.dc]?`<option value="${E(c.dc)}" selected>${E(c.dc)} (ไม่มีในตาราง DC)</option>`:''}</select></div>
      <div class="field"><label for="car-vtype">ประเภทรถ</label><input id="car-vtype" list="car-vts" value="${E(c.vtype)}"><datalist id="car-vts">${vts.map(v=>`<option value="${E(v)}">`).join('')}</datalist></div>
      <div class="field"><label for="car-owner">เจ้าของ</label><select id="car-owner">${OWNERS.map(o=>`<option${c.ownerFull===o?' selected':''}>${o}</option>`).join('')}</select></div>
      <div class="field" id="f-pal"><label for="car-pal">PA ลิตร / เดือน</label><input id="car-pal" type="number" step="any" value="${c.paL?E(c.paL):''}"></div>
      <div class="field" id="f-bud"><label for="car-bud">วงเงินบาท / เดือน</label><input id="car-bud" type="number" step="any" value="${c.budget?E(c.budget):''}"><small class="flog">ระบบแปลงเป็นลิตรด้วยราคาที่คันนี้เติมจริงแต่ละเดือน</small></div>
      <div class="field"><label for="car-start">วันที่เริ่มใช้ (ว่าง = นับทุกเดือน)</label><input id="car-start" value="${E(c.start)}" placeholder="dd/mm/2569"></div>
      <div class="field"><label for="car-end">วันที่เลิกใช้ (ว่าง = ยังใช้งาน)</label><input id="car-end" value="${E(c.end)}" placeholder="dd/mm/2569"></div>
    </div>
    <div class="field"><label for="car-note">หมายเหตุ</label><input id="car-note" value="${E(c.note)}"></div>
    ${c0&&c0.edited?`<p class="flog">แก้ไขล่าสุด ${E(c0.edited)}</p>`:''}
    <p class="msg badt" id="car-msg" role="status"></p>
    <div class="btns"><button class="btn goldb" id="car-save" onclick="saveCar()">บันทึกลง Google Sheet</button>
    ${c0?`<button class="btn alt" onclick="endCarToday()">ตั้งเลิกใช้วันนี้</button><button class="btn alt" style="color:var(--bad)" onclick="deleteCar()">ลบออกจากฐาน</button>`:''}</div>`;
  carBudgetUI();openM('m-car');
}
function carBudgetUI(){const g=document.getElementById('car-group').value;const bud=g==='รถใช้งานบริษัท';document.getElementById('f-bud').style.display=bud?'':'none';document.getElementById('f-pal').style.display=bud?'none':'';}
function todayBE(){const d=new Date();return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+(d.getFullYear()+543);}
function endCarToday(){document.getElementById('car-end').value=todayBE();}
function validDate(s){return !s||/^\d{1,2}\/\d{1,2}\/25\d\d$/.test(s);}
async function saveCar(){
  const g=id=>document.getElementById(id).value.trim(),m=document.getElementById('car-msg');
  const o={oldPlate:g('car-old'),plate:fmtPlate(g('car-plate')),code:g('car-code'),group:g('car-group'),dc:g('car-dc'),vtype:g('car-vtype'),owner:g('car-owner'),
    paL:g('car-group')==='รถใช้งานบริษัท'?'':g('car-pal'),budget:g('car-group')==='รถใช้งานบริษัท'?g('car-bud'):'',start:g('car-start'),end:g('car-end'),note:g('car-note')};
  if(!plateKey(o.plate)){m.textContent='ใส่ทะเบียนก่อน';return;}
  const dup=VEH[plateKey(o.plate)];if(dup&&plateKey(o.oldPlate)!==dup.key){m.textContent='ทะเบียนนี้มีในฐานแล้ว — กดแก้ไขที่คันนั้นแทน';return;}
  if(!validDate(o.start)||!validDate(o.end)){m.textContent='วันที่ต้องเป็นรูปแบบ dd/mm/25xx เช่น 30/11/2569';return;}
  if(o.group==='รถใช้งานบริษัท'?!(+o.budget>0):!(+o.paL>0)){m.textContent=o.group==='รถใช้งานบริษัท'?'ใส่วงเงินบาท':'ใส่ PA ลิตร';return;}
  document.getElementById('car-save').disabled=true;m.textContent='⏳ กำลังบันทึก…';
  try{await api({a:'veh_save',rows:[o]});closeM('m-car');await fdbReload('✅ บันทึก '+o.plate+' แล้ว');}
  catch(e){m.textContent='❌ '+e.message;document.getElementById('car-save').disabled=false;}
}
async function deleteCar(){
  const p=document.getElementById('car-old').value;
  if(!confirm('ลบ '+p+' ออกจากฐานรถ?\nใช้เฉพาะกรณีเพิ่มผิด — ถ้ารถเลิกใช้ ให้ใส่วันที่เลิกใช้แทน เพื่อให้เดือนก่อนยังนับ PA'))return;
  try{await api({a:'veh_delete',plates:[p]});closeM('m-car');await fdbReload('✅ ลบ '+p+' แล้ว');}catch(e){document.getElementById('car-msg').textContent='❌ '+e.message;}
}
async function fdbReload(msg){
  const st=document.getElementById('fdb-msg');if(st)st.textContent='⏳ กำลังโหลดข้อมูลใหม่…';
  await loadData(true);renderFleetDB();if(typeof renderFleetChk==='function'){renderFleetChk();renderIdle();}if(st)st.textContent=msg||'';fleetToast(msg);
}

// ════════ นำเข้า Excel (ฐานรถ และ/หรือ ตาราง DC → ภาค) ════════
let FIMP=null;
function fdbFile(e){const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=ev=>{try{fdbParse(XLSX.read(ev.target.result,{type:'array'}),f.name);}catch(err){document.getElementById('fdb-plan').innerHTML='<p class="badt">❌ '+escH(err.message)+'</p>';}};rd.readAsArrayBuffer(f);e.target.value='';}
function hdrRow(aoa,words){for(let i=0;i<Math.min(aoa.length,8);i++){const r=(aoa[i]||[]).map(nt);if(words.some(w=>r.some(c=>c.includes(w))))return i;}return -1;}
function parseVehSheet(aoa){
  const h=hdrRow(aoa,['ทะเบียน']);if(h<0)return null;
  const H=(aoa[h]||[]).map(nt),rows=aoa.slice(h+1).filter(r=>r&&r.some(c=>nt(c)!==''));
  const idx=f=>H.map((x,i)=>f(x)?i:-1).filter(i=>i>=0);
  const plates=idx(x=>x.includes('ทะเบียน'));
  const plateCol=plates.find(i=>rows.some(r=>/-/.test(nt(r[i]))))??plates[0];
  const one=f=>{const a=idx(f);return a.length?a[0]:-1;};
  const ownCols=idx(x=>x.includes('ผปก')||x.includes('เจ้าของ'));
  const ownCol=ownCols.find(i=>rows.some(r=>/^\d{1,2}\s/.test(nt(r[i]))))??ownCols[0]??-1;
  const C={code:one(x=>x.includes('รหัสรถ')||x==='รหัส'),grp:one(x=>x.includes('กลุ่ม')),dc:one(x=>x.includes('DC')),vt:one(x=>x.includes('ประเภท')),
    lit:one(x=>/ลิตร/.test(x)),baht:one(x=>/วงเงิน/.test(x)&&!/ลิตร/.test(x)),start:one(x=>x.includes('เริ่ม')),end:one(x=>x.includes('เลิก')),note:one(x=>x.includes('หมายเหตุ'))};
  const g=(r,i)=>i>=0?nt(r[i]):'';
  const out={},dcs={};let dupRows=0;
  rows.forEach(r=>{
    const plate=fmtPlate(g(r,plateCol));if(!plateKey(plate))return;
    const grp=g(r,C.grp),dcRaw=g(r,C.dc),code=dcCodeOf(dcRaw);
    if(dcRaw&&dcNameOf(dcRaw))dcs[code]=dcNameOf(dcRaw);
    const bud=grp==='รถใช้งานบริษัท';
    const o={plate,code:g(r,C.code),group:grp,dc:code,vtype:g(r,C.vt),owner:ownNorm(g(r,ownCol)),
      paL:bud?'':(parseFloat(g(r,C.lit))||''),budget:bud?(parseFloat(g(r,C.baht))||''):'',start:g(r,C.start),end:g(r,C.end),note:g(r,C.note)};
    const k=plateKey(plate);if(out[k])dupRows++;out[k]=o;
  });
  return{rows:Object.values(out),dupRows,dcs};
}
function parseZoneSheet(aoa){
  const h=hdrRow(aoa,['Zone','ภาค']);if(h<0)return null;
  const H=(aoa[h]||[]).map(nt);const zc=H.findIndex(x=>/zone|ภาค/i.test(x));
  const rows=aoa.slice(h+1).filter(r=>r&&r.some(c=>nt(c)!==''));
  const numCol=H.findIndex((x,i)=>i!==zc&&rows.some(r=>/^\d+$/.test(nt(r[i]))));
  const nameCol=H.findIndex((x,i)=>i!==zc&&i!==numCol&&rows.some(r=>/\D/.test(nt(r[i]))));
  const out={};rows.forEach(r=>{let code=nt(r[numCol]),name=nameCol>=0?nt(r[nameCol]):'';if(!/^\d+$/.test(code)){code=dcCodeOf(name);name=dcNameOf(name);}if(code)out[code]={code,name:dcNameOf(name)||name,zone:nt(r[zc])};});
  return Object.values(out);
}
function fdbParse(wb,fname){
  let veh=null,zones=null;
  wb.SheetNames.forEach(n=>{const aoa=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false,defval:''});
    if(!veh){const v=parseVehSheet(aoa);if(v&&v.rows.length){veh=v;return;}}
    if(!zones){const z=parseZoneSheet(aoa);if(z&&z.length)zones=z;}});
  if(!veh&&!zones){document.getElementById('fdb-plan').innerHTML='<p class="badt">❌ ไม่พบตารางรถ (คอลัมน์ ทะเบียน) หรือตารางภาค (คอลัมน์ Zone/ภาค) ในไฟล์นี้</p>';return;}
  // DC ที่รถใช้แต่ยังไม่มีในตาราง → เพิ่มชื่อให้ (ภาคว่าง)
  const zNew={};(zones||[]).forEach(z=>zNew[z.code]=z);
  if(veh)Object.entries(veh.dcs).forEach(([c,n])=>{if(!ZONES[c]&&!zNew[c])zNew[c]={code:c,name:n,zone:''};});
  const zList=Object.values(zNew);
  const zAdd=zList.filter(z=>!ZONES[z.code]).length,zChg=zList.filter(z=>ZONES[z.code]&&(ZONES[z.code].name!==z.name||ZONES[z.code].zone!==z.zone)).length;
  let vAdd=[],vChg=[],vSame=0;
  if(veh)veh.rows.forEach(o=>{const c=VEH[plateKey(o.plate)];if(!c){vAdd.push(o);return;}
    const diff=[];[['code','รหัส'],['group','กลุ่ม'],['dc','DC'],['vtype','ประเภท'],['owner','เจ้าของ',c.ownerFull],['paL','PA ลิตร',c.paL||''],['budget','วงเงินบาท',c.budget||'']].forEach(([k,lab,cv])=>{const a=String(cv!==undefined?cv:c[k]),b=String(o[k]);if(a!==b)diff.push(lab+' '+(a||'-')+'→'+(b||'-'));});
    if(diff.length)vChg.push([o,diff]);else vSame++;});
  const noZone=veh?[...new Set(veh.rows.map(o=>o.dc))].filter(c=>!(zNew[c]&&zNew[c].zone)&&!(ZONES[c]&&ZONES[c].zone)):[];
  FIMP={fname,veh:veh?veh.rows.filter(o=>!VEH[plateKey(o.plate)]||vChg.some(x=>x[0]===o)):[],zones:zList.filter(z=>!ZONES[z.code]||ZONES[z.code].name!==z.name||ZONES[z.code].zone!==z.zone)};
  document.getElementById('fdb-plan').innerHTML=`
    <p class="note" style="text-align:left">ไฟล์ <b>${escH(fname)}</b>${veh?` · รถ ${fmt(veh.rows.length)} คัน${veh.dupRows?` <span class="badt">(รวมแถวทะเบียนซ้ำ ${fmt(veh.dupRows)} แถว ใช้แถวล่าสุด)</span>`:''}`:''}${zones?` · ตาราง DC ${fmt(zones.length)} แห่ง`:''}</p>
    <div class="stats">
      ${veh?`<div class="stat"><div><b>${fmt(vAdd.length)}</b><span>รถใหม่</span></div></div><div class="stat"><div><b>${fmt(vChg.length)}</b><span>รถที่ค่าเปลี่ยน (ใช้ค่าใหม่)</span></div></div><div class="stat"><div><b>${fmt(vSame)}</b><span>เหมือนเดิม</span></div></div>`:''}
      <div class="stat"><div><b>${fmt(zAdd)} / ${fmt(zChg)}</b><span>DC ใหม่ / DC ที่เปลี่ยน</span></div></div>
    </div>
    ${vChg.length?`<details><summary>ดูรถที่ค่าเปลี่ยน ${fmt(vChg.length)} คัน</summary><div class="sb2"><table class="dt"><thead><tr><th>ทะเบียน</th><th>สิ่งที่เปลี่ยน</th></tr></thead><tbody>${vChg.slice(0,300).map(([o,d])=>`<tr><td>${escH(o.plate)}</td><td>${escH(d.join(' · '))}</td></tr>`).join('')}</tbody></table></div></details>`:''}
    ${noZone.length?`<p class="badt">⚠️ DC ที่ยังไม่มีภาค: ${escH(noZone.map(c=>c+' '+((zNew[c]||ZONES[c]||{}).name||'')).join(', '))} — แก้ได้ที่ตาราง DC ด้านล่างหลังบันทึก</p>`:''}
    <p class="flog">รถที่มีในฐานแต่ไม่อยู่ในไฟล์ จะเก็บไว้เหมือนเดิม</p>
    <div class="btns"><button class="btn goldb" id="fdb-commit" onclick="fdbCommit()" ${FIMP.veh.length||FIMP.zones.length?'':'disabled'}>บันทึกลง Google Sheet</button><button class="btn alt" onclick="FIMP=null;document.getElementById('fdb-plan').innerHTML=''">ยกเลิก</button></div>`;
}
async function fdbCommit(){
  if(!FIMP)return;const b=document.getElementById('fdb-commit'),st=document.getElementById('fdb-msg');b.disabled=true;
  try{
    if(FIMP.zones.length){st.textContent='⏳ บันทึกตาราง DC…';await api({a:'zone_save',rows:FIMP.zones});}
    for(let i=0;i<FIMP.veh.length;i+=250){st.textContent=`⏳ บันทึกรถ ${fmt(Math.min(i+250,FIMP.veh.length))}/${fmt(FIMP.veh.length)}…`;await api({a:'veh_save',rows:FIMP.veh.slice(i,i+250),note:FIMP.fname});}
    const n=FIMP.veh.length,z=FIMP.zones.length;FIMP=null;document.getElementById('fdb-plan').innerHTML='';
    await fdbReload(`✅ นำเข้าแล้ว: รถ ${fmt(n)} คัน · DC ${fmt(z)} แห่ง`);
  }catch(e){st.textContent='❌ บันทึกไม่สำเร็จ: '+e.message;b.disabled=false;}
}
function fdbExport(){
  const h=['ทะเบียน','รหัสรถ','กลุ่มรถ','DC','ภาค','ประเภทรถ','เจ้าของ','ผปก/บริษัท','PA ลิตร','วงเงินบาท','วันที่เริ่มใช้','วันที่เลิกใช้','หมายเหตุ'];
  const rows=VEH_LIST.map(c=>[c.plate,c.code,c.group,c.dcLabel,c.zone,c.vtype,c.ownerFull,c.owner,c.paL||'',c.budget||'',c.start,c.end,c.note]);
  const zh=['รหัสDC','ชื่อDC','ภาค','จำนวนรถ'];const zr=Object.values(ZONES).sort((a,b)=>a.code-b.code).map(z=>[z.code,z.name,z.zone,VEH_LIST.filter(c=>c.dc===z.code).length]);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([h,...rows]),'รถ');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([zh,...zr]),'ภาค');
  const t=new Date();XLSX.writeFile(wb,'NIMEX-Fleet-Vehicles-'+t.getFullYear()+String(t.getMonth()+1).padStart(2,'0')+String(t.getDate()).padStart(2,'0')+'.xlsx');
}

// ════════ ตาราง DC → ภาค ════════
function renderZones(){
  const tb=document.getElementById('zone-body');if(!tb)return;
  const cnt={};VEH_LIST.forEach(c=>{if(fdbStatus(c)==='act')cnt[c.dc]=(cnt[c.dc]||0)+1;});
  const used=new Set(VEH_LIST.map(c=>c.dc));
  const list=Object.values(ZONES);used.forEach(c=>{if(!ZONES[c])list.push({code:c,name:'',zone:'',missing:true});});
  tb.innerHTML=list.sort((a,b)=>(cnt[b.code]||0)-(cnt[a.code]||0)||a.code-b.code).map(z=>`<tr><td>${escH(z.code)}</td><td>${escH(z.name)}</td><td>${z.zone?escH(z.zone):'<span class="badt">ไม่มีภาค</span>'}</td><td class="r">${cnt[z.code]||0}</td><td><button class="btn alt btn-sm" onclick="openZone('${escH(z.code)}')">แก้ไข</button></td></tr>`).join('')||'<tr><td colspan="5" style="text-align:center">ยังไม่มีตาราง DC</td></tr>';
}
function openZone(code){
  const z=code?ZONES[code]||{code,name:'',zone:''}:null;
  const zs=[...new Set(Object.values(ZONES).map(x=>x.zone).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));
  const inUse=code?VEH_LIST.filter(c=>c.dc===code).length:0;
  document.getElementById('m-car-title').textContent=z?'แก้ไข DC '+z.code:'เพิ่ม DC';
  document.getElementById('m-car-body').innerHTML=`
    <div class="g g2">
      <div class="field"><label for="z-code">รหัส DC</label><input id="z-code" value="${z?escH(z.code):''}" ${z?'readonly':''} inputmode="numeric"></div>
      <div class="field"><label for="z-name">ชื่อ DC</label><input id="z-name" value="${z?escH(z.name):''}" placeholder="DC เชียงใหม่"></div>
      <div class="field"><label for="z-zone">ภาค</label><input id="z-zone" list="z-zs" value="${z?escH(z.zone):''}"><datalist id="z-zs">${zs.map(x=>`<option value="${escH(x)}">`).join('')}</datalist></div>
    </div>
    <p class="msg badt" id="car-msg" role="status"></p>
    <div class="btns"><button class="btn goldb" id="car-save" onclick="saveZone()">บันทึกลง Google Sheet</button>${z&&ZONES[z.code]&&!inUse?`<button class="btn alt" style="color:var(--bad)" onclick="deleteZone('${escH(z.code)}')">ลบ DC นี้</button>`:''}</div>
    ${inUse?`<p class="flog">มีรถใช้ DC นี้ ${inUse} คัน (ลบไม่ได้)</p>`:''}`;
  openM('m-car');
}
async function saveZone(){
  const g=id=>document.getElementById(id).value.trim(),m=document.getElementById('car-msg');
  const o={code:g('z-code'),name:g('z-name'),zone:g('z-zone')};
  if(!/^\d+$/.test(o.code)){m.textContent='รหัส DC ต้องเป็นตัวเลข';return;}
  document.getElementById('car-save').disabled=true;m.textContent='⏳ กำลังบันทึก…';
  try{await api({a:'zone_save',rows:[o]});closeM('m-car');await fdbReload('✅ บันทึก DC '+o.code+' แล้ว');}catch(e){m.textContent='❌ '+e.message;document.getElementById('car-save').disabled=false;}
}
async function deleteZone(code){
  if(!confirm('ลบ DC '+code+' ออกจากตาราง?'))return;
  try{await api({a:'zone_delete',codes:[code]});closeM('m-car');await fdbReload('✅ ลบ DC '+code+' แล้ว');}catch(e){document.getElementById('car-msg').textContent='❌ '+e.message;}
}

// แถวน้ำมันที่ทะเบียนไม่อยู่ในฐาน (สรุปในหน้า ตั้งค่า จนกว่าหน้าแจ้งเตือนจะเสร็จในขั้นที่ 2)
function unmatchedSummary(){
  const m={};UNMATCHED.forEach(r=>{const k=r.plate;if(!m[k])m[k]={plate:k,n:0,l:0,b:0,last:r.date,dc:r.dc,group:r.group};const o=m[k];o.n++;o.l+=r.liter;o.b+=r.baht;if(dateCmp(r.date,o.last)>0)o.last=r.date;});
  return Object.values(m).sort((a,b)=>b.l-a.l);
}
function exportUnmatched(){
  const s=unmatchedSummary();
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['ทะเบียน','จำนวนรายการ','ลิตร','บาท','เติมล่าสุด','กลุ่มในข้อมูลเดิม','DC ในข้อมูลเดิม'],...s.map(o=>[o.plate,o.n,Math.round(o.l*100)/100,Math.round(o.b*100)/100,o.last,o.group,o.dc])]),'ไม่อยู่ในฐานรถ');
  XLSX.writeFile(wb,'NIMEX-Fleet-NotInVehicleDB.xlsx');
}
// รถที่ยังใช้งานแต่ไม่ได้เติมในช่วงนั้น → แถวหลอก (ลิตร 0) ให้รวม PA ตามมิติได้ (share.js aggBy)
function idleRows(d){return ((d&&d.idle)||[]).map(v=>({plate:v.plate,group:v.group,dc:v.dc,owner:v.owner,vtype:v.vtype,zone:v.zone,liter:0,baht:0,price:0,idle:true}));}

function fleetToast(msg){if(!msg)return;let t=document.getElementById('fleet-toast');if(!t){t=document.createElement('div');t.id='fleet-toast';t.className='fleet-toast';document.body.appendChild(t);}t.textContent=msg;t.classList.add('on');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('on'),3500);}

// ════════ มิติภาค (ขั้น 3) ════════
function vZone(v){return v.zone||zoneOf(dcCodeOf(v.dc));}
function zoneAgg(d,pred){
  const m={};((d&&d.vlist)||[]).forEach(v=>{if(pred&&!pred(v))return;const z=vZone(v);const o=m[z]||(m[z]={zone:z,l:0,b:0,paL:0,paB:0,n:0,act:0,dcs:new Set()});
    o.l+=v.l;o.b+=v.b;o.paL+=v.paLiter||0;o.paB+=v.paBaht||0;o.act++;if(v.l>0){o.n++;o.dcs.add(v.dc);}});
  return Object.values(m).sort((a,b)=>b.l-a.l);
}
function renderZoneCard(){
  const tb=document.getElementById('zone-tbody');if(!tb||!D)return;
  const L=zoneAgg(D),tl=L.reduce((s,o)=>s+o.l,0);
  tb.innerHTML=L.map((o,i)=>{const p=pct(o.l,o.paL),sh=tl>0?o.l/tl*100:0;return `<tr class="clickrow" onclick="setZone('${escH(o.zone)}');goTab('dc')">
    <td style="color:var(--muted)">${i+1}</td><td><strong>${escH(o.zone)}</strong></td><td class="r"><strong>${fmt(o.l)}</strong></td><td class="r">฿${fmt(o.b)}</td>
    <td class="r">${o.paL>0?fmt(o.paL):'—'}</td><td>${o.paL>0?pchip(p):'—'}</td><td class="r">${o.paB>0?pct(o.b,o.paB).toFixed(1)+'%':'—'}</td>
    <td class="r">${fmt(o.n)}/${fmt(o.act)}</td><td class="r">${o.dcs.size}</td>
    <td><div class="bi"><div class="bm"><div class="bf" style="width:${sh.toFixed(1)}%;background:var(--s1)"></div></div><span style="font-size:12px;min-width:38px">${sh.toFixed(1)}%</span></div></td></tr>`;}).join('')||'<tr><td colspan="10" style="text-align:center">—</td></tr>';
}
function setZone(z){
  const s=document.getElementById('f-dczone');if(s){fillZoneSelect();s.value=z;}
  const v=document.getElementById('f-vzone');if(v){fillZoneSelect();v.value=z;}
  if(D){renderDCTab();renderVeh();}renderChips();
}
function fillZoneSelect(){
  const zs=[...new Set(((D&&D.vlist)||[]).map(vZone))].sort((a,b)=>a.localeCompare(b,'th'));
  ['f-dczone','f-vzone'].forEach(id=>{const s=document.getElementById(id);if(!s)return;const cur=s.value;
    s.innerHTML='<option value="">ทุกภาค</option>'+zs.map(z=>`<option${z===cur?' selected':''}>${escH(z)}</option>`).join('');});
}
// PA ราย DC (รถทุกคันที่ยังใช้งานใน DC นั้น ตามตัวกรองกลุ่ม)
function dcPA(d,grp){const m={};((d&&d.vlist)||[]).forEach(v=>{if(grp&&v.group!==grp)return;const o=m[v.dc]||(m[v.dc]={paL:0,paB:0,act:0,zone:vZone(v)});o.paL+=v.paLiter||0;o.paB+=v.paBaht||0;o.act++;});return m;}
function plateZone(d){const m={};((d&&d.vlist)||[]).forEach(v=>{m[v.plate]=vZone(v);});return m;}
