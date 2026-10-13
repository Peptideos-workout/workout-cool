import { EMBED_SESSION_KEY } from "./embed-mode";

/**
 * Blocking head script. It turns on the tab-scoped embed flag before first paint,
 * applies a light or dark theme before next-themes hydrates, and retargets
 * navigations that would otherwise leave the frame.
 * The embed flag stays in sessionStorage. Only the next-themes `theme` key uses localStorage.
 */
export function embedBootScript(peptideOrigin = "https://peptideos.us"): string {
  const parentOrigin = JSON.stringify(new URL(peptideOrigin).origin);
  return `(function(){
var KEY=${JSON.stringify(EMBED_SESSION_KEY)};
var root=document.documentElement;
var params;
try{params=new URLSearchParams(location.search);}catch(e){params=new URLSearchParams();}
var enable=false;
try{
if(params.get("embed")==="1"){sessionStorage.setItem(KEY,"1");}
enable=sessionStorage.getItem(KEY)==="1";
}catch(e){enable=params.get("embed")==="1";}
if(enable){root.setAttribute("data-wc-embed","1");}
function embedOn(){return root.getAttribute("data-wc-embed")==="1";}
function applyTheme(){
if(!embedOn()){return;}
var requested=params.get("theme");
var theme=requested==="light"||requested==="dark"?requested:"";
try{
if(theme){localStorage.setItem("theme",theme);}
else{
var stored=localStorage.getItem("theme");
if(stored==="light"||stored==="dark"){theme=stored;}
}
}catch(e){}
if(theme!=="light"&&theme!=="dark"){return;}
if(root.classList){
root.classList.remove("light");
root.classList.remove("dark");
root.classList.add(theme);
}
if(root.style){root.style.colorScheme=theme;}
}
applyTheme();
function stripLocale(pathname){
var path=String(pathname||"").split("?")[0].split("#")[0];
if(path.length>1&&path.charAt(path.length-1)==="/"){path=path.slice(0,-1);}
var stripped=path.replace(/^\\/[a-z]{2}(?:-[a-z]{2})?(?=\\/|$)/i,"");
if(!stripped||stripped==="/"){return "/";}
return stripped.charAt(0)==="/"?stripped:"/"+stripped;
}
function hasPrefix(pathname,prefixes){
var path=stripLocale(pathname);
for(var i=0;i<prefixes.length;i++){
if(path===prefixes[i]||path.indexOf(prefixes[i]+"/")===0){return true;}
}
return false;
}
function frameTarget(href){
var raw=String(href||"").trim();
if(!raw||raw.charAt(0)==="#"||/^javascript:/i.test(raw)||/^data:/i.test(raw)){return null;}
var url;
try{url=new URL(raw,location.origin);}catch(e){return "_blank";}
if(hasPrefix(url.pathname,["/auth/signout","/api/workouts/signout"])){return "_top";}
if(url.origin===${parentOrigin}&&hasPrefix(url.pathname,["/login","/signup","/api/workouts/sso","/dashboard"])){return "_top";}
var host=url.hostname.toLowerCase();
var payment=host==="stripe.com"||host.endsWith(".stripe.com");
payment=payment||host==="paypal.com"||host.endsWith(".paypal.com");
payment=payment||host==="lemonsqueezy.com"||host.endsWith(".lemonsqueezy.com");
if(payment){return "_top";}
if(url.origin===location.origin){return null;}
return "_blank";
}
document.addEventListener("click",function(event){
if(!embedOn()||!event.target||!event.target.closest){return;}
var anchor=event.target.closest("a[href]");
if(!anchor){return;}
var href=anchor.getAttribute("href")||"";
var target=frameTarget(href);
if(!target){return;}
anchor.setAttribute("target",target);
if(target==="_blank"){
var rel=anchor.getAttribute("rel")||"";
if(rel.indexOf("noopener")===-1){anchor.setAttribute("rel",(rel+" noopener noreferrer").trim());}
}
},true);
document.addEventListener("submit",function(event){
if(!embedOn()||!event.target||!event.target.getAttribute){return;}
var action=event.target.getAttribute("action")||"";
var target=frameTarget(action);
if(target){event.target.setAttribute("target",target);}
},true);
})();`;
}
