'use strict';
// Finestre dell'interfaccia al posto di alert/confirm/prompt del browser: stesso stile dell'app,
// testi tradotti, Invio per confermare ed Esc per annullare. Restituiscono una Promise.

let uiDialogQueue = Promise.resolve();

/**
 * Apre la finestra e risolve con { ok, value }. Una finestra alla volta: le richieste successive
 * attendono la chiusura della precedente.
 */
function uiDialog({ title = '', message = '', input = null, okLabel = 'OK', cancelLabel = 'Annulla', danger = false, cancel = true }) {
  const run = () => new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'ui-dialog';
    const t = (s) => (typeof tr === 'function' ? tr(String(s)) : String(s));
    dlg.innerHTML = `
      <form method="dialog">
        ${title ? '<h2></h2>' : ''}
        ${message ? '<p class="ui-msg"></p>' : ''}
        ${input ? '<input type="text" class="ui-input" autocomplete="off">' : ''}
        <menu>
          ${cancel ? '<button type="button" class="ui-cancel"></button>' : ''}
          <button type="submit" class="ui-ok ${danger ? 'danger' : 'primary'}"></button>
        </menu>
      </form>`;
    if (title) dlg.querySelector('h2').textContent = t(title);
    if (message) dlg.querySelector('.ui-msg').textContent = t(message);
    dlg.querySelector('.ui-ok').textContent = t(okLabel);
    if (cancel) dlg.querySelector('.ui-cancel').textContent = t(cancelLabel);
    const field = dlg.querySelector('.ui-input');
    if (field) {
      field.value = input.value ?? '';
      field.maxLength = input.max || 200;
      if (input.placeholder) field.placeholder = t(input.placeholder);
    }
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      const value = field ? field.value.trim() : null;
      dlg.close();
      dlg.remove();
      resolve({ ok, value });
    };
    dlg.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (field && !field.value.trim()) { field.focus(); return; }
      finish(true);
    });
    if (cancel) dlg.querySelector('.ui-cancel').addEventListener('click', () => finish(false));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(!cancel); });
    // i tasti restano nella finestra (spazio, I, O… non comandano il trasporto)
    dlg.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    if (field) { field.focus(); field.select(); } else dlg.querySelector('.ui-ok').focus();
  });
  const p = uiDialogQueue.then(run);
  uiDialogQueue = p.catch(() => {});
  return p;
}

/** Messaggio con un solo pulsante. */
function uiAlert(message, { title = '' } = {}) {
  return uiDialog({ title, message, cancel: false }).then(() => undefined);
}

/** Richiesta di conferma: true se confermata. */
function uiConfirm(message, { title = '', ok = 'OK', danger = false } = {}) {
  return uiDialog({ title, message, okLabel: ok, danger }).then((r) => r.ok);
}

/** Richiesta di un testo: il testo inserito (senza spazi ai bordi) oppure null se annullata. */
function uiPrompt(title, value = '', { message = '', ok = 'OK', max = 80, placeholder = '' } = {}) {
  return uiDialog({ title, message, input: { value, max, placeholder }, okLabel: ok }).then((r) => (r.ok && r.value ? r.value : null));
}
