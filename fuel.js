// ════════ ข้อมูลเติมน้ำมันจากไฟล์ดิบ Fleet Card + หน้าแจ้งเตือนข้อมูลรถ + หน้ารถไม่มีการใช้งาน ════════
// ไฟล์ดิบ = รายงาน "การใช้ FleetCard ตาม cost centre" (Report No. NIMEX…) ระบบอ่านเฉพาะแถวรายการ ข้ามหัวกลุ่ม/บรรทัดรวม
// เก็บในชีต "น้ำมัน": วันที่, เวลา, ทะเบียน, รหัสรถ, ลิตร, บาท, ผลิตภัณฑ์, รหัสสถานี, CostCentre

let STATIONS={}, LEGACY={}, FUEL_MODE=false, FPLAN=null;
const provOf=p=>/PTT/i.test(p)?'PTT':/BCP/i.test(p)?'BCP':'อื่น';
const rvtOf=cc=>/\.NIM$/i.test(cc)?'NIM':'CO';
const fleetOf=cc=>/^LAY/i.test(cc)?'LAY':'EX';
const tkey=r=>dkey(r.date)*10000+(+(String(r.time||'').replace(':',''))||0);

// แถวจากชีต "น้ำมัน" → row object ที่หน้าเว็บใช้
function parseFuelRows(rows){
  const out=[];
  rows.forEach(r=>{
    const liter=parseFloat(r[4])||0,baht=parseFloat(r[5])||0,plate=nt(r[2]);
    if(!plate||liter<=0)return;
    out.push({date:nt(r[0]),time:nt(r[1]),plate,rawPlate:plate,code:nt(r[3]),liter,baht,price:baht/liter,product:nt(r[6]),prov:provOf(r[6]),station:nt(r[7]),cc:nt(r[8]),
      paBaht:0,paLiter:0,group:'',dc:'',vtype:'',owner:''});
  });
  return out;
}
function loadFuelExtras(j){
  STATIONS={};((j.stations&&j.stations.rows)||[]).forEach(r=>{STATIONS[nt(r[0])]={name:nt(r[1]),loc:nt(r[2])};});
  LEGACY=j.legacy||{};
  FUEL_MODE=!!(j.fuel&&j.fuel.rows&&j.fuel.rows.length);
}

