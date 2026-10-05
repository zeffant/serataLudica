/* Serata Ludica — client statico per GitHub Pages + Supabase */
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
    refreshTimer: null
  };

  const choiceMeta = {
    yes: { label: "Sì", short: "S" },
    maybe: { label: "Forse", short: "F" },
    no: { label: "No", short: "N" }
  };

  const dateLong = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const dateShort = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit" });
  const dateHistory = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    updateWeekUi();

    const config = window.SERATA_LUDICA_CONFIG;
    if (!isValidConfig(config)) {
      $("#setup-banner").classList.remove("hidden");
      $("#loading").classList.add("hidden");
      $("#app").setAttribute("aria-busy", "false");
      renderUnavailable("Completa config.js prima di usare l’app.");
      return;
    }

    if (!window.supabase?.createClient) {
      fatal("Impossibile caricare la libreria Supabase. Controlla la connessione e la Content Security Policy.");
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
      $("#loading").classList.add("hidden");
      $("#app").setAttribute("aria-busy", "false");
    }
  }

  function bindEvents() {
	$("#proposal-title").addEventListener("input", handleGameSearch);
    $$("[data-tab]").forEach((button) => button.addEventListener("click", () => openTab(button.dataset.tab)));
    $("#go-to-player").addEventListener("click", () => openTab("players"));
    $("#refresh-button").addEventListener("click", refreshAll);
    $("#previous-week").addEventListener("click", () => shiftWeek(-7));
    $("#next-week").addEventListener("click", () => shiftWeek(7));
    $("#current-week").addEventListener("click", () => setWeek(startOfWeek(new Date())));
    $("#week-input").addEventListener("change", (event) => {
      const date = isoWeekToMonday(event.target.value);
      if (date) setWeek(date);
    });
    $("#claim-player-button").addEventListener("click", claimPlayer);
    $("#proposal-form").addEventListener("submit", submitProposal);
    $("#admin-login-form").addEventListener("submit", adminLogin);
    $("#admin-logout").addEventListener("click", adminLogout);
    $("#add-player-form").addEventListener("submit", addPlayer);
    $("#result-form").addEventListener("submit", recordResult);
  }

  function isValidConfig(config) {
    return Boolean(
      config?.SUPABASE_URL &&
      config?.SUPABASE_ANON_KEY &&
      !config.SUPABASE_URL.includes("<") &&
      !config.SUPABASE_ANON_KEY.includes("<") &&
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.SUPABASE_URL)
    );
  }

  async function loadBaseData() {
    await Promise.all([loadPlayers(), loadCurrentPlayer(), loadAdminState()]);
    renderPlayerUi();
    renderAdminUi();
  }

  async function loadPlayers() {
    const { data, error } = await state.client
      .from("players")
      .select("id,name,active,created_at")
      .order("name", { ascending: true });
    if (error) throw error;
    state.players = data ?? [];
  }

	async function findBggGame(gameName) {

	  const { data } = await state.client
		.from("bgg_games")
		.select("game_name")
		.ilike("game_name", gameName)
		.maybeSingle();

	  if (!data) return null;

	  return `https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=${encodeURIComponent(data.game_name)}`;
	}

	async function searchBggGames(term) {

	  if (!term || term.length < 2) return [];

	  const { data } = await state.client
		.from("bgg_games")
		.select("game_name")
		.ilike("game_name", `${term}%`)
		.limit(10);

	  return data || [];
}

  async function loadCurrentPlayer() {
    const { data, error } = await state.client
      .from("app_user_players")
      .select("player_id,players(id,name,active)")
      .maybeSingle();
    if (error) throw error;
    state.currentPlayer = data?.players ?? null;
  }

  async function loadAdminState() {
    const { data, error } = await state.client.rpc("is_admin");
    if (error) throw error;
    state.isAdmin = data === true;
  }

  function renderPlayerUi() {
    $("#current-player-name").textContent = state.currentPlayer
      ? `${state.currentPlayer.name}${state.currentPlayer.active ? "" : " (archiviato)"}`
      : "Nessuno";
    $("#go-to-player").textContent = state.currentPlayer ? "Gestisci" : "Seleziona";

    const select = $("#player-select");
    const activePlayers = state.players.filter((player) => player.active);
    select.innerHTML = [
      '<option value="">Scegli…</option>',
      ...activePlayers.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`)
    ].join("");

    if (state.currentPlayer) {
      select.value = state.currentPlayer.id;
      select.disabled = true;
      $("#claim-player-button").disabled = true;
      $("#claim-player-button").textContent = "Giocatore già associato";
    } else {
      select.disabled = false;
      $("#claim-player-button").disabled = activePlayers.length === 0;
      $("#claim-player-button").textContent = "Conferma giocatore";
    }

    const proposalDisabled = !state.currentPlayer?.active;
    $$("#proposal-form input, #proposal-form textarea, #proposal-form button").forEach((element) => { element.disabled = proposalDisabled; });
    $("#proposal-player-hint").textContent = proposalDisabled
      ? (state.currentPlayer ? "Il giocatore associato è archiviato: contatta un amministratore." : "Prima seleziona il tuo giocatore nella scheda Giocatori.")
      : `La proposta sarà attribuita a ${state.currentPlayer.name}.`;
    fillResultPlayerSelects();
  }

  function renderAdminUi() {
    $("#admin-login-panel").classList.toggle("hidden", state.isAdmin);
    $("#admin-player-panel").classList.toggle("hidden", !state.isAdmin);
    $("#result-admin-panel").classList.toggle("hidden", !state.isAdmin);
    if (state.isAdmin && state.activeTab === "players") loadAdminPlayers();
  }

  async function claimPlayer() {
    const playerId = $("#player-select").value;
    if (!playerId) return toast("Scegli un giocatore.", true);
    if (!window.confirm("Confermi l’associazione? Solo un amministratore potrà liberarla.")) return;

    setButtonBusy($("#claim-player-button"), true, "Associazione…");
    try {
      const { error } = await state.client.rpc("claim_player", { p_player_id: playerId });
      if (error) throw error;
      await loadCurrentPlayer();
      renderPlayerUi();
      toast(`Giocatore selezionato: ${state.currentPlayer.name}.`);
      await loadActiveTab();
    } catch (error) {
      toast(readableError(error), true);
    } finally {
      setButtonBusy($("#claim-player-button"), false);
      renderPlayerUi();
    }
  }

  async function openTab(tab) {
    state.activeTab = tab;
    $$("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    $$("[data-tab-panel]").forEach((panel) => {
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
    } catch (error) {
      toast(readableError(error), true);
    }
  }

  async function refreshAll() {
    const button = $("#refresh-button");
    setButtonBusy(button, true, "…");
    try {
      await loadBaseData();
      await loadActiveTab();
      toast("Dati aggiornati.");
    } catch (error) {
      toast(readableError(error), true);
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function loadVotes() {
    let votes = [];
      if (state.currentPlayer?.active) {
      const { data, error } = await state.client
        .from("votes")
        .select("vote_date,choice")
        .eq("week_start", state.weekStart)
        .eq("player_id", state.currentPlayer.id);
      if (error) throw error;
      votes = data ?? [];
    }

    const byDate = new Map(votes.map((vote) => [vote.vote_date, vote.choice]));
    $("#vote-days").innerHTML = weekDates().map((date) => {
      const iso = toISODate(date);
      const selected = byDate.get(iso);
      return `
        <article class="day-card">
          <div><div class="day-name">${escapeHtml(dateLong.format(date).split(" ")[0])}</div><div class="day-date">${escapeHtml(dateLong.format(date).replace(/^\S+\s/, ""))}</div></div>
          <div class="vote-options" role="group" aria-label="Disponibilità per ${escapeHtml(dateLong.format(date))}">
            ${Object.entries(choiceMeta).map(([value, meta]) => `<button class="vote-button ${selected === value ? "selected" : ""}" data-vote-date="${iso}" data-choice="${value}" type="button" ${state.currentPlayer?.active ? "" : "disabled"}>${meta.label}</button>`).join("")}
          </div>
        </article>`;
    }).join("");

    $$("[data-vote-date]").forEach((button) => button.addEventListener("click", () => saveVote(button.dataset.voteDate, button.dataset.choice)));
    if (!state.currentPlayer?.active) {
      const message = state.currentPlayer
        ? "Il giocatore associato è archiviato: contatta un amministratore."
        : "Seleziona il tuo giocatore nella scheda Giocatori per votare.";
      $("#vote-days").insertAdjacentHTML("afterbegin", `<div class="empty-state">${message}</div>`);
    }
  }

  async function saveVote(voteDate, choice) {
    if (!state.currentPlayer?.active || !choiceMeta[choice]) return;
    const buttons = $$(`[data-vote-date="${voteDate}"]`);
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const { error } = await state.client.from("votes").upsert({
        week_start: state.weekStart,
        vote_date: voteDate,
        player_id: state.currentPlayer.id,
        choice
      }, { onConflict: "vote_date,player_id" });
      if (error) throw error;
      buttons.forEach((button) => button.classList.toggle("selected", button.dataset.choice === choice));
      toast(`Voto salvato: ${choiceMeta[choice].label}.`);
    } catch (error) {
      toast(readableError(error), true);
      await loadVotes();
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  async function loadSummary() {
    const [votesResponse, playersResponse] = await Promise.all([
      state.client.from("votes").select("vote_date,choice,player_id").eq("week_start", state.weekStart),
      state.client.from("players").select("id,name,active").order("name")
    ]);
    if (votesResponse.error) throw votesResponse.error;
    if (playersResponse.error) throw playersResponse.error;

    const votes = votesResponse.data ?? [];
    const votedPlayerIds = new Set(votes.map((vote) => vote.player_id));
    const players = (playersResponse.data ?? []).filter((player) => player.active || votedPlayerIds.has(player.id));
    if (players.length === 0) return empty($("#summary-content"), "Nessun giocatore configurato.");

    const voteMap = new Map(votes.map((vote) => [`${vote.player_id}:${vote.vote_date}`, vote.choice]));
    const dates = weekDates();
    const totals = Object.fromEntries(dates.map((date) => [toISODate(date), { yes: 0, maybe: 0, no: 0 }]));
    votes.forEach((vote) => { totals[vote.vote_date][vote.choice] += 1; });

    $("#summary-content").innerHTML = `<div class="table-card"><table>
      <thead><tr><th>Giocatore</th>${dates.map((date) => `<th title="${escapeHtml(dateLong.format(date))}">${escapeHtml(dateLong.format(date).slice(0, 3))}<br>${dateShort.format(date)}</th>`).join("")}</tr></thead>
      <tbody>
        ${players.map((player) => `<tr><td>${escapeHtml(player.name)}</td>${dates.map((date) => {
          const choice = voteMap.get(`${player.id}:${toISODate(date)}`);
          return `<td><span class="vote-badge ${choice ?? "empty"}" title="${choice ? choiceMeta[choice].label : "Non votato"}">${choice ? choiceMeta[choice].short : "—"}</span></td>`;
        }).join("")}</tr>`).join("")}
        <tr><td><strong>Totale Sì</strong></td>${dates.map((date) => `<td><strong>${totals[toISODate(date)].yes}</strong></td>`).join("")}</tr>
      </tbody>
    </table></div>`;
  }

async function handleGameSearch(event) {

  const term = event.target.value.trim();

  const games =
    await searchBggGames(term);

  const list = $("#bgg-suggestions");

  if (!list) return;

  list.innerHTML =
    games
      .map(g =>
        `<option value="${g.game_name}">`)
      .join("");
}

  async function submitProposal(event) {

  event.preventDefault();

  if (!state.currentPlayer)
    return toast(
      "Seleziona prima il tuo giocatore.",
      true
    );

  const title =
    $("#proposal-title").value.trim();

  let bggUrl =
    $("#proposal-url").value.trim();

  const notes =
    $("#proposal-notes").value.trim();

  if (
    bggUrl &&
    !isBggUrl(bggUrl)
  ) {
    return toast(
      "Se inserito, il link deve essere un URL BoardGameGeek valido.",
      true
    );
  }

  if (!bggUrl) {
    bggUrl = await findBggGame(title);
  }

  const button = event.submitter;

  setButtonBusy(
    button,
    true,
    "Aggiunta…"
  );

  try {

    const { error } =
      await state.client
        .from("game_proposals")
        .insert({
          week_start: state.weekStart,
          title,
          bgg_url: bggUrl,
          notes: notes || null,
          proposed_by_player_id:
            state.currentPlayer.id
        });

    if (error) throw error;

    event.target.reset();

    toast("Gioco proposto.");

    await loadProposals();

  } catch (error) {

    toast(
      readableError(error),
      true
    );

  } finally {

    setButtonBusy(
      button,
      false
    );
  }
}

  async function loadProposals() {
    const { data, error } = await state.client
      .from("game_proposals")
      .select("id,title,bgg_url,notes,created_at,created_by,players(name)")
      .eq("week_start", state.weekStart)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const list = $("#proposal-list");
    if (!data?.length) return empty(list, "Nessuna proposta per questa settimana.");

    list.innerHTML = data.map((proposal) => {
      const canDelete = state.isAdmin || proposal.created_by === state.session?.user?.id;
      return `<article class="list-card">
        <div class="list-card-header"><div><h3>${escapeHtml(proposal.title)}</h3><div class="meta">Proposto da ${escapeHtml(proposal.players?.name ?? "Giocatore")}</div></div>
        ${canDelete ? `<button class="danger-button" data-delete-proposal="${proposal.id}" type="button">Rimuovi</button>` : ""}</div>
        <p><a href="${escapeAttribute(proposal.bgg_url)}" target="_blank" rel="noopener noreferrer">Apri su BoardGameGeek ↗</a></p>
        ${proposal.notes ? `<p class="notes">${escapeHtml(proposal.notes)}</p>` : ""}
      </article>`;
    }).join("");
    $$("[data-delete-proposal]").forEach((button) => button.addEventListener("click", () => deleteProposal(button.dataset.deleteProposal)));
  }

  async function deleteProposal(id) {
    if (!window.confirm("Rimuovere questa proposta?")) return;
    const { error } = await state.client.from("game_proposals").delete().eq("id", id);
    if (error) return toast(readableError(error), true);
    toast("Proposta rimossa.");
    await loadProposals();
  }

  async function loadRanking() {
    const { data, error } = await state.client
      .from("standings")
      .select("player_id,player_name,wins,last_places,games_recorded")
      .order("wins", { ascending: false })
      .order("last_places", { ascending: true })
      .order("player_name", { ascending: true });
    if (error) throw error;
    const target = $("#ranking-content");
    if (!data?.length) return empty(target, "La classifica è vuota: aggiungi i giocatori dalla scheda Giocatori.");

    target.innerHTML = `<table><thead><tr><th>#</th><th>Giocatore</th><th>Vittorie</th><th>Ultimi posti</th><th>Risultati</th></tr></thead><tbody>
      ${data.map((row, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(row.player_name)}</strong></td><td>${row.wins}</td><td>${row.last_places}</td><td>${row.games_recorded}</td></tr>`).join("")}
    </tbody></table>`;
  }

  async function recordResult(event) {
    event.preventDefault();
    if (!state.isAdmin) return toast("Sessione amministratore richiesta.", true);
    const playedOn = $("#result-date").value;
    const gameName = $("#result-game").value.trim();
    const bggUrl = $("#result-url").value.trim();
    const winnerId = $("#result-winner").value;
    const lastId = $("#result-last").value;
    const notes = $("#result-notes").value.trim();
    if (winnerId === lastId) return toast("Vincitore e ultimo classificato devono essere diversi.", true);
    if (bggUrl && !isBggUrl(bggUrl)) return toast("Il link deve essere un URL HTTPS BoardGameGeek nella sezione /boardgame/.", true);

    const button = event.submitter;
    setButtonBusy(button, true, "Registrazione…");
    try {
      const { error } = await state.client.from("game_results").insert({
        played_on: playedOn,
        week_start: toISODate(startOfWeek(fromISODate(playedOn))),
        game_name: gameName,
        bgg_url: bggUrl || null,
        winner_player_id: winnerId,
        last_player_id: lastId,
        notes: notes || null
      });
      if (error) throw error;
      event.target.reset();
      $("#result-date").value = toISODate(new Date());
      fillResultPlayerSelects();
      toast("Risultato registrato.");
      await loadHistory();
    } catch (error) {
      toast(readableError(error), true);
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function loadHistory() {
    const { data, error } = await state.client
      .from("game_history")
      .select("id,played_on,game_name,bgg_url,notes,winner_name,last_name,created_at")
      .order("played_on", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    const list = $("#history-list");
    if (!data?.length) return empty(list, "Lo storico è vuoto. Un amministratore può registrare il primo risultato.");

    list.innerHTML = data.map((result) => `<article class="list-card">
      <div class="list-card-header"><div><h3>${escapeHtml(result.game_name)}</h3><div class="meta">${escapeHtml(dateHistory.format(fromISODate(result.played_on)))}</div></div>
      ${state.isAdmin ? `<button class="danger-button" data-delete-result="${result.id}" type="button">Elimina</button>` : ""}</div>
      ${result.bgg_url ? `<p><a href="${escapeAttribute(result.bgg_url)}" target="_blank" rel="noopener noreferrer">BoardGameGeek ↗</a></p>` : ""}
      <div class="result-grid"><div><span class="field-label">Vincitore</span><strong>🏆 ${escapeHtml(result.winner_name)}</strong></div><div><span class="field-label">Ultimo</span><strong>🔻 ${escapeHtml(result.last_name)}</strong></div></div>
      ${result.notes ? `<p class="notes">${escapeHtml(result.notes)}</p>` : ""}
    </article>`).join("");
    $$("[data-delete-result]").forEach((button) => button.addEventListener("click", () => deleteResult(button.dataset.deleteResult)));
  }

  async function deleteResult(id) {
    if (!window.confirm("Eliminare definitivamente questo risultato? La classifica verrà aggiornata.")) return;
    const { error } = await state.client.from("game_results").delete().eq("id", id);
    if (error) return toast(readableError(error), true);
    toast("Risultato eliminato.");
    await loadHistory();
  }

  async function adminLogin(event) {
    event.preventDefault();
    const pin = $("#admin-pin").value;
    const button = event.submitter;
    setButtonBusy(button, true, "Verifica…");
    try {
      const { data, error } = await state.client.rpc("admin_login", { p_pin: pin });
      if (error) throw error;
      if (!data) return toast("PIN non valido o accesso temporaneamente bloccato.", true);
      state.isAdmin = true;
      event.target.reset();
      renderAdminUi();
      await loadAdminPlayers();
      toast("Modalità amministratore attiva per 8 ore.");
    } catch (error) {
      toast(readableError(error), true);
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function adminLogout() {
    const { error } = await state.client.rpc("admin_logout");
    if (error) return toast(readableError(error), true);
    state.isAdmin = false;
    renderAdminUi();
    toast("Modalità amministratore disattivata.");
  }

  async function addPlayer(event) {
    event.preventDefault();
    const name = $("#new-player-name").value.trim();
    const button = event.submitter;
    setButtonBusy(button, true, "Aggiunta…");
    try {
      const { error } = await state.client.from("players").insert({ name });
      if (error) throw error;
      event.target.reset();
      await loadPlayers();
      renderPlayerUi();
      await loadAdminPlayers();
      toast("Giocatore aggiunto con classifica a zero.");
    } catch (error) {
      toast(readableError(error), true);
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function loadAdminPlayers() {
    if (!state.isAdmin) return;
    const { data, error } = await state.client.rpc("admin_list_players");
    if (error) throw error;
    const list = $("#admin-player-list");
    if (!data?.length) return empty(list, "Nessun giocatore. Aggiungi il primo usando il modulo sopra.");

    list.innerHTML = data.map((player) => `<article class="list-card">
      <div class="list-card-header"><div><h3>${escapeHtml(player.name)}</h3><span class="pill ${player.active ? "active" : ""}">${player.active ? "Attivo" : "Archiviato"}</span> <span class="pill">${player.is_claimed ? "Associato" : "Libero"}</span></div>
      <div><button class="secondary-button compact" data-toggle-player="${player.id}" data-next-active="${!player.active}" type="button">${player.active ? "Archivia" : "Riattiva"}</button></div></div>
      ${player.is_claimed ? `<p><button class="danger-button" data-release-player="${player.id}" type="button">Libera associazione</button></p>` : ""}
    </article>`).join("");
    $$("[data-toggle-player]").forEach((button) => button.addEventListener("click", () => togglePlayer(button.dataset.togglePlayer, button.dataset.nextActive === "true")));
    $$("[data-release-player]").forEach((button) => button.addEventListener("click", () => releasePlayer(button.dataset.releasePlayer)));
  }

  async function togglePlayer(id, active) {
    const { error } = await state.client.from("players").update({ active }).eq("id", id);
    if (error) return toast(readableError(error), true);
    await loadPlayers();
    renderPlayerUi();
    await loadAdminPlayers();
    toast(active ? "Giocatore riattivato." : "Giocatore archiviato.");
  }

  async function releasePlayer(id) {
    if (!window.confirm("Liberare l’associazione di questo giocatore? Potrà essere selezionato da un altro accesso.")) return;
    const { error } = await state.client.rpc("admin_release_player", { p_player_id: id });
    if (error) return toast(readableError(error), true);
    if (state.currentPlayer?.id === id) {
      state.currentPlayer = null;
      await loadCurrentPlayer();
    }
    renderPlayerUi();
    await loadAdminPlayers();
    toast("Associazione liberata.");
  }

  function fillResultPlayerSelects() {
    const active = state.players.filter((player) => player.active);
    const options = ['<option value="">Scegli…</option>', ...active.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`)].join("");
    $("#result-winner").innerHTML = options;
    $("#result-last").innerHTML = options;
    if (!$("#result-date").value) $("#result-date").value = toISODate(new Date());
  }

  function subscribeRealtime() {
    if (state.realtime) state.client.removeChannel(state.realtime);
    state.realtime = state.client
      .channel("serata-ludica-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, scheduleLiveRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_proposals" }, scheduleLiveRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_results" }, scheduleLiveRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, scheduleLiveRefresh)
      .subscribe();
  }

  function scheduleLiveRefresh() {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(async () => {
      try {
        await loadPlayers();
        renderPlayerUi();
        await loadActiveTab();
      } catch (error) {
        console.error(error);
      }
    }, 250);
  }

  function setWeek(date) {
    state.weekStart = toISODate(startOfWeek(date));
    updateWeekUi();
    loadActiveTab();
  }

  function shiftWeek(days) {
    const date = fromISODate(state.weekStart);
    date.setDate(date.getDate() + days);
    setWeek(date);
  }

  function updateWeekUi() {
    const dates = weekDates();
    const first = dates[0];
    const last = dates[6];
    const sameMonth = first.getMonth() === last.getMonth();
    const firstPart = sameMonth ? String(first.getDate()) : dateShort.format(first);
    $("#week-label").textContent = `${firstPart} – ${dateHistory.format(last)}`;
    $("#week-input").value = toISOWeekValue(first);
  }

  function weekDates() {
    const monday = fromISODate(state.weekStart);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }

  function startOfWeek(input) {
    const date = new Date(input);
    date.setHours(12, 0, 0, 0);
    const delta = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - delta);
    return date;
  }

  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function fromISODate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function toISOWeekValue(date) {
    const target = new Date(date);
    target.setHours(12, 0, 0, 0);
    target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
    const week1 = new Date(target.getFullYear(), 0, 4, 12);
    const week = 1 + Math.round(((target - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${target.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  function isoWeekToMonday(value) {
    const match = /^(\d{4})-W(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    const jan4 = new Date(year, 0, 4, 12);
    const monday = startOfWeek(jan4);
    monday.setDate(monday.getDate() + (week - 1) * 7);
    return monday;
  }

  function isBggUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      return url.protocol === "https:" && (host === "boardgamegeek.com" || host === "www.boardgamegeek.com") && url.pathname.startsWith("/boardgame/");
    } catch {
      return false;
    }
  }

  function empty(target, message) {
    target.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function renderUnavailable(message) {
    ["#vote-days", "#summary-content", "#proposal-list", "#ranking-content", "#history-list"].forEach((selector) => empty($(selector), message));
    $$("button, input, select, textarea").forEach((element) => { element.disabled = true; });
  }

  function fatal(message) {
    $("#loading").classList.add("hidden");
    $("#app").setAttribute("aria-busy", "false");
    toast(message, true, 12000);
    renderUnavailable(message);
  }

  let toastTimer;
  function toast(message, isError = false, duration = 3200) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.toggle("error", isError);
    element.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => element.classList.remove("show"), duration);
  }

  function setButtonBusy(button, busy, busyText = "Attendi…") {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = busyText;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function readableError(error) {
    const message = error?.message || String(error || "Errore sconosciuto");
    const dictionary = [
      [/anonymous sign-ins are disabled/i, "Abilita gli accessi anonimi nelle impostazioni Auth di Supabase."],
      [/duplicate key.*players_name/i, "Esiste già un giocatore con questo nome."],
      [/player_already_claimed/i, "Questo giocatore è già associato a un altro accesso."],
      [/user_already_has_player/i, "Questo accesso ha già un giocatore associato."],
      [/admin_not_configured/i, "Il PIN amministratore non è ancora configurato in Supabase."],
      [/new row violates row-level security/i, "Operazione non autorizzata dalle regole di sicurezza."],
      [/Failed to fetch/i, "Connessione a Supabase non riuscita. Verifica URL, chiave anon e rete."]
    ];
    const match = dictionary.find(([pattern]) => pattern.test(message));
    return match ? match[1] : message;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
