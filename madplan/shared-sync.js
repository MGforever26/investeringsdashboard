(function(){
  const API='https://script.google.com/macros/s/AKfycbzJyz-EbpidFmHsylCUqJ16uuDPHWUDfQde2bcOwYs6egreJwKqeKsYUshl8ov7RnA/exec';
  const CURRENT_ID='madplan-faelles-aktiv';
  const LOCAL_STATE_KEY='madplan_state_local_v1';
  if(!API) return;
  let syncing=false,timer=null,dirty=false;

  function currentLabel(){
    try{return 'Uge '+isoWeek().w}catch(e){return (activeWeek&&activeWeek.label)||'Uge'}
  }

  function saveWeekMeta(){
    try{localStorage.setItem('madplan_week_meta_v1',JSON.stringify(activeWeek));}catch(e){}
  }

  function markChanged(){
    try{
      const now=new Date().toISOString();
      activeWeek=Object.assign({},activeWeek||{}, {changedAt:now, updatedAt:now});
      dirty=true;
      saveWeekMeta();
    }catch(e){dirty=true;}
  }

  function markSaved(ts,editor){
    try{
      activeWeek=Object.assign({},activeWeek||{}, {savedAt:ts||new Date().toISOString(), lastEditor:editor||((activeWeek&&activeWeek.lastEditor)||'app')});
      saveWeekMeta();
    }catch(e){}
  }

  if(typeof touchWeek==='function'){
    touchWeek=function(){markChanged();};
  }

  function useCurrentPlanId(){
    activeWeek=Object.assign({},activeWeek||{}, {id:CURRENT_ID,label:currentLabel()});
    saveWeekMeta();
  }

  function fixCategory(name,cat){
    let n=cleanName(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    if(['havregryn','grove havregryn'].includes(n)) return 'mel og gryn';
    if(['hakkede tomater','tomatpure','tomatpuré','kokosmælk','kokosmaelk','ris','grødris','grodris','nudler','bulgur','couscous','linser','bønner','bonner','kikærter','kikaerter','pasta','lasagneplader','suppehorn'].includes(n)) return 'konserves og tørvarer';
    if(['blomkålsris','blomkalsris'].includes(n)) return 'frostvarer';
    if(['spidskommen','spidskommenfrø','spidskommenfro','karry','kardemomme','stødt koriander','stodt koriander','gurkemeje','sennepsfrø','sennepsfro','krydderier','kanel','sesamfrø','sesamfro','peanuts','honning','mandler','rosiner','pinjekærner','pinjekaerner'].includes(n)) return 'mel og gryn';
    if(['kylling'].includes(n)) return 'andet';
    if(['pølser','pølse','polser','polse','bacon','pulled pork','pepperoni','kyllingepålæg','kyllingepalaeg'].includes(n)) return 'mælkeprodukter og pålæg';
    return cat||'andet';
  }

  function shoppingKey(name,cat,source){
    source=source==='ekstra'?'manuelt':(source||'ret');
    cat=fixCategory(name,cat);
    return source+'|'+cat+'|'+cleanName(name).toLowerCase();
  }

  function shoppingSnapshot(){
    try{return shopping.map(i=>[i.name,Math.max(0,CATS.indexOf(fixCategory(i.name,i.category)||'andet')),i.source==='ekstra'?'manuelt':(i.source||'ret'),Number(i.qty)||1,i.on!==false]);}
    catch(e){return []}
  }

  function applyShoppingSnapshot(data){
    try{
      let arr=(data&&Array.isArray(data.sx))?data.sx:[];
      if(!arr.length) return;
      let map={};
      arr.forEach(x=>{
        let name=x[0],cat=typeof x[1]==='number'?(CATS[x[1]]||'andet'):(x[1]||'andet'),source=x[2]==='ekstra'?'manuelt':(x[2]||'ret');
        cat=fixCategory(name,cat);
        map[shoppingKey(name,cat,source)]={qty:Number(x[3])||1,on:x[4]!==false};
      });
      shopping.forEach(i=>{i.category=fixCategory(i.name,i.category);let v=map[shoppingKey(i.name,i.category,i.source)];if(v){i.qty=v.qty;i.on=v.on;}});
    }catch(e){}
  }

  if(typeof stateObj==='function'){
    const oldStateObj=stateObj;
    stateObj=function(){
      let o=oldStateObj();
      try{o.sx=shoppingSnapshot();}catch(e){}
      try{o.w={id:(activeWeek&&activeWeek.id)||CURRENT_ID,label:(activeWeek&&activeWeek.label)||currentLabel(),changedAt:(activeWeek&&activeWeek.changedAt)||null,updatedAt:(activeWeek&&activeWeek.changedAt)||null,savedAt:(activeWeek&&activeWeek.savedAt)||null,lastEditor:(activeWeek&&activeWeek.lastEditor)||null};}catch(e){}
      return o;
    };
  }

  function writeLocalState(){
    try{if(typeof stateObj==='function') localStorage.setItem(LOCAL_STATE_KEY,JSON.stringify(stateObj()));}catch(e){}
  }

  function restoreLocalState(){
    try{
      let raw=localStorage.getItem(LOCAL_STATE_KEY);
      if(!raw) return false;
      let data=JSON.parse(raw);
      if(!data) return false;
      shopping=[]; pendingShopping=null;
      applyState(data);
      if(data.w) activeWeek=Object.assign({},activeWeek||{},data.w,{changedAt:data.w.changedAt||data.w.updatedAt||null});
      if(pendingShopping){
        shopping=pendingShopping.map(i=>({id:Math.random().toString(36).slice(2,9),name:cleanName(i.name),category:fixCategory(i.name,i.category),qty:Number(i.qty)||1,on:i.on!==false,source:i.source==='ekstra'?'manuelt':(i.source||'manuelt')}));
        pendingShopping=null;
        buildShopping();
      }else buildShopping();
      applyShoppingSnapshot(data);
      renderAll();
      return true;
    }catch(e){return false;}
  }

  function saveRemoteNow(force=false){
    try{
      writeLocalState();
      if(!activeWeek || !activeWeek.id || typeof stateObj!=='function') return;
      if(!force && !dirty) return;
      const changedAt=(activeWeek&&activeWeek.changedAt)||new Date().toISOString();
      const editor=(localStorage.getItem('madplan_editor_name')||'app').trim()||'app';
      const body=new URLSearchParams({
        action:'save',
        id:activeWeek.id,
        version:changedAt,
        payload:JSON.stringify(stateObj()),
        lastEditor:editor,
        note:activeWeek.label||''
      });
      dirty=false;
      markSaved(new Date().toISOString(),editor);
      fetch(API,{method:'POST',mode:'no-cors',keepalive:true,headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
    }catch(e){}
  }

  function saveRemoteSoon(){
    writeLocalState();
    if(syncing) return;
    clearTimeout(timer);
    timer=setTimeout(()=>saveRemoteNow(false),500);
  }

  function jsonp(params){
    return new Promise((resolve,reject)=>{
      const cb='madplan_cb_'+Math.random().toString(36).slice(2,10);
      const s=document.createElement('script');
      let done=false;
      const timeout=setTimeout(()=>{
        if(done) return;
        done=true; delete window[cb]; s.remove(); reject(new Error('timeout'));
      },10000);
      window[cb]=data=>{
        if(done) return;
        done=true; clearTimeout(timeout); delete window[cb]; s.remove(); resolve(data);
      };
      s.onerror=()=>{
        if(done) return;
        done=true; clearTimeout(timeout); delete window[cb]; s.remove(); reject(new Error('load failed'));
      };
      params=Object.assign({},params,{callback:cb,_:Date.now()});
      s.src=API+'?'+new URLSearchParams(params).toString();
      document.body.appendChild(s);
    });
  }

  if(typeof buildShopping==='function'){
    buildShopping=function(opts={}){
      let keepManual=opts.keepManual!==false;
      let prior=keepManual?shoppingSnapshot():[];
      let manual=keepManual?shopping.filter(i=>(i.source==='manuelt'||i.source==='ekstra')&&i.name).map(i=>({
        id:i.id||id(),name:cleanName(i.name),category:fixCategory(i.name,i.category),qty:Number(i.qty)||1,on:i.on!==false,source:'manuelt'
      })) : [];
      let m={};
      function add(name,cat,qty=1,source='ret'){
        name=cleanName(name);cat=fixCategory(name,cat||'andet');
        let key=shoppingKey(name,cat,source);
        if(!m[key])m[key]={id:id(),name,category:cat,qty:0,on:true,source};
        m[key].qty+=qty;
      }
      plan.map(byId).forEach((r,di)=>(r.ingredients||[]).forEach(i=>{if(ingOn(di,i))add(i.name,i.category,1,'ret')}));
      STANDARD.forEach(i=>add(i.name,i.category,i.qty,'standard'));
      manual.forEach(i=>{let key=shoppingKey(i.name,i.category,'manuelt');if(!m[key])m[key]=i;else m[key].qty+=i.qty});
      shopping=Object.values(m).sort((a,b)=>CATS.indexOf(a.category)-CATS.indexOf(b.category)||a.source.localeCompare(b.source,'da')||a.name.localeCompare(b.name,'da'));
      applyShoppingSnapshot({sx:prior});
    };
  }

  if(typeof itemRow==='function'){
    itemRow=function(i){
      i.category=fixCategory(i.name,i.category);
      return '<div class="item"><button class="check '+(i.on?'on':'')+'" data-toggle="'+i.id+'">'+(i.on?'✓':'')+'</button><div><b>'+esc(i.name)+'</b><div class="sub" style="margin:2px 0 0">'+esc(sourceLabel(i.source))+'</div></div><div class="qty"><button data-minus="'+i.id+'">−</button><span>'+i.qty+'</span><button data-plus="'+i.id+'">+</button></div></div>';
    };
  }

  if(typeof addItem==='function'){
    addItem=function(cat,name){
      name=cleanName(name);cat=fixCategory(name,cat);
      let found=shopping.find(i=>i.category===cat&&i.name.toLowerCase()===name.toLowerCase()&&(i.source==='manuelt'||i.source==='ekstra'));
      if(found){found.qty++;found.on=true;found.source='manuelt'}
      else shopping.push({id:id(),name,category:cat,qty:1,on:true,source:'manuelt'});
      saveSession();renderList();renderPrint();
    };
  }

  async function loadRemote(weekId,force){
    try{
      if(!weekId || syncing) return;
      const data=await jsonp({action:'get',id:weekId});
      if(!data || !data.ok || !data.found || !data.week || !data.week.payload){
        return;
      }
      let remoteMeta=data.week.payload.w||{};
      let remoteChanged=remoteMeta.changedAt||remoteMeta.updatedAt||data.week.version||data.week.updatedAt||null;
      let localChanged=(activeWeek&&activeWeek.changedAt)||null;
      if(!force && localChanged && remoteChanged && new Date(remoteChanged)<=new Date(localChanged)) return;
      syncing=true;
      shopping=[];
      pendingShopping=null;
      applyState(data.week.payload);
      activeWeek=Object.assign({},activeWeek||{},remoteMeta,{id:data.week.id||weekId,changedAt:remoteChanged,updatedAt:remoteChanged,savedAt:remoteMeta.savedAt||data.week.updatedAt||null,lastEditor:data.week.lastEditor||remoteMeta.lastEditor||'app'});
      if(weekId===CURRENT_ID) activeWeek.label=currentLabel();
      saveWeekMeta();
      if(pendingShopping){
        shopping=pendingShopping.map(i=>({id:Math.random().toString(36).slice(2,9),name:cleanName(i.name),category:fixCategory(i.name,i.category),qty:Number(i.qty)||1,on:i.on!==false,source:i.source==='ekstra'?'manuelt':(i.source||'manuelt')}));
        pendingShopping=null;
        buildShopping();
      }else{
        buildShopping({keepManual:false});
      }
      applyShoppingSnapshot(data.week.payload);
      saveSession(false);
      writeLocalState();
      renderAll();
      syncing=false;
    }catch(e){syncing=false;}
  }

  if(typeof saveSession==='function'){
    const oldSave=saveSession;
    saveSession=function(touch=true){
      oldSave(touch);
      writeLocalState();
      if(touch!==false) saveRemoteSoon();
    };
  }

  if(typeof shareWeek==='function'){
    shareWeek=async function(){
      saveSession();
      saveRemoteNow(true);
      let longLink=location.origin+location.pathname+'?week='+encodeURIComponent(activeWeek.id||CURRENT_ID);
      let link=longLink;
      try{
        let r=await fetch('https://tinyurl.com/api-create.php?url='+encodeURIComponent(longLink));
        let t=(await r.text()).trim();
        if(r.ok && /^https?:\/\//.test(t)) link=t;
      }catch(e){}
      let msg=['Her er ugens madplan:',link].join(String.fromCharCode(10));
      try{
        if(navigator.share){await navigator.share({title:'Madplan',text:msg});return;}
        await navigator.clipboard.writeText(msg);
        alert('Madplan-linket er kopieret. Send det til hende.');
      }catch(e){prompt('Kopiér Madplan-linket:',msg);}
    };
  }

  startNewWeek=function(){
    if(!confirm('Start ny uge? Den aktuelle madplan og manuelt tilføjede varer ryddes for jer begge.')) return;
    const now=new Date().toISOString();
    activeWeek=newWeekMeta();
    activeWeek.id=CURRENT_ID;
    activeWeek.label=currentLabel();
    activeWeek.changedAt=now;
    activeWeek.updatedAt=now;
    activeWeek.savedAt=null;
    activeWeek.lastEditor=null;
    dirty=true;
    saveWeekMeta();
    plan=[]; excluded={}; shopping=[]; pendingShopping=null;
    generatePlan();
    buildShopping({keepManual:false});
    saveSession();
    renderAll();
    saveRemoteNow(true);
  };

  try{restoreLocalState();buildShopping();renderAll();}catch(e){}

  const urlWeek=new URLSearchParams(location.search).get('week');
  if(urlWeek){
    activeWeek=Object.assign({},activeWeek,{id:urlWeek});
    saveWeekMeta();
    loadRemote(urlWeek,true);
  }else{
    useCurrentPlanId();
    loadRemote(CURRENT_ID,true);
  }

  window.addEventListener('pagehide',()=>saveRemoteNow(false));
  window.addEventListener('beforeunload',()=>saveRemoteNow(false));
  window.addEventListener('focus',()=>loadRemote(activeWeek.id||CURRENT_ID,false));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveRemoteNow(false);else loadRemote(activeWeek.id||CURRENT_ID,false);});
})();