// ── อ่านไฟล์ดิบ ──
function parseFleetReport(aoa){
  let h=-1;for(let i=0;i<Math.min(aoa.length,30);i++){if((aoa[i]||[]).some(c=>nt(c)==='เลขที่รายการ')){h=i;break;}}
  if(h<0)return null;
  const H=aoa[h].map(nt),col=n=>H.findIndex(x=>x===n),colI=f=>H.findIndex(f);
  const C={date:col('วันที่'),time:col('เวลา'),code:colI(x=>x.replace(/\s/g,'')==='รหัสรถ'),plate:col('ทะเบียนรถ'),liter:colI(x=>x.includes('ปริมาณ')),baht:col('จำนวนเงิน'),
    prod:col('ผลิตภัณฑ์'),st:col('รหัสสถานี'),stn:col('ชื่อสถานี'),loc:col('ที่ตั้ง'),cc:col('Cost Centre')};
  const miss=Object.entries(C).filter(([k,v])=>v<0).map(([k])=>k);
  if(miss.length)throw new Error('ไฟล์ดิบไม่มีคอลัมน์: '+miss.join(', '));
  const rows=[],stations={};let total=null,title=nt((aoa[3]||[])[0]);
  for(let i=h+1;i<aoa.length;i++){
    const r=aoa[i]||[],a=r[0];
    if(typeof a==='number'||/^\d+(\.0+)?$/.test(nt(a))){
      const st=nt(r[C.st]).replace(/^0+/,'');
      rows.push([nt(r[C.date]),nt(r[C.time]),nt(r[C.plate]),nt(r[C.code]),Math.round((parseFloat(r[C.liter])||0)*1000)/1000,Math.round((parseFloat(r[C.baht])||0)*100)/100,nt(r[C.prod]),st,nt(r[C.cc])]);
      if(st&&!stations[st])stations[st]=[st,nt(r[C.stn]),nt(r[C.loc])];
    }else if(/^รวมทั้งสิ้น/.test(nt(a))){total=[parseFloat(r[C.liter])||0,parseFloat(r[C.baht])||0];}
  }
  return{rows,stations,total,title};
}
function processFiles(files){
  if(!ADMIN){openLogin('ต้องเข้าสู่ระบบผู้ดูแลก่อน');return;}
  files=[...files];if(!files.length)return;
  FPLAN=null;document.getElementById('set-plan').innerHTML='';
  const st=document.getElementById('ustatus');st.textContent='⏳ กำลังอ่าน '+files.length+' ไฟล์…';
  Promise.all(files.map(f=>new Promise((ok,bad)=>{const rd=new FileReader();rd.onload=e=>{try{
      const wb=XLSX.read(e.target.result,{type:'array'});let rep=null;
      wb.SheetNames.forEach(n=>{if(!rep)rep=parseFleetReport(XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:''}));});
      if(!rep)throw new Error(f.name+': ไม่ใช่ไฟล์ดิบ Fleet Card (ไม่พบหัวคอลัมน์ "เลขที่รายการ")');
      rep.file=f.name;ok(rep);}catch(err){bad(err);}};rd.onerror=()=>bad(new Error('อ่านไฟล์ไม่ได้'));rd.readAsArrayBuffer(f);})))
  .then(reps=>buildFuelPlan(reps)).catch(err=>{st.textContent='❌ '+err.message;});
}
function buildFuelPlan(reps){
  const st=document.getElementById('ustatus');
  const byDate={},stations={},dupDates=new Set();let checks=[];
  reps.forEach(rep=>{
    const L=rep.rows.reduce((s,r)=>s+r[4],0),B=rep.rows.reduce((s,r)=>s+r[5],0);
    const ok=rep.total?Math.abs(rep.total[0]-L)<0.01&&Math.abs(rep.total[1]-B)<0.01:null;
    checks.push({file:rep.file,title:rep.title,n:rep.rows.length,L,B,ok});
    const ds=new Set(rep.rows.map(r=>r[0]));
    ds.forEach(d=>{if(byDate[d])dupDates.add(d);});
    rep.rows.forEach(r=>{(byDate[r[0]]||(byDate[r[0]]=[])).push(r);});
    Object.assign(stations,rep.stations);
  });
  // ไฟล์ซ้อนวันกัน: ใช้ไฟล์ที่เลือกทีหลังสำหรับวันนั้น
  if(dupDates.size){const last={};reps.forEach((rep,i)=>rep.rows.forEach(r=>last[r[0]]=i));
    Object.keys(byDate).forEach(d=>{byDate[d]=reps[last[d]].rows.filter(r=>r[0]===d);});}
  const dates=Object.keys(byDate).sort(dateCmp);
  const bad=dates.filter(d=>!/^\d{1,2}\/\d{1,2}\/25\d\d$/.test(d));
  const rows=dates.flatMap(d=>byDate[d]);
  if(!rows.length){st.textContent='❌ ไม่พบรายการในไฟล์';return;}
  // จับคู่ล่วงหน้า (ตามฐานรถและการผูกทะเบียนปัจจุบัน)
  fleetCfg();
  let mL=0,uL=0,xL=0,prov={PTT:0,BCP:0,'อื่น':0};const uP=new Set(),mm=new Set();
  rows.forEach(r=>{prov[provOf(r[6])]+=r[4];const k=resolveKey(r[2]);if(FCFG.exclude[k]){xL+=r[4];return;}const c=VEH[k];if(!c){uL+=r[4];uP.add(k);return;}mL+=r[4];if(r[3]&&c.code&&r[3]!==c.code)mm.add(c.key);});
  const dset=new Set(dates),cur=ALL_ROWS.concat(UNMATCHED,EXCLUDED).filter(r=>dset.has(r.date));
  const months=[...new Set(dates.map(monthKey))];
  FPLAN={files:reps.map(r=>r.file),months,byMonth:months.map(mk=>{const ds=dates.filter(d=>monthKey(d)===mk);return{mk,dates:ds,rows:ds.flatMap(d=>byDate[d])};}),stations:Object.values(stations)};
  const tl=rows.reduce((s,r)=>s+r[4],0),tb=rows.reduce((s,r)=>s+r[5],0);
  st.textContent='อ่านไฟล์แล้ว ตรวจสรุปด้านล่างก่อนบันทึก';
  document.getElementById('set-plan').innerHTML=`
    <div class="sb2"><table class="dt"><thead><tr><th>ไฟล์</th><th>ช่วงในรายงาน</th><th class="r">รายการ</th><th class="r">ลิตร</th><th class="r">บาท</th><th>ตรงกับ "รวมทั้งสิ้น"</th></tr></thead><tbody>
    ${checks.map(c=>`<tr><td>${escH(c.file)}</td><td>${escH(c.title.replace(/^ตั้งแต่\s*/,''))}</td><td class="r">${fmt(c.n)}</td><td class="r">${fmt(c.L)}</td><td class="r">฿${fmt(c.B)}</td><td>${c.ok===null?'ไม่พบบรรทัดรวม':c.ok?'✅ ตรง':'<span class="badt">❌ ไม่ตรง</span>'}</td></tr>`).join('')}</tbody></table></div>
    <div class="stats">
      <div class="stat"><div><b>${fmt(rows.length)}</b><span>รายการที่จะบันทึก</span></div></div>
      <div class="stat"><div><b>${dates.length}</b><span>วัน · ${escH(months.map(monthLabel).join(', '))}</span></div></div>
      <div class="stat"><div><b>${fmt(tl)}</b><span>ลิตร · PTT ${pct(prov.PTT,tl).toFixed(1)}% · BCP ${pct(prov.BCP,tl).toFixed(1)}%</span></div></div>
      <div class="stat"><div><b>฿${fmt(tb)}</b><span>บาทรวม</span></div></div>
    </div>
    <p class="note" style="text-align:left;margin:0">ช่วงวันที่ ${escH(dates[0])} – ${escH(dates[dates.length-1])} · สถานี ${fmt(FPLAN.stations.length)} แห่ง<br>
    ${!FUEL_MODE&&ALL_ROWS.length?`ℹ️ ครั้งแรกที่บันทึกไฟล์ดิบ: ระบบจะเปลี่ยนไปใช้ชีต "น้ำมัน" แทนข้อมูลเดิม (ชีต1 เก็บไว้ ไม่ลบ) — เติมให้ครบทุกเดือนที่ต้องการดู`:cur.length?`⚠️ มีข้อมูลเดิม ${new Set(cur.map(r=>r.date)).size} วัน (${fmt(cur.length)} รายการ · ${fmt(cur.reduce((s,r)=>s+r.liter,0))} ลิตร) จะถูกลบแล้วแทนที่ด้วยค่าใหม่`:'✅ วันที่ใหม่ทั้งหมด เพิ่มเข้าระบบ'}
    ${dupDates.size?`<br>⚠️ มี ${dupDates.size} วันที่อยู่ในหลายไฟล์ ใช้ข้อมูลจากไฟล์ที่เลือกทีหลัง`:''}<br>
    จับคู่กับฐานรถ: ✅ ${fmt(mL)} ลิตร (${pct(mL,tl).toFixed(1)}%)${mm.size?` · รหัสรถไม่ตรง ${mm.size} คัน (นับตามฐานไปก่อน)`:''}
    ${uL?`<br><span class="badt">⚠️ ทะเบียนไม่อยู่ในฐาน ${fmt(uP.size)} ทะเบียน · ${fmt(uL)} ลิตร (${pct(uL,tl).toFixed(1)}%) — ยังไม่นับ ไปจัดการที่หน้า ตรวจข้อมูลรถ หลังบันทึก</span>`:''}
    ${xL?`<br>อยู่ในรายการไม่นับ ${fmt(xL)} ลิตร`:''}
    ${bad.length?`<br><span class="badt">วันที่ไม่ใช่รูปแบบ dd/mm/25xx ${bad.length} ค่า เช่น ${escH(bad.slice(0,3).join(', '))}</span>`:''}</p>
    <div class="btns"><button class="btn goldb" id="btn-commit" onclick="fuelCommit()" ${bad.length||checks.some(c=>c.ok===false)?'disabled':''}>บันทึกลง Google Sheet</button><button class="btn alt" onclick="cancelPlan()">ยกเลิก</button></div>`;
}
async function fuelCommit(){
  if(!FPLAN)return;const btn=document.getElementById('btn-commit'),st=document.getElementById('ustatus');btn.disabled=true;
  try{
    let add=0,rep=0;
    for(let i=0;i<FPLAN.byMonth.length;i++){const m=FPLAN.byMonth[i];
      st.textContent=`⏳ บันทึก ${monthLabel(m.mk)} (${i+1}/${FPLAN.byMonth.length}) · ${fmt(m.rows.length)} รายการ… อย่าปิดหน้านี้`;
      const res=await api({a:'fuel_upsert',file:FPLAN.files.join(', ')+' · '+monthLabel(m.mk),dates:m.dates,rows:m.rows,stations:i===0?FPLAN.stations:[]});
      add+=res.added;rep+=res.replaced;}
    FPLAN=null;document.getElementById('set-plan').innerHTML='';document.getElementById('finput').value='';
    st.textContent='✅ บันทึกแล้ว กำลังโหลดข้อมูลใหม่…';
    await loadData(true);
    st.textContent=`✅ บันทึกและโหลดข้อมูลใหม่แล้ว (เพิ่ม ${fmt(add)} · แทนที่ ${fmt(rep)} รายการ)`+(fleetAlertCount()?` · มีเรื่องให้ตรวจ ${fleetAlertCount()} รายการ ที่หน้า ตรวจข้อมูลรถ`:'');
  }catch(e){st.textContent='❌ บันทึกไม่สำเร็จ: '+(e.message==='denied'?'รหัสผู้ดูแลไม่ถูกต้อง':e.message==='busy'?'ระบบกำลังบันทึกงานอื่น รอสักครู่แล้วลองใหม่':e.message);btn.disabled=false;}
}

