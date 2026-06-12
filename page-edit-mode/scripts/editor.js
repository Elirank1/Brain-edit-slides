/* ===== BRAIN PAGE · EDIT MODE v1 (additive, self-contained) =====
   Adapted from BRAIN DECK EDIT MODE for flow-layout HTML proposals,
   landing pages and single-page docs. Removes slide coupling and
   absolute-positioning assumptions; keeps inline text editing, color
   swatches, image paste, internal copy/paste, undo/redo, autosave,
   Cmd+S export. */
(function(){
  if(window.__brainEdInit) return; window.__brainEdInit=true;

  /* ---------- canvas root: configurable, else [data-edit-root] / main / body ---------- */
  var cfg = window.__brainEdConfig || {};
  var canvas =
    (cfg.rootSelector && document.querySelector(cfg.rootSelector)) ||
    document.querySelector('[data-edit-root]') ||
    document.querySelector('main') ||
    document.body;
  if(!canvas) return;

  /* ---------- state ---------- */
  var edOn=false, selected=null, undoStack=[], redoStack=[], editState=null;
  var clipInternal=null;
  var touched={}, persistTimer=null, persistWarned=false;
  var LS_KEY='brainPgEd:'+(location.pathname.split('/').pop()||'page');
  var MARKER='__brain-pg-ed-copy__';

  var ADDED='.ed-pg-img,.ed-pg-textbox,.ed-pg-clone';
  /* DENY: never select editor chrome */
  var DENY='#ed-toolbar,#ed-fab,#ed-hint,#ed-toast,#ed-ctx,#ed-restore,.ed-runtime,.ed-del';
  /* TEXTY: elements that may be inline-edited on double-click. */
  var TEXTY='h1,h2,h3,h4,h5,h6,p,li,span,a,strong,em,small,blockquote,figcaption,'+
            'td,th,dt,dd,label,button,'+
            '.eyebrow,.tag,.chip,.lead,.headline,.subhead,.kpi,.num,'+
            '[data-edit-text]';

  /* ---------- helpers ---------- */
  function matches(el,sel){ return el && el.matches && el.matches(sel); }
  function sectionOf(el){
    return (el && el.closest && el.closest('section')) || canvas;
  }
  function sectionKey(s){
    if(!s || s===canvas) return 'page';
    if(s.id) return s.id;
    if(s.dataset && s.dataset.editId) return s.dataset.editId;
    var all = canvas.querySelectorAll('section');
    var idx = [].indexOf.call(all,s);
    return idx>=0 ? 'sec-'+idx : 'page';
  }
  function findSecByKey(key){
    if(key==='page') return canvas;
    var byId=document.getElementById(key); if(byId) return byId;
    if(/^sec-(\d+)$/.test(key)){
      var idx=+RegExp.$1;
      return canvas.querySelectorAll('section')[idx] || null;
    }
    return canvas.querySelector('[data-edit-id="'+key+'"]') || null;
  }

  /* permissive: deepest element under cursor not inside editor chrome */
  function eligible(el){
    if(el && el.closest){ var ad=el.closest(ADDED); if(ad) return ad; }
    var cur=el;
    while(cur && cur!==document.body && cur!==document.documentElement){
      if(matches(cur,ADDED)) return cur;
      if(matches(cur,DENY)) return null;
      if(canvas.contains(cur)) return cur;
      cur=cur.parentElement;
    }
    return null;
  }
  function eligibleText(el){
    var cur=el;
    while(cur && cur!==document.body && cur!==document.documentElement){
      if(matches(cur,'.ed-pg-textbox')) return cur;
      if(!matches(cur,DENY) && matches(cur,TEXTY) && canvas.contains(cur)) return cur;
      cur=cur.parentElement;
    }
    return null;
  }
  function selectParent(){
    if(!selected){ toast('בחר אלמנט קודם'); return; }
    var p=selected.parentElement;
    while(p && p!==canvas && p!==document.body){
      if(!matches(p,DENY)){ select(p); toast('נבחרה המסגרת'); return; }
      p=p.parentElement;
    }
    toast('אין מסגרת אב');
  }

  /* ---------- undo / redo (per-section innerHTML snapshots) ---------- */
  function snap(){
    var ref = selected || (editState && editState.el);
    var s=sectionOf(ref);
    var key=sectionKey(s);
    undoStack.push({sec:s, key:key, html:s.innerHTML});
    if(undoStack.length>80) undoStack.shift();
    redoStack.length=0;
    touched[key]=1; schedulePersist();
  }
  function undo(){
    var last=undoStack.pop(); if(!last){ toast('אין מה לבטל'); return; }
    deselect();
    redoStack.push({sec:last.sec, key:last.key, html:last.sec.innerHTML});
    last.sec.innerHTML=last.html;
    touched[last.key]=1; schedulePersist();
    toast('בוטל');
  }
  function redo(){
    var nx=redoStack.pop(); if(!nx){ toast('אין מה להחזיר'); return; }
    deselect();
    undoStack.push({sec:nx.sec, key:nx.key, html:nx.sec.innerHTML});
    nx.sec.innerHTML=nx.html;
    touched[nx.key]=1; schedulePersist();
    toast('הוחזר');
  }

  /* ---------- autosave (localStorage, debounced, normalized compare) ---------- */
  function cleanHTML(node){
    var c=node.cloneNode(true), i, n;
    n=c.querySelectorAll('.ed-runtime,.ed-del'); for(i=0;i<n.length;i++) n[i].remove();
    n=c.querySelectorAll('.ed-hover,.ed-selected'); for(i=0;i<n.length;i++){ n[i].classList.remove('ed-hover'); n[i].classList.remove('ed-selected'); }
    n=c.querySelectorAll('[contenteditable]'); for(i=0;i<n.length;i++) n[i].removeAttribute('contenteditable');
    var fmt; try{ fmt=new Intl.NumberFormat('he-IL'); }catch(e){ fmt=null; }
    n=c.querySelectorAll('[data-count]');
    for(i=0;i<n.length;i++){ var v=parseInt(n[i].getAttribute('data-count'),10); if(isNaN(v)) continue;
      var out=n[i].querySelector('.cval')||n[i]; out.textContent= fmt?fmt.format(v):(''+v); }
    n=c.querySelectorAll('[style=""]'); for(i=0;i<n.length;i++) n[i].removeAttribute('style');
    return c.innerHTML;
  }
  function persist(){
    try{
      var data; try{ data=JSON.parse(localStorage.getItem(LS_KEY)||'{}'); }catch(e){ data={}; }
      data.ts=Date.now(); data.sections=data.sections||{};
      for(var k in touched){
        var s=findSecByKey(k);
        if(s) data.sections[k]=cleanHTML(s);
      }
      localStorage.setItem(LS_KEY,JSON.stringify(data));
    }catch(err){
      if(!persistWarned){ persistWarned=true; toast('גיבוי אוטומטי נכשל - הקובץ גדול, שמור ידנית'); }
    }
  }
  function schedulePersist(){ clearTimeout(persistTimer); persistTimer=setTimeout(persist,800); }
  function checkRestore(){
    var data; try{ data=JSON.parse(localStorage.getItem(LS_KEY)||'null'); }catch(e){ return; }
    if(!data || !data.sections) return;
    var diff=[];
    for(var k in data.sections){
      var s=findSecByKey(k);
      if(s && cleanHTML(s)!==data.sections[k]) diff.push(k);
    }
    if(!diff.length) return;
    var bar=document.createElement('div'); bar.id='ed-restore';
    var when=new Date(data.ts||Date.now());
    var hh=('0'+when.getHours()).slice(-2)+':'+('0'+when.getMinutes()).slice(-2);
    var lbl=document.createElement('span');
    lbl.textContent='🕘 נמצאו שינויים לא שמורים ('+hh+') · '+diff.length+' מקטעים';
    var b1=document.createElement('button'); b1.className='ed-btn primary'; b1.textContent='שחזר';
    var b2=document.createElement('button'); b2.className='ed-btn'; b2.textContent='התעלם ומחק';
    b1.onclick=function(){
      for(var j=0;j<diff.length;j++){
        var s=findSecByKey(diff[j]);
        if(s){ s.innerHTML=data.sections[diff[j]]; touched[diff[j]]=1; }
      }
      bar.remove(); toast('שוחזר ✓');
    };
    b2.onclick=function(){ try{ localStorage.removeItem(LS_KEY); }catch(e){} bar.remove(); };
    bar.appendChild(lbl); bar.appendChild(b1); bar.appendChild(b2);
    document.body.appendChild(bar);
  }

  /* ---------- selection ---------- */
  function deselect(){
    if(selected){
      selected.classList.remove('ed-selected');
      if(selected.__edRel && !selected.style.zIndex){ selected.style.position=''; selected.__edRel=false; }
    }
    var rt=document.querySelectorAll('.ed-runtime'); for(var i=0;i<rt.length;i++) rt[i].remove();
    selected=null; refreshTb();
  }
  function select(el){
    deselect();
    selected=el; el.classList.add('ed-selected');
    if(getComputedStyle(el).position==='static'){ el.style.position='relative'; el.__edRel=true; }
    var del=document.createElement('div'); del.className='ed-del ed-runtime'; del.textContent='×';
    del.addEventListener('mousedown',function(e){ e.stopPropagation(); e.preventDefault(); });
    del.addEventListener('click',function(e){ e.stopPropagation(); snap(); var t=selected; deselect(); if(t) t.remove(); schedulePersist(); });
    el.appendChild(del);
    refreshTb();
  }

  /* ---------- mousedown: pure selection (no drag in flow layout) ---------- */
  function onDown(e){
    if(!edOn) return;
    if(e.target.closest && e.target.closest('#ed-toolbar,#ed-fab,#ed-hint,#ed-toast,#ed-restore')) return;
    if(e.target.classList && e.target.classList.contains('ed-del')) return;
    var el=eligible(e.target);
    if(!el){ deselect(); return; }
    if(el.isContentEditable) return;
    select(el);
    /* don't preventDefault — let user still click links/buttons inside edited text */
  }

  /* ---------- inline text edit (double-click) ---------- */
  function bakeCountFromEdit(el){
    var dc=el.closest ? el.closest('[data-count]') : null;
    if(!dc) return;
    var cv=dc.querySelector('.cval')||dc;
    var n=parseInt((cv.textContent||'').replace(/[^0-9]/g,''),10);
    if(!isNaN(n)) dc.setAttribute('data-count', n);
  }
  function onDbl(e){
    if(!edOn) return;
    var el=eligibleText(e.target)||eligible(e.target);
    if(!el) return;
    if(matches(el,ADDED) && !matches(el,'.ed-pg-textbox')) return;
    if(!matches(el,TEXTY) && !matches(el,'.ed-pg-textbox')){
      toast('האלמנט הזה לא טקסט לעריכה');
      return;
    }
    deselect(); snap();
    editState={el:el, orig:el.innerHTML, cancelled:false};
    refreshTb();
    el.setAttribute('contenteditable','true'); el.focus();
    el.addEventListener('blur',function h(){
      el.removeAttribute('contenteditable'); el.removeEventListener('blur',h);
      if(!(editState && editState.cancelled)) bakeCountFromEdit(el);
      if(editState && editState.el===el) editState=null;
      refreshTb(); schedulePersist();
    });
    e.preventDefault();
  }

  /* ---------- add elements (flow-aware) ---------- */
  function insertAfterSelectionOrEnd(node){
    var anchor=selected;
    if(anchor && anchor.parentElement && !matches(anchor.parentElement,DENY)){
      anchor.parentElement.insertBefore(node, anchor.nextSibling);
    } else {
      sectionOf(null).appendChild(node);
    }
  }
  function insertImageFile(f){
    if(!f || !/^image\//.test(f.type)) return;
    var rd=new FileReader();
    rd.onload=function(){
      snap();
      var box=document.createElement('figure'); box.className='ed-pg-img';
      var img=document.createElement('img'); img.src=rd.result; img.alt='';
      box.appendChild(img);
      insertAfterSelectionOrEnd(box);
      select(box); toast('תמונה נוספה'); schedulePersist();
    };
    rd.readAsDataURL(f);
  }
  function addImage(){
    var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
    inp.onchange=function(){ insertImageFile(inp.files[0]); };
    inp.click();
  }
  function addText(){
    snap();
    var p=document.createElement('p'); p.className='ed-pg-textbox';
    p.textContent='טקסט חדש';
    insertAfterSelectionOrEnd(p);
    select(p);
    toast('לחץ פעמיים לעריכה'); schedulePersist();
  }

  /* ---------- copy / paste (Cmd+C / Cmd+V / Cmd+D) ---------- */
  function cleanOuter(el){
    var c=el.cloneNode(true), i, n;
    n=c.querySelectorAll('.ed-runtime,.ed-del'); for(i=0;i<n.length;i++) n[i].remove();
    c.classList.remove('ed-selected'); c.classList.remove('ed-hover');
    c.removeAttribute('contenteditable');
    n=c.querySelectorAll('[contenteditable]'); for(i=0;i<n.length;i++) n[i].removeAttribute('contenteditable');
    if(el.__edRel) c.style.position='';
    return c.outerHTML;
  }
  function copySel(){
    if(!selected) return false;
    clipInternal={ html: cleanOuter(selected) };
    try{ navigator.clipboard.writeText(MARKER).catch(function(){}); }catch(e){}
    toast('הועתק ✓ (Cmd+V להדבקה)');
    return true;
  }
  function pasteInternal(){
    if(!clipInternal) return;
    snap();
    var tmp=document.createElement('div'); tmp.innerHTML=clipInternal.html;
    var el=tmp.firstElementChild; if(!el) return;
    insertAfterSelectionOrEnd(el);
    select(el); toast('הודבק'); schedulePersist();
  }
  document.addEventListener('paste',function(e){
    if(!edOn) return;
    var ae=document.activeElement;
    if(ae && ae.isContentEditable) return; /* normal paste inside text edit */
    var items=(e.clipboardData&&e.clipboardData.items)||[];
    for(var i=0;i<items.length;i++){
      if(items[i].type && items[i].type.indexOf('image')===0){
        var f=items[i].getAsFile();
        if(f){ e.preventDefault(); insertImageFile(f); return; }
      }
    }
    var txt=''; try{ txt=e.clipboardData.getData('text/plain')||''; }catch(err){}
    if(clipInternal && (txt===MARKER || txt==='')){ e.preventDefault(); pasteInternal(); return; }
    if(txt){
      e.preventDefault(); snap();
      var p=document.createElement('p'); p.className='ed-pg-textbox'; p.textContent=txt;
      insertAfterSelectionOrEnd(p);
      select(p);
      toast('טקסט הודבק'); schedulePersist();
    }
  });
  /* drag & drop image files from Finder/desktop */
  canvas.addEventListener('dragover',function(e){ if(edOn){ e.preventDefault(); } });
  canvas.addEventListener('drop',function(e){
    if(!edOn) return; e.preventDefault();
    var fs=e.dataTransfer && e.dataTransfer.files;
    if(!fs || !fs.length) return;
    for(var i=0;i<fs.length;i++){
      if(/^image\//.test(fs[i].type)){
        /* set selection to drop target so insertAfter inserts there */
        var drop=eligible(e.target); if(drop) select(drop);
        insertImageFile(fs[i]); return;
      }
    }
  });

  /* ---------- colors (whole element or selected word while editing) ---------- */
  /* default palette tuned for 3pel/AI proposals: ink + terra + neutrals.
     override via window.__brainEdConfig.colors = [['name','#hex'], ...]; */
  var GRAD=(cfg.gradient)||'linear-gradient(135deg,#C8503D,#A8412F,#7d2d20)';
  var COLORS=(cfg.colors)||[
    ['ink','#1A2238'],
    ['ink-2','#1F2A40'],
    ['terra','#C8503D'],
    ['terra-deep','#A8412F'],
    ['cream','#F7F1E5'],
    ['mute','#7A7E8A']
  ];
  function applyColor(c){
    var ae=document.activeElement, sel=window.getSelection();
    if(ae && ae.isContentEditable && sel && !sel.isCollapsed){
      document.execCommand('styleWithCSS',false,true);
      document.execCommand('foreColor',false,c);
      return;
    }
    if(!selected){ toast('בחר אלמנט או סמן מילה'); return; }
    snap();
    selected.style.background='none';
    selected.style.webkitBackgroundClip=''; selected.style.backgroundClip='';
    selected.style.webkitTextFillColor=c; selected.style.color=c;
    schedulePersist();
  }
  function applyGradient(){
    var ae=document.activeElement, sel=window.getSelection();
    if(ae && ae.isContentEditable && sel && !sel.isCollapsed){
      var t=sel.toString();
      document.execCommand('insertHTML',false,'<span class="grad">'+t.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span>');
      return;
    }
    if(!selected){ toast('בחר אלמנט או סמן מילה'); return; }
    snap();
    selected.style.background=GRAD;
    selected.style.webkitBackgroundClip='text'; selected.style.backgroundClip='text';
    selected.style.webkitTextFillColor='transparent'; selected.style.color='';
    schedulePersist();
  }

  function fontDelta(d){
    if(!selected){ toast('בחר טקסט קודם'); return; }
    snap();
    var cs=parseFloat(getComputedStyle(selected).fontSize)||16;
    selected.style.fontSize=Math.max(10,cs+d)+'px';
    schedulePersist();
  }
  function deleteSel(){
    if(!selected){ toast('בחר אלמנט קודם'); return; }
    snap(); var el=selected; deselect(); el.remove(); schedulePersist();
  }

  /* ---------- export ---------- */
  function absolutizeURLs(root){
    var base=location.href, keep=/^(data:|https?:|file:|blob:|#)/i;
    function abs(u){ try{ return new URL(u, base).href; }catch(e){ return u; } }
    function fixCss(t){ return t.replace(/url\((['"]?)([^'")]+)\1\)/g,function(m,q,u){ return keep.test(u)?m:('url('+q+abs(u)+q+')'); }); }
    var s=root.querySelectorAll('[src]'); for(var i=0;i<s.length;i++){ var v=s[i].getAttribute('src'); if(v&&!keep.test(v)) s[i].setAttribute('src',abs(v)); }
    var h=root.querySelectorAll('[href]'); for(var j=0;j<h.length;j++){ var w=h[j].getAttribute('href'); if(w&&!keep.test(w)) h[j].setAttribute('href',abs(w)); }
    var st=root.querySelectorAll('style'); for(var k=0;k<st.length;k++){ st[k].textContent=fixCss(st[k].textContent); }
    var il=root.querySelectorAll('[style]'); for(var l=0;l<il.length;l++){ var sv=il[l].getAttribute('style'); if(sv&&sv.indexOf('url(')>-1) il[l].setAttribute('style',fixCss(sv)); }
  }
  function bakeCounters(root){
    var fmt; try{ fmt=new Intl.NumberFormat('he-IL'); }catch(e){ fmt=null; }
    var n=root.querySelectorAll('[data-count]');
    for(var i=0;i<n.length;i++){ var v=parseInt(n[i].getAttribute('data-count'),10); if(isNaN(v)) continue;
      var out=n[i].querySelector('.cval')||n[i]; out.textContent= fmt?fmt.format(v):(''+v); }
  }
  function exportHTML(){
    deselect(); var was=edOn; setEdit(false);
    var clone=document.documentElement.cloneNode(true);
    var kill=clone.querySelectorAll('#ed-toolbar,#ed-fab,#ed-hint,#ed-toast,#ed-restore,.ed-runtime,.ed-del');
    for(var i=0;i<kill.length;i++) kill[i].remove();
    var cl=clone.querySelectorAll('.ed-hover,.ed-selected'); for(var j=0;j<cl.length;j++){ cl[j].classList.remove('ed-hover'); cl[j].classList.remove('ed-selected'); }
    var ce=clone.querySelectorAll('[contenteditable]'); for(var k=0;k<ce.length;k++) ce[k].removeAttribute('contenteditable');
    var b=clone.querySelector('body'); if(b) b.classList.remove('ed-on');
    absolutizeURLs(clone);
    bakeCounters(clone);
    var html='<!DOCTYPE html>\n'+clone.outerHTML;
    var blob=new Blob([html],{type:'text/html;charset=utf-8'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    var fname=(location.pathname.split('/').pop()||'page.html').replace(/\.html?$/i,'');
    try{ fname=decodeURIComponent(fname); }catch(e){}
    a.download=fname+'-edited.html'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); },3000);
    if(was) setEdit(true);
    toast('נשמר! החלף את הקובץ המקורי בקובץ שירד');
  }

  /* ---------- toolbar UI ---------- */
  var fab=document.createElement('button'); fab.id='ed-fab'; fab.type='button'; fab.textContent='✏️ עריכה';
  fab.addEventListener('click',function(){ setEdit(true); });
  document.body.appendChild(fab);

  var tb=document.createElement('div'); tb.id='ed-toolbar';
  var toast_el, ctx;
  function mkBtn(label,fn,cls){
    var b=document.createElement('button'); b.type='button'; b.className='ed-btn'+(cls?(' '+cls):''); b.textContent=label;
    b.addEventListener('mousedown',function(e){e.preventDefault();});
    b.addEventListener('click',function(e){e.stopPropagation();fn();});
    return b;
  }
  function mkSep(){ var s=document.createElement('span'); s.className='ed-sep'; return s; }
  function mkDot(name,color){
    var d=document.createElement('button'); d.type='button'; d.className='ed-dot'; d.title=name; d.style.background=color;
    d.addEventListener('mousedown',function(e){e.preventDefault();});
    d.addEventListener('click',function(e){e.stopPropagation();applyColor(color);});
    return d;
  }

  var row=document.createElement('div'); row.id='ed-row';
  row.appendChild(mkBtn('🖼️ תמונה',addImage));
  row.appendChild(mkBtn('🔤 טקסט',addText));
  row.appendChild(mkSep());
  row.appendChild(mkBtn('⤴ מסגרת',selectParent));
  row.appendChild(mkBtn('A+',function(){fontDelta(2);}));
  row.appendChild(mkBtn('A−',function(){fontDelta(-2);}));
  row.appendChild(mkSep());
  row.appendChild(mkBtn('🗑️ מחק',deleteSel,'danger'));
  row.appendChild(mkBtn('↶ ביטול',undo));
  row.appendChild(mkBtn('↷ חזרה',redo));
  row.appendChild(mkSep());
  row.appendChild(mkBtn('💾 שמור',exportHTML,'primary'));
  row.appendChild(mkBtn('✖ סגור',function(){ setEdit(false); }));
  tb.appendChild(row);

  ctx=document.createElement('div'); ctx.id='ed-ctx'; tb.appendChild(ctx);
  document.body.appendChild(tb);

  function buildColors(){
    var lbl=document.createElement('span'); lbl.className='ed-ctx-lbl'; lbl.textContent='צבע:';
    ctx.appendChild(lbl);
    var g=document.createElement('button'); g.type='button'; g.className='ed-dot grad-dot'; g.title='גרדיאנט';
    g.addEventListener('mousedown',function(e){e.preventDefault();});
    g.addEventListener('click',function(e){e.stopPropagation();applyGradient();});
    ctx.appendChild(g);
    for(var i=0;i<COLORS.length;i++) ctx.appendChild(mkDot(COLORS[i][0],COLORS[i][1]));
    if(editState){
      var tip=document.createElement('span'); tip.className='ed-ctx-lbl'; tip.textContent='(סמן מילה כדי לצבוע רק אותה)';
      ctx.appendChild(tip);
    }
  }
  function refreshTb(){
    if(!ctx) return;
    ctx.innerHTML='';
    var show=false;
    if(editState){ buildColors(); show=true; }
    else if(selected){ buildColors(); show=true; }
    ctx.style.display=show?'flex':'none';
  }

  var hint=document.createElement('div'); hint.id='ed-hint';
  hint.innerHTML='לחיצה = בחירה · לחיצה כפולה = עריכת טקסט · Cmd+V = הדבק תמונה · Cmd+S = שמור · Cmd+Z = ביטול';
  document.body.appendChild(hint);

  toast_el=document.createElement('div'); toast_el.id='ed-toast'; document.body.appendChild(toast_el);
  var toastTimer;
  function toast(msg){
    if(!toast_el) return; toast_el.textContent=msg||''; toast_el.classList.toggle('on',!!msg);
    clearTimeout(toastTimer); if(msg) toastTimer=setTimeout(function(){ toast_el.classList.remove('on'); },2600);
  }

  function setEdit(on){
    edOn=on; document.body.classList.toggle('ed-on',on);
    tb.classList.toggle('on',on); fab.style.display=on?'none':'block';
    if(!on){ deselect(); toast(''); }
    else toast('מצב עריכה פעיל');
  }

  /* ---------- hover outline ---------- */
  document.addEventListener('mouseover',function(e){
    if(!edOn) return;
    var el=eligible(e.target);
    var hv=document.querySelectorAll('.ed-hover');
    for(var i=0;i<hv.length;i++){ if(hv[i]!==el) hv[i].classList.remove('ed-hover'); }
    if(el && el!==selected) el.classList.add('ed-hover');
  });
  document.addEventListener('mouseout',function(e){
    if(!edOn) return;
    var el=eligible(e.target); if(el) el.classList.remove('ed-hover');
  });

  /* ---------- bind ---------- */
  canvas.addEventListener('mousedown',onDown);
  canvas.addEventListener('dblclick',onDbl);

  document.addEventListener('keydown',function(e){
    if(!edOn) return;
    var editing=document.activeElement && document.activeElement.isContentEditable;
    var meta=e.metaKey||e.ctrlKey;
    if(meta && (e.key==='z'||e.key==='Z')){
      e.preventDefault(); e.stopImmediatePropagation();
      if(e.shiftKey) redo(); else undo();
      return;
    }
    if(meta && (e.key==='s'||e.key==='S')){
      e.preventDefault(); e.stopImmediatePropagation();
      exportHTML(); return;
    }
    if(meta && (e.key==='c'||e.key==='C') && !editing && selected){ copySel(); return; }
    if(meta && (e.key==='d'||e.key==='D') && !editing && selected){
      e.preventDefault(); e.stopImmediatePropagation();
      if(copySel()) pasteInternal(); return;
    }
    if((e.key==='Delete'||e.key==='Backspace') && !editing){
      if(selected){ e.preventDefault(); deleteSel(); }
      return;
    }
    if(e.key==='Escape'){
      if(editing){
        if(editState && editState.el){
          editState.cancelled=true;
          editState.el.innerHTML=editState.orig;
          if(undoStack.length) undoStack.pop();
          editState.el.blur();
        } else document.activeElement.blur();
      } else deselect();
    }
  },true);

  /* optional auto-enter via ?edtest=1 for screenshot tests */
  if(location.search.indexOf('edtest')>-1){ setEdit(true); }
  setTimeout(checkRestore,400);
})();
