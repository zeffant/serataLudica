# Configurazione e distribuzione

## 1. Prerequisiti

- account Supabase;
- account GitHub `zeffant`;
- Git installato, oppure caricamento dei file dall’interfaccia web GitHub;
- un PIN amministratore nuovo di almeno 12 caratteri.

## 2. Creare e preparare Supabase

1. Crea un nuovo progetto dal dashboard Supabase.
2. Attendi che il database sia disponibile.
3. Apri **SQL Editor**.
4. Incolla ed esegui l’intero file `supabase/001_schema.sql`.
5. Apri `supabase/002_set_admin_pin.sql` in locale.
6. Sostituisci `<INSERISCI_UN_PIN_ADMIN_FORTE_DI_ALMENO_12_CARATTERI>` con il PIN scelto, senza parentesi angolari.
7. Esegui lo script modificato nel SQL Editor. Il PIN viene salvato come hash bcrypt; il testo non viene conservato.
8. Esegui `supabase/verify.sql`. Tutte le righe `rls_enabled` devono risultare `true`, le sette funzioni devono essere presenti e `admin_pin_configured` deve risultare `true`.

### Abilitare gli accessi anonimi

Nel dashboard Supabase apri la configurazione di **Authentication** e abilita **Anonymous Sign-Ins**. La posizione esatta può cambiare nell’interfaccia, ma l’opzione deve essere attiva affinché `signInAnonymously()` funzioni.

Non è necessario disabilitare la conferma email, perché l’app non usa account email.

### Recuperare i due valori pubblici

Dalla sezione API/Connect del progetto copia:

- **Project URL**;
- chiave client **anon** o **publishable**.

Non usare mai la chiave `service_role`, la password del database o un access token personale nel client o nel repository.

## 3. Configurare il client

Apri `config.js` e sostituisci i due segnaposto:

```js
window.SERATA_LUDICA_CONFIG = Object.freeze({
  SUPABASE_URL: "https://<PROJECT_REF>.supabase.co",
  SUPABASE_ANON_KEY: "<SUPABASE_ANON_KEY>",
  APP_NAME: "Serata Ludica"
});
```

Mantieni `https://` e non aggiungere una barra finale all’URL. `config.example.js` resta come modello.

La chiave anon/publishable è progettata per essere visibile nel browser. La protezione effettiva dei dati è fornita dalle policy RLS in `001_schema.sql`.

## 4. Aggiungere i giocatori

Metodo consigliato:

1. avvia o pubblica l’app;
2. apri la scheda **Giocatori** (ultima a destra);
3. inserisci il PIN amministratore;
4. usa **Aggiungi** per inserire i nomi reali.

In alternativa, modifica ed esegui `supabase/003_seed_players.example.sql`. Il file è commentato e non inserisce segnaposto per errore.

Non servono righe iniziali per classifica e storico: la vista della classifica calcola automaticamente gli zero; lo storico deriva direttamente dai risultati registrati.

## 5. Pubblicare su GitHub Pages

### Creare il repository

Crea un repository nell’account `zeffant`. Sostituisci `<NOME_REPOSITORY>` nei comandi seguenti con il nome effettivamente scelto.

```bash
cd serata-ludica
git init
git branch -M main
git add .
git commit -m "Prima versione Serata Ludica"
git remote add origin https://github.com/zeffant/<NOME_REPOSITORY>.git
git push -u origin main
```

La stringa con `<NOME_REPOSITORY>` è un modello, non un URL già esistente.

### Attivare Pages

1. Nel repository apri **Settings → Pages**.
2. Come sorgente scegli **GitHub Actions**.
3. Il workflow `.github/workflows/deploy-pages.yml` pubblica automaticamente ogni push su `main`.
4. Attendi il completamento del workflow **Deploy GitHub Pages**.
5. Usa esclusivamente l’indirizzo mostrato da GitHub nell’esito del deployment o nelle impostazioni Pages. Non costruire a mano un URL se il nome del repository non è ancora deciso.

### Aggiornamenti successivi

```bash
git add .
git commit -m "Aggiorna Serata Ludica"
git push
```

## 6. Incorporare in Google Sites

1. Apri la pagina di Google Sites in modalità modifica.
2. Seleziona **Inserisci → Incorpora → URL**.
3. Incolla l’indirizzo GitHub Pages effettivamente pubblicato.
4. Conferma l’anteprima e dimensiona il riquadro.
5. Per una buona esperienza mobile assegna al riquadro tutta la larghezza disponibile e un’altezza iniziale di almeno 760 px.
6. Pubblica Google Sites e prova il risultato sia su smartphone sia su desktop.

L’app non imposta `X-Frame-Options` né una direttiva `frame-ancestors`, quindi i file statici di GitHub Pages possono essere incorporati. Se in futuro viene introdotto un proxy o un altro hosting, verificare che non aggiunga intestazioni che vietano gli iframe.

## 7. Uso amministrativo

### Registrare un risultato

1. Vai su **Giocatori** e attiva la modalità amministratore con il PIN.
2. Vai su **Storico**.
3. Compila data, gioco, vincitore e ultimo classificato; il link BoardGameGeek è facoltativo ma, se presente, deve usare HTTPS e il percorso `/boardgame/`.
4. Salva. Classifica e storico si aggiornano automaticamente.

### Gestire un cambio dispositivo

L’identità anonima è memorizzata nel browser. Se un giocatore cambia dispositivo, cancella i dati del browser o seleziona per errore:

1. entra come amministratore;
2. apri **Giocatori**;
3. scegli **Libera associazione** per quel giocatore;
4. dal nuovo dispositivo seleziona nuovamente il giocatore.

I voti storici restano associati al giocatore e non vengono eliminati.

### Ruotare il PIN

Scegli un nuovo PIN, modifica `supabase/002_set_admin_pin.sql` ed eseguilo di nuovo. Lo script sostituisce l’hash e revoca tutte le sessioni amministratore attive.

## 8. Backup e ripristino

Prima di modifiche importanti esporta almeno queste tabelle dal dashboard o con gli strumenti Supabase:

- `players`;
- `votes`;
- `game_proposals`;
- `game_results`.

Le tabelle `admin_sessions` e `admin_login_attempts` sono temporanee. `app_user_players` può essere esportata, ma le identità anonime dipendono anche dagli utenti in Supabase Auth.

## 9. Risoluzione problemi

| Sintomo | Controllo |
|---|---|
| “Configurazione incompleta” | Sostituisci entrambi i segnaposto in `config.js`. |
| Accesso anonimo disabilitato | Abilita **Anonymous Sign-Ins** in Supabase Authentication. |
| Errore di rete | Verifica Project URL, chiave anon/publishable, CSP e disponibilità del progetto. |
| PIN amministratore non configurato | Esegui `002_set_admin_pin.sql` dopo aver sostituito il segnaposto. |
| Giocatore già associato | Un admin deve usare **Libera associazione**. |
| Scrittura negata da RLS | Verifica associazione del giocatore, sessione admin e risultato di `verify.sql`. |
| Dati non aggiornati in tempo reale | Controlla che le quattro tabelle siano nella publication `supabase_realtime`; il pulsante ↻ aggiorna comunque manualmente. |
| Link BoardGameGeek rifiutato | Usa `https://boardgamegeek.com/boardgame/...` oppure il dominio con `www`. |
