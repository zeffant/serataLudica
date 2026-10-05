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

