/* Contacto: tocar el correo lo copia al portapapeles y lo confirma durante 2,4 s. */

const CONFIRM_MS = 2400;

export function initContact(): void {
  const button = document.querySelector<HTMLButtonElement>('.clist [data-copy]');
  const icon = button?.querySelector<HTMLElement>('.cic .ic2');
  const note = button?.querySelector<HTMLElement>('.note');
  if (!button || !icon || !note) return;
  const text = button.dataset.copy || '';
  let timer = 0;

  const setCopied = (on: boolean) => {
    button.classList.toggle('copied', on);
    icon.className = 'ic2 ' + (on ? 'ci-check' : 'ci-mail');
    note.textContent = (on ? button.dataset.copied : button.dataset.note) || '';
  };

  const done = () => {
    setCopied(true);
    clearTimeout(timer);
    timer = window.setTimeout(() => setCopied(false), CONFIRM_MS);
  };

  /* respaldo para navegadores sin acceso al portapapeles */
  const fallback = () => {
    const a = document.createElement('textarea');
    a.value = text;
    a.setAttribute('readonly', '');
    a.style.position = 'fixed';
    a.style.top = '0';
    a.style.opacity = '0';
    document.body.appendChild(a);
    a.focus({ preventScroll: true });
    a.select();
    try {
      document.execCommand('copy');
    } catch {
      /* sin portapapeles: igual se muestra el correo */
    }
    document.body.removeChild(a);
    done();
  };

  button.addEventListener('click', () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    } catch {
      fallback();
    }
  });
}
