// The legacy ocean is loaded only on request.
if (new URLSearchParams(location.search).get('experience') === 'legacy') {
  import('./legacy-shell.html?raw').then(({ default: html }) => {
    const legacy = new DOMParser().parseFromString(html, 'text/html');
    document.title = legacy.title;
    for (const style of legacy.querySelectorAll('style')) document.head.appendChild(style);
    for (const script of legacy.querySelectorAll('script')) script.remove();
    document.body.replaceChildren(...legacy.body.childNodes);
    return import('./legacy.js');
  }).catch(error => { console.error(error); document.body.textContent = `Legacy ocean could not start: ${error.message}`; });
} else {
  import('./miner/main.js').catch(error => {
    console.error(error);
    document.body.textContent = `ABYSS//MINER could not start: ${error.message}`;
  });
}
