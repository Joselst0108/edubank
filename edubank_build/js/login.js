async function login(){
 const email=document.getElementById('email').value.trim(); const password=document.getElementById('pass').value; const error=document.getElementById('error'); error.textContent='';
 if(!email||!password){error.textContent='Ingresa tu correo y contraseña.';return;}
 const {error:err}=await window.eduBankSupabase.auth.signInWithPassword({email,password});
 if(err){error.textContent=err.message.includes('Invalid login credentials')?'Correo o contraseña incorrectos.':err.message;return;}
 location.href='dashboard.html';
}
document.getElementById('pass').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
window.eduBankSupabase.auth.getSession().then(({data})=>{if(data.session) location.href='dashboard.html'});
