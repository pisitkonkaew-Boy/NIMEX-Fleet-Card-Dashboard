// ════════ ส่งออก: หัวข้อ PTT / BCP และส่วนลด (แยกหน้า แยกหัวเรื่อง) ════════
// ใช้ข้อมูลเดียวกับหน้า สัดส่วนการใช้น้ำมัน (mix.js) และตัวช่วยวาดของ share.js
// Excel = 1 ชีตต่อหัวข้อ (ชื่อขึ้นต้น PTT-BCP) · PowerPoint = หน้าคั่น + อินโฟกราฟิก PTT/BCP + ตาราง · PNG ยาว = แถบหัวเรื่องแยก · ข้อความ LINE = หมวดแยก
// อินโฟกราฟิก PTT/BCP 16:9 = ไฟล์แยกจากอินโฟกราฟิก PA

const MXS=[['mx_kpi','สรุป PTT / BCP + ส่วนลด','PTT-BCP สรุป'],['mx_disc','ส่วนลด PTT รายเดือน (ทั้งบริษัท)','PTT-BCP ส่วนลดรายเดือน'],['mx_zone','PTT / BCP รายภาค','PTT-BCP รายภาค'],
  ['mx_go','PTT / BCP ตามกลุ่ม × เจ้าของ','PTT-BCP กลุ่ม×เจ้าของ'],['mx_dc','10 DC ที่เติม BCP มากสุด + สาเหตุ','PTT-BCP 10 DC'],['mx_why','สรุปสาเหตุที่รถไปเติม BCP','PTT-BCP สาเหตุ']];
const MX_TITLE='PTT / BCP และส่วนลด PTT';
const mxOn=()=>typeof FUEL_MODE!=='undefined'&&FUEL_MODE;
const mxPicked=()=>mxOn()?MXS.map(s=>s[0]).filter(k=>picked.has(k)):[];
const MX_RULE='ส่วนลด PTT คิดรายเดือนจากลิตร PTT ทั้งบริษัท (ทั้งก้อน): ≤100,000 = 0% · 100,001–200,000 = 0.60% · 200,001–300,000 = 0.70% · 300,001–400,000 = 0.90% · 400,001+ = 0.95% · บาท = ลิตรส่วนลด × ราคาเฉลี่ย PTT ของเดือน';

function mxCtx(){
  const months=curMonths().sort((a,b)=>dkey('01/'+a)-dkey('01/'+b)),stats=months.map(monthStat),SM={};stats.forEach(s=>SM[s.mk]=s);
  const rows=mixRows(),P=rows.filter(r=>r.prov==='PTT'),B=rows.filter(r=>r.prov==='BCP');
  const X={months,stats,SM,rows,one:stats.length===1?stats[0]:null};
  X.pL=P.reduce((s,r)=>s+r.liter,0);X.pB=P.reduce((s,r)=>s+r.baht,0);X.bL=B.reduce((s,r)=>s+r.liter,0);X.bB=B.reduce((s,r)=>s+r.baht,0);X.tL=rows.reduce((s,r)=>s+r.liter,0);
  X.sh=pct(X.pL,X.tL);X.dL=stats.reduce((s,o)=>s+o.dL,0);X.dB=stats.reduce((s,o)=>s+o.dB,0);
  const co=stats.reduce((a,o)=>{a.p+=o.pttL;a.t+=o.pttL+o.bcpL+o.oth;return a;},{p:0,t:0});X.coSh=pct(co.p,co.t);
  X.prev=null;
  if(X.one){const [m,y]=X.one.mk.split('/').map(Number),pm=m===1?12:m-1,py=m===1?y-1:y,pmk=String(pm).padStart(2,'0')+'/'+py;
    const pr=ALL_ROWS.filter(r=>monthKey(r.date)===pmk&&+r.date.split('/')[0]<=X.one.lastDay&&inGrp(r.group)&&r.prov);
    if(pr.length){const l=pr.reduce((s,r)=>s+r.liter,0),p=pr.filter(r=>r.prov==='PTT').reduce((s,r)=>s+r.liter,0);X.prev={label:`1–${X.one.lastDay} ${monthLabel(pmk)}`,sh:pct(p,l)};}}
  X.A=mixAnalysisData(SM,rows);
  return X;
}
const mxDiff=X=>{if(!X.prev)return {txt:'ไม่มีช่วงก่อนหน้า',cls:'na'};const d=X.sh-X.prev.sh;if(Math.abs(d)<0.05)return {txt:'เท่าเดิม',cls:'eq'};return {txt:(d>0?'▲ ':'▼ ')+Math.abs(d).toFixed(1)+' จุด',cls:d>0?'good':'bad'};}  // %PTT สูง = ดี
const scopeMx=()=>scopeLabel()+' · '+D.period;

