const viewTitles={import:'Import',learn:'Lesson',report:'Report'};
const state={mode:'balanced',learningStyle:'hide',translation:false,playing:false,currentCueId:null,revealed:new Set(),player:null,playerReady:false,poll:null,content:null,session:null,activeCheckpoint:null,quizAnswers:{},quizSubmitted:false,checkpointNotice:null,checkpointTriggered:new Set(),sessionSeconds:0,youtubeUrl:null,agentReady:false,agentTimer:null};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const AGENT_STEPS=[
 {label:'Fetching subtitles',detail:'Reading the transcript and video metadata.'},
 {label:'Reconstructing complete sentences',detail:'Joining subtitle fragments into sentences.'},
 {label:'Translating sentences',detail:'Translating the lesson text.'},
 {label:'Analyzing language concepts and cultural context',detail:'Finding useful language and culture notes.'},
 {label:'Locating concepts in the subtitles',detail:'Mapping learning targets to subtitle spans.'},
 {label:'Translating and checking timed subtitles',detail:'Checking subtitle timing and alignment.'},
 {label:'Generating quiz questions',detail:'Building checkpoint questions.'},
 {label:'Validating and packaging',detail:'Checking the lesson before it is ready.'}
];
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2600)}
function switchView(view){$$('.fade-view').forEach(el=>el.classList.toggle('active',el.id===`${view}View`));$$('.fade-nav').forEach(el=>el.classList.toggle('active',el.dataset.view===view));$('#topTitle').textContent=viewTitles[view];$('#appShell').classList.toggle('landing-mode',view==='import');window.scrollTo({top:0,behavior:'smooth'})}
$$('.fade-nav').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));$$('[data-view-target]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.viewTarget)));
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function parseYouTubeId(value){const raw=String(value||'').trim();if(/^[\w-]{11}$/.test(raw))return raw;try{const url=new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw)?raw:`https://${raw}`);const host=url.hostname.toLowerCase();const isShort=host==='youtu.be';const isYouTube=host==='youtube.com'||host.endsWith('.youtube.com');if(!isShort&&!isYouTube)return null;if(isShort){const id=url.pathname.split('/').filter(Boolean)[0]||'';return /^[\w-]{11}$/.test(id)?id:null}const queryId=url.searchParams.get('v')||'';if(/^[\w-]{11}$/.test(queryId))return queryId;const m=url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);return m?.[1]||null}catch{return null}}
function youtubeUrlFromId(id){return id?`https://www.youtube.com/watch?v=${id}`:''}
function validatePackage(pkg){
 const errors=[];const {manifest:m,subtitles:s,quizzes:q,vocabulary:v,culture:c}=pkg||{};
 if(!m||!s||!q||!v||!c)return ['Package is missing one or more required JSON files: manifest, subtitles, quizzes, vocabulary, or culture.'];
 const cid=m.content_id;if(m.schema_version!=='1.0'||!cid)errors.push('manifest: invalid schema_version or content_id');if(m.review_status!=='approved')errors.push('manifest: package has not been approved');
 const videoId=parseYouTubeId(m.video?.video_id||'');if(m.video?.provider!=='youtube'||!videoId)errors.push('manifest.video: a valid YouTube video_id is required');
 const ids=new Set(),annIds=new Set(),cues=s.cues;
 for(const [name,data] of Object.entries({subtitles:s,quizzes:q,vocabulary:v,culture:c})){if(data.schema_version!=='1.0')errors.push(`${name}: schema_version must be 1.0`);if(data.content_id!==cid)errors.push(`${name}: content_id does not match the manifest`)}
 if(!Array.isArray(cues)||!cues.length)errors.push('subtitles.cues: at least one subtitle cue is required');
 let previousStart=-1;for(const cue of cues||[]){if(!cue.id||ids.has(cue.id))errors.push(`subtitles: duplicate or empty cue id (${cue.id||'missing'})`);ids.add(cue.id);if(!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.start<0||cue.end<=cue.start)errors.push(`${cue.id}: invalid time range`);if(cue.start<previousStart)errors.push(`${cue.id}: cues must be sorted by start time`);previousStart=cue.start;if(!cue.source_text)errors.push(`${cue.id}: source_text cannot be empty`);
  let prevEnd=-1;for(const a of cue.annotations||[]){const chars=Array.from(cue.source_text||'');if(!a.id||annIds.has(a.id))errors.push(`${cue.id}: duplicate or empty annotation id (${a.id||'missing'})`);annIds.add(a.id);if(!Number.isInteger(a.start_char)||!Number.isInteger(a.end_char)||a.start_char<0||a.end_char<=a.start_char||a.end_char>chars.length)errors.push(`${cue.id}/${a.id}: invalid character range`);else if(chars.slice(a.start_char,a.end_char).join('')!==a.text)errors.push(`${cue.id}/${a.id}: character range does not match text`);if(a.start_char<prevEnd)errors.push(`${cue.id}/${a.id}: hidden ranges overlap`);prevEnd=a.end_char;if(a.hide_eligible&&a.review_status!=='approved')errors.push(`${cue.id}/${a.id}: hide-eligible annotations must be approved`)}
 }
 const checkpoints=new Map((q.checkpoints||[]).map(cp=>[cp.id,cp]));if(!Array.isArray(q.checkpoints)||!Array.isArray(q.questions))errors.push('quizzes: checkpoints or questions array is missing');
 for(const cp of q.checkpoints||[]){if(!Array.isArray(cp.question_ids)||cp.question_ids.some(id=>!(q.questions||[]).some(x=>x.id===id&&x.checkpoint_id===cp.id)))errors.push(`${cp.id}: question_ids contains an invalid reference`);if(cp.trigger_time<0||cp.trigger_time>Number(m.video?.duration_seconds||Infinity))errors.push(`${cp.id}: trigger_time is outside the video duration`)}
 for(const question of q.questions||[]){if(!checkpoints.has(question.checkpoint_id))errors.push(`${question.id}: invalid checkpoint_id`);if(!Array.isArray(question.options)||question.options.length<2||question.correct_option_index<0||question.correct_option_index>=question.options.length)errors.push(`${question.id}: invalid options or answer index`);if(!(question.related_subtitle_ids||[]).length||(question.related_subtitle_ids||[]).some(id=>!ids.has(id)))errors.push(`${question.id}: invalid subtitle evidence reference`);if((question.related_annotation_ids||[]).some(id=>!annIds.has(id)))errors.push(`${question.id}: invalid annotation reference`)}
 for(const item of v.items||[]){if((item.related_subtitle_ids||[]).some(id=>!ids.has(id)))errors.push(`${item.id}: invalid vocabulary subtitle reference`);if((item.related_annotation_ids||[]).some(id=>!annIds.has(id)))errors.push(`${item.id}: invalid vocabulary annotation reference`)}
 for(const note of c.notes||[]){if(!ids.has(note.subtitle_id))errors.push(`${note.id}: invalid subtitle reference for culture note`);if(note.review_status!=='approved')errors.push(`${note.id}: unapproved culture notes cannot be displayed`)}
 return [...new Set(errors)];
}
function languageName(code){return({es:'Spanish',en:'English',fr:'French',th:'Thai',zh:'Chinese',ja:'Japanese',ko:'Korean'})[String(code||'').toLowerCase()]||String(code||'').toUpperCase()||'Unknown'}
function recordViewing(videoId){const key=`fade-view-count:${videoId||'lesson'}`;let count=0;try{count=Number(localStorage.getItem(key)||0)+1;localStorage.setItem(key,String(count))}catch{count=1}return count}
function mapPackage(pkg){const m=pkg.manifest;const video=m.video||{};return{...pkg,videoId:parseYouTubeId(video.video_id),title:String(video.title||video.video_title||m.youtube_title||m.title||m.content_id||'Untitled lesson').trim(),language:m.languages?.source||'und',translation:m.languages?.translation||'',cues:[...pkg.subtitles.cues].sort((a,b)=>a.start-b.start),duration:Number(video.duration_seconds)||0}}
function showImportErrors(errors){toast(`Lesson data could not load: ${errors[0]}`);console.error('Fade lesson validation:',errors)}
async function loadDemo(){try{const base='demo-content/fade-spanish-demo/';const names=['manifest','subtitles','quizzes','vocabulary','culture'];const entries=await Promise.all(names.map(async n=>[n,await (await fetch(`${base}${n}.json`)).json()]));const pkg=Object.fromEntries(entries);const errors=validatePackage(pkg);if(errors.length){showImportErrors(errors);return}startContent(mapPackage(pkg));}catch(e){toast(`Could not load the demo: ${e.message}`)}}
$('#loadDemo').addEventListener('click',loadDemo);$('#navTry')?.addEventListener('click',loadDemo);
const youtubeUrlInput=$('#youtubeUrlInput'),useYoutubeUrl=$('#useYoutubeUrl'),youtubeUrlStatus=$('#youtubeUrlStatus');
function setYoutubeUrlStatus(message,stateName=''){if(!youtubeUrlStatus)return;youtubeUrlStatus.textContent=message;youtubeUrlStatus.dataset.state=stateName;if(youtubeUrlInput){youtubeUrlInput.setAttribute('aria-invalid',stateName==='error'?'true':'false');youtubeUrlInput.classList.toggle('has-error',stateName==='error')}}
useYoutubeUrl?.addEventListener('click',()=>{
 const raw=youtubeUrlInput?.value.trim()||'',id=parseYouTubeId(raw);
 if(!id){setYoutubeUrlStatus('This field only accepts a YouTube video link. Try youtube.com/watch, youtu.be, or youtube.com/embed.','error');toast('Only YouTube video links are supported.');return}
 state.youtubeUrl=youtubeUrlFromId(id);
 try{localStorage.setItem('fade-youtube-url',state.youtubeUrl)}catch{}
 setYoutubeUrlStatus(`YouTube link accepted · ${id}. Fade Agent can now prepare the listening lesson.`,`valid`);
 toast('YouTube link accepted. Fade Agent is ready to analyze it.');
});
youtubeUrlInput?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();useYoutubeUrl?.click()}});
youtubeUrlInput?.addEventListener('input',()=>{if(youtubeUrlInput.getAttribute('aria-invalid')==='true')setYoutubeUrlStatus('YouTube links only.','')});
try{const savedUrl=localStorage.getItem('fade-youtube-url');if(savedUrl&&youtubeUrlInput){youtubeUrlInput.value=savedUrl;setYoutubeUrlStatus(`Saved YouTube link · ${parseYouTubeId(savedUrl)||'—'}. Fade Agent is ready to analyze it.`,'valid')}}catch{}
$$('[data-scroll]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.scroll)?.scrollIntoView({behavior:'smooth'})));
const phoneDemo=$('#heroPhoneDemo');
if(phoneDemo){
 const phonePlay=$('#phoneDemoPlay'),phoneReveal=$('#phoneRevealPhrase'),phoneQuickCheck=$('#phoneQuickCheck'),phoneQuiz=$('#phoneQuiz'),phoneBack=$('#phoneBackToWatch'),phoneHint=$('#phoneDemoHint'),phoneTime=$('#phoneDemoTime'),phoneProgress=$('#phoneDemoProgress'),phoneTitle=$('#phoneSceneTitle'),phoneSubtitle=$('#phoneSceneSubtitle'),phoneFeedback=$('#phoneQuizFeedback');
 let phoneTimer=null,phoneProgressValue=22;
 const setPhoneProgress=value=>{phoneProgressValue=Math.max(22,Math.min(100,value));if(phoneProgress)phoneProgress.style.width=`${phoneProgressValue}%`;if(phoneTime)phoneTime.textContent=phoneProgressValue>=100?'00:20':`00:${String(8+Math.round((phoneProgressValue-22)/10)).padStart(2,'0')}`};
 const stopPhone=()=>{clearInterval(phoneTimer);phoneTimer=null;phoneDemo.classList.remove('is-playing');phonePlay?.setAttribute('aria-pressed','false');phonePlay?.setAttribute('aria-label','Play the sample scene');if(phonePlay)phonePlay.innerHTML='&#9654;';};
 const startPhone=()=>{if(phoneTimer)return;if(phoneProgressValue>=100)setPhoneProgress(22);phoneDemo.classList.add('is-playing');phonePlay?.setAttribute('aria-pressed','true');phonePlay?.setAttribute('aria-label','Pause the sample scene');if(phonePlay)phonePlay.innerHTML='&#10074;&#10074;';if(phoneTitle)phoneTitle.textContent='Keep listening';if(phoneSubtitle)phoneSubtitle.textContent='Follow the story, one phrase at a time';phoneTimer=setInterval(()=>{setPhoneProgress(phoneProgressValue+3);if(phoneProgressValue>=100)stopPhone()},280)};
 phonePlay?.addEventListener('click',()=>phoneTimer?stopPhone():startPhone());
 phoneReveal?.addEventListener('click',()=>{const revealed=phoneDemo.classList.toggle('phrase-revealed');phoneReveal.setAttribute('aria-pressed',String(revealed));if(phoneHint)phoneHint.textContent=revealed?'Hint revealed — notice the phrase in context.':'Tap the faded subtitle to reveal a hint.'});
 const openPhoneQuiz=()=>{stopPhone();if(phoneQuiz)phoneQuiz.hidden=false;if(phoneQuickCheck)phoneQuickCheck.hidden=true;phoneDemo.classList.add('quiz-open')};
 phoneQuickCheck?.addEventListener('click',openPhoneQuiz);
 phoneBack?.addEventListener('click',()=>{if(phoneQuiz)phoneQuiz.hidden=true;if(phoneQuickCheck)phoneQuickCheck.hidden=false;phoneDemo.classList.remove('quiz-open');if(phoneFeedback)phoneFeedback.textContent='Choose an answer.';$$('.phone-quiz-option').forEach(option=>option.classList.remove('is-correct','is-wrong'))});
 $$('.phone-quiz-option').forEach(option=>option.addEventListener('click',()=>{const correct=option.dataset.demoAnswer==='correct';if(phoneFeedback)phoneFeedback.textContent=correct?'Exactly — reveal a phrase when you need help.':'Try again — the faded phrase can be revealed.';$$('.phone-quiz-option').forEach(item=>item.classList.remove('is-correct','is-wrong'));option.classList.add(correct?'is-correct':'is-wrong')}));
 $$('[data-phone-action]').forEach(button=>button.addEventListener('click',()=>{const action=button.dataset.phoneAction;if(action==='play')phoneTimer?stopPhone():startPhone();if(action==='reveal')phoneReveal?.click();if(action==='quiz')openPhoneQuiz()}));
 setPhoneProgress(22);
}
const revealWords=$$('.tagline-reveal [data-reveal-word]');
if(revealWords.length&&'IntersectionObserver' in window){
 const wordObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-revealed');wordObserver.unobserve(entry.target)}}),{threshold:.6,rootMargin:'0px 0px -12%'});
 revealWords.forEach((word,index)=>{word.style.transitionDelay=`${index*140}ms`;wordObserver.observe(word)});
}else{revealWords.forEach(word=>word.classList.add('is-revealed'))}
const themeButtons=$$('[data-theme-toggle]');
function setTheme(theme){
 const dark=theme==='dark';
 document.documentElement.dataset.theme=dark?'dark':'light';
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#111d2a':'#eef8ff');
 themeButtons.forEach(button=>{
  button.setAttribute('aria-pressed',String(dark));
  button.querySelector('.theme-icon').textContent=dark?'☀':'☾';
  button.querySelector('.theme-label').textContent=dark?'Day mode':'Night mode';
 });
 try{localStorage.setItem('fade-theme',dark?'dark':'light')}catch{}
}
let savedTheme='light';
try{savedTheme=localStorage.getItem('fade-theme')||'light'}catch{}
setTheme(savedTheme);
themeButtons.forEach(button=>button.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')));
if('IntersectionObserver' in window){
 const landingObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)entry.target.classList.add('is-visible')}),{threshold:.12});
 $$('.landing-section,.landing-demo,.landing-footer,.landing-faq').forEach(section=>landingObserver.observe(section));
 const journeySteps=$$('.journey-story-step');
 const journeyCharacter=$('.journey-character-wrap');
 const journeyObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
   if(entry.isIntersecting){
    entry.target.classList.add('is-visible');
    journeySteps.forEach(step=>step.classList.toggle('is-current',step===entry.target));
    const index=journeySteps.indexOf(entry.target);
    if(journeyCharacter){journeyCharacter.style.setProperty('--journey-step',index);journeyCharacter.classList.remove('is-walking');void journeyCharacter.offsetWidth;journeyCharacter.classList.add('is-walking');}
   }
  });
 },{threshold:.28,rootMargin:'-8% 0px -28%'});
 journeySteps.forEach((step,index)=>{step.style.setProperty('--journey-delay',`${index*90}ms`);journeyObserver.observe(step)});
}else{
 $$('.landing-section,.landing-demo,.landing-footer,.landing-faq,.journey-story-step').forEach(section=>section.classList.add('is-visible'));
}
const storyBoard=$('#journeyBoard');
if(storyBoard){
 const storySlides=$$('.journey-story-slide');
 const storyDots=$$('.storyboard-dots button');
 let activeStory=0;
 let settleTimer=null;
 const paintStoryState=()=>{
  storySlides.forEach((slide,i)=>slide.classList.toggle('is-active',i===activeStory));
  storyDots.forEach((dot,i)=>{const on=i===activeStory;dot.classList.toggle('is-active',on);dot.setAttribute('aria-selected',String(on))});
  const previous=$('.storyboard-prev'),next=$('.storyboard-next');
  if(previous)previous.disabled=activeStory===0;
  if(next)next.disabled=activeStory===storySlides.length-1;
 };
 const updateStory=(index,behavior='smooth')=>{
  activeStory=Math.max(0,Math.min(storySlides.length-1,index));
  paintStoryState();
  storyBoard.scrollTo({left:activeStory*storyBoard.clientWidth,behavior});
 };
 const syncStory=()=>{clearTimeout(settleTimer);settleTimer=setTimeout(()=>{const index=Math.round(storyBoard.scrollLeft/storyBoard.clientWidth);if(index!==activeStory){activeStory=Math.max(0,Math.min(storySlides.length-1,index));paintStoryState()}},80)};
 storyBoard.addEventListener('scroll',syncStory,{passive:true});
 $('.storyboard-prev')?.addEventListener('click',()=>updateStory(activeStory-1));
 $('.storyboard-next')?.addEventListener('click',()=>updateStory(activeStory+1));
 storyDots.forEach((dot,i)=>dot.addEventListener('click',()=>updateStory(i)));
 storyBoard.addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();updateStory(activeStory+1)}if(event.key==='ArrowLeft'){event.preventDefault();updateStory(activeStory-1)}});
 let dragging=false,startX=0,startScroll=0;
 storyBoard.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;dragging=true;startX=event.clientX;startScroll=storyBoard.scrollLeft;storyBoard.classList.add('is-dragging');storyBoard.setPointerCapture?.(event.pointerId)});
 storyBoard.addEventListener('pointermove',event=>{if(!dragging)return;storyBoard.scrollLeft=startScroll-(event.clientX-startX)});
 const stopDragging=event=>{if(!dragging)return;dragging=false;storyBoard.classList.remove('is-dragging');storyBoard.releasePointerCapture?.(event.pointerId);syncStory()};
 storyBoard.addEventListener('pointerup',stopDragging);storyBoard.addEventListener('pointercancel',stopDragging);storyBoard.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse')stopDragging(event)});
 updateStory(0,'auto');
}
function startContent(content){clearInterval(state.poll);clearTimeout(state.agentTimer);if(state.player){try{state.player.destroy()}catch{}state.player=null}state.playerReady=false;state.playing=false;state.content=content;state.session=FadeEngine.emptySession(content.manifest.content_id);state.session.mode=state.mode='balanced';state.learningStyle='hide';state.session.learning_style=state.learningStyle;state.translation=false;state.revealed.clear();state.checkpointTriggered.clear();state.sessionSeconds=0;state.activeCheckpoint=null;state.quizAnswers={};state.quizSubmitted=false;state.currentCueId=null;state.checkpointNotice=null;const viewingCount=recordViewing(content.videoId),courseName=languageName(content.language);$('#toggleTranslation').textContent=`${content.translation.toUpperCase()||'EN'} translation`;$('#durationTime').textContent=formatTime(content.duration);$('#learnCourseLabel').textContent=`${courseName} Video Lesson`;$('#learnTitle').textContent=content.title;$('#learnMeta').textContent=`VIEWING ${String(viewingCount).padStart(2,'0')}`;$('#ytFrame').setAttribute('title',`${content.title} video`);$('#feedbackQuestion').textContent=`Would you use Fade for another ${courseName.toLowerCase()} scene?`;$('#quizCount').textContent=`0 / ${content.quizzes.checkpoints.length}`;$('#revealCount').textContent='0';$('#progressStat').textContent='0%';$('#reportScore').textContent='—';$('#reportReveal').textContent='0';$('#reportMode').textContent='Balanced';$('#feedbackNote').textContent='Your answer helps us improve the learning flow.';$$('.feedback-option').forEach(button=>button.classList.remove('is-selected'));updateLearningStyleUI();renderSessionReview();$('#subtitleText').textContent='Press Play to show subtitles in sync with the video.';setNextCheckpoint();switchView('learn');startAgentProgress(content)}
function hideAgentProgress(){const progress=$('#agentProgress');if(progress)progress.hidden=true}
function initPlayer(videoId){clearInterval(state.poll);state.playerReady=false;if(state.player){try{state.player.destroy()}catch{}state.player=null}if(!window.YT||!YT.Player){$('#subtitleText').textContent='The YouTube player failed to load. Check your connection and try again.';return}state.player=new YT.Player('ytFrame',{videoId,playerVars:{playsinline:1,rel:0,modestbranding:1,cc_load_policy:0},events:{onReady:()=>{state.playerReady=true;hideAgentProgress();$('#videoLinkReveal').hidden=false;const d=state.player.getDuration();if(d>0&&(!state.content.duration||Math.abs(d-state.content.duration)>60))toast('The lesson duration differs from the video. Check the subtitle timestamps.');state.poll=setInterval(syncPlayer,200)},onStateChange:onPlayerStateChange,onError:e=>{const messages={2:'Invalid video ID',5:'This video cannot be played in the HTML5 player',100:'This video is unavailable or private',101:'The video owner does not allow embedding',150:'The video owner does not allow embedding'};hideAgentProgress();toast(`YouTube playback error: ${messages[e.data]||`Code ${e.data}`}`);$('#subtitleText').textContent='This video cannot be embedded. Try a public video that allows embedding.'}}})}
window.onYouTubeIframeAPIReady=()=>{if(state.content&&state.agentReady)initPlayer(state.content.videoId)};
function onPlayerStateChange(e){state.playing=e.data===YT.PlayerState.PLAYING;$('#playDemo').textContent=state.playing?'Ⅱ Pause':'▶ Play'}
function formatTime(sec){sec=Math.max(0,Math.floor(sec||0));return`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}
function syncPlayer(){if(!state.playerReady||!state.content)return;const t=state.player.getCurrentTime();const d=state.player.getDuration()||state.content.duration;const cue=FadeEngine.getCueAtTime(state.content.cues,t);$('#currentTime').textContent=formatTime(t);$('#timeBar').style.width=`${d?Math.min(100,t/d*100):0}%`;$('#progressStat').textContent=`${d?Math.min(100,Math.floor(t/d*100)):0}%`;if(cue&&cue.id!==state.currentCueId){state.currentCueId=cue.id;state.revealed.clear();renderCue(cue)}if(!cue&&state.currentCueId){state.currentCueId=null;$('#subtitleText').textContent='';}if(state.playing)state.sessionSeconds+=.2;checkCheckpoints(t)}
function checkCheckpoints(time){const checkpoints=state.content.quizzes.checkpoints||[];for(const cp of checkpoints){if(state.session.completed_checkpoint_ids.includes(cp.id)||state.session.skipped_checkpoint_ids.includes(cp.id))continue;const remaining=cp.trigger_time-time;if(remaining<=10&&remaining>0&&!state.checkpointTriggered.has(cp.id)){state.checkpointTriggered.add(cp.id);$('#checkpointCopy').textContent=`${formatTime(remaining)} until the video pauses for a quick check. You can skip it.`;$('#checkpointTime').textContent=formatTime(cp.trigger_time)}if(time>=cp.trigger_time&&!state.checkpointTriggered.has(`opened:${cp.id}`)){state.checkpointTriggered.add(`opened:${cp.id}`);if(state.playerReady)state.player.pauseVideo();openQuiz(cp)}}}
function setNextCheckpoint(){if(!state.content)return;const cp=(state.content.quizzes.checkpoints||[]).find(x=>!state.session?.completed_checkpoint_ids.includes(x.id)&&!state.session?.skipped_checkpoint_ids.includes(x.id));$('#checkpointTime').textContent=cp?formatTime(cp.trigger_time):'Done';$('#checkpointCopy').textContent=cp?`The video pauses at ${formatTime(cp.trigger_time)}. Answer a quick question or skip it.`:'All checkpoints are complete.';$('#quizCount').textContent=`${state.session?.completed_checkpoint_ids.length||0} / ${state.content.quizzes.checkpoints.length}`}
function startAgentProgress(content){
 clearTimeout(state.agentTimer);state.agentReady=false;
 const progress=$('#agentProgress'),bar=$('#agentProgressBar'),percent=$('#agentProgressPercent'),linkReveal=$('#videoLinkReveal'),link=$('#videoLink');
 if(!progress||!bar||!percent)return;
 progress.hidden=false;if(linkReveal)linkReveal.hidden=true;if(link){link.href=youtubeUrlFromId(content.videoId);link.textContent=youtubeUrlFromId(content.videoId)}
 let current=0;
 const paint=()=>{
  const finished=current>=AGENT_STEPS.length,value=finished?100:Math.round((current/AGENT_STEPS.length)*100);
  percent.textContent=`${value}%`;bar.style.width=`${value}%`;
  if(finished){state.agentReady=true;initPlayer(content.videoId);return}
  state.agentTimer=setTimeout(()=>{current+=1;paint()},650);
 };
 paint();
}
function annotationHelp(annotation){if(!annotation||!state.content)return;const item=(state.content.vocabulary.items||[]).find(entry=>(entry.related_annotation_ids||[]).includes(annotation.id));const detail=item?.translation||item?.notes||'This phrase was marked as a useful learning target.';toast(`${annotation.text}${detail?` · ${detail}`:''}`)}
function renderCue(cue){if(!cue||!state.session)return;const segments=FadeEngine.renderSegments(cue,state.session,state.mode,state.revealed,state.learningStyle);$('#subtitleText').innerHTML=segments.map(part=>{if(part.type==='hidden')return`<button class="hidden-word" data-annotation="${escapeHtml(part.annotation.id)}" aria-label="Hidden phrase. Click to reveal.">${escapeHtml(part.value)}</button>`;if(part.type==='highlighted')return`<button class="highlighted-word" data-annotation="${escapeHtml(part.annotation.id)}" aria-label="Highlighted difficult phrase. Click for a meaning hint.">${escapeHtml(part.value)}</button>`;return escapeHtml(part.value)}).join('')+(state.translation&&cue.translation_text?`<span class="translation-line">${escapeHtml(cue.translation_text)}</span>`:'');$('#modeLabel').textContent=state.mode==='support'?'More support':state.mode==='challenge'?'Challenge':'Balanced';$$('.hidden-word').forEach(el=>el.addEventListener('click',()=>revealOne(el.dataset.annotation)));$$('.highlighted-word').forEach(el=>el.addEventListener('click',()=>{const annotation=cue.annotations.find(item=>item.id===el.dataset.annotation);annotationHelp(annotation)}));const culture=(state.content.culture.notes||[]).filter(n=>n.subtitle_id===cue.id);$('#cultureBtn').disabled=!culture.length;$('#cultureBtn').dataset.notes=JSON.stringify(culture)}
function revealOne(id){const cue=state.content.cues.find(c=>c.id===state.currentCueId);if(!cue)return;state.revealed.add(id);const annotation=cue.annotations.find(a=>a.id===id);if(annotation)FadeEngine.recordReveal(state.session,cue.id,[annotation]);$('#revealCount').textContent=state.session.reveals.length;renderSessionReview();renderCue(cue)}
$('#playDemo').addEventListener('click',()=>{if(!state.playerReady){toast('Connecting to YouTube…');return}if(state.player.getPlayerState()===YT.PlayerState.PLAYING)state.player.pauseVideo();else state.player.playVideo()});
function updateLearningStyleUI(){
 $$('[data-learning-style]').forEach(button=>{const active=button.dataset.learningStyle===state.learningStyle;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});
 const revealButton=$('#revealBtn');if(revealButton)revealButton.textContent=state.learningStyle==='highlight'?'Show help for this line':'Reveal this line';
 const styleLabel=$('#learningStyleLabel');if(styleLabel)styleLabel.textContent=state.learningStyle==='highlight'?'Highlight difficult words':'Hide difficult words';
}
$$('[data-learning-style]').forEach(button=>button.addEventListener('click',()=>{state.learningStyle=button.dataset.learningStyle==='highlight'?'highlight':'hide';if(state.session)state.session.learning_style=state.learningStyle;updateLearningStyleUI();const cue=state.content?.cues.find(c=>c.id===state.currentCueId);if(cue)renderCue(cue);toast(state.learningStyle==='highlight'?'Difficult words are highlighted.':'Difficult words are hidden until you reveal them.')}));
$$('.support').forEach(button=>button.addEventListener('click',()=>{state.mode=button.dataset.mode;FadeEngine.adjustManualMode(state.session,state.mode);$$('.support').forEach(x=>x.classList.toggle('active',x===button));const cue=state.content?.cues.find(c=>c.id===state.currentCueId);if(cue)renderCue(cue);toast(`Support set to: ${button.textContent}`)}));
$('#revealBtn').addEventListener('click',()=>{const cue=state.content?.cues.find(c=>c.id===state.currentCueId);if(!cue)return;const hidden=FadeEngine.visibleAnnotations(cue,state.session,state.mode).filter(a=>!state.revealed.has(a.id));if(!hidden.length){toast(state.learningStyle==='highlight'?'Difficult phrases are already highlighted in this line.':'There are no hidden phrases in this line.');return}hidden.forEach(a=>revealOne(a.id));toast(state.learningStyle==='highlight'?'Help for this line is now in your review.':'Hidden phrases in this line are now visible.')});
$('#lessBtn').addEventListener('click',()=>{$('.support[data-mode="support"]').click()});$('#toggleTranslation').addEventListener('click',()=>{state.translation=!state.translation;const label=state.content.translation.toUpperCase()||'EN';$('#toggleTranslation').textContent=state.translation?`${label} shown`:`${label} translation`;const cue=state.content.cues.find(c=>c.id===state.currentCueId);if(cue)renderCue(cue)});
$('#cultureBtn').addEventListener('click',()=>{const notes=JSON.parse($('#cultureBtn').dataset.notes||'[]');if(!notes.length){toast('There is no approved culture note for this subtitle.');return}toast(notes.map(n=>`${n.title}: ${n.body}`).join(' '))});
function checkpointQuestions(cp){return cp.question_ids.map(id=>state.content.quizzes.questions.find(q=>q.id===id)).filter(Boolean)}
function openQuiz(cp){if(state.playerReady)state.player.pauseVideo();state.activeCheckpoint=cp;state.quizAnswers={};state.quizSubmitted=false;$('#quizEyebrow').textContent=`CHECKPOINT · ${cp.id}`;$('#quizTitle').textContent='Pause for a quick check';$('#quizIntro').textContent=`${checkpointQuestions(cp).length} questions. Your answers help adjust subtitle support for the next section.`;renderQuizQuestions();$('#quizResult').textContent='';$('#quizModal').classList.add('show')}
$('#startQuiz').addEventListener('click',()=>{const cp=state.content?.quizzes.checkpoints.find(x=>!state.session.completed_checkpoint_ids.includes(x.id)&&!state.session.skipped_checkpoint_ids.includes(x.id));if(cp)openQuiz(cp);else toast('There are no pending checkpoints.')});$('#closeQuiz').addEventListener('click',skipQuiz);$('#skipQuiz').addEventListener('click',skipQuiz);$('#submitQuiz').addEventListener('click',submitQuiz);$('#continueQuiz').addEventListener('click',()=>{const cp=state.activeCheckpoint;if(!cp)return;$('#quizModal').classList.remove('show');state.activeCheckpoint=null;setNextCheckpoint();const cue=state.content.cues.find(c=>c.id===state.currentCueId);if(cue)renderCue(cue);if(state.playerReady)state.player.playVideo()});
function renderQuizQuestions(){const cp=state.activeCheckpoint;if(!cp)return;const questions=checkpointQuestions(cp);$('#quizContent').innerHTML=questions.map((q,i)=>`<div class="quiz-question" data-question="${escapeHtml(q.id)}"><strong>${i+1}. ${escapeHtml(q.prompt)}</strong>${q.options.map((opt,j)=>`<button class="quiz-option ${state.quizAnswers[i]===j?'selected':''}" data-qindex="${i}" data-option="${j}" ${state.quizSubmitted?'disabled':''}>${escapeHtml(opt)}</button>`).join('')}<div class="question-feedback">${state.quizSubmitted?escapeHtml(q.explanation):''}</div></div>`).join('');$$('.quiz-option').forEach(button=>button.addEventListener('click',()=>{if(state.quizSubmitted)return;const i=Number(button.dataset.qindex);state.quizAnswers[i]=Number(button.dataset.option);renderQuizQuestions()}));$('#submitQuiz').hidden=state.quizSubmitted;$('#skipQuiz').hidden=state.quizSubmitted;$('#continueQuiz').hidden=!state.quizSubmitted}
function submitQuiz(){const cp=state.activeCheckpoint;if(!cp)return;const qs=checkpointQuestions(cp);if(qs.some((q,i)=>state.quizAnswers[i]===undefined)){toast('Answer every question or choose Skip.');return}const annotationById=Object.fromEntries(state.content.cues.flatMap(c=>(c.annotations||[]).map(a=>[a.id,a])));const attempt=FadeEngine.applyQuiz(state.session,cp.id,state.quizAnswers,qs,annotationById);state.quizSubmitted=true;renderQuizQuestions();const percent=Math.round(attempt.correct/Math.max(1,attempt.total)*100);$('#quizResult').textContent=`${attempt.correct}/${attempt.total} correct (${percent}%).${attempt.correct===attempt.total?'Try reducing subtitle support.':'Hints for these concepts will stay visible next time.'}`;$('#reportScore').textContent=`${percent}%`;$('#reportReveal').textContent=state.session.reveals.length;$('#reportMode').textContent=state.mode==='support'?'More support':state.mode==='challenge'?'Challenge':'Balanced';renderSessionReview()}
function skipQuiz(){const cp=state.activeCheckpoint;if(!cp)return;state.session.skipped_checkpoint_ids.push(cp.id);state.activeCheckpoint=null;$('#quizModal').classList.remove('show');setNextCheckpoint();toast('Skipped. This will not count as an incorrect answer.');if(state.playerReady)state.player.playVideo()}
renderCue(null);

const demoLanguageOptions=$$('.language-option');
const demoTitle=$('#demoTitle'),demoDescription=$('#demoDescription');
const stackCards=[...document.querySelectorAll('[data-stack-language]')];
function selectDemoLanguage(option){
 demoLanguageOptions.forEach(item=>{const active=item===option;item.classList.toggle('is-active',active);item.setAttribute('aria-pressed',String(active))});
 const selected=option.dataset.language;
 const ordered=[selected,...demoLanguageOptions.map(item=>item.dataset.language).filter(language=>language!==selected)];
 stackCards.forEach(card=>{const rank=ordered.indexOf(card.dataset.stackLanguage);card.classList.toggle('is-front',rank===0);card.classList.toggle('is-middle',rank===1);card.classList.toggle('is-back',rank===2);card.classList.toggle('is-selected',rank===0)});
 demoTitle.innerHTML=option.dataset.title;demoDescription.textContent=option.dataset.description;

}
demoLanguageOptions.forEach(option=>option.addEventListener('click',()=>selectDemoLanguage(option)));
$$('.feedback-option').forEach(button=>button.addEventListener('click',()=>{$$('.feedback-option').forEach(item=>item.classList.toggle('is-selected',item===button));$('#feedbackNote').textContent='Thanks — this feedback helps us test whether the lesson is worth repeating.'}));
function renderSessionReview(){
 const container=$('#reviewItems');if(!container)return;
 if(!state.content||!state.session){container.innerHTML='<p class="review-empty">Revealed phrases and missed questions will appear here for review.</p>';return}
 const vocabulary=state.content.vocabulary.items||[];
 const rows=state.content.cues.flatMap(cue=>(cue.annotations||[]).map(annotation=>{
  const concept=state.session.concepts[annotation.concept_id||annotation.id]||{errors:0,correct:0,reveals:0};
  if(!concept.errors&&!concept.reveals)return null;
  const item=vocabulary.find(entry=>(entry.related_annotation_ids||[]).includes(annotation.id));
  const signals=[];if(concept.reveals)signals.push(`Revealed ${concept.reveals} time(s)`);if(concept.errors)signals.push(`Missed ${concept.errors} time(s)`);
  const label={vocabulary:'Vocabulary',grammar:'Grammar',expression:'Expressions',culture:'Culture',comprehension:'Comprehension'}[annotation.category]||'Phrase';
  return {label,text:annotation.text,translation:item?.translation||'',cue:cue.id,signals:signals.join(' · '),priority:concept.errors*2+concept.reveals};
 })).filter(Boolean).sort((a,b)=>b.priority-a.priority);
 if(!rows.length){container.innerHTML='<p class="review-empty">Nothing to review yet. Reveal a hidden phrase or complete a quick check to get suggestions.</p>';return}
 container.innerHTML=rows.map(row=>`<div class="review-item"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.text)}</strong><small>${row.translation?`${escapeHtml(row.translation)} · `:''}${escapeHtml(row.signals)} · Subtitle cue ${escapeHtml(row.cue)}</small></div>`).join('');
}
