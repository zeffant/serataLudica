(() => {
"use strict";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const state={client:null,session:null,players:[],currentPlayer:null,isAdmin:false,activeTab:"votes",weekStart:startWeek(new Date()),realtime:null,selectedBggGame:null,selectedResultBggGame:null,selectedLibraryBggGame:null,imageRequests:new Set(),libraryGames:[],closeYearReport:null,closeYearBusy:false};
const choices={yes:["Sì","S"],maybe:["Forse","F"],no:["No","N"]};
const longFmt=new Intl.DateTimeFormat("it-IT",{weekday:"long",day:"numeric",month:"long"}), shortFmt=new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"2-digit"}), histFmt=new Intl.DateTimeFormat("it-IT",{day:"numeric",month:"long",year:"numeric"});
document.addEventListener("DOMContentLoaded",init);
async function init(){bind();weekUi();try{const c=window.SERATA_LUDICA_CONFIG;if(!c?.SUPABASE_URL||!c?.SUPABASE_ANON_KEY)throw Error("Configurazione incompleta");state.client=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});window.serataLudicaSupabase=state.client;await session();await base();await suggestNextWeekFromHistory();weekUi();{const d=new Date(state.weekStart);d.setDate(d.getDate()+5);$("#result-date").value=iso(d);}subscribe();await loadTab();}catch(e){toast(errText(e),true);}finally{$("#loading").classList.add("hidden");$("#app").setAttribute("aria-busy","false");}}
function bind(){$$("[data-tab]").forEach(b=>b.onclick=()=>openTab(b.dataset.tab));$("#go-to-player").onclick=()=>openTab("players");$("#refresh-button").onclick=async()=>{await base();await loadTab();};$("#previous-week").onclick=()=>shift(-7);$("#next-week").onclick=()=>shift(7);$("#current-week").onclick=()=>setWeek(new Date());$("#week-input").onchange=e=>{const d=weekMonday(e.target.value);if(d)setWeek(d)};$("#claim-player-button").onclick=claim;$("#proposal-form").onsubmit=proposal;prepareBggAutocomplete();setupBggAutocomplete("#library-title", null, "bgg-suggestions-library", "selectedLibraryBggGame");$("#library-form").onsubmit=addLibraryGame;$("#library-filter-players").onchange=renderLibrary;$("#library-filter-length").onchange=renderLibrary;$("#result-form").onsubmit=record;$("#admin-login-form").onsubmit=adminLogin;$("#admin-logout").onclick=adminLogout;$("#add-player-form").onsubmit=addPlayer;$("#close-year-report").onclick=generateYearReport;$("#close-year-reset").onclick=confirmYearReset;}
async function session(){let r=await state.client.auth.getSession();if(r.error)throw r.error;state.session=r.data.session;if(!state.session){r=await state.client.auth.signInAnonymously();if(r.error)throw r.error;state.session=r.data.session;}return state.session;}
async function base(){await Promise.all([players(),currentPlayer(),adminState()]);renderPlayer();renderAdmin();}
async function players(){const r=await state.client.from("players").select("id,name,active").order("name");if(r.error)throw r.error;state.players=r.data||[];}
async function currentPlayer(){const u=(await session()).user.id,r=await state.client.from("app_user_players").select("user_id,players(id,name,active)").eq("user_id",u).limit(1);if(r.error)throw r.error;state.currentPlayer=r.data?.[0]?.players||null;}
async function adminState(){const r=await state.client.rpc("is_admin");if(r.error)throw r.error;state.isAdmin=r.data===true;}
function renderPlayer(){const active=state.players.filter(p=>p.active),sel=$("#player-select");$("#current-player-name").textContent=state.currentPlayer?.name||"Nessuno";sel.innerHTML='<option value="">Scegli…</option>'+active.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");if(state.currentPlayer){sel.value=state.currentPlayer.id;sel.disabled=true;$("#claim-player-button").disabled=true;}else{sel.disabled=false;$("#claim-player-button").disabled=false;}fillResult();}
function renderAdmin(){$("#library-admin-panel").classList.toggle("hidden",!state.isAdmin);$("#admin-login-panel").classList.toggle("hidden",state.isAdmin);$("#admin-player-panel").classList.toggle("hidden",!state.isAdmin);$("#result-admin-panel").classList.toggle("hidden",!state.isAdmin);if(state.isAdmin&&state.activeTab==="players")adminPlayers();}
async function claim(){const id=$("#player-select").value;if(!id)return toast("Scegli un giocatore",true);const r=await state.client.rpc("claim_player",{p_player_id:id});if(r.error)return toast(errText(r.error),true);await currentPlayer();renderPlayer();toast("Giocatore associato");}
async function openTab(t){state.activeTab=t;$$('[data-tab]').forEach(b=>b.classList.toggle("active",b.dataset.tab===t));$$('[data-tab-panel]').forEach(p=>p.hidden=p.dataset.tabPanel!==t);await loadTab();}
async function loadTab(){try{if(state.activeTab==="votes")await loadVotes();if(state.activeTab==="summary")await summary();if(state.activeTab==="games")await proposals();if(state.activeTab==="library")await loadLibrary();if(state.activeTab==="ranking")await ranking();if(state.activeTab==="history")await history();if(state.activeTab==="players"&&state.isAdmin)await adminPlayers();}catch(e){toast(errText(e),true);}}
async function loadVotes(){let data=[];if(state.currentPlayer){const r=await state.client.from("votes").select("vote_date,choice").eq("week_start",iso(state.weekStart)).eq("player_id",state.currentPlayer.id);if(r.error)throw r.error;data=r.data||[];}const map=new Map(data.map(x=>[x.vote_date,x.choice]));$("#vote-days").innerHTML=dates().map(d=>{const k=iso(d),v=map.get(k);return `<article class="day-card"><div><span class="day-name">${esc(longFmt.format(d).split(" ")[0])}</span> <span class="day-date">${shortFmt.format(d)}</span></div><div class="vote-options">${Object.entries(choices).map(([c,m])=>`<button class="vote-button ${v===c?'selected':''}" data-date="${k}" data-choice="${c}" ${state.currentPlayer?'':'disabled'}>${m[0]}</button>`).join("")}</div></article>`}).join("");$$('[data-date]').forEach(b=>b.onclick=()=>saveVote(b.dataset.date,b.dataset.choice));}
async function saveVote(d,c){const r=await state.client.from("votes").upsert({week_start:iso(state.weekStart),vote_date:d,player_id:state.currentPlayer.id,choice:c},{onConflict:"vote_date,player_id"});if(r.error)return toast(errText(r.error),true);await loadVotes();}
async function summary(){const [vr,pr]=await Promise.all([state.client.from("votes").select("vote_date,choice,player_id").eq("week_start",iso(state.weekStart)),state.client.from("players").select("id,name,active").order("name")]);if(vr.error)throw vr.error;if(pr.error)throw pr.error;const vs=vr.data||[],map=new Map(vs.map(v=>[`${v.player_id}:${v.vote_date}`,v.choice])),ds=dates(),used=new Set(vs.map(v=>v.player_id)),ps=(pr.data||[]).filter(p=>p.active||used.has(p.id));$("#summary-content").innerHTML=`<div class="table-card"><table><thead><tr><th>Giocatore</th>${ds.map(d=>`<th>${longFmt.format(d).slice(0,3)}<br>${shortFmt.format(d)}</th>`).join("")}</tr></thead><tbody>${ps.map(p=>`<tr><td>${esc(p.name)}</td>${ds.map(d=>{const v=map.get(`${p.id}:${iso(d)}`);return `<td><span class="vote-badge ${v||'empty'}">${v?choices[v][1]:'—'}</span></td>`}).join("")}</tr>`).join("")}</tbody></table></div>`;}
const libraryLength={regular:{label:"🎲 Partita Sprint",short:"Regular"},long:{label:"🌙 Serata Lunga",short:"Long"},xtreme:{label:"🔥 Impresa Epica",short:"Xtreme"}};
async function suggestNextWeekFromHistory(){
  const r=await state.client.from("game_history").select("played_on").not("played_on","is",null).order("played_on",{ascending:false}).limit(1);
  if(r.error){console.warn("Impossibile calcolare la settimana dalla cronologia",r.error);return;}
  if(r.data?.length){const last=fromIso(r.data[0].played_on);const next=startWeek(last);next.setDate(next.getDate()+7);state.weekStart=next;}
  else state.weekStart=startWeek(new Date());
}
async function loadLibrary(){
  const r=await state.client.from("available_games").select("id,bgg_id,ideal_players,game_length,created_at,bgg_games(bgg_id,game_name,rank,year_published,average_rating,users_rated,bgg_url,thumbnail_url,image_url)").order("game_name", { referencedTable: "bgg_games", ascending: true });
  if(r.error)throw r.error;
  state.libraryGames=r.data||[];renderLibrary();
}
function renderLibrary(){
  const target=$("#library-list");if(!target)return;
  const pf=$("#library-filter-players")?.value||"all",lf=$("#library-filter-length")?.value||"all";
  const rows=(state.libraryGames||[]).filter(x=>(pf==="all"||(Array.isArray(x.ideal_players)?x.ideal_players:[x.ideal_players]).includes(pf))&&(lf==="all"||x.game_length===lf));
  if(!rows.length){target.innerHTML='<div class="empty-state">Nessun gioco trovato con questi filtri.</div>';return;}
  target.innerHTML=rows.map(x=>{const g=x.bgg_games||{},img=g.thumbnail_url||g.image_url,pl=(Array.isArray(x.ideal_players)?x.ideal_players:[x.ideal_players]).map(v=>v==="gt5"?">5":v).join(", ")+" giocatori",len=libraryLength[x.game_length]||libraryLength.regular;const bgg=g.bgg_url||`https://boardgamegeek.com/boardgame/${x.bgg_id}`;return `<article class="list-card library-card">${img?`<img class="game-thumb" src="${attr(img)}" alt="Copertina di ${attr(g.game_name||'gioco')}" loading="lazy">`:'<div class="game-placeholder">🎲</div>'}<div class="library-card-content"><h3>${esc(g.game_name||"Gioco BGG "+x.bgg_id)}</h3><div class="library-tags"><span class="pill">👥 ${pl}</span><span class="pill length-${x.game_length}">${len.label}</span></div>${g.average_rating?`<p class="meta">⭐ ${Number(g.average_rating).toFixed(1)} · ${g.year_published||"Anno n/d"}</p>`:""}<p><a href="${attr(bgg)}" target="_blank" rel="noopener noreferrer">Scheda BoardGameGeek ↗</a></p><button type="button" class="primary-button propose-library-button" data-library-id="${x.id}" ${state.currentPlayer?.active?"":"disabled"}>Proponi per ${esc(weekRangeLabel())}</button>${state.isAdmin?`<button type="button" class="danger-button library-remove" data-library-remove="${x.id}">Rimuovi dal Kallax</button>`:""}</div></article>`}).join("");
  $$('[data-library-id]').forEach(b=>b.onclick=()=>proposeLibraryGame(b.dataset.libraryId));
  $$('[data-library-remove]').forEach(b=>b.onclick=()=>removeLibraryGame(b.dataset.libraryRemove));
}
function weekRangeLabel(){const ds=dates();return `${shortFmt.format(ds[0])}–${shortFmt.format(ds[6])}`;}
async function addLibraryGame(e){
  e.preventDefault();if(!state.isAdmin)return toast("Solo l'amministratore può aggiungere giochi",true);
  const game=state.selectedLibraryBggGame,title=$("#library-title").value.trim();
  if(!game?.bgg_id||game.game_name.toLocaleLowerCase("it-IT")!==title.toLocaleLowerCase("it-IT"))return toast("Seleziona il gioco dai suggerimenti BoardGameGeek",true);
  const idealPlayers=$$('input[name="library-players"]:checked').map(el=>el.value);
  if(!idealPlayers.length)return toast("Seleziona almeno un numero ideale di giocatori",true);
  const row={bgg_id:game.bgg_id,ideal_players:idealPlayers,game_length:$("#library-length").value,created_by:state.session?.user?.id||null};
  const r=await state.client.from("available_games").insert(row);if(r.error){if(r.code==="23505")return toast("Questo gioco è già presente nel Kallax",true);return toast(errText(r.error),true);}
  e.target.reset();state.selectedLibraryBggGame=null;const box=$("#bgg-suggestions-library");if(box){box.innerHTML="";box.classList.add("hidden")}await loadLibrary();toast("Gioco aggiunto al Kallax!");
}
async function proposeLibraryGame(id){
  if(!state.currentPlayer?.active)return toast("Seleziona prima il tuo giocatore",true);
  const x=(state.libraryGames||[]).find(g=>g.id===id);if(!x)return;
  const g=x.bgg_games||{},title=g.game_name||"Gioco BGG "+x.bgg_id;
  const existing=await state.client.from("game_proposals").select("id").eq("week_start",iso(state.weekStart)).eq("bgg_id",x.bgg_id).limit(1);
  if(existing.error)return toast(errText(existing.error),true);
  if(existing.data?.length)return toast("Questo gioco è già stato proposto per la settimana selezionata",true);
  const r=await state.client.from("game_proposals").insert({week_start:iso(state.weekStart),title,bgg_id:x.bgg_id,bgg_url:g.bgg_url||`https://boardgamegeek.com/boardgame/${x.bgg_id}`,notes:`Dal Kallax · ${libraryLength[x.game_length]?.short||"Regular"} · Ideale per ${(Array.isArray(x.ideal_players)?x.ideal_players:[x.ideal_players]).map(v=>v==="gt5"?">5":v).join(", ")} giocatori`,proposed_by_player_id:state.currentPlayer.id});
  if(r.error)return toast(errText(r.error),true);
  toast(`Proposta aggiunta per la settimana ${weekRangeLabel()}`);await openTab("games");
}
async function removeLibraryGame(id){if(!state.isAdmin||!confirm("Rimuovere questo gioco dal Kallax? Lo storico e le proposte già create non verranno eliminati."))return;const r=await state.client.from("available_games").delete().eq("id",id);if(r.error)return toast(errText(r.error),true);await loadLibrary();toast("Gioco rimosso dal Kallax");}

async function proposal(e){
  e.preventDefault();
  if(!state.currentPlayer?.active)return toast("Seleziona prima il tuo giocatore",true);

  const title=$("#proposal-title").value.trim();
  const manualUrl=$("#proposal-url").value.trim();
  const notes=$("#proposal-notes").value.trim();
  if(!title)return toast("Inserisci il nome del gioco",true);

  let game=state.selectedBggGame?.game_name?.toLowerCase()===title.toLowerCase()
    ? state.selectedBggGame
    : await findBggGame(title);

  if(game)game=await ensureBggImage(game);

  const bggUrl=manualUrl||game?.bgg_url||(
    game?.bgg_id
      ? `https://boardgamegeek.com/boardgame/${game.bgg_id}`
      : `https://boardgamegeek.com/geeksearch.php?q=${encodeURIComponent(title)}`
  );

  const r=await state.client.from("game_proposals").insert({
    week_start:iso(state.weekStart),
    title,
    bgg_id:game?.bgg_id??null,
    bgg_url:bggUrl,
    notes:notes||null,
    proposed_by_player_id:state.currentPlayer.id
  });
  if(r.error)return toast(errText(r.error),true);

  e.target.reset();
  state.selectedBggGame=null;
  const box=$("#bgg-suggestions-mobile");
  if(box){box.innerHTML="";box.classList.add("hidden")}
  await proposals();
  toast(game?"Gioco proposto con dati BoardGameGeek associati":"Gioco proposto");
}
function prepareBggAutocomplete(){
  setupBggAutocomplete("#proposal-title", "#proposal-url", "bgg-suggestions-proposal", "selectedBggGame");
  setupBggAutocomplete("#result-game", "#result-url", "bgg-suggestions-result", "selectedResultBggGame");
}
function setupBggAutocomplete(inputSelector, urlSelector, boxId, stateKey){
  const input=$(inputSelector),url=$(urlSelector);if(!input)return;
  input.setAttribute("autocomplete","off");input.setAttribute("enterkeyhint","search");
  let box=$("#"+boxId);if(!box){box=document.createElement("div");box.id=boxId;box.className="bgg-suggestions hidden";box.setAttribute("role","listbox");input.insertAdjacentElement("afterend",box)}
  let timer;input.addEventListener("input",()=>{state[stateKey]=null;clearTimeout(timer);timer=setTimeout(()=>loadBggSuggestions(input.value,input,url,box,stateKey),250)});
  input.addEventListener("blur",()=>setTimeout(()=>box.classList.add("hidden"),180));
  input.addEventListener("focus",()=>{if(box.children.length)box.classList.remove("hidden")});
}
async function loadBggSuggestions(term,input,url,box,stateKey){
  const q=String(term||"").trim();
  if(!box||q.length<2){if(box){box.innerHTML="";box.classList.add("hidden")}return;}
  const r=await state.client.from("bgg_games")
    .select("bgg_id,game_name,rank,year_published,average_rating,users_rated,bgg_url,thumbnail_url,image_url")
    .ilike("game_name",`%${q}%`).not("bgg_id","is",null)
    .order("rank",{ascending:true,nullsFirst:false}).limit(12);
  if(r.error){console.warn("Autocomplete BGG",r.error);box.classList.add("hidden");return;}
  const games=r.data||[];
  box.innerHTML=games.map((g,i)=>`<button type="button" class="bgg-suggestion" data-bgg-index="${i}"><strong>${esc(g.game_name)}</strong><span>${g.rank?`#${g.rank} · `:""}${g.year_published||""}${g.average_rating?` · ⭐ ${Number(g.average_rating).toFixed(1)}`:""}</span></button>`).join("");
  box.classList.toggle("hidden",!games.length);
  box.querySelectorAll("[data-bgg-index]").forEach(button=>button.addEventListener("pointerdown",async event=>{
    event.preventDefault();
    let game=games[Number(button.dataset.bggIndex)];
    input.value=game.game_name;
    if(url)url.value=game.bgg_url||`https://boardgamegeek.com/boardgame/${game.bgg_id}`;
    box.classList.add("hidden");
    state[stateKey]=game;
    game=await ensureBggImage(game);
    state[stateKey]=game;
  }));
}
async function ensureBggImage(game){
  if(!game?.bgg_id||game.thumbnail_url||game.image_url)return game;
  if(state.imageRequests.has(game.bgg_id))return game;

  state.imageRequests.add(game.bgg_id);
  let completed=false;

  try{
    const {data,error}=await state.client.functions.invoke("fetch-bgg-image",{
      body:{bgg_id:game.bgg_id}
    });

    if(error)throw error;
    if(data?.error)throw new Error(data.error);

    const refreshed=await state.client.from("bgg_games")
      .select("bgg_id,game_name,rank,year_published,average_rating,users_rated,bgg_url,thumbnail_url,image_url")
      .eq("bgg_id",game.bgg_id)
      .maybeSingle();

    if(refreshed.error)throw refreshed.error;
    if(refreshed.data){
      Object.assign(game,refreshed.data);
      completed=Boolean(game.thumbnail_url||game.image_url);
      return game;
    }
  }catch(error){
    console.warn(`Errore recupero immagine BGG ${game.bgg_id}:`,error);
  }finally{
    if(!completed)state.imageRequests.delete(game.bgg_id);
  }

  return game;
}
async function findBggGame(name){

  const r = await state.client
    .from("bgg_games")
    .select(`
      bgg_id,
      game_name,
      rank,
      year_published,
      average_rating,
      users_rated,
      bgg_url,
      thumbnail_url,
      image_url
    `)
    .ilike("game_name", String(name).trim())
    .not("bgg_id", "is", null)
    .order("rank", {
      ascending: true,
      nullsFirst: false
    })
    .limit(1);

  const game =
    r.error
      ? null
      : r.data?.[0] || null;

  if (!game) {
    return null;
  }

  return await ensureBggImage(game);
}
function inputValue(selector,value){const el=$(selector);if(el)el.value=value||""}
async function proposals(){
  const [proposalResponse,voteResponse]=await Promise.all([
    state.client.from("game_proposals")
      .select("id,title,bgg_id,bgg_url,notes,created_by,created_at,players(name),bgg_games(game_name,rank,year_published,average_rating,users_rated,thumbnail_url,image_url)")
      .eq("week_start",iso(state.weekStart))
      .order("created_at",{ascending:true}),
    state.client.from("game_proposal_votes")
      .select("proposal_id,player_id")
      .eq("week_start",iso(state.weekStart))
  ]);
  if(proposalResponse.error)throw proposalResponse.error;
  if(voteResponse.error)throw voteResponse.error;

  const rows=proposalResponse.data||[];

  let imagesUpdated=false;
  for(const row of rows){
    const game=row.bgg_games;
    if(row.bgg_id&&game&&!game.thumbnail_url&&!game.image_url){
      const refreshed=await ensureBggImage({...game,bgg_id:row.bgg_id});
      if(refreshed.thumbnail_url||refreshed.image_url){
        row.bgg_games={...game,...refreshed};
        imagesUpdated=true;
      }
    }
  }
  const votes=voteResponse.data||[];
  const target=$("#proposal-list");
  if(!rows.length){target.innerHTML='<div class="empty-state">Nessuna proposta.</div>';return;}

  const totals=new Map();
  votes.forEach(v=>totals.set(v.proposal_id,(totals.get(v.proposal_id)||0)+1));
  const currentVote=state.currentPlayer?votes.find(v=>v.player_id===state.currentPlayer.id)?.proposal_id:null;
  rows.sort((a,b)=>(totals.get(b.id)||0)-(totals.get(a.id)||0)||new Date(a.created_at)-new Date(b.created_at));

  target.innerHTML=rows.map(x=>{
    const g=x.bgg_games;
    const img=g?.thumbnail_url||g?.image_url;
    const selected=currentVote===x.id;
    const voteCount=totals.get(x.id)||0;
    const canDelete=state.isAdmin||x.created_by===state.session?.user?.id;
    return `<article class="list-card game-proposal-card ${img?"has-image":"no-image"}">
      ${img?`<div class="game-visual"><img class="game-thumb" src="${attr(img)}" alt="Copertina di ${attr(x.title)}" loading="lazy"></div>`:""}
      <div class="game-content">
        <div class="list-card-header">
          <div><h3>${esc(x.title)}</h3><div class="meta">Proposto da ${esc(x.players?.name||"")}</div></div>
          ${canDelete?`<button class="danger-button" type="button" data-delete-proposal="${x.id}">Rimuovi</button>`:""}
        </div>
        ${g?`<div class="bgg-stats"><span>⭐ ${g.average_rating?Number(g.average_rating).toFixed(1):"-"}</span><span>🏅 #${g.rank||"-"}</span><span>📅 ${g.year_published||"-"}</span></div>`:""}
        ${x.bgg_url?`<p><a href="${attr(x.bgg_url)}" target="_blank" rel="noopener noreferrer">BoardGameGeek ↗</a></p>`:""}
        ${x.notes?`<p class="notes">${esc(x.notes)}</p>`:""}
        <div class="proposal-vote-row">
          <button class="${selected?"primary-button":"secondary-button"}" type="button" data-vote-proposal="${x.id}" ${state.currentPlayer?.active?"":"disabled"}>${selected?"✓ Votato":"Vota questo gioco"}</button>
          <strong>${voteCount} ${voteCount===1?"voto":"voti"}</strong>
        </div>
      </div>
    </article>`;
  }).join("");

  $$('[data-vote-proposal]').forEach(button=>button.addEventListener("click",()=>voteProposal(button.dataset.voteProposal)));
  $$('[data-delete-proposal]').forEach(button=>button.addEventListener("click",()=>deleteProposal(button.dataset.deleteProposal)));
}

async function voteProposal(proposalId){
  if(!state.currentPlayer?.active)return toast("Seleziona prima il tuo giocatore",true);
  const buttons=$$('[data-vote-proposal]');
  buttons.forEach(button=>{button.disabled=true});
  try{
    const r=await state.client.from("game_proposal_votes").upsert({
      week_start:iso(state.weekStart),
      proposal_id:proposalId,
      player_id:state.currentPlayer.id
    },{onConflict:"week_start,player_id"});
    if(r.error)throw r.error;
    toast("Voto del gioco salvato");
    await proposals();
  }catch(error){
    toast(errText(error),true);
    buttons.forEach(button=>{button.disabled=false});
  }
}

async function deleteProposal(id){
  if(!confirm("Rimuovere questa proposta?"))return;
  const r=await state.client.from("game_proposals").delete().eq("id",id);
  if(r.error)return toast(errText(r.error),true);
  toast("Proposta rimossa");
  await proposals();
}

async function ranking(){
  const [playersResult, proposalsResult, historyResult]=await Promise.all([
    state.client.from("standings").select("player_name,wins,last_places,other_placements,presences,win_rate").order("wins",{ascending:false}).order("win_rate",{ascending:false}),
    state.client.from("game_proposals").select("title,bgg_id,bgg_games(game_name)"),
    state.client.from("game_history").select("game_name,bgg_url")
  ]);
  if(playersResult.error)throw playersResult.error;
  if(proposalsResult.error)throw proposalsResult.error;
  if(historyResult.error)throw historyResult.error;
  $("#ranking-content").innerHTML=`<table class="ranking-table"><thead><tr><th>#</th><th>Giocatore</th><th>Vittorie</th><th>Ultimi</th><th>Altri</th><th>Presenze</th><th>Win rate</th></tr></thead><tbody>${(playersResult.data||[]).map((x,i)=>`<tr><td>${i+1}</td><td><strong>${esc(x.player_name)}</strong></td><td>${x.wins}</td><td>${x.last_places}</td><td>${x.other_placements}</td><td>${x.presences}</td><td><strong>${Number(x.win_rate||0).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})}%</strong></td></tr>`).join("")}</tbody></table>`;

  const normalizeName=value=>String(value||"").trim().toLocaleLowerCase("it-IT").replace(/\s+/g," ");
  const extractBggId=url=>{const m=String(url||"").match(/boardgame\/(\d+)/i);return m?m[1]:null};
  const keyFor=(id,name)=>id?`bgg:${id}`:`name:${normalizeName(name)}`;
  const games=new Map();
  for(const row of proposalsResult.data||[]){
    const name=row.bgg_games?.game_name||row.title||"Gioco senza nome";
    const key=keyFor(row.bgg_id,name);
    if(!games.has(key))games.set(key,{name,proposed:0,chosen:0,bggId:row.bgg_id||null});
    games.get(key).proposed++;
  }
  for(const row of historyResult.data||[]){
    const id=extractBggId(row.bgg_url);
    const key=keyFor(id,row.game_name);
    let game=games.get(key);
    if(!game){
      const sameName=[...games.values()].find(g=>normalizeName(g.name)===normalizeName(row.game_name));
      if(sameName)game=sameName;
      else {game={name:row.game_name||"Gioco senza nome",proposed:0,chosen:0,bggId:id};games.set(key,game);}
    }
    game.chosen++;
  }
  const sorted=[...games.values()].sort((a,b)=>b.chosen-a.chosen||b.proposed-a.proposed||a.name.localeCompare(b.name,"it"));
  $("#ranking-games-content").innerHTML=sorted.length?`<table class="ranking-table game-ranking-table"><thead><tr><th>#</th><th>Gioco</th><th>Proposto</th><th>Scelto</th></tr></thead><tbody>${sorted.map((g,i)=>`<tr><td>${i+1}</td><td>${g.bggId?`<a href="https://boardgamegeek.com/boardgame/${attr(g.bggId)}" target="_blank" rel="noopener noreferrer">${esc(g.name)} ↗</a>`:esc(g.name)}</td><td>${g.proposed}</td><td><strong>${g.chosen}</strong></td></tr>`).join("")}</tbody></table>`:'<div class="empty-state">Non ci sono ancora proposte o giochi nello storico.</div>';
}
function fillResult(){const a=state.players.filter(p=>p.active),opts='<option value="">Scegli…</option>'+a.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");$("#result-winner").innerHTML=opts;$("#result-last").innerHTML=opts;$("#result-participants").innerHTML=a.map(p=>`<label class="participant-option"><input type="checkbox" name="participant" value="${p.id}"><span>${esc(p.name)}</span></label>`).join("");if(!$("#result-date").value){const d=new Date(state.weekStart);d.setDate(d.getDate()+5);$("#result-date").value=iso(d);}}
async function record(e){
  e.preventDefault();
  const participantIds=$$('[name="participant"]:checked').map(x=>x.value),winner=$("#result-winner").value,last=$("#result-last").value;
  if(participantIds.length<2)return toast("Seleziona almeno due partecipanti",true);
  if(!winner||!last)return toast("Seleziona vincitore e ultimo classificato",true);
  if(winner===last)return toast("Vincitore e ultimo devono essere diversi",true);
  if(!participantIds.includes(winner)||!participantIds.includes(last))return toast("Vincitore e ultimo devono essere partecipanti",true);
  const title=$("#result-game").value.trim();
  let game=state.selectedResultBggGame?.game_name?.toLocaleLowerCase("it-IT")===title.toLocaleLowerCase("it-IT")?state.selectedResultBggGame:await findBggGame(title);
  const manualUrl=$("#result-url").value.trim();
  const bggUrl=manualUrl||game?.bgg_url||(game?.bgg_id?`https://boardgamegeek.com/boardgame/${game.bgg_id}`:null);
  const r=await state.client.rpc("admin_create_game_result",{p_played_on:$("#result-date").value,p_game_name:title,p_bgg_url:bggUrl,p_notes:$("#result-notes").value.trim()||null,p_winner_player_id:winner,p_last_player_id:last,p_participant_ids:participantIds});
  if(r.error)return toast(errText(r.error),true);
  e.target.reset();state.selectedResultBggGame=null;fillResult();
  const box=$("#bgg-suggestions-result");if(box){box.innerHTML="";box.classList.add("hidden")}
  await Promise.all([history(),ranking()]);toast(game?"Risultato registrato con gioco BGG associato":"Risultato registrato");
}
async function history(){
  const r=await state.client.from("game_history")
    .select("id,played_on,game_name,bgg_url,notes,winner_name,last_name,participants,created_at")
    .order("played_on",{ascending:false})
    .order("created_at",{ascending:false});
  if(r.error)throw r.error;
  const rows=r.data||[];
  if(!rows.length){$("#history-list").innerHTML='<div class="empty-state">Lo storico è vuoto.</div>';return;}

  // Risolve i giochi già presenti nello storico tramite ID BGG nel link o titolo esatto.
  const ids=[...new Set(rows.map(x=>{const m=String(x.bgg_url||"").match(/boardgame\/(\d+)/i);return m?.[1]||null}).filter(Boolean))];
  const names=[...new Set(rows.map(x=>String(x.game_name||"").trim()).filter(Boolean))];
  let bggGames=[];
  if(ids.length){const byId=await state.client.from("bgg_games").select("bgg_id,game_name,rank,year_published,average_rating,users_rated,bgg_url,thumbnail_url,image_url").in("bgg_id",ids);if(!byId.error)bggGames.push(...(byId.data||[]));}
  if(names.length){const byName=await state.client.from("bgg_games").select("bgg_id,game_name,rank,year_published,average_rating,users_rated,bgg_url,thumbnail_url,image_url").in("game_name",names).not("bgg_id","is",null);if(!byName.error)bggGames.push(...(byName.data||[]));}
  const byId=new Map(bggGames.map(g=>[String(g.bgg_id),g]));
  const byName=new Map(bggGames.map(g=>[String(g.game_name||"").trim().toLocaleLowerCase("it-IT"),g]));
  for(const x of rows){
    const match=String(x.bgg_url||"").match(/boardgame\/(\d+)/i);
    let game=(match&&byId.get(match[1]))||byName.get(String(x.game_name||"").trim().toLocaleLowerCase("it-IT"));
    if(!game){game=await findBggGame(x.game_name);if(game){bggGames.push(game);byId.set(String(game.bgg_id),game);byName.set(String(game.game_name||"").trim().toLocaleLowerCase("it-IT"),game);}}
    if(game?.bgg_id&&!game.thumbnail_url&&!game.image_url)game=await ensureBggImage(game);
    x._bgg=game||null;
  }

  $("#history-list").innerHTML=rows.map(x=>{
    const ps=normalizzaPartecipanti(x.participants,x.winner_name,x.last_name),g=x._bgg,img=g?.thumbnail_url||g?.image_url;
    const bggUrl=x.bgg_url||g?.bgg_url||(g?.bgg_id?`https://boardgamegeek.com/boardgame/${g.bgg_id}`:null);
    return `<article class="list-card history-game-card ${img?'has-image':'no-image'}">
      ${img?`<div class="game-visual"><img class="game-thumb" src="${attr(img)}" alt="Copertina di ${attr(x.game_name)}" loading="lazy"></div>`:`<div class="game-visual"><div class="game-placeholder" aria-label="Copertina non disponibile">🎲</div></div>`}
      <div class="game-content"><div class="list-card-header"><div><h3>${esc(x.game_name)}</h3><div class="meta">${histFmt.format(fromIso(x.played_on))} · ${ps.length} ${ps.length===1?'presenza':'presenze'}</div></div>${state.isAdmin?`<button class="danger-button" data-del="${x.id}">Elimina</button>`:''}</div>
      ${g?`<div class="bgg-stats"><span>⭐ ${g.average_rating?Number(g.average_rating).toFixed(1):"-"}</span><span>🏅 #${g.rank||"-"}</span><span>📅 ${g.year_published||"-"}</span></div>`:""}
      ${bggUrl?`<p><a href="${attr(bggUrl)}" target="_blank" rel="noopener noreferrer">BoardGameGeek ↗</a></p>`:""}
      <div class="history-participants">${ps.map(p=>badgePartecipante(p)).join("")}</div>${x.notes?`<p class="notes">${esc(x.notes)}</p>`:""}</div>
    </article>`;
  }).join("");
  $$('[data-del]').forEach(b=>b.onclick=()=>delResult(b.dataset.del));
}
function normalizzaPartecipanti(value,winnerName,lastName){
  let list=value;
  if(typeof list==="string"){try{list=JSON.parse(list)}catch{list=[]}}
  if(!Array.isArray(list))list=[];
  const normalized=list.map(p=>({
    player_name:p?.player_name??p?.name??p?.players?.name??"Giocatore",
    placement_role:p?.placement_role??p?.role??"other"
  })).filter(p=>p.player_name);
  if(!normalized.length){
    if(winnerName)normalized.push({player_name:winnerName,placement_role:"winner"});
    if(lastName&&lastName!==winnerName)normalized.push({player_name:lastName,placement_role:"last"});
  }
  const order={winner:0,other:1,last:2};
  return normalized.sort((a,b)=>(order[a.placement_role]??1)-(order[b.placement_role]??1)||a.player_name.localeCompare(b.player_name,"it"));
}
function badgePartecipante(p){
  const role=["winner","other","last"].includes(p.placement_role)?p.placement_role:"other";
  const icon=role==="winner"?"🏆":role==="last"?"🔻":"•";
  return `<span class="participant-badge ${role}">${icon} ${esc(p.player_name)}</span>`;
}
async function delResult(id){if(!confirm("Eliminare il risultato?"))return;const r=await state.client.from("game_results").delete().eq("id",id);if(r.error)return toast(errText(r.error),true);await Promise.all([history(),ranking()]);}
async function fetchAllRows(table, columns, orderColumn){
  const pageSize=1000;let all=[],from=0;
  while(true){
    let query=state.client.from(table).select(columns);
    if(orderColumn)query=query.order(orderColumn,{ascending:true});
    const r=await query.range(from,from+pageSize-1);
    if(r.error)throw r.error;
    const batch=r.data||[];all.push(...batch);
    if(batch.length<pageSize)break;
    from+=pageSize;
  }
  return all;
}
function buildYearReport(data, year){
  const normalizeName=value=>String(value||"").trim().toLocaleLowerCase("it-IT").replace(/\s+/g," ");
  const extractBggId=url=>{const m=String(url||"").match(/boardgame\/(\d+)/i);return m?m[1]:null};
  const keyFor=(id,name)=>id?`bgg:${id}`:`name:${normalizeName(name)}`;
  const games=new Map();
  for(const row of data.proposals){const name=row.game_name||row.title||"Gioco senza nome",key=keyFor(row.bgg_id,name);if(!games.has(key))games.set(key,{name,proposed:0,chosen:0,bggId:row.bgg_id||null});games.get(key).proposed++;}
  for(const row of data.history){const id=extractBggId(row.bgg_url),key=keyFor(id,row.game_name);let game=games.get(key);if(!game){const same=[...games.values()].find(g=>normalizeName(g.name)===normalizeName(row.game_name));if(same)game=same;else{game={name:row.game_name||"Gioco senza nome",proposed:0,chosen:0,bggId:id};games.set(key,game);}}game.chosen++;}
  const sortedGames=[...games.values()].sort((a,b)=>b.chosen-a.chosen||b.proposed-a.proposed||a.name.localeCompare(b.name,"it"));
  const escH=v=>esc(v);
  const table=(headers, rows)=>`<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${escH(h)}</th>`).join("")}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(v=>`<td>${v==null?"—":v}</td>`).join("")}</tr>`).join(""):`<tr><td colspan="${headers.length}">Nessun dato disponibile</td></tr>`}</tbody></table></div>`;
  const playerRows=(data.standings||[]).map((x,i)=>[i+1,escH(x.player_name),x.wins??0,x.last_places??0,x.other_placements??0,x.presences??0,`${Number(x.win_rate||0).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})}%`]);
  const gameRows=sortedGames.map((g,i)=>[i+1,escH(g.name),g.proposed,g.chosen]);
  const historyRows=[...data.history].sort((a,b)=>String(b.played_on||"").localeCompare(String(a.played_on||""))).map(x=>{
    let ps=x.participants;if(typeof ps==="string"){try{ps=JSON.parse(ps)}catch{ps=[]}}if(!Array.isArray(ps))ps=[];
    const people=ps.map(p=>p?.player_name||p?.name||p?.players?.name).filter(Boolean).join(", ");
    return [escH(x.played_on||""),escH(x.game_name||""),x.bgg_url?`<a href="${attr(x.bgg_url)}">BGG</a>`:"—",escH(x.winner_name||""),escH(x.last_name||""),escH(people),escH(x.notes||"")];
  });
  const proposalRows=data.proposals.map(p=>[escH(p.week_start||""),escH(p.game_name||p.title||""),escH(p.proposed_by||""),p.votes||0,escH(p.bgg_url||"")]);
  const votesByProposal=new Map();for(const v of data.proposalVotes){votesByProposal.set(v.proposal_id,(votesByProposal.get(v.proposal_id)||0)+1)}
  // The proposal vote count is joined here, after the main data is safely fetched.
  const proposals=data.proposals.map(p=>({...p,votes:votesByProposal.get(p.id)||0}));
  const propRows=proposals.map(p=>[escH(p.week_start||""),escH(p.game_name||p.title||""),escH(p.proposed_by||""),p.votes, p.bgg_url?`<a href="${attr(p.bgg_url)}">BGG</a>`:"—"]);
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Serata Ludica — Archivio ${year}</title><style>
  :root{font-family:Arial,sans-serif;color:#172033;background:#f5f7fb}body{max-width:1200px;margin:0 auto;padding:28px}h1{color:#4338ca}h2{margin-top:34px;border-bottom:2px solid #dfe3ec;padding-bottom:8px}p{line-height:1.5}.meta{color:#667085}table{border-collapse:collapse;width:100%;background:white}th,td{border-bottom:1px solid #dfe3ec;padding:9px;text-align:left;vertical-align:top}th{background:#eef2ff}td{overflow-wrap:anywhere}.table-wrap{overflow-x:auto;margin:12px 0 24px}.note{padding:12px;border:1px solid #f5cf53;background:#fff7cc;border-radius:10px}@media print{body{max-width:none;padding:0;background:white}h2{break-after:avoid}tr{break-inside:avoid}.table-wrap{overflow:visible}a{color:inherit;text-decoration:none}}
  </style></head><body><h1>🎲 Serata Ludica — Archivio annuale ${year}</h1><p class="meta">Generato il ${escH(histFmt.format(new Date()))}. Questo report contiene tutti i dati di attività presenti nell'app al momento della generazione.</p><p class="note"><strong>Importante:</strong> conserva questo file prima di confermare l'azzeramento. Puoi stamparlo o scegliere “Salva come PDF” dal browser.</p><h2>Classifica giocatori</h2>${table(["#","Giocatore","Vittorie","Ultimi posti","Altri piazzamenti","Presenze","Win rate"],playerRows)}<h2>Classifica giochi</h2>${table(["#","Gioco","Proposto","Scelto"],gameRows)}<h2>Storico serate</h2>${table(["Data","Gioco","Link BGG","Vincitore","Ultimo classificato","Partecipanti","Note"],historyRows)}<h2>Giochi proposti</h2>${table(["Settimana","Gioco","Proposto da","Voti","Link BGG"],propRows)}<h2>Voti di disponibilità</h2>${table(["Data","Settimana","Giocatore","Voto"],data.votes.map(v=>[escH(v.vote_date||""),escH(v.week_start||""),escH(data.playerNames.get(v.player_id)||"Giocatore non disponibile"),escH(({yes:"Sì",maybe:"Forse",no:"No"})[v.choice]||v.choice||"")]))}<footer class="meta">Serata Ludica · archivio generato localmente dal browser</footer></body></html>`;
}
async function generateYearReport(){
  if(!state.isAdmin)return toast("Solo l'amministratore può chiudere l'anno",true);
  if(state.closeYearBusy)return;
  state.closeYearBusy=true;const btn=$("#close-year-report");btn.disabled=true;btn.textContent="Preparazione report…";
  try{
    const [standings,history,proposals,proposalVotes,votes,playersData]=await Promise.all([
      fetchAllRows("standings","player_name,wins,last_places,other_placements,presences,win_rate","player_name"),
      fetchAllRows("game_history","id,played_on,game_name,bgg_url,notes,winner_name,last_name,participants,created_at","played_on"),
      fetchAllRows("game_proposals","id,week_start,title,bgg_id,bgg_url,notes,proposed_by_player_id,created_at","created_at"),
      fetchAllRows("game_proposal_votes","proposal_id,player_id,week_start","week_start"),
      fetchAllRows("votes","week_start,vote_date,choice,player_id","vote_date"),
      fetchAllRows("players","id,name,active","name")
    ]);
    const names=new Map(playersData.map(p=>[p.id,p.name]));
    const proposalRows=proposals.map(p=>({...p,proposed_by:names.get(p.proposed_by_player_id)||"",game_name:p.title}));
    const data={standings,history,proposals:proposalRows,proposalVotes,votes,playerNames:names};
    const year=new Date().getFullYear();const report=buildYearReport(data,year);
    state.closeYearReport={report,year,createdAt:new Date().toISOString()};
    const blob=new Blob([report],{type:"text/html;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`serata-ludica-archivio-${year}.html`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    $("#close-year-reset").disabled=false;$("#close-year-reset").classList.remove("hidden");$("#close-year-confirm-hint").textContent="Report generato e download avviato. Verifica di aver conservato il file, poi conferma l'azzeramento.";
    toast("Report annuale generato");
  }catch(e){console.error(e);toast(`Impossibile generare il report: ${errText(e)}`,true)}
  finally{state.closeYearBusy=false;btn.disabled=false;btn.textContent="Genera e scarica report";}
}
async function confirmYearReset(){
  if(!state.isAdmin)return toast("Solo l'amministratore può chiudere l'anno",true);
  if(!state.closeYearReport)return toast("Genera prima il report annuale",true);
  const typed=prompt(`ATTENZIONE: verranno eliminati tutti i voti, le proposte e i risultati attualmente presenti. Giocatori e catalogo BGG resteranno.\n\nIl report scaricato è l'unica copia autonoma dello storico.\n\nPer confermare, scrivi CHIUDI ${state.closeYearReport.year}`);
  if(typed!==`CHIUDI ${state.closeYearReport.year}`) return toast("Chiusura annullata");
  const btn=$("#close-year-reset");btn.disabled=true;btn.textContent="Azzeramento in corso…";
  try{
    const r=await state.client.rpc("admin_close_year");if(r.error)throw r.error;
    state.closeYearReport=null;btn.classList.add("hidden");btn.disabled=true;$("#close-year-confirm-hint").textContent="";
    await base();await Promise.all([ranking(),history(),proposals(),summary()]);
    toast("Chiusura completata: attività azzerate, giocatori e catalogo conservati");
  }catch(e){console.error(e);toast(`Azzeramento non eseguito: ${errText(e)}. Nessun dato dovrebbe essere stato cancellato se la funzione SQL è transazionale.`,true)}
  finally{btn.disabled=false;btn.textContent="Conferma chiusura e azzera attività";}
}
async function adminLogin(e){e.preventDefault();const r=await state.client.rpc("admin_login",{p_pin:$("#admin-pin").value});if(r.error||!r.data)return toast("PIN non valido",true);state.isAdmin=true;renderAdmin();}
async function adminLogout(){await state.client.rpc("admin_logout");state.isAdmin=false;renderAdmin();}
async function addPlayer(e){e.preventDefault();const r=await state.client.from("players").insert({name:$("#new-player-name").value.trim()});if(r.error)return toast(errText(r.error),true);e.target.reset();await players();renderPlayer();await adminPlayers();}
async function adminPlayers(){
  const r=await state.client.rpc("admin_list_players");if(r.error)throw r.error;
  $("#admin-player-list").innerHTML=(r.data||[]).map(p=>`<article class="list-card"><div class="list-card-header"><div><h3>${esc(p.name)}</h3><span class="pill ${p.active?"active":""}">${p.active?"Attivo":"Archiviato"}</span> <span class="pill">${p.is_claimed?"Associato":"Libero"}</span></div><button class="secondary-button compact" data-toggle-player="${p.id}" data-next-active="${!p.active}">${p.active?"Archivia":"Riattiva"}</button></div>${p.is_claimed?`<p><button class="danger-button" data-release-player="${p.id}">Libera associazione</button></p>`:""}</article>`).join("");
  $$('[data-toggle-player]').forEach(b=>b.onclick=()=>togglePlayer(b.dataset.togglePlayer,b.dataset.nextActive==="true"));
  $$('[data-release-player]').forEach(b=>b.onclick=()=>releasePlayer(b.dataset.releasePlayer));
}
async function togglePlayer(id,active){const r=await state.client.from("players").update({active}).eq("id",id);if(r.error)return toast(errText(r.error),true);await players();renderPlayer();await adminPlayers();toast(active?"Giocatore riattivato":"Giocatore archiviato")}
async function releasePlayer(id){if(!confirm("Liberare l’associazione di questo giocatore?"))return;const r=await state.client.rpc("admin_release_player",{p_player_id:id});if(r.error)return toast(errText(r.error),true);if(state.currentPlayer?.id===id){state.currentPlayer=null;await currentPlayer()}renderPlayer();await adminPlayers();toast("Associazione liberata")}
function subscribe(){state.realtime=state.client.channel("live").on("postgres_changes",{event:"*",schema:"public",table:"game_results"},()=>loadTab()).on("postgres_changes",{event:"*",schema:"public",table:"game_result_participants"},()=>loadTab()).subscribe();}
function setWeek(d){state.weekStart=startWeek(d);weekUi();loadTab();}function shift(n){const d=new Date(state.weekStart);d.setDate(d.getDate()+n);setWeek(d)}function weekUi(){const ds=dates();$("#week-label").textContent=`${ds[0].getDate()} – ${histFmt.format(ds[6])}`;$("#week-input").value=weekValue(ds[0]);}function dates(){return Array.from({length:7},(_,i)=>{const d=new Date(state.weekStart);d.setDate(d.getDate()+i);return d})}function startWeek(x){const d=new Date(x);d.setHours(12,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d}function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}function fromIso(v){const [y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d,12)}function weekValue(d){const t=new Date(d);t.setDate(t.getDate()+3-((t.getDay()+6)%7));const w1=new Date(t.getFullYear(),0,4),w=1+Math.round(((t-w1)/86400000-3+((w1.getDay()+6)%7))/7);return `${t.getFullYear()}-W${String(w).padStart(2,'0')}`}function weekMonday(v){const m=/^(\d{4})-W(\d{2})$/.exec(v);if(!m)return null;const d=startWeek(new Date(+m[1],0,4,12));d.setDate(d.getDate()+(+m[2]-1)*7);return d}function toast(m,e=false){const x=$("#toast");x.textContent=m;x.classList.toggle("error",e);x.classList.add("show");setTimeout(()=>x.classList.remove("show"),4000)}function errText(e){return e?.message||String(e)}function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}function attr(v){return esc(v)}
})();