// ── ตาราง (ใช้ร่วม Excel / PowerPoint / PNG ยาว) ──
function mixTable(k){
  const X=mxCtx(),A=X.A,r1_=v=>Math.round(v*10)/10,r2_=v=>Math.round(v*100)/100;
  if(k==='mx_kpi'){const df=mxDiff(X),o=X.one,rows=[
      ['%PTT (รถในฐาน'+(GRP?' · '+GRP:'')+')',r1_(X.sh),'%',X.prev?r1_(X.prev.sh):null,df.txt],
      ['%PTT ทั้งบริษัท (ทุกรายการ)',r1_(X.coSh),'%',null,''],
      ['ลิตรรวม (รถในฐาน)',Math.round(X.tL),'ลิตร',null,'PTT '+X.sh.toFixed(1)+'% · BCP '+pct(X.bL,X.tL).toFixed(1)+'%'],['ลิตร PTT (รถในฐาน)',Math.round(X.pL),'ลิตร',null,''],['ลิตร BCP (รถในฐาน)',Math.round(X.bL),'ลิตร',null,''],
      ['ราคาเฉลี่ย PTT',X.pL?r2_(X.pB/X.pL):null,'฿/ลิตร',null,'ทุกชนิดน้ำมันรวมกัน'],['ราคาเฉลี่ย BCP',X.bL?r2_(X.bB/X.bL):null,'฿/ลิตร',null,'ทุกชนิดน้ำมันรวมกัน'],
      ['ส่วนลด PTT ที่ได้ (ทั้งบริษัท)',Math.round(X.dL),'ลิตร',null,o?'ขั้น '+(o.rate*100).toFixed(2)+'%':'รวม '+X.stats.length+' เดือน'],['ส่วนลด PTT ที่ได้ (ทั้งบริษัท)',Math.round(X.dB),'บาท',null,'ลิตรส่วนลด × ราคาเฉลี่ย PTT']];
    if(o&&o.next)rows.push(['อีกกี่ลิตรถึงขั้นถัดไป',Math.ceil(o.next.need),'ลิตร',null,'ขั้น '+(o.next.r*100).toFixed(2)+'%'],['ส่วนลดเพิ่มเมื่อถึงขั้นถัดไป',Math.round(o.nextGainB),'บาท',null,Math.round(o.nextGainL)+' ลิตร']);
    if(o&&o.partial)rows.push(['คาดการณ์ PTT สิ้นเดือน',Math.round(o.projL),'ลิตร',null,'ขั้น '+(o.projRate*100).toFixed(2)+'% · ส่วนลด ≈ ฿'+fmt(o.projDB)]);
    rows.push(['ถ้าย้าย BCP ทั้งหมด (ตัวกรองนี้) มา PTT',Math.round(A.gainAll),'บาท',null,'ส่วนลดที่เพิ่มขึ้น']);
    return {title:'สรุป PTT / BCP + ส่วนลด (%PTT สูง = ดี)',head:['ตัวชี้วัด','ค่า','หน่วย',X.prev?'เดือนก่อน ('+X.prev.label+')':'เดือนก่อน','หมายเหตุ / ผลต่าง'],rows,mxDiffRow:0,mxDiffCls:df.cls};}
  if(k==='mx_disc')return mxLong({title:'ส่วนลด PTT รายเดือน (ทั้งบริษัท)',head:['เดือน','ลิตรรวม','PTT ลิตร','BCP ลิตร','%PTT','ขั้น %','ส่วนลด ลิตร','ราคาเฉลี่ย PTT','ส่วนลด บาท','อีกกี่ลิตรถึงขั้นถัดไป','ส่วนลดเพิ่ม (บาท)','คาดสิ้นเดือน PTT ลิตร'],
    rows:X.stats.map(o=>[monthLabel(o.mk)+(o.partial?` (1–${o.lastDay})`:''),Math.round(o.pttL+o.bcpL+o.oth),Math.round(o.pttL),Math.round(o.bcpL),r1_(pct(o.pttL,o.pttL+o.bcpL+o.oth)),r2_(o.rate*100),Math.round(o.dL),r2_(o.price),Math.round(o.dB),o.next?Math.ceil(o.next.need):null,o.next?Math.round(o.nextGainB):null,o.partial?Math.round(o.projL):null])},[0,1,2,3,4,5,8,9,10],['เดือน','รวม ล.','PTT ล.','BCP ล.','%PTT','ขั้น %','ส่วนลด ฿','ขาดอีก ล.','เพิ่ม ฿']);
  const dimT=(fn,lab,title)=>{const L=mixAgg(X.rows,fn,X.SM).sort((a,b)=>b.bL-a.bL);return mxLong({title,head:[lab,'ลิตรรวม','PTT ลิตร','BCP ลิตร','%PTT','ราคา PTT','ราคา BCP','BCP กลางคืน %','ส่วนลดเพิ่มถ้าย้าย (บาท)','รถ (คัน)'],
    rows:L.map(o=>[o.key,Math.round(o.l),Math.round(o.pL),Math.round(o.bL),r1_(o.sh),o.pL?r2_(o.pB/o.pL):null,o.bL?r2_(o.bB/o.bL):null,o.bL?r1_(pct(o.night,o.bL)):null,Math.round(o.gain),o.cars.size])},[0,1,2,3,4,7,8,9],[lab,'ลิตรรวม','PTT ล.','BCP ล.','%PTT','กลางคืน %','เพิ่ม ฿','รถ']);};
  if(k==='mx_zone')return dimT(r=>r.zone||'(ไม่มีภาค)','ภาค','PTT / BCP รายภาค (เรียงตามลิตร BCP)');
  if(k==='mx_go')return dimT(r=>r.group+' · '+r.owner,'กลุ่ม · เจ้าของ','PTT / BCP ตามกลุ่ม × เจ้าของ (เรียงตามลิตร BCP)');
  if(k==='mx_dc')return mxLong({title:'10 DC ที่เติม BCP มากสุด + สาเหตุ',head:['DC','ภาค','BCP ลิตร','%PTT','ส่วนลดเพิ่มถ้าย้าย (บาท)','สาเหตุจากข้อมูล','ปั๊ม BCP ที่ใช้บ่อย'],
    rows:A.dcs.map(o=>[dcName(o.key),o.zone||'',Math.round(o.bL),r1_(o.sh),Math.round(o.gain),o.why.join(' / ')||'ไม่พบสาเหตุเด่น',o.topSt.map(t=>t.name+' ('+t.n+' ครั้ง)').join(' / ')])},[0,1,2,3,4,5],['DC','ภาค','BCP ล.','%PTT','เพิ่ม ฿','สาเหตุหลัก'],r=>{r[5]=String(r[5]).split(' / ')[0];if(r[5].length>48)r[5]=r[5].slice(0,47)+'…';return r;});
  if(k==='mx_why')return {title:'สรุปสาเหตุที่รถไปเติม BCP'+(GRP?' · '+GRP:''),head:['หัวข้อ','รายละเอียด'],rows:A.lines.map(([h,t])=>[h,t])};
}

