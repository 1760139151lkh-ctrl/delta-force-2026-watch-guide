import DATA from './data.js';

(() => {
  'use strict';
  // Imported data stay outside the DOM; only the current chapter and
  // explicitly revealed reports are rendered below.
  const main = document.getElementById('reader');
  const status = document.getElementById('reader-status');
  const lightbox = document.getElementById('lightbox');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const list = value => Array.isArray(value) ? value : value ? [value] : [];
  const paragraphs = value => list(value).map(paragraph => `<p>${esc(paragraph)}</p>`).join('');
  const safeURL = value => {try {const url = new URL(String(value));return ['https:','http:'].includes(url.protocol) ? url.href : '';} catch {return '';}};
  const safeImage = value => {
    const path=String(value || '');
    if (!/^assets\/images\/[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp|gif)$/i.test(path)) return '';
    const url=new URL(path,document.baseURI);
    const directory=new URL('assets/images/',document.baseURI);
    return url.origin === window.location.origin && url.pathname.startsWith(directory.pathname) ? url.href : '';
  };
  const external = (url,label,className='') => {const href=safeURL(url);return href ? `<a${className ? ` class="${className}"` : ''} href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label);};
  const shortDate = date => String(date || '').replace(/^2026[-/.年]/,'').replace(/-/g,'.');
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!DATA || !Array.isArray(DATA.chapters)) {main.innerHTML='<div class="empty"><h1>回到那个夏天</h1><p>这册手记还没有装订。</p></div>';return;}
  document.title = DATA.title || document.title;
  const chapters = DATA.chapters;
  const appendix = DATA.appendix;
  const hasAppendix = Boolean(appendix && (list(appendix.sections).length || list(appendix.intro).length));
  const appendixIndex = chapters.length + 1;
  const revealed = new Map();
  const images = new Map();
  const players = new Map();
  let current = 0;
  let unlockedThrough = 0;
  let imageSequence = 0;
  let playerSequence = 0;
  let lightboxOpener = null;

  function sources(value) {
    const entries=list(value);
    return entries.length ? `<div class="sources"><span class="sources-label">现场依据</span>${entries.map(source=>external(source.url,source.label || '来源')).join('')}</div>` : '';
  }

  function gallery(value) {
    const figures=list(value).map(image=>{
      const src=safeImage(image.src);
      if (!src) return '';
      const id=String(++imageSequence);
      images.set(id,{...image,src});
      return `<figure class="figure"><button class="image-button" type="button" data-image="${id}" aria-label="查看当前图片大图"><img src="${esc(src)}" alt="${esc(image.alt || '')}" loading="lazy"><span class="image-open" aria-hidden="true">放大查看 ＋</span></button>${image.caption || image.sourceUrl ? `<figcaption class="figure-caption">${image.caption ? `<span>${esc(image.caption)}</span>` : '<span></span>'}${image.sourceUrl ? external(image.sourceUrl,image.sourceLabel || '图片来源') : ''}</figcaption>` : ''}</figure>`;
    }).join('');
    return figures ? `<div class="gallery">${figures}</div>` : '';
  }

  function biliPlayer(item) {
    let bvid=String(item.bvid || '');
    let page=Number(item.page || 0);
    const url=safeURL(item.url);
    if (url) {
      const parsed=new URL(url);
      if (/(^|\.)bilibili\.com$/i.test(parsed.hostname)) {
        if (!bvid) bvid=(parsed.pathname.match(/\/video\/(BV[a-z0-9]{10})/i) || [])[1] || '';
        if (!page) page=Number(parsed.searchParams.get('p')) || 1;
      }
    }
    if (!/^BV[a-z0-9]{10}$/i.test(bvid)) return '';
    page=Number.isInteger(page) && page > 0 ? page : 1;
    return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&page=${page}&autoplay=0&danmaku=0`;
  }

  function watch(value,heading='把这一晚看完',sectionId='watch-heading-main') {
    const items=list(value);
    if (!items.length) return '';
    return `<section aria-labelledby="${esc(sectionId)}"><h2 class="section-heading" id="${esc(sectionId)}">${esc(heading)}</h2><div class="watch-list">${items.map(item=>{
      const id=String(++playerSequence);
      const embed=biliPlayer(item);
      if (embed) players.set(id,{src:embed,person:item.person || '赛事直播'});
      const href=safeURL(item.url);
      const title=href ? external(href,item.label || '当日比赛回放','watch-title') : `<span class="watch-title">${esc(item.label || '当日比赛回放')}</span>`;
      return `<article class="watch-item"><div class="watch-person">${esc(item.person || '赛事直播')}</div><div>${title}${item.kind || item.duration ? `<div class="watch-meta">${item.kind ? `<span>${esc(item.kind)}</span>` : ''}${item.duration ? `<span>${esc(item.duration)}</span>` : ''}</div>` : ''}${item.note ? `<p class="watch-note">${esc(item.note)}</p>` : ''}${href || embed ? `<div class="watch-actions">${href ? external(href,'打开原站录像 ↗','watch-external') : ''}${embed ? `<button class="embed-button" type="button" data-player="${id}" aria-expanded="false" aria-controls="player-${id}">在这里打开播放器</button>` : ''}</div>` : ''}</div>${embed ? `<div class="player-slot" id="player-${id}"></div>` : ''}</article>`;
    }).join('')}</div></section>`;
  }

  function backups(value) {
    return list(value).length ? `<details class="backups"><summary>这一晚的备用录像</summary>${watch(value,'备用视角与版本','watch-heading-backups')}</details>` : '';
  }

  function resultSteps(chapter) {
    const steps=[];
    if (chapter.report) steps.push({type:'report',value:chapter.report});
    for (const summary of list(chapter.summaries)) steps.push({type:'summary',value:summary});
    return steps;
  }

  function reportTable(value) {
    if (!value || !list(value.headers).length) return '';
    return `<div class="table-wrap" tabindex="0" role="region" aria-label="已揭晓的战报表格"><table>${value.caption ? `<caption>${esc(value.caption)}</caption>` : ''}<thead><tr>${value.headers.map(header=>`<th scope="col">${esc(header)}</th>`).join('')}</tr></thead><tbody>${list(value.rows).map(row=>`<tr>${list(row).map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function reportBlock(step,index,fresh=false) {
    const value=step.value;
    const label=step.type === 'summary' ? '阶段汇总' : '本日战报';
    const context=list(value.contextWatch).length ? `<details class="backups"><summary>同期直播与采访</summary>${watch(value.contextWatch,'这一段时间的主播支线',`watch-heading-context-${index}`)}</details>` : '';
    return `<section class="report-block${fresh ? ' fresh' : ''}" id="revealed-${index}" aria-labelledby="report-heading-${index}"><p class="report-kicker">${label}</p><h2 class="report-title" id="report-heading-${index}" tabindex="-1">${esc(value.title || label)}</h2><div class="prose">${paragraphs(value.paragraphs)}</div>${gallery(value.images)}${reportTable(value.table)}${watch(value.watch,'赛后加看',`watch-heading-revealed-${index}`)}${context}${sources(value.sources)}</section>`;
  }

  function directory() {
    const cover=`<button class="day" type="button" data-go="0"${current === 0 ? ' aria-current="page"' : ''}><span><span class="day-date">序章</span><span class="day-label">入场。</span></span><span class="day-state" aria-hidden="true">${current === 0 ? '●' : '↶'}</span></button>`;
    const dates=chapters.map((chapter,index)=>{
      const number=index+1;
      const available=number <= unlockedThrough;
      const label=available ? `<span class="day-label">${esc(chapter.stage || '')}</span>` : '';
      const state=number === current ? '●' : available ? '↶' : '未至';
      return `<button class="day" type="button"${available ? ` data-go="${number}"` : ' disabled'}${current === number ? ' aria-current="page"' : ''} aria-label="${esc(chapter.date)}${available ? '' : '，尚未翻到'}"><span><span class="day-date">${esc(shortDate(chapter.date))}</span>${label}</span><span class="day-state" aria-hidden="true">${state}</span></button>`;
    }).join('');
    const end=hasAppendix ? `<button class="day" type="button"${unlockedThrough >= appendixIndex ? ` data-go="${appendixIndex}"` : ' disabled'}${current === appendixIndex ? ' aria-current="page"' : ''}><span class="day-date">附录</span><span class="day-state" aria-hidden="true">${current === appendixIndex ? '●' : unlockedThrough >= appendixIndex ? '↶' : '未至'}</span></button>` : '';
    return cover+dates+end;
  }

  function updateDirectory() {
    const html=directory();
    document.getElementById('desktop-directory').innerHTML=html;
    document.getElementById('mobile-directory').innerHTML=html;
    document.getElementById('calendar-current').textContent=current === 0 ? '序章' : current === appendixIndex ? '附录' : shortDate(chapters[current-1].date);
  }

  function backButton() {
    if (current === 0) return '';
    const previous=current === 1 ? '序章' : shortDate(chapters[current-2].date);
    return `<button class="back-button" type="button" data-go="${current-1}">← 回看${esc(previous)}</button>`;
  }

  function actions() {
    if (current === 0) return chapters.length ? `<div class="turn"><button class="primary" type="button" data-next><span>把时间拨回七月</span><span class="arrow" aria-hidden="true">→</span></button></div>` : '';
    if (current === appendixIndex) return `<div class="turn">${backButton()}<p class="end-note">把接下来的时间，留给决赛。</p></div>`;
    const chapter=chapters[current-1];
    const steps=resultSteps(chapter);
    const count=revealed.get(current) || 0;
    if (count < steps.length) {
      const step=steps[count];
      const label=step.type === 'summary' ? '继续揭晓阶段汇总' : '看完了，揭晓本日战报';
      return `<div class="turn">${backButton()}<button class="primary" type="button" data-reveal><span>${label}</span><span class="arrow" aria-hidden="true">＋</span></button></div>`;
    }
    if (current < chapters.length) return `<div class="turn">${backButton()}<button class="primary" type="button" data-next><span>进入下一天<span class="turn-date">${esc(shortDate(chapters[current].date))}</span></span><span class="arrow" aria-hidden="true">→</span></button></div>`;
    if (hasAppendix) return `<div class="turn">${backButton()}<button class="primary" type="button" data-next><span>收好回放与资料</span><span class="arrow" aria-hidden="true">→</span></button></div>`;
    return `<div class="turn">${backButton()}<p class="end-note">把接下来的时间，留给决赛。</p></div>`;
  }

  function colophon() {return `<footer class="colophon">${esc(DATA.footer || '这一册，在总决赛开赛前停笔。')}</footer>`;}

  function closeLightbox() {
    if (lightbox.open) lightbox.close();
    document.body.classList.remove('modal-open');
    lightbox.innerHTML='';
  }

  function render(index,moveFocus=true) {
    if (!Number.isInteger(index) || index < 0 || index > unlockedThrough || index > (hasAppendix ? appendixIndex : chapters.length)) return;
    closeLightbox();
    images.clear();players.clear();imageSequence=0;playerSequence=0;
    current=index;
    main.className='main'+(index === 0 ? ' cover' : '');
    if (index === 0) {
      main.innerHTML=`<header class="chapter-header"><div class="eyebrow"><span>观赛手记</span><span>七月，直到八月的门口</span></div><span class="cover-mark" aria-hidden="true">入场。</span><h1 class="chapter-title">${esc(DATA.title || '回到那个夏天')}</h1>${DATA.subtitle ? `<p class="deck">${esc(DATA.subtitle)}</p>` : ''}</header><div class="reading"><div class="prose">${paragraphs(DATA.intro)}</div>${gallery(DATA.coverImages)}${sources(DATA.sources)}<div id="chapter-actions">${actions()}</div>${colophon()}</div>`;
    } else if (index <= chapters.length) {
      const chapter=chapters[index-1];
      const steps=resultSteps(chapter);
      const count=revealed.get(index) || 0;
      main.innerHTML=`<header class="chapter-header"><div class="eyebrow"><span class="eyebrow-date">${esc(chapter.date)}</span><span>${esc(chapter.stage)}</span><span class="chapter-number">第 ${String(index).padStart(2,'0')} 章</span></div><h1 class="chapter-title">${esc(chapter.title || chapter.date)}</h1>${chapter.lead ? `<p class="deck">${esc(chapter.lead)}</p>` : ''}</header><div class="reading"><div class="prose">${paragraphs(chapter.intro)}</div>${gallery(chapter.images)}${watch(chapter.watch)}${backups(chapter.backups)}${sources(chapter.sources)}<div id="chapter-reveals">${steps.slice(0,count).map((step,number)=>reportBlock(step,number)).join('')}</div><div id="chapter-actions">${actions()}</div>${colophon()}</div>`;
    } else {
      main.innerHTML=`<header class="chapter-header"><div class="eyebrow"><span>附录</span></div><h1 class="chapter-title">${esc(appendix.title || '回放与资料')}</h1></header><div class="reading"><div class="prose">${paragraphs(appendix.intro)}</div>${gallery(appendix.images)}${list(appendix.sections).map(section=>`<section class="appendix-section"><h2>${esc(section.title)}</h2><div class="prose">${paragraphs(section.paragraphs)}</div>${gallery(section.images)}${list(section.links).map(link=>`<div class="reference-entry">${external(link.url,link.label)}${link.note ? `<p>${esc(link.note)}</p>` : ''}</div>`).join('')}${sources(section.sources)}</section>`).join('')}<div id="chapter-actions">${actions()}</div>${colophon()}</div>`;
    }
    updateDirectory();
    document.querySelector('.mobile-calendar').open=false;
    if (moveFocus) {window.scrollTo(0,0);main.focus({preventScroll:true});status.textContent=index === 0 ? '序章' : index === appendixIndex ? '附录' : chapters[index-1].date;}
  }

  function revealNext() {
    if (current < 1 || current > chapters.length) return;
    const count=revealed.get(current) || 0;
    const steps=resultSteps(chapters[current-1]);
    const step=steps[count];
    if (!step) return;
    revealed.set(current,count+1);
    document.getElementById('chapter-reveals').insertAdjacentHTML('beforeend',reportBlock(step,count,true));
    document.getElementById('chapter-actions').innerHTML=actions();
    const section=document.getElementById(`revealed-${count}`);
    const heading=document.getElementById(`report-heading-${count}`);
    heading.focus({preventScroll:true});
    section.scrollIntoView({block:'start',behavior:reducedMotion() ? 'auto' : 'smooth'});
    status.textContent=step.type === 'summary' ? '阶段汇总已揭晓' : '本日战报已揭晓';
  }

  function nextChapter() {
    if (current >= 1 && current <= chapters.length && (revealed.get(current) || 0) < resultSteps(chapters[current-1]).length) return;
    const next=current+1;
    const last=hasAppendix ? appendixIndex : chapters.length;
    if (next > last) return;
    unlockedThrough=Math.max(unlockedThrough,next);
    render(next);
  }

  function togglePlayer(button) {
    const player=players.get(button.dataset.player);
    const slot=document.getElementById(`player-${button.dataset.player}`);
    if (!player || !slot) return;
    if (slot.childElementCount) {slot.replaceChildren();button.setAttribute('aria-expanded','false');button.textContent='在这里打开播放器';return;}
    const frame=document.createElement('iframe');
    frame.src=player.src;
    frame.title=`${player.person} · 当前章节回放`;
    frame.allow='fullscreen';
    frame.allowFullscreen=true;
    frame.referrerPolicy='strict-origin-when-cross-origin';
    const holder=document.createElement('div');
    holder.className='player-frame';
    holder.append(frame);slot.append(holder);
    const caption=document.createElement('p');
    caption.className='player-caption';caption.textContent='播放器由哔哩哔哩提供；原站录像入口始终保留。';slot.append(caption);
    button.setAttribute('aria-expanded','true');button.textContent='收起播放器';
  }

  function openImage(button) {
    const image=images.get(button.dataset.image);
    if (!image) return;
    lightboxOpener=button;
    lightbox.innerHTML=`<div class="lightbox-head"><p class="lightbox-title">当前章节 · 图片</p><button class="lightbox-close" type="button" data-close-image>关闭大图</button></div><img class="lightbox-image" src="${esc(image.src)}" alt="${esc(image.alt || '')}">${image.caption || image.sourceUrl ? `<div class="lightbox-caption">${image.caption ? `<p>${esc(image.caption)}</p>` : ''}${image.sourceUrl ? `<p>${external(image.sourceUrl,image.sourceLabel || '图片来源')}</p>` : ''}</div>` : ''}`;
    document.body.classList.add('modal-open');lightbox.showModal();
  }

  lightbox.addEventListener('close',()=>{document.body.classList.remove('modal-open');lightbox.innerHTML='';if (lightboxOpener && lightboxOpener.isConnected) lightboxOpener.focus({preventScroll:true});lightboxOpener=null;});
  lightbox.addEventListener('click',event=>{if(event.target === lightbox) closeLightbox();});
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-go')) render(Number(button.dataset.go));
    else if (button.hasAttribute('data-next')) nextChapter();
    else if (button.hasAttribute('data-reveal')) revealNext();
    else if (button.hasAttribute('data-player')) togglePlayer(button);
    else if (button.hasAttribute('data-image')) openImage(button);
    else if (button.hasAttribute('data-close-image')) closeLightbox();
  });
  render(0,false);
})();
