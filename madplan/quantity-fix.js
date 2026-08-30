(function(){
  let needsCorrection=false;

  function normName(x){
    return cleanName(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  function expectedQuantities(){
    const recipe=new Map();
    const standard=new Map();

    try{
      plan.map(byId).forEach((r,day)=>{
        (r.ingredients||[]).forEach(i=>{
          if(!ingOn(day,i)) return;
          const k=normName(i.name);
          recipe.set(k,(recipe.get(k)||0)+1);
        });
      });
    }catch(e){}

    try{
      STANDARD.forEach(i=>{
        const k=normName(i.name);
        standard.set(k,(standard.get(k)||0)+(Number(i.qty)||1));
      });
    }catch(e){}

    return {recipe,standard};
  }

  function correctGeneratedQuantities(){
    if(!Array.isArray(shopping)) return false;
    const expected=expectedQuantities();
    let changed=false;

    shopping.forEach(i=>{
      const source=i.source==='ekstra'?'manuelt':i.source;
      const k=normName(i.name);
      let qty=null;
      if(source==='ret' && expected.recipe.has(k)) qty=expected.recipe.get(k);
      if(source==='standard' && expected.standard.has(k)) qty=expected.standard.get(k);
      if(qty!==null && Number(i.qty)!==qty){
        i.qty=qty;
        changed=true;
      }
    });

    return changed;
  }

  if(typeof buildShopping==='function'){
    const previousBuildShopping=buildShopping;
    buildShopping=function(opts={}){
      previousBuildShopping(opts);
      correctGeneratedQuantities();
      needsCorrection=true;
    };
  }

  if(typeof renderAll==='function'){
    const previousRenderAll=renderAll;
    renderAll=function(){
      if(needsCorrection){
        const changed=correctGeneratedQuantities();
        needsCorrection=false;
        if(changed){try{saveSession(false);}catch(e){}}
      }
      return previousRenderAll();
    };
  }

  try{
    buildShopping();
    correctGeneratedQuantities();
    needsCorrection=false;
    saveSession(false);
    renderAll();
  }catch(e){}
})();
