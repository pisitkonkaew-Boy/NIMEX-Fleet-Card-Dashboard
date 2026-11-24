// ════════ หน้า สัดส่วนการใช้น้ำมัน PTT / BCP + ส่วนลด PTT + วิเคราะห์จุดปัญหา ════════
// ส่วนลด PTT (ตกลงกับผู้ใช้ 24 พ.ย. 2569): คิดรายเดือน จากลิตร PTT ทั้งหมดที่เติมในเดือน (ทุกรายการในไฟล์ รวมรถที่ยังไม่อยู่ในฐาน)
// ขั้นทั้งก้อน: ≤100,000 = 0 · 100,001–200,000 = 0.60% · 200,001–300,000 = 0.70% · 300,001–400,000 = 0.90% · 400,001+ = 0.95%
// ส่วนลดเป็นลิตร = ลิตร PTT × % · บาท = ลิตรส่วนลด × ราคาเฉลี่ย PTT ของเดือน

const TIERS=[{min:100000,r:.006},{min:200000,r:.007},{min:300000,r:.009},{min:400000,r:.0095}];
function tierRate(L){let r=0;TIERS.forEach(t=>{if(L>t.min)r=t.r;});return r;}
function nextTier(L){const t=TIERS.find(t=>L<=t.min);return t?{need:t.min+1-L,at:t.min+1,r:t.r}:null;}
function discL(L){return L*tierRate(L);}
const prodClass=p=>/B20/i.test(p)?'B20':/DIESEL/i.test(p)?'ดีเซล':'เบนซิน';
const stProv=st=>{const s=STATIONS[st];if(!s||!s.loc)return'';const w=s.loc.trim().split(/\s+/);return w[w.length-1]||'';};
const isNight=r=>{const h=+(String(r.time||'').split(':')[0]);return !isNaN(h)&&(h>=21||h<=5);};
let MIX={dim:'zone',move:30};

function allFuelRows(){return ALL_ROWS.concat(UNMATCHED||[],EXCLUDED||[]);}
// สถิติรายเดือนระดับบริษัท (ใช้คิดขั้นส่วนลด)
function monthStat(mk){
  const o={mk,pttL:0,pttB:0,bcpL:0,bcpB:0,oth:0,days:new Set()};
  allFuelRows().forEach(r=>{if(monthKey(r.date)!==mk)return;o.days.add(r.date);if(r.prov==='PTT'){o.pttL+=r.liter;o.pttB+=r.baht;}else if(r.prov==='BCP'){o.bcpL+=r.liter;o.bcpB+=r.baht;}else o.oth+=r.liter;});
  const [m,y]=mk.split('/').map(Number),dim=new Date(y-543,m,0).getDate();
  const lastDay=Math.max(0,...[...o.days].map(d=>+d.split('/')[0]));
  o.price=o.pttL>0?o.pttB/o.pttL:0;o.rate=tierRate(o.pttL);o.dL=discL(o.pttL);o.dB=o.dL*o.price;o.next=nextTier(o.pttL);
  o.dim=dim;o.lastDay=lastDay;o.partial=lastDay<dim;o.f=lastDay?dim/lastDay:1;
  o.projL=o.pttL*o.f;o.projRate=tierRate(o.projL);o.projDB=discL(o.projL)*o.price;
  if(o.next){o.nextGainL=discL(o.next.at)-o.dL;o.nextGainB=o.nextGainL*o.price;}
  return o;
}
// ส่วนลดที่เพิ่ม (บาท) ถ้าย้าย addL ลิตรมาเติม PTT ในเดือนนั้น
function gainIfMove(st,addL){if(!(addL>0))return 0;return (discL(st.pttL+addL)-st.dL)*st.price;}

