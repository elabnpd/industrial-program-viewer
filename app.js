'use strict';
// CHANGE THIS to your deployed Cloudflare Worker URL.
const API_BASE = 'https://industrial-program-api.elab-npd.workers.dev';
const IS_ADMIN_PORTAL = location.pathname.includes('industrial-program-admin');
let token = null, releases = [];
const $ = id => document.getElementById(id);
function notice(message,bad=false){$('notice').textContent=message;$('notice').className=bad?'error':'ok';}
async function request(path,opts={}){
 const h={...(opts.headers||{})};if(token)h.Authorization=`Bearer ${token}`;
 const r=await fetch(`${API_BASE}${path}`,{...opts,headers:h});
 if(!r.ok){let message=`HTTP ${r.status}`;try{message=(await r.json()).error||message}catch{}throw Error(message)}
 return r.json();
}
function view(connected){$('login').hidden=connected;$('dashboard').hidden=!connected;}
async function download(id,name){
 // Fetch is permitted here because it is YOUR Worker and the Worker returns CORS headers.
 notice(`Downloading ${name}...`);
 try{const r=await fetch(`${API_BASE}/download/${id}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw Error(`Download HTTP ${r.status}`);
 const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);notice(`Download started: ${name}`);
 }catch(e){notice(e.message,true)}
}
function showReleases(){const root=$('releases');root.replaceChildren();const q=$('search')?.value.toLowerCase()||'',filter=$('kindFilter')?.value||'';
 for(const r of releases){const txt=`${r.tag} ${r.name} ${r.comments||''}`;if(!txt.toLowerCase().includes(q)||(filter&&!r.tag.includes(`-${filter}-`)))continue;
 const el=document.createElement('div');el.className='item';const h=document.createElement('h3');h.textContent=r.name||r.tag;el.append(h);
 const p=document.createElement('p');p.textContent=`${r.comments||'No comments'} | ${r.published_at||''}`;el.append(p);
 for(const a of r.assets){const b=document.createElement('button');b.textContent=`Download ${a.name} (${(a.size/1e6).toFixed(1)} MB)`;b.onclick=()=>download(a.id,a.name);el.append(b)}root.append(el)}
 if(!root.children.length)root.textContent='No matching published releases.';
}
async function loadReleases(){try{releases=[];for(let page=1;page<=5;page++){const part=await request(`/releases?page=${page}`);releases.push(...part);if(part.length<100)break;}showReleases();notice(`Loaded ${releases.length} releases`)}catch(e){notice(e.message,true)}}
async function loadUploads(){if(!IS_ADMIN_PORTAL)return;try{const items=await request('/uploads'),root=$('uploads');root.replaceChildren();for(const u of items){const div=document.createElement('div');div.className='item';const p=document.createElement('p');p.textContent=`${u.tag} — ${u.filename} — ${u.status}`;div.append(p);if(u.status!=='published'){const b=document.createElement('button');b.textContent='Publish to GitHub';b.onclick=async()=>{b.disabled=true;notice('Publishing, please wait...');try{await request(`/publish/${u.id}`,{method:'POST'});notice('Published');await loadUploads();await loadReleases()}catch(e){notice(e.message,true);b.disabled=false}};div.append(b)}root.append(div)}}catch(e){notice(e.message,true)}}
$('loginForm').onsubmit=async e=>{e.preventDefault();try{const d=await request('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,password:$('password').value})});if(IS_ADMIN_PORTAL&&d.role!=='admin')throw Error('This account is not an administrator');token=d.token;$('password').value='';view(true);await loadReleases();if(IS_ADMIN_PORTAL)await loadUploads()}catch(e){token=null;view(false);notice(e.message,true)}};
$('logout').onclick=async()=>{try{await request('/logout',{method:'POST'})}catch{}token=null;releases=[];view(false);$('releases').replaceChildren();notice('Signed out')};
$('reloadReleases').onclick=loadReleases;
if($('search'))$('search').oninput=showReleases;
if($('kindFilter'))$('kindFilter').onchange=showReleases;
if(IS_ADMIN_PORTAL){
 $('reloadUploads').onclick=loadUploads;
 $('userForm').onsubmit=async e=>{e.preventDefault();try{await request('/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('newEmail').value,password:$('newPassword').value,role:$('newRole').value})});$('userForm').reset();notice('User created')}catch(e){notice(e.message,true)}};
 $('uploadForm').onsubmit=async e=>{e.preventDefault();const f=$('file').files[0];if(!f||f.size>100_000_000||!f.size)return notice('File must be 1–100 MB',true);
 const b=$('uploadForm').querySelector('button');b.disabled=true;notice('Uploading to Cloudflare R2...');
 try{const d=await request('/upload',{method:'POST',headers:{'X-Filename':f.name,'X-Series':$('series').value,'X-Model':$('model').value,'X-Kind':$('kind').value,'X-Version':$('version').value,'X-Comments':$('comments').value},body:f});notice(`Staged ${d.tag}. Click Publish to GitHub.`);$('uploadForm').reset();await loadUploads()}catch(err){notice(err.message,true)}finally{b.disabled=false}};
}
view(false);
