# Checklist di collaudo

Eseguire su un progetto Supabase di prova prima del rilascio definitivo.

## Installazione

- [ ] `001_schema.sql` termina senza errori.
- [ ] `002_set_admin_pin.sql` rifiuta il segnaposto e accetta un PIN reale di almeno 12 caratteri.
- [ ] `verify.sql` restituisce `rls_enabled = true` per tutte e sette le tabelle.
- [ ] `admin_pin_configured = true`.
- [ ] Anonymous Sign-Ins è abilitato.
- [ ] `config.js` contiene Project URL e chiave anon/publishable, non la `service_role`.

## Stato iniziale

- [ ] Storico vuoto.
- [ ] Nessuna proposta o voto.
- [ ] Dopo l’aggiunta di un giocatore, la classifica mostra tutti i valori a zero.

## Giocatori e sicurezza

- [ ] Il PIN errato non attiva l’amministrazione.
- [ ] Il PIN corretto mostra gestione giocatori e modulo risultati.
- [ ] È possibile aggiungere, archiviare e riattivare un giocatore.
- [ ] Una sessione anonima può associare un giocatore libero.
- [ ] Una seconda sessione/browser non può associare lo stesso giocatore.
- [ ] L’amministratore può liberare l’associazione.
- [ ] Senza sessione admin non è possibile scrivere direttamente giocatori o risultati tramite API.
- [ ] Un utente non può scrivere voti per un giocatore diverso da quello associato.

## Voti e riepilogo

- [ ] Il selettore di settimana cambia correttamente lunedì–domenica.
- [ ] Precedente, successiva e Oggi funzionano.
- [ ] Sì, Forse e No vengono salvati e possono essere modificati.
- [ ] Il riepilogo mostra tutti i giocatori e i voti della settimana selezionata.
- [ ] Il totale dei Sì è corretto.
- [ ] Un secondo browser riceve gli aggiornamenti Realtime oppure li vede con ↻.

## Giochi

- [ ] Una proposta richiede titolo e link BoardGameGeek.
- [ ] URL non HTTPS, dominio diverso o percorso diverso da `/boardgame/` vengono rifiutati.
- [ ] L’autore può rimuovere la propria proposta.
- [ ] Un altro giocatore non amministratore non può rimuoverla.

## Risultati, classifica e storico

- [ ] Solo l’admin può registrare un risultato.
- [ ] Vincitore e ultimo classificato devono essere diversi.
- [ ] Il salvataggio incrementa una vittoria e un ultimo posto corretti.
- [ ] Lo storico mostra data, gioco, vincitore, ultimo e link opzionale.
- [ ] Eliminando il risultato, classifica e storico tornano coerenti.

## GitHub Pages e Google Sites

- [ ] Il workflow Pages termina correttamente.
- [ ] L’app si apre dal vero indirizzo pubblicato da GitHub.
- [ ] Nessun segnaposto rimane in `config.js`.
- [ ] L’app si incorpora in Google Sites.
- [ ] La barra inferiore mantiene **Giocatori** come ultima scheda a destra.
- [ ] Il layout è utilizzabile a 320 px di larghezza, su smartphone e desktop.
- [ ] Non ci sono errori nella console del browser durante i flussi principali.