function mixRows(){return CUR_ROWS.filter(r=>r.prov);}
function renderMix(){
  const box=document.getElementById('mix-kpi');if(!box||!D)return;
  if(!FUEL_MODE){document.getElementById('mix-body').hidden=true;document.getElementById('mix-empty').hidden=false;return;}
  document.getElementById('mix-body').hidden=false;document.getElementById('mix-empty').hidden=true;
  const months=curMonths().sort((a,b)=>dkey('01/'+a)-dkey('01/'+b)),stats=months.map(monthStat),SM={};stats.forEach(s=>SM[s.mk]=s);
  const rows=mixRows();
  const fP=rows.filter(r=>r.prov==='PTT'),fB=rows.filter(r=>r.prov==='BCP');
  const pL=fP.reduce((s,r)=>s+r.liter,0),bL=fB.reduce((s,r)=>s+r.liter,0),tL=rows.reduce((s,r)=>s+r.liter,0);
  const pB=fP.reduce((s,r)=>s+r.baht,0),bB=fB.reduce((s,r)=>s+r.baht,0);
  const dL=stats.reduce((s,o)=>s+o.dL,0),dB=stats.reduce((s,o)=>s+o.dB,0);
  const one=stats.length===1?stats[0]:null;
  // เทียบเดือนก่อน (วันที่เท่ากัน) สำหรับ %PTT ของตัวกรองปัจจุบัน
  let prevTxt='';
  if(one){const [m,y]=one.mk.split('/').map(Number),pm=m===1?12:m-1,py=m===1?y-1:y,pmk=String(pm).padStart(2,'0')+'/'+py;
    const pr=ALL_ROWS.filter(r=>monthKey(r.date)===pmk&&+r.date.split('/')[0]<=one.lastDay&&inGrp(r.group)&&r.prov);
    if(pr.length){const pp=pr.filter(r=>r.prov==='PTT').reduce((s,r)=>s+r.liter,0)/pr.reduce((s,r)=>s+r.liter,0)*100,cur=pct(pL,tL),d=cur-pp;
      prevTxt=`<span class="${d>=0?'dgood':'dbad'}">${d>=0?'▲':'▼'} ${Math.abs(d).toFixed(1)} จุด</span> เทียบ 1–${one.lastDay} ${monthLabel(pmk)}`;}}
  box.innerHTML=`
    <div class="kpi"><div class="klab">ลิตร PTT${GRP?' · '+escH(GRP):''}</div><div class="kbig">${fmt(pL)} <small>ล.</small></div><div class="ksub">${pct(pL,tL).toFixed(1)}% (รถในฐาน${GRP?' · '+escH(GRP):''})${one?` · ทั้งบริษัท ${pct(one.pttL,one.pttL+one.bcpL+one.oth).toFixed(1)}%`:''} ${prevTxt?'<br>'+prevTxt:''}</div><div class="kbar"><i style="width:${pct(pL,tL).toFixed(1)}%"></i></div></div>
    <div class="kpi"><div class="klab">ลิตร BCP${GRP?' · '+escH(GRP):''}</div><div class="kbig">${fmt(bL)} <small>ล.</small></div><div class="ksub">${pct(bL,tL).toFixed(1)}% · ฿${fmt(bB)} · เฉลี่ย ${bL?(bB/bL).toFixed(2):'-'} บ./ล.</div><div class="kbar"><i style="width:${pct(bL,tL).toFixed(1)}%"></i></div></div>
    <div class="kpi"><div class="klab">ส่วนลด PTT ที่ได้ (ทั้งบริษัท)</div><div class="kbig">${fmt(dL)} <small>ล.</small></div><div class="ksub">≈ ฿${fmt(dB)}${one?` · ขั้น ${(one.rate*100).toFixed(2)}% จาก PTT ${fmt(one.pttL)} ล.`:` · รวม ${stats.length} เดือน`}</div></div>
    ${one?(one.next?`<div class="kpi"><div class="klab">เติม PTT อีกเท่าไรถึงขั้นถัดไป</div><div class="kbig">${fmt(one.next.need)} <small>ล.</small></div><div class="ksub">ขั้น ${(one.next.r*100).toFixed(2)}% · ส่วนลดเพิ่ม ${fmt(one.nextGainL)} ล. ≈ ฿${fmt(one.nextGainB)}${one.partial?` · คาดสิ้นเดือน PTT ${fmt(one.projL)} ล. (ขั้น ${(one.projRate*100).toFixed(2)}%)`:''}</div></div>`
      :`<div class="kpi"><div class="klab">ขั้นส่วนลดสูงสุดแล้ว</div><div class="kbig">0.95%</div><div class="ksub">PTT เกิน 400,000 ลิตร</div></div>`)
     :`<div class="kpi"><div class="klab">ราคาเฉลี่ย</div><div class="kbig">${pL?(pB/pL).toFixed(2):'-'} / ${bL?(bB/bL).toFixed(2):'-'}</div><div class="ksub">PTT / BCP บาทต่อลิตร (ทุกชนิดน้ำมันรวมกัน)</div></div>`}`;
  renderTierBar(stats);renderSim(stats,SM,rows);renderMixTable(SM,rows);renderMixCharts(months);renderMixAnalysis(SM,rows);
}
function renderTierBar(stats){
  const el=document.getElementById('mix-tier');if(!el)return;
  if(stats.length!==1){el.innerHTML=`<table class="dt"><thead><tr><th>เดือน</th><th class="r">PTT ลิตร</th><th class="r">BCP ลิตร</th><th class="r">%PTT</th><th>ขั้น</th><th class="r">ส่วนลด (ล.)</th><th class="r">ส่วนลด (฿)</th><th class="r">อีกกี่ลิตรถึงขั้นถัดไป</th><th class="r">ส่วนลดเพิ่ม (฿)</th></tr></thead><tbody>${stats.map(o=>`<tr><td>${monthLabel(o.mk)}${o.partial?` <small class="flog">(1–${o.lastDay})</small>`:''}</td><td class="r">${fmt(o.pttL)}</td><td class="r">${fmt(o.bcpL)}</td><td class="r">${pct(o.pttL,o.pttL+o.bcpL+o.oth).toFixed(1)}%</td><td>${(o.rate*100).toFixed(2)}%</td><td class="r">${fmt(o.dL)}</td><td class="r">฿${fmt(o.dB)}</td><td class="r">${o.next?fmt(o.next.need):'—'}</td><td class="r">${o.next?'฿'+fmt(o.nextGainB):'—'}</td></tr>`).join('')}</tbody></table>`;return;}
  const o=stats[0],MAX=450000,x=v=>Math.min(100,v/MAX*100).toFixed(2);
  el.innerHTML=`<div class="tierbar">
    ${[0,...TIERS.map(t=>t.min)].map((m,i)=>{const r=i?TIERS[i-1].r:0,w=((i<TIERS.length?TIERS[i].min:MAX)-m)/MAX*100;return `<div class="tseg${o.rate===r?' on':''}" style="left:${x(m)}%;width:${w.toFixed(2)}%"><b>${(r*100).toFixed(2)}%</b><small>${m?fmt(m/1000)+'k':'0'}–${i<TIERS.length?fmt(TIERS[i].min/1000)+'k':'ขึ้นไป'}</small></div>`;}).join('')}
    <div class="tpin" style="left:${x(o.pttL)}%"><span>ตอนนี้ ${fmt(o.pttL)} ล.</span></div>
    ${o.partial?`<div class="tpin proj" style="left:${x(o.projL)}%"><span>คาดสิ้นเดือน ${fmt(o.projL)} ล.</span></div>`:''}
  </div><p class="flog">ข้อมูล 1–${o.lastDay} ${monthLabel(o.mk)}${o.partial?` · คาดการณ์สิ้นเดือน = ลิตร PTT × ${o.dim}/${o.lastDay} วัน`:''} · ขั้นนับจากลิตร PTT ทั้งบริษัท (ทุกกลุ่ม รวมรถที่ยังไม่อยู่ในฐาน)</p>`;
}
function renderSim(stats,SM,rows){
  const el=document.getElementById('mix-sim');if(!el)return;
  const p=MIX.move/100;let addL=0,now=0,after=0;
  const byM={};rows.forEach(r=>{if(r.prov==='BCP'){const mk=monthKey(r.date);byM[mk]=(byM[mk]||0)+r.liter;}});
  stats.forEach(o=>{const a=(byM[o.mk]||0)*p;addL+=a;now+=o.dB;after+=discL(o.pttL+a)*o.price;});
  const one=stats.length===1?stats[0]:null;
  const lab=document.getElementById('mix-move-lab');if(lab)lab.textContent='ย้าย BCP '+(GRP?'ของ '+GRP+' ':'')+'มาเติม PTT';
  const v=document.getElementById('mix-move-v');if(v)v.textContent=MIX.move+'%';
  el.innerHTML=`<div class="stats">
      <div class="stat"><div><b>${fmt(addL)}</b><span>ลิตรที่ย้ายมา PTT</span></div></div>
      <div class="stat"><div><b>${one?((tierRate(one.pttL+addL)*100).toFixed(2)+'%'):'-'}</b><span>ขั้นส่วนลดใหม่${one?' (เดิม '+(one.rate*100).toFixed(2)+'%)':''}</span></div></div>
      <div class="stat"><div><b>฿${fmt(after)}</b><span>ส่วนลดใหม่ (เดิม ฿${fmt(now)})</span></div></div>
      <div class="stat"><div><b class="dgood">+฿${fmt(after-now)}</b><span>ส่วนลดเพิ่ม${stats.length>1?' รวม '+stats.length+' เดือน':''}</span></div></div>
    </div>`;
  window._simArgs=[stats,SM,rows];
}
function simArgs(){return window._simArgs||[[],{},[]];}

