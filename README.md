# Serata Ludica

Applicazione web mobile-first per organizzare una serata di giochi da tavolo. È composta da file statici, si pubblica con GitHub Pages e usa Supabase per autenticazione anonima, database, Row Level Security e aggiornamenti Realtime.

## Funzioni incluse

- selezione della settimana ISO, con navigazione precedente/successiva e ritorno a oggi;
- associazione sicura dell’accesso anonimo al proprio giocatore;
- voto **Sì / Forse / No** per ognuno dei sette giorni;
- riepilogo condiviso di tutti i voti e totale giornaliero dei “Sì”;
- proposte settimanali di giochi con link HTTPS BoardGameGeek;
- classifica con tutti i nuovi giocatori a zero, ordinata per vittorie e poi per minor numero di ultimi posti;
- storico inizialmente vuoto;
- registrazione manuale, da amministratore, di vincitore e ultimo classificato;
- gestione giocatori nell’ultima scheda a destra: aggiunta, archiviazione/riattivazione e liberazione dell’associazione;
- layout responsive e incorporabile in Google Sites;
- RLS, PIN amministratore memorizzato solo come hash, rate limit per i tentativi e sessione admin di 8 ore.

## Struttura

```text
serata-ludica/
├── .github/workflows/deploy-pages.yml
├── assets/icon.svg
├── docs/
│   ├── CONFIGURAZIONE_E_DEPLOY.md
│   └── TEST_CHECKLIST.md
├── supabase/
│   ├── 001_schema.sql
│   ├── 002_set_admin_pin.sql
│   ├── 003_seed_players.example.sql
│   └── verify.sql
├── .nojekyll
├── app.js
├── config.example.js
├── config.js
├── index.html
├── manifest.webmanifest
├── SECURITY.md
└── styles.css
```

## Avvio rapido

1. Crea un progetto Supabase. Non copiare nel repository password del database o chiavi `service_role`.
2. Nel SQL Editor esegui `supabase/001_schema.sql`.
3. Apri `supabase/002_set_admin_pin.sql`, sostituisci il segnaposto con un PIN forte di almeno 12 caratteri ed eseguilo.
4. In Supabase abilita **Anonymous Sign-Ins** in Authentication. Gli utenti anonimi ottengono il ruolo `authenticated`, sul quale sono applicate le policy RLS.
5. In `config.js` sostituisci soltanto:
   - `https://<PROJECT_REF>.supabase.co` con il **Project URL** mostrato da Supabase;
   - `<SUPABASE_ANON_KEY>` con la chiave client **anon/publishable** mostrata da Supabase.
6. Pubblica il contenuto del progetto in un repository dell’account GitHub `zeffant` e abilita GitHub Pages con sorgente **GitHub Actions**.
7. Apri l’app pubblicata, vai su **Giocatori**, accedi come amministratore e aggiungi i nomi reali.

I segnaposto sono intenzionali: il pacchetto non contiene URL, project ID o chiavi Supabase inventati.

## Stato iniziale garantito

Lo script di schema non inserisce giocatori, voti, proposte o risultati. Dopo aver aggiunto i giocatori reali:

- ogni riga della classifica mostra `0` vittorie, `0` ultimi posti e `0` risultati;
- lo storico resta vuoto finché un amministratore registra il primo risultato;
- le proposte e i voti sono vuoti per ogni settimana.

## Modello di accesso

L’app effettua un accesso Supabase anonimo persistente nel browser. Ogni identità anonima può associare un solo giocatore e ogni giocatore può essere associato a una sola identità alla volta. L’utente può quindi scrivere soltanto i voti del giocatore associato. Un amministratore può liberare l’associazione, ad esempio dopo cambio dispositivo o selezione errata.

Questo modello è adatto a un gruppo privato che riceve il link dell’app. Non equivale a un sistema di identità verificata: chi ottiene il link può creare un’identità anonima e associare un giocatore ancora libero. Per un contesto pubblico, sostituire l’accesso anonimo con OTP email o OAuth.

## Sviluppo locale

Servi i file con un web server: non aprire direttamente `index.html` con `file://`.

```bash
python3 -m http.server 8080
```

Poi apri `http://localhost:8080`. Per il test locale usa un progetto Supabase configurato e una copia valida di `config.js`.

## Dipendenza client

`index.html` carica Supabase JS v2 da jsDelivr. Non è richiesto alcun processo di build. La Content Security Policy consente soltanto file locali, quel CDN e connessioni HTTPS/WSS ai domini Supabase.

## Documentazione

- Installazione completa, GitHub Pages e Google Sites: `docs/CONFIGURAZIONE_E_DEPLOY.md`
- Collaudo prima del rilascio: `docs/TEST_CHECKLIST.md`
- Modello di sicurezza e operazioni: `SECURITY.md`

## Licenza

MIT. Vedi `LICENSE`.