// ตารางแบบย่อสำหรับ PNG ยาว (คอลัมน์น้อยลง หัวสั้น)
function mxLong(T,idx,head,fix){T.long={head,rows:T.rows.map(r=>{const x=idx.map(i=>r[i]);return fix?fix(x):x;})};return T;}

// ── ข้อความ LINE (หมวดแยก) ──
function mixText(){
  const ks=mxPicked();if(!ks.length)return [];
  const X=mxCtx(),A=X.A,o=X.one,L=['','━━━━━━━━━━━━','⛽ '+MX_TITLE];const sec=t=>{L.push('');L.push(t);};
  if(ks.includes('mx_kpi')){const df=mxDiff(X);sec('🎯 สรุป (%PTT สูง = ดี)');
    L.push(`• %PTT รถในฐาน: ${X.sh.toFixed(1)}%  ${df.cls==='good'?'🟢':df.cls==='bad'?'🔴':'⚪'} ${df.txt}`);L.push(`• %PTT ทั้งบริษัท: ${X.coSh.toFixed(1)}%`);
    L.push(`• ลิตรรวม ${fmt(X.tL)} ล. = PTT ${fmt(X.pL)} ล. + BCP ${fmt(X.bL)} ล.`);L.push(`• ส่วนลดที่ได้: ${fmt(X.dL)} ล. ≈ ฿${fmt(X.dB)}${o?' (ขั้น '+(o.rate*100).toFixed(2)+'%)':''}`);
    if(o&&o.next)L.push(`• อีก ${fmt(o.next.need)} ล. ถึงขั้น ${(o.next.r*100).toFixed(2)}% → ส่วนลดเพิ่ม ≈ ฿${fmt(o.nextGainB)}`);
    if(o&&o.partial)L.push(`• คาดสิ้นเดือน PTT ${fmt(o.projL)} ล. (ขั้น ${(o.projRate*100).toFixed(2)}%)`);}
  if(ks.includes('mx_disc')){sec('💰 ส่วนลด PTT รายเดือน');X.stats.forEach(s=>L.push(`• ${monthLabel(s.mk)}: รวม ${fmt(s.pttL+s.bcpL+s.oth)} ล. · PTT ${fmt(s.pttL)} ล. · ขั้น ${(s.rate*100).toFixed(2)}% · ฿${fmt(s.dB)}${s.next?` · ขาดอีก ${fmt(s.next.need)} ล.`:''}`));}
  if(ks.includes('mx_zone')){sec('🗺️ ภาคที่เติม BCP มากสุด');mixAgg(X.rows,r=>r.zone||'(ไม่มีภาค)',X.SM).sort((a,b)=>b.bL-a.bL).slice(0,5).forEach((z,i)=>L.push(`${MD[i]} ${z.key}: BCP ${fmt(z.bL)} ล. · PTT ${z.sh.toFixed(0)}%`));}
  if(ks.includes('mx_go')){sec('🚛 กลุ่ม × เจ้าของ');mixAgg(X.rows,r=>r.group+' · '+r.owner,X.SM).sort((a,b)=>b.bL-a.bL).forEach(g=>L.push(`• ${g.key}: PTT ${g.sh.toFixed(0)}% · BCP ${fmt(g.bL)} ล.`));}
  if(ks.includes('mx_dc')){sec('📍 DC ที่เติม BCP มากสุด');A.dcs.slice(0,5).forEach((d,i)=>L.push(`${MD[i]} ${dcName(d.key)}: BCP ${fmt(d.bL)} ล. · PTT ${d.sh.toFixed(0)}%${d.why[0]?' — '+d.why[0]:''}`));}
  if(ks.includes('mx_why')){sec('🔎 สาเหตุจากข้อมูล');A.lines.forEach(([h,t])=>L.push(`• ${h}: ${t}`));}
  return L;
}