const MIX_DIMS={zone:['ภาค',r=>r.zone||'(ไม่มีภาค)'],dc:['DC',r=>r.dc],group:['กลุ่ม',r=>r.group],owner:['เจ้าของ',r=>r.owner],plate:['ทะเบียน',r=>r.plate],cc:['Cost Centre',r=>r.cc||'-']};
function mixAgg(rows,keyFn,SM){
  const m={};rows.forEach(r=>{const k=keyFn(r);const o=m[k]||(m[k]={key:k,l:0,pL:0,pB:0,bL:0,bB:0,cars:new Set(),bcpM:{},night:0,zone:r.zone,dc:r.dc});
    o.l+=r.liter;o.cars.add(r.plate);if(r.prov==='PTT'){o.pL+=r.liter;o.pB+=r.baht;}else if(r.prov==='BCP'){o.bL+=r.liter;o.bB+=r.baht;const mk=monthKey(r.date);o.bcpM[mk]=(o.bcpM[mk]||0)+r.liter;if(isNight(r))o.night+=r.liter;}});
  return Object.values(m).map(o=>{o.gain=Object.entries(o.bcpM).reduce((s,[mk,l])=>s+(SM[mk]?gainIfMove(SM[mk],l):0),0);o.sh=pct(o.pL,o.l);return o;});
}
function renderMixTable(SM,rows){
  const tb=document.getElementById('mix-tbody');if(!tb)return;
  const [lab,fn]=MIX_DIMS[MIX.dim];document.getElementById('mix-dimh').textContent=lab;
  const L=mixAgg(rows,fn,SM).sort((a,b)=>b.bL-a.bL),tB=L.reduce((s,o)=>s+o.bL,0);
  tb.innerHTML=L.slice(0,500).map((o,i)=>`<tr${MIX.dim==='dc'||MIX.dim==='plate'?` class="clickrow" onclick="${MIX.dim==='dc'?`showDCVeh('${escH(o.key)}')`:`showVehModal('${escH(o.key)}')`}"`:''}>
    <td style="color:var(--muted)">${i+1}</td><td><strong>${escH(MIX.dim==='dc'?o.key.replace(/^\d+\s+/,''):o.key)}</strong>${MIX.dim==='dc'||MIX.dim==='plate'?`<small class="flog"> ${escH(o.zone||'')}</small>`:''}</td>
    <td class="r">${fmt(o.l)}</td><td class="r">${fmt(o.pL)}</td><td class="r"><strong>${fmt(o.bL)}</strong></td>
    <td><div class="bi"><div class="bm mixbar"><div class="bf" style="width:${o.sh.toFixed(1)}%"></div></div><span style="font-size:12px;min-width:44px">${o.sh.toFixed(1)}%</span></div></td>
    <td class="r">${o.pL?(o.pB/o.pL).toFixed(2):'—'}</td><td class="r">${o.bL?(o.bB/o.bL).toFixed(2):'—'}</td>
    <td class="r">${o.bL?pct(o.night,o.bL).toFixed(0)+'%':'—'}</td>
    <td class="r">${o.gain>0?'฿'+fmt(o.gain):'—'}</td><td class="r">${o.cars.size}</td><td class="r">${tB?pct(o.bL,tB).toFixed(1)+'%':'—'}</td></tr>`).join('')||'<tr><td colspan="12" style="text-align:center">ไม่มีข้อมูล</td></tr>';
}
function setMixDim(d){MIX.dim=d;renderMixTable(simArgs()[1],simArgs()[2]);}
function renderMixCharts(months){
  if(typeof Chart==='undefined')return;
  const P=cssv('--s1'),Bc=cssv('--s2'),tc_=cssv('--muted'),gc_=cssv('--line');
  // ภาค: แท่งซ้อน 100%
  const z=mixAgg(mixRows(),r=>r.zone||'(ไม่มีภาค)',{}).filter(o=>o.l>0).sort((a,b)=>a.sh-b.sh);
  dc2('c-mixzone');const c1=document.getElementById('c-mixzone');
  if(c1){c1.parentNode.style.height=Math.max(220,z.length*26+40)+'px';CH['c-mixzone']=new Chart(c1,{type:'bar',data:{labels:z.map(o=>o.key),datasets:[{label:'PTT',data:z.map(o=>+o.sh.toFixed(1)),backgroundColor:P},{label:'BCP',data:z.map(o=>+pct(o.bL,o.l).toFixed(1)),backgroundColor:Bc}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true,max:100,ticks:{color:tc_,callback:v=>v+'%'},grid:{color:gc_}},y:{stacked:true,ticks:{color:tc_},grid:{display:false}}},plugins:{legend:{labels:{color:tc_}},tooltip:{callbacks:{label:c=>`${c.dataset.label} ${c.raw}% · ${fmt(c.datasetIndex?z[c.dataIndex].bL:z[c.dataIndex].pL)} ล.`}}}}});}
  // แนวโน้มรายเดือน (ทั้งบริษัท ตามแท็บกลุ่ม)
  const allM=[...new Set(ALL_ROWS.map(r=>monthKey(r.date)))].sort((a,b)=>dkey('01/'+a)-dkey('01/'+b));
  const tr=allM.map(mk=>{const rs=ALL_ROWS.filter(r=>monthKey(r.date)===mk&&inGrp(r.group)&&r.prov);const l=rs.reduce((s,r)=>s+r.liter,0),p=rs.filter(r=>r.prov==='PTT').reduce((s,r)=>s+r.liter,0);return{mk,sh:pct(p,l),st:monthStat(mk)};});
  dc2('c-mixtrend');const c2=document.getElementById('c-mixtrend');
  if(c2)CH['c-mixtrend']=new Chart(c2,{data:{labels:tr.map(o=>monthLabel(o.mk).replace(/ 25\d\d$/,'')),datasets:[
      {type:'line',label:'%PTT'+(GRP?' · '+GRP:''),data:tr.map(o=>+o.sh.toFixed(1)),borderColor:P,backgroundColor:P,yAxisID:'y',tension:.3},
    ]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{min:Math.max(0,Math.floor(Math.min(...tr.map(o=>o.sh))/10)*10-10),max:100,ticks:{color:tc_,callback:v=>v+'%'},grid:{color:gc_}},x:{ticks:{color:tc_},grid:{display:false}}},
      plugins:{legend:{labels:{color:tc_}},tooltip:{callbacks:{afterLabel:c=>{const s=tr[c.dataIndex].st;return `ส่วนลดทั้งบริษัท ${(s.rate*100).toFixed(2)}% ≈ ฿${fmt(s.dB)}`;}}}}}});
  const n=document.getElementById('mix-trend-note');if(n&&tr.length)n.textContent='แกนเริ่มที่ '+CH['c-mixtrend'].options.scales.y.min+'%';
}

