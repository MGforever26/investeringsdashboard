(function(){
  function normName(x){
    return cleanName(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9æøå ]+/gi,' ').replace(/\s+/g,' ').trim();
  }

  function hasAny(n,words){return words.some(w=>n.includes(w));}

  function betterCategory(name,cat){
    let n=normName(name);
    let original=cat||'andet';

    let veg=['citron','lime','gulerod','gulerodder','hvidlog','jordskok','log','rodlog','forarslog','porre','persille','dild','basilikum','purlog','koriander','mynte','rosmarin','timian','salat','rucola','spinat','kal','spidskal','blomkal','broccoli','agurk','tomat','peberfrugt','kartoffel','selleri','bladselleri','champignon','svamp','squash','aubergine','graeskar','graskar','aeble','aebler','paere','paerer','banan','avocado'];
    let dairy=['yoghurt','græsk yoghurt','graesk yoghurt','creme fraiche','mælk','maelk','fløde','flode','smør','smor','ost','feta','mozzarella','parmesan','cheddar','æg','aeg','pølser','pølse','polser','polse','bacon','pulled pork','pepperoni','kyllingepålæg','kyllingepalaeg'];
    let grain=['havregryn','grove havregryn','gryn','mel','rugmel','fuldkornsmel','chiafro','chiafrø','knækbrød','knaekbrod','flager','riskiks','majskiks','rugkerner','solsikkekerner','hørfrø','horfro','hasselnødder','hasselnodder','mandler','sesamfrø','sesamfro','peanuts','rosiner','figenstænger','figenstaenger','ahornsirup','honning'];
    let dry=['ris','grødris','grod ris','nudler','bulgur','couscous','linser','bønner','bonner','kikærter','kikaerter','tomatpure','dåsetomat','dasetomat','pasta tør','tør pasta','tor pasta'];
    let bread=['rugbrød','rugbrod','boller','pitabrød','pitabrod','brød','brod'];
    let frozen=['frossen','frosne'];
    let meat=['kylling','hakket oksekød','hakket oksekod','hakket svinekød','hakket svinekod','lammekød','lammekod','tykstegsbøf','tykstegsbof'];

    if(hasAny(n,veg)) return 'grøntsager og frugt';
    if(hasAny(n,dairy)) return 'mælkeprodukter og pålæg';
    if(hasAny(n,grain)) return 'mel og gryn';
    if(hasAny(n,bread)) return 'brød';
    if(hasAny(n,frozen)) return 'frostvarer';
    if(hasAny(n,dry)) return 'konserves og tørvarer';
    if(hasAny(n,meat)) return 'andet';

    return original;
  }

  function normalizeShoppingCategories(){
    if(!Array.isArray(shopping)) return;
    shopping.forEach(i=>{i.category=betterCategory(i.name,i.category);});
  }

  if(typeof buildShopping==='function'){
    const previousBuildShopping=buildShopping;
    buildShopping=function(opts={}){
      previousBuildShopping(opts);
      normalizeShoppingCategories();
    };
  }

  if(typeof addItem==='function'){
    const previousAddItem=addItem;
    addItem=function(cat,name){
      return previousAddItem(betterCategory(name,cat),name);
    };
  }

  if(typeof saveSession==='function'){
    const previousSaveSession=saveSession;
    saveSession=function(touch=true){
      normalizeShoppingCategories();
      previousSaveSession(touch);
    };
  }

  try{
    normalizeShoppingCategories();
    if(typeof renderList==='function') renderList();
    if(typeof renderPrint==='function') renderPrint();
    if(typeof saveSession==='function') saveSession(false);
  }catch(e){}
})();