// ── วาด SVG ──
function wrapTxt(s,max){const out=[];let line='';String(s).split(/(\s+)/).forEach(w=>{if((line+w).length>max&&line.trim()){out.push(line.trim());line=w.trimStart();}else line+=w;});if(line.trim())out.push(line.trim());
  return out.flatMap(l=>{const a=[];while(l.length>max*1.25){a.push(l.slice(0,max));l=l.slice(max);}a.push(l);return a;});}
function bulletsSvg(items,w,fs=16){const max=Math.floor(w/(fs*.5));let y=fs,s='';items.forEach(([h,t])=>{const ls=wrapTxt(h+': '+t,max-3);
  ls.forEach((l,i)=>{s+=`<text x="${i?18:0}" y="${y}" font-size="${fs}" fill="${LT.ink}">${i?'':`<tspan fill="#d4af37" font-weight="700">● </tspan><tspan font-weight="600">${esc(h)}:</tspan> `}${esc(i?l:l.slice(h.length+2))}</text>`;y+=fs*1.45;});y+=fs*.35;});return {s,h:y};}
function mxCard(c,x,y,w,h){const dc=c.cls==='good'?'#5fd38d':c.cls==='bad'?'#ff8a8a':'#b9c9e6';
  return `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="16" fill="#0a2a5e"/><rect y="${h-6}" width="${w}" height="6" fill="${c.cls==='bad'?'#e0657c':c.cls==='good'?'#3fb37a':'#d4af37'}"/>
  <text x="${w/2}" y="36" text-anchor="middle" font-size="19" fill="#e6d79c">${esc(c.t)}</text>
  <text x="${w/2}" y="${h*.5+10}" text-anchor="middle" font-size="${c.v.length>9?36:44}" font-weight="600" fill="#fff">${esc(c.v)}<tspan font-size="18" font-weight="500" fill="#cfdcf2"> ${esc(c.u||'')}</tspan></text>
  <text x="${w/2}" y="${h*.5+42}" text-anchor="middle" font-size="15.5" fill="#cfdcf2">${esc(c.sub||'')}</text>
  <text x="${w/2}" y="${h-22}" text-anchor="middle" font-size="17" font-weight="600" fill="${dc}">${esc(c.d||'')}</text></g>`;}