// ════════ หน้า ตรวจข้อมูลรถ (แจ้งเตือน) ════════
function mostCommon(arr){const m={};arr.forEach(x=>{if(x)m[x]=(m[x]||0)+1;});return Object.entries(m).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';}
function fleetAlerts(){
  if(!FLEET_ON)return{nw:[],mm:[],byCode:[]};
  // DC/กลุ่มที่พบมากสุดต่อ Cost Centre (ใช้เดาค่าให้รถใหม่)
  const ccDc={},ccGrp={};ALL_ROWS.forEach(r=>{if(!r.cc||!r.car)return;(ccDc[r.cc]||(ccDc[r.cc]=[])).push(r.car.dc);(ccGrp[r.cc]||(ccGrp[r.cc]=[])).push(r.car.group);});
  const nwM={};
  UNMATCHED.forEach(r=>{const k=plateKey(r.rawPlate||r.plate);const o=nwM[k]||(nwM[k]={key:k,plate:fmtPlate(r.rawPlate||r.plate),n:0,l:0,b:0,last:null,code:'',cc:[],months:new Set()});
    o.n++;o.l+=r.liter;o.b+=r.baht;o.cc.push(r.cc);o.months.add(monthKey(r.date));if(!o.last||tkey(r)>tkey(o.last))o.last=r;});
  const nw=Object.values(nwM).map(o=>{const cc=mostCommon(o.cc),lg=LEGACY[o.key];const code=o.last.code||'';
    return Object.assign(o,{cc,code,lastDate:o.last.date,rvt:rvtOf(cc),fleet:fleetOf(cc),legacy:lg||null,codeCar:code&&VEH_BY_CODE[code]&&VEH_BY_CODE[code].key!==o.key?VEH_BY_CODE[code]:null,
      guessDc:lg?dcCodeOf(lg[2]):mostCommon(ccDc[cc]||[]),guessGrp:lg?lg[1]:(fleetOf(cc)==='LAY'?'Lay':mostCommon(ccGrp[cc]||[])||'กระจาย')});}).sort((a,b)=>b.l-a.l);
  const byC={};nw.forEach(o=>{if(o.code)(byC[o.code]||(byC[o.code]=[])).push(o.plate);});
  nw.forEach(o=>{o.twins=o.code?(byC[o.code]||[]).filter(p=>p!==o.plate):[];});
  const lastBy={};ALL_ROWS.forEach(r=>{if(!r.car||!r.code)return;const o=lastBy[r.car.key];if(!o||tkey(r)>tkey(o))lastBy[r.car.key]=r;});
  const mm=Object.values(lastBy).filter(r=>r.code!==r.car.code&&FCFG.ignoreCode[r.car.key]!==r.code).map(r=>({car:r.car,code:r.code,date:r.date,rvt:rvtOf(r.cc),fleet:fleetOf(r.cc),plateInFile:fmtPlate(r.rawPlate),
    n:ALL_ROWS.filter(x=>x.car===r.car&&x.code===r.code).length})).sort((a,b)=>dkey(b.date)-dkey(a.date));
  return{nw,mm};
}
function fleetAlertCount(){const a=fleetAlerts();return a.nw.length+a.mm.length;}
function ownerGuess(rvt,fleet){return rvt==='NIM'?OWNERS[0]:fleet==='LAY'?OWNERS[3]:OWNERS[2];}
function renderFleetChk(){
  const box=document.getElementById('fchk-body');if(!box)return;
  const {nw,mm}=fleetAlerts();
  const nL=nw.reduce((s,o)=>s+o.l,0);
  document.getElementById('fchk-stats').innerHTML=`
    <div class="stat"><div><b>${fmt(nw.length)}</b><span>ทะเบียนไม่อยู่ในฐาน (ยังไม่นับ)</span></div></div>
    <div class="stat"><div><b>${fmt(nL)}</b><span>ลิตรที่ยังไม่นับ</span></div></div>
    <div class="stat"><div><b>${fmt(mm.length)}</b><span>รหัสรถไม่ตรง (นับตามฐานไปก่อน)</span></div></div>
    <div class="stat"><div><b>${fmt(Object.keys(FCFG.exclude).length)} / ${fmt(Object.keys(FCFG.alias).length)}</b><span>รายการไม่นับ / ทะเบียนที่ผูกไว้</span></div></div>`;
  const E=escH;
  box.innerHTML=`
  <div class="card"><h2>1. ทะเบียนไม่อยู่ในฐานรถ <small class="flog">${fmt(nw.length)} ทะเบียน · ยังไม่นับในแดชบอร์ด</small></h2>
    <p class="note" style="text-align:left">เพิ่มเข้าฐาน = กรอกข้อมูลรถแล้วบันทึก ตัวเลขทุกเดือนนับทันที · ผูกกับทะเบียน = กรณีพิมพ์ผิด/เปลี่ยนป้าย ให้นับรวมกับรถคันที่มีอยู่ · ไม่นับ = รถนอกขอบเขตแดชบอร์ด<br>ค่าที่กรอกไว้ให้มาจากข้อมูลเดิมในชีต1 (ถ้ามี) หรือ DC ที่พบมากใน Cost Centre เดียวกัน — ตรวจก่อนบันทึก</p>
    <div class="sb2" style="max-height:560px"><table class="dt"><thead><tr><th>ทะเบียนในไฟล์</th><th></th><th>รหัสรถล่าสุด</th><th>Cost Centre</th><th>ประเภทในรายงาน</th><th class="r">ครั้ง</th><th class="r">ลิตร</th><th>เติมล่าสุด</th><th>ข้อมูลที่พบ</th><th></th></tr></thead><tbody>
    ${nw.map(o=>`<tr><td><strong>${E(o.plate)}</strong></td><td class="actc"><button class="btn goldb btn-sm" onclick="chkAdd('${E(o.key)}')">เพิ่มเข้าฐาน</button><button class="btn alt btn-sm" onclick="chkAlias('${E(o.key)}')">ผูกกับทะเบียน</button><button class="btn alt btn-sm" onclick="chkExclude('${E(o.key)}')">ไม่นับ</button></td><td>${E(o.code)}</td><td>${E(o.cc)}</td><td>${o.rvt==='NIM'?'NIM รถบริษัท':'CO รถร่วม'}${o.fleet==='LAY'?' · Lay':''}</td><td class="r">${fmt(o.n)}</td><td class="r">${fmt(o.l)}</td><td>${E(o.lastDate)}</td>
      <td>${o.codeCar?`<span class="badt">รหัสตรงกับ ${E(o.codeCar.plate)} ในฐาน</span><br>`:''}${o.twins.length?`<span class="badt">รหัสเดียวกับ ${E(o.twins.join(', '))} (อาจพิมพ์ผิด — เพิ่มคันเดียว แล้วผูกอีกคัน)</span><br>`:''}${o.legacy?`ข้อมูลเดิม: ${E(o.legacy[1])} · ${E(o.legacy[2])} · PA ${fmt(+o.legacy[5]||0)}`:'<span class="flog">ไม่มีข้อมูลเดิม</span>'}</td></tr>`).join('')||'<tr><td colspan="10" style="text-align:center">✅ ทุกทะเบียนอยู่ในฐานรถแล้ว</td></tr>'}
    </tbody></table></div>
    ${nw.length?'<div class="btns"><button class="btn alt" onclick="exportFleetChk()">ดาวน์โหลดรายการ (Excel)</button></div>':''}</div>
  <div class="card"><h2>2. รหัสรถไม่ตรงกับฐาน <small class="flog">${fmt(mm.length)} คัน · นับตามข้อมูลเดิมในฐานไปก่อน</small></h2>
    <p class="note" style="text-align:left">ทะเบียนตรงแต่รหัสรถล่าสุดในไฟล์ต่างจากฐาน มักเกิดจากเปลี่ยนบัตรหรือเปลี่ยนผู้ถือครอง — ตรวจ เจ้าของ (บริษัท/ผปก) ด้วย · ยืนยัน = เปิดฟอร์มพร้อมรหัสใหม่ให้ตรวจแล้วบันทึก · คงรหัสเดิม = ไม่เตือนรหัสนี้อีก</p>
    <div class="sb2" style="max-height:560px"><table class="dt"><thead><tr><th>ทะเบียน</th><th></th><th>รหัสในฐาน</th><th>รหัสล่าสุดในไฟล์</th><th>เติมล่าสุด (รายการที่ใช้รหัสนี้)</th><th>เจ้าของในฐาน</th><th>ประเภทในรายงานล่าสุด</th><th></th></tr></thead><tbody>
    ${mm.map(o=>{const own=ownerGuess(o.rvt,o.fleet),diff=ownShort(own)!==o.car.owner;return `<tr><td><strong>${E(o.car.plate)}</strong><br><small class="flog">${E(o.car.group)} · ${E(o.car.dcLabel)}</small></td><td class="actc"><button class="btn goldb btn-sm" onclick="chkCode('${E(o.car.key)}','${E(o.code)}','${E(own)}')">ยืนยันรหัสใหม่</button><button class="btn alt btn-sm" onclick="chkKeep('${E(o.car.key)}','${E(o.code)}')">คงรหัสเดิม</button></td><td>${E(o.car.code||'-')}</td><td><strong>${E(o.code)}</strong></td><td>${E(o.date)} (${fmt(o.n)})</td><td>${E(o.car.ownerFull)}</td><td>${o.rvt==='NIM'?'NIM รถบริษัท':'CO รถร่วม'}${diff?' <span class="badt">ไม่ตรงกับฐาน</span>':''}</td></tr>`;}).join('')||'<tr><td colspan="8" style="text-align:center">✅ รหัสรถตรงกับฐานทุกคัน</td></tr>'}
    </tbody></table></div></div>
  <div class="card"><h2>รายการไม่นับ และทะเบียนที่ผูกไว้</h2>
    <div class="sb2"><table class="dt"><thead><tr><th>ประเภท</th><th>ทะเบียนในไฟล์</th><th>รายละเอียด</th><th></th></tr></thead><tbody>
    ${Object.entries(FCFG.exclude).map(([k,v])=>`<tr><td>ไม่นับ</td><td>${E(k)}</td><td>${E(v||'')}</td><td><button class="btn alt btn-sm" onclick="chkUnset('exclude','${E(k)}')">ยกเลิก</button></td></tr>`).join('')}
    ${Object.entries(FCFG.alias).map(([k,v])=>`<tr><td>ผูกทะเบียน</td><td>${E(k)}</td><td>นับรวมกับ ${E((VEH[v]||{}).plate||v)}</td><td><button class="btn alt btn-sm" onclick="chkUnset('alias','${E(k)}')">ยกเลิก</button></td></tr>`).join('')}
    ${Object.entries(FCFG.ignoreCode).map(([k,v])=>`<tr><td>คงรหัสเดิม</td><td>${E((VEH[k]||{}).plate||k)}</td><td>ไม่เตือนรหัส ${E(v)}</td><td><button class="btn alt btn-sm" onclick="chkUnset('ignoreCode','${E(k)}')">ยกเลิก</button></td></tr>`).join('')}
    ${!Object.keys(FCFG.exclude).length&&!Object.keys(FCFG.alias).length&&!Object.keys(FCFG.ignoreCode).length?'<tr><td colspan="4" style="text-align:center">ยังไม่มี</td></tr>':''}
    </tbody></table></div></div>`;
  syncFleetBadge();
}
function syncFleetBadge(){const n=FLEET_ON?fleetAlertCount():0;document.querySelectorAll('.fchk-nb').forEach(b=>{b.textContent=n;b.style.display=n?'':'none';});}
function chkFind(k){return fleetAlerts().nw.find(o=>o.key===k);}
function chkAdd(k){
  const o=chkFind(k);if(!o)return;const lg=o.legacy;
  const pre={plate:o.plate,code:o.code,group:GROUPS.includes(o.guessGrp)?o.guessGrp:'กระจาย',dc:o.guessDc,ownerFull:lg?ownNorm(lg[4]):ownerGuess(o.rvt,o.fleet),vtype:lg?lg[3]:'',
    paL:lg&&+lg[5]?+lg[5]:'',budget:'',_hint:'จากไฟล์: '+escH(o.cc)+' · '+(o.rvt==='NIM'?'NIM รถบริษัท':'CO รถร่วม')+(lg?' · ค่ากรอกให้จากข้อมูลเดิมในชีต1':' · ไม่มีข้อมูลเดิม DC เดาจาก Cost Centre')};
  if(pre.ownerFull==='03 รถร่วม บุคคลธรรมดา'&&o.rvt==='NIM')pre.ownerFull=OWNERS[0];
  openCar('',pre);
}
async function saveFleetCfg(mut,msg){
  const cur=JSON.parse(JSON.stringify(fleetCfg()));mut(cur);
  await api({a:'settings',settings:{fleet:cur}});
  window.SHEET_SETTINGS=Object.assign({},window.SHEET_SETTINGS||{},{fleet:cur});
  await fdbReload(msg);
}
function chkAlias(k){
  const o=chkFind(k);if(!o)return;
  const sug=o.codeCar?o.codeCar.plate:'';
  document.getElementById('m-car-title').textContent='ผูก '+o.plate+' กับรถในฐาน';
  document.getElementById('m-car-body').innerHTML=`
    <p class="note" style="text-align:left">น้ำมันของ <b>${escH(o.plate)}</b> (${fmt(o.l)} ลิตร) จะนับเป็นของรถคันที่เลือก ทุกเดือน${o.codeCar?`<br>รหัสรถ ${escH(o.code)} ตรงกับ <b>${escH(o.codeCar.plate)}</b> ในฐาน`:''}</p>
    <div class="field"><label for="al-to">ทะเบียนในฐาน</label><input id="al-to" list="al-list" value="${escH(sug)}" placeholder="พิมพ์ทะเบียน"><datalist id="al-list">${VEH_LIST.map(c=>`<option value="${escH(c.plate)}">${escH(c.group+' · '+c.dcLabel)}</option>`).join('')}</datalist></div>
    <p class="msg badt" id="car-msg" role="status"></p>
    <div class="btns"><button class="btn goldb" id="car-save" onclick="doAlias('${escH(k)}')">บันทึก</button></div>`;
  openM('m-car');
}
async function doAlias(k){
  const to=VEH[plateKey(document.getElementById('al-to').value)],m=document.getElementById('car-msg');
  if(!to){m.textContent='ไม่พบทะเบียนนี้ในฐานรถ';return;}
  document.getElementById('car-save').disabled=true;m.textContent='⏳ กำลังบันทึก…';
  try{await saveFleetCfg(c=>{c.alias[k]=to.key;},'✅ ผูก '+k+' กับ '+to.plate+' แล้ว');closeM('m-car');}catch(e){m.textContent='❌ '+e.message;document.getElementById('car-save').disabled=false;}
}
async function chkExclude(k){
  const o=chkFind(k);if(!o)return;
  const why=prompt('ไม่นับ '+o.plate+' ('+fmt(o.l)+' ลิตร) ในแดชบอร์ด\nหมายเหตุ (เช่น รถนอกขอบเขต):','');if(why===null)return;
  try{await saveFleetCfg(c=>{c.exclude[k]=why||o.cc;},'✅ ไม่นับ '+o.plate+' แล้ว');}catch(e){fleetToast('❌ '+e.message);}
}
function chkCode(key,code,own){
  const c=VEH[key];if(!c)return;
  openCar(key,{code,ownerFull:own,_hint:'รหัสในฐาน '+escH(c.code||'-')+' → รหัสล่าสุดในไฟล์ <b>'+escH(code)+'</b> · ตรวจ เจ้าของ ก่อนบันทึก (เดาจากประเภทในรายงาน)'});
}
async function chkKeep(key,code){try{await saveFleetCfg(c=>{c.ignoreCode[key]=code;},'✅ คงรหัสเดิมของ '+((VEH[key]||{}).plate||key));}catch(e){fleetToast('❌ '+e.message);}}
async function chkUnset(kind,k){if(!confirm('ยกเลิกรายการนี้?'))return;try{await saveFleetCfg(c=>{delete c[kind][k];},'✅ ยกเลิกแล้ว');}catch(e){fleetToast('❌ '+e.message);}}
function exportFleetChk(){
  const {nw,mm}=fleetAlerts();const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['ทะเบียนในไฟล์','รหัสรถล่าสุด','Cost Centre','ประเภทในรายงาน','ครั้ง','ลิตร','บาท','เติมล่าสุด','กลุ่ม (ข้อมูลเดิม)','DC (ข้อมูลเดิม)','PA ลิตร (ข้อมูลเดิม)'],
    ...nw.map(o=>[o.plate,o.code,o.cc,o.rvt,o.n,Math.round(o.l*100)/100,Math.round(o.b*100)/100,o.lastDate,o.legacy?o.legacy[1]:'',o.legacy?o.legacy[2]:'',o.legacy?o.legacy[5]:''])]),'ไม่อยู่ในฐาน');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['ทะเบียน','รหัสในฐาน','รหัสล่าสุด','ตั้งแต่','เจ้าของในฐาน','ประเภทในรายงาน'],...mm.map(o=>[o.car.plate,o.car.code,o.code,o.date,o.car.ownerFull,o.rvt])]),'รหัสไม่ตรง');
  XLSX.writeFile(wb,'NIMEX-Fleet-VehicleCheck.xlsx');
}

