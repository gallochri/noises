---
name: lavoro-finito
description: Chiude un blocco di lavoro su Noises. Se servono, aggiorna README e sito, poi fa commit, push, tag di versione e rilascio GitHub con le note. Da usare quando l'utente scrive /lavoro-finito.
disable-model-invocation: true
---

# Lavoro finito

Chiudi il lavoro fatto dall'ultimo rilascio. Rispondi sempre in italiano.

## 1. Cosa è cambiato

- Guarda `git status`, `git diff` e i commit dall'ultimo tag (`git describe --tags --abbrev=0`, poi `git log <tag>..HEAD`).
- Se non c'è niente da rilasciare (nessuna modifica e nessun commit dopo l'ultimo tag), dillo e fermati.

## 2. README e sito, solo se serve

Aggiornali **solo** se ci sono funzionalità nuove o cambiate in modo visibile per chi usa Noises: comandi, pulsanti, API, configurazione, formato dei dati.
Le correzioni di bug e i ritocchi grafici non richiedono aggiornamenti.

- `README.md`: aggiorna le sezioni **Funzionalità**, **Guida all'uso**, **Dati**, **API** e **Configurazione**, quelle che servono.
- Sito: `docs/index.html` (italiano) e `docs/en/index.html` (inglese), sempre entrambi e con lo stesso contenuto. Aggiungi o modifica i punti delle sezioni esistenti; crea una sezione nuova solo per una funzionalità grande.
- Dopo una modifica al sito, controllalo con uno screenshot (Playwright nello scratchpad).

## 3. Versione

- Versione nuova secondo semver, partendo dall'ultimo tag:
  - **patch** (x.y.Z): solo correzioni o piccoli ritocchi;
  - **minor** (x.Y.0): funzionalità nuove;
  - **major**: solo se l'utente lo chiede.
- Aggiorna la versione in tre posti:
  - `backend/Cargo.toml` (`version = …`);
  - `backend/Cargo.lock` (il pacchetto `noises`);
  - il badge `versione-X.Y.Z` in `README.md`.
- Ricostruisci e riavvia con `make up`: deve partire senza errori.

## 4. Commit e push

- Lavori su `main`. Fai un commit con un messaggio in italiano: un titolo breve e un elenco delle modifiche.
- Chiudi il messaggio del commit con la riga di attribuzione indicata nelle istruzioni della sessione, se presente.
- `git push origin main`.

## 5. Tag e rilascio

- `git tag -a vX.Y.Z -m "Noises X.Y.Z"` e `git push origin vX.Y.Z`.
- Crea il rilascio con `gh release create vX.Y.Z --title "Noises X.Y.Z" --notes-file <file nello scratchpad>`.
- Scrivi le note di rilascio sullo schema dei rilasci precedenti (`gh release view <tag precedente>`):
  - `## Novità`, con sottosezioni `###` per argomento;
  - `### Correzioni`, se ce ne sono;
  - `### Aggiornamento`: `make pull`, oppure `git pull && make up`, più le note su configurazione o dati se servono;
  - `## What's new (English)`: un riassunto breve in inglese;
  - chiudi con la riga di attribuzione per i PR indicata nelle istruzioni della sessione, se presente.

## 6. Verifica

- `gh run list -L 4`: controlla che la CI dell'immagine Docker sia partita per `main` e per il tag.
- Se una CI precedente è fallita, leggi il motivo (`gh run view <id> --log-failed`) e riferiscilo.
- Alla fine riepiloga all'utente: versione, link al rilascio, cosa è stato aggiornato tra README e sito, e lo stato della CI. Ricorda che la CI impiega 20–30 minuti.
