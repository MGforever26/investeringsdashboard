(function(){
  const API='https://script.google.com/macros/s/AKfycbzJyz-EbpidFmHsylCUqJ16uuDPHWUDfQde2bcOwYs6egreJwKqeKsYUshl8ov7RnA/exec';
  if(!API) return;
  let syncing=false,timer=null;

  function saveRemoteNow(){
    try{
      if(!activeWeek || !activeWeek.id || typeof stateObj!=='function') return;
      const body=new URLSearchParams({
        action:'save',
        id:activeWeek.id,
        version:new Date().toISOString(),
        payload:JSON.stringify(stateObj()),
        lastEditor:'app',
        note:activeWeek.label||''
      });
      fetch(API,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
    }catch(e){}
  }

  function saveRemoteSoon(){
    if(syncing) return;
    clearTimeout(timer);
    timer=setTimeout(saveRemoteNow,900);
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

  async function loadRemote(weekId,force){
    try{
      if(!weekId || syncing) return;
      const data=await jsonp({action:'get',id:weekId});
      if(!data || !data.ok || !data.found || !data.week || !data.week.payload){
        if(force) saveRemoteNow();
        return;
      }
      if(!force && activeWeek.updatedAt && data.week.updatedAt && new Date(data.week.updatedAt)<=new Date(activeWeek.updatedAt)) return;
      syncing=true;
      shopping=[];
      pendingShopping=null;
      applyState(data.week.payload);
      activeWeek=Object.assign({},data.week.payload.w||activeWeek,{id:data.week.id||weekId,updatedAt:data.week.updatedAt||new Date().toISOString()});
      localStorage.setItem('madplan_week_meta_v1',JSON.stringify(activeWeek));
      if(pendingShopping){
        shopping=pendingShopping.map(i=>({id:Math.random().toString(36).slice(2,9),name:cleanName(i.name),category:i.category,qty:Number(i.qty)||1,on:i.on!==false,source:i.source==='ekstra'?'manuelt':(i.source||'manuelt')}));
        pendingShopping=null;
        buildShopping();
      }else{
        buildShopping({keepManual:false});
      }
      saveSession(false);
      renderAll();
      syncing=false;
    }catch(e){syncing=false;}
  }

  if(typeof saveSession==='function'){
    const oldSave=saveSession;
    saveSession=function(touch=true){
      oldSave(touch);
      if(touch!==false) saveRemoteSoon();
    };
  }

  if(typeof shareWeek==='function'){
    shareWeek=async function(){
      saveSession();
      saveRemoteNow();
      let longLink=location.origin+location.pathname+'?week='+encodeURIComponent(activeWeek.id);
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

  if(typeof startNewWeek==='function'){
    const oldStart=startNewWeek;
    startNewWeek=function(){
      oldStart();
      saveRemoteNow();
    };
  }

  const urlWeek=new URLSearchParams(location.search).get('week');
  if(urlWeek){
    activeWeek=Object.assign({},activeWeek,{id:urlWeek});
    localStorage.setItem('madplan_week_meta_v1',JSON.stringify(activeWeek));
    loadRemote(urlWeek,true);
  }else{
    saveRemoteSoon();
  }

  window.addEventListener('focus',()=>loadRemote(activeWeek.id,false));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadRemote(activeWeek.id,false);});
})();
