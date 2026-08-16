/* ============ AUTH (davet kodlu kayıt + giriş) ============ */
let authMode='login';
function setAuthMode(m){
  authMode=m;
  document.getElementById('tabLogin').classList.toggle('active',m==='login');
  document.getElementById('tabSignup').classList.toggle('active',m==='signup');
  document.getElementById('nameField').classList.toggle('hidden',m!=='signup');
  document.getElementById('codeField').classList.toggle('hidden',m!=='signup');
  document.getElementById('authBtn').textContent=m==='login'?'Giriş Yap':'Kayıt Ol';
  authMsg('');
}
function authMsg(t,type){const el=document.getElementById('authMsg');el.className='auth-msg'+(t?' '+(type||'err'):'');el.textContent=t||'';}
async function doAuth(){
  const email=document.getElementById('authEmail').value.trim();
  const pass=document.getElementById('authPass').value;
  if(!email||!pass){authMsg('E-posta ve şifre gerekli.');return;}
  const btn=document.getElementById('authBtn');btn.disabled=true;
  try{
    if(authMode==='signup'){
      const name=document.getElementById('authName').value.trim();
      const code=document.getElementById('authCode').value.trim();
      if(!name){authMsg('Görünen ad gerekli.');return;}
      const { error }=await sb.auth.signUp({email,password:pass,options:{data:{display_name:name,invite_code:code}}});
      if(error) throw error;
      authMsg('Kayıt alındı. Şimdi giriş yapabilirsin.','ok');
      setTimeout(()=>setAuthMode('login'),2000);
    } else {
      const { error }=await sb.auth.signInWithPassword({email,password:pass});
      if(error) throw error;
      await afterLogin();
    }
  }catch(e){ authMsg(e.message||'Hata.'); }
  finally{ btn.disabled=false; }
}
async function signOut(){ await sb.auth.signOut(); location.reload(); }

async function afterLogin(){
  const { data:{ user } }=await sb.auth.getUser();
  if(!user){ showAuth(); return; }
  const { data,error }=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
  if(error||!data){ authMsg('Profil okunamadı.'); showAuth(); return; }
  me=data;
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderMeCard();
  buildTabs(); applyRoleUI(); switchTab(currentTab);
  await loadPricing(); await loadAll(); subscribeRealtime();
  onMoneyChange();
}
function showAuth(){ document.getElementById('app').classList.add('hidden'); document.getElementById('authScreen').classList.remove('hidden'); }
