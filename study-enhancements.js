(() => {
  const DAY = 86400000;
  const now = () => Date.now();
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const dateLabel = (stamp) => new Date(stamp).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'});
  data.reviewSchedule = data.reviewSchedule && typeof data.reviewSchedule === 'object' ? data.reviewSchedule : {};
  data.studyPrefs = Object.assign({goalMinutes:90, daysPerWeek:6, reminderTime:'', reminderEnabled:false, remindedOn:''}, data.studyPrefs || {});
  data.studyMinutesByDay = data.studyMinutesByDay && typeof data.studyMinutesByDay === 'object' ? data.studyMinutesByDay : {};

  // Convert the existing error history into the first spaced-review dates.
  const known = new Set(data.questions.map(q => q.id));
  const grouped = new Map();
  data.history.forEach(h => { if (h && known.has(h.id)) { if (!grouped.has(h.id)) grouped.set(h.id, []); grouped.get(h.id).push(h); } });
  grouped.forEach((attempts, id) => {
    if (data.reviewSchedule[id] || !attempts.some(x => !x.correct)) return;
    attempts.sort((a,b) => (a.at||0) - (b.at||0));
    const last = attempts[attempts.length-1], intervalDays = last.correct ? 3 : 1;
    data.reviewSchedule[id] = {intervalDays, streak:last.correct?1:0, dueAt:(last.at||now()) + intervalDays*DAY, lastAt:last.at||now()};
  });

  function persistOnly(){ try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.warn('Não foi possível salvar o progresso local.',e); } }
  function applyReview(id, correct){
    const old = data.reviewSchedule[id];
    if (!old && correct) return;
    const intervals = [1,3,7,14,30,60];
    const streak = correct ? Math.min((old?.streak||0)+1, intervals.length-1) : 0;
    const intervalDays = correct ? intervals[streak] : 1;
    data.reviewSchedule[id] = {intervalDays, streak, dueAt:now()+intervalDays*DAY, lastAt:now()};
  }
  function priorErrors(){ return new Set(data.history.filter(h=>!h.correct).map(h=>h.id)); }
  function reviewItems(){
    const errors=priorErrors(), items=[...errors].map(id=>({id,q:data.questions.find(q=>q.id===id),r:data.reviewSchedule[id]})).filter(x=>x.q&&!x.q.annulled);
    items.forEach(x=>{if(!x.r){x.r={intervalDays:1,streak:0,dueAt:0,lastAt:0};data.reviewSchedule[x.id]=x.r;}});
    const due=items.filter(x=>(x.r.dueAt||0)<=now()).sort((a,b)=>(a.r.dueAt||0)-(b.r.dueAt||0));
    const upcoming=items.filter(x=>(x.r.dueAt||0)>now()).sort((a,b)=>a.r.dueAt-b.r.dueAt);
    return {items,due,upcoming};
  }
  function startDueReview(){
    const {due}=reviewItems();
    if(!due.length){alert('Você não tem revisões vencidas agora. Confira as próximas datas na lista.');return;}
    sim=false;reviewOnly=true;queue=[...due.map(x=>x.q)].sort(()=>Math.random()-.5);pos=0;goto('treino');showQuestion();
  }
  function optionAnalysis(q, selected){
    const answered=Number.isInteger(selected)&&selected>=0,answer=q.answer,letter='ABCD'[answer]||'—',chosen=answered?('ABCD'[selected]||'—'):'—';
    const custom=Array.isArray(q.optionExplanations)?q.optionExplanations:[];
    const notes=q.options.map((option,i)=>{
      let note=custom[i]||'';
      if(!note&&i===answer)note=q.explanation||'Esta é a alternativa do gabarito definitivo.';
      if(!note&&answered&&i===selected&&i!==answer)note=`Sua escolha não corresponde ao gabarito. Compare esta afirmação com a alternativa ${letter} e com a regra explicada acima.`;
      if(!note)note=`Alternativa incorreta segundo o gabarito definitivo. Compare com a alternativa ${letter} e com a explicação acima.`;
      const status=i===answer?'Gabarito definitivo':(answered&&i===selected?'Sua resposta':'Alternativa incorreta');
      return `<div class="item"><div><strong>${'ABCD'[i]}) ${esc(option)}</strong><br><small>${status}</small><p>${esc(note)}</p></div></div>`;
    }).join('');
    const correct=answered&&selected===answer,chosenText=answered?(q.options[selected]||''):'';
    const headline=!answered?'Questão em branco':correct?'A resposta está correta.':'Por que sua escolha precisa ser revista';
    const contrast=!answered?`O gabarito é ${letter}: “${esc(q.options[answer]||'')}”.`:correct?'Você marcou a alternativa correta.':`Você marcou ${chosen}: “${esc(chosenText)}”. O gabarito é ${letter}: “${esc(q.options[answer]||'')}”.`;
    return `<div class="feedback ${correct?'':'bad'}"><strong>${headline}</strong>${contrast}<br><br><b>Explicação do gabarito:</b> ${esc(q.explanation||'Consulte o material da unidade relacionada.')}
      <details style="margin-top:10px"><summary><b>Analisar todas as alternativas</b></summary><div class="list" style="margin-top:10px">${notes}</div></details>
      <p><b>Teoria relacionada:</b> ${esc(q.unit||q.subject)} <a href="./apostila/reader.html?unit=${encodeURIComponent((q.unit||'Unidade 1').includes('4')?'4':(q.unit||'Unidade 1').includes('3')?'3':(q.unit||'Unidade 1').includes('2')?'2':'1')}">abrir na apostila ↗</a></p></div>`;
  }

  const baseChoose=choose;
  choose=function(i){
    const q=queue[pos];
    baseChoose(i);
    if(!sim && q && !q.annulled && q.answer!==null){
      applyReview(q.id,i===q.answer);
      const f=document.querySelector('#feedback'); if(f)f.innerHTML=optionAnalysis(q,i);
      save();
    }
  };
  const baseFinish=finishSimulation;
  finishSimulation=function(){
    if(!sim)return;
    const outcomes=queue.map((q,i)=>({q,correct:picks[i]===q.answer}));
    baseFinish();
    document.querySelectorAll('#sim-area .review-row').forEach((row,i)=>{const x=outcomes[i];if(x)row.insertAdjacentHTML('beforeend',optionAnalysis(x.q,picks[i]===undefined?-1:picks[i]));});
    outcomes.filter(x=>x.q&&!x.q.annulled&&x.q.answer!==null).forEach(x=>applyReview(x.q.id,x.correct));
    save();
  };

  renderReview=function(){
    const host=document.querySelector('#review-list'); if(!host)return;
    const {items,due,upcoming}=reviewItems();
    const top=`<div class="notice"><b>${due.length} revisão(ões) vencida(s)</b> · ${upcoming.length} próxima(s). Respostas erradas voltam em 1 dia; acertos espaçam a revisão para 3, 7, 14 e 30 dias.</div>`;
    const rows=[...due.map(x=>({...x,status:x.r.dueAt&&x.r.dueAt<now()?`Atrasada · prevista para ${dateLabel(x.r.dueAt)}`:'Revisar hoje'})),...upcoming.map(x=>({...x,status:`Próxima · ${dateLabel(x.r.dueAt)}`}))];
    host.innerHTML=top+(rows.length?rows.map(x=>`<div class="item"><div><strong>${esc(x.q.source||x.q.subject)}</strong> <span class="pill">${esc(x.status)}</span><br><small>${esc(x.q.text.slice(0,180))}${x.q.text.length>180?'…':''}</small><br><small>Gabarito ${esc(x.q.officialAnswer||'ABCD'[x.q.answer])} · ${esc(x.q.unit||x.q.subject)}</small><br><small>${esc(x.q.explanation||'')}</small></div></div>`).join(''):'<div class="card empty"><h3>Sem erros para revisar</h3><p>Quando errar uma questão, ela entrará na sua revisão espaçada.</p></div>');
    const button=document.querySelector('#review-btn'); if(button)button.textContent=`Treinar revisões vencidas (${due.length})`;
  };

  function goalStats(){
    const mins=Number(data.studyMinutesByDay[dayKey()]||0),goal=Number(data.studyPrefs.goalMinutes)||90;
    const today=document.querySelector('#goal-today'); if(today)today.textContent=`${mins} / ${goal} min`;
    const bar=document.querySelector('#goal-bar'); if(bar)bar.style.width=`${Math.min(100,Math.round(mins/goal*100))}%`;
    const days=Number(data.studyPrefs.daysPerWeek)||6,nowDate=new Date(),monday=new Date(nowDate);monday.setDate(nowDate.getDate()-((nowDate.getDay()+6)%7));
    let studied=0;for(let i=0;i<7;i++){const d=new Date(monday);d.setDate(monday.getDate()+i);if(Number(data.studyMinutesByDay[dayKey(d)]||0)>0)studied++;}
    const week=document.querySelector('#goal-week'); if(week)week.textContent=`${studied} / ${days} dias desta semana`;
  }
  function renderGoalCard(){
    let card=document.querySelector('#study-goal-card');const host=document.querySelector('#schedule-grid');if(!host)return;
    if(!card){host.insertAdjacentHTML('beforebegin','<div class="card" id="study-goal-card" style="margin-bottom:14px"></div>');card=document.querySelector('#study-goal-card');}
    const prefs=data.studyPrefs;
    card.innerHTML=`<div class="section-head"><div><div class="eyebrow">Sua rotina</div><h3>Meta diária e lembrete</h3><p>O tempo conta enquanto esta página estiver aberta e visível.</p></div><span class="pill" id="goal-today">0 / 90 min</span></div><div class="bar"><i id="goal-bar"></i></div><div class="row" style="margin-bottom:12px"><span class="pill" id="goal-week"></span><label>Meta por dia <select class="select" id="goal-minutes"><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option><option value="90">90 min</option><option value="120">120 min</option></select></label><label>Dias por semana <select class="select" id="goal-days"><option value="3">3 dias</option><option value="4">4 dias</option><option value="5">5 dias</option><option value="6">6 dias</option><option value="7">7 dias</option></select></label></div><div class="row"><label>Horário do lembrete <input type="time" id="reminder-time" value="${esc(prefs.reminderTime||'')}"></label><button class="btn light small" id="reminder-enable">${prefs.reminderEnabled?'Salvar lembrete':'Ativar lembrete'}</button><span class="help" id="reminder-help">O lembrete só aparece com o sistema aberto.</span></div>`;
    document.querySelector('#goal-minutes').value=String(prefs.goalMinutes||90);document.querySelector('#goal-days').value=String(prefs.daysPerWeek||6);
    const model=document.querySelector('#cronograma .exam-banner');if(model){const total=Number(prefs.goalMinutes)||90,theory=Math.round(total*.28),practice=Math.round(total*.56),review=total-theory-practice;model.innerHTML='<strong>Modelo de sessão ('+total+' min):</strong> '+theory+' min de teoria + '+practice+' min de questões + '+review+' min para anotar e revisar erros. Sua meta semanal é estudar '+prefs.daysPerWeek+' dias.';}
    document.querySelector('#goal-minutes').onchange=e=>{prefs.goalMinutes=Number(e.target.value);save();};
    document.querySelector('#goal-days').onchange=e=>{prefs.daysPerWeek=Number(e.target.value);save();};
    document.querySelector('#reminder-time').onchange=e=>{prefs.reminderTime=e.target.value;save();};
    document.querySelector('#reminder-enable').onclick=async()=>{prefs.reminderTime=document.querySelector('#reminder-time').value;if(!prefs.reminderTime){alert('Escolha primeiro um horário.');return;}if(!('Notification' in window)){alert('Este navegador não oferece notificações.');return;}const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;if(permission!=='granted'){prefs.reminderEnabled=false;document.querySelector('#reminder-help').textContent='Permissão de notificação não concedida.';save();return;}prefs.reminderEnabled=true;document.querySelector('#reminder-help').textContent='Ativo enquanto o sistema estiver aberto.';save();};
    goalStats();
  }
  renderSchedule=function(){
    const host=document.querySelector('#schedule-grid');if(!host)return;const sessions=Number(data.studyPrefs.daysPerWeek)||6;
    host.innerHTML=schedules.map((w,wi)=>{const tasks=w.tasks.map((text,i)=>({text,id:`w${wi}d${i}`})),n=Math.min(sessions,Math.max(1,tasks.length)),groups=Array.from({length:n},()=>[]);tasks.forEach((t,i)=>groups[Math.min(n-1,Math.floor(i*n/tasks.length))].push(t));return `<article class="card week-card"><div class="range">${esc(w.range)}</div><h3>${esc(w.title)}</h3><p>${esc(w.focus)}</p>${groups.map((group,gi)=>{const ids=group.map(x=>x.id),done=ids.every(id=>data.planDone.includes(id)),task=group.map(x=>x.text).join(' + '),encoded=encodeURIComponent(JSON.stringify(ids));return `<label class="checkbox"><input type="checkbox" data-session="${encoded}" ${done?'checked':''}><span><b>Sessão ${gi+1}:</b> ${esc(task)}</span></label>`;}).join('')}<div class="rest">Meta: ${sessions} dias de estudo por semana. ${sessions<7?`${7-sessions} dia(s) livre(s) para descanso ou recuperação.`:'Inclua pausas e revisão leve.'}</div></article>`;}).join('');
    document.querySelectorAll('[data-session]').forEach(c=>c.onchange=()=>{const ids=JSON.parse(decodeURIComponent(c.dataset.session));if(c.checked)ids.forEach(id=>{if(!data.planDone.includes(id))data.planDone.push(id);});else data.planDone=data.planDone.filter(id=>!ids.includes(id));save();});renderGoalCard();
  };

  function startAllErrors(){startQuiz(true);}
  const reviewButton=document.querySelector('#review-btn'); if(reviewButton)reviewButton.onclick=startDueReview;
  if(reviewButton&&!document.querySelector('#all-errors-btn')){
    const row=document.createElement('div');row.className='row';reviewButton.parentNode.insertBefore(row,reviewButton);row.append(reviewButton);
    const all=document.createElement('button');all.id='all-errors-btn';all.className='btn ghost';all.textContent='Treinar todos os erros';all.onclick=startAllErrors;row.append(all);
  }

  // Full progress backup and restore; keep the existing question-bank import option.
  const exportButton=document.querySelector('#export-btn'),importButton=document.querySelector('#import-btn');
  if(exportButton)exportButton.textContent='Baixar backup completo';
  if(importButton)importButton.textContent='Restaurar backup / importar questões';
  const modalTitle=document.querySelector('#import-modal h2'),modalHelp=document.querySelector('#import-modal .section-head p');
  if(modalTitle)modalTitle.textContent='Restaurar backup ou importar questões';
  if(modalHelp)modalHelp.textContent='Um backup restaura progresso, revisão, metas e questões personalizadas. A restauração substitui os dados atuais deste navegador.';
  const bankNote=document.querySelector('#banco .notice');if(bankNote)bankNote.textContent='O progresso é salvo automaticamente neste navegador. Para levar a outro aparelho, use um backup; salvar por e-mail exige um serviço de contas ainda não conectado.';
  const foot=document.querySelector('.foot');if(foot)foot.textContent='Progresso salvo automaticamente neste navegador. Backup transfere dados entre aparelhos; sincronização por e-mail exige uma conta na nuvem.';
  if(exportButton)exportButton.onclick=()=>{
    const payload={backupVersion:2,savedAt:new Date().toISOString(),questions:data.questions,history:data.history,planDone:data.planDone,theoryDone:data.theoryDone,reviewSchedule:data.reviewSchedule,studyPrefs:data.studyPrefs,studyMinutesByDay:data.studyMinutesByDay,themePreferences:JSON.parse(localStorage.getItem(PREF_KEY)||'{}')};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`trilha-crc-backup-${dayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  const fileInput=document.querySelector('#file-input'),jsonInput=document.querySelector('#json-input');
  if(fileInput)fileInput.onchange=async e=>{if(e.target.files[0])jsonInput.value=await e.target.files[0].text();};
  const doImport=document.querySelector('#do-import');
  if(doImport)doImport.onclick=()=>{
    try{
      const p=JSON.parse(jsonInput.value);
      if(p&&Array.isArray(p.history)&&Array.isArray(p.planDone)&&Array.isArray(p.theoryDone)){
        if(!confirm('Restaurar este backup substituirá o progresso salvo neste navegador. Continuar?'))return;
        const ids=new Set(SEED.map(q=>q.id));
        const custom=(Array.isArray(p.questions)?p.questions:[]).filter(q=>q&&q.id&&!ids.has(q.id)&&!/^cfc-2026-\d+-/.test(q.id));
        data.questions=[...SEED,...custom];
        data.history=p.history.filter(h=>h&&typeof h.id==='string'&&typeof h.correct==='boolean'&&ids.has(h.id)||h&&typeof h.id==='string'&&typeof h.correct==='boolean'&&custom.some(q=>q.id===h.id));
        data.planDone=p.planDone.filter(x=>typeof x==='string');data.theoryDone=p.theoryDone.filter(x=>typeof x==='string');
        data.reviewSchedule=p.reviewSchedule&&typeof p.reviewSchedule==='object'?p.reviewSchedule:{};
        data.studyPrefs=Object.assign({goalMinutes:90,daysPerWeek:6,reminderTime:'',reminderEnabled:false,remindedOn:''},p.studyPrefs||{});
        data.studyMinutesByDay=p.studyMinutesByDay&&typeof p.studyMinutesByDay==='object'?p.studyMinutesByDay:{};
        if(p.themePreferences){localStorage.setItem(PREF_KEY,JSON.stringify(p.themePreferences));document.documentElement.dataset.theme=p.themePreferences.theme==='dark'?'dark':'light';document.documentElement.dataset.palette=p.themePreferences.palette||'green';}const mode=document.querySelector('#theme-mode'),palette=document.querySelector('#color-palette');if(mode)mode.value=document.documentElement.dataset.theme;if(palette)palette.value=document.documentElement.dataset.palette;
        save();render();document.querySelector('#import-modal').classList.remove('open');alert('Backup restaurado neste navegador.');return;
      }
      const items=Array.isArray(p)?p:p.questions;if(!Array.isArray(items))throw Error('O arquivo não contém um backup nem uma lista de questões.');
      let n=0;for(const q of items){if(!q.subject||!q.text||!Array.isArray(q.options)||q.answer===undefined)continue;data.questions.push({...q,id:q.id||'import-'+crypto.randomUUID()});n++;}
      if(!n)throw Error('Não encontrei questões válidas.');save();renderBank();document.querySelector('#import-modal').classList.remove('open');alert(`${n} questões importadas.`);
    }catch(e){alert('Não foi possível importar: '+e.message);}
  };

  // Add optional option-by-option notes to user-created questions.
  const form=document.querySelector('#question-form');
  const expField=form?.querySelector('[name="explanation"]');
  if(form&&expField&&!form.querySelector('[name="optionExplanations"]')){
    expField.parentElement.insertAdjacentHTML('beforebegin','<div class="field full"><label>Comentário por alternativa (opcional; um por linha, na ordem A, B, C, D, E)</label><textarea name="optionExplanations" placeholder="A) Por que está certa ou errada...\nB) ..."></textarea></div>');
    const oldSubmit=form.onsubmit;
    form.onsubmit=e=>{const notes=String(new FormData(form).get('optionExplanations')||'').split(/\r?\n/).map(x=>x.replace(/^[A-E][).:-]\s*/i,'').trim());oldSubmit(e);const q=data.questions[data.questions.length-1];if(q&&!q.examId&&notes.some(Boolean)){q.optionExplanations=notes;save();renderBank();}};
  }

  function reminderCheck(){
    const p=data.studyPrefs;if(!p.reminderEnabled||!p.reminderTime||!('Notification' in window)||Notification.permission!=='granted')return;
    const d=new Date(),key=dayKey(d),time=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    if(time>=p.reminderTime&&p.remindedOn!==key){new Notification('Hora da sua sessão de estudo CRC',{body:`Sua meta de hoje é ${p.goalMinutes} minutos.`});p.remindedOn=key;persistOnly();}
  }
  setInterval(()=>{
    if(document.visibilityState==='visible'){
      const key=dayKey();data.studyMinutesByDay[key]=Number(data.studyMinutesByDay[key]||0)+1;persistOnly();goalStats();
    }
    reminderCheck();
  },60000);
  document.addEventListener('visibilitychange',reminderCheck);
  reminderCheck();

  // Make a missed answer due tomorrow; a correct review spaces it farther out.
  renderReview();renderSchedule();
})();