function mxTierSvg(X,w,h){
  if(!X.one){const st=X.stats,mx=Math.max(450000,...st.map(o=>o.pttL)),bw=Math.min(90,(w-80)/st.length*.6),Y=v=>h-40-(v/mx)*(h-70);let s='';
    TIERS.forEach(t=>{s+=`<line x1="60" x2="${w}" y1="${Y(t.min)}" y2="${Y(t.min)}" stroke="${LT.line}" stroke-dasharray="5 5"/><text x="54" y="${Y(t.min)+5}" text-anchor="end" font-size="13" fill="${LT.muted}">${t.min/1000}k</text><text x="${w}" y="${Y(t.min)-6}" text-anchor="end" font-size="12.5" fill="${LT.muted}">>${t.min/1000}k = ${(t.r*100).toFixed(2)}%</text>`;});
    st.forEach((o,i)=>{const cx=60+(i+.5)*(w-60)/st.length;s+=`<rect x="${cx-bw/2}" y="${Y(o.pttL)}" width="${bw}" height="${h-40-Y(o.pttL)}" rx="5" fill="${LT.s[0]}"/><text x="${cx}" y="${Y(o.pttL)-8}" text-anchor="middle" font-size="14" font-weight="600" fill="${LT.ink}">${(o.rate*100).toFixed(2)}% · ฿${fmt(o.dB)}</text><text x="${cx}" y="${h-16}" text-anchor="middle" font-size="14" fill="${LT.muted}">${esc(monthLabel(o.mk).replace(/ 25\d\d$/,''))}</text>`;});
    return {s,note:'ลิตร PTT ทั้งบริษัทรายเดือน'};}
  const o=X.one,MAX=450000,x=v=>Math.min(w,v/MAX*w),by=60,bh=70;let s='';
  [0,...TIERS.map(t=>t.min)].forEach((m,i)=>{const r=i?TIERS[i-1].r:0,e=i<TIERS.length?TIERS[i].min:MAX,on=o.rate===r;
    s+=`<rect x="${x(m)+1}" y="${by}" width="${x(e)-x(m)-2}" height="${bh}" rx="6" fill="${on?'#f3e6b5':'#e8eef8'}"/><text x="${(x(m)+x(e))/2}" y="${by+32}" text-anchor="middle" font-size="19" font-weight="600" fill="${LT.ink}">${(r*100).toFixed(2)}%</text><text x="${(x(m)+x(e))/2}" y="${by+54}" text-anchor="middle" font-size="13" fill="${LT.muted}">${m?m/1000+'k':'0'}–${i<TIERS.length?e/1000+'k':'ขึ้นไป'}</text>`;});
  const pin=(v,lab,c,top)=>`<line x1="${x(v)}" x2="${x(v)}" y1="${by-10}" y2="${by+bh+10}" stroke="${c}" stroke-width="4"/><rect x="${Math.min(w-200,Math.max(0,x(v)-100))}" y="${top?by-46:by+bh+14}" width="200" height="30" rx="8" fill="${c}"/><text x="${Math.min(w-100,Math.max(100,x(v)))}" y="${top?by-25:by+bh+35}" text-anchor="middle" font-size="15" fill="#fff">${esc(lab)}</text>`;
  s+=pin(o.pttL,'ตอนนี้ '+fmt(o.pttL)+' ล.',LT.s[0],true);if(o.partial)s+=pin(o.projL,'คาดสิ้นเดือน '+fmt(o.projL)+' ล.',LT.s[1],false);
  const yy=by+bh+(o.partial?78:44);
  s+=`<text x="0" y="${yy}" font-size="17" fill="${LT.ink}">ส่วนลดตอนนี้ <tspan font-weight="700">${fmt(o.dL)} ล. ≈ ฿${fmt(o.dB)}</tspan>${o.next?` · อีก <tspan font-weight="700">${fmt(o.next.need)} ล.</tspan> ถึงขั้น ${(o.next.r*100).toFixed(2)}% → <tspan font-weight="700" fill="${LT.good}">+฿${fmt(o.nextGainB)}</tspan>`:' · ขั้นสูงสุดแล้ว'}</text>`;
  return {s,note:'ขั้นนับจาก PTT ทั้งบริษัท'};
}
function mxZoneSvg(X,w,h){
  const z=mixAgg(X.rows,r=>r.zone||'(ไม่มีภาค)',{}).filter(o=>o.l>0).sort((a,b)=>a.sh-b.sh);if(!z.length)return {s:'',note:''};
  const lw=130,rw=150,iw=w-lw-rw,rh=(h-24)/z.length,bh=Math.min(22,rh-6);let s='';
  z.forEach((o,i)=>{const y=i*rh+2,pw=o.sh/100*iw;s+=`<text x="${lw-10}" y="${y+bh/2+5}" text-anchor="end" font-size="14.5" fill="${LT.ink}">${esc(o.key)}</text><rect x="${lw}" y="${y}" width="${pw}" height="${bh}" fill="${LT.s[0]}"/><rect x="${lw+pw}" y="${y}" width="${iw-pw}" height="${bh}" fill="${LT.s[1]}"/>
    <text x="${w}" y="${y+bh/2+5}" text-anchor="end" font-size="14.5" font-weight="600" fill="${o.sh<70?LT.bad:LT.ink}">${o.sh.toFixed(0)}% · BCP ${fmt(o.bL)}</text>`;});
  s+=`<rect x="${lw}" y="${h-14}" width="14" height="10" fill="${LT.s[0]}"/><text x="${lw+20}" y="${h-4}" font-size="13" fill="${LT.muted}">PTT</text><rect x="${lw+70}" y="${h-14}" width="14" height="10" fill="${LT.s[1]}"/><text x="${lw+90}" y="${h-4}" font-size="13" fill="${LT.muted}">BCP</text>`;
  return {s,note:'เรียง %PTT น้อยไปมาก'};
}
function mxDcSvg(X,w,h){
  const it=X.A.dcs;if(!it.length)return {s:`<text x="${w/2}" y="${h/2}" text-anchor="middle" font-size="18" fill="${LT.muted}">ไม่มีการเติม BCP</text>`,note:''};
  const lw=220,rw=230,iw=w-lw-rw,mx=Math.max(...it.map(o=>o.bL)),rh=(h-6)/it.length,bh=Math.min(20,rh-8);let s='';
  it.forEach((o,i)=>{const y=i*rh+3;s+=`<text x="${lw-10}" y="${y+bh/2+5}" text-anchor="end" font-size="15" fill="${LT.ink}">${esc(dcName(o.key).slice(0,20))}</text><rect x="${lw}" y="${y}" width="${Math.max(2,o.bL/mx*iw)}" height="${bh}" rx="4" fill="${LT.s[1]}"/>
    <text x="${lw+Math.max(2,o.bL/mx*iw)+8}" y="${y+bh/2+5}" font-size="14" fill="${LT.ink}">${fmt(o.bL)}</text><text x="${w}" y="${y+bh/2+5}" text-anchor="end" font-size="14.5" font-weight="600" fill="${o.sh<50?LT.bad:LT.ink}">PTT ${o.sh.toFixed(0)}% · +฿${fmt(o.gain)}</text>`;});
  return {s,note:'ลิตร BCP · +฿ = ส่วนลดเพิ่มถ้าย้าย'};
}
async function composeMixInfo(){
  const W=1920,H=1080,[font,logo]=await Promise.all([fontCss(),logoUri()]),X=mxCtx(),o=X.one,df=mxDiff(X);
  let b=`<rect width="${W}" height="${H}" fill="#eef2f9"/>`+headBand(W,120,logo,MX_TITLE,'สัดส่วนการใช้น้ำมัน'+(GRP?' · กลุ่ม '+GRP:'')+' · เป้าหมาย: เติม PTT ให้มากขึ้น');
  const cards=[{t:'%PTT (รถในฐาน)',v:X.sh.toFixed(1),u:'%',sub:'ทั้งบริษัท '+X.coSh.toFixed(1)+'%',d:df.txt+(X.prev?' (สูง = ดี)':''),cls:df.cls},
    {t:'ลิตรรวม',v:fmt(X.tL),u:'ล.',sub:'PTT '+fmt(X.pL)+' · BCP '+fmt(X.bL),d:'',cls:'na'},
    {t:'ส่วนลดที่ได้ (บริษัท)',v:fmt(X.dB),u:'บาท',sub:fmt(X.dL)+' ล.'+(o?' · ขั้น '+(o.rate*100).toFixed(2)+'%':' · '+X.stats.length+' เดือน'),d:'',cls:'na'},
    o&&o.next?{t:'อีกกี่ลิตรถึงขั้นถัดไป',v:fmt(o.next.need),u:'ล.',sub:'ขั้น '+(o.next.r*100).toFixed(2)+'%',d:'+฿'+fmt(o.nextGainB),cls:'good'}:{t:'ขั้นถัดไป',v:o?'สูงสุด':'—',u:'',sub:o?'ขั้น 0.95% แล้ว':'เลือกเดือนเพื่อดู',d:'',cls:'na'},
    {t:'ถ้าย้าย BCP ทั้งหมดมา PTT',v:'+'+fmt(X.A.gainAll),u:'บาท',sub:'ส่วนลดเพิ่ม (ตัวกรองนี้)',d:'',cls:'good'}];
  const m=32,g=16,cw=(W-2*m-4*g)/5,ky=140,kh=190;cards.forEach((c,i)=>b+=mxCard(c,m+i*(cw+g),ky,cw,kh));
  const py=ky+kh+22,pw=(W-2*m-24)/2,ph=(H-py-86-24)/2;
  const P=[['ขั้นส่วนลด PTT (ทั้งบริษัท)',(w,h)=>mxTierSvg(X,w,h)],['%PTT รายภาค',(w,h)=>mxZoneSvg(X,w,h)],['10 DC ที่เติม BCP มากสุด',(w,h)=>mxDcSvg(X,w,h)],['สาเหตุจากข้อมูล',(w,h)=>{const r=bulletsSvg(X.A.lines.filter(l=>l[0]!=='เจ้าของรถ'||true).slice(0,6),w,14.5);return {s:r.s,note:''};}]];
  P.forEach(([t,fn],i)=>{const x=m+(i%2)*(pw+24),y=py+Math.floor(i/2)*(ph+24),r=fn(pw-48,ph-72);b+=panel(x,y,pw,ph,t,r.note,r.s);});
  const fy=H-62,now=new Date();
  b+=`<rect y="${fy}" width="${W}" height="${H-fy}" fill="#0a2a5e"/><rect y="${fy}" width="${W}" height="3" fill="#d4af37"/><text x="${W/2}" y="${fy+26}" text-anchor="middle" font-size="14.5" fill="#dfe8f7">${esc(MX_RULE)}</text><text x="${W/2}" y="${fy+50}" text-anchor="middle" font-size="14.5" fill="#e6d79c">${esc('%PTT รถในฐาน = ตามแท็บกลุ่ม · ทั้งบริษัท = ทุกรายการในไฟล์ · '+(X.prev?'เทียบ '+X.prev.label+' วันที่เท่ากัน · เขียว = ดีขึ้น แดง = แย่ลง':'ไม่มีช่วงก่อนหน้า')+' · สร้างเมื่อ '+now.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}))}</text>`;
  return {svg:svgDoc(W,H,b,font),W,H};
}
// ชิ้นใน PNG ยาว
function mixLongPiece(k,w){
  const X=mxCtx();
  if(k==='mx_why'){const r=bulletsSvg(X.A.lines,w,16);return {t:'สรุปสาเหตุที่รถไปเติม BCP'+(GRP?' · '+GRP:''),s:r.s,h:r.h};}
  if(k==='mx_kpi'){const r=mxTierSvg(X,w,X.one?220:300);return {t:'ขั้นส่วนลด PTT · %PTT รถในฐาน '+X.sh.toFixed(1)+'% · ทั้งบริษัท '+X.coSh.toFixed(1)+'%',s:r.s,h:X.one?220:300};}
  if(k==='mx_zone'){const n=mixAgg(X.rows,r=>r.zone||'x',{}).length,h=n*30+30,r=mxZoneSvg(X,w,h);return {t:'%PTT รายภาค',s:r.s,h};}
  return null;
}
function mixSectionBand(w){return `<rect width="${w}" height="64" rx="14" fill="#0a2a5e"/><rect y="60" width="${w}" height="4" fill="#d4af37"/>${svgI('fuel',22,16,32,'#f0d57a')}<text x="70" y="42" font-size="24" font-weight="600" fill="#fff">${esc(MX_TITLE)}</text><text x="${w-20}" y="42" text-anchor="end" font-size="16" fill="#e6d79c">${esc(scopeMx())}</text>`;}
