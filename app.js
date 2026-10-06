/* Serata Ludica - GitHub Pages + Supabase */
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const state = {
    client: null,
    session: null,
    weekStart: toISODate(startOfWeek(new Date())),
    players: [],
    currentPlayer: null,
    isAdmin: false,
    activeTab: "votes",
    realtime: null,
    refreshTimer: null,
    selectedBggGame: null,
    imageRequests: new Set()
  };

  const choiceMeta = {
    yes: { label: "Sì", short: "S" },
    maybe: { label: "Forse", short: "F" },
    no: { label: "No", short: "N" }
  };

  const dateLong = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const dateShort = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit" });
  const dateHistory = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });
  const numberIt = new Intl.NumberFormat("it-IT");

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    prepareBggAutocomplete();
    updateWeekUi();

    const config = window.SERATA_LUDICA_CONFIG;
    if (!isValidConfig(config)) {
      $("#setup-banner")?.classList.remove("hidden");
      $("#loading")?.classList.add("hidden");
      $("#app")?.setAttribute("aria-busy", "false");
      renderUnavailable("Completa config.js prima di usare l'app.");
      return;
    }

    if (!window.supabase?.createClient) {
      fatal("Impossibile caricare la libreria Supabase.");
      return;
    }

    try {
      state.client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });

      const { data: sessionData, error: sessionError } = await state.client.auth.getSession();
      if (sessionError) throw sessionError;
      state.session = sessionData.session;
      if (!state.session) {
        const { data, error } = await state.client.auth.signInAnonymously();
        if (error) throw error;
        state.session = data.session;
      }

      state.client.auth.onAuthStateChange((_event, session) => { state.session = session; });
      await loadBaseData();
      subscribeRealtime();
      await loadActiveTab();
    } catch (error) {
      fatal(readableError(error));
    } finally {
      $("#loading")?.classList.add("hidden");
      $("#app")?.setAttribute("aria-busy", "false");
    }
  }

  function bindEvents() {
    $$('[data-tab]').forEach((button) => button.addEventListener("click", () => openTab(button.dataset.tab)));
    $("#go-to-player")?.addEventListener("click", () => openTab("players"));
    $("#refresh-button")?.addEventListener("click", refreshAll);
    $("#previous-week")?.addEventListener("click", () => shiftWeek(-7));
    $("#next-week")?.addEventListener("click", () => shiftWeek(7));
    $("#current-week")?.addEventListener("click", () => setWeek(startOfWeek(new Date())));
    $("#week-input")?.addEventListener("change", (event) => {
      const date = isoWeekToMonday(event.target.value);
      if (date) setWeek(date);
    });
    $("#claim-player-button")?.addEventListener("click", claimPlayer);
    $("#proposal-form")?.addEventListener("submit", submitProposal);
    $("#admin-login-form")?.addEventListener("submit", adminLogin);
    $("#admin-logout")?.addEventListener("click", adminLogout);
    $("#add-player-form")?.addEventListener("submit", addPlayer);
    $("#result-form")?.addEventListener("submit", recordResult);
  }

  function isValidConfig(config) {
    return Boolean(config?.SUPABASE_URL && config?.SUPABASE_ANON_KEY &&
      !config.SUPABASE_URL.includes("<") && !config.SUPABASE_ANON_KEY.includes("<") &&
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.SUPABASE_URL));
  }

  async function loadBaseData() {
    await Promise.all([loadPlayers(), loadCurrentPlayer(), loadAdminState()]);
    renderPlayerUi();
    renderAdminUi();
  }

  async function loadPlayers() {
    const { data, error } = await state.client.from("players").select("id,name,active,created_at").order("name");
    if (error) throw error;
    state.players = data ?? [];
  }

  async function loadCurrentPlayer() {
    const { data, error } = await state.client
      .from("app_user_players")
      .select("player_id,players(id,name,active)")
      .limit(1);
    if (error) throw error;
    state.currentPlayer = data?.[0]?.players ?? null;
  }

  async function loadAdminState() {
    const { data, error } = await state.client.rpc("is_admin");
    if (error) throw error;
    state.isAdmin = data === true;
  }

  function renderPlayerUi() {
    const currentName = $("#current-player-name");
    if (currentName) currentName.textContent = state.currentPlayer
      ? `${state.currentPlayer.name}${state.currentPlayer.active ? "" : " (archiviato)"}` : "Nessuno";
    if ($("#go-to-player")) $("#go-to-player").textContent = state.currentPlayer ? "Gestisci" : "Seleziona";

    const select = $("#player-select");
    const activePlayers = state.players.filter((player) => player.active);
    if (select) {
      select.innerHTML = ['<option value="">Scegli...</option>', ...activePlayers.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)].join("");
      if (state.currentPlayer) {
        select.value = state.currentPlayer.id;
        select.disabled = true;
      } else select.disabled = false;
    }

    const claim = $("#claim-player-button");
    if (claim) {
      claim.disabled = Boolean(state.currentPlayer) || activePlayers.length === 0;
      claim.textContent = state.currentPlayer ? "Giocatore già associato" : "Conferma giocatore";
    }

    const proposalDisabled = !state.currentPlayer?.active;
    $$("#proposal-form input, #proposal-form textarea, #proposal-form button").forEach((element) => { element.disabled = proposalDisabled; });
    const hint = $("#proposal-player-hint");
    if (hint) hint.textContent = proposalDisabled
      ? (state.currentPlayer ? "Il giocatore associato è archiviato." : "Prima seleziona il tuo giocatore nella scheda Giocatori.")
      : `La proposta sarà attribuita a ${state.currentPlayer.name}.`;
    fillResultPlayerSelects();
  }

  function renderAdminUi() {
    $("#admin-login-panel")?.classList.toggle("hidden", state.isAdmin);
    $("#admin-player-panel")?.classList.toggle("hidden", !state.isAdmin);
    $("#result-admin-panel")?.classList.toggle("hidden", !state.isAdmin);
    if (state.isAdmin && state.activeTab === "players") loadAdminPlayers();
  }

  async function claimPlayer() {
    const playerId = $("#player-select")?.value;
    if (!playerId) return toast("Scegli un giocatore.", true);
    if (!window.confirm("Confermi l'associazione? Solo un amministratore potrà liberarla.")) return;
    const button = $("#claim-player-button");
    setButtonBusy(button, true, "Associazione...");
    try {
      const { error } = await state.client.rpc("claim_player", { p_player_id: playerId });
      if (error) throw error;
      await loadCurrentPlayer();
      renderPlayerUi();
      toast(`Giocatore selezionato: ${state.currentPlayer.name}.`);
      await loadActiveTab();
    } catch (error) { toast(readableError(error), true); }
    finally { setButtonBusy(button, false); renderPlayerUi(); }
  }

  async function openTab(tab) {
    state.activeTab = tab;
    $$('[data-tab]').forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    $$('[data-tab-panel]').forEach((panel) => {
      const active = panel.dataset.tabPanel === tab;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    await loadActiveTab();
  }

  async function loadActiveTab() {
    if (!state.client) return;
    try {
      if (state.activeTab === "votes") await loadVotes();
      if (state.activeTab === "summary") await loadSummary();
      if (state.activeTab === "games") await loadProposals();
      if (state.activeTab === "ranking") await loadRanking();
      if (state.activeTab === "history") await loadHistory();
      if (state.activeTab === "players" && state.isAdmin) await loadAdminPlayers();
    } catch (error) { toast(readableError(error), true); }
  }

  async function refreshAll() {
    const button = $("#refresh-button");
    setButtonBusy(button, true, "...");
    try { await loadBaseData(); await loadActiveTab(); toast("Dati aggiornati."); }
    catch (error) { toast(readableError(error), true); }
    finally { setButtonBusy(button, false); }
  }

  async function loadVotes() {
    let votes = [];
    if (state.currentPlayer?.active) {
      const { data, error } = await state.client.from("votes").select("vote_date,choice")
        .eq("week_start", state.weekStart).eq("player_id", state.currentPlayer.id);
      if (error) throw error;
      votes = data ?? [];
    }
    const byDate = new Map(votes.map((vote) => [vote.vote_date, vote.choice]));
    const target = $("#vote-days");
    if (!target) return;
    target.innerHTML = weekDates().map((date) => {
      const iso = toISODate(date);
      const selected = byDate.get(iso);
      return `<article class="day-card"><div><div class="day-name">${escapeHtml(dateLong.format(date).split(" ")[0])}</div><div class="day-date">${escapeHtml(dateLong.format(date).replace(/^\S+\s/, ""))}</div></div>
      <div class="vote-options">${Object.entries(choiceMeta).map(([value, meta]) => `<button class="vote-button ${selected === value ? "selected" : ""}" data-vote-date="${iso}" data-choice="${value}" type="button" ${state.currentPlayer?.active ? "" : "disabled"}>${meta.label}</button>`).join("")}</div></article>`;
    }).join("");
    $$('[data-vote-date]').forEach((button) => button.addEventListener("click", () => saveVote(button.dataset.voteDate, button.dataset.choice)));
    if (!state.currentPlayer?.active) target.insertAdjacentHTML("afterbegin", `<div class="empty-state">Seleziona il tuo giocatore per votare.</div>`);
  }

  async function saveVote(voteDate, choice) {
    if (!state.currentPlayer?.active || !choiceMeta[choice]) return;
    const buttons = $$(`[data-vote-date="${voteDate}"]`);
    buttons.forEach((b) => { b.disabled = true; });
    try {
      const { error } = await state.client.from("votes").upsert({ week_start: state.weekStart, vote_date: voteDate, player_id: state.currentPlayer.id, choice }, { onConflict: "vote_date,player_id" });
      if (error) throw error;
      buttons.forEach((b) => b.classList.toggle("selected", b.dataset.choice === choice));
      toast(`Voto salvato: ${choiceMeta[choice].label}.`);
    } catch (error) { toast(readableError(error), true); await loadVotes(); }
    finally { buttons.forEach((b) => { b.disabled = false; }); }
  }

  async function loadSummary() {
    const [vr, pr] = await Promise.all([
      state.client.from("votes").select("vote_date,choice,player_id").eq("week_start", state.weekStart),
      state.client.from("players").select("id,name,active").order("name")
    ]);
    if (vr.error) throw vr.error; if (pr.error) throw pr.error;
    const votes = vr.data ?? [];
    const voted = new Set(votes.map((v) => v.player_id));
    const players = (pr.data ?? []).filter((p) => p.active || voted.has(p.id));
    if (!players.length) return empty($("#summary-content"), "Nessun giocatore configurato.");
    const map = new Map(votes.map((v) => [`${v.player_id}:${v.vote_date}`, v.choice]));
    const dates = weekDates();
    const totals = Object.fromEntries(dates.map((d) => [toISODate(d), { yes: 0, maybe: 0, no: 0 }]));
    votes.forEach((v) => { totals[v.vote_date][v.choice] += 1; });
    $("#summary-content").innerHTML = `<div class="table-card"><table><thead><tr><th>Giocatore</th>${dates.map((d) => `<th>${escapeHtml(dateLong.format(d).slice(0, 3))}<br>${dateShort.format(d)}</th>`).join("")}</tr></thead><tbody>
    ${players.map((p) => `<tr><td>${escapeHtml(p.name)}</td>${dates.map((d) => { const c = map.get(`${p.id}:${toISODate(d)}`); return `<td><span class="vote-badge ${c ?? "empty"}">${c ? choiceMeta[c].short : "-"}</span></td>`; }).join("")}</tr>`).join("")}
    <tr><td><strong>Totale Sì</strong></td>${dates.map((d) => `<td><strong>${totals[toISODate(d)].yes}</strong></td>`).join("")}</tr></tbody></table></div>`;
  }

  function prepareBggAutocomplete() {
    const input = $("#proposal-title");
    const urlInput = $("#proposal-url");
    if (!input) return;
    if (urlInput) {
      urlInput.required = false;
      urlInput.removeAttribute("required");
      urlInput.placeholder = "Link BoardGameGeek (facoltativo)";
    }
    let list = $("#bgg-suggestions");
    if (!list) {
      list = document.createElement("datalist");
      list.id = "bgg-suggestions";
      input.insertAdjacentElement("afterend", list);
    }
    input.setAttribute("list", "bgg-suggestions");
    input.setAttribute("autocomplete", "off");
    let timer;
    input.addEventListener("input", () => {
      state.selectedBggGame = null;
      clearTimeout(timer);
      timer = setTimeout(() => loadBggSuggestions(input.value), 220);
    });
    input.addEventListener("change", () => selectBggGame(input.value));
  }

  async function loadBggSuggestions(term) {
    const list = $("#bgg-suggestions");
    const query = term.trim();
    if (!list || !state.client || query.length < 2) { if (list) list.innerHTML = ""; return; }
    const { data, error } = await state.client.from("bgg_games")
      .select("bgg_id,game_name,rank,year_published,average_rating,users_rated,bgg_url,thumbnail_url,image_url")
      .ilike("game_name", `%${query}%`).order("rank", { ascending: true }).limit(12);
    if (error) { console.warn(error); return; }
    list.innerHTML = (data ?? []).map((g) => `<option value="${escapeAttribute(g.game_name)}">#${g.rank ?? "-"} · ${g.year_published ?? ""}</option>`).join("");
  }

  async function selectBggGame(name) {
    const game = await findBggGame(name);
    state.selectedBggGame = game;
    if (game && $("#proposal-url")) $("#proposal-url").value = game.bgg_url || "";
  }

  async function findBggGame(name) {
    const normalized = name.trim();
    if (!normalized) return null;
    const { data, error } = await state.client.from("bgg_games")
      .select("bgg_id,game_name,rank,year_published,average_rating,users_rated,bgg_url,thumbnail_url,image_url")
      .ilike("game_name", normalized).order("rank", { ascending: true }).limit(1);
    if (error) { console.warn(error); return null; }
    return data?.[0] ?? null;
  }

  function buildBggSearchUrl(name) {
    return `https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=${encodeURIComponent(name)}`;
  }

  async function submitProposal(event) {
    event.preventDefault();
    if (!state.currentPlayer?.active) return toast("Seleziona prima il tuo giocatore.", true);
    const title = $("#proposal-title")?.value.trim() ?? "";
    const manualUrl = $("#proposal-url")?.value.trim() ?? "";
    const notes = $("#proposal-notes")?.value.trim() ?? "";
    if (!title) return toast("Inserisci il nome del gioco.", true);
    if (manualUrl && !isBggUrl(manualUrl)) return toast("Il link BGG inserito non è valido.", true);
    const button = event.submitter;
    setButtonBusy(button, true, "Aggiunta...");
    try {
      const game = state.selectedBggGame?.game_name?.toLowerCase() === title.toLowerCase() ? state.selectedBggGame : await findBggGame(title);
      const bggUrl = manualUrl || game?.bgg_url || buildBggSearchUrl(title);
      const { error } = await state.client.from("game_proposals").insert({
        week_start: state.weekStart, title, bgg_id: game?.bgg_id ?? null, bgg_url: bggUrl,
        notes: notes || null, proposed_by_player_id: state.currentPlayer.id
      });
      if (error) throw error;
      event.target.reset(); state.selectedBggGame = null;
      toast("Gioco proposto.");
      await loadProposals();
      if (game?.bgg_id && !game.thumbnail_url) requestBggImage(game.bgg_id);
    } catch (error) { toast(readableError(error), true); }
    finally { setButtonBusy(button, false); }
  }

  async function loadProposals() {
    const [proposalsResponse, votesResponse] = await Promise.all([
      state.client.from("game_proposals")
        .select("id,title,bgg_id,bgg_url,notes,created_at,created_by,players(name),bgg_games(bgg_id,game_name,rank,year_published,average_rating,users_rated,bgg_url,thumbnail_url,image_url)")
        .eq("week_start", state.weekStart).order("created_at"),
      state.client.from("game_proposal_votes").select("proposal_id,player_id").eq("week_start", state.weekStart)
    ]);
    if (proposalsResponse.error) throw proposalsResponse.error;
    if (votesResponse.error) throw votesResponse.error;
    const proposals = proposalsResponse.data ?? [];
    const votes = votesResponse.data ?? [];
    const list = $("#proposal-list");
    if (!proposals.length) return empty(list, "Nessuna proposta per questa settimana.");
    const totals = new Map();
    votes.forEach((v) => totals.set(v.proposal_id, (totals.get(v.proposal_id) ?? 0) + 1));
    const currentVote = state.currentPlayer ? votes.find((v) => v.player_id === state.currentPlayer.id)?.proposal_id : null;
    proposals.sort((a, b) => ((totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0)) || new Date(a.created_at) - new Date(b.created_at));

    list.innerHTML = `<div class="weekly-winner"><span class="winner-icon">🏆</span><div><strong>${totals.get(proposals[0].id) ? "Gioco in testa" : "Vota il gioco della settimana"}</strong><div class="meta">Ogni giocatore può esprimere un voto e cambiarlo.</div></div></div>
    ${proposals.map((p, index) => proposalCard(p, totals.get(p.id) ?? 0, currentVote === p.id, index === 0)).join("")}`;
    $$('[data-delete-proposal]').forEach((b) => b.addEventListener("click", () => deleteProposal(b.dataset.deleteProposal)));
    $$('[data-vote-proposal]').forEach((b) => b.addEventListener("click", () => saveGameVote(b.dataset.voteProposal)));
    proposals.forEach((p) => { if (p.bgg_id && !p.bgg_games?.thumbnail_url) requestBggImage(p.bgg_id); });
  }

  function proposalCard(proposal, voteCount, selected, leading) {
    const game = proposal.bgg_games;
    const image = game?.thumbnail_url || game?.image_url;
    const canDelete = state.isAdmin || proposal.created_by === state.session?.user?.id;
    return `<article class="list-card game-proposal-card ${leading && voteCount ? "leading" : ""}">
      <div class="game-visual">${image ? `<img class="game-thumb" src="${escapeAttribute(image)}" alt="Copertina di ${escapeAttribute(proposal.title)}" loading="lazy">` : `<div class="game-placeholder" aria-hidden="true">🎲</div>`}</div>
      <div class="game-content"><div class="list-card-header"><div><h3>${leading && voteCount ? "🏆 " : ""}${escapeHtml(proposal.title)}</h3><div class="meta">Proposto da ${escapeHtml(proposal.players?.name ?? "Giocatore")}</div></div>
      ${canDelete ? `<button class="danger-button" data-delete-proposal="${proposal.id}" type="button">Rimuovi</button>` : ""}</div>
      ${game ? `<div class="bgg-stats"><span>⭐ ${game.average_rating ? Number(game.average_rating).toFixed(2) : "-"}</span><span>🏅 #${game.rank ?? "-"}</span><span>👥 ${game.users_rated ? numberIt.format(game.users_rated) : "-"}</span><span>📅 ${game.year_published ?? "-"}</span></div>` : ""}
      ${proposal.bgg_url ? `<p><a href="${escapeAttribute(proposal.bgg_url)}" target="_blank" rel="noopener noreferrer">Apri su BoardGameGeek ↗</a></p>` : ""}
      ${proposal.notes ? `<p class="notes">${escapeHtml(proposal.notes)}</p>` : ""}
      <div class="proposal-vote-row"><button class="${selected ? "primary-button" : "secondary-button"}" data-vote-proposal="${proposal.id}" type="button" ${state.currentPlayer?.active ? "" : "disabled"}>${selected ? "✓ Votato" : "Vota questo gioco"}</button><strong>${voteCount} ${voteCount === 1 ? "voto" : "voti"}</strong></div></div>
    </article>`;
  }

  async function requestBggImage(bggId) {
    if (!bggId || state.imageRequests.has(bggId)) return;
    state.imageRequests.add(bggId);
    try {
      const { error } = await state.client.functions.invoke("update-bgg-images", { body: { bgg_id: Number(bggId) } });
      if (error) throw error;
      if (state.activeTab === "games") setTimeout(loadProposals, 400);
      if (state.activeTab === "history") setTimeout(loadHistory, 400);
    } catch (error) { console.warn("Immagine BGG non disponibile", error); }
  }

  async function saveGameVote(proposalId) {
    if (!state.currentPlayer?.active) return toast("Seleziona prima il tuo giocatore.", true);
    try {
      const { error } = await state.client.from("game_proposal_votes").upsert({ week_start: state.weekStart, proposal_id: proposalId, player_id: state.currentPlayer.id }, { onConflict: "week_start,player_id" });
      if (error) throw error;
      toast("Voto del gioco salvato."); await loadProposals();
    } catch (error) { toast(readableError(error), true); }
  }

  async function deleteProposal(id) {
    if (!window.confirm("Rimuovere questa proposta?")) return;
    const { error } = await state.client.from("game_proposals").delete().eq("id", id);
    if (error) return toast(readableError(error), true);
    toast("Proposta rimossa."); await loadProposals();
  }

  async function loadRanking() {
    const { data, error } = await state.client.from("standings").select("player_id,player_name,wins,last_places,games_recorded")
      .order("wins", { ascending: false }).order("last_places").order("player_name");
    if (error) throw error;
    if (!data?.length) return empty($("#ranking-content"), "La classifica è vuota.");
    $("#ranking-content").innerHTML = `<table><thead><tr><th>#</th><th>Giocatore</th><th>Vittorie</th><th>Ultimi</th><th>Risultati</th></tr></thead><tbody>${data.map((r, i) => `<tr><td>${i + 1}</td><td><strong>${escapeHtml(r.player_name)}</strong></td><td>${r.wins}</td><td>${r.last_places}</td><td>${r.games_recorded}</td></tr>`).join("")}</tbody></table>`;
  }

  async function recordResult(event) {
    event.preventDefault();
    if (!state.isAdmin) return toast("Sessione amministratore richiesta.", true);
    const playedOn = $("#result-date").value;
    const gameName = $("#result-game").value.trim();
    const manualUrl = $("#result-url")?.value.trim() ?? "";
    const winnerId = $("#result-winner").value;
    const lastId = $("#result-last").value;
    const notes = $("#result-notes").value.trim();
    if (winnerId === lastId) return toast("Vincitore e ultimo devono essere diversi.", true);
    if (manualUrl && !isBggUrl(manualUrl)) return toast("Link BGG non valido.", true);
    const button = event.submitter; setButtonBusy(button, true, "Registrazione...");
    try {
      const game = await findBggGame(gameName);
      const { error } = await state.client.from("game_results").insert({
        played_on: playedOn, week_start: toISODate(startOfWeek(fromISODate(playedOn))), game_name: gameName,
        bgg_id: game?.bgg_id ?? null, bgg_url: manualUrl || game?.bgg_url || null,
        winner_player_id: winnerId, last_player_id: lastId, notes: notes || null
      });
      if (error) throw error;
      event.target.reset(); $("#result-date").value = toISODate(new Date()); fillResultPlayerSelects();
      toast("Risultato registrato."); await loadHistory();
      if (game?.bgg_id && !game.thumbnail_url) requestBggImage(game.bgg_id);
    } catch (error) { toast(readableError(error), true); }
    finally { setButtonBusy(button, false); }
  }

  async function loadHistory() {
    const { data, error } = await state.client.from("game_history_with_bgg")
      .select("id,played_on,game_name,bgg_id,bgg_url,notes,winner_name,last_name,created_at,rank,average_rating,users_rated,thumbnail_url,image_url")
      .order("played_on", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;
    const list = $("#history-list");
    if (!data?.length) return empty(list, "Lo storico è vuoto.");
    list.innerHTML = data.map((r) => {
      const image = r.thumbnail_url || r.image_url;
      return `<article class="list-card history-game-card"><div class="game-visual">${image ? `<img class="game-thumb" src="${escapeAttribute(image)}" alt="Copertina di ${escapeAttribute(r.game_name)}" loading="lazy">` : `<div class="game-placeholder">🎲</div>`}</div><div class="game-content">
      <div class="list-card-header"><div><h3>${escapeHtml(r.game_name)}</h3><div class="meta">${escapeHtml(dateHistory.format(fromISODate(r.played_on)))}</div></div>${state.isAdmin ? `<button class="danger-button" data-delete-result="${r.id}" type="button">Elimina</button>` : ""}</div>
      ${r.bgg_id ? `<div class="bgg-stats"><span>⭐ ${r.average_rating ? Number(r.average_rating).toFixed(2) : "-"}</span><span>🏅 #${r.rank ?? "-"}</span><span>👥 ${r.users_rated ? numberIt.format(r.users_rated) : "-"}</span></div>` : ""}
      ${r.bgg_url ? `<p><a href="${escapeAttribute(r.bgg_url)}" target="_blank" rel="noopener noreferrer">BoardGameGeek ↗</a></p>` : ""}
      <div class="result-grid"><div><span class="field-label">Vincitore</span><strong>🏆 ${escapeHtml(r.winner_name)}</strong></div><div><span class="field-label">Ultimo</span><strong>🔻 ${escapeHtml(r.last_name)}</strong></div></div>${r.notes ? `<p class="notes">${escapeHtml(r.notes)}</p>` : ""}</div></article>`;
    }).join("");
    $$('[data-delete-result]').forEach((b) => b.addEventListener("click", () => deleteResult(b.dataset.deleteResult)));
    data.forEach((r) => { if (r.bgg_id && !r.thumbnail_url) requestBggImage(r.bgg_id); });
  }

  async function deleteResult(id) {
    if (!window.confirm("Eliminare definitivamente questo risultato?")) return;
    const { error } = await state.client.from("game_results").delete().eq("id", id);
    if (error) return toast(readableError(error), true);
    toast("Risultato eliminato."); await loadHistory();
  }

  async function adminLogin(event) {
    event.preventDefault(); const button = event.submitter; setButtonBusy(button, true, "Verifica...");
    try {
      const { data, error } = await state.client.rpc("admin_login", { p_pin: $("#admin-pin").value });
      if (error) throw error; if (!data) return toast("PIN non valido o accesso bloccato.", true);
      state.isAdmin = true; event.target.reset(); renderAdminUi(); await loadAdminPlayers(); toast("Modalità amministratore attiva.");
    } catch (error) { toast(readableError(error), true); }
    finally { setButtonBusy(button, false); }
  }

  async function adminLogout() {
    const { error } = await state.client.rpc("admin_logout"); if (error) return toast(readableError(error), true);
    state.isAdmin = false; renderAdminUi(); toast("Modalità amministratore disattivata.");
  }

  async function addPlayer(event) {
    event.preventDefault(); const button = event.submitter; setButtonBusy(button, true, "Aggiunta...");
    try {
      const { error } = await state.client.from("players").insert({ name: $("#new-player-name").value.trim() });
      if (error) throw error; event.target.reset(); await loadPlayers(); renderPlayerUi(); await loadAdminPlayers(); toast("Giocatore aggiunto.");
    } catch (error) { toast(readableError(error), true); }
    finally { setButtonBusy(button, false); }
  }

  async function loadAdminPlayers() {
    if (!state.isAdmin) return;
    const { data, error } = await state.client.rpc("admin_list_players"); if (error) throw error;
    const list = $("#admin-player-list"); if (!data?.length) return empty(list, "Nessun giocatore.");
    list.innerHTML = data.map((p) => `<article class="list-card"><div class="list-card-header"><div><h3>${escapeHtml(p.name)}</h3><span class="pill ${p.active ? "active" : ""}">${p.active ? "Attivo" : "Archiviato"}</span> <span class="pill">${p.is_claimed ? "Associato" : "Libero"}</span></div><button class="secondary-button compact" data-toggle-player="${p.id}" data-next-active="${!p.active}" type="button">${p.active ? "Archivia" : "Riattiva"}</button></div>${p.is_claimed ? `<p><button class="danger-button" data-release-player="${p.id}" type="button">Libera associazione</button></p>` : ""}</article>`).join("");
    $$('[data-toggle-player]').forEach((b) => b.addEventListener("click", () => togglePlayer(b.dataset.togglePlayer, b.dataset.nextActive === "true")));
    $$('[data-release-player]').forEach((b) => b.addEventListener("click", () => releasePlayer(b.dataset.releasePlayer)));
  }

  async function togglePlayer(id, active) {
    const { error } = await state.client.from("players").update({ active }).eq("id", id); if (error) return toast(readableError(error), true);
    await loadPlayers(); renderPlayerUi(); await loadAdminPlayers(); toast(active ? "Giocatore riattivato." : "Giocatore archiviato.");
  }

  async function releasePlayer(id) {
    if (!window.confirm("Liberare l'associazione?")) return;
    const { error } = await state.client.rpc("admin_release_player", { p_player_id: id }); if (error) return toast(readableError(error), true);
    if (state.currentPlayer?.id === id) { state.currentPlayer = null; await loadCurrentPlayer(); }
    renderPlayerUi(); await loadAdminPlayers(); toast("Associazione liberata.");
  }

  function fillResultPlayerSelects() {
    const options = ['<option value="">Scegli...</option>', ...state.players.filter((p) => p.active).map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)].join("");
    if ($("#result-winner")) $("#result-winner").innerHTML = options;
    if ($("#result-last")) $("#result-last").innerHTML = options;
    if ($("#result-date") && !$("#result-date").value) $("#result-date").value = toISODate(new Date());
  }

  function subscribeRealtime() {
    if (state.realtime) state.client.removeChannel(state.realtime);
    state.realtime = state.client.channel("serata-ludica-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, scheduleLiveRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_proposals" }, scheduleLiveRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_proposal_votes" }, scheduleLiveRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_results" }, scheduleLiveRefresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bgg_games" }, scheduleLiveRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, scheduleLiveRefresh).subscribe();
  }

  function scheduleLiveRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(async () => { try { await loadPlayers(); renderPlayerUi(); await loadActiveTab(); } catch (error) { console.error(error); } }, 300);
  }

  function setWeek(date) { state.weekStart = toISODate(startOfWeek(date)); updateWeekUi(); loadActiveTab(); }
  function shiftWeek(days) { const d = fromISODate(state.weekStart); d.setDate(d.getDate() + days); setWeek(d); }
  function updateWeekUi() {
    const dates = weekDates(), first = dates[0], last = dates[6];
    const part = first.getMonth() === last.getMonth() ? String(first.getDate()) : dateShort.format(first);
    if ($("#week-label")) $("#week-label").textContent = `${part} - ${dateHistory.format(last)}`;
    if ($("#week-input")) $("#week-input").value = toISOWeekValue(first);
  }
  function weekDates() { const monday = fromISODate(state.weekStart); return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; }); }
  function startOfWeek(input) { const d = new Date(input); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  function toISODate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function fromISODate(v) { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d, 12); }
  function toISOWeekValue(date) { const t = new Date(date); t.setHours(12, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); const w1 = new Date(t.getFullYear(), 0, 4, 12); const week = 1 + Math.round(((t - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7); return `${t.getFullYear()}-W${String(week).padStart(2, "0")}`; }
  function isoWeekToMonday(v) { const m = /^(\d{4})-W(\d{2})$/.exec(v); if (!m) return null; const jan4 = new Date(Number(m[1]), 0, 4, 12); const d = startOfWeek(jan4); d.setDate(d.getDate() + (Number(m[2]) - 1) * 7); return d; }
  function isBggUrl(value) { try { const u = new URL(value); return u.protocol === "https:" && ["boardgamegeek.com", "www.boardgamegeek.com"].includes(u.hostname.toLowerCase()); } catch { return false; } }
  function empty(target, message) { if (target) target.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`; }
  function renderUnavailable(message) { ["#vote-days", "#summary-content", "#proposal-list", "#ranking-content", "#history-list"].forEach((s) => empty($(s), message)); $$('button,input,select,textarea').forEach((e) => { e.disabled = true; }); }
  function fatal(message) { $("#loading")?.classList.add("hidden"); $("#app")?.setAttribute("aria-busy", "false"); toast(message, true, 12000); renderUnavailable(message); }
  let toastTimer;
  function toast(message, isError = false, duration = 3200) { const e = $("#toast"); if (!e) return; e.textContent = message; e.classList.toggle("error", isError); e.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => e.classList.remove("show"), duration); }
  function setButtonBusy(button, busy, text = "Attendi...") { if (!button) return; if (busy) { button.dataset.originalText = button.textContent; button.textContent = text; button.disabled = true; } else { button.textContent = button.dataset.originalText || button.textContent; button.disabled = false; } }
  function readableError(error) { const message = error?.message || String(error || "Errore sconosciuto"); const map = [[/anonymous sign-ins are disabled/i, "Abilita gli accessi anonimi in Supabase."], [/player_already_claimed/i, "Giocatore già associato."], [/user_already_has_player/i, "Questo accesso ha già un giocatore."], [/admin_not_configured/i, "PIN amministratore non configurato."], [/row-level security/i, "Operazione non autorizzata dalle regole di sicurezza."], [/Failed to fetch/i, "Connessione a Supabase non riuscita."]]; return map.find(([r]) => r.test(message))?.[1] || message; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
  function escapeAttribute(value) { return escapeHtml(value); }
})();
