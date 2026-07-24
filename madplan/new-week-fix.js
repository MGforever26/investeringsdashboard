(function(){
  const RESET_KEY='madplan_new_week_nonfood_reset_v1';
  const RESET_WINDOW_MS=30000;

  function isNonfood(item){
    return String((item&&item.category)||'').trim().toLowerCase()==='nonfood';
  }

  function clearNonfood(){
    if(Array.isArray(shopping)) shopping=shopping.filter(item=>!isNonfood(item));
    if(Array.isArray(pendingShopping)) pendingShopping=pendingShopping.filter(item=>!isNonfood(item));
  }

  function resetIsFresh(){
    try{
      const ts=Number(localStorage.getItem(RESET_KEY)||0);
      return ts>0 && Date.now()-ts<RESET_WINDOW_MS;
    }catch(e){return false;}
  }

  if(typeof buildShopping==='function'){
    const oldBuildShopping=buildShopping;
    buildShopping=function(opts={}){
      oldBuildShopping(opts);
      if(resetIsFresh()) clearNonfood();
    };
  }

  if(typeof addItem==='function'){
    const oldAddItem=addItem;
    addItem=function(cat,name){
      if(String(cat||'').trim().toLowerCase()==='nonfood'){
        try{localStorage.removeItem(RESET_KEY);}catch(e){}
      }
      return oldAddItem(cat,name);
    };
  }

  if(typeof startNewWeek==='function'){
    const oldStartNewWeek=startNewWeek;
    startNewWeek=function(){
      const before=(activeWeek&&activeWeek.changedAt)||null;
      const previousDays=days;
      const previousMeatDays=meatDays;

      days=5;
      if(meatDays>days) meatDays=days;
      oldStartNewWeek();

      const after=(activeWeek&&activeWeek.changedAt)||null;
      if(!after || after===before){
        days=previousDays;
        meatDays=previousMeatDays;
        return;
      }

      try{localStorage.setItem(RESET_KEY,String(Date.now()));}catch(e){}
      clearNonfood();
      try{buildShopping({keepManual:false});}catch(e){}
      clearNonfood();
      try{saveSession();renderAll();}catch(e){}
    };
  }
})();
