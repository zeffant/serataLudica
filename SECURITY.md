# Sicurezza

## Principi applicati

- Nessuna chiave privilegiata nel browser: il client usa solo la chiave Supabase anon/publishable.
- Tutte le tabelle applicative hanno Row Level Security attiva.
- Nessun privilegio dati è concesso al ruolo `anon`; dopo `signInAnonymously()` la sessione usa il ruolo `authenticated`.
- Ogni identità anonima può associare un solo giocatore e ogni giocatore una sola identità.
- I voti sono scrivibili soltanto per il giocatore associato alla sessione.
- Le proposte sono eliminabili dal loro autore o da un amministratore.
- Giocatori e risultati sono modificabili soltanto durante una sessione amministratore valida.
- Il PIN amministratore viene memorizzato con bcrypt tramite `pgcrypto`, mai in chiaro.
- Dopo cinque tentativi falliti l’identità viene bloccata per 15 minuti.
- La sessione amministratore scade dopo 8 ore e viene revocata quando il PIN viene ruotato.
- Le funzioni `security definer` impostano esplicitamente il `search_path`.
- Titoli, nomi e note vengono sottoposti a escaping prima dell’inserimento nel DOM.
- I link BoardGameGeek devono essere HTTPS, usare il dominio previsto e iniziare con `/boardgame/`; i link esterni usano `rel="noopener noreferrer"`.
- La Content Security Policy limita script, connessioni, immagini e oggetti.

## Limite del modello anonimo

L’identità anonima protegge la separazione tra giocatori già associati, ma non verifica l’identità reale della persona. Chi riceve il link può creare una sessione anonima e associare un giocatore ancora libero. Condividere quindi l’app soltanto con il gruppo previsto.

Se serve identità forte, sostituire `signInAnonymously()` con Magic Link/OTP email o OAuth e associare gli utenti autenticati ai giocatori. Le policy basate su `auth.uid()` rimangono un buon punto di partenza.

## Segreti

Non inserire mai nel repository:

- `service_role` key;
- password del database;
- access token personali;
- PIN amministratore in chiaro;
- backup con dati personali.

La chiave anon/publishable e il Project URL sono valori client pubblici. La sicurezza non deve dipendere dalla loro segretezza.

## Rotazione e revoca

- **PIN admin:** rieseguire `supabase/002_set_admin_pin.sql` con un nuovo valore. Le sessioni admin vengono eliminate.
- **Chiave client:** ruotarla nel dashboard Supabase e aggiornare `config.js`.
- **Identità giocatore:** usare **Libera associazione** nella scheda Giocatori.
- **Emergenza:** disabilitare temporaneamente Anonymous Sign-Ins o sospendere il progetto, quindi analizzare i log prima di riattivare.

## Policy sintetiche

| Risorsa | Lettura | Scrittura |
|---|---|---|
| Giocatori | utenti autenticati | admin |
| Associazioni | proprietario o admin | solo funzioni controllate |
| Voti | utenti autenticati | giocatore associato |
| Proposte | utenti autenticati | autore; admin per rimozione |
| Risultati | utenti autenticati | admin |
| Credenziale admin | nessuna API pubblica | solo SQL Editor/proprietario DB |
| Sessioni e tentativi admin | nessuna API diretta | solo funzioni controllate |

## Segnalazioni

Per una vulnerabilità, non pubblicare PIN, token o dati reali in una issue pubblica. Usa un canale privato del proprietario del repository e includi passaggi di riproduzione privi di dati sensibili.