// ════════ วิเคราะห์จุดปัญหา: ทำไมรถถึงไปเติม BCP ════════
function priceRef(){
  const m={};allFuelRows().forEach(r=>{if(!r.prov||r.prov==='อื่น')return;const k=monthKey(r.date)+'|'+stProv(r.station)+'|'+prodClass(r.product)+'|'+r.prov;const o=m[k]||(m[k]=[0,0]);o[0]+=r.liter;o[1]+=r.baht;});
  return m;
}
// ส่วนต่างราคา BCP − PTT ต่อลิตร (น้ำมันชนิดเดียวกัน จังหวัดเดียวกัน เดือนเดียวกัน) ถ่วงด้วยลิตร BCP
function priceGap(bcpRows,ref){
  let w=0,g=0;bcpRows.forEach(r=>{const base=monthKey(r.date)+'|'+stProv(r.station)+'|'+prodClass(r.product);const p=ref[base+'|PTT'];if(!p||!p[0])return;g+=r.liter*(r.baht/r.liter-p[1]/p[0]);w+=r.liter;});
  return w?{gap:g/w,cov:w}:null;
}
function renderMixAnalysis(SM,rows){
  const el=document.getElementById('mix-ana');if(!el)return;
  const ref=priceRef(),bcp=rows.filter(r=>r.prov==='BCP'),ptt=rows.filter(r=>r.prov==='PTT');
  const bL=bcp.reduce((s,r)=>s+r.liter,0);if(!bL){el.innerHTML='<p class="note">ไม่มีการเติม BCP ในตัวกรองนี้ ✅</p>';return;}
  const pg=priceGap(bcp,ref),stats=Object.values(SM),avgRate=stats.length?stats.reduce((s,o)=>s+o.rate*o.price*o.pttL,0)/Math.max(1,stats.reduce((s,o)=>s+o.pttL,0)):0;
  const nB=pct(bcp.filter(isNight).reduce((s,r)=>s+r.liter,0),bL),nP=pct(ptt.filter(isNight).reduce((s,r)=>s+r.liter,0),ptt.reduce((s,r)=>s+r.liter,0));
  const b20=pct(bcp.filter(r=>prodClass(r.product)==='B20').reduce((s,r)=>s+r.liter,0),bL);
  const own=mixAgg(rows,r=>r.owner,SM),carAgg=mixAgg(rows,r=>r.plate,SM);
  const onlyB=carAgg.filter(o=>o.bL>0&&o.pL===0),mixed=carAgg.filter(o=>o.bL>0&&o.pL>0);
  const E=escH,gainAll=Object.entries(bcp.reduce((m,r)=>{const k=monthKey(r.date);m[k]=(m[k]||0)+r.liter;return m;},{})).reduce((s,[mk,l])=>s+(SM[mk]?gainIfMove(SM[mk],l):0),0);
  // DC ที่เป็นจุดปัญหา
  const ms=new Set(Object.keys(SM)),ux={pL:0,bL:0};(UNMATCHED||[]).forEach(r=>{if(!ms.has(monthKey(r.date)))return;if(r.prov==='PTT')ux.pL+=r.liter;else if(r.prov==='BCP')ux.bL+=r.liter;});
  const dcs=mixAgg(rows,r=>r.dc,SM).filter(o=>o.bL>0).sort((a,b)=>b.bL-a.bL).slice(0,10);
  const dcCards=dcs.map(o=>{
    const rs=rows.filter(r=>r.dc===o.key),rb=rs.filter(r=>r.prov==='BCP'),rp=rs.filter(r=>r.prov==='PTT');
    const g=priceGap(rb,ref),night=pct(rb.filter(isNight).reduce((s,r)=>s+r.liter,0),o.bL),b2=pct(rb.filter(r=>prodClass(r.product)==='B20').reduce((s,r)=>s+r.liter,0),o.bL);
    const st={};rb.forEach(r=>{const s=st[r.station]||(st[r.station]={n:0,l:0});s.n++;s.l+=r.liter;});
    const topSt=Object.entries(st).sort((a,b)=>b[1].l-a[1].l).slice(0,3);
    const provs=new Set(rb.map(r=>stProv(r.station)));const pttSt=new Set(rp.filter(r=>provs.has(stProv(r.station))).map(r=>r.station));
    const cars=mixAgg(rs,r=>r.plate,SM).filter(c=>c.bL>0).sort((a,b)=>b.bL-a.bL);
    const only=cars.filter(c=>c.pL===0).length;
    const why=[];
    if(g){why.push(g.gap<-0.05?`BCP ถูกกว่า PTT ชนิดเดียวกัน ${Math.abs(g.gap).toFixed(2)} บ./ล. (ส่วนลด PTT ≈ ${avgRate.toFixed(2)} บ./ล.)`:g.gap>0.05?`BCP แพงกว่า PTT ${g.gap.toFixed(2)} บ./ล. — ไม่ใช่เรื่องราคา`:'ราคาใกล้เคียงกัน (ต่างไม่ถึง 5 สตางค์) — ไม่ใช่เรื่องราคา');}
    if(night>=25)why.push(`เติมกลางคืน (21:00–05:59) ${night.toFixed(0)}% ของลิตร BCP — ปั๊ม PTT บนเส้นทางอาจปิด/ไม่สะดวกช่วงนี้`);
    if(pttSt.size===0)why.push('ในจังหวัดที่เติม BCP รถ DC นี้ไม่เคยเติม PTT เลย — อาจไม่มีปั๊ม PTT ที่สะดวกบนเส้นทาง');
    else if(pttSt.size<=2)why.push(`ในจังหวัดเดียวกันรถ DC นี้ใช้ปั๊ม PTT แค่ ${pttSt.size} แห่ง`);
    if(only)why.push(`รถ ${only} คันเติม BCP อย่างเดียว`);
    if(b2>=30)why.push(`เป็น B20 ${b2.toFixed(0)}% ของลิตร BCP`);
    return `<div class="anacard"><div class="anah"><b>${E(o.key.replace(/^\d+\s+/,''))}</b><small> ${E(o.zone||'')}</small><span class="bdg b-gray">BCP ${fmt(o.bL)} ล. · PTT ${o.sh.toFixed(0)}%</span>${o.gain>0?`<span class="bdg b-blue">ย้ายมา PTT ได้ส่วนลดเพิ่ม ≈ ฿${fmt(o.gain)}</span>`:''}</div>
      <ul>${why.map(w=>`<li>${w}</li>`).join('')||'<li>ไม่พบสาเหตุเด่นจากข้อมูล — ควรสอบถามคนขับ/หัวหน้า DC</li>'}</ul>
      <p class="flog">ปั๊ม BCP ที่ใช้บ่อย: ${topSt.map(([k,s])=>`${E((STATIONS[k]||{}).name||k)} <span>(${E((STATIONS[k]||{}).loc||'')} · ${s.n} ครั้ง · ${fmt(s.l)} ล.)</span>`).join(' · ')||'-'}<br>รถที่เติม BCP มากสุด: ${cars.slice(0,3).map(c=>`${E(c.key)} ${fmt(c.bL)} ล.${c.pL===0?' (BCP อย่างเดียว)':''}`).join(' · ')}</p></div>`;}).join('');
  el.innerHTML=`
    <div class="card"><h2>สรุปสาเหตุจากข้อมูล${GRP?' · '+E(GRP):''}</h2>
      <ul class="anasum">
        <li><b>ราคา:</b> ${pg?(Math.abs(pg.gap)<0.05?`น้ำมันชนิดเดียวกัน จังหวัดเดียวกัน เดือนเดียวกัน ราคา BCP กับ PTT <b>ต่างกันเฉลี่ยแค่ ${Math.abs(pg.gap).toFixed(3)} บ./ล.</b>`:`BCP ${pg.gap<0?'ถูกกว่า':'แพงกว่า'} PTT เฉลี่ย <b>${Math.abs(pg.gap).toFixed(2)} บ./ล.</b> (น้ำมันชนิดเดียวกัน จังหวัดเดียวกัน)`)+` ขณะที่ส่วนลด PTT ≈ <b>${avgRate.toFixed(2)} บ./ล.</b> → ${pg.gap>-avgRate?'หักส่วนลดแล้ว <b>PTT คุ้มกว่า</b>':'BCP ยังถูกกว่าแม้หักส่วนลด'} (เทียบได้ ${pct(pg.cov,bL).toFixed(0)}% ของลิตร BCP)`:'ไม่มีข้อมูลราคาเทียบ'}</li>
        <li><b>เวลา:</b> เติม BCP ช่วง 21:00–05:59 <b>${nB.toFixed(0)}%</b> ของลิตร เทียบ PTT ${nP.toFixed(0)}% ${nB>nP*1.5?'→ <b>รถวิ่งกลางคืนหันไปเติม BCP มากกว่าชัดเจน</b>':''}</li>
        <li><b>เจ้าของรถ:</b> ${own.sort((a,b)=>a.sh-b.sh).map(o=>`${E(o.key)} เติม PTT ${o.sh.toFixed(0)}% (BCP ${fmt(o.bL)} ล.)`).join(' · ')}</li>
        <li><b>พฤติกรรม:</b> รถเติม BCP อย่างเดียว ${onlyB.length} คัน (${fmt(onlyB.reduce((s,o)=>s+o.bL,0))} ล.) · รถที่สลับเติมทั้งสองเจ้า ${mixed.length} คัน (BCP ${fmt(mixed.reduce((s,o)=>s+o.bL,0))} ล.)</li>
        <li><b>ชนิดน้ำมัน:</b> B20 เป็น ${b20.toFixed(0)}% ของลิตร BCP (ราคาต่ำกว่าดีเซลปกติ ทำให้ราคาเฉลี่ย BCP ดูถูก)</li>
        ${!GRP&&ux.bL>0?`<li><b>รถที่ยังไม่อยู่ในฐาน:</b> เติม BCP <b>${fmt(ux.bL)} ล.</b> (PTT ${pct(ux.pL,ux.pL+ux.bL).toFixed(0)}%) ไม่แสดงในตารางด้านบน แต่มีผลกับขั้นส่วนลด — เพิ่มรถเข้าฐานที่หน้า ตรวจข้อมูลรถ (ผู้ดูแล) เพื่อให้วิเคราะห์ได้ครบ</li>`:''}
        <li><b>ถ้าย้าย BCP ทั้งหมดในตัวกรองนี้มา PTT:</b> ส่วนลดเพิ่ม ≈ <b>฿${fmt(gainAll)}</b>${stats.length>1?' (รวมทุกเดือนที่เลือก)':''}</li>
      </ul></div>
    <div class="card"><h2>10 DC ที่เติม BCP มากที่สุด</h2><p class="note" style="text-align:left">เรียงตามลิตร BCP · สาเหตุคำนวณจากข้อมูลการเติมจริง (ราคา เวลา ปั๊ม รถ) — ใช้เป็นจุดเริ่มคุยกับ DC</p><div class="anagrid">${dcCards}</div></div>`;
}
function expMix(){
  const [SM,rows]=[simArgs()[1],simArgs()[2]],wb=XLSX.utils.book_new();
  Object.entries(MIX_DIMS).forEach(([k,[lab,fn]])=>{const L=mixAgg(rows,fn,SM).sort((a,b)=>b.bL-a.bL);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([[lab,'ลิตรรวม','PTT ลิตร','BCP ลิตร','%PTT','ราคา PTT','ราคา BCP','BCP กลางคืน %','ส่วนลดเพิ่มถ้าย้าย (บาท)','รถ'],
      ...L.map(o=>[o.key,round1(o.l),round1(o.pL),round1(o.bL),round1(o.sh),o.pL?+(o.pB/o.pL).toFixed(2):'',o.bL?+(o.bB/o.bL).toFixed(2):'',o.bL?round1(pct(o.night,o.bL)):'',Math.round(o.gain),o.cars.size])]),lab.slice(0,28));});
  const st=curMonths().map(monthStat);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['เดือน','PTT ลิตร (ทั้งบริษัท)','BCP ลิตร','ขั้น %','ส่วนลด ลิตร','ราคาเฉลี่ย PTT','ส่วนลด บาท','อีกกี่ลิตรถึงขั้นถัดไป','ส่วนลดเพิ่ม (บาท)'],...st.map(o=>[monthLabel(o.mk),round1(o.pttL),round1(o.bcpL),o.rate*100,round1(o.dL),+o.price.toFixed(2),Math.round(o.dB),o.next?Math.ceil(o.next.need):'',o.next?Math.round(o.nextGainB):''])]),'ส่วนลด PTT');
  XLSX.writeFile(wb,'NIMEX-Fleet-PTT-BCP-'+fileStamp()+'.xlsx');
}
