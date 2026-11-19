import { preferenceTitleLabel, type PreferencesExport } from './preferences-export';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

export function makePreferencesHtml(snapshot: PreferencesExport, exportedAt: string): string {
  if (!snapshot.clubs.length || !snapshot.titles.length) throw new Error('No visible preferences are available to export.');
  const clubs = snapshot.clubs.map((club) => club.name);
  const titles = snapshot.titles.map((title) => {
    if (title.cells.length !== clubs.length || title.cells.some((cell, index) => cell.clubId !== snapshot.clubs[index].id)) {
      throw new Error('Preference export columns are inconsistent.');
    }
    if (title.cells.some((cell) => cell.rank !== null && (!Number.isSafeInteger(cell.rank) || cell.rank < 1))) {
      throw new Error('Preference export contains an invalid rank.');
    }
    return { label: preferenceTitleLabel(title), ranks: title.cells.map((cell) => cell.rank) };
  });
  const choices = (names: string[]) => names.map((name, index) =>
    `<label class="choice"><input type="checkbox" data-index="${index}" checked> <span>${escapeHtml(name)}</span></label>`).join('');
  const headers = clubs.map((name) => `<th scope="col">${escapeHtml(name)}</th>`).join('');
  const rows = titles.map(({ label, ranks }) => `<tr><th scope="row"><span class="title-name">${escapeHtml(label)}</span><span class="contested-label" hidden></span></th>${ranks.map((rank) => {
    const band = rank === null ? '' : rank <= 3 ? 'rank-high' : rank <= 6 ? 'rank-middle' : 'rank-low';
    return `<td${rank === null ? '' : ` data-rank="${rank}" class="${band}"`}>${rank ?? ''}</td>`;
  }).join('')}</tr>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Preference grid</title>
<style>
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; font: 16px system-ui, sans-serif; color: #183a36; background: #f3f6f3; }
main { padding: 20px; }
h1 { margin: 0 0 8px; }
p { line-height: 1.5; }
.controls, .table-wrap { background: #fffefa; border: 1px solid #cbd8d2; padding: 16px; margin: 16px 0; }
.controls { display: grid; gap: 12px; }
.searches { display: flex; flex-wrap: wrap; gap: 12px; }
.searches label { display: grid; gap: 4px; flex: 1 1 220px; font-weight: 600; }
input[type=search] { min-height: 44px; padding: 8px; font: inherit; border: 1px solid #65877b; }
input[type=checkbox] { width: 18px; height: 18px; accent-color: #245e51; }
button { min-height: 44px; padding: 8px 12px; font: inherit; color: #244c40; background: #fff; border: 1px solid #65877b; cursor: pointer; }
:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
details { border: 1px solid #cbd8d2; padding: 10px; }
summary { cursor: pointer; font-weight: 700; padding: 4px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.choices { max-height: 240px; overflow: auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 4px; }
.choice { display: flex; align-items: center; gap: 6px; min-height: 36px; overflow-wrap: anywhere; }
.toggles { display: flex; flex-wrap: wrap; gap: 16px; }
.toggles label { display: flex; gap: 6px; align-items: center; }
.legend { color: #344f47; margin: 0; }
.table-wrap { overflow: auto; max-width: 100%; }
table { border-collapse: collapse; min-width: 100%; background: white; }
th, td { border: 1px solid #b6c8bf; padding: 8px; text-align: left; min-width: 90px; }
thead th { background: #e7f0e9; }
tbody th { min-width: 220px; background: #f6f9f6; }
td { text-align: center; }
.rank-high-swatch, .rank-colors td.rank-high { background: #b8dfc2; }
.rank-middle-swatch, .rank-colors td.rank-middle { background: #f8e6a3; }
.rank-low-swatch, .rank-colors td.rank-low { background: #e4e9ef; }
.swatch { display: inline-block; padding: 2px 6px; border: 1px solid #879e92; }
.contested-mode tr.contested th { box-shadow: inset 5px 0 #9a5700; }
.contested-label { display: block; font-size: 0.8em; color: #754100; margin-top: 4px; }
@media (max-width: 600px) { main { padding: 12px; } .controls, .table-wrap { padding: 10px; } }
</style></head><body><main>
<h1>Preference grid</h1>
<p>${escapeHtml(snapshot.library || 'Library')} · ${escapeHtml(snapshot.cycleName)} · ${escapeHtml(snapshot.cycleStatus)}<br>Exported ${escapeHtml(exportedAt)}. This offline file is a snapshot and does not update automatically.</p>
<noscript><p>JavaScript is disabled. The full exported grid is shown; filtering and colours require JavaScript.</p></noscript>
<section class="controls" id="controls" hidden aria-label="Grid controls">
  <div class="searches">
    <label>Search clubs<input id="club-search" type="search" autocomplete="off"></label>
    <label>Search titles<input id="title-search" type="search" autocomplete="off"></label>
  </div>
  <details><summary>Select clubs</summary>
    <div class="actions"><button type="button" id="club-select">Select matching clubs</button><button type="button" id="club-clear">Clear matching clubs</button></div>
    <div class="choices" id="club-options">${choices(clubs)}</div>
  </details>
  <details><summary>Select titles</summary>
    <div class="actions"><button type="button" id="title-select">Select matching titles</button><button type="button" id="title-clear">Clear matching titles</button></div>
    <div class="choices" id="title-options">${choices(titles.map((title) => title.label))}</div>
  </details>
  <div class="toggles">
    <label><input id="rank-colors" type="checkbox"> Colour rank strength</label>
    <label><input id="contested-colors" type="checkbox"> Emphasise contested titles</label>
  </div>
  <p class="legend">Rank colours: <span class="swatch rank-high-swatch">1–3</span> <span class="swatch rank-middle-swatch">4–6</span> <span class="swatch rank-low-swatch">7+</span>. Blank means unranked. Contested means at least two visible clubs rank a title.</p>
  <div><button type="button" id="reset">Reset all filters and colours</button></div>
  <p id="status" aria-live="polite"></p>
</section>
<div class="table-wrap" role="region" aria-label="Preference grid" tabindex="0">
<table id="grid"><thead><tr><th scope="col">Book title</th>${headers}</tr></thead><tbody>${rows}</tbody></table>
</div>
<p id="empty" hidden role="status"></p>
<script>
(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const table = byId('grid');
  const clubSearch = byId('club-search');
  const titleSearch = byId('title-search');
  const rankColors = byId('rank-colors');
  const contestedColors = byId('contested-colors');
  const options = (id) => Array.from(byId(id).querySelectorAll('label')).map((label) => ({
    label, input: label.querySelector('input'), name: label.querySelector('span').textContent.toLowerCase()
  }));
  const clubs = options('club-options');
  const titles = options('title-options');
  const headers = Array.from(table.tHead.rows[0].cells).slice(1);
  const rows = Array.from(table.tBodies[0].rows).map((row) => ({
    row, cells: Array.from(row.querySelectorAll('td')), contested: row.querySelector('.contested-label')
  }));
  const matches = (item, query) => item.name.includes(query.trim().toLowerCase());
  function update() {
    const clubQuery = clubSearch.value;
    const titleQuery = titleSearch.value;
    const visibleClubs = clubs.map((item) => {
      const match = matches(item, clubQuery);
      item.label.hidden = !match;
      return match && item.input.checked;
    });
    const visibleTitles = titles.map((item) => {
      const match = matches(item, titleQuery);
      item.label.hidden = !match;
      return match && item.input.checked;
    });
    const clubCount = visibleClubs.filter(Boolean).length;
    const titleCount = visibleTitles.filter(Boolean).length;
    table.classList.toggle('rank-colors', rankColors.checked);
    table.classList.toggle('contested-mode', contestedColors.checked);
    headers.forEach((header, index) => { header.hidden = !visibleClubs[index]; });
    rows.forEach((entry, rowIndex) => {
      entry.row.hidden = !visibleTitles[rowIndex];
      let ranked = 0;
      entry.cells.forEach((cell, index) => {
        cell.hidden = !visibleClubs[index];
        if (visibleClubs[index] && cell.hasAttribute('data-rank')) ranked++;
      });
      entry.row.classList.toggle('contested', ranked >= 2);
      entry.contested.hidden = !contestedColors.checked || ranked < 2;
      entry.contested.textContent = ranked >= 2 ? 'Contested: ' + ranked + ' visible clubs rank this title' : '';
    });
    byId('status').textContent = clubCount + ' of ' + clubs.length + ' clubs and ' + titleCount + ' of ' + titles.length + ' titles shown.';
    const empty = byId('empty');
    empty.hidden = clubCount > 0 && titleCount > 0;
    empty.textContent = clubCount === 0 && titleCount === 0 ? 'No clubs or titles match the current filters.'
      : clubCount === 0 ? 'No clubs match the current filters.' : titleCount === 0 ? 'No titles match the current filters.' : '';
  }
  let timer;
  function scheduleUpdate() { clearTimeout(timer); timer = setTimeout(update, 100); }
  clubSearch.addEventListener('input', scheduleUpdate);
  titleSearch.addEventListener('input', scheduleUpdate);
  byId('club-options').addEventListener('change', update);
  byId('title-options').addEventListener('change', update);
  rankColors.addEventListener('change', update);
  contestedColors.addEventListener('change', update);
  function selectMatching(items, search, checked) {
    items.forEach((item) => { if (matches(item, search.value)) item.input.checked = checked; });
    update();
  }
  byId('club-select').addEventListener('click', () => selectMatching(clubs, clubSearch, true));
  byId('club-clear').addEventListener('click', () => selectMatching(clubs, clubSearch, false));
  byId('title-select').addEventListener('click', () => selectMatching(titles, titleSearch, true));
  byId('title-clear').addEventListener('click', () => selectMatching(titles, titleSearch, false));
  byId('reset').addEventListener('click', () => {
    clearTimeout(timer);
    clubSearch.value = ''; titleSearch.value = '';
    clubs.concat(titles).forEach((item) => { item.input.checked = true; });
    rankColors.checked = false; contestedColors.checked = false;
    update();
  });
  update();
  byId('controls').hidden = false;
})();
</script></main></body></html>`;
}