// ════════ หน้า รถไม่มีการใช้งานน้ำมัน ════════
function curMonths(){const mk=document.getElementById('f-month')?.value||'';return mk?[mk]:[...new Set(ALL_ROWS.map(r=>monthKey(r.date)))];}
function idleList(){
  if(!FLEET_ON)return[];
  const months=curMonths(),ms=new Set(months),used=new Set(),last={};
  ALL_ROWS.forEach(r=>{if(!r.car)return;if(ms.has(monthKey(r.date)))used.add(r.car.key);if(!last[r.car.key]||dkey(r.date)>dkey(last[r.car.key]))last[r.car.key]=r.date;});
  const now=new Date();
  return VEH_LIST.filter(c=>!used.has(c.key)&&inGrp(c.group)&&months.some(mk=>activeIn(c,mk))).map(c=>{
    const x=carPA(c,months),ld=last[c.key]||'';let days=null;
    if(ld){const [d,m,y]=ld.split('/').map(Number);days=Math.floor((now-new Date(y-543,m-1,d))/864e5);}
    return{car:c,pa:x?x.l:0,last:ld,days};}).sort((a,b)=>(b.days??1e9)-(a.days??1e9)||b.pa-a.pa);
}
function renderIdle(){
  const tb=document.getElementById('idle-body');if(!tb)return;
  const L=idleList(),mk=document.getElementById('f-month')?.value||'';
  document.getElementById('idle-scope').textContent=(mk?monthLabel(mk):'ทุกเดือนที่มีข้อมูล')+' · '+(GRP||'ทุกกลุ่ม');
  document.getElementById('idle-stats').innerHTML=`
    <div class="stat"><div><b>${fmt(L.length)}</b><span>คันที่ไม่ได้เติมเลย</span></div></div>
    <div class="stat"><div><b>${fmt(L.reduce((s,o)=>s+o.pa,0))}</b><span>PA ลิตรของรถกลุ่มนี้ (ทำให้ %PA ต่ำลง)</span></div></div>
    <div class="stat"><div><b>${fmt(L.filter(o=>!o.last).length)}</b><span>ไม่เคยเติมเลยในข้อมูลทั้งหมด</span></div></div>`;
  const E=escH;
  tb.innerHTML=L.map(o=>{const c=o.car;return `<tr><td><strong>${E(c.plate)}</strong></td><td>${E(c.code)}</td><td>${E(c.group)}</td><td>${E(c.dcLabel)}</td><td>${E(c.zone)}</td><td>${E(c.owner)}</td><td class="r">${fmt(o.pa)}</td><td>${o.last?E(o.last):'<span class="badt">ไม่เคยเติม</span>'}</td><td class="r">${o.days==null?'-':fmt(o.days)}</td>
    <td style="white-space:nowrap"><button class="btn alt btn-sm" onclick="openCar('${E(c.key)}',{end:'${E(o.last||todayBE())}',_hint:'ตั้งวันที่เลิกใช้ = วันที่เติมล่าสุด (แก้ได้) แล้วกดบันทึก'})">ตั้งเลิกใช้</button> <button class="btn alt btn-sm" onclick="openCar('${E(c.key)}')">แก้ไข</button></td></tr>`;}).join('')||'<tr><td colspan="10" style="text-align:center">✅ รถทุกคันมีการเติมน้ำมันในช่วงนี้</td></tr>';
}
function exportIdle(){
  const L=idleList();const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['ทะเบียน','รหัสรถ','กลุ่ม','DC','ภาค','เจ้าของ','PA ลิตร','เติมล่าสุด','ไม่ได้เติมมา (วัน)'],...L.map(o=>[o.car.plate,o.car.code,o.car.group,o.car.dcLabel,o.car.zone,o.car.owner,Math.round(o.pa),o.last,o.days==null?'':o.days])]),'รถไม่มีการใช้งาน');
  XLSX.writeFile(wb,'NIMEX-Fleet-IdleVehicles-'+(fileStamp?fileStamp():'')+'.xlsx');
}
